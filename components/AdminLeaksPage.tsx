/**
 * AdminLeaksPage — internal dashboard for the AI-leak feedback loop.
 *
 * Lives at `#admin/leaks`. Pulls aggregate stats from the telemetry server
 * and shows the top phrases the purifier is catching, plus the option to
 * promote any of them to the persistent banned-phrase list (which is
 * fetched at runtime by the purifier — see telemetryService.fetchServerRules).
 *
 * Read-only by default; the "Add to banned list" button is the only mutation.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { fetchLeaksSummary, promoteToBannedList } from '../services/telemetryService';
import { bulkAddRows, getAdminToken } from '../services/cvEngineClient';

interface SummaryRow { phrase: string; leak_type: string; hits: string | number }
interface ByTypeRow  { leak_type: string; hits: string | number }
interface RecentRow  { id: number; leak_type: string; phrase: string; field_location: string | null; fixed_by: string | null; created_at: string }
interface GenStats   {
    total?: string | number;
    avg_round_ratio?: string | number;
    avg_repeats?: string | number;
    avg_tense_issues?: string | number;
    total_tense_flipped?: string | number;
    total_jittered?: string | number;
    total_subs?: string | number;
}
interface Summary {
    windowDays: number;
    topPhrases: SummaryRow[];
    byType: ByTypeRow[];
    recent: RecentRow[];
    generations: GenStats;
}

const fmt = (v: any, digits = 0) => {
    if (v == null) return '—';
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return '—';
    return digits ? n.toFixed(digits) : Math.round(n).toLocaleString();
};

const AdminLeaksPage: React.FC = () => {
    const [days, setDays] = useState(7);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, 'pending' | 'ok' | 'fail'>>({});
    const [enginePromoted, setEnginePromoted] = useState<Record<string, 'pending' | 'ok' | 'fail'>>({});
    const engineReady = !!getAdminToken();

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchLeaksSummary(days);
            if (!data) {
                setError('Telemetry server unreachable or DB not configured.');
                setSummary(null);
            } else {
                setSummary(data);
            }
        } catch (e: any) {
            setError(e?.message || 'Failed to load summary');
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => { void refresh(); }, [refresh]);

    const promote = useCallback(async (phrase: string) => {
        setPromoted(p => ({ ...p, [phrase]: 'pending' }));
        const ok = await promoteToBannedList({
            pattern: phrase,
            replacement: '',
            category: 'user-promoted',
            severity: 2,
        });
        setPromoted(p => ({ ...p, [phrase]: ok ? 'ok' : 'fail' }));
    }, []);

    const promoteToEngine = useCallback(async (phrase: string, leakType: string) => {
        setEnginePromoted(p => ({ ...p, [phrase]: 'pending' }));
        const r = await bulkAddRows('cv_banned_phrases', [{
            phrase,
            replacement: '',
            severity: 'high',
            reason: `promoted from leaks (${leakType})`,
        }]);
        const ok = !!(r && (r.inserted > 0 || r.skipped > 0));
        setEnginePromoted(p => ({ ...p, [phrase]: ok ? 'ok' : 'fail' }));
    }, []);

    return (
        <div className="max-w-6xl mx-auto p-6 text-slate-200">
            <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">AI Leak Dashboard</h1>
                    <p className="text-sm text-slate-400">
                        Phrases & patterns the purifier catches across all generations. Promote
                        the worst offenders into the persistent banned list.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-400">Window:</label>
                    <select
                        value={days}
                        onChange={e => setDays(parseInt(e.target.value, 10))}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                    >
                        <option value={1}>Last 24h</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded text-sm"
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-900/40 border border-red-700 rounded p-3 mb-4 text-sm text-red-200">
                    {error}
                </div>
            )}

            {summary && (
                <>
                    {/* Aggregate stats */}
                    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <Stat label="Generations"      value={fmt(summary.generations.total)} />
                        <Stat label="Avg round-num %"  value={fmt(Number(summary.generations.avg_round_ratio || 0) * 100, 1) + '%'} />
                        <Stat label="Tense flips"      value={fmt(summary.generations.total_tense_flipped)} />
                        <Stat label="Substitutions"    value={fmt(summary.generations.total_subs)} />
                    </section>

                    {/* Leaks by type */}
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold mb-2">By type</h2>
                        <div className="flex flex-wrap gap-2">
                            {summary.byType.length === 0 && <span className="text-sm text-slate-500">No leaks recorded yet.</span>}
                            {summary.byType.map(r => (
                                <span key={r.leak_type} className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm">
                                    <span className="text-slate-400">{r.leak_type}:</span>{' '}
                                    <span className="font-mono">{fmt(r.hits)}</span>
                                </span>
                            ))}
                        </div>
                    </section>

                    {/* Top phrases */}
                    <section className="mb-8">
                        <h2 className="text-lg font-semibold mb-2">
                            Top {summary.topPhrases.length} leaking phrases — last {summary.windowDays}d
                        </h2>
                        <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800/60">
                                    <tr>
                                        <th className="text-left px-3 py-2">#</th>
                                        <th className="text-left px-3 py-2">Phrase</th>
                                        <th className="text-left px-3 py-2">Type</th>
                                        <th className="text-right px-3 py-2">Hits</th>
                                        <th className="text-right px-3 py-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.topPhrases.length === 0 && (
                                        <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                                            No leaks recorded in this window. Generate a CV to populate the dashboard.
                                        </td></tr>
                                    )}
                                    {summary.topPhrases.map((row, i) => {
                                        const status = promoted[row.phrase];
                                        const eStatus = enginePromoted[row.phrase];
                                        return (
                                            <tr key={`${row.phrase}-${i}`} className="border-t border-slate-800 hover:bg-slate-800/30">
                                                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                                                <td className="px-3 py-2 font-mono break-all">{row.phrase}</td>
                                                <td className="px-3 py-2 text-slate-400">{row.leak_type}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmt(row.hits)}</td>
                                                <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                                                    <button
                                                        disabled={status === 'pending' || status === 'ok'}
                                                        onClick={() => promote(row.phrase)}
                                                        title="Add to local telemetry banned list (purifier rules)"
                                                        className={`px-2 py-1 rounded text-xs ${
                                                            status === 'ok'      ? 'bg-green-700 text-white' :
                                                            status === 'fail'    ? 'bg-red-700 text-white'   :
                                                            status === 'pending' ? 'bg-slate-700 text-slate-300' :
                                                            'bg-amber-600 hover:bg-amber-500 text-white'
                                                        }`}
                                                    >
                                                        {status === 'ok'      ? 'Local ✓'    :
                                                         status === 'fail'    ? 'Failed'     :
                                                         status === 'pending' ? '…'          :
                                                         '+ Local'}
                                                    </button>
                                                    {engineReady && (
                                                        <button
                                                            disabled={eStatus === 'pending' || eStatus === 'ok'}
                                                            onClick={() => promoteToEngine(row.phrase, row.leak_type)}
                                                            title="Add to CV Engine D1 (used by the brief builder)"
                                                            className={`px-2 py-1 rounded text-xs ${
                                                                eStatus === 'ok'      ? 'bg-green-700 text-white' :
                                                                eStatus === 'fail'    ? 'bg-red-700 text-white'   :
                                                                eStatus === 'pending' ? 'bg-slate-700 text-slate-300' :
                                                                'bg-indigo-600 hover:bg-indigo-500 text-white'
                                                            }`}
                                                        >
                                                            {eStatus === 'ok'      ? 'Engine ✓'   :
                                                             eStatus === 'fail'    ? 'Failed'     :
                                                             eStatus === 'pending' ? '…'          :
                                                             '+ Engine'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Recent activity */}
                    <section>
                        <h2 className="text-lg font-semibold mb-2">Recent detections</h2>
                        <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800/60">
                                    <tr>
                                        <th className="text-left px-3 py-2">When</th>
                                        <th className="text-left px-3 py-2">Type</th>
                                        <th className="text-left px-3 py-2">Phrase</th>
                                        <th className="text-left px-3 py-2">Field</th>
                                        <th className="text-left px-3 py-2">Fix</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.recent.length === 0 && (
                                        <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">No recent activity.</td></tr>
                                    )}
                                    {summary.recent.map(r => (
                                        <tr key={r.id} className="border-t border-slate-800">
                                            <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                                                {new Date(r.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-slate-400">{r.leak_type}</td>
                                            <td className="px-3 py-2 font-mono break-all">{r.phrase}</td>
                                            <td className="px-3 py-2 text-slate-500 text-xs">{r.field_location || '—'}</td>
                                            <td className="px-3 py-2 text-slate-500 text-xs">{r.fixed_by || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
        <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
);

export default AdminLeaksPage;
