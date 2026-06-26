import { motion, useMotionValue, animate } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

interface SceneProps { lightMode: boolean }

const templates = [
  { name: 'Executive', color: '#1B2B4B', accent: '#C9A84C' },
  { name: 'Modern',    color: '#2d3748', accent: '#68d391' },
  { name: 'Creative',  color: '#553c9a', accent: '#e9d8fd' },
  { name: 'Academic',  color: '#1a365d', accent: '#90cdf4' },
  { name: 'Tech',      color: '#1a202c', accent: '#f6e05e' },
];

const templatePositions = [
  { x: '-26vw', y: '-8vh',  rotate: -8, scale: 0.78 },
  { x: '-14vw', y: '10vh',  rotate: -4, scale: 0.84 },
  { x: '0vw',   y: '16vh',  rotate: 0,  scale: 0.88 },
  { x: '14vw',  y: '10vh',  rotate: 4,  scale: 0.84 },
  { x: '26vw',  y: '-8vh',  rotate: 8,  scale: 0.78 },
];

function ScoreGauge({ target, active }: { target: number; active: boolean }) {
  const count = useMotionValue(31);
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const controls = animate(count, target, {
      duration: 3.5,
      ease: 'easeOut',
      onUpdate: (v) => { if (displayRef.current) displayRef.current.textContent = Math.round(v).toString(); },
    });
    return controls.stop;
  }, [active]);

  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const startAngle = -200;
  const endAngle = 20;
  const totalArc = endAngle - startAngle;
  const startFrac = 31 / 100;
  const endFrac = target / 100;

  return (
    <div className="relative flex items-center justify-center" style={{ width: '20vw', height: '20vw' }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(totalArc / 360) * circ} ${circ}`}
          style={{ transformOrigin: '50% 50%', transform: `rotate(${startAngle + 90}deg)` }}
        />
        <motion.circle
          cx="50" cy="50" r={radius} fill="none" stroke="#C9A84C" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(totalArc / 360) * circ} ${circ}`}
          style={{ transformOrigin: '50% 50%', transform: `rotate(${startAngle + 90}deg)` }}
          initial={{ strokeDashoffset: (totalArc / 360) * circ * (1 - startFrac) }}
          animate={active ? { strokeDashoffset: (totalArc / 360) * circ * (1 - endFrac) } : {}}
          transition={{ duration: 3.5, ease: 'easeOut' }}
          filter="url(#glow4)"
        />
        <defs>
          <filter id="glow4">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      <div className="flex flex-col items-center">
        <span ref={displayRef} className="font-black" style={{ fontSize: '5.5vw', color: '#F8F7F4', fontFamily: 'Playfair Display, serif', lineHeight: 1 }}>31</span>
        <span className="text-[0.8vw] font-semibold mt-[0.5vh] tracking-widest uppercase" style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}>ATS Score</span>
      </div>
    </div>
  );
}

export function Scene4({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text = lightMode ? '#1B2B4B' : '#F8F7F4';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6 }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', position: 'relative', zIndex: 10 }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        Real results
      </motion.p>

      <div className="relative flex items-center justify-center" style={{ height: '50vh' }}>
        {templates.map((tmpl, i) => (
          <motion.div
            key={i}
            className="absolute rounded-lg overflow-hidden"
            style={{ width: '8vw', height: '11vw', left: '50%', top: '38%', marginLeft: '-4vw', marginTop: '-5.5vw', background: tmpl.color, border: `1px solid ${tmpl.accent}30` }}
            initial={{ opacity: 0, scale: 0.5, rotate: 0, x: 0, y: 0 }}
            animate={phase >= 3 ? { opacity: 1, scale: templatePositions[i].scale, rotate: templatePositions[i].rotate, x: templatePositions[i].x, y: templatePositions[i].y } : { opacity: 0 }}
            transition={{ duration: 0.8, delay: i * 0.1, type: 'spring', stiffness: 180, damping: 18 }}
          >
            <div className="p-[0.8vw]">
              <div className="h-[0.3vw] rounded-full mb-[0.6vw]" style={{ background: tmpl.accent, width: '60%' }} />
              {[1, 0.7, 0.85, 0.6, 0.9, 0.5].map((w, j) => (
                <div key={j} className="h-[0.18vw] rounded-full mb-[0.4vw]" style={{ background: 'rgba(255,255,255,0.15)', width: `${w * 100}%` }} />
              ))}
              <div className="mt-[1vw] h-[0.25vw] rounded-full mb-[0.4vw]" style={{ background: tmpl.accent, width: '45%', opacity: 0.6 }} />
              {[0.8, 0.6, 0.75].map((w, j) => (
                <div key={j} className="h-[0.18vw] rounded-full mb-[0.4vw]" style={{ background: 'rgba(255,255,255,0.12)', width: `${w * 100}%` }} />
              ))}
            </div>
          </motion.div>
        ))}
        <div style={{ position: 'relative', zIndex: 5 }}>
          <ScoreGauge target={94} active={phase >= 2} />
        </div>
      </div>

      <motion.p
        className="text-[1.6vw] font-semibold text-center -mt-[2vh]"
        style={{ color: text, fontFamily: 'Playfair Display, serif', position: 'relative', zIndex: 10 }}
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        35 templates.{' '}
        <span style={{ color: '#C9A84C' }}>Real ATS scores.</span>
      </motion.p>
    </motion.div>
  );
}
