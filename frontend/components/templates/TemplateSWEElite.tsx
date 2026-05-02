import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';

interface TemplateProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    isEditing: boolean;
    onDataChange: (newData: CVData) => void;
    jobDescriptionForATS: string;
}

// ── Skill category auto-detection ─────────────────────────────────────────────
const LANG_KEYWORDS = ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'swift', 'kotlin', 'dart', 'php', 'scala', 'r', 'matlab', 'c', 'elixir', 'haskell', 'lua'];
const FRAMEWORK_KEYWORDS = ['react', 'angular', 'vue', 'next', 'nuxt', 'svelte', 'express', 'fastapi', 'django', 'flask', 'spring', 'laravel', 'rails', 'nest', 'node', 'graphql', 'trpc', 'tailwind', 'redux', 'mobx'];
const CLOUD_KEYWORDS = ['aws', 'gcp', 'azure', 'cloud', 'lambda', 'ec2', 's3', 'gke', 'terraform', 'kubernetes', 'k8s', 'docker', 'ci/cd', 'devops', 'vercel', 'netlify', 'cloudflare', 'heroku', 'firebase'];
const TOOL_KEYWORDS = ['git', 'github', 'gitlab', 'jira', 'figma', 'postman', 'linux', 'bash', 'vim', 'vscode', 'intellij', 'xcode', 'jenkins', 'ansible', 'prometheus', 'grafana', 'datadog', 'sentry'];

function categorizeSkills(skills: string[]) {
    const categories: Record<string, string[]> = { Languages: [], Frameworks: [], Cloud: [], Tools: [], Other: [] };
    skills.forEach(skill => {
        const s = skill.toLowerCase();
        if (LANG_KEYWORDS.some(k => s.includes(k))) categories.Languages.push(skill);
        else if (FRAMEWORK_KEYWORDS.some(k => s.includes(k))) categories.Frameworks.push(skill);
        else if (CLOUD_KEYWORDS.some(k => s.includes(k))) categories.Cloud.push(skill);
        else if (TOOL_KEYWORDS.some(k => s.includes(k))) categories.Tools.push(skill);
        else categories.Other.push(skill);
    });
    return Object.entries(categories).filter(([, v]) => v.length > 0);
}

// ── Template ──────────────────────────────────────────────────────────────────

