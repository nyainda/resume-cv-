/**
 * TemplateCustomGenerated — spec-driven renderer for user-uploaded templates.
 *
 * Renders a full CV from a TemplateSpec (extracted by AI Vision) without any
 * eval() or arbitrary code execution. All layout decisions are driven purely
 * by the spec JSON.
 *
 * Supports: section icons, shaded heading backgrounds, italic headings,
 * 3-column skills, certifications, achievements, awards, additional-info,
 * spec-driven sidebar section routing.
 */
import React from 'react';
import { CVData, PersonalInfo, CustomTemplateCustomizations } from '../../types';
import { TemplateSpec, normalizeSectionKey } from '../../services/templateAnalyzerService';

interface Props {
  cvData: CVData;
  personalInfo: PersonalInfo;
  spec: TemplateSpec;
  customizations?: CustomTemplateCustomizations;
  isEditing?: boolean;
}

/** Merge live customizations into a spec so they take effect everywhere */
function applyCustomizations(spec: TemplateSpec, c?: CustomTemplateCustomizations): TemplateSpec {
  if (!c) return spec;
  return {
    ...spec,
    colorScheme: {
      ...spec.colorScheme,
      ...(c.primaryColor ? { primary: c.primaryColor, headingColor: c.primaryColor, headerBarColor: spec.colorScheme.headerBarColor ? c.primaryColor : null } : {}),
      ...(c.sidebarColor ? { sidebarBackground: c.sidebarColor } : {}),
    },
    typography: {
      ...spec.typography,
      ...(c.fontFamily ? { fontFamily: c.fontFamily } : {}),
    },
  };
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function hex(color: string | null | undefined, fallback = '#1B2B4B'): string {
  if (!color) return fallback;
  return color.startsWith('#') ? color : fallback;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ── Date formatter ─────────────────────────────────────────────────────────────
// Converts ISO dates ("2024-01-15") to readable form ("Jan 2024").
// Passes through "Present", "Current", plain years ("2024"), and already-formatted strings.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s) return '';
  // Already readable — "Present", "Current", "Jan 2024", "2024", etc.
  if (/^(present|current|ongoing|now)$/i.test(s)) return s;
  // Full ISO: 2024-01-15 or 2024-01
  const iso = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) {
    const mo = parseInt(iso[2], 10) - 1;
    return `${MONTHS[mo] ?? ''} ${iso[1]}`.trim();
  }
  // Already formatted or just a year — return as-is
  return s;
}

// ── Contrast helpers ───────────────────────────────────────────────────────────
// Ensure text is readable against its background before rendering.

function lum(h: string): number {
  const n = parseInt(h.replace('#', '').padEnd(6, '0'), 16);
  const toL = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * toL((n >> 16) & 255) + 0.7152 * toL((n >> 8) & 255) + 0.0722 * toL(n & 255);
}
function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Return fg if its contrast vs bg meets minRatio, otherwise return fallback */
function contrastSafe(fg: string, bg: string, minRatio = 3.5, fallback = '#1B2B4B'): string {
  try {
    if (!fg?.startsWith('#') || fg.length < 7) return fallback;
    return contrastRatio(fg, bg.startsWith('#') ? bg : '#ffffff') >= minRatio ? fg : fallback;
  } catch { return fallback; }
}

/**
 * Enforce readable colors in the main column (light background).
 * Leaves the sidebar spec untouched (sidebar already uses white-on-dark overrides).
 */
function enforceMainContrast(spec: TemplateSpec): TemplateSpec {
  const bg = hex(spec.colorScheme.background, '#ffffff');
  const safeHeading = contrastSafe(hex(spec.colorScheme.headingColor), bg, 3.5,
    contrastSafe(hex(spec.colorScheme.primary), bg, 3.5, '#1B2B4B'));
  const safeText    = contrastSafe(hex(spec.colorScheme.textPrimary), bg, 5.0, '#1a1a1a');
  const safeSecond  = contrastSafe(hex(spec.colorScheme.textSecondary), bg, 2.5, '#666666');
  const safeAccent  = contrastSafe(hex(spec.colorScheme.primary), bg, 3.0,
    contrastSafe(safeHeading, bg, 3.0, '#1B2B4B'));
  return {
    ...spec,
    colorScheme: {
      ...spec.colorScheme,
      headingColor: safeHeading,
      textPrimary:  safeText,
      textSecondary: safeSecond,
      primary: safeAccent,
    },
  };
}

