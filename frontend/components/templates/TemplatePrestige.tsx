import React, { useCallback } from 'react';
import {
  Mail, Phone, MapPin, Globe, Linkedin, Github,
  Briefcase, FolderOpen, BookOpen, GraduationCap, Languages, Star, ChevronRight
} from 'lucide-react';
import HiddenATSKeywords from '../HiddenATSKeywords';
import { CVData, PersonalInfo } from '../../types';
import { Trash } from '../icons';
import { TemplateCustomSections } from './sharedSections';

interface TemplateProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  isEditing: boolean;
  onDataChange: (newData: CVData) => void;
  jobDescriptionForATS: string;
}

const TemplatePrestige: React.FC<TemplateProps> = ({ cvData, personalInfo, isEditing, onDataChange, jobDescriptionForATS }) => {
  const gold = cvData.accentColor ?? '#C9A84C';

  const handleUpdate = useCallback((path: (string | number)[], value: any) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    let current: any = newCvData;
    for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
    current[path[path.length - 1]] = value;
    onDataChange(newCvData);
  }, [cvData, onDataChange]);

  const handleDeleteExperience = (index: number) => {
    const newCvData = JSON.parse(JSON.stringify(cvData));
    newCvData.experience.splice(index, 1);
    onDataChange(newCvData);
  };

  const editableProps = (path: (string | number)[]) => isEditing ? {
    contentEditable: true, suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => handleUpdate(path, e.currentTarget.innerHTML),
    className: "outline-none ring-1 ring-transparent focus:ring-amber-400 focus:bg-amber-50 rounded px-0.5 transition-all"
  } : {};

  // ── Sidebar section label ──────────────────────────────────────────────────
  const SidebarLabel = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1 rounded" style={{ backgroundColor: gold + '25' }}>{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">{text}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: gold + '30' }} />
    </div>
  );

  // ── Main section heading ───────────────────────────────────────────────────
  const MainHeading = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-md" style={{ backgroundColor: gold + '20', color: gold }}>
        {icon}
      </div>
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">{text}</h2>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );

  // Initials from full name
  const initials = personalInfo.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div id="cv-preview-prestige" className="bg-white shadow-xl border border-slate-200 flex flex-col min-h-[280mm]" style={{ fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" }}>
      <div className="grid grid-cols-12 flex-1">

        {/* ═══════════════════════════════════════════════════════════
            SIDEBAR — deep navy with gold accents
        ════════════════════════════════════════════════════════════ */}
        <div className="col-span-4 flex flex-col gap-4 p-5" style={{ backgroundColor: '#0F172A' }}>

          {/* Avatar + Name */}
          <div className="flex flex-col items-center text-center pb-4" style={{ borderBottom: `1px solid ${gold}30` }}>
            {personalInfo.photo ? (
              <img src={personalInfo.photo} alt={personalInfo.name}
                className="w-20 h-20 rounded-full object-cover mb-3"
                style={{ border: `3px solid ${gold}` }} />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3 text-2xl font-black"
                style={{ backgroundColor: gold + '20', border: `3px solid ${gold}`, color: gold }}>
                {initials}
              </div>
            )}
            <h1 className="text-base font-black text-white leading-tight tracking-tight">{personalInfo.name}</h1>
            {/* Gold decorative line */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="h-px w-6" style={{ backgroundColor: gold }} />
              <Star size={8} style={{ color: gold }} />
              <div className="h-px w-6" style={{ backgroundColor: gold }} />
            </div>
          </div>

          {/* Contact */}
          <div>
            <SidebarLabel icon={<Mail size={11} style={{ color: gold }} />} text="Contact" />
            <ul className="space-y-1.5 text-xs text-slate-300">
              {personalInfo.email && (
                <li className="flex items-center gap-2">
                  <Mail size={11} className="shrink-0 opacity-40" />
                  <span className="truncate">{personalInfo.email}</span>
                </li>
              )}
              {personalInfo.phone && (
                <li className="flex items-center gap-2">
                  <Phone size={11} className="shrink-0 opacity-40" />
                  <span>{personalInfo.phone}</span>
                </li>
              )}
              {personalInfo.location && (
                <li className="flex items-center gap-2">
                  <MapPin size={11} className="shrink-0 opacity-40" />
                  <span>{personalInfo.location}</span>
                </li>
              )}
              {personalInfo.linkedin && (
                <li className="flex items-center gap-2">
                  <Linkedin size={11} className="shrink-0 opacity-40" />
                  <a href={personalInfo.linkedin} className="underline opacity-80 truncate">LinkedIn</a>
                </li>
              )}
              {personalInfo.github && (
                <li className="flex items-center gap-2">
                  <Github size={11} className="shrink-0 opacity-40" />
                  <a href={personalInfo.github} className="underline opacity-80 truncate">GitHub</a>
                </li>
              )}
              {personalInfo.website && (
                <li className="flex items-center gap-2">
                  <Globe size={11} className="shrink-0 opacity-40" />
                  <a href={personalInfo.website} className="underline opacity-80 truncate">Portfolio</a>
                </li>
              )}
            </ul>
          </div>

          {/* Profile / Summary */}
          {cvData.summary && (
            <div>
              <SidebarLabel icon={<Star size={11} style={{ color: gold }} />} text="Profile" />
              <p className="text-xs text-slate-400 leading-relaxed italic" dangerouslySetInnerHTML={{ __html: cvData.summary }} {...editableProps(['summary'])} />
            </div>
          )}

          {/* Skills */}
          {cvData.skills && cvData.skills.length > 0 && (
            <div>
              <SidebarLabel icon={<ChevronRight size={11} style={{ color: gold }} />} text="Expertise" />
              <div className="flex flex-wrap gap-1.5">
                {cvData.skills.slice(0, 14).map((skill, i) => (
                  <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-sm text-white/80"
                    style={{ backgroundColor: gold + '18', border: `1px solid ${gold}30` }}
                    {...editableProps(['skills', i])}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {cvData.education && cvData.education.length > 0 && (
            <div>
              <SidebarLabel icon={<GraduationCap size={11} style={{ color: gold }} />} text="Education" />
              <div className="space-y-2">
                {cvData.education.map((edu, i) => (
                  <div key={i} className="pl-2" style={{ borderLeft: `2px solid ${gold}40` }}>
                    <p className="text-xs font-bold text-white leading-tight" {...editableProps(['education', i, 'degree'])}>{edu.degree}</p>
                    <p className="text-[10px] font-medium" style={{ color: gold + 'cc' }} {...editableProps(['education', i, 'school'])}>{edu.school}</p>
                    <p className="text-[10px] text-slate-500" {...editableProps(['education', i, 'year'])}>{edu.year}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {cvData.languages && cvData.languages.length > 0 && (
            <div>
              <SidebarLabel icon={<Languages size={11} style={{ color: gold }} />} text="Languages" />
              <div className="space-y-2">
                {cvData.languages.map((lang, i) => {
                  const pct = lang.proficiency.toLowerCase().includes('native') || lang.proficiency.toLowerCase().includes('fluent') ? 100
                    : lang.proficiency.toLowerCase().includes('advanced') ? 80
                    : lang.proficiency.toLowerCase().includes('intermediate') ? 60
                    : 40;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="font-bold text-white">{lang.name}</span>
                        <span className="text-slate-500">{lang.proficiency}</span>
                      </div>
                      <div className="w-full rounded-full h-1" style={{ backgroundColor: gold + '20' }}>
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: gold }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            MAIN — clean white with icon-headed sections
        ════════════════════════════════════════════════════════════ */}
        <div className="col-span-8 p-7 flex flex-col gap-5" style={{ borderLeft: `3px solid ${gold}` }}>

          {/* Experience */}
          <section>
            <MainHeading icon={<Briefcase size={13} />} text="Experience" />
            <div className="space-y-4">
              {cvData.experience.map((job, index) => (
                <div key={index} className="relative group">
                  {isEditing && (
                    <button onClick={() => handleDeleteExperience(index)}
                      className="absolute -left-10 top-0 p-1.5 text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 bg-white shadow-sm z-10">
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Role header */}
                  <div className="flex justify-between items-start mb-0.5">
                    <h3 className="text-sm font-black text-slate-900 leading-tight" {...editableProps(['experience', index, 'jobTitle'])}>{job.jobTitle}</h3>
                    <span className="text-[10px] font-bold shrink-0 ml-3 mt-0.5 px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: gold + 'cc' }}
                      {...editableProps(['experience', index, 'dates'])}>
                      {job.dates}
                    </span>
                  </div>
                  <p className="text-xs font-bold mb-1.5" style={{ color: gold }} {...editableProps(['experience', index, 'company'])}>{job.company}</p>
                  {/* Bullets */}
                  <ul className="space-y-1">
                    {job.responsibilities.map((resp, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-600 leading-snug">
                        <span className="shrink-0 mt-0.5 font-black" style={{ color: gold }}>▸</span>
                        <span dangerouslySetInnerHTML={{ __html: resp }} {...editableProps(['experience', index, 'responsibilities', i])} />
                      </li>
                    ))}
                  </ul>
                  {/* Subtle separator (except last) */}
                  {index < cvData.experience.length - 1 && (
                    <div className="mt-3 h-px" style={{ background: `linear-gradient(to right, ${gold}30, transparent)` }} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          {cvData.projects && cvData.projects.length > 0 && (
            <section>
              <MainHeading icon={<FolderOpen size={13} />} text="Projects" />
              <div className="space-y-3">
                {cvData.projects.map((proj, index) => (
                  <div key={index} className="pl-3" style={{ borderLeft: `2px solid ${gold}40` }}>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-xs font-black text-slate-900" {...editableProps(['projects', index, 'name'])}>{proj.name}</h3>
                      {proj.link && <a href={proj.link} className="text-[10px] underline truncate" style={{ color: gold }}>{proj.link}</a>}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5" dangerouslySetInnerHTML={{ __html: proj.description }} {...editableProps(['projects', index, 'description'])} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Publications */}
          {cvData.publications && cvData.publications.length > 0 && (
            <section>
              <MainHeading icon={<BookOpen size={13} />} text="Publications" />
              <div className="space-y-2">
                {cvData.publications.map((pub, index) => (
                  <div key={index} className="pl-3" style={{ borderLeft: `2px solid ${gold}40` }}>
                    <h3 className="text-xs font-semibold text-slate-800" {...editableProps(['publications', index, 'title'])}>{pub.title}</h3>
                    <p className="text-[10px] text-slate-500">{pub.journal}, {pub.year}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <TemplateCustomSections
            customSections={cvData.customSections} references={cvData.references}
            renderHeader={title => <MainHeading icon={<Star size={13} />} text={title} />}
            sectionClassName="mb-4" titleClass="font-semibold text-xs text-slate-800"
            subtitleClass="text-[10px] text-slate-500" descClass="text-[10px] text-slate-600 mt-0.5" yearClass="text-[10px] text-slate-400"
          />
        </div>
      </div>

      {/* Bottom gold bar */}
      <div className="h-1" style={{ backgroundColor: gold }} />

      {jobDescriptionForATS && <HiddenATSKeywords text={jobDescriptionForATS} />}
    </div>
  );
};

export default TemplatePrestige;
