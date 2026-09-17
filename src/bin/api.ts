/**
 * Processo HTTP: API `/v1` e as rotas de descoberta.
 *
 * Uma imagem Docker, dois comandos de entrada (ADR-0001). Este e `worker.ts` são
 * o MESMO código com pontos de partida diferentes: uma imagem para construir e
 * testar, dois processos para operar.
 *
 * A composição é manual e fica toda aqui, num lugar só. Sem contêiner de
 * injeção: o grafo cabe numa tela, e esconder a fiação atrás de um contêiner
 * esconderia justamente o que a revisão de segurança precisa ver — quem assina
 * token, quem grava trilha e com qual papel de banco.
 */
import { assertSafeBoot, optionalEnv } from '../shared/config/env.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { createDb } from '../shared/db/pool.js';
import { hmacDeEnderecoIp } from '../shared/crypto/digest.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { systemClock } from '../shared/time/clock.js';
import { carregarContrato } from '../shared/http/contract.js';
import { criarServidor } from '../shared/http/server.js';
import { registrarSaude } from '../shared/http/health.js';
import { criarTrilhaDeAuditoria } from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  registrarRotasDeDescoberta,
  registrarRotasDeIdentidade,
} from '../modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../modules/identity/application/auth-service.js';
import { criarReferenceDataRepository } from '../modules/pets/adapters/persistence/kysely-reference-data-repository.js';
import { registrarRotasDeReferencia } from '../modules/pets/adapters/http/reference-data-routes.js';

const PREFIXO_DA_API = '/v1';

export async function main(): Promise<void> {
  // Primeira coisa, antes de ouvir qualquer porta: as travas da §11.2.
  assertSafeBoot();

  const config = loadAppConfig();
  // O contrato é carregado na subida, e não na primeira requisição: operação sem
  // `security` declarado derruba a aplicação aqui, que é onde alguém está
  // olhando, em vez de virar uma rota sem verificação em produção.
  const contrato = carregarContrato(config.openapiSpecPath);

  const banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  const app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro, evento) => {
      // A trilha não derruba o pedido do usuário: um incidente no esquema de
      // auditoria não é motivo para o tutor não conseguir avisar que o pet
      // sumiu. Mas falha silenciosa também não serve, então ela sai ruidosa.
      app.log.error({ err: erro, action: evento.action }, 'trilha de auditoria não gravou');
    },
  });

  const auth = criarAuthService({
    repositorio: criarIdentityRepository(db, ids),
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    avisarTitular: async (aviso) => {
      // O envio de e-mail pertence ao módulo `notifications`, que não existe
      // nesta entrega. Registrar aqui é o mínimo honesto: a detecção fica
      // visível em vez de parecer implementada.
      app.log.warn({ aviso }, 'aviso ao titular pendente de canal de envio');
      await Promise.resolve();
    },
  });

  const dependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
  };

  // Descoberta fica na RAIZ do host da API, fora de `/v1`: quem a consulta é o
  // sistema operacional ou uma biblioteca, e o contrato declara servidor próprio
  // para essas duas operações.
  registrarRotasDeDescoberta(app, dependenciasDasRotas);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
      registrarRotasDeReferencia(escopo, criarReferenceDataRepository(db));
      registrarSaude(escopo, {
        version: config.version,
        problemBaseUrl: config.problemBaseUrl,
        // A sonda toca o banco de verdade: sonda que nao sonda nada sempre
        // responde que esta tudo bem.
        verificacoes: { database: () => banco.ping() },
      });
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );

  const encerrar = async (sinal: string): Promise<void> => {
    app.log.info({ sinal }, 'encerrando');
    await app.close();
    await banco.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.once('SIGINT', () => void encerrar('SIGINT'));

  await app.listen({ port: config.port, host: config.bindHost });
}

// `import.meta.main` não existe em Node 22; a comparação de caminho é o
// equivalente estável e funciona igual sob `node dist/bin/api.js`.
if (optionalEnv('BICHU_SUPRESS_AUTOSTART') === undefined) {
  const invocadoDiretamente = process.argv[1] !== undefined &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href;
  if (invocadoDiretamente) {
    main().catch((erro: unknown) => {
      // Falha de subida vai para a saída de erro com o motivo: um processo que
      // morre calado faz o orquestrador reiniciar em laço sem ninguém saber por
      // quê.
      console.error(erro);
      process.exit(1);
    });
  }
}
