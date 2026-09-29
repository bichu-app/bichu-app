/**
 * Contas do painel administrativo (ADR-0027 item 20.3; D43, D51, D61, D63).
 * Substitui o `conceder-papel`: o painel tem cadastro proprio
 * (`admin_accounts`), e nao papel em `user_roles`.
 *
 *   docker compose run --rm -it api node dist/bin/conta-admin.js criar --email <e-mail> --nome <nome>
 *   docker compose run --rm -it api node dist/bin/conta-admin.js redefinir-senha --email <e-mail>
 *   docker compose run --rm -it api node dist/bin/conta-admin.js desativar --email <e-mail>
 *   docker compose run --rm -it api node dist/bin/conta-admin.js reativar --email <e-mail>
 *   docker compose run --rm -it api node dist/bin/conta-admin.js encerrar-sessoes --email <e-mail>
 *   docker compose run --rm -it api node dist/bin/conta-admin.js listar
 *
 * O roteiro de uso esta em `infra/roteiro-provisionamento.md`, "Conta
 * administrativa". **A senha e digitada pelo cliente no terminal**: nenhum
 * roteiro de agente roda `criar`, `redefinir-senha` ou `reativar`.
 *
 * ## A ordem das recusas
 *
 * 1. argumentos (senha por argumento, subcomando desconhecido): sem terminal,
 *    sem segredo, sem banco;
 * 2. terminal: sem ele, recusa antes de perguntar qualquer coisa;
 * 3. so entao segredos, configuracao e conexao.
 *
 * ## D63 mora aqui, e nao em `admin-access`
 *
 * A conferencia "a senha nova e a mesma da conta do app com o mesmo e-mail?" e
 * a unica leitura do mundo do app no caminho do painel. Ela e composta neste
 * arquivo, pelas portas de `identity` (o repositorio da credencial local e a
 * verificacao de senha), para que o modulo `admin-access` continue sem citar
 * nenhuma tabela do app (P21).
 *
 * ## O que sai no erro inesperado
 *
 * Nome, codigo e mensagem do erro, e nunca o objeto inteiro. O `detail` de uma
 * violacao de restricao do Postgres traz a linha que falhou ("Failing row
 * contains ..."), e a linha de `admin_accounts` carrega o hash.
 */
import { resolverSegredos } from '../shared/config/segredos.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { optionalEnv } from '../shared/config/env.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { createDb, type Db } from '../shared/db/pool.js';
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
import { criarMailer } from '../modules/identity/adapters/external/smtp-mailer.js';
import { criarIdentityRepository } from '../modules/identity/adapters/persistence/kysely-identity-repository.js';
import { gerarHashDeSenha, verificarSenha } from '../modules/identity/ports/senha.js';
import { criarComandoDeContas } from '../modules/admin-access/adapters/persistence/kysely-comando-de-contas.js';
import {
  executarComandoContaAdmin,
  type ConferenciaComContaDoApp,
  type Interacao,
} from '../modules/admin-access/application/comando-conta-admin.js';
import {
  AJUDA,
  interpretarArgumentos,
  SAIDA,
  type CodigoDeSaida,
} from '../modules/admin-access/domain/comando-conta-admin.js';

const SEM_TERMINAL =
  'recusado: sem terminal. O comando pergunta e confirma pelo terminal, e a senha so entra por ele, ' +
  'sem eco. Rode com `docker compose run --rm -it api node dist/bin/conta-admin.js ...` ' +
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

/**
 * D63, composto aqui: a credencial local da conta do app com o mesmo e-mail,
 * conferida com a mesma funcao do login. Sem conta do app, ou conta so com
 * provedor externo, nao ha o que conferir.
 */
export function conferenciaComContaDoApp(
  db: Db,
  ids: ReturnType<typeof criarIdGenerator>,
): ConferenciaComContaDoApp {
  const identidade = criarIdentityRepository(db, ids);
  return {
    async mesmaSenhaDaContaDoApp(email, senha) {
      const credencial = await identidade.buscarCredencialLocalPorEmail(email);
      if (credencial === undefined) return false;
      return verificarSenha(senha, credencial.passwordPhc);
    },
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
    return await executarComandoContaAdmin(interpretado.pedido, {
      contas: criarComandoDeContas({
        db: banco.db,
        ids,
        trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      }),
      senhasVazadas: criarListaDeSenhasVazadasPorFaixa(),
      contaDoApp: conferenciaComContaDoApp(banco.db, ids),
      avisos: criarMailer(config.mail),
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
