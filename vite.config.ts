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
