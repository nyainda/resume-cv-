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
      default:
        return <TemplateProfessional {...rest} />;
    }
  };

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
      </div>
    </div>
  );
};

export default CVPreview;