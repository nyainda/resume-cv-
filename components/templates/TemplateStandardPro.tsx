
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

const TemplateStandardPro: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

    const handleUpdate = useCallback((path: (string | number)[], value: any) => {
        const newCvData = JSON.parse(JSON.stringify(cvData));
        let current: any = newCvData;
        for (let i = 0; i < path.length - 1; i++) {
            if (!current[path[i]]) current[path[i]] = {};
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
            handleUpdate(path, e.currentTarget.innerText);
        },
        className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
    } : {};

    return (
        <div id="cv-preview-standard-pro" className="bg-white p-10 sm:p-14 text-zinc-900 shadow-lg border font-serif max-w-[210mm] mx-auto min-h-[297mm]">
            {/* Header */}
            <header className="text-center mb-6">
                <h1 className="text-3xl font-bold uppercase tracking-wide text-zinc-900 mb-2" {...editableProps(['personalInfo', 'name'])}>{personalInfo.name}</h1>
                <div className="text-xs text-zinc-600 space-y-0.5">
                    <p>{personalInfo.location}</p>
                    <p>{personalInfo.phone}</p>
                    <p className="text-blue-600 underline">{personalInfo.email}</p>
                </div>
            </header>

            {/* Header Line */}
            <div className="border-b-[1.5pt] border-zinc-800 mb-6"></div>

            <main className="space-y-6">
                {/* Summary */}
                <section>
                    <p className="text-[10pt] leading-snug italic text-center px-4" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>

                {/* Experience */}
                <section>
                    <h2 className="text-[11pt] font-bold uppercase tracking-wider text-zinc-900 border-b-[1pt] border-zinc-800 mb-3">Work Experience</h2>
                    <div className="space-y-5">
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -left-10 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash className="h-4 w-4" />
                                    </button>
                                )}
                                <div className="flex flex-col">
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="text-[10.5pt] font-bold uppercase text-zinc-900" {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                                        <span className="text-[9pt] font-medium italic text-zinc-700" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                    </div>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <p className="text-[10pt] font-medium text-zinc-800" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</p>
                                    </div>
                                </div>
                                <ul className="list-disc list-outside ml-5 mt-1 space-y-1 text-[9.5pt] text-zinc-800">
                                    {job.responsibilities.map((resp, i) => (
                                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Education */}
                <section>
                    <h2 className="text-[11pt] font-bold uppercase tracking-wider text-zinc-900 border-b-[1pt] border-zinc-800 mb-3">Education</h2>
                    <div className="space-y-4">
                        {cvData.education.map((edu, index) => (
                            <div key={index}>
                                <div className="flex justify-between items-baseline">
                                    <h3 className="text-[10.5pt] font-bold uppercase text-zinc-900" {...editableProps(['education', index, 'school'])}>{edu.school}</h3>
                                    <span className="text-[9pt] font-medium text-zinc-700" {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                                </div>
                                <p className="text-[10pt] text-zinc-800" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Skills */}
                <section>
                    <h2 className="text-[11pt] font-bold uppercase tracking-wider text-zinc-900 border-b-[1pt] border-zinc-800 mb-3">Additional Skills</h2>
                    <div className="space-y-1">
                        <div className="text-[9.5pt] text-zinc-800 flex flex-wrap gap-x-2">
                            {cvData.skills.map((skill, i) => (
                                <span key={i}>
                                    {skill}{i < cvData.skills.length - 1 && " •"}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Projects */}
                {cvData.projects && cvData.projects.length > 0 && (
                    <section>
                        <h2 className="text-[11pt] font-bold uppercase tracking-wider text-zinc-900 border-b-[1pt] border-zinc-800 mb-3">Projects</h2>
                        <div className="space-y-4">
                            {cvData.projects.map((proj, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="text-[10pt] font-bold text-zinc-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                                        {proj.link && <a href={proj.link} className="text-[8pt] text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>Link</a>}
                                    </div>
                                    <p className="text-[9.5pt] text-zinc-800 leading-tight mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
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

export default TemplateStandardPro;
