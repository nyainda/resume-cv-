import React, { useRef } from 'react';
import { CVData } from '../types';
import { FONT_PAIRINGS } from './templates/engine/fontPairings';

interface V2ThemePickerProps {
  cvData: CVData;
  onChange: (d: CVData) => void;
}

const ACCENT_COLORS = [
  { label: 'Blue',      value: '#2563eb' },
  { label: 'Navy',      value: '#1B2B4B' },
  { label: 'Emerald',   value: '#059669' },
  { label: 'Gold',      value: '#c9a84c' },
  { label: 'Rose',      value: '#e11d48' },
  { label: 'Violet',    value: '#7c3aed' },
  { label: 'Teal',      value: '#0891b2' },
  { label: 'Orange',    value: '#ea580c' },
  { label: 'Slate',     value: '#475569' },
  { label: 'Black',     value: '#111111' },
];

// Font pairings are sourced from the shared fontPairings.ts — no local copy needed.
const PICKER_FONT_PAIRINGS = FONT_PAIRINGS.filter(fp => fp.id !== 'default');

const FONT_SCALES = [
  { label: 'XS', value: 0.88, title: 'Extra small text' },
  { label: 'S',  value: 0.94, title: 'Small text' },
  { label: 'M',  value: 1.0,  title: 'Default text size' },
  { label: 'L',  value: 1.08, title: 'Larger text' },
  { label: 'XL', value: 1.16, title: 'Extra large text' },
] as const;

const BULLET_STYLES = [
  { char: '▸', label: 'Arrow'   },
  { char: '•', label: 'Dot'     },
  { char: '›', label: 'Chevron' },
  { char: '◆', label: 'Diamond' },
  { char: '■', label: 'Square'  },
  { char: '–', label: 'Dash'    },
  { char: '→', label: 'Right'   },
  { char: '★', label: 'Star'    },
] as const;

