'use client';

import { useState, useEffect } from 'react';
import { WEB_SEARCH_PROVIDERS, type WebSearchProvider } from '@/lib/search/web-search';
import { MODEL_OPTIONS, type AIModel } from '@/lib/llm/providers';
import type { Jurisdiction } from '@/lib/llm/groq';

interface SearchFormProps {
  onSubmit: (
    description: string,
    webSearchProvider: WebSearchProvider,
    aiModel: AIModel,
    modelApiKey: string,
    jurisdiction: Jurisdiction
  ) => Promise<void>;
  isLoading: boolean;
}

const EXAMPLE_DESCRIPTION = `A wireless charging system for electric vehicles that uses resonant inductive coupling to transfer energy at distances up to 30cm. The system includes an intelligent alignment correction mechanism that automatically adjusts the position of the receiving coil using magnetic field sensors and a servo motor array. A novel feature is the dynamic frequency modulation algorithm that optimizes power transfer efficiency based on real-time load conditions and coil misalignment, achieving over 95% efficiency. The system also incorporates bidirectional communication between the charging pad and vehicle to negotiate power levels and monitor battery state.`;

const STORAGE_KEY = 'priora_ai_settings';

interface SavedSettings {
  aiModel: AIModel;
  modelApiKey: string;
  webProvider: WebSearchProvider;
  jurisdiction: Jurisdiction;
}

const JURISDICTION_OPTIONS: { value: Jurisdiction; label: string; flag: string; description: string }[] = [
  { value: 'US', flag: '🇺🇸', label: 'United States (USPTO)', description: '35 USC §102/§103, claims-first prosecution' },
  { value: 'IN', flag: '🇮🇳', label: 'India (IPO)', description: 'Patents Act 1970, §3 exclusions, examination in India' },
  { value: 'GLOBAL', flag: '🌐', label: 'Global (PCT / Multi-jurisdiction)', description: 'USPTO + EPO + WIPO + JPO + CNIPA coverage' },
];

