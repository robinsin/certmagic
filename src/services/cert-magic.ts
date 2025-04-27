/**
 * @fileoverview Service functions for interacting with the CertMagic backend API
 * to generate and renew Let's Encrypt certificates.
 */

/**
 * Represents the DNS configuration required for DNS-01 challenge.
 * This information will be sent to the backend.
 */
export interface DnsConfig {
  /**
   * The DNS provider identifier (e.g., 'cloudflare', 'route53', 'godaddy').
   */
  provider: string;
  /**
   * The API key or credentials for the DNS provider.
   * IMPORTANT: This is sent to the backend, which must handle it securely.
   */
  apiKey: string; // In a real app, consider more secure credential handling
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
   * The actual certificate content (PEM format), typically the full chain.
   * The backend provides this after successful generation/renewal.
   */
  certificatePem: string;
  /**
   * The actual private key content (PEM format).
   * IMPORTANT: The backend should ideally NOT return the private key directly.
   * Instead, it should store it securely and provide instructions on how to access/use it.
   * For this example, we'll include it, but this is NOT recommended for production.
   */
  privateKeyPem: string; // SECURITY WARNING: Not recommended to send private key to client.
  /**
   * The challenge type used to obtain this certificate.
   */
  challengeType: 'dns-01' | 'http-01';
  /**
   * Optional: The DNS configuration used, if challengeType was 'dns-01'.
   * The backend might store this association for renewal.
   */
  dnsConfig?: DnsConfig; // May not be returned by API, but stored backend-side.
  /**
   * Expiry date provided by the backend.
   */
  expiresAt: Date;
  /**
   * Message from the backend, e.g., instructions for HTTP-01 setup or success message.
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
 */
interface RenewRequestData {
    domain: string; // Identify the certificate to renew
}


/**
 * Calls the backend API to generate a Let's Encrypt certificate.
 * The backend handles the actual ACME protocol interaction.
 *
 * @param domain The domain name for which to generate the certificate.
 * @param challengeType The ACME challenge type to use ('dns-01' or 'http-01').
 * @param dnsConfig The DNS configuration for DNS-01 challenge.
 * @returns A promise that resolves to a Certificate object upon success.
 * @throws Will throw an error if the API call fails or the backend reports an error.
 */
export async function generateCertificate(domain: string, challengeType: 'dns-01' | 'http-01', dnsConfig?: DnsConfig): Promise<Certificate> {
  console.log(`Requesting certificate generation for ${domain} via API using ${challengeType.toUpperCase()} challenge.`);

  const requestData: GenerateRequestData = {
      domain,
      challengeType,
  };

  if (challengeType === 'dns-01') {
      if (!dnsConfig || !dnsConfig.provider || !dnsConfig.apiKey) {
          throw new Error("DNS Provider and API Key are required for DNS-01 challenge.");
      }
      requestData.dnsConfig = dnsConfig;
  }

  // --- Actual Backend API Call ---
  // Replace '/api/generate-certificate' with your actual backend endpoint.
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
        errorMessage = errorData.error || errorMessage; // Use specific error from backend if available
    } catch (e) {
        // Ignore JSON parsing error if response body is not JSON
    }
    console.error("Certificate generation API call failed:", errorMessage);
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Assuming the backend returns data conforming to the Certificate interface
  // We need to parse the date string back into a Date object
  const certificate: Certificate = {
      ...result,
      expiresAt: new Date(result.expiresAt), // Ensure expiresAt is a Date object
  };


  console.log(`Certificate generation successful for ${domain}. Backend message: ${certificate.message || 'None'}`);

  // SECURITY WARNING: In a real app, the backend should NOT return the private key.
  // It should store it securely server-side. The client might receive the public cert
  // and instructions. We include it here only because the interface expects it.
  if (!certificate.privateKeyPem) {
       console.warn("Backend did not return private key (this is recommended practice).");
       // Handle how the user gets/uses the key appropriately.
       // For this example, we might need to adjust UI or provide instructions.
       certificate.privateKeyPem = "Private key stored securely on server. See instructions.";
  }


  return certificate;
}

/**
 * Calls the backend API to trigger an immediate renewal of a Let's Encrypt certificate.
 * The backend handles the renewal logic using stored information.
 *
 * @param existingCertificate The existing certificate object (primarily need the domain).
 * @returns A promise that resolves to a Certificate object containing the renewed certificate details.
 * @throws Will throw an error if the API call fails or the backend reports an error.
 */
export async function renewCertificate(existingCertificate: Pick<Certificate, 'domain'>): Promise<Certificate> {
   console.log(`Requesting certificate renewal for ${existingCertificate.domain} via API.`);

   const requestData: RenewRequestData = {
       domain: existingCertificate.domain,
   };

  // --- Actual Backend API Call ---
  // Replace '/api/renew-certificate' with your actual backend endpoint.
  const response = await fetch('/api/renew-certificate', {
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
        errorMessage = errorData.error || errorMessage;
    } catch (e) {
        // Ignore JSON parsing error
    }
    console.error("Certificate renewal API call failed:", errorMessage);
    throw new Error(errorMessage);
  }

  const result = await response.json();
   // Assuming the backend returns data conforming to the Certificate interface
   const renewedCertificate: Certificate = {
      ...result,
      expiresAt: new Date(result.expiresAt), // Ensure expiresAt is a Date object
  };

   console.log(`Certificate renewal successful for ${existingCertificate.domain}. Backend message: ${renewedCertificate.message || 'None'}`);

    // Apply same security warning as in generateCertificate
   if (!renewedCertificate.privateKeyPem) {
       console.warn("Backend did not return private key during renewal (recommended).");
       renewedCertificate.privateKeyPem = "Private key stored securely on server. See instructions.";
   }

   return renewedCertificate;
}

/**
 * Calls the backend API to get the status of certificates (e.g., expiry dates).
 * (Optional: Implement if needed to display a list of managed certificates).
 */
// export async function getCertificateStatus(): Promise<Certificate[]> {
//    // ... Fetch status from a backend endpoint ...
// }