const V2ThemePicker: React.FC<V2ThemePickerProps> = ({ cvData, onChange }) => {
  const colorInputRef = useRef<HTMLInputElement>(null);

  const setAccent = (value: string) => {
    onChange({ ...cvData, accentColor: value });
  };

  const setFont = (id: string) => {
    onChange({ ...cvData, fontPairing: cvData.fontPairing === id ? undefined : id });
  };

  const setScale = (v: number) => {
    onChange({ ...cvData, fontScale: v === 1.0 ? undefined : v });
  };

  const setBullet = (char: string) => {
    onChange({ ...cvData, bulletStyle: cvData.bulletStyle === char ? undefined : char });
  };

  const currentAccent  = cvData.accentColor  ?? '';
  const currentFont    = cvData.fontPairing  ?? '';
  const currentScale   = cvData.fontScale    ?? 1.0;
  const currentBullet  = cvData.bulletStyle  ?? '';

  return (
    <div className="mt-5 space-y-4">

      {/* ── Accent colour ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
            Accent Colour
          </span>
          {currentAccent && (
            <button
              type="button"
              onClick={() => onChange({ ...cvData, accentColor: undefined })}
              className="text-[10px] text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
          {ACCENT_COLORS.map(({ label, value }) => {
            const active = currentAccent.toLowerCase() === value.toLowerCase();
            return (
              <button
                key={value}
                type="button"
                title={label}
                onClick={() => setAccent(value)}
                className={`w-6 h-6 rounded-full border-2 transition-all duration-100 hover:scale-110 focus:outline-none ${
                  active
                    ? 'border-white ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 scale-110'
                    : 'border-transparent hover:border-white/60'
                }`}
                style={{ background: value }}
                aria-pressed={active}
                aria-label={label}
              />
            );
          })}

          {/* Custom colour */}
          <div className="relative">
            <button
              type="button"
              title="Custom colour"
              onClick={() => colorInputRef.current?.click()}
              className={`w-6 h-6 rounded-full border-2 transition-all duration-100 hover:scale-110 focus:outline-none flex items-center justify-center overflow-hidden ${
                currentAccent && !ACCENT_COLORS.some(c => c.value.toLowerCase() === currentAccent.toLowerCase())
                  ? 'border-white ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 scale-110'
                  : 'border-dashed border-zinc-300 dark:border-neutral-600'
              }`}
              style={
                currentAccent && !ACCENT_COLORS.some(c => c.value.toLowerCase() === currentAccent.toLowerCase())
                  ? { background: currentAccent }
                  : { background: 'conic-gradient(red, orange, yellow, green, blue, violet, red)' }
              }
              aria-label="Custom colour"
            />
            <input
              ref={colorInputRef}
              type="color"
              value={currentAccent || '#2563eb'}
              onChange={e => setAccent(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          {/* Active preview */}
          {currentAccent && (
            <span
              className="ml-auto text-[11px] font-mono font-medium px-2 py-0.5 rounded"
              style={{ background: currentAccent + '22', color: currentAccent }}
            >
              {currentAccent.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* ── Font pairing ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
            Font Pairing
          </span>
          {currentFont && (
            <button
              type="button"
              onClick={() => onChange({ ...cvData, fontPairing: undefined })}
              className="text-[10px] text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        <div
          className="grid grid-cols-3 gap-1.5 p-2.5 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700 overflow-y-auto"
          style={{ maxHeight: '260px', scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
        >
          {PICKER_FONT_PAIRINGS.map(fp => {
            const active = currentFont === fp.id;
            return (
              <button
                key={fp.id}
                type="button"
                onClick={() => setFont(fp.id)}
                aria-pressed={active}
                title={`${fp.name} — ${fp.description}`}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-md border transition-all duration-100 ${
                  active
                    ? 'border-[#2563eb] bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600'
                }`}
              >
                <span
                  className="text-[15px] leading-none font-semibold text-zinc-800 dark:text-zinc-100"
                  style={{ fontFamily: fp.heading || "'DM Sans', sans-serif" }}
                >
                  Aa
                </span>
                <span className="text-[8px] font-medium text-zinc-500 dark:text-zinc-400 truncate w-full text-center leading-tight">
                  {fp.name.split(' ')[0]}
                </span>
                <span className="text-[7px] text-zinc-400 dark:text-zinc-500 truncate w-full text-center leading-tight">
                  {fp.description.split(' · ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bullet style ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
            Bullet Style
          </span>
          {currentBullet && (
            <button
              type="button"
              onClick={() => onChange({ ...cvData, bulletStyle: undefined })}
              className="text-[10px] text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
          {BULLET_STYLES.map(({ char, label }) => {
            const active = currentBullet === char;
            return (
              <button
                key={char}
                type="button"
                title={label}
                onClick={() => setBullet(char)}
                aria-pressed={active}
                className={`flex flex-col items-center justify-center w-10 h-10 rounded-md border transition-all duration-100 gap-0.5 ${
                  active
                    ? 'border-[#2563eb] bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600'
                }`}
              >
                <span className={`text-[16px] leading-none ${active ? 'text-[#2563eb]' : 'text-zinc-700 dark:text-zinc-200'}`}>
                  {char}
                </span>
                <span className="text-[7px] text-zinc-400 dark:text-zinc-500 leading-none">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 1-Page Mode ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-1">
        <div>
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block">
            1-Page Mode
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-snug">
            Compresses content to fit one A4 page — a red line shows where page 1 ends
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...cvData, onePage: !cvData.onePage })}
          className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ml-4 ${
            cvData.onePage ? 'bg-[#1B2B4B]' : 'bg-zinc-200 dark:bg-neutral-600'
          }`}
          role="switch"
          aria-checked={!!cvData.onePage}
          title="Toggle 1-page mode"
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${cvData.onePage ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* ── Text size ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
            Text Size
          </span>
          {cvData.fontScale && (
            <button
              type="button"
              onClick={() => onChange({ ...cvData, fontScale: undefined })}
              className="text-[10px] text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex gap-1.5 p-2.5 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
          {FONT_SCALES.map(({ label, value, title }) => {
            const active = Math.abs(currentScale - value) < 0.01;
            return (
              <button
                key={value}
                type="button"
                title={title}
                onClick={() => setScale(value)}
                aria-pressed={active}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border transition-all duration-100 ${
                  active
                    ? 'border-[#2563eb] bg-blue-50 dark:bg-blue-950/30 text-[#2563eb] shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default V2ThemePicker;
