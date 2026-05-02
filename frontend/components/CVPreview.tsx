import React from 'react';
import { CVData, PersonalInfo, TemplateName, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../types';
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
import TemplateCompactSlate from './templates/TemplateCompactSlate';
import TemplateCompactSage from './templates/TemplateCompactSage';
import TemplateCompactCharcoal from './templates/TemplateCompactCharcoal';


interface CVPreviewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing?: boolean;
  onDataChange?: (newData: CVData) => void;
  jobDescriptionForATS?: string;
  template: TemplateName;
  // Sidebar Section Picker — only consumed by templates that have a sidebar
  // with auto-generated fillers (TwoColumnBlue, NavySidebar,
  // ExecutiveSidebar, PhotoSidebar, ModernTech, CompactSlate, CompactSage,
  // CompactCharcoal). All other templates ignore this prop.
  sidebarSections?: SidebarSectionsVisibility;
}

// ─── Main CVPreview ──────────────────────────────────────────────────────────

const CVPreview: React.FC<CVPreviewProps> = (props) => {
  const {
    template,
    cvData,
    personalInfo,
    isEditing = false,
    onDataChange = () => {},
    jobDescriptionForATS = '',
    sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
  } = props;

  const templateProps = { cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS };
  // Sidebar templates additionally receive sidebarSections; spreading
  // sidebarTemplateProps onto a non-sidebar template is harmless because
  // those components don't declare the prop in their interface.
  const sidebarTemplateProps = { ...templateProps, sidebarSections };

  const renderTemplate = () => {
    switch (template) {
      case 'modern':             return <TemplateModern {...templateProps} />;
      case 'professional':       return <TemplateProfessional {...templateProps} />;
      case 'minimalist':         return <TemplateMinimalist {...templateProps} />;
      case 'corporate':          return <TemplateCorporate {...templateProps} />;
      case 'creative':           return <TemplateCreative {...templateProps} />;
      case 'timeline':           return <TemplateTimeline {...templateProps} />;
      case 'twoColumnBlue':      return <TemplateTwoColumnBlue {...sidebarTemplateProps} />;
      case 'executive':          return <TemplateExecutive {...templateProps} />;
      case 'technical':          return <TemplateTechnical {...templateProps} />;
      case 'compact':            return <TemplateCompact {...templateProps} />;
      case 'elegant':            return <TemplateElegant {...templateProps} />;
      case 'software-engineer':  return <TemplateSoftwareEngineer {...templateProps} />;
      case 'modern-tech':        return <TemplateModernTech {...sidebarTemplateProps} />;
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
      case 'navy-sidebar':       return <TemplateNavySidebar {...sidebarTemplateProps} />;
      case 'photo-sidebar':      return <TemplatePhotoSidebar {...sidebarTemplateProps} />;
      case 'swe-elite':          return <TemplateSWEElite {...templateProps} />;
      case 'ats-clean-pro':      return <TemplateATSCleanPro {...templateProps} />;
      case 'executive-sidebar':  return <TemplateExecutiveSidebar {...sidebarTemplateProps} />;
      case 'compact-slate':      return <TemplateCompactSlate {...sidebarTemplateProps} />;
      case 'compact-sage':       return <TemplateCompactSage {...sidebarTemplateProps} />;
      case 'compact-charcoal':   return <TemplateCompactCharcoal {...sidebarTemplateProps} />;
      default:                   return <TemplateProfessional {...templateProps} />;
    }
  };

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div id="cv-preview-area" data-cv-preview="true" className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
      </div>
    </div>
  );
};

export default CVPreview;
