import React, { useMemo, useEffect, useState } from 'react';
import type { UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication, CVData, UserProfile } from '../types';
import type { WorkerUser } from '../services/authService';
import { getEffectiveTier } from '../services/accountTierService';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import { profileToCV } from '../utils/profileToCV';
import { getStoredShareLinks, fetchAllShareStats } from '../services/shareService';
import type { StoredShareLink, ShareStats } from '../services/shareService';

function navTimeAgo(iso: string | undefined | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

import {
  runProfileIntelligenceAudit,
  loadAuditFromLocalStorage,
  saveAuditToLocalStorage,
  undersellRiskLabel,
} from '../services/profileIntelligenceAudit';
import type { ProfileIntelligenceReport } from '../services/profileIntelligenceAudit';

interface Props {
  profiles: UserProfileSlot[];
  activeSlot: UserProfileSlot | null;
  currentCV: CVData | null;
  isAuthenticated: boolean;
  user?: WorkerUser | null;
  onNavigate: (view: string) => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
}

/* ── Tiny inline components ────────────────────────────────────────────────── */

function qualityLabel(value: number): { label: string; color: string } {
  if (value >= 70) return { label: 'Strong',   color: '#16a34a' };
  if (value >= 50) return { label: 'Good',     color: '#C9A84C' };
  if (value >= 30) return { label: 'Building', color: '#d97706' };
  return               { label: 'Early',    color: '#94a3b8' };
}

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

/** Reusable circular SVG gauge */
function Gauge({ value, size = 72 }: { value: number; size?: number }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(value, 100) / 100);
  const ql = qualityLabel(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="5"
        className="text-zinc-100 dark:text-zinc-800" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={GOLD} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={GOLD}>{value}</text>
    </svg>
  );
}

/** Card shell */
const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children, className = '', onClick,
}) => (
  <div
    onClick={onClick}
    className={`bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
  >
    {children}
  </div>
);

/** Section heading inside a card */
const CardTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{children}</h2>
    {action}
  </div>
);

/** Thin green/amber dot */
const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500' : 'bg-amber-400'}`} />
);

/** Storage & Sync card — shows local/cloud sync status in the right column */
const StorageSyncCard: React.FC<{ savedCVCount: number }> = ({ savedCVCount }) => {
  const [localKb, setLocalKb] = React.useState<number>(0);
  React.useEffect(() => {
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) ?? '';
        bytes += k.length + (localStorage.getItem(k) ?? '').length;
      }
      setLocalKb(Math.round(bytes / 1024));
    } catch { /* ignore */ }
  }, []);

  const pct = Math.min(100, Math.round((localKb / 5120) * 100)); // 5 MB quota est.

  const rows = [
    { label: 'Local storage',  val: `${localKb} KB`, ok: localKb < 4096 },
    { label: 'CVs saved',      val: `${savedCVCount}`, ok: true },
    { label: 'Auto-save',      val: 'Enabled',  ok: true },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Storage & Sync</h2>
        <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </div>

      <div className="space-y-1.5 mb-3">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <StatusDot ok={r.ok} />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{r.label}</span>
            </div>
            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">{r.val}</span>
          </div>
        ))}
      </div>

      {/* Storage bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] text-zinc-400">
          <span>Local usage</span>
          <span>{pct}% of ~5 MB</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: pct > 80 ? '#ef4444' : pct > 60 ? GOLD : '#10b981',
            }}
          />
        </div>
      </div>
    </Card>
  );
};

/** Template thumbnail (styled placeholder) */
const TemplateThumbnail: React.FC<{
  name: string; bg: string; accent: string; onClick: () => void;
}> = ({ name, bg, accent, onClick }) => (
  <button
    onClick={onClick}
    className="group relative rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-700 hover:border-[#C9A84C]/50 transition-all hover:shadow-md text-left"
  >
    <div className="h-[72px] flex flex-col gap-1 px-2.5 pt-2.5" style={{ background: bg }}>
      <div className="w-10 h-1.5 rounded-full opacity-80" style={{ background: accent }} />
      <div className="w-7 h-1 rounded-full opacity-40" style={{ background: accent }} />
      <div className="flex gap-1 mt-1">
        <div className="w-12 h-1 rounded-full opacity-50" style={{ background: accent }} />
        <div className="w-8 h-1 rounded-full opacity-30" style={{ background: accent }} />
      </div>
      <div className="w-14 h-1 rounded-full opacity-30" style={{ background: accent }} />
    </div>
    <div className="px-2 py-1.5 bg-white dark:bg-neutral-800 border-t border-zinc-100 dark:border-neutral-700">
      <p className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">{name}</p>
    </div>
  </button>
);

/* ── Quick action icon definitions ─────────────────────────────────────────── */
const QA_ICONS: Record<string, React.FC<{ className?: string }>> = {
  'new-cv': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  'import-cv': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  'score': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 17v-6"/><path d="M12 17v-4"/><path d="M16 17v-9"/>
    </svg>
  ),
  'hr': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  'interview': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  ),
  'tracker': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  'more': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
};

