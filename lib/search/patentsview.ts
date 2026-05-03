import type { PatentResult } from './uspto';
import { cachedFetch, cacheKey } from './cache';

export async function searchPatentsView(
  keywords: string,
  cpcCode?: string,
  sourceLabel = cpcCode ? `PatentsView CPC ${cpcCode}` : 'PatentsView'
): Promise<PatentResult[]> {
  try {
    const terms = keywords.split(/\s+/).filter(Boolean).slice(0, 6);
    if (terms.length === 0) return [];

    const allTerms = terms.join(' ');
    const titleQuery = { _text_any: { patent_title: allTerms } };
    const abstractQuery = { _text_any: { patent_abstract: allTerms } };
    const textQuery = { _or: [titleQuery, abstractQuery] };

    const queryObj = cpcCode
      ? { _and: [textQuery, { _eq: { cpc_subgroup_id: cpcCode } }] }
      : textQuery;

    const fields = JSON.stringify([
      'patent_number',
      'patent_title',
      'patent_abstract',
      'patent_date',
      'assignee_organization',
      'inventor_last_name',
      'cpc_subgroup_id',
    ]);

    const options = JSON.stringify({ size: 10 });
    const q = encodeURIComponent(JSON.stringify(queryObj));
    const f = encodeURIComponent(fields);
    const o = encodeURIComponent(options);

    const url = `https://search.patentsview.org/api/v1/patent/?q=${q}&f=${f}&o=${o}`;

    const patents = await cachedFetch(cacheKey('patentsview', `${keywords}:${cpcCode ?? ''}`), async () => {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Priora.AI-PatentSearch/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn(`PatentsView API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data?.patents ?? [];
    });

    return patents.map((p: any) => {
      // PatentsView v1 may return nested arrays or flat arrays depending on the field
      const assignee = Array.isArray(p.assignees)
        ? p.assignees.map((a: any) => a.assignee_organization ?? a).filter(Boolean).join('; ')
        : Array.isArray(p.assignee_organization)
          ? p.assignee_organization.join('; ')
          : (p.assignee_organization ?? 'N/A');

      const inventors = Array.isArray(p.inventors)
        ? p.inventors.map((i: any) => i.inventor_last_name ?? i).filter(Boolean).join('; ')
        : Array.isArray(p.inventor_last_name)
          ? p.inventor_last_name.join('; ')
          : (p.inventor_last_name ?? 'N/A');

      const cpcCodes = Array.isArray(p.cpcs)
        ? p.cpcs.map((c: any) => c.cpc_subgroup_id ?? c).filter(Boolean)
        : Array.isArray(p.cpc_subgroup_id)
          ? p.cpc_subgroup_id
          : [];

      return {
        id: p.patent_number ?? 'N/A',
        title: p.patent_title ?? 'Untitled',
        abstract: p.patent_abstract ?? '',
        assignee,
        date: p.patent_date ?? 'N/A',
        type: 'Patent Grant',
        source: sourceLabel,
        patentNumber: p.patent_number ?? '',
        url: p.patent_number ? `https://patents.google.com/patent/US${p.patent_number}` : '',
        inventors,
        cpcCodes,
      };
    });
  } catch (err) {
    console.error('PatentsView search error:', err);
    return [];
  }
}
