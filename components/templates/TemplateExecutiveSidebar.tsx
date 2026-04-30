import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
  sidebarSections?: SidebarSectionsVisibility;
}

const SIDEBAR_BG = '#2e2510';

// Executive Sidebar — compact one-page edition. Same dark-brown + gold
// luxury aesthetic, photo avatar, italic-serif Notable Achievements and the
// "Est. YYYY" double-rule crest. Avatar shrunk from w-28 to w-20, sidebar
// trimmed from 38% to 32%, padding tightened, and every cap reduced so a
// typical CV lands on a single A4 page.
const TemplateExecutiveSidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, sidebarSections = DEFAULT_SIDEBAR_SECTIONS }) => {
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
    <section className="mb-3">
      <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] mb-1 pb-0.5"
        style={{ color: ACCENT, borderBottom: `1px solid ${ACCENT}40` }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const RightSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-3">
      <h2 className="text-[10px] font-bold uppercase tracking-wider mb-1 pb-0.5" style={{ color: SIDEBAR_BG, borderBottom: `1.5px solid ${SIDEBAR_BG}` }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const Dot = () => (
    <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: SIDEBAR_BG }} />
  );

  // Capped at 2 (vs 3) for the compact layout.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length)
      .slice(0, 2);
  })();

  return (
    <div id="cv-preview-executive-sidebar" className="bg-white text-zinc-900 shadow-xl border border-zinc-200"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${SIDEBAR_BG} 32%, white 32%)` }}>

        <div className="w-[32%] flex-shrink-0 px-4 py-4 flex flex-col">

          {/* Photo + Name — avatar shrunk from w-28 to w-20 */}
          <div className="flex flex-col items-center text-center mb-3">
            {personalInfo.photo ? (
              <img src={personalInfo.photo} alt={personalInfo.name}
                className="w-20 h-20 rounded-full object-cover mb-2"
                style={{ border: `2px solid ${ACCENT}` }} />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-2 text-2xl font-bold text-white"
                style={{ backgroundColor: ACCENT, border: `2px solid ${ACCENT}99` }}>
                {personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <h1 className="text-base font-black leading-tight text-white">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[9.5px] font-semibold mt-0.5" style={{ color: ACCENT }}>
                {cvData.experience[0].jobTitle}
              </p>
            )}
          </div>

          <SidebarSection title="Contact">
            <ul className="space-y-1 text-[9.5px] text-white/90">
              {personalInfo.phone && (
                <li className="flex items-center gap-1.5">
                  <span style={{ color: ACCENT }}>☎</span>{personalInfo.phone}
                </li>
              )}
              {personalInfo.email && (
                <li className="flex items-start gap-1.5">
                  <span style={{ color: ACCENT }}>@</span>
                  <span className="break-all">{personalInfo.email}</span>
                </li>
              )}
              {personalInfo.linkedin && (
                <li className="flex items-start gap-1.5">
                  <span style={{ color: ACCENT }}>in</span>
                  <span className="break-all">{personalInfo.linkedin}</span>
                </li>
              )}
              {personalInfo.location && (
                <li className="flex items-center gap-1.5">
                  <span style={{ color: ACCENT }}>📍</span>{personalInfo.location}
                </li>
              )}
              {personalInfo.website && (
                <li className="flex items-start gap-1.5">
                  <span style={{ color: ACCENT }}>🌐</span>
                  <span className="break-all">{personalInfo.website}</span>
                </li>
              )}
            </ul>
          </SidebarSection>

          {cvData.summary && (
            <SidebarSection title="Summary">
              <p className="text-[9.5px] leading-snug text-white/85"
                dangerouslySetInnerHTML={{ __html: cvData.summary }}
                {...editable(['summary'])} />
            </SidebarSection>
          )}

          {cvData.skills.length > 0 && (
            <SidebarSection title="Skills">
              <ul className="space-y-0.5">
                {cvData.skills.slice(0, 12).map((skill, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-white/90 leading-snug">
                    <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {skill}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Certifications">
              <ul className="space-y-0.5">
                {cvData.projects.slice(0, 3).map((proj, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-white/90 leading-snug">
                    <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {proj.name}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {cvData.languages && cvData.languages.length > 0 && (
            <SidebarSection title="Languages">
              <ul className="space-y-0.5">
                {cvData.languages.map((lang, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-white/90 leading-snug">
                    <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                    {lang.name}{lang.proficiency ? ` — ${lang.proficiency}` : ''}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Notable Achievements — italic serif with em-dash leaders. */}
          {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
            <SidebarSection title="Notable Achievements">
              <ul className="space-y-1.5">
                {keyAchievements.map((line, i) => (
                  <li
                    key={i}
                    className="text-[9.5px] text-white/85 leading-snug italic"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  >
                    <span style={{ color: ACCENT }}>—</span> {line}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Bottom-anchored gold crest — same double rule + "Est. YYYY". */}
          <div className="mt-auto pt-4">
            <div className="h-px" style={{ backgroundColor: ACCENT, opacity: 0.7 }} />
            <div className="h-px mt-0.5 mb-2" style={{ backgroundColor: ACCENT, opacity: 0.35 }} />
            <p
              className="text-[8px] text-center uppercase"
              style={{
                color: ACCENT,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '0.4em',
              }}
            >
              Est. {new Date().getFullYear()}
            </p>
          </div>
        </div>

        {/* ── Right Main Content ── */}
        <div className="flex-1 px-5 py-4">

          {cvData.education.length > 0 && (
            <RightSection title="Education">
              <div className="space-y-1.5">
                {cvData.education.slice(0, 2).map((edu, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <Dot />
                    <div>
                      <p className="text-[10.5px] font-bold leading-snug" style={{ color: SIDEBAR_BG }}
                        {...editable(['education', i, 'degree'])}>
                        {edu.degree}
                      </p>
                      <p className="text-[9.5px] text-zinc-600">
                        <span {...editable(['education', i, 'school'])}>{edu.school}</span>
                        {edu.year && <span className="ml-1 text-zinc-500">· {edu.year}</span>}
                      </p>
                      {edu.description && (
                        <p className="text-[9px] text-zinc-500 mt-0.5"
                          dangerouslySetInnerHTML={{ __html: edu.description }}
                          {...editable(['education', i, 'description'])} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {cvData.experience.length > 0 && (
            <RightSection title="Experience">
              <div className="space-y-2.5">
                {cvData.experience.map((job, i) => (
                  <div key={i} className="relative group">
                    {isEditing && (
                      <button onClick={() => handleDeleteExp(i)}
                        className="absolute -left-4 top-0 p-1 text-zinc-300 hover:text-red-500 transition-colors">
                        <Trash className="h-3 w-3" />
                      </button>
                    )}
                    <div className="flex items-start gap-1.5">
                      <Dot />
                      <div className="flex-1">
                        <div className="flex justify-between items-baseline flex-wrap gap-1">
                          <p className="text-[10.5px] font-bold" style={{ color: SIDEBAR_BG }}
                            {...editable(['experience', i, 'jobTitle'])}>
                            {job.jobTitle}
                          </p>
                          <span className="text-[9px] text-zinc-500 font-medium"
                            {...editable(['experience', i, 'dates'])}>
                            {job.dates}
                          </span>
                        </div>
                        <p className="text-[9.5px] font-semibold text-zinc-600 mb-0.5"
                          {...editable(['experience', i, 'company'])}>
                          {job.company}
                        </p>
                        <ul className="space-y-0.5">
                          {job.responsibilities.map((r, j) => (
                            <li key={j} className="flex items-start gap-1 text-[9.5px] text-zinc-700 leading-snug">
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

          {cvData.projects && cvData.projects.length > 0 && (
            <RightSection title="Highlights">
              <ul className="space-y-0.5">
                {cvData.projects.slice(0, 4).map((proj, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-zinc-700 leading-snug">
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
        </div>
      </div>

      <TemplateCustomSections
        customSections={cvData.customSections}
        references={cvData.references}
        renderHeader={title => <h2 className="text-[10px] font-bold uppercase tracking-wider mb-1 pb-0.5" style={{ color: SIDEBAR_BG, borderBottom: `1.5px solid ${SIDEBAR_BG}` }}>{title}</h2>}
        sectionClassName="mt-3 px-5"
        titleClass="text-[10px] font-bold"
        subtitleClass="text-[9.5px] text-zinc-500"
        descClass="text-[9.5px] text-zinc-600 mt-0.5"
        yearClass="text-[9px] text-zinc-400"
      />
      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateExecutiveSidebar;
