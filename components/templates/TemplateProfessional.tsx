import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { Trash } from '../icons';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateProfessional: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  
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
      handleUpdate(path, e.currentTarget.innerHTML); // Use innerHTML to preserve line breaks
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  return (
    <div id="cv-preview-professional" className="bg-white p-8 sm:p-12 text-slate-900 shadow-lg border font-serif">
      <header className="text-center border-b-2 border-slate-300 pb-6 mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{personalInfo.name}</h1>
        <div className="flex justify-center items-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-3 flex-wrap">
          <span>{personalInfo.email}</span>
          <span className="hidden sm:inline">|</span>
          <span>{personalInfo.phone}</span>
          <span className="hidden sm:inline">|</span>
          <span>{personalInfo.location}</span>
          {personalInfo.linkedin && ( <><span className="hidden sm:inline">|</span><a href={personalInfo.linkedin} className="text-blue-600 hover:underline">LinkedIn</a></> )}
          {personalInfo.website && ( <><span className="hidden sm:inline">|</span><a href={personalInfo.website} className="text-blue-600 hover:underline">Website</a></> )}
          {personalInfo.github && ( <><span className="hidden sm:inline">|</span><a href={personalInfo.github} className="text-blue-600 hover:underline">GitHub</a></> )}
        </div>
      </header>

      <main className="space-y-12">
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Professional Summary</h2>
          <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Experience</h2>
          <div className="space-y-8">
            {cvData.experience.map((job, index) => (
              <div key={index} className="relative group">
                {isEditing && (
                    <button
                        onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-10 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                        title="Delete this experience entry"
                    >
                        <Trash className="h-4 w-4" />
                    </button>
                )}
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="text-lg font-bold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                  <p className="text-sm font-medium text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <p className="text-base font-bold text-slate-700" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                <ul className="list-disc list-outside ml-5 mt-2 space-y-2 text-base text-slate-700">
                  {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Skills</h2>
          <p className="text-base leading-relaxed">
            {cvData.skills.map((s, i) => <span key={i}>{s}{i < cvData.skills.length - 1 && ' • '}</span>)}
          </p>
        </section>

        {cvData.languages && cvData.languages.length > 0 && (
             <section>
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Languages</h2>
                 <p className="text-base leading-relaxed">
                    {cvData.languages.map((l, i) => <span key={i}>{l.name} ({l.proficiency}){i < cvData.languages.length - 1 && ' • '}</span>)}
                </p>
            </section>
        )}

        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Education</h2>
          {cvData.education.map((edu, index) => (
            <div key={index} className="mb-6">
                <div className="flex justify-between items-baseline">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                        <p className="text-base text-slate-700" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                    </div>
                    <p className="text-sm font-medium text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
                {edu.description && (
                    <p className="text-sm text-slate-600 mt-1 italic" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                )}
            </div>
          ))}
        </section>
        
        {cvData.publications && cvData.publications.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Publications</h2>
            <div className="space-y-4">
              {cvData.publications.map((pub, index) => (
                <div key={index}>
                  <h3 className="text-base font-bold text-slate-900" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                  <p className="text-sm text-slate-700" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</p>
                  <p className="text-sm italic text-slate-600">
                    <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {cvData.projects && cvData.projects.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Projects</h2>
            <div className="space-y-6">
                {cvData.projects.map((proj, index) => (
                <div key={index}>
                    <h3 className="text-lg font-bold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                    <p className="text-base text-slate-700 mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                     {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
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

export default TemplateProfessional;