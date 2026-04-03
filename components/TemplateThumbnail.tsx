import React, { useRef, useState, useEffect, lazy, Suspense } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';

const CVPreview = lazy(() => import('./CVPreview'));

interface TemplateThumbnailProps {
  templateName: TemplateName;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
}

const A4_WIDTH_PX = 794;

const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ templateName, cvData, personalInfo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.22);

  useEffect(() => {
    if (!cvData || !personalInfo) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setScale(entry.contentRect.width / A4_WIDTH_PX);
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [cvData, personalInfo]);

  if (cvData && personalInfo) {
    return (
      <div ref={containerRef} className="w-full overflow-hidden relative bg-white" style={{ aspectRatio: '1/1.414' }}>
        <Suspense fallback={<div className="w-full h-full bg-gray-50 animate-pulse" />}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${A4_WIDTH_PX}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          >
            <CVPreview
              cvData={cvData}
              personalInfo={personalInfo}
              template={templateName}
              isEditing={false}
              onDataChange={() => {}}
              jobDescriptionForATS=""
            />
          </div>
        </Suspense>
      </div>
    );
  }

  const base = "w-full aspect-[1/1.414] flex flex-col overflow-hidden";

  switch (templateName) {

    case 'standard-pro':
      return (
        <div className={`${base} bg-white p-2`}>
          <div className="text-center pb-1 border-b border-gray-900">
            <div className="h-2 bg-gray-900 w-1/2 mx-auto rounded-[1px] mb-0.5" />
            <div className="h-1 bg-gray-400 w-3/4 mx-auto rounded-[1px]" />
          </div>
          {[['EDUCATION', '1/3'], ['EXPERIENCE', '2/3'], ['SKILLS', '1/2']].map(([label, w], i) => (
            <div key={i} className="mt-1.5">
              <div className="h-1 bg-gray-900 rounded-[1px] mb-0.5" style={{ width: w === '1/3' ? '33%' : w === '2/3' ? '66%' : '50%' }} />
              <div className="h-px bg-gray-900 w-full mb-1" />
              <div className="space-y-0.5">
                <div className="h-0.5 bg-gray-300 rounded w-full" />
                <div className="h-0.5 bg-gray-300 rounded w-5/6" />
                <div className="h-0.5 bg-gray-300 rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'professional':
      return (
        <div className={`${base} bg-white p-2`}>
          <div className="bg-blue-700 -mx-2 -mt-2 px-3 py-2 mb-2">
            <div className="h-2.5 bg-white/90 w-1/2 rounded-sm mb-1" />
            <div className="h-1 bg-blue-300 w-3/4 rounded-sm" />
          </div>
          <div className="flex gap-1.5 flex-1">
            <div className="w-2/5 space-y-2">
              <div>
                <div className="h-1 bg-blue-700 w-3/4 rounded-sm mb-1" />
                <div className="h-0.5 bg-gray-200 rounded w-full" />
                <div className="h-0.5 bg-gray-200 rounded w-4/5 mt-0.5" />
              </div>
              <div>
                <div className="h-1 bg-blue-700 w-1/2 rounded-sm mb-1" />
                <div className="flex flex-wrap gap-0.5">
                  {[3, 4, 3, 5, 3].map((w, i) => (
                    <div key={i} className="h-1 bg-blue-100 rounded-sm" style={{ width: `${w * 12}%` }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-1 bg-gray-700 w-2/3 rounded-sm" />
              <div className="space-y-0.5">
                <div className="h-0.5 bg-gray-200 rounded" />
                <div className="h-0.5 bg-gray-200 rounded w-5/6" />
                <div className="h-0.5 bg-gray-200 rounded w-4/5" />
              </div>
              <div className="h-1 bg-gray-700 w-2/3 rounded-sm mt-1" />
              <div className="space-y-0.5">
                <div className="h-0.5 bg-gray-200 rounded" />
                <div className="h-0.5 bg-gray-200 rounded w-4/5" />
              </div>
            </div>
          </div>
        </div>
      );

    case 'modern':
      return (
        <div className={`${base} bg-white flex-row gap-0`}>
          <div className="w-[38%] bg-gradient-to-b from-slate-700 to-slate-900 h-full p-1.5 flex flex-col gap-1.5">
            <div className="w-8 h-8 bg-slate-500/50 rounded-full mx-auto mb-1" />
            <div className="h-1.5 bg-white/80 w-3/4 mx-auto rounded-sm" />
            <div className="h-1 bg-white/40 w-1/2 mx-auto rounded-sm" />
            <div className="h-px bg-white/20 my-1" />
            {['CONTACT', 'SKILLS'].map((s, i) => (
              <div key={i} className="mt-1">
                <div className="h-0.5 bg-teal-400 w-1/2 rounded-sm mb-1" />
                <div className="space-y-0.5">
                  <div className="h-0.5 bg-white/30 rounded w-full" />
                  <div className="h-0.5 bg-white/30 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 p-1.5 flex flex-col gap-1.5">
            <div className="h-1 bg-teal-600 w-3/4 rounded-sm" />
            <div className="h-px bg-teal-200 w-full" />
            <div className="space-y-1">
              {[1, 2].map(i => (
                <div key={i}>
                  <div className="h-1 bg-slate-700 w-2/3 rounded-sm" />
                  <div className="h-0.5 bg-gray-300 rounded mt-0.5" />
                  <div className="h-0.5 bg-gray-300 rounded w-4/5 mt-0.5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'executive':
      return (
        <div className={`${base} bg-white p-2.5`}>
          <div className="text-center pb-1.5 border-b-2 border-gray-800 mb-1.5">
            <div className="h-2.5 bg-gray-900 w-1/2 mx-auto rounded-[1px] mb-0.5" />
            <div className="h-1 bg-gray-400 w-3/4 mx-auto rounded-[1px] mb-0.5" />
            <div className="h-0.5 bg-gray-300 w-2/3 mx-auto rounded-[1px]" />
          </div>
          {['PROFESSIONAL EXPERIENCE', 'EDUCATION', 'CORE COMPETENCIES'].map((label, i) => (
            <div key={i} className="mb-1.5">
              <div className="text-[4px] font-bold tracking-widest text-gray-500 uppercase mb-0.5 pb-0.5 border-b border-gray-300">
                {label}
              </div>
              <div className="space-y-0.5">
                <div className="h-0.5 bg-gray-300 rounded w-full" />
                <div className="h-0.5 bg-gray-300 rounded w-5/6" />
                {i === 0 && <div className="h-0.5 bg-gray-300 rounded w-4/5" />}
              </div>
            </div>
          ))}
        </div>
      );

    case 'minimalist':
      return (
        <div className={`${base} bg-white px-3 py-2`}>
          <div className="mb-2">
            <div className="h-2 bg-gray-900 w-1/2 rounded-sm mb-0.5" />
            <div className="h-1 bg-gray-400 w-3/4 rounded-sm" />
          </div>
          <div className="h-px bg-gray-200 mb-2" />
          <div className="flex gap-2">
            <div className="w-1/3 space-y-2">
              {['skills', 'contact'].map(s => (
                <div key={s}>
                  <div className="h-0.5 bg-gray-800 w-3/4 rounded-sm mb-0.5" />
                  <div className="h-0.5 bg-gray-200 rounded" />
                  <div className="h-0.5 bg-gray-200 rounded w-4/5 mt-0.5" />
                </div>
              ))}
            </div>
            <div className="flex-1 space-y-1.5">
              {[1, 2].map(i => (
                <div key={i}>
                  <div className="h-0.5 bg-gray-800 rounded w-2/3" />
                  <div className="h-0.5 bg-gray-200 rounded mt-0.5" />
                  <div className="h-0.5 bg-gray-200 rounded w-4/5 mt-0.5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'corporate':
      return (
        <div className={`${base} bg-white p-0`}>
          <div className="bg-gray-800 px-2 py-2 flex items-center gap-2">
            <div className="w-5 h-5 bg-amber-400 rounded-full flex-shrink-0" />
            <div>
              <div className="h-1.5 bg-white/90 w-16 rounded-sm mb-0.5" />
              <div className="h-1 bg-white/40 w-12 rounded-sm" />
            </div>
          </div>
          <div className="flex flex-1">
            <div className="w-2/5 bg-gray-100 p-1.5 space-y-1.5">
              {['CONTACT', 'EXPERTISE'].map(s => (
                <div key={s}>
                  <div className="h-0.5 bg-amber-500 w-full mb-0.5" />
                  <div className="h-0.5 bg-gray-300 rounded w-full" />
                  <div className="h-0.5 bg-gray-300 rounded w-4/5 mt-0.5" />
                </div>
              ))}
            </div>
            <div className="flex-1 p-1.5 space-y-1">
              <div className="h-0.5 bg-amber-500 w-full mb-1" />
              <div className="h-1 bg-gray-700 w-2/3 rounded-sm" />
              <div className="h-0.5 bg-gray-200 rounded w-full" />
              <div className="h-0.5 bg-gray-200 rounded w-4/5" />
              <div className="h-1 bg-gray-700 w-2/3 rounded-sm mt-1" />
              <div className="h-0.5 bg-gray-200 rounded w-5/6" />
            </div>
          </div>
        </div>
      );

    case 'elegant':
      return (
        <div className={`${base} bg-stone-50 p-2`}>
          <div className="text-center border-b-2 border-rose-400 pb-1.5 mb-1.5">
            <div className="h-2 bg-stone-800 w-1/2 mx-auto rounded-[1px] mb-0.5" />
            <div className="h-0.5 bg-rose-300 w-1/3 mx-auto" />
            <div className="h-1 bg-stone-400 w-2/3 mx-auto rounded-[1px] mt-0.5" />
          </div>
          {[1, 2].map(i => (
            <div key={i} className="mb-1.5">
              <div className="flex items-center gap-1 mb-0.5">
                <div className="w-1 h-1 bg-rose-400 rounded-full" />
                <div className="h-0.5 bg-stone-700 rounded w-1/3" />
              </div>
              <div className="pl-2 space-y-0.5">
                <div className="h-0.5 bg-stone-300 rounded w-full" />
                <div className="h-0.5 bg-stone-300 rounded w-4/5" />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-0.5 mt-1">
            {[3, 4, 3, 5].map((w, i) => (
              <div key={i} className="h-1 bg-rose-100 border border-rose-300 rounded-full" style={{ width: `${w * 10}%` }} />
            ))}
          </div>
        </div>
      );

    case 'creative':
      return (
        <div className={`${base} bg-white p-0 flex-row`}>
          <div className="w-2/5 bg-gradient-to-b from-teal-500 to-teal-700 p-1.5 flex flex-col items-center gap-1.5">
            <div className="w-8 h-8 bg-white/20 rounded-full mb-1" />
            <div className="h-1 bg-white/80 w-4/5 rounded-sm" />
            <div className="h-0.5 bg-white/50 w-3/4 rounded-sm" />
            <div className="h-px bg-white/30 w-full my-0.5" />
            <div className="w-full space-y-0.5">
              {[80, 65, 90, 70].map((pct, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <div className="h-0.5 bg-white/40 rounded-full flex-1">
                    <div className="h-0.5 bg-white rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 p-1.5 space-y-1.5">
            <div className="h-1 bg-teal-600 w-3/4 rounded-sm" />
            <div className="space-y-0.5">
              <div className="h-0.5 bg-gray-200 rounded" />
              <div className="h-0.5 bg-gray-200 rounded w-4/5" />
            </div>
            <div className="h-px bg-teal-100 my-0.5" />
            <div className="h-1 bg-teal-600 w-2/3 rounded-sm" />
            <div className="space-y-0.5">
              <div className="h-0.5 bg-gray-200 rounded" />
              <div className="h-0.5 bg-gray-200 rounded w-5/6" />
            </div>
          </div>
        </div>
      );

    case 'timeline':
      return (
        <div className={`${base} bg-white p-2`}>
          <div className="h-2 bg-indigo-700 w-1/2 rounded-sm mb-0.5" />
          <div className="h-1 bg-indigo-300 w-2/3 rounded-sm mb-2" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-1.5 mb-1.5">
              <div className="flex flex-col items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-0.5 flex-shrink-0" />
                {i < 3 && <div className="w-0.5 flex-1 bg-indigo-200 mt-0.5" />}
              </div>
              <div className="flex-1">
                <div className="h-0.5 bg-indigo-600 w-1/2 rounded mb-0.5" />
                <div className="h-0.5 bg-gray-300 rounded w-full" />
                <div className="h-0.5 bg-gray-300 rounded w-4/5 mt-0.5" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'twoColumnBlue':
      return (
        <div className={`${base} bg-white p-0`}>
          <div className="bg-blue-700 px-2 py-1.5">
            <div className="h-2 bg-white/90 w-1/2 rounded-sm mb-0.5" />
            <div className="h-1 bg-blue-300 w-3/4 rounded-sm" />
          </div>
          <div className="flex flex-1">
            <div className="w-2/5 bg-blue-50 p-1.5 space-y-1.5">
              {['CONTACT', 'SKILLS', 'LANGUAGES'].map(s => (
                <div key={s}>
                  <div className="h-0.5 bg-blue-700 w-3/4 rounded-sm mb-0.5" />
                  <div className="h-0.5 bg-blue-200 rounded w-full" />
                  <div className="h-0.5 bg-blue-200 rounded w-4/5 mt-0.5" />
                </div>
              ))}
            </div>
            <div className="flex-1 p-1.5 space-y-1">
              <div className="h-0.5 bg-blue-700 w-2/3 rounded-sm" />
              <div className="h-0.5 bg-gray-200 rounded" />
              <div className="h-0.5 bg-gray-200 rounded w-5/6" />
              <div className="h-0.5 bg-blue-700 w-1/2 rounded-sm mt-1" />
              <div className="h-0.5 bg-gray-200 rounded" />
              <div className="h-0.5 bg-gray-200 rounded w-4/5" />
            </div>
          </div>
        </div>
      );

    case 'technical':
      return (
        <div className={`${base} bg-white p-2`}>
          <div className="h-2 bg-violet-700 w-1/2 rounded-sm mb-0.5" />
          <div className="flex flex-wrap gap-0.5 mb-1.5">
            {[3, 4, 5, 3, 4].map((w, i) => (
              <div key={i} className="h-1 bg-violet-100 border border-violet-300 rounded-full" style={{ width: `${w * 10}%` }} />
            ))}
          </div>
          <div className="h-px bg-violet-200 mb-1.5" />
          {[1, 2].map(i => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between mb-0.5">
                <div className="h-0.5 bg-violet-700 rounded w-1/3" />
                <div className="h-0.5 bg-gray-400 rounded w-1/5" />
              </div>
              <div className="h-0.5 bg-gray-300 rounded w-full" />
              <div className="h-0.5 bg-gray-300 rounded w-4/5 mt-0.5" />
            </div>
          ))}
        </div>
      );

    case 'software-engineer':
      return (
        <div className={`${base} bg-gray-900 p-2`}>
          <div className="border-l-2 border-green-400 pl-1.5 mb-2">
            <div className="h-2 bg-green-400 w-1/2 rounded-sm mb-0.5" />
            <div className="h-1 bg-green-700 w-3/4 rounded-sm" />
          </div>
          <div className="flex flex-wrap gap-0.5 mb-2">
            {['react', 'ts', 'node', 'aws', 'py'].map(s => (
              <div key={s} className="h-1 bg-green-900 border border-green-600 rounded text-[3px] px-0.5 text-green-400 leading-tight">{s}</div>
            ))}
          </div>
          {[1, 2].map(i => (
            <div key={i} className="mb-1.5">
              <div className="h-0.5 bg-green-500 rounded w-1/2 mb-0.5" />
              <div className="h-0.5 bg-gray-600 rounded w-full" />
              <div className="h-0.5 bg-gray-600 rounded w-4/5 mt-0.5" />
            </div>
          ))}
        </div>
      );

    case 'swe-elite':
      return (
        <div className={`${base} bg-[#0f172a] p-0 flex overflow-hidden`}>
          <div className="w-1/3 bg-[#0f172a] p-1.5 flex flex-col gap-1.5">
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center mx-auto mb-0.5">
              <div className="h-1.5 w-3 bg-white/80 rounded-sm" />
            </div>
            <div className="h-px bg-emerald-500/30 w-full" />
            {['react', 'ts', 'go', 'k8s'].map(s => (
              <div key={s} className="h-1 bg-emerald-900 border border-emerald-600/50 rounded text-[3px] px-0.5 text-emerald-400 leading-tight font-mono">{s}</div>
            ))}
            <div className="h-px bg-emerald-500/30 w-full mt-0.5" />
            {[1, 2].map(i => (
              <div key={i}>
                <div className="h-0.5 bg-slate-500 rounded w-full mb-0.5" />
                <div className="h-0.5 bg-slate-700 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="flex-1 bg-white p-1.5 space-y-1.5">
            {[1, 2].map(i => (
              <div key={i} className="pl-1 border-l-2 border-emerald-200">
                <div className="h-0.5 bg-slate-700 rounded w-1/2 mb-0.5" />
                <div className="h-0.5 bg-emerald-500 rounded w-2/3 mb-0.5" />
                <div className="h-0.5 bg-slate-200 rounded w-full" />
              </div>
            ))}
            <div className="h-px bg-slate-100" />
            {[1, 2].map(i => (
              <div key={i} className="h-3 rounded bg-slate-50 border border-slate-100 p-0.5">
                <div className="h-0.5 bg-slate-600 rounded w-1/2 mb-0.5" />
                <div className="h-0.5 bg-slate-200 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      );

    case 'modern-tech':
      return (
        <div className={`${base} bg-white p-0`}>
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-2 py-2">
            <div className="h-2 bg-white/90 w-1/2 rounded-sm mb-0.5" />
            <div className="h-1 bg-white/50 w-3/4 rounded-sm" />
          </div>
          <div className="p-1.5 space-y-1.5">
            <div className="flex flex-wrap gap-0.5">
              {[4, 3, 5, 4].map((w, i) => (
                <div key={i} className="h-1 bg-indigo-50 border border-indigo-200 rounded-full" style={{ width: `${w * 10}%` }} />
              ))}
            </div>
            <div className="h-px bg-indigo-100" />
            {[1, 2].map(i => (
              <div key={i}>
                <div className="h-0.5 bg-indigo-600 rounded w-1/2 mb-0.5" />
                <div className="h-0.5 bg-gray-200 rounded" />
                <div className="h-0.5 bg-gray-200 rounded w-4/5 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      );

    case 'compact':
      return (
        <div className={`${base} bg-white px-2 py-1.5`}>
          <div className="flex justify-between items-end pb-1 border-b border-gray-400 mb-1">
            <div>
              <div className="h-1.5 bg-gray-900 w-16 rounded-sm mb-0.5" />
              <div className="h-0.5 bg-gray-400 w-12 rounded-sm" />
            </div>
            <div className="text-right space-y-0.5">
              <div className="h-0.5 bg-gray-300 w-10 rounded-sm" />
              <div className="h-0.5 bg-gray-300 w-8 rounded-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
            {['EXPERIENCE', 'SKILLS', 'EDUCATION'].map((s, i) => (
              <div key={i} className={i === 0 ? 'col-span-2' : ''}>
                <div className="h-0.5 bg-gray-700 rounded w-3/4 mb-0.5" />
                <div className="h-0.5 bg-gray-200 rounded" />
                <div className="h-0.5 bg-gray-200 rounded w-4/5 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      );

    case 'classic':
      return (
        <div className={`${base} bg-white px-2 py-1.5`}>
          <div className="text-center pb-1 mb-1">
            <div className="h-2 bg-gray-900 w-1/2 mx-auto rounded-[1px] mb-0.5" />
            <div className="h-0.5 bg-gray-500 w-2/3 mx-auto" />
          </div>
          <div className="h-0.5 bg-gray-800 w-full mb-1" />
          {['EXPERIENCE', 'EDUCATION', 'SKILLS'].map((s, i) => (
            <div key={i} className="mb-1.5">
              <div className="text-[3.5px] font-bold tracking-widest text-gray-700 uppercase border-b border-gray-400 pb-0.5 mb-0.5">{s}</div>
              <div className="h-0.5 bg-gray-200 rounded w-full" />
              <div className="h-0.5 bg-gray-200 rounded w-5/6 mt-0.5" />
            </div>
          ))}
        </div>
      );

    case 'infographic':
      return (
        <div className={`${base} bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-2`}>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-6 h-6 bg-white/20 rounded-full" />
            <div>
              <div className="h-1.5 bg-white/80 w-14 rounded-sm mb-0.5" />
              <div className="h-1 bg-purple-300/50 w-10 rounded-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {['SKILLS', 'TOOLS'].map(s => (
              <div key={s} className="bg-white/10 rounded p-1">
                <div className="h-0.5 bg-purple-300 rounded w-3/4 mb-0.5" />
                {[80, 60, 90].map((w, i) => (
                  <div key={i} className="h-0.5 bg-white/20 rounded-full mb-0.5">
                    <div className="h-0.5 bg-purple-400 rounded-full" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1 space-y-0.5">
            {[1, 2].map(i => (
              <div key={i} className="bg-white/10 rounded px-1 py-0.5">
                <div className="h-0.5 bg-white/70 rounded w-1/2 mb-0.5" />
                <div className="h-0.5 bg-white/30 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      );

    case 'navy-sidebar':
      return (
        <div className={`${base} flex-row gap-0`}>
          <div className="w-[36%] h-full p-1.5 flex flex-col gap-1.5" style={{ backgroundColor: '#1a2f5a' }}>
            {['EDUCATION', 'CERTS', 'SKILLS'].map((s, i) => (
              <div key={i} className="mt-1">
                <div className="h-0.5 rounded-sm mb-1" style={{ backgroundColor: '#7fa8d8', width: '70%' }} />
                <div className="space-y-0.5">
                  <div className="h-0.5 bg-white/30 rounded w-full" />
                  <div className="h-0.5 bg-white/30 rounded w-4/5" />
                  <div className="h-0.5 bg-white/30 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 p-1.5 flex flex-col gap-1.5">
            <div className="h-2 rounded-sm mb-0.5" style={{ backgroundColor: '#1a2f5a', width: '80%' }} />
            <div className="h-px w-full" style={{ backgroundColor: '#1a2f5a' }} />
            <div className="h-0.5 rounded-sm" style={{ backgroundColor: '#1a2f5a', width: '50%' }} />
            <div className="space-y-0.5 mt-1">
              <div className="h-0.5 bg-gray-300 rounded" />
              <div className="h-0.5 bg-gray-300 rounded w-5/6" />
            </div>
            {[1, 2].map(i => (
              <div key={i} className="mt-1">
                <div className="h-1 rounded-sm" style={{ backgroundColor: '#1a2f5a', width: '60%' }} />
                <div className="space-y-0.5 mt-0.5">
                  <div className="h-0.5 bg-gray-300 rounded" />
                  <div className="h-0.5 bg-gray-300 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'photo-sidebar':
      return (
        <div className={`${base} flex-row gap-0`}>
          <div className="w-[38%] h-full p-1.5 flex flex-col gap-1.5" style={{ backgroundColor: '#f5f0e8' }}>
            <div className="flex flex-col items-center mb-1">
              <div className="w-7 h-7 rounded-sm mb-0.5" style={{ backgroundColor: '#c8701a' }} />
              <div className="h-1 bg-zinc-700 rounded-sm w-3/4 mb-0.5" />
              <div className="h-0.5 rounded-sm w-1/2" style={{ color: '#c8701a', backgroundColor: '#c8701a' }} />
            </div>
            {['Contact', 'Summary', 'Skills'].map((s, i) => (
              <div key={i} className="mt-0.5">
                <div className="h-0.5 rounded-sm mb-0.5" style={{ backgroundColor: '#555', width: '70%' }} />
                <div className="space-y-0.5">
                  <div className="h-0.5 bg-zinc-400 rounded w-full" />
                  <div className="h-0.5 bg-zinc-400 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 p-1.5 flex flex-col gap-1.5">
            {['Education', 'Experience', 'Highlights'].map((s, i) => (
              <div key={i} className="mt-0.5">
                <div className="h-0.5 bg-zinc-700 rounded-sm mb-0.5" style={{ width: '60%' }} />
                <div className="h-px bg-zinc-300 w-full mb-0.5" />
                <div className="space-y-0.5">
                  <div className="flex items-start gap-0.5">
                    <div className="w-1 h-1 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: '#c8701a' }} />
                    <div className="h-0.5 bg-gray-300 rounded flex-1" />
                  </div>
                  <div className="flex items-start gap-0.5">
                    <div className="w-1 h-1 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: '#c8701a' }} />
                    <div className="h-0.5 bg-gray-300 rounded flex-1 w-4/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div className={`${base} bg-white p-2 space-y-1`}>
          <div className="h-3 bg-slate-400 w-3/4 rounded-sm" />
          <div className="h-0.5 bg-slate-200 w-1/2" />
          <div className="space-y-0.5 mt-2">
            <div className="h-0.5 bg-slate-200 rounded" />
            <div className="h-0.5 bg-slate-200 rounded" />
            <div className="h-0.5 bg-slate-200 rounded w-3/4" />
          </div>
        </div>
      );
  }
};

export default TemplateThumbnail;
