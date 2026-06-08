import React from 'react';
import { CVData, PersonalInfo, CustomSection, CustomSectionItem } from '../../../types';
import HiddenATSKeywords from '../../HiddenATSKeywords';
import { getTheme, TemplateTheme, ContentDensity, DensityScale, DENSITY_SCALES } from './templateThemes';

interface TemplateV2Props {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (d: CVData) => void;
  jobDescriptionForATS: string;
  themeId: string;
}

// ─── Smart content density detection ─────────────────────────────────────────
function detectDensity(cvData: CVData): ContentDensity {
  let score = 0;
  const expBullets = cvData.experience?.reduce((s, e) => s + (e.responsibilities?.length ?? 0), 0) ?? 0;
  score += (cvData.experience?.length ?? 0) * 3;
  score += Math.min(expBullets, 25);
  score += (cvData.education?.length ?? 0) * 2;
  score += Math.min(cvData.skills?.length ?? 0, 30) * 0.3;
  score += (cvData.projects?.length ?? 0) * 2;
  score += (cvData.customSections?.reduce((s, c) => s + c.items.length, 0) ?? 0);
  score += (cvData.publications?.length ?? 0) * 2;
  score += (cvData.certifications?.length ?? 0) * 0.7;
  score += (cvData.achievements?.length ?? 0) * 0.8;
  score += (cvData.references?.length ?? 0) * 1.5;
  if (score >= 38) return 'compact';
  if (score >= 20) return 'balanced';
  return 'spacious';
}

// ─── Smart section routing ─────────────────────────────────────────────────
interface SmartSplit {
  eduInSidebar: boolean;
  projectsInSidebar: boolean;
  achievementsInSidebar: boolean;
  refsInSidebar: boolean;
}

function computeSmartSplit(cvData: CVData): SmartSplit {
  const eduCount = cvData.education?.length ?? 0;
  const eduHasLongDesc = cvData.education?.some(e => (e.description?.length ?? 0) > 60) ?? false;
  const eduInSidebar = eduCount <= 2 && !eduHasLongDesc;

  const projCount = cvData.projects?.length ?? 0;
  const projHasLongDesc = cvData.projects?.some(p => (p.description?.length ?? 0) > 90) ?? false;
  const projHasLongTech = cvData.projects?.some(p => (p.technologies?.length ?? 0) > 4) ?? false;
  const projectsInSidebar = projCount <= 2 && !projHasLongDesc && !projHasLongTech;

  const achievementsInSidebar = (cvData.achievements?.length ?? 0) <= 5;
  const refsInSidebar = (cvData.references?.length ?? 0) <= 2;

  return { eduInSidebar, projectsInSidebar, achievementsInSidebar, refsInSidebar };
}

// ─── Font pairing map ─────────────────────────────────────────────────────────
const FONT_PAIRING_MAP: Record<string, { heading: string; body: string }> = {
  'inter':             { heading: "'Inter', sans-serif",                      body: "'Inter', sans-serif" },
  'playfair-dm':       { heading: "'Playfair Display', Georgia, serif",        body: "'DM Sans', sans-serif" },
  'georgia-open':      { heading: "Georgia, 'Times New Roman', serif",         body: "'Open Sans', sans-serif" },
  'mono-inter':        { heading: "'JetBrains Mono', 'Fira Code', monospace",  body: "'Inter', sans-serif" },
  'raleway-inter':     { heading: "'Raleway', sans-serif",                     body: "'Inter', sans-serif" },
  'merriweather-lato': { heading: "'Merriweather', Georgia, serif",            body: "'Lato', sans-serif" },
};

// ─── Inline-edit helper ───────────────────────────────────────────────────────
function editable(isEditing: boolean, onBlur: (v: string) => void): React.HTMLAttributes<HTMLElement> {
  if (!isEditing) return {};
  return {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => onBlur(e.currentTarget.innerText.trim()),
    style: { outline: 'none', cursor: 'text' },
  };
}

