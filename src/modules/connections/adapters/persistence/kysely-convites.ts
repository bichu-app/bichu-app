/**
 * A persistência do **convite de conexão** e do **alvo por apelido**. **Toda
 * autorização está na cláusula `WHERE`** (ADR-0021).
 *
 * ## Os construtores são exportados, e é de propósito
 *
 * Cada consulta tem um `construtorDe...` que devolve a consulta **compilada**. A
 * suíte unitária não tem banco: ela compila com o `DummyDriver` e **lê o SQL**,
 * que é o único jeito de provar que o predicado está no `WHERE` em vez de num
 * `if` que alguém esquece num caminho novo. É a forma que
 * `autorizacao-na-clausula-where.test.ts` já usa nesta casa.
 *
 * ## A INDISTINGUIBILIDADE, e por que ela é estrutural e não cuidadosa
 *
 * As duas resoluções deste arquivo — token e apelido — devolvem **`undefined` e
 * nada mais**, e nenhuma delas tem um segundo valor de retorno, um código de
 * motivo ou um ramo alternativo. Isso não é disciplina de quem escreveu: é o
 * tipo. Para distinguir "vencido" de "inexistente", ou "bloqueado" de "não
 * existe", alguém teria de **mudar a assinatura** — e é esse o passo que a
 * revisão pega.
 *
 * As três propriedades que a fusão precisa ter para valer:
 *
 * 1. **Mesma consulta.** Não há `SELECT` que confira existência e outro que
 *    confira permissão. Os predicados estão todos no mesmo `WHERE`, então não
 *    existe o estado intermediário "achei a linha, agora decido" em que um
 *    `else` nasceria;
 * 2. **Mesmo custo observável.** Nenhum `LIMIT` condicional, nenhum ramo que
 *    faça uma segunda consulta só num dos casos, nenhuma função chamada só
 *    quando a linha existe. Um apelido bloqueado e um apelido inexistente
 *    percorrem o mesmo plano, e é por isso que o tempo de resposta não conta o
 *    que a resposta não conta;
 * 3. **Mesma resposta na borda.** `undefined` vira `problemas.naoEncontrado()`
 *    num ponto só do caso de uso.
 *
 * **O caso que alguém vai "simplificar" depois** é o 4 de
 * `construtorDoAlvoPorApelido`: ler `conta_habilitada(quemPergunta)` parece
 * redundante, porque quem chama está autenticado. Ele não é: quem desabilitou a
 * própria conta continua com token válido até ele vencer, e sem este predicado
 * ela continuaria pedindo conexão. A isca
 * `indistinguibilidade-do-pedido-por-apelido.test.ts` mede os seis **pelo nome
 * de cada um**, e não por uma asserção comum que passaria faltando um.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type {
  ConviteEmitido,
  ConviteResolvido,
  EmissorDeConvite,
  ResolvedorDeApelido,
  ResolvedorDeConvite,
} from '../../ports/convite-de-conexao.js';

/** Trinta dias em milissegundos: o prazo do convite, igual ao do pendente. */
const VALIDADE_DO_CONVITE_MS = 30 * 24 * 60 * 60 * 1000;

interface LinhaDoConvite {
  readonly owner_user_id: string;
  readonly handle: string;
}

interface LinhaDoAlvo {
  readonly user_id: string;
}

