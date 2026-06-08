import React, { useRef } from 'react';
import { CVData } from '../types';

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

const FONT_PAIRINGS = [
  { id: 'inter',              headingLabel: 'Inter',          bodyLabel: 'Inter',       label: 'Modern Sans',   headingFont: "'Inter', sans-serif",                       bodyFont: "'Inter', sans-serif" },
  { id: 'playfair-dm',        headingLabel: 'Playfair',       bodyLabel: 'DM Sans',     label: 'Editorial',     headingFont: "'Playfair Display', Georgia, serif",         bodyFont: "'DM Sans', sans-serif" },
  { id: 'georgia-open',       headingLabel: 'Georgia',        bodyLabel: 'Open Sans',   label: 'Traditional',   headingFont: "Georgia, 'Times New Roman', serif",          bodyFont: "'Open Sans', sans-serif" },
  { id: 'mono-inter',         headingLabel: 'Mono',           bodyLabel: 'Inter',       label: 'Developer',     headingFont: "'JetBrains Mono', 'Fira Code', monospace",   bodyFont: "'Inter', sans-serif" },
  { id: 'raleway-inter',      headingLabel: 'Raleway',        bodyLabel: 'Inter',       label: 'Geometric',     headingFont: "'Raleway', sans-serif",                      bodyFont: "'Inter', sans-serif" },
  { id: 'merriweather-lato',  headingLabel: 'Merriweather',   bodyLabel: 'Lato',        label: 'Classic Pro',   headingFont: "'Merriweather', Georgia, serif",             bodyFont: "'Lato', sans-serif" },
];

const V2ThemePicker: React.FC<V2ThemePickerProps> = ({ cvData, onChange }) => {
  const colorInputRef = useRef<HTMLInputElement>(null);

  const setAccent = (value: string) => {
    onChange({ ...cvData, accentColor: value });
  };

  const setFont = (id: string) => {
    onChange({ ...cvData, fontPairing: cvData.fontPairing === id ? undefined : id });
  };

  const currentAccent = cvData.accentColor ?? '';
  const currentFont   = cvData.fontPairing ?? '';

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
        <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
          {FONT_PAIRINGS.map(fp => {
            const active = currentFont === fp.id;
            return (
              <button
                key={fp.id}
                type="button"
                onClick={() => setFont(fp.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-md border transition-all duration-100 ${
                  active
                    ? 'border-[#2563eb] bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600'
                }`}
              >
                <span
                  className="text-[15px] leading-none font-semibold text-zinc-800 dark:text-zinc-100"
                  style={{ fontFamily: fp.headingFont }}
                >
                  Aa
                </span>
                <span className="text-[8.5px] font-medium text-zinc-500 dark:text-zinc-400 truncate w-full text-center leading-tight" style={{ fontFamily: fp.bodyFont }}>
                  {fp.label}
                </span>
                <span className="text-[7.5px] text-zinc-400 dark:text-zinc-500 truncate w-full text-center leading-tight">
                  {fp.headingLabel} / {fp.bodyLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default V2ThemePicker;
export { FONT_PAIRINGS };
