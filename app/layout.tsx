import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

// Force dynamic rendering — ClerkProvider requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// which is injected at runtime on Vercel, not available during static prerendering
export const dynamic = 'force-dynamic';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'PrioVex — AI Prior Art Search',
  description:
    'Comprehensive prior art search across USPTO, EPO, WIPO, arXiv and more. Instant AI-generated patentability reports for inventors and IP professionals.',
  keywords: ['patent search', 'prior art', 'patentability', 'USPTO', 'EPO', 'WIPO', 'priovex', 'AI patent search'],
  openGraph: {
    title: 'PrioVex — AI Prior Art Search',
    description: 'AI-powered prior art search across 20+ patent databases. Generate professional patentability reports in minutes.',
    type: 'website',
    url: 'https://priovex.vercel.app',
    siteName: 'PrioVex',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PrioVex — AI Prior Art Search',
    description: 'AI-powered prior art search across 20+ patent databases.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable}>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        </head>
        <body className="min-h-screen bg-[#0a0f1e] text-white antialiased font-sans">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
