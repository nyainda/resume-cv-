import React from 'react';

interface DriveBackupPromptProps {
  show: boolean;
  driveConnected: boolean;
  driveMigrationDone: boolean;
  driveConnecting: boolean;
  driveMigrating: boolean;
  driveMigrationProgress: { uploaded: number; total: number } | null;
  onConnect: () => void;
  onDismiss: () => void;
}

const DriveBackupPrompt: React.FC<DriveBackupPromptProps> = ({
  show,
  driveConnected,
  driveMigrationDone,
  driveConnecting,
  driveMigrating,
  driveMigrationProgress,
  onConnect,
  onDismiss,
}) => {
  if (!show || driveConnected) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-[#C9A84C]/40 p-4 animate-in slide-in-from-bottom-2 duration-300">
        {driveMigrationDone ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">All backed up to Drive ✓</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Your CVs and profiles are now safe in Google Drive.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1B2B4B]/8 flex items-center justify-center flex-shrink-0 mt-0.5 pt-1">
              <svg width="20" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              {driveMigrating ? (
                <>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">Uploading your data…</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {driveMigrationProgress
                      ? `${driveMigrationProgress.uploaded} of ${driveMigrationProgress.total} items saved`
                      : 'Preparing…'}
                  </p>
                  {driveMigrationProgress && driveMigrationProgress.total > 0 && (
                    <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#1B2B4B] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((driveMigrationProgress.uploaded / driveMigrationProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                    {driveConnecting ? 'Waiting for Google…' : 'Back up to Google Drive'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    {driveConnecting
                      ? 'Approve Drive access in the popup to continue.'
                      : "You're already signed in — one tap to back up all your CVs and profiles."}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={onConnect}
                      disabled={driveConnecting}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1B2B4B] text-white hover:bg-[#1B2B4B]/90 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                    >
                      {driveConnecting && (
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      )}
                      {driveConnecting ? 'Connecting…' : 'Connect Drive'}
                    </button>
                    {!driveConnecting && (
                      <button
                        onClick={onDismiss}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                      >
                        Not now
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {!driveConnecting && !driveMigrating && (
              <button
                onClick={onDismiss}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors flex-shrink-0 mt-0.5"
                aria-label="Dismiss"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriveBackupPrompt;
