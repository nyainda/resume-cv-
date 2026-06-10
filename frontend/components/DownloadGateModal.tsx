import React, { useState } from 'react';
import { useGoogleAuth } from '../auth/GoogleAuthContext';

const STORAGE_KEY = 'procv:download_count';
const FREE_DOWNLOADS = 2;

export function getDownloadCount(): number {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10); } catch { return 0; }
}

export function incrementDownloadCount(): void {
  try { localStorage.setItem(STORAGE_KEY, String(getDownloadCount() + 1)); } catch {}
}

export function shouldGateDownload(isAuthenticated: boolean): boolean {
  if (isAuthenticated) return false;
  return getDownloadCount() >= FREE_DOWNLOADS;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const NAV = '#1B2B4B';
const Y = '#EBFF38';

const GoogleLogo = () => (
  <div className="p-2 bg-white rounded-lg shadow-sm border border-zinc-100 flex-shrink-0">
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  </div>
);

export const DownloadGateModal: React.FC<Props> = ({ open, onClose, onContinue }) => {
  const { signIn, loading, error } = useGoogleAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (!open) return null;

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
      onContinue();
    } catch {
      // error shown via context
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">

        <div className="h-1" style={{ background: `linear-gradient(90deg, ${NAV} 0%, ${Y} 100%)` }} />

        <div className="p-6">

          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black"
              style={{ background: Y, color: '#111' }}
            >
              CV
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-white leading-tight">
                You've used your 2 free downloads
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                Sign in for unlimited downloads — free, one click, no card needed.
              </p>
            </div>
          </div>

          {/* Benefits */}
          <div className="rounded-xl border border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/60 p-4 mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2.5">
              With a free account
            </p>
            <div className="space-y-2">
              {[
                'Unlimited PDF downloads',
                'CVs synced across all your devices',
                'Secure Google Drive backup',
                'Bring your own API keys — always free',
              ].map(text => (
                <div key={text} className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">✓</span>
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sign in CTA */}
          <button
            onClick={handleSignIn}
            disabled={signingIn || loading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border-2 border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 font-bold text-sm text-zinc-800 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-neutral-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleLogo />
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <p className="text-xs text-rose-500 text-center mt-2">{error}</p>
          )}

          <button
            onClick={onClose}
            className="w-full text-center text-[11px] font-medium text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors pt-4"
          >
            Go back
          </button>

        </div>
      </div>
    </div>
  );
};
