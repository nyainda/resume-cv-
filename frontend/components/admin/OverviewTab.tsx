import React, { useEffect, useState } from 'react';
import { getAdminDashboardStats, DashboardData, RecentSignin } from '../../services/cvEngineClient';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

function fmtTime(unix: number | null) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleString();
}

function fmtRelative(unix: number | null) {
    if (!unix) return '—';
    const diff = Math.floor(Date.now() / 1000) - unix;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function eventColor(event: string) {
    if (event === 'signin_google') return { bg: '#e8f0fe', text: '#1a73e8' };
    if (event === 'signin_magic')  return { bg: '#f3e8fd', text: '#7b1fa2' };
    if (event === 'signout')       return { bg: '#f1f3f4', text: '#5f6368' };
    return { bg: '#fef3e8', text: '#e65100' };
}

function eventLabel(event: string) {
    if (event === 'signin_google') return 'Google';
    if (event === 'signin_magic')  return 'Magic Link';
    if (event === 'signout')       return 'Sign out';
    return event;
}

interface StatCardProps { label: string; value: number | string; sub?: string; accent?: boolean; }
function StatCard({ label, value, sub, accent }: StatCardProps) {
    return (
        <div style={{ background: 'white', border: `1px solid ${accent ? GOLD : '#e8e5de'}`, borderRadius: 12, padding: '20px 22px', boxShadow: accent ? `0 0 0 1px ${GOLD}20` : '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: accent ? GOLD : NAVY, lineHeight: 1, letterSpacing: '-1px' }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{sub}</div>}
        </div>
    );
}

export default function OverviewTab() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        setLoading(true);
        getAdminDashboardStats().then(d => {
            if (d) setData(d);
            else setErr('Could not load stats. Check your admin token and worker URL.');
            setLoading(false);
        });
    }, []);

    if (loading) return <LoadingBar />;
    if (err || !data) return <ErrorBlock msg={err} />;

    const { stats, recent_signins, signups_by_day, table_counts } = data;
    const maxSignups = Math.max(...signups_by_day.map(d => d.count), 1);

    return (
        <div>
            <PageHeader title="Overview" subtitle="Real-time platform snapshot" onRefresh={() => {
                setLoading(true);
                getAdminDashboardStats().then(d => { if (d) setData(d); setLoading(false); });
            }} />

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
                <StatCard label="Total Users"    value={stats.total_users}    sub="all time" />
                <StatCard label="New Today"      value={stats.new_today}      sub="since midnight UTC" accent />
                <StatCard label="This Week"      value={stats.new_this_week}  sub="last 7 days" />
                <StatCard label="Active Sessions"value={stats.active_sessions}sub="not expired" />
                <StatCard label="Sign-ins Today" value={stats.signins_today}  sub="all methods" />
                <StatCard label="Google Users"   value={stats.google_users}   sub="OAuth" />
                <StatCard label="Magic Link"     value={stats.magic_link_users} sub="email only" />
            </div>

            {/* Signup trend */}
            {signups_by_day.length > 0 && (
                <Section title="New Signups — Last 7 Days">
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100, padding: '0 4px' }}>
                        {signups_by_day.map(d => {
                            const h = Math.max(Math.round((d.count / maxSignups) * 80), 4);
                            return (
                                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{d.count}</div>
                                    <div title={d.day} style={{ width: '100%', height: h, background: NAVY, borderRadius: '4px 4px 2px 2px', opacity: 0.85 }} />
                                    <div style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}>{d.day.slice(5)}</div>
                                </div>
                            );
                        })}
                        {signups_by_day.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>No signups this week yet.</div>}
                    </div>
                </Section>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
                {/* Recent signins */}
                <Section title="Recent Sign-ins">
                    {recent_signins.length === 0
                        ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>No sign-ins recorded yet.</div>
                        : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Method','User','IP','When'].map(h => <Th key={h}>{h}</Th>)}</tr>
                            </thead>
                            <tbody>
                                {recent_signins.map((s: RecentSignin, i: number) => {
                                    const { bg, text } = eventColor(s.event);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f0ede6' }}>
                                            <Td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bg, color: text }}>{eventLabel(s.event)}</span></Td>
                                            <Td><div style={{ fontSize: 13, color: NAVY, fontWeight: 500 }}>{s.email}</div></Td>
                                            <Td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{s.ip || '—'}</span></Td>
                                            <Td><span style={{ fontSize: 12, color: '#888' }}>{fmtRelative(s.created_at)}</span></Td>
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
                                <tr key={table} style={{ borderBottom: '1px solid #f0ede6' }}>
                                    <Td><span style={{ fontFamily: 'monospace', fontSize: 13, color: '#555' }}>{table}</span></Td>
                                    <Td style={{ textAlign: 'right' }}><span style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{count < 0 ? 'N/A' : count.toLocaleString()}</span></Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Section>
            </div>
        </div>
    );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: 'white', border: '1px solid #e8e5de', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{title}</div>
            {children}
        </div>
    );
}

export function PageHeader({ title, subtitle, onRefresh }: { title: string; subtitle?: string; onRefresh?: () => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>{title}</h1>
                {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>{subtitle}</p>}
            </div>
            {onRefresh && (
                <button onClick={onRefresh} style={{ padding: '8px 16px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ↻ Refresh
                </button>
            )}
        </div>
    );
}

export function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return <th {...rest} style={{ textAlign: 'left', padding: '6px 10px 10px 0', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #f0ede6', ...rest.style }}>{children}</th>;
}
export function Td({ children, style, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td {...rest} style={{ padding: '10px 10px 10px 0', verticalAlign: 'middle', ...style }}>{children}</td>;
}
export function LoadingBar() {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: '#aaa', fontSize: 14 }}><div style={{ width: 20, height: 20, border: '2px solid #e0ddd8', borderTopColor: NAVY, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style> Loading…</div>;
}
export function ErrorBlock({ msg }: { msg: string }) {
    return <div style={{ padding: 16, background: '#fff5f5', border: '1px solid #ffcdd2', borderRadius: 8, color: '#c62828', fontSize: 14 }}>{msg || 'Something went wrong.'}</div>;
}
