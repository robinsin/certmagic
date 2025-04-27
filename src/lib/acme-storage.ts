
/**
 * @fileoverview Simple file-based storage for ACME account keys, certificates,
 * pending order state (for manual HTTP-01), and HTTP challenge responses.
 * WARNING: This implementation is for demonstration purposes ONLY and is INSECURE.
 * - Stores sensitive private keys and pending data in plaintext/simple JSON.
 * - Lacks proper error handling, concurrent access control, and security permissions.
 * - Do NOT use this in a production environment. Use a secure database or secrets manager.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto'; // For generating account keys and hashing
import type { DnsConfig } from '@/services/cert-magic'; // Import type

// Define storage directory
const storageDir = path.resolve(process.cwd(), '.acme-data');
const accountKeyPath = path.join(storageDir, 'account.key');
const certsDir = path.join(storageDir, 'certs');
const configsDir = path.join(storageDir, 'configs'); // Store config separately
const pendingDir = path.join(storageDir, 'pending'); // Store pending orders and HTTP challenges

// Interface for stored certificate configuration
export interface CertificateConfig {
    domain: string;
    challengeType: 'dns-01' | 'http-01';
    dnsConfig?: DnsConfig; // Only present for DNS-01
}

// Interface for data stored for a pending order (typically HTTP-01 manual flow)
export interface PendingOrderData {
    domain: string;
    challengeType: 'http-01'; // Currently only for HTTP-01 manual flow
    challengeUrl: string;
    token: string;
    keyAuthorization: string;
    privateKeyPem: string; // Private key associated with this pending order's CSR
    csrPem: string;        // CSR associated with this pending order
}

/**
 * Ensures all necessary storage directories exist.
 */
async function ensureStorageDirs(): Promise<void> {
    try {
        // Use Promise.all for potentially faster concurrent creation
        await Promise.all([
            fs.mkdir(storageDir, { recursive: true }),
            fs.mkdir(certsDir, { recursive: true }),
            fs.mkdir(configsDir, { recursive: true }),
            fs.mkdir(pendingDir, { recursive: true }), // Ensure pending dir exists
        ]);
    } catch (err: any) {
        // Improved error checking for concurrent mkdir
        const isEEXIST = (e: any) => e && e.code === 'EEXIST';
        if (Array.isArray(err)) {
            if (!err.every(isEEXIST)) {
                 console.error('Failed to create some ACME storage directories:', err.filter(e => !isEEXIST(e)));
                 throw new Error('Failed to initialize ACME storage.');
            }
        } else if (!isEEXIST(err)) {
             console.error('Failed to create ACME storage directory:', err);
             throw new Error('Failed to initialize ACME storage.');
        }
        // If all errors were EEXIST or no error, directories are ready.
    }
}


/**
 * Gets the ACME account key. Generates a new one if it doesn't exist.
 * WARNING: Stores the key unencrypted.
 * @returns {Promise<Buffer>} The account private key as a Buffer.
 */
export async function getAccountKey(): Promise<Buffer> {
    await ensureStorageDirs();
    try {
        const key = await fs.readFile(accountKeyPath);
        console.log('Loaded existing ACME account key.');
        return key;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log('No ACME account key found, generating a new one...');
            const newKey = await crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            }).privateKey;
            const keyBuffer = Buffer.from(newKey);
            await fs.writeFile(accountKeyPath, keyBuffer, { mode: 0o600 });
            console.log('Generated and saved new ACME account key.');
            return keyBuffer;
        }
        console.error('Failed to read ACME account key:', err);
        throw new Error('Could not read ACME account key.');
    }
}

/**
 * Stores the generated certificate, private key, and configuration for a domain.
 * WARNING: Stores the private key unencrypted. Overwrites existing files.
 *
 * @param domain The domain name.
 * @param certificatePem The certificate chain in PEM format.
 * @param privateKeyPem The private key in PEM format.
 * @param config The configuration used to obtain the certificate.
 * @returns {Promise<void>}
 */
export async function storeCertificate(domain: string, certificatePem: string, privateKeyPem: string, config: CertificateConfig): Promise<void> {
    await ensureStorageDirs();
    const domainCertPath = path.join(certsDir, `${domain}.crt`);
    const domainKeyPath = path.join(certsDir, `${domain}.key`);
    const domainConfigPath = path.join(configsDir, `${domain}.json`);

    try {
        await Promise.all([
            fs.writeFile(domainCertPath, certificatePem, { mode: 0o644 }),
            fs.writeFile(domainKeyPath, privateKeyPem, { mode: 0o600 }), // Restrictive permissions for key
            fs.writeFile(domainConfigPath, JSON.stringify(config, null, 2), { mode: 0o600 }), // Store config securely if possible
        ]);
        console.log(`Stored certificate, key, and config for ${domain}.`);
    } catch (err) {
        console.error(`Failed to store certificate/key/config for ${domain}:`, err);
        throw new Error(`Could not store certificate files for ${domain}.`);
    }
}

