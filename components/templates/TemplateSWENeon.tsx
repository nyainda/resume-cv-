import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

const LANG_KEYWORDS = ['javascript','typescript','python','java','c++','c#','go','rust','ruby','swift','kotlin','dart','php','scala','r','c','elixir','haskell'];
const FRAMEWORK_KEYWORDS = ['react','angular','vue','next','nuxt','svelte','express','fastapi','django','flask','spring','laravel','rails','nest','node','graphql','tailwind','redux'];
const CLOUD_KEYWORDS = ['aws','gcp','azure','cloud','lambda','ec2','s3','terraform','kubernetes','k8s','docker','ci/cd','devops','vercel','netlify','firebase'];
const TOOL_KEYWORDS = ['git','github','gitlab','jira','figma','postman','linux','bash','vim','vscode','jenkins','ansible','prometheus','grafana','datadog'];

function categorize(skills: string[]) {
    const cats: Record<string, string[]> = { Lang: [], Framework: [], Cloud: [], Tools: [], Other: [] };
    skills.forEach(skill => {
        const s = skill.toLowerCase();
        if (LANG_KEYWORDS.some(k => s.includes(k))) cats.Lang.push(skill);
        else if (FRAMEWORK_KEYWORDS.some(k => s.includes(k))) cats.Framework.push(skill);
        else if (CLOUD_KEYWORDS.some(k => s.includes(k))) cats.Cloud.push(skill);
        else if (TOOL_KEYWORDS.some(k => s.includes(k))) cats.Tools.push(skill);
        else cats.Other.push(skill);
    });
    return Object.entries(cats).filter(([, v]) => v.length > 0);
}

const GitHubIcon = () => (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
);

const ExternalIcon = () => (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
);

