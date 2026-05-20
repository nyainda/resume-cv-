import { smartBullets } from '../../utils/smartBullets';
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

const TemplateBerlinDesign: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#eab308';

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
    className: "outline-none ring-2 ring-yellow-400 bg-yellow-50 rounded"
  } : {};

  const SectionHeading = ({ children, num }: { children: React.ReactNode, num: string }) => (
    <div className="mb-5 relative">
      <h2 className="text-2xl font-black uppercase tracking-tighter text-zinc-900 border-b-8 inline-block relative z-10" style={{ borderColor: accent }}>{children}</h2>
    </div>
  );

  return (
    <div id="cv-preview-berlin-design" className="bg-white p-8 text-zinc-900 shadow-2xl border-4 border-zinc-900 font-sans overflow-hidden">
      <header className="mb-10 grid grid-cols-12 gap-8 items-start">
        <div className="col-span-8">
            <h1 className="text-6xl font-black uppercase tracking-tighter leading-[0.85] break-words">
                {personalInfo.name.split(' ').map((n, i) => (
                    <span key={i} className={i % 2 === 1 ? 'text-zinc-300' : 'text-zinc-900'}>{n}<br /></span>
                ))}
            </h1>
        </div>
        <div className="col-span-4 space-y-4 pt-4">
            <div className="bg-zinc-900 text-white p-6 -rotate-2 shadow-xl">
                 <p className="text-sm font-bold tracking-widest uppercase mb-4 border-b border-zinc-700 pb-2">Connect</p>
                 <div className="space-y-1 text-xs font-mono break-all">
                    <p>{personalInfo.email}</p>
                    <p>{personalInfo.phone}</p>
                    <p>{personalInfo.location}</p>
                 </div>
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 pt-4">
                Berlin / Design / Code / {new Date().getFullYear()}
            </div>
        </div>
      </header>

      <main className="space-y-12">
        <section>
          <SectionHeading num="01">Profile</SectionHeading>
          <div className="max-w-3xl ml-auto border-r-8 pr-12 text-right" style={{ borderColor: accent }}>
            <p className="text-lg font-black tracking-tight leading-tight uppercase" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </div>
        </section>

        <section>
          <SectionHeading num="02">Work</SectionHeading>
          <div className="space-y-10">
            {cvData.experience.map((job, index) => (
              <div key={index} className="relative group grid grid-cols-12 gap-8">
                {isEditing && (
                  <button
                    onClick={() => handleDeleteExperience(index)}
                    className="absolute -left-16 top-0 p-4 bg-red-600 text-white font-black hover:rotate-12 transition-transform shadow-xl"
                  >
                    DEL
                  </button>
                )}
                <div className="col-span-4">
                    <p className="text-sm font-black bg-zinc-900 text-white inline-block px-2 py-1 mb-2">[{job.dates}]</p>
                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none" {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                </div>
                <div className="col-span-8 flex flex-col justify-end">
                    <h4 className="text-base font-bold italic text-zinc-400 mb-2" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h4>
                    <ul className="space-y-2 text-sm font-medium tracking-tight">
                        {smartBullets(job.responsibilities, cvData.experience.length).map((resp, i) => (
                            <li key={i} className="border-b-2 border-zinc-100 pb-4 last:border-0 hover:bg-yellow-50 transition-colors cursor-default" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                        ))}
                    </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-12 gap-6">
            <section className="col-span-7">
                <SectionHeading num="03">Skills</SectionHeading>
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                    {cvData.skills.slice(0, 15).map((s, i) => (
                        <span key={i} className="text-xl font-black uppercase italic tracking-tighter text-zinc-300 hover:text-zinc-900 transition-colors cursor-default">
                            {s}<span style={{ color: accent }}>.</span>
                        </span>
                    ))}
                </div>
            </section>
            <section className="col-span-5">
                <SectionHeading num="04">Edu</SectionHeading>
                <div className="space-y-5">
                    {cvData.education.map((edu, idx) => (
                        <div key={idx} className="border-l-4 border-zinc-900 pl-6">
                            <h3 className="text-base font-black uppercase tracking-tighter leading-none mb-1" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                            <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{edu.school} / {edu.year}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
      </main>

      <footer className="mt-10 pt-6 border-t-8 border-zinc-900 flex justify-between items-end">
         <div className="text-5xl font-black text-zinc-100 uppercase italic select-none">Berlin</div>
         <div className="text-right space-y-1 text-[10px] font-black uppercase tracking-widest">
            <p>Designed for Impact</p>
            <p>Built with Antigravity</p>
         </div>
      </footer>

      
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-900 border-b-4 inline-block mb-4" style={{ borderColor: accent }}>{title}</h2>}
          sectionClassName="mb-8"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-zinc-500"
          descClass="text-xs text-zinc-600 mt-0.5"
          yearClass="text-xs text-zinc-400"
        />
{jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateBerlinDesign;
