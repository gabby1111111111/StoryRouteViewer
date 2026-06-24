import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/index.jsx',
      name: 'StoryRouteViewer',
      formats: ['iife'],
      fileName: () => 'index.iife.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'style.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
