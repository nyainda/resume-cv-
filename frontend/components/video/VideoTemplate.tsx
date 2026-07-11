import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';

const SCENE_DURATIONS = {
  problem:   8000,
  intro:    10000,
  why:      10000,
  ats_gap:  10000,
  rooms:    10000,
  cover:    10000,
  tools:    10000,
  close:    10000,
};

const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

const SCENE_NAMES = [
  'The Problem', 'What is ProCV', 'Why ProCV',
  'ATS Gap Targeting', 'Career Rooms', 'Cover Letter AI',
  '12 AI Tools', 'Start Free',
];

const SCENES = Object.keys(SCENE_DURATIONS);

const bgPositions = [
  { x: '10%',  y: '15%', scale: 1.4 },
  { x: '70%',  y: '5%',  scale: 1.0 },
  { x: '55%',  y: '60%', scale: 1.6 },
  { x: '20%',  y: '70%', scale: 1.1 },
  { x: '45%',  y: '30%', scale: 1.3 },
  { x: '15%',  y: '45%', scale: 1.2 },
  { x: '65%',  y: '55%', scale: 1.5 },
  { x: '35%',  y: '20%', scale: 1.0 },
];

const accentLineConfig = [
  { left: '12%', width: '28%', top: '88%' },
  { left: '60%', width: '32%', top: '8%'  },
  { left: '5%',  width: '20%', top: '50%' },
  { left: '72%', width: '24%', top: '75%' },
  { left: '30%', width: '40%', top: '12%' },
  { left: '8%',  width: '25%', top: '70%' },
  { left: '55%', width: '30%', top: '40%' },
  { left: '20%', width: '35%', top: '85%' },
];

// ─── Screen recorder ──────────────────────────────────────────────────────────
type RecordState = 'idle' | 'waiting' | 'recording' | 'done' | 'error';

function useScreenRecorder(totalMs: number) {
  const [state, setState] = useState<RecordState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);

  const startCapture = useCallback(async (): Promise<boolean> => {
    setState('waiting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: false,
      });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'procv-advert.webm'; a.click();
        URL.revokeObjectURL(url);
        setState('done');
      };
      stream.getVideoTracks()[0].onended = () => {
        if (mr.state === 'recording') mr.stop();
        setState('idle');
      };
      setState('recording');
      mr.start(200);
      return true;
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
      return false;
    }
  }, [totalMs]);

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  return { state, startCapture, stopCapture };
}

