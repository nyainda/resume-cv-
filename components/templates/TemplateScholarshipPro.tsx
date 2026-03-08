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

const TemplateScholarshipPro: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-1 ring-teal-400 bg-teal-50 rounded px-1 -mx-1"
    } : {};

    const SectionHeading = ({ children }: { children: React.ReactNode }) => (
        <div className="flex items-center gap-4 mb-4 mt-10 first:mt-0">
            <h2 className="text-base font-bold uppercase tracking-widest text-teal-800 shrink-0">{children}</h2>
            <div className="h-0.5 bg-gradient-to-r from-teal-100 to-transparent flex-1" />
        </div>
    );

    return (
        <div id="cv-preview-scholarship-pro" className="bg-white p-12 sm:p-20 text-slate-800 shadow-xl border border-slate-100 font-sans leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            <header className="grid grid-cols-12 gap-8 mb-16 items-center">
                <div className="col-span-8">
                    <h1 className="text-5xl font-black text-slate-900 tracking-tight leading-none mb-4 uppercase">
                        {personalInfo.name}
                    </h1>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold text-teal-600 uppercase tracking-widest">
                        <span>{personalInfo.email}</span>
                        <span>{personalInfo.phone}</span>
                        <span>{personalInfo.location}</span>
                    </div>
                </div>
                <div className="col-span-4 flex justify-end">
                    <div className="px-6 py-4 bg-teal-900 text-teal-100 rounded-2xl shadow-lg rotate-2 text-right">
                        <span className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1 opacity-50">Academic ID</span>
                        <span className="block font-mono text-sm uppercase">STU-{personalInfo.name.substring(0, 3).toUpperCase()}-2024</span>
                    </div>
                </div>
            </header>

            <main className="grid grid-cols-12 gap-12">
                <div className="col-span-12">
                    <section className="bg-teal-50/50 p-8 rounded-3xl border border-teal-100/50 mb-12">
                        <div className="flex gap-4 items-start">
                            <span className="text-4xl">🎓</span>
                            <div>
                                <h2 className="text-xs font-black uppercase tracking-widest text-teal-800 mb-2">Research Intent / Profile</h2>
                                <p className="text-lg font-medium tracking-tight text-slate-700 italic" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="col-span-8 space-y-12">
                    <section>
                        <SectionHeading>Academic Formation</SectionHeading>
                        <div className="space-y-6">
                            {cvData.education.map((edu, idx) => (
                                <div key={idx} className="relative pl-8 before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-teal-500 before:rounded-full after:absolute after:left-[2px] after:top-6 after:bottom-0 after:w-[2px] after:bg-teal-100 last:after:hidden">
                                    <h3 className="text-xl font-black text-slate-900" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                                    <div className="flex justify-between items-baseline text-sm font-bold text-teal-600 uppercase tracking-widest mt-1">
                                        <span {...editableProps(['education', idx, 'school'])}>{edu.school}</span>
                                        <span {...editableProps(['education', idx, 'year'])}>{edu.year}</span>
                                    </div>
                                    {edu.description && <p className="text-sm mt-3 text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', idx, 'description'])} />}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <SectionHeading>Relevant Experience</SectionHeading>
                        <div className="space-y-10">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-12 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="mb-4">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="text-xl font-black text-slate-900 uppercase italic" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                            <span className="text-xs font-black text-teal-600 bg-teal-50 px-2 py-1 rounded-md" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-500 tracking-widest uppercase" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                    </div>
                                    <ul className="space-y-3">
                                        {job.responsibilities.map((resp, i) => (
                                            <li key={i} className="flex gap-4 text-base text-slate-700">
                                                <span className="text-teal-400 mt-1.5 select-none">✦</span>
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
                        <SectionHeading>Technical Arsenal</SectionHeading>
                        <div className="grid grid-cols-1 gap-4">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <div key={i} className="flex items-center justify-between group cursor-default">
                                    <span className="text-sm font-bold text-slate-700 group-hover:text-teal-600 transition-colors uppercase tracking-tight">{skill}</span>
                                    <div className="h-[2px] w-8 bg-teal-100 group-hover:w-12 group-hover:bg-teal-500 transition-all" />
                                </div>
                            ))}
                        </div>
                    </section>

                    {cvData.publications && cvData.publications.length > 0 && (
                        <section>
                            <SectionHeading>Select Papers</SectionHeading>
                            <div className="space-y-6">
                                {cvData.publications.map((pub, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <h3 className="text-sm font-black text-slate-900 uppercase italic line-clamp-2" title={pub.title} {...editableProps(['publications', idx, 'title'])}>{pub.title}</h3>
                                        <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">{pub.journal} / {pub.year}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {cvData.languages && cvData.languages.length > 0 && (
                        <section>
                            <SectionHeading>Linguistic Range</SectionHeading>
                            <div className="space-y-4">
                                {cvData.languages.map((lang, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-800 uppercase">{lang.name}</span>
                                        <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest px-2 py-0.5 bg-teal-50 rounded-full">{lang.proficiency}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </main>

            <footer className="mt-20 pt-12 border-t border-slate-100 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
                <span>Scholarship Ready CV</span>
                <span>Verification Hash: {personalInfo.name.substring(0, 3).toUpperCase()}-{(Math.random() * 1000).toFixed(0)}</span>
            </footer>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateScholarshipPro;
