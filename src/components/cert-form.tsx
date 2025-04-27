"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Globe, KeyRound, Loader2, Server, Sparkles } from "lucide-react";

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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { generateCertificate, type DnsConfig, type Certificate } from "@/services/cert-magic";


const formSchema = z.object({
  domain: z.string().min(3, {
    message: "Domain must be at least 3 characters.",
  }).refine((value) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value), {
    message: "Invalid domain format.",
  }),
  dnsProvider: z.string().min(1, { message: "Please select a DNS provider." }),
  apiKey: z.string().min(10, { // Basic length check, real validation depends on provider
    message: "API Key seems too short.",
  }),
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
      dnsProvider: "",
      apiKey: "",
    },
  });

  async function onSubmit(values: CertFormValues) {
    setIsLoading(true);
    onCertificateGenerated(null); // Clear previous status

    const dnsConfig: DnsConfig = {
      provider: values.dnsProvider,
      apiKey: values.apiKey,
    };

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Call the service function (replace with actual API call when ready)
      const certificate = await generateCertificate(values.domain, dnsConfig);

      toast({
        title: "Success!",
        description: `Certificate generated for ${values.domain}.`,
        variant: "default", // Use default variant for success which applies primary color styling
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
          Enter your domain and DNS provider details to generate a Let's Encrypt certificate.
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
                    Choose the provider where your domain's DNS is managed. DNS-01 challenge requires API access.
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
