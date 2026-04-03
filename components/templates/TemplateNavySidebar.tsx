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

const TemplateNavySidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/10 rounded px-1 -mx-1 transition-all"
  } : {};

  const navyBg = '#1a2f5a';

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-6">
      <h2 style={{ color: '#7fa8d8', borderBottomColor: '#3a5a8a' }} className="text-xs font-bold uppercase tracking-widest border-b pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );

  const certifications = cvData.skills.slice(0, 6);
  const skills = cvData.skills.slice(6);
  const memberships = cvData.languages && cvData.languages.length > 0
    ? cvData.languages.map(l => l.name)
    : [];

  return (
    <div id="cv-preview-navy-sidebar" className="bg-white text-zinc-900 shadow-lg border font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]">
        {/* Left Navy Sidebar */}
        <div className="w-[35%] text-white p-6 flex-shrink-0" style={{ backgroundColor: navyBg }}>

          <SidebarSection title="Education">
            <div className="space-y-4">
              {cvData.education.map((edu, index) => (
                <div key={index} className="text-sm">
                  <p className="font-bold leading-snug text-white" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                  <p className="text-blue-200 text-xs mt-0.5" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-blue-300 text-xs" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Certificates &amp; Licenses">
            <ul className="space-y-1.5">
              {certifications.map((cert, i) => (
                <li key={i} className="text-xs text-blue-100 flex items-start gap-1.5">
                  <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                  <span {...editableProps(['skills', i])}>{cert}</span>
                </li>
              ))}
            </ul>
          </SidebarSection>

          <SidebarSection title="Skills">
            <ul className="space-y-1.5">
              {skills.map((skill, i) => (
                <li key={i} className="text-xs text-blue-100 flex items-start gap-1.5">
                  <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                  <span {...editableProps(['skills', certifications.length + i])}>{skill}</span>
                </li>
              ))}
            </ul>
          </SidebarSection>

          {memberships.length > 0 && (
            <SidebarSection title="Membership">
              <ul className="space-y-1.5">
                {memberships.map((m, i) => (
                  <li key={i} className="text-xs text-blue-100 flex items-start gap-1.5">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}
        </div>

        {/* Right Main Content */}
        <div className="flex-1 p-8">
          {/* Name Header */}
          <header className="mb-6 pb-4 border-b-2" style={{ borderColor: navyBg }}>
            <h1 className="text-4xl font-black uppercase tracking-wide" style={{ color: navyBg, letterSpacing: '0.04em' }}>
              {personalInfo.name}
            </h1>
            {cvData.summary && (
              <p className="text-sm font-semibold text-zinc-500 mt-1 italic">
                {personalInfo.location || ''}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 mt-2">
              {personalInfo.phone && <span>Phone: {personalInfo.phone}</span>}
              {personalInfo.email && <span>Email: {personalInfo.email}</span>}
              {personalInfo.location && <span>{personalInfo.location}</span>}
            </div>
          </header>

          {/* Profile Summary */}
          {cvData.summary && (
            <section className="mb-6">
              <h2 className="text-sm font-black uppercase tracking-widest mb-2 pb-1 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Profile Summary
              </h2>
              <p className="text-xs leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>
          )}

          {/* Experience */}
          {cvData.experience.length > 0 && (
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest mb-3 pb-1 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Experience
              </h2>
              <div className="space-y-5">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group">
                    {isEditing && (
                      <button
                        onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-6 top-0 p-1 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                        title="Delete experience"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    )}
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-sm font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                    </div>
                    <p className="text-xs font-semibold mb-1" style={{ color: navyBg }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 space-y-0.5">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} className="text-xs text-zinc-700 leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {cvData.projects && cvData.projects.length > 0 && (
            <section className="mt-5">
              <h2 className="text-sm font-black uppercase tracking-widest mb-2 pb-1 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Projects
              </h2>
              <div className="space-y-3">
                {cvData.projects.map((proj, index) => (
                  <div key={index}>
                    <p className="text-xs font-bold" {...editableProps(['projects', index, 'name'])}>{proj.name}</p>
                    <p className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateNavySidebar;
