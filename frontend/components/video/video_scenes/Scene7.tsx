import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SceneProps { lightMode: boolean }

const rooms = [
  { label: 'Software Engineering', field: 'tech',             icon: '⌨', color: '#3b82f6', slots: 3, score: 91 },
  { label: 'Product Management',   field: 'management',       icon: '◈', color: '#8b5cf6', slots: 2, score: 87 },
  { label: 'Civil Engineering',    field: 'civil_engineering', icon: '⬡', color: '#10b981', slots: 1, score: 78 },
];

const activeSlot = {
  label: 'Senior PM — Series B Startup',
  template: 'Executive Navy',
  atsScore: 91,
  mode: 'Aggressive',
  lastGenerated: '2 hours ago',
};

export function Scene7({ lightMode }: SceneProps) {
  const [phase, setPhase] = useState(0);
  const [activeRoom, setActiveRoom] = useState(-1);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setActiveRoom(0), 800),
      setTimeout(() => setActiveRoom(1), 1600),
      setTimeout(() => setActiveRoom(2), 2400),
      setTimeout(() => setPhase(2), 3200),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const text    = lightMode ? '#1B2B4B' : '#F8F7F4';
  const subtext = lightMode ? 'rgba(27,43,75,0.55)' : 'rgba(248,247,244,0.55)';
  const cardBg  = lightMode ? 'rgba(27,43,75,0.04)' : 'rgba(255,255,255,0.04)';
  const cardBorder = lightMode ? 'rgba(27,43,75,0.12)' : 'rgba(255,255,255,0.08)';
  const activeBg   = lightMode ? 'rgba(201,168,76,0.08)' : 'rgba(201,168,76,0.1)';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[5vw]"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.p
        className="text-[1.1vw] font-semibold tracking-[0.3em] uppercase mb-[1.5vh]"
        style={{ color: '#C9A84C', fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0, y: -10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
      >
        Career Rooms
      </motion.p>

      <motion.h2
        className="text-[3.8vw] font-bold text-center mb-[4vh] leading-tight"
        style={{ color: text, fontFamily: 'Playfair Display, serif' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        One profile. Multiple careers.
        <br />
        <span style={{ color: '#C9A84C' }}>Each perfectly tailored.</span>
      </motion.h2>

      <div className="w-full max-w-[82vw] grid grid-cols-3 gap-[2vw] mb-[3vh]">
        {rooms.map((room, i) => (
          <motion.div
            key={room.label}
            className="rounded-xl p-[2vh_1.5vw] cursor-pointer"
            style={{
              background: activeRoom >= i ? activeBg : cardBg,
              border: `1px solid ${activeRoom >= i ? 'rgba(201,168,76,0.3)' : cardBorder}`,
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
          >
            <div className="flex items-center justify-between mb-[1vh]">
              <span className="text-[1.8vw]">{room.icon}</span>
              <motion.span
                className="text-[0.7vw] font-bold px-[0.6vw] py-[0.2vh] rounded-full"
                style={{ background: `${room.color}20`, color: room.color, fontFamily: 'DM Sans, sans-serif' }}
                animate={activeRoom >= i ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                ATS {room.score}
              </motion.span>
            </div>
            <p className="text-[0.9vw] font-bold mb-[0.4vh]" style={{ color: text, fontFamily: 'DM Sans, sans-serif' }}>
              {room.label}
            </p>
            <p className="text-[0.7vw]" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>
              {room.slots} CV slot{room.slots > 1 ? 's' : ''}
            </p>

            {activeRoom >= i && (
              <motion.div
                className="mt-[1vh] h-[2px] rounded-full"
                style={{ background: `linear-gradient(90deg, ${room.color}, transparent)` }}
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* Active slot detail */}
      <motion.div
        className="w-full max-w-[82vw] rounded-xl p-[1.8vh_2vw]"
        style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)' }}
        initial={{ opacity: 0, y: 15 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[1.5vw]">
            <div className="w-[0.4vw] h-[4vh] rounded-full" style={{ background: '#C9A84C' }} />
            <div>
              <p className="text-[0.75vw] font-semibold" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>Active CV Slot</p>
              <p className="text-[1vw] font-bold" style={{ color: text, fontFamily: 'DM Sans, sans-serif' }}>{activeSlot.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-[2vw]">
            {[
              { label: 'Template', value: activeSlot.template },
              { label: 'ATS Score', value: `${activeSlot.atsScore}%` },
              { label: 'Mode', value: activeSlot.mode },
              { label: 'Generated', value: activeSlot.lastGenerated },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-[0.65vw]" style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}>{label}</p>
                <p className="text-[0.85vw] font-semibold" style={{ color: label === 'ATS Score' ? '#C9A84C' : text, fontFamily: 'DM Sans, sans-serif' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.p
        className="mt-[2vh] text-[0.85vw] text-center"
        style={{ color: subtext, fontFamily: 'DM Sans, sans-serif' }}
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        Switch between career tracks instantly — each room remembers your JD, template, and generation settings.
      </motion.p>
    </motion.div>
  );
}
