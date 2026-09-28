#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs`: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * A migracao aplica em banco QUE JA TEM DADO -- e nao so em banco vazio.
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * `migrations/20260921000001_indice-cego-do-codigo-da-tag.sql` fazia
 * `DELETE FROM pet_tags WHERE status = 'revoked'`. Em banco VAZIO isso aplica
 * sem erro. Contra o banco de desenvolvimento, medido em 28/09/2026, o servico
 * `migracao` da pilha compartilhada morria com saida 1:
 *
 *   error: new row for relation "found_reports" violates check constraint
 *          "found_reports_scan_tem_tag_e_pet"                          (23514)
 *   where: SQL statement "UPDATE ONLY "public"."found_reports"
 *                         SET "tag_id" = NULL WHERE $1 = "tag_id""
 *          SQL statement "DELETE FROM pet_tags WHERE status = 'revoked'"
 *
 * Isso derrubava `make up` e `make test` a partir da arvore principal, porque os
 * dois dependem de `migracao: service_completed_successfully`.
 *
 * ====================================================================
 * POR QUE NENHUM PORTAO PEGOU, E A LISTA E O ARGUMENTO
 * ====================================================================
 *
 * Todo caminho que exercita migracao neste repositorio migra DO ZERO:
 *
 *   `make reset`                   derruba apagando volume e sobe do zero --
 *                                  a propria ajuda do alvo diz "Prova a
 *                                  migracao em banco vazio"
 *   `make verificar-subida-da-api` pilha efemera por worktree, tmpfs, do zero
 *   `npm run test:integration`     idem, e `down -v` ao fim de cada execucao
 *   a esteira                      idem
 *
 * Nenhum deles tem um `found_reports` de `origin = 'tag_scan'` apontando para
 * tag revogada, entao o caminho COM DADO nunca era percorrido. Existia uma
 * CLASSE de defeito de migracao que portao nenhum alcancava, e a prova em banco
 * vazio nao vale para ela: os dois resultados sao verdes por motivos diferentes.
 *
 * ====================================================================
 * COMO ESTE PORTAO FUNCIONA
 * ====================================================================
 *
 * Cada migracao que mexe em DADO pode ganhar uma massa de aresta em
 * `infra/migracao/massa/<nome-identico-ao-da-migracao>.sql`. O portao, na pilha
 * efemera deste worktree, para cada massa e na ordem de aplicacao:
 *
 *   1. `migracao up <carimbo-da-anterior> --timestamp`  (para ANTES da migracao)
 *   2. aplica a massa por `psql`, com `ON_ERROR_STOP=1`
 *   3. `migracao up`                                    (segue ate a cabeca)
 *   4. aplica `<nome>.depois.sql`, se existir: as asserts do estado FINAL
 *
 * O passo 4 e o que distingue este portao de "a migracao nao explodiu". Ele
 * afirma o que SOBROU no banco, e afirma por `RAISE EXCEPTION` dentro do SQL --
 * nao por mensagem no log. O motivo e medido: o `node-pg-migrate` NAO registra
 * ouvinte de `notice` no cliente `pg`, entao `RAISE NOTICE` e `RAISE WARNING`
 * levantados por migracao sao descartados. Um portao que procurasse a mensagem
 * de uma migracao na saida dela procuraria uma coisa que nunca esta la.
 *
 * `--timestamp` e nao contagem: o `node-pg-migrate` filtra
 * `upMigrations.filter(({ timestamp }) => timestamp <= count)`, e o carimbo e o
 * prefixo numerico do nome. Contar migracoes daria um numero que muda a cada
 * migracao nova, e o portao passaria a parar no lugar errado em silencio.
 *
 * ATENCAO ao escrever massa: o esquema que ela ve e o do carimbo ANTERIOR, e nao
 * o da cabeca. Coluna, restricao ou gatilho que nasce depois nao existe ali.
 *
 * ====================================================================
 * O QUE ESTE PORTAO NAO FAZ
 * ====================================================================
 *
 * Ele nao INVENTA massa: migracao sem massa nao reprova. Um portao que exigisse
 * massa de toda migracao seria desligado na primeira semana, e a maioria das
 * migracoes deste repositorio nao mexe em dado. O que ele garante e que a massa
 * QUE EXISTE roda -- e massa que aponta para migracao inexistente REPROVA, para
 * que renomear uma migracao nao aposente a massa dela em silencio.
 *
 * Ele tambem nao prova a DESCIDA sobre a massa. Isso e de `make migrar-baixo`,
 * e misturar os dois faria uma reprovacao com duas causas possiveis.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

