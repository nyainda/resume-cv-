import { useState, useCallback, useEffect } from 'react';
import type { VaultJob, VaultPriority, VaultInputType } from '../types';
import {
  getAllVaultJobs,
  saveVaultJob,
  updateVaultJob,
  deleteVaultJob,
  syncVaultFromServer,
  naiveMatchScore,
  roomTypeFromScore,
  type SaveVaultJobInput,
  type SaveVaultJobResult,
} from '../services/vaultService';
import { analyseVaultJob } from '../services/vaultAnalysis';

export function useVaultJobs(profileSkills: string = '') {
  const [jobs, setJobs] = useState<VaultJob[]>(() => getAllVaultJobs());

  // On mount: load local then pull server delta
  useEffect(() => {
    setJobs(getAllVaultJobs());
    syncVaultFromServer().then(() => {
      const synced = getAllVaultJobs();
      // Re-score any jobs that are stuck with undefined matchScore (e.g. stale
      // localStorage entries or server-side jobs that never got a score set).
      const stuck = synced.filter(j => j.matchScore === undefined);
      if (stuck.length > 0) {
        for (const j of stuck) {
          const score = naiveMatchScore(j.rawJd, profileSkills);
          const roomType = roomTypeFromScore(score);
          updateVaultJob(j.id, { matchScore: score, roomType });
        }
      }
      setJobs(getAllVaultJobs());

      // Back-fill analysis for older jobs that were saved before the enrichment
      // pipeline existed (analysed field absent).
      const unanalysed = synced.filter(j => !j.analysed && j.rawJd && j.rawJd.length > 50);
      if (unanalysed.length > 0 && unanalysed.length <= 5) {
        // Stagger to avoid hammering the LLM simultaneously
        unanalysed.forEach((j, i) => {
          setTimeout(() => {
            analyseVaultJob(j.rawJd).then(insights => {
              const patch: Partial<VaultJob> = { analysed: true };
              // Only overwrite title/company if they're still placeholder values
              if (insights.company && j.company === 'Unknown Company') patch.company = insights.company;
              if (insights.title  && j.title  === 'Untitled Role')     patch.title   = insights.title;
              if (insights.tldr)         patch.tldr         = insights.tldr;
              if (insights.requirements?.length) patch.requirements = insights.requirements;
              if (insights.email)        patch.email        = insights.email;
              if (insights.website)      patch.website      = insights.website;
              if (insights.salary)       patch.salary       = insights.salary;
              updateVaultJob(j.id, patch);
              setJobs(getAllVaultJobs());
            }).catch(() => {});
          }, i * 2000);
        });
      }
    });
  // profileSkills intentionally excluded — we only want this to run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    setJobs(getAllVaultJobs());
  }, []);

  const addJob = useCallback((input: SaveVaultJobInput): SaveVaultJobResult => {
    const result = saveVaultJob(input);
    if (!result.isDuplicate) {
      // 1. Optimistic naive match score so the card renders immediately
      const score = naiveMatchScore(input.rawJd, profileSkills);
      const roomType = roomTypeFromScore(score);
      updateVaultJob(result.job.id, { matchScore: score, roomType });
      setJobs(getAllVaultJobs());

      // 2. Fire-and-forget LLM enrichment — patches company/title/tldr/requirements/etc.
      const jobId = result.job.id;
      analyseVaultJob(input.rawJd).then(insights => {
        const patch: Partial<VaultJob> = { analysed: true };
        // Always apply LLM result for title/company (it's more reliable than heuristics)
        if (insights.company)           patch.company      = insights.company;
        if (insights.title)             patch.title        = insights.title;
        if (insights.tldr)              patch.tldr         = insights.tldr;
        if (insights.requirements?.length) patch.requirements = insights.requirements;
        if (insights.email)             patch.email        = insights.email;
        if (insights.website)           patch.website      = insights.website;
        if (insights.salary)            patch.salary       = insights.salary;
        if (insights.remote)            patch.remote       = insights.remote;
        if (insights.location)          patch.location     = insights.location;
        updateVaultJob(jobId, patch);
        setJobs(getAllVaultJobs());
      }).catch(() => {
        // Mark as analysed even on failure so we don't retry in a loop
        updateVaultJob(jobId, { analysed: true });
      });
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
