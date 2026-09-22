/**
 * Quem o alerta alcança, em **uma** consulta PostGIS.
 *
 * Esta é a implementação que substitui `criarAlcanceAindaSemBase`. Ela existe
 * porque os sete critérios do ADR-0006 passaram a ter tabela: a localização
 * chegou com a BICHUS-92, o aparelho com a BICHUS-91, e a memória do disparo
 * (`alert_dispatches`, `alert_recipients`) com esta história. Enquanto faltava
 * qualquer uma delas, `null` era a resposta honesta; agora `null` seria a
 * desculpa.
 *
 * ## Uma consulta, e a contagem é o tamanho do que ela devolve
 *
 * A porta tem um método só, e a razão está no cabeçalho dela. Aqui o efeito
 * prático: **não existe `COUNT(*)` de destinatários neste arquivo.**
 * `reachable_tutors` é `destinatarios.length`, por `contagemDe`, sobre
 * exatamente a lista que o disparo vai percorrer. Um `COUNT(*)` ao lado seria
 * uma segunda definição de "quantos", e ela divergiria da primeira no dia em
 * que alguém acrescentasse um critério a uma e esquecesse a outra.
 *
 * ## Os seis critérios de pessoa, e onde cada um está
 *
 * | ADR-0006 | onde, nesta consulta |
 * |---|---|
 * | 1. tem localização conhecida | `FROM user_reference_locations` — a linha existir **é** o critério |
 * | 2. capturada há 30 dias ou menos | `expires_at > :agora` |
 * | 3. `ST_DWithin(..., 5000)` | o `ST_DWithin` do `WHERE` |
 * | 4. ao menos um aparelho `granted` com token | o `EXISTS` sobre `user_devices` |
 * | 5. não é o próprio tutor | `url.user_id <> :excluir` |
 * | 6. teto de fadiga, 3 em 24 h | o `count(*)` correlacionado em `alert_recipients` |
 *
 * O sétimo (*"o caso não mandou alerta nas últimas 24 h"*) **não está aqui de
 * propósito**, e o argumento inteiro está no cabeçalho da porta: como filtro de
 * linhas ele devolveria zero destinatários, e zero viraria `computed: 0` — "não
 * há ninguém por perto" no lugar de "este caso já avisou hoje". Ele é
 * `podeDispararDeNovo`, sobre `RegistroDeDisparos.ultimoEnvioDoCaso`.
 *
 * ## O predicado do aparelho está escrito em QUATRO lugares, e não por descuido
 *
 * `podeReceberPush` (domínio), `construtorDosAlcancaveis` (repositório de
 * aparelhos), o predicado parcial do índice `user_devices_alcancaveis`, e o
 * `EXISTS` daqui. As quatro formas precisam dizer a mesma coisa: se o índice
 * divergir, o Postgres para de usá-lo e a consulta do pânico vira varredura sem
 * ninguém perceber; se esta divergir do domínio, o número da tela deixa de
 * significar o que o domínio afirma. Quem cobra é
 * `sete-criterios-na-consulta.test.ts`, com isca.
 *
 * ## SQL cru, e não o construtor tipado
 *
 * `geography` não é um tipo que o modelo do Kysely represente, e as colunas
 * geográficas são declaradas em `schema.ts` como não selecionáveis de
 * propósito. O mesmo caminho de `kysely-localizacao-de-referencia.ts`: o único
 * acesso é este, onde `ST_DWithin` fica à vista de quem revisa.
 *
 * `construtorDoAlcance` devolve a consulta **ainda não executada**, pelo mesmo
 * motivo dos `construtorD*` de `kysely-registro-de-aparelhos.ts`: é o que
 * permite compilar o SQL sem banco e cobrar os critérios sobre o texto que
 * de fato roda. Uma cópia escrita à mão no teste continuaria certa depois de
 * alguém apagar um critério daqui, que é o atalho que esconde o que se foi
 * conferir.
 *
 * ## A ordem é por distância, e a distância é descartada
 *
 * `ST_Distance` ordena e não sai: não vira coluna da resposta, não vira linha
 * de `alert_recipients` e não entra em log. Gravada, ela seria uma
 * trilateração pronta — três casos abertos perto da mesma pessoa e a distância
 * de cada um a colocam num círculo de poucos metros. O ADR-0010 proíbe
 * `distance_m` em superfície pública; guardá-la sem ninguém precisar dela é
 * acumular o dano sem o benefício.
 *
 * `ST_Distance` e `ST_DWithin` são do subconjunto que o ADR-0006 fixa no item 3
 * da lista de verificação de nuvem. O operador `<->`, que seria a forma
 * idiomática de ordenar por distância, **não** está naquele subconjunto e por
 * isso não é usado aqui.
 *
 * ## BICHUS-88: a conta logicamente excluída sai por `deleted_at IS NULL`
 *
 * O critério 12 da BICHUS-88 diz que a exclusão lógica é imediata e o expurgo
 * definitivo acontece em 30 dias. Entre os dois, a linha de
 * `user_reference_locations` continua existindo — o `expires_at` dela fala da
 * validade da localização, não da conta — e portanto continua casando com
 * `ST_DWithin`. É por isso que esta consulta junta `users` e exige
 * `deleted_at IS NULL`: **avisar uma conta que pediu para sair é o defeito, e
 * ele morre aqui.** A junção não conserta a BICHUS-88 e não tenta: a linha
 * segue no banco até o expurgo, e qualquer outro caminho que leia
 * `user_reference_locations` sem esta junção continua a vendo.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import {
  JANELA_DE_24H_EM_MS,
  TETO_DE_DESTINATARIOS,
  TETO_DE_FADIGA,
} from '../../domain/disparo-do-alerta.js';
import type {
  AlcanceCalculado,
  AlcanceDoAlerta,
  ConsultaDeAlcance,
  Destinatario,
} from '../../ports/alcance-do-alerta.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

export interface LinhaDoAlcance {
  user_id: string;
  device_ids: string[];
}

/**
 * Pede **uma linha a mais** que o teto, e é assim que `tetoAtingido` é honesto.
 *
 * Com o limite exato não há como distinguir "havia exatamente 500" de "havia
 * 900 e cortamos". A linha extra responde isso sem uma segunda consulta e sem
 * um `COUNT(*)` — que, além de custar outra varredura, seria a segunda
 * definição de "quantos" que este módulo existe para não ter.
 */
