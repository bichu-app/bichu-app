/**
 * A persistência do perfil de outra pessoa. **Toda autorização está na cláusula
 * `WHERE`** (ADR-0021), e não numa camada acima.
 *
 * ## Os construtores são exportados, e é de propósito
 *
 * Cada consulta tem um `construtorDe...` que devolve a consulta **compilada**. A
 * suíte unitária não tem banco: ela compila com o `DummyDriver` e **lê o SQL**,
 * que é o único jeito de provar que o predicado está no `WHERE` em vez de num
 * `if` que alguém esquece num caminho novo. É a forma que
 * `autorizacao-na-clausula-where.test.ts` (conexões) e
 * `bloqueio-e-ocultacao-na-clausula-where.test.ts` (segurança) já usam nesta
 * casa, e é o que a isca de SQL desta fatia mede.
 *
 * ## Este módulo não tem tabela própria, e isso está declarado
 *
 * `people` é uma **leitura** que junta `handles`, `users`, `pets`,
 * `user_connections` e `user_showcase_images`, e não escreve em nenhuma. É o
 * mesmo arranjo de `moderation`, que também não tem tabela e lê a visão
 * `fila_de_moderacao` — e a razão é a mesma: dentro de qualquer um dos módulos
 * donos dessas tabelas, os outros teriam de importar `domain/` alheio, que é
 * exatamente o que a fronteira existe para impedir. A declaração está em
 * `src/architecture.rules.mjs`, ao lado do nome do módulo.
 *
 * ## O que NÃO é selecionado, e a ausência é a defesa
 *
 * - **nenhuma coluna de pet além da contagem.** `pets.name`, `pets.slug`,
 *   `pets.species_code` e as fotos do animal não aparecem em `SELECT` nenhum
 *   deste arquivo, e é isso que o item 7 do ADR-0010 cobra. A emenda 2 abriu a
 *   contagem;
 * - **nenhuma coluna de endereço.** `users` tem localização de referência, e
 *   nada dela é lido aqui: o cliente não mencionou cidade nem bairro em 19/10;
 * - **nenhum `catalog_images.id`.** Identidade interna não sai (ADR-0024); o que
 *   sai são as chaves das derivadas;
 * - **`users.id` sai, e não atravessa a borda.** Ele é o que o caso de uso usa
 *   para perguntar a conexão ao módulo vizinho; a borda projeta apelido e
 *   `public_ref`;
 * - **nenhuma data de verificação.** O selo de validado sai como **booleano
 *   derivado no `SELECT`** (emenda do ADR-0010 de 21/10/2026);
 *   `email_verified_at` e `phone_verified_at` ficam dentro da expressão e nunca
 *   na lista de seleção, porque a data de confirmação não é assunto de
 *   terceiro.
 */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import {
  comoObjectKey,
  type PropositoDaImagem,
} from '../../../media/ports/imagem-de-catalogo.js';
import type {
  FotoDoPerfilDeOutraPessoa,
  PerfilDePessoaRepository,
  PessoaVisivel,
} from '../../ports/perfil-de-pessoa-repository.js';

/**
 * O propósito da esteira da vitrine.
 *
 * Escrito aqui e **tipado** por `PropositoDaImagem`, da porta de `media`: a
 * constante de `showcase/adapters/persistence` tem o mesmo valor e não pode ser
 * importada — adapter de outro módulo é o que a fronteira proíbe. O tipo é o que
 * impede as duas de divergirem em silêncio: um valor que saia da lista fechada
 * de propósitos não compila.
 */
const PROPOSITO_DA_VITRINE: PropositoDaImagem = 'user_showcase';

/** Só foto `ready` sai para terceiro. Ver o comentário do construtor. */
const FOTO_PRONTA = 'ready' as const;

interface LinhaDoPerfil {
  readonly user_id: string;
  readonly handle: string;
  readonly public_ref: string;
  readonly display_name: string | null;
  readonly pets_count: string | number;
  /** O selo de validado. Ver o comentário do `SELECT` no construtor. */
  readonly canal_verificado: boolean;
}

interface LinhaDaFotoDoPerfil {
  readonly grade_key: string;
  readonly aberta_key: string;
  readonly alt_text: string | null;
}

