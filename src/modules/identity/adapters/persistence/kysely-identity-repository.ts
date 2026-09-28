/**
 * Persistência do módulo `identity`.
 *
 * Aqui mora a tradução entre a linguagem do domínio e as tabelas. Dois pontos em
 * que a implementação decide correção, e não desempenho:
 *
 * - **criação de conta** grava `users`, `user_identities` e `local_credentials`
 *   na mesma transação. Conta sem credencial é um estado que ninguém consegue
 *   corrigir pela interface;
 * - **rotação de refresh** consome o token apresentado com um `UPDATE`
 *   condicional e grava o sucessor na mesma transação. Ler e depois atualizar em
 *   dois passos permitiria a dois pedidos simultâneos rotacionarem o mesmo
 *   token, que é exatamente o cenário que a detecção de reuso existe para
 *   distinguir de um roubo.
 */
import { sql, type Insertable } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { UsersTable } from '../../../../shared/db/schema.js';
import { barreiraDeContaNova } from '../../domain/session.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { Instant, TokenHash, UserId } from '../../../../shared/types/brands.js';
import type {
  ConsumoDeJanela,
  ConsequenciasDaExclusao,
  Conta,
  CredencialLocal,
  IdentityRepository,
  MotivoDeRevogacao,
  NovaConta,
  NovaJanelaDeReautenticacao,
  NovoRefresh,
  NovoTokenDeVerificacao,
  ResultadoDoConsumoDaJanela,
  TokenConsumido,
  RefreshArmazenado,
} from '../../ports/identity-repository.js';
import { conferirJanela, type JanelaDeReautenticacao } from '../../domain/reautenticacao.js';

const VIOLACAO_DE_UNICIDADE = '23505';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { code?: unknown }).code === VIOLACAO_DE_UNICIDADE
  );
}

type LinhaDeConta = Pick<
  UsersTable,
  | 'id'
  | 'email'
  | 'email_verified_at'
  | 'display_name'
  | 'phone_e164'
  | 'phone_verified_at'
  | 'reference_postal_code'
  | 'reference_neighborhood'
  | 'reference_city'
  | 'reference_state'
  | 'pending_email'
  | 'deleted_at'
>;

const COLUNAS_DA_CONTA = [
  'id',
  'email',
  'email_verified_at',
  'display_name',
  'phone_e164',
  'phone_verified_at',
  'reference_postal_code',
  'reference_neighborhood',
  'reference_city',
  'reference_state',
  'pending_email',
  'email_deliverable',
  'status',
  'sessions_invalid_before',
  'created_at',
] as const;

interface LinhaSelecionada extends LinhaDeConta {
  email_deliverable: boolean;
  status: 'active' | 'suspended' | 'deletion_requested';
  sessions_invalid_before: Date;
  created_at: Date;
}

function paraConta(linha: LinhaSelecionada): Conta {
  return {
    id: linha.id as UserId,
    email: linha.email,
    emailVerifiedAt: linha.email_verified_at,
    displayName: linha.display_name,
    phoneE164: linha.phone_e164,
    phoneVerifiedAt: linha.phone_verified_at,
    referencePostalCode: linha.reference_postal_code,
    referenceNeighborhood: linha.reference_neighborhood,
    referenceCity: linha.reference_city,
    referenceState: linha.reference_state,
    pendingEmail: linha.pending_email,
    emailDeliverable: linha.email_deliverable,
    status: linha.status,
    // A conversão para `Instant` acontece na borda da persistência: o domínio
    // fala em milissegundos e nunca constrói data.
    sessionsInvalidBefore: linha.sessions_invalid_before.getTime() as Instant,
    createdAt: linha.created_at,
  };
}

