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

const TemplateParisVibe: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#fb7185';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const handleDeleteExperience = (index: number) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    newCvData.experience.splice(index, 1);
    onDataChange(newCvData);
  };

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true, suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
    className: "outline-none ring-1 ring-transparent focus:ring-rose-200 focus:bg-rose-50/50 rounded"
  } : {};

  const asideLabel = (n: string, label: string) => (
    <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2 flex items-center gap-2" style={{ color: accent }}>
      <span>{n}</span>
      <span className="h-px flex-1" style={{ backgroundColor: accent + '30' }}></span>
      <span>{label}</span>
    </h2>
  );

  return (
    <div id="cv-preview-paris-vibe" className="bg-[#fafafa] p-8 text-zinc-800 shadow-xl border border-zinc-100 font-serif flex flex-col min-h-[280mm]" style={{ fontFamily: "'Playfair Display', 'Times New Roman', serif" }}>
      <header className="mb-4">
        <div className="flex justify-between items-end border-b border-zinc-200 pb-3">
          <h1 className="text-3xl font-black tracking-tighter text-zinc-900 leading-none">
            {personalInfo.name.split(' ')[0]}<br />
            <span className="text-zinc-300 italic font-light">{personalInfo.name.split(' ').slice(1).join(' ')}</span>
          </h1>
          <div className="text-right text-xs uppercase tracking-widest text-zinc-400 space-y-0.5">
            <p>{personalInfo.location}</p>
            <p className="font-bold" style={{ color: accent }}>{personalInfo.email}</p>
            <p>{personalInfo.phone}</p>
            {personalInfo.linkedin && <p className="opacity-60 text-[10px]">{personalInfo.linkedin.replace('https://', '')}</p>}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-8 flex-1">

        {/* ── Aside ── */}
        <aside className="col-span-4 flex flex-col gap-4">
          {/* Summary */}
          {cvData.summary && (
            <section>
              {asideLabel('01', 'Profil')}
              <p className="text-xs font-light italic leading-relaxed text-zinc-500" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>
          )}

          {/* Skills */}
          <section>
            {asideLabel('02', 'Expertise')}
            <ul className="space-y-1.5 text-xs tracking-tight text-zinc-600">
              {cvData.skills.slice(0, 14).map((skill, i) => (
                <li key={i} className="border-b border-zinc-100 pb-1 flex justify-between items-center">
                  <span>{skill}</span>
                  <span className="text-[8px] text-rose-300">✦</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Education */}
          {cvData.education.length > 0 && (
            <section>
              {asideLabel('03', 'Formation')}
              <div className="space-y-2">
                {cvData.education.map((edu, idx) => (
                  <div key={idx}>
                    <h3 className="text-xs font-bold border-l-2 pl-3 leading-snug" style={{ borderColor: accent + '80' }} {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 pl-3">{edu.school} / {edu.year}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <section>
              {asideLabel('04', 'Langues')}
              <div className="space-y-1.5">
                {cvData.languages.map((lang, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="font-semibold text-zinc-700">{lang.name}</span>
                    <span className="text-zinc-400 text-[10px]">{lang.proficiency}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>

        {/* ── Main Content ── */}
        <div className="col-span-8 flex flex-col gap-5">

          {/* Experience */}
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-900 mb-3 border-b border-zinc-900 pb-1.5 inline-block">Parcours Professionnel</h2>
            <div className="space-y-5">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group">
                  {isEditing && (
                    <button onClick={() => handleDeleteExperience(index)} className="absolute -left-10 top-0 p-1.5 text-rose-300 hover:text-rose-600 transition-colors">
                      <Trash className="h-4 w-4" />
                    </button>
                  )}
                  <div className="flex justify-between items-end mb-1">
                    <h3 className="text-sm font-bold tracking-tight text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <span className="text-[10px] uppercase font-bold tracking-[0.2em] shrink-0 ml-2" style={{ color: accent }} {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                  </div>
                  <p className="text-xs italic font-light text-zinc-400 tracking-wider mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="space-y-1 text-xs text-zinc-600 font-light border-l border-zinc-100 pl-5">
                    {job.responsibilities.map((resp, i) => (
                      <li key={i} className="relative before:content-[''] before:absolute before:-left-5 before:top-2.5 before:w-3 before:h-px before:bg-rose-200"
                        dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          {cvData.projects && cvData.projects.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-900 mb-3 border-b border-zinc-900 pb-1.5 inline-block">Réalisations</h2>
              <div className="space-y-2">
                {cvData.projects.map((proj, index) => (
                  <div key={index}>
                    <h3 className="text-xs font-bold text-zinc-800">{proj.name}</h3>
                    <p className="text-[10px] text-zinc-500 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <TemplateCustomSections
            customSections={cvData.customSections} references={cvData.references}
            renderHeader={title => <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-900 mb-3 border-b border-zinc-900 pb-1.5 inline-block">{title}</h2>}
            sectionClassName="mb-4" titleClass="font-semibold text-xs"
            subtitleClass="text-[10px] text-zinc-500" descClass="text-[10px] text-zinc-600 mt-0.5" yearClass="text-[10px] text-zinc-400"
          />
        </div>
      </main>

      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplateParisVibe;