/**
 * Retrieves the stored certificate and private key for a domain.
 *
 * @param domain The domain name.
 * @returns {Promise<{certificatePem: string, privateKeyPem: string} | null>} The certificate and key, or null if not found.
 */
export async function retrieveCertificate(domain: string): Promise<{ certificatePem: string; privateKeyPem: string } | null> {
    await ensureStorageDirs();
    const domainCertPath = path.join(certsDir, `${domain}.crt`);
    const domainKeyPath = path.join(certsDir, `${domain}.key`);

    try {
        const [certificatePem, privateKeyPem] = await Promise.all([
            fs.readFile(domainCertPath, 'utf8'),
            fs.readFile(domainKeyPath, 'utf8'),
        ]);
        console.log(`Retrieved certificate and key for ${domain}.`);
        return { certificatePem, privateKeyPem };
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`No stored certificate or key found for ${domain}.`);
            return null;
        }
        console.error(`Failed to retrieve certificate/key for ${domain}:`, err);
        return null; // Return null on other errors too
    }
}

/**
 * Retrieves the stored configuration for a domain.
 *
 * @param domain The domain name.
 * @returns {Promise<CertificateConfig | null>} The configuration or null if not found.
 */
export async function retrieveCertificateConfig(domain: string): Promise<CertificateConfig | null> {
    await ensureStorageDirs();
    const domainConfigPath = path.join(configsDir, `${domain}.json`);

    try {
        const configJson = await fs.readFile(domainConfigPath, 'utf8');
        const config: CertificateConfig = JSON.parse(configJson);
        console.log(`Retrieved configuration for ${domain}.`);
        return config;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`No stored configuration found for ${domain}.`);
            return null;
        }
        console.error(`Failed to retrieve configuration for ${domain}:`, err);
        return null; // Return null on other errors
    }
}


// --- HTTP-01 Challenge Storage ---
// These functions are needed by the /.well-known/acme-challenge/[token] endpoint
// to serve the correct response to Let's Encrypt during validation.
// The `storeHttpChallenge` function is called *before* telling LE to validate.

/**
 * Stores the key authorization for a given HTTP-01 challenge token.
 * This value will be served by the dedicated ACME challenge endpoint.
 *
 * @param token The challenge token.
 * @param keyAuthorization The key authorization string.
 * @returns {Promise<void>}
 */
export async function storeHttpChallenge(token: string, keyAuthorization: string): Promise<void> {
    await ensureStorageDirs();
    // Use a prefix to differentiate challenge files from pending order files
    const challengeFilename = `challenge_${token}.txt`; // Store as plain text
    const challengePath = path.join(pendingDir, challengeFilename);

    try {
        await fs.writeFile(challengePath, keyAuthorization, { mode: 0o644 });
        console.log(`Stored HTTP challenge response for token: ${token}`);
    } catch (err) {
        console.error(`Failed to store HTTP challenge for token ${token}:`, err);
        throw new Error('Could not store HTTP challenge.');
    }
}

/**
 * Retrieves the key authorization for a given HTTP-01 challenge token.
 * Used by the dedicated ACME challenge endpoint.
 *
 * @param token The challenge token.
 * @returns {Promise<string | null>} The key authorization string or null if not found.
 */
export async function retrieveHttpChallenge(token: string): Promise<string | null> {
    await ensureStorageDirs();
    const challengeFilename = `challenge_${token}.txt`;
    const challengePath = path.join(pendingDir, challengeFilename);

    try {
        const keyAuthorization = await fs.readFile(challengePath, 'utf8');
        console.log(`Retrieved HTTP challenge response for token: ${token}`);
        return keyAuthorization;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`No HTTP challenge response found for token: ${token}`);
            return null;
        }
        console.error(`Failed to retrieve HTTP challenge for token ${token}:`, err);
        return null; // Return null on other errors
    }
}

/**
 * Removes the stored key authorization for a given HTTP-01 challenge token.
 * Should be called after the challenge is completed or fails.
 *
 * @param token The challenge token.
 * @returns {Promise<void>}
 */