/**
 * ## Os construtores da escrita em massa, e por que eles saíram de dentro da fábrica
 *
 * As duas instruções abaixo são `UPDATE` **sem `id` no `WHERE`**: o que decide
 * quantas linhas elas atingem é a coluna de escopo, e só ela. Removida a
 * `user_id`, as duas continuam sintaticamente válidas, continuam devolvendo um
 * número, e passam a valer para a base inteira — um "sair de todos os
 * aparelhos" derrubaria a sessão de todo mundo, e uma troca de senha queimaria
 * o link de verificação de todo mundo.
 *
 * Isso não é observável pelo lado de fora. Quem chama recebe o efeito que
 * pediu; quem paga são contas que nenhuma requisição mencionou. Nem o dublê em
 * memória acusa: ele apaga do `Map` da conta pedida de qualquer jeito, e a
 * cardinalidade do `UPDATE` não existe dentro dele.
 *
 * `construtorD*` existe para que o escopo seja **verificável**:
 * `escopo-de-escrita-em-massa.test.ts` compila estas funções sem executá-las e
 * confere a cláusula `WHERE` inteira, e
 * `tests/integration/escopo-da-revogacao-em-massa.test.ts` conta as linhas
 * atingidas em Postgres de verdade, com duas contas na tabela.
 *
 * Eles recebem `DbExecutor` e não `Db` para que o mesmo predicado valha se um
 * dia a chamada vier de dentro de uma transação.
 */

/**
 * **SEC-006, revogação em massa das famílias de refresh de UMA conta.**
 *
 * Uma instrução. Varrer família por família exigiria primeiro listá-las, e
 * entre a lista e o `UPDATE` uma renovação em curso abriria uma linha nova que
 * a varredura já não alcançaria — a sessão que o gatilho existe para derrubar
 * sobreviveria à própria revogação.
 *
 * `user_id = $n` é o escopo, e ele é o único limite de alcance desta
 * instrução: a ADR-0002 (emenda 1) separa "sair" de "sair de todos os
 * aparelhos" em dois mecanismos, e **os dois param na pessoa**. Nenhum dos
 * cinco gatilhos do SEC-006 é da plataforma para a base.
 *
 * `revoked_at IS NULL` mantém a idempotência: chamada duas vezes, a segunda
 * devolve 0 e não reescreve o motivo nem a hora da primeira.
 */
export function construtorDaRevogacaoEmMassa(
  db: DbExecutor,
  userId: UserId,
  motivo: MotivoDeRevogacao,
  agora: Instant,
) {
  return db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date(agora), revoked_reason: motivo })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning('id');
}

/**
 * **BICHUS-48: as cinco amarras da janela de reautenticação, todas no `WHERE`.**
 *
 * Uma instrução, e ela CONSOME ao mesmo tempo em que confere. Ler a linha,
 * decidir na aplicação e marcar depois é a forma que o ADR-0021 existe para
 * eliminar, e aqui ela também perderia o uso único: duas chamadas simultâneas
 * de `DELETE /me` com a mesma janela passariam as duas pela conferência antes
 * de qualquer uma marcar.
 *
 * Cada predicado responde por uma amarra, e nenhum é redundante:
 *
 * | predicado | o que ele impede |
 * |---|---|
 * | `token_hash = $n` | endereça a linha, e só ela (256 bits de CSPRNG) |
 * | `user_id = $n` | janela de OUTRA conta apresentada nesta sessão |
 * | `scope = $n` | janela aberta para revogar a tag usada para excluir a conta |
 * | `access_jti = $n` | janela copiada para outro aparelho |
 * | `consumed_at IS NULL` | segunda apresentação do mesmo valor |
 * | `expires_at > $agora` | janela vencida |
 * | `issued_at >= $barreira` | janela anterior a uma troca de senha ou a um logout-all (SEC-006) |
 *
 * `reautenticacao-na-clausula-where.test.ts` compila esta função sem executá-la
 * e cobra os sete, com isca que precisa reprovar quando qualquer um sai.
 */
export function construtorDoConsumoDaJanela(db: DbExecutor, consumo: ConsumoDeJanela) {
  return db
    .updateTable('reauth_tokens')
    .set({ consumed_at: new Date(consumo.agora) })
    .where('token_hash', '=', Buffer.from(consumo.tokenHash))
    .where('user_id', '=', consumo.userId)
    .where('scope', '=', consumo.escopoExigido)
    .where('access_jti', '=', consumo.acessoJti)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', new Date(consumo.agora))
    .where('issued_at', '>=', new Date(consumo.barreiraDaConta))
    .returning('id');
}

/**
 * A leitura que NOMEIA a recusa, e só ela.
 *
 * Endereça pelo hash e por nada mais, de propósito: é assim que ela consegue
 * dizer "esta janela existe e é de outra conta" em vez de "não achei nada". O
 * resultado vai para a trilha e **nunca para o corpo da resposta** — quem
 * apresentou uma janela recusada recebe o mesmo 401 nos seis casos.
 */
