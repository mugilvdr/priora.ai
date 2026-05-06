import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import ReportViewer from '@/components/ReportViewer';

interface ReportPageProps {
  params: { id: string };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { default: prisma } = await import('@/lib/db/prisma');
  const search = await prisma.search.findFirst({
    where: {
      id: params.id,
      userId,
    },
    include: {
      report: true,
    },
  });

  if (!search) {
    notFound();
  }

  if (search.status !== 'completed' || !search.report) {
    redirect('/dashboard');
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{search.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getRatingStyle(
                  search.report.patentabilityRating
                )}`}
              >
                {search.report.patentabilityRating}
              </span>
              <span className="text-slate-500 text-sm">
                {search.report.referencesFound} references found
              </span>
              <span className="text-slate-500 text-sm">
                {new Date(search.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={`/api/reports/${params.id}/download?type=patentability`}
              download
              className="flex items-center gap-2 px-4 py-2 bg-[#111827] hover:bg-[#1e293b] border border-[#1e293b] text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Full Report
            </a>
            <a
              href={`/api/reports/${params.id}/download?type=client`}
              download
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Client Report
            </a>
          </div>
        </div>
      </div>

      {/* Report Viewer */}
      <ReportViewer
        patentabilityMd={search.report.patentabilityMd}
        clientReportMd={search.report.clientReportMd}
        patentSourcesMd={search.report.patentSourcesMd ?? ''}
        nplSourcesMd={search.report.nplSourcesMd ?? ''}
        searchId={params.id}
      />
    </div>
  );
}

function getRatingStyle(rating: string): string {
  const upper = rating.toUpperCase();
  if (upper.includes('HIGH') || upper === 'PATENTABLE') {
    return 'bg-emerald-900/50 text-emerald-300 border border-emerald-800';
  }
  if (upper.includes('MODERATE') || upper.includes('MEDIUM')) {
    return 'bg-amber-900/50 text-amber-300 border border-amber-800';
  }
  if (upper.includes('LOW') || upper === 'NOT PATENTABLE') {
    return 'bg-red-900/50 text-red-300 border border-red-800';
  }
  return 'bg-slate-800 text-slate-300 border border-slate-700';
}
