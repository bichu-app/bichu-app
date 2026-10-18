/**
 * O `default` do contrato **entra no corpo de um `PATCH` que não o mandou**, e
 * este arquivo é a correção.
 *
 * ## O defeito, medido
 *
 * O Fastify monta o Ajv com `useDefaults: true` por padrão — `criarServidor`
 * não passa nenhuma configuração de `ajv` (ver `server.ts`). Com isso o Ajv não
 * só valida: ele **escreve no corpo recebido** o `default` de todo campo
 * ausente do schema. Quando o schema de um `PATCH` reusa a forma da CRIAÇÃO — e
 * no contrato deste produto isso é a regra, pelo mesmo `$ref` nas duas
 * operações —, todo `default` pensado para a criação entra no corpo da edição.
 *
 * Medido em 17/10/2026, com o schema que a rota de fato usa
 * (`contrato.requestBodySchema('updateLostCase')`) num Fastify nu:
 *
 * ```
 * PATCH  { last_seen_at, last_seen_area: { city }, description }
 * o manipulador VIU:
 *   { last_seen_at, last_seen_area, description, share_to_public_list: true }
 * ```
 *
 * Duzentos, e um campo que ninguém mandou foi gravado. Nenhum log, nenhum
 * aviso.
 *
 * ## Por que o manipulador cuidadoso não se salva sozinho
 *
 * O repositório do caso de perdido é explícito
 * (`kysely-lost-case-repository.ts`):
 *
 * ```
 * share_to_public_list = ${entrada.shareToPublicList === undefined
 *   ? sql`share_to_public_list`   // mantém o valor antigo
 *   : sql`${entrada.shareToPublicList}`}
 * ```
 *
 * Esse ramo **nunca é alcançado** sem esta correção: o Ajv já preencheu o
 * padrão antes do manipulador, então o campo nunca chega `undefined`. O
 * comentário que promete "usa o valor antigo quando o corpo não o traz"
 * descreve um comportamento que o Ajv desfaz. Quem lê o código acredita nele, e
 * o código está certo — o que está errado é o corpo que chega até ele.
 *
 * O campo decide se um caso de pet perdido aparece numa **página pública**:
 * o tutor que tirou o caso da lista e depois corrige onde o pet foi visto volta
 * a publicá-lo, com `200` e sem aviso.
 *
 * ## Por que aqui, e não no contrato nem no servidor
 *
 * No contrato o `default` está certo onde ele nasceu — a criação o usa, e é
 * dela que o padrão é. Alterar o contrato para consertar a edição estragaria a
 * criação.
 *
 * Em `criarServidor`, `ajv: { useDefaults: false }` resolveria de uma vez e
 * mudaria **TODA** rota, inclusive as que hoje dependem do padrão sem saber. É
 * a mesma pendência que `corpo-fechado.ts` registra para `removeAdditional`, e
 * fica registrada do mesmo jeito.
 *
 * ## O escopo desta correção, dito em voz alta
 *
 * **As operações de `PATCH` que não chamam esta função continuam recebendo o
 * padrão injetado.** Ela vale onde está instalada, e em nenhum outro lugar. Em
 * 18/10/2026 ela está instalada em duas:
 *
 * - `updateLostCase` (`lost-case-routes.ts`), por `share_to_public_list`;
 * - `updateCommunityNetworkEvent` (`network-routes.ts`), por `accepted_sizes` e
 *   `dog_age` — a correção nasceu lá, local, e migrou para cá quando o segundo
 *   módulo precisou dela. A medição daquele módulo está no ponto de instalação.
 *
 * O schema do contrato **não** é alterado: a cópia é só a que valida o corpo.
 * Quem precisa da lista de nomes aceitos — o guarda de campo desconhecido de
 * `corpo-fechado.ts`, por exemplo — continua lendo o schema ORIGINAL, porque
 * tirar o `default` não muda nome nenhum.
 */

/**
 * O mesmo schema, sem nenhuma chave `default`, em qualquer profundidade.
 *
 * A travessia é recursiva porque o `default` pode estar dentro de um
 * `properties`, de um `items`, de um `anyOf` — e `LostCaseInput` tem as três
 * formas. Nada além de `default` é tocado.
 */
export function semPadroes(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(semPadroes);
  if (typeof schema !== 'object' || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([chave]) => chave !== 'default')
      .map(([chave, valor]) => [chave, semPadroes(valor)]),
  );
}

/**
 * `semPadroes` com o tipo que o `schema.body` do Fastify espera.
 *
 * O molde existe para a chamada na rota não carregar um `as` — um `as` no
 * ponto de instalação é onde um erro de fiação passaria calado.
 */
export function corpoSemPadroes(schema: Record<string, unknown>): Record<string, unknown> {
  return semPadroes(schema) as Record<string, unknown>;
}
