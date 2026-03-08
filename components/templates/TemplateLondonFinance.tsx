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

const TemplateLondonFinance: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-1 ring-transparent focus:ring-slate-300 focus:bg-slate-50 rounded px-1 -mx-1"
    } : {};

    const SectionHeader = ({ title }: { title: string }) => (
        <div className="border-b border-slate-900 mb-3 mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-900">{title}</h2>
        </div>
    );

    return (
        <div id="cv-preview-london-finance" className="bg-white p-12 sm:p-16 text-[#1c1c1c] shadow-xl border border-zinc-200 font-serif leading-tight" style={{ fontFamily: "'Times New Roman', serif" }}>
            <header className="text-center mb-8 border-b-2 border-slate-900 pb-8">
                <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase">{personalInfo.name}</h1>
                <div className="flex justify-center gap-x-3 text-[11px] font-medium uppercase tracking-wider text-slate-600">
                    <span>{personalInfo.location}</span>
                    <span>•</span>
                    <span>{personalInfo.phone}</span>
                    <span>•</span>
                    <span className="text-slate-900">{personalInfo.email}</span>
                    {personalInfo.linkedin && (
                        <>
                            <span>•</span>
                            <span className="text-slate-900 font-bold">LINKEDIN</span>
                        </>
                    )}
                </div>
            </header>

            <main>
                <section>
                    <SectionHeader title="Professional Profile" />
                    <p className="text-xs leading-relaxed text-justify italic" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>

                <section>
                    <SectionHeader title="Professional Experience" />
                    <div className="space-y-6">
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -left-10 top-0 p-1.5 text-slate-300 hover:text-red-600 transition-colors"
                                    >
                                        <Trash className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="flex justify-between items-baseline font-bold uppercase text-[12px]">
                                    <h3 {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                                    <span {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                </div>
                                <div className="flex justify-between items-baseline italic text-[11px] mb-2">
                                    <h4 {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h4>
                                    <span className="text-[10px] font-normal not-italic">{personalInfo.location}</span>
                                </div>
                                <ul className="list-disc list-outside ml-6 space-y-1 text-[11px] text-justify">
                                    {job.responsibilities.map((resp, i) => (
                                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <SectionHeader title="Education" />
                    <div className="space-y-4">
                        {cvData.education.map((edu, index) => (
                            <div key={index} className="relative">
                                <div className="flex justify-between items-baseline font-bold uppercase text-[12px]">
                                    <h3 {...editableProps(['education', index, 'school'])}>{edu.school}</h3>
                                    <span {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                                </div>
                                <p className="text-[11px] italic" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                                {edu.description && <p className="text-[10px] mt-1 text-slate-600" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />}
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <SectionHeader title="Additional Information" />
                    <div className="grid grid-cols-1 gap-2 text-[11px]">
                        <div className="flex gap-4">
                            <span className="font-bold uppercase min-w-[120px]">Technical Skills:</span>
                            <span className="flex-1">{cvData.skills.slice(0, 15).join(', ')}</span>
                        </div>
                        {cvData.languages && cvData.languages.length > 0 && (
                            <div className="flex gap-4">
                                <span className="font-bold uppercase min-w-[120px]">Languages:</span>
                                <span className="flex-1">{cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ')}</span>
                            </div>
                        )}
                        {cvData.projects && cvData.projects.length > 0 && (
                            <div className="flex gap-4">
                                <span className="font-bold uppercase min-w-[120px]">Projects:</span>
                                <span className="flex-1">{cvData.projects.map(p => p.name).join('; ')}</span>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
    );
};

export default TemplateLondonFinance;
