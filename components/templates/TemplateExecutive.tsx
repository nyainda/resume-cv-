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

// Harvard-style Executive Template — Premium serif, clean, authoritative
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

  const handleDeleteExperience = (index: number) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    newCvData.experience.splice(index, 1);
    onDataChange(newCvData);
  };

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      handleUpdate(path, e.currentTarget.innerHTML);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  return (
    <div id="cv-preview-executive" className="bg-white p-10 sm:p-14 text-gray-900 shadow-lg border font-serif" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {/* Header — Centered, Harvard-style */}
      <header className="text-center mb-6 pb-5 border-b-2 border-gray-800">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 uppercase mb-2" style={{ letterSpacing: '0.08em' }}>
          {personalInfo.name}
        </h1>
        <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          {personalInfo.location && <span>{personalInfo.location}</span>}
          {personalInfo.phone && <><span className="text-gray-400">|</span><span>{personalInfo.phone}</span></>}
          {personalInfo.email && <><span className="text-gray-400">|</span><a href={`mailto:${personalInfo.email}`} className="text-blue-700 hover:underline">{personalInfo.email}</a></>}
          {personalInfo.linkedin && <><span className="text-gray-400">|</span><a href={personalInfo.linkedin} className="text-blue-700 hover:underline">LinkedIn</a></>}
          {personalInfo.github && <><span className="text-gray-400">|</span><a href={personalInfo.github} className="text-blue-700 hover:underline">GitHub</a></>}
          {personalInfo.website && <><span className="text-gray-400">|</span><a href={personalInfo.website} className="text-blue-700 hover:underline">Portfolio</a></>}
        </div>
      </header>

      <main className="space-y-5">
        {/* Summary */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-2 pb-1 border-b border-gray-300">Executive Summary</h2>
          <p className="text-sm leading-relaxed text-gray-800 text-justify" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </section>

        {/* Experience */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-3 pb-1 border-b border-gray-300">Professional Experience</h2>
          <div className="space-y-5">
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
                <div className="flex justify-between items-baseline">
                  <h3 className="text-sm font-bold text-gray-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                  <span className="text-xs text-gray-600 italic whitespace-nowrap ml-4" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                </div>
                <p className="text-sm font-semibold text-gray-700 italic" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1 text-sm text-gray-700">
                  {job.responsibilities.map((resp, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Education */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-3 pb-1 border-b border-gray-300">Education</h2>
          <div className="space-y-3">
            {cvData.education.map((edu, index) => (
              <div key={index}>
                <div className="flex justify-between items-baseline">
                  <h3 className="text-sm font-bold text-gray-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <span className="text-xs text-gray-600 italic whitespace-nowrap ml-4" {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                </div>
                <p className="text-sm text-gray-700 italic" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                {edu.description && (
                  <p className="text-xs text-gray-600 mt-0.5" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-2 pb-1 border-b border-gray-300">Core Competencies</h2>
          {cvData.skills && cvData.skills.length > 0 && (() => {
            const cols = 3;
            const perCol = Math.ceil(cvData.skills.length / cols);
            const columns: string[][] = [];
            for (let i = 0; i < cols; i++) {
              columns.push(cvData.skills.slice(i * perCol, (i + 1) * perCol));
            }
            return (
              <div className="grid grid-cols-3 gap-x-8 gap-y-1">
                {columns.map((col, ci) => (
                  <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                    {col.map((skill, si) => (
                      <li key={si} className="text-sm text-gray-800">{skill}</li>
                    ))}
                  </ul>
                ))}
              </div>
            );
          })()}
        </section>

        {/* Languages */}
        {cvData.languages && cvData.languages.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-2 pb-1 border-b border-gray-300">Languages</h2>
            <p className="text-sm text-gray-800">
              {cvData.languages.map((l, i) => (
                <span key={i}>{l.name} <span className="italic text-gray-600">({l.proficiency})</span>{i < cvData.languages!.length - 1 && <span className="text-gray-400 mx-1.5">•</span>}</span>
              ))}
            </p>
          </section>
        )}

        {/* Projects */}
        {cvData.projects && cvData.projects.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-3 pb-1 border-b border-gray-300">Notable Projects</h2>
            <div className="space-y-3">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-bold text-gray-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                    {proj.link && <a href={proj.link} className="text-xs text-blue-700 hover:underline" {...editableProps(['projects', index, 'link'])}>↗ Link</a>}
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Publications */}
        {cvData.publications && cvData.publications.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-3 pb-1 border-b border-gray-300">Publications</h2>
            <div className="space-y-2">
              {cvData.publications.map((pub, index) => (
                <div key={index}>
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</span>.{' '}
                    <span className="italic" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</span>.{' '}
                    <span className="text-gray-600" {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>.
                  </p>
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

export default TemplateExecutive;