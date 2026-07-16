/**
 * ShareProfilePage — Full-page share hub.
 *
 * Two panels:
 *   LEFT  – Temporary Share Link (expiring, disposable, rate-limited)
 *   RIGHT – Public Profile (permanent, custom slug, publish / unpublish)
 *
 * Uses the app's Tailwind dark/light theme throughout.
 * All logic ported from ShareCVModal.tsx.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CVData, UserProfile, SavedCoverLetter, TemplateName } from '../types';
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
}

// ── Small reusable pieces ─────────────────────────────────────────────────
function FeaturePill({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 flex-1 min-w-[140px]">
      <span className="w-8 h-8 rounded-lg bg-[#1B2B4B]/8 dark:bg-white/8 flex items-center justify-center flex-shrink-0 text-[#1B2B4B] dark:text-[#C9A84C]">
        {icon}
      </span>
      <div>
        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">{label}</p>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{sub}</p>
      </div>
    </div>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/8 flex-1 min-w-[80px]">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{value}</span>
    </div>
  );
}

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

function SectionBadge({ label, variant = 'gold' }: { label: string; variant?: 'gold' | 'green' }) {
  const cls = variant === 'gold'
    ? 'bg-[#C9A84C]/15 text-[#8B6B2E] dark:text-[#C9A84C] border border-[#C9A84C]/25'
    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40';
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

// ── Relative time ─────────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────
const ShareProfilePage: React.FC<ShareProfilePageProps> = ({
  cvData,
  userProfile,
  user,
  isAuthenticated,
  savedCoverLetters,
  onShareLinkAdded,
  onGoToGenerator,
}) => {
  const personalInfo = userProfile?.personalInfo;
  const template: TemplateName = (cvData?.template as TemplateName) ?? 'professional';

  // Cover letter — most recent saved
  const latestCoverLetter = savedCoverLetters[0]?.content ?? null;
  const hasCoverLetter = !!(latestCoverLetter && latestCoverLetter.trim().length > 0);

  // ── Share link state ─────────────────────────────────────────────────
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

  // ── Stored links + live stats ────────────────────────────────────────
  const [storedLinks, setStoredLinks] = useState<StoredShareLink[]>([]);
  const [linkStats, setLinkStats] = useState<Map<string, ShareStats>>(new Map());
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    const links = getStoredShareLinks();
    setStoredLinks(links);

    // Load latest link immediately
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

    // Fetch live view counts
    if (links.length > 0) {
      setLoadingStats(true);
      fetchAllShareStats(links.map(l => l.id)).then(stats => {
        setLinkStats(stats);
        setLoadingStats(false);
      }).catch(() => setLoadingStats(false));
    }
  }, []);

  // ── Public profile state ─────────────────────────────────────────────
  const profileSlugKey = user?.id ? `publicProfile:slug:${user.id}` : null;
  const [profileSlug, setProfileSlug] = useState<string | null>(() => {
    if (!profileSlugKey) return null;
    try { return localStorage.getItem(profileSlugKey); } catch { return null; }
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
  // Real-time slug availability while editing
  const [slugAvailability, setSlugAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'>('idle');

  const profileUrl = profileSlug
    ? buildProfileUrl(profileSlug)
    : (user?.id ? buildProfileUrl(String(user.id)) : '');

  // ── Debounced slug availability check ────────────────────────────────
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

  // ── Generate share link ───────────────────────────────────────────────
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
      cvData,
      personalInfo: sharedPersonalInfo,
      template,
      sharedAt: new Date().toISOString(),
      ...(includeCoverLetter && hasCoverLetter ? { coverLetterText: latestCoverLetter! } : {}),
      procvBranding: needsWatermark(),
    };

    const compressed = encodeSharePayload(payload);
    const shareResult = await createShareLink(compressed);

    if (shareResult) {
      const { id, expires_at } = shareResult;
      const url = buildShortShareUrl(id);
      setShareUrl(url);
      setIsShortLink(true);
      setLinkExpiresAt(expires_at);
      addStoredShareLink(id, expires_at);
      const newLink = { id, created_at: Math.floor(Date.now() / 1000), expires_at };
      onShareLinkAdded?.(newLink);
      setStoredLinks(prev => [{ id, created_at: Date.now(), expires_at }, ...prev.filter(l => l.id !== id)]);
    } else {
      const fallbackUrl = `${window.location.origin}${window.location.pathname}#share=${compressed}`;
      setShareUrl(fallbackUrl);
      setIsShortLink(false);
    }

    logEvent({ event_type: 'share_created', template, mode: shareResult ? 'short' : 'hash' });
    setLinkGenerated(true);
    setIsReusingLink(false);
    setGenerating(false);
  }, [cvData, personalInfo, template, includeCoverLetter, hasCoverLetter, latestCoverLetter, hidePersonalDetails]);

  const copyToClipboard = useCallback(async () => {
    try { await navigator.clipboard.writeText(shareUrl); }
    catch { if (urlInputRef.current) { urlInputRef.current.select(); document.execCommand('copy'); } }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [shareUrl]);

  const regenerate = () => {
    setLinkGenerated(false);
    setShareUrl('');
    setCopied(false);
    setIsReusingLink(false);
  };

  // ── Publish public profile ────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!user?.id || !cvData || !personalInfo) return;
    setProfilePublishing(true);
    setProfileError('');
    const payload: SharedCVPayload = {
      cvData, personalInfo, template,
      sharedAt: new Date().toISOString(),
      procvBranding: needsWatermark(),
    };
    const slug = await publishPublicProfile(payload, loadSessionFallback());
    setProfilePublishing(false);
    if (slug) {
      setProfileSlug(slug);
      setSlugInput(slug);
      setProfilePublished(true);
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
      setProfilePublished(false);
      setProfileSlug(null);
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
    setSlugSaving(true);
    setSlugFeedback(null);
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
    setProfileSlug(result.slug);
    setSlugInput(result.slug);
    if (profileSlugKey) { try { localStorage.setItem(profileSlugKey, result.slug); } catch { /**/ } }
    setSlugEditing(false);
    setSlugFeedback({ type: 'success', msg: 'URL updated!' });
    setTimeout(() => setSlugFeedback(null), 3000);
  }, [user?.id, slugInput, profileSlugKey]);

  // ── Share via helpers ─────────────────────────────────────────────────
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

  // ── "No CV" state ─────────────────────────────────────────────────────
  if (!cvData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1B2B4B]/8 dark:bg-white/8 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Nothing to share yet</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm">Generate a CV first, then come back here to create a share link or publish your profile page.</p>
        </div>
        <button
          onClick={onGoToGenerator}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Share Your CV / Profile
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Two powerful ways to share your professional story</p>
        </div>
        <a
          href="https://procv.app/help/share" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          How it works
        </a>
      </div>

      {/* ── Feature pills ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
        <FeaturePill
          icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
          label="Secure" sub="Your data is protected"
        />
        <FeaturePill
          icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
          label="Trackable" sub="See who views your CV"
        />
        <FeaturePill
          icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
          label="Smart" sub="Auto expires &amp; cleans up"
        />
        <FeaturePill
          icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
          label="You're in control" sub="Publish, edit, or remove"
        />
      </div>

      {/* ── Two-panel grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ╔══════════════════════════════════╗
            ║   LEFT: Temporary Share Link     ║
            ╚══════════════════════════════════╝ */}
        <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden flex flex-col">

          {/* Panel header */}
          <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-700">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${NAVY}15` }}>
                <svg className="w-5 h-5" style={{ color: NAVY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Temporary Share Link</h2>
                <SectionBadge label="Best for one-time sharing" />
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Create a short, expiring link to share your CV instantly.</p>
          </div>

          <div className="px-5 py-4 flex-1 flex flex-col gap-4">

            {/* Info chips */}
            <div className="flex gap-2 flex-wrap">
              <InfoChip
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                label="Expires in" value="30 days"
              />
              <InfoChip
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>}
                label="Rate limit" value="10/hour"
              />
              <InfoChip
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                label="Track views" value="View count"
              />
              <InfoChip
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                label="Access" value="Anyone"
              />
            </div>

            {/* Privacy toggles */}
            <div className="space-y-2">
              {hasCoverLetter && (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: GOLD }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">Include cover letter</span>
                  </div>
                  <Toggle
                    checked={includeCoverLetter}
                    onChange={(v) => { setIncludeCoverLetter(v); setLinkGenerated(false); setShareUrl(''); }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700/40">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 block">Hide personal details</span>
                    <span className="text-[10px] text-zinc-400 truncate block">Removes email, phone &amp; address</span>
                  </div>
                </div>
                <Toggle
                  checked={hidePersonalDetails}
                  onChange={(v) => { setHidePersonalDetails(v); setLinkGenerated(false); setShareUrl(''); }}
                />
              </div>
            </div>

            {/* Link section */}
            <div className="rounded-xl border border-zinc-200 dark:border-neutral-600 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-700/40 border-b border-zinc-200 dark:border-neutral-600">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Your Temporary Share Link</span>
                  {linkGenerated && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      Active
                    </span>
                  )}
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
                    {/* Status */}
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {isReusingLink
                        ? `Reusing existing link · Expires ${linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'soon'}`
                        : isShortLink
                          ? `Short link · Expires ${linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'in 30 days'}`
                          : 'Long link — data encoded in URL'
                      }
                    </p>

                    {/* URL + Copy */}
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

                    {/* QR code */}
                    {qrUrl && (
                      <div className="flex items-center gap-4">
                        <img
                          src={qrUrl}
                          alt="QR code"
                          className="w-[72px] h-[72px] rounded-xl border border-zinc-200 dark:border-neutral-600 shadow-sm flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                          Scan to open on any device.<br />
                          <a
                            href={qrUrl.replace('size=180x180', 'size=400x400')}
                            target="_blank" rel="noopener noreferrer"
                            download="procv-qr.png"
                            className="text-[#C9A84C] hover:underline font-semibold"
                          >
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
                          { id: 'linkedin',  label: 'LinkedIn',   color: '#0A66C2',
                            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
                          { id: 'whatsapp', label: 'WhatsApp',  color: '#25D366',
                            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
                          { id: 'email',    label: 'Email',     color: '#6366F1',
                            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                          { id: 'twitter',  label: 'X',         color: '#000000',
                            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
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

                    {/* New link */}
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

        {/* ╔══════════════════════════════════╗
            ║   RIGHT: Public Profile          ║
            ╚══════════════════════════════════╝ */}
        <div className="rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden flex flex-col">

          {/* Panel header */}
          <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-700">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD}20` }}>
                <svg className="w-5 h-5" style={{ color: GOLD }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Public Profile</h2>
                <SectionBadge label="Best for your brand" variant="green" />
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Create a permanent, branded profile with your own custom URL.</p>
          </div>

          <div className="px-5 py-4 flex-1 flex flex-col gap-4">

            {/* Feature chips */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: '♾️', label: 'Always available', sub: 'No expiry' },
                { icon: '🔗', label: 'Custom URL', sub: 'Your brand identity' },
                { icon: '📊', label: 'Full analytics', sub: 'Track engagement' },
                { icon: '🔍', label: 'SEO friendly', sub: 'Discoverable' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600">
                  <span className="text-base flex-shrink-0">{f.icon}</span>
                  <div>
                    <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 leading-tight">{f.label}</p>
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-500">{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Profile card */}
            <div className="rounded-xl border border-zinc-200 dark:border-neutral-600 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-700/40 border-b border-zinc-200 dark:border-neutral-600">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Your Public Profile</span>
                {profilePublished && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    Published
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Profile preview */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-700/40">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-extrabold text-white flex-shrink-0 shadow-md"
                    style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d4272 100%)` }}>
                    {(personalInfo?.name ?? 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 truncate">{personalInfo?.name ?? 'Your Name'}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{cvData?.experience?.[0]?.jobTitle ?? personalInfo?.title ?? 'Your Title'}</p>
                    {personalInfo?.address && (
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        {personalInfo.address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Publish / URL row */}
                {!isAuthenticated ? (
                  <div className="text-center py-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Sign in to create your permanent public profile.</p>
                  </div>
                ) : !profilePublished ? (
                  <div className="space-y-2">
                    {profileError && <p className="text-xs text-red-500 font-medium">{profileError}</p>}
                    <button
                      onClick={handlePublish}
                      disabled={profilePublishing}
                      className="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ background: GOLD, color: NAVY }}
                    >
                      {profilePublishing ? (
                        <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Publishing…</>
                      ) : (
                        <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Publish Profile Page</>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Profile URL */}
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
                        className="flex-shrink-0 p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-600 transition-colors"
                        title="Copy link"
                      >
                        {profileCopied
                          ? <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        }
                      </button>
                      <a
                        href={profileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-600 transition-colors"
                        title="View public profile"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>

                    {/* Custom slug */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Custom URL (slug)</p>
                        {!slugEditing && (
                          <button
                            onClick={() => { setSlugInput(profileSlug ?? ''); setSlugEditing(true); setSlugFeedback(null); }}
                            className="text-[11px] font-semibold text-[#C9A84C] hover:text-[#8B6B2E] dark:hover:text-[#E0B85A] transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {!slugEditing ? (
                        <div className="flex items-center gap-2 bg-zinc-50 dark:bg-neutral-700/40 border border-zinc-200 dark:border-neutral-600 rounded-xl px-3 py-2.5">
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono select-none">#p=</span>
                          <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 flex-1">{profileSlug ?? '(default)'}</span>
                          {slugFeedback?.type === 'success' && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ {slugFeedback.msg}</span>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Input row with availability indicator */}
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
                            {/* Availability indicator icon */}
                            {slugAvailability === 'checking' && (
                              <svg className="animate-spin w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                              </svg>
                            )}
                            {slugAvailability === 'available' && (
                              <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                            {slugAvailability === 'taken' && (
                              <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            )}
                          </div>

                          {/* Availability badge */}
                          {slugAvailability === 'available' && (
                            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                              Available — this URL is free to use
                            </p>
                          )}
                          {slugAvailability === 'taken' && (
                            <p className="text-[10px] font-semibold text-red-500 flex items-center gap-1">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              Already taken — try a different name
                            </p>
                          )}
                          {slugAvailability === 'idle' && (
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">3–30 characters, lowercase letters, numbers and hyphens only</p>
                          )}

                          {/* Post-save feedback */}
                          {slugFeedback && (
                            <p className={`text-xs font-semibold ${slugFeedback.type === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {slugFeedback.type === 'success' ? '✓ ' : '✗ '}{slugFeedback.msg}
                            </p>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveSlug}
                              disabled={slugSaving || slugInput.trim().length < 3 || slugAvailability === 'taken'}
                              className="flex-1 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                              style={{ background: GOLD, color: NAVY }}
                            >
                              {slugSaving ? <>Saving…</> : 'Save URL'}
                            </button>
                            <button
                              onClick={() => { setSlugEditing(false); setSlugFeedback(null); setSlugAvailability('idle'); }}
                              className="px-4 py-2 bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl hover:bg-zinc-200 dark:hover:bg-neutral-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile status */}
            {isAuthenticated && (
              <div className="rounded-xl border border-zinc-200 dark:border-neutral-600 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-700/40 border-b border-zinc-200 dark:border-neutral-600">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Profile Status</span>
                  {profilePublished && (
                    <button
                      onClick={handleUnpublish}
                      disabled={unpublishing}
                      className="text-[11px] font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {unpublishing ? 'Unpublishing…' : 'Unpublish'}
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {profilePublished ? (
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      <div>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Published</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Your profile is live and visible to everyone.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      </span>
                      <div>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Not published</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Only you can see this. Click "Publish" to go live.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Permanent note */}
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border" style={{ background: `${GOLD}08`, borderColor: `${GOLD}25` }}>
              <span className="text-base flex-shrink-0">👑</span>
              <div>
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">Public profiles are permanent and brandable.</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">Perfect for your LinkedIn email signature or personal website.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Links are rate limited to 10 per hour per device. Abuse may result in temporary restrictions.
      </p>
    </div>
  );
};

export default ShareProfilePage;
