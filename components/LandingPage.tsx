import React, { useState, useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  hasProfile?: boolean;
  onGoToApp?: () => void;
}

const tools = [
  { n: '01', name: 'CV Generator',       desc: 'Tailors every CV to the exact job — keywords, tone, structure — all tuned to beat any screening system.' },
  { n: '02', name: 'Portal Scanner',      desc: '150+ company portals scanned in one click. Greenhouse, Ashby, Lever, and direct career pages.' },
  { n: '03', name: 'Job Board',           desc: 'Live job listings filtered by role and location. Curated signal, no noise.' },
  { n: '04', name: 'CV Toolkit',          desc: 'Deep analysis of your CV — weak bullet points flagged, compatibility scored, rewrite suggestions ready.' },
  { n: '05', name: 'Scholarship Essays',  desc: 'Personal statements and funding essays tailored to each institution\'s values, written with your voice.' },
  { n: '06', name: 'Negotiation Coach',   desc: 'Market-rate data, counter-offer scripts, and walk-away strategies for every salary conversation.' },
  { n: '07', name: 'Email Apply',         desc: 'One-click application emails — pulled from your profile and the job description, ready to send.' },
  { n: '08', name: 'Application Tracker', desc: 'Kanban pipeline for every role you\'ve applied to. Interviews, follow-ups, deadlines — never missed.' },
  { n: '09', name: 'Analytics',           desc: 'Application velocity, response rates, and story coverage — your job search quantified.' },
  { n: '10', name: 'PDF Merger',          desc: 'Combine CV, cover letter, and portfolio into a single clean document in seconds.' },
  { n: '11', name: 'Profile Manager',     desc: 'Multiple career identities — switch between software, design, finance — with full data separation.' },
  { n: '12', name: 'Cloud Backup',        desc: 'Your data stays in your browser by default. Link Google Drive for optional encrypted backup.' },
];

const guarantees = [
  { label: 'No server storage',          detail: 'Everything lives in your browser. Nothing is ever uploaded without your consent.' },
  { label: 'Your keys, your calls',      detail: 'Bring your own API keys. We never touch them, proxy them, or store them server-side.' },
  { label: 'No tracking, no analytics',  detail: 'Zero telemetry. No session recordings, no event logging, no ad pixels.' },
  { label: 'Free forever',              detail: 'No subscription, no paywall, no freemium bait-and-switch.' },
];

