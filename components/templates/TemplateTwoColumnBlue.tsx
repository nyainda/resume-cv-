import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
  sidebarSections?: SidebarSectionsVisibility;
}

// Two Column Blue — compact one-page edition. Same blue-gradient identity as
// before (photo avatar, blue bullet dots, "Updated MMM YYYY" anchor) but with
// every measurement tightened so a typical CV (4-5 jobs, 12 skills, 2 edu)
// lands on a single A4 page. Sidebar trimmed to 30% to give the main column
// more room for dense experience bullets.
const TemplateTwoColumnBlue: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, sidebarSections = DEFAULT_SIDEBAR_SECTIONS }) => {
  const accent = cvData.accentColor ?? '#1e40af';

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-0.5 -mx-0.5 transition-all"
  } : {};

  // Capped at 2 (vs 3 in the older roomy version) so the sidebar height stays
  // in lock-step with a single-page right column.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length)
      .slice(0, 2);
  })();

  const updatedLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div id="cv-preview-twoColumnBlue" className="bg-white text-slate-800 shadow-lg border" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${accent} 30%, white 30%)` }}>
        {/* Left Sidebar — narrowed from 34% to 30% so the main column gets
            more breathing room. */}
        <div className="w-[30%] flex-shrink-0 text-white p-4 flex flex-col">
          <div className="mb-3">
            {personalInfo.photo && (
              <div className="flex justify-center mb-2">
                <img
                  src={personalInfo.photo}
                  alt={personalInfo.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-blue-400"
                />
              </div>
            )}
            <h1 className="text-base font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[9.5px] text-blue-300 mt-0.5 leading-snug">{cvData.experience[0].jobTitle}</p>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            <div className="space-y-3">
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Contact</h2>
                <ul className="space-y-0.5 text-[9.5px] break-words">
                  {personalInfo.email && <li className="text-blue-100">{personalInfo.email}</li>}
                  {personalInfo.phone && <li className="text-blue-100">{personalInfo.phone}</li>}
                  {personalInfo.location && <li className="text-blue-100">{personalInfo.location}</li>}
                  {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline text-blue-200">LinkedIn</a></li>}
                  {personalInfo.website && <li><a href={personalInfo.website} className="underline text-blue-200">Website</a></li>}
                  {personalInfo.github && <li><a href={personalInfo.github} className="underline text-blue-200">GitHub</a></li>}
                </ul>
              </section>

              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Skills</h2>
                <ul className="space-y-0.5 text-[9.5px]">
                  {cvData.skills.slice(0, 12).map((skill, i) => (
                    <li key={i} className="flex items-start gap-1 text-blue-100 leading-snug">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                      <span {...editableProps(['skills', i])}>{skill}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {cvData.languages && cvData.languages.length > 0 && (
                <section>
                  <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Languages</h2>
                  <ul className="text-[9.5px] space-y-0.5">
                    {cvData.languages.map((lang, i) => (
                      <li key={i}>
                        <span className="font-semibold text-white" {...editableProps(['languages', i, 'name'])}>{lang.name}</span>
                        <span className="text-blue-300"> — </span>
                        <span className="text-blue-200" {...editableProps(['languages', i, 'proficiency'])}>{lang.proficiency}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Education</h2>
                <div className="space-y-1.5">
                  {cvData.education.slice(0, 2).map((edu, index) => (
                    <div key={index} className="text-[9.5px]">
                      <p className="font-bold text-white leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-blue-200 text-[9px]" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                      <p className="text-blue-300 text-[9px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                  ))}
                </div>
              </section>

              {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
                <section>
                  <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Key Achievements</h2>
                  <ul className="space-y-1 text-[9.5px]">
                    {keyAchievements.map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-blue-100 leading-snug">
                        <span className="mt-1 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                        <span className="text-[9px]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
                <section>
                  <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">Selected Projects</h2>
                  <ul className="space-y-0.5 text-[9.5px]">
                    {cvData.projects.slice(0, 3).map((proj, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-blue-100 leading-snug">
                        <span className="mt-1 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                        <span className="text-[9px] font-semibold">{proj.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
                <section>
                  <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] text-blue-200 border-b border-blue-500 pb-0.5 mb-1.5">References</h2>
                  <p className="text-[9px] text-blue-100 italic leading-snug">
                    {cvData.references.length} available on request.
                  </p>
                </section>
              )}
            </div>

            <div className="mt-auto pt-4">
              <div className="h-px bg-blue-400/40 mb-1.5" />
              <p className="text-[8px] text-blue-300/70 uppercase tracking-[0.2em] text-center">
                Updated {updatedLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content — tight padding, dense typography. */}
        <div className="flex-1 px-5 py-4">
          <main className="space-y-3.5">
            {cvData.summary && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-0.5 mb-1" style={{ color: accent }}>Professional Summary</h2>
                <p className="text-[10px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-0.5 mb-1.5" style={{ color: accent }}>Experience</h2>
              <div className="space-y-2.5">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-[10.5px] font-bold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[9px] font-medium text-slate-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[9.5px] font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-3.5 mt-0.5 space-y-0.5 text-[9.5px] text-slate-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} className="leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-0.5 mb-1.5" style={{ color: accent }}>Projects</h2>
                <div className="space-y-1.5">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-[10px] font-semibold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-[9.5px] text-slate-700 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      {proj.link && (
                        <a href={proj.link} className="text-[9px] text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      <TemplateCustomSections
        customSections={cvData.customSections}
        references={cvData.references}
        renderHeader={title => <h2 className="text-[10px] font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-0.5 mb-1.5" style={{ color: accent }}>{title}</h2>}
        sectionClassName="mb-4 px-5"
        titleClass="font-semibold text-[10.5px]"
        subtitleClass="text-[9.5px] text-blue-600 opacity-80"
        descClass="text-[9.5px] text-slate-600 mt-0.5"
        yearClass="text-[9px] text-slate-400"
      />
      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateTwoColumnBlue;
