import React, { useCallback } from 'react';
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

const TemplateSiliconValley: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
    const accent = cvData.accentColor ?? '#2563eb';

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
        className: "outline-none ring-2 ring-blue-500/20 bg-blue-50/50 rounded"
    } : {};

    return (
        <div id="cv-preview-silicon-valley" className="bg-[#fcfcfc] p-12 text-slate-900 shadow-xl border border-slate-200 font-sans leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            <header className="mb-12 flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-[#1B2B4B] mb-6 shadow-xl flex items-center justify-center border-4 border-white">
                    <span className="text-4xl font-bold text-white uppercase">{personalInfo.name.charAt(0)}</span>
                </div>
                <h1 className="text-5xl font-black tracking-tighter text-slate-900 mb-2">{personalInfo.name}</h1>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
                    <span>{personalInfo.email}</span>
                    <span className="text-slate-300">•</span>
                    <span>{personalInfo.phone}</span>
                    <span className="text-slate-300">•</span>
                    <span>{personalInfo.location}</span>
                    {personalInfo.linkedin && (
                        <>
                            <span className="text-slate-300">•</span>
                            <span style={{ color: accent }}>LinkedIn</span>
                        </>
                    )}
                </div>
            </header>

            <main className="max-w-4xl mx-auto space-y-12">
                <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] mb-4 px-3 py-1 rounded-full inline-block" style={{ color: accent, backgroundColor: accent + '15' }}>Vision</h2>
                    <p className="text-xl font-medium leading-tight tracking-tight text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>

                <section className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 pl-2">Career Velocity</h2>
                    <div className="space-y-4">
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -right-4 -top-4 p-2 bg-slate-900 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                    >
                                        <Trash className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-2xl font-black tracking-tight text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                        <p className="text-lg font-bold italic" style={{ color: accent }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                    </div>
                                    <span className="text-sm font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                </div>
                                <ul className="space-y-4">
                                    {job.responsibilities.map((resp, i) => (
                                        <li key={i} className="flex gap-4 items-start text-base text-slate-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                            <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 mb-8">Technical Stack</h2>
                        <div className="flex flex-wrap gap-2">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <span key={i} className="px-3 py-1.5 bg-slate-800 text-blue-200 text-xs font-bold rounded-xl border border-slate-700">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-8">Base of Operations</h2>
                        <div className="space-y-6">
                            {cvData.education.map((edu, idx) => (
                                <div key={idx} className="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-blue-100">
                                    <h3 className="text-lg font-black text-slate-900" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                                    <p className="text-sm font-bold italic uppercase tracking-wider" style={{ color: accent }}>{edu.school}</p>
                                    <p className="text-xs font-black text-slate-400 mt-1">{edu.year}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <footer className="mt-20 text-center">
                <p className="text-xs font-black uppercase tracking-[1em] text-slate-200">Innovation / Scale / Impact</p>
            
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-xs font-black uppercase tracking-[0.2em] mb-4 px-3 py-1 rounded-full inline-block" style={{ color: accent, backgroundColor: accent + '15' }}>{title}</h2>}
          sectionClassName="mb-8"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-slate-400"
          descClass="text-xs text-slate-500 mt-0.5"
          yearClass="text-xs text-slate-400"
        />
</footer>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-[#fcfcfc] whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateSiliconValley;