/**
 * **O convite de um token, se ele resolve para quem chama.** Seis predicados na
 * mesma consulta:
 *
 * 1. `i.token_hash = <resumo>` — o endereço. **O resumo, nunca o token cru**: a
 *    coluna guarda os 32 bytes do SHA-256 (`20261020000012`), e `hashDeToken` já
 *    devolve `Buffer` — não há a conversão de string que fez a
 *    `20261020000008` existir;
 * 2. `i.revoked_at IS NULL` — **revogado não resolve**, e cai no mesmo
 *    `undefined` de inexistente;
 * 3. `i.expires_at > agora` — **vencido não resolve**, idem. A expiração é
 *    preguiçosa: nenhuma tarefa periódica, porque toda leitura compara com o
 *    agora;
 * 4. `h.kind = 'pessoa'` — o apelido que sai é de **pessoa**. O espaço de nomes
 *    é compartilhado com pet e com reservado (`20261018000021`);
 * 5. `conta_habilitada` nos **dois** lados — quem desabilitou a conta não emite
 *    convite que resolva, e quem desabilitou a própria não resolve o de
 *    ninguém;
 * 6. `NOT bloqueio_entre(i.owner_user_id, quemChama)` — **simétrico.** Um
 *    convite emitido **antes** do bloqueio e resgatado **depois** é exatamente o
 *    furo que `leitor-de-bloqueio.ts` descreve como "o futuro", e é aqui que ele
 *    fecha.
 *
 * **`INNER JOIN handles`, e não `LEFT JOIN`**: convite cujo dono não tem apelido
 * **não resolve**, porque a página de destino é endereçada pelo apelido e quem
 * não tem apelido não tem página (`PersonProfile.handle` não é anulável). Com
 * `LEFT JOIN` o apelido viria nulo e a borda teria de decidir o que fazer com
 * isso — o que é um ramo a mais onde este arquivo promete não ter nenhum.
 *
 * **`perfil_ocultado_para_quem_denunciou` NÃO está aqui, e a ausência é
 * deliberada.** Ela é a ocultação de quem **quem chama** denunciou, e ela entra
 * na leitura do perfil (`construtorDoPerfilPorApelido`), que é o passo seguinte
 * e obrigatório: resolver o convite devolve um apelido, e a tela de destino é o
 * perfil. Repeti-la aqui seria a segunda cópia de um predicado que o caminho já
 * atravessa — e a segunda é a que divergiria no dia em que a primeira mudasse.
 */
export function construtorDoConvitePorToken(
  db: Kysely<Database>,
  token: string,
  quemChama: UserId,
  agora: Instant,
): CompiledQuery<LinhaDoConvite> {
  return db
    .selectFrom('connection_invites as i')
    .innerJoin('users as u', 'u.id', 'i.owner_user_id')
    .innerJoin('handles as h', 'h.user_id', 'u.id')
    .select(['i.owner_user_id as owner_user_id', 'h.handle as handle'])
    .where('i.token_hash', '=', hashDeToken(token))
    .where(sql<boolean>`i.revoked_at IS NULL`)
    // `::timestamptz` explicito, como em toda consulta de conexao desta casa:
    // sem o molde o Postgres nao infere o tipo do parametro, e o defeito
    // aparece como "operator does not exist" so contra um banco de verdade --
    // nenhum teste de SQL compilado o acusaria (medido em 18/10/2026, e o
    // cabecalho de `kysely-connections-repository.ts` o registra).
    .where(sql<boolean>`i.expires_at > ${comoData(agora)}::timestamptz`)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemChama}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(i.owner_user_id, ${quemChama}::uuid)`)
    .compile();
}

/**
 * **A conta de um apelido, se ela existe para quem pergunta.** Os MESMOS seis
 * predicados de `construtorDoPerfilPorApelido`, e a igualdade é o ponto: um
 * apelido que o perfil não mostra é um apelido ao qual o pedido não chega, e
 * vice-versa. Dois conjuntos diferentes de predicados nas duas consultas
 * fariam a busca mostrar alguém a quem não se pode pedir — ou, pior, deixariam
 * pedir a quem a busca esconde.
 *
 * 1. `h.handle = apelido` — `citext` no banco, então `@Maria` e `@maria` são a
 *    mesma chave sem a aplicação normalizar nada;
 * 2. `h.kind = 'pessoa'` — apelido de **pet** e **reservado** respondem o mesmo
 *    404 de inexistente;
 * 3. `conta_habilitada(u.id)`;
 * 4. `conta_habilitada(quemPergunta)` — **o predicado que parece redundante e
 *    não é**: ver o cabeçalho deste arquivo;
 * 5. `NOT bloqueio_entre(u.id, quemPergunta)` — simétrico;
 * 6. `NOT perfil_ocultado_para_quem_denunciou(u.public_ref, quemPergunta)`.
 *
 * **Só `u.id` é selecionado**, e nada mais: quem chama precisa da conta para
 * criar a aresta, e `UserId` não atravessa a borda HTTP. Selecionar nome ou
 * `public_ref` aqui seria dar a esta consulta material de resposta que ela não
 * tem por que ter — e é desse material que um oráculo é feito.
 */
export function construtorDoAlvoPorApelido(
  db: Kysely<Database>,
  apelido: string,
  quemPergunta: UserId,
): CompiledQuery<LinhaDoAlvo> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
    .select('u.id as user_id')
    .where('h.handle', '=', apelido)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemPergunta}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemPergunta}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemPergunta}::uuid)`,
    )
    .compile();
}

