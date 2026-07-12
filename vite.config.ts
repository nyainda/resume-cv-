import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    root: path.resolve(__dirname, 'frontend'),
    publicDir: path.resolve(__dirname, 'frontend/public'),
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      hmr: {
        clientPort: 443,
        protocol: 'wss',
        host: process.env.REPLIT_DEV_DOMAIN || undefined,
      },
      allowedHosts: true,
      proxy: {
        '/__pdf': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/__pdf/, ''),
          timeout: 60000,
          proxyTimeout: 60000,
        },
        '/api/groq-cache': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
        },
        '/api/telemetry': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          timeout: 10000,
          proxyTimeout: 10000,
        },
        '/api/claude': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          timeout: 60000,
          proxyTimeout: 60000,
        },
        '/api/cv/rules': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          timeout: 8000,
          proxyTimeout: 8000,
        },
        '/api/notify-webhook': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          timeout: 15000,
          proxyTimeout: 15000,
        },
        // Proxy CF engine worker calls to avoid CORS (Replit origin not in worker's ALLOWED_ORIGINS)
        // 95s — must stay above WORKER_TIERED_LLM_DEFAULT_TIMEOUT_MS (90s) in
        // cvEngineClient.ts, or this proxy kills the connection before the
        // client's own timeout ever gets a chance to fire. The free-tier
        // parser model can genuinely take 60s+ under load.
        '/cf-engine': {
          target: 'https://cv-engine-worker.dripstech.workers.dev',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/cf-engine/, ''),
          secure: true,
          timeout: 95000,
          proxyTimeout: 95000,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend'),
      },
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    }
  };
});
