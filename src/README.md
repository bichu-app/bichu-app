# `src/` — estrutura, fronteiras e as regras que o compilador impõe

Monólito modular em TypeScript (ADR-0001). Dependência aponta para dentro:
domínio no centro, sem conhecer framework, banco, HTTP ou nuvem.

## Mapa

```
src/
  bin/                 api.ts e worker.ts — a MESMA imagem, dois comandos
  shared/
    types/brands.ts    tipos marcados: erro de categoria vira erro de compilação
    types/generated/   gerado de api/openapi.yaml — NÃO EDITE
    http/              borda, Problem Details, correlação, definição de rota
    time/clock.ts      relógio injetável (único lugar com Date.now())
    db/                pool, transação, unidade de trabalho
    telemetry/         log estruturado, trace, métrica
    config/env.ts      leitura de ambiente com falha ruidosa e travas de subida
    ports/             portas transversais: fila, contador, cifra, id
  modules/<m>/
    domain/            entidades e regras. Não conhece nada de fora
    application/       casos de uso. Orquestra portas
    ports/             o que ESTE módulo exige do mundo
    adapters/http/     rotas e DTO
    adapters/persistence/  Kysely e o modelo de persistência
    adapters/external/ SDK de terceiro. Único lugar onde ele pode aparecer
  web/                 modelos das rotas HTML públicas
```

Cada módulo tem um `README.md` dizendo o que pode e o que **não** pode conhecer.

## Duas fronteiras marcadas de propósito

- **`media` é a primeira extraível.** Sem regra de negócio, sem tabela de
  ninguém, uma porta pequena. Se um serviço sair do monólito, sai este.
- **`lostfound` é a que NÃO deve sair primeiro.** Parece o serviço óbvio por ser
  o coração do produto, e é exatamente por isso que não é: conversa com quatro
  módulos na mesma transação, e extraí-la faria "abrir caso" poder falhar pela
  metade. O raciocínio inteiro está na §16 de `docs/03-arquitetura.md`.

## O que aqui é impossível, e não apenas proibido

Regra que depende de alguém lembrar na revisão é recomendação. Onde deu, o erro
foi eliminado em vez de proibido:

| Regra | Como ela é imposta |
|---|---|
| Rota com efeito precisa declarar teto | **erro de compilação** em `shared/http/route-definition.ts` |
| URL absoluta não é persistida | `ObjectKey` e `AbsoluteUrl` são tipos distintos; a porta de persistência não aceita o segundo |
| Código de tag só entra normalizado | `TagCodeCanonical` não aceita `string` cru |
| UUID interno não sai em resposta anônima | `UserId` e afins são marcados; a projeção pública tem tipo próprio |
| Tipo de erro inventado no meio do código | `ProblemType` é união fechada, **gerada** de `x-problem-types` do contrato |
| Tipo de erro com o status errado (`forbidden` em 401) | o status não é argumento: sai de `STATUS_DO_PROBLEMA`, que vem do contrato |
| Mecanismo de teste ativo em produção | a aplicação **recusa subir** (`assertSafeBoot`) |
| Limite em memória com mais de uma instância | a aplicação **recusa subir** |

E o que ainda depende de lint, com as regras em `architecture.rules.mjs`:
fronteira entre módulos, pureza de `domain/`, confinamento de SDK, proibição de
`Date.now()` e ausência de nome de recurso de provedor.

## Uma fonte só

Os tipos do contrato são **gerados** de `api/openapi.yaml` e a esteira falha se o
resultado diferir do versionado. Não existe validação escrita à mão em paralelo à
especificação: schemas de OpenAPI 3.1 **são** JSON Schema 2020-12, e o Fastify
valida com JSON Schema, então a definição que documenta é a que valida.

## Onde está o resto

| Assunto | Onde |
|---|---|
| Contrato de API | `api/openapi.yaml` |
| Arquitetura, modelo de dados, caminho de crescimento | `docs/03-arquitetura.md` |
| Por que cada decisão foi tomada | `adr/` |
| Política de limite de chamadas e ameaças | `docs/04-seguranca.md` |
