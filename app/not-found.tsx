import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-6">
        <span className="text-white font-bold text-lg">P</span>
      </div>
      <h1 className="text-5xl font-bold text-white mb-3">404</h1>
      <p className="text-slate-400 text-lg mb-8">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
      >
        Back to Priora.AI
      </Link>
    </div>
  );
}
