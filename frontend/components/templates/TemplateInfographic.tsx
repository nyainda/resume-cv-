import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo } from '../../types';
import { Mail, Phone, MapPin, Linkedin, Github } from 'lucide-react';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const proficiencyToWidth = (proficiency: string): string => {
  const p = proficiency.toLowerCase();
  if (p.includes('native') || p.includes('fluent')) return '100%';
  if (p.includes('proficient') || p.includes('advanced')) return '85%';
  if (p.includes('intermediate') || p.includes('conversational')) return '60%';
  return '40%';
};

const TemplateInfographic: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#1e40af';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true, suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>{title}</h2>
      {children}
    </section>
  );

  const MainSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-infographic" className="bg-white shadow-lg border font-['Inter'] flex flex-col min-h-[280mm]">
      <div className="grid grid-cols-12 flex-1">

        {/* ── Sidebar ── */}
        <div className="col-span-4 bg-slate-100 p-5 flex flex-col gap-4">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full mb-2 flex items-center justify-center border-4 border-white shadow-md" style={{ backgroundColor: accent + '4d' }}>
              <span className="text-3xl font-bold" style={{ color: accent }}>{personalInfo.name.charAt(0)}</span>
            </div>
            <h1 className="text-base font-bold tracking-tighter text-slate-800 leading-tight">{personalInfo.name}</h1>
          </div>

          <SidebarSection title="Contact">
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-center gap-1.5"><Mail size={11} style={{ color: accent }} />{personalInfo.email}</li>
              <li className="flex items-center gap-1.5"><Phone size={11} style={{ color: accent }} />{personalInfo.phone}</li>
              <li className="flex items-center gap-1.5"><MapPin size={11} style={{ color: accent }} />{personalInfo.location}</li>
              {personalInfo.linkedin && <li className="flex items-center gap-1.5"><Linkedin size={11} style={{ color: accent }} /><a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>}
              {personalInfo.github && <li className="flex items-center gap-1.5"><Github size={11} style={{ color: accent }} /><a href={personalInfo.github} className="underline">GitHub</a></li>}
            </ul>
          </SidebarSection>

          {/* Summary */}
          {cvData.summary && (
            <SidebarSection title="Profile">
              <p className="text-xs text-slate-600 leading-relaxed bg-white/70 p-2 border-l-2" style={{ borderColor: accent }} dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </SidebarSection>
          )}

          {/* Skills */}
          <SidebarSection title="Skills">
            <div className="space-y-1.5">
              {cvData.skills.slice(0, 8).map((skill, i) => (
                <div key={i} className="text-xs">
                  <p className="font-medium mb-0.5">{skill}</p>
                  <div className="w-full bg-slate-300 rounded-full h-1">
                    <div className="h-1 rounded-full" style={{ width: `${95 - i * 7}%`, backgroundColor: accent }}></div>
                  </div>
                </div>
              ))}
            </div>
          </SidebarSection>

          {/* Education */}
          {cvData.education && cvData.education.length > 0 && (
            <SidebarSection title="Education">
              <div className="space-y-2">
                {cvData.education.map((edu, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-bold text-slate-800 leading-tight">{edu.degree}</p>
                    <p className="font-medium" style={{ color: accent }}>{edu.school}</p>
                    <p className="text-slate-500 text-[10px]">{edu.year}</p>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <SidebarSection title="Languages">
              <div className="space-y-1.5">
                {cvData.languages.map((lang, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-medium mb-0.5">{lang.name}</p>
                    <div className="w-full bg-slate-300 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: proficiencyToWidth(lang.proficiency), backgroundColor: accent }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="col-span-8 p-6 text-slate-800 flex flex-col">
          <main className="flex-1 space-y-4">

            <MainSection title="Experience">
              <div className="space-y-4">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-sm font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-xs font-medium text-slate-500 shrink-0 ml-2" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-xs font-medium mb-1" style={{ color: accent }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 space-y-0.5 text-xs">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </MainSection>

            {/* Projects */}
            {cvData.projects && cvData.projects.length > 0 && (
              <MainSection title="Projects">
                <div className="space-y-2">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold">{proj.name}</h3>
                      <p className="text-xs text-slate-600 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} />
                      {proj.link && <a href={proj.link} className="text-[10px] underline" style={{ color: accent }}>{proj.link}</a>}
                    </div>
                  ))}
                </div>
              </MainSection>
            )}

            <TemplateCustomSections
              customSections={cvData.customSections} references={cvData.references}
              renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>{title}</h2>}
              sectionClassName="mb-4" titleClass="font-semibold text-xs"
              subtitleClass="text-[10px] text-blue-600" descClass="text-[10px] text-slate-600 mt-0.5" yearClass="text-[10px] text-slate-400"
            />
          </main>
        </div>
      </div>
      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplateInfographic;
