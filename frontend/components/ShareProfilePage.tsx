/**
 * ShareProfilePage — Redesigned Share & Publish hub.
 *
 * Tab-based layout:
 *   Tab 1 – Temporary Share Link (expiring, disposable)
 *   Tab 2 – Publish Profile Page (permanent, custom slug, live preview)
 *
 * Fully responsive · dark/light mode · Navy + Gold theme
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CVData, UserProfile, SavedCoverLetter, TemplateName, UserProfileSlot } from '../types';
import type { WorkerUser } from '../services/authService';
import { loadSessionFallback } from '../services/authService';
import LZString from 'lz-string';
import {
  createShareLink, buildShortShareUrl, checkShareRateLimit,
  addStoredShareLink, getStoredShareLinks, fetchAllShareStats,
  type StoredShareLink, type ShareStats,
} from '../services/shareService';
import {
  publishPublicProfile, unpublishPublicProfile, buildProfileUrl,
  setCustomProfileSlug, validateSlug, checkSlugAvailability,
} from '../services/publicProfileService';
import { encodeSharePayload, type SharedCVPayload } from './ShareCVModal';
import { logEvent } from '../services/eventsService';
import { needsWatermark } from '../services/accountTierService';

// ── Brand constants ────────────────────────────────────────────────────────
const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

// ── Props ──────────────────────────────────────────────────────────────────
interface ShareProfilePageProps {
  cvData: CVData | null;
  userProfile: UserProfile | null;
  user: WorkerUser | null | undefined;
  isAuthenticated: boolean;
  savedCoverLetters: SavedCoverLetter[];
  onShareLinkAdded?: (link: { id: string; created_at: number; expires_at: number }) => void;
  onGoToGenerator: () => void;
  /** Active profile slot — used to scope published slug storage per room. */
  activeSlot?: UserProfileSlot | null;
}

// ── Small reusable pieces ──────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[#1B2B4B] dark:bg-[#C9A84C]' : 'bg-zinc-200 dark:bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
    </button>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
      active
        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40'
        : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-neutral-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
      {label}
    </span>
  );
}

// ── Relative time ──────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function daysUntil(unixSec: number): string {
  const days = Math.ceil((unixSec * 1000 - Date.now()) / 86400000);
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Tomorrow';
  return `${days}d`;
}

