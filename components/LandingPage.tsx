import React, { useState, useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const features = [
  {
    icon: '✦',
    color: 'from-indigo-500 to-violet-600',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-100 dark:border-indigo-900/40',
    title: 'AI CV Generator',
    desc: 'Tailors your CV to any job description in seconds. Injects ATS-optimised keywords invisibly for maximum screening pass-through.',
  },
  {
    icon: '⊕',
    color: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-100 dark:border-emerald-900/40',
    title: 'Job Portal Scanner',
    desc: 'Scan 150+ company career portals — Greenhouse, Ashby, Lever, and direct sites — for your target role in one click.',
  },
  {
    icon: '◈',
    color: 'from-sky-500 to-blue-600',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    border: 'border-sky-100 dark:border-sky-900/40',
    title: 'Job Board',
    desc: 'Search live job listings powered by AI. Filter by role, location, and company type with smart relevance ranking.',
  },
  {
    icon: '◉',
    color: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'border-violet-100 dark:border-violet-900/40',
    title: 'CV Toolkit',
    desc: 'AI-powered analysis of your CV — identifies weaknesses, rewrites bullet points, and scores ATS compatibility.',
  },
  {
    icon: '⟡',
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-100 dark:border-amber-900/40',
    title: 'Scholarship Essays',
    desc: 'Generate compelling personal statements and scholarship essays tailored to each institution\'s values and prompts.',
  },
  {
    icon: '◎',
    color: 'from-rose-500 to-pink-600',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    border: 'border-rose-100 dark:border-rose-900/40',
    title: 'Negotiation Coach',
    desc: 'AI-powered salary negotiation scripts, counter-offer strategies, and market rate benchmarking for your role.',
  },
  {
    icon: '⬡',
    color: 'from-cyan-500 to-sky-600',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-100 dark:border-cyan-900/40',
    title: 'Email Apply',
    desc: 'Compose personalised job application emails with AI — auto-filled with your CV data and the job description.',
  },
  {
    icon: '⌘',
    color: 'from-teal-500 to-emerald-600',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'border-teal-100 dark:border-teal-900/40',
    title: 'Job Tracker',
    desc: 'Track every application, interview stage, and follow-up in a Kanban-style dashboard. Never lose track of a lead.',
  },
  {
    icon: '◭',
    color: 'from-fuchsia-500 to-violet-600',
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
    border: 'border-fuchsia-100 dark:border-fuchsia-900/40',
    title: 'Analytics Dashboard',
    desc: 'Visualise your job search performance — application rates, response rates, and STAR story coverage.',
  },
  {
    icon: '⊞',
    color: 'from-orange-500 to-red-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-100 dark:border-orange-900/40',
    title: 'PDF Merger',
    desc: 'Merge multiple PDFs — CV, cover letter, portfolio — into a single polished document ready for upload.',
  },
  {
    icon: '❖',
    color: 'from-lime-500 to-green-600',
    bg: 'bg-lime-50 dark:bg-lime-900/20',
    border: 'border-lime-100 dark:border-lime-900/40',
    title: 'Multi-Profile Manager',
    desc: 'Maintain separate profiles for different career tracks. Switch between them instantly with full data isolation.',
  },
  {
    icon: '☁',
    color: 'from-slate-500 to-zinc-600',
    bg: 'bg-slate-50 dark:bg-slate-900/20',
    border: 'border-slate-100 dark:border-slate-900/40',
    title: 'Cloud Sync',
    desc: 'Sync all your data to Google Drive automatically. Your profile, CVs, and applications are always backed up.',
  },
];

const stats = [
  { value: '150+', label: 'Company portals scanned' },
  { value: '20+', label: 'CV templates' },
  { value: '100%', label: 'Private — all data stays in your browser' },
  { value: '0', label: 'Subscriptions required' },
];

const portals = [
  { name: 'Greenhouse', color: 'bg-emerald-500', count: '70+' },
  { name: 'Ashby', color: 'bg-violet-500', count: '25+' },
  { name: 'Lever', color: 'bg-blue-500', count: '20+' },
  { name: 'Direct', color: 'bg-zinc-400', count: '35+' },
];

const LandingPage: React.FC<Props> = ({ onGetStarted, darkMode, onToggleDark }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`min-h-screen bg-white dark:bg-neutral-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 ${visible ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>

      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-zinc-100 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-50">AI CV Builder</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition"
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
              )}
            </button>
            <button
              onClick={onGetStarted}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition shadow-sm"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20 px-4">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-indigo-100 dark:bg-indigo-950/60 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-violet-100 dark:bg-violet-950/60 rounded-full blur-3xl opacity-50" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">AI-Powered · Privacy First · Free</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.05] mb-6">
            Land your dream job<br />
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
              faster with AI
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-10">
            The complete AI career suite. Generate ATS-optimised CVs, scan 150+ company portals, track applications, coach your negotiation — all from one place. Your data never leaves your browser.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onGetStarted}
              className="group px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-base font-extrabold rounded-2xl transition-all shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              Build Your CV Now
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </button>
            <button
              onClick={onGetStarted}
              className="px-8 py-4 bg-zinc-100 dark:bg-neutral-800 hover:bg-zinc-200 dark:hover:bg-neutral-700 text-zinc-700 dark:text-zinc-200 text-base font-bold rounded-2xl transition-all"
            >
              Explore Features →
            </button>
          </div>

          {/* Privacy note */}
          <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-600 flex items-center justify-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            No account needed · All data stays in your browser · Open Source
          </p>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <section className="border-y border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900 py-10 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {stats.map(s => (
            <div key={s.label}>
              <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{s.value}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Portal logos ─────────────────────────────────────────────────── */}
      <section className="py-12 px-4 text-center">
        <p className="text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-6">Scans portals powered by</p>
        <div className="flex flex-wrap justify-center gap-3">
          {portals.map(p => (
            <span key={p.name} className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-full text-sm font-bold text-zinc-700 dark:text-zinc-300">
              <span className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
              {p.name}
              <span className="text-xs font-medium text-zinc-400">{p.count} companies</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-zinc-50 dark:bg-neutral-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-zinc-50 mb-3">Everything you need to get hired</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">12 AI-powered tools working together in a single, privacy-first suite.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`group relative p-5 rounded-2xl border bg-white dark:bg-neutral-800 ${f.border} hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer`}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={onGetStarted}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white text-lg font-black mb-4 shadow-sm group-hover:scale-110 transition-transform`}>
                  {f.icon}
                </div>
                <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mb-1.5">{f.title}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{f.desc}</p>

                {/* Hover arrow */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy section ───────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-10 sm:p-14 text-white text-center shadow-2xl">
            {/* Decorative blobs */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-black/10 rounded-full translate-x-1/2 translate-y-1/2 blur-2xl" />

            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-6 text-3xl">🔒</div>
              <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight">Privacy by design</h2>
              <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
                Your API keys, profile data, CVs, and application history are stored exclusively in your browser.
                Nothing is sent to our servers. Use Google Drive sync if you want a cloud backup — fully optional and OAuth-secured.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mb-10">
                {['No server storage', 'Your API keys only', 'No analytics tracking', 'Optional Google Drive backup'].map(item => (
                  <span key={item} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-sm font-semibold">
                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    {item}
                  </span>
                ))}
              </div>
              <button
                onClick={onGetStarted}
                className="px-8 py-3.5 bg-white text-indigo-700 font-extrabold text-base rounded-2xl hover:bg-zinc-50 transition shadow-lg hover:-translate-y-0.5 hover:shadow-xl"
              >
                Start Building Your CV →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-100 dark:border-neutral-800 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">AI CV Builder</span>
            <span className="text-xs text-zinc-400">· Elite Career &amp; Scholarship Suite</span>
          </div>
          <p className="text-xs text-zinc-400">All data stored locally in your browser. Your privacy is guaranteed.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
