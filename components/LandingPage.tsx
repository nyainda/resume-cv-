import React, { useState, useEffect, useRef } from 'react';

interface Props {
  onGetStarted: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  hasProfile?: boolean;
  onGoToApp?: () => void;
}

const tools = [
  { n: '01', name: 'CV Generator',       icon: '✦', desc: 'Tailors every CV to the exact job — keywords, tone, structure — tuned to beat any screening system.' },
  { n: '02', name: 'Portal Scanner',      icon: '⊙', desc: '150+ company portals scanned in one click. Greenhouse, Ashby, Lever, and direct career pages.' },
  { n: '03', name: 'Job Board',           icon: '◈', desc: 'Live job listings filtered by role and location. Curated signal, no noise.' },
  { n: '04', name: 'CV Toolkit',          icon: '◎', desc: 'Deep analysis of your CV — weak bullet points flagged, compatibility scored, rewrite suggestions ready.' },
  { n: '05', name: 'Scholarship Essays',  icon: '◇', desc: 'Personal statements and funding essays tailored to each institution\'s values, written with your voice.' },
  { n: '06', name: 'Negotiation Coach',   icon: '▲', desc: 'Market-rate data, counter-offer scripts, and walk-away strategies for every salary conversation.' },
  { n: '07', name: 'Email Apply',         icon: '▷', desc: 'One-click application emails — pulled from your profile and the job description, ready to send.' },
  { n: '08', name: 'Application Tracker', icon: '⬡', desc: 'Kanban pipeline for every role you\'ve applied to. Interviews, follow-ups, deadlines — never missed.' },
  { n: '09', name: 'Analytics',           icon: '◉', desc: 'Application velocity, response rates, and story coverage — your job search quantified.' },
  { n: '10', name: 'PDF Merger',          icon: '⬢', desc: 'Combine CV, cover letter, and portfolio into a single clean document in seconds.' },
  { n: '11', name: 'Profile Manager',     icon: '◑', desc: 'Multiple career identities — switch between software, design, finance — with full data separation.' },
  { n: '12', name: 'Cloud Backup',        icon: '◐', desc: 'Your data stays in your browser by default. Link Google Drive for optional encrypted backup.' },
];

const guarantees = [
  { label: 'No server storage',         detail: 'Everything lives in your browser. Nothing is ever uploaded without your consent.' },
  { label: 'Your keys, your calls',     detail: 'Bring your own API keys. We never touch them, proxy them, or store them server-side.' },
  { label: 'No tracking, no analytics', detail: 'Zero telemetry. No session recordings, no event logging, no ad pixels.' },
  { label: 'Free forever',              detail: 'No subscription, no paywall, no freemium bait-and-switch.' },
];

const steps = [
  { n: '01', title: 'Fill your profile once', body: 'Enter your experience, skills, and career goals. Every tool in the suite reads from this single source of truth.' },
  { n: '02', title: 'Pick a tool & a job',    body: 'Target a specific role. The CV Generator, Email Apply, and ATS Toolkit all tailor their output to that exact job description.' },
  { n: '03', title: 'Export & apply',         body: 'Download a pixel-perfect PDF, send the pre-drafted email, or track the application in your pipeline — all in seconds.' },
];

const templates = [
  'Standard Pro', 'Executive Bold', 'SWE Elite', 'Modern Minimal', 'Academic Classic',
  'Creative Director', 'Medical Standard', 'Legal Scholar', 'Finance Quant', 'Startup Founder',
  'Scholarship Pro', 'Data Scientist', 'Product Manager', 'UX Designer', 'Research Fellow',
  'Consulting Pro', 'Teacher & Educator', 'Nonprofit Leader', 'Journalist', 'Architect',
  'Operations Lead', 'Sales Hunter', 'Embedded Engineer', 'Biotech Researcher', 'Military Transition',
];

const featureCards = [
  { label: 'ATS Score',   value: '94 / 100', sub: 'Senior Software Engineer at Stripe', accent: true },
  { label: 'Jobs Found',  value: '247',       sub: 'matching your profile right now',   accent: false },
  { label: 'Time Saved',  value: '~4 hrs',    sub: 'per application on average',        accent: false },
];

