import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  UserProfile, CVData, SavedCV, SavedCoverLetter, ApiSettings, TrackedApplication,
  UserProfileSlot, ProfileColor, SavedMerge, STARStory,
} from './types';
import { useStorage } from './hooks/useStorage';
import * as KeyVault from './services/security/KeyVault';
import { setRuntimeKeys } from './services/security/RuntimeKeys';
import { invalidateCVCache } from './services/geminiService';
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
import DriveConflictModal from './components/DriveConflictModal';
import AutoSaveIndicator from './components/AutoSaveIndicator';
import OfflineBanner from './components/OfflineBanner';
import LinkedInGenerator from './components/LinkedInGenerator';
import InterviewPrep from './components/InterviewPrep';
import AdminLeaksPage from './components/AdminLeaksPage';
import AdminCVEnginePage from './components/AdminCVEnginePage';
import { useAutoSave } from './hooks/useAutoSave';
import { useAutoSync } from './hooks/useAutoSync';
import {
  Edit, User, List, Settings, FileText, Target,
  Moon, Sun, BookOpen, Globe, Briefcase,
} from './components/icons';
import { isCVEngineConfigured } from './services/cvEngineClient';

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

const LinkedInNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const InterviewNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <line x1="8" x2="16" y1="22" y2="22" />
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
    indigo: 'bg-[#1B2B4B]', violet: 'bg-violet-600', emerald: 'bg-emerald-500',
    amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500',
  };
  return map[c];
}

