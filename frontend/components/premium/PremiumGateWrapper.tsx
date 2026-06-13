/**
 * PremiumGateWrapper.tsx
 *
 * Wraps any clickable UI element. If the current tier doesn't have the
 * required feature, clicks are intercepted and the upgrade modal is shown
 * instead of running the action.
 *
 * Usage:
 *   <PremiumGateWrapper feature="workers-ai">
 *     <button onClick={doSomething}>Use Workers AI</button>
 *   </PremiumGateWrapper>
 */

import React from 'react';
import { usePremiumGate } from '../../hooks/usePremiumGate';
import { PremiumUpgradeModal } from './PremiumUpgradeModal';
import type { TierFeature } from '../../types/accountTier';

interface PremiumGateWrapperProps {
  feature: TierFeature;
  children: React.ReactNode;
  /** Extra classes applied to the wrapper div. */
  className?: string;
}

export const PremiumGateWrapper: React.FC<PremiumGateWrapperProps> = ({
  feature,
  children,
  className = '',
}) => {
  const { allowed, isUpgradeOpen, openUpgrade, closeUpgrade } = usePremiumGate(feature);

  const handleClick = (e: React.MouseEvent) => {
    if (!allowed) {
      e.preventDefault();
      e.stopPropagation();
      openUpgrade();
    }
  };

  return (
    <>
      <div
        className={`relative ${className}`}
        onClick={handleClick}
        style={allowed ? undefined : { cursor: 'pointer' }}
      >
        {children}
      </div>

      <PremiumUpgradeModal
        isOpen={isUpgradeOpen}
        onClose={closeUpgrade}
        blockedFeature={feature}
      />
    </>
  );
};
