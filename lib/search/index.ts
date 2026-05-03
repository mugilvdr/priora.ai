import prisma from '@/lib/db/prisma';
import { extractInventionParams, generateReports, type Jurisdiction } from '@/lib/llm/groq';
import { searchPatentsView } from './patentsview';
import { searchViaJina } from './jina-reader';
import {
  runWorker1,
  runWorkers2,
  buildSearchPlanFromWorkers,
  runWorker3Batch,
  runWorker4,
  type FeatureJSON,
} from '@/lib/llm/workers';
import { searchArxiv } from './arxiv';
import { searchSemanticScholar } from './semantic-scholar';
import { searchOpenAlex } from './openalex';
import { runWebSearches, type WebSearchProvider } from './web-search';
import { enrichPatentClaims } from './patent-enrichment';
import { fetchBackwardCitations } from './citations';
import { enrichWithSnippets } from './snippet-extractor';
import { findObviousnessPairs, formatPairsForPrompt } from '@/lib/analysis/obviousness-combiner';
import type { AIModel } from '@/lib/llm/providers';
import { isEmbeddingAvailable, generateEmbedding, generateEmbeddings, computeVectorScores } from './embeddings';

export type { WebSearchProvider };

export interface UnifiedResult {
  id: string;
  title: string;
  abstract: string;
  assignee?: string;
  inventors?: string;
  authors?: string;
  date?: string;
  year?: string;
  type?: string;
  source: string;
  url?: string;
  patentNumber?: string;
  doi?: string;
  cpcCodes?: string[];
}

interface QueryLogEntry {
  source: string;
  query: string;
}

function compactQuery(parts: Array<string | undefined>, maxTerms = 10): string {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const part of parts) {
    for (const rawTerm of (part ?? '').split(/\s+/)) {
      const term = rawTerm.replace(/[^\w/-]/g, '').trim();
      const key = term.toLowerCase();
      if (term.length > 2 && !seen.has(key)) {
        seen.add(key);
        terms.push(term);
      }
      if (terms.length >= maxTerms) return terms.join(' ');
    }
  }

  return terms.join(' ');
}

function buildSearchQueries(params: Awaited<ReturnType<typeof extractInventionParams>>) {
  const keywordQuery = compactQuery(params.keywords, 10);
  const novelQuery = compactQuery(params.novelElements, 10);
  const claimQuery = compactQuery(params.claimsTerms, 8);
  const synonymQuery = compactQuery(params.synonyms, 8);
  const cpcCodes = params.cpcCodes.filter(Boolean).slice(0, 3);

  return {
    keywordQuery,
    novelQuery,
    claimQuery: claimQuery || novelQuery || keywordQuery,
    synonymQuery: synonymQuery || keywordQuery,
    cpcCodes,
  };
}

async function updateSearchProgress(
  searchId: string,
  progress: number,
  status?: string,
  label?: string
) {
  await prisma.search.update({
    where: { id: searchId },
    data: {
      progress,
      ...(status ? { status } : {}),
      ...(label !== undefined ? { progressLabel: label } : {}),
    },
  });
}

