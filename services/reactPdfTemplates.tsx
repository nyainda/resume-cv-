import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { CVData, PersonalInfo, TemplateName } from '../types';

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiA.woff2', fontWeight: 700 },
  ],
});

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
  page: { fontFamily: 'Inter', fontSize: 10, color: '#18181b', padding: '30 40', lineHeight: 1.4 },
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

const ProfessionalPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo }> = ({ cvData, personalInfo }) => (
  <Page size="A4" style={professionalStyles.page}>
    <View style={professionalStyles.header}>
      <Text style={professionalStyles.name}>{personalInfo.name}</Text>
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
                <Text style={professionalStyles.bulletDot}>•</Text>
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
  </Page>
);

const standardProStyles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 10, color: '#111827', padding: '30 50', lineHeight: 1.4 },
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

const StandardProPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo }> = ({ cvData, personalInfo }) => (
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
  </Page>
);

const minimalistStyles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 10, color: '#18181b', padding: '35 45', lineHeight: 1.4 },
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

const MinimalistPDF: React.FC<{ cvData: CVData; personalInfo: PersonalInfo }> = ({ cvData, personalInfo }) => (
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
  </Page>
);

export type ReactPDFTemplateName = 'professional' | 'standard-pro' | 'minimalist';

export const REACT_PDF_TEMPLATES: ReactPDFTemplateName[] = ['professional', 'standard-pro', 'minimalist'];

export function buildReactPDFDocument(
  template: TemplateName,
  cvData: CVData,
  personalInfo: PersonalInfo,
): React.ReactElement {
  const inner = (() => {
    switch (template) {
      case 'standard-pro': return <StandardProPDF cvData={cvData} personalInfo={personalInfo} />;
      case 'minimalist': return <MinimalistPDF cvData={cvData} personalInfo={personalInfo} />;
      case 'professional':
      default:
        return <ProfessionalPDF cvData={cvData} personalInfo={personalInfo} />;
    }
  })();

  return <Document>{inner}</Document>;
}
