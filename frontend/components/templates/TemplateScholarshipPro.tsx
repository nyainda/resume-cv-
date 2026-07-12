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

const NAVY = '#1B2B4B';
const GOLD = '#C9A84C';

const TemplateScholarshipPro: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
    const accent = cvData.accentColor ?? NAVY;

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
        className: 'outline-none ring-1 ring-[#C9A84C] bg-[#C9A84C]/10 rounded px-1 -mx-1'
    } : {};

    const SectionHeading = ({ children }: { children: React.ReactNode }) => (
        <div className="flex items-center gap-4 mb-4 mt-10 first:mt-0">
            <h2
                className="text-[11px] font-black uppercase tracking-[0.18em] shrink-0"
                style={{ color: accent }}
            >
                {children}
            </h2>
            <div
                className="h-px flex-1"
                style={{ background: `linear-gradient(to right, ${GOLD}60, transparent)` }}
            />
        </div>
    );

    const initials = personalInfo.name
        .split(' ')
        .map(p => p[0] ?? '')
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <div
            id="cv-preview-scholarship-pro"
            className="bg-white text-slate-800 shadow-xl border border-slate-100 font-sans leading-relaxed"
            style={{ fontFamily: "'Inter', sans-serif", padding: '32px 36px' }}
        >
            {/* ── Header ── */}
            <header className="grid grid-cols-12 gap-6 mb-6 items-center">
                <div className="col-span-8">
                    <h1
                        className="text-[26px] font-black tracking-tight leading-none mb-2 uppercase"
                        style={{ color: NAVY }}
                    >
                        {personalInfo.name}
                    </h1>
                    <div
                        className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: accent }}
                    >
                        {personalInfo.email && <span>{personalInfo.email}</span>}
                        {personalInfo.phone && <span>{personalInfo.phone}</span>}
                        {personalInfo.location && <span>{personalInfo.location}</span>}
                    </div>
                </div>
                <div className="col-span-4 flex justify-end">
                    <div
                        className="px-5 py-3 rounded-xl shadow-md text-right rotate-1"
                        style={{ backgroundColor: NAVY }}
                    >
                        <span
                            className="block text-[9px] font-black uppercase tracking-[0.22em] mb-1 opacity-50"
                            style={{ color: GOLD }}
                        >
                            Academic ID
                        </span>
                        <span
                            className="block font-mono text-sm font-bold uppercase"
                            style={{ color: GOLD }}
                        >
                            {initials}-{personalInfo.name.length % 10}{new Date().getFullYear()}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Profile/Summary banner ── */}
            <section
                className="p-4 rounded-xl mb-5"
                style={{ background: `${NAVY}08`, border: `1px solid ${GOLD}30` }}
            >
                <div className="flex gap-4 items-start">
                    <span className="text-3xl mt-0.5">🎓</span>
                    <div className="flex-1">
                        <h2
                            className="text-[9px] font-black uppercase tracking-[0.2em] mb-1.5"
                            style={{ color: accent }}
                        >
                            Research Intent / Profile
                        </h2>
                        <p
                            className="text-[13px] font-medium tracking-tight text-slate-700 italic leading-snug"
                            dangerouslySetInnerHTML={{ __html: cvData.summary }}
                            {...editableProps(['summary'])}
                        />
                    </div>
                </div>
            </section>

            <main className="grid grid-cols-12 gap-6">
                {/* ── Left column ── */}
                <div className="col-span-8 space-y-4">
                    <section>
                        <SectionHeading>Academic Formation</SectionHeading>
                        <div className="space-y-5">
                            {cvData.education.map((edu, idx) => (
                                <div
                                    key={idx}
                                    className="relative pl-6"
                                    style={{
                                        borderLeft: `2px solid ${GOLD}40`,
                                    }}
                                >
                                    <div
                                        className="absolute -left-[5px] top-2 w-2 h-2 rounded-full"
                                        style={{ backgroundColor: GOLD }}
                                    />
                                    <h3 className="text-[13px] font-black text-slate-900" {...editableProps(['education', idx, 'degree'])}>
                                        {edu.degree}
                                    </h3>
                                    <div
                                        className="flex justify-between items-baseline text-[10px] font-bold uppercase tracking-widest mt-0.5"
                                        style={{ color: NAVY }}
                                    >
                                        <span {...editableProps(['education', idx, 'school'])}>{edu.school}</span>
                                        <span {...editableProps(['education', idx, 'year'])}>{edu.year}</span>
                                    </div>
                                    {edu.description && (
                                        <p
                                            className="text-[11px] mt-2 text-slate-600 leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: edu.description }}
                                            {...editableProps(['education', idx, 'description'])}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <SectionHeading>Relevant Experience</SectionHeading>
                        <div className="space-y-7">
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
                                    <div className="mb-2">
                                        <div className="flex justify-between items-baseline mb-0.5">
                                            <h3
                                                className="text-[13px] font-black text-slate-900 uppercase italic"
                                                {...editableProps(['experience', index, 'jobTitle'])}
                                            >
                                                {job.jobTitle}
                                            </h3>
                                            <span
                                                className="text-[9px] font-black px-2 py-0.5 rounded"
                                                style={{ backgroundColor: `${NAVY}10`, color: NAVY }}
                                                {...editableProps(['experience', index, 'dates'])}
                                            >
                                                {job.dates}
                                            </span>
                                        </div>
                                        <p
                                            className="text-[10px] font-bold text-slate-500 tracking-widest uppercase"
                                            {...editableProps(['experience', index, 'company'])}
                                        >
                                            {job.company}
                                        </p>
                                    </div>
                                    <ul className="space-y-2">
                                        {job.responsibilities.map((resp, i) => (
                                            <li key={i} className="flex gap-3 text-[11px] text-slate-700 leading-snug">
                                                <span className="mt-1 select-none font-bold" style={{ color: GOLD }}>✦</span>
                                                <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Right sidebar ── */}
                <div className="col-span-4 space-y-4">
                    <section>
                        <SectionHeading>Technical Arsenal</SectionHeading>
                        <div className="space-y-2">
                            {cvData.skills.slice(0, 14).map((skill, i) => (
                                <div key={i} className="flex items-center justify-between group cursor-default">
                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{skill}</span>
                                    <div
                                        className="h-[2px] w-6 transition-all group-hover:w-10"
                                        style={{ backgroundColor: `${GOLD}60` }}
                                    />
                                </div>
                            ))}
                            {cvData.skills.length > 14 && (
                                <p className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-200">
                                    +{cvData.skills.length - 14} more skills
                                </p>
                            )}
                        </div>
                    </section>

                    {cvData.publications && cvData.publications.length > 0 && (
                        <section>
                            <SectionHeading>Select Papers</SectionHeading>
                            <div className="space-y-4">
                                {cvData.publications.map((pub, idx) => (
                                    <div key={idx} className="space-y-0.5">
                                        <h3
                                            className="text-[11px] font-black text-slate-900 uppercase italic line-clamp-2"
                                            title={pub.title}
                                            {...editableProps(['publications', idx, 'title'])}
                                        >
                                            {pub.title}
                                        </h3>
                                        <p
                                            className="text-[9px] font-bold uppercase tracking-widest"
                                            style={{ color: NAVY }}
                                        >
                                            {pub.journal} / {pub.year}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {cvData.languages && cvData.languages.length > 0 && (
                        <section>
                            <SectionHeading>Linguistic Range</SectionHeading>
                            <div className="space-y-2">
                                {cvData.languages.map((lang, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                        <span className="text-[11px] font-bold text-slate-800 uppercase">{lang.name}</span>
                                        <span
                                            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                            style={{ backgroundColor: `${NAVY}10`, color: NAVY }}
                                        >
                                            {lang.proficiency}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </main>

            <footer
                className="mt-14 pt-6 flex justify-between items-center text-[9px] font-black uppercase tracking-[0.3em]"
                style={{ borderTop: `1px solid ${GOLD}30`, color: `${NAVY}50` }}
            >
                <span>Scholarship Ready · ProCV</span>
                <span>
                    {personalInfo.name.substring(0, 3).toUpperCase()}-
                    {String(personalInfo.name.length * 7 + personalInfo.email.length * 3).padStart(4, '0')}
                </span>

                <TemplateCustomSections
                    customSections={cvData.customSections}
                    references={cvData.references}
                    renderHeader={title => <SectionHeading>{title}</SectionHeading>}
                    sectionClassName="mb-6"
                    titleClass="font-semibold text-[11px]"
                    subtitleClass={`text-[10px]`}
                    descClass="text-[10px] text-slate-600 mt-0.5"
                    yearClass="text-[10px] text-slate-400"
                />
            </footer>

            {jobDescriptionForATS && (
                <HiddenATSKeywords text={jobDescriptionForATS} />
            )}
        </div>
    );
};

export default TemplateScholarshipPro;
