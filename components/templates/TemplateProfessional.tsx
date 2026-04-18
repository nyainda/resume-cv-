import React, { useCallback } from 'react';
import { CVData, PersonalInfo, ProfileSectionKey, DEFAULT_SECTION_ORDER } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';

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

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h2 className="text-xs font-black uppercase tracking-[0.15em] pb-2 mb-4" style={{ color: accent, borderBottom: `2px solid ${accent}` }}>{title}</h2>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <section key="summary">
            <h2 className="text-xs font-black uppercase tracking-[0.15em] pb-2 mb-5" style={{ color: accent, borderBottom: `2px solid ${accent}` }}>Professional Summary</h2>
            <p className="text-sm leading-relaxed text-zinc-700 font-medium" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </section>
        );
      case 'workExperience':
        return (
          <section key="workExperience">
            <h2 className="text-sm font-bold uppercase tracking-widest pb-2 mb-4" style={{ color: accent, borderBottom: `2px solid ${accent}` }}>Experience</h2>
            <div className="space-y-8">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group">
                  {isEditing && (
                    <button
                      onClick={() => handleDeleteExperience(index)}
                      className="absolute -left-10 top-0 p-2 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10"
                      title="Delete this experience entry"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  )}
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-lg font-bold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <p className="text-sm font-medium text-slate-600" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <p className="text-base font-bold text-slate-700" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
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
          <section key="education">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Education</h2>
            {cvData.education.map((edu, index) => (
              <div key={index} className="mb-6">
                <div className="flex justify-between items-baseline">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                    <p className="text-base text-slate-700" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-600" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                </div>
                {edu.description && (
                  <p className="text-sm text-slate-600 mt-1 italic" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                )}
              </div>
            ))}
          </section>
        ) : null;
      case 'skills':
        return cvData.skills.length > 0 ? (
          <section key="skills">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Skills</h2>
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
          <section key="projects">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Projects</h2>
            <div className="space-y-6">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-lg font-bold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  <p className="text-base text-slate-700 mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>{proj.link}</a>}
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <section key="languages">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Languages</h2>
            <p className="text-base leading-relaxed">
              {cvData.languages.map((l, i) => <span key={i}>{l.name} ({l.proficiency}){i < (cvData.languages?.length ?? 0) - 1 && ' • '}</span>)}
            </p>
          </section>
        ) : null;
      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <section key="references">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">References</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {cvData.references.map((ref, index) => (
                <div key={index} className="text-sm text-slate-700">
                  <p className="font-bold text-slate-900">{ref.name}</p>
                  <p className="text-slate-600">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                  {ref.relationship && <p className="text-slate-500 italic">{ref.relationship}</p>}
                  {ref.email && <p>{ref.email}</p>}
                  {ref.phone && <p>{ref.phone}</p>}
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
    <div id="cv-preview-professional" className="bg-white p-8 sm:p-12 text-zinc-900 shadow-lg border font-serif">
      <header className="text-center border-b-2 border-zinc-200 pb-6 mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">{personalInfo.name}</h1>
        <div className="flex justify-center items-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-3 flex-wrap">
          <span>{personalInfo.email}</span>
          <span className="hidden sm:inline">|</span>
          <span>{personalInfo.phone}</span>
          <span className="hidden sm:inline">|</span>
          <span>{personalInfo.location}</span>
          {personalInfo.linkedin && (<><span className="hidden sm:inline">|</span><a href={personalInfo.linkedin} className="text-blue-600 hover:underline">LinkedIn</a></>)}
          {personalInfo.website && (<><span className="hidden sm:inline">|</span><a href={personalInfo.website} className="text-blue-600 hover:underline">Website</a></>)}
          {personalInfo.github && (<><span className="hidden sm:inline">|</span><a href={personalInfo.github} className="text-blue-600 hover:underline">GitHub</a></>)}
        </div>
      </header>

      <main className="space-y-12">
        {orderedSections.map(key => renderSection(key))}
        {cvData.publications && cvData.publications.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800 border-b border-slate-300 pb-2 mb-4">Publications</h2>
            <div className="space-y-4">
              {cvData.publications.map((pub, index) => (
                <div key={index}>
                  <h3 className="text-base font-bold text-slate-900" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                  <p className="text-sm text-slate-700" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</p>
                  <p className="text-sm italic text-slate-600">
                    <span {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>
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

export default TemplateProfessional;
