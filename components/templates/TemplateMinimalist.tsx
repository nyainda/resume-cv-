
import React, { useCallback } from 'react';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { Trash } from '../icons';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

const TemplateMinimalist: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
        className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
    } : {};

    const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

    const renderSection = (key: ProfileSectionKey): React.ReactNode => {
        switch (key) {
            case 'summary':
                return (
                    <section key="summary">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Profile</h2>
                        <p className="text-base leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                    </section>
                );
            case 'workExperience':
                return (
                    <section key="workExperience">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Experience</h2>
                        <div className="space-y-8">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                                            title="Delete this experience entry"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className="text-lg font-medium text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                        <p className="text-sm text-slate-500 whitespace-nowrap ml-4" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                                    </div>
                                    <p className="text-base text-slate-600 mb-2" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                                    <ul className="list-disc list-outside ml-5 space-y-1.5 text-slate-700">
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
                return cvData.education && cvData.education.length > 0 ? (
                    <section key="education">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Education</h2>
                        <div className="space-y-4">
                            {cvData.education.map((edu, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="text-base font-medium text-slate-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                                        <p className="text-sm text-slate-500 whitespace-nowrap ml-4" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                                    </div>
                                    <p className="text-base text-slate-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                                    {edu.description && (
                                        <p className="text-sm text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'skills':
                return cvData.skills.length > 0 ? (
                    <section key="skills">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Skills</h2>
                        {(() => {
                            const sk = cvData.skills.slice(0, 15);
                            const perCol = Math.ceil(sk.length / 3);
                            return (
                                <div className="grid grid-cols-3 gap-x-4">
                                    {[0, 1, 2].map(ci => (
                                        <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                                            {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                                                <li key={si} className="text-sm text-slate-700">{s}</li>
                                            ))}
                                        </ul>
                                    ))}
                                </div>
                            );
                        })()}
                    </section>
                ) : null;
            case 'projects':
                return cvData.projects && cvData.projects.length > 0 ? (
                    <section key="projects">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Projects</h2>
                        <div className="space-y-6">
                            {cvData.projects.map((proj, index) => (
                                <div key={index}>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <h3 className="text-lg font-medium text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                                        {proj.link && <a href={proj.link} className="text-xs text-blue-600 hover:underline" {...editableProps(['projects', index, 'link'])}>[Link]</a>}
                                    </div>
                                    <p className="text-base text-slate-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'languages':
                return cvData.languages && cvData.languages.length > 0 ? (
                    <section key="languages">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Languages</h2>
                        <div className="flex flex-wrap gap-4">
                            {cvData.languages.map((lang, index) => (
                                <div key={index} className="text-sm">
                                    <span className="font-medium text-slate-900" {...editableProps(['languages', index, 'name'])}>{lang.name}</span>
                                    <span className="text-slate-500"> - </span>
                                    <span className="text-slate-600" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'references':
                return cvData.references && cvData.references.length > 0 ? (
                    <section key="references">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">References</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {cvData.references.map((ref, index) => (
                                <div key={index} className="text-sm text-slate-700">
                                    <p className="font-bold text-slate-900">{ref.name}</p>
                                    <p className="text-slate-600">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                                    {ref.relationship && <p className="text-slate-500 italic">{ref.relationship}</p>}
                                    {ref.email && <p>{ref.email}</p>}
                                    {ref.phone && <p>{ref.phone}</p>}
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
        <div id="cv-preview-minimalist" className="bg-white p-10 text-slate-900 shadow-lg border font-sans">
            <header className="mb-10">
                {personalInfo.photo && (
                  <div className="flex justify-end mb-4">
                    <img
                      src={personalInfo.photo}
                      alt={personalInfo.name}
                      className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                    />
                  </div>
                )}
                <h1 className="text-5xl font-light tracking-tight text-slate-900 mb-2">{personalInfo.name}</h1>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                    <span>{personalInfo.email}</span>
                    <span>{personalInfo.phone}</span>
                    <span>{personalInfo.location}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 mt-1">
                    {personalInfo.linkedin && <a href={personalInfo.linkedin} className="hover:text-slate-800 hover:underline">LinkedIn</a>}
                    {personalInfo.website && <a href={personalInfo.website} className="hover:text-slate-800 hover:underline">Website</a>}
                    {personalInfo.github && <a href={personalInfo.github} className="hover:text-slate-800 hover:underline">GitHub</a>}
                </div>
            </header>

            <main className="space-y-10">
                {orderedSections.map(key => renderSection(key))}
                {cvData.publications && cvData.publications.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Publications</h2>
                        <div className="space-y-6">
                            {cvData.publications.map((pub, index) => (
                                <div key={index}>
                                    <h3 className="text-lg font-medium text-slate-900" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                                    <p className="text-sm text-slate-600" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</p>
                                    <p className="text-sm text-slate-500 italic">
                                        <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                                    </p>
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

export default TemplateMinimalist;
