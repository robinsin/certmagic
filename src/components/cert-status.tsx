
"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, FileText, Key, CalendarDays, RefreshCw, Server, FileCode, Loader2, Copy, ClipboardCheck, HelpCircle, CloudUpload } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type Certificate, type HttpChallengePending, type CertificateResult } from "@/services/cert-magic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label"; // Import Label
import { Input } from "@/components/ui/input"; // Import Input
import { cn } from "@/lib/utils"; // Import cn utility

interface CertStatusProps {
  certResult: CertificateResult | null; // Can be issued cert or pending challenge
  error?: string | null;
  onRenew?: (certificate: Pick<Certificate, 'domain'>) => void;
  onVerifyHttp?: (pendingChallenge: HttpChallengePending) => void; // Handler for HTTP verification
  isLoading?: boolean;
}

// Helper component for copy-to-clipboard
const CopyButton: React.FC<{ textToCopy: string; label?: string }> = ({ textToCopy, label = "Copy to clipboard" }) => {
    const [copied, setCopied] = React.useState(false);
    const { toast } = useToast();

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            toast({ title: "Copied!" });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
            toast({ title: "Failed to copy", description: "Could not copy text.", variant: "destructive" });
        }
    };

    return (
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6 ml-1 absolute right-1 top-1 text-muted-foreground hover:text-foreground z-10" aria-label={label}>
            {copied ? <ClipboardCheck size={14} className="text-primary" /> : <Copy size={14} />}
        </Button>
    );
};


