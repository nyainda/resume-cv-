import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  UserProfile, CVData, SavedCV, ApiSettings, TrackedApplication,
  UserProfileSlot, ProfileColor, SavedMerge, STARStory,
} from './types';
import { useStorage } from './hooks/useStorage';
import { GoogleAuthProvider, useGoogleAuth } from './auth/GoogleAuthContext';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/Toast';
import ProfileForm from './components/ProfileForm';
import CVGenerator from './components/CVGenerator';
import SharedCVView from './components/SharedCVView';
import { decodeSharePayload, SharedCVPayload } from './components/ShareCVModal';
import SavedCVs from './components/SavedCVs';
import CVHistory from './components/CVHistory';
import ScholarshipEssayWriter from './components/ScholarshipEssayWriter';
import SettingsModal from './components/SettingsModal';
import Tracker from './components/Tracker';
import JobBoard from './components/JobBoard';
import CVToolkit from './components/CVToolkit';
import EmailApply from './components/EmailApply';
import PDFMerger from './components/PDFMerger';
import PDFTools from './components/PDFTools';
import { ProfileManager } from './components/ProfileManager';
import NegotiationCoach from './components/NegotiationCoach';
import PortalScanner from './components/PortalScanner';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import LandingPage from './components/LandingPage';
import {
  Edit, User, List, Settings, FileText, Target,
  Moon, Sun, BookOpen, Globe, Sparkles,
} from './components/icons';

// ── Mail icon (inline, no dep needed) ──────────────────────────────────────
const MailIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const MergeNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /><path d="M16 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" /><line x1="12" y1="2" x2="12" y2="22" /><path d="M9 9l3-3 3 3" /><path d="M9 15l3 3 3-3" />
  </svg>
);

const ScannerNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" />
  </svg>
);

const NegotiationNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const AnalyticsNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

// ── UsersIcon (for profile switcher) ───────────────────────────────────────
const UsersIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const PROFILE_COLORS: ProfileColor[] = ['indigo', 'violet', 'emerald', 'amber', 'rose', 'sky'];

function colorBg(c: ProfileColor) {
  const map: Record<ProfileColor, string> = {
    indigo: 'bg-indigo-600', violet: 'bg-violet-600', emerald: 'bg-emerald-500',
    amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500',
  };
  return map[c];
}

