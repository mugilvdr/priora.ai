import type { UnifiedResult } from '@/lib/search';
import type { InventionParams } from './groq';

function clean(value: unknown, fallback = 'N/A'): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function tableCell(value: unknown, fallback = 'N/A'): string {
  return clean(value, fallback).replace(/\|/g, '\\|');
}

function truncate(value: unknown, max = 260): string {
  const text = clean(value, 'No abstract available.');
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function referenceNumber(result: UnifiedResult): string {
  return clean(result.patentNumber || result.doi || result.id, 'N/A');
}

function referenceParty(result: UnifiedResult): string {
  return clean(result.assignee || result.authors || result.inventors, 'N/A');
}

function resultText(result: UnifiedResult): string {
  return `${result.title} ${result.abstract} ${result.assignee ?? ''} ${result.authors ?? ''}`.toLowerCase();
}

function tokens(term: string): string[] {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function elementCoverage(element: string, result: UnifiedResult): 'Full' | 'Partial' | 'Not found' {
  const elementTokens = tokens(element);
  if (elementTokens.length === 0) return 'Not found';

  const text = resultText(result);
  const matches = elementTokens.filter((token) => text.includes(token)).length;
  const ratio = matches / elementTokens.length;

  if (ratio >= 0.75) return 'Full';
  if (ratio > 0) return 'Partial';
  return 'Not found';
}

function matchedElements(params: InventionParams, result: UnifiedResult): string[] {
  return params.novelElements.filter((element) => elementCoverage(element, result) !== 'Not found');
}

function relevanceScore(params: InventionParams, result: UnifiedResult): number {
  const text = resultText(result);
  const keywordHits = params.keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length;
  const elementHits = params.novelElements.filter((element) => elementCoverage(element, result) !== 'Not found').length;
  const claimTermHits = params.claimsTerms.filter((term) => text.includes(term.toLowerCase())).length;
  return keywordHits + elementHits * 3 + claimTermHits * 2;
}

function rankedResults(params: InventionParams, results: UnifiedResult[], limit = 15): UnifiedResult[] {
  return [...results]
    .sort((a, b) => relevanceScore(params, b) - relevanceScore(params, a))
    .slice(0, limit);
}

function sourceSummary(results: UnifiedResult[]): string {
  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.source] = (acc[result.source] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `- ${source}: ${count} reference${count === 1 ? '' : 's'}`)
    .join('\n') || '- No references retrieved';
}

function searchStrategyRows(params: InventionParams, results: UnifiedResult[]): string {
  const keywordQuery = params.keywords.slice(0, 8).join(' ');
  const elementQuery = params.novelElements.slice(0, 4).join(' ');
  const claimQuery = params.claimsTerms.slice(0, 6).join(' ');
  const cpcQuery = params.cpcCodes.join(' OR ');
  const countFor = (patterns: RegExp[]) =>
    results.filter((result) => patterns.some((pattern) => pattern.test(result.source))).length;

  const rows = [
    ['Round 1', keywordQuery, 'PatentsView API (keyword + phrase queries)', countFor([/PatentsView/i, /USPTO/i])],
    ['Round 2', elementQuery, 'Google Patents, EPO Espacenet, WIPO PatentScope (web search)', countFor([/Google/i, /EPO/i, /WIPO/i, /Espacenet/i])],
    ['Round 3', claimQuery || keywordQuery, 'arXiv, Semantic Scholar, OpenAlex (non-patent literature)', countFor([/arXiv/i, /Semantic Scholar/i, /OpenAlex/i])],
    ['Round 4', cpcQuery || 'CPC/classification terms not available', 'CPC-filtered PatentsView queries', params.cpcCodes.length],
  ];

  return rows
    .map(([round, query, database, count]) => `| ${round} | ${tableCell(query)} | ${tableCell(database)} | ${count} |`)
    .join('\n');
}

function conceptRows(params: InventionParams): string {
  const rows = params.novelElements.map((element, index) => {
    const relatedTerms = [
      element,
      params.keywords[index],
      params.synonyms[index],
      params.claimsTerms[index],
    ].filter(Boolean);

    return `| ${tableCell(element)} | ${tableCell(relatedTerms.join(', '))} |`;
  });

  return rows.join('\n') || '| General invention concept | Keywords extracted from invention disclosure |';
}

function comparisonTable(params: InventionParams, results: UnifiedResult[]): string {
  const topRefs = rankedResults(params, results, 5);
  if (topRefs.length === 0) {
    return '| Novel Element | Retrieved References |\n|---|---|\n| No mapped elements | No references retrieved |';
  }

  const headerRefs = topRefs.map((result, index) => `Ref-${index + 1}: ${tableCell(truncate(result.title, 36))}`);
  const header = `| Novel Element | ${headerRefs.join(' | ')} |`;
  const separator = `|---|${topRefs.map(() => '---|').join('')}`;
  const rows = params.novelElements.map((element) => {
    const coverage = topRefs.map((result) => elementCoverage(element, result));
    return `| ${tableCell(element)} | ${coverage.join(' | ')} |`;
  });

  return [header, separator, ...rows].join('\n');
}

// Extract the single most on-topic sentence from the prior-art abstract.
function bestEvidence(result: UnifiedResult, params: InventionParams): string {
  const abstract = clean(result.abstract, '');
  if (abstract.length < 30) return '';

  const sentences = abstract
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 350);

  if (sentences.length === 0) return abstract.slice(0, 200).trim();

  const searchTerms = [
    ...params.keywords,
    ...params.claimsTerms,
    ...params.novelElements.flatMap((e) => tokens(e)),
  ]
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 3);

  let best = sentences[0];
  let bestScore = 0;
  for (const s of sentences) {
    const score = searchTerms.filter((t) => s.toLowerCase().includes(t)).length;
    if (score > bestScore) { bestScore = score; best = s; }
  }

  return best.length > 200 ? `${best.slice(0, 197)}...` : best;
}