const LIMITE_DA_CONSULTA = TETO_DE_DESTINATARIOS + 1;

/**
 * A consulta de alcance, como consulta ainda não executada.
 *
 * O ponto aparece duas vezes — no `ST_DWithin` e no `ST_Distance` — e não é
 * descuido: o primeiro filtra usando o índice GiST, o segundo ordena o que
 * sobrou. Um `ST_Distance(...) <= raio` no lugar do `ST_DWithin` daria o mesmo
 * conjunto e **não usaria o índice**, transformando a consulta do pior instante
 * do produto numa varredura da tabela de tutores.
 */
export function construtorDoAlcance(consulta: ConsultaDeAlcance) {
  const { lat, lon } = consulta.centro;
  const inicioDaJanelaDeFadiga = comoData(
    (Number(consulta.agora) - JANELA_DE_24H_EM_MS) as Instant,
  );

  return sql<LinhaDoAlcance>`
    SELECT
      url.user_id AS user_id,
      ARRAY(
        SELECT d.id
          FROM user_devices d
         WHERE d.user_id = url.user_id
           AND d.push_permission = 'granted'
           AND d.push_token IS NOT NULL
         ORDER BY d.last_seen_at DESC, d.id DESC
      ) AS device_ids
      FROM user_reference_locations url
      JOIN users u ON u.id = url.user_id
     WHERE url.expires_at > ${comoData(consulta.agora)}
       AND ST_DWithin(
             url.reference_point,
             ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
             ${consulta.raioEmMetros}
           )
       AND url.user_id <> ${consulta.excluir}
       AND EXISTS (
             SELECT 1
               FROM user_devices d
              WHERE d.user_id = url.user_id
                AND d.push_permission = 'granted'
                AND d.push_token IS NOT NULL
           )
       AND (
             SELECT count(*)
               FROM alert_recipients ar
              WHERE ar.user_id = url.user_id
                AND ar.notified_at > ${inicioDaJanelaDeFadiga}
           ) < ${TETO_DE_FADIGA}
       AND u.deleted_at IS NULL
     ORDER BY ST_Distance(
                url.reference_point,
                ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
              ) ASC,
              url.user_id ASC
     LIMIT ${LIMITE_DA_CONSULTA}
  `;
}

export function criarAlcancePorPostGIS(db: Db): AlcanceDoAlerta {
  return {
    async alcancaveis(consulta: ConsultaDeAlcance): Promise<AlcanceCalculado | null> {
      // Sem `try`/`catch` aqui, e a ausência é deliberada. `unavailable` é a
      // resposta para "não conseguimos calcular", e quem decide isso é quem
      // sabe distinguir uma falha do caminho de um defeito nosso — o serviço,
      // que já trata o erro com o contexto da requisição. Engolir a exceção
      // aqui transformaria erro de programação (coluna renomeada, migração
      // faltando) em `unavailable` silencioso, que é a verificação que não
      // consegue verificar e mesmo assim não reprova.
      const resultado = await construtorDoAlcance(consulta).execute(db);

      const tetoAtingido = resultado.rows.length > TETO_DE_DESTINATARIOS;
      const destinatarios: Destinatario[] = resultado.rows
        .slice(0, TETO_DE_DESTINATARIOS)
        .map((linha) => ({ usuario: linha.user_id as UserId, aparelhos: linha.device_ids }));

      return { destinatarios, tetoAtingido };
    },
  };
}
