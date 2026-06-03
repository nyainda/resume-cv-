export function WritingStyle() {
  const modes = [
    {
      id: 'authentic',
      label: 'Authentic',
      emoji: '✅',
      shortDesc: 'Your story, sharpened',
      description: 'Rewrites every bullet with strong action verbs and quantified results using only your real experience. Injects the exact keywords from the job description. Nothing invented — just your best, most persuasive self.',
      color: 'emerald',
      intensity: 1,
      border: '#059669',
      bg: '#ecfdf5',
      text: '#065f46',
      badge: '#d1fae5',
      bar: '#10b981',
      risk: null,
      warningText: null,
    },
    {
      id: 'enhanced',
      label: 'Enhanced',
      emoji: '🚀',
      shortDesc: 'Stronger framing + gaps filled',
      description: 'Your real experience rewritten for maximum impact, with strategic enhancements to bullet framing, scope language, and leadership indicators. Fills visible career gaps with plausible context. No invented employers.',
      color: 'blue',
      intensity: 2,
      border: '#2563eb',
      bg: '#eff6ff',
      text: '#1d4ed8',
      badge: '#dbeafe',
      bar: '#3b82f6',
      risk: 'Low Risk',
      warningText: 'Enhanced mode strengthens your existing experience with bolder framing. Review the CV before submitting to ensure all phrasing feels true to you.',
    },
    {
      id: 'maximum',
      label: 'Maximum',
      emoji: '🔥',
      shortDesc: 'Peak impact — every word optimised',
      description: 'Everything in Enhanced, plus your CV is restructured to foreground your strongest signals. Summary rewritten to match the ideal-candidate profile. Bullet sequence reordered for maximum ATS and human impact.',
      color: 'orange',
      intensity: 3,
      border: '#ea580c',
      bg: '#fff7ed',
      text: '#c2410c',
      badge: '#fed7aa',
      bar: '#f97316',
      risk: 'Review carefully',
      warningText: 'Maximum mode makes bold editorial choices — structure, emphasis, and positioning will be significantly reworked. Always read the full output before submitting.',
    },
  ];

  const [selected, setSelected] = useState('authentic');
  const active = modes.find(m => m.id === selected)!;

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#1B2B4B]"/>
            <span className="text-sm font-bold text-zinc-800 tracking-tight">Writing Style</span>
          </div>
          <p className="text-xs text-zinc-400">Choose how your CV is written. Your facts never change.</p>
        </div>

        {/* Mode cards */}
        <div className="space-y-2.5 mb-4">
          {modes.map((mode) => {
            const isSel = selected === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setSelected(mode.id)}
                className="w-full text-left rounded-xl border-2 overflow-hidden transition-all duration-200 cursor-pointer"
                style={{
                  borderColor: isSel ? mode.border : '#e5e7eb',
                  background: isSel ? mode.bg : '#fff',
                  boxShadow: isSel ? `0 0 0 1px ${mode.border}20` : 'none',
                }}
              >
                <div className="flex items-stretch">
                  {/* Accent bar */}
                  <div className="w-1 flex-shrink-0 rounded-l" style={{ background: isSel ? mode.bar : '#e5e7eb' }} />

                  <div className="flex items-center gap-3.5 px-4 py-3 flex-1 min-w-0">
                    {/* Intensity dots */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {[3, 2, 1].map(bar => (
                        <div
                          key={bar}
                          className="w-2 h-2 rounded-full transition-colors"
                          style={{
                            background: bar <= mode.intensity
                              ? (isSel ? mode.bar : '#d1d5db')
                              : '#f3f4f6',
                          }}
                        />
                      ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base leading-none">{mode.emoji}</span>
                        <span className="text-sm font-bold" style={{ color: isSel ? mode.text : '#1f2937' }}>
                          {mode.label}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: isSel ? mode.badge : '#f3f4f6', color: isSel ? mode.text : '#6b7280' }}>
                          {mode.shortDesc}
                        </span>
                        {mode.risk && (
                          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: isSel ? mode.badge : '#f3f4f6', color: isSel ? mode.text : '#6b7280' }}>
                            ⚠ {mode.risk}
                          </span>
                        )}
                        {isSel && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: mode.badge, color: mode.text }}>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1 leading-relaxed"
                        style={{ color: isSel ? mode.text : '#6b7280', opacity: isSel ? 0.85 : 1 }}>
                        {mode.description}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Warning for enhanced/maximum */}
        {active.warningText && (
          <div className="p-3 rounded-lg border flex items-start gap-2.5 text-xs"
            style={{
              background: active.bg,
              borderColor: active.border + '40',
              color: active.text,
            }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <span>{active.warningText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
