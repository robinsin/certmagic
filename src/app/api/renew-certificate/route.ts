/**
 * @fileoverview API Route handler for initiating Let's Encrypt certificate renewal.
 * NOTE: The ACME protocol does not have a specific "renew" action. Renewal is
 * essentially requesting a *new* certificate for the same domain(s) before the
 * old one expires. This route will re-use the generation logic.
 * It might need enhancement to fetch stored configuration (like original challenge type
 * and DNS keys if applicable) instead of requiring them in the request.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import acme from 'acme-client';
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01, challengeCreateHttp01, challengeRemoveHttp01 } from '@/lib/acme-client';
import { storeCertificate, retrieveCertificate } from '@/lib/acme-storage'; // Need to potentially retrieve old config/key
import type { DnsConfig, Certificate } from '@/services/cert-magic';

// For renewal, we ideally only need the domain. The backend *should*
// retrieve the necessary configuration (original challenge type, DNS keys if DNS-01)
// from its secure storage based on the domain.
// However, for simplicity in this example, we might require the original challenge type
// and potentially DNS config again if it wasn't stored securely.
interface RenewRequestBody {
    domain: string;
    // Ideally, backend looks these up:
    // originalChallengeType?: 'dns-01' | 'http-01';
    // dnsConfig?: DnsConfig; // Only if original was DNS-01 and creds weren't stored
}

// Function to add a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    try {
        const body: RenewRequestBody = await request.json();
        const { domain } = body; // Add challengeType, dnsConfig if needed based on backend storage strategy

        console.log(`API: Received renewal request for ${domain}`);

        if (!domain) {
            return NextResponse.json({ error: 'Missing domain' }, { status: 400 });
        }

        // --- PLACEHOLDER: Retrieve Stored Configuration ---
        // In a real app, you would fetch the config associated with this domain.
        // This includes the original challenge type and potentially encrypted DNS creds.
        console.warn(`Renewal for ${domain}: Backend needs to retrieve stored config (challenge type, DNS keys if DNS-01). Simulating based on domain name for now.`);
        // For simulation, let's *assume* we know the type and have creds if DNS-01
        // This is a MAJOR simplification.
        let challengeType: 'dns-01' | 'http-01';
        let dnsConfig: DnsConfig | undefined = undefined; // Assume creds are available backend-side

         // --- Simulate based on domain name for testing ---
         if (domain.includes("http-domain")) {
             challengeType = 'http-01';
             dnsConfig = undefined;
             console.log(`Simulating renewal with HTTP-01 for ${domain}`);
         } else {
             // Assume DNS-01 and *simulate* having credentials
             challengeType = 'dns-01';
             // !! REPLACE with actual retrieved/decrypted key mechanism
             // Example: Retrieve securely stored key based on domain/provider
             const simulatedApiKey = process.env.SIMULATED_CLOUDFLARE_API_KEY || 'SIMULATED_DUMMY_API_KEY_FOR_RENEWAL';
             dnsConfig = { provider: 'cloudflare', apiKey: simulatedApiKey };
             console.log(`Simulating renewal with DNS-01 for ${domain} using ${dnsConfig.provider}`);
             if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
                 console.warn("Using SIMULATED or ENV API key for renewal. Replace with real key retrieval.");
             }
         }
         // --- End Simulation ---


        // --- Re-use Generation Logic ---
        // Renewal is just generating a new certificate.
        console.log(`Proceeding with ${challengeType} challenge for renewal.`);

        const client = await getAcmeClient();

        /* Create NEW CSR for renewal - reusing old key is possible but less secure */
        console.log(`Generating NEW CSR for renewal: ${domain}`);
        const [newKey, csr] = await acme.crypto.createCsr({
            commonName: domain,
        });
        const newPrivateKeyPem = newKey.toString(); // Use a new private key for the renewed cert

        /* Create order */
        console.log('Creating certificate order for renewal...');
        const order = await client.createOrder({
            identifiers: [{ type: 'dns', value: domain }],
        });

        /* Authorizations and Challenge */
        const authorizations = await client.getAuthorizations(order);
        if (!authorizations || authorizations.length === 0) throw new Error('No authorizations found.');
        const authorization = authorizations[0];

        const challenge = authorization.challenges.find((chall) => chall.type === challengeType);
        if (!challenge) throw new Error(`Could not find challenge type ${challengeType}`);

        /* Prepare and complete challenge */
        let challengeRemovalFn: () => Promise<void> | undefined;
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

        if (challenge.status !== 'pending') {
             console.log(`Challenge status is already ${challenge.status}, skipping creation.`);
        } else {
            if (challengeType === 'dns-01') {
                if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01 renewal."); // Should be caught earlier
                console.log('Using DNS-01 challenge handlers for renewal.');
                const boundDnsConfig = dnsConfig; // Closure capture
                await challengeCreateDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                challengeRemovalFn = () => challengeRemoveDns01({ identifier: authorization.identifier, challenge, keyAuthorization, dnsConfig: boundDnsConfig });
                console.log('DNS-01 challenge created for renewal. Waiting for propagation...');
                await delay(30000); // Wait 30 seconds (adjust if needed)
                console.log('DNS propagation wait finished.');
            } else { // http-01
                console.log('Using HTTP-01 challenge handlers for renewal.');
                await challengeCreateHttp01({ identifier: authorization.identifier, challenge, keyAuthorization });
                challengeRemovalFn = () => challengeRemoveHttp01({ identifier: authorization.identifier, challenge, keyAuthorization });
                console.log('HTTP-01 challenge created for renewal. Waiting for server...');
                await delay(5000); // Wait 5 seconds
                console.log('HTTP server wait finished.');
            }

            /* Notify ACME server and wait for validation */
            console.log('Notifying ACME server to validate challenge for renewal...');
            await client.completeChallenge(challenge);
            console.log('Waiting for ACME server validation for renewal...');
            await client.waitForValidStatus(challenge);
            console.log('Renewal challenge validation successful.');
        }

        /* Cleanup challenge */
        if (challengeRemovalFn) {
            try {
                console.log('Cleaning up renewal challenge...');
                await challengeRemovalFn();
                console.log('Renewal challenge cleanup successful.');
            } catch (cleanupError) {
                console.warn('Renewal challenge cleanup failed:', cleanupError);
            }
        }


        /* Finalize order */
        console.log('Challenge completed, finalizing renewal order...');
        const finalizedOrder = await client.finalizeOrder(order, csr);

        /* Get NEW certificate */
        console.log('Downloading renewed certificate...');
        const renewedCertificatePem = await client.getCertificate(finalizedOrder);
        console.log('Renewed certificate downloaded.');

        // --- Store the RENEWED certificate and NEW key ---
        // Overwrite the old files with the new ones.
        await storeCertificate(domain, renewedCertificatePem, newPrivateKeyPem);

        // --- Prepare response ---
        const expiryDate = acme.crypto.readCertificateInfo(renewedCertificatePem).notAfter;

        const renewedCertificateResult: Certificate = {
            domain: domain,
            certificatePem: renewedCertificatePem,
            privateKeyPem: newPrivateKeyPem, // Send the NEW private key (Still insecure!)
            challengeType: challengeType, // Reflects method used for *this* renewal
            expiresAt: expiryDate,
            message: `Certificate for ${domain} renewed successfully via ${challengeType}. Expires: ${expiryDate.toLocaleDateString()}. Check server storage.`,
        };

        console.log(`API: Successfully renewed certificate for ${domain}.`);
        return NextResponse.json(renewedCertificateResult, { status: 200 });

    } catch (error: any) {
        console.error('API Error in /api/renew-certificate:', error);
        let errorMessage = 'Failed to renew certificate.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
         if (error.response && error.response.data && error.response.data.detail) {
            errorMessage = `ACME Server Error during renewal: ${error.response.data.detail}`;
        } else if (error.message && (error.message.includes('Verify error') || error.message.includes('challenge status was not valid'))) {
            errorMessage = `ACME challenge verification failed during renewal. Details: ${error.message}`;
        }

        console.error('Detailed Renewal Error:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
