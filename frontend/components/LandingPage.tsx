import React, { useState, useEffect, useRef } from 'react';

interface Props {
  onGetStarted: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  hasProfile?: boolean;
  onGoToApp?: () => void;
}

const Y = '#EBFF38';

/* ─── Mini CV template mockups ──────────────────────────────────────────── */
const CVMockupPro = ({ scale = 1 }: { scale?: number }) => (
  <div style={{
    width: 160 * scale, height: 220 * scale, borderRadius: 8 * scale, overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)', background: '#fff', flexShrink: 0,
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{ background: '#1B2B4B', padding: `${14*scale}px ${12*scale}px ${10*scale}px` }}>
      <div style={{ width: 60*scale, height: 6*scale, background: '#fff', borderRadius: 2*scale, marginBottom: 5*scale }} />
      <div style={{ width: 40*scale, height: 4*scale, background: 'rgba(255,255,255,0.4)', borderRadius: 2*scale }} />
    </div>
    <div style={{ padding: `${10*scale}px ${12*scale}px`, flex: 1 }}>
      <div style={{ width: 50*scale, height: 3*scale, background: '#1B2B4B', borderRadius: 1*scale, marginBottom: 6*scale }} />
      {[90,70,80,60,75].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 4*scale }} />
      ))}
      <div style={{ width: 50*scale, height: 3*scale, background: '#1B2B4B', borderRadius: 1*scale, margin: `${8*scale}px 0 ${6*scale}px` }} />
      {[85,65,90].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 4*scale }} />
      ))}
      <div style={{ display: 'flex', gap: 3*scale, marginTop: 8*scale, flexWrap: 'wrap' }}>
        {[30,38,26,34].map((w,i) => (
          <div key={i} style={{ width: w*scale, height: 10*scale, background: '#e2e8f0', borderRadius: 3*scale }} />
        ))}
      </div>
    </div>
  </div>
);

const CVMockupSidebar = ({ scale = 1 }: { scale?: number }) => (
  <div style={{
    width: 160 * scale, height: 220 * scale, borderRadius: 8 * scale, overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)', background: '#fff', flexShrink: 0,
    display: 'flex',
  }}>
    <div style={{ width: 52*scale, background: '#2d3a4a', padding: `${12*scale}px ${8*scale}px`, display: 'flex', flexDirection: 'column', gap: 6*scale }}>
      <div style={{ width: 32*scale, height: 32*scale, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', margin: '0 auto', marginBottom: 4*scale }} />
      <div style={{ width: '80%', height: 3*scale, background: 'rgba(255,255,255,0.5)', borderRadius: 1*scale }} />
      <div style={{ width: '60%', height: 2.5*scale, background: 'rgba(255,255,255,0.25)', borderRadius: 1*scale }} />
      <div style={{ height: 6*scale }} />
      {[70,55,65,50,60].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: 'rgba(255,255,255,0.2)', borderRadius: 1*scale }} />
      ))}
    </div>
    <div style={{ flex: 1, padding: `${12*scale}px ${8*scale}px` }}>
      <div style={{ width: '70%', height: 3*scale, background: '#2d3a4a', borderRadius: 1*scale, marginBottom: 6*scale }} />
      {[90,70,80,65].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 4*scale }} />
      ))}
      <div style={{ width: '70%', height: 3*scale, background: '#2d3a4a', borderRadius: 1*scale, margin: `${8*scale}px 0 ${5*scale}px` }} />
      {[85,70,90,60].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 4*scale }} />
      ))}
    </div>
  </div>
);

