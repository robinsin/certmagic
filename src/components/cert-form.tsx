
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Globe, KeyRound, Loader2, Server, Sparkles, FileCode, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { generateCertificate, type DnsConfig, type CertificateResult, type HttpChallengePending, type Certificate } from "@/services/cert-magic";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ChallengeType = z.enum(["dns-01", "http-01"]);

const formSchema = z.object({
  domain: z.string().min(3, {
    message: "Domain must be at least 3 characters.",
  }).refine((value) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value), {
    message: "Invalid domain format. Use example.com or sub.example.com.",
  }).refine(value => !value.startsWith('.') && !value.endsWith('.'), {
      message: "Domain cannot start or end with a dot.",
  }).refine(value => !value.includes('..'), {
      message: "Domain cannot contain consecutive dots.",
  }),
  challengeType: ChallengeType.default("dns-01"),
  dnsProvider: z.string().optional(),
  apiKey: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.challengeType === "dns-01") {
    if (!data.dnsProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a DNS provider for DNS-01 challenge.",
        path: ["dnsProvider"],
      });
    }
    // Basic check - real validation happens server-side
    if (!data.apiKey || data.apiKey.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API Key is required for DNS-01 challenge.",
        path: ["apiKey"],
      });
    }
  }
});


type CertFormValues = z.infer<typeof formSchema>;

