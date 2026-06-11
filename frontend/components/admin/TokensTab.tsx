import React, { useEffect, useState, useCallback } from 'react';
import { listAdminTokens, createAdminToken, revokeAdminTokens, AdminTokenRow } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}
function fmtRelative(s: string | null) {
  if (!s) return 'never';
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function roleStyle(role: string, isDark: boolean) {
  if (role === 'admin')  return isDark ? { bg: '#2A0E10', text: '#F87171' } : { bg: '#FCE8E6', text: '#C5221F' };
  if (role === 'editor') return isDark ? { bg: '#0E1E38', text: '#60A5FA' } : { bg: '#E8F0FE', text: '#1A73E8' };
  return isDark ? { bg: '#1A2030', text: '#8AA4BE' } : { bg: '#F1F3F4', text: '#5F6368' };
}

export default function TokensTab() {
  const { theme, isDark } = useAdminTheme();
  const [rows, setRows]         = useState<AdminTokenRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [msg, setMsg]           = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newRole, setNewRole]   = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const res = await listAdminTokens();
    if (res) setRows(res.rows);
    else setErr('Failed to load tokens.');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  let msgTimer: ReturnType<typeof setTimeout>;
  const flash = (m: string, isErr = false) => {
    setMsg((isErr ? '✗ ' : '✓ ') + m);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => setMsg(''), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreating(true);
    const res = await createAdminToken(newLabel.trim(), newRole);
    if (res?.ok) {
      setNewToken(res.token);
      setNewLabel('');
      await load();
      flash(`Token "${newLabel.trim()}" created`);
    } else flash('Failed to create token', true);
    setCreating(false);
  };

  const handleRevoke = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Revoke ${selected.size} token${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setRevoking(true);
    const res = await revokeAdminTokens(Array.from(selected));
    if (res?.ok) { flash(`Revoked ${res.revoked} token${res.revoked !== 1 ? 's' : ''}`); setSelected(new Set()); await load(); }
    else flash('Failed to revoke tokens', true);
    setRevoking(false);
  };

  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const active  = rows.filter(r => !r.revoked_at);
  const revoked = rows.filter(r => r.revoked_at);

  const inputStyle = { padding: '10px 12px', border: `1.5px solid ${theme.inputBorder}`, borderRadius: 8, fontSize: 13, background: theme.input, color: theme.text, outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div>
      <PageHeader title="Admin Tokens" subtitle="Create and manage API access tokens for the admin panel" onRefresh={load} />

      {/* Create */}
      <Section title="Create New Token">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: theme.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Token Label</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Developer Key, CI Token…" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: theme.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Role</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value as any)}
              style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={creating || !newLabel.trim()}
            style={{ padding: '10px 20px', background: creating || !newLabel.trim() ? theme.muted : theme.navy, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: creating || !newLabel.trim() ? 'not-allowed' : 'pointer' }}>
            {creating ? 'Creating…' : '+ Create Token'}
          </button>
        </form>
      </Section>

      {/* New token reveal */}
      {newToken && (
        <div style={{ marginTop: 14, padding: '16px 18px', background: theme.badge.ok.bg, border: `1px solid ${isDark ? '#1A3A1A' : '#A8D5B5'}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.badge.ok.text, marginBottom: 8 }}>✓ Token created — copy it now, it won't be shown again</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, background: isDark ? 'rgba(0,0,0,0.3)' : '#E6F4EA', padding: '10px 14px', borderRadius: 6, color: theme.badge.ok.text, wordBreak: 'break-all', letterSpacing: '0.04em' }}>{newToken}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { navigator.clipboard.writeText(newToken); flash('Copied!'); }}
              style={{ padding: '6px 14px', background: theme.navy, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Copy to clipboard
            </button>
            <button onClick={() => setNewToken('')}
              style={{ padding: '6px 14px', background: 'transparent', color: theme.sub, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: msg.startsWith('✗') ? theme.badge.err.bg : theme.badge.ok.bg, border: `1px solid ${msg.startsWith('✗') ? (isDark ? '#4A1010' : '#FFCDD2') : (isDark ? '#1A3A1A' : '#C8E6C9')}`, borderRadius: 8, fontSize: 13, color: msg.startsWith('✗') ? theme.badge.err.text : theme.badge.ok.text }}>
          {msg}
        </div>
      )}

      {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
        <div style={{ marginTop: 18 }}>
          <Section title={`Active Tokens (${active.length})`}>
            {selected.size > 0 && (
              <div style={{ marginBottom: 12 }}>
                <button onClick={handleRevoke} disabled={revoking}
                  style={{ padding: '7px 16px', background: isDark ? '#7C1A1A' : '#C62828', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {revoking ? 'Revoking…' : `Revoke ${selected.size} selected`}
                </button>
              </div>
            )}
            {active.length === 0
              ? <p style={{ color: theme.muted, fontSize: 13 }}>No active tokens. Create one above.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <Th><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(active.map(r => r.id)) : new Set())} /></Th>
                      {['Label', 'Role', 'Created', 'Last Used'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(r => {
                      const { bg, text } = roleStyle(r.role, isDark);
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                          <Td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></Td>
                          <Td><span style={{ fontWeight: 600, color: theme.text }}>{r.label}</span></Td>
                          <Td><span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: bg, color: text, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.role}</span></Td>
                          <Td><span style={{ fontSize: 12, color: theme.sub }}>{fmtDate(r.created_at)}</span></Td>
                          <Td><span style={{ fontSize: 12, color: theme.muted }}>{fmtRelative(r.last_used_at)}</span></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </Section>

          {revoked.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <Section title={`Revoked Tokens (${revoked.length})`}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Label', 'Role', 'Revoked At'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {revoked.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${theme.tableBorder}`, opacity: 0.5 }}>
                        <Td><span style={{ color: theme.muted, textDecoration: 'line-through' }}>{r.label}</span></Td>
                        <Td><span style={{ fontSize: 11, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.role}</span></Td>
                        <Td><span style={{ fontSize: 12, color: theme.muted }}>{fmtDate(r.revoked_at || null)}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
