import React, { useState, useCallback, useMemo } from 'react';
import { UserProfile, CVData, SavedCV, ApiSettings, TrackedApplication } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import ProfileForm from './components/ProfileForm';
import CVGenerator from './components/CVGenerator';
import SavedCVs from './components/SavedCVs';
import SettingsModal from './components/SettingsModal';
import Tracker from './components/Tracker';
import { Edit, User, List, Settings, FileText, Target } from './components/icons';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
  const [savedCVs, setSavedCVs] = useLocalStorage<SavedCV[]>('savedCVs', []);
  const [currentCV, setCurrentCV] = useLocalStorage<CVData | null>('currentCV', null);
  const [trackedApps, setTrackedApps] = useLocalStorage<TrackedApplication[]>('trackedApps', []);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(!userProfile);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiSettings, setApiSettings] = useLocalStorage<ApiSettings>('apiSettings', { provider: 'gemini', apiKey: null });

  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsEditingProfile(false);
  };

  const handleSaveCV = (cvData: CVData, purpose: 'job' | 'academic') => {
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
      alert("CV Saved Successfully!");
    }
  };

  const handleDeleteCV = useCallback((id: string) => {
    if (window.confirm("Are you sure you want to delete this CV? This will not delete tracked applications using this CV.")) {
      setSavedCVs(prev => prev.filter(cv => cv.id !== id));
    }
  }, [setSavedCVs]);

  const handleLoadCV = useCallback((cvData: CVData) => {
    setCurrentCV(cvData);
    setIsEditingProfile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentCV]);

  const profileExists = useMemo(() => userProfile !== null, [userProfile]);
  const apiKeySet = useMemo(() => !!apiSettings?.apiKey, [apiSettings]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50">
      <header className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-indigo-600" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              AI CV Builder
            </h1>
          </div>
          <div className="flex items-center gap-2">
             {profileExists && (
               <button 
                  onClick={() => setIsEditingProfile(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                >
                  <User className="h-4 w-4" />
                  Edit Profile
                </button>
             )}
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24 space-y-6">
              {profileExists && (
                <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-lg font-semibold flex items-center gap-3"><User className="h-5 w-5 text-zinc-500" /> My Profile</h2>
                     <button onClick={() => setIsEditingProfile(true)} className="text-indigo-600 hover:underline text-sm font-medium flex items-center gap-1"><Edit className="h-3 w-3" /> Edit</button>
                  </div>
                  <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                     <p><strong>Name:</strong> {userProfile?.personalInfo.name}</p>
                     <p><strong>Email:</strong> {userProfile?.personalInfo.email}</p>
                  </div>
                </div>
              )}
              
              <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5">
                 <h2 className="text-lg font-semibold mb-4 flex items-center gap-3"><Target className="h-5 w-5 text-zinc-500" /> Application Tracker</h2>
                 <p className="text-sm text-zinc-500 dark:text-zinc-400 -mt-2 mb-4">A simple tracker for your applications.</p>
                 <Tracker trackedApps={trackedApps} setTrackedApps={setTrackedApps} savedCVs={savedCVs} />
              </div>


              {savedCVs.length > 0 && (
                <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-3"><List className="h-5 w-5 text-zinc-500" /> Saved CVs</h2>
                  <SavedCVs savedCVs={savedCVs} onLoad={handleLoadCV} onDelete={handleDeleteCV} />
                </div>
              )}
            </div>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-8 xl:col-span-9">
            {!profileExists || isEditingProfile ? (
              <ProfileForm 
                existingProfile={userProfile} 
                onSave={handleProfileSave} 
                onCancel={() => profileExists && setIsEditingProfile(false)}
                apiKeySet={apiKeySet}
                openSettings={() => setIsSettingsOpen(true)}
              />
            ) : (
              <CVGenerator 
                userProfile={userProfile}
                currentCV={currentCV}
                setCurrentCV={setCurrentCV}
                onSaveCV={handleSaveCV}
                apiKeySet={apiKeySet}
                openSettings={() => setIsSettingsOpen(true)}
              />
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
    </div>
  );
};

export default App;