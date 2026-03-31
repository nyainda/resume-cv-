// components/ProfileManager.tsx
// Manages multiple named user profiles — create, switch, rename, delete.
// Fully responsive: card list on desktop, bottom-sheet feel on mobile.

import React, { useState, useEffect } from 'react';
import { UserProfile, UserProfileSlot, ProfileColor } from '../types';

const COLORS: { id: ProfileColor; bg: string; ring: string; text: string; border: string; lightBg: string }[] = [
    { id: 'indigo', bg: 'bg-indigo-600', ring: 'ring-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-700', lightBg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { id: 'violet', bg: 'bg-violet-600', ring: 'ring-violet-500', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-300 dark:border-violet-700', lightBg: 'bg-violet-50 dark:bg-violet-900/30' },
    { id: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', lightBg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { id: 'amber', bg: 'bg-amber-500', ring: 'ring-amber-500', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', lightBg: 'bg-amber-50 dark:bg-amber-900/30' },
    { id: 'rose', bg: 'bg-rose-500', ring: 'ring-rose-500', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-700', lightBg: 'bg-rose-50 dark:bg-rose-900/30' },
    { id: 'sky', bg: 'bg-sky-500', ring: 'ring-sky-500', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-700', lightBg: 'bg-sky-50 dark:bg-sky-900/30' },
];

function getColor(id: ProfileColor) {
    return COLORS.find(c => c.id === id) ?? COLORS[0];
}

function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

interface ProfileManagerProps {
    profiles: UserProfileSlot[];
    activeProfileId: string | null;
    onSwitch: (slot: UserProfileSlot) => void;
    onCreate: (name: string, color: ProfileColor, cloneFrom?: UserProfile) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, name: string, color: ProfileColor) => void;
    currentProfile: UserProfile | null;
    /** If true renders as a full-screen mobile overlay, otherwise inline */
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

    // Lock body scroll when mobile overlay is open
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
            {/* ── Header ───────────────────────────── */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">Switch Profile</h3>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · tap to switch
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <span className="text-sm leading-none">+</span> New
                    </button>
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

            {/* ── Profile list ─────────────────────── */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
                {profiles.length === 0 && (
                    <div className="text-center py-10 text-zinc-400 dark:text-zinc-600 text-xs">
                        No profiles yet. Create your first one above.
                    </div>
                )}

                {profiles.map(slot => {
                    const c = getColor(slot.color);
                    const isActive = slot.id === activeProfileId;
                    const displayName = slot.profile.personalInfo.name || slot.name;

                    return (
                        <div
                            key={slot.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${isActive
                                ? `${c.border} ${c.lightBg} shadow-sm`
                                : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/50 active:scale-[0.98]'
                                }`}
                            onClick={() => { if (!isActive) { onSwitch(slot); onClose?.(); } }}
                        >
                            {/* Avatar */}
                            <div className={`w-10 h-10 rounded-full ${c.bg} flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0 ${isActive ? `ring-2 ${c.ring} ring-offset-2 ring-offset-white dark:ring-offset-neutral-800` : ''}`}>
                                {initials(displayName)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{slot.name}</span>
                                    {isActive && (
                                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${c.text} bg-white/70 dark:bg-neutral-800/70 border ${c.border}`}>
                                            Active
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                                    {displayName !== slot.name ? `${displayName} · ` : ''}
                                    {slot.profile.workExperience.length} roles · {slot.profile.skills.length} skills
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                {!isActive && (
                                    <button
                                        onClick={() => { onSwitch(slot); onClose?.(); }}
                                        className={`hidden sm:block text-[11px] font-bold px-2 py-1 rounded-md ${c.text} hover:${c.lightBg} transition-colors`}
                                    >
                                        Use
                                    </button>
                                )}
                                <button
                                    onClick={e => openEdit(slot, e)}
                                    className="text-base px-1.5 py-1 rounded-md text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
                                    title="Rename / recolor"
                                >
                                    ✏️
                                </button>
                                {profiles.length > 1 && (
                                    confirmDeleteId === slot.id ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { onDelete(slot.id); setConfirmDeleteId(null); }}
                                                className="text-[10px] px-2 py-1 rounded-md text-red-600 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="text-[10px] px-1 py-1 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmDeleteId(slot.id)}
                                            className="text-base px-1.5 py-1 rounded-md text-zinc-200 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    );

    const modalJsx = modal && (
        <div
            className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 sm:p-6"
            onClick={() => setModal(null)}
        >
            <div
                className="bg-white dark:bg-neutral-800 w-full max-w-[400px] rounded-3xl shadow-2xl p-6 space-y-6 max-h-[95vh] overflow-y-auto scrollbar-thin"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
                        {modal.mode === 'create' ? '✨ New Profile' : '✏️ Edit Profile'}
                    </h3>
                    <button onClick={() => setModal(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
                </div>

                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-2">
                        Profile Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        placeholder='e.g. Software Engineer'
                        className="w-full rounded-xl border-2 border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-3">
                        Accent Colour
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {COLORS.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setColor(c.id)}
                                className={`w-10 h-10 rounded-full ${c.bg} transition-all ${color === c.id ? `scale-110 ring-4 ${c.ring} ring-offset-2 ring-offset-white dark:ring-offset-neutral-800` : 'hover:scale-105'}`}
                                title={c.id}
                            />
                        ))}
                    </div>
                </div>

                {modal.mode === 'create' && currentProfile && (
                    <label className="flex items-center gap-4 p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 cursor-pointer" onClick={() => setCloneActive(!cloneActive)}>
                        <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${cloneActive ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-neutral-600'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${cloneActive ? 'translate-x-5' : ''}`} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Clone current data</p>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Copy your existing work & education</p>
                        </div>
                    </label>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={() => setModal(null)}
                        className="flex-1 py-3.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-extrabold transition-colors shadow-lg"
                    >
                        {modal.mode === 'create' ? 'Create' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );

    // Mobile overlay mode: full-screen bottom sheet
    if (isMobileOverlay) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
                <div className="flex-1 bg-black/50" />
                <div
                    className="bg-white dark:bg-neutral-900 rounded-t-3xl shadow-2xl p-6 max-h-[85vh] flex flex-col"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Drag handle */}
                    <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-neutral-700 mx-auto mb-4 flex-shrink-0" />
                    {content}
                </div>
                {modalJsx}
            </div>
        );
    }

    // Desktop inline mode (inside a dropdown panel)
    return (
        <>
            {content}
            {modalJsx}
        </>
    );
};

export default ProfileManager;
