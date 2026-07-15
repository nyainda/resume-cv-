import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { cleanBulletHtml } from './templateUtils';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { truncate } from '../../utils/textTruncate';
import { formatEduDateRange } from '../../utils/cvDataUtils';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

// ─── palette ──────────────────────────────────────────────────────────────────
const ACCENT_DEFAULT = '#1E40AF';

// ─── content caps — keeps everything on one A4 page ───────────────────────────
const MAX_BULLETS_PER_ROLE  = 4;
const MAX_EXPERIENCE_ROLES  = 4;
const MAX_PROJECTS          = 3;
const MAX_BULLETS_PROJECT   = 2;
const SUMMARY_MAX_CHARS     = 340;

// ─── helpers ─────────────────────────────────────────────────────────────────
function isCurrentRole(dates?: string) {
  return /present|current|now|ongoing/i.test(dates ?? '');
}

function eduDateRange(startYear?: string, year?: string) {
  return formatEduDateRange(startYear, year);
}


// ─── inline contact icons (11px, for the header strip) ────────────────────────
const CIcon: React.FC<{ type: 'email' | 'phone' | 'linkedin' | 'github' | 'web' | 'loc' }> = ({ type }) => {
  const s: React.CSSProperties = { width: 10, height: 10, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' };
  const c = '#6b7280';
  if (type === 'email')    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>;
  if (type === 'phone')    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0112 18.72a19.5 19.5 0 01-4.9-4.9 19.79 19.79 0 01-3.07-8.63A2 2 0 015.82 4h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L10.09 11.8a16 16 0 006.11 6.11l1.06-1.06a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
  if (type === 'linkedin') return <svg style={s} viewBox="0 0 24 24" fill={c}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>;
  if (type === 'github')   return <svg style={s} viewBox="0 0 24 24" fill={c}><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.49.5.09.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 17.3 22 12c0-6.627-5.373-12-12-12z"/></svg>;
  if (type === 'loc')      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>;
};

// ─── Section headings ─────────────────────────────────────────────────────────
const SectionHead: React.FC<{ title: string; accent: string }> = ({ title, accent }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ fontSize: '8.5px', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {title}
    </div>
    <div style={{ borderTop: `1.5px solid ${accent}`, marginTop: 3, opacity: 0.45 }} />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const TemplateExecutiveEditorial: React.FC<TemplateProps> = ({
  cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS,
}) => {
  const accent = cvData.accentColor ?? ACCENT_DEFAULT;

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
        (e.currentTarget as HTMLElement).style.outline = `1.5px dashed ${accent}88`;
        (e.currentTarget as HTMLElement).style.outlineOffset = '2px';
        (e.currentTarget as HTMLElement).style.borderRadius = '2px';
        (e.currentTarget as HTMLElement).style.background = `${accent}11`;
      },
    };
  };

  // ── Contact strip ──────────────────────────────────────────────────────────
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

  // ── Custom sections ─────────────────────────────────────────────────────────
  const nonInterestCustom = (cvData.customSections ?? []).filter(
    s => !/interest|hobb/i.test(s.label) && s.items.some(i => i.title?.trim())
  );

  // ── Sliced data ──────────────────────────────────────────────────────────────
  const roles    = (cvData.experience ?? []).slice(0, MAX_EXPERIENCE_ROLES);
  const projects = (cvData.projects   ?? []).slice(0, MAX_PROJECTS);

  // ─────────────────────────────────────────────────────────────────────────────
  // LEFT COLUMN — Summary + Experience + long custom sections
  // ─────────────────────────────────────────────────────────────────────────────
  const Summary = () => !cvData.summary ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Professional Summary" accent={accent} />
      <p style={{ fontSize: '9px', color: '#374151', lineHeight: 1.55, margin: 0, fontFamily: "Georgia, 'Times New Roman', serif" }}
        {...editable(v => handleUpdate(d => { d.summary = v; }))}>
        {truncate(cvData.summary, SUMMARY_MAX_CHARS)}
      </p>
    </div>
  );

  const Experience = () => !roles.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Experience" accent={accent} />
      {roles.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: ei < roles.length - 1 ? 9 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.2 }}
              {...editable(v => handleUpdate(d => { d.experience[ei].jobTitle = v; }))}>
              {exp.jobTitle}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              {isCurrentRole(exp.dates) && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px #22c55e33', display: 'inline-block' }} />
              )}
              <span style={{ fontSize: '8px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif", whiteSpace: 'nowrap' }}
                {...editable(v => handleUpdate(d => { d.experience[ei].dates = v; }))}>
                {exp.dates}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
            <span style={{ fontSize: '8.5px', fontWeight: 600, color: accent, fontFamily: "Georgia, 'Times New Roman', serif" }}
              {...editable(v => handleUpdate(d => { d.experience[ei].company = v; }))}>
              {exp.company}
            </span>
            {exp.location && (
              <span style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0, whiteSpace: 'nowrap' }}>
                {exp.location}
              </span>
            )}
          </div>
          {exp.responsibilities?.length > 0 && (
            <ul style={{ margin: '3px 0 0', paddingLeft: 11, listStyleType: 'disc' }}>
              {exp.responsibilities.slice(0, MAX_BULLETS_PER_ROLE).map((r, ri) => (
                <li key={ri} style={{ fontSize: '8.5px', color: '#374151', lineHeight: 1.45, marginBottom: 1.5, fontFamily: "Georgia, 'Times New Roman', serif" }}
                  {...editable(v => handleUpdate(d => { d.experience[ei].responsibilities[ri] = v; }))}
                  dangerouslySetInnerHTML={{ __html: cleanBulletHtml(r) }}
                />
              ))}
            </ul>
          )}
          {ei < roles.length - 1 && (
            <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 8 }} />
          )}
        </div>
      ))}
    </div>
  );

  const LeftCustom = () => {
    const longOnes = nonInterestCustom.filter(sec => sec.items.some(i => (i.description?.length ?? 0) > 80));
    if (!longOnes.length) return null;
    return (
      <>
        {longOnes.map(sec => (
          <div key={sec.id} style={{ marginBottom: 11 }}>
            <SectionHead title={sec.label} accent={accent} />
            {sec.items.filter(i => i.title?.trim()).map((item, ii) => (
              <div key={ii} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{item.title}</span>
                  {item.year && <span style={{ fontSize: '8px', color: '#9ca3af', flexShrink: 0 }}>{item.year}</span>}
                </div>
                {item.subtitle && <div style={{ fontSize: '8.5px', color: accent, fontWeight: 600, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>{item.subtitle}</div>}
                {item.description && <div style={{ fontSize: '8.5px', color: '#374151', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.45, marginTop: 2 }}>{item.description}</div>}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RIGHT COLUMN — Skills + Education + Certs + Projects + Awards + etc.
  // ─────────────────────────────────────────────────────────────────────────────
  const Skills = () => !skills.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Skills" accent={accent} />
      {hasGroupedSkills ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {skillGroups.map((g, i) => (
            <div key={i}>
              {g.label && (
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", marginBottom: 1 }}>
                  {g.label}
                </div>
              )}
              <div style={{ fontSize: '8px', color: '#374151', lineHeight: 1.5, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {g.items}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '8px', color: '#374151', lineHeight: 1.6, fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {skills.join(' • ')}
        </div>
      )}
    </div>
  );

  const Education = () => !cvData.education?.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Education" accent={accent} />
      {cvData.education.map((edu, i) => {
        const dateRange = eduDateRange(edu.startYear, edu.year);
        return (
          <div key={i} style={{ marginBottom: 7, paddingBottom: 6, borderBottom: i < cvData.education.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
            {edu.degree && (
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
                {...editable(v => handleUpdate(d => { d.education[i].degree = v; }))}>
                {edu.degree}
              </div>
            )}
            <div style={{ fontSize: '8.5px', fontWeight: 600, color: accent, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}
              {...editable(v => handleUpdate(d => { d.education[i].school = v; }))}>
              {edu.school}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
              {edu.description && (
                <span style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif" }}>{edu.description}</span>
              )}
              {dateRange && (
                <span style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{dateRange}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const Certifications = () => !cvData.certifications?.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Certifications" accent={accent} />
      {cvData.certifications.map((c, i) => {
        const name   = typeof c === 'string' ? c : c.name;
        const issuer = typeof c !== 'string' ? c.issuer : null;
        const year   = typeof c !== 'string' ? c.year   : null;
        return (
          <div key={i} style={{ marginBottom: 5, paddingBottom: 5, borderBottom: i < cvData.certifications!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
            <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}>
              {name}
            </div>
            {(issuer || year) && (
              <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>
                {[issuer, year].filter(Boolean).join(' • ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const Projects = () => !projects.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Projects" accent={accent} />
      {projects.map((p, i) => (
        <div key={i} style={{ marginBottom: 7, paddingBottom: 6, borderBottom: i < projects.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
              {...editable(v => handleUpdate(d => { d.projects![i].name = v; }))}>
              {p.name}
            </span>
            {p.year && (
              <span style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{p.year}</span>
            )}
          </div>
          {/* bullets-first, description fallback */}
          {p.bullets?.length ? (
            <div style={{ marginTop: 2 }}>
              {p.bullets.slice(0, MAX_BULLETS_PROJECT).map((b, bi) => (
                <div key={bi} style={{ fontSize: '8px', color: '#374151', lineHeight: 1.4, marginTop: 2, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                  • {cleanBulletHtml(b)}
                </div>
              ))}
            </div>
          ) : p.description ? (
            <div style={{ fontSize: '8px', color: '#374151', lineHeight: 1.45, marginTop: 2, fontFamily: "Georgia, 'Times New Roman', serif" }}
              {...editable(v => handleUpdate(d => { d.projects![i].description = v; }))}>
              {truncate(p.description, 140)}
            </div>
          ) : null}
          {p.technologies?.length ? (
            <div style={{ marginTop: 2, fontSize: '7.5px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif" }}>
              <span style={{ fontWeight: 700 }}>Stack:</span> {p.technologies.slice(0, 6).join(', ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const Awards = () => !cvData.achievements?.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Awards" accent={accent} />
      {cvData.achievements.map((a, i) => (
        <div key={i} style={{ marginBottom: 5, paddingBottom: 5, borderBottom: i < cvData.achievements!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.25 }}
            {...editable(v => handleUpdate(d => { d.achievements![i] = v; }))}>
            {a}
          </div>
        </div>
      ))}
    </div>
  );

  const Publications = () => !cvData.publications?.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="Publications" accent={accent} />
      {cvData.publications.map((p, i) => (
        <div key={i} style={{ marginBottom: 5, paddingBottom: 5, borderBottom: i < cvData.publications!.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{p.title}</div>
          <div style={{ fontSize: '7.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>
            {[p.authors?.join(', '), p.journal, p.year].filter(Boolean).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );

  const References = () => !cvData.references?.length ? null : (
    <div style={{ marginBottom: 11 }}>
      <SectionHead title="References" accent={accent} />
      {cvData.references.map((r, i) => (
        <div key={i} style={{ marginBottom: 5 }}>
          <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.name}</div>
          <div style={{ fontSize: '8px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.title}</div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif" }}>{r.company}</div>
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
          <div key={sec.id} style={{ marginBottom: 11 }}>
            <SectionHead title={sec.label} accent={accent} />
            {sec.items.filter(i => i.title?.trim()).map((item, ii) => (
              <div key={ii} style={{ marginBottom: 5, paddingBottom: 5, borderBottom: ii < sec.items.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#111111', fontFamily: "Georgia, 'Times New Roman', serif" }}>{item.title}</span>
                  {item.year && <span style={{ fontSize: '7.5px', color: '#9ca3af', fontFamily: "Georgia, 'Times New Roman', serif", flexShrink: 0 }}>{item.year}</span>}
                </div>
                {item.subtitle && <div style={{ fontSize: '8px', color: accent, fontWeight: 600, fontFamily: "Georgia, 'Times New Roman', serif", marginTop: 1 }}>{item.subtitle}</div>}
                {item.description && <div style={{ fontSize: '7.5px', color: '#6b7280', fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.45, marginTop: 1 }}>{item.description}</div>}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER — full-width A4, no sidebar
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "Georgia, 'Times New Roman', serif",
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      width: '210mm',
      height: '297mm',
      overflow: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 28px 12px', flexShrink: 0 }}>
        {/* Name */}
        <div style={{
          fontSize: '28px', fontWeight: 900, color: '#0F172A',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          lineHeight: 1.05, fontFamily: "Georgia, 'Times New Roman', serif",
          marginBottom: 3,
        }}
          {...editable(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).name = v; }))}
        >
          {personalInfo.name || 'Your Name'}
        </div>

        {/* Title */}
        {personalInfo.title && (
          <div style={{
            fontSize: '9.5px', color: accent, fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            fontFamily: "Georgia, 'Times New Roman', serif", marginBottom: 8,
          }}
            {...editable(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).title = v; }))}
          >
            {personalInfo.title}
          </div>
        )}

        {/* Contact strip */}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 10 }}>
            {contacts.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CIcon type={c.type} />
                <span style={{ fontSize: '8px', color: '#4b5563', fontFamily: "Georgia, 'Times New Roman', serif", whiteSpace: 'nowrap' }}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Accent rule */}
        <div style={{ height: 2, background: `linear-gradient(to right, ${accent}, ${accent}33 80%, transparent)`, borderRadius: 1 }} />
      </div>

      {/* ── TWO CONTENT COLUMNS ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — Summary + Experience */}
        <div style={{ flex: '0 0 58%', padding: '10px 18px 16px 28px', borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <Summary />
          <Experience />
          <LeftCustom />
        </div>

        {/* RIGHT — Skills + Education + Certs + Projects + Awards */}
        <div style={{ flex: '0 0 42%', padding: '10px 24px 16px 16px', overflow: 'hidden' }}>
          <Skills />
          <Education />
          <Certifications />
          <Projects />
          <Awards />
          <Publications />
          <RightCustom />
          <References />
        </div>
      </div>

      {/* Hidden ATS keywords */}
      <HiddenATSKeywords jobDescription={jobDescriptionForATS} />
    </div>
  );
};

export default TemplateExecutiveEditorial;
