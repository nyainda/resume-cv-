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

const TemplateMedicalStandard: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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

    const accent = cvData.accentColor ?? '#0284c7';

    const editableProps = (path: (string | number)[]) => isEditing ? {
        contentEditable: true,
        suppressContentEditableWarning: true,
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
            handleUpdate(path, e.currentTarget.innerHTML);
        },
        className: "outline-none ring-1 ring-sky-300 bg-sky-50 rounded px-1 -mx-1"
    } : {};

    const SectionHeading = ({ children }: { children: React.ReactNode }) => (
        <div className="flex items-center gap-3 mb-6 mt-12 first:mt-0">
            <div className="flex items-center justify-center w-8 h-8 rounded text-white font-black text-xl" style={{ backgroundColor: accent }}>+</div>
            <h2 className="text-lg font-black uppercase tracking-widest text-slate-800">{children}</h2>
            <div className="flex-1 h-[1px] bg-slate-200" />
        </div>
    );

    return (
        <div id="cv-preview-medical-standard" className="bg-[#f0f4f8] p-12 sm:p-20 text-slate-800 shadow-xl font-sans leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", borderTop: `12px solid ${accent}` }}>
            <header className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center mb-12">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2 uppercase">
                        {personalInfo.name}
                        <span className="ml-2" style={{ color: accent }}>, MD/RN</span>
                    </h1>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold text-slate-400 uppercase tracking-widest">
                        <span>{personalInfo.email}</span>
                        <span>{personalInfo.phone}</span>
                        <span>{personalInfo.location}</span>
                    </div>
                </div>
                <div className="hidden lg:block">
                    <div className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center" style={{ borderColor: accent + '33', backgroundColor: accent + '0d' }}>
                        <span className="text-2xl" style={{ color: accent + 'aa' }}>✚</span>
                    </div>
                </div>
            </header>

            <main className="grid grid-cols-12 gap-12">
                <div className="col-span-12 lg:col-span-8">
                    <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm mb-12">
                        <h2 className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: accent }}>Clinical Summary</h2>
                        <p className="text-base leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                    </section>

                    <section>
                        <SectionHeading>Clinical Experience</SectionHeading>
                        <div className="space-y-8">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -right-4 -top-4 p-2 bg-red-500 text-white rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 uppercase italic leading-none" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                            <p className="text-sm font-bold uppercase tracking-wider mt-2" style={{ color: accent }}>{job.company}</p>
                                        </div>
                                        <span className="text-xs font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full whitespace-nowrap" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                    </div>
                                    <ul className="grid grid-cols-1 gap-4">
                                        {job.responsibilities.map((resp, i) => (
                                            <li key={i} className="flex gap-4 items-start text-sm text-slate-600">
                                                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: accent + '66' }} />
                                                <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="col-span-12 lg:col-span-4 space-y-12">
                    <section className="text-white p-8 rounded-3xl shadow-xl" style={{ backgroundColor: accent }}>
                        <h2 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            <span>Clinical Skills</span>
                            <div className="h-px flex-1 opacity-30" style={{ backgroundColor: 'white' }} />
                        </h2>
                        <div className="space-y-3">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <div key={i} className="flex items-center gap-3 group">
                                    <span className="text-xs font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>+</span>
                                    <span className="text-sm font-bold tracking-tight group-hover:translate-x-1 transition-transform">{skill}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Medical Education</h2>
                        <div className="space-y-8">
                            {cvData.education.map((edu, idx) => (
                                <div key={idx} className="relative pl-6" style={{ borderLeft: `2px solid ${accent}33` }}>
                                    <h3 className="text-base font-black text-slate-800" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                                    <p className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: accent }}>{edu.school}</p>
                                    <p className="text-[10px] font-black text-slate-300 uppercase mt-2">{edu.year}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {cvData.languages && cvData.languages.length > 0 && (
                        <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Patient Communication</h2>
                            <div className="space-y-4">
                                {cvData.languages.map((lang, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm">
                                        <span className="font-bold text-slate-700">{lang.name}</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: accent, backgroundColor: accent + '1a' }}>{lang.proficiency}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </aside>
            </main>

            <footer className="mt-20 pt-12 border-t border-slate-200 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Confidential Medical Professional Document</p>
            
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <SectionHeading>{title}</SectionHeading>}
          sectionClassName="mb-8"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-slate-500"
          descClass="text-xs text-slate-600 mt-0.5"
          yearClass="text-xs text-slate-400"
        />
</footer>

            {jobDescriptionForATS && (
                <HiddenATSKeywords text={jobDescriptionForATS} />
            )}
        </div>
    );
};

export default TemplateMedicalStandard;
