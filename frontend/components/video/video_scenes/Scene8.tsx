import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const coverLetterLines = [
  'Dear Hiring Manager,',
  '',
  'When I cut cart abandonment by 34% at Acme — not through guesswork but through a 22-variant A/B programme — I learned that great product work is about closing the gap between data and decision.',
  '',
  'Your role as Senior Product Manager at Stripe resonates because you\'re asking for exactly that: someone who can own a £8M+ portfolio, align OKRs across engineering and commercial teams, and ship with measurable impact.',
  '',
  'In three years at Checkout EU I did precisely this across 18 features generating £12.6M ARR. I\'d welcome the chance to show you how that translates to your roadmap.',
];

const stats = [
  { label: 'Tone match',      value: '96%', color: '#22c55e' },
  { label: 'JD alignment',   value: '94%', color: '#C9A84C' },
  { label: 'ATS keywords',   value: '12/13', color: '#3b82f6' },
  { label: 'AI tells',       value: '0',   color: '#22c55e' },
];

export function Scene8({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= coverLetterLines.length) clearInterval(iv);
    }, 420);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (visibleLines >= coverLetterLines.length) {
      const t = setTimeout(() => setPhase(3), 600);
      return () => clearTimeout(t);
    }
  }, [visibleLines]);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.55)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.12)' : 'rgba(255,255,255,0.08)';
  const pageBg  = lightMode ? 'rgba(27,43,75,0.03)' : 'rgba(255,255,255,0.03)';
  const pageBorder = lightMode ? 'rgba(27,43,75,0.1)' : 'rgba(255,255,255,0.07)';

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-[5vw] gap-[3vw]"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left panel — cover letter preview */}
      <motion.div
        className="flex-1 rounded-xl overflow-hidden"
        style={{ background: pageBg, border: `1px solid ${pageBorder}`, maxHeight: '75vh' }}
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        {/* "Paper" header */}
        <div className="px-[1.8vw] pt-[1.8vh] pb-[1vh] flex items-center justify-between" style={{ borderBottom: `1px solid ${pageBorder}` }}>
          <div className="flex items-center gap-[0.8vw]">
            <div className="w-[1.8vw] h-[1.8vw] rounded flex items-center justify-center font-bold text-[0.95vw]" style={{ background: '#C9A84C', color: '#1B2B4B', fontFamily: 'Playfair Display, serif' }}>CV</div>
            <span className="text-[0.95vw] font-semibold" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>Cover Letter — Senior PM @ Stripe</span>
          </div>
          <motion.div
            className="flex items-center gap-[0.4vw] text-[0.88vw] px-[0.6vw] py-[0.25vh] rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac', fontFamily: 'DM Sans, sans-serif' }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            <motion.span className="w-[0.35vw] h-[0.35vw] rounded-full bg-green-400 inline-block" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
            Generating…
          </motion.div>
        </div>

        {/* Letter body */}
        <div className="px-[1.8vw] py-[1.5vh] space-y-[0.6vh] overflow-hidden" style={{ maxHeight: '62vh' }}>
          {coverLetterLines.map((line, i) => (
            <motion.p
              key={i}
              className="text-[1vw] leading-relaxed"
              style={{
                color: line === '' ? 'transparent' : (i === 0 ? '#C9A84C' : text),
                fontFamily: i === 0 ? 'Playfair Display, serif' : 'DM Sans, sans-serif',
                fontWeight: i === 0 ? 600 : 400,
                minHeight: line === '' ? '0.8vh' : undefined,
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={visibleLines > i ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.3 }}
            >
              {line || '\u00A0'}
            </motion.p>
          ))}
        </div>
      </motion.div>

      {/* Right panel — stats + label */}
      <div className="w-[22vw] flex flex-col gap-[2vh]">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1vh]" style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}>
            Cover Letters
          </p>
          <h2 className="text-[2.8vw] font-bold leading-tight mb-[1.5vh]" style={{ color: text, fontFamily: 'Playfair Display, serif' }}>
            One click.<br />
            <span style={{ color: '#C9A84C' }}>Tailored to the JD.</span>
          </h2>
          <p className="text-[1vw] leading-relaxed" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
            ProCV reads your CV, cross-references the job description, and writes a letter that sounds like you — not like ChatGPT.
          </p>
        </motion.div>

        {/* Quality stats */}
        <motion.div
          className="rounded-xl p-[1.8vh_1.5vw] space-y-[1.2vh]"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          initial={{ opacity: 0, y: 15 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[0.95vw] font-semibold tracking-widest uppercase" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>Quality Check</p>
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              className="flex items-center justify-between"
              initial={{ opacity: 0, x: 10 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
            >
              <span className="text-[0.95vw]" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{s.label}</span>
              <span className="text-[1vw] font-bold" style={{ color: s.color, fontFamily: 'DM Sans, sans-serif' }}>{s.value}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="flex flex-wrap gap-[0.5vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          {['Groq Llama 3.3 70B', 'JD-aware', 'Voice-matched', 'Humanized'].map((tag, i) => (
            <span
              key={tag}
              className="text-[0.85vw] px-[0.5vw] py-[0.2vh] rounded-full"
              style={{ border: '1px solid rgba(201,168,76,0.25)', color: 'rgba(201,168,76,0.7)', fontFamily: 'DM Sans, sans-serif' }}
            >
              {tag}
            </span>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
