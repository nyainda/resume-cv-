import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateModernTech: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    <div id="cv-preview-modern-tech" className="bg-white shadow-lg border">
      <div className="grid grid-cols-12">
        {/* Left Sidebar */}
        <div className="col-span-4 bg-gray-800 text-white p-8">
          <div className="text-left mb-8">
            <h1 className="text-4xl font-bold tracking-tight">{personalInfo.name}</h1>
          </div>
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 pb-1 mb-3">CONTACT</h2>
              <ul className="space-y-2 text-sm break-words">
                <li>{personalInfo.email}</li>
                <li>{personalInfo.phone}</li>
                <li>{personalInfo.location}</li>
                {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>}
                {personalInfo.github && <li><a href={personalInfo.github} className="underline">GitHub</a></li>}
              </ul>
            </section>
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 pb-1 mb-3">SKILLS</h2>
              <div className="flex flex-wrap gap-2">
                {cvData.skills.slice(0, 15).map((skill, i) => <span key={i} className="bg-gray-700 text-gray-200 text-xs font-medium px-2 py-1 rounded">{skill}</span>)}
              </div>
            </section>
            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 pb-1 mb-3">LANGUAGES</h2>
                <ul className="space-y-1 text-sm">
                  {cvData.languages.map((lang, i) => <li key={i}>{lang.name} - {lang.proficiency}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 pb-1 mb-3">EDUCATION</h2>
              {cvData.education.map((edu, index) => (
                <div key={index} className="text-sm">
                  <h3 className="font-semibold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p className="text-gray-300" {...editableProps(['education', index, 'school'])}>{edu.school}, {edu.year}</p>
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-10">
          <main className="space-y-8">
            <section>
              <h2 className="text-xl font-bold uppercase tracking-wider text-gray-800 pb-1 mb-3">SUMMARY</h2>
              <p className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>

            <section>
              <h2 className="text-xl font-bold uppercase tracking-wider text-gray-800 pb-1 mb-3">EXPERIENCE</h2>
              <div className="space-y-6">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-lg font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-xs font-mono text-gray-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-md font-medium text-gray-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-sm text-gray-700">
                      {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-xl font-bold uppercase tracking-wider text-gray-800 pb-1 mb-3">PROJECTS</h2>
                <div className="space-y-5">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-lg font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
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

export default TemplateModernTech;