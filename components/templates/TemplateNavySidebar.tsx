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
  sidebarSections?: SidebarSectionsVisibility;
  jobDescriptionForATS: string;
}

// Navy Sidebar — compact one-page edition. Keeps the classical aesthetic
// (vertical accent-bar Career Highlights, boxed Recognized Projects, serif
// monogram crest with Roman-numeral year) but with everything sized to land
// on a single A4 page. Sidebar trimmed from 35% → 30%.
const TemplateNavySidebar: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS, sidebarSections = DEFAULT_SIDEBAR_SECTIONS }) => {

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/10 rounded px-0.5 -mx-0.5 transition-all"
  } : {};

  const navyBg = cvData.accentColor ?? '#1a2f5a';

  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-3">
      <h2 style={{ color: '#7fa8d8', borderBottomColor: '#3a5a8a' }} className="text-[8px] font-bold uppercase tracking-[0.18em] border-b pb-0.5 mb-1.5">{title}</h2>
      {children}
    </section>
  );

  // First 4 skills become "Certificates & Licenses", remainder become "Skills".
  const certifications = cvData.skills.slice(0, 4);
  const skills = cvData.skills.slice(4, 14); // hard cap at 10 remaining for one-page fit
  const memberships = cvData.languages && cvData.languages.length > 0
    ? cvData.languages.map(l => l.name)
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

  const initials = (personalInfo.name || 'CV')
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  const toRoman = (num: number) => {
    const map: [number, string][] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
    ];
    let n = num; let result = '';
    for (const [val, sym] of map) { while (n >= val) { result += sym; n -= val; } }
    return result;
  };
  const yearRoman = toRoman(new Date().getFullYear());

  return (
    <div id="cv-preview-navy-sidebar" className="bg-white text-zinc-900 shadow-lg border font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex min-h-[280mm]" style={{ backgroundImage: `linear-gradient(to right, ${navyBg} 30%, white 30%)` }}>
        <div className="w-[30%] text-white p-4 flex-shrink-0 flex flex-col">

          <div>
          <SidebarSection title="Education">
            <div className="space-y-1.5">
              {cvData.education.slice(0, 2).map((edu, index) => (
                <div key={index} className="text-[9.5px]">
                  <p className="font-bold leading-snug text-white" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                  <p className="text-blue-200 text-[9px] mt-0.5" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  <p className="text-blue-300 text-[9px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
              ))}
            </div>
          </SidebarSection>

          {certifications.length > 0 && (
            <SidebarSection title="Certificates &amp; Licenses">
              <ul className="space-y-0.5">
                {certifications.map((cert, i) => (
                  <li key={i} className="text-[9.5px] text-blue-100 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-blue-400 inline-block"></span>
                    <span {...editableProps(['skills', i])}>{cert}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {skills.length > 0 && (
            <SidebarSection title="Skills">
              <ul className="space-y-0.5">
                {skills.map((skill, i) => (
                  <li key={i} className="text-[9.5px] text-blue-100 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-blue-400 inline-block"></span>
                    <span {...editableProps(['skills', certifications.length + i])}>{skill}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {memberships.length > 0 && (
            <SidebarSection title="Membership">
              <ul className="space-y-0.5">
                {memberships.map((m, i) => (
                  <li key={i} className="text-[9.5px] text-blue-100 flex items-start gap-1 leading-snug">
                    <span className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-blue-400 inline-block"></span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Career Highlights — vertical accent-bar pull-quote treatment. */}
          {sidebarSections.keyAchievements && keyAchievements.length > 0 && (
            <SidebarSection title="Career Highlights">
              <ul className="space-y-1.5">
                {keyAchievements.map((line, i) => (
                  <li key={i} className="text-[9px] text-blue-100 leading-snug pl-2 border-l-2" style={{ borderColor: '#7fa8d8' }}>
                    {line}
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          {/* Recognized Projects — boxed cards (titles only). */}
          {sidebarSections.selectedProjects && cvData.projects && cvData.projects.length > 0 && (
            <SidebarSection title="Recognized Projects">
              <div className="space-y-1">
                {cvData.projects.slice(0, 3).map((p, i) => (
                  <div key={i} className="text-[9px] text-blue-100 px-1.5 py-1 border leading-snug" style={{ borderColor: '#3a5a8a' }}>
                    {p.name}
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {sidebarSections.references && cvData.references && cvData.references.length > 0 && (
            <SidebarSection title="References">
              <p className="text-[9px] text-blue-100 italic leading-snug">
                {cvData.references.length} available on request.
              </p>
            </SidebarSection>
          )}
          </div>

          {/* Bottom-anchored monogram crest — same classical motif, slightly
              shrunk so it doesn't dominate the compact sidebar. */}
          <div className="mt-auto pt-4 flex flex-col items-center gap-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2"
              style={{
                borderColor: '#7fa8d8',
                color: '#7fa8d8',
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '0.05em',
              }}
            >
              {initials}
            </div>
            <p
              className="text-[9px] tracking-[0.3em]"
              style={{
                color: '#7fa8d8',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {yearRoman}
            </p>
          </div>
        </div>

        {/* Right Main Content */}
        <div className="flex-1 px-5 py-4">
          {/* Name Header — compact: shrunk from text-4xl to text-2xl and
              tighter spacing so it fits without dominating the page. */}
          <header className="mb-3 pb-2 border-b-2" style={{ borderColor: navyBg }}>
            <h1 className="text-2xl font-black uppercase tracking-wide leading-tight" style={{ color: navyBg, letterSpacing: '0.04em' }}>
              {personalInfo.name}
            </h1>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-zinc-600 mt-1">
              {personalInfo.phone && <span>Phone: {personalInfo.phone}</span>}
              {personalInfo.email && <span>Email: {personalInfo.email}</span>}
              {personalInfo.location && <span>{personalInfo.location}</span>}
            </div>
          </header>

          {cvData.summary && (
            <section className="mb-3">
              <h2 className="text-[10px] font-black uppercase tracking-widest mb-1 pb-0.5 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Profile Summary
              </h2>
              <p className="text-[10px] leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </section>
          )}

          {cvData.experience.length > 0 && (
            <section>
              <h2 className="text-[10px] font-black uppercase tracking-widest mb-1.5 pb-0.5 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Experience
              </h2>
              <div className="space-y-2.5">
                {cvData.experience.map((job, index) => (
                  <div key={index} className="relative group">
                    {isEditing && (
                      <button
                        onClick={() => handleDeleteExperience(index)}
                        className="absolute -left-5 top-0 p-1 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                        title="Delete experience"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    )}
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-[10.5px] font-bold text-zinc-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <span className="text-[9px] text-zinc-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                    </div>
                    <p className="text-[9.5px] font-semibold mb-0.5" style={{ color: navyBg }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-3.5 space-y-0.5">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} className="text-[9.5px] text-zinc-700 leading-snug" dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cvData.projects && cvData.projects.length > 0 && (
            <section className="mt-3">
              <h2 className="text-[10px] font-black uppercase tracking-widest mb-1 pb-0.5 border-b" style={{ color: navyBg, borderColor: navyBg }}>
                Projects
              </h2>
              <div className="space-y-1.5">
                {cvData.projects.map((proj, index) => (
                  <div key={index}>
                    <p className="text-[10px] font-bold" {...editableProps(['projects', index, 'name'])}>{proj.name}</p>
                    <p className="text-[9.5px] text-zinc-600 leading-snug" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <TemplateCustomSections
        customSections={cvData.customSections}
        references={cvData.references}
        renderHeader={title => <h2 className="text-[10px] font-black uppercase tracking-widest mb-1 pb-0.5 border-b" style={{ color: navyBg, borderColor: navyBg }}>{title}</h2>}
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

export default TemplateNavySidebar;
