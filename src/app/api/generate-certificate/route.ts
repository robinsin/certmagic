
/**
 * @fileoverview API Route handler for initiating Let's Encrypt certificate generation.
 * Handles DNS-01 automatically. For HTTP-01, it initiates the order and returns
 * challenge details to the frontend for manual setup, requiring separate API calls
 * for verification and finalization.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01 } from '@/lib/acme-client'; // Removed HTTP challenge helpers
import { storeCertificate, storePendingOrder, removePendingOrder } from '@/lib/acme-storage'; // To store cert/key and pending state
import type { DnsConfig, Certificate, HttpChallengePending } from '@/services/cert-magic'; // Use types from service

interface GenerateRequestBody {
    domain: string;
    challengeType: 'dns-01' | 'http-01';
    dnsConfig?: DnsConfig; // Required only for dns-01
}

// Function to add a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    let orderUrl: string | undefined; // Keep track of order URL for potential cleanup on error
    let challengeToken: string | undefined; // Keep track for potential cleanup logging
    let challengeType: 'dns-01' | 'http-01' | undefined; // Keep track for error handling logic

    try {
        const body: GenerateRequestBody = await request.json();
        const { domain, challengeType: requestedChallengeType, dnsConfig } = body;
        challengeType = requestedChallengeType; // Assign to outer scope var

        console.log(`API: Received generation request for ${domain} using ${challengeType}`);

        // --- Input Validation ---
        if (!domain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
            return NextResponse.json({ error: 'Invalid domain name format.' }, { status: 400 });
        }
        if (!challengeType || !['dns-01', 'http-01'].includes(challengeType)) {
            return NextResponse.json({ error: 'Invalid challengeType.' }, { status: 400 });
        }
        if (challengeType === 'dns-01' && (!dnsConfig || !dnsConfig.provider || !dnsConfig.apiKey)) {
            return NextResponse.json({ error: 'Missing dnsConfig (provider and apiKey) for DNS-01 challenge.' }, { status: 400 });
        }

        // --- ACME Logic ---
        const client = await getAcmeClient();

        /* Create CSR (needed regardless of challenge type) */
        console.log(`Generating CSR for domain: ${domain}`);
        const [key, csr] = await acme.crypto.createCsr({ commonName: domain });
        const privateKeyPem = key.toString(); // Store this securely later!
        const csrPem = csr.toString(); // Store CSR PEM for finalization

        /* Create certificate order */
        console.log('Creating certificate order...');
        const order = await client.createOrder({ identifiers: [{ type: 'dns', value: domain }] });
        orderUrl = order.url; // Store for potential error cleanup
        console.log(`Order created: ${orderUrl}`);

        /* Get authorizations */
        const authorizations = await client.getAuthorizations(order);
        if (!authorizations || authorizations.length === 0) {
            throw new Error('No authorizations found for the order.');
        }
        const authorization = authorizations[0];
        console.log(`Got authorization for ${authorization.identifier.value}`);

        /* Select challenge */
        const challenge = authorization.challenges.find((chall) => chall.type === challengeType);
        if (!challenge) {
            throw new Error(`Could not find challenge type ${challengeType} for domain ${domain}`);
        }
        console.log(`Selected challenge: ${challenge.type}, Status: ${challenge.status}, URL: ${challenge.url}`);
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        challengeToken = challenge.token; // Store for potential cleanup logging

        // --- Challenge Handling Diverges ---

        if (challengeType === 'dns-01') {
            // --- Automated DNS-01 Flow ---
            if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01.");
            console.log('Handling DNS-01 challenge automatically.');

            let challengeRemovalFn: (() => Promise<void>) | undefined;

            if (challenge.status !== 'pending') {
                console.log(`Challenge status is already ${challenge.status}, skipping creation.`);
            } else {
                console.log('Calling challengeCreateDns01...');
                const boundDnsConfig = dnsConfig; // Ensure config is correctly scoped for removal
                await challengeCreateDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                challengeRemovalFn = () => challengeRemoveDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                console.log('DNS-01 challenge created. Waiting for propagation...');
                await delay(30000); // Wait for DNS propagation
                console.log('DNS propagation wait finished.');

                console.log('Notifying ACME server to validate DNS challenge...');
                await client.completeChallenge(challenge);
                console.log('Waiting for ACME server validation...');
                await client.waitForValidStatus(challenge);
                console.log('DNS Challenge validation successful.');
            }

            /* Cleanup challenge */
            if (challengeRemovalFn) {
                try {
                    console.log('Cleaning up DNS challenge...');
                    await challengeRemovalFn();
                    console.log('DNS Challenge cleanup successful.');
                } catch (cleanupError) {
                    console.warn('DNS Challenge cleanup failed:', cleanupError);
                }
            }

            /* Finalize order */
            console.log('DNS challenge completed, finalizing order...');
            const finalizedOrder = await client.finalizeOrder(order, csr);
            console.log('Order finalized.');

            /* Get certificate */
            console.log('Downloading certificate...');
            const certificatePem = await client.getCertificate(finalizedOrder);
            console.log('Certificate downloaded successfully.');

            // Store with DNS config for renewal reference
            await storeCertificate(domain, certificatePem, privateKeyPem, { challengeType: 'dns-01', domain, dnsConfig });
            const expiryDate = acme.crypto.readCertificateInfo(certificatePem).notAfter;

            const generatedCertificate: Certificate = {
                status: 'issued',
                domain: domain,
                certificatePem: certificatePem,
                privateKeyPem: privateKeyPem, // Still insecure!
                challengeType: challengeType,
                expiresAt: expiryDate,
                message: `Certificate generated successfully for ${domain} via automated DNS-01.`,
            };

            console.log(`API: Successfully generated certificate for ${domain} via DNS-01. Expires: ${expiryDate}`);
            return NextResponse.json(generatedCertificate, { status: 200 });

        } else {
            // --- Manual HTTP-01 Flow ---
            console.log('Handling HTTP-01 challenge manually. Returning details to frontend.');

            // Store challenge details temporarily (needed for verification/finalization)
            // We also store the generated private key and CSR associated with this pending order.
             await storePendingOrder(order.url, {
                 domain: domain,
                 challengeType: 'http-01',
                 challengeUrl: challenge.url,
                 token: challenge.token,
                 keyAuthorization: keyAuthorization,
                 privateKeyPem: privateKeyPem, // Store key with pending order
                 csrPem: csrPem, // Store CSR too, needed for finalization
             });


            const pendingResponse: HttpChallengePending = {
                status: 'http-01-pending',
                domain: domain,
                token: challenge.token,
                keyAuthorization: keyAuthorization,
                challengeUrl: challenge.url,
                orderUrl: order.url,
                message: `HTTP-01 challenge initiated. Please create the file '/.well-known/acme-challenge/${challenge.token}' on your server for http://${domain} with the provided content, then click 'Verify'.`,
            };

            // DO NOT complete challenge or finalize order here. Wait for frontend interaction.
            console.log(`API: Returning HTTP-01 pending details for ${domain}.`);
            return NextResponse.json(pendingResponse, { status: 200 });
        }

    } catch (error: any) {
        console.error('API Error in /api/generate-certificate:', error);

        // Attempt cleanup for HTTP-01 if order was created but failed before returning pending state
        if (challengeType === 'http-01' && orderUrl) {
             console.warn(`Attempting to clean up pending order ${orderUrl} due to error.`);
             await removePendingOrder(orderUrl); // Remove stored pending state
             // No specific challenge removal needed here as it wasn't created via API on user's server
        }
        // DNS cleanup is handled within its block

        let errorMessage = 'Failed to generate certificate.';
        if (error instanceof Error) errorMessage = error.message;
        else if (typeof error === 'string') errorMessage = error;

        if (error.response?.data?.detail) {
            errorMessage = `ACME Server Error: ${error.response.data.detail}`;
        } else if (error.message?.includes('Verify error') || error.message?.includes('challenge status was not valid')) {
            errorMessage = `ACME challenge verification failed. Check DNS setup. Details: ${error.message}`;
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
             errorMessage = `Network error connecting to ACME server or DNS provider: ${error.message}`;
        }


        console.error('Detailed Error:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
    
