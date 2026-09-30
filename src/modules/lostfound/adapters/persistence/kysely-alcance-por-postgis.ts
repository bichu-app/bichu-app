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
 * ## SEC-021: UMA PESSOA, UMA LINHA, MESMO COM DOIS APARELHOS
 *
 * Desde 23/09 a localização de referência é **do aparelho** e não da pessoa
 * (decisão do cliente; migração `20260923000001` troca a chave primária de
 * `user_reference_locations` pelo par `(user_id, session_family_id)`). Quem usa
 * tablet em casa e celular no trabalho passa a ter DUAS linhas, com duas
 * regiões, e passa a ser alcançável por caso aberto perto de qualquer uma —
 * que é o ganho pedido.
 *
 * `GROUP BY url.user_id` existe por causa disso, e o que ele impede é
 * concreto. Sem ele, as duas linhas dentro do raio devolveriam a pessoa duas
 * vezes, e nada aqui é um conjunto: `destinatarios` viraria uma lista com a
 * mesma pessoa repetida, o disparo mandaria o MESMO alerta em duplicata,
 * gastaria dois dos três lugares do teto de fadiga de 24 h, ocuparia dois dos
 * 500 lugares do teto de destinatários (tirando outro tutor do alerta) e faria
 * `reachable_tutors` contar aparelhos enquanto o nome promete tutores.
 *
 * `MIN(ST_Distance(...))` na ordenação, e não `ST_Distance` solto: agrupada, a
 * pessoa tem tantas distâncias quantos aparelhos, e a que a ordena precisa ser
 * a do aparelho MAIS PRÓXIMO. Qualquer outra escolha poria quem tem um
 * aparelho ao lado do caso atrás de quem tem um a quatro quilômetros.
 *
 * **O que este agrupamento NÃO resolve, e precisa estar dito:** `device_ids`
 * continua sendo TODOS os aparelhos alcançáveis da conta, e não o aparelho cuja
 * região casou. O aviso de um caso aberto perto do trabalho chega também no
 * tablet que está em casa. Rotear por aparelho exigiria ligar a linha de
 * `user_devices` à família de refresh, e `user_devices` não tem essa coluna —
 * a identidade de um aparelho ali é o `push_token`, que é nulo de forma
 * legítima. Enquanto ela não existir, o comportamento é MAIS alcance do que
 * antes, nunca menos, e a decisão de estreitá-lo é de produto.
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
 * ## BICHUS-88: `deleted_at IS NULL` aqui é a SEGUNDA camada, desde 22/09
 *
 * Esta junção nasceu como a única defesa contra um defeito real: entre a
 * exclusão lógica (imediata, critério 12) e o expurgo de 30 dias, a linha de
 * `user_reference_locations` continuava existindo — o `expires_at` dela fala da
 * validade da captura, não da conta — e portanto continuava casando com
 * `ST_DWithin`. A junção impedia o alerta de ir para quem pediu para sair, e não
 * consertava o defeito: qualquer outro caminho que lesse a tabela sem ela
 * voltava a ver a linha.
 *
 * O defeito foi consertado na raiz pela migração `20260922000006`: um gatilho em
 * `users` apaga a linha no instante em que `deleted_at` deixa de ser nulo. Não
 * há mais linha para uma consulta distraída encontrar. O ADR-0010 já decidia
 * assim na tabela de retenção — a localização de referência é "apagada ao sair
 * da conta e ao excluir a conta", sem janela.
 *
 * **A cláusula fica.** Ela deixou de ser a única defesa e virou a segunda, e
 * tirá-la trocaria duas camadas por uma sem ganho. Mas o que a segura mudou, e
 * isso precisa estar dito onde alguém vá ler antes de mexer: removê-la já não
 * reprova nenhum caso de `tests/integration/alcance-e-disparo.test.ts` (medido:
 * 252 de 252 verdes sem ela). Quem a segura é `sete-criterios-na-consulta.test.ts`,
 * pelo texto do SQL.
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
     GROUP BY url.user_id
     ORDER BY MIN(ST_Distance(
                url.reference_point,
                ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
              )) ASC,
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
