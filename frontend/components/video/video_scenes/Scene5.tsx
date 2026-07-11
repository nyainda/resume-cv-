import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const tagline = 'Your Personal Career Consultant';
const subtitle = 'A CV builder that checks its own work — 7 passes, zero generic output, WYSIWYG PDF.';

const features = ['Groq AI', 'Cloudflare Workers', '35 Templates', 'WYSIWYG PDF', 'ATS Gap Targeting', 'Cover Letters'];

export function Scene5({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 3200),
      setTimeout(() => setPhase(5), 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.5)' : 'rgba(248,247,244,0.5)';
  const lineColor = lightMode ? 'rgba(27,43,75,0.15)' : 'rgba(255,255,255,0.12)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Side accent lines */}
      <motion.div
        className="absolute left-[8vw] top-1/2 -translate-y-1/2 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, #C9A84C, transparent)` }}
        initial={{ height: 0 }}
        animate={phase >= 1 ? { height: '40vh' } : { height: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute right-[8vw] top-1/2 -translate-y-1/2 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, #C9A84C, transparent)` }}
        initial={{ height: 0 }}
        animate={phase >= 1 ? { height: '40vh' } : { height: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Logo */}
      <motion.div
        className="flex items-center gap-[1.5vw] mb-[2vh]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 260, damping: 20 }}
      >
        <div
          className="w-[4.5vw] h-[4.5vw] rounded-xl flex items-center justify-center font-black"
          style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '2vw', fontFamily: 'Playfair Display, serif' }}
        >
          CV
        </div>
        <span className="font-bold" style={{ fontSize: '3.5vw', color: text, fontFamily: 'Playfair Display, serif', letterSpacing: '-0.02em' }}>
          ProCV
        </span>
      </motion.div>

      {/* Gold line */}
      <motion.div
        className="h-[2px] mb-[3vh]"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        initial={{ width: 0 }}
        animate={phase >= 2 ? { width: '30vw' } : { width: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Tagline letter-by-letter */}
      <div className="text-center mb-[2.5vh] overflow-hidden" style={{ maxWidth: '60vw' }}>
        <motion.p
          className="font-semibold"
          style={{ fontSize: '2.2vw', color: '#C9A84C', fontFamily: 'Playfair Display, serif', lineHeight: 1.3 }}
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {phase >= 3 && tagline.split('').map((char, i) => (
            <motion.span
              key={i}
              style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.025, ease: [0.16, 1, 0.3, 1] }}
            >
              {char}
            </motion.span>
          ))}
        </motion.p>
      </div>

      <motion.p
        className="text-center mb-[3vh]"
        style={{ fontSize: '1.05vw', color: subtext, fontFamily: 'DM Sans, sans-serif', maxWidth: '48vw', lineHeight: 1.6 }}
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6 }}
      >
        {subtitle}
      </motion.p>

      {/* Feature tags */}
      <motion.div
        className="flex flex-wrap justify-center gap-[1vw]"
        initial={{ opacity: 0 }}
        animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {features.map((tag, i) => (
          <motion.span
            key={tag}
            className="px-[1vw] py-[0.5vh] rounded-full text-[0.7vw] font-semibold"
            style={{ border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(201,168,76,0.8)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 5 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 20 }}
          >
            {tag}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
}
