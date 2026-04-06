import React from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
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


interface CVPreviewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
  template: TemplateName;
}

const CVPreview: React.FC<CVPreviewProps> = (props) => {
  const { template, ...rest } = props;

  const renderTemplate = () => {
    switch (template) {
      case 'modern':
        return <TemplateModern {...rest} />;
      case 'professional':
        return <TemplateProfessional {...rest} />;
      case 'minimalist':
        return <TemplateMinimalist {...rest} />;
      case 'corporate':
        return <TemplateCorporate {...rest} />;
      case 'creative':
        return <TemplateCreative {...rest} />;
      case 'timeline':
        return <TemplateTimeline {...rest} />;
      case 'twoColumnBlue':
        return <TemplateTwoColumnBlue {...rest} />;
      case 'executive':
        return <TemplateExecutive {...rest} />;
      case 'technical':
        return <TemplateTechnical {...rest} />;
      case 'compact':
        return <TemplateCompact {...rest} />;
      case 'elegant':
        return <TemplateElegant {...rest} />;
      case 'software-engineer':
        return <TemplateSoftwareEngineer {...rest} />;
      case 'modern-tech':
        return <TemplateModernTech {...rest} />;
      case 'infographic':
        return <TemplateInfographic {...rest} />;
      case 'classic':
        return <TemplateClassic {...rest} />;
      case 'standard-pro':
        return <TemplateStandardPro {...rest} />;
      case 'harvard-gold':
        return <TemplateHarvardGold {...rest} />;
      case 'tokyo-night':
        return <TemplateTokyoNight {...rest} />;
      case 'paris-vibe':
        return <TemplateParisVibe {...rest} />;
      case 'london-finance':
        return <TemplateLondonFinance {...rest} />;
      case 'berlin-design':
        return <TemplateBerlinDesign {...rest} />;
      case 'silicon-valley':
        return <TemplateSiliconValley {...rest} />;
      case 'sydney-creative':
        return <TemplateSydneyCreative {...rest} />;
      case 'scholarship-pro':
        return <TemplateScholarshipPro {...rest} />;
      case 'medical-standard':
        return <TemplateMedicalStandard {...rest} />;
      case 'navy-sidebar':
        return <TemplateNavySidebar {...rest} />;
      case 'photo-sidebar':
        return <TemplatePhotoSidebar {...rest} />;
      case 'swe-elite':
        return <TemplateSWEElite {...rest} />;
      case 'ats-clean-pro':
        return <TemplateATSCleanPro {...rest} />;
      default:
        return <TemplateProfessional {...rest} />;
    }
  };

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div id="cv-preview-area" className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
      </div>
    </div>
  );
};

export default CVPreview;