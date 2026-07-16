import React, { useState, useCallback, useRef, useEffect } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import LZString from 'lz-string';
import { createShareLink, buildShortShareUrl, checkShareRateLimit, addStoredShareLink, getStoredShareLinks } from '../services/shareService';
import { publishPublicProfile, unpublishPublicProfile, buildProfileUrl, setCustomProfileSlug, validateSlug } from '../services/publicProfileService';
import { logEvent } from '../services/eventsService';
import { needsWatermark } from '../services/accountTierService';

interface ShareCVModalProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  coverLetterText?: string | null;
  onClose: () => void;
  sessionToken?: string;
  userId?: number;
  /** Called when a short link is successfully created so the slot can store the ID for cross-device sync */
  onShareLinkAdded?: (link: { id: string; created_at: number; expires_at: number }) => void;
}

export interface SharedCVPayload {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  coverLetterText?: string;
  /** True when the creator was on Free/BYOK at share time — drives watermark on preview and PDF. */
  procvBranding?: boolean;
}

export function encodeSharePayload(payload: SharedCVPayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharedCVPayload | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    return JSON.parse(json) as SharedCVPayload;
  } catch {
    return null;
  }
}

export function buildShareUrl(payload: SharedCVPayload): string {
  const encoded = encodeSharePayload(payload);
  const base = window.location.origin + window.location.pathname;
  return `${base}#share=${encoded}`;
}

type Tab = 'link' | 'qr' | 'profile';

