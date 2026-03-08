import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateTwoColumnBlue: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
      handleUpdate(path, e.currentTarget.innerHTML); // Use innerHTML to preserve line breaks
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  return (
    <div id="cv-preview-twoColumnBlue" className="bg-white text-slate-800 shadow-lg border">
      <div className="grid grid-cols-12">
        {/* Left Sidebar */}
        <div className="col-span-4 bg-blue-800 text-white p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight">{personalInfo.name}</h1>
          </div>
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-3">Contact</h2>
              <ul className="space-y-2 text-sm break-words">
                <li>{personalInfo.email}</li>
                <li>{personalInfo.phone}</li>
                <li>{personalInfo.location}</li>
                {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>}
                {personalInfo.website && <li><a href={personalInfo.website} className="underline">Website</a></li>}
                {personalInfo.github && <li><a href={personalInfo.github} className="underline">GitHub</a></li>}
              </ul>
            </section>
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-3">Skills</h2>
              <ul className="list-disc list-inside text-sm space-y-1">
                {cvData.skills.slice(0, 15).map((skill, i) => <li key={i} {...editableProps(['skills', i])}>{skill}</li>)}
              </ul>
            </section>
            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-3">Languages</h2>
                <ul className="text-sm space-y-2">
                  {cvData.languages.map((lang, i) => (
                    <li key={i}>
                      <p className="font-bold" {...editableProps(['languages', i, 'name'])}>{lang.name}</p>
                      <p className="text-blue-200" {...editableProps(['languages', i, 'proficiency'])}>{lang.proficiency}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-200 border-b border-blue-500 pb-1 mb-3">Education</h2>
              {cvData.education.map((edu, index) => (
                <div key={index} className="text-sm">
                  <h3 className="font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-blue-300" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-8">
          <main className="space-y-10">
            <section>
              <h2 className="text-lg font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-3">Professional Summary</h2>
              <p className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>

            <section>
              <h2 className="text-lg font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-3">Experience</h2>
              <div className="space-y-6">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-base font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-xs font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-sm font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-sm text-slate-700">
                      {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-lg font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-3">Projects</h2>
                <div className="space-y-5">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-base font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-sm" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
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

export default TemplateTwoColumnBlue;