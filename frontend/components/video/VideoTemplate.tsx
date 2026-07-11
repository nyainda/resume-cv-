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

// ─── ProCV Logo ───────────────────────────────────────────────────────────────
export function ProCVLogo({ size = '3vw', className = '' }: { size?: string; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" style={{ width: size, height: size, flexShrink: 0 }} className={className}>
      <rect width="512" height="512" rx="110" ry="110" fill="#EBFF38" />
      <rect x="96"  y="96"  width="44"  height="320" rx="18" fill="#111" />
      <rect x="96"  y="96"  width="136" height="44"  rx="18" fill="#111" />
      <rect x="96"  y="372" width="136" height="44"  rx="18" fill="#111" />
      <rect x="372" y="96"  width="44"  height="320" rx="18" fill="#111" />
      <rect x="280" y="96"  width="136" height="44"  rx="18" fill="#111" />
      <rect x="280" y="372" width="136" height="44"  rx="18" fill="#111" />
      <text x="256" y="308" textAnchor="middle" fill="#111" fontSize="132" fontWeight="900"
        fontFamily="system-ui,-apple-system,Arial,sans-serif" letterSpacing="-6">CV</text>
    </svg>
  );
}

// ─── Scene durations ──────────────────────────────────────────────────────────
const SCENE_DURATIONS = {
  problem:   8000,
  intro:    10000,
  profile:  10000,
  build:    10000,
  templates:10000,
  doctor:   10000,
  share:    10000,
  close:    10000,
};
const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);
const SCENE_KEYS = Object.keys(SCENE_DURATIONS);
const SCENE_NAMES = [
  'The Problem',
  'Meet ProCV',
  'Fill Your Profile',
  'Build Your CV',
  '30+ Templates',
  'CV Doctor',
  'Share Your Profile',
  'Start Free',
];

// ─── Ambient audio ────────────────────────────────────────────────────────────
function useAmbientAudio() {
  const ctxRef    = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const [muted, setMuted]   = useState(false);
  const [ready, setReady]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (ctxRef.current) { ctxRef.current.resume(); return; }
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.055;
      master.connect(ctx.destination);
      masterRef.current = master;

      // Spacious delay
      const dly   = ctx.createDelay(2.5); dly.delayTime.value = 0.9;
      const fbGain = ctx.createGain();   fbGain.gain.value = 0.28;
      const dlyFlt = ctx.createBiquadFilter();
      dlyFlt.type = 'lowpass'; dlyFlt.frequency.value = 600;
      dly.connect(dlyFlt); dlyFlt.connect(fbGain); fbGain.connect(dly);
      const dlyOut = ctx.createGain(); dlyOut.gain.value = 0.35;
      dly.connect(dlyOut); dlyOut.connect(master);

      // Pad — Cmaj7: C3 E3 G3 B3 + C2 drone
      const notes = [
        { f: 65.41,  g: 0.030, type: 'sine'     as OscillatorType }, // C2 drone
        { f: 130.81, g: 0.028, type: 'sine'     as OscillatorType }, // C3
        { f: 164.81, g: 0.022, type: 'sine'     as OscillatorType }, // E3
        { f: 196.00, g: 0.020, type: 'sine'     as OscillatorType }, // G3
        { f: 246.94, g: 0.016, type: 'triangle' as OscillatorType }, // B3
        { f: 329.63, g: 0.010, type: 'triangle' as OscillatorType }, // E4 shimmer
      ];
      notes.forEach(({ f, g, type }, i) => {
        const osc  = ctx.createOscillator();
        osc.type = type; osc.frequency.value = f;
        const lfo  = ctx.createOscillator();
        lfo.frequency.value = 0.08 + i * 0.025;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.012;
        lfo.connect(lfoG);
        const ng = ctx.createGain(); ng.gain.value = g;
        lfoG.connect(ng.gain);
        osc.connect(ng); ng.connect(master); ng.connect(dly);
        osc.start(); lfo.start();
      });

      // Soft kick pulse at 80 BPM (every other beat)
      const kickOsc = ctx.createOscillator();
      kickOsc.type = 'sine'; kickOsc.frequency.value = 50;
      const kickEnv = ctx.createGain(); kickEnv.gain.value = 0;
      kickOsc.connect(kickEnv); kickEnv.connect(master); kickOsc.start();
      let beat = 0;
      timerRef.current = setInterval(() => {
        if (!ctxRef.current) return;
        if (beat % 2 === 0) {
          const now = ctx.currentTime;
          kickEnv.gain.cancelScheduledValues(now);
          kickEnv.gain.setValueAtTime(0.06, now);
          kickEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          kickOsc.frequency.setValueAtTime(55, now);
          kickOsc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        }
        beat++;
      }, 750); // 80 BPM

      setReady(true);
    } catch { /* audio blocked */ }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      if (masterRef.current) masterRef.current.gain.value = m ? 0.055 : 0;
      return !m;
    });
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    ctxRef.current?.close(); ctxRef.current = null;
  }, []);

  return { start, toggleMute, stop, muted, ready };
}

