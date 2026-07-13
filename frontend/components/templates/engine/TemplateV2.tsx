import React from 'react';
import { CVData, PersonalInfo, CustomSection, CustomSectionItem } from '../../../types';
import HiddenATSKeywords from '../../HiddenATSKeywords';
import { getTheme, TemplateTheme, ContentDensity, DensityScale, DENSITY_SCALES, applyFontScale } from './templateThemes';
import { FONT_PAIRING_MAP } from './fontPairings';
import { cleanBulletHtml } from '../templateUtils';

interface TemplateV2Props {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (d: CVData) => void;
  jobDescriptionForATS: string;
  themeId: string;
}

// Types already rendered as dedicated sections — exclude from the generic customSections loop
// to prevent the same data appearing twice in the sidebar/main body.
const PROMOTED_SECTION_TYPES = new Set(['certifications', 'achievements', 'awards', 'publications']);

// Semantic constant — always green regardless of theme; signals an active/current role
const LIVE_ROLE_GREEN = '#22c55e';

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
  certsInSidebar: boolean;
  customInSidebar: boolean;
  pubsInSidebar: boolean;
}

function computeSmartSplit(cvData: CVData): SmartSplit {
  // ── Education ────────────────────────────────────────────────────────────────
  // Sidebar: ≤2 entries and no long descriptions (≥60 chars triggers main-col treatment)
  const eduCount = cvData.education?.length ?? 0;
  const eduHasLongDesc = cvData.education?.some(e => (e.description?.length ?? 0) > 60) ?? false;
  const eduInSidebar = eduCount <= 2 && !eduHasLongDesc;

  // ── Projects ─────────────────────────────────────────────────────────────────
  // Route to sidebar whenever ≤4 projects exist. Content length, tech-tag count,
  // and bullet lists are handled in the sidebar renderer itself (description
  // clamped to 2 lines, first bullet used as fallback blurb, tech tags capped at 4)
  // so there is no content-gating here. This keeps Experience dominant in the main
  // column for the vast majority of CVs.
  const projCount = cvData.projects?.length ?? 0;
  const projectsInSidebar = projCount > 0 && projCount <= 4;

  // ── Achievements ─────────────────────────────────────────────────────────────
  // Sidebar: ≤5 items AND individually short (avg ≤ 90 chars)
  const achList = cvData.achievements ?? [];
  const achAvgLen = achList.length > 0
    ? achList.reduce((s, a) => s + a.length, 0) / achList.length
    : 0;
  const achievementsInSidebar = achList.length <= 5 && achAvgLen <= 90;

  // ── References ───────────────────────────────────────────────────────────────
  // Sidebar: ≤2 — brief card style fits; 3+ get the full main-column table
  const refsInSidebar = (cvData.references?.length ?? 0) <= 2;

  // ── Certifications ───────────────────────────────────────────────────────────
  // Always sidebar — compact credential chips never need full width
  const certsInSidebar = (cvData.certifications?.length ?? 0) > 0;

  // ── Publications ─────────────────────────────────────────────────────────────
  // Sidebar: ≤3 items AND short titles AND small author lists
  // Longer academic citation lists always go to main column
  const pubs = cvData.publications ?? [];
  const pubsHaveLongContent = pubs.some(
    p => (p.title?.length ?? 0) > 80 || (p.authors?.length ?? 0) > 3
  );
  const pubsInSidebar = pubs.length > 0 && pubs.length <= 3 && !pubsHaveLongContent;

  // ── Custom sections ───────────────────────────────────────────────────────────
  // Sidebar: only when ALL non-promoted sections have short items (no long descriptions/subtitles)
  // Long items (volunteer role descriptions, patent abstracts) go to main column
  const nonPromotedCustom = (cvData.customSections ?? [])
    .filter(s => !PROMOTED_SECTION_TYPES.has(s.type));
  const customHasContent = nonPromotedCustom.some(s => s.items.some(item => item.title?.trim()));
  const customHasLongItems = nonPromotedCustom.some(s =>
    s.items.some(item => (item.description?.length ?? 0) > 60 || (item.subtitle?.length ?? 0) > 50)
  );
  const customInSidebar = customHasContent && !customHasLongItems;

  return { eduInSidebar, projectsInSidebar, achievementsInSidebar, refsInSidebar, certsInSidebar, customInSidebar, pubsInSidebar };
}

