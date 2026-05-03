import { cachedFetch, cacheKey } from './cache';

export interface ArxivResult {
  id: string;
  title: string;
  abstract: string;
  authors: string;
  date: string;
  url: string;
  source: string;
}

export async function searchArxiv(keywords: string): Promise<ArxivResult[]> {
  try {
    const query = encodeURIComponent(keywords.replace(/\s+/g, '+'));
    const url = `https://export.arxiv.org/api/query?search_query=all:${query}&max_results=10&sortBy=relevance&sortOrder=descending`;

    const xmlText = await cachedFetch(cacheKey('arxiv', keywords), async () => {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Priora.AI-PatentSearch/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`arXiv API returned ${response.status}`);
        return '';
      }

      return response.text();
    });

    if (!xmlText) return [];
    return parseArxivXML(xmlText);
  } catch (err) {
    console.error('arXiv search error:', err);
    return [];
  }
}

function parseArxivXML(xml: string): ArxivResult[] {
  const results: ArxivResult[] = [];

  // Split into entry blocks
  const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

  for (const entry of entryMatches) {
    try {
      const idMatch = entry.match(/<id>(.*?)<\/id>/);
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const publishedMatch = entry.match(/<published>(.*?)<\/published>/);

      // Extract all author names
      const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) ?? [];
      const authorNames = authorMatches.map((a) => {
        const m = a.match(/<name>(.*?)<\/name>/);
        return m ? m[1].trim() : '';
      }).filter(Boolean);

      const rawId = idMatch ? idMatch[1].trim() : '';
      const arxivId = rawId.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');

      results.push({
        id: arxivId || rawId,
        title: titleMatch ? cleanXmlText(titleMatch[1]) : 'Untitled',
        abstract: summaryMatch ? cleanXmlText(summaryMatch[1]) : '',
        authors: authorNames.slice(0, 5).join('; ') + (authorNames.length > 5 ? ' et al.' : ''),
        date: publishedMatch ? publishedMatch[1].substring(0, 10) : 'N/A',
        url: rawId || `https://arxiv.org/abs/${arxivId}`,
        source: 'arXiv',
      });
    } catch (e) {
      // Skip malformed entries
    }
  }

  return results;
}

function cleanXmlText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
