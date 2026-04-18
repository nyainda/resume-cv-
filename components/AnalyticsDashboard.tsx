import React, { useMemo } from 'react';
import { TrackedApplication } from '../types';

interface Props {
  trackedApps: TrackedApplication[];
  onGoToTracker: () => void;
}

const STATUS_ORDER = ['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'] as const;
const STATUS_COLORS: Record<string, string> = {
  Wishlist: '#818cf8',
  Applied: '#60a5fa',
  Interviewing: '#f59e0b',
  Offer: '#10b981',
  Rejected: '#f87171',
};
const STATUS_BG: Record<string, string> = {
  Wishlist: 'bg-[#C9A84C]/60',
  Applied: 'bg-blue-400',
  Interviewing: 'bg-amber-400',
  Offer: 'bg-emerald-500',
  Rejected: 'bg-red-400',
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
      <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-extrabold ${color ?? 'text-zinc-900 dark:text-zinc-50'}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function WeeklyHeatmap({ apps }: { apps: TrackedApplication[] }) {
  const weeks = 14;
  const today = new Date();
  const cells: { date: string; count: number }[] = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    cells.push({ date: key, count: 0 });
  }
  apps.forEach(app => {
    const cell = cells.find(c => c.date === app.dateApplied);
    if (cell) cell.count++;
  });

  const max = Math.max(1, ...cells.map(c => c.count));

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const chunked: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) chunked.push(cells.slice(i, i + 7));

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Application Activity — Last 14 Weeks</h3>
      <div className="flex gap-1.5">
        <div className="flex flex-col justify-between pt-6 pb-0.5 gap-1">
          {dayLabels.map((d, i) => (
            <span key={i} className="text-[9px] text-zinc-400 w-3 text-center leading-none">{d}</span>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1">
          {chunked.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1.5 flex-shrink-0">
              {wi === 0 && <div className="h-5" />}
              {wi > 0 && wi % 2 === 0 && (
                <div className="h-5 flex items-center">
                  <span className="text-[9px] text-zinc-300 dark:text-zinc-600 leading-none whitespace-nowrap">
                    {new Date(week[0]?.date || '').toLocaleDateString('en', { month: 'short' })}
                  </span>
                </div>
              )}
              {wi > 0 && wi % 2 !== 0 && <div className="h-5" />}
              {week.map((cell, di) => {
                const intensity = cell.count === 0 ? 0 : Math.ceil((cell.count / max) * 4);
                const bg = ['bg-zinc-100 dark:bg-neutral-700', 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20', 'bg-[#C9A84C]/40 dark:bg-[#152238]', 'bg-[#1B2B4B]', 'bg-[#152238]'][intensity];
                return (
                  <div
                    key={di}
                    title={`${cell.date}: ${cell.count} application${cell.count !== 1 ? 's' : ''}`}
                    className={`w-4 h-4 rounded-sm ${bg} transition-colors cursor-default`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-[10px] text-zinc-400">Less</span>
        {['bg-zinc-100 dark:bg-neutral-700', 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20', 'bg-[#C9A84C]/40', 'bg-[#1B2B4B]', 'bg-[#152238]'].map((bg, i) => (
          <div key={i} className={`w-3.5 h-3.5 rounded-sm ${bg}`} />
        ))}
        <span className="text-[10px] text-zinc-400">More</span>
      </div>
    </div>
  );
}

function FunnelChart({ apps }: { apps: TrackedApplication[] }) {
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = apps.filter(a => {
      if (s === 'Wishlist') return a.status === 'Wishlist';
      if (s === 'Applied') return ['Applied', 'Interviewing', 'Offer'].includes(a.status);
      if (s === 'Interviewing') return ['Interviewing', 'Offer'].includes(a.status);
      if (s === 'Offer') return a.status === 'Offer';
      if (s === 'Rejected') return a.status === 'Rejected';
      return false;
    }).length;
    return acc;
  }, {} as Record<string, number>);

  const max = Math.max(1, apps.length);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Application Funnel</h3>
      <div className="space-y-2.5">
        {STATUS_ORDER.filter(s => s !== 'Rejected').map(s => (
          <div key={s}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_BG[s]}`} />
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{s}</span>
              </div>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{counts[s]}</span>
            </div>
            <div className="h-2.5 bg-zinc-100 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(counts[s] / max) * 100}%`, backgroundColor: STATUS_COLORS[s] }}
              />
            </div>
          </div>
        ))}
      </div>
      {apps.length === 0 && (
        <p className="text-xs text-zinc-400 text-center mt-4">No applications yet.</p>
      )}
    </div>
  );
}

function TopCompanies({ apps }: { apps: TrackedApplication[] }) {
  const companyCounts = apps.reduce((acc, a) => {
    acc[a.company] = (acc[a.company] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sorted = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, sorted[0]?.[1] ?? 1);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Top Companies Applied To</h3>
      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-400 text-center py-4">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([company, count]) => (
            <div key={company} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 w-28 truncate flex-shrink-0">{company}</span>
              <div className="flex-1 h-2 bg-zinc-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className="h-full bg-[#1B2B4B] rounded-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-zinc-500 w-4 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBreakdown({ apps }: { apps: TrackedApplication[] }) {
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const total = apps.length || 1;
  let cumulativeAngle = -90;

  const segments = STATUS_ORDER.map(s => {
    const pct = counts[s] / total;
    const startAngle = cumulativeAngle;
    const sweep = pct * 360;
    cumulativeAngle += sweep;
    return { status: s, count: counts[s], pct, startAngle, sweep };
  }).filter(s => s.count > 0);

  const toXY = (angle: number, r: number) => ({
    x: 50 + r * Math.cos((angle * Math.PI) / 180),
    y: 50 + r * Math.sin((angle * Math.PI) / 180),
  });

  const arcPath = (start: number, sweep: number) => {
    if (sweep >= 359.9) {
      return `M 50 10 A 40 40 0 1 1 49.999 10 Z`;
    }
    const s = toXY(start, 40);
    const e = toXY(start + sweep, 40);
    const large = sweep > 180 ? 1 : 0;
    return `M 50 50 L ${s.x} ${s.y} A 40 40 0 ${large} 1 ${e.x} ${e.y} Z`;
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Status Breakdown</h3>
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
          {apps.length === 0 ? (
            <circle cx="50" cy="50" r="40" fill="#e4e4e7" />
          ) : (
            segments.map(seg => (
              <path key={seg.status} d={arcPath(seg.startAngle, seg.sweep)} fill={STATUS_COLORS[seg.status]} />
            ))
          )}
          <circle cx="50" cy="50" r="22" fill="white" className="dark:fill-neutral-800" />
          <text x="50" y="53" textAnchor="middle" className="fill-zinc-700 dark:fill-zinc-300" fontSize="12" fontWeight="bold">{apps.length}</text>
          <text x="50" y="63" textAnchor="middle" fill="#9ca3af" fontSize="6">total</text>
        </svg>
        <div className="space-y-1.5">
          {STATUS_ORDER.map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
              <span className="text-xs text-zinc-600 dark:text-zinc-400 w-20">{s}</span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{counts[s]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const AnalyticsDashboard: React.FC<Props> = ({ trackedApps, onGoToTracker }) => {
  const stats = useMemo(() => {
    const total = trackedApps.length;
    const applied = trackedApps.filter(a => ['Applied', 'Interviewing', 'Offer'].includes(a.status)).length;
    const interviewing = trackedApps.filter(a => ['Interviewing', 'Offer'].includes(a.status)).length;
    const offers = trackedApps.filter(a => a.status === 'Offer').length;
    const rejected = trackedApps.filter(a => a.status === 'Rejected').length;
    const responseRate = applied > 0 ? Math.round((interviewing / applied) * 100) : 0;
    const offerRate = applied > 0 ? Math.round((offers / applied) * 100) : 0;

    const upcoming = trackedApps.filter(a => {
      if (!a.interviewDate) return false;
      const d = new Date(a.interviewDate);
      const now = new Date();
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;

    return { total, applied, interviewing, offers, rejected, responseRate, offerRate, upcoming };
  }, [trackedApps]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Analytics Dashboard</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your job search performance at a glance.</p>
        </div>
        {trackedApps.length === 0 && (
          <button
            onClick={onGoToTracker}
            className="px-4 py-2 bg-[#1B2B4B] hover:bg-[#152238] text-white text-sm font-bold rounded-xl transition-colors"
          >
            Add Applications →
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Applications" value={stats.total} sub="all time" />
        <StatCard label="Response Rate" value={`${stats.responseRate}%`} sub={`${stats.interviewing} interviews`} color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Offer Rate" value={`${stats.offerRate}%`} sub={`${stats.offers} offer${stats.offers !== 1 ? 's' : ''}`} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Upcoming Interviews" value={stats.upcoming} sub="next 7 days" color="text-[#1B2B4B] dark:text-[#C9A84C]" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FunnelChart apps={trackedApps} />
        <StatusBreakdown apps={trackedApps} />
      </div>

      {/* Heatmap */}
      <WeeklyHeatmap apps={trackedApps} />

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopCompanies apps={trackedApps} />
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Pipeline Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-neutral-700/50 rounded-xl">
              <div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Active Pipeline</p>
                <p className="text-xs text-zinc-400 mt-0.5">Applications still in play</p>
              </div>
              <span className="text-2xl font-extrabold text-[#1B2B4B] dark:text-[#C9A84C]">
                {trackedApps.filter(a => !['Rejected'].includes(a.status)).length}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-neutral-700/50 rounded-xl">
              <div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Dream Role Applications</p>
                <p className="text-xs text-zinc-400 mt-0.5">Priority: Dream</p>
              </div>
              <span className="text-2xl font-extrabold text-amber-500">
                {trackedApps.filter(a => a.priority === 'Dream').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-neutral-700/50 rounded-xl">
              <div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Rejection Rate</p>
                <p className="text-xs text-zinc-400 mt-0.5">Of all applied</p>
              </div>
              <span className="text-2xl font-extrabold text-red-400">
                {stats.applied > 0 ? `${Math.round((stats.rejected / stats.applied) * 100)}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
