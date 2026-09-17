/**
 * Massa fixa de qa. **Esqueleto**, escrito pelo DevOps porque `make seed`
 * apontava para um arquivo que nao existia: o alvo falhava com
 * "Cannot find module /app/dist/bin/seed.js", que parece defeito de imagem e
 * nao ausencia de decisao.
 *
 * O QUE ESTE ARQUIVO FAZ HOJE: confere que da para semear, e recusa dizendo o
 * que falta. Nao inventa conta, pet nem caso.
 *
 * O QUE FALTA, E DE QUEM E: **quais** contas, **quais** pets e **quais** casos
 * compoem a massa e decisao de QA com produto, nao de infraestrutura. Massa
 * inventada aqui vira a massa oficial por inercia, e no dia em que o teste de
 * aceite precisar de um pet perdido ha 8 dias ninguem vai saber se o que existe
 * foi pensado ou foi o que o DevOps chutou.
 *
 * COMO PREENCHER: substitua `semear` pelas insercoes, mantendo as tres travas
 * de cima (ambiente, esquema, determinismo) e o identificador VINDO DA
 * APLICACAO -- `users.id` nao tem DEFAULT de proposito (ADR-0002, migracao
 * 20260917000001).
 *
 * Determinismo e requisito, nao gosto: `make seed` "recria a massa fixa de qa,
 * deterministica". Massa com `Math.random()` ou `now()` faz o mesmo teste
 * passar hoje e falhar amanha, e a investigacao comeca pelo teste, que esta
 * certo.
 */
import { sql } from 'kysely';
import { optionalEnv, requireEnv } from '../shared/config/env.js';
import { createDb } from '../shared/db/pool.js';
import type { Db } from '../shared/db/pool.js';

/** Sai 2, e nao 1: separa "recusei" de "quebrei" para quem le em esteira. */
const SAIDA_MASSA_NAO_DEFINIDA = 2;

/**
 * Tabelas que a massa precisa encontrar. Semear antes de migrar produz erro de
 * relacao inexistente no meio das insercoes, com parte da massa gravada.
 */
const TABELAS_EXIGIDAS = ['users', 'user_identities', 'pets'] as const;

async function conferirEsquema(db: Db): Promise<void> {
  const resultado = await sql<{ tabela: string }>`
    select table_name as tabela
      from information_schema.tables
     where table_schema = 'public'
       and table_name = any(${sql.val([...TABELAS_EXIGIDAS])})
  `.execute(db);

  const presentes = new Set(resultado.rows.map((linha) => linha.tabela));
  const ausentes = TABELAS_EXIGIDAS.filter((tabela) => !presentes.has(tabela));
  if (ausentes.length > 0) {
    throw new Error(
      `banco sem esquema: faltam ${ausentes.join(', ')}. ` +
        'Rode `make migrar` (ou `make reset` para provar a migracao em banco vazio) antes de semear.',
    );
  }
}

export async function main(): Promise<void> {
  // Semear e destrutivo por natureza: a massa fixa so e fixa se ela sobrescreve
  // o que estava la. Rodar isso contra dado real e perda de dado, e a recusa
  // precisa vir ANTES de abrir conexao.
  const ambiente = optionalEnv('ENVIRONMENT') ?? 'dev';
  if (process.env['NODE_ENV'] === 'production' || ambiente === 'prod' || ambiente === 'preprod') {
    throw new Error(
      `recusado: semear em ambiente '${ambiente}'. A massa fixa sobrescreve dado, ` +
        'e em preprod/prod o dado nao e descartavel.',
    );
  }

  const banco = createDb(requireEnv('DATABASE_URL'));
  try {
    await conferirEsquema(banco.db);
  } finally {
    await banco.close();
  }

  // Daqui para baixo e o que falta. Ate existir, a recusa e ruidosa: um seed
  // que semeia nada e sai 0 e a pior das saidas -- o cliente pergunta se ha
  // usuario de teste, o comando responde verde, e ninguem procura o que
  // acredita ja ter.
  console.error(
    [
      'massa de qa AINDA NAO DEFINIDA.',
      '',
      'O esqueleto esta pronto e o esquema esta aplicado: falta a decisao de QUAIS',
      'contas, pets e casos compoem a massa, que e de QA com produto.',
      '',
      'Preencha `semear` em src/bin/seed.ts. Ate la este comando recusa de',
      'proposito, para nao passar por semeado o que esta vazio.',
    ].join('\n'),
  );
  process.exit(SAIDA_MASSA_NAO_DEFINIDA);
}

if (optionalEnv('BICHU_SUPRESS_AUTOSTART') === undefined) {
  const invocadoDiretamente = process.argv[1] !== undefined &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href;
  if (invocadoDiretamente) {
    main().catch((erro: unknown) => {
      console.error(erro);
      process.exit(1);
    });
  }
}
