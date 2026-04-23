import React, { useCallback } from 'react';
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

const TemplateStandardPro: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
    const accent = cvData.accentColor ?? '#111111';

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
        className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-50 rounded px-0.5 -mx-0.5 transition-all"
    } : {};

    const SectionHeader = ({ title }: { title: string }) => (
        <div style={{ marginBottom: '10px', marginTop: '18px' }}>
            <h2 style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                margin: '0 0 4px',
                color: accent,
            }}>{title}</h2>
            <div style={{ borderTop: `1.5px solid ${accent}`, marginBottom: '2px' }} />
            <div style={{ borderTop: `0.5px solid ${accent}88` }} />
        </div>
    );

    const contactParts = [
        personalInfo.location,
        personalInfo.phone,
        personalInfo.email && <a key="email" href={`mailto:${personalInfo.email}`} style={{ color: '#1a56db' }}>{personalInfo.email}</a>,
        personalInfo.linkedin && <a key="li" href={personalInfo.linkedin} style={{ color: '#1a56db' }}>linkedin.com/in/{personalInfo.linkedin.replace(/.*\/in\//, '')}</a>,
        personalInfo.github && <a key="gh" href={personalInfo.github} style={{ color: '#1a56db' }}>github.com/{personalInfo.github.replace(/.*github\.com\//, '')}</a>,
        personalInfo.website && <a key="web" href={personalInfo.website} style={{ color: '#1a56db' }}>{personalInfo.website.replace(/https?:\/\/(www\.)?/, '')}</a>,
    ].filter(Boolean);

    const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

    const renderSection = (key: ProfileSectionKey): React.ReactNode => {
        switch (key) {
            case 'summary':
                return cvData.summary ? (
                    <section key="summary">
                        <SectionHeader title="Professional Summary" />
                        <p
                            style={{ fontSize: '11.5px', lineHeight: '1.65', margin: 0, fontStyle: 'italic', color: '#222' }}
                            dangerouslySetInnerHTML={{ __html: cvData.summary }}
                            {...editableProps(['summary'])}
                        />
                    </section>
                ) : null;
            case 'workExperience':
                return (
                    <section key="workExperience">
                        <SectionHeader title="Work Experience" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-9 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                                            title="Delete this experience entry"
                                        >
                                            <Trash className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }} {...editableProps(['experience', index, 'company'])}>
                                            {job.company}
                                        </span>
                                        <span style={{ fontSize: '11px', fontStyle: 'italic', color: '#555', whiteSpace: 'nowrap', marginLeft: '12px' }} {...editableProps(['experience', index, 'dates'])}>
                                            {job.dates}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', fontStyle: 'italic', color: '#333', marginTop: '2px', marginLeft: '2px' }} {...editableProps(['experience', index, 'jobTitle'])}>
                                        {job.jobTitle}
                                    </div>
                                    <ul style={{ margin: '5px 0 0 18px', padding: 0, listStyleType: 'disc' }}>
                                        {job.responsibilities.map((resp, i) => (
                                            <li
                                                key={i}
                                                style={{ fontSize: '11px', lineHeight: '1.6', marginBottom: '2px', color: '#111' }}
                                                dangerouslySetInnerHTML={{ __html: resp }}
                                                {...editableProps(['experience', index, 'responsibilities', i])}
                                            />
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {cvData.education.map((edu, index) => (
                                <div key={index}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }} {...editableProps(['education', index, 'school'])}>
                                            {edu.school}
                                        </span>
                                        <span style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap', marginLeft: '12px' }} {...editableProps(['education', index, 'year'])}>
                                            {edu.year}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', fontStyle: 'italic', color: '#333', marginTop: '2px', marginLeft: '2px' }} {...editableProps(['education', index, 'degree'])}>
                                        {edu.degree}
                                    </div>
                                    {edu.description && (
                                        <div style={{ fontSize: '10.5px', color: '#555', marginTop: '2px', marginLeft: '2px' }} dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'skills':
                return cvData.skills && cvData.skills.length > 0 ? (
                    <section key="skills">
                        <SectionHeader title="Skills & Competencies" />
                        {(() => {
                            const cols = 3;
                            const sk = cvData.skills.slice(0, 15);
                            const perCol = Math.ceil(sk.length / 3);
                            const columns: string[][] = [];
                            for (let i = 0; i < cols; i++) {
                                columns.push(sk.slice(i * perCol, (i + 1) * perCol));
                            }
                            return (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
                                    {columns.map((col, ci) => (
                                        <ul key={ci} style={{ margin: 0, padding: '0 0 0 16px', listStyleType: 'disc' }}>
                                            {col.map((skill, si) => (
                                                <li key={si} style={{ fontSize: '11px', lineHeight: '1.75', color: '#111', marginBottom: '1px' }}>
                                                    {skill}
                                                </li>
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
                        <SectionHeader title="Projects & Research" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {cvData.projects.map((proj, index) => (
                                <div key={index}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700 }} {...editableProps(['projects', index, 'name'])}>
                                            {proj.name}
                                        </span>
                                        {proj.link && (
                                            <a href={proj.link} style={{ fontSize: '10px', color: '#1a56db' }} {...editableProps(['projects', index, 'link'])}>
                                                ↗ Link
                                            </a>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '11px', margin: '3px 0 0 2px', lineHeight: '1.55', color: '#222' }} dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;
            case 'languages':
                return cvData.languages && cvData.languages.length > 0 ? (
                    <section key="languages">
                        <SectionHeader title="Languages" />
                        <p style={{ fontSize: '11px', margin: 0, color: '#111' }}>
                            {cvData.languages.map((l, i) => (
                                <span key={i}>{l.name} <span style={{ fontStyle: 'italic', color: '#555' }}>({l.proficiency})</span>{i < (cvData.languages?.length ?? 0) - 1 && '   •   '}</span>
                            ))}
                        </p>
                    </section>
                ) : null;
            case 'references':
                return cvData.references && cvData.references.length > 0 ? (
                    <section key="references">
                        <SectionHeader title="References" />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {cvData.references.map((ref, index) => (
                                <div key={index} style={{ fontSize: '11px', color: '#111' }}>
                                    <p style={{ fontWeight: 700 }}>{ref.name}</p>
                                    <p style={{ color: '#555' }}>{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
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
        <>
        <style>{`
            #cv-preview-standard-pro * {
                font-family: 'Lora', 'Times New Roman', Georgia, serif !important;
            }
        `}</style>
        <div
            id="cv-preview-standard-pro"
            className="bg-white text-black shadow-lg border"
            style={{ fontFamily: "'Lora', 'Times New Roman', Georgia, serif", padding: '40px 52px', maxWidth: '816px', margin: '0 auto' }}
        >
            <header style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>
                    {personalInfo.name}
                </h1>
                <div style={{ marginTop: '7px', fontSize: '11px', color: '#333', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '0 6px', lineHeight: '1.6' }}>
                    {contactParts.map((part, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <span style={{ color: '#888' }}>|</span>}
                            <span>{part}</span>
                        </React.Fragment>
                    ))}
                </div>
            </header>

            <div style={{ borderTop: '1.5px solid #111', marginTop: '10px', marginBottom: '3px' }} />
            <div style={{ borderTop: '0.5px solid #555', marginBottom: '0' }} />

            <main style={{ marginTop: '6px' }}>
                {orderedSections.map(key => renderSection(key))}
                {cvData.publications && cvData.publications.length > 0 && (
                    <section>
                        <SectionHeader title="Publications" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {cvData.publications.map((pub, index) => (
                                <p key={index} style={{ fontSize: '11px', margin: 0, lineHeight: '1.55', color: '#111' }}>
                                    <span style={{ fontWeight: 700 }} {...editableProps(['publications', index, 'title'])}>{pub.title}</span>.{' '}
                                    <span style={{ fontStyle: 'italic' }} {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</span>.{' '}
                                    <span style={{ color: '#444' }} {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>,{' '}
                                    <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>.
                                </p>
                            ))}
                        </div>
                    </section>
                )}
            
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
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}
        </div>
        </>
    );
};

export default TemplateStandardPro;
