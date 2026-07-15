/**
 * accountTierService.ts
 *
 * Core tier logic — reading, writing, and querying account tier state.
 * This is a pure service (no React). Hooks and components import from here.
 *
 * Three-tier model:
 *   free    — No API key, no subscription. Workers AI (Mistral 24B) runs silently
 *             in the background — user never sees or configures it.
 *             Gate: 2 lifetime watermarked PDF downloads. CV generation is unlimited.
 *   byok    — Bring Your Own Key (Gemini / Claude / Groq). Unlimited generations on
 *             their own API quota. Unlimited watermarked PDFs. No Workers AI access
 *             or fallback — their key is the sole AI source.
 *   premium — Subscription ($19/mo or $149/yr). Workers AI best models (Llama 70B +
 *             DeepSeek R1) run silently. Clean (watermark-free) PDFs. Full career suite.
 *
 * Storage: 'cv_builder:accountTier' in localStorage holds 'free' | 'premium'.
 *          BYOK is detected at runtime via key presence — not stored separately.
 */

import type { AccountTier, EffectiveTier, TierFeature, TierFeatureConfig } from '../types/accountTier';
import { fetchTierInfo, incrementUsageCount, markByok, UsageLimitExceededError } from './cvUsageClient';
import { getUserPrefix } from './storage/userStorageNamespace';

export { markByok };

// ─── Storage key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cv_builder:accountTier';

/**
 * Custom event fired whenever the stored tier changes so all hooks stay in
 * sync across tabs and components without prop-drilling.
 */
export const TIER_CHANGED_EVENT = 'procv:tierChanged';

// ─── Limits ──────────────────────────────────────────────────────────────────

/**
 * CV generation is unlimited for all tiers.
 * Blocking generation hurts retention without protecting revenue — the PDF
 * download is the deliverable users pay for.
 * @deprecated No longer enforced. Use FREE_PDF_LIMIT instead.
 */
export const FREE_GENERATION_LIMIT = Infinity;
/** Lifetime PDF downloads allowed on the pure free tier (no keys, no sub). */
export const FREE_PDF_LIMIT = 2;
/** Max tracked applications for free users. */
export const FREE_TRACKER_LIMIT = 15;
/** Max saved CVs visible in CV History for pure free users. */
export const FREE_HISTORY_LIMIT = 5;
/** Max profile slots per effective tier. */
export const SLOT_LIMITS: Record<EffectiveTier, number> = {
  free:    5,
  byok:    3,
  premium: 5,
};

// ─── Feature map ────────────────────────────────────────────────────────────
//
// Three-tier access rules:
//   Free only       → ['free'] (none currently — free is the baseline)
//   BYOK + Premium  → ['byok', 'premium']
//   Premium only    → ['premium']
//
// Workers AI is special: free gets the cheap models (Mistral 24B), premium
// gets the best (Llama 70B + DeepSeek R1). BYOK uses their own keys instead.

