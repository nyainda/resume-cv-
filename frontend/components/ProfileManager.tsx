// components/ProfileManager.tsx
// Multi-profile switcher — rich cards with JD target, stats, and tracker info.
// Each profile is a fully isolated "room" with its own JD, targeting, and CV.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserProfile, UserProfileSlot, ProfileColor } from '../types';
import { canAddProfileSlot, getProfileSlotLimit, isPureFreeTier, hasByokKeys } from '../services/accountTierService';
import { getSyncTimeAgo } from '../services/userDataCloudService';

const COLORS: { id: ProfileColor; bg: string; ring: string; text: string; border: string; lightBg: string; hex: string }[] = [
    { id: 'indigo',  bg: 'bg-[#1B2B4B]',    ring: 'ring-[#C9A84C]',     text: 'text-[#1B2B4B] dark:text-[#C9A84C]',           border: 'border-[#C9A84C]/40',         lightBg: 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20',    hex: '#1B2B4B' },
    { id: 'violet',  bg: 'bg-violet-600',    ring: 'ring-violet-500',    text: 'text-violet-600 dark:text-violet-400',           border: 'border-violet-300',            lightBg: 'bg-violet-50 dark:bg-violet-900/30',    hex: '#7c3aed' },
    { id: 'emerald', bg: 'bg-emerald-500',   ring: 'ring-emerald-500',   text: 'text-emerald-600 dark:text-emerald-400',         border: 'border-emerald-300',           lightBg: 'bg-emerald-50 dark:bg-emerald-900/30', hex: '#10b981' },
    { id: 'amber',   bg: 'bg-amber-500',     ring: 'ring-amber-500',     text: 'text-amber-600 dark:text-amber-400',             border: 'border-amber-300',             lightBg: 'bg-amber-50 dark:bg-amber-900/30',      hex: '#f59e0b' },
    { id: 'rose',    bg: 'bg-rose-500',      ring: 'ring-rose-500',      text: 'text-rose-600 dark:text-rose-400',               border: 'border-rose-300',              lightBg: 'bg-rose-50 dark:bg-rose-900/30',        hex: '#f43f5e' },
    { id: 'sky',     bg: 'bg-sky-500',       ring: 'ring-sky-500',       text: 'text-sky-600 dark:text-sky-400',                 border: 'border-sky-300',               lightBg: 'bg-sky-50 dark:bg-sky-900/30',          hex: '#0ea5e9' },
];

function getColor(id: ProfileColor) {
    return COLORS.find(c => c.id === id) ?? COLORS[0];
}

// Helpers below require actual non-empty content, not just array length.
// ProfileForm seeds workExperience/education/projects with one blank
// placeholder entry (all fields ''), so `.length` alone always reads >= 1
// for a brand-new, completely empty profile — inflating the score for
// nothing typed in. See cvCompleteness.ts for the same fix applied there.
function realRoles(p: UserProfile) {
    return (p.workExperience ?? []).filter(r => r.company?.trim() || r.jobTitle?.trim());
}
function realEducation(p: UserProfile) {
    return (p.education ?? []).filter(e => e.degree?.trim() || e.school?.trim());
}
function realProjects(p: UserProfile) {
    return (p.projects ?? []).filter(pr => pr.name?.trim());
}
function realSkillCount(p: UserProfile) {
    const raw = (p as any).skills;
    if (Array.isArray(raw)) return raw.filter((s: unknown) => typeof s === 'string' && s.trim()).length;
    if (typeof raw === 'string') return raw.split(/[,\n;]/).map(s => s.trim()).filter(Boolean).length;
    return 0;
}

function profileStrength(p: UserProfile): number {
    let score = 0;
    if (p.personalInfo.name?.trim())                          score += 15;
    if (p.personalInfo.email?.trim())                         score += 10;
    if (p.personalInfo.phone?.trim() || (p.personalInfo as any).linkedin?.trim()) score += 5;
    if (p.summary?.trim().length >= 20)                       score += 15;
    const roles = realRoles(p).length;
    if (roles >= 1) score += 15;
    if (roles >= 2) score += 5;
    if (realRoles(p).some(r => r.description?.trim().length > 30)) score += 10;
    const skillCount = realSkillCount(p);
    if (skillCount >= 3)  score += 10;
    if (skillCount >= 10) score += 5;
    if (realEducation(p).length >= 1)  score += 10;
    if (realProjects(p).length >= 1)   score += 5;
    return Math.min(score, 100);
}

function strengthLabel(pct: number): string {
    if (pct >= 85) return 'Complete';
    if (pct >= 60) return 'Good';
    if (pct >= 35) return 'Needs work';
    return 'Starter';
}

function strengthColor(pct: number): string {
    if (pct >= 70) return '#10b981';   // emerald
    if (pct >= 40) return '#f59e0b';   // amber
    return '#f43f5e';                   // rose
}

// Returns up to 3 actionable tips for missing profile items, highest-value first.
function strengthTips(p: UserProfile): string[] {
    const tips: Array<{ msg: string; pts: number }> = [];
    if (!p.personalInfo.name?.trim())
        tips.push({ msg: 'Add your full name', pts: 15 });
    if (!p.personalInfo.email?.trim())
        tips.push({ msg: 'Add your email address', pts: 10 });
    if (!p.summary?.trim() || p.summary.trim().length < 20)
        tips.push({ msg: 'Write a professional summary', pts: 15 });
    const roles = realRoles(p).length;
    if (roles === 0)
        tips.push({ msg: 'Add at least one work experience', pts: 15 });
    else if (roles === 1)
        tips.push({ msg: 'Add a second work experience', pts: 5 });
    if (roles > 0 && !realRoles(p).some(r => r.description?.trim().length > 30))
        tips.push({ msg: 'Add bullet points to your experience', pts: 10 });
    const sc = realSkillCount(p);
    if (sc < 3)
        tips.push({ msg: 'Add at least 5 skills', pts: 10 });
    else if (sc < 10)
        tips.push({ msg: `Add more skills (${sc}/10)`, pts: 5 });
    if (realEducation(p).length === 0)
        tips.push({ msg: 'Add your education', pts: 10 });
    if (!p.personalInfo.phone?.trim() && !(p.personalInfo as any).linkedin?.trim())
        tips.push({ msg: 'Add phone number or LinkedIn URL', pts: 5 });
    if (realProjects(p).length === 0)
        tips.push({ msg: 'Add a projects section', pts: 5 });
    return tips
        .sort((a, b) => b.pts - a.pts)
        .slice(0, 3)
        .map(t => t.msg);
}

function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function timeAgo(iso?: string): string {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function jdSnippet(jd?: string): string {
    if (!jd || !jd.trim()) return '';
    return jd.trim().slice(0, 60) + (jd.trim().length > 60 ? '…' : '');
}

interface ProfileManagerProps {
    profiles: UserProfileSlot[];
    activeProfileId: string | null;
    onSwitch: (slot: UserProfileSlot) => void;
    onCreate: (name: string, color: ProfileColor, cloneFrom?: UserProfile) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, name: string, color: ProfileColor) => void;
    currentProfile: UserProfile | null;
    isMobileOverlay?: boolean;
    onClose?: () => void;
}

type Modal = null | { mode: 'create' } | { mode: 'edit'; slot: UserProfileSlot };

export const ProfileManager: React.FC<ProfileManagerProps> = ({
    profiles,
    activeProfileId,
    onSwitch,
    onCreate,
    onDelete,
    onRename,
    currentProfile,
    isMobileOverlay,
    onClose,
}) => {
    const [modal, setModal] = useState<Modal>(null);
    const [name, setName] = useState('');
    const [color, setColor] = useState<ProfileColor>('indigo');
    const [cloneActive, setCloneActive] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [duplicatedId,   setDuplicatedId]   = useState<string | null>(null);
    const [tipsOpenId,     setTipsOpenId]     = useState<string | null>(null);

    useEffect(() => {
        if (isMobileOverlay) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isMobileOverlay]);

    const openCreate = () => {
        setName('');
        setColor('indigo');
        setCloneActive(false);
        setModal({ mode: 'create' });
    };

    const openEdit = (slot: UserProfileSlot, e: React.MouseEvent) => {
        e.stopPropagation();
        setName(slot.name);
        setColor(slot.color);
        setModal({ mode: 'edit', slot });
    };

    const handleDuplicate = (slot: UserProfileSlot, e: React.MouseEvent) => {
        e.stopPropagation();
        onCreate(slot.name + ' (copy)', slot.color, slot.profile);
        setDuplicatedId(slot.id);
        setTimeout(() => setDuplicatedId(null), 1800);
    };

    const handleSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (modal?.mode === 'create') {
            onCreate(trimmed, color, cloneActive && currentProfile ? currentProfile : undefined);
        } else if (modal?.mode === 'edit') {
            onRename(modal.slot.id, trimmed, color);
        }
        setModal(null);
    };

    const content = (
        <div className="flex flex-col h-full">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">Career Profiles</h3>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · each is a separate room
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {canAddProfileSlot(profiles.length) ? (
                        <button
                            onClick={openCreate}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#152238] transition-colors shadow-sm"
                        >
                            <span className="text-sm leading-none">+</span> New Room
                        </button>
                    ) : (
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('procv:openPricing'))}
                            title={`Your plan allows ${getProfileSlotLimit()} profile${getProfileSlotLimit() !== 1 ? 's' : ''}. Upgrade for more.`}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#C9A84C] text-white hover:bg-[#b8963f] transition-colors shadow-sm"
                        >
                            <span className="text-sm leading-none">🔒</span> Upgrade for more rooms
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* ── Profile list ─────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
                {profiles.length === 0 && (
                    <div className="text-center py-10 text-zinc-400 dark:text-zinc-600 text-xs">
                        No profiles yet. Create your first room above.
                    </div>
                )}

                {profiles.map(slot => {
                    const c = getColor(slot.color);
                    const isActive = slot.id === activeProfileId;
                    const displayName = slot.profile.personalInfo.name || slot.name;
                    const cvCount = slot.savedCVs?.length ?? 0;
                    const trackedCount = slot.trackedApps?.length ?? 0;
                    const hasJD = !!(slot.jobDescription || slot.currentJobDescription);
                    const jd = jdSnippet(slot.jobDescription || slot.currentJobDescription);
                    const target = slot.targetJobTitle || slot.targetCompany || '';
                    const atsScore = slot.lastAtsScore;
                    const lastGen = slot.lastGeneratedAt || slot.createdAt;
                    const strength = profileStrength(slot.profile);
                    const sColor   = strengthColor(strength);
                    const sLabel   = strengthLabel(strength);
                    const sTips    = strengthTips(slot.profile);
                    const tipsOpen = tipsOpenId === slot.id && sTips.length > 0;
                    const syncLabel = getSyncTimeAgo(slot.id);

                    return (
                        <div
                            key={slot.id}
                            className={`group relative rounded-xl border-2 transition-all cursor-pointer select-none overflow-hidden ${
                                isActive
                                    ? `${c.border} shadow-md`
                                    : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/50 active:scale-[0.99]'
                            }`}
                            style={isActive ? { borderColor: c.hex + '60', background: c.hex + '08' } : {}}
                            onClick={() => { if (!isActive) { onSwitch(slot); onClose?.(); } }}
                        >
                            {/* Active accent bar */}
                            {isActive && (
                                <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-xl" style={{ background: c.hex }} />
                            )}

                            <div className={`flex items-start gap-3 p-3 ${isActive ? 'pl-4' : ''}`}>
                                {/* Avatar */}
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0 mt-0.5 ${
                                        isActive ? `ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-800` : ''
                                    }`}
                                    style={{ background: c.hex, ...(isActive ? { boxShadow: `0 0 0 2px ${c.hex}80` } : {}) }}
                                >
                                    {initials(displayName)}
                                </div>

                                {/* Main content */}
                                <div className="flex-1 min-w-0">
                                    {/* Row 1: name + active badge */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{slot.name}</span>
                                        {isActive && (
                                            <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                                                  style={{ background: c.hex }}>
                                                Active
                                            </span>
                                        )}
                                    </div>

                                    {/* Row 2: target company / job title */}
                                    {target ? (
                                        <p className="text-[11px] font-semibold truncate mt-0.5" style={{ color: c.hex }}>
                                            🎯 {target}
                                        </p>
                                    ) : (
                                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                                            {displayName !== slot.name ? displayName : `${slot.profile?.workExperience?.length ?? 0} roles · ${slot.profile?.skills?.length ?? 0} skills`}
                                        </p>
                                    )}

                                    {/* Row 3: JD snippet */}
                                    {jd && (
                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5 italic">
                                            "{jd}"
                                        </p>
                                    )}

                                    {/* Row 4: stats bar */}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        {/* CV count */}
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                            </svg>
                                            {cvCount} CV{cvCount !== 1 ? 's' : ''}
                                        </span>

                                        {/* Job tracker */}
                                        {trackedCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                                </svg>
                                                {trackedCount} tracked
                                            </span>
                                        )}

                                        {/* ATS score */}
                                        {atsScore !== undefined && (
                                            <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                atsScore >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : atsScore >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            }`}>
                                                ATS {atsScore}
                                            </span>
                                        )}

                                        {/* JD indicator */}
                                        {hasJD && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                                JD ready
                                            </span>
                                        )}

                                        {/* Last activity */}
                                        {lastGen && (
                                            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-auto">
                                                {timeAgo(lastGen)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Sync status row */}
                                    <div className="flex items-center gap-1 mt-1">
                                        {syncLabel ? (
                                            <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"/>
                                                </svg>
                                                Synced {syncLabel}
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[9px] font-medium text-amber-500 dark:text-amber-400">
                                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                                </svg>
                                                Not yet backed up
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0 self-center" onClick={e => e.stopPropagation()}>
                                    {/* Rename */}
                                    <button
                                        onClick={e => openEdit(slot, e)}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors opacity-60 sm:opacity-40 group-hover:opacity-100"
                                        title="Rename / recolor"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                    </button>
                                    {/* Duplicate */}
                                    <button
                                        onClick={e => handleDuplicate(slot, e)}
                                        className={`p-1.5 rounded-lg transition-colors opacity-60 sm:opacity-40 group-hover:opacity-100 ${
                                            duplicatedId === slot.id
                                                ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                                : 'text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] hover:bg-zinc-100 dark:hover:bg-neutral-700'
                                        }`}
                                        title="Duplicate room"
                                    >
                                        {duplicatedId === slot.id ? (
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                        ) : (
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                            </svg>
                                        )}
                                    </button>
                                    {profiles.length > 1 && (
                                        confirmDeleteId === slot.id ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => { onDelete(slot.id); setConfirmDeleteId(null); }}
                                                    className="text-[10px] px-2 py-1 rounded-lg text-red-600 font-bold bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="text-[10px] px-1.5 py-1 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-700"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(slot.id)}
                                                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-60 sm:opacity-40 group-hover:opacity-100"
                                                title="Delete"
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                                </svg>
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* ── Profile strength bar ── */}
                            <div
                                className="px-3 pb-2.5 cursor-default"
                                onClick={e => {
                                    e.stopPropagation();
                                    setTipsOpenId(tipsOpen ? null : (sTips.length > 0 ? slot.id : null));
                                }}
                                onMouseEnter={() => sTips.length > 0 && setTipsOpenId(slot.id)}
                                onMouseLeave={() => setTipsOpenId(null)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sColor }}>
                                        Profile strength
                                    </span>
                                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: sColor }}>
                                        {strength}% · {sLabel}
                                        {sTips.length > 0 && (
                                            <svg
                                                className="w-2.5 h-2.5 transition-transform duration-200"
                                                style={{ transform: tipsOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.7 }}
                                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                                            >
                                                <polyline points="6 9 12 15 18 9"/>
                                            </svg>
                                        )}
                                    </span>
                                </div>

                                {/* Track */}
                                <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-neutral-700 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${strength}%`, background: sColor }}
                                    />
                                </div>

                                {/* Tips panel — expands on hover/click when tips exist */}
                                {tipsOpen && (
                                    <div
                                        className="mt-2 rounded-lg border px-2.5 py-2 space-y-1"
                                        style={{
                                            background: sColor + '0d',
                                            borderColor: sColor + '30',
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p className="text-[9px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: sColor }}>
                                            Next steps to improve
                                        </p>
                                        {sTips.map((tip, ti) => (
                                            <div key={ti} className="flex items-start gap-1.5">
                                                <span className="mt-px text-[9px] flex-shrink-0" style={{ color: sColor }}>→</span>
                                                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 leading-snug">{tip}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const modalJsx = modal && createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
        >
            <div
                className="relative w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
                style={{ maxHeight: '92dvh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-neutral-800">
                    <div>
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">
                            {modal.mode === 'create' ? 'Create New Room' : 'Edit Profile'}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {modal.mode === 'create'
                                ? 'Each room has its own JD, targeting, and CV — completely isolated'
                                : 'Update name and color'}
                        </p>
                    </div>
                    <button
                        onClick={() => setModal(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors text-lg font-bold"
                    >
                        ×
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Profile Name */}
                    <div>
                        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-2">
                            Room Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            placeholder='e.g. Software Engineer, Product Manager…'
                            className="w-full rounded-xl border-2 border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#C9A84C]/20 transition"
                            autoFocus
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
                            Name it after the role you're targeting in this room
                        </p>
                    </div>

                    {/* Accent Colour */}
                    <div>
                        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">
                            Room Color
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {COLORS.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setColor(c.id)}
                                    className={`w-11 h-11 rounded-full transition-all flex items-center justify-center ${color === c.id ? 'scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
                                    style={{
                                        background: c.hex,
                                        ...(color === c.id ? { boxShadow: `0 0 0 3px white, 0 0 0 5px ${c.hex}` } : {}),
                                    }}
                                    title={c.id.charAt(0).toUpperCase() + c.id.slice(1)}
                                >
                                    {color === c.id && (
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Clone toggle (create mode only) */}
                    {modal.mode === 'create' && currentProfile && (
                        <div className="rounded-xl border-2 border-[#C9A84C]/20 dark:border-[#1B2B4B]/30 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Copy current profile data</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Duplicates work experience, skills &amp; education (not the JD or targeting)</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCloneActive(!cloneActive)}
                                    className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A84C] ${cloneActive ? 'bg-[#1B2B4B]' : 'bg-zinc-300 dark:bg-neutral-600'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${cloneActive ? 'translate-x-6' : ''}`} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 px-6 py-4 border-t border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900">
                    <button
                        type="button"
                        onClick={() => setModal(null)}
                        className="flex-1 py-3 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        className="flex-2 flex-1 py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] active:bg-[#152238] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-extrabold transition-colors shadow-lg shadow-[#1B2B4B]/20"
                    >
                        {modal.mode === 'create' ? '+ Create Room' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );

    if (isMobileOverlay) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
                <div className="flex-1 bg-black/50" />
                <div
                    className="bg-white dark:bg-neutral-900 rounded-t-3xl shadow-2xl p-5 flex flex-col"
                    style={{
                        maxHeight: '88dvh',
                        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-neutral-700 mx-auto mb-4 flex-shrink-0" />
                    {content}
                </div>
                {modalJsx}
            </div>
        );
    }

    return (
        <>
            {content}
            {modalJsx}
        </>
    );
};

export default ProfileManager;
