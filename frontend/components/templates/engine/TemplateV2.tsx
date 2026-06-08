import React, { useCallback } from 'react';
import { CVData, PersonalInfo, CustomSection, CustomSectionItem } from '../../../types';
import HiddenATSKeywords from '../../HiddenATSKeywords';
import { getTheme, TemplateTheme } from './templateThemes';

interface TemplateV2Props {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (d: CVData) => void;
  jobDescriptionForATS: string;
  themeId: string;
}

// ─── Tiny inline-edit helper ─────────────────────────────────────────────────
function editable(
  isEditing: boolean,
  onBlur: (v: string) => void
): React.HTMLAttributes<HTMLElement> {
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
  pi: PersonalInfo; theme: TemplateTheme;
  isEditing: boolean; onUpdate: (field: string, v: string) => void;
}> = ({ pi, theme, isEditing, onUpdate }) => {
  const contacts = [
    pi.email, pi.phone, pi.location,
    pi.linkedin ? pi.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, '') : null,
    pi.github ? pi.github.replace(/https?:\/\/(www\.)?github\.com\//, 'github/') : null,
    pi.website,
  ].filter(Boolean) as string[];

  return (
    <div style={{ background: theme.headerBg, padding: theme.headerPadding }}>
      <div
        style={{ fontSize: theme.headerNameSize, fontWeight: theme.headerNameWeight, color: theme.headerText, fontFamily: theme.fontHeading, lineHeight: 1.1, marginBottom: 6 }}
        {...editable(isEditing, v => onUpdate('name', v))}
      >
        {pi.name || 'Your Name'}
      </div>
      {pi.title && (
        <div
          style={{ fontSize: '13px', fontWeight: 500, color: theme.headerTitleColor, marginBottom: 10, fontFamily: theme.fontBody, letterSpacing: '0.02em' }}
          {...editable(isEditing, v => onUpdate('title', v))}
        >
          {pi.title}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
        {contacts.map((c, i) => (
          <span key={i} style={{ fontSize: '9.5px', color: theme.headerText, opacity: 0.75, fontFamily: theme.fontBody }}>
            {i > 0 && <span style={{ marginRight: 14, opacity: 0.4 }}>|</span>}
            {c}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── SectionHeading ──────────────────────────────────────────────────────────
const SectionHeading: React.FC<{ title: string; theme: TemplateTheme }> = ({ title, theme }) => {
  const base: React.CSSProperties = {
    fontFamily: theme.fontHeading,
    fontSize: theme.sectionSize,
    fontWeight: theme.sectionWeight as any,
    color: theme.sectionColor,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 8,
    marginTop: 2,
  };

  if (theme.sectionDecoration === 'caps-line') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 2 }}>
        <span style={base}>{title}</span>
        <div style={{ flex: 1, height: 1, background: theme.borderColor }} />
      </div>
    );
  }
  if (theme.sectionDecoration === 'border-left') {
    return (
      <div style={{ borderLeft: `3px solid ${theme.sectionBorderColor}`, paddingLeft: 8, marginBottom: 10, marginTop: 2 }}>
        <span style={base}>{title}</span>
      </div>
    );
  }
  if (theme.sectionDecoration === 'underline') {
    return (
      <div style={{ borderBottom: `2px solid ${theme.sectionBorderColor}`, paddingBottom: 5, marginBottom: 10, marginTop: 2 }}>
        <span style={base}>{title}</span>
      </div>
    );
  }
  if (theme.sectionDecoration === 'bar-bg') {
    return (
      <div style={{ background: theme.sectionBorderColor + '18', padding: '4px 8px', borderRadius: 3, marginBottom: 10, marginTop: 2, borderLeft: `3px solid ${theme.sectionBorderColor}` }}>
        <span style={base}>{title}</span>
      </div>
    );
  }
  return <div style={{ ...base, marginBottom: 10, marginTop: 2 }}>{title}</div>;
};

// ─── Bullet list ─────────────────────────────────────────────────────────────
const Bullet: React.FC<{ text: string; theme: TemplateTheme; isEditing: boolean; onBlur: (v: string) => void }> = ({ text, theme, isEditing, onBlur }) => (
  <div style={{ display: 'flex', gap: 5, marginBottom: 2.5, alignItems: 'flex-start' }}>
    <span style={{ color: theme.accent, fontSize: '9px', marginTop: '2.5px', flexShrink: 0, fontFamily: theme.fontBody }}>{theme.bulletChar}</span>
    <span style={{ fontSize: '9.5px', color: theme.bodyText, lineHeight: 1.5, fontFamily: theme.fontBody, flex: 1 }} {...editable(isEditing, onBlur)}>{text}</span>
  </div>
);

// ─── Tag chip ─────────────────────────────────────────────────────────────────
const Tag: React.FC<{ label: string; theme: TemplateTheme }> = ({ label, theme }) => (
  <span style={{ fontSize: '8.5px', padding: '2px 7px', borderRadius: theme.tagRadius, background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.tagBorder}`, fontFamily: theme.fontBody, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

// ─── Row meta (company/school + dates) ───────────────────────────────────────
const RowMeta: React.FC<{ left: string; right?: string; sub?: string; theme: TemplateTheme }> = ({ left, right, sub, theme }) => (
  <div style={{ marginBottom: 1 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{left}</span>
      {right && <span style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody, flexShrink: 0 }}>{right}</span>}
    </div>
    {sub && <div style={{ fontSize: '9px', color: theme.accent, fontWeight: 600, fontFamily: theme.fontBody, marginTop: 1 }}>{sub}</div>}
  </div>
);

// ─── Section wrapper (adds bottom margin) ─────────────────────────────────────
const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginBottom: 14 }}>{children}</div>
);

// ─── Experience ───────────────────────────────────────────────────────────────
const ExperienceSection: React.FC<{ cvData: CVData; theme: TemplateTheme; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, isEditing, onChange }) => {
  if (!cvData.experience?.length) return null;
  return (
    <Section>
      <SectionHeading title="Experience" theme={theme} />
      {cvData.experience.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: 10 }}>
          <RowMeta left={exp.company} right={exp.dates} sub={exp.jobTitle} theme={theme} />
          {exp.location && <div style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody, marginBottom: 2 }}>{exp.location}</div>}
          <div style={{ marginTop: 3 }}>
            {exp.responsibilities.map((r, ri) => (
              <Bullet key={ri} text={r} theme={theme} isEditing={isEditing}
                onBlur={v => {
                  const d = JSON.parse(JSON.stringify(cvData));
                  d.experience[ei].responsibilities[ri] = v;
                  onChange(d);
                }} />
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
};

// ─── Education ────────────────────────────────────────────────────────────────
const EducationSection: React.FC<{ cvData: CVData; theme: TemplateTheme; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, isEditing, onChange }) => {
  if (!cvData.education?.length) return null;
  return (
    <Section>
      <SectionHeading title="Education" theme={theme} />
      {cvData.education.map((edu, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <RowMeta left={edu.school} right={edu.year} sub={edu.degree} theme={theme} />
          {edu.description && <div style={{ fontSize: '9px', color: theme.bodyMuted, marginTop: 2, fontFamily: theme.fontBody, lineHeight: 1.4 }}>{edu.description}</div>}
        </div>
      ))}
    </Section>
  );
};

// ─── Projects ────────────────────────────────────────────────────────────────
const ProjectsSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.projects?.length) return null;
  return (
    <Section>
      <SectionHeading title="Projects" theme={theme} />
      {cvData.projects.map((p, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{p.name}</span>
            {p.year && <span style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody }}>{p.year}</span>}
          </div>
          {p.description && <div style={{ fontSize: '9px', color: theme.bodyMuted, lineHeight: 1.45, marginTop: 2, fontFamily: theme.fontBody }}>{p.description}</div>}
          {p.technologies?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {p.technologies.map((t, ti) => <Tag key={ti} label={t} theme={theme} />)}
            </div>
          ) : null}
          {p.link && <div style={{ fontSize: '8px', color: theme.accent, marginTop: 2, fontFamily: theme.fontBody }}>{p.link}</div>}
        </div>
      ))}
    </Section>
  );
};

// ─── Skills ──────────────────────────────────────────────────────────────────
const SkillsSection: React.FC<{ skills: string[]; theme: TemplateTheme }> = ({ skills, theme }) => {
  if (!skills?.length) return null;
  return (
    <Section>
      <SectionHeading title="Skills" theme={theme} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 5px' }}>
        {skills.map((s, i) => <Tag key={i} label={s} theme={theme} />)}
      </div>
    </Section>
  );
};

// ─── Languages ───────────────────────────────────────────────────────────────
const LanguagesSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.languages?.length) return null;
  return (
    <Section>
      <SectionHeading title="Languages" theme={theme} />
      {cvData.languages.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '9.5px', fontFamily: theme.fontBody, color: theme.bodyText }}>{l.name}</span>
          <span style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody }}>{l.proficiency}</span>
        </div>
      ))}
    </Section>
  );
};

// ─── Certifications ──────────────────────────────────────────────────────────
const CertificationsSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.certifications?.length) return null;
  return (
    <Section>
      <SectionHeading title="Certifications" theme={theme} />
      {cvData.certifications.map((c, i) => {
        const name = typeof c === 'string' ? c : c.name;
        const meta = typeof c === 'string' ? null : [c.issuer, c.year].filter(Boolean).join(' · ');
        return (
          <div key={i} style={{ marginBottom: 5 }}>
            <div style={{ fontSize: '9.5px', fontWeight: 600, color: theme.bodyText, fontFamily: theme.fontBody }}>{name}</div>
            {meta && <div style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody }}>{meta}</div>}
          </div>
        );
      })}
    </Section>
  );
};

// ─── Achievements ────────────────────────────────────────────────────────────
const AchievementsSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.achievements?.length) return null;
  return (
    <Section>
      <SectionHeading title="Achievements" theme={theme} />
      {cvData.achievements.map((a, i) => (
        <Bullet key={i} text={a} theme={theme} isEditing={false} onBlur={() => {}} />
      ))}
    </Section>
  );
};

// ─── Publications ────────────────────────────────────────────────────────────
const PublicationsSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.publications?.length) return null;
  return (
    <Section>
      <SectionHeading title="Publications" theme={theme} />
      {cvData.publications.map((p, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: '9.5px', fontWeight: 600, color: theme.bodyText, fontFamily: theme.fontBody }}>{p.title}</div>
          <div style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody }}>{p.authors?.join(', ')} · {p.journal} · {p.year}</div>
          {p.link && <div style={{ fontSize: '8px', color: theme.accent, fontFamily: theme.fontBody }}>{p.link}</div>}
        </div>
      ))}
    </Section>
  );
};

// ─── References ──────────────────────────────────────────────────────────────
const ReferencesSection: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.references?.length) return null;
  return (
    <Section>
      <SectionHeading title="References" theme={theme} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {cvData.references.map((r, i) => (
          <div key={i} style={{ fontSize: '9px', fontFamily: theme.fontBody }}>
            <div style={{ fontWeight: 700, color: theme.bodyText }}>{r.name}</div>
            <div style={{ color: theme.bodyMuted }}>{r.title} · {r.company}</div>
            <div style={{ color: theme.accent }}>{r.email}</div>
          </div>
        ))}
      </div>
    </Section>
  );
};

// ─── Custom Sections (awards, volunteer, etc.) ────────────────────────────────
const CustomSectionsBlock: React.FC<{ sections: CustomSection[]; theme: TemplateTheme }> = ({ sections, theme }) => {
  if (!sections?.length) return null;
  return (
    <>
      {sections.map(sec => (
        <Section key={sec.id}>
          <SectionHeading title={sec.label} theme={theme} />
          {sec.items.map((item: CustomSectionItem, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{item.title}</span>
                {item.year && <span style={{ fontSize: '8.5px', color: theme.bodyMuted, fontFamily: theme.fontBody }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: '9px', color: theme.accent, fontWeight: 600, fontFamily: theme.fontBody }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: '9px', color: theme.bodyMuted, lineHeight: 1.45, marginTop: 2, fontFamily: theme.fontBody }}>{item.description}</div>}
              {item.link && <div style={{ fontSize: '8px', color: theme.accent, marginTop: 1, fontFamily: theme.fontBody }}>{item.link}</div>}
            </div>
          ))}
        </Section>
      ))}
    </>
  );
};

// ─── Summary ─────────────────────────────────────────────────────────────────
const SummarySection: React.FC<{ cvData: CVData; theme: TemplateTheme; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, isEditing, onChange }) => {
  if (!cvData.summary) return null;
  return (
    <Section>
      <SectionHeading title="Professional Summary" theme={theme} />
      <p
        style={{ fontSize: '9.5px', color: theme.bodyMuted, lineHeight: 1.6, margin: 0, fontFamily: theme.fontBody }}
        {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.summary = v; onChange(d); })}
      >
        {cvData.summary}
      </p>
    </Section>
  );
};

// ─── SIDEBAR section helper for dark-bg sidebar ───────────────────────────────
const SidebarSectionHeading: React.FC<{ title: string; theme: TemplateTheme }> = ({ title, theme }) => (
  <div style={{ fontSize: '8.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: theme.accent, marginBottom: 7, marginTop: 2, fontFamily: theme.fontHeading, borderBottom: `1px solid ${theme.accent}44`, paddingBottom: 4 }}>
    {title}
  </div>
);

const SidebarSkills: React.FC<{ skills: string[]; theme: TemplateTheme }> = ({ skills, theme }) => {
  if (!skills?.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <SidebarSectionHeading title="Skills" theme={theme} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {skills.map((s, i) => (
          <span key={i} style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', color: theme.sidebarText, border: `1px solid rgba(255,255,255,0.15)`, fontFamily: theme.fontBody }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
};

const SidebarLanguages: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.languages?.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <SidebarSectionHeading title="Languages" theme={theme} />
      {cvData.languages.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '9px', color: theme.sidebarText, fontFamily: theme.fontBody }}>{l.name}</span>
          <span style={{ fontSize: '8px', color: theme.sidebarMuted, fontFamily: theme.fontBody }}>{l.proficiency}</span>
        </div>
      ))}
    </div>
  );
};

const SidebarCerts: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.certifications?.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <SidebarSectionHeading title="Certifications" theme={theme} />
      {cvData.certifications.slice(0, 6).map((c, i) => {
        const name = typeof c === 'string' ? c : c.name;
        return <div key={i} style={{ fontSize: '8.5px', color: theme.sidebarText, marginBottom: 3, fontFamily: theme.fontBody, lineHeight: 1.4 }}>{name}</div>;
      })}
    </div>
  );
};

const SidebarAchievements: React.FC<{ cvData: CVData; theme: TemplateTheme }> = ({ cvData, theme }) => {
  if (!cvData.achievements?.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <SidebarSectionHeading title="Highlights" theme={theme} />
      {cvData.achievements.slice(0, 4).map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
          <span style={{ color: theme.accent, fontSize: '8px', marginTop: '2px', flexShrink: 0 }}>★</span>
          <span style={{ fontSize: '8.5px', color: theme.sidebarText, lineHeight: 1.45, fontFamily: theme.fontBody }}>{a}</span>
        </div>
      ))}
    </div>
  );
};

const SidebarContact: React.FC<{ pi: PersonalInfo; theme: TemplateTheme }> = ({ pi, theme }) => {
  const items = [
    pi.email && { label: pi.email },
    pi.phone && { label: pi.phone },
    pi.location && { label: pi.location },
    pi.linkedin && { label: pi.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, 'in/') },
    pi.github && { label: pi.github.replace(/https?:\/\/(www\.)?github\.com\//, 'github/') },
    pi.website && { label: pi.website },
  ].filter(Boolean) as { label: string }[];

  return (
    <div style={{ marginBottom: 14 }}>
      <SidebarSectionHeading title="Contact" theme={theme} />
      {items.map((item, i) => (
        <div key={i} style={{ fontSize: '8.5px', color: theme.sidebarText, marginBottom: 3, fontFamily: theme.fontBody, wordBreak: 'break-all', lineHeight: 1.4 }}>
          {item.label}
        </div>
      ))}
    </div>
  );
};

// ─── LAYOUTS ─────────────────────────────────────────────────────────────────

interface LayoutProps {
  cvData: CVData; pi: PersonalInfo;
  theme: TemplateTheme; isEditing: boolean;
  onChange: (d: CVData) => void;
}

const MainSections: React.FC<LayoutProps & { bodyPad?: string }> = ({ cvData, pi, theme, isEditing, onChange, bodyPad }) => (
  <div style={{ padding: bodyPad ?? '20px 28px' }}>
    <SummarySection cvData={cvData} theme={theme} isEditing={isEditing} onChange={onChange} />
    <ExperienceSection cvData={cvData} theme={theme} isEditing={isEditing} onChange={onChange} />
    <EducationSection cvData={cvData} theme={theme} isEditing={isEditing} onChange={onChange} />
    <ProjectsSection cvData={cvData} theme={theme} />
    <PublicationsSection cvData={cvData} theme={theme} />
    <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} />
    <ReferencesSection cvData={cvData} theme={theme} />
  </div>
);

const SidebarContent: React.FC<{ cvData: CVData; pi: PersonalInfo; theme: TemplateTheme; showContact?: boolean }> = ({ cvData, pi, theme, showContact }) => (
  <div style={{ padding: '20px 16px' }}>
    {showContact && <SidebarContact pi={pi} theme={theme} />}
    <SidebarSkills skills={cvData.skills} theme={theme} />
    <SidebarLanguages cvData={cvData} theme={theme} />
    <SidebarCerts cvData={cvData} theme={theme} />
    <SidebarAchievements cvData={cvData} theme={theme} />
  </div>
);

const LayoutSingleColumn: React.FC<LayoutProps> = (props) => (
  <div style={{ background: props.theme.bodyBg, minHeight: '280mm' }}>
    <CVHeader pi={props.pi} theme={props.theme} isEditing={props.isEditing} onUpdate={(f, v) => {
      const d = JSON.parse(JSON.stringify(props.cvData));
      if (f === 'name') props.onChange({ ...d, _name: v } as any);
    }} />
    <MainSections {...props} />
    {(props.cvData.skills?.length > 0 || props.cvData.languages?.length || props.cvData.certifications?.length) && (
      <div style={{ padding: '0 28px 20px' }}>
        <SkillsSection skills={props.cvData.skills} theme={props.theme} />
        <LanguagesSection cvData={props.cvData} theme={props.theme} />
        <CertificationsSection cvData={props.cvData} theme={props.theme} />
        <AchievementsSection cvData={props.cvData} theme={props.theme} />
      </div>
    )}
  </div>
);

const LayoutSidebarLeft: React.FC<LayoutProps> = (props) => {
  const { theme } = props;
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={theme} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, flexShrink: 0, color: theme.sidebarText }}>
          <SidebarContent cvData={props.cvData} pi={props.pi} theme={theme} showContact={false} />
        </div>
        <div style={{ flex: 1, borderLeft: `1px solid ${theme.borderColor}` }}>
          <MainSections {...props} bodyPad="16px 20px" />
        </div>
      </div>
    </div>
  );
};

const LayoutSidebarRight: React.FC<LayoutProps> = (props) => {
  const { theme } = props;
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={theme} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ flex: 1, borderRight: `1px solid ${theme.borderColor}` }}>
          <MainSections {...props} bodyPad="16px 20px" />
        </div>
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, flexShrink: 0, color: theme.sidebarText }}>
          <SidebarContent cvData={props.cvData} pi={props.pi} theme={theme} showContact={true} />
        </div>
      </div>
    </div>
  );
};

const LayoutTwoColumn: React.FC<LayoutProps> = (props) => {
  const { theme, cvData } = props;
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm' }}>
      <CVHeader pi={props.pi} theme={theme} isEditing={props.isEditing} onUpdate={() => {}} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        <div style={{ flex: 1, padding: '16px 20px', borderRight: `1px solid ${theme.borderColor}` }}>
          <SummarySection cvData={cvData} theme={theme} isEditing={props.isEditing} onChange={props.onChange} />
          <ExperienceSection cvData={cvData} theme={theme} isEditing={props.isEditing} onChange={props.onChange} />
          <ProjectsSection cvData={cvData} theme={theme} />
          <PublicationsSection cvData={cvData} theme={theme} />
          <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} />
        </div>
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, padding: '16px 16px' }}>
          <div style={{ marginBottom: 14 }}>
            <SidebarSectionHeading title="Skills" theme={theme} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {cvData.skills?.map((s, i) => (
                <span key={i} style={{ fontSize: '8px', padding: '2px 6px', borderRadius: theme.tagRadius, background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.tagBorder}`, fontFamily: theme.fontBody }}>{s}</span>
              ))}
            </div>
          </div>
          <EducationSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} isEditing={props.isEditing} onChange={props.onChange} />
          <SidebarLanguages cvData={cvData} theme={theme} />
          <SidebarCerts cvData={cvData} theme={theme} />
          <SidebarAchievements cvData={cvData} theme={theme} />
          <ReferencesSection cvData={cvData} theme={{ ...theme, bodyText: theme.sidebarText, bodyMuted: theme.sidebarMuted }} />
        </div>
      </div>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

const TemplateV2: React.FC<TemplateV2Props> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, themeId }) => {
  const theme = getTheme(themeId);
  const layoutProps: LayoutProps = { cvData, pi: personalInfo, theme, isEditing, onChange: onDataChange };

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
