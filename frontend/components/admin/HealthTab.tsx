import React, { useEffect, useState, useCallback } from 'react';
import { getAdminDashboardStats, fetchAdminStats, TableCount } from '../../services/cvEngineClient';
import { PageHeader, Section, LoadingBar } from './OverviewTab';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';
const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

interface PingResult { ok: boolean; latency: number; status: number; detail?: string; }

async function pingEndpoint(url: string, headers: Record<string, string> = {}): Promise<PingResult> {
    const start = performance.now();
    try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        const latency = Math.round(performance.now() - start);
        let detail: string | undefined;
        try { const j = await r.json(); detail = j?.error || j?.message || undefined; } catch { /* */ }
        return { ok: r.status < 500, latency, status: r.status, detail };
    } catch (e: any) {
        const latency = Math.round(performance.now() - start);
        return { ok: false, latency, status: 0, detail: e?.message || 'Network error' };
    }
}

function Pill({ ok, label, latency, detail }: { ok: boolean | null; label: string; latency?: number; detail?: string; [k: string]: unknown }) {
    const color = ok === null ? '#aaa' : ok ? '#1b7a4a' : '#c62828';
    const bg    = ok === null ? '#f5f5f5' : ok ? '#f0faf4' : '#fff5f5';
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: bg, borderRadius: 8, border: `1px solid ${ok === null ? '#e0ddd8' : ok ? '#a8d5b5' : '#ffcdd2'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: ok ? `0 0 6px ${color}60` : 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{label}</span>
                {detail && <span style={{ fontSize: 12, color: '#888' }}>— {detail}</span>}
            </div>
            {latency !== undefined && <span style={{ fontFamily: 'monospace', fontSize: 12, color: color, fontWeight: 600 }}>{ok === null ? '—' : `${latency}ms`}</span>}
        </div>
    );
}

export default function HealthTab() {
    const [pings, setPings] = useState<Record<string, PingResult | null>>({});
    const [dbCounts, setDbCounts] = useState<TableCount[]>([]);
    const [checking, setChecking] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    const adminTok = sessionStorage.getItem('procv_admin_tok') || '';

    const runChecks = useCallback(async () => {
        setChecking(true);
        setPings({});

        const endpoints: { key: string; url: string; headers?: Record<string, string> }[] = [
            { key: 'Worker (CORS ping)', url: `${ENGINE_URL}/api/cv/prewarm`, headers: {} },
            { key: 'Admin Stats endpoint', url: `${ENGINE_URL}/api/cv/admin/stats`, headers: { 'X-Admin-Token': adminTok } },
            { key: 'Dashboard Stats endpoint', url: `${ENGINE_URL}/api/cv/admin/dashboard-stats`, headers: { 'X-Admin-Token': adminTok } },
            { key: 'Users endpoint', url: `${ENGINE_URL}/api/cv/admin/users?limit=1`, headers: { 'X-Admin-Token': adminTok } },
            { key: 'Auth Logs endpoint', url: `${ENGINE_URL}/api/cv/admin/auth-logs?limit=1`, headers: { 'X-Admin-Token': adminTok } },
        ];

        await Promise.all(endpoints.map(async ep => {
            const result = await pingEndpoint(ep.url, ep.headers);
            setPings(p => ({ ...p, [ep.key]: result }));
        }));

        const stats = await getAdminDashboardStats();
        if (stats?.table_counts) setDbCounts(stats.table_counts);

        setLastChecked(new Date());
        setChecking(false);
    }, [adminTok]);

    const legacyStats = useCallback(async () => {
        const s = await fetchAdminStats();
        if (s) {
            const counts: TableCount[] = Object.entries(s).filter(([k]) => k !== 'last_sync').map(([table, count]) => ({ table, count: Number(count) }));
            setDbCounts(counts);
        }
    }, []);

    useEffect(() => {
        void runChecks();
        void legacyStats();
    }, []);

    const endpointKeys = [
        'Worker (CORS ping)',
        'Admin Stats endpoint',
        'Dashboard Stats endpoint',
        'Users endpoint',
        'Auth Logs endpoint',
    ];

    return (
        <div>
            <PageHeader title="System Health" subtitle="Check all worker endpoints and database tables" onRefresh={runChecks} />

            {lastChecked && (
                <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                    Last checked: {lastChecked.toLocaleTimeString()}
                    {checking && <span style={{ marginLeft: 8, color: GOLD }}>• Checking…</span>}
                </div>
            )}

            {/* Worker URL */}
            <Section title="Worker Configuration">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: '#666' }}>CV Engine URL:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: NAVY, background: '#f5f4f1', padding: '4px 10px', borderRadius: 6 }}>
                        {ENGINE_URL || <span style={{ color: '#c62828' }}>Not configured — set VITE_CV_ENGINE_URL</span>}
                    </span>
                </div>
            </Section>

            {/* Endpoint health */}
            <Section title="Endpoint Health">
                {checking && Object.keys(pings).length === 0 ? (
                    <LoadingBar />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {endpointKeys.map(key => {
                            const r = pings[key];
                            return <Pill key={key} label={key} ok={r ? r.ok : null} latency={r?.latency} detail={r?.ok === false ? (r.detail || `HTTP ${r.status}`) : undefined} />;
                        })}
                    </div>
                )}
            </Section>

            {/* DB counts */}
            {dbCounts.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <Section title="Database Row Counts">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                            {dbCounts.map(({ table, count }) => (
                                <div key={table} style={{ padding: '12px 14px', background: '#f9f8f5', borderRadius: 8, border: '1px solid #e8e5de' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{table}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: count < 0 ? '#aaa' : NAVY }}>{count < 0 ? 'N/A' : count.toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>
            )}

            {/* Status summary */}
            {!checking && Object.keys(pings).length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <Section title="Summary">
                        {(() => {
                            const results = Object.values(pings).filter(Boolean) as PingResult[];
                            const allOk = results.every(r => r.ok);
                            const failCount = results.filter(r => !r.ok).length;
                            const avgLatency = results.length ? Math.round(results.reduce((s, r) => s + r.latency, 0) / results.length) : 0;
                            return (
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    <div style={{ padding: '12px 20px', background: allOk ? '#f0faf4' : '#fff5f5', borderRadius: 8, border: `1px solid ${allOk ? '#a8d5b5' : '#ffcdd2'}` }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: allOk ? '#1b5e20' : '#c62828' }}>
                                            {allOk ? '✓ All systems operational' : `✗ ${failCount} endpoint${failCount > 1 ? 's' : ''} failing`}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 20px', background: '#f9f8f5', borderRadius: 8, border: '1px solid #e8e5de' }}>
                                        <div style={{ fontSize: 13, color: '#555' }}>Avg latency: <strong>{avgLatency}ms</strong></div>
                                    </div>
                                </div>
                            );
                        })()}
                    </Section>
                </div>
            )}
        </div>
    );
}
