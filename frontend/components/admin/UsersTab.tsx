import React, { useEffect, useState, useCallback } from 'react';
import { listAdminUsers, updateUserPlan, revokeUserSessions, AdminUser } from '../../services/cvEngineClient';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
    free:  { bg: '#f0ede6', text: '#5a4a2a' },
    byok:  { bg: '#e8f0fe', text: '#1a73e8' },
    pro:   { bg: '#e6f9f0', text: '#1b7a4a' },
};

function Avatar({ name, picture }: { name: string | null; picture: string | null }) {
    if (picture) return <img src={picture} alt={name || ''} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e8e5de' }} />;
    const initials = (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return <div style={{ width: 32, height: 32, borderRadius: '50%', background: NAVY, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>;
}

function fmtDate(unix: number | null) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtRelative(unix: number | null) {
    if (!unix) return '—';
    const diff = Math.floor(Date.now() / 1000) - unix;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return fmtDate(unix);
}

const PAGE_SIZE = 25;

export default function UsersTab() {
    const [users, setUsers]         = useState<AdminUser[]>([]);
    const [total, setTotal]         = useState(0);
    const [offset, setOffset]       = useState(0);
    const [search, setSearch]       = useState('');
    const [planFilter, setPlan]     = useState('');
    const [loading, setLoading]     = useState(true);
    const [err, setErr]             = useState('');
    const [actionMsg, setActionMsg] = useState('');
    const [pending, setPending]     = useState<Record<number, boolean>>({});

    const load = useCallback(async (off = 0) => {
        setLoading(true); setErr('');
        const res = await listAdminUsers({ search, plan: planFilter, limit: PAGE_SIZE, offset: off });
        if (res) { setUsers(res.users); setTotal(res.total); setOffset(off); }
        else setErr('Failed to load users. Check your token and worker URL.');
        setLoading(false);
    }, [search, planFilter]);

    useEffect(() => { void load(0); }, [load]);

    const handlePlanChange = async (userId: number, plan: string) => {
        setPending(p => ({ ...p, [userId]: true }));
        const res = await updateUserPlan(userId, plan);
        if (res?.ok) {
            setUsers(u => u.map(x => x.id === userId ? { ...x, plan } : x));
            flash('Plan updated successfully');
        } else flash('Failed to update plan', true);
        setPending(p => { const n = { ...p }; delete n[userId]; return n; });
    };

    const handleRevoke = async (userId: number, email: string) => {
        if (!confirm(`Revoke all sessions for ${email}? They will be signed out immediately.`)) return;
        setPending(p => ({ ...p, [userId]: true }));
        const res = await revokeUserSessions(userId);
        if (res?.ok) {
            setUsers(u => u.map(x => x.id === userId ? { ...x, active_sessions: 0 } : x));
            flash(`Revoked ${res.revoked} session${res.revoked !== 1 ? 's' : ''} for ${email}`);
        } else flash('Failed to revoke sessions', true);
        setPending(p => { const n = { ...p }; delete n[userId]; return n; });
    };

    let flashTimer: ReturnType<typeof setTimeout>;
    const flash = (msg: string, isError = false) => {
        setActionMsg((isError ? '✗ ' : '✓ ') + msg);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setActionMsg(''), 3000);
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    return (
        <div>
            <PageHeader title="Users" subtitle={`${total.toLocaleString()} total user${total !== 1 ? 's' : ''}`} onRefresh={() => load(offset)} />

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <input
                    type="search" value={search} onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && load(0)}
                    placeholder="Search by email or name…"
                    style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
                <select value={planFilter} onChange={e => { setPlan(e.target.value); load(0); }}
                    style={{ padding: '10px 14px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer' }}>
                    <option value="">All plans</option>
                    <option value="free">Free</option>
                    <option value="byok">BYOK</option>
                    <option value="pro">Pro</option>
                </select>
                <button onClick={() => load(0)} style={{ padding: '10px 20px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Search
                </button>
            </div>

            {actionMsg && (
                <div style={{ marginBottom: 16, padding: '10px 16px', background: actionMsg.startsWith('✗') ? '#fff5f5' : '#f0faf4', border: `1px solid ${actionMsg.startsWith('✗') ? '#ffcdd2' : '#a8d5b5'}`, borderRadius: 8, fontSize: 13, color: actionMsg.startsWith('✗') ? '#c62828' : '#1b5e20' }}>
                    {actionMsg}
                </div>
            )}

            {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
                <Section title={`${users.length} of ${total.toLocaleString()} users`}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                            <thead>
                                <tr>
                                    {['User', 'Plan', 'Auth', 'Sessions', 'Last Seen', 'Joined', 'Actions'].map(h => <Th key={h}>{h}</Th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => {
                                    const { bg, text } = PLAN_COLORS[u.plan] || PLAN_COLORS.free;
                                    const isBusy = pending[u.id];
                                    return (
                                        <tr key={u.id} style={{ borderBottom: '1px solid #f0ede6' }}>
                                            <Td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Avatar name={u.name} picture={u.picture} />
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{u.name || '—'}</div>
                                                        <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                                                    </div>
                                                </div>
                                            </Td>
                                            <Td>
                                                <select
                                                    value={u.plan}
                                                    disabled={isBusy}
                                                    onChange={e => handlePlanChange(u.id, e.target.value)}
                                                    style={{ padding: '4px 8px', borderRadius: 99, background: bg, color: text, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                                >
                                                    <option value="free">Free</option>
                                                    <option value="byok">BYOK</option>
                                                    <option value="pro">Pro</option>
                                                </select>
                                            </Td>
                                            <Td>
                                                <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 99, background: u.has_google ? '#e8f0fe' : '#f3e8fd', color: u.has_google ? '#1a73e8' : '#7b1fa2' }}>
                                                    {u.has_google ? '🔵 Google' : '✉ Email'}
                                                </span>
                                            </Td>
                                            <Td>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: u.active_sessions > 0 ? '#1b7a4a' : '#aaa' }}>
                                                    {u.active_sessions}
                                                </span>
                                            </Td>
                                            <Td><span style={{ fontSize: 12, color: '#666' }}>{fmtRelative(u.last_seen_at || u.last_signin_at)}</span></Td>
                                            <Td><span style={{ fontSize: 12, color: '#888' }}>{fmtDate(u.created_at)}</span></Td>
                                            <Td>
                                                {u.active_sessions > 0 && (
                                                    <button onClick={() => handleRevoke(u.id, u.email)} disabled={isBusy}
                                                        style={{ padding: '5px 10px', background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: 6, color: '#c62828', fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: isBusy ? 0.5 : 1 }}>
                                                        Kick
                                                    </button>
                                                )}
                                            </Td>
                                        </tr>
                                    );
                                })}
                                {users.length === 0 && (
                                    <tr><td colSpan={7} style={{ padding: '24px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No users found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0ede6' }}>
                            <span style={{ fontSize: 13, color: '#888' }}>Page {currentPage} of {totalPages}</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => load(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}
                                    style={{ padding: '6px 14px', border: '1.5px solid #e0ddd8', borderRadius: 6, background: 'white', cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: 13, opacity: offset === 0 ? 0.4 : 1 }}>← Prev</button>
                                <button onClick={() => load(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}
                                    style={{ padding: '6px 14px', border: '1.5px solid #e0ddd8', borderRadius: 6, background: 'white', cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer', fontSize: 13, opacity: offset + PAGE_SIZE >= total ? 0.4 : 1 }}>Next →</button>
                            </div>
                        </div>
                    )}
                </Section>
            )}
        </div>
    );
}
