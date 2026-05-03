'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface SearchProgressProps {
  searchId: string;
  onComplete: (id: string) => void;
}

interface ProgressState {
  status: string;
  progress: number;
  message: string;
  errorMessage?: string;
}

const SEARCH_SOURCES = [
  { name: 'W1: Feature Extract', threshold: 15 },
  { name: 'W2: Query + CPC + Synonyms', threshold: 25 },
  { name: 'PatentsView (5 queries)', threshold: 40 },
  { name: 'Google Patents', threshold: 50 },
  { name: 'EPO Espacenet', threshold: 57 },
  { name: 'WIPO + arXiv + Scholar', threshold: 63 },
  { name: 'W3: AI Patent Compare', threshold: 75 },
  { name: 'W4: Report Generation', threshold: 88 },
];

const SSE_ERROR_THRESHOLD = 3;
const POLL_INTERVAL_MS = 3000;

export default function SearchProgress({ searchId, onComplete }: SearchProgressProps) {
  const [state, setState] = useState<ProgressState>({
    status: 'pending',
    progress: 0,
    message: 'Initializing search...',
  });
  const [logs, setLogs] = useState<string[]>(['Connecting to search engine...']);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [usingFallback, setUsingFallback] = useState(false);
  const completedRef = useRef(false);
  const sseErrorCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last !== msg) {
        return [...prev, msg].slice(-8);
      }
      return prev;
    });
  }, []);

  const handleProgressData = useCallback(
    (data: ProgressState) => {
      setState(data);
      if (data.message) addLog(data.message);

      if ((data.status === 'completed' || data.status === 'failed') && !completedRef.current) {
        completedRef.current = true;

        // Cleanup SSE
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Cleanup polling
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }

        if (data.status === 'completed') {
          setTimeout(() => onComplete(searchId), 800);
        } else {
          setErrorMessage(data.errorMessage ?? 'An unexpected error occurred.');
          setFailed(true);
        }
      }
    },
    [searchId, onComplete, addLog]
  );

  // Polling fallback — when SSE fails too many times
  const startPolling = useCallback(() => {
    if (completedRef.current) return;

    const poll = async () => {
      if (completedRef.current) return;
      try {
        const res = await fetch(`/api/search/${searchId}/stream`, {
          headers: { Accept: 'application/json' },
        });
        // The stream endpoint returns SSE, so we use the reports API instead
        const reportRes = await fetch(`/api/reports/${searchId}`);
        if (!reportRes.ok) {
          // Search still in progress — poll the search status
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        const data = await reportRes.json();

        const progressData: ProgressState = {
          status: data.status ?? 'searching',
          progress: data.progress ?? 50,
          message: data.status === 'completed'
            ? `Report ready: ${data.title}`
            : data.status === 'failed'
            ? 'Search failed — see error details below.'
            : 'Searching...',
          errorMessage: data.errorMessage,
        };

        handleProgressData(progressData);

        if (data.status !== 'completed' && data.status !== 'failed') {
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!completedRef.current) {
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();
  }, [searchId, handleProgressData]);

  // Primary: SSE connection
  useEffect(() => {
    if (completedRef.current) return;

    const es = new EventSource(`/api/search/${searchId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressState = JSON.parse(event.data);
        // Reset error count on successful message
        sseErrorCountRef.current = 0;
        handleProgressData(data);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (completedRef.current) return;
      sseErrorCountRef.current++;

      if (sseErrorCountRef.current >= SSE_ERROR_THRESHOLD) {
        // SSE is unreliable — switch to polling fallback
        addLog('SSE connection unstable. Switching to polling...');
        setUsingFallback(true);
        es.close();
        eventSourceRef.current = null;
        startPolling();
      } else {
        addLog('Connection interrupted. Retrying...');
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [searchId, handleProgressData, addLog, startPolling]);

  const completedSources = SEARCH_SOURCES.filter((s) => state.progress >= s.threshold);
  const progressPct = Math.min(100, state.progress);

  if (failed) {
    return (
      <div className="bg-[#111827] border border-red-900/50 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-1">Search Failed</h3>
            <p className="text-slate-400 text-sm mb-4">
              The search could not be completed. Error details:
            </p>

            {/* Error details box */}
            <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-xs font-mono font-semibold flex-shrink-0 mt-0.5">ERROR</span>
                <p className="text-red-200 text-sm font-mono break-words leading-relaxed">
                  {errorMessage || 'Unknown error. Check server logs for details.'}
                </p>
              </div>
            </div>

            {/* Troubleshooting tips based on error content */}
            {errorMessage && (
              <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-4 mb-5">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Troubleshooting
                </div>
                <ul className="space-y-1.5">
                  {getTroubleshootingTips(errorMessage).map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-blue-400 flex-shrink-0 mt-0.5">→</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#2d3f55] text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                New Search
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1e293b]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-white">Searching Prior Art</h2>
          <span className="text-2xl font-bold text-blue-400">{progressPct}%</span>
        </div>
        <p className="text-slate-400 text-sm">{state.message}</p>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-5 border-b border-[#1e293b]">
        <div className="relative h-3 bg-[#1e293b] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          >
            {progressPct < 100 && (
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
            )}
          </div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-600">
          <span>Extraction</span>
          <span>Searching</span>
          <span>Analysis</span>
          <span>Report</span>
        </div>
      </div>

      {/* Source Status Grid */}
      <div className="px-6 py-5 border-b border-[#1e293b]">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Database Coverage
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SEARCH_SOURCES.map((source) => {
            const isDone = state.progress >= source.threshold;
            const isActive =
              state.progress >= source.threshold - 10 && state.progress < source.threshold;

            return (
              <div
                key={source.name}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isDone
                    ? 'bg-emerald-900/30 border border-emerald-800/50 text-emerald-300'
                    : isActive
                    ? 'bg-blue-900/30 border border-blue-800/50 text-blue-300'
                    : 'bg-[#1a2340] border border-[#1e293b] text-slate-500'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isDone ? 'bg-emerald-400' : isActive ? 'bg-blue-400 animate-pulse' : 'bg-slate-700'
                  }`}
                />
                {source.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Log */}
      <div className="px-6 py-5">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Activity Log
        </div>
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1 h-1 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
              <span className={`text-xs ${i === logs.length - 1 ? 'text-slate-200' : 'text-slate-500'}`}>
                {log}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-slate-500 text-xs">
            {progressPct < 50
              ? 'Estimated 3–4 minutes remaining'
              : progressPct < 85
              ? 'Estimated 1–2 minutes remaining'
              : 'Almost done — generating report...'}
          </span>
          {usingFallback && (
            <span className="text-amber-500/60 text-[10px] ml-auto">polling mode</span>
          )}
        </div>
      </div>
    </div>
  );
}

function getTroubleshootingTips(errorMessage: string): string[] {
  const msg = errorMessage.toLowerCase();
  const tips: string[] = [];

  if (msg.includes('api key') || msg.includes('no api key')) {
    tips.push('Check that you entered the correct API key in Advanced Settings.');
    tips.push('Verify the API key is active and has not expired or been revoked.');
  }
  if (msg.includes('401') || msg.includes('invalid') || msg.includes('unauthorized')) {
    tips.push('Your API key may be invalid. Regenerate it from your AI provider dashboard.');
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
    tips.push('You have hit the rate limit or quota for this AI model. Wait a few minutes or switch to Groq (free).');
    tips.push('Consider upgrading your API plan or using a different model.');
  }
  if (msg.includes('groq_api_key') || msg.includes('groq')) {
    tips.push('Ask admin to configure GROQ_API_KEY in the server environment variables.');
  }
  if (msg.includes('gemini') || msg.includes('google')) {
    tips.push('Verify your Google AI Studio key is valid and the Gemini API is enabled for your project.');
  }
  if (msg.includes('anthropic') || msg.includes('claude')) {
    tips.push('Verify your Anthropic API key and check your usage limits at console.anthropic.com.');
  }
  if (msg.includes('openai') || msg.includes('gpt')) {
    tips.push('Verify your OpenAI API key at platform.openai.com and check your billing status.');
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('abort')) {
    tips.push('A network timeout occurred. The AI provider may be temporarily unavailable — try again.');
    tips.push('Switch to Groq (free) for faster, more reliable inference.');
  }
  if (msg.includes('empty response') || msg.includes('empty content')) {
    tips.push('The AI model returned an empty response. This is usually a temporary issue — try again.');
  }

  if (tips.length === 0) {
    tips.push('Try switching to a different AI model (Groq is free and reliable).');
    tips.push('If the problem persists, contact support with the error message above.');
  }

  return tips.slice(0, 4);
}
