import React, { useState, useRef, useMemo, useEffect } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import CVPreview from './CVPreview';
import { downloadCV } from '../services/cvDownloadService';
import DownloadProgressModal from './DownloadProgressModal';
import { fetchShareStats, type ShareStats } from '../services/shareService';

// ── Smart Summary ─────────────────────────────────────────────────────────────
// Builds a deterministic, human-readable professional snapshot from CV data.
// No AI required — derived entirely from structured fields.
// Exported so PublicProfilePage can reuse the same logic.
export function buildSmartSummary(cvData: CVData, personalInfo: PersonalInfo): string | null {
  const experiences = cvData.experience ?? [];
  const skills = cvData.skills ?? [];
  const education = cvData.education ?? [];

  if (experiences.length === 0 && !cvData.summary) return null;

  // If there's an existing summary, use it directly
  if (cvData.summary && cvData.summary.trim().length > 40) {
    return cvData.summary.trim();
  }

  const firstName = personalInfo.name?.split(' ')[0] || 'This professional';
  const latestExp = experiences[0];
  const title = latestExp?.jobTitle || '';
  const company = latestExp?.company || '';

  // Compute total experience months from start/end dates
  let totalMonths = 0;
  for (const exp of experiences) {
    try {
      const rawStart = exp.startDate || '';
      const rawEnd = exp.endDate || '';
      const isPresent = !rawEnd || /present|current/i.test(rawEnd);
      const start = new Date(rawStart);
      const end = isPresent ? new Date() : new Date(rawEnd);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        totalMonths += (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      }
    } catch { /* skip */ }
  }
  const years = Math.round(totalMonths / 12);

  const parts: string[] = [];

  // Opening line
  if (title && years > 0) {
    parts.push(`${firstName} is a ${title.toLowerCase().includes('senior') || title.toLowerCase().includes('lead') || title.toLowerCase().includes('head') || title.toLowerCase().includes('director') ? '' : ''}${title} with ${years}+ year${years !== 1 ? 's' : ''} of experience.`);
  } else if (title) {
    parts.push(`${firstName} is a ${title}.`);
  } else if (years > 0) {
    parts.push(`${firstName} brings ${years}+ year${years !== 1 ? 's' : ''} of professional experience.`);
  }

  // Skills sentence
  if (skills.length >= 3) {
    const topSkills = skills.slice(0, 3).join(', ');
    parts.push(`Core expertise includes ${topSkills}.`);
  }

  // Education sentence
  const latestEd = education[0];
  if (latestEd?.degree && latestEd?.school) {
    parts.push(`Holds ${latestEd.degree} from ${latestEd.school}.`);
  }

  // Current role
  if (company) {
    parts.push(`Currently at ${company}.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

interface SharedCVViewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  coverLetterText?: string;
  /** The 8-char short share ID from the URL hash (e.g. `#s=AbC12345`).
   *  Only present when the CV was loaded via a short link (not legacy `#share=`). */
  shareId?: string;
  /** When true the creator was on Free/BYOK at share time — shows ProCV branding
   *  on the preview and forces a watermark on any PDF downloaded from this view. */
  procvBranding?: boolean;
  onLoadIntoEditor?: (cvData: CVData) => void;
  onDismiss: () => void;
}

const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const SharedCVView: React.FC<SharedCVViewProps> = ({
  cvData,
  personalInfo,
  template,
  sharedAt,
  coverLetterText,
  shareId,
  procvBranding,
  onLoadIntoEditor,
  onDismiss,
}) => {
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadTotalMs, setDownloadTotalMs] = useState<number | null>(null);
  const [downloadVia, setDownloadVia] = useState<'playwright' | 'cloudflare' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [contactCopied, setContactCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [activeDoc, setActiveDoc] = useState<'cv' | 'coverletter'>('cv');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [shareStats, setShareStats] = useState<ShareStats | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Responsive preview scaling ─────────────────────────────────────────────
  const sharedPaperAreaRef  = useRef<HTMLDivElement>(null);
  const sharedViewportRef   = useRef<HTMLDivElement>(null);
  const sharedScalingRef    = useRef<HTMLDivElement>(null);
  const sharedPanOriginRef  = useRef<{ x: number; panX: number }>({ x: 0, panX: 0 });
  const [sharedAutoFitScale, setSharedAutoFitScale]               = useState(1);
  const [sharedZoomOverride, setSharedZoomOverride]               = useState<number | null>(null);
  const [sharedPreviewScale, setSharedPreviewScale]               = useState(1);
  const [sharedPreviewContentHeight, setSharedPreviewContentHeight] = useState(0);
  const [sharedPanX, setSharedPanX] = useState(0);
  const [isSharedPanning, setIsSharedPanning] = useState(false);

  const SHARED_ZOOM_STEP = 0.15;
  const SHARED_MIN_ZOOM  = 0.25;
  const SHARED_MAX_ZOOM  = 1.75;

  useEffect(() => {
    const el = sharedPaperAreaRef.current;
    if (!el) return;
    const A4_PX = 794;
    function measure() {
      if (!el) return;
      const available = el.clientWidth - 32; // match the 16px horizontal padding each side used by the viewport
      const scale = Math.min(1, Math.max(0.25, available / A4_PX));
      setSharedAutoFitScale(scale);
    }
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setSharedPreviewScale(sharedZoomOverride !== null ? sharedZoomOverride : sharedAutoFitScale);
  }, [sharedAutoFitScale, sharedZoomOverride]);

  const handleSharedZoomIn = () => {
    const next = Math.min(SHARED_MAX_ZOOM, parseFloat(((sharedZoomOverride ?? sharedAutoFitScale) + SHARED_ZOOM_STEP).toFixed(2)));
    setSharedZoomOverride(next);
    setSharedPanX(0);
  };
  const handleSharedZoomOut = () => {
    const next = Math.max(SHARED_MIN_ZOOM, parseFloat(((sharedZoomOverride ?? sharedAutoFitScale) - SHARED_ZOOM_STEP).toFixed(2)));
    setSharedZoomOverride(next);
    setSharedPanX(0);
  };
  const handleSharedZoomReset = () => {
    setSharedZoomOverride(null);
    setSharedPanX(0);
  };

  // Drag-to-pan (horizontal only), mirrors the fix applied to the main editor
  // preview (CVGenerator.tsx) — Pointer Events fire uniformly for mouse and
  // touch, unlike native nested-scroll containers which are unreliable for
  // single-finger drag on mobile browsers.
  const clampSharedPanToBounds = (x: number) => {
    const containerEl = sharedPaperAreaRef.current;
    const containerWidth = (containerEl?.clientWidth || 794) - 32;
    const contentWidth = 794 * sharedPreviewScale;
    const halfExcess = Math.max(0, (contentWidth - containerWidth) / 2);
    return Math.max(-halfExcess, Math.min(halfExcess, x));
  };

  const handleSharedPanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sharedPreviewScale <= sharedAutoFitScale) return;
    sharedViewportRef.current?.setPointerCapture(event.pointerId);
    sharedPanOriginRef.current = { x: event.clientX, panX: sharedPanX };
    setIsSharedPanning(true);
  };

  const handleSharedPanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSharedPanning || sharedPreviewScale <= sharedAutoFitScale) return;
    event.preventDefault();
    const dx = event.clientX - sharedPanOriginRef.current.x;
    setSharedPanX(clampSharedPanToBounds(sharedPanOriginRef.current.panX + dx));
  };

  const handleSharedPanEnd = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event?.pointerId !== undefined) {
      try {
        sharedViewportRef.current?.releasePointerCapture(event.pointerId);
      } catch {}
    }
    setIsSharedPanning(false);
  };

  useEffect(() => {
    const el = sharedScalingRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setSharedPreviewContentHeight(el.scrollHeight));
    obs.observe(el);
    setSharedPreviewContentHeight(el.scrollHeight);
    return () => obs.disconnect();
  }, []);

  const smartSummary = useMemo(() => buildSmartSummary(cvData, personalInfo), [cvData, personalInfo]);

  const isOwner = !!onLoadIntoEditor;

  // Fetch view stats for the owner only — no network call for other viewers.
  // Runs once on mount; no-ops gracefully if worker is unreachable.
  useEffect(() => {
    if (!isOwner || !shareId) return;
    let cancelled = false;
    fetchShareStats(shareId).then(stats => {
      if (!cancelled && stats) setShareStats(stats);
    });
    return () => { cancelled = true; };
  }, [isOwner, shareId]);

  const hasCoverLetter = !!(coverLetterText && coverLetterText.trim().length > 0);
  const hasContact = !!(personalInfo.email || personalInfo.phone || personalInfo.linkedin);

  const handleDownload = async () => {
    setDownloadError(null);
    setDownloadTotalMs(null);
    setDownloadVia(null);
    setDownloadStatus('Preparing download…');
    try {
      const fileName = `${personalInfo.name.replace(/\s+/g, '_')}_CV.pdf`;
      const result = await downloadCV({
        fileName,
        containerEl: previewRef.current,
        onStatus: (m) => setDownloadStatus(m),
        // Use the creator's watermark decision, not the viewer's own tier
        forceWatermark: procvBranding,
      });
      if (result.ok) {
        setDownloadTotalMs(result.totalMs ?? null);
        setDownloadVia(result.via ?? null);
        setDownloadStatus('PDF ready');
        await new Promise((r) => setTimeout(r, 2200));
        setDownloadStatus(null);
      } else {
        setDownloadStatus(null);
        setDownloadError(result.error || 'Download failed.');
      }
    } catch (err) {
      setDownloadStatus(null);
      setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      /* clipboard not available — silently ignore */
    }
  };

  const handleEmailContact = () => {
    if (!personalInfo.email) return;
    const subject = encodeURIComponent(`Re: Your CV — ${personalInfo.name}`);
    const body = encodeURIComponent(`Hi ${personalInfo.name.split(' ')[0]},\n\nI came across your CV and would love to connect.\n\nBest regards,`);
    window.open(`mailto:${personalInfo.email}?subject=${subject}&body=${body}`, '_blank');
  };

  const copyEmail = async () => {
    if (!personalInfo.email) return;
    await navigator.clipboard.writeText(personalInfo.email);
    setContactCopied(true);
    setTimeout(() => setContactCopied(false), 2000);
  };

  const formattedDate = (() => {
    try {
      return new Date(sharedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return sharedAt; }
  })();

  const initials = personalInfo.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-zinc-100 via-zinc-100 to-[#eeece5] dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950 overflow-y-auto overflow-x-hidden">

      {/* ── Header bar ── */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-[#1B2B4B]/8 dark:border-neutral-800 shadow-[0_1px_0_rgba(201,168,76,0.35)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">

          {/* Brand + Shared By */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-black text-[10px]">CV</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-[#1B2B4B] dark:text-zinc-100">ProCV</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:block">
                {personalInfo.name
                  ? <>{personalInfo.name.split(' ')[0]}&apos;s shared CV</>
                  : 'Shared CV'}
              </span>
            </div>
          </div>

          {/* Tab switcher (if cover letter) */}
          {hasCoverLetter && (
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-0.5">
              {(['cv', 'coverletter'] as const).map(doc => (
                <button
                  key={doc}
                  onClick={() => setActiveDoc(doc)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    activeDoc === doc
                      ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {doc === 'cv' ? '📄 CV' : '✉️ Cover Letter'}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Copy link */}
            <button
              onClick={handleCopyLink}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
                linkCopied
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400'
                  : 'bg-white dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
              }`}
              title="Copy shareable link"
            >
              {linkCopied ? (
                <>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span className="hidden sm:inline">Copy link</span>
                </>
              )}
            </button>

            {/* Download PDF */}
            <button
              onClick={handleDownload}
              disabled={!!downloadStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {downloadStatus ? (
                <><SpinnerIcon /><span className="hidden xs:inline">Saving…</span></>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </button>

            {isOwner && (
              <button
                onClick={onDismiss}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                title="Close preview"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + preview ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">

        {/* ── Candidate info sidebar ── */}
        <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0 flex flex-col gap-4 lg:sticky lg:top-24">

          {/* Avatar + name card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-bold text-lg">{initials || '?'}</span>
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-tight truncate">
                  {personalInfo.name}
                </h1>
                {cvData.experience?.[0]?.jobTitle && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    {cvData.experience[0].jobTitle}
                    {cvData.experience[0].company ? ` · ${cvData.experience[0].company}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-2">
              {personalInfo.email && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <span className="truncate">{personalInfo.email}</span>
                </div>
              )}
              {personalInfo.phone && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>{personalInfo.phone}</span>
                </div>
              )}
              {personalInfo.location && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>{personalInfo.location}</span>
                </div>
              )}
              {personalInfo.linkedin && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <a
                    href={personalInfo.linkedin.startsWith('http') ? personalInfo.linkedin : `https://${personalInfo.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-[#0A66C2] transition-colors"
                  >
                    LinkedIn
                  </a>
                </div>
              )}
            </div>

            {/* CTA buttons */}
            {hasContact && (
              <div className="mt-4 flex flex-col gap-2">
                {personalInfo.email && (
                  <button
                    onClick={handleEmailContact}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Contact Candidate
                  </button>
                )}
                {personalInfo.email && (
                  <button
                    onClick={copyEmail}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {contactCopied ? (
                      <><svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Email copied!</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy email</>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Smart Summary */}
          {smartSummary && (
            <div className="bg-gradient-to-br from-[#1B2B4B]/5 to-[#C9A84C]/5 dark:from-[#1B2B4B]/20 dark:to-[#C9A84C]/10 rounded-2xl border border-[#1B2B4B]/10 dark:border-[#C9A84C]/15 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-5 h-5 rounded-md bg-[#1B2B4B] dark:bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <p className="text-[10px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] uppercase tracking-wider">Smart Summary</p>
              </div>
              <p className={`text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed ${!summaryExpanded && smartSummary.length > 180 ? 'line-clamp-4' : ''}`}>
                {smartSummary}
              </p>
              {smartSummary.length > 180 && (
                <button
                  onClick={() => setSummaryExpanded(v => !v)}
                  className="mt-1.5 text-[10px] font-semibold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
                >
                  {summaryExpanded ? 'Show less ↑' : 'Read more ↓'}
                </button>
              )}
            </div>
          )}

          {/* Snapshot stats */}
          {(cvData.skills?.length > 0 || cvData.experience?.length > 0) && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-4">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">At a glance</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {cvData.experience?.length > 0 && (
                  <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg py-2">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{cvData.experience.length}</div>
                    <div className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium leading-tight">Roles</div>
                  </div>
                )}
                {cvData.skills?.length > 0 && (
                  <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg py-2">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{cvData.skills.length}</div>
                    <div className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium leading-tight">Skills</div>
                  </div>
                )}
                {cvData.education?.length > 0 && (
                  <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg py-2">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{cvData.education.length}</div>
                    <div className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium leading-tight">Degrees</div>
                  </div>
                )}
              </div>

              {/* Top skills */}
              {cvData.skills && cvData.skills.length > 0 && (
                <div className="mt-3">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Top skills</p>
                  <div className="flex flex-wrap gap-1">
                    {cvData.skills.slice(0, 8).map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 text-[10px] font-medium text-[#1B2B4B] dark:text-[#C9A84C]">
                        {skill}
                      </span>
                    ))}
                    {cvData.skills.length > 8 && (
                      <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-[10px] text-zinc-500">+{cvData.skills.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Shared date + ProCV badge */}
          <div className="text-center py-1">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
              Shared {formattedDate}
            </p>
            <a
              href={window.location.origin}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-600 hover:text-[#C9A84C] transition-colors"
            >
              Made with <span className="font-bold text-[#1B2B4B] dark:text-[#C9A84C]">ProCV</span>
            </a>
          </div>

          {/* Owner CTA — only the CV owner sees this */}
          {isOwner ? (
            <button
              onClick={() => { onLoadIntoEditor!(cvData); onDismiss(); }}
              className="text-xs text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] underline underline-offset-2 transition-colors text-center w-full"
            >
              Load this CV into your editor →
            </button>
          ) : (
            /* Visitor CTA — takes them to the ProCV landing page, not into the owner's account */
            <a
              href={window.location.origin}
              className="block text-center text-xs text-zinc-400 hover:text-[#C9A84C] transition-colors underline underline-offset-2"
            >
              Build your own CV free with ProCV →
            </a>
          )}
        </aside>

        {/* ── CV / Cover Letter preview panel ── */}
        <section className="flex-1 min-w-0 overflow-hidden">
          {downloadError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
              {downloadError}
            </div>
          )}

          {activeDoc === 'cv' ? (
            <div className="flex flex-col gap-3">
              {/* ── Zoom toolbar ── */}
              <div className="flex items-center justify-end">
                <div className="inline-flex items-center gap-0.5 bg-white dark:bg-neutral-900 rounded-full border border-zinc-200 dark:border-neutral-700 shadow-sm p-1">
                  <button
                    onClick={handleSharedZoomOut}
                    disabled={sharedPreviewScale <= SHARED_MIN_ZOOM}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-base font-bold"
                    title="Zoom out"
                  >−</button>
                  <button
                    onClick={handleSharedZoomReset}
                    title={sharedZoomOverride !== null ? 'Reset to fit' : 'Auto-fit'}
                    className="min-w-[52px] h-7 px-2.5 rounded-full text-[11px] font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-neutral-900 hover:opacity-85 transition-opacity"
                  >
                    {sharedZoomOverride !== null ? `${Math.round(sharedPreviewScale * 100)}%` : 'FIT'}
                  </button>
                  <button
                    onClick={handleSharedZoomIn}
                    disabled={sharedPreviewScale >= SHARED_MAX_ZOOM}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors text-base font-bold"
                    title="Zoom in"
                  >+</button>
                </div>
              </div>

              {/* Viewport container — panning past fit width is handled via JS
                  drag (handleSharedPanStart/Move/End), not native browser
                  scroll, which is unreliable for single-finger drag on mobile. */}
              <div
                ref={sharedPaperAreaRef}
                style={{
                  overflow: 'hidden',
                  position: 'relative',
                  touchAction: sharedPreviewScale > sharedAutoFitScale ? 'pan-y' : 'auto',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '0 16px 32px',
                }}>
                  {/* Width-constraining wrapper: layout width = 794 × scale px.
                      Drag/swipe handlers live here so the whole visible CV
                      area is grabbable. */}
                  <div
                    ref={sharedViewportRef}
                    style={{
                      width: `${Math.round(794 * sharedPreviewScale)}px`,
                      height: sharedPreviewContentHeight > 0
                        ? `${Math.round(sharedPreviewContentHeight * sharedPreviewScale)}px`
                        : undefined,
                      minHeight: 200,
                      overflow: 'visible',
                      flexShrink: 0,
                      position: 'relative',
                      cursor: sharedPreviewScale > sharedAutoFitScale ? (isSharedPanning ? 'grabbing' : 'grab') : 'default',
                      touchAction: sharedPreviewScale > sharedAutoFitScale ? 'none' : 'auto',
                    }}
                    onPointerDown={sharedPreviewScale > sharedAutoFitScale ? handleSharedPanStart : undefined}
                    onPointerMove={sharedPreviewScale > sharedAutoFitScale ? handleSharedPanMove : undefined}
                    onPointerUp={sharedPreviewScale > sharedAutoFitScale ? handleSharedPanEnd : undefined}
                    onPointerCancel={sharedPreviewScale > sharedAutoFitScale ? handleSharedPanEnd : undefined}
                  >
                    <div
                      ref={sharedScalingRef}
                      style={{
                        transform: `translate(${sharedPanX}px, 0px) scale(${sharedPreviewScale})`,
                        transformOrigin: 'top left',
                        width: 794,
                        boxShadow: '0 1px 2px rgba(27,43,75,0.06), 0 20px 45px -12px rgba(27,43,75,0.22)',
                        borderRadius: 4,
                      }}
                    >
                      <div ref={previewRef} data-cv-preview-active="true">
                        <CVPreview
                          cvData={cvData}
                          personalInfo={personalInfo}
                          template={template}
                          isEditing={false}
                          onDataChange={() => {}}
                          jobDescriptionForATS=""
                        />
                        {/* ProCV branding strip — shown on Free/BYOK shared CVs */}
                        {procvBranding && (
                          <div style={{
                            background: '#1B2B4B',
                            color: '#C9A84C',
                            textAlign: 'center',
                            padding: '8px 16px',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            fontFamily: 'DM Sans, sans-serif',
                          }}>
                            Made with{' '}
                            <a
                              href={window.location.origin}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#C9A84C', textDecoration: 'underline' }}
                            >
                              ProCV
                            </a>
                            {' '}— AI-powered CVs that get results
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-8 md:p-12">
              <div className="max-w-2xl mx-auto">
                <div className="mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Cover Letter</p>
                    <p className="text-xs text-zinc-500">{personalInfo.name}</p>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {coverLetterText}
                </pre>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Download progress modal — same as CVGenerator */}
      <DownloadProgressModal
        status={downloadStatus}
        totalMs={downloadTotalMs}
        via={downloadVia}
        onClose={() => setDownloadStatus(null)}
      />
    </div>
  );
};

export default SharedCVView;
