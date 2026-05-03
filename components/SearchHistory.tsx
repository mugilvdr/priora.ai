'use client';

import Link from 'next/link';

interface SearchRecord {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  createdAt: Date;
  report: {
    patentabilityRating: string;
    referencesFound: number;
  } | null;
}

interface SearchHistoryProps {
  searches: SearchRecord[];
}

export default function SearchHistory({ searches }: SearchHistoryProps) {
  if (searches.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-12 text-center">
        <div className="w-16 h-16 bg-[#1e293b] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No searches yet</h3>
        <p className="text-slate-400 text-sm mb-6">
          Start your first prior art search to see results here.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          New Search
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1e293b]">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Invention
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Date
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Rating
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                References
              </th>
              <th className="px-6 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e293b]">
            {searches.map((search) => (
              <tr key={search.id} className="hover:bg-[#0d1424] transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-white text-sm max-w-xs truncate">
                    {search.title === 'Processing...' ? (
                      <span className="text-slate-500 italic">Processing...</span>
                    ) : (
                      search.title
                    )}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5 max-w-xs truncate">
                    {search.description.substring(0, 80)}...
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                  {new Date(search.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={search.status} progress={search.progress} />
                </td>
                <td className="px-6 py-4">
                  {search.report ? (
                    <RatingBadge rating={search.report.patentabilityRating} />
                  ) : (
                    <span className="text-slate-600 text-sm">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {search.report ? (
                    <span>{search.report.referencesFound} refs</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {search.status === 'completed' ? (
                    <Link
                      href={`/dashboard/reports/${search.id}`}
                      className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-700/50 text-blue-300 hover:text-blue-200 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      View Report
                    </Link>
                  ) : search.status === 'failed' ? (
                    <span className="text-red-400 text-xs">Failed</span>
                  ) : (
                    <Link
                      href="/dashboard"
                      className="px-3 py-1.5 bg-[#1e293b] text-slate-400 rounded-lg text-xs font-medium whitespace-nowrap"
                    >
                      In Progress
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: string; progress: number }) {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
    failed: 'bg-red-900/40 text-red-300 border-red-800/50',
    searching: 'bg-blue-900/40 text-blue-300 border-blue-800/50',
    generating: 'bg-amber-900/40 text-amber-300 border-amber-800/50',
    pending: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  const labels: Record<string, string> = {
    completed: 'Completed',
    failed: 'Failed',
    searching: `Searching ${progress}%`,
    generating: `Generating ${progress}%`,
    pending: 'Pending',
  };

  const style = styles[status] ?? styles.pending;
  const label = labels[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}
    >
      {(status === 'searching' || status === 'generating') && (
        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse mr-1.5"></div>
      )}
      {label}
    </span>
  );
}

function RatingBadge({ rating }: { rating: string }) {
  const upper = rating.toUpperCase();

  if (upper.includes('HIGH') || upper === 'PATENTABLE') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-800/50">
        High
      </span>
    );
  }
  if (upper.includes('MODERATE') || upper.includes('MEDIUM')) {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-800/50">
        Moderate
      </span>
    );
  }
  if (upper.includes('LOW') || upper === 'NOT PATENTABLE') {
    return (
      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-900/40 text-red-300 border border-red-800/50">
        Low
      </span>
    );
  }
  return (
    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
      {rating}
    </span>
  );
}
