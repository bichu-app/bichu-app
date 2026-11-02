import { sql, type RawBuilder } from 'kysely';

import type { UserId } from '../types/brands.js';
import { canalDeContatoConfirmadoNoSql } from './canal-de-contato-confirmado.js';

/**
 * O MURAL SÓ ENTRE CONEXÕES -- **o interruptor que volta a regra antiga, e ele é
 * UMA LINHA**.
 *
 * `true` restaura a audiência por conexão aceita em **todos** os construtores
 * que a cobram, de uma vez: a linha do tempo, a resolução da publicação por
 * `public_ref` (curtir, comentar, apagar comentário) e o alvo da denúncia, que
 * mora em outro módulo. Hoje está `false` por **decisão do cliente de
 * 02/11/2026**, e o motivo foi dito por ele: no começo não haverá volume, e a
 * seção ficaria parada se cada publicação só alcançasse quem já é conexão.
 *
 * **A decisão é TEMPORÁRIA, e quem vira a chave é o cliente** -- conforme a base
 * cresce e as pessoas passam a ter conexões. Está escrita como interruptor, e
 * não como "se a base for pequena, abra", porque o limiar não foi decidido: ele
 * é julgamento do cliente sobre o produto, e não um número que esta camada possa
 * arbitrar.
 *
 * Virar a chave **não** mexe em bloqueio, em ocultação por denúncia, em conta
 * desabilitada nem na foto do autor: os quatro valem nos DOIS lados do
 * interruptor, porque são segurança e não alcance.
 *
 * Enquanto está `false`, a audiência é cobrada pela verificação das **DUAS
 * pontas** ([canalDeContatoConfirmadoNoSql]): só vê quem tem canal de contato
 * confirmado, e só aparece quem tem. **Essa trava é NOVA.** Até 02/11/2026 o
 * sinal era lido e exibido -- o selo de
 * `PublicationAuthor.contact_channel_verified`, de 21/10/2026 -- e não entrava
 * em `WHERE` nenhum. Ela existe porque abrir o Mural para a base inteira abre o
 * vetor de spam no mesmo movimento, e foi a leitura que o cliente escolheu
 * entre quatro.
 *
 * **Este arquivo é o ponto ÚNICO da definição.** Antes de 02/11/2026 o
 * predicado estava escrito à mão quatro vezes, em dois módulos
 * (`publications` e `safety`), e um interruptor em quatro cópias não é um
 * interruptor.
 */
export const MURAL_SO_ENTRE_CONEXOES = false;

/**
 * A coluna de autoria, **já qualificada pelo apelido de quem chama**. Os
 * construtores não compartilham apelido de tabela, e por isso ela é parâmetro:
 * `p` é a publicação, `k` é o comentário.
 */
export type ColunaDeAutoria = 'p.author_user_id' | 'k.author_user_id';

/** A CONEXÃO ACEITA entre o autor e quem olha, nos dois sentidos do par. */
function conexaoAceitaCom(autor: RawBuilder<unknown>, quemOlha: UserId): RawBuilder<boolean> {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM user_connections uc
     WHERE uc.state = 'accepted'
       AND ((uc.requester_user_id = ${autor} AND uc.addressee_user_id = ${quemOlha}::uuid)
         OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = ${autor}))
       AND conta_habilitada(uc.requester_user_id)
       AND conta_habilitada(uc.addressee_user_id))`;
}

/** O CANAL DE CONTATO CONFIRMADO de uma pessoa, pela identidade interna. */
function canalConfirmadoDe(quem: RawBuilder<unknown>): RawBuilder<boolean> {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM users u WHERE u.id = ${quem} AND ${canalDeContatoConfirmadoNoSql('u')})`;
}

/**
 * A AUDIÊNCIA DA PUBLICAÇÃO -- **o MESMO texto em todos os construtores que a
 * cobram**, senão uma superfície mostra o que a outra esconde: a linha do tempo
 * listaria a publicação e a resolução por `public_ref` devolveria 404 na
 * curtida, no comentário e **na denúncia** da mesma linha. Com a audiência
 * aberta, a denúncia é a defesa, e uma defesa inalcançável não é defesa.
 *
 * A PRÓPRIA publicação aparece sempre ao autor, verificado ou não -- senão quem
 * publica não vê o que publicou, e era o estado vazio que o cliente quis
 * resolver.
 *
 * `conta_habilitada` é cobrada **sobre o autor** aqui e por extenso. Antes de
 * 02/11/2026 ela vinha de dentro do `EXISTS` das conexões, sobre as duas pontas
 * do par; tirar o `EXISTS` sem reintroduzi-la devolveria ao Mural as contas
 * desabilitadas. Ela é cobrada **também sobre quem olha** pelo mesmo motivo:
 * hoje o observador desabilitado só alcança as próprias publicações, porque o
 * `EXISTS` reprovava a ponta dele, e não é esta frente que afrouxa isso.
 */
export function audienciaDaPublicacao(
  coluna: ColunaDeAutoria,
  quemOlha: UserId,
): RawBuilder<boolean> {
  const autor = sql.raw(coluna);
  if (MURAL_SO_ENTRE_CONEXOES) {
    return sql<boolean>`(
      ${autor} = ${quemOlha}::uuid
      OR ${conexaoAceitaCom(autor, quemOlha)}
    )`;
  }
  return sql<boolean>`(
    ${autor} = ${quemOlha}::uuid
    OR (
      conta_habilitada(${autor})
      AND conta_habilitada(${quemOlha}::uuid)
      AND ${canalConfirmadoDe(autor)}
      AND ${canalConfirmadoDe(sql`${quemOlha}::uuid`)}
    )
  )`;
}

/**
 * A FOTO DO AUTOR, e ela **continua só entre conexões aceitas** -- nos dois
 * lados do interruptor acima.
 *
 * Isto não é a audiência, e a diferença é deliberada. A Emenda 5 do ADR-0010
 * autorizou `photo_icon_url` no Mural com três razões, e **a segunda delas é
 * que o golpe do falso achador é praticado por ESTRANHO, e estranho não é
 * `accepted` -- "a consulta que traria a foto dele não existe"**. Abrir a
 * audiência faz essa consulta existir. Deixar a foto passar junto estenderia
 * foto de pessoa a estranho **por analogia**, que é o que aquela emenda proíbe
 * fazer sem nomear a superfície.
 *
 * Até 02/11/2026 este predicado era satisfeito **por construção** na linha do
 * tempo -- o `WHERE` só devolvia conexão aceita, e repeti-lo no `JOIN` da foto
 * era duplicação que um caso de teste proibia. Com a audiência aberta a
 * construção não o satisfaz mais, e ele passa a ser **explícito** nos dois
 * `JOIN`s de foto: o da publicação e o do comentário.
 *
 * Então a publicação de quem não é conexão passa a aparecer, e **sai sem foto**:
 * `handle`, `display_name` e o selo, que é o que `ConnectionPerson` já entrega.
 * Abrir a foto também é decisão do cliente, está no relatório desta frente, e no
 * dia em que ele disser sim some daqui o predicado -- e nada mais.
 */
export function fotoDoAutorVisivel(
  coluna: ColunaDeAutoria,
  quemOlha: UserId,
): RawBuilder<boolean> {
  const autor = sql.raw(coluna);
  return sql<boolean>`(
    ${autor} = ${quemOlha}::uuid
    OR ${conexaoAceitaCom(autor, quemOlha)}
  )`;
}
