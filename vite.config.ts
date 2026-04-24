import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 5000,
      host: '0.0.0.0',
      hmr: {
        clientPort: 443,
        protocol: 'wss',
      },
      allowedHosts: true,
      // Same-origin proxy to the local Playwright PDF server (port 3001).
      // Required because the Replit preview iframe cannot reach localhost:3001
      // directly; the browser only sees port 80 of the dev URL.
      proxy: {
        '/__pdf': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/__pdf/, ''),
          timeout: 60000,
          proxyTimeout: 60000,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    }
  };
});
