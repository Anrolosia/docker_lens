import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// 1. On crée le mini-plugin
const cacheBusterPlugin = () => ({
  name: 'cache-buster-plugin',
  writeBundle() {
    // Génère un timestamp unique
    const version = Date.now().toString();
    // Écrit le fichier version.txt dans le dossier dist
    const outDir = path.resolve(__dirname, '../custom_components/docker_lens/frontend/dist');
    fs.writeFileSync(path.join(outDir, 'version.txt'), version);
    console.log(`\n[Cache Buster] version.txt généré : ${version}`);
  }
});

export default defineConfig({
  // 2. On l'ajoute ici
  plugins: [react(), cacheBusterPlugin()], 
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