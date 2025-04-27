
"use client";

import * as React from "react";
import { CertForm } from "@/components/cert-form";
import { CertStatus } from "@/components/cert-status";
import { type Certificate, renewCertificate } from "@/services/cert-magic";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ShieldCheck } from "lucide-react";

export default function CertManager() {
  const [certificate, setCertificate] = React.useState<Certificate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false); // Single loading state for form submission or renewal
  const { toast } = useToast();

  const handleCertificateGenerated = (
    generatedCertificate: Certificate | null,
    generationError?: string
  ) => {
    setCertificate(generatedCertificate);
    setError(generationError || null);
    // isLoading state is handled within CertForm for generation
  };

  // Handler for manual renewal trigger
  const handleRenew = async (certIdentifier: Pick<Certificate, 'domain'>) => {
     setIsLoading(true); // Set loading state for renewal
     setError(null); // Clear previous errors
     // Keep current cert displayed while renewing

     toast({
         title: "Requesting Renewal...",
         description: `Sending renewal request for ${certIdentifier.domain} to the backend.`,
     });

     try {
        // Call the service function which now calls the backend API for renewal
        const renewedCertificate = await renewCertificate(certIdentifier);

        setCertificate(renewedCertificate); // Update display with renewed certificate details
        toast({
            title: "Renewal Successful!",
            description: renewedCertificate.message || `Certificate for ${certIdentifier.domain} has been renewed.`,
            variant: "default",
            duration: 10000,
        });

     } catch (renewalError) {
        console.error("Certificate renewal failed:", renewalError);
        const errorMessage = renewalError instanceof Error ? renewalError.message : "An unknown error occurred during renewal.";
        setError(`Renewal failed: ${errorMessage}`); // Set error specific to renewal
        // Optionally keep showing the old certificate or clear it based on preference
        // setCertificate(null); // Or keep the old one displayed with error
        toast({
            title: "Renewal Failed",
            description: errorMessage,
            variant: "destructive",
        });
     } finally {
         setIsLoading(false); // Reset loading state after renewal attempt
     }
  };

  return (
    <div className="w-full max-w-2xl flex flex-col items-center space-y-8">
       <Alert className="w-full bg-secondary border-primary/30 shadow-sm rounded-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold text-primary">Auto-Renewal & Security</AlertTitle>
          <AlertDescription className="text-sm">
            CertMagic's backend securely manages the certificate lifecycle. For <strong className="font-medium">DNS-01</strong>, we use your provided API keys (stored encrypted) for fully automatic renewals. For <strong className="font-medium">HTTP-01</strong>, ensure your server remains configured correctly for renewals. We prioritize security in handling your credentials and certificates.
          </AlertDescription>
        </Alert>

      <CertForm
        onCertificateGenerated={handleCertificateGenerated}
        isLoading={isLoading} // Pass loading state to disable form submit while loading
        setIsLoading={setIsLoading} // Allow form to control its own loading state
       />

      <CertStatus
        certificate={certificate}
        error={error}
        onRenew={handleRenew} // Pass the renewal handler
        isLoading={isLoading} // Pass loading state to disable renew button if needed
       />
    </div>
  );
}
