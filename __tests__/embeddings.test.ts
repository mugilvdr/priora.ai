import { describe, it, expect } from 'vitest';
import { cosineSimilarity, computeVectorScores } from '@/lib/search/embeddings';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('should handle zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('should handle different-length vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('should handle empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('computeVectorScores', () => {
  it('should return all zeros when query embedding is null', () => {
    const scores = computeVectorScores(null, [[1, 2], [3, 4]]);
    expect(scores).toEqual([0, 0]);
  });

  it('should return 0 for null result embeddings', () => {
    const query = [1, 0, 0];
    const scores = computeVectorScores(query, [null, [1, 0, 0], null]);
    expect(scores[0]).toBe(0);
    expect(scores[1]).toBeCloseTo(1, 5);
    expect(scores[2]).toBe(0);
  });

  it('should return scores clamped to 0 minimum', () => {
    const query = [1, 0, 0];
    const opposite = [-1, 0, 0]; // cosine = -1, should clamp to 0
    const scores = computeVectorScores(query, [opposite]);
    expect(scores[0]).toBe(0);
  });

  it('should compute correct scores for similar vectors', () => {
    const query = [1, 1, 0];
    const similar = [1, 0.9, 0.1];
    const different = [0, 0, 1];

    const scores = computeVectorScores(query, [similar, different]);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });
});
