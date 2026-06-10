import React from 'react';

interface WelcomeModalProps {
  name: string;
  email: string;
  onClose: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ name, email, onClose }) => {
  const displayName = name?.split(' ')[0] || email?.split('@')[0] || 'there';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#fff' }}
      >
        {/* Top accent band */}
        <div style={{ background: '#1B2B4B', padding: '28px 32px 24px' }}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center rounded-xl font-black text-sm"
              style={{ width: 36, height: 36, background: '#EBFF38', color: '#111', letterSpacing: '-0.04em' }}
            >
              CV
            </div>
            <span style={{ color: '#C9A84C', fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em' }}>
              ProCV
            </span>
          </div>
          <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Welcome, {displayName}! 👋
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: '8px 0 0', lineHeight: 1.5 }}>
            Your ProCV account is ready.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 32px 28px' }}>
          {/* Email pill */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6 text-xs font-bold"
            style={{ background: '#F8F7F4', color: '#555', border: '1px solid #e5e2d8' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            {email}
          </div>

          {/* What's unlocked */}
          <div className="space-y-3 mb-6">
            {[
              { icon: '✦', label: 'AI CV generation — tailored to any job' },
              { icon: '✦', label: 'ATS score & keyword gap analysis' },
              { icon: '✦', label: 'Interview prep, cover letters & more' },
              { icon: '✦', label: 'Your data stays in your browser' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span style={{ color: '#C9A84C', fontSize: 12, marginTop: 2, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 14, color: '#333', lineHeight: 1.4 }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl font-black text-base transition-transform hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: '#1B2B4B', color: '#fff', letterSpacing: '-0.02em' }}
          >
            Set up my profile →
          </button>

          <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', margin: '12px 0 0' }}>
            Your CV data never leaves your browser unless you choose to sync.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
