/**
 * accountTier.ts
 *
 * Single source of truth for account tier types and feature gating.
 * All tier logic flows from these definitions — service, hooks, and
 * UI components import from here rather than duplicating strings.
 */

/** The two tiers the app currently supports. */
export type AccountTier = 'free' | 'premium';

/**
 * Every feature that can be gated behind a tier.
 * Add new gated features here — nothing else needs changing until
 * you wire the feature into TIER_FEATURES in accountTierService.ts.
 */
export type TierFeature =
  | 'workers-ai'       // Cloudflare Workers AI provider (no BYOK key needed)
  | 'bulk-export'      // Export multiple CVs at once (roadmap)
  | 'custom-domain';   // Shareable CV on a custom domain (roadmap)

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
