
"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, FileText, Key, CalendarDays, RefreshCw, Server, FileCode, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Certificate } from "@/services/cert-magic";
import { Button } from "@/components/ui/button";

interface CertStatusProps {
  certificate: Certificate | null;
  error?: string | null;
  onRenew?: (certificate: Certificate) => void; // Pass the full certificate object
  isLoading?: boolean; // Add isLoading prop
}

export function CertStatus({ certificate, error, onRenew, isLoading = false }: CertStatusProps) {
  if (!certificate && !error) {
    return null; // Don't render anything if there's no status yet
  }

  const getExpiryDate = (cert: Certificate | null) => {
    if (!cert?.expiresAt) {
      // Fallback if expiresAt is not set
      const now = new Date();
      now.setDate(now.getDate() + 90); // Assume 90 days
      return now.toLocaleDateString();
    }
    return new Date(cert.expiresAt).toLocaleDateString();
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
          {error ? "There was an issue generating the certificate." : certificate ? `Certificate details for ${certificate.domain}. ${certificate.challengeType === 'dns-01' ? 'Auto-renewal active.' : 'Manual renewal recommended for HTTP-01.'}` : ''}
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
              {certificate.challengeType === 'dns-01' ? <Server size={16} className="text-muted-foreground" /> : <FileCode size={16} className="text-muted-foreground" />}
              <span>Challenge Type:</span>
              <span className="font-medium uppercase">{certificate.challengeType}</span>
            </div>
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
              <span className="font-medium">{getExpiryDate(certificate)}</span>
            </div>
            {onRenew && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => onRenew(certificate)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {isLoading ? 'Renewing...' : 'Renew Now (Manual Trigger)'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  {certificate.challengeType === 'dns-01'
                    ? 'Auto-renewal is scheduled. Use this button for immediate renewal if needed.'
                    : 'HTTP-01 renewal requires server configuration. Use this button to attempt renewal.'}
                </p>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

    