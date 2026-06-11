import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { getAdminToken, setAdminToken, fetchAdminStats } from '../../services/cvEngineClient';
import { AdminContextProvider, useAdminTheme } from './AdminContext';

const SIDEBAR_W = 220;

const OverviewTab  = lazy(() => import('./OverviewTab'));
const UsersTab     = lazy(() => import('./UsersTab'));
const AuthLogsTab  = lazy(() => import('./AuthLogsTab'));
const TokensTab    = lazy(() => import('./TokensTab'));
const HealthTab    = lazy(() => import('./HealthTab'));
const CVEngineTab  = lazy(() => import('./CVEngineTab'));
const LeakQueueTab = lazy(() => import('./LeakQueueTab'));
const PipelineTab  = lazy(() => import('./PipelineTab'));
const LiveFeedTab  = lazy(() => import('./LiveFeedTab'));

export type AdminTab = 'overview' | 'users' | 'auth-logs' | 'cv-engine' | 'leak-queue' | 'tokens' | 'health' | 'pipeline' | 'live-feed';

const NAV_GROUPS = [
  {
    label: 'Dashboard',
    items: [
      { id: 'overview'  as AdminTab, label: 'Overview',      icon: <IGrid /> },
      { id: 'live-feed' as AdminTab, label: 'Live Feed',     icon: <IFeed /> },
      { id: 'pipeline'  as AdminTab, label: 'Pipeline',      icon: <IFlow /> },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'users'     as AdminTab, label: 'Users',         icon: <IUsers /> },
      { id: 'auth-logs' as AdminTab, label: 'Auth Logs',     icon: <ILogs /> },
      { id: 'leak-queue'as AdminTab, label: 'Leak Queue',    icon: <IWarn /> },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'health'    as AdminTab, label: 'System Health', icon: <IHealth /> },
      { id: 'cv-engine' as AdminTab, label: 'CV Engine',     icon: <IEngine /> },
      { id: 'tokens'    as AdminTab, label: 'Admin Tokens',  icon: <IKey /> },
    ],
  },
];

export default function AdminApp() {
  return (
    <AdminContextProvider>
      <AdminAppInner />
    </AdminContextProvider>
  );
}

