/**
 * AuthModal — "Sign in to continue" modal.
 *
 * Two paths:
 *   1. Continue with Google (GoogleSignIn via AuthContext)
 *   2. Email magic link (calls /api/auth/magic-link/send)
 *
 * Design: Premium minimal — white card, gold accent bar, clean hierarchy.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { sendMagicLink } from '../services/authService';
import type { WorkerUser, SendMagicLinkResult } from '../services/authService';
import { getDeviceId } from '../services/userDataCloudService';

interface AuthModalProps {
    open: boolean;
    onSuccess: (token: string, user: WorkerUser) => void;
    onDismiss: () => void;
    /** Controls header copy. 'signup' = create account; 'signin' = welcome back. Default: 'signup'. */
    mode?: 'signup' | 'signin';
}

type Screen = 'main' | 'magic-form' | 'magic-sent' | 'magic-expired';

const SIGNUP_FEATURES = [
    'CV tailored to every job in minutes',
    'ATS-optimised · 35+ professional templates',
    'Interview prep, job tracker & more',
];

export default function AuthModal({ open, onSuccess: _onSuccess, onDismiss, mode: initialMode = 'signup' }: AuthModalProps) {
    const {
        googleSignIn, isAuthenticated, rememberDevice, setRememberDevice,
        googleRateLimited, clearGoogleRateLimit,
        magicLinkError, clearMagicLinkError, applyPollSession,
        startMagicLinkPolling, stopMagicLinkPolling, isMagicLinkPolling,
        checkMagicLinkNow,
        onAuthSuccess,
    } = useAuth();

    const [mode, setMode]              = useState<'signup' | 'signin'>(initialMode);
    const [screen, setScreen]         = useState<Screen>('main');
    const [email, setEmail]            = useState('');
    const [emailError, setEmailError]  = useState('');
    const [sending, setSending]        = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [mainNotice, setMainNotice]  = useState('');
    const [checking, setChecking]      = useState(false); // "I've clicked it" manual check
    const emailRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setMode(initialMode); }, [initialMode]);

    useEffect(() => {
        if (open) {
            // If opened because a magic-link token expired/was already used,
            // start directly on the expired screen instead of the main screen.
            setScreen(magicLinkError === 'expired' || magicLinkError === 'used' ? 'magic-expired' : 'main');
            setEmail('');
            setEmailError('');
            setSending(false);
            setGoogleLoading(false);
            setMainNotice('');
            setChecking(false);
            clearGoogleRateLimit();
        }
    }, [open]);

    useEffect(() => {
        if (screen === 'magic-form') setTimeout(() => emailRef.current?.focus(), 50);
    }, [screen]);

    useEffect(() => {
        if (isAuthenticated && open) onDismiss();
    }, [isAuthenticated, open, onDismiss]);

    // Polling now lives in AuthContext (startMagicLinkPolling / stopMagicLinkPolling)
    // so it survives modal dismissal.  AuthModal just calls startMagicLinkPolling()
    // from handleSendMagicLink and reads isMagicLinkPolling for the spinner.

    if (!open) return null;

    async function handleGoogle() {
        setGoogleLoading(true);
        setMainNotice('');
        try {
            await googleSignIn();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.includes('VITE_GOOGLE_CLIENT_ID')) {
                setMainNotice('Google sign-in is not configured. Please use the email option instead.');
            } else if (msg.includes('cancelled') || msg.includes('canceled')) {
                // user closed popup — no error
            } else if (msg.includes('Popup was blocked')) {
                setMainNotice('Popup was blocked. Please allow popups for this site and try again.');
            } else if (msg) {
                setMainNotice(msg);
            } else {
                setMainNotice('Google sign-in failed. Please try again or use email.');
            }
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
        const result = await sendMagicLink(trimmed, window.location.origin, getDeviceId());
        setSending(false);
        // Resurrection: worker found a valid soft-deleted session for this device — sign in directly
        if ('resurrected' in result) {
            onAuthSuccess(result.user, result.is_new_user);
            return;
        }
        // Normal flow: email sent, start polling
        if ('poll_token' in result) {
            if (result.poll_token) startMagicLinkPolling(result.poll_token);
            setScreen('magic-sent');
            return;
        }
        // Error cases
        if (result.error === 'email_not_configured') {
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

    // Manual check — fires an immediate poll instead of checking the local cookie.
    // The poll endpoint sees used=1 on the server and issues a fresh session for
    // this tab, so it works even when the link was clicked in a different tab/device.
    async function handleAlreadyClicked() {
        setChecking(true);
        await checkMagicLinkNow();
        setChecking(false);
        // If the poll found signed_in, _applySession fires and the modal closes
        // automatically via AuthContext.  If it came back 'pending' (link not yet
        // clicked) the poll loop continues and we show a gentle hint.
        if (!isAuthenticated) {
            setEmailError('Not signed in yet — make sure you clicked the link in your email, then try again.');
        }
    }

    const isSignup = mode === 'signup';

    return (
        <div
            className="procv-auth-overlay"
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
                background: 'rgba(10,16,30,0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={e => {
                // Don't dismiss the modal while waiting for the magic link to be clicked —
                // dismissing would stop the cross-device polling loop.
                if (e.target === e.currentTarget && screen !== 'magic-sent') onDismiss();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Sign in to ProCV"
                className="procv-auth-card"
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 400,
                    background: '#ffffff',
                    borderRadius: 20,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    animation: 'procv-modal-in 0.22s cubic-bezier(0.16,1,0.3,1)',
                }}
            >
                {/* Gold accent bar */}
                <div style={{ height: 3, background: 'linear-gradient(90deg, #C9A84C 0%, #e8c97a 50%, #C9A84C 100%)' }} />

                <div className="procv-auth-body" style={{ padding: '28px 32px 32px' }}>

                    {/* ── Logo + close ─────────────────────────────────────── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
                                boxShadow: '0 2px 8px rgba(27,43,75,0.18)', flexShrink: 0,
                            }}>
                                <img src="/logo.svg" alt="ProCV" style={{ width: '100%', height: '100%', display: 'block' }} draggable={false} />
                            </div>
                            <div>
                                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: 15, color: '#1B2B4B', lineHeight: 1 }}>ProCV</div>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Career Consultant</div>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                // Stop polling before dismissing so we don't apply a session
                                // to an already-closed modal.
                                if (isMagicLinkPolling) stopMagicLinkPolling();
                                onDismiss();
                            }}
                            style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: '#f3f4f6', border: 'none',
                                color: screen === 'magic-sent' ? '#d1d5db' : '#6b7280',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                outline: 'none', flexShrink: 0,
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
                            aria-label="Close"
                            title={screen === 'magic-sent' ? 'Closing this will cancel the sign-in' : 'Close'}
                        >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>

                    {/* ── Main screen ─────────────────────────────────────── */}
                    {screen === 'main' && (
                        <>
                            {/* Headline */}
                            <div style={{ marginBottom: 22 }}>
                                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                                    {isSignup ? 'Build your perfect CV' : 'Welcome back'}
                                </h2>
                                <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6b7280', lineHeight: 1.5 }}>
                                    {isSignup
                                        ? 'Free forever. No credit card. No password.'
                                        : 'Sign in to access your CVs and career tools.'}
                                </p>
                            </div>

                            {/* Notice banner */}
                            {(mainNotice || googleRateLimited) && (
                                <div style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '10px 12px', borderRadius: 10, fontSize: 12.5,
                                    background: '#fffbeb', color: '#92400e',
                                    border: '1px solid #fde68a', marginBottom: 14,
                                    lineHeight: 1.5,
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>
                                        {mainNotice || (googleRateLimited
                                            ? `Too many attempts from this network. ${googleRateLimited.retryAfter ? `Try again in ${Math.ceil(googleRateLimited.retryAfter / 60)} min.` : 'Try again shortly.'} You can still use email below.`
                                            : '')}
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
                                    borderRadius: 12, border: 'none',
                                    background: (googleLoading || googleRateLimited) ? '#4b5563' : '#1B2B4B',
                                    color: '#ffffff', fontWeight: 700, fontSize: 14,
                                    cursor: (googleLoading || googleRateLimited) ? 'not-allowed' : 'pointer',
                                    opacity: (googleLoading || googleRateLimited) ? 0.65 : 1,
                                    transition: 'all 0.15s',
                                    outline: 'none',
                                    boxShadow: '0 2px 8px rgba(27,43,75,0.25)',
                                    letterSpacing: '0.01em',
                                }}
                                onMouseEnter={e => { if (!googleLoading && !googleRateLimited) e.currentTarget.style.background = '#243a63'; }}
                                onMouseLeave={e => { if (!googleLoading && !googleRateLimited) e.currentTarget.style.background = '#1B2B4B'; }}
                            >
                                {googleLoading ? (
                                    <svg style={{ animation: 'spin 0.8s linear infinite' }} width="17" height="17" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                ) : <GoogleLogo />}
                                <span>{googleLoading ? 'Connecting…' : googleRateLimited ? 'Google unavailable' : 'Continue with Google'}</span>
                            </button>

                            {/* Divider */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                <span style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>OR</span>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                            </div>

                            {/* Email button */}
                            <button
                                onClick={() => setScreen('magic-form')}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 8, width: '100%', padding: '12px 20px',
                                    borderRadius: 12, border: '1.5px solid #e5e7eb',
                                    background: '#fafafa', color: '#374151',
                                    fontWeight: 600, fontSize: 14,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    outline: 'none', letterSpacing: '0.01em',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.background = '#f3f4f6'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fafafa'; }}
                            >
                                <EnvelopeIcon size={16} />
                                Continue with Email
                            </button>

                            {/* Remember device */}
                            <label
                                style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none', marginTop: 16 }}
                                onClick={() => setRememberDevice(!rememberDevice)}
                            >
                                <div style={{
                                    width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                                    border: `2px solid ${rememberDevice ? '#1B2B4B' : '#d1d5db'}`,
                                    background: rememberDevice ? '#1B2B4B' : '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                }}>
                                    {rememberDevice && (
                                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2 6 5 9 10 3"/>
                                        </svg>
                                    )}
                                </div>
                                <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                                    Remember me on this device
                                </span>
                            </label>

                            {/* Feature chips — signup only */}
                            {isSignup && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 }}>
                                    {SIGNUP_FEATURES.map(f => (
                                        <div key={f} style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            padding: '4px 10px', borderRadius: 20,
                                            background: '#f0f4ff', border: '1px solid #dbe4ff',
                                            fontSize: 11, color: '#3b4f82', fontWeight: 500,
                                        }}>
                                            <span style={{ color: '#C9A84C', fontSize: 8, fontWeight: 900 }}>✦</span>
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Mode toggle */}
                            <p style={{ textAlign: 'center', fontSize: 12.5, color: '#9ca3af', marginTop: 18, marginBottom: 0, lineHeight: 1.5 }}>
                                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
                                <button
                                    onClick={() => setMode(isSignup ? 'signin' : 'signup')}
                                    style={{ background: 'none', border: 'none', color: '#1B2B4B', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0, outline: 'none' }}
                                >
                                    {isSignup ? 'Sign in' : 'Create one'}
                                </button>
                            </p>

                            <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 10, marginBottom: 0 }}>
                                By signing in you agree to our Terms of Service.
                            </p>
                        </>
                    )}

                    {/* ── Magic link form ─────────────────────────────────── */}
                    {screen === 'magic-form' && (
                        <form onSubmit={handleSendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <button
                                type="button"
                                onClick={() => setScreen('main')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    background: 'none', border: 'none', color: '#6b7280',
                                    fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20,
                                    outline: 'none', fontWeight: 500,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                                </svg>
                                Back
                            </button>

                            <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                                Sign in with email
                            </h2>
                            <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#6b7280' }}>
                                We'll send a magic link — no password needed.
                            </p>

                            <label htmlFor="auth-email" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                                Email address
                            </label>
                            <input
                                ref={emailRef}
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                                placeholder="you@example.com"
                                autoComplete="email"
                                style={{
                                    width: '100%', padding: '12px 14px', borderRadius: 10,
                                    border: `2px solid ${emailError ? '#ef4444' : '#e5e7eb'}`,
                                    fontSize: 14, outline: 'none', background: '#fafafa',
                                    boxSizing: 'border-box', transition: 'border-color 0.15s',
                                    color: '#111827',
                                }}
                                onFocus={e => (e.target.style.borderColor = emailError ? '#ef4444' : '#1B2B4B')}
                                onBlur={e => (e.target.style.borderColor = emailError ? '#ef4444' : '#e5e7eb')}
                            />
                            {emailError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 5, marginBottom: 0 }}>{emailError}</p>}

                            <button
                                type="submit"
                                disabled={sending}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    width: '100%', padding: '13px 20px', borderRadius: 12, marginTop: 16,
                                    background: sending ? '#6b7280' : '#1B2B4B',
                                    color: '#ffffff', fontWeight: 700, fontSize: 14,
                                    border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                                    opacity: sending ? 0.75 : 1, transition: 'all 0.15s', outline: 'none',
                                    boxShadow: '0 2px 8px rgba(27,43,75,0.2)',
                                    letterSpacing: '0.01em',
                                }}
                            >
                                {sending ? (
                                    <svg style={{ animation: 'spin 0.8s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                ) : <EnvelopeIcon size={15} color="white" />}
                                {sending ? 'Sending…' : 'Send magic link'}
                            </button>
                        </form>
                    )}

                    {/* ── Magic link expired / already used ───────────────── */}
                    {screen === 'magic-expired' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 4 }}>
                            {/* Icon */}
                            <div style={{
                                width: 80, height: 80, borderRadius: 24, marginBottom: 20,
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 24px rgba(245,158,11,0.3)',
                                animation: 'procv-bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>

                            <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                                {magicLinkError === 'used' ? 'Link already used' : 'Sign-in link expired'}
                            </h2>
                            <p style={{ margin: '0 0 24px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
                                {magicLinkError === 'used'
                                    ? 'This link has already been used to sign in. Each link works once only — request a fresh one below.'
                                    : 'This link is valid for 15 minutes and has expired. Request a new one and click it straight away.'}
                            </p>

                            {/* Primary action */}
                            <button
                                onClick={() => {
                                    clearMagicLinkError();
                                    setScreen('magic-form');
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    width: '100%', padding: '13px 20px', borderRadius: 12,
                                    background: '#1B2B4B', color: '#ffffff',
                                    fontWeight: 700, fontSize: 14, border: 'none',
                                    cursor: 'pointer', outline: 'none',
                                    boxShadow: '0 2px 8px rgba(27,43,75,0.2)',
                                    transition: 'background 0.15s',
                                    letterSpacing: '0.01em',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#243a63')}
                                onMouseLeave={e => (e.currentTarget.style.background = '#1B2B4B')}
                            >
                                <EnvelopeIcon size={15} color="white" />
                                Send me a new link
                            </button>

                            {/* Or Google */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                <span style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>OR</span>
                                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                            </div>
                            <button
                                onClick={() => { clearMagicLinkError(); setScreen('main'); }}
                                style={{
                                    width: '100%', padding: '12px 20px', borderRadius: 12,
                                    border: '1.5px solid #e5e7eb', background: '#fafafa',
                                    color: '#374151', fontWeight: 600, fontSize: 14,
                                    cursor: 'pointer', outline: 'none', transition: 'all 0.15s',
                                    letterSpacing: '0.01em',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.background = '#f3f4f6'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fafafa'; }}
                            >
                                Sign in with Google instead
                            </button>
                        </div>
                    )}

                    {/* ── Magic link sent ─────────────────────────────────── */}
                    {screen === 'magic-sent' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 4 }}>
                            {/* Animated envelope */}
                            <div style={{
                                width: 80, height: 80, borderRadius: 24, marginBottom: 20,
                                background: 'linear-gradient(135deg, #1B2B4B 0%, #243a63 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 24px rgba(27,43,75,0.25)',
                                animation: 'procv-bounce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                            </div>

                            <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                                Check your inbox
                            </h2>
                            <p style={{ margin: '0 0 6px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.55 }}>
                                We sent a sign-in link to
                            </p>
                            <p style={{ margin: '0 0 22px', fontSize: 14, fontWeight: 700, color: '#1B2B4B' }}>
                                {email}
                            </p>

                            <div style={{
                                padding: '12px 16px', borderRadius: 10,
                                background: '#f9fafb', border: '1px solid #e5e7eb',
                                width: '100%', boxSizing: 'border-box',
                            }}>
                                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 4px' }}>
                                    Link expires in <strong style={{ color: '#6b7280' }}>15 minutes</strong>. Didn't get it?
                                </p>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6 }}>
                                    <button
                                        onClick={() => { stopMagicLinkPolling(); setScreen('magic-form'); }}
                                        style={{ background: 'none', border: 'none', color: '#1B2B4B', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, outline: 'none' }}
                                    >
                                        Try a different email
                                    </button>
                                    <span style={{ color: '#d1d5db', fontSize: 13 }}>·</span>
                                    <button
                                        onClick={async () => {
                                            stopMagicLinkPolling();
                                            setSending(true);
                                            const r = await sendMagicLink(email, window.location.origin, getDeviceId());
                                            setSending(false);
                                            if (!r.ok) { setScreen('magic-form'); return; }
                                            if ('resurrected' in r) { onAuthSuccess(r.user, r.is_new_user); return; }
                                            if (r.poll_token) startMagicLinkPolling(r.poll_token);
                                        }}
                                        disabled={sending}
                                        style={{ background: 'none', border: 'none', color: '#C9A84C', fontWeight: 700, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer', padding: 0, outline: 'none', opacity: sending ? 0.5 : 1 }}
                                    >
                                        {sending ? 'Resending…' : 'Resend'}
                                    </button>
                                </div>
                            </div>

                            {/* Auto-sign-in polling indicator */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, marginTop: 16,
                                fontSize: 12, color: '#6b7280',
                            }}>
                                {isMagicLinkPolling ? (
                                    <>
                                        <svg style={{ animation: 'spin 1.4s linear infinite', flexShrink: 0 }} width="13" height="13" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3"/>
                                            <path d="M12 2a10 10 0 0 1 10 10" stroke="#C9A84C" strokeWidth="3" strokeLinecap="round"/>
                                        </svg>
                                        <span>Waiting — this window signs in automatically once you click the link</span>
                                    </>
                                ) : (
                                    <span style={{ color: '#9ca3af' }}>Keep this window open while you click the link</span>
                                )}
                            </div>

                            {/* "I've already clicked it" manual fallback */}
                            <div style={{ marginTop: 14, textAlign: 'center' }}>
                                {emailError && (
                                    <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{emailError}</p>
                                )}
                                <button
                                    onClick={handleAlreadyClicked}
                                    disabled={checking}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: checking ? '#9ca3af' : '#1B2B4B',
                                        fontWeight: 600, fontSize: 12.5,
                                        cursor: checking ? 'not-allowed' : 'pointer',
                                        padding: '6px 0', outline: 'none',
                                        textDecoration: 'underline', textDecorationStyle: 'dotted',
                                        textUnderlineOffset: '3px',
                                    }}
                                >
                                    {checking ? 'Checking…' : "I've already clicked the link"}
                                </button>
                            </div>

                            <p style={{ fontSize: 11.5, color: '#d1d5db', marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
                                Check your spam folder if it doesn't arrive.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Keyframe animations */}
            <style>{`
                @keyframes procv-modal-in {
                    from { opacity: 0; transform: scale(0.95) translateY(8px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes procv-bounce-in {
                    from { opacity: 0; transform: scale(0.6); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }

                /* ── Responsive ── */

                /* Phones — bottom-sheet style */
                @media (max-width: 480px) {
                    .procv-auth-overlay {
                        align-items: flex-end !important;
                        padding: 0 !important;
                    }
                    .procv-auth-card {
                        border-radius: 20px 20px 0 0 !important;
                        max-width: 100% !important;
                        /* slide up from below */
                        animation: procv-sheet-in 0.28s cubic-bezier(0.16,1,0.3,1) !important;
                    }
                    .procv-auth-body {
                        padding: 20px 20px 28px !important;
                    }
                    /* Slightly smaller headline */
                    .procv-auth-body h2 {
                        font-size: 19px !important;
                    }
                    /* Tighter button padding */
                    .procv-auth-body button[type=submit],
                    .procv-auth-body .procv-primary-btn {
                        padding: 12px 16px !important;
                    }
                }

                /* Landscape phones — constrain height, enable scroll */
                @media (max-width: 768px) and (max-height: 500px) {
                    .procv-auth-overlay {
                        align-items: flex-start !important;
                        padding: 8px !important;
                        overflow-y: auto !important;
                    }
                    .procv-auth-card {
                        border-radius: 16px !important;
                        max-width: 400px !important;
                        margin: auto !important;
                    }
                    .procv-auth-body {
                        padding: 16px 20px 20px !important;
                    }
                    .procv-auth-body h2 {
                        font-size: 17px !important;
                    }
                }

                @keyframes procv-sheet-in {
                    from { opacity: 0; transform: translateY(100%); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

function GoogleLogo() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
    );
}

function EnvelopeIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
    );
}
