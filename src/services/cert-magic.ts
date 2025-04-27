/**
 * @fileoverview Service functions for interacting with the CertMagic backend API
 * to generate and renew Let's Encrypt certificates using acme-client.
 */

/**
 * Represents the DNS configuration required for DNS-01 challenge.
 * This information will be sent to the backend.
 */
export interface DnsConfig {
  /**
   * The DNS provider identifier (e.g., 'cloudflare', 'route53', 'godaddy').
   * Must match a provider supported by the backend's acme-client implementation.
   */
  provider: string;
  /**
   * The API key or credentials for the DNS provider.
   * IMPORTANT: This is sent to the backend, which must handle it securely and use it
   * with the corresponding DNS provider API for challenge creation/removal.
   */
  apiKey: string;
}

/**
 * Represents the details of a generated/renewed certificate as returned by the backend API.
 */
export interface Certificate {
  /**
   * The domain name for which the certificate was issued.
   */
  domain: string;
  /**
   * The actual certificate content (PEM format), typically the full chain,
   * as provided by Let's Encrypt via acme-client.
   */
  certificatePem: string;
  /**
   * The private key content (PEM format) corresponding to the certificate's public key.
   * This key was generated during the CSR creation process on the backend.
   * IMPORTANT: The backend should ideally NOT return the private key directly.
   * Instead, it should store it securely (e.g., encrypted in a database or secrets manager)
   * and provide instructions or mechanisms for secure deployment.
   * For this example frontend, we include it, acknowledging the security risk.
   */
  privateKeyPem: string; // SECURITY WARNING: Not recommended to send private key to client.
  /**
   * The challenge type ('dns-01' or 'http-01') used by the backend to obtain this certificate.
   */
  challengeType: 'dns-01' | 'http-01';
  /**
   * Expiry date extracted from the certificate by the backend.
   */
  expiresAt: Date;
  /**
   * Informational message from the backend, e.g., success confirmation, warnings.
   */
  message?: string;
}

/**
 * Represents the data sent to the backend API for certificate generation.
 */
interface GenerateRequestData {
    domain: string;
    challengeType: 'dns-01' | 'http-01';
    dnsConfig?: DnsConfig; // Only included for DNS-01
}

/**
 * Represents the data sent to the backend API for certificate renewal.
 * Currently, only the domain is needed as the backend re-runs generation.
 */
interface RenewRequestData {
    domain: string;
}


/**
 * Calls the backend API (/api/generate-certificate) which now uses acme-client
 * to perform the actual ACME protocol interaction and generate a certificate.
 *
 * @param domain The domain name for which to generate the certificate.
 * @param challengeType The ACME challenge type ('dns-01' or 'http-01') for the backend to use.
 * @param dnsConfig The DNS configuration (provider, apiKey) required if challengeType is 'dns-01'.
 * @returns A promise that resolves to a Certificate object upon success.
 * @throws Will throw an error if the API call fails or the backend reports an ACME error.
 */
export async function generateCertificate(domain: string, challengeType: 'dns-01' | 'http-01', dnsConfig?: DnsConfig): Promise<Certificate> {
  console.log(`Requesting certificate generation for ${domain} via API using ${challengeType.toUpperCase()} challenge.`);

  const requestData: GenerateRequestData = {
      domain,
      challengeType,
  };

  if (challengeType === 'dns-01') {
      // Frontend validation remains useful
      if (!dnsConfig || !dnsConfig.provider || !dnsConfig.apiKey) {
          throw new Error("DNS Provider and API Key are required for DNS-01 challenge.");
      }
      // Censor API key in frontend logs if needed, backend handles the actual key
       console.log(`Including DNS config for provider: ${dnsConfig.provider}, API Key: ${dnsConfig.apiKey ? '***' : 'MISSING'}`);
      requestData.dnsConfig = dnsConfig;
  }

  const response = await fetch('/api/generate-certificate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
        const errorData = await response.json();
        // Use specific error from backend if available (could be ACME error message)
        errorMessage = errorData.error || errorMessage;
    } catch (e) {
        // Ignore JSON parsing error if response body is not JSON
    }
    console.error("Certificate generation API call failed:", errorMessage);
    throw new Error(errorMessage); // Throw the specific error from backend
  }

  // Assuming the backend returns data conforming to the Certificate interface
  const result = await response.json();

  // Parse the date string back into a Date object
  const certificate: Certificate = {
      ...result,
      expiresAt: new Date(result.expiresAt),
  };

  console.log(`Certificate generation successful for ${domain}. Backend message: ${certificate.message || 'None'}`);

  // Log the security warning about the private key being present in the response
  if (certificate.privateKeyPem && !certificate.privateKeyPem.includes("stored securely")) {
       console.warn("SECURITY WARNING: The private key was returned in the API response. This is insecure and should be avoided in production. The backend should store the key securely.");
  }

  return certificate;
}

/**
 * Calls the backend API (/api/renew-certificate) to trigger a renewal.
 * The backend now re-runs the certificate generation process using acme-client.
 * It should ideally retrieve necessary configuration (like original challenge type
 * and stored DNS credentials if applicable) based on the domain.
 *
 * @param existingCertificate Primarily needs the domain to identify which certificate to renew.
 * @returns A promise that resolves to a Certificate object containing the renewed certificate details.
 * @throws Will throw an error if the API call fails or the backend reports an error during renewal.
 */
export async function renewCertificate(existingCertificate: Pick<Certificate, 'domain'>): Promise<Certificate> {
   console.log(`Requesting certificate renewal for ${existingCertificate.domain} via API.`);

   const requestData: RenewRequestData = {
       domain: existingCertificate.domain,
       // Note: We are NOT sending challengeType or dnsConfig from the frontend here.
       // The backend /api/renew-certificate route is now responsible for determining
       // the correct method and retrieving any necessary credentials based on the domain.
   };

  const response = await fetch('/api/renew-certificate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    let errorMessage = `API error during renewal: ${response.status} ${response.statusText}`;
    try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
    } catch (e) {
        // Ignore JSON parsing error
    }
    console.error("Certificate renewal API call failed:", errorMessage);
    throw new Error(errorMessage);
  }

  const result = await response.json();
   // Parse the date string back into a Date object
   const renewedCertificate: Certificate = {
      ...result,
      expiresAt: new Date(result.expiresAt),
  };

   console.log(`Certificate renewal successful for ${existingCertificate.domain}. Backend message: ${renewedCertificate.message || 'None'}`);

   // Log the security warning again for the renewed certificate's key
   if (renewedCertificate.privateKeyPem && !renewedCertificate.privateKeyPem.includes("stored securely")) {
       console.warn("SECURITY WARNING: The new private key for the renewed certificate was returned in the API response. This is insecure.");
   }

   return renewedCertificate;
}