const TemplateSWEElite: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange }) => {
    const accent = cvData.accentColor ?? '#10b981';

    const handleUpdate = useCallback((path: (string | number)[], value: any) => {
        const newCvData = JSON.parse(JSON.stringify(cvData));
        let current: any = newCvData;
        for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
        current[path[path.length - 1]] = value;
        onDataChange(newCvData);
    }, [cvData, onDataChange]);

    const editable = (path: (string | number)[]) => isEditing ? {
        contentEditable: true,
        suppressContentEditableWarning: true,
        onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
        style: { outline: 'none', borderBottom: '1px dashed rgba(16,185,129,0.4)', cursor: 'text' },
    } : {};

    const skillCategories = categorizeSkills(cvData.skills || []);

    const initials = personalInfo.name
        ? personalInfo.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : '??';

    return (
        <div id="cv-preview-swe-elite" className="bg-white flex font-sans text-sm" style={{ minHeight: '297mm', fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* ── LEFT SIDEBAR ── */}
            <aside className="w-[220px] flex-shrink-0 bg-[#0f172a] text-white flex flex-col py-8 px-6 space-y-7" style={{ minHeight: '297mm' }}>

                {/* Avatar + Name */}
                <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-3 ring-4" style={{ backgroundColor: accent, ringColor: accent + '4d' }}>
                        {initials}
                    </div>
                    <h1 className="text-lg font-black leading-tight text-white">{personalInfo.name}</h1>
                    {cvData.experience[0] && (
                        <p className="text-xs font-semibold mt-1" style={{ color: accent }}>{cvData.experience[0].jobTitle}</p>
                    )}
                </div>

                {/* Contact */}
                <div className="space-y-2">
                    <h2 className="text-[9px] font-black uppercase tracking-[0.15em] border-b pb-1.5" style={{ color: accent, borderColor: accent + '4d' }}>Contact</h2>
                    {[
                        { label: personalInfo.email, icon: '✉' },
                        { label: personalInfo.phone, icon: '📱' },
                        { label: personalInfo.location, icon: '📍' },
                    ].map(item => item.label && (
                        <div key={item.label} className="flex items-start gap-1.5">
                            <span className="text-[10px] mt-0.5 flex-shrink-0">{item.icon}</span>
                            <span className="text-[10px] text-slate-300 break-all leading-tight">{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* Links */}
                {(personalInfo.github || personalInfo.linkedin || personalInfo.website) && (
                    <div className="space-y-2">
                        <h2 className="text-[9px] font-black uppercase tracking-[0.15em] border-b pb-1.5" style={{ color: accent, borderColor: accent + '4d' }}>Links</h2>
                        {personalInfo.github && (
                            <div className="flex items-center gap-1.5">
                                <svg className="w-2.5 h-2.5 flex-shrink-0" style={{ color: accent }} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                                <span className="text-[10px] text-slate-300 truncate leading-tight">{personalInfo.github.replace('https://github.com/', '')}</span>
                            </div>
                        )}
                        {personalInfo.linkedin && (
                            <div className="flex items-center gap-1.5">
                                <svg className="w-2.5 h-2.5 flex-shrink-0" style={{ color: accent }} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                                <span className="text-[10px] text-slate-300 truncate leading-tight">{personalInfo.linkedin.replace('https://www.linkedin.com/in/', '').replace('https://linkedin.com/in/', '')}</span>
                            </div>
                        )}
                        {personalInfo.website && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px]" style={{ color: accent }}>🌐</span>
                                <span className="text-[10px] text-slate-300 truncate leading-tight">{personalInfo.website.replace('https://', '').replace('http://', '')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Skills by category */}
                {skillCategories.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-[9px] font-black uppercase tracking-[0.15em] border-b pb-1.5" style={{ color: accent, borderColor: accent + '4d' }}>Tech Stack</h2>
                        {skillCategories.map(([cat, skills]) => (
                            <div key={cat}>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{cat}</p>
                                <div className="flex flex-wrap gap-1">
                                    {skills.slice(0, 8).map(skill => (
                                        <span key={skill} className="text-[8px] px-1.5 py-0.5 rounded font-mono font-semibold leading-tight" style={{ color: accent, backgroundColor: accent + '1a', border: `1px solid ${accent}4d` }}>
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Education on sidebar */}
                {cvData.education.length > 0 && (
                    <div className="space-y-2">
                        <h2 className="text-[9px] font-black uppercase tracking-[0.15em] border-b pb-1.5" style={{ color: accent, borderColor: accent + '4d' }}>Education</h2>
                        {cvData.education.slice(0, 2).map((edu, i) => (
                            <div key={i}>
                                <p className="text-[10px] font-bold text-white leading-tight" {...editable(['education', i, 'degree'])} dangerouslySetInnerHTML={{ __html: edu.degree }} />
                                <p className="text-[9px] text-slate-400 mt-0.5" {...editable(['education', i, 'school'])} dangerouslySetInnerHTML={{ __html: edu.school }} />
                                <p className="text-[9px]" style={{ color: accent + 'cc' }}>{edu.year}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Languages */}
                {cvData.languages && cvData.languages.length > 0 && (
                    <div className="space-y-2">
                        <h2 className="text-[9px] font-black uppercase tracking-[0.15em] border-b pb-1.5" style={{ color: accent, borderColor: accent + '4d' }}>Languages</h2>
                        {cvData.languages.map((lang, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-300">{lang.name}</span>
                                <span className="text-[9px] font-semibold" style={{ color: accent + 'cc' }}>{lang.proficiency}</span>
                            </div>
                        ))}
                    </div>
                )}
            </aside>

            {/* ── MAIN CONTENT ── */}
            <main className="flex-1 py-8 px-8 space-y-7">

                {/* Summary */}
                {cvData.summary && (
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="font-black text-base" style={{ color: accent }}>&gt;</span>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">About</h2>
                            <div className="flex-1 h-px bg-slate-100" />
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed"
                            {...editable(['summary'])}
                            dangerouslySetInnerHTML={{ __html: cvData.summary }}
                        />
                    </section>
                )}

                {/* Experience */}
                {cvData.experience.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="font-black text-base" style={{ color: accent }}>&gt;</span>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Experience</h2>
                            <div className="flex-1 h-px bg-slate-100" />
                        </div>
                        <div className="space-y-5">
                            {cvData.experience.map((job, i) => (
                                <div key={i} className="relative pl-4 border-l-2 transition-colors" style={{ borderColor: accent + '33' }}>
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-sm leading-tight"
                                                {...editable(['experience', i, 'jobTitle'])}
                                                dangerouslySetInnerHTML={{ __html: job.jobTitle }}
                                            />
                                            <p className="font-semibold text-xs mt-0.5" style={{ color: accent }}
                                                {...editable(['experience', i, 'company'])}
                                                dangerouslySetInnerHTML={{ __html: job.company }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0"
                                            {...editable(['experience', i, 'dates'])}
                                            dangerouslySetInnerHTML={{ __html: job.dates }}
                                        />
                                    </div>
                                    <ul className="mt-2 space-y-1">
                                        {job.responsibilities.map((resp, j) => (
                                            <li key={j} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                                                <span className="mt-0.5 font-black flex-shrink-0" style={{ color: accent }}>▸</span>
                                                <span {...editable(['experience', i, 'responsibilities', j])} dangerouslySetInnerHTML={{ __html: resp }} />
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
                        <div className="flex items-center gap-2 mb-4">
                            <span className="font-black text-base" style={{ color: accent }}>&gt;</span>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Projects</h2>
                            <div className="flex-1 h-px bg-slate-100" />
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {cvData.projects.map((proj, i) => (
                                <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-emerald-200 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-slate-900 text-sm font-mono capitalize"
                                            {...editable(['projects', i, 'name'])}
                                            dangerouslySetInnerHTML={{ __html: proj.name }}
                                        />
                                        {proj.link && (
                                            <a href={proj.link} target="_blank" rel="noopener noreferrer"
                                                className="text-[9px] font-bold hover:underline flex-shrink-0 flex items-center gap-0.5" style={{ color: accent }}>
                                                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                                                GitHub
                                            </a>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed"
                                        {...editable(['projects', i, 'description'])}
                                        dangerouslySetInnerHTML={{ __html: proj.description }}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};

export default TemplateSWEElite;
