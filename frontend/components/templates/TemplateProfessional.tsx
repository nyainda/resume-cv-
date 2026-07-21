import React, { useCallback } from 'react';
import { cleanBulletHtml } from './templateUtils';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { formatEduDate } from '../../utils/cvDataUtils';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';
import { INK_SUBLINE, INK_DOT, INK_LINK } from './styleTokens';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateProfessional: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#1e3a5f';

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  // For personal-info fields: writes into cvData.personalInfo so the parent
  // can pick up the change via the normal onDataChange callback.
  const editableInfoProps = (field: string) => isEditing ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const d = JSON.parse(JSON.stringify(cvData));
      if (!d.personalInfo) d.personalInfo = {};
      d.personalInfo[field] = e.currentTarget.innerText.trim();
      onDataChange(d);
    },
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all cursor-text"
  } : {};

  // --- Single, reusable header used by EVERY section (built-in + custom). ---
  // Signature element: a short accent "tick" + tracked label + hairline rule
  // running out to the margin. One component, one rhythm, everywhere.
  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex items-center gap-3 mb-4" data-pdf-keep="true">
      <span
        className="inline-block w-3.5 h-[3px] rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />
      <h2 className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-zinc-500 whitespace-nowrap">
        {title}
      </h2>
      <span className="flex-1 h-px bg-zinc-200" />
    </div>
  );

  // Consistent bullet marker used for every responsibility / description list,
  // instead of default browser discs (which render inconsistently across
  // browsers and PDF export engines).
  const Bullet: React.FC<{ html: string; editProps?: any }> = ({ html, editProps }) => (
    <li className="flex gap-2.5 text-sm leading-relaxed text-zinc-700">
      <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: INK_DOT }} />
      <span dangerouslySetInnerHTML={{ __html: cleanBulletHtml(html) }} {...editProps} />
    </li>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <section key="summary">
            <SectionHeader title="Professional Summary" />
            <p
              className="text-[15px] leading-relaxed text-zinc-700 font-serif"
              dangerouslySetInnerHTML={{ __html: cvData.summary }}
              {...editableProps(['summary'])}
            />
          </section>
        );

      case 'workExperience':
        return (
          <section key="workExperience">
            <SectionHeader title="Experience" />
            <div className="space-y-6">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group" data-pdf-keep="true">
                  {isEditing && (
                    <button
                      onClick={() => handleDeleteExperience(index)}
                      className="absolute -left-10 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                      title="Delete this experience entry"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  )}
                  <div className="flex justify-between items-baseline gap-4 mb-0.5">
                    <h3
                      className="text-[17px] font-serif font-bold text-zinc-900"
                      {...editableProps(['experience', index, 'jobTitle'])}
                    >
                      {job.jobTitle}
                    </h3>
                    <p
                      className="text-[11px] font-mono tracking-tight text-zinc-500 whitespace-nowrap"
                      {...editableProps(['experience', index, 'dates'])}
                    >
                      {job.dates}
                    </p>
                  </div>
                  <p
                    className="text-[13px] font-mono font-medium uppercase tracking-wide mb-2"
                    style={{ color: INK_SUBLINE }}
                    {...editableProps(['experience', index, 'company'])}
                  >
                    {job.company}
                  </p>
                  <ul className="space-y-1">
                    {job.responsibilities.map((resp, i) => (
                      <Bullet key={i} html={resp} editProps={editableProps(['experience', index, 'responsibilities', i])} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );

      case 'education':
        return cvData.education.length > 0 ? (
          <section key="education">
            <SectionHeader title="Education" />
            <div className="space-y-5">
              {cvData.education.map((edu, index) => (
                <div key={index} data-pdf-keep="true">
                  <div className="flex justify-between items-baseline gap-4">
                    <div>
                      <h3 className="text-[17px] font-serif font-bold text-zinc-900" {...editableProps(['education', index, 'degree'])}>
                        {edu.degree}
                      </h3>
                      <p className="text-[13px] font-mono font-medium uppercase tracking-wide" style={{ color: INK_SUBLINE }} {...editableProps(['education', index, 'school'])}>
                        {edu.school}
                      </p>
                    </div>
                    <p className="text-[11px] font-mono tracking-tight text-zinc-500 whitespace-nowrap" {...editableProps(['education', index, 'year'])}>
                      {formatEduDate(edu.year)}
                    </p>
                  </div>
                  {edu.description && (
                    <p
                      className="text-sm text-zinc-600 mt-1.5 font-serif italic"
                      dangerouslySetInnerHTML={{ __html: edu.description }}
                      {...editableProps(['education', index, 'description'])}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case 'skills':
        return cvData.skills.length > 0 ? (
          <section key="skills">
            <SectionHeader title="Skills" />
            {(() => {
              const sk = cvData.skills.slice(0, 15);
              const cols: string[][] = [[], [], []];
              sk.forEach((s, i) => cols[i % 3].push(s));
              // Track original indices so edits map to the right array slot
              const colIdxs: number[][] = [[], [], []];
              sk.forEach((_, i) => colIdxs[i % 3].push(i));
              return (
                <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                  {cols.map((col, ci) => (
                    <ul key={ci} className="space-y-1">
                      {col.map((s, si) => (
                        <li key={si} className="flex items-center gap-2 text-sm text-zinc-700">
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: INK_DOT }} />
                          <span {...editableProps(['skills', colIdxs[ci][si]])}>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ))}
                </div>
              );
            })()}
          </section>
        ) : null;

      case 'projects':
        return cvData.projects && cvData.projects.length > 0 ? (
          <section key="projects">
            <SectionHeader title="Projects" />
            <div className="space-y-5">
              {cvData.projects.map((proj, index) => (
                <div key={index} data-pdf-keep="true">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px] font-serif font-bold text-zinc-900" {...editableProps(['projects', index, 'name'])}>
                      {proj.name}
                    </h3>
                    {(proj.dates || proj.year) && (
                      <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap flex-shrink-0" {...editableProps(['projects', index, 'dates'])}>
                        {proj.dates || proj.year}
                      </span>
                    )}
                  </div>
                  {proj.bullets?.length ? (
                    <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5">
                      {proj.bullets.map((b, bi) => (
                        <li key={bi} className="text-sm text-zinc-700 font-serif leading-relaxed" dangerouslySetInnerHTML={{ __html: cleanBulletHtml(b) }} />
                      ))}
                    </ul>
                  ) : (
                    <p
                      className="text-sm text-zinc-700 mt-1 font-serif leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: proj.description }}
                      {...editableProps(['projects', index, 'description'])}
                    />
                  )}
                  {proj.link && (
                    <a href={proj.link} className="text-[13px] font-mono underline mt-0.5 inline-block" style={{ color: INK_LINK }} {...editableProps(['projects', index, 'link'])}>
                      {proj.link}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <section key="languages">
            <SectionHeader title="Languages" />
            <p className="text-sm leading-relaxed text-zinc-700 flex flex-wrap gap-x-1.5 gap-y-1">
              {cvData.languages.map((l, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="font-medium text-zinc-900" {...editableProps(['languages', i, 'name'])}>{l.name}</span>
                  <span className="text-zinc-400 text-xs font-mono">(</span>
                  <span className="text-zinc-400 text-xs font-mono" {...editableProps(['languages', i, 'proficiency'])}>{l.proficiency}</span>
                  <span className="text-zinc-400 text-xs font-mono">)</span>
                  {i < (cvData.languages?.length ?? 0) - 1 && <span className="text-zinc-300 ml-1">•</span>}
                </span>
              ))}
            </p>
          </section>
        ) : null;

      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <section key="references">
            <SectionHeader title="References" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {cvData.references.map((ref, index) => (
                <div key={index} className="text-sm text-zinc-700">
                  <p className="font-serif font-bold text-zinc-900" {...editableProps(['references', index, 'name'])}>{ref.name}</p>
                  <p className="text-zinc-600">
                    <span {...editableProps(['references', index, 'title'])}>{ref.title}</span>
                    {ref.company ? <>, <span {...editableProps(['references', index, 'company'])}>{ref.company}</span></> : null}
                  </p>
                  {ref.relationship && <p className="text-zinc-500 italic font-serif" {...editableProps(['references', index, 'relationship'])}>{ref.relationship}</p>}
                  {ref.email && <p className="font-mono text-[13px] text-zinc-500" {...editableProps(['references', index, 'email'])}>{ref.email}</p>}
                  {ref.phone && <p className="font-mono text-[13px] text-zinc-500" {...editableProps(['references', index, 'phone'])}>{ref.phone}</p>}
                </div>
              ))}
            </div>
          </section>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div id="cv-preview-professional" className="bg-white p-10 text-zinc-900 shadow-lg border font-serif">
      <header className="pb-6 mb-8 border-b border-zinc-200" data-pdf-keep="true">
        <h1 className="text-[2.75rem] leading-none font-serif font-black tracking-tight text-zinc-900"
          {...editableInfoProps('name')}>
          {personalInfo.name}
        </h1>
        <span
          className="block mt-3 h-[3px] w-14 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <div className="flex items-center gap-x-3 gap-y-1 text-[13px] font-mono text-zinc-500 mt-4 flex-wrap">
          <span {...editableInfoProps('email')}>{personalInfo.email}</span>
          {personalInfo.phone && <><span className="text-zinc-300">•</span><span {...editableInfoProps('phone')}>{personalInfo.phone}</span></>}
          {personalInfo.location && <><span className="text-zinc-300">•</span><span {...editableInfoProps('location')}>{personalInfo.location}</span></>}
          {personalInfo.linkedin && (
            <>
              <span className="text-zinc-300">•</span>
              {isEditing
                ? <span {...editableInfoProps('linkedin')}>{personalInfo.linkedin}</span>
                : <a href={personalInfo.linkedin} className="hover:underline" style={{ color: INK_LINK }}>LinkedIn</a>}
            </>
          )}
          {personalInfo.website && (
            <>
              <span className="text-zinc-300">•</span>
              {isEditing
                ? <span {...editableInfoProps('website')}>{personalInfo.website}</span>
                : <a href={personalInfo.website} className="hover:underline" style={{ color: INK_LINK }}>Website</a>}
            </>
          )}
          {personalInfo.github && (
            <>
              <span className="text-zinc-300">•</span>
              {isEditing
                ? <span {...editableInfoProps('github')}>{personalInfo.github}</span>
                : <a href={personalInfo.github} className="hover:underline" style={{ color: INK_LINK }}>GitHub</a>}
            </>
          )}
        </div>
      </header>

      <main className="space-y-8">
        {orderedSections.map(key => renderSection(key))}

        {cvData.publications && cvData.publications.length > 0 && (
          <section>
            <SectionHeader title="Publications" />
            <div className="space-y-4">
              {cvData.publications.map((pub, index) => (
                <div key={index} data-pdf-keep="true">
                  <h3 className="text-[15px] font-serif font-bold text-zinc-900" {...editableProps(['publications', index, 'title'])}>
                    {pub.title}
                  </h3>
                  <p className="text-sm text-zinc-700" {...editableProps(['publications', index, 'authors'])}>
                    {pub.authors.join(', ')}
                  </p>
                  <p className="text-[13px] font-mono text-zinc-500 mt-0.5">
                    <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>
                    {', '}
                    <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <TemplateCustomSections
          customSections={cvData.customSections}
          skipReferences
          renderHeader={title => <SectionHeader title={title} />}
          sectionClassName="mb-8"
          titleClass="font-serif font-bold text-zinc-900"
          subtitleClass="text-[13px] font-mono uppercase tracking-wide"
          descClass="text-sm opacity-80 mt-0.5 font-serif"
          yearClass="text-[11px] font-mono text-zinc-500"
        />
      </main>

      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateProfessional;