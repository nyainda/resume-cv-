import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const passes = [
  { label: 'Market Research', icon: '⬡' },
  { label: 'CV Generation', icon: '⬡' },
  { label: 'Number Fidelity', icon: '⬡' },
  { label: 'Humanization Audit', icon: '⬡' },
  { label: 'Voice Consistency', icon: '⬡' },
  { label: 'ATS Coverage', icon: '⬡' },
  { label: 'Quality Polish', icon: '⬡' },
];

export function Scene2() {
  const [activeNode, setActiveNode] = useState(-1);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const base = 500;
    const timers = [
      setTimeout(() => setPhase(1), 300),
      ...passes.map((_, i) => setTimeout(() => setActiveNode(i), base + i * 1200)),
      setTimeout(() => setPhase(2), base + passes.length * 1200 + 400),
      setTimeout(() => setPhase(3), base + passes.length * 1200 + 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.5vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        The quality engine
      </motion.p>

      <motion.h2
        className="text-[4vw] font-bold text-center mb-[4vh]"
        style={{ color: '#F8F7F4', fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        7-Pass Pipeline
      </motion.h2>

      <div className="relative flex flex-col items-center gap-0">
        {passes.map((pass, i) => {
          const isActive = activeNode >= i;
          const isCurrent = activeNode === i;
          return (
            <div key={i} className="flex flex-col items-center">
              <motion.div
                className="flex items-center gap-[1.5vw]"
                initial={{ opacity: 0, x: -15 }}
                animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -15 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
              >
                <motion.div
                  className="w-[2.2vw] h-[2.2vw] rounded-full border-2 flex items-center justify-center text-[0.7vw] font-bold"
                  animate={{
                    borderColor: isActive ? '#C9A84C' : 'rgba(255,255,255,0.2)',
                    backgroundColor: isActive ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                    scale: isCurrent ? [1, 1.15, 1] : 1,
                    boxShadow: isActive ? '0 0 12px rgba(201,168,76,0.4)' : '0 0 0px transparent',
                  }}
                  transition={{ duration: 0.4, scale: { duration: 0.3, repeat: isCurrent ? Infinity : 0 } }}
                >
                  <motion.span
                    animate={{ color: isActive ? '#C9A84C' : 'rgba(255,255,255,0.3)' }}
                    transition={{ duration: 0.3 }}
                  >
                    {i + 1}
                  </motion.span>
                </motion.div>

                <motion.p
                  className="text-[1vw] font-medium w-[14vw]"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                  animate={{ color: isActive ? '#F8F7F4' : 'rgba(248,247,244,0.3)' }}
                  transition={{ duration: 0.4 }}
                >
                  {pass.label}
                </motion.p>

                <motion.div
                  className="w-[4vw] h-[2px] rounded-full"
                  animate={{ backgroundColor: isActive ? '#C9A84C' : 'rgba(255,255,255,0.1)', scaleX: isActive ? 1 : 0.3 }}
                  style={{ transformOrigin: 'left' }}
                  transition={{ duration: 0.5 }}
                />

                <motion.p
                  className="text-[0.8vw] font-semibold"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                  animate={{ color: isActive ? '#22c55e' : 'transparent', opacity: isActive ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  ✓ pass
                </motion.p>
              </motion.div>

              {i < passes.length - 1 && (
                <motion.div
                  className="w-[2px] my-[0.5vh]"
                  style={{ height: '1.8vh' }}
                  animate={{ backgroundColor: activeNode > i ? '#C9A84C' : 'rgba(255,255,255,0.1)' }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <motion.div
        className="mt-[3.5vh] text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-[1.8vw] font-semibold" style={{ color: '#C9A84C', fontFamily: 'Playfair Display, serif' }}>
          7 passes. Zero AI tells.
        </p>
      </motion.div>
    </motion.div>
  );
}