// ─── Contact icons ────────────────────────────────────────────────────────────
const ContactIcon: React.FC<{ type: 'email' | 'phone' | 'loc' | 'web' | 'linkedin' | 'github'; color: string }> = ({ type, color }) => {
  const s: React.CSSProperties = { width: 9, height: 9, flexShrink: 0, display: 'inline-block', verticalAlign: '-1px', marginRight: 3, opacity: 0.75 };
  if (type === 'email') return (
    <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
    </svg>
  );
  if (type === 'phone') return (
    <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.9 14.9a19.79 19.79 0 01-3.07-8.63A2 2 0 013.82 4h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 11.8a16 16 0 006.11 6.11l1.06-1.08a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
  if (type === 'loc') return (
    <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/>
    </svg>
  );
  if (type === 'web') return (
    <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
    </svg>
  );
  if (type === 'linkedin') return (
    <svg style={s} viewBox="0 0 24 24" fill={color}>
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>
    </svg>
  );
  if (type === 'github') return (
    <svg style={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.49.5.09.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  );
  return null;
};

// ─── Contact item ─────────────────────────────────────────────────────────────
interface ContactItem { type: 'email'|'phone'|'loc'|'linkedin'|'github'|'web'; label: string }

function buildContacts(pi: PersonalInfo): ContactItem[] {
  const items: ContactItem[] = [];
  if (pi.email)    items.push({ type: 'email',    label: pi.email });
  if (pi.phone)    items.push({ type: 'phone',    label: pi.phone });
  if (pi.location) items.push({ type: 'loc',      label: pi.location });
  if (pi.linkedin) items.push({ type: 'linkedin', label: pi.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, '').replace(/\/$/, '') });
  if (pi.github)   items.push({ type: 'github',   label: pi.github.replace(/https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '') });
  if (pi.website)  items.push({ type: 'web',      label: pi.website.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '') });
  return items;
}

// ─── CVHeader ─────────────────────────────────────────────────────────────────
const CVHeader: React.FC<{
  pi: PersonalInfo; theme: TemplateTheme; sc: DensityScale;
  isEditing: boolean; onUpdate: (f: string, v: string) => void;
}> = ({ pi, theme, sc, isEditing, onUpdate }) => {
  const contacts = buildContacts(pi);
  const isDark = theme.headerBg !== '#ffffff';

  return (
    <div>
      {theme.accentBar && <div style={{ height: 5, background: theme.accentBar }} />}
      <div style={{ background: theme.headerBg, padding: theme.headerPadding, borderBottom: !isDark ? `1px solid ${theme.borderColor}` : 'none' }}>
        <div
          style={{ fontSize: theme.headerNameSize, fontWeight: theme.headerNameWeight as any, color: theme.headerText, fontFamily: theme.fontHeading, lineHeight: 1.1, marginBottom: 4 }}
          {...editable(isEditing, v => onUpdate('name', v))}
        >
          {pi.name || 'Your Name'}
        </div>
        {pi.title && (
          <div
            style={{ fontSize: sc.bodySize, fontWeight: 600, color: theme.headerTitleColor, marginBottom: 7, fontFamily: theme.fontBody, letterSpacing: '0.02em' }}
            {...editable(isEditing, v => onUpdate('title', v))}
          >
            {pi.title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 3, marginTop: 2 }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', fontSize: sc.metaSize, color: theme.headerText, opacity: 0.8, fontFamily: theme.fontBody }}>
                <ContactIcon type={c.type} color={theme.headerText} />
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Section heading ──────────────────────────────────────────────────────────
const SectionHeading: React.FC<{ title: string; theme: TemplateTheme; sc: DensityScale }> = ({ title, theme, sc }) => {
  const base: React.CSSProperties = {
    fontFamily: theme.fontHeading,
    fontSize: theme.sectionSize,
    fontWeight: theme.sectionWeight as any,
    color: theme.sectionColor,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  };
  const wrap: React.CSSProperties = { marginBottom: sc.bulletGap + 6, marginTop: sc.sectionTopMargin };

  if (theme.sectionDecoration === 'caps-line') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...wrap }}>
      <span style={base}>{title}</span>
      <div style={{ flex: 1, height: 1, background: theme.borderColor }} />
    </div>
  );
  if (theme.sectionDecoration === 'border-left') return (
    <div style={{ borderLeft: `3px solid ${theme.sectionBorderColor}`, paddingLeft: 8, ...wrap }}>
      <span style={base}>{title}</span>
    </div>
  );
  if (theme.sectionDecoration === 'underline') return (
    <div style={{ borderBottom: `2px solid ${theme.sectionBorderColor}`, paddingBottom: 4, ...wrap }}>
      <span style={base}>{title}</span>
    </div>
  );
  if (theme.sectionDecoration === 'bar-bg') return (
    <div style={{ background: theme.sectionBorderColor + '18', padding: '4px 8px', borderRadius: 3, borderLeft: `3px solid ${theme.sectionBorderColor}`, ...wrap }}>
      <span style={base}>{title}</span>
    </div>
  );
  return <div style={{ ...base, ...wrap }}>{title}</div>;
};

// ─── Sidebar section heading ──────────────────────────────────────────────────
const SidebarHead: React.FC<{ title: string; theme: TemplateTheme; sc: DensityScale }> = ({ title, theme, sc }) => (
  <div style={{ fontSize: sc.metaSize, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.accent, marginBottom: sc.bulletGap + 4, marginTop: 2, fontFamily: theme.fontHeading, borderBottom: `1px solid ${theme.accent}44`, paddingBottom: 3 }}>
    {title}
  </div>
);

// ─── Bullet row ───────────────────────────────────────────────────────────────
const Bullet: React.FC<{ text: string; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onBlur: (v: string) => void }> = ({ text, theme, sc, isEditing, onBlur }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: sc.bulletGap, alignItems: 'flex-start' }}>
    <span style={{ color: theme.accent, fontSize: '8px', marginTop: '2.5px', flexShrink: 0, fontFamily: theme.fontBody }}>{theme.bulletChar}</span>
    <span style={{ fontSize: sc.bodySize, color: theme.bodyText, lineHeight: sc.lineH, fontFamily: theme.fontBody, flex: 1 }} {...editable(isEditing, onBlur)}>{text}</span>
  </div>
);

