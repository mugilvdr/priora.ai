import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import type { WebSearchProvider } from '@/lib/search';
import { MODEL_OPTIONS, type AIModel } from '@/lib/llm/providers';
import type { Jurisdiction } from '@/lib/llm/groq';

const VALID_MODELS = MODEL_OPTIONS.map((m) => m.value) as AIModel[];
const VALID_JURISDICTIONS: Jurisdiction[] = ['US', 'IN', 'GLOBAL'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const VALID_PROVIDERS: WebSearchProvider[] = ['jina', 'duckduckgo', 'both'];
const FREE_TIER_DAILY_LIMIT = 3;

// Simple in-memory IP rate limiter: max 10 search requests per IP per 60s window
// (prevents bot abuse even before DB rate limiting kicks in)
const ipRequests = new Map<string, { count: number; resetAt: number }>();
const IP_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 10;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequests.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true; // allowed
  }
  entry.count++;
  if (entry.count > IP_MAX_REQUESTS) return false; // blocked
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // IP-level rate limit (fast, before any DB query)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { message: 'Too many requests from this IP. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { description, webSearchProvider, aiModel, modelApiKey, jurisdiction } = body;

    if (!description || typeof description !== 'string' || description.trim().length < 50) {
      return NextResponse.json(
        { message: 'Please provide a detailed invention description (at least 50 characters).' },
        { status: 400 }
      );
    }

    const provider: WebSearchProvider = VALID_PROVIDERS.includes(webSearchProvider)
      ? webSearchProvider
      : 'both';

    const model: AIModel = VALID_MODELS.includes(aiModel) ? aiModel : 'groq-llama-3.3-70b';
    const userKey: string = typeof modelApiKey === 'string' ? modelApiKey.trim() : '';
    const jur: Jurisdiction = VALID_JURISDICTIONS.includes(jurisdiction) ? jurisdiction : 'US';

    const { default: prisma } = await import('@/lib/db/prisma');
    const { runBackgroundSearch } = await import('@/lib/search');

    const clerkUser = await currentUser();
    const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? '';

    // DB-level rate limit — check UserOverride first, then default FREE_TIER_DAILY_LIMIT
    const override = await prisma.userOverride.findUnique({ where: { userId } });
    const dailyLimit = override?.dailyLimit ?? FREE_TIER_DAILY_LIMIT;

    if (dailyLimit !== -1) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayCount = await prisma.search.count({
        where: { userId, createdAt: { gte: dayStart } },
      });
      if (todayCount >= dailyLimit) {
        return NextResponse.json(
          { message: `Daily limit of ${dailyLimit} searches reached. Contact admin or upgrade to Pro for more.` },
          { status: 429 }
        );
      }
    }

    const search = await prisma.search.create({
      data: {
        userId,
        userEmail,
        title: 'Processing...',
        description: description.trim(),
        status: 'pending',
        progress: 0,
        aiModel: model,
        jurisdiction: jur,
      },
    });

    waitUntil(
      runBackgroundSearch(search.id, description.trim(), provider, model, userKey, jur).catch((err) => {
        console.error(`Background search failed for ${search.id}:`, err);
      })
    );

    return NextResponse.json({ searchId: search.id, provider }, { status: 201 });
  } catch (err) {
    console.error('POST /api/search error:', err);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
