import Link from 'next/link';
import { SignUpButton } from '@clerk/nextjs';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with AI prior art search.',
    features: [
      '3 searches per day',
      'USPTO, EPO, WIPO coverage',
      'AI patentability report',
      'Client-ready supplementary report',
      'PDF download',
    ],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: 'per month',
    description: 'For active inventors and IP professionals.',
    features: [
      'Unlimited searches',
      '20+ database sources',
      'Priority AI processing',
      'Advanced claim strategy',
      'Email report delivery',
      'Search history & exports',
    ],
    cta: 'Start Pro Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For law firms and IP departments.',
    features: [
      'Everything in Pro',
      'Team seats & access control',
      'API access',
      'Custom branding on reports',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <nav className="border-b border-[#1e293b] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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

      <main className="flex-1 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-bold text-white mb-4">Simple, transparent pricing</h1>
            <p className="text-slate-400 text-lg">Start free. Upgrade when you need more.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  plan.highlight
                    ? 'bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-900/20'
                    : 'bg-[#111827] border-[#1e293b]'
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
                    Most Popular
                  </div>
                )}
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-white mb-1">{plan.name}</h2>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    {plan.period && (
                      <span className="text-slate-400 text-sm">/{plan.period}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">{plan.description}</p>
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.name === 'Free' ? (
                  <SignUpButton mode="modal">
                    <button className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#1e293b] hover:bg-[#273448] text-white border border-[#334155] transition-colors">
                      {plan.cta}
                    </button>
                  </SignUpButton>
                ) : plan.name === 'Pro' ? (
                  <SignUpButton mode="modal">
                    <button className="w-full py-2.5 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                      {plan.cta}
                    </button>
                  </SignUpButton>
                ) : (
                  <a
                    href="mailto:mugilvannan@myipstrategy.com?subject=Priora.AI Enterprise"
                    className="block w-full py-2.5 rounded-xl font-semibold text-sm bg-[#1e293b] hover:bg-[#273448] text-white border border-[#334155] transition-colors text-center"
                  >
                    {plan.cta}
                  </a>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-slate-500 text-sm mt-10">
            Pro and Enterprise billing coming soon. Sign up free to reserve early access.
          </p>
        </div>
      </main>

      <footer className="border-t border-[#1e293b] px-6 py-6 text-center text-slate-500 text-sm">
        © {new Date().getFullYear()} Priora.AI — All rights reserved
      </footer>
    </div>
  );
}
