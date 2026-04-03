import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateCreative: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200 mb-3">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-creative" className="bg-white shadow-lg border font-['Inter'] grid grid-cols-12 min-h-[842pt]">
      {/* Sidebar */}
      <div className="col-span-4 bg-teal-700 text-white p-8 space-y-8">
        <div className="flex flex-col items-center text-center">
          {personalInfo.photo ? (
            <img
              src={personalInfo.photo}
              alt={personalInfo.name}
              className="w-32 h-32 rounded-full object-cover mb-4 border-4 border-teal-300"
            />
          ) : (
            <div className="w-32 h-32 bg-teal-200 rounded-full mb-4 flex items-center justify-center">
              <span className="text-teal-700 text-4xl font-bold">
                {personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}
              </span>
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tighter">{personalInfo.name}</h1>
        </div>

        <SidebarSection title="Contact">
          <ul className="space-y-2 text-sm break-words">
            <li>{personalInfo.email}</li>
            <li>{personalInfo.phone}</li>
            <li>{personalInfo.location}</li>
            {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>}
            {personalInfo.website && <li><a href={personalInfo.website} className="underline">Website</a></li>}
            {personalInfo.github && <li><a href={personalInfo.github} className="underline">GitHub</a></li>}
          </ul>
        </SidebarSection>

        <SidebarSection title="Skills">
          <div className="flex flex-wrap gap-2">
            {cvData.skills.slice(0, 15).map((skill, i) => <span key={i} className="bg-teal-600 text-white text-xs font-medium px-2.5 py-1 rounded">{skill}</span>)}
          </div>
        </SidebarSection>

        {cvData.languages && cvData.languages.length > 0 && (
          <SidebarSection title="Languages">
            <ul className="space-y-2 text-sm">
              {cvData.languages.map((lang, index) => (
                <li key={index}>
                  <span {...editableProps(['languages', index, 'name'])}>{lang.name}</span> - <span className="text-teal-200" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</span>
                </li>
              ))}
            </ul>
          </SidebarSection>
        )}

        <SidebarSection title="Education">
          {cvData.education.map((edu, index) => (
            <div key={index} className="text-sm">
              <h3 className="font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
              <p className="text-teal-100" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
              <p className="text-teal-200" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
            </div>
          ))}
        </SidebarSection>
      </div>

      {/* Main Content */}
      <div className="col-span-8 p-10 text-slate-800">
        <main className="space-y-10">
          <section>
            <h2 className="text-xl font-bold text-teal-700 tracking-wide pb-2 mb-4">PROFILE</h2>
            <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </section>

          <section>
            <h2 className="text-xl font-bold text-teal-700 tracking-wide pb-2 mb-4">EXPERIENCE</h2>
            <div className="space-y-6">
              {cvData.experience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-lg font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <p className="text-sm font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <p className="text-md font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-base">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {cvData.projects && cvData.projects.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-teal-700 tracking-wide pb-2 mb-4">PROJECTS</h2>
              <div className="space-y-5">
                {cvData.projects.map((proj, index) => (
                  <div key={index}>
                    <h3 className="text-lg font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                    <p className="text-base" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                    {proj.link && <a href={proj.link} className="text-sm text-teal-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateCreative;