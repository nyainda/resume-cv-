import React, { useCallback } from 'react';
import { getSpacingValues } from '../../utils/pageFit';
import { smartBullets, smartProjects } from '../../utils/smartBullets';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, CVProject, PersonalInfo, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
  sidebarSections?: SidebarSectionsVisibility;
  /** Resolved zoom level from the one-page convergence loop (0.85–1.0). Default 1. */
  density?: number;
  /** Spacing compression level (0–3) from the two-phase convergence loop. */
  spacingLevel?: number;
}

// Compact Slate — a deliberately tight one-page layout. Keeps a slim left
// sidebar (28%) so the main column has more horizontal breathing room, and
// caps every list (skills, projects, achievements) so the document fits on a
// single A4 page even with 4-5 experience entries. All typography is sized
// 9-10px to maximise vertical real estate without sacrificing legibility.
const TemplateCompactSlate: React.FC<TemplateProps> = ({
  cvData,
  personalInfo,
  isEditing,
  onDataChange,
  jobDescriptionForATS,
  sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
  density = 1,
  spacingLevel = 0,
}) => {
  const { secGap, entryGap, lh } = getSpacingValues(spacingLevel);
  const accent = cvData.accentColor ?? '#475569';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      handleUpdate(path, e.currentTarget.innerHTML);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-slate-400 focus:bg-slate-100/40 rounded px-0.5 -mx-0.5 transition-all"
  } : {};

  // Quantitative achievements extraction — same regex as the other sidebar
  // templates so the toggle behaviour is consistent across all of them.
  // No cap — density convergence loop handles overflow instead of silent truncation.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length);
  })();

  return (
    <div id="cv-preview-compact-slate" className="bg-white shadow-lg border" style={{ fontFamily: 'Inter, Arial, Helvetica, sans-serif', zoom: density }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, #1e293b 28%, white 28%)` }}>
        {/* Left Sidebar — slate background from gradient. Narrow at 28% so the
            main column has room for dense experience bullets. */}
        <div className="w-[28%] flex-shrink-0 text-slate-200 p-4 flex flex-col">
          <div className="mb-4">
            <h1 className="text-base font-bold tracking-tight leading-tight text-white">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{cvData.experience[0].jobTitle}</p>
            )}
          </div>

          <div className="space-y-3 flex-1">
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Contact</h2>
              <ul className="space-y-0.5 text-[11px] break-words text-slate-300">
                {personalInfo.email && <li>{personalInfo.email}</li>}
                {personalInfo.phone && <li>{personalInfo.phone}</li>}
                {personalInfo.location && <li>{personalInfo.location}</li>}
                {personalInfo.linkedin && <li className="truncate">{personalInfo.linkedin}</li>}
                {personalInfo.github && <li className="truncate">{personalInfo.github}</li>}
              </ul>
            </section>

            {cvData.skills.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Skills</h2>
                <ul className="space-y-0.5 text-[11px] text-slate-300">
                  {cvData.skills.map((skill, i) => (
                    <li key={i} className="leading-snug" {...editableProps(['skills', i])}>{skill}</li>
                  ))}
                </ul>
              </section>
            )}

            {cvData.education.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Education</h2>
                <div className="space-y-1.5">
                  {cvData.education.map((edu, index) => (
                    <div key={index} className="text-[11px]">
                      <p className="font-semibold text-white leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-slate-400 text-[12px]" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                      <p className="text-slate-500 text-[12px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Languages</h2>
                <ul className="space-y-0.5 text-[11px] text-slate-300">
                  {cvData.languages.map((lang, i) => (
                    <li key={i}>{lang.name} <span className="text-slate-500">— {lang.proficiency}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {/* Conditional sidebar fillers — controlled by the Sidebar Section
                Picker toolbar in the editor. Default-on. */}
            {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Key Achievements</h2>
                <ul className="space-y-1">
                  {keyAchievements.map((line, i) => (
                    <li key={i} className="text-[10.5px] text-slate-300 leading-snug flex items-start gap-1">
                      <span className="text-slate-500 flex-shrink-0">▪</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">Projects</h2>
                <ul className="space-y-0.5">
                  {cvData.projects.map((p, i) => (
                    <li key={i} className="text-[11px] text-slate-300 leading-snug">{p.name}</li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 pb-0.5 mb-1.5 border-b border-slate-700">References</h2>
                <p className="text-[12px] text-slate-400 italic leading-snug">
                  {cvData.references.length} available on request
                </p>
              </section>
            )}
          </div>

          {/* Slim bottom anchor — single thin rule + tracked-out style label. */}
          <div className="mt-auto pt-4">
            <div className="h-px bg-slate-700 mb-1.5" />
            <p className="text-[10px] text-slate-500 tracking-[0.15em] uppercase text-center">Curriculum Vitae</p>
          </div>
        </div>

        {/* Main Content — tight padding, dense typography. */}
        <div className="flex-1 px-5 py-4">
          <main style={{ display: 'flex', flexDirection: 'column', gap: secGap }}>
            {cvData.summary && (
              <section>
                <h2 className="text-[11.5px] font-bold uppercase tracking-wider pb-0.5 mb-1 border-b border-slate-200" style={{ color: accent }}>Summary</h2>
                <p className="text-[11.5px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b border-slate-200" style={{ color: accent }}>Experience</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: entryGap }}>
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-[12px] font-bold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[12px] text-slate-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[11px] font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-3.5 mt-0.5 space-y-0.5 text-[11px] text-slate-700">
                      {smartBullets(job.responsibilities, cvData.experience.length).map((resp, i) => (
                        <li key={i} className="leading-snug" style={{ lineHeight: lh }} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {!sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (() => {
              const { visible, overflow } = smartProjects(cvData.projects);
              return (
                <section>
                  <h2 className="text-[11.5px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b border-slate-200" style={{ color: accent }}>Projects</h2>
                  <div className="space-y-1.5">
                    {visible.map((proj: CVProject, index) => (
                      <div key={index}>
                        <h3 className="text-[12px] font-semibold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                        <p className="text-[11px] text-slate-700 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      </div>
                    ))}
                    {overflow > 0 && <p className="text-[10px] text-slate-400 italic">+{overflow} more project{overflow > 1 ? 's' : ''}</p>}
                  </div>
                </section>
              );
            })()}
          </main>
        </div>
      </div>

      <TemplateCustomSections
        customSections={cvData.customSections}
        references={cvData.references}
        renderHeader={title => <h2 className="text-[11.5px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b border-slate-200" style={{ color: accent }}>{title}</h2>}
        sectionClassName="mb-4 px-5"
        titleClass="font-semibold text-[12px]"
        subtitleClass="text-[11px] text-slate-500"
        descClass="text-[11px] text-slate-600 mt-0.5"
        yearClass="text-[12px] text-slate-400"
      />
      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateCompactSlate;
