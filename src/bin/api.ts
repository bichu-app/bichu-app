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
import { vigiarIdempotenciaDasRotas } from '../shared/http/idempotency.js';
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
import { criarIdempotencia } from '../shared/http/idempotency.js';
import { criarSecretCipher } from '../modules/tags/adapters/external/aes-gcm-secret-cipher.js';
import { criarTagRepository } from '../modules/tags/adapters/persistence/kysely-tag-repository.js';
import { criarTagService } from '../modules/tags/application/tag-service.js';
import { registrarRotasDeTags } from '../modules/tags/adapters/http/tag-routes.js';

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

  const tags = criarTagService({
    repositorio: criarTagRepository(db),
    cifra: criarSecretCipher(config.tagCodeKey),
    ids,
    clock: systemClock,
    trilha,
    // `TAG_BASE_URL` e `WEB_BASE_URL` ainda são a mesma variável (ADR-0017 item
    // 2 as separa, e a separação não chegou à configuração). Enquanto forem uma
    // só, apontar as duas para ela é o estado verdadeiro; o que a separação
    // registra é qual delas é a irreversível, e essa é a da plaquinha.
    baseDaTag: config.publicBaseUrl,
    baseDaWeb: config.publicBaseUrl,
  });

  const dependenciasDasRotasDeTag = {
    tags,
    // A porta é de `tags` e quem a liga ao serviço de identidade é esta linha: é
    // o único lugar do sistema que conhece os dois lados. `tags` recebe de uma
    // sessão apenas de quem ela é, e por isso não tem como devolver dado de
    // conta por engano.
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
  };

  // Precisa vir ANTES do registro das rotas: o gancho `onRoute` só enxerga o
  // que for registrado depois dele. A conferência em si roda no fim, quando
  // todas as rotas já existem.
  const conferirIdempotencia = vigiarIdempotenciaDasRotas(app, contrato, PREFIXO_DA_API);

  // Descoberta fica na RAIZ do host da API, fora de `/v1`: quem a consulta é o
  // sistema operacional ou uma biblioteca, e o contrato declara servidor próprio
  // para essas duas operações.
  registrarRotasDeDescoberta(app, dependenciasDasRotas);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
      registrarRotasDeReferencia(escopo, criarReferenceDataRepository(db));
      registrarRotasDeTags(escopo, dependenciasDasRotasDeTag);
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

  // Rota que o contrato declara idempotente e que não passa pela idempotência
  // derruba a subida aqui, e não no segundo envio de um cliente offline, que é
  // onde o defeito apareceria sozinho.
  conferirIdempotencia();

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
