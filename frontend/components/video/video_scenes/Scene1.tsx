import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const weakBullets = [
  'Managed product roadmap',
  'Helped improve metrics',
  'Worked with engineers',
];

const strongBullets = [
  'Owned Checkout EU roadmap for 2.4M merchants, shipping 18 features generating £12.6M ARR',
  'Cut cart abandonment 34% through 22-variant A/B programme, adding £2.1M annual revenue',
  'Led cross-functional squad of 18 engineers across 6 quarterly releases with zero P0 incidents',
];

function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    let i = 0;
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) clearInterval(iv);
      }, 18);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay]);
  return <span>{displayed}<span className="opacity-0">|</span></span>;
}

export function Scene1({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 6200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : '#a1a1aa';
  const strong  = lightMode ? '#1B2B4B' : '#e4e4e7';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ clipPath: 'inset(0 0 0 100%)' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[2vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        The problem
      </motion.p>

      <motion.h2
        className="text-[4.5vw] font-bold text-center leading-tight mb-[4vh]"
        style={{ color: text, fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        Most CVs sound the same.
      </motion.h2>

      <div className="w-full max-w-[80vw] grid grid-cols-2 gap-[3vw]">
        <div className="space-y-[1.2vh]">
          <motion.p
            className="text-[0.85vw] font-semibold tracking-widest uppercase mb-[1.5vh]"
            style={{ color: '#ef4444', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            Before ProCV
          </motion.p>
          {weakBullets.map((b, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-[0.6vw] p-[1vh_1.2vw] rounded-md"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 2 ? { opacity: phase >= 3 ? 0.35 : 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
            >
              <span className="text-[1.1vw] text-red-400 mt-[0.1vh] flex-shrink-0">✗</span>
              <span className="text-[0.85vw] leading-snug" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{b}</span>
            </motion.div>
          ))}
        </div>

        <div className="space-y-[1.2vh]">
          <motion.p
            className="text-[0.85vw] font-semibold tracking-widest uppercase mb-[1.5vh]"
            style={{ color: '#22c55e', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            After ProCV
          </motion.p>
          {strongBullets.map((b, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-[0.6vw] p-[1vh_1.2vw] rounded-md"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
              initial={{ opacity: 0, x: 20 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
              transition={{ duration: 0.5, delay: i * 0.15, type: 'spring', stiffness: 280, damping: 22 }}
            >
              <span className="text-[1.1vw] text-green-400 mt-[0.1vh] flex-shrink-0">✓</span>
              <span className="text-[0.85vw] leading-snug" style={{ color: strong, fontFamily: 'DM Sans, sans-serif' }}>
                {phase >= 3 ? <TypewriterText text={b} delay={i * 160} /> : ''}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className="absolute bottom-[6vh] left-1/2 -translate-x-1/2 h-[2px] rounded-full"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        initial={{ width: 0 }}
        animate={phase >= 1 ? { width: '40vw' } : { width: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}
