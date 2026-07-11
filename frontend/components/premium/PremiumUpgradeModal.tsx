/**
 * PremiumUpgradeModal.tsx
 *
 * Paywall modal shown when a user tries to access a gated feature.
 *
 * Context-aware: shows different messaging and feature lists depending on
 * whether the user is on Free (needs to unlock most things) or BYOK (only
 * needs a few Premium-exclusive features).
 */

import React from 'react';
import { TIER_FEATURES, getFeatureMeta, getEffectiveTier } from '../../services/accountTierService';
import type { TierFeature, EffectiveTier } from '../../types/accountTier';

interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The specific feature the user tried to access — highlighted at the top. */
  blockedFeature: TierFeature;
  /**
   * The user's current effective tier. Falls back to getEffectiveTier() if omitted.
   * Pass this explicitly when calling from a context where the tier is already known.
   */
  effectiveTier?: EffectiveTier;
  /** Called when the user taps "Upgrade to Premium" — wire to Stripe / PricingModal. */
  onUpgrade?: () => void;
}

export const PremiumUpgradeModal: React.FC<PremiumUpgradeModalProps> = ({
  isOpen,
  onClose,
  blockedFeature,
  effectiveTier: effectiveTierProp,
  onUpgrade,
}) => {
  if (!isOpen) return null;

  const currentTier = effectiveTierProp ?? getEffectiveTier();
  const blocked = getFeatureMeta(blockedFeature);

  // Only show features the user would GAIN — not ones they already have.
  const premiumFeatures = (Object.keys(TIER_FEATURES) as TierFeature[]).filter(
    (f) =>
      TIER_FEATURES[f].tiers.includes('premium') &&
      !TIER_FEATURES[f].tiers.includes(currentTier),
  );

  const isByok = currentTier === 'byok';

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
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A84C] mb-1">
                {isByok ? 'Premium exclusive' : 'Premium feature'}
              </p>
              <h2
                id="upgrade-modal-title"
                className="text-xl font-bold"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Unlock {blocked.label}
              </h2>
              <p className="text-sm text-white/70 mt-1 leading-relaxed">
                {blocked.description}
              </p>
            </div>
            <span className="text-3xl flex-shrink-0">{blocked.icon}</span>
          </div>

          {/* Context message for BYOK users */}
          {isByok && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs text-white/80 leading-relaxed"
                 style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)' }}>
              🔑 You're already on BYOK — you have unlimited generations and most tools.
              Premium adds the few features below on top of what you have.
            </div>
          )}
        </div>

        {/* Feature list — only features the user would gain */}
        <div className="px-6 py-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {isByok ? `What you'd gain with Premium` : 'Everything in Premium'}
          </p>
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {premiumFeatures.map((f) => {
              const meta = getFeatureMeta(f);
              const isHighlighted = f === blockedFeature;
              return (
                <li
                  key={f}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isHighlighted
                      ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-[#C9A84C]/40'
                      : 'hover:bg-zinc-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">
                      {meta.label}
                    </span>
                    {isHighlighted && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                        {meta.description}
                      </p>
                    )}
                  </div>
                  {isHighlighted && (
                    <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full self-start mt-0.5"
                          style={{ background: 'rgba(201,168,76,0.2)', color: '#7a620e' }}>
                      This feature
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Data safety note */}
        <div className="mx-6 mb-3 rounded-lg px-3 py-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed"
             style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
          🔐 All your CVs and saved work carry over when you upgrade — nothing is lost.
          You can downgrade any time.
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex flex-col gap-2">
          <button
            className="w-full py-2.5 rounded-xl font-black text-sm text-white shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #2d4270 100%)' }}
            onClick={() => {
              onUpgrade?.();
              onClose();
            }}
          >
            👑 Upgrade to Premium
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};
