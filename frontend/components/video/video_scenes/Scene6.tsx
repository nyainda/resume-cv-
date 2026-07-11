import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 6 — CV Doctor (10s)
// Shows the AI scanning + rewriting weak bullets
export function Scene6(_props: object) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1100),
      setTimeout(() => setPh(3), 2200),
      setTimeout(() => setPh(4), 3800),
      setTimeout(() => setPh(5), 5400),
      setTimeout(() => setPh(6), 7200),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const annotations = [
    { type: 'passive',  label: 'Passive voice',   color: '#fb923c', text: 'was responsible for' },
    { type: 'buzzword', label: 'AI buzzword',      color: '#f43f5e', text: 'leveraged synergies' },
    { type: 'metric',   label: 'No metric',        color: '#facc15', text: 'improved performance' },
  ];

  const weakBullet  = 'Was responsible for leveraging synergies to improve performance across the team';
  const strongBullet = 'Reduced checkout drop-off by 34% by redesigning the payment flow for 2.4M monthly users';

  const checks = [
    { label: 'Smart Review',    detail: 'Adds, removes & prioritises bullets',  icon: '🧠' },
    { label: 'Bullet Rewriter', detail: 'Click any weak bullet for 3 rewrites', icon: '✍️' },
    { label: 'Seniority Check', detail: 'Matches tone to your career level',    icon: '📈' },
    { label: 'What Changed',    detail: 'Side-by-side before/after diff view',  icon: '🔄' },
  ];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center px-[6vw]"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left headline */}
      <motion.div className="flex flex-col gap-[1.5vh] mr-[4vw]" style={{ width: '28vw', flexShrink: 0 }}
        initial={{ opacity: 0, x: -20 }} animate={ph >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7 }}>
        <div className="flex items-center gap-[0.8vw]">
          <div style={{ width: '0.25vw', height: '3vh', background: '#EBFF38', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.85vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.12em' }}>CV DOCTOR</span>
        </div>
        <h2 style={{ fontSize: '3.2vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          Your AI<br /><span style={{ color: '#EBFF38' }}>career</span><br />consultant.
        </h2>
        <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxWidth: '24vw' }}>
          CV Doctor scans every bullet for weak language, missing metrics, and passive voice — then rewrites them instantly.
        </p>

        {/* Feature checks */}
        <div className="flex flex-col gap-[0.9vh] mt-[1vh]">
          {checks.map((c, i) => (
            <motion.div key={i} className="flex items-center gap-[0.8vw]"
              initial={{ opacity: 0, x: -10 }}
              animate={ph >= 6 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <span style={{ fontSize: '1vw' }}>{c.icon}</span>
              <div>
                <span style={{ fontSize: '0.85vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>{c.label} </span>
                <span style={{ fontSize: '0.8vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>— {c.detail}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Right — doctor panel mockup */}
      <div className="flex flex-col gap-[1.5vh]" style={{ width: '44vw' }}>

        {/* Annotation legend */}
        <motion.div className="flex gap-[0.8vw]"
          initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
          {annotations.map((a, i) => (
            <motion.div key={i} className="flex items-center gap-[0.4vw] px-[0.8vw] py-[0.4vh] rounded-full"
              style={{ background: `${a.color}18`, border: `1px solid ${a.color}44` }}
              initial={{ opacity: 0, scale: 0.8 }} animate={ph >= 2 ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 280, damping: 20 }}>
              <div className="rounded-full" style={{ width: '0.5vw', height: '0.5vw', background: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.7vw', color: a.color, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{a.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* BEFORE bullet */}
        <motion.div className="rounded-2xl px-[1.5vw] py-[1.5vh]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,100,100,0.2)', backdropFilter: 'blur(12px)' }}
          initial={{ opacity: 0, y: 16 }} animate={ph >= 2 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-[0.6vw] mb-[0.8vh]">
            <span style={{ fontSize: '0.75vw', color: '#f43f5e', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.1em' }}>BEFORE</span>
            <div style={{ height: '1px', flex: 1, background: 'rgba(244,63,94,0.2)' }} />
          </div>
          <p style={{ fontSize: '0.95vw', color: 'rgba(255,255,255,0.65)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}>
            {'• '}{weakBullet.split(' ').map((word, wi) => {
              const isPassive  = ['Was', 'responsible', 'for'].includes(word);
              const isBuzzword = ['leveraging', 'synergies'].includes(word);
              const isMetric   = ['improve', 'performance'].includes(word);
              const color = isPassive ? '#fb923c' : isBuzzword ? '#f43f5e' : isMetric ? '#facc15' : undefined;
              return (
                <motion.span key={wi}
                  style={{ color: ph >= 3 && color ? color : undefined, fontWeight: ph >= 3 && color ? 700 : undefined }}
                  animate={ph >= 3 && color ? { textDecoration: 'underline' } : {}}
                >
                  {word}{' '}
                </motion.span>
              );
            })}
          </p>
        </motion.div>

        {/* Doctor scanning animation */}
        <AnimatePresence>
          {ph >= 3 && ph < 5 && (
            <motion.div className="flex items-center gap-[1vw] px-[1.5vw] py-[1vh] rounded-2xl"
              style={{ background: 'rgba(235,255,56,0.06)', border: '1px solid rgba(235,255,56,0.2)', backdropFilter: 'blur(10px)' }}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}>
              <motion.div className="rounded-full"
                style={{ width: '1.4vw', height: '1.4vw', border: '2px solid #EBFF38', borderTopColor: 'transparent', flexShrink: 0 }}
                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              <div>
                <p style={{ fontSize: '0.85vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
                  CV Doctor is rewriting…
                </p>
                <p style={{ fontSize: '0.75vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif' }}>
                  Found 3 issues · generating 3 rewrite options
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AFTER bullet */}
        <AnimatePresence>
          {ph >= 5 && (
            <motion.div className="rounded-2xl px-[1.5vw] py-[1.5vh]"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', backdropFilter: 'blur(12px)' }}
              initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 240, damping: 18 }}>
              <div className="flex items-center gap-[0.6vw] mb-[0.8vh]">
                <span style={{ fontSize: '0.75vw', color: '#22c55e', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.1em' }}>AFTER · OPTION 1</span>
                <div style={{ height: '1px', flex: 1, background: 'rgba(34,197,94,0.2)' }} />
                <div className="px-[0.6vw] py-[0.25vh] rounded-full" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <span style={{ fontSize: '0.65vw', color: '#86efac', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>✓ APPLY</span>
                </div>
              </div>
              <p style={{ fontSize: '0.95vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}>
                • {strongBullet}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
