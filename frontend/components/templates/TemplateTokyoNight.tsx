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

const TemplateTokyoNight: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#22d3ee';

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
    className: "outline-none ring-1 ring-transparent focus:ring-fuchsia-500 focus:bg-fuchsia-500/10 rounded px-1 -mx-1"
  } : {};

  const SectionHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border shrink-0" style={{ color: accent, backgroundColor: accent + '1a', borderColor: accent + '33' }}>{title}</h2>
      <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(to right, ${accent}33, transparent)` }} />
    </div>
  );

  return (
    <div id="cv-preview-tokyo-night" className="bg-[#1a1b26] p-7 text-slate-300 shadow-2xl border border-slate-800 font-mono flex flex-col min-h-[280mm]" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <header className="mb-4 border-l-4 border-fuchsia-500 pl-5">
        <h1 className="text-2xl font-black tracking-tighter text-white mb-1 uppercase italic">{personalInfo.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cyan-400/80">
          <span>{personalInfo.email}</span>
          <span>{personalInfo.phone}</span>
          <span>{personalInfo.location}</span>
          {personalInfo.github && <span className="text-white">github.com/{personalInfo.github.split('/').pop()}</span>}
        </div>
      </header>

      <main className="grid grid-cols-12 gap-5 flex-1">

        {/* ── Main (left 8 cols) ── */}
        <div className="col-span-8 flex flex-col gap-4">

          {/* Experience */}
          <section>
            <SectionHeader title="Deployment History" />
            <div className="space-y-4">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group pl-3 border-l border-fuchsia-500/30 hover:border-fuchsia-500 transition-colors">
                  {isEditing && (
                    <button onClick={() => handleDeleteExperience(index)}
                      className="absolute -left-10 top-0 p-1.5 text-red-500 hover:bg-red-900/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-900/50 bg-slate-900 shadow-lg">
                      <Trash className="h-3 w-3" />
                    </button>
                  )}
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="text-sm font-bold text-white uppercase italic" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <span className="text-[10px] font-black shrink-0 ml-2" style={{ color: accent }} {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                  </div>
                  <p className="text-xs font-bold text-fuchsia-400 mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="space-y-1 text-xs text-slate-400">
                    {smartBullets(job.responsibilities, cvData.experience.length).map((resp, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-fuchsia-500 shrink-0">{'>'}</span>
                        <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          {cvData.projects && cvData.projects.length > 0 && (
            <section>
              <SectionHeader title="Repos" />
              <div className="space-y-2">
                {cvData.projects.map((proj, i) => (
                  <div key={i} className="border-l border-fuchsia-500/20 pl-3">
                    <p className="text-xs font-black text-white uppercase">{proj.name}</p>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} />
                    {proj.link && <a href={proj.link} className="text-[10px] truncate block" style={{ color: accent }}>{proj.link}</a>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <TemplateCustomSections
            customSections={cvData.customSections} references={undefined}
            renderHeader={title => <SectionHeader title={title} />}
            sectionClassName="mb-4" titleClass="font-semibold text-xs text-white"
            subtitleClass="text-[10px] opacity-60" descClass="text-[10px] opacity-70 mt-0.5" yearClass="text-[10px] opacity-50"
          />
        </div>

        {/* ── Sidebar (right 4 cols) ── */}
        <div className="col-span-4 flex flex-col gap-4">

          {/* Summary */}
          {cvData.summary && (
            <section>
              <SectionHeader title="Synopsis" />
              <p className="text-xs leading-relaxed text-slate-400 border-l border-slate-700 pl-3 py-0.5" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>
          )}

          {/* Skills */}
          <section>
            <SectionHeader title="Stack" />
            <div className="flex flex-wrap gap-1.5">
              {cvData.skills.slice(0, 14).map((skill, i) => (
                <span key={i} className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700">
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* Education */}
          <section>
            <SectionHeader title="Base Info" />
            <div className="space-y-2">
              {cvData.education.map((edu, index) => (
                <div key={index} className="border-l border-slate-800 pl-3 py-0.5">
                  <h3 className="text-[10px] font-black text-white uppercase leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p className="text-[10px] text-fuchsia-400 font-bold" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-[10px] text-slate-500" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <section>
              <SectionHeader title="Kernel" />
              <div className="space-y-1.5">
                {cvData.languages.map((lang, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px]">
                    <span className="text-white font-bold">{lang.name}</span>
                    <span style={{ color: accent }}>{lang.proficiency}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cvData.references && cvData.references.length > 0 && (
            <section>
              <SectionHeader title="Refs" />
              <div className="space-y-1.5">
                {cvData.references.slice(0, 2).map((ref, i) => (
                  <div key={i} className="text-[10px]">
                    <p className="text-white font-bold">{ref.name}</p>
                    <p className="text-slate-500">{ref.title}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplateTokyoNight;
