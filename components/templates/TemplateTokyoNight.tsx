import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { Trash } from '../icons';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

const TemplateTokyoNight: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-1 ring-transparent focus:ring-fuchsia-500 focus:bg-fuchsia-500/10 rounded px-1 -mx-1"
    } : {};

    const SectionHeader = ({ title }: { title: string }) => (
        <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">{title}</h2>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-cyan-400/20 to-transparent"></div>
        </div>
    );

    return (
        <div id="cv-preview-tokyo-night" className="bg-[#1a1b26] p-12 text-slate-300 shadow-2xl border border-slate-800 font-mono" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <header className="mb-12 border-l-4 border-fuchsia-500 pl-6">
                <h1 className="text-5xl font-black tracking-tighter text-white mb-2 uppercase italic">
                    {personalInfo.name}
                </h1>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-cyan-400/80">
                    <span>{personalInfo.email}</span>
                    <span>{personalInfo.phone}</span>
                    <span>{personalInfo.location}</span>
                    {personalInfo.github && <span className="text-white">github.com/{personalInfo.github.split('/').pop()}</span>}
                </div>
            </header>

            <main className="grid grid-cols-12 gap-12">
                <div className="col-span-8 space-y-12">
                    <section>
                        <SectionHeader title="System Summary" />
                        <p className="text-base leading-relaxed text-slate-400 border-l border-slate-700 pl-4 py-1" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                    </section>

                    <section>
                        <SectionHeader title="Deployment History" />
                        <div className="space-y-10">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group pl-4 border-l border-fuchsia-500/30 hover:border-fuchsia-500 transition-colors">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-12 top-0 p-2 text-red-500 hover:bg-red-900/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-900/50 bg-slate-900 shadow-lg"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className="text-xl font-bold text-white uppercase italic" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                        <span className="text-xs font-black text-cyan-400" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                    </div>
                                    <p className="text-sm font-bold text-fuchsia-400 mb-4" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                    <ul className="space-y-2 text-sm text-slate-400">
                                        {job.responsibilities.map((resp, i) => (
                                            <li key={i} className="flex gap-2">
                                                <span className="text-fuchsia-500 drop-shadow-[0_0_5px_rgba(217,70,239,0.5)]">{'>'}</span>
                                                <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="col-span-4 space-y-12">
                    <section>
                        <SectionHeader title="Stack" />
                        <div className="flex flex-wrap gap-2">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <span key={i} className="text-[10px] font-black uppercase px-2 py-1 bg-slate-800 text-slate-400 border border-slate-700 hover:border-cyan-400/50 hover:text-white transition-all">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </section>

                    <section>
                        <SectionHeader title="Base Info" />
                        <div className="space-y-6">
                            {cvData.education.map((edu, index) => (
                                <div key={index} className="border-l border-slate-800 pl-4 py-1">
                                    <h3 className="text-xs font-black text-white uppercase" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                                    <p className="text-[10px] text-fuchsia-400 font-bold" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                                    <p className="text-[10px] text-slate-500 mt-1" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {cvData.languages && cvData.languages.length > 0 && (
                        <section>
                            <SectionHeader title="Kernel" />
                            <div className="space-y-2">
                                {cvData.languages.map((lang, i) => (
                                    <div key={i} className="flex justify-between items-center text-[10px]">
                                        <span className="text-white font-bold">{lang.name}</span>
                                        <span className="text-cyan-400">{lang.proficiency}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </main>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-[#1a1b26] whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateTokyoNight;
