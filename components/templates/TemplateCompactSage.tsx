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

// Compact Sage — a warm, editorial single-page sidebar layout. Sage-green
// sidebar with serif headings (Georgia) and an italic mood that contrasts
// the clean sans-serif body. Tighter than the full-width sidebar templates;
// designed to land on a single A4 page even with 4-5 experience entries.
const TemplateCompactSage: React.FC<TemplateProps> = ({
  cvData,
  personalInfo,
  isEditing,
  onDataChange,
  jobDescriptionForATS,
  sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
}) => {
  const accent = cvData.accentColor ?? '#5b6f56';
  const sageBg = '#3d4f3a';

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
    className: "outline-none ring-1 ring-transparent focus:ring-emerald-400 focus:bg-emerald-50/30 rounded px-0.5 -mx-0.5 transition-all"
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

  const initials = (personalInfo.name || 'CV')
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <div id="cv-preview-compact-sage" className="bg-white shadow-lg border" style={{ fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${sageBg} 30%, white 30%)` }}>
        {/* Left Sage Sidebar */}
        <div className="w-[30%] flex-shrink-0 text-white p-4 flex flex-col">
          {/* Serif monogram instead of a photo — keeps it portable for any role */}
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold border"
              style={{
                borderColor: '#a3b598',
                color: '#a3b598',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold leading-tight text-white truncate" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{personalInfo.name}</h1>
              {cvData.experience.length > 0 && (
                <p className="text-[9px] mt-0.5 italic leading-snug truncate" style={{ color: '#a3b598' }}>{cvData.experience[0].jobTitle}</p>
              )}
            </div>
          </div>

          <div className="space-y-3 flex-1">
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Contact</h2>
              <ul className="space-y-0.5 text-[9.5px] break-words" style={{ color: '#d8e0d3' }}>
                {personalInfo.email && <li>{personalInfo.email}</li>}
                {personalInfo.phone && <li>{personalInfo.phone}</li>}
                {personalInfo.location && <li>{personalInfo.location}</li>}
                {personalInfo.linkedin && <li className="truncate">{personalInfo.linkedin}</li>}
              </ul>
            </section>

            {cvData.skills.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Expertise</h2>
                <ul className="space-y-0.5 text-[9.5px]" style={{ color: '#d8e0d3' }}>
                  {cvData.skills.slice(0, 12).map((skill, i) => (
                    <li key={i} className="leading-snug flex items-start gap-1.5">
                      <span className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full" style={{ backgroundColor: '#a3b598' }}></span>
                      <span {...editableProps(['skills', i])}>{skill}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {cvData.education.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Education</h2>
                <div className="space-y-1.5">
                  {cvData.education.slice(0, 2).map((edu, index) => (
                    <div key={index} className="text-[9.5px]">
                      <p className="font-semibold leading-snug text-white" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-[9px] italic" style={{ color: '#a3b598' }} {...editableProps(['education', index, 'school'])}>{edu.school}, {edu.year}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Languages</h2>
                <ul className="space-y-0.5 text-[9.5px]" style={{ color: '#d8e0d3' }}>
                  {cvData.languages.map((lang, i) => (
                    <li key={i}>{lang.name}<span style={{ color: '#a3b598' }}> · {lang.proficiency}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Highlights</h2>
                <ul className="space-y-1.5">
                  {keyAchievements.map((line, i) => (
                    <li key={i} className="text-[9px] leading-snug italic pl-2 border-l-2" style={{ color: '#d8e0d3', borderColor: '#a3b598', fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>Selected Work</h2>
                <ul className="space-y-0.5">
                  {cvData.projects.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-[9.5px] leading-snug" style={{ color: '#d8e0d3' }}>{p.name}</li>
                  ))}
                </ul>
              </section>
            )}

            {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
              <section>
                <h2 className="text-[8px] font-bold uppercase tracking-[0.18em] pb-0.5 mb-1.5 border-b" style={{ color: '#a3b598', borderColor: '#5d7058', fontFamily: 'Georgia, "Times New Roman", serif' }}>References</h2>
                <p className="text-[9px] italic leading-snug" style={{ color: '#d8e0d3', fontFamily: 'Georgia, "Times New Roman", serif' }}>
                  {cvData.references.length} available on request
                </p>
              </section>
            )}
          </div>

          {/* Decorative leaf-style anchor — single sage rule with a centered dot */}
          <div className="mt-auto pt-4 flex items-center gap-2">
            <div className="flex-1 h-px" style={{ backgroundColor: '#5d7058' }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#a3b598' }} />
            <div className="flex-1 h-px" style={{ backgroundColor: '#5d7058' }} />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-5 py-5">
          <main className="space-y-3.5">
            {cvData.summary && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-wider pb-0.5 mb-1 border-b" style={{ color: accent, borderColor: '#d4dcd0', fontFamily: 'Georgia, "Times New Roman", serif' }}>Profile</h2>
                <p className="text-[10px] leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b" style={{ color: accent, borderColor: '#d4dcd0', fontFamily: 'Georgia, "Times New Roman", serif' }}>Experience</h2>
              <div className="space-y-2.5">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-[10.5px] font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[9px] text-zinc-500 whitespace-nowrap flex-shrink-0 italic" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[9.5px] font-medium" style={{ color: accent }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-3.5 mt-0.5 space-y-0.5 text-[9.5px] text-zinc-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} className="leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-[10px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b" style={{ color: accent, borderColor: '#d4dcd0', fontFamily: 'Georgia, "Times New Roman", serif' }}>Projects</h2>
                <div className="space-y-1.5">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-[10px] font-semibold text-zinc-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
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
        renderHeader={title => <h2 className="text-[10px] font-bold uppercase tracking-wider pb-0.5 mb-1.5 border-b" style={{ color: accent, borderColor: '#d4dcd0', fontFamily: 'Georgia, "Times New Roman", serif' }}>{title}</h2>}
        sectionClassName="mb-4 px-5"
        titleClass="font-semibold text-[10.5px]"
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

export default TemplateCompactSage;
