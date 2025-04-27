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
import { getAcmeClient, challengeCreateDns01, challengeRemoveDns01, challengeCreateHttp01, challengeRemoveHttp01, challengeValidate } from '@/lib/acme-client';
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
        console.warn(`Renewal for ${domain}: Backend needs to retrieve stored config (challenge type, DNS keys if DNS-01). Simulating DNS-01 for now if not 'http-fail'.`);
        // For simulation, let's *assume* we know the type and have creds if DNS-01
        // This is a MAJOR simplification.
        let challengeType: 'dns-01' | 'http-01' = 'dns-01'; // Default assumption
        let dnsConfig: DnsConfig | undefined = undefined; // Assume creds are available backend-side

        // Example: Fetch from a hypothetical DB/store
        // const storedConfig = await getStoredDomainConfig(domain);
        // if (!storedConfig) {
        //     return NextResponse.json({ error: `No configuration found for domain ${domain} to renew.` }, { status: 404 });
        // }
        // challengeType = storedConfig.challengeType;
        // if (challengeType === 'dns-01') {
        //     dnsConfig = await decryptAndRetrieveDnsCredentials(storedConfig.dnsProvider, storedConfig.credentialsRef);
        //     if (!dnsConfig) {
        //         return NextResponse.json({ error: `Could not retrieve DNS credentials for ${domain}.` }, { status: 500 });
        //     }
        // }

         // --- Simulate based on domain name for testing ---
         if (domain.includes("http-domain")) {
             challengeType = 'http-01';
             dnsConfig = undefined;
             console.log(`Simulating renewal with HTTP-01 for ${domain}`);
         } else {
             // Assume DNS-01 and *simulate* having credentials
             challengeType = 'dns-01';
             dnsConfig = { provider: 'cloudflare', apiKey: 'SIMULATED_DUMMY_API_KEY_FOR_RENEWAL' }; // !! REPLACE with actual retrieved/decrypted key
             console.log(`Simulating renewal with DNS-01 for ${domain} using ${dnsConfig.provider}`);
             if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
                 console.warn("Using SIMULATED API key for renewal. Replace with real key retrieval.");
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

        /* Challenge handlers */
        let challengeCreateFn: acme.ChallengeCreateFn;
        let challengeRemoveFn: acme.ChallengeRemoveFn;

        if (challengeType === 'dns-01') {
             if (!dnsConfig) throw new Error("Internal error: dnsConfig missing for DNS-01 renewal."); // Should be caught earlier
             const boundDnsConfig = dnsConfig; // Closure capture
             challengeCreateFn = (opts) => challengeCreateDns01({ ...opts, dnsConfig: boundDnsConfig });
             challengeRemoveFn = (opts) => challengeRemoveDns01({ ...opts, dnsConfig: boundDnsConfig });
        } else {
            challengeCreateFn = challengeCreateHttp01;
            challengeRemoveFn = challengeRemoveHttp01;
        }

        /* Satisfy challenge */
        console.log('Attempting to satisfy challenge for renewal...');
        await client.challenge({
            challenge: challenge,
            challengeCreateFn: challengeCreateFn,
            challengeValidateFn: challengeValidate,
            challengeRemoveFn: challengeRemoveFn,
        });

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
        } else if (error.message && error.message.includes('Verify error')) {
            errorMessage = `ACME challenge verification failed during renewal. Details: ${error.message}`;
        }

        console.error('Detailed Renewal Error:', JSON.stringify(error, null, 2));
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
