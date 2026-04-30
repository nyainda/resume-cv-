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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  // ── Sidebar fillers ────────────────────────────────────────────────────────
  // The left sidebar used to bottom-out at ~40% of the page height when the
  // user had short content (1-2 education entries, few languages), leaving a
  // big blue empty rectangle below EDUCATION. We now pull additional REAL
  // content from cvData (projects titles + quantitative achievements) into
  // the sidebar so it visually balances the long right column. Nothing is
  // duplicated — projects on the right keep their descriptions, the sidebar
  // only shows titles; achievements are extracted from experience bullets
  // that already exist in the main column.

  // Scan all experience bullets and surface the ones with quantitative wins
  // (percentages, multiples, currency amounts). These are the highest-signal
  // lines a recruiter wants to spot in 6 seconds — perfect sidebar content.
  // Cap at 3 so we don't blow past the right column's height.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length)
      .slice(0, 3);
  })();

  // Stable footer date — a single source-of-truth string used in the bottom
  // anchor so the layout stays deterministic across re-renders.
  const updatedLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div id="cv-preview-twoColumnBlue" className="bg-white text-slate-800 shadow-lg border" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${accent} 34%, white 34%)` }}>
        {/* Left Sidebar — background from parent gradient */}
        <div className="w-[34%] flex-shrink-0 text-white p-5 flex flex-col">
          <div className="mb-4">
            {personalInfo.photo && (
              <div className="flex justify-center mb-3">
                <img
                  src={personalInfo.photo}
                  alt={personalInfo.name}
                  className="w-20 h-20 rounded-full object-cover border-4 border-blue-400"
                />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[10px] text-blue-300 mt-0.5">{cvData.experience[0].jobTitle}</p>
            )}
          </div>

          {/* Sidebar body: flex-col so the decorative footer can be pinned to
              the bottom via mt-auto on tall right columns. Top sections sit
              naturally at the top; the spacer below absorbs any leftover
              vertical space and keeps the empty area looking intentional. */}
          <div className="flex-1 flex flex-col">
            <div className="space-y-4">
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Contact</h2>
                <ul className="space-y-1 text-xs break-words">
                  {personalInfo.email && <li className="text-blue-100">{personalInfo.email}</li>}
                  {personalInfo.phone && <li className="text-blue-100">{personalInfo.phone}</li>}
                  {personalInfo.location && <li className="text-blue-100">{personalInfo.location}</li>}
                  {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline text-blue-200">LinkedIn</a></li>}
                  {personalInfo.website && <li><a href={personalInfo.website} className="underline text-blue-200">Website</a></li>}
                  {personalInfo.github && <li><a href={personalInfo.github} className="underline text-blue-200">GitHub</a></li>}
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Skills</h2>
                <ul className="space-y-0.5 text-xs">
                  {cvData.skills.slice(0, 18).map((skill, i) => (
                    <li key={i} className="flex items-start gap-1 text-blue-100">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                      <span {...editableProps(['skills', i])}>{skill}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {cvData.languages && cvData.languages.length > 0 && (
                <section>
                  <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Languages</h2>
                  <ul className="text-xs space-y-1">
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
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Education</h2>
                <div className="space-y-2">
                  {cvData.education.map((edu, index) => (
                    <div key={index} className="text-xs">
                      <p className="font-bold text-white leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-blue-200 text-[10px]" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                      <p className="text-blue-300 text-[10px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Quantitative wins extracted from experience bullets — recruiter
                  scan-magnet content that uses real CV data, not placeholders.
                  Toggle controlled by the Sidebar Section Picker toolbar. */}
              {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
                <section>
                  <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Key Achievements</h2>
                  <ul className="space-y-1.5 text-xs">
                    {keyAchievements.map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-blue-100 leading-snug">
                        <span className="mt-1 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                        <span className="text-[10px]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Selected projects — titles only, the right column keeps the
                  full descriptions. Complementary, not duplicate.
                  Toggle controlled by the Sidebar Section Picker toolbar. */}
              {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
                <section>
                  <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">Selected Projects</h2>
                  <ul className="space-y-1 text-xs">
                    {cvData.projects.slice(0, 4).map((proj, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-blue-100 leading-snug">
                        <span className="mt-1 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0 inline-block"></span>
                        <span className="text-[10px] font-semibold">{proj.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
                <section>
                  <h2 className="text-[9px] font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-2">References</h2>
                  <p className="text-[10px] text-blue-100 italic leading-snug">
                    {cvData.references.length} reference{cvData.references.length === 1 ? '' : 's'} available on request.
                  </p>
                </section>
              )}
            </div>

            {/* Bottom anchor — fills any remaining vertical gap so the empty
                space below the last section reads as intentional white space
                rather than an awkward chunk of unused sidebar. The thin
                divider + small "Updated" stamp also doubles as a tiny trust
                signal for recruiters skimming the document. */}
            <div className="mt-auto pt-8">
              <div className="h-px bg-blue-400/40 mb-2" />
              <p className="text-[8px] text-blue-300/70 uppercase tracking-[0.18em] text-center">
                Updated {updatedLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <main className="space-y-5">
            {cvData.summary && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-1 mb-2" style={{ color: accent }}>Professional Summary</h2>
                <p className="text-xs leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-1 mb-2" style={{ color: accent }}>Experience</h2>
              <div className="space-y-3">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-xs font-semibold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[10px] font-medium text-slate-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[10px] font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-[10px] text-slate-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-1 mb-2" style={{ color: accent }}>Projects</h2>
                <div className="space-y-2">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-[10px] text-slate-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      {proj.link && (
                        <a href={proj.link} className="text-[10px] text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>
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
          renderHeader={title => <h2 className="text-xs font-bold uppercase tracking-wider border-b-2 border-blue-100 pb-1 mb-2" style={{ color: accent }}>{title}</h2>}
          sectionClassName="mb-5"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-blue-600 opacity-80"
          descClass="text-xs text-slate-600 mt-0.5"
          yearClass="text-xs text-slate-400"
        />
{jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateTwoColumnBlue;
