import { cachedFetch, cacheKey } from './cache';

export interface OpenAlexResult {
  id: string;
  title: string;
  abstract: string;
  authors: string;
  year: string;
  url: string;
  doi?: string;
  source: string;
}

export async function searchOpenAlex(keywords: string): Promise<OpenAlexResult[]> {
  try {
    const query = encodeURIComponent(keywords);
    const url = `https://api.openalex.org/works?search=${query}&per-page=8&sort=relevance_score:desc&filter=has_abstract:true&mailto=search@Priora.AI.com`;

    const works = await cachedFetch(cacheKey('openalex', keywords), async () => {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Priora.AI-PatentSearch/1.0 (mailto:search@Priora.AI.com)',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        console.warn(`OpenAlex API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data?.results ?? [];
    });

    return works.map((work: any) => {
      const authorships = work.authorships ?? [];
      const authorNames = authorships
        .slice(0, 5)
        .map((a: any) => a.author?.display_name ?? '')
        .filter(Boolean);

      const doi = work.doi?.replace('https://doi.org/', '') ?? '';
      const bestUrl = work.primary_location?.landing_page_url
        || (doi ? `https://doi.org/${doi}` : '')
        || work.id;

      const abstract = work.abstract_inverted_index
        ? reconstructAbstract(work.abstract_inverted_index)
        : '';

      return {
        id: work.id ?? 'N/A',
        title: work.display_name ?? 'Untitled',
        abstract,
        authors: authorNames.join('; ') + (authorships.length > 5 ? ' et al.' : ''),
        year: work.publication_year ? String(work.publication_year) : 'N/A',
        url: bestUrl,
        doi,
        source: 'OpenAlex',
      };
    });
  } catch (err) {
    console.error('OpenAlex search error:', err);
    return [];
  }
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const positions: [number, string][] = [];
  for (const [word, locs] of Object.entries(invertedIndex)) {
    for (const pos of locs) {
      positions.push([pos, word]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, w]) => w).join(' ').slice(0, 600);
}
