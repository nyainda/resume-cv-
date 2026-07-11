/**
 * useAccountTier.ts
 *
 * Reactive hook that tracks the current account tier.
 * Re-renders automatically when the tier changes in any tab.
 *
 * Exposes both:
 *   tier          — the stored plan ('free' | 'premium') from D1 / localStorage
 *   effectiveTier — the runtime tier ('free' | 'byok' | 'premium') including BYOK detection
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTier,
  setTier as persistTier,
  hasFeature,
  hasByokKeys,
  TIER_CHANGED_EVENT,
} from '../services/accountTierService';
import type { AccountTier, EffectiveTier, TierFeature } from '../types/accountTier';

export interface UseAccountTierResult {
  /** Stored plan: 'free' | 'premium' (what D1 says). */
  tier: AccountTier;
  /** Runtime effective tier: 'free' | 'byok' | 'premium'. Use this for feature checks. */
  effectiveTier: EffectiveTier;
  isPremium: boolean;
  isByok: boolean;
  /** Check if the current effective tier unlocks a specific feature. */
  hasFeature: (feature: TierFeature) => boolean;
  /** Upgrade / downgrade the stored plan (admin / post-payment use). */
  setTier: (tier: AccountTier) => void;
}

export function useAccountTier(): UseAccountTierResult {
  const [tier, setTierState] = useState<AccountTier>(getTier);

  // Derive effective tier from stored tier + BYOK key presence.
  // Computed inline so it's always fresh on every render.
  const effectiveTier: EffectiveTier =
    tier === 'premium' ? 'premium' : hasByokKeys() ? 'byok' : 'free';

  useEffect(() => {
    const onTierChange = (e: Event) => {
      const detail = (e as CustomEvent<{ tier: AccountTier }>).detail;
      setTierState(detail.tier);
    };

    // Custom event: tier changed programmatically in this tab
    window.addEventListener(TIER_CHANGED_EVENT, onTierChange);

    // Storage event: tier changed in another tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cv_builder:accountTier') {
        setTierState(getTier());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(TIER_CHANGED_EVENT, onTierChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const checkFeature = useCallback(
    (feature: TierFeature) => hasFeature(feature, effectiveTier),
    [effectiveTier],
  );

  const handleSetTier = useCallback((newTier: AccountTier) => {
    persistTier(newTier);
  }, []);

  return {
    tier,
    effectiveTier,
    isPremium: tier === 'premium',
    isByok: effectiveTier === 'byok',
    hasFeature: checkFeature,
    setTier: handleSetTier,
  };
}