const LandingPage: React.FC<Props> = ({ onGetStarted, darkMode, onToggleDark, hasProfile, onGoToApp }) => {
  const [ready, setReady] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setVisibleSections(prev => new Set([...prev, e.target.getAttribute('data-section') || '']));
          }
        });
      },
      { threshold: 0.12 }
    );
    Object.values(sectionRefs.current).forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [ready]);

  const reg = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  const vis = (id: string) => visibleSections.has(id);

  const bg   = darkMode ? '#0c0c0c' : '#f5f2eb';
  const bg2  = darkMode ? '#111'    : '#edeae0';
  const bg3  = darkMode ? '#161616' : '#e8e4d9';
  const text = darkMode ? '#f0ece0' : '#111111';
  const muted = darkMode ? '#666' : '#888';
  const border = darkMode ? '#222' : '#ddd9cf';
  const card  = darkMode ? '#161616' : '#edeae1';
  const Y = '#EBFF38';

  return (
    <div
      className="min-h-screen transition-opacity duration-500"
      style={{ opacity: ready ? 1 : 0, background: bg, color: text, fontFamily: "'system-ui', '-apple-system', sans-serif" }}
    >

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30"
        style={{ background: darkMode ? 'rgba(12,12,12,0.92)' : 'rgba(245,242,235,0.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${border}` }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 flex items-center justify-center font-black text-sm" style={{ background: Y, color: '#111', borderRadius: 4 }}>C</div>
            <span className="font-black tracking-tight text-sm" style={{ letterSpacing: '-0.02em' }}>Career Suite</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onToggleDark} className="p-2 rounded-lg transition-colors" style={{ color: muted }}>
              {darkMode
                ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              }
            </button>
            {hasProfile && onGoToApp && (
              <button onClick={onGoToApp} className="px-4 py-1.5 text-sm font-bold rounded-lg transition-colors"
                style={{ background: bg3, color: darkMode ? '#ccc' : '#444' }}>← Back to App</button>
            )}
            <button onClick={onGetStarted} className="px-4 py-1.5 text-sm font-black rounded-lg transition-all hover:scale-105"
              style={{ background: Y, color: '#111', letterSpacing: '-0.01em' }}>
              {hasProfile ? 'Open Suite' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-20 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left */}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] mb-6"
              style={{ color: Y, background: '#111', display: 'inline-block', padding: '4px 10px' }}>
              The complete career suite
            </p>
            <h1 className="font-black leading-none mb-6"
              style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', letterSpacing: '-0.04em' }}>
              Your career.<br />Your terms.<br />
              <span style={{ color: Y, WebkitTextStroke: darkMode ? '0' : '1px #111' }}>Fully private.</span>
            </h1>
            <p className="text-base leading-relaxed max-w-md mb-8" style={{ color: muted }}>
              Twelve AI-powered tools for building CVs, finding jobs, tracking applications, and negotiating offers —
              without ever giving up your data. No accounts. No subscriptions.
            </p>

            {/* Trust chips */}
            <div className="flex flex-wrap gap-2 mb-10">
              {['No signup', 'No cloud', '0€ forever', 'Open source'].map(chip => (
                <span key={chip} className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ background: bg2, color: muted, border: `1px solid ${border}` }}>
                  {chip}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={onGetStarted}
                className="px-6 py-3 font-black text-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: Y, color: '#111', borderRadius: 8, letterSpacing: '-0.01em' }}>
                {hasProfile ? 'Open Suite →' : 'Start for free →'}
              </button>
              <button onClick={onGetStarted}
                className="px-6 py-3 font-bold text-sm transition-all hover:opacity-70"
                style={{ background: 'transparent', color: darkMode ? '#ccc' : '#444', border: `1.5px solid ${border}`, borderRadius: 8 }}>
                See all 12 tools
              </button>
            </div>
          </div>

          {/* Right: animated feature cards */}
          <div className="relative lg:pt-4 flex flex-col gap-3">
            {/* Big stat card */}
            <div className="p-7 relative overflow-hidden" style={{ background: card, borderRadius: 16 }}>
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${Y}33 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: muted }}>Portals Scanned</p>
              <div className="font-black leading-none" style={{ fontSize: 'clamp(4rem, 10vw, 7rem)', letterSpacing: '-0.06em', color: Y }}>150+</div>
              <p className="font-bold text-sm mt-2" style={{ color: muted }}>company career portals in one click</p>
            </div>

            {/* Feature cards row */}
            <div className="grid grid-cols-3 gap-3">
              {featureCards.map(fc => (
                <div key={fc.label} className="p-4 flex flex-col justify-between" style={{ background: card, borderRadius: 12, minHeight: 90 }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: muted }}>{fc.label}</p>
                  <div className="font-black text-xl leading-none" style={{ letterSpacing: '-0.04em', color: fc.accent ? Y : text }}>{fc.value}</div>
                  <p className="text-[10px] mt-1.5 leading-snug" style={{ color: muted }}>{fc.sub}</p>
                </div>
              ))}
            </div>

            {/* Floating pill */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 self-end" style={{ background: '#111', borderRadius: 999 }}>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-bold text-white">Data never leaves your browser</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee ticker ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden py-3" style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <div className="flex gap-8 whitespace-nowrap animate-[marquee_24s_linear_infinite]" style={{ width: 'max-content' }}>
          {[...tools, ...tools, ...tools].map((t, i) => (
            <span key={i} className="text-xs font-bold uppercase tracking-[0.15em] inline-flex items-center gap-4"
              style={{ color: muted }}>
              {t.name}
              <span style={{ color: Y, fontSize: 16 }}>{t.icon}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Template showcase strip ──────────────────────────────────────────── */}
      <div className="overflow-hidden py-4" style={{ borderBottom: `1px solid ${border}`, background: bg2 }}>
        <div className="flex gap-3 whitespace-nowrap animate-[marquee_35s_linear_infinite_reverse]" style={{ width: 'max-content' }}>
          {[...templates, ...templates, ...templates].map((name, i) => (
            <span key={i}
              className="text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full"
              style={{ background: i % 5 === 0 ? Y : bg3, color: i % 5 === 0 ? '#111' : muted, border: `1px solid ${border}` }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* ── Tools grid ──────────────────────────────────────────────────────── */}
      <section
        ref={reg('tools')}
        data-section="tools"
        className="max-w-7xl mx-auto px-6 lg:px-10 py-20"
        style={{ opacity: vis('tools') ? 1 : 0, transform: vis('tools') ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <h2 className="font-black leading-none" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.04em' }}>
            The full suite
          </h2>
          <p className="text-sm max-w-xs" style={{ color: muted }}>Every tool works together. Your data flows between them automatically.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: border }}>
          {tools.map((t, idx) => (
            <div
              key={t.n}
              className="group p-6 cursor-pointer"
              style={{
                background: bg,
                transition: 'background 0.15s ease',
                transitionDelay: `${idx * 30}ms`,
              }}
              onClick={onGetStarted}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = card; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = bg; }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg leading-none" style={{ color: Y }}>{t.icon}</span>
                  <span className="font-black text-[10px] uppercase tracking-widest" style={{ color: darkMode ? '#444' : '#bbb' }}>{t.n}</span>
                </div>
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all -rotate-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  style={{ color: muted }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              <h3 className="font-black text-base mb-2" style={{ letterSpacing: '-0.02em' }}>{t.name}</h3>
              <p className="text-xs leading-relaxed" style={{ color: muted }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section
        ref={reg('how')}
        data-section="how"
        className="px-6 lg:px-10 py-20"
        style={{
          background: bg2,
          borderTop: `1px solid ${border}`,
          borderBottom: `1px solid ${border}`,
          opacity: vis('how') ? 1 : 0,
          transform: vis('how') ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{ color: Y, background: '#111', display: 'inline-block', padding: '3px 10px' }}>
              How it works
            </p>
            <h2 className="font-black leading-none" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.04em' }}>
              Up and running in minutes.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={s.n} className="relative p-7" style={{ background: bg, borderRadius: 16, border: `1px solid ${border}` }}>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 -right-3 z-10">
                    <div className="w-6 h-0.5" style={{ background: Y }} />
                  </div>
                )}
                <div className="font-black text-4xl leading-none mb-5" style={{ color: Y, letterSpacing: '-0.06em' }}>{s.n}</div>
                <h3 className="font-black text-base mb-2" style={{ letterSpacing: '-0.02em' }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: muted }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────────── */}
      <section
        ref={reg('privacy')}
        data-section="privacy"
        className="px-6 lg:px-10 py-20"
        style={{
          background: '#111111',
          color: '#f0ece0',
          opacity: vis('privacy') ? 1 : 0,
          transform: vis('privacy') ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] mb-6" style={{ color: Y }}>Built different</p>
              <h2 className="font-black mb-6 leading-none" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', letterSpacing: '-0.04em' }}>
                Your data stays<br />where it belongs.<br />
                <span style={{ color: Y }}>With you.</span>
              </h2>
              <p className="text-sm leading-relaxed max-w-sm mb-8" style={{ color: '#666' }}>
                Every CV, every application, every API key — stored in your browser.
                Not on our servers, not in a database, not anywhere we can see or sell.
              </p>

              {/* Fake code snippet */}
              <div className="mb-8 p-4 font-mono text-xs leading-6 rounded-xl overflow-x-auto"
                style={{ background: '#0c0c0c', border: '1px solid #222', color: '#888' }}>
                <span style={{ color: '#555' }}>// your data, in your browser</span><br />
                <span style={{ color: '#EBFF38' }}>localStorage</span>
                <span style={{ color: '#888' }}>.</span>
                <span style={{ color: '#aaa' }}>getItem</span>
                <span style={{ color: '#888' }}>('cv_profile')<br /></span>
                <span style={{ color: '#555' }}>// → stored only here, never sent</span>
              </div>

              <button onClick={onGetStarted}
                className="px-6 py-3 font-black text-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: Y, color: '#111', borderRadius: 8 }}>
                {hasProfile ? 'Open Suite →' : 'Start for free →'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {guarantees.map(g => (
                <div key={g.label} className="p-5 flex gap-4 items-start group transition-colors"
                  style={{ background: '#1a1a1a', borderRadius: 12, border: '1px solid #222' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = Y + '55'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#222'; }}>
                  <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full mt-0.5" style={{ background: Y }}>
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

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section
        ref={reg('cta')}
        data-section="cta"
        className="px-6 lg:px-10 py-28 text-center relative overflow-hidden"
        style={{
          background: bg,
          opacity: vis('cta') ? 1 : 0,
          transform: vis('cta') ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        {/* Decorative glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 100%, ${Y}18 0%, transparent 70%)`,
        }} />

        <div className="max-w-3xl mx-auto relative z-10">
          <p className="text-xs font-black uppercase tracking-[0.25em] mb-6" style={{ color: Y, background: '#111', display: 'inline-block', padding: '4px 10px' }}>
            Ready when you are
          </p>
          <h2 className="font-black mb-6 leading-none"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', letterSpacing: '-0.04em', lineHeight: 1.05 }}>
            The job doesn't wait.<br />Neither should you.
          </h2>
          <p className="text-sm mb-10 max-w-md mx-auto" style={{ color: muted }}>
            Set up your profile once. Every tool in the suite is ready immediately. No tutorial, no onboarding, no credit card.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onGetStarted}
              className="px-10 py-4 font-black text-base transition-all hover:scale-105 active:scale-95 inline-flex items-center gap-2"
              style={{ background: Y, color: '#111', borderRadius: 10, letterSpacing: '-0.02em' }}>
              {hasProfile ? 'Go to Suite' : 'Build your CV — free'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </button>
            <span className="text-xs font-bold" style={{ color: darkMode ? '#444' : '#aaa' }}>No signup required</span>
          </div>

          {/* Social logos row — placeholder trust row */}
          <p className="mt-14 text-xs font-bold uppercase tracking-widest mb-4" style={{ color: darkMode ? '#333' : '#ccc' }}>
            Works with applications at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {['Google', 'Amazon', 'Meta', 'Stripe', 'Airbnb', 'Shopify', 'Notion', 'Figma'].map(co => (
              <span key={co} className="text-xs font-black tracking-tight" style={{ color: darkMode ? '#333' : '#ccc' }}>{co}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-6 lg:px-10 py-10"
        style={{ borderTop: `1px solid ${border}`, background: darkMode ? '#0c0c0c' : '#edeae0' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-6 h-6 font-black text-xs flex items-center justify-center" style={{ background: Y, color: '#111', borderRadius: 4 }}>C</div>
                <span className="font-black text-sm" style={{ letterSpacing: '-0.02em' }}>Career Suite</span>
              </div>
              <p className="text-xs max-w-xs" style={{ color: muted }}>A private-first, AI-powered toolkit for every stage of your job search.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-10 gap-y-2">
              {[['CV Generator', 'CV Toolkit', 'PDF Merger'], ['Portal Scanner', 'Job Board', 'Email Apply'], ['Negotiation Coach', 'Analytics', 'Cloud Backup'], ['Profile Manager', 'App Tracker', 'Scholarship']].map((col, ci) => (
                <div key={ci} className="flex flex-col gap-2">
                  {col.map(name => (
                    <button key={name} onClick={onGetStarted}
                      className="text-xs text-left transition-colors hover:opacity-100"
                      style={{ color: muted }}>
                      {name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-6" style={{ borderTop: `1px solid ${border}` }}>
            <p className="text-xs" style={{ color: darkMode ? '#333' : '#bbb9b0' }}>No servers touched your data. It all stays in your browser.</p>
            <p className="text-xs font-bold" style={{ color: darkMode ? '#333' : '#bbb9b0' }}>Built with care. Offered free.</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
        @keyframes marquee-reverse {
          from { transform: translateX(-33.333%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