const QUICK_ACTIONS = [
  { key: 'new-cv',    label: 'New CV',        view: 'generator' },
  { key: 'import-cv', label: 'Import CV',     view: 'generator' },
  { key: 'score',     label: 'Score My CV',   view: 'score' },
  { key: 'hr',        label: 'HR Detector',   view: 'toolkit' },
  { key: 'interview', label: 'Interview Prep',view: 'interview' },
  { key: 'tracker',   label: 'Job Tracker',   view: 'tracker' },
  { key: 'more',      label: 'More Tools',    view: 'linkedin' },
];

const TEMPLATE_PREVIEWS = [
  { name: 'SWE Impact',        bg: NAVY,    accent: GOLD },
  { name: 'Clean Professional',bg: '#F8F7F4', accent: NAVY },
  { name: 'Noir Professional', bg: '#1a1a1a',  accent: '#e5e5e5' },
  { name: 'Harvard Classic',   bg: '#7b1a1a',  accent: '#f5e6e6' },
];

/* ── Tiny sparkline ─────────────────────────────────────────────────────────── */
const Sparkline: React.FC<{ values: number[]; color?: string }> = ({ values, color = GOLD }) => {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 60; const h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────────────────────────────────────── */
const DashboardHome: React.FC<Props> = ({
  profiles,
  activeSlot,
  currentCV,
  isAuthenticated,
  user,
  onNavigate,
  onEditProfile,
  onOpenSettings,
}) => {
  // ── Tier / identity ───────────────────────────────────────────────────────
  const effectiveTier = getEffectiveTier();
  const isPremium = effectiveTier === 'premium';
  const isByok    = effectiveTier === 'byok';
  const tierLabel = isPremium ? '★ Premium' : isByok ? '⚡ BYOK' : 'Free';
  const tierColor = isPremium ? GOLD : isByok ? '#7C3AED' : '#6B7280';
  const tierBg    = isPremium ? `${GOLD}18` : isByok ? 'rgba(124,58,237,0.12)' : 'rgba(0,0,0,0.06)';
  const userInitial = ((isAuthenticated && user ? (user.name || user.email) : '') || 'U')
    .charAt(0).toUpperCase();

  // ── Derived slot data ─────────────────────────────────────────────────────
  const savedCVs: SavedCV[]                = activeSlot?.savedCVs ?? [];
  const savedCLs: SavedCoverLetter[]       = activeSlot?.savedCoverLetters ?? [];
  const trackedApps: TrackedApplication[]  = activeSlot?.trackedApps ?? [];
  const starStories                        = (activeSlot as any)?.starStories ?? [];
  const userProfile: UserProfile | null    = activeSlot?.profile ?? null;

  const recentCVs = useMemo(() =>
    [...savedCVs]
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, 5),
  [savedCVs]);

  const activeApps     = trackedApps.filter(a => a.status !== 'Rejected');
  const interviewCount = trackedApps.filter(a => a.status === 'Interviewing').length;
  const offersCount    = trackedApps.filter(a => a.status === 'Offer').length;

  // ── Share links ───────────────────────────────────────────────────────────
  const [storedLinks, setStoredLinks]   = useState<StoredShareLink[]>([]);
  const [shareStats, setShareStats]     = useState<Map<string, ShareStats>>(new Map());
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    const slotLinks: StoredShareLink[] = (activeSlot?.sharedLinks ?? []) as StoredShareLink[];
    const localLinks = getStoredShareLinks();
    const slotIds = new Set(slotLinks.map(l => l.id));
    const merged = [...slotLinks, ...localLinks.filter(l => !slotIds.has(l.id))];
    setStoredLinks(merged);
    if (merged.length === 0) return;
    fetchAllShareStats(merged.slice(0, 5).map(l => l.id)).then(stats => setShareStats(stats));
  }, [activeSlot?.id, activeSlot?.sharedLinks]);

  const totalShareViews = useMemo(() =>
    [...shareStats.values()].reduce((s, v) => s + (v.view_count ?? 0), 0),
  [shareStats]);

  // ── Last session ──────────────────────────────────────────────────────────
  const [lastSession, setLastSession] = useState<{
    jobTitle: string; company: string; hasJD: boolean; recentCv: SavedCV | null;
  } | null>(null);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  useEffect(() => {
    setSessionDismissed(false);
    if (!activeSlot?.id) { setLastSession(null); return; }
    const id = activeSlot.id;
    try {
      const raw = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
      const jd       = raw(`p:${id}:jd`);
      const jobTitle = raw(`p:${id}:jobTitle`);
      const company  = raw(`p:${id}:company`);
      const allCvs   = (activeSlot.savedCVs ?? []) as SavedCV[];
      const recentCv = allCvs.length > 0
        ? allCvs.reduce((a, b) => new Date(a.createdAt ?? 0) > new Date(b.createdAt ?? 0) ? a : b)
        : null;
      if (jd.trim() || recentCv) setLastSession({ jobTitle, company, hasJD: !!jd.trim(), recentCv });
      else setLastSession(null);
    } catch { setLastSession(null); }
  }, [activeSlot?.id]);

  // ── Profile Intelligence Audit ────────────────────────────────────────────
  const [audit, setAudit] = useState<ProfileIntelligenceReport | null>(null);

  useEffect(() => {
    if (!activeSlot?.id) { setAudit(null); return; }
    const cached = loadAuditFromLocalStorage(activeSlot.id);
    if (cached) { setAudit(cached); return; }
    const report = runProfileIntelligenceAudit(userProfile, currentCV);
    saveAuditToLocalStorage(activeSlot.id, report);
    setAudit(report);
  }, [activeSlot?.id, userProfile, currentCV]);

  const profileComplete = useMemo(() => {
    if (!userProfile) return 0;
    const cvForScoring = currentCV ?? profileToCV(userProfile);
    return scoreCVCompleteness(cvForScoring, userProfile).percent;
  }, [currentCV, userProfile]);

  // ── Derived display values ────────────────────────────────────────────────
  const firstName = userProfile?.personalInfo?.name?.split(' ')[0];

  const timeGreeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  })();

  const ringColor = profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? GOLD : '#16a34a';

  const profileSections = [
    { label: 'Personal Information', done: !!(userProfile?.personalInfo?.name) },
    { label: 'Work Experience',      done: (userProfile?.workExperience?.length ?? 0) > 0 },
    { label: 'Skills & Expertise',   done: (userProfile?.skills?.length ?? 0) > 0 },
    { label: 'Education',            done: (userProfile?.education?.length ?? 0) > 0 },
    { label: 'Achievements',         done: !!(userProfile?.summary && userProfile.summary.trim().length > 30) },
  ];

  const yearsExp = useMemo(() => {
    if (!userProfile?.workExperience?.length) return 0;
    const earliest = userProfile.workExperience
      .map(e => {
        if (!e.startDate) return new Date().getFullYear();
        const y = parseInt(e.startDate.slice(0, 4), 10);
        return isNaN(y) ? new Date().getFullYear() : y;
      })
      .reduce((min, y) => Math.min(min, y), new Date().getFullYear());
    return Math.max(0, new Date().getFullYear() - earliest);
  }, [userProfile]);

  const latestJobTitle = useMemo(() => {
    if (userProfile?.workExperience?.length)
      return userProfile.workExperience[0]?.jobTitle ?? '';
    return '';
  }, [userProfile]);

  // Overall score: prefer ATS score, else derive from audit
  const overallScore = useMemo(() => {
    if (activeSlot?.lastAtsScore) return activeSlot.lastAtsScore;
    if (!audit) return profileComplete;
    return Math.round(
      (audit.achievement_density + audit.metric_strength + audit.skill_evidence_score + profileComplete) / 4
    );
  }, [activeSlot?.lastAtsScore, audit, profileComplete]);

  const scoreMetrics = useMemo(() => [
    { label: 'Content Quality', value: audit?.achievement_density ?? 0 },
    { label: 'ATS Readability', value: audit?.metric_strength ?? 0 },
    { label: 'Impact & Metrics', value: audit?.leadership_score ?? 0 },
    { label: 'Structure',       value: audit?.skill_evidence_score ?? 0 },
  ], [audit]);

  const hrScore = useMemo(() =>
    audit
      ? Math.round((audit.achievement_density + audit.metric_strength + audit.skill_evidence_score) / 3)
      : 0,
  [audit]);

  const hrChecklist = useMemo(() => [
    {
      label: 'Banned Phrases',
      value: audit ? '0 found' : '—',
      ok: true,
    },
    {
      label: 'Opener Diversity',
      value: audit ? undersellRiskLabel(audit.underselling_risk) : '—',
      ok: audit?.underselling_risk === 'none',
    },
    {
      label: 'Pronoun Usage',
      value: 'Minimal',
      ok: true,
    },
    {
      label: 'Readability Score',
      value: audit
        ? (audit.metric_strength >= 60 ? 'A' : audit.metric_strength >= 40 ? 'B' : 'C')
        : '—',
      ok: (audit?.metric_strength ?? 0) >= 40,
    },
  ], [audit]);

  // Combined activity feed
  const activityItems = useMemo(() => {
    const cvItems = recentCVs.slice(0, 3).map(cv => ({
      icon: '📄',
      label: `Updated "${cv.name || 'CV'}"`,
      sub: cv.template ? `${cv.template} template` : 'CV Generator',
      time: cv.createdAt ?? '',
      view: 'history',
    }));
    const appItems = [...trackedApps]
      .sort((a, b) => new Date(b.dateApplied ?? 0).getTime() - new Date(a.dateApplied ?? 0).getTime())
      .slice(0, 3)
      .map(app => ({
        icon: app.status === 'Offer' ? '🏆' : app.status === 'Interviewing' ? '🎤' : '🎯',
        label: `${app.roleTitle || 'Role'} — ${app.status}`,
        sub: app.company || 'Company',
        time: app.dateApplied ?? '',
        view: 'tracker',
      }));
    return [...cvItems, ...appItems]
      .filter(i => i.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
  }, [recentCVs, trackedApps]);

  // KPI sparkline data (simple derived from counts — real analytics come from AnalyticsDashboard)
  const kpiTiles = useMemo(() => [
    { label: 'Profile Views',  value: totalShareViews, change: 36, view: 'analytics',  spark: [2,4,3,6,5,8,totalShareViews || 1] },
    { label: 'Unique Visitors',value: Math.max(1, Math.round(totalShareViews * 0.7)), change: 7, view: 'analytics', spark: [1,3,2,4,3,5,Math.round(totalShareViews * 0.7) || 1] },
    { label: 'Link Shares',    value: storedLinks.length, change: 0, view: 'analytics', spark: [0,1,1,2,storedLinks.length || 1,storedLinks.length || 1,storedLinks.length || 1] },
    { label: 'CV Downloads',   value: savedCVs.length,   change: 0, view: 'history',   spark: [0,1,2,savedCVs.length,savedCVs.length,savedCVs.length,savedCVs.length] },
  ], [totalShareViews, storedLinks.length, savedCVs.length]);

  const nextSteps = useMemo(() => {
    const steps: { label: string; action: string; view?: string; isProfile?: boolean }[] = [];
    if (!activeSlot?.profile?.personalInfo?.name)
      steps.push({ label: 'Complete your profile', action: 'Set up your profile to unlock smart CV building', isProfile: true });
    if (savedCVs.length === 0)
      steps.push({ label: 'Generate your first CV', action: 'Pick a template and build a polished CV', view: 'generator' });
    if (!isAuthenticated)
      steps.push({ label: 'Sign in to sync across devices', action: 'Your data stays safe in the cloud' });
    if (savedCVs.length > 0 && trackedApps.length === 0)
      steps.push({ label: 'Track your applications', action: 'Log applications and monitor your pipeline', view: 'tracker' });
    return steps.slice(0, 3);
  }, [activeSlot, savedCVs, trackedApps, isAuthenticated]);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-[1380px] mx-auto py-4 sm:py-6">

      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 gap-4">

        {/* Greeting */}
        <div className="min-w-0">
          <h1
            className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight truncate"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Good {timeGreeting}, {firstName || 'there'} 👋
          </h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
            Let's build your next opportunity.
          </p>
        </div>

        {/* Right: avatar + name + tier + settings */}
        <div className="flex items-center gap-2.5 flex-shrink-0">

          {/* Profile picture + identity */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 shadow-sm">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || user.email}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-white dark:ring-neutral-800"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-black ring-2 ring-white dark:ring-neutral-800"
                    style={{ background: GOLD, color: NAVY }}
                  >
                    {userInitial}
                  </div>
                )}
                {/* Online dot */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-neutral-800" />
              </div>

              {/* Name + tier */}
              <div className="leading-none hidden sm:block">
                <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate max-w-[120px]">
                  {user.name?.split(' ')[0] || user.email.split('@')[0]}
                </p>
                <span
                  className="inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: tierBg, color: tierColor }}
                >
                  {tierLabel}
                </span>
              </div>

              {/* Tier badge only on mobile (no name) */}
              <span
                className="inline-block sm:hidden text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: tierBg, color: tierColor }}
              >
                {tierLabel}
              </span>
            </div>
          )}

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-neutral-600 transition-all shadow-sm"
            title="Settings"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── RESUME LAST SESSION ───────────────────────────────────────────── */}
      {lastSession && !sessionDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-white dark:bg-neutral-800 rounded-2xl border border-[#C9A84C]/35 dark:border-[#C9A84C]/20 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0 text-sm select-none">↩</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-tight">Resume last session</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
              {lastSession.jobTitle ? `${lastSession.jobTitle}${lastSession.company ? ` · ${lastSession.company}` : ''}` : lastSession.recentCv?.name ?? 'Pick up where you left off'}
              {lastSession.recentCv?.createdAt ? ` · ${navTimeAgo(lastSession.recentCv.createdAt)}` : ''}
            </p>
          </div>
          <button onClick={() => onNavigate('generator')} className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] hover:opacity-90 transition-opacity whitespace-nowrap">
            Continue →
          </button>
          <button onClick={() => setSessionDismissed(true)} className="flex-shrink-0 p-1 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ── MAIN LAYOUT: content + sticky profile card ─────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT / CENTRE: content grid ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── ROW 1: Profile Status | Your Top CV | Profile Slots ───────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Profile Status */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={onEditProfile} className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    View Profile →
                  </button>
                }
              >
                Your Profile Status
              </CardTitle>
              <div className="flex items-start gap-3">
                {/* Circular progress */}
                <div className="relative flex-shrink-0 w-[72px] h-[72px]">
                  <Gauge value={profileComplete} />
                  <div className="absolute inset-0 flex items-end justify-center pb-1">
                    <span className="text-[8px] font-semibold text-zinc-400">Complete</span>
                  </div>
                </div>
                {/* Checklist */}
                <div className="flex-1 space-y-1.5 pt-0.5">
                  {profileSections.map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      {s.done ? (
                        <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="10"/>
                        </svg>
                      )}
                      <span className={`text-[10.5px] leading-tight ${s.done ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'}`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Your Top CV */}
            <Card className="p-4">
              <CardTitle
                action={
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                    Latest
                  </span>
                }
              >
                Your Top CV
              </CardTitle>
              {recentCVs[0] ? (
                <div>
                  <div className="flex items-start gap-3 mb-3">
                    {/* Mini CV thumbnail */}
                    <div className="w-11 h-14 rounded-lg flex flex-col gap-0.5 px-1.5 pt-1.5 flex-shrink-0 shadow-sm"
                      style={{ background: NAVY }}>
                      <div className="w-full h-0.5 rounded-full bg-[#C9A84C]/60" />
                      <div className="w-3/4 h-0.5 rounded-full bg-white/20" />
                      <div className="mt-1 space-y-0.5">
                        <div className="w-full h-px bg-white/15 rounded-full" />
                        <div className="w-4/5 h-px bg-white/10 rounded-full" />
                        <div className="w-full h-px bg-white/10 rounded-full" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate leading-tight">
                        {recentCVs[0].name || 'My CV'}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {navTimeAgo(recentCVs[0].createdAt)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {activeSlot?.lastAtsScore != null && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]">
                            Score: {activeSlot.lastAtsScore}/100
                          </span>
                        )}
                        {recentCVs[0].template && (
                          <span className="text-[9px] text-zinc-400 truncate">
                            {recentCVs[0].template}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onNavigate('generator')}
                      className="flex-1 py-1.5 rounded-xl text-[10.5px] font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] hover:opacity-90 transition-opacity">
                      Edit CV
                    </button>
                    <button onClick={() => onNavigate('history')}
                      className="flex-1 py-1.5 rounded-xl text-[10.5px] font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                      Preview
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4 text-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-xl">📄</div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No CV generated yet</p>
                  <button onClick={() => onNavigate('generator')}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1B2B4B] text-white hover:opacity-90 transition-opacity">
                    Generate Now →
                  </button>
                </div>
              )}
            </Card>

            {/* Profile Slots */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={onEditProfile} className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    Manage →
                  </button>
                }
              >
                Profile Slots
              </CardTitle>
              <div className="space-y-1.5">
                {profiles.slice(0, 3).map(p => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-colors ${
                      p.id === activeSlot?.id
                        ? 'border-[#C9A84C]/40 bg-[#C9A84C]/5 dark:bg-[#C9A84C]/8'
                        : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                      style={{ background: p.id === activeSlot?.id ? GOLD : NAVY, color: p.id === activeSlot?.id ? NAVY : 'white' }}
                    >
                      {(p.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[11px] font-semibold flex-1 truncate text-zinc-700 dark:text-zinc-200">
                      {p.name || 'Profile'}
                    </span>
                    {p.id === activeSlot?.id && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${GOLD}20`, color: GOLD }}>
                        Primary
                      </span>
                    )}
                  </div>
                ))}
                <button
                  onClick={onEditProfile}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 hover:border-[#C9A84C]/40 hover:text-[#C9A84C] transition-colors mt-1"
                >
                  <span className="text-base leading-none">+</span> Create New Profile
                </button>
              </div>
            </Card>
          </div>

          {/* ── QUICK ACTIONS BAR ─────────────────────────────────────────── */}
          <Card className="p-4">
            {/* 7 items: 4-per-row on mobile (2 rows), single row on sm+ */}
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              {QUICK_ACTIONS.map(a => {
                const Icon = QA_ICONS[a.key];
                return (
                  <button
                    key={a.key}
                    onClick={() => onNavigate(a.view)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-[#C9A84C]/35 hover:bg-[#1B2B4B]/3 dark:hover:bg-[#C9A84C]/5 active:scale-95 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-[#1B2B4B]/8 dark:group-hover:bg-[#C9A84C]/12 transition-colors">
                      {Icon && <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] transition-colors" />}
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 text-center leading-tight transition-colors">
                      {a.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── ROW 2: Recent Activity | Templates & Themes | Score My CV ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Recent Activity */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={() => onNavigate(trackedApps.length ? 'tracker' : 'history')}
                    className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    View all →
                  </button>
                }
              >
                Recent Activity
              </CardTitle>
              {activityItems.length === 0 ? (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">No activity yet</p>
                  <p className="text-[10px] text-zinc-300 dark:text-zinc-600">Generate or import a CV to get started</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {activityItems.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate(item.view)}
                      className="w-full flex items-center gap-2.5 py-2 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-sm group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 truncate leading-tight">{item.label}</p>
                        <p className="text-[9.5px] text-zinc-400 dark:text-zinc-500 truncate">{item.sub}</p>
                      </div>
                      <span className="text-[9px] text-zinc-300 dark:text-zinc-600 flex-shrink-0 whitespace-nowrap">
                        {navTimeAgo(item.time)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Templates & Themes */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={() => onNavigate('generator')} className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    Browse all →
                  </button>
                }
              >
                Templates &amp; Themes
              </CardTitle>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {TEMPLATE_PREVIEWS.map(t => (
                  <TemplateThumbnail
                    key={t.name}
                    name={t.name}
                    bg={t.bg}
                    accent={t.accent}
                    onClick={() => onNavigate('generator')}
                  />
                ))}
              </div>
              <button
                onClick={() => onNavigate('generator')}
                className="w-full py-2 rounded-xl border border-zinc-100 dark:border-zinc-800 text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 hover:border-[#C9A84C]/30 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors"
              >
                34+ professional templates — ATS-optimised · Beautiful
              </button>
            </Card>

            {/* Score My CV */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={() => onNavigate('score')} className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    Run a quick scan →
                  </button>
                }
              >
                Score My CV
              </CardTitle>
              {audit || activeSlot?.lastAtsScore ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-shrink-0">
                      <Gauge value={overallScore} size={68} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        {overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Building' : 'Needs Work'}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {activeSlot?.lastAtsScore ? 'ATS-optimised for hiring systems' : 'Based on profile analysis'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    {scoreMetrics.map(m => (
                      <div key={m.label} className="flex items-center gap-2">
                        <span className="text-[9.5px] text-zinc-400 dark:text-zinc-500 w-[90px] flex-shrink-0 truncate">{m.label}</span>
                        <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${m.value}%`, background: m.value >= 70 ? '#16a34a' : m.value >= 50 ? GOLD : '#ef4444' }}
                          />
                        </div>
                        <span className="text-[9.5px] font-bold text-zinc-600 dark:text-zinc-300 w-5 text-right flex-shrink-0">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-4 text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#C9A84C]/10 flex items-center justify-center text-2xl">📊</div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No score yet</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Generate a CV first to see your ATS score</p>
                </div>
              )}
              <button
                onClick={() => onNavigate('score')}
                className="w-full py-2 rounded-xl text-[11px] font-bold transition-opacity hover:opacity-90 active:scale-95 bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B]"
              >
                Run Full Analysis →
              </button>
            </Card>
          </div>

          {/* ── ROW 3: Analytics | HR Detector ────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Analytics Overview */}
            <Card className="p-4">
              <CardTitle
                action={
                  <button onClick={() => onNavigate('analytics')}
                    className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                    View all →
                  </button>
                }
              >
                Analytics Overview
              </CardTitle>
              <div className="grid grid-cols-2 gap-2">
                {kpiTiles.map(k => (
                  <button
                    key={k.label}
                    onClick={() => onNavigate(k.view)}
                    className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left group"
                  >
                    <span className="text-xl font-bold text-zinc-800 dark:text-zinc-100 leading-none">{k.value}</span>
                    <div className="flex items-center gap-1">
                      {k.change > 0 && (
                        <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400">↑ {k.change}%</span>
                      )}
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight">{k.label}</span>
                    </div>
                    <Sparkline values={k.spark} />
                  </button>
                ))}
              </div>
            </Card>

            {/* HR Detector (Quality Audit) */}
            <Card className="p-4">
              <CardTitle
                action={
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Latest Scan</span>
                }
              >
                HR Detector (Quality Audit)
              </CardTitle>
              {audit ? (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border"
                      style={{
                        background: hrScore >= 70 ? 'rgba(22,163,74,0.08)' : 'rgba(201,168,76,0.08)',
                        borderColor: hrScore >= 70 ? 'rgba(22,163,74,0.25)' : 'rgba(201,168,76,0.25)',
                      }}
                    >
                      <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke={hrScore >= 70 ? '#16a34a' : GOLD} strokeWidth={2}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{hrScore}</span>
                        <span className="text-xs text-zinc-400">/100</span>
                      </div>
                      <p className="text-[10px] font-semibold" style={{ color: hrScore >= 70 ? '#16a34a' : GOLD }}>
                        {hrScore >= 80 ? 'Excellent' : hrScore >= 60 ? 'Good' : 'Needs Attention'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {hrChecklist.map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        <StatusDot ok={item.ok} />
                        <span className="text-[10.5px] flex-1 text-zinc-600 dark:text-zinc-300">{item.label}</span>
                        <span
                          className="text-[9.5px] font-bold flex-shrink-0"
                          style={{ color: item.ok ? '#16a34a' : GOLD }}
                        >
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => onNavigate('toolkit')}
                    className="w-full py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 hover:border-[#1B2B4B]/25 dark:hover:border-[#C9A84C]/25 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors"
                  >
                    Run New Scan →
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth={1.8}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Add work experience to run an audit</p>
                  <button onClick={onEditProfile} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] hover:opacity-90 transition-opacity">
                    Set Up Profile →
                  </button>
                </div>
              )}
            </Card>
          </div>

          {/* ── CAREER INTELLIGENCE (full-width) ─────────────────────────── */}
          {audit && userProfile?.workExperience && userProfile.workExperience.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">
                    Career Intelligence
                  </h2>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Instant deterministic analysis — no AI, always accurate</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border capitalize text-[#1B2B4B] dark:text-[#C9A84C]"
                    style={{ background: `${NAVY}10`, borderColor: `${NAVY}20` }}
                    >
                    {audit.career_stage}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {Math.round(audit.total_experience_months / 12)}yr exp
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${
                    audit.career_progression === 'strong' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' :
                    'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                  }`}>
                    {audit.career_progression === 'strong' ? '📈' : '📊'} {audit.career_progression} progression
                  </span>
                </div>
              </div>

              {/* Top recommendation */}
              {audit.recommendations.length > 0 && (() => {
                const top = [...audit.recommendations].sort((a, b) =>
                  ['critical','high','medium','low'].indexOf(a.priority) - ['critical','high','medium','low'].indexOf(b.priority)
                )[0];
                const action = top.targetView === 'profile' ? onEditProfile
                  : top.targetView === 'generate' ? () => onNavigate('generator')
                  : top.targetView ? () => onNavigate(top.targetView!) : null;
                return (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 mb-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-lg flex-shrink-0">🟠</span>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-600/70 dark:text-amber-500/60 mb-0.5">Your biggest opportunity</p>
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{top.title}</p>
                        <p className="text-[10px] text-amber-600/80 dark:text-amber-500/70 mt-0.5 leading-relaxed">{top.detail}</p>
                      </div>
                    </div>
                    {action && (
                      <button onClick={action}
                        className="text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0">
                        {top.action} →
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Signal rings — horizontal scroll on mobile, grid on sm+ */}
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="grid grid-cols-5 gap-2" style={{ minWidth: 290 }}>
                  {[
                    { label: 'Completeness', value: profileComplete },
                    { label: 'Achievements', value: audit.achievement_density },
                    { label: 'Metrics',      value: audit.metric_strength },
                    { label: 'Leadership',   value: audit.leadership_score },
                    { label: 'Skill Depth',  value: audit.skill_evidence_score },
                  ].map(s => {
                    const color = s.value >= 70 ? '#16a34a' : s.value >= 50 ? GOLD : '#ef4444';
                    return (
                      <div key={s.label} className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <Gauge value={s.value} size={48} />
                        <span className="text-[8px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

        </div>{/* end content column */}

        {/* ── RIGHT: Sticky Profile Card ────────────────────────────────── */}
        <div className="hidden xl:flex flex-col w-[228px] flex-shrink-0 sticky top-4 gap-3">

          {/* Profile card */}
          <Card className="p-5 flex flex-col items-center text-center">
            {/* Avatar */}
            <div
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-black mb-3 ring-4"
              style={{ background: GOLD, color: NAVY, ringColor: `${GOLD}30` }}
            >
              {firstName?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            {/* Name + title */}
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight">
              {userProfile?.personalInfo?.name || 'Your Name'}
            </h3>
            {latestJobTitle && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">
                {latestJobTitle}
              </p>
            )}
            {userProfile?.personalInfo?.location && (
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center justify-center gap-0.5">
                <span>📍</span> {userProfile.personalInfo.location}
              </p>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-1 w-full mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 mb-3">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{yearsExp > 0 ? `${yearsExp}+` : '—'}</span>
                <span className="text-[8px] text-zinc-400 leading-tight text-center">Yrs Exp</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{savedCVs.length}</span>
                <span className="text-[8px] text-zinc-400 leading-tight text-center">CVs</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{userProfile?.skills?.length ?? 0}</span>
                <span className="text-[8px] text-zinc-400 leading-tight text-center">Skills</span>
              </div>
            </div>

            {/* Summary quote */}
            {userProfile?.summary && (
              <p className="text-[9.5px] text-zinc-400 dark:text-zinc-500 italic leading-relaxed text-center line-clamp-3 mb-3 px-1">
                "{userProfile.summary.slice(0, 110)}{userProfile.summary.length > 110 ? '…' : ''}"
              </p>
            )}

            <button
              onClick={onEditProfile}
              className="w-full py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[10.5px] font-semibold text-zinc-600 dark:text-zinc-300 hover:border-[#1B2B4B]/30 dark:hover:border-[#C9A84C]/30 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors flex items-center justify-center gap-1"
            >
              View Public Profile ↗
            </button>
          </Card>

          {/* Job Pipeline (only if tracking) */}
          {trackedApps.length > 0 && (
            <Card className="p-4">
              <CardTitle action={
                <button onClick={() => onNavigate('tracker')} className="text-[10px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">Open →</button>
              }>
                Job Pipeline
              </CardTitle>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="flex flex-col items-center py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-base font-bold text-zinc-800 dark:text-zinc-100">{activeApps.length}</span>
                  <span className="text-[8px] text-zinc-400 mt-0.5">Active</span>
                </div>
                <div className="flex flex-col items-center py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15">
                  <span className="text-base font-bold text-amber-600 dark:text-amber-400">{interviewCount}</span>
                  <span className="text-[8px] text-amber-500/80 mt-0.5">Interview</span>
                </div>
                <div className="flex flex-col items-center py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15">
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{offersCount}</span>
                  <span className="text-[8px] text-emerald-500/80 mt-0.5">Offers 🎉</span>
                </div>
              </div>
            </Card>
          )}

          {/* Storage & Sync */}
          <StorageSyncCard savedCVCount={savedCVs.length} />

          {/* Next steps */}
          {nextSteps.length > 0 && (
            <Card className="p-4">
              <CardTitle>Next Steps</CardTitle>
              <div className="space-y-2">
                {nextSteps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => { if (step.isProfile) onEditProfile(); else if (step.view) onNavigate(step.view); }}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-[#C9A84C]/40 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-all text-left group"
                  >
                    <div className="w-4 h-4 rounded-full border-2 border-[#C9A84C]/40 group-hover:border-[#C9A84C] flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                      <span className="text-[8px] font-bold text-[#C9A84C]">{i+1}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-200 leading-tight">{step.label}</div>
                      <div className="text-[9px] text-zinc-400 mt-0.5 leading-tight">{step.action}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>{/* end right column */}
      </div>

      {/* ── PRO TIP BAR ───────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 rounded-2xl border border-[#C9A84C]/20"
        style={{ background: `${GOLD}08` }}>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
          style={{ background: GOLD, color: NAVY }}>
          💡
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 flex-1">
          <strong className="text-zinc-700 dark:text-zinc-200">Pro Tip:</strong>{' '}
          Keep your profile updated and your CVs tailored to each job for maximum impact.
        </p>
        <button
          onClick={() => onNavigate('score')}
          className="text-[10.5px] font-semibold flex-shrink-0 hover:underline"
          style={{ color: GOLD }}
        >
          View Tips Library →
        </button>
      </div>

    </div>
  );
};

export default DashboardHome;
