export interface JinaResult {
  id: string;
  title: string;
  abstract: string;
  patentNumber: string;
  assignee: string;
  date: string;
  url: string;
  source: string;
  rawText?: string;
}

export async function searchViaJina(targetUrl: string, label: string): Promise<JinaResult[]> {
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'Priora.AI-PatentSearch/1.0',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn(`Jina Reader (${label}) returned ${response.status}`);
      return [];
    }

    const text = await response.text();
    return extractPatentReferences(text, label, targetUrl);
  } catch (err) {
    console.error(`Jina Reader search error (${label}):`, err);
    return [];
  }
}

function extractPatentReferences(text: string, source: string, baseUrl: string): JinaResult[] {
  const results: JinaResult[] = [];

  // Try to extract patent numbers from the text
  const patentPatterns = [
    // US Patents
    /US\s*(\d{7,8}(?:\s*[A-Z]\d?)?)/gi,
    // EP Patents
    /EP\s*(\d{6,8}(?:\s*[A-Z]\d?)?)/gi,
    // WO Patents
    /WO\s*(\d{4}\/\d{6}|\d{10,12})/gi,
    // CN, JP, KR etc
    /(?:CN|JP|KR|DE|FR|GB)\s*(\d{6,12}(?:\s*[A-Z]\d?)?)/gi,
  ];

  // Split text into sections (often separated by patent entries)
  const lines = text.split('\n').filter((l) => l.trim().length > 20);

  // Try to find patent entries - look for title-like patterns with patent numbers nearby
  const entryBlocks: string[] = [];
  let currentBlock = '';

  for (const line of lines) {
    const hasPatentNum = patentPatterns.some((p) => {
      p.lastIndex = 0;
      return p.test(line);
    });

    if (hasPatentNum && currentBlock.length > 100) {
      entryBlocks.push(currentBlock);
      currentBlock = line + '\n';
    } else {
      currentBlock += line + '\n';
    }
  }
  if (currentBlock.length > 50) {
    entryBlocks.push(currentBlock);
  }

  // Process up to 10 blocks
  for (const block of entryBlocks.slice(0, 10)) {
    const patentNums: string[] = [];

    for (const pattern of patentPatterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(block)) !== null) {
        const num = m[0].replace(/\s+/g, '').toUpperCase();
        if (!patentNums.includes(num)) {
          patentNums.push(num);
        }
      }
    }

    if (patentNums.length === 0) continue;

    // Extract title (usually the first meaningful line of the block)
    const titleLine = block.split('\n').find(
      (l) => l.trim().length > 10 && l.trim().length < 200 && !/^\d+$/.test(l.trim())
    ) ?? 'Patent Reference';

    // Extract abstract snippet (first substantial paragraph)
    const abstractMatch = block.match(/(?:abstract|description|claim)[:\s]+([\s\S]{50,400})/i);
    const abstract = abstractMatch
      ? abstractMatch[1].replace(/\s+/g, ' ').trim()
      : block.substring(0, 400).replace(/\s+/g, ' ').trim();

    // Try to find dates
    const dateMatch = block.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4}|\b(?:19|20)\d{2}\b)/);
    const date = dateMatch ? dateMatch[0] : 'N/A';

    // Try to find assignee
    const assigneeMatch = block.match(/(?:assignee|applicant|owner)[:\s]+([^\n,]{3,60})/i);
    const assignee = assigneeMatch ? assigneeMatch[1].trim() : 'N/A';

    const primaryPatent = patentNums[0];

    results.push({
      id: primaryPatent,
      title: cleanText(titleLine),
      abstract: cleanText(abstract),
      patentNumber: primaryPatent,
      assignee,
      date,
      url: buildPatentUrl(primaryPatent, baseUrl),
      source,
      rawText: block.substring(0, 500),
    });
  }

  // If no structured entries found but text has content, create a summary entry
  if (results.length === 0 && text.length > 200) {
    const allNums: string[] = [];
    for (const pattern of patentPatterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const num = m[0].replace(/\s+/g, '').toUpperCase();
        if (!allNums.includes(num)) allNums.push(num);
      }
    }

    // Return individual entries for each found patent number
    for (const num of allNums.slice(0, 8)) {
      results.push({
        id: num,
        title: `Patent ${num}`,
        abstract: text.substring(0, 300).replace(/\s+/g, ' ').trim(),
        patentNumber: num,
        assignee: 'N/A',
        date: 'N/A',
        url: buildPatentUrl(num, baseUrl),
        source,
      });
    }
  }

  // Strip low-quality placeholder entries (generic titles or near-empty abstracts)
  return results
    .filter((r) => r.title !== 'Patent Reference' && !/^Patent [A-Z]{2}/.test(r.title) && r.abstract.length > 60)
    .slice(0, 10);
}

function buildPatentUrl(patentNum: string, baseUrl: string): string {
  const upper = patentNum.toUpperCase();
  if (upper.startsWith('US')) {
    return `https://patents.google.com/patent/${upper.replace(/\s/g, '')}`;
  }
  if (upper.startsWith('EP')) {
    return `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(patentNum)}`;
  }
  if (upper.startsWith('WO')) {
    return `https://patentscope.wipo.int/search/en/search.jsf?query=${encodeURIComponent(patentNum)}`;
  }
  return baseUrl;
}

function cleanText(text: string): string {
  return text
    .replace(/#+\s*/g, '')
    .replace(/\*+/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 400);
}