export function construtorDaLeituraDaJanela(db: DbExecutor, tokenHash: TokenHash) {
  return db
    .selectFrom('reauth_tokens')
    .select(['id', 'user_id', 'scope', 'access_jti', 'issued_at', 'expires_at', 'consumed_at'])
    .where('token_hash', '=', Buffer.from(tokenHash));
}

/**
 * **Critério 9 da BICHUS-77: nenhum link pendente sobrevive à troca de senha.**
 *
 * Mesma forma e mesmo risco da revogação de famílias: `user_id = $n` é o que
 * separa "queimo os links desta conta" de "queimo os links de todo mundo", e a
 * segunda leitura deixaria toda verificação de e-mail e toda redefinição em
 * curso na plataforma morrer sem que ninguém conseguisse dizer por quê.
 *
 * `consumed_at IS NULL` não é filtro de correção e sim de idempotência e de
 * verdade da contagem: sem ele a chamada reescreveria a hora de consumo de
 * tokens já gastos e devolveria um número que não é o de links queimados.
 */
export function construtorDaInvalidacaoDeTokensPendentes(
  db: DbExecutor,
  userId: UserId,
  agora: Instant,
) {
  return db
    .updateTable('verification_tokens')
    .set({ consumed_at: new Date(agora) })
    .where('user_id', '=', userId)
    .where('consumed_at', 'is', null);
}

