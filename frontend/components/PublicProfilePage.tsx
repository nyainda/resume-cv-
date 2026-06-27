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
}

// ── Component ─────────────────────────────────────────────────────────────────

const PublicProfilePage: React.FC<PublicProfilePageProps> = ({
  cvData,
  personalInfo,
  sharedAt,
  onViewCV,
  onDismiss,
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
  const visibleExp = showAllExp ? (cvData.experience ?? []) : (cvData.experience ?? []).slice(0, 3);
  const allSkills = cvData.skills ?? [];
  const visibleSkills = showAllSkills ? allSkills : allSkills.slice(0, 14);

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

  const hasLinkedIn = !!personalInfo.linkedin;
  const hasContact = !!(personalInfo.email || personalInfo.phone || hasLinkedIn);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-neutral-950 overflow-y-auto">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-neutral-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Brand */}
          <a
            href={window.location.origin}
            className="flex items-center gap-2 group"
          >
            <div className="w-7 h-7 rounded-lg bg-[#1B2B4B] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-[10px]">CV</span>
            </div>
            <span className="text-sm font-bold text-[#1B2B4B] dark:text-zinc-100 group-hover:text-[#C9A84C] transition-colors">ProCV</span>
          </a>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onViewCV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold transition-colors shadow-sm"
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

      {/* ── Body ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">

        {/* ── Hero Card ── */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
          {/* Gradient banner */}
          <div className="h-24 sm:h-32 bg-gradient-to-br from-[#1B2B4B] via-[#2d4272] to-[#1B2B4B] relative">
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, #C9A84C 0%, transparent 50%), radial-gradient(circle at 80% 20%, #C9A84C 0%, transparent 40%)',
            }} />
          </div>

          <div className="px-5 sm:px-8 pb-6 sm:pb-8">
            {/* Avatar */}
            <div className="-mt-10 sm:-mt-12 mb-4 flex items-end justify-between gap-3">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#C9A84C] to-[#a07a30] border-4 border-white dark:border-neutral-900 flex items-center justify-center shadow-lg flex-shrink-0">
                {personalInfo.photo ? (
                  <img src={personalInfo.photo} alt={personalInfo.name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="text-white font-black text-2xl sm:text-3xl">{initials}</span>
                )}
              </div>

              {/* Quick stats — desktop only */}
              <div className="hidden sm:flex items-center gap-3 pb-1">
                {yearsExp > 0 && (
                  <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{yearsExp}+</div>
                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wide leading-tight">Years exp.</div>
                  </div>
                )}
                {(cvData.experience?.length ?? 0) > 0 && (
                  <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{cvData.experience!.length}</div>
                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wide leading-tight">Roles</div>
                  </div>
                )}
                {allSkills.length > 0 && (
                  <div className="text-center px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
                    <div className="text-lg font-bold text-[#1B2B4B] dark:text-[#C9A84C]">{allSkills.length}</div>
                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wide leading-tight">Skills</div>
                  </div>
                )}
              </div>
            </div>

            {/* Name + headline */}
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
              {personalInfo.name}
            </h1>
            {(headline || company) && (
              <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
                {headline}{company ? <span className="text-zinc-400 dark:text-zinc-500"> · {company}</span> : null}
              </p>
            )}

            {/* Mobile stats row */}
            <div className="flex sm:hidden items-center gap-2 mt-3">
              {yearsExp > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/15 dark:border-[#C9A84C]/20">
                  {yearsExp}+ yrs exp.
                </span>
              )}
              {(cvData.experience?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-700">
                  {cvData.experience!.length} roles
                </span>
              )}
              {allSkills.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-700">
                  {allSkills.length} skills
                </span>
              )}
            </div>

            {/* Location + contact row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
              {personalInfo.location && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {personalInfo.location}
                </span>
              )}
              {personalInfo.email && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[220px]">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  {personalInfo.email}
                </span>
              )}
              {personalInfo.linkedin && (
                <a
                  href={personalInfo.linkedin.startsWith('http') ? personalInfo.linkedin : `https://${personalInfo.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#0A66C2] dark:text-blue-400 hover:underline"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  Website
                </a>
              )}
            </div>

            {/* Smart Summary */}
            {summary && (
              <div className="mt-5 p-4 rounded-xl bg-gradient-to-br from-[#1B2B4B]/5 to-[#C9A84C]/5 dark:from-[#1B2B4B]/20 dark:to-[#C9A84C]/10 border border-[#1B2B4B]/10 dark:border-[#C9A84C]/15">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded bg-[#1B2B4B] dark:bg-[#C9A84C]/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-white dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] uppercase tracking-wider">Smart Summary</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{summary}</p>
              </div>
            )}

            {/* CTA buttons */}
            {hasContact && (
              <div className="mt-5 flex flex-wrap gap-2">
                {personalInfo.email && (
                  <button
                    onClick={handleEmail}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-sm font-semibold transition-colors shadow-sm"
                  >
                    {emailSent ? (
                      <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Email opened!</>
                    ) : (
                      <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Contact</>
                    )}
                  </button>
                )}
                {personalInfo.email && (
                  <button
                    onClick={copyEmail}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {contactCopied ? (
                      <><svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
                    ) : (
                      <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy email</>
                    )}
                  </button>
                )}
                <button
                  onClick={onViewCV}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/8 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C]/15 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                  View Full CV
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column layout for timeline + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Career Timeline ── */}
          {(cvData.experience?.length ?? 0) > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5 sm:p-6">
              <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide mb-5 flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-base">💼</span>
                Career Timeline
              </h2>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-neutral-700" />
                <div className="space-y-6">
                  {visibleExp.map((exp, i) => (
                    <div key={exp.id ?? i} className="relative pl-7">
                      {/* Dot */}
                      <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-neutral-900 flex-shrink-0 ${i === 0 ? 'bg-[#C9A84C]' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-2 mb-1.5">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{exp.jobTitle}</h3>
                          <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold mt-0.5">{exp.company}</p>
                        </div>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap flex-shrink-0 sm:mt-0.5">
                          {formatDateRange(exp.startDate, exp.endDate)}
                        </span>
                      </div>
                      {/* Bullets — show up to 2 */}
                      {exp.responsibilities && (
                        <ul className="space-y-0.5">
                          {(Array.isArray(exp.responsibilities)
                            ? exp.responsibilities
                            : exp.responsibilities.split('\n').filter(Boolean)
                          ).slice(0, 2).map((bullet, bi) => (
                            <li key={bi} className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                              <span className="text-[#C9A84C] mt-1.5 flex-shrink-0 text-[6px]">●</span>
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
                  className="mt-4 ml-7 text-xs font-semibold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
                >
                  {showAllExp ? `Show less ↑` : `Show ${cvData.experience!.length - 3} more roles ↓`}
                </button>
              )}
            </div>
          )}

          {/* ── Sidebar: Skills + Education ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Skills */}
            {allSkills.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-base">⚡</span>
                  Skills
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {visibleSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#1B2B4B]/6 dark:bg-[#C9A84C]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#1B2B4B]/10 dark:border-[#C9A84C]/20"
                    >
                      {skill}
                    </span>
                  ))}
                  {allSkills.length > 14 && (
                    <button
                      onClick={() => setShowAllSkills(v => !v)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-neutral-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      {showAllSkills ? '↑ Less' : `+${allSkills.length - 14} more`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Education */}
            {(cvData.education?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm p-5">
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-base">🎓</span>
                  Education
                </h2>
                <div className="space-y-3">
                  {cvData.education!.map((edu, i) => (
                    <div key={edu.id ?? i} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5 text-[#1B2B4B] dark:text-[#C9A84C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-tight">{edu.degree}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{edu.school}</div>
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
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center text-base">🌐</span>
                  Languages
                </h2>
                <div className="space-y-1.5">
                  {cvData.languages!.map((lang, i) => (
                    <div key={lang.id ?? i} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{lang.name}</span>
                      {lang.proficiency && (
                        <span className="text-zinc-400 dark:text-zinc-500">{lang.proficiency}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center py-4 space-y-1">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">Profile shared {formattedDate}</p>
          <a
            href={window.location.origin}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-600 hover:text-[#C9A84C] transition-colors"
          >
            Build your own profile free with <span className="font-bold text-[#1B2B4B] dark:text-[#C9A84C]">ProCV</span> →
          </a>
        </div>
      </main>
    </div>
  );
};

export default PublicProfilePage;
