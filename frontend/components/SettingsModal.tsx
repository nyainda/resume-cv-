import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ApiSettings, UserProfileSlot } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { DriveDataPanel } from './DriveDataPanel';
import { Shield } from './icons';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { useWorkerAuth } from '../auth/WorkerAuthContext';
import { clearUserScopedStorage, stampSignedOut, clearAllBrowserStorage } from '../utils/clearUserStorage';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import {
  testProviderConnection, getSelectedProvider, setSelectedProvider, type AiProvider,
  getSessionTokenUsage, resetSessionTokenUsage, TOKEN_USAGE_EVENT, type SessionTokenUsage,
} from '../services/groqService';
import { setRuntimeKeys } from '../services/security/RuntimeKeys';
import { usePremiumGate } from '../hooks/usePremiumGate';
import { PremiumUpgradeModal } from './premium/PremiumUpgradeModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentApiSettings: ApiSettings;
  onSignOut?: () => void;
  onOpenOnboarding?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiSettings, onSignOut, onOpenOnboarding }) => {
  const [geminiKey, setGeminiKey] = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey] = useState(currentApiSettings.claudeApiKey || '');
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProvider>(getSelectedProvider());

  // Premium gate for Workers AI — free users see the upgrade modal on click
  const {
    allowed: canUseWorkersAI,
    isUpgradeOpen: workersAiUpgradeOpen,
    openUpgrade: openWorkersAiUpgrade,
    closeUpgrade: closeWorkersAiUpgrade,
  } = usePremiumGate('workers-ai');

  const handleProviderSelect = useCallback((id: AiProvider) => {
    if (id === 'workers-ai' && !canUseWorkersAI) {
      openWorkersAiUpgrade();
      return;
    }
    setSelectedAiProvider(id);
  }, [canUseWorkersAI, openWorkersAiUpgrade]);

  const { user: googleUser, isAuthenticated, signOut: googleSignOut } = useGoogleAuth();
  const { workerUser, isWorkerAuthenticated, signOut: workerSignOut } = useWorkerAuth();

  const handleSignOut = async () => {
    // Clear the IDB sync queue first so no stale writes replay under a new account
    await clearQueueForAccount().catch(() => {});
    await workerSignOut();
    await googleSignOut();
    clearUserScopedStorage();
    stampSignedOut();
    onClose();
    onSignOut?.();
  };

  // Emergency browser data reset — for PWA users who can't access DevTools
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetDone, setResetDone]       = useState(false);

  const handleEmergencyReset = async () => {
    if (!resetConfirm) { setResetConfirm(true); return; }
    await clearQueueForAccount().catch(() => {});
    await clearAllBrowserStorage();
    setResetDone(true);
    setTimeout(() => window.location.reload(), 1500);
  };

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
      try { setRuntimeKeys({ claudeApiKey: claudeKey.trim() }); } catch { }
    } else {
      try { setRuntimeKeys({ apiKey: geminiKey.trim() }); } catch { }
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
    setSelectedAiProvider(getSelectedProvider());
  }, [currentApiSettings, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setSelectedProvider(selectedAiProvider);
    const settingsToSave: ApiSettings = {
      provider: 'gemini',
      aiProvider: selectedAiProvider,
      apiKey: geminiKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      msClientId: null,
    };
    onSave(settingsToSave);
    onClose();
  };

  return (
    <>
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

          {/* ── Signed-in profile card ── */}
          {(() => {
            const profile = isWorkerAuthenticated && workerUser
              ? { name: workerUser.name, email: workerUser.email, picture: workerUser.picture, via: 'ProCV Account' }
              : isAuthenticated && googleUser
              ? { name: googleUser.name, email: googleUser.email, picture: googleUser.picture, via: 'Google' }
              : null;
            if (!profile) return null;
            const initials = (profile.name || profile.email || '?').charAt(0).toUpperCase();
            return (
              <div className="rounded-2xl border border-[#C9A84C]/30 bg-gradient-to-br from-[#1B2B4B]/5 to-[#C9A84C]/5 dark:from-[#1B2B4B]/30 dark:to-[#C9A84C]/10 p-4 flex items-center gap-4">
                {/* Avatar */}
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt={profile.name || ''}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full ring-2 ring-[#C9A84C]/60 shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#1B2B4B] ring-2 ring-[#C9A84C]/60 flex items-center justify-center text-xl font-extrabold text-white flex-shrink-0 shadow-md">
                    {initials}
                  </div>
                )}
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 truncate leading-snug">
                    {profile.name || 'Signed in'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{profile.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#8B6B2E] dark:text-[#C9A84C]">
                    ✓ {profile.via}
                  </span>
                </div>
                {/* Re-run setup */}
                {onOpenOnboarding && (
                  <button
                    onClick={onOpenOnboarding}
                    className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-[#1B2B4B] hover:bg-[#1B2B4B]/10 dark:hover:text-[#C9A84C] dark:hover:bg-[#C9A84C]/10 border border-zinc-200 dark:border-neutral-700 hover:border-[#1B2B4B]/30 dark:hover:border-[#C9A84C]/30 transition-all"
                    title="Re-run setup wizard"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                    </svg>
                    Setup
                  </button>
                )}
                {/* Sign out */}
                {isWorkerAuthenticated && (
                  <button
                    onClick={handleSignOut}
                    className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 border border-zinc-200 dark:border-neutral-700 hover:border-red-300 dark:hover:border-red-700 transition-all"
                    title="Sign out"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign out
                  </button>
                )}
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
            <GoogleSignInButton onSignedIn={() => { }} onSignedOut={() => { }} />
          </div>

          {/* ── Google Drive Data Panel ── */}
          <DriveDataPanel onDataRestored={() => window.location.reload()} />

          {/* ── Emergency browser data reset ── */}
          <div className="rounded-xl border border-red-200 dark:border-red-900/40 p-4 space-y-2 bg-red-50/30 dark:bg-red-900/5">
            <div className="flex items-center gap-2">
              <span className="text-base">🧹</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Reset Browser Data</h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Clears all local storage, cache and IndexedDB on this device. Use if you see stale data after switching accounts.
                </p>
              </div>
            </div>
            {resetDone ? (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Done — reloading…</p>
            ) : resetConfirm ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold flex-1">
                  This will sign you out and wipe all local data. Are you sure?
                </p>
                <button
                  onClick={handleEmergencyReset}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Yes, wipe it
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleEmergencyReset}
                className="text-xs font-semibold text-red-600 dark:text-red-400 underline hover:no-underline transition-all"
              >
                Reset all browser data on this device →
              </button>
            )}
          </div>

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
                const isLocked = opt.id === 'workers-ai' && !canUseWorkersAI;
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleProviderSelect(opt.id)}
                    className={`relative rounded-lg border-2 p-3 cursor-pointer transition-all space-y-2 ${
                      isLocked
                        ? 'border-[#C9A84C]/40 bg-amber-50/40 dark:bg-amber-900/10 opacity-90'
                        : active
                          ? `${opt.borderColor} ${opt.activeBg}`
                          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-neutral-800/40 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    {/* Lock overlay for gated options */}
                    {isLocked && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#7a620e] dark:text-yellow-300">
                        🔒 Premium
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{opt.icon}</span>
                        <span className={`text-sm font-bold ${active ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300'}`}>{opt.label}</span>
                        {!isLocked && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${opt.badgeColor}`}>{opt.badge}</span>
                        )}
                      </div>
                      {!isLocked && (
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? `${opt.borderColor} bg-white dark:bg-neutral-700` : 'border-zinc-300 dark:border-zinc-600'}`}>
                          {active && <div className="w-2 h-2 rounded-full bg-zinc-800 dark:bg-zinc-200" />}
                        </div>
                      )}
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

    {/* Workers AI upgrade modal — rendered outside the scrollable panel */}
    <PremiumUpgradeModal
      isOpen={workersAiUpgradeOpen}
      onClose={closeWorkersAiUpgrade}
      blockedFeature="workers-ai"
    />
    </>
  );
};

export default SettingsModal;
