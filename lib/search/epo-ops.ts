/**
 * EPO Open Patent Services (OPS) API integration
 * OAuth2 client-credentials auth → CQL full-text search → XML biblio+abstract parse
 */

import type { UnifiedResult } from './index';
import { cachedFetch, cacheKey } from './cache';

const EPO_OPS_BASE = 'https://ops.epo.org/3.2/rest-services';
const EPO_AUTH_URL = 'https://ops.epo.org/3.2/auth/accesstoken';

// In-memory token cache (EPO tokens expire in ~20 min; we refresh 2 min early)
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const key = process.env.EPO_OPS_CONSUMER_KEY;
  const secret = process.env.EPO_OPS_CONSUMER_SECRET;
  if (!key || !secret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  try {
    const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
    const res = await fetch(EPO_AUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`EPO OPS auth failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(0, (data.expires_in - 120)) * 1000,
    };
    return tokenCache.token;
  } catch (err) {
    console.error('EPO OPS auth error:', err);
    return null;
  }
}

/** Reset cached token (forces re-auth on next call) */
export function resetEPOToken(): void {
  tokenCache = null;
}

// ── CQL query builder ─────────────────────────────────────────────────────────

function buildCQL(keywords: string, cpcCode?: string): string {
  const terms = keywords
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 7);

  if (terms.length === 0) return '';

  // "all" for ≤3 terms (precise AND), "any" for 4+ (broad OR ranked)
  const op = terms.length <= 3 ? 'all' : 'any';
  const termStr = terms.join(' ');
  const textPart = `ta ${op} "${termStr}"`;

  if (cpcCode) {
    const cpc = cpcCode.replace(/[^A-Za-z0-9/]/g, '').toUpperCase().slice(0, 20);
    return `(${textPart}) AND (ic any "${cpc}")`;
  }
  return textPart;
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function getAttr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : '';
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function extractTagLang(xml: string, tag: string, lang: string): string {
  const m = xml.match(
    new RegExp(`<${tag}[^>]*\\blang="${lang}"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  );
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function extractTagBlock(xml: string, tag: string, lang?: string): string {
  const lp = lang ? `[^>]*\\blang="${lang}"[^>]*` : '[^>]*';
  const m = xml.match(new RegExp(`<${tag}${lp}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[0] : '';
}

function extractAllInBlock(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

function parseCPCCodes(xml: string): string[] {
  const codes: string[] = [];

  // Structured CPC classification blocks
  const re = /<patent-classification[^>]*>([\s\S]*?)<\/patent-classification>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const sec = extractTag(b, 'section');
    const cls = extractTag(b, 'class');
    const sub = extractTag(b, 'subclass');
    const mg  = extractTag(b, 'main-group');
    const sg  = extractTag(b, 'subgroup');
    if (sec && sub && mg) codes.push(`${sec}${cls}${sub}${mg}/${sg}`);
  }

  // IPC-R text format: "G 06 F  17/ 10 ..."
  const ipcRe = /<text>\s*([A-H]\s+\d{2}\s+[A-Z]\s+\d{1,4}\s*\/\s*\d{2,6})/gi;
  while ((m = ipcRe.exec(xml)) !== null) {
    const code = m[1].replace(/\s+/g, '');
    if (!codes.includes(code)) codes.push(code);
  }

  return Array.from(new Set(codes)).slice(0, 6);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Document block parser ─────────────────────────────────────────────────────

function parseDocBlock(
  block: string,
  country: string,
  docNum: string,
  kind: string,
  datePublished: string,
  sourceLabel: string
): UnifiedResult | null {
  const title =
    decodeEntities(extractTagLang(block, 'invention-title', 'en')) ||
    decodeEntities(extractTag(block, 'invention-title'));

  if (!title || title.length < 5) return null;

  // Abstract: look inside <abstract lang="en"><p>…</p></abstract>
  const abstractBlock =
    extractTagBlock(block, 'abstract', 'en') || extractTagBlock(block, 'abstract');
  const abstract = abstractBlock
    ? decodeEntities(extractTag(abstractBlock, 'p') || extractTag(abstractBlock, 'abstract'))
    : '';

  // Date: prefer date-published attribute, fallback to <date> inside doc
  const rawDate = datePublished || extractTag(block, 'date') || '';
  const date =
    rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;

  // Assignee from applicants block
  const applicantsBlock = extractTagBlock(block, 'applicants');
  const applicantNames = applicantsBlock ? extractAllInBlock(applicantsBlock, 'name') : [];
  const assignee = (applicantNames[0] || 'N/A').slice(0, 150);

  // Inventors
  const inventorsBlock = extractTagBlock(block, 'inventors');
  const inventorNames = inventorsBlock ? extractAllInBlock(inventorsBlock, 'name') : [];
  const inventors = inventorNames.join('; ').slice(0, 300) || 'N/A';

  const cpcCodes = parseCPCCodes(block);
  const patentNumber = `${country}${docNum}`;

  return {
    id: patentNumber,
    title: title.slice(0, 300),
    abstract: abstract.slice(0, 1500),
    assignee,
    inventors,
    date,
    type: 'Patent',
    source: sourceLabel,
    url: `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(patentNumber)}`,
    patentNumber,
    cpcCodes,
  };
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseSearchResponse(xml: string, sourceLabel: string): UnifiedResult[] {
  const results: UnifiedResult[] = [];
  const seen = new Set<string>();

  // Collect all exchange-document opening-tag positions (with or without ops: prefix)
  const tagRe = /<(?:ops:)?exchange-document\s([^>]+)>/g;
  const positions: Array<{ attrs: string; pos: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(xml)) !== null) {
    const docNum = getAttr(m[1], 'doc-number');
    if (docNum) positions.push({ attrs: m[1], pos: m.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const { attrs, pos } = positions[i];
    // Slice to the next exchange-document start (or end of string)
    const end = i + 1 < positions.length ? positions[i + 1].pos : xml.length;
    const block = xml.slice(pos, end);

    const country = getAttr(attrs, 'country') || 'EP';
    const docNum = getAttr(attrs, 'doc-number');
    const kind = getAttr(attrs, 'kind');
    const datePublished = getAttr(attrs, 'date-published');

    if (!docNum || seen.has(docNum)) continue;
    seen.add(docNum);

    const result = parseDocBlock(block, country, docNum, kind, datePublished, sourceLabel);
    if (result) results.push(result);
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function searchEPOOPS(
  keywords: string,
  cpcCode?: string,
  sourceLabel = 'EPO OPS'
): Promise<UnifiedResult[]> {
  try {
    const token = await getAccessToken();
    if (!token) return [];

    const cql = buildCQL(keywords, cpcCode);
    if (!cql) return [];

    return await cachedFetch<UnifiedResult[]>(
      cacheKey('epo-ops', `${keywords}:${cpcCode ?? ''}`),
      async () => {
        // Single call: search + biblio + abstract in one round-trip
        const url = `${EPO_OPS_BASE}/published-data/search/biblio,abstract?q=${encodeURIComponent(cql)}&Range=1-10`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/xml',
            'X-OPS-Accept-Charges': 'true',
          },
          signal: AbortSignal.timeout(20000),
        });

        if (res.status === 401) {
          // Token expired mid-run; clear cache so next invocation re-auths
          tokenCache = null;
          console.warn('EPO OPS: 401 — token cleared, will re-auth next call');
          return [] as UnifiedResult[];
        }
        if (res.status === 429) {
          console.warn('EPO OPS: rate limit exceeded (429)');
          return [] as UnifiedResult[];
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn(`EPO OPS search ${res.status}: ${body.slice(0, 150)}`);
          return [] as UnifiedResult[];
        }

        const xml = await res.text();
        return parseSearchResponse(xml, sourceLabel);
      }
    );
  } catch (err) {
    console.error(`EPO OPS search error (${sourceLabel}):`, err);
    return [];
  }
}

/** Search specifically for PCT/WO family members via EPO OPS */
export async function searchEPOOPSByPatentFamily(
  patentNumber: string,
  sourceLabel = 'EPO OPS (family)'
): Promise<UnifiedResult[]> {
  try {
    const token = await getAccessToken();
    if (!token) return [];

    // Normalize patent number for epodoc format
    const normalized = patentNumber.replace(/\s+/g, '').toUpperCase();

    return await cachedFetch<UnifiedResult[]>(
      cacheKey('epo-ops-family', normalized),
      async () => {
        const url = `${EPO_OPS_BASE}/published-data/publication/epodoc/${encodeURIComponent(normalized)}/biblio,abstract`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/xml',
            'X-OPS-Accept-Charges': 'true',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) return [] as UnifiedResult[];
        const xml = await res.text();
        return parseSearchResponse(xml, sourceLabel);
      }
    );
  } catch (err) {
    console.error(`EPO OPS family search error:`, err);
    return [];
  }
}

export function isEPOOPSAvailable(): boolean {
  return !!(process.env.EPO_OPS_CONSUMER_KEY && process.env.EPO_OPS_CONSUMER_SECRET);
}
