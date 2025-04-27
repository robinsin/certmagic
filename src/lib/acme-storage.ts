/**
 * @fileoverview Simple file-based storage for ACME account keys and certificates.
 * WARNING: This implementation is for demonstration purposes ONLY and is INSECURE.
 * - It stores sensitive private keys in plaintext on the filesystem.
 * - It lacks proper error handling, concurrent access control, and security permissions.
 * - Do NOT use this in a production environment. Use a secure database or secrets manager.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto'; // For generating account keys

// Define storage directory (ensure this path is writable by the server process)
// Using '.acme-data' in the project root for simplicity. Add this to .gitignore!
const storageDir = path.resolve(process.cwd(), '.acme-data');
const accountKeyPath = path.join(storageDir, 'account.key');
const certsDir = path.join(storageDir, 'certs');

/**
 * Ensures the storage directory and certs subdirectory exist.
 */
async function ensureStorageDirs(): Promise<void> {
    try {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.mkdir(certsDir, { recursive: true });
    } catch (err: any) {
        if (err.code !== 'EEXIST') {
            console.error('Failed to create ACME storage directories:', err);
            throw new Error('Failed to initialize ACME storage.');
        }
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

            // Convert PEM string to Buffer for acme-client
             const keyBuffer = Buffer.from(newKey);

            await fs.writeFile(accountKeyPath, keyBuffer, { mode: 0o600 }); // Set restrictive permissions
            console.log('Generated and saved new ACME account key.');
            return keyBuffer;
        }
        console.error('Failed to read ACME account key:', err);
        throw new Error('Could not read ACME account key.');
    }
}

/**
 * Stores the generated certificate and private key for a domain.
 * WARNING: Stores the private key unencrypted. Overwrites existing files.
 *
 * @param domain The domain name.
 * @param certificatePem The certificate chain in PEM format.
 * @param privateKeyPem The private key in PEM format.
 * @returns {Promise<void>}
 */
export async function storeCertificate(domain: string, certificatePem: string, privateKeyPem: string): Promise<void> {
    await ensureStorageDirs();
    const domainCertPath = path.join(certsDir, `${domain}.crt`);
    const domainKeyPath = path.join(certsDir, `${domain}.key`);

    try {
        await fs.writeFile(domainCertPath, certificatePem, { mode: 0o644 });
        await fs.writeFile(domainKeyPath, privateKeyPem, { mode: 0o600 }); // Restrictive permissions for key
        console.log(`Stored certificate and key for ${domain}.`);
    } catch (err) {
        console.error(`Failed to store certificate/key for ${domain}:`, err);
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
    await ensureStorageDirs(); // Ensure directories exist before trying to read
    const domainCertPath = path.join(certsDir, `${domain}.crt`);
    const domainKeyPath = path.join(certsDir, `${domain}.key`);

    try {
        const certificatePem = await fs.readFile(domainCertPath, 'utf8');
        const privateKeyPem = await fs.readFile(domainKeyPath, 'utf8');
        console.log(`Retrieved certificate and key for ${domain}.`);
        return { certificatePem, privateKeyPem };
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`No stored certificate or key found for ${domain}.`);
            return null; // File not found is expected if cert doesn't exist
        }
        console.error(`Failed to retrieve certificate/key for ${domain}:`, err);
        // Don't throw an error here, just return null as they might not exist
        return null;
    }
}

/**
 * Retrieves the challenge key authorization string previously stored for HTTP-01.
 * This is needed for cleanup.
 * WARNING: Uses simple file storage, insecure.
 *
 * @param token The challenge token.
 * @returns {Promise<string | null>} The key authorization string or null if not found.
 */
export async function retrieveHttpChallenge(token: string): Promise<string | null> {
    await ensureStorageDirs();
    // Sanitize token to prevent path traversal (basic)
    const safeToken = path.basename(token);
    if (safeToken !== token) {
         console.error("Invalid token format detected:", token);
         return null;
    }
    const challengePath = path.join(storageDir, `http_${safeToken}.challenge`);

    try {
        const keyAuth = await fs.readFile(challengePath, 'utf8');
        return keyAuth;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return null; // Not found
        }
        console.error(`Failed to retrieve HTTP challenge for token ${token}:`, err);
        return null;
    }
}

/**
 * Stores the key authorization for an HTTP-01 challenge.
 * WARNING: Uses simple file storage, insecure.
 *
 * @param token The challenge token.
 * @param keyAuthorization The key authorization string.
 * @returns {Promise<void>}
 */
export async function storeHttpChallenge(token: string, keyAuthorization: string): Promise<void> {
    await ensureStorageDirs();
    // Sanitize token to prevent path traversal (basic)
    const safeToken = path.basename(token);
     if (safeToken !== token) {
         console.error("Invalid token format detected:", token);
         throw new Error("Invalid token format.");
    }
    const challengePath = path.join(storageDir, `http_${safeToken}.challenge`);

    try {
        await fs.writeFile(challengePath, keyAuthorization, { mode: 0o644 });
    } catch (err) {
        console.error(`Failed to store HTTP challenge for token ${token}:`, err);
        throw new Error(`Could not store HTTP challenge file for ${token}.`);
    }
}

/**
 * Deletes the stored HTTP-01 challenge file.
 * WARNING: Uses simple file storage, insecure.
 *
 * @param token The challenge token.
 * @returns {Promise<void>}
 */
export async function removeHttpChallenge(token: string): Promise<void> {
    await ensureStorageDirs();
     // Sanitize token to prevent path traversal (basic)
    const safeToken = path.basename(token);
     if (safeToken !== token) {
         console.error("Invalid token format detected during removal:", token);
         return; // Don't attempt removal if token is suspicious
    }
    const challengePath = path.join(storageDir, `http_${safeToken}.challenge`);

    try {
        await fs.unlink(challengePath);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            // File already gone, ignore
            return;
        }
        console.error(`Failed to remove HTTP challenge for token ${token}:`, err);
        // Log error but don't necessarily throw, cleanup failure might not be critical
    }
}
