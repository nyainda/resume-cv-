import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ProCVLogo } from '../VideoTemplate';

// Scene 8 — CTA / Close (10s)
export function Scene8(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1000),
      setTimeout(() => setPh(3), 2200),
      setTimeout(() => setPh(4), 3800),
      setTimeout(() => setPh(5), 5500),
      setTimeout(() => setPh(6), 7000),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const stats = [
    { value: '30+',  label: 'Templates',     color: '#EBFF38' },
    { value: '7',    label: 'AI Passes',      color: '#a78bfa' },
    { value: '87',   label: 'Avg ATS Score',  color: '#22c55e' },
    { value: '£0',   label: 'Cost. Always.',  color: '#EBFF38' },
  ];

  const features = [
    'ATS Gap Targeting',
    'CV Doctor AI',
    'Career Rooms',
    'Cover Letter Generator',
    'Share Your Profile',
    'Import from PDF/Word',
    'WYSIWYG Live Editor',
    'Quantify Bullets',
  ];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Big radial glow */}
      <motion.div className="absolute pointer-events-none"
        style={{
          width: '70vw', height: '70vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(235,255,56,0.12) 0%, rgba(201,168,76,0.06) 40%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={ph >= 1 ? { scale: 1, opacity: 1 } : {}}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4, y: 20 }}
        animate={ph >= 1 ? { opacity: 1, scale: 1, y: 0 } : {}}
        transition={{ duration: 0.85, type: 'spring', stiffness: 170, damping: 14 }}
        className="mb-[2vh]"
      >
        <motion.div
          animate={ph >= 1 ? { filter: ['drop-shadow(0 0 0px rgba(235,255,56,0))', 'drop-shadow(0 0 40px rgba(235,255,56,0.7))', 'drop-shadow(0 0 20px rgba(235,255,56,0.4))'] } : {}}
          transition={{ duration: 1.8, delay: 0.4 }}
        >
          <ProCVLogo size="7vw" />
        </motion.div>
      </motion.div>

      {/* ProCV name */}
      <motion.div className="flex items-baseline gap-[0.5vw] mb-[0.8vh]"
        initial={{ opacity: 0, y: 16 }} animate={ph >= 1 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.35 }}>
        <span style={{ fontSize: '5vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, letterSpacing: '-0.03em' }}>
          Pro<span style={{ color: '#EBFF38' }}>CV</span>
        </span>
      </motion.div>

      {/* Tagline */}
      <motion.p className="mb-[3.5vh] text-center"
        style={{ fontSize: '1.35vw', color: 'rgba(255,255,255,0.55)', fontFamily: 'DM Sans, sans-serif', maxWidth: '44vw' }}
        initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.6 }}
      >
        The CV builder that reads the job, writes the CV, checks its own work — and gets you interviews.
      </motion.p>

      {/* Stats row */}
      <motion.div className="flex gap-[3.5vw] mb-[3.5vh]"
        initial={{ opacity: 0, y: 20 }} animate={ph >= 3 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}>
        {stats.map((s, i) => (
          <motion.div key={i} className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.7 }} animate={ph >= 3 ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: i * 0.1, type: 'spring', stiffness: 270, damping: 20 }}>
            <motion.span style={{ fontSize: '3.8vw', color: s.color, fontFamily: 'DM Sans, sans-serif', fontWeight: 900, lineHeight: 1 }}
              animate={ph >= 3 ? { textShadow: [`0 0 0px ${s.color}00`, `0 0 24px ${s.color}66`, `0 0 12px ${s.color}33`] } : {}}
              transition={{ duration: 1.2, delay: 0.4 + i * 0.1 }}>
              {s.value}
            </motion.span>
            <span style={{ fontSize: '0.82vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, letterSpacing: '0.08em', marginTop: '0.3vh' }}>
              {s.label}
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Feature chips */}
      <motion.div className="flex flex-wrap justify-center gap-[0.6vw] mb-[3.5vh]" style={{ maxWidth: '62vw' }}
        initial={{ opacity: 0 }} animate={ph >= 4 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
        {features.map((f, i) => (
          <motion.span key={f}
            className="px-[1vw] py-[0.45vh] rounded-full text-[0.78vw] font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, scale: 0.8 }} animate={ph >= 4 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 290, damping: 22 }}
          >{f}</motion.span>
        ))}
      </motion.div>

      {/* CTA button */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.85 }}
        animate={ph >= 5 ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.7, type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-[1.2vh]"
      >
        <motion.div
          className="px-[4vw] py-[1.5vh] rounded-full font-black cursor-pointer"
          style={{
            background: '#EBFF38',
            color: '#06090f',
            fontSize: '1.3vw',
            fontFamily: 'DM Sans, sans-serif',
            letterSpacing: '-0.01em',
          }}
          animate={ph >= 5 ? {
            boxShadow: [
              '0 0 20px rgba(235,255,56,0.3)',
              '0 0 60px rgba(235,255,56,0.6)',
              '0 0 20px rgba(235,255,56,0.3)',
            ]
          } : {}}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ scale: 1.06, boxShadow: '0 0 70px rgba(235,255,56,0.7)' }}
          whileTap={{ scale: 0.97 }}
        >
          Start Free — No Account Needed →
        </motion.div>

        <motion.p
          style={{ fontSize: '0.88vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}
          initial={{ opacity: 0 }} animate={ph >= 6 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}
        >
          No account · No credit card · Your data never leaves your browser
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
