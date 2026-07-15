import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Λογική που μοιράζονται frontend και serverless functions.
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  server: {
    // Στο local dev το `vercel dev` σερβίρει τις serverless functions στο :3000.
    // Χωρίς αυτό το proxy, τα /api requests θα χτυπούσαν τον Vite dev server.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
