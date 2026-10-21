/**
 * Persistência do caso de perdido.
 *
 * Três pontos que não são detalhe de implementação:
 *
 * **A autorização mora na cláusula `WHERE`.** Toda leitura e toda escrita
 * carregam `owner_user_id = :dono`; a consulta que devolveria o caso de outro
 * tutor não existe neste arquivo. Caso alheio responde 404, e aqui isso vale
 * duas vezes: um 403 confirmaria que aquele pet está perdido.
 *
 * **A abertura pode perder uma corrida, e isso é tratado, não evitado.** O
 * índice único parcial `lost_cases_um_aberto_por_pet` é quem garante um caso
 * aberto por pet. Conferir antes e inserir depois deixaria a janela aberta
 * entre as duas operações — e a fila offline do app reenvia exatamente assim,
 * em rajada, quando o sinal volta. O `ON CONFLICT DO NOTHING` transforma a
 * corrida perdida em `null`, que o serviço lê como "já existe".
 *
 * **O ponto entra por SQL e nunca sai.** `ST_MakePoint` grava; nenhuma leitura
 * deste arquivo seleciona `last_seen_point`. O que sai é `has_location`, um
 * booleano — a coordenada não tem por que atravessar a aplicação, e o jeito mais
 * barato de garantir que ela não vaze é ela não estar disponível.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import { rotuloDaArea } from '../../domain/abertura-do-caso.js';
import type {
  AtualizacaoDoCaso,
  CanalDoReencontro,
  CandidatoDecidido,
  CandidatoDoCaso,
  CasoGravado,
  DecisaoDoCandidato,
  DecisaoSobreCandidato,
  DesfechoDoCaso,
  EstadoDoPetParaAbertura,
  EstadoDoPetParaPrevia,
  LostCaseRepository,
  NovoCaso,
  PaginaDeCandidatos,
  StatusDoCaso,
} from '../../ports/lost-case-repository.js';
import type { CaseId, FoundReportId, PetId, UserId } from '../../../../shared/types/brands.js';

interface LinhaDoCaso {
  id: string;
  pet_id: string;
  status: StatusDoCaso;
  last_seen_at: Date;
  tem_ponto: boolean;
  last_seen_city: string | null;
  last_seen_neighborhood: string | null;
  description: string | null;
  share_token: string;
  share_to_public_list: boolean;
  opened_at: Date;
  closed_at: Date | null;
  reopen_deadline: Date | null;
  closure_outcome: DesfechoDoCaso | null;
  closure_channel: CanalDoReencontro | null;
  closure_note: string | null;
}

function comoCaso(l: LinhaDoCaso): CasoGravado {
  return {
    id: l.id as CaseId,
    petId: l.pet_id as PetId,
    status: l.status,
    lastSeenAt: l.last_seen_at,
    hasLocation: l.tem_ponto,
    areaLabel: rotuloDaArea({
      city: l.last_seen_city ?? undefined,
      neighborhood: l.last_seen_neighborhood ?? undefined,
    }),
    description: l.description,
    shareToken: l.share_token,
    shareToPublicList: l.share_to_public_list,
    openedAt: l.opened_at,
    closedAt: l.closed_at,
    reopenDeadline: l.reopen_deadline,
    closureOutcome: l.closure_outcome,
    closureChannel: l.closure_channel,
    closureNote: l.closure_note,
  };
}

/**
 * As colunas da leitura do dono.
 *
 * `last_seen_point` **não está aqui**, e a ausência é a regra: o que sai é
 * `tem_ponto`, um booleano calculado no banco. A coordenada fica onde foi
 * gravada.
 */
const COLUNAS = sql<LinhaDoCaso>`
  id, pet_id, status, last_seen_at,
  (last_seen_point IS NOT NULL) AS tem_ponto,
  last_seen_city, last_seen_neighborhood, description,
  share_token, share_to_public_list, opened_at,
  closed_at, reopen_deadline, closure_outcome, closure_channel, closure_note
`;

