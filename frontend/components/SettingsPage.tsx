/**
 * SettingsPage — Full-page settings hub.
 * Supports dark and light mode via SettingsThemeCtx.
 *
 * Layout: Left nav | Main content (scrollable) | Right account panel (desktop)
 * Storage: CF D1 / IndexedDB / localStorage only — no Google Drive.
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { UserProfileSlot, ApiSettings } from '../types';
import type { WorkerUser } from '../services/authService';
import { useAccountTier } from '../hooks/useAccountTier';
import {
  testProviderConnection, getSelectedProvider, setSelectedProvider, type AiProvider,
  getSessionTokenUsage, resetSessionTokenUsage, TOKEN_USAGE_EVENT, type SessionTokenUsage,
  getClaudeModel, setClaudeModel, getGeminiModel, setGeminiModel, getGroqModel, setGroqModel,
  CLAUDE_MODEL_OPTIONS, GEMINI_MODEL_OPTIONS, GROQ_MODEL_OPTIONS,
} from '../services/groqService';
import { setRuntimeKeys } from '../services/security/RuntimeKeys';
import { getSyncTimeAgo, getLastSyncTimestamp } from '../services/userDataCloudService';
import { clearQueueForAccount } from '../services/storage/syncQueue';

// ── Brand constants ────────────────────────────────────────────────────────────
const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

// ── Theme system ───────────────────────────────────────────────────────────────
type ST = {
  pageBg: string;
  cardBg: string;
  border: string;
  text1: string;   // primary
  text2: string;   // secondary ~60%
  text3: string;   // muted ~40%
  text4: string;   // faint ~30%
  inputBg: string;
  inputText: string;
  inputOptBg: string;
  navActiveBg: string;
  navActiveText: string;
  navInactiveText: string;
  navLabel: string;
  providerActiveBg: string;
  btnSecBg: string;
  btnSecText: string;
  tableAltRow: string;
  mobileTabActive: string;
  mobileTabInactive: string;
  dark: boolean;
  // Responsive flags — populated in main component after screenW is known
  isMobile: boolean;
  isTablet: boolean;
};

function makeTheme(dark: boolean): ST {
  if (dark) return {
    // Flat neutral dark — no blue gradient, matches App.tsx dark:bg-neutral-900/950
    pageBg: '#111111',
    cardBg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.08)',
    text1: '#ffffff',
    text2: 'rgba(255,255,255,0.6)',
    text3: 'rgba(255,255,255,0.4)',
    text4: 'rgba(255,255,255,0.3)',
    inputBg: 'rgba(255,255,255,0.07)',
    inputText: '#ffffff',
    inputOptBg: '#1a1a1a',       // neutral dark, was #1a2740 (blue)
    navActiveBg: `${GOLD}12`,
    navActiveText: GOLD,
    navInactiveText: 'rgba(255,255,255,0.55)',
    navLabel: 'rgba(255,255,255,0.3)',
    providerActiveBg: 'rgba(255,255,255,0.06)',  // neutral, was rgba(27,43,75,0.6) blue
    btnSecBg: 'rgba(255,255,255,0.08)',
    btnSecText: '#ffffff',
    tableAltRow: 'rgba(255,255,255,0.02)',
    mobileTabActive: GOLD,
    mobileTabInactive: 'rgba(255,255,255,0.45)',
    dark: true,
    isMobile: false,
    isTablet: false,
  };
  return {
    pageBg: '#F8F7F4',
    cardBg: '#ffffff',
    border: 'rgba(0,0,0,0.1)',
    text1: '#1B2B4B',
    text2: '#374151',
    text3: '#6B7280',
    text4: '#9CA3AF',
    inputBg: '#f3f4f6',
    inputText: '#1B2B4B',
    inputOptBg: '#ffffff',
    navActiveBg: 'rgba(201,168,76,0.12)',
    navActiveText: '#B8922A',
    navInactiveText: '#6B7280',
    navLabel: '#9CA3AF',
    providerActiveBg: 'rgba(27,43,75,0.05)',
    btnSecBg: 'rgba(0,0,0,0.06)',
    btnSecText: '#1B2B4B',
    tableAltRow: 'rgba(0,0,0,0.02)',
    mobileTabActive: '#B8922A',
    mobileTabInactive: '#9CA3AF',
    dark: false,
    // responsive flags — overridden by the main component at runtime
    isMobile: false,
    isTablet: false,
  };
}

const SettingsThemeCtx = createContext<ST>(makeTheme(true) as ST);
const useT = () => useContext(SettingsThemeCtx);

// ── Nav section definitions ────────────────────────────────────────────────────
type SettingsSection =
  | 'general'
  | 'ai-providers'
  | 'security'
  | 'profile-sharing'
  | 'storage-backup'
  | 'billing'
  | 'notifications'
  | 'appearance'
  | 'advanced';

interface NavSectionDef {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const NAV_SECTIONS: NavSectionDef[] = [
  { id: 'general', label: 'General', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
  { id: 'ai-providers', label: 'AI Providers', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
  { id: 'security', label: 'Security', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
  { id: 'profile-sharing', label: 'Profile & Sharing', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
  { id: 'storage-backup', label: 'Storage & Backup', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
  { id: 'billing', label: 'Billing', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { id: 'notifications', label: 'Notifications', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { id: 'appearance', label: 'Appearance', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
  { id: 'advanced', label: 'Advanced', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> },
];

// ── Prop types ─────────────────────────────────────────────────────────────────
interface SettingsPageProps {
  user: WorkerUser | null | undefined;
  profiles: UserProfileSlot[];
  activeSlot: UserProfileSlot | null | undefined;
  d1SyncPending?: boolean;
  darkMode: boolean;
  setDarkMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  currentApiSettings: ApiSettings;
  onSaveApiSettings: (settings: ApiSettings) => void;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onClearAllData: () => Promise<void>;
  onBack: () => void;
  onUpgrade: () => void;
  onOpenOnboarding: () => void;
  onSwitchProfile?: (slot: UserProfileSlot) => void;
}

// ── Subcomponent: Section header ───────────────────────────────────────────────
function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  const T = useT();
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 style={{ color: T.text1, fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
          {badge && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(201,168,76,0.15)', color: GOLD, border: `1px solid ${GOLD}30` }}>
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p style={{ color: T.text3, fontSize: 12, marginTop: 2 }}>{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Subcomponent: Card wrapper ─────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const T = useT();
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12 }} className={className}>
      {children}
    </div>
  );
}

// ── Subcomponent: Provider overview card ───────────────────────────────────────
function ProviderOverviewCard({
  icon, name, badge, badgeColor, model, description, isActive, onConfigure,
}: {
  icon: string; name: string; badge: string; badgeColor: string; model: string;
  description: string; isActive: boolean; onConfigure: () => void;
}) {
  const T = useT();
  return (
    <div style={{
      background: isActive ? T.providerActiveBg : T.cardBg,
      border: `1px solid ${isActive ? `${GOLD}40` : T.border}`,
      borderRadius: 10, padding: '14px 16px',
      // On mobile stack icon+text vertically; minWidth ensures wrapping in flex container
      display: 'flex',
      alignItems: T.isMobile ? 'flex-start' : 'center',
      flexDirection: T.isMobile ? 'column' : 'row',
      gap: T.isMobile ? 8 : 14,
      flex: '1 1 240px',
      minWidth: T.isMobile ? '100%' : 240,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
        {T.isMobile && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ color: T.text1, fontWeight: 700, fontSize: 13 }}>{name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: badgeColor.split('|')[0], color: badgeColor.split('|')[1] }}>{badge}</span>
            </div>
            <p style={{ color: T.text3, fontSize: 11, margin: 0, lineHeight: 1.4 }}>{model}</p>
          </div>
        )}
      </div>
      {!T.isMobile && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ color: T.text1, fontWeight: 700, fontSize: 13 }}>{name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: badgeColor.split('|')[0], color: badgeColor.split('|')[1] }}>{badge}</span>
          </div>
          <p style={{ color: T.text3, fontSize: 11, margin: 0, lineHeight: 1.4 }}>{model}</p>
          <p style={{ color: T.text4, fontSize: 10, margin: '3px 0 0', lineHeight: 1.3 }}>{description}</p>
        </div>
      )}
      {T.isMobile && (
        <p style={{ color: T.text4, fontSize: 10, margin: '0 0 4px', lineHeight: 1.3 }}>{description}</p>
      )}
      <button
        onClick={onConfigure}
        style={{
          flexShrink: 0, alignSelf: T.isMobile ? 'flex-start' : 'center',
          fontSize: 11, fontWeight: 600, padding: '5px 12px',
          borderRadius: 7, border: `1px solid ${T.border}`,
          background: T.btnSecBg, color: T.text2,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        Configure
      </button>
    </div>
  );
}

// ── Subcomponent: Stat tile ────────────────────────────────────────────────────
function StatTile({ icon, label, value, sub, status }: { icon: string; label: string; value: string; sub?: string; status?: 'ok' | 'warn' | 'info' }) {
  const T = useT();
  const statusColor = status === 'ok' ? '#22c55e' : status === 'warn' ? '#f59e0b' : '#60a5fa';
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', flex: '1 1 130px', minWidth: T.isMobile ? 'calc(50% - 4px)' : 120 }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: T.text1, fontWeight: 700, fontSize: 18 }}>{value}</div>
      <div style={{ color: T.text3, fontSize: 10, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ color: statusColor, fontSize: 10, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

// ── Subcomponent: Quick action card ───────────────────────────────────────────
function QuickAction({ icon, label, sub, onClick, variant = 'default' }: { icon: string; label: string; sub: string; onClick: () => void; variant?: 'default' | 'danger' }) {
  const T = useT();
  const isDanger = variant === 'danger';
  return (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 140px', minWidth: T.isMobile ? 'calc(50% - 5px)' : 130, textAlign: 'left',
        background: isDanger ? 'rgba(239,68,68,0.06)' : T.cardBg,
        border: `1px solid ${isDanger ? 'rgba(239,68,68,0.2)' : T.border}`,
        borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: isDanger ? '#f87171' : T.text1, fontWeight: 700, fontSize: 12 }}>{label}</div>
      <div style={{ color: T.text4, fontSize: 10, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

// ── Subcomponent: BYOK Provider card ──────────────────────────────────────────
interface ByokCardProps {
  id: AiProvider; icon: string; label: string; badge: string; badgeStyle: React.CSSProperties;
  desc: string; keyValue: string; keyPlaceholder: string; keyLink: string; keyLinkLabel: string;
  borderGold: boolean; onKeyChange: (v: string) => void;
  modelValue: string; modelOptions: { id: string; label: string }[];
  onModelChange: (v: string) => void; showCaching?: boolean;
  selectedProvider: AiProvider; onSelect: (id: AiProvider) => void;
  providerTest: { status: string; message?: string }; onTest: () => void;
}
function ByokCard({ id, icon, label, badge, badgeStyle, desc, keyValue, keyPlaceholder, keyLink, keyLinkLabel, borderGold: _borderGold, onKeyChange, modelValue, modelOptions, onModelChange, showCaching, selectedProvider, onSelect, providerTest, onTest }: ByokCardProps) {
  const T = useT();
  const active = selectedProvider === id;
  const hasKey = !!keyValue.trim();
  return (
    <div
      onClick={() => onSelect(id)}
      style={{
        background: active ? T.providerActiveBg : T.cardBg,
        border: `1.5px solid ${active ? GOLD + '50' : T.border}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ color: T.text1, fontWeight: 700, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, ...badgeStyle }}>{badge}</span>
        </div>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `2px solid ${active ? GOLD : T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />}
        </div>
      </div>
      <p style={{ color: T.text3, fontSize: 11, margin: '0 0 6px', lineHeight: 1.4 }}>{desc}</p>
      {!active && (
        <span style={{ fontSize: 10, fontWeight: 600, color: hasKey ? '#22c55e' : T.text4 }}>
          {hasKey ? '● Key configured' : '○ No key yet'}
        </span>
      )}
      {active && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a href={keyLink} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: GOLD, textDecoration: 'underline', fontWeight: 600 }}>
            {keyLinkLabel}
          </a>
          <input
            type="password" value={keyValue}
            onChange={e => onKeyChange(e.target.value)}
            placeholder={keyPlaceholder}
            style={{
              background: T.inputBg, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: '7px 10px', color: T.inputText, fontSize: 12,
              fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          <select
            value={modelValue} onChange={e => onModelChange(e.target.value)}
            style={{
              background: T.inputBg, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: '7px 10px', color: T.inputText, fontSize: 12, outline: 'none',
            }}
          >
            {modelOptions.map(m => <option key={m.id} value={m.id} style={{ background: T.inputOptBg }}>{m.label}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onTest}
              disabled={providerTest.status === 'testing' || !hasKey}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: T.btnSecBg, border: `1px solid ${T.border}`,
                color: T.btnSecText, cursor: hasKey ? 'pointer' : 'not-allowed', opacity: !hasKey ? 0.5 : 1,
              }}
            >
              {providerTest.status === 'testing' ? 'Testing…' : 'Test connection'}
            </button>
            {providerTest.status === 'ok' && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ {providerTest.message}</span>}
            {providerTest.status === 'fail' && <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>✗ {providerTest.message}</span>}
          </div>
          <p style={{ color: T.text4, fontSize: 10, margin: 0 }}>
            Your key is proxied through our Cloudflare Worker — never exposed in DevTools.
          </p>
          {showCaching && hasKey && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', alignSelf: 'flex-start' }}>
              ⚡ Prompt caching active — 90% cheaper on repeats
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const SettingsPage: React.FC<SettingsPageProps> = ({
  user, profiles, activeSlot, d1SyncPending = false,
  darkMode, setDarkMode, currentApiSettings, onSaveApiSettings,
  onSignOut, onDeleteAccount, onClearAllData, onBack, onUpgrade, onOpenOnboarding,
  onSwitchProfile,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const { effectiveTier } = useAccountTier();

  // ── AI provider state ──────────────────────────────────────────────────────
  const [geminiKey, setGeminiKey] = useState(currentApiSettings.apiKey || '');
  const [claudeKey, setClaudeKey] = useState(currentApiSettings.claudeApiKey || '');
  const [groqKey, setGroqKey] = useState(currentApiSettings.groqApiKey || '');
  const [selectedProvider, setSelectedProviderState] = useState<AiProvider>(getSelectedProvider());
  const [claudeModelState, setClaudeModelState] = useState(getClaudeModel());
  const [geminiModelState, setGeminiModelState] = useState(getGeminiModel());
  const [groqModelState, setGroqModelState] = useState(getGroqModel());
  type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string };
  const [providerTest, setProviderTest] = useState<TestState>({ status: 'idle' });
  const [tokenUsage, setTokenUsage] = useState(() => getSessionTokenUsage());
  const [signingOut, setSigningOut] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [deletingStep, setDeletingStep] = useState<'idle' | 'confirm'>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [saved, setSaved] = useState(false);
  const [copiedAccountId, setCopiedAccountId] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // ── Responsive breakpoints ─────────────────────────────────────────────────
  const [screenW, setScreenW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const onResize = () => setScreenW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile  = screenW < 640;
  const isTablet  = screenW >= 640 && screenW < 1280;
  // Right panel only shown at ≥1280 to avoid squeezing content on large phones / small tablets
  const isDesktop = screenW >= 1280;
  // Combine colour tokens + responsive flags into one context value
  const T: ST = { ...makeTheme(darkMode), isMobile, isTablet };

  // ── Sync timestamp ─────────────────────────────────────────────────────────
  const [syncTimeAgo, setSyncTimeAgo] = useState<string>('—');
  useEffect(() => {
    const slot = activeSlot;
    if (!slot) { setSyncTimeAgo('—'); return; }
    const update = () => {
      const ago = getSyncTimeAgo(slot.id);
      setSyncTimeAgo(ago ?? (getLastSyncTimestamp(slot.id) ? 'Synced' : 'Not yet synced'));
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [activeSlot]);

  // ── Token usage events ─────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: Event) => {
      const ce = e as CustomEvent<SessionTokenUsage>;
      if (ce?.detail) setTokenUsage({ ...ce.detail });
    };
    window.addEventListener(TOKEN_USAGE_EVENT, h);
    return () => window.removeEventListener(TOKEN_USAGE_EVENT, h);
  }, []);

  // ── Re-sync keys when settings change externally ───────────────────────────
  useEffect(() => {
    setGeminiKey(currentApiSettings.apiKey || '');
    setClaudeKey(currentApiSettings.claudeApiKey || '');
    setGroqKey(currentApiSettings.groqApiKey || '');
  }, [currentApiSettings]);

  // ── Provider test ──────────────────────────────────────────────────────────
  const runProviderTest = useCallback(async () => {
    const p = selectedProvider === 'claude' ? 'claude' : selectedProvider === 'groq' ? 'groq' : 'gemini';
    const key = p === 'claude' ? claudeKey.trim() : p === 'groq' ? groqKey.trim() : geminiKey.trim();
    if (!key) { setProviderTest({ status: 'fail', message: 'Enter a key first.' }); return; }
    setProviderTest({ status: 'testing' });
    try {
      if (p === 'claude') setRuntimeKeys({ claudeApiKey: claudeKey.trim() });
      else if (p === 'groq') setRuntimeKeys({ groqApiKey: groqKey.trim() });
      else setRuntimeKeys({ apiKey: geminiKey.trim() });
    } catch { /* ignore */ }
    try {
      const r = await testProviderConnection(p);
      setProviderTest(r.ok ? { status: 'ok', message: r.model ? `Connected — ${r.model}` : 'Connected' } : { status: 'fail', message: r.error || 'Failed' });
    } catch (e: any) { setProviderTest({ status: 'fail', message: e?.message || 'Failed' }); }
  }, [selectedProvider, claudeKey, geminiKey, groqKey]);

  // ── Save settings ──────────────────────────────────────────────────────────
  const handleSave = () => {
    setSelectedProvider(selectedProvider);
    setClaudeModel(claudeModelState);
    setGeminiModel(geminiModelState);
    setGroqModel(groqModelState);
    onSaveApiSettings({
      provider: 'gemini', aiProvider: selectedProvider,
      apiKey: geminiKey.trim() || null,
      claudeApiKey: claudeKey.trim() || null,
      groqApiKey: groqKey.trim() || null,
      msClientId: null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await clearQueueForAccount().catch(() => {});
      await onSignOut();
    } finally { setSigningOut(false); }
  };

  const handleClearData = async () => {
    setClearingData(true);
    try { await onClearAllData(); } finally { setClearingData(false); }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const isByok = effectiveTier === 'byok';
  const isPremium = effectiveTier === 'premium';
  const isFree = effectiveTier === 'free';

  const providerLabel = selectedProvider === 'workers-ai' ? 'Workers AI' :
    selectedProvider === 'claude' ? 'Claude (Anthropic)' :
    selectedProvider === 'gemini' ? 'Gemini (Google)' : 'Groq';
  const providerIcon = selectedProvider === 'workers-ai' ? '☁️' :
    selectedProvider === 'claude' ? '🧠' :
    selectedProvider === 'gemini' ? '🔍' : '⚡';

  const tierBadge = isPremium ? { label: 'Premium', bg: `${GOLD}20`, color: GOLD } :
    // BYOK badge: neutral in dark mode (no blue), navy-tinted in light
    isByok ? { label: 'BYOK Pro', bg: T.dark ? 'rgba(255,255,255,0.1)' : `${NAVY}15`, color: T.dark ? T.text2 : NAVY } :
    { label: 'Free', bg: T.btnSecBg, color: T.text3 };

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?';

  // ── IDB storage estimate ───────────────────────────────────────────────────
  const [lsSize, setLsSize] = useState('—');
  useEffect(() => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      total += (k.length + (localStorage.getItem(k) ?? '').length) * 2;
    }
    setLsSize(total < 1024 ? `${total} B` : total < 1024 * 1024 ? `${(total / 1024).toFixed(1)} KB` : `${(total / 1024 / 1024).toFixed(2)} MB`);
  }, []);

  // ── Section renderers ──────────────────────────────────────────────────────

  const renderGeneral = () => (
    <div>
      <SectionHeader title="AI Providers" subtitle="Choose and manage your AI providers and API keys." badge="How it works" />

      {/* Provider overview cards — Workers AI runs silently for free/premium; not shown here.
          BYOK users see which of their own keys is active. */}
      {isByok && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <ProviderOverviewCard
            icon="🧠" name="Claude" badge="BYOK"
            model="Claude 3.5 Sonnet · by Anthropic"
            badgeColor="rgba(139,92,246,0.15)|#a78bfa"
            description="Advanced reasoning · 200K context · Constitutional AI safety"
            isActive={selectedProvider === 'claude'}
            onConfigure={() => setActiveSection('ai-providers')}
          />
          <ProviderOverviewCard
            icon="✨" name="Gemini" badge="BYOK"
            model="Gemini 2.5 Flash · by Google"
            badgeColor="rgba(59,130,246,0.15)|#60a5fa"
            description="High accuracy · 1M context · OCR + AI · Vision import"
            isActive={selectedProvider === 'gemini'}
            onConfigure={() => setActiveSection('ai-providers')}
          />
          <ProviderOverviewCard
            icon="⚡" name="Groq" badge="BYOK"
            model="Llama 3.3 70B · Ultra-fast"
            badgeColor="rgba(251,191,36,0.15)|#fbbf24"
            description="Ultra-fast inference · Multiple top models · Free tier included"
            isActive={selectedProvider === 'groq'}
            onConfigure={() => setActiveSection('ai-providers')}
          />
        </div>
      )}

      {/* API Key Vault */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, margin: 0 }}>API Key Vault</p>
            <p style={{ color: T.text4, fontSize: 11, margin: '2px 0 0' }}>Your keys are encrypted and never stored in plaintext.</p>
          </div>
          <button
            onClick={() => setActiveSection('ai-providers')}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: T.btnSecBg, border: `1px solid ${T.border}`, color: T.btnSecText, cursor: 'pointer' }}
          >
            Update Key
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text4} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ color: T.text4, fontSize: 13, fontFamily: 'monospace', flex: 1, letterSpacing: 4 }}>••••••••••••••••••••••••••••</span>
          <button style={{ fontSize: 10, color: T.text4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>👁</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: '🔐', label: 'AES-256-GCM', sub: 'Encrypted' },
            { icon: '☁️', label: 'Cloudflare Proxy', sub: 'Keys never leave edge' },
            { icon: '🗄️', label: 'IndexedDB Only', sub: 'Local browser storage' },
            { icon: '🚫', label: 'Never Plaintext', sub: 'Zero-knowledge' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px' }}>
              <span style={{ fontSize: 14 }}>{b.icon}</span>
              <div>
                <div style={{ color: T.text1, fontSize: 10, fontWeight: 700 }}>{b.label}</div>
                <div style={{ color: T.text4, fontSize: 9 }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Security & Usage Overview */}
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Security &amp; Usage Overview</p>
        <p style={{ color: T.text4, fontSize: 11, marginBottom: 12 }}>Real-time status of your account and security.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatTile icon="🔐" label="Encrypted Locally" value="AES-256" sub="Secure" status="ok" />
          <StatTile icon="✅" label="Session Valid" value="Active" sub="Expires in ~2h" status="ok" />
          <StatTile
            icon="📊" label="API Calls Today"
            value={String(tokenUsage.callCount)}
            sub={tokenUsage.callCount > 0 ? `~${tokenUsage.inputTokensEst.toLocaleString()} input tokens` : 'No calls yet'}
            status="info"
          />
          <StatTile
            icon="💬" label="Est. Tokens Used"
            value={tokenUsage.callCount > 0 ? `${((tokenUsage.inputTokensEst + tokenUsage.outputTokensEst) / 1000).toFixed(1)}k` : '0'}
            sub={tokenUsage.callCount > 0 ? `Input ${(tokenUsage.inputTokensEst/1000).toFixed(1)}k · Output ${(tokenUsage.outputTokensEst/1000).toFixed(1)}k` : ''}
            status="info"
          />
          <StatTile
            icon="🔄" label="Last Sync"
            value={d1SyncPending ? 'Syncing…' : syncTimeAgo}
            sub={d1SyncPending ? 'Uploading changes' : 'All data up to date'}
            status={d1SyncPending ? 'warn' : 'ok'}
          />
        </div>
        {tokenUsage.callCount > 0 && (
          <button
            onClick={() => { resetSessionTokenUsage(); setTokenUsage(getSessionTokenUsage()); }}
            style={{ marginTop: 10, fontSize: 10, color: T.text4, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Reset session counters
          </button>
        )}
      </Card>

      {/* Onboarding */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>🎓</span>
            <div>
              <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, margin: 0 }}>Onboarding &amp; First Steps</p>
              <p style={{ color: T.text3, fontSize: 11, margin: '2px 0 0' }}>New to ProCV or want a refresher? Re-open the welcome wizard.</p>
            </div>
          </div>
          <button onClick={onOpenOnboarding} style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: GOLD, color: NAVY, cursor: 'pointer', border: 'none' }}>
            Replay Onboarding →
          </button>
        </div>
      </Card>

      {/* Quick Actions */}
      <div style={{ marginTop: 16 }}>
        <p style={{ color: T.text3, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick Actions</p>
        <p style={{ color: T.text4, fontSize: 11, marginBottom: 12 }}>Shortcuts to common actions.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <QuickAction icon="🎓" label="Replay Onboarding" sub="See welcome again" onClick={onOpenOnboarding} />
          <QuickAction icon="📤" label="Export Account" sub="Download your data" onClick={() => setActiveSection('advanced')} />
          <QuickAction icon="🗑️" label="Clear Cache" sub="Free up space" onClick={handleClearData} />
          <QuickAction icon="🚪" label="Sign Out" sub="End your session" onClick={handleSignOut} variant="danger" />
        </div>
      </div>
    </div>
  );

  const renderAiProviders = () => (
    <div>
      <SectionHeader title="AI Providers" subtitle="Choose and configure your AI provider." />

      {isFree && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div>
              <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, margin: 0 }}>AI Engine — Active</p>
              <p style={{ color: T.text3, fontSize: 11, margin: '2px 0 0' }}>Runs automatically in the background. No setup needed.</p>
            </div>
          </div>
          <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>
            CV generation, analysis, and cover letters are all powered automatically at no cost.
            Bring your own API key (BYOK) to use Claude, Gemini, or Groq with your own quota.
          </p>
          <button onClick={onUpgrade} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: GOLD, color: NAVY, cursor: 'pointer', border: 'none' }}>
            Unlock BYOK or Premium →
          </button>
        </Card>
      )}

      {(isByok || isPremium) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <ByokCard
            id="claude" icon="🧠" label="Claude (Anthropic)"
            badge="BYOK" badgeStyle={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
            desc="Advanced reasoning, long-form writing, Constitutional AI safety."
            keyValue={claudeKey} keyPlaceholder="sk-ant-..." keyLink="https://console.anthropic.com/keys" keyLinkLabel="Get Claude API key →"
            borderGold={selectedProvider === 'claude'}
            onKeyChange={setClaudeKey}
            modelValue={claudeModelState} modelOptions={CLAUDE_MODEL_OPTIONS} onModelChange={setClaudeModelState}
            showCaching
            selectedProvider={selectedProvider} onSelect={setSelectedProviderState}
            providerTest={providerTest} onTest={runProviderTest}
          />
          <ByokCard
            id="gemini" icon="🔍" label="Gemini (Google)"
            badge="Vision" badgeStyle={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}
            desc="1M context window, vision import (PDF/image), Google-grade accuracy."
            keyValue={geminiKey} keyPlaceholder="AIza..." keyLink="https://aistudio.google.com/app/apikey" keyLinkLabel="Get Gemini API key →"
            borderGold={selectedProvider === 'gemini'}
            onKeyChange={setGeminiKey}
            modelValue={geminiModelState} modelOptions={GEMINI_MODEL_OPTIONS} onModelChange={setGeminiModelState}
            selectedProvider={selectedProvider} onSelect={setSelectedProviderState}
            providerTest={providerTest} onTest={runProviderTest}
          />
          <ByokCard
            id="groq" icon="⚡" label="Groq"
            badge="Fast" badgeStyle={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            desc="Ultra-fast inference, great for quick iterations and large batches."
            keyValue={groqKey} keyPlaceholder="gsk_..." keyLink="https://console.groq.com/keys" keyLinkLabel="Get Groq API key →"
            borderGold={selectedProvider === 'groq'}
            onKeyChange={setGroqKey}
            modelValue={groqModelState} modelOptions={GROQ_MODEL_OPTIONS} onModelChange={setGroqModelState}
            selectedProvider={selectedProvider} onSelect={setSelectedProviderState}
            providerTest={providerTest} onTest={runProviderTest}
          />
        </div>
      )}

      {(isByok || isPremium) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: saved ? '#22c55e' : GOLD, color: NAVY, cursor: 'pointer', border: 'none', transition: 'background 0.2s' }}
          >
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Token usage */}
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Session Token Usage</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <StatTile icon="📊" label="AI Calls" value={String(tokenUsage.callCount)} status="info" />
          <StatTile icon="💬" label="Input Tokens" value={`~${tokenUsage.inputTokensEst.toLocaleString()}`} status="info" />
          <StatTile icon="📝" label="Output Tokens" value={`~${tokenUsage.outputTokensEst.toLocaleString()}`} status="info" />
        </div>
        <p style={{ color: T.text4, fontSize: 10 }}>~1 token ≈ 4 characters. Resets on page reload.</p>
        {tokenUsage.callCount > 0 && (
          <button onClick={() => { resetSessionTokenUsage(); setTokenUsage(getSessionTokenUsage()); }} style={{ fontSize: 10, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Reset counters
          </button>
        )}
      </Card>
    </div>
  );

  const renderSecurity = () => (
    <div>
      <SectionHeader title="Security" subtitle="How your data is protected." />
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Data Protection</p>
        <p style={{ color: T.text3, fontSize: 11, marginBottom: 12 }}>All sensitive data is encrypted at rest and in transit.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatTile icon="🔐" label="API Keys" value="AES-256" sub="Encrypted locally" status="ok" />
          <StatTile icon="🌐" label="Network" value="TLS 1.3" sub="All requests encrypted" status="ok" />
          <StatTile icon="🔒" label="Session" value="Active" sub="Cookie-based auth" status="ok" />
          <StatTile icon="🛡️" label="Worker Proxy" value="Enabled" sub="Keys never in DevTools" status="ok" />
        </div>
      </Card>
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Active Session</p>
        {/* Email row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ color: T.text3, fontSize: 12 }}>Email</span>
          <span style={{ color: T.text1, fontSize: 12, fontWeight: 600 }}>{user?.email || 'Not signed in'}</span>
        </div>
        {/* Account ID row with copy */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ color: T.text3, fontSize: 12 }}>Account ID</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.text1, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
              {user?.id ? `#${user.id}` : '—'}
            </span>
            {user?.id && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(String(user!.id));
                  setCopiedAccountId(true);
                  setTimeout(() => setCopiedAccountId(false), 2000);
                }}
                style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid',
                  background: copiedAccountId ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: copiedAccountId ? '#22c55e' : T.text4,
                  borderColor: copiedAccountId ? '#86efac' : T.border,
                  transition: 'all 0.2s',
                }}
              >
                {copiedAccountId ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>
        {/* Session status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ color: T.text3, fontSize: 12 }}>Session status</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: user ? '#22c55e' : T.text4, fontSize: 12, fontWeight: 600 }}>
            {user && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
            {user ? 'Active' : 'Signed out'}
          </span>
        </div>
      </Card>
    </div>
  );

  const renderProfileSharing = () => (
    <div>
      <SectionHeader title="Profile &amp; Sharing" subtitle="Manage your public profile and share links." />
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28 }}>🔗</span>
          <div>
            <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>Share Your CV / Profile</p>
            <p style={{ color: T.text3, fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
              Create temporary share links for one-off applications, or set up a permanent public profile for your professional brand.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { icon: '🔒', label: 'Secure', sub: 'Your data is protected' },
                { icon: '📍', label: 'Trackable', sub: 'See who views your CV' },
                { icon: '⚡', label: 'Smart', sub: 'Auto expires & cleans up' },
                { icon: '🎛️', label: "You're in control", sub: 'Publish, edit, or remove' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span>
                  <div>
                    <div style={{ color: T.text1, fontSize: 10, fontWeight: 700 }}>{f.label}</div>
                    <div style={{ color: T.text4, fontSize: 9 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>🔗</span>
            <div>
              <span style={{ color: T.text1, fontWeight: 700, fontSize: 13 }}>Temporary Share Link</span>
              <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${GOLD}20`, color: GOLD }}>Best for one-time sharing</span>
            </div>
          </div>
          <p style={{ color: T.text3, fontSize: 11, lineHeight: 1.5, margin: '0 0 12px' }}>
            Creates a short, expiring link to share your CV instantly. Expires in 30 days. Rate limited to 10 links/hour.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: T.dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', borderRadius: 8, padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: T.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {copiedShareLink ? `${window.location.origin}/#s=…` : 'https://procv.app/#s=…'}
            </div>
            <button
              onClick={() => {
                const url = `${window.location.origin}/#s=${activeSlot?.id?.slice(0, 8) ?? 'demo'}`;
                navigator.clipboard.writeText(url).catch(() => {});
                setCopiedShareLink(true);
                setTimeout(() => setCopiedShareLink(false), 3000);
              }}
              style={{ padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', transition: 'background 0.2s',
                background: copiedShareLink ? '#22c55e' : GOLD,
                color: copiedShareLink ? '#fff' : NAVY,
              }}
            >
              {copiedShareLink ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>🌐</span>
            <div>
              <span style={{ color: T.text1, fontWeight: 700, fontSize: 13 }}>Public Profile</span>
              <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Best for your brand</span>
            </div>
          </div>
          <p style={{ color: T.text3, fontSize: 11, lineHeight: 1.5, margin: '0 0 12px' }}>
            Create a permanent, branded profile with your own custom URL. Always available, no expiry, SEO-friendly.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.text4, fontSize: 11 }}>procv.app/p/</span>
            <input
              placeholder="your-slug"
              style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.inputText, fontSize: 11, outline: 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStorageBackup = () => (
    <div>
      <SectionHeader title="Storage &amp; Backup" subtitle="Where your data lives and how it's protected." />

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          {
            icon: '🗄️', title: 'CF D1 Database', badge: d1SyncPending ? 'Syncing…' : 'Synced', badgeOk: !d1SyncPending,
            desc: 'Primary source of truth. Your profiles, CVs, and preferences sync to Cloudflare D1 automatically.',
            detail: `Last sync: ${syncTimeAgo}`,
          },
          {
            icon: '🔒', title: 'IndexedDB (Local)', badge: 'Active', badgeOk: true,
            desc: 'Encrypted API keys and session data stored in your browser\'s private IndexedDB — never in plaintext.',
            detail: 'AES-256-GCM encrypted',
          },
          {
            icon: '💾', title: 'localStorage', badge: 'Active', badgeOk: true,
            desc: 'UI preferences, cache, and sync bookkeeping stored locally. Auto-save keeps everything in sync.',
            detail: lsSize + ' used',
          },
        ].map(item => (
          <div key={item.title} style={{ flex: '1 1 180px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: item.badgeOk ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                color: item.badgeOk ? '#22c55e' : '#fbbf24',
              }}>{item.badge}</span>
            </div>
            <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, margin: '0 0 5px' }}>{item.title}</p>
            <p style={{ color: T.text3, fontSize: 11, margin: '0 0 8px', lineHeight: 1.4 }}>{item.desc}</p>
            <p style={{ color: GOLD, fontSize: 10, fontWeight: 600, margin: 0 }}>{item.detail}</p>
          </div>
        ))}
      </div>

      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Sync Settings</p>
        {[
          { label: 'Auto-save', desc: 'Every change is saved immediately to localStorage', status: 'On', ok: true },
          { label: 'D1 Cloud Sync', desc: 'Profiles sync to Cloudflare D1 on save (cross-device)', status: d1SyncPending ? 'Syncing…' : 'Active', ok: !d1SyncPending },
          { label: 'Device Sync', desc: 'Data is available across browsers on same account', status: 'Active', ok: true },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <span style={{ color: T.text1, fontSize: 13, fontWeight: 600 }}>{row.label}</span>
              <p style={{ color: T.text4, fontSize: 10, margin: '2px 0 0' }}>{row.desc}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: row.ok ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)', color: row.ok ? '#22c55e' : '#fbbf24', whiteSpace: 'nowrap' }}>
              {row.status}
            </span>
          </div>
        ))}
      </Card>

      {/* What's backed up vs browser-only */}
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>What's Backed Up</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 12, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>☁️</span> Synced to Cloud
            </p>
            {['Career profiles & work history', 'Saved CVs & cover letters', 'Job tracker applications', 'Template preferences', 'Account settings'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: '#22c55e', fontSize: 10 }}>✓</span>
                <span style={{ color: T.text2, fontSize: 11 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: '1 1 180px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔒</span> Browser Only
            </p>
            {['API keys (encrypted in IndexedDB)', 'AI provider selection', 'UI theme & appearance', 'Local cache & search history', 'Session tokens'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: '#fbbf24', fontSize: 10 }}>⚠</span>
                <span style={{ color: T.text2, fontSize: 11 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: T.text4, fontSize: 10, marginTop: 10 }}>
          Browser-only data is not recoverable if you clear your browser storage. Export a backup below to be safe.
        </p>
      </Card>

      {/* Export backup */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📦</span>
            <div>
              <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, margin: 0 }}>Export Backup</p>
              <p style={{ color: T.text3, fontSize: 11, margin: '2px 0 0' }}>Download a full JSON snapshot of your profiles, CVs, and settings.</p>
            </div>
          </div>
          <button
            onClick={() => {
              try {
                const data = {
                  exportedAt: new Date().toISOString(),
                  accountId: user?.id,
                  email: user?.email,
                  profiles: JSON.parse(localStorage.getItem('cv_builder:profiles') || '[]'),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `procv-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { /* non-fatal */ }
            }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: GOLD, border: 'none', color: NAVY, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            📤 Export JSON
          </button>
        </div>
      </Card>
    </div>
  );

  const renderBilling = () => (
    <div>
      <SectionHeader title="Billing &amp; Plans" subtitle="Compare plans and manage your subscription." />
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Choose Your Power</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <td style={{ padding: '6px 12px', color: T.text3, fontSize: 11 }}></td>
                {[
                  { label: 'Free', highlight: false },
                  { label: 'BYOK', highlight: false },
                  { label: 'Premium', highlight: true },
                ].map(col => (
                  <th key={col.label} style={{
                    padding: '8px 16px', textAlign: 'center', fontWeight: 800, fontSize: 13,
                    color: col.highlight ? NAVY : T.text1,
                    background: col.highlight ? GOLD : 'transparent',
                    borderRadius: col.highlight ? '8px 8px 0 0' : 0,
                    position: 'relative',
                  }}>
                    {col.highlight && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: GOLD, color: NAVY, whiteSpace: 'nowrap' }}>Best Value</div>}
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feature: 'CV Generations', free: '3 lifetime', byok: 'Unlimited', premium: 'Unlimited' },
                { feature: 'PDF Downloads', free: '2 (watermarked)', byok: 'Unlimited (WM)', premium: 'Unlimited (clean)' },
                { feature: 'Profile Slots', free: '1', byok: '3', premium: '5' },
                { feature: 'Job Tracker', free: '15 applications', byok: 'Unlimited', premium: 'Unlimited' },
                { feature: 'Boosted Writing', free: '✗', byok: '✓', premium: '✓' },
                { feature: 'Interview Prep', free: '✗', byok: '✓', premium: '✓' },
                { feature: 'LinkedIn Optimizer', free: '✗', byok: '✗', premium: '✓' },
                { feature: 'Salary Negotiation', free: '✗', byok: '✗', premium: '✓' },
                { feature: 'Career Pivot', free: '✗', byok: '✗', premium: '✓' },
                { feature: 'Clean PDF Export', free: '✗', byok: '✗', premium: '✓' },
              ].map((row, i) => (
                <tr key={row.feature} style={{ background: i % 2 === 0 ? T.tableAltRow : 'transparent' }}>
                  <td style={{ padding: '7px 12px', color: T.text2, fontSize: 11 }}>{row.feature}</td>
                  {[row.free, row.byok, row.premium].map((val, ci) => (
                    <td key={ci} style={{
                      padding: '7px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600,
                      color: val === '✗' ? T.text4 : ci === 2 ? (T.dark ? T.text1 : NAVY) : val.includes('✓') ? '#22c55e' : T.text1,
                      background: ci === 2 ? `${GOLD}15` : 'transparent',
                    }}>
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isPremium && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <button onClick={onUpgrade} style={{ padding: '9px 28px', borderRadius: 8, fontSize: 13, fontWeight: 800, background: GOLD, color: NAVY, cursor: 'pointer', border: 'none' }}>
              Upgrade to Premium →
            </button>
          </div>
        )}
      </Card>
    </div>
  );

  const renderNotifications = () => (
    <div>
      <SectionHeader title="Notifications" subtitle="Control how and when ProCV notifies you." />
      <Card>
        <p style={{ color: T.text3, fontSize: 12, lineHeight: 1.6 }}>
          Notification settings are coming soon. ProCV currently shows in-app tips and sync status updates only.
        </p>
      </Card>
    </div>
  );

  const renderAppearance = () => (
    <div>
      <SectionHeader title="Appearance" subtitle="Customise how ProCV looks." />
      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Theme</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Light', value: false, icon: '☀️' },
            { label: 'Dark', value: true, icon: '🌙' },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setDarkMode(opt.value)}
              style={{
                flex: 1, padding: '14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: darkMode === opt.value ? `${GOLD}20` : T.cardBg,
                border: `2px solid ${darkMode === opt.value ? GOLD : T.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 24 }}>{opt.icon}</span>
              <span style={{ color: darkMode === opt.value ? GOLD : T.text3, fontSize: 12, fontWeight: 700 }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );

  const renderAdvanced = () => (
    <div>
      <SectionHeader title="Advanced" subtitle="Data management and danger zone." />

      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Export Account Data</p>
        <p style={{ color: T.text3, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          Download a full JSON export of your profile data, saved CVs, and application history.
        </p>
        <button
          onClick={() => {
            try {
              const data = { profiles: JSON.parse(localStorage.getItem('cv_builder:profiles') || '[]'), exportedAt: new Date().toISOString() };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'procv-export.json'; a.click();
              URL.revokeObjectURL(url);
            } catch { /* ignore */ }
          }}
          style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: T.btnSecBg, border: `1px solid ${T.border}`, color: T.btnSecText, cursor: 'pointer' }}
        >
          📤 Export JSON
        </button>
      </Card>

      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Clear Local Cache</p>
        <p style={{ color: T.text3, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          Clears evictable cache (Tavily results, LLM cache, UI state). Your profile and CV data is preserved.
        </p>
        <button
          onClick={handleClearData}
          disabled={clearingData}
          style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: T.btnSecBg, border: `1px solid ${T.border}`, color: T.btnSecText, cursor: 'pointer', opacity: clearingData ? 0.6 : 1 }}
        >
          {clearingData ? 'Clearing…' : '🗑️ Clear Cache'}
        </button>
      </Card>

      <Card>
        <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Sign Out</p>
        <p style={{ color: T.text3, fontSize: 12, margin: '0 0 12px' }}>End your current session. Your data remains saved.</p>
        <button onClick={handleSignOut} disabled={signingOut} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer', opacity: signingOut ? 0.6 : 1 }}>
          {signingOut ? 'Signing out…' : '🚪 Sign Out'}
        </button>
      </Card>

      <Card>
        <p style={{ color: '#f87171', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Delete Account</p>
        <p style={{ color: T.text3, fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
          Permanently deletes your ProCV account and all associated data from our servers. This cannot be undone.
        </p>
        {deletingStep === 'idle' ? (
          <button onClick={() => setDeletingStep('confirm')} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>
            Delete Account
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ color: '#fbbf24', fontSize: 12, margin: 0 }}>Type <strong>delete</strong> to confirm.</p>
            <input
              value={confirmText} onChange={e => setConfirmText(e.target.value)}
              placeholder="delete"
              style={{ background: T.inputBg, border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '7px 12px', color: T.inputText, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => { if (confirmText.toLowerCase() === 'delete') await onDeleteAccount(); }}
                disabled={confirmText.toLowerCase() !== 'delete'}
                style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: confirmText.toLowerCase() === 'delete' ? '#dc2626' : 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fff', cursor: confirmText.toLowerCase() === 'delete' ? 'pointer' : 'not-allowed', opacity: confirmText.toLowerCase() !== 'delete' ? 0.5 : 1 }}
              >
                Confirm Delete
              </button>
              <button onClick={() => { setDeletingStep('idle'); setConfirmText(''); }} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: T.btnSecBg, border: `1px solid ${T.border}`, color: T.text2, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );

  const sectionContent: Record<SettingsSection, () => React.ReactNode> = {
    'general': renderGeneral,
    'ai-providers': renderAiProviders,
    'security': renderSecurity,
    'profile-sharing': renderProfileSharing,
    'storage-backup': renderStorageBackup,
    'billing': renderBilling,
    'notifications': renderNotifications,
    'appearance': renderAppearance,
    'advanced': renderAdvanced,
  };

  // ── Right panel content (reused in desktop + mobile) ──────────────────────
  const renderRightPanel = () => (
    <>
      {/* Your Account */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.navLabel, margin: '0 0 10px' }}>Your Account</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user?.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${GOLD}50`, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.dark ? '#2a2a2a' : NAVY, border: `2px solid ${GOLD}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: GOLD, flexShrink: 0 }}>
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{ color: T.text1, fontWeight: 700, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
            <p style={{ color: T.text3, fontSize: 10, margin: '2px 0' }}>{user?.email || ''}</p>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tierBadge.bg, color: tierBadge.color }}>
              {tierBadge.label} {isPremium ? '👑' : ''}
            </span>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.navLabel, margin: '0 0 8px' }}>Active AI Provider</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px' }}>
          <span style={{ fontSize: 18 }}>{providerIcon}</span>
          <div>
            <p style={{ color: T.text1, fontWeight: 600, fontSize: 12, margin: 0 }}>{providerLabel}</p>
            <p style={{ color: T.text4, fontSize: 10, margin: '1px 0 0' }}>
              {selectedProvider === 'workers-ai' ? 'Llama 70B + DeepSeek R1' :
               selectedProvider === 'claude' ? claudeModelState :
               selectedProvider === 'gemini' ? geminiModelState : groqModelState}
            </p>
          </div>
        </div>
      </div>

      {/* Profile Slots */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.navLabel, margin: 0 }}>Your Profile Slots</p>
          <span style={{ fontSize: 10, color: T.text4 }}>{profiles.length} of {isPremium ? 5 : isByok ? 3 : 1} used</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {profiles.slice(0, 5).map(slot => {
            const isPrimary = slot.id === profiles[0]?.id;
            const isActive = slot.id === activeSlot?.id;
            return (
              <button
                key={slot.id}
                onClick={() => onSwitchProfile?.(slot)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7,
                  background: isActive ? `${GOLD}15` : T.cardBg,
                  border: `1px solid ${isActive ? `${GOLD}40` : T.border}`,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? GOLD : T.border, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text1, fontSize: 11, fontWeight: isActive ? 700 : 500 }}>
                  {slot.label || slot.name || 'Profile'}
                </span>
                {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: `${GOLD}20`, color: GOLD }}>Primary</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Storage mini */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.navLabel, margin: '0 0 8px' }}>Storage &amp; Backup</p>
        <p style={{ color: T.text4, fontSize: 10, margin: '0 0 8px' }}>Everything is synced and safe.</p>
        {[
          { icon: '🗄️', label: 'D1 Database', sub: 'Primary source of truth', status: d1SyncPending ? 'Syncing…' : 'Synced', ok: !d1SyncPending },
          { icon: '💾', label: 'Auto-save', sub: 'Every change is saved', status: 'On', ok: true },
          { icon: '🔒', label: 'Device Sync', sub: 'Across all your devices', status: 'Active', ok: true },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'}` }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: T.text2, fontSize: 11, fontWeight: 600, margin: 0 }}>{row.label}</p>
              <p style={{ color: T.text4, fontSize: 9, margin: '1px 0 0' }}>{row.sub}</p>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: row.ok ? '#22c55e' : '#fbbf24', whiteSpace: 'nowrap' }}>{row.status}</span>
          </div>
        ))}
      </div>

      {/* Mini plan comparison */}
      {!isPremium && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.navLabel, margin: '0 0 10px' }}>Choose Your Power</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {[
              { label: 'Free', active: isFree },
              { label: 'BYOK', active: isByok },
              { label: 'Premium', active: isPremium, highlight: true },
            ].map(col => (
              <div key={col.label} style={{ background: col.highlight ? `${GOLD}15` : T.cardBg, padding: '8px 4px', textAlign: 'center', borderRight: `1px solid ${T.border}` }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: col.highlight ? GOLD : col.active ? T.text1 : T.text4, margin: '0 0 6px' }}>{col.label}</p>
                {[
                  col.label === 'Free' ? '3 CVs' : 'Unlimited',
                  col.label === 'Free' ? '2 PDFs' : col.label === 'BYOK' ? 'PDF (WM)' : 'Clean PDF',
                  col.label === 'Free' ? '1 slot' : col.label === 'BYOK' ? '3 slots' : '5 slots',
                ].map((v, i) => (
                  <p key={i} style={{ fontSize: 9, color: col.highlight ? `${GOLD}cc` : T.text4, margin: '2px 0' }}>{v}</p>
                ))}
              </div>
            ))}
          </div>
          <button onClick={onUpgrade} style={{ width: '100%', marginTop: 10, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: GOLD, color: NAVY, cursor: 'pointer', border: 'none' }}>
            View full comparison →
          </button>
        </div>
      )}
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SettingsThemeCtx.Provider value={T}>
      <div style={{
        minHeight: '100vh',
        background: T.pageBg,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        color: T.text1,
      }}>

        {/* ── Page header ── */}
        <div style={{
          padding: isMobile ? '14px 16px 12px' : '20px 28px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: T.dark ? 'transparent' : 'rgba(255,255,255,0.6)',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 900, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color: T.text1 }}>Settings</h1>
            </div>
            {!isMobile && (
              <p style={{ margin: '2px 0 0 24px', fontSize: 12, color: T.text4 }}>
                Manage your preferences, AI providers, security and account settings.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#22c55e', fontWeight: 600, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
            {!isMobile && 'All systems operational'}
          </div>
        </div>

        {/* ── Mobile: compact account strip ── */}
        {isMobile && (
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            {user?.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 30, height: 30, borderRadius: '50%', border: `2px solid ${GOLD}50`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.dark ? '#2a2a2a' : NAVY, border: `2px solid ${GOLD}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: GOLD, flexShrink: 0 }}>
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: T.text1, fontWeight: 700, fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
              <p style={{ color: T.text3, fontSize: 10, margin: 0 }}>{user?.email || ''}</p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tierBadge.bg, color: tierBadge.color, flexShrink: 0 }}>
              {tierBadge.label}
            </span>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{providerIcon}</span>
          </div>
        )}

        {/* ── Mobile: horizontal scrollable tab bar ── */}
        {isMobile && (
          <div style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${T.border}`, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', gap: 0 }}>
            {NAV_SECTIONS.map(section => {
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                    borderBottom: `2px solid ${active ? T.mobileTabActive : 'transparent'}`, transition: 'all 0.15s',
                    color: active ? T.mobileTabActive : T.mobileTabInactive,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{section.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                    {section.label.replace('AI Providers', 'AI').replace('Profile & Sharing', 'Profile').replace('Storage & Backup', 'Storage').replace('Notifications', 'Alerts').replace('Appearance', 'Theme')}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Main body ── */}
        <div style={{ display: 'flex', gap: 0, minHeight: isMobile ? undefined : 'calc(100vh - 80px)' }}>

          {/* ── Left settings nav (tablet + desktop) ── */}
          {!isMobile && (
            <div style={{
              width: isTablet ? 180 : 200,
              flexShrink: 0,
              padding: '16px 0',
              borderRight: `1px solid ${T.border}`,
              minHeight: 'calc(100vh - 80px)',
              background: T.dark ? 'transparent' : 'rgba(255,255,255,0.5)',
            }}>
              {!isTablet && (
                <p style={{ padding: '0 16px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.navLabel, margin: 0 }}>SETTINGS</p>
              )}
              {NAV_SECTIONS.map(section => {
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9,
                      padding: isTablet ? '9px 14px' : '8px 16px',
                      background: active ? T.navActiveBg : 'transparent',
                      border: 'none', borderLeft: `2px solid ${active ? T.navActiveText : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      color: active ? T.navActiveText : T.navInactiveText,
                      fontSize: 12, fontWeight: active ? 700 : 500,
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>{section.icon}</span>
                    {section.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Main content ── */}
          <div style={{
            flex: 1,
            padding: isMobile ? '16px 14px' : isTablet ? '20px 20px' : '20px 24px',
            overflowY: 'auto', minWidth: 0,
          }}>
            {sectionContent[activeSection]?.()}

            {/* Mobile: render account panel below content */}
            {isMobile && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
                {renderRightPanel()}
              </div>
            )}
          </div>

          {/* ── Right account panel (desktop ≥1280 only) ── */}
          {isDesktop && (
            <div style={{
              width: 270, flexShrink: 0,
              borderLeft: `1px solid ${T.border}`,
              padding: '20px 16px', overflowY: 'auto',
              background: T.dark ? 'transparent' : 'rgba(255,255,255,0.5)',
            }}>
              {renderRightPanel()}
            </div>
          )}
        </div>
      </div>
    </SettingsThemeCtx.Provider>
  );
};

export default SettingsPage;
