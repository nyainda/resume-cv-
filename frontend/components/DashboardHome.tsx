import React, { useMemo } from 'react';
import type { UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication } from '../types';
import { navTimeAgo } from '../utils/profileUtils';

interface Props {
  profiles: UserProfileSlot[];
  activeSlot: UserProfileSlot | null;
  isAuthenticated: boolean;
  driveConnected: boolean;
  onNavigate: (view: string) => void;
  onConnectDrive: () => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
}

const DashboardHome: React.FC<Props> = ({
  profiles,
  activeSlot,
  isAuthenticated,
  driveConnected,
  onNavigate,
  onConnectDrive,
  onEditProfile,
  onOpenSettings,
}) => {
  const savedCVs: SavedCV[] = activeSlot?.savedCVs ?? [];
  const savedCLs: SavedCoverLetter[] = activeSlot?.savedCoverLetters ?? [];
  const trackedApps: TrackedApplication[] = activeSlot?.trackedApps ?? [];
  const starStories = (activeSlot as any)?.starStories ?? [];

  const recentCVs = useMemo(() => [...savedCVs].sort((a, b) =>
    new Date(b.savedAt ?? 0).getTime() - new Date(a.savedAt ?? 0).getTime()
  ).slice(0, 4), [savedCVs]);

  const activeApps = trackedApps.filter(a => !['Rejected', 'Withdrawn', 'Accepted'].includes(a.status ?? ''));
  const offersCount = trackedApps.filter(a => a.status === 'Offer').length;
  const interviewCount = trackedApps.filter(a => a.status === 'Interview').length;

  const profileComplete = useMemo(() => {
    const p = activeSlot?.profile;
    if (!p) return 0;
    const checks = [
      !!p.personalInfo?.name,
      !!p.personalInfo?.email,
      !!p.summary,
      (p.experience?.length ?? 0) > 0,
      (p.education?.length ?? 0) > 0,
      (p.skills?.length ?? 0) > 0,
      !!p.personalInfo?.location,
      !!p.personalInfo?.linkedin || !!p.personalInfo?.github,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [activeSlot]);

  const nextSteps = useMemo(() => {
    const steps: { label: string; action: string; view?: string; cta?: () => void }[] = [];
    if (!activeSlot?.profile?.personalInfo?.name) steps.push({ label: 'Complete your profile', action: 'Set up your profile to unlock AI generation', view: 'profile' });
    if (savedCVs.length === 0) steps.push({ label: 'Generate your first CV', action: 'Pick a template and let AI build your CV', view: 'generator' });
    if (!isAuthenticated) steps.push({ label: 'Sign in to sync across devices', action: 'Your data stays safe in the cloud', view: 'signin' });
    if (isAuthenticated && !driveConnected) steps.push({ label: 'Back up to Google Drive', action: 'One tap — your CVs are safe forever', view: 'drive' });
    if (savedCVs.length > 0 && trackedApps.length === 0) steps.push({ label: 'Track your job applications', action: 'Log applications and monitor your pipeline', view: 'tracker' });
    if (savedCVs.length > 0 && savedCLs.length === 0) steps.push({ label: 'Write a cover letter', action: 'AI-matched to your CV and target role', view: 'linkedin' });
    return steps.slice(0, 3);
  }, [activeSlot, savedCVs, savedCLs, trackedApps, isAuthenticated, driveConnected]);

  const statCards = [
    { label: 'CVs Saved', value: savedCVs.length, icon: '📄', view: 'history', color: 'from-[#1B2B4B] to-[#2d4272]' },
    { label: 'Cover Letters', value: savedCLs.length, icon: '✉️', view: 'linkedin', color: 'from-violet-700 to-violet-500' },
    { label: 'Applications', value: trackedApps.length, icon: '🎯', view: 'tracker', color: 'from-emerald-700 to-emerald-500' },
    { label: 'STAR Stories', value: starStories.length, icon: '⭐', view: 'interview', color: 'from-amber-700 to-amber-500' },
  ];

  const quickActions = [
    { label: 'Generate CV', icon: '✨', view: 'generator', desc: 'AI-powered, job-matched' },
    { label: 'Cover Letter', icon: '✉️', view: 'linkedin', desc: 'Written in seconds' },
    { label: 'Job Tracker', icon: '🎯', view: 'tracker', desc: 'Manage pipeline' },
    { label: 'Interview Prep', icon: '🎤', view: 'interview', desc: 'AI mock Q&A' },
    { label: 'ATS Score', icon: '📊', view: 'score', desc: 'Beat the robots' },
    { label: 'AI Toolkit', icon: '🛠', view: 'toolkit', desc: 'Polish & humanize' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header greeting */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2B4B] dark:text-zinc-100 font-['Playfair_Display',serif]">
            {activeSlot?.profile?.personalInfo?.name
              ? `Welcome back, ${activeSlot.profile.personalInfo.name.split(' ')[0]} 👋`
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

      {/* Profile completion bar */}
      {activeSlot && profileComplete < 100 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Profile strength</span>
            <span className="text-sm font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{profileComplete}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{
                width: `${profileComplete}%`,
                background: profileComplete < 50 ? '#ef4444' : profileComplete < 80 ? '#C9A84C' : '#16a34a'
              }}
            />
          </div>
          <button onClick={onEditProfile} className="mt-2 text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline">
            Complete your profile →
          </button>
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

      {/* Active pipeline & offers row */}
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

      {/* Main content — Recent CVs + Next Steps */}
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
                      {cv.jobTitle || cv.label || 'Untitled CV'}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {cv.template ? `${cv.template} · ` : ''}{cv.savedAt ? navTimeAgo(cv.savedAt) : ''}
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
                    if (step.view === 'drive') onConnectDrive();
                    else if (step.view === 'profile') onEditProfile();
                    else if (step.view !== 'signin') onNavigate(step.view!);
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
