import { defineConfig } from 'vite';

// base './' lets the production build (dist/) be hosted from any sub-folder.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false },
});
