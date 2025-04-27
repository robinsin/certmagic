import CertManager from '@/components/cert-manager';
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-24 bg-background">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-center md:text-left mb-12">
        <h1 className="text-4xl font-bold text-primary mb-2">CertMagic</h1>
        <p className="text-lg text-muted-foreground">
          Effortlessly Generate & Renew Let's Encrypt Certificates
        </p>
      </div>

      <CertManager />
      <Toaster />

      <footer className="mt-16 text-center text-sm text-muted-foreground">
          Powered by CertMagic - Secure Certificates Made Simple.
          <p className="text-xs mt-1">Note: This is a frontend interface. Actual certificate operations occur on a secure backend.</p>
      </footer>
    </main>
  );
}
