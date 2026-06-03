import React, { useState, useEffect, useRef } from 'react';

interface Props {
  onGetStarted: () => void;
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

/** Standard Professional — dark navy header, clean body */
const TemplateStandardPro = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7 }}>
    {/* Header */}
    <div style={{ background: '#1B2B4B', padding: '18px 20px 14px', color: '#fff' }}>
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sarah Chen</div>
      <div style={{ fontSize: 8, color: '#94a8c4', marginTop: 3, letterSpacing: '0.08em' }}>Senior Product Manager</div>
      <div style={{ display: 'flex', gap: 14, marginTop: 7, fontSize: 6.5, color: '#7fa4c8' }}>
        <span>sarah.chen@email.com</span>
        <span>·</span>
        <span>London, UK</span>
        <span>·</span>
        <span>linkedin.com/in/sarahchen</span>
      </div>
    </div>
    {/* Body */}
    <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Summary */}
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1B2B4B', borderBottom: '1.5px solid #1B2B4B', paddingBottom: 2, marginBottom: 5 }}>Professional Summary</div>
        <div style={{ fontSize: 6.5, lineHeight: 1.55, color: '#374151' }}>Product leader with 6+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Consistently raises ATS scores 2-3× through precise keyword alignment and metric-dense bullets.</div>
      </div>
      {/* Experience */}
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1B2B4B', borderBottom: '1.5px solid #1B2B4B', paddingBottom: 2, marginBottom: 6 }}>Experience</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, fontSize: 7, color: '#111' }}>Stripe — Senior Product Manager</div>
            <div style={{ fontSize: 6.5, color: '#6b7280' }}>2022 – Present</div>
          </div>
          <div style={{ fontSize: 6.5, color: '#6b7280', marginBottom: 4 }}>London, UK</div>
          {['Owned end-to-end roadmap for Stripe Checkout (EU), serving 2.4M merchants; shipped 18 features in 12 months driving £12.6M ARR.', 'Reduced cart-abandonment 34% by A/B-testing 22 UX variants — directly adding £2.1M annual revenue.', 'Grew NPS 42 → 78 through a personalised onboarding redesign (n=180 user interviews, 3 cohort studies).'].map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2.5 }}>
              <span style={{ color: '#1B2B4B', fontWeight: 900, flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 6.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, fontSize: 7, color: '#111' }}>Monzo — Product Manager</div>
            <div style={{ fontSize: 6.5, color: '#6b7280' }}>2019 – 2022</div>
          </div>
          <div style={{ fontSize: 6.5, color: '#6b7280', marginBottom: 4 }}>London, UK</div>
          {['Launched Monzo Business Lite, acquiring 40K SME customers in 6 months (£0 paid spend).', 'Defined OKR framework adopted across 8 product squads — reduced delivery variance 51%.'].map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2.5 }}>
              <span style={{ color: '#1B2B4B', fontWeight: 900, flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 6.5, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Skills */}
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1B2B4B', borderBottom: '1.5px solid #1B2B4B', paddingBottom: 2, marginBottom: 5 }}>Skills</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {['Product Strategy', 'Roadmapping', 'OKRs', 'A/B Testing', 'SQL', 'Figma', 'Stakeholder Mgmt', 'Agile / Scrum', 'Data Analytics', 'Go-to-Market', 'API Products', 'Payments'].map(s => (
            <span key={s} style={{ fontSize: 6, padding: '2px 5px', background: '#EEF2FF', border: '0.5px solid #C7D2FE', borderRadius: 2, color: '#3730a3' }}>{s}</span>
          ))}
        </div>
      </div>
      {/* Education */}
      <div>
        <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1B2B4B', borderBottom: '1.5px solid #1B2B4B', paddingBottom: 2, marginBottom: 4 }}>Education</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><div style={{ fontWeight: 800, fontSize: 7 }}>UCL — BSc Computer Science</div><div style={{ fontSize: 6.5, color: '#6b7280' }}>First Class Honours · Dissertation: ML-based fraud detection</div></div>
          <div style={{ fontSize: 6.5, color: '#6b7280' }}>2016 – 2019</div>
        </div>
      </div>
    </div>
  </div>
);