// ── Live profile preview ───────────────────────────────────────────────────
function ProfileLivePreview({
  personalInfo,
  cvData,
  hasWatermark,
}: {
  personalInfo: UserProfile['personalInfo'] | undefined;
  cvData: CVData;
  hasWatermark: boolean;
}) {
  const initials = (personalInfo?.name ?? 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const topRole = cvData?.experience?.[0]?.jobTitle ?? 'Professional';
  const topCompany = cvData?.experience?.[0]?.company ?? '';
  const skills = cvData?.skills?.slice(0, 5) ?? [];
  const summary = cvData?.summary ?? '';

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-neutral-600 overflow-hidden shadow-lg bg-white dark:bg-neutral-900 text-[11px]">
      {/* Header bar */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-neutral-700" style={{ background: `${NAVY}` }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: GOLD }}>
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <span className="text-white font-bold text-[11px] tracking-wide">ProCV</span>
        </div>
        {hasWatermark && (
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-white/70" style={{ background: `${GOLD}40` }}>Watermark</span>
        )}
      </div>

      {/* Profile hero */}
      <div className="p-4 flex items-start gap-3 border-b border-zinc-100 dark:border-neutral-700">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0 shadow-md"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d4272 100%)` }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-zinc-900 dark:text-zinc-50 text-sm leading-tight">{personalInfo?.name ?? 'Your Name'}</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-0.5">{topRole}{topCompany ? ` · ${topCompany}` : ''}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            {personalInfo?.location && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {personalInfo.location}
              </span>
            )}
            {personalInfo?.email && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {personalInfo.email}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary snippet */}
      {summary && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700">
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3">{summary}</p>
        </div>
      )}

      {/* Skills preview */}
      {skills.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700">
          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Key Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map(s => (
              <span key={s} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between bg-zinc-50 dark:bg-neutral-800/50">
        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Powered by ProCV</span>
        <span className="text-[9px]" style={{ color: GOLD }}>procv.app</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
const ShareProfilePage: React.FC<ShareProfilePageProps> = ({
  cvData,
  userProfile,
  user,
  isAuthenticated,
  savedCoverLetters,
  onShareLinkAdded,
  onGoToGenerator,
  activeSlot,
}) => {
  const personalInfo = userProfile?.personalInfo;
  const template: TemplateName = (cvData?.template as TemplateName) ?? 'professional';
  const slotId = activeSlot?.id ?? 'default';

  const latestCoverLetter = savedCoverLetters[0]?.content ?? null;
  const hasCoverLetter = !!(latestCoverLetter && latestCoverLetter.trim().length > 0);

  // ── Active tab ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'share' | 'publish'>('publish');

  // ── Share link state — scoped to this slot ────────────────────────────
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isShortLink, setIsShortLink] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState(0);
  const [isReusingLink, setIsReusingLink] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [hidePersonalDetails, setHidePersonalDetails] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const [storedLinks, setStoredLinks] = useState<StoredShareLink[]>([]);
  const [linkStats, setLinkStats] = useState<Map<string, ShareStats>>(new Map());
  const [loadingStats, setLoadingStats] = useState(false);

  // Slot-scoped share links: prefer links stored on the slot object, fall back to global localStorage
  useEffect(() => {
    const slotLinks: StoredShareLink[] = (activeSlot?.sharedLinks ?? []) as StoredShareLink[];
    const globalLinks = getStoredShareLinks();
    const slotIds = new Set(slotLinks.map(l => l.id));
    // Only include global links that aren't already in the slot (avoids cross-contamination)
    const links = slotLinks.length > 0
      ? slotLinks
      : globalLinks.filter(l => !slotIds.has(l.id));
    setStoredLinks(links);
    if (links.length > 0) {
      const latest = links[0];
      const nowSec = Math.floor(Date.now() / 1000);
      if (latest.expires_at > nowSec) {
        setShareUrl(buildShortShareUrl(latest.id));
        setLinkExpiresAt(latest.expires_at);
        setIsShortLink(true);
        setLinkGenerated(true);
        setIsReusingLink(true);
      }
    }
    if (links.length > 0) {
      setLoadingStats(true);
      fetchAllShareStats(links.map(l => l.id)).then(stats => {
        setLinkStats(stats);
        setLoadingStats(false);
      }).catch(() => setLoadingStats(false));
    }
  }, []);

  // ── Public profile state — scoped per slot ────────────────────────────
  // Key format: publicProfile:slug:<userId>:<slotId>
  // Migrates the legacy per-user key on first load so existing publishes are preserved.
  const profileSlugKey = user?.id ? `publicProfile:slug:${user.id}:${slotId}` : null;
  const legacySlugKey  = user?.id ? `publicProfile:slug:${user.id}` : null;

  const [profileSlug, setProfileSlug] = useState<string | null>(() => {
    if (!profileSlugKey) return null;
    try {
      const perSlot = localStorage.getItem(profileSlugKey);
      if (perSlot) return perSlot;
      // Migrate legacy key once (only for 'default' slot to avoid assigning it to every new slot)
      if (slotId === 'default' && legacySlugKey) {
        const legacy = localStorage.getItem(legacySlugKey);
        if (legacy) {
          localStorage.setItem(profileSlugKey, legacy);
          return legacy;
        }
      }
      return null;
    } catch { return null; }
  });
  const [profilePublished, setProfilePublished] = useState(!!profileSlug);
  const [profilePublishing, setProfilePublishing] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileCopied, setProfileCopied] = useState(false);
  const [slugInput, setSlugInput] = useState(profileSlug ?? '');
  const [slugEditing, setSlugEditing] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugFeedback, setSlugFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [slugAvailability, setSlugAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'>('idle');

  const profileUrl = profileSlug
    ? buildProfileUrl(profileSlug)
    : (user?.id ? buildProfileUrl(String(user.id)) : '');

  useEffect(() => {
    if (!slugEditing || slugInput.length < 3) { setSlugAvailability('idle'); return; }
    const clientErr = validateSlug(slugInput);
    if (clientErr) { setSlugAvailability('invalid'); return; }
    if (slugInput === profileSlug) { setSlugAvailability('idle'); return; }
    setSlugAvailability('checking');
    const timer = setTimeout(async () => {
      const result = await checkSlugAvailability(slugInput);
      setSlugAvailability(result);
    }, 400);
    return () => clearTimeout(timer);
  }, [slugInput, slugEditing, profileSlug]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const generateLink = useCallback(async () => {
    if (!cvData || !personalInfo) return;
    setRateLimitError('');
    const rateCheck = checkShareRateLimit();
    if (!rateCheck.allowed) {
      const min = Math.ceil(rateCheck.retryAfterMs / 60_000);
      setRateLimitError(`Rate limit reached — try again in ${min} minute${min !== 1 ? 's' : ''}.`);
      return;
    }
    setGenerating(true);
    const sharedPersonalInfo = hidePersonalDetails
      ? { ...personalInfo, email: '', phone: '', address: '' }
      : personalInfo;
    const payload: SharedCVPayload = {
      cvData, personalInfo: sharedPersonalInfo, template,
      sharedAt: new Date().toISOString(),
      ...(includeCoverLetter && hasCoverLetter ? { coverLetterText: latestCoverLetter! } : {}),
      procvBranding: needsWatermark(),
    };
    const compressed = encodeSharePayload(payload);
    const shareResult = await createShareLink(compressed);
    if (shareResult) {
      const { id, expires_at } = shareResult;
      const url = buildShortShareUrl(id);
      setShareUrl(url); setIsShortLink(true); setLinkExpiresAt(expires_at);
      addStoredShareLink(id, expires_at);
      const newLink = { id, created_at: Math.floor(Date.now() / 1000), expires_at };
      onShareLinkAdded?.(newLink);
      setStoredLinks(prev => [{ id, created_at: Date.now(), expires_at }, ...prev.filter(l => l.id !== id)]);
    } else {
      const fallbackUrl = `${window.location.origin}${window.location.pathname}#share=${compressed}`;
      setShareUrl(fallbackUrl); setIsShortLink(false);
    }
    logEvent({ event_type: 'share_created', template, mode: shareResult ? 'short' : 'hash' });
    setLinkGenerated(true); setIsReusingLink(false); setGenerating(false);
  }, [cvData, personalInfo, template, includeCoverLetter, hasCoverLetter, latestCoverLetter, hidePersonalDetails]);

  const copyToClipboard = useCallback(async () => {
    try { await navigator.clipboard.writeText(shareUrl); }
    catch { if (urlInputRef.current) { urlInputRef.current.select(); document.execCommand('copy'); } }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [shareUrl]);

  const regenerate = () => {
    setLinkGenerated(false); setShareUrl(''); setCopied(false); setIsReusingLink(false);
  };

  const handlePublish = useCallback(async () => {
    if (!user?.id || !cvData || !personalInfo) return;
    setProfilePublishing(true); setProfileError('');
    const payload: SharedCVPayload = {
      cvData, personalInfo, template,
      sharedAt: new Date().toISOString(),
      procvBranding: needsWatermark(),
    };
    const slug = await publishPublicProfile(payload, loadSessionFallback());
    setProfilePublishing(false);
    if (slug) {
      setProfileSlug(slug); setSlugInput(slug); setProfilePublished(true);
      if (profileSlugKey) { try { localStorage.setItem(profileSlugKey, slug); } catch { /**/ } }
      logEvent({ event_type: 'profile_published' });
    } else {
      setProfileError('Could not publish — please try again.');
    }
  }, [user?.id, cvData, personalInfo, template, profileSlugKey]);

  const handleUnpublish = useCallback(async () => {
    setUnpublishing(true);
    const ok = await unpublishPublicProfile(loadSessionFallback());
    setUnpublishing(false);
    if (ok) {
      setProfilePublished(false); setProfileSlug(null);
      if (profileSlugKey) { try { localStorage.removeItem(profileSlugKey); } catch { /**/ } }
    }
  }, [profileSlugKey]);

  const copyProfileUrl = useCallback(async () => {
    try { await navigator.clipboard.writeText(profileUrl); } catch { /**/ }
    setProfileCopied(true);
    setTimeout(() => setProfileCopied(false), 2500);
  }, [profileUrl]);

  const handleSaveSlug = useCallback(async () => {
    if (!user?.id) return;
    const trimmed = slugInput.trim().toLowerCase();
    const err = validateSlug(trimmed);
    if (err) { setSlugFeedback({ type: 'error', msg: err }); return; }
    setSlugSaving(true); setSlugFeedback(null);
    const result = await setCustomProfileSlug(trimmed, loadSessionFallback());
    setSlugSaving(false);
    if ('error' in result) {
      const msgs: Record<string, string> = {
        slug_taken: 'That name is already taken — try another',
        not_published: 'Publish your profile first',
        invalid: 'Invalid format',
        network: 'Could not save — please try again',
      };
      setSlugFeedback({ type: 'error', msg: msgs[result.error] ?? 'Error saving' });
      return;
    }
    setProfileSlug(result.slug); setSlugInput(result.slug);
    if (profileSlugKey) { try { localStorage.setItem(profileSlugKey, result.slug); } catch { /**/ } }
    setSlugEditing(false);
    setSlugFeedback({ type: 'success', msg: 'URL updated!' });
    setTimeout(() => setSlugFeedback(null), 3000);
  }, [user?.id, slugInput, profileSlugKey]);

  const shareVia = (channel: string) => {
    const name = personalInfo?.name ?? 'my';
    const text = encodeURIComponent(`Check out ${name}'s CV: ${shareUrl}`);
    const url = encodeURIComponent(shareUrl);
    const map: Record<string, string> = {
      linkedin:  `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      whatsapp:  `https://wa.me/?text=${text}`,
      email:     `mailto:?subject=${encodeURIComponent(`CV — ${name}`)}&body=${encodeURIComponent(`Hi,\n\nPlease find my CV at:\n${shareUrl}\n\nBest regards,\n${name}`)}`,
      twitter:   `https://x.com/intent/tweet?text=${text}`,
    };
    if (map[channel]) window.open(map[channel], '_blank');
  };

  // ── "No CV" empty state ───────────────────────────────────────────────
  if (!cvData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: `${NAVY}10` }}>
          <svg className="w-10 h-10" style={{ color: NAVY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">Nothing to share yet</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm">Generate a CV first, then come back here to create a share link or publish your profile page.</p>
        </div>
        <button
          onClick={onGoToGenerator}
          className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: NAVY }}
        >
          Go to CV Generator →
        </button>
      </div>
    );
  }

  const qrUrl = isShortLink && shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(shareUrl)}`
    : null;

  const nowSec = Math.floor(Date.now() / 1000);
  const validStoredLinks = storedLinks.filter(l => l.expires_at > nowSec);
  const expiredStoredLinks = storedLinks.filter(l => l.expires_at <= nowSec).slice(0, 3);
  const recentLinks = [...validStoredLinks, ...expiredStoredLinks].slice(0, 5);
  const hasWatermark = needsWatermark();

  // Snapshot chips
  const snapshotChips = [
    { label: 'CV Content', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40' },
    { label: 'Personal Info', color: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/40' },
    { label: 'Selected Template', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40' },
    ...(hasWatermark ? [{ label: 'Watermark baked in', color: 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-neutral-600' }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto pb-16">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Share &amp; Publish
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Share your CV privately or publish a public profile page.</p>
        </div>
        <a
          href="https://procv.app/help/share" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors self-start sm:self-auto shadow-sm"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          How it works
        </a>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* Share Temporary Link tab */}
        <button
          onClick={() => setActiveTab('share')}
          className={`group relative flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all ${
            activeTab === 'share'
              ? 'border-[#1B2B4B] dark:border-[#C9A84C] bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/8 shadow-md'
              : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600 hover:shadow-sm'
          }`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            activeTab === 'share' ? 'bg-[#1B2B4B] dark:bg-[#C9A84C]' : 'bg-zinc-100 dark:bg-neutral-700'
          }`}>
            <svg className={`w-5 h-5 ${activeTab === 'share' ? 'text-white dark:text-[#1B2B4B]' : 'text-zinc-500 dark:text-zinc-400'}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`font-extrabold text-sm tracking-tight ${activeTab === 'share' ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-200'}`}>
              Share Temporary Link
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">For one-time sharing</p>
          </div>
          {activeTab === 'share' && (
            <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: NAVY }} />
          )}
        </button>

        {/* Publish Profile Page tab */}
        <button
          onClick={() => setActiveTab('publish')}
          className={`group relative flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all ${
            activeTab === 'publish'
              ? 'border-[#C9A84C] bg-[#C9A84C]/8 dark:bg-[#C9A84C]/10 shadow-md'
              : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600 hover:shadow-sm'
          }`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            activeTab === 'publish' ? 'bg-[#C9A84C]' : 'bg-zinc-100 dark:bg-neutral-700'
          }`}>
            <svg className={`w-5 h-5 ${activeTab === 'publish' ? 'text-[#1B2B4B]' : 'text-zinc-500 dark:text-zinc-400'}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`font-extrabold text-sm tracking-tight ${activeTab === 'publish' ? 'text-[#8B6B2E] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-200'}`}>
              Publish Profile Page
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">For your personal brand</p>
          </div>
          {activeTab === 'publish' && (
            <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: GOLD }} />
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Share Temporary Link
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'share' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Left: controls */}
          <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden flex flex-col shadow-sm">
            <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-700">
              <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Temporary Share Link</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Create a short, expiring link to share your CV instantly.</p>
            </div>

            <div className="px-5 py-4 flex-1 flex flex-col gap-4">

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Expires', value: '30 days', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                  { label: 'Rate limit', value: '10/hr', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> },
                  { label: 'Track views', value: 'Live count', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                  { label: 'Access', value: 'Anyone', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                ].map(item => (
                  <div key={item.label} className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600">
                    <span className="text-zinc-400 dark:text-zinc-500">{item.icon}</span>
                    <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{item.label}</span>
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Privacy toggles */}
              <div className="space-y-2">
                {hasCoverLetter && (
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GOLD }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">Include cover letter</span>
                    </div>
                    <Toggle checked={includeCoverLetter} onChange={(v) => { setIncludeCoverLetter(v); setLinkGenerated(false); setShareUrl(''); }} />
                  </div>
                )}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">Hide personal details</span>
                      <span className="text-[10px] text-zinc-400 block">Removes email, phone &amp; address</span>
                    </div>
                  </div>
                  <Toggle checked={hidePersonalDetails} onChange={(v) => { setHidePersonalDetails(v); setLinkGenerated(false); setShareUrl(''); }} />
                </div>
              </div>

              {/* Link section */}
              <div className="rounded-xl border border-zinc-200 dark:border-neutral-600 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-700/40 border-b border-zinc-200 dark:border-neutral-600">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Your Temporary Share Link</span>
                    {linkGenerated && <StatusBadge active label="Active" />}
                  </div>
                  {linkGenerated && isReusingLink && (
                    <button onClick={regenerate} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors font-medium">New link</button>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {rateLimitError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p className="text-xs text-red-700 dark:text-red-400 font-medium">{rateLimitError}</p>
                    </div>
                  )}

                  {!linkGenerated ? (
                    <button
                      onClick={generateLink}
                      disabled={generating}
                      className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ background: NAVY }}
                    >
                      {generating ? (
                        <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Creating secure link…</>
                      ) : (
                        <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Generate Share Link</>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {isReusingLink
                          ? `Reusing existing link · Expires ${linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'soon'}`
                          : isShortLink
                            ? `Short link · Expires ${linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'in 30 days'}`
                            : 'Long link — data encoded in URL'
                        }
                      </p>

                      <div className="flex gap-2">
                        <input
                          ref={urlInputRef}
                          type="text"
                          value={shareUrl}
                          readOnly
                          className="flex-1 min-w-0 text-xs bg-zinc-100 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-300 font-mono truncate focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                          onClick={() => urlInputRef.current?.select()}
                        />
                        <button
                          onClick={copyToClipboard}
                          className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                          style={{ background: copied ? '#22c55e' : NAVY }}
                        >
                          {copied
                            ? <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                            : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                          }
                        </button>
                      </div>

                      {qrUrl && (
                        <div className="flex items-center gap-4">
                          <img src={qrUrl} alt="QR code" className="w-[72px] h-[72px] rounded-xl border border-zinc-200 dark:border-neutral-600 shadow-sm flex-shrink-0" loading="lazy" />
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                            Scan to open on any device.<br />
                            <a href={qrUrl.replace('size=180x180', 'size=400x400')} target="_blank" rel="noopener noreferrer" download="procv-qr.png" className="font-semibold hover:underline" style={{ color: GOLD }}>
                              Download QR ↓
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Share via */}
                      <div>
                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Share via</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
                            { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
                            { id: 'email', label: 'Email', color: '#6366F1', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                            { id: 'twitter', label: 'X', color: '#000000', icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                          ].map(ch => (
                            <button
                              key={ch.id}
                              onClick={() => shareVia(ch.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-85 flex-1 justify-center min-w-[70px]"
                              style={{ background: ch.color }}
                            >
                              {ch.icon}
                              <span className="hidden sm:inline">{ch.label}</span>
                            </button>
                          ))}
                          <a
                            href={shareUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            <span className="hidden sm:inline">Preview</span>
                          </a>
                        </div>
                      </div>

                      {!isReusingLink && (
                        <button onClick={regenerate} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                          Generate a new link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Disposable note */}
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Temporary links are disposable and auto-expire.</p>
                  <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">Perfect for sending to individual recruiters or one-time applications.</p>
                </div>
              </div>

              {/* Recent links */}
              {recentLinks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Recent Links</p>
                    {loadingStats && <svg className="animate-spin w-3 h-3 text-zinc-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                  </div>
                  <div className="space-y-1.5">
                    {recentLinks.map(link => {
                      const isActive = link.expires_at > nowSec;
                      const stats = linkStats.get(link.id);
                      const url = buildShortShareUrl(link.id);
                      return (
                        <div key={link.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-700/50 border border-zinc-200 dark:border-neutral-600 group">
                          <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          <span className="text-xs font-mono text-zinc-600 dark:text-zinc-300 flex-1 min-w-0 truncate">{url}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:block">{timeAgo(link.created_at)}</span>
                            {stats && (
                              <span className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                {stats.view_count}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400 dark:text-zinc-500'}`}>
                              {isActive ? `${daysUntil(link.expires_at)} left` : 'Expired'}
                            </span>
                            <button
                              onClick={async () => { try { await navigator.clipboard.writeText(url); } catch { /**/ } }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-600 transition-all"
                            >
                              <svg className="w-3 h-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: why share */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-5 shadow-sm">
              <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider mb-4">What people will see</h3>
              <div className="space-y-3">
                {[
                  { icon: '👤', label: 'Your full CV', sub: 'Formatted and clean' },
                  { icon: '📩', label: 'Cover letter', sub: hasCoverLetter ? 'If included' : 'Not available' },
                  { icon: '📊', label: 'ATS score', sub: 'Hidden from viewers' },
                  { icon: '🔒', label: 'Personal info', sub: hidePersonalDetails ? 'Hidden' : 'Visible' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="text-base w-7 flex-shrink-0">{f.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{f.label}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-5 shadow-sm">
              <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider mb-4">Tips</h3>
              <div className="space-y-2.5">
                {[
                  'Send a unique link per recruiter to track who opened it',
                  'Links expire in 30 days — regenerate before sending again',
                  'Hide personal details for anonymous sharing',
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold text-white" style={{ background: NAVY }}>{i + 1}</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Publish Profile Page
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'publish' && (
        <div className="space-y-5">

          {/* Main two-col layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* ── LEFT: Publish controls ───────────────────────────────── */}
            <div className="lg:col-span-3 flex flex-col gap-4">

              {/* Publish your public profile card */}
              <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-700">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Publish Your Public Profile</h2>
                    {profilePublished && <StatusBadge active label="Published" />}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Create your permanent profile page with your CV and get a custom URL.</p>
                  {/* Snapshot chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 flex items-center mr-1">Snapshot includes:</span>
                    {snapshotChips.map(chip => (
                      <span key={chip.label} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${chip.color}`}>{chip.label}</span>
                    ))}
                  </div>
                </div>

                {/* Publish status block */}
                <div className="px-5 py-4 space-y-4">

                  {!isAuthenticated ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600">
                      <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">Sign in to create your permanent public profile.</p>
                    </div>
                  ) : profilePublished ? (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${GOLD}40` }}>
                      <div className="px-4 py-3 flex items-center gap-3" style={{ background: `${GOLD}10` }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD}25` }}>
                          <svg className="w-4 h-4" style={{ color: GOLD }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><polyline points="10 8 14 12 10 16"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-zinc-800 dark:text-zinc-100">Your profile is live</p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">Visible to everyone. Republish to sync latest CV changes.</p>
                        </div>
                      </div>
                      {profileError && <p className="text-xs text-red-500 font-medium px-4 pt-2">{profileError}</p>}
                      <div className="p-4 flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={handlePublish}
                          disabled={profilePublishing}
                          className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ background: NAVY, color: 'white' }}
                        >
                          {profilePublishing ? (
                            <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Updating…</>
                          ) : (
                            <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>Publish (Update)</>
                          )}
                        </button>
                        <button
                          onClick={handleUnpublish}
                          disabled={unpublishing}
                          className="sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {unpublishing ? 'Unpublishing…' : (
                            <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Unpublish</>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {profileError && <p className="text-xs text-red-500 font-medium">{profileError}</p>}
                      {/* Profile preview row */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0 shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d4272 100%)` }}>
                          {(personalInfo?.name ?? 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 truncate">{personalInfo?.name ?? 'Your Name'}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{cvData?.experience?.[0]?.jobTitle ?? undefined ?? 'Your Title'}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-neutral-600 whitespace-nowrap flex-shrink-0">Not published</span>
                      </div>
                      <button
                        onClick={handlePublish}
                        disabled={profilePublishing}
                        className="w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                        style={{ background: GOLD, color: NAVY }}
                      >
                        {profilePublishing ? (
                          <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Publishing…</>
                        ) : (
                          <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Publish Profile Page</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Profile URL row */}
                  {isAuthenticated && profilePublished && (
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Your public profile URL</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={profileUrl}
                          readOnly
                          className="flex-1 min-w-0 text-xs bg-zinc-100 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-300 font-mono truncate focus:outline-none"
                          onClick={e => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          onClick={copyProfileUrl}
                          title={profileCopied ? 'Copied!' : 'Copy link'}
                          className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors border ${
                            profileCopied
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-zinc-50 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-neutral-600 hover:bg-zinc-100 dark:hover:bg-neutral-600'
                          }`}
                        >
                          {profileCopied
                            ? <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                            : <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                          }
                        </button>
                        <a
                          href={profileUrl} target="_blank" rel="noopener noreferrer"
                          title="View public profile"
                          className="flex-shrink-0 p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-600 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom slug editor */}
              {isAuthenticated && profilePublished && (
                <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                  <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Custom Slug</h3>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Create a custom, easy-to-remember URL for your profile.</p>
                      </div>
                      {!slugEditing && (
                        <button
                          onClick={() => { setSlugInput(profileSlug ?? ''); setSlugEditing(true); setSlugFeedback(null); }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: GOLD }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-4">
                    {!slugEditing ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 flex-1 bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600 rounded-xl px-3 py-2.5">
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono select-none">#p=</span>
                          <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 flex-1">{profileSlug ?? '(default)'}</span>
                        </div>
                        {slugFeedback?.type === 'success' && (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">✓ {slugFeedback.msg}</span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className={`flex items-center gap-1.5 bg-white dark:bg-neutral-800 border-2 rounded-xl px-3 py-2 transition-colors ${
                          slugAvailability === 'available' ? 'border-emerald-500' :
                          slugAvailability === 'taken'     ? 'border-red-400' :
                          slugAvailability === 'invalid'   ? 'border-amber-400' :
                                                             'border-[#C9A84C]/50 focus-within:border-[#C9A84C]'
                        }`}>
                          <span className="text-[11px] text-zinc-400 font-mono whitespace-nowrap select-none">#p=</span>
                          <input
                            type="text"
                            value={slugInput}
                            onChange={e => {
                              setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                              setSlugFeedback(null);
                              setSlugAvailability('idle');
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveSlug(); if (e.key === 'Escape') { setSlugEditing(false); setSlugAvailability('idle'); } }}
                            placeholder="your-name"
                            maxLength={30}
                            className="flex-1 text-xs font-mono bg-transparent outline-none text-zinc-800 dark:text-zinc-100 min-w-0"
                            autoFocus
                          />
                          {slugAvailability === 'checking' && <svg className="animate-spin w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                          {slugAvailability === 'available' && <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>}
                          {slugAvailability === 'taken' && <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                        </div>

                        {slugAvailability === 'available' && <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Available — this URL is free to use</p>}
                        {slugAvailability === 'taken' && <p className="text-[10px] font-semibold text-red-500 flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Already taken — try a different name</p>}
                        {slugAvailability === 'idle' && <p className="text-[10px] text-zinc-400 dark:text-zinc-500">3–30 characters · lowercase letters, numbers and hyphens only · No special characters</p>}
                        {slugFeedback && <p className={`text-xs font-semibold ${slugFeedback.type === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{slugFeedback.type === 'success' ? '✓ ' : '✗ '}{slugFeedback.msg}</p>}

                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveSlug}
                            disabled={slugSaving || slugInput.trim().length < 3 || slugAvailability === 'taken'}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                            style={{ background: GOLD, color: NAVY }}
                          >
                            {slugSaving ? 'Saving…' : (
                              <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Save Slug</>
                            )}
                          </button>
                          <button
                            onClick={() => { setSlugEditing(false); setSlugFeedback(null); setSlugAvailability('idle'); }}
                            className="px-4 py-2.5 bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl hover:bg-zinc-200 dark:hover:bg-neutral-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Snapshot model note */}
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border bg-white dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 shadow-sm">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-zinc-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 2 12c0 .34.02.68.05 1.01M4.93 19.07A10 10 0 0 0 22 12c0-.34-.02-.68-.05-1.01"/></svg>
                <div>
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Snapshot model</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">Your public profile is a snapshot. Publish again to update it with your latest changes.</p>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Live preview + features ──────────────────────── */}
            <div className="lg:col-span-2 flex flex-col gap-4">

              {/* Live preview panel */}
              <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Live Preview</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Appears to others</span>
                </div>
                <div className="p-4">
                  <ProfileLivePreview personalInfo={personalInfo} cvData={cvData} hasWatermark={hasWatermark} />
                </div>
              </div>

              {/* What people will see */}
              <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-5 shadow-sm">
                <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider mb-4">What people will see</h3>
                <div className="space-y-3">
                  {[
                    { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>, label: 'Professional hero card', sub: 'Your name, title & key info' },
                    { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, label: 'One-page CV preview', sub: 'Clean, optimised for web' },
                    { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>, label: 'Key skills & experience', sub: 'Highlights that matter most' },
                    { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: 'Contact & social links', sub: 'Easy to reach you' },
                    { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>, label: 'Your branding', sub: hasWatermark ? 'Watermark based on your plan' : 'Clean, no watermark' },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${NAVY}10` }}>
                        <span style={{ color: NAVY }} className="dark:!text-[#C9A84C]">{f.icon}</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 leading-tight">{f.label}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{f.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Why publish? + Profile views row ───────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Why publish */}
            <div className="sm:col-span-2 rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-5 shadow-sm">
              <h3 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider mb-4">Why publish?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { check: true, label: 'Build your professional brand', detail: 'A permanent, shareable page that is always up to date' },
                  { check: true, label: 'Share a clean, always-available CV', detail: 'One link for all your applications' },
                  { check: true, label: 'Get discovered by recruiters', detail: 'SEO-friendly and indexed by search engines' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${GOLD}20` }}>
                      <svg className="w-3 h-3" style={{ color: GOLD }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 leading-tight">{item.label}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permanent note / CTA */}
            <div className="rounded-2xl p-5 flex flex-col justify-between shadow-sm border" style={{ background: `linear-gradient(135deg, ${NAVY}08 0%, ${GOLD}08 100%)`, borderColor: `${GOLD}30` }}>
              <div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: GOLD }}>
                  <svg className="w-5 h-5" style={{ color: NAVY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
                </div>
                <p className="text-sm font-extrabold text-zinc-800 dark:text-zinc-100 leading-tight">Public profiles are permanent and brandable.</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">Perfect for your LinkedIn bio, email signature, or personal website.</p>
              </div>
              {!profilePublished && isAuthenticated && (
                <button
                  onClick={handlePublish}
                  disabled={profilePublishing}
                  className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: GOLD, color: NAVY }}
                >
                  {profilePublishing ? 'Publishing…' : 'Publish now →'}
                </button>
              )}
              {profilePublished && (
                <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-center transition-opacity hover:opacity-90 block" style={{ background: GOLD, color: NAVY }}>
                  View my profile →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 mt-6">
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Temporary links are rate limited to 10 per hour per device. Abuse may result in temporary restrictions.
      </p>
    </div>
  );
};

export default ShareProfilePage;
