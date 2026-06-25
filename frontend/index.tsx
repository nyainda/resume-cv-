
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreLocalStorageFromIDB } from './services/storage/AppDataPersistence';
import { initStorageNamespace } from './services/storage/userStorageNamespace';
import { warmCVEngine, prewarmCVEngineModels } from './services/cvEngineClient';
import { runWorkerStatusDiagnostic } from './services/workerStatusDiagnostic';
import { startAutoProbe } from './services/providerHealth';

warmCVEngine();
// Wake the actual generation models (Mistral Small 3.1, Hermes-2 Pro) so the
// first real CV request doesn't hit a cold model and return empty text.
// Fire-and-forget — silent on failure. See cvEngineClient.ts for full notes.
void prewarmCVEngineModels();
runWorkerStatusDiagnostic();
// Re-probe any open AI-provider circuits every 3 min so transient outages
// auto-recover without a page reload.
startAutoProbe();

// ── Top-level Error Boundary ────────────────────────────────────────────────
// Catches any runtime crash in the React tree and shows a friendly recovery
// screen instead of a blank white page. Class component required by React API.
interface EBState { hasError: boolean; message: string }
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: unknown): EBState {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught error in React tree:', err, info.componentStack);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', padding: '2rem',
      }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1B2B4B', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
            ProCV hit an unexpected error. Your saved CVs are safe — they're stored in your browser.
          </p>
          <p style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, color: '#666',
            fontFamily: 'monospace', marginBottom: 24, wordBreak: 'break-all',
          }}>
            {this.state.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#1B2B4B', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: 15,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

// ── SW Update Banner ─────────────────────────────────────────────────────────
// Shown as a slim bar at the bottom of the screen when a new version of the
// app is ready. The user clicks "Update now" and we:
//   1. Tell the waiting SW to take over (SKIP_WAITING)
//   2. On controllerchange (SW swap complete) → reload to get the new code
// This replaces the old skipWaiting()-on-install pattern that could force a
// silent reload mid-session and cause users to lose unsaved work.

function showSWUpdateBanner(waitingSW: ServiceWorker) {
  // Don't show a second banner if one already exists
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  Object.assign(banner.style, {
    position: 'fixed', bottom: '0', left: '0', right: '0',
    background: '#1B2B4B', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', padding: '10px 16px',
    fontFamily: 'DM Sans, sans-serif', fontSize: '14px',
    zIndex: '99999', boxShadow: '0 -2px 16px rgba(0,0,0,0.18)',
  });

  const msg = document.createElement('span');
  msg.textContent = '✨ A new version of ProCV is ready.';

  const btn = document.createElement('button');
  btn.textContent = 'Update now';
  Object.assign(btn.style, {
    background: '#C9A84C', color: '#1B2B4B', border: 'none',
    borderRadius: '6px', padding: '5px 14px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', flexShrink: '0',
  });

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  Object.assign(dismiss.style, {
    background: 'none', color: 'rgba(255,255,255,0.5)', border: 'none',
    fontSize: '16px', cursor: 'pointer', padding: '0 4px', marginLeft: '4px',
  });

  btn.addEventListener('click', () => {
    // Once the SW swaps, reload to run the new JS bundle.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
    waitingSW.postMessage({ type: 'SKIP_WAITING' });
    btn.textContent = 'Updating…';
    btn.style.opacity = '0.6';
    btn.disabled = true;
  });

  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(msg);
  banner.appendChild(btn);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Init namespace FIRST — so restoreLocalStorageFromIDB reads from the
// correct user-scoped IDB DB, not the anonymous one.
initStorageNamespace();

restoreLocalStorageFromIDB().finally(() => {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );

  if ('serviceWorker' in navigator) {
    // Only register the service worker in production builds. In dev the SW
    // aggressively caches `.ts`/`.tsx` modules, which masks env-var changes
    // and HMR updates — and made the worker-status diagnostic show stale data.
    if (import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(registration => {
            console.log('[SW] Registered, scope:', registration.scope);

            // ── Case 1: Update already waiting when page loads ──────────────
            // (e.g. user had the tab open and a deploy happened while they
            //  were away — the new SW installed but couldn't activate yet)
            if (registration.waiting) {
              showSWUpdateBanner(registration.waiting);
            }

            // ── Case 2: New SW found after page loads (hot deploy) ──────────
            registration.addEventListener('updatefound', () => {
              const installing = registration.installing;
              if (!installing) return;
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  // There is a controlling SW + a newly installed one waiting →
                  // safe to show the banner (don't disrupt first-time visitors)
                  showSWUpdateBanner(installing);
                }
              });
            });
          })
          .catch(error => {
            console.warn('[SW] Registration failed:', error);
          });
      });
    } else {
      // Dev: actively unregister any previously installed SW and clear its
      // caches so old cached modules don't leak into a clean dev session.
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      }).catch(() => {});
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
      }
    }
  }
});