export function criarLostCaseRepository(db: Db): LostCaseRepository {
  return {
    async estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura> {
      // UMA consulta para as cinco perguntas. Quem está do outro lado tem 11%
      // de bateria e um animal desaparecido; cinco idas ao banco aqui é latência
      // que dá para não gastar.
      const linha = await sql<{
        existe: boolean;
        tem_foto_pronta: boolean;
        pet_ja_perdido: boolean;
        abertos_da_conta: number;
        tem_canal: boolean;
      }>`
        SELECT
          EXISTS (
            SELECT 1 FROM pets p
             WHERE p.id = ${pet} AND p.owner_user_id = ${dono} AND p.deleted_at IS NULL
          ) AS existe,
          EXISTS (
            SELECT 1 FROM pet_photos f
             WHERE f.pet_id = ${pet} AND f.status = 'ready' AND f.deleted_at IS NULL
          ) AS tem_foto_pronta,
          EXISTS (
            SELECT 1 FROM lost_cases c WHERE c.pet_id = ${pet} AND c.status = 'open'
          ) AS pet_ja_perdido,
          (
            SELECT count(*) FROM lost_cases c
             WHERE c.owner_user_id = ${dono} AND c.status = 'open'
          )::int AS abertos_da_conta,
          -- E-mail OU telefone. Preenchido e não verificado não conta: contato
          -- não verificado é contato que não sabemos se alcança alguém.
          EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = ${dono}
               AND ${canalDeContatoConfirmadoNoSql('u')}
          ) AS tem_canal
      `.execute(db);

      const r = linha.rows[0]!;
      return {
        existeEhDoTutor: r.existe,
        temFotoPronta: r.tem_foto_pronta,
        petJaTemCasoAberto: r.pet_ja_perdido,
        casosAbertosDaConta: Number(r.abertos_da_conta),
        temCanalVerificado: r.tem_canal,
      };
    },

    async estadoParaPrevia(pet: PetId, dono: UserId): Promise<EstadoDoPetParaPrevia> {
      // As cinco perguntas da abertura mais a área de referência do tutor, numa
      // consulta só e pelo mesmo motivo: o toque que dispara esta rota é o toque
      // ANTES de "Avisar agora", e a pessoa está esperando na tela.
      //
      // **A autorização está na cláusula WHERE, e não num `if` depois.** O
      // `EXISTS` de `existe` carrega `owner_user_id = ${dono}`; tirá-lo daqui
      // para conferir o dono no serviço faria a consulta passar a responder
      // sobre pet alheio, que é exatamente o arranjo que o ADR-0021 elimina.
      const linha = await sql<{
        existe: boolean;
        tem_foto_pronta: boolean;
        pet_ja_perdido: boolean;
        abertos_da_conta: number;
        tem_canal: boolean;
        ref_city: string | null;
        ref_neighborhood: string | null;
      }>`
        SELECT
          EXISTS (
            SELECT 1 FROM pets p
             WHERE p.id = ${pet} AND p.owner_user_id = ${dono} AND p.deleted_at IS NULL
          ) AS existe,
          EXISTS (
            SELECT 1 FROM pet_photos f
             WHERE f.pet_id = ${pet} AND f.status = 'ready' AND f.deleted_at IS NULL
          ) AS tem_foto_pronta,
          EXISTS (
            SELECT 1 FROM lost_cases c WHERE c.pet_id = ${pet} AND c.status = 'open'
          ) AS pet_ja_perdido,
          (
            SELECT count(*) FROM lost_cases c
             WHERE c.owner_user_id = ${dono} AND c.status = 'open'
          )::int AS abertos_da_conta,
          EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = ${dono}
               AND ${canalDeContatoConfirmadoNoSql('u')}
          ) AS tem_canal,
          -- A area de referencia do PROPRIO chamador, em texto. Nada aqui
          -- atravessa contas, e nada aqui enumera os outros pets dele: a
          -- contagem de casos abertos e um numero, e numero nao agrupa
          -- (ADR-0010, item 7). Ela tambem nao sai na resposta.
          (SELECT u.reference_city FROM users u WHERE u.id = ${dono}) AS ref_city,
          (SELECT u.reference_neighborhood FROM users u WHERE u.id = ${dono}) AS ref_neighborhood
      `.execute(db);

      const r = linha.rows[0]!;
      return {
        existeEhDoTutor: r.existe,
        temFotoPronta: r.tem_foto_pronta,
        petJaTemCasoAberto: r.pet_ja_perdido,
        casosAbertosDaConta: Number(r.abertos_da_conta),
        temCanalVerificado: r.tem_canal,
        areaDeReferenciaDoTutor: {
          city: r.ref_city ?? undefined,
          neighborhood: r.ref_neighborhood ?? undefined,
        },
      };
    },

    async abrir(novo: NovoCaso): Promise<CasoGravado | null> {
      const ponto =
        novo.lat === undefined || novo.lon === undefined
          ? sql`NULL`
          : sql`ST_SetSRID(ST_MakePoint(${novo.lon}, ${novo.lat}), 4326)::geography`;

      // `ON CONFLICT DO NOTHING` sobre o índice parcial: a corrida perdida sai
      // como zero linhas, e não como exceção. Exceção aqui viraria 500 para um
      // caso que o produto sabe explicar.
      const r = await sql<LinhaDoCaso>`
        INSERT INTO lost_cases (
          id, pet_id, owner_user_id, last_seen_at, last_seen_point,
          last_seen_city, last_seen_neighborhood, last_seen_state,
          description, share_to_public_list, share_token
        ) VALUES (
          ${novo.id}, ${novo.petId}, ${novo.ownerUserId}, ${new Date(Number(novo.lastSeenAt))}, ${ponto},
          ${novo.city ?? null}, ${novo.neighborhood ?? null}, ${novo.state ?? null},
          ${novo.description ?? null}, ${novo.shareToPublicList}, ${novo.shareToken}
        )
        ON CONFLICT DO NOTHING
        RETURNING ${COLUNAS}
      `.execute(db);

      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null> {
      const r = await sql<LinhaDoCaso>`
        SELECT ${COLUNAS} FROM lost_cases
         WHERE id = ${caso} AND owner_user_id = ${dono}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    /**
     * `PATCH /v1/lost-cases/{caseId}` — onde e quando, corrigidos.
     *
     * **Os três predicados do `WHERE` são os mesmos de `encerrar`**, e pela
     * mesma razão: `id`, `owner_user_id` e `status = 'open'`. Zero linhas é
     * `null`, e o serviço o lê como 404 — caso inexistente, caso alheio e caso
     * encerrado são a mesma resposta (ADR-0021; e aqui um 403 confirmaria que
     * aquele pet está perdido).
     *
     * **O ponto é reescrito sempre, inclusive para `NULL`.** Quem corrige de um
     * ponto no mapa para "só o bairro" está dizendo que o ponto estava errado, e
     * `COALESCE` o manteria gravado — o alerta seguiria centrado onde o pet não
     * estava, e `has_location` continuaria `true` numa tela que diz o contrário.
     *
     * `description` e `share_to_public_list` usam o valor antigo quando o corpo
     * não os traz (ver `AtualizacaoDoCaso`). O contrato não detalha isto.
     *
     * **Esses dois ramos dependem da borda, e não só deste arquivo.** O
     * `undefined` que eles procuram só chega aqui porque a rota valida o corpo
     * do `PATCH` sem os `default` do contrato (`corpoSemPadroes`, em
     * `sem-padroes.ts`): `share_to_public_list` tem `default: true` em
     * `LostCaseInput`, e o `useDefaults` do Ajv o preencheria antes do
     * manipulador — este `COALESCE` escrito à mão nunca seria alcançado, e a
     * edição republicaria o caso calada. Tirar aquela chamada reabre o defeito
     * sem tocar nenhuma linha daqui.
     */
    async atualizarOndeEQuando(entrada: AtualizacaoDoCaso): Promise<CasoGravado | null> {
      const ponto =
        entrada.lat === undefined || entrada.lon === undefined
          ? sql`NULL`
          : sql`ST_SetSRID(ST_MakePoint(${entrada.lon}, ${entrada.lat}), 4326)::geography`;

      const r = await sql<LinhaDoCaso>`
        UPDATE lost_cases
           SET last_seen_at = ${new Date(Number(entrada.lastSeenAt))},
               last_seen_point = ${ponto},
               last_seen_city = ${entrada.city ?? null},
               last_seen_neighborhood = ${entrada.neighborhood ?? null},
               last_seen_state = ${entrada.state ?? null},
               description = ${entrada.description === undefined ? sql`description` : sql`${entrada.description}`},
               share_to_public_list = ${
                 entrada.shareToPublicList === undefined
                   ? sql`share_to_public_list`
                   : sql`${entrada.shareToPublicList}`
               }
         WHERE id = ${entrada.caso}
           AND owner_user_id = ${entrada.dono}
           AND status = 'open'
        RETURNING ${COLUNAS}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async encerrar(entrada): Promise<CasoGravado | null> {
      // `status = 'open'` no `WHERE` e não num `if` antes: encerrar duas vezes é
      // o que a fila offline produz, e o segundo encerramento sobrescreveria o
      // desfecho do primeiro — trocando "reencontrado" por "não encontrado" na
      // métrica que mede o produto.
      const r = await sql<LinhaDoCaso>`
        UPDATE lost_cases
           SET status = ${`closed_${entrada.desfecho}`},
               closed_at = ${new Date(Number(entrada.agora))},
               closure_outcome = ${entrada.desfecho},
               closure_channel = ${entrada.canal ?? null},
               closure_note = ${entrada.nota ?? null},
               -- 7 DIAS, e nao 30. O comentario que estava aqui defendia 30 com
               -- um argumento razoavel -- o animal que "voltou" e sumiu de novo
               -- na mesma semana e caso comum. So que o contrato promete 7
               -- (openapi.yaml: "Encerrar e reversivel por 7 dias", e o 410 de
               -- reopenLostCase diz "Passou dos 7 dias"), a tela promete 7, e a
               -- historia BICHUS-78 se chama "Reabrir o caso por 7 dias".
               --
               -- O banco guardando 30 nao e ser generoso: e a tela dizer uma
               -- coisa e o sistema fazer outra, nos dois sentidos. Quem leu
               -- "7 dias" e perdeu o prazo nao tenta no oitavo, e a generosidade
               -- nao serve para ninguem; quem tentasse no vigesimo receberia um
               -- 410 que o banco nao sustenta. Numero de produto se muda na
               -- historia, com quem promete, nao num comentario de adaptador.
               --
               -- (Sem crase neste bloco de proposito: ele vive dentro de um
               -- template literal, e uma crase aqui fecha a string.)
               reopen_deadline = ${new Date(Number(entrada.agora) + 7 * 24 * 3600 * 1000)}
         WHERE id = ${entrada.caso}
           AND owner_user_id = ${entrada.dono}
           AND status = 'open'
        RETURNING ${COLUNAS}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    /**
     * Reabre o caso encerrado por engano. UMA escrita, QUATRO predicados.
     *
     * - `owner_user_id = :dono` -- a autorizacao mora no `WHERE`, como em todo
     *   este arquivo (ADR-0021).
     * - `status <> 'open'` -- so caso encerrado reabre. Reabrir um caso aberto
     *   nao e erro de ninguem: e o reenvio da fila offline, e quem o traduz
     *   para 200 e o servico.
     * - `reopen_deadline > :agora` -- a JANELA, e ela vem da COLUNA e nao de
     *   uma conta refeita aqui. `encerrar` gravou `agora + 7 dias`; refazer a
     *   conta nesta consulta daria duas fontes para o mesmo prazo, e a segunda
     *   seria a que ninguem revisita quando o numero mudar. `reopen_deadline`
     *   nulo (caso encerrado antes de a coluna passar a ser gravada) nao
     *   satisfaz a comparacao, e isso e o certo: prazo que ninguem gravou nao
     *   e prazo em aberto.
     * - `NOT EXISTS (... outro caso aberto do mesmo pet)` -- o indice unico
     *   parcial `lost_cases_um_aberto_por_pet` imporia isso de todo jeito, mas
     *   como VIOLACAO, que chegaria a borda como 500. Como predicado ele chega
     *   como zero linhas, e o servico o distingue dos outros tres relendo o
     *   caso. A subconsulta carrega `id <> :caso` porque o proprio caso
     *   ainda nao esta aberto neste instante -- ele e justamente o que esta
     *   sendo reaberto.
     *
     * **As tres colunas do encerramento voltam a `NULL`, e nao e escolha de
     * estilo**: o `CHECK lost_cases_encerrado_tem_desfecho` exige
     * `closure_outcome IS NULL AND closed_at IS NULL` para `status = 'open'`,
     * nos dois sentidos. Deixar o desfecho gravado num caso aberto nao e um
     * resto inofensivo -- o banco recusa a linha. `closure_channel` e
     * `closure_note` saem pelo mesmo motivo de produto: eles descrevem um
     * encerramento que a pessoa acabou de dizer que nao aconteceu, e o
     * `CHECK lost_cases_canal_so_com_reencontro` amarra o canal ao desfecho.
     * `reopen_deadline` tambem zera: ele e o prazo DAQUELE encerramento.
     */
    async reabrir(entrada): Promise<CasoGravado | null> {
      const r = await sql<LinhaDoCaso>`
        UPDATE lost_cases
           SET status = 'open',
               closed_at = NULL,
               closure_outcome = NULL,
               closure_channel = NULL,
               closure_note = NULL,
               reopen_deadline = NULL
         WHERE id = ${entrada.caso}
           AND owner_user_id = ${entrada.dono}
           AND status <> 'open'
           AND reopen_deadline > ${new Date(Number(entrada.agora))}
           AND NOT EXISTS (
                 SELECT 1 FROM lost_cases outro
                  WHERE outro.pet_id = lost_cases.pet_id
                    AND outro.id <> lost_cases.id
                    AND outro.status = 'open'
               )
        RETURNING ${COLUNAS}
      `.execute(db);
      const linha = r.rows[0];
      return linha === undefined ? null : comoCaso(linha);
    },

    async decidirCandidato(entrada): Promise<CandidatoDecidido | null> {
      const linha = await construtorDaDecisaoDoCandidato(db, entrada).executeTakeFirst();
      return linha === undefined ? null : comoCandidato(linha);
    },

    async candidatoDecididoDoTutor(caso, candidato, dono): Promise<CandidatoDecidido | null> {
      const linha = await construtorDoCandidatoDecidido(
        db,
        caso,
        candidato,
        dono,
      ).executeTakeFirst();
      return linha === undefined ? null : comoCandidato(linha);
    },

    async candidatosDoCaso(caso, dono, pagina): Promise<readonly CandidatoDoCaso[]> {
      const linhas = await construtorDosCandidatosDoCaso(db, caso, dono, pagina).execute();
      return (linhas as unknown as LinhaDoCandidato[]).map(comoCandidatoDoCaso);
    },
  };
}

// ----------------------------------------------------------------------
// A decisão humana sobre um candidato (BICHUS-86, critérios 4, 5 e 12)
// ----------------------------------------------------------------------

/** As colunas do achado que viajam junto do candidato. */
const COLUNAS_DO_ACHADO = [
  'found_reports.id as achado_id',
  'found_reports.origin as achado_origin',
  'found_reports.status as achado_status',
  'found_reports.species as achado_species',
  'found_reports.size as achado_size',
  'found_reports.found_city as achado_city',
  'found_reports.found_neighborhood as achado_neighborhood',
  'found_reports.found_at as achado_found_at',
  'found_reports.notes as achado_notes',
  'found_reports.created_at as achado_created_at',
] as const;

const COLUNAS_DO_CANDIDATO = [
  'match_candidates.id',
  'match_candidates.case_id',
  'match_candidates.found_report_id',
  'match_candidates.score',
  'match_candidates.matched_attributes',
  'match_candidates.distance_m',
  'match_candidates.link_origin',
  'match_candidates.strategy_version',
  'match_candidates.status',
  'match_candidates.created_at',
] as const;

interface LinhaDoCandidato {
  id: string;
  case_id: string;
  found_report_id: string;
  score: string;
  matched_attributes: Record<string, number> | string;
  distance_m: number | null;
  link_origin: 'attribute_match' | 'share_token';
  strategy_version: string;
  status: 'suggested' | 'confirmed' | 'rejected';
  created_at: Date;
  pet_id: string;
  pet_name: string;
  relator_user_id: string | null;
  achado_id: string;
  achado_origin: 'tag_scan' | 'stray_report';
  achado_status: 'open' | 'matched' | 'closed';
  achado_species: string | null;
  achado_size: string | null;
  achado_city: string | null;
  achado_neighborhood: string | null;
  achado_found_at: Date;
  achado_notes: string | null;
  achado_created_at: Date;
}

/**
 * `matched_attributes` é `jsonb` e o driver pode entregá-lo como objeto ou como
 * texto. O contrato declara `matched_attributes` como **lista de strings**: o
 * que vai para a tela é *o que bateu*, e não quanto cada coisa pesou. O peso é
 * a metade do `score`, e o critério 2 da BICHUS-86 tira o `score` da tela.
 */
function atributosQuePontuaram(bruto: Record<string, number> | string): readonly string[] {
  const objeto = typeof bruto === 'string' ? (JSON.parse(bruto) as Record<string, number>) : bruto;
  return Object.keys(objeto).filter((chave) => (objeto[chave] ?? 0) > 0);
}

/**
 * A linha, com o estado como ele está no banco: os TRÊS valores.
 *
 * É o mapeador da listagem, e o da decisão (abaixo) o reusa estreitando só o
 * estado. Dois mapeadores independentes divergiriam no dia em que uma coluna
 * nova entrasse em um e não no outro — e o que sai daqui é a resposta que o
 * tutor lê para dizer "é o meu pet".
 */
function comoCandidatoDoCaso(l: LinhaDoCandidato): CandidatoDoCaso {
  return {
    id: l.id,
    caseId: l.case_id as CaseId,
    foundReportId: l.found_report_id as FoundReportId,
    petId: l.pet_id as PetId,
    nomeDoPet: l.pet_name,
    relatorUserId: l.relator_user_id === null ? null : (l.relator_user_id as UserId),
    score: Number(l.score),
    atributosQuePontuaram: atributosQuePontuaram(l.matched_attributes),
    distanciaEmMetros: l.distance_m === null ? null : Number(l.distance_m),
    linkOrigin: l.link_origin,
    versaoDaEstrategia: l.strategy_version,
    // Sem asserção: `LinhaDoCandidato.status` já é exatamente os três valores
    // de `StatusDoCandidato`, e um `as` aqui esconderia o dia em que o banco
    // ganhar um quarto estado — que é justamente quando se quer o erro.
    status: l.status,
    criadoEm: l.created_at,
    achado: {
      id: l.achado_id as FoundReportId,
      origin: l.achado_origin,
      status: l.achado_status,
      especie: l.achado_species,
      porte: l.achado_size,
      cidade: l.achado_city,
      bairro: l.achado_neighborhood,
      achadoEm: l.achado_found_at,
      observacao: l.achado_notes,
      criadoEm: l.achado_created_at,
    },
  };
}

function comoCandidato(l: LinhaDoCandidato): CandidatoDecidido {
  return {
    ...comoCandidatoDoCaso(l),
    // O `WHERE` da escrita já recusou tudo que não sai de `suggested`, então a
    // linha devolvida nunca está em `suggested`. O estreitamento é asserção, e
    // não conveniência: `DecisaoDoCandidato` não tem o terceiro valor.
    status: l.status as DecisaoDoCandidato,
  };
}

/**
 * O RELATOR DO ACHADO AINDA TEM CONTA HABILITADA?
 *
 * Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
 * nenhuma pagina ou funcionalidade". O candidato e a unica superficie em que o
 * achado de UMA pessoa aparece na tela de OUTRA -- o tutor le o que o relator
 * escreveu (cidade, bairro, observacao, instante) para dizer "e o meu pet".
 * Todas as outras leituras de `found_reports` sao do proprio relator
 * (`reporter_user_id = :dono`) ou do achador sem conta (`finder_token_hash`), e
 * a do proprio relator ja e inalcancavel: `autenticar()` passa por
 * `buscarContaPorId`, que exige `deleted_at is null`, e a conta desabilitada
 * recebe 401 em qualquer rota autenticada.
 *
 * `conta_habilitada` (migracao `20261017000013`) e nao um `innerJoin('users')`:
 * `reporter_user_id` e NULO no achado do achador sem conta, que e o caminho
 * normal da plaquinha, e uma juncao interna apagaria esses achados da lista do
 * tutor em silencio. A funcao devolve verdadeiro para nulo.
 *
 * CONSEQUENCIA MEDIDA, e ela vale nas TRES consultas de proposito: se o relator
 * desabilita a conta depois de ter sido decidido, o reenvio da fila offline
 * (`construtorDoCandidatoDecidido`, criterio 7) deixa de achar a linha e
 * responde como candidato inexistente em vez de repetir a resposta anterior.
 * Preferi isso a manter o candidato vivo em uma das tres: a lista, a escrita da
 * decisao e a releitura precisam concordar sobre quem existe, ou a tela mostra
 * um candidato que a decisao recusa.
 */
const RELATOR_HABILITADO = sql<boolean>`conta_habilitada(found_reports.reporter_user_id)`;

/**
 * A escrita da decisão, como consulta ainda não executada.
 *
 * ## A autorização é `lost_cases.owner_user_id = :dono`, e ela está AQUI
 *
 * Não num `if` antes, e não no banco. A migração
 * `20260922000003_achado-avulso-e-correspondencia.sql` escreve na prosa que
 * *"quem decide é o tutor"*, mas o CHECK que ela cria
 * (`match_candidates_decisao_tem_autor`) cobra apenas **uma pessoa e um
 * instante** — qualquer `users.id` o satisfaz. Medido contra o Postgres: sem o
 * predicado abaixo, uma terceira conta decide a correspondência do caso de
 * outra pessoa e o banco aprova.
 *
 * `match_candidates` não tem coluna de dono, e por desenho: o dono do candidato
 * é o dono do CASO. Por isso a autorização entra por `from('lost_cases')` com a
 * correlação `lost_cases.id = match_candidates.case_id` — sem essa correlação o
 * mesmo SQL, com o mesmo dono ligado, passaria a perguntar *"esta conta tem
 * algum caso?"*, que é a armadilha do produto cartesiano.
 *
 * ## Os outros três predicados
 *
 * - **`match_candidates.case_id = :caso`**: o `candidateId` sozinho já é único,
 *   e o `caseId` do caminho é filtro **a mais**, nunca no lugar do dono. Sem
 *   ele, um candidato de outro caso do mesmo tutor seria decidido pelo endereço
 *   errado, e a trilha registraria a decisão no caso errado.
 * - **`match_candidates.status = 'suggested'`**: está no `WHERE` e não num `if`
 *   antes porque duas confirmações simultâneas — que é o que a fila offline
 *   produz quando o sinal volta — passariam as duas pela conferência antes de
 *   qualquer uma gravar. E é ele que faz *"rejeitado não volta"* (seção 4.10)
 *   ser uma propriedade da escrita, e não uma promessa.
 * - **`lost_cases.status = 'open'`**: decidir correspondência de caso encerrado
 *   abriria conversa sobre um caso que acabou.
 */
export function construtorDaDecisaoDoCandidato(
  db: DbExecutor,
  entrada: DecisaoSobreCandidato,
) {
  return db
    .updateTable('match_candidates')
    .from(['lost_cases', 'found_reports', 'pets'])
    .set({
      status: entrada.decisao,
      decided_by_user_id: entrada.dono,
      decided_at: new Date(Number(entrada.agora)),
    })
    .whereRef('lost_cases.id', '=', 'match_candidates.case_id')
    .whereRef('found_reports.id', '=', 'match_candidates.found_report_id')
    .whereRef('pets.id', '=', 'lost_cases.pet_id')
    .where('pets.deleted_at', 'is', null)
    .where('match_candidates.id', '=', entrada.candidato)
    .where('match_candidates.case_id', '=', entrada.caso)
    .where('match_candidates.status', '=', 'suggested')
    .where('lost_cases.owner_user_id', '=', entrada.dono)
    .where('lost_cases.status', '=', 'open')
    .where(RELATOR_HABILITADO)
    .returning([
      ...COLUNAS_DO_CANDIDATO,
      'lost_cases.pet_id as pet_id',
      'pets.name as pet_name',
      'found_reports.reporter_user_id as relator_user_id',
      ...COLUNAS_DO_ACHADO,
    ]);
}

/**
 * A leitura do candidato JÁ DECIDIDO, com o mesmo predicado do dono.
 *
 * Ela existe para o reenvio da fila offline (critério 7) e **não** relaxa nada:
 * a autorização é a mesma cláusula, na mesma posição lógica. O que muda é só o
 * predicado de status, que aqui é o complementar.
 */
export function construtorDoCandidatoDecidido(
  db: DbExecutor,
  caso: CaseId,
  candidato: string,
  dono: UserId,
) {
  return db
    .selectFrom('match_candidates')
    .innerJoin('lost_cases', (join) =>
      join.onRef('lost_cases.id', '=', 'match_candidates.case_id'),
    )
    .innerJoin('found_reports', (join) =>
      join.onRef('found_reports.id', '=', 'match_candidates.found_report_id'),
    )
    .innerJoin('pets', (join) => join.onRef('pets.id', '=', 'lost_cases.pet_id'))
    .select([
      ...COLUNAS_DO_CANDIDATO,
      'lost_cases.pet_id as pet_id',
      'pets.name as pet_name',
      'found_reports.reporter_user_id as relator_user_id',
      ...COLUNAS_DO_ACHADO,
    ])
    .where('match_candidates.id', '=', candidato)
    .where('match_candidates.case_id', '=', caso)
    .where('match_candidates.status', '<>', 'suggested')
    .where('lost_cases.owner_user_id', '=', dono)
    .where(RELATOR_HABILITADO);
}

/**
 * `GET /v1/lost-cases/{caseId}/candidates` — a leitura, como consulta ainda não
 * executada.
 *
 * ## A autorização é `lost_cases.owner_user_id = :dono`, e ela está AQUI
 *
 * Mesma posição lógica da escrita da decisão, e pelo mesmo motivo:
 * `match_candidates` não tem coluna de dono, e o dono do candidato é o dono do
 * CASO. O predicado entra na junção, com a correlação
 * `lost_cases.id = match_candidates.case_id`; sem a correlação o mesmo SQL, com
 * o mesmo dono ligado, passaria a perguntar *"esta conta tem algum caso?"* — o
 * produto cartesiano que publicaria os candidatos de todos os casos de todos os
 * tutores a qualquer pessoa com cadastro.
 *
 * `match_candidates.case_id = :caso` é filtro **a mais**, nunca no lugar do
 * dono.
 *
 * ## O que esta consulta NÃO filtra, e por quê
 *
 * Ela **não** filtra por `status`. Os três estados saem, e o contrato declara os
 * três em `MatchCandidate.status`: esconder `rejected` faria a lista mudar de
 * tamanho sem explicação depois de um toque irreversível, e esconder `confirmed`
 * tiraria da tela justamente a correspondência que virou conversa.
 *
 * ## A ordem, e o cursor
 *
 * `score` decrescente é o que o contrato manda (*"Ordena a lista"*), com `id`
 * decrescente como desempate estável. O `id` no critério e no cursor não é
 * enfeite: o `score` repete — dois achados que bateram nos mesmos atributos
 * pontuam igual —, e sem ele a página seguinte repetiria ou pularia linhas.
 *
 * A tupla `(score, id) < (:score, :id)` é a comparação lexicográfica que o
 * Postgres resolve de uma vez; a versão escrita à mão com `OR` erra exatamente
 * no empate de `score`, que é quando ela importa.
 */
export function construtorDosCandidatosDoCaso(
  db: DbExecutor,
  caso: CaseId,
  dono: UserId,
  pagina: PaginaDeCandidatos,
) {
  const base = db
    .selectFrom('match_candidates')
    .innerJoin('lost_cases', (join) =>
      join.onRef('lost_cases.id', '=', 'match_candidates.case_id'),
    )
    .innerJoin('found_reports', (join) =>
      join.onRef('found_reports.id', '=', 'match_candidates.found_report_id'),
    )
    .innerJoin('pets', (join) => join.onRef('pets.id', '=', 'lost_cases.pet_id'))
    .select([
      ...COLUNAS_DO_CANDIDATO,
      'lost_cases.pet_id as pet_id',
      'pets.name as pet_name',
      'found_reports.reporter_user_id as relator_user_id',
      ...COLUNAS_DO_ACHADO,
    ])
    .where('match_candidates.case_id', '=', caso)
    .where('lost_cases.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null)
    .where(RELATOR_HABILITADO)
    .orderBy('match_candidates.score', 'desc')
    .orderBy('match_candidates.id', 'desc')
    .limit(pagina.limit);

  const depois = pagina.depoisDe;
  if (depois === undefined) return base;
  return base.where(
    sql<boolean>`(match_candidates.score, match_candidates.id) < (${depois.score}, ${depois.id})`,
  );
}
