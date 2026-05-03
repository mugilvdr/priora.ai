import { describe, it, expect } from 'vitest';
import {
  findObviousnessPairs,
  formatPairsForPrompt,
  type DocRef,
  type InventionQuery,
} from '@/lib/analysis/obviousness-combiner';

const makeRef = (title: string, abstract: string, patentNumber?: string): DocRef => ({
  title,
  abstract,
  patentNumber,
  source: 'test',
});

describe('findObviousnessPairs', () => {
  const query: InventionQuery = {
    novelElements: [
      'wireless charging pad using resonant inductive coupling',
      'thermal management system with phase-change material',
      'automatic device alignment via magnetic positioning',
    ],
    keywords: ['wireless', 'charging', 'resonant', 'thermal', 'magnetic'],
  };

  const refs: DocRef[] = [
    makeRef(
      'Resonant Wireless Power Transfer System',
      'A wireless charging system using resonant inductive coupling for efficient power transfer to mobile devices',
      'US12345678'
    ),
    makeRef(
      'Thermal Management in Electronic Devices',
      'A thermal management system employing phase-change material for heat dissipation in compact electronics',
      'US87654321'
    ),
    makeRef(
      'Magnetic Alignment Mechanism',
      'An automatic device alignment system using magnetic positioning for precise component placement',
      'US11223344'
    ),
    makeRef(
      'Solar Panel Efficiency Study',
      'A study on improving solar panel efficiency through novel photovoltaic materials'
    ),
  ];

  it('should return pairs sorted by coverage score (highest first)', () => {
    const pairs = findObviousnessPairs(query, refs, 3);
    expect(pairs.length).toBe(3);
    expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[1].score);
    expect(pairs[1].score).toBeGreaterThanOrEqual(pairs[2].score);
  });

  it('should identify covered and uncovered elements', () => {
    const pairs = findObviousnessPairs(query, refs, 1);
    expect(pairs[0].coveredElements.length + pairs[0].uncoveredElements.length).toBe(query.novelElements.length);
  });

  it('should return empty array when no refs provided', () => {
    const pairs = findObviousnessPairs(query, [], 5);
    expect(pairs).toHaveLength(0);
  });

  it('should handle single ref (no pairs possible)', () => {
    const pairs = findObviousnessPairs(query, [refs[0]], 5);
    expect(pairs).toHaveLength(0);
  });

  it('should limit to topN results', () => {
    const pairs = findObviousnessPairs(query, refs, 2);
    expect(pairs.length).toBeLessThanOrEqual(2);
  });

  it('should prefer pairs with higher joint coverage', () => {
    const pairs = findObviousnessPairs(query, refs, 5);
    // The top pair should include refs that together cover more elements
    const topPair = pairs[0];
    expect(topPair.coveredElements.length).toBeGreaterThan(0);
  });
});

describe('formatPairsForPrompt', () => {
  it('should return empty string for no pairs', () => {
    const result = formatPairsForPrompt([], ['element1']);
    expect(result).toBe('');
  });

  it('should format pairs with patent numbers and scores', () => {
    const pairs = findObviousnessPairs(
      { novelElements: ['wireless charging'], keywords: ['wireless'] },
      [
        makeRef('Wireless System', 'A wireless charging system', 'US111'),
        makeRef('Charging Pad', 'A charging pad with inductive coupling', 'US222'),
      ],
      1
    );
    const result = formatPairsForPrompt(pairs, ['wireless charging']);
    expect(result).toContain('§103 OBVIOUSNESS PAIRS');
    expect(result).toContain('Pair 1');
    expect(result).toContain('US111');
    expect(result).toContain('US222');
  });
});
