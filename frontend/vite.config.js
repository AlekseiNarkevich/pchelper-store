/**
 * PCHelper — конфигурация Vite: React, прокси API и метка сборки.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Сборка веб-витрины PCHelper.
 *
 * В режиме разработки запросы к /api проксируются на локальный backend,
 * чтобы фронтенд и API жили на одном источнике и не упирались в CORS.
 * В production nginx раздаёт статику и проксирует /api на контейнер api.
 */
export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  // Уникальный идентификатор сборки: по нему приложение понимает,
  // что установлена новая версия и старую сессию нужно сбросить.
  define: {
    __PCH_BUILD__: JSON.stringify(String(Date.now())),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
