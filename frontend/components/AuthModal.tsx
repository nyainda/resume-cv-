/**
 * AuthModal — "Sign in to continue" modal.
 *
 * Two paths:
 *   1. Continue with Google (uses existing GoogleAuthContext popup flow)
 *   2. Email magic link (calls /api/auth/magic-link/send)
 *
 * Design: ProCV brand — Navy #1B2B4B, Gold #C9A84C, Off-white #F8F7F4.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { sendMagicLink } from '../services/authService';
import type { WorkerUser } from '../services/authService';
import { useWorkerAuth } from '../auth/WorkerAuthContext';

interface AuthModalProps {
    open: boolean;
    onSuccess: (token: string, user: WorkerUser) => void;
    onDismiss: () => void;
}

type Screen = 'main' | 'magic-form' | 'magic-sent';

export default function AuthModal({ open, onSuccess, onDismiss }: AuthModalProps) {
    const { signIn: googleSignIn, isAuthenticated: isGoogleAuthed } = useGoogleAuth();
    const { isWorkerAuthenticated, rememberDevice, setRememberDevice } = useWorkerAuth();

    const [screen, setScreen]         = useState<Screen>('main');
    const [email, setEmail]            = useState('');
    const [emailError, setEmailError]  = useState('');
    const [sending, setSending]        = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [mainNotice, setMainNotice]  = useState('');
    const emailRef = useRef<HTMLInputElement>(null);

    // Reset on open
    useEffect(() => {
        if (open) {
            setScreen('main');
            setEmail('');
            setEmailError('');
            setSending(false);
            setGoogleLoading(false);
            setMainNotice('');
        }
    }, [open]);

    // Focus email input when magic form appears
    useEffect(() => {
        if (screen === 'magic-form') {
            setTimeout(() => emailRef.current?.focus(), 50);
        }
    }, [screen]);

    // If the user somehow becomes worker-authenticated while modal is open, close it
    useEffect(() => {
        if (isWorkerAuthenticated && open) onDismiss();
    }, [isWorkerAuthenticated, open, onDismiss]);

    if (!open) return null;

    // ── Google sign-in ────────────────────────────────────────────────────────

    async function handleGoogle() {
        setGoogleLoading(true);
        try {
            await googleSignIn();
            // WorkerAuthContext picks up the google user change via useEffect
            // and calls onSuccess automatically — nothing more to do here.
        } catch (e) {
            console.warn('[AuthModal] Google sign-in failed:', e);
            setGoogleLoading(false);
        }
    }

    // ── Magic link ────────────────────────────────────────────────────────────

    async function handleSendMagicLink(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
            setEmailError('Please enter a valid email address.');
            return;
        }
        setEmailError('');
        setSending(true);
        const appUrl = window.location.origin;
        const result = await sendMagicLink(trimmed, appUrl);
        setSending(false);
        if (result.ok) {
            setScreen('magic-sent');
        } else if (result.error === 'email_not_configured') {
            setScreen('main');
            setMainNotice('Email sign-in is not available right now. Please use Google to sign in.');
        } else if (result.error === 'rate_limited') {
            const mins = result.retry_after ? Math.ceil(result.retry_after / 60) : 15;
            setEmailError(`Too many attempts. Please wait ${mins} minute${mins !== 1 ? 's' : ''} and try again.`);
        } else if (result.error === 'email_send_failed') {
            setEmailError('Email delivery failed. Please try again in a moment or use Google sign-in.');
        } else {
            setEmailError('Something went wrong. Please try again or use Google sign-in.');
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
        >
            <div
                className="relative w-full max-w-[420px] rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: '#FFFFFF' }}
                role="dialog"
                aria-modal="true"
                aria-label="Sign in to ProCV"
            >
                {/* Header */}
                <div style={{ background: '#1B2B4B' }} className="px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white/10 rounded-lg">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                        </div>
                        <div>
                            <span style={{ color: '#C9A84C', fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 18 }}>ProCV</span>
                            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 1 }}>Your Personal Career Consultant</p>
                        </div>
                    </div>
                    <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginTop: 20, letterSpacing: '-0.3px' }}>
                        {screen === 'magic-sent' ? '✉️ Check your email' : 'Sign in to continue'}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
                        {screen === 'magic-sent'
                            ? `We sent a sign-in link to ${email}`
                            : 'Free to use. No password needed.'}
                    </p>
                </div>

                {/* Body */}
                <div className="px-8 py-7">

                    {/* ── Main screen ──────────────────────────────────────── */}
                    {screen === 'main' && (
                        <div className="flex flex-col gap-3">
                            {/* Notice banner (e.g. email not configured) */}
                            {mainNotice && (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>{mainNotice}</span>
                                </div>
                            )}
                            {/* Google button */}
                            <button
                                onClick={handleGoogle}
                                disabled={googleLoading}
                                className="flex items-center justify-center gap-3 w-full py-3 px-5 rounded-xl border-2 font-semibold text-sm transition-all"
                                style={{
                                    borderColor: '#1B2B4B',
                                    background: googleLoading ? '#f4f4f4' : '#1B2B4B',
                                    color: '#ffffff',
                                    opacity: googleLoading ? 0.7 : 1,
                                }}
                            >
                                {googleLoading ? (
                                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                ) : (
                                    <GoogleLogo />
                                )}
                                {googleLoading ? 'Connecting…' : 'Continue with Google'}
                            </button>

                            {/* Divider */}
                            <div className="flex items-center gap-3 my-1">
                                <div className="flex-1 h-px" style={{ background: '#e5e7eb' }} />
                                <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>or</span>
                                <div className="flex-1 h-px" style={{ background: '#e5e7eb' }} />
                            </div>

                            {/* Email magic link button */}
                            <button
                                onClick={() => setScreen('magic-form')}
                                className="flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl border font-semibold text-sm transition-all hover:bg-gray-50"
                                style={{ borderColor: '#d1d5db', color: '#374151' }}
                            >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                                Continue with Email
                            </button>

                            {/* Remember this device */}
                            <label className="flex items-center gap-2.5 cursor-pointer select-none" style={{ marginTop: 2 }}>
                                <div
                                    onClick={() => setRememberDevice(!rememberDevice)}
                                    className="relative flex-shrink-0 w-4 h-4 rounded border-2 transition-all flex items-center justify-center"
                                    style={{
                                        background: rememberDevice ? '#1B2B4B' : '#fff',
                                        borderColor: rememberDevice ? '#1B2B4B' : '#d1d5db',
                                    }}
                                >
                                    {rememberDevice && (
                                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2 6 5 9 10 3"/>
                                        </svg>
                                    )}
                                </div>
                                <span
                                    onClick={() => setRememberDevice(!rememberDevice)}
                                    style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}
                                >
                                    Remember me on this device
                                    <span style={{ color: '#9ca3af', fontSize: 11 }}> — untick to sign out when you close the browser</span>
                                </span>
                            </label>

                            <p style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                                By signing in you agree to our Terms of Service. Your CV data stays private.
                            </p>
                        </div>
                    )}

                    {/* ── Magic link form ───────────────────────────────────── */}
                    {screen === 'magic-form' && (
                        <form onSubmit={handleSendMagicLink} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="auth-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                    Your email address
                                </label>
                                <input
                                    ref={emailRef}
                                    id="auth-email"
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                                    placeholder="you@example.com"
                                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
                                    style={{
                                        borderColor: emailError ? '#ef4444' : '#d1d5db',
                                        boxShadow: emailError ? '0 0 0 3px rgba(239,68,68,0.12)' : 'none',
                                        background: '#fafafa',
                                    }}
                                    onFocus={e => (e.target.style.borderColor = '#1B2B4B')}
                                    onBlur={e => (e.target.style.borderColor = emailError ? '#ef4444' : '#d1d5db')}
                                    autoComplete="email"
                                />
                                {emailError && (
                                    <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{emailError}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-white transition-all"
                                style={{ background: sending ? '#6b7280' : '#1B2B4B', opacity: sending ? 0.8 : 1 }}
                            >
                                {sending ? 'Sending…' : 'Send magic link →'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setScreen('main')}
                                className="text-sm text-center transition-colors"
                                style={{ color: '#6b7280' }}
                            >
                                ← Back
                            </button>
                        </form>
                    )}

                    {/* ── Magic link sent ───────────────────────────────────── */}
                    {screen === 'magic-sent' && (
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#F0F9FF' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                            </div>
                            <div>
                                <p style={{ color: '#1B2B4B', fontWeight: 700, fontSize: 15 }}>Magic link sent!</p>
                                <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                                    Open the email on any device — the link works for 15 minutes.
                                </p>
                            </div>
                            <button
                                onClick={() => setScreen('magic-form')}
                                className="text-sm transition-colors"
                                style={{ color: '#C9A84C', fontWeight: 600 }}
                            >
                                Resend or use a different email
                            </button>
                        </div>
                    )}
                </div>

                {/* Close button */}
                <button
                    onClick={onDismiss}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                    style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)' }}
                    aria-label="Close"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}

// ─── Google logo SVG ──────────────────────────────────────────────────────────

function GoogleLogo() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
    );
}
