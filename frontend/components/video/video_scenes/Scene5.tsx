import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 5 — 30+ Templates (10s) — real CV miniature previews
export function Scene5(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1000),
      setTimeout(() => setPh(3), 2200),
      setTimeout(() => setPh(4), 4000),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const templates = [
    {
      name: 'Executive',
      cat: 'Leadership',
      accent: '#C9A84C',
      headerBg: '#1a1a2e',
      headerText: 'white',
      sidebar: false,
      person: { name: 'James Chen', title: 'Chief Product Officer', company: 'Shopify', role: 'VP of Product', co2: 'Amazon', role2: 'Senior PM' },
    },
    {
      name: 'Silicon Valley',
      cat: 'Technology',
      accent: '#60a5fa',
      headerBg: '#0f172a',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Priya Sharma', title: 'Senior Engineer', company: 'Stripe', role: 'Backend Eng.', co2: 'Google', role2: 'SWE II' },
    },
    {
      name: 'Medical Standard',
      cat: 'Healthcare',
      accent: '#34d399',
      headerBg: '#064e3b',
      headerText: 'white',
      sidebar: true,
      person: { name: 'Dr. Sarah Mills', title: 'Consultant Surgeon', company: 'NHS Trust', role: 'Consultant', co2: 'UCLH', role2: 'Registrar' },
    },
    {
      name: 'ATS Clean Pro',
      cat: 'Universal',
      accent: '#a78bfa',
      headerBg: '#18181b',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Marcus Lee', title: 'Product Manager', company: 'Monzo', role: 'Lead PM', co2: 'Revolut', role2: 'PM' },
    },
    {
      name: 'Tokyo Night',
      cat: 'Creative',
      accent: '#f472b6',
      headerBg: '#1e1b4b',
      headerText: 'white',
      sidebar: true,
      person: { name: 'Aisha Johnson', title: 'UX Designer', company: 'Figma', role: 'Senior Designer', co2: 'Adobe', role2: 'Designer' },
    },
    {
      name: 'Oxford Scholar',
      cat: 'Academic',
      accent: '#EBFF38',
      headerBg: '#1c1917',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Dr. Tom Walsh', title: 'Research Fellow', company: 'Oxford Univ.', role: 'Postdoc', co2: 'Cambridge', role2: 'PhD Researcher' },
    },
    {
      name: 'Nordic Minimal',
      cat: 'Minimal',
      accent: '#5eead4',
      headerBg: '#042f2e',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Sofia Berg', title: 'Data Scientist', company: 'Spotify', role: 'Sr. Data Sci.', co2: 'Netflix', role2: 'Analyst' },
    },
    {
      name: 'Swiss Grid',
      cat: 'Design',
      accent: '#fb923c',
      headerBg: '#27272a',
      headerText: 'white',
      sidebar: true,
      person: { name: 'Luca Ferrari', title: 'Creative Director', company: 'Wieden+K', role: 'Art Director', co2: 'BBDO', role2: 'Designer' },
    },
    {
      name: 'Legal Brief',
      cat: 'Law',
      accent: '#c4b5fd',
      headerBg: '#1e1b4b',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Emma Clarke', title: 'Solicitor', company: 'Clifford Chance', role: 'Associate', co2: 'Linklaters', role2: 'Trainee' },
    },
    {
      name: 'Finance Pro',
      cat: 'Finance',
      accent: '#fbbf24',
      headerBg: '#14532d',
      headerText: 'white',
      sidebar: false,
      person: { name: 'Raj Patel', title: 'Investment Analyst', company: 'Goldman Sachs', role: 'Associate', co2: 'JP Morgan', role2: 'Analyst' },
    },
  ];

  const cats = ['All', 'Tech', 'Healthcare', 'Academic', 'Creative', 'Finance', 'Law'];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-[4vw]"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <motion.div className="flex flex-col items-center mb-[2vh]"
        initial={{ opacity: 0, y: -20 }} animate={ph >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65 }}>
        <h2 style={{ fontSize: '3.8vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          30+ <span style={{ color: '#EBFF38' }}>Professional</span> Templates
        </h2>
        <p style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', marginTop: '0.5vh' }}>
          Pick the perfect design for your industry — live preview in your browser
        </p>
      </motion.div>

      {/* Category tabs */}
      <motion.div className="flex gap-[0.5vw] mb-[1.8vh]"
        initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
        {cats.map((c, i) => (
          <div key={c} className="px-[0.9vw] py-[0.4vh] rounded-full text-[0.8vw] font-semibold"
            style={{
              background: i === 0 ? 'rgba(235,255,56,0.15)' : 'rgba(255,255,255,0.05)',
              border: i === 0 ? '1px solid rgba(235,255,56,0.45)' : '1px solid rgba(255,255,255,0.08)',
              color: i === 0 ? '#EBFF38' : 'rgba(255,255,255,0.45)',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >{c}</div>
        ))}
      </motion.div>

      {/* Template grid — 5 columns, 2 rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.9vw', width: '90vw' }}>
        {templates.map((t, i) => (
          <motion.div key={i}
            className="relative overflow-hidden rounded-xl"
            style={{ aspectRatio: '3/4', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0, y: 28, scale: 0.88 }}
            animate={ph >= 3 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.88 }}
            transition={{ duration: 0.55, delay: i * 0.06, type: 'spring', stiffness: 250, damping: 22 }}
            whileHover={{ scale: 1.05, zIndex: 10, transition: { duration: 0.2 } }}
          >
            <CVMiniPreview template={t} />

            {/* Bottom label always visible */}
            <div className="absolute bottom-0 left-0 right-0 px-[0.5vw] py-[0.6vh]"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.88))' }}>
              <p style={{ fontSize: '0.72vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>{t.name}</p>
              <p style={{ fontSize: '0.62vw', color: t.accent, fontFamily: 'DM Sans, sans-serif' }}>{t.cat}</p>
            </div>

            {/* Accent dot */}
            <div className="absolute top-[0.5vh] right-[0.4vw] rounded-full"
              style={{ width: '0.45vw', height: '0.45vw', background: t.accent }} />
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <motion.p className="mt-[1.5vh] text-center"
        style={{ fontSize: '0.9vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0 }} animate={ph >= 4 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
        All templates export as pixel-perfect PDF · ATS-safe · WYSIWYG live editor
      </motion.p>
    </motion.div>
  );
}

// ─── Real CV mini-preview ─────────────────────────────────────────────────────
interface TemplateData {
  accent: string;
  headerBg: string;
  sidebar: boolean;
  person: { name: string; title: string; company: string; role: string; co2: string; role2: string };
}

function CVMiniPreview({ template: t }: { template: TemplateData }) {
  // We render a "real" CV at ~200% size then scale it down with transform
  // so text and structure are clearly visible
  const s = {
    name:      { fontSize: 11, fontWeight: 800, color: t.sidebar ? t.accent : '#ffffff' },
    title:     { fontSize: 7.5, color: t.sidebar ? 'rgba(255,255,255,0.7)' : t.accent },
    section:   { fontSize: 5.5, fontWeight: 700, color: t.accent, letterSpacing: '0.12em', textTransform: 'uppercase' as const },
    company:   { fontSize: 6.5, fontWeight: 700, color: '#ffffff' },
    role:      { fontSize: 6, color: 'rgba(255,255,255,0.6)' },
    bullet:    { fontSize: 5.5, color: 'rgba(255,255,255,0.5)' },
    skill:     { fontSize: 5, color: t.accent, border: `0.5px solid ${t.accent}55`, padding: '1px 4px', borderRadius: 3, display: 'inline-block', marginRight: 2, marginBottom: 2 },
  };

  if (t.sidebar) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        {/* Sidebar */}
        <div style={{ width: '38%', background: t.headerBg, borderRight: `1.5px solid ${t.accent}`, padding: '8px 5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Avatar circle */}
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.accent}40`, border: `1.5px solid ${t.accent}`, margin: '0 auto 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12 }}>👤</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={s.name}>{t.person.name.split(' ')[0]}</div>
            <div style={s.name}>{t.person.name.split(' ').slice(1).join(' ')}</div>
            <div style={{ ...s.title, marginTop: 2 }}>{t.person.title}</div>
          </div>
          <div style={{ height: 0.5, background: `${t.accent}44`, margin: '2px 0' }} />
          <div style={s.section}>Contact</div>
          {['London, UK', 'linkedin.com/in/...', 'sarah@email.com'].map((c, i) => (
            <div key={i} style={{ fontSize: 5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{c}</div>
          ))}
          <div style={{ height: 0.5, background: `${t.accent}44`, margin: '2px 0' }} />
          <div style={s.section}>Skills</div>
          <div>
            {['Strategy', 'Figma', 'SQL', 'Roadmap', 'Agile'].map(sk => (
              <span key={sk} style={s.skill}>{sk}</span>
            ))}
          </div>
        </div>
        {/* Main */}
        <div style={{ flex: 1, background: '#111827', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={s.section}>Experience</div>
          {[{ c: t.person.company, r: t.person.role, y: '2022–Now' }, { c: t.person.co2, r: t.person.role2, y: '2019–22' }].map((j, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={s.company}>{j.c}</span>
                <span style={{ fontSize: 5, color: 'rgba(255,255,255,0.35)' }}>{j.y}</span>
              </div>
              <div style={s.role}>{j.r}</div>
              <div style={{ ...s.bullet, marginTop: 1 }}>• Increased revenue by 34% across EMEA markets</div>
              <div style={s.bullet}>• Led cross-functional team of 12 engineers</div>
            </div>
          ))}
          <div style={s.section}>Education</div>
          <div style={s.company}>University of London</div>
          <div style={s.role}>BSc Computer Science · 2:1</div>
        </div>
      </div>
    );
  }

  // Top-header layout
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#111827', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* Header band */}
      <div style={{ background: t.headerBg, padding: '8px 8px 6px', borderBottom: `2px solid ${t.accent}` }}>
        <div style={s.name}>{t.person.name}</div>
        <div style={{ ...s.title, marginTop: 1 }}>{t.person.title}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
          {['London, UK', 'linkedin.com/in/...', 'sarah@email.com'].map((c, i) => (
            <span key={i} style={{ fontSize: 5, color: 'rgba(255,255,255,0.4)' }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div>
          <div style={s.section}>Summary</div>
          <div style={{ height: 0.5, background: `${t.accent}33`, margin: '1.5px 0 3px' }} />
          <div style={{ fontSize: 5.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            Results-driven professional with 8 years experience delivering impact at scale across FTSE 100 organisations.
          </div>
        </div>

        <div>
          <div style={s.section}>Experience</div>
          <div style={{ height: 0.5, background: `${t.accent}33`, margin: '1.5px 0 3px' }} />
          {[{ c: t.person.company, r: t.person.role, y: '2022–Now' }, { c: t.person.co2, r: t.person.role2, y: '2019–22' }].map((j, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={s.company}>{j.c}</span>
                <span style={{ fontSize: 5, color: 'rgba(255,255,255,0.35)' }}>{j.y}</span>
              </div>
              <div style={{ ...s.role, marginBottom: 1 }}>{j.r}</div>
              <div style={s.bullet}>• Increased quarterly revenue by 34% through targeted campaign strategy</div>
              <div style={s.bullet}>• Built and managed cross-functional team of 12 engineers and designers</div>
            </div>
          ))}
        </div>

        <div>
          <div style={s.section}>Skills</div>
          <div style={{ height: 0.5, background: `${t.accent}33`, margin: '1.5px 0 3px' }} />
          <div>
            {['Strategy', 'SQL', 'Figma', 'Agile', 'Python', 'OKRs'].map(sk => (
              <span key={sk} style={s.skill}>{sk}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
