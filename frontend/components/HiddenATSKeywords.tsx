import React from 'react';

/**
 * HiddenATSKeywords — bulletproof off-screen keyword/JD layer.
 *
 * Purpose: lets ATS scanners pick up job-description keywords without ever
 * showing them to a human reader, no matter the template, theme, or zoom.
 *
 * The previous in-template pattern (`text-white text-[1px]`) failed in two
 * ways:
 *   1. On non-white backgrounds the white text stayed visible.
 *   2. At ~400% zoom the 1px white text became readable as faint smudges
 *      against the page edge because of subpixel rendering.
 *
 * This component layers FIVE independent invisibility guarantees so a
 * regression in any one of them still leaves the layer hidden:
 *
 *   1. Position pushed 9999px off-screen (left + top).
 *   2. Hard width/height clip to 1px with `overflow:hidden`.
 *   3. `color: transparent` — even if the layer slipped on-screen, no glyph
 *      would ever paint.
 *   4. `opacity: 0` — belt and braces; if `color` were ever overridden by a
 *      template's `* { color: … }` rule, opacity still hides everything.
 *   5. `font-size: 1px` — final fallback.
 *
 * `aria-hidden` keeps screen readers from announcing the keyword soup.
 * `pointerEvents: none` + `userSelect: none` stop accidental selection.
 *
 * Usage:
 *   <HiddenATSKeywords text={jobDescriptionForATS} />
 *
 * Renders nothing if `text` is empty.
 */
interface HiddenATSKeywordsProps {
  text?: string | null;
}

export const HiddenATSKeywords: React.FC<HiddenATSKeywordsProps> = ({ text }) => {
  if (!text || !String(text).trim()) return null;
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        color: 'transparent',
        opacity: 0,
        fontSize: '1px',
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  );
};

export default HiddenATSKeywords;