// Weighted hybrid scoring:
//   finalScore = 0.30 * keywordScore + 0.30 * vectorScore + 0.25 * rerankerScore
//                + 0.10 * cpcIpcMatch + 0.05 * claimElementCoverage
//
// vectorScore uses cosine similarity from OpenAI embeddings when available.
// rerankerScore approximates cross-encoder via title-query overlap ratio.
function rankByRelevance(
  results: UnifiedResult[],
  keywords: string[],
  novelElements: string[] = [],
  targetCpcCodes: string[] = [],
  vectorScores: number[] = []
): UnifiedResult[] {
  const kws = keywords.map((k) => k.toLowerCase());

  function tokenSet(text: string): Set<string> {
    return new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 3)
    );
  }

  function keywordScore(r: UnifiedResult): number {
    const titleText = r.title.toLowerCase();
    const abstractText = (r.abstract ?? '').toLowerCase();
    let score = 0;
    kws.forEach((kw) => {
      if (titleText.includes(kw)) score += 6; // title match = 3× signal
      else if (abstractText.includes(kw)) score += 2;
    });
    return kws.length > 0 ? score / (kws.length * 6) : 0;
  }

  function rerankerScore(r: UnifiedResult): number {
    // Approximates cross-encoder: ratio of query tokens found in title+abstract
    const docTokens = tokenSet(`${r.title} ${r.abstract ?? ''}`);
    const queryTokens = tokenSet(kws.join(' '));
    if (queryTokens.size === 0) return 0;
    let hits = 0;
    queryTokens.forEach((t) => { if (docTokens.has(t)) hits++; });
    return hits / queryTokens.size;
  }

  function cpcIpcMatch(r: UnifiedResult): number {
    if (targetCpcCodes.length === 0 || !r.cpcCodes?.length) return 0;
    const target = targetCpcCodes.map((c) => c.toLowerCase());
    const resultCpcs = (r.cpcCodes ?? []).map((c) => c.toLowerCase());
    let matches = 0;
    for (const tc of target) {
      for (const rc of resultCpcs) {
        // Match on section/class prefix (first 4 chars) for partial credit
        if (rc.startsWith(tc.slice(0, 4))) matches++;
      }
    }
    return Math.min(1, matches / target.length);
  }

  function claimElementCoverage(r: UnifiedResult): number {
    if (novelElements.length === 0) return 0;
    const fullText = `${r.title} ${r.abstract ?? ''}`;
    const docTokens = tokenSet(fullText);
    let covered = 0;
    for (const el of novelElements) {
      const elTokens = tokenSet(el);
      if (elTokens.size === 0) continue;
      let hits = 0;
      elTokens.forEach((t) => { if (docTokens.has(t)) hits++; });
      if (hits / elTokens.size >= 0.3) covered++;
    }
    return covered / novelElements.length;
  }

  return results
    .map((r, idx) => {
      const kScore = keywordScore(r);
      const vScore = vectorScores[idx] ?? 0;
      const rScore = rerankerScore(r);
      const cScore = cpcIpcMatch(r);
      const eScore = claimElementCoverage(r);

      let finalScore = 0.30 * kScore + 0.30 * vScore + 0.25 * rScore + 0.10 * cScore + 0.05 * eScore;

      // Bonus signals (non-weighted but high signal)
      if (r.patentNumber) finalScore += 0.05; // real patent record
      if (r.source.includes('Claims')) finalScore += 0.08; // from claims field
      if (r.source.includes('Citation Chain')) finalScore += 0.05; // examiner-cited

      // Recency bonus
      const year = parseInt(r.date?.substring(0, 4) || r.year || '2000', 10);
      if (year >= 2020) finalScore += 0.03;
      else if (year >= 2015) finalScore += 0.015;

      return { r, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .map(({ r }) => r);
}

function dedup(results: UnifiedResult[]): UnifiedResult[] {
  const seen = new Set<string>();
  const out: UnifiedResult[] = [];
  for (const r of results) {
    const key = (r.patentNumber || r.doi || r.id || r.title).toLowerCase().slice(0, 80);
    if (!seen.has(key) && r.title && r.title !== 'Untitled') {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export async function runBackgroundSearch(
  searchId: string,
  description: string,
  webSearchProvider: WebSearchProvider = 'both',
  aiModel: AIModel = 'groq-llama-3.3-70b',
  userApiKey = '',
  jurisdiction: Jurisdiction = 'US'
) {
  const queryLog: QueryLogEntry[] = [];
  const groqKey = process.env.GROQ_API_KEY ?? '';

  try {
    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'searching', progress: 5, progressLabel: 'Worker 1: Extracting invention features...' },
    });

    // ── Step 1: Worker 1 — Feature extraction (llama-4-scout, 500K TPD) ──────
    // Try the new compact worker first; fall back to existing extractInventionParams on failure.
    let features: FeatureJSON | null = null;
    if (groqKey) {
      features = await runWorker1(description, groqKey);
    }

    let inventionParams: Awaited<ReturnType<typeof extractInventionParams>>;
    if (features) {
      inventionParams = {
        title: features.title,
        novelElements: features.novelElements,
        keywords: features.keywords,
        synonyms: features.synonyms,
        cpcCodes: features.cpcCodes,
        technologyDomain: features.technologyDomain,
        claimsTerms: features.claimsTerms,
      };
    } else {
      // Fallback: old groq.ts extraction (uses llama-3.3-70b / user model)
      inventionParams = await extractInventionParams(description, aiModel, userApiKey);
    }

    await prisma.search.update({
      where: { id: searchId },
      data: {
        title: inventionParams.title,
        progress: 15,
        progressLabel: 'Workers 2A/2B/2C: Generating search queries, CPC codes & synonyms (parallel)...',
      },
    });

    // ── Step 2: Workers 2A/B/C — Parallel search prep (gpt-oss-20b) ─────────
    let keywordQuery: string;
    let novelQuery: string;
    let claimQuery: string;
    let synonymQuery: string;
    let cpcCodes: string[];

    if (groqKey) {
      const { queries, cpc, synonyms } = await runWorkers2(features ?? {
        field: inventionParams.technologyDomain,
        problem: '',
        concept: inventionParams.title,
        summary_25_words: inventionParams.title,
        features: inventionParams.novelElements.map((e, i) => ({
          id: `F${i + 1}`, text: e, type: 'essential' as const, weight: 5, terms: [],
        })),
        components: inventionParams.keywords,
        technical_effects: [],
        ...inventionParams,
      }, groqKey);

      const plan = buildSearchPlanFromWorkers(
        features ?? { ...inventionParams, field: inventionParams.technologyDomain, problem: '', concept: inventionParams.title, summary_25_words: inventionParams.title, features: [], components: [], technical_effects: [] },
        queries,
        cpc,
        synonyms
      );
      keywordQuery = plan.keywordQuery;
      novelQuery   = plan.novelQuery;
      claimQuery   = plan.claimQuery;
      synonymQuery = plan.synonymQuery;
      cpcCodes     = plan.cpcCodes;
    } else {
      ({ keywordQuery, novelQuery, claimQuery, synonymQuery, cpcCodes } = buildSearchQueries(inventionParams));
    }

    queryLog.push(
      { source: 'Worker 2A: Search queries', query: keywordQuery },
      { source: 'Worker 2B: CPC codes', query: cpcCodes.join(', ') || 'none' },
      { source: 'Worker 2C: Synonyms', query: synonymQuery },
      { source: 'PatentsView (keywords)', query: keywordQuery },
      { source: 'PatentsView (novel)', query: novelQuery },
      { source: 'Google Patents (keywords)', query: keywordQuery },
      { source: 'arXiv', query: keywordQuery },
      { source: 'Semantic Scholar', query: keywordQuery },
      { source: 'Web Search (keywords)', query: keywordQuery },
    );
    if (cpcCodes.length > 0) {
      cpcCodes.forEach((code) => {
        queryLog.push({ source: `PatentsView CPC ${code}`, query: `${synonymQuery} [CPC:${code}]` });
      });
    }

    // ── Step 3: 14 parallel patent + academic API searches ───────────────────
    await updateSearchProgress(searchId, 28, undefined, `Searching PatentsView, Google Patents & ${cpcCodes.length} CPC codes in parallel...`);

    const directResults = await Promise.allSettled([
      searchPatentsView(keywordQuery, cpcCodes[0], cpcCodes[0] ? `PatentsView - ${cpcCodes[0]}` : 'PatentsView - keywords'),
      searchPatentsView(novelQuery, cpcCodes[1], cpcCodes[1] ? `PatentsView - ${cpcCodes[1]}` : 'PatentsView - novel'),
      searchPatentsView(claimQuery, undefined, 'PatentsView - claims'),
      searchPatentsView(synonymQuery, undefined, 'PatentsView - synonyms'),
      searchPatentsView(keywordQuery, cpcCodes[2], cpcCodes[2] ? `PatentsView - ${cpcCodes[2]}` : 'PatentsView - keywords2'),
      ...cpcCodes.slice(0, 2).map((code) => searchPatentsView(synonymQuery, code, `PatentsView CPC ${code}`)),
      searchViaJina(`https://patents.google.com/?q=${encodeURIComponent(keywordQuery)}`, 'Google Patents - keywords'),
      searchViaJina(`https://patents.google.com/?q=${encodeURIComponent(novelQuery)}`, 'Google Patents - novel'),
      searchViaJina(`https://patents.google.com/?q=${encodeURIComponent(claimQuery)}`, 'Google Patents - claims'),
      searchViaJina(`https://patents.google.com/?q=${encodeURIComponent(synonymQuery)}`, 'Google Patents - synonyms'),
      searchArxiv(keywordQuery),
      searchSemanticScholar(keywordQuery),
      searchOpenAlex(keywordQuery),
      searchOpenAlex(claimQuery),
    ]);

    await updateSearchProgress(searchId, 50, undefined, 'Searching EPO Espacenet, WIPO PatentScope & running web searches...');

    // ── Step 4: Web searches + citation traversal ─────────────────────────────
    const directFlat: UnifiedResult[] = [];
    for (const s of directResults) {
      if (s.status === 'fulfilled') directFlat.push(...(s.value as UnifiedResult[]));
    }
    const topForCitations = dedup(directFlat).filter((r) => r.patentNumber).slice(0, 3);

    const [webBatch1, webBatch2, citationBatch] = await Promise.allSettled([
      runWebSearches(keywordQuery, novelQuery, webSearchProvider),
      runWebSearches(claimQuery, synonymQuery, webSearchProvider),
      fetchBackwardCitations(topForCitations, 3),
    ]);

    await updateSearchProgress(searchId, 60, undefined, 'Consolidating and ranking all results...');

    // ── Step 5: Consolidate, dedup, rank ──────────────────────────────────────
    const allResultsRaw: UnifiedResult[] = [...directFlat];
    for (const settled of [webBatch1, webBatch2]) {
      if (settled.status === 'fulfilled') allResultsRaw.push(...settled.value);
    }
    if (citationBatch.status === 'fulfilled') allResultsRaw.push(...citationBatch.value);

    const dedupedRaw = dedup(allResultsRaw);

    let vectorScores: number[] = [];
    if (isEmbeddingAvailable()) {
      try {
        const queryText = `${inventionParams.title} ${inventionParams.novelElements.join(' ')} ${inventionParams.keywords.join(' ')}`;
        const resultTexts = dedupedRaw.map((r) => `${r.title} ${r.abstract ?? ''}`.slice(0, 500));
        const [queryEmb, resultEmbs] = await Promise.all([generateEmbedding(queryText), generateEmbeddings(resultTexts)]);
        vectorScores = computeVectorScores(queryEmb, resultEmbs);
      } catch (err) {
        console.warn('Embedding generation failed:', err);
      }
    }

    const deduped = rankByRelevance(dedupedRaw, inventionParams.keywords, inventionParams.novelElements, inventionParams.cpcCodes, vectorScores);

    await updateSearchProgress(searchId, 65, undefined, 'Enriching top patents with full claims...');

    // ── Step 5b: Enrich top patents + snippets ────────────────────────────────
    const enriched = await enrichPatentClaims(deduped, 4);
    const withSnippets = enrichWithSnippets(enriched, `${inventionParams.title} ${inventionParams.novelElements.join(' ')}`);

    const sec103Pairs = findObviousnessPairs({ novelElements: inventionParams.novelElements, keywords: inventionParams.keywords }, withSnippets, 5);
    const sec103Context = formatPairsForPrompt(sec103Pairs, inventionParams.novelElements);

    // ── Step 6: Worker 3 — Parallel patent comparison (gpt-oss-20b) ──────────
    await updateSearchProgress(searchId, 70, undefined, `Worker 3: AI comparing top ${Math.min(5, withSnippets.length)} patents against invention features (parallel)...`);

    let comparisons: import('@/lib/llm/workers').ComparisonJSON[] = [];
    if (groqKey) {
      comparisons = await runWorker3Batch(
        features ?? {
          field: inventionParams.technologyDomain,
          problem: '',
          concept: inventionParams.title,
          summary_25_words: inventionParams.title,
          features: inventionParams.novelElements.map((e, i) => ({ id: `F${i + 1}`, text: e, type: 'essential' as const, weight: 5, terms: [] })),
          components: [],
          technical_effects: [],
          ...inventionParams,
        },
        withSnippets,
        groqKey,
        5
      );
    }

    // ── Step 7: Worker 4 — Report generation ─────────────────────────────────
    const w4Model = aiModel === 'groq-llama-3.3-70b' ? 'gpt-oss-120b (Groq)' : aiModel;
    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'generating', progress: 78, progressLabel: `Worker 4: Generating report with ${w4Model}...` },
    });

    let patentabilityReport: string;
    let clientReport: string;
    let rating: string;
    let referencesFound: number;

    if (groqKey || userApiKey) {
      const result = await runWorker4(
        features ?? {
          field: inventionParams.technologyDomain,
          problem: '',
          concept: inventionParams.title,
          summary_25_words: inventionParams.title,
          features: inventionParams.novelElements.map((e, i) => ({ id: `F${i + 1}`, text: e, type: 'essential' as const, weight: 5, terms: [] })),
          components: [],
          technical_effects: [],
          ...inventionParams,
        },
        comparisons,
        withSnippets,
        aiModel,
        userApiKey,
        groqKey,
        jurisdiction
      );
      patentabilityReport = result.patentabilityReport;
      clientReport        = result.clientReport;
      rating              = result.rating;
      referencesFound     = result.referencesFound;
    } else {
      // No Groq key and no user key — use legacy generateReports
      const result = await generateReports(inventionParams, withSnippets, sec103Context, aiModel, userApiKey, jurisdiction);
      patentabilityReport = result.patentabilityReport;
      clientReport        = result.clientReport;
      rating              = result.rating;
      referencesFound     = result.referencesFound;
    }

    await updateSearchProgress(searchId, 95, undefined, 'Saving report to database...');

    // ── Step 8: Save ─────────────────────────────────────────────────────────
    await prisma.report.create({
      data: { searchId, patentabilityMd: patentabilityReport, clientReportMd: clientReport, referencesFound, patentabilityRating: rating },
    });

    await prisma.search.update({
      where: { id: searchId },
      data: { status: 'completed', progress: 100, progressLabel: null, queryLog: JSON.stringify(queryLog) },
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Background search error for ${searchId}:`, err);
    await prisma.search.update({
      where: { id: searchId },
      data: {
        status: 'failed',
        progress: 0,
        progressLabel: null,
        errorMessage,
        queryLog: queryLog.length > 0 ? JSON.stringify(queryLog) : undefined,
      },
    });
    throw err;
  }
}
