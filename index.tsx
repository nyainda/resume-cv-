
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreLocalStorageFromIDB } from './services/storage/AppDataPersistence';
import { warmCVEngine } from './services/cvEngineClient';
import { runWorkerStatusDiagnostic } from './services/workerStatusDiagnostic';
import { startAutoProbe } from './services/providerHealth';

warmCVEngine();
runWorkerStatusDiagnostic();
// Re-probe any open AI-provider circuits every 3 min so transient outages
// auto-recover without a page reload.
startAutoProbe();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

restoreLocalStorageFromIDB().finally(() => {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
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
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          })
          .catch(error => {
            console.log('ServiceWorker registration failed: ', error);
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
