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

const TemplatePhotoSidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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
    className: "outline-none ring-1 ring-transparent focus:ring-orange-400 focus:bg-orange-50/30 rounded px-1 -mx-1 transition-all"
  } : {};

  const accentColor = cvData.accentColor ?? '#c8701a';
  const sidebarBg = '#f5f0e8';

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-5">
      <h2 className="text-xs font-black uppercase tracking-widest mb-2 pb-1 border-b border-zinc-400" style={{ color: '#333' }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const RightSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-5">
      <h2 className="text-sm font-black capitalize tracking-wide mb-2 pb-1 border-b border-zinc-300" style={{ color: '#222' }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const certifications = cvData.skills.slice(0, 5);
  const skills = cvData.skills;
  const memberships = cvData.languages && cvData.languages.length > 0
    ? cvData.languages.map(l => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`)
    : [];

  return (
    <div id="cv-preview-photo-sidebar" className="bg-white text-zinc-900 shadow-lg border font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${sidebarBg} 38%, white 38%)` }}>

        {/* Left Sidebar — background from parent gradient */}
        <div className="w-[38%] flex-shrink-0 p-5">

          {/* Photo + Name */}
          <div className="mb-5 flex flex-col items-center text-center">
            {personalInfo.photo ? (
              <img
                src={personalInfo.photo}
                alt={personalInfo.name}
                className="w-28 h-28 object-cover mb-3"
                style={{ border: `3px solid ${accentColor}` }}
              />
            ) : (
              <div
                className="w-28 h-28 flex items-center justify-center mb-3 text-white text-3xl font-bold"
                style={{ backgroundColor: accentColor }}
              >
                {personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <h1 className="text-lg font-black leading-tight text-zinc-900">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-xs font-semibold mt-0.5" style={{ color: accentColor }}>
                {cvData.experience[0].jobTitle}
              </p>
            )}
          </div>

          {/* Contact */}
          <SidebarSection title="Contact">
            <ul className="space-y-1.5 text-xs text-zinc-700">
              {personalInfo.phone && (
                <li className="flex items-center gap-1.5">
                  <span style={{ color: accentColor }}>📞</span>
                  {personalInfo.phone}
                </li>
              )}
              {personalInfo.email && (
                <li className="flex items-center gap-1.5">
                  <span style={{ color: accentColor }}>✉</span>
                  <span className="break-all">{personalInfo.email}</span>
                </li>
              )}
              {personalInfo.linkedin && (
                <li className="flex items-start gap-1.5">
                  <span style={{ color: accentColor }}>🔗</span>
                  <span className="break-all">{personalInfo.linkedin}</span>
                </li>
              )}
              {personalInfo.location && (
                <li className="flex items-center gap-1.5">
                  <span style={{ color: accentColor }}>📍</span>
                  {personalInfo.location}
                </li>
              )}
            </ul>
          </SidebarSection>

          {/* Summary */}
          {cvData.summary && (
            <SidebarSection title="Summary">
              <p className="text-xs leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </SidebarSection>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <SidebarSection title="Skills">
              <ul className="space-y-1">
                {skills.map((skill, i) => (
                  <li key={i} className="text-xs text-zinc-700 flex items-start gap-1.5">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                    <span {...editableProps(['skills', i])}>{skill}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Certifications & Licenses */}
          {certifications.length > 0 && (
            <SidebarSection title="Certifications &amp; Licenses">
              <ul className="space-y-1">
                {certifications.map((cert, i) => (
                  <li key={i} className="text-xs text-zinc-700 flex items-start gap-1.5">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                    <span>{cert}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Personal Attributes */}
          <SidebarSection title="Personal Attributes">
            <ul className="space-y-1">
              {['Results-driven and metrics-oriented', 'Exceptional communicator', 'Strategic thinker', 'Adaptable to fast-changing conditions', 'Team leader and mentor'].map((attr, i) => (
                <li key={i} className="text-xs text-zinc-700 flex items-start gap-1.5">
                  <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                  {attr}
                </li>
              ))}
            </ul>
          </SidebarSection>
        </div>

        {/* Right Main Content */}
        <div className="flex-1 p-6">

          {/* Education */}
          {cvData.education.length > 0 && (
            <RightSection title="Education">
              <div className="space-y-3">
                {cvData.education.map((edu, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-800 inline-block"></span>
                    <div>
                      <p className="text-xs font-bold leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-xs text-zinc-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                      <p className="text-xs text-zinc-500" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {/* Experience */}
          {cvData.experience.length > 0 && (
            <RightSection title="Experience">
              <div className="space-y-4">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group flex items-start gap-2">
                    <span className="mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                    <div className="flex-1">
                      {isEditing && (
                        <button
                          onClick={() => handleDeleteExperience(index)}
                          className="absolute -left-4 top-0 p-1 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                          title="Delete experience"
                        >
                          <Trash className="h-3 w-3" />
                        </button>
                      )}
                      <div className="flex justify-between items-baseline gap-2">
                        <h3 className="text-xs font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                        <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-600 mb-1" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                      <ul className="list-disc list-outside ml-3 space-y-0.5">
                        {job.responsibilities.map((resp, i) => (
                          <li key={i} className="text-xs text-zinc-700 leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {/* Professional Highlights */}
          {cvData.projects && cvData.projects.length > 0 && (
            <RightSection title="Professional Highlights &amp; Metrics">
              <ul className="space-y-1.5 list-disc list-outside ml-4">
                {cvData.projects.map((proj, index) => (
                  <li key={index} className="text-xs text-zinc-700 leading-snug">
                    <span className="font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}:</span>{' '}
                    <span dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  </li>
                ))}
              </ul>
            </RightSection>
          )}

          {/* Memberships */}
          {memberships.length > 0 && (
            <RightSection title="Memberships">
              <ul className="space-y-1">
                {memberships.map((m, i) => (
                  <li key={i} className="text-xs text-zinc-700 flex items-start gap-1.5">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full inline-block bg-zinc-500"></span>
                    {m}
                  </li>
                ))}
              </ul>
            </RightSection>
          )}

          {/* Publications */}
          {cvData.publications && cvData.publications.length > 0 && (
            <RightSection title="Publications">
              <div className="space-y-2">
                {cvData.publications.map((pub, index) => (
                  <div key={index}>
                    <p className="text-xs font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</p>
                    <p className="text-xs text-zinc-500 italic">
                      <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                    </p>
                  </div>
                ))}
              </div>
            </RightSection>
          )}
        </div>
      </div>

      
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-sm font-black capitalize tracking-wide mb-2 pb-1 border-b border-zinc-300" style={{ color: '#222' }}>{title}</h2>}
          sectionClassName="mt-5"
          titleClass="text-xs font-bold"
          subtitleClass="text-xs text-zinc-500"
          descClass="text-xs text-zinc-600 mt-0.5"
          yearClass="text-xs text-zinc-400"
        />
{jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplatePhotoSidebar;