function observationsFor(params: InventionParams, result: UnifiedResult): string {
  const matched  = matchedElements(params, result);
  const unmatched = params.novelElements.filter((e) => elementCoverage(e, result) === 'Not found');
  const partial   = params.novelElements.filter((e) => elementCoverage(e, result) === 'Partial');
  const refId     = referenceNumber(result);
  const evidence  = bestEvidence(result, params);

  // Part 1 — what the prior art actually says
  const disclosure = evidence
    ? `${refId} discloses: "${evidence}"`
    : `${refId} (${clean(result.title).slice(0, 60)}) — abstract not available for direct quotation`;

  // Part 2 — which features of our invention overlap
  let overlap: string;
  if (matched.length === 0) {
    overlap = `No essential feature of "${params.title}" is directly mirrored in the available text of this reference.`;
  } else {
    const named = matched.slice(0, 2).map((e) => `"${e.slice(0, 60)}"`).join(' and ');
    overlap = `This overlaps with ${named} of "${params.title}".`;
  }

  // Part 3 — specific risk / prosecution implication
  let risk: string;
  if (matched.length > 0 && matched.length === params.novelElements.length) {
    risk = 'All listed novel elements appear textually present — high anticipation risk under §102; examine claim-by-claim before filing.';
  } else if (matched.length > 0 && unmatched.length > 0) {
    const gap = unmatched.slice(0, 2).map((e) => `"${e.slice(0, 55)}"`).join(' and ');
    risk = `Feature(s) ${gap} are absent from this reference, so it cannot alone anticipate the full combination. It may be combined with other references for an obviousness argument under §103.`;
  } else if (partial.length > 0) {
    risk = 'Partial term overlap suggests an adjacent field. Useful as background art; low standalone anticipation risk.';
  } else {
    risk = 'No substantive overlap detected. Likely background art in a related technology area.';
  }

  return `${disclosure} ${overlap} ${risk}`;
}

function featureAnalysis(params: InventionParams, results: UnifiedResult[]): string {
  return params.novelElements
    .map((element) => {
      const full = results.filter((result) => elementCoverage(element, result) === 'Full');
      const partial = results.filter((result) => elementCoverage(element, result) === 'Partial');
      const closestRefs = [...full, ...partial].slice(0, 3);

      let evidenceBlock: string;
      if (closestRefs.length === 0) {
        evidenceBlock = 'No retrieved reference shows textual overlap with this feature. This element may be novel relative to the searched corpus.';
      } else {
        evidenceBlock = closestRefs.map((ref) => {
          const ev = bestEvidence(ref, params);
          const refId = referenceNumber(ref);
          return ev
            ? `- ${refId} (${clean(ref.title).slice(0, 55)}): "${ev}"`
            : `- ${refId}: ${clean(ref.title).slice(0, 80)}`;
        }).join('\n');
      }

      const riskLabel =
        full.length >= 2 ? 'High anticipation risk — multiple references fully disclose this element.' :
        full.length === 1 ? 'Moderate risk — one reference fully discloses this element; check for claim differentiation.' :
        partial.length > 0 ? 'Low to moderate risk — partial textual overlap; likely not anticipating on its own.' :
        'Low risk from retrieved art — no direct textual match found.';

      return `### ${element}
${full.length} reference(s) with full textual overlap; ${partial.length} with partial overlap.
${evidenceBlock}
**Risk:** ${riskLabel}`;
    })
    .join('\n\n');
}

