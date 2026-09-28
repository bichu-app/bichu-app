# Backoffice Bichu (`admin/`)

SPA em React + TypeScript servida em `admin.bichu.app`, consumindo `/v1/admin`.
Projeto independente do backend: `package.json`, lockfile, lint e testes próprios.
Nesta fase é só a fundação; telas de produto entram depois de desenhadas no Figma.

Node 22 (o mesmo intervalo `>=22 <23` da raiz).

## Instalar e rodar

```sh
cd admin
npm ci
npm run dev        # servidor de desenvolvimento do Vite
```

## Build

```sh
npm run build      # site estático em admin/dist/
```

O build não lê nada fora de `admin/`. A API é chamada na mesma origem do site,
pelo caminho relativo `/v1` (SPA e `/v1/admin` servidos em `admin.bichu.app`).
Quem serve o site precisa encaminhar `/v1` para a API.

No build de produção, `VITE_API_BASE_URL` só aceita caminho relativo; URL
absoluta reprova o build. Em desenvolvimento ela pode ser absoluta, mas o normal
é deixar o padrão e usar o proxy do Vite:

```sh
API_PROXY_TARGET=http://localhost:3000 npm run dev   # /v1 -> API local (padrão)
```

## Lint e testes

```sh
npm run lint
npm run typecheck
npm test
```

## Arquivos gerados (não edite)

| Gerado | Fonte | Gerar | Verificar |
|---|---|---|---|
| `src/theme/tokens.g.css` | `design/tokens.json` | `npm run generate:tokens` | `npm run verify:tokens` |
| `src/api/generated/api.ts` | `api/openapi.yaml` | `npm run generate:api` | `npm run verify:api` |

As verificações regeram em memória e reprovam (saída 1) quando o arquivo em
disco diverge da fonte, quando ele falta ou quando a fonte não é encontrada.
Mudou um token ou o contrato? Rode o `generate:*` e versione o resultado junto.

Cor só vem de `tokens.g.css`: `test/sem-cor-a-mao.test.ts` reprova qualquer
cor literal em `src/`.

## Sessão e login

- **Login** é outro documento, `/entrar/` (`entrar/index.html`), o único que carrega
  o reCAPTCHA Enterprise (ADR-0027 item 5). A chave de site vem de
  `VITE_CAPTCHA_SITE_KEY`; sem ela, no build de produção o login mostra "A
  verificação de segurança do login não carregou", e no `npm run dev` manda um
  token que o servidor sempre recusa (o servidor não tem modo que aprove sem
  avaliar). Depois de entrar, recarga completa para o painel.
- **Sessão** é o cookie `__Host-bichu_adm`, `HttpOnly`: o código nunca o vê. O
  token anti-CSRF vem no corpo de `GET /v1/admin/session` e fica só em memória;
  todo método não seguro leva `X-CSRF-Token` (`src/sessao/sessao.ts`).
  `test/iscas.test.tsx` reprova se ele faltar ou se aparecer em `localStorage`
  ou `sessionStorage`.
- **Desenvolvimento local:** o proxy do Vite faz o papel da borda de
  `admin.bichu.app` e acrescenta `X-Internal-Surface: admin`. A API precisa de
  `ADMIN_ORIGIN=http://localhost:5173`.

```sh
API_PROXY_TARGET=http://localhost:3200 npm run dev
```
