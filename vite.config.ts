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
      target: 'esnext',           // modern syntax → smaller output, no polyfill bloat
      reportCompressedSize: false, // skip brotli sizing pass → faster CI builds
      cssCodeSplit: true,          // per-chunk CSS → each lazy route only loads its styles
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core — tiny, hot-cached by browsers
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react/jsx-runtime')) {
              return 'vendor-react';
            }
            // Framer Motion — large, animation-only
            if (id.includes('node_modules/framer-motion')) return 'vendor-framer';
            // GSAP — large, only used in landing/animations
            if (id.includes('node_modules/gsap')) return 'vendor-gsap';
            // Google GenAI SDK
            if (id.includes('node_modules/@google/genai')) return 'vendor-genai';
            // OpenAI SDK
            if (id.includes('node_modules/openai')) return 'vendor-openai';
            // PDF.js — heavy, only used for import/parsing
            if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs';
            // Mammoth — Word doc parser, only used on file import
            if (id.includes('node_modules/mammoth')) return 'vendor-mammoth';
            // Admin panel — only loaded at /admin
            if (id.includes('/components/admin/')) return 'chunk-admin';
            // PDF rendering — only needed on download
            if (id.includes('/services/pdfService') ||
                id.includes('/services/cvDownloadService')) return 'chunk-pdf';
            // Template gallery — large, deferred until user opens it
            if (id.includes('/components/TemplateGallery')) return 'chunk-templates';
            // compromise.js NLP — ~200KB, only loaded during quality polish passes
            if (id.includes('node_modules/compromise')) return 'vendor-nlp';
          },
        },
      },
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
