// components/ImportChoiceModal.tsx
// Modal shown when a Word/PDF import detects a DIFFERENT person than the current slot.
// Gives the user a clear, subscription-aware choice: replace this room or create a new one.

import React from 'react';
import type { UserProfile } from '../types';
import { getProfileSlotLimit, getTier, hasByokKeys } from '../services/accountTierService';

interface ImportChoiceModalProps {
  importedProfile: UserProfile;
  currentSlotName: string;
  /** true when the user still has a free slot available */
  canCreateNew: boolean;
  onReplace: () => void;
  onCreateNew: () => void;
  onUpgrade: () => void;
  onCancel: () => void;
}

function planLabel(): string {
  if (getTier() === 'premium') return 'Pro';
  if (hasByokKeys()) return 'BYOK';
  return 'Free';
}

const ImportChoiceModal: React.FC<ImportChoiceModalProps> = ({
  importedProfile,
  currentSlotName,
  canCreateNew,
  onReplace,
  onCreateNew,
  onUpgrade,
  onCancel,
}) => {
  const importedName = importedProfile?.personalInfo?.name || 'Imported Profile';
  const limit = getProfileSlotLimit();
  const plan = planLabel();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-neutral-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Different CV Detected
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            The imported profile looks like a <span className="font-semibold text-zinc-700 dark:text-zinc-300">different person</span> from{' '}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">&ldquo;{currentSlotName}&rdquo;</span>.
            What would you like to do with it?
          </p>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">

          {/* Option A — replace current room */}
          <button
            onClick={onReplace}
            className="w-full text-left p-4 rounded-xl border-2 border-[#1B2B4B] dark:border-[#C9A84C] bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 hover:bg-[#1B2B4B]/10 dark:hover:bg-[#C9A84C]/10 transition-colors group"
          >
            <p className="font-semibold text-[#1B2B4B] dark:text-[#C9A84C] group-hover:underline">
              Replace &ldquo;{currentSlotName}&rdquo;
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Overwrites the current room with the imported CV. Your existing
              built CV for this room will be reset. Use this when you are
              updating your own profile from scratch.
            </p>
          </button>

          {/* Option B — create new room (available) */}
          {canCreateNew && (
            <button
              onClick={onCreateNew}
              className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors group"
            >
              <p className="font-semibold text-zinc-800 dark:text-zinc-100 group-hover:text-violet-700 dark:group-hover:text-violet-300">
                Create new room &mdash; &ldquo;{importedName}&rdquo;
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Keeps your existing room untouched and adds this as a new
                separate room. Great for managing multiple people&rsquo;s CVs.
              </p>
            </button>
          )}

          {/* Option B — upgrade CTA (at limit) */}
          {!canCreateNew && (
            <div className="w-full p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-800/50">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">🔒</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                    Room limit reached ({limit}/{limit} on {plan} plan)
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
                    {plan === 'Free'
                      ? 'Upgrade to BYOK (3 rooms) or Pro (5 rooms) to keep multiple CVs at once.'
                      : plan === 'BYOK'
                      ? 'Upgrade to Pro to unlock 5 rooms and other premium features.'
                      : 'You have reached the maximum of 5 rooms.'}
                  </p>
                  <button
                    onClick={onUpgrade}
                    className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8973d] text-white text-xs font-semibold transition-colors"
                  >
                    {plan === 'premium' ? 'Manage plan' : 'See upgrade options'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cancel */}
        <div className="px-4 pb-4 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportChoiceModal;
