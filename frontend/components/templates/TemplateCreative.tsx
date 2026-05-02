import React, { useCallback } from 'react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo } from '../../types';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const SIDEBAR_COLOR = '#0f766e';
const SIDEBAR_WIDTH = '33.33%';

const TemplateCreative: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  // Allow accent color override from cvData — shadows module-level constant
  // eslint-disable-next-line no-shadow
  const SIDEBAR_COLOR = cvData.accentColor ?? '#0f766e';

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
    className: "outline-none ring-1 ring-transparent focus:ring-teal-400 focus:bg-teal-100/50 rounded px-1 -mx-1 transition-all"
  } : {};

  return (
    <div id="cv-preview-creative" className="bg-white shadow-lg border" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* gradient paints the teal sidebar on every page when content overflows */}
      <div className="flex min-h-[297mm]" style={{ backgroundImage: `linear-gradient(to right, ${SIDEBAR_COLOR} ${SIDEBAR_WIDTH}, white ${SIDEBAR_WIDTH})` }}>

        {/* Left Sidebar — background comes from parent gradient */}
        <div className="flex-shrink-0 text-white p-5 flex flex-col" style={{ width: SIDEBAR_WIDTH }}>
          <div className="flex flex-col items-center text-center mb-5">
            {personalInfo.photo ? (
              <img
                src={personalInfo.photo}
                alt={personalInfo.name}
                className="w-20 h-20 rounded-full object-cover mb-3 border-4 border-teal-300"
              />
            ) : (
              <div className="w-20 h-20 rounded-full mb-3 flex items-center justify-center text-2xl font-bold" style={{ backgroundColor: '#0d9488' }}>
                <span>{personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}</span>
              </div>
            )}
            <h1 className="text-lg font-bold tracking-tight leading-tight">{personalInfo.name}</h1>
            {cvData.experience.length > 0 && (
              <p className="text-[10px] text-teal-200 mt-0.5">{cvData.experience[0].jobTitle}</p>
            )}
          </div>

          <div className="space-y-4">
            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-teal-200 border-b border-teal-600 pb-1 mb-2">Contact</h2>
              <ul className="space-y-1 text-xs break-words">
                {personalInfo.email && <li>{personalInfo.email}</li>}
                {personalInfo.phone && <li>{personalInfo.phone}</li>}
                {personalInfo.location && <li>{personalInfo.location}</li>}
                {personalInfo.linkedin && <li><a href={personalInfo.linkedin} className="underline">LinkedIn</a></li>}
                {personalInfo.website && <li><a href={personalInfo.website} className="underline">Website</a></li>}
                {personalInfo.github && <li><a href={personalInfo.github} className="underline">GitHub</a></li>}
              </ul>
            </section>

            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-teal-200 border-b border-teal-600 pb-1 mb-2">Skills</h2>
              <div className="flex flex-wrap gap-1">
                {cvData.skills.slice(0, 18).map((skill, i) => (
                  <span key={i} className="text-[9px] font-medium px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: '#0d9488' }}>{skill}</span>
                ))}
              </div>
            </section>

            {cvData.languages && cvData.languages.length > 0 && (
              <section>
                <h2 className="text-[9px] font-bold uppercase tracking-widest text-teal-200 border-b border-teal-600 pb-1 mb-2">Languages</h2>
                <ul className="space-y-0.5 text-xs">
                  {cvData.languages.map((lang, index) => (
                    <li key={index}>
                      <span {...editableProps(['languages', index, 'name'])}>{lang.name}</span>
                      <span className="text-teal-300"> — </span>
                      <span className="text-teal-200" {...editableProps(['languages', index, 'proficiency'])}>{lang.proficiency}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-[9px] font-bold uppercase tracking-widest text-teal-200 border-b border-teal-600 pb-1 mb-2">Education</h2>
              <div className="space-y-2">
                {cvData.education.map((edu, index) => (
                  <div key={index} className="text-xs">
                    <p className="font-bold leading-snug" {...editableProps(['education', index, 'degree'])}>{edu.degree}</p>
                    <p className="text-teal-200 text-[10px]" {...editableProps(['education', index, 'school'])}>{edu.school}</p>
                    <p className="text-teal-300 text-[10px]" {...editableProps(['education', index, 'year'])}>{edu.year}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 text-slate-800">
          <main className="space-y-5">
            {cvData.summary && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b" style={{ color: SIDEBAR_COLOR, borderColor: '#99f6e4' }}>Profile</h2>
                <p className="text-xs leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b" style={{ color: SIDEBAR_COLOR, borderColor: '#99f6e4' }}>Experience</h2>
              <div className="space-y-3">
                {cvData.experience.map((job, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-baseline gap-2">
                      <h3 className="text-xs font-bold text-slate-900" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                      <p className="text-[10px] font-medium text-slate-500 whitespace-nowrap flex-shrink-0" {...editableProps(['experience', index, 'dates'])}>{job.dates}</p>
                    </div>
                    <p className="text-[10px] font-medium text-slate-600" {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                    <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-[10px] text-slate-700">
                      {job.responsibilities.map((resp, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {cvData.projects && cvData.projects.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b" style={{ color: SIDEBAR_COLOR, borderColor: '#99f6e4' }}>Projects</h2>
                <div className="space-y-2">
                  {cvData.projects.map((proj, index) => (
                    <div key={index}>
                      <h3 className="text-xs font-semibold text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      <p className="text-[10px] text-slate-700" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                      {proj.link && (
                        <a href={proj.link} className="text-[10px] underline" style={{ color: SIDEBAR_COLOR }} {...editableProps(['projects', index, 'link'])}>{proj.link}</a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          
        <TemplateCustomSections
          customSections={cvData.customSections}
          references={cvData.references}
          renderHeader={title => <h2 className="text-xs font-bold uppercase tracking-wider pb-1 mb-2 border-b" style={{ color: SIDEBAR_COLOR, borderColor: '#99f6e4' }}>{title}</h2>}
          sectionClassName="mb-5"
          titleClass="font-semibold text-sm"
          subtitleClass="text-xs text-slate-500"
          descClass="text-xs text-slate-600 mt-0.5"
          yearClass="text-xs text-slate-500"
        />
</main>
        </div>
      </div>

      {jobDescriptionForATS && (
        <HiddenATSKeywords text={jobDescriptionForATS} />
      )}
    </div>
  );
};

export default TemplateCreative;
