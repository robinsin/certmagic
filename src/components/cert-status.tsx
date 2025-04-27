"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, FileText, Key, CalendarDays, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Certificate } from "@/services/cert-magic";
import { Button } from "@/components/ui/button";

interface CertStatusProps {
  certificate: Certificate | null;
  error?: string | null;
  onRenew?: (domain: string) => void; // Optional renew handler
}

export function CertStatus({ certificate, error, onRenew }: CertStatusProps) {
  if (!certificate && !error) {
    return null; // Don't render anything if there's no status yet
  }

  const getExpiryDate = () => {
    const now = new Date();
    // Let's Encrypt certs are typically valid for 90 days
    now.setDate(now.getDate() + 90);
    return now.toLocaleDateString();
  }

  return (
    <Card className="w-full max-w-2xl mt-8 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {error ? (
            <>
              <AlertCircle className="text-destructive" /> Generation Failed
            </>
          ) : (
            <>
              <CheckCircle2 className="text-primary" /> Certificate Ready
            </>
          )}
        </CardTitle>
        <CardDescription>
          {error ? "There was an issue generating the certificate." : `Certificate details for ${certificate?.domain}. Auto-renewal is active.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="text-destructive-foreground bg-destructive p-3 rounded-md">
            <p><strong>Error:</strong> {error}</p>
          </div>
        ) : certificate ? (
          <>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-muted-foreground" />
              <span>Certificate Path:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded">{certificate.certificatePath}</code>
            </div>
            <div className="flex items-center gap-2">
              <Key size={16} className="text-muted-foreground" />
              <span>Private Key Path:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded">{certificate.privateKeyPath}</code>
            </div>
             <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-muted-foreground" />
              <span>Estimated Expiry:</span>
              <span className="font-medium">{getExpiryDate()}</span>
            </div>
            {onRenew && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => onRenew(certificate.domain)}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Renew Now (Manual Trigger)
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Auto-renewal is scheduled. Use this button for immediate renewal if needed.</p>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
