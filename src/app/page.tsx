import CertManager from '@/components/cert-manager';
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-24 bg-background">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-sm lg:flex mb-8">
        <h1 className="text-4xl font-bold text-primary">CertMagic</h1>
        <p className="text-muted-foreground">
          Generate & Auto-Renew Let's Encrypt Certificates Effortlessly
        </p>
      </div>

      <CertManager />
      <Toaster />
    </main>
  );
}
