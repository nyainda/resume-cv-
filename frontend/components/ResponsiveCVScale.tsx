import React, { useRef, useState, useEffect } from 'react';

const A4_WIDTH_PX = 794;

interface ResponsiveCVScaleProps {
  children: React.ReactNode;
  /** Upper bound on the scale factor so previews never blow up huge on wide screens. */
  maxScale?: number;
  /** Lower bound on the scale factor so previews never shrink to unreadable specks. */
  minScale?: number;
  className?: string;
}

/**
 * Wraps a full-size (794px / A4-width) CV preview and scales it to fit
 * whatever width its parent container actually has, on every screen size —
 * phone, tablet, or desktop. Uses ResizeObserver so it re-fits live as the
 * container is resized (rotation, split panes, sidebar toggle, etc).
 *
 * This mirrors the auto-fit logic already used by the main editor preview
 * and TemplateThumbnail — do not replace with a fixed `scale(0.NN)` value,
 * that breaks responsiveness on any screen width other than the one it was
 * tuned for.
 */
const ResponsiveCVScale: React.FC<ResponsiveCVScaleProps> = ({
  children,
  maxScale = 1,
  minScale = 0.2,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(minScale);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const available = el.clientWidth;
      if (available <= 0) return;
      setScale(Math.min(maxScale, Math.max(minScale, available / A4_WIDTH_PX)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale, minScale]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%' }}>
      <div
        style={{
          width: A4_WIDTH_PX,
          height: contentHeight > 0 ? Math.round(contentHeight * scale) : undefined,
        }}
      >
        <div
          ref={contentRef}
          style={{ width: A4_WIDTH_PX, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default ResponsiveCVScale;
