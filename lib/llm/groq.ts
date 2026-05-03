import type { UnifiedResult } from '@/lib/search';
import {
  buildClientReport,
  buildPatentabilityReport,
  derivePatentabilityRating,
} from './report-builder';
import { callLLM, resolveApiKey, type AIModel } from './providers';

export type Jurisdiction = 'US' | 'IN' | 'GLOBAL';

export interface InventionParams {
  title: string;
  novelElements: string[];
  keywords: string[];
  synonyms: string[];
  cpcCodes: string[];
  technologyDomain: string;
  claimsTerms: string[];
}

export interface ReportOutput {
  patentabilityReport: string;
  clientReport: string;
  rating: string;
  referencesFound: number;
}

export async function extractInventionParams(
  description: string,
  aiModel: AIModel = 'groq-llama-3.3-70b',
  userApiKey = ''
): Promise<InventionParams> {
  const systemPrompt = `You are a patent analyst and IP attorney assistant. Extract structured information from an invention description.
Return ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "title": "concise invention title (max 12 words)",
  "novelElements": ["element1", "element2", "element3", "element4", "element5"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "synonyms": ["synonym1", "synonym2", "synonym3", "synonym4"],
  "cpcCodes": ["H04L27/00", "G06F17/00"],
  "technologyDomain": "Technology domain description",
  "claimsTerms": ["term1", "term2", "term3", "term4", "term5"]
}

Guidelines:
- novelElements: the key novel/inventive features that differentiate from prior art
- keywords: best search terms for patent databases (technical, specific)
- synonyms: alternative terms for the key concepts
- cpcCodes: 2-4 most relevant CPC classification codes
- claimsTerms: technical terms likely to appear in patent claims`;

  // Always use Groq for extraction — fast JSON task, avoids burning quota on premium models.
  const groqKey = resolveApiKey('groq-llama-3.3-70b');
  let content = '{}';
  if (groqKey) {
    try {
      content = await callLLM(
        'groq-llama-3.3-70b',
        groqKey,
        systemPrompt,
        `Extract structured invention parameters from this description:\n\n${description}`,
        1024
      );
    } catch (apiErr) {
      // Extraction failure is non-fatal — fall back to keyword-based extraction below
      console.error('extractInventionParams LLM error (using fallback):', apiErr);
    }
  }

  try {
    const jsonStr = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
    const parsed = JSON.parse(jsonStr);
    return {
      title: parsed.title ?? 'Untitled Invention',
      novelElements: parsed.novelElements ?? [],
      keywords: parsed.keywords ?? [],
      synonyms: parsed.synonyms ?? [],
      cpcCodes: parsed.cpcCodes ?? [],
      technologyDomain: parsed.technologyDomain ?? 'General Technology',
      claimsTerms: parsed.claimsTerms ?? [],
    };
  } catch {
    const words = description.split(' ').slice(0, 5).join(' ');
    return {
      title: words,
      novelElements: [description.substring(0, 100)],
      keywords: description.split(' ').slice(0, 8),
      synonyms: [],
      cpcCodes: ['G06F'],
      technologyDomain: 'Technology',
      claimsTerms: [],
    };
  }
}

