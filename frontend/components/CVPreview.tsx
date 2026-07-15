import React, { useMemo } from 'react';
import { CVData, PersonalInfo, TemplateName, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../types';
import { normalizeCVData } from '../utils/cvDataUtils';
import { buildSpacingCSS } from '../utils/pageFit';
import TemplateV2 from './templates/engine/TemplateV2';
import { V2_TEMPLATE_IDS, LEGACY_TEMPLATE_REDIRECTS } from './templates/engine/templateThemes';
import TemplateProfessional from './templates/TemplateProfessional';
import TemplateMinimalist from './templates/TemplateMinimalist';
import TemplateCreative from './templates/TemplateCreative';
import TemplateTimeline from './templates/TemplateTimeline';
import TemplateInfographic from './templates/TemplateInfographic';
import TemplateHarvardGold from './templates/TemplateHarvardGold';
import TemplateTokyoNight from './templates/TemplateTokyoNight';
import TemplateParisVibe from './templates/TemplateParisVibe';
import TemplateLondonFinance from './templates/TemplateLondonFinance';
import TemplateBerlinDesign from './templates/TemplateBerlinDesign';
import TemplateMedicalStandard from './templates/TemplateMedicalStandard';
import TemplateSWEElite from './templates/TemplateSWEElite';
import TemplateATSCleanPro from './templates/TemplateATSCleanPro';
import TemplateSWENeon from './templates/TemplateSWENeon';
import TemplateSWEClean from './templates/TemplateSWEClean';
import TemplateExecutiveEditorial from './templates/TemplateExecutiveEditorial';

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
  /**
   * Resolved zoom level from the one-page convergence loop (0.85–1.0).
   * Passed through to strict-one-page (sidebar) templates. Default 1 = no zoom.
   */
  density?: number;
  /**
   * Spacing compression level (0–3) from the two-phase convergence loop.
   * Controls inter-section gap, entry gap, and bullet line-height without
   * touching font sizes. Passed through to all sidebar templates.
   */
  spacingLevel?: number;
}

// ─── Main CVPreview ──────────────────────────────────────────────────────────

const CVPreview: React.FC<CVPreviewProps> = (props) => {
  const {
    template,
    cvData: rawCvData,
    personalInfo,
    isEditing = false,
    onDataChange = () => {},
    jobDescriptionForATS = '',
    sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
    density = 1,
    spacingLevel = 0,
  } = props;

  // Guarantee all array fields are proper arrays before ANY template sees the data.
  // This is the single choke-point for all 35+ templates — no template component
  // needs its own null-guards on skills/experience/education/.length calls.
  const cvData: CVData = useMemo(
    () => (normalizeCVData(rawCvData) ?? rawCvData),
    [rawCvData],
  );

  const templateProps = { cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS };

  // LEGACY_TEMPLATE_REDIRECTS is imported from templateThemes — single source of truth.
  // Any old template ID saved in a user's CV resolves to the nearest V2 equivalent here.
  const renderTemplate = () => {
    const resolvedId = LEGACY_TEMPLATE_REDIRECTS[template as string] ?? (template as string);

    // Executive Editorial uses a bespoke standalone renderer for pixel-accurate layout
    if (resolvedId === 'v2-executive-editorial') {
      return <TemplateExecutiveEditorial
        cvData={cvData}
        personalInfo={personalInfo}
        isEditing={isEditing}
        onDataChange={onDataChange}
        jobDescriptionForATS={jobDescriptionForATS}
      />;
    }

    if (V2_TEMPLATE_IDS.includes(resolvedId)) {
      return <TemplateV2
        cvData={cvData}
        personalInfo={personalInfo}
        isEditing={isEditing}
        onDataChange={onDataChange}
        jobDescriptionForATS={jobDescriptionForATS}
        themeId={resolvedId}
      />;
    }
    // Legacy templates still shown in the gallery
    switch (template) {
      case 'professional':       return <TemplateProfessional {...templateProps} />;
      case 'minimalist':         return <TemplateMinimalist {...templateProps} />;
      case 'creative':           return <TemplateCreative {...templateProps} />;
      case 'timeline':           return <TemplateTimeline {...templateProps} />;
      case 'infographic':        return <TemplateInfographic {...templateProps} />;
      case 'harvard-gold':       return <TemplateHarvardGold {...templateProps} />;
      case 'tokyo-night':        return <TemplateTokyoNight {...templateProps} />;
      case 'paris-vibe':         return <TemplateParisVibe {...templateProps} />;
      case 'london-finance':     return <TemplateLondonFinance {...templateProps} />;
      case 'berlin-design':      return <TemplateBerlinDesign {...templateProps} />;
      case 'medical-standard':   return <TemplateMedicalStandard {...templateProps} />;
      case 'swe-elite':          return <TemplateSWEElite {...templateProps} />;
      case 'ats-clean-pro':      return <TemplateATSCleanPro {...templateProps} />;
      case 'swe-neon':           return <TemplateSWENeon {...templateProps} />;
      case 'swe-clean':          return <TemplateSWEClean {...templateProps} />;
      default:                   return <TemplateProfessional {...templateProps} />;
    }
  };

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div
        id="cv-preview-area"
        data-cv-preview="true"
        data-cv-spacing={spacingLevel !== 0 ? spacingLevel : undefined}
        className="min-w-[210mm] bg-white shadow-sm mx-auto relative"
      >
        {/* Inject spacing-override CSS for the current layout mode.
            Positive spacingLevel = compression (fit-to-1-page).
            Negative spacingLevel = expansion (balanced-2-page).
            Level 0 = no overrides needed.
            The style tag is inside cv-preview-area so getCVHtml cloneNode
            captures it automatically — no extra PDF pipeline work needed. */}
        {spacingLevel !== 0 && (
          <style dangerouslySetInnerHTML={{ __html: buildSpacingCSS(spacingLevel) }} />
        )}
        {renderTemplate()}
        {/* One-page boundary line for non-V2 templates — V2 renders its own
            internally. data-pdf-hide keeps it out of downloaded PDFs. */}
        {cvData.onePage && !V2_TEMPLATE_IDS.includes(
          LEGACY_TEMPLATE_REDIRECTS[template as string] ?? (template as string)
        ) && template !== 'v2-executive-editorial' && (
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
        )}
      </div>
      {/* Swipe hint — only visible on screens narrower than A4 (210 mm ≈ 794 px).
          Hidden on wider viewports where the full page is visible at once.
          `data-pdf-hide` is a belt-and-suspenders guard: getCVHtml() strips any
          element with this attribute before PDF rendering, so this hint can
          never leak into a downloaded PDF even if a renderer's viewport width
          ever regresses below the 800px breakpoint again. */}
      <p data-pdf-hide className="min-[800px]:hidden mt-2 text-center text-[11px] text-zinc-400 select-none pointer-events-none">
        ← Swipe to see full CV →
      </p>
    </div>
  );
};

export default CVPreview;
