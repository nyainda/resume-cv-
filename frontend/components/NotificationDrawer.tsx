/**
 * NotificationDrawer — slide-in panel from the right.
 * Shows rotating Pro Tips (Framer Motion AnimatePresence) + recent activity.
 * Uses the app's exact navy/gold/zinc theme; dark prop mirrors AppSidebar.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStoredShareLinks, type StoredShareLink } from '../services/shareService';
import type { SavedCV } from '../types';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

const PRO_TIPS = [
  { emoji: '🎯', title: 'Tailor every CV', body: 'Match bullet points to the job description — ATS scores improve by up to 40% with keyword alignment.' },
  { emoji: '📊', title: 'Aim for 90+', body: 'Run Score My CV before applying. Recruiters shortlist candidates above 85 first.' },
  { emoji: '🛡️', title: 'Run the HR Detector', body: 'It catches overused phrases before recruiters do. Run it on every draft you care about.' },
  { emoji: '📏', title: 'One page for junior roles', body: 'Use One-Page Mode to compress automatically — ideal for roles with strict page limits.' },
  { emoji: '💡', title: 'Quantify your impact', body: 'Add %, $ or time savings to bullets — "Reduced deploy time by 40%" beats "Improved deployments".' },
  { emoji: '🌐', title: 'Publish your profile', body: 'Your public profile is SEO-indexed. Keep it live so recruiters can discover you passively.' },
  { emoji: '🗂️', title: 'Use profile slots', body: 'Create separate slots for different career tracks — e.g. Software Engineer vs Data Scientist.' },
  { emoji: '🔗', title: 'Share links for portfolios', body: 'Use a share link on LinkedIn or your email signature — no PDF attachment needed.' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  savedCVs: SavedCV[];
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntilExpiry(unixSecs: number): string {
  const diff = unixSecs * 1000 - Date.now();
  if (diff <= 0) return 'Expired';
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'Expires < 1h';
  if (hrs < 24) return `Expires in ${hrs}h`;
  return `Expires in ${Math.floor(hrs / 24)}d`;
}

const NotificationDrawer: React.FC<Props> = ({ isOpen, onClose, darkMode: dark, savedCVs }) => {
  const [links, setLinks] = useState<StoredShareLink[]>([]);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    if (isOpen) setLinks(getStoredShareLinks().slice(0, 5));
  }, [isOpen]);

  // Rotate tips every 6s while open
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setTipIdx(i => (i + 1) % PRO_TIPS.length), 6000);
    return () => clearInterval(t);
  }, [isOpen]);

  const recentCVs = [...savedCVs]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 3);

  const tip = PRO_TIPS[tipIdx];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="notif-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="notif-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            className={`fixed top-0 right-0 h-full w-[340px] max-w-[calc(100vw-3rem)] z-50 flex flex-col shadow-2xl ${
              dark
                ? 'bg-neutral-900 border-l border-neutral-700'
                : 'bg-white border-l border-zinc-200'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b flex-shrink-0 ${dark ? 'border-neutral-800' : 'border-zinc-100'}`}>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${GOLD}20` }}
                >
                  🔔
                </div>
                <span className={`text-sm font-extrabold ${dark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                  Tips &amp; Activity
                </span>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg transition-colors ${
                  dark
                    ? 'text-white/40 hover:text-white hover:bg-white/10'
                    : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* ── Rotating Pro Tip ── */}
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Pro Tip
                </p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tipIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    className="rounded-xl p-4 border"
                    style={{ background: `${GOLD}0d`, borderColor: `${GOLD}35` }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0 leading-none mt-0.5">{tip.emoji}</span>
                      <div>
                        <p className="text-xs font-bold mb-1" style={{ color: GOLD }}>{tip.title}</p>
                        <p className={`text-[11px] leading-relaxed ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {tip.body}
                        </p>
                      </div>
                    </div>
                    {/* Progress dots — tap to jump */}
                    <div className="flex items-center gap-1 mt-3 justify-end">
                      {PRO_TIPS.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setTipIdx(i)}
                          className="w-1.5 h-1.5 rounded-full transition-all duration-200"
                          style={{
                            background: i === tipIdx ? GOLD : dark ? 'rgba(255,255,255,0.18)' : '#D1D5DB',
                            transform: i === tipIdx ? 'scale(1.4)' : 'scale(1)',
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── Recent CVs ── */}
              {recentCVs.length > 0 && (
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Recent CVs
                  </p>
                  <div className="space-y-2">
                    {recentCVs.map((cv, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                          dark ? 'border-neutral-700 bg-neutral-800' : 'border-zinc-100 bg-zinc-50'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${NAVY}15` }}
                        >
                          <svg className="w-4 h-4" style={{ color: NAVY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold truncate ${dark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                            {cv.label || cv.cvData?.experience?.[0]?.jobTitle || 'Untitled CV'}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            {cv.createdAt ? timeAgo(new Date(cv.createdAt).getTime()) : '—'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Share Links ── */}
              {links.length > 0 && (
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Share Links
                  </p>
                  <div className="space-y-2">
                    {links.map((link) => {
                      const active = Date.now() < link.expires_at * 1000;
                      return (
                        <div
                          key={link.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                            dark ? 'border-neutral-700 bg-neutral-800' : 'border-zinc-100 bg-zinc-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : (dark ? 'bg-zinc-600' : 'bg-zinc-300')}`} />
                          <div className="min-w-0 flex-1">
                            <p className={`text-[11px] font-mono truncate ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                              {link.id.slice(0, 18)}…
                            </p>
                            <p className={`text-[10px] mt-0.5 ${active ? 'text-emerald-600 dark:text-emerald-400' : (dark ? 'text-zinc-600' : 'text-zinc-400')}`}>
                              {timeUntilExpiry(link.expires_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {recentCVs.length === 0 && links.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <span className="text-3xl">✨</span>
                  <p className={`text-xs leading-relaxed max-w-[200px] ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Generate your first CV to see activity here.
                  </p>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className={`px-5 py-3 border-t flex-shrink-0 ${dark ? 'border-neutral-800' : 'border-zinc-100'}`}>
              <p className={`text-[10px] text-center ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Tips rotate every 6s — tap dots to jump
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationDrawer;
