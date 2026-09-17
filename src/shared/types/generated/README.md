# Tipos gerados — **não edite nada aqui**

O conteúdo desta pasta é **gerado** a partir de `api/openapi.yaml`, que é a
fonte da verdade do contrato (§5 de `docs/03-arquitetura.md`).

Editar um arquivo daqui faz o contrato e o código divergirem **sem que o diff
mostre**, porque a próxima geração desfaz a edição em silêncio. Se o tipo está
errado, o errado é a especificação: corrija lá e gere de novo.

## Como gerar

O comando entra no `package.json` da raiz (arquivo do DevOps). O script é:

```json
"generate:types": "openapi-typescript api/openapi.yaml -o src/shared/types/generated/api.ts"
```

A esteira roda a geração e **falha se o resultado diferir do que está
versionado** — é assim que "o código cumpre o contrato" deixa de ser promessa.

## Por que os schemas da spec são os mesmos que validam em tempo de execução

Schemas de OpenAPI 3.1 **são** JSON Schema 2020-12, e o Fastify valida com JSON
Schema. A mesma definição que documenta é a que valida. Uma fonte, não duas — e
é por isso que não existe um `zod` escrito à mão em paralelo à especificação.