// ── Inner app ───────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const { user, isAuthenticated } = useGoogleAuth();
  const saveStatus = useAutoSave();
  useAutoSync(isAuthenticated);

  // ── Multi-profile storage ──────────────────────────────────────────────
  const [profiles, setProfiles] = useStorage<UserProfileSlot[]>('profiles', []);
  const [activeProfileId, setActiveProfileId] = useStorage<string | null>('activeProfileId', null);

  // ── Derive active user profile from slot ──────────────────────────────
  const activeSlot = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId]
  );
  const userProfile: UserProfile | null = activeSlot?.profile ?? null;

  // Wrap setUserProfile so it writes back into the active slot.
  // Also clears the CV cache so the next generation uses the updated profile.
  const setUserProfile = useCallback((next: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => {
    if (!next) return;
    invalidateCVCache();
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.profile) : next;
      return { ...p, profile: resolved ?? p.profile };
    }));
  }, [activeSlot, setProfiles]);

  // ── currentCV is stored per-profile inside the slot ───────────────────
  // Derive the current CV directly from the active slot so switching profiles
  // automatically shows that profile's CV (or nothing for a brand-new profile).
  const currentCV: CVData | null = activeSlot?.currentCV ?? null;

  const setCurrentCV = useCallback((next: CVData | null | ((prev: CVData | null) => CVData | null)) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.currentCV ?? null) : next;
      return { ...p, currentCV: resolved };
    }));
  }, [activeSlot, setProfiles]);

  // One-time migration: move any existing global currentCV into the active slot
  useEffect(() => {
    if (!activeSlot) return;
    if (activeSlot.currentCV !== undefined) return; // already migrated
    try {
      const raw = localStorage.getItem('cv_builder:currentCV') || localStorage.getItem('currentCV');
      if (raw) {
        const cv = JSON.parse(raw) as CVData;
        setProfiles(prev => prev.map(p =>
          p.id === activeSlot.id ? { ...p, currentCV: cv } : p
        ));
        localStorage.removeItem('cv_builder:currentCV');
        localStorage.removeItem('currentCV');
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // One-time migration: move global savedCVs/trackedApps/etc into the active slot
  useEffect(() => {
    if (!activeSlot) return;
    if (activeSlot.savedCVs !== undefined) return; // already initialised for this slot

    let savedCVsMig: SavedCV[] | undefined;
    let savedCLsMig: SavedCoverLetter[] | undefined;
    let trackedAppsMig: TrackedApplication[] | undefined;
    let starStoriesMig: STARStory[] | undefined;

    try { const r = localStorage.getItem('cv_builder:savedCVs') || localStorage.getItem('savedCVs'); if (r) savedCVsMig = JSON.parse(r); } catch {}
    try { const r = localStorage.getItem('cv_builder:savedCoverLetters') || localStorage.getItem('savedCoverLetters'); if (r) savedCLsMig = JSON.parse(r); } catch {}
    try { const r = localStorage.getItem('cv_builder:trackedApps') || localStorage.getItem('trackedApps'); if (r) trackedAppsMig = JSON.parse(r); } catch {}
    try { const r = localStorage.getItem('cv_builder:starStories') || localStorage.getItem('starStories'); if (r) starStoriesMig = JSON.parse(r); } catch {}

    setProfiles(prev => prev.map(p =>
      p.id === activeSlot.id ? {
        ...p,
        savedCVs: savedCVsMig ?? [],
        savedCoverLetters: savedCLsMig ?? [],
        trackedApps: trackedAppsMig ?? [],
        starStories: starStoriesMig ?? [],
      } : p
    ));

    // Clear global keys so they don't get migrated to other profiles
    ['cv_builder:savedCVs','savedCVs','cv_builder:savedCoverLetters','savedCoverLetters',
     'cv_builder:trackedApps','trackedApps','cv_builder:starStories','starStories']
      .forEach(k => localStorage.removeItem(k));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // ── Per-profile isolated state (each profile has its own data) ────────
  // Derived from the active slot — switching profiles gives a clean slate.
  const savedCVs: SavedCV[] = activeSlot?.savedCVs ?? [];
  const setSavedCVs = useCallback((next: SavedCV[] | ((prev: SavedCV[]) => SavedCV[])) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.savedCVs ?? []) : next;
      return { ...p, savedCVs: resolved };
    }));
  }, [activeSlot, setProfiles]);

  const savedCoverLetters: SavedCoverLetter[] = activeSlot?.savedCoverLetters ?? [];
  const setSavedCoverLetters = useCallback((next: SavedCoverLetter[] | ((prev: SavedCoverLetter[]) => SavedCoverLetter[])) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.savedCoverLetters ?? []) : next;
      return { ...p, savedCoverLetters: resolved };
    }));
  }, [activeSlot, setProfiles]);

  const trackedApps: TrackedApplication[] = activeSlot?.trackedApps ?? [];
  const setTrackedApps = useCallback((next: TrackedApplication[] | ((prev: TrackedApplication[]) => TrackedApplication[])) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.trackedApps ?? []) : next;
      return { ...p, trackedApps: resolved };
    }));
  }, [activeSlot, setProfiles]);

  const starStories: STARStory[] = activeSlot?.starStories ?? [];
  const setStarStories = useCallback((next: STARStory[] | ((prev: STARStory[]) => STARStory[])) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeSlot?.id ?? null)) return p;
      const resolved = typeof next === 'function' ? next(p.starStories ?? []) : next;
      return { ...p, starStories: resolved };
    }));
  }, [activeSlot, setProfiles]);
  // rawApiSettings holds the encrypted blob from storage; apiSettings is the decrypted in-memory copy.
  const [rawApiSettings, setRawApiSettings] = useStorage<ApiSettings>('apiSettings', { provider: 'gemini', apiKey: null });
  const [apiSettings, setApiSettings] = useState<ApiSettings>({ provider: 'gemini', apiKey: null });
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const profileManagerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Email apply pre-fill state (set by CV Generator)
  const [emailJd, setEmailJd] = useState<string>('');

  // Interview prep pre-fill state (set by CV Generator)
  const [interviewPrepJd, setInterviewPrepJd] = useState<string>('');

  // Toolkit → Generator feedback loop
  const [toolkitSuggestions, setToolkitSuggestions] = useState<string | null>(null);

  // Detect mobile for ProfileManager overlay
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // KeyVault: init once, then decrypt rawApiSettings → apiSettings + RuntimeKeys
  useEffect(() => {
    let cancelled = false;
    KeyVault.init().then(async () => {
      try {
        const decrypted = await KeyVault.decryptApiSettings(rawApiSettings as Record<string, unknown>);
        if (!cancelled) {
          const s = decrypted as ApiSettings;
          setApiSettings(s);
          setRuntimeKeys({
            apiKey:          s.apiKey              ?? null,
            groqApiKey:      s.groqApiKey          ?? null,
            cerebrasApiKey:  (s as any).cerebrasApiKey ?? null,
            claudeApiKey:    (s as any).claudeApiKey   ?? null,
            tavilyApiKey:    (s as any).tavilyApiKey   ?? null,
            brevoApiKey:     (s as any).brevoApiKey    ?? null,
            jsearchApiKey:   (s as any).jsearchApiKey  ?? null,
          });
        }
      } catch {
        if (!cancelled) setApiSettings(rawApiSettings);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawApiSettings)]);

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

  // ── Storage quota warning toast ──────────────────────────────────────────
  useEffect(() => {
    const handleQuota = () => {
      toast.warning(
        'Storage Almost Full',
        'Your browser storage is nearly full. Some temporary job search cache was removed. Consider clearing unused data or enabling Google Drive sync.',
      );
    };
    window.addEventListener('storage-quota-warning', handleQuota);
    return () => window.removeEventListener('storage-quota-warning', handleQuota);
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

  // Close More menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

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

  // ── API settings save: encrypt before persisting ──────────────────────
  const handleApiSettingsSave = useCallback(async (plaintext: ApiSettings) => {
    try {
      await KeyVault.init();
      const encrypted = await KeyVault.encryptApiSettings(plaintext as Record<string, unknown>);
      setRawApiSettings(encrypted as unknown as ApiSettings);
      setApiSettings(plaintext);
      setRuntimeKeys({
        apiKey:          plaintext.apiKey                    ?? null,
        groqApiKey:      plaintext.groqApiKey                ?? null,
        cerebrasApiKey:  (plaintext as any).cerebrasApiKey  ?? null,
        claudeApiKey:    (plaintext as any).claudeApiKey    ?? null,
        tavilyApiKey:    (plaintext as any).tavilyApiKey    ?? null,
        brevoApiKey:     (plaintext as any).brevoApiKey     ?? null,
        jsearchApiKey:   (plaintext as any).jsearchApiKey   ?? null,
      });
    } catch {
      // Fallback: save without encryption rather than silently fail
      setRawApiSettings(plaintext);
      setApiSettings(plaintext);
    }
  }, [setRawApiSettings]);

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

    // Immediately sync profile fields into the current CV so the preview
    // reflects changes without requiring a full regeneration.
    setCurrentCV(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        // Keep AI-generated text but refresh optional/user-controlled data
        skills: profile.skills.length > 0 ? profile.skills : prev.skills,
        projects: profile.projects && profile.projects.length > 0
          ? profile.projects
              .filter(p => p.name.trim())
              .map(p => ({ name: p.name, description: p.description, link: p.link }))
          : prev.projects,
        languages: profile.languages && profile.languages.length > 0
          ? profile.languages
              .filter(l => l.name.trim())
              .map(l => ({ name: l.name, proficiency: l.proficiency }))
          : prev.languages,
        references: profile.references && profile.references.length > 0
          ? profile.references
              .filter(r => r.name.trim())
              .map(r => ({
                name: r.name,
                title: r.title,
                company: r.company,
                email: r.email,
                phone: r.phone,
                relationship: r.relationship,
              }))
          : prev.references,
        customSections: (profile.customSections || []).filter(
          s => s.items.some(i => i.title.trim().length > 0)
        ),
        sectionOrder: profile.sectionOrder,
      };
    });
  }, [activeSlot, setUserProfile, setProfiles, setActiveProfileId, setCurrentCV]);

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

  const handleSaveCVFromPipeline = useCallback((cvData: CVData, name: string) => {
    const newSavedCV: SavedCV = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      data: cvData,
      purpose: 'job',
    };
    setSavedCVs(prev => [newSavedCV, ...prev]);
    toast.success('CV Saved!', `"${name}" saved to your CV library.`);
  }, [setSavedCVs, toast]);

  const handleSaveCoverLetter = useCallback((text: string, name: string) => {
    const newCL: SavedCoverLetter = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      text,
    };
    setSavedCoverLetters(prev => [newCL, ...prev]);
    toast.success('Cover Letter Saved!', `"${name}" saved to your library.`);
  }, [setSavedCoverLetters, toast]);

  const deleteCVTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDeleteCV = useCallback((id: string) => {
    const cvToDelete = savedCVs.find(cv => cv.id === id);
    if (!cvToDelete) return;
    // Optimistically remove immediately
    setSavedCVs(prev => prev.filter(cv => cv.id !== id));
    // Show undo toast
    if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
    toast.info(
      'CV Deleted',
      `"${cvToDelete.name}" removed.`,
      () => {
        // Undo: restore the CV
        if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
        setSavedCVs(prev => [cvToDelete, ...prev]);
        toast.success('Restored', `"${cvToDelete.name}" has been restored.`);
      }
    );
    // After 6 seconds the deletion is final — nothing to do since it's already removed from state
    deleteCVTimerRef.current = setTimeout(() => {
      deleteCVTimerRef.current = null;
    }, 6000);
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

  // Wire CV Generator → Interview Prep
  const handleGoToInterviewPrep = useCallback((jd: string) => {
    setInterviewPrepJd(jd);
    setCurrentView('interview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Interview Prep Ready', 'JD pre-filled — generating tailored questions.');
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

  const [currentView, setCurrentView] = useState<'generator' | 'linkedin' | 'interview' | 'jobs' | 'essays' | 'history' | 'tracker' | 'toolkit' | 'email' | 'merger' | 'negotiation' | 'scanner' | 'analytics' | 'admin-leaks' | 'admin-cv-engine'>('generator');

  // Admin routes — accessible at #admin/leaks and #admin/cv-engine. Hidden
  // from the main nav so they don't clutter the user-facing UI; these are
  // internal dashboards for managing the engine database and AI leaks.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#admin/leaks') setCurrentView('admin-leaks');
      else if (window.location.hash === '#admin/cv-engine') setCurrentView('admin-cv-engine');
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const [sharedCVPayload, setSharedCVPayload] = useState<SharedCVPayload | null>(null);

  const profileExists = useMemo(() => userProfile !== null && profiles.length > 0, [userProfile, profiles]);
  const apiKeySet = useMemo(() =>
    isCVEngineConfigured() || !!(apiSettings?.groqApiKey || apiSettings?.apiKey || apiSettings?.cerebrasApiKey),
  [apiSettings]);
  const tavilyApiKey = useMemo(() => apiSettings?.tavilyApiKey || null, [apiSettings]);
  const brevoApiKey = useMemo(() => apiSettings?.brevoApiKey || null, [apiSettings]);
  const jsearchApiKey = useMemo(() => apiSettings?.jsearchApiKey || null, [apiSettings]);

  const primaryNav = [
    { id: 'generator', label: 'CV Generator', icon: FileText },
    { id: 'linkedin', label: 'LinkedIn', icon: LinkedInNavIcon },
    { id: 'interview', label: 'Interview Prep', icon: InterviewNavIcon },
    { id: 'jobs', label: 'Job Board', icon: Globe },
  ];

  const moreNavGroups = [
    {
      label: 'Apply',
      items: [
        { id: 'email', label: 'Email Apply', icon: MailIcon },
        { id: 'negotiation', label: 'Salary Negotiation', icon: NegotiationNavIcon },
        { id: 'essays', label: 'Scholarship', icon: BookOpen },
      ],
    },
    {
      label: 'Tools',
      items: [
        { id: 'toolkit', label: 'CV Toolkit', icon: Briefcase },
        { id: 'scanner', label: 'Portal Scanner', icon: ScannerNavIcon },
        { id: 'merger', label: 'PDF Tools', icon: MergeNavIcon },
      ],
    },
    {
      label: 'Track',
      items: [
        { id: 'history', label: 'CV History', icon: List },
        { id: 'tracker', label: 'Job Tracker', icon: Target },
        { id: 'analytics', label: 'Analytics', icon: AnalyticsNavIcon },
      ],
    },
  ];

  const allMoreItems = moreNavGroups.flatMap(g => g.items);
  const isMoreActive = allMoreItems.some(item => item.id === currentView);

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
          coverLetterText={sharedCVPayload.coverLetterText}
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
      <OfflineBanner />
      <header className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20 shadow-sm">
        {/* ── Row 1: Logo + Controls ──────────────────────────────────── */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-between items-center gap-3">
          <button
            onClick={() => setShowLanding(true)}
            className="flex items-center gap-2.5 group flex-shrink-0"
            title="Back to homepage"
          >
            <div className="p-1.5 bg-[#1B2B4B] group-hover:bg-[#152238] rounded-lg transition-colors">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 leading-none" style={{fontFamily: "'Playfair Display', serif"}}>ProCV</h1>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5 hidden sm:block">Your Personal Career Consultant</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-[#C9A84C]/30 ml-1" />
          </button>

          <div className="flex items-center gap-2">
            {/* ── Profile switcher ───────────────────────────── */}
            {profileExists && (
              <div className="relative" ref={profileManagerRef}>
                <button
                  onClick={() => setShowProfileManager(v => !v)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 text-sm font-bold rounded-xl border transition-all ${showProfileManager ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'}`}
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

            <AutoSaveIndicator status={saveStatus} />

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
                    <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full ring-1 ring-[#C9A84C] shadow-sm" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#1B2B4B] flex items-center justify-center text-[10px] text-white font-bold">{user.name.charAt(0)}</div>
                  )}
                  <span className="text-xs font-bold hidden lg:inline-block max-w-[80px] truncate">{user.name.split(' ')[0]}</span>
                  <Settings className="h-4 w-4 text-zinc-400 group-hover:rotate-45 transition-transform" />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-tighter text-[#1B2B4B] dark:text-[#C9A84C]">Cloud Sync</span>
                  <Settings className="h-4 w-4 group-hover:rotate-45 transition-transform" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* ── Row 2: Responsive Nav ───────────────────────────────────── */}
        {profileExists && !isEditingProfile && (
          <div className="border-t border-zinc-200 dark:border-neutral-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">

              {/* ── Desktop nav ── */}
              <div className="hidden sm:flex items-center gap-0.5 py-1">
                {primaryNav.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setCurrentView(item.id as any); setShowMoreMenu(false); }}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                      currentView === item.id
                        ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C] border-b-2 border-[#C9A84C]'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800 border-b-2 border-transparent'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}

                {/* ── More dropdown ── */}
                <div className="relative ml-1" ref={moreMenuRef}>
                  <button
                    onClick={() => setShowMoreMenu(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                      isMoreActive || showMoreMenu
                        ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span>More</span>
                    <svg className={`h-3 w-3 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="m6 9 6 6 6-6" /></svg>
                  </button>

                  {showMoreMenu && (
                    <div className="animate-nav-slide-down absolute left-0 top-full mt-1 w-64 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-neutral-700 p-2 z-50">
                      {moreNavGroups.map(group => (
                        <div key={group.label} className="mb-1 last:mb-0">
                          <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{group.label}</p>
                          {group.items.map(item => (
                            <button
                              key={item.id}
                              onClick={() => { setCurrentView(item.id as any); setShowMoreMenu(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                                currentView === item.id
                                  ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
                              }`}
                            >
                              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Mobile nav: hamburger + slide-down ── */}
              <div className="sm:hidden flex items-center justify-between py-1.5">
                <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
                  {primaryNav.slice(0, 3).map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setCurrentView(item.id as any); setShowMobileMenu(false); }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                        currentView === item.id
                          ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <item.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowMobileMenu(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ml-1 ${
                    showMobileMenu || (currentView === 'jobs') || isMoreActive
                      ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
              </div>

              {/* ── Mobile slide-down full menu ── */}
              {showMobileMenu && (
                <div className="animate-mobile-menu sm:hidden pb-3 border-t border-zinc-100 dark:border-neutral-700 pt-2">
                  {/* Job Board (4th primary item that doesn't fit) */}
                  <div className="mb-2">
                    {[primaryNav[3]].map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setCurrentView(item.id as any); setShowMobileMenu(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                          currentView === item.id
                            ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {moreNavGroups.map(group => (
                    <div key={group.label} className="mb-1">
                      <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{group.label}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {group.items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => { setCurrentView(item.id as any); setShowMobileMenu(false); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                              currentView === item.id
                                ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
                            }`}
                          >
                            <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                      <h2 className="text-lg font-bold flex items-center gap-3"><User className="h-5 w-5 text-[#C9A84C]" /> Profile</h2>
                      <button onClick={() => setIsEditingProfile(true)} className="text-[#1B2B4B] hover:underline text-xs font-bold uppercase tracking-wider">Edit</button>
                    </div>
                    <div className="space-y-3">

                      {/* Profiles mini-list */}
                      <div className="space-y-1">
                        {profiles.slice(0, 3).map(slot => (
                          <div
                            key={slot.id}
                            onClick={() => handleSwitchProfile(slot)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${slot.id === activeSlot?.id ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/10' : 'hover:bg-zinc-50 dark:hover:bg-neutral-700/50'}`}
                          >
                            <div className={`w-5 h-5 rounded-full ${colorBg(slot.color)} flex-shrink-0 flex items-center justify-center text-[9px] text-white font-bold`}>
                              {(slot.profile.personalInfo.name || slot.name).charAt(0).toUpperCase()}
                            </div>
                            <span className={`text-xs font-semibold truncate ${slot.id === activeSlot?.id ? 'text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'text-zinc-600 dark:text-zinc-400'}`}>{slot.name}</span>
                            {slot.id === activeSlot?.id && <span className="ml-auto text-[9px] font-extrabold text-[#C9A84C] uppercase">active</span>}
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
                      <h2 className="text-base font-bold flex items-center gap-2"><Target className="h-4 w-4 text-[#C9A84C]" /> Recent Activity</h2>
                      <span className="text-xs font-semibold text-zinc-400">{trackedApps.length} total</span>
                    </div>
                    {trackedApps.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 flex items-center justify-center mx-auto mb-3">
                          <Target className="h-5 w-5 text-[#C9A84C]" />
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
                    <button onClick={() => setCurrentView('tracker')} className="w-full mt-4 text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] py-2.5 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-lg hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/10 transition-colors flex items-center justify-center gap-1.5">
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
                  <h2 className="text-sm font-bold flex items-center gap-2"><Target className="h-4 w-4 text-[#C9A84C]" /> Recent Activity</h2>
                  <button onClick={() => setCurrentView('tracker')} className="text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline">View All</button>
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
                onProfileImported={handleWordProfileImported}
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
                    onGoToInterviewPrep={handleGoToInterviewPrep}
                    savedCVs={savedCVs}
                    toolkitSuggestions={toolkitSuggestions}
                    onDismissToolkitSuggestions={() => setToolkitSuggestions(null)}
                    onSaveStories={handleSaveStories}
                  />
                )}
                {currentView === 'linkedin' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <LinkedInGenerator
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                )}
                {currentView === 'interview' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <InterviewPrep
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                      initialJd={interviewPrepJd}
                    />
                  </div>
                )}
                {currentView === 'essays' && <ScholarshipEssayWriter userProfile={userProfile!} apiKeySet={apiKeySet} openSettings={() => setIsSettingsOpen(true)} />}
                {currentView === 'history' && <CVHistory savedCVs={savedCVs} onLoad={(cv) => { handleLoadCV(cv); setCurrentView('generator'); }} onDelete={handleDeleteCV} userProfile={userProfile!} />}
                {currentView === 'jobs' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <JobBoard
                      tavilyApiKey={tavilyApiKey}
                      jsearchApiKey={jsearchApiKey}
                      apiKeySet={apiKeySet}
                      userProfile={userProfile!}
                      openSettings={() => setIsSettingsOpen(true)}
                      onJobApplied={handleAutoTrack}
                      onSaveCVFromPipeline={handleSaveCVFromPipeline}
                      onSaveCoverLetter={handleSaveCoverLetter}
                      savedCVs={savedCVs}
                    />
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
                  <div className="rounded-2xl border border-zinc-200 dark:border-neutral-800 overflow-hidden">
                    <PortalScanner
                      tavilyApiKey={tavilyApiKey}
                      openSettings={() => setIsSettingsOpen(true)}
                      darkMode={!!darkMode}
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
                {currentView === 'admin-leaks' && (
                  <div className="bg-slate-900 rounded-2xl border border-slate-800">
                    <AdminLeaksPage />
                  </div>
                )}
                {currentView === 'admin-cv-engine' && (
                  <div className="bg-slate-900 rounded-2xl border border-slate-800">
                    <AdminCVEnginePage />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={handleApiSettingsSave} currentApiSettings={apiSettings} />
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

      {/* ── Google Drive conflict resolution modal ── */}
      <DriveConflictModal
        onResolved={(key, action) => {
          if (action === 'overwrite') {
            toast.success('Conflict Resolved', `Your local version of "${key}" was pushed to Drive.`);
          } else if (action === 'pull') {
            toast.success('Conflict Resolved', `Drive version of "${key}" loaded — refreshing data.`);
          }
        }}
      />
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