import type { UnifiedResult } from './index';

const DDG_HTML_URL = 'https://html.duckduckgo.com/html/';

// Patent-focused queries — kept small to fit Vercel free tier time budget
function buildPatentQueries(keywords: string): string[] {
  return [
    `patent prior art ${keywords}`,
    `site:patents.google.com ${keywords}`,
    `EPO espacenet patent ${keywords}`,
    `WIPO patentscope PCT ${keywords}`,
    `site:ieeexplore.ieee.org OR site:researchgate.net ${keywords}`,
  ];
}

async function fetchDDGPage(query: string): Promise<string> {
  const params = new URLSearchParams({ q: query, kl: 'us-en' });
  const res = await fetch(`${DDG_HTML_URL}?${params}`, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://duckduckgo.com/',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`DDG returned ${res.status}`);
  return res.text();
}

// Parse DuckDuckGo HTML result page into structured results
function parseDDGHtml(html: string, source: string): UnifiedResult[] {
  const results: UnifiedResult[] = [];

  // Extract result blocks - DDG HTML wraps each result in a <div class="result ...">
  const resultBlockRe =
    /<div[^>]*class="[^"]*result[^"]*web-result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  // Simpler: extract titles + snippets + urls using targeted patterns
  const titleRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const urlRe = /<span[^>]*class="result__url"[^>]*>([\s\S]*?)<\/span>/gi;

  const titles: { href: string; text: string }[] = [];
  const snippets: string[] = [];
  const urls: string[] = [];

  let m: RegExpExecArray | null;

  while ((m = titleRe.exec(html)) !== null) {
    titles.push({ href: m[1], text: stripHtml(m[2]) });
  }
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripHtml(m[1]));
  }
  while ((m = urlRe.exec(html)) !== null) {
    urls.push(stripHtml(m[1]).trim());
  }

  for (let i = 0; i < Math.min(titles.length, 10); i++) {
    const title = titles[i]?.text?.trim();
    if (!title || title.length < 5) continue;

    const href = decodeURIComponent(titles[i].href || '').replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '');
    const snippet = snippets[i] ?? '';
    const displayUrl = urls[i] ?? href;

    // Extract patent numbers from title/snippet
    const patentNum = extractPatentNumber(title + ' ' + snippet);

    // Skip pure ads / nav links
    if (href.includes('duckduckgo.com') && !href.includes('patent')) continue;

    results.push({
      id: patentNum || `ddg-${i}-${Date.now()}`,
      title,
      abstract: snippet,
      patentNumber: patentNum || undefined,
      url: href || `https://duckduckgo.com/?q=${encodeURIComponent(title)}`,
      source,
      type: detectResultType(href, title),
    });
  }

  return results;
}

function extractPatentNumber(text: string): string {
  const patterns = [
    /\b(US\s*\d{7,8}(?:\s*[A-Z]\d?)?)\b/i,
    /\b(EP\s*\d{6,8}(?:\s*[A-Z]\d?)?)\b/i,
    /\b(WO\s*\d{4}[\/\s]\d{6})\b/i,
    /\b(US\s*20\d{8})\b/i,
    /\b([A-Z]{2}\s*\d{8,12})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/\s+/g, '').toUpperCase();
  }
  return '';
}

function detectResultType(url: string, title: string): string {
  if (url.includes('patents.google.com') || url.includes('espacenet') || url.includes('patentscope'))
    return 'patent';
  if (url.includes('arxiv.org') || url.includes('ieee.org') || url.includes('scholar.google'))
    return 'academic';
  if (title.toLowerCase().includes('patent')) return 'patent';
  return 'web';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Small delay to avoid rate-limiting between DDG requests
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchDuckDuckGo(keywords: string): Promise<UnifiedResult[]> {
  const queries = buildPatentQueries(keywords);
  const results: UnifiedResult[] = [];
  const seenTitles = new Set<string>();

  for (let i = 0; i < queries.length; i++) {
    try {
      if (i > 0) await sleep(400);
      const html = await fetchDDGPage(queries[i]);
      const pageResults = parseDDGHtml(html, `DuckDuckGo (${queries[i].slice(0, 30)}…)`);
      for (const r of pageResults) {
        const key = r.patentNumber || r.title.toLowerCase().slice(0, 60);
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          results.push(r);
        }
      }
    } catch (err) {
      console.warn(`DuckDuckGo query "${queries[i]}" failed:`, err);
    }
    // Stop early if we have enough
    if (results.length >= 35) break;
  }

  return results.slice(0, 35);
}