// ── Smart sidebar section routing ──────────────────────────────────────────────
/**
 * Intelligently assign sections to the sidebar vs main column so the CV fits
 * on one page. Short/list-style sections go sidebar; long/narrative sections stay main.
 */
function computeSmartSidebarSections(cvData: CVData, sectionOrder: string[]): string[] {
  const sidebar = new Set<string>();

  // These are always sidebar-bound when data exists
  const ALWAYS_SIDEBAR = ['skills', 'languages', 'certifications', 'achievements', 'awards', 'contact'];
  for (const s of ALWAYS_SIDEBAR) { if (sectionOrder.includes(s)) sidebar.add(s); }

  // Education goes to sidebar when it's brief (≤2 entries, no long descriptions)
  if (sectionOrder.includes('education')) {
    const eduBrief = !cvData.education?.length ||
      (cvData.education.length <= 2 &&
       !cvData.education.some(e => (e.description?.length ?? 0) > 80));
    if (eduBrief) sidebar.add('education');
  }

  // If sidebar is still sparse and projects are few + short, move them there too
  if (sidebar.size <= 2 && sectionOrder.includes('projects')) {
    const projBrief = (cvData.projects?.length ?? 0) <= 2 &&
      !cvData.projects?.some(p => (p.description?.length ?? 0) > 100);
    if (projBrief) sidebar.add('projects');
  }

  return sectionOrder.filter(s => sidebar.has(s));
}

// ── Section icons ──────────────────────────────────────────────────────────────
// Clean stroke-based SVG icons at 12×12 viewBox

const ICON_PATHS: Record<string, string> = {
  briefcase:  'M2 5h8v5H2V5zm2-2h4v2H4V3zM2 5h8',
  graduation: 'M6 2l5 2.5L6 7 1 4.5 6 2zm-2.5 3.2V8.5L6 10l2.5-1.3V5.2',
  gear:       'M6 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0-1.7l.8.5.8-.5.4.7-.5.8.5.8-.7.4-.8-.5-.8.5-.7-.4.5-.8-.5-.8.7-.4zm0 7.4l-.8-.5-.8.5-.4-.7.5-.8-.5-.8.7-.4.8.5.8-.5.7.4-.5.8.5.8-.7.4zM2.8 5.2l.5.8-.5.8.7.4.8-.5.8.5.4-.7-.5-.8.5-.8-.7-.4-.8.5-.8-.5-.4.7zm6.4 0l-.5.8.5.8-.7.4-.8-.5-.8.5-.4-.7.5-.8-.5-.8.7-.4.8.5.8-.5.4.7z',
  folder:     'M1 3h3.5l1 1.5H11V9H1V3z',
  trophy:     'M3 2h6v4a3 3 0 01-6 0V2zm-1 0h1m7 0h1M4.5 8.5V10m3-1.5V10M3.5 10h5',
  globe:      'M6 2a4 4 0 100 8 4 4 0 000-8zm0 0c-1.1 2-1.1 6 0 8m0-8c1.1 2 1.1 6 0 8M2 6h8',
  envelope:   'M1 3h10v6H1V3zm0 0l5 3.5L11 3',
  wrench:     'M8.5 1.5a2.5 2.5 0 00-2.4 3.1L2 8.7A.7.7 0 003 9.7l4.1-4.1A2.5 2.5 0 008.5 1.5z',
  badge:      'M6 1l1.5 3.3H11l-2.8 2 1.1 3.3L6 7.7 2.7 9.6l1.1-3.3L1 4.3h3.5L6 1z',
  star:       'M6 1.5l1.3 2.7 3 .4-2.2 2.1.5 3L6 8.3 3.4 9.7l.5-3L1.7 4.6l3-.4L6 1.5z',
  document:   'M3 1h4.5L9 3.5V11H3V1zm1.5 4h3m-3 2h3m-3 2h2M7 1v3h2',
  phone:      'M3 2h2.5l1 2.5-1.5 1a6 6 0 003.5 3.5l1-1.5L12 8.5V11a1 1 0 01-1 1A9 9 0 012 3a1 1 0 011-1z',
  location:   'M6 1a3.5 3.5 0 00-3.5 3.5C2.5 7.5 6 11 6 11s3.5-3.5 3.5-6.5A3.5 3.5 0 006 1zm0 4.5a1 1 0 110-2 1 1 0 010 2z',
};