function AdminAppInner() {
  const { theme, isDark, toggleDark } = useAdminTheme();
  const [tokenInput, setTokenInput] = useState('');
  const [authed, setAuthed]         = useState(false);
  const [loginErr, setLoginErr]     = useState('');
  const [logging, setLogging]       = useState(false);
  const [tab, setTab]               = useState<AdminTab>('overview');
  const [mobileNav, setMobileNav]   = useState(false);

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
      setLoginErr('Invalid token or worker unreachable.');
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

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, Inter, sans-serif' }}>
        {/* Dark toggle on login page */}
        <button onClick={toggleDark} title="Toggle dark mode" style={{ position: 'fixed', top: 16, right: 16, padding: '7px 10px', background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 8, cursor: 'pointer', color: theme.sub, fontSize: 16 }}>
          {isDark ? '☀️' : '🌙'}
        </button>
        <div style={{ width: 420, background: theme.card, borderRadius: 16, padding: '48px 40px', boxShadow: isDark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 24px 80px rgba(0,0,0,0.18)', border: `1px solid ${theme.border}` }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: theme.gold, textTransform: 'uppercase', marginBottom: 6 }}>ProCV</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: theme.text, letterSpacing: '-0.5px', fontFamily: 'Playfair Display, Georgia, serif' }}>Admin Panel</div>
            <div style={{ fontSize: 13, color: theme.sub, marginTop: 6 }}>Sign in with your admin token</div>
          </div>
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: theme.sub, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin Token</label>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="cvk_••••••••••••••••"
              autoFocus
              style={{ width: '100%', padding: '12px 14px', border: `2px solid ${loginErr ? '#e53935' : theme.inputBorder}`, borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box', background: theme.input, color: theme.text, transition: 'border-color 0.15s' }}
            />
            {loginErr && <div style={{ color: '#e53935', fontSize: 13, marginTop: 8 }}>{loginErr}</div>}
            <button type="submit" disabled={logging || !tokenInput.trim()} style={{ width: '100%', marginTop: 20, padding: '13px', background: logging || !tokenInput.trim() ? theme.muted : '#1B2B4B', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: logging || !tokenInput.trim() ? 'not-allowed' : 'pointer' }}>
              {logging ? 'Verifying…' : 'Sign in →'}
            </button>
          </form>
          <div style={{ marginTop: 24, padding: '12px 14px', background: theme.bg, borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.sub }}>
            Session clears when you close this tab. Manage tokens in the Admin Tokens tab.
          </div>
        </div>
      </div>
    );
  }

  const storedToken = sessionStorage.getItem('procv_admin_tok') || '';
  const maskedToken = storedToken ? storedToken.slice(0, 8) + '••••' : '—';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, Inter, sans-serif', background: theme.bg }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: SIDEBAR_W, background: theme.sidebarBg, color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100, transition: 'transform 0.2s', transform: mobileNav ? 'translateX(0)' : undefined }}>
        {/* Logo */}
        <div style={{ padding: '22px 18px 16px', borderBottom: `1px solid ${theme.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: theme.gold, textTransform: 'uppercase' }}>ProCV</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Playfair Display, Georgia, serif', color: 'white', letterSpacing: '-0.3px' }}>Admin Panel</div>
            </div>
            <button onClick={toggleDark} title="Toggle dark/light" style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.07)', border: `1px solid ${theme.sidebarBorder}`, borderRadius: 6, cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', padding: '10px 10px 4px' }}>{group.label}</div>
              {group.items.map(item => {
                const active = tab === item.id;
                return (
                  <button key={item.id} onClick={() => { setTab(item.id); setMobileNav(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', background: active ? 'rgba(201,168,76,0.18)' : 'transparent', color: active ? theme.gold : theme.sidebarText, cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, textAlign: 'left', marginBottom: 1, borderLeft: `2px solid ${active ? theme.gold : 'transparent'}`, transition: 'all 0.12s' }}>
                    <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: active ? 1 : 0.7, flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px 16px', borderTop: `1px solid ${theme.sidebarBorder}` }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Token</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 10, wordBreak: 'break-all' }}>{maskedToken}</div>
          <button onClick={handleLogout}
            style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.sidebarBorder}`, borderRadius: 6, color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile nav overlay */}
      {mobileNav && <div onClick={() => setMobileNav(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }} />}

      {/* ── Main content ── */}
      <main style={{ flex: 1, marginLeft: SIDEBAR_W, background: theme.bg, minHeight: '100vh', overflowY: 'auto' }}>
        {/* Mobile top bar */}
        <div className="sm:hidden" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: theme.sidebarBg, borderBottom: `1px solid ${theme.sidebarBorder}`, position: 'sticky', top: 0, zIndex: 50 }}>
          <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'white', fontSize: 15 }}>Admin Panel</span>
          <button onClick={() => setMobileNav(!mobileNav)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 20 }}>☰</button>
        </div>

        <div style={{ padding: '28px 28px', maxWidth: 1280 }}>
          <Suspense fallback={<Spinner theme={theme} />}>
            {tab === 'overview'   && <OverviewTab />}
            {tab === 'live-feed'  && <LiveFeedTab />}
            {tab === 'pipeline'   && <PipelineTab />}
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

function Spinner({ theme }: { theme: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${theme.border}`, borderTopColor: theme.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function IGrid()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/></svg>; }
function IFeed()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.6"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v1M8 11v1M4 8H3M13 8h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IFlow()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="4" height="3" rx="1" fill="currentColor"/><rect x="6" y="3" width="4" height="3" rx="1" fill="currentColor" opacity="0.6"/><rect x="11" y="3" width="4" height="3" rx="1" fill="currentColor" opacity="0.4"/><path d="M5 4.5h1M10 4.5h1" stroke="currentColor" strokeWidth="1.2"/><path d="M3 6v4h10V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><rect x="5" y="10" width="6" height="3" rx="1" fill="currentColor" opacity="0.5"/></svg>; }
function IUsers()  { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" fill="currentColor"/><path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity="0.5"/><path d="M14 13c0-1.86-.93-3.5-2.34-4.47" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></svg>; }
function ILogs()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function IWarn()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13H1.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 6v3M8 11v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IHealth() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8h3l2-5 2 10 2-5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IEngine() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" fill="currentColor"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IKey()    { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 9.5l5 3M12 11l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
