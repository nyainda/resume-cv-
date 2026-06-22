/**
 * accountTierService.ts
 *
 * Core tier logic — reading, writing, and querying account tier state.
 * This is a pure service (no React). Hooks and components import from here.
 *
 * Storage: localStorage for now (Phase 2 will sync with D1 via the
 * cv-engine-worker /api/account/tier endpoint after auth).
 */

import type { AccountTier, TierFeature, TierFeatureConfig } from '../types/accountTier';

// ─── Storage key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cv_builder:accountTier';

/**
 * Custom event fired whenever the tier changes so all hooks stay in sync
 * across tabs and components without prop-drilling.
 */
export const TIER_CHANGED_EVENT = 'procv:tierChanged';

// ─── Feature map ────────────────────────────────────────────────────────────

/**
 * Defines which tiers unlock each feature and the metadata shown in the
 * upgrade modal. Add new gated features here only — types/accountTier.ts
 * is the canonical list of valid keys.
 */
export const TIER_FEATURES: Record<TierFeature, { tiers: AccountTier[]; meta: TierFeatureConfig }> = {
  'workers-ai': {
    tiers: ['free', 'premium'],
    meta: {
      label: 'Workers AI',
      icon: '✨',
      description:
        'Cloudflare-powered AI with no API key required. Runs the full CV pipeline server-side — generation, audit, humanization, and more.',
    },
  },
  'bulk-export': {
    tiers: ['premium'],
    meta: {
      label: 'Bulk Export',
      icon: '📦',
      description: 'Download all your saved CVs as a ZIP in one click.',
    },
  },
  'custom-domain': {
    tiers: ['premium'],
    meta: {
      label: 'Custom Domain Sharing',
      icon: '🌐',
      description: 'Share your CV on your own domain with a clean, branded URL.',
    },
  },
};

// ─── Read / write ────────────────────────────────────────────────────────────

/** Returns the current account tier, defaulting to 'free'. */
export function getTier(): AccountTier {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'premium') return 'premium';
  } catch {
    // localStorage blocked (SSR, incognito storage quota, etc.)
  }
  return 'free';
}

/**
 * Persists the account tier and notifies all listeners.
 * Phase 2: also POST to /api/account/tier on the cv-engine-worker.
 */
export function setTier(tier: AccountTier): void {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // ignore write errors
  }
  window.dispatchEvent(new CustomEvent(TIER_CHANGED_EVENT, { detail: { tier } }));
}

// ─── Feature checks ──────────────────────────────────────────────────────────

/** Returns true if the given tier has access to the feature. */
export function hasFeature(feature: TierFeature, tier: AccountTier): boolean {
  return TIER_FEATURES[feature]?.tiers.includes(tier) ?? false;
}

/** Returns all features unlocked by a given tier. */
export function getFeaturesForTier(tier: AccountTier): TierFeature[] {
  return (Object.keys(TIER_FEATURES) as TierFeature[]).filter((f) =>
    TIER_FEATURES[f].tiers.includes(tier),
  );
}

/** Returns the display metadata for a feature. */
export function getFeatureMeta(feature: TierFeature): TierFeatureConfig {
  return TIER_FEATURES[feature].meta;
}

// ─── BYOK detection ──────────────────────────────────────────────────────────

/**
 * Returns true when the user has configured at least one third-party AI key
 * (Groq / Claude / Gemini). These are "BYOK" users — unlimited AI generations
 * on their own quota, but PDFs are still watermarked until they upgrade to Pro.
 */
export function hasByokKeys(): boolean {
  try {
    const raw =
      localStorage.getItem('cv_builder:apiSettings') ||
      localStorage.getItem('apiSettings');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s?.apiKey || s?.claudeApiKey || s?.geminiApiKey);
  } catch {
    return false;
  }
}

/**
 * Pure free user: no API keys AND not on premium.
 * Tightest limits: 2 AI generations lifetime, 2 PDF downloads, watermarked.
 */
export function isPureFreeTier(): boolean {
  return getTier() === 'free' && !hasByokKeys();
}

/**
 * True if the CV PDF must include the ProCV watermark.
 * Only Pro (premium) users receive clean PDFs.
 */
export function needsWatermark(): boolean {
  return getTier() !== 'premium';
}

/**
 * True if the user may use Boosted / Aggressive generation modes.
 * Pure free users (no API keys) are limited to Honest mode only.
 */
export function canUsePremiumModes(): boolean {
  return getTier() === 'premium' || hasByokKeys();
}

// ─── PDF download counter (pure free tier only) ────────────────────────────

const PDF_DOWNLOAD_KEY = 'procv:pdfDownloadCount';

/** Lifetime PDF downloads allowed on the pure free tier. */
export const FREE_PDF_LIMIT = 2;

/** Returns how many PDFs the user has downloaded on the free tier. */
export function getPdfDownloadCount(): number {
  try {
    return parseInt(localStorage.getItem(PDF_DOWNLOAD_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/** Increments the lifetime PDF download counter. */
export function incrementPdfDownloadCount(): void {
  try {
    localStorage.setItem(PDF_DOWNLOAD_KEY, String(getPdfDownloadCount() + 1));
  } catch { /* ignore */ }
}

/**
 * Returns true if the user is allowed to start a PDF download.
 * - Premium → always true (clean PDF, unlimited).
 * - BYOK    → always true (watermarked, unlimited).
 * - Free    → true until FREE_PDF_LIMIT lifetime downloads.
 */
export function canDownloadPdf(): boolean {
  if (getTier() === 'premium') return true;
  if (hasByokKeys()) return true;
  return getPdfDownloadCount() < FREE_PDF_LIMIT;
}

// ─── Phase 2 stub ────────────────────────────────────────────────────────────

/**
 * (Phase 2) Fetch the canonical tier from the cv-engine-worker D1 database
 * and sync it to localStorage. Called after the user authenticates.
 *
 * Implementation checklist for Phase 2:
 *   1. Add GET /api/account/tier to cv-engine-worker (handlers/accountTier.ts).
 *   2. The worker reads the `account_tier` column from the `users` D1 table.
 *   3. Call syncTierFromServer() inside WorkerAuthContext after sign-in.
 *   4. Add requirePremium middleware to /api/cv/tiered-llm for workers-ai tasks.
 */
export async function syncTierFromServer(_authToken: string): Promise<void> {
  // TODO Phase 2: implement server sync
  // const res = await fetch(`${CV_ENGINE_URL}/api/account/tier`, {
  //   headers: { Authorization: `Bearer ${authToken}` },
  // });
  // if (res.ok) {
  //   const { tier } = await res.json();
  //   setTier(tier);
  // }
}
