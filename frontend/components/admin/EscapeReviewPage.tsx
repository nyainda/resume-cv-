/**
 * EscapeReviewPage.tsx — Pipeline Learning Loop admin UI (Feature 2).
 *
 * Displays aggregated escape patterns from the D1 pipeline_escapes table,
 * grouped by type and sorted by frequency. Admins can promote high-frequency
 * patterns directly into the live KV banned_phrases list.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, RefreshCw, ArrowUpCircle } from 'lucide-react';

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
function escapeApiUrl(path: string): string | null {
  return ENGINE_URL ? `${ENGINE_URL}${path}` : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedEscape {
  escape_type: string;
  pattern:     string;
  source:      string;
  frequency:   number;
  last_seen:   number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  banned_phrase: 'Banned Phrase',
  ai_language:   'AI Language',
  weak_verb:     'Weak Verb',
  passive:       'Passive Voice',
  metric:        'Metric Issue',
  cert:          'Cert / Credential',
  other:         'Other',
  gateway:       'Gateway Catch',
};

const SOURCE_LABELS: Record<string, string> = {
  tier1_fix:  'Tier 1 Auto-fix',
  tier2_fix:  'Tier 2 AI Fix',
  user_skip:  'User Skipped',
  user_edit:  'Manual Edit',
  build_warn: 'Build Warning',
  gateway:    'LLM Gateway',
};

const TYPE_COLOURS: Record<string, string> = {
  banned_phrase: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ai_language:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  weak_verb:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  passive:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  metric:        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cert:          'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  other:         'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  gateway:       'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
};

// ─── Row component ────────────────────────────────────────────────────────────

const EscapeRow: React.FC<{
  row:       AggregatedEscape;
  onPromote: (row: AggregatedEscape) => Promise<void>;
}> = ({ row, onPromote }) => {
  const [promoting, setPromoting] = useState(false);
  const [done,      setDone]      = useState(false);

  const handlePromote = async () => {
    if (promoting || done) return;
    setPromoting(true);
    try {
      await onPromote(row);
      setDone(true);
    } catch {
      /* swallow — toast handled by parent */
    } finally {
      setPromoting(false);
    }
  };

  const typeColour = TYPE_COLOURS[row.escape_type] ?? TYPE_COLOURS.other;
  const lastSeen   = new Date(row.last_seen * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono break-all">
          {row.pattern}
        </code>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeColour}`}>
          {TYPE_LABELS[row.escape_type] ?? row.escape_type}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {SOURCE_LABELS[row.source] ?? row.source}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`text-sm font-bold ${row.frequency >= 10 ? 'text-red-600' : row.frequency >= 5 ? 'text-orange-500' : 'text-foreground'}`}>
          {row.frequency}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground text-center">
        {lastSeen}
      </td>
      <td className="px-4 py-3 text-right">
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            Promoted
          </span>
        ) : (
          <button
            onClick={handlePromote}
            disabled={promoting || (row.escape_type !== 'banned_phrase' && row.escape_type !== 'ai_language')}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-[#1B2B4B] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            title={
              row.escape_type !== 'banned_phrase' && row.escape_type !== 'ai_language'
                ? 'Only banned_phrase and ai_language types can be promoted to KV rules'
                : `Promote "${row.pattern}" to live banned phrases list`
            }
          >
            {promoting ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <ArrowUpCircle className="w-3 h-3" />
            )}
            {promoting ? 'Promoting…' : 'Promote'}
          </button>
        )}
      </td>
    </tr>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const EscapeReviewPage: React.FC = () => {
  const [rows,       setRows]       = useState<AggregatedEscape[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [minFreq,    setMinFreq]    = useState(1);
  const [toast,      setToast]      = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchEscapes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = escapeApiUrl('/api/pipeline/escapes');
    if (!url) { setError('CF Worker URL not configured'); setLoading(false); return; }
    try {
      const res = await fetch(`${url}${typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { escapes: AggregatedEscape[] };
      setRows(data.escapes ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { fetchEscapes(); }, [fetchEscapes]);

  const handlePromote = useCallback(async (row: AggregatedEscape) => {
    const url = escapeApiUrl('/api/admin/escapes/promote');
    if (!url) throw new Error('Worker not configured');
    const res = await fetch(url, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ escape_type: row.escape_type, pattern: row.pattern }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`"${row.pattern}" promoted to live rules ✓`);
  }, []);

  const visibleRows = rows.filter(r => r.frequency >= minFreq);
  const types = Array.from(new Set(rows.map(r => r.escape_type))).sort();

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-2">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Pipeline Escape Review
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Patterns that bypassed the pipeline — promote high-frequency ones to live rules
          </p>
        </div>
        <button
          onClick={fetchEscapes}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-border text-foreground hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm pl-3 pr-8 py-2 rounded-xl border border-border bg-background text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
          >
            <option value="">All types</option>
            {types.map(t => (
              <option key={t as string} value={t as string}>{TYPE_LABELS[t as string] ?? t}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Min frequency:</span>
          {[1, 3, 5, 10].map(n => (
            <button
              key={n}
              onClick={() => setMinFreq(n)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                minFreq === n
                  ? 'bg-[#1B2B4B] text-white border-[#1B2B4B]'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {n}+
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {visibleRows.length} pattern{visibleRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-center py-12 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">
          Loading escape patterns…
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No patterns found — the pipeline is clean!
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Pattern</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-center">Frequency</th>
                <th className="px-4 py-3 text-center">Last Seen</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <EscapeRow key={`${row.escape_type}-${row.pattern}-${i}`} row={row} onPromote={handlePromote} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EscapeReviewPage;
