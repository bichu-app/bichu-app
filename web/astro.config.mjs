// Configuracao do site (ADR-0028, itens 1, 7 e 9).
//
// Saida estatica por padrao; as rotas publicas com parametro declaram
// `prerender = false` e sao renderizadas pelo adaptador Node em modo
// `middleware`, montado por `servidor.mjs`.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Canonico e og:url saem sempre do host de producao, inclusive quando a
  // pagina e servida por homologacao: o canonico aponta para a copia que vale.
  site: 'https://bichu.app',
  output: 'static',
  trailingSlash: 'never',
  adapter: node({ mode: 'middleware' }),
  // Nenhuma pre-busca, nenhum script de terceiro: o que a pagina carrega e so dela.
  prefetch: false,
  devToolbar: { enabled: false },
  build: {
    // CSS pequeno vai embutido (conta no orcamento do HTML, que e o que o ADR
    // mede); o resto vira arquivo com hash e cache imutavel.
    inlineStylesheets: 'auto',
  },
  markdown: { syntaxHighlight: false },
  security: {
    // A borda (Caddy) repassa X-Forwarded-Proto e X-Forwarded-Host. So estes
    // hosts sao aceitos: e o que faz o POST do formulario passar na conferencia
    // de origem do Astro atras do proxy, e o que torna confiavel o endereco do
    // cliente repassado a API (X-Forwarded-For).
    allowedDomains: [
      { hostname: 'bichu.app', protocol: 'https' },
      { hostname: '*.bichu.app', protocol: 'https' },
      { hostname: 'localhost' },
      { hostname: '*.localhost' },
      { hostname: '127.0.0.1' },
      { hostname: 'web' },
    ],
    // CSP pela configuracao nativa (ADR-0028, item 7): o Astro calcula o hash
    // de todo script e estilo embutido. Nunca 'unsafe-inline'. `frame-ancestors`
    // nao vale em <meta>, e por isso sai do servidor.mjs em toda resposta.
    // O `img-src` da midia do usuario (`MEDIA_PUBLIC_BASE_URL`) e acrescentado
    // em tempo de execucao, so na rota que mostra foto (`/t/`).
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "manifest-src 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  vite: {
    build: {
      // Nada vira data: URI. A CSP so aceita 'self' em img-src, e as formas da
      // marca sao mascaras CSS: embutidas, elas sumiriam em silencio.
      assetsInlineLimit: 0,
      // Source map publicado junto do artefato, para depurar erro de producao.
      sourcemap: true,
    },
  },
});
