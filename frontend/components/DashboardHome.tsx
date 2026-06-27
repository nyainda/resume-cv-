import React, { useMemo, useEffect, useState } from 'react';
import type { UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication, CVData, UserProfile } from '../types';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import { profileToCV } from '../utils/profileToCV';
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
  driveConnected: boolean;
  onNavigate: (view: string) => void;
  onConnectDrive: () => void;
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
  value, label, color, tooltip,
}: {
  value: number; label: string; color: string; tooltip?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(value, 100) / 100);
  const ql = qualityLabel(value);
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
      <span style={{ color: ql.color }} className="text-[9px] font-bold text-center leading-none">{ql.label}</span>
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

const DashboardHome: React.FC<Props> = ({
  profiles,
  activeSlot,
  currentCV,
  isAuthenticated,
  driveConnected,
  onNavigate,
  onConnectDrive,
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

  // ── Profile Intelligence Audit ────────────────────────────────────────────
  const [audit, setAudit] = useState<ProfileIntelligenceReport | null>(null);

  useEffect(() => {
    if (!activeSlot?.id) { setAudit(null); return; }
    // Try cache first
    const cached = loadAuditFromLocalStorage(activeSlot.id);
    if (cached) { setAudit(cached); return; }
    // Run synchronously (zero LLM, always fast)
    const report = runProfileIntelligenceAudit(userProfile, currentCV);
    saveAuditToLocalStorage(activeSlot.id, report);
    setAudit(report);
  }, [activeSlot?.id, userProfile, currentCV]);

  // Compute profile completeness live — never use the cached audit for this.
  // The audit cache can be stale (computed when the profile was empty), and
  // currentCV may be null on initial dashboard load. Deriving from profileToCV
  // gives an accurate reading the moment the profile has any real data.
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
    if (isAuthenticated && !driveConnected)
      steps.push({ label: 'Back up to Google Drive', action: 'One tap — your CVs are safe forever', isDrive: true });
    if (savedCVs.length > 0 && trackedApps.length === 0)
      steps.push({ label: 'Track your job applications', action: 'Log applications and monitor your pipeline', view: 'tracker' });
    if (savedCVs.length > 0 && savedCLs.length === 0)
      steps.push({ label: 'Write a cover letter', action: 'Tailored to your CV and target role', view: 'generator' });
    return steps.slice(0, 3);
  }, [activeSlot, savedCVs, savedCLs, trackedApps, isAuthenticated, driveConnected]);

  const statCards = [
    { label: 'CVs Saved',     value: savedCVs.length,     icon: '📄', view: 'history',   color: 'from-[#1B2B4B] to-[#2d4272]' },
    { label: 'Cover Letters', value: savedCLs.length,     icon: '✉️', view: 'generator', color: 'from-violet-700 to-violet-500' },
    { label: 'Applications',  value: trackedApps.length,  icon: '🎯', view: 'tracker',   color: 'from-emerald-700 to-emerald-500' },
    { label: 'STAR Stories',  value: starStories.length,  icon: '⭐', view: 'interview', color: 'from-amber-700 to-amber-500' },
  ];

  const quickActions = [
    { label: 'Generate CV',    icon: '✨', view: 'generator', desc: 'Job-matched, quality-checked' },
    { label: 'Cover Letter',   icon: '✉️', view: 'generator', desc: 'Written in seconds' },
    { label: 'Job Tracker',    icon: '🎯', view: 'tracker',   desc: 'Manage pipeline' },
    { label: 'Interview Prep', icon: '🎤', view: 'interview', desc: 'Practice Q&A' },
    { label: 'ATS Score',      icon: '📊', view: 'score',     desc: 'Beat the robots' },
    { label: 'Quality Toolkit',icon: '🛠', view: 'toolkit',   desc: 'Polish & humanize' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1B2B4B] dark:text-zinc-100 font-['Playfair_Display',serif] leading-tight">
            {userProfile?.personalInfo?.name
              ? `Welcome back, ${userProfile.personalInfo.name.split(' ')[0]} 👋`
              : 'Welcome to ProCV 👋'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Your personal career command centre
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && !driveConnected && (
            <button
              onClick={onConnectDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 transition-colors"
            >
              <svg width="14" height="13" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>
              Connect Drive
            </button>
          )}
          {driveConnected && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Drive synced
            </span>
          )}
          <button onClick={onOpenSettings} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {/* Profile completion ring */}
      {activeSlot && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex items-center gap-4">
            <ScoreRing
              value={profileComplete}
              label="Profile"
              color={profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? '#C9A84C' : '#16a34a'}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Profile Strength</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    color: profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? '#C9A84C' : '#16a34a',
                    background: profileComplete < 50 ? '#fef2f2' : profileComplete < 80 ? '#fefce8' : '#f0fdf4',
                  }}
                >
                  {profileComplete < 50 ? 'Needs Work' : profileComplete < 80 ? 'Almost There' : profileComplete < 100 ? 'Nearly Complete' : 'Complete'}
                </span>
              </div>
              {profileComplete < 100 ? (
                <button onClick={onEditProfile} className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                  {profileComplete < 50 ? 'Set up your profile to unlock CV generation →' : 'Fill in missing details to improve your score →'}
                </button>
              ) : (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">All key sections filled in — you're ready to generate!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(card => (
          <button
            key={card.label}
            onClick={() => onNavigate(card.view)}
            className={`bg-gradient-to-br ${card.color} rounded-xl p-4 text-left hover:opacity-90 active:scale-95 transition-all`}
          >
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-xs text-white/70 font-medium mt-0.5">{card.label}</div>
          </button>
        ))}
      </div>

      {/* Application pipeline stats */}
      {trackedApps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Active pipeline</div>
            <div className="text-3xl font-bold text-[#1B2B4B] dark:text-zinc-100">{activeApps.length}</div>
            <div className="text-xs text-zinc-500 mt-0.5">open applications</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Interviews</div>
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{interviewCount}</div>
            <div className="text-xs text-zinc-500 mt-0.5">scheduled / pending</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Offers 🎉</div>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{offersCount}</div>
            <div className="text-xs text-zinc-500 mt-0.5">received</div>
          </div>
        </div>
      )}

      {/* Career Intelligence Panel */}
      {audit && userProfile?.workExperience && userProfile.workExperience.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">

          {/* Header */}
          <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Career Intelligence</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Instant deterministic analysis — no AI, always accurate</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* Career stage */}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/15 dark:border-[#C9A84C]/20 capitalize">
                  {audit.career_stage}
                </span>
                {/* Total experience */}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  {Math.round(audit.total_experience_months / 12)}yr exp
                </span>
              </div>
            </div>

            {/* Signal badges row */}
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

          <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
            {/* Priority focus banner — single most important action */}
            {audit.recommendations.length > 0 && (() => {
              const ORDER = ['critical', 'high', 'medium', 'low'];
              const top = [...audit.recommendations].sort(
                (a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority)
              )[0];
              const cfg = PRIORITY_CONFIG[top.priority] ?? PRIORITY_CONFIG.low;
              const action = resolveRecAction(top.targetView, onNavigate, onEditProfile);
              return (
                <div className={`flex flex-wrap sm:flex-nowrap items-center gap-3 px-3 sm:px-4 py-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                  <span className="text-lg flex-shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-0.5">Your biggest opportunity</p>
                    <p className={`text-xs font-bold leading-tight ${cfg.color}`}>{top.title}</p>
                  </div>
                  {action && (
                    <button
                      onClick={action}
                      className={`text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg border ${cfg.border} ${cfg.color} hover:opacity-80 transition-opacity whitespace-nowrap`}
                    >
                      {top.action} →
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Score rings — 5 quality signals */}
            <div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
            </div>

            {/* Context note — prevent score-chasing */}
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
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left group ${cfg.border} ${cfg.bg} ${action ? 'hover:shadow-sm cursor-pointer' : 'cursor-default opacity-80'}`}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-bold leading-tight ${cfg.color}`}>{rec.title}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{rec.detail}</div>
                      </div>
                      {action && (
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] whitespace-nowrap flex-shrink-0 mt-1 transition-colors">
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
      )}

      {/* Recent CVs + Next Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Recent CVs */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200">Recent CVs</h2>
            {savedCVs.length > 0 && (
              <button onClick={() => onNavigate('history')} className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
                View all →
              </button>
            )}
          </div>
          {recentCVs.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                <span className="text-2xl">📄</span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">No CVs saved yet</p>
              <button
                onClick={() => onNavigate('generator')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 transition-colors"
              >
                Generate your first CV ✨
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCVs.map(cv => (
                <button
                  key={cv.id}
                  onClick={() => onNavigate('history')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left group"
                >
                  <div className="w-8 h-10 rounded bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">CV</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                      {cv.name || 'Untitled CV'}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {cv.template ? `${cv.template} · ` : ''}{cv.createdAt ? navTimeAgo(cv.createdAt) : ''}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Next steps */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">Next steps</h2>
          {nextSteps.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">You're all set!</p>
              <p className="text-xs text-zinc-400 mt-1">Keep applying and track everything in the Job Tracker.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nextSteps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (step.isDrive) onConnectDrive();
                    else if (step.isProfile) onEditProfile();
                    else if (step.view) onNavigate(step.view);
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:border-[#C9A84C]/50 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-all text-left group"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-[#C9A84C]/40 group-hover:border-[#C9A84C] flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                    <span className="text-[9px] font-bold text-[#C9A84C]">{i + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{step.label}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{step.action}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Quick actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {quickActions.map(a => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.view)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-[#1B2B4B]/40 dark:hover:border-[#C9A84C]/40 hover:shadow-sm transition-all text-center group"
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 leading-tight">{a.label}</span>
              <span className="text-[10px] text-zinc-400 leading-tight hidden sm:block">{a.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Profiles row */}
      {profiles.length > 1 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">Your profiles ({profiles.length})</h2>
          <div className="flex flex-wrap gap-2">
            {profiles.map(p => (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${p.id === activeSlot?.id ? 'bg-[#1B2B4B] text-white border-[#1B2B4B]' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'}`}>
                <span>{p.name || 'Profile'}</span>
                {p.id === activeSlot?.id && <span className="text-[10px] opacity-70">active</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;