/**
 * **A pessoa de um apelido, se ela existe para quem olha.** Seis predicados na
 * mesma consulta, e nenhum deles é dispensável:
 *
 * 1. `h.handle = apelido` — o endereço, que é o que a borda recebeu. `citext`
 *    no banco, então `@Maria` e `@maria` são a mesma chave sem a aplicação
 *    normalizar nada;
 * 2. `h.kind = 'pessoa'` — **apelido de PET e apelido RESERVADO respondem o
 *    mesmo 404 de inexistente.** O espaço de nomes é compartilhado
 *    (`20261018000021`), e sem este predicado `/people/bidu` devolveria o
 *    perfil de quem quer que estivesse em `handles.user_id` — ou, pior, viraria
 *    um oráculo de "este apelido existe e é de um pet";
 * 3. `conta_habilitada(u.id)` — a decisão do cliente de 17/10: conta
 *    desabilitada *"não é mais encontrada em nenhuma página ou
 *    funcionalidade"*;
 * 4. `conta_habilitada(quemOlha)` — **o outro lado também**, como em toda
 *    leitura de conexão desta casa: quem desabilitou a própria conta não lê
 *    perfil de ninguém;
 * 5. `NOT bloqueio_entre(u.id, quemOlha)` — **simétrico**, e é a função SQL da
 *    fatia E que decide. Se qualquer um dos dois bloqueou o outro, a pessoa não
 *    existe para quem olha. Simétrico e não direcional pela mesma razão escrita
 *    em `connections/ports/leitor-de-bloqueio.ts`: fazer o efeito depender da
 *    direção deixaria o bloqueado alcançar o bloqueador;
 * 6. `NOT perfil_ocultado_para_quem_denunciou(u.public_ref, quemOlha)` — a
 *    **ocultação imediata** da fatia E: quem denunciou este perfil não volta a
 *    vê-lo, e é isso que faz a denúncia valer sem prazo prometido. A promessa
 *    que a tela já faz hoje é literal — *"Você não vai mais ver este
 *    conteúdo"*.
 *
 * Os seis devolvem `undefined`, e **a fusão é a regra** (ADR-0021): um valor por
 * motivo viraria um código por motivo, e a diferença entre eles é a informação
 * que o desenho não dá. Também não há `LIMIT` condicional nem ramo alternativo —
 * nada neste arquivo faz o tempo de resposta depender de qual dos seis barrou.
 *
 * **A contagem de pets é subconsulta correlacionada e não `LEFT JOIN` com
 * `GROUP BY`**, e a diferença é de vazamento e não de desempenho: com junção, as
 * colunas de `pets` entram no escopo do `SELECT` e a próxima pessoa que mexer
 * aqui tem `p.name` a um caractere de distância. Com a subconsulta, só o número
 * existe. Ela usa `pets_do_tutor`, o índice parcial
 * `(owner_user_id) WHERE deleted_at IS NULL`, que já existe desde a
 * `20260917000006` — **nenhuma migração de índice foi necessária nesta fatia**.
 */
