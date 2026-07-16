import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  UserProfile,
  CVData,
  ApiSettings,
  UserProfileSlot,
} from "./types";
import { useStorage } from "./hooks/useStorage";
import * as KeyVault from "./services/security/KeyVault";
import { setRuntimeKeys } from "./services/security/RuntimeKeys";
import { useProfileSlots } from "./hooks/useProfileSlots";
import { getUserPrefix } from "./services/storage/userStorageNamespace";
import { enqueuePrefsSync, clearQueueForAccount, enqueueSlotSync } from "./services/storage/syncQueue";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import type { WorkerUser } from "./services/authService";
const AuthModal        = lazy(() => import("./components/AuthModal"));
const WelcomeModal     = lazy(() => import("./components/WelcomeModal"));
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/ui/Toast";
const PricingModal     = lazy(() => import("./components/PricingModal"));
const FreePlanNudge    = lazy(() => import("./components/FreePlanNudge"));
const SharedCVView     = lazy(() => import("./components/SharedCVView"));
const PublicProfilePage = lazy(() => import("./components/PublicProfilePage"));
import { decodeSharePayload, SharedCVPayload } from "./components/ShareCVModal";
import { fetchSharePayload } from "./services/shareService";
import { fetchPublicProfile } from "./services/publicProfileService";
const SettingsModal         = lazy(() => import("./components/SettingsModal"));
import CommandPalette from "./components/CommandPalette";
const InactivityWarningModal = lazy(() => import("./components/InactivityWarningModal"));
const LandingPage    = lazy(() => import("./components/LandingPage"));
const VideoTemplate  = lazy(() => import("./components/video/VideoTemplate"));
import OfflineBanner from "./components/OfflineBanner";
import type { PendingImportType } from "./components/OnboardingWizard";
const OnboardingWizard = lazy(() => import("./components/OnboardingWizard").then(m => ({ default: m.OnboardingWizard })));
// Heavy AI/import services — loaded on-demand the first time a user imports
// a file; never pulled into the main bundle.
// (dynamic import() is used at the call site in handleOnboardingComplete)
const AdminApp = lazy(() => import("./components/admin/AdminApp"));
const JsonImportDialog  = lazy(() => import("./components/JsonImportDialog"));
const ImportChoiceModal = lazy(() => import("./components/ImportChoiceModal"));
import { isCVEngineConfigured, workerExtractDoc } from "./services/cvEngineClient";
// groqService loaded on-demand (see handleOnboardingComplete)
import { useBootEffects } from "./hooks/useBootEffects";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useJsonImport } from "./hooks/useJsonImport";
import { useProfileManager } from "./hooks/useProfileManager";
import { useCVManager } from "./hooks/useCVManager";
import AppSidebar from "./components/AppSidebar";
import AppViewRouter from "./components/AppViewRouter";