const TemplateSWENeon: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange }) => {
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
        style: { outline: 'none', borderBottom: '1px dashed rgba(34,211,238,0.4)', cursor: 'text' },
    } : {};

    const cats = categorize(cvData.skills || []);
    const initials = (personalInfo.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

    return (
        <div className="flex font-sans text-sm" style={{ minHeight: '297mm', background: '#0d1117', fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* SIDEBAR */}
            <aside className="w-[200px] flex-shrink-0 flex flex-col py-7 px-5 space-y-6" style={{ background: '#010409', minHeight: '297mm' }}>

                {/* Avatar */}
                <div className="text-center">
                    <div className="w-14 h-14 rounded-xl mx-auto mb-3 flex items-center justify-center text-xl font-black"
                        style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)', color: '#010409', boxShadow: '0 0 20px rgba(6,182,212,0.4)' }}>
                        {initials}
                    </div>
                    <h1 className="text-sm font-black leading-tight" style={{ color: '#e6edf3' }}>{personalInfo.name}</h1>
                    {cvData.experience[0] && (
                        <p className="text-[10px] font-semibold mt-1" style={{ color: '#06b6d4' }}>{cvData.experience[0].jobTitle}</p>
                    )}
                </div>

                {/* Contact */}
                <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.2)' }}>Contact</p>
                    <div className="space-y-1.5">
                        {[{ v: personalInfo.email, i: '✉' }, { v: personalInfo.phone, i: '📱' }, { v: personalInfo.location, i: '📍' }].map(x => x.v && (
                            <div key={x.v} className="flex items-start gap-1.5">
                                <span className="text-[9px] flex-shrink-0 mt-0.5">{x.i}</span>
                                <span className="text-[9px] break-all leading-tight" style={{ color: '#8b949e' }}>{x.v}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Links */}
                {(personalInfo.github || personalInfo.linkedin || personalInfo.website) && (
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.2)' }}>Links</p>
                        <div className="space-y-1.5">
                            {personalInfo.github && (
                                <div className="flex items-center gap-1.5">
                                    <span style={{ color: '#06b6d4' }}><GitHubIcon /></span>
                                    <span className="text-[9px] truncate" style={{ color: '#8b949e' }}>{personalInfo.github.replace('https://github.com/', '')}</span>
                                </div>
                            )}
                            {personalInfo.linkedin && (
                                <span className="text-[9px]" style={{ color: '#8b949e' }}>{personalInfo.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</span>
                            )}
                            {personalInfo.website && (
                                <span className="text-[9px]" style={{ color: '#8b949e' }}>{personalInfo.website.replace(/https?:\/\//, '')}</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Tech Stack */}
                {cats.length > 0 && (
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.2)' }}>Tech Stack</p>
                        <div className="space-y-3">
                            {cats.map(([cat, skills]) => (
                                <div key={cat}>
                                    <p className="text-[7px] font-bold uppercase tracking-wider mb-1" style={{ color: '#484f58' }}>{cat}</p>
                                    <div className="flex flex-wrap gap-0.5">
                                        {skills.slice(0, 7).map(s => (
                                            <span key={s} className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', color: '#22d3ee' }}>{s}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Education */}
                {cvData.education.length > 0 && (
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-2 pb-1 border-b" style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.2)' }}>Education</p>
                        {cvData.education.slice(0, 2).map((edu, i) => (
                            <div key={i} className="mb-2">
                                <p className="text-[10px] font-bold leading-tight" style={{ color: '#e6edf3' }} {...ed(['education', i, 'degree'])} dangerouslySetInnerHTML={{ __html: edu.degree }} />
                                <p className="text-[9px] mt-0.5" style={{ color: '#8b949e' }} {...ed(['education', i, 'school'])} dangerouslySetInnerHTML={{ __html: edu.school }} />
                                <p className="text-[9px]" style={{ color: '#06b6d4' }}>{edu.year}</p>
                            </div>
                        ))}
                    </div>
                )}
            </aside>

            {/* MAIN */}
            <main className="flex-1 py-7 px-8 space-y-6" style={{ background: '#0d1117' }}>

                {/* Summary */}
                {cvData.summary && (
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="font-black text-sm" style={{ color: '#06b6d4' }}>▶</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: '#484f58' }}>About</span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(6,182,212,0.15)' }} />
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: '#c9d1d9' }} {...ed(['summary'])} dangerouslySetInnerHTML={{ __html: cvData.summary }} />
                    </section>
                )}

                {/* Experience */}
                {cvData.experience.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="font-black text-sm" style={{ color: '#06b6d4' }}>▶</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: '#484f58' }}>Experience</span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(6,182,212,0.15)' }} />
                        </div>
                        <div className="space-y-5">
                            {cvData.experience.map((job, i) => (
                                <div key={i} className="pl-3" style={{ borderLeft: '2px solid rgba(6,182,212,0.2)' }}>
                                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-xs" style={{ color: '#e6edf3' }} {...ed(['experience', i, 'jobTitle'])} dangerouslySetInnerHTML={{ __html: job.jobTitle }} />
                                                {job.link && (
                                                    <a href={job.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[9px] font-semibold" style={{ color: '#06b6d4' }}>
                                                        <GitHubIcon /><span>View</span>
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#06b6d4' }} {...ed(['experience', i, 'company'])} dangerouslySetInnerHTML={{ __html: job.company }} />
                                        </div>
                                        <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ color: '#8b949e', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} {...ed(['experience', i, 'dates'])} dangerouslySetInnerHTML={{ __html: job.dates }} />
                                    </div>
                                    <ul className="space-y-0.5">
                                        {job.responsibilities.map((r, j) => (
                                            <li key={j} className="flex items-start gap-1.5 text-[10px] leading-relaxed" style={{ color: '#8b949e' }}>
                                                <span className="flex-shrink-0 font-black mt-0.5" style={{ color: '#06b6d4' }}>›</span>
                                                <span {...ed(['experience', i, 'responsibilities', j])} dangerouslySetInnerHTML={{ __html: r }} />
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
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="font-black text-sm" style={{ color: '#06b6d4' }}>▶</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: '#484f58' }}>Projects</span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(6,182,212,0.15)' }} />
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {cvData.projects.map((proj, i) => (
                                <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.12)' }}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <h3 className="font-bold text-xs font-mono" style={{ color: '#22d3ee' }} {...ed(['projects', i, 'name'])} dangerouslySetInnerHTML={{ __html: proj.name }} />
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {proj.link && (
                                                <a href={proj.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: '#06b6d4' }}>
                                                    <GitHubIcon /><span>GitHub</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[10px] leading-relaxed" style={{ color: '#8b949e' }} {...ed(['projects', i, 'description'])} dangerouslySetInnerHTML={{ __html: proj.description }} />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Languages */}
                {cvData.languages && cvData.languages.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="font-black text-sm" style={{ color: '#06b6d4' }}>▶</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: '#484f58' }}>Languages</span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(6,182,212,0.15)' }} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {cvData.languages.map((l, i) => (
                                <span key={i} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#c9d1d9' }}>
                                    {l.name} <span style={{ color: '#484f58' }}>· {l.proficiency}</span>
                                </span>
                            ))}
                        </div>
                    </section>
                )}
            
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <div className="flex items-center gap-3 mb-3"><h2 className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: '#22d3ee' }}>{title}</h2><div className="flex-1 h-px" style={{ background: 'rgba(6,182,212,0.15)' }} /></div>}
          sectionClassName="mt-5"
          titleClass="font-bold text-xs font-mono"
          subtitleClass="text-xs text-slate-400"
          descClass="text-xs text-slate-400 mt-0.5"
          yearClass="text-xs text-slate-500"
        />
</main>
        </div>
    );
};

export default TemplateSWENeon;
