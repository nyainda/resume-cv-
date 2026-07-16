// Routes the main content area to the correct view component based on currentView.
import React, { lazy, Suspense } from 'react';
import { CVData, UserProfile, UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication, STARStory } from '../types';
import type { WorkerUser } from '../services/authService';
import { PremiumGateWrapper } from './premium/PremiumGateWrapper';

// ── Lazy views — each gets its own JS chunk, loaded on first navigation ────────
const ProfileForm          = lazy(() => import('./ProfileForm'));
const CVGenerator          = lazy(() => import('./CVGenerator'));
const LinkedInGenerator    = lazy(() => import('./LinkedInGenerator'));
const InterviewPrep        = lazy(() => import('./InterviewPrep'));
const ScholarshipEssayWriter = lazy(() => import('./ScholarshipEssayWriter'));
const DashboardHome        = lazy(() => import('./DashboardHome'));
const CVHistory            = lazy(() => import('./CVHistory'));
const CVToolkit            = lazy(() => import('./CVToolkit'));
const EmailApply           = lazy(() => import('./EmailApply'));
const Tracker              = lazy(() => import('./Tracker'));
const NegotiationCoach     = lazy(() => import('./NegotiationCoach'));
const AnalyticsDashboard   = lazy(() => import('./AnalyticsDashboard'));
const ScoreMyCVPage        = lazy(() => import('./ScoreMyCVPage'));
const CareerPivotPage      = lazy(() => import('./CareerPivotPage'));
const AdminLeaksPage       = lazy(() => import('./AdminLeaksPage'));
const AdminCVEnginePage    = lazy(() => import('./AdminCVEnginePage'));
const StorageMapPage       = lazy(() => import('./StorageMapPage'));
const AccountPage          = lazy(() => import('./AccountPage'));
const SettingsPage         = lazy(() => import('./SettingsPage'));
const ShareProfilePage     = lazy(() => import('./ShareProfilePage'));

// ── Shared fallback spinner ────────────────────────────────────────────────────
const ViewFallback: React.FC = () => (
  <div className="flex items-center justify-center py-20 text-zinc-400 dark:text-zinc-600">
    <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  </div>
);

import { clearQueueForAccount, enqueueSlotSync } from '../services/storage/syncQueue';

interface AppViewRouterProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  profileExists: boolean;
  isEditingProfile: boolean;
  setIsEditingProfile: (v: boolean) => void;
  userProfile: UserProfile | null;
  currentCV: CVData | null;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  activeSlot: UserProfileSlot | null | undefined;
  profiles: UserProfileSlot[];
  savedCVs: SavedCV[];
  savedCoverLetters: SavedCoverLetter[];
  trackedApps: TrackedApplication[];
  setTrackedApps: React.Dispatch<React.SetStateAction<TrackedApplication[]>>;
  starStories: STARStory[];
  setStarStories: React.Dispatch<React.SetStateAction<STARStory[]>>;
  apiKeySet: boolean;
  tavilyApiKey: string | null;
  brevoApiKey: string | null;
  user: WorkerUser | null | undefined;
  isAuthenticated: boolean;
  d1SyncPending?: boolean;
  jsonImportTimestamp: number | undefined;
  emailJd: string;
  interviewPrepJd: string;
  toolkitSuggestions: string | null;
  setToolkitSuggestions: (v: string | null) => void;
  toolkitForceTab: string | undefined;
  setToolkitForceTab: (v: string | undefined) => void;
  // handlers
  onSaveCV: (cvData: CVData, purpose: 'job' | 'academic' | 'general') => void;
  onAutoTrack: (details: { roleTitle: string; company: string; savedCvName: string }) => void;
  onApplyViaEmail: (jd: string, cv: CVData) => void;
  onGoToInterviewPrep: (jd: string) => void;
  onRestoreProfileBullets: () => void;
  onSaveStories: (stories: STARStory[]) => void;
  onSlotUpdate: (update: Partial<any>) => void;
  onPinField: (field: string) => void;
  onUnpinField: () => void;
  onGoToGenerator: (extraInstructions?: string) => void;
  onProfileImported: (profile: UserProfile) => void;
  onProfileSave: (profile: UserProfile) => void;
  onGitHubCVGenerated: (cv: CVData) => void;
  onJsonProfileImported: (profile: UserProfile) => void;
  onDeleteCV: (id: string) => void;
  onLoadCV: (cv: CVData) => void;
  onSwitchProfile: (slot: UserProfileSlot) => void;
  onDeleteAccount: () => Promise<void>;
  onClearAllData: () => Promise<void>;
  signOut: () => Promise<void>;
  setShowLanding: (v: boolean) => void;
  setIsSettingsOpen: (v: boolean) => void;
  setIsPricingOpen: (v: boolean) => void;
  // Settings page extras
  darkMode?: boolean;
  setDarkMode?: (v: boolean | ((prev: boolean) => boolean)) => void;
  currentApiSettings?: import('../types').ApiSettings;
  onSaveApiSettings?: (settings: import('../types').ApiSettings) => void;
  onOpenOnboarding?: () => void;
}

