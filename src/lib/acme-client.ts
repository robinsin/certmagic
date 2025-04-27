
/**
 * @fileoverview Initializes and exports a configured ACME client instance.
 * Includes helper functions for common ACME operations like DNS challenges.
 */
import acme from 'acme-client';
import { getAccountKey } from './acme-storage'; // Use our storage helper
import type { DnsConfig } from '@/services/cert-magic'; // Import DnsConfig type

// --- Configuration ---
// Use Let's Encrypt staging directory for testing to avoid rate limits
// Switch to acme.directory.letsencrypt.production for real certificates
const LETS_ENCRYPT_DIRECTORY_URL = process.env.NODE_ENV === 'production'
    ? acme.directory.letsencrypt.production
    : acme.directory.letsencrypt.staging;

// Email for Let's Encrypt account (replace with a real email for production)
const ACCOUNT_EMAIL = process.env.LETS_ENCRYPT_EMAIL || 'robinseyi@gmail.com'; // Use env var or a default

let acmeClientInstance: acme.Client | null = null;

/**
 * Initializes and returns a singleton ACME client instance.
 * Loads or generates the account key using acme-storage.
 *
 * @returns {Promise<acme.Client>} The initialized ACME client.
 */
export async function getAcmeClient(): Promise<acme.Client> {
    if (acmeClientInstance) {
        return acmeClientInstance;
    }

    console.log(`Initializing ACME client for directory: ${LETS_ENCRYPT_DIRECTORY_URL}`);
    const accountKey = await getAccountKey(); // Get key from storage

    acmeClientInstance = new acme.Client({
        directoryUrl: LETS_ENCRYPT_DIRECTORY_URL,
        accountKey: accountKey,
        // Optionally provide accountUrl if known, otherwise client discovers/creates it
    });

    try {
        // Try to retrieve account details, creating if necessary
        console.log('Checking/Creating ACME account...');
        await acmeClientInstance.createAccount({
            termsOfServiceAgreed: true,
            contact: [`mailto:${ACCOUNT_EMAIL}`],
        });
        console.log('ACME account ready.');
    } catch (e: any) {
         // If account already exists, ACME server might return a specific error or status.
         // acme-client might handle this gracefully, but good to be aware.
         // Check if the error indicates the account already exists
         const accountExistsError = (e?.code === 'ERR_ACME_ACCOUNT_EXISTS' || // Specific error code from acme-client v5+
                                    (e?.message && e.message.includes('account already exists')) || // Generic message check
                                    (e?.response?.status === 409) // Conflict status often indicates existing resource
                                    );
         if (!accountExistsError) {
            console.error('Failed to create/retrieve ACME account:', e);
            acmeClientInstance = null; // Reset instance on critical failure
            throw new Error(`Failed to initialize ACME account: ${e.message}`);
        }
        console.log('ACME account already exists or initialization successful.');
    }


    return acmeClientInstance;
}

// --- DNS Challenge Handlers ---

/**
 * Placeholder for DNS-01 challenge creation.
 * This needs to be implemented based on the specific DNS provider API.
 *
 * @param {object} opts - Options object.
 * @param {acme.Identifier} opts.identifier - The identifier (domain name).
 * @param {acme.Challenge} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string.
 * @param {DnsConfig} opts.dnsConfig - DNS provider configuration.
 * @returns {Promise<void>}
 */
