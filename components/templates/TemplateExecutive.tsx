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

const TemplateExecutive: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const accent = cvData.accentColor ?? '#374151';

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
    className: "outline-none ring-1 ring-transparent focus:ring-blue-400 focus:bg-blue-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h2 className="text-xs font-bold uppercase tracking-widest mb-2 pb-1 border-b border-gray-300" style={{ color: accent }}>{title}</h2>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <section key="summary">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-2 pb-1 border-b border-gray-300" style={{ color: accent }}>Executive Summary</h2>
            <p className="text-sm leading-relaxed text-gray-800 text-justify" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </section>
        );
      case 'workExperience':
        return (
          <section key="workExperience">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-300" style={{ color: accent }}>Professional Experience</h2>
            <div className="space-y-5">
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
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-sm font-bold text-gray-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <span className="text-xs text-gray-600 italic whitespace-nowrap ml-4" {...editableProps(['experience', index, 'dates'])}>{job.dates}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 italic" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1 text-sm text-gray-700">
                    {job.responsibilities.map((resp, i) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
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
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-300" style={{ color: accent }}>Education</h2>
            <div className="space-y-3">
              {cvData.education.map((edu, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-sm font-bold text-gray-900" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                    <span className="text-xs text-gray-600 italic whitespace-nowrap ml-4" {...editableProps(['education', index, 'year'])}>{edu.year}</span>
                  </div>
                  <p className="text-sm text-gray-700 italic" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                  {edu.description && (
                    <p className="text-xs text-gray-600 mt-0.5" dangerouslySetInnerHTML={{ __html: edu.description }} {...editableProps(['education', index, 'description'])} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case 'skills':
        return cvData.skills && cvData.skills.length > 0 ? (
          <section key="skills">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-2 pb-1 border-b border-gray-300" style={{ color: accent }}>Core Competencies</h2>
            {(() => {
              const cols = 3;
              const perCol = Math.ceil(cvData.skills.length / cols);
              const columns: string[][] = [];
              for (let i = 0; i < cols; i++) {
                columns.push(cvData.skills.slice(i * perCol, (i + 1) * perCol));
              }
              return (
                <div className="grid grid-cols-3 gap-x-8 gap-y-1">
                  {columns.map((col, ci) => (
                    <ul key={ci} className="list-disc list-outside ml-4 space-y-0.5">
                      {col.map((skill, si) => (
                        <li key={si} className="text-sm text-gray-800">{skill}</li>
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
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-300" style={{ color: accent }}>Notable Projects</h2>
            <div className="space-y-3">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-bold text-gray-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                    {proj.link && <a href={proj.link} className="text-xs text-blue-700 hover:underline" {...editableProps(['projects', index, 'link'])}>↗ Link</a>}
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <section key="languages">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-2 pb-1 border-b border-gray-300" style={{ color: accent }}>Languages</h2>
            <p className="text-sm text-gray-800">
              {cvData.languages.map((l, i) => (
                <span key={i}>{l.name} <span className="italic text-gray-600">({l.proficiency})</span>{i < (cvData.languages?.length ?? 0) - 1 && <span className="text-gray-400 mx-1.5">•</span>}</span>
              ))}
            </p>
          </section>
        ) : null;
      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <section key="references">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-300" style={{ color: accent }}>References</h2>
            <div className="grid grid-cols-2 gap-4">
              {cvData.references.map((ref, index) => (
                <div key={index} className="text-sm text-gray-700">
                  <p className="font-bold text-gray-900">{ref.name}</p>
                  <p className="text-gray-600">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
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
    <div id="cv-preview-executive" className="bg-white p-10 sm:p-14 text-gray-900 shadow-lg border font-serif" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <header className="text-center mb-6 pb-5 border-b-2" style={{ borderColor: accent }}>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 uppercase mb-2" style={{ letterSpacing: '0.08em' }}>
          {personalInfo.name}
        </h1>
        <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          {personalInfo.location && <span>{personalInfo.location}</span>}
          {personalInfo.phone && <><span className="text-gray-400">|</span><span>{personalInfo.phone}</span></>}
          {personalInfo.email && <><span className="text-gray-400">|</span><a href={`mailto:${personalInfo.email}`} className="text-blue-700 hover:underline">{personalInfo.email}</a></>}
          {personalInfo.linkedin && <><span className="text-gray-400">|</span><a href={personalInfo.linkedin} className="text-blue-700 hover:underline">LinkedIn</a></>}
          {personalInfo.github && <><span className="text-gray-400">|</span><a href={personalInfo.github} className="text-blue-700 hover:underline">GitHub</a></>}
          {personalInfo.website && <><span className="text-gray-400">|</span><a href={personalInfo.website} className="text-blue-700 hover:underline">Portfolio</a></>}
        </div>
      </header>

      <main className="space-y-5">
        {orderedSections.map(key => renderSection(key))}
        {cvData.publications && cvData.publications.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 pb-1 border-b border-gray-300" style={{ color: accent }}>Publications</h2>
            <div className="space-y-2">
              {cvData.publications.map((pub, index) => (
                <div key={index}>
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold" {...editableProps(['publications', index, 'title'])}>{pub.title}</span>.{' '}
                    <span className="italic" {...editableProps(['publications', index, 'authors'])}>{pub.authors.join(', ')}</span>.{' '}
                    <span className="text-gray-600" {...editableProps(['publications', index, 'journal'])}>{pub.journal}</span>, <span {...editableProps(['publications', index, 'year'])}>{pub.year}</span>.
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

export default TemplateExecutive;
