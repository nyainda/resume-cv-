// components/JsonImportDialog.tsx
// Modal that appears when a JSON import would overwrite an existing profile.
// Lets the user choose: replace the current profile, or create a new one.

import React from 'react';
import type { PendingJsonImport } from '../hooks/useJsonImport';

interface JsonImportDialogProps {
  pendingImport: PendingJsonImport;
  activeSlotName: string | undefined;
  onConfirmUpdate: () => void;
  onConfirmCreate: () => void;
  onCancel: () => void;
}

const JsonImportDialog: React.FC<JsonImportDialogProps> = ({
  pendingImport,
  activeSlotName,
  onConfirmUpdate,
  onConfirmCreate,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-neutral-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Import JSON Profile
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            You already have a profile called{' '}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              &ldquo;{activeSlotName}&rdquo;
            </span>
            . What would you like to do?
          </p>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">
          {/* Option A — update current */}
          <button
            onClick={onConfirmUpdate}
            className="w-full text-left p-4 rounded-xl border-2 border-[#1B2B4B] dark:border-[#C9A84C] bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 hover:bg-[#1B2B4B]/10 dark:hover:bg-[#C9A84C]/10 transition-colors group"
          >
            <p className="font-semibold text-[#1B2B4B] dark:text-[#C9A84C] group-hover:underline">
              Update &ldquo;{activeSlotName}&rdquo;
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Updates your profile data. If this looks like the same person,
              AI-polished CV bullets for matching roles are preserved — only
              fields you actually changed get updated. If it&rsquo;s a
              different CV entirely, the built CV is replaced.
            </p>
          </button>

          {/* Option B — create new */}
          <button
            onClick={onConfirmCreate}
            className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors group"
          >
            <p className="font-semibold text-zinc-800 dark:text-zinc-100 group-hover:text-violet-700 dark:group-hover:text-violet-300">
              Create new profile &mdash; &ldquo;
              {pendingImport.profile?.personalInfo?.name || 'Imported Profile'}
              &rdquo;
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Keeps your existing profile and adds this as a separate profile
              you can switch between.
            </p>
          </button>
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

export default JsonImportDialog;
