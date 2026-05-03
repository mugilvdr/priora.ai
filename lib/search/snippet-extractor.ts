// Sentence-level snippet extraction inspired by PQAI's SnippetExtractor.
// Instead of showing full abstracts, we surface the single most relevant sentence
// from each patent's text — the one with the highest token overlap with the query.

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

function scoreSentence(sentence: string, queryTokens: Set<string>): number {
  const sentTokens = tokenSet(sentence);
  let hits = 0;
  sentTokens.forEach((t) => { if (queryTokens.has(t)) hits++; });
  // Normalize by sentence length to avoid rewarding very long sentences
  return sentTokens.size > 0 ? hits / Math.sqrt(sentTokens.size) : 0;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 500);
}

// Extract the single most relevant sentence from `text` relative to `query`.
// Falls back to a 280-char truncation if no good sentence is found.
export function extractBestSnippet(query: string, text: string): string {
  if (!text) return '';
  if (!query) return text.substring(0, 280);

  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.substring(0, 280);

  const queryTokens = tokenSet(query);
  const scored = sentences
    .map((s) => ({ s, score: scoreSentence(s, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  // Only use snippet if it actually matches something
  if (scored[0].score > 0) {
    return scored[0].s;
  }
  return text.substring(0, 280);
}

// Enrich a list of results by replacing full abstracts with best-matching snippets.
// Preserves the original abstract as a fallback in case extraction yields nothing useful.
export function enrichWithSnippets<T extends { title: string; abstract: string }>(
  results: T[],
  query: string
): T[] {
  return results.map((r) => ({
    ...r,
    abstract: extractBestSnippet(`${query} ${r.title}`, r.abstract) || r.abstract,
  }));
}