export default function SearchForm({ onSubmit, isLoading }: SearchFormProps) {
  const [description, setDescription] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [provider, setProvider] = useState<WebSearchProvider>('both');
  const [aiModel, setAiModel] = useState<AIModel>('groq-llama-3.3-70b');
  const [modelApiKey, setModelApiKey] = useState('');
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('US');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'model' | 'search' | 'jurisdiction'>('model');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: SavedSettings = JSON.parse(raw);
        if (saved.aiModel) setAiModel(saved.aiModel);
        if (saved.modelApiKey) setModelApiKey(saved.modelApiKey);
        if (saved.webProvider) setProvider(saved.webProvider);
        if (saved.jurisdiction) setJurisdiction(saved.jurisdiction);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const settings: SavedSettings = { aiModel, modelApiKey, webProvider: provider, jurisdiction };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [aiModel, modelApiKey, provider, jurisdiction]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    setCharCount(e.target.value.length);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 50) return;
    await onSubmit(description, provider, aiModel, modelApiKey, jurisdiction);
  };

  const loadExample = () => {
    setDescription(EXAMPLE_DESCRIPTION);
    setCharCount(EXAMPLE_DESCRIPTION.length);
  };

  const selectedModel = MODEL_OPTIONS.find((m) => m.value === aiModel);
  const selectedJurisdiction = JURISDICTION_OPTIONS.find((j) => j.value === jurisdiction);
  const needsApiKey = aiModel !== 'groq-llama-3.3-70b';
  const isValid = description.trim().length >= 50;

  const providerColors: Record<string, string> = {
    groq: 'text-orange-400',
    google: 'text-blue-400',
    anthropic: 'text-violet-400',
    openai: 'text-emerald-400',
  };

  const providerBg: Record<string, string> = {
    groq: 'bg-orange-950/40 border-orange-800/40',
    google: 'bg-blue-950/40 border-blue-800/40',
    anthropic: 'bg-violet-950/40 border-violet-800/40',
    openai: 'bg-emerald-950/40 border-emerald-800/40',
  };

  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-2xl overflow-hidden">
      <form onSubmit={handleSubmit}>
        {/* Invention description */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-slate-200">
              Invention Description
            </label>
            <button
              type="button"
              onClick={loadExample}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Load example
            </button>
          </div>

          <textarea
            value={description}
            onChange={handleChange}
            placeholder={`Describe your invention in detail...\n\nInclude:\n• What the invention does and how it works\n• Key technical features and components\n• The problem it solves\n• What makes it different from existing solutions\n• Technology domain (e.g., software, mechanical, biotech)\n\nThe more detail you provide, the more accurate your patentability report will be.`}
            className="w-full bg-[#0a0f1e] border border-[#1e293b] rounded-xl text-white placeholder-slate-600 p-4 text-sm leading-relaxed resize-none focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
            rows={12}
            disabled={isLoading}
          />

          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs font-medium ${charCount < 50 ? 'text-red-400' : charCount < 200 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {charCount < 50
                ? `${50 - charCount} more characters needed`
                : `${charCount} characters — ${charCount >= 200 ? 'great detail' : 'good'}`}
            </span>
            <span className="text-slate-600 text-xs">{charCount}/5000</span>
          </div>
        </div>

        {/* Advanced options toggle */}
        <div className="px-6 pb-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Advanced settings
            {!showAdvanced && (
              <span className="ml-1 flex items-center gap-1">
                {selectedModel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${providerBg[selectedModel.provider]} ${providerColors[selectedModel.provider]}`}>
                    {selectedModel.label}
                  </span>
                )}
                {selectedJurisdiction && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold border bg-slate-800 border-slate-700 text-slate-300">
                    {selectedJurisdiction.flag} {selectedJurisdiction.value}
                  </span>
                )}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-[#1e293b]">
                {(['model', 'jurisdiction', 'search'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab
                        ? 'text-blue-400 border-b-2 border-blue-500'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab === 'model' ? 'AI Model' : tab === 'jurisdiction' ? 'Jurisdiction' : 'Web Search'}
                  </button>
                ))}
              </div>

              {/* AI Model tab */}
              {activeTab === 'model' && (
                <div className="p-4">
                  <div className="grid grid-cols-1 gap-2 mb-4">
                    {MODEL_OPTIONS.map((m) => (
                      <label
                        key={m.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          aiModel === m.value
                            ? `${providerBg[m.provider]} border-opacity-80`
                            : 'border-[#1e293b] hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="aiModel"
                          value={m.value}
                          checked={aiModel === m.value}
                          onChange={() => setAiModel(m.value)}
                          className="mt-0.5 accent-blue-500"
                          disabled={isLoading}
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium flex items-center gap-2 ${aiModel === m.value ? providerColors[m.provider] : 'text-slate-200'}`}>
                            {m.label}
                            {m.badge && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                m.badge === 'FREE' ? 'bg-emerald-900/60 text-emerald-400' :
                                m.badge === 'FAST' ? 'bg-blue-900/60 text-blue-300' :
                                'bg-violet-900/60 text-violet-300'
                              }`}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{m.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {needsApiKey && (
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        {selectedModel?.provider === 'google' ? 'Google AI Studio API Key' :
                         selectedModel?.provider === 'anthropic' ? 'Anthropic API Key' :
                         'OpenAI API Key'}
                        <span className="ml-1 text-slate-600 font-normal">(stored locally, never sent to server)</span>
                      </label>
                      <input
                        type="password"
                        value={modelApiKey}
                        onChange={(e) => setModelApiKey(e.target.value)}
                        placeholder={
                          selectedModel?.provider === 'google' ? 'AIza...' :
                          selectedModel?.provider === 'anthropic' ? 'sk-ant-...' :
                          'sk-...'
                        }
                        className="w-full bg-[#111827] border border-[#1e293b] rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/60 transition-colors placeholder-slate-600"
                        disabled={isLoading}
                      />
                      {!modelApiKey && (
                        <p className="text-xs text-amber-500/80 mt-1">
                          No API key — if admin has not configured the server environment, this search will fail with a clear error (no silent fallback).
                        </p>
                      )}
                    </div>
                  )}

                  {selectedModel && (
                    <div className={`mt-3 rounded-lg border p-3 text-xs ${providerBg[selectedModel.provider]}`}>
                      <div className={`font-semibold mb-1.5 ${providerColors[selectedModel.provider]}`}>
                        Why {selectedModel.label}?
                      </div>
                      <div className="text-slate-400 space-y-1">
                        {getModelAdvantages(selectedModel.value).map((adv) => (
                          <div key={adv} className="flex items-start gap-1.5">
                            <span className={`flex-shrink-0 mt-0.5 ${providerColors[selectedModel.provider]}`}>✓</span>
                            {adv}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Jurisdiction tab */}
              {activeTab === 'jurisdiction' && (
                <div className="p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Target Filing Jurisdiction
                  </div>
                  <div className="grid grid-cols-1 gap-2 mb-4">
                    {JURISDICTION_OPTIONS.map((j) => (
                      <label
                        key={j.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          jurisdiction === j.value
                            ? 'border-blue-500/60 bg-blue-950/30'
                            : 'border-[#1e293b] hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="jurisdiction"
                          value={j.value}
                          checked={jurisdiction === j.value}
                          onChange={() => setJurisdiction(j.value)}
                          className="mt-0.5 accent-blue-500"
                          disabled={isLoading}
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                            <span>{j.flag}</span>
                            {j.label}
                            {j.value === 'US' && (
                              <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{j.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 text-xs text-amber-200/80">
                    Jurisdiction affects the legal analysis framework, disclaimer language, and filing recommendations in the report. The same patent databases are searched regardless of jurisdiction.
                  </div>
                </div>
              )}

              {/* Web Search tab */}
              {activeTab === 'search' && (
                <div className="p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Web Search Provider
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {WEB_SEARCH_PROVIDERS.map((p) => (
                      <label
                        key={p.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          provider === p.value
                            ? 'border-blue-500/60 bg-blue-950/30'
                            : 'border-[#1e293b] hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="webSearchProvider"
                          value={p.value}
                          checked={provider === p.value}
                          onChange={() => setProvider(p.value)}
                          className="mt-0.5 accent-blue-500"
                          disabled={isLoading}
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                            {p.label}
                            {p.value === 'both' && (
                              <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Always-searched sources */}
        <div className="px-6 pb-4">
          <div className="bg-blue-950/30 border border-blue-900/30 rounded-xl p-4">
            <div className="text-xs font-semibold text-blue-300 mb-2 uppercase tracking-wider">
              Always searched (direct APIs)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {directSources.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                  <span className="text-slate-400 text-xs">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="px-6 pb-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="text-amber-500/80 font-semibold">AI-generated preliminary search — attorney review required.</span>{' '}
            This report is for internal assessment only and does not constitute legal advice or a formal patentability opinion.
            Consult a registered patent attorney before filing.
          </p>
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            type="submit"
            disabled={!isValid || isLoading}
            className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all ${
              isValid && !isLoading
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Starting search...
              </div>
            ) : (
              `Search Prior Art · ${selectedJurisdiction?.flag ?? ''} ${selectedJurisdiction?.value ?? 'US'} · ${selectedModel?.label ?? 'Groq'}`
            )}
          </button>
          <p className="text-center text-slate-500 text-xs mt-2">
            Search takes approximately 2–4 minutes to complete
          </p>
        </div>
      </form>
    </div>
  );
}

function getModelAdvantages(model: AIModel): string[] {
  switch (model) {
    case 'groq-llama-3.3-70b':
      return [
        'Free to use — no API key required',
        'Very fast inference (~2s response)',
        'Good quality for most patent searches',
      ];
    case 'gemini-2.5-flash':
      return [
        'Ultra-fast Google AI model (2.5 generation)',
        'Excellent at handling large patent datasets',
        'Cost-effective for high-volume searches',
      ];
    case 'gemini-2.5-pro':
      return [
        'Most capable Google model — deep reasoning',
        'Best for complex §103 obviousness analysis',
        'Handles entire patent families in one pass',
      ];
    case 'claude-3-5-sonnet':
      return [
        'Best §102/§103 legal reasoning quality',
        'Most reliable structured JSON output',
        'Produces the most attorney-ready reports',
        '200K context for large reference sets',
      ];
    case 'claude-3-7-sonnet':
      return [
        'Extended thinking for deep obviousness analysis',
        'Best for difficult patentability edge cases',
        'Reasons step-by-step through complex §103 combinations',
      ];
    case 'gpt-4o':
      return [
        'Balanced speed and quality from OpenAI',
        'Excellent structured output reliability',
        'Strong technical domain knowledge',
      ];
    case 'gpt-4o-mini':
      return [
        'Very fast and cost-effective',
        'Good for straightforward searches',
        'Lower cost per search at scale',
      ];
    default:
      return [];
  }
}

const directSources = [
  'USPTO Grants',
  'USPTO Applications',
  'USPTO Claims',
  'PatentsView',
  'arXiv',
  'Semantic Scholar',
  'OpenAlex',
  'Citation Chain',
];