const LandingPage: React.FC<Props> = ({ onGetStarted, darkMode, onToggleDark, hasProfile, onGoToApp }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen transition-opacity duration-500"
      style={{
        opacity: ready ? 1 : 0,
        background: darkMode ? '#0c0c0c' : '#f5f2eb',
        color: darkMode ? '#f0ece0' : '#111111',
        fontFamily: "'system-ui', '-apple-system', 'sans-serif'",
      }}
    >
      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: darkMode ? 'rgba(12,12,12,0.92)' : 'rgba(245,242,235,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${darkMode ? '#222' : '#ddd9cf'}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-14 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 flex items-center justify-center font-black text-sm"
              style={{ background: '#EBFF38', color: '#111', borderRadius: 4 }}
            >
              C
            </div>
            <span className="font-black tracking-tight text-sm" style={{ letterSpacing: '-0.02em' }}>
              Career Suite
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg transition-colors"
              style={{ color: darkMode ? '#aaa' : '#666' }}
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </button>

            {hasProfile && onGoToApp && (
              <button
                onClick={onGoToApp}
                className="px-4 py-1.5 text-sm font-bold rounded-lg transition-colors"
                style={{ background: darkMode ? '#1e1e1e' : '#e8e4db', color: darkMode ? '#ccc' : '#444' }}
              >
                ← Back to App
              </button>
            )}

            <button
              onClick={onGetStarted}
              className="px-4 py-1.5 text-sm font-black rounded-lg transition-all"
              style={{ background: '#EBFF38', color: '#111', letterSpacing: '-0.01em' }}
            >
              {hasProfile ? 'Open Suite' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-20 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: text */}
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.25em] mb-6"
              style={{ color: '#EBFF38', background: '#111', display: 'inline-block', padding: '4px 10px' }}
            >
              The complete career suite
            </p>
            <h1
              className="font-black leading-none mb-8"
              style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', letterSpacing: '-0.04em' }}
            >
              Your career.<br />Your terms.<br />
              <span style={{ color: '#EBFF38', WebkitTextStroke: darkMode ? '0' : '1px #111' }}>
                Fully private.
              </span>
            </h1>
            <p
              className="text-base leading-relaxed max-w-md mb-10"
              style={{ color: darkMode ? '#888' : '#555' }}
            >
              Twelve tools for building CVs, finding jobs, tracking applications, and negotiating offers — without ever giving up your data. No accounts. No subscriptions. No cloud unless you want it.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onGetStarted}
                className="px-6 py-3 font-black text-sm transition-all hover:scale-105"
                style={{ background: '#EBFF38', color: '#111', borderRadius: 8, letterSpacing: '-0.01em' }}
              >
                {hasProfile ? 'Open Suite →' : 'Start for free →'}
              </button>
              <button
                onClick={onGetStarted}
                className="px-6 py-3 font-bold text-sm transition-all"
                style={{
                  background: 'transparent',
                  color: darkMode ? '#ccc' : '#444',
                  border: `1.5px solid ${darkMode ? '#333' : '#ccc9bf'}`,
                  borderRadius: 8,
                }}
              >
                See all 12 tools
              </button>
            </div>
          </div>

          {/* Right: big number + breakdown */}
          <div className="lg:pt-4">
            {/* Big stat */}
            <div
              className="p-8 mb-4"
              style={{ background: darkMode ? '#161616' : '#edeae1', borderRadius: 16 }}
            >
              <div
                className="font-black leading-none mb-2"
                style={{ fontSize: 'clamp(5rem, 12vw, 9rem)', letterSpacing: '-0.06em', color: '#EBFF38' }}
              >
                150+
              </div>
              <p className="font-bold text-sm" style={{ color: darkMode ? '#666' : '#777' }}>
                company career portals scanned in one click
              </p>
            </div>

            {/* Three small stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: '12', l: 'tools' },
                { v: '20+', l: 'templates' },
                { v: '0€', l: 'cost' },
              ].map(s => (
                <div
                  key={s.l}
                  className="p-4 text-center"
                  style={{ background: darkMode ? '#161616' : '#edeae1', borderRadius: 12 }}
                >
                  <div className="font-black text-2xl" style={{ letterSpacing: '-0.04em' }}>{s.v}</div>
                  <div className="text-xs mt-0.5" style={{ color: darkMode ? '#555' : '#888' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker-style divider ────────────────────────────────────────────── */}
      <div
        className="overflow-hidden py-3"
        style={{ borderTop: `1px solid ${darkMode ? '#222' : '#ddd9cf'}`, borderBottom: `1px solid ${darkMode ? '#222' : '#ddd9cf'}` }}
      >
        <div className="flex gap-8 whitespace-nowrap animate-[marquee_20s_linear_infinite]" style={{ width: 'max-content' }}>
          {['CV Generator', 'Portal Scanner', 'Job Board', 'Negotiation Coach', 'Application Tracker', 'Scholarship Essays', 'Email Apply', 'Analytics', 'PDF Merger', 'Cloud Backup',
            'CV Generator', 'Portal Scanner', 'Job Board', 'Negotiation Coach', 'Application Tracker', 'Scholarship Essays', 'Email Apply', 'Analytics', 'PDF Merger', 'Cloud Backup',
            'CV Generator', 'Portal Scanner', 'Job Board', 'Negotiation Coach', 'Application Tracker', 'Scholarship Essays', 'Email Apply', 'Analytics', 'PDF Merger', 'Cloud Backup',
          ].map((t, i) => (
            <span
              key={i}
              className="text-xs font-bold uppercase tracking-[0.15em] inline-flex items-center gap-4"
              style={{ color: darkMode ? '#333' : '#bbb9b3' }}
            >
              {t}
              <span style={{ color: '#EBFF38', fontSize: 18 }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Tools list ─────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <h2
            className="font-black leading-none"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.04em' }}
          >
            The full suite
          </h2>
          <p className="text-sm max-w-xs" style={{ color: darkMode ? '#666' : '#888' }}>
            Every tool works together. Your data flows between them automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: darkMode ? '#222' : '#ddd9cf' }}>
          {tools.map((t) => (
            <div
              key={t.n}
              className="group p-6 cursor-pointer transition-colors"
              style={{ background: darkMode ? '#0c0c0c' : '#f5f2eb' }}
              onClick={onGetStarted}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = darkMode ? '#161616' : '#edeae1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = darkMode ? '#0c0c0c' : '#f5f2eb'; }}
            >
              <div className="flex items-start justify-between mb-4">
                <span
                  className="font-black text-xs"
                  style={{ color: '#EBFF38', fontVariantNumeric: 'tabular-nums' }}
                >
                  {t.n}
                </span>
                <svg
                  className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity -rotate-45"
                  style={{ color: darkMode ? '#555' : '#aaa' }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              <h3 className="font-black text-base mb-2" style={{ letterSpacing: '-0.02em' }}>{t.name}</h3>
              <p className="text-xs leading-relaxed" style={{ color: darkMode ? '#555' : '#888' }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy ────────────────────────────────────────────────────────── */}
      <section
        className="px-6 lg:px-10 py-20"
        style={{ background: darkMode ? '#111111' : '#111111', color: '#f0ece0' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.2em] mb-6"
                style={{ color: '#EBFF38' }}
              >
                Built different
              </p>
              <h2
                className="font-black mb-6 leading-none"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', letterSpacing: '-0.04em' }}
              >
                Your data stays<br />where it belongs.<br />
                <span style={{ color: '#EBFF38' }}>With you.</span>
              </h2>
              <p className="text-sm leading-relaxed max-w-sm mb-8" style={{ color: '#666' }}>
                Every CV, every application, every API key — all stored in your browser. Not on our servers, not in a database, not anywhere we can see or sell.
              </p>
              <button
                onClick={onGetStarted}
                className="px-6 py-3 font-black text-sm transition-all hover:scale-105"
                style={{ background: '#EBFF38', color: '#111', borderRadius: 8 }}
              >
                {hasProfile ? 'Open Suite →' : 'Start for free →'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {guarantees.map(g => (
                <div
                  key={g.label}
                  className="p-5 flex gap-4 items-start"
                  style={{ background: '#1a1a1a', borderRadius: 12 }}
                >
                  <div
                    className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full mt-0.5"
                    style={{ background: '#EBFF38' }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 12 10" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 5l3 3 7-7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-sm mb-0.5" style={{ color: '#f0ece0' }}>{g.label}</p>
                    <p className="text-xs" style={{ color: '#555' }}>{g.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section
        className="px-6 lg:px-10 py-24 text-center"
        style={{ background: darkMode ? '#0c0c0c' : '#f5f2eb' }}
      >
        <div className="max-w-3xl mx-auto">
          <h2
            className="font-black mb-6"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', letterSpacing: '-0.04em', lineHeight: 1.05 }}
          >
            The job doesn't wait.<br />Neither should you.
          </h2>
          <p className="text-sm mb-10 max-w-md mx-auto" style={{ color: darkMode ? '#666' : '#888' }}>
            Set up your profile once. Every tool in the suite is ready immediately. No tutorial, no onboarding, no credit card.
          </p>
          <button
            onClick={onGetStarted}
            className="px-10 py-4 font-black text-base transition-all hover:scale-105 inline-flex items-center gap-2"
            style={{ background: '#EBFF38', color: '#111', borderRadius: 10, letterSpacing: '-0.02em' }}
          >
            {hasProfile ? 'Go to Suite' : 'Build your CV — free'}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        className="px-6 lg:px-10 py-8"
        style={{
          borderTop: `1px solid ${darkMode ? '#1e1e1e' : '#ddd9cf'}`,
          background: darkMode ? '#0c0c0c' : '#f5f2eb',
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 font-black text-xs flex items-center justify-center" style={{ background: '#EBFF38', color: '#111', borderRadius: 4 }}>C</div>
            <span className="font-black text-sm" style={{ letterSpacing: '-0.02em' }}>Career Suite</span>
          </div>
          <p className="text-xs" style={{ color: darkMode ? '#444' : '#aaa8a0' }}>
            No servers touched your data. It all stays in your browser.
          </p>
        </div>
      </footer>

      {/* Marquee keyframe */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
