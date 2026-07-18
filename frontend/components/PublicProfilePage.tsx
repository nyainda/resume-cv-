import React, { useState, useMemo } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import { buildSmartSummary } from './SharedCVView';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcYearsExp(experience: CVData['experience']): number {
  let totalMonths = 0;
  for (const exp of (experience ?? [])) {
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
  return Math.round(totalMonths / 12);
}

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) => {
    if (!d) return '';
    if (/present|current/i.test(d)) return 'Present';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    } catch { return d; }
  };
  const s = fmt(start);
  const e = fmt(end) || 'Present';
  return s ? `${s} – ${e}` : e;
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicProfilePageProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  onViewCV: () => void;
  onDismiss: () => void;
  /** Live tier check from the server — true unless the owner is on Premium. */
  procvBranding?: boolean;
}

// ── Stat Pill ─────────────────────────────────────────────────────────────────
function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
      <span className="text-xl font-black text-white leading-none">{value}</span>
      <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  cvData,
  personalInfo,
  sharedAt,
  onViewCV,
  onDismiss,
  procvBranding = true,
}) => {
  const [contactCopied, setContactCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showAllExp, setShowAllExp] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

  const summary = useMemo(() => buildSmartSummary(cvData, personalInfo), [cvData, personalInfo]);
  const yearsExp = useMemo(() => calcYearsExp(cvData.experience), [cvData.experience]);
  const initials = getInitials(personalInfo.name || '?');
  const latestRole = cvData.experience?.[0];
  const headline = latestRole?.jobTitle || '';
  const company = latestRole?.company || '';
  const fieldLabel = personalInfo.location ? personalInfo.location.split(',').pop()?.trim() : '';
  const visibleExp = showAllExp ? (cvData.experience ?? []) : (cvData.experience ?? []).slice(0, 3);
  const allSkills = cvData.skills ?? [];
  const visibleSkills = showAllSkills ? allSkills : allSkills.slice(0, 16);

  const formattedDate = (() => {
    try { return new Date(sharedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return sharedAt; }
  })();

  const copyEmail = async () => {
    if (!personalInfo.email) return;
    await navigator.clipboard.writeText(personalInfo.email);
    setContactCopied(true);
    setTimeout(() => setContactCopied(false), 2000);
  };

  const handleEmail = () => {
    if (!personalInfo.email) return;
    const sub = encodeURIComponent(`Re: Your profile — ${personalInfo.name}`);
    const body = encodeURIComponent(`Hi ${personalInfo.name.split(' ')[0]},\n\nI came across your profile and would love to connect.\n\nBest regards,`);
    window.open(`mailto:${personalInfo.email}?subject=${sub}&body=${body}`, '_blank');
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };

  const hasContact = !!(personalInfo.email || personalInfo.phone || personalInfo.linkedin);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f4f5f7] dark:bg-neutral-950 overflow-y-auto">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <a href={window.location.origin} className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-[#1B2B4B] flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-black text-[10px]">CV</span>
            </div>
            <span className="text-sm font-bold text-[#1B2B4B] dark:text-zinc-100 group-hover:text-[#C9A84C] transition-colors">ProCV</span>
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={onViewCV}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="hidden sm:inline">View CV</span>
              <span className="sm:hidden">CV</span>
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="relative bg-gradient-to-br from-[#1B2B4B] via-[#243660] to-[#1a2d52] overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#C9A84C]/15 blur-3xl" />
          <div className="absolute bottom-0 -left-20 w-72 h-48 rounded-full bg-[#C9A84C]/8 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 rounded-full bg-white/3 blur-2xl" />
          {/* Subtle grid */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)"/>
          </svg>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-10 sm:pb-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#C9A84C] via-[#d4b05a] to-[#a07a30] shadow-2xl flex items-center justify-center ring-4 ring-white/20">
                {personalInfo.photo ? (
                  <img src={personalInfo.photo} alt={personalInfo.name} className="w-full h-full object-cover rounded-[14px]" />
                ) : (
                  <span className="text-white font-black text-3xl sm:text-4xl drop-shadow">{initials}</span>
                )}
              </div>
            </div>

            {/* Name / headline */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
                {personalInfo.name}
              </h1>
              {(headline || company) && (
                <p className="mt-1 text-sm sm:text-base text-white/70 font-medium">
                  {headline}
                  {company && <span className="text-white/40"> · {company}</span>}
                  {fieldLabel && <span className="text-white/40"> · {fieldLabel}</span>}
                </p>
              )}
              {/* Tags row */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {personalInfo.location && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] text-white/75 font-medium">
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    {personalInfo.location}
                  </span>
                )}
                {personalInfo.email && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] text-white/75 font-medium max-w-[200px] truncate">
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {personalInfo.email}
                  </span>
                )}
                {personalInfo.linkedin && (
                  <a
                    href={personalInfo.linkedin.startsWith('http') ? personalInfo.linkedin : `https://${personalInfo.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0A66C2]/30 border border-[#0A66C2]/40 text-[11px] text-[#7ab8f5] font-medium hover:bg-[#0A66C2]/50 transition-colors"
                  >
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    LinkedIn
                  </a>
                )}
                {personalInfo.website && (
                  <a
                    href={personalInfo.website.startsWith('http') ? personalInfo.website : `https://${personalInfo.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] text-white/75 font-medium hover:bg-white/20 transition-colors"
                  >
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    Website
                  </a>
                )}
              </div>
            </div>

            {/* Stats — desktop */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0 self-end pb-0.5">
              {yearsExp > 0 && <StatPill value={`${yearsExp}+`} label="Yrs Exp." />}
              {(cvData.experience?.length ?? 0) > 0 && <StatPill value={cvData.experience!.length} label="Roles" />}
              {allSkills.length > 0 && <StatPill value={allSkills.length} label="Skills" />}
            </div>
          </div>

          {/* Stats — mobile */}
          <div className="flex sm:hidden items-center gap-2 mt-5">
            {yearsExp > 0 && <StatPill value={`${yearsExp}+`} label="Yrs Exp." />}
            {(cvData.experience?.length ?? 0) > 0 && <StatPill value={cvData.experience!.length} label="Roles" />}
            {allSkills.length > 0 && <StatPill value={allSkills.length} label="Skills" />}
          </div>

          {/* Action buttons */}
          {hasContact && (
            <div className="flex flex-wrap gap-2 mt-6">
              {personalInfo.email && (
                <button
                  onClick={handleEmail}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#d4b05a] text-[#1B2B4B] text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                  {emailSent ? (
                    <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Sent!</>
                  ) : (
                    <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Contact</>
                  )}
                </button>
              )}
              {personalInfo.email && (
                <button
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-semibold transition-all active:scale-95"
                >
                  {contactCopied ? (
                    <><svg className="w-4 h-4 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                  ) : (
                    <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy email</>
                  )}
                </button>
              )}
              <button
                onClick={onViewCV}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-semibold transition-all active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                View CV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

        {/* Smart Summary */}
        {summary && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <span className="text-[11px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] uppercase tracking-widest">Smart Summary</span>
            </div>
            <p className="text-sm sm:text-[15px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* ── Two-column layout: timeline + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* ── Career Timeline ── */}
          {(cvData.experience?.length ?? 0) > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-widest">Career Timeline</h2>
              </div>

              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-[#C9A84C] via-zinc-200 to-transparent dark:via-neutral-700" />
                <div className="space-y-7">
                  {visibleExp.map((exp, i) => (
                    <div key={exp.id ?? i} className="relative pl-7">
                      <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-neutral-900 shadow-sm flex-shrink-0 ${
                        i === 0 ? 'bg-[#C9A84C]' : 'bg-zinc-300 dark:bg-zinc-600'
                      }`} />
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{exp.jobTitle}</h3>
                          <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold mt-0.5">{exp.company}</p>
                        </div>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap flex-shrink-0 sm:mt-0.5 font-medium">
                          {formatDateRange(exp.startDate, exp.endDate)}
                        </span>
                      </div>
                      {exp.responsibilities && (
                        <ul className="space-y-1">
                          {(Array.isArray(exp.responsibilities)
                            ? exp.responsibilities
                            : exp.responsibilities.split('\n').filter(Boolean)
                          ).slice(0, 2).map((bullet, bi) => (
                            <li key={bi} className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                              <span className="text-[#C9A84C] mt-[5px] flex-shrink-0 text-[5px] leading-none">●</span>
                              <span>{typeof bullet === 'string' ? bullet.replace(/^[•\-\*]\s*/, '') : bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {(cvData.experience?.length ?? 0) > 3 && (
                <button
                  onClick={() => setShowAllExp(v => !v)}
                  className="mt-5 ml-7 inline-flex items-center gap-1 text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
                >
                  {showAllExp ? '↑ Show less' : `↓ Show ${cvData.experience!.length - 3} more roles`}
                </button>
              )}
            </div>
          )}

          {/* ── Sidebar: Skills + Education + Languages ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Skills */}
            {allSkills.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </div>
                  <h2 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-widest">Skills</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#1B2B4B]/6 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/10 dark:border-[#C9A84C]/20 hover:bg-[#1B2B4B]/10 dark:hover:bg-[#C9A84C]/18 transition-colors"
                    >
                      {skill}
                    </span>
                  ))}
                  {allSkills.length > 16 && (
                    <button
                      onClick={() => setShowAllSkills(v => !v)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 dark:bg-neutral-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors border border-zinc-200 dark:border-neutral-700"
                    >
                      {showAllSkills ? '↑ Less' : `+${allSkills.length - 16} more`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Education */}
            {(cvData.education?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                    </svg>
                  </div>
                  <h2 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-widest">Education</h2>
                </div>
                <div className="space-y-3.5">
                  {cvData.education!.map((edu, i) => (
                    <div key={edu.id ?? i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#1B2B4B]/6 dark:bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0 mt-0.5 border border-[#1B2B4B]/8 dark:border-[#C9A84C]/15">
                        <svg className="w-4 h-4 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-tight">{edu.degree}</div>
                        <div className="text-[11px] text-[#1B2B4B] dark:text-[#C9A84C] font-semibold mt-0.5">{edu.school}</div>
                        {edu.year && <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{edu.year}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {(cvData.languages?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1B2B4B] to-[#2d4272] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  </div>
                  <h2 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-widest">Languages</h2>
                </div>
                <div className="space-y-2">
                  {cvData.languages!.map((lang, i) => (
                    <div key={lang.id ?? i} className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{lang.name}</span>
                      {lang.proficiency && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400">{lang.proficiency}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center py-5 space-y-1.5 border-t border-zinc-200 dark:border-neutral-800 mt-2">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">Profile shared {formattedDate}</p>
          {procvBranding ? (
            <a
              href={window.location.origin}
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors"
            >
              <div className="w-4 h-4 rounded bg-[#1B2B4B] flex items-center justify-center">
                <span className="text-white font-black text-[7px]">CV</span>
              </div>
              Built with <span className="font-bold text-[#1B2B4B] dark:text-[#C9A84C]">ProCV</span> — free career toolkit →
            </a>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600">
              <svg className="w-3.5 h-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2L12 16.4 5.7 21l2.3-7.2-6-4.6h7.6z"/></svg>
              Premium profile
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicProfilePage;
