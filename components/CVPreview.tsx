import React from 'react';
import { CVData, PersonalInfo, TemplateName, CustomSection } from '../types';
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

// ─── Custom Sections Renderer ────────────────────────────────────────────────
// Renders user-defined extra sections (Awards, Certifications, etc.)
// after the template's built-in content with neutral, professional styling.

const CustomSectionsBlock: React.FC<{ sections: CustomSection[] }> = ({ sections }) => {
  if (!sections || sections.length === 0) return null;

  return (
    <div style={{ padding: '0 40px 32px', fontFamily: 'inherit', background: '#fff' }}>
      {sections.map(section => (
        <div key={section.id} style={{ marginTop: '20px' }}>
          {/* Section header — matches a minimal ATS-safe style */}
          <div style={{
            borderBottom: '1.5px solid #222',
            marginBottom: '8px',
            paddingBottom: '2px',
          }}>
            <h2 style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              margin: 0,
              color: '#111',
            }}>
              {section.label}
            </h2>
          </div>

          {/* Items */}
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

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div id="cv-preview-area" data-cv-preview="true" className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
        {customSections.length > 0 && (
          <CustomSectionsBlock sections={customSections} />
        )}
      </div>
    </div>
  );
};

export default CVPreview;
