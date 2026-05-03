// Parallel AI worker system for Priora.ai patent search.
//
// Token budget per search (all on free Groq tier):
//   W1  llama-4-scout:  ~1K tokens  (500K/day → ~500 searches/day)
//   W2A/B/C gpt-oss-20b: ~2.5K total (200K/day → ~80 searches/day on W2 budget)
//   W3×5 gpt-oss-20b:  ~6K tokens  (200K/day → ~33 searches/day on W3 budget)
//   W4  gpt-oss-120b:  ~4.5K tokens (200K/day → ~44 searches/day on W4 budget)
// Total: ~14K tokens distributed across 4 separate quotas (vs old 10.5K all on one 100K-TPD model)

import type { UnifiedResult } from '@/lib/search';
import type { Jurisdiction } from '@/lib/llm/groq';
import type { AIModel } from '@/lib/llm/providers';
import {
  buildPatentabilityReport,
  buildClientReport,
  derivePatentabilityRating,
} from '@/lib/llm/report-builder';
import { callLLM, resolveApiKey } from '@/lib/llm/providers';

// ── Internal Groq caller (by exact model ID) ──────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Model IDs for each worker role
const W1_MODEL  = 'meta-llama/llama-4-scout-17b-16e-instruct'; // 500K TPD, 30K TPM
const W23_MODEL = 'openai/gpt-oss-20b';                         // 200K TPD, 8K TPM
const W4_MODEL  = 'openai/gpt-oss-120b';                        // 200K TPD, 8K TPM

