/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { PROXY_PADRAO, urlDaApi } from './config/url-da-api.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const producao = mode === 'production';
  const baseDaApi = urlDaApi(env.VITE_API_BASE_URL, producao);
  const alvoDoProxy = env.API_PROXY_TARGET?.trim() || PROXY_PADRAO;
  // Com base relativa, o servidor local encaminha esse caminho para a API.
  const proxy = baseDaApi.startsWith('/') ? { [baseDaApi]: { target: alvoDoProxy, changeOrigin: true } } : {};

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(baseDaApi),
    },
    server: { proxy },
    preview: { proxy },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Mapa gerado, mas sem o comentario que o anuncia no bundle: quem decide
      // se ele e servido ou enviado a um rastreador de erro e quem publica.
      sourcemap: 'hidden',
      target: 'es2022',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/preparar.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
