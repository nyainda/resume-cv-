import React, { useEffect, useState, useCallback } from 'react';
import { listAdminTokens, createAdminToken, revokeAdminTokens, AdminTokenRow } from '../../services/cvEngineClient';
import { PageHeader, Section, Th, Td, LoadingBar, ErrorBlock } from './OverviewTab';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    viewer: { bg: '#f1f3f4', text: '#5f6368' },
    editor: { bg: '#e8f0fe', text: '#1a73e8' },
    admin:  { bg: '#fce8e6', text: '#c5221f' },
};

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

export default function TokensTab() {
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
        if (res?.ok) {
            flash(`Revoked ${res.revoked} token${res.revoked !== 1 ? 's' : ''}`);
            setSelected(new Set());
            await load();
        } else flash('Failed to revoke tokens', true);
        setRevoking(false);
    };

    const toggleSelect = (id: string) => {
        setSelected(s => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const active = rows.filter(r => !r.revoked_at);
    const revoked = rows.filter(r => r.revoked_at);

    return (
        <div>
            <PageHeader title="Admin Tokens" subtitle="Create and manage API access tokens for the admin panel" onRefresh={load} />

            {/* Create new token */}
            <Section title="Create New Token">
                <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2, minWidth: 200 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Token Label</label>
                        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                            placeholder="e.g. Developer Key, CI Token…"
                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</label>
                        <select value={newRole} onChange={e => setNewRole(e.target.value as any)}
                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e0ddd8', borderRadius: 8, fontSize: 14, background: 'white', cursor: 'pointer' }}>
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button type="submit" disabled={creating || !newLabel.trim()}
                        style={{ padding: '10px 20px', background: creating || !newLabel.trim() ? '#ccc' : NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: creating || !newLabel.trim() ? 'not-allowed' : 'pointer' }}>
                        {creating ? 'Creating…' : '+ Create Token'}
                    </button>
                </form>
            </Section>

            {/* New token reveal */}
            {newToken && (
                <div style={{ marginTop: 16, padding: '16px 20px', background: '#f0faf4', border: '1px solid #a8d5b5', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1b5e20', marginBottom: 8 }}>✓ Token created — copy it now, it won't be shown again</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, background: '#e6f4ea', padding: '10px 14px', borderRadius: 6, color: '#1a4a25', wordBreak: 'break-all', letterSpacing: '0.05em' }}>{newToken}</div>
                    <button onClick={() => { navigator.clipboard.writeText(newToken); flash('Copied!'); }}
                        style={{ marginTop: 10, padding: '6px 14px', background: NAVY, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Copy to clipboard
                    </button>
                    <button onClick={() => setNewToken('')}
                        style={{ marginTop: 10, marginLeft: 8, padding: '6px 14px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                        Dismiss
                    </button>
                </div>
            )}

            {msg && (
                <div style={{ marginTop: 12, padding: '10px 16px', background: msg.startsWith('✗') ? '#fff5f5' : '#f0faf4', border: `1px solid ${msg.startsWith('✗') ? '#ffcdd2' : '#a8d5b5'}`, borderRadius: 8, fontSize: 13, color: msg.startsWith('✗') ? '#c62828' : '#1b5e20' }}>
                    {msg}
                </div>
            )}

            {loading ? <LoadingBar /> : err ? <ErrorBlock msg={err} /> : (
                <div style={{ marginTop: 20 }}>
                    {/* Active tokens */}
                    <Section title={`Active Tokens (${active.length})`}>
                        {selected.size > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <button onClick={handleRevoke} disabled={revoking}
                                    style={{ padding: '7px 16px', background: '#c62828', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    {revoking ? 'Revoking…' : `Revoke ${selected.size} selected`}
                                </button>
                            </div>
                        )}
                        {active.length === 0 ? (
                            <p style={{ color: '#aaa', fontSize: 13 }}>No active tokens. Create one above.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <Th><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(active.map(r => r.id)) : new Set())} /></Th>
                                        {['Label', 'Role', 'Created', 'Last Used'].map(h => <Th key={h}>{h}</Th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {active.map(r => {
                                        const { bg, text } = ROLE_COLORS[r.role] || ROLE_COLORS.viewer;
                                        return (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f0ede6' }}>
                                                <Td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></Td>
                                                <Td><span style={{ fontWeight: 600, color: NAVY }}>{r.label}</span></Td>
                                                <Td><span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: bg, color: text, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.role}</span></Td>
                                                <Td><span style={{ fontSize: 12, color: '#666' }}>{fmtDate(r.created_at)}</span></Td>
                                                <Td><span style={{ fontSize: 12, color: '#888' }}>{fmtRelative(r.last_used_at)}</span></Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </Section>

                    {revoked.length > 0 && (
                        <div style={{ marginTop: 20 }}>
                            <Section title={`Revoked Tokens (${revoked.length})`}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>{['Label', 'Role', 'Revoked At'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                                    <tbody>
                                        {revoked.map(r => (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f0ede6', opacity: 0.55 }}>
                                                <Td><span style={{ color: '#888', textDecoration: 'line-through' }}>{r.label}</span></Td>
                                                <Td><span style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.role}</span></Td>
                                                <Td><span style={{ fontSize: 12, color: '#aaa' }}>{fmtDate(r.revoked_at || null)}</span></Td>
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
