/**
 * accountTier.ts
 *
 * Single source of truth for account tier types and feature gating.
 * All tier logic flows from these definitions — service, hooks, and
 * UI components import from here rather than duplicating strings.
 */

/** The stored plan — what's in D1 / localStorage. */
export type AccountTier = 'free' | 'premium';

/**
 * The runtime effective tier — includes BYOK detection.
 * Computed by getEffectiveTier() in accountTierService.ts.
 *
 *   free    → no keys, no subscription
 *   byok    → has Gemini/Claude key, plan is 'free' in D1
 *   premium → active subscription, plan is 'premium' in D1
 */
export type EffectiveTier = 'free' | 'byok' | 'premium';

/**
 * Every feature that can be gated behind a tier.
 * Add new gated features here — nothing else needs changing until
 * you wire the feature into TIER_FEATURES in accountTierService.ts.
 */
export type TierFeature =
  | 'workers-ai'         // Cloudflare Workers AI (no BYOK key needed)
  | 'boosted-mode'       // Boosted / Aggressive writing modes
  | 'ats-gap-pinning'    // ATS keyword gap analysis in generation
  | 'clean-pdf'          // PDF without ProCV watermark (Premium only)
  | 'unlimited-pdf'      // No per-lifetime PDF download cap
  | 'interview-prep'     // Interview Prep tool
  | 'linkedin-optimizer' // LinkedIn Profile Optimizer (Premium only)
  | 'salary-negotiation' // Salary Negotiation Coach (Premium only)
  | 'email-apply'        // Email Apply tool
  | 'career-pivot'       // Career Pivot Advisor (Premium only)
  | 'scholarship'        // Scholarship Essays tool
  | 'career-suite'       // Full career suite — all tools (Premium only)
  | 'unlimited-tracker'  // Unlimited job application tracking
  | 'bulk-export'        // Export multiple CVs as ZIP (Premium only)
  | 'custom-domain';     // Shareable CV on a custom domain (Premium only)

/** Per-feature metadata shown in the upgrade modal. */
export interface TierFeatureConfig {
  label: string;
  description: string;
  icon: string;
}

/** What each tier is allowed to access. */
export interface TierConfig {
  tier: EffectiveTier;
  features: TierFeature[];
}
