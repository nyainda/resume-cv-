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
}

const TemplateInfographic: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#1e40af';

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

  const SidebarSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>{title}</h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-infographic" className="bg-white shadow-lg border font-['Inter'] flex flex-col min-h-[280mm]">
      <div className="grid grid-cols-12 flex-1">
        {/* Sidebar */}
        <div className="col-span-4 bg-slate-100 p-5 flex flex-col gap-4">
            <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full mb-2 flex items-center justify-center border-4 border-white shadow-md" style={{ backgroundColor: accent + '4d' }}>
                    <span className="text-4xl font-bold" style={{ color: accent }}>{personalInfo.name.charAt(0)}</span>
                </div>
                <h1 className="text-lg font-bold tracking-tighter text-slate-800 leading-tight">{personalInfo.name}</h1>
            </div>

            <SidebarSection title="Contact">
                <ul className="space-y-1.5 text-xs text-slate-700">
                    <li className="flex items-center gap-2"><Mail size={12} style={{ color: accent }} /> {personalInfo.email}</li>
                    <li className="flex items-center gap-2"><Phone size={12} style={{ color: accent }} /> {personalInfo.phone}</li>
                    <li className="flex items-center gap-2"><MapPin size={12} style={{ color: accent }} /> {personalInfo.location}</li>
                    {personalInfo.linkedin && <li className="flex items-center gap-2"><Linkedin size={12} style={{ color: accent }} /> <a href={personalInfo.linkedin} className="underline truncate">LinkedIn</a></li>}
                    {personalInfo.github && <li className="flex items-center gap-2"><Github size={12} style={{ color: accent }} /> <a href={personalInfo.github} className="underline truncate">GitHub</a></li>}
                </ul>
            </SidebarSection>

            <SidebarSection title="Skills">
                <div className="space-y-2">
                    {cvData.skills.slice(0, 8).map((skill, i) => (
                        <div key={i} className="text-xs">
                            <p className="font-medium mb-0.5">{skill}</p>
                            <div className="w-full bg-slate-300 rounded-full h-1">
                                <div className="h-1 rounded-full" style={{ width: `${95 - i*7}%`, backgroundColor: accent }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </SidebarSection>

            {cvData.languages && cvData.languages.length > 0 && (
                <SidebarSection title="Languages">
                    <div className="space-y-2">
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

            {cvData.education && cvData.education.length > 0 && (
                <SidebarSection title="Education">
                    <div className="space-y-2">
                        {cvData.education.slice(0, 2).map((edu, i) => (
                            <div key={i} className="text-xs">
                                <p className="font-bold text-slate-800 leading-tight">{edu.degree}</p>
                                <p className="font-medium" style={{ color: accent }}>{edu.school}</p>
                                <p className="text-slate-500 text-[10px]">{edu.year}</p>
                            </div>
                        ))}
                    </div>
                </SidebarSection>
            )}

            {cvData.projects && cvData.projects.length > 0 && (
                <SidebarSection title="Projects">
                    <div className="space-y-2">
                        {cvData.projects.slice(0, 3).map((proj, i) => (
                            <div key={i} className="text-xs">
                                <p className="font-bold text-slate-800 leading-tight">{proj.name}</p>
                                <p className="text-slate-500 text-[10px] line-clamp-2 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} />
                            </div>
                        ))}
                    </div>
                </SidebarSection>
            )}
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-6 text-slate-800 flex flex-col">
            <main className="flex-1 space-y-4">
                <section>
                    <p className="text-xs leading-relaxed bg-blue-50 border-l-4 border-blue-500 p-3" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>

                <section>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>Experience</h2>
                    <div className="space-y-4">
                        {cvData.experience.map((job, index) => (
                        <div key={index}>
                            <div className="flex justify-between items-baseline">
                                <h3 className="text-sm font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                <p className="text-xs font-medium text-slate-500 shrink-0 ml-2" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                            </div>
                            <p className="text-xs font-medium text-slate-600 mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                            <ul className="list-disc list-outside ml-4 space-y-0.5 text-xs">
                            {job.responsibilities.slice(0, 4).map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                            </ul>
                        </div>
                        ))}
                    </div>
                </section>

                <TemplateCustomSections
                  customSections={cvData.customSections}
                  references={cvData.references}
                  renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 pb-1 border-b" style={{ color: accent, borderColor: accent + '30' }}>{title}</h2>}
                  sectionClassName="mb-4"
                  titleClass="font-semibold text-xs"
                  subtitleClass="text-[10px] text-blue-600"
                  descClass="text-[10px] text-slate-600 mt-0.5"
                  yearClass="text-[10px] text-slate-400"
                />
            </main>
        </div>
      </div>
      {jobDescriptionForATS && (
          <HiddenATSKeywords text={jobDescriptionForATS} />
        )}
    </div>
  );
};

export default TemplateInfographic;