// ── Inner app ───────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    authModalOpen,
    onAuthSuccess: _rawOnAuthSuccess,
    dismissAuth: onAuthDismiss,
    signOut,
    requireAuth,
    isNewUser,
    clearNewUser,
    deleteAccount: _deleteAccount,
  } = useAuth();
  const onAuthSuccess = useCallback(
    (_token: string, u: WorkerUser) => _rawOnAuthSuccess(u),
    [_rawOnAuthSuccess],
  );
  // ── Auth modal mode ─────────────────────────────────────────────────────
  const [authModalMode, setAuthModalMode] = useState<"signup" | "signin">("signup");

  // ── Profile slots ────────────────────────────────────────────────────────
  const {
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    activeSlot,
    userProfile,
    setUserProfile,
    currentCV,
    setCurrentCV,
    savedCVs,
    setSavedCVs,
    savedCoverLetters,
    setSavedCoverLetters,
    trackedApps,
    setTrackedApps,
    starStories,
    setStarStories,
    slotSharedLinks,
    setSlotSharedLinks,
  } = useProfileSlots();

  const handleShareLinkAdded = useCallback(
    (link: { id: string; created_at: number; expires_at: number }) => {
      setSlotSharedLinks([
        link,
        ...slotSharedLinks.filter((l) => l.id !== link.id),
      ].slice(0, 20));
    },
    [slotSharedLinks, setSlotSharedLinks],
  );

  // ── API settings ─────────────────────────────────────────────────────────
  const [rawApiSettings, setRawApiSettings] = useStorage<ApiSettings>(
    "apiSettings",
    { provider: "gemini", apiKey: null },
  );
  const [apiSettings, setApiSettings] = useState<ApiSettings>({
    provider: "gemini",
    apiKey: null,
  });
  const [darkMode, setDarkMode] = useStorage<boolean>("darkMode", false);

  // Sync-once on mount: decrypt raw → in-memory
  useEffect(() => {
    let cancelled = false;
    KeyVault.init().then(async () => {
      try {
        const decrypted = await KeyVault.decryptApiSettings(
          rawApiSettings as unknown as Record<string, unknown>,
        );
        if (!cancelled) {
          const s = decrypted as unknown as ApiSettings;
          setApiSettings(s);
          setRuntimeKeys({
            apiKey: s.apiKey ?? null,
            claudeApiKey: (s as any).claudeApiKey ?? null,
            groqApiKey: (s as any).groqApiKey ?? null,
            tavilyApiKey: (s as any).tavilyApiKey ?? null,
            brevoApiKey: (s as any).brevoApiKey ?? null,
            jsearchApiKey: (s as any).jsearchApiKey ?? null,
          });
        }
      } catch {
        if (!cancelled) setApiSettings(rawApiSettings);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawApiSettings)]);

  const handleApiSettingsSave = useCallback(
    async (plaintext: ApiSettings) => {
      setApiSettings(plaintext);
      setRuntimeKeys({
        apiKey: plaintext.apiKey ?? null,
        claudeApiKey: (plaintext as any).claudeApiKey ?? null,
        groqApiKey: (plaintext as any).groqApiKey ?? null,
        tavilyApiKey: (plaintext as any).tavilyApiKey ?? null,
        brevoApiKey: (plaintext as any).brevoApiKey ?? null,
        jsearchApiKey: (plaintext as any).jsearchApiKey ?? null,
      });
      try {
        await KeyVault.init();
        const encrypted = await KeyVault.encryptApiSettings(
          plaintext as unknown as Record<string, unknown>,
        );
        setRawApiSettings(encrypted as unknown as ApiSettings);
      } catch {
        setRawApiSettings(plaintext);
      }
      if (isAuthenticated) {
        enqueuePrefsSync({
          aiProvider: localStorage.getItem("cv_builder:aiProvider") ?? undefined,
          sidebarSections: localStorage.getItem("cv_builder:sidebarSections") ?? undefined,
          darkMode: !!darkMode,
        }).catch(() => {});
      }
    },
    [setRawApiSettings, isAuthenticated, darkMode],
  );

  // ── isEditingProfile: sync-safe init from localStorage ──────────────────
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(() => {
    try {
      const prefix = getUserPrefix();
      const raw =
        localStorage.getItem(`${prefix}cv_builder:profiles`) ||
        localStorage.getItem("cv_builder:profiles") ||
        localStorage.getItem("profiles");
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });

  // ── showLanding: sync-safe init ──────────────────────────────────────────
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    try {
      // Shared-CV / public-profile hash links (#s=, #share=, #p=) must never
      // hit the marketing landing page — anonymous visitors with no saved
      // session/profile would otherwise be stuck on landing forever, since
      // showLanding only flips to false via sign-in/sign-up.
      const hash = window.location.hash;
      if (hash.startsWith("#s=") || hash.startsWith("#share=") || hash.startsWith("#p=")) {
        return false;
      }
      const hasSession =
        !!localStorage.getItem("procv:worker_user") ||
        !!localStorage.getItem("procv:worker_session");
      if (!hasSession) return true;
      const prefix = getUserPrefix();
      const raw =
        localStorage.getItem(`${prefix}cv_builder:profiles`) ||
        localStorage.getItem("cv_builder:profiles") ||
        localStorage.getItem("profiles");
      if (!raw) return true;
      const profs = JSON.parse(raw);
      return !Array.isArray(profs) || profs.length === 0;
    } catch {
      return true;
    }
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  // When true, Settings opens straight into the BYOK key-entry UI (user just
  // chose BYOK from the pricing modal, before saving any key).
  const [settingsForceByok, setSettingsForceByok] = useState(false);

  // ── ⌘K command palette keyboard shortcut ─────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Boot effects ─────────────────────────────────────────────────────────
  useBootEffects({ darkMode, isAuthenticated, setIsPricingOpen, setIsSettingsOpen });

  // ── Navigation ───────────────────────────────────────────────────────────
  const {
    currentView,
    setCurrentView,
    primaryNav,
    moreNavGroups,
    allMoreItems,
    isMoreActive,
    handleNavClick,
    GATED_VIEWS,
  } = useAppNavigation({
    isAuthenticated,
    isAuthLoading,
    isNewUser,
    setShowLanding,
    setShowOnboarding,
    setIsPricingOpen,
    // AppNavbar manages its own menu state now:
    setShowMoreMenu: () => {},
    setShowMobileMenu: () => {},
  });

  const toast = useToast();

  // ── Profile manager hook ─────────────────────────────────────────────────
  const {
    handleRestoreProfileBullets,
    handleProfileSave,
    handleCreateProfile,
    handleSwitchProfile,
    handleDeleteProfile,
    handleRenameProfile,
    handlePinField,
    handleUnpinField,
    handleSlotUpdate,
    handleDeleteAccount,
    handleClearAllData,
    d1SyncPending,
  } = useProfileManager({
    profiles,
    setProfiles,
    activeProfileId,
    setActiveProfileId,
    activeSlot,
    userProfile,
    setUserProfile,
    currentCV,
    setCurrentCV,
    setIsEditingProfile,
    isAuthenticated,
    isNewUser,
    deleteAccount: _deleteAccount,
    toast,
  });

  // ── CV manager hook ──────────────────────────────────────────────────────
  const {
    emailJd,
    interviewPrepJd,
    toolkitSuggestions,
    setToolkitSuggestions,
    toolkitForceTab,
    setToolkitForceTab,
    handleSaveCV,
    handleSaveCVFromPipeline,
    handleSaveCoverLetter,
    handleDeleteCV,
    handleSaveStories,
    handleLoadCV,
    handleAutoTrack,
    handleApplyViaEmail,
    handleGoToInterviewPrep,
    handleGoToGenerator,
    handleGitHubCVGenerated,
    handleWordProfileImported,
    pendingWordImport,
    handleConfirmReplaceWordImport,
    handleConfirmCreateNewWordImport,
    handleCancelWordImport,
    canAddWordImportSlot,
  } = useCVManager({
    savedCVs,
    setSavedCVs,
    setSavedCoverLetters,
    setTrackedApps,
    setStarStories,
    setCurrentCV,
    setCurrentView,
    setIsEditingProfile,
    activeSlot,
    profiles,
    setProfiles,
    setActiveProfileId,
    isAuthenticated,
    toast,
  });

  // ── JSON import ──────────────────────────────────────────────────────────
  const {
    jsonImportTimestamp,
    pendingJsonImport,
    canCreateNewJsonSlot,
    handleJsonProfileImported,
    handleConfirmUpdateCurrentProfile,
    handleConfirmCreateNewProfile,
    handleCancelJsonImport,
  } = useJsonImport({
    activeSlot,
    profileCount: profiles.length,
    isAuthenticated,
    setProfiles,
    setActiveProfileId,
    setCurrentView,
    setIsEditingProfile,
    toast,
  });

  // ── Mobile detection ─────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Inactivity warning ───────────────────────────────────────────────────
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      setShowInactivityWarning(prev => (prev ? false : prev));
    }
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, resetActivity, { passive: true }));
    inactivityTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        setShowInactivityWarning(true);
      }
    }, 60_000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetActivity));
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // ── Shared CV payload (hash links) ───────────────────────────────────────
  const [sharedCVPayload, setSharedCVPayload] = useState<SharedCVPayload | null>(null);
  const [sharedCVId, setSharedCVId] = useState<string | null>(null);
  // Public profile page — separate from the CV share view (#p= route)
  const [publicProfilePayload, setPublicProfilePayload] = useState<SharedCVPayload | null>(null);
  // True while an async #s= / #p= fetch is in-flight — prevents the main app
  // from rendering underneath the share view before the payload arrives.
  const [isLoadingShareLink, setIsLoadingShareLink] = useState<boolean>(() => {
    const h = window.location.hash;
    return h.startsWith("#s=") || h.startsWith("#p=");
  });
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#s=")) {
      const id = hash.slice("#s=".length);
      if (id) {
        setSharedCVId(id);
        fetchSharePayload(id).then(compressed => {
          if (compressed) {
            const payload = decodeSharePayload(compressed);
            if (payload) {
              setSharedCVPayload(payload);
              setShowLanding(false);
            }
          }
        }).finally(() => setIsLoadingShareLink(false));
      } else {
        setIsLoadingShareLink(false);
      }
    } else if (hash.startsWith("#p=")) {
      const slugOrId = hash.slice("#p=".length);
      if (slugOrId) {
        fetchPublicProfile(slugOrId).then(payload => {
          // Show the rich PublicProfilePage instead of the CV-document view
          if (payload) {
            setPublicProfilePayload(payload);
            setShowLanding(false);
          }
        }).finally(() => setIsLoadingShareLink(false));
      } else {
        setIsLoadingShareLink(false);
      }
    } else if (hash.startsWith("#share=")) {
      const encoded = hash.slice("#share=".length);
      const payload = decodeSharePayload(encoded);
      if (payload) {
        setSharedCVPayload(payload);
        setShowLanding(false);
      }
    }
    if (hash === "#test-cv") {
      fetch("/test-cv-preview.json")
        .then(r => (r.ok ? r.json() : Promise.reject("not found")))
        .then((cvData: CVData) => {
          const slotId = "test-cv-preview";
          const testProfile: import("./types").UserProfile = {
            personalInfo: {
              name: "Alex Morgan", email: "alex@example.com", phone: "+44 7700 000000",
              location: "London, UK", linkedin: "linkedin.com/in/alexmorgan", website: "", github: "",
            },
            summary: cvData.summary,
            workExperience: (cvData.experience ?? []).map((exp, i) => ({
              id: `exp-${i}`, company: exp.company, jobTitle: exp.jobTitle,
              startDate: exp.startDate, endDate: exp.endDate,
              responsibilities: (exp.responsibilities ?? []).join("\n"),
            })),
            education: (cvData.education ?? []).map((edu, i) => ({
              id: `edu-${i}`, degree: edu.degree, school: edu.school, graduationYear: edu.year,
            })),
            skills: cvData.skills ?? [], projects: [], languages: [],
          };
          const testSlot: UserProfileSlot = {
            id: slotId, name: "Test CV Preview", color: "amber",
            createdAt: new Date().toISOString(), profile: testProfile, currentCV: cvData,
          };
          try { localStorage.setItem("template", "professional"); } catch {}
          setProfiles(prev => {
            const exists = prev.some(p => p.id === slotId);
            return exists ? prev.map(p => (p.id === slotId ? testSlot : p)) : [testSlot, ...prev];
          });
          setActiveProfileId(slotId);
          setCurrentCV(cvData);
          setShowLanding(false);
          setIsEditingProfile(false);
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Onboarding completion ─────────────────────────────────────────────────
  const handleOnboardingComplete = useCallback(
    async (opts: {
      plan: "premium" | "byok" | "free";
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
          const text = await workerExtractDoc(opts.pendingDocxFile);
          if (!text || text.trim().length < 50) throw new Error('Could not extract text from this Word document.');
          const { runImportPipeline } = await import('./services/importPipeline');
          const result = await runImportPipeline(text, 'docx');
          handleWordProfileImported(result.profile);
        } catch (e: any) {
          toast.error("Word Import Failed", e?.message ?? "Could not parse the Word document. Try again from your Profile page.");
        }
      }
      if (opts.pendingImportFile && opts.pendingImportType) {
        try {
          const file = opts.pendingImportFile;
          const { getSelectedProvider } = await import('./services/groqService');
          const activeProvider = getSelectedProvider();

          // Shared helpers — loaded once per invocation alongside the services
          const [{ purifyProfile }, importMod] = await Promise.all([
            import('./services/cvPurificationPipeline'),
            import('./services/importPipeline'),
          ]);
          const { runImportPipeline } = importMod;
          const toBase64 = (f: File) => new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string).split(",")[1]);
            r.onerror = rej;
            r.readAsDataURL(f);
          });

          if (opts.pendingImportType === "pdf") {
            const mimeType = file.type || "application/pdf";
            if (activeProvider === 'claude') {
              const { generateProfileFromFileClaude } = await import('./services/geminiService');
              handleWordProfileImported(purifyProfile(await generateProfileFromFileClaude(await toBase64(file), mimeType, undefined)));
            } else if (activeProvider === 'gemini') {
              const { generateProfileFromFileWithGemini } = await import('./services/geminiService');
              handleWordProfileImported(purifyProfile(await generateProfileFromFileWithGemini(await toBase64(file), mimeType, undefined)));
            } else {
              // Workers AI — toMarkdown handles PDF server-side (zero tokens for text PDFs)
              const text = await workerExtractDoc(file);
              if (!text || text.trim().length < 50) throw new Error('Workers AI could not read this PDF. Try pasting your CV text instead.');
              const result = await runImportPipeline(text, 'pdf');
              handleWordProfileImported(purifyProfile(result.profile));
            }
          } else {
            // Image
            const mimeType = file.type || "image/jpeg";
            if (activeProvider === 'claude') {
              const { generateProfileFromFileClaude } = await import('./services/geminiService');
              handleWordProfileImported(purifyProfile(await generateProfileFromFileClaude(await toBase64(file), mimeType, undefined)));
            } else if (activeProvider === 'gemini') {
              const { generateProfileFromFileWithGemini } = await import('./services/geminiService');
              handleWordProfileImported(purifyProfile(await generateProfileFromFileWithGemini(await toBase64(file), mimeType, undefined)));
            } else {
              // Workers AI — toMarkdown handles images via vision server-side
              const text = await workerExtractDoc(file);
              if (!text || text.trim().length < 50) throw new Error('Workers AI could not extract text from this image. Try pasting your CV text instead.');
              const result = await runImportPipeline(text, 'pdf');
              handleWordProfileImported(purifyProfile(result.profile));
            }
          }
        } catch (e: any) {
          const label = opts.pendingImportType === "pdf" ? "PDF" : "Image";
          toast.error(`${label} Import Failed`, e?.message ?? `Could not extract your profile from this ${label.toLowerCase()}. Try again from your Profile page.`);
        }
      }
    },
    [handleApiSettingsSave, handleWordProfileImported, toast],
  );

  // ── Computed values ───────────────────────────────────────────────────────
  const profileExists = useMemo(
    () => userProfile !== null && profiles.length > 0,
    [userProfile, profiles],
  );
  const apiKeySet = useMemo(
    () =>
      isCVEngineConfigured() ||
      !!(
        apiSettings?.apiKey ||
        (apiSettings as any)?.claudeApiKey ||
        (apiSettings as any)?.geminiApiKey ||
        (apiSettings as any)?.groqApiKey
      ),
    [apiSettings],
  );
  const tavilyApiKey = useMemo(() => (apiSettings as any)?.tavilyApiKey || null, [apiSettings]);
  const brevoApiKey = useMemo(() => (apiSettings as any)?.brevoApiKey || null, [apiSettings]);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (isAuthLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#F8F7F4" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-[#1B2B4B] rounded-xl flex items-center justify-center text-white font-black text-sm">CV</div>
          <div className="w-6 h-6 border-2 border-[#1B2B4B]/20 border-t-[#1B2B4B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  if (showLanding) {
    return (
      <Suspense fallback={null}>
        <>
        <LandingPage
          onGetStarted={async () => {
            if (profileExists && isAuthenticated) {
              setShowLanding(false);
              return;
            }
            setAuthModalMode("signup");
            const ok = await requireAuth();
            if (ok) setShowLanding(false);
          }}
          onSignIn={async () => {
            setAuthModalMode("signin");
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
      </Suspense>
    );
  }

  // ── Shared CV / Public Profile (hash links) ─────────────────────────────────
  // Rendered as a standalone view — the rest of the app (navbar, view router,
  // modals) never mounts underneath. Previously both were rendered together,
  // which left the full dashboard's document-flow height in the DOM behind a
  // `fixed` overlay, producing a second, invisible page-level scrollbar
  // alongside the shared view's own internal scroll container on desktop.

  // While the async #s= / #p= payload is in-flight show a blank loading screen
  // so the user never sees the main app flashing underneath before the share
  // view arrives.
  if (isLoadingShareLink) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-100 to-[#eeece5] dark:from-neutral-950 dark:to-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#1B2B4B] flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">CV</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <svg className="animate-spin h-4 w-4 text-[#C9A84C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Loading preview…
          </div>
        </div>
      </div>
    );
  }

  if (sharedCVPayload) {
    return (
      <Suspense fallback={null}>
      <SharedCVView
        cvData={sharedCVPayload.cvData}
        personalInfo={sharedCVPayload.personalInfo}
        template={sharedCVPayload.template}
        sharedAt={sharedCVPayload.sharedAt}
        coverLetterText={sharedCVPayload.coverLetterText}
        procvBranding={sharedCVPayload.procvBranding}
        shareId={sharedCVId ?? undefined}
        onLoadIntoEditor={
          // Only pass this to the actual owner of the shared CV.
          // We match on email so another ProCV user viewing a colleague's
          // shared link never accidentally overwrites their own active CV.
          (() => {
            if (!userProfile) return undefined;
            const sharedEmail = sharedCVPayload.personalInfo.email?.toLowerCase().trim();
            const myEmail = userProfile.personalInfo.email?.toLowerCase().trim();
            const isOwner = !!(sharedEmail && myEmail && sharedEmail === myEmail);
            if (!isOwner) return undefined;
            return (cvData: CVData) => {
              setCurrentCV(cvData);
              setCurrentView("generator");
              // Sync loaded CV so other devices see the owner's selection
              if (isAuthenticated && activeSlot) {
                enqueueSlotSync({ ...activeSlot, currentCV: cvData }).catch(() => {});
              }
            };
          })()
        }
        onDismiss={() => {
          setSharedCVPayload(null);
          setSharedCVId(null);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }}
      />
      </Suspense>
    );
  }

  if (publicProfilePayload) {
    return (
      <Suspense fallback={null}>
      <PublicProfilePage
        cvData={publicProfilePayload.cvData}
        personalInfo={publicProfilePayload.personalInfo}
        template={publicProfilePayload.template}
        sharedAt={publicProfilePayload.sharedAt}
        procvBranding={publicProfilePayload.procvBranding}
        onViewCV={() => {
          // Switch from profile page to the full CV document view
          setSharedCVPayload(publicProfilePayload);
          setPublicProfilePayload(null);
        }}
        onDismiss={() => {
          setPublicProfilePayload(null);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }}
      />
      </Suspense>
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#F8F7F4] dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        </Suspense>
      )}

      {/* ── Sidebar layout: col on mobile (header above content), row on desktop ── */}
      <div className="flex flex-col md:flex-row min-h-screen">
        <AppSidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          primaryNav={primaryNav}
          moreNavGroups={moreNavGroups}
          isMoreActive={isMoreActive}
          handleNavClick={handleNavClick}
          GATED_VIEWS={GATED_VIEWS}
          profileExists={profileExists}
          isEditingProfile={isEditingProfile}
          activeSlot={activeSlot}
          profiles={profiles}
          userProfile={userProfile}
          user={user}
          isAuthenticated={isAuthenticated}
          darkMode={!!darkMode}
          setDarkMode={setDarkMode}
          setIsSettingsOpen={setIsSettingsOpen}
          setIsPricingOpen={setIsPricingOpen}
          setIsEditingProfile={setIsEditingProfile}
          setShowLanding={setShowLanding}
          isMobile={isMobile}
          signOut={signOut}
          onOpenCmdPalette={() => setIsCmdPaletteOpen(true)}
          onSwitchProfile={handleSwitchProfile}
          onCreateProfile={handleCreateProfile}
          onDeleteProfile={handleDeleteProfile}
          onRenameProfile={handleRenameProfile}
        />

        {/* Content column — fills remaining width, scrolls independently */}
        <div className="flex-1 min-w-0 flex flex-col">
          <OfflineBanner />
          <Suspense fallback={null}><FreePlanNudge /></Suspense>

          <AppViewRouter
        currentView={currentView}
        setCurrentView={setCurrentView}
        profileExists={profileExists}
        isEditingProfile={isEditingProfile}
        setIsEditingProfile={setIsEditingProfile}
        userProfile={userProfile}
        currentCV={currentCV}
        setCurrentCV={setCurrentCV}
        activeSlot={activeSlot}
        profiles={profiles}
        savedCVs={savedCVs}
        savedCoverLetters={savedCoverLetters}
        trackedApps={trackedApps}
        setTrackedApps={setTrackedApps}
        starStories={starStories}
        setStarStories={setStarStories}
        apiKeySet={apiKeySet}
        tavilyApiKey={tavilyApiKey}
        brevoApiKey={brevoApiKey}
        user={user}
        isAuthenticated={isAuthenticated}
        d1SyncPending={d1SyncPending}
        jsonImportTimestamp={jsonImportTimestamp}
        emailJd={emailJd}
        interviewPrepJd={interviewPrepJd}
        toolkitSuggestions={toolkitSuggestions}
        setToolkitSuggestions={setToolkitSuggestions}
        toolkitForceTab={toolkitForceTab}
        setToolkitForceTab={setToolkitForceTab}
        onSaveCV={handleSaveCV}
        onAutoSaveCV={handleSaveCVFromPipeline}
        onAutoTrack={handleAutoTrack}
        onApplyViaEmail={handleApplyViaEmail}
        onGoToInterviewPrep={handleGoToInterviewPrep}
        onRestoreProfileBullets={handleRestoreProfileBullets}
        onSaveStories={handleSaveStories}
        onSlotUpdate={handleSlotUpdate}
        onShareLinkAdded={handleShareLinkAdded}
        onPinField={handlePinField}
        onUnpinField={handleUnpinField}
        onGoToGenerator={handleGoToGenerator}
        onProfileImported={handleWordProfileImported}
        onProfileSave={handleProfileSave}
        onGitHubCVGenerated={handleGitHubCVGenerated}
        onJsonProfileImported={handleJsonProfileImported}
        onDeleteCV={handleDeleteCV}
        onLoadCV={handleLoadCV}
        onSwitchProfile={handleSwitchProfile}
        onDeleteAccount={handleDeleteAccount}
        onClearAllData={handleClearAllData}
        signOut={signOut}
        setShowLanding={setShowLanding}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsPricingOpen={setIsPricingOpen}
        darkMode={!!darkMode}
        setDarkMode={setDarkMode}
        currentApiSettings={apiSettings}
        onSaveApiSettings={handleApiSettingsSave}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />

        </div>{/* end content column */}
      </div>{/* end flex layout */}

      {/* ── Modals — rendered in the root, above the layout ── */}
      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => { setIsSettingsOpen(false); setSettingsForceByok(false); }}
          onSave={handleApiSettingsSave}
          currentApiSettings={apiSettings}
          onOpenOnboarding={() => { setIsSettingsOpen(false); setShowOnboarding(true); }}
          onOpenPricing={() => { setIsSettingsOpen(false); setIsPricingOpen(true); }}
          forceByokView={settingsForceByok}
        />
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        <PricingModal
          isOpen={isPricingOpen}
          onClose={() => setIsPricingOpen(false)}
          currentPlan={user?.plan ?? "free"}
          userEmail={user?.email}
          onChooseByok={() => { setIsPricingOpen(false); setSettingsForceByok(true); setIsSettingsOpen(true); }}
        />
      </Suspense>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* ── ⌘K Command Palette ── */}
      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
        onNavigate={(view) => setCurrentView(view as any)}
        onOpenSettings={() => { setIsCmdPaletteOpen(false); setIsSettingsOpen(true); }}
        onEditProfile={() => { setIsCmdPaletteOpen(false); setIsEditingProfile(true); }}
        savedCVs={savedCVs}
        darkMode={!!darkMode}
      />

      {/* ── JSON import dialog ── */}
      {pendingJsonImport && (
        <Suspense fallback={null}>
          <JsonImportDialog
            pendingImport={pendingJsonImport}
            activeSlotName={activeSlot?.name}
            onConfirmUpdate={handleConfirmUpdateCurrentProfile}
            onConfirmCreate={handleConfirmCreateNewProfile}
            onCancel={handleCancelJsonImport}
          />
        </Suspense>
      )}

      {/* ── Word import conflict dialog ── */}
      {pendingWordImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Different person detected</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  The imported CV appears to belong to a different person than your current profile.
                  What would you like to do?
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-2.5">
              Imported name: <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {pendingWordImport.profile?.personalInfo?.name || 'Unknown'}
              </span>
              {activeSlot?.name && (
                <> · Current profile: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeSlot.name}</span></>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleConfirmReplaceWordImport}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                Replace current profile
              </button>
              {canAddWordImportSlot && (
                <button
                  onClick={handleConfirmCreateNewWordImport}
                  className="w-full py-2.5 px-4 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                >
                  Create new profile slot
                </button>
              )}
              <button
                onClick={handleCancelWordImport}
                className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <AuthModal
          open={authModalOpen}
          onSuccess={onAuthSuccess}
          onDismiss={onAuthDismiss}
          mode={authModalMode}
        />
      </Suspense>

      {isNewUser && user && (
        <Suspense fallback={null}>
          <WelcomeModal
            name={user.name}
            email={user.email}
            onClose={() => {
              clearNewUser();
              if (!profileExists) setIsEditingProfile(true);
            }}
          />
        </Suspense>
      )}

    </div>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  if (window.location.pathname.startsWith("/admin")) {
    return <Suspense fallback={null}><AdminApp /></Suspense>;
  }
  if (window.location.pathname.startsWith("/how-it-works")) {
    return <Suspense fallback={null}><VideoTemplate /></Suspense>;
  }
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
};

export default App;