const AppViewRouter: React.FC<AppViewRouterProps> = ({
  currentView,
  setCurrentView,
  profileExists,
  isEditingProfile,
  setIsEditingProfile,
  userProfile,
  currentCV,
  setCurrentCV,
  activeSlot,
  profiles,
  savedCVs,
  savedCoverLetters,
  trackedApps,
  setTrackedApps,
  starStories,
  setStarStories,
  apiKeySet,
  tavilyApiKey,
  brevoApiKey,
  user,
  isAuthenticated,
  d1SyncPending = false,
  jsonImportTimestamp,
  emailJd,
  interviewPrepJd,
  toolkitSuggestions,
  setToolkitSuggestions,
  toolkitForceTab,
  setToolkitForceTab,
  onSaveCV,
  onAutoTrack,
  onApplyViaEmail,
  onGoToInterviewPrep,
  onRestoreProfileBullets,
  onSaveStories,
  onSlotUpdate,
  onPinField,
  onUnpinField,
  onGoToGenerator,
  onProfileImported,
  onProfileSave,
  onGitHubCVGenerated,
  onJsonProfileImported,
  onDeleteCV,
  onLoadCV,
  onSwitchProfile,
  onDeleteAccount,
  onClearAllData,
  signOut,
  setShowLanding,
  setIsSettingsOpen,
  setIsPricingOpen,
  darkMode = false,
  setDarkMode,
  currentApiSettings,
  onSaveApiSettings,
  onOpenOnboarding,
}) => {
  return (
    <main className="px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pt-8">
      <div>
        {/* ── Main content column (full-width) ── */}
        <div>
          <Suspense fallback={<ViewFallback />}>
          {(!profileExists || isEditingProfile) && d1SyncPending ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-zinc-400">
              <div className="w-8 h-8 border-3 border-zinc-200 border-t-[#C9A84C] rounded-full animate-spin" style={{ borderWidth: '3px' }} />
              <p className="text-sm font-medium">Loading your profile…</p>
            </div>
          ) : !profileExists || isEditingProfile ? (
            <ProfileForm
              existingProfile={userProfile}
              onSave={onProfileSave}
              onCancel={() => profileExists && setIsEditingProfile(false)}
              currentCV={currentCV}
              apiKeySet={apiKeySet}
              openSettings={() => setIsSettingsOpen(true)}
              onProfileImported={onProfileImported}
              onJsonImported={onJsonProfileImported}
            />
          ) : (
            <div className="space-y-6">
              {/* Quick-Score banner */}
              {currentView === 'generator' && currentCV && (currentCV.summary || (currentCV.experience ?? []).length > 0) && (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl border border-[#C9A84C]/30"
                  style={{ background: 'linear-gradient(135deg, #1B2B4B08 0%, #C9A84C08 100%)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0">📊</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight">Ready to score this CV?</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Human voice · Bullet quality · Career logic · ATS match</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentView('score')}
                    className="flex-shrink-0 w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold text-white whitespace-nowrap transition-opacity hover:opacity-90"
                    style={{ background: '#1B2B4B' }}
                  >
                    Score My CV →
                  </button>
                </div>
              )}

              {currentView === 'generator' && (
                <CVGenerator
                  key={activeSlot?.id ?? 'default'}
                  userProfile={userProfile!}
                  currentCV={currentCV}
                  setCurrentCV={setCurrentCV}
                  onSaveCV={onSaveCV}
                  onAutoTrack={onAutoTrack}
                  apiKeySet={apiKeySet}
                  openSettings={() => setIsSettingsOpen(true)}
                  onApplyViaEmail={onApplyViaEmail}
                  onGoToInterviewPrep={onGoToInterviewPrep}
                  onRestoreProfileBullets={onRestoreProfileBullets}
                  savedCVs={savedCVs}
                  toolkitSuggestions={toolkitSuggestions}
                  onDismissToolkitSuggestions={() => setToolkitSuggestions(null)}
                  onSaveStories={onSaveStories}
                  importedFromJson={jsonImportTimestamp}
                  profileId={activeSlot?.id ?? ''}
                  initialJobDescription={activeSlot?.jobDescription ?? (activeSlot as any)?.currentJobDescription ?? ''}
                  initialTargetCompany={activeSlot?.targetCompany ?? ''}
                  initialTargetJobTitle={activeSlot?.targetJobTitle ?? ''}
                  initialCvPurpose={activeSlot?.cvPurpose}
                  initialGenerationMode={activeSlot?.generationMode}
                  initialJdKeywords={activeSlot?.jdKeywords}
                  onSlotUpdate={onSlotUpdate}
                  onPinField={onPinField}
                  onUnpinField={onUnpinField}
                  onUpgrade={() => setIsPricingOpen(true)}
                  openToolkitAtQualityAudit={() => {
                    setToolkitForceTab('hr-detector');
                    setCurrentView('toolkit');
                    setTimeout(() => setToolkitForceTab(undefined), 200);
                  }}
                  activeSlot={activeSlot}
                />
              )}

              {currentView === 'linkedin' && (
                <PremiumGateWrapper feature="linkedin-optimizer" blockContent>
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <LinkedInGenerator
                      userProfile={userProfile!}
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                    />
                  </div>
                </PremiumGateWrapper>
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

              {currentView === 'essays' && (
                <ScholarshipEssayWriter
                  userProfile={userProfile!}
                  apiKeySet={apiKeySet}
                  openSettings={() => setIsSettingsOpen(true)}
                />
              )}

              {currentView === 'dashboard' && (
                <DashboardHome
                  profiles={profiles}
                  activeSlot={activeSlot}
                  currentCV={currentCV}
                  isAuthenticated={isAuthenticated}
                  onNavigate={(view) => setCurrentView(view as any)}
                  onEditProfile={() => setIsEditingProfile(true)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}

              {currentView === 'history' && (
                <CVHistory
                  savedCVs={savedCVs}
                  onLoad={(cv) => {
                    onLoadCV(cv);
                    setCurrentView('generator');
                  }}
                  onDelete={onDeleteCV}
                  userProfile={userProfile!}
                />
              )}

              {currentView === 'toolkit' && (
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                  <CVToolkit
                    userProfile={userProfile!}
                    apiKeySet={apiKeySet}
                    tavilyApiKey={tavilyApiKey}
                    openSettings={() => setIsSettingsOpen(true)}
                    onGoToGenerator={onGoToGenerator}
                    onProfileImported={onProfileImported}
                    onGitHubCVGenerated={onGitHubCVGenerated}
                    currentCV={currentCV}
                    onCurrentCVUpdated={(cv) => {
                      setCurrentCV(cv);
                      if (isAuthenticated && activeSlot) enqueueSlotSync({ ...activeSlot, currentCV: cv }).catch(() => {});
                    }}
                    forceTab={toolkitForceTab as any}
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
                  <Tracker
                    trackedApps={trackedApps}
                    setTrackedApps={setTrackedApps}
                    savedCVs={savedCVs}
                    starStories={starStories}
                    setStarStories={setStarStories}
                  />
                </div>
              )}

              {currentView === 'negotiation' && (
                <PremiumGateWrapper feature="salary-negotiation" blockContent>
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <NegotiationCoach
                      apiKeySet={apiKeySet}
                      openSettings={() => setIsSettingsOpen(true)}
                      userProfile={userProfile}
                    />
                  </div>
                </PremiumGateWrapper>
              )}

              {currentView === 'analytics' && (
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                  <AnalyticsDashboard
                    trackedApps={trackedApps}
                    onGoToTracker={() => setCurrentView('tracker')}
                  />
                </div>
              )}

              {currentView === 'score' && (
                <ScoreMyCVPage
                  currentCV={currentCV}
                  onGoToGenerator={() => setCurrentView('generator')}
                  onCVUpdate={(cv) => {
                    setCurrentCV(cv);
                    if (isAuthenticated && activeSlot) enqueueSlotSync({ ...activeSlot, currentCV: cv }).catch(() => {});
                  }}
                />
              )}

              {currentView === 'pivot' && (
                <PremiumGateWrapper feature="career-pivot" blockContent>
                  <CareerPivotPage
                    currentCV={currentCV}
                    onGoToGenerator={() => setCurrentView('generator')}
                    onGoToScore={() => setCurrentView('score')}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                  />
                </PremiumGateWrapper>
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

              {currentView === 'storage-map' && (
                <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-neutral-700">
                  <StorageMapPage />
                </div>
              )}

              {currentView === 'account' && (
                <AccountPage
                  workerUser={user}
                  profiles={profiles}
                  onSignOut={async () => {
                    await clearQueueForAccount().catch(() => {});
                    await signOut();
                    setShowLanding(true);
                  }}
                  onDeleteAccount={onDeleteAccount}
                  onClearAllData={onClearAllData}
                  onBack={() => setCurrentView('generator')}
                  onUpgrade={() => setIsPricingOpen(true)}
                  onEditProfile={() => setIsEditingProfile(true)}
                />
              )}

              {currentView === 'share-profile' && (
                <ShareProfilePage
                  cvData={currentCV}
                  userProfile={userProfile}
                  user={user}
                  isAuthenticated={isAuthenticated}
                  savedCoverLetters={savedCoverLetters}
                  onGoToGenerator={() => setCurrentView('generator')}
                />
              )}

              {currentView === 'settings' && currentApiSettings && onSaveApiSettings && (
                <SettingsPage
                  user={user}
                  profiles={profiles}
                  activeSlot={activeSlot}
                  d1SyncPending={d1SyncPending}
                  darkMode={darkMode}
                  setDarkMode={setDarkMode ?? (() => {})}
                  currentApiSettings={currentApiSettings}
                  onSaveApiSettings={onSaveApiSettings}
                  onSignOut={async () => {
                    await clearQueueForAccount().catch(() => {});
                    await signOut();
                    setShowLanding(true);
                  }}
                  onDeleteAccount={onDeleteAccount}
                  onClearAllData={onClearAllData}
                  onBack={() => setCurrentView('dashboard')}
                  onUpgrade={() => setIsPricingOpen(true)}
                  onOpenOnboarding={() => { onOpenOnboarding?.(); }}
                  onSwitchProfile={onSwitchProfile}
                />
              )}
            </div>
          )}
          </Suspense>
        </div>
      </div>
    </main>
  );
};

export default AppViewRouter;
