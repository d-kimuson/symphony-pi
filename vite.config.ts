import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getPrerenderPages = () => {
  return [{ path: '/', prerender: { enabled: false, crawlLinks: false } }];
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src/web',
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
      },
      pages: getPrerenderPages(),
      router: {
        routesDirectory: './app',
        generatedRouteTree: './routeTree.gen.ts',
        routeToken: 'page',
        routeFileIgnorePattern: '^(?!.*\\.page\\.tsx$).*\\.(tsx|ts|jsx|js|vue)$',
      },
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@/web/': path.resolve(__dirname, 'src/web/'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:48484',
    },
  },
});