import { gerar } from '../integracao/gerar-env-de-integracao.mjs';
import { identidadeDaPilha } from '../integracao/identidade-da-pilha.mjs';

const ARQUIVO = 'infra/integracao/compose.integracao.yaml';
const ENV = '.env.integracao';
const DIR_MIGRACOES = 'migrations';
const DIR_MASSAS = 'infra/migracao/massa';

/** `20260921000001_slug.sql` -- a mesma forma que o portao de carimbo cobra. */
const FORMA = /^(\d{14})_[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;
const SUFIXO_DE_ASSERCAO = '.depois.sql';

// ---------------------------------------------------------------------------
// O JUIZO, isolado do docker de proposito: e ele que o autoteste exercita.
// ---------------------------------------------------------------------------

/**
 * O plano de execucao, e os problemas que reprovam antes de qualquer conteiner.
 *
 * @param {{ migracoes: string[], massas: string[] }} entrada nomes de arquivo, sem caminho
 * @returns {{ passos: Array<{massa: string, migracao: string, carimbo: number,
 *             carimboAnterior: number|null, anterior: string|null}>,
 *             problemas: string[] }}
 */
export function planejar({ migracoes, massas }) {
  const problemas = [];

  // A ordem e o carimbo, que e o que o node-pg-migrate usa como chave primaria.
  // Migracao fora da forma nao e problema DESTE portao (o de carimbo reprova por
  // ela), mas ela nao pode entrar na ordem com carimbo inventado: fica de fora.
  const ordenadas = migracoes
    .map((nome) => ({ nome, carimbo: FORMA.exec(nome) ? Number(FORMA.exec(nome)[1]) : null }))
    .filter((m) => m.carimbo !== null)
    .sort((a, b) => a.carimbo - b.carimbo);

  const porNome = new Map(ordenadas.map((m, i) => [m.nome, i]));

  const fixtures = massas.filter((n) => !n.endsWith(SUFIXO_DE_ASSERCAO));
  const assercoes = new Set(massas.filter((n) => n.endsWith(SUFIXO_DE_ASSERCAO)));

  const passos = [];
  for (const massa of fixtures.toSorted()) {
    if (!FORMA.test(massa)) {
      problemas.push(
        `${DIR_MASSAS}/${massa}: nome fora da forma NNNNNNNNNNNNNN_slug-em-minuscula.sql. ` +
          `A massa se emparelha com a migracao pelo nome IDENTICO, entao nome fora da forma ` +
          `nao tem como se emparelhar -- e massa que nao se emparelha e massa que nunca roda.`,
      );
      continue;
    }
    const i = porNome.get(massa);
    if (i === undefined) {
      problemas.push(
        `${DIR_MASSAS}/${massa}: nao existe \`${DIR_MIGRACOES}/${massa}\`. ` +
          `Massa orfa reprova de proposito: se ela fosse ignorada em silencio, renomear uma ` +
          `migracao aposentaria a massa dela sem nada acusar, e o buraco que este portao fecha ` +
          `voltaria a existir com o portao ligado.`,
      );
      continue;
    }
    if (i === 0) {
      problemas.push(
        `${DIR_MASSAS}/${massa}: e a PRIMEIRA migracao do repositorio. Nao ha estado anterior ` +
          `em que a massa possa ser inserida -- as tabelas dela nascem nessa propria migracao.`,
      );
      continue;
    }
    passos.push({
      massa,
      migracao: massa,
      carimbo: ordenadas[i].carimbo,
      carimboAnterior: ordenadas[i - 1].carimbo,
      anterior: ordenadas[i - 1].nome,
      assercao: assercoes.has(`${massa.slice(0, -'.sql'.length)}${SUFIXO_DE_ASSERCAO}`)
        ? `${massa.slice(0, -'.sql'.length)}${SUFIXO_DE_ASSERCAO}`
        : null,
    });
  }

  // Assercao sem massa nunca roda, e silencio aqui seria o mesmo defeito da orfa.
  for (const a of assercoes) {
    const base = `${a.slice(0, -SUFIXO_DE_ASSERCAO.length)}.sql`;
    if (!fixtures.includes(base)) {
      problemas.push(
        `${DIR_MASSAS}/${a}: nao existe a massa \`${base}\` que ela conferiria. ` +
          `Assercao sem massa nunca roda.`,
      );
    }
  }

  // Duas massas cujo carimbo anterior e o mesmo passo nao se atropelam -- a
  // execucao e sequencial e `up` e cumulativo -- mas duas massas PARA A MESMA
  // migracao seriam duas linhas com o mesmo nome, o que o sistema de arquivos ja
  // impede. Nada a conferir aqui, e a ausencia e proposital.

  return { passos: passos.sort((a, b) => a.carimbo - b.carimbo), problemas };
}

// ---------------------------------------------------------------------------
// AS ISCAS. Cada uma tem de reprovar pela SUA regra, e nao so reprovar.
// ---------------------------------------------------------------------------

const MIGRACOES_FALSAS = [
  '20260101000001_primeira.sql',
  '20260101000002_segunda.sql',
  '20260101000003_terceira.sql',
];

const ISCAS = [
  {
    nome: 'massa que aponta para migracao inexistente',
    entrada: { migracoes: MIGRACOES_FALSAS, massas: ['20260101000009_nao-existe.sql'] },
    esperado: /nao existe `migrations\/20260101000009_nao-existe\.sql`/,
  },
  {
    nome: 'massa para a PRIMEIRA migracao (nao ha estado anterior)',
    entrada: { migracoes: MIGRACOES_FALSAS, massas: ['20260101000001_primeira.sql'] },
    esperado: /e a PRIMEIRA migracao do repositorio/,
  },
  {
    nome: 'massa com nome fora da forma',
    entrada: { migracoes: MIGRACOES_FALSAS, massas: ['massa-da-segunda.sql'] },
    esperado: /nome fora da forma/,
  },
  {
    nome: 'assercao `.depois.sql` sem a massa correspondente',
    entrada: { migracoes: MIGRACOES_FALSAS, massas: ['20260101000002_segunda.depois.sql'] },
    esperado: /nao existe a massa `20260101000002_segunda\.sql`/,
  },
];

const DEVE_PASSAR = {
  nome: 'duas massas validas, na ordem do carimbo, uma com assercao',
  entrada: {
    // De proposito FORA de ordem na entrada: o que ordena e o carimbo, e uma
    // implementacao que confiasse na ordem do `readdir` passaria por acidente.
    migracoes: MIGRACOES_FALSAS.toReversed(),
    massas: [
      '20260101000003_terceira.sql',
      '20260101000002_segunda.sql',
      '20260101000002_segunda.depois.sql',
    ],
  },
};

export function autoteste() {
  let falhou = false;

  for (const isca of ISCAS) {
    const { problemas } = planejar(isca.entrada);
    const casou = problemas.some((p) => isca.esperado.test(p));
    if (!casou) {
      falhou = true;
      console.error(`ISCA NAO REPROVOU PELA REGRA DELA: ${isca.nome}`);
      console.error(`  esperado casar: ${String(isca.esperado)}`);
      console.error(`  problemas devolvidos: ${problemas.length === 0 ? '(nenhum)' : ''}`);
      for (const p of problemas) console.error(`    - ${p}`);
    } else {
      console.log(`  isca ok: ${isca.nome}`);
    }
  }

  const { passos, problemas } = planejar(DEVE_PASSAR.entrada);
  if (problemas.length > 0) {
    falhou = true;
    console.error(`O CASO QUE DEVE PASSAR REPROVOU: ${DEVE_PASSAR.nome}`);
    for (const p of problemas) console.error(`    - ${p}`);
  } else if (
    passos.length !== 2 ||
    passos[0].massa !== '20260101000002_segunda.sql' ||
    passos[0].carimboAnterior !== 20260101000001 ||
    passos[0].assercao !== '20260101000002_segunda.depois.sql' ||
    passos[1].massa !== '20260101000003_terceira.sql' ||
    passos[1].carimboAnterior !== 20260101000002 ||
    passos[1].assercao !== null
  ) {
    falhou = true;
    console.error(`O CASO QUE DEVE PASSAR SAIU DIFERENTE: ${DEVE_PASSAR.nome}`);
    console.error(JSON.stringify(passos, null, 2));
  } else {
    console.log(`  caso que deve passar ok: ${DEVE_PASSAR.nome}`);
  }

  if (falhou) {
    console.error('\nREPROVADO: as iscas do portao de migracao com dado nao se comportaram.\n');
    process.exit(1);
  }
  console.log(`iscas do plano: ${String(ISCAS.length)} reprovaram pela regra delas, 1 passou.`);
}

// ---------------------------------------------------------------------------
// O PORTAO. Pilha efemera por worktree, a mesma disciplina de
// `verificar-subida-da-api.mjs`.
// ---------------------------------------------------------------------------

function lerNomes(dir, oque) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`o diretorio ${oque} nao existe: ${dir}`);
  }
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .filter((n) => statSync(`${dir}/${n}`).isFile());
}

