import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateCorporate: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    <div id="cv-preview-corporate" className="bg-white p-8 sm:p-12 text-slate-900 shadow-lg border font-serif">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-800">{personalInfo.name}</h1>
        <div className="text-sm text-slate-600 mt-3">
          {personalInfo.location} &bull; {personalInfo.phone} &bull; {personalInfo.email}
        </div>
        <div className="text-sm text-blue-700 mt-1">
          <a href={personalInfo.linkedin} className="hover:underline">LinkedIn</a>
          {personalInfo.website && <> &bull; <a href={personalInfo.website} className="hover:underline">Website</a></>}
          {personalInfo.github && <> &bull; <a href={personalInfo.github} className="hover:underline">GitHub</a></>}
        </div>
      </header>

      <hr className="border-t-2 border-slate-700 mb-8" />

      <main className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold tracking-wide text-slate-700 mb-3">PROFESSIONAL SUMMARY</h2>
          <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-wide text-slate-700 mb-3">WORK EXPERIENCE</h2>
          <div className="space-y-6">
            {cvData.experience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-baseline">
                  <h3 className="text-md font-bold text-slate-800" {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                  <p className="text-sm font-normal text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <p className="text-md font-semibold italic text-slate-600 mb-2" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</p>
                <ul className="list-disc list-outside ml-5 space-y-2 text-base text-slate-700">
                  {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-wide text-slate-700 mb-3">EDUCATION</h2>
          {cvData.education.map((edu, index) => (
            <div key={index} className="mb-4">
              <div className="flex justify-between items-baseline">
                <h3 className="text-md font-bold text-slate-800" {...editableProps(['education', index, 'school'])}>{edu.school}</h3>
                <p className="text-sm text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
              </div>
              <p className="text-md italic text-slate-600" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
              {edu.description && (
                <p className="text-sm text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
              )}
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-wide text-slate-700 mb-3">KEY SKILLS & LANGUAGES</h2>
          <p className="text-base leading-relaxed">
            <span className="font-bold">Skills:</span>
            {(() => {
              const sk = cvData.skills.slice(0, 15);
              const perCol = Math.ceil(sk.length / 3);
              return (
                <div className="grid grid-cols-3 gap-x-4 mt-2">
                  {[0, 1, 2].map(ci => (
                    <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                      {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                        <li key={si} className="text-sm">{s}</li>
                      ))}
                    </ul>
                  ))}
                </div>
              );
            })()}
          </p>
          {cvData.languages && cvData.languages.length > 0 && (
            <p className="text-base leading-relaxed mt-2">
              <span className="font-bold">Languages:</span> {cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ')}
            </p>
          )}
        </section>

        {cvData.projects && cvData.projects.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold tracking-wide text-slate-700 mb-3">PROJECTS</h2>
            <div className="space-y-4">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-md font-bold text-slate-800" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-base text-slate-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-sm text-blue-700 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                </div>
              ))}
            </div>
          </section>
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

export default TemplateCorporate;