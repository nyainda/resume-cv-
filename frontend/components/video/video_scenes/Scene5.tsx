import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const stats = [
  { value: '35',  label: 'CV Templates',    color: '#C9A84C' },
  { value: '7',   label: 'Quality Passes',  color: '#22c55e' },
  { value: '12',  label: 'Career Tools',    color: '#3b82f6' },
  { value: '£0',  label: 'Cost. Forever.',  color: '#C9A84C' },
];

const pillars = [
  'No account required',
  'Data stays in your browser',
  'No cloud. No subscriptions.',
  'Your keys. Your data. Your edge.',
];

export function Scene5({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),   // logo
      setTimeout(() => setPhase(2), 900),   // gold line
      setTimeout(() => setPhase(3), 1700),  // tagline
      setTimeout(() => setPhase(4), 3200),  // stats
      setTimeout(() => setPhase(5), 5600),  // pillars
      setTimeout(() => setPhase(6), 7400),  // CTA
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.5)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Radial glow behind logo */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: '50vw', height: '50vw',
          background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 65%)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Vertical accent lines */}
      <motion.div className="absolute left-[9vw] top-1/2 w-[2px]"
        style={{ background: 'linear-gradient(180deg, transparent, #C9A84C, transparent)', transform: 'translateY(-50%)' }}
        initial={{ height: 0 }} animate={phase >= 1 ? { height: '45vh' } : { height: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div className="absolute right-[9vw] top-1/2 w-[2px]"
        style={{ background: 'linear-gradient(180deg, transparent, #C9A84C, transparent)', transform: 'translateY(-50%)' }}
        initial={{ height: 0 }} animate={phase >= 1 ? { height: '45vh' } : { height: 0 }}
        transition={{ duration: 0.9, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Logo */}
      <motion.div
        className="flex items-center gap-[1.2vw] mb-[2vh]"
        initial={{ opacity: 0, scale: 0.55, y: 10 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.55, y: 10 }}
        transition={{ duration: 0.75, type: 'spring', stiffness: 220, damping: 18 }}
      >
        <motion.div
          className="rounded-2xl flex items-center justify-center font-black"
          style={{ width: '5vw', height: '5vw', background: '#C9A84C', color: '#1B2B4B', fontSize: '2.2vw', fontFamily: 'Playfair Display, serif' }}
          animate={phase >= 1 ? { boxShadow: ['0 0 0px rgba(201,168,76,0)', '0 0 32px rgba(201,168,76,0.5)', '0 0 16px rgba(201,168,76,0.3)'] } : {}}
          transition={{ duration: 1.5, delay: 0.3 }}
        >
          CV
        </motion.div>
        <span className="font-bold" style={{ fontSize: '3.8vw', color: text, fontFamily: 'Playfair Display, serif', letterSpacing: '-0.02em' }}>
          ProCV
        </span>
      </motion.div>

      {/* Gold divider */}
      <motion.div
        className="h-[2px] mb-[2.5vh]"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        initial={{ width: 0 }}
        animate={phase >= 2 ? { width: '32vw' } : { width: 0 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Tagline — letter by letter */}
      <div className="mb-[1vh] overflow-hidden text-center" style={{ maxWidth: '62vw' }}>
        <AnimatePresence>
          {phase >= 3 && (
            <motion.p
              style={{ fontSize: '2.4vw', color: '#C9A84C', fontFamily: 'Playfair Display, serif', fontWeight: 700, lineHeight: 1.2 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
            >
              {'Your Personal Career Consultant.'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.022, ease: [0.16, 1, 0.3, 1] }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <motion.p
        className="text-center mb-[3.5vh]"
        style={{ fontSize: '1vw', color: subtext, fontFamily: 'DM Sans, sans-serif', maxWidth: '44vw', lineHeight: 1.6 }}
        initial={{ opacity: 0, y: 8 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        A CV builder that checks its own work — 7 passes, zero generic output, WYSIWYG PDF.
      </motion.p>

      {/* Stat blocks */}
      <div className="flex gap-[2.5vw] mb-[3vh]">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.85 }}
            transition={{ duration: 0.5, delay: i * 0.12, type: 'spring', stiffness: 280, damping: 20 }}
          >
            <motion.span
              className="font-black leading-none mb-[0.4vh]"
              style={{ fontSize: '3.8vw', color: s.color, fontFamily: 'Playfair Display, serif' }}
              animate={phase >= 4 ? { textShadow: [`0 0 0px ${s.color}00`, `0 0 20px ${s.color}55`, `0 0 10px ${s.color}30`] } : {}}
              transition={{ duration: 1, delay: 0.3 + i * 0.12 }}
            >
              {s.value}
            </motion.span>
            <span className="text-[0.72vw] font-semibold tracking-widest uppercase" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
              {s.label}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Pillar chips */}
      <motion.div
        className="flex flex-wrap justify-center gap-[0.8vw] mb-[3vh]"
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {pillars.map((p, i) => (
          <motion.span
            key={p}
            className="px-[1.1vw] py-[0.55vh] rounded-full text-[0.7vw] font-semibold"
            style={{ border: '1px solid rgba(201,168,76,0.32)', color: 'rgba(201,168,76,0.85)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 5 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
          >
            {p}
          </motion.span>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        className="flex flex-col items-center gap-[1vh]"
        initial={{ opacity: 0, y: 16 }}
        animate={phase >= 6 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="px-[3vw] py-[1.2vh] rounded-full font-bold"
          style={{
            background: 'linear-gradient(135deg, #C9A84C, #e8c97a)',
            color: '#1B2B4B',
            fontSize: '1.1vw',
            fontFamily: 'DM Sans, sans-serif',
            boxShadow: '0 0 30px rgba(201,168,76,0.35)',
          }}
          animate={phase >= 6 ? {
            boxShadow: ['0 0 20px rgba(201,168,76,0.3)', '0 0 40px rgba(201,168,76,0.55)', '0 0 20px rgba(201,168,76,0.3)'],
          } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          Start free in 30 seconds →
        </motion.div>
        <p className="text-[0.78vw] font-medium" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.05em' }}>
          No account. No credit card. No cloud.
        </p>
      </motion.div>
    </motion.div>
  );
}
