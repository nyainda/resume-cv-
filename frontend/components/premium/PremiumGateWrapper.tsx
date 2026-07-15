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
  /**
   * When true the children are NOT rendered at all when the tier is insufficient.
   * Instead a locked-page placeholder with an upgrade prompt is shown.
   * Use this for full-page view gating. Default: false (click-intercept mode).
   */
  blockContent?: boolean;
}

export const PremiumGateWrapper: React.FC<PremiumGateWrapperProps> = ({
  feature,
  children,
  className = '',
  blockContent = false,
}) => {
  const { allowed, isUpgradeOpen, openUpgrade, closeUpgrade } = usePremiumGate(feature);

  // ── Full-page blocking mode ───────────────────────────────────────────────
  if (blockContent && !allowed) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[420px] gap-6 p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-3xl">
            🔒
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Premium Feature</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
              This tool is exclusive to ProCV Premium. Upgrade to unlock it alongside clean PDFs, LinkedIn optimizer, and the full career suite.
            </p>
          </div>
          <button
            onClick={openUpgrade}
            className="px-6 py-2.5 rounded-xl bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Upgrade to Premium →
          </button>
        </div>
        <PremiumUpgradeModal isOpen={isUpgradeOpen} onClose={closeUpgrade} blockedFeature={feature} />
      </>
    );
  }

  // ── Click-intercept mode (default) ────────────────────────────────────────
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