function SectionIcon({ name, color, size = 11 }: { name: string; color: string; size?: number }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: '1px' }}
    >
      <path d={path} />
    </svg>
  );
}

// ── Contact row ────────────────────────────────────────────────────────────────

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

// ── Section heading ────────────────────────────────────────────────────────────

function SectionHeading({ label, sectionKey, spec }: { label: string; sectionKey: string; spec: TemplateSpec }) {
  const t = spec.typography;
  const c = spec.colorScheme;

  const text = t.sectionHeadingStyle === 'uppercase'
    ? label.toUpperCase()
    : t.sectionHeadingStyle === 'capitalized'
    ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
    : label;

  const isItalic = t.sectionHeadingFontStyle === 'italic';

  // Icon from spec
  const iconName = spec.sectionIcons?.[sectionKey];
  const hasIcon = spec.decorativeElements.hasSectionIcons && iconName && iconName !== 'none';
  const iconStyle = spec.decorativeElements.sectionIconStyle ?? 'none';

  // Background / decoration
  const decoration = t.sectionHeadingDecoration;
  const bgColor = c.sectionHeadingBgColor
    ? hex(c.sectionHeadingBgColor, '#e5e7eb')
    : decoration === 'background'
    ? '#e5e7eb'
    : undefined;

  const baseTextStyle: React.CSSProperties = {
    color: hex(c.headingColor),
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: t.sectionHeadingStyle === 'uppercase' ? '0.07em' : undefined,
    fontStyle: isItalic ? 'italic' : undefined,
    marginBottom: '6px',
  };

  // Dot decoration
  if (decoration === 'dot') {
    return (
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex(c.primary) }} />
        {hasIcon && <SectionIcon name={iconName!} color={hex(c.headingColor)} />}
        <span style={baseTextStyle}>{text}</span>
      </div>
    );
  }

  // Background bar decoration (image 3 style — grey shaded bar behind heading)
  if (decoration === 'background') {
    // Render the icon inside a filled square or circle if that's the icon style
    const iconEl = hasIcon ? (
      iconStyle === 'square-filled' ? (
        <span className="flex items-center justify-center flex-shrink-0"
          style={{ width: 16, height: 16, backgroundColor: hex(c.primary), borderRadius: 2, marginRight: 5 }}>
          <SectionIcon name={iconName!} color="#ffffff" size={10} />
        </span>
      ) : iconStyle === 'circle-filled' ? (
        <span className="flex items-center justify-center flex-shrink-0"
          style={{ width: 16, height: 16, backgroundColor: hex(c.primary), borderRadius: '50%', marginRight: 5 }}>
          <SectionIcon name={iconName!} color="#ffffff" size={10} />
        </span>
      ) : (
        <SectionIcon name={iconName!} color={hex(c.headingColor)} />
      )
    ) : null;

    return (
      <div style={{
        backgroundColor: bgColor,
        padding: '3px 8px',
        borderRadius: 3,
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}>
        {iconEl}
        <span style={baseTextStyle}>{text}</span>
      </div>
    );
  }

  // Border-bottom / underline decoration
  const borderStyle: React.CSSProperties = decoration === 'border-bottom'
    ? { borderBottom: `1.5px solid ${hex(c.primary)}`, paddingBottom: 3, marginBottom: 6 }
    : decoration === 'underline'
    ? { borderBottom: `1px solid ${hex(c.dividerColor, '#e2e8f0')}`, paddingBottom: 3, marginBottom: 6 }
    : { marginBottom: 6 };

  // Icon rendering for non-background decorations
  if (hasIcon) {
    const iconEl = iconStyle === 'square-filled' ? (
      <span className="flex items-center justify-center flex-shrink-0"
        style={{ width: 16, height: 16, backgroundColor: hex(c.primary), borderRadius: 2 }}>
        <SectionIcon name={iconName!} color="#ffffff" size={10} />
      </span>
    ) : iconStyle === 'circle-filled' ? (
      <span className="flex items-center justify-center flex-shrink-0"
        style={{ width: 16, height: 16, backgroundColor: hex(c.primary), borderRadius: '50%' }}>
        <SectionIcon name={iconName!} color="#ffffff" size={10} />
      </span>
    ) : (
      <SectionIcon name={iconName!} color={hex(c.headingColor)} />
    );

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...borderStyle }}>
        {iconEl}
        <span style={baseTextStyle}>{text}</span>
      </div>
    );
  }

  return <div style={{ ...baseTextStyle, ...borderStyle }}>{text}</div>;
}

