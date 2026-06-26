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
  ApiSettings,
  UserProfileSlot,
} from "./types";
import { useStorage } from "./hooks/useStorage";
import * as KeyVault from "./services/security/KeyVault";
import { setRuntimeKeys } from "./services/security/RuntimeKeys";
import { useProfileSlots } from "./hooks/useProfileSlots";
import { getUserPrefix } from "./services/storage/userStorageNamespace";
import { enqueuePrefsSync, clearQueueForAccount } from "./services/storage/syncQueue";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import type { WorkerUser } from "./services/authService";
import AuthModal from "./components/AuthModal";
import WelcomeModal from "./components/WelcomeModal";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/ui/Toast";
import PricingModal from "./components/PricingModal";
import FreePlanNudge from "./components/FreePlanNudge";
import SharedCVView from "./components/SharedCVView";
import { decodeSharePayload, SharedCVPayload } from "./components/ShareCVModal";
import { fetchSharePayload } from "./services/shareService";
import { fetchPublicProfile } from "./services/publicProfileService";
import SettingsModal from "./components/SettingsModal";
import InactivityWarningModal from "./components/InactivityWarningModal";
import LandingPage from "./components/LandingPage";
import VideoTemplate from "./components/video/VideoTemplate";
import DriveBackupPrompt from "./components/DriveBackupPrompt";
import DriveConflictModal from "./components/DriveConflictModal";
import OfflineBanner from "./components/OfflineBanner";
import { OnboardingWizard, type PendingImportType } from "./components/OnboardingWizard";
import { extractTextFromDocx, parseWordTextToProfile } from "./services/wordImportService";
import { generateProfileFromFileWithGemini } from "./services/geminiService";
import AdminApp from "./components/admin/AdminApp";
import JsonImportDialog from "./components/JsonImportDialog";
import { migrateLocalToDrive } from "./services/storage/StorageRouter";
import { isCVEngineConfigured } from "./services/cvEngineClient";
import { useAutoSync } from "./hooks/useAutoSync";
import { useBootEffects } from "./hooks/useBootEffects";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useJsonImport } from "./hooks/useJsonImport";
import { useProfileManager } from "./hooks/useProfileManager";
import { useCVManager } from "./hooks/useCVManager";
import AppNavbar from "./components/AppNavbar";
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
    driveConnected,
    requestDriveAccess,
    driveToken,
  } = useAuth();
  const onAuthSuccess = useCallback(
    (_token: string, u: WorkerUser) => _rawOnAuthSuccess(u),
    [_rawOnAuthSuccess],
  );
  useAutoSync(isAuthenticated);

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
  } = useProfileSlots();

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
    driveRestoreSlots,
    setDriveRestoreSlots,
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
    driveToken,
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
    handleJsonProfileImported,
    handleConfirmUpdateCurrentProfile,
    handleConfirmCreateNewProfile,
    handleCancelJsonImport,
  } = useJsonImport({
    activeSlot,
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

  // ── Drive backup prompt ───────────────────────────────────────────────────
  const [showDrivePrompt, setShowDrivePrompt] = useState(false);
  const [drivePromptDismissed, setDrivePromptDismissed] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveMigrating, setDriveMigrating] = useState(false);
  const [driveMigrationProgress, setDriveMigrationProgress] = useState<{ uploaded: number; total: number } | null>(null);
  const [driveMigrationDone, setDriveMigrationDone] = useState(false);

  useEffect(() => {
    if (driveConnected || drivePromptDismissed || !isAuthenticated) return;
    const check = async () => {
      try {
        const est = await navigator.storage.estimate();
        const used = est.usage ?? 0;
        const quota = est.quota ?? 0;
        if (quota > 0 && used / quota > 0.7) setShowDrivePrompt(true);
      } catch { /* non-fatal */ }
    };
    const t = setTimeout(check, 10_000);
    return () => clearTimeout(t);
  }, [driveConnected, drivePromptDismissed, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || driveConnected || drivePromptDismissed) return;
    const seenKey = `procv:drive_nudge_seen:${user?.email ?? "anon"}`;
    if (sessionStorage.getItem(seenKey)) return;
    const t = setTimeout(() => {
      if (!driveConnected && !drivePromptDismissed) {
        setShowDrivePrompt(true);
        sessionStorage.setItem(seenKey, "1");
      }
    }, 8_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, driveConnected]);

  useEffect(() => {
    const handleQuotaFull = () => {
      if (!driveConnected && !drivePromptDismissed && isAuthenticated) {
        setShowDrivePrompt(true);
      }
    };
    window.addEventListener("storage-quota-warning", handleQuotaFull);
    return () => window.removeEventListener("storage-quota-warning", handleQuotaFull);
  }, [driveConnected, drivePromptDismissed, isAuthenticated]);

  const handleConnectDrive = async () => {
    setDriveConnecting(true);
    setDriveMigrationDone(false);
    try {
      await requestDriveAccess();
      setDriveConnecting(false);
      setDriveMigrating(true);
      await migrateLocalToDrive(
        (uploaded, total) => setDriveMigrationProgress({ uploaded, total }),
        user?.email ?? undefined,
      );
      setDriveMigrationProgress(null);
      setDriveMigrating(false);
      setDriveMigrationDone(true);
      setTimeout(() => setShowDrivePrompt(false), 1800);
    } catch {
      setDriveConnecting(false);
      setDriveMigrating(false);
      setDriveMigrationProgress(null);
    }
  };

  // ── Shared CV payload (hash links) ───────────────────────────────────────
  const [sharedCVPayload, setSharedCVPayload] = useState<SharedCVPayload | null>(null);
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#s=")) {
      const id = hash.slice("#s=".length);
      if (id) {
        fetchSharePayload(id).then(compressed => {
          if (compressed) {
            const payload = decodeSharePayload(compressed);
            if (payload) setSharedCVPayload(payload);
          }
        });
      }
    } else if (hash.startsWith("#p=")) {
      const slugOrId = hash.slice("#p=".length);
      if (slugOrId) {
        fetchPublicProfile(slugOrId).then(payload => {
          if (payload) setSharedCVPayload(payload);
        });
      }
    } else if (hash.startsWith("#share=")) {
      const encoded = hash.slice("#share=".length);
      const payload = decodeSharePayload(encoded);
      if (payload) setSharedCVPayload(payload);
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
      plan: "premium" | "free";
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
          toast.error("Word Import Failed", e?.message ?? "Could not parse the Word document. Try again from your Profile page.");
        }
      }
      if (opts.pendingImportFile && opts.pendingImportType) {
        try {
          const file = opts.pendingImportFile;
          const mimeType = file.type || (opts.pendingImportType === "pdf" ? "application/pdf" : "image/jpeg");
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const profile = await generateProfileFromFileWithGemini(base64, mimeType);
          handleWordProfileImported(profile);
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
      !!(apiSettings?.apiKey || (apiSettings as any)?.claudeApiKey),
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
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}

      <DriveBackupPrompt
        show={showDrivePrompt}
        driveConnected={driveConnected}
        driveMigrationDone={driveMigrationDone}
        driveConnecting={driveConnecting}
        driveMigrating={driveMigrating}
        driveMigrationProgress={driveMigrationProgress}
        onConnect={handleConnectDrive}
        onDismiss={() => { setShowDrivePrompt(false); setDrivePromptDismissed(true); }}
      />

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
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }}
        />
      )}

      <OfflineBanner />

      <AppNavbar
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
        onSwitchProfile={handleSwitchProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        onRenameProfile={handleRenameProfile}
      />

      <FreePlanNudge />

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
        driveConnected={driveConnected}
        jsonImportTimestamp={jsonImportTimestamp}
        emailJd={emailJd}
        interviewPrepJd={interviewPrepJd}
        toolkitSuggestions={toolkitSuggestions}
        setToolkitSuggestions={setToolkitSuggestions}
        toolkitForceTab={toolkitForceTab}
        setToolkitForceTab={setToolkitForceTab}
        onSaveCV={handleSaveCV}
        onAutoTrack={handleAutoTrack}
        onApplyViaEmail={handleApplyViaEmail}
        onGoToInterviewPrep={handleGoToInterviewPrep}
        onRestoreProfileBullets={handleRestoreProfileBullets}
        onSaveStories={handleSaveStories}
        onSlotUpdate={handleSlotUpdate}
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
        onConnectDrive={handleConnectDrive}
        requestDriveAccess={requestDriveAccess}
        signOut={signOut}
        setShowLanding={setShowLanding}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsPricingOpen={setIsPricingOpen}
      />

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
        currentPlan={user?.plan ?? "free"}
        userEmail={user?.email}
      />

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* ── JSON import dialog ── */}
      {pendingJsonImport && (
        <JsonImportDialog
          pendingImport={pendingJsonImport}
          activeSlotName={activeSlot?.name}
          onConfirmUpdate={handleConfirmUpdateCurrentProfile}
          onConfirmCreate={handleConfirmCreateNewProfile}
          onCancel={handleCancelJsonImport}
        />
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
                <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">Backed-up profiles found</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  We found {driveRestoreSlots.length} profile{driveRestoreSlots.length !== 1 ? "s" : ""} saved in your Google Drive. Restore them to this device?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { sessionStorage.setItem("procv:restore-dismissed", "1"); setDriveRestoreSlots(null); }}
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
                  toast.success("Profiles restored", `${driveRestoreSlots.length} profile${driveRestoreSlots.length !== 1 ? "s" : ""} restored from Google Drive.`);
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#1B2B4B] hover:bg-[#1B2B4B]/90 dark:bg-[#C9A84C] dark:text-[#1B2B4B] dark:hover:bg-[#C9A84C]/90 rounded-lg transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal
        open={authModalOpen}
        onSuccess={onAuthSuccess}
        onDismiss={onAuthDismiss}
        mode={authModalMode}
      />

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

      <DriveConflictModal
        onResolved={(key, action) => {
          if (action === "overwrite") {
            toast.success("Conflict Resolved", `Your local version of "${key}" was pushed to Drive.`);
          } else if (action === "pull") {
            toast.success("Conflict Resolved", `Drive version of "${key}" loaded — refreshing data.`);
          }
        }}
      />
    </div>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  if (window.location.pathname.startsWith("/admin")) {
    return <AdminApp />;
  }
  if (window.location.pathname.startsWith("/how-it-works")) {
    return <VideoTemplate />;
  }
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
};

export default App;
