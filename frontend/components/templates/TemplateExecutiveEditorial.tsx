import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { cleanBulletHtml } from './templateUtils';
import HiddenATSKeywords from '../HiddenATSKeywords';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

// ─── constants ────────────────────────────────────────────────────────────────
const SIDEBAR_BG   = '#1B2B4B';
const SIDEBAR_TEXT = '#CBD5E1';
const SIDEBAR_HEAD = '#FFFFFF';
const ACCENT       = '#1E40AF';

// ─── content caps — keeps everything on one A4 page ───────────────────────────
const MAX_BULLETS_PER_ROLE = 4;   // clamp long experience entries
const MAX_EXPERIENCE_ROLES = 4;   // never render more than 4 roles
const MAX_PROJECTS         = 3;   // right column can hold ~3 projects comfortably
const MAX_BULLETS_PROJECT  = 2;   // 2 bullets per project max
const SUMMARY_MAX_CHARS    = 320; // ~3 lines at 9px

// ─── helpers ─────────────────────────────────────────────────────────────────
function initials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
}

function profDots(p?: string): number {
  const map: Record<string, number> = {
    native: 5, fluent: 4, advanced: 4, professional: 4,
    intermediate: 3, conversational: 2, elementary: 1, basic: 1,
  };
  return map[(p ?? '').toLowerCase()] ?? 3;
}

function isCurrentRole(dates?: string) {
  return /present|current|now|ongoing/i.test(dates ?? '');
}

function eduDateRange(startYear?: string, year?: string) {
  if (startYear && year && startYear !== year) return `${startYear} – ${year}`;
  return year ?? '';
}

function truncate(text: string, max: number) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// ─── sidebar icons ────────────────────────────────────────────────────────────
const ContactIcon: React.FC<{ type: 'email' | 'phone' | 'linkedin' | 'github' | 'web' | 'loc' }> = ({ type }) => {
  const s: React.CSSProperties = { width: 11, height: 11, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' };
  const stroke = '#CBD5E1';
  if (type === 'email')    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>;
  if (type === 'phone')    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0112 18.72a19.5 19.5 0 01-4.9-4.9 19.79 19.79 0 01-3.07-8.63A2 2 0 015.82 4h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L10.09 11.8a16 16 0 006.11 6.11l1.06-1.06a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
  if (type === 'linkedin') return <svg style={s} viewBox="0 0 24 24" fill={stroke}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>;
  if (type === 'github')   return <svg style={s} viewBox="0 0 24 24" fill={stroke}><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.49.5.09.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>;
  if (type === 'loc')      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>;
};

// ─── Sidebar section heading ───────────────────────────────────────────────────
const SidebarHeading: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ marginBottom: 7 }}>
    <div style={{ fontSize: '8.5px', fontWeight: 800, color: SIDEBAR_HEAD, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {title}
    </div>
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 4 }} />
  </div>
);

