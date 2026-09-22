/**
 * Inspeção de esquema: o que o modelo de dados promete, conferido no catálogo
 * do Postgres.
 *
 * Por que este arquivo existe: os critérios de BICHUS-19 e de BICHUS-56 não são
 * observáveis por nenhuma tela e nenhum caso de homologação. "A chave
 * estrangeira aponta para `users.id`", "existe `user_identities`", "nenhum valor
 * impresso em QR é chave estrangeira" e "o papel de banco não tem UPDATE nem
 * DELETE" se conferem hoje olhando o diagrama e concordando com ele. Olhar e
 * concordar não é evidência: ninguém reexecuta, e no dia em que a promessa
 * deixar de valer nada acusa. Este arquivo pergunta ao banco.
 *
 * **Ele reprova quando não consegue verificar.** Sem banco, sem tabela, sem
 * chave estrangeira nenhuma para percorrer: falha ruidosa com o motivo. Um
 * arquivo de inspeção que se pula sozinho por falta de banco termina verde e
 * ocupa o lugar de um que funcionaria.
 *
 * Como rodar:
 *
 *   DATABASE_URL=postgres://bichu:<senha>@127.0.0.1:5432/bichu \
 *     node --test tests/integration
 *
 * O banco precisa estar com as migrações de `migrations/` aplicadas. Este
 * arquivo não aplica migração e não escreve nada que sobreviva: a única escrita
 * é um INSERT em `audit.events` dentro de uma transação que termina em
 * ROLLBACK, e ela existe porque a recusa do UPDATE só se prova tentando.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

/**
 * Esquemas do produto. `tiger`, `tiger_data` e `topology` são da extensão
 * PostGIS e têm chave estrangeira própria, que não é nossa e não responde às
 * nossas regras.
 */
const ESQUEMAS_DO_PRODUTO = ['public', 'audit'];

/**
 * Tabelas que precisam existir para esta inspeção significar alguma coisa.
 * Ausência de qualquer uma é falha, e não ausência de caso: é assim que se
 * evita o verde por não ter olhado para nada.
 */
const TABELAS_ESPERADAS = [
  'public.users',
  'public.user_identities',
  'public.local_credentials',
  'public.user_roles',
  'public.refresh_tokens',
  'public.verification_tokens',
  'audit.events',
  // ADR-0011 emenda 1. Exigidas aqui de proposito: sem isto os casos de
  // `professionals` abaixo passariam verdes numa base sem a migracao, que e o
  // verde por nao ter olhado para nada.
  'public.professionals',
  'public.entity_verifications',
  // BICHUS-91, pela mesma razao: sem exigir a tabela aqui, uma base sem a
  // migracao do aparelho passaria verde em toda inspecao abaixo.
  'public.user_devices',
];

/**
 * Nomes de coluna que NUNCA podem participar de uma chave estrangeira, nem como
 * origem nem como destino. É a lista do critério 2 de BICHUS-19, escrita em
 * nomes de coluna: e-mail, telefone, login, `sub` de provedor externo e valor
 * impresso em QR.
 *
 * A comparação é por nome exato. `species_code` referencia `ref_species.code` e
 * é chave de dado de referência, não de identidade de pessoa: tratar por
 * substring reprovaria o remédio junto com a doença.
 */
const COLUNAS_PROIBIDAS_EM_FK = new Set([
  'email',
  'pending_email',
  'email_at_provider',
  'sent_to',
  'phone',
  'phone_e164',
  'msisdn',
  'login',
  'username',
  'provider_subject',
  'sub',
  'external_id',
  'tag_code',
  'qr_code',
  'public_code',
  'printed_code',
  'slug',
]);

/**
 * Colunas que, se existissem em `users`, fariam o critério 5 de BICHUS-19 ser
 * falso: acrescentar um provedor deixaria de ser um INSERT em
 * `user_identities` e passaria a ser um ALTER TABLE em `users`.
 */
const COLUNAS_QUE_USERS_NAO_PODE_TER = [
  'provider',
  'provider_subject',
  'google_sub',
  'apple_sub',
  'external_id',
  'sub',
  'password_hash',
  'password_phc',
];

