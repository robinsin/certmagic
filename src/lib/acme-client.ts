/**
 * @fileoverview Initializes and exports a configured ACME client instance.
 * Includes helper functions for common ACME operations like DNS/HTTP challenges.
 */
import acme from 'acme-client';
import { getAccountKey, storeHttpChallenge, removeHttpChallenge } from './acme-storage'; // Use our storage helper

// --- Configuration ---
// Use Let's Encrypt staging directory for testing to avoid rate limits
// Switch to acme.directory.letsencrypt.production for real certificates
const LETS_ENCRYPT_DIRECTORY_URL = process.env.NODE_ENV === 'production'
    ? acme.directory.letsencrypt.production
    : acme.directory.letsencrypt.staging;

// Email for Let's Encrypt account (replace with a real email for production)
const ACCOUNT_EMAIL = process.env.LETS_ENCRYPT_EMAIL || 'test@example.com'; // Use env var or a default

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
         // Let's assume if it's not a creation error, it might be okay.
        if (e.message && !e.message.includes('account already exists')) { // Simple check, might need refinement
            console.error('Failed to create/retrieve ACME account:', e);
            acmeClientInstance = null; // Reset instance on failure
            throw new Error(`Failed to initialize ACME account: ${e.message}`);
        }
         console.log('ACME account already exists.');
    }


    return acmeClientInstance;
}

// --- Challenge Handlers ---

/**
 * Placeholder for DNS-01 challenge creation.
 * This needs to be implemented based on the specific DNS provider API.
 *
 * @param {object} opts - Options object.
 * @param {string} opts.identifier - The identifier (domain name).
 * @param {string} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string.
 * @param {DnsConfig} opts.dnsConfig - DNS provider configuration.
 * @returns {Promise<void>}
 */
export async function challengeCreateDns01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
    dnsConfig: { provider: string; apiKey: string }; // Adjusted to match CertForm
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

    // It's crucial to wait for DNS propagation after creating the record.
    // This often involves polling DNS servers. For simplicity, we'll just log.
    console.log(`DNS-01 Create: Record creation initiated for ${recordName}. Manual verification/wait might be needed.`);
    // In a real implementation, add a delay or DNS polling logic here.
    await new Promise(resolve => setTimeout(resolve, 30000)); // Basic 30-second wait (adjust as needed)
     console.log(`DNS-01 Create: Wait complete. Assuming propagation.`);
}

/**
 * Placeholder for DNS-01 challenge removal.
 * This needs to be implemented based on the specific DNS provider API.
 *
 * @param {object} opts - Options object.
 * @param {string} opts.identifier - The identifier (domain name).
 * @param {string} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string (used to find the record).
 * @param {DnsConfig} opts.dnsConfig - DNS provider configuration.
 * @returns {Promise<void>}
 */
export async function challengeRemoveDns01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
    dnsConfig: { provider: string; apiKey: string }; // Adjusted
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


/**
 * Handles HTTP-01 challenge creation by storing the challenge file content.
 * The actual serving of the file needs to be handled by a separate endpoint
 * (e.g., `/api/acme-challenge/[token]`).
 *
 * @param {object} opts - Options object.
 * @param {string} opts.identifier - The identifier (domain name).
 * @param {acme.Challenge} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string.
 * @returns {Promise<void>}
 */
export async function challengeCreateHttp01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
}): Promise<void> {
    const token = opts.challenge.token;
    const keyAuth = opts.keyAuthorization;

    console.log(`HTTP-01 Create: Storing challenge for token: ${token}`);
    console.log(`HTTP-01 Create: Expected URL: http://${opts.identifier.value}/.well-known/acme-challenge/${token}`);
    console.log(`HTTP-01 Create: Content: ${keyAuth}`);

    // Store the token -> keyAuthorization mapping using our storage helper
    // This will be retrieved by the dedicated challenge serving endpoint.
    await storeHttpChallenge(token, keyAuth);

    console.log(`HTTP-01 Create: Challenge content stored. Ensure endpoint is ready to serve it.`);
}


/**
 * Handles HTTP-01 challenge removal by deleting the stored challenge file content.
 *
 * @param {object} opts - Options object.
 * @param {string} opts.identifier - The identifier (domain name).
 * @param {acme.Challenge} opts.challenge - The ACME challenge object.
 * @param {string} opts.keyAuthorization - The key authorization string.
 * @returns {Promise<void>}
 */
export async function challengeRemoveHttp01(opts: {
    identifier: acme.Identifier;
    challenge: acme.Challenge;
    keyAuthorization: string;
}): Promise<void> {
    const token = opts.challenge.token;

    console.log(`HTTP-01 Remove: Removing stored challenge for token: ${token}`);

    // Remove the stored challenge file/data
    await removeHttpChallenge(token);

    console.log(`HTTP-01 Remove: Stored challenge removed.`);
}

/**
 * Default challenge validation function (can be overridden in specific calls).
 * Waits for a short period after challenge creation before telling the ACME
 * server to verify. Increase delay if needed.
 *
 * @param {acme.Challenge} challenge The challenge object.
 * @returns {Promise<boolean>} Always returns true in this basic implementation.
 */
export async function challengeValidate(challenge: acme.Challenge): Promise<boolean> {
    console.log(`Validating challenge type: ${challenge.type}, status: ${challenge.status}`);
    // Optional: Add a small delay, especially after DNS changes
    // await new Promise(resolve => setTimeout(resolve, 5000)); // 5 sec delay
    return true; // Tell the client to proceed with ACME server validation
}
