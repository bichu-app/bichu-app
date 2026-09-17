# Tipos gerados — **não edite nada aqui**

O conteúdo desta pasta é **gerado** a partir de `api/openapi.yaml`, que é a
fonte da verdade do contrato (§5 de `docs/03-arquitetura.md`).

Editar um arquivo daqui faz o contrato e o código divergirem **sem que o diff
mostre**, porque a próxima geração desfaz a edição em silêncio. Se o tipo está
errado, o errado é a especificação: corrija lá e gere de novo.

## O que é gerado daqui

| Arquivo | Gerador | Fonte na spec |
|---|---|---|
| `api.ts` | `openapi-typescript` | `paths` e `components` |
| `problem-types.ts` | `src/tools/gerar-tipos-de-problema.mjs` | `x-problem-types` |

`problem-types.ts` existe porque `openapi-typescript` **não emite extensões
`x-` da raiz**: sem o segundo gerador, a lista de tipos de erro seria a única
parte do contrato copiada à mão para dentro do código — e foi por ali que
`forbidden` acabou saindo com 401 em dois caminhos.

Ele traz o **status junto do tipo**. É isso que faz o defeito parar de ser
representável: o status deixa de ser um argumento de quem constrói o erro e
passa a ser consequência do tipo.

## Como gerar

O comando está no `package.json` da raiz:

```json
"generate:types": "openapi-typescript api/openapi.yaml -o src/shared/types/generated/api.ts && node src/tools/gerar-tipos-de-problema.mjs"
```

A esteira roda a geração e **falha se o resultado diferir do que está
versionado** — é assim que "o código cumpre o contrato" deixa de ser promessa.

## Por que os schemas da spec são os mesmos que validam em tempo de execução

Schemas de OpenAPI 3.1 **são** JSON Schema 2020-12, e o Fastify valida com JSON
Schema. A mesma definição que documenta é a que valida. Uma fonte, não duas — e
é por isso que não existe um `zod` escrito à mão em paralelo à especificação.

## O portão que não depende de alguém lembrar de gerar

A esteira compara o gerado com o versionado, e isso cobre quem **rodou** o
gerador. Não cobre o caso caro: o contrato muda e ninguém gera.

`src/tools/conferir-tipos-de-problema.ts` lê `api/openapi.yaml` **de novo**, por
conta própria, e compara com a tabela que o código usa. A releitura independente
é o ponto: um portão que reaproveitasse o leitor do gerador concordaria com ele
mesmo quando os dois estivessem errados. Contrato sem `x-problem-types` é
reprovação, nunca "nenhuma divergência".