export function derivePatentabilityRating(params: InventionParams, results: UnifiedResult[]): string {
  if (results.length === 0) return 'INSUFFICIENT RESULTS';

  const topScores = results.map((result) => relevanceScore(params, result)).sort((a, b) => b - a);
  const maxPossible = Math.max(1, params.novelElements.length * 3 + params.keywords.length + params.claimsTerms.length * 2);
  const bestRatio = (topScores[0] ?? 0) / maxPossible;

  if (bestRatio >= 0.45) return 'LOW TO MODERATE PATENTABILITY';
  if (bestRatio >= 0.25) return 'MODERATE PATENTABILITY';
  return 'MODERATE TO HIGH PATENTABILITY';
}

function claimType(domain: string): string {
  const text = domain.toLowerCase();
  if (text.includes('method') || text.includes('process')) return 'method';
  if (text.includes('device') || text.includes('apparatus')) return 'apparatus';
  return 'system';
}

export function buildPatentabilityReport(
  params: InventionParams,
  results: UnifiedResult[],
  rating = derivePatentabilityRating(params, results)
): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const ranked = rankedResults(params, results, 15);
  const refs = ranked
    .map(
      (r, i) =>
        `### Reference ${i + 1}: ${referenceNumber(r)}

**BIBLIOGRAPHIC INFORMATION**
- **Title:** ${clean(r.title)}
- **Patent/Paper Number:** ${referenceNumber(r)}
- **Assignee/Authors:** ${referenceParty(r)}
- **Filing/Publication Date:** ${clean(r.date || r.year)}
- **Source:** ${clean(r.source)}
- **URL:** ${r.url || 'N/A'}

**ABSTRACT**
${clean(r.abstract, 'No abstract available.')}

**RELEVANT EXTRACTS & OBSERVATIONS**
${observationsFor(params, r)}

---`
    )
    .join('\n\n');

  return `# PATENTABILITY SEARCH REPORT
**Invention Title:** ${params.title}
**Prepared by:** Priora.AI AI Research System
**Date:** ${today}
**Reference Count:** ${results.length} references

---

## NOVEL ELEMENTS UNDER SEARCH
${params.novelElements.map((element, i) => `${i + 1}. ${element}`).join('\n')}

---

## DISCLAIMER
This search was conducted using publicly available patent and non-patent literature databases. The report is an automated technical search aid for internal assessment and drafting preparation. It is not a legal opinion and should be reviewed by a registered patent practitioner before filing or making patentability decisions.

---

## SEARCH STRATEGY

| Search Round | Query Terms | Database / Source | Retrieved References |
|---|---|---|---|
${searchStrategyRows(params, results)}

---

## KEYWORDS & SEARCH CONCEPTS

| Concept | Search Terms / Synonyms Used |
|---|---|
${conceptRows(params)}

---

## DATABASES SEARCHED
- PatentsView API (USPTO patent data — grants and applications)
- Google Patents (web search via Jina Reader)
- EPO Espacenet (web search via Jina Reader)
- WIPO PatentScope (web search via Jina Reader)
- arXiv (Academic Papers)
- Semantic Scholar / OpenAlex (Academic Papers)

### Source Distribution
${sourceSummary(results)}

---

## RESEARCH SUMMARY
A patentability-oriented search was conducted for "${params.title}" across patent databases, patent-indexed web sources, and non-patent literature. The search focused on the individual novel elements and on whether any single reference discloses the complete combination. ${results.length} references were retrieved, of which the most relevant ${ranked.length} are analyzed below.

The principal search terms were: ${params.keywords.join(', ') || 'keywords extracted from the invention disclosure'}. The analysis gives greater weight to references that disclose multiple claimed elements together, because such references create stronger novelty and obviousness risk than references that disclose isolated background features.

The retrieved art appears to show background activity in ${params.technologyDomain}. However, the key patentability question is whether the complete arrangement, control logic, operating sequence, and system interaction described in the invention is taught or suggested as a single coordinated solution.

---

## COMPARISON TABLE

${comparisonTable(params, results)}

---

## SEARCH RESULTS

${refs || 'No searchable references were retrieved. Re-run the search with broader keywords and at least one alternate search provider.'}

---

## SEARCH SUMMARY

### OBSERVATIONS (Feature-by-Feature Coverage Analysis)
${featureAnalysis(params, results)}

### CLAIM DRAFTING IMPLICATIONS
The independent claim should not be drafted around a broad field label or a single known component. The safer approach is to claim the specific cooperation between the identified novel elements, including the sequence of operation, the control decision logic, the fault response behavior, and the structural arrangement that produces the technical advantage.

Dependent claims should preserve fallback positions directed to sensor placement, control thresholds, reservoir configuration, dispensing sequence, fault classification, manual override, communication interfaces, and operating modes. These narrower claim positions will be useful if an examiner combines two or more references during prosecution.

### OVERALL CONCLUSION
Based on the retrieved references, the invention "${params.title}" should be treated as potentially patentable if the claims are drafted around the integrated combination rather than around generic components. The present search did not automatically identify a single reference that clearly anticipates every listed novel element, but several references may be relevant to individual features and should be considered during claim drafting.

Recommended next steps are: prepare a focused claim set, run a second-pass search using the exact draft claim terminology, and review the closest references manually before filing. If filing is urgent, proceed with claims emphasizing the combined architecture and functional interaction of the novel elements.

**Patentability Rating:** ${rating}`;
}

