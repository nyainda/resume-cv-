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

const TemplateATSCleanPro: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange }) => {
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
        onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
        className: 'outline-none ring-1 ring-transparent focus:ring-cyan-400 focus:bg-cyan-50/50 rounded px-1 -mx-1 transition-all',
    } : {};

    const contacts = [
        personalInfo.email,
        personalInfo.phone,
        personalInfo.location,
        personalInfo.linkedin ? 'LinkedIn' : null,
        personalInfo.github ? 'GitHub' : null,
        personalInfo.website || null,
    ].filter(Boolean) as string[];

    return (
        <div id="cv-preview-ats-clean-pro" className="bg-white p-10 sm:p-12 text-slate-800 shadow-lg border" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
            {/* Header */}
            <header className="mb-5">
                <h1 className="text-3xl font-black text-slate-900 leading-tight tracking-tight mb-2">
                    {personalInfo.name}
                </h1>
                {/* Gradient accent bar */}
                <div className="h-0.5 mb-3 rounded-full" style={{ background: 'linear-gradient(to right, #0e7490, #7c3aed)' }} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {contacts.map((c, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <span className="text-slate-300">|</span>}
                            <span>{c}</span>
                        </React.Fragment>
                    ))}
                </div>
            </header>

            {/* Summary */}
            {cvData.summary && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-2">
                        Professional Summary
                    </h2>
                    <p className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>
            )}

            {/* Core Competencies */}
            {cvData.skills.length > 0 && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-2">
                        Core Competencies
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {cvData.skills.slice(0, 8).map((skill, i) => (
                            <span
                                key={i}
                                className="text-xs font-semibold px-3 py-1 rounded-sm border"
                                style={{ backgroundColor: '#ecfeff', color: '#0e7490', borderColor: '#a5f3fc' }}
                                {...(isEditing ? editableProps(['skills', i]) : {})}
                                dangerouslySetInnerHTML={{ __html: skill }}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Work Experience */}
            {cvData.experience.length > 0 && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-3">
                        Work Experience
                    </h2>
                    <div className="space-y-5">
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                                        title="Delete experience"
                                    >
                                        <Trash className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h3 className="text-sm font-black text-slate-900" {...editableProps(['experience', index, 'jobTitle'])} dangerouslySetInnerHTML={{ __html: job.jobTitle }} />
                                    <span className="text-xs text-slate-400 flex-shrink-0 ml-3" {...editableProps(['experience', index, 'dates'])} dangerouslySetInnerHTML={{ __html: job.dates }} />
                                </div>
                                <p className="text-xs font-bold mb-2" style={{ color: '#7c3aed' }} {...editableProps(['experience', index, 'company'])} dangerouslySetInnerHTML={{ __html: job.company }} />
                                <ul className="space-y-1">
                                    {job.responsibilities.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                            <span className="text-cyan-600 font-black mt-0.5 flex-shrink-0">•</span>
                                            <span dangerouslySetInnerHTML={{ __html: r }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Projects */}
            {cvData.projects && cvData.projects.length > 0 && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-3">
                        Projects
                    </h2>
                    <div className="space-y-3">
                        {cvData.projects.slice(0, 4).map((proj, i) => (
                            <div key={i}>
                                <p className="text-sm font-black text-slate-900" dangerouslySetInnerHTML={{ __html: proj.name }} {...editableProps(['projects', i, 'name'])} />
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', i, 'description'])} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Education */}
            {cvData.education.length > 0 && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-3">
                        Education
                    </h2>
                    <div className="space-y-3">
                        {cvData.education.map((edu, i) => (
                            <div key={i} className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-black text-slate-900" dangerouslySetInnerHTML={{ __html: edu.degree }} {...editableProps(['education', i, 'degree'])} />
                                    <p className="text-xs font-semibold" style={{ color: '#7c3aed' }} dangerouslySetInnerHTML={{ __html: edu.school }} {...editableProps(['education', i, 'school'])} />
                                    {edu.description && <p className="text-xs text-slate-500 mt-0.5" dangerouslySetInnerHTML={{ __html: edu.description }} />}
                                </div>
                                <span className="text-xs text-slate-400 flex-shrink-0 ml-3" {...editableProps(['education', i, 'graduationYear'])} dangerouslySetInnerHTML={{ __html: edu.year }} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Remaining Skills */}
            {cvData.skills.length > 8 && (
                <section className="mb-5">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-2">
                        Skills
                    </h2>
                    <p className="text-xs text-slate-700 leading-relaxed">
                        {cvData.skills.slice(8).join('  ·  ')}
                    </p>
                </section>
            )}

            {/* Languages */}
            {cvData.languages && cvData.languages.length > 0 && (
                <section>
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-700 border-b border-slate-200 pb-1 mb-2">
                        Languages
                    </h2>
                    <p className="text-xs text-slate-700">
                        {cvData.languages.map(l => `${l.name} (${l.proficiency})`).join('  ·  ')}
                    </p>
                </section>
            )}
        </div>
    );
};

export default TemplateATSCleanPro;
