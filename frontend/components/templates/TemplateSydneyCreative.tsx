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

const TemplateSydneyCreative: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#1B2B4B';

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
    className: "outline-none ring-2 ring-orange-300 bg-orange-50 rounded"
  } : {};

  return (
    <div id="cv-preview-sydney-creative" className="bg-[#fff9f2] text-slate-900 shadow-2xl font-sans overflow-hidden flex flex-col min-h-[280mm]">

      {/* Header */}
      <header className="relative bg-gradient-to-tr from-orange-400 via-pink-500 to-[#1B2B4B] p-8 text-white overflow-hidden" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 88%, 0 100%)' }}>
        <div className="relative z-10">
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2 drop-shadow-lg">
            Hello.<br />I'm {personalInfo.name.split(' ')[0]}.
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-bold uppercase tracking-widest bg-black/20 backdrop-blur-md px-4 py-2 rounded-full inline-flex">
            <span>{personalInfo.email}</span>
            <span>{personalInfo.location}</span>
            {personalInfo.phone && <span>{personalInfo.phone}</span>}
            {personalInfo.website && <a href={personalInfo.website} className="underline underline-offset-4">Portfolio</a>}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="grid grid-cols-12 flex-1">

        {/* ── Sidebar ── */}
        <div className="col-span-4 bg-slate-900 text-white p-5 flex flex-col gap-4">

          {/* Summary */}
          {cvData.summary && (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-2">About Me</h2>
              <p className="text-xs text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>
          )}

          {/* Skills */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400 mb-2">My Toolkit</h2>
            <div className="flex flex-wrap gap-1.5">
              {cvData.skills.slice(0, 14).map((skill, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-800 text-xs font-bold rounded border-b-2 border-orange-500">{skill}</span>
              ))}
            </div>
          </section>

          {/* Education */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-400 mb-2">Academic Base</h2>
            <div className="space-y-2">
              {cvData.education.map((edu, idx) => (
                <div key={idx} className="relative pl-4 border-l-2 border-pink-500/30">
                  <div className="absolute -left-[5px] top-0.5 w-2 h-2 bg-pink-500 rounded-full" />
                  <h3 className="text-xs font-black leading-tight" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                  <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mt-0.5">{edu.school}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 italic">{edu.year}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-2">Languages</h2>
              <div className="space-y-1.5">
                {cvData.languages.map((lang, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="font-bold text-white">{lang.name}</span>
                    <span className="text-slate-400 text-[10px]">{lang.proficiency}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* References */}
          {cvData.references && cvData.references.length > 0 && (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">References</h2>
              <div className="space-y-2">
                {cvData.references.slice(0, 2).map((ref, i) => (
                  <div key={i} className="text-[10px]">
                    <p className="font-bold text-white">{ref.name}</p>
                    <p className="text-slate-400">{ref.title}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="col-span-8 p-6 flex flex-col gap-4">

          {/* Experience */}
          <section>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] mb-3 flex items-center gap-3" style={{ color: accent }}>
              <span>The Experience</span>
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
              <div className="flex-1 h-px bg-slate-200" />
            </h2>
            <div className="space-y-4">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group">
                  {isEditing && (
                    <button onClick={() => handleDeleteExperience(index)}
                      className="absolute -left-10 top-0 p-2 bg-pink-500 text-white rounded-xl shadow-lg hover:rotate-12 transition-transform">
                      <Trash className="h-3 w-3" />
                    </button>
                  )}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-3">
                      <span className="text-[10px] font-black uppercase text-[#C9A84C] tracking-widest block mb-0.5" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                      <h3 className="text-xs font-black text-slate-900 border-l-4 pl-2 py-1 bg-slate-50 leading-tight" style={{ borderColor: accent }} {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                    </div>
                    <div className="col-span-9">
                      <h4 className="text-sm font-black tracking-tighter text-slate-900 mb-1 italic underline decoration-orange-400 decoration-2" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h4>
                      <ul className="space-y-0.5">
                        {smartBullets(job.responsibilities, cvData.experience.length).map((resp, i) => (
                          <li key={i} className="text-xs text-slate-600 leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          {cvData.projects && cvData.projects.length > 0 && (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] mb-3 flex items-center gap-3" style={{ color: accent }}>
                <span>Selected Work</span>
                <div className="flex-1 h-px bg-slate-200" />
              </h2>
              <div className="space-y-2">
                {cvData.projects.map((proj, i) => (
                  <div key={i} className="border-l-4 pl-3" style={{ borderColor: accent + '40' }}>
                    <p className="text-xs font-black text-slate-900">{proj.name}</p>
                    <p className="text-[10px] text-slate-500 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <TemplateCustomSections
            customSections={cvData.customSections} references={undefined}
            renderHeader={title => (
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] mb-3 flex items-center gap-3" style={{ color: accent }}>
                <span>{title}</span><div className="flex-1 h-px bg-slate-200" />
              </h2>
            )}
            sectionClassName="mb-4" titleClass="font-semibold text-xs"
            subtitleClass="text-[10px] text-slate-500" descClass="text-[10px] text-slate-600 mt-0.5" yearClass="text-[10px] text-slate-400"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-orange-400 p-4 text-center">
        <p className="text-sm font-black uppercase tracking-tighter text-white">Let's Create Something Epic.</p>
      </footer>

      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplateSydneyCreative;
