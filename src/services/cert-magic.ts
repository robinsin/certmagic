
/**
 * @fileoverview Service functions for interacting with the CertMagic backend API
 * to generate and renew Let's Encrypt certificates using acme-client.
 * Implements the multi-step flow for manual HTTP-01 challenges.
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
 * Represents the details of a successfully generated/renewed certificate.
 */
export interface Certificate {
  status: 'issued'; // Status to differentiate from pending state
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
   * IMPORTANT: Backend should store securely, returning is insecure. Included for demo.
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
 * Represents the state when an HTTP-01 challenge is pending manual user action.
 */
export interface HttpChallengePending {
    status: 'http-01-pending';
    domain: string;
    /** The ACME challenge token. User needs to create a file named this under .well-known/acme-challenge/ */
    token: string;
    /** The content the user needs to put into the challenge file. */
    keyAuthorization: string;
    /** The ACME challenge URL the backend needs to verify. */
    challengeUrl: string;
    /** The ACME order URL the backend needs to finalize. */
    orderUrl: string;
    /** Instructions or message for the user. */
    message: string;
}

/**
 * Union type for the possible successful return values from generation/renewal attempts.
 */
export type CertificateResult = Certificate | HttpChallengePending;


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
    domain: string;
}

/**
 * Represents data sent to verify an HTTP-01 challenge.
 */
interface VerifyHttpChallengeRequestData {
    challengeUrl: string;
    orderUrl: string;
    domain: string;
}

/**
 * Represents the data returned from the verify HTTP-01 challenge API.
 */
interface VerifyHttpChallengeResponseData {
    status: 'valid' | 'invalid';
    message: string;
}


/**
 * Represents data sent to finalize a certificate order after successful validation.
 */
interface FinalizeCertificateRequestData {
    orderUrl: string;
    domain: string;
}


/**
 * Calls the backend API (/api/generate-certificate) which uses acme-client
 * to perform the actual ACME protocol interaction and generate a certificate.
 * For HTTP-01, this might return a pending state requiring manual user action.
 *
 * @param domain The domain name for which to generate the certificate.
 * @param challengeType The ACME challenge type ('dns-01' or 'http-01').
 * @param dnsConfig The DNS configuration required if challengeType is 'dns-01'.
 * @returns A promise resolving to CertificateResult (either issued Certificate or HttpChallengePending).
 * @throws Will throw an error if the API call fails or the backend reports an unrecoverable error.
 */
export async function generateCertificate(domain: string, challengeType: 'dns-01' | 'http-01', dnsConfig?: DnsConfig): Promise<CertificateResult> {
  console.log(`Requesting certificate generation for ${domain} via API using ${challengeType.toUpperCase()} challenge.`);

  const requestData: GenerateRequestData = {
      domain,
      challengeType,
  };

  if (challengeType === 'dns-01') {
      if (!dnsConfig || !dnsConfig.provider || !dnsConfig.apiKey) {
          throw new Error("DNS Provider and API Key are required for DNS-01 challenge.");
      }
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
        errorMessage = errorData.error || errorMessage;
    } catch (e) { /* Ignore JSON parsing error */ }
    console.error("Certificate generation API call failed:", errorMessage);
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Check the status returned by the backend
  if (result.status === 'issued') {
      const certificate: Certificate = {
          ...result,
          expiresAt: new Date(result.expiresAt), // Convert date string to Date object
          status: 'issued', // Ensure status is set
      };
      console.log(`Certificate generation successful for ${domain}. Backend message: ${certificate.message || 'None'}`);
      if (certificate.privateKeyPem && !certificate.privateKeyPem.includes("stored securely")) {
           console.warn("SECURITY WARNING: Private key returned in API response. Insecure for production.");
      }
      return certificate;
  } else if (result.status === 'http-01-pending') {
       const pendingChallenge: HttpChallengePending = {
           ...result,
           status: 'http-01-pending', // Ensure status is set
       };
       console.log(`HTTP-01 challenge pending for ${domain}. User action required. Message: ${pendingChallenge.message}`);
       return pendingChallenge;
  } else {
       // Should not happen if backend respects the types
       console.error("Received unexpected status from generate API:", result.status);
       throw new Error(`Received unexpected status from generation API: ${result.status}`);
  }
}


/**
 * Calls the backend API (/api/verify-http-challenge) to ask the ACME server
 * to verify the manually placed HTTP-01 challenge file.
 *
 * @param pendingChallenge The details of the pending challenge.
 * @returns A promise resolving to the verification result object { status: 'valid' | 'invalid', message: string }
 * @throws Will throw an error if the API call fails.
 */
