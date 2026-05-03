'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 bg-red-600/20 border border-red-600/40 rounded-xl flex items-center justify-center mb-6">
        <span className="text-red-400 font-bold text-lg">!</span>
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">Something went wrong</h2>
      <p className="text-slate-400 mb-8 max-w-sm">
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
