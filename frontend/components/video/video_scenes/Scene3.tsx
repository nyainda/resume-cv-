import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const competitors = [
  {
    name: 'ChatGPT / AI tools',
    tag: 'Generates, never validates',
    flaws: [
      'Output sounds like every other CV',
      'No ATS keyword analysis',
      'No job description context',
      'Gets flagged by recruiters',
    ],
  },
  {
    name: 'Resume Builders',
    tag: 'Pretty templates, zero brain',
    flaws: [
      'Manual keyword research on you',
      'No tailoring to the actual JD',
      'Template-locked, no AI rewrite',
      'No quality pass — hope for the best',
    ],
  },
];

const procvAdvantages = [
  { text: '7-pass quality validation engine', detail: 'Runs after every generation — automatically' },
  { text: 'ATS gap-pin: confirmed missing keywords injected', detail: 'Top 12 gaps found & forced verbatim into output' },
  { text: 'Humanization audit — 0 AI tells', detail: 'Strips clichés, corporate speak, em dashes' },
  { text: 'Live market research via Gemini grounding', detail: 'Real JD intel, not generic templates' },
];

export function Scene3({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1300),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 3800),
      setTimeout(() => setPhase(5), 7800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text     = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext  = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.5)';
  const cardBg   = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.1)' : 'rgba(255,255,255,0.07)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[4vw]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.5vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -12 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
        transition={{ duration: 0.5 }}
      >
        Why ProCV
      </motion.p>

      <motion.h2
        className="text-[3.8vw] font-bold text-center leading-tight mb-[3.5vh]"
        style={{ color: text, fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0, y: 12 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        Others generate CVs.<br />
        <span style={{ color: '#C9A84C' }}>ProCV validates them.</span>
      </motion.h2>

      <div className="w-full max-w-[88vw] grid grid-cols-3 gap-[1.8vw]">

        {/* Competitor columns */}
        {competitors.map((comp, ci) => (
          <motion.div
            key={comp.name}
            className="rounded-xl p-[2vh_1.5vw]"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
            initial={{ opacity: 0, y: 28 }}
            animate={phase >= ci + 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
            transition={{ duration: 0.55, type: 'spring', stiffness: 260, damping: 22 }}
          >
            <p className="text-[0.88vw] font-bold mb-[0.3vh]" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
              {comp.name}
            </p>
            <p className="text-[0.68vw] mb-[1.4vh]" style={{ color: 'rgba(239,68,68,0.75)', fontFamily: 'DM Sans, sans-serif' }}>
              {comp.tag}
            </p>
            {comp.flaws.map((flaw, fi) => (
              <motion.div
                key={fi}
                className="flex items-start gap-[0.5vw] mb-[0.65vh]"
                initial={{ opacity: 0, x: -10 }}
                animate={phase >= ci + 2 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.08 + fi * 0.1, duration: 0.35 }}
              >
                <span style={{ color: '#ef4444', fontSize: '0.75vw', lineHeight: '1.5', flexShrink: 0 }}>✗</span>
                <span className="text-[0.7vw] leading-snug" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{flaw}</span>
              </motion.div>
            ))}
          </motion.div>
        ))}

        {/* ProCV column */}
        <motion.div
          className="rounded-xl p-[2vh_1.5vw] relative overflow-hidden"
          style={{ background: 'rgba(201,168,76,0.09)', border: '1px solid rgba(201,168,76,0.38)' }}
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.96 }}
          transition={{ duration: 0.65, type: 'spring', stiffness: 240, damping: 20 }}
        >
          {/* top glow */}
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.18), transparent 65%)' }}
          />
          {/* glowing border top line */}
          <motion.div
            className="absolute top-0 left-[10%] h-[2px] rounded-full pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
            initial={{ width: 0 }}
            animate={phase >= 4 ? { width: '80%' } : { width: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          />

          <div className="flex items-center gap-[0.7vw] mb-[0.3vh]">
            <div
              className="w-[1.6vw] h-[1.6vw] rounded flex items-center justify-center font-bold"
              style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '0.6vw', fontFamily: 'Playfair Display, serif' }}
            >
              CV
            </div>
            <p className="text-[0.88vw] font-bold" style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}>ProCV</p>
          </div>
          <p className="text-[0.68vw] mb-[1.4vh]" style={{ color: 'rgba(34,197,94,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
            Built to check its own work
          </p>

          {procvAdvantages.map((adv, ai) => (
            <motion.div
              key={ai}
              className="flex items-start gap-[0.5vw] mb-[0.8vh]"
              initial={{ opacity: 0, x: 10 }}
              animate={phase >= 4 ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.08 + ai * 0.12, duration: 0.4, type: 'spring', stiffness: 320 }}
            >
              <span style={{ color: '#22c55e', fontSize: '0.75vw', lineHeight: '1.5', flexShrink: 0 }}>✓</span>
              <div>
                <span className="text-[0.72vw] font-semibold leading-snug block" style={{ color: text, fontFamily: 'DM Sans, sans-serif' }}>{adv.text}</span>
                <span className="text-[0.6vw] leading-snug" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{adv.detail}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom verdict */}
      <motion.div
        className="mt-[2.5vh] flex items-center gap-[1.5vw]"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="h-[1px] w-[8vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
        <p className="text-[1.4vw] font-semibold" style={{ color: '#C9A84C', fontFamily: 'Playfair Display, serif' }}>
          The only builder that checks its own work.
        </p>
        <div className="h-[1px] w-[8vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
      </motion.div>
    </motion.div>
  );
}
