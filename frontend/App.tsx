import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  UserProfile,
  CVData,
  SavedCV,
  SavedCoverLetter,
  ApiSettings,
  TrackedApplication,
  UserProfileSlot,
  ProfileColor,
  STARStory,
} from "./types";
import { useStorage } from "./hooks/useStorage";
import * as KeyVault from "./services/security/KeyVault";
import { setRuntimeKeys } from "./services/security/RuntimeKeys";
import { invalidateCVCache, loadRules } from "./services/geminiService";
import { prewarmFontEmbedCache } from "./services/getCVHtml";
import { prefetchVersions as prefetchPromptVersions } from "./services/promptRegistryClient";
import { prefetchRuleConfigs } from "./services/ruleRegistryClient";
import { syncProfileToCache } from "./services/profileCacheClient";
import { syncSlot, syncPrefs, fetchUserData, deleteSlotFromCloud, getDeviceId } from "./services/userDataCloudService";
import { enqueueSlotSync, enqueuePrefsSync, flushSyncQueue, clearQueueForAccount, sanitiseStaleQueue } from "./services/storage/syncQueue";
import { clearAllBrowserStorage, rotateDeviceId, stampDeletedAccount } from "./utils/clearUserStorage";
import { auditCvQuality } from "./services/cvNumberFidelity";
import { profileToCV } from "./utils/profileToCV";
import {
  saveCVData,
  deleteCVData,
  preloadAllCVData,
  migrateToIDB,
  pruneOrphanedCVData,
} from "./services/storage/cvDataStore";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import type { WorkerUser, RawSlot } from "./services/authService";
import { drainPendingSlots } from "./services/authService";
import AuthModal from "./components/AuthModal";
import WelcomeModal from "./components/WelcomeModal";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/ui/Toast";
import ProfileForm from "./components/ProfileForm";
import CVGenerator from "./components/CVGenerator";
import PricingModal from "./components/PricingModal";
import FreePlanNudge from "./components/FreePlanNudge";
import SharedCVView from "./components/SharedCVView";
import { decodeSharePayload, SharedCVPayload } from "./components/ShareCVModal";
import { fetchSharePayload } from "./services/shareService";
import { fetchPublicProfile } from "./services/publicProfileService";
import SavedCVs from "./components/SavedCVs";
import CVHistory from "./components/CVHistory";
import ScholarshipEssayWriter from "./components/ScholarshipEssayWriter";
import SettingsModal from "./components/SettingsModal";
import InactivityWarningModal from "./components/InactivityWarningModal";
import Tracker from "./components/Tracker";
import CVToolkit from "./components/CVToolkit";
import EmailApply from "./components/EmailApply";
import { ProfileManager } from "./components/ProfileManager";
import NegotiationCoach from "./components/NegotiationCoach";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import LandingPage from "./components/LandingPage";
import AccountPage from "./components/AccountPage";

import DriveConflictModal from "./components/DriveConflictModal";
import { OnboardingWizard, hasCompletedOnboarding, type PendingImportType } from "./components/OnboardingWizard";
import { extractTextFromDocx, parseWordTextToProfile } from "./services/wordImportService";
import { generateProfileFromFileWithGemini } from "./services/geminiService";
import OfflineBanner from "./components/OfflineBanner";
import LinkedInGenerator from "./components/LinkedInGenerator";
import InterviewPrep from "./components/InterviewPrep";
import AdminLeaksPage from "./components/AdminLeaksPage";
import AdminCVEnginePage from "./components/AdminCVEnginePage";
import AdminApp from "./components/admin/AdminApp";
import StorageMapPage from "./components/StorageMapPage";
import ScoreMyCVPage from "./components/ScoreMyCVPage";
import CareerPivotPage from "./components/CareerPivotPage";
import { useAutoSync } from "./hooks/useAutoSync";
import { getDriveRouter, isDriveActive, migrateLocalToDrive } from "./services/storage/StorageRouter";
import { deleteAllDriveData } from "./services/storage/DriveStorageService";
import {
  Edit,
  User,
  List,
  Settings,
  FileText,
  Target,
  Moon,
  Sun,
  BookOpen,
  Briefcase,
} from "./components/icons";
import { isCVEngineConfigured } from "./services/cvEngineClient";
import { isPureFreeTier } from "./services/accountTierService";

// ── Mail icon (inline, no dep needed) ──────────────────────────────────────
const MailIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const PivotNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3l4 4-4 4" />
    <path d="M3 7h18" />
    <path d="M7 21l-4-4 4-4" />
    <path d="M21 17H3" />
  </svg>
);

const ScoreNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 17v-6" />
    <path d="M12 17v-4" />
    <path d="M16 17v-9" />
  </svg>
);

const LinkedInNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const InterviewNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <line x1="8" x2="16" y1="22" y2="22" />
  </svg>
);

const NegotiationNavIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const AnalyticsNavIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

// ── UsersIcon (for profile switcher) ───────────────────────────────────────
const UsersIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const PROFILE_COLORS: ProfileColor[] = [
  "indigo",
  "violet",
  "emerald",
  "amber",
  "rose",
  "sky",
];

function colorBg(c: ProfileColor) {
  const map: Record<ProfileColor, string> = {
    indigo: "bg-[#1B2B4B]",
    violet: "bg-violet-600",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
  };
  return map[c];
}

function navTimeAgo(iso?: string): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)        return "just now";
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Slot data parser ────────────────────────────────────────────────────────
// profile_json in D1 is either a plain UserProfile OR a full slotPayload:
//   { profile: UserProfile, savedCVs: [], savedCoverLetters: [], ... }
// syncSlot() stores the latter (all saved data) when payload ≤ 512KB,
// and falls back to profile-only when it's too large.
// This helper detects which shape arrived and unpacks both correctly.
function parseSlotData(s: RawSlot | { slot_id: string; slot_name: string; color: string; profile_json: string }): UserProfileSlot | null {
    try {
        const parsed = JSON.parse(s.profile_json);
        if (!parsed || typeof parsed !== 'object') return null;
        const isPayload = 'profile' in parsed && ('savedCVs' in parsed || 'savedCoverLetters' in parsed);
        return {
            id:                s.slot_id,
            name:              s.slot_name,
            color:             s.color ?? 'indigo',
            profile:           isPayload ? (parsed.profile ?? {}) : parsed,
            savedCVs:          isPayload ? (parsed.savedCVs          ?? []) : [],
            savedCoverLetters: isPayload ? (parsed.savedCoverLetters ?? []) : [],
            trackedApps:       isPayload ? (parsed.trackedApps       ?? []) : [],
            starStories:       isPayload ? (parsed.starStories       ?? []) : [],
        } as UserProfileSlot;
    } catch {
        return null;
    }
}