// ─── Screen recorder ──────────────────────────────────────────────────────────
type RecordState = 'idle' | 'waiting' | 'recording' | 'done' | 'error';
function useScreenRecorder() {
  const [state, setState] = useState<RecordState>('idle');
  const mrRef    = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startCapture = useCallback(async (): Promise<boolean> => {
    setState('waiting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints, audio: false,
      });
      chunksRef.current = [];
      const supportsMP4 = MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/mp4;codecs=h264,mp4a.40.2');
      const mime = supportsMP4 ? 'video/mp4' : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm');
      const ext  = supportsMP4 ? 'mp4' : 'mp4'; // always .mp4 — players handle it
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mrRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `procv-ad.${ext}`; a.click();
        URL.revokeObjectURL(url);
        setState('done');
      };
      stream.getVideoTracks()[0].onended = () => { if (mr.state === 'recording') mr.stop(); setState('idle'); };
      setState('recording'); mr.start(200); return true;
    } catch { setState('error'); setTimeout(() => setState('idle'), 3000); return false; }
  }, []);

  const stopCapture = useCallback(() => {
    if (mrRef.current?.state === 'recording') mrRef.current.stop();
  }, []);

  return { state, startCapture, stopCapture };
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ from, onDone }: { from: number; onDone: () => void }) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (n <= 0) { onDone(); return; }
    const t = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <motion.div className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span key={n} className="font-black leading-none"
          style={{ fontSize: '20vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}
          initial={{ opacity: 0, scale: 1.8, y: -30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.4, y: 20 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >{n}</motion.span>
      </AnimatePresence>
      <p className="mt-[2vh] text-[1.2vw] font-semibold tracking-[0.25em] uppercase"
        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif' }}>
        Recording starts…
      </p>
    </motion.div>
  );
}

// ─── Background grid ──────────────────────────────────────────────────────────
const bgShifts = [
  { x: '8%',  y: '12%', s: 1.3 }, { x: '68%', y: '5%',  s: 1.0 },
  { x: '52%', y: '58%', s: 1.5 }, { x: '18%', y: '68%', s: 1.1 },
  { x: '42%', y: '28%', s: 1.2 }, { x: '12%', y: '42%', s: 1.4 },
  { x: '62%', y: '52%', s: 1.3 }, { x: '30%', y: '18%', s: 1.0 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VideoTemplate() {
  const { currentScene, isPlaying, isFinished, progressFraction, play, reset } =
    useVideoPlayer({ durations: SCENE_DURATIONS });
  const { state: recState, startCapture, stopCapture } = useScreenRecorder();
  const audio = useAmbientAudio();
  const [countdown, setCountdown] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-play + start audio on first user interaction
  useEffect(() => {
    const t = setTimeout(() => play(), 1000);
    const onInteract = () => audio.start();
    document.addEventListener('click', onInteract, { once: true });
    document.addEventListener('keydown', onInteract, { once: true });
    return () => { clearTimeout(t); document.removeEventListener('click', onInteract); document.removeEventListener('keydown', onInteract); };
  }, []);

  const handleStartAndRecord = useCallback(async () => {
    reset();
    const ok = await startCapture();
    if (!ok) return;
    setCountdown(3);
  }, [startCapture, reset]);

  const handleCountdownDone = useCallback(() => {
    setCountdown(null);
    audio.start();
    play();
  }, [play]);

  useEffect(() => {
    if (isFinished && recState === 'recording') stopCapture();
  }, [isFinished, recState, stopCapture]);

  const handleReset = () => {
    if (recState === 'recording') stopCapture();
    setCountdown(null);
    reset();
  };

  const bg         = bgShifts[currentScene] ?? bgShifts[0];
  const totalSecs  = Math.round(TOTAL_MS / 1000);
  const secsLeft   = Math.round(totalSecs - progressFraction * totalSecs);
  const sceneProps = {};

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ background: '#06090f' }}>

      {/* Cinematic video backdrop */}
      <video ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ opacity: 0.55 }}
        src="/videos/cinematic-bg.mp4"
        autoPlay muted loop playsInline
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(6,9,15,0.78) 0%, rgba(6,9,15,0.48) 50%, rgba(6,9,15,0.78) 100%)' }}
      />

      {/* Animated ambient glow blob */}
      <motion.div
        className="absolute rounded-full blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(235,255,56,0.07) 0%, rgba(201,168,76,0.05) 40%, transparent 70%)',
          width: '65vw', height: '65vw',
        }}
        animate={{ left: bg.x, top: bg.y, scale: bg.s }}
        transition={{ duration: 3.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Floating gold particles */}
      {[...Array(10)].map((_, i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none"
          style={{
            width:  `${[3,4,2,5,3,4,2,3,4,2][i]}px`,
            height: `${[3,4,2,5,3,4,2,3,4,2][i]}px`,
            background: i % 3 === 0 ? '#EBFF38' : '#C9A84C',
            left: `${[10,75,40,85,20,55,32,65,48,22][i]}%`,
            top:  `${[15,35,70,10,60,80,45,25,55,82][i]}%`,
          }}
          animate={{ y: [0,-18,5,-10,0], x: [0,6,-4,8,0], opacity: [0.15,0.5,0.2,0.45,0.15] }}
          transition={{ duration: 7 + i * 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
        />
      ))}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-[8vh] flex items-center px-[2vw] z-30"
        style={{ background: 'linear-gradient(180deg, rgba(6,9,15,0.7) 0%, transparent 100%)' }}>
        {/* Logo */}
        <motion.div className="flex items-center gap-[0.6vw]"
          animate={{ opacity: currentScene === 7 ? 0 : 1 }} transition={{ duration: 0.6 }}>
          <ProCVLogo size="2.2vw" />
          <span style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.05em' }}>
            ProCV
          </span>
        </motion.div>

        <div className="flex-1" />

        {/* Audio toggle */}
        <button onClick={() => { audio.start(); audio.toggleMute(); }}
          className="flex items-center gap-[0.4vw] px-[0.9vw] py-[0.5vh] rounded-full text-[0.72vw] font-semibold transition-all hover:scale-105 mr-[0.8vw]"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
        >
          {audio.muted ? '🔇' : '🔊'}
          <span>{audio.muted ? 'Unmute' : 'Music'}</span>
        </button>

        {/* Recording indicator */}
        {recState === 'recording' && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-[0.5vw] px-[0.9vw] py-[0.5vh] rounded-full text-[0.72vw] font-semibold mr-[0.8vw]"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            <motion.span className="w-[0.4vw] h-[0.4vw] rounded-full bg-red-500 inline-block"
              animate={{ opacity: [1,0.2,1] }} transition={{ duration: 0.9, repeat: Infinity }} />
            REC · {secsLeft}s
            <button onClick={stopCapture} className="ml-[0.3vw] opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}
        {recState === 'done' && (
          <div className="px-[0.9vw] py-[0.5vh] rounded-full text-[0.72vw] font-semibold mr-[0.8vw]"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontFamily: 'DM Sans, sans-serif' }}>
            ✓ Saved
          </div>
        )}

        {/* Replay */}
        <button onClick={handleReset}
          className="flex items-center gap-[0.4vw] px-[0.9vw] py-[0.5vh] rounded-full text-[0.72vw] font-semibold transition-all hover:scale-105 mr-[0.6vw]"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
        >
          ↩ Replay
        </button>

        {/* Record */}
        {recState === 'idle' && (
          <button onClick={handleStartAndRecord}
            className="flex items-center gap-[0.4vw] px-[1vw] py-[0.5vh] rounded-full text-[0.72vw] font-semibold transition-all hover:scale-105"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.45)', color: '#C9A84C', fontFamily: 'DM Sans, sans-serif', backdropFilter: 'blur(8px)' }}
          >
            <span className="w-[0.4vw] h-[0.4vw] rounded-full bg-red-500 inline-block" />
            Export .mp4
          </button>
        )}
        {recState === 'waiting' && (
          <div className="px-[1vw] py-[0.5vh] rounded-full text-[0.72vw]"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif' }}>
            <motion.span animate={{ opacity: [1,0.3,1] }} transition={{ duration: 0.8, repeat: Infinity }}>⏳</motion.span> Select tab…
          </div>
        )}
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <motion.div className="absolute bottom-0 left-0 h-[3px] z-30 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, #EBFF38, #C9A84C, #f0dc8a)', width: `${progressFraction * 100}%` }}
        transition={{ duration: 0.2, ease: 'linear' }}
      />

      {/* Scene dots + name */}
      <div className="absolute bottom-[3.5vh] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[0.8vh] z-20 pointer-events-none">
        <AnimatePresence mode="popLayout">
          <motion.p key={currentScene}
            className="text-[0.65vw] font-semibold tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >{SCENE_NAMES[currentScene]}</motion.p>
        </AnimatePresence>
        <div className="flex gap-[0.5vw]">
          {SCENE_KEYS.map((_, i) => (
            <motion.div key={i} className="rounded-full"
              animate={{
                width: currentScene === i ? '1.6vw' : '0.35vw',
                height: '0.35vw',
                backgroundColor: currentScene === i ? '#EBFF38' : i < currentScene ? 'rgba(235,255,56,0.35)' : 'rgba(255,255,255,0.15)',
              }}
              transition={{ duration: 0.35 }}
            />
          ))}
        </div>
      </div>

      {/* Scene counter */}
      <div className="absolute bottom-[3.5vh] right-[2vw] z-20 text-[0.62vw] font-semibold tabular-nums pointer-events-none"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Sans, sans-serif' }}>
        {currentScene + 1} / {SCENE_KEYS.length}
      </div>

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isPlaying && !isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: 'rgba(6,9,15,0.72)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onClick={() => { audio.start(); play(); }}
          >
            {/* Play button */}
            <motion.div
              className="relative flex items-center justify-center rounded-full mb-[3vh] cursor-pointer"
              style={{ width: '9vw', height: '9vw', background: 'rgba(235,255,56,0.1)', border: '2px solid rgba(235,255,56,0.5)' }}
              animate={{ boxShadow: ['0 0 0px rgba(235,255,56,0)', '0 0 50px rgba(235,255,56,0.35)', '0 0 0px rgba(235,255,56,0)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              whileHover={{ scale: 1.08, background: 'rgba(235,255,56,0.2)' }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div className="absolute rounded-full border"
                style={{ width: '9vw', height: '9vw', borderColor: 'rgba(235,255,56,0.25)' }}
                animate={{ scale: [1, 1.5, 1.9], opacity: [0.6, 0.25, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
              />
              <span style={{ fontSize: '2.8vw', color: '#EBFF38', marginLeft: '0.5vw' }}>▶</span>
            </motion.div>

            <motion.div className="flex flex-col items-center gap-[1.5vh]"
              animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
              <ProCVLogo size="5.5vw" />
              <p style={{ fontSize: '2.2vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 800, letterSpacing: '-0.02em' }}>
                ProCV
              </p>
              <p style={{ fontSize: '1.05vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.08em' }}>
                See how it works · {Math.round(TOTAL_MS / 1000)}s · click to play
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Finished splash ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: 'rgba(6,9,15,0.82)', backdropFilter: 'blur(16px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}
          >
            <motion.div className="flex flex-col items-center gap-[2.5vh]"
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            >
              <ProCVLogo size="5vw" />
              <p style={{ fontSize: '2.6vw', color: recState === 'done' ? '#86efac' : '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 800 }}>
                {recState === 'done' ? '🎬 Saved to downloads!' : '✓ That\'s ProCV.'}
              </p>
              <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif', textAlign: 'center', maxWidth: '38vw' }}>
                {recState === 'done' ? 'procv-ad.webm is in your downloads folder.' : 'Replay, or export as .webm to share anywhere.'}
              </p>
              <div className="flex items-center gap-[1.5vw] mt-[1vh]">
                <button onClick={handleReset}
                  className="flex items-center gap-[0.5vw] px-[2vw] py-[1.2vh] rounded-full text-[0.9vw] font-semibold transition-all hover:scale-105"
                  style={{ background: 'rgba(235,255,56,0.1)', border: '1px solid rgba(235,255,56,0.45)', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}
                >↩ Replay</button>
                {recState !== 'done' && (
                  <button onClick={handleStartAndRecord}
                    className="flex items-center gap-[0.5vw] px-[2vw] py-[1.2vh] rounded-full text-[0.9vw] font-semibold transition-all hover:scale-105"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    <span className="w-[0.45vw] h-[0.45vw] rounded-full bg-red-500 inline-block" />
                    Export .webm
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown */}
      <AnimatePresence>
        {countdown !== null && <Countdown key="cd" from={countdown} onDone={handleCountdownDone} />}
      </AnimatePresence>

      {/* ── Scenes ──────────────────────────────────────────────────────── */}
      <AnimatePresence mode="sync">
        {currentScene === 0 && isPlaying && <Scene1 key="s1" {...sceneProps} />}
        {currentScene === 1 && isPlaying && <Scene2 key="s2" {...sceneProps} />}
        {currentScene === 2 && isPlaying && <Scene3 key="s3" {...sceneProps} />}
        {currentScene === 3 && isPlaying && <Scene4 key="s4" {...sceneProps} />}
        {currentScene === 4 && isPlaying && <Scene5 key="s5" {...sceneProps} />}
        {currentScene === 5 && isPlaying && <Scene6 key="s6" {...sceneProps} />}
        {currentScene === 6 && isPlaying && <Scene7 key="s7" {...sceneProps} />}
        {currentScene === 7 && isPlaying && <Scene8 key="s8" {...sceneProps} />}
      </AnimatePresence>
    </div>
  );
}
