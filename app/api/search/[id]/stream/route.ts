import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const searchId = params.id;
  const { default: prisma } = await import('@/lib/db/prisma');

  // Verify ownership before opening the stream
  const search = await prisma.search.findFirst({
    where: { id: searchId, userId },
    select: { id: true },
  });

  if (!search) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (data: object) => {
        if (isClosed) return;
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream already closed
        }
      };

      const poll = async () => {
        try {
          const current = await prisma.search.findUnique({
            where: { id: searchId },
            select: { status: true, progress: true, title: true, errorMessage: true, progressLabel: true },
          });

          if (!current) {
            sendEvent({ status: 'failed', progress: 0, message: 'Search not found.', errorMessage: 'Search record not found in database.' });
            isClosed = true;
            controller.close();
            return;
          }

          const message = current.progressLabel || getProgressMessage(current.status, current.progress, current.title);

          if (current.status === 'failed') {
            sendEvent({
              status: 'failed',
              progress: 0,
              message,
              errorMessage: current.errorMessage ?? 'An unexpected error occurred during the search.',
            });
            isClosed = true;
            controller.close();
            return;
          }

          sendEvent({ status: current.status, progress: current.progress, message });

          if (current.status === 'completed') {
            isClosed = true;
            controller.close();
            return;
          }

          // Poll again in 2 seconds
          setTimeout(poll, 2000);
        } catch (err) {
          console.error('SSE poll error:', err);
          sendEvent({ status: 'failed', progress: 0, message: 'Stream error.', errorMessage: 'Stream connection error. Please refresh and try again.' });
          isClosed = true;
          controller.close();
        }
      };

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        try { controller.close(); } catch {}
      });

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function getProgressMessage(status: string, progress: number, title: string): string {
  if (status === 'failed') return 'Search failed — see error details below.';
  if (status === 'completed') return `Report ready: ${title}`;
  if (status === 'pending') return 'Initializing search...';
  if (status === 'generating') return 'Worker 4: Generating patentability report...';

  if (progress <= 10) return 'Worker 1: Extracting invention features (llama-4-scout)...';
  if (progress <= 20) return 'Workers 2A/2B/2C: Generating queries, CPC codes & synonyms (parallel)...';
  if (progress <= 30) return 'Searching PatentsView, Google Patents & CPC-filtered databases...';
  if (progress <= 55) return 'Searching EPO Espacenet, WIPO PatentScope & web sources...';
  if (progress <= 65) return 'Consolidating and ranking all prior-art results...';
  if (progress <= 72) return 'Enriching top patents with full claim text...';
  if (progress <= 80) return 'Worker 3: AI comparing top patents against invention features (parallel)...';
  if (progress <= 90) return 'Worker 4: Generating patentability report (gpt-oss-120b)...';
  return 'Saving report to database...';
}
