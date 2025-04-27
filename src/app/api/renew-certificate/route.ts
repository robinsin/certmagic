
/**
 * @fileoverview API Route handler for initiating Let's Encrypt certificate renewal.
 * Re-uses generation logic. If the determined challenge type is HTTP-01,
 * it returns pending challenge details for manual frontend handling.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01 } from '@/lib/acme-client'; // Removed HTTP helpers
import { storeCertificate, retrieveCertificateConfig, storePendingOrder, removePendingOrder } from '@/lib/acme-storage'; // Need to retrieve config and manage pending state
import type { DnsConfig, Certificate, HttpChallengePending } from '@/services/cert-magic';

interface RenewRequestBody {
    domain: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    let orderUrl: string | undefined;
    let challengeToken: string | undefined;
    let detectedChallengeType: 'dns-01' | 'http-01' | undefined; // Keep track for cleanup

    try {
        const body: RenewRequestBody = await request.json();
        const { domain } = body;

        console.log(`API: Received renewal request for ${domain}`);
        if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 });

        // --- Retrieve Stored Configuration ---
        const storedConfig = await retrieveCertificateConfig(domain);
        if (!storedConfig) {
             return NextResponse.json({ error: `Cannot renew ${domain}: Configuration not found.` }, { status: 404 });
        }

        const challengeType = storedConfig.challengeType;
        detectedChallengeType = challengeType; // For cleanup
        const dnsConfig = storedConfig.dnsConfig; // Will be undefined if original was HTTP-01
        console.log(`Retrieved config for ${domain}. Using challenge type: ${challengeType}`);
        if (challengeType === 'dns-01' && (!dnsConfig || !dnsConfig.apiKey)) {
             console.error(`DNS-01 config retrieved for ${domain} but API key is missing.`);
             // Attempt to use environment variable as fallback? Or fail?
             // This depends on how API keys are managed. Let's assume failure for now.
             return NextResponse.json({ error: `Cannot renew ${domain} via DNS-01: Stored configuration is missing the API key.` }, { status: 500 });
        }


        // --- Re-use Generation Logic (adapted for potential manual HTTP-01) ---
        const client = await getAcmeClient();

        /* Create NEW CSR */
        console.log(`Generating NEW CSR for renewal: ${domain}`);
        const [newKey, csr] = await acme.crypto.createCsr({ commonName: domain });
        const newPrivateKeyPem = newKey.toString();
        const newCsrPem = csr.toString(); // Store new CSR

        /* Create order */
        console.log('Creating certificate order for renewal...');
        const order = await client.createOrder({ identifiers: [{ type: 'dns', value: domain }] });
        orderUrl = order.url;
        console.log(`Renewal order created: ${orderUrl}`);


        /* Authorizations and Challenge */
        const authorizations = await client.getAuthorizations(order);
        if (!authorizations || authorizations.length === 0) throw new Error('No authorizations found.');
        const authorization = authorizations[0];
        const challenge = authorization.challenges.find((chall) => chall.type === challengeType);
        if (!challenge) throw new Error(`Could not find challenge type ${challengeType}`);
        console.log(`Selected renewal challenge: ${challenge.type}, Status: ${challenge.status}, URL: ${challenge.url}`);
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        challengeToken = challenge.token;


        // --- Diverge based on Challenge Type ---
        if (challengeType === 'dns-01') {
            // --- Automated DNS-01 Renewal ---
            if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01 renewal.");
            console.log('Handling DNS-01 renewal automatically.');

            let challengeRemovalFn: (() => Promise<void>) | undefined;

            if (challenge.status !== 'pending') {
                console.log(`Renewal challenge status is already ${challenge.status}, skipping creation.`);
            } else {
                 const boundDnsConfig = dnsConfig;
                await challengeCreateDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                challengeRemovalFn = () => challengeRemoveDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                console.log('DNS-01 challenge created for renewal. Waiting...');
                await delay(30000); // Wait 30 seconds
                console.log('DNS propagation wait finished.');

                console.log('Notifying ACME server for DNS renewal validation...');
                await client.completeChallenge(challenge);
                console.log('Waiting for ACME server validation...');
                await client.waitForValidStatus(challenge);
                console.log('Renewal DNS challenge validation successful.');
            }

            if (challengeRemovalFn) {
                 try {
                     console.log('Cleaning up renewal DNS challenge...');
                     await challengeRemovalFn();
                     console.log('Renewal DNS challenge cleanup successful.');
                 } catch (cleanupError) {
                     console.warn('Renewal DNS challenge cleanup failed:', cleanupError);
                 }
            }

            /* Finalize order */
            console.log('Finalizing renewal order...');
            const finalizedOrder = await client.finalizeOrder(order, csr);

            /* Get NEW certificate */
            console.log('Downloading renewed certificate...');
            const renewedCertificatePem = await client.getCertificate(finalizedOrder);
            console.log('Renewed certificate downloaded.');

            /* Store the RENEWED certificate and NEW key */
            // Store with updated config (which is the same DNS config)
            await storeCertificate(domain, renewedCertificatePem, newPrivateKeyPem, { challengeType: 'dns-01', domain, dnsConfig: dnsConfig });

            const expiryDate = acme.crypto.readCertificateInfo(renewedCertificatePem).notAfter;
            const renewedCertificateResult: Certificate = {
                status: 'issued',
                domain: domain,
                certificatePem: renewedCertificatePem,
                privateKeyPem: newPrivateKeyPem, // Still insecure!
                challengeType: challengeType,
                expiresAt: expiryDate,
                message: `Certificate for ${domain} renewed successfully via automated DNS-01. Expires: ${expiryDate.toLocaleDateString()}.`,
            };
            console.log(`API: Successfully renewed certificate for ${domain} via DNS-01.`);
            return NextResponse.json(renewedCertificateResult, { status: 200 });

        } else {
            // --- Manual HTTP-01 Renewal ---
            console.log('Handling HTTP-01 renewal manually. Returning details to frontend.');

            // Store pending state for renewal
            await storePendingOrder(order.url, {
                domain: domain,
                challengeType: 'http-01',
                challengeUrl: challenge.url,
                token: challenge.token,
                keyAuthorization: keyAuthorization,
                privateKeyPem: newPrivateKeyPem, // Store the NEW key
                csrPem: newCsrPem, // Store the NEW CSR
            });

             const pendingResponse: HttpChallengePending = {
                status: 'http-01-pending',
                domain: domain,
                token: challenge.token,
                keyAuthorization: keyAuthorization,
                challengeUrl: challenge.url,
                orderUrl: order.url,
                message: `HTTP-01 challenge required for renewal. Please ensure the file '/.well-known/acme-challenge/${challenge.token}' is accessible on http://${domain} with the provided content, then click 'Verify'.`,
            };

            console.log(`API: Returning HTTP-01 pending details for renewal of ${domain}.`);
            return NextResponse.json(pendingResponse, { status: 200 });
        }

    } catch (error: any) {
        console.error('API Error in /api/renew-certificate:', error);

        // Attempt cleanup for HTTP-01 if order was created but failed before returning pending state
        if (detectedChallengeType === 'http-01' && orderUrl) {
             console.warn(`Attempting to clean up pending renewal order ${orderUrl} due to error.`);
             await removePendingOrder(orderUrl);
        }
        // DNS cleanup handled within its block

        let errorMessage = 'Failed to renew certificate.';
        if (error instanceof Error) errorMessage = error.message;
        else if (typeof error === 'string') errorMessage = error;

        if (error.response?.data?.detail) {
            errorMessage = `ACME Server Error during renewal: ${error.response.data.detail}`;
        } else if (error.message?.includes('Verify error') || error.message?.includes('challenge status was not valid')) {
            errorMessage = `ACME challenge verification failed during renewal. Details: ${error.message}`;
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
             errorMessage = `Network error connecting to ACME server or DNS provider during renewal: ${error.message}`;
        }


        console.error('Detailed Renewal Error:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
    
