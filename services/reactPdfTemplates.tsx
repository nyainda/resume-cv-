import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer';
import { CVData, PersonalInfo, TemplateName } from '../types';

// Built-in PDF fonts — no network required, always render correctly:
// Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique
// Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic
// Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique
// @react-pdf/renderer only supports TTF/OTF for custom fonts — woff2 silently fails.

const decode = (html: string) => html
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const professionalStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#18181b', padding: '30 40', lineHeight: 1.4 },
  header: { borderBottom: '2px solid #1e3a8a', paddingBottom: 10, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: 700, color: '#1e3a8a', marginBottom: 3 },
  contact: { fontSize: 8.5, color: '#64748b', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  contactItem: { fontSize: 8.5, color: '#64748b' },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: '#334155', letterSpacing: 1.2, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: 2, marginBottom: 6 },
  summary: { fontSize: 9.5, color: '#374151', lineHeight: 1.6 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  jobTitle: { fontSize: 10, fontWeight: 700, color: '#1e293b' },
  dates: { fontSize: 9, color: '#64748b' },
  company: { fontSize: 9.5, color: '#475569', marginBottom: 3 },
  bullet: { flexDirection: 'row', gap: 5, marginBottom: 2 },
  bulletDot: { fontSize: 9, color: '#1e3a8a', marginTop: 1 },
  bulletText: { fontSize: 9, color: '#374151', flex: 1, lineHeight: 1.5 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  skill: { fontSize: 8.5, backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2 6', borderRadius: 3 },
  eduRow: { flexDirection: 'row', justifyContent: 'space-between' },
  degree: { fontSize: 10, fontWeight: 700, color: '#1e293b' },
  school: { fontSize: 9.5, color: '#475569' },
  year: { fontSize: 9, color: '#64748b' },
});

const ProfessionalPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => {
  // Honor the user's accent-color choice in the react-pdf fallback so this
  // path (used only when both the local Playwright server AND the Cloudflare
  // worker are unavailable) still matches the on-screen preview's color.
  // Default falls back to the original navy if the user hasn't picked one.
  const accent = cvData.accentColor ?? '#1e3a8a';
  const headerStyle = { ...professionalStyles.header, borderBottom: `2px solid ${accent}` };
  const nameStyle = { ...professionalStyles.name, color: accent };
  const dotStyle = { ...professionalStyles.bulletDot, color: accent };
  return (
  <Page size="A4" style={professionalStyles.page}>
    <View style={headerStyle}>
      <Text style={nameStyle}>{personalInfo.name}</Text>
      <View style={professionalStyles.contact}>
        {personalInfo.email && <Text style={professionalStyles.contactItem}>{personalInfo.email}</Text>}
        {personalInfo.phone && <Text style={professionalStyles.contactItem}>  |  {personalInfo.phone}</Text>}
        {personalInfo.location && <Text style={professionalStyles.contactItem}>  |  {personalInfo.location}</Text>}
        {personalInfo.linkedin && <Text style={professionalStyles.contactItem}>  |  LinkedIn</Text>}
        {personalInfo.github && <Text style={professionalStyles.contactItem}>  |  GitHub</Text>}
      </View>
    </View>

    {cvData.summary ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Professional Summary</Text>
        <Text style={professionalStyles.summary}>{decode(cvData.summary)}</Text>
      </View>
    ) : null}

    {cvData.experience.length > 0 ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Experience</Text>
        {cvData.experience.map((exp, i) => (
          <View key={i} style={{ marginBottom: 8 }}>
            <View style={professionalStyles.expRow}>
              <Text style={professionalStyles.jobTitle}>{exp.jobTitle}</Text>
              <Text style={professionalStyles.dates}>{exp.dates}</Text>
            </View>
            <Text style={professionalStyles.company}>{exp.company}</Text>
            {exp.responsibilities.map((r, j) => (
              <View key={j} style={professionalStyles.bullet}>
                <Text style={dotStyle}>•</Text>
                <Text style={professionalStyles.bulletText}>{decode(r)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    ) : null}

    {cvData.education.length > 0 ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Education</Text>
        {cvData.education.map((edu, i) => (
          <View key={i} style={{ marginBottom: 5 }}>
            <View style={professionalStyles.eduRow}>
              <Text style={professionalStyles.degree}>{edu.degree}</Text>
              <Text style={professionalStyles.year}>{edu.year}</Text>
            </View>
            <Text style={professionalStyles.school}>{edu.school}</Text>
            {edu.description ? <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{edu.description}</Text> : null}
          </View>
        ))}
      </View>
    ) : null}

    {cvData.skills.length > 0 ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Skills</Text>
        <View style={professionalStyles.skillsRow}>
          {cvData.skills.map((skill, i) => (
            <Text key={i} style={professionalStyles.skill}>{skill}</Text>
          ))}
        </View>
      </View>
    ) : null}

    {cvData.projects && cvData.projects.length > 0 ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Projects</Text>
        {cvData.projects.map((proj, i) => (
          <View key={i} style={{ marginBottom: 5 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: '#1e293b' }}>{proj.name}</Text>
            <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>{decode(proj.description)}</Text>
          </View>
        ))}
      </View>
    ) : null}

    {cvData.languages && cvData.languages.length > 0 ? (
      <View style={professionalStyles.section}>
        <Text style={professionalStyles.sectionTitle}>Languages</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cvData.languages.map((lang, i) => (
            <Text key={i} style={{ fontSize: 9, color: '#374151' }}>{lang.name} — {lang.proficiency}</Text>
          ))}
        </View>
      </View>
    ) : null}
    {hidden}
  </Page>
  );
};

const standardProStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', padding: '30 50', lineHeight: 1.4 },
  header: { textAlign: 'center', borderBottom: '1px solid #111827', paddingBottom: 8, marginBottom: 10 },
  name: { fontSize: 20, fontWeight: 700, marginBottom: 3 },
  contact: { fontSize: 8.5, color: '#374151', flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #111827', paddingBottom: 2, marginBottom: 5 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  jobTitle: { fontSize: 10, fontWeight: 700 },
  dates: { fontSize: 9, color: '#374151' },
  company: { fontSize: 9.5, color: '#374151', marginBottom: 2 },
  bullet: { flexDirection: 'row', gap: 6, marginBottom: 2, marginLeft: 8 },
  bulletText: { fontSize: 9, flex: 1, lineHeight: 1.5 },
  skillTag: { fontSize: 9, backgroundColor: '#f3f4f6', padding: '2 5', borderRadius: 2 },
});

const StandardProPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => (
  <Page size="A4" style={standardProStyles.page}>
    <View style={standardProStyles.header}>
      <Text style={standardProStyles.name}>{personalInfo.name}</Text>
      <View style={standardProStyles.contact}>
        {personalInfo.email && <Text>{personalInfo.email}</Text>}
        {personalInfo.phone && <Text> | {personalInfo.phone}</Text>}
        {personalInfo.location && <Text> | {personalInfo.location}</Text>}
        {personalInfo.linkedin && <Text> | LinkedIn</Text>}
        {personalInfo.github && <Text> | GitHub</Text>}
      </View>
    </View>

    {cvData.experience.length > 0 && (
      <View style={standardProStyles.section}>
        <Text style={standardProStyles.sectionTitle}>Experience</Text>
        {cvData.experience.map((exp, i) => (
          <View key={i} style={{ marginBottom: 7 }}>
            <View style={standardProStyles.expRow}>
              <Text style={standardProStyles.jobTitle}>{exp.jobTitle}</Text>
              <Text style={standardProStyles.dates}>{exp.dates}</Text>
            </View>
            <Text style={standardProStyles.company}>{exp.company}</Text>
            {exp.responsibilities.map((r, j) => (
              <View key={j} style={standardProStyles.bullet}>
                <Text>•</Text>
                <Text style={standardProStyles.bulletText}>{decode(r)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    )}

    {cvData.education.length > 0 && (
      <View style={standardProStyles.section}>
        <Text style={standardProStyles.sectionTitle}>Education</Text>
        {cvData.education.map((edu, i) => (
          <View key={i} style={{ marginBottom: 5, flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: 700 }}>{edu.degree}</Text>
              <Text style={{ fontSize: 9.5, color: '#374151' }}>{edu.school}</Text>
            </View>
            <Text style={{ fontSize: 9, color: '#374151' }}>{edu.year}</Text>
          </View>
        ))}
      </View>
    )}

    {cvData.skills.length > 0 && (
      <View style={standardProStyles.section}>
        <Text style={standardProStyles.sectionTitle}>Skills</Text>
        <Text style={{ fontSize: 9.5, lineHeight: 1.5 }}>{cvData.skills.join(' • ')}</Text>
      </View>
    )}

    {cvData.projects && cvData.projects.length > 0 && (
      <View style={standardProStyles.section}>
        <Text style={standardProStyles.sectionTitle}>Projects</Text>
        {cvData.projects.map((proj, i) => (
          <View key={i} style={{ marginBottom: 5 }}>
            <Text style={{ fontSize: 10, fontWeight: 700 }}>{proj.name}</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{decode(proj.description)}</Text>
          </View>
        ))}
      </View>
    )}
    {hidden}
  </Page>
);

const minimalistStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#18181b', padding: '35 45', lineHeight: 1.4 },
  name: { fontSize: 24, fontWeight: 700, color: '#09090b', marginBottom: 2 },
  title: { fontSize: 11, color: '#71717a', marginBottom: 8 },
  contact: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14, borderBottom: '1px solid #e4e4e7', paddingBottom: 10 },
  contactItem: { fontSize: 8.5, color: '#71717a' },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 8.5, fontWeight: 700, color: '#3f3f46', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  summary: { fontSize: 9.5, color: '#3f3f46', lineHeight: 1.7 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  jobTitle: { fontSize: 10, fontWeight: 700, color: '#09090b' },
  dates: { fontSize: 8.5, color: '#71717a' },
  company: { fontSize: 9, color: '#52525b', marginBottom: 3 },
  bullet: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  bulletText: { fontSize: 9, color: '#3f3f46', flex: 1, lineHeight: 1.5 },
});

const MinimalistPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => (
  <Page size="A4" style={minimalistStyles.page}>
    <Text style={minimalistStyles.name}>{personalInfo.name}</Text>
    <View style={minimalistStyles.contact}>
      {personalInfo.email && <Text style={minimalistStyles.contactItem}>{personalInfo.email}</Text>}
      {personalInfo.phone && <Text style={minimalistStyles.contactItem}>{personalInfo.phone}</Text>}
      {personalInfo.location && <Text style={minimalistStyles.contactItem}>{personalInfo.location}</Text>}
      {personalInfo.linkedin && <Text style={minimalistStyles.contactItem}>LinkedIn</Text>}
      {personalInfo.website && <Text style={minimalistStyles.contactItem}>{personalInfo.website}</Text>}
    </View>

    {cvData.summary && (
      <View style={minimalistStyles.section}>
        <Text style={minimalistStyles.sectionTitle}>About</Text>
        <Text style={minimalistStyles.summary}>{decode(cvData.summary)}</Text>
      </View>
    )}

    {cvData.experience.length > 0 && (
      <View style={minimalistStyles.section}>
        <Text style={minimalistStyles.sectionTitle}>Experience</Text>
        {cvData.experience.map((exp, i) => (
          <View key={i} style={{ marginBottom: 8 }}>
            <View style={minimalistStyles.expRow}>
              <Text style={minimalistStyles.jobTitle}>{exp.jobTitle}</Text>
              <Text style={minimalistStyles.dates}>{exp.dates}</Text>
            </View>
            <Text style={minimalistStyles.company}>{exp.company}</Text>
            {exp.responsibilities.map((r, j) => (
              <View key={j} style={minimalistStyles.bullet}>
                <Text style={{ fontSize: 9, color: '#a1a1aa' }}>—</Text>
                <Text style={minimalistStyles.bulletText}>{decode(r)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    )}

    {cvData.education.length > 0 && (
      <View style={minimalistStyles.section}>
        <Text style={minimalistStyles.sectionTitle}>Education</Text>
        {cvData.education.map((edu, i) => (
          <View key={i} style={{ marginBottom: 5 }}>
            <View style={minimalistStyles.expRow}>
              <Text style={minimalistStyles.jobTitle}>{edu.degree}</Text>
              <Text style={minimalistStyles.dates}>{edu.year}</Text>
            </View>
            <Text style={minimalistStyles.company}>{edu.school}</Text>
          </View>
        ))}
      </View>
    )}

    {cvData.skills.length > 0 && (
      <View style={minimalistStyles.section}>
        <Text style={minimalistStyles.sectionTitle}>Skills</Text>
        <Text style={{ fontSize: 9.5, color: '#3f3f46', lineHeight: 1.7 }}>{cvData.skills.join('  ·  ')}</Text>
      </View>
    )}
    {hidden}
  </Page>
);

// Built-in font aliases for clarity
const TR = 'Times-Roman';
const TB = 'Times-Bold';
const TI = 'Times-Italic';

const lf = StyleSheet.create({
  page:         { fontFamily: TR, fontSize: 10, color: '#1c1c1c', padding: '40 50', lineHeight: 1.4 },
  header:       { textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 18, marginBottom: 14 },
  name:         { fontFamily: TB, fontSize: 22, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  contactRow:   { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  contactItem:  { fontFamily: TR, fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8 },
  contactSep:   { fontFamily: TR, fontSize: 8, color: '#475569', marginHorizontal: 4 },
  section:      { marginBottom: 10 },
  secBorder:    { borderBottom: '1px solid #0f172a', paddingBottom: 2, marginBottom: 6 },
  secTitle:     { fontFamily: TB, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1.5, color: '#0f172a' },
  summary:      { fontFamily: TI, fontSize: 9, lineHeight: 1.6, textAlign: 'justify' },
  expBlock:     { marginBottom: 12 },
  expTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  company:      { fontFamily: TB, fontSize: 10, textTransform: 'uppercase' },
  dates:        { fontFamily: TB, fontSize: 8.5, textTransform: 'uppercase' },
  expSubRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  jobTitle:     { fontFamily: TI, fontSize: 9.5, color: '#3f3f46' },
  location:     { fontFamily: TR, fontSize: 9, color: '#52525b' },
  bullet:       { flexDirection: 'row', gap: 6, marginBottom: 2, marginLeft: 12 },
  bulletDot:    { fontFamily: TR, fontSize: 8.5 },
  bulletText:   { fontFamily: TR, fontSize: 8.5, flex: 1, lineHeight: 1.5, textAlign: 'justify' },
  eduBlock:     { marginBottom: 8 },
  eduTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  school:       { fontFamily: TB, fontSize: 10, textTransform: 'uppercase' },
  year:         { fontFamily: TB, fontSize: 8.5 },
  degree:       { fontFamily: TI, fontSize: 9.5, color: '#3f3f46', marginTop: 1 },
  eduDesc:      { fontFamily: TR, fontSize: 8.5, color: '#475569', marginTop: 2 },
  addRow:       { flexDirection: 'row', marginBottom: 4 },
  addLabel:     { fontFamily: TB, fontSize: 8.5, textTransform: 'uppercase', minWidth: 100 },
  addValue:     { fontFamily: TR, fontSize: 8.5, flex: 1, lineHeight: 1.5 },
  linkedinBold: { fontFamily: TB, fontSize: 8, textTransform: 'uppercase', color: '#0f172a', letterSpacing: 0.8 },
});

const LondonFinancePDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => {
  const contacts = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean);
  return (
    <Page size="A4" style={lf.page}>
      <View style={lf.header}>
        <Text style={lf.name}>{personalInfo.name}</Text>
        <View style={lf.contactRow}>
          {contacts.map((c, i) => (
            <React.Fragment key={i}>
              <Text style={lf.contactItem}>{c}</Text>
              {i < contacts.length - 1 && <Text style={lf.contactSep}>  •  </Text>}
            </React.Fragment>
          ))}
          {personalInfo.linkedin && (
            <>
              <Text style={lf.contactSep}>  •  </Text>
              <Text style={lf.linkedinBold}>LINKEDIN</Text>
            </>
          )}
        </View>
      </View>

      {cvData.summary ? (
        <View style={lf.section}>
          <View style={lf.secBorder}><Text style={lf.secTitle}>Professional Profile</Text></View>
          <Text style={lf.summary}>{decode(cvData.summary)}</Text>
        </View>
      ) : null}

      {cvData.experience.length > 0 ? (
        <View style={lf.section}>
          <View style={lf.secBorder}><Text style={lf.secTitle}>Professional Experience</Text></View>
          {cvData.experience.map((exp, i) => (
            <View key={i} style={lf.expBlock}>
              <View style={lf.expTopRow}>
                <Text style={lf.company}>{exp.company}</Text>
                <Text style={lf.dates}>{exp.dates}</Text>
              </View>
              <View style={lf.expSubRow}>
                <Text style={lf.jobTitle}>{exp.jobTitle}</Text>
                <Text style={lf.location}>{personalInfo.location}</Text>
              </View>
              {exp.responsibilities.map((r, j) => (
                <View key={j} style={lf.bullet}>
                  <Text style={lf.bulletDot}>•</Text>
                  <Text style={lf.bulletText}>{decode(r)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {cvData.education.length > 0 ? (
        <View style={lf.section}>
          <View style={lf.secBorder}><Text style={lf.secTitle}>Education</Text></View>
          {cvData.education.map((edu, i) => (
            <View key={i} style={lf.eduBlock}>
              <View style={lf.eduTopRow}>
                <Text style={lf.school}>{edu.school}</Text>
                <Text style={lf.year}>{edu.year}</Text>
              </View>
              <Text style={lf.degree}>{edu.degree}</Text>
              {edu.description ? <Text style={lf.eduDesc}>{decode(edu.description)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={lf.section}>
        <View style={lf.secBorder}><Text style={lf.secTitle}>Additional Information</Text></View>
        {cvData.skills.length > 0 ? (
          <View style={lf.addRow}>
            <Text style={lf.addLabel}>Technical Skills:</Text>
            <Text style={lf.addValue}>{cvData.skills.slice(0, 15).join(', ')}</Text>
          </View>
        ) : null}
        {cvData.languages && cvData.languages.length > 0 ? (
          <View style={lf.addRow}>
            <Text style={lf.addLabel}>Languages:</Text>
            <Text style={lf.addValue}>{cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ')}</Text>
          </View>
        ) : null}
        {cvData.projects && cvData.projects.length > 0 ? (
          <View style={lf.addRow}>
            <Text style={lf.addLabel}>Projects:</Text>
            <Text style={lf.addValue}>{cvData.projects.map(p => p.name).join('; ')}</Text>
          </View>
        ) : null}
      </View>
      {hidden}
    </Page>
  );
};

// ============================================================
// ATS Clean Pro — career-ops inspired single-column template
// Gradient teal→purple accent, competency tags, ATS-safe layout
// ============================================================
const atsCleanStyles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a2e', padding: '28 42', lineHeight: 1.5, backgroundColor: '#ffffff' },
  // Header
  header: { marginBottom: 14 },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', letterSpacing: -0.3, marginBottom: 4 },
  gradientBar: { height: 2, backgroundColor: '#0e7490', marginBottom: 6 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  contactItem: { fontSize: 9, color: '#555555' },
  contactSep: { fontSize: 9, color: '#cccccc' },
  // Section
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: '#0e7490', borderBottom: '1px solid #e5e5e5', paddingBottom: 3, marginBottom: 6 },
  // Summary
  summary: { fontSize: 9.5, color: '#333333', lineHeight: 1.6 },
  // Competency tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0e7490', backgroundColor: '#ecfeff', padding: '2 8', borderRadius: 3 },
  // Experience
  expBlock: { marginBottom: 10 },
  expTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 },
  jobTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1a1a2e' },
  dates: { fontSize: 8.5, color: '#777777' },
  company: { fontSize: 9.5, color: '#7c3aed', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  bullet: { flexDirection: 'row', gap: 5, marginBottom: 2 },
  bulletDot: { fontSize: 9, color: '#0e7490', marginTop: 0.5 },
  bulletText: { fontSize: 9, color: '#374151', flex: 1, lineHeight: 1.5 },
  // Projects
  projBlock: { marginBottom: 6 },
  projName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', marginBottom: 1 },
  projDesc: { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  // Education
  eduBlock: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  degree: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1a1a2e' },
  school: { fontSize: 9.5, color: '#7c3aed' },
  year: { fontSize: 9, color: '#777777' },
  // Skills
  skillsText: { fontSize: 9.5, color: '#374151', lineHeight: 1.6 },
});

const ATSCleanProPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => {
  const contacts = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.location,
    personalInfo.linkedin ? 'LinkedIn' : null,
    personalInfo.github ? 'GitHub' : null,
    personalInfo.website || null,
  ].filter(Boolean) as string[];

  return (
    <Page size="A4" style={atsCleanStyles.page}>
      {/* Header */}
      <View style={atsCleanStyles.header}>
        <Text style={atsCleanStyles.name}>{personalInfo.name}</Text>
        <View style={atsCleanStyles.gradientBar} />
        <View style={atsCleanStyles.contactRow}>
          {contacts.map((c, i) => (
            <React.Fragment key={i}>
              <Text style={atsCleanStyles.contactItem}>{c}</Text>
              {i < contacts.length - 1 && <Text style={atsCleanStyles.contactSep}> | </Text>}
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Summary */}
      {cvData.summary ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Professional Summary</Text>
          <Text style={atsCleanStyles.summary}>{decode(cvData.summary)}</Text>
        </View>
      ) : null}

      {/* Core Competencies (top 8 skills as tags) */}
      {cvData.skills.length > 0 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Core Competencies</Text>
          <View style={atsCleanStyles.tagsRow}>
            {cvData.skills.slice(0, 8).map((s, i) => (
              <Text key={i} style={atsCleanStyles.tag}>{s}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* Experience */}
      {cvData.experience.length > 0 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Work Experience</Text>
          {cvData.experience.map((exp, i) => (
            <View key={i} style={atsCleanStyles.expBlock}>
              <View style={atsCleanStyles.expTop}>
                <Text style={atsCleanStyles.jobTitle}>{exp.jobTitle}</Text>
                <Text style={atsCleanStyles.dates}>{exp.dates}</Text>
              </View>
              <Text style={atsCleanStyles.company}>{exp.company}</Text>
              {exp.responsibilities.map((r, j) => (
                <View key={j} style={atsCleanStyles.bullet}>
                  <Text style={atsCleanStyles.bulletDot}>•</Text>
                  <Text style={atsCleanStyles.bulletText}>{decode(r)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {/* Projects */}
      {cvData.projects && cvData.projects.length > 0 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Projects</Text>
          {cvData.projects.slice(0, 4).map((proj, i) => (
            <View key={i} style={atsCleanStyles.projBlock}>
              <Text style={atsCleanStyles.projName}>{proj.name}</Text>
              <Text style={atsCleanStyles.projDesc}>{decode(proj.description)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Education */}
      {cvData.education.length > 0 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Education</Text>
          {cvData.education.map((edu, i) => (
            <View key={i} style={{ marginBottom: 5 }}>
              <View style={atsCleanStyles.eduBlock}>
                <Text style={atsCleanStyles.degree}>{edu.degree}</Text>
                <Text style={atsCleanStyles.year}>{edu.year}</Text>
              </View>
              <Text style={atsCleanStyles.school}>{edu.school}</Text>
              {edu.description ? <Text style={{ fontSize: 8.5, color: '#6b7280', marginTop: 1 }}>{decode(edu.description)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* Certifications / Additional Skills */}
      {cvData.skills.length > 8 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Skills</Text>
          <Text style={atsCleanStyles.skillsText}>{cvData.skills.slice(8).join('  ·  ')}</Text>
        </View>
      ) : null}

      {/* Languages */}
      {cvData.languages && cvData.languages.length > 0 ? (
        <View style={atsCleanStyles.section}>
          <Text style={atsCleanStyles.sectionTitle}>Languages</Text>
          <Text style={atsCleanStyles.skillsText}>{cvData.languages.map(l => `${l.name} (${l.proficiency})`).join('  ·  ')}</Text>
        </View>
      ) : null}
      {hidden}
    </Page>
  );
};

// ─── Executive Sidebar PDF ────────────────────────────────────────────────────
const ESBAR_BG    = '#2e2510';
const ESBAR_GOLD  = '#c8a84b';
const ESBAR_WHITE = '#ffffff';
const ESBAR_MUTED = 'rgba(255,255,255,0.80)';

const esStyles = StyleSheet.create({
  page:          { flexDirection: 'row', backgroundColor: ESBAR_WHITE, fontFamily: 'Helvetica' },
  sidebar:       { width: '38%', backgroundColor: ESBAR_BG, padding: '20 14', flexDirection: 'column' },
  main:          { flex: 1, padding: '20 18', flexDirection: 'column' },
  photoCircle:   { width: 72, height: 72, borderRadius: 36, backgroundColor: ESBAR_GOLD, alignSelf: 'center', marginBottom: 8, overflow: 'hidden' },
  photo:         { width: 72, height: 72, borderRadius: 36 },
  photoInitial:  { width: 72, height: 72, borderRadius: 36, backgroundColor: ESBAR_GOLD, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  photoInitialTxt: { color: ESBAR_WHITE, fontSize: 24, fontFamily: 'Helvetica-Bold' },
  sName:         { fontFamily: 'Helvetica-Bold', fontSize: 13, color: ESBAR_WHITE, textAlign: 'center', marginBottom: 3 },
  sTitle:        { fontSize: 9, color: ESBAR_GOLD, textAlign: 'center', marginBottom: 12 },
  sSection:      { marginBottom: 10 },
  sSectionTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: ESBAR_GOLD, textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: `1px solid ${ESBAR_GOLD}50`, paddingBottom: 2, marginBottom: 5 },
  sBulletRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  sBulletDot:    { width: 4, height: 4, borderRadius: 2, backgroundColor: ESBAR_GOLD, marginTop: 3, marginRight: 5 },
  sBulletText:   { fontSize: 8.5, color: ESBAR_MUTED, flex: 1, lineHeight: 1.4 },
  sContactRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  sContactLabel: { fontSize: 8.5, color: ESBAR_GOLD, width: 14 },
  sContactText:  { fontSize: 8.5, color: ESBAR_MUTED, flex: 1, lineHeight: 1.4 },
  sSummaryText:  { fontSize: 8.5, color: ESBAR_MUTED, lineHeight: 1.5 },
  mSection:      { marginBottom: 10 },
  mSectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: ESBAR_BG, borderBottom: `1.5px solid ${ESBAR_BG}`, paddingBottom: 2, marginBottom: 6 },
  mDotRow:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  mDot:          { width: 5, height: 5, borderRadius: 2.5, backgroundColor: ESBAR_BG, marginTop: 3, marginRight: 6 },
  mDegree:       { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: ESBAR_BG },
  mSchool:       { fontSize: 8.5, color: '#555', lineHeight: 1.4 },
  mJobRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  mJobTitle:     { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: ESBAR_BG },
  mDates:        { fontSize: 8, color: '#666' },
  mCompany:      { fontSize: 8.5, color: '#555', marginBottom: 3 },
  mBulletRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 1.5 },
  mBulletDot:    { fontSize: 8, color: '#888', marginRight: 4, marginTop: 1 },
  mBulletText:   { fontSize: 8.5, color: '#444', flex: 1, lineHeight: 1.4 },
});

const ExecutiveSidebarPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo; hidden?: React.ReactElement }> = ({ cvData, personalInfo, hidden }) => (
  <Page size="A4" style={esStyles.page}>

    {/* ── Sidebar ── */}
    <View style={esStyles.sidebar}>

      {/* Photo */}
      {personalInfo.photo ? (
        <View style={esStyles.photoCircle}><Image src={personalInfo.photo} style={esStyles.photo} /></View>
      ) : (
        <View style={esStyles.photoInitial}>
          <Text style={esStyles.photoInitialTxt}>{personalInfo.name ? personalInfo.name.charAt(0).toUpperCase() : '?'}</Text>
        </View>
      )}

      <Text style={esStyles.sName}>{personalInfo.name}</Text>
      {cvData.experience.length > 0 && <Text style={esStyles.sTitle}>{cvData.experience[0].jobTitle}</Text>}

      {/* Contact */}
      <View style={esStyles.sSection}>
        <Text style={esStyles.sSectionTitle}>Contact</Text>
        {personalInfo.phone    && <View style={esStyles.sContactRow}><Text style={esStyles.sContactLabel}>☎</Text><Text style={esStyles.sContactText}>{personalInfo.phone}</Text></View>}
        {personalInfo.email    && <View style={esStyles.sContactRow}><Text style={esStyles.sContactLabel}>@</Text><Text style={esStyles.sContactText}>{personalInfo.email}</Text></View>}
        {personalInfo.linkedin && <View style={esStyles.sContactRow}><Text style={esStyles.sContactLabel}>in</Text><Text style={esStyles.sContactText}>{personalInfo.linkedin}</Text></View>}
        {personalInfo.location && <View style={esStyles.sContactRow}><Text style={esStyles.sContactLabel}>📍</Text><Text style={esStyles.sContactText}>{personalInfo.location}</Text></View>}
      </View>

      {/* Summary */}
      {cvData.summary ? (
        <View style={esStyles.sSection}>
          <Text style={esStyles.sSectionTitle}>Summary</Text>
          <Text style={esStyles.sSummaryText}>{decode(cvData.summary)}</Text>
        </View>
      ) : null}

      {/* Skills */}
      {cvData.skills.length > 0 ? (
        <View style={esStyles.sSection}>
          <Text style={esStyles.sSectionTitle}>Skills</Text>
          {cvData.skills.map((s, i) => (
            <View key={i} style={esStyles.sBulletRow}>
              <View style={esStyles.sBulletDot} />
              <Text style={esStyles.sBulletText}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Projects → Certifications */}
      {cvData.projects && cvData.projects.length > 0 ? (
        <View style={esStyles.sSection}>
          <Text style={esStyles.sSectionTitle}>Certifications</Text>
          {cvData.projects.map((p, i) => (
            <View key={i} style={esStyles.sBulletRow}>
              <View style={esStyles.sBulletDot} />
              <Text style={esStyles.sBulletText}>{p.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Languages → Personal Attributes */}
      {cvData.languages && cvData.languages.length > 0 ? (
        <View style={esStyles.sSection}>
          <Text style={esStyles.sSectionTitle}>Personal Attributes</Text>
          {cvData.languages.map((l, i) => (
            <View key={i} style={esStyles.sBulletRow}>
              <View style={esStyles.sBulletDot} />
              <Text style={esStyles.sBulletText}>{l.name}{l.proficiency ? ` — ${l.proficiency}` : ''}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>

    {/* ── Main Content ── */}
    <View style={esStyles.main}>

      {/* Education */}
      {cvData.education.length > 0 ? (
        <View style={esStyles.mSection}>
          <Text style={esStyles.mSectionTitle}>Education</Text>
          {cvData.education.map((edu, i) => (
            <View key={i} style={esStyles.mDotRow}>
              <View style={esStyles.mDot} />
              <View style={{ flex: 1 }}>
                <Text style={esStyles.mDegree}>{edu.degree}</Text>
                <Text style={esStyles.mSchool}>{edu.school}{edu.year ? `  ·  ${edu.year}` : ''}</Text>
                {edu.description ? <Text style={{ fontSize: 8, color: '#777', lineHeight: 1.4 }}>{decode(edu.description)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Experience */}
      {cvData.experience.length > 0 ? (
        <View style={esStyles.mSection}>
          <Text style={esStyles.mSectionTitle}>Experience</Text>
          {cvData.experience.map((job, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <View style={esStyles.mDotRow}>
                <View style={esStyles.mDot} />
                <View style={{ flex: 1 }}>
                  <View style={esStyles.mJobRow}>
                    <Text style={esStyles.mJobTitle}>{job.jobTitle}</Text>
                    <Text style={esStyles.mDates}>{job.dates}</Text>
                  </View>
                  <Text style={esStyles.mCompany}>{job.company}</Text>
                  {job.responsibilities.map((r, j) => (
                    <View key={j} style={esStyles.mBulletRow}>
                      <Text style={esStyles.mBulletDot}>•</Text>
                      <Text style={esStyles.mBulletText}>{decode(r)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Professional Highlights */}
      {cvData.projects && cvData.projects.length > 0 ? (
        <View style={esStyles.mSection}>
          <Text style={esStyles.mSectionTitle}>Professional Highlights &amp; Metrics</Text>
          {cvData.projects.map((p, i) => (
            <View key={i} style={esStyles.mDotRow}>
              <View style={esStyles.mDot} />
              <Text style={{ fontSize: 8.5, color: '#444', flex: 1, lineHeight: 1.4 }}>
                {p.name}{p.description ? ` — ${decode(p.description)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Memberships */}
      {cvData.languages && cvData.languages.length > 0 ? (
        <View style={esStyles.mSection}>
          <Text style={esStyles.mSectionTitle}>Memberships</Text>
          {cvData.languages.map((l, i) => (
            <View key={i} style={esStyles.mDotRow}>
              <View style={esStyles.mDot} />
              <Text style={{ fontSize: 8.5, color: '#444', flex: 1, lineHeight: 1.4 }}>
                {l.name}{l.proficiency ? ` (${l.proficiency})` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
    {hidden}
  </Page>
);

export type ReactPDFTemplateName = 'professional' | 'standard-pro' | 'minimalist' | 'london-finance' | 'ats-clean-pro' | 'executive-sidebar';

export const REACT_PDF_TEMPLATES: ReactPDFTemplateName[] = ['professional', 'standard-pro', 'minimalist', 'london-finance', 'ats-clean-pro', 'executive-sidebar'];

// ── Hidden ATS keyword layer (architecture doc Fix 4) ────────────────────────
// Renders tier-1 JD keywords as real, selectable PDF text but at a sub-pixel
// font size in white — invisible to humans, fully readable by ATS parsers
// (Greenhouse, Lever, Workday, Taleo, iCIMS, SAP SuccessFactors).
const hiddenStyles = StyleSheet.create({
  layer: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
  },
  text: {
    color: '#ffffff',
    fontSize: 0.1,
    lineHeight: 1,
  },
});

interface HiddenKeywordLayerProps { keywords?: string[] }
export const HiddenKeywordLayer: React.FC<HiddenKeywordLayerProps> = ({ keywords }) => {
  if (!keywords || keywords.length === 0) return null;
  // Cap at 15 per architecture doc; dedupe + drop empties.
  const cleaned = Array.from(new Set(
    keywords.map(k => (k || '').trim()).filter(Boolean)
  )).slice(0, 15);
  if (cleaned.length === 0) return null;
  return (
    <View style={hiddenStyles.layer} fixed>
      <Text style={hiddenStyles.text}>{cleaned.join(' ')}</Text>
    </View>
  );
};

export function buildReactPDFDocument(
  template: TemplateName,
  cvData: CVData,
  personalInfo: PersonalInfo,
  options: { atsKeywords?: string[] } = {},
): React.ReactElement {
  const { atsKeywords } = options;
  const hidden = <HiddenKeywordLayer keywords={atsKeywords} />;
  const inner = (() => {
    switch (template) {
      case 'standard-pro': return <StandardProPDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
      case 'minimalist': return <MinimalistPDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
      case 'london-finance': return <LondonFinancePDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
      case 'ats-clean-pro': return <ATSCleanProPDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
      case 'executive-sidebar': return <ExecutiveSidebarPDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
      case 'professional':
      default:
        return <ProfessionalPDF cvData={cvData} personalInfo={personalInfo} hidden={hidden} />;
    }
  })();

  return <Document>{inner}</Document>;
}
