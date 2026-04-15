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
      handleUpdate(path, e.currentTarget.innerHTML);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  return (
    <div id="cv-preview-twoColumnBlue" className="bg-white text-slate-800 shadow-lg border" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]">
        {/* Left Sidebar */}
        <div className="w-[34%] flex-shrink-0 bg-blue-800 text-white p-5 flex flex-col">
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

          <div className="space-y-4 flex-1">
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
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <main className="space-y-5">
            {cvData.summary && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-2">Professional Summary</h2>
                <p className="text-xs leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-2">Experience</h2>
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
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700 border-b-2 border-blue-100 pb-1 mb-2">Projects</h2>
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

      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateTwoColumnBlue;
