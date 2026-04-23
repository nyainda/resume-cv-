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

const TemplateClassic: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#475569';

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h2 className="text-center text-sm font-bold uppercase tracking-[0.2em] mb-5" style={{ color: accent }}>{title}</h2>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <section key="summary" className="mb-8">
            <SectionHeader title="Summary" />
            <p className="text-base leading-relaxed text-center" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </section>
        );
      case 'workExperience':
        return (
          <section key="workExperience" className="mb-8">
            <SectionHeader title="Experience" />
            <div className="space-y-8">
              {cvData.experience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-lg font-bold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}, <span className="font-semibold text-slate-700" {...editableProps(['experience', index, 'company'])}>{job.company}</span></h3>
                    <p className="text-sm font-medium text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-2 text-base text-slate-700">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      case 'education':
        return cvData.education.length > 0 ? (
          <section key="education" className="mb-8">
            <SectionHeader title="Education" />
            {cvData.education.map((edu, index) => (
              <div key={index} className="text-center mb-4">
                <h3 className="text-lg font-bold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                <p className="text-base text-slate-700" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                <p className="text-sm font-medium text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
              </div>
            ))}
          </section>
        ) : null;
      case 'skills':
        return cvData.skills.length > 0 ? (
          <section key="skills" className="mb-8">
            <SectionHeader title="Skills" />
            {(() => {
              const sk = cvData.skills.slice(0, 15);
              const perCol = Math.ceil(sk.length / 3);
              return (
                <div className="grid grid-cols-3 gap-x-6">
                  {[0, 1, 2].map(ci => (
                    <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                      {sk.slice(ci * perCol, (ci + 1) * perCol).map((s, si) => (
                        <li key={si} className="text-sm text-slate-700">{s}</li>
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
          <section key="projects" className="mb-8">
            <SectionHeader title="Projects" />
            <div className="space-y-6">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-lg font-bold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-base text-slate-700 mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline">{proj.link}</a>}
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <section key="languages" className="mb-8">
            <SectionHeader title="Languages" />
            <p className="text-base text-center">
              {cvData.languages.map((l, i) => <span key={i}>{l.name} ({l.proficiency}){i < (cvData.languages?.length ?? 0) - 1 && ' • '}</span>)}
            </p>
          </section>
        ) : null;
      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <section key="references" className="mb-8">
            <SectionHeader title="References" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {cvData.references.map((ref, index) => (
                <div key={index} className="text-center text-sm text-slate-700">
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
    <div id="cv-preview-classic" className="bg-white p-12 text-slate-900 shadow-lg border font-serif">
      <header className="text-center pb-6 mb-6">
        {personalInfo.photo && (
          <div className="flex justify-center mb-4">
            <img
              src={personalInfo.photo}
              alt={personalInfo.name}
              className="w-24 h-24 rounded-full object-cover border-2 border-slate-300"
            />
          </div>
        )}
        <h1 className="text-5xl font-bold tracking-tight">{personalInfo.name}</h1>
        <hr className="my-4 border-t-2 w-16 mx-auto" style={{ borderColor: accent }} />
        <div className="flex justify-center items-center gap-x-4 text-sm text-slate-600 flex-wrap">
          <span>{personalInfo.email}</span>
          <span>&bull;</span>
          <span>{personalInfo.phone}</span>
          <span>&bull;</span>
          <span>{personalInfo.location}</span>
          {personalInfo.linkedin && (<><span>&bull;</span><a href={personalInfo.linkedin} className="text-blue-700 hover:underline">LinkedIn</a></>)}
          {personalInfo.website && (<><span>&bull;</span><a href={personalInfo.website} className="text-blue-700 hover:underline">Website</a></>)}
        </div>
      </header>

      <main>
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

export default TemplateClassic;
