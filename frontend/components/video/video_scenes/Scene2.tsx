import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const steps = [
  {
    num: '01',
    icon: '📋',
    label: 'Paste a Job Description',
    detail: 'ProCV reads the JD, extracts required keywords, seniority level, and company tone — automatically.',
    accent: '#3b82f6',
  },
  {
    num: '02',
    icon: '⚡',
    label: 'AI Generates & Validates',
    detail: '7 quality passes: market research, generation, number fidelity, humanization, ATS coverage, voice, polish.',
    accent: '#C9A84C',
  },
  {
    num: '03',
    icon: '📄',
    label: 'Download Your PDF',
    detail: 'Pixel-perfect WYSIWYG PDF via headless Chrome. 35 templates. What you see is exactly what employers receive.',
    accent: '#22c55e',
  },
];

export function Scene2({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),   // eyebrow + headline
      setTimeout(() => setPhase(2), 1000),  // sub
      setTimeout(() => setPhase(3), 1800),  // step 1
      setTimeout(() => setPhase(4), 3400),  // step 2
      setTimeout(() => setPhase(5), 5000),  // step 3
      setTimeout(() => setPhase(6), 7400),  // footer strip
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.5)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.1)' : 'rgba(255,255,255,0.07)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Eyebrow */}
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.2vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -12 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
        transition={{ duration: 0.5 }}
      >
        Meet ProCV
      </motion.p>

      {/* Headline */}
      <motion.h2
        className="font-bold text-center leading-tight mb-[1.2vh]"
        style={{ fontSize: '4.2vw', color: text, fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0, y: 14 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        Your Personal<br />
        <span style={{ color: '#C9A84C' }}>Career Consultant.</span>
      </motion.h2>

      {/* Sub */}
      <motion.p
        className="text-center mb-[4vh]"
        style={{ fontSize: '1.05vw', color: subtext, fontFamily: 'DM Sans, sans-serif', maxWidth: '46vw', lineHeight: 1.6 }}
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        An AI-powered CV builder that doesn't just generate — it validates, humanizes, and targets your output to every job you apply for.
      </motion.p>

      {/* 3-step flow */}
      <div className="flex items-stretch gap-0 w-full max-w-[82vw]">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            <motion.div
              className="flex-1 rounded-xl p-[2.2vh_1.8vw] h-full"
              style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={phase >= i + 3 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.95 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 22 }}
            >
              {/* Top row: num + icon */}
              <div className="flex items-center justify-between mb-[1.5vh]">
                <span
                  className="font-black"
                  style={{ fontSize: '2.8vw', color: `${step.accent}22`, fontFamily: 'Playfair Display, serif', lineHeight: 1 }}
                >
                  {step.num}
                </span>
                <motion.div
                  className="w-[2.8vw] h-[2.8vw] rounded-xl flex items-center justify-center"
                  style={{ background: `${step.accent}18`, fontSize: '1.4vw' }}
                  animate={phase >= i + 3 ? { rotate: [0, -5, 5, 0] } : {}}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  {step.icon}
                </motion.div>
              </div>

              {/* Accent line */}
              <motion.div
                className="h-[2px] rounded-full mb-[1.2vh]"
                style={{ background: `linear-gradient(90deg, ${step.accent}, transparent)` }}
                initial={{ width: 0 }}
                animate={phase >= i + 3 ? { width: '70%' } : { width: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />

              <p className="font-bold mb-[0.8vh]" style={{ fontSize: '1.05vw', color: text, fontFamily: 'DM Sans, sans-serif' }}>
                {step.label}
              </p>
              <p className="leading-relaxed" style={{ fontSize: '0.95vw', color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
                {step.detail}
              </p>
            </motion.div>

            {/* Arrow connector */}
            {i < steps.length - 1 && (
              <motion.div
                className="flex flex-col items-center gap-[3px] px-[0.8vw] flex-shrink-0"
                initial={{ opacity: 0 }}
                animate={phase >= i + 4 ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {[0, 1, 2].map((d) => (
                  <motion.div
                    key={d}
                    className="w-[5px] h-[5px] rounded-full"
                    style={{ background: '#C9A84C' }}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                    transition={{ duration: 1.1, delay: d * 0.25, repeat: Infinity }}
                  />
                ))}
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Footer strip */}
      <motion.div
        className="mt-[3.5vh] flex items-center gap-[3vw]"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 6 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {['7 quality passes', '35 templates', 'WYSIWYG PDF', 'Free forever'].map((item, i) => (
          <div key={item} className="flex items-center gap-[0.8vw]">
            {i > 0 && <div className="w-[1px] h-[2.5vh]" style={{ background: 'rgba(201,168,76,0.25)' }} />}
            <div className="flex items-center gap-[0.5vw]">
              <span style={{ color: '#22c55e', fontSize: '1vw' }}>✓</span>
              <span style={{ fontSize: '1vw', color: subtext, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{item}</span>
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