interface CertFormProps {
  onCertificateGenerated: (result: CertificateResult | null, error?: string) => void; // Updated type
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Supported DNS providers (ensure backend supports these identifiers)
const dnsProviders = [
  { value: "cloudflare", label: "Cloudflare" },
  { value: "route53", label: "AWS Route 53" },
  { value: "godaddy", label: "GoDaddy" },
  // Add more as backend support is added
  // { value: "other", label: "Other (Manual/Unsupported)" },
];

export function CertForm({ onCertificateGenerated, isLoading, setIsLoading }: CertFormProps) {
  const { toast } = useToast();

  const form = useForm<CertFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      domain: "",
      challengeType: "dns-01",
      dnsProvider: "",
      apiKey: "",
    },
    mode: "onChange", // Validate on change for better UX
  });

  const watchedChallengeType = form.watch("challengeType");

  async function onSubmit(values: CertFormValues) {
    setIsLoading(true);
    onCertificateGenerated(null); // Clear previous status

    let dnsConfig: DnsConfig | undefined = undefined;
    if (values.challengeType === "dns-01") {
        // Validation should catch this, but double-check
        if (!values.dnsProvider || !values.apiKey) {
             toast({
                title: "Missing Information",
                description: "DNS Provider and API Key are required for DNS-01.",
                variant: "destructive",
            });
            setIsLoading(false);
            return;
        }
      dnsConfig = {
        provider: values.dnsProvider,
        apiKey: values.apiKey,
      };
    }

    toast({
        title: "Requesting Certificate...",
        description: `Sending request for ${values.domain} using ${values.challengeType.toUpperCase()}.`,
    });

    try {
      // Call the service function which now calls the backend API
      const result = await generateCertificate(values.domain, values.challengeType, dnsConfig);

      let toastTitle = "";
      let toastDescription = "";
      let toastVariant: "default" | "destructive" = "default";

      if (result.status === 'issued') {
          toastTitle = "Success!";
          toastDescription = result.message || `Certificate generated successfully for ${values.domain}.`;
          toastVariant = "default";
          form.reset(); // Reset form only on final success
      } else if (result.status === 'http-01-pending') {
          toastTitle = "Action Required";
          toastDescription = result.message || `HTTP-01 challenge initiated. Please follow instructions displayed below.`;
          toastVariant = "default"; // Use default for pending, maybe add a specific style later
      }

      toast({
        title: toastTitle,
        description: toastDescription,
        variant: toastVariant,
        duration: 15000, // Give more time to read potential instructions
      });
      onCertificateGenerated(result);

    } catch (error) {
      console.error("Certificate generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        title: "Error Generating Certificate",
        description: errorMessage,
        variant: "destructive",
      });
      onCertificateGenerated(null, errorMessage);
    } finally {
      // Only set loading false if it's not a pending state,
      // as user action (Verify) will follow.
      // Let the CertManager handle loading state across steps.
      // setIsLoading(false); -- Handled by CertManager now
    }
  }

  return (
    <Card className="w-full max-w-2xl shadow-lg border border-border rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl text-primary">
          <Sparkles className="h-6 w-6" /> Generate Certificate
        </CardTitle>
        <CardDescription>
          Provide your domain and choose a verification method. CertMagic will interact with Let's Encrypt via our backend.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-5 pt-5">
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1 font-semibold"><Globe size={16} /> Domain Name</FormLabel>
                  <FormControl>
                    <Input placeholder="yourdomain.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    The fully qualified domain name (FQDN) you want to secure.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

             <FormField
              control={form.control}
              name="challengeType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                   <FormLabel className="font-semibold">Verification Method</FormLabel>
                   <FormControl>
                     <RadioGroup
                       onValueChange={field.onChange}
                       defaultValue={field.value}
                       className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-4"
                    >
                       <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-md flex-1 hover:border-primary transition-colors">
                         <FormControl>
                           <RadioGroupItem value="dns-01" id="dns-01" />
                         </FormControl>
                         <FormLabel htmlFor="dns-01" className="font-normal flex items-center gap-1 cursor-pointer">
                          <Server size={16} /> DNS-01 (Recommended)
                         </FormLabel>
                       </FormItem>
                       <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-md flex-1 hover:border-primary transition-colors">
                         <FormControl>
                           <RadioGroupItem value="http-01" id="http-01" />
                         </FormControl>
                         <FormLabel htmlFor="http-01" className="font-normal flex items-center gap-1 cursor-pointer">
                          <FileCode size={16} /> HTTP-01
                         </FormLabel>
                       </FormItem>
                     </RadioGroup>
                   </FormControl>
                    <FormDescription>
                      {watchedChallengeType === 'dns-01'
                        ? 'Requires API access to your DNS provider for automated verification and renewal.'
                        : 'Requires your web server to serve a specific file. May require manual steps for setup and renewal.'}
                    </FormDescription>
                   <FormMessage />
                 </FormItem>
               )}
             />


            {watchedChallengeType === "dns-01" && (
              <div className="space-y-5 p-4 border border-dashed border-primary/50 rounded-md bg-card">
                 <FormField
                  control={form.control}
                  name="dnsProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1 font-semibold"><Server size={16} /> DNS Provider</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select DNS Provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dnsProviders.map((provider) => (
                             <SelectItem key={provider.value} value={provider.value}>
                                {provider.label}
                             </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the service managing your domain's DNS records.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1 font-semibold"><KeyRound size={16} /> DNS Provider API Key / Secret</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter API Key or Secret" {...field} />
                      </FormControl>
                       <FormDescription>
                         Needed to automatically create verification records. Handled securely by our backend.
                       </FormDescription>
                       <FormMessage />
                    </FormItem>
                  )}
                />
                 <Alert variant="default" className="bg-secondary/50 border-primary/20">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    <AlertTitle className="text-primary">API Key Security</AlertTitle>
                    <AlertDescription className="text-xs">
                        Ensure the API key has the minimum required permissions (usually DNS record management for the specific zone). Your key is transmitted securely to our backend and used only for certificate operations. Consider creating specific, limited-scope keys if possible.
                    </AlertDescription>
                 </Alert>
              </div>
            )}

             {watchedChallengeType === "http-01" && (
                 <Alert variant="default" className="bg-secondary/50 border-blue-500/30">
                     <AlertTriangle className="h-4 w-4 text-accent" />
                     <AlertTitle className="text-accent">HTTP-01 Requirements</AlertTitle>
                     <AlertDescription className="text-xs">
                         Your web server for `{form.getValues("domain") || 'yourdomain.com'}` must be publicly accessible on port 80 and configured to serve files from the `/.well-known/acme-challenge/` directory. The backend will provide the file content/name during verification. Auto-renewal may require manual intervention if server setup changes.
                     </AlertDescription>
                 </Alert>
             )}

          </CardContent>
          <CardFooter>
             {/* Use accent color for primary action button */}
            <Button type="submit" disabled={isLoading || !form.formState.isValid} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 text-base">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing Request...
                </>
              ) : (
                <>
                 <Sparkles className="mr-2 h-5 w-5" />
                 Generate Certificate
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
