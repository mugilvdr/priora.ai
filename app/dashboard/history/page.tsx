import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import SearchHistory from '@/components/SearchHistory';

export default async function HistoryPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { default: prisma } = await import('@/lib/db/prisma');
  const searches = await prisma.search.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      report: {
        select: {
          patentabilityRating: true,
          referencesFound: true,
        },
      },
    },
    take: 50,
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Search History</h1>
        <p className="text-slate-400">
          {searches.length} prior art {searches.length === 1 ? 'search' : 'searches'} completed
        </p>
      </div>
      <SearchHistory searches={searches} />
    </div>
  );
}
