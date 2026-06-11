import React, { useEffect, useState, useCallback } from 'react';
import { listAuthLogs, AuthLog } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

function fmtRelative(unix: number) {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(unix * 1000).toLocaleString();
}

function parseUA(ua: string | null) {
  if (!ua) return '—';
  if (/Mobile/i.test(ua)) return '📱 Mobile';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return '🌐 Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return '🍎 Safari';
  if (/Firefox/i.test(ua)) return '🦊 Firefox';
  if (/Edg/i.test(ua)) return '🔷 Edge';
  return '🌐 Browser';
}

function Avatar({ name, picture }: { name: string | null; picture: string | null }) {
  const { theme } = useAdminTheme();
  if (picture) return <img src={picture} alt={name || ''} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${theme.border}` }} />;
  const initials = (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return <div style={{ width: 28, height: 28, borderRadius: '50%', background: theme.navy, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{initials}</div>;
}

function eventStyle(event: string, isDark: boolean) {
  if (event === 'signin_google') return { bg: isDark ? '#0E1E38' : '#E8F0FE', text: isDark ? '#60A5FA' : '#1A73E8', label: 'Google Sign-in' };
  if (event === 'signin_magic')  return { bg: isDark ? '#1E0E38' : '#F3E8FD', text: isDark ? '#C084FC' : '#7B1FA2', label: 'Magic Link' };
  if (event === 'signout')       return { bg: isDark ? '#1A2030' : '#F1F3F4', text: isDark ? '#8AA4BE' : '#5F6368', label: 'Sign-out' };
  return { bg: isDark ? '#281808' : '#FEF3E8', text: isDark ? '#FBBF24' : '#E65100', label: event };
}

const PAGE_SIZE = 50;

export default function AuthLogsTab() {
  const { theme, isDark } = useAdminTheme();
  const [logs, setLogs]     = useState<AuthLog[]>([]);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [event, setEvent]   = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState('');

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

  const inputStyle = { padding: '9px 13px', border: `1.5px solid ${theme.inputBorder}`, borderRadius: 8, fontSize: 13, background: theme.input, color: theme.text, outline: 'none' };

  return (
    <div>
      <PageHeader title="Auth Logs" subtitle={`${total.toLocaleString()} total event${total !== 1 ? 's' : ''}`} onRefresh={() => load(offset)} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={event} onChange={e => { setEvent(e.target.value); }} style={{ ...inputStyle, cursor: 'pointer', minWidth: 170 }}>
          <option value="">All events</option>
          <option value="signin_google">Google Sign-in</option>
          <option value="signin_magic">Magic Link</option>
          <option value="signout">Sign-out</option>
        </select>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)}
          placeholder="Search by email or IP…"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <button onClick={() => load(0)} style={{ padding: '9px 18px', background: theme.navy, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Filter
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['signin_google', 'signin_magic', 'signout'].map(k => {
          const s = eventStyle(k, isDark);
          return <span key={k} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.text, fontWeight: 600 }}>{s.label}</span>;
        })}
      </div>

      {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
        <Section title={`${logs.length} of ${total.toLocaleString()} events`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>{['Event', 'User', 'IP Address', 'Browser', 'When'].map(h => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const ev = eventStyle(log.event, isDark);
                  return (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                      <Td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: ev.bg, color: ev.text, whiteSpace: 'nowrap' }}>
                          {ev.label}
                        </span>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={log.name} picture={log.picture} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{log.name || '—'}</div>
                            <div style={{ fontSize: 11, color: theme.sub }}>{log.email}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><span style={{ fontFamily: 'monospace', fontSize: 12, color: theme.sub }}>{log.ip || '—'}</span></Td>
                      <Td><span style={{ fontSize: 12, color: theme.sub }}>{parseUA(log.user_agent)}</span></Td>
                      <Td>
                        <div style={{ fontSize: 12, color: theme.sub, whiteSpace: 'nowrap' }}>{fmtRelative(log.created_at)}</div>
                        <div style={{ fontSize: 10, color: theme.muted }}>{new Date(log.created_at * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC</div>
                      </Td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: theme.muted, fontSize: 13 }}>No events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.tableBorder}` }}>
              <span style={{ fontSize: 13, color: theme.sub }}>Page {currentPage} of {totalPages}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => load(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}
                  style={{ padding: '6px 14px', border: `1.5px solid ${theme.border}`, borderRadius: 6, background: theme.card, color: theme.sub, cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: 13, opacity: offset === 0 ? 0.4 : 1 }}>← Prev</button>
                <button onClick={() => load(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}
                  style={{ padding: '6px 14px', border: `1.5px solid ${theme.border}`, borderRadius: 6, background: theme.card, color: theme.sub, cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer', fontSize: 13, opacity: offset + PAGE_SIZE >= total ? 0.4 : 1 }}>Next →</button>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
