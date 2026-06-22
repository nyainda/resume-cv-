/**
 * accountTier.ts
 *
 * Single source of truth for account tier types and feature gating.
 * All tier logic flows from these definitions — service, hooks, and
 * UI components import from here rather than duplicating strings.
 */

/** The tiers the app currently supports (stored in localStorage). */
export type AccountTier = 'free' | 'premium';

/**
 * Every feature that can be gated behind a tier.
 * Add new gated features here — nothing else needs changing until
 * you wire the feature into TIER_FEATURES in accountTierService.ts.
 */
export type TierFeature =
  | 'workers-ai'         // Cloudflare Workers AI provider (no BYOK key needed)
  | 'boosted-mode'       // Boosted / Aggressive writing modes
  | 'ats-gap-pinning'    // ATS keyword gap analysis in generation
  | 'clean-pdf'          // PDF without ProCV watermark
  | 'unlimited-pdf'      // No per-lifetime PDF download cap
  | 'interview-prep'     // Interview Prep tool
  | 'linkedin-optimizer' // LinkedIn Profile Optimizer
  | 'salary-negotiation' // Salary Negotiation Coach
  | 'email-apply'        // Email Apply tool
  | 'career-pivot'       // Career Pivot Advisor
  | 'scholarship'        // Scholarship Essays tool
  | 'career-suite'       // Full career suite (all tools above)
  | 'unlimited-tracker'  // Unlimited job application tracking (>5)
  | 'bulk-export'        // Export multiple CVs as ZIP
  | 'custom-domain';     // Shareable CV on a custom domain

/** Per-feature metadata shown in the upgrade modal. */
export interface TierFeatureConfig {
  label: string;
  description: string;
  icon: string;
}

/** What each tier is allowed to access. */
export interface TierConfig {
  tier: AccountTier;
  features: TierFeature[];
}
