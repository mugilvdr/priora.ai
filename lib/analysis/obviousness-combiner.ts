export interface DocRef {
  title: string;
  abstract?: string;
  patentNumber?: string;
  source?: string;
  url?: string;
}

export interface ObviousPair {
  ref1: DocRef;
  ref2: DocRef;
  coveredElements: string[];
  uncoveredElements: string[];
  score: number;
}

export interface InventionQuery {
  novelElements: string[];
  keywords: string[];
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
}

function coverageScore(element: string, ref: DocRef): number {
  const eTokens = tokenSet(element);
  if (eTokens.size === 0) return 0;
  const dTokens = tokenSet(`${ref.title} ${ref.abstract ?? ''}`);
  let hits = 0;
  eTokens.forEach((t) => { if (dTokens.has(t)) hits++; });
  return hits / eTokens.size;
}

function elemVector(query: InventionQuery, ref: DocRef): number[] {
  return query.novelElements.map((el) => coverageScore(el, ref));
}

// Implements PQAI's Combiner algorithm in TypeScript:
// For each pair of references, compute joint element coverage (union of individual coverages).
// Pairs where ref1+ref2 together cover the most novel elements rank highest.
export function findObviousnessPairs(
  query: InventionQuery,
  refs: DocRef[],
  topN = 5
): ObviousPair[] {
  const candidates = refs.slice(0, 15);
  const vectors = candidates.map((r) => elemVector(query, r));
  const THRESHOLD = 0.25;
  const nElems = Math.max(query.novelElements.length, 1);

  const pairs: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const score =
        query.novelElements
          .map((_, k) => Math.max(vectors[i][k], vectors[j][k]))
          .reduce((a, b) => a + b, 0) / nElems;
      pairs.push({ i, j, score });
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  return pairs.slice(0, topN).map(({ i, j, score }) => {
    const v1 = vectors[i];
    const v2 = vectors[j];
    const covered = query.novelElements.filter(
      (_, k) => Math.max(v1[k], v2[k]) >= THRESHOLD
    );
    const uncovered = query.novelElements.filter(
      (_, k) => Math.max(v1[k], v2[k]) < THRESHOLD
    );
    return { ref1: candidates[i], ref2: candidates[j], coveredElements: covered, uncoveredElements: uncovered, score };
  });
}

export function formatPairsForPrompt(
  pairs: ObviousPair[],
  novelElements: string[]
): string {
  if (pairs.length === 0) return '';

  const lines = pairs.map((p, idx) => {
    const r1label = p.ref1.patentNumber ?? p.ref1.title.substring(0, 50);
    const r2label = p.ref2.patentNumber ?? p.ref2.title.substring(0, 50);
    const covered = p.coveredElements.length
      ? p.coveredElements.join('; ')
      : 'general overlap only';
    const uncovered = p.uncoveredElements.length
      ? p.uncoveredElements.join('; ')
      : 'none — full coverage';
    return `**Pair ${idx + 1}** (joint coverage score: ${p.score.toFixed(2)}):
- Ref A: ${r1label} — "${p.ref1.title.substring(0, 70)}"
- Ref B: ${r2label} — "${p.ref2.title.substring(0, 70)}"
- Jointly address: ${covered}
- Still uncovered: ${uncovered}`;
  });

  return `## PRE-COMPUTED §103 OBVIOUSNESS PAIRS
The following combinations were analytically determined to have the highest joint element coverage across ${novelElements.length} novel elements:

${lines.join('\n\n')}

Use these pairs as the primary basis for your §103 obviousness analysis. Include them in your §103 section with prosecution strategy for each.`;
}
