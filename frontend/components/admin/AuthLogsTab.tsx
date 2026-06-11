import React, { useEffect, useState, useCallback } from 'react';
import { listAuthLogs, AuthLog } from '../../services/cvEngineClient';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

const NAVY = '#1B2B4B';

const EVENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    signin_google: { bg: '#e8f0fe', text: '#1a73e8', label: 'Google Sign-in' },
    signin_magic:  { bg: '#f3e8fd', text: '#7b1fa2', label: 'Magic Link' },
    signout:       { bg: '#f1f3f4', text: '#5f6368', label: 'Sign-out' },
};

function fmtRelative(unix: number) {
    const diff = Math.floor(Date.now() / 1000) - unix;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(unix * 1000).toLocaleString();
}

function parseUA(ua: string | null) {
    if (!ua) return '—';
    if (/Mobile/.test(ua)) return '📱 Mobile';
    if (/Chrome/.test(ua)) return '🌐 Chrome';
    if (/Safari/.test(ua)) return '🍎 Safari';
    if (/Firefox/.test(ua)) return '🦊 Firefox';
    if (/Edge/.test(ua)) return '🔷 Edge';
    return '🌐 Browser';
}

function Avatar({ name, picture }: { name: string | null; picture: string | null }) {
    if (picture) return <img src={picture} alt={name || ''} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e8e5de' }} />;
    const initials = (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return <div style={{ width: 28, height: 28, borderRadius: '50%', background: NAVY, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{initials}</div>;
}

const PAGE_SIZE = 50;

export default function AuthLogsTab() {
    const [logs, setLogs]       = useState<AuthLog[]>([]);
    const [total, setTotal]     = useState(0);
    const [offset, setOffset]   = useState(0);
    const [search, setSearch]   = useState('');
    const [event, setEvent]     = useState('');
    const [loading, setLoading] = useState(true);
    const [err, setErr]         = useState('');

    const load = useCallback(async (off = 0) => {
        setLoading(true); setErr('');
        const res = await listAuthLogs({ event, search, limit: PAGE_SIZE, offset: off });
        if (res) { setLogs(res.logs); setTotal(res.total); setOffset(off); }
        else setErr('Failed to load auth logs. Check your token and worker URL.');
        setLoading(false);
    }, [event, search]);

    useEffect(() => { void load(0); }, [load]);

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    return (
        <div>
            <PageHeader title="Auth Logs" subtitle={`${total.toLocaleString()} total event${total !== 1 ? 's' : ''}`} onRefresh={() => load(offset)} />

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <select value={event} onChange={e => { setEvent(e.target.value); load(0); }}
                    style={{ padding: '10px 14px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer', minWidth: 180 }}>
                    <option value="">All events</option>
                    <option value="signin_google">Google Sign-in</option>
                    <option value="signin_magic">Magic Link</option>
                    <option value="signout">Sign-out</option>
                </select>
                <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && load(0)}
                    placeholder="Search by email or IP…"
                    style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
                <button onClick={() => load(0)} style={{ padding: '10px 20px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Filter
                </button>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {Object.entries(EVENT_STYLES).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: v.bg, color: v.text, fontWeight: 600 }}>{v.label}</span>
                ))}
            </div>

            {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
                <Section title={`${logs.length} of ${total.toLocaleString()} events`}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                            <thead>
                                <tr>{['Event', 'User', 'IP Address', 'Browser', 'When'].map(h => <Th key={h}>{h}</Th>)}</tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const ev = EVENT_STYLES[log.event] || { bg: '#fef3e8', text: '#e65100', label: log.event };
                                    return (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #f0ede6' }}>
                                            <Td>
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: ev.bg, color: ev.text, whiteSpace: 'nowrap' }}>
                                                    {ev.label}
                                                </span>
                                            </Td>
                                            <Td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Avatar name={log.name} picture={log.picture} />
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 500, color: NAVY }}>{log.name || '—'}</div>
                                                        <div style={{ fontSize: 12, color: '#888' }}>{log.email}</div>
                                                    </div>
                                                </div>
                                            </Td>
                                            <Td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{log.ip || '—'}</span></Td>
                                            <Td><span style={{ fontSize: 12, color: '#666' }}>{parseUA(log.user_agent)}</span></Td>
                                            <Td>
                                                <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>{fmtRelative(log.created_at)}</div>
                                                <div style={{ fontSize: 11, color: '#bbb' }}>{new Date(log.created_at * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC</div>
                                            </Td>
                                        </tr>
                                    );
                                })}
                                {logs.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No events found.</td></tr>
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
