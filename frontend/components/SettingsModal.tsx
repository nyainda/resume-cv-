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
import {
    testProviderConnection, getSelectedProvider, setSelectedProvider, type AiProvider,
    getSessionTokenUsage, resetSessionTokenUsage, TOKEN_USAGE_EVENT, type SessionTokenUsage,
} from '../services/groqService';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentApiSettings: ApiSettings;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiSettings }) => {
  const [geminiKey, setGeminiKey]         = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey]         = useState(currentApiSettings.claudeApiKey || '');
  const [tavilyKey, setTavilyKey]         = useState(currentApiSettings.tavilyApiKey || '');
  const [brevoKey, setBrevoKey]           = useState(currentApiSettings.brevoApiKey || '');
  const [msClientId, setMsClientId]       = useState(currentApiSettings.msClientId || '');
  const [jsearchKey, setJsearchKey]       = useState(currentApiSettings.jsearchApiKey || '');
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProvider>(getSelectedProvider());
  const [msConnected, setMsConnected]   = useState(false);
  const [msUser, setMsUser] = useState<{ name: string; email: string } | null>(null);
  const [msConnecting, setMsConnecting] = useState(false);
  const [msError, setMsError] = useState<string | null>(null);

  // ── Session token usage (live-updating via custom event) ─────────────
  const [tokenUsage, setTokenUsage] = useState<SessionTokenUsage>(() => getSessionTokenUsage());

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<SessionTokenUsage>;
      if (ce?.detail) setTokenUsage({ ...ce.detail });
    };
    window.addEventListener(TOKEN_USAGE_EVENT, handler);
    return () => window.removeEventListener(TOKEN_USAGE_EVENT, handler);
  }, []);

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
  const [providerTest, setProviderTest] = useState<TestState>({ status: 'idle' });

  const runProviderTest = useCallback(async () => {
    const p = selectedAiProvider === 'claude' ? 'claude' : 'gemini';
    const key = p === 'claude' ? claudeKey.trim() : geminiKey.trim();
    if (!key) {
      setProviderTest({ status: 'fail', message: 'Please enter a key first.' });
      return;
    }
    setProviderTest({ status: 'testing' });
    if (p === 'claude') {
      try { setRuntimeKeys({ claudeApiKey: claudeKey.trim() }); } catch {}
    } else {
      try { setRuntimeKeys({ apiKey: geminiKey.trim() }); } catch {}
    }
    try {
      const result = await testProviderConnection(p);
      if (result.ok) {
        setProviderTest({ status: 'ok', message: result.model ? `Connected — model: ${result.model}` : 'Connected' });
      } else {
        setProviderTest({ status: 'fail', message: result.error || 'Connection failed.' });
      }
    } catch (e: any) {
      setProviderTest({ status: 'fail', message: e?.message || 'Connection failed.' });
    }
  }, [selectedAiProvider, claudeKey, geminiKey]);

  useEffect(() => { setProviderTest({ status: 'idle' }); }, [selectedAiProvider, claudeKey, geminiKey]);

  useEffect(() => {
    setGeminiKey(currentApiSettings.apiKey || '');
    setClaudeKey(currentApiSettings.claudeApiKey || '');
    setTavilyKey(currentApiSettings.tavilyApiKey || '');
    setBrevoKey(currentApiSettings.brevoApiKey || '');
    setMsClientId(currentApiSettings.msClientId || '');
    setJsearchKey(currentApiSettings.jsearchApiKey || '');
    setSelectedAiProvider(getSelectedProvider());

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
    setSelectedProvider(selectedAiProvider);
    const settingsToSave: ApiSettings = {
      provider: 'gemini',
      aiProvider: selectedAiProvider,
      apiKey: geminiKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      tavilyApiKey: tavilyKey.trim() || null,
      brevoApiKey: brevoKey.trim() || null,
      msClientId: msClientId.trim() || null,
      jsearchApiKey: jsearchKey.trim() || null,
    };
    onSave(settingsToSave);
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

          {/* ── AI Provider Selection ── */}
          <div className="rounded-xl border-2 border-[#1B2B4B]/20 dark:border-zinc-700 p-4 space-y-4 bg-zinc-50/50 dark:bg-neutral-800/30">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">AI Provider</h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Choose which AI powers everything in the app</p>
              </div>
            </div>

            {/* 3-way provider selector */}
            <div className="grid grid-cols-1 gap-2">
              {([
                {
                  id: 'workers-ai' as AiProvider,
                  icon: '✨',
                  label: 'Workers AI',
                  badge: 'Premium',
                  badgeColor: 'bg-[#C9A84C]/20 text-[#7a620e] dark:bg-yellow-900/30 dark:text-yellow-300',
                  desc: 'Cloudflare Workers AI — Llama, Mistral & more. No API key needed. Full pipeline runs server-side.',
                  keyNeeded: false,
                  borderColor: 'border-[#C9A84C]/60 dark:border-yellow-700/60',
                  activeBg: 'bg-amber-50 dark:bg-amber-900/20',
                },
                {
                  id: 'claude' as AiProvider,
                  icon: '🧠',
                  label: 'Claude (Anthropic)',
                  badge: 'Free — your key',
                  badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                  desc: 'Claude Haiku via secure server proxy. Fast, 200K context. Prompt caching active — repeated generations cost 90% less and run faster.',
                  keyNeeded: true,
                  keyValue: claudeKey,
                  keyPlaceholder: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx',
                  keyLink: 'https://console.anthropic.com/settings/keys',
                  keyLinkLabel: 'Get Claude API key →',
                  borderColor: 'border-purple-200 dark:border-purple-700/60',
                  activeBg: 'bg-purple-50 dark:bg-purple-900/20',
                  onKeyChange: setClaudeKey,
                },
                {
                  id: 'gemini' as AiProvider,
                  icon: '🔍',
                  label: 'Gemini (Google)',
                  badge: 'Free — your key',
                  badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                  desc: 'Gemini 2.0 Flash via secure server proxy. 1M context. Also needed for PDF/image CV upload.',
                  keyNeeded: true,
                  keyValue: geminiKey,
                  keyPlaceholder: 'AIzaSy...',
                  keyLink: 'https://aistudio.google.com/app/apikey',
                  keyLinkLabel: 'Get Gemini API key →',
                  borderColor: 'border-blue-200 dark:border-blue-700/60',
                  activeBg: 'bg-blue-50 dark:bg-blue-900/20',
                  onKeyChange: setGeminiKey,
                },
              ]).map((opt) => {
                const active = selectedAiProvider === opt.id;
                const hasKey = !opt.keyNeeded || (opt.id === 'claude' ? !!claudeKey.trim() : !!geminiKey.trim());
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedAiProvider(opt.id)}
                    className={`rounded-lg border-2 p-3 cursor-pointer transition-all space-y-2 ${
                      active ? `${opt.borderColor} ${opt.activeBg}` : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-neutral-800/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{opt.icon}</span>
                        <span className={`text-sm font-bold ${active ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300'}`}>{opt.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>{opt.badge}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? `${opt.borderColor} bg-white dark:bg-neutral-700` : 'border-zinc-300 dark:border-zinc-600'}`}>
                        {active && <div className="w-2 h-2 rounded-full bg-zinc-800 dark:bg-zinc-200" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{opt.desc}</p>

                    {/* Key input — shown when this option is active and needs a key */}
                    {active && opt.keyNeeded && (
                      <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
                        <a href={opt.keyLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold underline text-zinc-600 dark:text-zinc-300">
                          {opt.keyLinkLabel}
                        </a>
                        <Input
                          type="password"
                          value={opt.keyValue ?? ''}
                          onChange={(e) => opt.onKeyChange?.(e.target.value)}
                          placeholder={opt.keyPlaceholder}
                          className="font-mono text-sm"
                        />
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            onClick={runProviderTest}
                            disabled={providerTest.status === 'testing' || !hasKey}
                            className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-800 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white"
                          >
                            {providerTest.status === 'testing' ? 'Testing…' : 'Test connection'}
                          </Button>
                          {providerTest.status === 'ok' && (
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {providerTest.message}</span>
                          )}
                          {providerTest.status === 'fail' && (
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {providerTest.message}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          Your key is proxied through our secure server — it is never exposed in browser DevTools.
                        </p>
                        {opt.id === 'claude' && !!claudeKey.trim() && (
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              ⚡ Prompt caching active
                            </span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">— system prompt cached between runs, 90% cheaper on repeats</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Key status badge when not active */}
                    {!active && opt.keyNeeded && (
                      <div className="flex items-center gap-1">
                        {hasKey
                          ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Key configured</span>
                          : <span className="text-[10px] text-zinc-400 dark:text-zinc-500">○ No key yet</span>
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Wake AI models (Workers AI only) */}
            {selectedAiProvider === 'workers-ai' && (
              <div className="rounded-lg bg-white dark:bg-neutral-800/60 border border-amber-100 dark:border-amber-900/40 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Wake AI models</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      Models sleep after idle. Tap to warm them up so the next generation starts instantly.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={wakeAIModels}
                    disabled={wakeState.status === 'waking'}
                    className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  >
                    {wakeState.status === 'waking' ? 'Waking…' : wakeState.status === 'done' ? 'Wake again' : 'Wake models'}
                  </Button>
                </div>
                {wakeState.status !== 'idle' && (
                  <div className="mt-3 space-y-1 border-t border-amber-100 dark:border-amber-900/40 pt-2">
                    {wakeState.status === 'waking' && (
                      <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">Pinging Cloudflare models…</p>
                    )}
                    {wakeState.status === 'done' && wakeState.results.length > 0 && (
                      <>
                        <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                          {wakeState.results.filter(r => r.ok).length}/{wakeState.results.length} models hot
                        </p>
                        <ul className="space-y-0.5">
                          {wakeState.results.map((r) => (
                            <li key={r.task} className="text-[11px] font-mono flex items-center gap-2">
                              <span className={r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{r.ok ? '✓' : '✗'}</span>
                              <span className="text-zinc-700 dark:text-zinc-200 w-24 truncate">{r.task}</span>
                              <span className="text-zinc-500 dark:text-zinc-400">{r.ms}ms</span>
                              {!r.ok && r.note && <span className="text-red-500 dark:text-red-400 truncate">— {r.note}</span>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Session Token Usage & Key Security ── */}
          <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-4 bg-white dark:bg-neutral-800/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#1B2B4B] dark:text-zinc-300 flex-shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-300">Security &amp; Usage</h3>
              </div>
            </div>

            {/* Key security row */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'AES-256-GCM encrypted', icon: '🔐', tip: 'Keys are encrypted with AES-256-GCM before storage' },
                { label: 'IndexedDB only', icon: '🗄️', tip: 'Encrypted keys stored in your browser\'s private IndexedDB' },
                { label: 'Never in plain text', icon: '🚫', tip: 'Plaintext keys exist only in memory — never written to disk' },
                { label: 'Proxied to AI', icon: '🛡️', tip: 'AI calls route through our server proxy — your key is never in browser network logs' },
              ].map(({ label, icon, tip }) => (
                <span
                  key={label}
                  title={tip}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/40 dark:text-emerald-300 cursor-default"
                >
                  <span aria-hidden>{icon}</span> {label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-snug">
              Your API keys are encrypted using your browser's built-in cryptography before any storage.
              The plaintext key exists only in memory during your session and is sent exclusively to our
              Cloudflare Worker proxy over HTTPS — never directly to third-party APIs from the browser.
            </p>

            {/* Token usage row */}
            <div className="border-t border-zinc-100 dark:border-neutral-700 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Session token usage <span className="font-normal text-zinc-400">(estimated)</span></p>
                <button
                  type="button"
                  onClick={() => { resetSessionTokenUsage(); setTokenUsage(getSessionTokenUsage()); }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline underline-offset-2"
                >
                  Reset
                </button>
              </div>
              {tokenUsage.callCount === 0 ? (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">No AI calls made yet this session.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'AI calls', value: tokenUsage.callCount.toLocaleString() },
                    { label: '~Input tokens', value: tokenUsage.inputTokensEst.toLocaleString() },
                    { label: '~Output tokens', value: tokenUsage.outputTokensEst.toLocaleString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-zinc-50 dark:bg-neutral-800/60 border border-zinc-100 dark:border-neutral-700 p-2 text-center">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{value}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                ~1 token ≈ 4 characters. Resets on page reload. Includes all CV generation, analysis, and toolkit calls.
              </p>
            </div>
          </div>

          {/* ── Gemini key for PDF/image upload (when not using Gemini as AI provider) ── */}
          {selectedAiProvider !== 'gemini' && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 p-4 space-y-3 bg-blue-50/30 dark:bg-blue-900/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Gemini — PDF & Image Upload</h3>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Optional — only needed to upload PDF/image CVs</p>
                  </div>
                </div>
                {geminiKey ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Key set</span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
                )}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Your AI provider is <strong>{selectedAiProvider === 'workers-ai' ? 'Workers AI' : 'Claude'}</strong>. A Gemini key is still needed if you want to <strong>upload a PDF or image CV</strong> for parsing.
              </p>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 underline font-semibold">
                Get your free Gemini API key →
              </a>
              <Input
                id="gemini-key-extra"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="font-mono text-sm"
              />
            </div>
          )}

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
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/40 p-4 space-y-3 bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔎</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">JSearch — Live Job Board</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">10M+ real-time listings · LinkedIn, Indeed & more · 200 searches/month free</p>
                </div>
              </div>
              {jsearchKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not set</span>
              )}
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
          </div>

          {/* ── Microsoft / OneDrive ── */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 p-4 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MicrosoftIcon className="h-4 w-4" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Microsoft / OneDrive</h3>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Import Word CVs · sync to OneDrive</p>
                </div>
              </div>
              {msConnected ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not connected</span>
              )}
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
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">✉️ Brevo Email Sending</h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">AI-drafted emails with CV · 300/day free · no email client needed</p>
              </div>
              {brevoKey ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">● Connected</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400 shrink-0">○ Not connected</span>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Your <strong>profile email</strong> must be a verified sender in Brevo.{' '}
              <a href="https://app.brevo.com/senders" target="_blank" rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 underline font-semibold">
                Verify here →
              </a>
              {' · '}
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 underline font-semibold">
                Get API key →
              </a>
            </p>
            <Input
              id="brevo-key"
              type="password"
              value={brevoKey}
              onChange={(e) => setBrevoKey(e.target.value)}
              placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-sm"
            />
          </div>

          {/* ── Mobile Save/Cancel buttons ── */}
          <div className="sm:hidden flex flex-col gap-2 pb-2">
            <Button onClick={handleSave} className="w-full py-3 text-base">Save Settings</Button>
            <Button variant="secondary" onClick={onClose} className="w-full">Cancel</Button>
          </div>

        </div>

        {/* ── Sticky footer (desktop) ── */}
        <div className="hidden sm:flex justify-end gap-2 px-6 py-4 border-t border-zinc-200 dark:border-neutral-700 flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
