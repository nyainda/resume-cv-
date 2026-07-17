/**
 * ProfileSlidePanel — right-side slide-over drawer showing profile completeness,
 * key profile data, and quick actions.  Matches the "Build Your Profile" panel
 * from the CV Generator design spec (Screen 3 right side).
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '../types';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

// ── Completeness calculator ───────────────────────────────────────────────────
function computeCompletion(profile: UserProfile): { percent: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;
  const pi = profile.personalInfo ?? {};

  if ((pi as any).name)     score += 20; else missing.push('Name');
  if ((pi as any).email)    score += 8;  else missing.push('Email');
  if ((pi as any).phone)    score += 4;  else missing.push('Phone');
  if ((pi as any).location) score += 4;  else missing.push('Location');
  if ((pi as any).linkedin) score += 4;  else missing.push('LinkedIn');

  if (profile.summary?.trim().length > 40) score += 15; else missing.push('Summary (40+ chars)');

  const exp = profile.workExperience ?? [];
  if (exp.length >= 1) score += 20; else missing.push('Work experience');
  if (exp.length >= 2) score += 5;

  const edu = (profile as any).education ?? [];
  if (edu.length >= 1) score += 10; else missing.push('Education');

  const skills = profile.skills ?? [];
  if (skills.length >= 5)  score += 5;
  else if (skills.length >= 1) score += 3;
  else missing.push('Skills');

  return { percent: Math.min(100, score), missing };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SectionKey = 'personal' | 'experience' | 'education' | 'skills';

interface ProfileSlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  darkMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FieldRow: React.FC<{ icon: string; label: string; value?: string; placeholder?: string }> = ({
  icon, label, value, placeholder = '—',
}) => (
  <div className="flex items-start gap-2 py-2 border-b border-zinc-100 dark:border-neutral-700 last:border-0">
    <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-none mb-0.5">{label}</p>
      <p className={`text-xs leading-snug ${value ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-300 dark:text-zinc-600 italic'}`}>
        {value || placeholder}
      </p>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const ProfileSlidePanel: React.FC<ProfileSlidePanelProps> = ({
  isOpen,
  onClose,
  userProfile,
  darkMode,
}) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('personal');
  const dark = !!darkMode;

  const { percent, missing } = computeCompletion(userProfile);
  const pi = userProfile.personalInfo as any;
  const exp = userProfile.workExperience ?? [];
  const edu = ((userProfile as any).education ?? []) as any[];
  const skills = userProfile.skills ?? [];
  const summary = userProfile.summary ?? '';

  // Profile display name + initials
  const displayName = pi?.name || 'Your Profile';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || 'YP';

  // Derive a "current role" from first work experience
  const latestRole = exp[0];
  const roleTitle = latestRole?.title || latestRole?.role || latestRole?.jobTitle || '';
  const roleCompany = latestRole?.company || '';

  // Strength label
  const strength = percent >= 80 ? { label: 'Strong', color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' }
    : percent >= 55 ? { label: 'Good', color: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' }
    : percent >= 30 ? { label: 'Fair', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' }
    : { label: 'Incomplete', color: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' };

  const SECTIONS: { key: SectionKey; label: string; icon: string; complete: boolean }[] = [
    { key: 'personal',    label: 'Personal',    icon: '👤', complete: !!(pi?.name && pi?.email) },
    { key: 'experience',  label: 'Experience',  icon: '💼', complete: exp.length > 0 },
    { key: 'education',   label: 'Education',   icon: '🎓', complete: edu.length > 0 },
    { key: 'skills',      label: 'Skills',      icon: '⚡', complete: skills.length >= 3 },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed right-0 top-0 bottom-0 z-[201] w-full max-w-[420px] flex flex-col shadow-2xl"
            style={{
              background: dark ? '#111111' : '#FFFFFF',
              borderLeft: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#E5E7EB'}`,
            }}
          >

            {/* ── Header ───────────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
              style={{
                background: `linear-gradient(135deg, ${NAVY}, #243a65)`,
                borderColor: 'rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0"
                  style={{ background: GOLD, color: NAVY }}
                >
                  CV
                </div>
                <div>
                  <h2 className="text-sm font-black text-white leading-none">Build Your Profile</h2>
                  <p className="text-[10px] text-white/50 mt-0.5">The stronger your profile, the better the CV</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close panel"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Completion bar ────────────────────────────────────────── */}
            <div
              className="px-5 py-3 flex-shrink-0 border-b"
              style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Profile Completion</span>
                  <span className={`text-[10px] font-semibold flex items-center gap-1 ${strength.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${strength.dot}`} />
                    {strength.label}
                  </span>
                </div>
                <span className="text-sm font-black" style={{ color: GOLD }}>{percent}%</span>
              </div>
              {/* Bar */}
              <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-neutral-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${GOLD}, #b89740)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              {missing.length > 0 && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                  Missing: {missing.slice(0, 3).join(' · ')}{missing.length > 3 ? ` +${missing.length - 3} more` : ''}
                </p>
              )}
            </div>

            {/* ── Section tabs ──────────────────────────────────────────── */}
            <div
              className="flex flex-shrink-0 border-b overflow-x-auto no-scrollbar"
              style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }}
            >
              {SECTIONS.map((s) => {
                const isActive = activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className="flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2.5 px-2 relative transition-colors"
                    style={{ color: isActive ? GOLD : dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{s.icon}</span>
                      {s.complete && (
                        <svg className="w-2.5 h-2.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold">{s.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="profileTabIndicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                        style={{ background: GOLD }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Section content ───────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

              {/* Two-column layout: data (left) + mini preview card (right) */}
              <div className="flex flex-col h-full">

                {/* Data column */}
                <div className="p-5 space-y-1">

                  {/* Personal */}
                  {activeSection === 'personal' && (
                    <div>
                      <FieldRow icon="🪪" label="Full Name"    value={pi?.name}     placeholder="Not set — required" />
                      <FieldRow icon="✉️" label="Email"         value={pi?.email}    placeholder="Not set — required" />
                      <FieldRow icon="📱" label="Phone"         value={pi?.phone}    placeholder="Not set" />
                      <FieldRow icon="📍" label="Location"      value={pi?.location} placeholder="Not set" />
                      <FieldRow icon="🔗" label="LinkedIn"      value={pi?.linkedin} placeholder="Not set" />
                      <FieldRow icon="🌐" label="Website"       value={pi?.website}  placeholder="Not set" />
                      {summary && (
                        <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Summary</p>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">{summary}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Experience */}
                  {activeSection === 'experience' && (
                    <div>
                      {exp.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                          <span className="text-3xl">💼</span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No experience added yet</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Add your work history in the Profile tab</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {exp.map((e: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-snug">
                                    {e.title || e.role || e.jobTitle || 'Role'}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                                    {e.company || 'Company'}
                                    {(e.startDate || e.startYear) && (
                                      <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                                        · {e.startDate || e.startYear} – {e.endDate || e.endYear || 'Present'}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">#{i + 1}</span>
                              </div>
                              {e.responsibilities && e.responsibilities.length > 0 && (
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 leading-snug line-clamp-2">
                                  {e.responsibilities[0]}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Education */}
                  {activeSection === 'education' && (
                    <div>
                      {edu.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                          <span className="text-3xl">🎓</span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No education added yet</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Add your qualifications in the Profile tab</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {edu.map((e: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800"
                            >
                              <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 leading-snug">
                                {e.degree || e.qualification || 'Degree'}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                                {e.school || e.institution || 'School'}
                                {(e.graduationYear || e.endYear) && (
                                  <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                                    · {e.graduationYear || e.endYear}
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skills */}
                  {activeSection === 'skills' && (
                    <div>
                      {skills.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                          <span className="text-3xl">⚡</span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No skills added yet</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Add your skills in the Profile tab</p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-3">
                            {skills.length} skill{skills.length !== 1 ? 's' : ''} · ATS-Ready
                            {skills.length >= 10 && (
                              <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">✓</span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {skills.map((skill, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300"
                                style={i < 5 ? { background: `${GOLD}12`, borderColor: `${GOLD}40`, color: dark ? '#C9A84C' : NAVY } : {}}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                          {skills.length < 5 && (
                            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                              💡 Add at least 5 skills for better ATS matching
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Mini profile preview card ────────────────────────── */}
                <div
                  className="mx-5 mb-4 rounded-2xl p-4 flex-shrink-0 border"
                  style={{
                    background: `linear-gradient(135deg, ${NAVY}08, ${GOLD}08)`,
                    borderColor: `${GOLD}30`,
                  }}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500 mb-3">Profile Preview</p>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {pi?.photo ? (
                      <img
                        src={pi.photo}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2"
                        style={{ borderColor: GOLD }}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black"
                        style={{ background: `linear-gradient(135deg, ${NAVY}, #2d4a7a)`, color: GOLD }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-snug truncate">{displayName}</p>
                      {(roleTitle || roleCompany) && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug truncate">
                          {roleTitle}{roleTitle && roleCompany ? ' · ' : ''}{roleCompany}
                        </p>
                      )}
                      {pi?.location && (
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">📍 {pi.location}</p>
                      )}
                    </div>
                  </div>
                  {/* Strength indicators */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t" style={{ borderColor: `${GOLD}20` }}>
                    <div className="flex-1 text-center">
                      <p className="text-base font-black" style={{ color: GOLD }}>{exp.length}</p>
                      <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Jobs</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-base font-black" style={{ color: GOLD }}>{edu.length}</p>
                      <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Degrees</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-base font-black" style={{ color: GOLD }}>{skills.length}</p>
                      <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Skills</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ── Sticky footer ─────────────────────────────────────────── */}
            <div
              className="flex-shrink-0 px-5 py-4 border-t space-y-2"
              style={{
                borderColor: dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
                background: dark ? '#111111' : '#FFFFFF',
              }}
            >
              {percent < 80 && (
                <p className="text-[10px] text-center text-zinc-400 dark:text-zinc-500">
                  Go to <strong className="text-zinc-600 dark:text-zinc-300">Profile</strong> in the sidebar to fill in missing fields
                </p>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${NAVY}, #243a65)` }}
              >
                {percent >= 80 ? '✓ Profile Looks Good — Continue' : 'Continue with Current Profile'}
              </button>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProfileSlidePanel;
