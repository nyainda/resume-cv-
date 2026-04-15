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

const TemplateSoftwareEngineer: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {

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

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-6">
      <h2 className="text-base font-bold uppercase tracking-wider text-slate-800 border-b-2 border-slate-200 pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h2 className="text-base font-bold uppercase tracking-wider text-slate-800 border-b-2 border-slate-200 pb-1 mb-3">{title}</h2>
  );

  const orderedSections = cvData.sectionOrder || DEFAULT_SECTION_ORDER;

  const renderSection = (key: ProfileSectionKey): React.ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <Section key="summary" title="Summary">
            <p className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
          </Section>
        );
      case 'skills':
        return cvData.skills.length > 0 ? (
          <Section key="skills" title="Skills">
            <div className="font-mono text-xs">
              {cvData.skills.slice(0, 15).map((skill, i) => (
                <span key={i} className="inline-block bg-slate-100 rounded-sm px-2 py-1 mr-2 mb-2">{skill}</span>
              ))}
            </div>
          </Section>
        ) : null;
      case 'workExperience':
        return (
          <Section key="workExperience" title="Experience">
            <div className="space-y-5">
              {cvData.experience.map((job, index) => (
                <div key={index}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-lg font-semibold" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <p className="text-sm font-medium text-slate-500" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                  </div>
                  <p className="text-md font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-1 text-sm">
                    {job.responsibilities.map((resp, i) => <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />)}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        );
      case 'projects':
        return cvData.projects && cvData.projects.length > 0 ? (
          <Section key="projects" title="Projects">
            <div className="space-y-4">
              {cvData.projects.map((proj, index) => (
                <div key={index}>
                  <h3 className="text-lg font-semibold inline-block mr-2" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                  {proj.link && <a href={proj.link} className="text-sm text-blue-600 underline" {...editableProps(['projects', index, 'link'])}>[Link]</a>}
                  <p className="text-sm mt-1" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                </div>
              ))}
            </div>
          </Section>
        ) : null;
      case 'education':
        return cvData.education.length > 0 ? (
          <Section key="education" title="Education">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cvData.education.map((edu, index) => (
                <div key={index}>
                  <h3 className="text-lg font-semibold" {...editableProps(['education', index, 'degree'])}>{edu.degree}</h3>
                  <p className="text-md text-slate-600">{edu.school} - {edu.year}</p>
                </div>
              ))}
            </div>
          </Section>
        ) : null;
      case 'languages':
        return cvData.languages && cvData.languages.length > 0 ? (
          <Section key="languages" title="Languages">
            <p className="text-sm">
              {cvData.languages.map((l, i) => (
                <span key={i}>
                  <span className="font-semibold">{l.name}</span> ({l.proficiency}){i < cvData.languages.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </Section>
        ) : null;
      case 'references':
        return cvData.references && cvData.references.length > 0 ? (
          <Section key="references" title="References">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {cvData.references.map((ref, index) => (
                <div key={index}>
                  <p className="font-bold">{ref.name}</p>
                  <p className="text-slate-600">{ref.title}{ref.company ? `, ${ref.company}` : ''}</p>
                  {ref.email && <p>{ref.email}</p>}
                </div>
              ))}
            </div>
          </Section>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div id="cv-preview-software-engineer" className="bg-white p-10 text-slate-800 shadow-lg border font-sans">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight">{personalInfo.name}</h1>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
          <span>{personalInfo.location}</span>
          <span className="text-slate-300">|</span>
          <span>{personalInfo.phone}</span>
          <span className="text-slate-300">|</span>
          <span>{personalInfo.email}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 text-sm text-blue-600 mt-1">
          {personalInfo.linkedin && <a href={personalInfo.linkedin} className="hover:underline">LinkedIn</a>}
          {personalInfo.github && <><span className="text-slate-300">|</span><a href={personalInfo.github} className="hover:underline">GitHub</a></>}
          {personalInfo.website && <><span className="text-slate-300">|</span><a href={personalInfo.website} className="hover:underline">Portfolio</a></>}
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

export default TemplateSoftwareEngineer;
