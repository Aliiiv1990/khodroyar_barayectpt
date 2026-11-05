import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'suppress-vite-client-reload',
        transform(code, id) {
          if (id.includes('@vite/client') || id.includes('vite/dist/client')) {
            return code.replace(/location\.reload\(\)/g, 'console.log("[vite] auto-reload suppressed")');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});
