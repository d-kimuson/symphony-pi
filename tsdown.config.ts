import { defineConfig } from 'tsdown/config';

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  platform: 'node',
  format: 'esm',
  clean: true,
});
