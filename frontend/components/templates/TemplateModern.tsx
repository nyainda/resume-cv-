
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
    for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const handleDeleteExperience = (index: number) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    newCvData.experience.splice(index, 1);
    onDataChange(newCvData);
  };

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true, suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SidebarLabel = ({ text }: { text: string }) => (
    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] border-b border-white/20 pb-1 mb-2 text-white/60">{text}</h2>
  );

  return (
    <div id="cv-preview-modern" className="bg-white text-zinc-800 shadow-lg border flex flex-col min-h-[280mm]">
      <div className="grid grid-cols-12 flex-1">

        {/* ── Sidebar ── */}
        <div className="col-span-4 text-white p-5 flex flex-col gap-4" style={{ backgroundColor: accent }}>
          {/* Name / Photo */}
          <div className="text-center">
            {personalInfo.photo && (
              <div className="flex justify-center mb-3">
                <img src={personalInfo.photo} alt={personalInfo.name} className="w-20 h-20 rounded-full object-cover border-4 border-white/20" />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
          </div>

          {/* Contact */}
          <div>
            <SidebarLabel text="Contact" />
            <ul className="space-y-1.5 text-xs break-words">
              <li>{personalInfo.email}</li>
              <li>{personalInfo.phone}</li>
              <li>{personalInfo.location}</li>
              {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline opacity-80">LinkedIn</a></li>}
              {personalInfo.website && <li><a href={personalInfo.website} className="underline opacity-80">Website</a></li>}
              {personalInfo.github && <li><a href={personalInfo.github} className="underline opacity-80">GitHub</a></li>}
            </ul>
          </div>

          {/* Summary */}
          {cvData.summary && (
            <div>
              <SidebarLabel text="Profile" />
              <p className="text-xs leading-relaxed opacity-90" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </div>
          )}

          {/* Skills */}
          <div>
            <SidebarLabel text="Skills" />
            <ul className="list-disc list-inside text-xs space-y-1">
              {cvData.skills.slice(0, 14).map((skill, i) => <li key={i} {...editableProps(['skills', i])}>{skill}</li>)}
            </ul>
          </div>

          {/* Education */}
          <div>
            <SidebarLabel text="Education" />
            {cvData.education.map((edu, index) => (
              <div key={index} className="text-xs mb-3">
                <h3 className="font-bold leading-tight" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="opacity-80" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                <p className="opacity-60 text-[10px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
              </div>
            ))}
          </div>

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <div>
              <SidebarLabel text="Languages" />
              {cvData.languages.map((lang, index) => (
                <div key={index} className="text-xs mb-1.5">
                  <p className="font-bold" {...editableProps(['languages', index, 'name'])}>{lang.name}</p>
                  <p className="opacity-60 text-[10px]" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="col-span-8 p-6 flex flex-col">
          <main className="space-y-4 flex-1">

            {/* Experience */}
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Experience</h2>
              <div className="space-y-4">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group">
                    {isEditing && (
                      <button onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10">
                        <Trash className="h-4 w-4" />
                      </button>
                    )}
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-sm font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[10px] font-medium text-slate-500 shrink-0 ml-2" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-xs font-medium text-slate-600 mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 space-y-0.5 text-xs text-slate-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Projects */}
            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Projects</h2>
                <div className="space-y-3">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-xs text-slate-600 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      {proj.link && <a href={proj.link} className="text-xs text-blue-600 underline">{proj.link}</a>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Publications */}
            {cvData.publications && cvData.publications.length > 0 && (
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">Publications</h2>
                <div className="space-y-2">
                  {cvData.publications.map((pub, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                      <p className="text-xs text-slate-600">{pub.journal}, {pub.year}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <TemplateCustomSections
              customSections={cvData.customSections} references={cvData.references}
              renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-1.5 mb-3">{title}</h2>}
              sectionClassName="mb-4" titleClass="font-semibold text-xs"
              subtitleClass="text-[10px] text-slate-500" descClass="text-[10px] text-slate-600 mt-0.5" yearClass="text-[10px] text-slate-500"
            />
          </main>
        </div>
      </div>
      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplateModern;
