import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const problems = [
  { icon: '🤖', text: 'Your CV is parsed by a bot — not a human' },
  { icon: '🔑', text: 'Missing keywords = instant rejection, no review' },
  { icon: '📋', text: 'Generic CVs look identical to 10,000 others' },
];

export function Scene1({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),   // stat pops
      setTimeout(() => setPhase(2), 1200),  // label slides
      setTimeout(() => setPhase(3), 2100),  // divider
      setTimeout(() => setPhase(4), 2700),  // problems
      setTimeout(() => setPhase(5), 6000),  // verdict
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.5)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.05)' : 'rgba(255,255,255,0.05)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.12)' : 'rgba(255,255,255,0.08)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[6vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ clipPath: 'inset(0 0 0 100%)', opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Big stat */}
      <motion.div
        className="flex flex-col items-center mb-[3.5vh]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 200, damping: 16 }}
      >
        <motion.span
          className="font-black leading-none"
          style={{ fontSize: '13vw', fontFamily: 'Playfair Display, serif', color: '#C9A84C', lineHeight: 1 }}
          animate={phase >= 1 ? {
            textShadow: ['0 0 0px rgba(201,168,76,0)', '0 0 60px rgba(201,168,76,0.5)', '0 0 30px rgba(201,168,76,0.3)'],
          } : {}}
          transition={{ duration: 1.4, delay: 0.2 }}
        >
          75%
        </motion.span>

        <motion.p
          className="text-center font-semibold mt-[0.5vh]"
          style={{ fontSize: '1.6vw', color: text, fontFamily: 'DM Sans, sans-serif', maxWidth: '48vw' }}
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.55 }}
        >
          of CVs are rejected before a human reads them.
        </motion.p>

        <motion.p
          className="text-center mt-[0.8vh]"
          style={{ fontSize: '1vw', color: subtext, fontFamily: 'DM Sans, sans-serif' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Not because you're underqualified. Because your CV uses the wrong words.
        </motion.p>
      </motion.div>

      {/* Divider */}
      <motion.div
        className="h-[1px] mb-[3vh]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.4), transparent)' }}
        initial={{ width: 0 }}
        animate={phase >= 3 ? { width: '50vw' } : { width: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Problem cards */}
      <div className="flex gap-[2vw] mb-[3.5vh]">
        {problems.map((p, i) => (
          <motion.div
            key={i}
            className="flex items-start gap-[0.8vw] px-[1.5vw] py-[1.2vh] rounded-xl"
            style={{ background: cardBg, border: `1px solid ${cardBorder}`, width: '22vw' }}
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: i * 0.18, type: 'spring', stiffness: 280, damping: 22 }}
          >
            <span style={{ fontSize: '1.3vw', flexShrink: 0, lineHeight: 1.4 }}>{p.icon}</span>
            <span className="text-[0.82vw] leading-relaxed" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
              {p.text}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Verdict */}
      <motion.div
        className="flex items-center gap-[1.5vw]"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="h-[2px] w-[5vw]" style={{ background: 'rgba(201,168,76,0.4)' }} />
        <p className="font-bold" style={{ fontSize: '1.7vw', color: '#C9A84C', fontFamily: 'Playfair Display, serif' }}>
          The system is automated. ProCV beats it.
        </p>
        <div className="h-[2px] w-[5vw]" style={{ background: 'rgba(201,168,76,0.4)' }} />
      </motion.div>
    </motion.div>
  );
}
