import React, { useMemo, useState, useEffect } from 'react';
import type { UserProfileSlot } from '../types';
import type { WorkerUser } from '../services/authService';
import { loadSessionFallback } from '../services/authService';
import { buildProfileUrl, fetchMyPublicProfile } from '../services/publicProfileService';

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

interface PublishedProfilesHubProps {
  profiles: UserProfileSlot[];
  user?: WorkerUser | null;
  onNavigate: (view: string) => void;
  /** Currently active slot — highlighted in the list */
  activeSlot?: UserProfileSlot | null;
  /**
   * compact — used when embedded inside Share & Publish (already on the right page).
   * Hides the "Share & Publish →" header link and the footer note; highlights the
   * active slot so the user knows which room they're currently publishing from.
   */
  compact?: boolean;
}

export default function PublishedProfilesHub({
  profiles,
  user,
  onNavigate,
  activeSlot,
  compact = false,
}: PublishedProfilesHubProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Bumped after a D1 restore so useMemo re-reads localStorage
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Restore from D1 on mount ─────────────────────────────────────────────
  // localStorage is cleared on logout / unavailable on other devices.
  // On mount we ask the authenticated /me endpoint for the live slug and
  // write it back into the correct per-slot key so the hub reflects reality.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const result = await fetchMyPublicProfile(loadSessionFallback());
      if (cancelled || !result) return;
      const { slug, slot_id } = result;
      const targetSlotId = slot_id ?? activeSlot?.id ?? 'default';
      const key = `publicProfile:slug:${user.id}:${targetSlotId}`;
      try {
        const existing = localStorage.getItem(key);
        if (existing !== slug) {
          localStorage.setItem(key, slug);
          setRefreshKey(k => k + 1); // trigger useMemo re-read
        }
      } catch { /**/ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Read per-slot published slugs from localStorage
  const slotStatuses = useMemo(() => {
    void refreshKey; // reactive dependency
    return profiles.map(p => {
      let slug: string | null = null;
      if (user?.id) {
        try { slug = localStorage.getItem(`publicProfile:slug:${user.id}:${p.id}`) ?? null; } catch { /**/ }
      }
      const url = slug ? buildProfileUrl(slug) : null;
      return { slot: p, slug, url };
    });
  }, [profiles, user?.id, refreshKey]);

  const publishedCount = slotStatuses.filter(s => s.slug).length;

  const copyUrl = async (url: string, id: string) => {
    try { await navigator.clipboard.writeText(url); } catch { /**/ }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Published Profiles</h2>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {publishedCount > 0
                ? `${publishedCount} of ${profiles.length} room${profiles.length !== 1 ? 's' : ''} published`
                : 'No profiles published yet'}
            </p>
          </div>
        </div>
        {!compact && (
          <button
            onClick={() => onNavigate('share-profile')}
            className="text-[11px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline flex-shrink-0"
          >
            Share &amp; Publish →
          </button>
        )}
      </div>

      {/* Slot rows */}
      <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
        {slotStatuses.map(({ slot, slug, url }) => {
          const isActive = slot.id === activeSlot?.id;
          const initials = (slot.name || 'P').charAt(0).toUpperCase();
          const isCopied = copiedId === slot.id;

          return (
            <div
              key={slot.id}
              className={`flex items-center gap-3 px-5 py-3.5 group transition-colors ${
                isActive
                  ? 'bg-[#1B2B4B]/3 dark:bg-[#C9A84C]/4'
                  : 'hover:bg-zinc-50/60 dark:hover:bg-neutral-800/40'
              }`}
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0 shadow-sm"
                style={{ background: isActive ? GOLD : NAVY, color: isActive ? NAVY : 'white' }}
              >
                {initials}
              </div>

              {/* Slot name + URL */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-tight">{slot.name || 'Profile'}</p>
                  {isActive && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: `${GOLD}22`, color: GOLD }}>
                      Active room
                    </span>
                  )}
                </div>
                {url ? (
                  <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{url}</p>
                ) : (
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Not published</p>
                )}
              </div>

              {/* Status badge */}
              {slug ? (
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />Live
                </span>
              ) : (
                <span className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-neutral-700">Draft</span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {slug && url ? (
                  <>
                    {/* Preview */}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Preview public profile"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </a>
                    {/* Copy URL */}
                    <button
                      onClick={() => copyUrl(url, slot.id)}
                      title={isCopied ? 'Copied!' : 'Copy URL'}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-all"
                    >
                      {isCopied ? (
                        <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      )}
                    </button>
                    {/* Edit / manage — only shown in dashboard mode or for the active slot */}
                    {(!compact || isActive) && (
                      <button
                        onClick={() => onNavigate('share-profile')}
                        title={isActive ? 'Manage this published profile' : 'Switch to this room and manage'}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                  </>
                ) : (
                  /* Show Publish button only for active room in compact mode, or for all rooms in dashboard mode */
                  (!compact || isActive) && (
                    <button
                      onClick={() => onNavigate('share-profile')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/20 dark:border-[#C9A84C]/25 hover:bg-[#1B2B4B]/5 dark:hover:bg-[#C9A84C]/8 transition-colors"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                      Publish
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note — only in dashboard mode */}
      {!compact && (
        <div className="px-5 py-3 bg-zinc-50/60 dark:bg-neutral-800/30 border-t border-zinc-100 dark:border-neutral-800">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            Each room can publish its own profile page. Published profiles are permanently live until you unpublish them.
          </p>
        </div>
      )}

      {/* Compact footer — only in share-profile mode with multiple rooms */}
      {compact && profiles.length > 1 && (
        <div className="px-5 py-3 bg-zinc-50/60 dark:bg-neutral-800/30 border-t border-zinc-100 dark:border-neutral-800">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            To publish a different room, switch rooms from the sidebar first.
          </p>
        </div>
      )}
    </div>
  );
}
