import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ApiSettings } from '../types';
import { Shield } from './icons';
import { useAuth } from '../auth/AuthContext';
import {
  testProviderConnection, getSelectedProvider, setSelectedProvider, type AiProvider,
  getSessionTokenUsage, resetSessionTokenUsage, TOKEN_USAGE_EVENT, type SessionTokenUsage,
  getClaudeModel, setClaudeModel, getGeminiModel, setGeminiModel, getGroqModel, setGroqModel,
  CLAUDE_MODEL_OPTIONS, GEMINI_MODEL_OPTIONS, GROQ_MODEL_OPTIONS,
  getGroqApiKey,
} from '../services/groqService';
import { setRuntimeKeys } from '../services/security/RuntimeKeys';
import { useAccountTier } from '../hooks/useAccountTier';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentApiSettings: ApiSettings;
  onOpenOnboarding?: () => void;
  onOpenPricing?: () => void;
  /** Open straight into the BYOK key-entry UI, even if the account is still on the free tier (e.g. user just chose BYOK from the pricing modal). */
  forceByokView?: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiSettings, onOpenOnboarding, onOpenPricing, forceByokView }) => {
  const [geminiKey, setGeminiKey] = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey] = useState(currentApiSettings.claudeApiKey || '');
  const [groqKey, setGroqKey] = useState(currentApiSettings.groqApiKey || getGroqApiKey() || '');
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProvider>(getSelectedProvider());
  const [claudeModel, setClaudeModelState] = useState<string>(getClaudeModel());
  const [geminiModel, setGeminiModelState] = useState<string>(getGeminiModel());
  const [groqModel, setGroqModelState] = useState<string>(getGroqModel());

  const { effectiveTier } = useAccountTier();
  // BYOK = user has at least one of their own API keys configured
  const isByok  = effectiveTier === 'byok';
  const isFree  = effectiveTier === 'free';
  const isPremium = effectiveTier === 'premium';

  // For BYOK users the active provider is whichever key-based provider they chose.
  // Workers AI is not an option for them — redirect any stored 'workers-ai' value.
  const handleProviderSelect = useCallback((id: AiProvider) => {
    setSelectedAiProvider(id);
  }, []);

  const { user: workerUser, isAuthenticated: isWorkerAuthenticated } = useAuth();

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
    const p = selectedAiProvider === 'claude' ? 'claude' : selectedAiProvider === 'groq' ? 'groq' : 'gemini';
    const key = p === 'claude' ? claudeKey.trim() : p === 'groq' ? groqKey.trim() : geminiKey.trim();
    if (!key) {
      setProviderTest({ status: 'fail', message: 'Please enter a key first.' });
      return;
    }
    setProviderTest({ status: 'testing' });
    if (p === 'claude') {
      try { setRuntimeKeys({ claudeApiKey: claudeKey.trim() }); } catch { }
    } else if (p === 'groq') {
      try { setRuntimeKeys({ groqApiKey: groqKey.trim() }); } catch { }
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
  }, [selectedAiProvider, claudeKey, geminiKey, groqKey]);

  useEffect(() => { setProviderTest({ status: 'idle' }); }, [selectedAiProvider, claudeKey, geminiKey]);

  useEffect(() => {
    setGeminiKey(currentApiSettings.apiKey || '');
    setClaudeKey(currentApiSettings.claudeApiKey || '');
    setGroqKey(currentApiSettings.groqApiKey || getGroqApiKey() || '');
    setSelectedAiProvider(getSelectedProvider());
    setClaudeModelState(getClaudeModel());
    setGeminiModelState(getGeminiModel());
    setGroqModelState(getGroqModel());
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
    setClaudeModel(claudeModel);
    setGeminiModel(geminiModel);
    setGroqModel(groqModel);
    const settingsToSave: ApiSettings = {
      provider: 'gemini',
      aiProvider: selectedAiProvider,
      apiKey: geminiKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      groqApiKey: groqKey.trim() || null,
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
        className="bg-[#FAFAF8] dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 0rem)', height: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Drag handle (mobile only) ── */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-neutral-600" />
        </div>

        {/* ── Sticky header ── */}
        <div className="flex justify-between items-center px-5 sm:px-7 pt-3 sm:pt-6 pb-4 border-b border-zinc-200 dark:border-neutral-800 flex-shrink-0 bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-t-3xl">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50" style={{ fontFamily: "'Playfair Display', serif" }}>Settings</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Your account, AI engine & security</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-neutral-800 text-2xl leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          className="overflow-y-auto flex-1 px-4 sm:px-6 py-5 space-y-4 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >

          {/* ── Signed-in profile card ── */}
          {isWorkerAuthenticated && workerUser && (() => {
            const initials = (workerUser.name || workerUser.email || '?').charAt(0).toUpperCase();
            return (
              <div className="rounded-2xl border border-[#C9A84C]/30 bg-gradient-to-br from-[#1B2B4B]/5 to-[#C9A84C]/5 dark:from-[#1B2B4B]/30 dark:to-[#C9A84C]/10 p-4 flex items-center gap-4">
                {workerUser.picture ? (
                  <img
                    src={workerUser.picture}
                    alt={workerUser.name || ''}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full ring-2 ring-[#C9A84C]/60 shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#1B2B4B] ring-2 ring-[#C9A84C]/60 flex items-center justify-center text-xl font-extrabold text-white flex-shrink-0 shadow-md">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 truncate leading-snug">
                    {workerUser.name || 'Signed in'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{workerUser.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#8B6B2E] dark:text-[#C9A84C]">
                    ✓ ProCV Account
                  </span>
                </div>
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
              </div>
            );
          })()}

          {/* ── AI Engine ── */}
          {/* Reusable key-provider card used by BYOK section */}
          {(() => {
            /** A single Claude / Gemini / Groq provider card */
            const ByokProviderCard = ({
              id, icon, label, badge, badgeColor, desc, keyValue, keyPlaceholder, keyLink, keyLinkLabel,
              borderColor, activeBg, onKeyChange, modelValue, modelOptions, onModelChange, showCaching,
            }: {
              id: AiProvider; icon: string; label: string; badge: string; badgeColor: string;
              desc: string; keyValue: string; keyPlaceholder: string; keyLink: string; keyLinkLabel: string;
              borderColor: string; activeBg: string; onKeyChange: (v: string) => void;
              modelValue: string; modelOptions: { id: string; label: string }[];
              onModelChange: (v: string) => void; showCaching?: boolean;
            }) => {
              const active = selectedAiProvider === id;
              const hasKey = !!keyValue.trim();
              return (
                <div
                  onClick={() => handleProviderSelect(id)}
                  className={`rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 space-y-2.5 ${
                    active ? `${borderColor} ${activeBg} shadow-sm` : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-neutral-800/40 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{icon}</span>
                      <span className={`text-sm font-bold ${active ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300'}`}>{label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${active ? `${borderColor} bg-white dark:bg-neutral-700` : 'border-zinc-300 dark:border-zinc-600'}`}>
                      {active && <div className="w-2 h-2 rounded-full bg-zinc-800 dark:bg-zinc-200" />}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{desc}</p>
                  {/* Key input + model picker — only when active */}
                  {active && (
                    <div className="space-y-2.5 pt-1.5 border-t border-black/5 dark:border-white/5" onClick={(e) => e.stopPropagation()}>
                      <a href={keyLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 text-zinc-600 dark:text-zinc-300 mt-2">
                        {keyLinkLabel}
                      </a>
                      <Input type="password" value={keyValue} onChange={(e) => onKeyChange(e.target.value)}
                        placeholder={keyPlaceholder} className="font-mono text-sm" />
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Model</label>
                        <select value={modelValue} onChange={(e) => onModelChange(e.target.value)}
                          className="w-full text-sm rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                          {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button type="button" onClick={runProviderTest}
                          disabled={providerTest.status === 'testing' || !hasKey}
                          className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-800 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white">
                          {providerTest.status === 'testing' ? 'Testing…' : 'Test connection'}
                        </Button>
                        {providerTest.status === 'ok' && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ {providerTest.message}</span>}
                        {providerTest.status === 'fail' && <span className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {providerTest.message}</span>}
                      </div>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Your key is proxied through our secure server — never exposed in DevTools.</p>
                      {showCaching && hasKey && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">⚡ Prompt caching active</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">— 90% cheaper on repeats</span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Key status when collapsed */}
                  {!active && (
                    <div className="flex items-center gap-1">
                      {hasKey ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Key configured</span>
                               : <span className="text-[10px] text-zinc-400 dark:text-zinc-500">○ No key yet</span>}
                    </div>
                  )}
                </div>
              );
            };

            // ── BYOK tier: own keys only, no Workers AI ──────────────────────
            // Also shown when the user just chose BYOK from the pricing modal but
            // hasn't saved a key yet — effectiveTier is still 'free' at that point.
            if (isByok || forceByokView) {
              return (
                <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-[#1B2B4B]/10 dark:bg-[#C9A84C]/10 flex items-center justify-center text-lg flex-shrink-0">🔑</span>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Your API Keys</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick which key powers generation — unlimited CVs &amp; PDFs on your quota</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#1B2B4B]/10 text-[#1B2B4B] dark:bg-[#C9A84C]/15 dark:text-[#C9A84C] flex-shrink-0">BYOK</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <ByokProviderCard id="claude" icon="🧠" label="Claude (Anthropic)"
                      badge="Your key" badgeColor="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      desc="Claude Haiku/Sonnet via secure server proxy. Fast, 200K context. Prompt caching cuts repeat costs 90%."
                      keyValue={claudeKey} keyPlaceholder="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"
                      keyLink="https://console.anthropic.com/settings/keys" keyLinkLabel="Get Claude API key →"
                      borderColor="border-purple-200 dark:border-purple-700/60" activeBg="bg-purple-50 dark:bg-purple-900/20"
                      onKeyChange={setClaudeKey} modelValue={claudeModel} modelOptions={CLAUDE_MODEL_OPTIONS}
                      onModelChange={setClaudeModelState} showCaching />
                    <ByokProviderCard id="gemini" icon="🔍" label="Gemini (Google)"
                      badge="Your key" badgeColor="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      desc="Gemini 2.5 Flash via secure server proxy. 1M context. Also enables PDF/image CV upload."
                      keyValue={geminiKey} keyPlaceholder="AIzaSy..."
                      keyLink="https://aistudio.google.com/app/apikey" keyLinkLabel="Get Gemini API key →"
                      borderColor="border-blue-200 dark:border-blue-700/60" activeBg="bg-blue-50 dark:bg-blue-900/20"
                      onKeyChange={setGeminiKey} modelValue={geminiModel} modelOptions={GEMINI_MODEL_OPTIONS}
                      onModelChange={setGeminiModelState} />
                    <ByokProviderCard id="groq" icon="⚡" label="Groq"
                      badge="Your key" badgeColor="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                      desc="Ultra-fast inference — Llama 3.3 70B, Kimi K2, DeepSeek R1 and more. Free tier available."
                      keyValue={groqKey} keyPlaceholder="gsk_..."
                      keyLink="https://console.groq.com/keys" keyLinkLabel="Get Groq API key →"
                      borderColor="border-orange-200 dark:border-orange-700/60" activeBg="bg-orange-50 dark:bg-orange-900/20"
                      onKeyChange={setGroqKey} modelValue={groqModel} modelOptions={GROQ_MODEL_OPTIONS}
                      onModelChange={setGroqModelState} />
                  </div>
                  {/* Hard rule: no Workers AI fallback on BYOK */}
                  <div className="flex items-start gap-2 rounded-xl bg-zinc-50 dark:bg-neutral-800/60 border border-zinc-200 dark:border-neutral-700 p-3">
                    <span className="text-zinc-400 flex-shrink-0 mt-0.5 text-sm">ℹ</span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Workers AI is not available on BYOK. Your key is the sole AI source — if your quota runs out, generation stops rather than silently switching engines. This keeps your billing predictable.
                    </p>
                  </div>

                  {/* Easy upgrade path — swap BYOK hassle for Premium's managed engine */}
                  {onOpenPricing && (
                    <div className="rounded-xl bg-gradient-to-br from-[#1B2B4B] to-[#101a30] p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">Done managing your own keys?</p>
                        <p className="text-xs text-white/70 mt-0.5">Go Premium for our best models on us — no keys, no quotas to watch.</p>
                      </div>
                      <Button type="button" onClick={onOpenPricing}
                        className="flex-shrink-0 text-xs px-3.5 py-2 bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-[#1B2B4B] font-bold">
                        Upgrade to Premium
                      </Button>
                    </div>
                  )}
                </div>
              );
            }

            // ── Free tier: Workers AI runs silently in the background — nothing to show or configure ──
            if (isFree) {
              return (
                <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-[#1B2B4B]/10 dark:bg-[#C9A84C]/10 flex items-center justify-center text-lg flex-shrink-0">✨</span>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">AI Engine</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Runs automatically — nothing to set up</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-800 dark:text-zinc-400 flex-shrink-0">Free</span>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-[#1B2B4B] to-[#101a30] p-4 space-y-3">
                    <p className="text-xs text-white/80 leading-relaxed">
                      Unlimited CV generation and 2 free PDF downloads — powered automatically, no setup needed.
                      Want unlimited PDFs and more tools? Bring your own API key (BYOK) or go Premium.
                    </p>
                    <Button type="button" onClick={onOpenPricing}
                      className="text-xs px-3.5 py-2 bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-[#1B2B4B] font-bold">
                      See upgrade options
                    </Button>
                  </div>
                </div>
              );
            }

            // ── Premium tier: Workers AI best models run automatically ───────
            return (
              <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center text-lg flex-shrink-0">⭐</span>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">AI Engine</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Best models run automatically — nothing to set up</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C9A84C]/15 text-[#8B6B2E] dark:text-[#C9A84C] flex-shrink-0">Premium</span>
                </div>
                {/* Optional own keys */}
                <div>
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">Optional: use your own key instead of Workers AI</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    <ByokProviderCard id="claude" icon="🧠" label="Claude (Anthropic)"
                      badge="Optional" badgeColor="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      desc="Claude Haiku/Sonnet — use your own key if you prefer Anthropic's models."
                      keyValue={claudeKey} keyPlaceholder="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"
                      keyLink="https://console.anthropic.com/settings/keys" keyLinkLabel="Get Claude API key →"
                      borderColor="border-purple-200 dark:border-purple-700/60" activeBg="bg-purple-50 dark:bg-purple-900/20"
                      onKeyChange={setClaudeKey} modelValue={claudeModel} modelOptions={CLAUDE_MODEL_OPTIONS}
                      onModelChange={setClaudeModelState} showCaching />
                    <ByokProviderCard id="gemini" icon="🔍" label="Gemini (Google)"
                      badge="Optional" badgeColor="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      desc="Gemini 2.5 Flash — also enables PDF/image CV upload regardless of active AI provider."
                      keyValue={geminiKey} keyPlaceholder="AIzaSy..."
                      keyLink="https://aistudio.google.com/app/apikey" keyLinkLabel="Get Gemini API key →"
                      borderColor="border-blue-200 dark:border-blue-700/60" activeBg="bg-blue-50 dark:bg-blue-900/20"
                      onKeyChange={setGeminiKey} modelValue={geminiModel} modelOptions={GEMINI_MODEL_OPTIONS}
                      onModelChange={setGeminiModelState} />
                    <ByokProviderCard id="groq" icon="⚡" label="Groq"
                      badge="Optional" badgeColor="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                      desc="Ultra-fast Groq inference if you want fastest possible generation speed."
                      keyValue={groqKey} keyPlaceholder="gsk_..."
                      keyLink="https://console.groq.com/keys" keyLinkLabel="Get Groq API key →"
                      borderColor="border-orange-200 dark:border-orange-700/60" activeBg="bg-orange-50 dark:bg-orange-900/20"
                      onKeyChange={setGroqKey} modelValue={groqModel} modelOptions={GROQ_MODEL_OPTIONS}
                      onModelChange={setGroqModelState} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Session Token Usage & Key Security ── BYOK only: this is about the
              security/cost of the user's OWN API key, so it's meaningless for
              Free/Premium (they never hold a key or a token bill of their own). */}
          {(isByok || forceByokView) && (
          <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </span>
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Security &amp; Usage</h3>
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/40 dark:text-emerald-300 cursor-default"
                >
                  <span aria-hidden>{icon}</span> {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Your API keys are encrypted using your browser's built-in cryptography before any storage.
              The plaintext key exists only in memory during your session and is sent exclusively to our
              Cloudflare Worker proxy over HTTPS — never directly to third-party APIs from the browser.
            </p>

            {/* Token usage row */}
            <div className="border-t border-zinc-100 dark:border-neutral-700 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Session token usage <span className="font-normal text-zinc-400">(estimated)</span></p>
                <button
                  type="button"
                  onClick={() => { resetSessionTokenUsage(); setTokenUsage(getSessionTokenUsage()); }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline underline-offset-2"
                >
                  Reset
                </button>
              </div>
              {tokenUsage.callCount === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No AI calls made yet this session.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'AI calls', value: tokenUsage.callCount.toLocaleString() },
                    { label: '~Input tokens', value: tokenUsage.inputTokensEst.toLocaleString() },
                    { label: '~Output tokens', value: tokenUsage.outputTokensEst.toLocaleString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-zinc-50 dark:bg-neutral-800/60 border border-zinc-100 dark:border-neutral-700 p-2.5 text-center">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{value}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                ~1 token ≈ 4 characters. Resets on page reload. Includes all CV generation, analysis, and toolkit calls.
              </p>
            </div>
          </div>
          )}

          {/* ── PDF/image upload status — informational only, no duplicate key input ──
              BYOK/Premium only. Claude and Gemini can both read PDFs/images directly —
              whichever of those two the user has already keyed in above covers this,
              so there's no separate "just for uploads" key to fill in. Workers AI reads
              images automatically for Free tier with no key at all. */}
          {(isByok || isPremium || forceByokView) && (() => {
            const hasVisionKey = !!claudeKey.trim() || !!geminiKey.trim() || !!groqKey.trim();
            const visionDesc = groqKey.trim() && !claudeKey.trim() && !geminiKey.trim()
              ? 'Groq reads image CVs directly. PDFs are text-extracted for free, then structured by Groq — no extra key needed.'
              : hasVisionKey
              ? 'Your key (set above) reads PDF and image CVs directly — nothing extra to add.'
              : 'Add a Groq, Claude, or Gemini key above to upload a PDF or image CV — or just paste your CV text instead.';
            return (
              <div className={`rounded-2xl border p-5 space-y-2 shadow-sm ${hasVisionKey ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-900/10'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${hasVisionKey ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>📄</span>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">PDF &amp; Image Upload</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Uses whichever key you've set above</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${hasVisionKey ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {hasVisionKey ? '● Ready' : '○ Needs a key'}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {visionDesc}
                </p>
              </div>
            );
          })()}

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

    </>
  );
};

export default SettingsModal;
