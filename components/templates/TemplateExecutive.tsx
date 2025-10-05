import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateExecutive: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  
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
  
  const Section: React.FC<{title: string; children: React.ReactNode}> = ({ title, children }) => (
    <section className="py-6 border-b-2 border-slate-100">
      <h2 className="text-lg font-bold uppercase tracking-wider text-slate-500 mb-4">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-executive" className="bg-white p-12 text-slate-800 shadow-lg border font-['Inter']">
      <header className="text-left mb-8 pb-8 border-b-4 border-slate-800">
        <h1 className="text-6xl font-extrabold tracking-tighter">{personalInfo.name}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-md text-slate-600 mt-4">
          <span>{personalInfo.email}</span>
          <span>{personalInfo.phone}</span>
          <span>{personalInfo.location}</span>
          <a href={personalInfo.linkedin} className="text-blue-600 hover:underline">LinkedIn</a>
        </div>
      </header>

      <main>
        <Section title="Executive Summary">
          <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Professional Experience">
          <div className="space-y-8">
            {cvData.experience.map((job, index) => (
              <div key={index}>
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-4">
                        <p className="text-sm font-semibold text-slate-700" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                        <p className="text-xs text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <div className="col-span-8">
                        <h3 className="text-lg font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                        <ul className="list-disc list-outside ml-4 mt-2 space-y-1.5 text-base">
                            {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                        </ul>
                    </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            <Section title="Education">
                {cvData.education.map((edu, index) => (
                     <div key={index}>
                        <h3 className="text-lg font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                        <p className="text-md text-slate-600" {...editableProps(['education', index, 'school'])}>, <span {...editableProps(['education', index, 'year'])}>{edu.year}</span></p>
                     </div>
                ))}
            </Section>
            
            <Section title="Core Competencies">
                <h4 className="font-bold mb-2">Skills</h4>
                <ul className="list-disc list-outside ml-4 columns-2 gap-x-8">
                    {cvData.skills.map((skill, i) => <li key={i}>{skill}</li>)}
                </ul>
                {cvData.languages && cvData.languages.length > 0 && (
                    <>
                        <h4 className="font-bold mb-2 mt-4">Languages</h4>
                        <ul className="list-disc list-outside ml-4">
                            {cvData.languages.map((lang, i) => <li key={i}>{lang.name} ({lang.proficiency})</li>)}
                        </ul>
                    </>
                )}
            </Section>
        </div>
      </main>
      
      {jobDescriptionForATS && (
          <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
            {jobDescriptionForATS}
          </div>
        )}
    </div>
  );
};

export default TemplateExecutive;