// ─── Countdown overlay ────────────────────────────────────────────────────────
function Countdown({ from, onDone }: { from: number; onDone: () => void }) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (n <= 0) { onDone(); return; }
    const t = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span key={n} className="font-black"
          style={{ fontSize: '22vw', color: '#C9A84C', fontFamily: 'Playfair Display, serif', lineHeight: 1 }}
          initial={{ opacity: 0, scale: 1.5, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
      <motion.p className="mt-[2vh] text-[1.4vw] font-semibold tracking-[0.2em]"
        style={{ color: 'rgba(248,247,244,0.7)', fontFamily: 'DM Sans, sans-serif' }}
        animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }}
      >
        RECORDING STARTS IN…
      </motion.p>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VideoTemplate() {
  const { currentScene, isPlaying, isFinished, progressFraction, play, reset } =
    useVideoPlayer({ durations: SCENE_DURATIONS });
  const { state: recState, startCapture, stopCapture } = useScreenRecorder(TOTAL_MS);

  const [lightMode, setLightMode]   = useState(false);
  const [countdown, setCountdown]   = useState<number | null>(null);
  const videoRef                    = useRef<HTMLVideoElement>(null);

  // ── Auto-play on page load after 1 second ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { play(); }, 1000);
    return () => clearTimeout(t);
  }, []);

  // Auto-start recording + countdown, then play
  const handleStartAndRecord = useCallback(async () => {
    reset();
    const ok = await startCapture();
    if (!ok) return;
    setCountdown(3);
  }, [startCapture, reset]);

  const handleCountdownDone = useCallback(() => {
    setCountdown(null);
    play();
  }, [play]);

  // When playback finishes, stop recording
  useEffect(() => {
    if (isFinished && recState === 'recording') stopCapture();
  }, [isFinished, recState, stopCapture]);

  const handleReset = () => {
    if (recState === 'recording') stopCapture();
    setCountdown(null);
    reset();
  };

  const bg     = bgPositions[currentScene] ?? bgPositions[0];
  const accent = accentLineConfig[currentScene] ?? accentLineConfig[0];
  const darkBg = '#0a1220';
  const lightBg = '#F8F7F4';

  const totalSecs = Math.round(TOTAL_MS / 1000);
  const secsLeft  = Math.round(totalSecs - progressFraction * totalSecs);
  const sceneProps = { lightMode };

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: lightMode ? lightBg : darkBg }}
    >
      {/* ── Cinematic video backdrop ─────────────────────────────────────── */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ opacity: lightMode ? 0.06 : 0.22 }}
        src="/videos/cinematic-bg.mp4"
        autoPlay muted loop playsInline
      />

      {/* Dark gradient overlay to keep text readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: lightMode
            ? 'rgba(248,247,244,0.82)'
            : 'linear-gradient(135deg, rgba(10,18,32,0.78) 0%, rgba(10,18,32,0.55) 50%, rgba(10,18,32,0.78) 100%)',
        }}
      />

      {/* Animated blob */}
      <motion.div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{
          background: lightMode
            ? 'radial-gradient(circle, rgba(201,168,76,0.18) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, rgba(27,43,75,0.5) 60%, transparent 100%)',
          width: '60vw', height: '60vw',
        }}
        animate={{ left: bg.x, top: bg.y, scale: bg.scale }}
        transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Floating gold particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width:  `${[3,4,2,5,3,4,2,3][i]}px`,
            height: `${[3,4,2,5,3,4,2,3][i]}px`,
            background: '#C9A84C',
            left: `${[12,78,42,88,22,58,35,68][i]}%`,
            top:  `${[18,38,72,12,62,82,48,28][i]}%`,
          }}
          animate={{ y: [0,-20,6,-12,0], x: [0,7,-5,9,0], opacity: [0.2,0.55,0.25,0.5,0.2] }}
          transition={{ duration: 7 + i * 1.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
        />
      ))}

      {/* Gold accent line */}
      <motion.div
        className="absolute h-[1px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        animate={{ left: accent.left, width: accent.width, top: accent.top, opacity: 0.45 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      {/* ProCV corner mark */}
      <motion.div
        className="absolute top-[2.5vh] left-[2.5vw] flex items-center gap-[0.6vw] z-20"
        animate={{ opacity: currentScene === 7 ? 0 : 0.6 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-[2vw] h-[2vw] rounded-md flex items-center justify-center font-bold"
          style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '0.8vw', fontFamily: 'Playfair Display, serif' }}>
          CV
        </div>
        <span style={{ fontSize: '0.9vw', color: lightMode ? 'rgba(27,43,75,0.7)' : 'rgba(248,247,244,0.7)', fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
          ProCV
        </span>
      </motion.div>

      {/* Light/Dark toggle */}
      <button
        onClick={() => setLightMode(m => !m)}
        className="absolute top-[2.5vh] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105"
        style={{
          background: lightMode ? 'rgba(27,43,75,0.08)' : 'rgba(248,247,244,0.08)',
          border: lightMode ? '1px solid rgba(27,43,75,0.2)' : '1px solid rgba(248,247,244,0.2)',
          color: lightMode ? '#1B2B4B' : 'rgba(248,247,244,0.8)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span>{lightMode ? '🌙' : '☀️'}</span>
        {lightMode ? 'Dark mode' : 'Light mode'}
      </button>

      {/* Top-right controls */}
      <div className="absolute top-[2.5vh] right-[2vw] z-30 flex items-center gap-[0.8vw]">
        {recState === 'recording' && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-[0.5vw] px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            <motion.span className="w-[0.45vw] h-[0.45vw] rounded-full bg-red-500 inline-block"
              animate={{ opacity: [1,0.2,1] }} transition={{ duration: 0.9, repeat: Infinity }} />
            REC · {secsLeft}s left
            <button onClick={stopCapture} className="ml-[0.4vw] opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}

        {recState === 'done' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontFamily: 'DM Sans, sans-serif' }}>
            ✓ Saved to downloads!
          </motion.div>
        )}

        {/* Reset */}
        <button
          onClick={handleReset}
          className="flex items-center gap-[0.4vw] px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold transition-all hover:scale-105 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(248,247,244,0.7)', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
        >
          ↩ Replay
        </button>

        {/* Record button */}
        {recState === 'idle' && (
          <button
            onClick={handleStartAndRecord}
            className="flex items-center gap-[0.5vw] px-[1.2vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold transition-all hover:scale-105 active:scale-95"
            style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.5)', color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            <span className="w-[0.45vw] h-[0.45vw] rounded-full bg-red-500 inline-block" />
            Record &amp; Export
          </button>
        )}

        {recState === 'waiting' && (
          <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(248,247,244,0.6)', fontFamily: 'DM Sans, sans-serif' }}>
            <motion.span animate={{ opacity: [1,0.3,1] }} transition={{ duration: 0.8, repeat: Infinity }}>⏳</motion.span>
            Select this tab…
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <motion.div
        className="absolute bottom-0 left-0 h-[3px] z-30 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, #C9A84C, #f0dc8a)', width: `${progressFraction * 100}%` }}
        transition={{ duration: 0.2, ease: 'linear' }}
      />

      {/* ── Scene dots + name ─────────────────────────────────────────────── */}
      <div className="absolute bottom-[3vh] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[0.8vh] z-20 pointer-events-none">
        <AnimatePresence mode="popLayout">
          <motion.p key={currentScene}
            className="text-[0.68vw] font-semibold tracking-widest uppercase"
            style={{ color: lightMode ? 'rgba(27,43,75,0.45)' : 'rgba(248,247,244,0.45)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            {SCENE_NAMES[currentScene]}
          </motion.p>
        </AnimatePresence>
        <div className="flex gap-[0.5vw]">
          {SCENES.map((_, i) => (
            <motion.div key={i} className="rounded-full"
              animate={{
                width: currentScene === i ? '1.5vw' : '0.4vw',
                height: '0.4vw',
                backgroundColor: currentScene === i
                  ? '#C9A84C'
                  : i < currentScene
                    ? 'rgba(201,168,76,0.4)'
                    : (lightMode ? 'rgba(27,43,75,0.2)' : 'rgba(255,255,255,0.18)'),
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>

      {/* Scene counter */}
      <div className="absolute bottom-[3vh] right-[2vw] z-20 text-[0.65vw] font-semibold tabular-nums pointer-events-none"
        style={{ color: lightMode ? 'rgba(27,43,75,0.3)' : 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans, sans-serif' }}>
        {currentScene + 1} / {SCENES.length}
      </div>

      {/* ── Idle / pre-play splash ────────────────────────────────────────── */}
      <AnimatePresence>
        {!isPlaying && !isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: 'rgba(10,18,32,0.6)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Big play button */}
            <motion.button
              onClick={() => play()}
              className="relative flex items-center justify-center rounded-full mb-[3vh]"
              style={{ width: '8vw', height: '8vw', background: 'rgba(201,168,76,0.15)', border: '2px solid rgba(201,168,76,0.6)' }}
              animate={{ boxShadow: ['0 0 0px rgba(201,168,76,0)', '0 0 40px rgba(201,168,76,0.5)', '0 0 0px rgba(201,168,76,0)'] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              whileHover={{ scale: 1.08, background: 'rgba(201,168,76,0.25)' }}
              whileTap={{ scale: 0.96 }}
            >
              {/* Pulse ring */}
              <motion.div
                className="absolute rounded-full border"
                style={{ width: '8vw', height: '8vw', borderColor: 'rgba(201,168,76,0.3)' }}
                animate={{ scale: [1, 1.4, 1.7], opacity: [0.6, 0.3, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              />
              <span style={{ fontSize: '2.5vw', color: '#C9A84C', marginLeft: '0.3vw' }}>▶</span>
            </motion.button>

            <motion.div
              className="flex flex-col items-center gap-[1vh]"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-[4.5vw] h-[4.5vw] rounded-2xl flex items-center justify-center font-black"
                style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '2vw', fontFamily: 'Playfair Display, serif' }}>
                CV
              </div>
              <p className="text-[2vw] font-bold text-center" style={{ color: '#F8F7F4', fontFamily: 'Playfair Display, serif' }}>
                ProCV — The Ad
              </p>
              <p style={{ fontSize: '0.9vw', color: 'rgba(248,247,244,0.5)', fontFamily: 'DM Sans, sans-serif' }}>
                8 scenes · ~{Math.round(TOTAL_MS / 1000)}s · click ▶ or wait
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Finished splash ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: 'rgba(10,18,32,0.75)', backdropFilter: 'blur(14px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div className="flex flex-col items-center gap-[2.5vh]"
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.2 }}
            >
              <p className="text-[2.8vw] font-bold text-center" style={{ color: '#C9A84C', fontFamily: 'Playfair Display, serif' }}>
                {recState === 'done' ? '🎬 Saved to downloads!' : '✓ That\'s the ad.'}
              </p>
              <p style={{ fontSize: '1.05vw', color: 'rgba(248,247,244,0.55)', fontFamily: 'DM Sans, sans-serif', textAlign: 'center', maxWidth: '40vw' }}>
                {recState === 'done'
                  ? 'procv-advert.webm is in your downloads folder.'
                  : 'Hit Replay to watch again, or Record & Export to capture a .webm file.'}
              </p>
              <div className="flex items-center gap-[1.5vw] mt-[1vh]">
                <button onClick={handleReset}
                  className="flex items-center gap-[0.6vw] px-[2vw] py-[1.2vh] rounded-full text-[0.9vw] font-semibold transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.5)', color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
                >
                  ↩ Replay
                </button>
                {recState !== 'done' && (
                  <button onClick={handleStartAndRecord}
                    className="flex items-center gap-[0.5vw] px-[2vw] py-[1.2vh] rounded-full text-[0.9vw] font-semibold transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
                  >
                    <span className="w-[0.5vw] h-[0.5vw] rounded-full bg-red-500 inline-block" />
                    Record &amp; Export
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Countdown ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {countdown !== null && (
          <Countdown key="cd" from={countdown} onDone={handleCountdownDone} />
        )}
      </AnimatePresence>

      {/* ── Scene foreground ──────────────────────────────────────────────── */}
      {/* Order: Problem → What is ProCV → Why ProCV → ATS Gap → Career Rooms → Cover Letters → 12 Tools → Start Free */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && isPlaying && <Scene1 key="s1" {...sceneProps} />}
        {currentScene === 1 && isPlaying && <Scene2 key="s2" {...sceneProps} />}
        {currentScene === 2 && isPlaying && <Scene3 key="s3" {...sceneProps} />}
        {currentScene === 3 && isPlaying && <Scene6 key="s6" {...sceneProps} />}
        {currentScene === 4 && isPlaying && <Scene7 key="s7" {...sceneProps} />}
        {currentScene === 5 && isPlaying && <Scene8 key="s8" {...sceneProps} />}
        {currentScene === 6 && isPlaying && <Scene4 key="s4" {...sceneProps} />}
        {currentScene === 7 && isPlaying && <Scene5 key="s5" {...sceneProps} />}
      </AnimatePresence>
    </div>
  );
}
