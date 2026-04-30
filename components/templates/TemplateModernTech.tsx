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

const TemplateModernTech: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, sidebarSections = DEFAULT_SIDEBAR_SECTIONS }) => {
  const accent = cvData.accentColor ?? '#1f2937';

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

  // Sidebar fillers — Modern Tech leans into a code-editor / terminal
  // aesthetic. Section headers wrap in /* ... */ comment markers, key
  // achievements get a green chevron prompt (›) like a CLI output line,
  // and projects render as ~/ kebab-cased "repos". The bottom anchor is a
  // terminal `$ generated --on=YYYY-MM-DD` line. All in monospace so it
  // visually contrasts the sans-serif body content on the right.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length)
      .slice(0, 3);
  })();

  const generatedDate = new Date().toISOString().slice(0, 10);

  return (
    <div id="cv-preview-modern-tech" className="bg-white shadow-lg border" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* gradient paints the two-column background on every page when content overflows */}
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${accent} 33.33%, white 33.33%)` }}>
        {/* Left Sidebar — background comes from parent gradient, not this div */}
        <div className="w-[33.33%] flex-shrink-0 text-white p-5 flex flex-col">
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{cvData.experience[0].jobTitle}</p>
            )}
          </div>
          <div className="space-y-4 flex-1">
            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600">Contact</h2>
              <ul className="space-y-1 text-xs break-words">
                {personalInfo.email && <li className="text-gray-300">{personalInfo.email}</li>}
                {personalInfo.phone && <li className="text-gray-300">{personalInfo.phone}</li>}
                {personalInfo.location && <li className="text-gray-300">{personalInfo.location}</li>}
                {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline text-gray-300">LinkedIn</a></li>}
                {personalInfo.github && <li><a href={personalInfo.github} className="underline text-gray-300">GitHub</a></li>}
              </ul>
            </section>
            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600">Skills</h2>
              <div className="flex flex-wrap gap-1">
                {cvData.skills.slice(0, 18).map((skill, i) => (
                  <span key={i} className="bg-gray-700 text-gray-200 text-[9px] font-medium px-1.5 py-0.5 rounded">{skill}</span>
                ))}
              </div>
            </section>
            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600">Languages</h2>
                <ul className="space-y-0.5 text-xs">
                  {cvData.languages.map((lang, i) => (
                    <li key={i} className="text-gray-300">{lang.name} <span className="text-gray-500">— {lang.proficiency}</span></li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600">Education</h2>
              <div className="space-y-2">
                {cvData.education.map((edu, index) => (
                  <div key={index} className="text-xs">
                    <p className="font-semibold text-white leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                    <p className="text-gray-400 text-[10px]" {...editableProps(['education', index, 'school'])}>{edu.school}, {edu.year}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* IMPACT section — quantitative wins styled as terminal output.
                Toggle controlled by Sidebar Section Picker. */}
            {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                  <span className="text-gray-500">{'/*'}</span> Impact <span className="text-gray-500">{'*/'}</span>
                </h2>
                <ul className="space-y-1.5">
                  {keyAchievements.map((line, i) => (
                    <li key={i} className="text-[10px] text-gray-300 leading-snug flex items-start gap-1.5" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                      <span className="text-green-400 flex-shrink-0">›</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* REPOS section — project titles as ~/kebab-case paths.
                Toggle controlled by Sidebar Section Picker. */}
            {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                  <span className="text-gray-500">{'/*'}</span> Repos <span className="text-gray-500">{'*/'}</span>
                </h2>
                <ul className="space-y-1">
                  {cvData.projects.slice(0, 4).map((p, i) => (
                    <li key={i} className="text-[10px] text-gray-300" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                      <span className="text-blue-400">~/</span>{p.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-gray-400 pb-1 mb-2 border-b border-gray-600" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                  <span className="text-gray-500">{'/*'}</span> Refs <span className="text-gray-500">{'*/'}</span>
                </h2>
                <p className="text-[10px] text-gray-300" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                  <span className="text-gray-500">{'//'}</span> {cvData.references.length} available on request
                </p>
              </section>
            )}
          </div>

          {/* Bottom-anchored terminal prompt — pure decoration that absorbs
              leftover vertical space and reinforces the code-editor theme. */}
          <div className="mt-auto pt-6">
            <div className="h-px bg-gray-700 mb-2" />
            <p className="text-[9px] text-gray-500" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
              <span className="text-green-500">$</span> generated --on={generatedDate}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <main className="space-y-5">
            {cvData.summary && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b border-gray-200" style={{ color: accent }}>Summary</h2>
                <p className="text-xs leading-relaxed text-gray-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b border-gray-200" style={{ color: accent }}>Experience</h2>
              <div className="space-y-3">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-xs font-bold text-gray-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[10px] font-mono text-gray-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[10px] font-medium text-gray-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-[10px] text-gray-700">
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
                <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b border-gray-200" style={{ color: accent }}>Projects</h2>
                <div className="space-y-2">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold text-gray-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-[10px] text-gray-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
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
          renderHeader={title => <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b border-gray-200" style={{ color: accent }}>{title}</h2>}
          sectionClassName="mb-5"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-gray-500"
          descClass="text-xs text-gray-600 mt-0.5"
          yearClass="text-xs text-gray-400"
        />
{jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateModernTech;
