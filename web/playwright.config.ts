// Ponta a ponta do site contra o mock gerado do contrato (tests/mock/).
// Pre-requisito: `npm run build` (o servidor sobe de dist/, como na imagem).
//
// Tres servidores:
//   4399  mock da API, do contrato
//   4322  o site como em PRODUCAO (SITE_BASE_URL=https://bichu.app)
//   4323  o site como em HOMOLOGACAO (sem SITE_BASE_URL: tudo noindex)
//
// Local: PLAYWRIGHT_CHROMIUM=/caminho/do/chromium usa um navegador ja baixado.
import { defineConfig, devices } from '@playwright/test';

const executavel = process.env.PLAYWRIGHT_CHROMIUM;
const ambiente = (extra: Record<string, string>) => ({
  API_INTERNAL_URL: 'http://127.0.0.1:4399',
  MEDIA_PUBLIC_BASE_URL: 'https://img.dominio-a-definir.com.br',
  HOST: '127.0.0.1',
  ...extra,
});

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    launchOptions: executavel ? { executablePath: executavel } : {},
  },
  projects: [
    { name: 'celular', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } }, testIgnore: /sem-js/ },
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /acessibilidade|institucional/ },
    { name: 'sem-js', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, javaScriptEnabled: false }, testMatch: /sem-js/ },
  ],
  webServer: [
    { command: 'node tests/mock/servidor-mock.mjs 4399', url: 'http://127.0.0.1:4399/__mock/pedidos', reuseExistingServer: false },
    { command: 'node servidor.mjs', url: 'http://127.0.0.1:4322/healthz', env: ambiente({ PORT: '4322', SITE_BASE_URL: 'https://bichu.app' }), reuseExistingServer: false },
    { command: 'node servidor.mjs', url: 'http://127.0.0.1:4323/healthz', env: ambiente({ PORT: '4323' }), reuseExistingServer: false },
  ],
});
