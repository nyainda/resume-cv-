// RoomsPage.tsx — Standalone full-page Career Rooms manager
import React, { useState } from 'react';
import { UserProfileSlot, UserProfile, ProfileColor } from '../types';
import { canAddProfileSlot, getProfileSlotLimit } from '../services/accountTierService';
import { getSyncTimeAgo } from '../services/userDataCloudService';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

const COLORS: { id: ProfileColor; label: string; hex: string; bg: string; text: string; border: string }[] = [
  { id: 'indigo',  label: 'Navy',    hex: NAVY,      bg: 'bg-[#1B2B4B]',    text: 'text-[#1B2B4B] dark:text-[#C9A84C]', border: 'border-[#C9A84C]/40' },
  { id: 'violet',  label: 'Violet',  hex: '#7c3aed', bg: 'bg-violet-600',    text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-300' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', bg: 'bg-emerald-500',   text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-300' },
  { id: 'amber',   label: 'Amber',   hex: '#f59e0b', bg: 'bg-amber-500',     text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300' },
  { id: 'rose',    label: 'Rose',    hex: '#f43f5e', bg: 'bg-rose-500',      text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-300' },
  { id: 'sky',     label: 'Sky',     hex: '#0ea5e9', bg: 'bg-sky-500',       text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-300' },
];

function getColor(id: ProfileColor) {
  return COLORS.find(c => c.id === id) ?? COLORS[0];
}

function realRoles(p: UserProfile) {
  return (p.workExperience ?? []).filter(r => r.company?.trim() || r.jobTitle?.trim());
}
function realEducation(p: UserProfile) {
  return (p.education ?? []).filter(e => e.degree?.trim() || e.school?.trim());
}
function realSkillCount(p: UserProfile) {
  const raw = (p as any).skills;
  if (Array.isArray(raw)) return raw.filter((s: unknown) => typeof s === 'string' && (s as string).trim()).length;
  if (typeof raw === 'string') return (raw as string).split(/[,\n;]/).map((s: string) => s.trim()).filter(Boolean).length;
  return 0;
}
function profileStrength(p: UserProfile): number {
  let s = 0;
  if (p.personalInfo.name?.trim())            s += 15;
  if (p.personalInfo.email?.trim())           s += 10;
  if (p.summary?.trim().length >= 20)         s += 15;
  if (realRoles(p).length >= 1)               s += 20;
  if (realRoles(p).length >= 2)               s += 10;
  if (realEducation(p).length >= 1)           s += 10;
  if (realSkillCount(p) >= 3)                 s += 10;
  if (realSkillCount(p) >= 8)                 s += 5;
  if ((p.projects ?? []).filter((pr: any) => pr.name?.trim()).length >= 1) s += 5;
  return Math.min(s, 100);
}
function strengthMeta(v: number) {
  if (v >= 80) return { label: 'Excellent', color: '#16a34a' };
  if (v >= 60) return { label: 'Good',      color: GOLD };
  if (v >= 35) return { label: 'Building',  color: '#d97706' };
  return               { label: 'Early',    color: '#94a3b8' };
}
function timeAgo(iso: string | undefined | null) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface Props {
  profiles: UserProfileSlot[];
  activeSlot: UserProfileSlot | null | undefined;
  userProfile: UserProfile | null;
  onSwitch: (slot: UserProfileSlot) => void;
  onCreate: (name: string, color: ProfileColor, cloneFrom?: UserProfile) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string, color: ProfileColor) => void;
}

export default function RoomsPage({ profiles, activeSlot, userProfile, onSwitch, onCreate, onDelete, onRename }: Props) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; slot?: UserProfileSlot } | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalColor, setModalColor] = useState<ProfileColor>('indigo');
  const [cloneActive, setCloneActive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [duplicatedId, setDuplicatedId] = useState<string | null>(null);

  const openCreate = () => { setModalName(''); setModalColor('indigo'); setCloneActive(false); setModal({ mode: 'create' }); };
  const openEdit = (slot: UserProfileSlot) => { setModalName(slot.name); setModalColor(slot.color); setModal({ mode: 'edit', slot }); };

  const handleSubmit = () => {
    const trimmed = modalName.trim();
    if (!trimmed) return;
    if (modal?.mode === 'create') {
      onCreate(trimmed, modalColor, cloneActive && userProfile ? userProfile : undefined);
    } else if (modal?.mode === 'edit' && modal.slot) {
      onRename(modal.slot.id, trimmed, modalColor);
    }
    setModal(null);
  };

  const handleDuplicate = (slot: UserProfileSlot) => {
    onCreate(slot.name + ' (copy)', slot.color, slot.profile);
    setDuplicatedId(slot.id);
    setTimeout(() => setDuplicatedId(null), 1800);
  };

  const canAdd = canAddProfileSlot(profiles.length);
  const limit = getProfileSlotLimit();

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight">
            Career Rooms
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-md leading-relaxed">
            Each room is a separate career identity — its own profile, job target, CVs, and applications. Switch between them without mixing anything up.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {profiles.length} / {limit === Infinity ? '∞' : limit} rooms
          </span>
          {canAdd ? (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-95 shadow-sm"
              style={{ background: NAVY }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Room
            </button>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('procv:openPricing'))}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ background: GOLD }}
            >
              🔒 Upgrade for more rooms
            </button>
          )}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${NAVY}12` }}>
            🏠
          </div>
          <div>
            <p className="font-bold text-zinc-800 dark:text-zinc-100 text-lg">No rooms yet</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Create your first room to start building a career profile.</p>
          </div>
          <button
            onClick={openCreate}
            className="px-6 py-3 rounded-xl font-bold text-white text-sm shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: NAVY }}
          >
            + Create First Room
          </button>
        </div>
      )}

      {/* ── Room cards grid ─────────────────────────────────────────── */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active room first */}
          {[...profiles].sort((a, b) => {
            if (a.id === activeSlot?.id) return -1;
            if (b.id === activeSlot?.id) return 1;
            return 0;
          }).map(slot => {
            const c = getColor(slot.color);
            const isActive = slot.id === activeSlot?.id;
            const displayName = slot.profile?.personalInfo?.name || slot.name;
            const strength = profileStrength(slot.profile ?? {} as UserProfile);
            const sm = strengthMeta(strength);
            const cvCount = slot.savedCVs?.length ?? 0;
            const trackedCount = slot.trackedApps?.length ?? 0;
            const target = slot.targetJobTitle || slot.targetCompany || '';
            const lastGen = slot.lastGeneratedAt || slot.createdAt;
            const syncLabel = getSyncTimeAgo(slot.id);
            const isDup = duplicatedId === slot.id;

            return (
              <div
                key={slot.id}
                className={`relative rounded-2xl border-2 transition-all overflow-hidden ${
                  isActive
                    ? 'shadow-md'
                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 hover:border-zinc-300 dark:hover:border-neutral-600 hover:shadow-sm cursor-pointer'
                }`}
                style={isActive ? { borderColor: c.hex + '70', background: c.hex + '06' } : {}}
                onClick={() => { if (!isActive) onSwitch(slot); }}
              >
                {/* Active accent bar */}
                {isActive && (
                  <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ background: c.hex }} />
                )}

                <div className={`p-5 ${isActive ? 'pl-6' : ''}`}>
                  {/* Top row: avatar + name + badges + actions */}
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0 shadow-sm`}
                      style={{ background: c.hex }}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight">
                          {slot.name}
                        </span>
                        {isActive && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ background: c.hex + '20', color: c.hex }}
                          >
                            Active
                          </span>
                        )}
                        {slot.lastAtsScore !== undefined && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded"
                            style={{
                              background: slot.lastAtsScore >= 80 ? '#dcfce7' : slot.lastAtsScore >= 60 ? '#fef9c3' : '#fee2e2',
                              color:      slot.lastAtsScore >= 80 ? '#15803d' : slot.lastAtsScore >= 60 ? '#a16207' : '#b91c1c',
                            }}
                          >
                            ATS {slot.lastAtsScore}
                          </span>
                        )}
                      </div>
                      {slot.profile?.personalInfo?.name && slot.profile.personalInfo.name !== slot.name && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{slot.profile.personalInfo.name}</p>
                      )}
                      {target && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">→ {target}</p>
                      )}
                    </div>

                    {/* Action buttons — always visible */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(slot)}
                        title="Rename / recolor"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicate(slot)}
                        title="Duplicate room"
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDup
                            ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {isDup ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        )}
                      </button>
                      {/* Delete (only when >1 room) */}
                      {profiles.length > 1 && (
                        confirmDeleteId === slot.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { onDelete(slot.id); setConfirmDeleteId(null); }}
                              className="text-[10px] px-2 py-1 rounded-lg text-red-600 font-bold bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                            >Yes</button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] px-1.5 py-1 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-700"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(slot.id)}
                            title="Delete room"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-3.5 text-xs text-zinc-400 dark:text-zinc-500">
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {cvCount} CV{cvCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      {trackedCount} tracked
                    </span>
                    {lastGen && (
                      <span className="flex items-center gap-1 ml-auto">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {timeAgo(lastGen)}
                      </span>
                    )}
                    {!lastGen && syncLabel && (
                      <span className="ml-auto text-[10px]">{syncLabel}</span>
                    )}
                  </div>

                  {/* Profile strength bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">Profile strength</span>
                      <span className="text-[10px] font-bold" style={{ color: sm.color }}>{sm.label} · {strength}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-neutral-700 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${strength}%`, background: sm.color }}
                      />
                    </div>
                  </div>

                  {/* Enter Room CTA (inactive rooms only) */}
                  {!isActive && (
                    <div className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-neutral-700">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSwitch(slot); }}
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                        style={{ background: c.hex, color: '#ffffff' }}
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                          <polyline points="10 17 15 12 10 7"/>
                          <line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                        Enter Room
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add room card — shows when under the limit */}
          {canAdd && (
            <button
              onClick={openCreate}
              className="rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700 p-8 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-600 hover:border-zinc-300 dark:hover:border-neutral-600 hover:text-zinc-500 dark:hover:text-zinc-500 transition-all hover:bg-zinc-50 dark:hover:bg-neutral-800/40 group"
            >
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-current flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span className="text-xs font-semibold">New Room</span>
            </button>
          )}
        </div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-zinc-200 dark:border-neutral-700 p-6 w-full max-w-sm">
            <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 mb-4">
              {modal.mode === 'create' ? 'New Room' : 'Edit Room'}
            </h3>

            {/* Name input */}
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-1.5">Room name</label>
            <input
              autoFocus
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Software Engineer, Product Manager…"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 mb-4"
            />

            {/* Color picker */}
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">Room colour</label>
            <div className="flex gap-2 mb-5">
              {COLORS.map(col => (
                <button
                  key={col.id}
                  onClick={() => setModalColor(col.id)}
                  title={col.label}
                  className={`w-8 h-8 rounded-full transition-transform ${modalColor === col.id ? 'scale-125 ring-2 ring-offset-2 ring-current' : 'hover:scale-110'}`}
                  style={{ background: col.hex, color: col.hex }}
                />
              ))}
            </div>

            {/* Clone toggle (create mode only) */}
            {modal.mode === 'create' && userProfile && (
              <label className="flex items-center gap-2.5 mb-5 cursor-pointer group">
                <div
                  onClick={() => setCloneActive(v => !v)}
                  className={`w-9 h-5 rounded-full flex items-center transition-colors flex-shrink-0 px-0.5 ${cloneActive ? 'bg-[#1B2B4B] dark:bg-[#C9A84C]' : 'bg-zinc-200 dark:bg-neutral-600'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${cloneActive ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200 transition-colors">
                  Copy profile data from active room
                </span>
              </label>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!modalName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: NAVY }}
              >
                {modal.mode === 'create' ? 'Create Room' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
