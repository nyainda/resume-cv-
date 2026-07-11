import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 4 — Build Your CV: the pipeline (10s)
export function Scene4(_props: object) {
  const [ph, setPh] = useState(0);
  const [activeStage, setActiveStage] = useState(-1);
  const [atsScore, setAtsScore] = useState(0);

  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 150),
      setTimeout(() => { setPh(2); setActiveStage(0); }, 700),
      setTimeout(() => setActiveStage(1), 2000),
      setTimeout(() => setActiveStage(2), 3500),
      setTimeout(() => setActiveStage(3), 5200),
      setTimeout(() => setActiveStage(4), 6800),
      setTimeout(() => setPh(3), 7200),
    ];
    // Animate ATS score
    let frame = 0;
    const scoreTimer = setInterval(() => {
      if (frame > 87) { clearInterval(scoreTimer); return; }
      setAtsScore(frame);
      frame += 3;
    }, 30);
    tt.push(scoreTimer as unknown as ReturnType<typeof setTimeout>);
    return () => { tt.forEach(t => typeof t === 'number' ? clearTimeout(t) : clearInterval(t as any)); };
  }, []);

  const stages = [
    { icon: '📋', label: 'Parse Job Description', detail: 'Extracting 47 keywords & requirements', color: '#60a5fa' },
    { icon: '🎯', label: 'Match Your Profile', detail: 'Aligning your experience with the role', color: '#a78bfa' },
    { icon: '✍️', label: 'AI Writes Your CV', detail: '7-pass writing pipeline — no generic phrases', color: '#EBFF38' },
    { icon: '🔍', label: 'Quality Validation', detail: 'Checking facts, tone, and ATS compatibility', color: '#f97316' },
    { icon: '📄', label: 'PDF Generated', detail: 'Ready to download — ATS score: 87/100', color: '#22c55e' },
  ];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center px-[6vw]"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -60 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left headline */}
      <motion.div className="flex flex-col gap-[1.5vh] mr-[4vw]" style={{ width: '26vw', flexShrink: 0 }}
        initial={{ opacity: 0, x: -20 }} animate={ph >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7 }}>
        <div className="flex items-center gap-[0.8vw]">
          <div style={{ width: '0.25vw', height: '3vh', background: '#EBFF38', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.85vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.12em' }}>STEP 2</span>
        </div>
        <h2 style={{ fontSize: '3.2vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          Click<br /><span style={{ color: '#EBFF38' }}>Build CV.</span><br />Watch it work.
        </h2>
        <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}>
          Paste the job description. ProCV runs a 5-stage AI pipeline and delivers a tailored, validated CV.
        </p>

        {/* ATS score result */}
        <AnimatePresence>
          {ph >= 3 && (
            <motion.div className="mt-[1.5vh] rounded-2xl px-[1.5vw] py-[1.5vh] flex flex-col gap-[0.5vh]"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 250, damping: 18 }}
            >
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '0.82vw', color: '#86efac', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>ATS SCORE</span>
                <span style={{ fontSize: '2.2vw', color: '#22c55e', fontFamily: 'DM Sans, sans-serif', fontWeight: 900 }}>{Math.min(atsScore, 87)}</span>
              </div>
              <div style={{ height: '0.4vh', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #22c55e, #86efac)', borderRadius: '2px' }}
                  animate={{ width: `${Math.min(atsScore, 87)}%` }} transition={{ duration: 0.1 }} />
              </div>
              <span style={{ fontSize: '0.75vw', color: 'rgba(134,239,172,0.7)', fontFamily: 'DM Sans, sans-serif' }}>
                Excellent — ready to submit
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Right — pipeline */}
      <div className="flex flex-col gap-[1vh]" style={{ width: '42vw' }}>
        {stages.map((s, i) => {
          const done    = i < activeStage;
          const active  = i === activeStage;
          const pending = i > activeStage;
          return (
            <motion.div key={i}
              className="flex items-center gap-[1.2vw] px-[1.5vw] py-[1.2vh] rounded-2xl"
              style={{
                background: active ? 'rgba(255,255,255,0.07)' : done ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.025)',
                border: active ? `1px solid ${s.color}55` : done ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.5s ease',
              }}
              initial={{ opacity: 0, x: 20 }}
              animate={ph >= 2 ? { opacity: pending ? 0.35 : 1, x: 0 } : { opacity: 0, x: 20 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {/* Icon / check */}
              <div className="flex items-center justify-center rounded-xl"
                style={{ width: '2.8vw', height: '2.8vw', flexShrink: 0,
                  background: done ? 'rgba(34,197,94,0.15)' : active ? `${s.color}18` : 'rgba(255,255,255,0.04)',
                  border: done ? '1px solid rgba(34,197,94,0.3)' : active ? `1px solid ${s.color}44` : '1px solid rgba(255,255,255,0.06)',
                }}>
                {done
                  ? <span style={{ fontSize: '1.2vw', color: '#22c55e' }}>✓</span>
                  : active
                    ? <motion.span style={{ fontSize: '1.3vw' }} animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>{s.icon}</motion.span>
                    : <span style={{ fontSize: '1.2vw', opacity: 0.3 }}>{s.icon}</span>
                }
              </div>

              {/* Text */}
              <div className="flex flex-col gap-[0.2vh] flex-1">
                <span style={{ fontSize: '0.9vw', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: done ? '#86efac' : active ? s.color : 'rgba(255,255,255,0.4)' }}>
                  {s.label}
                </span>
                <span style={{ fontSize: '0.78vw', fontFamily: 'DM Sans, sans-serif', color: done ? 'rgba(134,239,172,0.6)' : active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)' }}>
                  {s.detail}
                </span>
              </div>

              {/* Progress spinner */}
              {active && (
                <motion.div className="rounded-full"
                  style={{ width: '1.2vw', height: '1.2vw', border: `2px solid ${s.color}`, borderTopColor: 'transparent', flexShrink: 0 }}
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              )}
              {done && (
                <div className="rounded-full flex items-center justify-center"
                  style={{ width: '1.2vw', height: '1.2vw', background: 'rgba(34,197,94,0.2)', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.6vw', color: '#22c55e' }}>✓</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
