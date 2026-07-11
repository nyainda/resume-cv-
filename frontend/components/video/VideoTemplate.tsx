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
  problem:  8000,
  pipeline: 10000,
  flow:     10000,
  score:    10000,
  ats_gap:  10000,
  rooms:    10000,
  cover:    10000,
  close:    10000,
};

const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

const bgPositions = [
  { x: '10%', y: '15%', scale: 1.4 },
  { x: '70%', y: '5%',  scale: 1.0 },
  { x: '55%', y: '60%', scale: 1.6 },
  { x: '20%', y: '70%', scale: 1.1 },
  { x: '45%', y: '30%', scale: 1.3 },
  { x: '15%', y: '45%', scale: 1.2 },
  { x: '65%', y: '55%', scale: 1.5 },
  { x: '35%', y: '20%', scale: 1.0 },
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

const SCENE_NAMES = [
  'The Problem', 'What is ProCV', 'Why ProCV', 'ATS Gap Targeting',
  'Career Rooms', 'Cover Letter AI', '12 AI Tools', 'Start Free',
];

const SCENES = Object.keys(SCENE_DURATIONS);

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
        a.href = url; a.download = 'procv-how-it-works.webm'; a.click();
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
  }, []);

  const stopCapture = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
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
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={n}
          className="font-black"
          style={{ fontSize: '20vw', color: '#C9A84C', fontFamily: 'Playfair Display, serif', lineHeight: 1 }}
          initial={{ opacity: 0, scale: 1.4, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
      <motion.p
        className="mt-[2vh] text-[1.2vw] font-semibold"
        style={{ color: 'rgba(248,247,244,0.7)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.2em' }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        RECORDING STARTS IN…
      </motion.p>
      <p className="mt-[1vh] text-[0.85vw]" style={{ color: 'rgba(248,247,244,0.4)', fontFamily: 'DM Sans, sans-serif' }}>
        Switch to this tab now if you haven't already
      </p>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VideoTemplate() {
  const { currentScene, isPlaying, isFinished, progressFraction, play, reset } =
    useVideoPlayer({ durations: SCENE_DURATIONS });
  const { state: recState, startCapture, stopCapture } = useScreenRecorder(TOTAL_MS);

  const [lightMode, setLightMode]     = useState(false);
  const [countdown, setCountdown]     = useState<number | null>(null);
  const [recordMode, setRecordMode]   = useState(false);

  const bg     = bgPositions[currentScene] ?? bgPositions[0];
  const accent = accentLineConfig[currentScene] ?? accentLineConfig[0];
  const darkBg   = '#0d1724';
  const lightBg  = '#F8F7F4';
  const blobDark  = 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, rgba(27,43,75,0.6) 60%, transparent 100%)';
  const blobLight = 'radial-gradient(circle, rgba(201,168,76,0.22) 0%, rgba(27,43,75,0.06) 60%, transparent 100%)';

  // Auto-start recording + countdown, then play
  const handleStartAndRecord = useCallback(async () => {
    const ok = await startCapture();
    if (!ok) return;
    setRecordMode(true);
    setCountdown(3);
  }, [startCapture]);

  const handleCountdownDone = useCallback(() => {
    setCountdown(null);
    play();
  }, [play]);

  // When playback finishes, stop recording
  useEffect(() => {
    if (isFinished && recState === 'recording') {
      stopCapture();
      setRecordMode(false);
    }
  }, [isFinished, recState, stopCapture]);

  const handleReset = () => {
    if (recState === 'recording') stopCapture();
    setCountdown(null);
    setRecordMode(false);
    reset();
  };

  const handlePlayOnly = () => {
    setRecordMode(false);
    play();
  };

  const sceneProps = { lightMode };
  const totalSecs  = Math.round(TOTAL_MS / 1000);
  const secsLeft   = Math.round(totalSecs - progressFraction * totalSecs);

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ background: lightMode ? lightBg : darkBg }}>

      {/* Cinematic video background */}
      <video
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ opacity: lightMode ? 0.04 : 0.09, filter: 'blur(3px) saturate(0.4)' }}
        src="/videos/cinematic-bg.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      {/* Animated background blob */}
      <motion.div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{ background: lightMode ? blobLight : blobDark, width: '60vw', height: '60vw' }}
        animate={{ left: bg.x, top: bg.y, scale: bg.scale }}
        transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Drifting orb */}
      <motion.div
        className="absolute rounded-full blur-2xl pointer-events-none opacity-30"
        style={{
          background: lightMode
            ? 'radial-gradient(circle, rgba(201,168,76,0.35) 0%, transparent 70%)'
            : 'radial-gradient(circle, #1B2B4B 0%, transparent 70%)',
          width: '40vw', height: '40vw',
        }}
        animate={{ x: ['-5%', '8%', '-3%'], y: ['5%', '-8%', '4%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: lightMode ? 0.012 : 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      {/* Floating gold particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width:  `${[4,3,5,2,4,3][i]}px`, height: `${[4,3,5,2,4,3][i]}px`,
            background: '#C9A84C',
            left: `${[15,75,40,85,25,60][i]}%`, top: `${[20,35,70,15,60,80][i]}%`,
          }}
          animate={{ y: [0,-18,5,-10,0], x: [0,6,-4,8,0], opacity: [0.3,0.6,0.3,0.5,0.3] }}
          transition={{ duration: 6 + i * 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }}
        />
      ))}

      {/* Gold accent line */}
      <motion.div
        className="absolute h-[1px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
        animate={{ left: accent.left, width: accent.width, top: accent.top, opacity: 0.5 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Corner ProCV mark */}
      <motion.div
        className="absolute top-[3vh] left-[3vw] flex items-center gap-[0.6vw] z-20"
        animate={{ opacity: currentScene === 7 ? 0 : 0.5 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-[2vw] h-[2vw] rounded flex items-center justify-center font-bold"
          style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '0.85vw', fontFamily: 'Playfair Display, serif' }}>
          CV
        </div>
        <span style={{ fontSize: '0.9vw', color: lightMode ? 'rgba(27,43,75,0.6)' : 'rgba(248,247,244,0.6)', fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
          ProCV
        </span>
      </motion.div>

      {/* Light/Dark toggle */}
      <button
        onClick={() => setLightMode(m => !m)}
        className="absolute top-[3vh] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105"
        style={{
          background:     lightMode ? 'rgba(27,43,75,0.08)'    : 'rgba(248,247,244,0.08)',
          border:         lightMode ? '1px solid rgba(27,43,75,0.2)' : '1px solid rgba(248,247,244,0.2)',
          color:          lightMode ? '#1B2B4B' : 'rgba(248,247,244,0.8)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span>{lightMode ? '🌙' : '☀️'}</span>
        {lightMode ? 'Dark mode' : 'Light mode'}
      </button>

      {/* ── Top-right controls ─────────────────────────────────────────────── */}
      <div className="absolute top-[3vh] right-[2vw] z-30 flex items-center gap-[0.8vw]">

        {/* Recording state badge */}
        {recState === 'recording' && (
          <motion.div
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-[0.5vw] px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            <motion.span className="w-[0.45vw] h-[0.45vw] rounded-full bg-red-500 inline-block" animate={{ opacity: [1,0.2,1] }} transition={{ duration: 0.9, repeat: Infinity }} />
            REC · {secsLeft}s left
            <button onClick={stopCapture} className="ml-[0.4vw] opacity-60 hover:opacity-100 transition-opacity">✕</button>
          </motion.div>
        )}

        {recState === 'done' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontFamily: 'DM Sans, sans-serif' }}>
            ✓ Video saved!
          </motion.div>
        )}

        {/* Reset button — always visible once something has happened */}
        {(isPlaying || isFinished || recState !== 'idle') && (
          <button
            onClick={handleReset}
            className="flex items-center gap-[0.4vw] px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold transition-all hover:scale-105 active:scale-95"
            style={{ background: lightMode ? 'rgba(27,43,75,0.06)' : 'rgba(255,255,255,0.06)', border: lightMode ? '1px solid rgba(27,43,75,0.2)' : '1px solid rgba(255,255,255,0.15)', color: lightMode ? '#1B2B4B' : 'rgba(248,247,244,0.7)', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            ↩ Reset
          </button>
        )}

        {/* Main CTA — shown only when not playing */}
        {!isPlaying && !isFinished && recState === 'idle' && (
          <div className="flex items-center gap-[0.6vw]">
            {/* Play only */}
            <button
              onClick={handlePlayOnly}
              className="flex items-center gap-[0.4vw] px-[1vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ background: lightMode ? 'rgba(27,43,75,0.06)' : 'rgba(255,255,255,0.06)', border: lightMode ? '1px solid rgba(27,43,75,0.2)' : '1px solid rgba(255,255,255,0.15)', color: lightMode ? '#1B2B4B' : 'rgba(248,247,244,0.7)', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
            >
              ▶ Preview
            </button>

            {/* Record + play */}
            <button
              onClick={handleStartAndRecord}
              className="flex items-center gap-[0.5vw] px-[1.2vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.5)', color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
            >
              <span className="w-[0.45vw] h-[0.45vw] rounded-full bg-red-500 inline-block" />
              Record &amp; Auto-play
            </button>
          </div>
        )}

        {/* Waiting for tab selection */}
        {recState === 'waiting' && (
          <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[0.6vh] rounded-full text-[0.75vw] font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(248,247,244,0.6)', fontFamily: 'DM Sans, sans-serif' }}>
            <motion.span animate={{ opacity: [1,0.3,1] }} transition={{ duration: 0.8, repeat: Infinity }}>⏳</motion.span>
            Select this tab…
          </div>
        )}
      </div>

      {/* ── Scene progress bar (replaces old recording bar) ───────────────── */}
      {isPlaying && (
        <motion.div
          className="absolute bottom-0 left-0 h-[3px] z-30 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, #C9A84C, #e8c97a)', width: `${progressFraction * 100}%` }}
          transition={{ duration: 0.2, ease: 'linear' }}
        />
      )}

      {/* ── Scene dots + name ─────────────────────────────────────────────── */}
      <div className="absolute bottom-[3vh] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[1vh] z-20">
        {/* Scene name */}
        <AnimatePresence mode="popLayout">
          <motion.p
            key={currentScene}
            className="text-[0.7vw] font-semibold tracking-widest uppercase"
            style={{ color: lightMode ? 'rgba(27,43,75,0.45)' : 'rgba(248,247,244,0.4)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            {SCENE_NAMES[currentScene]}
          </motion.p>
        </AnimatePresence>

        {/* Dots */}
        <div className="flex gap-[0.5vw]">
          {SCENES.map((_, i) => (
            <motion.div
              key={i}
              className="rounded-full"
              animate={{
                width:           currentScene === i ? '1.5vw' : '0.4vw',
                height:          '0.4vw',
                backgroundColor: currentScene === i
                  ? '#C9A84C'
                  : i < currentScene
                  ? (lightMode ? 'rgba(201,168,76,0.4)' : 'rgba(201,168,76,0.35)')
                  : (lightMode ? 'rgba(27,43,75,0.15)'  : 'rgba(255,255,255,0.15)'),
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>

      {/* Scene counter */}
      <div
        className="absolute bottom-[3vh] right-[2vw] z-20 text-[0.65vw] font-semibold tabular-nums"
        style={{ color: lightMode ? 'rgba(27,43,75,0.3)' : 'rgba(255,255,255,0.25)', fontFamily: 'DM Sans, sans-serif' }}
      >
        {currentScene + 1} / {SCENES.length}
      </div>

      {/* ── Idle splash (before play) ─────────────────────────────────────── */}
      <AnimatePresence>
        {!isPlaying && !isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="flex flex-col items-center gap-[2vh]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-[5vw] h-[5vw] rounded-2xl flex items-center justify-center font-black"
                style={{ background: '#C9A84C', color: '#1B2B4B', fontSize: '2.2vw', fontFamily: 'Playfair Display, serif' }}>
                CV
              </div>
              <p className="text-[1.8vw] font-bold" style={{ color: lightMode ? '#1B2B4B' : '#F8F7F4', fontFamily: 'Playfair Display, serif' }}>
                ProCV — How It Works
              </p>
              <p className="text-[0.9vw]" style={{ color: lightMode ? 'rgba(27,43,75,0.5)' : 'rgba(248,247,244,0.45)', fontFamily: 'DM Sans, sans-serif' }}>
                8 scenes · ~{Math.round(TOTAL_MS / 1000)}s · fully automatic
              </p>
              <div className="flex items-center gap-[1vw] mt-[1vh]">
                <div className="h-[1px] w-[6vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
                <span className="text-[0.8vw]" style={{ color: 'rgba(201,168,76,0.6)', fontFamily: 'DM Sans, sans-serif' }}>press a button above to begin</span>
                <div className="h-[1px] w-[6vw]" style={{ background: 'rgba(201,168,76,0.3)' }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Finished splash ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: lightMode ? 'rgba(248,247,244,0.6)' : 'rgba(13,23,36,0.6)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="flex flex-col items-center gap-[2.5vh]"
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-[2.5vw] font-bold" style={{ color: '#C9A84C', fontFamily: 'Playfair Display, serif' }}>
                {recState === 'done' ? '🎬 Video saved!' : '✓ Playback complete'}
              </p>
              <p className="text-[1vw]" style={{ color: lightMode ? 'rgba(27,43,75,0.6)' : 'rgba(248,247,244,0.5)', fontFamily: 'DM Sans, sans-serif' }}>
                {recState === 'done' ? 'Check your downloads folder for procv-how-it-works.webm' : 'Click Reset to watch again or Record to capture it.'}
              </p>
              <button
                onClick={handleReset}
                className="mt-[1vh] flex items-center gap-[0.6vw] px-[2vw] py-[1.2vh] rounded-full text-[0.9vw] font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.5)', color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
              >
                ↩ Reset &amp; watch again
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Countdown overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {countdown !== null && (
          <Countdown key="cd" from={countdown} onDone={handleCountdownDone} />
        )}
      </AnimatePresence>

      {/* ── Scene foreground ──────────────────────────────────────────────── */}
      {/* Scene order: Problem → What is ProCV → Why ProCV → ATS Gap → Career Rooms → Cover Letters → 12 Tools → Start Free */}
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
