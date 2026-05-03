'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Stats {
  totalSearches: number;
  todaySearches: number;
  weekSearches: number;
  completedCount: number;
  failedCount: number;
  generatingCount: number;
  successRate: number;
}

interface SearchRow {
  id: string;
  userId: string;
  userEmail: string;
  title: string;
  status: string;
  aiModel: string;
  createdAt: string;
  report?: { patentabilityRating: string; referencesFound: number } | null;
}

interface UserDailyStat {
  userId: string;
  userEmail: string;
  todayCount: number;
}

interface UserOverride {
  userId: string;
  userEmail: string;
  dailyLimit: number;
  note: string;
}

interface ModelStat {
  model: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  generating: 'bg-blue-500/20 text-blue-400',
  searching: 'bg-yellow-500/20 text-yellow-400',
  pending: 'bg-slate-500/20 text-slate-400',
};

const RATING_COLORS: Record<string, string> = {
  'HIGH PATENTABILITY': 'text-emerald-400',
  'MODERATE PATENTABILITY': 'text-yellow-400',
  'LOW PATENTABILITY': 'text-red-400',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-3xl font-bold">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<{
    stats: Stats;
    modelBreakdown: ModelStat[];
    recentSearches: SearchRow[];
    userDailyStats: UserDailyStat[];
    userOverrides: UserOverride[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [limitForm, setLimitForm] = useState<{ userId: string; userEmail: string; limit: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSetLimit(e: React.FormEvent) {
    e.preventDefault();
    if (!limitForm) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/set-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: limitForm.userId,
          userEmail: limitForm.userEmail,
          dailyLimit: parseInt(limitForm.limit),
          note: limitForm.note,
        }),
      });
      if (res.ok) {
        setMsg('Limit updated successfully.');
        setLimitForm(null);
        fetchData();
      } else {
        setMsg('Failed to update limit.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveOverride(userId: string) {
    await fetch('/api/admin/set-limit', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetchData();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading admin console...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-red-400">Failed to load admin data.</p>
      </div>
    );
  }

  const { stats, modelBreakdown, recentSearches, userDailyStats, userOverrides } = data;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-white">Priora.AI</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300 text-sm">Admin Console</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={fetchData} className="text-slate-400 hover:text-white transition-colors">
              ↻ Refresh
            </button>
            <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
              ← Back to App
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Stats Grid */}
        <section>
          <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <StatCard label="Total Searches" value={stats.totalSearches} />
            <StatCard label="Today" value={stats.todaySearches} />
            <StatCard label="This Week" value={stats.weekSearches} />
            <StatCard label="Completed" value={stats.completedCount} sub={`${stats.successRate}% success`} />
            <StatCard label="Failed" value={stats.failedCount} />
            <StatCard label="In Progress" value={stats.generatingCount} />
            <StatCard label="Success Rate" value={`${stats.successRate}%`} />
          </div>
        </section>

        {/* Model Breakdown */}
        <section>
          <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-4">Model Usage</h2>
          <div className="flex flex-wrap gap-3">
            {modelBreakdown.map((m) => (
              <div key={m.model} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex items-center gap-3">
                <span className="text-slate-300 text-sm font-medium">{m.model}</span>
                <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full">{m.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Rate Limit Management */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Today's user activity */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              Today&apos;s Usage
              <span className="text-slate-500 text-xs font-normal">per user</span>
            </h2>
            {userDailyStats.length === 0 ? (
              <p className="text-slate-500 text-sm">No searches today yet.</p>
            ) : (
              <div className="space-y-2">
                {userDailyStats.map((u) => {
                  const override = userOverrides.find((o) => o.userId === u.userId);
                  const limit = override?.dailyLimit === -1 ? '∞' : (override?.dailyLimit ?? 3);
                  const isUnlimited = override?.dailyLimit === -1;
                  return (
                    <div key={u.userId} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                      <div>
                        <p className="text-white text-sm">{u.userEmail || u.userId.slice(0, 16) + '…'}</p>
                        <p className="text-slate-500 text-xs">{u.userId.slice(0, 20)}…</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${u.todayCount >= 3 && !isUnlimited ? 'text-red-400' : 'text-emerald-400'}`}>
                          {u.todayCount} / {limit}
                        </span>
                        <button
                          onClick={() => setLimitForm({
                            userId: u.userId,
                            userEmail: u.userEmail,
                            limit: override?.dailyLimit?.toString() ?? '3',
                            note: override?.note ?? '',
                          })}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active overrides */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              Subscription Overrides
              <span className="text-slate-500 text-xs font-normal">custom limits</span>
            </h2>
            {userOverrides.length === 0 ? (
              <p className="text-slate-500 text-sm">No overrides set. All users on default limit (3/day).</p>
            ) : (
              <div className="space-y-2">
                {userOverrides.map((o) => (
                  <div key={o.userId} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                    <div>
                      <p className="text-white text-sm">{o.userEmail || o.userId.slice(0, 20) + '…'}</p>
                      {o.note && <p className="text-slate-500 text-xs">{o.note}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${o.dailyLimit === -1 ? 'text-purple-400' : 'text-yellow-400'}`}>
                        {o.dailyLimit === -1 ? 'Unlimited' : `${o.dailyLimit}/day`}
                      </span>
                      <button
                        onClick={() => setLimitForm({ userId: o.userId, userEmail: o.userEmail, limit: o.dailyLimit.toString(), note: o.note })}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >Edit</button>
                      <button
                        onClick={() => handleRemoveOverride(o.userId)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setLimitForm({ userId: '', userEmail: '', limit: '-1', note: 'Pro user' })}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-2 w-full"
            >
              + Add Override for User
            </button>
          </div>
        </section>

        {/* Edit Limit Modal */}
        {limitForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h3 className="text-white font-semibold text-lg mb-4">Set User Limit</h3>
              <form onSubmit={handleSetLimit} className="space-y-4">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wider block mb-1">User ID (Clerk)</label>
                  <input
                    type="text"
                    value={limitForm.userId}
                    onChange={(e) => setLimitForm({ ...limitForm, userId: e.target.value })}
                    placeholder="user_xxxxxxxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Email (for display)</label>
                  <input
                    type="text"
                    value={limitForm.userEmail}
                    onChange={(e) => setLimitForm({ ...limitForm, userEmail: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Daily Limit (-1 = unlimited)</label>
                  <div className="flex gap-2">
                    {['-1', '3', '10', '25', '50', '100'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setLimitForm({ ...limitForm, limit: v })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          limitForm.limit === v
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {v === '-1' ? '∞' : v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Note</label>
                  <input
                    type="text"
                    value={limitForm.note}
                    onChange={(e) => setLimitForm({ ...limitForm, note: e.target.value })}
                    placeholder="Pro user, Beta tester, etc."
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Limit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLimitForm(null); setMsg(''); }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Recent Searches Table */}
        <section>
          <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-4">
            Recent Searches
            <span className="text-slate-600 ml-2 normal-case text-xs">last 30</span>
          </h2>
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/50">
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Title</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">User</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Model</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Status</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Rating</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Refs</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Date</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentSearches.map((s) => (
                    <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-white font-medium max-w-[200px] truncate">
                        {s.title === 'Processing...' ? <span className="text-slate-500 italic">Processing…</span> : s.title}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px] truncate">
                        {s.userEmail || s.userId.slice(0, 16) + '…'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-300 text-xs bg-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {s.aiModel.replace('groq-llama-3.3-70b', 'Groq').replace('gemini-2.5-flash', 'Gemini 2.5').replace('claude-3-5-sonnet', 'Claude 3.5').replace('claude-3-7-sonnet', 'Claude 3.7').replace('gpt-4o-mini', 'GPT-4o Mini').replace('gpt-4o', 'GPT-4o')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? 'text-slate-400'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.report ? (
                          <span className={`font-medium ${RATING_COLORS[s.report.patentabilityRating] ?? 'text-slate-400'}`}>
                            {s.report.patentabilityRating.replace(' PATENTABILITY', '')}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {s.report?.referencesFound ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'completed' && (
                          <Link
                            href={`/dashboard/reports/${s.id}`}
                            className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                          >
                            View →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
