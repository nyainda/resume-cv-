import React, { useState, useCallback, useRef } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import LZString from 'lz-string';
import { createShareLink, buildShortShareUrl, checkShareRateLimit, addStoredShareLink } from '../services/shareService';
import { publishPublicProfile, unpublishPublicProfile, buildProfileUrl } from '../services/publicProfileService';
import { logEvent } from '../services/eventsService';

interface ShareCVModalProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  coverLetterText?: string | null;
  onClose: () => void;
  sessionToken?: string;
  userId?: number;
}

export interface SharedCVPayload {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  coverLetterText?: string;
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
  cvData, personalInfo, template, coverLetterText, onClose, sessionToken, userId,
}) => {
  const [copied, setCopied] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number>(0); // unix seconds
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isShortLink, setIsShortLink] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('link');
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [profilePublishing, setProfilePublishing] = useState(false);
  const [profilePublished, setProfilePublished] = useState(false);
  const [profileError, setProfileError]   = useState('');
  const [profileCopied, setProfileCopied] = useState(false);
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
    const payload: SharedCVPayload = {
      cvData,
      personalInfo,
      template,
      sharedAt: new Date().toISOString(),
      ...(includeCoverLetter && hasCoverLetter ? { coverLetterText: coverLetterText! } : {}),
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
  };

  const handlePublishProfile = useCallback(async () => {
    if (!sessionToken || !userId) return;
    setProfilePublishing(true);
    setProfileError('');
    const payload: SharedCVPayload = {
      cvData, personalInfo, template,
      sharedAt: new Date().toISOString(),
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
        className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden"
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

        <div className="px-5 py-5 space-y-4">

          {/* Cover letter toggle */}
          {hasCoverLetter && (
            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Include cover letter</p>
                  <p className="text-xs text-zinc-500">Recruiter can toggle between CV and letter</p>
                </div>
              </div>
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={includeCoverLetter}
                  onChange={e => { setIncludeCoverLetter(e.target.checked); setLinkGenerated(false); setShareUrl(''); }}
                />
                <div className={`w-10 h-5.5 h-[22px] rounded-full transition-colors ${includeCoverLetter ? 'bg-[#1B2B4B]' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                <div className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${includeCoverLetter ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
            </label>
          )}

          {/* Generate button */}
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
            <button
              onClick={generateLink}
              disabled={generating}
              className="w-full py-3 px-4 bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-60 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Creating secure link…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  Generate Share Link
                </>
              )}
            </button>
            </>
          ) : (
            <div className="space-y-4">

              {/* Tab switcher */}
              <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 bg-zinc-50 dark:bg-zinc-800/60 gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Link tab ── */}
              {activeTab === 'link' && (
                <div className="space-y-3">
                  {/* Link type badge */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                    isShortLink
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                  }`}>
                    {isShortLink ? (
                      <>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                        Short link — expires {linkExpiresAt > 0
                          ? new Date(linkExpiresAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'in 30 days'} · Your CV data stays on our server, not in the URL
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Long link — CV data is encoded directly in the URL · No expiry, no server required
                      </>
                    )}
                  </div>

                  {/* URL input + copy */}
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0 relative">
                      <input
                        ref={inputRef}
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="w-full text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono truncate focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 pr-8"
                        onClick={() => inputRef.current?.select()}
                      />
                    </div>
                    <button
                      onClick={copyToClipboard}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0 min-w-[90px] justify-center ${
                        copied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#1B2B4B] hover:bg-[#152238] text-white'
                      }`}
                    >
                      {copied ? (
                        <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                      ) : (
                        <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                      )}
                    </button>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`CV — ${personalInfo.name}`)}&body=${encodeURIComponent(`Hi,\n\nPlease find my CV at the link below:\n${shareUrl}\n\nBest regards,\n${personalInfo.name}`)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      Email
                    </a>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Preview
                    </a>
                    <button
                      onClick={regenerate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ml-auto"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      New link
                    </button>
                  </div>
                </div>
              )}

              {/* ── QR tab ── */}
              {activeTab === 'qr' && (
                <div className="space-y-3">
                  {isShortLink ? (
                    <div className="flex flex-col items-center gap-4 py-2">
                      <div className="p-3 bg-white border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-sm">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(shareUrl)}`}
                          alt={`QR code for ${personalInfo.name}'s CV`}
                          className="w-48 h-48 rounded-lg"
                          loading="lazy"
                        />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center max-w-xs leading-relaxed">
                        Scan to view the CV instantly on any phone. Right-click to save the image.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-4 text-center px-2">
                      <div className="w-14 h-14 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 border border-[#1B2B4B]/15 dark:border-[#C9A84C]/20 flex items-center justify-center">
                        <svg className="w-7 h-7 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">QR not available for long links</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          Generating a QR code for this link would send your entire CV to an external service.
                          <br/>
                          <span className="font-semibold text-zinc-600 dark:text-zinc-300">Regenerate as a short link</span> to enable safe QR codes.
                        </p>
                      </div>
                      <button
                        onClick={regenerate}
                        className="mt-1 px-4 py-2 bg-[#1B2B4B] text-white text-xs font-bold rounded-lg hover:bg-[#152238] transition-colors"
                      >
                        Generate short link instead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Public Profile tab ── */}
              {activeTab === 'profile' && sessionToken && userId && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 border border-[#1B2B4B]/10 dark:border-[#C9A84C]/15">
                    <div className="w-7 h-7 rounded-lg bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M5 3l14 9-14 9V3z"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Permanent profile page</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        Your URL never changes. Re-publish whenever you update your CV and it always shows the latest version.
                      </p>
                    </div>
                  </div>

                  {!profilePublished ? (
                    <div className="space-y-2.5">
                      {profileError && (
                        <p className="text-xs text-red-500 font-medium px-1">{profileError}</p>
                      )}
                      <button
                        onClick={handlePublishProfile}
                        disabled={profilePublishing}
                        className="w-full py-2.5 px-4 bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-60 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                      >
                        {profilePublishing ? (
                          <>
                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                            Publishing…
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg>
                            Publish profile page
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Live! Your permanent profile page is public.</p>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={profileUrl}
                          readOnly
                          className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono truncate focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                          onClick={e => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          onClick={copyProfileUrl}
                          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0 min-w-[80px] justify-center ${
                            profileCopied
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#1B2B4B] hover:bg-[#152238] text-white'
                          }`}
                        >
                          {profileCopied
                            ? <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                            : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                          }
                        </button>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          View live
                        </a>
                        <button
                          onClick={handlePublishProfile}
                          disabled={profilePublishing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                          Update
                        </button>
                        <button
                          onClick={handleUnpublishProfile}
                          disabled={profilePublishing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors ml-auto"
                        >
                          Unpublish
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
            Link contains your CV only · Only share with people you trust
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareCVModal;