async function groqCall(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq [${model}] ${res.status}: ${body.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`Groq [${model}] returned empty response`);
  return text;
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return fallback;
    return JSON.parse(clean.slice(s, e + 1)) as T;
  } catch {
    return fallback;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureJSON {
  field: string;
  problem: string;
  concept: string;
  summary_25_words: string;
  features: Array<{
    id: string;
    text: string;
    type: 'essential' | 'optional';
    weight: number;
    terms: string[];
  }>;
  components: string[];
  technical_effects: string[];
  // Compat fields for the existing search/report pipeline
  title: string;
  keywords: string[];
  novelElements: string[];
  synonyms: string[];
  cpcCodes: string[];
  technologyDomain: string;
  claimsTerms: string[];
}

export interface SearchPlan {
  keywordQuery: string;
  novelQuery: string;
  claimQuery: string;
  synonymQuery: string;
  cpcCodes: string[];
}

export interface ComparisonJSON {
  result_id: string;
  publication_number: string;
  title: string;
  assignee: string;
  date: string;
  score: number;
  risk: 'low' | 'medium' | 'high' | 'very_high';
  matched_feature_ids: string[];
  partial_feature_ids: string[];
  missing_feature_ids: string[];
  best_evidence: string[];
  main_overlap: string;
  main_difference: string;
}

export interface WorkerReportOutput {
  patentabilityReport: string;
  clientReport: string;
  rating: string;
  referencesFound: number;
}

// ── Worker 1: Feature Extraction ──────────────────────────────────────────────

const W1_SYSTEM = `You are Priora.ai Worker 1: Compact Patent Feature Extractor.
Convert the invention into a compact technical feature JSON for downstream search workers.
Rules: Extract only technical content. Feature IDs: F1, F2, F3...
Map fields (title, keywords, novelElements, synonyms, cpcCodes, technologyDomain, claimsTerms) for patent search compatibility.
Return ONLY valid JSON. Be precise and concise. No markdown.`;

const W1_FORMAT = `{"field":"","problem":"","concept":"","summary_25_words":"",
"features":[{"id":"F1","text":"","type":"essential","weight":5,"terms":[]}],
"components":[],"technical_effects":[],
"title":"","keywords":[],"novelElements":[],"synonyms":[],"cpcCodes":["G06F"],"technologyDomain":"","claimsTerms":[]}`;

export async function runWorker1(
  description: string,
  groqKey: string
): Promise<FeatureJSON | null> {
  try {
    const raw = await groqCall(
      groqKey,
      W1_MODEL,
      W1_SYSTEM,
      `Extract features from this invention. Return JSON only matching this exact format:\n${W1_FORMAT}\n\nInvention description:\n${description.slice(0, 3500)}`,
      650
    );
    const result = parseJSON<FeatureJSON | null>(raw, null);
    if (!result?.features?.length || !result?.title) return null;
    return result;
  } catch (err) {
    console.error('Worker 1 failed:', err);
    return null;
  }
}

// ── Workers 2A / 2B / 2C: Parallel search prep ───────────────────────────────

interface QueryExpansion {
  broad: string[];
  medium: string[];
  narrow: string[];
  patentsview: string[];
  must_terms: string[];
}

interface CpcExpansion {
  cpc: string[];
  ipc: string[];
}

interface SynonymExpansion {
  synonyms: string[];
  broader: string[];
  patent_phrases: string[];
}

async function runWorker2A(compact: string, groqKey: string): Promise<QueryExpansion | null> {
  try {
    const raw = await groqCall(
      groqKey, W23_MODEL,
      `Generate patent search queries from feature JSON. Return JSON only. Max 5 per array.`,
      `Return: {"broad":[],"medium":[],"narrow":[],"patentsview":[],"must_terms":[]}\n\nFeatures:\n${compact}`,
      380
    );
    return parseJSON<QueryExpansion | null>(raw, null);
  } catch { return null; }
}

async function runWorker2B(compact: string, groqKey: string): Promise<CpcExpansion | null> {
  try {
    const raw = await groqCall(
      groqKey, W23_MODEL,
      `Suggest CPC/IPC classification codes for patent searching from feature JSON. Return JSON only.`,
      `Return: {"cpc":["H04L27/00"],"ipc":["H04L"]}\nOnly high/medium confidence. Max 5 each.\n\nFeatures:\n${compact}`,
      200
    );
    return parseJSON<CpcExpansion | null>(raw, null);
  } catch { return null; }
}

async function runWorker2C(compact: string, groqKey: string): Promise<SynonymExpansion | null> {
  try {
    const raw = await groqCall(
      groqKey, W23_MODEL,
      `Expand technical terms for patent prior-art search. Synonyms, broader terms, patent phrases. Return JSON only.`,
      `Return: {"synonyms":[],"broader":[],"patent_phrases":[]}\nMax 10 each.\n\nFeatures:\n${compact}`,
      280
    );
    return parseJSON<SynonymExpansion | null>(raw, null);
  } catch { return null; }
}

export async function runWorkers2(
  features: FeatureJSON,
  groqKey: string
): Promise<{ queries: QueryExpansion | null; cpc: CpcExpansion | null; synonyms: SynonymExpansion | null }> {
  const compact = JSON.stringify({
    field: features.field,
    concept: features.concept,
    features: features.features.slice(0, 6).map(f => ({
      id: f.id,
      text: f.text,
      terms: f.terms.slice(0, 4),
    })),
    components: features.components.slice(0, 5),
    effects: features.technical_effects.slice(0, 4),
  });

  const [q, c, s] = await Promise.allSettled([
    runWorker2A(compact, groqKey),
    runWorker2B(compact, groqKey),
    runWorker2C(compact, groqKey),
  ]);

  return {
    queries: q.status === 'fulfilled' ? q.value : null,
    cpc:     c.status === 'fulfilled' ? c.value : null,
    synonyms: s.status === 'fulfilled' ? s.value : null,
  };
}

// Build the final search plan from worker outputs (code-based merge, no LLM)
export function buildSearchPlanFromWorkers(
  features: FeatureJSON,
  queries: QueryExpansion | null,
  cpc: CpcExpansion | null,
  synonyms: SynonymExpansion | null
): SearchPlan {
  const words = (s: string) =>
    s.split(/\s+/).filter(w => w.length > 2).slice(0, 10).join(' ');

  const keywordQuery  = queries?.broad?.[0]  || words(features.keywords.join(' '))     || features.concept;
  const novelQuery    = queries?.medium?.[0] || words(features.novelElements.join(' ')) || keywordQuery;
  const claimQuery    = queries?.narrow?.[0] || words(features.claimsTerms.join(' '))   || keywordQuery;
  const synonymQuery  =
    synonyms?.patent_phrases?.[0] ||
    synonyms?.synonyms?.slice(0, 5).join(' ')  ||
    words(features.synonyms.join(' '))          ||
    keywordQuery;

  const workerCpcs  = (cpc?.cpc ?? []).filter(Boolean).slice(0, 3);
  const featureCpcs = features.cpcCodes.filter(Boolean).slice(0, 3);
  const cpcCodes    = Array.from(new Set([...workerCpcs, ...featureCpcs])).slice(0, 3);

  return { keywordQuery, novelQuery, claimQuery, synonymQuery, cpcCodes };
}

// ── Worker 3: Per-patent comparison (parallel) ────────────────────────────────

const W3_SYSTEM = `You are Priora.ai Worker 3: Prior-Art Result Comparator.
Compare one patent against invention essential features. Use only the provided patent text.
Score 0–100: how well does this patent cover the invention features?
Risk: very_high=81-100, high=61-80, medium=31-60, low=0-30.
Return ONLY valid JSON. Be concise.`;

async function runWorker3Single(
  features: FeatureJSON,
  patent: UnifiedResult,
  groqKey: string,
  idx: number
): Promise<ComparisonJSON | null> {
  const compactFeatures = features.features
    .filter(f => f.type === 'essential')
    .map(f => `${f.id}: ${f.text}`)
    .join('\n');

  const pub = patent.patentNumber || patent.id;
  const compactPatent = {
    id: `R${idx + 1}`,
    pub,
    title: patent.title,
    abstract: (patent.abstract || '').slice(0, 700),
    assignee: patent.assignee || patent.authors || '',
    date: patent.date || patent.year || '',
  };

  try {
    const raw = await groqCall(
      groqKey, W23_MODEL, W3_SYSTEM,
      `Compare patent against invention features.\nReturn JSON: {"result_id":"R${idx+1}","publication_number":"","title":"","assignee":"","date":"","score":0,"risk":"low","matched_feature_ids":[],"partial_feature_ids":[],"missing_feature_ids":[],"best_evidence":[""],"main_overlap":"","main_difference":""}\n\nEssential features:\n${compactFeatures}\n\nPatent:\n${JSON.stringify(compactPatent)}`,
      300
    );
    return parseJSON<ComparisonJSON | null>(raw, null);
  } catch (err) {
    console.error(`Worker 3 error patent ${idx}:`, err);
    return null;
  }
}

export async function runWorker3Batch(
  features: FeatureJSON,
  results: UnifiedResult[],
  groqKey: string,
  limit = 5
): Promise<ComparisonJSON[]> {
  // Prefer results with patent numbers (more structured data for comparison)
  const patentResults = results.filter(r => r.patentNumber).slice(0, limit);
  const nonPatent = results.filter(r => !r.patentNumber).slice(0, Math.max(0, limit - patentResults.length));
  const candidates = [...patentResults, ...nonPatent].slice(0, limit);

  const settled = await Promise.allSettled(
    candidates.map((p, i) => runWorker3Single(features, p, groqKey, i))
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<ComparisonJSON> =>
      r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

// ── Worker 4: Final Report ────────────────────────────────────────────────────

const W4_SYSTEM_GROQ = `You are Priora.ai Worker 4: Prior-Art Report Generator.
Generate a professional patent prior-art analysis using only the compact JSON inputs.
Do NOT request full invention text or full patent documents.
Use cautious patent language. No legal opinion.
Return ONLY valid JSON: {"patentabilityReport":"...full markdown report...","rating":"HIGH PATENTABILITY|MODERATE PATENTABILITY|LOW PATENTABILITY"}`;

const W4_SYSTEM_PREMIUM = `You are Priora.ai Claude Premium Prior-Art Analyst.
Generate a deep professional prior-art analysis using compact JSON inputs only.
Use cautious patent language. No legal opinion. Output in Markdown.
Return ONLY valid JSON: {"patentabilityReport":"...full markdown report...","rating":"HIGH PATENTABILITY|MODERATE PATENTABILITY|LOW PATENTABILITY"}`;

function buildW4Prompt(
  features: FeatureJSON,
  comparisons: ComparisonJSON[],
  allResults: UnifiedResult[],
  jurisdiction: Jurisdiction
): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const compactFeatures = {
    title: features.title,
    concept: features.concept,
    domain: features.technologyDomain,
    features: features.features.map(f => `${f.id}[w${f.weight}]: ${f.text}`),
    summary: features.summary_25_words,
  };

  const compactComparisons = comparisons.slice(0, 6).map(c => ({
    pub: c.publication_number,
    title: c.title,
    assignee: c.assignee,
    date: c.date,
    score: c.score,
    risk: c.risk,
    matched: c.matched_feature_ids,
    partial: c.partial_feature_ids,
    missing: c.missing_feature_ids,
    overlap: c.main_overlap,
    diff: c.main_difference,
    evidence: c.best_evidence.slice(0, 2),
  }));

  const refList = allResults.slice(0, 20).map((r, i) => ({
    n: i + 1,
    pub: r.patentNumber || r.doi || r.id,
    title: r.title.slice(0, 80),
    src: r.source,
    url: r.url || '',
  }));

  return `Date: ${today} | Jurisdiction: ${jurisdiction} | References: ${allResults.length}

INVENTION (compact):
${JSON.stringify(compactFeatures)}

TOP PRIOR-ART COMPARISONS (pre-analyzed by Worker 3):
${JSON.stringify(compactComparisons)}

ALL REFERENCES FOUND (${allResults.length}):
${JSON.stringify(refList)}

Generate patentabilityReport in this structure:
# PATENTABILITY SEARCH REPORT
**Invention:** [title] | **Date:** ${today} | **Jurisdiction:** ${jurisdiction} | **Refs:** ${allResults.length}

---
## NOVEL ELEMENTS
[list each feature ID and text]

---
## TOP PRIOR-ART ANALYSIS
[For each comparison: pub number, title, score/10, risk, matched features, key overlap, key difference, evidence snippet]

---
## COVERAGE MATRIX
| Feature ID | Invention Feature | ${comparisons.slice(0,4).map(c => (c.publication_number || c.title).slice(0,15)).join(' | ')} |
|---|---|${comparisons.slice(0,4).map(() => '---|').join('')}
[✓=disclosed ~=partial ✗=not found]

---
## §102 ANTICIPATION ANALYSIS (${jurisdiction})
[Which single reference most closely anticipates the invention? Assess each feature.]

---
## §103 OBVIOUSNESS ANALYSIS
[Which 2-3 reference combinations could be cited? Name the combination and explain why an examiner would combine them.]

---
## NOVELTY SCORE MATRIX
| Feature ID | Feature | Score (0-10) | Risk | Assessment |
|---|---|---|---|---|
[10=fully novel, 0=fully anticipated. Score each feature.]

**Combined Patentability Score:** X/10

---
## CONCLUSION & FILING RECOMMENDATION
[Overall verdict, strongest novel features, prosecution strategy, filing type recommendation]

**PATENTABILITY RATING: [HIGH PATENTABILITY / MODERATE PATENTABILITY / LOW PATENTABILITY]**

---
## DISCLAIMER
This is AI-assisted prior-art analysis and not a legal opinion. A qualified patent professional should review the results before making filing or prosecution decisions.

---
## ALL REFERENCES (${allResults.length} found)
[Numbered list from refList, format: N. PUB — Title [Source] URL]`;
}

function inventionParamsFrom(features: FeatureJSON) {
  return {
    title: features.title,
    novelElements: features.novelElements,
    keywords: features.keywords,
    synonyms: features.synonyms,
    cpcCodes: features.cpcCodes,
    technologyDomain: features.technologyDomain,
    claimsTerms: features.claimsTerms,
  };
}

export async function runWorker4(
  features: FeatureJSON,
  comparisons: ComparisonJSON[],
  allResults: UnifiedResult[],
  aiModel: AIModel,
  userApiKey: string,
  groqKey: string,
  jurisdiction: Jurisdiction
): Promise<WorkerReportOutput> {
  const referencesFound = allResults.length;
  const inventionParams = inventionParamsFrom(features);
  const prompt = buildW4Prompt(features, comparisons, allResults, jurisdiction);

  const isGroqModel = aiModel === 'groq-llama-3.3-70b';

  // Strategy: use user's selected premium model if provided, else gpt-oss-120b
  let raw: string | null = null;

  if (!isGroqModel) {
    // User selected Claude / GPT-4o / Gemini — call via existing provider with compact input
    const apiKey = resolveApiKey(aiModel, userApiKey);
    if (apiKey) {
      try {
        raw = await callLLM(aiModel, apiKey, W4_SYSTEM_PREMIUM, prompt, 3500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota');
        if (isRateLimit) {
          console.warn(`${aiModel} rate-limited in Worker 4 — trying gpt-oss-120b`);
        } else {
          console.error(`${aiModel} Worker 4 error:`, msg);
        }
      }
    }
  }

  // Fallback: use Groq gpt-oss-120b
  if (!raw && groqKey) {
    try {
      raw = await groqCall(groqKey, W4_MODEL, W4_SYSTEM_GROQ, prompt, 3000);
    } catch (err) {
      console.error('Worker 4 gpt-oss-120b error:', err);
    }
  }

  if (raw) {
    const parsed = parseJSON<{ patentabilityReport: string; rating: string } | null>(raw, null);
    if (parsed?.patentabilityReport) {
      const rating = parsed.rating || derivePatentabilityRating(inventionParams, allResults);
      return {
        patentabilityReport: parsed.patentabilityReport,
        clientReport: buildClientReport(inventionParams, allResults, rating),
        rating,
        referencesFound,
      };
    }
    // Model returned text but not valid JSON — use raw as report
    if (raw.length > 500) {
      const rating = derivePatentabilityRating(inventionParams, allResults);
      return {
        patentabilityReport: raw,
        clientReport: buildClientReport(inventionParams, allResults, rating),
        rating,
        referencesFound,
      };
    }
  }

  // Final fallback: template report
  console.warn('Worker 4: all LLM calls failed, using template report');
  const rating = derivePatentabilityRating(inventionParams, allResults);
  return {
    patentabilityReport: buildPatentabilityReport(inventionParams, allResults, rating),
    clientReport: buildClientReport(inventionParams, allResults, rating),
    rating,
    referencesFound,
  };
}
