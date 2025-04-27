
"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, FileText, Key, CalendarDays, RefreshCw, Server, FileCode, Loader2, Copy, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type Certificate } from "@/services/cert-magic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea"; // For displaying PEM data
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CertStatusProps {
  certificate: Certificate | null;
  error?: string | null;
  onRenew?: (certificate: Pick<Certificate, 'domain'>) => void; // Only need domain for renewal API call
  isLoading?: boolean; // To disable renew button during any loading state
}

// Helper component for copy-to-clipboard
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const { toast } = useToast();

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            toast({ title: "Copied to clipboard!" });
            setTimeout(() => setCopied(false), 2000); // Reset icon after 2 seconds
        } catch (err) {
            console.error("Failed to copy:", err);
            toast({ title: "Failed to copy", description: "Could not copy text to clipboard.", variant: "destructive" });
        }
    };

    return (
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-7 w-7 ml-2 absolute right-1 top-1 text-muted-foreground hover:text-foreground" aria-label="Copy to clipboard">
            {copied ? <ClipboardCheck size={16} className="text-primary" /> : <Copy size={16} />}
        </Button>
    );
};


export function CertStatus({ certificate, error, onRenew, isLoading = false }: CertStatusProps) {
  const { toast } = useToast();

  if (!certificate && !error) {
    return null; // Don't render anything if there's no status yet
  }

  const getExpiryDateString = (cert: Certificate | null) => {
    if (!cert?.expiresAt) return "N/A";
    const date = new Date(cert.expiresAt);
    return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const handleRenewClick = () => {
    if (onRenew && certificate) {
      toast({
        title: "Initiating Renewal...",
        description: `Requesting renewal for ${certificate.domain}.`,
      });
      onRenew({ domain: certificate.domain }); // Pass only domain
    }
  }

  return (
    <Card className="w-full max-w-2xl mt-8 shadow-lg border border-border rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {error ? (
            <>
              <AlertCircle className="text-destructive h-6 w-6" /> Request Failed
            </>
          ) : (
            <>
              <CheckCircle2 className="text-primary h-6 w-6" /> Certificate Ready
            </>
          )}
        </CardTitle>
        <CardDescription>
          {error
            ? "There was an issue processing your certificate request."
            : certificate
            ? `Details for ${certificate.domain}. ${certificate.challengeType === 'dns-01' ? 'Auto-renewal active via backend.' : 'Manual renewal needed for HTTP-01.'}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : certificate ? (
          <>
            {certificate.message && (
                 <Alert variant={certificate.challengeType === 'http-01' ? 'default' : 'default'} className={certificate.challengeType === 'http-01' ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-green-50 border-green-300 text-green-800"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{certificate.challengeType === 'http-01' ? 'Action Required (HTTP-01)' : 'Information (DNS-01)'}</AlertTitle>
                    <AlertDescription className="text-xs">{certificate.message}</AlertDescription>
                 </Alert>
            )}
            <div className="flex items-center justify-between text-sm border-b pb-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                 {certificate.challengeType === 'dns-01' ? <Server size={16} /> : <FileCode size={16} />}
                 Challenge Type:
                </span>
                <span className="font-medium uppercase">{certificate.challengeType}</span>
            </div>
             <div className="flex items-center justify-between text-sm border-b pb-2">
               <span className="flex items-center gap-2 text-muted-foreground">
                 <CalendarDays size={16} />
                 Expires On:
               </span>
               <span className="font-medium">{getExpiryDateString(certificate)}</span>
             </div>

            {/* Certificate PEM */}
            <div className="space-y-1 relative">
                <Label htmlFor="certPem" className="flex items-center gap-1 text-sm font-semibold"><FileText size={16} /> Certificate (PEM)</Label>
                <CopyButton textToCopy={certificate.certificatePem} />
                <Textarea
                    id="certPem"
                    readOnly
                    value={certificate.certificatePem}
                    className="h-40 font-mono text-xs bg-muted border rounded-md p-2"
                    rows={8}
                />
                <FormDescription className="text-xs">Your certificate chain (server certificate + intermediate CAs).</FormDescription>
            </div>

             {/* Private Key PEM - WITH SECURITY WARNING */}
             <div className="space-y-1 relative">
                 <Label htmlFor="privKeyPem" className="flex items-center gap-1 text-sm font-semibold"><Key size={16} /> Private Key (PEM)</Label>
                <CopyButton textToCopy={certificate.privateKeyPem} />
                 <Textarea
                    id="privKeyPem"
                    readOnly
                    value={certificate.privateKeyPem}
                    className="h-40 font-mono text-xs bg-muted border rounded-md p-2"
                    rows={8}
                 />
                 <FormDescription className="text-xs text-destructive font-medium">
                     WARNING: Handle this key securely. Do not share it. It should ideally remain on your server.
                 </FormDescription>
             </div>


          </>
        ) : null}
      </CardContent>
       {certificate && !error && onRenew && (
          <CardFooter className="pt-4 border-t mt-4">
               <div className="w-full">
                  <Button variant="outline" size="default" onClick={handleRenewClick} disabled={isLoading} className="w-full md:w-auto">
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      {isLoading ? 'Renewing...' : 'Renew Manually Now'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center md:text-left">
                      {certificate.challengeType === 'dns-01'
                       ? 'Backend handles auto-renewal. Use this button only for immediate/emergency renewal.'
                       : 'HTTP-01 auto-renewal depends on server setup. Use this button to attempt manual renewal.'}
                  </p>
               </div>
          </CardFooter>
       )}
    </Card>
  );
}

// Helper components needed by CertStatus
const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={`block text-sm font-medium text-foreground ${className}`} {...props} />
);

const FormDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...props }) => (
  <p className={`text-sm text-muted-foreground ${className}`} {...props} />
);
