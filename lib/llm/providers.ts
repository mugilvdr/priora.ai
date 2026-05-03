// Multi-model LLM provider abstraction.
// All providers expose the same interface: given system + user prompts, return the text response.
// API keys come from either environment variables (admin-configured) or user-provided keys
// passed through the search request body (never stored in DB).

export type AIModel =
  | 'groq-llama-3.3-70b'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'claude-3-5-sonnet'
  | 'claude-3-7-sonnet'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export interface ModelOption {
  value: AIModel;
  label: string;
  provider: 'groq' | 'google' | 'anthropic' | 'openai';
  description: string;
  badge?: string;
  envKey: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'groq-llama-3.3-70b',
    label: 'Groq Llama 3.3 70B',
    provider: 'groq',
    description: 'Fast, free. Great for most searches.',
    badge: 'FREE',
    envKey: 'GROQ_API_KEY',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Ultra-fast Google AI. Excellent for large patent sets.',
    badge: 'FAST',
    envKey: 'GOOGLE_API_KEY',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    description: 'Most capable Google model — deep reasoning for complex §103 analysis.',
    envKey: 'GOOGLE_API_KEY',
  },
  {
    value: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Best §102/§103 legal reasoning. Highest report quality.',
    badge: 'BEST QUALITY',
    envKey: 'ANTHROPIC_API_KEY',
  },
  {
    value: 'claude-3-7-sonnet',
    label: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    description: 'Extended thinking for deep obviousness analysis.',
    envKey: 'ANTHROPIC_API_KEY',
  },
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    description: 'Balanced quality and speed from OpenAI.',
    envKey: 'OPENAI_API_KEY',
  },
  {
    value: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast and cost-effective OpenAI model.',
    badge: 'FAST',
    envKey: 'OPENAI_API_KEY',
  },
];

export function resolveApiKey(model: AIModel, userProvidedKey?: string): string {
  const option = MODEL_OPTIONS.find((m) => m.value === model);
  if (!option) return '';
  return userProvidedKey?.trim() || process.env[option.envKey] || '';
}

// Unified LLM call — routes to the correct provider based on model ID.
// Throws a descriptive error on any failure (network, auth, rate-limit, etc.).
// NEVER silently falls back to another model; callers decide fallback policy.
export async function callLLM(
  model: AIModel,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8000
): Promise<string> {
  const option = MODEL_OPTIONS.find((m) => m.value === model);
  if (!option) throw new Error(`Unknown model: ${model}`);
  if (!apiKey) {
    throw new Error(
      `No API key for ${option.label}. ` +
      (option.value === 'groq-llama-3.3-70b'
        ? 'Set GROQ_API_KEY in server environment.'
        : `Provide your ${option.provider} API key in Advanced Settings, or ask admin to set ${option.envKey}.`)
    );
  }

  switch (option.provider) {
    case 'groq':
      return callGroq(apiKey, model, systemPrompt, userPrompt, maxTokens);
    case 'google':
      return callGemini(apiKey, model, systemPrompt, userPrompt, maxTokens);
    case 'anthropic':
      return callClaude(apiKey, model, systemPrompt, userPrompt, maxTokens);
    case 'openai':
      return callOpenAI(apiKey, model, systemPrompt, userPrompt, maxTokens);
    default:
      throw new Error(`Unknown provider for model ${model}`);
  }
}

// ── Groq ──────────────────────────────────────────────────────────────────────

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const groqModel = model === 'groq-llama-3.3-70b' ? 'llama-3.3-70b-versatile' : model;
  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (e) {
    throw new Error(`Groq network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq returned an empty response');
  return text;
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: AIModel,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const geminiModel = model === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(55000),
    });
  } catch (e) {
    throw new Error(`Gemini network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Retry once after 5s on 429 (rate-limit burst)
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(55000),
      });
    } catch (e) {
      throw new Error(`Gemini network error on retry: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 400) hint = ' (check model name or request format)';
    if (res.status === 403) hint = ' (invalid or restricted API key)';
    if (res.status === 429) hint = ' (quota exceeded — try again later or use a different model)';
    throw new Error(`Gemini API error ${res.status}${hint}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Gemini returned empty content (finishReason: ${reason})`);
  }
  return text;
}

// ── Anthropic Claude ──────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  model: AIModel,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const claudeModel =
    model === 'claude-3-7-sonnet'
      ? 'claude-3-7-sonnet-20250219'
      : 'claude-sonnet-4-6';

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new Error(`Anthropic network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 401) hint = ' (invalid API key)';
    if (res.status === 429) hint = ' (rate limit exceeded)';
    if (res.status === 529) hint = ' (Anthropic overloaded — try again)';
    throw new Error(`Anthropic API error ${res.status}${hint}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  if (!text) throw new Error('Anthropic returned an empty response');
  return text;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  model: AIModel,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const oaiModel = model === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o';

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: oaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (e) {
    throw new Error(`OpenAI network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 401) hint = ' (invalid API key)';
    if (res.status === 429) hint = ' (quota exceeded or rate-limited)';
    throw new Error(`OpenAI API error ${res.status}${hint}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('OpenAI returned an empty response');
  return text;
}
