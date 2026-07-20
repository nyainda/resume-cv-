import { useState, useCallback, useEffect } from 'react';
import type { VaultJob, VaultPriority, VaultInputType } from '../types';
import {
  getAllVaultJobs,
  saveVaultJob,
  updateVaultJob,
  deleteVaultJob,
  syncVaultFromServer,
  extractTitleCompany,
  naiveMatchScore,
  roomTypeFromScore,
  type SaveVaultJobInput,
  type SaveVaultJobResult,
} from '../services/vaultService';

export function useVaultJobs(profileSkills: string = '') {
  const [jobs, setJobs] = useState<VaultJob[]>(() => getAllVaultJobs());

  // On mount: load local then pull server delta
  useEffect(() => {
    setJobs(getAllVaultJobs());
    syncVaultFromServer().then(() => setJobs(getAllVaultJobs()));
  }, []);

  const refresh = useCallback(() => {
    setJobs(getAllVaultJobs());
  }, []);

  const addJob = useCallback((input: SaveVaultJobInput): SaveVaultJobResult => {
    const result = saveVaultJob(input);
    if (!result.isDuplicate) {
      // Optimistically set naive match score so the card renders immediately
      const score = naiveMatchScore(input.rawJd, profileSkills);
      const roomType = roomTypeFromScore(score);
      updateVaultJob(result.job.id, { matchScore: score, roomType });
      setJobs(getAllVaultJobs());
    }
    return result;
  }, [profileSkills]);

  const patchJob = useCallback((id: string, patch: Partial<VaultJob>) => {
    updateVaultJob(id, patch);
    setJobs(getAllVaultJobs());
  }, []);

  const removeJob = useCallback((id: string) => {
    deleteVaultJob(id);
    setJobs(getAllVaultJobs());
  }, []);

  const getJobsForRoom = useCallback((roomId: string) => {
    return jobs.filter(j => j.roomId === roomId);
  }, [jobs]);

  return { jobs, addJob, patchJob, removeJob, getJobsForRoom, refresh };
}
