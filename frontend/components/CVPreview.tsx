import React, { useMemo } from 'react';
import { CVData, PersonalInfo, TemplateName, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../types';
import { normalizeCVData } from '../utils/cvDataUtils';
import TemplateV2 from './templates/engine/TemplateV2';
import { V2_TEMPLATE_IDS } from './templates/engine/templateThemes';
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
import TemplatePrestige from './templates/TemplatePrestige';
import TemplateSWENeon from './templates/TemplateSWENeon';
import TemplateSWEClean from './templates/TemplateSWEClean';

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
  // Sidebar templates additionally receive sidebarSections, density, and spacingLevel
  // (for the two-phase convergence loop). Spreading onto non-sidebar templates is
  // harmless because those components don't declare these props in their interfaces.
  const sidebarTemplateProps = { ...templateProps, sidebarSections, density, spacingLevel };

  // ─── Legacy → V2 redirect map ───────────────────────────────────────────────
  // Templates listed here were removed from the gallery (no new CVs can be saved
  // with them) but existing user CVs may still reference these IDs. Redirecting
  // them to their nearest V2 equivalent gives those CVs computeSmartSplit and the
  // density loop for free, replacing silent truncation with data-aware routing.
  //
  // Visual delta is minimal — each target was chosen as the closest V2 theme by
  // sidebar layout, accent colour, and overall tone. The legacy .tsx files and
  // switch cases below are kept as dead-code fallback only.
  const LEGACY_TEMPLATE_REDIRECTS: Partial<Record<string, string>> = {
    // Cluster A — sidebar templates (hardcoded sections, no length-aware routing)
    'navy-sidebar':       'v2-slate-sidebar',  // dark sidebar → slate sidebar
    'executive-sidebar':  'v2-gold-exec',      // dark + gold → gold executive
    'photo-sidebar':      'v2-photo',          // dark blue photo sidebar
    'twoColumnBlue':      'v2-slate-sidebar',  // linear blue/slate split
    'compact-slate':      'v2-slate-sidebar',  // slim slate sidebar
    'compact-sage':       'v2-sage',           // sage sidebar ✓ exact
    'compact-charcoal':   'v2-gold-exec',      // charcoal + gold accent
    'modern-tech':        'v2-teal',           // dark sidebar + teal accent
    'swe-elite':          'v2-teal',           // emerald/teal sidebar
    'scholarship-pro':    'v2-amber',          // academic amber
    // Cluster B — gray corporate single-col (near-duplicates of V2 themes)
    'corporate':          'v2-graphite',
    'elegant':            'v2-warm',
    'modern':             'v2-pro',
    'classic':            'v2-classic-pro',
    'executive':          'v2-gold-exec',
    'technical':          'v2-modern-blue',
    'software-engineer':  'v2-modern-blue',
    'compact':            'v2-minimal',
    'standard-pro':       'v2-classic-pro',
    // Cluster C — navy/gold
    'prestige':           'v2-gold-exec',
    'silicon-valley':     'v2-bold',
    'sydney-creative':    'v2-editorial',
  };

  const renderTemplate = () => {
    // Resolve legacy IDs first — redirected templates render via V2 engine,
    // gaining computeSmartSplit and the density loop without any visual rework.
    const resolvedId = LEGACY_TEMPLATE_REDIRECTS[template as string] ?? (template as string);
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
      case 'prestige':           return <TemplatePrestige {...templateProps} />;
      case 'swe-neon':           return <TemplateSWENeon {...templateProps} />;
      case 'swe-clean':          return <TemplateSWEClean {...templateProps} />;
      default:                   return <TemplateProfessional {...templateProps} />;
    }
  };

  return (
    <div className="font-['Inter'] w-full overflow-x-auto pb-4">
      <div id="cv-preview-area" data-cv-preview="true" className="min-w-[210mm] bg-white shadow-sm mx-auto">
        {renderTemplate()}
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
