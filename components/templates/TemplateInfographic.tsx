import React, { useCallback } from 'react';
import { CVData, PersonalInfo } from '../../types';
import { Mail, Phone, MapPin, Linkedin, Github } from 'lucide-react';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const proficiencyToWidth = (proficiency: string): string => {
    const p = proficiency.toLowerCase();
    if (p.includes('native') || p.includes('fluent')) return '100%';
    if (p.includes('proficient') || p.includes('advanced')) return '85%';
    if (p.includes('intermediate') || p.includes('conversational')) return '60%';
    return '40%';
}

const TemplateInfographic: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  
  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      handleUpdate(path, e.currentTarget.innerHTML);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};
  
  const Section: React.FC<{title: string; children: React.ReactNode; icon?: React.ReactNode}> = ({ title, children, icon }) => (
    <section className="mb-6">
      <h2 className="text-xl font-bold text-blue-800 flex items-center gap-2 mb-3">
        {icon}
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );

  return (
    <div id="cv-preview-infographic" className="bg-white shadow-lg border font-['Inter'] grid grid-cols-12 min-h-[842pt]">
        {/* Sidebar */}
        <div className="col-span-4 bg-slate-100 p-8">
            <div className="flex flex-col items-center text-center">
                <div className="w-36 h-36 bg-blue-300 rounded-full mb-4 flex items-center justify-center border-4 border-white shadow-md">
                    <span className="text-blue-800 text-6xl font-bold">{personalInfo.name.charAt(0)}</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tighter text-slate-800">{personalInfo.name}</h1>
            </div>
            <hr className="my-6" />
            <div className="space-y-6">
                <Section title="Contact">
                    <ul className="space-y-3 text-sm text-slate-700">
                        <li className="flex items-center gap-2"><Mail size={16} className="text-blue-600" /> {personalInfo.email}</li>
                        <li className="flex items-center gap-2"><Phone size={16} className="text-blue-600" /> {personalInfo.phone}</li>
                        <li className="flex items-center gap-2"><MapPin size={16} className="text-blue-600" /> {personalInfo.location}</li>
                        <li className="flex items-center gap-2"><Linkedin size={16} className="text-blue-600" /> <a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>
                        <li className="flex items-center gap-2"><Github size={16} className="text-blue-600" /> <a href={personalInfo.github} className="underline">GitHub</a></li>
                    </ul>
                </Section>
                <Section title="Skills">
                    <div className="space-y-3">
                        {cvData.skills.slice(0, 6).map((skill, i) => (
                            <div key={i} className="text-sm">
                                <p className="font-medium mb-1">{skill}</p>
                                <div className="w-full bg-slate-300 rounded-full h-1.5">
                                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${95 - i*7}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
                 {cvData.languages && cvData.languages.length > 0 && (
                     <Section title="Languages">
                         <div className="space-y-3">
                            {cvData.languages.map((lang, i) => (
                                <div key={i} className="text-sm">
                                    <p className="font-medium mb-1">{lang.name}</p>
                                    <div className="w-full bg-slate-300 rounded-full h-1.5">
                                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: proficiencyToWidth(lang.proficiency) }}></div>
                                    </div>
                                </div>
                            ))}
                         </div>
                    </Section>
                 )}
            </div>
        </div>

        {/* Main Content */}
        <div className="col-span-8 p-10 text-slate-800">
            <main>
                 <section className="mb-6">
                    <p className="text-base leading-relaxed bg-blue-50 border-l-4 border-blue-500 p-4" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
                </section>
                
                <Section title="Experience">
                    <div className="space-y-6">
                        {cvData.experience.map((job, index) => (
                        <div key={index}>
                            <div className="flex justify-between items-baseline">
                                <h3 className="text-lg font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                                <p className="text-sm font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                            </div>
                            <p className="text-md font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                            <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-base">
                            {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                            </ul>
                        </div>
                        ))}
                    </div>
                </Section>
            </main>
        </div>
      {jobDescriptionForATS && (
          <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
            {jobDescriptionForATS}
          </div>
        )}
    </div>
  );
};

export default TemplateInfographic;