import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { ApiSettings } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { DriveDataPanel } from './DriveDataPanel';
import { Shield, AlertCircle } from './icons';
import { idbAppSet } from '../services/storage/AppDataPersistence';
import { LocalStorageService } from '../services/storage/LocalStorageService';
import { testProviderConnection } from '../services/groqService';
import { setRuntimeKeys } from '../services/security/RuntimeKeys';
import { rewarmCVEngineModels, type PrewarmResult } from '../services/cvEngineClient';

const LS_MS_TOKEN = 'cv_builder:ms_access_token';
const LS_MS_USER  = 'cv_builder:ms_user';

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
  const [groqKey, setGroqKey]             = useState(currentApiSettings.groqApiKey || '');
  const [cerebrasKey, setCerebrasKey]     = useState(currentApiSettings.cerebrasApiKey || '');
  const [openrouterKey, setOpenrouterKey] = useState(currentApiSettings.openrouterApiKey || '');
  const [togetherKey, setTogetherKey]     = useState(currentApiSettings.togetherApiKey || '');
  const [geminiKey, setGeminiKey]         = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey]         = useState(currentApiSettings.claudeApiKey || '');
  const [tavilyKey, setTavilyKey]         = useState(currentApiSettings.tavilyApiKey || '');
  const [brevoKey, setBrevoKey]           = useState(currentApiSettings.brevoApiKey || '');
  const [msClientId, setMsClientId]       = useState(currentApiSettings.msClientId || '');
  const [jsearchKey, setJsearchKey]       = useState(currentApiSettings.jsearchApiKey || '');
  const [msConnected, setMsConnected]   = useState(false);
  const [msUser, setMsUser] = useState<{ name: string; email: string } | null>(null);
  const [msConnecting, setMsConnecting] = useState(false);
  const [msError, setMsError] = useState<string | null>(null);

  // ── Wake-AI-models state (manual re-warm of cv-engine-worker models) ──
  type WakeState = { status: 'idle' | 'waking' | 'done'; results: PrewarmResult[]; finishedAt?: number };
  const [wakeState, setWakeState] = useState<WakeState>({ status: 'idle', results: [] });

  const wakeAIModels = useCallback(async () => {
    setWakeState({ status: 'waking', results: [] });
    try {
      const results = await rewarmCVEngineModels();
      setWakeState({ status: 'done', results, finishedAt: Date.now() });
    } catch (e) {
      setWakeState({
        status: 'done',
        results: [{ task: 'wake', ok: false, ms: 0, note: e instanceof Error ? e.message : String(e) }],
        finishedAt: Date.now(),
      });
    }
  }, []);

  // ── Test connection state ──────────────────────────────────────────────
  type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string };
  const [groqTest, setGroqTest]             = useState<TestState>({ status: 'idle' });
  const [cerebrasTest, setCerebrasTest]     = useState<TestState>({ status: 'idle' });
  const [openrouterTest, setOpenrouterTest] = useState<TestState>({ status: 'idle' });
  const [togetherTest, setTogetherTest]     = useState<TestState>({ status: 'idle' });

  const runTest = useCallback(async (provider: 'groq' | 'cerebras' | 'openrouter' | 'together') => {
    const setter =
      provider === 'groq'       ? setGroqTest :
      provider === 'cerebras'   ? setCerebrasTest :
      provider === 'openrouter' ? setOpenrouterTest :
                                  setTogetherTest;
    const key =
      provider === 'groq'       ? groqKey :
      provider === 'cerebras'   ? cerebrasKey :
      provider === 'openrouter' ? openrouterKey :
                                  togetherKey;
    if (!key.trim()) {
      setter({ status: 'fail', message: 'Please enter a key first.' });
      return;
    }
    setter({ status: 'testing' });
    // Push the just-typed key into the in-memory runtime store so the test
    // request uses it (without requiring the user to hit Save first).
    try {
      setRuntimeKeys({
        groqApiKey:       provider === 'groq'       ? key.trim() : groqKey.trim()       || null,
        cerebrasApiKey:   provider === 'cerebras'   ? key.trim() : cerebrasKey.trim()   || null,
        openrouterApiKey: provider === 'openrouter' ? key.trim() : openrouterKey.trim() || null,
        togetherApiKey:   provider === 'together'   ? key.trim() : togetherKey.trim()   || null,
      });
    } catch {}
    try {
      const result = await testProviderConnection(provider);
      if (result.ok) {
        setter({ status: 'ok', message: result.model ? `Connected — model: ${result.model}` : 'Connected' });
      } else {
        setter({ status: 'fail', message: result.error || 'Connection failed.' });
      }
    } catch (e: any) {
      setter({ status: 'fail', message: e?.message || 'Connection failed.' });
    }
  }, [groqKey, cerebrasKey, openrouterKey, togetherKey]);

  // Reset test status when the user edits the key.
  useEffect(() => { setGroqTest({ status: 'idle' }); }, [groqKey]);
  useEffect(() => { setCerebrasTest({ status: 'idle' }); }, [cerebrasKey]);
  useEffect(() => { setOpenrouterTest({ status: 'idle' }); }, [openrouterKey]);
  useEffect(() => { setTogetherTest({ status: 'idle' }); }, [togetherKey]);

  useEffect(() => {
    setGroqKey(currentApiSettings.groqApiKey || '');
    setCerebrasKey(currentApiSettings.cerebrasApiKey || '');
    setOpenrouterKey(currentApiSettings.openrouterApiKey || '');
    setTogetherKey(currentApiSettings.togetherApiKey || '');
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
      cerebrasApiKey: cerebrasKey.trim() || null,
      openrouterApiKey: openrouterKey.trim() || null,
      togetherApiKey: togetherKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      tavilyApiKey: tavilyKey.trim() || null,
      brevoApiKey: brevoKey.trim() || null,
      msClientId: msClientId.trim() || null,
      jsearchApiKey: jsearchKey.trim() || null,
    };
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

          {/* ── Browser Storage Meter + Export ── */}
          {(() => {
            const usage = LocalStorageService.estimateUsage();
            const pct = Math.min(100, Math.round(usage * 100));
            const barColor = pct > 80 ? 'bg-red-500' : pct > 55 ? 'bg-amber-500' : 'bg-emerald-500';
            const handleExport = () => {
              const data: Record<string, unknown> = {};
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith('cv_builder:')) {
                  try { data[k] = JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { data[k] = null; }
                }
              }
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cv-builder-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            };
            return (
              <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-3 bg-zinc-50 dark:bg-neutral-800/40">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">💾 Browser Storage</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pct > 80 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400'}`}>
                    ~{pct}% used
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="w-full bg-zinc-200 dark:bg-neutral-700 rounded-full h-2">
                    <div className={`${barColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Approx. {(usage * 5).toFixed(1)} MB of ~5 MB used · IndexedDB provides an additional fallback.
                    {pct > 70 && <span className="text-amber-600 dark:text-amber-400 font-semibold"> Enable Google Drive sync to free space.</span>}
                  </p>
                </div>
                <button
                  onClick={handleExport}
                  className="w-full py-2 px-3 text-xs font-bold rounded-lg border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
                >
                  ⬇️ Export all data as backup (.json)
                </button>
              </div>
            );
          })()}

          {/* ── Google Drive Backup ── */}
          <div className="rounded-2xl border-2 border-[#1B2B4B]/20 bg-[#F8F7F4]/30 dark:bg-[#1B2B4B]/5 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1B2B4B] rounded-lg flex-shrink-0">
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

          {/* ── CV Engine Banner (the new default) ── */}
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-700/40 p-4 bg-emerald-50/50 dark:bg-emerald-900/10 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">✨</span>
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">CV Engine — now powered by Cloudflare Workers AI</h3>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  All AI work — CV generation, cover letters, rewriting, ATS analysis — now runs on our hosted CV Engine using Cloudflare Workers AI (Llama 4 Scout, Mistral Small, GLM 4.7 Flash, and more). <strong>No API key required for normal use.</strong>
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  The Groq and Cerebras keys below are <strong>optional offline fallbacks</strong> — they only activate if our CV Engine is temporarily unreachable.
                </p>
              </div>
            </div>

            {/* ── Wake AI models button ── */}
            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-emerald-100 dark:border-emerald-900/40 p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Wake AI models now</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                    Models can sleep after idle. Tap to fire a tiny warm-up so the next CV generation starts instantly.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={wakeAIModels}
                  disabled={wakeState.status === 'waking'}
                  className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  {wakeState.status === 'waking' ? 'Waking…' : wakeState.status === 'done' ? 'Wake again' : 'Wake models'}
                </Button>
              </div>

              {wakeState.status !== 'idle' && (
                <div className="mt-3 space-y-1 border-t border-emerald-100 dark:border-emerald-900/40 pt-2">
                  {wakeState.status === 'waking' && (
                    <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">Pinging Cloudflare models…</p>
                  )}
                  {wakeState.status === 'done' && wakeState.results.length === 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">CV Engine URL not configured — nothing to warm.</p>
                  )}
                  {wakeState.status === 'done' && wakeState.results.length > 0 && (
                    <>
                      <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {wakeState.results.filter(r => r.ok).length}/{wakeState.results.length} models hot
                      </p>
                      <ul className="space-y-0.5">
                        {wakeState.results.map((r) => (
                          <li key={r.task} className="text-[11px] font-mono flex items-center gap-2">
                            <span className={r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                              {r.ok ? '✓' : '✗'}
                            </span>
                            <span className="text-zinc-700 dark:text-zinc-200 w-24 truncate">{r.task}</span>
                            <span className="text-zinc-500 dark:text-zinc-400">{r.ms}ms</span>
                            {!r.ok && r.note && (
                              <span className="text-red-500 dark:text-red-400 truncate">— {r.note}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Groq AI (Optional fallback) ── */}
          <div className="rounded-xl border-2 border-orange-200 dark:border-orange-700/40 p-4 space-y-3 bg-orange-50/50 dark:bg-orange-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Groq AI — Optional Fallback</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Used only if the CV Engine is unreachable</p>
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
                '🔒 Encrypted & stored securely in your browser',
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

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => runTest('groq')}
                disabled={groqTest.status === 'testing' || !groqKey.trim()}
                className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white"
              >
                {groqTest.status === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {groqTest.status === 'ok' && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {groqTest.message}</span>
              )}
              {groqTest.status === 'fail' && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {groqTest.message}</span>
              )}
            </div>
          </div>

          {/* ── Cerebras AI (Free fallback when Groq quota is exceeded) ── */}
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-700/40 p-4 space-y-3 bg-violet-50/50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">Cerebras AI — Optional Fallback</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Last-resort fallback if both CV Engine and Groq are unreachable</p>
                </div>
              </div>
              {cerebrasKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-violet-100 dark:border-violet-900/40 p-3 space-y-1.5">
              {[
                '🆓 Free tier — same Llama models as Groq',
                '⚡ Kicks in automatically when Groq hits its daily limit',
                '🔄 No code changes needed — seamless background switch',
                '🔒 Encrypted & stored securely in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <a
              href="https://cloud.cerebras.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 underline font-semibold"
            >
              Get your free Cerebras API key →
            </a>

            <Input
              id="cerebras-key"
              type="password"
              value={cerebrasKey}
              onChange={(e) => setCerebrasKey(e.target.value)}
              placeholder="csk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => runTest('cerebras')}
                disabled={cerebrasTest.status === 'testing' || !cerebrasKey.trim()}
                className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {cerebrasTest.status === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {cerebrasTest.status === 'ok' && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {cerebrasTest.message}</span>
              )}
              {cerebrasTest.status === 'fail' && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {cerebrasTest.message}</span>
              )}
            </div>
          </div>

          {/* ── OpenRouter (Free fallback — separate daily quota) ── */}
          <div className="rounded-xl border-2 border-orange-200 dark:border-orange-700/40 p-4 space-y-3 bg-orange-50/50 dark:bg-orange-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛣️</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">OpenRouter — Free Fallback</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">NVIDIA Nemotron 120B, Qwen3 80B, Llama 3.3 70B & more — fires when CF Worker daily quota runs out</p>
                </div>
              </div>
              {openrouterKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-orange-100 dark:border-orange-900/40 p-3 space-y-1.5">
              {[
                '🆓 6 large free models — Nemotron 3 Super 120B, Qwen3 Next 80B, Llama 3.3 70B, GPT-OSS 120B, Hermes 3 405B, Gemma 3 27B',
                '⚡ 4 fast free models — Nemotron Nano 9B, GPT-OSS 20B, Gemma 3 12B, Llama 3.2 3B',
                '🔄 Auto-cycles to next model on 404/402 (deprecated or paid-only)',
                '🆘 Fires automatically when the CF Worker is offline or hits its daily neuron limit',
                '🔒 Encrypted & stored securely in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 underline font-semibold"
            >
              Get your free OpenRouter API key →
            </a>

            <Input
              id="openrouter-key"
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => runTest('openrouter')}
                disabled={openrouterTest.status === 'testing' || !openrouterKey.trim()}
                className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white"
              >
                {openrouterTest.status === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {openrouterTest.status === 'ok' && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {openrouterTest.message}</span>
              )}
              {openrouterTest.status === 'fail' && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {openrouterTest.message}</span>
              )}
            </div>
          </div>

          {/* ── Together.ai (Free fallback — separate daily quota) ── */}
          <div className="rounded-xl border-2 border-pink-200 dark:border-pink-700/40 p-4 space-y-3 bg-pink-50/50 dark:bg-pink-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤝</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-pink-600 dark:text-pink-400">Together.ai — Free Fallback</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Free Llama 3.3 70B Turbo — separate daily quota again</p>
                </div>
              </div>
              {togetherKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
            </div>

            <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-pink-100 dark:border-pink-900/40 p-3 space-y-1.5">
              {[
                '🆓 Free tier — Llama 3.3 70B Turbo Free',
                '🚀 Fast Turbo inference, OpenAI-compatible',
                '⚡ Last upstream try before Claude/Gemini paid keys',
                '🔒 Encrypted & stored securely in your browser',
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <a
              href="https://api.together.xyz/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 underline font-semibold"
            >
              Get your free Together.ai API key →
            </a>

            <Input
              id="together-key"
              type="password"
              value={togetherKey}
              onChange={(e) => setTogetherKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => runTest('together')}
                disabled={togetherTest.status === 'testing' || !togetherKey.trim()}
                className="text-xs px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white"
              >
                {togetherTest.status === 'testing' ? 'Testing…' : 'Test connection'}
              </Button>
              {togetherTest.status === 'ok' && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {togetherTest.message}</span>
              )}
              {togetherTest.status === 'fail' && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {togetherTest.message}</span>
              )}
            </div>
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
                '✍️ CV generation fallback when Workers AI quota is full',
                '🔍 Powers portal scan AI summaries & job scoring',
                '🎯 ATS keyword gap analysis on job descriptions',
                '🔒 Encrypted & stored securely in your browser',
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
                '🔒 Encrypted & stored securely in your browser',
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
                '🔒 All data encrypted & stored securely — no server needed',
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
