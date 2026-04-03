// components/ProfileManager.tsx
// Manages multiple named user profiles — create, switch, rename, delete.
// Fully responsive: card list on desktop, bottom-sheet feel on mobile.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
                                    className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-zinc-200 dark:border-neutral-600 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
                                    title="Rename / recolor"
                                >
                                    <span>✏️</span>
                                    <span className="hidden sm:inline">Edit</span>
                                </button>
                                {profiles.length > 1 && (
                                    confirmDeleteId === slot.id ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { onDelete(slot.id); setConfirmDeleteId(null); }}
                                                className="text-[11px] px-2.5 py-1.5 rounded-lg text-red-600 font-bold bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                            >
                                                Confirm
                                            </button>
                                            <button
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="text-[11px] px-1.5 py-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmDeleteId(slot.id)}
                                            className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-zinc-200 dark:border-neutral-600 hover:border-red-200 dark:hover:border-red-800 transition-all"
                                            title="Delete"
                                        >
                                            <span>🗑️</span>
                                            <span className="hidden sm:inline">Delete</span>
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

    const modalJsx = modal && createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={() => setModal(null)}
        >
            <div
                className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden"
                style={{ maxHeight: '90vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-neutral-800">
                    <div>
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">
                            {modal.mode === 'create' ? 'Create New Profile' : 'Edit Profile'}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {modal.mode === 'create' ? 'Each profile stores its own CV data' : 'Update name and color'}
                        </p>
                    </div>
                    <button
                        onClick={() => setModal(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors text-lg font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">

                    {/* Profile Name */}
                    <div>
                        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-2">
                            Profile Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            placeholder='e.g. Software Engineer, Product Manager…'
                            className="w-full rounded-xl border-2 border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                            autoFocus
                        />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
                            Use a role or goal name to keep profiles organised
                        </p>
                    </div>

                    {/* Accent Colour */}
                    <div>
                        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-3">
                            Profile Color
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {COLORS.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setColor(c.id)}
                                    className={`w-11 h-11 rounded-full ${c.bg} transition-all flex items-center justify-center ${color === c.id ? `scale-110 ring-4 ${c.ring} ring-offset-2 ring-offset-white dark:ring-offset-neutral-900` : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
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
                        <div className="rounded-xl border-2 border-indigo-100 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Copy current profile data</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Duplicates your existing work experience, skills &amp; education</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCloneActive(!cloneActive)}
                                    className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${cloneActive ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-neutral-600'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${cloneActive ? 'translate-x-6' : ''}`} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
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
                        className="flex-2 flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-extrabold transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        {modal.mode === 'create' ? '+ Create Profile' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
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
