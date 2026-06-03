export function LogoConcepts() {
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center gap-20 py-16 px-8">
      <div className="text-center mb-4">
        <p className="text-[#555] text-xs font-bold uppercase tracking-[0.3em]">ProCV — Logo Concepts</p>
      </div>

      {/* Concept A: Mark + Wordmark — geometric bracket */}
      <div className="flex flex-col items-center gap-6">
        <p className="text-[#333] text-[10px] uppercase tracking-[0.25em] font-bold">Concept A — Precision Mark</p>
        <div className="flex items-center gap-4">
          {/* Icon: stylised bracket wrapping CV */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="52" height="52" rx="12" fill="#EBFF38"/>
            {/* Left bracket arm */}
            <rect x="10" y="10" width="4" height="32" rx="2" fill="#111"/>
            <rect x="10" y="10" width="14" height="4" rx="2" fill="#111"/>
            <rect x="10" y="38" width="14" height="4" rx="2" fill="#111"/>
            {/* Right bracket arm */}
            <rect x="38" y="10" width="4" height="32" rx="2" fill="#111"/>
            <rect x="28" y="10" width="14" height="4" rx="2" fill="#111"/>
            <rect x="28" y="38" width="14" height="4" rx="2" fill="#111"/>
            {/* CV text */}
            <text x="26" y="32" textAnchor="middle" fill="#111" fontSize="13" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="-1">CV</text>
          </svg>
          <div>
            <div className="font-black text-[#f0ece0] text-3xl tracking-[-0.05em] leading-none">ProCV</div>
            <div className="text-[#EBFF38] text-[10px] font-bold tracking-[0.2em] uppercase mt-1">Career Consultant</div>
          </div>
        </div>
        {/* Small variants */}
        <div className="flex items-center gap-6 mt-2">
          <svg width="32" height="32" viewBox="0 0 52 52" fill="none"><rect width="52" height="52" rx="12" fill="#EBFF38"/><rect x="10" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="10" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="10" y="38" width="14" height="4" rx="2" fill="#111"/><rect x="38" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="28" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="28" y="38" width="14" height="4" rx="2" fill="#111"/><text x="26" y="32" textAnchor="middle" fill="#111" fontSize="13" fontWeight="900" fontFamily="system-ui" letterSpacing="-1">CV</text></svg>
          <svg width="24" height="24" viewBox="0 0 52 52" fill="none"><rect width="52" height="52" rx="12" fill="#EBFF38"/><rect x="10" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="10" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="10" y="38" width="14" height="4" rx="2" fill="#111"/><rect x="38" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="28" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="28" y="38" width="14" height="4" rx="2" fill="#111"/><text x="26" y="32" textAnchor="middle" fill="#111" fontSize="13" fontWeight="900" fontFamily="system-ui" letterSpacing="-1">CV</text></svg>
          <svg width="20" height="20" viewBox="0 0 52 52" fill="none"><rect width="52" height="52" rx="10" fill="#EBFF38"/><rect x="10" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="10" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="10" y="38" width="14" height="4" rx="2" fill="#111"/><rect x="38" y="10" width="4" height="32" rx="2" fill="#111"/><rect x="28" y="10" width="14" height="4" rx="2" fill="#111"/><rect x="28" y="38" width="14" height="4" rx="2" fill="#111"/><text x="26" y="32" textAnchor="middle" fill="#111" fontSize="13" fontWeight="900" fontFamily="system-ui" letterSpacing="-1">CV</text></svg>
          <div className="h-8 w-px bg-[#222]"/>
          <div className="text-[10px] text-[#444] font-bold uppercase tracking-[0.2em]">16px · 24px · 32px · 48px</div>
        </div>
        <p className="text-[#333] text-xs text-center max-w-xs">Geometric brackets signal structure and precision. Yellow = energy. Works at all sizes — even 16×16 favicon.</p>
      </div>

      {/* Concept B: Monogram — stacked diamond */}
      <div className="flex flex-col items-center gap-6">
        <p className="text-[#333] text-[10px] uppercase tracking-[0.25em] font-bold">Concept B — Stacked Monogram</p>
        <div className="flex items-center gap-4">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="52" height="52" rx="12" fill="#1B2B4B"/>
            {/* Top triangle accent */}
            <polygon points="26,8 36,20 16,20" fill="#C9A84C" opacity="0.9"/>
            {/* CV bold letters */}
            <text x="26" y="38" textAnchor="middle" fill="#f0ece0" fontSize="16" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="-0.5">CV</text>
            {/* Bottom line accent */}
            <rect x="14" y="42" width="24" height="2" rx="1" fill="#C9A84C" opacity="0.6"/>
          </svg>
          <div>
            <div className="font-black text-[#f0ece0] text-3xl tracking-[-0.05em] leading-none">ProCV</div>
            <div className="text-[#C9A84C] text-[10px] font-bold tracking-[0.2em] uppercase mt-1">Your Career Consultant</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {[52, 40, 32, 24].map(s => (
            <svg key={s} width={s} height={s} viewBox="0 0 52 52" fill="none">
              <rect width="52" height="52" rx="12" fill="#1B2B4B"/>
              <polygon points="26,8 36,20 16,20" fill="#C9A84C" opacity="0.9"/>
              <text x="26" y="38" textAnchor="middle" fill="#f0ece0" fontSize="16" fontWeight="900" fontFamily="system-ui" letterSpacing="-0.5">CV</text>
              <rect x="14" y="42" width="24" height="2" rx="1" fill="#C9A84C" opacity="0.6"/>
            </svg>
          ))}
        </div>
        <p className="text-[#333] text-xs text-center max-w-xs">Navy + gold echoes the app's brand palette. The triangle motif signals upward trajectory — career growth. Authoritative and polished.</p>
      </div>

      {/* Concept C: Page icon — document with spark */}
      <div className="flex flex-col items-center gap-6">
        <p className="text-[#333] text-[10px] uppercase tracking-[0.25em] font-bold">Concept C — Document + Spark</p>
        <div className="flex items-center gap-4">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="52" height="52" rx="12" fill="#111"/>
            {/* Document body */}
            <rect x="11" y="9" width="24" height="30" rx="2" fill="#1e1e1e" stroke="#333" strokeWidth="1"/>
            {/* Folded corner */}
            <path d="M29 9 L35 15 L29 15 Z" fill="#111" stroke="#333" strokeWidth="1"/>
            {/* Lines on doc */}
            <rect x="15" y="19" width="12" height="2" rx="1" fill="#444"/>
            <rect x="15" y="23" width="16" height="2" rx="1" fill="#444"/>
            <rect x="15" y="27" width="10" height="2" rx="1" fill="#444"/>
            {/* Spark / star in corner */}
            <g transform="translate(33, 30)">
              <path d="M0,-8 L1.5,-1.5 L8,0 L1.5,1.5 L0,8 L-1.5,1.5 L-8,0 L-1.5,-1.5 Z" fill="#EBFF38"/>
            </g>
          </svg>
          <div>
            <div className="font-black text-[#f0ece0] text-3xl tracking-[-0.05em] leading-none">ProCV</div>
            <div className="text-[#EBFF38] text-[10px] font-bold tracking-[0.2em] uppercase mt-1">Fully Private · Free</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {[52, 40, 32, 24].map(s => (
            <svg key={s} width={s} height={s} viewBox="0 0 52 52" fill="none">
              <rect width="52" height="52" rx={Math.round(s * 0.23)} fill="#111"/>
              <rect x="11" y="9" width="24" height="30" rx="2" fill="#1e1e1e" stroke="#333" strokeWidth="1"/>
              <path d="M29 9 L35 15 L29 15 Z" fill="#111" stroke="#333" strokeWidth="1"/>
              <rect x="15" y="19" width="12" height="2" rx="1" fill="#444"/>
              <rect x="15" y="23" width="16" height="2" rx="1" fill="#444"/>
              <rect x="15" y="27" width="10" height="2" rx="1" fill="#444"/>
              <g transform="translate(33, 30)">
                <path d="M0,-8 L1.5,-1.5 L8,0 L1.5,1.5 L0,8 L-1.5,1.5 L-8,0 L-1.5,-1.5 Z" fill="#EBFF38"/>
              </g>
            </svg>
          ))}
        </div>
        <p className="text-[#333] text-xs text-center max-w-xs">The CV document is the product itself. The spark signals AI-enhancement without saying "AI". Dark, minimal, and instantly recognisable.</p>
      </div>
    </div>
  );
}
