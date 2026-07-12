import React from 'react';
import { FONT_PAIRINGS } from './templates/engine/fontPairings';

interface FontPickerProps {
  /** Current CVData.fontPairing value — undefined or 'default' means theme default. */
  value: string | undefined;
  /** Called with the new pairing ID, or undefined when the user resets to theme default. */
  onChange: (id: string | undefined) => void;
}

/**
 * Horizontal scrollable font-pairing picker for CV templates.
 * Each chip renders "Aa" in the actual heading font so the user can
 * see the typeface at a glance, with the pairing name below.
 */
const FontPicker: React.FC<FontPickerProps> = ({ value, onChange }) => {
  const active = value ?? 'default';
  const activePairing = FONT_PAIRINGS.find(p => p.id === active);

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
          Font Pairing
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">
          {activePairing?.name ?? 'Theme Default'}
        </span>
      </div>

      {/* Scrollable chip row */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1.5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
      >
        {FONT_PAIRINGS.map((pairing) => {
          const isActive = active === pairing.id;
          // "Aa" preview uses the heading font; fall back to DM Sans for 'default'
          const previewFont = pairing.heading || "'DM Sans', sans-serif";

          return (
            <button
              key={pairing.id}
              title={`${pairing.name} — ${pairing.description}`}
              onClick={() => onChange(pairing.id === 'default' ? undefined : pairing.id)}
              className={`
                flex-none flex flex-col items-center justify-center gap-0.5
                w-[58px] h-[52px] rounded-lg border transition-all duration-150
                ${isActive
                  ? 'border-[#C9A84C] shadow-sm ring-1 ring-[#C9A84C]/40'
                  : 'border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 hover:bg-zinc-50 dark:hover:bg-neutral-800'
                }
              `}
              style={{
                background: isActive ? 'rgba(201,168,76,0.07)' : undefined,
              }}
            >
              {/* Typeface preview */}
              <span
                className="text-[15px] font-semibold leading-none text-zinc-800 dark:text-zinc-200 select-none"
                style={{ fontFamily: previewFont }}
              >
                Aa
              </span>
              {/* Pairing name */}
              <span
                className={`
                  text-[7.5px] leading-tight text-center truncate w-full px-1
                  ${isActive
                    ? 'text-[#C9A84C] font-bold'
                    : 'text-zinc-400 dark:text-zinc-500'
                  }
                `}
              >
                {pairing.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Reset link — only shown when a non-default pairing is active */}
      {value && value !== 'default' && (
        <button
          onClick={() => onChange(undefined)}
          className="mt-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
        >
          Reset to theme default
        </button>
      )}
    </div>
  );
};

export default FontPicker;