export function CertStatus({ certResult, error, onRenew, onVerifyHttp, isLoading = false }: CertStatusProps) {
  const { toast } = useToast();

  if (!certResult && !error) {
    return null; // Don't render anything if there's no status yet
  }

  // Type guards for easier handling
  const isIssued = (res: CertificateResult | null): res is Certificate => res?.status === 'issued';
  const isPendingHttp = (res: CertificateResult | null): res is HttpChallengePending => res?.status === 'http-01-pending';

  const getExpiryDateString = (cert: Certificate | null) => {
    if (!cert?.expiresAt) return "N/A";
    const date = new Date(cert.expiresAt);
    return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const handleRenewClick = () => {
    if (onRenew && isIssued(certResult)) { // Can only renew issued certs
      toast({
        title: "Initiating Renewal...",
        description: `Requesting renewal for ${certResult.domain}.`,
      });
      onRenew({ domain: certResult.domain });
    }
  }

  const handleVerifyClick = () => {
      if (onVerifyHttp && isPendingHttp(certResult)) {
           toast({
               title: "Initiating Verification...",
               description: `Asking backend to verify challenge for ${certResult.domain}.`,
           });
           onVerifyHttp(certResult);
      }
  }

  // Determine title and description based on state
  let cardTitleIcon = null;
  let cardTitleText = "";
  let cardDescriptionText = "";

  if (error) {
      cardTitleIcon = <AlertCircle className="text-destructive h-6 w-6" />;
      cardTitleText = "Request Failed";
      cardDescriptionText = "There was an issue processing your certificate request.";
  } else if (isIssued(certResult)) {
      cardTitleIcon = <CheckCircle2 className="text-primary h-6 w-6" />;
      cardTitleText = "Certificate Ready";
      cardDescriptionText = `Details for ${certResult.domain}. ${certResult.challengeType === 'dns-01' ? 'Auto-renewal active via backend.' : 'Manual renewal may be needed for HTTP-01.'}`;
  } else if (isPendingHttp(certResult)) {
      cardTitleIcon = <HelpCircle className="text-accent h-6 w-6" />;
      cardTitleText = "Action Required: HTTP Challenge";
      cardDescriptionText = `Manual setup needed for ${certResult.domain}. Follow the instructions below.`;
  }


  return (
    <Card className="w-full max-w-2xl mt-8 shadow-lg border border-border rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {cardTitleIcon} {cardTitleText}
        </CardTitle>
        {cardDescriptionText && <CardDescription>{cardDescriptionText}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Display Issued Certificate Details */}
        {isIssued(certResult) && (
          <>
            {certResult.message && (
                 <Alert variant={certResult.challengeType === 'http-01' ? 'default' : 'default'} className={certResult.challengeType === 'http-01' ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300" : "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{certResult.challengeType === 'http-01' ? 'Information (HTTP-01)' : 'Information (DNS-01)'}</AlertTitle>
                    <AlertDescription className="text-xs">{certResult.message}</AlertDescription>
                 </Alert>
            )}
            <div className="flex items-center justify-between text-sm border-b pb-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                 {certResult.challengeType === 'dns-01' ? <Server size={16} /> : <FileCode size={16} />}
                 Challenge Type:
                </span>
                <span className="font-medium uppercase">{certResult.challengeType}</span>
            </div>
             <div className="flex items-center justify-between text-sm border-b pb-2">
               <span className="flex items-center gap-2 text-muted-foreground">
                 <CalendarDays size={16} />
                 Expires On:
               </span>
               <span className="font-medium">{getExpiryDateString(certResult)}</span>
             </div>

            <div className="space-y-1 relative">
                <Label htmlFor="certPem" className="flex items-center gap-1 text-sm font-semibold"><FileText size={16} /> Certificate (PEM)</Label>
                <CopyButton textToCopy={certResult.certificatePem} label="Copy Certificate PEM" />
                <Textarea id="certPem" readOnly value={certResult.certificatePem} className="h-40 font-mono text-xs bg-muted border rounded-md p-2 pr-8" rows={8} />
                <FormDescription className="text-xs">Your certificate chain.</FormDescription>
            </div>

             <div className="space-y-1 relative">
                 <Label htmlFor="privKeyPem" className="flex items-center gap-1 text-sm font-semibold"><Key size={16} /> Private Key (PEM)</Label>
                <CopyButton textToCopy={certResult.privateKeyPem} label="Copy Private Key PEM" />
                 <Textarea id="privKeyPem" readOnly value={certResult.privateKeyPem} className="h-40 font-mono text-xs bg-muted border rounded-md p-2 pr-8" rows={8} />
                 <FormDescription className="text-xs text-destructive font-medium">
                     WARNING: Handle this key securely. Do not share it. Store securely on your server.
                 </FormDescription>
             </div>
          </>
        )}

        {/* Display Pending HTTP Challenge Details */}
        {isPendingHttp(certResult) && (
            <div className="space-y-4 p-4 border border-dashed border-accent rounded-md bg-accent/5">
                <Alert variant="default" className="bg-accent/10 border-accent/30 text-accent-foreground dark:bg-accent/20 dark:border-accent/40">
                    <CloudUpload className="h-4 w-4 text-accent" />
                    <AlertTitle className="text-accent font-semibold">Manual Setup Required</AlertTitle>
                    <AlertDescription className="text-xs">
                       {certResult.message || `To verify ownership of ${certResult.domain}, please create the following file on your web server accessible via HTTP:`}
                    </AlertDescription>
                </Alert>

                 <div className="space-y-1 relative">
                    <Label htmlFor="httpPath" className="flex items-center gap-1 text-sm font-semibold">File Path:</Label>
                     <CopyButton textToCopy={`/.well-known/acme-challenge/${certResult.token}`} label="Copy File Path" />
                    <Input id="httpPath" readOnly value={`http://${certResult.domain}/.well-known/acme-challenge/${certResult.token}`} className="font-mono text-xs bg-muted pr-8" />
                     <FormDescription className="text-xs">Create directories if they don't exist. Must be served over HTTP (port 80).</FormDescription>
                </div>
                <div className="space-y-1 relative">
                     <Label htmlFor="httpContent" className="flex items-center gap-1 text-sm font-semibold">File Content:</Label>
                     <CopyButton textToCopy={certResult.keyAuthorization} label="Copy File Content" />
                     <Textarea id="httpContent" readOnly value={certResult.keyAuthorization} className="h-20 font-mono text-xs bg-muted p-2 pr-8" rows={3} />
                    <FormDescription className="text-xs">Place this exact text content into the file named above.</FormDescription>
                 </div>

                 <p className="text-sm text-foreground pt-2">
                     Once the file is created and accessible, click the "Verify" button below. Let's Encrypt will check this URL.
                 </p>

            </div>
        )}

      </CardContent>

       {/* Footer Actions */}
       <CardFooter className="pt-4 border-t mt-4 flex flex-col md:flex-row md:justify-between items-center gap-4">
            {/* Renewal Button (only for issued certs) */}
            {isIssued(certResult) && onRenew && (
               <div className="w-full md:w-auto">
                  <Button variant="outline" size="default" onClick={handleRenewClick} disabled={isLoading} className="w-full">
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      {isLoading ? 'Processing...' : 'Renew Manually Now'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center md:text-left">
                      {certResult.challengeType === 'dns-01'
                       ? 'Backend handles auto-renewal. Use only for immediate renewal.'
                       : 'HTTP-01 auto-renewal depends on server setup. Use to attempt manual renewal.'}
                  </p>
               </div>
           )}

            {/* Verify Button (only for pending HTTP challenges) */}
            {isPendingHttp(certResult) && onVerifyHttp && (
                <div className="w-full md:w-auto">
                    <Button variant="default" size="default" onClick={handleVerifyClick} disabled={isLoading} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {isLoading ? 'Verifying...' : 'Verify Challenge File'}
                    </Button>
                     <p className="text-xs text-muted-foreground mt-2 text-center md:text-left">
                        Click after you have created the challenge file on your server.
                    </p>
                </div>
            )}

            {/* Placeholder if no actions are available */}
            {!isIssued(certResult) && !isPendingHttp(certResult) && !error && (
                 <p className="text-sm text-muted-foreground">Submit the form above to generate a certificate.</p>
            )}
             {/* Error message doesn't usually need an action */}
            {error && !isPendingHttp(certResult) && ( // Don't show this if there's an error *and* a pending state (e.g., verify failed)
                <p className="text-sm text-destructive">Please resolve the error and try generating again.</p>
            )}
       </CardFooter>
    </Card>
  );
}


// Helper component for FormDescription (needed by CertStatus if not imported globally)
const FormDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...props }) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);
FormDescription.displayName = "FormDescription"
    