export function construtorDoPerfilPorApelido(
  db: Kysely<Database>,
  apelido: string,
  quemOlha: UserId,
): CompiledQuery<LinhaDoPerfil> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
    .select([
      'u.id as user_id',
      'h.handle as handle',
      'u.public_ref as public_ref',
      'u.display_name as display_name',
    ])
    .select(
      sql<number>`(SELECT count(*) FROM pets p
         WHERE p.owner_user_id = u.id AND p.deleted_at IS NULL)`.as('pets_count'),
    )
    // ------------------------------------------------------------------
    // O SELO DE VALIDADO (emenda do ADR-0010, 21/10/2026)
    // ------------------------------------------------------------------
    // `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`, e a
    // condição é **cópia literal** da de `kysely-canal-verificado-do-chamador.ts`
    // e da de `estadoParaCriarEncontro`. A cópia é deliberada: duas definições
    // de "validado" são duas réguas, e a mesma conta sairia validada numa tela e
    // não na outra. Na prática isso é e-mail — nada em `src/` grava
    // `phone_verified_at`, a coluna existe e só é zerada.
    //
    // **As DUAS colunas de data ficam dentro da expressão e nunca no `SELECT`**:
    // o que sai é o booleano, e "o e-mail dela foi confirmado em março" não é
    // assunto de terceiro. É a mesma redução que a subconsulta de `pets_count`
    // faz com as colunas de `pets`.
    //
    // **Sem `conta_habilitada` aqui**: os seis predicados do `WHERE` já
    // admitiram esta linha, e uma segunda cópia seria o lugar onde uma correção
    // pode faltar — a mesma razão escrita no `JOIN` da foto do autor do Mural.
    .select(
      sql<boolean>`(u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL)`.as(
        'canal_verificado',
      ),
    )
    .where('h.handle', '=', apelido)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemOlha}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemOlha}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemOlha}::uuid)`,
    )
    .compile();
}

/**
 * **A vitrine de `dono`, e a conexão aceita está no `WHERE`.**
 *
 * Esta é a consulta que a emenda 2 do ADR-0010 autoriza, e ela é o único caminho
 * pelo qual uma foto de vitrine alcança alguém que não é o dono. O que a mantém
 * honesta é onde o predicado mora:
 *
 * - **`EXISTS` sobre `user_connections` com `state = 'accepted'`**, nos dois
 *   sentidos do par e com `conta_habilitada` nas duas pontas. Não é um `if` na
 *   camada de cima: chamar esta consulta por engano, de um caminho novo ou de um
 *   refator, devolve **lista vazia** em vez de foto. É esta metade que sobrevive
 *   a alguém mexer no caso de uso, e é ela que a isca mede;
 * - **`NOT bloqueio_entre`**, de novo: bloquear desfaz a conexão na mesma
 *   transação (`ConexaoSobBloqueio`), e este predicado cobre a corrida entre as
 *   duas escritas — o `EXISTS` sozinho deixaria passar uma aresta que ainda não
 *   foi desfeita;
 * - **`NOT foto_ocultada_para_quem_denunciou`**, por FOTO: quem denunciou uma
 *   imagem não volta a vê-la, mesmo continuando conexão de quem a publicou. A
 *   ocultação é por artefato e não por pessoa, porque é assim que a fatia E a
 *   desenhou.
 *
 * **Só `ready`, e as duas chaves `NOT NULL`.** Foto em `processing` carrega o
 * EXIF do celular até o trabalhador reescrever a derivada, e servi-la a um
 * terceiro entregaria a coordenada de onde ela foi tirada (ADR-0010 item 4).
 * Foto `rejected` não sai por outra razão: `rejection_reason` é assunto entre o
 * dono e quem modera. As duas ficam **fora da lista** em vez de sair com estado
 * — é por isso que `PersonShowcasePhoto` não tem `status`.
 *
 * `position` entra no `ORDER BY` e **não** no `SELECT`: a ordem é a da resposta,
 * e um número de posição na saída convidaria a tela de terceiro a reordenar
 * algo que não é dela.
 */
export function construtorDaVitrineDeConexao(
  db: Kysely<Database>,
  dono: UserId,
  quemOlha: UserId,
): CompiledQuery<LinhaDaFotoDoPerfil> {
  return db
    .selectFrom('user_showcase_images as v')
    .innerJoin('catalog_images as c', 'c.id', 'v.image_id')
    .select(['c.thumb_key as grade_key', 'c.public_key as aberta_key', 'v.alt_text as alt_text'])
    .where('v.user_id', '=', dono)
    .where('c.purpose', '=', PROPOSITO_DA_VITRINE)
    .where('c.status', '=', FOTO_PRONTA)
    .where(sql<boolean>`c.thumb_key IS NOT NULL`)
    .where(sql<boolean>`c.public_key IS NOT NULL`)
    .where(
      sql<boolean>`EXISTS (
        SELECT 1 FROM user_connections uc
         WHERE uc.state = 'accepted'
           AND ((uc.requester_user_id = ${dono}::uuid AND uc.addressee_user_id = ${quemOlha}::uuid)
             OR (uc.requester_user_id = ${quemOlha}::uuid AND uc.addressee_user_id = ${dono}::uuid))
           AND conta_habilitada(uc.requester_user_id)
           AND conta_habilitada(uc.addressee_user_id))`,
    )
    .where(sql<boolean>`NOT bloqueio_entre(${dono}::uuid, ${quemOlha}::uuid)`)
    .where(
      sql<boolean>`NOT foto_ocultada_para_quem_denunciou(c.public_key, ${quemOlha}::uuid)`,
    )
    .orderBy('v.position', 'asc')
    .compile();
}

function comoPessoa(linha: LinhaDoPerfil): PessoaVisivel {
  return {
    userId: linha.user_id as UserId,
    handle: linha.handle,
    publicRef: linha.public_ref,
    displayName: linha.display_name,
    // `count(*)` do Postgres é `bigint`, e o driver o entrega como **cadeia**.
    // `Number` aqui e não no caso de uso: a conversão é da borda do banco, e
    // deixá-la subir faria `pets_count` sair como `"3"` no JSON — que o
    // contrato declara `integer` e que nenhum portão deste repositório pega,
    // porque nenhum confere o CORPO da resposta.
    petsCount: Number(linha.pets_count),
    canalVerificado: linha.canal_verificado,
  };
}

function comoFoto(linha: LinhaDaFotoDoPerfil): FotoDoPerfilDeOutraPessoa {
  return {
    // `comoObjectKey` vem da PORTA de `media`, e não de `media/domain`: a
    // conferência da forma da chave tem uma definição só, e copiá-la aqui seria
    // a segunda. **Sem `as ObjectKey` depois dela**: a porta já devolve a marca,
    // e o `as` seria a documentação falsa que a regra `marca-so-pela-porta`
    // recusa — ela promete ao compilador que alguém validou.
    gradeKey: comoObjectKey(linha.grade_key),
    abertaKey: comoObjectKey(linha.aberta_key),
    altText: linha.alt_text,
  };
}

export function criarPerfilDePessoaRepository(db: Kysely<Database>): PerfilDePessoaRepository {
  return {
    async perfilPorApelido(apelido: string, quemOlha: UserId) {
      const { rows } = await db.executeQuery(
        construtorDoPerfilPorApelido(db, apelido, quemOlha),
      );
      const linha = rows[0];
      return linha === undefined ? undefined : comoPessoa(linha);
    },

    async vitrineDeConexao(dono: UserId, quemOlha: UserId) {
      const { rows } = await db.executeQuery(
        construtorDaVitrineDeConexao(db, dono, quemOlha),
      );
      return rows.map(comoFoto);
    },
  };
}
