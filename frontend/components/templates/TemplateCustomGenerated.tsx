/**
 * TemplateCustomGenerated — spec-driven renderer for user-uploaded templates.
 *
 * Takes a TemplateSpec (extracted by Gemini Vision) and renders a full CV
 * without any eval() or arbitrary code execution. All layout decisions are
 * driven purely by the spec JSON.
 */
import React from 'react';
import { CVData, PersonalInfo } from '../../types';
import { TemplateSpec } from '../../services/templateAnalyzerService';

interface Props {
  cvData: CVData;
  personalInfo: PersonalInfo;
  spec: TemplateSpec;
  isEditing?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hex(color: string | null | undefined, fallback = '#1B2B4B'): string {
  if (!color) return fallback;
  return color.startsWith('#') ? color : fallback;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ── Section renderers ─────────────────────────────────────────────────────────

function ContactRow({ personalInfo, spec }: { personalInfo: PersonalInfo; spec: TemplateSpec }) {
  const c = spec.colorScheme;
  const style = spec.contactInfoStyle;
  const items = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.location,
    personalInfo.linkedin,
    personalInfo.website,
    personalInfo.github,
  ].filter(Boolean);

  if (style === 'stacked') {
    return (
      <div className="space-y-0.5 mt-1">
        {items.map((item, i) => (
          <div key={i} style={{ color: hex(c.textSecondary), fontSize: '9.5px' }}>{item}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
      {items.map((item, i) => (
        <span key={i} style={{ color: hex(c.textSecondary), fontSize: '9px' }}>
          {i > 0 && <span className="mr-3" style={{ color: hex(c.dividerColor, '#cbd5e1') }}>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({ label, spec }: { label: string; spec: TemplateSpec }) {
  const t = spec.typography;
  const c = spec.colorScheme;
  const text = t.sectionHeadingStyle === 'uppercase'
    ? label.toUpperCase()
    : t.sectionHeadingStyle === 'capitalized'
    ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
    : label;

  const baseStyle: React.CSSProperties = {
    color: hex(c.headingColor),
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: t.sectionHeadingStyle === 'uppercase' ? '0.08em' : undefined,
    marginBottom: '6px',
    paddingBottom: t.sectionHeadingDecoration === 'border-bottom' || t.sectionHeadingDecoration === 'underline' ? '3px' : undefined,
    borderBottom: t.sectionHeadingDecoration === 'border-bottom'
      ? `1.5px solid ${hex(c.primary)}`
      : t.sectionHeadingDecoration === 'underline'
      ? `1px solid ${hex(c.dividerColor, '#e2e8f0')}`
      : undefined,
    backgroundColor: t.sectionHeadingDecoration === 'background'
      ? hex(c.primary) + '18'
      : undefined,
    padding: t.sectionHeadingDecoration === 'background' ? '2px 6px' : undefined,
    borderRadius: t.sectionHeadingDecoration === 'background' ? '3px' : undefined,
  };

  if (t.sectionHeadingDecoration === 'dot') {
    return (
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex(c.primary) }} />
        <span style={baseStyle}>{text}</span>
      </div>
    );
  }

  return <div style={baseStyle}>{text}</div>;
}

const BulletItem: React.FC<{ text: string; spec: TemplateSpec }> = ({ text, spec }) => {
  const c = spec.colorScheme;
  const t = spec.typography;
  const bullet = t.bulletStyle === 'dot' ? '•' : t.bulletStyle === 'dash' ? '–' : t.bulletStyle === 'square' ? '▪' : '';
  const indent = spec.experienceBulletIndent === 'standard' ? 16 : spec.experienceBulletIndent === 'small' ? 8 : 0;

  return (
    <div className="flex gap-1.5" style={{ paddingLeft: indent, marginBottom: '2px' }}>
      {bullet && (
        <span className="flex-shrink-0 mt-px" style={{ color: hex(c.primary), fontSize: '8px', lineHeight: '14px' }}>
          {bullet}
        </span>
      )}
      <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', lineHeight: '1.45' }}>{text}</span>
    </div>
  );
}

const SkillsSection: React.FC<{ cvData: CVData; spec: TemplateSpec }> = ({ cvData, spec }) => {
  if (!cvData.skills?.length) return null;
  const c = spec.colorScheme;
  const style = spec.skillsStyle;

  if (style === 'tags') {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {cvData.skills.map((s, i) => (
          <span key={i} style={{
            backgroundColor: hex(c.primary) + '15',
            color: hex(c.textPrimary),
            border: `1px solid ${hex(c.primary)}30`,
            fontSize: '8.5px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500,
          }}>{s}</span>
        ))}
      </div>
    );
  }

  if (style === 'two-column') {
    const half = Math.ceil(cvData.skills.length / 2);
    const col1 = cvData.skills.slice(0, half);
    const col2 = cvData.skills.slice(half);
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
        {[...col1, ...col2].map((s, i) => (
          <BulletItem key={i} text={s} spec={spec} />
        ))}
      </div>
    );
  }

  if (style === 'progress-bars') {
    return (
      <div className="space-y-1.5 mt-1">
        {cvData.skills.map((s, i) => (
          <div key={i}>
            <div className="flex justify-between mb-0.5">
              <span style={{ color: hex(c.textPrimary), fontSize: '9px' }}>{s}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ backgroundColor: hex(c.primary) + '20' }}>
              <div className="h-full rounded-full" style={{
                width: `${70 + ((i * 7) % 30)}%`,
                backgroundColor: hex(c.primary),
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (style === 'inline') {
    return (
      <p style={{ color: hex(c.textPrimary), fontSize: '9.5px', lineHeight: 1.6, marginTop: '4px' }}>
        {cvData.skills.join(' · ')}
      </p>
    );
  }

  // list (default)
  return (
    <div className="space-y-0.5 mt-1">
      {cvData.skills.map((s, i) => <BulletItem key={i} text={s} spec={spec} />)}
    </div>
  );
};

// ── Section renderer map ──────────────────────────────────────────────────────

function renderSection(sectionKey: string, cvData: CVData, personalInfo: PersonalInfo, spec: TemplateSpec) {
  const c = spec.colorScheme;
  const bodySize = spec.typography.bodyTextSize === 'small' ? '9px' : spec.typography.bodyTextSize === 'large' ? '11px' : '9.5px';

  switch (sectionKey) {
    case 'summary':
      if (!cvData.summary) return null;
      return (
        <div key="summary" className="mb-3">
          <SectionHeading label="Summary" spec={spec} />
          <p style={{ color: hex(c.textPrimary), fontSize: bodySize, lineHeight: 1.55 }}>{cvData.summary}</p>
        </div>
      );

    case 'experience':
      if (!cvData.experience?.length) return null;
      return (
        <div key="experience" className="mb-3">
          <SectionHeading label="Experience" spec={spec} />
          {cvData.experience.map((exp, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span style={{ color: hex(c.textPrimary), fontSize: '10px', fontWeight: 700 }}>{exp.jobTitle}</span>
                  <span style={{ color: hex(c.primary), fontSize: '9.5px', fontWeight: 600 }}> · {exp.company}</span>
                </div>
                <span style={{ color: hex(c.textSecondary), fontSize: '8.5px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                  {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : ''}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {exp.responsibilities.map((r, j) => (
                  <BulletItem key={j} text={r.replace(/^[-•·▪]\s*/, '').trim()} spec={spec} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );

    case 'education':
      if (!cvData.education?.length) return null;
      return (
        <div key="education" className="mb-3">
          <SectionHeading label="Education" spec={spec} />
          {cvData.education.map((edu, i) => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between items-start">
                <div>
                  <span style={{ color: hex(c.textPrimary), fontSize: '10px', fontWeight: 700 }}>{edu.degree}</span>
                  <span style={{ color: hex(c.primary), fontSize: '9.5px' }}> · {edu.school}</span>
                </div>
                <span style={{ color: hex(c.textSecondary), fontSize: '8.5px' }}>{edu.year}</span>
              </div>
            </div>
          ))}
        </div>
      );

    case 'skills':
      if (!cvData.skills?.length) return null;
      return (
        <div key="skills" className="mb-3">
          <SectionHeading label="Skills" spec={spec} />
          <SkillsSection cvData={cvData} spec={spec} />
        </div>
      );

    case 'projects':
      if (!cvData.projects?.length) return null;
      return (
        <div key="projects" className="mb-3">
          <SectionHeading label="Projects" spec={spec} />
          {cvData.projects.map((proj, i) => (
            <div key={i} className="mb-1.5">
              <span style={{ color: hex(c.textPrimary), fontSize: '10px', fontWeight: 700 }}>{proj.name}</span>
              {proj.description && (
                <p style={{ color: hex(c.textPrimary), fontSize: bodySize, lineHeight: 1.5, marginTop: '2px' }}>
                  {proj.description}
                </p>
              )}
            </div>
          ))}
        </div>
      );

    case 'languages':
      if (!cvData.languages?.length) return null;
      return (
        <div key="languages" className="mb-3">
          <SectionHeading label="Languages" spec={spec} />
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {cvData.languages.map((lang, i) => (
              <span key={i} style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>
                <strong>{lang.name}</strong>
                {lang.proficiency && <span style={{ color: hex(c.textSecondary) }}> — {lang.proficiency}</span>}
              </span>
            ))}
          </div>
        </div>
      );

    case 'contact':
      return (
        <div key="contact" className="mb-3">
          <SectionHeading label="Contact" spec={spec} />
          <div className="space-y-0.5">
            {[personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin, personalInfo.website, personalInfo.github]
              .filter(Boolean)
              .map((item, i) => (
                <div key={i} style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>{item}</div>
              ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Single-column layout ──────────────────────────────────────────────────────

function SingleColumnLayout({ cvData, personalInfo, spec }: Props) {
  const c = spec.colorScheme;
  const t = spec.typography;
  const fontFamily = t.fontFamily === 'serif' ? 'Georgia, serif' : t.fontFamily === 'monospace' ? 'monospace' : 'Inter, sans-serif';
  const paddingMap = { tight: '20px', normal: '28px', generous: '36px' };
  const pad = paddingMap[spec.layout.pageMargins] ?? '28px';

  const nameSizeMap = { 'extra-large': '30px', large: '24px', bold: '22px', uppercase: '20px', normal: '20px' };
  const nameSize = nameSizeMap[t.nameStyle] ?? '24px';

  const hasHeader = spec.decorativeElements.hasHeaderBar;

  return (
    <div style={{ width: '794px', minHeight: '1123px', backgroundColor: hex(c.background), fontFamily, color: hex(c.textPrimary) }}>
      {/* Header bar */}
      {hasHeader ? (
        <div style={{ backgroundColor: hex(c.headerBarColor ?? c.primary), padding: `${pad} ${pad} 16px` }}>
          <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: '#ffffff', letterSpacing: t.nameStyle === 'uppercase' ? '0.04em' : undefined, textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
            {personalInfo.name}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', marginTop: '3px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
          <div className="flex flex-wrap gap-x-3 mt-2">
            {[personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).map((item, i) => (
              <span key={i} style={{ color: 'rgba(255,255,255,0.75)', fontSize: '9px' }}>{item}</span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: `${pad} ${pad} 12px`, borderBottom: `2px solid ${hex(c.primary)}` }}>
          <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: hex(c.textPrimary), textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
            {personalInfo.name}
          </div>
          <div style={{ fontSize: '11px', color: hex(c.primary), marginTop: '2px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
          <ContactRow personalInfo={personalInfo} spec={spec} />
        </div>
      )}

      {/* Body */}
      <div style={{ padding: `16px ${pad}` }}>
        {spec.sectionOrder.map(sec => renderSection(sec, cvData, personalInfo, spec))}
      </div>
    </div>
  );
}

// ── Two-column layout ─────────────────────────────────────────────────────────

function TwoColumnLayout({ cvData, personalInfo, spec }: Props) {
  const c = spec.colorScheme;
  const t = spec.typography;
  const fontFamily = t.fontFamily === 'serif' ? 'Georgia, serif' : t.fontFamily === 'monospace' ? 'monospace' : 'Inter, sans-serif';
  const sidebarPct = spec.layout.sidebarWidthPercent ?? 32;
  const mainPct = 100 - sidebarPct;
  const isLeft = spec.layout.columns === 'sidebar-left';

  const nameSizeMap = { 'extra-large': '28px', large: '22px', bold: '20px', uppercase: '18px', normal: '18px' };
  const nameSize = nameSizeMap[t.nameStyle] ?? '22px';
  const paddingMap = { tight: '14px', normal: '20px', generous: '26px' };
  const pad = paddingMap[spec.layout.pageMargins] ?? '20px';

  // Separate sections into sidebar vs main based on position in sectionOrder
  const sidebarSections = spec.sectionOrder.filter(s => ['skills', 'languages', 'contact'].includes(s));
  const mainSections = spec.sectionOrder.filter(s => !sidebarSections.includes(s));

  const sidebar = (
    <div style={{ width: `${sidebarPct}%`, flexShrink: 0, backgroundColor: hex(c.sidebarBackground ?? c.primary), padding: `${pad}`, color: '#fff' }}>
      {/* Photo placeholder */}
      {spec.decorativeElements.hasPhoto && (
        <div className="flex justify-center mb-4">
          <div style={{
            width: '70px', height: '70px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: spec.decorativeElements.photoShape === 'circle' ? '50%' : spec.decorativeElements.photoShape === 'rounded' ? '8px' : '0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: 700, color: '#fff',
          }}>
            {initials(personalInfo.name)}
          </div>
        </div>
      )}

      {/* Name in sidebar */}
      {isLeft && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: '#ffffff', lineHeight: 1.2, textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
            {personalInfo.name}
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', marginTop: '4px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
          <div className="mt-2 space-y-0.5">
            {[personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).map((item, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.75)', fontSize: '8.5px' }}>{item}</div>
            ))}
          </div>
        </div>
      )}

      {/* Sidebar sections */}
      {sidebarSections.map(sec => {
        const sidebarSpec = { ...spec, colorScheme: { ...c, headingColor: '#ffffff', textPrimary: 'rgba(255,255,255,0.95)', textSecondary: 'rgba(255,255,255,0.65)', primary: 'rgba(255,255,255,0.9)', dividerColor: 'rgba(255,255,255,0.3)' } };
        return <div key={sec}>{renderSection(sec, cvData, personalInfo, sidebarSpec)}</div>;
      })}
    </div>
  );

  const main = (
    <div style={{ width: `${mainPct}%`, padding: `${pad}` }}>
      {/* Name in main area when sidebar is on left */}
      {!isLeft && (
        <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: `2px solid ${hex(c.primary)}` }}>
          <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: hex(c.textPrimary), textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
            {personalInfo.name}
          </div>
          <div style={{ fontSize: '11px', color: hex(c.primary), marginTop: '2px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
          <ContactRow personalInfo={personalInfo} spec={spec} />
        </div>
      )}
      {mainSections.map(sec => renderSection(sec, cvData, personalInfo, spec))}
    </div>
  );

  return (
    <div style={{ width: '794px', minHeight: '1123px', backgroundColor: hex(c.background), fontFamily, display: 'flex' }}>
      {isLeft ? <>{sidebar}{main}</> : <>{main}{sidebar}</>}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

const TemplateCustomGenerated: React.FC<Props> = (props) => {
  const { spec } = props;
  const isSidebar = spec.layout.columns === 'sidebar-left' || spec.layout.columns === 'sidebar-right';

  if (isSidebar || spec.layout.columns === 'two-column') {
    return <TwoColumnLayout {...props} />;
  }
  return <SingleColumnLayout {...props} />;
};

export default TemplateCustomGenerated;
