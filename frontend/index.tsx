
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreLocalStorageFromIDB } from './services/storage/AppDataPersistence';
import { initStorageNamespace } from './services/storage/userStorageNamespace';
import { warmCVEngine, prewarmCVEngineModels } from './services/cvEngineClient';
import { runWorkerStatusDiagnostic } from './services/workerStatusDiagnostic';
import { startAutoProbe } from './services/providerHealth';

// These are all fire-and-forget network calls that warm backend workers /
// models the user isn't waiting on yet. Running them at module-eval time (i.e.
// before React even mounts) makes them compete with the app's own JS/CSS for
// bandwidth and the main thread during the most latency-sensitive window —
// first paint. `whenIdle` pushes them just past the initial render commit
// (via requestIdleCallback, with a setTimeout fallback for browsers/tabs
// where idle callbacks don't fire promptly) so they still kick off within a
// tick or two of load, well before a user could act on their result.
function whenIdle(fn: () => void) {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 0);
  }
}

whenIdle(() => {
  warmCVEngine();
  // Wake the actual generation models (Mistral Small 3.1, Hermes-2 Pro) so the
  // first real CV request doesn't hit a cold model and return empty text.
  // Fire-and-forget — silent on failure. See cvEngineClient.ts for full notes.
  void prewarmCVEngineModels();
  runWorkerStatusDiagnostic();
  // Re-probe any open AI-provider circuits every 3 min so transient outages
  // auto-recover without a page reload.
  startAutoProbe();
});

// ── Stale-chunk recovery ─────────────────────────────────────────────────────
// Vite code-splits lazy-loaded routes (e.g. AppViewRouter) into hashed chunk
// files. When we ship a new deploy, the old hashed filenames are deleted from
// the server. A browser tab that's been open since before the deploy (or one
// that loaded a cached index.html) still tries to fetch the *old* hash and
// gets a 404 — surfacing as "Failed to fetch dynamically imported module" or
// "error loading dynamically imported module". That's not a real app bug, it's
// just a stale client — the fix is a single hard reload to pick up the new
// index.html + current chunk hashes. We do this ONE time per tab (guarded by
// sessionStorage) to avoid a reload loop if the fetch keeps failing for some
// other reason (e.g. offline).
const CHUNK_ERROR_PATTERN = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
const CHUNK_RELOAD_FLAG = 'procv:chunkReloadAttempted';

function isStaleChunkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return CHUNK_ERROR_PATTERN.test(message);
}

function recoverFromStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false; // already tried once this tab
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  } catch { /* sessionStorage blocked — still attempt one reload */ }
  window.location.reload();
  return true;
}

// Vite fires this event on the window whenever a lazy `import()` fails to
// load — catching it here means most users never even see the error screen.
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[vite:preloadError] stale chunk detected, recovering:', event);
  recoverFromStaleChunk();
});

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
    // A dynamic-import 404 from a stale deploy isn't a real crash to report —
    // auto-recover with a single hard reload instead of dead-ending the user.
    if (isStaleChunkError(err) && recoverFromStaleChunk()) return;
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    if (isStaleChunkError(this.state.message)) {
      // Mid-recovery: reload is already in flight (or was just attempted and
      // failed again, e.g. offline). Show a lighter "updating" screen instead
      // of the generic crash message so it doesn't look broken.
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#F8F7F4', fontFamily: 'DM Sans, sans-serif', padding: '2rem',
        }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔄</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1B2B4B', marginBottom: 8 }}>
              Updating ProCV…
            </h1>
            <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
              A newer version is available. Your saved CVs are safe — they're stored in your browser.
            </p>
            <button
              onClick={() => {
                // Clear both stuck flags so the reload lands on a clean state:
                //   1. chunkReloadAttempted — the guard that prevents the
                //      auto-recovery from firing more than once per session.
                //   2. procv:lastView — if the view that triggered the crash
                //      (e.g. 'share-profile') is stored in sessionStorage, every
                //      reload restores it and re-triggers the same failure.
                try { sessionStorage.removeItem('procv:chunkReloadAttempted'); } catch { /* non-fatal */ }
                try { sessionStorage.removeItem('procv:lastView'); } catch { /* non-fatal */ }
                window.location.reload();
              }}
              style={{
                background: '#1B2B4B', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 24px', fontSize: 15,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload now
            </button>
          </div>
        </div>
      );
    }
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
