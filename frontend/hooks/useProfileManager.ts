// Manages profile CRUD, restore flows, D1 merge sync, and account deletion.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserProfile, UserProfileSlot, ProfileColor, CVData,
} from '../types';
import { profileToCV } from '../utils/profileToCV';
import { mergeProfileIntoCV } from '../utils/mergeProfileIntoCV';
import { syncProfileToCache } from '../services/profileCacheClient';
import { enqueueSlotSync, clearQueueForAccount } from '../services/storage/syncQueue';
import {
  syncSlot, fetchUserData, deleteSlotFromCloud, getDeviceId,
  getLastSyncTimestamp, markSlotSyncedNow, recordServerTs, clearSlotSyncTimestamp,
} from '../services/userDataCloudService';
import { useSlotPoller } from './useSlotPoller';
import { clearAllBrowserStorage, rotateDeviceId, stampDeletedAccount } from '../utils/clearUserStorage';
import { getUserPrefix } from '../services/storage/userStorageNamespace';
import { deleteAllDriveData } from '../services/storage/DriveStorageService';
import { getDriveRouter } from '../services/storage/StorageRouter';
import { drainPendingSlots } from '../services/authService';
import { parseSlotData } from '../utils/profileUtils';
import { useToast } from './useToast';

interface UseProfileManagerConfig {
  profiles: UserProfileSlot[];
  setProfiles: React.Dispatch<React.SetStateAction<UserProfileSlot[]>>;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  activeSlot: UserProfileSlot | null | undefined;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  currentCV: CVData | null;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  setIsEditingProfile: React.Dispatch<React.SetStateAction<boolean>>;
  isAuthenticated: boolean;
  isNewUser: boolean;
  driveToken: { accessToken: string } | null | undefined;
  deleteAccount: (deviceId: string) => Promise<boolean>;
  toast: ReturnType<typeof useToast>;
}