// ─── Main area section heading ─────────────────────────────────────────────────
const MainHeading: React.FC<{ title: string; accent: string }> = ({ title, accent }) => (
  <div style={{ marginBottom: 7 }}>
    <div style={{ fontSize: '9px', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {title}
    </div>
    <div style={{ borderTop: `1.5px solid ${accent}`, marginTop: 3, opacity: 0.5 }} />
  </div>
);

// ─── Dot bar for language proficiency ─────────────────────────────────────────
const DotBar: React.FC<{ filled: number; total?: number; color: string }> = ({ filled, total = 5, color }) => (
  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        width: 6, height: 6, borderRadius: '50%',
        background: i < filled ? color : 'transparent',
        border: `1.5px solid ${color}`,
        flexShrink: 0,
      }} />
    ))}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const TemplateExecutiveEditorial: React.FC<TemplateProps> = ({
  cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS,
}) => {
  const userAccent = cvData.accentColor ?? ACCENT;

  const handleUpdate = useCallback((updater: (d: CVData) => void) => {
    const d: CVData = JSON.parse(JSON.stringify(cvData));
    updater(d);
    onDataChange(d);
  }, [cvData, onDataChange]);

  const editable = (onBlur: (v: string) => void): React.HTMLAttributes<HTMLElement> => {
    if (!isEditing) return {};
    return {
      contentEditable: true,
      suppressContentEditableWarning: true,
      onBlur: (e: React.FocusEvent<HTMLElement>) => onBlur(e.currentTarget.innerText.trim()),
      style: { outline: 'none', cursor: 'text' },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        (e.currentTarget as HTMLElement).style.outline = `1.5px dashed ${userAccent}88`;
        (e.currentTarget as HTMLElement).style.outlineOffset = '2px';
        (e.currentTarget as HTMLElement).style.borderRadius = '2px';
        (e.currentTarget as HTMLElement).style.background = `${userAccent}11`;
      },
    };
  };

  // ── Contact items ──────────────────────────────────────────────────────────
  const contacts: { type: 'email' | 'phone' | 'linkedin' | 'github' | 'web' | 'loc'; label: string }[] = [
    ...(personalInfo.email    ? [{ type: 'email'    as const, label: personalInfo.email }]    : []),
    ...(personalInfo.phone    ? [{ type: 'phone'    as const, label: personalInfo.phone }]    : []),
    ...(personalInfo.linkedin ? [{ type: 'linkedin' as const, label: personalInfo.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, '').replace(/\/$/, '') }] : []),
    ...(personalInfo.github   ? [{ type: 'github'   as const, label: personalInfo.github.replace(/https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '') }]   : []),
    ...(personalInfo.website  ? [{ type: 'web'      as const, label: personalInfo.website.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '') }]      : []),
    ...(personalInfo.location ? [{ type: 'loc'      as const, label: personalInfo.location }] : []),
  ];

  // ── Skills ─────────────────────────────────────────────────────────────────
  const skills = cvData.skills ?? [];
  const groupRe = /^(.+?):\s*(.+)$/;
  const hasGroupedSkills = skills.some(s => groupRe.test(s));
  const skillGroups: { label: string; items: string }[] = hasGroupedSkills
    ? skills.map(s => { const m = s.match(groupRe); return m ? { label: m[1].trim(), items: m[2].trim() } : { label: '', items: s }; })
    : [];

  // ── Interests ──────────────────────────────────────────────────────────────
  const interestSection = (cvData.customSections ?? []).find(s => /interest|hobb/i.test(s.label));
  const interests = interestSection?.items.filter(i => i.title?.trim()).map(i => i.title!) ?? [];
  const INTEREST_ICONS: Record<string, string> = {
    reading: '📚', hiking: '🥾', photography: '📷', traveling: '✈️', travel: '✈️',
    fitness: '🏋️', coffee: '☕', music: '🎵', cooking: '🍳', gaming: '🎮',
    cycling: '🚴', running: '🏃', swimming: '🏊', yoga: '🧘', art: '🎨',
    writing: '✍️', movies: '🎬', football: '⚽', tennis: '🎾', chess: '♟️',
  };
  function interestIcon(name: string) {
    return INTEREST_ICONS[name.toLowerCase().trim()] ?? '•';
  }

  const nonInterestCustom = (cvData.customSections ?? []).filter(
    s => !/interest|hobb/i.test(s.label) && s.items.some(i => i.title?.trim())
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR SECTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const SidebarContact = () => !contacts.length ? null : (
    <div style={{ marginBottom: 14 }}>
      <SidebarHeading title="Contact" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {contacts.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ marginTop: 1, flexShrink: 0 }}><ContactIcon type={c.type} /></span>
            <span style={{ fontSize: '8.5px', color: SIDEBAR_TEXT, lineHeight: 1.35, wordBreak: 'break-all', fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const SidebarSkills = () => !skills.length ? null : (
    <div style={{ marginBottom: 14 }}>
      <SidebarHeading title="Skills" />
      {hasGroupedSkills ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {skillGroups.map((g, i) => (
            <div key={i}>
              {g.label && (
                <div style={{ fontSize: '8px', fontWeight: 700, color: SIDEBAR_HEAD, fontFamily: "Georgia, 'Times New Roman', serif", marginBottom: 1 }}>
                  {g.label}
                </div>
              )}
              <div style={{ fontSize: '8px', color: SIDEBAR_TEXT, lineHeight: 1.5, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {g.items}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '8px', color: SIDEBAR_TEXT, lineHeight: 1.55, fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {skills.join(', ')}
        </div>
      )}
    </div>
  );

  const SidebarLanguages = () => !cvData.languages?.length ? null : (
    <div style={{ marginBottom: 14 }}>
      <SidebarHeading title="Languages" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cvData.languages.map((l, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '8.5px', color: SIDEBAR_HEAD, fontFamily: "Georgia, 'Times New Roman', serif" }}>{l.name}</span>
            <DotBar filled={profDots(l.proficiency)} color={SIDEBAR_TEXT} />
          </div>
        ))}
      </div>
    </div>
  );

  const SidebarInterests = () => !interests.length ? null : (
    <div style={{ marginBottom: 14 }}>
      <SidebarHeading title="Interests" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 4px' }}>
        {interests.slice(0, 6).map((name, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: '10px' }}>{interestIcon(name)}</span>
            <span style={{ fontSize: '8px', color: SIDEBAR_TEXT, fontFamily: "Georgia, 'Times New Roman', serif" }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CENTER COLUMN (Summary + Experience)
  // ─────────────────────────────────────────────────────────────────────────
  const CenterSummary = () => !cvData.summary ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Professional Summary" accent={userAccent} />
      <p style={{ fontSize: '9px', color: '#374151', lineHeight: 1.55, margin: 0, fontFamily: "Georgia, 'Times New Roman', serif" }}
        {...editable(v => handleUpdate(d => { d.summary = v; }))}>
        {truncate(cvData.summary, SUMMARY_MAX_CHARS)}
      </p>
    </div>
  );

  const roles = (cvData.experience ?? []).slice(0, MAX_EXPERIENCE_ROLES);

  const CenterExperience = () => !roles.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Experience" accent={userAccent} />
      {roles.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: ei < roles.length - 1 ? 10 : 0 }}>
          {/* Job title + Date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.2 }}
              {...editable(v => handleUpdate(d => { d.experience[ei].jobTitle = v; }))}>
              {exp.jobTitle}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              {isCurrentRole(exp.dates) && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px #22c55e33', display: 'inline-block' }} />
              )}
              <span style={{ fontSize: '8.5px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif", whiteSpace: 'nowrap' }}
                {...editable(v => handleUpdate(d => { d.experience[ei].dates = v; }))}>
                {exp.dates}
              </span>
            </span>
          </div>
          {/* Company */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
            <span style={{ fontSize: '9px', fontWeight: 600, color: userAccent, fontFamily: "Georgia, 'Times New Roman', serif" }}
              {...editable(v => handleUpdate(d => { d.experience[ei].company = v; }))}>
              {exp.company}
            </span>
            {exp.location && (
              <span style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0, whiteSpace: 'nowrap' }}>
                {exp.location}
              </span>
            )}
          </div>
          {/* Bullets — capped at MAX_BULLETS_PER_ROLE */}
          {exp.responsibilities?.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 12, listStyleType: 'disc' }}>
              {exp.responsibilities.slice(0, MAX_BULLETS_PER_ROLE).map((r, ri) => (
                <li key={ri} style={{ fontSize: '9px', color: '#374151', lineHeight: 1.45, marginBottom: 2, fontFamily: "Georgia, 'Times New Roman', serif" }}
                  {...editable(v => handleUpdate(d => { d.experience[ei].responsibilities[ri] = v; }))}
                  dangerouslySetInnerHTML={{ __html: cleanBulletHtml(r) }}
                />
              ))}
            </ul>
          )}
          {ei < roles.length - 1 && (
            <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 9 }} />
          )}
        </div>
      ))}
    </div>
  );

  const CenterCustom = () => {
    const longOnes = nonInterestCustom.filter(sec => sec.items.some(i => (i.description?.length ?? 0) > 80));
    if (!longOnes.length) return null;
    return (
      <>
        {longOnes.map(sec => (
          <div key={sec.id} style={{ marginBottom: 12 }}>
            <MainHeading title={sec.label} accent={userAccent} />
            {sec.items.filter(i => i.title?.trim()).map((item, ii) => (
              <div key={ii} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{item.title}</span>
                  {item.year && <span style={{ fontSize: '8.5px', color: '#9ca3af', flexShrink: 0 }}>{item.year}</span>}
                </div>
                {item.subtitle && <div style={{ fontSize: '9px', color: userAccent, fontWeight: 600, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>{item.subtitle}</div>}
                {item.description && <div style={{ fontSize: '9px', color: '#374151', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.45, marginTop: 2 }}>{item.description}</div>}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RIGHT COLUMN (Education, Certs, Projects, Awards)
  // ─────────────────────────────────────────────────────────────────────────
  const RightEducation = () => !cvData.education?.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Education" accent={userAccent} />
      {cvData.education.map((edu, i) => {
        const dateRange = eduDateRange(edu.startYear, edu.year);
        return (
          <div key={i} style={{ marginBottom: 8, paddingBottom: 7, borderBottom: i < cvData.education.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
            {edu.degree && (
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
                {...editable(v => handleUpdate(d => { d.education[i].degree = v; }))}>
                {edu.degree}
              </div>
            )}
            <div style={{ fontSize: '9px', fontWeight: 600, color: userAccent, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}
              {...editable(v => handleUpdate(d => { d.education[i].school = v; }))}>
              {edu.school}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
              {edu.description && (
                <span style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif" }}>{edu.description}</span>
              )}
              {dateRange && (
                <span style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{dateRange}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const RightCertifications = () => !cvData.certifications?.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Certifications" accent={userAccent} />
      {cvData.certifications.map((c, i) => {
        const name   = typeof c === 'string' ? c : c.name;
        const issuer = typeof c !== 'string' ? c.issuer : null;
        const year   = typeof c !== 'string' ? c.year   : null;
        return (
          <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < cvData.certifications!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
            <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}>
              {name}
            </div>
            {(issuer || year) && (
              <div style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>
                {[issuer, year].filter(Boolean).join(' • ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const projects = (cvData.projects ?? []).slice(0, MAX_PROJECTS);

  const RightProjects = () => !projects.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Projects" accent={userAccent} />
      {projects.map((p, i) => (
        <div key={i} style={{ marginBottom: 8, paddingBottom: 7, borderBottom: i < projects.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
              {...editable(v => handleUpdate(d => { d.projects![i].name = v; }))}>
              {p.name}
            </span>
            {p.year && (
              <span style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{p.year}</span>
            )}
          </div>
          {p.bullets?.length ? (
            <div style={{ marginTop: 2 }}>
              {p.bullets.slice(0, MAX_BULLETS_PROJECT).map((b, bi) => (
                <div key={bi} style={{ fontSize: '8.5px', color: '#374151', lineHeight: 1.4, marginTop: 2, fontFamily: "Georgia, 'Times New Roman', serif" }}>• {cleanBulletHtml(b)}</div>
              ))}
            </div>
          ) : p.description ? (
            <div style={{ fontSize: '8.5px', color: '#374151', lineHeight: 1.45, marginTop: 2, fontFamily: "Georgia, 'Times New Roman', serif" }}
              {...editable(v => handleUpdate(d => { d.projects![i].description = v; }))}>
              {truncate(p.description, 140)}
            </div>
          ) : null}
          {p.technologies?.length ? (
            <div style={{ marginTop: 3, fontSize: '8px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif" }}>
              <span style={{ fontWeight: 700 }}>Stack:</span> {p.technologies.slice(0, 6).join(', ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const RightAwards = () => !cvData.achievements?.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Awards" accent={userAccent} />
      {cvData.achievements.map((a, i) => (
        <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < cvData.achievements!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
            {...editable(v => handleUpdate(d => { d.achievements![i] = v; }))}>
            {a}
          </div>
        </div>
      ))}
    </div>
  );

  const RightPublications = () => !cvData.publications?.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="Publications" accent={userAccent} />
      {cvData.publications.map((p, i) => (
        <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < cvData.publications!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{p.title}</div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>
            {[p.authors?.join(', '), p.journal, p.year].filter(Boolean).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );

  const RightReferences = () => !cvData.references?.length ? null : (
    <div style={{ marginBottom: 12 }}>
      <MainHeading title="References" accent={userAccent} />
      {cvData.references.map((r, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.name}</div>
          <div style={{ fontSize: '8.5px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.title}</div>
          <div style={{ fontSize: '8.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.company}</div>
        </div>
      ))}
    </div>
  );

  const RightCustom = () => {
    const shortOnes = nonInterestCustom.filter(sec => sec.items.every(i => (i.description?.length ?? 0) <= 80));
    if (!shortOnes.length) return null;
    return (
      <>
        {shortOnes.map(sec => (
          <div key={sec.id} style={{ marginBottom: 12 }}>
            <MainHeading title={sec.label} accent={userAccent} />
            {sec.items.filter(i => i.title?.trim()).map((item, ii) => (
              <div key={ii} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: ii < sec.items.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{item.title}</span>
                  {item.year && <span style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{item.year}</span>}
                </div>
                {item.subtitle && <div style={{ fontSize: '8.5px', color: userAccent, fontWeight: 600, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>{item.subtitle}</div>}
                {item.description && <div style={{ fontSize: '8px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.45, marginTop: 1 }}>{item.description}</div>}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — fixed A4 height, overflow hidden = always one page
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "Georgia, 'Times New Roman', serif",
      background: '#ffffff',
      display: 'flex',
      width: '210mm',
      height: '297mm',
      overflow: 'hidden',           // hard A4 clip — nothing bleeds past this
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── DARK NAVY SIDEBAR ───────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 182px', width: '182px',
        background: SIDEBAR_BG,
        padding: '24px 16px 24px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        overflow: 'hidden',
      }}>
        {/* Avatar circle */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.35)',
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20, flexShrink: 0,
        }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: SIDEBAR_HEAD, letterSpacing: '0.04em', fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {initials(personalInfo.name)}
          </span>
        </div>

        {/* Sidebar sections */}
        <div style={{ width: '100%', overflow: 'hidden' }}>
          <SidebarContact />
          <SidebarSkills />
          <SidebarLanguages />
          <SidebarInterests />
        </div>
      </div>

      {/* ── WHITE MAIN AREA ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div style={{ padding: '22px 26px 14px', flexShrink: 0 }}>
          <div style={{
            fontSize: '26px', fontWeight: 900, color: '#0F172A',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            lineHeight: 1.05, fontFamily: "Georgia, 'Times New Roman', serif",
            marginBottom: 4,
          }}
            {...editable(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).name = v; }))}
          >
            {personalInfo.name || 'Your Name'}
          </div>

          {personalInfo.title && (
            <div style={{
              fontSize: '10px', color: userAccent, fontWeight: 600,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              fontFamily: "Georgia, 'Times New Roman', serif", marginBottom: 10,
            }}
              {...editable(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).title = v; }))}
            >
              {personalInfo.title}
            </div>
          )}

          <div style={{ borderTop: '1px solid #d1d5db' }} />
        </div>

        {/* ── TWO CONTENT COLUMNS ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>

          {/* CENTER COLUMN — Summary + Experience */}
          <div style={{ flex: '0 0 56%', padding: '2px 16px 16px 26px', borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <CenterSummary />
            <CenterExperience />
            <CenterCustom />
          </div>

          {/* RIGHT COLUMN — Education, Projects, Certs, Awards */}
          <div style={{ flex: '0 0 44%', padding: '2px 20px 16px 16px', overflow: 'hidden' }}>
            <RightEducation />
            <RightCertifications />
            <RightProjects />
            <RightAwards />
            <RightPublications />
            <RightCustom />
            <RightReferences />
          </div>
        </div>
      </div>

      {/* Hidden ATS keywords */}
      <HiddenATSKeywords jobDescription={jobDescriptionForATS} />
    </div>
  );
};

export default TemplateExecutiveEditorial;
