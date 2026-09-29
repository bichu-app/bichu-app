/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

import { hostsExternos } from './config/hosts-externos.ts';
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
      ...Object.fromEntries(Object.entries(hostsExternos(env)).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])),
    },
    server: { proxy },
    preview: { proxy },
    build: {
      outDir: 'dist',
      // Dois documentos (ADR-0027 item 5): o painel e o login isolado em /entrar/.
      rollupOptions: {
        input: {
          painel: 'index.html',
          entrar: 'entrar/index.html',
        },
      },
      emptyOutDir: true,
      // D48: build de producao sem `.map` e sem `sourceMappingURL`. Fora de
      // producao (`vite build --mode development`) o mapa continua completo.
      // `npm run build` confere o resultado com scripts/conferir-dist.mjs.
      sourcemap: !producao,
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
