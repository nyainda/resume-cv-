// Manages all CV, cover-letter, tracker, story, and cross-view navigation handlers.
import React, { useState, useRef, useCallback } from 'react';
import {
  CVData, SavedCV, SavedCoverLetter, TrackedApplication, STARStory,
  UserProfile, UserProfileSlot,
} from '../types';
import { auditCvQuality } from '../services/cvNumberFidelity';
import { saveCVData, deleteCVData } from '../services/storage/cvDataStore';
import { profileToCV } from '../utils/profileToCV';
import { isSameProfileIdentity, mergeProfileIntoCV } from '../utils/mergeProfileIntoCV';
import { invalidateCVCache } from '../services/geminiService';
import { syncProfileToCache } from '../services/profileCacheClient';
import { enqueueSlotSync } from '../services/storage/syncQueue';
import { canAddProfileSlot } from '../services/accountTierService';
import { useToast } from './useToast';

export interface PendingWordImport {
  profile: UserProfile;
  /** true = detected different person; always true when this dialog is shown */
  isDifferentPerson: boolean;
}

interface UseCVManagerConfig {
  savedCVs: SavedCV[];
  setSavedCVs: React.Dispatch<React.SetStateAction<SavedCV[]>>;
  setSavedCoverLetters: React.Dispatch<React.SetStateAction<SavedCoverLetter[]>>;
  setTrackedApps: React.Dispatch<React.SetStateAction<TrackedApplication[]>>;
  setStarStories: React.Dispatch<React.SetStateAction<STARStory[]>>;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  setCurrentView: (view: string) => void;
  setIsEditingProfile: React.Dispatch<React.SetStateAction<boolean>>;
  activeSlot: UserProfileSlot | null | undefined;
  profiles: UserProfileSlot[];
  setProfiles: React.Dispatch<React.SetStateAction<UserProfileSlot[]>>;
  setActiveProfileId: (id: string | null) => void;
  isAuthenticated: boolean;
  toast: ReturnType<typeof useToast>;
}

