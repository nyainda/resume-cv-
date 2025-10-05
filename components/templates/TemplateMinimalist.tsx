import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateMinimalist: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  
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
  
  const Section: React.FC<{title: string; children: React.ReactNode}> = ({ title, children }) => (
    <section className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-minimalist" className="bg-white p-10 text-slate-800 shadow-lg border font-['Inter']">
      <header className="mb-12">
        <h1 className="text-5xl font-bold tracking-tighter">{personalInfo.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-3">
          <span>{personalInfo.email}</span>
          <span>{personalInfo.phone}</span>
          <span>{personalInfo.location}</span>
          {personalInfo.linkedin && <a href={personalInfo.linkedin} className="text-blue-600 hover:underline">LinkedIn</a>}
          {personalInfo.website && <a href={personalInfo.website} className="text-blue-600 hover:underline">Website</a>}
          {personalInfo.github && <a href={personalInfo.github} className="text-blue-600 hover:underline">GitHub</a>}
        </div>
      </header>

      <main>
        <Section title="Profile">
          <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Experience">
          <div className="space-y-6">
            {cvData.experience.map((job, index) => (
              <div key={index} className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <p className="text-sm font-semibold" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <div className="col-span-3">
                  <h3 className="text-base font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                  <p className="text-sm text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="list-disc list-outside ml-4 mt-2 space-y-1 text-sm">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Section>
        
        <Section title="Education">
            {cvData.education.map((edu, index) => (
                 <div key={index} className="grid grid-cols-4 gap-4">
                    <div className="col-span-1">
                        <p className="text-sm font-semibold" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                    <div className="col-span-3">
                        <h3 className="text-base font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                        <p className="text-sm text-slate-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                         {edu.description && (
                            <p className="text-sm text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                        )}
                    </div>
                 </div>
            ))}
        </Section>
        
        <div className="grid grid-cols-2 gap-8">
            <Section title="Skills">
            <div className="flex flex-wrap gap-2">
                {cvData.skills.map((skill, i) => <span key={i} className="bg-slate-100 text-slate-700 text-sm font-medium px-3 py-1 rounded-full">{skill}</span>)}
            </div>
            </Section>
            {cvData.languages && cvData.languages.length > 0 && (
                <Section title="Languages">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {cvData.languages.map((lang, i) => <div key={i}><span className="font-semibold">{lang.name}:</span> {lang.proficiency}</div>)}
                    </div>
                </Section>
            )}
        </div>


        {cvData.projects && cvData.projects.length > 0 && (
          <Section title="Projects">
             <div className="space-y-6">
                {cvData.projects.map((proj, index) => (
                <div key={index}>
                    <h3 className="text-base font-bold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                    <p className="text-sm mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                    {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                </div>
                ))}
            </div>
          </Section>
        )}
      </main>
      
      {jobDescriptionForATS && (
          <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
            {jobDescriptionForATS}
          </div>
        )}
    </div>
  );
};

export default TemplateMinimalist;