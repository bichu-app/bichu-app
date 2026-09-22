/**
 * A ação de deleção de cada chave estrangeira, cruzada com o que as restrições
 * da mesma tabela permitem.
 *
 * ===========================================================================
 * A CLASSE DE DEFEITO QUE ESTE ARQUIVO VIGIA
 * ===========================================================================
 * Uma chave estrangeira `ON DELETE SET NULL` sobre uma coluna que um `CHECK`
 * torna obrigatória é uma contradição entre duas declarações do mesmo banco.
 * Ela não aparece em teste unitário (dublê não tem chave estrangeira), não
 * aparece na criação (a linha nasce válida) e não aparece em uso normal.
 * Aparece quando alguém apaga a linha do outro lado — e o caminho que apaga
 * linha do outro lado é a **exclusão de conta**, que é direito da pessoa e
 * obrigação legal. O Postgres tenta pôr o nulo, o `CHECK` recusa, e a exclusão
 * falha com `23514`.
 *
 * Em 22/09 apareceram três ocorrências em um dia:
 * `found_reports.reporter_user_id`, `match_candidates.decided_by_user_id` e
 * `found_reports.tag_id`. Três não é coincidência: é uma classe, e classe se
 * vigia com portão, não com atenção.
 *
 * A classe é maior que o `SET NULL`. São quatro combinações, e a terceira é a
 * mais perigosa porque não falha:
 *
 * 1. `SET NULL` sobre coluna `NOT NULL` — decidível pelo catálogo, sem opinião.
 * 2. `SET NULL` sobre coluna que um `CHECK` exige — o defeito de 22/09. Não é
 *    decidível mecanicamente (depende do valor das OUTRAS colunas da linha),
 *    então o par é DESCOBERTO mecanicamente e o veredito é ESCRITO à mão.
 * 3. `SET DEFAULT` sem default declarado, ou com default que o `CHECK` recusa.
 * 4. `CASCADE` que apaga mais do que a pessoa esperaria. Este não estoura: ele
 *    apaga em silêncio, e o silêncio é o que o torna pior. Por isso toda
 *    `CASCADE` do banco está declarada aqui com **de quem é a linha que some**.
 *
 * ===========================================================================
 * TRÊS DECISÕES DE FORMA, E O MOTIVO DE CADA UMA
 * ===========================================================================
 * Mesma forma de `conjunto-exato-dos-checks.test.ts`, e pelos mesmos motivos.
 *
 * 1. **A descoberta é no catálogo, nunca nas migrações.** A lição de 22/09 é
 *    literal: uma migração dizia uma coisa e o banco tinha outra, e quem leu o
 *    arquivo concluiu errado. Quem responde qual é a ação de deleção é
 *    `pg_constraint.confdeltype`, porque é ele que o Postgres executa.
 *
 * 2. **O esperado está escrito aqui, por extenso.** Derivar o esperado do
 *    próprio banco compara o banco com ele mesmo e fica verde com qualquer
 *    coisa.
 *
 * 3. **Chave estrangeira ou par que apareça sem entrada aqui REPROVA,
 *    nomeando.** O defeito que se quer impedir é o silêncio: FK nova entra com
 *    a ação errada, ninguém declara, ninguém vê. O passo extra de escrever a
 *    entrada é o único momento em que alguém olha para a ação de deleção em vez
 *    de para a coluna que está acrescentando.
 *
 * ===========================================================================
 * POR QUE O VEREDITO DO PAR É ESCRITO À MÃO
 * ===========================================================================
 * "Este `CHECK` torna o nulo impossível nesta coluna?" não tem resposta
 * mecânica. `CHECK ((origin <> 'tag_scan') OR (tag_id IS NOT NULL AND pet_id IS
 * NOT NULL))` só proíbe o nulo quando `origin = 'tag_scan'`; decidir isso é
 * procurar uma atribuição das outras colunas que falsifique a expressão, que é
 * satisfatibilidade, não consulta.
 *
 * O que É mecânico, e é o que o portão faz: descobrir o PAR (chave estrangeira
 * que põe nulo, restrição que nomeia a coluna que recebe o nulo) e exigir que
 * alguém tenha escrito o veredito. Par sem veredito reprova. É de propósito:
 * quem escreve o veredito precisa abrir o banco e tentar o DELETE, e é isso que
 * transforma "olhei e concordei" em evidência.
 *
 * Os dois vereditos deste banco foram medidos assim, com `DELETE` de verdade na
 * pilha efêmera, e o segundo bloco deste arquivo (`o efeito, e não só a
 * declaração`) reexecuta a medição a cada rodada.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree. A pilha é
 * efêmera e migra do zero: este arquivo afirma o esquema que as migrações
 * PRODUZEM, e não o que elas dizem produzir. Só o banco pega isto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

/**
 * Os mesmos esquemas de produto que `esquema.test.ts` inspeciona. `tiger`,
 * `tiger_data` e `topology` são do PostGIS e têm chave estrangeira própria, que
 * não é nossa e não responde às nossas regras.
 */
const ESQUEMAS_DO_PRODUTO = ['public', 'audit'];

type Acao = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

interface ChaveDeclarada {
  /** As colunas da chave, na ordem em que a restrição as declara. */
  readonly colunas: readonly string[];
  /** `esquema.tabela` do lado referenciado. */
  readonly referencia: string;
  /** O que o Postgres faz quando a linha referenciada é apagada. */
  readonly aoApagar: Acao;
  /**
   * De quem é a linha que some, para as `CASCADE`. É a única pergunta que
   * importa na classe silenciosa, e ela não tem resposta no catálogo: o
   * catálogo sabe que a linha some, não sabe de quem ela é.
   */
  readonly levaJunto?: string;
}

