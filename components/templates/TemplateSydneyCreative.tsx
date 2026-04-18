import React, { useCallback } from 'react';
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

const TemplateSydneyCreative: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
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
        className: "outline-none ring-2 ring-orange-300 bg-orange-50 rounded"
    } : {};

    return (
        <div id="cv-preview-sydney-creative" className="bg-[#fff9f2] p-0 text-slate-900 shadow-2xl border-none font-sans overflow-hidden">
            <header className="relative bg-gradient-to-tr from-orange-400 via-pink-500 to-[#1B2B4B] p-20 text-white clip-path-header overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl animate-pulse" />
                <div className="relative z-10">
                    <h1 className="text-7xl font-black uppercase tracking-tighter leading-none mb-6 drop-shadow-lg">
                        Hello.<br />I'm {personalInfo.name.split(' ')[0]}.
                    </h1>
                    <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold uppercase tracking-widest bg-black/20 backdrop-blur-md px-6 py-3 rounded-full inline-flex">
                        <span>{personalInfo.email}</span>
                        <span>{personalInfo.location}</span>
                        {personalInfo.website && <a href={personalInfo.website} className="underline underline-offset-4">Portfolio</a>}
                    </div>
                </div>
            </header>

            <main className="grid grid-cols-12 gap-0">
                {/* Left Colorful Sidebar */}
                <div className="col-span-4 bg-slate-900 text-white p-12 space-y-16">
                    <section>
                        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-orange-400 mb-8">My Toolkit</h2>
                        <div className="flex flex-wrap gap-3">
                            {cvData.skills.slice(0, 15).map((skill, i) => (
                                <span key={i} className="px-4 py-2 bg-slate-800 text-sm font-bold rounded-lg border-b-4 border-orange-500 hover:-translate-y-1 transition-transform">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-pink-400 mb-8">Academic Base</h2>
                        <div className="space-y-10">
                            {cvData.education.map((edu, idx) => (
                                <div key={idx} className="relative pl-6 border-l-2 border-pink-500/30">
                                    <div className="absolute -left-[5px] top-0 w-2 h-2 bg-pink-500 rounded-full" />
                                    <h3 className="text-lg font-black leading-tight" {...editableProps(['education', idx, 'degree'])}>{edu.degree}</h3>
                                    <p className="text-sm font-bold text-pink-400 uppercase tracking-wider mt-1">{edu.school}</p>
                                    <p className="text-xs font-medium text-slate-500 mt-2 italic">{edu.year}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Right Main Content */}
                <div className="col-span-8 p-20 space-y-20">
                    <section>
                        <div className="relative">
                            <span className="text-[120px] font-black text-orange-500/5 absolute -top-20 -left-10 select-none">STORY</span>
                            <p className="text-3xl font-bold leading-tight tracking-tight text-slate-800 relative z-10" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[#1B2B4B] mb-12 flex items-center gap-4">
                            <span>The Experience</span>
                            <div className="h-2 w-2 rounded-full bg-[#1B2B4B]" />
                            <div className="flex-1 h-px bg-slate-200" />
                        </h2>
                        <div className="space-y-20">
                            {cvData.experience.map((job, index) => (
                                <div key={index} className="relative group">
                                    {isEditing && (
                                        <button
                                            onClick={() => handleDeleteExperience(index)}
                                            className="absolute -left-16 top-0 p-3 bg-pink-500 text-white rounded-2xl shadow-xl hover:rotate-12 transition-transform"
                                        >
                                            <Trash className="h-5 w-5" />
                                        </button>
                                    )}
                                    <div className="grid grid-cols-12 gap-8">
                                        <div className="col-span-3">
                                            <span className="text-sm font-black uppercase text-[#C9A84C] tracking-widest block mb-1" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                                            <h3 className="text-sm font-black text-slate-900 border-l-4 border-[#1B2B4B] pl-4 py-2 bg-slate-50" {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                                        </div>
                                        <div className="col-span-9">
                                            <h4 className="text-3xl font-black tracking-tighter text-slate-900 mb-6 italic underline decoration-orange-400 decoration-8 underline-offset-[-2px] decoration-skip-ink" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h4>
                                            <ul className="space-y-4">
                                                {job.responsibilities.map((resp, i) => (
                                                    <li key={i} className="text-lg font-medium text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <footer className="bg-orange-400 p-12 text-center">
                <p className="text-3xl font-black uppercase tracking-tighter text-white">Let's Create Something Epic.</p>
            </footer>

            
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[#1B2B4B] mb-4">{title}</h2>}
          sectionClassName="mb-8"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-slate-500"
          descClass="text-xs text-slate-600 mt-0.5"
          yearClass="text-xs text-slate-400"
        />
{jobDescriptionForATS && (
                <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
                    {jobDescriptionForATS}
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .clip-path-header {
            clip-path: polygon(0 0, 100% 0, 100% 85%, 0 100%);
        }
      `}} />
        </div>
    );
};

export default TemplateSydneyCreative;
