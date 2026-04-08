import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../custom_components/docker_lens/frontend/dist',
    emptyOutDir: true,
    manifest: "vite.manifest.json",
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  base: '/docker_lens_static/',
  server: {
    proxy: {
      '/api': 'http://homeassistant.local:8123',
    },
  },
});