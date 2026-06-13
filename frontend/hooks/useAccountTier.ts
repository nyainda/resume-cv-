/**
 * useAccountTier.ts
 *
 * Reactive hook that tracks the current account tier.
 * Re-renders automatically when the tier changes in any tab.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTier,
  setTier as persistTier,
  hasFeature,
  TIER_CHANGED_EVENT,
} from '../services/accountTierService';
import type { AccountTier, TierFeature } from '../types/accountTier';

export interface UseAccountTierResult {
  tier: AccountTier;
  isPremium: boolean;
  /** Check if the current tier unlocks a specific feature. */
  hasFeature: (feature: TierFeature) => boolean;
  /** Upgrade / downgrade the tier (admin / promo use). */
  setTier: (tier: AccountTier) => void;
}

export function useAccountTier(): UseAccountTierResult {
  const [tier, setTierState] = useState<AccountTier>(getTier);

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
    (feature: TierFeature) => hasFeature(feature, tier),
    [tier],
  );

  const handleSetTier = useCallback((newTier: AccountTier) => {
    persistTier(newTier);
  }, []);

  return {
    tier,
    isPremium: tier === 'premium',
    hasFeature: checkFeature,
    setTier: handleSetTier,
  };
}
