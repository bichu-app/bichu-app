/**
 * Concede e revoga papel administrativo (BICHUS-260; ADR-0027 D42, D43, D51).
 *
 *   docker compose run --rm -it api node dist/bin/conceder-papel.js --email <e-mail>
 *   docker compose run --rm -it api node dist/bin/conceder-papel.js --email <e-mail> --criar-conta
 *   docker compose run --rm -it api node dist/bin/conceder-papel.js --email <e-mail> --revogar
 *
 * O roteiro de uso esta em `infra/roteiro-provisionamento.md`, "Conta
 * administrativa".
 *
 * ## A ordem das recusas
 *
 * 1. argumentos (senha por argumento, papel fora da lista, `tutor`): sem
 *    terminal, sem segredo, sem banco;
 * 2. terminal: sem ele, recusa antes de perguntar qualquer coisa;
 * 3. so entao segredos, configuracao e conexao.
 *
 * Assim a isca de "senha por argumento" e a de "papel fora da lista" nao
 * dependem de banco nenhum para reprovar, e o teste delas roda sem pilha.
 *
 * ## O que sai no erro inesperado
 *
 * Nome, codigo e mensagem do erro, e nunca o objeto inteiro. O `detail` de uma
 * violacao de restricao do Postgres traz a linha que falhou ("Failing row
 * contains ..."), e a linha de `local_credentials` carrega o hash.
 */
import { resolverSegredos } from '../shared/config/segredos.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { optionalEnv } from '../shared/config/env.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { createDb } from '../shared/db/pool.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { systemClock } from '../shared/time/clock.js';
import {
  LeituraInterrompida,
  lerLinhaComEco,
  lerSenhaSemEco,
  SemTerminal,
  temTerminal,
  type EntradaDeTerminal,
} from '../shared/tty/ler-senha-sem-eco.js';
import { criarTrilhaTransacional } from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarListaDeSenhasVazadasPorFaixa } from '../modules/identity/adapters/external/lista-de-senhas-vazadas-por-faixa.js';
import { criarRepositorioDePapeis } from '../modules/identity/adapters/persistence/kysely-repositorio-de-papeis.js';
import { executarPedidoDePapel, type Interacao } from '../modules/identity/application/conceder-papel.js';
import {
  AJUDA,
  interpretarArgumentos,
  SAIDA,
  type CodigoDeSaida,
} from '../modules/identity/domain/concessao-de-papel.js';
import { gerarHashDeSenha } from '../modules/identity/domain/password.js';

const SEM_TERMINAL =
  'recusado: sem terminal. O comando pergunta e confirma pelo terminal, e a senha so entra por ele, ' +
  'sem eco. Rode com `docker compose run --rm -it api node dist/bin/conceder-papel.js ...` ' +
  '(o -it e o que da o terminal).';

function interacaoDoTerminal(entrada: EntradaDeTerminal): Interacao {
  const saida = process.stderr;
  return {
    mostrar: (texto) => {
      saida.write(`${texto}\n`);
    },
    perguntar: (rotulo) => lerLinhaComEco(entrada, saida, rotulo),
    perguntarSenha: (rotulo) => lerSenhaSemEco(entrada, saida, rotulo),
  };
}

/** Nome, codigo e mensagem. Nunca `detail`, `where`, parametros nem pilha. */
export function descreverErro(erro: unknown): string {
  if (!(erro instanceof Error)) return 'erro inesperado sem descricao';
  const codigo = (erro as { code?: unknown }).code;
  return `${erro.name}${typeof codigo === 'string' ? ` [${codigo}]` : ''}: ${erro.message}`;
}

export async function main(argumentos: readonly string[], entrada: EntradaDeTerminal): Promise<CodigoDeSaida> {
  const interpretado = interpretarArgumentos(argumentos);
  if (interpretado.tipo === 'ajuda') {
    process.stdout.write(`${AJUDA}\n`);
    return SAIDA.OK;
  }
  if (interpretado.tipo === 'recusa') {
    process.stderr.write(`${interpretado.mensagem}\n`);
    return interpretado.codigo;
  }
  if (!temTerminal(entrada)) {
    process.stderr.write(`${SEM_TERMINAL}\n`);
    return SAIDA.USO;
  }

  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));
  const config = loadAppConfig();
  const banco = createDb(config.databaseUrl);
  try {
    const ids = criarIdGenerator(() => systemClock.now());
    return await executarPedidoDePapel(interpretado.pedido, {
      repositorio: criarRepositorioDePapeis({
        db: banco.db,
        ids,
        trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      }),
      senhasVazadas: criarListaDeSenhasVazadasPorFaixa(),
      interacao: interacaoDoTerminal(entrada),
      clock: systemClock,
      gerarHash: gerarHashDeSenha,
    });
  } finally {
    await banco.close();
  }
}

if (optionalEnv('BICHU_SUPRESS_AUTOSTART') === undefined) {
  const invocadoDiretamente =
    process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
  if (invocadoDiretamente) {
    main(process.argv.slice(2), process.stdin)
      .then((codigo) => {
        process.exitCode = codigo;
      })
      .catch((erro: unknown) => {
        if (erro instanceof LeituraInterrompida) {
          process.stderr.write('\ncancelado: nada foi gravado.\n');
          process.exitCode = SAIDA.CANCELADO;
          return;
        }
        if (erro instanceof SemTerminal) {
          process.stderr.write(`${SEM_TERMINAL}\n`);
          process.exitCode = SAIDA.USO;
          return;
        }
        process.stderr.write(`falhou: ${descreverErro(erro)}\n`);
        process.exitCode = SAIDA.ERRO_INTERNO;
      })
      .finally(() => {
        // `stdin` retomado pelo leitor seguraria o processo aberto.
        process.stdin.pause();
      });
  }
}
