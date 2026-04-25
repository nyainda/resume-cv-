
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
  const accent = cvData.accentColor ?? '#334155'; // default slate-700

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
    <div id="cv-preview-modern" className="bg-white text-zinc-800 shadow-lg border">
      <div className="grid grid-cols-12">
        {/* Left Sidebar */}
        <div className="col-span-4 text-white p-8" style={{ backgroundColor: accent }}>
          <div className="text-center mb-8">
            {personalInfo.photo && (
              <div className="flex justify-center mb-4">
                <img
                  src={personalInfo.photo}
                  alt={personalInfo.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-slate-400"
                />
              </div>
            )}
            <h1 className="text-4xl font-bold tracking-tight">{personalInfo.name}</h1>
          </div>
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 border-b border-slate-500 pb-1 mb-3">Contact</h2>
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
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 border-b border-slate-500 pb-1 mb-3">Skills</h2>
              <ul className="list-disc list-inside text-sm space-y-1">
                {cvData.skills.slice(0, 15).map((skill, i) => <li key={i} {...editableProps(['skills', i])}>{skill}</li>)}
              </ul>
            </section>
            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 border-b border-slate-500 pb-1 mb-3">Languages</h2>
                {cvData.languages.map((lang, index) => (
                  <div key={index} className="text-sm mb-2">
                    <p className="font-bold" {...editableProps(['languages', index, 'name'])}>{lang.name}</p>
                    <p className="text-slate-300" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</p>
                  </div>
                ))}
              </section>
            )}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 border-b border-slate-500 pb-1 mb-3">Education</h2>
              {cvData.education.map((edu, index) => (
                <div key={index} className="text-sm">
                  <h3 className="font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-slate-300" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-8">
          <main className="space-y-10">
            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500 border-b-2 border-zinc-100 pb-2 mb-5">Professional Summary</h2>
              <p className="text-sm leading-relaxed text-zinc-700 font-medium" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>

            <section>
              <h2 className="text-lg font-bold uppercase tracking-wider text-slate-600 border-b-2 border-slate-200 pb-1 mb-3">Experience</h2>
              <div className="space-y-6">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group">
                    {isEditing && (
                      <button
                        onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                        title="Delete this experience entry"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    )}
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
                <h2 className="text-lg font-bold uppercase tracking-wider text-slate-600 border-b-2 border-slate-200 pb-1 mb-3">Projects</h2>
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

            {cvData.publications && cvData.publications.length > 0 && (
              <section>
                <h2 className="text-lg font-bold uppercase tracking-wider text-slate-600 border-b-2 border-slate-200 pb-1 mb-3">Publications</h2>
                <div className="space-y-5">
                  {cvData.publications.map((pub, index) => (
                    <div key={index}>
                      <h3 className="text-base font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                      <p className="text-sm text-slate-600" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</p>
                      <p className="text-sm italic text-slate-500">
                        <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-lg font-bold uppercase tracking-wider text-slate-600 border-b-2 border-slate-200 pb-1 mb-3">{title}</h2>}
          sectionClassName="mb-6"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-slate-500"
          descClass="text-xs text-slate-600 mt-0.5"
          yearClass="text-xs text-slate-500"
        />
</main>
        </div>
      </div>
      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateModern;
