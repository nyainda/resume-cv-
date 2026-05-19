/**
 * PhotoCropModal — inline circular photo crop tool.
 *
 * Shows the uploaded image inside a circular viewport.
 * User can drag to pan and use the slider (or scroll wheel) to zoom.
 * On confirm, outputs a 400×400 JPEG base64 string.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

const VIEWPORT = 280; // diameter of the circular crop window, px
const OUTPUT   = 400; // output canvas size, px

export default function PhotoCropModal({ imageSrc, onConfirm, onCancel }: Props) {
  const imgRef           = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [zoom, setZoom]       = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Natural size of the image
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });

  // Minimum zoom = fit the longer dimension so the whole viewport is covered
  const minZoom = Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h);
  const maxZoom = minZoom * 4;

  // On load: reset zoom to minZoom so image fills the circle from the start
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      const mz = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight);
      setZoom(mz);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
      imgRef.current = img;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Clamp offset so the image always covers the viewport circle
  const clamp = useCallback((ox: number, oy: number, z: number, nw: number, nh: number) => {
    const hw = (nw * z) / 2;
    const hh = (nh * z) / 2;
    const r  = VIEWPORT / 2;
    return {
      x: Math.min(hw - r, Math.max(-(hw - r), ox)),
      y: Math.min(hh - r, Math.max(-(hh - r), oy)),
    };
  }, []);

  // ── Drag (mouse) ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const clamped = clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, zoom, naturalSize.w, naturalSize.h);
      setOffset(clamped);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [zoom, naturalSize, clamp]);

  // ── Drag (touch) ──────────────────────────────────────────────────────────
  const lastTouchDist = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: offset.x, oy: offset.y };
      lastTouchDist.current = null;
    } else if (e.touches.length === 2) {
      dragRef.current = null;
      lastTouchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      const clamped = clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, zoom, naturalSize.w, naturalSize.h);
      setOffset(clamped);
    } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      setZoom(z => {
        const nz = Math.min(maxZoom, Math.max(minZoom, z * delta));
        setOffset(o => clamp(o.x, o.y, nz, naturalSize.w, naturalSize.h));
        return nz;
      });
    }
  };
  const onTouchEnd = () => { dragRef.current = null; lastTouchDist.current = null; };

  // ── Scroll to zoom ────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.07 : 0.93;
    setZoom(z => {
      const nz = Math.min(maxZoom, Math.max(minZoom, z * factor));
      setOffset(o => clamp(o.x, o.y, nz, naturalSize.w, naturalSize.h));
      return nz;
    });
  };

  // ── Confirm: render to canvas ─────────────────────────────────────────────
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width  = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, 2 * Math.PI);
    ctx.clip();

    // Scale from viewport coords to output coords
    const s = OUTPUT / VIEWPORT;
    const cx = OUTPUT / 2 + offset.x * s;
    const cy = OUTPUT / 2 + offset.y * s;
    const dw = naturalSize.w * zoom * s;
    const dh = naturalSize.h * zoom * s;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);

    onConfirm(canvas.toDataURL('image/jpeg', 0.85));
  };

  const zoomPct = loaded ? Math.round(((zoom - minZoom) / (maxZoom - minZoom)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 dark:border-neutral-800">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Crop your photo</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Drag to reposition · Scroll or pinch to zoom</p>
        </div>

        {/* Crop viewport */}
        <div className="flex flex-col items-center px-5 py-5 bg-zinc-50 dark:bg-neutral-800/60 gap-4">
          {/* Circular viewport container */}
          <div
            className="relative select-none"
            style={{ width: VIEWPORT, height: VIEWPORT, cursor: 'grab' }}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Circular clip mask */}
            <div
              style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                overflow: 'hidden',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                zIndex: 1,
              }}
            >
              {loaded && (
                <img
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                    transformOrigin: 'center center',
                    maxWidth: 'none',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    width: naturalSize.w,
                    height: naturalSize.h,
                  }}
                />
              )}
            </div>

            {/* Circle border guide */}
            <div
              style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.7)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />

            {/* Loading spinner */}
            {!loaded && (
              <div className="absolute inset-0 rounded-full bg-zinc-200 dark:bg-neutral-700 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-[#C9A84C] border-t-transparent animate-spin" />
              </div>
            )}
          </div>

          {/* Zoom slider */}
          <div className="w-full flex items-center gap-2 px-1">
            <span className="text-[10px] text-zinc-400 w-8 text-right select-none">–</span>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomPct}
              onChange={(e) => {
                const pct = Number(e.target.value) / 100;
                const nz  = minZoom + pct * (maxZoom - minZoom);
                setZoom(nz);
                setOffset(o => clamp(o.x, o.y, nz, naturalSize.w, naturalSize.h));
              }}
              className="flex-1 h-1.5 rounded-full accent-[#C9A84C] cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 w-8 select-none">+</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-medium border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!loaded}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#1B2B4B] text-white hover:bg-[#243a62] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply photo
          </button>
        </div>
      </div>
    </div>
  );
}
