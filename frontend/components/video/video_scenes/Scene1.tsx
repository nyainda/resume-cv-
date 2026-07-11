import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 1 — The Problem (8s)
// Cinematic hook: "75% of CVs rejected before a human reads them"
export function Scene1(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 150),
      setTimeout(() => setPh(2), 1100),
      setTimeout(() => setPh(3), 2000),
      setTimeout(() => setPh(4), 2800),
      setTimeout(() => setPh(5), 5800),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const problems = [
    { icon: '🤖', title: 'ATS robots decide first', body: 'Your CV is parsed by an algorithm before any human sees it' },
    { icon: '🔑', title: 'Missing keywords = instant reject', body: 'One missing term and you\'re filtered out with no review' },
    { icon: '📋', title: 'Generic CVs look identical', body: 'Yours looks the same as 10,000 others in the pile' },
  ];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-[7vw]"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(8px)' }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Big stat */}
      <motion.div className="flex flex-col items-center mb-[4vh]"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={ph >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.8, type: 'spring', stiffness: 180, damping: 14 }}
      >
        <motion.span
          className="font-black leading-none"
          style={{ fontSize: '14vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', lineHeight: 0.9,
            textShadow: ph >= 1 ? '0 0 80px rgba(235,255,56,0.4), 0 0 160px rgba(235,255,56,0.15)' : 'none' }}
        >
          75%
        </motion.span>
        <motion.p className="text-center font-semibold mt-[1vh]"
          style={{ fontSize: '1.65vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', maxWidth: '50vw' }}
          initial={{ opacity: 0, y: 12 }}
          animate={ph >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.55 }}
        >
          of CVs are rejected before a human ever reads them.
        </motion.p>
        <motion.p className="text-center mt-[0.6vh]"
          style={{ fontSize: '1.05vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif' }}
          initial={{ opacity: 0 }}
          animate={ph >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          Not because you're underqualified — because your CV uses the wrong words.
        </motion.p>
      </motion.div>

      {/* Divider */}
      <motion.div className="h-[1px] mb-[3.5vh]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(235,255,56,0.5), transparent)' }}
        initial={{ width: 0 }}
        animate={ph >= 3 ? { width: '52vw' } : { width: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Problem cards */}
      <div className="flex gap-[1.8vw] mb-[4vh]">
        {problems.map((p, i) => (
          <motion.div key={i}
            className="flex flex-col gap-[0.6vh] px-[1.5vw] py-[1.4vh] rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              width: '22vw',
            }}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={ph >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.92 }}
            transition={{ duration: 0.55, delay: i * 0.15, type: 'spring', stiffness: 260, damping: 20 }}
          >
            <span style={{ fontSize: '1.5vw' }}>{p.icon}</span>
            <span style={{ fontSize: '1vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
              {p.title}
            </span>
            <span style={{ fontSize: '0.88vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
              {p.body}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Verdict */}
      <motion.div className="flex items-center gap-[1.5vw]"
        initial={{ opacity: 0, y: 12 }}
        animate={ph >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="h-[2px] w-[6vw]" style={{ background: 'rgba(235,255,56,0.4)' }} />
        <p className="font-bold" style={{ fontSize: '1.6vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}>
          The system is automated. ProCV beats it.
        </p>
        <div className="h-[2px] w-[6vw]" style={{ background: 'rgba(235,255,56,0.4)' }} />
      </motion.div>
    </motion.div>
  );
}
