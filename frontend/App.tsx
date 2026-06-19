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
import { syncSlot, syncPrefs, setUserSessionToken, fetchUserData, deleteSlotFromCloud } from "./services/userDataCloudService";
import { clearUserScopedStorage, stampSignedOut, ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL } from "./utils/clearUserStorage";
import { bootstrapTemplatesFromCloud } from "./services/customTemplateCloudService";
import {
  loadCustomTemplates,
  saveCustomTemplate,
} from "./utils/customTemplateStorage";
import { auditCvQuality } from "./services/cvNumberFidelity";
import { profileToCV } from "./utils/profileToCV";
import {
  saveCVData,
  deleteCVData,
  preloadAllCVData,
  migrateToIDB,
  pruneOrphanedCVData,
} from "./services/storage/cvDataStore";
import { GoogleAuthProvider, useGoogleAuth } from "./auth/GoogleAuthContext";
import { WorkerAuthProvider, useWorkerAuth } from "./auth/WorkerAuthContext";
import AuthModal from "./components/AuthModal";
import WelcomeModal from "./components/WelcomeModal";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/ui/Toast";
import ProfileForm from "./components/ProfileForm";
import CVGenerator from "./components/CVGenerator";
import PricingModal from "./components/PricingModal";
import SharedCVView from "./components/SharedCVView";
import { decodeSharePayload, SharedCVPayload } from "./components/ShareCVModal";
import { fetchSharePayload } from "./services/shareService";
import { fetchPublicProfile } from "./services/publicProfileService";
import SavedCVs from "./components/SavedCVs";
import CVHistory from "./components/CVHistory";
import ScholarshipEssayWriter from "./components/ScholarshipEssayWriter";
import SettingsModal from "./components/SettingsModal";
import Tracker from "./components/Tracker";
import CVToolkit from "./components/CVToolkit";
import EmailApply from "./components/EmailApply";
import { ProfileManager } from "./components/ProfileManager";
import NegotiationCoach from "./components/NegotiationCoach";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import LandingPage from "./components/LandingPage";
import AccountPage from "./components/AccountPage";
import { deleteAccountWorker } from "./services/authService";
import DriveConflictModal from "./components/DriveConflictModal";
import { OnboardingWizard, hasCompletedOnboarding } from "./components/OnboardingWizard";
import { extractTextFromDocx, parseWordTextToProfile } from "./services/wordImportService";
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
import { getDriveRouter } from "./services/storage/StorageRouter";
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

