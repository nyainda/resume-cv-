import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateCompact: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const MainSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-1 mb-2">{title}</h2>
      {children}
    </section>
  );


  return (
    <div id="cv-preview-compact" className="bg-white p-8 text-slate-800 shadow-lg border font-['Inter'] text-[10pt] leading-snug">
      <header className="text-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{personalInfo.name}</h1>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-2">
          <span>{personalInfo.email}</span>
          <span>|</span>
          <span>{personalInfo.phone}</span>
          <span>|</span>
          <span>{personalInfo.location}</span>
          <span>|</span>
          <a href={personalInfo.linkedin} className="text-blue-600 hover:underline">LinkedIn</a>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-x-8">
        {/* Main Content */}
        <div className="col-span-8">
          <MainSection title="Summary">
            <p dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </MainSection>

          <MainSection title="Experience">
            <div className="space-y-4">
              {cvData.experience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-[11pt] font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <p className="text-xs font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <p className="text-[10pt] font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="list-disc list-outside ml-4 mt-1 space-y-1 text-slate-700">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              ))}
            </div>
          </MainSection>
        </div>

        {/* Sidebar */}
        <div className="col-span-4 border-l border-slate-200 pl-6">
          <SidebarSection title="Skills">
            <ul className="list-disc list-outside ml-4 space-y-0.5">
              {cvData.skills.slice(0, 15).map((s, i) => (
                <li key={i} className="text-sm text-slate-700">{s}</li>
              ))}
            </ul>
          </SidebarSection>
          {cvData.languages && cvData.languages.length > 0 && (
            <SidebarSection title="Languages">
              <div className="space-y-2">
                {cvData.languages.map((l, i) => <p key={i}><span className="font-semibold">{l.name}:</span> {l.proficiency}</p>)}
              </div>
            </SidebarSection>
          )}
          <SidebarSection title="Projects">
            <div className="space-y-3">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-xs" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-xs text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>View Project</a>}
                </div>
              ))}
            </div>
          </SidebarSection>
          <SidebarSection title="Education">
            {cvData.education.map((edu, index) => (
              <div key={index} className="mb-2">
                <h3 className="font-semibold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="text-xs">{edu.school}, {edu.year}</p>
              </div>
            ))}
          </SidebarSection>
        </div>

      </div>
      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateCompact;