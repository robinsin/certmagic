
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Globe, KeyRound, Loader2, Server, Sparkles, FileCode } from "lucide-react";

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
import { generateCertificate, type DnsConfig, type Certificate } from "@/services/cert-magic";

const ChallengeType = z.enum(["dns-01", "http-01"]);

const formSchema = z.object({
  domain: z.string().min(3, {
    message: "Domain must be at least 3 characters.",
  }).refine((value) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value), {
    message: "Invalid domain format.",
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
    if (!data.apiKey || data.apiKey.length < 10) { // Basic length check
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid API Key is required for DNS-01 challenge.",
        path: ["apiKey"],
      });
    }
  }
});


type CertFormValues = z.infer<typeof formSchema>;

interface CertFormProps {
  onCertificateGenerated: (certificate: Certificate | null, error?: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// TODO: Add more providers as needed
const dnsProviders = [
  { value: "cloudflare", label: "Cloudflare" },
  { value: "route53", label: "AWS Route 53" },
  { value: "godaddy", label: "GoDaddy" },
  { value: "other", label: "Other (Manual/Unsupported)" },
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
  });

  const watchedChallengeType = form.watch("challengeType");

  async function onSubmit(values: CertFormValues) {
    setIsLoading(true);
    onCertificateGenerated(null); // Clear previous status

    let dnsConfig: DnsConfig | undefined = undefined;
    if (values.challengeType === "dns-01") {
        if (!values.dnsProvider || !values.apiKey) {
            // This should ideally be caught by validation, but safeguard here
             toast({
                title: "Missing Information",
                description: "DNS Provider and API Key are required for DNS-01 challenge.",
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

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Call the service function
      const certificate = await generateCertificate(values.domain, values.challengeType, dnsConfig);

      toast({
        title: "Success!",
        description: `Certificate generated for ${values.domain} using ${values.challengeType.toUpperCase()} challenge.`,
        variant: "default",
      });
      onCertificateGenerated(certificate);
      form.reset(); // Reset form on success
    } catch (error) {
      console.error("Certificate generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during certificate generation.";
      toast({
        title: "Error Generating Certificate",
        description: errorMessage,
        variant: "destructive",
      });
      onCertificateGenerated(null, errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Sparkles className="text-primary" /> Generate New Certificate
        </CardTitle>
        <CardDescription>
          Enter your domain and select the challenge type to generate a Let's Encrypt certificate.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1"><Globe size={16} /> Domain Name</FormLabel>
                  <FormControl>
                    <Input placeholder="example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    The domain you want to secure.
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
                  <FormLabel>Challenge Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="dns-01" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1">
                         <Server size={16} /> DNS-01 (Requires API Key)
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="http-01" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-1">
                         <FileCode size={16} /> HTTP-01 (Requires Server Config)
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                   <FormDescription>
                    Choose the method to verify domain ownership. DNS-01 allows full automation. HTTP-01 requires your web server to serve verification files.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />


            {watchedChallengeType === "dns-01" && (
              <>
                 <FormField
                  control={form.control}
                  name="dnsProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Server size={16} /> DNS Provider</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your DNS provider" />
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
                        Choose the provider where your domain's DNS is managed (Required for DNS-01).
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
                      <FormLabel className="flex items-center gap-1"><KeyRound size={16} /> DNS Provider API Key</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter API Key" {...field} />
                      </FormControl>
                      <FormDescription>
                        Required for DNS-01 challenge and auto-renewal. Ensure key has necessary permissions.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                 <Sparkles className="mr-2 h-4 w-4" />
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

    