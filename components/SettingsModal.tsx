import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { ApiSettings } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { DriveDataPanel } from './DriveDataPanel';
import { Shield, AlertCircle } from './icons';
import { idbAppSet } from '../services/storage/AppDataPersistence';
import { getStorageService } from '../services/storage/StorageRouter';

const LS_PROVIDER_KEYS = 'cv_builder:provider_keys';
const LS_MS_TOKEN      = 'cv_builder:ms_access_token';
const LS_MS_USER       = 'cv_builder:ms_user';

const MicrosoftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.4 2H2v9.4h9.4V2z" fill="#f25022" />
    <path d="M22 2h-9.4v9.4H22V2z" fill="#7fba00" />
    <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00a4ef" />
    <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#ffb900" />
  </svg>
);

const GroqIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm4-2v4m-2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentApiSettings: ApiSettings;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiSettings }) => {
  const [groqKey, setGroqKey]         = useState(currentApiSettings.groqApiKey || '');
  const [geminiKey, setGeminiKey]     = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey]     = useState(currentApiSettings.claudeApiKey || '');
  const [tavilyKey, setTavilyKey]     = useState(currentApiSettings.tavilyApiKey || '');
  const [brevoKey, setBrevoKey]       = useState(currentApiSettings.brevoApiKey || '');
  const [msClientId, setMsClientId]   = useState(currentApiSettings.msClientId || '');
  const [jsearchKey, setJsearchKey]   = useState(currentApiSettings.jsearchApiKey || '');
  const [msConnected, setMsConnected] = useState(false);
  const [msUser, setMsUser] = useState<{ name: string; email: string } | null>(null);
  const [msConnecting, setMsConnecting] = useState(false);
  const [msError, setMsError] = useState<string | null>(null);

  useEffect(() => {
    setGroqKey(currentApiSettings.groqApiKey || '');
    setGeminiKey(currentApiSettings.apiKey || '');
    setClaudeKey(currentApiSettings.claudeApiKey || '');
    setTavilyKey(currentApiSettings.tavilyApiKey || '');
    setBrevoKey(currentApiSettings.brevoApiKey || '');
    setMsClientId(currentApiSettings.msClientId || '');
    setJsearchKey(currentApiSettings.jsearchApiKey || '');

    const storedMsUser = localStorage.getItem(LS_MS_USER);
    if (storedMsUser) {
      try { setMsUser(JSON.parse(storedMsUser)); setMsConnected(true); } catch { }
    }
  }, [currentApiSettings, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleMsConnect = useCallback(async () => {
    if (!msClientId.trim()) {
      setMsError('Please enter your Azure App Client ID first.');
      return;
    }
    setMsConnecting(true);
    setMsError(null);

    const redirectUri = window.location.origin;
    const scopes = 'openid profile email Files.ReadWrite offline_access';
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(msClientId.trim())}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_mode=fragment` +
      `&nonce=${Date.now()}`;

    const popup = window.open(authUrl, 'ms-login', 'width=500,height=700,left=300,top=100');
    if (!popup) {
      setMsError('Popup was blocked. Allow popups for this site and try again.');
      setMsConnecting(false);
      return;
    }

    const checker = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(checker);
          setMsConnecting(false);
          return;
        }
        const hash = popup.location.hash;
        if (hash && hash.includes('access_token')) {
          clearInterval(checker);
          popup.close();
          const params = new URLSearchParams(hash.slice(1));
          const token = params.get('access_token');
          if (token) {
            localStorage.setItem(LS_MS_TOKEN, token);
            idbAppSet(LS_MS_TOKEN, token).catch(() => {});
            fetch('https://graph.microsoft.com/v1.0/me', {
              headers: { Authorization: `Bearer ${token}` }
            })
              .then(r => r.json())
              .then(data => {
                const user = { name: data.displayName || 'Microsoft User', email: data.mail || data.userPrincipalName || '' };
                localStorage.setItem(LS_MS_USER, JSON.stringify(user));
                idbAppSet(LS_MS_USER, user).catch(() => {});
                setMsUser(user);
                setMsConnected(true);
                setMsConnecting(false);
              })
              .catch(() => {
                setMsConnected(true);
                setMsUser({ name: 'Microsoft User', email: '' });
                setMsConnecting(false);
              });
          }
        }
      } catch {
        // cross-origin — still loading
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checker);
      if (!popup?.closed) popup?.close();
      setMsConnecting(false);
    }, 120000);
  }, [msClientId]);

  const handleMsDisconnect = useCallback(() => {
    localStorage.removeItem(LS_MS_TOKEN);
    localStorage.removeItem(LS_MS_USER);
    setMsConnected(false);
    setMsUser(null);
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    const settingsToSave: ApiSettings = {
      provider: 'gemini',
      apiKey: geminiKey.trim() || null,
      groqApiKey: groqKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      tavilyApiKey: tavilyKey.trim() || null,
      brevoApiKey: brevoKey.trim() || null,
      msClientId: msClientId.trim() || null,
      jsearchApiKey: jsearchKey.trim() || null,
    };

    try {
      localStorage.setItem('cv_builder:apiSettings', JSON.stringify(settingsToSave));
    } catch { /* quota */ }

    const providerKeys = { gemini: geminiKey.trim() || null, groq: groqKey.trim() || null, claude: claudeKey.trim() || null };
    idbAppSet(LS_PROVIDER_KEYS, providerKeys).catch(() => {});
    getStorageService().save('provider_keys', providerKeys).catch(() => {});

    onSave(settingsToSave);
    onClose();
  };

  const handleClearGroq = () => {
    setGroqKey('');
    const saved: ApiSettings = {
      provider: 'gemini',
      apiKey: geminiKey.trim() || null,
      groqApiKey: null,
      tavilyApiKey: tavilyKey.trim() || null,
      brevoApiKey: brevoKey.trim() || null,
      msClientId: msClientId.trim() || null,
    };
    try { localStorage.setItem('cv_builder:apiSettings', JSON.stringify(saved)); } catch {}
    onSave(saved);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4 transition-opacity duration-300"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-white dark:bg-neutral-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 0rem)', height: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Drag handle (mobile only) ── */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-neutral-600" />
        </div>

        {/* ── Sticky header ── */}
        <div className="flex justify-between items-center px-4 sm:px-6 pt-3 sm:pt-6 pb-4 border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-neutral-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          className="overflow-y-auto flex-1 px-4 sm:px-6 py-5 space-y-5 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >

          {/* ── Google Drive Backup ── */}
          <div className="rounded-2xl border-2 border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-500/5 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg flex-shrink-0">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 leading-none">Cloud Synchronization</h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 font-bold uppercase tracking-widest">Powered by Google Drive</p>
              </div>
            </div>
            <GoogleSignInButton onSignedIn={() => {}} onSignedOut={() => {}} />
          </div>

          {/* ── Google Drive Data Panel ── */}
          <DriveDataPanel onDataRestored={() => window.location.reload()} />

          {/* ── Groq AI (Primary) ── */}
          <div className="rounded-xl border-2 border-orange-200 dark:border-orange-700/40 p-4 space-y-3 bg-orange-50/50 dark:bg-orange-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Groq AI — Primary</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">CV generation • Cover letters • Rewriting • ATS analysis</p>
                </div>
              </div>
              {groqKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-orange-100 dark:border-orange-900/40 p-3 space-y-1.5">
              {[
                '🆓 Free tier with massive daily limits',
                '🚀 llama-3.3-70b for CV gen, cover letters & rewriting',
                '⚡ llama-3.1-8b for instant ATS & keyword analysis',
                '🔒 Key stored only in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 underline font-semibold"
            >
              Get your free Groq API key →
            </a>

            <Input
              id="groq-key"
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />
          </div>

          {/* ── Google Gemini (Optional — file/image parsing) ── */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 p-4 space-y-3 bg-blue-50/30 dark:bg-blue-900/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔍</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Google Gemini — Optional</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">PDF upload • Image parsing • File extraction</p>
                </div>
              </div>
              {geminiKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Only needed if you want to <strong>upload PDFs or images</strong> of your existing CV or job descriptions. Uses <strong>Gemini 2.5 Flash</strong> for vision/multimodal tasks.
            </p>

            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 underline font-semibold"
            >
              Get your Gemini API key →
            </a>

            <Input
              id="gemini-key"
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="font-mono text-sm"
            />

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Upload existing CV (PDF/image) • Paste job description screenshot
            </p>
          </div>

          {/* ── Anthropic Claude (Optional) ── */}
          <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 p-4 space-y-3 bg-purple-50/30 dark:bg-purple-900/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Anthropic Claude — Optional</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Portal scan AI analysis • ATS keyword matching • Job intelligence</p>
                </div>
              </div>
              {claudeKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-purple-100 dark:border-purple-900/40 p-3 space-y-1.5">
              {[
                '🆓 Free tier via API (claude-haiku is very affordable)',
                '🔍 Powers portal scan AI summaries & job scoring',
                '🎯 ATS keyword gap analysis on job descriptions',
                '🔒 Key stored only in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 underline font-semibold"
            >
              Get your Claude API key →
            </a>

            <Input
              id="claude-key"
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Portal Scan AI analysis • ATS keyword gap detection • Job description intelligence
            </p>
          </div>

          {/* ── Tavily Job Search ── */}
          <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 p-4 space-y-3 bg-violet-50/50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-violet-500">🔍 Tavily Job Search</h3>
              {tavilyKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400">○ Not connected</span>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Enables the <strong>Job Board</strong> — automatically scrapes live job listings, fetches full JDs, and researches companies. Free tier: <strong>1,000 calls/month</strong>.
            </p>
            <a
              href="https://app.tavily.com/home"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 underline font-semibold"
            >
              Get your free Tavily API key →
            </a>
            <Input
              id="tavily-key"
              type="password"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              placeholder="tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Job Board search • Full JD fetching • Company intelligence in CV generation
            </p>
          </div>

          {/* ── JSearch Live Jobs (RapidAPI) ── */}
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-700/40 p-4 space-y-3 bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔎</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">JSearch — Live Job Board</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Real-time job listings · Rich filters · 10M+ jobs</p>
                </div>
              </div>
              {jsearchKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>
            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-emerald-100 dark:border-emerald-900/40 p-3 space-y-1.5">
              {[
                '🆓 Free plan: 200 searches/month on RapidAPI',
                '🌍 Filter by country, date posted, employment type',
                '💼 10+ job categories (Tech, Finance, Healthcare, etc.)',
                '💰 Salary data included where available',
                '🔒 Key stored only in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <a
              href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 underline font-semibold"
            >
              Get your free JSearch API key on RapidAPI →
            </a>
            <Input
              id="jsearch-key"
              type="password"
              value={jsearchKey}
              onChange={(e) => setJsearchKey(e.target.value)}
              placeholder="your-rapidapi-key"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Live Job Board tab · Real-time listings from LinkedIn, Indeed, Glassdoor & 50+ sources
            </p>
          </div>

          {/* ── Microsoft / OneDrive ── */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 p-4 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MicrosoftIcon className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Microsoft / OneDrive</h3>
              </div>
              {msConnected ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400">○ Not connected</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-blue-100 dark:border-blue-900/40 p-3 space-y-1.5">
              {[
                '📄 Import your CV directly from a Word (.docx) file',
                '☁️ Sync CV data to your personal OneDrive',
                '📝 Apply our templates to your Word-designed CV',
                '🔒 All data stays in your browser — no server needed',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            {msConnected && msUser ? (
              <div className="flex items-center justify-between bg-white dark:bg-neutral-800/60 border border-emerald-200 dark:border-emerald-800/40 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {msUser.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{msUser.name}</p>
                    {msUser.email && <p className="text-[10px] text-zinc-500">{msUser.email}</p>}
                  </div>
                </div>
                <button
                  onClick={handleMsDisconnect}
                  className="text-xs text-rose-500 hover:text-rose-700 font-semibold ml-2 flex-shrink-0"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="ms-client-id">Azure App Client ID</Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    Register a free app at{' '}
                    <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline font-semibold">
                      Azure Portal →
                    </a>{' '}
                    to get your Client ID. Set redirect URI to <code className="text-[10px] bg-zinc-100 dark:bg-neutral-700 px-1 py-0.5 rounded break-all">{window.location.origin}</code> and enable <strong>Single-page application</strong> as the platform.
                  </p>
                  <Input
                    id="ms-client-id"
                    type="text"
                    value={msClientId}
                    onChange={(e) => setMsClientId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="font-mono text-sm"
                  />
                </div>
                {msError && (
                  <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {msError}
                  </div>
                )}
                <button
                  onClick={handleMsConnect}
                  disabled={msConnecting || !msClientId.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-neutral-800 text-sm font-bold text-zinc-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MicrosoftIcon className="h-4 w-4" />
                  {msConnecting ? 'Connecting…' : 'Sign in with Microsoft'}
                </button>
              </>
            )}

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Word Import in CV Toolkit • OneDrive CV backup • Microsoft account sync
            </p>
          </div>

          {/* ── Brevo Email Sending ── */}
          <div className="rounded-xl border border-sky-200 dark:border-sky-800/40 p-4 space-y-3 bg-sky-50/50 dark:bg-sky-900/10">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">✉️ Brevo Email Sending</h3>
              {brevoKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400">○ Not connected</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-sky-100 dark:border-sky-900/40 p-3 space-y-1.5">
              {[
                '🤖 AI drafts email body from your profile',
                '📝 Generates tailored cover letter',
                '📨 Sends directly — no email client needed',
                '🆓 300 emails/day free on Brevo',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Your <strong>profile email</strong> must be a verified sender in Brevo.{' '}
              <a href="https://app.brevo.com/senders" target="_blank" rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 underline font-semibold">
                Verify here →
              </a>
            </p>

            <a
              href="https://app.brevo.com/settings/keys/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 underline font-semibold"
            >
              Get your Brevo API key →
            </a>

            <Input
              id="brevo-key"
              type="password"
              value={brevoKey}
              onChange={(e) => setBrevoKey(e.target.value)}
              placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />

            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Powers: Email Apply → Send via Brevo • Auto-send with CV + cover letter in body
            </p>
          </div>

          {/* ── Mobile Save/Clear buttons ── */}
          <div className="sm:hidden flex flex-col gap-2 pb-2">
            <Button onClick={handleSave} className="w-full py-3 text-base">Save Settings</Button>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleClearGroq} className="flex-1">Clear Groq Key</Button>
              <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
            </div>
          </div>

        </div>

        {/* ── Sticky footer (desktop) ── */}
        <div className="hidden sm:flex justify-end gap-2 px-6 py-4 border-t border-zinc-200 dark:border-neutral-700 flex-shrink-0">
          <Button variant="danger" onClick={handleClearGroq}>Clear Groq Key</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
