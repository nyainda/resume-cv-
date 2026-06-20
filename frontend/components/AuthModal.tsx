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
    /** Controls header copy. 'signup' = create account; 'signin' = welcome back. Default: 'signup'. */
    mode?: 'signup' | 'signin';
}

type Screen = 'main' | 'magic-form' | 'magic-sent';

const SIGNUP_FEATURES = [
    { icon: '✦', text: 'CV tailored to every job in minutes' },
    { icon: '✦', text: 'ATS-optimised · 35+ professional templates' },
    { icon: '✦', text: 'Interview prep, job tracker & more' },
];

export default function AuthModal({ open, onSuccess, onDismiss, mode: initialMode = 'signup' }: AuthModalProps) {
    const { signIn: googleSignIn, isAuthenticated: isGoogleAuthed } = useGoogleAuth();
    const { isWorkerAuthenticated, rememberDevice, setRememberDevice, googleRateLimited, clearGoogleRateLimit } = useWorkerAuth();

    const [mode, setMode]              = useState<'signup' | 'signin'>(initialMode);
    const [screen, setScreen]         = useState<Screen>('main');
    const [email, setEmail]            = useState('');
    const [emailError, setEmailError]  = useState('');
    const [sending, setSending]        = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [mainNotice, setMainNotice]  = useState('');
    const emailRef = useRef<HTMLInputElement>(null);

    // Sync mode when parent changes it (e.g. clicking "Sign in" vs "Get Started")
    useEffect(() => { setMode(initialMode); }, [initialMode]);

    useEffect(() => {
        if (open) {
            setScreen('main');
            setEmail('');
            setEmailError('');
            setSending(false);
            setGoogleLoading(false);
            setMainNotice('');
            clearGoogleRateLimit();
        }
    }, [open]);

    useEffect(() => {
        if (screen === 'magic-form') {
            setTimeout(() => emailRef.current?.focus(), 50);
        }
    }, [screen]);

    useEffect(() => {
        if (isWorkerAuthenticated && open) onDismiss();
    }, [isWorkerAuthenticated, open, onDismiss]);

    if (!open) return null;

    async function handleGoogle() {
        setGoogleLoading(true);
        try {
            await googleSignIn();
        } catch (e) {
            console.warn('[AuthModal] Google sign-in failed:', e);
            setGoogleLoading(false);
        }
    }

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
            setEmailError('Email delivery failed. Please try again or use Google sign-in.');
        } else {
            setEmailError('Something went wrong. Please try again or use Google sign-in.');
        }
    }

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,20,35,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
        >
            <div
                className="relative w-full max-w-[440px] rounded-3xl shadow-2xl overflow-hidden"
                style={{ background: '#FFFFFF' }}
                role="dialog"
                aria-modal="true"
                aria-label="Sign in to ProCV"
            >
                {/* ── Decorative Header ──────────────────────────────────── */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #1B2B4B 0%, #243a63 60%, #1B2B4B 100%)',
                        padding: '28px 32px 24px',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Decorative circle */}
                    <div style={{
                        position: 'absolute', right: -40, top: -40,
                        width: 160, height: 160, borderRadius: '50%',
                        background: 'rgba(201,168,76,0.08)',
                        pointerEvents: 'none',
                    }} />
                    <div style={{
                        position: 'absolute', right: 20, top: 20,
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(201,168,76,0.06)',
                        pointerEvents: 'none',
                    }} />

                    {/* Logo row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: '#C9A84C', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontWeight: 900, fontSize: 14, color: '#1B2B4B',
                            flexShrink: 0,
                        }}>CV</div>
                        <div>
                            <div style={{ color: '#ffffff', fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 17, lineHeight: 1 }}>ProCV</div>
                            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }}>Your Personal Career Consultant</div>
                        </div>
                    </div>

                    {/* Headline */}
                    {screen === 'magic-sent' ? (
                        <div>
                            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', lineHeight: 1.2 }}>
                                ✉️ Check your inbox
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>
                                We sent a sign-in link to <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{email}</span>
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p style={{ color: '#ffffff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', lineHeight: 1.2 }}>
                                {mode === 'signin' ? 'Welcome back 👋' : 'Build your perfect CV'}
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>
                                {mode === 'signin'
                                    ? 'Sign in to access your CVs and career tools.'
                                    : 'Free forever. No credit card. No password.'}
                            </p>
                        </div>
                    )}

                    {/* Mode toggle tabs */}
                    {screen !== 'magic-sent' && (
                        <div style={{
                            display: 'flex', gap: 4, marginTop: 18,
                            background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4,
                        }}>
                            {(['signup', 'signin'] as const).map(m => (
                                <button key={m} onClick={() => { setMode(m); setScreen('main'); }}
                                    style={{
                                        flex: 1, padding: '7px 12px', borderRadius: 9, border: 'none',
                                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        background: mode === m ? '#ffffff' : 'transparent',
                                        color: mode === m ? '#1B2B4B' : 'rgba(255,255,255,0.55)',
                                    }}>
                                    {m === 'signup' ? 'Create account' : 'Sign in'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Feature pills — signup mode only */}
                    {mode === 'signup' && screen === 'main' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                            {SIGNUP_FEATURES.map(f => (
                                <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#C9A84C', fontSize: 10, fontWeight: 900 }}>{f.icon}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{f.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Body ────────────────────────────────────────────────── */}
                <div style={{ padding: '24px 28px 28px' }}>

                    {/* ── Main screen ──────────────────────────────────────── */}
                    {screen === 'main' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                            {/* Notice banner */}
                            {mainNotice && (
                                <div style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '10px 12px', borderRadius: 12, fontSize: 12,
                                    background: '#FEF3C7', color: '#92400E',
                                    border: '1px solid #FDE68A',
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>{mainNotice}</span>
                                </div>
                            )}

                            {/* Google rate-limit notice */}
                            {googleRateLimited && (
                                <div style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '10px 12px', borderRadius: 12, fontSize: 12,
                                    background: '#FEF3C7', color: '#92400E',
                                    border: '1px solid #FDE68A',
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>
                                        Too many sign-in attempts from this network.
                                        {googleRateLimited.retryAfter
                                            ? ` Please wait ${Math.ceil(googleRateLimited.retryAfter / 60)} minute${Math.ceil(googleRateLimited.retryAfter / 60) !== 1 ? 's' : ''} and try again.`
                                            : ' Please try again in a few minutes.'}
                                        {' '}You can still sign in with a magic link below.
                                    </span>
                                </div>
                            )}

                            {/* Google button */}
                            <button
                                onClick={handleGoogle}
                                disabled={googleLoading || !!googleRateLimited}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 10, width: '100%', padding: '13px 20px',
                                    borderRadius: 14, border: '2px solid #1B2B4B',
                                    background: (googleLoading || googleRateLimited) ? '#374151' : '#1B2B4B',
                                    color: '#ffffff', fontWeight: 700, fontSize: 14,
                                    cursor: (googleLoading || googleRateLimited) ? 'not-allowed' : 'pointer',
                                    opacity: (googleLoading || googleRateLimited) ? 0.6 : 1,
                                    transition: 'all 0.15s',
                                    outline: 'none',
                                }}
                            >
                                {googleLoading ? (
                                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                ) : <GoogleLogo />}
                                {googleLoading ? 'Connecting to Google…' : googleRateLimited ? 'Google sign-in unavailable' : 'Continue with Google'}
                            </button>

                            {/* Divider */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>or</span>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                            </div>

                            {/* Email magic link button */}
                            <button
                                onClick={() => setScreen('magic-form')}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 8, width: '100%', padding: '12px 20px',
                                    borderRadius: 14, border: '1.5px solid #d1d5db',
                                    background: '#ffffff', color: '#374151',
                                    fontWeight: 600, fontSize: 14,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    outline: 'none',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6b7280')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                            >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                                Continue with Email
                            </button>

                            {/* Remember this device */}
                            <label
                                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 4 }}
                                onClick={() => setRememberDevice(!rememberDevice)}
                            >
                                <div style={{
                                    width: 16, height: 16, borderRadius: 5, border: `2px solid ${rememberDevice ? '#1B2B4B' : '#d1d5db'}`,
                                    background: rememberDevice ? '#1B2B4B' : '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, transition: 'all 0.15s',
                                }}>
                                    {rememberDevice && (
                                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2 6 5 9 10 3"/>
                                        </svg>
                                    )}
                                </div>
                                <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                                    Remember me on this device
                                    <span style={{ color: '#9ca3af', fontSize: 11 }}> — untick to sign out on browser close</span>
                                </span>
                            </label>

                            <p style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
                                By signing in you agree to our Terms of Service.
                                Your CV data stays private and is stored in your browser.
                            </p>
                        </div>
                    )}

                    {/* ── Magic link form ───────────────────────────────────── */}
                    {screen === 'magic-form' && (
                        <form onSubmit={handleSendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label htmlFor="auth-email" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                                    Your email address
                                </label>
                                <input
                                    ref={emailRef}
                                    id="auth-email"
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                                    placeholder="you@example.com"
                                    style={{
                                        width: '100%', padding: '12px 16px', borderRadius: 12,
                                        border: `2px solid ${emailError ? '#ef4444' : '#e5e7eb'}`,
                                        fontSize: 14, outline: 'none',
                                        background: '#fafafa',
                                        boxSizing: 'border-box',
                                        transition: 'border-color 0.15s',
                                    }}
                                    onFocus={e => (e.target.style.borderColor = emailError ? '#ef4444' : '#1B2B4B')}
                                    onBlur={e => (e.target.style.borderColor = emailError ? '#ef4444' : '#e5e7eb')}
                                    autoComplete="email"
                                />
                                {emailError && (
                                    <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{emailError}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                style={{
                                    width: '100%', padding: '13px 20px', borderRadius: 14,
                                    background: sending ? '#6b7280' : '#1B2B4B',
                                    color: '#ffffff', fontWeight: 700, fontSize: 14,
                                    border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                                    opacity: sending ? 0.8 : 1,
                                    transition: 'all 0.15s',
                                    outline: 'none',
                                }}
                            >
                                {sending ? 'Sending…' : 'Send magic link →'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setScreen('main')}
                                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                            >
                                ← Back to sign-in options
                            </button>
                        </form>
                    )}

                    {/* ── Magic link sent ───────────────────────────────────── */}
                    {screen === 'magic-sent' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #EBF8FF 0%, #DBEAFE 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                            </div>
                            <div>
                                <p style={{ color: '#1B2B4B', fontWeight: 800, fontSize: 16 }}>Magic link sent!</p>
                                <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                                    Open the link in the email — it works for <strong>15 minutes</strong> and on any device.
                                </p>
                            </div>
                            <div style={{ padding: '12px 20px', borderRadius: 12, background: '#F8F7F4', border: '1px solid #e5e7eb', width: '100%' }}>
                                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                                    Didn't get it? Check your spam folder or
                                </p>
                                <button
                                    onClick={() => setScreen('magic-form')}
                                    style={{ background: 'none', border: 'none', color: '#C9A84C', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '4px 0 0', outline: 'none' }}
                                >
                                    try a different email →
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Close button */}
                <button
                    onClick={onDismiss}
                    style={{
                        position: 'absolute', top: 16, right: 16,
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.12)', border: 'none',
                        color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s', outline: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                    aria-label="Close"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}

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
