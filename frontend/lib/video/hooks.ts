import { useState, useEffect, useRef } from 'react';

interface UseVideoPlayerOptions {
  durations: Record<string, number>;
}

export function useVideoPlayer({ durations }: UseVideoPlayerOptions) {
  const scenes = Object.keys(durations);
  const [currentScene, setCurrentScene] = useState(0);
  const hasStoppedRef = useRef(false);
  const sceneRef = useRef(0);

  useEffect(() => {
    window.startRecording?.();

    let timeoutId: ReturnType<typeof setTimeout>;

    const advance = () => {
      sceneRef.current = (sceneRef.current + 1) % scenes.length;
      if (sceneRef.current === 0 && !hasStoppedRef.current) {
        hasStoppedRef.current = true;
        window.stopRecording?.();
      }
      setCurrentScene(sceneRef.current);
      timeoutId = setTimeout(advance, durations[scenes[sceneRef.current]]);
    };

    timeoutId = setTimeout(advance, durations[scenes[0]]);
    return () => clearTimeout(timeoutId);
  }, []);

  return { currentScene };
}

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}
