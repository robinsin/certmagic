
"use client";

import * as React from "react";
import { CertForm } from "@/components/cert-form";
import { CertStatus } from "@/components/cert-status";
import {
    type Certificate,
    type HttpChallengePending,
    type CertificateResult,
    generateCertificate, // Keep generateCertificate
    renewCertificate,
    verifyHttpChallenge, // Import new service functions
    finalizeCertificate
} from "@/services/cert-magic";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ShieldCheck } from "lucide-react";

export default function CertManager() {
  // State can now hold either a final Certificate or pending challenge details
  const [certResult, setCertResult] = React.useState<CertificateResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false); // Unified loading state
  const { toast } = useToast();

  const handleCertificateResult = (
    result: CertificateResult | null,
    generationError?: string
  ) => {
    setCertResult(result);
    setError(generationError || null);
    // isLoading is managed by CertForm for initial generation/renewal start
  };

  // Handler for manual renewal trigger
  const handleRenew = async (certIdentifier: Pick<Certificate, 'domain'>) => {
     setIsLoading(true);
     setError(null);
     // Keep current cert displayed or clear based on preference while renewing
     // setCertResult(null);

     toast({
         title: "Requesting Renewal...",
         description: `Sending renewal request for ${certIdentifier.domain} to the backend.`,
     });

     try {
        // Renewal might also return a pending state if HTTP-01 is used
        const renewedResult = await renewCertificate(certIdentifier);
        setCertResult(renewedResult); // Update display with new result (issued or pending)
        if (renewedResult.status === 'issued') {
            toast({
                title: "Renewal Successful!",
                description: renewedResult.message || `Certificate for ${certIdentifier.domain} has been renewed.`,
                variant: "default",
                duration: 10000,
            });
        } else { // http-01-pending
             toast({
                title: "Renewal Requires Action",
                description: renewedResult.message || `HTTP-01 challenge pending for renewal of ${certIdentifier.domain}. Please follow instructions.`,
                variant: "default", // Use default or a specific "warning" variant
                duration: 15000,
            });
        }

     } catch (renewalError) {
        console.error("Certificate renewal failed:", renewalError);
        const errorMessage = renewalError instanceof Error ? renewalError.message : "An unknown error occurred during renewal.";
        setError(`Renewal failed: ${errorMessage}`);
        toast({
            title: "Renewal Failed",
            description: errorMessage,
            variant: "destructive",
        });
        // Decide whether to clear the cert display or keep the old one
        // setCertResult(null);
     } finally {
         setIsLoading(false);
     }
  };

  // Handler for verifying a pending HTTP-01 challenge
  const handleVerifyHttp = async (pendingChallenge: HttpChallengePending) => {
      setIsLoading(true);
      setError(null); // Clear previous errors
      toast({
          title: "Verifying HTTP Challenge...",
          description: `Asking Let's Encrypt to verify the challenge file for ${pendingChallenge.domain}.`,
      });

      try {
          const verificationResult = await verifyHttpChallenge(pendingChallenge);

          // verifyHttpChallenge throws on error, so if we reach here, API call was ok.
          // Check the application-level status returned.
          if (verificationResult.status === 'valid') {
              toast({
                  title: "Verification Successful!",
                  description: verificationResult.message || `Challenge for ${pendingChallenge.domain} verified. Finalizing certificate...`,
                  variant: "default",
              });
              // Immediately try to finalize
              await handleFinalize(pendingChallenge); // isLoading remains true until finalize completes
          } else {
              // This case might not be reached if verifyHttpChallenge throws on invalid status from backend.
              // However, keeping it for robustness.
              setError(`Verification Failed: ${verificationResult.message}`);
              toast({
                  title: "Verification Failed",
                  description: verificationResult.message || "Let's Encrypt could not verify the challenge file. Please double-check the file location, content, and server configuration.",
                  variant: "destructive",
                  duration: 15000,
              });
              setIsLoading(false); // Stop loading only if verification failed at this stage
          }
      } catch (verificationError) {
          // Handle errors thrown by verifyHttpChallenge (API errors or explicit invalid status throws)
          console.error("HTTP challenge verification failed:", verificationError);
          const errorMessage = verificationError instanceof Error ? verificationError.message : "An unknown error occurred during verification.";
          setError(`Verification failed: ${errorMessage}`);
          toast({
              title: "Verification Error",
              description: errorMessage,
              variant: "destructive",
          });
          setIsLoading(false); // Stop loading on error
      }
      // setIsLoading(false) is called within handleFinalize or if verification fails
  };


   // Handler for finalizing certificate after successful verification
  const handleFinalize = async (pendingChallenge: HttpChallengePending) => {
      // setIsLoading should already be true from handleVerifyHttp
      setError(null);
      toast({
          title: "Finalizing Certificate...",
          description: `Retrieving the certificate for ${pendingChallenge.domain} from Let's Encrypt.`,
      });

      try {
          const finalCertificate = await finalizeCertificate(pendingChallenge);
          setCertResult(finalCertificate); // Update display with the final certificate
          toast({
              title: "Certificate Issued!",
              description: finalCertificate.message || `Certificate for ${pendingChallenge.domain} has been successfully issued.`,
              variant: "default",
              duration: 10000,
          });
      } catch (finalizeError) {
          console.error("Certificate finalization failed:", finalizeError);
          const errorMessage = finalizeError instanceof Error ? finalizeError.message : "An unknown error occurred during finalization.";
          setError(`Finalization failed: ${errorMessage}`);
          toast({
              title: "Finalization Failed",
              description: errorMessage,
              variant: "destructive",
          });
      } finally {
          setIsLoading(false); // Final step, always stop loading
      }
  };


  return (
    <div className="w-full max-w-2xl flex flex-col items-center space-y-8">
       <Alert className="w-full bg-secondary border-primary/30 shadow-sm rounded-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-primary">Challenge Types & Renewal</AlertTitle>
          <AlertDescription className="text-sm">
            For <strong className="font-medium">DNS-01</strong>, the backend handles verification automatically using API keys.
            For <strong className="font-medium">HTTP-01</strong>, you'll need to manually place a file on your server and then click 'Verify'.
            Auto-renewal works best with DNS-01.
          </AlertDescription>
        </Alert>

      <CertForm
        onCertificateGenerated={handleCertificateResult}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
       />

      <CertStatus
        certResult={certResult} // Pass the result object
        error={error}
        onRenew={handleRenew} // Pass the renewal handler
        onVerifyHttp={handleVerifyHttp} // Pass the HTTP verification handler
        isLoading={isLoading} // Pass unified loading state
       />
    </div>
  );
}

    
