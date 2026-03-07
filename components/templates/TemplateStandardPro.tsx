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

// Jake's Resume ATS-Pro Style — #1 ATS-safe format, beloved by FAANG engineers
// Based on the famous LaTeX template open-sourced by Jake Gutierrez
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
        className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
    } : {};

    return (
        <div
            id="cv-preview-standard-pro"
            className="bg-white text-black shadow-lg border"
            style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", padding: '36px 48px', maxWidth: '816px', margin: '0 auto' }}
        >
            {/* ── NAME & CONTACT ── */}
            <header className="text-center mb-4">
                <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '0.5px', margin: 0, lineHeight: 1.1 }}>
                    {personalInfo.name}
                </h1>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#333' }} className="flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5">
                    {personalInfo.phone && <span>{personalInfo.phone}</span>}
                    {personalInfo.phone && personalInfo.email && <span>·</span>}
                    {personalInfo.email && <a href={`mailto:${personalInfo.email}`} style={{ color: '#1a56db' }}>{personalInfo.email}</a>}
                    {personalInfo.linkedin && <><span>·</span><a href={personalInfo.linkedin} style={{ color: '#1a56db' }}>linkedin.com/in/{personalInfo.linkedin.replace(/.*\/in\//, '')}</a></>}
                    {personalInfo.github && <><span>·</span><a href={personalInfo.github} style={{ color: '#1a56db' }}>github.com/{personalInfo.github.replace(/.*github\.com\//, '')}</a></>}
                    {personalInfo.website && <><span>·</span><a href={personalInfo.website} style={{ color: '#1a56db' }}>{personalInfo.website.replace(/https?:\/\/(www\.)?/, '')}</a></>}
                    {personalInfo.location && <><span>·</span><span>{personalInfo.location}</span></>}
                </div>
            </header>

            <main>
                {/* ── SUMMARY ── */}
                {cvData.summary && (
                    <section style={{ marginBottom: '12px' }}>
                        <div style={{ borderBottom: '1.5px solid #000', marginBottom: '6px' }}>
                            <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Summary</h2>
                        </div>
                        <p style={{ fontSize: '11px', lineHeight: '1.5', margin: 0 }} dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                    </section>
                )}

                {/* ── EXPERIENCE ── */}
                <section style={{ marginBottom: '12px' }}>
                    <div style={{ borderBottom: '1.5px solid #000', marginBottom: '8px' }}>
                        <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Experience</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {cvData.experience.map((job, index) => (
                            <div key={index} className="relative group">
                                {isEditing && (
                                    <button
                                        onClick={() => handleDeleteExperience(index)}
                                        className="absolute -left-8 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                                        title="Delete this experience entry"
                                    >
                                        <Trash className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                {/* Row 1: Company (left) | Dates (right) */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700 }} {...editableProps(['experience', index, 'company'])}>{job.company}</span>
                                    <span style={{ fontSize: '11px', fontStyle: 'italic', color: '#444' }} {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                </div>
                                {/* Row 2: Job Title (left) | Location (right, if any) */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '1px' }}>
                                    <span style={{ fontSize: '11.5px', fontStyle: 'italic' }} {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</span>
                                </div>
                                {/* Bullet points */}
                                <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyleType: 'disc' }}>
                                    {job.responsibilities.map((resp, i) => (
                                        <li
                                            key={i}
                                            style={{ fontSize: '11px', lineHeight: '1.5', marginBottom: '2px' }}
                                            dangerouslySetInnerHTML={{ __html: resp }}
                                            {...editableProps(['experience', index, 'responsibilities', i])}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── EDUCATION ── */}
                <section style={{ marginBottom: '12px' }}>
                    <div style={{ borderBottom: '1.5px solid #000', marginBottom: '8px' }}>
                        <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Education</h2>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cvData.education.map((edu, index) => (
                            <div key={index}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700 }} {...editableProps(['education', index, 'school'])}>{edu.school}</span>
                                    <span style={{ fontSize: '11px', fontStyle: 'italic', color: '#444' }} {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                                </div>
                                <div style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '1px' }} {...editableProps(['education', index, 'degree'])}>{edu.degree}</div>
                                {edu.description && (
                                    <div style={{ fontSize: '10.5px', color: '#555', marginTop: '2px' }} dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── PROJECTS ── */}
                {cvData.projects && cvData.projects.length > 0 && (
                    <section style={{ marginBottom: '12px' }}>
                        <div style={{ borderBottom: '1.5px solid #000', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Projects</h2>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {cvData.projects.map((proj, index) => (
                                <div key={index}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700 }} {...editableProps(['projects', index, 'name'])}>{proj.name}</span>
                                        {proj.link && (
                                            <a href={proj.link} style={{ fontSize: '10px', color: '#1a56db' }} {...editableProps(['projects', index, 'link'])}>
                                                | {proj.link}
                                            </a>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '11px', margin: '2px 0 0', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── TECHNICAL SKILLS ── */}
                <section style={{ marginBottom: '12px' }}>
                    <div style={{ borderBottom: '1.5px solid #000', marginBottom: '6px' }}>
                        <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Technical Skills</h2>
                    </div>
                    <div style={{ fontSize: '11px', lineHeight: '1.7' }}>
                        {/* Group skills into rows of ~6 */}
                        {(() => {
                            const chunkSize = Math.ceil(cvData.skills.length / Math.ceil(cvData.skills.length / 6));
                            const rows: string[][] = [];
                            for (let i = 0; i < cvData.skills.length; i += chunkSize) {
                                rows.push(cvData.skills.slice(i, i + chunkSize));
                            }
                            return rows.map((row, ri) => (
                                <div key={ri} style={{ marginBottom: '2px' }}>
                                    {row.map((skill, si) => (
                                        <span key={si}>{skill}{si < row.length - 1 ? ' • ' : ''}</span>
                                    ))}
                                </div>
                            ));
                        })()}
                    </div>
                </section>

                {/* ── LANGUAGES ── */}
                {cvData.languages && cvData.languages.length > 0 && (
                    <section style={{ marginBottom: '12px' }}>
                        <div style={{ borderBottom: '1.5px solid #000', marginBottom: '6px' }}>
                            <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Languages</h2>
                        </div>
                        <p style={{ fontSize: '11px', margin: 0 }}>
                            {cvData.languages.map((l, i) => (
                                <span key={i}>{l.name} ({l.proficiency}){i < cvData.languages!.length - 1 && ' • '}</span>
                            ))}
                        </p>
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
