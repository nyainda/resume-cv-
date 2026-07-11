import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 5 — 30+ Templates (10s)
export function Scene5(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1000),
      setTimeout(() => setPh(3), 2000),
      setTimeout(() => setPh(4), 3500),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const templates = [
    // Row 1
    { name: 'Executive',       cat: 'Leadership',   accent: '#C9A84C', pattern: 'A' },
    { name: 'Silicon Valley',  cat: 'Tech',         accent: '#60a5fa', pattern: 'B' },
    { name: 'Medical Standard',cat: 'Healthcare',   accent: '#34d399', pattern: 'C' },
    { name: 'ATS Clean Pro',   cat: 'Universal',    accent: '#a78bfa', pattern: 'D' },
    { name: 'Tokyo Night',     cat: 'Creative',     accent: '#f472b6', pattern: 'E' },
    // Row 2
    { name: 'Oxford Scholar',  cat: 'Academic',     accent: '#EBFF38', pattern: 'F' },
    { name: 'Minimal Dark',    cat: 'Modern',       accent: '#94a3b8', pattern: 'G' },
    { name: 'Swiss Grid',      cat: 'Design',       accent: '#fb923c', pattern: 'H' },
    { name: 'Legal Brief',     cat: 'Legal / Law',  accent: '#c4b5fd', pattern: 'I' },
    { name: 'Nordic',          cat: 'Minimal',      accent: '#5eead4', pattern: 'J' },
  ];

  const cats = ['All', 'Tech', 'Healthcare', 'Academic', 'Creative', 'Leadership'];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <motion.div className="flex flex-col items-center mb-[2.5vh]"
        initial={{ opacity: 0, y: -20 }} animate={ph >= 1 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65 }}>
        <h2 style={{ fontSize: '3.8vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          30+ <span style={{ color: '#EBFF38' }}>Professional</span> Templates
        </h2>
        <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif', marginTop: '0.6vh' }}>
          Pick the perfect design for your industry — from tech to medicine to law
        </p>
      </motion.div>

      {/* Category tabs */}
      <motion.div className="flex gap-[0.6vw] mb-[2vh]"
        initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
        {cats.map((c, i) => (
          <div key={c}
            className="px-[0.9vw] py-[0.45vh] rounded-full text-[0.72vw] font-semibold"
            style={{
              background: i === 0 ? 'rgba(235,255,56,0.15)' : 'rgba(255,255,255,0.05)',
              border: i === 0 ? '1px solid rgba(235,255,56,0.45)' : '1px solid rgba(255,255,255,0.08)',
              color: i === 0 ? '#EBFF38' : 'rgba(255,255,255,0.45)',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >{c}</div>
        ))}
      </motion.div>

      {/* Template grid */}
      <div className="grid gap-[1vw]" style={{ gridTemplateColumns: 'repeat(5, 1fr)', width: '88vw' }}>
        {templates.map((t, i) => (
          <motion.div key={i}
            className="relative overflow-hidden rounded-xl cursor-pointer"
            style={{ aspectRatio: '3/4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={ph >= 3 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.9 }}
            transition={{ duration: 0.5, delay: i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
            whileHover={{ scale: 1.04, zIndex: 10, transition: { duration: 0.2 } }}
          >
            {/* Template preview */}
            <TemplateMiniPreview pattern={t.pattern} accent={t.accent} />

            {/* Hover overlay */}
            <motion.div className="absolute inset-0 flex flex-col items-center justify-end pb-[1.2vh]"
              style={{ background: `linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85) 100%)` }}
              initial={{ opacity: 0 }} whileHover={{ opacity: 1 }} transition={{ duration: 0.25 }}
            >
              <span style={{ fontSize: '0.72vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textAlign: 'center' }}>
                {t.name}
              </span>
              <span style={{ fontSize: '0.62vw', color: t.accent, fontFamily: 'DM Sans, sans-serif' }}>{t.cat}</span>
            </motion.div>

            {/* Always-visible accent dot */}
            <div className="absolute top-[0.6vh] right-[0.4vw] rounded-full"
              style={{ width: '0.5vw', height: '0.5vw', background: t.accent }} />
          </motion.div>
        ))}
      </div>

      {/* Footer note */}
      <motion.p className="mt-[2vh] text-center"
        style={{ fontSize: '0.82vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0 }} animate={ph >= 4 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}
      >
        All templates export as pixel-perfect PDF · ATS-safe · live preview in browser
      </motion.p>
    </motion.div>
  );
}

// Mini template preview renders different layout patterns
function TemplateMiniPreview({ pattern, accent }: { pattern: string; accent: string }) {
  const configs: Record<string, { header: string; sidebar: boolean; lines: number[] }> = {
    A: { header: '#1a1a2e', sidebar: false, lines: [70, 55, 60, 45, 50] },
    B: { header: '#0f172a', sidebar: false, lines: [80, 50, 65, 45, 55] },
    C: { header: '#064e3b', sidebar: true,  lines: [60, 70, 55, 65, 50] },
    D: { header: '#18181b', sidebar: false, lines: [75, 60, 70, 50, 55] },
    E: { header: '#1e1b4b', sidebar: true,  lines: [65, 75, 55, 60, 70] },
    F: { header: '#1c1917', sidebar: false, lines: [80, 55, 65, 50, 60] },
    G: { header: '#0f172a', sidebar: false, lines: [70, 60, 50, 65, 55] },
    H: { header: '#27272a', sidebar: true,  lines: [65, 70, 60, 55, 75] },
    I: { header: '#1e1b4b', sidebar: false, lines: [75, 55, 65, 50, 60] },
    J: { header: '#042f2e', sidebar: true,  lines: [60, 65, 70, 55, 50] },
  };
  const c = configs[pattern] ?? configs['A'];

  return (
    <div className="w-full h-full flex" style={{ flexDirection: c.sidebar ? 'row' : 'column' }}>
      {/* Header band */}
      {!c.sidebar && (
        <div style={{ height: '22%', background: c.header, borderBottom: `2px solid ${accent}`, flexShrink: 0, padding: '4px 6px' }}>
          <div style={{ width: '60%', height: '4px', background: accent, borderRadius: '2px', marginBottom: '3px' }} />
          <div style={{ width: '40%', height: '3px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
        </div>
      )}
      {/* Sidebar */}
      {c.sidebar && (
        <div style={{ width: '32%', background: c.header, borderRight: `2px solid ${accent}`, padding: '6px 4px', flexShrink: 0 }}>
          <div style={{ width: '70%', height: '4px', background: accent, borderRadius: '2px', marginBottom: '4px' }} />
          {[40,55,45,60,50].map((w, i) => (
            <div key={i} style={{ width: `${w}%`, height: '3px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', marginBottom: '3px' }} />
          ))}
        </div>
      )}
      {/* Content lines */}
      <div style={{ flex: 1, padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {c.lines.map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: i === 0 ? '4px' : '2.5px',
            background: i === 0 ? `${accent}88` : 'rgba(255,255,255,0.12)', borderRadius: '2px' }} />
        ))}
      </div>
    </div>
  );
}