// ── Inner app ───────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const { user, isAuthenticated } = useGoogleAuth();

  // ── Multi-profile storage ──────────────────────────────────────────────
  const [profiles, setProfiles] = useStorage<UserProfileSlot[]>('profiles', []);
  const [activeProfileId, setActiveProfileId] = useStorage<string | null>('activeProfileId', null);

  // ── Derive active user profile from slot ──────────────────────────────
  const activeSlot = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId]
  );
  const userProfile: UserProfile | null = activeSlot?.profile ?? null;

  // Wrap setUserProfile so it writes back into the active slot
  const setUserProfile = useCallback((next: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => {
    if (!next) return;
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.profile) : next;
      return { ...p, profile: resolved ?? p.profile };
    }));
  }, [activeSlot, setProfiles]);

  // ── Other app-level state ───────────────────────────────────────────────
  const [savedCVs, setSavedCVs] = useStorage<SavedCV[]>('savedCVs', []);
  const [currentCV, setCurrentCV] = useStorage<CVData | null>('currentCV', null);
  const [trackedApps, setTrackedApps] = useStorage<TrackedApplication[]>('trackedApps', []);
  const [starStories, setStarStories] = useStorage<STARStory[]>('starStories', []);
  const [apiSettings, setApiSettings] = useStorage<ApiSettings>('apiSettings', { provider: 'gemini', apiKey: null });
  const [darkMode, setDarkMode] = useStorage<boolean>('darkMode', false);
  const [savedMerges, setSavedMerges] = useStorage<SavedMerge[]>('savedMerges', []);

  // Synchronously check localStorage to avoid flash-to-profile on refresh
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('cv_builder:profiles') || localStorage.getItem('profiles');
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });
  // Show landing page when no profile has ever been created
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('cv_builder:profiles') || localStorage.getItem('profiles');
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showProfileManager, setShowProfileManager] = useState(false);
  const profileManagerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Email apply pre-fill state (set by CV Generator)
  const [emailJd, setEmailJd] = useState<string>('');

  // Toolkit → Generator feedback loop
  const [toolkitSuggestions, setToolkitSuggestions] = useState<string | null>(null);

  // Detect mobile for ProfileManager overlay
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!darkMode);
  }, [darkMode]);

  // Drive save error notifications
  useEffect(() => {
    let lastErrorTime = 0;
    const handleDriveError = (e: Event) => {
      const now = Date.now();
      if (now - lastErrorTime < 15000) return; // throttle to once per 15s
      lastErrorTime = now;
      const detail = (e as CustomEvent).detail;
      const msg = detail?.error?.message || 'Unknown error';
      if (msg.includes('expired') || msg.includes('401')) {
        toast.error('Cloud Sync Failed', 'Your Google session expired. Please sign in again via Cloud Sync settings.');
      } else {
        toast.error('Cloud Sync Failed', 'Could not save to Google Drive. Check your connection and sign-in status.');
      }
    };
    window.addEventListener('drive-save-error', handleDriveError);
    return () => window.removeEventListener('drive-save-error', handleDriveError);
  }, [toast]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
      const encoded = hash.slice('#share='.length);
      const payload = decodeSharePayload(encoded);
      if (payload) {
        setSharedCVPayload(payload);
      }
    }
  }, []);

  // Close profile manager dropdown on outside click — desktop only.
  // On mobile the bottom-sheet has its own backdrop tap handler, so attaching a
  // global mousedown listener would immediately close the sheet whenever the user
  // taps any button inside it (because those elements are outside profileManagerRef).
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: MouseEvent) => {
      if (profileManagerRef.current && !profileManagerRef.current.contains(e.target as Node)) {
        setShowProfileManager(false);
      }
    };
    if (showProfileManager) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileManager, isMobile]);

  // ── Profile Manager handlers ───────────────────────────────────────────
  const handleProfileSave = useCallback((profile: UserProfile) => {
    if (activeSlot) {
      setUserProfile(profile);
      setIsEditingProfile(false);
    } else {
      // First-time: auto-create a slot
      const id = Date.now().toString();
      const slot: UserProfileSlot = {
        id,
        name: profile.personalInfo.name || 'My Profile',
        color: 'indigo',
        createdAt: new Date().toISOString(),
        profile,
      };
      setProfiles([slot]);
      setActiveProfileId(id);
      setIsEditingProfile(false);
    }
  }, [activeSlot, setUserProfile, setProfiles, setActiveProfileId]);

  const handleCreateProfile = useCallback((name: string, color: ProfileColor, cloneFrom?: UserProfile) => {
    const id = Date.now().toString();
    const emptyProfile: UserProfile = {
      personalInfo: { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
      summary: '',
      workExperience: [],
      education: [],
      skills: [],
      projects: [],
      languages: [],
    };
    const slot: UserProfileSlot = {
      id,
      name,
      color,
      createdAt: new Date().toISOString(),
      profile: cloneFrom ? { ...cloneFrom } : emptyProfile,
    };
    setProfiles(prev => [...prev, slot]);
    setActiveProfileId(id);
    setIsEditingProfile(!cloneFrom); // jump to edit if blank
    setShowProfileManager(false);
    toast.success('Profile Created', `"${name}" is now your active profile.`);
  }, [setProfiles, setActiveProfileId, toast]);

  const handleSwitchProfile = useCallback((slot: UserProfileSlot) => {
    setActiveProfileId(slot.id);
    setIsEditingProfile(false);
    setShowProfileManager(false);
    toast.success('Profile Switched', `Now using "${slot.name}".`);
  }, [setActiveProfileId, toast]);

  const handleDeleteProfile = useCallback((id: string) => {
    setProfiles(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activeProfileId === id && next.length > 0) setActiveProfileId(next[0].id);
      return next;
    });
    toast.success('Profile Deleted', 'Profile removed.');
  }, [setProfiles, activeProfileId, setActiveProfileId, toast]);

  const handleRenameProfile = useCallback((id: string, name: string, color: ProfileColor) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, name, color } : p));
    toast.success('Profile Updated', `Renamed to "${name}".`);
  }, [setProfiles, toast]);

  // ── CV handlers ─────────────────────────────────────────────────────────
  const handleSaveCV = (cvData: CVData, purpose: 'job' | 'academic' | 'general') => {
    const cvName = prompt(
      'Enter a name for this CV (e.g., Software Engineer - Google):',
      `CV for ${cvData.experience[0]?.jobTitle || 'New Role'}`
    );
    if (cvName) {
      const newSavedCV: SavedCV = {
        id: Date.now().toString(),
        name: cvName,
        createdAt: new Date().toISOString(),
        data: cvData,
        purpose,
      };
      setSavedCVs(prev => [newSavedCV, ...prev]);
      toast.success('CV Saved Successfully!', `"${cvName}" has been saved to your library.`);
    }
  };

  const handleDeleteCV = useCallback((id: string) => {
    const cvToDelete = savedCVs.find(cv => cv.id === id);
    if (window.confirm('Are you sure you want to delete this CV?')) {
      setSavedCVs(prev => prev.filter(cv => cv.id !== id));
      toast.success('CV Deleted', cvToDelete ? `"${cvToDelete.name}" has been removed.` : 'CV removed.');
    }
  }, [setSavedCVs, savedCVs, toast]);

  const handleSaveStories = useCallback((newStories: STARStory[]) => {
    setStarStories(prev => [...newStories, ...prev]);
    toast.success('Stories Saved!', `${newStories.length} STAR+R story added to your Interview Story Bank.`);
  }, [setStarStories, toast]);

  const handleLoadCV = useCallback((cvData: CVData) => {
    setCurrentCV(cvData);
    setIsEditingProfile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentCV]);

  const handleAutoTrack = useCallback((details: { roleTitle: string; company: string; savedCvName: string }) => {
    const newApp: TrackedApplication = {
      id: Date.now().toString(),
      savedCvId: 'auto-generated',
      savedCvName: details.savedCvName,
      roleTitle: details.roleTitle,
      company: details.company,
      status: 'Applied',
      dateApplied: new Date().toISOString().split('T')[0],
      notes: `Automatically tracked after CV download on ${new Date().toLocaleDateString()}.`,
    };
    setTrackedApps(prev => [newApp, ...prev]);
    toast.success('Application Tracked!', `Added "${details.roleTitle}" at ${details.company} to your tracker.`);
  }, [setTrackedApps, toast]);

  // Wire CV Generator → Email Apply
  const handleApplyViaEmail = useCallback((jd: string, _cv: CVData) => {
    setEmailJd(jd);
    setCurrentView('email');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Email Apply Ready', 'JD pre-filled — AI will compose your email.');
  }, [toast]);

  // Wire CV Toolkit → CV Generator (Fix & Regenerate / Go to Generator)
  const handleGoToGenerator = useCallback((extraInstructions?: string) => {
    setCurrentView('generator');
    if (extraInstructions) {
      setToolkitSuggestions(extraInstructions);
      toast.success('CV Toolkit Feedback Ready', 'Open the banner in the CV Generator to apply the fixes.');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [toast]);

  // Wire GitHub Import → CV Generator (AI-generated CV from repos)
  const handleGitHubCVGenerated = useCallback((cv: CVData) => {
    setCurrentCV(cv);
    setCurrentView('generator');
    toast.success('GitHub CV Ready!', 'Your AI-generated CV is loaded in the CV Generator — complete with real project links.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentCV, toast]);

  // Wire Word Import → Profile update
  const handleWordProfileImported = useCallback((profile: UserProfile) => {
    if (activeSlot) {
      setUserProfile(profile);
      toast.success('Profile Imported from Word!', 'Your CV data has been imported. Head to the CV Generator to apply a template.');
    } else {
      const id = Date.now().toString();
      const slot: UserProfileSlot = {
        id,
        name: profile.personalInfo.name || 'Imported Profile',
        color: 'violet',
        createdAt: new Date().toISOString(),
        profile,
      };
      setProfiles([slot]);
      setActiveProfileId(id);
      toast.success('Profile Imported!', 'Your Word CV has been imported. Edit your profile or go to the Generator.');
    }
  }, [activeSlot, setUserProfile, setProfiles, setActiveProfileId, toast]);

  const handleSaveMerge = useCallback((merge: SavedMerge) => {
    setSavedMerges(prev => [merge, ...prev]);
    toast.success('Merge Saved', `"${merge.name}" saved to your merge presets.`);
  }, [setSavedMerges, toast]);

  const handleDeleteMerge = useCallback((id: string) => {
    setSavedMerges(prev => prev.filter(m => m.id !== id));
    toast.success('Merge Deleted', 'Merge preset removed.');
  }, [setSavedMerges, toast]);

  const [currentView, setCurrentView] = useState<'generator' | 'essays' | 'history' | 'tracker' | 'jobs' | 'toolkit' | 'email' | 'merger' | 'negotiation' | 'scanner' | 'analytics'>('generator');
  const [sharedCVPayload, setSharedCVPayload] = useState<SharedCVPayload | null>(null);

  const profileExists = useMemo(() => userProfile !== null && profiles.length > 0, [userProfile, profiles]);
  const apiKeySet = useMemo(() => !!(apiSettings?.groqApiKey || apiSettings?.apiKey), [apiSettings]);
  const tavilyApiKey = useMemo(() => apiSettings?.tavilyApiKey || null, [apiSettings]);
  const brevoApiKey = useMemo(() => apiSettings?.brevoApiKey || null, [apiSettings]);
  const jsearchApiKey = useMemo(() => apiSettings?.jsearchApiKey || null, [apiSettings]);

  const navItems = [
    { id: 'generator', label: 'CV Generator', icon: FileText },
    { id: 'jobs', label: 'Job Board', icon: Globe },
    { id: 'scanner', label: 'Portal Scanner', icon: ScannerNavIcon },
    { id: 'toolkit', label: 'CV Toolkit', icon: Sparkles },
    { id: 'negotiation', label: 'Negotiation', icon: NegotiationNavIcon },
    { id: 'email', label: 'Email Apply', icon: MailIcon },
    { id: 'essays', label: 'Scholarship', icon: BookOpen },
    { id: 'history', label: 'CV History', icon: List },
    { id: 'tracker', label: 'Job Tracker', icon: Target },
    { id: 'analytics', label: 'Analytics', icon: AnalyticsNavIcon },
    { id: 'merger', label: 'PDF Tools', icon: MergeNavIcon },
  ];

  // ── Active slot color badge ────────────────────────────────────────────
  const slotColor = activeSlot?.color ?? 'indigo';

  // Hide landing once a profile is created
  useEffect(() => {
    if (profileExists) setShowLanding(false);
  }, [profileExists]);

  // Show landing page when requested (new users or navigated back)
  if (showLanding) {
    return (
      <LandingPage
        onGetStarted={() => setShowLanding(false)}
        darkMode={!!darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        hasProfile={profileExists}
        onGoToApp={() => setShowLanding(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      {sharedCVPayload && (
        <SharedCVView
          cvData={sharedCVPayload.cvData}
          personalInfo={sharedCVPayload.personalInfo}
          template={sharedCVPayload.template}
          sharedAt={sharedCVPayload.sharedAt}
          onLoadIntoEditor={userProfile ? (cvData) => {
            setCurrentCV(cvData);
            setCurrentView('generator');
          } : undefined}
          onDismiss={() => {
            setSharedCVPayload(null);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }}
        />
      )}
      <header className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20 shadow-sm">
        {/* ── Row 1: Logo + Controls ──────────────────────────────────── */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-between items-center gap-3">
          <button
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-2.5 group flex-shrink-0"
            title="Back to homepage"
          >
            <div className="p-1.5 bg-indigo-600 group-hover:bg-indigo-700 rounded-lg transition-colors">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 leading-none group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">AI CV Builder</h1>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5 hidden sm:block">Elite Career &amp; Scholarship Suite</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {/* ── Profile switcher ───────────────────────────── */}
            {profileExists && (
              <div className="relative" ref={profileManagerRef}>
                <button
                  onClick={() => setShowProfileManager(v => !v)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 text-sm font-bold rounded-xl border transition-all ${showProfileManager ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'}`}
                  title="Switch profile"
                >
                  <div className={`w-7 h-7 rounded-full ${colorBg(slotColor)} flex items-center justify-center text-[10px] text-white font-extrabold flex-shrink-0`}>
                    {(activeSlot?.profile.personalInfo.name || activeSlot?.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline max-w-[80px] truncate text-sm">{activeSlot?.name ?? 'Profile'}</span>
                  <UsersIcon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                </button>

                {/* Desktop dropdown (hidden on mobile — bottom sheet used instead) */}
                {showProfileManager && !isMobile && (
                  <div className="absolute right-0 top-full mt-2 w-[380px] bg-white dark:bg-neutral-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-zinc-200 dark:border-neutral-700 p-4 z-50 flex flex-col md:max-h-[70vh]">
                    <ProfileManager
                      profiles={profiles}
                      activeProfileId={activeSlot?.id ?? null}
                      onSwitch={handleSwitchProfile}
                      onCreate={handleCreateProfile}
                      onDelete={handleDeleteProfile}
                      onRename={handleRenameProfile}
                      currentProfile={userProfile}
                      onClose={() => setShowProfileManager(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {profileExists && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Edit Profile</span>
              </button>
            )}

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="group p-1.5 flex items-center gap-2 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-all border border-zinc-200 dark:border-neutral-700"
              aria-label="Settings"
            >
              {isAuthenticated && user ? (
                <div className="flex items-center gap-2 px-1">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full ring-1 ring-indigo-500 shadow-sm" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">{user.name.charAt(0)}</div>
                  )}
                  <span className="text-xs font-bold hidden lg:inline-block max-w-[80px] truncate">{user.name.split(' ')[0]}</span>
                  <Settings className="h-4 w-4 text-zinc-400 group-hover:rotate-45 transition-transform" />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-tighter text-indigo-600 dark:text-indigo-400">Cloud Sync</span>
                  <Settings className="h-4 w-4 group-hover:rotate-45 transition-transform" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* ── Row 2: Full-width Nav ───────────────────────────────────── */}
        {profileExists && !isEditingProfile && (
          <div className="border-t border-zinc-200 dark:border-neutral-800 overflow-x-auto no-scrollbar">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex gap-0.5 py-1">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id as any)}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                      currentView === item.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">

          {(!profileExists || isEditingProfile || currentView === 'generator') && (
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
              <div className="sticky top-24 space-y-4">
                {profileExists && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold flex items-center gap-3"><User className="h-5 w-5 text-indigo-500" /> Profile</h2>
                      <button onClick={() => setIsEditingProfile(true)} className="text-indigo-600 hover:underline text-xs font-bold uppercase tracking-wider">Edit</button>
                    </div>
                    <div className="space-y-3">

                      {/* Profiles mini-list */}
                      <div className="space-y-1">
                        {profiles.slice(0, 3).map(slot => (
                          <div
                            key={slot.id}
                            onClick={() => handleSwitchProfile(slot)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${slot.id === activeSlot?.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-zinc-50 dark:hover:bg-neutral-700/50'}`}
                          >
                            <div className={`w-5 h-5 rounded-full ${colorBg(slot.color)} flex-shrink-0 flex items-center justify-center text-[9px] text-white font-bold`}>
                              {(slot.profile.personalInfo.name || slot.name).charAt(0).toUpperCase()}
                            </div>
                            <span className={`text-xs font-semibold truncate ${slot.id === activeSlot?.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-400'}`}>{slot.name}</span>
                            {slot.id === activeSlot?.id && <span className="ml-auto text-[9px] font-extrabold text-indigo-500 uppercase">active</span>}
                          </div>
                        ))}
                        {profiles.length > 3 && (
                          <p className="text-[10px] text-zinc-400 pl-2">+{profiles.length - 3} more profiles</p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-zinc-100 dark:border-neutral-700">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Name</span>
                          <span className="text-sm font-semibold">{userProfile?.personalInfo.name}</span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                          <span>Skills</span>
                          <span className="font-bold text-zinc-700 dark:text-zinc-300">{userProfile?.skills.length}</span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Experience</span>
                          <span className="font-bold text-zinc-700 dark:text-zinc-300">{userProfile?.workExperience.length} roles</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentView === 'generator' && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold flex items-center gap-2"><Target className="h-4 w-4 text-indigo-500" /> Recent Activity</h2>
                      <span className="text-xs font-semibold text-zinc-400">{trackedApps.length} total</span>
                    </div>
                    {trackedApps.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto mb-3">
                          <Target className="h-5 w-5 text-indigo-400" />
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">No applications tracked yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {trackedApps.slice(0, 4).map(app => {
                          const statusColors: Record<string, string> = {
                            Wishlist: 'bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-400',
                            Applied: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                            Interviewing: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                            Offer: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
                            Rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
                          };
                          return (
                            <div key={app.id} onClick={() => setCurrentView('tracker')} className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 cursor-pointer">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{app.roleTitle}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[app.status] || statusColors.Applied}`}>{app.status}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => setCurrentView('tracker')} className="w-full mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 py-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> View All Applications
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )}

          {profileExists && !isEditingProfile && currentView === 'generator' && (
            <div className="lg:hidden col-span-1">
              <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Target className="h-4 w-4 text-indigo-500" /> Recent Activity</h2>
                  <button onClick={() => setCurrentView('tracker')} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">View All</button>
                </div>
                {trackedApps.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-3">No applications tracked yet.</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                    {trackedApps.slice(0, 6).map(app => (
                      <div key={app.id} onClick={() => setCurrentView('tracker')} className="flex-shrink-0 w-44 bg-white dark:bg-neutral-800 border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all border-zinc-200 dark:border-neutral-700">
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate mt-1">{app.roleTitle}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`${(!profileExists || isEditingProfile || currentView === 'generator') ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'}`}>
            {!profileExists || isEditingProfile ? (
              <ProfileForm
                existingProfile={userProfile}
                onSave={handleProfileSave}
                onCancel={() => profileExists && setIsEditingProfile(false)}
                apiKeySet={apiKeySet}
                openSettings={() => setIsSettingsOpen(true)}
              />
            ) : (
              <div className="space-y-6">
                {currentView === 'generator' && (
                  <CVGenerator
                    userProfile={userProfile!}
                    currentCV={currentCV}
                    setCurrentCV={setCurrentCV}
                    onSaveCV={handleSaveCV}
                    onAutoTrack={handleAutoTrack}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                    onApplyViaEmail={handleApplyViaEmail}
                    savedCVs={savedCVs}
                    toolkitSuggestions={toolkitSuggestions}
                    onDismissToolkitSuggestions={() => setToolkitSuggestions(null)}
                    onSaveStories={handleSaveStories}
                  />
                )}
                {currentView === 'essays' && <ScholarshipEssayWriter userProfile={userProfile!} apiKeySet={apiKeySet} openSettings={() => setIsSettingsOpen(true)} />}
                {currentView === 'history' && <CVHistory savedCVs={savedCVs} onLoad={(cv) => { handleLoadCV(cv); setCurrentView('generator'); }} onDelete={handleDeleteCV} userProfileName={userProfile!.personalInfo.name} />}
                {currentView === 'jobs' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <JobBoard tavilyApiKey={tavilyApiKey} jsearchApiKey={jsearchApiKey} apiKeySet={apiKeySet} userProfile={userProfile!} openSettings={() => setIsSettingsOpen(true)} onJobApplied={handleAutoTrack} />
                  </div>
                )}
                {currentView === 'toolkit' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <CVToolkit
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      tavilyApiKey={tavilyApiKey}
                      openSettings={() => setIsSettingsOpen(true)}
                      onGoToGenerator={handleGoToGenerator}
                      onProfileImported={handleWordProfileImported}
                      onGitHubCVGenerated={handleGitHubCVGenerated}
                    />
                  </div>
                )}
                {currentView === 'email' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-4 sm:p-6 lg:p-8">
                    <EmailApply
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                      currentCV={currentCV}
                      brevoApiKey={brevoApiKey}
                      initialJd={emailJd}
                    />
                  </div>
                )}
                {currentView === 'tracker' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <div className="mb-8">
                      <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Application Tracker</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Manage and track your job applications in one place.</p>
                    </div>
                    <Tracker trackedApps={trackedApps} setTrackedApps={setTrackedApps} savedCVs={savedCVs} starStories={starStories} setStarStories={setStarStories} />
                  </div>
                )}
                {currentView === 'merger' && (
                  <div className="space-y-6">
                    <PDFTools />
                    <details className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                      <summary className="px-6 py-4 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-700 flex items-center gap-2">
                        <span>📋</span> Advanced Merge (with saved CV layouts)
                      </summary>
                      <div className="p-4">
                        <PDFMerger
                          savedCVs={savedCVs}
                          userProfile={userProfile!}
                          savedMerges={savedMerges}
                          onSaveMerge={handleSaveMerge}
                          onDeleteMerge={handleDeleteMerge}
                        />
                      </div>
                    </details>
                  </div>
                )}
                {currentView === 'negotiation' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <NegotiationCoach
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                )}
                {currentView === 'scanner' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <PortalScanner
                      tavilyApiKey={tavilyApiKey}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                )}
                {currentView === 'analytics' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <AnalyticsDashboard
                      trackedApps={trackedApps}
                      onGoToTracker={() => setCurrentView('tracker')}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={setApiSettings} currentApiSettings={apiSettings} />
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* ── Mobile ProfileManager bottom-sheet ── */}
      {showProfileManager && isMobile && profileExists && (
        <ProfileManager
          isMobileOverlay
          profiles={profiles}
          activeProfileId={activeSlot?.id ?? null}
          onSwitch={handleSwitchProfile}
          onCreate={handleCreateProfile}
          onDelete={handleDeleteProfile}
          onRename={handleRenameProfile}
          currentProfile={userProfile}
          onClose={() => setShowProfileManager(false)}
        />
      )}
    </div>
  );
};

// ── Root App — wraps everything in GoogleAuthProvider ─────────────────────
const App: React.FC = () => (
  <GoogleAuthProvider>
    <AppInner />
  </GoogleAuthProvider>
);

export default App;