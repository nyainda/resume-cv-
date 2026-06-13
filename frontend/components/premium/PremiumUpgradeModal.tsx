/**
 * PremiumUpgradeModal.tsx
 *
 * Paywall modal shown when a free user tries to access a premium feature.
 * Displays the specific feature they tried to use plus a list of all premium perks.
 * The CTA is intentionally generic for now — wire to your payment flow in Phase 2.
 */

import React from 'react';
import { TIER_FEATURES, getFeatureMeta } from '../../services/accountTierService';
import type { TierFeature } from '../../types/accountTier';

interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The feature the user tried to access — highlighted at the top. */
  blockedFeature: TierFeature;
}

const ALL_PREMIUM_FEATURES = (Object.keys(TIER_FEATURES) as TierFeature[]).filter(
  (f) => TIER_FEATURES[f].tiers.includes('premium') && !TIER_FEATURES[f].tiers.includes('free'),
);

export const PremiumUpgradeModal: React.FC<PremiumUpgradeModalProps> = ({
  isOpen,
  onClose,
  blockedFeature,
}) => {
  if (!isOpen) return null;

  const blocked = getFeatureMeta(blockedFeature);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#1B2B4B] to-[#2d4270] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C] mb-1">
                Premium Feature
              </p>
              <h2
                id="upgrade-modal-title"
                className="text-xl font-bold font-[Playfair_Display,serif]"
              >
                Unlock {blocked.label}
              </h2>
              <p className="text-sm text-white/70 mt-1 leading-relaxed">
                {blocked.description}
              </p>
            </div>
            <span className="text-3xl flex-shrink-0">{blocked.icon}</span>
          </div>
        </div>

        {/* Feature list */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Everything in Premium
          </p>
          <ul className="space-y-2">
            {ALL_PREMIUM_FEATURES.map((f) => {
              const meta = getFeatureMeta(f);
              const isHighlighted = f === blockedFeature;
              return (
                <li
                  key={f}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${
                    isHighlighted
                      ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-[#C9A84C]/40'
                      : ''
                  }`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                      {meta.label}
                    </span>
                    {isHighlighted && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {meta.description}
                      </p>
                    )}
                  </div>
                  {isHighlighted && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#7a620e] dark:text-yellow-300 flex-shrink-0">
                      This feature
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex flex-col gap-2">
          <button
            className="w-full py-2.5 rounded-xl font-bold text-sm
              bg-gradient-to-r from-[#C9A84C] to-[#a8872e]
              text-white shadow-lg hover:opacity-90 transition-opacity"
            onClick={() => {
              // Phase 2: open payment flow / link to pricing page
              onClose();
            }}
          >
            👑 Upgrade to Premium
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};