export async function verifyHttpChallenge(pendingChallenge: HttpChallengePending): Promise<VerifyHttpChallengeResponseData> {
    console.log(`Requesting verification of HTTP-01 challenge for ${pendingChallenge.domain} via API.`);

    const requestData: VerifyHttpChallengeRequestData = {
        challengeUrl: pendingChallenge.challengeUrl,
        orderUrl: pendingChallenge.orderUrl,
        domain: pendingChallenge.domain,
    };

    const response = await fetch('/api/verify-http-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
    });

    if (!response.ok) {
        let errorMessage = `API error during verification: ${response.status} ${response.statusText}`;
        let responseBody;
        try {
            responseBody = await response.json();
             errorMessage = responseBody.message || responseBody.error || errorMessage;
        } catch (e) { /* Ignore */ }
        console.error("HTTP challenge verification API call failed:", errorMessage, responseBody);
        // Throw specific error from backend if available and has status 'invalid', otherwise throw generic error
        if (responseBody?.status === 'invalid') {
            throw new Error(responseBody.message || 'Verification failed.');
        }
        throw new Error(errorMessage);
    }

    const result: VerifyHttpChallengeResponseData = await response.json();
    console.log(`HTTP challenge verification result for ${pendingChallenge.domain}: ${result.status}. Message: ${result.message}`);

    // If the backend returned a 'valid' status but still somehow sent a non-2xx response (unlikely), handle it.
    // But typically, a non-ok response means failure.
    if (result.status === 'invalid') {
        // We can throw here directly as the backend indicated failure.
        throw new Error(result.message || `Challenge verification failed for ${pendingChallenge.domain}.`);
    }

    return result; // Should have status: 'valid' if we reach here
}

/**
 * Calls the backend API (/api/finalize-certificate) to finalize the order
 * and retrieve the certificate after successful validation.
 *
 * @param pendingChallenge The original pending challenge details containing the order URL.
 * @returns A promise resolving to the final Certificate object.
 * @throws Will throw an error if the API call fails or finalization fails.
 */
export async function finalizeCertificate(pendingChallenge: HttpChallengePending): Promise<Certificate> {
    console.log(`Requesting finalization of certificate for ${pendingChallenge.domain} via API.`);

    const requestData: FinalizeCertificateRequestData = {
        orderUrl: pendingChallenge.orderUrl,
        domain: pendingChallenge.domain,
    };

    const response = await fetch('/api/finalize-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
    });

    if (!response.ok) {
        let errorMessage = `API error during finalization: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (e) { /* Ignore */ }
        console.error("Certificate finalization API call failed:", errorMessage);
        throw new Error(errorMessage);
    }

    const result = await response.json();

    if (result.status !== 'issued') {
        console.error("Finalization API did not return 'issued' status:", result.status);
        throw new Error(`Certificate finalization failed: ${result.message || 'Unknown reason'}`);
    }

    const certificate: Certificate = {
        ...result,
        expiresAt: new Date(result.expiresAt), // Convert date string to Date object
        status: 'issued',
    };

    console.log(`Certificate finalization successful for ${pendingChallenge.domain}. Message: ${certificate.message || 'None'}`);
    if (certificate.privateKeyPem && !certificate.privateKeyPem.includes("stored securely")) {
        console.warn("SECURITY WARNING: Private key returned in API response. Insecure for production.");
    }
    return certificate;
}


/**
 * Calls the backend API (/api/renew-certificate) to trigger a renewal.
 * The backend re-runs the certificate generation process using acme-client.
 * For HTTP-01, this may again result in a pending state.
 *
 * @param existingCertificate Needs the domain to identify which certificate to renew.
 * @returns A promise resolving to CertificateResult (either issued Certificate or HttpChallengePending).
 * @throws Will throw an error if the API call fails or the backend reports an error.
 */
export async function renewCertificate(existingCertificate: Pick<Certificate, 'domain'>): Promise<CertificateResult> {
   console.log(`Requesting certificate renewal for ${existingCertificate.domain} via API.`);

   const requestData: RenewRequestData = {
       domain: existingCertificate.domain,
   };

  const response = await fetch('/api/renew-certificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    let errorMessage = `API error during renewal: ${response.status} ${response.statusText}`;
    try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
    } catch (e) { /* Ignore */ }
    console.error("Certificate renewal API call failed:", errorMessage);
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Check the status returned by the backend
   if (result.status === 'issued') {
      const certificate: Certificate = {
          ...result,
          expiresAt: new Date(result.expiresAt), // Convert date string to Date object
          status: 'issued',
      };
      console.log(`Certificate renewal successful for ${existingCertificate.domain}. Message: ${certificate.message || 'None'}`);
      if (certificate.privateKeyPem && !certificate.privateKeyPem.includes("stored securely")) {
           console.warn("SECURITY WARNING: Renewed private key returned in API response.");
      }
      return certificate;
   } else if (result.status === 'http-01-pending') {
       const pendingChallenge: HttpChallengePending = {
           ...result,
           status: 'http-01-pending',
       };
       console.log(`HTTP-01 challenge pending during renewal for ${existingCertificate.domain}. User action required. Message: ${pendingChallenge.message}`);
       return pendingChallenge;
   } else {
       console.error("Received unexpected status from renew API:", result.status);
       throw new Error(`Received unexpected status from renewal API: ${result.status}`);
   }
}
    
