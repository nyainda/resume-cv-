import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = {
  problem:   8000,
  pipeline:  12000,
  flow:      14000,
  score:     12000,
  close:     14000,
};

const bgPositions = [
  { x: '10%',  y: '15%', scale: 1.4 },
  { x: '70%',  y: '5%',  scale: 1.0 },
  { x: '55%',  y: '60%', scale: 1.6 },
  { x: '20%',  y: '70%', scale: 1.1 },
  { x: '45%',  y: '30%', scale: 1.3 },
];

const accentLineConfig = [
  { left: '12%', width: '28%', top: '88%' },
  { left: '60%', width: '32%', top: '8%'  },
  { left: '5%',  width: '20%', top: '50%' },
  { left: '72%', width: '24%', top: '75%' },
  { left: '30%', width: '40%', top: '12%' },
];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  const bg = bgPositions[currentScene];
  const accent = accentLineConfig[currentScene];

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0d1724' }}>

      {/* Persistent background — animated gradient blob */}
      <motion.div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, rgba(27,43,75,0.6) 60%, transparent 100%)', width: '60vw', height: '60vw' }}
        animate={{ left: bg.x, top: bg.y, scale: bg.scale }}
        transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Secondary drifting orb */}
      <motion.div
        className="absolute rounded-full blur-2xl pointer-events-none opacity-30"
        style={{ background: 'radial-gradient(circle, #1B2B4B 0%, transparent 70%)', width: '40vw', height: '40vw' }}
        animate={{
          x: ['-5%', '8%', '-3%'],
          y: ['5%', '-8%', '4%'],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      {/* Persistent floating particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${[4, 3, 5, 2, 4, 3][i]}px`,
            height: `${[4, 3, 5, 2, 4, 3][i]}px`,
            background: '#C9A84C',
            left: `${[15, 75, 40, 85, 25, 60][i]}%`,
            top: `${[20, 35, 70, 15, 60, 80][i]}%`,
            opacity: 0.4,
          }}
          animate={{
            y: [0, -18, 5, -10, 0],
            x: [0, 6, -4, 8, 0],
            opacity: [0.3, 0.6, 0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 6 + i * 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.8,
          }}
        />
      ))}

      {/* Persistent gold accent line — repositions between scenes */}
      <motion.div
        className="absolute h-[1px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        animate={{ left: accent.left, width: accent.width, top: accent.top, opacity: 0.5 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Corner mark — persistent brand element */}
      <motion.div
        className="absolute top-[3vh] left-[3vw] flex items-center gap-[0.6vw] z-20"
        animate={{ opacity: currentScene === 4 ? 0 : 0.5 }}
        transition={{ duration: 0.5 }}
      >
        <div
          className="w-[2vw] h-[2vw] rounded flex items-center justify-center font-bold"
          style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '0.85vw', fontFamily: 'Playfair Display, serif' }}
        >
          CV
        </div>
        <span style={{ fontSize: '0.9vw', color: 'rgba(248,247,244,0.6)', fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
          ProCV
        </span>
      </motion.div>

      {/* Scene counter dots */}
      <div className="absolute bottom-[3vh] left-1/2 -translate-x-1/2 flex gap-[0.5vw] z-20">
        {Object.keys(SCENE_DURATIONS).map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            animate={{
              width: currentScene === i ? '1.5vw' : '0.4vw',
              height: '0.4vw',
              backgroundColor: currentScene === i ? '#C9A84C' : 'rgba(255,255,255,0.2)',
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* Scene foreground — only scene-specific content mounts/unmounts here */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="problem" />}
        {currentScene === 1 && <Scene2 key="pipeline" />}
        {currentScene === 2 && <Scene3 key="flow" />}
        {currentScene === 3 && <Scene4 key="score" />}
        {currentScene === 4 && <Scene5 key="close" />}
      </AnimatePresence>
    </div>
  );
}
