import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Scene 3 — Fill Your Profile Once (10s)
// Animated profile form mockup — shows the sections being filled
export function Scene3(_props: object) {
  const [ph, setPh] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [typedName, setTypedName] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const fullName  = 'Sarah Johnson';
  const fullTitle = 'Senior Product Manager';

  useEffect(() => {
    const tt = [
      setTimeout(() => setPh(1), 150),
      setTimeout(() => setPh(2), 900),
      // type name
      ...Array.from(fullName).map((_, i) =>
        setTimeout(() => setTypedName(fullName.slice(0, i + 1)), 1200 + i * 65)
      ),
      // type title
      ...Array.from(fullTitle).map((_, i) =>
        setTimeout(() => setTypedTitle(fullTitle.slice(0, i + 1)), 2300 + i * 55)
      ),
      setTimeout(() => setPh(3), 3800),
      setTimeout(() => { setPh(4); setActiveTab(1); }, 5200),
      setTimeout(() => { setPh(5); setActiveTab(2); }, 7000),
      setTimeout(() => setPh(6), 8500),
    ];
    return () => tt.forEach(clearTimeout);
  }, []);

  const tabs = ['Personal', 'Experience', 'Education', 'Skills', 'Projects'];

  const expRows = [
    { company: 'Shopify', role: 'Lead PM — Checkout', years: '2021–present' },
    { company: 'Monzo', role: 'Product Manager', years: '2018–2021' },
  ];

  const skills = ['Product Strategy', 'A/B Testing', 'SQL', 'Figma', 'Python', 'Roadmapping', 'Agile', 'OKRs'];

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center px-[6vw]"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left — headline */}
      <motion.div className="flex flex-col gap-[1.5vh] mr-[4vw]" style={{ width: '28vw', flexShrink: 0 }}
        initial={{ opacity: 0, x: -30 }}
        animate={ph >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
        transition={{ duration: 0.7 }}
      >
        <div className="flex items-center gap-[0.8vw] mb-[0.5vh]">
          <div style={{ width: '0.25vw', height: '3vh', background: '#EBFF38', borderRadius: '2px' }} />
          <span style={{ fontSize: '0.85vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, letterSpacing: '0.12em' }}>
            STEP 1
          </span>
        </div>
        <h2 style={{ fontSize: '3.2vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}>
          Fill your<br /><span style={{ color: '#EBFF38' }}>profile</span><br />once.
        </h2>
        <p style={{ fontSize: '1vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, maxWidth: '24vw' }}>
          Add your details across 5 sections. ProCV uses them to tailor every CV automatically.
        </p>
        <motion.div className="flex flex-col gap-[0.8vh] mt-[1vh]"
          initial={{ opacity: 0 }} animate={ph >= 6 ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.6 }}>
          {['Personal Info & Photo', 'Work Experience', 'Education & Certifications', 'Skills & Languages', 'Projects & Achievements'].map((s, i) => (
            <div key={i} className="flex items-center gap-[0.6vw]">
              <span style={{ color: '#EBFF38', fontSize: '0.85vw' }}>✓</span>
              <span style={{ fontSize: '0.88vw', color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif' }}>{s}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Right — form mockup */}
      <motion.div
        style={{
          width: '44vw', borderRadius: '1.2vw',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
        }}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={ph >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.96 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 180, damping: 18 }}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-[0.5vw] px-[1.4vw] py-[1.2vh]"
          style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', background: '#ff5f57' }} />
          <div className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', background: '#febc2e' }} />
          <div className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', background: '#28c840' }} />
          <span className="ml-[1vw]" style={{ fontSize: '0.7vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}>
            ProCV — Your Profile
          </span>
        </div>

        {/* Tabs */}
        <div className="flex px-[1.4vw] pt-[1.2vh] gap-[0.3vw]"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {tabs.map((t, i) => (
            <div key={i}
              className="px-[0.9vw] py-[0.6vh] rounded-t-lg text-[0.72vw] font-semibold"
              style={{
                color: activeTab === i ? '#EBFF38' : 'rgba(255,255,255,0.35)',
                borderBottom: activeTab === i ? '2px solid #EBFF38' : '2px solid transparent',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'all 0.3s ease',
              }}
            >{t}</div>
          ))}
        </div>

        {/* Form content */}
        <div className="px-[1.8vw] py-[1.8vh]" style={{ minHeight: '28vh' }}>
          <AnimatePresence mode="wait">
            {activeTab === 0 && (
              <motion.div key="personal" className="flex flex-col gap-[1.4vh]"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}>
                {/* Photo + name row */}
                <div className="flex items-center gap-[1.2vw]">
                  <div style={{ width: '4vw', height: '4vw', borderRadius: '50%', background: 'linear-gradient(135deg, #EBFF38, #C9A84C)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.8vw' }}>👩</span>
                  </div>
                  <div className="flex flex-col gap-[0.4vh] flex-1">
                    <FieldLabel>Full Name</FieldLabel>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '0.4vw', padding: '0.5vh 0.8vw', border: '1px solid rgba(235,255,56,0.3)' }}>
                      <span style={{ fontSize: '0.88vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif' }}>
                        {typedName}<motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }} style={{ color: '#EBFF38' }}>|</motion.span>
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <FieldLabel>Job Title</FieldLabel>
                  <FieldBox>{typedTitle}<motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }} style={{ color: '#EBFF38' }}>|</motion.span></FieldBox>
                </div>
                <div className="flex gap-[1vw]">
                  <div className="flex-1">
                    <FieldLabel>Location</FieldLabel>
                    <FieldBox>London, UK</FieldBox>
                  </div>
                  <div className="flex-1">
                    <FieldLabel>Industry</FieldLabel>
                    <FieldBox>Product & Tech</FieldBox>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 1 && (
              <motion.div key="exp" className="flex flex-col gap-[1.2vh]"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}>
                <p style={{ fontSize: '0.78vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.4vh' }}>
                  Work Experience
                </p>
                {expRows.map((r, i) => (
                  <motion.div key={i} className="rounded-xl px-[1.2vw] py-[1vh]"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: '0.88vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>{r.role}</span>
                      <span style={{ fontSize: '0.75vw', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}>{r.years}</span>
                    </div>
                    <span style={{ fontSize: '0.78vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}>{r.company}</span>
                  </motion.div>
                ))}
                <div className="flex items-center gap-[0.5vw] mt-[0.4vh] cursor-pointer">
                  <span style={{ fontSize: '1.1vw', color: '#EBFF38' }}>＋</span>
                  <span style={{ fontSize: '0.78vw', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}>Add another role</span>
                </div>
              </motion.div>
            )}

            {activeTab === 2 && (
              <motion.div key="edu" className="flex flex-col gap-[1.2vh]"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}>
                <p style={{ fontSize: '0.78vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.4vh' }}>
                  Skills — click to add
                </p>
                <div className="flex flex-wrap gap-[0.5vw]">
                  {skills.map((s, i) => (
                    <motion.span key={s}
                      className="px-[0.9vw] py-[0.4vh] rounded-full text-[0.78vw] font-semibold"
                      style={{ background: 'rgba(235,255,56,0.1)', border: '1px solid rgba(235,255,56,0.25)', color: '#EBFF38', fontFamily: 'DM Sans, sans-serif' }}
                      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 20 }}
                    >{s}</motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '0.7vw', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.3vh', fontWeight: 600 }}>{children}</p>;
}
function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '0.4vw', padding: '0.5vh 0.8vw', border: '1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ fontSize: '0.88vw', color: '#F8F7F4', fontFamily: 'DM Sans, sans-serif' }}>{children}</span>
    </div>
  );
}
