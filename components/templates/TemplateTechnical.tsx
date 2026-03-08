import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateTechnical: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-technical" className="bg-white p-10 text-slate-800 shadow-lg border font-['Inter']">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">{personalInfo.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2 font-mono">
          <span>{personalInfo.email}</span>
          <span>//</span>
          <a href={personalInfo.linkedin} className="text-blue-600 hover:underline">linkedin</a>
          {personalInfo.github && <><span>//</span><a href={personalInfo.github} className="text-blue-600 hover:underline">github</a></>}
          {personalInfo.website && <><span>//</span><a href={personalInfo.website} className="text-blue-600 hover:underline">portfolio</a></>}
        </div>
      </header>

      <main>
        <Section title="Objective">
          <p className="text-base" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Technical Skills">
          <div className="font-mono text-sm text-slate-700 bg-slate-50 p-4 rounded-md">
            {(() => {
              const sk = cvData.skills.slice(0, 15);
              const perCol = Math.ceil(sk.length / 3);
              return (
                <div className="grid grid-cols-3 gap-x-4">
                  {[0, 1, 2].map(ci => (
                    <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                      {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                        <li key={si} className="text-sm text-blue-700 font-semibold">{s}</li>
                      ))}
                    </ul>
                  ))}
                </div>
              );
            })()}
          </div>
        </Section>

        <Section title="Experience">
          <div className="space-y-6">
            {cvData.experience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-baseline">
                  <h3 className="text-lg font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                  <p className="text-sm font-mono text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <p className="text-md font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-base">
                  {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {cvData.projects && cvData.projects.length > 0 && (
          <Section title="Projects">
            <div className="space-y-5">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-lg font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name} <span className="text-sm text-slate-500 font-mono">{proj.link && <a href={proj.link} className="text-blue-600 hover:underline">[repo]</a>}</span></h3>
                  <p className="text-base mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Section title="Education">
            {cvData.education.map((edu, index) => (
              <div key={index}>
                <h3 className="text-lg font-semibold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="text-md text-slate-600">{edu.school} - {edu.year}</p>
              </div>
            ))}
          </Section>
          {cvData.languages && cvData.languages.length > 0 && (
            <Section title="Languages">
              <p className="font-mono text-sm">
                {cvData.languages.map((l, i) => (
                  <span key={i}>
                    <span className="font-bold">{l.name}:</span> {l.proficiency}{i < cvData.languages.length - 1 ? '; ' : ''}
                  </span>
                ))}
              </p>
            </Section>
          )}
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

export default TemplateTechnical;