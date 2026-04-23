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

const SIDEBAR_BG = '#2e2510';
const ACCENT    = '#c8a84b';

const TemplateExecutiveSidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  // Allow accent color override from cvData — shadows module-level constant
  // eslint-disable-next-line no-shadow
  const ACCENT = cvData.accentColor ?? '#c8a84b';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let cur: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const handleDeleteExp = (i: number) => {
    const d = JSON.parse(JSON.stringify(cvData));
    d.experience.splice(i, 1);
    onDataChange(d);
  };

  const editable = (path: (string | number)[]) => isEditing ? {
    contentEditable: true as const,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
    className: 'outline-none ring-1 ring-transparent focus:ring-amber-400/50 focus:bg-amber-50/10 rounded px-0.5 -mx-0.5 transition-all',
  } : {};

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-4">
      <h2 className="text-[10px] font-bold uppercase tracking-widest mb-1.5 pb-1"
        style={{ color: ACCENT, borderBottom: `1px solid ${ACCENT}40` }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const RightSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-4">
      <h2 className="text-sm font-bold mb-2 pb-1" style={{ color: SIDEBAR_BG, borderBottom: `2px solid ${SIDEBAR_BG}` }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const Dot = () => (
    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: SIDEBAR_BG }} />
  );

  return (
    <div id="cv-preview-executive-sidebar" className="bg-white text-zinc-900 shadow-xl border border-zinc-200"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${SIDEBAR_BG} 38%, white 38%)` }}>

        {/* ── Left Sidebar — background from parent gradient ── */}
        <div className="w-[38%] flex-shrink-0 px-5 py-6">

          {/* Photo + Name */}
          <div className="flex flex-col items-center text-center mb-5">
            {personalInfo.photo ? (
              <img src={personalInfo.photo} alt={personalInfo.name}
                className="w-28 h-28 rounded-full object-cover mb-3 ring-4"
                style={{ ringColor: ACCENT, border: `3px solid ${ACCENT}` }} />
            ) : (
              <div className="w-28 h-28 rounded-full flex items-center justify-center mb-3 text-3xl font-bold text-white"
                style={{ backgroundColor: ACCENT, border: `3px solid ${ACCENT}99` }}>
                {personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <h1 className="text-lg font-black leading-tight text-white">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[11px] font-semibold mt-1" style={{ color: ACCENT }}>
                {cvData.experience[0].jobTitle}
              </p>
            )}
          </div>

          {/* Contact */}
          <SidebarSection title="Contact">
            <ul className="space-y-1.5 text-[11px] text-white/90">
              {personalInfo.phone && (
                <li className="flex items-center gap-2">
                  <span style={{ color: ACCENT }}>☎</span>{personalInfo.phone}
                </li>
              )}
              {personalInfo.email && (
                <li className="flex items-start gap-2">
                  <span style={{ color: ACCENT }}>@</span>
                  <span className="break-all">{personalInfo.email}</span>
                </li>
              )}
              {personalInfo.linkedin && (
                <li className="flex items-start gap-2">
                  <span style={{ color: ACCENT }}>in</span>
                  <span className="break-all">{personalInfo.linkedin}</span>
                </li>
              )}
              {personalInfo.location && (
                <li className="flex items-center gap-2">
                  <span style={{ color: ACCENT }}>📍</span>{personalInfo.location}
                </li>
              )}
              {personalInfo.website && (
                <li className="flex items-start gap-2">
                  <span style={{ color: ACCENT }}>🌐</span>
                  <span className="break-all">{personalInfo.website}</span>
                </li>
              )}
            </ul>
          </SidebarSection>

          {/* Summary */}
          {cvData.summary && (
            <SidebarSection title="Summary">
              <p className="text-[11px] leading-relaxed text-white/85"
                dangerouslySetInnerHTML={{ __html: cvData.summary }}
                {...editable(['summary'])} />
            </SidebarSection>
          )}

          {/* Skills */}
          {cvData.skills.length > 0 && (
            <SidebarSection title="Skills">
              <ul className="space-y-1">
                {cvData.skills.map((skill, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-white/90">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {skill}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Certifications */}
          {cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Certifications &amp; Licenses">
              <ul className="space-y-1">
                {cvData.projects.map((proj, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-white/90">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {proj.name}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Languages → Personal Attributes */}
          {cvData.languages && cvData.languages.length > 0 && (
            <SidebarSection title="Personal Attributes">
              <ul className="space-y-1">
                {cvData.languages.map((lang, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-white/90">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {lang.name}{lang.proficiency ? ` — ${lang.proficiency}` : ''}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}
        </div>

        {/* ── Right Main Content ── */}
        <div className="flex-1 px-6 py-6">

          {/* Education */}
          {cvData.education.length > 0 && (
            <RightSection title="Education">
              <div className="space-y-3">
                {cvData.education.map((edu, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Dot />
                    <div>
                      <p className="text-[12px] font-bold leading-snug" style={{ color: SIDEBAR_BG }}
                        {...editable(['education', i, 'degree'])}>
                        {edu.degree}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        <span {...editable(['education', i, 'school'])}>{edu.school}</span>
                        {edu.year && <span className="ml-1 text-zinc-500">· {edu.year}</span>}
                      </p>
                      {edu.description && (
                        <p className="text-[10.5px] text-zinc-500 mt-0.5"
                          dangerouslySetInnerHTML={{ __html: edu.description }}
                          {...editable(['education', i, 'description'])} />
                      )}
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
                {cvData.experience.map((job, i) => (
                  <div key={i} className="relative group">
                    {isEditing && (
                      <button onClick={() => handleDeleteExp(i)}
                        className="absolute -left-4 top-0 p-1 text-zinc-300 hover:text-red-500 transition-colors">
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="flex items-start gap-2">
                      <Dot />
                      <div className="flex-1">
                        <div className="flex justify-between items-baseline flex-wrap gap-1">
                          <p className="text-[12px] font-bold" style={{ color: SIDEBAR_BG }}
                            {...editable(['experience', i, 'jobTitle'])}>
                            {job.jobTitle}
                          </p>
                          <span className="text-[10.5px] text-zinc-500 font-medium"
                            {...editable(['experience', i, 'dates'])}>
                            {job.dates}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-zinc-600 mb-1"
                          {...editable(['experience', i, 'company'])}>
                          {job.company}
                        </p>
                        <ul className="space-y-0.5">
                          {job.responsibilities.map((r, j) => (
                            <li key={j} className="flex items-start gap-1.5 text-[11px] text-zinc-700 leading-snug">
                              <span className="flex-shrink-0 mt-1 text-zinc-400">•</span>
                              <span dangerouslySetInnerHTML={{ __html: r }}
                                {...editable(['experience', i, 'responsibilities', j])} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {/* Professional Highlights (certifications re-used as highlights) */}
          {cvData.projects && cvData.projects.length > 0 && (
            <RightSection title="Professional Highlights &amp; Metrics">
              <ul className="space-y-1">
                {cvData.projects.map((proj, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-700">
                    <Dot />
                    <span>
                      <span className="font-semibold">{proj.name}</span>
                      {proj.description && <span> — {proj.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </RightSection>
          )}

          {/* Memberships */}
          {cvData.languages && cvData.languages.length > 0 && (
            <RightSection title="Memberships">
              <ul className="space-y-1">
                {cvData.languages.map((lang, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-700">
                    <Dot />
                    <span>{lang.name}{lang.proficiency ? ` (${lang.proficiency})` : ''}</span>
                  </li>
                ))}
              </ul>
            </RightSection>
          )}
        </div>
      </div>

      
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-sm font-bold mb-2 pb-1" style={{ color: SIDEBAR_BG, borderBottom: `2px solid ${SIDEBAR_BG}` }}>{title}</h2>}
          sectionClassName="mt-5"
          titleClass="text-xs font-bold"
          subtitleClass="text-xs text-zinc-500"
          descClass="text-xs text-zinc-600 mt-0.5"
          yearClass="text-xs text-zinc-400"
        />
{/* ATS hidden keywords */}
      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-px h-px overflow-hidden text-white text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateExecutiveSidebar;