const CVMockupModern = ({ scale = 1 }: { scale?: number }) => (
  <div style={{
    width: 160 * scale, height: 220 * scale, borderRadius: 8 * scale, overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)', background: '#fff', flexShrink: 0,
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{ height: 6*scale, background: Y }} />
    <div style={{ padding: `${12*scale}px ${12*scale}px` }}>
      <div style={{ width: 70*scale, height: 7*scale, background: '#111', borderRadius: 2*scale, marginBottom: 3*scale }} />
      <div style={{ display: 'flex', gap: 4*scale, marginBottom: 10*scale }}>
        {[32,28,36].map((w,i) => (
          <div key={i} style={{ width: w*scale, height: 3*scale, background: '#ccc', borderRadius: 1*scale }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2*scale, marginBottom: 8*scale, flexWrap: 'wrap' }}>
        {[28,22,32,26,20].map((w,i) => (
          <div key={i} style={{ width: w*scale, height: 8*scale, background: '#f1f5f9', borderRadius: 3*scale, border: '1px solid #e2e8f0' }} />
        ))}
      </div>
      <div style={{ width: 40*scale, height: 3*scale, background: Y, borderRadius: 1*scale, marginBottom: 5*scale }} />
      {[90,70,80,65,75].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 3.5*scale }} />
      ))}
      <div style={{ width: 40*scale, height: 3*scale, background: Y, borderRadius: 1*scale, margin: `${7*scale}px 0 ${5*scale}px` }} />
      {[85,70,90].map((w,i) => (
        <div key={i} style={{ width: `${w}%`, height: 2.5*scale, background: '#e2e8f0', borderRadius: 1*scale, marginBottom: 3.5*scale }} />
      ))}
    </div>
  </div>
);

/* ─── ATS gauge ──────────────────────────────────────────────────────────── */
const AtsGauge = ({ score, size = 56 }: { score: number; size?: number }) => {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const color = score >= 85 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#33333333" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${circ * score / 100} ${circ * (1 - score / 100)}`}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="900" fontFamily="system-ui">
        {score}
      </text>
    </svg>
  );
};

/* ─── Data ────────────────────────────────────────────────────────────────── */
const fiveThings = [
  {
    icon: '✦',
    title: '14 tools.\nOne profile.',
    body: 'Fill your profile once. CV Generator, Interview Prep, Portal Scanner, Negotiation Coach — all 14 tools use the same data, automatically.',
  },
  {
    icon: '⬆',
    title: 'ATS score:\n31 → 94',
    body: 'ProCV analyses the job description, finds the keywords missing from your CV, and pins them into the output — beating most ATS filters before you hit send.',
  },
  {
    icon: '◈',
    title: '35 CV templates',
    body: 'Professional, modern, creative, academic, sidebar, and compact designs. Every template generates a pixel-perfect PDF that matches the on-screen preview exactly.',
  },
  {
    icon: '⊙',
    title: '150+ portals.\nOne click.',
    body: 'The Portal Scanner hits Greenhouse, Ashby, Lever, and 150+ direct career pages in seconds. No tab-switching, no bookmark juggling.',
  },
  {
    icon: '◐',
    title: 'Fully private.\nFree forever.',
    body: 'Everything stays in your browser. No account, no server, no subscription. Your data is never uploaded, tracked, or sold. All 14 tools, always free.',
  },
];

const beforeAfterCases = [
  {
    role: 'Product Manager',
    tag: 'Fintech → FAANG',
    before: { score: 31, bullets: ['Managed product roadmap and worked with engineers', 'Helped improve customer satisfaction metrics', 'Ran sprint planning and stakeholder meetings'] },
    after: { score: 94, bullets: ['Owned end-to-end roadmap for payments product serving 2.4M users; shipped 18 features in 12 months', 'Increased NPS 34 → 71 by restructuring onboarding — reduced drop-off 41%', 'Led squad of 11 through 0→1 launch — £6.2M ARR in year one'] },
  },
  {
    role: 'Software Engineer',
    tag: 'Agency → Stripe',
    before: { score: 44, bullets: ['Built features using React and Node.js', 'Fixed bugs and improved performance', 'Participated in code reviews and agile ceremonies'] },
    after: { score: 97, bullets: ['Engineered real-time bidding engine in TypeScript — reduced P99 latency 340ms → 42ms at 80K RPS', 'Migrated monolith → 12 microservices; cut CI pipeline 22 min → 4.5 min', 'Automated E2E suite (94% coverage) — reduced production incidents 67% YoY'] },
  },
  {
    role: 'Marketing Director',
    tag: 'SME → Fortune 500',
    before: { score: 27, bullets: ['Led marketing team and managed campaigns', 'Worked with agencies and internal stakeholders', 'Responsible for brand and content strategy'] },
    after: { score: 91, bullets: ['Scaled performance budget £180K → £2.4M; delivered 340% ROI across paid channels', 'Built 14-person team — reduced CAC 38% while doubling acquisition volume', 'Launched rebrand across 6 markets — 62% increase in aided brand awareness (Nielsen n=4,200)'] },
  },
];