export async function challengeCreateDns01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
    dnsConfig: DnsConfig; // Use the imported type
}): Promise<void> {
    const domain = opts.identifier.value;
    const recordName = `_acme-challenge.${domain}`;
    const recordValue = opts.keyAuthorization; // Let's Encrypt expects just the key auth for the TXT record value

    console.log(`DNS-01 Create: Domain=${domain}, Provider=${opts.dnsConfig.provider}`);
    console.log(`DNS-01 Create: Need to create TXT record: ${recordName} -> "${recordValue}"`);

    // --- Provider Specific Logic ---
    // This is where you would use the opts.dnsConfig.apiKey
    // with the appropriate DNS provider's API client.
    switch (opts.dnsConfig.provider) {
        case 'cloudflare':
            // Example: Use Cloudflare API client to create TXT record
            console.warn(`DNS-01 Create [${opts.dnsConfig.provider}]: NOT IMPLEMENTED. API key: ${opts.dnsConfig.apiKey ? '***' : 'MISSING'}`);
            // await cloudflareClient.createTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
            break;
        case 'route53':
            // Example: Use AWS SDK Route53 client
            console.warn(`DNS-01 Create [${opts.dnsConfig.provider}]: NOT IMPLEMENTED. API key: ${opts.dnsConfig.apiKey ? '***' : 'MISSING'}`);
            // await awsRoute53Client.createTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
            break;
        case 'godaddy':
             console.warn(`DNS-01 Create [${opts.dnsConfig.provider}]: NOT IMPLEMENTED. API key: ${opts.dnsConfig.apiKey ? '***' : 'MISSING'}`);
             // await goDaddyClient.createTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
             break;
        // Add cases for other supported providers
        default:
            throw new Error(`Unsupported DNS provider: ${opts.dnsConfig.provider}`);
    }

    // DNS propagation wait is now handled in the API route after this function returns.
    console.log(`DNS-01 Create: Record creation initiated/logged for ${recordName}.`);
}

/**
 * Placeholder for DNS-01 challenge removal.
 * This needs to be implemented based on the specific DNS provider API.
 *
 * @param {object} opts - Options object.
 * @param {acme.Identifier} opts.identifier - The identifier (domain name).
 * @param {acme.Challenge} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string (used to find the record).
 * @param {DnsConfig} opts.dnsConfig - DNS provider configuration.
 * @returns {Promise<void>}
 */
export async function challengeRemoveDns01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
    dnsConfig: DnsConfig; // Use the imported type
}): Promise<void> {
    const domain = opts.identifier.value;
    const recordName = `_acme-challenge.${domain}`;
    const recordValue = opts.keyAuthorization; // Use this to identify the specific record if multiple exist

    console.log(`DNS-01 Remove: Domain=${domain}, Provider=${opts.dnsConfig.provider}`);
    console.log(`DNS-01 Remove: Need to remove TXT record: ${recordName} with value "${recordValue}"`);

    // --- Provider Specific Logic ---
    switch (opts.dnsConfig.provider) {
         case 'cloudflare':
            console.warn(`DNS-01 Remove [${opts.dnsConfig.provider}]: NOT IMPLEMENTED.`);
            // await cloudflareClient.deleteTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
            break;
        case 'route53':
             console.warn(`DNS-01 Remove [${opts.dnsConfig.provider}]: NOT IMPLEMENTED.`);
            // await awsRoute53Client.deleteTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
            break;
         case 'godaddy':
             console.warn(`DNS-01 Remove [${opts.dnsConfig.provider}]: NOT IMPLEMENTED.`);
             // await goDaddyClient.deleteTxtRecord(domain, recordName, recordValue, opts.dnsConfig.apiKey);
             break;
        default:
            // Don't throw error on removal, just log if unsupported
             console.warn(`DNS-01 Remove: Unsupported DNS provider: ${opts.dnsConfig.provider}. Manual cleanup needed.`);
    }

    console.log(`DNS-01 Remove: Record removal initiated/logged for ${recordName}.`);
}

// HTTP-01 challenge functions (challengeCreateHttp01, challengeRemoveHttp01) are removed
// as the backend no longer directly manages these challenges for the manual flow.
// The frontend now handles showing the required file/content, and the verification
// happens via the /api/verify-http-challenge endpoint which calls client.completeChallenge.
// The serving of the challenge file itself is handled by the user's webserver.
// We still need the generic /.well-known/acme-challenge/[token] endpoint to serve stored challenges
// if that mechanism were used, but it's not used by this specific manual flow initiated from the UI.

// The acme-storage functions for HTTP challenges (store/retrieve/removeHttpChallenge)
// are also removed as they are no longer needed for the manual flow.

// However, we DO need a way to serve the challenge response if Let's Encrypt asks for it.
// We add back the `storeHttpChallenge`, `retrieveHttpChallenge`, `removeHttpChallenge`
// functions in `acme-storage` and the API route `src/app/api/acme-challenge/[token]/route.ts`
// This route will be used by Let's Encrypt itself to verify the challenge, reading the value we store.

