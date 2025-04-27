/**
 * @fileoverview API Route handler for initiating Let's Encrypt certificate generation
 * using the acme-client library. Handles both DNS-01 and HTTP-01 challenges.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01, challengeCreateHttp01, challengeRemoveHttp01 } from '@/lib/acme-client';
import { storeCertificate } from '@/lib/acme-storage'; // To store the final cert/key
import type { DnsConfig, Certificate } from '@/services/cert-magic'; // Use types from service

interface GenerateRequestBody {
    domain: string;
    challengeType: 'dns-01' | 'http-01';
    dnsConfig?: DnsConfig; // Required only for dns-01
}

// Function to add a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    try {
        const body: GenerateRequestBody = await request.json();
        const { domain, challengeType, dnsConfig } = body;

        console.log(`API: Received generation request for ${domain} using ${challengeType}`);

        if (!domain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
            return NextResponse.json({ error: 'Invalid domain name format.' }, { status: 400 });
        }
        if (!challengeType || !['dns-01', 'http-01'].includes(challengeType)) {
            return NextResponse.json({ error: 'Invalid challengeType.' }, { status: 400 });
        }

        if (challengeType === 'dns-01' && (!dnsConfig || !dnsConfig.provider || !dnsConfig.apiKey)) {
            return NextResponse.json({ error: 'Missing dnsConfig (provider and apiKey) for DNS-01 challenge.' }, { status: 400 });
        }

        // --- ACME Logic using acme-client ---
        const client = await getAcmeClient();

        /* Create CSR */
        console.log(`Generating CSR for domain: ${domain}`);
        const [key, csr] = await acme.crypto.createCsr({
            commonName: domain,
            // altNames: [domain], // Optional: Add SANs if needed
        });
        const privateKeyPem = key.toString(); // Private key for the *certificate* (store securely!)

        console.log('CSR generated.');

        /* Create certificate order */
        console.log('Creating certificate order...');
        const order = await client.createOrder({
            identifiers: [{ type: 'dns', value: domain }],
        });
        console.log(`Order created: ${order.url}`);

        /* Get authorizations */
        const authorizations = await client.getAuthorizations(order);
        if (!authorizations || authorizations.length === 0) {
             throw new Error('No authorizations found for the order.');
        }
        const authorization = authorizations[0]; // Assuming single domain order
        console.log(`Got authorization for ${authorization.identifier.value}`);

        /* Select challenge */
        const challenge = authorization.challenges.find(
            (chall) => chall.type === challengeType
        );

        if (!challenge) {
            throw new Error(`Could not find challenge type ${challengeType} for domain ${domain}`);
        }
        console.log(`Selected challenge: ${challenge.type}, Status: ${challenge.status}, URL: ${challenge.url}`);

        /* Prepare challenge */
        let challengeRemovalFn: () => Promise<void> | undefined;
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

        if (challenge.status !== 'pending') {
             console.log(`Challenge status is already ${challenge.status}, skipping creation.`);
        } else {
            if (challengeType === 'dns-01') {
                if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01."); // Should be caught earlier
                console.log('Using DNS-01 challenge handlers.');
                const boundDnsConfig = dnsConfig; // Closure capture
                await challengeCreateDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                challengeRemovalFn = () => challengeRemoveDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                console.log('DNS-01 challenge created. Waiting for propagation...');
                await delay(30000); // Wait 30 seconds for DNS propagation (adjust if needed)
                console.log('DNS propagation wait finished.');
            } else { // http-01
                console.log('Using HTTP-01 challenge handlers.');
                await challengeCreateHttp01({ identifier: authorization.identifier, challenge, keyAuthorization });
                challengeRemovalFn = () => challengeRemoveHttp01({ identifier: authorization.identifier, challenge, keyAuthorization });
                console.log('HTTP-01 challenge created. Waiting for server...');
                await delay(5000); // Wait 5 seconds for server/storage to be ready
                console.log('HTTP server wait finished.');
            }

            /* Notify ACME server and wait for validation */
            console.log('Notifying ACME server to validate challenge...');
            await client.completeChallenge(challenge);
            console.log('Waiting for ACME server validation...');
            await client.waitForValidStatus(challenge);
            console.log('Challenge validation successful.');
        }


        /* Cleanup challenge */
        if (challengeRemovalFn) {
            try {
                console.log('Cleaning up challenge...');
                await challengeRemovalFn();
                console.log('Challenge cleanup successful.');
            } catch (cleanupError) {
                console.warn('Challenge cleanup failed:', cleanupError);
                // Log but don't fail the whole process
            }
        }


        /* Finalize order */
        console.log('Challenge completed, finalizing order...');
        const finalizedOrder = await client.finalizeOrder(order, csr);
        console.log('Order finalized.');


        /* Get certificate */
        console.log('Downloading certificate...');
        const certificatePem = await client.getCertificate(finalizedOrder);
        console.log('Certificate downloaded successfully.');

        // --- Store the certificate and key ---
        // WARNING: Storing private key via acme-storage is insecure for production.
        await storeCertificate(domain, certificatePem, privateKeyPem);


        // --- Prepare response ---
        const expiryDate = acme.crypto.readCertificateInfo(certificatePem).notAfter;

        const generatedCertificate: Certificate = {
            domain: domain,
            certificatePem: certificatePem,
            privateKeyPem: privateKeyPem, // SECURITY WARNING: Sending key to client is insecure!
            challengeType: challengeType,
            expiresAt: expiryDate,
            message: `Certificate generated successfully for ${domain} via ${challengeType}. Check server storage.`,
            // dnsConfig is not returned for security, stored backend-side if needed for renewal
        };

        console.log(`API: Successfully generated certificate for ${domain} using ${challengeType}. Expires: ${expiryDate}`);
        return NextResponse.json(generatedCertificate, { status: 200 });

    } catch (error: any) {
        console.error('API Error in /api/generate-certificate:', error);
        // Attempt to provide a more specific error message
        let errorMessage = 'Failed to generate certificate.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
         // Check for common ACME errors
        if (error.response && error.response.data && error.response.data.detail) {
            errorMessage = `ACME Server Error: ${error.response.data.detail}`;
        } else if (error.message && (error.message.includes('Verify error') || error.message.includes('challenge status was not valid'))) {
            errorMessage = `ACME challenge verification failed. Check DNS records or HTTP server setup. Details: ${error.message}`;
        }

        console.error('Detailed Error:', JSON.stringify(error, null, 2));

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
