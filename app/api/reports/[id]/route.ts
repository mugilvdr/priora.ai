import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { default: prisma } = await import('@/lib/db/prisma');
  const search = await prisma.search.findFirst({
    where: { id: params.id, userId },
    include: { report: true },
  });

  if (!search) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: search.id,
    title: search.title,
    status: search.status,
    progress: search.progress,
    createdAt: search.createdAt,
    report: search.report
      ? {
          patentabilityMd: search.report.patentabilityMd,
          clientReportMd: search.report.clientReportMd,
          patentSourcesMd: search.report.patentSourcesMd ?? '',
          nplSourcesMd: search.report.nplSourcesMd ?? '',
          referencesFound: search.report.referencesFound,
          patentabilityRating: search.report.patentabilityRating,
        }
      : null,
  });
}