// ── Inner app ───────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    authModalOpen,
    onAuthSuccess: _rawOnAuthSuccess,
    dismissAuth: onAuthDismiss,
    showSignIn,
    signOut,
    requireAuth,
    isNewUser,
    clearNewUser,
    deleteAccount: _deleteAccount,
    driveConnected,
    requestDriveAccess,
    driveToken,
  } = useAuth();
  // AuthModal calls onSuccess(token, user) — adapt to useAuth's (user, isNew?) shape
  const onAuthSuccess = useCallback((_token: string, u: WorkerUser) => _rawOnAuthSuccess(u), [_rawOnAuthSuccess]);
  useAutoSync(isAuthenticated);

  // ── Auth modal mode (signup vs sign-in copy) ────────────────────────────
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'signin'>('signup');

  // ── Drive restore-on-new-device flow ───────────────────────────────────
  // When a user signs in on a device with no local profiles, silently check
  // Drive for a backup and offer a one-tap restore. Only fires once per session.
  const driveRestoreCheckedRef = useRef(false);
  const [driveRestoreSlots, setDriveRestoreSlots] = useState<UserProfileSlot[] | null>(null);
  // Ref so the D1 timeout callback can see the latest Drive result without stale closure
  const driveRestoreSlotsRef = useRef<UserProfileSlot[] | null>(null);
  useEffect(() => { driveRestoreSlotsRef.current = driveRestoreSlots; }, [driveRestoreSlots]);

  // ── D1 auto-restore ref (fires once per session) ───────────────────────
  const d1RestoreCheckedRef = useRef(false);

  // ── Return-to-last-view after sign-out/sign-in ─────────────────────────
  // Tracks the previous auth state so we can save the current view on
  // sign-out and restore it on the next sign-in within the same tab session.
  const prevAuthenticatedRef = useRef(false);

  // ── Multi-profile storage ──────────────────────────────────────────────
  const [profiles, setProfiles] = useStorage<UserProfileSlot[]>("profiles", []);
  const [activeProfileId, setActiveProfileId] = useStorage<string | null>(
    "activeProfileId",
    null,
  );

  // ── Derive active user profile from slot ──────────────────────────────
  // Only fall back to profiles[0] when no room has ever been explicitly chosen.
  // If an activeProfileId is set but not found (e.g. after cloud restore), stay
  // null rather than silently jumping to Room 1 and overwriting the wrong room.
  const activeSlot = useMemo(
    () =>
      profiles.find((p) => p.id === activeProfileId) ??
      (activeProfileId ? null : profiles[0] ?? null),
    [profiles, activeProfileId],
  );
  const userProfile: UserProfile | null = activeSlot?.profile ?? null;

  // Wrap setUserProfile so it writes back into the active slot.
  // Also clears the CV cache so the next generation uses the updated profile.
  const setUserProfile = useCallback(
    (
      next:
        | UserProfile
        | null
        | ((prev: UserProfile | null) => UserProfile | null),
    ) => {
      if (!next) return;
      invalidateCVCache();
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved = typeof next === "function" ? next(p.profile) : next;
          return { ...p, profile: resolved ?? p.profile };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  // ── currentCV is stored per-profile inside the slot ───────────────────
  // Derive the current CV directly from the active slot so switching profiles
  // automatically shows that profile's CV (or nothing for a brand-new profile).
  const currentCV: CVData | null = activeSlot?.currentCV ?? null;

  const setCurrentCV = useCallback(
    (next: CVData | null | ((prev: CVData | null) => CVData | null)) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === "function" ? next(p.currentCV ?? null) : next;
          return { ...p, currentCV: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  // Fetch CV pipeline rules from the CF Worker at boot so they are ready
  // before the user clicks Generate. The rules (system prompts, humanizer,
  // validator instructions) live server-side and are never in the JS bundle.
  useEffect(() => {
    loadRules().catch(() => {});
  }, []);

  // Pre-warm the PDF font embed cache during browser idle time so the first
  // Download-PDF click no longer pays the ~2-5s Google Fonts fetch latency.
  // Safe to call once on mount — internal memo prevents duplicate work.
  useEffect(() => {
    // Self-healing: wipe any sync queue items left behind by a previous
    // account deletion that didn't clean IDB properly. Any item older than
    // 20 minutes is stale (max normal retry window is ~13 min). This runs
    // before the first flush timer fires, so stale items never reach D1.
    sanitiseStaleQueue();

    prewarmFontEmbedCache();
    // S4: pre-fetch active prompt version numbers so the generation trace
    // can tag them without a network round-trip on the critical path.
    prefetchPromptVersions();
    // S1: pre-fetch rule registry configs so the evaluator runs from cache.
    prefetchRuleConfigs();
  }, []);

  // ── Drive restore-on-new-device ──────────────────────────────────────────
  // When the user signs in and has NO local profiles (fresh device / cleared
  // browser), silently probe Drive for a backup and offer a one-tap restore.
  // Fires at most once per browser session to avoid repeated prompts.
  useEffect(() => {
    if (!isAuthenticated || driveRestoreCheckedRef.current) return;
    if (profiles.length > 0) { driveRestoreCheckedRef.current = true; return; }
    if (sessionStorage.getItem('procv:restore-dismissed')) { driveRestoreCheckedRef.current = true; return; }
    driveRestoreCheckedRef.current = true;

    const router = getDriveRouter();
    if (!router) return;

    router.load<UserProfileSlot[]>('profiles')
      .then(slots => {
        if (Array.isArray(slots) && slots.length > 0) {
          setDriveRestoreSlots(slots);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── D1 auto-restore ───────────────────────────────────────────────────────
  // CF D1 is the single source of truth. On sign-in the auth response now
  // includes the user's slots directly (zero extra round trip). On a page
  // refresh the session-validation call does the same. If neither path
  // supplies slots we fall back to an explicit fetchUserData() call.
  // HttpOnly cookie is set in the same response as auth — no delay needed.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (profiles.length > 0) return;
    if (d1RestoreCheckedRef.current) return;
    d1RestoreCheckedRef.current = true;

    function applySlots(rawSlots: Array<{ slot_id: string; slot_name: string; color: string; profile_json: string }>, source: string) {
      const restored = rawSlots.flatMap(s => { const r = parseSlotData(s); return r ? [r] : []; });
      if (restored.length > 0) {
        setProfiles(restored);
        // Honour the last-used profile if it still exists in the restored set;
        // only fall back to the first slot when no prior selection was recorded.
        try {
          const storedId = localStorage.getItem('activeProfileId');
          const parsed = storedId ? JSON.parse(storedId) : null;
          const stillExists = parsed && restored.some(p => p.id === parsed);
          setActiveProfileId(stillExists ? parsed : restored[0].id);
        } catch {
          setActiveProfileId(restored[0].id);
        }
        setIsEditingProfile(false);
        toast.success('Profiles restored', `${restored.length} profile${restored.length !== 1 ? 's' : ''} loaded from your account.`);
        console.log(`[D1Restore] ${restored.length} slot(s) restored from ${source}`);
      }
    }

    // 1. Try slots that arrived with the auth/session response (instant — no network call).
    const pending = drainPendingSlots();
    if (pending?.length) {
      applySlots(pending, 'auth response');
      return;
    }

    // 2. Fallback: explicit fetch from D1 (covers browser refresh where the
    //    pendingSlots buffer was already drained by a prior render cycle).
    fetchUserData()
      .then(data => { if (data?.slots?.length) applySlots(data.slots, 'D1 fetch'); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, profiles.length]);

  // Boot-time profile cache sync — runs whenever the active slot changes.
  // Uploads the profile to D1 if it hasn't been synced yet (or has changed
  // since the last upload). Best-effort; a failure is silent.
  // Guard: if a wipe+reload is in progress, skip the sync entirely so we
  // never push the previous user's profile to D1 under the new user's session.
  useEffect(() => {
    if (!activeSlot) return;
    const t = setTimeout(() => {
      syncProfileToCache(activeSlot).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // One-time migration: move any existing global currentCV into the active slot
  useEffect(() => {
    if (!activeSlot) return;
    if (activeSlot.currentCV !== undefined) return; // already migrated
    try {
      const raw =
        localStorage.getItem("cv_builder:currentCV") ||
        localStorage.getItem("currentCV");
      if (raw) {
        const cv = JSON.parse(raw) as CVData;
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === activeSlot.id ? { ...p, currentCV: cv } : p,
          ),
        );
        localStorage.removeItem("cv_builder:currentCV");
        localStorage.removeItem("currentCV");
      }
    } catch {
      /* ignore parse errors */
    }
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

    try {
      const r =
        localStorage.getItem("cv_builder:savedCVs") ||
        localStorage.getItem("savedCVs");
      if (r) savedCVsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem("cv_builder:savedCoverLetters") ||
        localStorage.getItem("savedCoverLetters");
      if (r) savedCLsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem("cv_builder:trackedApps") ||
        localStorage.getItem("trackedApps");
      if (r) trackedAppsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem("cv_builder:starStories") ||
        localStorage.getItem("starStories");
      if (r) starStoriesMig = JSON.parse(r);
    } catch {}

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeSlot.id
          ? {
              ...p,
              savedCVs: savedCVsMig ?? [],
              savedCoverLetters: savedCLsMig ?? [],
              trackedApps: trackedAppsMig ?? [],
              starStories: starStoriesMig ?? [],
            }
          : p,
      ),
    );

    // Clear global keys so they don't get migrated to other profiles
    [
      "cv_builder:savedCVs",
      "savedCVs",
      "cv_builder:savedCoverLetters",
      "savedCoverLetters",
      "cv_builder:trackedApps",
      "trackedApps",
      "cv_builder:starStories",
      "starStories",
    ].forEach((k) => localStorage.removeItem(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // IDB CV data migration + preload
  // 1. Move any inline SavedCV.data still sitting in the slot → dedicated IDB database.
  //    This runs once per device (guarded by the 'cvdata_migrated_v1' flag).
  // 2. Preload all CV IDs into the in-memory cache so getCVDataCached() works
  //    synchronously throughout the app (CVHistory, CVCompareModal, etc.).
  // 3. Prune IDB orphans — entries with no matching slot item.
  useEffect(() => {
    if (!profiles.length) return;

    (async () => {
      // Step 1 — one-time migration
      if (!localStorage.getItem('cv_builder:cvdata_migrated_v1')) {
        try {
          const { slots: migratedSlots, migrated } = await migrateToIDB(profiles);
          if (migrated > 0) {
            setProfiles(migratedSlots);
          }
          localStorage.setItem('cv_builder:cvdata_migrated_v1', '1');
        } catch (err) {
          console.warn('[cvDataStore] Migration failed (non-fatal):', err);
        }
      }

      // Step 2 — warm in-memory cache for all current CV ids
      const allIds = profiles.flatMap(s => (s.savedCVs ?? []).map(c => c.id));
      await preloadAllCVData(allIds).catch(() => {});

      // Step 3 — prune orphaned IDB entries (fire-and-forget)
      pruneOrphanedCVData(new Set(allIds)).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  // ── Per-profile isolated state (each profile has its own data) ────────
  // Derived from the active slot — switching profiles gives a clean slate.
  const savedCVs: SavedCV[] = activeSlot?.savedCVs ?? [];
  const setSavedCVs = useCallback(
    (next: SavedCV[] | ((prev: SavedCV[]) => SavedCV[])) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === "function" ? next(p.savedCVs ?? []) : next;
          return { ...p, savedCVs: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  const savedCoverLetters: SavedCoverLetter[] =
    activeSlot?.savedCoverLetters ?? [];
  const setSavedCoverLetters = useCallback(
    (
      next:
        | SavedCoverLetter[]
        | ((prev: SavedCoverLetter[]) => SavedCoverLetter[]),
    ) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === "function" ? next(p.savedCoverLetters ?? []) : next;
          return { ...p, savedCoverLetters: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  const trackedApps: TrackedApplication[] = activeSlot?.trackedApps ?? [];
  const setTrackedApps = useCallback(
    (
      next:
        | TrackedApplication[]
        | ((prev: TrackedApplication[]) => TrackedApplication[]),
    ) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === "function" ? next(p.trackedApps ?? []) : next;
          return { ...p, trackedApps: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  const starStories: STARStory[] = activeSlot?.starStories ?? [];
  const setStarStories = useCallback(
    (next: STARStory[] | ((prev: STARStory[]) => STARStory[])) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === "function" ? next(p.starStories ?? []) : next;
          return { ...p, starStories: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );
  // rawApiSettings holds the encrypted blob from storage; apiSettings is the decrypted in-memory copy.
  const [rawApiSettings, setRawApiSettings] = useStorage<ApiSettings>(
    "apiSettings",
    { provider: "gemini", apiKey: null },
  );
  const [apiSettings, setApiSettings] = useState<ApiSettings>({
    provider: "gemini",
    apiKey: null,
  });
  const [darkMode, setDarkMode] = useStorage<boolean>("darkMode", false);
  // Synchronously check localStorage to avoid flash-to-profile on refresh
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(() => {
    try {
      const raw =
        localStorage.getItem("cv_builder:profiles") ||
        localStorage.getItem("profiles");
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });
  // Show landing page when no profile has ever been created, OR when there is
  // no stored session token.  Initialising to `true` for sessionless users
  // eliminates the one-render flash of the main app that happened between
  // isAuthLoading going false and the effect setting showLanding = true.
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    try {
      // No user stored → always start on landing (avoids flash of main app).
      // Rule 6: raw tokens are no longer stored — check for the user object instead.
      const hasSession = !!localStorage.getItem('procv:worker_user')
        || !!localStorage.getItem('procv:worker_session'); // legacy key fallback
      if (!hasSession) return true;

      const raw =
        localStorage.getItem("cv_builder:profiles") ||
        localStorage.getItem("profiles");
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });

  // Onboarding wizard — shown once to new users after they pass the landing page
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Drive backup prompt ───────────────────────────────────────────────────
  // Shown automatically when:
  //   (a) navigator.storage estimate > 70% full, OR
  //   (b) LocalStorageService fires a 'storage-quota-warning' event (storage
  //       is actually full and had to fall back to IDB-only for a key).
  // Also available manually from Settings. Dismissed per session.
  const [showDrivePrompt, setShowDrivePrompt]         = useState(false);
  const [drivePromptDismissed, setDrivePromptDismissed] = useState(false);
  const [driveConnecting, setDriveConnecting]           = useState(false);
  const [driveMigrating, setDriveMigrating]             = useState(false);
  const [driveMigrationProgress, setDriveMigrationProgress] = useState<{ uploaded: number; total: number } | null>(null);
  const [driveMigrationDone, setDriveMigrationDone]     = useState(false);

  // Auto-show: check storage estimate 10 s after sign-in
  useEffect(() => {
    if (driveConnected || drivePromptDismissed || !isAuthenticated) return;
    const check = async () => {
      try {
        const est = await navigator.storage.estimate();
        const used = est.usage ?? 0;
        const quota = est.quota ?? 0;
        if (quota > 0 && used / quota > 0.70) setShowDrivePrompt(true);
      } catch { /* non-fatal */ }
    };
    const t = setTimeout(check, 10_000);
    return () => clearTimeout(t);
  }, [driveConnected, drivePromptDismissed, isAuthenticated]);

  // Auto-show: immediately when localStorage overflows (storage-quota-warning)
  useEffect(() => {
    const handleQuotaFull = () => {
      if (!driveConnected && !drivePromptDismissed && isAuthenticated) {
        setShowDrivePrompt(true);
      }
    };
    window.addEventListener('storage-quota-warning', handleQuotaFull);
    return () => window.removeEventListener('storage-quota-warning', handleQuotaFull);
  }, [driveConnected, drivePromptDismissed, isAuthenticated]);

  const handleConnectDrive = async () => {
    setDriveConnecting(true);
    setDriveMigrationDone(false);
    try {
      // Step 1: request Drive scope (popup — user already signed in with Google,
      // so they just tap "Allow" once. No sign-in needed again.)
      await requestDriveAccess();
      setDriveConnecting(false);

      // Step 2: migrate all existing localStorage + IDB data to Drive
      setDriveMigrating(true);
      await migrateLocalToDrive(
        (uploaded, total) => setDriveMigrationProgress({ uploaded, total }),
        user?.email ?? undefined,
      );
      setDriveMigrationProgress(null);
      setDriveMigrating(false);
      setDriveMigrationDone(true);

      // Auto-close after a brief success flash
      setTimeout(() => setShowDrivePrompt(false), 1800);
    } catch {
      // User cancelled the popup or Drive was unavailable — just hide the prompt
      setDriveConnecting(false);
      setDriveMigrating(false);
      setDriveMigrationProgress(null);
    }
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  // Allow any component to open the pricing modal via a custom event
  // (e.g. Tracker "Upgrade to track more" button, ProfileManager slot limit).
  useEffect(() => {
    const handler = () => setIsPricingOpen(true);
    window.addEventListener('procv:openPricing', handler);
    return () => window.removeEventListener('procv:openPricing', handler);
  }, []);

  // Allow any component to open the settings modal via a custom event
  // (e.g. FreePlanNudge "Connect Drive" button).
  useEffect(() => {
    const handler = () => setIsSettingsOpen(true);
    window.addEventListener('procv:openSettings', handler);
    return () => window.removeEventListener('procv:openSettings', handler);
  }, []);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Inactivity warning ───────────────────────────────────────────────────
  // On shared devices, if the user stops interacting for 30 minutes while
  // signed in, show a modal warning them they'll be signed out in 2 minutes.
  // Resets on any real user interaction. Disabled when not signed in.
  const INACTIVITY_MS = 30 * 60 * 1000;
  useEffect(() => {
    const isLoggedIn = !!user?.email;
    if (!isLoggedIn) {
      setShowInactivityWarning(false);
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
      return;
    }
    function resetActivity() {
      lastActivityRef.current = Date.now();
      setShowInactivityWarning(prev => prev ? false : prev);
    }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, resetActivity, { passive: true }));
    inactivityTimerRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_MS) {
        setShowInactivityWarning(true);
      }
    }, 60_000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetActivity));
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const [showProfileManager, setShowProfileManager] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const profileManagerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const toast = useToast();

  // Email apply pre-fill state (set by CV Generator)
  const [emailJd, setEmailJd] = useState<string>("");

  // Interview prep pre-fill state (set by CV Generator)
  const [interviewPrepJd, setInterviewPrepJd] = useState<string>("");

  // Toolkit → Generator feedback loop
  const [toolkitSuggestions, setToolkitSuggestions] = useState<string | null>(
    null,
  );

  // Detect mobile for ProfileManager overlay
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // KeyVault: init once, then decrypt rawApiSettings → apiSettings + RuntimeKeys
  useEffect(() => {
    let cancelled = false;
    KeyVault.init().then(async () => {
      try {
        const decrypted = await KeyVault.decryptApiSettings(
          rawApiSettings as Record<string, unknown>,
        );
        if (!cancelled) {
          const s = decrypted as ApiSettings;
          setApiSettings(s);
          setRuntimeKeys({
            apiKey: s.apiKey ?? null,
            claudeApiKey: (s as any).claudeApiKey ?? null,
            tavilyApiKey: (s as any).tavilyApiKey ?? null,
            brevoApiKey: (s as any).brevoApiKey ?? null,
            jsearchApiKey: (s as any).jsearchApiKey ?? null,
          });
        }
      } catch {
        if (!cancelled) setApiSettings(rawApiSettings);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawApiSettings)]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!darkMode);
  }, [darkMode]);

  // Sync user preferences to CF D1 — only when worker-authenticated (has session token)
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      enqueuePrefsSync({
        aiProvider: localStorage.getItem("cv_builder:aiProvider") ?? undefined,
        cvPurpose: localStorage.getItem("cv:purpose") ?? undefined,
        targetCompany: localStorage.getItem("cv:targetCompany") ?? undefined,
        targetJobTitle: localStorage.getItem("cv:targetJobTitle") ?? undefined,
        jdKeywords: localStorage.getItem("cv:jdKeywords") ?? undefined,
        sidebarSections:
          localStorage.getItem("cv_builder:sidebarSections") ?? undefined,
        darkMode: !!darkMode,
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, isAuthenticated]);

  // ── Sync-queue flush triggers ────────────────────────────────────────────
  // Flush the IDB sync queue when the browser comes back online or the tab
  // returns to the foreground. No polling — purely event-driven.
  // flushSyncQueue is rate-limited internally (30 s for 'online', 5 min for
  // 'visibility') so these handlers never hammer the CF worker KV tier.
  useEffect(() => {
    const onOnline = () => { flushSyncQueue('online').catch(() => {}); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        flushSyncQueue('visibility').catch(() => {});
      }
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Drive save error notifications
  // Only show when Drive is actually active — suppresses false alarms on new
  // accounts or after sign-out where stale Drive events may still fire.
  useEffect(() => {
    let lastErrorTime = 0;
    const handleDriveError = (e: Event) => {
      // Silently ignore if Drive sync is not enabled on this account.
      // This prevents the toast from showing on fresh accounts or after sign-out
      // when a queued Drive write from the previous session fires late.
      if (!isDriveActive()) return;

      const now = Date.now();
      if (now - lastErrorTime < 5 * 60 * 1000) return; // throttle to once per 5 min
      lastErrorTime = now;
      const detail = (e as CustomEvent).detail;
      const msg = detail?.error?.message || "Unknown error";
      if (msg.includes("expired") || msg.includes("401")) {
        toast.error(
          "Cloud Sync Failed",
          "Your Google session expired. Please sign in again via Cloud Sync settings.",
        );
      } else {
        toast.error(
          "Cloud Sync Failed",
          "Could not save to Google Drive. Check your connection and sign-in status.",
        );
      }
    };
    window.addEventListener("drive-save-error", handleDriveError);
    return () =>
      window.removeEventListener("drive-save-error", handleDriveError);
  }, [toast]);

  // ── Storage quota warning ─────────────────────────────────────────────────
  // Handled by the Drive backup prompt above (auto-shows when storage is full).
  // Falls back to a plain toast only when Drive is already connected or the
  // user has dismissed the prompt (so it never goes completely silent).

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#s=")) {
      // Short D1-backed share link — fetch payload from worker
      const id = hash.slice("#s=".length);
      if (id) {
        fetchSharePayload(id).then((compressed) => {
          if (compressed) {
            const payload = decodeSharePayload(compressed);
            if (payload) setSharedCVPayload(payload);
          }
        });
      }
    } else if (hash.startsWith("#p=")) {
      // Permanent public profile link — fetch latest published CV for this user
      const userId = parseInt(hash.slice("#p=".length), 10);
      if (userId && !isNaN(userId)) {
        fetchPublicProfile(userId).then((payload) => {
          if (payload) setSharedCVPayload(payload);
        });
      }
    } else if (hash.startsWith("#share=")) {
      // Legacy long-hash share link
      const encoded = hash.slice("#share=".length);
      const payload = decodeSharePayload(encoded);
      if (payload) {
        setSharedCVPayload(payload);
      }
    }
    if (hash === "#test-cv") {
      fetch("/test-cv-preview.json")
        .then((r) => (r.ok ? r.json() : Promise.reject("not found")))
        .then((cvData: CVData) => {
          const slotId = "test-cv-preview";
          const testProfile: UserProfile = {
            personalInfo: {
              name: "Alex Morgan",
              email: "alex@example.com",
              phone: "+44 7700 000000",
              location: "London, UK",
              linkedin: "linkedin.com/in/alexmorgan",
              website: "",
              github: "",
            },
            summary: cvData.summary,
            workExperience: (cvData.experience ?? []).map((exp, i) => ({
              id: `exp-${i}`,
              company: exp.company,
              jobTitle: exp.jobTitle,
              startDate: exp.startDate,
              endDate: exp.endDate,
              responsibilities: (exp.responsibilities ?? []).join("\n"),
            })),
            education: (cvData.education ?? []).map((edu, i) => ({
              id: `edu-${i}`,
              degree: edu.degree,
              school: edu.school,
              graduationYear: edu.year,
            })),
            skills: cvData.skills ?? [],
            projects: [],
            languages: [],
          };
          const testSlot: UserProfileSlot = {
            id: slotId,
            name: "Test CV Preview",
            color: "amber",
            createdAt: new Date().toISOString(),
            profile: testProfile,
            currentCV: cvData,
          };
          // Force professional template so sidebar/compact templates don't crash on minimal data
          try {
            localStorage.setItem("template", "professional");
          } catch {}
          setProfiles((prev) => {
            const exists = prev.some((p) => p.id === slotId);
            return exists
              ? prev.map((p) => (p.id === slotId ? testSlot : p))
              : [testSlot, ...prev];
          });
          setActiveProfileId(slotId);
          setCurrentCV(cvData);
          setShowLanding(false);
          setIsEditingProfile(false);
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => {});
    }
  }, []);

  // Close More menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  // Close profile manager dropdown on outside click — desktop only.
  // On mobile the bottom-sheet has its own backdrop tap handler, so attaching a
  // global mousedown listener would immediately close the sheet whenever the user
  // taps any button inside it (because those elements are outside profileManagerRef).
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: MouseEvent) => {
      if (
        profileManagerRef.current &&
        !profileManagerRef.current.contains(e.target as Node)
      ) {
        setShowProfileManager(false);
      }
    };
    if (showProfileManager) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfileManager, isMobile]);

  // ── API settings save: encrypt before persisting ──────────────────────
  const handleApiSettingsSave = useCallback(
    async (plaintext: ApiSettings) => {
      // Update in-memory state immediately so the UI (Job Board, etc.) sees
      // the new keys right away — don't make the user wait for async encryption.
      setApiSettings(plaintext);
      setRuntimeKeys({
        apiKey: plaintext.apiKey ?? null,
        claudeApiKey: (plaintext as any).claudeApiKey ?? null,
        tavilyApiKey: (plaintext as any).tavilyApiKey ?? null,
        brevoApiKey: (plaintext as any).brevoApiKey ?? null,
        jsearchApiKey: (plaintext as any).jsearchApiKey ?? null,
      });
      // Then encrypt and persist to storage in the background.
      try {
        await KeyVault.init();
        const encrypted = await KeyVault.encryptApiSettings(
          plaintext as Record<string, unknown>,
        );
        setRawApiSettings(encrypted as unknown as ApiSettings);
      } catch {
        // Fallback: save without encryption rather than silently fail
        setRawApiSettings(plaintext);
      }
    },
    [setRawApiSettings],
  );

  // ── Profile Manager handlers ───────────────────────────────────────────

  // Restore: reset the current CV's experience bullets back to raw profile text.
  // Useful when the user wants to start a fresh AI generation from scratch.
  const handleRestoreProfileBullets = useCallback(() => {
    if (!currentCV || !userProfile) return;
    const fromProfile = profileToCV(userProfile);
    setCurrentCV((prev) => {
      if (!prev) return prev;
      const restored = prev.experience.map((cvExp) => {
        const profileExp = fromProfile.experience.find(
          (e) => e.company === cvExp.company && e.jobTitle === cvExp.jobTitle,
        );
        if (!profileExp) return cvExp;
        return { ...cvExp, responsibilities: profileExp.responsibilities };
      });
      return {
        ...prev,
        experience: restored,
        summary: userProfile.summary || prev.summary,
      };
    });
  }, [currentCV, userProfile, setCurrentCV]);

  const handleProfileSave = useCallback(
    (profile: UserProfile) => {
      if (activeSlot) {
        setUserProfile(profile);
        setIsEditingProfile(false);
        // Sync updated profile to D1 cache + user_slots table (fire-and-forget).
        syncProfileToCache({ ...activeSlot, profile }).catch(() => {});
        if (isAuthenticated)
          enqueueSlotSync({ ...activeSlot, profile }).catch(() => {});
      } else {
        // First-time: auto-create a slot
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || "My Profile",
          color: "indigo",
          createdAt: new Date().toISOString(),
          profile,
        };
        setProfiles([slot]);
        setActiveProfileId(id);
        setIsEditingProfile(false);
        // Sync new profile to D1 cache + user_slots table (fire-and-forget).
        syncProfileToCache(slot).catch(() => {});
        enqueueSlotSync(slot).catch(() => {});
      }

      // Immediately sync ALL profile fields into the current CV so the preview
      // reflects every edit without requiring a full AI regeneration.
      setCurrentCV((prev) => {
        if (!prev) return prev;

        // Convert the saved profile to properly-formatted CV data so we get
        // correct date formatting, bullet splitting, etc. without duplicating logic.
        const fromProfile = profileToCV(profile);

        // Convert the OLD (pre-save) profile so we can detect which bullets the
        // user actually changed in the form vs which were already there.
        const oldFromProfile = profileToCV(userProfile);

        // Smart experience merge:
        // • Matched by company + jobTitle (not index) — add/remove/reorder is safe.
        // • If the user edited the responsibilities text in the profile form the
        //   new profile bullets win (their explicit edit must be respected).
        // • If the responsibilities text is unchanged the AI-polished CV bullets
        //   are preserved and only dates are refreshed.
        const mergedExperience = fromProfile.experience.map((newExp) => {
          const prevCVExp = prev.experience.find(
            (e) =>
              e.company === newExp.company &&
              e.jobTitle === newExp.jobTitle &&
              e.responsibilities.length > 0,
          );
          if (!prevCVExp) {
            // New or renamed role — use fresh profile bullets
            return newExp;
          }

          // Check whether the user changed the bullet text in the profile form
          const oldExp = oldFromProfile.experience.find(
            (e) =>
              e.company === newExp.company && e.jobTitle === newExp.jobTitle,
          );
          const bulletsChangedInForm =
            JSON.stringify(oldExp?.responsibilities ?? []) !==
            JSON.stringify(newExp.responsibilities);

          if (bulletsChangedInForm) {
            // User explicitly edited bullets in the profile form — honour their edit
            return {
              ...prevCVExp,
              responsibilities: newExp.responsibilities,
              dates: newExp.dates,
              startDate: newExp.startDate,
              endDate: newExp.endDate,
            };
          }

          // Bullets unchanged in form — keep AI-polished version, refresh dates only
          return {
            ...prevCVExp,
            dates: newExp.dates,
            startDate: newExp.startDate,
            endDate: newExp.endDate,
          };
        });

        return {
          ...prev,
          // Core profile fields — always sync so form edits appear immediately
          summary: profile.summary || prev.summary,
          experience:
            mergedExperience.length > 0 ? mergedExperience : prev.experience,
          education:
            fromProfile.education.length > 0
              ? fromProfile.education
              : prev.education,
          // User-controlled data — prefer profile when non-empty
          skills: profile.skills.length > 0 ? profile.skills : prev.skills,
          projects:
            fromProfile.projects && fromProfile.projects.length > 0
              ? fromProfile.projects
              : prev.projects,
          languages:
            fromProfile.languages && fromProfile.languages.length > 0
              ? fromProfile.languages
              : prev.languages,
          references:
            fromProfile.references && fromProfile.references.length > 0
              ? fromProfile.references
              : prev.references,
          customSections: (profile.customSections || []).filter((s) =>
            s.items.some((i) => i.title.trim().length > 0),
          ),
          sectionOrder: profile.sectionOrder,
        };
      });
    },
    [activeSlot, setUserProfile, setProfiles, setActiveProfileId, setCurrentCV],
  );

  const handleCreateProfile = useCallback(
    (name: string, color: ProfileColor, cloneFrom?: UserProfile) => {
      const id = crypto.randomUUID();
      const emptyProfile: UserProfile = {
        personalInfo: {
          name: "",
          email: "",
          phone: "",
          location: "",
          linkedin: "",
          website: "",
          github: "",
        },
        summary: "",
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
        // Explicitly initialize all per-slot data arrays so migration effects
        // see them as "already initialized" and skip reading from legacy
        // localStorage keys (which would bleed data from previous profiles).
        currentCV: null,
        savedCVs: [],
        savedCoverLetters: [],
        trackedApps: [],
        starStories: [],
      };
      setProfiles((prev) => [...prev, slot]);
      setActiveProfileId(id);
      setIsEditingProfile(!cloneFrom); // jump to edit if blank
      setShowProfileManager(false);
      toast.success("Profile Created", `"${name}" is now your active profile.`);
    },
    [setProfiles, setActiveProfileId, toast],
  );

  const handleSwitchProfile = useCallback(
    (slot: UserProfileSlot) => {
      setActiveProfileId(slot.id);
      setIsEditingProfile(false);
      setShowProfileManager(false);
      toast.success("Profile Switched", `Now using "${slot.name}".`);
    },
    [setActiveProfileId, toast],
  );

  const handleDeleteProfile = useCallback(
    async (id: string) => {
      // Save the slot in case we need to revert (Bug 2 fix).
      const removed = profiles.find((p) => p.id === id);

      // Optimistic local remove — fast UX.
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (activeProfileId === id && next.length > 0)
          setActiveProfileId(next[0].id);
        return next;
      });

      // Bug 2 fix: await the result and revert + error on failure instead of
      // silently lying to the user. Data was never deleted if we return false.
      const ok = await deleteSlotFromCloud(id);
      if (!ok) {
        if (removed) setProfiles((prev) => [...prev, removed]);
        toast.error(
          "Delete failed",
          "Could not remove this profile from the server. Please try again.",
        );
        return;
      }

      toast.success("Profile Deleted", "Profile removed.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, setProfiles, activeProfileId, setActiveProfileId, toast],
  );

  const handleRenameProfile = useCallback(
    (id: string, name: string, color: ProfileColor) => {
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name, color } : p)),
      );
      toast.success("Profile Updated", `Renamed to "${name}".`);
    },
    [setProfiles, toast],
  );

  // ── Pin-field shortcut from the Generation Trace panel ────────────────
  // Called when the user clicks "Pin this field" inside the Why-this-field
  // tooltip. Patches preferredField on the active profile without opening
  // the Profile form. Fire-and-forget sync to D1 / auth backend mirrors
  // the same path as handleProfileSave.
  const handlePinField = useCallback(
    (field: string) => {
      if (!userProfile || !activeSlot) return;
      const updated: UserProfile = { ...userProfile, preferredField: field };
      setUserProfile(updated);
      syncProfileToCache({ ...activeSlot, profile: updated }).catch(() => {});
      if (isAuthenticated)
        enqueueSlotSync({ ...activeSlot, profile: updated }).catch(() => {});
    },
    [userProfile, activeSlot, setUserProfile, isAuthenticated],
  );

  const handleUnpinField = useCallback(() => {
    if (!userProfile || !activeSlot) return;
    const { preferredField: _removed, ...rest } = userProfile as UserProfile & { preferredField?: string };
    const updated = rest as UserProfile;
    setUserProfile(updated);
    syncProfileToCache({ ...activeSlot, profile: updated }).catch(() => {});
    if (isAuthenticated)
      enqueueSlotSync({ ...activeSlot, profile: updated }).catch(() => {});
  }, [userProfile, activeSlot, setUserProfile, isAuthenticated]);

  // ── Per-slot state sync callback (room isolation) ──────────────────────
  // CVGenerator calls this (debounced 1s) whenever JD, targeting, or generation
  // settings change so each profile slot stores its own "room" state.
  const handleSlotUpdate = useCallback(
    (update: Partial<{
      jobDescription: string; targetCompany: string; targetJobTitle: string;
      cvPurpose: 'job' | 'academic' | 'general'; generationMode: string;
      jdKeywords: string[]; lastGeneratedAt: string; lastAtsScore: number;
    }>) => {
      setProfiles(prev =>
        prev.map(p =>
          p.id === activeSlot?.id ? { ...p, ...update } : p
        )
      );
    },
    [activeSlot, setProfiles],
  );

  // ── Delete account handler ─────────────────────────────────────────────
  const handleDeleteAccount = useCallback(async () => {
    // ── Step 1: Server-side delete FIRST — hard stop if it fails ────────────
    //
    // The old logic continued wiping local data even when the CF batch failed,
    // leaving the identity row alive in D1. On re-login with the same email
    // the worker matched by email, reused the old user_id, and served back
    // all the "deleted" data.
    //
    // New rule: server must confirm ok:true before we touch anything local.
    // If it doesn't, the user sees a clear error and can try again. Their
    // local data stays intact.
    const currentDeviceId = getDeviceId();
    let serverDeleteOk = false;
    try {
      serverDeleteOk = await _deleteAccount(currentDeviceId);
    } catch { /* serverDeleteOk stays false */ }

    if (!serverDeleteOk) {
      toast.error(
        'Deletion failed',
        'Your account could not be removed from the server. Check your connection and try again — nothing has been deleted yet.',
      );
      return; // ← hard stop, local data untouched, user can retry
    }

    // ── Step 2: Server confirmed deletion — clean up locally ────────────────
    //
    // Order matters:
    //  a) Cancel pending sync writes FIRST so no stale items fire after the wipe
    //  b) Wipe all local storage (localStorage + every IDB database, awaited)
    //  c) Write DELETED_CLEAN_SENTINEL after the wipe — the account-switch guard
    //     reads this on next boot and skips a second wipe+reload so the user
    //     can sign straight into a fresh account without an extra reload cycle
    //  d) Rotate device ID so the next account starts with a virgin device_id
    //  e) Best-effort Drive cleanup last (account is already gone server-side)

    await clearQueueForAccount().catch(() => {});

    await clearAllBrowserStorage();     // awaited — all 5 IDB databases deleted

    stampDeletedAccount();              // write sentinel AFTER wipe so it survives

    rotateDeviceId();                   // fresh device_id for the next account

    if (driveToken?.accessToken) {
      await deleteAllDriveData(driveToken.accessToken).catch(() => {});
    }

    // ── Step 3: Hard-navigate to landing — no browser-history entry ─────────
    window.location.replace(window.location.origin);
  }, [_deleteAccount, driveToken?.accessToken, toast]);

  // ── Clear all browser data (emergency reset — no account deletion) ──────
  const handleClearAllData = useCallback(async () => {
    // Wipe every byte of local storage without touching the server account.
    // On next load the user will be signed out on this device and can sign
    // back in to restore any cloud-synced data.
    await clearAllBrowserStorage().catch(() => {});
    window.location.reload();
  }, []);

  // ── CV handlers ─────────────────────────────────────────────────────────
  // Snapshot the deterministic quality audit at save time so the saved-CV
  // library can show a per-CV score badge and you have a record of the CV's
  // quality at the moment it was saved (separate from any later edits).
  const buildQualitySnapshot = (cvData: CVData) => {
    try {
      const r = auditCvQuality(cvData as any);
      return {
        score: r.score,
        totalBullets: r.totalBullets,
        totalIssues: r.totalIssues,
        issues: r.issues.map((i) => ({
          kind: i.kind,
          where: i.where,
          snippet: i.snippet,
        })),
        durationMs: r.durationMs,
        auditedAt: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  };

  const handleSaveCV = (
    cvData: CVData,
    purpose: "job" | "academic" | "general",
  ) => {
    const cvName = prompt(
      "Enter a name for this CV (e.g., Software Engineer - Google):",
      `CV for ${cvData.experience[0]?.jobTitle || "New Role"}`,
    );
    if (cvName) {
      const id = Date.now().toString();
      // Store full data in IDB; keep thin index in localStorage slot
      saveCVData(id, cvData).catch(() => {});
      const newSavedCV: SavedCV = {
        id,
        name: cvName,
        createdAt: new Date().toISOString(),
        purpose,
        qualityReport: buildQualitySnapshot(cvData),
      };
      setSavedCVs((prev) => [newSavedCV, ...prev]);
      toast.success(
        "CV Saved Successfully!",
        `"${cvName}" has been saved to your library.`,
      );
    }
  };

  const handleSaveCVFromPipeline = useCallback(
    (cvData: CVData, name: string) => {
      const id = Date.now().toString();
      saveCVData(id, cvData).catch(() => {});
      const newSavedCV: SavedCV = {
        id,
        name,
        createdAt: new Date().toISOString(),
        purpose: "job",
        qualityReport: buildQualitySnapshot(cvData),
      };
      setSavedCVs((prev) => [newSavedCV, ...prev]);
      toast.success("CV Saved!", `"${name}" saved to your CV library.`);
    },
    [setSavedCVs, toast],
  );

  const handleSaveCoverLetter = useCallback(
    (text: string, name: string) => {
      const newCL: SavedCoverLetter = {
        id: Date.now().toString(),
        name,
        createdAt: new Date().toISOString(),
        text,
      };
      setSavedCoverLetters((prev) => [newCL, ...prev]);
      toast.success("Cover Letter Saved!", `"${name}" saved to your library.`);
    },
    [setSavedCoverLetters, toast],
  );

  const deleteCVTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDeleteCV = useCallback(
    (id: string) => {
      const cvToDelete = savedCVs.find((cv) => cv.id === id);
      if (!cvToDelete) return;
      // Optimistically remove immediately
      setSavedCVs((prev) => prev.filter((cv) => cv.id !== id));
      // Show undo toast
      if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
      toast.info("CV Deleted", `"${cvToDelete.name}" removed.`, () => {
        // Undo: restore the CV (IDB data is still there — only deleted after timer)
        if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
        setSavedCVs((prev) => [cvToDelete, ...prev]);
        toast.success("Restored", `"${cvToDelete.name}" has been restored.`);
      });
      // After 6 seconds the deletion is final — remove from IDB too
      deleteCVTimerRef.current = setTimeout(() => {
        deleteCVTimerRef.current = null;
        deleteCVData(id).catch(() => {});
      }, 6000);
    },
    [setSavedCVs, savedCVs, toast],
  );

  const handleSaveStories = useCallback(
    (newStories: STARStory[]) => {
      setStarStories((prev) => [...newStories, ...prev]);
      toast.success(
        "Stories Saved!",
        `${newStories.length} STAR+R story added to your Interview Story Bank.`,
      );
    },
    [setStarStories, toast],
  );

  const handleLoadCV = useCallback(
    (cvData: CVData) => {
      setCurrentCV(cvData);
      setIsEditingProfile(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setCurrentCV],
  );

  const handleAutoTrack = useCallback(
    (details: { roleTitle: string; company: string; savedCvName: string }) => {
      const normalise = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      setTrackedApps((prev) => {
        const existingIdx = prev.findIndex((app) => {
          const sameRole =
            normalise(app.roleTitle) === normalise(details.roleTitle);
          const sameCompany =
            normalise(app.company) === normalise(details.company);
          const recent = new Date(app.dateApplied) >= thirtyDaysAgo;
          return sameRole && sameCompany && recent;
        });

        if (existingIdx !== -1) {
          // Regeneration of the same job — update CV name only, don't create duplicate
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            savedCvName: details.savedCvName,
          };
          toast.success(
            "CV Updated",
            `Re-generation detected — updated CV for "${details.roleTitle}" at ${details.company}.`,
          );
          return updated;
        }

        const newApp: TrackedApplication = {
          id: Date.now().toString(),
          savedCvId: "auto-generated",
          savedCvName: details.savedCvName,
          roleTitle: details.roleTitle,
          company: details.company,
          status: "Applied",
          dateApplied: new Date().toISOString().split("T")[0],
          notes: `Automatically tracked after CV generation on ${new Date().toLocaleDateString()}.`,
        };
        toast.success(
          "Application Tracked!",
          `Added "${details.roleTitle}" at ${details.company} to your tracker.`,
        );
        return [newApp, ...prev];
      });
    },
    [setTrackedApps, toast],
  );

  // Wire CV Generator → Email Apply
  const handleApplyViaEmail = useCallback(
    (jd: string, _cv: CVData) => {
      setEmailJd(jd);
      setCurrentView("email");
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(
        "Email Apply Ready",
        "JD pre-filled — AI will compose your email.",
      );
    },
    [toast],
  );

  // Wire CV Generator → Interview Prep
  const handleGoToInterviewPrep = useCallback(
    (jd: string) => {
      setInterviewPrepJd(jd);
      setCurrentView("interview");
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(
        "Interview Prep Ready",
        "JD pre-filled — generating tailored questions.",
      );
    },
    [toast],
  );

  // Wire CV Toolkit → CV Generator (Fix & Regenerate / Go to Generator)
  const handleGoToGenerator = useCallback(
    (extraInstructions?: string) => {
      setCurrentView("generator");
      if (extraInstructions) {
        setToolkitSuggestions(extraInstructions);
        toast.success(
          "CV Toolkit Feedback Ready",
          "Open the banner in the CV Generator to apply the fixes.",
        );
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [toast],
  );

  // Wire GitHub Import → CV Generator (AI-generated CV from repos)
  const handleGitHubCVGenerated = useCallback(
    (cv: CVData) => {
      setCurrentCV(cv);
      setCurrentView("generator");
      toast.success(
        "GitHub CV Ready!",
        "Your AI-generated CV is loaded in the CV Generator — complete with real project links.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setCurrentCV, toast],
  );

  // Wire Word Import → Profile update
  const handleWordProfileImported = useCallback(
    (profile: UserProfile) => {
      const cvData = profileToCV(profile);
      // Build "found extras" message from custom sections
      const extras = profile.customSections?.filter(s => s.items.length > 0) ?? [];
      const extrasMsg = extras.length > 0
        ? ` Found ${extras.length} extra section${extras.length > 1 ? 's' : ''}: ${extras.map(s => s.label).join(', ')}. Review them in your Profile.`
        : '';

      if (activeSlot) {
        // Atomically update profile + CV in a single setProfiles call.
        const updatedSlot = { ...activeSlot, profile, currentCV: cvData };
        setProfiles((prev) =>
          prev.map((p) => (p.id === activeSlot.id ? updatedSlot : p)),
        );
        invalidateCVCache();
        syncProfileToCache(updatedSlot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(updatedSlot).catch(() => {});
        toast.success(
          "Profile Imported!",
          `Your CV data has been imported.${extrasMsg} Head to the CV Generator to apply a template.`,
        );
      } else {
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || "Imported Profile",
          color: "violet",
          createdAt: new Date().toISOString(),
          profile,
          currentCV: cvData,
        };
        // Append instead of replacing — never wipe existing profiles.
        setProfiles((prev) => (prev.length > 0 ? [...prev, slot] : [slot]));
        setActiveProfileId(id);
        toast.success(
          "Profile Imported!",
          `Your CV has been imported.${extrasMsg} Edit your profile or go to the Generator.`,
        );
        syncProfileToCache(slot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
      }
    },
    [activeSlot, setProfiles, setActiveProfileId, toast, isAuthenticated],
  );

  // ── JSON profile import — asks user whether to update or create new ──────
  const [jsonImportTimestamp, setJsonImportTimestamp] = useState<string>("");
  const [pendingJsonImport, setPendingJsonImport] = useState<{
    profile: UserProfile;
    cvData: CVData;
  } | null>(null);

  const _applyJsonImport = useCallback(
    (
      profile: UserProfile,
      cvData: CVData,
      slotToUpdate: UserProfileSlot | null,
    ) => {
      if (slotToUpdate) {
        const updatedSlot = { ...slotToUpdate, profile, currentCV: cvData };
        setProfiles((prev) =>
          prev.map((p) => (p.id === slotToUpdate.id ? updatedSlot : p)),
        );
        invalidateCVCache();
        syncProfileToCache(updatedSlot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(updatedSlot).catch(() => {});
        toast.success(
          "Profile Updated!",
          "Your CV is ready — all templates are populated. Check your quality report below.",
        );
      } else {
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || "Imported Profile",
          color: "indigo",
          createdAt: new Date().toISOString(),
          profile,
          currentCV: cvData,
        };
        setProfiles((prev) => (prev.length > 0 ? [...prev, slot] : [slot]));
        setActiveProfileId(id);
        syncProfileToCache(slot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
        toast.success(
          "Profile Imported!",
          "Your CV is ready — all templates are populated. Check your quality report below.",
        );
      }
      setCurrentView("generator");
      setIsEditingProfile(false);
      setJsonImportTimestamp(new Date().toISOString());
    },
    [setProfiles, setActiveProfileId, toast],
  );

  const handleJsonProfileImported = useCallback(
    (profile: UserProfile) => {
      const cvData = profileToCV(profile);
      if (activeSlot) {
        // Show the choice dialog — user decides to update current profile or create new.
        setPendingJsonImport({ profile, cvData });
      } else {
        _applyJsonImport(profile, cvData, null);
      }
    },
    [activeSlot, _applyJsonImport],
  );

  const handleConfirmUpdateCurrentProfile = useCallback(() => {
    if (!pendingJsonImport) return;
    _applyJsonImport(
      pendingJsonImport.profile,
      pendingJsonImport.cvData,
      activeSlot,
    );
    setPendingJsonImport(null);
  }, [pendingJsonImport, activeSlot, _applyJsonImport]);

  const handleConfirmCreateNewProfile = useCallback(() => {
    if (!pendingJsonImport) return;
    _applyJsonImport(pendingJsonImport.profile, pendingJsonImport.cvData, null);
    setPendingJsonImport(null);
  }, [pendingJsonImport, _applyJsonImport]);

  // ── Onboarding wizard completion ──────────────────────────────────────────
  const handleOnboardingComplete = useCallback(
    async (opts: {
      plan: 'premium' | 'free';
      pendingDocxFile?: File;
      pendingImportFile?: File;
      pendingImportType?: PendingImportType;
      importedProfile?: UserProfile;
      apiSettings: ApiSettings;
    }) => {
      setShowOnboarding(false);
      await handleApiSettingsSave(opts.apiSettings);
      if (opts.importedProfile) {
        handleWordProfileImported(opts.importedProfile);
      }
      if (opts.pendingDocxFile) {
        try {
          const text = await extractTextFromDocx(opts.pendingDocxFile);
          const profile = await parseWordTextToProfile(text);
          handleWordProfileImported(profile);
        } catch (e: any) {
          toast.error('Word Import Failed', e?.message ?? 'Could not parse the Word document. Try again from your Profile page.');
        }
      }
      if (opts.pendingImportFile && opts.pendingImportType) {
        try {
          const file = opts.pendingImportFile;
          const mimeType = file.type || (opts.pendingImportType === 'pdf' ? 'application/pdf' : 'image/jpeg');
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const profile = await generateProfileFromFileWithGemini(base64, mimeType);
          handleWordProfileImported(profile);
        } catch (e: any) {
          const label = opts.pendingImportType === 'pdf' ? 'PDF' : 'Image';
          toast.error(`${label} Import Failed`, e?.message ?? `Could not extract your profile from this ${label.toLowerCase()}. Try again from your Profile page.`);
        }
      }
    },
    [handleApiSettingsSave, handleWordProfileImported, toast],
  );

  const VIEW_KEY = 'procv:lastView';
  const RESTORABLE_VIEWS = ['generator','linkedin','interview','jobs','essays','history','tracker','toolkit','email','negotiation','analytics','score','pivot'] as const;
  type RestorableView = typeof RESTORABLE_VIEWS[number];

  const [currentView, setCurrentView] = useState<
    | "generator"
    | "linkedin"
    | "interview"
    | "jobs"
    | "essays"
    | "history"
    | "tracker"
    | "toolkit"
    | "email"
    | "negotiation"
    | "analytics"
    | "score"
    | "pivot"
    | "account"
    | "admin-leaks"
    | "admin-cv-engine"
    | "storage-map"
  >(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && (RESTORABLE_VIEWS as readonly string[]).includes(saved)) {
        return saved as RestorableView;
      }
    } catch { /* non-fatal */ }
    return 'generator';
  });

  // Admin routes — accessible at #admin/leaks and #admin/cv-engine. Hidden
  // from the main nav so they don't clutter the user-facing UI; these are
  // internal dashboards for managing the engine database and AI leaks.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#admin/leaks")
        setCurrentView("admin-leaks");
      else if (window.location.hash === "#admin/cv-engine")
        setCurrentView("admin-cv-engine");
      else if (window.location.hash === "#admin/storage-map")
        setCurrentView("storage-map");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [sharedCVPayload, setSharedCVPayload] =
    useState<SharedCVPayload | null>(null);

  const profileExists = useMemo(
    () => userProfile !== null && profiles.length > 0,
    [userProfile, profiles],
  );
  const apiKeySet = useMemo(
    () =>
      isCVEngineConfigured() ||
      !!(apiSettings?.apiKey || (apiSettings as any)?.claudeApiKey),
    [apiSettings],
  );
  const tavilyApiKey = useMemo(
    () => apiSettings?.tavilyApiKey || null,
    [apiSettings],
  );
  const brevoApiKey = useMemo(
    () => apiSettings?.brevoApiKey || null,
    [apiSettings],
  );
  const jsearchApiKey = useMemo(
    () => apiSettings?.jsearchApiKey || null,
    [apiSettings],
  );

  const primaryNav = [
    { id: "generator", label: "CV Generator", icon: FileText },
    { id: "score",     label: "Score My CV",  icon: ScoreNavIcon },
    { id: "interview", label: "Interview Prep", icon: InterviewNavIcon },
    { id: "tracker", label: "Job Tracker", icon: Target },
  ];

  const moreNavGroups = [
    {
      label: "Apply",
      items: [
        { id: "email", label: "Email Apply", icon: MailIcon },
        {
          id: "negotiation",
          label: "Salary Negotiation",
          icon: NegotiationNavIcon,
        },
        { id: "essays", label: "Scholarship", icon: BookOpen },
      ],
    },
    {
      label: "Tools",
      items: [
        { id: "pivot",   label: "Career Pivot",   icon: PivotNavIcon },
      ],
    },
    {
      label: "Track",
      items: [
        { id: "history", label: "CV History", icon: List },
        { id: "analytics", label: "Analytics", icon: AnalyticsNavIcon },
      ],
    },
  ];

  const allMoreItems = moreNavGroups.flatMap((g) => g.items);
  const isMoreActive = allMoreItems.some((item) => item.id === currentView);

  // ── Feature gate: views locked for pure free users (no API keys, no premium) ──
  const GATED_VIEWS = new Set(['interview', 'linkedin', 'email', 'negotiation', 'pivot', 'essays', 'analytics']);
  const handleNavClick = useCallback((id: string) => {
    if (isPureFreeTier() && GATED_VIEWS.has(id)) {
      setIsPricingOpen(true);
      return;
    }
    setCurrentView(id as any);
    setShowMoreMenu(false);
    setShowMobileMenu(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Active slot color badge ────────────────────────────────────────────
  const slotColor = activeSlot?.color ?? "indigo";

  // Persist currentView to localStorage so it survives page refreshes and sign-out → sign-in.
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, currentView);
      sessionStorage.setItem(VIEW_KEY, currentView); // keep sessionStorage in sync for sign-out cycle
    } catch { /* non-fatal */ }
  }, [currentView]);

  // Hide landing whenever authenticated — profiles are optional.
  // This prevents the refresh bug where a valid session + no profiles = landing page.
  // Onboarding is only shown for genuinely NEW accounts (server confirms is_new_user=true)
  // AND only if the user hasn't already completed onboarding before (local flag).
  // Returning users on a fresh device get their profiles from D1 auto-restore instead.
  useEffect(() => {
    const wasAuthenticated = prevAuthenticatedRef.current;
    prevAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated) {
      setShowLanding(false);
      // Only show onboarding for brand-new accounts that haven't completed setup yet.
      if (isNewUser && !hasCompletedOnboarding()) {
        setShowOnboarding(true);
      }
      // Restore the view the user was on before they signed out.
      // sessionStorage is preferred (same tab), localStorage is the fallback (cross-tab/refresh).
      if (!wasAuthenticated) {
        try {
          const saved = sessionStorage.getItem(VIEW_KEY) || localStorage.getItem(VIEW_KEY);
          if (saved && (RESTORABLE_VIEWS as readonly string[]).includes(saved)) {
            setCurrentView(saved as RestorableView);
          }
        } catch { /* non-fatal */ }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isNewUser]);

  // When auth validation completes and no valid session exists, return to landing
  // so returning users with expired sessions must sign in again.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setShowLanding(true);
    }
  }, [isAuthLoading, isAuthenticated]);

  // Show a loading screen while we validate the stored session on mount.
  // This prevents a flash of the main app for users whose session has expired.
  if (isAuthLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#F8F7F4' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-[#1B2B4B] rounded-xl flex items-center justify-center text-white font-black text-sm">CV</div>
          <div className="w-6 h-6 border-2 border-[#1B2B4B]/20 border-t-[#1B2B4B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Show landing page when requested (new users or navigated back)
  if (showLanding) {
    return (
      <>
        <LandingPage
          onGetStarted={async () => {
            // If the user already has a profile and is authenticated, go straight in.
            if (profileExists && isAuthenticated) {
              setShowLanding(false);
              return;
            }
            // New user flow — show "Create your free account" copy.
            setAuthModalMode('signup');
            const ok = await requireAuth();
            if (ok) {
              setShowLanding(false);
              // Onboarding is handled by the isNewUser effect (CF flag only).
              // Do NOT trigger it here — returning users on new devices would
              // incorrectly get onboarding because their localStorage is empty.
            }
          }}
          onSignIn={async () => {
            // Returning user flow — show "Welcome back" copy.
            setAuthModalMode('signin');
            const ok = await requireAuth();
            if (ok) setShowLanding(false);
          }}
          darkMode={!!darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          hasProfile={profileExists && isAuthenticated}
          onGoToApp={async () => {
            if (isAuthenticated) {
              setShowLanding(false);
            } else {
              const ok = await requireAuth();
              if (ok) setShowLanding(false);
            }
          }}
        />
        <AuthModal
          open={authModalOpen}
          onSuccess={onAuthSuccess}
          onDismiss={onAuthDismiss}
          mode={authModalMode}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}

      {/* ── Drive backup prompt ────────────────────────────────────────────── */}
      {/* Slides up when storage is full or user manually triggers it.        */}
      {/* Three inner states: idle → connecting → migrating → done.           */}
      {showDrivePrompt && !driveConnected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-[#C9A84C]/40 p-4 animate-in slide-in-from-bottom-2 duration-300">

            {/* ── Success state ── */}
            {driveMigrationDone ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">All backed up to Drive ✓</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Your CVs and profiles are now safe in Google Drive.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                {/* Google Drive icon */}
                <div className="w-9 h-9 rounded-xl bg-[#1B2B4B]/8 flex items-center justify-center flex-shrink-0 mt-0.5 pt-1">
                  <svg width="20" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Heading — changes by state */}
                  {driveMigrating ? (
                    <>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">Uploading your data…</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {driveMigrationProgress
                          ? `${driveMigrationProgress.uploaded} of ${driveMigrationProgress.total} items saved`
                          : 'Preparing…'}
                      </p>
                      {/* Progress bar */}
                      {driveMigrationProgress && driveMigrationProgress.total > 0 && (
                        <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#1B2B4B] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.round((driveMigrationProgress.uploaded / driveMigrationProgress.total) * 100)}%` }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                        {driveConnecting ? 'Waiting for Google…' : 'Back up to Google Drive'}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        {driveConnecting
                          ? 'Approve Drive access in the popup to continue.'
                          : "You're already signed in — one tap to back up all your CVs and profiles."}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <button
                          onClick={handleConnectDrive}
                          disabled={driveConnecting}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                        >
                          {driveConnecting && (
                            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                          )}
                          {driveConnecting ? 'Connecting…' : 'Connect Drive'}
                        </button>
                        {!driveConnecting && (
                          <button
                            onClick={() => { setShowDrivePrompt(false); setDrivePromptDismissed(true); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                          >
                            Not now
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Dismiss X — hidden while connecting/migrating */}
                {!driveConnecting && !driveMigrating && (
                  <button
                    onClick={() => { setShowDrivePrompt(false); setDrivePromptDismissed(true); }}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors flex-shrink-0 mt-0.5"
                    aria-label="Dismiss"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {sharedCVPayload && (
        <SharedCVView
          cvData={sharedCVPayload.cvData}
          personalInfo={sharedCVPayload.personalInfo}
          template={sharedCVPayload.template}
          sharedAt={sharedCVPayload.sharedAt}
          coverLetterText={sharedCVPayload.coverLetterText}
          onLoadIntoEditor={
            userProfile
              ? (cvData) => {
                  setCurrentCV(cvData);
                  setCurrentView("generator");
                }
              : undefined
          }
          onDismiss={() => {
            setSharedCVPayload(null);
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
          }}
        />
      )}
      <OfflineBanner />
      <header className="bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20 shadow-sm">
        {/* ── Row 1: Logo + Controls ──────────────────────────────────── */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-between items-center gap-3">
          <button
            onClick={() => {
              if (isAuthenticated || isAuthenticated) {
                setCurrentView("generator");
              } else {
                setShowLanding(true);
              }
            }}
            className="flex items-center gap-2.5 group flex-shrink-0"
            title="Go to dashboard"
          >
            <div className="p-1.5 bg-[#1B2B4B] group-hover:bg-[#152238] rounded-lg transition-colors">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <h1
                className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 leading-none"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                ProCV
              </h1>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5 hidden sm:block">
                Your Personal Career Consultant
              </p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-[#C9A84C]/30 ml-1" />
          </button>

          <div className="flex items-center gap-2">
            {/* ── Profile switcher ───────────────────────────── */}
            {profileExists && (
              <div className="relative" ref={profileManagerRef}>
                <button
                  onClick={() => setShowProfileManager((v) => !v)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 text-sm font-bold rounded-xl border transition-all ${showProfileManager ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 text-[#1B2B4B] dark:text-[#C9A84C]/80" : "bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700"}`}
                  title="Switch profile"
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-full ${colorBg(slotColor)} flex items-center justify-center text-[10px] text-white font-extrabold flex-shrink-0`}
                  >
                    {(
                      activeSlot?.profile?.personalInfo?.name ||
                      activeSlot?.name ||
                      "?"
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  {/* Two-line text block — desktop only */}
                  <span className="hidden sm:flex flex-col items-start leading-none gap-0.5 min-w-0">
                    <span className="max-w-[90px] truncate text-sm font-bold">
                      {activeSlot?.name ?? "Profile"}
                    </span>
                    {/* Sub-row: ATS badge + time */}
                    {(activeSlot?.lastAtsScore !== undefined || activeSlot?.lastGeneratedAt) && (
                      <span className="flex items-center gap-1">
                        {activeSlot?.lastAtsScore !== undefined && (
                          <span
                            className="text-[9px] font-extrabold px-1 py-px rounded"
                            style={{
                              background:
                                activeSlot.lastAtsScore >= 80 ? "#dcfce7"
                                : activeSlot.lastAtsScore >= 60 ? "#fef9c3"
                                : "#fee2e2",
                              color:
                                activeSlot.lastAtsScore >= 80 ? "#15803d"
                                : activeSlot.lastAtsScore >= 60 ? "#a16207"
                                : "#b91c1c",
                            }}
                          >
                            ATS {activeSlot.lastAtsScore}
                          </span>
                        )}
                        {activeSlot?.lastGeneratedAt && (
                          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">
                            {navTimeAgo(activeSlot.lastGeneratedAt)}
                          </span>
                        )}
                      </span>
                    )}
                  </span>

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

            {/* ── Dark mode toggle ──────────────────────────────────── */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors flex-shrink-0"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* ── Consolidated user menu ─────────────────────────────── */}
            <div className="relative flex-shrink-0" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className={`group flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-all ${
                  showUserMenu
                    ? "bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/10 border-[#C9A84C]/40 dark:border-[#C9A84C]/30"
                    : "bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 hover:bg-zinc-200 dark:hover:bg-neutral-700"
                }`}
                aria-label="User menu"
              >
                {/* Avatar */}
                {(isAuthenticated && user?.picture) ? (
                  <img src={user.picture} alt={user.name} referrerPolicy="no-referrer"
                       className="w-7 h-7 rounded-full ring-2 ring-[#C9A84C]/50 shadow-sm flex-shrink-0" />
                ) : (isAuthenticated && user?.picture) ? (
                  <img src={user.picture} alt={user.name} referrerPolicy="no-referrer"
                       className="w-7 h-7 rounded-full ring-2 ring-[#C9A84C]/50 shadow-sm flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#1B2B4B] dark:bg-[#C9A84C] flex items-center justify-center text-[11px] text-white dark:text-[#1B2B4B] font-black flex-shrink-0">
                    {((isAuthenticated && user ? (user.name || user.email) : isAuthenticated && user ? user.name : '') || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Name — hidden on mobile, shown sm+ */}
                <span className="hidden sm:inline text-xs font-bold text-zinc-700 dark:text-zinc-200 max-w-[90px] truncate">
                  {isAuthenticated && user
                    ? (user.name || user.email || '').split(' ')[0]
                    : isAuthenticated && user
                      ? user.name.split(' ')[0]
                      : 'Menu'}
                </span>
                <svg className={`h-3 w-3 text-zinc-400 transition-transform flex-shrink-0 ${showUserMenu ? 'rotate-180' : ''}`}
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden z-50 animate-nav-slide-down">
                  {/* User header */}
                  {(isAuthenticated && user) && (
                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900/50">
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{user.name || user.email?.split('@')[0]}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{user.email}</p>
                    </div>
                  )}
                  <div className="p-1.5 space-y-0.5">
                    {/* Settings */}
                    <button
                      onClick={() => { setShowUserMenu(false); setIsSettingsOpen(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                    >
                      <Settings className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      Settings &amp; API Keys
                    </button>
                    {/* Edit / Create Profile — always shown when authenticated */}
                    {isAuthenticated && (
                      <button
                        onClick={() => { setShowUserMenu(false); setIsEditingProfile(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                      >
                        <User className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                        {profileExists ? 'Edit Profile' : 'Create Profile'}
                      </button>
                    )}
                    {/* Account */}
                    {isAuthenticated && (
                      <button
                        onClick={() => { setShowUserMenu(false); setCurrentView("account" as any); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                      >
                        <svg className="h-4 w-4 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                        My Account
                      </button>
                    )}
                  </div>
                  {/* Sign out — separated at bottom */}
                  {isAuthenticated && (
                    <div className="p-1.5 border-t border-zinc-100 dark:border-neutral-700">
                      <button
                        onClick={async () => {
                          setShowUserMenu(false);
                          await clearQueueForAccount().catch(() => {});
                          await signOut();
                          setShowLanding(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                      >
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Sign out
                      </button>
                    </div>
                  )}
                  {/* Unauthenticated: just cloud sync label */}
                  {!isAuthenticated && !isAuthenticated && (
                    <div className="p-1.5">
                      <button
                        onClick={() => { setShowUserMenu(false); setIsSettingsOpen(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#1B2B4B] dark:text-[#C9A84C] hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                      >
                        <Settings className="h-4 w-4 flex-shrink-0" />
                        Cloud Sync &amp; Settings
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Responsive Nav ───────────────────────────────────── */}
        {profileExists && !isEditingProfile && (
          <div className="border-t border-zinc-200 dark:border-neutral-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              {/* ── Desktop nav ── */}
              <div className="hidden sm:flex items-center gap-0.5 py-1">
                {primaryNav.map((item) => {
                  const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                  return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                      currentView === item.id
                        ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C] border-b-2 border-[#C9A84C]"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800 border-b-2 border-transparent"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                    {gated && <span className="ml-0.5 text-[8px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                  </button>
                  );
                })}

                {/* ── More dropdown ── */}
                <div className="relative ml-1" ref={moreMenuRef}>
                  <button
                    onClick={() => setShowMoreMenu((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                      isMoreActive || showMoreMenu
                        ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C]"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span>More</span>
                    <svg
                      className={`h-3 w-3 transition-transform ${showMoreMenu ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {showMoreMenu && (
                    <div className="animate-nav-slide-down absolute left-0 top-full mt-1 w-64 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-neutral-700 p-2 z-50">
                      {moreNavGroups.map((group) => (
                        <div key={group.label} className="mb-1 last:mb-0">
                          <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            {group.label}
                          </p>
                          {group.items.map((item) => {
                            const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                            return (
                            <button
                              key={item.id}
                              onClick={() => handleNavClick(item.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                                currentView === item.id
                                  ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700"
                              }`}
                            >
                              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="flex-1">{item.label}</span>
                              {gated && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                            </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Mobile nav: hamburger + slide-down ── */}
              <div className="sm:hidden flex items-center justify-between py-1.5">
                <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
                  {primaryNav.slice(0, 3).map((item) => {
                    const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                    return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                        currentView === item.id
                          ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <item.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{item.label}</span>
                      {gated && <span className="ml-0.5 text-[7px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                    </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setShowMobileMenu((v) => !v)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ml-1 ${
                    showMobileMenu || isMoreActive
                      ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              </div>

              {/* ── Mobile slide-down full menu ── */}
              {showMobileMenu && (
                <div className="animate-mobile-menu sm:hidden pb-3 border-t border-zinc-100 dark:border-neutral-700 pt-2">
                  {moreNavGroups.map((group) => (
                    <div key={group.label} className="mb-1">
                      <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {group.items.map((item) => {
                          const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleNavClick(item.id)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                                currentView === item.id
                                  ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700"
                              }`}
                            >
                              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="flex-1">{item.label}</span>
                              {gated && <span className="text-[7px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* ── Mobile account/sign-out row ── */}
                  {isAuthenticated && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-neutral-700 px-1 space-y-0.5">
                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          setCurrentView("account" as any);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-all"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                        My Account
                        {user?.email && (
                          <span className="ml-auto text-[10px] font-normal text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">{user.email}</span>
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          setShowMobileMenu(false);
                          await clearQueueForAccount().catch(() => {});
                          await signOut();
                          setShowLanding(true);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Free-tier PDF download nudge — only visible to pure-free users after their first download */}
      <FreePlanNudge />

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          {(!profileExists ||
            isEditingProfile ||
            currentView === "generator") && (
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
              <div className="sticky top-24 space-y-4">
                {profileExists && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold flex items-center gap-3">
                        <User className="h-5 w-5 text-[#C9A84C]" /> Profile
                      </h2>
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        className="text-[#1B2B4B] hover:underline text-xs font-bold uppercase tracking-wider"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="space-y-3">
                      {/* Profiles mini-list */}
                      <div className="space-y-1">
                        {profiles.slice(0, 3).map((slot) => (
                          <div
                            key={slot.id}
                            onClick={() => handleSwitchProfile(slot)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${slot.id === activeSlot?.id ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/10" : "hover:bg-zinc-50 dark:hover:bg-neutral-700/50"}`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full ${colorBg(slot.color)} flex-shrink-0 flex items-center justify-center text-[9px] text-white font-bold`}
                            >
                              {(slot.profile?.personalInfo?.name || slot.name || '?')
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <span
                              className={`text-xs font-semibold truncate ${slot.id === activeSlot?.id ? "text-[#1B2B4B] dark:text-[#C9A84C]/80" : "text-zinc-600 dark:text-zinc-400"}`}
                            >
                              {slot.name}
                            </span>
                            {slot.id === activeSlot?.id && (
                              <span className="ml-auto text-[9px] font-extrabold text-[#C9A84C] uppercase">
                                active
                              </span>
                            )}
                          </div>
                        ))}
                        {profiles.length > 3 && (
                          <p className="text-[10px] text-zinc-400 pl-2">
                            +{profiles.length - 3} more profiles
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-zinc-100 dark:border-neutral-700">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                            Name
                          </span>
                          <span className="text-sm font-semibold">
                            {userProfile?.personalInfo?.name}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                          <span>Skills</span>
                          <span className="font-bold text-zinc-700 dark:text-zinc-300">
                            {userProfile?.skills.length}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Experience</span>
                          <span className="font-bold text-zinc-700 dark:text-zinc-300">
                            {userProfile?.workExperience.length} roles
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentView === "generator" && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold flex items-center gap-2">
                        <Target className="h-4 w-4 text-[#C9A84C]" /> Recent
                        Activity
                      </h2>
                      <span className="text-xs font-semibold text-zinc-400">
                        {trackedApps.length} total
                      </span>
                    </div>
                    {trackedApps.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 flex items-center justify-center mx-auto mb-3">
                          <Target className="h-5 w-5 text-[#C9A84C]" />
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          No applications tracked yet.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {trackedApps.slice(0, 4).map((app) => {
                          const statusColors: Record<string, string> = {
                            Wishlist:
                              "bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-400",
                            Applied:
                              "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
                            Interviewing:
                              "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                            Offer:
                              "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                            Rejected:
                              "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
                          };
                          return (
                            <div
                              key={app.id}
                              onClick={() => setCurrentView("tracker")}
                              className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 cursor-pointer"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                                  {app.roleTitle}
                                </p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {app.company}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[app.status] || statusColors.Applied}`}
                              >
                                {app.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setCurrentView("tracker")}
                      className="w-full mt-4 text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] py-2.5 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-lg hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Target className="h-3.5 w-3.5" /> View All Applications
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )}

          {profileExists &&
            !isEditingProfile &&
            currentView === "generator" && (
              <div className="lg:hidden col-span-1">
                <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                      <Target className="h-4 w-4 text-[#C9A84C]" /> Recent
                      Activity
                    </h2>
                    <button
                      onClick={() => setCurrentView("tracker")}
                      className="text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  {trackedApps.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-3">
                      No applications tracked yet.
                    </p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                      {trackedApps.slice(0, 6).map((app) => (
                        <div
                          key={app.id}
                          onClick={() => setCurrentView("tracker")}
                          className="flex-shrink-0 w-44 bg-white dark:bg-neutral-800 border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all border-zinc-200 dark:border-neutral-700"
                        >
                          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate mt-1">
                            {app.roleTitle}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            {app.company}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          <div
            className={`${!profileExists || isEditingProfile || currentView === "generator" ? "lg:col-span-8 xl:col-span-9" : "lg:col-span-12"}`}
          >
            {!profileExists || isEditingProfile ? (
              <ProfileForm
                existingProfile={userProfile}
                onSave={handleProfileSave}
                onCancel={() => profileExists && setIsEditingProfile(false)}
                currentCV={currentCV}
                apiKeySet={apiKeySet}
                openSettings={() => setIsSettingsOpen(true)}
                onProfileImported={handleWordProfileImported}
                onJsonImported={handleJsonProfileImported}
              />
            ) : (
              <div className="space-y-6">
                {/* Quick-Score banner — visible on generator homepage when a CV is loaded */}
                {currentView === "generator" && currentCV && (currentCV.summary || (currentCV.experience ?? []).length > 0) && (
                  <div
                    className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl border border-[#C9A84C]/30"
                    style={{ background: 'linear-gradient(135deg, #1B2B4B08 0%, #C9A84C08 100%)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📊</span>
                      <div>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight">Ready to score this CV?</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Human voice · Bullet quality · Career logic · ATS match</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentView("score" as any)}
                      className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-white whitespace-nowrap transition-opacity hover:opacity-90"
                      style={{ background: '#1B2B4B' }}
                    >
                      Score My CV →
                    </button>
                  </div>
                )}
                {currentView === "generator" && (
                  <CVGenerator
                    key={activeSlot?.id ?? 'default'}
                    userProfile={userProfile!}
                    currentCV={currentCV}
                    setCurrentCV={setCurrentCV}
                    onSaveCV={handleSaveCV}
                    onAutoTrack={handleAutoTrack}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                    onApplyViaEmail={handleApplyViaEmail}
                    onGoToInterviewPrep={handleGoToInterviewPrep}
                    onRestoreProfileBullets={handleRestoreProfileBullets}
                    savedCVs={savedCVs}
                    toolkitSuggestions={toolkitSuggestions}
                    onDismissToolkitSuggestions={() =>
                      setToolkitSuggestions(null)
                    }
                    onSaveStories={handleSaveStories}
                    importedFromJson={jsonImportTimestamp}
                    profileId={activeSlot?.id ?? ''}
                    initialJobDescription={activeSlot?.jobDescription ?? activeSlot?.currentJobDescription ?? ''}
                    initialTargetCompany={activeSlot?.targetCompany ?? ''}
                    initialTargetJobTitle={activeSlot?.targetJobTitle ?? ''}
                    initialCvPurpose={activeSlot?.cvPurpose}
                    initialGenerationMode={activeSlot?.generationMode}
                    initialJdKeywords={activeSlot?.jdKeywords}
                    onSlotUpdate={handleSlotUpdate}
                    onPinField={handlePinField}
                    onUnpinField={handleUnpinField}
                    onUpgrade={() => setIsPricingOpen(true)}
                  />
                )}
                {currentView === "linkedin" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <LinkedInGenerator
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                )}
                {currentView === "interview" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <InterviewPrep
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                      initialJd={interviewPrepJd}
                    />
                  </div>
                )}
                {currentView === "essays" && (
                  <ScholarshipEssayWriter
                    userProfile={userProfile!}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                  />
                )}
                {currentView === "history" && (
                  <CVHistory
                    savedCVs={savedCVs}
                    onLoad={(cv) => {
                      handleLoadCV(cv);
                      setCurrentView("generator");
                    }}
                    onDelete={handleDeleteCV}
                    userProfile={userProfile!}
                  />
                )}
                {currentView === "toolkit" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <CVToolkit
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      tavilyApiKey={tavilyApiKey}
                      openSettings={() => setIsSettingsOpen(true)}
                      onGoToGenerator={handleGoToGenerator}
                      onProfileImported={handleWordProfileImported}
                      onGitHubCVGenerated={handleGitHubCVGenerated}
                      currentCV={currentCV}
                    />
                  </div>
                )}
                {currentView === "email" && (
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
                {currentView === "tracker" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <div className="mb-8">
                      <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
                        Application Tracker
                      </h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                        Manage and track your job applications in one place.
                      </p>
                    </div>
                    <Tracker
                      trackedApps={trackedApps}
                      setTrackedApps={setTrackedApps}
                      savedCVs={savedCVs}
                      starStories={starStories}
                      setStarStories={setStarStories}
                    />
                  </div>
                )}

                {currentView === "negotiation" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <NegotiationCoach
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                )}
                {currentView === "analytics" && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <AnalyticsDashboard
                      trackedApps={trackedApps}
                      onGoToTracker={() => setCurrentView("tracker")}
                    />
                  </div>
                )}
                {currentView === "score" && (
                  <ScoreMyCVPage
                    currentCV={currentCV}
                    onGoToGenerator={() => setCurrentView("generator")}
                    onCVUpdate={(cv) => setCurrentCV(cv)}
                  />
                )}
                {currentView === "pivot" && (
                  <CareerPivotPage
                    currentCV={currentCV}
                    onGoToGenerator={() => setCurrentView("generator")}
                    onGoToScore={() => setCurrentView("score")}
                  />
                )}
                {currentView === "admin-leaks" && (
                  <div className="bg-slate-900 rounded-2xl border border-slate-800">
                    <AdminLeaksPage />
                  </div>
                )}
                {currentView === "admin-cv-engine" && (
                  <div className="bg-slate-900 rounded-2xl border border-slate-800">
                    <AdminCVEnginePage />
                  </div>
                )}
                {currentView === "storage-map" && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-neutral-700">
                    <StorageMapPage />
                  </div>
                )}
                {currentView === "account" && (
                  <AccountPage
                    workerUser={user}
                    profiles={profiles}
                    onSignOut={async () => {
                      await clearQueueForAccount().catch(() => {});
                      await signOut();
                      setShowLanding(true);
                    }}
                    onDeleteAccount={handleDeleteAccount}
                    onClearAllData={handleClearAllData}
                    onBack={() => setCurrentView("generator")}
                    onUpgrade={() => setIsPricingOpen(true)}
                    onEditProfile={() => setIsEditingProfile(true)}
                    driveConnected={driveConnected}
                    onConnectDrive={requestDriveAccess}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleApiSettingsSave}
        currentApiSettings={apiSettings}
        onOpenOnboarding={() => { setIsSettingsOpen(false); setShowOnboarding(true); }}
      />
      <InactivityWarningModal
        isOpen={showInactivityWarning}
        onStay={() => {
          lastActivityRef.current = Date.now();
          setShowInactivityWarning(false);
        }}
        onSignOut={async () => {
          setShowInactivityWarning(false);
          await clearQueueForAccount().catch(() => {});
          await signOut().catch(() => {});
          setShowLanding(true);
        }}
      />
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        currentPlan={user?.plan ?? 'free'}
        userEmail={user?.email}
      />
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

      {/* ── JSON import choice dialog — update current profile or create new ── */}
      {pendingJsonImport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-neutral-800">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Import JSON Profile
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                You already have a profile called{" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  "{activeSlot?.name}"
                </span>
                . What would you like to do?
              </p>
            </div>
            {/* Options */}
            <div className="p-4 space-y-3">
              {/* Option A — update current */}
              <button
                onClick={handleConfirmUpdateCurrentProfile}
                className="w-full text-left p-4 rounded-xl border-2 border-[#1B2B4B] dark:border-[#C9A84C] bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 hover:bg-[#1B2B4B]/10 dark:hover:bg-[#C9A84C]/10 transition-colors group"
              >
                <p className="font-semibold text-[#1B2B4B] dark:text-[#C9A84C] group-hover:underline">
                  Replace "{activeSlot?.name}"
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Overwrites the current profile and CV data with the imported
                  JSON. Cannot be undone.
                </p>
              </button>
              {/* Option B — create new */}
              <button
                onClick={handleConfirmCreateNewProfile}
                className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors group"
              >
                <p className="font-semibold text-zinc-800 dark:text-zinc-100 group-hover:text-violet-700 dark:group-hover:text-violet-300">
                  Create new profile — "
                  {pendingJsonImport.profile?.personalInfo?.name ||
                    "Imported Profile"}
                  "
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Keeps your existing profile and adds this as a separate
                  profile you can switch between.
                </p>
              </button>
            </div>
            {/* Cancel */}
            <div className="px-4 pb-4 flex justify-end">
              <button
                onClick={() => setPendingJsonImport(null)}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive restore-on-new-device prompt ── */}
      {driveRestoreSlots && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm mx-auto px-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[#1B2B4B]/10 dark:bg-[#C9A84C]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                  Backed-up profiles found
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  We found {driveRestoreSlots.length} profile{driveRestoreSlots.length !== 1 ? 's' : ''} saved in your Google Drive. Restore them to this device?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { sessionStorage.setItem('procv:restore-dismissed', '1'); setDriveRestoreSlots(null); }}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  setProfiles(driveRestoreSlots);
                  setActiveProfileId(driveRestoreSlots[0]?.id ?? null);
                  setIsEditingProfile(false);
                  setDriveRestoreSlots(null);
                  toast.success('Profiles restored', `${driveRestoreSlots.length} profile${driveRestoreSlots.length !== 1 ? 's' : ''} restored from Google Drive.`);
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#1B2B4B] hover:bg-[#1B2B4B]/90 dark:bg-[#C9A84C] dark:text-[#1B2B4B] dark:hover:bg-[#C9A84C]/90 rounded-lg transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── D1 cloud-backup restore prompt ── */}
      {/* D1 auto-restores silently — no popup needed */}

      {/* ── Auth modal ────────────────────────────────────────────────── */}
      <AuthModal
        open={authModalOpen}
        onSuccess={onAuthSuccess}
        onDismiss={onAuthDismiss}
        mode={authModalMode}
      />

      {/* ── Welcome modal (new user first sign-in) ─────────────────────── */}
      {isNewUser && user && (
        <WelcomeModal
          name={user.name}
          email={user.email}
          onClose={() => {
            clearNewUser();
            if (!profileExists) setIsEditingProfile(true);
          }}
        />
      )}

      {/* ── Google Drive conflict resolution modal ── */}
      <DriveConflictModal
        onResolved={(key, action) => {
          if (action === "overwrite") {
            toast.success(
              "Conflict Resolved",
              `Your local version of "${key}" was pushed to Drive.`,
            );
          } else if (action === "pull") {
            toast.success(
              "Conflict Resolved",
              `Drive version of "${key}" loaded — refreshing data.`,
            );
          }
        }}
      />
    </div>
  );
};

// ── Root App — single AuthProvider wraps everything ───────────────────────────
const App: React.FC = () => {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminApp />;
  }
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
};

export default App;
