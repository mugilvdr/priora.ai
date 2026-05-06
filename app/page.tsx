import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  SignInButton,
  SignUpButton,
} from '@clerk/nextjs';

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-[#1e293b] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/priovex-logo.png" alt="PrioVex" width={130} height={32} className="object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded border border-[#1e293b] hover:border-slate-600"
            >
              Admin
            </Link>
            <SignInButton mode="modal">
              <button className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">
                Get Started
              </button>
            </SignUpButton>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-blue-950/50 border border-blue-800/50 rounded-full px-4 py-1.5 mb-8">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-blue-300 text-sm font-medium">AI-Powered IP Intelligence</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
            AI-Powered{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">
              Patent Search
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Comprehensive prior art search across USPTO, EPO, WIPO, arXiv and more.
            Instant AI-generated patentability reports — ready for clients and IP filings.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <SignUpButton mode="modal">
              <button className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50">
                Start Free Search
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="px-8 py-3.5 bg-[#111827] hover:bg-[#1e293b] border border-[#1e293b] text-slate-300 hover:text-white rounded-xl font-semibold text-lg transition-all">
                Sign In
              </button>
            </SignInButton>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16">
            {features.map((feature, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-[#111827] border border-[#1e293b] rounded-xl p-4 text-left"
              >
                <div className="w-8 h-8 bg-blue-900/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 text-base">{feature.icon}</span>
                </div>
                <div>
                  <div className="font-semibold text-white text-sm mb-0.5">{feature.title}</div>
                  <div className="text-slate-400 text-sm leading-relaxed">{feature.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Database badges */}
          <div className="text-center">
            <p className="text-slate-500 text-sm mb-4 uppercase tracking-wider font-medium">
              Searches across
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {databases.map((db) => (
                <span
                  key={db}
                  className="px-3 py-1 bg-[#111827] border border-[#1e293b] text-slate-400 text-xs rounded-full font-medium"
                >
                  {db}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e293b] px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/priovex-logo.png" alt="PrioVex" width={90} height={24} className="object-contain" />
          </div>
          <div className="flex items-center gap-4 text-slate-500 text-sm">
            <span>Professional IP intelligence for inventors & attorneys</span>
            <a href="/pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-slate-300 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '🔍',
    title: 'No Paid APIs Required',
    description:
      'Searches USPTO EFTS, EPO Espacenet, WIPO PatentScope, and more — all free public sources.',
  },
  {
    icon: '📊',
    title: '20+ Database Sources',
    description:
      'Covers patents, academic papers, applications, and international filings in a single search.',
  },
  {
    icon: '📄',
    title: 'AI-Generated Reports',
    description:
      'Full patentability analysis with comparison tables, bibliographic data, and observations.',
  },
  {
    icon: '📋',
    title: 'Client-Ready Output',
    description:
      'Supplementary Search Report with claim strategy, prior art analysis, and draft claim language.',
  },
];

const databases = [
  'USPTO Grants',
  'USPTO Applications',
  'PatentsView',
  'EPO Espacenet',
  'WIPO PatentScope',
  'Google Patents',
  'arXiv',
  'Semantic Scholar',
];