const testimonials = [
  { name: 'James O.', role: 'Product Manager', company: 'HSBC', avatar: 'JO', color: '#C40000', metric: '38 → 91 ATS', quote: 'Got a call from HSBC within 48 hours. I\'d applied to the same role six months earlier and heard nothing. The only thing that changed was the CV.' },
  { name: 'Kwame A.', role: 'Software Engineer', company: 'Amazon', avatar: 'KA', color: '#FF9900', metric: 'Interview in 2 weeks', quote: 'The CV Toolkit flagged every weak bullet I\'d written for years. The before/after is embarrassing. Landed Amazon interviews within two weeks of rewriting.' },
  { name: 'Elena K.', role: 'Finance Analyst', company: 'Goldman Sachs', avatar: 'EK', color: '#6EC6F5', metric: '+23% salary', quote: 'The Negotiation Coach gave me the exact counter-offer script. I asked for 23% above the initial offer and they accepted immediately. Paid off instantly.' },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
const LandingPage: React.FC<Props> = ({ onGetStarted, darkMode, onToggleDark, hasProfile, onGoToApp }) => {
  const [ready, setReady] = useState(false);
  const [activeCase, setActiveCase] = useState(0);
  const [vis, setVis] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => { const t = setTimeout(() => setReady(true), 40); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setVis(p => new Set([...p, e.target.getAttribute('data-s') || ''])); });
    }, { threshold: 0.08 });
    Object.values(refs.current).forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [ready]);
  const reg = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };
  const v = (id: string) => vis.has(id);

  /* Fully theme-aware tokens — NO hardcoded dark backgrounds */
  const bg        = darkMode ? '#0d0d0d'        : '#f7f5f0';
  const surface   = darkMode ? '#161616'        : '#ffffff';
  const elevated  = darkMode ? '#1c1c1c'        : '#eeeae0';
  const border    = darkMode ? '#2a2a2a'        : '#d9d5c8';
  const text      = darkMode ? '#f0ece0'        : '#111111';
  const muted     = darkMode ? '#888888'        : '#555555';
  const faint     = darkMode ? '#444444'        : '#aaaaaa';
  const invert    = darkMode ? '#f0ece0'        : '#111111'; /* text on yellow CTA */

  const ac = beforeAfterCases[activeCase];

  return (
    <div style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.4s', background: bg, color: text, fontFamily: 'system-ui,-apple-system,sans-serif', minHeight: '100vh' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: darkMode ? 'rgba(13,13,13,0.9)' : 'rgba(247,245,240,0.9)',
        backdropFilter: 'blur(20px)', borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: Y, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#111' }}>CV</div>
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em' }}>ProCV</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onToggleDark} style={{ padding: 8, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: muted }}>
              {darkMode
                ? <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {hasProfile && onGoToApp && (
              <button onClick={onGoToApp} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, background: elevated, border: `1px solid ${border}`, cursor: 'pointer', color: muted }}>
                ← App
              </button>
            )}
            <button onClick={onGetStarted} style={{ padding: '7px 18px', fontSize: 13, fontWeight: 900, borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111', letterSpacing: '-0.01em' }}>
              {hasProfile ? 'Open Suite' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 56, alignItems: 'center' }}>

        {/* Left copy */}
        <div>
          <div style={{ display: 'inline-block', background: '#111', color: Y, fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', padding: '4px 10px', marginBottom: 24 }}>
            Your Personal Career Consultant
          </div>

          <h1 style={{ fontSize: 'clamp(2.8rem,6.5vw,5rem)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', margin: '0 0 20px' }}>
            Your CV.<br />ATS-ready.<br />
            <span style={{ background: Y, color: '#111', padding: '2px 6px' }}>In minutes.</span>
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.65, color: muted, maxWidth: 440, margin: '0 0 32px' }}>
            ProCV is a 14-tool career suite — ATS-optimised CVs, interview prep, job search, and salary negotiation — built entirely in your browser. No account. No server. Free forever.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
            {['No signup', 'No cloud', 'Free forever', 'Open source'].map(c => (
              <span key={c} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 99, background: elevated, border: `1px solid ${border}`, color: muted }}>{c}</span>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={onGetStarted} style={{ padding: '13px 28px', fontSize: 14, fontWeight: 900, borderRadius: 10, background: Y, border: 'none', cursor: 'pointer', color: '#111', letterSpacing: '-0.01em', transition: 'transform 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              {hasProfile ? 'Open Suite →' : 'Build my CV — free →'}
            </button>
            <button onClick={onGetStarted} style={{ padding: '13px 28px', fontSize: 14, fontWeight: 600, borderRadius: 10, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>
              See all 14 tools
            </button>
          </div>
        </div>

        {/* Right: CV template fan */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: 260 }}>
          {/* Background card */}
          <div style={{ position: 'absolute', transform: 'rotate(-8deg) translate(-60px, 20px)', opacity: 0.7, zIndex: 1 }}>
            <CVMockupSidebar scale={1.15} />
          </div>
          <div style={{ position: 'absolute', transform: 'rotate(6deg) translate(60px, 15px)', opacity: 0.7, zIndex: 1 }}>
            <CVMockupModern scale={1.15} />
          </div>
          {/* Front card */}
          <div style={{ position: 'relative', zIndex: 2, transform: 'rotate(-1deg)' }}>
            <CVMockupPro scale={1.5} />
            {/* ATS badge */}
            <div style={{
              position: 'absolute', bottom: -12, right: -16, background: surface,
              border: `1px solid ${border}`, borderRadius: 12, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            }}>
              <AtsGauge score={94} size={36} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#22c55e' }}>ATS Score</div>
                <div style={{ fontSize: 9, color: muted }}>Stripe · PM role</div>
              </div>
            </div>
            {/* Tools badge */}
            <div style={{
              position: 'absolute', top: -14, left: -20, background: Y,
              borderRadius: 10, padding: '6px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#111' }}>14 tools</div>
              <div style={{ fontSize: 9, color: '#444' }}>one profile</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee ──────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, overflow: 'hidden', padding: '11px 0' }}>
        <div style={{ display: 'flex', gap: 40, whiteSpace: 'nowrap', width: 'max-content', animation: 'marquee 22s linear infinite' }}>
          {['CV Generator','LinkedIn Optimizer','Interview Prep','Portal Scanner','Job Board','CV Toolkit','Negotiation Coach','Email Apply','App Tracker','Scholarship Essays','PDF Merger','Analytics','Profile Manager','Cloud Backup',
            'CV Generator','LinkedIn Optimizer','Interview Prep','Portal Scanner','Job Board','CV Toolkit','Negotiation Coach','Email Apply','App Tracker','Scholarship Essays','PDF Merger','Analytics','Profile Manager','Cloud Backup'].map((t, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: muted, display: 'inline-flex', alignItems: 'center', gap: 16 }}>
              {t}
              {i % 7 === 3 && <span style={{ color: Y, fontSize: 15, background: '#111', padding: '1px 4px', borderRadius: 3 }}>✦</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── 5 Things ─────────────────────────────────────────────────────── */}
      <section
        ref={reg('five')} data-s="five"
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '72px 24px',
          opacity: v('five') ? 1 : 0, transform: v('five') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
            Everything you need.<br />Nothing you don't.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 2, background: border }}>
          {fiveThings.map((f, i) => (
            <div key={i}
              style={{ background: bg, padding: '28px 24px', cursor: 'pointer', transition: 'background 0.15s' }}
              onClick={onGetStarted}
              onMouseEnter={e => (e.currentTarget.style.background = elevated)}
              onMouseLeave={e => (e.currentTarget.style.background = bg)}>
              <div style={{ fontSize: 22, marginBottom: 14, color: darkMode ? Y : '#111' }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px', whiteSpace: 'pre-line', lineHeight: 1.25 }}>{f.title}</h3>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: muted, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CV Templates strip ────────────────────────────────────────────── */}
      <div style={{ background: elevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '40px 0', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto 28px', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 6 }}>35 Templates</p>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>Every template.<br />Pixel-perfect PDF.</h2>
          </div>
          <button onClick={onGetStarted} style={{ fontSize: 12, fontWeight: 700, padding: '9px 18px', borderRadius: 8, background: 'transparent', border: `1.5px solid ${border}`, cursor: 'pointer', color: muted }}>
            Browse templates →
          </button>
        </div>

        {/* Horizontal scrolling CV cards */}
        <div style={{ display: 'flex', gap: 20, paddingLeft: 24, paddingRight: 24, maxWidth: 1100, margin: '0 auto', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Standard Pro', comp: <CVMockupPro scale={0.95} /> },
            { label: 'Navy Sidebar', comp: <CVMockupSidebar scale={0.95} /> },
            { label: 'Modern Minimal', comp: <CVMockupModern scale={0.95} /> },
            { label: 'SWE Elite', comp: <CVMockupPro scale={0.95} /> },
            { label: 'Executive Bold', comp: <CVMockupSidebar scale={0.95} /> },
          ].map(({ label, comp }, i) => (
            <div key={i} onClick={onGetStarted} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', transition: 'transform 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
              {comp}
              <span style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Before / After ───────────────────────────────────────────────── */}
      <section
        ref={reg('ba')} data-s="ba"
        style={{
          maxWidth: 1100, margin: '0 auto', padding: '72px 24px',
          opacity: v('ba') ? 1 : 0, transform: v('ba') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ marginBottom: 44 }}>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>Real results</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
              From overlooked<br />to interview-ready.
            </h2>
            {/* Case tabs */}
            <div style={{ display: 'flex', gap: 6 }}>
              {beforeAfterCases.map((c, i) => (
                <button key={i} onClick={() => setActiveCase(i)} style={{
                  fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                  background: activeCase === i ? Y : elevated,
                  color: activeCase === i ? '#111' : muted,
                  border: `1px solid ${activeCase === i ? Y : border}`,
                }}>
                  {c.role}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>

          {/* BEFORE */}
          <div style={{ padding: 24, borderRadius: 16, background: surface, border: `1.5px solid #ef444430` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444430' }}>Before</span>
                <p style={{ fontSize: 11, color: muted, marginTop: 6 }}>{ac.role} · {ac.tag}</p>
              </div>
              <AtsGauge score={ac.before.score} size={52} />
            </div>
            <div style={{ padding: '16px', borderRadius: 10, background: elevated, border: `1px solid ${border}` }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: faint, marginBottom: 10 }}>Experience bullets</p>
              {ac.before.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: '#ef4444', fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: muted, margin: 0 }}>{b}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: elevated, overflow: 'hidden' }}>
                <div style={{ width: `${ac.before.score}%`, height: '100%', background: '#ef4444', borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#ef4444' }}>{ac.before.score}/100</span>
            </div>
          </div>

          {/* AFTER */}
          <div style={{ padding: 24, borderRadius: 16, background: surface, border: `1.5px solid ${Y}66` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4, background: Y + '33', color: darkMode ? Y : '#7a6800', border: `1px solid ${Y}66` }}>After ProCV</span>
                <p style={{ fontSize: 11, color: muted, marginTop: 6 }}>{ac.role} · Generated in {activeCase === 1 ? '3' : activeCase === 2 ? '5' : '4'} min</p>
              </div>
              <AtsGauge score={ac.after.score} size={52} />
            </div>
            <div style={{ padding: '16px', borderRadius: 10, background: elevated, border: `1px solid ${Y}44` }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: faint, marginBottom: 10 }}>Experience bullets</p>
              {ac.after.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: '#22c55e', fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: text, margin: 0 }}>{b}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: elevated, overflow: 'hidden' }}>
                <div style={{ width: `${ac.after.score}%`, height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#22c55e' }}>{ac.after.score}/100</span>
            </div>
          </div>
        </div>

        {/* Delta callout */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 20, padding: '16px 28px', borderRadius: 16, background: surface, border: `1px solid ${border}` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444', letterSpacing: '-0.04em' }}>{ac.before.score}</div>
              <div style={{ fontSize: 10, color: faint }}>before</div>
            </div>
            <div style={{ fontSize: 20, color: faint }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e', letterSpacing: '-0.04em' }}>{ac.after.score}</div>
              <div style={{ fontSize: 10, color: faint }}>after</div>
            </div>
            <div style={{ width: 1, height: 36, background: border, margin: '0 4px' }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em' }}>+{ac.after.score - ac.before.score} pts</div>
              <div style={{ fontSize: 11, color: muted }}>{ac.role}</div>
            </div>
            <button onClick={onGetStarted} style={{ marginLeft: 8, padding: '8px 18px', fontSize: 12, fontWeight: 900, borderRadius: 8, background: Y, border: 'none', cursor: 'pointer', color: '#111' }}>
              Score mine →
            </button>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section
        ref={reg('t')} data-s="t"
        style={{
          background: elevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`,
          padding: '64px 24px',
          opacity: v('t') ? 1 : 0, transform: v('t') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: faint, marginBottom: 8 }}>What people say</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Real people. Real offers.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {testimonials.map((t, i) => (
              <div key={i} style={{ padding: '24px', borderRadius: 16, background: surface, border: `1px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#fff', flexShrink: 0 }}>{t.avatar}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: muted }}>{t.role} · {t.company}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: '4px 8px', borderRadius: 6, background: Y + '33', color: darkMode ? Y : '#7a6800', border: `1px solid ${Y}55`, flexShrink: 0 }}>{t.metric}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: muted, margin: '0 0 14px' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[...Array(5)].map((_, si) => (
                    <svg key={si} width={12} height={12} viewBox="0 0 12 12" fill={Y}><path d="M6 1l1.5 3 3.2.5-2.35 2.25.55 3.2L6 8.5l-2.9 1.45.55-3.2L1.3 4.5l3.2-.5z"/></svg>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section
        ref={reg('cta')} data-s="cta"
        style={{
          padding: '96px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          opacity: v('cta') ? 1 : 0, transform: v('cta') ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.5s, transform 0.5s',
        }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 60% at 50% 110%, ${Y}20 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 600, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-block', background: '#111', color: Y, fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', padding: '4px 10px', marginBottom: 24 }}>
            Ready when you are
          </div>
          <h2 style={{ fontSize: 'clamp(2.4rem,6vw,4rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 18px' }}>
            The job doesn't wait.<br />Neither should you.
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: muted, margin: '0 0 36px' }}>
            Fill your profile once. Every tool is ready immediately.<br />No tutorial. No credit card. No signup.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <button onClick={onGetStarted} style={{ padding: '15px 40px', fontSize: 15, fontWeight: 900, borderRadius: 12, background: Y, border: 'none', cursor: 'pointer', color: '#111', letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              {hasProfile ? 'Go to Suite' : 'Build my CV — free'}
              <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: faint }}>No signup · No credit card · No cloud</span>
          </div>
          <div style={{ marginTop: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: faint, marginBottom: 16 }}>Used to land roles at</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 32px' }}>
              {['Google', 'Amazon', 'Stripe', 'HSBC', 'Goldman Sachs', 'Revolut', 'Spotify', 'Deliveroo'].map(co => (
                <span key={co} style={{ fontSize: 12, fontWeight: 900, color: faint, letterSpacing: '-0.01em' }}>{co}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${border}`, background: elevated, padding: '36px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 24, height: 24, background: Y, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, color: '#111' }}>CV</div>
            <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: '-0.02em' }}>ProCV</span>
            <span style={{ fontSize: 12, color: faint }}>· Your Personal Career Consultant</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {['CV Generator', 'Interview Prep', 'Portal Scanner', 'Negotiation Coach', 'Job Board'].map(n => (
              <button key={n} onClick={onGetStarted} style={{ fontSize: 12, color: muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{n}</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: faint, margin: 0 }}>© 2025 ProCV · Built free. Always.</p>
        </div>
      </footer>

      <style>{`
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
};

export default LandingPage;
