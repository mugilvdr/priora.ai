import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/config/admins';

export const dynamic = 'force-dynamic';

async function getAdmin() {
  const user = await currentUser();
  if (!user) return null;
  const email = user.emailAddresses?.[0]?.emailAddress ?? '';
  if (!isAdminEmail(email)) return null;
  return { id: user.id, email };
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { userId, userEmail, dailyLimit, note } = await req.json();
  if (!userId) return NextResponse.json({ message: 'userId required' }, { status: 400 });

  const { default: prisma } = await import('@/lib/db/prisma');

  const override = await prisma.userOverride.upsert({
    where: { userId },
    update: { dailyLimit: Number(dailyLimit), note: note ?? '', userEmail: userEmail ?? '' },
    create: { userId, userEmail: userEmail ?? '', dailyLimit: Number(dailyLimit), note: note ?? '' },
  });

  try {
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'set-limit',
        targetUserId: userId,
        details: `Set dailyLimit=${dailyLimit} note="${note ?? ''}" for ${userEmail ?? userId}`,
      },
    });
  } catch (e) {
    console.error('Audit log write failed:', e);
  }

  return NextResponse.json({ ok: true, override });
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ message: 'userId required' }, { status: 400 });

  const { default: prisma } = await import('@/lib/db/prisma');
  await prisma.userOverride.deleteMany({ where: { userId } });

  try {
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'delete-limit',
        targetUserId: userId,
        details: `Removed search override for userId=${userId}`,
      },
    });
  } catch (e) {
    console.error('Audit log write failed:', e);
  }

  return NextResponse.json({ ok: true });
}
