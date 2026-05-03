import { describe, it, expect } from 'vitest';
import { extractBestSnippet, enrichWithSnippets } from '@/lib/search/snippet-extractor';

describe('extractBestSnippet', () => {
  it('should return the most relevant sentence from text', () => {
    const query = 'wireless charging resonant coupling';
    const text =
      'This paper explores various energy systems. ' +
      'The proposed wireless charging system uses resonant inductive coupling for efficient power transfer. ' +
      'Solar panels are also discussed as alternative energy sources. ' +
      'Battery technology has advanced significantly in recent years.';

    const snippet = extractBestSnippet(query, text);
    expect(snippet).toContain('wireless charging');
    expect(snippet).toContain('resonant');
  });

  it('should return truncated text when no good sentence match', () => {
    const query = 'quantum computing entanglement';
    const text = 'A short note about unrelated topics that do not match the query at all.';
    const snippet = extractBestSnippet(query, text);
    // Should fall back to truncation since no sentence matches
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet.length).toBeLessThanOrEqual(280);
  });

  it('should return empty string for empty text', () => {
    expect(extractBestSnippet('query', '')).toBe('');
  });

  it('should return truncated text for empty query', () => {
    const text = 'Some content that should be truncated to 280 characters.';
    const snippet = extractBestSnippet('', text);
    expect(snippet).toBe(text.substring(0, 280));
  });
});

describe('enrichWithSnippets', () => {
  it('should replace abstracts with best-matching snippets', () => {
    const results = [
      {
        title: 'Wireless Power System',
        abstract:
          'This document covers many topics. ' +
          'The wireless charging method uses resonant coupling for high efficiency. ' +
          'Other methods include conductive charging.',
      },
    ];

    const enriched = enrichWithSnippets(results, 'wireless charging resonant coupling');
    expect(enriched[0].abstract).toContain('wireless');
    expect(enriched[0].abstract).toContain('resonant');
  });

  it('should preserve original abstract when no good snippet found', () => {
    const results = [
      {
        title: 'Unrelated Paper',
        abstract: 'Short text.',
      },
    ];

    const enriched = enrichWithSnippets(results, 'quantum entanglement');
    expect(enriched[0].abstract).toBe('Short text.');
  });

  it('should handle empty results array', () => {
    const enriched = enrichWithSnippets([], 'any query');
    expect(enriched).toHaveLength(0);
  });
});
