import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateClassic: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
      <h2 className="text-center text-sm font-bold uppercase tracking-[0.2em] text-slate-600 mb-5">{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-classic" className="bg-white p-12 text-slate-900 shadow-lg border font-serif">
      <header className="text-center pb-6 mb-6">
        <h1 className="text-5xl font-bold tracking-tight">{personalInfo.name}</h1>
        <hr className="my-4 border-t-2 border-slate-800 w-16 mx-auto" />
        <div className="flex justify-center items-center gap-x-4 text-sm text-slate-600 flex-wrap">
          <span>{personalInfo.email}</span>
          <span>&bull;</span>
          <span>{personalInfo.phone}</span>
          <span>&bull;</span>
          <span>{personalInfo.location}</span>
          <span>&bull;</span>
          <a href={personalInfo.linkedin} className="text-blue-700 hover:underline">LinkedIn</a>
        </div>
      </header>

      <main>
        <Section title="Summary">
          <p className="text-base leading-relaxed text-center" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
        </Section>

        <Section title="Experience">
          <div className="space-y-8">
            {cvData.experience.map((job, index) => (
              <div key={index}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="text-lg font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}, <span className="font-semibold text-slate-700" {...editableProps(['experience', index, 'company'])}>{job.company}</span></h3>
                  <p className="text-sm font-medium text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                </div>
                <ul className="list-disc list-outside ml-5 mt-2 space-y-2 text-base text-slate-700">
                  {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-10">
          <Section title="Education">
            {cvData.education.map((edu, index) => (
              <div key={index} className="text-center">
                <h3 className="text-lg font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="text-base text-slate-700" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                <p className="text-sm font-medium text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
              </div>
            ))}
          </Section>

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

export default TemplateClassic;