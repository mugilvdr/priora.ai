import type { UnifiedResult } from './index';

const GOOGLE_PATENT_RE = /^(US|EP|WO|JP|CN|KR|DE|GB|FR|IN)\d/i;

function normalizePatentNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function googlePatentUrl(patentNumber: string): string {
  return `https://patents.google.com/patent/${normalizePatentNumber(patentNumber)}`;
}

function extractSection(text: string, heading: string, nextHeadings: string[]): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNext = nextHeadings.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`${escapedHeading}\\s*([\\s\\S]{200,5000}?)(?:\\n(?:${escapedNext})\\b|$)`, 'i');
  const match = text.match(re);
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

async function fetchPatentClaims(patentNumber: string): Promise<string> {
  const patentUrl = googlePatentUrl(patentNumber);
  const response = await fetch(`https://r.jina.ai/${patentUrl}`, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'Priora.AI-PatentSearch/1.0',
      'X-Return-Format': 'text',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Jina returned ${response.status} for ${patentNumber}`);
  }

  const text = await response.text();
  const claims = extractSection(text, 'Claims', ['Description', 'Patent Citations', 'Cited By', 'Similar Documents']);
  return claims.slice(0, 2500);
}

export async function enrichPatentClaims(results: UnifiedResult[], limit = 8): Promise<UnifiedResult[]> {
  const enriched = [...results];
  const candidates = enriched
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => {
      const patentNumber = result.patentNumber || result.id;
      return Boolean(patentNumber && GOOGLE_PATENT_RE.test(normalizePatentNumber(patentNumber)));
    })
    .slice(0, limit);

  const settled = await Promise.allSettled(
    candidates.map(async ({ result, index }) => {
      const patentNumber = result.patentNumber || result.id;
      const claims = await fetchPatentClaims(patentNumber);
      if (!claims) return;

      enriched[index] = {
        ...result,
        abstract: result.abstract
          ? `${result.abstract}\n\nClaim excerpt: ${claims.slice(0, 900)}`
          : `Claim excerpt: ${claims.slice(0, 900)}`,
        url: result.url || googlePatentUrl(patentNumber),
      };
    })
  );

  for (const item of settled) {
    if (item.status === 'rejected') {
      console.warn('Patent claim enrichment failed:', item.reason);
    }
  }

  return enriched;
}
