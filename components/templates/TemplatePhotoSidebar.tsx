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

  // Sidebar fillers — Photo template uses warm magazine typography. Career
  // Highlights render as italic serif "pull-quotes" with a small orange
  // square in front (editorial style). Featured Work uses the same square
  // but with the project title in bold caps. Bottom anchor is a paper-style
  // divider + italic "Portfolio · MMM YYYY" stamp.
  //
  // We also REMOVE the previous hardcoded "Personal Attributes" list (which
  // showed identical canned strings on every CV — "Results-driven and
  // metrics-oriented", etc.) and replace it with real data.
  const keyAchievements = (() => {
    const numberPattern = /\d+\s*%|\d+\s*x|KES\s*[\d,]+|USD\s*[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+|\b\d{2,}(?:,\d{3})*\b/i;
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
    return cvData.experience
      .flatMap((e) => e.responsibilities.map(stripHtml))
      .filter((b) => numberPattern.test(b))
      .sort((a, b) => a.length - b.length)
      .slice(0, 3);
  })();

  const stampLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div id="cv-preview-photo-sidebar" className="bg-white text-zinc-900 shadow-lg border font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${sidebarBg} 38%, white 38%)` }}>

        {/* Left Sidebar — background from parent gradient.
            flex-col so the warm "Portfolio" stamp pins to the bottom when
            the right column is taller than the sidebar content. */}
        <div className="w-[38%] flex-shrink-0 p-5 flex flex-col">

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

          {/* Career Highlights — magazine pull-quote style: small orange
              square + italic serif text, no bullet dots. Replaces the
              previous hardcoded "Personal Attributes" canned-string list. */}
          {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
            <SidebarSection title="Career Highlights">
              <ul className="space-y-2">
                {keyAchievements.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-700 leading-snug italic" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 inline-block" style={{ backgroundColor: accentColor }}></span>
                    {line}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Featured Work — project titles in bold uppercase, magazine
              section-divider feel. Descriptions remain in the right column. */}
          {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Featured Work">
              <ul className="space-y-1.5">
                {cvData.projects.slice(0, 4).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-800 uppercase tracking-wider font-bold leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 inline-block" style={{ backgroundColor: accentColor }}></span>
                    {p.name}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
            <SidebarSection title="References">
              <p className="text-[11px] text-zinc-600 italic leading-snug" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                {cvData.references.length} reference{cvData.references.length === 1 ? '' : 's'} available on request.
              </p>
            </SidebarSection>
          )}

          {/* Bottom-anchored magazine stamp — paper-style double rule + an
              italic serif "Portfolio · MMM YYYY" stamp. Absorbs leftover
              vertical space and reinforces the editorial aesthetic. */}
          <div className="mt-auto pt-10">
            <div className="h-px bg-zinc-400" />
            <div className="h-px mt-1 mb-3" style={{ backgroundColor: accentColor, opacity: 0.6 }} />
            <p
              className="text-[11px] text-center italic"
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
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplatePhotoSidebar;