/**
 * O resolvedor de convite de PRODUÇÃO.
 *
 * Ele substitui `nenhumConviteExiste`, que era a afirmação executável de que
 * nenhuma conta alcançava nenhuma outra — e que **deixou de ser o desenho** em
 * 20/10/2026. A dívida que ela declarava (*"trocá-la é o trabalho de H′ e H″, e
 * é uma linha na fiação"*) foi paga por um terceiro caminho que o cliente pediu,
 * e não por H′ nem H″: as duas continuam sem existir.
 */
export function criarResolvedorDeConvite(
  db: Kysely<Database>,
  // O relogio ENTRA, e nao e `Date.now()` aqui dentro: a porta
  // `ResolvedorDeConvite.resolver` nao recebe `agora` -- ela e a mesma
  // assinatura que `nenhumConviteExiste` tinha --, e sem o relogio injetado a
  // unica saida seria ler o relogio de parede neste arquivo. Isso tornaria "o
  // convite vence em 30 dias" impossivel de testar sem esperar, que e
  // exatamente o que `shared/time/clock.ts` existe para impedir.
  clock: Clock,
): ResolvedorDeConvite {
  return {
    async resolver(token: string, quemChama: UserId): Promise<ConviteResolvido | undefined> {
      const { rows } = await db.executeQuery(
        construtorDoConvitePorToken(db, token, quemChama, clock.now()),
      );
      const linha = rows[0];
      if (linha === undefined) return undefined;
      return {
        alvo: linha.owner_user_id as UserId,
        // **Fixo, e não um parâmetro.** `origin` diz qual CREDENCIAL a
        // requisição carregou, e quem chegou por aqui carregou um token de
        // convite. Deixá-lo configurável permitiria a uma borda declarar a
        // procedência que quisesse, que é o oposto de procedência.
        origem: 'invite_link',
        apelido: linha.handle,
      };
    },
  };
}

/** O resolvedor de apelido de produção. Ver `construtorDoAlvoPorApelido`. */
export function criarResolvedorDeApelido(db: Kysely<Database>): ResolvedorDeApelido {
  return {
    async resolver(apelido: string, quemPergunta: UserId): Promise<UserId | undefined> {
      const { rows } = await db.executeQuery(
        construtorDoAlvoPorApelido(db, apelido, quemPergunta),
      );
      const linha = rows[0];
      return linha === undefined ? undefined : (linha.user_id as UserId);
    },
  };
}

/**
 * O emissor de convite.
 *
 * **Revogar e inserir acontecem na MESMA transação**, e não é zelo: o índice
 * parcial único `connection_invites_um_ativo_por_conta` recusa a segunda linha
 * ativa, então um `INSERT` sem a revogação anterior **falha**. Fora de uma
 * transação, a revogação poderia valer e o `INSERT` falhar — e a conta ficaria
 * sem convite nenhum, com o link antigo já morto. O dono apertaria "gerar" e
 * perderia o que tinha.
 */
export function criarEmissorDeConvite(
  db: Kysely<Database>,
  ids: IdGenerator,
): EmissorDeConvite {
  return {
    async emitir(dono: UserId, agora: Instant): Promise<ConviteEmitido> {
      // 256 bits de CSPRNG, a mesma porta que todo token ao portador desta casa
      // usa. O cru existe nesta variavel e na resposta, e em lugar nenhum mais.
      const token = ids.opaqueToken();
      // `Instant` e milissegundos desde a epoca, entao o prazo e aritmetica
      // sobre numero -- e nao `new Date()`, que a regra de lint proibe fora de
      // `shared/time/clock.ts` e que aqui nem seria necessario.
      const expiraEm = (agora + VALIDADE_DO_CONVITE_MS) as Instant;

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('connection_invites')
          .set({ revoked_at: comoData(agora) })
          .where('owner_user_id', '=', dono)
          .where(sql<boolean>`revoked_at IS NULL`)
          .execute();
        await trx
          .insertInto('connection_invites')
          .values({
            id: ids.uuidv7(),
            owner_user_id: dono,
            token_hash: hashDeToken(token),
            expires_at: comoData(expiraEm),
            revoked_at: null,
          })
          .execute();
      });

      return { token, expiraEm };
    },

    async revogar(dono: UserId, agora: Instant): Promise<void> {
      // Idempotente: sem convite ativo, nenhuma linha casa e nada falha.
      await db
        .updateTable('connection_invites')
        .set({ revoked_at: comoData(agora) })
        .where('owner_user_id', '=', dono)
        .where(sql<boolean>`revoked_at IS NULL`)
        .execute();
    },
  };
}