// ── Account isolation helpers ────────────────────────────────────────────────
// FNV-1a 32-bit hash — fast, non-crypto, sufficient for equality detection.
function _fnv32(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
const _ACCT_HASH_KEY = ACCOUNT_HASH_KEY;

// ── Inner app ───────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const { user, isAuthenticated, signOut: googleSignOut } = useGoogleAuth();
  const { workerUser, isWorkerAuthenticated, sessionToken, isLoading: isAuthLoading, authModalOpen, onAuthSuccess, onAuthDismiss, showSignIn, signOut, requireAuth, isNewUser, clearNewUser } = useWorkerAuth();
  useAutoSync(isAuthenticated);

  // ── Auth modal mode (signup vs sign-in copy) ────────────────────────────
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'signin'>('signup');

  // Keep the D1 sync service's module-level token in sync with the worker session
  useEffect(() => { setUserSessionToken(sessionToken ?? null); }, [sessionToken]);

  // ── Account-switch guard ──────────────────────────────────────────────────
  // When a different email signs in on this device, clear the previous user's
  // app data so they cannot see each other's CVs and profiles.
  // We reload after clearing so React state re-initialises from clean storage.
  useEffect(() => {
    // Use whichever auth resolves first — Google is faster (~100 ms) than the
    // worker session validation (~1-2 s). Watching both prevents the guard from
    // silently failing when worker auth is slow or unreachable.
    const email = workerUser?.email ?? user?.email;
    if (!email) return;
    const newHash    = _fnv32(email);
    const storedHash = localStorage.getItem(_ACCT_HASH_KEY);
    // Wipe when:
    //  (a) a different user's hash is stored, OR
    //  (b) the sentinel 'signed_out' was written by the last sign-out handler —
    //      this ensures every fresh sign-in starts from a clean slate even when
    //      the same user returns, preventing residual data from leaking to the
    //      next person who opens the app on this device.
    if (storedHash && storedHash !== newHash) {
      clearUserScopedStorage({ clearAppData: true });
      localStorage.setItem(_ACCT_HASH_KEY, newHash);
      window.location.reload();
      return;
    }
    localStorage.setItem(_ACCT_HASH_KEY, newHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerUser?.email, user?.email]);

  // ── Cross-tab account-switch guard ─────────────────────────────────────
  // When another browser tab signs in as a different user (or signs out),
  // it writes a new account_email_hash to localStorage. The `storage` event
  // fires in every OTHER tab. If the new hash differs from this tab's active
  // user, wipe app data and reload so this tab doesn't show stale data from
  // the previous account or allow writes that overwrite the new account's data.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== _ACCT_HASH_KEY) return;
      const newHash = e.newValue;
      if (!newHash) return; // key was deleted — not our concern
      if (newHash === SIGNED_OUT_SENTINEL) {
        // Another tab signed out — reload this tab to a clean unauthenticated state
        clearUserScopedStorage({ clearAppData: true });
        window.location.reload();
        return;
      }
      const email = workerUser?.email ?? user?.email;
      const ourHash = email ? _fnv32(email) : null;
      if (ourHash && newHash === ourHash) return; // same user, no action needed
      // A different user signed in on another tab — wipe and reload
      clearUserScopedStorage({ clearAppData: true });
      localStorage.setItem(_ACCT_HASH_KEY, newHash);
      window.location.reload();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerUser?.email, user?.email]);

  // ── Drive restore-on-new-device flow ───────────────────────────────────
  // When a user signs in on a device with no local profiles, silently check
  // Drive for a backup and offer a one-tap restore. Only fires once per session.
  const driveRestoreCheckedRef = useRef(false);
  const [driveRestoreSlots, setDriveRestoreSlots] = useState<UserProfileSlot[] | null>(null);
  // Ref so the D1 timeout callback can see the latest Drive result without stale closure
  const driveRestoreSlotsRef = useRef<UserProfileSlot[] | null>(null);
  useEffect(() => { driveRestoreSlotsRef.current = driveRestoreSlots; }, [driveRestoreSlots]);

  // ── D1 restore-on-new-device flow ──────────────────────────────────────
  // Fallback: if Drive found nothing, check the ProCV cloud backup (D1) instead.
  // Fires 2.5 s after worker-auth is ready — long enough for the Drive async
  // call to have settled — and only when local profiles are still empty.
  const d1RestoreCheckedRef = useRef(false);
  const [d1RestoreSlots, setD1RestoreSlots] = useState<UserProfileSlot[] | null>(null);

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
    prewarmFontEmbedCache();
    // S4: pre-fetch active prompt version numbers so the generation trace
    // can tag them without a network round-trip on the critical path.
    prefetchPromptVersions();
    // S1: pre-fetch rule registry configs so the evaluator runs from cache.
    prefetchRuleConfigs();
  }, []);

  // Boot-time custom template cloud sync: pull any templates stored in D1 that
  // aren't in localStorage yet (e.g. after a browser clear). Fire-and-forget —
  // runs 4 seconds after mount so it never races with critical startup work.
  useEffect(() => {
    const t = setTimeout(() => {
      bootstrapTemplatesFromCloud(loadCustomTemplates, (entries) => {
        entries.forEach((e) => saveCustomTemplate(e));
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
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

  // ── D1 restore-on-new-device ──────────────────────────────────────────────
  // Fires 2.5 s after the worker session is ready (giving Drive time to settle).
  // Only proceeds if: profiles are still empty AND Drive found nothing.
  useEffect(() => {
    if (!isWorkerAuthenticated) return;
    if (profiles.length > 0) return;
    if (d1RestoreCheckedRef.current) return;
    if (sessionStorage.getItem('procv:d1-restore-dismissed')) return;

    const t = setTimeout(() => {
      if (d1RestoreCheckedRef.current) return;
      if (driveRestoreSlotsRef.current !== null) return; // Drive found data, let it handle it
      d1RestoreCheckedRef.current = true;

      fetchUserData()
        .then(data => {
          if (!data?.slots?.length) return;
          const restored = data.slots.flatMap(s => {
            try {
              const profile = JSON.parse(s.profile_json);
              return [{
                id:   s.slot_id,
                name: s.slot_name,
                color: s.color ?? '#1B2B4B',
                profile,
                savedCVs: [],
                savedCoverLetters: [],
                trackedApps: [],
                starStories: [],
              } as UserProfileSlot];
            } catch { return []; }
          });
          if (restored.length > 0) setD1RestoreSlots(restored);
        })
        .catch(() => {});
    }, 2500);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerAuthenticated, profiles.length]);

  // Boot-time profile cache sync — runs whenever the active slot changes.
  // Uploads the profile to D1 if it hasn't been synced yet (or has changed
  // since the last upload). Best-effort; a failure is silent.
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
      // No session token → always start on landing (avoids flash of main app)
      const hasSession = !!localStorage.getItem('procv:worker_session');
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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
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
    if (!isWorkerAuthenticated) return;
    const timer = setTimeout(() => {
      syncPrefs({
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
  }, [darkMode, isWorkerAuthenticated]);

  // Drive save error notifications
  useEffect(() => {
    let lastErrorTime = 0;
    const handleDriveError = (e: Event) => {
      const now = Date.now();
      if (now - lastErrorTime < 15000) return; // throttle to once per 15s
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

  // ── Storage quota warning toast ──────────────────────────────────────────
  useEffect(() => {
    const handleQuota = () => {
      toast.warning(
        "Storage Almost Full",
        "Your browser storage is nearly full. Some temporary job search cache was removed. Consider clearing unused data or enabling Google Drive sync.",
      );
    };
    window.addEventListener("storage-quota-warning", handleQuota);
    return () =>
      window.removeEventListener("storage-quota-warning", handleQuota);
  }, [toast]);

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
        if (isWorkerAuthenticated)
          syncSlot({ ...activeSlot, profile }).catch(() => {});
      } else {
        // First-time: auto-create a slot
        const id = Date.now().toString();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo.name || "My Profile",
          color: "indigo",
          createdAt: new Date().toISOString(),
          profile,
        };
        setProfiles([slot]);
        setActiveProfileId(id);
        setIsEditingProfile(false);
        // Sync new profile to D1 cache + user_slots table (fire-and-forget).
        syncProfileToCache(slot).catch(() => {});
        syncSlot(slot).catch(() => {});
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
      const id = Date.now().toString();
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
    (id: string) => {
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (activeProfileId === id && next.length > 0)
          setActiveProfileId(next[0].id);
        return next;
      });
      // Remove from D1 so it doesn't resurface on next login (fire-and-forget)
      deleteSlotFromCloud(id).catch(() => {});
      toast.success("Profile Deleted", "Profile removed.");
    },
    [setProfiles, activeProfileId, setActiveProfileId, toast, deleteSlotFromCloud],
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
      if (isWorkerAuthenticated)
        syncSlot({ ...activeSlot, profile: updated }).catch(() => {});
    },
    [userProfile, activeSlot, setUserProfile, isWorkerAuthenticated],
  );

  const handleUnpinField = useCallback(() => {
    if (!userProfile || !activeSlot) return;
    const { preferredField: _removed, ...rest } = userProfile as UserProfile & { preferredField?: string };
    const updated = rest as UserProfile;
    setUserProfile(updated);
    syncProfileToCache({ ...activeSlot, profile: updated }).catch(() => {});
    if (isWorkerAuthenticated)
      syncSlot({ ...activeSlot, profile: updated }).catch(() => {});
  }, [userProfile, activeSlot, setUserProfile, isWorkerAuthenticated]);

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
    // Step 1: Best-effort Drive cleanup — never blocks the local wipe.
    if (user?.accessToken) {
      await deleteAllDriveData(user.accessToken).catch(() => {});
    }

    // Step 2: Best-effort server-side session / account removal.
    // Wrapped in its own try-catch so a 401/network error doesn't abort the
    // local wipe that follows.
    try {
      const token = sessionToken
        || localStorage.getItem('procv:worker_session')
        || sessionStorage.getItem('procv:worker_session_temp')
        || '';
      if (token) await deleteAccountWorker(token);
    } catch { /* non-fatal */ }

    // Step 3: LOCAL wipe — runs unconditionally even if server calls failed.
    clearUserScopedStorage({ clearAppData: true });
    stampSignedOut();
    try { await signOut(); }  catch { /* non-fatal */ }
    try { googleSignOut(); }  catch { /* non-fatal */ }  // void-returning wrapper
    toast.success('Account deleted', 'Your account and all data have been removed.');
    // Hard reload so React state (profiles, CVs) is fully reset alongside localStorage.
    setTimeout(() => window.location.reload(), 800);
  }, [user?.accessToken, sessionToken, signOut, googleSignOut, toast]);

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
        if (isWorkerAuthenticated) syncSlot(updatedSlot).catch(() => {});
        toast.success(
          "Profile Imported!",
          `Your CV data has been imported.${extrasMsg} Head to the CV Generator to apply a template.`,
        );
      } else {
        const id = Date.now().toString();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo.name || "Imported Profile",
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
        if (isWorkerAuthenticated) syncSlot(slot).catch(() => {});
      }
    },
    [activeSlot, setProfiles, setActiveProfileId, toast, isWorkerAuthenticated],
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
        if (isWorkerAuthenticated) syncSlot(updatedSlot).catch(() => {});
        toast.success(
          "Profile Updated!",
          "Your CV is ready — all templates are populated. Check your quality report below.",
        );
      } else {
        const id = Date.now().toString();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo.name || "Imported Profile",
          color: "indigo",
          createdAt: new Date().toISOString(),
          profile,
          currentCV: cvData,
        };
        setProfiles((prev) => (prev.length > 0 ? [...prev, slot] : [slot]));
        setActiveProfileId(id);
        syncProfileToCache(slot).catch(() => {});
        if (isWorkerAuthenticated) syncSlot(slot).catch(() => {});
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
    },
    [handleApiSettingsSave, handleWordProfileImported, toast],
  );

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
  >("generator");

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

  // ── Active slot color badge ────────────────────────────────────────────
  const slotColor = activeSlot?.color ?? "indigo";

  // Hide landing once a profile is created AND authenticated
  useEffect(() => {
    if (profileExists && isWorkerAuthenticated) setShowLanding(false);
  }, [profileExists, isWorkerAuthenticated]);

  // When auth validation completes and no valid session exists, return to landing
  // so returning users with expired sessions must sign in again.
  useEffect(() => {
    if (!isAuthLoading && !isWorkerAuthenticated) {
      setShowLanding(true);
    }
  }, [isAuthLoading, isWorkerAuthenticated]);

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
            if (profileExists && isWorkerAuthenticated) {
              setShowLanding(false);
              return;
            }
            // New user flow — show "Create your free account" copy.
            setAuthModalMode('signup');
            const ok = await requireAuth();
            if (ok) {
              setShowLanding(false);
              // Show onboarding wizard for brand-new users
              if (!hasCompletedOnboarding()) {
                setShowOnboarding(true);
              }
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
          hasProfile={profileExists && isWorkerAuthenticated}
          onGoToApp={async () => {
            if (isWorkerAuthenticated) {
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
              if (isWorkerAuthenticated || isAuthenticated) {
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
                      activeSlot?.profile.personalInfo.name ||
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
                {(isWorkerAuthenticated && workerUser?.picture) ? (
                  <img src={workerUser.picture} alt={workerUser.name} referrerPolicy="no-referrer"
                       className="w-7 h-7 rounded-full ring-2 ring-[#C9A84C]/50 shadow-sm flex-shrink-0" />
                ) : (isAuthenticated && user?.picture) ? (
                  <img src={user.picture} alt={user.name} referrerPolicy="no-referrer"
                       className="w-7 h-7 rounded-full ring-2 ring-[#C9A84C]/50 shadow-sm flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#1B2B4B] dark:bg-[#C9A84C] flex items-center justify-center text-[11px] text-white dark:text-[#1B2B4B] font-black flex-shrink-0">
                    {((isWorkerAuthenticated && workerUser ? (workerUser.name || workerUser.email) : isAuthenticated && user ? user.name : '') || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Name — hidden on mobile, shown sm+ */}
                <span className="hidden sm:inline text-xs font-bold text-zinc-700 dark:text-zinc-200 max-w-[90px] truncate">
                  {isWorkerAuthenticated && workerUser
                    ? (workerUser.name || workerUser.email || '').split(' ')[0]
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
                  {(isWorkerAuthenticated && workerUser) && (
                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900/50">
                      <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{workerUser.name || workerUser.email?.split('@')[0]}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{workerUser.email}</p>
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
                    {/* Edit profile */}
                    {profileExists && (
                      <button
                        onClick={() => { setShowUserMenu(false); setIsEditingProfile(true); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                      >
                        <User className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                        Edit Profile
                      </button>
                    )}
                    {/* Account */}
                    {isWorkerAuthenticated && (
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
                  {isWorkerAuthenticated && (
                    <div className="p-1.5 border-t border-zinc-100 dark:border-neutral-700">
                      <button
                        onClick={async () => {
                          setShowUserMenu(false);
                          await signOut();
                          await googleSignOut();
                          clearUserScopedStorage();
                          stampSignedOut();
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
                  {!isWorkerAuthenticated && !isAuthenticated && (
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
                {primaryNav.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id as any);
                      setShowMoreMenu(false);
                    }}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                      currentView === item.id
                        ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C] border-b-2 border-[#C9A84C]"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800 border-b-2 border-transparent"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}

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
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setCurrentView(item.id as any);
                                setShowMoreMenu(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                                currentView === item.id
                                  ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                                  : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700"
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
                  {primaryNav.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentView(item.id as any);
                        setShowMobileMenu(false);
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                        currentView === item.id
                          ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <item.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
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
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setCurrentView(item.id as any);
                              setShowMobileMenu(false);
                            }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                              currentView === item.id
                                ? "bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]"
                                : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700"
                            }`}
                          >
                            <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* ── Mobile account/sign-out row ── */}
                  {isWorkerAuthenticated && (
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
                        {workerUser?.email && (
                          <span className="ml-auto text-[10px] font-normal text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">{workerUser.email}</span>
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          setShowMobileMenu(false);
                          await signOut();
                          await googleSignOut();
                          clearUserScopedStorage();
                          stampSignedOut();
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
                              {(slot.profile.personalInfo.name || slot.name)
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
                            {userProfile?.personalInfo.name}
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
                    workerUser={workerUser}
                    profiles={profiles}
                    onSignOut={async () => {
                      await signOut();
                      await googleSignOut();
                      clearUserScopedStorage();
                      stampSignedOut();
                      setShowLanding(true);
                    }}
                    onDeleteAccount={handleDeleteAccount}
                    onBack={() => setCurrentView("generator")}
                    onUpgrade={() => setIsPricingOpen(true)}
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
        onSignOut={() => { setIsSettingsOpen(false); setShowLanding(true); }}
      />
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        currentPlan={workerUser?.plan ?? 'free'}
        userEmail={workerUser?.email}
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
                  {pendingJsonImport.profile.personalInfo.name ||
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
      {d1RestoreSlots && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm mx-auto px-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-[#1B2B4B]/10 dark:bg-[#C9A84C]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx={12} cy={5} rx={9} ry={3} />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">
                  Cloud backup found
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  We found {d1RestoreSlots.length} profile{d1RestoreSlots.length !== 1 ? 's' : ''} in your ProCV cloud backup. Restore to this device?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { sessionStorage.setItem('procv:d1-restore-dismissed', '1'); setD1RestoreSlots(null); }}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  setProfiles(d1RestoreSlots);
                  setActiveProfileId(d1RestoreSlots[0]?.id ?? null);
                  setD1RestoreSlots(null);
                  toast.success('Profiles restored', `${d1RestoreSlots.length} profile${d1RestoreSlots.length !== 1 ? 's' : ''} restored from cloud backup.`);
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#1B2B4B] hover:bg-[#1B2B4B]/90 dark:bg-[#C9A84C] dark:text-[#1B2B4B] dark:hover:bg-[#C9A84C]/90 rounded-lg transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auth modal ────────────────────────────────────────────────── */}
      <AuthModal
        open={authModalOpen}
        onSuccess={onAuthSuccess}
        onDismiss={onAuthDismiss}
        mode={authModalMode}
      />

      {/* ── Welcome modal (new user first sign-in) ─────────────────────── */}
      {isNewUser && workerUser && (
        <WelcomeModal
          name={workerUser.name}
          email={workerUser.email}
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

// ── Root App — wraps everything in GoogleAuthProvider + WorkerAuthProvider ──
const App: React.FC = () => {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminApp />;
  }
  return (
    <GoogleAuthProvider>
      <WorkerAuthProvider>
        <AppInner />
      </WorkerAuthProvider>
    </GoogleAuthProvider>
  );
};

export default App;
