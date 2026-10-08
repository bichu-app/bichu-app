/* global console, process */
// `console` e `process` declarados acima: a configuracao plana do ESLint 9
// deixou de honrar `/* eslint-env node */`, e sem a linha de cima este arquivo
// reprova inteiro em `no-undef`. Mesma linha dos irmaos deste diretorio.
/**
 * Portao do armazenamento por destino (ADR-0007 Emenda 1).
 *
 * O QUE ELE PROVA
 * ---------------
 * O `compose.yaml` e UM arquivo para DOIS destinos, e eles discordam sobre o
 * MinIO: o destino LOCAL precisa dele, o HOSPEDADO nao, porque la o
 * armazenamento e o gerenciado (`OBJECT_STORAGE_ENDPOINT` =
 * `https://storage.googleapis.com`). A diferenca e de CONFIGURACAO, e nao de
 * arquivo: o servico `objeto` continua declarado, com `profiles: [dev, qa]`, e
 * quem dependia dele declara `required: false`.
 *
 * Esse desenho tem duas maneiras de quebrar CALADO, e e disso que este portao
 * existe para falar:
 *
 *  1. Alguem tira o `required: false` de um `depends_on`. O destino local
 *     continua funcionando (o `objeto` sobe la!), e o HOSPEDADO passa a recusar
 *     `up` inteiro com "depends on undefined service". Quebra onde ninguem
 *     roda `make up`.
 *  2. Alguem tira o `profiles:` do `objeto`. Os dois destinos continuam
 *     subindo, e o hospedado volta a carregar 256 MB de MinIO sem uso numa VM
 *     de 1976 -- a folga cai de ~408 para ~224 MB, abaixo do piso de 300, e o
 *     sintoma e o nucleo matando o Postgres num horario que nao corresponde a
 *     nada.
 *
 * O JUIZO E O PROPRIO COMPOSE, e nao uma leitura de YAML paralela:
 * `docker compose config` roda a MESMA validacao que o `up` roda, e e ela que
 * devolve "depends on undefined service". Portao que reimplementa a regra
 * aprova quando a regra muda de lugar.
 *
 * As iscas rodam ANTES: cada uma DESLIGA o mecanismo num texto derivado do
 * arquivo de verdade e exige reprovacao. Isca que passa e reprovacao que
 * sumiu, e o portao falha dizendo qual.
 *
 * Uso:
 *   node infra/verificacao/verificar-armazenamento-por-destino.mjs
 *   node infra/verificacao/verificar-armazenamento-por-destino.mjs --autoteste  (so as iscas)
 * Saida: 0 aprovado, 1 reprovado.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  .stdout.trim();
const COMPOSE = join(RAIZ, 'compose.yaml');

/** Os quatro que deixaram de depender do MinIO, e o que cada um e. */
const QUATRO = ['api', 'worker', 'edge', 'midia'];
/** O que NAO pode existir no destino hospedado. */
const SO_LOCAL = ['objeto', 'objeto_init'];

/**
 * O `.env` DE MENTIRA deste portao.
 *
 * `docker compose config` interpola antes de validar, e o compose tem cinco
 * variaveis `:?` (sem valor, ele reprova por falta de `.env` e nao pelo que
 * este portao mede -- foi o primeiro resultado desta verificacao). Um worktree
 * novo nao tem `.env`, e e justamente de worktree que este portao roda.
 *
 * Valores FALSOS, de proposito, e nenhum segredo (ADR-0022): este portao nunca
 * sobe nada, so resolve o documento. `BUILD_COMMIT` tem forma de commit porque
 * `verificar_commit_de_build.py` cobra a forma.
 */
const ENV_DE_MENTIRA = [
  'POSTGRES_PASSWORD=portao-nao-sobe-nada',
  'OBJECT_STORAGE_ACCESS_KEY_ID=portao-nao-sobe-nada',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY=portao-nao-sobe-nada',
  'OBJECT_STORAGE_KMS_KEY=portao-nao-sobe-nada',
  `BUILD_COMMIT=${'0'.repeat(40)}`,
  '',
].join('\n');

/**
 * Roda `docker compose config` sobre UM TEXTO de compose, no diretorio da raiz
 * (os contextos de build sao relativos a ele).
 *
 * Devolve `{ codigo, saida, servicos }`. Em vez de `--services`, que esconde o
 * motivo, pede o documento resolvido e extrai os nomes: assim o erro de
 * validacao chega inteiro para o relato.
 */
function configurar(texto, perfis = []) {
  const arquivo = join(RAIZ, `.compose-portao-${process.pid}.yaml`);
  const env = join(RAIZ, `.env-portao-${process.pid}`);
  writeFileSync(arquivo, texto);
  writeFileSync(env, ENV_DE_MENTIRA);
  try {
    const args = ['compose', '-f', arquivo, '--env-file', env];
    for (const p of perfis) args.push('--profile', p);
    args.push('config', '--services');
    const r = spawnSync('docker', args, { encoding: 'utf8', cwd: RAIZ });
    const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    return {
      codigo: r.status,
      saida,
      servicos: r.status === 0 ? saida.split('\n').map((l) => l.trim()).filter(Boolean) : [],
    };
  } finally {
    rmSync(arquivo, { force: true });
    rmSync(env, { force: true });
  }
}

// ---------------------------------------------------------------------------
// O JUIZO, puro: recebe o texto, devolve a lista de falhas
// ---------------------------------------------------------------------------

