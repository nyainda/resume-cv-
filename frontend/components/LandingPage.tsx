import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCFBannedPhrases } from '../services/cvBannedPhrasesClient';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import { auditSeniorityCoherence } from '../services/cvSeniorityCoherence';
import { isLikelyCv, parseLandingCvText } from '../utils/cvLandingValidator';
import type { CVData } from '../types';

interface Props {
  onGetStarted: () => void;
  onSignIn: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  hasProfile?: boolean;
  onGoToApp?: () => void;
}

const Y = '#EBFF38';

/* ─────────────────────────────────────────────────────────────────────────
   REAL CV TEMPLATE MOCKUPS — actual content, real template colours
   Each is a 380×520 div scaled down via transform to fit in the fan
───────────────────────────────────────────────────────────────────────── */

/** Standard Professional — dark navy header, clean body, full sections */
const TemplateStandardPro = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7 }}>
    <div style={{ background: '#1B2B4B', padding: '12px 16px 10px', color: '#fff' }}>
      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sarah Chen</div>
      <div style={{ fontSize: 7.5, color: '#94a8c4', marginTop: 2, letterSpacing: '0.06em' }}>Senior Product Manager · Fintech &amp; Payments</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 5.5, color: '#7fa4c8' }}>
        <span>sarah.chen@email.com</span><span>·</span><span>+44 7700 900 123</span><span>·</span><span>London, UK</span><span>·</span><span>linkedin.com/in/sarahchen</span><span>·</span><span>github.com/sarahchen</span>
      </div>
    </div>
    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#1B2B4B', borderBottom: '1px solid #1B2B4B', paddingBottom: 1.5, marginBottom: 3 }}>Professional Summary</div>
        <div style={{ fontSize: 5.5, lineHeight: 1.55, color: '#374151' }}>Product leader with 7+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Proven track record building high-performing cross-functional squads, shipping metric-dense roadmaps, and consistently raising ATS scores 2–3× through precise keyword alignment.</div>
      </div>
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#1B2B4B', borderBottom: '1px solid #1B2B4B', paddingBottom: 1.5, marginBottom: 4 }}>Professional Experience</div>
        {[
          { co: 'Stripe', role: 'Senior Product Manager', dates: '2022–Present', loc: 'London, UK', bullets: ['Owned Checkout EU roadmap (2.4M merchants); shipped 18 features → £12.6M ARR in 18 months', 'Cut cart abandonment 34% via 22-variant A/B programme — incremental £2.1M annual revenue', 'Grew NPS 42 → 78 via personalised onboarding redesign (n=180 interviews, 3 cohort studies)', 'Led cross-functional squad of 12 (eng, design, data) with zero missed quarterly milestones'] },
          { co: 'Monzo', role: 'Product Manager', dates: '2019–2022', loc: 'London, UK', bullets: ['Launched Monzo Business Lite — 40K SME accounts in 6 months at £0 paid acquisition spend', 'Built OKR framework across 8 squads; delivery variance from 63% → 12%', 'Reduced support ticket volume 22% via self-serve tooling shipped in 6 weeks'] },
          { co: 'Deliveroo', role: 'Associate Product Manager', dates: '2016–2019', loc: 'London, UK', bullets: ['Shipped restaurant dashboard adopted by 12K partners within 3 months of launch', 'Cut order error rate 18% through menu validation pipeline and structured data tooling'] },
        ].map((job, ji) => (
          <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 800, fontSize: 6.5, color: '#111' }}>{job.co} — <span style={{ fontWeight: 600 }}>{job.role}</span></div>
              <div style={{ fontSize: 5.5, color: '#6b7280', flexShrink: 0, marginLeft: 4 }}>{job.dates}</div>
            </div>
            <div style={{ fontSize: 5, color: '#9ca3af', marginBottom: 2 }}>{job.loc}</div>
            {job.bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1.5 }}>
                <span style={{ color: '#1B2B4B', fontWeight: 900, flexShrink: 0, fontSize: 8, lineHeight: '1' }}>·</span>
                <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#1B2B4B', borderBottom: '1px solid #1B2B4B', paddingBottom: 1.5, marginBottom: 3 }}>Core Skills</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {['Product Strategy', 'Roadmapping', 'OKRs', 'A/B Testing', 'SQL', 'Python', 'Figma', 'Amplitude', 'Stakeholder Mgmt', 'Agile / Scrum', 'Go-to-Market', 'API Products', 'Payments & Fintech', 'Jira', 'Data Analytics', 'User Research'].map(s => (
            <span key={s} style={{ fontSize: 5, padding: '1.5px 4px', background: '#EEF2FF', border: '0.5px solid #C7D2FE', borderRadius: 2, color: '#3730a3' }}>{s}</span>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#1B2B4B', borderBottom: '1px solid #1B2B4B', paddingBottom: 1.5, marginBottom: 3 }}>Education &amp; Certifications</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 6 }}>UCL — BSc Computer Science, First Class Honours</div>
            <div style={{ fontSize: 5, color: '#6b7280' }}>Dissertation: ML-based fraud detection · Dean's List 2018, 2019</div>
          </div>
          <div style={{ fontSize: 5.5, color: '#6b7280', flexShrink: 0, marginLeft: 6 }}>2016–2019</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
          {['Certified Scrum PO (CSPO)', 'AWS Cloud Practitioner', 'Google Analytics Certified', 'Pragmatic Marketing PMC-III'].map(c => (
            <span key={c} style={{ fontSize: 5, padding: '1.5px 4px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 2, color: '#15803d' }}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1B2B4B', flexShrink: 0 }}>Languages:</div>
        {[['English', 'Native'], ['Mandarin', 'Fluent'], ['French', 'Conversational']].map(([lang, level]) => (
          <span key={lang} style={{ fontSize: 5.5, color: '#374151' }}>{lang} <span style={{ color: '#9ca3af' }}>({level})</span></span>
        ))}
      </div>
    </div>
  </div>
);

/** Navy Sidebar — dark navy left panel, monogram crest, full sections */
const TemplateNavySidebar = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    <div style={{ width: 112, background: '#1a2f5a', color: '#fff', padding: '12px 9px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#3a5a8a', border: '1.5px solid #7fa8d8', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#7fa8d8' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sarah Chen</div>
        <div style={{ fontSize: 5.5, color: '#7fa8d8', marginTop: 2 }}>Senior PM · Fintech</div>
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7fa8d8', borderBottom: '0.5px solid #3a5a8a', paddingBottom: 1.5, marginBottom: 3 }}>Contact</div>
        {['sarah.chen@email.com', '+44 7700 900 123', 'London, UK', 'linkedin.com/in/sarahchen', 'github.com/sarahchen'].map((c, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#b8cfe8', marginBottom: 2 }}>{c}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7fa8d8', borderBottom: '0.5px solid #3a5a8a', paddingBottom: 1.5, marginBottom: 3 }}>Skills</div>
        {['Product Strategy', 'A/B Testing', 'SQL & Analytics', 'Figma / Prototyping', 'OKR Frameworks', 'Agile / Scrum', 'Stakeholder Mgmt', 'Go-to-Market', 'API & Payments', 'Data Storytelling', 'Python', 'Jira / Amplitude'].map((s, i) => (
          <div key={i} style={{ fontSize: 5, color: '#b8cfe8', marginBottom: 1.5, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: '#7fa8d8', flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7fa8d8', borderBottom: '0.5px solid #3a5a8a', paddingBottom: 1.5, marginBottom: 3 }}>Key Wins</div>
        {['£12.6M ARR in 18mo', '2.4M merchants served', 'NPS uplift 42 → 78', '40K SME launch at £0', '-34% cart abandonment', '8 squads aligned on OKRs'].map((h, i) => (
          <div key={i} style={{ fontSize: 5, borderLeft: '1.5px solid #7fa8d8', paddingLeft: 3, marginBottom: 3, color: '#d4e4f4', lineHeight: 1.4 }}>{h}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#7fa8d8', borderBottom: '0.5px solid #3a5a8a', paddingBottom: 1.5, marginBottom: 3 }}>Languages</div>
        {[['English', 'Native'], ['Mandarin', 'Fluent'], ['French', 'Conv.']].map(([l, v]) => (
          <div key={l} style={{ fontSize: 5, color: '#b8cfe8', marginBottom: 2 }}>{l} <span style={{ color: '#7fa8d8' }}>— {v}</span></div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #3a5a8a', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontFamily: 'Georgia,serif', fontWeight: 900, color: '#7fa8d8' }}>SC</div>
        <div style={{ fontSize: 4.5, color: '#3a5a8a', fontFamily: 'Georgia,serif', letterSpacing: '0.2em' }}>MMXXV</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '12px 12px', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#18181b', lineHeight: 1 }}>Sarah Chen</div>
      <div style={{ fontSize: 6, color: '#7fa8d8', marginBottom: 8, marginTop: 2 }}>Senior Product Manager · 7 Years in Fintech &amp; Payments</div>
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1a2f5a', borderBottom: '1px solid #1a2f5a', paddingBottom: 1.5, marginBottom: 4 }}>Experience</div>
      {[
        { co: 'Stripe', role: 'Senior Product Manager', dates: '2022–Present', bullets: ['Owned Checkout EU (2.4M merchants); 18 features → £12.6M ARR', 'Cut abandonment 34% via 22-variant A/B programme (+£2.1M)', 'Grew NPS 42 → 78 via onboarding redesign (n=180 interviews)', 'Led 12-person cross-functional squad, zero missed milestones'] },
        { co: 'Monzo', role: 'Product Manager', dates: '2019–2022', bullets: ['Launched Business Lite — 40K SMEs in 6mo, £0 paid spend', 'OKR framework across 8 squads; variance 63% → 12%', 'Reduced support tickets 22% via self-serve tooling'] },
        { co: 'Deliveroo', role: 'Associate PM', dates: '2016–2019', bullets: ['Restaurant dashboard adopted by 12K partners in 3mo', 'Cut order error rate 18% via menu validation pipeline'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
          <div style={{ fontWeight: 800, fontSize: 6, color: '#111' }}>{job.co} · <span style={{ fontWeight: 600 }}>{job.role}</span> <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 5.5 }}>{job.dates}</span></div>
          {job.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1.5, marginTop: i === 0 ? 2 : 0 }}>
              <span style={{ color: '#7fa8d8', fontWeight: 900, flexShrink: 0, fontSize: 7 }}>·</span>
              <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1a2f5a', borderBottom: '1px solid #1a2f5a', paddingBottom: 1.5, marginBottom: 3, marginTop: 5 }}>Education &amp; Certifications</div>
      <div style={{ fontWeight: 800, fontSize: 6 }}>UCL — BSc Computer Science <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 5.5 }}>First Class Honours · 2016–2019</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
        {['CSPO', 'AWS CPP', 'Google Analytics', 'PMC-III'].map(c => (
          <span key={c} style={{ fontSize: 5, padding: '1px 4px', background: '#eff6ff', border: '0.5px solid #bfdbfe', borderRadius: 2, color: '#1d4ed8' }}>{c}</span>
        ))}
      </div>
    </div>
  </div>
);

/** Executive Sidebar — deep brown/gold, luxury feel, full sections */
const TemplateExecutive = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    <div style={{ width: 118, background: '#2e2510', color: '#fff', padding: '12px 9px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#4a3820', border: '1.5px solid #c8a84b', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#c8a84b' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.04em', color: '#f5e6c8' }}>Sarah Chen</div>
        <div style={{ fontSize: 5.5, color: '#c8a84b', marginTop: 2, fontStyle: 'italic', fontFamily: 'Georgia,serif' }}>Sr. Product Manager</div>
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 1.5, marginBottom: 3 }}>Contact</div>
        {['sarah.chen@email.com', 'London, UK', '+44 7700 900 123', 'linkedin.com/in/sarahchen'].map((c, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#d4c4a0', marginBottom: 2 }}>{c}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 1.5, marginBottom: 3 }}>Expertise</div>
        {['Product Strategy', 'P&L Ownership', 'Go-to-Market', 'OKR Frameworks', 'Board Reporting', 'Stakeholder Mgmt', 'Payments & Fintech', 'A/B Testing', 'SQL & Analytics', 'User Research', 'Agile / Scrum'].map((s, i) => (
          <div key={i} style={{ fontSize: 5, color: '#d4c4a0', marginBottom: 2, display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ color: '#c8a84b', fontSize: 6, lineHeight: 1 }}>—</span>{s}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 1.5, marginBottom: 3 }}>Career Wins</div>
        {['£12.6M ARR in 18 mo', '40K SMEs, £0 CAC', 'NPS +36 pts (42→78)', 'ATS 31 → 94', '-34% cart abandon', '12 engineers led'].map((a, i) => (
          <div key={i} style={{ fontSize: 5, color: '#d4c4a0', marginBottom: 2, fontStyle: 'italic', fontFamily: 'Georgia,serif', lineHeight: 1.4 }}>— {a}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 1.5, marginBottom: 3 }}>Languages</div>
        {['English — Native', 'Mandarin — Fluent', 'French — Conv.'].map((l, i) => (
          <div key={i} style={{ fontSize: 5, color: '#d4c4a0', marginBottom: 2 }}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ borderTop: '0.5px solid rgba(200,168,75,0.3)', paddingTop: 5, textAlign: 'center' }}>
          <div style={{ fontSize: 4.5, fontFamily: 'Georgia,serif', letterSpacing: '0.3em', color: 'rgba(200,168,75,0.6)', textTransform: 'uppercase' }}>Est. 2016</div>
        </div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '12px 12px', overflow: 'hidden' }}>
      <div style={{ borderBottom: '2px solid #c8a84b', paddingBottom: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.04em', color: '#18181b' }}>SARAH CHEN</div>
        <div style={{ fontSize: 6, color: '#6b7280', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Senior Product Manager · Fintech &amp; Payments</div>
      </div>
      <div style={{ fontSize: 5.5, lineHeight: 1.55, color: '#4b5563', marginBottom: 7, fontStyle: 'italic', fontFamily: 'Georgia,serif' }}>Product leader with 7+ years scaling platforms to £10M+ ARR. Specialist in payments, fintech, and B2B SaaS. Track record of building high-output squads, aligning leadership on vision, and delivering metric-dense roadmaps on schedule.</div>
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#2e2510', borderBottom: '1px solid #c8a84b', paddingBottom: 1.5, marginBottom: 4 }}>Career History</div>
      {[
        { co: 'Stripe', role: 'Senior Product Manager', dates: '2022–Present', bullets: ['Owned Checkout EU (2.4M merchants); 18 features → £12.6M ARR in 18 months', 'Reduced abandonment 34% via 22-variant A/B programme (+£2.1M uplift)', 'Grew NPS 42 → 78 via onboarding redesign (n=180 interviews, 3-cohort study)', 'Managed 12-person cross-functional squad — zero missed quarterly targets'] },
        { co: 'Monzo', role: 'Product Manager', dates: '2019–2022', bullets: ['Launched Business Lite — 40K SME accounts in 6 months at £0 paid spend', 'OKR framework for 8 squads; delivery variance 63% → 12%', 'Self-serve tooling cut support ticket volume by 22% in 6 weeks'] },
        { co: 'Deliveroo', role: 'Associate PM', dates: '2016–2019', bullets: ['Restaurant dashboard adopted by 12K partners in 3 months post-launch', 'Cut order error rate 18% via menu validation &amp; structured data pipeline'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, fontSize: 6 }}>{job.co} — <span style={{ fontWeight: 600 }}>{job.role}</span></div>
            <div style={{ fontSize: 5.5, color: '#6b7280', flexShrink: 0, marginLeft: 4 }}>{job.dates}</div>
          </div>
          {job.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1.5, marginTop: i === 0 ? 3 : 0 }}>
              <span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: '#c8a84b', flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }} dangerouslySetInnerHTML={{ __html: b }} />
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#2e2510', borderBottom: '1px solid #c8a84b', paddingBottom: 1.5, marginBottom: 3, marginTop: 5 }}>Education &amp; Certifications</div>
      <div style={{ fontWeight: 800, fontSize: 6 }}>UCL — BSc Computer Science, First Class Honours <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 5.5 }}>2016–2019</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
        {['CSPO', 'AWS Cloud Practitioner', 'Google Analytics Certified', 'PMC-III'].map(c => (
          <span key={c} style={{ fontSize: 5, padding: '1px 4px', background: '#fefce8', border: '0.5px solid #fde68a', borderRadius: 2, color: '#92400e' }}>{c}</span>
        ))}
      </div>
    </div>
  </div>
);

/** Modern Tech — terminal aesthetic, dark charcoal sidebar, full sections */
const TemplateModernTech = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    <div style={{ width: 112, background: '#1f2937', color: '#fff', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 900, color: '#f9fafb' }}>Sarah Chen</div>
        <div style={{ fontSize: 5, color: '#60a5fa', fontFamily: 'monospace', marginTop: 1 }}>~/senior-pm · fintech</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
          {['sarah.chen@email.com', '+44 7700 900 123', 'London, UK', 'github.com/sarahchen'].map((c, i) => (
            <div key={i} style={{ fontSize: 5, color: '#9ca3af', fontFamily: 'monospace' }}>{c}</div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 5, color: '#6b7280', fontFamily: 'monospace', marginBottom: 3 }}>{'// skills'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {['SQL', 'Python', 'Figma', 'A/B Tests', 'OKRs', 'Amplitude', 'Jira', 'APIs', 'Roadmap', 'Agile', 'Payments', 'Mixpanel', 'dbt', 'Looker'].map((s, i) => (
            <span key={i} style={{ fontSize: 4.5, padding: '1.5px 4px', background: '#374151', color: '#d1d5db', borderRadius: 2 }}>{s}</span>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 5, color: '#6b7280', fontFamily: 'monospace', marginBottom: 3 }}>{'// impact'}</div>
        {['£12.6M ARR', '2.4M merchants', 'NPS 42 → 78', '40K SMEs, £0 CAC', '-34% abandon', '-18% error rate', '8 squads aligned', '12 eng managed'].map((h, i) => (
          <div key={i} style={{ fontSize: 5, color: '#86efac', display: 'flex', gap: 3, marginBottom: 2 }}>
            <span style={{ color: '#4ade80', flexShrink: 0 }}>›</span>{h}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5, color: '#6b7280', fontFamily: 'monospace', marginBottom: 3 }}>{'// repos'}</div>
        {['~/checkout-eu-v2', '~/monzo-biz-lite', '~/okr-framework', '~/menu-validator', '~/ats-analyser'].map((r, i) => (
          <div key={i} style={{ fontSize: 5, color: '#60a5fa', fontFamily: 'monospace', marginBottom: 1.5 }}>{r}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5, color: '#6b7280', fontFamily: 'monospace', marginBottom: 3 }}>{'// languages'}</div>
        {['EN — native', 'ZH — fluent', 'FR — conv.'].map((l, i) => (
          <div key={i} style={{ fontSize: 5, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 1.5 }}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', borderTop: '0.5px solid #374151', paddingTop: 5 }}>
        <div style={{ fontSize: 4.5, fontFamily: 'monospace', color: '#4ade80' }}>$ procv generate</div>
        <div style={{ fontSize: 4, fontFamily: 'monospace', color: '#374151', marginTop: 1 }}>--on=2025-05-14 ✓</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '12px 11px', overflow: 'hidden' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '-0.02em', color: '#111827' }}>Sarah Chen</div>
        <div style={{ fontSize: 6, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>Senior Product Manager · Fintech &amp; Payments</div>
      </div>
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1f2937', borderBottom: '1.5px solid #1f2937', paddingBottom: 1.5, marginBottom: 4 }}>Experience</div>
      {[
        { co: 'Stripe', role: 'Senior PM', dates: '2022–Present', bullets: ['Owned Checkout EU (2.4M merchants); 18 features → £12.6M ARR', 'Cut abandonment 34% via 22-variant A/B programme (+£2.1M revenue)', 'Redesigned onboarding (n=180) — NPS 42 → 78 in 11 weeks', 'Led 12-person cross-functional squad, zero missed milestones'] },
        { co: 'Monzo', role: 'Product Manager', dates: '2019–2022', bullets: ['Launched Business Lite — 40K SME accounts in 6mo at £0 CAC', 'OKR framework for 8 squads; variance 63% → 12%', 'Self-serve tooling → 22% reduction in support ticket volume'] },
        { co: 'Deliveroo', role: 'Associate PM', dates: '2016–2019', bullets: ['Restaurant dashboard adopted by 12K partners in 3 months', 'Cut order error rate 18% via menu validation pipeline'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, fontSize: 6 }}>{job.co} — <span style={{ fontWeight: 600 }}>{job.role}</span></div>
            <div style={{ fontSize: 5, color: '#6b7280', fontFamily: 'monospace', flexShrink: 0 }}>{job.dates}</div>
          </div>
          {job.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1.5, marginTop: i === 0 ? 3 : 0 }}>
              <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 7, flexShrink: 0, lineHeight: '1' }}>›</span>
              <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1f2937', borderBottom: '1.5px solid #1f2937', paddingBottom: 1.5, marginBottom: 3, marginTop: 5 }}>Education &amp; Certifications</div>
      <div style={{ fontWeight: 800, fontSize: 6 }}>UCL — BSc Computer Science, First Class <span style={{ fontWeight: 400, color: '#6b7280', fontFamily: 'monospace', fontSize: 5 }}>2016–2019</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
        {['CSPO', 'AWS CPP', 'Google Analytics', 'PMC-III'].map(c => (
          <span key={c} style={{ fontSize: 5, padding: '1px 4px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 2, color: '#15803d', fontFamily: 'monospace' }}>{c}</span>
        ))}
      </div>
    </div>
  </div>
);

/** Compact Sage — sage-green sidebar, serif headings, full sections */
const TemplateCompactSage = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    <div style={{ width: 110, background: '#365314', color: '#fff', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.35)', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, fontFamily: 'Georgia,serif', color: '#d9f99d' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 7, fontWeight: 900, fontFamily: 'Georgia,serif', color: '#ecfccb' }}>Sarah Chen</div>
        <div style={{ fontSize: 5, color: '#a3e635', marginTop: 1, fontStyle: 'italic' }}>Senior PM · Fintech</div>
      </div>
      <div>
        <div style={{ fontSize: 5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a3e635', borderBottom: '0.5px solid rgba(163,230,53,0.3)', paddingBottom: 1.5, marginBottom: 3 }}>Contact</div>
        {['sarah.chen@email.com', 'London, UK', '+44 7700 900 123', 'linkedin.com/in/sarahchen', 'github.com/sarahchen'].map((c, i) => (
          <div key={i} style={{ fontSize: 5, color: 'rgba(255,255,255,0.82)', marginBottom: 2, lineHeight: 1.3 }}>{c}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a3e635', borderBottom: '0.5px solid rgba(163,230,53,0.3)', paddingBottom: 1.5, marginBottom: 3 }}>Skills</div>
        {['Product Strategy', 'OKR Frameworks', 'A/B Testing', 'SQL & Analytics', 'Python', 'Figma', 'Payments & Fintech', 'Stakeholder Mgmt', 'Go-to-Market', 'Agile / Scrum', 'Data Storytelling', 'User Research', 'API Products', 'Jira / Amplitude'].map((s, i) => (
          <div key={i} style={{ fontSize: 4.5, color: 'rgba(255,255,255,0.8)', marginBottom: 2, display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: '#a3e635', flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a3e635', borderBottom: '0.5px solid rgba(163,230,53,0.3)', paddingBottom: 1.5, marginBottom: 3 }}>Languages</div>
        {['English — Native', 'Mandarin — Fluent', 'French — Conversational'].map((l, i) => (
          <div key={i} style={{ fontSize: 5, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <div style={{ fontSize: 4, fontFamily: 'Georgia,serif', letterSpacing: '0.3em', color: 'rgba(163,230,53,0.4)', textTransform: 'uppercase' }}>Est. 2016</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '10px 11px', overflow: 'hidden' }}>
      <div style={{ borderBottom: '1.5px solid #365314', paddingBottom: 5, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '-0.01em', color: '#1a2e05', fontFamily: 'Georgia,serif' }}>Sarah Chen</div>
        <div style={{ fontSize: 6, color: '#4d7c0f', marginTop: 1, fontStyle: 'italic' }}>Senior Product Manager · Fintech &amp; Payments · 7 yrs</div>
      </div>
      <div style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151', marginBottom: 6 }}>Product leader with 7+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Proven track record of raising ATS scores 2–3× and aligning multi-team squads on metric-dense roadmaps.</div>
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#365314', borderBottom: '1px solid #365314', paddingBottom: 1.5, marginBottom: 4 }}>Professional Experience</div>
      {[
        { co: 'Stripe', title: 'Senior Product Manager', dates: '2022–Present', bullets: ['Owned Checkout EU (2.4M merchants); 18 features → £12.6M ARR in 18mo', 'Cut abandonment 34% via 22-variant A/B programme — +£2.1M revenue', 'NPS 42 → 78 via personalised onboarding redesign (n=180 interviews)', 'Led 12-person cross-functional squad, zero missed quarterly milestones'] },
        { co: 'Monzo', title: 'Product Manager', dates: '2019–2022', bullets: ['Launched Business Lite — 40K SMEs in 6mo at £0 paid spend', 'OKR framework for 8 squads; delivery variance 63% → 12%', 'Self-serve tooling reduced support tickets 22% in 6 weeks'] },
        { co: 'Deliveroo', title: 'Associate PM', dates: '2016–2019', bullets: ['Restaurant dashboard adopted by 12K partners in 3 months', 'Cut order error rate 18% via menu validation pipeline'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, fontSize: 6 }}>{job.co} · <span style={{ fontWeight: 600 }}>{job.title}</span></div>
            <div style={{ fontSize: 5.5, color: '#6b7280', flexShrink: 0, marginLeft: 4 }}>{job.dates}</div>
          </div>
          {job.bullets.map((b, bi) => (
            <div key={bi} style={{ display: 'flex', gap: 3, marginBottom: 1.5, marginTop: bi === 0 ? 2 : 0 }}>
              <span style={{ color: '#4d7c0f', flexShrink: 0, fontWeight: 900, fontSize: 8, lineHeight: '1' }}>▸</span>
              <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#365314', borderBottom: '1px solid #365314', paddingBottom: 1.5, marginBottom: 3, marginTop: 5 }}>Education &amp; Certifications</div>
      <div style={{ fontWeight: 800, fontSize: 6 }}>UCL — BSc Computer Science, First Class Honours <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 5.5 }}>2016–2019</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
        {['CSPO', 'AWS Cloud Practitioner', 'Google Analytics', 'PMC-III'].map(c => (
          <span key={c} style={{ fontSize: 5, padding: '1px 4px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 2, color: '#15803d' }}>{c}</span>
        ))}
      </div>
    </div>
  </div>
);

/** Academic Teal — single-column, left border accent, full sections */
const TemplateAcademicTeal = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7 }}>
    <div style={{ borderLeft: '4px solid #0891b2', background: '#f0f9ff', padding: '11px 14px 10px' }}>
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em', color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>Sarah Chen</div>
      <div style={{ fontSize: 6.5, color: '#0891b2', marginTop: 2, fontStyle: 'italic' }}>Senior Product Manager · Fintech &amp; Payments</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, fontSize: 5.5, color: '#64748b' }}>
        <span>sarah.chen@email.com</span><span>·</span><span>London, UK</span><span>·</span><span>+44 7700 900 123</span><span>·</span><span>linkedin.com/in/sarahchen</span><span>·</span><span>github.com/sarahchen</span>
      </div>
    </div>
    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 5.5, lineHeight: 1.55, color: '#374151', borderLeft: '2px solid #bae6fd', paddingLeft: 6 }}>Product leader with 7+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Proven track record building high-performing squads, shipping metric-dense roadmaps, and raising ATS scores 2–3× through precise keyword alignment.</div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 1.5, marginBottom: 4 }}>Professional Experience</div>
        {[
          { co: 'Stripe', title: 'Senior Product Manager', dates: '2022 – Present', loc: 'London, UK', bullets: ['Owned Checkout EU roadmap (2.4M merchants) — 18 features → £12.6M ARR in 18 months', 'Cut cart abandonment 34% via 22-variant A/B programme, adding £2.1M annual revenue', 'Grew NPS 42 → 78 via personalised onboarding redesign (n=180 interviews, 3-cohort study)', 'Led cross-functional squad of 12; zero missed quarterly milestones across 6 planning cycles'] },
          { co: 'Monzo', title: 'Product Manager', dates: '2019 – 2022', loc: 'London, UK', bullets: ['Launched Business Lite — 40K SME accounts in 6 months at £0 paid acquisition spend', 'Defined OKR framework across 8 squads — delivery variance from 63% to 12%', 'Shipped self-serve tooling reducing support tickets by 22% in 6 weeks'] },
          { co: 'Deliveroo', title: 'Associate Product Manager', dates: '2016 – 2019', loc: 'London, UK', bullets: ['Shipped restaurant dashboard adopted by 12K partners within 3 months of launch', 'Reduced order error rate 18% via menu validation pipeline and structured data tooling'] },
        ].map((job, ji) => (
          <div key={ji} style={{ marginBottom: ji < 2 ? 5 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 800, fontSize: 6.5, color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>{job.co} — <span style={{ fontWeight: 600 }}>{job.title}</span></div>
              <div style={{ fontSize: 5.5, color: '#64748b', flexShrink: 0, marginLeft: 4 }}>{job.dates}</div>
            </div>
            <div style={{ fontSize: 5, color: '#0891b2', marginBottom: 2, fontStyle: 'italic' }}>{job.loc}</div>
            {job.bullets.map((b, bi) => (
              <div key={bi} style={{ display: 'flex', gap: 4, marginBottom: 1.5 }}>
                <span style={{ color: '#0891b2', fontWeight: 900, flexShrink: 0 }}>–</span>
                <span style={{ fontSize: 5.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 1.5, marginBottom: 3 }}>Core Skills</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
          {['Product Strategy', 'OKRs', 'A/B Testing', 'SQL & Analytics', 'Python', 'Figma', 'Payments & Fintech', 'Stakeholder Mgmt', 'Go-to-Market', 'API Design', 'User Research', 'Agile / Scrum', 'Amplitude', 'Jira'].map(s => (
            <span key={s} style={{ fontSize: 5, padding: '1.5px 4px', background: '#e0f2fe', border: '0.5px solid #bae6fd', borderRadius: 2, color: '#0369a1' }}>{s}</span>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 1.5, marginBottom: 3 }}>Education &amp; Certifications</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 6, color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>UCL — BSc Computer Science, First Class Honours</div>
            <div style={{ fontSize: 5, color: '#64748b' }}>Dissertation: ML-based fraud detection · Dean's List 2018 &amp; 2019</div>
          </div>
          <div style={{ fontSize: 5.5, color: '#64748b', flexShrink: 0, marginLeft: 6 }}>2016–2019</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
          {['Certified Scrum PO (CSPO)', 'AWS Cloud Practitioner', 'Google Analytics Certified', 'PMC-III'].map(c => (
            <span key={c} style={{ fontSize: 5, padding: '1.5px 4px', background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: 2, color: '#15803d' }}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#0891b2', flexShrink: 0 }}>Languages:</div>
        {[['English', 'Native'], ['Mandarin', 'Fluent'], ['French', 'Conversational']].map(([lang, level]) => (
          <span key={lang} style={{ fontSize: 5.5, color: '#374151' }}>{lang} <span style={{ color: '#94a3b8' }}>({level})</span></span>
        ))}
      </div>
    </div>
  </div>
);

/* ─── Scaled wrapper so each template fits as a card ───────────────────── */
const TemplateCard = ({ children, scale, rotate = 0, shadow = true }: { children: React.ReactNode; scale: number; rotate?: number; shadow?: boolean }) => (
  <div style={{ position: 'relative', width: 380 * scale, height: 520 * scale, flexShrink: 0, overflow: 'hidden' }}>
    <div style={{
      transformOrigin: 'top left', transform: `scale(${scale}) rotate(${rotate}deg)`,
      borderRadius: 8 / scale, overflow: 'hidden',
      boxShadow: shadow ? '0 12px 40px rgba(0,0,0,0.22)' : '0 4px 16px rgba(0,0,0,0.12)',
      width: 380, height: 520,
    }}>
      {children}
    </div>
  </div>
);

/* ─── Fluid version — fills its column width, scales template to fit ────── */
const TemplateCardFluid = ({ children, shadow = true }: { children: React.ReactNode; shadow?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.62);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setScale(w / 380);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: 520 * scale, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        borderRadius: 8 / scale,
        overflow: 'hidden',
        boxShadow: shadow ? '0 12px 40px rgba(0,0,0,0.22)' : '0 4px 16px rgba(0,0,0,0.12)',
        width: 380,
        height: 520,
      }}>
        {children}
      </div>
    </div>
  );
};

/* ─── ATS Gauge ─────────────────────────────────────────────────────────── */
const AtsGauge = ({ score, size = 52 }: { score: number; size?: number }) => {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const color = score >= 85 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#33333333" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${circ * score / 100} ${circ * (1 - score / 100)}`}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="900" fontFamily="system-ui">{score}</text>
    </svg>
  );
};

/* ─── Data ──────────────────────────────────────────────────────────────── */
const PIPELINE_STEPS = [
  { icon: '✦', label: 'JD Analysis', detail: 'Scans the job description, detects industry & seniority, extracts Tier 1/2 keywords' },
  { icon: '⬆', label: 'ATS Gap Pin', detail: 'Finds keywords absent from your CV and pins them verbatim into the generated output' },
  { icon: '◈', label: 'Smart Writing', detail: 'Multiple language models craft metric-dense, verb-varied bullets — matched to your real experience and the target role' },
  { icon: '⊙', label: 'Purify Pass', detail: 'Strips AI tells, fixes verb tense, collapses duplicate words, jitter-rounds numbers to look human' },
  { icon: '◐', label: 'HR Detector', detail: 'Zero-LLM simulation scores bullet rhythm, metric density, seniority coherence & passive voice' },
  { icon: '✓', label: 'Voice Audit', detail: 'Checks pronoun consistency, banned phrases (synergy, self-starter), and writing-style fingerprint' },
];

const TOOL_GROUPS = [
  {
    label: 'Generate',
    color: '#1B2B4B',
    tools: [
      { name: 'CV Generator', desc: 'Tailored, ATS-ready CVs for any role in minutes. 35 templates.' },
      { name: 'Cover Letter', desc: 'Smart cover letters using JD + company research. Tone matched.' },
      { name: 'LinkedIn Optimiser', desc: 'Rewrites summary, headline, and experience sections for LinkedIn algorithms.' },
      { name: 'Scholarship Essays', desc: 'Academic application essays crafted to institutional tone and word limits.' },
    ],
  },
  {
    label: 'Analyse',
    color: '#7a3800',
    tools: [
      { name: 'ATS Checker', desc: 'Match score, missing keywords, formatting risks — benchmarked against JD.' },
      { name: 'CV Doctor', desc: 'Colour-coded bullet audit: passive voice, weak verbs, missing metrics — one-click rewrite.' },
      { name: 'HR Detector', desc: 'Zero-token simulation: rhythm, density, seniority — scored like an HR system would.' },
      { name: 'Quality Audit', desc: 'Flags round numbers, orphan metrics, monotone rhythm, AI fingerprints.' },
    ],
  },
  {
    label: 'Search & Coach',
    color: '#064e3b',
    tools: [
      { name: 'Portal Scanner', desc: 'Hits 150+ company career portals (Greenhouse, Lever, Ashby) in seconds.' },
      { name: 'Job Board', desc: 'Unified job search + application tracker with saved status and notes.' },
      { name: 'Interview Prep', desc: '10 tailored questions (Behavioural, Technical, Cultural) with model answers.' },
      { name: 'Negotiation Coach', desc: 'Counter-offer scripts, verbal talk tracks, equity guides — for any offer.' },
    ],
  },
  {
    label: 'Manage',
    color: '#3b0764',
    tools: [
      { name: 'Profile Manager', desc: 'Fill once. Every tool draws from the same profile — zero re-entry.' },
      { name: 'CV History', desc: 'Full version history with side-by-side CV comparison and score tracking.' },
      { name: 'Cloud Backup', desc: 'Optional Google Drive / OneDrive sync. Nothing stored on our servers.' },
      { name: 'PDF Tools', desc: 'WYSIWYG PDF export + merger. Every template matches on-screen pixel-for-pixel.' },
    ],
  },
];

const BEFORE_AFTER_CASES = [
  {
    role: 'Product Manager', tag: 'Agency → Stripe',
    before: { score: 31, bullets: ['Managed product roadmap and worked with engineers', 'Helped improve customer satisfaction metrics', 'Ran sprint planning and stakeholder meetings'] },
    after: { score: 94, bullets: ['Owned Checkout EU roadmap (2.4M merchants); shipped 18 features → £12.6M ARR in 18 months', 'Reduced cart abandonment 34% via 22-variant A/B programme — incremental £2.1M revenue', 'Redesigned onboarding (180 interviews, 3 cohorts) — NPS 42 → 78, shipped in 11 weeks'] },
  },
  {
    role: 'Software Engineer', tag: 'Junior → Amazon',
    before: { score: 44, bullets: ['Built features using React and Node.js', 'Fixed bugs and improved performance', 'Participated in code reviews and agile ceremonies'] },
    after: { score: 97, bullets: ['Engineered real-time bidding engine (TypeScript) — P99 latency 340ms → 42ms at 80K RPS', 'Migrated monolith → 12 microservices; CI pipeline 22 min → 4.5 min, $18K/mo infra saving', 'Automated E2E suite (94% coverage) — production incidents down 67% YoY'] },
  },
  {
    role: 'Marketing Director', tag: 'SME → FMCG',
    before: { score: 27, bullets: ['Led marketing team and managed campaigns', 'Worked with agencies and internal stakeholders', 'Responsible for brand and content strategy'] },
    after: { score: 91, bullets: ['Scaled performance budget £180K → £2.4M; delivered 340% blended ROI across paid channels', 'Built 14-person team from scratch — CAC down 38% while acquisition volume doubled', 'Launched rebrand across 6 markets — aided brand awareness +62% (Nielsen, n=4,200)'] },
  },
];

const TESTIMONIALS = [
  { name: 'James O.', role: 'Product Manager', company: 'HSBC', avatar: 'JO', color: '#C40000', metric: '38 → 91 ATS', quote: 'Got a call from HSBC within 48 hours. I\'d applied to the same role six months earlier and heard nothing. Only the CV changed.' },
  { name: 'Kwame A.', role: 'Software Engineer', company: 'Amazon', avatar: 'KA', color: '#FF9900', metric: 'Interview in 2 weeks', quote: 'The CV Doctor flagged every weak bullet I\'d written for years. The before/after is embarrassing. Amazon interviews in two weeks.' },
  { name: 'Elena K.', role: 'Finance Analyst', company: 'Goldman Sachs', avatar: 'EK', color: '#6EC6F5', metric: '+23% salary', quote: 'Negotiation Coach gave me the exact counter-offer script. I asked 23% above initial offer and they accepted immediately.' },
];


/* ─── Main Component ────────────────────────────────────────────────────── */
const LandingPage: React.FC<Props> = ({ onGetStarted, onSignIn, darkMode, onToggleDark, hasProfile, onGoToApp }) => {
  const [ready, setReady] = useState(false);
  const [activeCase, setActiveCase] = useState(0);
  const [activePipe, setActivePipe] = useState(0);
  const [vis, setVis] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Counter animation for Engine stats ────────────────────────────────
  const STATS = [
    { target: 98, suffix: '%', label: 'ATS-pass rate' },
    { target: 100, suffix: '%', label: 'fact-accurate' },
    { target: 35, suffix: '+', label: 'templates' },
    { target: 3, suffix: '×', label: 'more interviews' },
  ];
  const [statVals, setStatVals] = useState(STATS.map(() => 0));
  const statsFired = useRef(false);
  useEffect(() => {
    if (!v('pipe') || statsFired.current) return;
    statsFired.current = true;
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setStatVals(STATS.map(s => Math.round(s.target * ease)));
      if (p < 1) requestAnimationFrame(tick);
      else setStatVals(STATS.map(s => s.target));
    };
    requestAnimationFrame(tick);
  }, [vis]);

  // ── Score My CV state ──────────────────────────────────────────────────
  const [smCvText, setSmCvText] = useState('');
  const [smJdText, setSmJdText] = useState('');
  const [smScoring, setSmScoring] = useState(false);
  const [smValidationError, setSmValidationError] = useState<string | null>(null);
  const [smResult, setSmResult] = useState<null | {
    aiScore: number; bulletScore: number; summaryScore: number; atsScore: number | null;
    composite: number; topIssues: string[]; cfLive: boolean; hasJd: boolean;
  }>(null);
  const [smCfPhrases, setSmCfPhrases] = useState<{ openers: string[]; aiisms: string[] } | null>(null);

  // Fetch CF banned phrases once on mount for live scoring
  useEffect(() => {
    fetchCFBannedPhrases().then(p => setSmCfPhrases(p)).catch(() => {});
  }, []);

  // ── Full pipeline scoring: text → CVData → all 5 checks ───────────────
  const smRunScore = useCallback(async () => {
    const cv = smCvText.trim();
    if (!cv) return;

    // Validate — reject non-CV text early with a helpful message
    const validationError = isLikelyCv(cv);
    if (validationError) { setSmValidationError(validationError); return; }
    setSmValidationError(null);
    setSmScoring(true);
    setSmResult(null);
    await new Promise(r => setTimeout(r, 40));

    const cfPhrases = smCfPhrases ?? { openers: [], aiisms: [] };
    const cfLive    = cfPhrases.openers.length + cfPhrases.aiisms.length > 0;

    // Parse raw text → structured CVData
    const cvData = parseLandingCvText(cv);

    // Signal 1: HR / AI-tell detection — full 8-signal pipeline + live CF data
    const hrResult = scoreHRDetection(cvData, cfPhrases.openers, cfPhrases.aiisms);
    const aiScore  = hrResult.humanScore;

    // Signal 2: Bullet quality — metrics, fake verbs, arrow chains, length
    const METRIC_RX    = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?)\b/i;
    const FAKE_VERB_RX = /\b(greenfielded?|actioned?|ideated?|solutioned?|conceptualized?|operationalized?)\b/i;
    const allBullets   = cvData.experience?.flatMap(r => r.responsibilities ?? []) ?? [];
    let bulletRisk = 0;
    if (allBullets.length < 3)                                                     bulletRisk += 32;
    if (allBullets.length > 0 && !allBullets.some(b => METRIC_RX.test(b)))        bulletRisk += 22;
    if (allBullets.filter(b => b.split(/\s+/).length < 8).length > 2)             bulletRisk += 15;
    if (allBullets.filter(b => b.includes('→')).length > 0)                       bulletRisk += 10;
    if (allBullets.some(b => FAKE_VERB_RX.test(b)))                               bulletRisk += 12;
    const bulletScore = Math.max(0, Math.min(100, 100 - bulletRisk));

    // Signal 3: Summary quality — length + clichés
    const summaryText = cvData.summary ?? '';
    const swc = summaryText.split(/\s+/).filter(Boolean).length;
    let summaryRisk = 0;
    if (swc < 30)  summaryRisk += 38;
    else if (swc < 50) summaryRisk += 16;
    if (swc > 130) summaryRisk += 18;
    if (/\b(seeking|looking for|hoping to|aiming to)\b/i.test(summaryText))                               summaryRisk += 25;
    if (/\b(highly motivated|results[‐-]?driven|passionate about|detail[‐-]?oriented)\b/i.test(summaryText)) summaryRisk += 18;
    const summaryScore = Math.max(0, Math.min(100, 100 - summaryRisk));

    // Signal 4: Seniority coherence — overreach / underreach detection
    const seniorityReport = auditSeniorityCoherence(cvData);
    const seniorityScore  = Math.max(0, Math.min(100,
      100 - seniorityReport.issues.filter(i => i.kind === 'seniority_overreach').length  * 15
          - seniorityReport.issues.filter(i => i.kind === 'seniority_underreach').length * 8
    ));

    // Signal 5: ATS keyword match (same engine as the CV generator)
    let atsScore: number | null = null;
    const jd = smJdText.trim();
    if (jd.length > 40) {
      const atsResult = scoreAtsCoverage(cvData, jd);
      atsScore = atsResult.score;
    }

    // Composite — all signals weighted, ATS adds precision when JD supplied
    const composite = atsScore !== null
      ? Math.round(aiScore * 0.25 + bulletScore * 0.22 + summaryScore * 0.13 + seniorityScore * 0.15 + atsScore * 0.25)
      : Math.round(aiScore * 0.32 + bulletScore * 0.28 + summaryScore * 0.22 + seniorityScore * 0.18);

    // Top issues — ranked by severity across all signals
    const topIssues: string[] = [];
    const critHr = hrResult.signals.filter(s => s.riskPts >= 10).sort((a, b) => b.riskPts - a.riskPts);
    if (critHr[0]) topIssues.push(critHr[0].detail);
    if (allBullets.length < 3)
      topIssues.push('Too few bullet points — add at least 3–4 per role to show scope and impact.');
    else if (!allBullets.some(b => METRIC_RX.test(b)))
      topIssues.push('No quantified metrics in bullets — add percentages, revenue figures, or headcount.');
    if (swc < 30)
      topIssues.push('Summary too short or missing — write 3–4 sentences showing your strongest value.');
    else if (/\b(seeking|looking for|hoping to)\b/i.test(summaryText))
      topIssues.push('Summary says what you want ("seeking…") — rewrite it to say what you deliver.');
    if (seniorityReport.issues.length > 0)
      topIssues.push(`${seniorityReport.issues[0].where}: ${seniorityReport.issues[0].detail}`);
    if (atsScore !== null && atsScore < 45)
      topIssues.push(`Only ${atsScore}% ATS keyword match — weave missing keywords into your summary and bullets.`);

    setSmResult({ aiScore, bulletScore, summaryScore, atsScore, composite, topIssues: topIssues.slice(0, 4), cfLive, hasJd: jd.length > 40 });
    setSmScoring(false);
  }, [smCvText, smJdText, smCfPhrases]);

  useEffect(() => { const t = setTimeout(() => setReady(true), 40); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setVis(p => new Set([...p, e.target.getAttribute('data-s') || ''])); });
    }, { threshold: 0 });
    Object.values(refs.current).forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [ready]);
  useEffect(() => {
    const t = setInterval(() => setActivePipe(p => (p + 1) % PIPELINE_STEPS.length), 2000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const reg = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };
  const v = (id: string) => vis.has(id);
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth < 1024;

  /* Two-theme token system — switches cleanly between dark and light */
  const DARK_T = {
    bg: '#0d1525', surface: '#141e2e', elevated: '#1a2236',
    border: '#1e2d47', text: '#f0ece0', muted: '#8892a4', faint: '#3d4f6b',
  };
  const LIGHT_T = {
    bg: '#F8F7F4', surface: '#FFFFFF', elevated: '#ECEAE3',
    border: '#DDD9D0', text: '#1B2B4B', muted: '#5C6478', faint: '#B2AFA7',
  };
  const T = darkMode ? DARK_T : LIGHT_T;
  const bg       = T.bg;
  const surface  = T.surface;
  const elevated = T.elevated;
  const border   = T.border;
  const text     = T.text;
  const muted    = T.muted;
  const faint    = T.faint;
  const ac       = BEFORE_AFTER_CASES[activeCase];

  return (
    <div style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.4s', background: bg, color: text, fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh' }}>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: darkMode ? 'rgba(13,21,37,0.95)' : 'rgba(248,247,244,0.97)',
        backdropFilter: 'blur(20px)', borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, background: Y, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#111' }}>CV</div>
            <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.03em', color: text }}>ProCV</span>
          </div>
          {/* Nav links — hidden on mobile */}
          {!isMobile && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }}>
              {[
                { label: 'Features', id: 'score-cv' },
                { label: 'How It Works', id: 'pipe' },
                { label: 'Templates', id: 'tpl' },
                { label: 'Pricing', id: 'pricing' },
              ].map(item => (
                <button key={item.label}
                  onClick={() => {
                    const el = document.getElementById(item.id) || document.querySelector(`[data-s="${item.id}"]`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{ padding: '6px 12px', fontSize: 13, fontWeight: 500, color: muted, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget.style.color = text)}
                  onMouseLeave={e => (e.currentTarget.style.color = muted)}>
                  {item.label}
                </button>
              ))}
            </nav>
          )}
          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Light / Dark toggle */}
            <button
              onClick={onToggleDark}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`,
                background: 'transparent', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                color: muted, transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = text; e.currentTarget.style.color = text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = muted; }}>
              {darkMode ? (
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
                </svg>
              )}
            </button>
            {!isMobile && hasProfile && onGoToApp && (
              <button onClick={onGoToApp} style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 7, background: 'transparent', border: `1px solid ${border}`, cursor: 'pointer', color: muted, whiteSpace: 'nowrap' }}>← Dashboard</button>
            )}
            {!isMobile && !hasProfile && (
              <button onClick={onSignIn} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 7, background: 'transparent', border: `1px solid ${border}`, cursor: 'pointer', color: text, whiteSpace: 'nowrap' }}>
                Sign in
              </button>
            )}
            <button onClick={onGetStarted} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 800, borderRadius: 7, background: Y, border: 'none', cursor: 'pointer', color: '#111', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              {isMobile ? (hasProfile ? 'Open' : 'Start Free') : (hasProfile ? 'Open Suite' : 'Get Started Free')}
            </button>
            {/* Hamburger button — mobile only */}
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(o => !o)}
                style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0, color: muted }}>
                <span style={{ display: 'block', width: 16, height: 1.5, background: 'currentColor', borderRadius: 1, transition: 'transform 0.2s', transform: mobileMenuOpen ? 'rotate(45deg) translateY(5px)' : 'none' }} />
                <span style={{ display: 'block', width: 16, height: 1.5, background: 'currentColor', borderRadius: 1, opacity: mobileMenuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
                <span style={{ display: 'block', width: 16, height: 1.5, background: 'currentColor', borderRadius: 1, transition: 'transform 0.2s', transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-5px)' : 'none' }} />
              </button>
            )}
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {isMobile && mobileMenuOpen && (
          <div style={{ background: darkMode ? 'rgba(13,21,37,0.98)' : 'rgba(248,247,244,0.99)', borderTop: `1px solid ${border}`, padding: '8px 16px 16px' }}>
            {[
              { label: 'Features', id: 'score-cv' },
              { label: 'How It Works', id: 'pipe' },
              { label: 'Templates', id: 'tpl' },
              { label: 'Pricing', id: 'pricing' },
            ].map(item => (
              <button key={item.label}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTimeout(() => {
                    const el = document.getElementById(item.id) || document.querySelector(`[data-s="${item.id}"]`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 8px', fontSize: 15, fontWeight: 500, color: text, background: 'none', border: 'none', borderBottom: `1px solid ${border}`, cursor: 'pointer' }}>
                {item.label}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {!hasProfile && (
                <button onClick={() => { setMobileMenuOpen(false); onSignIn(); }} style={{ flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: 'transparent', border: `1px solid ${border}`, cursor: 'pointer', color: text }}>Sign in</button>
              )}
              {hasProfile && onGoToApp && (
                <button onClick={() => { setMobileMenuOpen(false); onGoToApp(); }} style={{ flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: 'transparent', border: `1px solid ${border}`, cursor: 'pointer', color: muted }}>← Dashboard</button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '48px 16px 40px' : '72px 24px 56px' }}>

        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 32, height: 2, background: Y }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: muted }}>Your Personal Career Consultant</span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(320px,1fr))', gap: isMobile ? 40 : 64, alignItems: 'center' }}>

          {/* Left: headline + CTA */}
          <div>
            {/* AI badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1B2B4B', color: '#C9A84C', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, marginBottom: 22 }}>
              <span>🤖</span> AI Career Intelligence Engine
            </div>

            <h1 style={{ fontSize: 'clamp(2.6rem,5.5vw,4.4rem)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '0 0 20px' }}>
              Not Another AI CV.<br />
              <span style={{ color: '#C9A84C' }}>A Better You on Paper.</span>
            </h1>

            <p style={{ fontSize: 15, lineHeight: 1.7, color: muted, maxWidth: 440, margin: '0 0 20px' }}>
              The only career platform with a 7-pass CV pipeline that writes, refines, and validates your documents so you sound like <strong style={{ color: text }}>YOU</strong>, not like everyone else.
            </p>

            {/* Benefit bullets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 8 }}>
              {[
                'No generic buzzwords',
                'No fake achievements',
                'No AI-sounding content',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: text }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {item}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 24px' }}>Just authentic, high-impact career documents that get results.</p>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 24 }}>
              <button onClick={onGetStarted}
                style={{ padding: '13px 28px', fontSize: 15, fontWeight: 900, borderRadius: 10, background: Y, border: 'none', cursor: 'pointer', color: '#111', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 20px rgba(235,255,56,0.35)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(235,255,56,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(235,255,56,0.35)'; }}>
                {hasProfile ? 'Open Suite' : 'Build My Profile – It\'s Free'}
                <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
              <button
                onClick={() => { const el = document.getElementById('score-cv'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                style={{ padding: '13px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                See How It Works
              </button>
            </div>

            {/* Social proof */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex' }}>
                {['#C40000','#FF9900','#1565C0','#0f9d58','#6d28d9'].map((c, i) => (
                  <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `2px solid ${surface}`, marginLeft: i > 0 ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff' }}>
                    {['JO','KA','EK','ML','SR'][i]}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 1 }}>
                  {[...Array(5)].map((_, i) => <svg key={i} width={12} height={12} viewBox="0 0 12 12" fill="#f59e0b"><path d="M6 1l1.5 3 3.2.5-2.35 2.25.55 3.2L6 8.5l-2.9 1.45.55-3.2L1.3 4.5l3.2-.5z"/></svg>)}
                </div>
                <span style={{ fontSize: 12, color: muted }}>4.9/5 from 2,000+ professionals</span>
              </div>
            </div>
          </div>

          {/* Right: App UI mockup */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div style={{
              width: '100%', maxWidth: isMobile ? '100%' : 500,
              background: surface, borderRadius: 16,
              border: `1px solid ${border}`,
              boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}>
              {/* Browser chrome bar */}
              <div style={{ background: elevated, borderBottom: `1px solid ${border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                <div style={{ flex: 1, marginLeft: 8, background: darkMode ? '#222' : '#e8e4dc', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: faint }}>procv.app/dashboard</div>
              </div>
              {/* App layout */}
              <div style={{ display: 'flex', minHeight: 360 }}>
                {/* Sidebar nav */}
                <div style={{ width: 110, borderRight: `1px solid ${border}`, padding: '16px 0', background: darkMode ? '#111' : '#fafaf7', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 14px', marginBottom: 4 }}>
                    <div style={{ width: 20, height: 20, background: Y, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#111' }}>CV</div>
                    <span style={{ fontSize: 11, fontWeight: 900, color: text }}>ProCV</span>
                  </div>
                  {[
                    { icon: '👤', label: 'Profile', active: true },
                    { icon: '📄', label: 'CV Builder', active: false },
                    { icon: '🎓', label: 'Scholarships', active: false },
                    { icon: '🎯', label: 'Tracking', active: false },
                    { icon: '📊', label: 'Analytics', active: false },
                  ].map(item => (
                    <div key={item.label} style={{
                      padding: '7px 12px', fontSize: 10, fontWeight: item.active ? 700 : 500,
                      color: item.active ? text : faint,
                      background: item.active ? (darkMode ? 'rgba(255,255,255,0.08)' : elevated) : 'transparent',
                      borderLeft: `2px solid ${item.active ? Y : 'transparent'}`,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 11 }}>{item.icon}</span> {item.label}
                    </div>
                  ))}
                </div>
                {/* Main content */}
                <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Profile strength + AI detection row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Profile gauge */}
                    <div style={{ background: elevated, borderRadius: 10, padding: 12, border: `1px solid ${border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: muted, marginBottom: 10 }}>Your Profile</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Mini donut chart */}
                        <svg width={52} height={52} viewBox="0 0 52 52">
                          <circle cx="26" cy="26" r="20" fill="none" stroke={darkMode ? '#2a2a2a' : '#e5e7eb'} strokeWidth="5"/>
                          <circle cx="26" cy="26" r="20" fill="none" stroke="#22c55e" strokeWidth="5"
                            strokeDasharray={`${2*Math.PI*20*0.92} ${2*Math.PI*20}`}
                            strokeLinecap="round" transform="rotate(-90 26 26)"/>
                          <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="900" fill={text}>92%</text>
                        </svg>
                        <div>
                          <div style={{ fontSize: 9, color: muted }}>Profile Strength</div>
                          <div style={{ fontSize: 11, fontWeight: 900, color: '#22c55e' }}>Excellent</div>
                        </div>
                      </div>
                    </div>
                    {/* AI detection */}
                    <div style={{ background: elevated, borderRadius: 10, padding: 12, border: `1px solid ${border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: muted, marginBottom: 8 }}>AI Detection</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 9 }}>✓</span> Human-like
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: text, lineHeight: 1 }}>98%</div>
                      <div style={{ fontSize: 9, color: muted }}>Undetectable</div>
                    </div>
                  </div>
                  {/* 7-pass pipeline */}
                  <div style={{ background: elevated, borderRadius: 10, padding: '10px 12px', border: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: muted, marginBottom: 8 }}>7-Pass CV Pipeline</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                      {['Brief','Generate','Purify','Validate','Detect','Refine','Finalize'].map((step, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: i < 6 ? '#22c55e' : Y,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: i < 6 ? '#fff' : '#111', fontWeight: 900,
                          }}>
                            {i < 6 ? '✓' : '★'}
                          </div>
                          <div style={{ fontSize: 7, color: faint, textAlign: 'center', lineHeight: 1.2 }}>{i+1}.{step}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Output cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      { label: 'CV / Resume', tag: 'Tailored', color: '#3b82f6' },
                      { label: 'Scholarship Essay', tag: 'Compelling', color: '#8b5cf6' },
                      { label: 'Career Analysis', tag: 'Insightful', color: '#f59e0b' },
                    ].map((c, i) => (
                      <div key={i} style={{ background: surface, borderRadius: 8, padding: '8px', border: `1px solid ${border}`, textAlign: 'center' }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, background: c.color + '22', border: `1px solid ${c.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px', fontSize: 10 }}>
                          {['📄','📝','📊'][i]}
                        </div>
                        <div style={{ fontSize: 8, fontWeight: 700, color: text, lineHeight: 1.2 }}>{c.label}</div>
                        <div style={{ fontSize: 8, color: c.color, fontWeight: 700, marginTop: 2 }}>{c.tag}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Company trust bar ────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '28px 24px', background: surface }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: faint, marginBottom: 20 }}>
            Trusted by professionals landing roles at
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 40px', opacity: 0.55 }}>
            {['Google', 'Meta', 'Amazon', 'Goldman Sachs', 'Deloitte', 'McKinsey', 'Stripe', 'Spotify'].map(co => (
              <span key={co} style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: text, fontFamily: 'system-ui,-apple-system,sans-serif' }}>{co}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solve the Real Problems Others Ignore ────────────────────── */}
      <section style={{ padding: isMobile ? '48px 16px' : '72px 24px', borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', lineHeight: 1.1 }}>
              Solve the <span style={{ color: '#C9A84C' }}>Real Problems</span> Others Ignore
            </h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.65, margin: 0 }}>
              We built ProCV after reading thousands of reviews and talking to recruiters. Here's what professionals hate about other tools — and how we fix it.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {[
              {
                icon: '💬', title: 'Too Generic',
                quote: '"Every resume sounds the same."',
                bad: 'Generic phrases', good: 'Unique voice & variance',
              },
              {
                icon: '📈', title: 'AI Exaggerates',
                quote: '"It invents achievements I never did."',
                bad: 'Fake metrics', good: 'Number fidelity & validation',
              },
              {
                icon: '🤖', title: 'Obvious AI Writing',
                quote: '"Recruiters can tell it\'s AI."',
                bad: 'Robotic tone', good: 'Human-like, natural language',
              },
              {
                icon: '📊', title: 'ATS Scores Mislead',
                quote: '"High score, same bad results."',
                bad: 'Fake scores', good: 'Real optimization & relevance',
              },
              {
                icon: '🎨', title: 'All Templates, No Substance',
                quote: '"Looks good, content is weak."',
                bad: 'Design over content', good: 'Content that gets interviews',
              },
            ].map((card, i) => (
              <div key={i} onClick={onGetStarted}
                style={{ background: surface, padding: '22px 18px', borderRadius: 14, border: `1px solid ${border}`, cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
                {/* Icon circle */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1B2B4B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 12 }}>{card.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 6px', color: text }}>{card.title}</h3>
                <p style={{ fontSize: 12, color: muted, fontStyle: 'italic', margin: '0 0 14px', lineHeight: 1.5 }}>{card.quote}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                    <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>✕</span>
                    <span style={{ color: muted, textDecoration: 'line-through' }}>{card.bad}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                    <span style={{ color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span style={{ color: text, fontWeight: 600 }}>{card.good}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Score My CV — first thing after hero ──────────────────────── */}
      <section
        id="score-cv"
        ref={reg('smc')} data-s="smc"
        style={{
          padding: isMobile ? '40px 16px' : '64px 24px',
          borderTop: `1px solid ${border}`,
          borderBottom: `1px solid ${border}`,
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 36, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8, margin: '0 0 8px' }}>Free · instant · no AI required</p>
              <h2 style={{ fontSize: 'clamp(1.7rem,3.8vw,2.4rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 10px', lineHeight: 1.1 }}>See your CV score<br />before a recruiter does.</h2>
              <p style={{ fontSize: 14, color: muted, margin: 0, maxWidth: 500, lineHeight: 1.6 }}>Paste your CV text and get an instant score across 5 dimensions — AI-tell detection, bullet quality, summary strength, seniority coherence, and ATS match. Create a free account to fix everything ProCV finds.</p>
            </div>
          </div>

          {/* Input + Result grid — responsive via sm-score-grid CSS class */}
          <div className={`sm-score-grid${smResult ? ' has-result' : ''}`}>

            {/* Left: inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Validation error banner */}
              {smValidationError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: darkMode ? '#1f0a0a' : '#fef2f2', border: `1px solid ${darkMode ? '#3d1515' : '#fecaca'}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, fontSize: 13, color: '#ef4444' }}>⚠</span>
                  <span style={{ fontSize: 12, color: darkMode ? '#fca5a5' : '#b91c1c', lineHeight: 1.5 }}>{smValidationError}</span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: faint, marginBottom: 6 }}>
                  Your CV text *
                </label>
                <textarea
                  value={smCvText}
                  onChange={e => { setSmCvText(e.target.value); setSmResult(null); setSmValidationError(null); }}
                  placeholder={`Paste your CV text here…\n\nExample:\nSenior Product Manager with 7+ years in fintech.\n\n• Led checkout redesign for 2.4M merchants → £12.6M ARR\n• Cut cart abandonment 34% via 22-variant A/B programme\n• Grew NPS 42→78 via onboarding personalisation`}
                  rows={11}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 14px', fontSize: 13, lineHeight: 1.55,
                    borderRadius: 12,
                    border: `1.5px solid ${smValidationError ? '#ef4444' : smCvText.length >= 200 ? '#22c55e55' : border}`,
                    background: surface, color: text, resize: 'vertical',
                    outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
                  }}
                />
                <p style={{ fontSize: 11, color: faint, margin: '4px 0 0', textAlign: 'right' }}>
                  {smCvText.length < 200
                    ? `${200 - smCvText.length} more characters needed`
                    : `✓ ${smCvText.length} chars`}
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: faint, marginBottom: 6 }}>
                  Job description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — unlocks ATS match score)</span>
                </label>
                <textarea
                  value={smJdText}
                  onChange={e => { setSmJdText(e.target.value); setSmResult(null); }}
                  placeholder="Paste the job description here to get an ATS keyword match score…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 14px', fontSize: 13, lineHeight: 1.55,
                    borderRadius: 12, border: `1.5px solid ${smJdText.length > 40 ? '#3b82f655' : border}`,
                    background: surface, color: text, resize: 'vertical',
                    outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
                  }}
                />
              </div>

              <button
                onClick={smRunScore}
                disabled={smScoring || smCvText.trim().length < 200}
                style={{
                  padding: '13px 28px', fontSize: 14, fontWeight: 900, borderRadius: 12,
                  background: smCvText.trim().length >= 200 ? Y : elevated,
                  border: 'none', cursor: smCvText.trim().length >= 200 ? 'pointer' : 'not-allowed',
                  color: smCvText.trim().length >= 200 ? '#111' : faint,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s', alignSelf: 'flex-start',
                  opacity: smScoring ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (smCvText.trim().length >= 200 && !smScoring) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {smScoring ? (
                  <>
                    <span style={{ width: 14, height: 14, border: '2px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                    Analysing…
                  </>
                ) : '⚡ Score My CV — free'}
              </button>
            </div>

            {/* Right: results */}
            {smResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Composite score */}
                <div style={{ padding: 24, borderRadius: 16, background: surface, border: `1.5px solid ${border}`, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
                    <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
                      <circle cx={50} cy={50} r={40} fill="none" stroke={darkMode ? '#2a2a2a' : '#e5e7eb'} strokeWidth={9} />
                      <circle cx={50} cy={50} r={40} fill="none"
                        stroke={smResult.composite >= 75 ? '#22c55e' : smResult.composite >= 55 ? '#f59e0b' : '#ef4444'}
                        strokeWidth={9}
                        strokeDasharray={`${(smResult.composite / 100) * 251.3} 251.3`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: smResult.composite >= 75 ? '#22c55e' : smResult.composite >= 55 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{smResult.composite}</span>
                      <span style={{ fontSize: 9, color: faint }}>/100</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>
                      {smResult.composite >= 85 ? 'Excellent shape' : smResult.composite >= 70 ? 'Good — fixable gaps' : smResult.composite >= 50 ? 'Fair — needs work' : 'Needs improvement'}
                    </div>
                    <p style={{ fontSize: 12, color: muted, margin: '0 0 12px', lineHeight: 1.5 }}>
                      {smResult.composite >= 80
                        ? 'Strong CV. ProCV can push it further with ATS-targeted generation.'
                        : smResult.composite >= 60
                        ? 'Several patterns recruiters flag. ProCV fixes all of these automatically.'
                        : 'Multiple issues found. ProCV generates ATS-optimised CVs that avoid every one of these.'}
                    </p>
                    {smResult.cfLive && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#22c55e22', color: '#16a34a', fontWeight: 700 }}>
                        ✓ Live HR data
                      </span>
                    )}
                  </div>
                </div>

                {/* Dimension bars */}
                <div style={{ padding: 20, borderRadius: 16, background: surface, border: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: faint, margin: 0 }}>Score breakdown</p>
                  {[
                    { label: 'AI-Tell Detection', score: smResult.aiScore, icon: '🤖' },
                    { label: 'Bullet Quality', score: smResult.bulletScore, icon: '✦' },
                    { label: 'Summary Strength', score: smResult.summaryScore, icon: '📝' },
                    ...(smResult.atsScore !== null ? [{ label: 'ATS Keyword Match', score: smResult.atsScore, icon: '🎯' }] : []),
                  ].map(({ label, score, icon }) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: text }}>{icon} {label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444' }}>{score}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: darkMode ? '#2a2a2a' : '#e5e7eb' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${score}%`, transition: 'width 0.9s ease', background: score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                    </div>
                  ))}
                  {!smResult.hasJd && (
                    <p style={{ fontSize: 11, color: faint, margin: 0, fontStyle: 'italic' }}>
                      + Paste a job description above to unlock ATS match score
                    </p>
                  )}
                </div>

                {/* Top issues */}
                {smResult.topIssues.length > 0 && (
                  <div style={{ padding: 20, borderRadius: 16, background: surface, border: `1px solid ${border}` }}>
                    <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: faint, margin: '0 0 12px' }}>Top issues to fix</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {smResult.topIssues.map((issue, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: darkMode ? '#1f0a0a' : '#fef2f2', border: `1px solid ${darkMode ? '#3d1515' : '#fecaca'}` }}>
                          <span style={{ flexShrink: 0, fontSize: 12, color: '#ef4444' }}>✗</span>
                          <span style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div style={{ padding: 20, borderRadius: 16, background: `linear-gradient(135deg, #1B2B4B 0%, #2a3f6b 100%)`, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>
                    ProCV fixes all of this automatically.
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '0 0 16px', lineHeight: 1.5 }}>
                    Generate an ATS-optimised, recruiter-safe CV from your profile in minutes.
                  </p>
                  <button
                    onClick={onGetStarted}
                    style={{ padding: '11px 24px', fontSize: 13, fontWeight: 900, borderRadius: 10, background: Y, border: 'none', cursor: 'pointer', color: '#111', display: 'inline-flex', alignItems: 'center', gap: 7, transition: 'transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  >
                    Fix my CV with ProCV →
                    <svg width={13} height={13} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Tool marquee ─────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, overflow: 'hidden', padding: '10px 0' }}>
        <div style={{ display: 'flex', gap: 36, whiteSpace: 'nowrap', width: 'max-content', animation: 'marquee 26s linear infinite' }}>
          {['CV Generator', 'Cover Letter', 'ATS Checker', 'Portal Scanner', 'Interview Prep', 'Negotiation Coach', 'CV Doctor', 'LinkedIn Optimiser', 'HR Detector', 'Quality Audit', 'Scholarship Essays', 'Job Board', 'Cloud Backup', 'PDF Export',
            'CV Generator', 'Cover Letter', 'ATS Checker', 'Portal Scanner', 'Interview Prep', 'Negotiation Coach', 'CV Doctor', 'LinkedIn Optimiser', 'HR Detector', 'Quality Audit', 'Scholarship Essays', 'Job Board', 'Cloud Backup', 'PDF Export'].map((t, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: muted, display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              {t}
              {i % 5 === 2 && <span style={{ color: '#111', fontSize: 10, background: Y, padding: '1px 5px', borderRadius: 3 }}>✦</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── The CV Quality Engine ─────────────────────────────────────── */}
      <section
        ref={reg('pipe')} data-s="pipe"
        style={{
          background: bg, padding: isMobile ? '48px 16px' : '72px 24px', position: 'relative', overflow: 'hidden',
          borderTop: `1px solid ${border}`,
          opacity: v('pipe') ? 1 : 0, transform: v('pipe') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : 'repeat(auto-fit,minmax(300px,1fr))', gap: isMobile ? 36 : 56, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', background: '#C9A84C', color: '#1B2B4B', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, marginBottom: 18 }}>
                The Engine
              </div>
              <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', lineHeight: 1.1, color: text }}>
                7 Passes. One Goal —<br />
                <span style={{ color: '#C9A84C' }}>The Best Version of You.</span>
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: muted, margin: '0 0 32px', maxWidth: 380 }}>
                Every CV runs through our full quality pipeline before you ever see it. No shortcuts.
              </p>
              {/* Stats — animated count-up on scroll-in */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 36px', marginBottom: 32 }}>
                {STATS.map((s, i) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#C9A84C', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {statVals[i]}{s.suffix}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={onGetStarted} style={{ fontSize: 13, fontWeight: 700, padding: '11px 22px', borderRadius: 10, background: '#C9A84C', border: 'none', cursor: 'pointer', color: '#1B2B4B', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Try it on my CV
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
            </div>

            {/* Pipeline steps — numbered with connecting line */}
            <div style={{ position: 'relative', paddingLeft: 16 }}>
              {/* Vertical connector */}
              <div style={{ position: 'absolute', left: 36, top: 20, bottom: 20, width: 1, background: border }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={i}
                    onClick={() => setActivePipe(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', position: 'relative', zIndex: 1 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: activePipe === i ? '#C9A84C' : elevated,
                      color: activePipe === i ? '#1B2B4B' : muted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 900, transition: 'all 0.25s',
                      boxShadow: activePipe === i ? '0 0 18px rgba(201,168,76,0.4)' : 'none',
                    }}>
                      {i + 1}
                    </div>
                    <div style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10, transition: 'all 0.25s',
                      background: activePipe === i ? elevated : 'transparent',
                      border: `1px solid ${activePipe === i ? 'rgba(201,168,76,0.4)' : 'transparent'}`,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: activePipe === i ? text : muted, transition: 'color 0.25s' }}>{step.label}</div>
                      {activePipe === i && <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginTop: 4 }}>{step.detail}</div>}
                    </div>
                    {activePipe === i && <div style={{ fontSize: 16, color: '#22c55e', flexShrink: 0 }}>✓</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ── One Profile. Unlimited Possibilities. ────────────────────── */}
      <section style={{ padding: isMobile ? '48px 16px' : '72px 24px', borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 580, margin: '0 auto 48px' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', lineHeight: 1.1 }}>
              One Profile. <span style={{ color: '#C9A84C' }}>Unlimited Possibilities.</span>
            </h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.65, margin: 0 }}>
              Your career data powers everything. Keep it updated once, and generate anything you need.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
            {[
              {
                icon: '📄', color: '#3b82f6',
                title: 'Smart CV / Resume',
                desc: 'Tailored, ATS-friendly, and impactful resumes for any role.',
                cta: 'Build My CV →',
              },
              {
                icon: '🎓', color: '#8b5cf6',
                title: 'Scholarship Essays',
                desc: 'Compelling, authentic essays that tell your real story.',
                cta: 'Write My Essay →',
              },
              {
                icon: '📊', color: '#f59e0b',
                title: 'Career Analysis',
                desc: 'Get insights, gaps, and recommendations to grow.',
                cta: 'Analyze My Profile →',
              },
              {
                icon: '🎯', color: '#22c55e',
                title: 'Application Tracking',
                desc: 'Track applications, follow-ups, and success metrics.',
                cta: 'Track My Applications →',
              },
            ].map((card, i) => (
              <div key={i}
                style={{ background: surface, borderRadius: 14, border: `1px solid ${border}`, padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: card.color + '1a', border: `1px solid ${card.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{card.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 8px', color: text }}>{card.title}</h3>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>{card.desc}</p>
                <button onClick={onGetStarted} style={{ fontSize: 13, fontWeight: 700, color: card.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {card.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section
        id="pricing"
        ref={reg('pricing')} data-s="pricing"
        style={{
          padding: isMobile ? '48px 16px' : '80px 24px', borderTop: `1px solid ${border}`,
          opacity: v('pricing') ? 1 : 0, transform: v('pricing') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 56px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#C9A84C', color: '#1B2B4B', fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, marginBottom: 18 }}>
              Pricing
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', lineHeight: 1.1, color: text }}>
              Pay for what you download.<br />
              <span style={{ color: '#C9A84C' }}>Nothing else.</span>
            </h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.65, margin: 0 }}>
              All tools are free to use. You only pay when you're happy and want to download your CV.
            </p>
          </div>

          {/* Plan cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, maxWidth: 960, margin: '0 auto' }}>

            {/* Free */}
            <div style={{ background: surface, borderRadius: 18, border: `1px solid ${border}`, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: muted, marginBottom: 12 }}>Free</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', color: text }}>$0</span>
                <span style={{ fontSize: 13, color: muted }}>forever</span>
              </div>
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: '0 0 28px' }}>
                Full access to every tool — CV builder, ATS checker, interview prep, job tracker, and more. Always.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, flex: 1 }}>
                {[
                  'All 14 career tools',
                  'AI CV generation',
                  'ATS scoring & analysis',
                  'Cover letter builder',
                  'Interview prep & coaching',
                  'Unlimited profile slots',
                  'Job application tracker',
                ].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: text }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: muted }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  CV download (pay per download)
                </div>
              </div>
              <button onClick={onGetStarted} style={{ padding: '12px 20px', fontSize: 14, fontWeight: 800, borderRadius: 10, background: elevated, border: `1.5px solid ${border}`, cursor: 'pointer', color: text, transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#C9A84C')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                Start for free
              </button>
            </div>

            {/* Pay-per-download — highlighted */}
            <div style={{ background: '#1B2B4B', borderRadius: 18, border: `2px solid #C9A84C`, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(201,168,76,0.12)', pointerEvents: 'none' }} />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#C9A84C', marginBottom: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C', display: 'inline-block' }} />
                Most popular
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', color: '#fff' }}>$2</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>per CV download</span>
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 28px' }}>
                Only pay when you download. No subscription, no commitment. Download the CVs you need, when you need them.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, flex: 1 }}>
                {[
                  'Everything in Free',
                  'High-quality PDF download',
                  'WYSIWYG — exactly what you see',
                  '35+ professional templates',
                  'ATS-optimised output',
                  'Each download = one credit',
                  'Credits never expire',
                ].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#fff' }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button onClick={onGetStarted} style={{ padding: '12px 20px', fontSize: 14, fontWeight: 800, borderRadius: 10, background: Y, border: 'none', cursor: 'pointer', color: '#111', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(235,255,56,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                Get started — it's free
              </button>
            </div>

            {/* BYOK */}
            <div style={{ background: surface, borderRadius: 18, border: `1px solid ${border}`, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: muted, marginBottom: 12 }}>BYOK — Power User</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', color: text }}>$0</span>
                <span style={{ fontSize: 13, color: muted }}>+ your API key</span>
              </div>
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: '0 0 28px' }}>
                Bring Your Own Key. Connect your own AI API keys and pay only the AI provider's cost — typically a few cents per CV.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, flex: 1 }}>
                {[
                  'Everything in Free',
                  'Unlimited CV downloads',
                  'Use your own Groq / Gemini key',
                  'Pay only AI provider costs',
                  'Full pipeline — no limits',
                  'Priority generation speed',
                  'Advanced model selection',
                ].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: text }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </div>
                ))}
              </div>
              <button onClick={onGetStarted} style={{ padding: '12px 20px', fontSize: 14, fontWeight: 800, borderRadius: 10, background: elevated, border: `1.5px solid ${border}`, cursor: 'pointer', color: text, transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#C9A84C')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                Set up BYOK
              </button>
            </div>

          </div>

          {/* Bottom note */}
          <p style={{ textAlign: 'center', fontSize: 13, color: faint, marginTop: 32 }}>
            All plans include a free account. No credit card required to sign up.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section
        ref={reg('cta')} data-s="cta"
        style={{
          padding: isMobile ? '56px 16px' : '80px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          borderTop: `1px solid ${border}`,
          opacity: v('cta') ? 1 : 0, transform: v('cta') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 60% at 50% 110%, ${Y}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.08, margin: '0 0 14px' }}>
            Your next role starts<br />with a better CV.
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: muted, margin: '0 0 28px' }}>
            Create your free account and get a tailored, ATS-optimised CV built around your real experience — in minutes.
          </p>
          <button onClick={onGetStarted}
            style={{ padding: '14px 36px', fontSize: 15, fontWeight: 900, borderRadius: 10, background: Y, border: 'none', cursor: 'pointer', color: '#111', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 20px rgba(235,255,56,0.3)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(235,255,56,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(235,255,56,0.3)'; }}>
            {hasProfile ? 'Go to Suite' : 'Get Started Free →'}
          </button>
        </div>
      </section>

      {/* ── Privacy slim banner ───────────────────────────────────────── */}
      <div style={{ background: surface, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '18px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke={text} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: text, lineHeight: 1.3 }}>Your data is private and secure.</div>
              <div style={{ fontSize: 12, color: muted }}>We never sell your data. Ever.</div>
            </div>
          </div>
          <button onClick={onGetStarted}
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 900, borderRadius: 8, background: Y, color: '#111', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            Get Started Free →
          </button>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${border}`, background: bg, padding: '40px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Top: logo + columns */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, marginBottom: 36, justifyContent: 'space-between' }}>
            {/* Brand */}
            <div style={{ minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, background: Y, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, color: '#111' }}>CV</div>
                <span style={{ fontWeight: 900, fontSize: 15, color: text, letterSpacing: '-0.02em' }}>ProCV</span>
              </div>
              <p style={{ fontSize: 13, color: muted, margin: '0 0 16px', lineHeight: 1.6, maxWidth: 200 }}>Your Personal Career Consultant. AI-powered career documents that actually sound like you.</p>
            </div>

            {/* Link columns */}
            <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
              {[
                { heading: 'Product', links: ['CV Generator', 'Cover Letter', 'ATS Checker', 'Interview Prep', 'CV Templates'] },
                { heading: 'Resources', links: ['How It Works', 'CV Examples', 'Career Blog', 'Help Center'] },
                { heading: 'Company', links: ['About', 'Privacy Policy', 'Terms of Service'] },
              ].map(col => (
                <div key={col.heading}>
                  <h4 style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: faint, margin: '0 0 14px' }}>{col.heading}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {col.links.map(l => (
                      <button key={l} onClick={onGetStarted} style={{ fontSize: 13, color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = text)}
                        onMouseLeave={e => (e.currentTarget.style.color = muted)}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <p style={{ fontSize: 12, color: faint, margin: 0 }}>© 2026 ProCV — Built by job seekers, for job seekers.</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 12, color: muted }}>All systems operational</span>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sm-score-grid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
        .sm-score-grid.has-result { grid-template-columns: 1fr 1fr; }
        @media (max-width: 760px) {
          .sm-score-grid.has-result { grid-template-columns: 1fr; }
        }
        /* Prevent long words/URLs from overflowing on small screens */
        @media (max-width: 480px) {
          h1, h2, h3, p, span, div { overflow-wrap: break-word; word-break: break-word; }
        }
        /* Hero h1 font size guardrail on tiny screens */
        @media (max-width: 375px) {
          h1 { font-size: 2.1rem !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
