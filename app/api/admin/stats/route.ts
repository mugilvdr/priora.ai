import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/config/admins';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const user = await currentUser();
  if (!user) return false;
  const email = user.emailAddresses?.[0]?.emailAddress ?? '';
  return isAdminEmail(email);
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { default: prisma } = await import('@/lib/db/prisma');

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

  const [
    totalSearches,
    todaySearches,
    weekSearches,
    completedCount,
    failedCount,
    generatingCount,
    modelBreakdown,
    recentSearches,
    userOverrides,
    userDailyStats,
  ] = await Promise.all([
    prisma.search.count(),
    prisma.search.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.search.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.search.count({ where: { status: 'completed' } }),
    prisma.search.count({ where: { status: 'failed' } }),
    prisma.search.count({ where: { status: { in: ['generating', 'searching'] } } }),
    prisma.search.groupBy({ by: ['aiModel'], _count: { id: true } }),
    prisma.search.findMany({
      take: 30,
      orderBy: { createdAt: 'desc' },
      include: { report: { select: { patentabilityRating: true, referencesFound: true } } },
    }),
    prisma.userOverride.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.search.groupBy({
      by: ['userId', 'userEmail'],
      where: { createdAt: { gte: dayStart } },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
    }),
  ]);

  const successRate = totalSearches > 0
    ? Math.round((completedCount / totalSearches) * 100)
    : 0;

  return NextResponse.json({
    stats: {
      totalSearches,
      todaySearches,
      weekSearches,
      completedCount,
      failedCount,
      generatingCount,
      successRate,
    },
    modelBreakdown: modelBreakdown.map((m) => ({ model: m.aiModel, count: m._count.id })),
    recentSearches,
    userOverrides,
    userDailyStats: userDailyStats.map((u) => ({
      userId: u.userId,
      userEmail: u.userEmail,
      todayCount: u._count.userId,
    })),
  });
}
