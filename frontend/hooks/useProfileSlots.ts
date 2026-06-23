import { useMemo, useCallback, useEffect } from 'react';
import {
  UserProfile,
  CVData,
  SavedCV,
  SavedCoverLetter,
  TrackedApplication,
  UserProfileSlot,
  STARStory,
} from '../types';
import { useStorage } from './useStorage';
import { invalidateCVCache } from '../services/geminiService';
import { syncProfileToCache } from '../services/profileCacheClient';
import {
  migrateToIDB,
  preloadAllCVData,
  pruneOrphanedCVData,
} from '../services/storage/cvDataStore';

export function useProfileSlots() {
  const [profiles, setProfiles] = useStorage<UserProfileSlot[]>('profiles', []);
  const [activeProfileId, setActiveProfileId] = useStorage<string | null>(
    'activeProfileId',
    null,
  );

  const activeSlot = useMemo(
    () =>
      profiles.find((p) => p.id === activeProfileId) ??
      (activeProfileId ? null : profiles[0] ?? null),
    [profiles, activeProfileId],
  );

  const userProfile: UserProfile | null = activeSlot?.profile ?? null;

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
          const resolved = typeof next === 'function' ? next(p.profile) : next;
          return { ...p, profile: resolved ?? p.profile };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  const currentCV: CVData | null = activeSlot?.currentCV ?? null;

  const setCurrentCV = useCallback(
    (next: CVData | null | ((prev: CVData | null) => CVData | null)) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === 'function' ? next(p.currentCV ?? null) : next;
          return { ...p, currentCV: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  // Boot-time profile cache sync — runs whenever the active slot changes.
  useEffect(() => {
    if (!activeSlot) return;
    const t = setTimeout(() => {
      syncProfileToCache(activeSlot).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // One-time migration: move any existing global currentCV into the active slot.
  useEffect(() => {
    if (!activeSlot) return;
    if (activeSlot.currentCV !== undefined) return;
    try {
      const raw =
        localStorage.getItem('cv_builder:currentCV') ||
        localStorage.getItem('currentCV');
      if (raw) {
        const cv = JSON.parse(raw) as CVData;
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === activeSlot.id ? { ...p, currentCV: cv } : p,
          ),
        );
        localStorage.removeItem('cv_builder:currentCV');
        localStorage.removeItem('currentCV');
      }
    } catch {
      /* ignore parse errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // One-time migration: move global savedCVs/trackedApps/etc into the active slot.
  useEffect(() => {
    if (!activeSlot) return;
    if (activeSlot.savedCVs !== undefined) return;

    let savedCVsMig: SavedCV[] | undefined;
    let savedCLsMig: SavedCoverLetter[] | undefined;
    let trackedAppsMig: TrackedApplication[] | undefined;
    let starStoriesMig: STARStory[] | undefined;

    try {
      const r =
        localStorage.getItem('cv_builder:savedCVs') ||
        localStorage.getItem('savedCVs');
      if (r) savedCVsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem('cv_builder:savedCoverLetters') ||
        localStorage.getItem('savedCoverLetters');
      if (r) savedCLsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem('cv_builder:trackedApps') ||
        localStorage.getItem('trackedApps');
      if (r) trackedAppsMig = JSON.parse(r);
    } catch {}
    try {
      const r =
        localStorage.getItem('cv_builder:starStories') ||
        localStorage.getItem('starStories');
      if (r) starStoriesMig = JSON.parse(r);
    } catch {}

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeSlot.id
          ? {
              ...p,
              savedCVs:          savedCVsMig          ?? [],
              savedCoverLetters: savedCLsMig          ?? [],
              trackedApps:       trackedAppsMig       ?? [],
              starStories:       starStoriesMig       ?? [],
            }
          : p,
      ),
    );

    [
      'cv_builder:savedCVs',
      'savedCVs',
      'cv_builder:savedCoverLetters',
      'savedCoverLetters',
      'cv_builder:trackedApps',
      'trackedApps',
      'cv_builder:starStories',
      'starStories',
    ].forEach((k) => localStorage.removeItem(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id]);

  // IDB CV data migration + preload.
  useEffect(() => {
    if (!profiles.length) return;

    (async () => {
      if (!localStorage.getItem('cv_builder:cvdata_migrated_v1')) {
        try {
          const { slots: migratedSlots, migrated } = await migrateToIDB(profiles);
          if (migrated > 0) setProfiles(migratedSlots);
          localStorage.setItem('cv_builder:cvdata_migrated_v1', '1');
        } catch (err) {
          console.warn('[cvDataStore] Migration failed (non-fatal):', err);
        }
      }

      const allIds = profiles.flatMap((s) => (s.savedCVs ?? []).map((c) => c.id));
      await preloadAllCVData(allIds).catch(() => {});
      pruneOrphanedCVData(new Set(allIds)).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  // Per-profile derived state
  const savedCVs: SavedCV[] = activeSlot?.savedCVs ?? [];
  const setSavedCVs = useCallback(
    (next: SavedCV[] | ((prev: SavedCV[]) => SavedCV[])) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== (activeSlot?.id ?? null)) return p;
          const resolved =
            typeof next === 'function' ? next(p.savedCVs ?? []) : next;
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
            typeof next === 'function' ? next(p.savedCoverLetters ?? []) : next;
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
            typeof next === 'function' ? next(p.trackedApps ?? []) : next;
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
            typeof next === 'function' ? next(p.starStories ?? []) : next;
          return { ...p, starStories: resolved };
        }),
      );
    },
    [activeSlot, setProfiles],
  );

  return {
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
  };
}
