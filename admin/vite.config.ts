/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

import { PROXY_PADRAO, urlDaApi } from './config/url-da-api.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const producao = mode === 'production';
  const baseDaApi = urlDaApi(env.VITE_API_BASE_URL, producao);
  const alvoDoProxy = env.API_PROXY_TARGET?.trim() || PROXY_PADRAO;
  // Com base relativa, o servidor local encaminha esse caminho para a API.
  // Em producao e a borda de admin.bichu.app que poe `X-Internal-Surface: admin`
  // (ADR-0027 item 1); sem ele a guarda do servico responde 404 a /v1/admin.
  // O proxy de desenvolvimento faz o papel da borda, e so ele.
  const opcoesDoProxy: ProxyOptions = {
    target: alvoDoProxy,
    changeOrigin: true,
    headers: { 'X-Internal-Surface': 'admin' },
  };
  const proxy = baseDaApi.startsWith('/') ? { [baseDaApi]: opcoesDoProxy } : {};

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(baseDaApi),
    },
    server: { proxy },
    preview: { proxy },
    build: {
      outDir: 'dist',
      // Dois documentos (ADR-0027 item 5): o painel e o login isolado em /entrar/.
      rollupOptions: {
        input: {
          painel: fileURLToPath(new URL('./index.html', import.meta.url)),
          entrar: fileURLToPath(new URL('./entrar/index.html', import.meta.url)),
        },
      },
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