export function criarIdentityRepository(db: Db, ids: IdGenerator): IdentityRepository {
  return {
    async criarContaLocal(nova: NovaConta): Promise<Conta | undefined> {
      const userId = ids.uuidv7();
      const identityId = ids.uuidv7();
      const agora = new Date(nova.agora);

      const valores: Insertable<UsersTable> = {
        id: userId,
        email: nova.email,
        display_name: nova.displayName ?? null,
        accepted_terms_version: nova.acceptedTermsVersion ?? null,
        accepted_terms_at: nova.acceptedTermsVersion === undefined ? null : agora,
        // A conta nasce com a barreira do SEC-006 no segundo da criação: assim
        // nenhum token anterior a ela pode existir, nem por relógio adiantado.
        // TRUNCADA AO SEGUNDO de propósito — ver `barreiraDeContaNova`: com a
        // precisão de milissegundo, o token que o próprio cadastro devolve
        // nascia revogado, e `POST /v1/auth/register` entregava uma sessão que
        // não abria nenhuma tela.
        sessions_invalid_before: new Date(barreiraDeContaNova(nova.agora)),
        created_at: agora,
        updated_at: agora,
      };

      try {
        return await db.transaction().execute(async (trx) => {
          const conta = await trx
            .insertInto('users')
            .values(valores)
            .returning(COLUNAS_DA_CONTA)
            .executeTakeFirstOrThrow();

          await trx
            .insertInto('user_identities')
            .values({
              id: identityId,
              user_id: userId,
              provider: 'local',
              // `provider_subject` do provedor local é o próprio UUID interno.
              // Usar o e-mail aqui reintroduziria pelo lado do vínculo a chave
              // que o ADR-0002 existe para proibir.
              provider_subject: userId,
              email_at_provider: nova.email,
              linked_at: agora,
            })
            .execute();

          await trx
            .insertInto('local_credentials')
            .values({
              identity_id: identityId,
              password_phc: nova.passwordPhc,
              password_updated_at: agora,
            })
            .execute();

          await trx.insertInto('user_roles').values({ user_id: userId, role: 'tutor' }).execute();

          return paraConta(conta as LinhaSelecionada);
        });
      } catch (erro) {
        // E-mail já cadastrado é resposta, não incidente. Quem chama decide o
        // que a resposta revela.
        if (ehViolacaoDeUnicidade(erro)) return undefined;
        throw erro;
      }
    },

    async papeisDaConta(userId: UserId): Promise<readonly string[]> {
      const linhas = await db.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
      return linhas.map((linha) => linha.role);
    },

    async buscarContaPorId(id: UserId): Promise<Conta | undefined> {
      const linha = await db
        .selectFrom('users')
        .select(COLUNAS_DA_CONTA)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
    },

    async atualizarPerfil(id: UserId, campos, agora): Promise<Conta | undefined> {
      // Só entra no `SET` o que veio no corpo. `undefined` é "não mexer" e
      // `null` é "apagar": montar o objeto com todos os campos transformaria um
      // `PATCH` de um campo numa limpeza silenciosa dos outros cinco.
      const mudancas: Record<string, unknown> = { updated_at: new Date(Number(agora)) };
      const mapa = {
        displayName: 'display_name',
        phoneE164: 'phone_e164',
        referencePostalCode: 'reference_postal_code',
        referenceNeighborhood: 'reference_neighborhood',
        referenceCity: 'reference_city',
        referenceState: 'reference_state',
      } as const;

      for (const [campo, coluna] of Object.entries(mapa)) {
        const valor = (campos as Record<string, unknown>)[campo];
        if (valor !== undefined) mudancas[coluna] = valor;
      }

      // Trocar o telefone invalida a verificação anterior: o número novo não
      // herda a confiança do antigo, e `can_open_lost_case` precisa cair junto.
      if (mudancas['phone_e164'] !== undefined) mudancas['phone_verified_at'] = null;

      const linha = await db
        .updateTable('users')
        .set(mudancas)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(COLUNAS_DA_CONTA)
        .executeTakeFirst();

      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
    },

    async buscarContaPorEmail(email: string): Promise<Conta | undefined> {
      const linha = await db
        .selectFrom('users')
        .select(COLUNAS_DA_CONTA)
        .where('email', '=', email)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
    },

    async buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined> {
      const linha = await db
        .selectFrom('local_credentials')
        .innerJoin('user_identities', 'user_identities.id', 'local_credentials.identity_id')
        .innerJoin('users', 'users.id', 'user_identities.user_id')
        .select([
          'local_credentials.identity_id as identity_id',
          'local_credentials.password_phc as password_phc',
          'local_credentials.must_change as must_change',
          'users.id as user_id',
        ])
        .where('users.email', '=', email)
        .where('users.deleted_at', 'is', null)
        .where('user_identities.provider', '=', 'local')
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        identityId: linha.identity_id,
        userId: linha.user_id as UserId,
        passwordPhc: linha.password_phc,
        mustChange: linha.must_change,
      };
    },

    async regravarCredencial(identityId: string, passwordPhc: string, agora: Instant): Promise<void> {
      await db
        .updateTable('local_credentials')
        .set({ password_phc: passwordPhc, password_updated_at: new Date(agora) })
        .where('identity_id', '=', identityId)
        .execute();
    },

    async registrarLogin(identityId: string, agora: Instant): Promise<void> {
      await db
        .updateTable('user_identities')
        .set({ last_login_at: new Date(agora) })
        .where('id', '=', identityId)
        .execute();
    },

    async gravarRefresh(novo: NovoRefresh): Promise<void> {
      await db
        .insertInto('refresh_tokens')
        .values({
          id: novo.id,
          user_id: novo.userId,
          family_id: novo.familyId,
          token_hash: Buffer.from(novo.tokenHash, 'base64'),
          // Explícito, e não pelo `DEFAULT now()` da coluna: é este valor que
          // `renovar()` compara com `sessions_invalid_before`, que também é
          // gravado pelo relógio da aplicação.
          issued_at: new Date(novo.issuedAt),
          expires_at: new Date(novo.expiresAt),
          absolute_expires_at: new Date(novo.absoluteExpiresAt),
          stay_signed_in: novo.staySignedIn,
          user_agent: novo.userAgent ?? null,
          ip_hmac: novo.ipHmac,
          rotated_to_id: null,
          revoked_at: null,
          revoked_reason: null,
          device_id: null,
        })
        .execute();
    },

    async buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined> {
      const linha = await db
        .selectFrom('refresh_tokens')
        .select([
          'id',
          'user_id',
          'family_id',
          'issued_at',
          'expires_at',
          'absolute_expires_at',
          'stay_signed_in',
          'rotated_to_id',
          'revoked_at',
        ])
        .where('token_hash', '=', Buffer.from(hash, 'base64'))
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return {
        id: linha.id,
        userId: linha.user_id as UserId,
        familyId: linha.family_id,
        issuedAt: linha.issued_at.getTime() as Instant,
        expiresAt: linha.expires_at.getTime() as Instant,
        absoluteExpiresAt: linha.absolute_expires_at.getTime() as Instant,
        staySignedIn: linha.stay_signed_in,
        rotatedToId: linha.rotated_to_id,
        revokedAt: linha.revoked_at,
      };
    },

    async rotacionar(
      tokenAtualId: string,
      sucessor: NovoRefresh,
      agora: Instant,
    ): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        await trx
          .insertInto('refresh_tokens')
          .values({
            id: sucessor.id,
            user_id: sucessor.userId,
            family_id: sucessor.familyId,
            token_hash: Buffer.from(sucessor.tokenHash, 'base64'),
            issued_at: new Date(sucessor.issuedAt),
            expires_at: new Date(sucessor.expiresAt),
            absolute_expires_at: new Date(sucessor.absoluteExpiresAt),
            stay_signed_in: sucessor.staySignedIn,
            user_agent: sucessor.userAgent ?? null,
            ip_hmac: sucessor.ipHmac,
            rotated_to_id: null,
            revoked_at: null,
            revoked_reason: null,
            device_id: null,
          })
          .execute();

        // O `WHERE` carrega a condição de consumo. Se outro pedido já consumiu
        // este token, nenhuma linha volta e a transação inteira é desfeita,
        // inclusive o sucessor recém-inserido.
        const consumido = await trx
          .updateTable('refresh_tokens')
          .set({
            rotated_to_id: sucessor.id,
            revoked_at: new Date(agora),
            revoked_reason: 'rotation',
          })
          .where('id', '=', tokenAtualId)
          .where('rotated_to_id', 'is', null)
          .where('revoked_at', 'is', null)
          .returning('id')
          .executeTakeFirst();

        if (consumido === undefined) {
          throw new RotacaoPerdida();
        }
        return true;
      }).catch((erro: unknown) => {
        if (erro instanceof RotacaoPerdida) return false;
        throw erro;
      });
    },

    async revogarFamilia(
      familyId: string,
      motivo: MotivoDeRevogacao,
      agora: Instant,
    ): Promise<number> {
      const linhas = await db
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date(agora), revoked_reason: motivo })
        .where('family_id', '=', familyId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .execute();
      return linhas.length;
    },

    /** O predicado mora em {@link construtorDaRevogacaoEmMassa}. */
    async revogarTodasAsFamilias(
      userId: UserId,
      motivo: MotivoDeRevogacao,
      agora: Instant,
    ): Promise<number> {
      const linhas = await construtorDaRevogacaoEmMassa(db, userId, motivo, agora).execute();
      return linhas.length;
    },

    async invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void> {
      // `GREATEST` e não atribuição direta: a barreira é calculada a partir do
      // valor lido antes, e duas revogações simultâneas leem o mesmo valor. Sem
      // o piso, a que terminasse por último podia gravar um instante MENOR que a
      // outra já tinha gravado e devolver a janela que as duas existem para
      // fechar. A coluna só anda para a frente.
      await db
        .updateTable('users')
        .set({
          sessions_invalid_before: sql<Date>`greatest(${sql.val(new Date(barreira))}::timestamptz, sessions_invalid_before)`,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },

    async criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
      await db
        .insertInto('verification_tokens')
        .values({
          id: novo.id,
          user_id: novo.userId,
          purpose: novo.proposito,
          token_hash: Buffer.from(novo.tokenHash),
          sent_to: novo.enviadoPara,
          expires_at: new Date(novo.expiraEm),
          created_ip_hmac: novo.ipHmac === null ? null : Buffer.from(novo.ipHmac),
        })
        .execute();
    },

    async consumirTokenDeVerificacao(hash, proposito, agora): Promise<TokenConsumido | undefined> {
      // UMA instrução. As três condições no `WHERE` e a marcação no `SET` são
      // avaliadas sob a mesma trava de linha: duas aberturas simultâneas do
      // mesmo link disputam a linha, e só uma sai com `RETURNING`.
      const linha = await db
        .updateTable('verification_tokens')
        .set({ consumed_at: new Date(agora) })
        .where('token_hash', '=', Buffer.from(hash))
        .where('purpose', '=', proposito)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .returning(['user_id', 'sent_to'])
        .executeTakeFirst();

      return linha === undefined
        ? undefined
        : { userId: linha.user_id as UserId, enviadoPara: linha.sent_to };
    },

    async conferirTokenDeVerificacao(hash, proposito, agora): Promise<TokenConsumido | undefined> {
      const linha = await db
        .selectFrom('verification_tokens')
        .select(['user_id', 'sent_to'])
        .where('token_hash', '=', Buffer.from(hash))
        .where('purpose', '=', proposito)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .executeTakeFirst();

      return linha === undefined
        ? undefined
        : { userId: linha.user_id as UserId, enviadoPara: linha.sent_to };
    },

    /** O predicado mora em {@link construtorDaInvalidacaoDeTokensPendentes}. */
    async invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
      const r = await construtorDaInvalidacaoDeTokensPendentes(db, userId, agora).executeTakeFirst();
      return Number(r.numUpdatedRows);
    },

    async criarJanelaDeReautenticacao(nova: NovaJanelaDeReautenticacao): Promise<void> {
      await db
        .insertInto('reauth_tokens')
        .values({
          id: nova.id,
          user_id: nova.userId,
          access_jti: nova.acessoJti,
          scope: nova.escopo,
          token_hash: Buffer.from(nova.tokenHash),
          issued_at: new Date(nova.emitidaEm),
          expires_at: new Date(nova.expiraEm),
          created_ip_hmac: nova.ipHmac === null ? null : Buffer.from(nova.ipHmac),
        })
        .execute();
    },

    /** O predicado mora em {@link construtorDoConsumoDaJanela}. */
    async consumirJanelaDeReautenticacao(
      consumo: ConsumoDeJanela,
    ): Promise<ResultadoDoConsumoDaJanela> {
      const linha = await construtorDoConsumoDaJanela(db, consumo).executeTakeFirst();
      if (linha !== undefined) return { consumida: true };

      // Só no caminho de recusa, e só para a trilha. A leitura endereça pelo
      // hash, que é o que permite distinguir "não existe" de "existe e não
      // serve" — distinção que fica AQUI DENTRO.
      const bruta = await construtorDaLeituraDaJanela(db, consumo.tokenHash).executeTakeFirst();
      if (bruta === undefined) return { consumida: false, motivo: 'inexistente' };

      const janela: JanelaDeReautenticacao = {
        id: bruta.id,
        userId: bruta.user_id,
        escopo: bruta.scope,
        acessoJti: bruta.access_jti,
        emitidaEm: bruta.issued_at.getTime() as Instant,
        expiraEm: bruta.expires_at.getTime() as Instant,
        consumidaEm: bruta.consumed_at === null ? null : (bruta.consumed_at.getTime() as Instant),
      };
      const veredicto = conferirJanela(janela, {
        userId: consumo.userId,
        escopoExigido: consumo.escopoExigido,
        acessoJti: consumo.acessoJti,
        barreiraDaConta: consumo.barreiraDaConta,
        agora: consumo.agora,
      });
      // `vale: true` aqui significa que o `UPDATE` e a regra do domínio
      // discordaram, e isso é defeito nosso, não recusa da pessoa. Ele vira
      // `inexistente` na trilha em vez de um sucesso que a instrução não deu.
      return veredicto.vale
        ? { consumida: false, motivo: 'inexistente' }
        : { consumida: false, motivo: veredicto.motivo };
    },

    async marcarEmailVerificado(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({
          email_verified_at: new Date(agora),
          // Verificar o e-mail prova que ele entrega. Uma devolução antiga não
          // pode continuar marcando a conta como inalcançável depois disso.
          email_deliverable: true,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },

    /**
     * Exclusão lógica e revogação das tags, numa transação só.
     *
     * O `where` da marcação exige `deleted_at is null`: é ele, e não um `if`
     * antes, que torna a operação idempotente sob concorrência. Duas chamadas
     * simultâneas leriam as duas a mesma conta ativa; só uma atualiza linha.
     *
     * A revogação das tags roda por subconsulta em `pets` do próprio dono. A
     * autorização vai na cláusula e não num `if` de papel (ADR-0021): não há
     * caminho, nem por engano de parâmetro, que revogue a tag de outra pessoa.
     */
    async registrarPedidoDeExclusao(
      userId: UserId,
      agora: Instant,
    ): Promise<ConsequenciasDaExclusao | undefined> {
      return db.transaction().execute(async (trx) => {
        const marcada = await trx
          .updateTable('users')
          .set({
            status: 'deletion_requested',
            deletion_requested_at: new Date(agora),
            deleted_at: new Date(agora),
            updated_at: new Date(agora),
          })
          .where('id', '=', userId)
          .where('deleted_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (marcada === undefined) return undefined;

        const tags = await trx
          .updateTable('pet_tags')
          .set({
            status: 'revoked',
            revoked_at: new Date(agora),
            // `owner_request` e não um motivo novo: do ponto de vista da tag,
            // foi o tutor que pediu. Um `account_deleted` aqui seria um sexto
            // valor numa lista fechada para dizer o que a trilha da conta já
            // diz, e a `revocation_reason` é lida por quem investiga a TAG.
            revocation_reason: 'owner_request',
            // ADR-0004: a revogação apaga o texto cifrado guardado para
            // reimpressão. `pet_tags_revogada_nao_guarda_o_codigo` recusa a
            // versão pela metade, então esquecer esta linha não passa.
            code_ciphertext: null,
          })
          .where('status', '=', 'active')
          .where((eb) =>
            eb(
              'pet_id',
              'in',
              eb.selectFrom('pets').select('pets.id').where('pets.owner_user_id', '=', userId),
            ),
          )
          .returning('id')
          .execute();

        return { tagsRevogadas: tags.length };
      });
    },

    async contasAExpurgar(ate: Instant, limite: number): Promise<readonly UserId[]> {
      const linhas = await db
        .selectFrom('users')
        .select('id')
        .where('deleted_at', 'is not', null)
        .where('deleted_at', '<=', new Date(ate))
        .orderBy('deleted_at', 'asc')
        .limit(limite)
        .execute();
      return linhas.map((linha) => linha.id as UserId);
    },

    async expurgarConta(userId: UserId): Promise<boolean> {
      const apagadas = await db
        .deleteFrom('users')
        .where('id', '=', userId)
        .where('deleted_at', 'is not', null)
        .executeTakeFirst();
      return (apagadas.numDeletedRows ?? 0n) > 0n;
    },

    async registrarPedidoDeTrocaDeEmail(
      userId: UserId,
      novoEmail: string,
      agora: Instant,
    ): Promise<void> {
      await db
        .updateTable('users')
        .set({ pending_email: novoEmail, updated_at: new Date(agora) })
        .where('id', '=', userId)
        .where('deleted_at', 'is', null)
        .execute();
    },

    async concluirTrocaDeEmail(
      userId: UserId,
      novoEmail: string,
      agora: Instant,
    ): Promise<Conta | undefined> {
      // `pending_email` entra no WHERE, e não só no SET. Ele é o que amarra o
      // token ao ÚLTIMO pedido: quem pediu A, pediu B em seguida e então abriu
      // o link de A não pode levar a conta para A. O token de A já teria sido
      // invalidado no pedido de B, mas depender só disso deixaria a regra numa
      // instrução distante desta, e esta é a que escreve.
      try {
        const linha = await db
          .updateTable('users')
          .set({
            email: novoEmail,
            pending_email: null,
            // Abrir o link é a prova de alcance que a verificação pede. Exigir
            // um segundo e-mail de verificação depois desta confirmação seria
            // pedir duas vezes a mesma prova, e devolveria à conta o estado de
            // e-mail não verificado que a troca existe para tirar dela.
            email_verified_at: new Date(agora),
            email_deliverable: true,
            updated_at: new Date(agora),
          })
          .where('id', '=', userId)
          .where('deleted_at', 'is', null)
          .where('pending_email', '=', novoEmail)
          .returning(COLUNAS_DA_CONTA)
          .executeTakeFirst();

        return linha === undefined ? undefined : paraConta(linha as LinhaSelecionada);
      } catch (erro) {
        // O endereço ganhou dono entre o envio do link e a abertura dele. É
        // resposta, não incidente: quem chama devolve o mesmo 410 do token
        // vencido.
        if (ehViolacaoDeUnicidade(erro)) return undefined;
        throw erro;
      }
    },

    async cancelarTrocaDeEmailPendente(userId: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('users')
        .set({ pending_email: null, updated_at: new Date(agora) })
        .where('id', '=', userId)
        .where('pending_email', 'is not', null)
        .execute();
    },
  };
}

/** Sinal interno de corrida perdida na rotação. Nunca sai deste arquivo. */
class RotacaoPerdida extends Error {
  constructor() {
    super('refresh já consumido por outro pedido');
    this.name = 'RotacaoPerdida';
  }
}
