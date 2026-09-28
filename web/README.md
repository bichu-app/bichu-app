# `web/`: o site do Bichu

Institucional (`/`, `/comunidade`, `/como-funciona`, `/para-profissionais`,
`/sobre`, `/contato`, `/termos`, `/privacidade`) e as páginas públicas
(`/t/{code}`, `/verificar-email`, `/redefinir-senha`). Astro, estático por padrão
e renderizado no servidor nas rotas públicas, num container próprio (ADR-0028).

## Três regras que não são preferência de implementação

1. **O botão funciona sem JavaScript.** `<form method="post">`, com o script
   melhorando por cima e nunca chamando a API direto. É o aviso de quem achou o
   pet, o fluxo mais crítico do produto, e a esteira o conclui com o script
   desligado.
2. **Sem fonte web e sem recurso de terceiro.** Pilha de fonte do sistema, CSP
   fechada sem `'unsafe-inline'`, ícones embutidos em SVG.
3. **Orçamento que quebra o build:** por rota, HTML com CSS ≤ 30 KB e JavaScript
   inicial ≤ 30 KB, comprimidos.

## Onde mexer

| Para mudar | Edite | Nunca |
|---|---|---|
| um texto | `src/conteudo/<página>.ts` | a página `.astro` |
| uma cor, espaço ou tipo | `design/tokens.json` e `npm run generate:tokens` | `src/styles/tokens.g.css` |
| o que a API devolve | `api/openapi.yaml` e `npm run generate:api` | `src/api/generated/` |
| a tela de um estado | `src/dominio/` (decisão por `type`) e a página | o texto do `problem+json` |
| Termos e Privacidade | `src/conteudo/juridico/*.md` | o `.astro` da página |

## Portões

```sh
npm ci
npm run verify:api             # tipos do contrato em dia, com isca
npm run verify:tokens          # tokens.g.css em dia, com isca
npm run verify:valores-soltos  # nenhuma cor, px ou @media solto em src/, com iscas
npm run check                  # astro check
npm run test:unidade           # decisão de tela por type, sem navegador
npm run build
npm run verify:orcamento       # 30 KB por rota, contra o mock do contrato
npm run test:e2e               # Playwright: estados, cabeçalhos, sem JS, axe
```

O mock da API (`tests/mock/`) sai do contrato: rotas, exemplos, schema e a
lista `x-problem-types`. Cenário com campo que o contrato não tem derruba o mock.
