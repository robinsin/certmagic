import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Changed from Geist to Inter
import './globals.css';
import { cn } from '@/lib/utils'; // Import cn utility

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' }); // Use Inter font

export const metadata: Metadata = {
  title: 'CertMagic - Generate & Renew Let\'s Encrypt Certificates', // Updated title
  description: 'A simple web interface to generate and automatically renew Let\'s Encrypt SSL/TLS certificates using DNS-01 or HTTP-01 challenges via a secure backend.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased', // Apply background and font using cn
          inter.variable // Add font variable
        )}
      >
        {children}
      </body>
    </html>
  );
}
