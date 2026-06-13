/**
 * usePremiumGate.ts
 *
 * Convenience hook for a single gated feature.
 * Returns whether the feature is allowed and helpers for showing the upgrade modal.
 *
 * Usage:
 *   const { allowed, isUpgradeOpen, openUpgrade, closeUpgrade } = usePremiumGate('workers-ai');
 */

import { useState, useCallback } from 'react';
import { useAccountTier } from './useAccountTier';
import type { TierFeature } from '../types/accountTier';

export interface UsePremiumGateResult {
  /** True if the current tier can use this feature. */
  allowed: boolean;
  /** Controls the upgrade modal visibility. */
  isUpgradeOpen: boolean;
  /** Open the upgrade modal. */
  openUpgrade: () => void;
  /** Close the upgrade modal. */
  closeUpgrade: () => void;
  /**
   * Call this on a gated action. If allowed, runs the callback.
   * If not, opens the upgrade modal instead.
   */
  guard: (action?: () => void) => void;
}

export function usePremiumGate(feature: TierFeature): UsePremiumGateResult {
  const { hasFeature } = useAccountTier();
  const allowed = hasFeature(feature);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const openUpgrade = useCallback(() => setIsUpgradeOpen(true), []);
  const closeUpgrade = useCallback(() => setIsUpgradeOpen(false), []);

  const guard = useCallback(
    (action?: () => void) => {
      if (allowed) {
        action?.();
      } else {
        setIsUpgradeOpen(true);
      }
    },
    [allowed],
  );

  return { allowed, isUpgradeOpen, openUpgrade, closeUpgrade, guard };
}