// ── Bullet item ────────────────────────────────────────────────────────────────

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
};

// ── Skills section ─────────────────────────────────────────────────────────────

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

  if (style === 'three-column') {
    const third = Math.ceil(cvData.skills.length / 3);
    const cols = [
      cvData.skills.slice(0, third),
      cvData.skills.slice(third, third * 2),
      cvData.skills.slice(third * 2),
    ];
    return (
      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1">
        {cols.flat().map((s, i) => (
          <BulletItem key={i} text={s} spec={spec} />
        ))}
      </div>
    );
  }

  if (style === 'two-column') {
    const half = Math.ceil(cvData.skills.length / 2);
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
        {cvData.skills.map((s, i) => (
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

// ── Section renderer ───────────────────────────────────────────────────────────

function renderSection(sectionKey: string, cvData: CVData, personalInfo: PersonalInfo, spec: TemplateSpec) {
  const c = spec.colorScheme;
  const bodySize = spec.typography.bodyTextSize === 'small' ? '9px' : spec.typography.bodyTextSize === 'large' ? '11px' : '9.5px';

  // Normalize the key — handles old saved templates with non-canonical names
  const canonical = normalizeSectionKey(sectionKey) ?? sectionKey;

  // Human-readable label for the heading
  const LABELS: Record<string, string> = {
    summary: 'Professional Summary', experience: 'Experience', education: 'Education',
    skills: 'Skills', projects: 'Projects', languages: 'Languages', contact: 'Contact',
    certifications: 'Certifications', achievements: 'Achievements',
    awards: 'Awards', 'additional-info': 'Additional Information',
  };
  const label = LABELS[canonical] ?? canonical.replace(/-/g, ' ');

  switch (canonical) {
    case 'summary':
      if (!cvData.summary) return null;
      return (
        <div key="summary" className="mb-3">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          <p style={{ color: hex(c.textPrimary), fontSize: bodySize, lineHeight: 1.55 }}>{cvData.summary}</p>
        </div>
      );

    case 'experience': {
      if (!cvData.experience?.length) return null;
      const expCount = cvData.experience.length;
      // Smart bullet cap: more roles → fewer bullets each to stay on one page
      const maxBullets = expCount >= 5 ? 3 : expCount >= 4 ? 3 : expCount >= 3 ? 4 : 5;
      // Show at most 5 roles — trim oldest if there are more
      const roles = cvData.experience.slice(0, 5);
      return (
        <div key="experience" className="mb-2">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          {roles.map((exp, i) => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between items-start gap-1">
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 700 }}>{exp.jobTitle}</span>
                  <span style={{ color: hex(c.primary), fontSize: '9px', fontWeight: 600 }}> · {exp.company}</span>
                </div>
                <span style={{ color: hex(c.textSecondary), fontSize: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {formatDate(exp.startDate)}{exp.endDate ? ` – ${formatDate(exp.endDate)}` : ''}
                </span>
              </div>
              {exp.location && exp.location.trim().toLowerCase() !== exp.jobTitle.trim().toLowerCase() && exp.location.trim().toLowerCase() !== exp.company.trim().toLowerCase() && (
                <div style={{ color: hex(c.textSecondary), fontSize: '8px', marginTop: '1px' }}>{exp.location}</div>
              )}
              <div className="mt-0.5">
                {exp.responsibilities.slice(0, maxBullets).map((r, j) => (
                  <BulletItem key={j} text={r.replace(/^[-•·▪]\s*/, '').trim()} spec={spec} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    case 'education':
      if (!cvData.education?.length) return null;
      return (
        <div key="education" className="mb-2">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          {cvData.education.slice(0, 3).map((edu, i) => (
            <div key={i} className="mb-1">
              <div className="flex justify-between items-start gap-1">
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 700 }}>{edu.degree}</span>
                  <span style={{ color: hex(c.primary), fontSize: '9px' }}> · {edu.school}</span>
                </div>
                <span style={{ color: hex(c.textSecondary), fontSize: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDate(edu.year)}</span>
              </div>
              {edu.description && (
                <p style={{ color: hex(c.textSecondary), fontSize: '8.5px', marginTop: '1px', lineHeight: 1.4 }}>{edu.description}</p>
              )}
            </div>
          ))}
        </div>
      );

    case 'skills':
      if (!cvData.skills?.length) return null;
      return (
        <div key="skills" className="mb-2">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          <SkillsSection cvData={cvData} spec={spec} />
        </div>
      );

    case 'projects':
      if (!cvData.projects?.length) return null;
      return (
        <div key="projects" className="mb-2">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          {cvData.projects.slice(0, 4).map((proj, i) => (
            <div key={i} className="mb-1">
              <div className="flex justify-between items-start gap-1">
                <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 700 }}>{proj.name}</span>
                {proj.year && <span style={{ color: hex(c.textSecondary), fontSize: '8px', flexShrink: 0 }}>{proj.year}</span>}
              </div>
              {proj.description && (
                <p style={{ color: hex(c.textPrimary), fontSize: '9px', lineHeight: 1.4, marginTop: '1px' }}>
                  {proj.description}
                </p>
              )}
              {proj.technologies?.length ? (
                <p style={{ color: hex(c.textSecondary), fontSize: '8px', marginTop: '1px' }}>
                  {proj.technologies.join(', ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      );

    case 'certifications': {
      const certs = cvData.certifications ?? cvData.achievements?.filter(a => a.includes('Certificate') || a.includes('Certified') || a.includes('License')) ?? [];
      if (!certs.length) return null;
      return (
        <div key="certifications" className="mb-3">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          <div className="space-y-1 mt-1">
            {certs.map((cert, i) => (
              typeof cert === 'string'
                ? <BulletItem key={i} text={cert} spec={spec} />
                : (
                  <div key={i} className="mb-1">
                    <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 600 }}>
                      {(cert as { name?: string }).name ?? String(cert)}
                    </span>
                    {(cert as { issuer?: string }).issuer && (
                      <span style={{ color: hex(c.textSecondary), fontSize: '9px' }}> · {(cert as { issuer: string }).issuer}</span>
                    )}
                    {(cert as { year?: string }).year && (
                      <span style={{ color: hex(c.textSecondary), fontSize: '9px' }}> · {(cert as { year: string }).year}</span>
                    )}
                  </div>
                )
            ))}
          </div>
        </div>
      );
    }

    case 'achievements':
    case 'awards': {
      const items = cvData.achievements ?? [];
      if (!items.length) return null;
      return (
        <div key={canonical} className="mb-3">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          <div className="space-y-0.5 mt-1">
            {items.map((item, i) => (
              <BulletItem key={i} text={typeof item === 'string' ? item : String(item)} spec={spec} />
            ))}
          </div>
        </div>
      );
    }

    case 'languages':
      if (!cvData.languages?.length) return null;
      return (
        <div key="languages" className="mb-3">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
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
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          <div className="space-y-0.5">
            {[personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin, personalInfo.website, personalInfo.github]
              .filter(Boolean)
              .map((item, i) => (
                <div key={i} style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>{item}</div>
              ))}
          </div>
        </div>
      );

    case 'additional-info': {
      // Bundle languages + certifications + achievements when they're grouped together
      const hasLangs = cvData.languages?.length;
      const hasCerts = cvData.certifications?.length || cvData.achievements?.length;
      if (!hasLangs && !hasCerts) return null;
      return (
        <div key="additional-info" className="mb-3">
          <SectionHeading label={label} sectionKey={canonical} spec={spec} />
          {cvData.languages?.length ? (
            <div className="mb-1.5">
              <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 600 }}>Languages: </span>
              {cvData.languages.map((l, i) => (
                <span key={i} style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>
                  {l.name}{l.proficiency ? ` — ${l.proficiency}` : ''}{i < (cvData.languages?.length ?? 0) - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          ) : null}
          {cvData.certifications?.length ? (
            <div className="mb-1">
              <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 600 }}>Certifications: </span>
              <span style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>
                {cvData.certifications.map(c => typeof c === 'string' ? c : (c as { name?: string }).name ?? '').join(', ')}
              </span>
            </div>
          ) : null}
          {cvData.achievements?.length ? (
            <div>
              <span style={{ color: hex(c.textPrimary), fontSize: '9.5px', fontWeight: 600 }}>Awards/Activities: </span>
              <span style={{ color: hex(c.textPrimary), fontSize: '9.5px' }}>{cvData.achievements.join(', ')}</span>
            </div>
          ) : null}
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Photo element ─────────────────────────────────────────────────────────────

function PhotoEl({ src, shape, size = 70, fallback }: { src?: string | null; shape: string; size?: number; fallback: string }) {
  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '8px' : '0';
  if (src) {
    return (
      <img
        src={src}
        alt="Profile"
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: radius,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: '#fff',
      flexShrink: 0,
    }}>
      {fallback}
    </div>
  );
}

// ── Single-column layout ───────────────────────────────────────────────────────

function SingleColumnLayout({ cvData, personalInfo, spec, customizations }: Props) {
  const rawSpec  = applyCustomizations(spec, customizations);
  const safeSpec = enforceMainContrast(rawSpec);
  const c = safeSpec.colorScheme;
  const t = safeSpec.typography;
  const fontFamily = t.fontFamily === 'serif' ? 'Georgia, serif' : t.fontFamily === 'monospace' ? 'monospace' : 'Inter, sans-serif';
  const paddingMap = { tight: '16px', normal: '20px', generous: '26px' };
  const pad = paddingMap[spec.layout.pageMargins] ?? '20px';

  const nameSizeMap = { 'extra-large': '26px', large: '22px', bold: '20px', uppercase: '17px', normal: '17px' };
  const nameSize = nameSizeMap[t.nameStyle] ?? '20px';

  const hasHeader = rawSpec.decorativeElements.hasHeaderBar;
  const hasPhoto  = rawSpec.decorativeElements.hasPhoto && !!personalInfo.photo;
  const photoShape = rawSpec.decorativeElements.photoShape ?? 'circle';

  return (
    <div style={{ width: '794px', maxHeight: '1123px', overflow: 'hidden', backgroundColor: hex(c.background), fontFamily, color: hex(c.textPrimary) }}>
      {/* Header */}
      {hasHeader ? (
        <div style={{ backgroundColor: hex(c.headerBarColor ?? c.primary), padding: `${pad} ${pad} 14px`, display: 'flex', alignItems: 'center', gap: '14px' }}>
          {hasPhoto && (
            <PhotoEl src={personalInfo.photo} shape={photoShape} size={56} fallback={initials(personalInfo.name)} />
          )}
          <div>
            <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: '#ffffff', letterSpacing: t.nameStyle === 'uppercase' ? '0.04em' : undefined, textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
              {personalInfo.name}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
            <div className="flex flex-wrap gap-x-3 mt-1.5">
              {[personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).map((item, i) => (
                <span key={i} style={{ color: 'rgba(255,255,255,0.75)', fontSize: '8.5px' }}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: `${pad} ${pad} 10px`, borderBottom: `2px solid ${hex(c.primary)}`, display: 'flex', alignItems: 'center', gap: '14px' }}>
          {hasPhoto && (
            <PhotoEl src={personalInfo.photo} shape={photoShape} size={56} fallback={initials(personalInfo.name)} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: hex(c.textPrimary), textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
              {personalInfo.name}
            </div>
            <div style={{ fontSize: '10px', color: hex(c.primary), marginTop: '2px' }}>{cvData.experience?.[0]?.jobTitle || ''}</div>
            <ContactRow personalInfo={personalInfo} spec={safeSpec} />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: `10px ${pad}` }}>
        {safeSpec.sectionOrder.map(sec => renderSection(sec, cvData, personalInfo, safeSpec))}
      </div>
    </div>
  );
}

// ── Two-column / sidebar layout ────────────────────────────────────────────────

function TwoColumnLayout({ cvData, personalInfo, spec, customizations }: Props) {
  const rawSpec = applyCustomizations(spec, customizations);
  const c = rawSpec.colorScheme;
  const t = rawSpec.typography;
  const fontFamily = t.fontFamily === 'serif' ? 'Georgia, serif' : t.fontFamily === 'monospace' ? 'monospace' : 'Inter, sans-serif';
  const sidebarPct = rawSpec.layout.sidebarWidthPercent ?? 30;
  const mainPct = 100 - sidebarPct;
  const isLeft = rawSpec.layout.columns === 'sidebar-left';

  const nameSizeMap = { 'extra-large': '26px', large: '20px', bold: '19px', uppercase: '17px', normal: '17px' };
  const nameSize = nameSizeMap[t.nameStyle] ?? '20px';
  const paddingMap = { tight: '12px', normal: '16px', generous: '22px' };
  const pad = paddingMap[rawSpec.layout.pageMargins] ?? '16px';

  // Sidebar name: auto-scale down for long names so they don't wrap into ugly 3-line stacks.
  // Available sidebar width ≈ sidebarPct% of 794px minus 2×pad.
  const sidebarWidthPx = (sidebarPct / 100) * 794 - 2 * parseInt(pad, 10);
  const nameChars = personalInfo.name.length;
  // Estimate chars-per-line at current font size (rough: 0.62× the px value per char).
  const basePx = parseFloat(nameSize);
  const estimatedLineChars = sidebarWidthPx / (basePx * 0.62);
  const sidebarNameSize = nameChars > estimatedLineChars
    ? `${Math.max(11, Math.floor(sidebarWidthPx / (nameChars * 0.62)))}px`
    : nameSize;

  // Smart sidebar routing: use spec's explicit list when provided, else auto-detect
  const specSidebarKeys = rawSpec.layout.sidebarSections;
  const sidebarSections = specSidebarKeys?.length
    ? rawSpec.sectionOrder.filter(s => specSidebarKeys.includes(s))
    : computeSmartSidebarSections(cvData, rawSpec.sectionOrder);
  const sidebarSet = new Set(sidebarSections);
  const mainSections = rawSpec.sectionOrder.filter(s => !sidebarSet.has(s));

  // Enforce readable colors in main column (doesn't touch sidebar white-on-dark)
  const mainSpec = enforceMainContrast(rawSpec);

  // Sidebar spec — white text on colored background
  const sidebarSpec: TemplateSpec = {
    ...rawSpec,
    colorScheme: {
      ...c,
      headingColor: '#ffffff',
      textPrimary: 'rgba(255,255,255,0.95)',
      textSecondary: 'rgba(255,255,255,0.65)',
      primary: 'rgba(255,255,255,0.9)',
      dividerColor: 'rgba(255,255,255,0.3)',
      sectionHeadingBgColor: 'rgba(255,255,255,0.15)',
    },
  };

  const hasPhoto = rawSpec.decorativeElements.hasPhoto;
  const photoShape = rawSpec.decorativeElements.photoShape ?? 'circle';

  const sidebar = (
    <div style={{ width: `${sidebarPct}%`, flexShrink: 0, backgroundColor: hex(c.sidebarBackground ?? c.primary), padding: pad, color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Photo — real image if provided, initials placeholder otherwise */}
      {hasPhoto && (
        <div className="flex justify-center mb-3">
          <PhotoEl src={personalInfo.photo} shape={photoShape} size={64} fallback={initials(personalInfo.name)} />
        </div>
      )}

      {/* Name block (sidebar-left: name lives here) */}
      {isLeft && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: sidebarNameSize, fontWeight: Number(t.nameFontWeight), color: '#ffffff', lineHeight: 1.15, textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined, wordBreak: 'break-word' }}>
            {personalInfo.name}
          </div>
          {cvData.experience?.[0]?.jobTitle && (
            <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.75)', marginTop: '4px', lineHeight: 1.3 }}>{cvData.experience[0].jobTitle}</div>
          )}
          <div className="mt-1.5 space-y-0.5">
            {[personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).map((item, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '8px' }}>{item}</div>
            ))}
          </div>
        </div>
      )}

      {/* Sidebar sections */}
      {sidebarSections.map(sec => (
        <div key={sec}>{renderSection(sec, cvData, personalInfo, sidebarSpec)}</div>
      ))}
    </div>
  );

  const mc = mainSpec.colorScheme;

  const main = (
    <div style={{ width: `${mainPct}%`, padding: pad, minWidth: 0 }}>
      {/* Name block (sidebar-right: name lives in main column) */}
      {!isLeft && (
        <div style={{ marginBottom: '8px', paddingBottom: '6px', borderBottom: `2px solid ${hex(mc.primary)}` }}>
          <div style={{ fontSize: nameSize, fontWeight: Number(t.nameFontWeight), color: hex(mc.textPrimary), textTransform: t.nameStyle === 'uppercase' ? 'uppercase' : undefined }}>
            {personalInfo.name}
          </div>
          {cvData.experience?.[0]?.jobTitle && (
            <div style={{ fontSize: '9.5px', color: hex(mc.primary), marginTop: '2px' }}>{cvData.experience[0].jobTitle}</div>
          )}
          <ContactRow personalInfo={personalInfo} spec={mainSpec} />
        </div>
      )}
      {mainSections.map(sec => renderSection(sec, cvData, personalInfo, mainSpec))}
    </div>
  );

  return (
    <div style={{ width: '794px', maxHeight: '1123px', overflow: 'hidden', backgroundColor: hex(c.background), fontFamily, display: 'flex' }}>
      {isLeft ? <>{sidebar}{main}</> : <>{main}{sidebar}</>}
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────

const TemplateCustomGenerated: React.FC<Props> = (props) => {
  const { spec } = props;
  const isSidebar = spec.layout.columns === 'sidebar-left' || spec.layout.columns === 'sidebar-right';

  if (isSidebar || spec.layout.columns === 'two-column') {
    return <TwoColumnLayout {...props} />;
  }
  return <SingleColumnLayout {...props} />;
};

export default TemplateCustomGenerated;
