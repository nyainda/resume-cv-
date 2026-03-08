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

const TemplateParisVibe: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-1 ring-transparent focus:ring-rose-200 focus:bg-rose-50/50 rounded"
    } : {};

    return (
        <div id="cv-preview-paris-vibe" className="bg-[#fafafa] p-16 text-zinc-800 shadow-xl border border-zinc-100 font-serif leading-relaxed" style={{ fontFamily: "'Playfair Display', 'Times New Roman', serif" }}>
            <header className="mb-20">
                <div className="flex justify-between items-end border-b border-zinc-200 pb-12">
                    <div>
                        <h1 className="text-6xl font-black tracking-tighter text-zinc-900 leading-none">
                            {personalInfo.name.split(' ')[0]}<br />
                            <span className="text-zinc-300 italic font-light">{personalInfo.name.split(' ').slice(1).join(' ')}</span>
                        </h1>
                    </div>
                    <div className="text-right text-xs uppercase tracking-widest text-zinc-400 space-y-1">
                        <p>{personalInfo.location}</p>
                        <p className="text-rose-400 font-bold">{personalInfo.email}</p>
                        <p>{personalInfo.phone}</p>
                    </div>
                </div>
            </header>

            <main className="grid grid-cols-12 gap-16">
                <aside className="col-span-4 space-y-12">
                    <section>
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rose-400 mb-6 flex items-center gap-2">
                            <span>01</span>
                            <span className="h-px bg-rose-100 flex-1"></span>
                            <span>Expertise</span>
                        </h2>
                        <ul className="space-y-4 text-sm tracking-tight text-zinc-600">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <li key={i} className="hover:text-zinc-900 transition-colors border-b border-zinc-100 pb-2 flex justify-between items-center group">
                                    <span>{skill}</span>
                                    <span className="opacity-0 group-hover:opacity-100 text-[8px] text-rose-300">✦</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {cvData.education.length > 0 && (
                        <section>
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-300 mb-6 flex items-center gap-2">
                                <span>02</span>
                                <span className="h-px bg-zinc-100 flex-1"></span>
                                <span>Formation</span>
                            </h2>
                            <div className="space-y-6">
                                {cvData.education.map((edu, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <h3 className="text-sm font-bold border-l-2 border-rose-200 pl-4" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                                        <p className="text-[10px] uppercase tracking-widest text-zinc-400 pl-4">{edu.school} / {edu.year}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </aside>

                <div className="col-span-8 space-y-20">
                    <section>
                        <div className="flex gap-8 items-start">
                            <span className="text-4xl text-rose-100 font-black leading-none italic select-none">“</span>
                            <p className="text-xl font-light italic leading-relaxed text-zinc-500 first-letter:text-5xl first-letter:font-black first-letter:text-rose-400 first-letter:mr-3 first-letter:float-left" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                        </div>
                    </section>

                    <section>
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-900 mb-10 border-b border-zinc-900 pb-2 inline-block">Professional Path</h2>
                        <div className="space-y-16">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-12 top-0 p-2 text-rose-300 hover:text-rose-600 transition-colors"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="mb-4">
                                        <div className="flex justify-between items-end mb-1">
                                            <h3 className="text-2xl font-bold tracking-tight text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                            <span className="text-[10px] uppercase font-bold text-rose-300 tracking-[0.2em]" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                        </div>
                                        <p className="text-sm italic font-light text-zinc-400 tracking-wider" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                    </div>
                                    <ul className="space-y-3 text-base text-zinc-600 font-light border-l border-zinc-100 pl-8">
                                        {job.responsibilities.map((resp, i) => (
                                            <li key={i} className="relative before:content-[''] before:absolute before:-left-8 before:top-3 before:w-4 before:h-px before:bg-rose-200" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-[#fafafa] whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateParisVibe;
