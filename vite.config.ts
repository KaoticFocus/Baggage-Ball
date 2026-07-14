import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/.netlify/functions/valentine-voice': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: () => '/api/valentine-voice',
      },
      '/.netlify/functions/character-speech': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: () => '/api/character-speech',
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