export function useProfileManager({
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
  driveToken,
  deleteAccount: _deleteAccount,
  toast,
}: UseProfileManagerConfig) {
  // ── Drive restore-on-new-device flow ─────────────────────────────────────
  const driveRestoreCheckedRef = useRef(false);
  const [driveRestoreSlots, setDriveRestoreSlots] = useState<UserProfileSlot[] | null>(null);
  const [d1SyncPending, setD1SyncPending] = useState(false);
  const driveRestoreSlotsRef = useRef<UserProfileSlot[] | null>(null);
  useEffect(() => { driveRestoreSlotsRef.current = driveRestoreSlots; }, [driveRestoreSlots]);

  useEffect(() => {
    if (!isAuthenticated || driveRestoreCheckedRef.current) return;
    if (profiles.length > 0) { driveRestoreCheckedRef.current = true; return; }
    if (sessionStorage.getItem('procv:restore-dismissed')) { driveRestoreCheckedRef.current = true; return; }
    driveRestoreCheckedRef.current = true;

    const router = getDriveRouter();
    if (!router) return;

    router.load<UserProfileSlot[]>('profiles')
      .then(slots => {
        if (Array.isArray(slots) && slots.length > 0) {
          setDriveRestoreSlots(slots);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── D1 merge-sync ─────────────────────────────────────────────────────────
  const d1RestoreCheckedRef = useRef(false);

  const runD1MergeSync = useCallback(async (localSlots: UserProfileSlot[], source: string) => {
    const data = await fetchUserData().catch(() => null);
    if (!data?.slots?.length && localSlots.length === 0) return;

    if (!data?.slots?.length) {
      // D1 is empty. For each local slot, only push if it has never been synced
      // before (prevSyncTs === 0 means it never reached D1 — push as new data).
      // If prevSyncTs > 0, D1 previously had it and now it's gone → another device
      // deleted it. Honor the remote deletion: remove locally and clear the timestamp.
      let anyRemotelyDeleted = false;
      const toKeep: UserProfileSlot[] = [];
      for (const slot of localSlots) {
        const prevSyncTs = getLastSyncTimestamp(slot.id) ?? 0;
        if (prevSyncTs === 0) {
          toKeep.push(slot);
          void syncSlot(slot);
        } else {
          clearSlotSyncTimestamp(slot.id);
          anyRemotelyDeleted = true;
        }
      }
      if (anyRemotelyDeleted) {
        setProfiles(toKeep);
        try {
          const storedId = localStorage.getItem('activeProfileId');
          const parsed = storedId ? JSON.parse(storedId) : null;
          const stillExists = parsed && toKeep.some(p => p.id === parsed);
          if (!stillExists && toKeep.length > 0) setActiveProfileId(toKeep[0].id);
        } catch { /* ignore */ }
      }
      return;
    }

    // Anchor the poller baseline: record the max server timestamp so the 6-second
    // poller doesn't immediately re-trigger a sync we just completed.
    // updated_at is unix SECONDS from D1.
    const maxServerTs = Math.max(...data.slots.map((s: any) => s.updated_at ?? 0));
    if (maxServerTs > 0) recordServerTs(maxServerTs);

    const d1Map = new Map(data.slots.map((s: any) => [s.slot_id, s]));
    const localMap = new Map(localSlots.map(s => [s.id, s]));
    const mergedSlots: UserProfileSlot[] = [];
    const toPush: UserProfileSlot[] = [];
    let anyD1Newer = false;

    for (const d1Slot of data.slots) {
      const local = localMap.get(d1Slot.slot_id);
      if (!local) {
        const parsed = parseSlotData(d1Slot);
        if (parsed) {
          mergedSlots.push(parsed);
          markSlotSyncedNow(d1Slot.slot_id);
          anyD1Newer = true;
        }
        continue;
      }
      // getLastSyncTimestamp returns unix MILLISECONDS; d1Slot.updated_at is
      // unix SECONDS — multiply seconds by 1000 before comparing.
      const localPushTs = getLastSyncTimestamp(d1Slot.slot_id) ?? 0; // ms
      if (d1Slot.updated_at * 1000 > localPushTs + 10_000) {
        const parsed = parseSlotData(d1Slot);
        if (parsed) {
          mergedSlots.push(parsed);
          markSlotSyncedNow(d1Slot.slot_id);
          anyD1Newer = true;
        } else {
          mergedSlots.push(local);
        }
      } else {
        mergedSlots.push(local);
        toPush.push(local);
      }
    }

    for (const local of localSlots) {
      if (!d1Map.has(local.id)) {
        const prevSyncTs = getLastSyncTimestamp(local.id) ?? 0;
        if (prevSyncTs === 0) {
          // Never pushed to D1 — this is a genuinely new local-only slot. Push it up.
          mergedSlots.push(local);
          toPush.push(local);
        } else {
          // Was previously in D1 but is now gone → another device explicitly
          // deleted it. Honor the remote deletion: drop it locally and clear the
          // stale timestamp so a future re-creation with the same ID starts fresh.
          clearSlotSyncTimestamp(local.id);
          anyD1Newer = true; // ensure setProfiles() fires to apply the removal
        }
      }
    }

    for (const slot of toPush) void syncSlot(slot);

    if (anyD1Newer && mergedSlots.length > 0) {
      setProfiles(mergedSlots);
      try {
        const storedId = localStorage.getItem('activeProfileId');
        const parsed = storedId ? JSON.parse(storedId) : null;
        const stillExists = parsed && mergedSlots.some(p => p.id === parsed);
        if (!stillExists) setActiveProfileId(mergedSlots[0].id);
      } catch { /* ignore */ }
      if (localSlots.length === 0) {
        setIsEditingProfile(false);
        toast.success('Profiles restored', `${mergedSlots.length} profile${mergedSlots.length !== 1 ? 's' : ''} loaded from your account.`);
      } else {
        toast.success('Profiles synced', 'Updated from another device.');
      }
      console.log(`[D1Sync] Merged from ${source}: ${mergedSlots.length} slot(s), ${toPush.length} pushed up`);
    } else if (mergedSlots.length > 0 && localSlots.length === 0) {
      setProfiles(mergedSlots);
      setIsEditingProfile(false);
      toast.success('Profiles restored', `${mergedSlots.length} profile${mergedSlots.length !== 1 ? 's' : ''} loaded from your account.`);
      console.log(`[D1Sync] Restored from ${source}: ${mergedSlots.length} slot(s)`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (d1RestoreCheckedRef.current) return;
    d1RestoreCheckedRef.current = true;

    // Brand-new accounts have no server-side data by definition. Any profiles
    // currently in local state are stale leftovers from a previous account's
    // session that was not fully wiped before sign-up completed (the wipe runs
    // on email-change detection, but a fresh sign-up on a shared/reused device
    // can race that path). Clear them immediately so they cannot:
    //   1. Be pushed up to D1 under the new account (polluting it)
    //   2. Trigger profile-cache uploads that reference the old slot IDs
    //      (which the server correctly rejects with 403 — ownership check)
    // After clearing, skip the D1 merge sync entirely — there is nothing on
    // the server to pull for a new user and nothing worth preserving locally.
    if (isNewUser) {
      drainPendingSlots(); // discard any slots that arrived with the auth response
      if (profiles.length > 0) {
        setProfiles([]);
        setActiveProfileId(null);
      }
      return;
    }

    drainPendingSlots();
    setD1SyncPending(true);
    const syncTimeout = setTimeout(() => setD1SyncPending(false), 6000);
    void runD1MergeSync(profiles, 'login').finally(() => {
      clearTimeout(syncTimeout);
      setD1SyncPending(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Cross-device sync on tab focus ────────────────────────────────────────
  const lastVisSyncRef = useRef(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisSyncRef.current < 2 * 60_000) return;
      lastVisSyncRef.current = now;
      setProfiles(current => {
        void runD1MergeSync(current, 'visibility sync');
        return current;
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── 6-second cross-device freshness poller ────────────────────────────────
  // Polls /api/cv/slot-status while the tab is visible. Only triggers a full
  // D1 merge when the server's MAX(updated_at) is newer than the last value
  // recorded by runD1MergeSync — so it never fires extra syncs when nothing
  // has changed on another device.
  useSlotPoller(isAuthenticated, () => {
    setProfiles(current => {
      void runD1MergeSync(current, 'poll');
      return current;
    });
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRestoreProfileBullets = useCallback(() => {
    if (!currentCV || !userProfile || !activeSlot) return;
    const fromProfile = profileToCV(userProfile);
    const restored = currentCV.experience.map((cvExp) => {
      const profileExp = fromProfile.experience.find(
        (e) => e.company === cvExp.company && e.jobTitle === cvExp.jobTitle,
      );
      if (!profileExp) return cvExp;
      return { ...cvExp, responsibilities: profileExp.responsibilities };
    });
    const newCV = {
      ...currentCV,
      experience: restored,
      summary: userProfile.summary || currentCV.summary,
    };
    setCurrentCV(newCV);
    enqueueSlotSync({ ...activeSlot, currentCV: newCV }).catch(() => {});
  }, [currentCV, userProfile, activeSlot, setCurrentCV]);

  const handleProfileSave = useCallback(
    (profile: UserProfile) => {
      if (activeSlot) {
        setUserProfile(profile);
        setIsEditingProfile(false);
        syncProfileToCache({ ...activeSlot, profile }).catch(() => {});
        if (isAuthenticated)
          enqueueSlotSync({ ...activeSlot, profile }).catch(() => {});
      } else {
        const id = crypto.randomUUID();
        const slot: UserProfileSlot = {
          id,
          name: profile.personalInfo?.name || 'My Profile',
          color: 'indigo',
          createdAt: new Date().toISOString(),
          profile,
        };
        setProfiles([slot]);
        setActiveProfileId(id);
        setIsEditingProfile(false);
        syncProfileToCache(slot).catch(() => {});
        enqueueSlotSync(slot).catch(() => {});
      }

      // Compute the merged CV synchronously so we can sync it to D1 in the same
      // call — avoids a sync gap where the profile is saved but the updated CV
      // bullets are lost on other devices.
      //
      // Delegates to mergeProfileIntoCV() which only overwrites a CV field when
      // the user demonstrably changed it in the form — preserving AI-generated
      // content for everything they didn't touch.
      if (currentCV) {
        const mergedCV: CVData = mergeProfileIntoCV(profile, userProfile, currentCV);

        setCurrentCV(mergedCV);
        // Include the merged CV in the slot sync so other devices get the full
        // picture (profile + updated bullets) in one round-trip.
        if (isAuthenticated && activeSlot) {
          enqueueSlotSync({ ...activeSlot, profile, currentCV: mergedCV }).catch(() => {});
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot, currentCV, setUserProfile, setProfiles, setActiveProfileId, setCurrentCV, userProfile, isAuthenticated],
  );

  const handleCreateProfile = useCallback(
    (name: string, color: ProfileColor, cloneFrom?: UserProfile) => {
      const id = crypto.randomUUID();
      const emptyProfile: UserProfile = {
        personalInfo: {
          name: '', email: '', phone: '', location: '',
          linkedin: '', website: '', github: '',
        },
        summary: '',
        workExperience: [],
        education: [],
        skills: [],
        projects: [],
        languages: [],
      };
      const slot: UserProfileSlot = {
        id,
        name,
        color,
        createdAt: new Date().toISOString(),
        profile: cloneFrom ? { ...cloneFrom } : emptyProfile,
        currentCV: null,
        savedCVs: [],
        savedCoverLetters: [],
        trackedApps: [],
        starStories: [],
      };
      setProfiles((prev) => [...prev, slot]);
      setActiveProfileId(id);
      setIsEditingProfile(!cloneFrom);
      if (isAuthenticated) enqueueSlotSync(slot).catch(() => {});
      toast.success('Profile Created', `"${name}" is now your active profile.`);
    },
    [setProfiles, setActiveProfileId, setIsEditingProfile, toast, isAuthenticated],
  );

  const handleSwitchProfile = useCallback(
    (slot: UserProfileSlot) => {
      setActiveProfileId(slot.id);
      setIsEditingProfile(false);
      toast.success('Profile Switched', `Now using "${slot.name}".`);
    },
    [setActiveProfileId, setIsEditingProfile, toast],
  );

  const handleDeleteProfile = useCallback(
    async (id: string) => {
      const removed = profiles.find((p) => p.id === id);
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (activeProfileId === id && next.length > 0)
          setActiveProfileId(next[0].id);
        return next;
      });
      const ok = await deleteSlotFromCloud(id);
      if (!ok) {
        if (removed) setProfiles((prev) => [...prev, removed]);
        toast.error(
          'Delete failed',
          'Could not remove this profile from the server. Please try again.',
        );
        return;
      }
      toast.success('Profile Deleted', 'Profile removed.');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, setProfiles, activeProfileId, setActiveProfileId, toast],
  );

  const handleRenameProfile = useCallback(
    (id: string, name: string, color: ProfileColor) => {
      setProfiles((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, name, color } : p));
        const updated = next.find((p) => p.id === id);
        if (updated && isAuthenticated) enqueueSlotSync(updated).catch(() => {});
        return next;
      });
      toast.success('Profile Updated', `Renamed to "${name}".`);
    },
    [setProfiles, toast, isAuthenticated],
  );

  const handlePinField = useCallback(
    (field: string) => {
      if (!userProfile || !activeSlot) return;
      const updated: UserProfile = { ...userProfile, preferredField: field };
      setUserProfile(updated);
      syncProfileToCache({ ...activeSlot, profile: updated }).catch(() => {});
      if (isAuthenticated)
        enqueueSlotSync({ ...activeSlot, profile: updated }).catch(() => {});
    },
    [userProfile, activeSlot, setUserProfile, isAuthenticated],
  );

  const handleUnpinField = useCallback(() => {
    if (!userProfile || !activeSlot) return;
    const { preferredField: _removed, ...rest } = userProfile as UserProfile & { preferredField?: string };
    const updated = rest as UserProfile;
    setUserProfile(updated);
    syncProfileToCache({ ...activeSlot, profile: updated }).catch(() => {});
    if (isAuthenticated)
      enqueueSlotSync({ ...activeSlot, profile: updated }).catch(() => {});
  }, [userProfile, activeSlot, setUserProfile, isAuthenticated]);

  const handleSlotUpdate = useCallback(
    (update: Partial<{
      jobDescription: string; targetCompany: string; targetJobTitle: string;
      cvPurpose: 'job' | 'academic' | 'general'; generationMode: string;
      jdKeywords: string[]; lastGeneratedAt: string; lastAtsScore: number;
    }>) => {
      setProfiles(prev =>
        prev.map(p => {
          if (p.id !== activeSlot?.id) return p;
          const updated = { ...p, ...update };
          if (isAuthenticated) enqueueSlotSync(updated).catch(() => {});
          return updated;
        })
      );
    },
    [activeSlot, setProfiles, isAuthenticated],
  );

  const handleDeleteAccount = useCallback(async () => {
    const currentDeviceId = getDeviceId();

    // Capture the Drive token NOW — before anything is wiped.
    // driveToken React-state is memory-only and starts null on a fresh page load,
    // so if the user had Drive connected in a previous session we fall back to the
    // localStorage copy. This must happen here, before _deleteAccount() triggers
    // clearAllIdbAsync() + clearUserScopedStorage() which wipe that localStorage key.
    const tokenForDriveDeletion: string | null =
        driveToken?.accessToken ??
        (() => {
            try {
                const prefix = getUserPrefix();
                const t = localStorage.getItem(`${prefix}cv_gdrive_token`);
                const e = localStorage.getItem(`${prefix}cv_gdrive_expiry`);
                return (t && e && Date.now() < Number(e)) ? t : null;
            } catch { return null; }
        })();

    // Fire Drive deletion BEFORE calling _deleteAccount. _deleteAccount calls
    // window.location.reload() on success, which means any code after it never
    // runs. By firing Drive deletion first with keepalive:true fetch requests,
    // the browser completes those requests even after the page navigates away.
    if (tokenForDriveDeletion) {
      deleteAllDriveData(tokenForDriveDeletion).catch(() => {});
    }

    let serverDeleteOk = false;
    try {
      // _deleteAccount handles: server-side deletion, local storage/IDB wipe,
      // queue clear, device ID rotation, and window.location.reload().
      serverDeleteOk = await _deleteAccount(currentDeviceId);
    } catch { /* serverDeleteOk stays false */ }

    if (!serverDeleteOk) {
      toast.error(
        'Deletion failed',
        'Your account could not be removed from the server. Check your connection and try again — nothing has been deleted yet.',
      );
      return;
    }
    // _deleteAccount already called window.location.reload() on success —
    // execution does not reach here on the happy path.
  }, [_deleteAccount, driveToken?.accessToken, toast]);

  const handleClearAllData = useCallback(async () => {
    await clearAllBrowserStorage().catch(() => {});
    window.location.reload();
  }, []);

  return {
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
    runD1MergeSync,
    d1SyncPending,
  };
}
