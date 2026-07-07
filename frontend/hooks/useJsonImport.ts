// hooks/useJsonImport.ts
// Manages the JSON profile import flow — shows a choice dialog when an import
// would overwrite an existing profile, and applies the import to the right slot.

import { useState, useCallback } from 'react';
import type { UserProfile, CVData, UserProfileSlot } from '../types';
import { profileToCV } from '../utils/profileToCV';
import { isSameProfileIdentity, mergeProfileIntoCV } from '../utils/mergeProfileIntoCV';
import { syncProfileToCache } from '../services/profileCacheClient';
import { enqueueSlotSync } from '../services/storage/syncQueue';
import { invalidateCVCache } from '../services/geminiService';
import type { AppView } from './useAppNavigation';
import { useToast } from './useToast';

type ToastController = ReturnType<typeof useToast>;

interface UseJsonImportConfig {
  activeSlot: UserProfileSlot | null | undefined;
  isAuthenticated: boolean;
  setProfiles: (updater: (prev: UserProfileSlot[]) => UserProfileSlot[]) => void;
  setActiveProfileId: (id: string) => void;
  setCurrentView: (view: AppView) => void;
  setIsEditingProfile: (v: boolean) => void;
  toast: ToastController;
}

export interface PendingJsonImport {
  profile: UserProfile;
  cvData: CVData;
}

export function useJsonImport({
  activeSlot,
  isAuthenticated,
  setProfiles,
  setActiveProfileId,
  setCurrentView,
  setIsEditingProfile,
  toast,
}: UseJsonImportConfig) {
  const [jsonImportTimestamp, setJsonImportTimestamp] = useState<string>('');
  const [pendingJsonImport, setPendingJsonImport] = useState<PendingJsonImport | null>(null);

  const _applyJsonImport = useCallback(
    (
      profile: UserProfile,
      cvData: CVData,
      slotToUpdate: UserProfileSlot | null,
    ) => {
      if (slotToUpdate) {
        // Same person re-importing? → merge to preserve AI bullets.
        // Genuinely different CV? → full replace (user confirmed via dialog).
        const existingCV = slotToUpdate.currentCV ?? null;
        const sameIdentity = isSameProfileIdentity(slotToUpdate.profile, profile);
        const resolvedCV = sameIdentity && existingCV
          ? mergeProfileIntoCV(profile, slotToUpdate.profile ?? null, existingCV)
          : cvData;

        const updatedSlot = { ...slotToUpdate, profile, currentCV: resolvedCV };
        setProfiles((prev) =>
          prev.map((p) => (p.id === slotToUpdate.id ? updatedSlot : p)),
        );
        invalidateCVCache();
        syncProfileToCache(updatedSlot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(updatedSlot).catch(() => {});
        toast.success(
          'Profile Updated!',
          sameIdentity && existingCV
            ? 'Profile refreshed — AI-built CV bullets preserved for unchanged roles.'
            : 'Profile replaced — head to the Generator to rebuild your CV.',
        );
      } else {
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || 'Imported Profile',
          color: 'indigo',
          createdAt: new Date().toISOString(),
          profile,
          currentCV: cvData,
        };
        setProfiles((prev) => (prev.length > 0 ? [...prev, slot] : [slot]));
        setActiveProfileId(id);
        syncProfileToCache(slot).catch(() => {});
        if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
        toast.success(
          'Profile Imported!',
          'Your CV is ready — all templates are populated. Check your quality report below.',
        );
      }
      setCurrentView('generator');
      setIsEditingProfile(false);
      setJsonImportTimestamp(new Date().toISOString());
    },
    [setProfiles, setActiveProfileId, toast, isAuthenticated, setCurrentView, setIsEditingProfile],
  );

  const handleJsonProfileImported = useCallback(
    (profile: UserProfile) => {
      const cvData = profileToCV(profile);
      if (activeSlot) {
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
      activeSlot ?? null,
    );
    setPendingJsonImport(null);
  }, [pendingJsonImport, activeSlot, _applyJsonImport]);

  const handleConfirmCreateNewProfile = useCallback(() => {
    if (!pendingJsonImport) return;
    _applyJsonImport(pendingJsonImport.profile, pendingJsonImport.cvData, null);
    setPendingJsonImport(null);
  }, [pendingJsonImport, _applyJsonImport]);

  const handleCancelJsonImport = useCallback(() => {
    setPendingJsonImport(null);
  }, []);

  return {
    jsonImportTimestamp,
    pendingJsonImport,
    handleJsonProfileImported,
    handleConfirmUpdateCurrentProfile,
    handleConfirmCreateNewProfile,
    handleCancelJsonImport,
  };
}
