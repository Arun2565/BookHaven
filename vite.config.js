import { defineConfig } from 'vite';

// Relative asset URLs let the same production build run from Electron's local
// file protocol as well as from Vite during browser development.
export default defineConfig({
  base: './'
});