function exercitar() {
  const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  process.chdir(raiz);

  const migracoes = lerNomes(DIR_MIGRACOES, 'das migracoes');
  const massas = existsSync(DIR_MASSAS) ? lerNomes(DIR_MASSAS, 'das massas') : [];

  const { passos, problemas } = planejar({ migracoes, massas });

  if (problemas.length > 0) {
    console.error(`\nREPROVADO: ${String(problemas.length)} problema(s) no plano, antes do docker.\n`);
    for (const p of problemas) console.error(`  - ${p}\n`);
    process.exit(1);
  }

  if (passos.length === 0) {
    // Nao reprova: massa nenhuma e o estado legitimo de um repositorio cujas
    // migracoes nao mexem em dado. O que se imprime e o convite, para que a
    // ausencia seja uma escolha visivel e nao um esquecimento.
    console.log(`nenhuma massa em ${DIR_MASSAS}/: nada a exercitar.`);
    console.log('Migracao que mexe em DADO merece uma: o nome do arquivo e o nome da migracao.');
    return;
  }

  const { projeto, tagDaPilha } = identidadeDaPilha(raiz);
  // Sufixo proprio: `make fechar-integracao` roda este portao e o da subida da
  // API no mesmo worktree, e um `down -v` de um nao pode levar o outro junto.
  const projetoDaMassa = `${projeto}-massa`;

  const commitDeBuild =
    process.env.BUILD_COMMIT?.trim() ||
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();

  const compose = (args, opcoes = {}) =>
    spawnSync('docker', ['compose', '-p', projetoDaMassa, '-f', ARQUIVO, '--env-file', ENV, ...args], {
      stdio: 'inherit',
      ...opcoes,
      env: {
        ...process.env,
        BUILD_COMMIT: commitDeBuild,
        TAG_DA_PILHA: tagDaPilha,
        ...(opcoes.env ?? {}),
      },
    });

  let derrubando = false;
  const derrubar = () => {
    if (derrubando) return;
    derrubando = true;
    compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });
    if (process.env.BICHU_MANTER_IMAGEM === '1') return;
    spawnSync('docker', ['image', 'rm', '-f', `bichu-migrador:${tagDaPilha}`], { stdio: 'ignore' });
  };
  process.on('SIGINT', () => {
    derrubar();
    process.exit(130);
  });

  const reprovar = (oque, saida) => {
    derrubar();
    console.error(`\nREPROVADO: ${oque} (saida ${String(saida)}).\n`);
    process.exit(1);
  };

  console.log(`worktree:  ${raiz}`);
  console.log(`projeto:   ${projetoDaMassa}  (a pilha principal e \`bichu\`; esta nunca e)`);
  const { conferidas } = gerar();
  console.log(`ambiente:  ${ENV} gerado, ${String(conferidas)} variaveis exigidas pelo codigo preenchidas`);

  // Uma execucao anterior interrompida deixaria banco de pe com dado velho, e
  // dado velho aqui nao e ruido: ele mudaria o que a migracao encontra.
  compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });

  const construcao = compose(['build', 'migracao']);
  if (construcao.status !== 0) reprovar('a imagem do migrador nao construiu', construcao.status);

  const subida = compose(['up', '-d', '--wait', 'db']);
  if (subida.status !== 0) reprovar('o banco efemero nao ficou saudavel', subida.status);

  /** `psql` por dentro da rede, pelo socket unix -- sem porta publicada e sem senha. */
  const psql = (sql) =>
    compose(
      [
        'exec', '-T', 'db',
        'sh', '-c',
        // `-f -` e nao `-c`: a massa e um arquivo com varias instrucoes, e
        // `ON_ERROR_STOP=1` e o que faz a primeira falha virar saida diferente
        // de zero em vez de um erro impresso no meio de um `psql` que sai 0.
        'exec psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -',
      ],
      { input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
    );

  for (const passo of passos) {
    console.log(`\n--- ${passo.massa} ---`);
    console.log(`  1. migra ate ${passo.anterior} (carimbo <= ${String(passo.carimboAnterior)})`);
    const ate = compose(['run', '--rm', 'migracao', 'up', String(passo.carimboAnterior), '--timestamp']);
    if (ate.status !== 0) reprovar(`a subida ate ${passo.anterior} reprovou`, ate.status);

    console.log(`  2. aplica a massa`);
    const inserir = psql(readFileSync(`${DIR_MASSAS}/${passo.massa}`, 'utf8'));
    if (inserir.status !== 0) {
      reprovar(
        `a massa ${DIR_MASSAS}/${passo.massa} nao entrou no esquema de ${passo.anterior}. ` +
          `Lembre que o esquema visivel para ela e o do carimbo ANTERIOR, e nao o da cabeca`,
        inserir.status,
      );
    }

    console.log(`  3. migra ${passo.migracao} e o que vem depois, SOBRE a massa`);
    const resto = compose(['run', '--rm', 'migracao', 'up']);
    if (resto.status !== 0) {
      reprovar(
        `a migracao reprovou contra banco COM DADO, e este e exatamente o defeito que este ` +
          `portao existe para pegar. Em banco vazio ela passa -- a prova em banco vazio nao ` +
          `vale para esta classe`,
        resto.status,
      );
    }

    if (passo.assercao) {
      console.log(`  4. confere o estado final (${passo.assercao})`);
      const conferir = psql(readFileSync(`${DIR_MASSAS}/${passo.assercao}`, 'utf8'));
      if (conferir.status !== 0) {
        reprovar(
          `a migracao aplicou sem erro, mas o estado final nao e o que ${passo.assercao} afirma. ` +
            `Isto e pior que a explosao: o banco ficou errado em silencio`,
          conferir.status,
        );
      }
    } else {
      console.log(`  4. (sem ${passo.massa.slice(0, -4)}${SUFIXO_DE_ASSERCAO}: so a ausencia de erro foi provada)`);
    }
  }

  derrubar();
  console.log(
    `\nmigracao em banco com dado APROVADA: ${String(passos.length)} massa(s) exercitada(s), ` +
      `todas com \`migrate up\` saindo 0 sobre dado preexistente.`,
  );
}

// ---------------------------------------------------------------------------

console.log('migracao em banco com dado: as iscas primeiro, o docker depois.');
autoteste();
if (!process.argv.includes('--autoteste')) exercitar();
else console.log('so o autoteste: nenhuma pilha foi subida.');
