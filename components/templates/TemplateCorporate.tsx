import React, { useCallback } from 'react';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplateCorporate: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#334155';

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 dark:focus:bg-blue-900/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>{title}</h2>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <section key="summary">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>PROFESSIONAL SUMMARY</h2>
            <p className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </section>
        );
      case 'workExperience':
        return (
          <section key="workExperience">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>WORK EXPERIENCE</h2>
            <div className="space-y-6">
              {cvData.experience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-md font-bold text-slate-800" {...editableProps(['experience', index, 'company'])}>{job.company}</h3>
                    <p className="text-sm font-normal text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <p className="text-md font-semibold italic text-slate-600 mb-2" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</p>
                  <ul className="list-disc list-outside ml-5 space-y-2 text-base text-slate-700">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      case 'education':
        return cvData.education.length > 0 ? (
          <section key="education">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>EDUCATION</h2>
            {cvData.education.map((edu, index) => (
              <div key={index} className="mb-4">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-md font-bold text-slate-800" {...editableProps(['education', index, 'school'])}>{edu.school}</h3>
                  <p className="text-sm text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
                <p className="text-md italic text-slate-600" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                {edu.description && (
                  <p className="text-sm text-slate-500 mt-1" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                )}
              </div>
            ))}
          </section>
        ) : null;
      case 'skills':
        return cvData.skills.length > 0 ? (
          <section key="skills">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>KEY SKILLS</h2>
            <div className="text-base leading-relaxed">
              {(() => {
                const sk = cvData.skills.slice(0, 15);
                const perCol = Math.ceil(sk.length / 3);
                return (
                  <div className="grid grid-cols-3 gap-x-4">
                    {[0, 1, 2].map(ci => (
                      <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                        {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                          <li key={si} className="text-sm">{s}</li>
                        ))}
                      </ul>
                    ))}
                  </div>
                );
              })()}
            </div>
          </section>
        ) : null;
      case 'projects':
        return cvData.projects && cvData.projects.length > 0 ? (
          <section key="projects">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>PROJECTS</h2>
            <div className="space-y-4">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-md font-bold text-slate-800" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-base text-slate-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-sm text-blue-700 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <section key="languages">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>LANGUAGES</h2>
            <p className="text-base leading-relaxed">
              {cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ')}
            </p>
          </section>
        ) : null;
      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <section key="references">
            <h2 className="text-lg font-semibold tracking-wide mb-3" style={{ color: accent }}>REFERENCES</h2>
            <div className="grid grid-cols-2 gap-4">
              {cvData.references.map((ref, index) => (
                <div key={index} className="text-sm text-slate-700">
                  <p className="font-bold text-slate-900">{ref.name}</p>
                  <p className="text-slate-600">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                  {ref.email && <p>{ref.email}</p>}
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
    <div id="cv-preview-corporate" className="bg-white p-8 sm:p-12 text-slate-900 shadow-lg border font-serif">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-800">{personalInfo.name}</h1>
        <div className="text-sm text-slate-600 mt-3">
          {personalInfo.location} &bull; {personalInfo.phone} &bull; {personalInfo.email}
        </div>
        <div className="text-sm text-blue-700 mt-1">
          {personalInfo.linkedin && <a href={personalInfo.linkedin} className="hover:underline">LinkedIn</a>}
          {personalInfo.website && <> &bull; <a href={personalInfo.website} className="hover:underline">Website</a></>}
          {personalInfo.github && <> &bull; <a href={personalInfo.github} className="hover:underline">GitHub</a></>}
        </div>
      </header>

      <hr className="border-t-2 mb-8" style={{ borderColor: accent }} />

      <main className="space-y-10">
        {orderedSections.map(key => renderSection(key))}
      
        <TemplateCustomSections
          customSections={cvData.customSections}
          skipReferences
          renderHeader={title => <SectionHeader title={title} />}
          sectionClassName="mb-8"
          titleClass="font-semibold"
          subtitleClass="text-sm opacity-70"
          descClass="text-sm opacity-80 mt-0.5"
          yearClass="text-xs opacity-60"
        />
</main>

      {jobDescriptionForATS && (
        <div className="absolute left-[-9999px] top-[-9999px] w-[1px] h-[1px] overflow-hidden text-white whitespace-pre-wrap text-[1px]" aria-hidden="true">
          {jobDescriptionForATS}
        </div>
      )}
    </div>
  );
};

export default TemplateCorporate;
