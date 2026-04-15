import React from 'react';
import { CVData, PersonalInfo, TemplateName, CustomSection, CVReference } from '../types';
import TemplateModern from './templates/TemplateModern';
import TemplateProfessional from './templates/TemplateProfessional';
import TemplateMinimalist from './templates/TemplateMinimalist';
import TemplateCorporate from './templates/TemplateCorporate';
import TemplateCreative from './templates/TemplateCreative';
import TemplateTimeline from './templates/TemplateTimeline';
import TemplateTwoColumnBlue from './templates/TemplateTwoColumnBlue';
import TemplateExecutive from './templates/TemplateExecutive';
import TemplateTechnical from './templates/TemplateTechnical';
import TemplateCompact from './templates/TemplateCompact';
import TemplateElegant from './templates/TemplateElegant';
import TemplateSoftwareEngineer from './templates/TemplateSoftwareEngineer';
import TemplateModernTech from './templates/TemplateModernTech';
import TemplateInfographic from './templates/TemplateInfographic';
import TemplateClassic from './templates/TemplateClassic';
import TemplateStandardPro from './templates/TemplateStandardPro';
import TemplateHarvardGold from './templates/TemplateHarvardGold';
import TemplateTokyoNight from './templates/TemplateTokyoNight';
import TemplateParisVibe from './templates/TemplateParisVibe';
import TemplateLondonFinance from './templates/TemplateLondonFinance';
import TemplateBerlinDesign from './templates/TemplateBerlinDesign';
import TemplateSiliconValley from './templates/TemplateSiliconValley';
import TemplateSydneyCreative from './templates/TemplateSydneyCreative';
import TemplateScholarshipPro from './templates/TemplateScholarshipPro';
import TemplateMedicalStandard from './templates/TemplateMedicalStandard';
import TemplateNavySidebar from './templates/TemplateNavySidebar';
import TemplatePhotoSidebar from './templates/TemplatePhotoSidebar';
import TemplateSWEElite from './templates/TemplateSWEElite';
import TemplateATSCleanPro from './templates/TemplateATSCleanPro';
import TemplateExecutiveSidebar from './templates/TemplateExecutiveSidebar';


interface CVPreviewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing?: boolean;
  onDataChange?: (newData: CVData) => void;
  jobDescriptionForATS?: string;
  template: TemplateName;
}

// ─── Sidebar template detection ──────────────────────────────────────────────
const SIDEBAR_TEMPLATES: TemplateName[] = ['navy-sidebar', 'executive-sidebar', 'photo-sidebar'];

// Templates that already render references internally via their renderSection switch.
// For these templates, we skip references in AdditionalSectionsBlock to avoid duplicates.
const TEMPLATES_WITH_NATIVE_REFERENCES: TemplateName[] = [
  'timeline', 'elegant', 'technical', 'corporate', 'standard-pro', 'swe-clean',
  'minimalist', 'classic', 'software-engineer', 'professional', 'ats-clean-pro',
  'executive', 'harvard-gold', 'london-finance',
];

// Sidebar widths as percentage strings (matches each template's left column width)
const SIDEBAR_WIDTH_MAP: Partial<Record<TemplateName, string>> = {
  'navy-sidebar':       '35%',
  'executive-sidebar':  '34%',
  'photo-sidebar':      '34%',
};

// ─── Section header shared style ─────────────────────────────────────────────
const SectionDivider: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ borderBottom: '1.5px solid #222', marginBottom: '8px', paddingBottom: '2px', marginTop: '20px' }}>
    <h2 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0, color: '#111' }}>
      {label}
    </h2>
  </div>
);

// ─── References Block ─────────────────────────────────────────────────────────
const ReferencesBlock: React.FC<{ references: CVReference[] }> = ({ references }) => (
  <>
    <SectionDivider label="References" />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px' }}>
      {references.map((ref, i) => (
        <div key={i} style={{ fontSize: '10.5px', color: '#444' }}>
          <div style={{ fontWeight: 700, color: '#111', fontSize: '11px' }}>{ref.name}</div>
          {(ref.title || ref.company) && (
            <div style={{ color: '#555' }}>{[ref.title, ref.company].filter(Boolean).join(', ')}</div>
          )}
          {ref.relationship && <div style={{ color: '#666', fontStyle: 'italic' }}>{ref.relationship}</div>}
          {ref.email && <div>{ref.email}</div>}
          {ref.phone && <div>{ref.phone}</div>}
        </div>
      ))}
    </div>
  </>
);

// ─── Custom Sections Renderer ────────────────────────────────────────────────
// Renders user-defined extra sections (Awards, Certifications, etc.)
// after the template's built-in content with neutral, professional styling.

interface AdditionalSectionsBlockProps {
  sections: CustomSection[];
  references?: CVReference[];
  template: TemplateName;
}

const AdditionalSectionsBlock: React.FC<AdditionalSectionsBlockProps> = ({ sections, references, template }) => {
  const hasCustom = sections && sections.length > 0;
  const hasRefs = references && references.length > 0;
  if (!hasCustom && !hasRefs) return null;

  const isSidebar = SIDEBAR_TEMPLATES.includes(template);
  const sidebarWidth = SIDEBAR_WIDTH_MAP[template] ?? '35%';

  const wrapperStyle: React.CSSProperties = isSidebar
    ? {
        marginLeft: sidebarWidth,
        padding: '0 32px 32px',
        fontFamily: 'inherit',
        background: '#fff',
      }
    : {
        padding: '0 40px 32px',
        fontFamily: 'inherit',
        background: '#fff',
      };

  return (
    <div style={wrapperStyle}>
      {hasRefs && <ReferencesBlock references={references!} />}

      {hasCustom && sections.map(section => (
        <div key={section.id}>
          <SectionDivider label={section.label} />
          <div>
            {section.items.map(item => (
              <div key={item.id} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#111' }}>
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span style={{ fontSize: '10.5px', fontWeight: 400, color: '#555' }}>
                        — {item.subtitle}
                      </span>
                    )}
                  </div>
                  {item.year && (
                    <span style={{ fontSize: '10px', color: '#777', whiteSpace: 'nowrap' }}>
                      {item.year}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p style={{ fontSize: '10.5px', color: '#444', margin: '2px 0 0', lineHeight: 1.5 }}>
                    {item.description}
                  </p>
                )}
                {item.link && (
                  <a
                    href={item.link}
                    style={{ fontSize: '10px', color: '#3b82f6', textDecoration: 'none' }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.link}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main CVPreview ──────────────────────────────────────────────────────────

const CVPreview: React.FC<CVPreviewProps> = (props) => {
  const {
    template,
    cvData,
    personalInfo,
    isEditing = false,
    onDataChange = () => {},
    jobDescriptionForATS = '',
  } = props;

  const templateProps = { cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS };

  const renderTemplate = () => {
    switch (template) {
      case 'modern':             return <TemplateModern {...templateProps} />;
      case 'professional':       return <TemplateProfessional {...templateProps} />;
      case 'minimalist':         return <TemplateMinimalist {...templateProps} />;
      case 'corporate':          return <TemplateCorporate {...templateProps} />;
      case 'creative':           return <TemplateCreative {...templateProps} />;
      case 'timeline':           return <TemplateTimeline {...templateProps} />;
      case 'twoColumnBlue':      return <TemplateTwoColumnBlue {...templateProps} />;
      case 'executive':          return <TemplateExecutive {...templateProps} />;
      case 'technical':          return <TemplateTechnical {...templateProps} />;
      case 'compact':            return <TemplateCompact {...templateProps} />;
      case 'elegant':            return <TemplateElegant {...templateProps} />;
      case 'software-engineer':  return <TemplateSoftwareEngineer {...templateProps} />;
      case 'modern-tech':        return <TemplateModernTech {...templateProps} />;
      case 'infographic':        return <TemplateInfographic {...templateProps} />;
      case 'classic':            return <TemplateClassic {...templateProps} />;
      case 'standard-pro':       return <TemplateStandardPro {...templateProps} />;
      case 'harvard-gold':       return <TemplateHarvardGold {...templateProps} />;
      case 'tokyo-night':        return <TemplateTokyoNight {...templateProps} />;
      case 'paris-vibe':         return <TemplateParisVibe {...templateProps} />;
      case 'london-finance':     return <TemplateLondonFinance {...templateProps} />;
      case 'berlin-design':      return <TemplateBerlinDesign {...templateProps} />;
      case 'silicon-valley':     return <TemplateSiliconValley {...templateProps} />;
      case 'sydney-creative':    return <TemplateSydneyCreative {...templateProps} />;
      case 'scholarship-pro':    return <TemplateScholarshipPro {...templateProps} />;
      case 'medical-standard':   return <TemplateMedicalStandard {...templateProps} />;
      case 'navy-sidebar':       return <TemplateNavySidebar {...templateProps} />;
      case 'photo-sidebar':      return <TemplatePhotoSidebar {...templateProps} />;
      case 'swe-elite':          return <TemplateSWEElite {...templateProps} />;
      case 'ats-clean-pro':      return <TemplateATSCleanPro {...templateProps} />;
      case 'executive-sidebar':  return <TemplateExecutiveSidebar {...templateProps} />;
      default:                   return <TemplateProfessional {...templateProps} />;
    }
  };

  const customSections = cvData.customSections || [];

  // References that templates don't already handle via their internal sectionOrder
  // switch are surfaced here so they always appear in the preview and PDF.
  // Templates in TEMPLATES_WITH_NATIVE_REFERENCES already render references
  // themselves, so we skip them here to avoid duplication.
  const templateHandlesReferences = TEMPLATES_WITH_NATIVE_REFERENCES.includes(template);
  const referencesForBlock =
    !templateHandlesReferences && cvData.references && cvData.references.length > 0
      ? cvData.references
      : undefined;

  const showAdditionalBlock =
    customSections.length > 0 || (referencesForBlock && referencesForBlock.length > 0);

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div id="cv-preview-area" data-cv-preview="true" className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
        {showAdditionalBlock && (
          <AdditionalSectionsBlock
            sections={customSections}
            references={referencesForBlock}
            template={template}
          />
        )}
      </div>
    </div>
  );
};

export default CVPreview;
