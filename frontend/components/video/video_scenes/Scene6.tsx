import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const jdKeywords = [
  'stakeholder management', 'OKR alignment', 'growth strategy',
  'data-driven', 'cross-functional', 'P&L ownership', 'go-to-market',
];

const missingKeywords = ['OKR alignment', 'P&L ownership', 'go-to-market'];

const bulletBefore = 'Led the product team and drove growth initiatives across multiple business units.';
const bulletAfter  = 'Drove go-to-market strategy for 3 product lines, aligning OKR targets across 4 divisions with full P&L ownership of £8.4M portfolio.';

export function Scene6({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 4) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(bulletAfter.slice(0, i));
      if (i >= bulletAfter.length) clearInterval(iv);
    }, 22);
    return () => clearInterval(iv);
  }, [phase]);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.55)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.12)' : 'rgba(255,255,255,0.08)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.5vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        ATS Gap Targeting
      </motion.p>

      <motion.h2
        className="text-[3.8vw] font-bold text-center mb-[4vh] leading-tight"
        style={{ color: text, fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        Keywords you're missing.<br />
        <span style={{ color: '#C9A84C' }}>Injected automatically.</span>
      </motion.h2>

      <div className="w-full max-w-[82vw] grid grid-cols-2 gap-[2.5vw]">

        {/* Left: JD keyword scan */}
        <motion.div
          className="rounded-xl p-[2vh_1.8vw]"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <p className="text-[0.95vw] font-semibold tracking-widest uppercase mb-[1.5vh]" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
            Job Description Keywords
          </p>
          <div className="flex flex-wrap gap-[0.5vw]">
            {jdKeywords.map((kw, i) => {
              const isMissing = missingKeywords.includes(kw);
              const showMissing = phase >= 2 && isMissing;
              return (
                <motion.span
                  key={kw}
                  className="px-[0.7vw] py-[0.3vh] rounded-full text-[0.95vw] font-medium"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={phase >= 1 ? {
                    opacity: 1,
                    scale: 1,
                    background: showMissing ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
                    borderColor: showMissing ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)',
                    color: showMissing ? '#fca5a5' : '#86efac',
                  } : { opacity: 0, scale: 0.8 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4, border: { duration: 0.3, delay: phase >= 2 ? 0.5 + i * 0.08 : 0 } }}
                  style={{ border: '1px solid transparent', fontFamily: 'DM Sans, sans-serif' } as any}
                >
                  {showMissing ? '✗ ' : '✓ '}{kw}
                </motion.span>
              );
            })}
          </div>

          <motion.div
            className="mt-[1.5vh] pt-[1.5vh] border-t"
            style={{ borderColor: cardBorder }}
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.8 }}
          >
            <p className="text-[0.95vw]" style={{ color: '#fca5a5', fontFamily: 'DM Sans, sans-serif' }}>
              ↑ {missingKeywords.length} confirmed gap keywords — not in your current CV
            </p>
          </motion.div>
        </motion.div>

        {/* Right: bullet rewrite */}
        <motion.div
          className="rounded-xl p-[2vh_1.8vw] flex flex-col gap-[1.5vh]"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          initial={{ opacity: 0, x: 20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <p className="text-[0.95vw] font-semibold tracking-widest uppercase" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
            Bullet Rewrite
          </p>

          {/* Before */}
          <motion.div
            className="p-[1vh_1vw] rounded-lg"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
            animate={phase >= 3 ? { opacity: 0.4 } : { opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-[0.88vw] font-semibold uppercase mb-[0.5vh]" style={{ color: '#ef4444', fontFamily: 'DM Sans, sans-serif' }}>Before</p>
            <p className="text-[1vw] leading-snug" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{bulletBefore}</p>
          </motion.div>

          {/* After */}
          <motion.div
            className="p-[1vh_1vw] rounded-lg"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-[0.88vw] font-semibold uppercase mb-[0.5vh]" style={{ color: '#22c55e', fontFamily: 'DM Sans, sans-serif' }}>After — gap keywords injected</p>
            <p className="text-[1vw] leading-snug" style={{ color: text, fontFamily: 'DM Sans, sans-serif' }}>
              {typed || (phase >= 3 ? '' : '')}
              {phase >= 4 && typed.length < bulletAfter.length && (
                <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span>
              )}
            </p>
            {/* Highlight injected keywords */}
            {phase >= 4 && typed.length >= bulletAfter.length && (
              <div className="flex flex-wrap gap-[0.4vw] mt-[0.8vh]">
                {missingKeywords.map(kw => (
                  <span key={kw} className="px-[0.5vw] py-[0.2vh] rounded text-[0.6vw] font-semibold" style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', fontFamily: 'DM Sans, sans-serif' }}>
                    ✓ {kw}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
