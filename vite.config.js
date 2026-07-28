import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  clearScreen: false,
  resolve: {
    alias: {
      'marks-pane': resolve(__dirname, 'src/patches/marks-pane.js')
    }
  },
  server: {
    port: 1420,
    strictPort: true
  }
});
