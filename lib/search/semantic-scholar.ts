import { cachedFetch, cacheKey } from './cache';

export interface SemanticScholarResult {
  id: string;
  title: string;
  abstract: string;
  authors: string;
  year: string;
  url: string;
  source: string;
  doi?: string;
}

export async function searchSemanticScholar(keywords: string): Promise<SemanticScholarResult[]> {
  try {
    const query = encodeURIComponent(keywords);
    const fields = 'title,authors,year,abstract,externalIds,url';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=8&fields=${fields}`;

    const papers = await cachedFetch(cacheKey('semantic-scholar', keywords), async () => {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Priora.AI-PatentSearch/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`Semantic Scholar API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data?.data ?? [];
    });

    return papers.map((paper: any) => {
      const doi = paper.externalIds?.DOI ?? '';
      const arxivId = paper.externalIds?.ArXiv ?? '';
      const paperUrl =
        paper.url ||
        (doi ? `https://doi.org/${doi}` : '') ||
        (arxivId ? `https://arxiv.org/abs/${arxivId}` : '');

      return {
        id: paper.paperId ?? 'N/A',
        title: paper.title ?? 'Untitled',
        abstract: paper.abstract ?? '',
        authors: Array.isArray(paper.authors)
          ? paper.authors
              .slice(0, 5)
              .map((a: any) => a.name)
              .join('; ') + (paper.authors.length > 5 ? ' et al.' : '')
          : 'N/A',
        year: paper.year ? String(paper.year) : 'N/A',
        url: paperUrl,
        source: 'Semantic Scholar',
        doi,
      };
    });
  } catch (err) {
    console.error('Semantic Scholar search error:', err);
    return [];
  }
}
