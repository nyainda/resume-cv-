import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const tools = [
  { num: '01', name: 'CV Generator',       desc: 'ATS-optimised in 5 min',       color: '#C9A84C' },
  { num: '02', name: 'LinkedIn Optimizer', desc: 'Headline, About & top skills',  color: '#3b82f6' },
  { num: '03', name: 'Interview Prep',     desc: '10 tailored Q&As + thank-you',  color: '#8b5cf6' },
  { num: '04', name: 'Portal Scanner',     desc: '150+ company portals',          color: '#10b981' },
  { num: '05', name: 'CV Toolkit',         desc: 'Deep ATS audit & rewrites',     color: '#f59e0b' },
  { num: '06', name: 'Scholarship Essays', desc: 'Personal statements & funding', color: '#ec4899' },
  { num: '07', name: 'Negotiation Coach',  desc: 'Market-rate counter-offer',     color: '#ef4444' },
  { num: '08', name: 'Email Apply',        desc: 'One-click application email',   color: '#06b6d4' },
  { num: '09', name: 'App Tracker',        desc: 'Kanban — interviews & deadlines', color: '#84cc16' },
  { num: '10', name: 'Analytics',          desc: 'Search velocity & story gaps',  color: '#f97316' },
  { num: '11', name: 'Profile Manager',    desc: 'Multiple career identities',    color: '#a78bfa' },
  { num: '12', name: 'Cloud Backup',       desc: 'Google Drive encrypted sync',   color: '#34d399' },
];

export function Scene4({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  const [visibleTools, setVisibleTools] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // stagger tools in after phase 3
  useEffect(() => {
    if (phase < 3) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setVisibleTools(i);
      if (i >= tools.length) clearInterval(iv);
    }, 360);
    return () => clearInterval(iv);
  }, [phase]);

  const [phase2, setPhase2] = useState(false);
  useEffect(() => {
    if (visibleTools >= tools.length) {
      const t = setTimeout(() => setPhase2(true), 400);
      return () => clearTimeout(t);
    }
  }, [visibleTools]);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.5)'  : 'rgba(248,247,244,0.45)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.1)' : 'rgba(255,255,255,0.07)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[4vw] py-[2vh]"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Eyebrow + headline row */}
      <motion.div
        className="flex items-baseline gap-[2vw] mb-[1vh]"
        initial={{ opacity: 0, y: -16 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -16 }}
        transition={{ duration: 0.55 }}
      >
        {/* Big number */}
        <motion.span
          className="font-black leading-none"
          style={{ fontSize: '9vw', color: 'rgba(201,168,76,0.18)', fontFamily: 'Playfair Display, serif', lineHeight: 1 }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.65, type: 'spring', stiffness: 200, damping: 16 }}
        >
          12
        </motion.span>

        <div>
          <motion.p
            className="text-[0.95vw] font-semibold tracking-[0.25em] uppercase"
            style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            AI career tools
          </motion.p>
          <motion.h2
            className="font-bold leading-tight"
            style={{ fontSize: '3.2vw', color: text, fontFamily: 'Playfair Display, serif' }}
            initial={{ opacity: 0, x: -10 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            One profile.<br />
            <span style={{ color: '#C9A84C' }}>Every tool.</span>
          </motion.h2>
        </div>
      </motion.div>

      {/* 4x3 tools grid */}
      <div className="grid w-full max-w-[88vw]" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.9vw' }}>
        {tools.map((tool, i) => (
          <motion.div
            key={tool.num}
            className="rounded-lg px-[1.1vw] py-[1vh] flex items-center gap-[0.7vw]"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={visibleTools > i ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.94 }}
            transition={{ duration: 0.35, type: 'spring', stiffness: 320, damping: 22 }}
          >
            {/* color accent bar */}
            <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: tool.color, minHeight: '3.2vh' }} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-[0.35vw]">
                <span className="text-[0.6vw] font-bold" style={{ color: tool.color, fontFamily: 'DM Sans, sans-serif', opacity: 0.7 }}>{tool.num}</span>
                <span className="text-[0.78vw] font-bold truncate" style={{ color: text, fontFamily: 'DM Sans, sans-serif' }}>{tool.name}</span>
              </div>
              <span className="text-[0.62vw] leading-tight" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{tool.desc}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom tagline */}
      <motion.div
        className="mt-[2.5vh] flex items-center gap-[1.2vw]"
        initial={{ opacity: 0, y: 10 }}
        animate={phase2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="h-[1px] w-[6vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
        <p className="text-[1.1vw] font-semibold text-center" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
          Fill your profile <span style={{ color: '#C9A84C' }}>once</span> — every tool uses it.{' '}
          <span style={{ color: text }}>No repeating yourself. Ever.</span>
        </p>
        <div className="h-[1px] w-[6vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
      </motion.div>
    </motion.div>
  );
}