// ─── Inline-edit helper ───────────────────────────────────────────────────────
function editable(isEditing: boolean, onBlur: (v: string) => void): React.HTMLAttributes<HTMLElement> {
  if (!isEditing) return {};
  return {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      (e.currentTarget as HTMLElement).style.outline = 'none';
      (e.currentTarget as HTMLElement).style.background = 'transparent';
      onBlur(e.currentTarget.innerText.trim());
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      (e.currentTarget as HTMLElement).style.outline = '1.5px dashed #2563eb88';
      (e.currentTarget as HTMLElement).style.outlineOffset = '2px';
      (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.04)';
      (e.currentTarget as HTMLElement).style.borderRadius = '2px';
    },
    style: { cursor: 'text', outline: 'none' },
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
  const centered = theme.headerAlign === 'center';

  return (
    <div>
      {theme.accentBar && <div style={{ height: 5, background: theme.accentBar }} />}
      <div style={{ background: theme.headerBg, padding: theme.headerPadding, borderBottom: !isDark ? `1px solid ${theme.borderColor}` : 'none', textAlign: centered ? 'center' : 'left' }}>
        <div
          style={{ fontSize: theme.headerNameSize, fontWeight: theme.headerNameWeight as any, color: theme.headerText, fontFamily: theme.fontHeading, lineHeight: 1.1, marginBottom: 4, textTransform: theme.headerNameStyle === 'uppercase' ? 'uppercase' : 'none', letterSpacing: theme.headerNameStyle === 'uppercase' ? '0.08em' : 'normal' }}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 3, marginTop: 2, justifyContent: centered ? 'center' : 'flex-start' }}>
            {contacts.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', fontSize: sc.metaSize, color: theme.headerText, fontFamily: theme.fontBody }}>
                <ContactIcon type={c.type} color={theme.headerText} />
                {c.label}
              </span>
            ))}
          </div>
        )}
        {/* Decorative separator below contacts for centred-header themes */}
        {centered && contacts.length > 0 && (
          <div style={{ width: '45%', borderTop: `1px solid ${isDark ? theme.headerText + '35' : theme.borderColor}`, margin: '10px auto 0' }} />
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
  if (theme.sectionDecoration === 'double-rule') return (
    <div style={{ ...wrap }}>
      <span style={base}>{title}</span>
      <div style={{ borderTop: `1.5px solid ${theme.sectionBorderColor}`, marginTop: 4 }} />
      <div style={{ borderTop: `0.5px solid ${theme.sectionBorderColor}55`, marginTop: 2 }} />
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
    <span style={{ color: theme.bodyMuted, fontSize: '8px', marginTop: '2.5px', flexShrink: 0, fontFamily: theme.fontBody }}>{theme.bulletChar}</span>
    <span style={{ fontSize: sc.bodySize, color: theme.bodyText, lineHeight: sc.lineH, fontFamily: theme.fontBody, flex: 1 }} {...editable(isEditing, onBlur)}>{cleanBulletHtml(text)}</span>
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
    {sub && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontWeight: 600, fontFamily: theme.fontBody, marginTop: 1 }}>{sub}</div>}
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
      <p style={{ fontSize: sc.bodySize, color: theme.bodyText, lineHeight: sc.lineH, margin: 0, fontFamily: theme.fontBody }}
        {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.summary = v; onChange(d); })}>
        {cvData.summary}
      </p>
    </Section>
  );
};

// Detect if a date range includes a "current/present" indicator
function isCurrentRole(dates?: string): boolean {
  if (!dates) return false;
  return /present|current|now|ongoing/i.test(dates);
}

const ExperienceSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing, onChange }) => {
  if (!cvData.experience?.length) return null;
  const multi = cvData.experience.length > 1;
  return (
    <Section sc={sc}>
      <SectionHeading title="Experience" theme={theme} sc={sc} />
      {cvData.experience.map((exp, ei) => (
        <div key={ei} style={{ marginBottom: sc.itemGap }}>
          {/* Subtle separator between roles — only from the 2nd item onward */}
          {multi && ei > 0 && (
            <div style={{ borderTop: `1px solid ${theme.borderColor}`, marginBottom: sc.itemGap, opacity: 0.55 }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}
              {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.experience[ei].company = v; onChange(d); })}>{exp.company}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isCurrentRole(exp.dates) && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: LIVE_ROLE_GREEN, display: 'inline-block', boxShadow: `0 0 0 2px ${LIVE_ROLE_GREEN}33` }} title="Current role" />
              )}
              <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}
                {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.experience[ei].dates = v; onChange(d); })}>{exp.dates}</span>
            </span>
          </div>
          {exp.jobTitle && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontWeight: 600, fontFamily: theme.fontBody, marginBottom: 1 }}
            {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.experience[ei].jobTitle = v; onChange(d); })}>{exp.jobTitle}</div>}
          {exp.location && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, marginBottom: 2 }}
            {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.experience[ei].location = v; onChange(d); })}>{exp.location}</div>}
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

// Format education date range from startYear + year fields
function eduDateRange(startYear?: string, year?: string): string {
  if (startYear && year && startYear !== year) return `${startYear} – ${year}`;
  if (year) return year;
  return '';
}

const EducationSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing: boolean; onChange: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing, onChange }) => {
  if (!cvData.education?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Education" theme={theme} sc={sc} />
      {cvData.education.map((edu, i) => {
        const dateRange = eduDateRange(edu.startYear, edu.year);
        return (
          <div key={i} style={{ marginBottom: sc.itemGap }}>
            {/* Degree first — it's the credential that matters most */}
            {edu.degree && (
              <div style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody, lineHeight: 1.3, marginBottom: 2 }}
                {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.education[i].degree = v; onChange(d); })}>
                {edu.degree}
              </div>
            )}
            {/* School + date range on the same line */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, fontWeight: 500 }}
                {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.education[i].school = v; onChange(d); })}>
                {edu.school}
              </span>
              {dateRange && (
                <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, fontWeight: 500, flexShrink: 0 }}>
                  {dateRange}
                </span>
              )}
            </div>
            {edu.description && (
              <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, marginTop: 3, fontFamily: theme.fontBody, lineHeight: sc.lineH }}
                {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.education[i].description = v; onChange(d); })}>
                {edu.description}
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
};

const ProjectsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing?: boolean; onChange?: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing = false, onChange = () => {} }) => {
  if (!cvData.projects?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Projects" theme={theme} sc={sc} />
      {cvData.projects.map((p, i) => (
        <div key={i} style={{ marginBottom: sc.itemGap }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}
              {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.projects![i].name = v; onChange(d); })}>{p.name}</span>
            {p.year && <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}
              {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.projects![i].year = v; onChange(d); })}>{p.year}</span>}
          </div>
          {p.description && <div style={{ fontSize: sc.bodySize, color: theme.bodyText, lineHeight: sc.lineH, marginTop: 2, fontFamily: theme.fontBody }}
            {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.projects![i].description = v; onChange(d); })}>{p.description}</div>}
          {p.bullets?.length ? (
            <div style={{ marginTop: 3 }}>
              {p.bullets.map((b, bi) => (
                <Bullet key={bi} text={b} theme={theme} sc={sc} isEditing={isEditing}
                  onBlur={v => { const d = JSON.parse(JSON.stringify(cvData)); d.projects![i].bullets![bi] = v; onChange(d); }} />
              ))}
            </div>
          ) : null}
          {p.technologies?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {p.technologies.map((t, ti) => <Tag key={ti} label={t} theme={theme} sc={sc} />)}
            </div>
          ) : null}
          {p.link && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, marginTop: 2, fontFamily: theme.fontBody }}
            {...editable(isEditing, v => { const d = JSON.parse(JSON.stringify(cvData)); d.projects![i].link = v; onChange(d); })}>{p.link}</div>}
        </div>
      ))}
    </Section>
  );
};

