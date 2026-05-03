'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import SearchProgress from '@/components/SearchProgress';
import type { WebSearchProvider } from '@/lib/search/web-search';
import type { AIModel } from '@/lib/llm/providers';
import type { Jurisdiction } from '@/lib/llm/groq';

export default function DashboardPage() {
  const router = useRouter();
  const [searchId, setSearchId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSearchSubmit = async (
    description: string,
    webSearchProvider: WebSearchProvider,
    aiModel: AIModel,
    modelApiKey: string,
    jurisdiction: Jurisdiction
  ) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, webSearchProvider, aiModel, modelApiKey, jurisdiction }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start search');
      }

      const data = await response.json();
      setSearchId(data.searchId);
    } catch (err) {
      console.error('Search submission error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to start search. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchComplete = (completedId: string) => {
    router.push(`/dashboard/reports/${completedId}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {!searchId ? (
        <>
          {/* Page Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">
              New Prior Art Search
            </h1>
            <p className="text-slate-400 text-base">
              Describe your invention to search across 8+ patent databases and generate a comprehensive patentability report.
            </p>
          </div>

          {submitError && (
            <div className="mb-6 flex items-start gap-3 bg-red-950/40 border border-red-800/60 rounded-xl px-4 py-3 text-sm text-red-300">
              <span className="mt-0.5 text-red-400">⚠</span>
              <span>{submitError}</span>
            </div>
          )}

          <SearchForm onSubmit={handleSearchSubmit} isLoading={isSubmitting} />

          {/* Info Cards */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {infoCards.map((card, i) => (
              <div
                key={i}
                className="bg-[#111827] border border-[#1e293b] rounded-xl p-4"
              >
                <div className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-medium">
                  {card.label}
                </div>
                <div className="text-white font-semibold text-sm">{card.value}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <SearchProgress
          searchId={searchId}
          onComplete={handleSearchComplete}
        />
      )}
    </div>
  );
}

const infoCards = [
  { label: 'Sources Searched', value: 'USPTO, EPO, WIPO, arXiv, Semantic Scholar, Google Patents' },
  { label: 'Average Search Time', value: '2–4 minutes' },
  { label: 'Report Format', value: 'Full Patentability + Client-Ready Supplementary' },
];
