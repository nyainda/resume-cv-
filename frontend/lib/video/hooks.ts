import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVideoPlayerOptions {
  durations: Record<string, number>;
}

export function useVideoPlayer({ durations }: UseVideoPlayerOptions) {
  const scenes = Object.keys(durations);
  const totalMs = Object.values(durations).reduce((a, b) => a + b, 0);

  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sceneRef    = useRef(0);
  const startTsRef  = useRef<number>(0);
  const sceneStartTsRef = useRef<number>(0);

  const clearAll = () => {
    if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const advance = useCallback(() => {
    const nextScene = sceneRef.current + 1;
    if (nextScene >= scenes.length) {
      setIsPlaying(false);
      setIsFinished(true);
      clearAll();
      window.stopRecording?.();
      return;
    }
    sceneRef.current = nextScene;
    sceneStartTsRef.current = performance.now();
    setCurrentScene(nextScene);
    timeoutRef.current = setTimeout(advance, durations[scenes[nextScene]]);
  }, [durations, scenes]);

  const play = useCallback(() => {
    clearAll();
    sceneRef.current = 0;
    setCurrentScene(0);
    setIsFinished(false);
    setElapsedMs(0);
    startTsRef.current = performance.now();
    sceneStartTsRef.current = performance.now();
    setIsPlaying(true);

    timeoutRef.current = setTimeout(advance, durations[scenes[0]]);

    intervalRef.current = setInterval(() => {
      setElapsedMs(Math.min(performance.now() - startTsRef.current, totalMs));
    }, 200);
  }, [advance, durations, scenes, totalMs]);

  const reset = useCallback(() => {
    clearAll();
    sceneRef.current = 0;
    setCurrentScene(0);
    setIsPlaying(false);
    setIsFinished(false);
    setElapsedMs(0);
  }, []);

  useEffect(() => () => clearAll(), []);

  const progressFraction = totalMs > 0 ? elapsedMs / totalMs : 0;

  return { currentScene, isPlaying, isFinished, progressFraction, play, reset };
}

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}