export const TIER_FEATURES: Record<TierFeature, { tiers: EffectiveTier[]; meta: TierFeatureConfig }> = {
  // ── Workers AI access ─────────────────────────────────────────────────────
  'workers-ai': {
    tiers: ['free', 'premium'],   // BYOK uses own keys — doesn't need Workers AI
    meta: {
      label: 'Workers AI',
      icon: '✨',
      description:
        'Cloudflare-powered AI with no API key required. Runs the full CV pipeline server-side — generation, audit, humanization, and more.',
    },
  },

  // ── BYOK + Premium features ───────────────────────────────────────────────
  'boosted-mode': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Boosted & Aggressive Modes',
      icon: '🚀',
      description: 'Unlock higher-intensity writing modes that punch up language and impact for competitive roles.',
    },
  },
  'ats-gap-pinning': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'ATS Gap Pinning',
      icon: '🎯',
      description: 'Automatically detects missing keywords from the job description and pins them into your CV during generation.',
    },
  },
  'unlimited-pdf': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Unlimited PDF Downloads',
      icon: '📥',
      description: 'No cap on how many CVs you can download. BYOK downloads include a ProCV watermark; Premium downloads are clean.',
    },
  },
  'interview-prep': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Interview Prep',
      icon: '🎤',
      description: 'AI-generated behavioural, technical, and situational questions tailored to your role and experience.',
    },
  },
  'email-apply': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Email Apply',
      icon: '✉️',
      description: 'Draft personalised application emails and follow-ups in one click.',
    },
  },
  'scholarship': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Scholarship Essay Writer',
      icon: '🎓',
      description: 'Generate compelling scholarship, fellowship, and research grant essays from your profile.',
    },
  },
  'unlimited-tracker': {
    tiers: ['byok', 'premium'],
    meta: {
      label: 'Unlimited Job Tracking',
      icon: '📊',
      description: `Track more than ${FREE_TRACKER_LIMIT} active job applications with full kanban and analytics.`,
    },
  },

  // ── Premium-only features ─────────────────────────────────────────────────
  'clean-pdf': {
    tiers: ['premium'],
    meta: {
      label: 'Watermark-Free PDF',
      icon: '📄',
      description: 'Download clean, professional PDFs with no ProCV branding. Available exclusively on the Premium plan.',
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
  'career-pivot': {
    tiers: ['premium'],
    meta: {
      label: 'Career Pivot Advisor',
      icon: '🔄',
      description: 'Map your transferable skills to new industries and roles with an AI-guided pivot roadmap.',
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

// ─── Read / write stored plan ─────────────────────────────────────────────────

/** Returns the stored account plan ('free' | 'premium'). Use getEffectiveTier() for feature checks. */
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
 */
export function setTier(tier: AccountTier): void {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // ignore write errors
  }
  window.dispatchEvent(new CustomEvent(TIER_CHANGED_EVENT, { detail: { tier } }));
}

// ─── BYOK detection ───────────────────────────────────────────────────────────

/**
 * Returns true when the user has configured at least one third-party AI key
 * (Groq / Claude / Gemini). These are "BYOK" users — unlimited AI generations
 * on their own quota, but PDFs are watermarked until they subscribe to Premium.
 */
export function hasByokKeys(): boolean {
  try {
    // Settings are persisted by useStorage()/LocalStorageService under the
    // user-namespaced key `u_<userId>:cv_builder:apiSettings` (or `anon:...`
    // when signed out) — NOT the bare `cv_builder:apiSettings` key. Checking
    // only the bare key meant this always returned false post-login, so a
    // BYOK user with a saved key was permanently misclassified as 'free'
    // (still saw the free-tier PDF download limit, etc).
    const userPrefix = getUserPrefix();
    const raw =
      localStorage.getItem(`${userPrefix}cv_builder:apiSettings`) ||
      localStorage.getItem('cv_builder:apiSettings') ||
      localStorage.getItem('apiSettings');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s?.apiKey || s?.claudeApiKey || s?.geminiApiKey || s?.groqApiKey);
  } catch {
    return false;
  }
}

// ─── Effective tier ───────────────────────────────────────────────────────────

/**
 * Returns the runtime effective tier — the tier that drives all feature checks.
 *
 *   premium  → active subscription (plan='premium' in D1)
 *   byok     → has a third-party API key; plan is still 'free' in D1
 *   free     → no key, no subscription
 *
 * Always call this (not getTier()) when gating features.
 */
export function getEffectiveTier(): EffectiveTier {
  if (getTier() === 'premium') return 'premium';
  if (hasByokKeys()) return 'byok';
  return 'free';
}

// ─── Feature checks ───────────────────────────────────────────────────────────

/** Returns true if the given effective tier has access to the feature. */
export function hasFeature(feature: TierFeature, tier: EffectiveTier): boolean {
  return TIER_FEATURES[feature]?.tiers.includes(tier) ?? false;
}

/** Returns all features unlocked by a given effective tier. */
export function getFeaturesForTier(tier: EffectiveTier): TierFeature[] {
  return (Object.keys(TIER_FEATURES) as TierFeature[]).filter((f) =>
    TIER_FEATURES[f].tiers.includes(tier),
  );
}

/** Returns the display metadata for a feature. */
export function getFeatureMeta(feature: TierFeature): TierFeatureConfig {
  return TIER_FEATURES[feature].meta;
}

// ─── Convenience checks ───────────────────────────────────────────────────────

/**
 * Pure free user: no API keys AND not on premium.
 * Tightest limits apply: capped generations, capped downloads, watermarked.
 */
export function isPureFreeTier(): boolean {
  return getEffectiveTier() === 'free';
}

/**
 * True if the CV PDF must include the ProCV watermark.
 * Only Premium subscribers receive clean PDFs.
 */
export function needsWatermark(): boolean {
  return getEffectiveTier() !== 'premium';
}

/**
 * True if the user may use Boosted / Aggressive generation modes.
 * BYOK and Premium users both get all modes.
 */
export function canUsePremiumModes(): boolean {
  return getEffectiveTier() !== 'free';
}

// ─── CV generation counter + daily limit ─────────────────────────────────────

const GENERATION_COUNT_KEY    = 'procv:freeGenCount';
const DAILY_GEN_REMAINING_KEY = 'procv:dailyGenRemaining';
const DAILY_GEN_DATE_KEY      = 'procv:dailyGenDate';

/** Free-tier daily generation cap (mirrors FREE_DAILY_GEN_LIMIT in usage.ts). */
export const FREE_DAILY_GEN_LIMIT = 15;

/** Returns how many CVs the user has generated on the free tier (lifetime). */
export function getGenerationCount(): number {
  try {
    return parseInt(localStorage.getItem(GENERATION_COUNT_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Returns remaining CV generations for today (free tier only).
 * Returns null for BYOK/Premium (unlimited).
 * Resets to FREE_DAILY_GEN_LIMIT when the stored date is not today.
 */
export function getDailyGenRemaining(): number | null {
  if (getEffectiveTier() !== 'free') return null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem(DAILY_GEN_DATE_KEY);
    if (stored !== today) return FREE_DAILY_GEN_LIMIT; // new day — full allowance
    const v = localStorage.getItem(DAILY_GEN_REMAINING_KEY);
    if (v === null) return FREE_DAILY_GEN_LIMIT;
    return Math.max(0, parseInt(v, 10));
  } catch {
    return FREE_DAILY_GEN_LIMIT;
  }
}

function _saveDailyRemaining(remaining: number): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(DAILY_GEN_REMAINING_KEY, String(remaining));
    localStorage.setItem(DAILY_GEN_DATE_KEY, today);
  } catch { /* ignore */ }
}

/**
 * Server-authoritative check-and-increment.
 *
 * - cv_gen (free)    → checks daily 15/day limit via D1; syncs remaining to localStorage.
 * - cv_gen (BYOK/PM) → returns true immediately — no server call.
 * - pdf_dl (free)    → checks lifetime 2-download limit via D1.
 * - pdf_dl (BYOK/PM) → returns true immediately.
 *
 * Returns false when the server hard-blocks. Fails open on network errors.
 */
export async function serverCheckAndIncrement(type: 'cv_gen' | 'pdf_dl'): Promise<boolean> {
  const tier = getEffectiveTier();

  if (type === 'cv_gen') {
    // BYOK and Premium are unlimited — no server call.
    if (tier !== 'free') return true;

    try {
      const result = await incrementUsageCount('cv_gen');
      if (result) {
        try {
          localStorage.setItem(GENERATION_COUNT_KEY, String(result.cv_gen_count));
          if (result.cv_gen_daily_remaining !== null && result.cv_gen_daily_remaining !== undefined) {
            _saveDailyRemaining(result.cv_gen_daily_remaining);
          }
        } catch { /* ignore */ }
      }
      return true;
    } catch (err) {
      if (err instanceof UsageLimitExceededError) {
        // Sync remaining (0) so local UI reflects the block immediately.
        _saveDailyRemaining(0);
        return false;
      }
      // Network error → fail open (never block on a connectivity blip).
      return true;
    }
  }

  // pdf_dl path
  if (tier !== 'free') return true;

  try {
    const result = await incrementUsageCount('pdf_dl');
    if (result) {
      try { localStorage.setItem(PDF_DOWNLOAD_KEY, String(result.pdf_dl_count)); } catch { /* ignore */ }
    }
    return true;
  } catch (err) {
    if (err instanceof UsageLimitExceededError) {
      try { localStorage.setItem(PDF_DOWNLOAD_KEY, String(err.counts.pdf_dl_count)); } catch { /* ignore */ }
      return false;
    }
    return true;
  }
}

/** @deprecated No-op kept for call-site safety. */
export function incrementGenerationCount(): void { /* intentional no-op */ }

/**
 * Returns true if the user may start a CV generation right now.
 * BYOK/Premium: always. Free: true unless the local daily counter shows 0.
 * (The server enforces the real limit — this is a fast local pre-check.)
 */
export function canGenerate(): boolean {
  if (getEffectiveTier() !== 'free') return true;
  const remaining = getDailyGenRemaining();
  return remaining === null || remaining > 0;
}

// ─── PDF download counter (pure free tier only) ───────────────────────────────

const PDF_DOWNLOAD_KEY = 'procv:pdfDownloadCount';

/** Returns how many PDFs the user has downloaded on the free tier. */
export function getPdfDownloadCount(): number {
  try {
    return parseInt(localStorage.getItem(PDF_DOWNLOAD_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/** @deprecated Use serverCheckAndIncrement('pdf_dl') instead. No-op kept for safety. */
export function incrementPdfDownloadCount(): void {
  // Intentional no-op: server-side check-and-increment replaced this.
  // Callers in cvDownloadService.ts now call serverCheckAndIncrement() before
  // rendering, which atomically checks the limit AND increments server-side.
}

/**
 * Returns true if the user is allowed to start a PDF download.
 * - Premium → always true (clean PDF, unlimited).
 * - BYOK    → always true (watermarked, unlimited).
 * - Free    → true until FREE_PDF_LIMIT lifetime downloads.
 */
export function canDownloadPdf(): boolean {
  const t = getEffectiveTier();
  if (t === 'premium' || t === 'byok') return true;
  return getPdfDownloadCount() < FREE_PDF_LIMIT;
}

// ─── Job tracker limit ────────────────────────────────────────────────────────

/**
 * Returns true if the user can add another tracked application.
 * BYOK and Premium users get unlimited tracking.
 */
export function canAddTrackedApp(currentCount: number): boolean {
  if (getEffectiveTier() !== 'free') return true;
  return currentCount < FREE_TRACKER_LIMIT;
}

// ─── CV history limit ─────────────────────────────────────────────────────────

/**
 * Returns how many saved CVs the user can see in CV History.
 * Free users see the most recent FREE_HISTORY_LIMIT; BYOK/Premium see all.
 */
export function getHistoryLimit(): number {
  if (getEffectiveTier() !== 'free') return Infinity;
  return FREE_HISTORY_LIMIT;
}

// ─── Profile slot limit ───────────────────────────────────────────────────────

/** Returns the maximum number of profile slots the user can have. */
export function getProfileSlotLimit(): number {
  return SLOT_LIMITS[getEffectiveTier()];
}

/** Returns true if the user can create another profile slot. */
export function canAddProfileSlot(currentCount: number): boolean {
  return currentCount < getProfileSlotLimit();
}

// ─── Phase 2 stub ────────────────────────────────────────────────────────────

/**
 * Reconcile the locally-cached plan with the server-confirmed plan from a
 * validated session (AuthContext calls this on every boot/login/session
 * refresh — the only place a session's `plan` is confirmed by the server).
 *
 * This is a two-way sync, not a one-way "upgrade seed": it also DOWNGRADES
 * `cv_builder:accountTier` back to 'free' when the server says the account
 * is no longer premium (subscription canceled/expired/manually revoked by
 * an admin). Without the downgrade branch, a premium user whose plan lapses
 * would keep unlimited/clean PDFs forever, because nothing else in the app
 * ever re-checks the stored tier against the server.
 */
export function syncTierFromSession(serverPlan: string | null | undefined): void {
  const next: AccountTier = serverPlan === 'premium' ? 'premium' : 'free';
  if (getTier() !== next) setTier(next);
}

/**
 * Fetch the canonical tier + usage counts from the cv-engine-worker D1 database
 * and seed localStorage so all subsequent synchronous reads are up-to-date.
 * Called after the user authenticates. Silently no-ops on any network failure.
 */
export async function syncTierFromServer(_authToken: string): Promise<void> {
  try {
    const info = await fetchTierInfo();
    if (!info) return;

    // Two-way sync: premium is seeded, but a lapsed/canceled subscription
    // must also downgrade back to 'free' — see syncTierFromSession() above
    // for why a one-way "upgrade only" seed silently strands ex-premium
    // users on unlimited/clean PDFs forever.
    syncTierFromSession(info.plan);

    // Seed usage counters — use the server value if it is higher than the local
    // value (devices could have incremented independently; we want the max).
    try {
      const localGen = getGenerationCount();
      if (info.cv_gen_count > localGen) {
        localStorage.setItem(GENERATION_COUNT_KEY, String(info.cv_gen_count));
      }
      const localPdf = getPdfDownloadCount();
      if (info.pdf_dl_count > localPdf) {
        localStorage.setItem(PDF_DOWNLOAD_KEY, String(info.pdf_dl_count));
      }
    } catch { /* ignore */ }
  } catch { /* non-fatal — fall back to localStorage values */ }
}