export async function removeHttpChallenge(token: string): Promise<void> {
    await ensureStorageDirs();
    const challengeFilename = `challenge_${token}.txt`;
    const challengePath = path.join(pendingDir, challengeFilename);

    try {
        await fs.unlink(challengePath);
        console.log(`Removed HTTP challenge response for token: ${token}`);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            // File already gone, ignore
            return;
        }
        console.error(`Failed to remove HTTP challenge for token ${token}:`, err);
        // Log error but don't necessarily throw, cleanup failure might not be critical
    }
}


// --- Pending Order Storage (for manual HTTP-01) ---

/**
 * Stores the state of a pending ACME order (e.g., waiting for manual HTTP-01 validation).
 * Uses the ACME order URL as the key.
 * WARNING: Stores private key and other data insecurely.
 *
 * @param orderUrl The unique URL of the ACME order.
 * @param data The data associated with the pending order.
 * @returns {Promise<void>}
 */
export async function storePendingOrder(orderUrl: string, data: PendingOrderData): Promise<void> {
    await ensureStorageDirs();
    // Use a safe filename derived from the order URL (e.g., hash)
    const filename = `pending_${crypto.createHash('sha256').update(orderUrl).digest('hex')}.json`;
    const pendingPath = path.join(pendingDir, filename);

    try {
        await fs.writeFile(pendingPath, JSON.stringify(data, null, 2), { mode: 0o600 });
        console.log(`Stored pending order state for ${data.domain} (Order: ${orderUrl.split('/').pop()})`);
        // Also store the HTTP challenge response needed for LE validation
        await storeHttpChallenge(data.token, data.keyAuthorization);
    } catch (err) {
        console.error(`Failed to store pending order/challenge for ${data.domain}:`, err);
        // Attempt to clean up challenge file if order storage failed?
        try { await removeHttpChallenge(data.token); } catch { /* ignore cleanup error */ }
        throw new Error(`Could not store pending order state.`);
    }
}

/**
 * Retrieves the state of a pending ACME order.
 *
 * @param orderUrl The unique URL of the ACME order.
 * @returns {Promise<PendingOrderData | null>} The pending order data or null if not found.
 */
export async function retrievePendingOrder(orderUrl: string): Promise<PendingOrderData | null> {
    await ensureStorageDirs();
    const filename = `pending_${crypto.createHash('sha256').update(orderUrl).digest('hex')}.json`;
    const pendingPath = path.join(pendingDir, filename);

    try {
        const dataJson = await fs.readFile(pendingPath, 'utf8');
        const data: PendingOrderData = JSON.parse(dataJson);
        console.log(`Retrieved pending order state for ${data.domain} (Order: ${orderUrl.split('/').pop()})`);
        return data;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`No pending order state found for Order: ${orderUrl.split('/').pop()}`);
            return null;
        }
        console.error(`Failed to retrieve pending order state (Order: ${orderUrl.split('/').pop()}):`, err);
        return null; // Return null on other errors
    }
}

/**
 * Removes the state file for a pending ACME order and the associated HTTP challenge file.
 * Should be called after finalization or definitive failure.
 *
 * @param orderUrl The unique URL of the ACME order.
 * @returns {Promise<void>}
 */
export async function removePendingOrder(orderUrl: string): Promise<void> {
    await ensureStorageDirs();
    const filename = `pending_${crypto.createHash('sha256').update(orderUrl).digest('hex')}.json`;
    const pendingPath = path.join(pendingDir, filename);
    let tokenToRemove: string | undefined;

    try {
        // Try to read the token from the pending file before deleting it
        try {
            const dataJson = await fs.readFile(pendingPath, 'utf8');
            const data: PendingOrderData = JSON.parse(dataJson);
            tokenToRemove = data.token;
        } catch (readErr: any) {
            if (readErr.code !== 'ENOENT') {
                 console.warn(`Could not read pending order file before removal (Order: ${orderUrl.split('/').pop()}):`, readErr);
            }
            // Proceed even if reading fails, maybe the file is already gone
        }

        // Delete the pending order file
        await fs.unlink(pendingPath);
        console.log(`Removed pending order state file for Order: ${orderUrl.split('/').pop()}`);

        // If we got a token, remove the corresponding challenge file
        if (tokenToRemove) {
            await removeHttpChallenge(tokenToRemove);
        } else {
            console.warn(`Could not determine token for challenge cleanup associated with Order: ${orderUrl.split('/').pop()}`);
        }

    } catch (err: any) {
        if (err.code === 'ENOENT') {
            // Pending order file was already gone. Still try to remove challenge if we have a token.
             if (tokenToRemove) {
                await removeHttpChallenge(tokenToRemove);
            }
            return;
        }
        console.error(`Failed during removal of pending order state/challenge (Order: ${orderUrl.split('/').pop()}):`, err);
        // Log error but don't necessarily throw, cleanup failure might not be critical
    }
}

    
