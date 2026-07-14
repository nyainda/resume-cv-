import React, { useEffect, useState, useCallback } from 'react';
import { useAdminTheme } from './AdminContext';
import {
  fetchUserDetail, updateUserPlan, revokeUserSessions,
  UserDetailResult, UserSession, UserAuthLog,
} from '../../services/cvEngineClient';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(unix: number | null | undefined) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(unix: number | null | undefined) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(unix: number | null | undefined) {
  if (!unix) return '—';
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60)           return 'just now';
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(unix);
}

function planStyle(plan: string, isDark: boolean) {
  if (plan === 'premium') return isDark ? { bg: '#0D2A1A', text: '#4ADE80' } : { bg: '#E6F9F0', text: '#1B7A4A' };
  return isDark ? { bg: '#1A1A0E', text: '#A0A060' } : { bg: '#F0EDE6', text: '#5A4A2A' };
}

const EVENT_COLORS: Record<string, string> = {
  signin_google: '#60A5FA',
  signin_magic:  '#A78BFA',
  signin_session:'#4ADE80',
  signout:       '#F87171',
  magic_send:    '#FBBF24',
  token_refresh: '#34D399',
};

function eventColor(event: string) {
  return EVENT_COLORS[event] ?? '#94A3B8';
}

function Avatar({ name, picture, size = 52 }: { name: string | null; picture: string | null; size?: number }) {
  const { theme } = useAdminTheme();
  if (picture) return <img src={picture} alt={name || ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.border}` }} />;
  const initials = (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: theme.navy, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ flex: 1, minWidth: 80, padding: '10px 12px', background: theme.bg, borderRadius: 10, border: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 10, color: theme.muted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? theme.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: theme.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHead({ title, count }: { title: string; count?: number }) {
  const { theme } = useAdminTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.sub, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
      {count != null && <span style={{ fontSize: 10, color: theme.muted, background: theme.bg, padding: '1px 6px', borderRadius: 99, border: `1px solid ${theme.border}` }}>{count}</span>}
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface Props {
  userId: number | null;
  onClose: () => void;
  onPlanChanged: (userId: number, plan: string) => void;
  onSessionsRevoked: (userId: number, revoked: number) => void;
}

export default function UserDetailDrawer({ userId, onClose, onPlanChanged, onSessionsRevoked }: Props) {
  const { theme, isDark } = useAdminTheme();
  const [data, setData]       = useState<UserDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [flash, setFlash]     = useState('');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async (id: number) => {
    setLoading(true); setErr(''); setData(null);
    const res = await fetchUserDetail(id);
    if (res?.ok) setData(res);
    else setErr('Could not load user details.');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (userId != null) { load(userId); }
    else { setData(null); setErr(''); }
  }, [userId, load]);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 3000); };

  const handlePlanChange = async (plan: string) => {
    if (!data) return;
    setBusy(true);
    const res = await updateUserPlan(data.user.id, plan);
    if (res?.ok) {
      setData(d => d ? { ...d, user: { ...d.user, plan } } : d);
      onPlanChanged(data.user.id, plan);
      showFlash(`✓ Plan changed to ${plan}`);
    } else {
      showFlash('✗ Failed to update plan');
    }
    setBusy(false);
  };

  const handleRevoke = async () => {
    if (!data || !confirm(`Revoke all sessions for ${data.user.email}?`)) return;
    setBusy(true);
    const res = await revokeUserSessions(data.user.id);
    if (res?.ok) {
      setData(d => d ? {
        ...d,
        user: { ...d.user, active_sessions: 0 },
        sessions: d.sessions.map(s => ({ ...s, is_active: 0 })),
      } : d);
      onSessionsRevoked(data.user.id, res.revoked ?? 0);
      showFlash(`✓ ${res.revoked} session(s) revoked`);
    } else {
      showFlash('✗ Failed to revoke sessions');
    }
    setBusy(false);
  };

  const isOpen = userId != null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Slide-in drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: Math.min(520, typeof window !== 'undefined' ? window.innerWidth - 40 : 520),
        background: theme.card,
        borderLeft: `1px solid ${theme.border}`,
        boxShadow: '-8px 0 40px rgba(0,0,0,0.25)',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(110%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        willChange: 'transform',
      }}>

        {/* ── Header bar ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>User Details</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.sub, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: theme.muted, fontSize: 13 }}>
              Loading…
            </div>
          )}
          {err && !loading && (
            <div style={{ padding: '12px 14px', background: isDark ? '#2A0E0E' : '#FFF0F0', border: `1px solid ${isDark ? '#4A1010' : '#FFCDD2'}`, borderRadius: 8, fontSize: 13, color: isDark ? '#F87171' : '#C62828' }}>
              {err}
            </div>
          )}

          {data && !loading && (() => {
            const u = data.user;
            const { bg: planBg, text: planText } = planStyle(u.plan, isDark);
            const activeSessions = data.sessions.filter(s => s.is_active).length;

            return (
              <>
                {/* ── Identity block ──────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20, padding: '16px', background: theme.bg, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                  <Avatar name={u.name} picture={u.picture} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: theme.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || '—'}</div>
                    <div style={{ fontSize: 12, color: theme.sub, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Plan selector */}
                      <select value={u.plan} disabled={busy} onChange={e => handlePlanChange(e.target.value)}
                        style={{ padding: '4px 10px', borderRadius: 99, background: planBg, color: planText, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                      </select>
                      {/* Auth method */}
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: u.has_google ? (isDark ? '#0E1E38' : '#E8F0FE') : (isDark ? '#1E0E38' : '#F3E8FD'), color: u.has_google ? (isDark ? '#60A5FA' : '#1A73E8') : (isDark ? '#C084FC' : '#7B1FA2') }}>
                        {u.has_google ? '🔵 Google' : '✉ Magic link'}
                      </span>
                      {data.profile_cached && (
                        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: isDark ? '#0A1E10' : '#E6F9F0', color: isDark ? '#4ADE80' : '#1B7A4A' }}>
                          💾 Profile cached
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: theme.muted, textAlign: 'right', flexShrink: 0 }}>
                    <div>ID #{u.id}</div>
                    <div style={{ marginTop: 2 }}>Joined {fmtDate(u.created_at)}</div>
                  </div>
                </div>

                {/* ── Flash message ───────────────────────────────────── */}
                {flash && (
                  <div style={{ marginBottom: 14, padding: '9px 14px', background: flash.startsWith('✓') ? (isDark ? '#0D2A1A' : '#E6F9F0') : (isDark ? '#2A0E0E' : '#FFF0F0'), borderRadius: 8, fontSize: 13, color: flash.startsWith('✓') ? (isDark ? '#4ADE80' : '#1B7A4A') : (isDark ? '#F87171' : '#C62828'), border: `1px solid ${flash.startsWith('✓') ? (isDark ? '#1A4A1A' : '#C8E6C9') : (isDark ? '#4A1010' : '#FFCDD2')}` }}>
                    {flash}
                  </div>
                )}

                {/* ── Stats row ───────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  <Stat label="Active sessions" value={activeSessions} color={activeSessions > 0 ? (isDark ? '#4ADE80' : '#1B7A4A') : undefined} />
                  <Stat label="Total sign-ins" value={u.total_signins} />
                  <Stat label="Last seen" value={fmtRelative(u.last_seen_at)} />
                  <Stat label="Member since" value={fmtDate(u.created_at)} />
                </div>

                {/* ── Sessions ────────────────────────────────────────── */}
                <div style={{ marginBottom: 20 }}>
                  <SectionHead title="Sessions" count={data.sessions.length} />
                  {data.sessions.length === 0 ? (
                    <div style={{ fontSize: 12, color: theme.muted, padding: '10px 0' }}>No sessions on record.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.sessions.map(s => {
                        const active = !!s.is_active;
                        return (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: theme.bg, borderRadius: 8, border: `1px solid ${active ? (isDark ? '#1A4A1A' : '#C8E6C9') : theme.border}` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#4ADE80' : theme.muted, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontFamily: 'monospace', color: theme.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.device_id || '(no device id)'}
                              </div>
                              <div style={{ fontSize: 10, color: theme.muted, marginTop: 2 }}>
                                Created {fmtRelative(s.created_at)}
                              </div>
                            </div>
                            <div style={{ fontSize: 10, color: active ? (isDark ? '#4ADE80' : '#1B7A4A') : theme.muted, textAlign: 'right', flexShrink: 0 }}>
                              {active ? `Expires ${fmtDateTime(s.expires_at)}` : 'Expired'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Auth log ────────────────────────────────────────── */}
                <div style={{ marginBottom: 20 }}>
                  <SectionHead title="Recent auth events" count={data.auth_logs.length} />
                  {data.auth_logs.length === 0 ? (
                    <div style={{ fontSize: 12, color: theme.muted, padding: '10px 0' }}>No auth events on record.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {data.auth_logs.map(log => (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 10px', borderRadius: 6, background: theme.bg }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: eventColor(log.event), flexShrink: 0, marginTop: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: eventColor(log.event) }}>{log.event}</span>
                              {log.method && <span style={{ fontSize: 10, color: theme.muted, background: theme.card, padding: '1px 5px', borderRadius: 4, border: `1px solid ${theme.border}` }}>{log.method}</span>}
                              {log.ip && <span style={{ fontSize: 10, color: theme.muted, fontFamily: 'monospace' }}>{log.ip}</span>}
                            </div>
                            {log.user_agent && (
                              <div style={{ fontSize: 10, color: theme.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.user_agent}>
                                {log.user_agent.slice(0, 80)}{log.user_agent.length > 80 ? '…' : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: theme.muted, flexShrink: 0, textAlign: 'right' }}>{fmtRelative(log.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Danger zone ─────────────────────────────────────── */}
                {activeSessions > 0 && (
                  <div style={{ padding: '14px 16px', background: isDark ? '#1A0808' : '#FFF5F5', border: `1px solid ${isDark ? '#3A1010' : '#FFCDD2'}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#F87171' : '#C62828', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Danger zone</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: 12, color: isDark ? '#F87171' : '#C62828' }}>
                        Revoke all {activeSessions} active session{activeSessions !== 1 ? 's' : ''}. The user will be signed out everywhere.
                      </div>
                      <button onClick={handleRevoke} disabled={busy}
                        style={{ flexShrink: 0, padding: '7px 14px', background: isDark ? '#3A1010' : '#FFF0F0', border: `1px solid ${isDark ? '#5A1A1A' : '#FFCDD2'}`, borderRadius: 6, color: isDark ? '#F87171' : '#C62828', fontSize: 12, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                        Revoke all
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
