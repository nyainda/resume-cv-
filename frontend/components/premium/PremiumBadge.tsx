/**
 * PremiumBadge.tsx
 *
 * Small inline badge/chip shown next to gated features.
 * Use `variant="lock"` on locked items and `variant="crown"` on premium labels.
 */

import React from 'react';

interface PremiumBadgeProps {
  variant?: 'crown' | 'lock';
  size?: 'sm' | 'xs';
  className?: string;
}

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({
  variant = 'crown',
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = size === 'xs'
    ? 'text-[9px] px-1.5 py-0.5 gap-0.5'
    : 'text-[10px] px-2 py-0.5 gap-1';

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full
        bg-[#C9A84C]/20 text-[#7a620e] dark:bg-yellow-900/30 dark:text-yellow-300
        ${sizeClasses} ${className}`}
    >
      <span>{variant === 'crown' ? '👑' : '🔒'}</span>
      <span>Premium</span>
    </span>
  );
};