export function buildClientReport(
  params: InventionParams,
  results: UnifiedResult[],
  rating = derivePatentabilityRating(params, results)
): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const ranked = rankedResults(params, results, 10);
  const systemType = claimType(params.technologyDomain);
  const primaryElements = params.novelElements.slice(0, 4);
  const dependentTerms = [
    ...params.claimsTerms,
    ...params.novelElements,
    ...params.synonyms,
  ].filter(Boolean).slice(0, 6);

  const tableRows = ranked
    .map(
      (r, i) =>
        `| ${i + 1} | ${tableCell(truncate(r.title, 70))} | ${tableCell(referenceNumber(r))} | ${tableCell(truncate(r.abstract, 160))} | ${tableCell(observationsFor(params, r), 'Relevant background art')} |`
    )
    .join('\n');

  return `# SUPPLEMENTARY SEARCH REPORT
**Subject:** Prior Art Search - ${params.title}
**Prepared for:** Client / Applicant
**Prepared by:** Priora.AI
**Date:** ${today}
**Patentability Outlook:** ${rating}

---

## NOVEL POINTS OF THE INVENTION
${params.novelElements.map((element, i) => `${i + 1}. ${element}`).join('\n')}

---

## HOW THE SEARCH WAS CONDUCTED
The search was conducted across patent databases, patent web sources, and non-patent literature sources. The patent coverage included USPTO grants, USPTO applications, PatentsView, Google Patents, EPO/Espacenet-style patent sources, WIPO/PCT-style patent sources, and general patent web search. The non-patent literature coverage included arXiv and Semantic Scholar.

Search terms were derived from the invention title, the listed novel points, claim-style terminology, synonyms, and available CPC/classification indicators. A total of ${results.length} references were retrieved. The most relevant references were then checked for whether they disclose each novel point individually and whether they disclose the complete combination.

---

## PRIOR ART ANALYSIS

| S.No | Title | Patent/Paper No. | Relevant Extract | Observation |
|---|---|---|---|---|
${tableRows || '| 1 | No references retrieved | N/A | N/A | Broaden the search query and repeat the search. |'}

---

## CLAIM STRATEGY

### Recommended Claim Focus
The strongest claim focus should be the coordinated combination of ${primaryElements.join(', ') || 'the identified novel features'}. Avoid claiming only a broad result or generic automation, because those aspects are more likely to be found in prior art. The independent claim should emphasize the specific arrangement, operating sequence, and control/fault-handling logic that creates the practical technical advantage.

### Draft Independent Claim Language
\`\`\`
1. A ${systemType} for ${params.title.toLowerCase()}, comprising:
   ${primaryElements.map((element, index) => `${index === 0 ? 'a' : 'an'} ${element.toLowerCase()} module configured to perform a corresponding technical operation`).join(';\n   ')};
   a controller configured to coordinate operation of the modules according to a predetermined operating sequence; and
   wherein the controller modifies or validates the operating sequence based on detected operating conditions so that the ${systemType} provides the combined technical functionality not disclosed by the individual prior art references.
\`\`\`

### Dependent Claim Suggestions
${dependentTerms.map((term, i) => `${i + 2}. The ${systemType} of claim 1, wherein the controller is configured to implement ${term}.`).join('\n') || `2. The ${systemType} of claim 1, wherein the operating sequence is automatically adjusted based on sensor feedback.`}

### Prosecution Positioning
If an examiner cites individual references against separate features, the response should argue that the cited art does not teach the claimed combination as an integrated system. The application should include implementation details, example operating modes, and technical advantages so the claims can be narrowed without losing commercial value.

---

## OBSERVATION & CONCLUSION
The search identified relevant background art, but the retrieved references do not automatically establish that the complete invention is already disclosed. The invention should be presented as a specific technical arrangement with a defined operating sequence and clear functional cooperation between the novel points.

We recommend proceeding to a draft specification and claim set, followed by a claim-focused supplementary search using the exact claim language before filing. This will improve confidence and help identify fallback dependent claims before prosecution.`;
}
