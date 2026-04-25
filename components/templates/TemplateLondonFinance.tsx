import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

const TemplateLondonFinance: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
    const accent = cvData.accentColor ?? '#1c1c1c';

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
        <div className="border-b mb-3 mt-8" style={{ borderColor: accent }}>
            <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>{title}</h2>
        </div>
    );

    const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

    const renderSection = (key: ProfileSectionKey): React.ReactNode => {
        switch (key) {
            case 'summary':
                return (
                    <section key="summary">
                        <SectionHeader title="Professional Profile" />
                        <p className="text-xs leading-relaxed text-justify italic" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                    </section>
                );
            case 'workExperience':
                return (
                    <section key="workExperience">
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
                );
            case 'education':
                return cvData.education.length > 0 ? (
                    <section key="education">
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
                ) : null;
            case 'skills':
                return cvData.skills.length > 0 ? (
                    <section key="skills">
                        <SectionHeader title="Technical Skills" />
                        <div className="grid grid-cols-1 gap-2 text-[11px]">
                            <div className="flex gap-4">
                                <span className="flex-1">{cvData.skills.slice(0, 15).join(', ')}</span>
                            </div>
                        </div>
                    </section>
                ) : null;
            case 'projects':
                return cvData.projects && cvData.projects.length > 0 ? (
                    <section key="projects">
                        <SectionHeader title="Notable Projects" />
                        <div className="grid grid-cols-1 gap-2 text-[11px]">
                            {cvData.projects.map((p, i) => (
                                <div key={i} className="flex gap-4">
                                    <span className="font-bold uppercase min-w-[120px]">{p.name}:</span>
                                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: p.description }} />
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'languages':
                return cvData.languages && cvData.languages.length > 0 ? (
                    <section key="languages">
                        <SectionHeader title="Languages" />
                        <div className="text-[11px]">
                            {cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ')}
                        </div>
                    </section>
                ) : null;
            case 'references':
                return cvData.references && cvData.references.length > 0 ? (
                    <section key="references">
                        <SectionHeader title="References" />
                        <div className="grid grid-cols-2 gap-4 text-[11px]">
                            {cvData.references.map((ref, index) => (
                                <div key={index}>
                                    <p className="font-bold">{ref.name}</p>
                                    <p className="italic">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                                    {ref.email && <p>{ref.email}</p>}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <div id="cv-preview-london-finance" className="bg-white p-12 sm:p-16 text-[#1c1c1c] shadow-xl border border-zinc-200 font-serif leading-tight" style={{ fontFamily: "'Times New Roman', serif" }}>
            <header className="text-center mb-8 border-b-2 pb-8" style={{ borderColor: accent }}>
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
                {orderedSections.map(key => renderSection(key))}
            
        <TemplateCustomSections
          customSections={cvData.customSections}
          skipReferences
          renderHeader={title => <SectionHeader title={title} />}
          sectionClassName="mb-8"
          titleClass="font-semibold"
          subtitleClass="text-sm opacity-70"
          descClass="text-sm opacity-80 mt-0.5"
          yearClass="text-xs opacity-60"
        />
</main>

            {jobDescriptionForATS && (
                <HiddenATSKeywords text={jobDescriptionForATS} />
            )}
        </div>
    );
};

export default TemplateLondonFinance;
