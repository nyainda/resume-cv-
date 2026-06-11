import React, { useEffect, useState, useRef } from 'react';
import { getAdminDashboardStats, DashboardData, RecentSignin } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';

function fmtRelative(unix: number | null) {
  if (!unix) return '—';
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventColor(event: string, isDark: boolean) {
  if (event === 'signin_google') return isDark ? { bg: '#0E1E38', text: '#60A5FA' } : { bg: '#E8F0FE', text: '#1A73E8' };
  if (event === 'signin_magic')  return isDark ? { bg: '#1E0E38', text: '#C084FC' } : { bg: '#F3E8FD', text: '#7B1FA2' };
  if (event === 'signout')       return isDark ? { bg: '#1A2030', text: '#8AA4BE' } : { bg: '#F1F3F4', text: '#5F6368' };
  return isDark ? { bg: '#281808', text: '#FBBF24' } : { bg: '#FEF3E8', text: '#E65100' };
}

function eventLabel(e: string) {
  if (e === 'signin_google') return 'Google';
  if (e === 'signin_magic')  return 'Magic Link';
  if (e === 'signout')       return 'Sign-out';
  return e;
}

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ background: theme.card, border: `1px solid ${accent ? theme.gold : theme.border}`, borderRadius: 12, padding: '18px 20px', boxShadow: accent ? `0 0 0 1px ${theme.gold}22` : 'none' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent ? theme.gold : theme.text, lineHeight: 1, letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.muted, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export default function OverviewTab() {
  const { theme, isDark } = useAdminTheme();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    const d = await getAdminDashboardStats();
    if (d) { setData(d); setLastRefresh(new Date()); }
    else setErr('Could not load stats. Check your admin token.');
    setLoading(false);
  };

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading && !data) return <LoadingBar />;
  if (err && !data) return <ErrorBlock msg={err} />;
  if (!data) return null;

  const { stats, recent_signins, signups_by_day, table_counts } = data;
  const maxSignups = Math.max(...signups_by_day.map(d => d.count), 1);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Real-time platform snapshot" onRefresh={load}
        right={lastRefresh && <span style={{ fontSize: 12, color: theme.muted }}>Auto-refresh 30s · Last: {lastRefresh.toLocaleTimeString()}</span>} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Users"     value={stats.total_users}        sub="all time" />
        <StatCard label="New Today"       value={stats.new_today}          sub="since midnight UTC" accent />
        <StatCard label="This Week"       value={stats.new_this_week}      sub="last 7 days" />
        <StatCard label="Active Sessions" value={stats.active_sessions}    sub="not expired" />
        <StatCard label="Sign-ins Today"  value={stats.signins_today}      sub="all methods" />
        <StatCard label="Google Users"    value={stats.google_users}       sub="OAuth" />
        <StatCard label="Magic Link"      value={stats.magic_link_users}   sub="email only" />
      </div>

      {/* Signup chart */}
      {signups_by_day.length > 0 && (
        <Section title="New Signups — Last 7 Days">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, padding: '0 4px' }}>
            {signups_by_day.map(d => {
              const h = Math.max(Math.round((d.count / maxSignups) * 72), 4);
              return (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.sub }}>{d.count || ''}</div>
                  <div title={d.day} style={{ width: '100%', height: h, background: theme.navy, borderRadius: '4px 4px 2px 2px', opacity: 0.8 }} />
                  <div style={{ fontSize: 10, color: theme.muted, whiteSpace: 'nowrap' }}>{d.day.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 20 }}>
        {/* Recent sign-ins */}
        <Section title="Recent Sign-ins">
          {recent_signins.length === 0
            ? <div style={{ color: theme.muted, fontSize: 13, padding: '8px 0' }}>No sign-ins recorded yet.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Method','User','IP','When'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>
                  {recent_signins.map((s: RecentSignin, i: number) => {
                    const { bg, text } = eventColor(s.event, isDark);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                        <Td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bg, color: text, whiteSpace: 'nowrap' }}>{eventLabel(s.event)}</span></Td>
                        <Td><div style={{ fontSize: 12, color: theme.text, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div></Td>
                        <Td><span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.sub }}>{s.ip || '—'}</span></Td>
                        <Td><span style={{ fontSize: 11, color: theme.muted }}>{fmtRelative(s.created_at)}</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </Section>

        {/* DB table counts */}
        <Section title="Database Tables">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {table_counts.map(({ table, count }) => (
                <tr key={table} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                  <Td><span style={{ fontFamily: 'monospace', fontSize: 12, color: theme.sub }}>{table}</span></Td>
                  <Td style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: count < 0 ? theme.muted : theme.text, fontSize: 14 }}>
                      {count < 0 ? 'N/A' : count.toLocaleString()}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}

// ── Shared exported components ────────────────────────────────────────────────

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '18px 20px', boxShadow: theme.isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, onRefresh, right }: { title: string; subtitle?: string; onRefresh?: () => void; right?: React.ReactNode }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: theme.text, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.sub }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {right}
        {onRefresh && (
          <button onClick={onRefresh} style={{ padding: '7px 14px', background: theme.navy, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: 0.9 }}>
            ↻ Refresh
          </button>
        )}
      </div>
    </div>
  );
}

export function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { theme } = useAdminTheme();
  return <th {...rest} style={{ textAlign: 'left', padding: '6px 10px 9px 0', fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: `1.5px solid ${theme.tableBorder}`, ...rest.style }}>{children}</th>;
}

export function Td({ children, style, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} style={{ padding: '9px 10px 9px 0', verticalAlign: 'middle', ...style }}>{children}</td>;
}

export function LoadingBar() {
  const { theme } = useAdminTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: theme.muted, fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${theme.border}`, borderTopColor: theme.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading…
    </div>
  );
}

export function ErrorBlock({ msg }: { msg: string }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ padding: '14px 16px', background: theme.badge.err.bg, border: `1px solid ${theme.isDark ? '#4A1010' : '#FFCDD2'}`, borderRadius: 8, color: theme.badge.err.text, fontSize: 13 }}>
      {msg || 'Something went wrong.'}
    </div>
  );
}

export function Badge({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'ok' | 'err' | 'warn' | 'info' }) {
  const { theme } = useAdminTheme();
  const c = theme.badge[variant];
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>{children}</span>;
}
