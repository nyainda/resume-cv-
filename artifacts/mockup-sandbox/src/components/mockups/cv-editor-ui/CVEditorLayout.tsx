import { useState } from 'react';

const NAV = '#1B2B4B';
const GOLD = '#C9A84C';
const BG = '#F8F7F4';

function ToolbarBtn({ icon, label, active, color }: { icon: string; label: string; active?: boolean; color?: string }) {
  return (
    <button className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all hover:bg-black/5 group">
      <span className="text-sm" style={{ filter: active ? 'none' : 'grayscale(0.5)' }}>{icon}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: active ? (color || NAV) : '#9ca3af' }}>{label}</span>
    </button>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-xs font-bold transition-all relative"
      style={{ color: active ? NAV : '#9ca3af' }}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: NAV }} />
      )}
    </button>
  );
}

export function CVEditorLayout() {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'score'>('preview');

  return (
    <div className="min-h-screen bg-zinc-100 font-sans flex flex-col" style={{ fontFamily: "'system-ui', '-apple-system', sans-serif" }}>

      {/* Top toolbar */}
      <div className="bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-4">

          {/* Left: Nav */}
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-2 pr-4 border-r border-zinc-200 mr-2">
              <div className="w-6 h-6 flex items-center justify-center font-black text-[10px] rounded" style={{ background: '#EBFF38', color: '#111' }}>CV</div>
              <span className="font-black text-xs tracking-tight text-zinc-800">ProCV</span>
            </div>
            <ToolbarBtn icon="👤" label="Profile" />
            <ToolbarBtn icon="⚡" label="Generate" active />
            <ToolbarBtn icon="🎨" label="Templates" />
            <ToolbarBtn icon="🔍" label="Jobs" />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-xs font-bold text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Saved CVs
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download PDF
            </button>
            <button className="px-3 py-1.5 text-xs font-black rounded-lg text-white transition-colors flex items-center gap-1.5"
              style={{ background: NAV }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 max-w-7xl mx-auto w-full gap-4 px-4 py-4">

        {/* Left panel: controls */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">

          {/* ATS Score card */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Match Score</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>Job CV</span>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-black leading-none" style={{ color: NAV }}>87</span>
              <span className="text-zinc-400 text-sm mb-1 font-bold">/100</span>
              <span className="ml-auto text-xs text-zinc-400">↑ 12 pts vs last</span>
            </div>
            {/* Score bar */}
            <div className="w-full bg-zinc-100 rounded-full h-2 mb-3">
              <div className="h-2 rounded-full" style={{ width: '87%', background: `linear-gradient(90deg, ${NAV}, ${GOLD})` }} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 text-center p-2 bg-zinc-50 rounded-lg">
                <div className="text-sm font-black text-zinc-800">14</div>
                <div className="text-[10px] text-zinc-400 font-semibold">Keywords hit</div>
              </div>
              <div className="flex-1 text-center p-2 rounded-lg" style={{ background: '#fff7ed' }}>
                <div className="text-sm font-black text-orange-600">3</div>
                <div className="text-[10px] text-orange-400 font-semibold">Gaps left</div>
              </div>
            </div>
          </div>

          {/* Writing style selector */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Writing Style</span>
            </div>
            <div className="space-y-1.5">
              {[
                { id: 'authentic', label: 'Authentic', desc: 'Your story, sharpened', active: false, color: '#059669', bg: '#ecfdf5' },
                { id: 'enhanced', label: 'Enhanced', desc: 'Stronger framing', active: true, color: '#2563eb', bg: '#eff6ff' },
                { id: 'maximum', label: 'Maximum', desc: 'Peak impact', active: false, color: '#ea580c', bg: '#fff7ed' },
              ].map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer"
                  style={{ borderColor: m.active ? m.color : '#e5e7eb', background: m.active ? m.bg : '#fff' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.active ? m.color : '#d1d5db' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold" style={{ color: m.active ? m.color : '#374151' }}>{m.label}</div>
                    <div className="text-[10px] text-zinc-400">{m.desc}</div>
                  </div>
                  {m.active && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick tools */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Quick Tools</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'CV Check', icon: '🔎', sub: 'ATS audit' },
                { label: 'Cover Letter', icon: '✉️', sub: 'Auto-draft' },
                { label: 'Interview Prep', icon: '🎯', sub: '10 Q&A' },
                { label: 'Quantify', icon: '📈', sub: 'Add numbers' },
              ].map(t => (
                <button key={t.label} className="flex items-start gap-2 p-2.5 rounded-lg border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50 transition-all text-left">
                  <span className="text-base">{t.icon}</span>
                  <div>
                    <div className="text-xs font-bold text-zinc-700">{t.label}</div>
                    <div className="text-[10px] text-zinc-400">{t.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Preview + tab bar */}
        <div className="flex-1 flex flex-col gap-0 min-w-0">
          {/* Tab bar */}
          <div className="bg-white rounded-t-xl border border-b-0 border-zinc-200 px-2 flex items-center justify-between">
            <div className="flex">
              <Tab label="Preview" active={activeTab === 'preview'} onClick={() => setActiveTab('preview')} />
              <Tab label="Edit Fields" active={activeTab === 'edit'} onClick={() => setActiveTab('edit')} />
              <Tab label="ATS Details" active={activeTab === 'score'} onClick={() => setActiveTab('score')} />
            </div>
            {/* Template + actions */}
            <div className="flex items-center gap-2 pr-2">
              <button className="text-[10px] font-bold text-zinc-500 px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-50 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>
                Templates
              </button>
              <button className="text-[10px] font-bold px-2 py-1 rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93L16.24 7.76M4.93 4.93L7.76 7.76M4.93 19.07L7.76 16.24M19.07 19.07L16.24 16.24"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>
                Colour
              </button>
            </div>
          </div>

          {/* CV Preview area */}
          <div className="flex-1 bg-white border border-zinc-200 rounded-b-xl overflow-hidden flex items-start justify-center" style={{ minHeight: 480, background: '#f1f0ec' }}>
            <div className="mt-6 mb-6 bg-white rounded shadow-lg" style={{ width: 400, minHeight: 540, padding: '24px 28px' }}>
              {/* Mock CV content */}
              <div className="border-b-2 pb-3 mb-4" style={{ borderColor: NAV }}>
                <div className="font-black text-xl text-zinc-900 mb-0.5">Alexandra Chen</div>
                <div className="text-xs text-zinc-500 font-semibold">Senior Product Manager · London, UK</div>
                <div className="text-xs text-zinc-400 mt-1">alex.chen@email.com · linkedin.com/in/alexchen</div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: NAV }}>Summary</div>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Product leader with 8 years driving B2B SaaS growth. Delivered $12M ARR increase at Monzo through data-led roadmap prioritisation and cross-functional alignment across 4 engineering teams.
                </p>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: NAV }}>Experience</div>
                <div className="mb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-zinc-800">Senior Product Manager</div>
                      <div className="text-[10px] text-zinc-500">Monzo Bank · London</div>
                    </div>
                    <div className="text-[10px] text-zinc-400">2021–Present</div>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {['Grew business accounts from 18K to 140K by leading 3 major feature launches', 'Reduced churn 34% via ML-driven early-warning dashboard (→ £2.4M saved annually)', 'Managed roadmap across 4 squads; coordinated 24 engineers and 3 designers'].map((b, i) => (
                      <li key={i} className="text-[9px] text-zinc-600 flex items-start gap-1.5">
                        <span className="mt-0.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: GOLD }}/>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-zinc-800">Product Manager</div>
                      <div className="text-[10px] text-zinc-500">Deliveroo · London</div>
                    </div>
                    <div className="text-[10px] text-zinc-400">2018–2021</div>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {['Launched rider earnings transparency feature used by 180K riders', 'Increased order completion rate 8% via checkout UX overhaul'].map((b, i) => (
                      <li key={i} className="text-[9px] text-zinc-600 flex items-start gap-1.5">
                        <span className="mt-0.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: GOLD }}/>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: NAV }}>Skills</div>
                <div className="flex flex-wrap gap-1">
                  {['Product Strategy', 'OKR Frameworks', 'SQL', 'Agile', 'A/B Testing', 'Figma', 'Roadmapping'].map(s => (
                    <span key={s} className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-semibold">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
