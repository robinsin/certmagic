"use client";

import * as React from "react";
import { CertForm } from "@/components/cert-form";
import { CertStatus } from "@/components/cert-status";
import { type Certificate, renewCertificate, type DnsConfig } from "@/services/cert-magic"; // Assuming renewCertificate exists
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

  const handleRenew = async (domain: string) => {
     setIsLoading(true);
     setError(null); // Clear previous errors
     setCertificate(null); // Optionally clear current cert display while renewing
     toast({
         title: "Renewing Certificate...",
         description: `Attempting to renew certificate for ${domain}.`,
     });

     try {
        // TODO: Need a way to get DNS config for renewal.
        // This might involve storing it securely or asking the user again.
        // For now, using placeholder config.
        const placeholderDnsConfig: DnsConfig = { provider: 'cloudflare', apiKey: 'dummy-api-key-placeholder' };

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Replace with actual API call when ready
        const renewedCertificate = await renewCertificate(domain, placeholderDnsConfig);

        setCertificate(renewedCertificate);
        toast({
            title: "Renewal Successful!",
            description: `Certificate for ${domain} has been renewed.`,
            variant: "default",
        });

     } catch (renewalError) {
        console.error("Certificate renewal failed:", renewalError);
        const errorMessage = renewalError instanceof Error ? renewalError.message : "An unknown error occurred during renewal.";
        setError(errorMessage);
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
            CertMagic securely stores your DNS credentials (encrypted) to automatically handle the DNS-01 challenge required for certificate renewals every 90 days. This ensures your site remains secure without manual intervention. HTTP-01 challenge requires your server to be configured appropriately.
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
       />
    </div>
  );
}
