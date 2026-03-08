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

const TemplateHarvardGold: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-1 ring-transparent focus:ring-amber-400 focus:bg-amber-50 rounded px-1 -mx-1 transition-all"
    } : {};

    const SectionHeader = ({ title }: { title: string }) => (
        <div className="mb-4 mt-6 border-b-2 border-amber-600/20 pb-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-800">{title}</h2>
        </div>
    );

    return (
        <div id="cv-preview-harvard-gold" className="bg-white p-12 sm:p-16 text-slate-800 shadow-lg border font-serif leading-relaxed" style={{ fontFamily: "'Crimson Text', 'Georgia', serif" }}>
            <header className="text-center mb-10">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 uppercase mb-3 decoration-amber-600/30 underline underline-offset-8">
                    {personalInfo.name}
                </h1>
                <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    {personalInfo.location && <span>{personalInfo.location}</span>}
                    {personalInfo.phone && <><span className="text-amber-600/40">|</span><span>{personalInfo.phone}</span></>}
                    {personalInfo.email && <><span className="text-amber-600/40">|</span><span>{personalInfo.email}</span></>}
                    {personalInfo.linkedin && <><span className="text-amber-600/40">|</span><span className="text-amber-800">LinkedIn</span></>}
                </div>
            </header>

            <main>
                <section>
                    <SectionHeader title="Professional Summary" />
                    <p className="text-base text-justify" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>

                <section>
                    <SectionHeader title="Experience" />
                    <div className="space-y-6">
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -left-10 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                                        title="Delete experience"
                                    >
                                        <Trash className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="flex justify-between items-baseline">
                                    <h3 className="text-lg font-bold text-slate-900 leading-tight" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                    <span className="text-sm font-medium text-amber-800/80 whitespace-nowrap ml-4" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                </div>
                                <p className="text-base font-semibold text-slate-700 italic mb-2" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                <ul className="list-disc list-outside ml-5 space-y-1.5 text-slate-700">
                                    {job.responsibilities.map((resp, i) => (
                                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 mt-4">
                    <section>
                        <SectionHeader title="Education" />
                        <div className="space-y-4">
                            {cvData.education.map((edu, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="text-base font-bold text-slate-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                                        <span className="text-sm font-medium text-amber-800/80" {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 italic" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <SectionHeader title="Key Competencies" />
                        {(() => {
                            const sk = cvData.skills.slice(0, 15);
                            const perCol = Math.ceil(sk.length / 2);
                            return (
                                <div className="grid grid-cols-2 gap-x-4">
                                    {[0, 1].map(ci => (
                                        <ul key={ci} className="list-disc list-outside ml-4 space-y-1">
                                            {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                                                <li key={si} className="text-sm text-slate-700">{s}</li>
                                            ))}
                                        </ul>
                                    ))}
                                </div>
                            );
                        })()}
                    </section>
                </div>

                {cvData.projects && cvData.projects.length > 0 && (
                    <section>
                        <SectionHeader title="Recent Projects" />
                        <div className="space-y-4">
                            {cvData.projects.map((proj, index) => (
                                <div key={index}>
                                    <h3 className="text-base font-bold text-slate-900 leading-tight" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                                    <p className="text-sm text-slate-700 mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateHarvardGold;