const SkillsSection: React.FC<{ skills: string[]; theme: TemplateTheme; sc: DensityScale }> = ({ skills, theme, sc }) => {
  if (!skills?.length) return null;
  // ≤8 skills: inline tag chips — clean and modern
  // >8 skills: 2/3-col bullet grid — saves space and looks organised
  const useGrid = skills.length > 8;
  const cols = skills.length > 10 ? 3 : 2;
  return (
    <Section sc={sc}>
      <SectionHeading title="Core Skills" theme={theme} sc={sc} />
      {useGrid ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '4px 12px' }}>
          {skills.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ color: theme.bodyMuted, fontSize: '5px', flexShrink: 0, lineHeight: 1 }}>◆</span>
              <span style={{ fontSize: sc.bodySize, color: theme.bodyText, fontFamily: theme.fontBody, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {skills.map((s, i) => <Tag key={i} label={s} theme={theme} sc={sc} />)}
        </div>
      )}
    </Section>
  );
};

// Map proficiency text to 1-5 dot count for quick visual scanning
function proficiencyDots(p?: string): number {
  const s = (p ?? '').toLowerCase();
  if (s.includes('native') || s.includes('mother') || s.includes('bilingual')) return 5;
  if (s.includes('fluent') || s.includes('full prof') || s.includes('advanced') || s.includes('c2') || s.includes('c1')) return 4;
  if (s.includes('professional') || s.includes('upper') || s.includes('b2') || s.includes('b1') || s.includes('intermediate')) return 3;
  if (s.includes('basic') || s.includes('elementary') || s.includes('limited') || s.includes('a2') || s.includes('a1') || s.includes('beginner')) return 2;
  return 3; // unknown → assume intermediate
}

const LanguagesSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale }> = ({ cvData, theme, sc }) => {
  if (!cvData.languages?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Languages" theme={theme} sc={sc} />
      {cvData.languages.map((l, i) => {
        const dots = proficiencyDots(l.proficiency);
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: sc.bodySize, fontFamily: theme.fontBody, color: theme.bodyText, fontWeight: 600 }}>{l.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ width: 7, height: 7, borderRadius: '50%', background: n <= dots ? theme.bodyMuted : theme.borderColor, flexShrink: 0, display: 'inline-block' }} />
              ))}
            </span>
          </div>
        );
      })}
    </Section>
  );
};

const CertificationsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing?: boolean; onChange?: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing = false, onChange = () => {} }) => {
  if (!cvData.certifications?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Certifications" theme={theme} sc={sc} />
      {cvData.certifications.map((c, i) => {
        const name   = typeof c === 'string' ? c : c.name;
        const issuer = typeof c !== 'string' ? c.issuer : null;
        const year   = typeof c !== 'string' ? c.year   : null;
        const updateCert = (field: string, v: string) => {
          const d = JSON.parse(JSON.stringify(cvData));
          if (typeof d.certifications[i] === 'string') {
            d.certifications[i] = { name: d.certifications[i], [field]: v };
          } else {
            (d.certifications[i] as any)[field] = v;
          }
          onChange(d);
        };
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: sc.bulletGap + 3 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: sc.bodySize, fontWeight: 600, color: theme.bodyText, fontFamily: theme.fontBody, lineHeight: 1.35 }}
                {...editable(isEditing, v => updateCert('name', v))}>{name}</div>
              {issuer && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, marginTop: 1 }}
                {...editable(isEditing, v => updateCert('issuer', v))}>{issuer}</div>}
            </div>
            {year && (
              <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody, fontWeight: 500, flexShrink: 0, marginTop: 1 }}
                {...editable(isEditing, v => updateCert('year', v))}>{year}</span>
            )}
          </div>
        );
      })}
    </Section>
  );
};

