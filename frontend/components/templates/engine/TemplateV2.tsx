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

// ─── Smart density detection ──────────────────────────────────────────────────
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

// ─── CVHeader ────────────────────────────────────────────────────────────────
const CVHeader: React.FC<{
  pi: PersonalInfo; theme: TemplateTheme; sc: DensityScale;
  isEditing: boolean; onUpdate: (f: string, v: string) => void;
}> = ({ pi, theme, sc, isEditing, onUpdate }) => {
  const contacts = [
    pi.email, pi.phone, pi.location,
    pi.linkedin ? pi.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, 'in/') : null,
    pi.github   ? pi.github.replace(/https?:\/\/(www\.)?github\.com\//, 'github/') : null,
    pi.website,
  ].filter(Boolean) as string[];

  return (
    <div>
      {theme.accentBar && (
        <div style={{ height: 5, background: theme.accentBar }} />
      )}
      <div style={{ background: theme.headerBg, padding: theme.headerPadding, borderBottom: theme.headerBg === '#ffffff' ? `1px solid ${theme.borderColor}` : 'none' }}>
        <div
          style={{ fontSize: theme.headerNameSize, fontWeight: theme.headerNameWeight as any, color: theme.headerText, fontFamily: theme.fontHeading, lineHeight: 1.1, marginBottom: 5 }}
          {...editable(isEditing, v => onUpdate('name', v))}
        >
          {pi.name || 'Your Name'}
        </div>
        {pi.title && (
          <div
            style={{ fontSize: sc.metaSize, fontWeight: 600, color: theme.headerTitleColor, marginBottom: 8, fontFamily: theme.fontBody, letterSpacing: '0.02em' }}
            {...editable(isEditing, v => onUpdate('title', v))}
          >
            {pi.title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 0', marginTop: 2 }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ fontSize: sc.metaSize, color: theme.headerText, opacity: 0.7, fontFamily: theme.fontBody }}>
                {i > 0 && <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>}
                {c}
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

// ─── Section block ────────────────────────────────────────────────────────────
const Section: React.FC<{ children: React.ReactNode; sc: DensityScale }> = ({ children, sc }) => (
  <div style={{ marginBottom: sc.sectionGap }}>{children}</div>
);

// ─── Content sections ─────────────────────────────────────────────────────────

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

// ─── Sidebar section heading ──────────────────────────────────────────────────
const SidebarHead: React.FC<{ title: string; theme: TemplateTheme; sc: DensityScale }> = ({ title, theme, sc }) => (
  <div style={{ fontSize: sc.metaSize, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.accent, marginBottom: sc.bulletGap + 3, marginTop: 2, fontFamily: theme.fontHeading, borderBottom: `1px solid ${theme.accent}44`, paddingBottom: 3 }}>
    {title}
  </div>
);

// ─── Sidebar content blocks ───────────────────────────────────────────────────
const SidebarContent: React.FC<{ cvData: CVData; pi: PersonalInfo; theme: TemplateTheme; sc: DensityScale; showContact?: boolean }> = ({ cvData, pi, theme, sc, showContact }) => {
  const contacts = [pi.email, pi.phone, pi.location, pi.linkedin?.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, 'in/'), pi.github?.replace(/https?:\/\/(www\.)?github\.com\//, 'github/'), pi.website].filter(Boolean) as string[];

  return (
    <div style={{ padding: sc.sidebarPad }}>
      {showContact && contacts.length > 0 && (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Contact" theme={theme} sc={sc} />
          {contacts.map((c, i) => <div key={i} style={{ fontSize: sc.metaSize, color: theme.sidebarText, marginBottom: 3, fontFamily: theme.fontBody, wordBreak: 'break-all', lineHeight: sc.lineH }}>{c}</div>)}
        </div>
      )}
      {cvData.skills?.length > 0 && (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Skills" theme={theme} sc={sc} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {cvData.skills.map((s, i) => (
              <span key={i} style={{ fontSize: sc.tagSize, padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', color: theme.sidebarText, border: '1px solid rgba(255,255,255,0.15)', fontFamily: theme.fontBody }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {cvData.languages?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Languages" theme={theme} sc={sc} />
          {cvData.languages.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: sc.bodySize, color: theme.sidebarText, fontFamily: theme.fontBody }}>{l.name}</span>
              <span style={{ fontSize: sc.metaSize, color: theme.sidebarMuted, fontFamily: theme.fontBody }}>{l.proficiency}</span>
            </div>
          ))}
        </div>
      ) : null}
      {cvData.certifications?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Certifications" theme={theme} sc={sc} />
          {cvData.certifications.slice(0, 6).map((c, i) => {
            const name = typeof c === 'string' ? c : c.name;
            return <div key={i} style={{ fontSize: sc.metaSize, color: theme.sidebarText, marginBottom: 3, fontFamily: theme.fontBody, lineHeight: sc.lineH }}>{name}</div>;
          })}
        </div>
      ) : null}
      {cvData.achievements?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Highlights" theme={theme} sc={sc} />
          {cvData.achievements.slice(0, 4).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ color: theme.accent, fontSize: sc.metaSize, marginTop: '1px', flexShrink: 0 }}>★</span>
              <span style={{ fontSize: sc.metaSize, color: theme.sidebarText, lineHeight: sc.lineH, fontFamily: theme.fontBody }}>{a}</span>
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
}

const MainContent: React.FC<LayoutProps> = ({ cvData, theme, sc, isEditing, onChange }) => (
  <div style={{ padding: sc.bodyPad }}>
    <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
    <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
    <EducationSection  cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
    <ProjectsSection   cvData={cvData} theme={theme} sc={sc} />
    <PublicationsSection cvData={cvData} theme={theme} sc={sc} />
    <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} sc={sc} />
    <ReferencesSection cvData={cvData} theme={theme} sc={sc} />
  </div>
);

// ─── Layouts ──────────────────────────────────────────────────────────────────
const LayoutSingleColumn: React.FC<LayoutProps> = (props) => (
  <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
    <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
    <MainContent {...props} />
    <div style={{ padding: `0 ${props.sc.bodyPad.split(' ')[1] ?? '28px'} ${props.sc.sectionGap}px` }}>
      <SkillsSection        skills={props.cvData.skills} theme={props.theme} sc={props.sc} />
      <LanguagesSection     cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <CertificationsSection cvData={props.cvData} theme={props.theme} sc={props.sc} />
      <AchievementsSection  cvData={props.cvData} theme={props.theme} sc={props.sc} />
    </div>
  </div>
);

const LayoutSidebarLeft: React.FC<LayoutProps> = (props) => (
  <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
    <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
    <div style={{ display: 'flex', minHeight: '230mm' }}>
      <div style={{ width: props.theme.sidebarWidth, background: props.theme.sidebarBg, flexShrink: 0 }}>
        <SidebarContent cvData={props.cvData} pi={props.pi} theme={props.theme} sc={props.sc} />
      </div>
      <div style={{ flex: 1, borderLeft: `1px solid ${props.theme.borderColor}` }}>
        <MainContent {...props} sc={{ ...props.sc, bodyPad: props.sc.sidebarPad }} />
      </div>
    </div>
  </div>
);

const LayoutSidebarRight: React.FC<LayoutProps> = (props) => (
  <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
    <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing} onUpdate={() => {}} />
    <div style={{ display: 'flex', minHeight: '230mm' }}>
      <div style={{ flex: 1, borderRight: `1px solid ${props.theme.borderColor}` }}>
        <MainContent {...props} sc={{ ...props.sc, bodyPad: props.sc.sidebarPad }} />
      </div>
      <div style={{ width: props.theme.sidebarWidth, background: props.theme.sidebarBg, flexShrink: 0 }}>
        <SidebarContent cvData={props.cvData} pi={props.pi} theme={props.theme} sc={props.sc} showContact />
      </div>
    </div>
  </div>
);

const LayoutTwoColumn: React.FC<LayoutProps> = (props) => {
  const { theme, sc, cvData } = props;
  const sidePad = sc.sidebarPad;
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={theme} sc={sc} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ flex: 1, padding: sidePad, borderRight: `1px solid ${theme.borderColor}` }}>
          <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <ProjectsSection   cvData={cvData} theme={theme} sc={sc} />
          <PublicationsSection cvData={cvData} theme={theme} sc={sc} />
          <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} sc={sc} />
        </div>
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, padding: sidePad }}>
          {cvData.skills?.length > 0 && (
            <div style={{ marginBottom: sc.sectionGap }}>
              <SidebarHead title="Skills" theme={theme} sc={sc} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {cvData.skills.map((s, i) => <Tag key={i} label={s} theme={theme} sc={sc} />)}
              </div>
            </div>
          )}
          <EducationSection  cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <LanguagesSection  cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
          <CertificationsSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
          <AchievementsSection   cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
          <ReferencesSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} sc={sc} />
        </div>
      </div>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
const TemplateV2: React.FC<TemplateV2Props> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, themeId }) => {
  const theme = getTheme(themeId);
  const density = detectDensity(cvData);
  const sc = DENSITY_SCALES[density];

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
