import { useEffect, useRef } from 'react';
import type { VaultJob } from '../types';

// Persisted to localStorage so notifications don't re-fire after a page reload.
// Key format: vault-notif:<jobId>:<deadline>:<threshold>
// e.g. vault-notif:abc123:2026-08-10:1  (the "1 day left" alert for that job)
const STORAGE_KEY = 'procv:vault_notif_seen';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-check every hour

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    // Trim stale entries (IDs older than 30 days based on embedded deadline date)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const trimmed = [...seen].filter(id => {
      const parts = id.split(':');
      if (parts.length < 4) return false;
      const deadline = new Date(parts[2]).getTime();
      return !isNaN(deadline) && deadline > cutoff;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota — ignore */ }
}

// Which day thresholds to fire a notification at (in days remaining).
// For each threshold we fire exactly once per job per deadline date.
const THRESHOLDS = [7, 3, 1, 0];

function thresholdLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'Today!';
  if (daysLeft === 1) return 'Tomorrow!';
  return `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
}

function checkAndNotify(jobs: VaultJob[], seen: Set<string>): Set<string> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return seen;

  const now = Date.now();
  let changed = false;

  jobs.forEach(job => {
    if (!job.deadline) return;
    // Skip jobs already applied or expired — no point reminding
    if (job.status === 'applied' || job.status === 'expired') return;

    const deadlineMs = new Date(job.deadline).getTime();
    if (isNaN(deadlineMs)) return;

    const daysLeft = Math.ceil((deadlineMs - now) / 86400000);

    // Find the lowest matching threshold for the current day count
    const threshold = THRESHOLDS.find(t => daysLeft <= t && daysLeft >= 0);
    if (threshold === undefined) return;

    const notifId = `vault-notif:${job.id}:${job.deadline}:${threshold}`;
    if (seen.has(notifId)) return;

    seen.add(notifId);
    changed = true;

    const title = `⏰ Deadline ${thresholdLabel(daysLeft)}`;
    const body  = [job.title, job.company].filter(Boolean).join(' at ');
    new Notification(title, {
      body:  body || 'A saved role is closing soon',
      icon:  '/favicon.ico',
      tag:   notifId,
      // requireInteraction keeps it visible until dismissed (supported in Chrome)
      requireInteraction: daysLeft === 0,
    });
  });

  if (changed) saveSeen(seen);
  return seen;
}

/**
 * useVaultDeadlineNotifier
 *
 * Call this inside VaultPage (or any component that renders while the vault is
 * visible). It will:
 *  1. Request notification permission once (only if the browser hasn't been asked yet).
 *  2. Immediately check all jobs for approaching deadlines (≤7 days) and fire
 *     a browser Notification for any that haven't been notified yet.
 *  3. Re-check every hour so a long-open session also gets timely alerts.
 *  4. Persist seen notification IDs in localStorage — no duplicate fires across
 *     page reloads or re-mounts.
 */
export function useVaultDeadlineNotifier(jobs: VaultJob[]): void {
  const seenRef = useRef<Set<string>>(loadSeen());

  // Request permission once when the vault is first opened
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Check on mount and whenever jobs change, plus on a 1-hour interval
  useEffect(() => {
    seenRef.current = checkAndNotify(jobs, seenRef.current);

    const timer = setInterval(() => {
      seenRef.current = checkAndNotify(jobs, seenRef.current);
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [jobs]);
}
