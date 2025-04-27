
"use client";

import * as React from "react";
import { CertForm } from "@/components/cert-form";
import { CertStatus } from "@/components/cert-status";
import { type Certificate, renewCertificate } from "@/services/cert-magic";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function CertManager() {
  const [certificate, setCertificate] = React.useState<Certificate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();

  const handleCertificateGenerated = (
    generatedCertificate: Certificate | null,
    generationError?: string
  ) => {
    setCertificate(generatedCertificate);
    setError(generationError || null);
  };

  const handleRenew = async (certToRenew: Certificate) => {
     if (!certToRenew) return; // Should not happen if button is shown

     setIsLoading(true);
     setError(null); // Clear previous errors
     // Keep current cert display while renewing? Or clear? Let's keep it for now.
     // setCertificate(null);

     toast({
         title: "Renewing Certificate...",
         description: `Attempting to renew certificate for ${certToRenew.domain}.`,
     });

     try {
        // The certificate object should contain the necessary info (like original challenge type and DNS config if applicable)
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Pass the existing certificate object to the renewal function
        const renewedCertificate = await renewCertificate(certToRenew);

        setCertificate(renewedCertificate);
        toast({
            title: "Renewal Successful!",
            description: `Certificate for ${certToRenew.domain} has been renewed.`,
            variant: "default",
        });

     } catch (renewalError) {
        console.error("Certificate renewal failed:", renewalError);
        const errorMessage = renewalError instanceof Error ? renewalError.message : "An unknown error occurred during renewal.";
        setError(errorMessage);
        // Restore the previous certificate state in case of failure? Or show error only? Show error only.
        setCertificate(certToRenew); // Show the old cert again
        toast({
            title: "Renewal Failed",
            description: errorMessage,
            variant: "destructive",
        });
     } finally {
         setIsLoading(false);
     }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col items-center space-y-8">
       <Alert className="w-full bg-secondary border-primary/30">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">How Auto-Renewal Works</AlertTitle>
          <AlertDescription>
            CertMagic aims for automatic renewal. For DNS-01 challenge, it securely stores your DNS credentials (encrypted) to handle verification. For HTTP-01, your server must remain configured to serve the challenge files. DNS-01 is recommended for full automation.
          </AlertDescription>
        </Alert>

      <CertForm
        onCertificateGenerated={handleCertificateGenerated}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
       />

      <CertStatus
        certificate={certificate}
        error={error}
        onRenew={handleRenew} // Pass the renewal handler
        isLoading={isLoading} // Pass loading state to disable renew button while loading
       />
    </div>
  );
}

    