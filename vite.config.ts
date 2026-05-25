import tailwindcss from '@tailwindcss/vite';
import tanstackRouter from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      routesDirectory: './src/web/app',
      generatedRouteTree: './src/web/routeTree.gen.ts',
      routeToken: 'page',
      routeFileIgnorePattern: '^(?!.*\\.page\\.tsx$).*\\.(tsx|ts|jsx|js|vue)$',
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@/web/': path.resolve(__dirname, 'src/web/'),
    },
  },
  build: {
    outDir: 'dist/web',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:48484',
    },
  },
});