const ShareCVModal: React.FC<ShareCVModalProps> = ({
  cvData, personalInfo, template, coverLetterText, onClose, sessionToken, userId, onShareLinkAdded,
}) => {
  const [copied, setCopied] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number>(0); // unix seconds
  const [isReusingLink, setIsReusingLink] = useState(false); // true when showing a pre-existing link
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isShortLink, setIsShortLink] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('link');
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [hidePersonalDetails, setHidePersonalDetails] = useState(false);

  // On open: if the user already has a valid (non-expired) short link, load it
  // immediately so they don't have to click "Generate" again.
  useEffect(() => {
    const links = getStoredShareLinks();
    if (links.length === 0) return;
    const latest = links[0]; // newest first
    const nowSec = Math.floor(Date.now() / 1000);
    if (latest.expires_at > nowSec) {
      setShareUrl(buildShortShareUrl(latest.id));
      setLinkExpiresAt(latest.expires_at);
      setIsShortLink(true);
      setLinkGenerated(true);
      setIsReusingLink(true);
    }
  }, []);
  const [rateLimitError, setRateLimitError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [profilePublishing, setProfilePublishing] = useState(false);
  const [profilePublished, setProfilePublished] = useState(false);
  const [profileError, setProfileError]   = useState('');
  const [profileCopied, setProfileCopied] = useState(false);

  // Custom slug editor
  const [slugInput, setSlugInput] = useState('');
  const [slugEditing, setSlugEditing] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugFeedback, setSlugFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  // Persist the slug so the editor's quick "Copy profile link" button works
  // across modal open/close without re-publishing.
  const profileSlugKey = userId ? `publicProfile:slug:${userId}` : null;
  const [profileSlug, setProfileSlug] = useState<string | null>(() => {
    if (!profileSlugKey) return null;
    try { return localStorage.getItem(profileSlugKey); } catch { return null; }
  });
  const profileUrl = profileSlug
    ? buildProfileUrl(profileSlug)
    : (userId ? buildProfileUrl(String(userId)) : '');

  const hasCoverLetter = !!(coverLetterText && coverLetterText.trim().length > 0);

  const generateLink = useCallback(async () => {
    setRateLimitError('');

    // Client-side rate limit check — mirrors the server's 10/hour limit
    const rateCheck = checkShareRateLimit();
    if (!rateCheck.allowed) {
      const minutesLeft = Math.ceil(rateCheck.retryAfterMs / 60_000);
      setRateLimitError(
        `You've created 10 share links this hour. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
      );
      return;
    }

    setGenerating(true);
    // Apply privacy mask if user chose to hide personal details
    const sharedPersonalInfo: PersonalInfo = hidePersonalDetails
      ? { ...personalInfo, email: '', phone: '', address: '' }
      : personalInfo;
    const payload: SharedCVPayload = {
      cvData,
      personalInfo: sharedPersonalInfo,
      template,
      sharedAt: new Date().toISOString(),
      ...(includeCoverLetter && hasCoverLetter ? { coverLetterText: coverLetterText! } : {}),
      // Bake the creator's watermark decision into the payload so viewers use
      // the creator's tier, not their own, for both preview and PDF download.
      procvBranding: needsWatermark(),
    };
    const compressed = encodeSharePayload(payload);
    const shareResult = await createShareLink(compressed);
    if (shareResult) {
      const { id: shortId, expires_at } = shareResult;
      setShareUrl(buildShortShareUrl(shortId));
      setIsShortLink(true);
      setLinkExpiresAt(expires_at);
      // Persist for editor badge + dashboard stats
      addStoredShareLink(shortId, expires_at);
      // Notify slot so the link syncs across devices
      onShareLinkAdded?.({ id: shortId, created_at: Math.floor(Date.now() / 1000), expires_at });
    } else {
      setShareUrl(buildShareUrl(payload));
      setIsShortLink(false);
    }
    logEvent({ event_type: 'share_created', template, mode: shareResult ? 'short' : 'hash' });
    setLinkGenerated(true);
    setGenerating(false);
  }, [cvData, personalInfo, template, includeCoverLetter, hasCoverLetter, coverLetterText]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [shareUrl]);

  const regenerate = () => {
    setLinkGenerated(false);
    setShareUrl('');
    setCopied(false);
    setIsReusingLink(false);
  };

  const handlePublishProfile = useCallback(async () => {
    if (!sessionToken || !userId) return;
    setProfilePublishing(true);
    setProfileError('');
    const payload: SharedCVPayload = {
      cvData, personalInfo, template,
      sharedAt: new Date().toISOString(),
      procvBranding: needsWatermark(),
    };
    const slug = await publishPublicProfile(payload, sessionToken);
    setProfilePublishing(false);
    if (slug) {
      setProfileSlug(slug);
      setProfilePublished(true);
      // Persist so the editor's quick-copy button works without reopening this modal
      if (profileSlugKey) {
        try { localStorage.setItem(profileSlugKey, slug); } catch { /* ignore quota */ }
      }
      logEvent({ event_type: 'profile_published' });
    } else {
      setProfileError('Could not publish. Please try again.');
    }
  }, [sessionToken, userId, cvData, personalInfo, template]);

  const handleUnpublishProfile = useCallback(async () => {
    if (!sessionToken) return;
    setProfilePublishing(true);
    const ok = await unpublishPublicProfile(sessionToken);
    setProfilePublishing(false);
    if (ok) setProfilePublished(false);
  }, [sessionToken]);

  const copyProfileUrl = useCallback(async () => {
    try { await navigator.clipboard.writeText(profileUrl); }
    catch { /* modern browsers don't need fallback */ }
    setProfileCopied(true);
    setTimeout(() => setProfileCopied(false), 2500);
  }, [profileUrl]);

  const handleSaveSlug = useCallback(async () => {
    if (!sessionToken || !userId) return;
    const trimmed = slugInput.trim().toLowerCase();
    const validationError = validateSlug(trimmed);
    if (validationError) {
      setSlugFeedback({ type: 'error', msg: validationError });
      return;
    }
    setSlugSaving(true);
    setSlugFeedback(null);
    const result = await setCustomProfileSlug(trimmed, sessionToken);
    setSlugSaving(false);
    if ('error' in result) {
      const msgs: Record<string, string> = {
        slug_taken:    'That name is already taken — try another',
        not_published: 'Publish your profile first',
        invalid:       'Invalid format',
        network:       'Could not save — please try again',
      };
      setSlugFeedback({ type: 'error', msg: msgs[result.error] ?? 'Error saving' });
      return;
    }
    setProfileSlug(result.slug);
    if (profileSlugKey) {
      try { localStorage.setItem(profileSlugKey, result.slug); } catch { /* ignore */ }
    }
    setSlugEditing(false);
    setSlugFeedback({ type: 'success', msg: 'URL updated!' });
    setTimeout(() => setSlugFeedback(null), 3000);
  }, [sessionToken, userId, slugInput, profileSlugKey]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'link',
      label: 'Share Link',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      ),
    },
    {
      id: 'qr',
      label: 'QR Code',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <path d="M14 14h.01M17 14h.01M14 17h.01M17 17h.01M20 14h.01M20 17h.01M20 20h.01"/>
        </svg>
      ),
    },
    ...(sessionToken && userId ? [{
      id: 'profile' as Tab,
      label: 'Public Page',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      ),
    }] : []),
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-zinc-200/60 dark:border-neutral-700/60 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Gradient header ── */}
        <div className="relative bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] px-5 pt-5 pb-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Share Your CV</h2>
              <p className="text-sm text-white/60 mt-0.5">Send a live preview link — no download needed</p>
            </div>
          </div>

          {/* Security badge */}
          <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="text-[11px] text-white/75 leading-tight">
              Recipients see only your CV — not your workspace or settings
            </p>
          </div>
        </div>

        {/* ══ SECTION 1: Share a CV link ══ */}
        <div className="px-5 pt-5 pb-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-[#1B2B4B]/10 dark:bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Share a CV link</p>
              <p className="text-[11px] text-zinc-400">A snapshot of this CV — recipients see it read-only</p>
            </div>
          </div>

          {/* Options: cover letter + privacy */}
          <div className="space-y-2">
            {hasCoverLetter && (
              <label className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Include cover letter</p>
                </div>
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={includeCoverLetter}
                    onChange={e => { setIncludeCoverLetter(e.target.checked); setLinkGenerated(false); setShareUrl(''); }} />
                  <div className={`w-9 h-[20px] rounded-full transition-colors ${includeCoverLetter ? 'bg-[#1B2B4B]' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform ${includeCoverLetter ? 'translate-x-[16px]' : 'translate-x-0'}`} />
                </div>
              </label>
            )}
            <label className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Hide personal details</p>
                  <p className="text-[10px] text-zinc-400 leading-tight">Removes email, phone &amp; address from the shared copy</p>
                </div>
              </div>
              <div className="relative flex-shrink-0">
                <input type="checkbox" className="sr-only" checked={hidePersonalDetails}
                  onChange={e => { setHidePersonalDetails(e.target.checked); setLinkGenerated(false); setShareUrl(''); }} />
                <div className={`w-9 h-[20px] rounded-full transition-colors ${hidePersonalDetails ? 'bg-[#1B2B4B]' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                <div className={`absolute top-0.5 left-0.5 w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform ${hidePersonalDetails ? 'translate-x-[16px]' : 'translate-x-0'}`} />
              </div>
            </label>
          </div>

          {/* Generate / show link */}
          {!linkGenerated ? (
            <>
              {rateLimitError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">{rateLimitError}</p>
                </div>
              )}
              <button onClick={generateLink} disabled={generating}
                className="w-full py-2.5 px-4 bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-60 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                {generating ? (
                  <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Creating secure link…</>
                ) : (
                  <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Generate Share Link</>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-3">
              {/* Link status badge */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                isReusingLink ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                : isShortLink  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'}`}>
                {isReusingLink ? (
                  <><svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  Reusing existing link — expires {linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'soon'}</>
                ) : isShortLink ? (
                  <><svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                  Short link — expires {linkExpiresAt > 0 ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'in 30 days'}</>
                ) : (
                  <><svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Long link — data encoded in URL</>
                )}
              </div>

              {/* URL + copy */}
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={shareUrl} readOnly
                  className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono truncate focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  onClick={() => inputRef.current?.select()} />
                <button onClick={copyToClipboard}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0 min-w-[80px] justify-center ${copied ? 'bg-emerald-500 text-white' : 'bg-[#1B2B4B] hover:bg-[#152238] text-white'}`}>
                  {copied ? <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                    : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>}
                </button>
              </div>

              {/* QR code (short links only) */}
              {isShortLink && (
                <div className="flex justify-center">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=8&data=${encodeURIComponent(shareUrl)}`}
                    alt="QR code" className="w-24 h-24 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm" loading="lazy" />
                </div>
              )}

              {/* Quick actions */}
              <div className="flex gap-2 flex-wrap">
                <a href={`mailto:?subject=${encodeURIComponent(`CV — ${personalInfo.name}`)}&body=${encodeURIComponent(`Hi,\n\nPlease find my CV at the link below:\n${shareUrl}\n\nBest regards,\n${personalInfo.name}`)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Email
                </a>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Preview
                </a>
                <button onClick={regenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ml-auto">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  New link
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══ SECTION 2: Public profile page (signed-in users only) ══ */}
        {sessionToken && userId && (
          <>
            <div className="mx-5 border-t border-zinc-100 dark:border-zinc-800" />
            <div className="px-5 pt-4 pb-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Publish a profile page</p>
                  <p className="text-[11px] text-zinc-400">A permanent URL you can keep in your email signature or LinkedIn</p>
                </div>
              </div>

              {!profilePublished ? (
                <div className="space-y-2">
                  {profileError && <p className="text-xs text-red-500 font-medium px-1">{profileError}</p>}
                  <button onClick={handlePublishProfile} disabled={profilePublishing}
                    className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md">
                    {profilePublishing ? (
                      <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Publishing…</>
                    ) : (
                      <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Publish profile page</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Live — your profile page is public</p>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={profileUrl} readOnly
                      className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono truncate focus:outline-none"
                      onClick={e => (e.target as HTMLInputElement).select()} />
                    <button onClick={copyProfileUrl}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0 min-w-[80px] justify-center ${profileCopied ? 'bg-emerald-500 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}>
                      {profileCopied ? <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                        : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>}
                    </button>
                  </div>
                  {/* ── Custom slug editor ── */}
                  {!slugEditing ? (
                    <button
                      onClick={() => { setSlugInput(profileSlug ?? ''); setSlugEditing(true); setSlugFeedback(null); }}
                      className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-semibold transition-colors"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Customize your URL
                    </button>
                  ) : (
                    <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700">
                      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Customize your link</p>
                      <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-lg px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-violet-400 transition-shadow">
                        <span className="text-[11px] text-zinc-400 font-mono whitespace-nowrap select-none">#p=</span>
                        <input
                          type="text"
                          value={slugInput}
                          onChange={e => { setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugFeedback(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveSlug(); if (e.key === 'Escape') setSlugEditing(false); }}
                          placeholder="your-name"
                          maxLength={30}
                          className="flex-1 text-xs font-mono bg-transparent outline-none text-zinc-800 dark:text-zinc-100 min-w-0"
                          autoFocus
                        />
                      </div>
                      <p className="text-[10px] text-zinc-400">Letters, numbers, hyphens · 3–30 chars · e.g. jane-doe</p>
                      {slugFeedback && (
                        <p className={`text-xs font-semibold ${slugFeedback.type === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {slugFeedback.type === 'success' ? '✓ ' : ''}{slugFeedback.msg}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveSlug}
                          disabled={slugSaving || slugInput.trim().length < 3}
                          className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          {slugSaving ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</> : 'Save'}
                        </button>
                        <button
                          onClick={() => { setSlugEditing(false); setSlugFeedback(null); }}
                          className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {slugFeedback?.type === 'success' && !slugEditing && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ {slugFeedback.msg}</p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <a href={profileUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View live
                    </a>
                    <button onClick={handlePublishProfile} disabled={profilePublishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      Update
                    </button>
                    <button onClick={handleUnpublishProfile} disabled={profilePublishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors ml-auto">
                      Unpublish
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-5 pb-4">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
            Share links contain your CV only — never your workspace or settings
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareCVModal;
