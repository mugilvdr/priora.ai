import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Priora.AI',
  description: 'Privacy policy for Priora.AI AI-powered patent prior art search.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <nav className="border-b border-[#1e293b] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-bold text-xl text-white tracking-tight">Priora.AI</span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            ← Back
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-6 py-16">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-slate-500 text-sm mb-10">Last updated: May 2026</p>

          <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Information We Collect</h2>
              <p className="mb-3">When you use Priora.AI, we collect the following information:</p>
              <ul className="list-disc list-outside pl-5 space-y-1.5">
                <li><strong className="text-slate-100">Account Information:</strong> Your email address and name, provided through our authentication partner Clerk.</li>
                <li><strong className="text-slate-100">Invention Descriptions:</strong> The text you submit for prior art searches. These are stored in our database to generate and display your reports.</li>
                <li><strong className="text-slate-100">Search Results & Reports:</strong> AI-generated patentability and supplementary reports produced from your searches.</li>
                <li><strong className="text-slate-100">Usage Data:</strong> Search counts, timestamps, and selected AI model preferences.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. How We Use Your Information</h2>
              <ul className="list-disc list-outside pl-5 space-y-1.5">
                <li>To perform prior art searches and generate patentability reports.</li>
                <li>To maintain your search history and provide access to past reports.</li>
                <li>To enforce usage limits and prevent abuse of our service.</li>
                <li>To improve the quality of our search algorithms and report generation.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. Third-Party Services</h2>
              <p className="mb-3">We integrate with the following third-party services to provide our product:</p>
              <ul className="list-disc list-outside pl-5 space-y-1.5">
                <li><strong className="text-slate-100">Clerk</strong> — Authentication and user management.</li>
                <li><strong className="text-slate-100">AI Model Providers</strong> (Groq, Google, Anthropic, OpenAI) — Invention descriptions are sent to the selected AI model for parameter extraction and report generation. Each provider has its own privacy policy.</li>
                <li><strong className="text-slate-100">Patent Databases</strong> (USPTO, PatentsView, EPO, WIPO, arXiv, Semantic Scholar, OpenAlex) — Search queries derived from your invention description are sent to these public databases.</li>
                <li><strong className="text-slate-100">Vercel</strong> — Application hosting and serverless compute.</li>
                <li><strong className="text-slate-100">Neon / Supabase</strong> — PostgreSQL database hosting.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. API Keys</h2>
              <p>If you provide your own AI model API key (e.g., for Gemini, Claude, or GPT-4o), the key is stored only in your browser&apos;s local storage and transmitted to our server only for the duration of a single search request. We do <strong className="text-slate-100">not</strong> store your API keys in our database.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Data Retention</h2>
              <p>Your search history and generated reports are retained indefinitely while your account is active. You may request deletion of your data by contacting us at the email below.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Data Security</h2>
              <p>We use industry-standard security practices including encrypted database connections (TLS/SSL), authentication via Clerk, and server-side authorization checks. However, no system is perfectly secure, and we cannot guarantee absolute data protection.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Confidentiality of Inventions</h2>
              <p className="mb-3">
                <strong className="text-amber-400">Important:</strong> Invention descriptions you submit are processed by third-party AI models and sent as search queries to public patent databases. While we take reasonable precautions, you should <strong className="text-slate-100">not</strong> submit invention details through this service if absolute confidentiality is required before filing. Consult your patent attorney regarding invention disclosure best practices.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Contact</h2>
              <p>
                For privacy-related inquiries or data deletion requests, contact us at{' '}
                <a href="mailto:mugilvannan@myipstrategy.com" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  mugilvannan@myipstrategy.com
                </a>.
              </p>
            </section>
          </div>
        </article>
      </main>

      <footer className="border-t border-[#1e293b] px-6 py-6 text-center text-slate-500 text-sm">
        © {new Date().getFullYear()} Priora.AI — All rights reserved
      </footer>
    </div>
  );
}
