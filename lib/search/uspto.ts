import { cachedFetch, cacheKey } from './cache';

export interface PatentResult {
  id: string;
  title: string;
  abstract: string;
  assignee: string;
  date: string;
  type: string;
  source: string;
  url?: string;
  inventors?: string;
  patentNumber?: string;
}

export async function searchUSPTOGrants(
  keywords: string,
  rows = 10,
  sourceLabel = 'USPTO Grants'
): Promise<PatentResult[]> {
  try {
    const query = encodeURIComponent(keywords);
    const url = `https://efts.uspto.gov/LATEST/search-grants?query=${query}&rows=${rows}`;

    const hits = await cachedFetch(cacheKey('uspto-grants', `${keywords}:${rows}`), async () => {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Priora.AI-PatentSearch/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn(`USPTO Grants API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data?.hits?.hits ?? [];
    });

    return (hits as any[]).map((hit: any) => {
      const src = hit._source ?? {};
      return {
        id: hit._id ?? src.patent_number ?? 'N/A',
        title: src.patent_title ?? 'Untitled',
        abstract: src.patent_abstract ?? '',
        assignee: Array.isArray(src.assignee_organization)
          ? src.assignee_organization.join('; ')
          : (src.assignee_organization ?? 'N/A'),
        date: src.patent_date ?? src.grant_date ?? 'N/A',
        type: 'Patent Grant',
        source: sourceLabel,
        patentNumber: src.patent_number ?? hit._id ?? '',
        url: src.patent_number
          ? `https://patents.google.com/patent/US${src.patent_number}`
          : '',
        inventors: Array.isArray(src.inventor_name)
          ? src.inventor_name.join('; ')
          : (src.inventor_name ?? 'N/A'),
      };
    });
  } catch (err: any) {
    if (err?.cause?.code === 'ENOTFOUND') {
      console.warn('⚠️ USPTO Legacy API (efts.uspto.gov) is unreachable. Returning empty results.');
    } else {
      console.error('USPTO Grants search error:', err.message || err);
    }
    return [];
  }
}

export async function searchUSPTOApplications(
  keywords: string,
  rows = 10,
  sourceLabel = 'USPTO Applications'
): Promise<PatentResult[]> {
  try {
    const query = encodeURIComponent(keywords);
    const url = `https://efts.uspto.gov/LATEST/search-applications?query=${query}&rows=${rows}`;

    const hits = await cachedFetch(cacheKey('uspto-apps', `${keywords}:${rows}`), async () => {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Priora.AI-PatentSearch/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn(`USPTO Applications API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data?.hits?.hits ?? [];
    });

    return (hits as any[]).map((hit: any) => {
      const src = hit._source ?? {};
      return {
        id: hit._id ?? src.app_number ?? 'N/A',
        title: src.patent_title ?? src.invention_title ?? 'Untitled',
        abstract: src.patent_abstract ?? '',
        assignee: Array.isArray(src.assignee_organization)
          ? src.assignee_organization.join('; ')
          : (src.assignee_organization ?? 'N/A'),
        date: src.filing_date ?? src.pub_date ?? 'N/A',
        type: 'Patent Application',
        source: sourceLabel,
        patentNumber: src.app_number ?? hit._id ?? '',
        url: src.app_number
          ? `https://patents.google.com/patent/US${src.app_number}A1`
          : '',
        inventors: Array.isArray(src.inventor_name)
          ? src.inventor_name.join('; ')
          : (src.inventor_name ?? 'N/A'),
      };
    });
  } catch (err: any) {
    if (err?.cause?.code === 'ENOTFOUND') {
      console.warn('⚠️ USPTO Legacy API (efts.uspto.gov) is unreachable. Returning empty results.');
    } else {
      console.error('USPTO Applications search error:', err.message || err);
    }
    return [];
  }
}

// Search inside patent claims text specifically (ACLM: field prefix)
// Finds patents that CLAIM the technology, not just mention it
export async function searchUSPTOClaims(
  keywords: string,
  rows = 10,
  sourceLabel = 'USPTO Claims Search'
): Promise<PatentResult[]> {
  const terms = keywords.split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length === 0) return [];
  const claimsQuery = terms.length > 1
    ? `ACLM:(${terms.join(' AND ')})`
    : `ACLM:(${terms[0]})`;
  return searchUSPTOGrants(claimsQuery, rows, sourceLabel);
}
