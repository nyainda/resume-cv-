import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { getAdminToken, setAdminToken, fetchAdminStats } from '../../services/cvEngineClient';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';
const BG = '#F8F7F4';
const SIDEBAR_W = 240;

const OverviewTab   = lazy(() => import('./OverviewTab'));
const UsersTab      = lazy(() => import('./UsersTab'));
const AuthLogsTab   = lazy(() => import('./AuthLogsTab'));
const TokensTab     = lazy(() => import('./TokensTab'));
const HealthTab     = lazy(() => import('./HealthTab'));
const CVEngineTab   = lazy(() => import('./CVEngineTab'));
const LeakQueueTab  = lazy(() => import('./LeakQueueTab'));

export type AdminTab = 'overview' | 'users' | 'auth-logs' | 'cv-engine' | 'leak-queue' | 'tokens' | 'health';

interface NavItem { id: AdminTab; label: string; icon: React.ReactNode; }
const NAV: NavItem[] = [
    { id: 'overview',   label: 'Overview',       icon: <IconGrid /> },
    { id: 'users',      label: 'Users',           icon: <IconUsers /> },
    { id: 'auth-logs',  label: 'Auth Logs',       icon: <IconLogs /> },
    { id: 'cv-engine',  label: 'CV Engine',       icon: <IconEngine /> },
    { id: 'leak-queue', label: 'Leak Queue',      icon: <IconWarning /> },
    { id: 'tokens',     label: 'Admin Tokens',    icon: <IconKey /> },
    { id: 'health',     label: 'System Health',   icon: <IconHealth /> },
];

export default function AdminApp() {
    const [tokenInput, setTokenInput] = useState('');
    const [authed, setAuthed]         = useState(false);
    const [loginErr, setLoginErr]     = useState('');
    const [logging, setLogging]       = useState(false);
    const [tab, setTab]               = useState<AdminTab>('overview');

    useEffect(() => {
        const stored = sessionStorage.getItem('procv_admin_tok') || getAdminToken();
        if (stored) { setAdminToken(stored); sessionStorage.setItem('procv_admin_tok', stored); setAuthed(true); }
    }, []);

    const handleLogin = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenInput.trim()) return;
        setLogging(true); setLoginErr('');
        setAdminToken(tokenInput.trim());
        const stats = await fetchAdminStats();
        if (stats) {
            sessionStorage.setItem('procv_admin_tok', tokenInput.trim());
            setAuthed(true);
        } else {
            setLoginErr('Invalid token or worker unreachable. Check your admin token and try again.');
            setAdminToken('');
        }
        setLogging(false);
    }, [tokenInput]);

    const handleLogout = useCallback(() => {
        sessionStorage.removeItem('procv_admin_tok');
        setAdminToken('');
        setAuthed(false);
        setTokenInput('');
    }, []);

    if (!authed) {
        return (
            <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, Inter, sans-serif' }}>
                <div style={{ width: 420, background: 'white', borderRadius: 16, padding: '48px 40px', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 6 }}>ProCV</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: NAVY, letterSpacing: '-0.5px', fontFamily: 'Playfair Display, Georgia, serif' }}>Admin Panel</div>
                        <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>Sign in with your admin token to continue</div>
                    </div>
                    <form onSubmit={handleLogin}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Admin Token</label>
                        <input
                            type="password"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            placeholder="cvk_••••••••••••••••"
                            autoFocus
                            style={{ width: '100%', padding: '12px 14px', border: `2px solid ${loginErr ? '#e53935' : '#e0ddd8'}`, borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                            onFocus={e => { if (!loginErr) e.target.style.borderColor = NAVY; }}
                            onBlur={e => { e.target.style.borderColor = loginErr ? '#e53935' : '#e0ddd8'; }}
                        />
                        {loginErr && <div style={{ color: '#e53935', fontSize: 13, marginTop: 8 }}>{loginErr}</div>}
                        <button
                            type="submit"
                            disabled={logging || !tokenInput.trim()}
                            style={{ width: '100%', marginTop: 20, padding: '14px', background: logging || !tokenInput.trim() ? '#ccc' : NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: logging || !tokenInput.trim() ? 'not-allowed' : 'pointer', transition: 'background 0.2s', letterSpacing: '0.02em' }}
                        >
                            {logging ? 'Verifying…' : 'Sign in →'}
                        </button>
                    </form>
                    <div style={{ marginTop: 28, padding: '14px 16px', background: '#f9f8f5', borderRadius: 8, border: '1px solid #e8e5de' }}>
                        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                            <strong style={{ color: '#333' }}>Security note:</strong> Your session clears when you close this tab. Tokens are managed in the <strong>Admin Tokens</strong> tab.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const storedToken = sessionStorage.getItem('procv_admin_tok') || '';
    const maskedToken = storedToken ? storedToken.slice(0, 8) + '••••' : '—';

    return (
        <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, Inter, sans-serif' }}>
            {/* Sidebar */}
            <aside style={{ width: SIDEBAR_W, background: NAVY, color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100 }}>
                <div style={{ padding: '28px 20px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: 4 }}>ProCV</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.3px' }}>Admin Panel</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Management Console</div>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 20px' }} />
                <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
                    {NAV.map(item => {
                        const active = tab === item.id;
                        return (
                            <button key={item.id} onClick={() => setTab(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(201,168,76,0.15)' : 'transparent', color: active ? GOLD : 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400, textAlign: 'left', marginBottom: 2, transition: 'all 0.15s', borderLeft: active ? `3px solid ${GOLD}` : '3px solid transparent' }}>
                                <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
                <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Token</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12, wordBreak: 'break-all' }}>{maskedToken}</div>
                    <button onClick={handleLogout} style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.65)', fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main style={{ flex: 1, marginLeft: SIDEBAR_W, background: BG, minHeight: '100vh', overflowY: 'auto' }}>
                <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
                    <Suspense fallback={<LoadingSpinner />}>
                        {tab === 'overview'   && <OverviewTab />}
                        {tab === 'users'      && <UsersTab />}
                        {tab === 'auth-logs'  && <AuthLogsTab />}
                        {tab === 'cv-engine'  && <CVEngineTab />}
                        {tab === 'leak-queue' && <LeakQueueTab />}
                        {tab === 'tokens'     && <TokensTab />}
                        {tab === 'health'     && <HealthTab />}
                    </Suspense>
                </div>
            </main>
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 32, height: 32, border: `3px solid rgba(27,43,75,0.15)`, borderTopColor: NAVY, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function IconGrid() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/></svg>; }
function IconUsers() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" fill="currentColor"/><path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity="0.6"/><path d="M14 13c0-1.86-.93-3.5-2.34-4.47" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/></svg>; }
function IconLogs() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconEngine() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" fill="currentColor"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconWarning() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 6v3M8 11v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconKey() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 9.5l5 3M12 11l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IconHealth() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14S2 9.5 2 5.5C2 3.57 3.57 2 5.5 2c1.05 0 2 .5 2.5 1.3C8.5 2.5 9.45 2 10.5 2 12.43 2 14 3.57 14 5.5c0 4-6 8.5-6 8.5z" fill="currentColor"/></svg>; }