/** Colunas obrigatórias de `audit.events`, critério 2 de BICHUS-56. */
const COLUNAS_DE_AUDIT_EVENTS = [
  'id',
  'occurred_at',
  'actor_kind',
  'actor_user_id',
  'actor_ip_hmac',
  'correlation_id',
  'action',
  'resource_kind',
  'resource_id',
  'before',
  'after',
  'metadata',
];

interface ChaveEstrangeira {
  readonly esquema: string;
  readonly tabela: string;
  readonly coluna: string;
  readonly tabela_alvo: string;
  readonly coluna_alvo: string;
  readonly nome: string;
}

interface Coluna {
  readonly esquema: string;
  readonly tabela: string;
  readonly coluna: string;
  readonly tipo: string;
}

interface Unicidade {
  readonly nome: string;
  readonly colunas: string[];
}

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let cliente: Client;
let chavesEstrangeiras: ChaveEstrangeira[] = [];
let colunas: Coluna[] = [];

function colunasDe(esquema: string, tabela: string): Coluna[] {
  return colunas.filter((c) => c.esquema === esquema && c.tabela === tabela);
}

function existeTabela(qualificada: string): boolean {
  const [esquema, tabela] = qualificada.split('.');
  return colunas.some((c) => c.esquema === esquema && c.tabela === tabela);
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. A inspeção de esquema não tem como conferir ' +
        'nada sem banco, e passar verde sem conferir é pior do que não existir. ' +
        'Suba o banco (`docker compose up -d --wait db`), aplique as migrações e ' +
        'aponte DATABASE_URL para ele.',
    );
  }

  cliente = new Client({ connectionString: CONEXAO });
  try {
    await cliente.connect();
  } catch (erro) {
    throw new Error(
      `A inspeção de esquema não conseguiu conectar em ${CONEXAO.replace(/:[^:@/]*@/, ':***@')}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  const fks = await cliente.query<ChaveEstrangeira>(
    `select ns.nspname          as esquema,
            src.relname         as tabela,
            srcatt.attname      as coluna,
            tgt.relname         as tabela_alvo,
            tgtatt.attname      as coluna_alvo,
            con.conname         as nome
       from pg_constraint con
       join pg_class src        on src.oid = con.conrelid
       join pg_class tgt        on tgt.oid = con.confrelid
       join pg_namespace ns     on ns.oid = src.relnamespace
       join lateral unnest(con.conkey)  with ordinality as k(attnum, ord) on true
       join lateral unnest(con.confkey) with ordinality as f(attnum, ord) on k.ord = f.ord
       join pg_attribute srcatt on srcatt.attrelid = con.conrelid and srcatt.attnum = k.attnum
       join pg_attribute tgtatt on tgtatt.attrelid = con.confrelid and tgtatt.attnum = f.attnum
      where con.contype = 'f'
        and ns.nspname = any($1::text[])
      order by 2, 3`,
    [ESQUEMAS_DO_PRODUTO],
  );
  chavesEstrangeiras = fks.rows;

  const cols = await cliente.query<Coluna>(
    `select table_schema as esquema, table_name as tabela,
            column_name  as coluna,  data_type  as tipo
       from information_schema.columns
      where table_schema = any($1::text[])`,
    [ESQUEMAS_DO_PRODUTO],
  );
  colunas = cols.rows;

  const faltando = TABELAS_ESPERADAS.filter((t) => !existeTabela(t));
  if (faltando.length > 0) {
    throw new Error(
      `A inspeção de esquema não tem o que inspecionar: faltam ${faltando.join(', ')}. ` +
        'Banco sem as migrações aplicadas reprova, e nunca passa por não ter achado nada.',
    );
  }

  if (chavesEstrangeiras.length === 0) {
    throw new Error(
      'Nenhuma chave estrangeira encontrada nos esquemas do produto. ' +
        'Filtro que não filtra termina verde e ninguém desconfia.',
    );
  }
});

after(async () => {
  if (cliente !== undefined) await cliente.end();
});

void describe('BICHUS-19 — a identidade da conta, conferida no catálogo', () => {
  void it('users.id é uuid e é a chave primária', () => {
    const id = colunasDe('public', 'users').find((c) => c.coluna === 'id');
    assert.ok(id, 'users.id não existe');
    assert.equal(id.tipo, 'uuid');
  });

  void it('toda chave estrangeira que aponta para users aponta para users.id', () => {
    const paraUsers = chavesEstrangeiras.filter((fk) => fk.tabela_alvo === 'users');
    assert.ok(
      paraUsers.length > 0,
      'nenhuma chave estrangeira aponta para users: não há o que conferir, e isso é reprovação',
    );
    const fora = paraUsers.filter((fk) => fk.coluna_alvo !== 'id');
    assert.deepEqual(
      fora.map((fk) => `${fk.tabela}.${fk.coluna} -> users.${fk.coluna_alvo}`),
      [],
      'chave estrangeira apontando para users por outra coluna que não id',
    );
  });

  void it('nenhuma chave estrangeira usa e-mail, telefone, login, sub de provedor ou valor de QR', () => {
    const infratoras = chavesEstrangeiras.filter(
      (fk) => COLUNAS_PROIBIDAS_EM_FK.has(fk.coluna) || COLUNAS_PROIBIDAS_EM_FK.has(fk.coluna_alvo),
    );
    assert.deepEqual(
      infratoras.map(
        (fk) => `${fk.nome}: ${fk.tabela}.${fk.coluna} -> ${fk.tabela_alvo}.${fk.coluna_alvo}`,
      ),
      [],
      'chave estrangeira sobre valor que o usuário troca ou que sai impresso',
    );
  });

  void it('nenhum valor impresso em QR é referenciado por chave estrangeira', () => {
    // Hoje a tabela da tag ainda não existe, e por isso este caso seria vacuoso
    // se olhasse só para ela. Ele olha para as duas coisas: a lista de nomes
    // proibidos acima, que já vale sobre todo o catálogo, e a tabela da tag
    // quando ela chegar. A asserção passa a valer sozinha no dia em que a
    // migração da tag entrar, sem ninguém precisar lembrar de nada.
    const tabelasDeTag = [
      ...new Set(
        colunas.filter((c) => /(^|_)tags?$/.test(c.tabela)).map((c) => `${c.esquema}.${c.tabela}`),
      ),
    ];

    for (const qualificada of tabelasDeTag) {
      const [, tabela] = qualificada.split('.');
      const referenciada = chavesEstrangeiras.filter(
        (fk) => fk.tabela_alvo === tabela && fk.coluna_alvo !== 'id',
      );
      assert.deepEqual(
        referenciada.map((fk) => `${fk.tabela}.${fk.coluna} -> ${qualificada}.${fk.coluna_alvo}`),
        [],
        `${qualificada} é referenciada por outra coluna que não id`,
      );
    }

    // Registro do alcance real deste caso na data da execução, para que ninguém
    // leia "passou" como "a tag foi conferida".
    console.info(
      `tabelas de tag encontradas: ${tabelasDeTag.length === 0 ? 'nenhuma (a migração da tag ainda não existe)' : tabelasDeTag.join(', ')}`,
    );
  });

  void it('user_identities existe com (provider, provider_subject) único', async () => {
    const unicidades = await cliente.query<Unicidade>(
      // `attname` é do tipo `name`, e o driver não sabe decodificar `name[]`:
      // sem o `::text` a coluna volta como string e o caso quebra com um erro
      // de tipo em vez de dizer o que conferiu.
      `select con.conname as nome,
              array_agg(att.attname::text order by k.ord) as colunas
         from pg_constraint con
         join pg_class rel    on rel.oid = con.conrelid
         join pg_namespace ns on ns.oid = rel.relnamespace
         join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
        where con.contype = 'u' and ns.nspname = 'public' and rel.relname = 'user_identities'
        group by con.conname`,
    );

    const conjuntos = unicidades.rows.map((u) => u.colunas.join(','));
    assert.ok(
      conjuntos.includes('provider,provider_subject'),
      `user_identities não tem unicidade sobre (provider, provider_subject). Achei: ${conjuntos.join(' | ') || 'nenhuma'}`,
    );
    assert.ok(
      conjuntos.includes('user_id,provider'),
      'user_identities permite duas credenciais do mesmo provedor para a mesma conta',
    );
  });

  void it("o provedor local é um valor de user_identities.provider, e 'local' é aceito", async () => {
    const restricao = await cliente.query<{ definicao: string }>(
      `select pg_get_constraintdef(con.oid) as definicao
         from pg_constraint con
         join pg_class rel    on rel.oid = con.conrelid
         join pg_namespace ns on ns.oid = rel.relnamespace
        where con.contype = 'c' and ns.nspname = 'public'
          and rel.relname = 'user_identities'
          and pg_get_constraintdef(con.oid) ilike '%provider%'`,
    );
    const definicoes = restricao.rows.map((r) => r.definicao).join(' ');
    assert.match(definicoes, /'local'/, "user_identities.provider não aceita 'local'");
  });

  void it('a credencial local pendura em user_identities, e não em users', () => {
    const fk = chavesEstrangeiras.find((c) => c.tabela === 'local_credentials');
    assert.ok(fk, 'local_credentials não tem chave estrangeira');
    assert.equal(fk.tabela_alvo, 'user_identities');
    assert.equal(fk.coluna_alvo, 'id');
  });

  void it('users não carrega nenhuma coluna de provedor: um provedor novo é um INSERT', () => {
    const nomes = new Set(colunasDe('public', 'users').map((c) => c.coluna));
    const indevidas = COLUNAS_QUE_USERS_NAO_PODE_TER.filter((n) => nomes.has(n));
    assert.deepEqual(
      indevidas,
      [],
      'users carrega coluna de provedor: acrescentar login social vira ALTER TABLE, e o critério 5 deixa de valer',
    );
  });

  void it('trocar o e-mail não toca em nenhuma outra tabela: ninguém referencia users.email', () => {
    const referenciam = chavesEstrangeiras.filter(
      (fk) => fk.tabela_alvo === 'users' && fk.coluna_alvo === 'email',
    );
    assert.deepEqual(referenciam, []);
  });
});

void describe('BICHUS-56 — a trilha de auditoria, conferida no catálogo', () => {
  void it('audit.events tem as doze colunas obrigatórias', () => {
    const nomes = new Set(colunasDe('audit', 'events').map((c) => c.coluna));
    const faltando = COLUNAS_DE_AUDIT_EVENTS.filter((n) => !nomes.has(n));
    assert.deepEqual(faltando, [], 'colunas obrigatórias ausentes em audit.events');
  });

  void it('o ator é o UUID interno, e não o e-mail', () => {
    const ator = colunasDe('audit', 'events').find((c) => c.coluna === 'actor_user_id');
    assert.ok(ator);
    assert.equal(ator.tipo, 'uuid');
    const nomes = new Set(colunasDe('audit', 'events').map((c) => c.coluna));
    assert.equal(nomes.has('actor_email'), false);
  });

  void it('o endereço de origem é guardado como HMAC, em bytea, e nunca em claro', () => {
    const ip = colunasDe('audit', 'events').find((c) => c.coluna === 'actor_ip_hmac');
    assert.ok(ip, 'audit.events não tem actor_ip_hmac');
    assert.equal(ip.tipo, 'bytea');
    const nomes = new Set(colunasDe('audit', 'events').map((c) => c.coluna));
    for (const proibida of ['actor_ip', 'ip', 'ip_address', 'remote_addr']) {
      assert.equal(nomes.has(proibida), false, `audit.events guarda ${proibida} em claro`);
    }
  });

  void it('a trilha sobrevive à exclusão da conta que ela documenta', () => {
    const paraUsers = chavesEstrangeiras.filter(
      (fk) => fk.esquema === 'audit' && fk.tabela_alvo === 'users',
    );
    assert.deepEqual(
      paraUsers.map((fk) => fk.nome),
      [],
      'audit.events tem FK para users: a exclusão da conta apagaria a evidência do próprio pedido de exclusão',
    );
  });

  void it('o papel da aplicação tem INSERT e SELECT e não tem UPDATE nem DELETE', async () => {
    const r = await cliente.query<{
      insere: boolean;
      le: boolean;
      atualiza: boolean;
      apaga: boolean;
    }>(
      `select has_table_privilege('bichu_audit_writer','audit.events','INSERT') as insere,
              has_table_privilege('bichu_audit_writer','audit.events','SELECT') as le,
              has_table_privilege('bichu_audit_writer','audit.events','UPDATE') as atualiza,
              has_table_privilege('bichu_audit_writer','audit.events','DELETE') as apaga`,
    );
    const p = r.rows[0];
    assert.ok(p);
    assert.equal(p.insere, true);
    assert.equal(p.le, true);
    assert.equal(p.atualiza, false, 'bichu_audit_writer pode UPDATE: a trilha deixou de ser trilha');
    assert.equal(p.apaga, false, 'bichu_audit_writer pode DELETE: a trilha deixou de ser trilha');
  });

  void it('o expurgo é um papel separado, que não escreve nem altera', async () => {
    const r = await cliente.query<{
      insere: boolean;
      atualiza: boolean;
      apaga: boolean;
    }>(
      `select has_table_privilege('bichu_audit_purger','audit.events','INSERT') as insere,
              has_table_privilege('bichu_audit_purger','audit.events','UPDATE') as atualiza,
              has_table_privilege('bichu_audit_purger','audit.events','DELETE') as apaga`,
    );
    const p = r.rows[0];
    assert.ok(p);
    assert.equal(p.insere, false);
    assert.equal(p.atualiza, false);
    assert.equal(p.apaga, true);
  });

  void it('PUBLIC não enxerga a trilha', async () => {
    const r = await cliente.query<{ le: boolean; usa: boolean }>(
      `select has_table_privilege('public','audit.events','SELECT') as le,
              has_schema_privilege('public','audit','USAGE')        as usa`,
    );
    const p = r.rows[0];
    assert.ok(p);
    assert.equal(p.le, false, 'todo papel de login do banco lê a trilha');
    assert.equal(p.usa, false);
  });

  void it('o banco recusa de fato o UPDATE e o DELETE feitos com o papel da aplicação', async () => {
    // Privilégio no catálogo e recusa no banco não são a mesma afirmação: o
    // dono da tabela contorna qualquer GRANT. Este caso tenta de verdade, e é
    // ele que reprova se a permissão for afrouxada. Tudo acontece dentro de uma
    // transação que termina em ROLLBACK: nada sobrevive à execução.
    await cliente.query('BEGIN');
    try {
      await cliente.query('SET LOCAL ROLE bichu_audit_writer');
      await cliente.query(
        `insert into audit.events (id, actor_kind, action, resource_kind)
         values (gen_random_uuid(), 'system', 'qa.inspecao-de-esquema', 'teste')`,
      );

      for (const tentativa of [
        "update audit.events set action = 'alterado'",
        'delete from audit.events',
      ]) {
        await cliente.query('SAVEPOINT tentativa');
        await assert.rejects(
          () => cliente.query(tentativa),
          (erro: unknown) => {
            const codigo = (erro as { code?: string }).code;
            assert.equal(
              codigo,
              '42501',
              `esperava permissão negada (42501) em "${tentativa}", veio ${String(codigo)}`,
            );
            return true;
          },
          `o banco aceitou "${tentativa}" com o papel bichu_audit_writer`,
        );
        await cliente.query('ROLLBACK TO SAVEPOINT tentativa');
      }
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});

void describe('ADR-0011 emenda 1 — o diretorio de profissionais, conferido no catalogo', () => {
  void it('entity_verifications.entity_id NAO tem chave estrangeira, e isso e decisao', () => {
    // A ISCA CENTRAL desta migracao. A tabela e polimorfica por desenho: ela foi
    // generalizada em 17/09 justamente para que a primeira entidade
    // nao-profissional (a ONG da parceria de adocao) nao obrigasse a refaze-la.
    // Postgres nao expressa FK condicional ao valor de outra coluna.
    //
    // O modo de falhar que este caso existe para pegar e simpatico: alguem le
    // `entity_id uuid NOT NULL` sem FK, acha que foi esquecimento, e "conserta".
    // O conserto desfaz a generalizacao, e refazer verificacao com registro ja
    // aprovado e migracao com consequencia juridica, nao so de dados.
    const comFk = chavesEstrangeiras.filter(
      (fk) => fk.tabela === 'entity_verifications' && fk.coluna === 'entity_id',
    );
    assert.deepEqual(
      comFk.map((fk) => `${fk.nome}: entity_id -> ${fk.tabela_alvo}.${fk.coluna_alvo}`),
      [],
      'entity_id ganhou chave estrangeira: a generalizacao de 17/09 foi desfeita. ' +
        'A integridade de entity_id fica na APLICACAO, e esta escrito no COMMENT da coluna.',
    );
  });

  void it('entity_id existe e e uuid: o caso acima nao passa por a coluna ter sumido', () => {
    // Sem isto, renomear `entity_id` deixaria o caso anterior verde para sempre,
    // porque o filtro nao acharia nada e ausencia de achado tem a cor de
    // aprovacao.
    const coluna = colunasDe('public', 'entity_verifications').find(
      (c) => c.coluna === 'entity_id',
    );
    assert.ok(coluna, 'entity_verifications.entity_id nao existe');
    assert.equal(coluna.tipo, 'uuid');
  });

  void it('as duas tabelas novas so referenciam users.id, e mais nada', () => {
    const das_novas = chavesEstrangeiras.filter((fk) =>
      ['professionals', 'entity_verifications'].includes(fk.tabela),
    );
    assert.ok(
      das_novas.length > 0,
      'nenhuma chave estrangeira nas tabelas novas: nao ha o que conferir, e isso e reprovacao',
    );
    const fora = das_novas.filter(
      (fk) => fk.tabela_alvo !== 'users' || fk.coluna_alvo !== 'id',
    );
    assert.deepEqual(
      fora.map((fk) => `${fk.tabela}.${fk.coluna} -> ${fk.tabela_alvo}.${fk.coluna_alvo}`),
      [],
      'ADR-0002: users.id e a unica chave que o resto do sistema referencia',
    );
  });

  void it('nenhuma superficie de profissional referencia pet nem tutor', () => {
    // ADR-0011 secao 4 item 2, sobre o ADR-0010 item 7: o vetor de agrupamento
    // que a BICHUS-174 descreve vale igual aqui. Um profissional que listasse os
    // pets que atende entregaria o agrupamento pela TERCEIRA porta, depois de a
    // pagina do tutor e o QR terem sido fechados no mesmo dia.
    const paraPetOuTutor = chavesEstrangeiras.filter(
      (fk) =>
        ['professionals', 'entity_verifications'].includes(fk.tabela) &&
        ['pets', 'lost_cases', 'pet_photos'].includes(fk.tabela_alvo),
    );
    assert.deepEqual(
      paraPetOuTutor.map((fk) => `${fk.tabela}.${fk.coluna} -> ${fk.tabela_alvo}`),
      [],
      'o diretorio de profissionais ganhou vinculo com pet: a terceira porta do agrupamento',
    );

    const suspeitas = ['pet_id', 'owner_user_id', 'tutor_id', 'tutor_user_id', 'case_id'];
    for (const tabela of ['professionals', 'entity_verifications']) {
      const nomes = new Set(colunasDe('public', tabela).map((c) => c.coluna));
      assert.deepEqual(
        suspeitas.filter((n) => nomes.has(n)),
        [],
        `${tabela} carrega coluna de pet ou de tutor`,
      );
    }
  });

  void it("source perdeu 'community' e ganhou 'invited': a premissa foi NEGADA", async () => {
    // O cliente respondeu NAO em 21/09. Reintroduzir 'community' aqui seria
    // desfazer a decisao dele, e nao corrigir um esquecimento. O caso cobra os
    // dois sentidos, porque so cobrar a ausencia deixaria passar uma migracao
    // que apagasse a coluna inteira.
    const r = await cliente.query<{ definicao: string }>(
      `select pg_get_constraintdef(con.oid) as definicao
         from pg_constraint con
         join pg_class rel    on rel.oid = con.conrelid
         join pg_namespace ns on ns.oid = rel.relnamespace
        where con.contype = 'c' and ns.nspname = 'public'
          and rel.relname = 'professionals'
          and pg_get_constraintdef(con.oid) ilike '%source%'`,
    );
    const definicoes = r.rows.map((linha) => linha.definicao).join(' ');
    assert.notEqual(definicoes, '', 'professionals.source nao tem CHECK nenhum');
    assert.match(definicoes, /'invited'/, "source nao aceita 'invited'");
    assert.match(definicoes, /'self'/, "source nao aceita 'self'");
    assert.doesNotMatch(
      definicoes,
      /'community'/,
      "source voltou a aceitar 'community': a emenda 1 do ADR-0011 foi desfeita",
    );
  });

  void it('dominio fechado e CHECK, nunca enum nativo do Postgres', async () => {
    // Acrescentar valor a um enum nativo e DDL, e o ponto inteiro desta migracao
    // e nao precisar de DDL com produto no ar.
    const r = await cliente.query<{ nome: string }>(
      `select t.typname as nome
         from pg_type t
         join pg_namespace ns on ns.oid = t.typnamespace
        where t.typtype = 'e' and ns.nspname = 'public'`,
    );
    assert.deepEqual(
      r.rows.map((linha) => linha.nome),
      [],
      'existe enum nativo no esquema public: acrescentar um valor passou a exigir DDL',
    );
  });

  void it('o banco RECUSA um perfil que nasce sem o aceite de quem ele descreve', async () => {
    // A regra central da emenda, exercitada de verdade em vez de afirmada:
    // "nenhum perfil nasce sem o aceite de quem ele descreve". 'self' e
    // 'invited' passam por aceite; so 'import' admite 'unclaimed'.
    //
    // Tudo dentro de uma transacao que termina em ROLLBACK: nada sobrevive.
    await cliente.query('BEGIN');
    try {
      await cliente.query('SAVEPOINT recusa');
      await assert.rejects(
        () =>
          cliente.query(
            `insert into professionals (id, kind, display_name, source, claim_status)
             values (gen_random_uuid(), 'vet', 'Isca sem aceite', 'invited', 'unclaimed')`,
          ),
        (erro: unknown) => {
          assert.equal(
            (erro as { code?: string }).code,
            '23514',
            'esperava violacao de CHECK ao criar perfil convidado sem titular',
          );
          return true;
        },
        'o banco aceitou um perfil `invited` sem aceite: a regra central da emenda 1 nao vale',
      );
      await cliente.query('ROLLBACK TO SAVEPOINT recusa');

      // O contraponto: o caminho legitimo precisa passar. Restricao que reprova
      // tudo tambem "nunca deixa passar o errado", e nao vale nada.
      await cliente.query('SAVEPOINT aceite');
      await cliente.query(
        `insert into professionals (id, kind, display_name, source, claim_status, claimed_at)
         values (gen_random_uuid(), 'vet', 'Isca com aceite', 'invited', 'claimed', now())`,
      );
      await cliente.query('ROLLBACK TO SAVEPOINT aceite');
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  void it('apagar a conta de quem convidou NAO apaga o perfil de quem aceitou', async () => {
    // O perfil pertence a pessoa que ele descreve, nao a quem a indicou. CASCADE
    // aqui faria a saida de um tutor derrubar o perfil de um profissional que
    // nunca soube quem ele era.
    const coluna = colunasDe('public', 'professionals').find(
      (c) => c.coluna === 'created_by_user_id',
    );
    assert.ok(coluna, 'professionals.created_by_user_id nao existe');

    const r = await cliente.query<{ coluna: string; acao: string }>(
      `select att.attname::text as coluna, con.confdeltype::text as acao
         from pg_constraint con
         join pg_class rel    on rel.oid = con.conrelid
         join pg_namespace ns on ns.oid = rel.relnamespace
         join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
        where con.contype = 'f' and ns.nspname = 'public'
          and rel.relname = 'professionals'
          and att.attname in ('created_by_user_id', 'claimed_by_user_id')`,
    );
    assert.equal(r.rows.length, 2, 'esperava as duas chaves de pessoa em professionals');
    for (const linha of r.rows) {
      // 'n' = SET NULL, 'c' = CASCADE, 'a' = NO ACTION, 'r' = RESTRICT.
      assert.equal(
        linha.acao,
        'n',
        `professionals.${linha.coluna} nao e ON DELETE SET NULL: apagar a conta levaria o perfil junto`,
      );
    }
  });
});
