import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';
  return {
    base: isProduction ? '/lavstudio/' : '/',
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
    plugins: [
      nodePolyfills(),
      react(),
      tailwindcss(),
    ],
    define: {

    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