export async function generateReports(
  inventionParams: InventionParams,
  searchResults: UnifiedResult[],
  sec103Context = '',
  aiModel: AIModel = 'groq-llama-3.3-70b',
  userApiKey = '',
  jurisdiction: Jurisdiction = 'US'
): Promise<ReportOutput> {
  const referencesFound = searchResults.length;

  const apiKey = resolveApiKey(aiModel, userApiKey);

  // Hard fail — never silently downgrade to a different model than what was requested.
  if (!apiKey) {
    if (aiModel !== 'groq-llama-3.3-70b') {
      const option = aiModel;
      throw new Error(
        `No API key available for ${option}. Please provide your API key in Advanced Settings, ` +
        `or ask your admin to configure the server environment variable for this model.`
      );
    }
    throw new Error(
      'No GROQ_API_KEY configured. Please set GROQ_API_KEY in your server environment variables.'
    );
  }

  const resultsText = searchResults
    .slice(0, 15)
    .map((r, i) => {
      const patNum = r.patentNumber ? ` [${r.patentNumber}]` : '';
      const auth = r.assignee || r.authors || 'N/A';
      const dt = r.date || r.year || 'N/A';
      const abs = r.abstract ? r.abstract.substring(0, 300) : 'No abstract available.';
      return `[REF-${i + 1}]${patNum} ${r.title} | Source: ${r.source} | ${auth} | ${dt}\nURL: ${r.url || 'N/A'}\n${abs}`;
    })
    .join('\n\n');

  const systemPrompt = `You are a senior patent examiner and prior art specialist at Priora.AI.
You conduct professional prior art searches and produce patentability reports used by IP attorneys.
Output must be technically precise, legally structured Markdown inside a JSON object.`;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const { legalFramework, databasesSearched, jurisdictionNote, filingNote } =
    getJurisdictionContext(jurisdiction);

  const disclaimer = buildDisclaimer(jurisdiction);

  const userPrompt = `Analyze these prior art references against the invention and generate a professional patentability search report.

INVENTION: ${inventionParams.title}
DOMAIN: ${inventionParams.technologyDomain}
CPC CODES: ${inventionParams.cpcCodes.join(', ') || 'N/A'}
JURISDICTION: ${jurisdiction} — ${jurisdictionNote}

NOVEL ELEMENTS (label as NE-1, NE-2, etc. throughout the report):
${inventionParams.novelElements.map((e, i) => `NE-${i + 1}: ${e}`).join('\n')}

KEYWORDS SEARCHED: ${inventionParams.keywords.join(', ')}
CLAIM TERMS: ${inventionParams.claimsTerms.join(', ')}

PRIOR ART REFERENCES (${referencesFound} found — top refs shown below):
${resultsText}

---
${sec103Context ? `\n${sec103Context}\n\n---` : ''}

Return ONLY this JSON (no markdown fences around the JSON itself):
{"patentabilityReport": "...", "rating": "HIGH PATENTABILITY" or "MODERATE PATENTABILITY" or "LOW PATENTABILITY"}

patentabilityReport must follow this EXACT structure:

# PATENTABILITY SEARCH REPORT
**Invention Title:** ${inventionParams.title}
**Prepared by:** Priora.AI Research System
**Date:** ${today}
**Technology Domain:** ${inventionParams.technologyDomain}
**Jurisdiction:** ${jurisdiction}
**References Analyzed:** ${referencesFound}

---

## IMPORTANT DISCLAIMER
${disclaimer}

---

## NOVEL ELEMENTS UNDER SEARCH
${inventionParams.novelElements.map((e, i) => `**NE-${i + 1}:** ${e}`).join('\n')}

---

## DATABASES SEARCHED
${databasesSearched}

---

## SEARCH RESULTS

[For EACH reference below, write a full entry:]

### [N]. [Patent Number or Paper ID] — [Title]
| Field | Value |
|---|---|
| **Type** | [Patent Grant / Patent Application / Academic Paper] |
| **Assignee / Authors** | [name] |
| **Date** | [date] |
| **Source** | [source name] |
| **URL** | [url] |

**Abstract:** [abstract text, up to 300 chars]

**Relevance Score: [X]/10**
**Novel Elements Coverage:**
- NE-1: [✓ Fully covers / ~ Partially covers / ✗ Not covered] — [one-sentence reason]
- NE-2: [✓/~/✗] — [reason]
[continue for all novel elements]

**Key Observation:** [2-3 sentences: what the reference discloses, how it overlaps or differs from the invention's claimed features]

---

## COVERAGE MATRIX

| Novel Element | [Ref 1 short title] | [Ref 2 short] | [Ref 3 short] | [Ref 4 short] | [Ref 5 short] |
|---|---|---|---|---|---|
[For each NE-N row: ✓ = fully covered, ~ = partially, ✗ = not found in that ref]

---

${legalFramework}

---

## NOVELTY SCORE MATRIX

| Novel Element | Novelty Score (0–10) | Assessment |
|---|---|---|
[10 = completely novel, no prior art found; 0 = fully anticipated. Assess each NE-N]

**Combined Patentability Score:** [X]/10

---

## RESEARCH SUMMARY & CONCLUSION

### Technology Landscape
[2 paragraphs: what exists in the field, density of prior art, key players/assignees found]

### Differentiating Factors
[1-2 paragraphs: what makes this invention distinct from the searched prior art, strongest novel elements]

### Overall Assessment
[2 paragraphs: overall patentability verdict, which elements are most patentable, which are at risk, prosecution strategy]

${filingNote}

**PATENTABILITY RATING: [HIGH PATENTABILITY / MODERATE PATENTABILITY / LOW PATENTABILITY]**

---

## IDS — INFORMATION DISCLOSURE STATEMENT
The following references must be disclosed when filing (duty of candor):
[Bullet list of all US patent numbers found (USxxxxxxx, USxxxxxxxx format), sorted. One per line.]`;

  // Groq handles up to 8000 tokens quickly; other providers get 3500 to stay within Vercel 60s limit.
  const maxReportTokens = aiModel === 'groq-llama-3.3-70b' ? 8000 : 3500;

  // Call the selected model.
  // On rate-limit (429) fall back to the template report so the search completes
  // with all found references rather than being discarded entirely.
  let content: string;
  try {
    content = await callLLM(aiModel, apiKey, systemPrompt, userPrompt, maxReportTokens);
  } catch (apiErr) {
    const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota');
    if (isRateLimit) {
      console.warn(`${aiModel} rate-limited — falling back to template report (${referencesFound} refs found)`);
      const rating = derivePatentabilityRating(inventionParams, searchResults);
      const note =
        `> **⚠ AI Analysis Unavailable** — The ${aiModel} daily token limit was reached mid-search. ` +
        `An automated reference report is shown below based on **${referencesFound} prior-art references** already found. ` +
        `To get a full AI-generated analysis, either re-run tomorrow (Groq free tier resets daily) ` +
        `or switch to a different model (Claude / GPT-4o / Gemini) in Advanced Settings.\n\n`;
      return {
        patentabilityReport: note + buildPatentabilityReport(inventionParams, searchResults, rating),
        clientReport: buildClientReport(inventionParams, searchResults, rating),
        rating,
        referencesFound,
      };
    }
    throw new Error(`${aiModel} failed to generate report: ${errMsg}`);
  }

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*/gm, '')
      .replace(/^```\s*/gm, '')
      .trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in model response');
    }

    const jsonOnly = jsonStr.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonOnly);
    const rating = parsed.rating ?? derivePatentabilityRating(inventionParams, searchResults);

    return {
      patentabilityReport: parsed.patentabilityReport || buildPatentabilityReport(inventionParams, searchResults, rating),
      clientReport: buildClientReport(inventionParams, searchResults, rating),
      rating,
      referencesFound,
    };
  } catch (parseErr) {
    // JSON parse failed but we have raw content — try to use it as-is.
    // This can happen when the model produces valid text but not wrapped in JSON.
    console.warn('Report JSON parse failed, using raw content as report:', parseErr);
    const rating = derivePatentabilityRating(inventionParams, searchResults);
    const reportText = content.length > 500
      ? content
      : buildPatentabilityReport(inventionParams, searchResults, rating);
    return {
      patentabilityReport: reportText,
      clientReport: buildClientReport(inventionParams, searchResults, rating),
      rating,
      referencesFound,
    };
  }
}

// ── Jurisdiction helpers ──────────────────────────────────────────────────────

function buildDisclaimer(jurisdiction: Jurisdiction): string {
  const base = `**AI-GENERATED PRELIMINARY SEARCH — ATTORNEY REVIEW REQUIRED**

This report was generated by Priora.AI using artificial intelligence and automated patent database searches. It is intended solely as a preliminary, internal research aid and **does NOT constitute legal advice, a formal patentability opinion, or freedom-to-operate analysis.**

**Before making any filing, licensing, investment, or commercialization decisions based on this report, you must consult a qualified, registered patent attorney or agent.** AI systems can miss prior art, misclassify references, or fail to identify obviousness combinations that a trained examiner would cite.`;

  if (jurisdiction === 'IN') {
    return (
      base +
      `\n\nFor Indian filings: This search does not replace a formal search at the Indian Patent Office (IPO). Indian patent law (Patents Act 1970, as amended) includes specific exclusions under §3 (e.g., §3(k) for computer programs per se, §3(d) for incremental pharmaceutical innovations). Compliance with these exclusions must be verified by a registered Indian patent agent.`
    );
  }
  if (jurisdiction === 'GLOBAL') {
    return (
      base +
      `\n\nFor global filings: Patent laws, disclosure requirements, and examination standards vary significantly between jurisdictions (USPTO, EPO, IPO, JPO, CNIPA, etc.). This report provides a general landscape assessment only. Country-specific prosecution strategies must be developed with local patent counsel in each target jurisdiction. PCT filing deadlines and national-phase requirements are not analyzed in this report.`
    );
  }
  return (
    base +
    `\n\nFor USPTO filings: This preliminary search does not satisfy the requirements of a professional prior art search under 37 CFR 1.56 (duty of disclosure). All references identified herein should be reviewed by a registered patent attorney before submission of an Information Disclosure Statement (IDS).`
  );
}

function getJurisdictionContext(jurisdiction: Jurisdiction) {
  if (jurisdiction === 'IN') {
    return {
      jurisdictionNote: 'Indian Patent Office (IPO) — Patents Act 1970',
      databasesSearched: `- PatentsView API (title + abstract + CPC classification) — US granted patents
- Google Patents (via Jina Reader) — global coverage including IN patents
- EPO Espacenet (via Jina Reader) — European & global patents
- WIPO PatentScope (via Jina Reader) — PCT applications
- OpenAlex (200M+ academic works)
- arXiv (preprints)
- Semantic Scholar (academic papers)
- Indian Patent Office (IPO) — via Google Patents coverage`,
      legalFramework: `## PATENTABILITY ANALYSIS — INDIAN PATENTS ACT 1970

### §2(1)(j) — Novelty (New Invention)
An invention must not form part of the state of the art anywhere in the world before the filing date.

| Novel Element | Closest Reference | Novelty Risk | Basis |
|---|---|---|---|
[For each NE-N: which reference comes closest, risk level (High/Medium/Low), why]

**Overall Novelty Risk:** [High / Medium / Low]

---

### §2(1)(ja) — Inventive Step
The invention must not be obvious to a person skilled in the art having regard to the state of the art.

Top potential combinations:
1. **[Ref A] + [Ref B]:** Threatens [NE-X and NE-Y]
2. **[Ref C] + [Ref D]:** [explanation]

**Overall Obviousness Risk:** [High / Medium / Low]

---

### §3 Exclusions Check
- §3(k) — Computer programs per se: [applicable/not applicable — reason]
- §3(d) — Incremental pharmaceutical innovation: [applicable/not applicable]
- §3(f) — Mixture of known substances: [applicable/not applicable]`,
      filingNote: `### Filing Recommendation
[Recommended filing strategy for IPO. Note any §3 exclusion risks, examination timeline (~3-4 years at IPO), and whether PCT (Patent Cooperation Treaty) international filing is advisable for global protection.]`,
    };
  }

  if (jurisdiction === 'GLOBAL') {
    return {
      jurisdictionNote: 'Global — USPTO / EPO / WIPO / JPO / CNIPA / IPO',
      databasesSearched: `- PatentsView API (US granted patents, with CPC classification)
- Google Patents (via Jina Reader) — global coverage: US, EP, CN, JP, KR, IN, WO
- EPO Espacenet (via Jina Reader) — EP, DE, FR, GB, and 100+ countries
- WIPO PatentScope (via Jina Reader) — PCT international applications
- OpenAlex (200M+ academic works)
- arXiv (preprints)
- Semantic Scholar (academic papers)`,
      legalFramework: `## 35 USC §102 — ANTICIPATION ANALYSIS (USPTO)

A single prior art reference that discloses every element of a claim anticipates under §102.

| Novel Element | Closest Single Reference | Anticipation Risk | Basis |
|---|---|---|---|
[For each NE-N]

**Overall §102 Risk:** [High / Medium / Low]

---

## 35 USC §103 — OBVIOUSNESS ANALYSIS (USPTO)

Top potential combinations:
1. **[Ref A] + [Ref B]:** Threatens [NE-X and NE-Y]
2. **[Ref C] + [Ref D]:** [explanation]

**Overall §103 Risk:** [High / Medium / Low]

---

## EPO ART. 54/56 — NOVELTY & INVENTIVE STEP (EPO)

| Novel Element | EPO Art. 54 Novelty Risk | EPO Art. 56 Inventive Step Risk |
|---|---|---|
[For each NE-N]

---

## GLOBAL FILING STRATEGY NOTES
- **PCT filing window:** 12 months from priority date for national-phase entries
- **Key jurisdictions to consider:** [list based on technology domain and assignees found]
- **Country-specific risks:** [note any jurisdictions where prior art density is highest]`,
      filingNote: `### Global Filing Recommendation
[Recommended PCT / direct national filing strategy. Identify the 3–5 most commercially important jurisdictions based on assignee locations in prior art found, and note any jurisdiction-specific examination concerns.]`,
    };
  }

  // Default: US
  return {
    jurisdictionNote: 'United States Patent and Trademark Office (USPTO)',
    databasesSearched: `- PatentsView API (title + abstract + CPC classification) — US granted patents
- Google Patents (via Jina Reader) — global patent coverage
- EPO Espacenet (via Jina Reader) — European & international patents
- WIPO PatentScope (via Jina Reader) — PCT applications
- OpenAlex (200M+ academic works)
- arXiv (preprints)
- Semantic Scholar (academic papers)`,
    legalFramework: `## 35 USC §102 — ANTICIPATION ANALYSIS

A single prior art reference that discloses every element of a claim anticipates under §102.

| Novel Element | Closest Single Reference | Anticipation Risk | Basis |
|---|---|---|---|
[For each NE-N: which ONE reference comes closest, risk level (High/Medium/Low), why]

**Overall §102 Risk:** [High / Medium / Low] — [1-sentence summary]

---

## 35 USC §103 — OBVIOUSNESS ANALYSIS

An examiner may combine references to argue obviousness. Top potential combinations:

1. **[Ref A] + [Ref B]:** Threatens [NE-X and NE-Y] — [why an examiner would combine these]
2. **[Ref C] + [Ref D]:** [explanation]
3. **[Ref A] + [Ref C] + [Ref E]:** [explanation]

**Overall §103 Risk:** [High / Medium / Low] — [1-sentence summary]`,
    filingNote: `### USPTO Filing Recommendation
[Recommend provisional vs. non-provisional filing, claim scope strategy, and any continuation/divisional considerations based on the prior art found.]`,
  };
}
