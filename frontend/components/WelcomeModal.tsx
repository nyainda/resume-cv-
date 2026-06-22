import React, { useState, useEffect } from 'react';

interface WelcomeModalProps {
  name: string | null | undefined;
  email: string | null | undefined;
  onClose: () => void;
}

const STEPS = [
  {
    num: '1',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    title: 'Build your profile',
    desc: 'Add your work history, skills and education. Paste your existing CV or fill it in — takes about 2 minutes.',
  },
  {
    num: '2',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
      </svg>
    ),
    title: 'Generate a tailored CV',
    desc: 'Paste any job description. ProCV matches your profile to the role and writes every bullet for you.',
  },
  {
    num: '3',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>
      </svg>
    ),
    title: 'Download & apply',
    desc: '35+ ATS-friendly templates. Download a pixel-perfect PDF in seconds — what you see is exactly what you get.',
  },
];

const WelcomeModal: React.FC<WelcomeModalProps> = ({ name, email, onClose }) => {
  const [visible, setVisible] = useState(false);
  const firstName = name?.split(' ')[0] || email?.split('@')[0] || 'there';
  const initial = (name || email || '?')[0].toUpperCase();

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl transition-all duration-500"
        style={{
          background: '#fff',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #243860 100%)', padding: '32px 32px 28px' }}
        >
          {/* decorative dots */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            {[
              { top: '10%', left: '80%', size: 120, opacity: 0.06 },
              { top: '55%', left: '5%',  size: 80,  opacity: 0.05 },
              { top: '-5%', left: '40%', size: 60,  opacity: 0.04 },
            ].map((d, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  top: d.top, left: d.left,
                  width: d.size, height: d.size,
                  background: '#C9A84C',
                  opacity: d.opacity,
                }}
              />
            ))}
          </div>

          <div className="relative flex items-center gap-3 mb-5">
            {/* ProCV badge */}
            <div
              className="flex items-center justify-center rounded-xl font-black text-sm shrink-0"
              style={{ width: 36, height: 36, background: '#EBFF38', color: '#111', letterSpacing: '-0.04em' }}
            >
              CV
            </div>
            <span style={{ color: '#C9A84C', fontWeight: 800, fontSize: 17, letterSpacing: '-0.03em' }}>
              ProCV
            </span>
            {/* "New account" pill */}
            <span
              className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(201,168,76,0.18)', color: '#C9A84C', letterSpacing: '-0.01em' }}
            >
              New account
            </span>
          </div>

          {/* Avatar + greeting */}
          <div className="relative flex items-center gap-4">
            <div
              className="flex items-center justify-center rounded-full font-black text-xl shrink-0 ring-2"
              style={{ width: 56, height: 56, background: '#C9A84C', color: '#1B2B4B', ringColor: 'rgba(201,168,76,0.3)' }}
            >
              {initial}
            </div>
            <div>
              <h2
                className="leading-tight"
                style={{ color: '#fff', fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}
              >
                Welcome, {firstName}! 🎉
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '4px 0 0', lineHeight: 1.4 }}>
                Your personal career consultant is ready.
              </p>
            </div>
          </div>

          {/* Email pill */}
          <div
            className="inline-flex items-center gap-2 rounded-full mt-4 px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            {email}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 32px 28px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#aaa', textTransform: 'uppercase', marginBottom: 14 }}>
            Your first 3 steps
          </p>

          <div className="space-y-3 mb-7">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex items-start gap-4 rounded-2xl p-4"
                style={{ background: '#F8F7F4', border: '1px solid #ede9df' }}
              >
                {/* Number badge */}
                <div
                  className="flex items-center justify-center rounded-xl shrink-0 font-black text-sm"
                  style={{ width: 36, height: 36, background: '#1B2B4B', color: '#C9A84C' }}
                >
                  {step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span style={{ color: '#1B2B4B' }}>{step.icon}</span>
                    <p style={{ fontWeight: 800, fontSize: 14, color: '#1B2B4B', margin: 0, letterSpacing: '-0.02em' }}>
                      {step.title}
                    </p>
                  </div>
                  <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.45 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl font-black text-base transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: '#1B2B4B', color: '#fff', letterSpacing: '-0.02em' }}
          >
            Set up my profile →
          </button>

          <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
            <button
              onClick={onClose}
              className="underline underline-offset-2 hover:text-zinc-500 transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#bbb' }}
            >
              I'll explore on my own
            </button>
            {' · '}Your CV data never leaves your browser unless you choose to sync.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
