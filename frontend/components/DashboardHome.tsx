import React, { useMemo, useEffect, useState } from 'react';
import type { UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication, CVData, UserProfile } from '../types';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import { profileToCV } from '../utils/profileToCV';
import { getStoredShareLinks, fetchAllShareStats } from '../services/shareService';
import type { StoredShareLink, ShareStats } from '../services/shareService';
function navTimeAgo(iso: string): string {
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
  undersellRiskColor,
  describeTrack,
} from '../services/profileIntelligenceAudit';
import type { ProfileIntelligenceReport } from '../services/profileIntelligenceAudit';

interface Props {
  profiles: UserProfileSlot[];
  activeSlot: UserProfileSlot | null;
  currentCV: CVData | null;
  isAuthenticated: boolean;
  onNavigate: (view: string) => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
}

function qualityLabel(value: number): { label: string; color: string } {
  if (value >= 70) return { label: 'Strong',    color: '#16a34a' };
  if (value >= 50) return { label: 'Good',      color: '#C9A84C' };
  if (value >= 30) return { label: 'Building',  color: '#d97706' };
  return               { label: 'Early',     color: '#94a3b8' };
}

function ScoreRing({
  value, label, color, tooltip, subLabel, subColor,
}: {
  value: number; label: string; color: string; tooltip?: React.ReactNode;
  subLabel?: string; subColor?: string;
}) {
  const [show, setShow] = useState(false);
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(value, 100) / 100);
  const ql = qualityLabel(value);
  const displayLabel = subLabel ?? ql.label;
  const displayColor = subColor ?? ql.color;
  return (
    <div
      className="relative flex flex-col items-center gap-1 cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-zinc-100 dark:text-zinc-800" />
        <circle
          cx="28" cy="28" r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{value}</text>
      </svg>
      <span style={{ color: displayColor }} className="text-[9px] font-bold text-center leading-none">{displayLabel}</span>
      {show && tooltip && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-56 bg-zinc-900 dark:bg-zinc-950 text-white rounded-xl p-3 text-xs shadow-2xl pointer-events-none">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-950" />
        </div>
      )}
    </div>
  );
}

