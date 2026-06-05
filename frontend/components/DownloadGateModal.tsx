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

const Y = '#EBFF38';
const NAV = '#1B2B4B';

const GoogleLogo = () => (
  <div className="p-2 bg-white rounded-lg shadow-sm border border-zinc-100">
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Top accent bar */}
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${NAV}, ${Y})` }} />

        <div className="p-6">
          {/* Icon + heading */}
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm" style={{ background: Y, color: '#111' }}>
              CV
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-white leading-tight">
                You've used your 2 free downloads
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Sign in to keep downloading — it's free, instant, one click.
              </p>
            </div>
          </div>

          {/* What you get */}
          <div className="rounded-xl border border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/60 p-4 mb-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">After signing in</p>
            <div className="space-y-2">
              {[
                { icon: '✓', text: 'Unlimited PDF downloads', color: '#059669' },
                { icon: '✓', text: 'Your CVs saved across devices', color: '#059669' },
                { icon: '✓', text: 'Secure Google Drive backup', color: '#059669' },
                { icon: '✓', text: 'Always free to use your own API keys', color: '#059669' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: item.color + '20', color: item.color }}>{item.icon}</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sign in button */}
          <button
            onClick={handleSignIn}
            disabled={signingIn || loading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border-2 border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 font-bold text-sm text-zinc-800 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-neutral-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed mb-3"
          >
            <GoogleLogo />
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 text-center mb-3">{error}</p>
          )}

          <button
            onClick={onClose}
            className="w-full text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
          >
            Not now — go back
          </button>

          <p className="text-[10px] text-zinc-300 dark:text-zinc-600 text-center mt-3 leading-relaxed">
            We never see or store your data. Everything stays in your own Google account.
          </p>
        </div>
      </div>
    </div>
  );
};