/**
 * TODA chave estrangeira dos esquemas do produto, pela chave
 * `esquema.tabela.nome_da_restrição`.
 *
 * Mudar a ação de deleção de qualquer uma exige mudar a linha aqui junto com a
 * migração. É de propósito.
 */
const CHAVES_ESTRANGEIRAS: Readonly<Record<string, ChaveDeclarada>> = {
  // -------------------------------------------------------------------------
  // entity_verifications
  // -------------------------------------------------------------------------
  'public.entity_verifications.entity_verifications_claimant_user_id_fkey': {
    colunas: ['claimant_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a evidência de verificação que a própria pessoa enviou. Some com a conta dela, e o ' +
      'nível de verificação do profissional (`professionals.verification_level`) NÃO some ' +
      'junto — `entity_verifications.entity_id` é polimórfico e não tem FK. Ver Riscos.',
  },
  'public.entity_verifications.entity_verifications_reviewed_by_user_id_fkey': {
    colunas: ['reviewed_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },

  // -------------------------------------------------------------------------
  // found_reports
  // -------------------------------------------------------------------------
  'public.found_reports.found_reports_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'SET NULL',
  },
  'public.found_reports.found_reports_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'o aviso de achado sobre o pet apagado. Pet e aviso são da mesma pessoa.',
  },
  'public.found_reports.found_reports_photo_upload_id_fkey': {
    colunas: ['photo_upload_id'],
    referencia: 'public.upload_intents',
    aoApagar: 'SET NULL',
  },
  'public.found_reports.found_reports_reporter_user_id_fkey': {
    colunas: ['reporter_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'o aviso de achado inteiro, e com ele os `match_candidates` que o citam — que estão ' +
      'nos casos de perdido de OUTRAS pessoas. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.found_reports.found_reports_tag_id_fkey': {
    colunas: ['tag_id'],
    referencia: 'public.pet_tags',
    // CONTRADIÇÃO VIVA. Ver PARES_DE_NULO_CONTRA_RESTRICAO.
    aoApagar: 'SET NULL',
  },

  // -------------------------------------------------------------------------
  // identidade e sessão
  // -------------------------------------------------------------------------
  'public.local_credentials.local_credentials_identity_id_fkey': {
    colunas: ['identity_id'],
    referencia: 'public.user_identities',
    aoApagar: 'CASCADE',
    levaJunto: 'a senha da identidade apagada. Da própria pessoa.',
  },
  'public.refresh_tokens.refresh_tokens_rotated_to_id_fkey': {
    colunas: ['rotated_to_id'],
    referencia: 'public.refresh_tokens',
    aoApagar: 'SET NULL',
  },
  'public.refresh_tokens.refresh_tokens_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'as sessões da própria pessoa.',
  },
  'public.user_identities.user_identities_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'as identidades da própria pessoa.',
  },
  'public.user_reference_locations.user_reference_locations_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'a localização de referência da própria pessoa.',
  },
  'public.user_roles.user_roles_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os papéis da própria pessoa.',
  },
  'public.verification_tokens.verification_tokens_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os tokens de verificação da própria pessoa.',
  },

  // -------------------------------------------------------------------------
  // lost_cases e match_candidates
  // -------------------------------------------------------------------------
  'public.lost_cases.lost_cases_owner_user_id_fkey': {
    colunas: ['owner_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'o caso de perdido da própria pessoa, e os candidatos dele por `case_id`.',
  },
  'public.lost_cases.lost_cases_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'o caso do pet apagado. Pet e caso são da mesma pessoa.',
  },
  'public.match_candidates.match_candidates_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'CASCADE',
    levaJunto: 'a sugestão, que sem o caso não é nada. Do dono do caso.',
  },
  'public.match_candidates.match_candidates_decided_by_user_id_fkey': {
    colunas: ['decided_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a sugestão inteira. A migração justifica com "quem decide é o tutor, e o caso é dele". ' +
      'O BANCO não exige isso: nada impede `decided_by_user_id` de ser diferente do dono do ' +
      'caso, e nesse dia apagar a conta de quem decidiu apaga a linha do caso de outra ' +
      'pessoa. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.match_candidates.match_candidates_found_report_id_fkey': {
    colunas: ['found_report_id'],
    referencia: 'public.found_reports',
    aoApagar: 'CASCADE',
    levaJunto:
      'a sugestão, que sem o aviso não é nada. Mas o caso é de outra pessoa que não a do ' +
      'aviso: é por aqui que a exclusão de conta atravessa.',
  },

  // -------------------------------------------------------------------------
  // pets, fotos e tags
  // -------------------------------------------------------------------------
  'public.pet_photos.pet_photos_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'as fotos do pet apagado. Da própria pessoa.',
  },
  'public.pet_photos.pet_photos_upload_intent_id_fkey': {
    colunas: ['upload_intent_id'],
    referencia: 'public.upload_intents',
    aoApagar: 'RESTRICT',
  },
  'public.pet_tags.pet_tags_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'as tags do pet apagado, e com elas os `tag_scans` delas. Da própria pessoa.',
  },
  'public.pets.pets_owner_user_id_fkey': {
    colunas: ['owner_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os pets da própria pessoa, e tudo que pende deles.',
  },
  'public.tag_scans.tag_scans_tag_id_fkey': {
    colunas: ['tag_id'],
    referencia: 'public.pet_tags',
    aoApagar: 'CASCADE',
    levaJunto: 'as leituras da tag apagada. A tag é da pessoa; quem leu foi outra.',
  },

  // -------------------------------------------------------------------------
  // dados de referência: NO ACTION de propósito
  //
  // Apagar uma raça, cor, porte, espécie ou versão de referência com pet
  // apontando para ela precisa FALHAR, e não apagar o pet nem apagar a raça do
  // pet em silêncio. `NO ACTION` é a ação certa aqui, e é a única classe deste
  // banco em que ela é escolha e não descuido.
  // -------------------------------------------------------------------------
  'public.pets.pets_primary_color_code_fkey': {
    colunas: ['primary_color_code'],
    referencia: 'public.ref_colors',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_raca_e_da_especie': {
    colunas: ['breed_code', 'species_code'],
    referencia: 'public.ref_breeds',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_ref_data_version_fkey': {
    colunas: ['ref_data_version'],
    referencia: 'public.ref_data_versions',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_secondary_color_code_fkey': {
    colunas: ['secondary_color_code'],
    referencia: 'public.ref_colors',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_size_code_fkey': {
    colunas: ['size_code'],
    referencia: 'public.ref_sizes',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_species_code_fkey': {
    colunas: ['species_code'],
    referencia: 'public.ref_species',
    aoApagar: 'NO ACTION',
  },
  'public.ref_breeds.ref_breeds_species_code_fkey': {
    colunas: ['species_code'],
    referencia: 'public.ref_species',
    aoApagar: 'NO ACTION',
  },

  // -------------------------------------------------------------------------
  // professionals
  // -------------------------------------------------------------------------
  'public.professionals.professionals_claimed_by_user_id_fkey': {
    colunas: ['claimed_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },
  'public.professionals.professionals_created_by_user_id_fkey': {
    colunas: ['created_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },

  // -------------------------------------------------------------------------
  // upload_intents
  // -------------------------------------------------------------------------
  'public.upload_intents.upload_intents_found_report_id_fkey': {
    colunas: ['found_report_id'],
    referencia: 'public.found_reports',
    aoApagar: 'CASCADE',
    levaJunto: 'a intenção de upload da foto do aviso apagado. De quem registrou o aviso.',
  },
  'public.upload_intents.upload_intents_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'a intenção de upload do pet apagado. Da própria pessoa.',
  },
  'public.upload_intents.upload_intents_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'as intenções de upload da própria pessoa. Atravessa `pet_photos.upload_intent_id`, ' +
      'que é RESTRICT: a exclusão de conta só não trava porque a cascata de `pets` apaga a ' +
      'foto antes. Ver Riscos.',
  },
};

type VereditoDoPar = 'compativel' | 'contradiz';

interface ParDeclarado {
  /** A coluna que recebe o nulo (ou o default) quando o pai é apagado. */
  readonly coluna: string;
  readonly veredito: VereditoDoPar;
  /**
   * Como o veredito foi MEDIDO. Não é comentário decorativo: é o que separa
   * "olhei a expressão e concordei" de evidência. O segundo bloco deste arquivo
   * reexecuta a medição contra o banco a cada rodada.
   */
  readonly medicao: string;
}

/**
 * Todo par (chave estrangeira que põe nulo ou default, restrição CHECK que
 * nomeia a coluna que recebe o nulo) do banco.
 *
 * Par que aparecer sem entrada aqui REPROVA, nomeando os dois lados. É o único
 * momento em que alguém é obrigado a abrir o banco e perguntar se o nulo cabe.
 */
const PARES_DE_NULO_CONTRA_RESTRICAO: Readonly<Record<string, ParDeclarado>> = {
  // =========================================================================
  // A TERCEIRA OCORRÊNCIA DE 22/09, E ELA ESTÁ VIVA.
  // =========================================================================
  // `CHECK ((origin <> 'tag_scan') OR (tag_id IS NOT NULL AND pet_id IS NOT
  // NULL))` torna o nulo impossível em `tag_id` sempre que `origin =
  // 'tag_scan'` — que é a origem de TODO aviso que nasceu de uma leitura de QR.
  // A chave estrangeira manda pôr exatamente esse nulo quando a tag é apagada.
  //
  // Não estourou ainda porque tag é revogada por status (`pet_tags.status =
  // 'revoked'`), não apagada. Está viva e esperando o dia em que alguém apagar
  // uma tag — uma limpeza de tag de teste, um `DELETE` de correção, uma rotina
  // de retenção.
  //
  // Este arquivo NÃO conserta o esquema: ele acusa. O conserto é migração, e
  // migração tem dono.
  'public.found_reports.found_reports_tag_id_fkey + found_reports_scan_tem_tag_e_pet': {
    coluna: 'tag_id',
    veredito: 'contradiz',
    medicao:
      'DELETE FROM pet_tags de uma tag com aviso `origin = tag_scan` reprova com 23514 em ' +
      'found_reports_scan_tem_tag_e_pet, no UPDATE ... SET tag_id = NULL que a FK dispara.',
  },

  // =========================================================================
  // O lado permissivo, e ele é permissivo de verdade.
  // =========================================================================
  // O ramo não-`unclaimed` do CHECK exige `claimed_at IS NOT NULL`, e NÃO exige
  // `claimed_by_user_id IS NOT NULL`. O nulo cabe: a linha sobrevive como
  // `claimed` com o marco temporal e sem o reivindicante.
  //
  // Portão que reprovasse isto é portão desligado na primeira semana. A
  // frouxidão (profissional `claimed` sem titular) é assunto de modelo de
  // dados, não de contradição declarativa, e está em Riscos.
  'public.professionals.professionals_claimed_by_user_id_fkey + professionals_titularidade_tem_marco':
    {
      coluna: 'claimed_by_user_id',
      veredito: 'compativel',
      medicao:
        'DELETE FROM users de quem reivindicou conclui; a linha fica ' +
        "claim_status = 'claimed', claimed_by_user_id = NULL, claimed_at preenchido.",
    },
};

/**
 * As chaves estrangeiras por onde a exclusão de uma conta alcança linha que
 * pertence à experiência de OUTRA pessoa.
 *
 * Esta lista existe porque a cascata não falha: ela apaga e fica quieta. Um
 * caminho novo entrando aqui sem ninguém declarar é a coisa mais cara que este
 * arquivo pode deixar passar, então o caso abaixo exige que a lista e o banco
 * concordem, e o segundo bloco exercita o caminho com `DELETE` de verdade.
 */
const CASCATAS_QUE_ATRAVESSAM_PESSOAS: readonly string[] = [
  'public.found_reports.found_reports_reporter_user_id_fkey',
  'public.match_candidates.match_candidates_decided_by_user_id_fkey',
  'public.match_candidates.match_candidates_found_report_id_fkey',
];

const ACAO_POR_CODIGO: Readonly<Record<string, Acao>> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

interface ChaveDoBanco {
  readonly chave: string;
  readonly tabela: string;
  readonly nome: string;
  readonly colunas: string[];
  readonly referencia: string;
  readonly aoApagar: Acao;
  /**
   * As colunas que RECEBEM o nulo ou o default. Não é sempre o conjunto
   * inteiro: desde o Postgres 15 existe `ON DELETE SET NULL (coluna)`, e usar
   * `conkey` no lugar de `confdelsetcols` faria o portão inspecionar coluna que
   * a ação nem toca.
   */
  readonly colunasAfetadas: { nome: string; naoNula: boolean; padrao: string | null }[];
}

interface ParDoBanco {
  readonly chave: string;
  readonly fk: string;
  readonly restricao: string;
  readonly coluna: string;
  readonly definicao: string;
}

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let cliente: Client;
let chaves: ChaveDoBanco[] = [];
let pares: ParDoBanco[] = [];

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo cruza a ação de deleção de cada chave ' +
        'estrangeira com as restrições da tabela, e sem banco ele não confere nada. Passar ' +
        'verde sem conferir é o desfecho que ele existe para impedir. Rode ' +
        '`npm run test:integration`.',
    );
  }

  cliente = new Client({ connectionString: CONEXAO });
  try {
    await cliente.connect();
  } catch (erro) {
    throw new Error(
      `Não consegui conectar em ${CONEXAO.replace(/:[^:@/]*@/, ':***@')}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  // A DESCOBERTA É AQUI, e é no catálogo. Nenhuma migração é lida.
  const r = await cliente.query<{
    tabela: string;
    nome: string;
    colunas: string[];
    referencia: string;
    codigo: string;
    afetadas: { nome: string; naoNula: boolean; padrao: string | null }[];
  }>(
    `select ns.nspname || '.' || rel.relname as tabela,
            con.conname                      as nome,
            (select array_agg(a.attname order by k.ord)
               from unnest(con.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
                                             as colunas,
            fns.nspname || '.' || frel.relname as referencia,
            con.confdeltype::text            as codigo,
            (select coalesce(
                      json_agg(json_build_object(
                        'nome', a.attname,
                        'naoNula', a.attnotnull,
                        'padrao', pg_get_expr(ad.adbin, ad.adrelid)
                      ) order by k.ord), '[]'::json)
               from unnest(coalesce(con.confdelsetcols, con.conkey)) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
               left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum)
                                             as afetadas
       from pg_constraint con
       join pg_class rel     on rel.oid  = con.conrelid
       join pg_namespace ns  on ns.oid   = rel.relnamespace
       join pg_class frel    on frel.oid = con.confrelid
       join pg_namespace fns on fns.oid  = frel.relnamespace
      where con.contype = 'f'
        and ns.nspname = any($1::text[])
      order by 1, 2`,
    [ESQUEMAS_DO_PRODUTO],
  );

  chaves = r.rows.map((linha) => {
    const acao = ACAO_POR_CODIGO[linha.codigo];
    if (acao === undefined) {
      throw new Error(
        `confdeltype '${linha.codigo}' desconhecido em ${linha.tabela}.${linha.nome}. O ` +
          'catálogo passou a devolver um código que este arquivo não sabe ler, e classificar ' +
          'errado é pior que não classificar.',
      );
    }
    return {
      chave: `${linha.tabela}.${linha.nome}`,
      tabela: linha.tabela,
      nome: linha.nome,
      colunas: linha.colunas,
      referencia: linha.referencia,
      aoApagar: acao,
      colunasAfetadas: linha.afetadas,
    };
  });

  if (chaves.length === 0) {
    throw new Error(
      'Nenhuma chave estrangeira encontrada nos esquemas do produto. Verificação que não ' +
        'consegue verificar precisa reprovar: banco sem as migrações aplicadas reprova aqui, ' +
        'e nunca passa por não ter achado nada.',
    );
  }

  // Os PARES, também do catálogo: FK que põe nulo ou default, cruzada com toda
  // restrição CHECK da mesma tabela que NOMEIA a coluna que recebe o nulo.
  const p = await cliente.query<{
    tabela: string;
    fk: string;
    restricao: string;
    coluna: string;
    definicao: string;
  }>(
    `with fk as (
        select con.oid, con.conrelid,
               ns.nspname || '.' || rel.relname                as tabela,
               con.conname                                     as fk,
               coalesce(con.confdelsetcols, con.conkey)        as afetadas
          from pg_constraint con
          join pg_class rel    on rel.oid = con.conrelid
          join pg_namespace ns on ns.oid  = rel.relnamespace
         where con.contype = 'f'
           and ns.nspname = any($1::text[])
           and con.confdeltype in ('n', 'd'))
     select fk.tabela, fk.fk, ck.conname as restricao, a.attname as coluna,
            pg_get_constraintdef(ck.oid) as definicao
       from fk
       join unnest(fk.afetadas) k(attnum) on true
       join pg_attribute a  on a.attrelid  = fk.conrelid and a.attnum = k.attnum
       join pg_constraint ck on ck.conrelid = fk.conrelid
                            and ck.contype  = 'c'
                            and a.attnum    = any(ck.conkey)
      order by 1, 2, 4, 3`,
    [ESQUEMAS_DO_PRODUTO],
  );

  pares = p.rows.map((linha) => ({
    chave: `${linha.tabela}.${linha.fk} + ${linha.restricao}`,
    fk: `${linha.tabela}.${linha.fk}`,
    restricao: linha.restricao,
    coluna: linha.coluna,
    definicao: linha.definicao,
  }));
});

after(async () => {
  if (cliente !== undefined) await cliente.end();
});

void describe('o registro cobre o banco: chave nova sem entrada reprova, nomeando', () => {
  void it('toda chave estrangeira do banco está declarada aqui, e toda declarada existe', () => {
    const noBanco = chaves.map((c) => c.chave).sort();
    const declaradas = Object.keys(CHAVES_ESTRANGEIRAS).sort();

    assert.deepEqual(
      noBanco.filter((c) => !declaradas.includes(c)),
      [],
      'chave estrangeira no banco sem entrada em CHAVES_ESTRANGEIRAS. Declare a ação de ' +
        'deleção dela lá, e pergunte ao banco se ela cabe: FK que entra sem ninguém olhar ' +
        'para o ON DELETE é exatamente como as três de 22/09 entraram.',
    );
    assert.deepEqual(
      declaradas.filter((c) => !noBanco.includes(c)),
      [],
      'chave declarada em CHAVES_ESTRANGEIRAS que o banco não tem mais. Ou a migração a ' +
        'derrubou, ou ela mudou de nome — nos dois casos alguém precisa olhar.',
    );
  });

  void it('cada chave tem exatamente a ação de deleção declarada', () => {
    for (const c of chaves) {
      const esperada = CHAVES_ESTRANGEIRAS[c.chave];
      if (esperada === undefined) continue; // o caso acima já reprovou, com nome.
      assert.equal(
        c.aoApagar,
        esperada.aoApagar,
        `${c.chave}: o banco executa ON DELETE ${c.aoApagar} e aqui está declarado ` +
          `${esperada.aoApagar}. Ação de deleção é o que decide se apagar uma conta funciona, ` +
          'falha com 23514 ou apaga em silêncio o que ninguém pediu.',
      );
    }
  });

  void it('cada chave aponta para a tabela e as colunas declaradas', () => {
    for (const c of chaves) {
      const esperada = CHAVES_ESTRANGEIRAS[c.chave];
      if (esperada === undefined) continue;
      assert.deepEqual(
        c.colunas,
        [...esperada.colunas],
        `${c.chave} é sobre as colunas ${c.colunas.join(', ')}, e aqui está declarada sobre ` +
          `${esperada.colunas.join(', ')}.`,
      );
      assert.equal(
        c.referencia,
        esperada.referencia,
        `${c.chave} referencia ${c.referencia}, e aqui está declarada contra ` +
          `${esperada.referencia}.`,
      );
    }
  });

  void it('a inspeção tem o que inspecionar', () => {
    // Verificação que não consegue verificar precisa reprovar. Se a consulta
    // parar de casar, os casos acima passariam percorrendo lista vazia.
    assert.ok(
      chaves.length >= Object.keys(CHAVES_ESTRANGEIRAS).length,
      `só ${String(chaves.length)} chaves estrangeiras lidas do catálogo, contra ` +
        `${String(Object.keys(CHAVES_ESTRANGEIRAS).length)} declaradas: a consulta de ` +
        'descoberta deixou de casar e os casos deste arquivo passariam percorrendo lista vazia',
    );
    assert.ok(
      chaves.some((c) => c.aoApagar === 'SET NULL'),
      'nenhuma FK SET NULL reconhecida. A classificação por confdeltype deixou de casar, e ' +
        'o defeito que este arquivo vigia é justamente o SET NULL: sem reconhecer nenhum, ' +
        'todo o bloco de contradição fica verde por não ter olhado para nada.',
    );
    assert.ok(
      chaves.some((c) => c.aoApagar === 'CASCADE'),
      'nenhuma FK CASCADE reconhecida: a classificação por confdeltype deixou de casar',
    );
  });
});

void describe('a contradição entre a ação de deleção e a restrição da tabela', () => {
  void it('nenhum SET NULL ou SET DEFAULT recai sobre coluna NOT NULL', () => {
    // Esta metade é decidível sem opinião: o catálogo sabe que a coluna é NOT
    // NULL e sabe que a ação põe nulo nela. Não existe leitura em que isso
    // funcione.
    const acusadas = chaves
      .filter((c) => c.aoApagar === 'SET NULL')
      .flatMap((c) => c.colunasAfetadas.filter((a) => a.naoNula).map((a) => `${c.chave} -> ${a.nome}`))
      .sort();

    assert.deepEqual(
      acusadas,
      [],
      'ON DELETE SET NULL sobre coluna NOT NULL. A exclusão da linha referenciada vai falhar ' +
        'com 23502 no momento em que o Postgres tentar pôr o nulo, e o caminho que apaga ' +
        'linha referenciada é a exclusão de conta.',
    );
  });

  void it('nenhum SET DEFAULT recai sobre coluna sem DEFAULT declarado', () => {
    // `SET DEFAULT` sem default é `SET NULL` disfarçado, com a agravante de
    // que quem lê a migração acredita que há um valor de reposição.
    const acusadas = chaves
      .filter((c) => c.aoApagar === 'SET DEFAULT')
      .flatMap((c) =>
        c.colunasAfetadas.filter((a) => a.padrao === null).map((a) => `${c.chave} -> ${a.nome}`),
      )
      .sort();

    assert.deepEqual(
      acusadas,
      [],
      'ON DELETE SET DEFAULT sobre coluna sem DEFAULT declarado. O Postgres põe NULL, que é ' +
        'o oposto do que a declaração promete a quem lê. Declare o default, ou use SET NULL ' +
        'e assuma o nulo.',
    );
  });

  void it('todo par (chave que põe nulo, restrição sobre a coluna) tem veredito escrito', () => {
    // O defeito que se quer impedir é o silêncio. Par novo entrando sem
    // veredito reprova nomeando os DOIS lados, porque é preciso abrir o banco e
    // perguntar se o nulo cabe — e ninguém pergunta o que não sabe que existe.
    const noBanco = pares.map((p) => p.chave).sort();
    const declarados = Object.keys(PARES_DE_NULO_CONTRA_RESTRICAO).sort();

    assert.deepEqual(
      noBanco.filter((c) => !declarados.includes(c)),
      [],
      'par (chave estrangeira que põe nulo, restrição CHECK que nomeia a coluna que recebe o ' +
        'nulo) sem entrada em PARES_DE_NULO_CONTRA_RESTRICAO. Abra o banco, apague a linha ' +
        'referenciada e escreva o que aconteceu: se der 23514, o veredito é `contradiz`.',
    );
    assert.deepEqual(
      declarados.filter((c) => !noBanco.includes(c)),
      [],
      'par declarado em PARES_DE_NULO_CONTRA_RESTRICAO que o banco não tem mais. Ou a ação ' +
        'de deleção mudou, ou a restrição saiu — nos dois casos alguém precisa olhar, e não ' +
        'é para isto ficar verde.',
    );
  });

  void it('nenhum par em contradição sobreviveu no banco', () => {
    // A ASSERÇÃO CENTRAL. Ela nomeia: quem revisar precisa saber QUAL chave e
    // QUAL restrição se contradizem, porque "há uma contradição no esquema" não
    // conserta nada.
    const contradizem = pares
      .filter((p) => PARES_DE_NULO_CONTRA_RESTRICAO[p.chave]?.veredito === 'contradiz')
      .map((p) => {
        const declarado = PARES_DE_NULO_CONTRA_RESTRICAO[p.chave];
        return (
          `\n  ${p.fk} põe NULL em ${p.coluna}, e ${p.restricao} o proíbe.` +
          `\n    ${p.definicao}` +
          `\n    medido: ${declarado?.medicao ?? '(sem medição declarada)'}`
        );
      });

    assert.deepEqual(
      contradizem,
      [],
      'chave estrangeira e restrição se contradizem: a exclusão da linha referenciada falha ' +
        'com 23514 no momento em que o Postgres tenta pôr o nulo. Em caminho de exclusão de ' +
        'conta isto é dado pessoal que não se consegue apagar.' +
        `${contradizem.join('')}`,
    );
  });
});

void describe('a cascata, que não falha: ela apaga em silêncio', () => {
  void it('toda CASCADE declara de quem é a linha que some', () => {
    const semNota = chaves
      .filter((c) => c.aoApagar === 'CASCADE')
      .filter((c) => {
        const declarada = CHAVES_ESTRANGEIRAS[c.chave];
        return declarada !== undefined && (declarada.levaJunto ?? '').trim() === '';
      })
      .map((c) => c.chave)
      .sort();

    assert.deepEqual(
      semNota,
      [],
      'CASCADE sem `levaJunto`. A cascata não estoura: ela apaga e fica quieta, e a única ' +
        'pergunta que importa — de quem é a linha que some — não tem resposta no catálogo. ' +
        'Escreva a resposta.',
    );
  });

  void it('a lista de cascatas que atravessam pessoas e o banco concordam', () => {
    const declaradas = [...CASCATAS_QUE_ATRAVESSAM_PESSOAS].sort();
    const noBanco = chaves.map((c) => c.chave);

    assert.deepEqual(
      declaradas.filter((c) => !noBanco.includes(c)),
      [],
      'caminho de cascata entre pessoas declarado que o banco não tem mais. Se ele sumiu, ' +
        'apague a linha da lista — lista que não corresponde ao banco é pior que lista nenhuma.',
    );

    for (const chave of declaradas) {
      const atual = chaves.find((c) => c.chave === chave);
      assert.ok(atual, `${chave} não existe no banco`);
      assert.equal(
        atual.aoApagar,
        'CASCADE',
        `${chave} está na lista de cascatas entre pessoas mas hoje é ${atual.aoApagar}. Se ` +
          'alguém corrigiu o caminho, tire-o da lista junto.',
      );
    }
  });
});

// ===========================================================================
// O EFEITO, E NÃO SÓ A DECLARAÇÃO
// ===========================================================================
// Os casos acima perguntam se as declarações combinam. Estes perguntam se a
// exclusão FUNCIONA, que é a pergunta que a pessoa faz quando pede a conta de
// volta. É a prova mais forte disponível, e é a que mede o veredito de cada par
// em vez de aceitá-lo escrito.
//
// Tudo dentro de uma transação que termina em ROLLBACK: nada sobrevive à
// execução, e a ordem dos arquivos da suíte não muda o resultado.

const CONTA = '9e1f0000-0000-4000-8000-000000000001';
const CONTA_DONA = '9e1f0000-0000-4000-8000-000000000002';
const CONTA_TERCEIRA = '9e1f0000-0000-4000-8000-000000000003';
const PET = '9e1f0000-0000-4000-8000-00000000000a';
const PET_DA_DONA = '9e1f0000-0000-4000-8000-00000000000b';
const TAG = '9e1f0000-0000-4000-8000-00000000001a';
const AVISO_DE_SCAN = '9e1f0000-0000-4000-8000-00000000002a';
const AVISO_AVULSO = '9e1f0000-0000-4000-8000-00000000002b';
const CASO = '9e1f0000-0000-4000-8000-00000000003a';
const CANDIDATO = '9e1f0000-0000-4000-8000-00000000004a';
const PROFISSIONAL = '9e1f0000-0000-4000-8000-00000000005a';
const INTENCAO = '9e1f0000-0000-4000-8000-00000000006a';
const FOTO = '9e1f0000-0000-4000-8000-00000000007a';

/** Erro do `pg` com o `code` do Postgres, que é o que interessa aqui. */
function codigoDoErro(erro: unknown): string {
  return typeof erro === 'object' && erro !== null && 'code' in erro
    ? String(erro.code)
    : `(sem code) ${erro instanceof Error ? erro.message : String(erro)}`;
}

void describe('o efeito, e não só a declaração: apagar uma conta de verdade', () => {
  /** Monta a massa dentro de um SAVEPOINT e devolve o controle ao caso. */
  async function comMassa(corpo: () => Promise<void>): Promise<void> {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        `insert into users (id, email) values
           ($1, 'achadora@efeito.test'),
           ($2, 'dona@efeito.test'),
           ($3, 'terceira@efeito.test')`,
        [CONTA, CONTA_DONA, CONTA_TERCEIRA],
      );
      await cliente.query(
        `insert into pets (id, owner_user_id, name, species_code, size_code) values
           ($1, $2, 'Rex', 'dog', 'M'),
           ($3, $4, 'Mel', 'dog', 'M')`,
        [PET, CONTA, PET_DA_DONA, CONTA_DONA],
      );
      await cliente.query(
        `insert into pet_tags (id, pet_id, code_hash, code_suffix)
         values ($1, $2, sha256('efeito'::bytea), 'EFEI')`,
        [TAG, PET],
      );
      // Aviso nascido de leitura de QR: é ele que carrega `origin = tag_scan`,
      // e portanto o `CHECK` que proíbe o nulo em `tag_id`.
      await cliente.query(
        `insert into found_reports
           (id, origin, tag_id, pet_id, found_at, finder_token_hash, finder_token_expires_at)
         values ($1, 'tag_scan', $2, $3, now(), sha256('achador'::bytea), now() + interval '7 days')`,
        [AVISO_DE_SCAN, TAG, PET],
      );
      // Caso de perdido da DONA, com candidato apontando para um aviso avulso
      // registrado pela ACHADORA: o par que faz a cascata atravessar pessoas.
      await cliente.query(
        `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
         values ($1, $2, $3, now(), 'Sao Paulo', 'tok-do-caso-do-efeito')`,
        [CASO, PET_DA_DONA, CONTA_DONA],
      );
      await cliente.query(
        `insert into found_reports
           (id, origin, reporter_user_id, found_at, species, size, found_city, retention_until)
         values ($1, 'stray_report', $2, now(), 'dog', 'M', 'Sao Paulo', now() + interval '90 days')`,
        [AVISO_AVULSO, CONTA],
      );
      await cliente.query(
        `insert into match_candidates
           (id, case_id, found_report_id, score, link_origin, strategy_version)
         values ($1, $2, $3, 0.800, 'attribute_match', 'v1')`,
        [CANDIDATO, CASO, AVISO_AVULSO],
      );
      await cliente.query(
        `insert into professionals
           (id, kind, display_name, source, claim_status, claimed_by_user_id, claimed_at)
         values ($1, 'vet', 'Clinica do Efeito', 'self', 'claimed', $2, now())`,
        [PROFISSIONAL, CONTA_TERCEIRA],
      );
      // O par que torna a exclusão de conta dependente de ORDEM:
      // `upload_intents.user_id` é CASCADE e `pet_photos.upload_intent_id` é
      // RESTRICT. A conta só sai porque a cascata de `pets` apaga a foto antes
      // de a cascata de `upload_intents` chegar na intenção. Sem estas duas
      // linhas na massa, o caso de exclusão passaria sem nunca tocar o RESTRICT.
      await cliente.query(
        `insert into upload_intents
           (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at)
         values ($1, $2, $3, 'pet_photo', 'efeito/1', 'image/jpeg', 1000000,
                 now() + interval '1 hour')`,
        [INTENCAO, CONTA, PET],
      );
      await cliente.query(
        `insert into pet_photos
           (id, pet_id, upload_intent_id, status, original_key, is_primary, created_at)
         values ($1, $2, $3, 'processing', 'efeito/1', false, now())`,
        [FOTO, PET, INTENCAO],
      );
      await corpo();
    } finally {
      await cliente.query('ROLLBACK');
    }
  }

  void it('a exclusão de conta CONCLUI, e leva embora o que é da própria pessoa', async () => {
    await comMassa(async () => {
      // A pergunta que nenhuma comparação de declaração responde: funciona?
      try {
        await cliente.query('delete from users where id = $1', [CONTA]);
      } catch (erro) {
        assert.fail(
          `a exclusão de conta FALHOU com ${codigoDoErro(erro)}. Este é o desfecho que a ` +
            'classe inteira produz: 23514 quando um CHECK proíbe o nulo que a FK manda pôr, ' +
            '23502 quando a coluna é NOT NULL, 23503 quando um RESTRICT no meio do caminho ' +
            `trava. Mensagem: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }

      const { rows } = await cliente.query<{
        pets: string;
        tags: string;
        avisos_de_scan: string;
        avisos_avulsos: string;
        intencoes: string;
        fotos: string;
      }>(
        `select (select count(*) from pets           where id = $1) as pets,
                (select count(*) from pet_tags       where id = $2) as tags,
                (select count(*) from found_reports  where id = $3) as avisos_de_scan,
                (select count(*) from found_reports  where id = $4) as avisos_avulsos,
                (select count(*) from upload_intents where id = $5) as intencoes,
                (select count(*) from pet_photos     where id = $6) as fotos`,
        [PET, TAG, AVISO_DE_SCAN, AVISO_AVULSO, INTENCAO, FOTO],
      );
      assert.deepEqual(
        rows[0],
        {
          pets: '0',
          tags: '0',
          avisos_de_scan: '0',
          avisos_avulsos: '0',
          intencoes: '0',
          fotos: '0',
        },
        'a exclusão concluiu mas deixou linha da própria pessoa para trás. Exclusão de conta ' +
          'que conclui sem apagar não é exclusão: é a promessa quebrada em silêncio.',
      );
    });
  });

  void it('a cascata atravessa pessoas: o caso da dona perde o candidato, e nada acusa', async () => {
    await comMassa(async () => {
      await cliente.query('delete from users where id = $1', [CONTA]);

      const { rows } = await cliente.query<{ candidatos: string; caso: string }>(
        `select (select count(*) from match_candidates where id = $1) as candidatos,
                (select count(*) from lost_cases       where id = $2) as caso`,
        [CANDIDATO, CASO],
      );

      // Este caso AFIRMA o comportamento de hoje em vez de exigir outro: ele
      // existe para que a mudança apareça. Se algum dia o candidato passar a
      // sobreviver — porque alguém trocou a cascata por anonimização —, este
      // caso reprova e a pessoa que fez a troca lê aqui por quê.
      assert.equal(
        rows[0]?.caso,
        '1',
        'o caso de perdido da DONA sumiu quando a ACHADORA apagou a conta dela. Isto seria ' +
          'exclusão de conta apagando o caso de outra pessoa, e é incidente, não defeito.',
      );
      assert.equal(
        rows[0]?.candidatos,
        '0',
        'o candidato sobreviveu ao aviso que ele cita. `match_candidates.found_report_id` é ' +
          'NOT NULL com ON DELETE CASCADE: se a linha ficou, a cascata mudou e o registro ' +
          'deste arquivo está desatualizado.',
      );
    });
  });

  void it('o par compatível é compatível de verdade: o nulo cabe e a linha sobrevive', async () => {
    // O LADO PERMISSIVO, medido. Portão que reprova quem está certo é desligado
    // na primeira semana, e o jeito de não reprovar quem está certo é provar
    // que o certo passa — não afirmar que passa.
    await comMassa(async () => {
      await cliente.query('delete from users where id = $1', [CONTA_TERCEIRA]);

      const { rows } = await cliente.query<{
        claim_status: string;
        claimed_by_user_id: string | null;
        tem_marco: boolean;
      }>(
        `select claim_status, claimed_by_user_id, claimed_at is not null as tem_marco
           from professionals where id = $1`,
        [PROFISSIONAL],
      );
      assert.deepEqual(
        rows[0],
        { claim_status: 'claimed', claimed_by_user_id: null, tem_marco: true },
        'professionals.claimed_by_user_id está declarado como par COMPATÍVEL, e a medição ' +
          'discorda. Ou o CHECK apertou, ou a ação mudou: o veredito escrito em ' +
          'PARES_DE_NULO_CONTRA_RESTRICAO deixou de valer.',
      );
    });
  });

  void it('a terceira ocorrência de 22/09, medida: apagar a tag reprova com 23514', async () => {
    // A MEDIÇÃO do veredito `contradiz`. O caso declarativo acusa pela
    // declaração; este acusa pelo Postgres, que é quem recusa o INSERT.
    //
    // Ele AFIRMA a falha de hoje de propósito. No dia em que a migração
    // corrigir `found_reports.tag_id`, este caso reprova — e reprovar aqui é o
    // sinal de que o conserto chegou, com o arquivo inteiro para ser atualizado
    // junto.
    await comMassa(async () => {
      await cliente.query('SAVEPOINT tentativa');
      let codigo = '(não falhou)';
      let restricao = '(nenhuma)';
      try {
        await cliente.query('delete from pet_tags where id = $1', [TAG]);
      } catch (erro) {
        codigo = codigoDoErro(erro);
        restricao =
          typeof erro === 'object' && erro !== null && 'constraint' in erro
            ? String(erro.constraint)
            : '(sem constraint)';
      }
      await cliente.query('ROLLBACK TO SAVEPOINT tentativa');

      assert.equal(
        codigo,
        '23514',
        'apagar uma tag com aviso de leitura de QR NÃO falhou mais. Se `found_reports.tag_id` ' +
          'deixou de ser ON DELETE SET NULL, o defeito foi corrigido: atualize ' +
          'CHAVES_ESTRANGEIRAS e remova a entrada de PARES_DE_NULO_CONTRA_RESTRICAO.',
      );
      assert.equal(
        restricao,
        'found_reports_scan_tem_tag_e_pet',
        'a exclusão da tag falhou por outra restrição que não a declarada. Sintoma que ' +
          'reaparece com outro nome é cadeia, não recaída: olhe a mensagem crua antes de ' +
          'mexer no registro.',
      );
    });
  });
});
