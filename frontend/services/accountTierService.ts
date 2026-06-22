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

// ─── Limits (defined before TIER_FEATURES so they can be referenced in descriptions) ──

/** Lifetime PDF downloads allowed on the pure free tier. */
export const FREE_PDF_LIMIT = 5;
/** Max tracked applications for free (non-BYOK, non-premium) users. */
export const FREE_TRACKER_LIMIT = 15;
/** Max saved CVs visible in CV History for pure free users. */
export const FREE_HISTORY_LIMIT = 5;
/** Max profile slots per tier. */
export const SLOT_LIMITS: Record<'free' | 'byok' | 'premium', number> = {
  free:    1,
  byok:    3,
  premium: 5,
};

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
  'boosted-mode': {
    tiers: ['premium'],
    meta: {
      label: 'Boosted & Aggressive Modes',
      icon: '🚀',
      description: 'Unlock higher-intensity writing modes that punch up language and impact for competitive roles.',
    },
  },
  'ats-gap-pinning': {
    tiers: ['premium'],
    meta: {
      label: 'ATS Gap Pinning',
      icon: '🎯',
      description: 'Automatically detects missing keywords from the job description and pins them into your CV during generation.',
    },
  },
  'clean-pdf': {
    tiers: ['premium'],
    meta: {
      label: 'Watermark-Free PDF',
      icon: '📄',
      description: 'Download clean, professional PDFs with no ProCV branding.',
    },
  },
  'unlimited-pdf': {
    tiers: ['premium'],
    meta: {
      label: 'Unlimited PDF Downloads',
      icon: '📥',
      description: 'No cap on how many CVs you can download.',
    },
  },
  'interview-prep': {
    tiers: ['premium'],
    meta: {
      label: 'Interview Prep',
      icon: '🎤',
      description: 'AI-generated behavioural, technical, and situational questions tailored to your role and experience.',
    },
  },
  'linkedin-optimizer': {
    tiers: ['premium'],
    meta: {
      label: 'LinkedIn Optimizer',
      icon: '💼',
      description: 'Rewrite your LinkedIn headline, summary, and experience sections to match top-performing profiles.',
    },
  },
  'salary-negotiation': {
    tiers: ['premium'],
    meta: {
      label: 'Salary Negotiation Coach',
      icon: '💰',
      description: 'Research market rates, build your case, and get scripts for negotiating your offer.',
    },
  },
  'email-apply': {
    tiers: ['premium'],
    meta: {
      label: 'Email Apply',
      icon: '✉️',
      description: 'Draft personalised application emails and follow-ups in one click.',
    },
  },
  'career-pivot': {
    tiers: ['premium'],
    meta: {
      label: 'Career Pivot Advisor',
      icon: '🔄',
      description: 'Map your transferable skills to new industries and roles with an AI-guided pivot roadmap.',
    },
  },
  'scholarship': {
    tiers: ['premium'],
    meta: {
      label: 'Scholarship Essay Writer',
      icon: '🎓',
      description: 'Generate compelling scholarship, fellowship, and research grant essays from your profile.',
    },
  },
  'career-suite': {
    tiers: ['premium'],
    meta: {
      label: 'Full Career Suite',
      icon: '🧰',
      description: 'Unlimited access to every ProCV tool — Interview Prep, LinkedIn, Negotiation, Email Apply, Career Pivot, and more.',
    },
  },
  'unlimited-tracker': {
    tiers: ['premium'],
    meta: {
      label: 'Unlimited Job Tracking',
      icon: '📊',
      description: `Track more than ${FREE_TRACKER_LIMIT} active job applications with full kanban and analytics.`,
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
 * Tightest limits apply: capped generations, capped downloads, watermarked.
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

// ─── Job tracker limit ────────────────────────────────────────────────────────

/**
 * Returns true if the user can add another tracked application.
 * BYOK users get unlimited tracking. Premium too.
 */
export function canAddTrackedApp(currentCount: number): boolean {
  if (getTier() === 'premium') return true;
  if (hasByokKeys()) return true;
  return currentCount < FREE_TRACKER_LIMIT;
}

// ─── CV history limit ─────────────────────────────────────────────────────────

/**
 * Returns how many saved CVs the user can see in CV History.
 * Free users see the 5 most recent; premium/BYOK see all.
 */
export function getHistoryLimit(): number {
  if (getTier() === 'premium') return Infinity;
  if (hasByokKeys()) return Infinity;
  return FREE_HISTORY_LIMIT;
}

// ─── Profile slot limit ───────────────────────────────────────────────────────

/**
 * Returns the maximum number of profile slots the user can have.
 */
export function getProfileSlotLimit(): number {
  if (getTier() === 'premium') return SLOT_LIMITS.premium;
  if (hasByokKeys()) return SLOT_LIMITS.byok;
  return SLOT_LIMITS.free;
}

/**
 * Returns true if the user can create another profile slot.
 */
export function canAddProfileSlot(currentCount: number): boolean {
  return currentCount < getProfileSlotLimit();
}

// ─── Phase 2 stub ────────────────────────────────────────────────────────────

/**
 * (Phase 2) Fetch the canonical tier from the cv-engine-worker D1 database
 * and sync it to localStorage. Called after the user authenticates.
 */
export async function syncTierFromServer(_authToken: string): Promise<void> {
  // TODO Phase 2: implement server sync
}
