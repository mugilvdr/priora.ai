import type { UnifiedResult } from './index';
import { searchViaJina } from './jina-reader';
import { searchDuckDuckGo } from './duckduckgo';

export type WebSearchProvider = 'jina' | 'duckduckgo' | 'both';

export const WEB_SEARCH_PROVIDERS: { value: WebSearchProvider; label: string; description: string }[] = [
  {
    value: 'both',
    label: 'Both (Recommended)',
    description: 'Jina Reader + DuckDuckGo - widest coverage',
  },
  {
    value: 'jina',
    label: 'Jina Reader',
    description: 'Fetches patent office pages directly',
  },
  {
    value: 'duckduckgo',
    label: 'DuckDuckGo',
    description: 'Broad web search across all sources',
  },
];

interface JinaTarget {
  url: string;
  label: string;
}

const JINA_TARGETS: JinaTarget[] = [
  {
    url: 'https://worldwide.espacenet.com/patent/search?query={keywords}',
    label: 'EPO Espacenet',
  },
  {
    url: 'https://patentscope.wipo.int/search/en/search.jsf?query={keywords}',
    label: 'WIPO PatentScope',
  },
  {
    url: 'https://patents.google.com/?q={keywords}',
    label: 'Google Patents',
  },
  {
    url: 'https://patents.google.com/?q={altKeywords}',
    label: 'Google Patents (alt)',
  },
];

export async function runWebSearches(
  keywords: string,
  altKeywords: string,
  provider: WebSearchProvider
): Promise<UnifiedResult[]> {
  const results: UnifiedResult[] = [];

  const useJina = provider === 'jina' || provider === 'both';
  const useDDG = provider === 'duckduckgo' || provider === 'both';

  const tasks: Promise<UnifiedResult[]>[] = [];

  if (useJina) {
    for (const target of JINA_TARGETS) {
      const url = target.url
        .replace('{keywords}', encodeURIComponent(keywords))
        .replace('{altKeywords}', encodeURIComponent(altKeywords));
      tasks.push(searchViaJina(url, target.label));
    }
  }

  if (useDDG) {
    tasks.push(searchDuckDuckGo(keywords));
    if (altKeywords !== keywords) {
      tasks.push(searchDuckDuckGo(altKeywords));
    }
  }

  const settled = await Promise.allSettled(tasks);
  const seenIds = new Set<string>();

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      for (const r of s.value) {
        const key = r.patentNumber || r.id || r.title.toLowerCase().slice(0, 60);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          results.push(r);
        }
      }
    }
  }

  return results;
}
