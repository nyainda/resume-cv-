import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateTimeline: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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

  const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
    <section className={`mb-8 ${className}`}>
      <h2 className="text-lg font-bold uppercase tracking-wider text-slate-700 border-b-2 border-slate-200 pb-2 mb-4">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-timeline" className="bg-white p-10 text-slate-800 shadow-lg border font-['Inter']">
      <header className="text-center mb-10">
        <h1 className="text-5xl font-extrabold tracking-tight">{personalInfo.name}</h1>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-md text-slate-500 mt-4">
          <span>{personalInfo.email}</span>
          <span>&bull;</span>
          <span>{personalInfo.phone}</span>
          <span>&bull;</span>
          <span>{personalInfo.location}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 text-md text-blue-600 mt-2">
          <a href={personalInfo.linkedin} className="hover:underline">LinkedIn</a>
          {personalInfo.website && <a href={personalInfo.website} className="hover:underline">Website</a>}
          {personalInfo.github && <a href={personalInfo.github} className="hover:underline">GitHub</a>}
        </div>
      </header>

      <main>
        <Section title="Summary">
          <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Experience">
          <div className="relative border-l-2 border-slate-200 pl-8 space-y-10">
            {cvData.experience.map((job, index) => (
              <div key={index} className="relative">
                <div className="absolute -left-[38px] top-1 h-3 w-3 rounded-full bg-slate-500 border-2 border-white"></div>
                <p className="text-sm font-semibold text-slate-500 mb-1" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                <h3 className="text-xl font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                <p className="text-md text-slate-600 font-medium" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                <ul className="list-disc list-outside ml-4 mt-2 space-y-1 text-base">
                  {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Section title="Education" className="md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cvData.education.map((edu, index) => (
                <div key={index} className="mb-4">
                  <h3 className="text-lg font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p className="text-md text-slate-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-sm text-slate-500" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Skills">
            <p className="text-base leading-relaxed">
              {(() => {
                const sk = cvData.skills.slice(0, 15);
                const perCol = Math.ceil(sk.length / 3);
                return (
                  <div className="grid grid-cols-3 gap-x-4">
                    {[0, 1, 2].map(ci => (
                      <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                        {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                          <li key={si} className="text-sm text-slate-700">{s}</li>
                        ))}
                      </ul>
                    ))}
                  </div>
                );
              })()}
            </p>
          </Section>

          {cvData.languages && cvData.languages.length > 0 && (
            <Section title="Languages">
              <ul className="space-y-1">
                {cvData.languages.map((l, i) => (
                  <li key={i}><span className="font-semibold">{l.name}:</span> {l.proficiency}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {cvData.projects && cvData.projects.length > 0 && (
          <Section title="Projects">
            <div className="space-y-6">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-lg font-bold" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-base mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
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

export default TemplateTimeline;