// ─── Tag chip ─────────────────────────────────────────────────────────────────
const Tag: React.FC<{ label: string; theme: TemplateTheme; sc: DensityScale }> = ({ label, theme, sc }) => (
  <span style={{ fontSize: sc.tagSize, padding: '2px 7px', borderRadius: theme.tagRadius, background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.tagBorder}`, fontFamily: theme.fontBody, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

// ─── Row meta ─────────────────────────────────────────────────────────────────
const RowMeta: React.FC<{ left: string; right?: string; sub?: string; theme: TemplateTheme; sc: DensityScale }> = ({ left, right, sub, theme, sc }) => (
  <div style={{ marginBottom: 2 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{left}</span>
      {right && <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, flexShrink: 0 }}>{right}</span>}
    </div>
    {sub && <div style={{ fontSize: sc.metaSize, color: theme.accent, fontWeight: 600, fontFamily: theme.fontBody, marginTop: 1 }}>{sub}</div>}
  </div>
);

// ─── Section block spacer ──────────────────────────────────────────────────────
const Section: React.FC<{ children: React.ReactNode; sc: DensityScale }> = ({ children, sc }) => (
  <div style={{ marginBottom: sc.sectionGap }}>{children}</div>
);

// ─── Content section components ───────────────────────────────────────────────

const SummarySection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing, onChange }) => {
  if (!cvData.summary) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Professional Summary" theme={theme} sc={sc} />
      <p style={{ fontSize: sc.bodySize, color: theme.bodyMuted, lineHeight: sc.lineH, margin: 0, fontFamily: theme.fontBody }}
        {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.summary = v; onChange(d); })}>
        {cvData.summary}
      </p>
    </Section>
  );
};

const ExperienceSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing, onChange }) => {
  if (!cvData.experience?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Experience" theme={theme} sc={sc} />
      {cvData.experience.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: sc.itemGap }}>
          <RowMeta left={exp.company} right={exp.dates} sub={exp.jobTitle} theme={theme} sc={sc} />
          {exp.location && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, marginBottom: 2 }}>{exp.location}</div>}
          <div style={{ marginTop: 3 }}>
            {exp.responsibilities.map((r, ri) => (
              <Bullet key={ri} text={r} theme={theme} sc={sc} isEditing={isEditing}
                onBlur={v => { const d = JSON.parse(JSON.stringify(cvData)); d.experience[ei].responsibilities[ri] = v; onChange(d); }} />
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
};

const EducationSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing, onChange }) => {
  if (!cvData.education?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Education" theme={theme} sc={sc} />
      {cvData.education.map((edu, i) => (
        <div key={i} style={{ marginBottom: sc.itemGap }}>
          <RowMeta left={edu.school} right={edu.year} sub={edu.degree} theme={theme} sc={sc} />
          {edu.description && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, marginTop: 2, fontFamily: theme.fontBody, lineHeight: sc.lineH }}>{edu.description}</div>}
        </div>
      ))}
    </Section>
  );
};

const ProjectsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.projects?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Projects" theme={theme} sc={sc} />
      {cvData.projects.map((p, i) => (
        <div key={i} style={{ marginBottom: sc.itemGap }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{p.name}</span>
            {p.year && <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{p.year}</span>}
          </div>
          {p.description && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, lineHeight: sc.lineH, marginTop: 2, fontFamily: theme.fontBody }}>{p.description}</div>}
          {p.technologies?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {p.technologies.map((t, ti) => <Tag key={ti} label={t} theme={theme} sc={sc} />)}
            </div>
          ) : null}
          {p.link && <div style={{ fontSize: sc.metaSize, color: theme.accent, marginTop: 2, fontFamily: theme.fontBody }}>{p.link}</div>}
        </div>
      ))}
    </Section>
  );
};

const SkillsSection: React.FC<{ skills: string[]; theme: TemplateTheme; sc: DensityScale }> = ({ skills, theme, sc }) => {
  if (!skills?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Skills" theme={theme} sc={sc} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 5px' }}>
        {skills.map((s, i) => <Tag key={i} label={s} theme={theme} sc={sc} />)}
      </div>
    </Section>
  );
};

const LanguagesSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.languages?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Languages" theme={theme} sc={sc} />
      {cvData.languages.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: sc.bodySize, fontFamily: theme.fontBody, color: theme.bodyText }}>{l.name}</span>
          <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{l.proficiency}</span>
        </div>
      ))}
    </Section>
  );
};

const CertificationsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.certifications?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Certifications" theme={theme} sc={sc} />
      {cvData.certifications.map((c, i) => {
        const name = typeof c === 'string' ? c : c.name;
        const meta = typeof c === 'string' ? null : [c.issuer, c.year].filter(Boolean).join(' · ');
        return (
          <div key={i} style={{ marginBottom: sc.bulletGap + 2 }}>
            <div style={{ fontSize: sc.bodySize, fontWeight: 600, color: theme.bodyText, fontFamily: theme.fontBody }}>{name}</div>
            {meta && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{meta}</div>}
          </div>
        );
      })}
    </Section>
  );
};

const AchievementsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.achievements?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Achievements" theme={theme} sc={sc} />
      {cvData.achievements.map((a, i) => (
        <Bullet key={i} text={a} theme={theme} sc={sc} isEditing={false} onBlur={() => {}} />
      ))}
    </Section>
  );
};

const PublicationsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.publications?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Publications" theme={theme} sc={sc} />
      {cvData.publications.map((p, i) => (
        <div key={i} style={{ marginBottom: sc.itemGap }}>
          <div style={{ fontSize: sc.bodySize, fontWeight: 600, color: theme.bodyText, fontFamily: theme.fontBody }}>{p.title}</div>
          <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{p.authors?.join(', ')} · {p.journal} · {p.year}</div>
          {p.link && <div style={{ fontSize: sc.metaSize, color: theme.accent, fontFamily: theme.fontBody }}>{p.link}</div>}
        </div>
      ))}
    </Section>
  );
};

const ReferencesSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.references?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="References" theme={theme} sc={sc} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {cvData.references.map((r, i) => (
          <div key={i} style={{ fontSize: sc.metaSize, fontFamily: theme.fontBody }}>
            <div style={{ fontWeight: 700, color: theme.bodyText }}>{r.name}</div>
            <div style={{ color: theme.bodyMuted }}>{r.title} · {r.company}</div>
            <div style={{ color: theme.accent }}>{r.email}</div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const CustomSectionsBlock: React.FC<{ sections: CustomSection[]; theme: TemplateTheme; sc: DensityScale }> = ({ sections, theme, sc }) => {
  if (!sections?.length) return null;
  return (
    <>
      {sections.map(sec => (
        <Section key={sec.id} sc={sc}>
          <SectionHeading title={sec.label} theme={theme} sc={sc} />
          {sec.items.map((item: CustomSectionItem, i) => (
            <div key={i} style={{ marginBottom: sc.itemGap }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{item.title}</span>
                {item.year && <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: sc.metaSize, color: theme.accent, fontWeight: 600, fontFamily: theme.fontBody }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, lineHeight: sc.lineH, marginTop: 2, fontFamily: theme.fontBody }}>{item.description}</div>}
              {item.link && <div style={{ fontSize: sc.metaSize, color: theme.accent, marginTop: 1, fontFamily: theme.fontBody }}>{item.link}</div>}
            </div>
          ))}
        </Section>
      ))}
    </>
  );
};

// ─── Sidebar content block ────────────────────────────────────────────────────
// No contact section here — contacts live ONLY in the header.
// Education and projects appear here when smart-split routes them in.
interface SidebarContentProps {
  cvData: CVData; pi: PersonalInfo;
  theme: TemplateTheme; sc: DensityScale;
  split: SmartSplit;
}

const SidebarContent: React.FC<SidebarContentProps> = ({ cvData, pi, theme, sc, split }) => {
  // Sidebar uses its own text colours to stay legible on coloured backgrounds
  const textColor = theme.sidebarText || theme.bodyText;
  const mutedColor = theme.sidebarMuted || theme.bodyMuted;

  return (
    <div style={{ padding: sc.sidebarPad }}>

      {/* Profile photo */}
      {theme.supportsPhoto && pi.photo && (
        <div style={{ textAlign: 'center', marginBottom: sc.sectionGap }}>
          <img
            src={pi.photo}
            alt={pi.name}
            style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', margin: '0 auto', display: 'block', border: `3px solid ${theme.accent}` }}
          />
        </div>
      )}

      {/* Skills */}
      {cvData.skills?.length > 0 && (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Skills" theme={theme} sc={sc} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {cvData.skills.map((s, i) => (
              <span key={i} style={{ fontSize: sc.tagSize, padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.12)', color: textColor, border: '1px solid rgba(255,255,255,0.18)', fontFamily: theme.fontBody }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {cvData.languages?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Languages" theme={theme} sc={sc} />
          {cvData.languages.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: sc.sidebarBodySize, fontWeight: 600, color: textColor, fontFamily: theme.fontBody }}>{l.name}</span>
              <span style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody }}>{l.proficiency}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Certifications */}
      {cvData.certifications?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Certifications" theme={theme} sc={sc} />
          {cvData.certifications.slice(0, 8).map((c, i) => {
            const name = typeof c === 'string' ? c : c.name;
            const meta = typeof c !== 'string' ? [c.issuer, c.year].filter(Boolean).join(' · ') : null;
            return (
              <div key={i} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 600, color: textColor, fontFamily: theme.fontBody, lineHeight: sc.lineH }}>{name}</div>
                {meta && <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody }}>{meta}</div>}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Education — only when smart-split says it's short enough */}
      {split.eduInSidebar && cvData.education?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Education" theme={theme} sc={sc} />
          {cvData.education.map((edu, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 700, color: textColor, fontFamily: theme.fontBody, lineHeight: 1.3 }}>{edu.school}</div>
              <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody, lineHeight: sc.lineH, marginTop: 1 }}>{edu.degree}</div>
              {edu.year && <div style={{ fontSize: sc.metaSize, color: theme.accent, fontFamily: theme.fontBody, marginTop: 1 }}>{edu.year}</div>}
            </div>
          ))}
        </div>
      ) : null}

      {/* Projects — only when smart-split says they're short enough */}
      {split.projectsInSidebar && cvData.projects?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Projects" theme={theme} sc={sc} />
          {cvData.projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 700, color: textColor, fontFamily: theme.fontBody }}>{p.name}</div>
              {p.description && <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody, lineHeight: sc.lineH, marginTop: 1 }}>{p.description}</div>}
              {p.technologies?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 4px', marginTop: 3 }}>
                  {p.technologies.slice(0, 3).map((t, ti) => (
                    <span key={ti} style={{ fontSize: sc.tagSize, color: theme.accent, fontFamily: theme.fontBody }}>#{t}</span>
                  ))}
                </div>
              ) : null}
              {p.link && <div style={{ fontSize: sc.metaSize, color: theme.accent, fontFamily: theme.fontBody, marginTop: 1 }}>{p.link}</div>}
            </div>
          ))}
        </div>
      ) : null}

      {/* Achievements — only when smart-split says they're short enough */}
      {split.achievementsInSidebar && cvData.achievements?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Highlights" theme={theme} sc={sc} />
          {cvData.achievements.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ color: theme.accent, fontSize: sc.metaSize, marginTop: '1px', flexShrink: 0 }}>★</span>
              <span style={{ fontSize: sc.sidebarBodySize, color: textColor, lineHeight: sc.lineH, fontFamily: theme.fontBody }}>{a}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* References (brief, only if ≤2) */}
      {split.refsInSidebar && cvData.references?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="References" theme={theme} sc={sc} />
          {cvData.references.map((r, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 700, color: textColor, fontFamily: theme.fontBody }}>{r.name}</div>
              <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody }}>{r.title}</div>
              <div style={{ fontSize: sc.metaSize, color: theme.accent, fontFamily: theme.fontBody }}>{r.company}</div>
            </div>
          ))}
        </div>
      ) : null}

    </div>
  );
};

// ─── Main content block ───────────────────────────────────────────────────────
interface LayoutProps {
  cvData: CVData; pi: PersonalInfo;
  theme: TemplateTheme; sc: DensityScale;
  isEditing: boolean; onChange: (d: CVData) => void;
  split?: SmartSplit; // sidebar layouts pass this to skip routed sections
  padOverride?: string;
}

const MainContent: React.FC<LayoutProps> = ({ cvData, theme, sc, isEditing, onChange, split, padOverride }) => (
  <div style={{ padding: padOverride ?? sc.bodyPad }}>
    <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
    <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
    {/* Education goes to main only when NOT in sidebar */}
    {!split?.eduInSidebar && <EducationSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />}
    {/* Projects go to main only when NOT in sidebar */}
    {!split?.projectsInSidebar && <ProjectsSection cvData={cvData} theme={theme} sc={sc} />}
    <PublicationsSection cvData={cvData} theme={theme} sc={sc} />
    <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} sc={sc} />
    {/* Achievements in main only when too many for sidebar */}
    {!split?.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={theme} sc={sc} />}
    {/* References in main only when too many for sidebar */}
    {!split?.refsInSidebar && <ReferencesSection cvData={cvData} theme={theme} sc={sc} />}
  </div>
);

// ─── Layouts ──────────────────────────────────────────────────────────────────
const LayoutSingleColumn: React.FC<LayoutProps> = (props) => (
  <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
    <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
    <div style={{ padding: props.sc.bodyPad }}>
      <SummarySection    cvData={props.cvData} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onChange={props.onChange} />
      <ExperienceSection cvData={props.cvData} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onChange={props.onChange} />
      <EducationSection  cvData={props.cvData} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onChange={props.onChange} />
      <ProjectsSection   cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <PublicationsSection cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <CustomSectionsBlock sections={props.cvData.customSections ?? []} theme={props.theme} sc={props.sc} />
      <SkillsSection        skills={props.cvData.skills} theme={props.theme} sc={props.sc} />
      <LanguagesSection     cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <CertificationsSection cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <AchievementsSection  cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <ReferencesSection   cvData={props.cvData} theme={props.theme} sc={props.sc} />
    </div>
  </div>
);

const LayoutSidebarLeft: React.FC<LayoutProps> = (props) => {
  const split = computeSmartSplit(props.cvData);
  return (
    <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ width: props.theme.sidebarWidth, background: props.theme.sidebarBg, flexShrink: 0 }}>
          <SidebarContent cvData={props.cvData} pi={props.pi} theme={props.theme} sc={props.sc} split={split} />
        </div>
        <div style={{ flex: 1, borderLeft: `1px solid ${props.theme.borderColor}` }}>
          <MainContent {...props} split={split} padOverride={props.sc.sidebarPad} />
        </div>
      </div>
    </div>
  );
};

const LayoutSidebarRight: React.FC<LayoutProps> = (props) => {
  const split = computeSmartSplit(props.cvData);
  return (
    <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ flex: 1, borderRight: `1px solid ${props.theme.borderColor}` }}>
          <MainContent {...props} split={split} padOverride={props.sc.sidebarPad} />
        </div>
        <div style={{ width: props.theme.sidebarWidth, background: props.theme.sidebarBg, flexShrink: 0 }}>
          <SidebarContent cvData={props.cvData} pi={props.pi} theme={props.theme} sc={props.sc} split={split} />
        </div>
      </div>
    </div>
  );
};

const LayoutTwoColumn: React.FC<LayoutProps> = (props) => {
  const { theme, sc, cvData } = props;
  const split = computeSmartSplit(cvData);
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={theme} sc={sc} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        {/* Main column: summary, experience, (projects if long), publications, custom */}
        <div style={{ flex: 1, padding: sc.sidebarPad, borderRight: `1px solid ${theme.borderColor}` }}>
          <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          {!split.projectsInSidebar && <ProjectsSection cvData={cvData} theme={theme} sc={sc} />}
          <PublicationsSection cvData={cvData} theme={theme} sc={sc} />
          <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} sc={sc} />
          {!split.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={theme} sc={sc} />}
          {!split.refsInSidebar && <ReferencesSection cvData={cvData} theme={theme} sc={sc} />}
        </div>
        {/* Side column: skills, education, languages, certs, (short projects), (achievements), (refs) */}
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, padding: sc.sidebarPad }}>
          {cvData.skills?.length > 0 && (
            <div style={{ marginBottom: sc.sectionGap }}>
              <SidebarHead title="Skills" theme={theme} sc={sc} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {cvData.skills.map((s, i) => <Tag key={i} label={s} theme={theme} sc={sc} />)}
              </div>
            </div>
          )}
          {/* Education always in right column for two-col */}
          <EducationSection  cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <LanguagesSection  cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
          <CertificationsSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
          {split.projectsInSidebar && <ProjectsSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />}
          {split.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />}
          {split.refsInSidebar && <ReferencesSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />}
        </div>
      </div>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
const TemplateV2: React.FC<TemplateV2Props> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, themeId }) => {
  let theme = { ...getTheme(themeId) };
  const density = detectDensity(cvData);
  const sc = DENSITY_SCALES[density];

  // Apply user accent-colour override
  if (cvData.accentColor) {
    const c = cvData.accentColor;
    theme = {
      ...theme,
      accent: c,
      sectionBorderColor: c,
      accentBar: theme.accentBar ? c : undefined,
      headerTitleColor: theme.headerBg === '#ffffff' ? c : theme.headerTitleColor,
      tagText: c,
      tagBg: c + '18',
      tagBorder: c + '44',
    };
  }

  // Apply user font-pairing override
  if (cvData.fontPairing && FONT_PAIRING_MAP[cvData.fontPairing]) {
    const fp = FONT_PAIRING_MAP[cvData.fontPairing];
    theme = { ...theme, fontHeading: fp.heading, fontBody: fp.body };
  }

  const layoutProps: LayoutProps = { cvData, pi: personalInfo, theme, sc, isEditing, onChange: onDataChange };

  const Layout = {
    'single-col':    LayoutSingleColumn,
    'sidebar-left':  LayoutSidebarLeft,
    'sidebar-right': LayoutSidebarRight,
    'two-col':       LayoutTwoColumn,
  }[theme.layout] ?? LayoutSingleColumn;

  return (
    <div style={{ fontFamily: theme.fontBody, WebkitFontSmoothing: 'antialiased' }}>
      <Layout {...layoutProps} />
      <HiddenATSKeywords jobDescription={jobDescriptionForATS} />
    </div>
  );
};

export default TemplateV2;
