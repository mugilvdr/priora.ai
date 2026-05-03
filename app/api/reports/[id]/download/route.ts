import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type');

  if (!type || !['patentability', 'client'].includes(type)) {
    return NextResponse.json(
      { message: 'Invalid type. Use ?type=patentability or ?type=client' },
      { status: 400 }
    );
  }

  const { default: prisma } = await import('@/lib/db/prisma');
  const search = await prisma.search.findFirst({
    where: { id: params.id, userId },
    include: { report: true },
  });

  if (!search || !search.report) {
    return NextResponse.json({ message: 'Report not found' }, { status: 404 });
  }

  const content =
    type === 'patentability' ? search.report.patentabilityMd : search.report.clientReportMd;

  const filename =
    type === 'patentability'
      ? `patentability-report-${search.id}.md`
      : `client-report-${search.id}.md`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(content, 'utf-8')),
    },
  });
}
