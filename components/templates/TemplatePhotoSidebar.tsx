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

// Photo Sidebar — compact one-page edition. Same warm magazine-style cream
// sidebar with photo avatar, italic-serif Career Highlights pull-quotes,
// uppercase Featured Work bullets and the "Portfolio · MMM YYYY" stamp. Photo
// shrunk from w-28 to w-20, sidebar width trimmed from 38% to 32%.
const TemplatePhotoSidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, sidebarSections = DEFAULT_SIDEBAR_SECTIONS }) => {

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
    className: "outline-none ring-1 ring-transparent focus:ring-orange-400 focus:bg-orange-50/30 rounded px-0.5 -mx-0.5 transition-all"
  } : {};

  const accentColor = cvData.accentColor ?? '#c8701a';
  const sidebarBg = '#f5f0e8';

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-3">
      <h2 className="text-[8px] font-black uppercase tracking-[0.18em] mb-1 pb-0.5 border-b border-zinc-400" style={{ color: '#333' }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const RightSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-3">
      <h2 className="text-[10px] font-black uppercase tracking-wide mb-1 pb-0.5 border-b border-zinc-300" style={{ color: '#222' }}>
        {title}
      </h2>
      {children}
    </section>
  );

  const certifications = cvData.skills.slice(0, 4);
  const skills = cvData.skills.slice(0, 12);
  const memberships = cvData.languages && cvData.languages.length > 0
    ? cvData.languages.map(l => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`)
    : [];

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

  const stampLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div id="cv-preview-photo-sidebar" className="bg-white text-zinc-900 shadow-lg border font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${sidebarBg} 32%, white 32%)` }}>

        <div className="w-[32%] flex-shrink-0 p-4 flex flex-col">

          {/* Photo + Name */}
          <div className="mb-3 flex flex-col items-center text-center">
            {personalInfo.photo ? (
              <img
                src={personalInfo.photo}
                alt={personalInfo.name}
                className="w-20 h-20 object-cover mb-2"
                style={{ border: `2px solid ${accentColor}` }}
              />
            ) : (
              <div
                className="w-20 h-20 flex items-center justify-center mb-2 text-white text-2xl font-bold"
                style={{ backgroundColor: accentColor }}
              >
                {personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <h1 className="text-base font-black leading-tight text-zinc-900">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[9.5px] font-semibold mt-0.5" style={{ color: accentColor }}>
                {cvData.experience[0].jobTitle}
              </p>
            )}
          </div>

          <SidebarSection title="Contact">
            <ul className="space-y-1 text-[9.5px] text-zinc-700">
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

          {cvData.summary && (
            <SidebarSection title="Summary">
              <p className="text-[9.5px] leading-snug text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </SidebarSection>
          )}

          {skills.length > 0 && (
            <SidebarSection title="Skills">
              <ul className="space-y-0.5">
                {skills.map((skill, i) => (
                  <li key={i} className="text-[9.5px] text-zinc-700 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                    <span {...editableProps(['skills', i])}>{skill}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {certifications.length > 0 && (
            <SidebarSection title="Certifications">
              <ul className="space-y-0.5">
                {certifications.map((cert, i) => (
                  <li key={i} className="text-[9.5px] text-zinc-700 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
                    <span>{cert}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Career Highlights — magazine pull-quote: italic serif + small
              orange square (no bullet dot). */}
          {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
            <SidebarSection title="Career Highlights">
              <ul className="space-y-1.5">
                {keyAchievements.map((line, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-zinc-700 leading-snug italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 inline-block" style={{ backgroundColor: accentColor }}></span>
                    {line}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Featured Work — uppercase tracked-out project titles. */}
          {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Featured Work">
              <ul className="space-y-1">
                {cvData.projects.slice(0, 3).map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9px] text-zinc-800 uppercase tracking-wider font-bold leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 inline-block" style={{ backgroundColor: accentColor }}></span>
                    {p.name}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
            <SidebarSection title="References">
              <p className="text-[9px] text-zinc-600 italic leading-snug" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                {cvData.references.length} available on request.
              </p>
            </SidebarSection>
          )}

          {/* Bottom-anchored magazine stamp — same paper double-rule + italic
              "Portfolio · MMM YYYY" stamp. */}
          <div className="mt-auto pt-4">
            <div className="h-px bg-zinc-400" />
            <div className="h-px mt-0.5 mb-2" style={{ backgroundColor: accentColor, opacity: 0.6 }} />
            <p
              className="text-[9px] text-center italic"
              style={{
                color: accentColor,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '0.08em',
              }}
            >
              Portfolio · {stampLabel}
            </p>
          </div>
        </div>

        {/* Right Main Content */}
        <div className="flex-1 px-5 py-4">

          {cvData.education.length > 0 && (
            <RightSection title="Education">
              <div className="space-y-1.5">
                {cvData.education.slice(0, 2).map((edu, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <span className="mt-1 flex-shrink-0 w-2 h-2 rounded-full border-2 border-zinc-800 inline-block"></span>
                    <div>
                      <p className="text-[10.5px] font-bold leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                      <p className="text-[9.5px] text-zinc-600" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                      <p className="text-[9px] text-zinc-500" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {cvData.experience.length > 0 && (
            <RightSection title="Experience">
              <div className="space-y-2.5">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group flex items-start gap-1.5">
                    <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full inline-block" style={{ backgroundColor: accentColor }}></span>
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
                        <h3 className="text-[10.5px] font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                        <span className="text-[9px] text-zinc-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                      </div>
                      <p className="text-[9.5px] font-semibold text-zinc-600 mb-0.5" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                      <ul className="list-disc list-outside ml-3 space-y-0.5">
                        {job.responsibilities.map((resp, i) => (
                          <li key={i} className="text-[9.5px] text-zinc-700 leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </RightSection>
          )}

          {cvData.projects && cvData.projects.length > 0 && (
            <RightSection title="Highlights">
              <ul className="space-y-0.5 list-disc list-outside ml-3.5">
                {cvData.projects.map((proj, index) => (
                  <li key={index} className="text-[9.5px] text-zinc-700 leading-snug">
                    <span className="font-semibold" {...editableProps(['projects', index, 'name'])}>{proj.name}:</span>{' '}
                    <span dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  </li>
                ))}
              </ul>
            </RightSection>
          )}

          {memberships.length > 0 && (
            <RightSection title="Memberships">
              <ul className="space-y-0.5">
                {memberships.map((m, i) => (
                  <li key={i} className="text-[9.5px] text-zinc-700 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full inline-block bg-zinc-500"></span>
                    {m}
                  </li>
                ))}
              </ul>
            </RightSection>
          )}

          {cvData.publications && cvData.publications.length > 0 && (
            <RightSection title="Publications">
              <div className="space-y-1">
                {cvData.publications.map((pub, index) => (
                  <div key={index}>
                    <p className="text-[9.5px] font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</p>
                    <p className="text-[9px] text-zinc-500 italic">
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
        renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-wide mb-1 pb-0.5 border-b border-zinc-300" style={{ color: '#222' }}>{title}</h2>}
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

export default TemplatePhotoSidebar;