const AchievementsSection: React.FC<{ cvData: CVData; theme: TemplateTheme; sc: DensityScale; isEditing?: boolean; onChange?: (d: CVData) => void }> = ({ cvData, theme, sc, isEditing = false, onChange = () => {} }) => {
  if (!cvData.achievements?.length) return null;
  return (
    <Section sc={sc}>
      <SectionHeading title="Achievements" theme={theme} sc={sc} />
      {cvData.achievements.map((a, i) => (
        <Bullet key={i} text={a} theme={theme} sc={sc} isEditing={isEditing}
          onBlur={v => { const d = JSON.parse(JSON.stringify(cvData)); d.achievements![i] = v; onChange(d); }} />
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
          {p.link && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{p.link}</div>}
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
            <div style={{ color: theme.bodyMuted }}>{r.email}</div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const CustomSectionsBlock: React.FC<{ sections: CustomSection[]; theme: TemplateTheme; sc: DensityScale }> = ({ sections, theme, sc }) => {
  if (!sections?.length) return null;
  // Filter out sections with no filled items to avoid phantom section headings
  const filledSections = sections.filter(sec => sec.items.some(item => item.title?.trim()));
  if (!filledSections.length) return null;
  return (
    <>
      {filledSections.map(sec => (
        <Section key={sec.id} sc={sc}>
          <SectionHeading title={sec.label} theme={theme} sc={sc} />
          {sec.items.filter((item: CustomSectionItem) => item.title?.trim()).map((item: CustomSectionItem, i) => (
            <div key={i} style={{ marginBottom: sc.itemGap }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: sc.bodySize, fontWeight: 700, color: theme.bodyText, fontFamily: theme.fontBody }}>{item.title}</span>
                {item.year && <span style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontFamily: theme.fontBody }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, fontWeight: 600, fontFamily: theme.fontBody }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, lineHeight: sc.lineH, marginTop: 2, fontFamily: theme.fontBody }}>{item.description}</div>}
              {item.link && <div style={{ fontSize: sc.metaSize, color: theme.bodyMuted, marginTop: 1, fontFamily: theme.fontBody }}>{item.link}</div>}
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
              <span key={i} style={{ fontSize: sc.tagSize, padding: '2px 6px', borderRadius: '3px', background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.tagBorder}`, fontFamily: theme.fontBody }}>
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
          {cvData.education.map((edu, i) => {
            const dateRange = eduDateRange(edu.startYear, edu.year);
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                {edu.degree && <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 700, color: textColor, fontFamily: theme.fontBody, lineHeight: 1.3 }}>{edu.degree}</div>}
                <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody, lineHeight: sc.lineH, marginTop: 1 }}>{edu.school}</div>
                {dateRange && <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody, marginTop: 1, fontWeight: 500 }}>{dateRange}</div>}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Projects — sidebar card layout: description clamped to 2 lines,
          first bullet used as blurb fallback, tech chips capped at 4 */}
      {split.projectsInSidebar && cvData.projects?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Projects" theme={theme} sc={sc} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cvData.projects.map((p, i) => {
              // Prefer prose description; fall back to first bullet when only bullets exist
              const blurb = p.description?.trim() || (p.bullets?.[0] ?? '');
              const extraTech = (p.technologies?.length ?? 0) > 4 ? (p.technologies!.length - 4) : 0;
              return (
                <div key={i} style={{
                  borderLeft: `2px solid ${theme.accent}40`,
                  paddingLeft: 7,
                }}>
                  {/* Name + optional year */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                    <span style={{
                      fontSize: sc.sidebarBodySize, fontWeight: 700,
                      color: textColor, fontFamily: theme.fontBody, lineHeight: 1.3,
                    }}>{p.name}</span>
                    {p.year && (
                      <span style={{
                        fontSize: sc.metaSize, color: mutedColor,
                        fontFamily: theme.fontBody, flexShrink: 0,
                      }}>{p.year}</span>
                    )}
                  </div>

                  {/* Description — hard-clamped to 2 lines so long text never blows the sidebar */}
                  {blurb && (
                    <div style={{
                      fontSize: sc.metaSize, color: mutedColor,
                      fontFamily: theme.fontBody, lineHeight: 1.45, marginTop: 2,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    }}>{blurb}</div>
                  )}

                  {/* Tech chips — up to 4, overflow shown as "+N" */}
                  {p.technologies?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 4px', marginTop: 4 }}>
                      {p.technologies.slice(0, 4).map((t, ti) => (
                        <span key={ti} style={{
                          fontSize: sc.tagSize, color: mutedColor,
                          fontFamily: theme.fontBody, background: theme.tagBg,
                          border: `1px solid ${theme.tagBorder}`,
                          borderRadius: '3px', padding: '1px 4px',
                          whiteSpace: 'nowrap',
                        }}>{t}</span>
                      ))}
                      {extraTech > 0 && (
                        <span style={{
                          fontSize: sc.tagSize, color: mutedColor,
                          fontFamily: theme.fontBody,
                        }}>+{extraTech}</span>
                      )}
                    </div>
                  ) : null}

                  {/* Link — stripped of protocol, truncated if long */}
                  {p.link && (
                    <div style={{
                      fontSize: sc.metaSize, color: mutedColor,
                      fontFamily: theme.fontBody, marginTop: 3,
                      textDecoration: 'underline', textDecorationColor: `${mutedColor}66`,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.link.replace(/^https?:\/\/(www\.)?/, '')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Achievements — only when smart-split says they're short enough */}
      {split.achievementsInSidebar && cvData.achievements?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Highlights" theme={theme} sc={sc} />
          {cvData.achievements.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ color: mutedColor, fontSize: sc.metaSize, marginTop: '1px', flexShrink: 0 }}>★</span>
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
              <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody }}>{r.company}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Publications — compact sidebar version (title + year only).
          Only rendered here when smart-split decided they're short enough for sidebar.
          Long academic citation lists are routed to main column instead. */}
      {split.pubsInSidebar && cvData.publications?.length ? (
        <div style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title="Publications" theme={theme} sc={sc} />
          {cvData.publications.map((p, i) => (
            <div key={i} style={{ marginBottom: 5 }}>
              <div style={{ fontSize: sc.sidebarBodySize, fontWeight: 600, color: textColor, fontFamily: theme.fontBody, lineHeight: sc.lineH }}>{p.title}</div>
              <div style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody }}>{[p.journal, p.year].filter(Boolean).join(' · ')}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Additional Sections (Volunteer, Presentations, Patents, etc.)
          Only rendered here when smart-split decided they're short enough for sidebar.
          Long descriptions/subtitles are routed to main column instead.
          Promoted types (certifications, awards, publications) are excluded — they have
          their own dedicated blocks above. */}
      {split.customInSidebar && cvData.customSections?.filter(sec => !PROMOTED_SECTION_TYPES.has(sec.type)).map(sec => (
        <div key={sec.id} style={{ marginBottom: sc.sectionGap }}>
          <SidebarHead title={sec.label} theme={theme} sc={sc} />
          {sec.items.filter(item => item.title?.trim()).map((item, i) => (
            <div key={i} style={{ marginBottom: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: sc.sidebarBodySize, fontWeight: 700, color: textColor, fontFamily: theme.fontBody, lineHeight: sc.lineH }}>{item.title}</span>
                {item.year && <span style={{ fontSize: sc.metaSize, color: mutedColor, fontFamily: theme.fontBody, flexShrink: 0 }}>{item.year}</span>}
              </div>
              {item.subtitle && <div style={{ fontSize: sc.metaSize, color: mutedColor, fontWeight: 600, fontFamily: theme.fontBody }}>{item.subtitle}</div>}
              {item.description && <div style={{ fontSize: sc.metaSize, color: mutedColor, lineHeight: sc.lineH, marginTop: 2, fontFamily: theme.fontBody }}>{item.description}</div>}
            </div>
          ))}
        </div>
      ))}

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
    {!split?.projectsInSidebar && <ProjectsSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />}
    {/* Publications go to sidebar; only show here on single-col layouts */}
    {!split?.pubsInSidebar && <PublicationsSection cvData={cvData} theme={theme} sc={sc} />}
    {/* Additional Sections go to sidebar; only show here on single-col layouts.
        Filter promoted types (certifications, awards, publications) — already rendered above. */}
    {!split?.customInSidebar && <CustomSectionsBlock sections={(cvData.customSections ?? []).filter(s => !PROMOTED_SECTION_TYPES.has(s.type))} theme={theme} sc={sc} />}
    {/* Certifications go to sidebar; only show here on single-col layouts */}
    {!split?.certsInSidebar && <CertificationsSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />}
    {/* Achievements in main only when too many for sidebar */}
    {!split?.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />}
    {/* References in main only when too many for sidebar */}
    {!split?.refsInSidebar && <ReferencesSection cvData={cvData} theme={theme} sc={sc} />}
  </div>
);

// ─── One-page boundary indicator ─────────────────────────────────────────────
// Shows a dashed red line at the exact A4 page-1 boundary in the preview.
// Hidden from PDF via data-pdf-hide — only the user ever sees it.
const OnePageBoundary: React.FC = () => (
  <div
    data-pdf-hide="true"
    style={{ position: 'absolute', top: '297mm', left: 0, right: 0, zIndex: 20, pointerEvents: 'none' }}
  >
    <div style={{ borderTop: '1.5px dashed #ef4444', position: 'relative' }}>
      <span style={{
        position: 'absolute', top: -9, right: 0,
        background: '#ef4444', color: '#fff',
        fontSize: 8, fontWeight: 700, padding: '1px 5px',
        borderRadius: '3px 0 0 3px', letterSpacing: '0.06em',
        fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
      }}>
        PAGE 1 END
      </span>
    </div>
  </div>
);

// ─── Layouts ──────────────────────────────────────────────────────────────────
const LayoutSingleColumn: React.FC<LayoutProps> = (props) => {
  const { theme, cvData, sc, isEditing, onChange } = props;
  const customSections = (cvData.customSections ?? []).filter(s => !PROMOTED_SECTION_TYPES.has(s.type));
  // Shared tail sections (same for both orderings)
  const TailSections = () => (
    <>
      <CustomSectionsBlock    sections={customSections} theme={theme} sc={sc} />
      <CertificationsSection  cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
      <LanguagesSection       cvData={cvData} theme={theme} sc={sc} />
      <AchievementsSection    cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
      <ReferencesSection      cvData={cvData} theme={theme} sc={sc} />
      <PublicationsSection    cvData={cvData} theme={theme} sc={sc} />
    </>
  );
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm', position: 'relative' }}>
      {cvData.onePage && <OnePageBoundary />}
      <CVHeader pi={props.pi} theme={theme} sc={sc} isEditing={isEditing}
        onUpdate={(f, v) => { const d = JSON.parse(JSON.stringify(cvData)); if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any)[f] = v; onChange(d); }} />
      <div style={{ padding: sc.bodyPad }}>
        {theme.skillsFirst ? (
          /* Skills-first order: Summary → Core Skills → Experience → Education → Projects → Extras
             Used for career-change and skills-led hiring where ATS scorecard maps skills first. */
          <>
            <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <SkillsSection     skills={cvData.skills} theme={theme} sc={sc} />
            <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <EducationSection  cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <ProjectsSection   cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <TailSections />
          </>
        ) : (
          /* Standard recruiter-expected order: Summary → Experience → Education → Skills → Projects → Extras */
          <>
            <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <EducationSection  cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <SkillsSection     skills={cvData.skills} theme={theme} sc={sc} />
            <ProjectsSection   cvData={cvData} theme={theme} sc={sc} isEditing={isEditing} onChange={onChange} />
            <TailSections />
          </>
        )}
      </div>
    </div>
  );
};

const LayoutSidebarLeft: React.FC<LayoutProps> = (props) => {
  const split = computeSmartSplit(props.cvData);
  return (
    <div style={{ background: props.theme.bodyBg, minHeight: '280mm', position: 'relative' }}>
      {props.cvData.onePage && <OnePageBoundary />}
      <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing}
        onUpdate={(f, v) => { const d = JSON.parse(JSON.stringify(props.cvData)); if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any)[f] = v; props.onChange(d); }} />
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
    <div style={{ background: props.theme.bodyBg, minHeight: '280mm', position: 'relative' }}>
      {props.cvData.onePage && <OnePageBoundary />}
      <CVHeader pi={props.pi} theme={props.theme} sc={props.sc} isEditing={props.isEditing}
        onUpdate={(f, v) => { const d = JSON.parse(JSON.stringify(props.cvData)); if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any)[f] = v; props.onChange(d); }} />
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
  // Right-column theme: use sidebar text colours + sidebar-appropriate heading style
  const rightColTheme: TemplateTheme = {
    ...theme,
    bodyText: theme.sidebarText || theme.bodyText,
    bodyMuted: theme.sidebarMuted || theme.bodyMuted,
    sectionColor: theme.accent,
    sectionDecoration: 'caps-line',
    sectionBorderColor: theme.accent + '44',
  };
  return (
    <div style={{ background: theme.bodyBg, minHeight: '280mm', position: 'relative' }}>
      {cvData.onePage && <OnePageBoundary />}
      <CVHeader pi={props.pi} theme={theme} sc={sc} isEditing={props.isEditing}
        onUpdate={(f, v) => { const d = JSON.parse(JSON.stringify(cvData)); if (!d.personalInfo) d.personalInfo = {} as any; (d.personalInfo as any)[f] = v; props.onChange(d); }} />
      <div style={{ display: 'flex', minHeight: '230mm' }}>
        {/* Main column: summary, experience, (projects if long), publications, custom */}
        <div style={{ flex: 1, padding: sc.sidebarPad, borderRight: `1px solid ${theme.borderColor}` }}>
          <SummarySection    cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <ExperienceSection cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          {!split.projectsInSidebar && <ProjectsSection cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />}
          <PublicationsSection cvData={cvData} theme={theme} sc={sc} />
          <CustomSectionsBlock sections={cvData.customSections ?? []} theme={theme} sc={sc} />
          {!split.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={theme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />}
          {!split.refsInSidebar && <ReferencesSection cvData={cvData} theme={theme} sc={sc} />}
        </div>
        {/* Side column: skills, education, languages, certs, (short projects), (achievements), (refs) */}
        <div style={{ width: theme.sidebarWidth, background: theme.sidebarBg, padding: sc.sidebarPad }}>
          {cvData.skills?.length > 0 && (
            <div style={{ marginBottom: sc.sectionGap }}>
              <SidebarHead title="Skills" theme={theme} sc={sc} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {cvData.skills.map((s, i) => (
                  <span key={i} style={{ fontSize: sc.tagSize, padding: '2px 6px', borderRadius: '3px', background: rightColTheme.tagBg, color: rightColTheme.tagText, border: `1px solid ${rightColTheme.tagBorder}`, fontFamily: theme.fontBody }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Education always in right column for two-col */}
          <EducationSection      cvData={cvData} theme={rightColTheme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          <LanguagesSection      cvData={cvData} theme={rightColTheme} sc={sc} />
          <CertificationsSection cvData={cvData} theme={rightColTheme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />
          {split.projectsInSidebar    && <ProjectsSection    cvData={cvData} theme={rightColTheme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />}
          {split.achievementsInSidebar && <AchievementsSection cvData={cvData} theme={rightColTheme} sc={sc} isEditing={props.isEditing} onChange={props.onChange} />}
          {split.refsInSidebar        && <ReferencesSection   cvData={cvData} theme={rightColTheme} sc={sc} />}
        </div>
      </div>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
const TemplateV2: React.FC<TemplateV2Props> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, themeId }) => {
  let theme = { ...getTheme(themeId) };

  // One-page mode: force compact density so content has the best chance of fitting
  // on a single A4 page. The visual page-boundary indicator shows the user exactly
  // where page 1 ends so they can trim any overflow manually.
  const rawDensity = detectDensity(cvData);
  const density: ContentDensity = cvData.onePage
    ? (rawDensity === 'spacious' ? 'balanced' : 'compact')
    : rawDensity;

  const sc = applyFontScale(DENSITY_SCALES[density], cvData.fontScale ?? 1);

  // Apply user accent-colour override.
  // ONLY section-heading tokens change — headerTitleColor, tagText/tagBg/tagBorder
  // stay at their fixed theme-defined neutral values so skill tags and the
  // professional-title subtitle never inherit the user's accent pick.
  if (cvData.accentColor) {
    const c = cvData.accentColor;
    theme = {
      ...theme,
      accent: c,
      sectionBorderColor: c,
      accentBar: theme.accentBar ? c : undefined,
    };
  }

  // Apply user font-pairing override
  if (cvData.fontPairing && FONT_PAIRING_MAP[cvData.fontPairing]) {
    const fp = FONT_PAIRING_MAP[cvData.fontPairing];
    theme = { ...theme, fontHeading: fp.heading, fontBody: fp.body };
  }

  // Apply user bullet-style override
  if (cvData.bulletStyle) {
    theme = { ...theme, bulletChar: cvData.bulletStyle };
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