/** Navy Sidebar — dark navy left panel, monogram crest, serif accents */
const TemplateNavySidebar = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    {/* Sidebar */}
    <div style={{ width: 114, background: '#1a2f5a', color: '#fff', padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      {/* Photo */}
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#3a5a8a', border: '1.5px solid #7fa8d8', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#7fa8d8' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sarah Chen</div>
        <div style={{ fontSize: 6, color: '#7fa8d8', marginTop: 2 }}>Senior PM</div>
      </div>
      {/* Contact */}
      <div>
        <div style={{ fontSize: 6.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7fa8d8', borderBottom: '0.5px solid #7fa8d8', paddingBottom: 2, marginBottom: 4 }}>Contact</div>
        {['sarah.chen@email.com', '+44 7700 900 123', 'London, UK', 'linkedin.com/in/sc'].map((c, i) => (
          <div key={i} style={{ fontSize: 6, color: '#b8cfe8', marginBottom: 2.5 }}>{c}</div>
        ))}
      </div>
      {/* Skills */}
      <div>
        <div style={{ fontSize: 6.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7fa8d8', borderBottom: '0.5px solid #7fa8d8', paddingBottom: 2, marginBottom: 4 }}>Skills</div>
        {['Product Strategy', 'A/B Testing', 'SQL & Analytics', 'Figma / Prototyping', 'OKR Frameworks', 'Agile / Scrum', 'Stakeholder Mgmt', 'Go-to-Market', 'API & Payments', 'Data Storytelling'].map((s, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#b8cfe8', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#7fa8d8', flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
      {/* Career highlights */}
      <div>
        <div style={{ fontSize: 6.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7fa8d8', borderBottom: '0.5px solid #7fa8d8', paddingBottom: 2, marginBottom: 4 }}>Highlights</div>
        {['£12.6M ARR', '2.4M merchants', 'NPS: 42 → 78', '40K SME launch'].map((h, i) => (
          <div key={i} style={{ fontSize: 6, borderLeft: '1.5px solid #7fa8d8', paddingLeft: 4, marginBottom: 4, color: '#d4e4f4', lineHeight: 1.4 }}>{h}</div>
        ))}
      </div>
      {/* Crest */}
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #3a5a8a', margin: '0 auto 3px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontFamily: 'Georgia,serif', fontWeight: 900, color: '#7fa8d8' }}>SC</div>
        <div style={{ fontSize: 5, color: '#3a5a8a', fontFamily: 'Georgia,serif', letterSpacing: '0.2em' }}>MMXXV</div>
      </div>
    </div>
    {/* Main */}
    <div style={{ flex: 1, padding: '14px 14px', overflow: 'hidden' }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#18181b', lineHeight: 1 }}>Sarah Chen</div>
      <div style={{ fontSize: 7, color: '#7fa8d8', marginBottom: 10, marginTop: 2 }}>Senior Product Manager · 6 Years Experience</div>
      {/* Experience */}
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1a2f5a', borderBottom: '1px solid #1a2f5a', paddingBottom: 2, marginBottom: 6 }}>Experience</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 7, color: '#111' }}>Stripe · Senior PM <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 6 }}>2022–Present</span></div>
        {['Owned Checkout EU roadmap (2.4M merchants); shipped 18 features → £12.6M ARR', 'A/B-tested 22 UX variants — cut abandonment 34%, adding £2.1M revenue', 'Redesigned onboarding from 180 interviews → NPS 42 → 78'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 2, marginTop: i === 0 ? 3 : 0 }}>
            <span style={{ color: '#7fa8d8', fontWeight: 900, flexShrink: 0, fontSize: 7 }}>·</span>
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 7, color: '#111' }}>Monzo · PM <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 6 }}>2019–2022</span></div>
        {['Launched Monzo Business Lite — 40K SME accounts in 6 months, £0 paid spend', 'Built OKR framework across 8 squads, reducing delivery variance 51%'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 2, marginTop: i === 0 ? 3 : 0 }}>
            <span style={{ color: '#7fa8d8', fontWeight: 900, flexShrink: 0, fontSize: 7 }}>·</span>
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      {/* Education */}
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1a2f5a', borderBottom: '1px solid #1a2f5a', paddingBottom: 2, marginBottom: 5 }}>Education</div>
      <div style={{ fontWeight: 800, fontSize: 7 }}>UCL — BSc Computer Science <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 6 }}>2016–2019 · First Class</span></div>
    </div>
  </div>
);

/** Executive Sidebar — deep brown/gold, luxury feel */
const TemplateExecutive = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    {/* Sidebar */}
    <div style={{ width: 122, background: '#2e2510', color: '#fff', padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      {/* Photo */}
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#4a3820', border: '1.5px solid #c8a84b', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#c8a84b' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.04em', color: '#f5e6c8' }}>Sarah Chen</div>
        <div style={{ fontSize: 6, color: '#c8a84b', marginTop: 2, fontStyle: 'italic', fontFamily: 'Georgia,serif' }}>Senior Product Manager</div>
      </div>
      {/* Contact */}
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 2, marginBottom: 4 }}>Contact</div>
        {['sarah.chen@email.com', 'London, UK', '+44 7700 900 123'].map((c, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#d4c4a0', marginBottom: 3 }}>{c}</div>
        ))}
      </div>
      {/* Skills */}
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 2, marginBottom: 4 }}>Expertise</div>
        {['Product Strategy', 'P&L Ownership', 'Go-to-Market', 'OKR Frameworks', 'Stakeholder Mgmt', 'Payments & Fintech', 'A/B Testing', 'SQL & Analytics'].map((s, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#d4c4a0', marginBottom: 2.5, display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ color: '#c8a84b', fontSize: 7 }}>—</span>{s}
          </div>
        ))}
      </div>
      {/* Notable Achievements */}
      <div>
        <div style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c8a84b', borderBottom: '0.5px solid #4a3820', paddingBottom: 2, marginBottom: 4 }}>Notable</div>
        {['£12.6M ARR in 18 mo', '40K SMEs at £0 CAC', 'NPS uplift +36 pts', 'ATS: 31 → 94'].map((a, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#d4c4a0', marginBottom: 3, fontStyle: 'italic', fontFamily: 'Georgia,serif', lineHeight: 1.4 }}>— {a}</div>
        ))}
      </div>
      {/* Crest */}
      <div style={{ marginTop: 'auto', borderTop: '0.5px solid #4a3820', paddingTop: 8 }}>
        <div style={{ borderTop: '0.5px solid rgba(200,168,75,0.4)', paddingTop: 4, textAlign: 'center' }}>
          <div style={{ fontSize: 5, fontFamily: 'Georgia,serif', letterSpacing: '0.3em', color: 'rgba(200,168,75,0.7)', textTransform: 'uppercase' }}>Est. 2019</div>
        </div>
      </div>
    </div>
    {/* Main */}
    <div style={{ flex: 1, padding: '14px 14px' }}>
      <div style={{ borderBottom: '2px solid #c8a84b', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em', color: '#18181b' }}>SARAH CHEN</div>
        <div style={{ fontSize: 7, color: '#6b7280', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Senior Product Manager · Fintech & Payments</div>
      </div>
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#2e2510', borderBottom: '1px solid #c8a84b', paddingBottom: 2, marginBottom: 6 }}>Career History</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 7 }}>Stripe — Senior Product Manager</div>
          <div style={{ fontSize: 6, color: '#6b7280' }}>2022–Present</div>
        </div>
        {['Owned Checkout EU roadmap across 2.4M merchants; delivered 18 features generating £12.6M ARR in 18 months', 'Reduced cart abandonment 34% via 22-variant UX testing programme — incremental £2.1M revenue uplift', 'Improved NPS 42 → 78 after 180-interview onboarding redesign (3-cohort validation, shipped in 11 weeks)'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2.5, marginTop: i === 0 ? 4 : 0 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#c8a84b', flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 7 }}>Monzo — Product Manager</div>
          <div style={{ fontSize: 6, color: '#6b7280' }}>2019–2022</div>
        </div>
        {['Launched Monzo Business Lite, acquiring 40K SME accounts in 6 months at £0 paid spend', 'Defined OKR framework adopted by 8 squads — cut delivery variance from 63% to 12%'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2.5, marginTop: i === 0 ? 4 : 0 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#c8a84b', flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#2e2510', borderBottom: '1px solid #c8a84b', paddingBottom: 2, marginBottom: 5 }}>Education</div>
      <div style={{ fontWeight: 800, fontSize: 7 }}>UCL · BSc Computer Science — First Class Honours <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 6 }}>2016–2019</span></div>
    </div>
  </div>
);

/** Modern Tech — terminal aesthetic, dark charcoal sidebar */
const TemplateModernTech = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    {/* Sidebar */}
    <div style={{ width: 114, background: '#1f2937', color: '#fff', padding: '14px 9px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 8, fontWeight: 900, color: '#f9fafb' }}>Sarah Chen</div>
        <div style={{ fontSize: 5.5, color: '#60a5fa', fontFamily: 'monospace', marginTop: 2 }}>~/senior-pm</div>
      </div>
      {/* Skills as chips */}
      <div>
        <div style={{ fontSize: 5.5, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 4 }}>/* Skills */</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {['SQL', 'Figma', 'A/B Tests', 'OKRs', 'Python', 'Jira', 'APIs', 'Roadmap', 'Agile', 'Payments'].map((s, i) => (
            <span key={i} style={{ fontSize: 5, padding: '1.5px 4px', background: '#374151', color: '#d1d5db', borderRadius: 2 }}>{s}</span>
          ))}
        </div>
      </div>
      {/* Impact */}
      <div>
        <div style={{ fontSize: 5.5, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 4 }}>/* Impact */</div>
        {['£12.6M ARR', '2.4M merchants', 'NPS +36 pts', '40K SMEs', '-34% abandon'].map((h, i) => (
          <div key={i} style={{ fontSize: 5.5, color: '#86efac', display: 'flex', gap: 3, marginBottom: 2.5 }}>
            <span style={{ color: '#4ade80' }}>›</span>{h}
          </div>
        ))}
      </div>
      {/* Repos */}
      <div>
        <div style={{ fontSize: 5.5, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 4 }}>/* Repos */</div>
        {['~/checkout-eu-v2', '~/monzo-biz-lite', '~/okr-framework'].map((r, i) => (
          <div key={i} style={{ fontSize: 5, color: '#60a5fa', fontFamily: 'monospace', marginBottom: 2.5 }}>{r}</div>
        ))}
      </div>
      {/* Terminal footer */}
      <div style={{ marginTop: 'auto', borderTop: '0.5px solid #374151', paddingTop: 6 }}>
        <div style={{ fontSize: 5, fontFamily: 'monospace', color: '#4ade80' }}>$ generated</div>
        <div style={{ fontSize: 4.5, fontFamily: 'monospace', color: '#374151', marginTop: 1 }}>--on=2025-05-14</div>
      </div>
    </div>
    {/* Main */}
    <div style={{ flex: 1, padding: '14px 13px' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.02em', color: '#111827' }}>Sarah Chen</div>
        <div style={{ fontSize: 7, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>Senior Product Manager · Fintech</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 5.5, color: '#60a5fa', fontFamily: 'monospace' }}>
          <span>sarah.chen@email.com</span>
          <span>·</span>
          <span>London, UK</span>
        </div>
      </div>
      <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1f2937', borderBottom: '1.5px solid #1f2937', paddingBottom: 2, marginBottom: 6 }}>Experience</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 7 }}>Stripe — Senior PM</div>
          <div style={{ fontSize: 5.5, color: '#6b7280', fontFamily: 'monospace' }}>2022–Present</div>
        </div>
        {['Owned Checkout EU (2.4M merchants); shipped 18 features → £12.6M ARR in 18mo', 'Cut abandonment 34% via 22-variant A/B programme (+£2.1M revenue)', 'Redesigned onboarding (180 interviews) — NPS 42 → 78'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 2, marginTop: i === 0 ? 3 : 0 }}>
            <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 7, flexShrink: 0 }}>›</span>
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 7 }}>Monzo — PM</div>
          <div style={{ fontSize: 5.5, color: '#6b7280', fontFamily: 'monospace' }}>2019–2022</div>
        </div>
        {['Launched Monzo Business Lite — 40K SME accounts in 6mo at £0 CAC', 'Built OKR framework for 8 squads; delivery variance 63% → 12%'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 2, marginTop: i === 0 ? 3 : 0 }}>
            <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 7, flexShrink: 0 }}>›</span>
            <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 7.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1f2937', borderBottom: '1.5px solid #1f2937', paddingBottom: 2, marginBottom: 4 }}>Education</div>
      <div style={{ fontWeight: 800, fontSize: 7 }}>UCL · BSc Computer Science — First Class <span style={{ fontWeight: 400, color: '#6b7280', fontFamily: 'monospace', fontSize: 5.5 }}>2016–2019</span></div>
    </div>
  </div>
);

/** Compact Sage — sage-green sidebar, serif headings, academic-friendly */
const TemplateCompactSage = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7, display: 'flex' }}>
    <div style={{ width: 110, background: '#365314', color: '#fff', padding: '14px 9px', display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0 }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.35)', margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, fontFamily: 'Georgia,serif', color: '#d9f99d' }}>SC</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 7.5, fontWeight: 900, fontFamily: 'Georgia,serif', color: '#ecfccb' }}>Sarah Chen</div>
        <div style={{ fontSize: 5.5, color: '#a3e635', marginTop: 2, fontStyle: 'italic' }}>Senior PM</div>
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a3e635', borderBottom: '0.5px solid rgba(163,230,53,0.3)', paddingBottom: 2, marginBottom: 4 }}>Contact</div>
        {['sarah.chen@email.com', 'London, UK', '+44 7700 900 123', 'github.com/sarahchen'].map((c, i) => (
          <div key={i} style={{ fontSize: 5.5, color: 'rgba(255,255,255,0.82)', marginBottom: 2.5, lineHeight: 1.3 }}>{c}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 5.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a3e635', borderBottom: '0.5px solid rgba(163,230,53,0.3)', paddingBottom: 2, marginBottom: 4 }}>Skills</div>
        {['Product Strategy', 'OKR Frameworks', 'A/B Testing', 'SQL & Analytics', 'Figma', 'Payments & Fintech', 'Stakeholder Mgmt', 'Go-to-Market', 'Agile / Scrum', 'Data Storytelling', 'API Products', 'User Research'].map((s, i) => (
          <div key={i} style={{ fontSize: 5, color: 'rgba(255,255,255,0.8)', marginBottom: 2.5, display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: '#a3e635', flexShrink: 0 }} />{s}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <div style={{ fontSize: 4.5, fontFamily: 'Georgia,serif', letterSpacing: '0.3em', color: 'rgba(163,230,53,0.4)', textTransform: 'uppercase' }}>Est. 2019</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '12px 13px', overflow: 'hidden' }}>
      <div style={{ borderBottom: '1.5px solid #365314', paddingBottom: 6, marginBottom: 7 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em', color: '#1a2e05', fontFamily: 'Georgia,serif' }}>Sarah Chen</div>
        <div style={{ fontSize: 6.5, color: '#4d7c0f', marginTop: 2, fontStyle: 'italic' }}>Senior Product Manager · Fintech & Payments</div>
      </div>
      <div style={{ fontSize: 6, lineHeight: 1.55, color: '#374151', marginBottom: 7 }}>Product leader with 6+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Track record of raising ATS scores 2–3× through precise keyword alignment and metric-dense writing.</div>
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#365314', borderBottom: '1px solid #365314', paddingBottom: 2, marginBottom: 5 }}>Experience</div>
      {[
        { co: 'Stripe', title: 'Senior Product Manager', dates: '2022–Present', bullets: ['Owned Checkout EU (2.4M merchants); shipped 18 features → £12.6M ARR in 18mo', 'Reduced cart abandonment 34% via 22-variant A/B programme — +£2.1M revenue', 'Redesigned onboarding from 180 interviews — NPS 42 → 78, shipped in 11 weeks'] },
        { co: 'Monzo', title: 'Product Manager', dates: '2019–2022', bullets: ['Launched Business Lite — 40K SME accounts in 6 months at £0 paid spend', 'Built OKR framework for 8 squads; delivery variance 63% → 12%'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, fontSize: 7 }}>{job.co} · <span style={{ fontWeight: 600 }}>{job.title}</span></div>
            <div style={{ fontSize: 6, color: '#6b7280' }}>{job.dates}</div>
          </div>
          {job.bullets.map((b, bi) => (
            <div key={bi} style={{ display: 'flex', gap: 3, marginBottom: 2, marginTop: bi === 0 ? 3 : 0 }}>
              <span style={{ color: '#4d7c0f', flexShrink: 0, fontWeight: 900 }}>▸</span>
              <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#365314', borderBottom: '1px solid #365314', paddingBottom: 2, marginBottom: 4 }}>Education</div>
      <div style={{ fontWeight: 800, fontSize: 7 }}>UCL — BSc Computer Science <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 6 }}>First Class Honours · 2016–2019</span></div>
    </div>
  </div>
);

/** Academic Teal — single-column, left border accent, clean serif headings */
const TemplateAcademicTeal = () => (
  <div style={{ width: 380, height: 520, background: '#fff', fontFamily: 'Arial,sans-serif', overflow: 'hidden', fontSize: 7 }}>
    <div style={{ borderLeft: '4px solid #0891b2', background: '#f0f9ff', padding: '14px 16px 12px' }}>
      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em', color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>Sarah Chen</div>
      <div style={{ fontSize: 7, color: '#0891b2', marginTop: 2, fontStyle: 'italic' }}>Senior Product Manager · Fintech & Payments</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 6, color: '#64748b' }}>
        <span>sarah.chen@email.com</span><span>·</span><span>London, UK</span><span>·</span><span>+44 7700 900 123</span><span>·</span><span>linkedin.com/in/sarahchen</span>
      </div>
    </div>
    <div style={{ padding: '10px 16px' }}>
      <div style={{ fontSize: 6.5, lineHeight: 1.6, color: '#374151', marginBottom: 8, borderLeft: '2px solid #bae6fd', paddingLeft: 7 }}>Product leader with 6+ years driving 0→1 launches and scaling platforms to £10M+ ARR. Deep expertise in payments, fintech, and B2B SaaS. Consistently raises ATS scores 2–3× through precise keyword alignment and metric-dense bullets.</div>
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 2, marginBottom: 6 }}>Professional Experience</div>
      {[
        { co: 'Stripe', title: 'Senior Product Manager', dates: '2022 – Present', loc: 'London, UK', bullets: ['Owned end-to-end roadmap for Checkout EU, serving 2.4M merchants — 18 features → £12.6M ARR', 'Reduced cart abandonment 34% via 22-variant A/B programme, adding £2.1M annual revenue', 'Grew NPS 42 → 78 via personalised onboarding redesign (n=180 interviews, 3 cohort studies)'] },
        { co: 'Monzo', title: 'Product Manager', dates: '2019 – 2022', loc: 'London, UK', bullets: ['Launched Monzo Business Lite — 40K SME accounts in 6 months at £0 paid acquisition spend', 'Defined OKR framework across 8 squads — delivery variance from 63% to 12%'] },
      ].map((job, ji) => (
        <div key={ji} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, fontSize: 7.5, color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>{job.co} — {job.title}</div>
            <div style={{ fontSize: 6, color: '#64748b', flexShrink: 0, marginLeft: 4 }}>{job.dates}</div>
          </div>
          <div style={{ fontSize: 6, color: '#0891b2', marginBottom: 3, fontStyle: 'italic' }}>{job.loc}</div>
          {job.bullets.map((b, bi) => (
            <div key={bi} style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
              <span style={{ color: '#0891b2', fontWeight: 900, flexShrink: 0 }}>–</span>
              <span style={{ fontSize: 6, lineHeight: 1.5, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 2, marginBottom: 5 }}>Skills</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {['Product Strategy', 'OKRs', 'A/B Testing', 'SQL & Analytics', 'Figma', 'Payments & Fintech', 'Stakeholder Mgmt', 'Go-to-Market', 'API Design', 'User Research', 'Agile / Scrum'].map(s => (
          <span key={s} style={{ fontSize: 5.5, padding: '2px 5px', background: '#e0f2fe', border: '0.5px solid #bae6fd', borderRadius: 2, color: '#0369a1' }}>{s}</span>
        ))}
      </div>
      <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0891b2', borderBottom: '1.5px solid #bae6fd', paddingBottom: 2, marginBottom: 4 }}>Education</div>
      <div style={{ fontWeight: 800, fontSize: 7, color: '#0c4a6e', fontFamily: 'Georgia,serif' }}>UCL — BSc Computer Science · First Class Honours <span style={{ fontWeight: 400, color: '#64748b', fontSize: 6 }}>2016–2019</span></div>
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
const LandingPage: React.FC<Props> = ({ onGetStarted, darkMode, onToggleDark, hasProfile, onGoToApp }) => {
  const [ready, setReady] = useState(false);
  const [activeCase, setActiveCase] = useState(0);
  const [activePipe, setActivePipe] = useState(0);
  const [vis, setVis] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLElement | null>>({});

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

  const reg = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };
  const v = (id: string) => vis.has(id);

  /* Fully theme-aware — no hardcoded dark backgrounds */
  const bg       = darkMode ? '#0d0d0d' : '#f7f5f0';
  const surface  = darkMode ? '#161616' : '#ffffff';
  const elevated = darkMode ? '#1c1c1c' : '#eeeae0';
  const border   = darkMode ? '#2a2a2a' : '#d9d5c8';
  const text     = darkMode ? '#f0ece0' : '#111111';
  const muted    = darkMode ? '#888888' : '#555555';
  const faint    = darkMode ? '#444444' : '#aaaaaa';
  const ac       = BEFORE_AFTER_CASES[activeCase];

  return (
    <div style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.4s', background: bg, color: text, fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh' }}>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: darkMode ? 'rgba(13,13,13,0.92)' : 'rgba(247,245,240,0.92)',
        backdropFilter: 'blur(20px)', borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: Y, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#111' }}>CV</div>
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em' }}>ProCV</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onToggleDark} style={{ padding: 8, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: muted }}>
              {darkMode
                ? <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {hasProfile && onGoToApp && (
              <button onClick={onGoToApp} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, background: elevated, border: `1px solid ${border}`, cursor: 'pointer', color: muted }}>← App</button>
            )}
            <button onClick={onGetStarted} style={{ padding: '7px 18px', fontSize: 13, fontWeight: 900, borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111' }}>
              {hasProfile ? 'Open Suite' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 24px 56px' }}>

        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 32, height: 2, background: Y }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: muted }}>Your Personal Career Consultant</span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 64, alignItems: 'center' }}>

          {/* Left: headline + CTA */}
          <div>
            <h1 style={{ fontSize: 'clamp(3rem,6.5vw,5.2rem)', fontWeight: 900, lineHeight: 0.97, letterSpacing: '-0.04em', margin: '0 0 24px' }}>
              Your CV.<br />
              <span style={{ color: darkMode ? '#f0ece0' : '#1B2B4B' }}>ATS-ready.</span><br />
              <span style={{ color: Y, WebkitTextStroke: darkMode ? '0' : '2px #1B2B4B', paintOrder: 'stroke fill' }}>In minutes.</span>
            </h1>

            <p style={{ fontSize: 15, lineHeight: 1.7, color: muted, maxWidth: 400, margin: '0 0 32px' }}>
              14 tools. One profile. ProCV writes tailored, ATS-optimised CVs, preps you for interviews, scans 150+ job portals, and coaches you through salary negotiation — entirely in your browser.
            </p>

            {/* Trust chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
              {[
                { label: 'No signup', icon: '✓' },
                { label: 'No cloud', icon: '✓' },
                { label: 'Free forever', icon: '✓' },
                { label: 'Open source', icon: '✓' },
              ].map(c => (
                <span key={c.label} style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 99, background: elevated, border: `1px solid ${border}`, color: text, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#22c55e', fontSize: 11 }}>{c.icon}</span>{c.label}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <button onClick={onGetStarted}
                style={{ padding: '14px 32px', fontSize: 15, fontWeight: 900, borderRadius: 12, background: Y, border: 'none', cursor: 'pointer', color: '#111', letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 20px rgba(235,255,56,0.35)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(235,255,56,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(235,255,56,0.35)'; }}>
                {hasProfile ? 'Open Suite' : 'Build my CV — free'}
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
              <button onClick={onGetStarted} style={{ padding: '14px 24px', fontSize: 14, fontWeight: 600, borderRadius: 12, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>
                See all 14 tools
              </button>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'flex', gap: 28, marginTop: 40, paddingTop: 32, borderTop: `1px solid ${border}` }}>
              {[
                { value: '35', label: 'CV templates' },
                { value: '150+', label: 'job portals' },
                { value: '14', label: 'career tools' },
                { value: '94/100', label: 'avg ATS score' },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: text }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: faint, marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: large CV template fan */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: 380 }}>
            {/* Back-left: Navy Sidebar */}
            <div style={{ position: 'absolute', transform: 'rotate(-10deg) translate(-88px, 30px)', opacity: 0.65, zIndex: 1, transformOrigin: 'top center' }}>
              <TemplateCard scale={0.48}><TemplateNavySidebar /></TemplateCard>
            </div>
            {/* Back-right: Modern Tech */}
            <div style={{ position: 'absolute', transform: 'rotate(8deg) translate(88px, 24px)', opacity: 0.65, zIndex: 1, transformOrigin: 'top center' }}>
              <TemplateCard scale={0.48}><TemplateModernTech /></TemplateCard>
            </div>
            {/* Front: Standard Pro — bigger and central */}
            <div style={{ position: 'relative', zIndex: 2, transform: 'rotate(-1.5deg)', filter: 'drop-shadow(0 20px 48px rgba(0,0,0,0.22))' }}>
              <TemplateCard scale={0.6} shadow={false}><TemplateStandardPro /></TemplateCard>

              {/* ATS badge */}
              <div style={{ position: 'absolute', bottom: -16, right: -22, background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)' }}>
                <AtsGauge score={94} size={40} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#22c55e' }}>ATS Score</div>
                  <div style={{ fontSize: 10, color: muted }}>Stripe · PM role</div>
                </div>
              </div>

              {/* 14 tools badge */}
              <div style={{ position: 'absolute', top: -16, left: -22, background: Y, borderRadius: 12, padding: '8px 14px', boxShadow: '0 6px 20px rgba(235,255,56,0.45)' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#111', lineHeight: 1 }}>14 tools</div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>one profile</div>
              </div>
            </div>
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
          background: elevated, borderBottom: `1px solid ${border}`, padding: '64px 24px',
          opacity: v('pipe') ? 1 : 0, transform: v('pipe') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 48, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 10 }}>Under the hood</p>
              <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', lineHeight: 1.1 }}>
                Your CV isn't just<br />written. It's engineered.
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: muted, margin: '0 0 24px', maxWidth: 400 }}>
                Every generated CV passes a 6-step quality pipeline before it reaches you — from keyword gap analysis to a zero-token HR simulation that scores it the same way a real ATS would.
              </p>
              <button onClick={onGetStarted} style={{ fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111' }}>
                Try it on my CV →
              </button>
            </div>
            {/* Pipeline steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PIPELINE_STEPS.map((step, i) => (
                <div key={i}
                  onClick={() => setActivePipe(i)}
                  style={{
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                    background: activePipe === i ? (darkMode ? '#222' : surface) : 'transparent',
                    border: `1px solid ${activePipe === i ? Y + '88' : 'transparent'}`,
                    display: 'flex', gap: 14, alignItems: 'flex-start',
                  }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: activePipe === i ? Y : elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: activePipe === i ? '#111' : muted, fontWeight: 900, flexShrink: 0, transition: 'all 0.2s', border: `1px solid ${activePipe === i ? 'transparent' : border}` }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, marginBottom: activePipe === i ? 4 : 0, color: activePipe === i ? text : muted, transition: 'color 0.2s' }}>{step.label}</div>
                    {activePipe === i && <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{step.detail}</div>}
                  </div>
                  {activePipe === i && <div style={{ fontSize: 14, color: '#22c55e', flexShrink: 0, marginTop: 2 }}>✓</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── All 14 tools — grouped ────────────────────────────────────── */}
      <section
        ref={reg('tools')} data-s="tools"
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '64px 24px',
          opacity: v('tools') ? 1 : 0, transform: v('tools') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ marginBottom: 44 }}>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>The full suite</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
              14 tools.<br />One profile. Fill once.
            </h2>
            <button onClick={onGetStarted} style={{ fontSize: 12, fontWeight: 700, padding: '9px 18px', borderRadius: 8, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>
              Explore all tools →
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 2, background: border }}>
          {TOOL_GROUPS.map((group, gi) => (
            <div key={gi} style={{ background: bg }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: group.color }} />
                <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: muted }}>{group.label}</span>
              </div>
              {group.tools.map((tool, ti) => (
                <div key={ti} onClick={onGetStarted} style={{ padding: '14px 20px', borderBottom: ti < 3 ? `1px solid ${border}` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = elevated)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{tool.name}</div>
                  <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>{tool.desc}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Templates — real CV content ───────────────────────────────── */}
      <section
        ref={reg('tpl')} data-s="tpl"
        style={{ background: elevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '56px 24px', overflowX: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto 36px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>35 templates</p>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: text }}>Every template.<br />Pixel-perfect PDF.</h2>
          </div>
          <button onClick={onGetStarted} style={{ fontSize: 12, fontWeight: 700, padding: '9px 18px', borderRadius: 8, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>Browse templates →</button>
        </div>

        {/* 6 full-size template cards with live ATS badges */}
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,185px),1fr))', gap: 24, alignItems: 'start' }}>
          {([
            { label: 'Standard Pro',    tag: 'Classic',    comp: <TemplateStandardPro />,   accentColor: '#1B2B4B', atsScore: 94, atsRole: 'Stripe · PM',     desc: 'Dark navy header. Finance, consulting, law.' },
            { label: 'Navy Sidebar',    tag: 'Prestigious', comp: <TemplateNavySidebar />,   accentColor: '#1a2f5a', atsScore: 91, atsRole: 'HSBC · Director',  desc: 'Monogram crest. Signals seniority at a glance.' },
            { label: 'Executive',       tag: 'Luxury',     comp: <TemplateExecutive />,      accentColor: '#c8a84b', atsScore: 88, atsRole: 'Goldman · VP',     desc: 'Brown & gold. C-suite and board-level roles.' },
            { label: 'Modern Tech',     tag: 'Developer',  comp: <TemplateModernTech />,     accentColor: '#4ade80', atsScore: 97, atsRole: 'Amazon · SWE',     desc: 'Terminal aesthetic. SWE, data, and product roles.' },
            { label: 'Compact Sage',    tag: 'Creative',   comp: <TemplateCompactSage />,    accentColor: '#4d7c0f', atsScore: 93, atsRole: 'Spotify · Design', desc: 'Sage green sidebar. Creative, marketing, and design.' },
            { label: 'Academic Teal',   tag: 'Clean',      comp: <TemplateAcademicTeal />,   accentColor: '#0891b2', atsScore: 96, atsRole: 'UCL · Research',   desc: 'Teal accent. Academic, analyst, and research roles.' },
          ] as const).map(({ label, tag, comp, accentColor, atsScore, atsRole, desc }, i) => (
            <div key={i} onClick={onGetStarted}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12,
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-6px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>

              {/* Card with ATS badge overlay */}
              <div style={{ position: 'relative' }}>
                <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: '0 10px 36px rgba(0,0,0,0.18)', border: `2.5px solid transparent`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                  <TemplateCardFluid shadow={false}>{comp}</TemplateCardFluid>
                </div>

                {/* Animated ATS badge */}
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(255,255,255,0.96)', borderRadius: 8,
                  padding: '5px 8px 5px 5px', display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  transform: v('tpl') ? 'scale(1)' : 'scale(0.6)',
                  opacity: v('tpl') ? 1 : 0,
                  transition: `transform 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.07 + 0.35}s, opacity 0.4s ease ${i * 0.07 + 0.35}s`,
                }}>
                  <AtsGauge score={atsScore} size={30} />
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 900, color: atsScore >= 90 ? '#16a34a' : '#d97706', lineHeight: 1.2 }}>ATS {atsScore}</div>
                    <div style={{ fontSize: 6.5, color: '#6b7280', lineHeight: 1.2 }}>{atsRole}</div>
                  </div>
                </div>
              </div>

              {/* Label */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 900, color: text }}>{label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: surface, border: `1px solid ${border}`, color: faint, flexShrink: 0 }}>{tag}</span>
                </div>
                <p style={{ fontSize: 11, color: muted, margin: 0, lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Custom template callout */}
        <div style={{ maxWidth: 1200, margin: '32px auto 0', padding: '18px 24px', borderRadius: 12, background: surface, border: `1.5px dashed ${border}`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: Y, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 2, color: text }}>Upload your own template</div>
              <div style={{ fontSize: 12, color: muted }}>Got a custom HTML/CSS design? Upload it and ProCV generates into it automatically — your brand, your layout.</div>
            </div>
          </div>
          <button onClick={onGetStarted} style={{ fontSize: 12, fontWeight: 700, padding: '9px 18px', borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111', flexShrink: 0 }}>
            Use my template →
          </button>
        </div>

        <div style={{ maxWidth: 1200, margin: '16px auto 0', textAlign: 'center' }}>
          <button onClick={onGetStarted} style={{ fontSize: 12, fontWeight: 700, padding: '9px 22px', borderRadius: 8, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>
            Browse all 35 templates →
          </button>
        </div>
      </section>

      {/* ── Power Features strip ──────────────────────────────────────── */}
      <section
        ref={reg('pf')} data-s="pf"
        style={{
          borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`,
          padding: '0',
          opacity: v('pf') ? 1 : 0, transform: v('pf') ? 'none' : 'translateY(16px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', background: border, gap: 1 }}>
          {[
            {
              icon: '◈',
              color: '#6366f1',
              title: 'Multiple profiles',
              body: 'Keep separate profiles for different career paths — SWE, PM, freelance. Switch instantly without re-entering a thing.',
            },
            {
              icon: '⊙',
              color: '#0ea5e9',
              title: 'Custom templates',
              body: 'Upload your own HTML/CSS design and ProCV writes directly into it. Your layout, your brand, zero compromise.',
            },
            {
              icon: '◐',
              color: '#22c55e',
              title: 'Full CV history',
              body: 'Every CV you generate is saved with its ATS score. Compare any two versions side by side and track your score over time.',
            },
            {
              icon: '✦',
              color: '#f59e0b',
              title: 'Job application tracker',
              body: 'Log every role you apply to — status, notes, salary, recruiter contact. Never lose track of an application again.',
            },
          ].map((f, i) => (
            <div key={i} onClick={onGetStarted}
              style={{ background: bg, padding: '28px 24px', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = elevated)}
              onMouseLeave={e => (e.currentTarget.style.background = bg)}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: f.color + '22', border: `1px solid ${f.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: f.color, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Before / After ────────────────────────────────────────────── */}
      <section
        ref={reg('ba')} data-s="ba"
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '64px 24px',
          opacity: v('ba') ? 1 : 0, transform: v('ba') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>Real results</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.1 }}>From overlooked<br />to interview-ready.</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {BEFORE_AFTER_CASES.map((c, i) => (
                <button key={i} onClick={() => setActiveCase(i)} style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', background: activeCase === i ? Y : elevated, color: activeCase === i ? '#111' : muted, border: `1px solid ${activeCase === i ? Y : border}` }}>
                  {c.role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
          {/* Before */}
          <div style={{ padding: 24, borderRadius: 16, background: surface, border: '1.5px solid #ef444430' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 4, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444430' }}>Before</span>
                <p style={{ fontSize: 11, color: muted, marginTop: 5 }}>{ac.role} · {ac.tag}</p>
              </div>
              <AtsGauge score={ac.before.score} size={48} />
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: elevated, border: `1px solid ${border}` }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: faint, marginBottom: 8 }}>Experience bullets</p>
              {ac.before.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <span style={{ color: '#ef4444', fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: muted, margin: 0 }}>{b}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: elevated }}>
                <div style={{ width: `${ac.before.score}%`, height: '100%', background: '#ef4444', borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#ef4444' }}>{ac.before.score}/100</span>
            </div>
          </div>
          {/* After */}
          <div style={{ padding: 24, borderRadius: 16, background: surface, border: `1.5px solid ${Y}66` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 4, background: Y + '33', color: darkMode ? Y : '#7a6800', border: `1px solid ${Y}66` }}>After ProCV</span>
                <p style={{ fontSize: 11, color: muted, marginTop: 5 }}>{ac.role} · Generated in {activeCase === 1 ? '3' : activeCase === 2 ? '5' : '4'} min</p>
              </div>
              <AtsGauge score={ac.after.score} size={48} />
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: elevated, border: `1px solid ${Y}44` }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: faint, marginBottom: 8 }}>Experience bullets</p>
              {ac.after.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <span style={{ color: '#22c55e', fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: text, margin: 0 }}>{b}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: elevated }}>
                <div style={{ width: `${ac.after.score}%`, height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#22c55e' }}>{ac.after.score}/100</span>
            </div>
          </div>
        </div>
        {/* Delta callout */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 20, padding: '14px 24px', borderRadius: 14, background: surface, border: `1px solid ${border}` }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 26, fontWeight: 900, color: '#ef4444' }}>{ac.before.score}</div><div style={{ fontSize: 9, color: faint }}>before</div></div>
            <div style={{ fontSize: 18, color: faint }}>→</div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 26, fontWeight: 900, color: '#22c55e' }}>{ac.after.score}</div><div style={{ fontSize: 9, color: faint }}>after</div></div>
            <div style={{ width: 1, height: 32, background: border, margin: '0 4px' }} />
            <div><div style={{ fontSize: 15, fontWeight: 900 }}>+{ac.after.score - ac.before.score} pts</div><div style={{ fontSize: 11, color: muted }}>{ac.role}</div></div>
            <button onClick={onGetStarted} style={{ marginLeft: 8, padding: '8px 16px', fontSize: 12, fontWeight: 900, borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111' }}>
              Score mine →
            </button>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section
        ref={reg('t')} data-s="t"
        style={{
          background: elevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`,
          padding: '56px 24px',
          opacity: v('t') ? 1 : 0, transform: v('t') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>What people say</p>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 36px' }}>Real people. Real offers.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ padding: 24, borderRadius: 16, background: surface, border: `1px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#fff', flexShrink: 0 }}>{t.avatar}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: muted }}>{t.role} · {t.company}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: '4px 8px', borderRadius: 6, background: Y + '33', color: darkMode ? Y : '#7a6800', border: `1px solid ${Y}55`, flexShrink: 0, marginLeft: 8 }}>{t.metric}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: muted, margin: '0 0 14px' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[...Array(5)].map((_, si) => (
                    <svg key={si} width={12} height={12} viewBox="0 0 12 12" fill={Y}><path d="M6 1l1.5 3 3.2.5-2.35 2.25.55 3.2L6 8.5l-2.9 1.45.55-3.2L1.3 4.5l3.2-.5z"/></svg>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section
        ref={reg('cta')} data-s="cta"
        style={{
          padding: '88px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          opacity: v('cta') ? 1 : 0, transform: v('cta') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 60% at 50% 110%, ${Y}20 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-block', background: '#111', color: Y, fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', padding: '4px 10px', marginBottom: 22 }}>Ready when you are</div>
          <h2 style={{ fontSize: 'clamp(2.2rem,5.5vw,3.6rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 16px' }}>The job doesn't wait.<br />Neither should you.</h2>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: muted, margin: '0 0 32px' }}>Fill your profile once. All 14 tools are ready immediately. No tutorial, no credit card, no signup.</p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <button onClick={onGetStarted} style={{ padding: '14px 36px', fontSize: 15, fontWeight: 900, borderRadius: 12, background: Y, border: 'none', cursor: 'pointer', color: '#111', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              {hasProfile ? 'Go to Suite' : 'Build my CV — free'}
              <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
            </button>
            <span style={{ fontSize: 12, color: faint }}>No signup · No credit card · No cloud</span>
          </div>
          <div style={{ marginTop: 44 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: faint, marginBottom: 14 }}>Used to land roles at</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 28px' }}>
              {['Google', 'Amazon', 'Stripe', 'HSBC', 'Goldman Sachs', 'Revolut', 'Spotify', 'Deliveroo'].map(co => (
                <span key={co} style={{ fontSize: 12, fontWeight: 900, color: faint }}>{co}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${border}`, background: elevated, padding: '32px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 24, height: 24, background: Y, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, color: '#111' }}>CV</div>
            <span style={{ fontWeight: 900, fontSize: 13 }}>ProCV</span>
            <span style={{ fontSize: 12, color: faint }}>· Your Personal Career Consultant</span>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {['CV Generator', 'ATS Checker', 'Interview Prep', 'Portal Scanner', 'Negotiation Coach'].map(n => (
              <button key={n} onClick={onGetStarted} style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{n}</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: faint, margin: 0 }}>© 2025 ProCV · Built free. Always.</p>
        </div>
      </footer>

      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
};

export default LandingPage;
