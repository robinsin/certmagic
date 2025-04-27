/**
 * @fileoverview API Route handler for initiating Let's Encrypt certificate generation
 * using the acme-client library. Handles both DNS-01 and HTTP-01 challenges.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01, challengeCreateHttp01, challengeRemoveHttp01, challengeValidate } from '@/lib/acme-client';
import { storeCertificate } from '@/lib/acme-storage'; // To store the final cert/key
import type { DnsConfig, Certificate } from '@/services/cert-magic'; // Use types from service

interface GenerateRequestBody {
    domain: string;
    challengeType: 'dns-01' | 'http-01';
    dnsConfig?: DnsConfig; // Required only for dns-01
}

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


        /* Challenge handlers based on type */
        let challengeCreateFn: acme.ChallengeCreateFn;
        let challengeRemoveFn: acme.ChallengeRemoveFn;

        if (challengeType === 'dns-01') {
            if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01."); // Should be caught earlier
             const boundDnsConfig = dnsConfig; // Closure capture
             challengeCreateFn = (opts) => challengeCreateDns01({ ...opts, dnsConfig: boundDnsConfig });
             challengeRemoveFn = (opts) => challengeRemoveDns01({ ...opts, dnsConfig: boundDnsConfig });
            console.log('Using DNS-01 challenge handlers.');
        } else { // http-01
            challengeCreateFn = challengeCreateHttp01;
            challengeRemoveFn = challengeRemoveHttp01;
            console.log('Using HTTP-01 challenge handlers.');
        }


        /* Satisfy challenge */
        console.log('Attempting to satisfy challenge...');
        await client.challenge({
            challenge: challenge,
            challengeCreateFn: challengeCreateFn,
            challengeValidateFn: challengeValidate, // Use default validator (waits slightly)
            challengeRemoveFn: challengeRemoveFn, // Cleanup after validation
        });


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
        } else if (error.message && error.message.includes('Verify error')) {
            errorMessage = `ACME challenge verification failed. Check DNS records or HTTP server setup. Details: ${error.message}`;
        }

        console.error('Detailed Error:', JSON.stringify(error, null, 2));

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