export function julgar(texto) {
  const falhas = [];

  // --- Destino HOSPEDADO: nenhum perfil ligado ---------------------------
  const hospedado = configurar(texto, []);
  if (hospedado.codigo !== 0) {
    falhas.push(
      'o destino HOSPEDADO nao resolve: `docker compose config` saiu ' +
        `${String(hospedado.codigo)}. Isto e o que o \`up\` da VM vai fazer. ` +
        `Saida: ${hospedado.saida}`,
    );
  } else {
    for (const nome of SO_LOCAL) {
      if (hospedado.servicos.includes(nome)) {
        falhas.push(
          `\`${nome}\` SOBE no destino hospedado e nao deveria: ele e do destino local ` +
            '(MinIO). Perdeu o `profiles: [dev, qa]`? Sao 256 MB de uma VM de 1976, e a ' +
            'folga cai abaixo do piso de 300 MB',
        );
      }
    }
    for (const nome of QUATRO) {
      if (!hospedado.servicos.includes(nome)) {
        falhas.push(
          `\`${nome}\` NAO sobe no destino hospedado, e ele e um dos quatro que precisam ` +
            'subir la',
        );
      }
    }
  }

  // --- Destino LOCAL: perfil dev ----------------------------------------
  const local = configurar(texto, ['dev']);
  if (local.codigo !== 0) {
    falhas.push(
      `o destino LOCAL nao resolve: \`docker compose --profile dev config\` saiu ` +
        `${String(local.codigo)}. E isto que \`make up\` roda. Saida: ${local.saida}`,
    );
  } else {
    for (const nome of SO_LOCAL) {
      if (!local.servicos.includes(nome)) {
        falhas.push(
          `\`${nome}\` NAO sobe no destino local, e o local precisa do MinIO de verdade: ` +
            '`make up` passa `--profile dev`. Sem ele o envio local nao tem para onde ir',
        );
      }
    }
    for (const nome of QUATRO) {
      if (!local.servicos.includes(nome)) {
        falhas.push(`\`${nome}\` NAO sobe no destino local`);
      }
    }
  }

  return falhas;
}

// ---------------------------------------------------------------------------
// As iscas: cada uma DESLIGA o mecanismo e exige reprovacao
// ---------------------------------------------------------------------------

const ISCAS = [
  {
    nome: 'sem `required: false`, o destino hospedado recusa o `up` inteiro',
    desligar: (t) => t.replaceAll(', required: false}', '}'),
    esperado: /HOSPEDADO nao resolve|depends on undefined service/,
  },
  {
    nome: 'sem `profiles:` no `objeto`, o MinIO volta a subir no hospedado',
    // Tira o perfil SO do `objeto` (o primeiro `profiles: [dev, qa]` do arquivo).
    desligar: (t) => t.replace('    profiles: [dev, qa]\n\n  objeto_init:', '\n  objeto_init:'),
    esperado: /`objeto` SOBE no destino hospedado/,
  },
  {
    nome: 'sem o servico `objeto`, o destino local perde o MinIO',
    desligar: (t) => t.replace(/\n {2}objeto:\n(?:.*\n)*? {4}profiles: \[dev, qa\]\n/, '\n'),
    esperado: /`objeto` NAO sobe no destino local|nao resolve/,
  },
];

function autoteste() {
  const original = readFileSync(COMPOSE, 'utf8');
  let ruim = 0;

  // A isca da isca: o arquivo de verdade PASSA. Sem este caso, um juizo que
  // reprova tudo faria as tres iscas acima "funcionarem".
  const limpo = julgar(original);
  if (limpo.length > 0) {
    console.log('  [REPROVOU] o `compose.yaml` de verdade nao passa o juizo:');
    for (const f of limpo) console.log(`      - ${f}`);
    ruim += 1;
  } else {
    console.log('  [ok] o `compose.yaml` de verdade passa o juizo');
  }

  for (const isca of ISCAS) {
    const texto = isca.desligar(original);
    if (texto === original) {
      console.log(`  [REPROVOU] isca "${isca.nome}": o desligamento nao mudou nada no texto`);
      console.log('      (o arquivo mudou de forma e a isca deixou de desligar o mecanismo)');
      ruim += 1;
      continue;
    }
    const falhas = julgar(texto);
    const casou = falhas.some((f) => isca.esperado.test(f));
    if (!casou) {
      console.log(`  [REPROVOU] isca "${isca.nome}": o mecanismo foi DESLIGADO e o portao APROVOU`);
      console.log(`      falhas vistas: ${falhas.length === 0 ? '(nenhuma)' : falhas.join(' | ')}`);
      ruim += 1;
    } else {
      console.log(`  [ok] isca "${isca.nome}" reprovou, como tem de reprovar`);
    }
  }
  return ruim;
}

// ---------------------------------------------------------------------------

const soIscas = process.argv.includes('--autoteste');
console.log('portao do armazenamento por destino (ADR-0007 Emenda 1)');
console.log('  iscas primeiro: verificacao que nunca reprovou nao e verificacao');

const ruins = autoteste();
if (ruins > 0) {
  console.log(`\nREPROVADO: ${String(ruins)} isca(s) nao se comportaram como iscas`);
  process.exit(1);
}

if (soIscas) {
  console.log('\nAPROVADO (so as iscas; o arquivo de verdade nao foi julgado contra os destinos)');
  process.exit(0);
}

const falhas = julgar(readFileSync(COMPOSE, 'utf8'));
if (falhas.length > 0) {
  console.log('\nREPROVADO:');
  for (const f of falhas) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\n  [ok] destino hospedado: sobe sem `objeto`/`objeto_init`, com os quatro de pe');
console.log('  [ok] destino local (--profile dev): sobe COM o MinIO e com os quatro');
console.log('APROVADO');
