// Routes the main content area to the correct view component based on currentView.
import React from 'react';
import { CVData, UserProfile, UserProfileSlot, SavedCV, SavedCoverLetter, TrackedApplication, STARStory } from '../types';
import type { WorkerUser } from '../services/authService';
import ProfileForm from './ProfileForm';
import CVGenerator from './CVGenerator';
import LinkedInGenerator from './LinkedInGenerator';
import InterviewPrep from './InterviewPrep';
import ScholarshipEssayWriter from './ScholarshipEssayWriter';
import DashboardHome from './DashboardHome';
import CVHistory from './CVHistory';
import CVToolkit from './CVToolkit';
import EmailApply from './EmailApply';
import Tracker from './Tracker';
import NegotiationCoach from './NegotiationCoach';
import AnalyticsDashboard from './AnalyticsDashboard';
import ScoreMyCVPage from './ScoreMyCVPage';
import CareerPivotPage from './CareerPivotPage';
import AdminLeaksPage from './AdminLeaksPage';
import AdminCVEnginePage from './AdminCVEnginePage';
import StorageMapPage from './StorageMapPage';
import AccountPage from './AccountPage';
import { Target, User } from './icons';
import { colorBg } from '../utils/profileUtils';
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
  driveConnected: boolean;
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
  onConnectDrive: () => Promise<void>;
  requestDriveAccess: () => Promise<void>;
  signOut: () => Promise<void>;
  setShowLanding: (v: boolean) => void;
  setIsSettingsOpen: (v: boolean) => void;
  setIsPricingOpen: (v: boolean) => void;
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
  driveConnected,
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
  onConnectDrive,
  requestDriveAccess,
  signOut,
  setShowLanding,
  setIsSettingsOpen,
  setIsPricingOpen,
}) => {
  return (
    <main className="container mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-28 lg:px-8 lg:pt-8 lg:pb-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* ── Left sidebar — profile + recent activity ── */}
        {(!profileExists || isEditingProfile || currentView === 'generator') && (
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
                    <div className="space-y-1">
                      {profiles.slice(0, 3).map((slot) => (
                        <div
                          key={slot.id}
                          onClick={() => onSwitchProfile(slot)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${slot.id === activeSlot?.id ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/10' : 'hover:bg-zinc-50 dark:hover:bg-neutral-700/50'}`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full ${colorBg(slot.color)} flex-shrink-0 flex items-center justify-center text-[9px] text-white font-bold`}
                          >
                            {(slot.profile?.personalInfo?.name || slot.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span
                            className={`text-xs font-semibold truncate ${slot.id === activeSlot?.id ? 'text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'text-zinc-600 dark:text-zinc-400'}`}
                          >
                            {slot.name}
                          </span>
                          {slot.id === activeSlot?.id && (
                            <span className="ml-auto text-[9px] font-extrabold text-[#C9A84C] uppercase">active</span>
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
                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Name</span>
                        <span className="text-sm font-semibold">{userProfile?.personalInfo?.name}</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                        <span>Skills</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {(userProfile?.skills ?? []).length}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Experience</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {(userProfile?.workExperience ?? []).length} roles
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentView === 'generator' && (
                <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold flex items-center gap-2">
                      <Target className="h-4 w-4 text-[#C9A84C]" /> Recent Activity
                    </h2>
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
                      {trackedApps.slice(0, 4).map((app) => {
                        const statusColors: Record<string, string> = {
                          Wishlist: 'bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-400',
                          Applied: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                          Interviewing: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                          Offer: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
                          Rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
                        };
                        return (
                          <div
                            key={app.id}
                            onClick={() => setCurrentView('tracker')}
                            className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{app.roleTitle}</p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[app.status] || statusColors.Applied}`}>
                              {app.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={() => setCurrentView('tracker')}
                    className="w-full mt-4 text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] py-2.5 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-lg hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Target className="h-3.5 w-3.5" /> View All Applications
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ── Mobile recent activity strip ── */}
        {profileExists && !isEditingProfile && currentView === 'generator' && (
          <div className="lg:hidden col-span-1">
            <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Target className="h-4 w-4 text-[#C9A84C]" /> Recent Activity
                </h2>
                <button
                  onClick={() => setCurrentView('tracker')}
                  className="text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
                >
                  View All
                </button>
              </div>
              {trackedApps.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-3">No applications tracked yet.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                  {trackedApps.slice(0, 6).map((app) => (
                    <div
                      key={app.id}
                      onClick={() => setCurrentView('tracker')}
                      className="flex-shrink-0 w-44 bg-white dark:bg-neutral-800 border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all border-zinc-200 dark:border-neutral-700"
                    >
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate mt-1">{app.roleTitle}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Main content column ── */}
        <div
          className={`${!profileExists || isEditingProfile || currentView === 'generator' ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'}`}
        >
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
                    onClick={() => setCurrentView('score')}
                    className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-white whitespace-nowrap transition-opacity hover:opacity-90"
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
                  driveConnected={driveConnected}
                  onNavigate={(view) => setCurrentView(view as any)}
                  onConnectDrive={onConnectDrive}
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
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                  <NegotiationCoach
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                    userProfile={userProfile}
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
                <CareerPivotPage
                  currentCV={currentCV}
                  onGoToGenerator={() => setCurrentView('generator')}
                  onGoToScore={() => setCurrentView('score')}
                  apiKeySet={apiKeySet}
                  openSettings={() => setIsSettingsOpen(true)}
                />
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
                  driveConnected={driveConnected}
                  onConnectDrive={requestDriveAccess}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default AppViewRouter;
