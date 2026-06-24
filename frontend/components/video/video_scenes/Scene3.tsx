import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const steps = [
  {
    num: '01',
    label: 'Paste Job Description',
    detail: 'Drop in the job posting. ProCV extracts keywords, seniority, and required skills automatically.',
    color: '#C9A84C',
  },
  {
    num: '02',
    label: 'AI Generates & Validates',
    detail: 'Groq + Cloudflare Workers AI run 7 quality passes — fidelity, humanization, ATS coverage.',
    color: '#C9A84C',
  },
  {
    num: '03',
    label: 'Download Your PDF',
    detail: 'Pixel-perfect PDF via headless Chrome. 35 templates. WYSIWYG — what you see is what you get.',
    color: '#C9A84C',
  },
];

function ProgressBar({ active }: { active: boolean }) {
  return (
    <div className="mt-[1.2vh] h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, #C9A84C, #e8c97a)' }}
        initial={{ width: '0%' }}
        animate={{ width: active ? '100%' : '0%' }}
        transition={{ duration: 4, ease: 'linear' }}
      />
    </div>
  );
}

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 3200),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.6 }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.5vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        How it works
      </motion.p>

      <motion.h2
        className="text-[4vw] font-bold text-center mb-[5vh]"
        style={{ color: '#F8F7F4', fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        Three steps to a standout CV.
      </motion.h2>

      <div className="flex items-start gap-[3vw] w-full max-w-[78vw]">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-[2vw] flex-1">
            <motion.div
              className="flex-1 rounded-xl p-[2.5vh_1.8vw]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              initial={{ opacity: 0, y: 40 }}
              animate={phase >= i + 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 280, damping: 22 }}
            >
              <p
                className="text-[2.5vw] font-black mb-[0.5vh]"
                style={{ color: 'rgba(201,168,76,0.2)', fontFamily: 'Playfair Display, serif', lineHeight: 1 }}
              >
                {step.num}
              </p>
              <p className="text-[1.1vw] font-bold mb-[1vh]" style={{ color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif' }}>
                {step.label}
              </p>
              <p className="text-[0.78vw] leading-relaxed" style={{ color: 'rgba(248,247,244,0.55)', fontFamily: 'DM Sans, sans-serif' }}>
                {step.detail}
              </p>
              {i === 1 && <ProgressBar active={phase >= 3} />}
            </motion.div>

            {i < steps.length - 1 && (
              <motion.div
                className="flex-shrink-0 flex flex-col items-center gap-[0.4vh]"
                initial={{ opacity: 0 }}
                animate={phase >= i + 3 ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {[0, 1, 2].map((d) => (
                  <motion.div
                    key={d}
                    className="w-[4px] h-[4px] rounded-full"
                    style={{ background: '#C9A84C' }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, delay: d * 0.3, repeat: Infinity }}
                  />
                ))}
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
