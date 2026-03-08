import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateElegant: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    <section className="mb-8">
      <div className="flex items-center mb-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700 mr-4">{title}</h2>
        <div className="flex-grow h-px bg-slate-200"></div>
      </div>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-elegant" className="bg-white p-10 text-slate-800 shadow-lg border font-serif">
      <header className="text-center mb-10">
        <h1 className="text-5xl font-bold tracking-tight">{personalInfo.name}</h1>
        <p className="text-lg text-slate-500 mt-2">Professional Title or Tagline</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-4">
          <span>{personalInfo.email}</span>
          <span>&bull;</span>
          <span>{personalInfo.phone}</span>
          <span>&bull;</span>
          <span>{personalInfo.location}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 text-sm text-blue-600 mt-1">
          <a href={personalInfo.linkedin} className="hover:underline">LinkedIn</a>
          {personalInfo.website && <a href={personalInfo.website} className="hover:underline">Website</a>}
          {personalInfo.github && <a href={personalInfo.github} className="hover:underline">GitHub</a>}
        </div>
      </header>

      <main>
        <Section title="Summary">
          <p className="text-base leading-relaxed text-center" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Experience">
          <div className="space-y-6">
            {cvData.experience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-baseline">
                  <h3 className="text-lg font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                  <p className="text-sm font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <p className="text-md text-slate-600 font-semibold" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                <ul className="list-none mt-2 space-y-1 text-base">
                  {job.responsibilities.map((resp, i) => <li key={i} className="flex items-start"><span className="mr-2 text-slate-400">&rsaquo;</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Education">
          {cvData.education.map((edu, index) => (
            <div key={index} className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="text-md text-slate-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
              </div>
              <p className="text-sm text-slate-500 font-medium text-right" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
            </div>
          ))}
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Section title="Skills">
            {(() => {
              const sk = cvData.skills.slice(0, 15);
              const perCol = Math.ceil(sk.length / 3);
              return (
                <div className="grid grid-cols-3 gap-x-6">
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
          </Section>
          {cvData.languages && cvData.languages.length > 0 && (
            <Section title="Languages">
              <p className="text-base leading-relaxed">
                {cvData.languages.map((l, i) => `${l.name} (${l.proficiency})`).join(' &nbsp;&bull;&nbsp; ')}
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

export default TemplateElegant;