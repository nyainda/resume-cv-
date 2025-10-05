
import React, { useState, useCallback, useMemo } from 'react';
import { UserProfile, CVData, SavedCV } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSessionStorage } from './hooks/useSessionStorage';
import ProfileForm from './components/ProfileForm';
import CVGenerator from './components/CVGenerator';
import SavedCVs from './components/SavedCVs';
import { Edit, User, List } from './components/icons';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
  const [savedCVs, setSavedCVs] = useLocalStorage<SavedCV[]>('savedCVs', []);
  const [currentCV, setCurrentCV] = useSessionStorage<CVData | null>('currentCV', null);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(!userProfile);

  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsEditingProfile(false);
  };

  const handleSaveCV = (cvData: CVData) => {
    const cvName = prompt("Enter a name for this CV (e.g., Software Engineer - Google):", `CV for ${cvData.experience[0]?.jobTitle || 'New Role'}`);
    if (cvName) {
      const newSavedCV: SavedCV = {
        id: Date.now().toString(),
        name: cvName,
        createdAt: new Date().toISOString(),
        data: cvData,
      };
      setSavedCVs(prev => [newSavedCV, ...prev]);
      alert("CV Saved Successfully!");
    }
  };

  const handleDeleteCV = useCallback((id: string) => {
    if (window.confirm("Are you sure you want to delete this CV?")) {
      setSavedCVs(prev => prev.filter(cv => cv.id !== id));
    }
  }, [setSavedCVs]);

  const handleLoadCV = useCallback((cvData: CVData) => {
    setCurrentCV(cvData);
    setIsEditingProfile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentCV]);

  const profileExists = useMemo(() => userProfile !== null, [userProfile]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">AI CV Builder</h1>
          <div className="flex items-center gap-4">
             {profileExists && (
               <button 
                  onClick={() => setIsEditingProfile(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                >
                  <User className="h-4 w-4" />
                  Edit Profile
                </button>
             )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24 space-y-6">
              {profileExists && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-xl font-semibold flex items-center gap-2"><User className="h-6 w-6" /> My Profile</h2>
                     <button onClick={() => setIsEditingProfile(true)} className="text-blue-500 hover:underline text-sm font-medium flex items-center gap-1"><Edit className="h-3 w-3" /> Edit</button>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                     <p><strong>Name:</strong> {userProfile?.personalInfo.name}</p>
                     <p><strong>Email:</strong> {userProfile?.personalInfo.email}</p>
                  </div>
                </div>
              )}

              {savedCVs.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><List className="h-6 w-6" /> Saved CVs</h2>
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
              />
            ) : (
              <CVGenerator 
                userProfile={userProfile}
                currentCV={currentCV}
                setCurrentCV={setCurrentCV}
                onSaveCV={handleSaveCV}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
