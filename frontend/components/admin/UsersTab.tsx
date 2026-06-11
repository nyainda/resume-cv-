import React, { useEffect, useState, useCallback } from 'react';
import { listAdminUsers, updateUserPlan, revokeUserSessions, AdminUser } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

function Avatar({ name, picture }: { name: string | null; picture: string | null }) {
  const { theme } = useAdminTheme();
  if (picture) return <img src={picture} alt={name || ''} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${theme.border}` }} />;
  const initials = (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return <div style={{ width: 32, height: 32, borderRadius: '50%', background: theme.navy, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{initials}</div>;
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

function planStyle(plan: string, isDark: boolean) {
  if (plan === 'pro')  return isDark ? { bg: '#0D2A1A', text: '#4ADE80' } : { bg: '#E6F9F0', text: '#1B7A4A' };
  if (plan === 'byok') return isDark ? { bg: '#0E1E38', text: '#60A5FA' } : { bg: '#E8F0FE', text: '#1A73E8' };
  return isDark ? { bg: '#1A1A0E', text: '#A0A060' } : { bg: '#F0EDE6', text: '#5A4A2A' };
}

const PAGE_SIZE = 25;

export default function UsersTab() {
  const { theme, isDark } = useAdminTheme();
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

  let flashTimer: ReturnType<typeof setTimeout>;
  const flash = (msg: string, isError = false) => {
    setActionMsg((isError ? '✗ ' : '✓ ') + msg);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setActionMsg(''), 3000);
  };

  const handlePlanChange = async (userId: number, plan: string) => {
    setPending(p => ({ ...p, [userId]: true }));
    const res = await updateUserPlan(userId, plan);
    if (res?.ok) { setUsers(u => u.map(x => x.id === userId ? { ...x, plan } : x)); flash('Plan updated'); }
    else flash('Failed to update plan', true);
    setPending(p => { const n = { ...p }; delete n[userId]; return n; });
  };

  const handleRevoke = async (userId: number, email: string) => {
    if (!confirm(`Revoke all sessions for ${email}?`)) return;
    setPending(p => ({ ...p, [userId]: true }));
    const res = await revokeUserSessions(userId);
    if (res?.ok) { setUsers(u => u.map(x => x.id === userId ? { ...x, active_sessions: 0 } : x)); flash(`Revoked ${res.revoked} session(s) for ${email}`); }
    else flash('Failed to revoke sessions', true);
    setPending(p => { const n = { ...p }; delete n[userId]; return n; });
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const inputStyle = { padding: '9px 13px', border: `1.5px solid ${theme.inputBorder}`, borderRadius: 8, fontSize: 13, background: theme.input, color: theme.text, outline: 'none' };

  return (
    <div>
      <PageHeader title="Users" subtitle={`${total.toLocaleString()} total user${total !== 1 ? 's' : ''}`} onRefresh={() => load(offset)} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)}
          placeholder="Search by email or name…"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <select value={planFilter} onChange={e => { setPlan(e.target.value); load(0); }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="byok">BYOK</option>
          <option value="pro">Pro</option>
        </select>
        <button onClick={() => load(0)} style={{ padding: '9px 18px', background: theme.navy, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {actionMsg && (
        <div style={{ marginBottom: 14, padding: '9px 14px', background: actionMsg.startsWith('✗') ? theme.badge.err.bg : theme.badge.ok.bg, border: `1px solid ${actionMsg.startsWith('✗') ? (isDark ? '#4A1010' : '#FFCDD2') : (isDark ? '#1A3A1A' : '#C8E6C9')}`, borderRadius: 8, fontSize: 13, color: actionMsg.startsWith('✗') ? theme.badge.err.text : theme.badge.ok.text }}>
          {actionMsg}
        </div>
      )}

      {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
        <Section title={`${users.length} of ${total.toLocaleString()} users`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>{['User', 'Plan', 'Auth', 'Sessions', 'Last Seen', 'Joined', 'Actions'].map(h => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const { bg, text } = planStyle(u.plan, isDark);
                  const isBusy = pending[u.id];
                  return (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={u.name} picture={u.picture} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{u.name || '—'}</div>
                            <div style={{ fontSize: 11, color: theme.sub }}>{u.email}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <select value={u.plan} disabled={isBusy} onChange={e => handlePlanChange(u.id, e.target.value)}
                          style={{ padding: '4px 9px', borderRadius: 99, background: bg, color: text, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <option value="free">Free</option>
                          <option value="byok">BYOK</option>
                          <option value="pro">Pro</option>
                        </select>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: u.has_google ? (isDark ? '#0E1E38' : '#E8F0FE') : (isDark ? '#1E0E38' : '#F3E8FD'), color: u.has_google ? (isDark ? '#60A5FA' : '#1A73E8') : (isDark ? '#C084FC' : '#7B1FA2') }}>
                          {u.has_google ? '🔵 Google' : '✉ Email'}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 13, fontWeight: 700, color: u.active_sessions > 0 ? (isDark ? '#4ADE80' : '#1B7A4A') : theme.muted }}>
                          {u.active_sessions}
                        </span>
                      </Td>
                      <Td><span style={{ fontSize: 12, color: theme.sub }}>{fmtRelative(u.last_seen_at || u.last_signin_at)}</span></Td>
                      <Td><span style={{ fontSize: 12, color: theme.muted }}>{fmtDate(u.created_at)}</span></Td>
                      <Td>
                        {u.active_sessions > 0 && (
                          <button onClick={() => handleRevoke(u.id, u.email)} disabled={isBusy}
                            style={{ padding: '5px 10px', background: isDark ? '#2A0E0E' : '#FFF0F0', border: `1px solid ${isDark ? '#4A1010' : '#FFCDD2'}`, borderRadius: 6, color: isDark ? '#F87171' : '#C62828', fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: isBusy ? 0.5 : 1 }}>
                            Kick
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '24px 0', textAlign: 'center', color: theme.muted, fontSize: 13 }}>No users found.</td></tr>
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
