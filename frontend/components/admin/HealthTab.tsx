import React, { useEffect, useState, useCallback } from 'react';
import { getAdminDashboardStats, fetchAdminStats, TableCount } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section, LoadingBar } from './OverviewTab';

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

async function pingEndpoint(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; latency: number; status: number; detail?: string }> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const latency = Math.round(performance.now() - t0);
    let detail: string | undefined;
    try { const j = await r.json(); detail = j?.error || j?.message; } catch {}
    return { ok: r.status < 500, latency, status: r.status, detail };
  } catch (e: any) {
    return { ok: false, latency: Math.round(performance.now() - t0), status: 0, detail: e?.message || 'Network error' };
  }
}

interface PingResult { ok: boolean; latency: number; status: number; detail?: string }

function StatusPill({ ok, label, latency, detail }: { ok: boolean | null; label: string; latency?: number; detail?: string }) {
  const { theme, isDark } = useAdminTheme();
  const color = ok === null ? theme.muted : ok ? (isDark ? '#4ADE80' : '#1B7A4A') : (isDark ? '#F87171' : '#C62828');
  const bg    = ok === null ? theme.bg : ok ? (isDark ? '#0D2E1E' : '#F0FAF4') : (isDark ? '#2A0E0E' : '#FFF5F5');
  const bdr   = ok === null ? theme.border : ok ? (isDark ? '#1A3A1A' : '#A8D5B5') : (isDark ? '#4A1010' : '#FFCDD2');
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', background: bg, borderRadius: 8, border: `1px solid ${bdr}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: ok ? `0 0 5px ${color}60` : 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{label}</span>
        {detail && <span style={{ fontSize: 12, color: theme.sub }}>— {detail}</span>}
      </div>
      {latency !== undefined && (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: ok === null ? theme.muted : color, fontWeight: 600 }}>
          {ok === null ? '—' : `${latency}ms`}
        </span>
      )}
    </div>
  );
}

const ENDPOINTS = [
  { key: 'Worker (CORS ping)',       path: '/api/cv/prewarm',                      auth: false },
  { key: 'Admin stats',              path: '/api/cv/admin/stats',                  auth: true },
  { key: 'Dashboard stats',          path: '/api/cv/admin/dashboard-stats',        auth: true },
  { key: 'Users endpoint',           path: '/api/cv/admin/users?limit=1',          auth: true },
  { key: 'Auth logs endpoint',       path: '/api/cv/admin/auth-logs?limit=1',      auth: true },
  { key: 'LLM tiered endpoint',      path: '/api/cv/tiered-llm',                   auth: false },
  { key: 'KV banned phrases',        path: '/api/cv/banned',                       auth: false },
  { key: 'LLM cache endpoint',       path: '/api/cv/llm-cache?key=probe00',        auth: false },
];

