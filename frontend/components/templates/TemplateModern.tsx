
import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateModern: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#334155';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const handleDeleteExperience = (index: number) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    newCvData.experience.splice(index, 1);
    onDataChange(newCvData);
  };

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      handleUpdate(path, e.currentTarget.innerHTML);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 border-b border-slate-500/50 pb-1 mb-2">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-modern" className="bg-white text-zinc-800 shadow-lg border flex flex-col min-h-[280mm]">
      <div className="grid grid-cols-12 flex-1">
        {/* Left Sidebar */}
        <div className="col-span-4 text-white p-5 flex flex-col gap-4" style={{ backgroundColor: accent }}>
          <div className="text-center">
            {personalInfo.photo && (
              <div className="flex justify-center mb-3">
                <img src={personalInfo.photo} alt={personalInfo.name} className="w-20 h-20 rounded-full object-cover border-4 border-white/20" />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
          </div>

          <SidebarSection title="Contact">
            <ul className="space-y-1.5 text-xs break-words">
              <li>{personalInfo.email}</li>
              <li>{personalInfo.phone}</li>
              <li>{personalInfo.location}</li>
              {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline opacity-80">LinkedIn</a></li>}
              {personalInfo.website && <li><a href={personalInfo.website} className="underline opacity-80">Website</a></li>}
              {personalInfo.github && <li><a href={personalInfo.github} className="underline opacity-80">GitHub</a></li>}
            </ul>
          </SidebarSection>

          <SidebarSection title="Skills">
            <ul className="list-disc list-inside text-xs space-y-1">
              {cvData.skills.slice(0, 12).map((skill, i) => <li key={i} {...editableProps(['skills', i])}>{skill}</li>)}
            </ul>
          </SidebarSection>

          {cvData.languages && cvData.languages.length > 0 && (
            <SidebarSection title="Languages">
              {cvData.languages.map((lang, index) => (
                <div key={index} className="text-xs mb-1.5">
                  <p className="font-bold" {...editableProps(['languages', index, 'name'])}>{lang.name}</p>
                  <p className="text-slate-300 text-[10px]" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</p>
                </div>
              ))}
            </SidebarSection>
          )}

          <SidebarSection title="Education">
            {cvData.education.map((edu, index) => (
              <div key={index} className="text-xs mb-3" data-pdf-keep="true">
                <h3 className="font-bold leading-tight" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="opacity-80" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                <p className="text-slate-300 text-[10px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
              </div>
            ))}
          </SidebarSection>

          {cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Projects">
              {cvData.projects.slice(0, 3).map((proj, index) => (
                <div key={index} className="text-xs mb-3">
                  <h3 className="font-bold leading-tight" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="opacity-70 text-[10px] leading-snug line-clamp-2" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-blue-300 underline text-[10px] block truncate">{proj.link}</a>}
                </div>
              ))}
            </SidebarSection>
          )}

          {cvData.references && cvData.references.length > 0 && (
            <SidebarSection title="References">
              {cvData.references.slice(0, 2).map((ref, index) => (
                <div key={index} className="text-xs mb-2">
                  <p className="font-bold">{ref.name}</p>
                  <p className="opacity-70 text-[10px]">{ref.title}</p>
                </div>
              ))}
            </SidebarSection>
          )}
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-6 flex flex-col">
          <main className="space-y-4 flex-1">
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Professional Summary</h2>
              <p className="text-xs leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>

            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Experience</h2>
              <div className="space-y-4">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group" data-pdf-keep="true">
                    {isEditing && (
                      <button
                        onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                        title="Delete this experience entry"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    )}
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-sm font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[10px] font-medium text-slate-500 shrink-0 ml-2" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-xs font-medium text-slate-600 mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 space-y-0.5 text-xs text-slate-700">
                      {job.responsibilities.slice(0, 4).map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.publications && cvData.publications.length > 0 && (
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Publications</h2>
                <div className="space-y-3">
                  {cvData.publications.map((pub, index) => (
                    <div key={index} data-pdf-keep="true">
                      <h3 className="text-xs font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                      <p className="text-xs text-slate-600" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</p>
                      <p className="text-xs italic text-slate-500">
                        <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <TemplateCustomSections
              customSections={cvData.customSections}
              references={undefined}
              renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">{title}</h2>}
              sectionClassName="mb-4"
              titleClass="font-semibold text-xs"
              subtitleClass="text-[10px] text-slate-500"
              descClass="text-[10px] text-slate-600 mt-0.5"
              yearClass="text-[10px] text-slate-500"
            />
          </main>
        </div>
      </div>
      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateModern;
