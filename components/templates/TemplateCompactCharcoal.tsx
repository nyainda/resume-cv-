import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
  sidebarSections?: SidebarSectionsVisibility;
}

// Compact Charcoal — bold geometric one-page layout. Charcoal sidebar with a
// thin vertical accent stripe, all-caps tracked headings, and compressed
// typography. Ideal for senior IC roles that want presence without sprawling
// onto a second page.
const TemplateCompactCharcoal: React.FC<TemplateProps> = ({
  cvData,
  personalInfo,
  isEditing,
  onDataChange,
  jobDescriptionForATS,
  sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
}) => {
  const accent = cvData.accentColor ?? '#d4af37';
  const charcoalBg = '#1a1a1a';

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
    className: "outline-none ring-1 ring-transparent focus:ring-amber-400 focus:bg-amber-50/10 rounded px-0.5 -mx-0.5 transition-all"
  } : {};

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
    <div id="cv-preview-compact-charcoal" className="bg-white shadow-lg border" style={{ fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${charcoalBg} 30%, white 30%)` }}>
        {/* Left Charcoal Sidebar with thin accent stripe */}
        <div className="w-[30%] flex-shrink-0 text-zinc-200 p-4 flex flex-col relative">
          {/* Vertical accent stripe — runs the full sidebar height for that
              "letterhead" feel without taking up content room. */}
          <div className="absolute top-0 right-0 bottom-0 w-0.5" style={{ backgroundColor: accent }} />

          <div className="mb-4 pb-3 border-b" style={{ borderColor: '#3a3a3a' }}>
            <h1 className="text-base font-black tracking-tight leading-tight uppercase text-white" style={{ letterSpacing: '0.02em' }}>{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[9px] mt-1 uppercase tracking-[0.18em] font-semibold" style={{ color: accent }}>{cvData.experience[0].jobTitle}</p>
            )}
          </div>

          <div className="space-y-3 flex-1">
            <section>
              <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Contact</h2>
              <ul className="space-y-0.5 text-[9.5px] break-words text-zinc-300">
                {personalInfo.email && <li>{personalInfo.email}</li>}
                {personalInfo.phone && <li>{personalInfo.phone}</li>}
                {personalInfo.location && <li>{personalInfo.location}</li>}
                {personalInfo.linkedin && <li className="truncate">{personalInfo.linkedin}</li>}
                {personalInfo.website && <li className="truncate">{personalInfo.website}</li>}
              </ul>
            </section>

            {cvData.skills.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Skills</h2>
                <div className="flex flex-wrap gap-1">
                  {cvData.skills.slice(0, 14).map((skill, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 border" style={{ borderColor: '#3a3a3a', color: '#e5e5e5' }} {...editableProps(['skills', i])}>{skill}</span>
                  ))}
                </div>
              </section>
            )}

            {cvData.education.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Education</h2>
                <div className="space-y-1.5">
                  {cvData.education.slice(0, 2).map((edu, index) => (
                    <div key={index} className="text-[9.5px]">
                      <p className="font-semibold text-white leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-[9px] text-zinc-400" {...editableProps(['education', index, 'school'])}>{edu.school} · {edu.year}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Languages</h2>
                <ul className="space-y-0.5 text-[9.5px] text-zinc-300">
                  {cvData.languages.map((lang, i) => (
                    <li key={i}>{lang.name} <span className="text-zinc-500">— {lang.proficiency}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Impact</h2>
                <ul className="space-y-1">
                  {keyAchievements.map((line, i) => (
                    <li key={i} className="text-[9.5px] text-zinc-300 leading-snug flex items-start gap-1.5">
                      <span className="flex-shrink-0 font-black" style={{ color: accent }}>+</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Featured</h2>
                <ul className="space-y-0.5">
                  {cvData.projects.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-[9.5px] text-zinc-300 leading-snug uppercase tracking-wider font-semibold">{p.name}</li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
              <section>
                <h2 className="text-[8px] font-black uppercase tracking-[0.25em] pb-0.5 mb-1.5" style={{ color: accent }}>Refs</h2>
                <p className="text-[9px] text-zinc-400 leading-snug">
                  {cvData.references.length} reference{cvData.references.length === 1 ? '' : 's'} on request
                </p>
              </section>
            )}
          </div>

          {/* Bottom anchor — bold geometric block + year */}
          <div className="mt-auto pt-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2" style={{ backgroundColor: accent }} />
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-500">{new Date().getFullYear()}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-5 py-4">
          <main className="space-y-3.5">
            {cvData.summary && (
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] pb-0.5 mb-1.5 border-b-2" style={{ color: charcoalBg, borderColor: charcoalBg }}>Summary</h2>
                <p className="text-[10px] leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] pb-0.5 mb-1.5 border-b-2" style={{ color: charcoalBg, borderColor: charcoalBg }}>Experience</h2>
              <div className="space-y-2.5">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-[10.5px] font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap flex-shrink-0" style={{ color: accent }} {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[9.5px] font-medium text-zinc-600 uppercase tracking-wider" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="mt-0.5 space-y-0.5 text-[9.5px] text-zinc-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} className="leading-snug flex items-start gap-1.5">
                          <span className="flex-shrink-0 mt-1 w-1 h-1" style={{ backgroundColor: accent }} />
                          <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] pb-0.5 mb-1.5 border-b-2" style={{ color: charcoalBg, borderColor: charcoalBg }}>Projects</h2>
                <div className="space-y-1.5">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-[10px] font-bold text-zinc-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-[9.5px] text-zinc-700 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      <TemplateCustomSections
        customSections={cvData.customSections}
        references={cvData.references}
        renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-[0.2em] pb-0.5 mb-1.5 border-b-2" style={{ color: charcoalBg, borderColor: charcoalBg }}>{title}</h2>}
        sectionClassName="mb-4 px-5"
        titleClass="font-bold text-[10.5px]"
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

export default TemplateCompactCharcoal;
