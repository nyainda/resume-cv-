
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { restoreLocalStorageFromIDB } from './services/storage/AppDataPersistence';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// ── Boot-time restore ────────────────────────────────────────────────────────
// Before rendering anything, check if localStorage is empty (e.g. user cleared
// browser cache) and if so, refill it from IndexedDB which survives cache clears.
restoreLocalStorageFromIDB().finally(() => {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
      <Analytics />
    </React.StrictMode>
  );

  // Register Service Worker for PWA functionality
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(error => {
          console.log('ServiceWorker registration failed: ', error);
        });
    });
  }
});