export function useCVManager({
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
}: UseCVManagerConfig) {
  // Cross-view pre-fill state — owned here so handlers can set them
  const [emailJd, setEmailJd] = useState<string>('');
  const [interviewPrepJd, setInterviewPrepJd] = useState<string>('');
  const [toolkitSuggestions, setToolkitSuggestions] = useState<string | null>(null);
  const [toolkitForceTab, setToolkitForceTab] = useState<string | undefined>(undefined);
  // Pending Word/PDF import — shown when the imported profile is a different person
  const [pendingWordImport, setPendingWordImport] = useState<PendingWordImport | null>(null);

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
    purpose: 'job' | 'academic' | 'general',
  ) => {
    const cvName = prompt(
      'Enter a name for this CV (e.g., Software Engineer - Google):',
      `CV for ${cvData.experience[0]?.jobTitle || 'New Role'}`,
    );
    if (cvName) {
      const id = Date.now().toString();
      saveCVData(id, cvData).catch(() => {});
      const newSavedCV: SavedCV = {
        id,
        name: cvName,
        createdAt: new Date().toISOString(),
        purpose,
        qualityReport: buildQualitySnapshot(cvData),
      };
      setSavedCVs((prev) => [newSavedCV, ...prev]);
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({
          ...activeSlot,
          savedCVs: [newSavedCV, ...(activeSlot.savedCVs ?? [])],
        }).catch(() => {});
      }
      toast.success(
        'CV Saved Successfully!',
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
        purpose: 'job',
        qualityReport: buildQualitySnapshot(cvData),
      };
      setSavedCVs((prev) => [newSavedCV, ...prev]);
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({
          ...activeSlot,
          savedCVs: [newSavedCV, ...(activeSlot.savedCVs ?? [])],
        }).catch(() => {});
      }
      toast.success('CV Saved!', `"${name}" saved to your CV library.`);
    },
    [setSavedCVs, toast, isAuthenticated, activeSlot],
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
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({
          ...activeSlot,
          savedCoverLetters: [newCL, ...(activeSlot.savedCoverLetters ?? [])],
        }).catch(() => {});
      }
      toast.success('Cover Letter Saved!', `"${name}" saved to your library.`);
    },
    [setSavedCoverLetters, toast, isAuthenticated, activeSlot],
  );

  const deleteCVTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDeleteCV = useCallback(
    (id: string) => {
      const cvToDelete = savedCVs.find((cv) => cv.id === id);
      if (!cvToDelete) return;
      const newSavedCVs = savedCVs.filter((cv) => cv.id !== id);
      setSavedCVs((prev) => prev.filter((cv) => cv.id !== id));
      if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
      toast.info('CV Deleted', `"${cvToDelete.name}" removed.`, () => {
        if (deleteCVTimerRef.current) clearTimeout(deleteCVTimerRef.current);
        setSavedCVs((prev) => [cvToDelete, ...prev]);
        toast.success('Restored', `"${cvToDelete.name}" has been restored.`);
      });
      deleteCVTimerRef.current = setTimeout(() => {
        deleteCVTimerRef.current = null;
        deleteCVData(id).catch(() => {});
        if (isAuthenticated && activeSlot) {
          enqueueSlotSync({ ...activeSlot, savedCVs: newSavedCVs }).catch(() => {});
        }
      }, 6000);
    },
    [setSavedCVs, savedCVs, toast, isAuthenticated, activeSlot],
  );

  const handleSaveStories = useCallback(
    (newStories: STARStory[]) => {
      setStarStories((prev) => [...newStories, ...prev]);
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({
          ...activeSlot,
          starStories: [...newStories, ...(activeSlot.starStories ?? [])],
        }).catch(() => {});
      }
      toast.success(
        'Stories Saved!',
        `${newStories.length} STAR+R story added to your Interview Story Bank.`,
      );
    },
    [setStarStories, toast, isAuthenticated, activeSlot],
  );

  const handleLoadCV = useCallback(
    (cvData: CVData) => {
      setCurrentCV(cvData);
      setIsEditingProfile(false);
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({ ...activeSlot, currentCV: cvData }).catch(() => {});
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCurrentCV, setIsEditingProfile, isAuthenticated, activeSlot],
  );

  const handleAutoTrack = useCallback(
    (details: { roleTitle: string; company: string; savedCvName: string }) => {
      const normalise = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let newTrackedApps: TrackedApplication[] = [];

      setTrackedApps((prev) => {
        const existingIdx = prev.findIndex((app) => {
          const sameRole =
            normalise(app.roleTitle) === normalise(details.roleTitle);
          const sameCompany =
            normalise(app.company) === normalise(details.company);
          const recent = new Date(app.dateApplied) >= thirtyDaysAgo;
          return sameRole && sameCompany && recent;
        });

        let updated: TrackedApplication[];
        if (existingIdx !== -1) {
          updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            savedCvName: details.savedCvName,
          };
          toast.success(
            'CV Updated',
            `Re-generation detected — updated CV for "${details.roleTitle}" at ${details.company}.`,
          );
        } else {
          const newApp: TrackedApplication = {
            id: Date.now().toString(),
            savedCvId: 'auto-generated',
            savedCvName: details.savedCvName,
            roleTitle: details.roleTitle,
            company: details.company,
            status: 'Applied',
            dateApplied: new Date().toISOString().split('T')[0],
            notes: `Automatically tracked after CV generation on ${new Date().toLocaleDateString()}.`,
          };
          toast.success(
            'Application Tracked!',
            `Added "${details.roleTitle}" at ${details.company} to your tracker.`,
          );
          updated = [newApp, ...prev];
        }

        newTrackedApps = updated;
        return updated;
      });

      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({ ...activeSlot, trackedApps: newTrackedApps }).catch(() => {});
      }
    },
    [setTrackedApps, toast, isAuthenticated, activeSlot],
  );

  const handleApplyViaEmail = useCallback(
    (jd: string, _cv: CVData) => {
      setEmailJd(jd);
      setCurrentView('email');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success(
        'Email Apply Ready',
        'JD pre-filled — AI will compose your email.',
      );
    },
    [setCurrentView, toast],
  );

  const handleGoToInterviewPrep = useCallback(
    (jd: string) => {
      setInterviewPrepJd(jd);
      setCurrentView('interview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success(
        'Interview Prep Ready',
        'JD pre-filled — generating tailored questions.',
      );
    },
    [setCurrentView, toast],
  );

  const handleGoToGenerator = useCallback(
    (extraInstructions?: string) => {
      setCurrentView('generator');
      if (extraInstructions) {
        setToolkitSuggestions(extraInstructions);
        toast.success(
          'CV Toolkit Feedback Ready',
          'Open the banner in the CV Generator to apply the fixes.',
        );
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCurrentView, toast],
  );

  const handleGitHubCVGenerated = useCallback(
    (cv: CVData) => {
      setCurrentCV(cv);
      setCurrentView('generator');
      if (isAuthenticated && activeSlot) {
        enqueueSlotSync({ ...activeSlot, currentCV: cv }).catch(() => {});
      }
      toast.success(
        'GitHub CV Ready!',
        'Your AI-generated CV is loaded in the CV Generator — complete with real project links.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCurrentCV, setCurrentView, isAuthenticated, activeSlot, toast],
  );

  const handleWordProfileImported = useCallback(
    (profile: UserProfile) => {
      const extras = profile.customSections?.filter(s => s.items.length > 0) ?? [];
      const extrasMsg = extras.length > 0
        ? ` Found ${extras.length} extra section${extras.length > 1 ? 's' : ''}: ${extras.map(s => s.label).join(', ')}. Review them in your Profile.`
        : '';

      if (activeSlot) {
        // Same person re-importing (e.g. re-importing after building a CV)?
        // → merge so AI-polished bullets are preserved for unchanged roles.
        // Different person entirely?
        // → full replace (fresh start), but warn if an AI CV existed.
        const existingCV = activeSlot.currentCV ?? null;
        const sameIdentity = isSameProfileIdentity(activeSlot.profile, profile);

        const cvData = sameIdentity && existingCV
          ? mergeProfileIntoCV(profile, activeSlot.profile ?? null, existingCV)
          : profileToCV(profile);

        const updatedSlot = { ...activeSlot, profile, currentCV: cvData };
        setProfiles((prev) =>
          prev.map((p) => (p.id === activeSlot.id ? updatedSlot : p)),
        );
        invalidateCVCache();
        syncProfileToCache(updatedSlot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(updatedSlot).catch(() => {});

        if (sameIdentity && existingCV) {
          // Same person — merge complete, show success
          toast.success(
            'Profile Updated!',
            `Profile data refreshed — your AI-built CV bullets are preserved.${extrasMsg}`,
          );
        } else {
          // Different person — pause and show choice modal instead of silently replacing
          setPendingWordImport({ profile, isDifferentPerson: true });
          return;
        }
      } else {
        const cvData = profileToCV(profile);
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || 'Imported Profile',
          color: 'violet',
          createdAt: new Date().toISOString(),
          profile,
          currentCV: cvData,
        };
        setProfiles((prev) => (prev.length > 0 ? [...prev, slot] : [slot]));
        setActiveProfileId(id);
        toast.success(
          'Profile Imported!',
          `Your CV has been imported.${extrasMsg} Edit your profile or go to the Generator.`,
        );
        syncProfileToCache(slot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
      }
    },
    [activeSlot, setProfiles, setActiveProfileId, toast, isAuthenticated],
  );

  // ── Word/PDF import choice handlers ────────────────────────────────────────

  /** User chose "Replace this room" from the ImportChoiceModal */
  const handleConfirmReplaceWordImport = useCallback(() => {
    if (!pendingWordImport || !activeSlot) return;
    const { profile } = pendingWordImport;
    const cvData = profileToCV(profile);
    const extras = profile.customSections?.filter(s => s.items.length > 0) ?? [];
    const extrasMsg = extras.length > 0
      ? ` Found ${extras.length} extra section${extras.length > 1 ? 's' : ''}: ${extras.map(s => s.label).join(', ')}.`
      : '';
    const updatedSlot = { ...activeSlot, profile, currentCV: cvData };
    setProfiles(prev => prev.map(p => (p.id === activeSlot.id ? updatedSlot : p)));
    invalidateCVCache();
    syncProfileToCache(updatedSlot).catch(() => {});
    if (isAuthenticated) enqueueSlotSync(updatedSlot).catch(() => {});
    setPendingWordImport(null);
    toast.info(
      'Profile Replaced',
      `Room reset with the imported CV.${extrasMsg} Head to the Generator to rebuild.`,
    );
  }, [pendingWordImport, activeSlot, setProfiles, isAuthenticated, toast]);

  /** User chose "Create new room" from the ImportChoiceModal */
  const handleConfirmCreateNewWordImport = useCallback(() => {
    if (!pendingWordImport) return;
    const { profile } = pendingWordImport;
    const cvData = profileToCV(profile);
    const extras = profile.customSections?.filter(s => s.items.length > 0) ?? [];
    const extrasMsg = extras.length > 0
      ? ` Found ${extras.length} extra section${extras.length > 1 ? 's' : ''}: ${extras.map(s => s.label).join(', ')}.`
      : '';
    const id = crypto.randomUUID();
    const slot: UserProfileSlot = {
      id,
      name: profile.personalInfo?.name || 'Imported Profile',
      color: 'violet',
      createdAt: new Date().toISOString(),
      profile,
      currentCV: cvData,
    };
    setProfiles(prev => [...prev, slot]);
    setActiveProfileId(id);
    setPendingWordImport(null);
    toast.success(
      'New Room Created!',
      `"${slot.name}" added as a new room.${extrasMsg} Head to the Generator to build their CV.`,
    );
    syncProfileToCache(slot).catch(() => {});
    if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
  }, [pendingWordImport, setProfiles, setActiveProfileId, isAuthenticated, toast]);

  const handleCancelWordImport = useCallback(() => {
    setPendingWordImport(null);
  }, []);

  /** Whether the user can still add another profile slot (slot-limit check) */
  const canAddWordImportSlot = canAddProfileSlot(profiles.length);

  return {
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
  };
}