const PRIORITY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  critical: { icon: '🔴', color: 'text-rose-700 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-900/20',   border: 'border-rose-200 dark:border-rose-800' },
  high:     { icon: '🟠', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  medium:   { icon: '🟡', color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800' },
  low:      { icon: '⚪', color: 'text-zinc-600 dark:text-zinc-400',    bg: 'bg-zinc-50 dark:bg-zinc-800/60',    border: 'border-zinc-200 dark:border-zinc-700' },
};

/** Resolve a recommendation's targetView to a concrete navigation action. */
function resolveRecAction(
  targetView: string | undefined,
  onNavigate: (v: string) => void,
  onEditProfile: () => void,
) {
  if (!targetView) return null;
  if (targetView === 'profile') return onEditProfile;
  if (targetView === 'generate') return () => onNavigate('generator');
  return () => onNavigate(targetView);
}

/* ─── SVG icon helpers (inline, no dep) ─────────────────────────────────── */
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconChevron = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const DashboardHome: React.FC<Props> = ({
  profiles,
  activeSlot,
  currentCV,
  isAuthenticated,
  onNavigate,
  onEditProfile,
  onOpenSettings,
}) => {
  const savedCVs: SavedCV[]                   = activeSlot?.savedCVs ?? [];
  const savedCLs: SavedCoverLetter[]          = activeSlot?.savedCoverLetters ?? [];
  const trackedApps: TrackedApplication[]     = activeSlot?.trackedApps ?? [];
  const starStories                           = (activeSlot as any)?.starStories ?? [];

  const userProfile: UserProfile | null = activeSlot?.profile ?? null;

  const recentCVs = useMemo(() =>
    [...savedCVs].sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    ).slice(0, 4),
  [savedCVs]);

  const activeApps     = trackedApps.filter(a => a.status !== 'Rejected');
  const offersCount    = trackedApps.filter(a => a.status === 'Offer').length;
  const interviewCount = trackedApps.filter(a => a.status === 'Interviewing').length;

  // ── Share links summary ───────────────────────────────────────────────────
  const [storedLinks, setStoredLinks] = useState<StoredShareLink[]>([]);
  const [shareStats, setShareStats]   = useState<Map<string, ShareStats>>(new Map());
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

  // ── Resume last session ───────────────────────────────────────────────────
  const [lastSession, setLastSession] = useState<{
    jobTitle: string; company: string; hasJD: boolean; purpose: string; recentCv: SavedCV | null;
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
      const purpose  = raw(`p:${id}:purpose`) || 'job';
      const allCvs   = (activeSlot.savedCVs ?? []) as SavedCV[];
      const recentCv = allCvs.length > 0
        ? allCvs.reduce((a, b) => new Date(a.createdAt ?? 0) > new Date(b.createdAt ?? 0) ? a : b)
        : null;
      if (jd.trim() || recentCv) {
        setLastSession({ jobTitle, company, hasJD: !!jd.trim(), purpose, recentCv });
      } else {
        setLastSession(null);
      }
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

  const nextSteps = useMemo(() => {
    const steps: { label: string; action: string; view?: string; isDrive?: boolean; isProfile?: boolean }[] = [];
    if (!activeSlot?.profile?.personalInfo?.name)
      steps.push({ label: 'Complete your profile', action: 'Set up your profile to unlock smart CV building', isProfile: true });
    if (savedCVs.length === 0)
      steps.push({ label: 'Generate your first CV', action: 'Pick a template and build a polished CV in minutes', view: 'generator' });
    if (!isAuthenticated)
      steps.push({ label: 'Sign in to sync across devices', action: 'Your data stays safe in the cloud' });
    if (savedCVs.length > 0 && trackedApps.length === 0)
      steps.push({ label: 'Track your job applications', action: 'Log applications and monitor your pipeline', view: 'tracker' });
    if (savedCVs.length > 0 && savedCLs.length === 0)
      steps.push({ label: 'Write a cover letter', action: 'Tailored to your CV and target role', view: 'generator' });
    return steps.slice(0, 3);
  }, [activeSlot, savedCVs, savedCLs, trackedApps, isAuthenticated]);

  const statCards = [
    { label: 'CVs Saved',     value: savedCVs.length,     icon: '📄', view: 'history',   accent: 'from-[#1B2B4B] to-[#2d4272]',   accentText: 'text-blue-700 dark:text-blue-300',   accentBg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Cover Letters', value: savedCLs.length,     icon: '✉️', view: 'generator', accent: 'from-violet-600 to-violet-500', accentText: 'text-violet-700 dark:text-violet-300', accentBg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Applications',  value: trackedApps.length,  icon: '🎯', view: 'tracker',   accent: 'from-emerald-600 to-emerald-500', accentText: 'text-emerald-700 dark:text-emerald-300', accentBg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'STAR Stories',  value: starStories.length,  icon: '⭐', view: 'interview', accent: 'from-amber-600 to-amber-500',   accentText: 'text-amber-700 dark:text-amber-300',   accentBg: 'bg-amber-50 dark:bg-amber-900/20' },
  ];

  const quickActions = [
    { label: 'Generate CV',     icon: '✨', view: 'generator', desc: 'Job-matched',  primary: true },
    { label: 'Cover Letter',    icon: '✉️', view: 'generator', desc: 'In seconds',   primary: false },
    { label: 'Job Tracker',     icon: '🎯', view: 'tracker',   desc: 'Pipeline',     primary: false },
    { label: 'Interview Prep',  icon: '🎤', view: 'interview', desc: 'Q&A practice', primary: false },
    { label: 'ATS Score',       icon: '📊', view: 'score',     desc: 'Beat robots',  primary: false },
    { label: 'Quality Toolkit', icon: '🛠', view: 'toolkit',   desc: 'Polish & fix', primary: false },
  ];

  // Derived profile ring colors
  const ringColor = profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? '#C9A84C' : '#16a34a';
  const strengthLabel = profileComplete < 50 ? 'Needs Work' : profileComplete < 80 ? 'Almost There' : profileComplete < 100 ? 'Nearly Complete' : 'Complete ✓';
  const strengthBg    = profileComplete < 50 ? '#fef2f2' : profileComplete < 80 ? '#fefce8' : '#f0fdf4';
  const strengthColor = profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? '#C9A84C' : '#16a34a';

  const firstName = userProfile?.personalInfo?.name?.split(' ')[0];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4 sm:space-y-5">

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1B2B4B] via-[#1e3258] to-[#243870] p-5 sm:p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          {/* Greeting */}
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">
              Career Command Centre
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-white font-['Playfair_Display',serif] leading-tight">
              {firstName ? `Welcome back, ${firstName} 👋` : 'Welcome to ProCV 👋'}
            </h1>
            <p className="text-xs text-white/45 mt-1 hidden sm:block">Your personal career snapshot</p>
          </div>

          {/* Top-right controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <IconSettings />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-5 pt-4 border-t border-white/10">
          {statCards.map(card => (
            <button
              key={card.label}
              onClick={() => { if (card.view) onNavigate(card.view); }}
              className="flex flex-col items-center gap-0.5 py-2.5 sm:py-3 rounded-xl bg-white/8 hover:bg-white/14 active:scale-95 transition-all group"
            >
              <span className="text-base leading-none mb-0.5 opacity-80">{card.icon}</span>
              <span className="text-xl sm:text-2xl font-bold text-white">{card.value}</span>
              <span className="text-[8px] sm:text-[10px] text-white/45 font-medium text-center leading-tight px-1">{card.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── RESUME LAST SESSION ──────────────────────────────────────────────── */}
      {lastSession && !sessionDismissed && (
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-[#C9A84C]/40 dark:border-[#C9A84C]/25 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/12 dark:bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 text-base select-none">
            ↩
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-tight">
              Resume last session
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
              {lastSession.jobTitle
                ? `${lastSession.jobTitle}${lastSession.company ? ` · ${lastSession.company}` : ''}`
                : lastSession.recentCv?.name ?? 'Pick up where you left off'}
              {lastSession.recentCv?.createdAt
                ? ` · ${(() => {
                    const d = new Date(lastSession.recentCv.createdAt);
                    const diff = Date.now() - d.getTime();
                    if (diff < 3600000)  return `${Math.round(diff / 60000)}m ago`;
                    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
                    return `${Math.round(diff / 86400000)}d ago`;
                  })()}`
                : ''}
            </p>
          </div>
          <button
            onClick={() => onNavigate('generator')}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
          >
            Continue →
          </button>
          <button
            onClick={() => setSessionDismissed(true)}
            className="flex-shrink-0 p-1 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── PROFILE STRENGTH ─────────────────────────────────────────────────── */}
      {activeSlot && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <ScoreRing
                value={profileComplete}
                label="Profile"
                color={ringColor}
                subLabel={strengthLabel}
                subColor={strengthColor}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Profile Strength</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: strengthColor, background: strengthBg }}
                >
                  {strengthLabel}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${profileComplete}%`, background: ringColor }}
                />
              </div>
              {profileComplete < 100 ? (
                <button onClick={onEditProfile} className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                  {profileComplete < 50 ? 'Set up your profile to unlock CV generation →' : 'Fill in missing details to improve your score →'}
                </button>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">All key sections filled in — you're ready to generate!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">

        {/* Career Intelligence — left 2 cols on desktop */}
        {audit && userProfile?.workExperience && userProfile.workExperience.length > 0 ? (
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Career Intelligence</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Instant deterministic analysis — no AI, always accurate</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/15 dark:border-[#C9A84C]/20 capitalize">
                    {audit.career_stage}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {Math.round(audit.total_experience_months / 12)}yr exp
                  </span>
                </div>
              </div>

              {/* Signal badges */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  style={{
                    color: undersellRiskColor(audit.underselling_risk),
                    borderColor: undersellRiskColor(audit.underselling_risk) + '50',
                    background: undersellRiskColor(audit.underselling_risk) + '15',
                  }}
                >
                  {audit.underselling_risk !== 'none' ? '⚠' : '✓'} {undersellRiskLabel(audit.underselling_risk)}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  🗺 {describeTrack(audit.career_track)}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  audit.career_progression === 'strong' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' :
                  audit.career_progression === 'steady' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
                  audit.career_progression === 'lateral' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
                  'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                }`}>
                  {audit.career_progression === 'strong' ? '📈' : audit.career_progression === 'lateral' ? '↔' : '📊'}{' '}
                  {audit.career_progression.charAt(0).toUpperCase() + audit.career_progression.slice(1)} progression
                </span>
                {audit.gaps.length > 0 && Math.max(...audit.gaps.map(g => g.gapMonths)) >= 6 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    ⏸ Career break · {Math.max(...audit.gaps.map(g => g.gapMonths))}mo
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Priority focus banner */}
              {audit.recommendations.length > 0 && (() => {
                const ORDER = ['critical', 'high', 'medium', 'low'];
                const top = [...audit.recommendations].sort(
                  (a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority)
                )[0];
                const cfg = PRIORITY_CONFIG[top.priority] ?? PRIORITY_CONFIG.low;
                const action = resolveRecAction(top.targetView, onNavigate, onEditProfile);
                return (
                  <div className={`flex flex-col sm:flex-row sm:items-center gap-3 px-3 sm:px-4 py-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg flex-shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-0.5">Your biggest opportunity</p>
                        <p className={`text-xs font-bold leading-tight ${cfg.color}`}>{top.title}</p>
                      </div>
                    </div>
                    {action && (
                      <button
                        onClick={action}
                        className={`text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg border ${cfg.border} ${cfg.color} hover:opacity-80 transition-opacity whitespace-nowrap self-start sm:self-auto`}
                      >
                        {top.action} →
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Score rings — 5 signals */}
              <div className="grid grid-cols-5 gap-1.5">
                {/* Completeness */}
                {(() => {
                  const v = profileComplete;
                  const color = v >= 80 ? '#16a34a' : v >= 50 ? '#C9A84C' : '#ef4444';
                  const missing = audit.completeness.missing.slice(0, 3);
                  return (
                    <div key="completeness" className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <ScoreRing value={v} label="" color={color} tooltip={
                        <div className="space-y-1.5">
                          <div className="font-bold text-white">Profile Completeness</div>
                          <div className="text-zinc-300">How filled-in your profile is across all sections.</div>
                          {missing.length > 0 && <div className="text-amber-300 mt-1">Still missing: {missing.join(', ')}.</div>}
                          {v >= 80 && <div className="text-emerald-400">Great — all key sections are filled.</div>}
                        </div>
                      } />
                      <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">Completeness</span>
                    </div>
                  );
                })()}

                {/* Achievement density */}
                {(() => {
                  const v = audit.achievement_density;
                  const color = v >= 60 ? '#16a34a' : v >= 35 ? '#C9A84C' : '#ef4444';
                  return (
                    <div key="density" className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <ScoreRing value={v} label="" color={color} tooltip={
                        <div className="space-y-1.5">
                          <div className="font-bold text-white">Achievement Density</div>
                          <div className="text-zinc-300">{audit.density.achievementCount} of {audit.density.totalBullets} bullets show measurable outcomes.</div>
                          {v < 60 && <div className="text-amber-300">Tip: rewrite duty bullets as "achieved X by doing Y".</div>}
                          {v >= 60 && <div className="text-emerald-400">Strong — most bullets show real impact.</div>}
                        </div>
                      } />
                      <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">Achievements</span>
                    </div>
                  );
                })()}

                {/* Metric strength */}
                {(() => {
                  const v = audit.metric_strength;
                  const color = v >= 60 ? '#16a34a' : v >= 30 ? '#C9A84C' : '#ef4444';
                  return (
                    <div key="metrics" className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <ScoreRing value={v} label="" color={color} tooltip={
                        <div className="space-y-1.5">
                          <div className="font-bold text-white">Metric Strength</div>
                          <div className="text-zinc-300">How often your bullets include real numbers: %, £, $, counts, timelines.</div>
                          {v < 60 && <div className="text-amber-300">Tip: add specific numbers to your top 3 bullets — even rough ones help.</div>}
                          {v >= 60 && <div className="text-emerald-400">Good quantification — numbers make bullets credible.</div>}
                        </div>
                      } />
                      <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">Metrics</span>
                    </div>
                  );
                })()}

                {/* Leadership */}
                {(() => {
                  const v = audit.leadership_score;
                  const color = v >= 50 ? '#16a34a' : v >= 25 ? '#C9A84C' : '#94a3b8';
                  return (
                    <div key="leadership" className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <ScoreRing value={v} label="" color={color} tooltip={
                        <div className="space-y-1.5">
                          <div className="font-bold text-white">Leadership Evidence</div>
                          <div className="text-zinc-300">{audit.leadership.signalCount} leadership signals found — team sizes, mentoring, decision scope.</div>
                          {v < 25 && <div className="text-zinc-400 italic">Not all roles need leadership evidence — only relevant for senior positions.</div>}
                          {v >= 25 && v < 50 && <div className="text-amber-300">Tip: add team sizes or reporting lines to senior roles.</div>}
                          {v >= 50 && <div className="text-emerald-400">Clear leadership presence across your roles.</div>}
                        </div>
                      } />
                      <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">Leadership</span>
                    </div>
                  );
                })()}

                {/* Skill evidence */}
                {(() => {
                  const v = audit.skill_evidence_score;
                  const color = v >= 60 ? '#16a34a' : v >= 35 ? '#C9A84C' : '#ef4444';
                  const mentionedOnly = audit.evidence.skills.filter((s: any) => s.level === 'mentioned').length;
                  return (
                    <div key="skills" className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <ScoreRing value={v} label="" color={color} tooltip={
                        <div className="space-y-1.5">
                          <div className="font-bold text-white">Skill Depth</div>
                          <div className="text-zinc-300">How many of your listed skills are backed up by your experience bullets.</div>
                          {mentionedOnly > 0 && <div className="text-amber-300">{mentionedOnly} skill{mentionedOnly > 1 ? 's' : ''} listed but never demonstrated in experience.</div>}
                          {v >= 60 && <div className="text-emerald-400">Most skills are shown, not just listed.</div>}
                        </div>
                      } />
                      <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400 text-center leading-tight uppercase tracking-wide">Skill Depth</span>
                    </div>
                  );
                })()}
              </div>

              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed">
                These measure content quality, not completion. <span className="font-semibold">60+ on any signal is strong</span> — a focused 50% CV beats a padded one. Hover each ring for details.
              </p>

              {/* Top recommendations */}
              {audit.recommendations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    Top actions for you
                  </div>
                  {audit.recommendations.slice(0, 4).map(rec => {
                    const cfg = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.low;
                    const action = resolveRecAction(rec.targetView, onNavigate, onEditProfile);
                    return (
                      <button
                        key={rec.id}
                        onClick={action ?? undefined}
                        disabled={!action}
                        className={`w-full flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 rounded-xl border transition-all text-left group ${cfg.border} ${cfg.bg} ${action ? 'hover:shadow-sm cursor-pointer' : 'cursor-default opacity-80'}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-bold leading-tight ${cfg.color}`}>{rec.title}</div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{rec.detail}</div>
                          </div>
                        </div>
                        {action && (
                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] sm:whitespace-nowrap sm:flex-shrink-0 mt-1 pl-8 sm:pl-0 transition-colors">
                            {rec.action} →
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {audit.recommendations.length > 4 && (
                    <button
                      onClick={() => onNavigate('score')}
                      className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline mt-1"
                    >
                      +{audit.recommendations.length - 4} more — view full ATS report →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Placeholder when no intelligence yet — still occupies the left slot */
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-6 shadow-sm flex flex-col items-center justify-center text-center gap-3 min-h-[160px]">
            <div className="w-12 h-12 rounded-full bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-2xl">🧠</div>
            <div>
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">Career Intelligence</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs">Add work experience to your profile to unlock instant career analysis — progression, skill depth, and personalised actions.</p>
            </div>
            <button
              onClick={onEditProfile}
              className="mt-1 px-4 py-2 rounded-xl text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 transition-colors"
            >
              Add Work Experience →
            </button>
          </div>
        )}

        {/* ── RIGHT COLUMN ───────────────────────────────────────────────────── */}
        <div className="space-y-4 sm:space-y-5">

          {/* Quick Actions */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(a => (
                <button
                  key={a.label}
                  onClick={() => onNavigate(a.view)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border active:scale-95 transition-all text-left group ${
                    a.primary
                      ? 'border-[#1B2B4B]/25 dark:border-[#C9A84C]/30 bg-[#1B2B4B]/6 dark:bg-[#C9A84C]/10 hover:bg-[#1B2B4B]/10 dark:hover:bg-[#C9A84C]/15'
                      : 'border-zinc-100 dark:border-zinc-800 hover:border-[#1B2B4B]/25 dark:hover:border-[#C9A84C]/25 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="text-lg leading-none">{a.icon}</span>
                  <span className={`text-[11px] font-semibold leading-tight mt-0.5 ${a.primary ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-200'}`}>{a.label}</span>
                  <span className="text-[9px] text-zinc-400 leading-tight">{a.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">Next Steps</h2>
            {nextSteps.length === 0 ? (
              <div className="flex flex-col items-center py-5 text-center gap-2">
                <div className="text-3xl">🎉</div>
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">You're all set!</p>
                <p className="text-xs text-zinc-400 mt-0.5">Keep applying and track everything in the Job Tracker.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nextSteps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (step.isProfile) onEditProfile();
                      else if (step.view) onNavigate(step.view);
                    }}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-[#C9A84C]/50 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-all text-left group"
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-[#C9A84C]/40 group-hover:border-[#C9A84C] flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                      <span className="text-[9px] font-bold text-[#C9A84C]">{i + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{step.label}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{step.action}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline stats (inline in right col when small) */}
          {trackedApps.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">Job Pipeline</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-xl font-bold text-[#1B2B4B] dark:text-zinc-100">{activeApps.length}</span>
                  <span className="text-[9px] text-zinc-400 font-medium text-center mt-0.5">Active</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-xl bg-amber-50 dark:bg-amber-900/15">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{interviewCount}</span>
                  <span className="text-[9px] text-amber-500/80 font-medium text-center mt-0.5">Interviews</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/15">
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{offersCount}</span>
                  <span className="text-[9px] text-emerald-500/80 font-medium text-center mt-0.5">Offers 🎉</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW: Recent CVs + Recent Activity + CV Performance ──────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">

        {/* Recent CVs */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Recent CVs</h2>
            {savedCVs.length > 0 && (
              <button onClick={() => onNavigate('history')} className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                View all →
              </button>
            )}
          </div>
          {recentCVs.length === 0 ? (
            <div className="flex flex-col items-center py-7 text-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No CVs saved yet</p>
              <button
                onClick={() => onNavigate('generator')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 transition-colors"
              >
                Generate your first CV ✨
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentCVs.map(cv => (
                <button
                  key={cv.id}
                  onClick={() => onNavigate('history')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left group"
                >
                  <div className="w-8 h-10 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white text-[10px] font-bold">CV</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                      {cv.name || 'Untitled CV'}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">
                      {cv.template ? `${cv.template} · ` : ''}{cv.createdAt ? navTimeAgo(cv.createdAt) : ''}
                    </div>
                  </div>
                  <span className="text-zinc-300 group-hover:text-zinc-500 flex-shrink-0">
                    <IconChevron />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity — tracked applications */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Recent Activity</h2>
            {trackedApps.length > 0 && (
              <button onClick={() => onNavigate('tracker')} className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                View all →
              </button>
            )}
          </div>
          {trackedApps.length === 0 ? (
            <div className="flex flex-col items-center py-7 text-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center">
                <span className="text-2xl">🎯</span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No applications tracked yet</p>
              <button
                onClick={() => onNavigate('tracker')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 transition-colors"
              >
                Track an application →
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...trackedApps]
                .sort((a, b) => new Date(b.dateApplied ?? 0).getTime() - new Date(a.dateApplied ?? 0).getTime())
                .slice(0, 4)
                .map(app => {
                  const statusColors: Record<string, { bg: string; text: string }> = {
                    Wishlist:     { bg: 'bg-zinc-100 dark:bg-zinc-800',        text: 'text-zinc-600 dark:text-zinc-400' },
                    Applied:      { bg: 'bg-blue-50 dark:bg-blue-900/30',      text: 'text-blue-600 dark:text-blue-400' },
                    Interviewing: { bg: 'bg-amber-50 dark:bg-amber-900/30',    text: 'text-amber-600 dark:text-amber-400' },
                    Offer:        { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
                    Rejected:     { bg: 'bg-rose-50 dark:bg-rose-900/30',      text: 'text-rose-500 dark:text-rose-400' },
                  };
                  const sc = statusColors[app.status] ?? statusColors.Applied;
                  return (
                    <button
                      key={app.id}
                      onClick={() => onNavigate('tracker')}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{app.roleTitle || 'Untitled Role'}</div>
                        <div className="text-xs text-zinc-400 truncate mt-0.5">{app.company || '—'}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${sc.bg} ${sc.text}`}>
                        {app.status}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* CV Performance — share links */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              CV Performance
            </h2>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {storedLinks.length} link{storedLinks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {storedLinks.length > 0 && (
            <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
              <div className="px-3 py-3 text-center">
                <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalShareViews}</div>
                <div className="text-[9px] text-zinc-400 font-medium mt-0.5">Total views</div>
              </div>
              <div className="px-3 py-3 text-center">
                <div className="text-xl font-bold text-[#1B2B4B] dark:text-zinc-100">{storedLinks.length}</div>
                <div className="text-[9px] text-zinc-400 font-medium mt-0.5">Active links</div>
              </div>
              <div className="px-3 py-3 text-center">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {storedLinks.length > 0 ? Math.round(totalShareViews / storedLinks.length) : 0}
                </div>
                <div className="text-[9px] text-zinc-400 font-medium mt-0.5">Avg per link</div>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-5">
            {storedLinks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <p className="text-sm text-zinc-400 dark:text-zinc-500">No shared CV links yet</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-[200px]">Open a saved CV and click <span className="font-semibold">Share</span> to track views</p>
              </div>
            ) : (
              <div className="space-y-2">
                {storedLinks.slice(0, 4).map(link => {
                  const stats = shareStats.get(link.id);
                  const views = stats?.view_count;
                  const expiresAt = link.expires_at;
                  const nowSec = Math.floor(Date.now() / 1000);
                  const daysLeft = Math.ceil((expiresAt - nowSec) / 86400);
                  const expiryLabel = daysLeft <= 0
                    ? 'Expired'
                    : daysLeft <= 3
                      ? `Expires in ${daysLeft}d ⚠️`
                      : new Date(expiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                  const expiryColor = daysLeft <= 0
                    ? 'text-zinc-400 dark:text-zinc-500 line-through'
                    : daysLeft <= 3
                      ? 'text-rose-500 dark:text-rose-400'
                      : 'text-zinc-400 dark:text-zinc-500';
                  const shareUrl = `${window.location.origin}${window.location.pathname}#s=${link.id}`;
                  return (
                    <div key={link.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 flex flex-col items-center justify-center">
                        {views == null ? (
                          <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-pulse" />
                        ) : (
                          <>
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 leading-none">{views > 99 ? '99+' : views}</span>
                            <span className="text-[7px] text-teal-500/70 leading-none">views</span>
                          </>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300 truncate">…/#s={link.id}</div>
                        <div className={`text-[9px] font-medium mt-0.5 ${expiryColor}`}>{expiryLabel}</div>
                      </div>
                      <button
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(shareUrl); } catch {
                            const ta = document.createElement('textarea');
                            ta.value = shareUrl; document.body.appendChild(ta);
                            ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                          }
                          setCopiedLinkId(link.id);
                          setTimeout(() => setCopiedLinkId(null), 2000);
                        }}
                        className="flex-shrink-0 p-1.5 rounded-lg transition-colors text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title="Copy link"
                      >
                        {copiedLinkId === link.id ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        )}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Open shared CV"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PROFILES ROW ─────────────────────────────────────────────────────── */}
      {profiles.length > 1 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 sm:p-5 shadow-sm">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Your Profiles ({profiles.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {profiles.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  p.id === activeSlot?.id
                    ? 'bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-sm'
                    : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <span>{p.name || 'Profile'}</span>
                {p.id === activeSlot?.id && <span className="text-[9px] opacity-60 font-medium">active</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;