export default function HealthTab() {
  const { theme, isDark } = useAdminTheme();
  const [pings, setPings]       = useState<Record<string, PingResult | null>>({});
  const [dbCounts, setDbCounts] = useState<TableCount[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const adminTok = sessionStorage.getItem('procv_admin_tok') || '';

  const runChecks = useCallback(async () => {
    setChecking(true);
    setPings({});
    await Promise.all(ENDPOINTS.map(async ep => {
      const hdrs: Record<string, string> = ep.auth ? { 'X-Admin-Token': adminTok } : {};
      const result = await pingEndpoint(`${ENGINE_URL}${ep.path}`, hdrs);
      setPings(p => ({ ...p, [ep.key]: result }));
    }));
    const stats = await getAdminDashboardStats();
    if (stats?.table_counts) setDbCounts(stats.table_counts);
    setLastChecked(new Date());
    setChecking(false);
  }, [adminTok]);

  useEffect(() => {
    void runChecks();
    const legacyLoad = async () => {
      const s = await fetchAdminStats();
      if (s) {
        const counts: TableCount[] = Object.entries(s)
          .filter(([k]) => k !== 'last_sync')
          .map(([table, count]) => ({ table, count: Number(count) }));
        setDbCounts(counts);
      }
    };
    void legacyLoad();
  }, []);

  const results = Object.values(pings).filter(Boolean) as PingResult[];
  const allOk   = results.length > 0 && results.every(r => r.ok);
  const failCount = results.filter(r => !r.ok).length;
  const avgLatency = results.length ? Math.round(results.reduce((s, r) => s + r.latency, 0) / results.length) : 0;

  return (
    <div>
      <PageHeader title="System Health" subtitle="Endpoint latency · DB table sizes · worker config" onRefresh={runChecks} />

      {lastChecked && (
        <div style={{ fontSize: 12, color: theme.muted, marginBottom: 16 }}>
          Last checked: {lastChecked.toLocaleTimeString()}
          {checking && <span style={{ marginLeft: 10, color: theme.gold }}>• Running checks…</span>}
        </div>
      )}

      {/* Summary banner */}
      {!checking && results.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 18px', background: allOk ? (isDark ? '#0D2E1E' : '#F0FAF4') : (isDark ? '#2A0E0E' : '#FFF5F5'), borderRadius: 9, border: `1px solid ${allOk ? (isDark ? '#1A3A1A' : '#A8D5B5') : (isDark ? '#4A1010' : '#FFCDD2')}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: allOk ? (isDark ? '#4ADE80' : '#1B5E20') : (isDark ? '#F87171' : '#C62828') }}>
              {allOk ? '✓ All systems operational' : `✗ ${failCount} endpoint${failCount > 1 ? 's' : ''} failing`}
            </div>
          </div>
          <div style={{ padding: '10px 18px', background: theme.card, borderRadius: 9, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 13, color: theme.sub }}>Avg latency: <strong style={{ color: theme.text }}>{avgLatency}ms</strong></div>
          </div>
          <div style={{ padding: '10px 18px', background: theme.card, borderRadius: 9, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 13, color: theme.sub }}>{results.length} / {ENDPOINTS.length} endpoints checked</div>
          </div>
        </div>
      )}

      {/* Worker config */}
      <Section title="Worker Configuration">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: theme.sub }}>CV Engine URL:</span>
          {ENGINE_URL
            ? <span style={{ fontFamily: 'monospace', fontSize: 13, color: theme.text, background: theme.bg, padding: '4px 10px', borderRadius: 6, border: `1px solid ${theme.border}` }}>{ENGINE_URL}</span>
            : <span style={{ fontSize: 13, color: isDark ? '#F87171' : '#C62828' }}>⚠ Not configured — set VITE_CV_ENGINE_URL</span>
          }
        </div>
      </Section>

      {/* Endpoint health */}
      <div style={{ marginTop: 16 }}>
        <Section title="Endpoint Health">
          {checking && Object.keys(pings).length === 0 ? <LoadingBar /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {ENDPOINTS.map(ep => {
                const r = pings[ep.key];
                return (
                  <StatusPill
                    key={ep.key}
                    label={ep.key}
                    ok={r ? r.ok : null}
                    latency={r?.latency}
                    detail={r?.ok === false ? (r.detail || `HTTP ${r.status}`) : undefined}
                  />
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* DB row counts */}
      {dbCounts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Section title="Database Tables">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {dbCounts.map(({ table, count }) => (
                <div key={table} style={{ padding: '12px 14px', background: theme.bg, borderRadius: 8, border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{table}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: count < 0 ? theme.muted : theme.text }}>{count < 0 ? 'N/A' : count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Latency breakdown */}
      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Section title="Latency Breakdown">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ENDPOINTS.map(ep => {
                const r = pings[ep.key];
                if (!r) return null;
                const maxMs = 3000;
                const pct = Math.min((r.latency / maxMs) * 100, 100);
                const barColor = r.latency < 500 ? '#22C55E' : r.latency < 1500 ? '#F59E0B' : '#EF4444';
                return (
                  <div key={ep.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 160, fontSize: 12, color: theme.sub, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.key}</div>
                    <div style={{ flex: 1, height: 8, background: theme.border, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: barColor, width: 52, textAlign: 'right', flexShrink: 0 }}>{r.latency}ms</span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
