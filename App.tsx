import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { UserProfile, CVData, SavedCV, ApiSettings, TrackedApplication } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/Toast';
import ProfileForm from './components/ProfileForm';
import CVGenerator from './components/CVGenerator';
import SavedCVs from './components/SavedCVs';
import CVHistory from './components/CVHistory';
import ScholarshipEssayWriter from './components/ScholarshipEssayWriter';
import SettingsModal from './components/SettingsModal';
import Tracker from './components/Tracker';
import { Edit, User, List, Settings, FileText, Target, Moon, Sun, BookOpen } from './components/icons';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
  const [savedCVs, setSavedCVs] = useLocalStorage<SavedCV[]>('savedCVs', []);
  const [currentCV, setCurrentCV] = useLocalStorage<CVData | null>('currentCV', null);
  const [trackedApps, setTrackedApps] = useLocalStorage<TrackedApplication[]>('trackedApps', []);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(!userProfile);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiSettings, setApiSettings] = useLocalStorage<ApiSettings>('apiSettings', { provider: 'gemini', apiKey: null });
  const [darkMode, setDarkMode] = useLocalStorage<boolean>('darkMode', false);
  const toast = useToast();

  // Sync dark mode class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsEditingProfile(false);
  };

  const handleSaveCV = (cvData: CVData, purpose: 'job' | 'academic' | 'general') => {
    const cvName = prompt("Enter a name for this CV (e.g., Software Engineer - Google):", `CV for ${cvData.experience[0]?.jobTitle || 'New Role'}`);
    if (cvName) {
      const newSavedCV: SavedCV = {
        id: Date.now().toString(),
        name: cvName,
        createdAt: new Date().toISOString(),
        data: cvData,
        purpose: purpose,
      };
      setSavedCVs(prev => [newSavedCV, ...prev]);
      toast.success('CV Saved Successfully!', `"${cvName}" has been saved to your library.`);
    }
  };

  const handleDeleteCV = useCallback((id: string) => {
    const cvToDelete = savedCVs.find(cv => cv.id === id);
    if (window.confirm("Are you sure you want to delete this CV? This will not delete tracked applications using this CV.")) {
      setSavedCVs(prev => prev.filter(cv => cv.id !== id));
      toast.success('CV Deleted', cvToDelete ? `"${cvToDelete.name}" has been removed.` : 'CV has been removed.');
    }
  }, [setSavedCVs, savedCVs, toast]);

  const handleLoadCV = useCallback((cvData: CVData) => {
    setCurrentCV(cvData);
    setIsEditingProfile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentCV]);

  const handleAutoTrack = useCallback((details: { roleTitle: string, company: string, savedCvName: string }) => {
    const newApp: TrackedApplication = {
      id: Date.now().toString(),
      savedCvId: 'auto-generated', // Placeholder for auto-generated
      savedCvName: details.savedCvName,
      roleTitle: details.roleTitle,
      company: details.company,
      status: 'Applied', // Default to 'Applied' when downloaded
      dateApplied: new Date().toISOString().split('T')[0],
      notes: `Automatically tracked after CV download on ${new Date().toLocaleDateString()}.`,
    };
    setTrackedApps(prev => [newApp, ...prev]);
    toast.success('Application Tracked!', `Added "${details.roleTitle}" at ${details.company} to your tracker.`);
  }, [setTrackedApps, toast]);

  const [currentView, setCurrentView] = useState<'generator' | 'essays' | 'history' | 'tracker'>('generator');

  const profileExists = useMemo(() => userProfile !== null, [userProfile]);
  const apiKeySet = useMemo(() => !!apiSettings?.apiKey, [apiSettings]);

  const navItems = [
    { id: 'generator', label: 'CV Generator', icon: FileText },
    { id: 'essays', label: 'Scholarship Essays', icon: BookOpen },
    { id: 'history', label: 'CV History', icon: List },
    { id: 'tracker', label: 'Job Tracker', icon: Target },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      <header className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 leading-none">
                AI CV Builder
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-none mt-0.5 hidden sm:block">
                Elite Career & Scholarship Suite
              </p>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          {profileExists && !isEditingProfile && (
            <nav className="hidden md:flex items-center bg-zinc-100 dark:bg-neutral-800 p-1 rounded-xl">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id as any)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                    ${currentView === item.id
                      ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }
                  `}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {profileExists && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Profile</span>
              </button>
            )}
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        {profileExists && !isEditingProfile && (
          <div className="md:hidden border-t border-zinc-200 dark:border-neutral-800 overflow-x-auto no-scrollbar">
            <div className="flex p-2 gap-1 min-w-max">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id as any)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap
                    ${currentView === item.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                    }
                  `}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          {/* Sidebar - hidden on mobile, sticky on desktop */}
          {(!profileExists || isEditingProfile || (currentView === 'generator' && profileExists)) && (
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
              <div className="sticky top-24 space-y-4">
                {profileExists && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold flex items-center gap-3"><User className="h-5 w-5 text-indigo-500" /> Profile Summary</h2>
                      <button onClick={() => setIsEditingProfile(true)} className="text-indigo-600 hover:underline text-xs font-bold uppercase tracking-wider">Edit</button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Name</span>
                        <span className="text-sm font-semibold">{userProfile?.personalInfo.name}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Email</span>
                        <span className="text-sm font-semibold truncate">{userProfile?.personalInfo.email}</span>
                      </div>
                      <div className="pt-2 border-t border-zinc-100 dark:border-neutral-700">
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
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

                {/* Compact Recent Activity widget (sidebar only) */}
                {currentView === 'generator' && (
                  <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold flex items-center gap-2">
                        <Target className="h-4 w-4 text-indigo-500" /> Recent Activity
                      </h2>
                      <span className="text-xs font-semibold text-zinc-400">{trackedApps.length} total</span>
                    </div>

                    {trackedApps.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto mb-3">
                          <Target className="h-5 w-5 text-indigo-400" />
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">No applications tracked yet.</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Go to Job Tracker to add one.</p>
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
                            <div
                              key={app.id}
                              onClick={() => setCurrentView('tracker')}
                              className="group flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 transition-colors cursor-pointer border border-transparent hover:border-zinc-100 dark:hover:border-neutral-700"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate leading-tight">{app.roleTitle}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{app.company}</p>
                              </div>
                              <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[app.status] || statusColors.Applied}`}>
                                {app.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      onClick={() => setCurrentView('tracker')}
                      className="w-full mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 py-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Target className="h-3.5 w-3.5" />
                      View All Applications
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Mobile-only Recent Activity strip (shown only when on generator view and profile exists) */}
          {profileExists && !isEditingProfile && currentView === 'generator' && (
            <div className="lg:hidden col-span-1">
              <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-500" /> Recent Activity
                  </h2>
                  <button
                    onClick={() => setCurrentView('tracker')}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View All
                  </button>
                </div>

                {trackedApps.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-3">
                    No applications tracked yet. Go to <button onClick={() => setCurrentView('tracker')} className="text-indigo-500 font-bold hover:underline">Job Tracker</button> to add one.
                  </p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
                    {trackedApps.slice(0, 6).map(app => {
                      const statusColors: Record<string, string> = {
                        Wishlist: 'border-zinc-200 dark:border-neutral-700',
                        Applied: 'border-blue-200 dark:border-blue-800',
                        Interviewing: 'border-amber-200 dark:border-amber-800',
                        Offer: 'border-emerald-200 dark:border-emerald-800',
                        Rejected: 'border-rose-200 dark:border-rose-800',
                      };
                      const pillColors: Record<string, string> = {
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
                          className={`flex-shrink-0 snap-start w-44 bg-white dark:bg-neutral-800 border-2 rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${statusColors[app.status]}`}
                        >
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pillColors[app.status]}`}>
                            {app.status}
                          </span>
                          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-2 truncate">{app.roleTitle}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div className={`
            ${(!profileExists || isEditingProfile || currentView === 'generator')
              ? 'lg:col-span-8 xl:col-span-9'
              : 'lg:col-span-12'
            }
          `}>
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
                    userProfile={userProfile}
                    currentCV={currentCV}
                    setCurrentCV={setCurrentCV}
                    onSaveCV={handleSaveCV}
                    onAutoTrack={handleAutoTrack}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                  />
                )}

                {currentView === 'essays' && (
                  <ScholarshipEssayWriter
                    userProfile={userProfile}
                    apiKeySet={apiKeySet}
                    openSettings={() => setIsSettingsOpen(true)}
                  />
                )}

                {currentView === 'history' && (
                  <CVHistory
                    savedCVs={savedCVs}
                    onLoad={(cv) => {
                      handleLoadCV(cv);
                      setCurrentView('generator');
                    }}
                    onDelete={handleDeleteCV}
                    userProfileName={userProfile.personalInfo.name}
                  />
                )}

                {currentView === 'tracker' && (
                  <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 sm:p-8">
                    <div className="mb-8">
                      <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Application Tracker</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Manage and track your job applications in one place.</p>
                    </div>
                    <Tracker trackedApps={trackedApps} setTrackedApps={setTrackedApps} savedCVs={savedCVs} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={setApiSettings}
        currentApiSettings={apiSettings}
      />

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
};

export default App;