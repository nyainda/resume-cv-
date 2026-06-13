import React from 'react';
import { 
  CheckCircle2, 
  Star, 
  ChevronRight, 
  Check,
  Target,
  BarChart,
  User,
  Hash,
  FileText,
  Search,
  PenTool,
  ShieldCheck,
  Sparkles,
  Award,
  Briefcase,
  Mic,
  Lock,
  EyeOff,
  Trash2,
  Menu
} from 'lucide-react';

const COLORS = {
  navy: '#1B2B4B',
  gold: '#C9A84C',
  bg: '#F8F7F4',
  white: '#FFFFFF',
  mutedNavy: '#3A4B6B',
  border: '#E2DFD8'
};

const playfair = { fontFamily: "'Playfair Display', serif" };
const dmSans = { fontFamily: "'DM Sans', sans-serif" };

export default function Landing() {
  return (
    <div style={{ ...dmSans, backgroundColor: COLORS.bg, color: COLORS.navy, overflowX: 'hidden' }} className="min-h-screen">
      {/* 1. Navigation Bar */}
      <nav style={{ backgroundColor: COLORS.bg }} className="sticky top-0 z-50 border-b border-gray-200/50 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={playfair} className="text-2xl font-bold tracking-tight">ProCV</span>
            <div style={{ backgroundColor: COLORS.gold }} className="w-1.5 h-1.5 rounded-full mt-2"></div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#" className="hover:text-[#C9A84C] transition-colors relative group">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#C9A84C] transition-all group-hover:w-full"></span>
            </a>
            <a href="#" className="hover:text-[#C9A84C] transition-colors relative group">
              How it Works
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#C9A84C] transition-all group-hover:w-full"></span>
            </a>
            <a href="#" className="hover:text-[#C9A84C] transition-colors relative group">
              Templates
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#C9A84C] transition-all group-hover:w-full"></span>
            </a>
            <a href="#" className="hover:text-[#C9A84C] transition-colors relative group">
              Pricing
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#C9A84C] transition-all group-hover:w-full"></span>
            </a>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm font-medium hover:text-[#C9A84C] transition-colors">Sign In</a>
            <button 
              style={{ backgroundColor: COLORS.navy }}
              className="text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 group hover:shadow-lg"
            >
              Get Started Free
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform text-[#C9A84C]" />
            </button>
          </div>
          
          <button className="md:hidden">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative px-6 pt-20 pb-24 md:pt-32 md:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 relative z-10">
            <div 
              style={{ backgroundColor: COLORS.navy, color: COLORS.gold }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider"
            >
              <span>🤖</span> AI CAREER INTELLIGENCE ENGINE
            </div>
            
            <h1 style={{ ...playfair, lineHeight: 1.1 }} className="text-5xl md:text-6xl font-black">
              Not Another AI CV.<br />
              <span style={{ color: COLORS.gold }}>A Better You on Paper.</span>
            </h1>
            
            <p style={{ color: COLORS.mutedNavy }} className="text-lg md:text-xl max-w-lg leading-relaxed">
              ProCV combines market intelligence with AI to generate CVs that pass ATS filters, match your target role, and get you to the interview stage.
            </p>
            
            <ul className="space-y-4">
              {[
                "ATS-optimised for your exact job description",
                "7-pass quality pipeline — no AI slop",
                "35+ premium templates, one-click download"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 font-medium">
                  <CheckCircle2 style={{ color: COLORS.gold }} className="w-6 h-6 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                style={{ backgroundColor: COLORS.navy }}
                className="text-white px-8 py-4 rounded-md font-medium text-lg hover:-translate-y-1 transition-transform flex items-center justify-center gap-2 group shadow-xl border-b-4 border-transparent hover:border-[#C9A84C]"
              >
                Build My CV Free
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform text-[#C9A84C]" />
              </button>
              <button 
                style={{ borderColor: COLORS.navy, color: COLORS.navy }}
                className="px-8 py-4 rounded-md font-medium text-lg border-2 hover:bg-[#1B2B4B]/5 transition-colors flex items-center justify-center"
              >
                See How It Works
              </button>
            </div>
            
            <div className="flex items-center gap-4 pt-4">
              <div className="flex -space-x-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#F8F7F4] bg-gray-300 overflow-hidden flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-500" />
                  </div>
                ))}
              </div>
              <div>
                <div className="flex text-[#C9A84C]">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-sm font-medium mt-1">Trusted by 10,000+ job seekers</p>
              </div>
            </div>
          </div>
          
          <div className="relative z-10 w-full perspective-1000">
            {/* Background decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-md bg-[#C9A84C]/20 blur-3xl rounded-full z-0"></div>
            
            {/* App Mockup */}
            <div className="relative z-10 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden transform rotate-y-[-5deg] rotate-x-[5deg] scale-105 hover:rotate-0 hover:scale-100 transition-all duration-700">
              {/* Top bar */}
              <div style={{ backgroundColor: COLORS.navy }} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex space-x-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                  </div>
                  <span style={playfair} className="text-white font-bold ml-4">ProCV</span>
                </div>
                <div className="flex items-center gap-2 text-white/80 text-xs">
                  <span>alex.johnson@email.com</span>
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="w-3 h-3" />
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h3 className="font-bold text-xl mb-1">Senior Product Manager</h3>
                    <p className="text-sm text-gray-500">Target: Tech Industry</p>
                  </div>
                  <div style={{ backgroundColor: COLORS.gold }} className="text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <Check className="w-3 h-3" /> CV READY
                  </div>
                </div>
                
                <div className="mb-8">
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span>Profile Completion</span>
                    <span style={{ color: COLORS.gold }}>92%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div style={{ backgroundColor: COLORS.navy, width: '92%' }} className="h-full rounded-full"></div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {[
                    { label: "Market Research", desc: "15 JDs analyzed", icon: Search },
                    { label: "CV Generation", desc: "Targeted content drafted", icon: PenTool },
                    { label: "Quality Polish", desc: "ATS checks passed", icon: ShieldCheck },
                    { label: "Download Ready", desc: "PDF & DOCX available", icon: FileText }
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-[#C9A84C]/30 hover:bg-[#F8F7F4] transition-colors cursor-pointer">
                      <div style={{ backgroundColor: COLORS.navy }} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                        <step.icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">{step.label}</h4>
                        <p className="text-xs text-gray-500">{step.desc}</p>
                      </div>
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Trust Bar */}
      <section className="border-y border-gray-200/60 py-8 bg-white/50">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-bold tracking-widest text-gray-400 mb-6 uppercase">
            Trusted by professionals at
          </p>
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            {["Google", "Meta", "Amazon", "Deloitte", "PwC", "McKinsey"].map((company) => (
              <span key={company} style={{ ...playfair, color: COLORS.navy }} className="text-2xl font-bold tracking-tight">
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Problems Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 style={playfair} className="text-4xl md:text-5xl font-bold mb-6">
              We Fix What Other CV Builders Get Wrong
            </h2>
            <p className="text-xl text-gray-600">
              Most tools generate generic text. ProCV engineers your CV from market data down.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "ATS Bypass", desc: "Others generate filler text. ProCV maps your experience to exact JD keywords.", icon: Target },
              { title: "Market Intelligence", desc: "Others guess what roles want. ProCV researches your target market first.", icon: BarChart },
              { title: "Human Voice", desc: "Others sound like AI. ProCV applies a humanization pass to every section.", icon: User },
              { title: "Number Accuracy", desc: "Others invent metrics. ProCV preserves your real numbers — no hallucinations.", icon: Hash },
              { title: "WYSIWYG PDF", desc: "Others give you a broken export. ProCV renders exactly what you see on screen.", icon: FileText }
            ].map((card, i) => (
              <div 
                key={i} 
                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow relative overflow-hidden group"
              >
                <div style={{ backgroundColor: COLORS.navy }} className="absolute top-0 left-0 w-full h-1 group-hover:h-2 transition-all"></div>
                <div style={{ backgroundColor: COLORS.bg }} className="w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                  <card.icon style={{ color: COLORS.navy }} className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{card.title}</h3>
                <p className="text-gray-600 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Pipeline Section */}
      <section style={{ backgroundColor: COLORS.navy }} className="py-24 px-6 text-white relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center relative z-10">
          <div>
            <div 
              style={{ backgroundColor: COLORS.gold, color: COLORS.navy }}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider mb-6 shadow-lg"
            >
              THE ENGINE
            </div>
            
            <h2 style={playfair} className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              7 Passes. One Goal — <br />
              <span className="text-[#C9A84C]">The Best Version of You.</span>
            </h2>
            
            <p className="text-lg text-gray-300 mb-10 max-w-md">
              Every CV runs through our full quality pipeline before you ever see it. No shortcuts.
            </p>
            
            <div className="grid grid-cols-2 gap-8">
              {[
                { label: "ATS-pass rate", value: "98%" },
                { label: "fact-accurate", value: "100%" },
                { label: "templates", value: "35+" },
                { label: "more interviews", value: "3×" }
              ].map((stat, i) => (
                <div key={i}>
                  <div style={{ color: COLORS.gold }} className="text-3xl font-black mb-1">{stat.value}</div>
                  <div className="text-sm font-bold tracking-wide text-gray-400 uppercase">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="relative pl-4 md:pl-10">
            {/* Connecting Line */}
            <div className="absolute left-[25px] md:left-[51px] top-6 bottom-6 w-0.5 bg-[#3A4B6B]"></div>
            
            <div className="space-y-6">
              {[
                { title: "Market Research", desc: "Grounding your CV in real data", icon: Search },
                { title: "CV Generation", desc: "AI drafts your tailored content", icon: PenTool },
                { title: "ATS Scoring", desc: "Keyword coverage check", icon: Target },
                { title: "Quality Polish", desc: "Bullet hygiene & verb variety", icon: Sparkles },
                { title: "Humanization", desc: "Removing AI-isms", icon: User },
                { title: "Number Fidelity", desc: "Protecting your real metrics", icon: Hash },
                { title: "Final Validation", desc: "Structure & completeness check", icon: CheckCircle2 }
              ].map((step, i) => (
                <div key={i} className="relative flex items-center gap-6 group">
                  <div style={{ backgroundColor: COLORS.gold, color: COLORS.navy }} className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg z-10 shadow-[0_0_15px_rgba(201,168,76,0.3)] group-hover:scale-110 transition-transform">
                    {i + 1}
                  </div>
                  <div className="flex-1 bg-white/5 p-4 rounded-lg border border-white/10 group-hover:bg-white/10 group-hover:border-[#C9A84C]/50 transition-all flex items-center gap-4">
                    <step.icon className="w-5 h-5 text-[#C9A84C]" />
                    <div>
                      <h4 className="font-bold text-lg">{step.title}</h4>
                      <p className="text-sm text-gray-400">{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Possibilities Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 style={playfair} className="text-4xl md:text-5xl font-bold mb-6">
              One Profile. Unlimited Possibilities.
            </h2>
            <p className="text-xl text-gray-600">
              Build once. Generate tailored CVs for every role, sector, and seniority level.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { title: "Tailored CV", desc: "JD-targeted, ATS-optimised CVs in under 60 seconds", icon: FileText },
              { title: "Cover Letters", desc: "Matching cover letters that complement your CV perfectly", icon: Briefcase },
              { title: "ATS Analyser", desc: "Score your existing CV against any job description", icon: Award },
              { title: "Interview Prep", desc: "AI-generated questions tailored to your role and experience", icon: Mic }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex items-start gap-6 hover:-translate-y-1 transition-transform">
                <div style={{ backgroundColor: COLORS.bg }} className="w-14 h-14 rounded-full flex items-center justify-center shrink-0">
                  <feature.icon style={{ color: COLORS.gold }} className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Privacy CTA Banner */}
      <section style={{ backgroundColor: COLORS.navy }} className="py-20 px-6 text-center text-white border-t border-white/10">
        <div className="max-w-3xl mx-auto">
          <h2 style={playfair} className="text-4xl font-bold mb-6">Your data stays yours. Always.</h2>
          <p className="text-lg text-gray-300 mb-10">
            We never sell your data, never train models on your profile, and never store more than you ask us to.
          </p>
          
          <button 
            style={{ backgroundColor: COLORS.gold, color: COLORS.navy }}
            className="px-8 py-4 rounded-md font-bold text-lg hover:scale-105 transition-transform shadow-2xl mb-12"
          >
            Get Started Free — No Credit Card Needed &rarr;
          </button>
          
          <div className="flex flex-wrap justify-center gap-8 text-sm font-medium text-gray-400">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#C9A84C]" /> End-to-end encrypted
            </div>
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#C9A84C]" /> Zero data selling
            </div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#C9A84C]" /> Delete anytime
            </div>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer style={{ backgroundColor: COLORS.navy }} className="pt-16 pb-8 px-6 text-white border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <span style={playfair} className="text-2xl font-bold tracking-tight">ProCV</span>
                <div style={{ backgroundColor: COLORS.gold }} className="w-1.5 h-1.5 rounded-full mt-2"></div>
              </div>
              <p className="text-gray-400">Your Personal Career Consultant</p>
            </div>
            
            <div>
              <h4 className="font-bold mb-4 uppercase tracking-wider text-sm text-gray-500">Product</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Templates</a></li>
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold mb-4 uppercase tracking-wider text-sm text-gray-500">Company</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="text-gray-300 hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
            <div>&copy; 2026 ProCV</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
