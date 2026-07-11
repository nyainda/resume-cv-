import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ProCVLogo } from '../VideoTemplate';

// Scene 2 — Meet ProCV (10s)
// Big logo reveal + what it is
export function Scene2(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1000),
      setTimeout(() => setPh(3), 2000),
      setTimeout(() => setPh(4), 3200),
      setTimeout(() => setPh(5), 5000),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const props = [
    { icon: '🎯', text: 'Reads your job description and targets every keyword' },
    { icon: '✍️', text: '7-pass quality pipeline — checks and rewrites its own work' },
    { icon: '📄', text: 'Professional PDF, ready for any ATS system' },
  ];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-[8vw]"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, scale: 0.96 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Radial glow */}
      <motion.div className="absolute inset-0 pointer-events-none flex items-center justify-center"
        initial={{ opacity: 0 }} animate={ph >= 1 ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 1.2 }}>
        <div style={{
          width: '45vw', height: '45vw',
          background: 'radial-gradient(circle, rgba(235,255,56,0.1) 0%, rgba(201,168,76,0.05) 45%, transparent 70%)',
          borderRadius: '50%',
        }} />
      </motion.div>

      {/* Logo */}
      <motion.div className="mb-[2.5vh] relative"
        initial={{ opacity: 0, scale: 0.4, rotate: -10 }}
        animate={ph >= 1 ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.4, rotate: -10 }}
        transition={{ duration: 0.9, type: 'spring', stiffness: 180, damping: 14 }}
      >
        <motion.div
          animate={ph >= 1 ? { filter: ['drop-shadow(0 0 0px rgba(235,255,56,0))', 'drop-shadow(0 0 30px rgba(235,255,56,0.6))', 'drop-shadow(0 0 15px rgba(235,255,56,0.3))'] } : {}}
          transition={{ duration: 1.5, delay: 0.3 }}
        >
          <ProCVLogo size="8vw" />
        </motion.div>
      </motion.div>

      {/* Brand name */}
      <motion.div className="flex items-baseline gap-[0.8vw] mb-[1.5vh]"
        initial={{ opacity: 0, y: 16 }}
        animate={ph >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <span style={{ fontSize: '4.5vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, letterSpacing: '-0.03em' }}>
          Pro<span style={{ color: '#EBFF38' }}>CV</span>
        </span>
      </motion.div>

      {/* Tagline */}
      <motion.p className="text-center mb-[1vh]"
        style={{ fontSize: '1.65vw', color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}
        initial={{ opacity: 0, y: 10 }}
        animate={ph >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.55 }}
      >
        Your Personal Career Consultant
      </motion.p>

      {/* Sub */}
      <motion.p className="text-center mb-[4vh]"
        style={{ fontSize: '1.15vw', color: 'rgba(255,255,255,0.38)', fontFamily: 'DM Sans, sans-serif', maxWidth: '42vw' }}
        initial={{ opacity: 0 }}
        animate={ph >= 2 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        Not just another CV builder. ProCV reads the job description, writes your CV, then validates it — automatically.
      </motion.p>

      {/* Gold divider */}
      <motion.div className="h-[1px] mb-[3.5vh]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(235,255,56,0.5), transparent)' }}
        initial={{ width: 0 }}
        animate={ph >= 3 ? { width: '44vw' } : { width: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Value props */}
      <div className="flex gap-[2vw]">
        {props.map((p, i) => (
          <motion.div key={i}
            className="flex flex-col items-center text-center gap-[0.8vh] px-[1.5vw] py-[1.5vh] rounded-2xl"
            style={{ background: 'rgba(235,255,56,0.04)', border: '1px solid rgba(235,255,56,0.12)', backdropFilter: 'blur(10px)', width: '20vw' }}
            initial={{ opacity: 0, y: 20 }}
            animate={ph >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: i * 0.14, type: 'spring', stiffness: 280, damping: 22 }}
          >
            <span style={{ fontSize: '1.8vw' }}>{p.icon}</span>
            <span style={{ fontSize: '0.92vw', color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.55 }}>
              {p.text}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Bottom note */}
      <motion.p className="mt-[3vh] text-center"
        style={{ fontSize: '0.88vw', color: 'rgba(235,255,56,0.6)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.08em' }}
        initial={{ opacity: 0 }}
        animate={ph >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        NO ACCOUNT REQUIRED · DATA STAYS IN YOUR BROWSER · COMPLETELY FREE
      </motion.p>
    </motion.div>
  );
}
