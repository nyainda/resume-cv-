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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCurrentRole(dates?: string) {
  return /present|current|now|ongoing/i.test(dates ?? '');
}

function eduDateRange(startYear?: string, year?: string) {
  if (startYear && year && startYear !== year) return `${startYear} – ${year}`;
  return year ?? '';
}

// ─── Mini SVG icons for contact row ──────────────────────────────────────────
const Icon: React.FC<{ type: 'email' | 'phone' | 'loc' | 'linkedin' | 'github' | 'web'; c: string }> = ({ type, c }) => {
  const s: React.CSSProperties = { width: 10, height: 10, display: 'inline-block', verticalAlign: '-1px', marginRight: 4, flexShrink: 0, opacity: 0.7 };
  if (type === 'email') return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>;
  if (type === 'phone') return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.9 14.9 19.79 19.79 0 011.83 6.27 2 2 0 013.82 4h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 11.8a16 16 0 006.11 6.11l1.06-1.08a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
  if (type === 'loc')  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
  if (type === 'linkedin') return <svg style={s} viewBox="0 0 24 24" fill={c}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>;
  if (type === 'github')  return <svg style={s} viewBox="0 0 24 24" fill={c}><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.49.5.09.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>;
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>;
};

// ─── Main component ───────────────────────────────────────────────────────────
const TemplateExecutiveEditorial: React.FC<TemplateProps> = ({
  cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS,
}) => {
  const accent = cvData.accentColor ?? '#1B2B4B';

  // ── Inline-edit helper ─────────────────────────────────────────────────────
  const handleUpdate = useCallback((updater: (d: CVData) => void) => {
    const d: CVData = JSON.parse(JSON.stringify(cvData));
    updater(d);
    onDataChange(d);
  }, [cvData, onDataChange]);

  const ed = (onBlur: (v: string) => void): React.HTMLAttributes<HTMLElement> => {
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
        (e.currentTarget as HTMLElement).style.background = `${accent}08`;
      },
    };
  };

  // ── Contact items ──────────────────────────────────────────────────────────
  const contacts: { type: 'email' | 'phone' | 'loc' | 'linkedin' | 'github' | 'web'; label: string }[] = [
    ...(personalInfo.email    ? [{ type: 'email'    as const, label: personalInfo.email }] : []),
    ...(personalInfo.phone    ? [{ type: 'phone'    as const, label: personalInfo.phone }] : []),
    ...(personalInfo.linkedin ? [{ type: 'linkedin' as const, label: personalInfo.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, '').replace(/\/$/, '') }] : []),
    ...(personalInfo.github   ? [{ type: 'github'   as const, label: personalInfo.github.replace(/https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '') }] : []),
    ...(personalInfo.website  ? [{ type: 'web'      as const, label: personalInfo.website.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '') }] : []),
    ...(personalInfo.location ? [{ type: 'loc'      as const, label: personalInfo.location }] : []),
  ];

  // ── Section heading — editorial style: short accent bar ───────────────────
  const Heading: React.FC<{ title: string }> = ({ title }) => (
    <div style={{ marginBottom: 10, marginTop: 0 }}>
      <div style={{
        fontSize: '10px', fontWeight: 800, color: '#111111',
        textTransform: 'uppercase', letterSpacing: '0.15em',
        fontFamily: "'DM Sans', 'Inter', sans-serif",
      }}>
        {title}
      </div>
      <div style={{ width: 30, height: 2.5, background: accent, marginTop: 3.5 }} />
    </div>
  );

  // ── Bullet ─────────────────────────────────────────────────────────────────
  const Bullet: React.FC<{ text: string; path: (string | number)[] }> = ({ text, path }) => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'flex-start' }}>
      <span style={{ color: '#9ca3af', fontSize: '8px', marginTop: '2px', flexShrink: 0 }}>●</span>
      <span style={{ fontSize: '11px', color: '#374151', lineHeight: 1.55, flex: 1, fontFamily: "'DM Sans', 'Inter', sans-serif" }}
        {...ed(v => handleUpdate(d => {
          let cur: any = d;
          path.slice(0, -1).forEach(k => { cur = cur[k]; });
          cur[path[path.length - 1]] = v;
        }))}
        dangerouslySetInnerHTML={{ __html: cleanBulletHtml(text) }}
      />
    </div>
  );

  // ── Section divider ────────────────────────────────────────────────────────
  const Sep = () => <div style={{ borderTop: '1px solid #f0f0f0', margin: '14px 0' }} />;

  // ─────────────────────────────────────────────────────────────────────────
  // LEFT COLUMN SECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const LeftSummary = () => !cvData.summary ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Professional Summary" />
      <p style={{ fontSize: '11.5px', color: '#374151', lineHeight: 1.65, margin: 0, fontFamily: "'DM Sans', 'Inter', sans-serif" }}
        {...ed(v => handleUpdate(d => { d.summary = v; }))}>
        {cvData.summary}
      </p>
    </div>
  );

  const LeftExperience = () => !cvData.experience?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Experience" />
      {cvData.experience.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: ei < cvData.experience.length - 1 ? 14 : 0 }}>
          {/* Company + dates row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}
              {...ed(v => handleUpdate(d => { d.experience[ei].company = v; }))}>
              {exp.company}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isCurrentRole(exp.dates) && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px #22c55e33', display: 'inline-block' }} />
              )}
              <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif" }}
                {...ed(v => handleUpdate(d => { d.experience[ei].dates = v; }))}>
                {exp.dates}
              </span>
            </span>
          </div>
          {/* Role title */}
          {exp.jobTitle && (
            <div style={{ fontSize: '11px', color: accent, fontWeight: 600, fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1 }}
              {...ed(v => handleUpdate(d => { d.experience[ei].jobTitle = v; }))}>
              {exp.jobTitle}
            </div>
          )}
          {/* Location */}
          {exp.location && (
            <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginBottom: 4, marginTop: 1 }}
              {...ed(v => handleUpdate(d => { d.experience[ei].location = v; }))}>
              {exp.location}
            </div>
          )}
          {/* Bullets */}
          {exp.responsibilities?.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {exp.responsibilities.map((r, ri) => (
                <Bullet key={ri} text={r} path={['experience', ei, 'responsibilities', ri]} />
              ))}
            </div>
          )}
          {ei < cvData.experience.length - 1 && <Sep />}
        </div>
      ))}
    </div>
  );

  const LeftProjects = () => !cvData.projects?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Projects" />
      {cvData.projects.map((p, i) => (
        <div key={i} style={{ marginBottom: i < (cvData.projects?.length ?? 0) - 1 ? 12 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}
              {...ed(v => handleUpdate(d => { d.projects![i].name = v; }))}>
              {p.name}
            </span>
            {p.year && (
              <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", flexShrink: 0 }}
                {...ed(v => handleUpdate(d => { d.projects![i].year = v; }))}>
                {p.year}
              </span>
            )}
          </div>
          {p.description && (
            <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.55, marginTop: 2, fontFamily: "'DM Sans', 'Inter', sans-serif" }}
              {...ed(v => handleUpdate(d => { d.projects![i].description = v; }))}>
              {p.description}
            </div>
          )}
          {p.bullets?.map((b, bi) => <Bullet key={bi} text={b} path={['projects', i, 'bullets', bi]} />)}
          {p.technologies?.length ? (
            <div style={{ marginTop: 4, fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
              {p.technologies.join(' · ')}
            </div>
          ) : null}
          {p.link && (
            <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 2 }}>
              {p.link.replace(/^https?:\/\/(www\.)?/, '')}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const LeftEducation = () => !cvData.education?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Education" />
      {cvData.education.map((edu, i) => {
        const dateRange = eduDateRange(edu.startYear, edu.year);
        return (
          <div key={i} style={{ marginBottom: i < cvData.education.length - 1 ? 12 : 0 }}>
            {edu.degree && (
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.3 }}
                {...ed(v => handleUpdate(d => { d.education[i].degree = v; }))}>
                {edu.degree}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: '11px', color: accent, fontWeight: 600, fontFamily: "'DM Sans', 'Inter', sans-serif" }}
                {...ed(v => handleUpdate(d => { d.education[i].school = v; }))}>
                {edu.school}
              </span>
              {dateRange && (
                <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", flexShrink: 0 }}>
                  {dateRange}
                </span>
              )}
            </div>
            {edu.description && (
              <div style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: 2, fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.5 }}
                {...ed(v => handleUpdate(d => { d.education[i].description = v; }))}>
                {edu.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const LeftPublications = () => !cvData.publications?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Publications" />
      {cvData.publications.map((p, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{p.title}</div>
          <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1 }}>
            {[p.authors?.join(', '), p.journal, p.year].filter(Boolean).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RIGHT COLUMN SECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const RightCertifications = () => !cvData.certifications?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Certifications" />
      {cvData.certifications.map((c, i) => {
        const name   = typeof c === 'string' ? c : c.name;
        const issuer = typeof c !== 'string' ? c.issuer : null;
        const year   = typeof c !== 'string' ? c.year   : null;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.35 }}>{name}</div>
            {(issuer || year) && (
              <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1.5 }}>
                {[issuer, year].filter(Boolean).join(' · ')}
              </div>
            )}
            {i < cvData.certifications!.length - 1 && (
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 8 }} />
            )}
          </div>
        );
      })}
    </div>
  );

  // Skills — display grouped if skills contain a colon (e.g. "Languages: Python, JS")
  // otherwise show as a clean tag cloud
  const RightSkills = () => {
    const skills = cvData.skills;
    if (!skills?.length) return null;

    // Detect grouped format: "Category: skill1, skill2, ..."
    const groupPattern = /^(.+):\s*(.+)$/;
    const hasGroups = skills.some(s => groupPattern.test(s));

    if (hasGroups) {
      const groups: { label: string; items: string }[] = skills
        .map(s => {
          const m = s.match(groupPattern);
          return m ? { label: m[1].trim(), items: m[2].trim() } : { label: '', items: s.trim() };
        });
      return (
        <div style={{ marginBottom: 18 }}>
          <Heading title="Technical Skills" />
          {groups.map((g, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              {g.label && (
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#374151', fontFamily: "'DM Sans', 'Inter', sans-serif", marginBottom: 1.5 }}>
                  {g.label}
                </div>
              )}
              <div style={{ fontSize: '10.5px', color: '#6b7280', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.5 }}>
                {g.items}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 18 }}>
        <Heading title="Core Skills" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px' }}>
          {skills.map((s, i) => (
            <span key={i} style={{
              fontSize: '10px', padding: '2px 7px', borderRadius: '3px',
              background: '#f4f6f9', color: '#374151',
              border: '1px solid #e5e7eb', fontFamily: "'DM Sans', 'Inter', sans-serif",
              lineHeight: 1.5, whiteSpace: 'nowrap',
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const RightLanguages = () => !cvData.languages?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="Languages" />
      {cvData.languages.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: i < cvData.languages!.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{l.name}</span>
          <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{l.proficiency}</span>
        </div>
      ))}
    </div>
  );

  const RightAchievements = () => {
    const items = cvData.achievements;
    if (!items?.length) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <Heading title="Awards" />
        {items.map((a, i) => (
          <div key={i} style={{ marginBottom: 7 }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.35 }}
              {...ed(v => handleUpdate(d => { d.achievements![i] = v; }))}>
              {a}
            </div>
            {i < items.length - 1 && <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 7 }} />}
          </div>
        ))}
      </div>
    );
  };

  // Custom sections — filter promoted ones (handled above), route short ones to right column
  const PROMOTED = new Set(['certifications', 'achievements', 'awards', 'publications', 'skills', 'languages']);
  const customSections = (cvData.customSections ?? []).filter(
    sec => !PROMOTED.has(sec.type) && sec.items.some(item => item.title?.trim())
  );

  // Split custom sections: short (no description, or ≤80 chars) → right, long → left
  const shortCustom = customSections.filter(sec => sec.items.every(item => (item.description?.length ?? 0) <= 80));
  const longCustom  = customSections.filter(sec => sec.items.some(item => (item.description?.length ?? 0) > 80));

  const RightCustom = () => !shortCustom.length ? null : (
    <>
      {shortCustom.map(sec => (
        <div key={sec.id} style={{ marginBottom: 18 }}>
          <Heading title={sec.label} />
          {sec.items.filter(item => item.title?.trim()).map((item, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.35 }}>{item.title}</span>
                {item.year && <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", flexShrink: 0 }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: '10.5px', color: accent, fontWeight: 600, fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1 }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: '10.5px', color: '#6b7280', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.5, marginTop: 1 }}>{item.description}</div>}
            </div>
          ))}
        </div>
      ))}
    </>
  );

  const LeftCustom = () => !longCustom.length ? null : (
    <>
      {longCustom.map(sec => (
        <div key={sec.id} style={{ marginBottom: 18 }}>
          <Heading title={sec.label} />
          {sec.items.filter(item => item.title?.trim()).map((item, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{item.title}</span>
                {item.year && <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", flexShrink: 0 }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: '11px', color: accent, fontWeight: 600, fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1 }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: '11px', color: '#374151', fontFamily: "'DM Sans', 'Inter', sans-serif", lineHeight: 1.55, marginTop: 2 }}>{item.description}</div>}
              {item.link && <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 2 }}>{item.link}</div>}
            </div>
          ))}
        </div>
      ))}
    </>
  );

  const RightReferences = () => !cvData.references?.length ? null : (
    <div style={{ marginBottom: 18 }}>
      <Heading title="References" />
      {cvData.references.map((r, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#111111', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{r.name}</div>
          <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif", marginTop: 1 }}>{r.title}</div>
          <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{r.company}</div>
          {r.email && <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{r.email}</div>}
        </div>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Inter', sans-serif", background: '#ffffff', minHeight: '280mm', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '38px 44px 26px', background: '#ffffff' }}>
        {/* Name */}
        <div style={{
          fontSize: '36px', fontWeight: 900, color: '#111111',
          textTransform: 'uppercase', letterSpacing: '0.04em',
          lineHeight: 1.05, fontFamily: "'DM Sans', 'Inter', sans-serif",
          marginBottom: 6,
        }}
          {...ed(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).name = v; }))}
        >
          {personalInfo.name || 'Your Name'}
        </div>

        {/* Title */}
        {personalInfo.title && (
          <div style={{
            fontSize: '13.5px', color: accent, fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            fontFamily: "'DM Sans', 'Inter', sans-serif",
            marginBottom: 14,
          }}
            {...ed(v => handleUpdate(d => { if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any).title = v; }))}
          >
            {personalInfo.title}
          </div>
        )}

        {/* Thin rule */}
        {contacts.length > 0 && (
          <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: 10 }} />
        )}

        {/* Contact row */}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', color: '#6b7280', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
                <Icon type={c.type} c="#6b7280" />
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Thin accent rule below header */}
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 44px' }} />

      {/* ── BODY: two columns ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0 }}>

        {/* LEFT COLUMN — ~62% */}
        <div style={{ flex: '0 0 62%', padding: '28px 28px 32px 44px', borderRight: '1px solid #e5e7eb' }}>
          <LeftSummary />
          <LeftExperience />
          <LeftProjects />
          <LeftEducation />
          <LeftPublications />
          <LeftCustom />
        </div>

        {/* RIGHT COLUMN — ~38% */}
        <div style={{ flex: '0 0 38%', padding: '28px 36px 32px 24px' }}>
          <RightCertifications />
          <RightSkills />
          <RightLanguages />
          <RightAchievements />
          <RightCustom />
          <RightReferences />
        </div>
      </div>

      {/* Hidden ATS keywords */}
      <HiddenATSKeywords jobDescription={jobDescriptionForATS} />
    </div>
  );
};

export default TemplateExecutiveEditorial;
