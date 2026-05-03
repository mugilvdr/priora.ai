import type { UnifiedResult } from './index';

// Backward citation traversal: given top patent results, fetch the patents they cited.
// These are the highest-signal prior art references — examiners almost always search them.
export async function fetchBackwardCitations(
  topResults: UnifiedResult[],
  limit = 3
): Promise<UnifiedResult[]> {
  const patentNums = topResults
    .filter((r) => {
      const pn = r.patentNumber ?? '';
      return /\d{6,}/.test(pn.replace(/^US/i, ''));
    })
    .slice(0, limit)
    .map((r) => r.patentNumber!.replace(/^US/i, '').replace(/[^\d]/g, ''))
    .filter(Boolean);

  const out: UnifiedResult[] = [];

  await Promise.allSettled(
    patentNums.map(async (pn) => {
      try {
        const q = encodeURIComponent(JSON.stringify({ patent_number: pn }));
        const f = encodeURIComponent(JSON.stringify([
          'patent_number',
          'patent_title',
          'patent_abstract',
          'patent_date',
          'assignee_organization',
          'cited_patents',
        ]));
        const url = `https://search.patentsview.org/api/v1/patent/?q=${q}&f=${f}`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Priora.AI-PatentSearch/1.0',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const data = await res.json();
        const patent = data?.patents?.[0];
        if (!patent) return;

        const cited: any[] = patent.cited_patents ?? [];
        cited.slice(0, 5).forEach((c: any) => {
          const citedPN = c.cited_patent_number ?? c.patent_number ?? '';
          if (!citedPN) return;
          out.push({
            id: `US${citedPN}`,
            title: c.cited_patent_title ?? `Prior art cited by US${pn}`,
            abstract: c.cited_patent_abstract ?? `Cited as prior art in US${pn}.`,
            patentNumber: `US${citedPN}`,
            date: c.cited_patent_date,
            source: `Citation Chain (US${pn})`,
            url: `https://patents.google.com/patent/US${citedPN}`,
          });
        });
      } catch {
        // silent — citation traversal is best-effort
      }
    })
  );

  return out;
}
