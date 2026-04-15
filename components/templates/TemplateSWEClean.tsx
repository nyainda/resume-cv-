import React, { useCallback } from 'react';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

const GitHubIcon = () => (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
);

const TemplateSWEClean: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange }) => {
    const handleUpdate = useCallback((path: (string | number)[], value: any) => {
        const d = JSON.parse(JSON.stringify(cvData));
        let cur: any = d;
        for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
        cur[path[path.length - 1]] = value;
        onDataChange(d);
    }, [cvData, onDataChange]);

    const ed = (path: (string | number)[]) => isEditing ? {
        contentEditable: true as any,
        suppressContentEditableWarning: true,
        onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
        style: { outline: 'none', borderBottom: '1px dashed #d1d5db', cursor: 'text' },
    } : {};

    const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">{title}</h2>
    );

    const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

    const renderSection = (key: ProfileSectionKey): React.ReactNode => {
        switch (key) {
            case 'skills':
                return cvData.skills && cvData.skills.length > 0 ? (
                    <section key="skills" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">Skills</h2>
                        <div className="flex flex-wrap gap-1.5">
                            {cvData.skills.map((s, i) => (
                                <span key={i} className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-gray-700" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>{s}</span>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'summary':
                return cvData.summary ? (
                    <section key="summary" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">Summary</h2>
                        <p className="text-xs text-gray-700 leading-relaxed" {...ed(['summary'])} dangerouslySetInnerHTML={{ __html: cvData.summary }} />
                    </section>
                ) : null;
            case 'workExperience':
                return cvData.experience.length > 0 ? (
                    <section key="workExperience" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-3">Experience</h2>
                        <div className="space-y-4">
                            {cvData.experience.map((job, i) => (
                                <div key={i}>
                                    <div className="flex items-start justify-between gap-4 mb-1">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-gray-900 text-sm" {...ed(['experience', i, 'jobTitle'])} dangerouslySetInnerHTML={{ __html: job.jobTitle }} />
                                                {(job as any).link && (
                                                    <a href={(job as any).link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-gray-500 hover:text-gray-900">
                                                        <GitHubIcon /><span>repo</span>
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-xs font-semibold text-gray-500 mt-0.5" {...ed(['experience', i, 'company'])} dangerouslySetInnerHTML={{ __html: job.company }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap flex-shrink-0" {...ed(['experience', i, 'dates'])} dangerouslySetInnerHTML={{ __html: job.dates }} />
                                    </div>
                                    <ul className="space-y-0.5 mt-1.5">
                                        {job.responsibilities.map((r, j) => (
                                            <li key={j} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                                                <span className="text-gray-400 flex-shrink-0 mt-0.5 font-bold">—</span>
                                                <span {...ed(['experience', i, 'responsibilities', j])} dangerouslySetInnerHTML={{ __html: r }} />
                                            </li>
                                        ))}
                                    </ul>
                                    {i < cvData.experience.length - 1 && <div className="mt-3 h-px bg-gray-100" />}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'projects':
                return cvData.projects && cvData.projects.length > 0 ? (
                    <section key="projects" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-3">Projects</h2>
                        <div className="space-y-2">
                            {cvData.projects.map((proj, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h3 className="font-bold text-gray-900 text-xs font-mono" {...ed(['projects', i, 'name'])} dangerouslySetInnerHTML={{ __html: proj.name }} />
                                            {proj.link && (
                                                <a href={proj.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[9px] text-gray-500 font-mono font-semibold hover:text-gray-900">
                                                    <GitHubIcon /><span>github</span>
                                                </a>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-relaxed" {...ed(['projects', i, 'description'])} dangerouslySetInnerHTML={{ __html: proj.description }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'education':
                return cvData.education.length > 0 ? (
                    <section key="education" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">Education</h2>
                        {cvData.education.map((edu, i) => (
                            <div key={i} className="mb-1.5">
                                <p className="font-bold text-gray-900 text-xs" {...ed(['education', i, 'degree'])} dangerouslySetInnerHTML={{ __html: edu.degree }} />
                                <p className="text-[10px] text-gray-500" {...ed(['education', i, 'school'])} dangerouslySetInnerHTML={{ __html: edu.school }} />
                                <p className="text-[9px] text-gray-400">{edu.year}</p>
                            </div>
                        ))}
                    </section>
                ) : null;
            case 'languages':
                return cvData.languages && cvData.languages.length > 0 ? (
                    <section key="languages" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">Languages</h2>
                        {cvData.languages.map((l, i) => (
                            <div key={i} className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-gray-700 font-medium">{l.name}</span>
                                <span className="text-gray-400 font-mono">{l.proficiency}</span>
                            </div>
                        ))}
                    </section>
                ) : null;
            case 'references':
                return cvData.references && cvData.references.length > 0 ? (
                    <section key="references" className="mb-5">
                        <h2 className="font-mono font-black text-gray-900 text-[10px] uppercase tracking-widest mb-2">References</h2>
                        {cvData.references.map((ref, i) => (
                            <div key={i} className="mb-1.5 text-[10px]">
                                <p className="font-bold text-gray-900">{ref.name}</p>
                                <p className="text-gray-500">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                                {ref.email && <p className="text-gray-400">{ref.email}</p>}
                            </div>
                        ))}
                    </section>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <div className="bg-white font-sans" style={{ minHeight: '297mm', fontFamily: "'Inter', system-ui, sans-serif", padding: '12mm 14mm' }}>
            <header className="mb-6 pb-5" style={{ borderBottom: '2px solid #111827' }}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="font-black text-gray-900" style={{ fontSize: '26px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{personalInfo.name}</h1>
                        {cvData.experience[0] && (
                            <p className="font-mono font-semibold text-gray-500 mt-1" style={{ fontSize: '11px' }}>{cvData.experience[0].jobTitle}</p>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className="space-y-0.5">
                            {personalInfo.email && <p className="text-xs text-gray-600">{personalInfo.email}</p>}
                            {personalInfo.phone && <p className="text-xs text-gray-600">{personalInfo.phone}</p>}
                            {personalInfo.location && <p className="text-xs text-gray-600">{personalInfo.location}</p>}
                            {personalInfo.github && (
                                <a href={personalInfo.github} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-1 text-xs text-gray-900 font-semibold">
                                    <GitHubIcon />{personalInfo.github.replace('https://github.com/', '')}
                                </a>
                            )}
                            {personalInfo.linkedin && <p className="text-xs text-gray-500">{personalInfo.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</p>}
                            {personalInfo.website && <p className="text-xs text-gray-500">{personalInfo.website.replace(/https?:\/\//, '')}</p>}
                        </div>
                    </div>
                </div>
            </header>

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
        </div>
    );
};

export default TemplateSWEClean;
