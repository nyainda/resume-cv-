import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 7 — Share Your Profile (10s)
export function Scene7(_props: object) {
  const [ph, setPh] = useState(0);
  const [typedSlug, setTypedSlug] = useState('');
  const [copied, setCopied] = useState(false);
  const slug = 'sarah-johnson-pm';

  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 200),
      setTimeout(() => setPh(2), 1000),
      ...Array.from(slug).map((_, i) =>
        setTimeout(() => setTypedSlug(slug.slice(0, i + 1)), 1500 + i * 80)
      ),
      setTimeout(() => setPh(3), 3200),
      setTimeout(() => setPh(4), 4500),
      setTimeout(() => { setPh(5); setCopied(true); }, 6000),
      setTimeout(() => setPh(6), 7500),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const shareFeatures = [
    { icon: '🔗', title: 'Shareable Link', body: 'One-click share — works on any device, no app needed' },
    { icon: '👤', title: 'Public Profile', body: 'Custom URL like procv.app/p/sarah-johnson — always live' },
    { icon: '🚫', title: 'No Sign-up Required', body: 'Recruiters open your CV instantly, no account needed' },
    { icon: '⏱️', title: 'Controlled Access', body: 'Set expiry dates or revoke access at any time' },
  ];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center px-[6vw]"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left headline */}
      <motion.div className="flex flex-col gap-[1.5vh] mr-[4vw]" style={{ width: '30vw', flexShrink: 0 }}
        initial={{ opacity: 0, x: -20 }} animate={ph >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.7 }}>
        <div className="flex items-center gap-[0.8vw]">
          <div style={{ width: '0.25vw', height: '3vh', background: '#EBFF38', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.85vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.12em' }}>SHARE PROFILE</span>
        </div>
        <h2 style={{ fontSize: '3.2vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          Share your<br /><span style={{ color: '#EBFF38' }}>CV</span> with<br />one link.
        </h2>
        <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxWidth: '26vw' }}>
          Generate a public link or custom profile URL. Recruiters see a beautiful, live version of your CV — no account required.
        </p>

        {/* Feature list */}
        <div className="flex flex-col gap-[1vh] mt-[1vh]">
          {shareFeatures.map((f, i) => (
            <motion.div key={i} className="flex items-start gap-[0.8vw]"
              initial={{ opacity: 0, x: -10 }} animate={ph >= 4 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}>
              <span style={{ fontSize: '1.1vw', flexShrink: 0, lineHeight: 1.4 }}>{f.icon}</span>
              <div>
                <span style={{ fontSize: '0.85vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>{f.title} </span>
                <span style={{ fontSize: '0.8vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}>— {f.body}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Right — share UI mockup */}
      <motion.div
        style={{
          width: '42vw', borderRadius: '1.2vw',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)', overflow: 'hidden',
        }}
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={ph >= 2 ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.7, type: 'spring', stiffness: 180, damping: 18 }}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-[0.5vw] px-[1.4vw] py-[1vh]"
          style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="rounded-full" style={{ width: '0.65vw', height: '0.65vw', background: '#ff5f57' }} />
          <div className="rounded-full" style={{ width: '0.65vw', height: '0.65vw', background: '#febc2e' }} />
          <div className="rounded-full" style={{ width: '0.65vw', height: '0.65vw', background: '#28c840' }} />
          <span className="ml-[1vw]" style={{ fontSize: '0.7vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}>
            Share Your CV
          </span>
        </div>

        <div className="px-[1.8vw] py-[1.8vh] flex flex-col gap-[1.4vh]">

          {/* CV Thumbnail */}
          <motion.div className="flex items-center gap-[1.2vw] px-[1.2vw] py-[1.2vh] rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.5 }}>
            {/* Mini CV thumb */}
            <div style={{ width: '3.5vw', height: '4.5vw', borderRadius: '0.4vw', background: 'linear-gradient(135deg, #1a1a2e, #0f172a)', border: '1px solid rgba(235,255,56,0.2)', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '3px 4px', gap: '2px' }}>
              <div style={{ width: '70%', height: '4px', background: '#EBFF38', borderRadius: '1px' }} />
              <div style={{ width: '50%', height: '2px', background: 'rgba(255,255,255,0.3)', borderRadius: '1px' }} />
              {[65,80,55,70].map((w, i) => (
                <div key={i} style={{ width: `${w}%`, height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: '1px' }} />
              ))}
            </div>
            <div>
              <p style={{ fontSize: '0.9vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>Sarah Johnson</p>
              <p style={{ fontSize: '0.75vw', color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans, sans-serif' }}>Senior Product Manager</p>
              <p style={{ fontSize: '0.65vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', marginTop: '0.3vh' }}>Executive Template</p>
            </div>
          </motion.div>

          {/* Custom slug */}
          <motion.div initial={{ opacity: 0 }} animate={ph >= 2 ? { opacity: 1 } : {}} transition={{ duration: 0.5, delay: 0.2 }}>
            <p style={{ fontSize: '0.72vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.4vh', fontWeight: 600 }}>
              Custom Profile URL
            </p>
            <div className="flex items-center rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(235,255,56,0.3)', background: 'rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.8vw', color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans, sans-serif', padding: '0.6vh 0.8vw', background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                procv.app/p/
              </span>
              <span style={{ fontSize: '0.88vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', padding: '0.6vh 0.8vw', flex: 1 }}>
                {typedSlug}<motion.span animate={{ opacity: [1,0,1] }} transition={{ duration: 0.7, repeat: Infinity }} style={{ color: '#EBFF38' }}>|</motion.span>
              </span>
            </div>
          </motion.div>

          {/* Short share link */}
          <AnimatePresence>
            {ph >= 3 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                <p style={{ fontSize: '0.72vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.4vh', fontWeight: 600 }}>
                  Short Share Link
                </p>
                <div className="flex items-center gap-[0.6vw]">
                  <div className="flex items-center gap-[0.6vw] flex-1 rounded-lg px-[0.9vw] py-[0.6vh]"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '0.75vw' }}>🔗</span>
                    <span style={{ fontSize: '0.8vw', color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif' }}>
                      procv.app/s/xK9mP2
                    </span>
                  </div>
                  <motion.div
                    className="px-[0.9vw] py-[0.6vh] rounded-lg cursor-pointer"
                    style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(235,255,56,0.12)', border: copied ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(235,255,56,0.3)', transition: 'all 0.4s ease' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span style={{ fontSize: '0.78vw', color: copied ? '#86efac' : '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
                      {copied ? '✓ Copied!' : 'Copy'}
                    </span>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Share buttons */}
          <AnimatePresence>
            {ph >= 4 && (
              <motion.div className="flex gap-[0.7vw]"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                {[
                  { label: '📧 Email', color: '#60a5fa' },
                  { label: '💼 LinkedIn', color: '#0077b5' },
                  { label: '📱 WhatsApp', color: '#25D366' },
                  { label: '🖨️ Print / PDF', color: 'rgba(255,255,255,0.5)' },
                ].map((b, i) => (
                  <div key={i} className="px-[0.8vw] py-[0.5vh] rounded-lg text-[0.72vw] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: b.color, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>
                    {b.label}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* No sign-up note */}
          <AnimatePresence>
            {ph >= 5 && (
              <motion.p
                style={{ fontSize: '0.78vw', color: 'rgba(235,255,56,0.6)', fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
                ✓ No sign-up required for viewers · works on any device
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
