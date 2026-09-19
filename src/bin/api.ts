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
import { registrarRotaDoWebhookDeEntrega } from '../modules/notifications/adapters/http/webhook-de-entrega.js';
import { criarRegistroDeEntregas } from '../modules/notifications/adapters/persistence/kysely-registro-de-entregas.js';
import { resolverSegredos } from '../shared/config/segredos.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { createDb } from '../shared/db/pool.js';
import { hmacDeEnderecoIp } from '../shared/crypto/digest.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { criarMailer } from '../modules/identity/adapters/external/smtp-mailer.js';
import { systemClock } from '../shared/time/clock.js';
import { carregarContrato } from '../shared/http/contract.js';
import { criarServidor } from '../shared/http/server.js';
import { vigiarIdempotenciaDasRotas } from '../shared/http/idempotency.js';
import { registrarSaude } from '../shared/http/health.js';
import { identidadeDoArtefato } from '../shared/artefato/identidade-do-artefato.js';
import { criarTrilhaDeAuditoria } from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../modules/identity/adapters/persistence/kysely-identity-repository.js';
import {
  registrarRotasDeDescoberta,
  registrarRotasDeIdentidade,
} from '../modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../modules/identity/application/aviso-de-reuso.js';
import { criarReferenceDataRepository } from '../modules/pets/adapters/persistence/kysely-reference-data-repository.js';
import { registrarRotasDeReferencia } from '../modules/pets/adapters/http/reference-data-routes.js';
import { criarPetRepository } from '../modules/pets/adapters/persistence/kysely-pet-repository.js';
import { PetService } from '../modules/pets/application/pet-service.js';
import { registrarRotasDePets } from '../modules/pets/adapters/http/pet-routes.js';
import { criarMediaRepository } from '../modules/media/adapters/persistence/kysely-media-repository.js';
import type { FotoResumida } from '../modules/pets/ports/fotos-do-pet.js';
import type { PetId } from '../shared/types/brands.js';
import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { MediaService } from '../modules/media/application/media-service.js';
import { registrarRotasDeMidia } from '../modules/media/adapters/http/media-routes.js';
import { criarLostCaseRepository } from '../modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import { LostCaseService } from '../modules/lostfound/application/lost-case-service.js';
import { registrarRotasDeCasos } from '../modules/lostfound/adapters/http/lost-case-routes.js';
import { criarIdempotencia } from '../shared/http/idempotency.js';
import { criarSecretCipher } from '../modules/tags/adapters/external/aes-gcm-secret-cipher.js';
import { criarTagRepository } from '../modules/tags/adapters/persistence/kysely-tag-repository.js';
import { criarTagService } from '../modules/tags/application/tag-service.js';
import { registrarRotasDeTags } from '../modules/tags/adapters/http/tag-routes.js';

const PREFIXO_DA_API = '/v1';

export async function main(): Promise<void> {
  // Primeira coisa, antes de ouvir qualquer porta: as travas da §11.2.
  assertSafeBoot();

  // Os segredos vêm ANTES de `loadAppConfig()` porque é ela que os lê. Em
  // `dev` isto é o `env_file` de sempre; em `prod`/`preprod` vem do gerenciador
  // (ADR-0022), e nos dois casos o valor chega em `process.env` com o MESMO
  // nome — é o que mantém os `requireEnv('NOME')` literais visíveis para a
  // guarda da esteira e as validações de forma valendo sem uma linha nova.
  //
  // Ligar aqui não é detalhe: sem esta chamada a porta inteira seria código
  // morto, que foi exatamente o defeito que o QA achou em
  // `invalidarTodasAsSessoes` — mecanismo escrito, testado, e sem chamador.
  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));

  const config = loadAppConfig();
  // Calculada AQUI, na subida, e não a cada requisição da sonda: ela lê `dist/`
  // e o contrato do disco. Um artefato ilegível derruba o boot, com o motivo,
  // em vez de a sonda passar a responder sem identificar o que está rodando —
  // e uma sonda que não identifica o artefato é o estado que o critério 12 de
  // BICHUS-13 reprovou.
  const build = identidadeDoArtefato();
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

  // Declarados antes do serviço: `avisarTitular` precisa dos dois, e ela é
  // passada para dentro dele.
  const repositorioDeIdentidade = criarIdentityRepository(db, ids);
  const mailer = criarMailer(config.mail);

  const auth = criarAuthService({
    repositorio: repositorioDeIdentidade,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    // O link do e-mail aponta para a PÁGINA do time web, não para a API: quem
    // abre é uma pessoa num navegador, e o ADR-0017 tirou HTML deste serviço.
    baseDaWeb: config.publicBaseUrl,
    // O corpo desta função morava aqui dentro, como lambda. Ele saiu para
    // `identity/application/aviso-de-reuso.ts` por um motivo só: nada neste
    // arquivo é carregado por teste — `main()` abre porta, banco e SMTP —, e
    // enquanto a montagem do aviso estivesse aqui ela ficava em 0% de
    // cobertura. Inverter o `if (conta === undefined)` não reprovava nada, e o
    // efeito em produção é a detecção de reuso voltar a ser silenciosa, que é
    // exatamente o que o critério 10 de BICHUS-15 proíbe (BICHUS-129).
    // O que ficou aqui é a fiação; a decisão de para quem escrever e o que
    // dizer está do outro lado, onde um teste alcança.
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio: repositorioDeIdentidade,
      mailer,
      registrarOcorrencia: (dados, mensagem) => {
        app.log.warn(dados, mensagem);
      },
    }),
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

  // Declarado ANTES do cadastro porque o cadastro depende dele: a ficha do pet
  // mostra o estado da foto. Uma instância só, usada pelas rotas de mídia e pela
  // porta estreita que o cadastro enxerga — duas seriam duas conexões para o
  // mesmo dado.
  const repositorioDeMidia = criarMediaRepository(db);

  /** A URL da derivada pública, montada na leitura. O banco guarda só a chave. */
  const urlDeMidia = (chave: string): string =>
    `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`;

  const dependenciasDasRotasDePet = {
    pets: new PetService({
      repositorio: criarPetRepository(db),
      ids,
      clock: systemClock,
      trilha,
    }),
    // Mesma ligação de `tags`: o módulo do cadastro recebe uma porta que só
    // sabe dizer de quem é a sessão, e nunca o serviço de identidade inteiro.
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
    // ESTA LINHA é a ligação entre cadastro e mídia, e é o único lugar do
    // sistema que conhece os dois lados. O cadastro enxerga uma porta de um
    // método só; o dia em que a foto vier de outro serviço, muda aqui.
    fotos: {
      porPets: async (pets: readonly PetId[]) => {
        const doBanco = await repositorioDeMidia.porPets(pets);
        const saida = new Map<string, FotoResumida[]>();
        for (const [petId, fotos] of doBanco) {
          saida.set(
            petId,
            fotos.map((f) => ({
              id: f.id,
              status: f.status,
              isPrimary: f.isPrimary,
              // Nulas enquanto o worker não gerou as derivadas, e a ausência é
              // o valor honesto: a tela diz "enviando" em vez de mostrar um
              // espaço vazio que o tutor não sabe se é erro dele.
              thumbUrl: f.thumbKey === null ? null : urlDeMidia(f.thumbKey),
              cardUrl: f.cardKey === null ? null : urlDeMidia(f.cardKey),
              createdAt: f.createdAt,
            })),
          );
        }
        return saida;
      },
    },
  };

  const dependenciasDasRotasDeMidia = {
    midia: new MediaService({
      repositorio: repositorioDeMidia,
      // O ÚNICO lugar do sistema que instancia algo que sabe o que é S3.
      armazenamento: criarObjectStorage(config.objectStorage),
      ids,
      clock: systemClock,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
    // Hostname separado da origem da aplicação, desde o desenvolvimento: mídia
    // de usuário servida na mesma origem é XSS com acesso à sessão (ADR-0007).
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  const dependenciasDasRotasDeCaso = {
    casos: new LostCaseService({
      repositorio: criarLostCaseRepository(db),
      ids,
      clock: systemClock,
      trilha,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
    // De onde saem o link de compartilhar e o cartaz. Montados na leitura, e
    // nunca guardados: um link gravado carrega o domínio do dia em que foi
    // escrito, e o cartaz é impresso e colado num poste.
    baseDaWeb: config.publicBaseUrl,
  };

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

  // O webhook de entrega tambem mora FORA de `/v1`, porque e assim que o
  // contrato o declara (`servers:` proprio) e porque quem o chama e o provedor
  // de e-mail, nao o nosso app.
  //
  // Ligar aqui nao e detalhe: sem esta chamada a rota inteira seria codigo
  // morto -- a mesma familia de `invalidarTodasAsSessoes`, que este repositorio
  // ja registra como defeito. A sonda de `verificar_borda_local.py` reprova
  // enquanto a fiacao nao existir, entao o silencio nao era uma opcao.
  registrarRotaDoWebhookDeEntrega(app, {
    registro: criarRegistroDeEntregas(db, ids),
    segredo: config.mail.webhookSecret,
    contrato,
  });

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
      registrarRotasDeReferencia(escopo, criarReferenceDataRepository(db));
      registrarRotasDePets(escopo, dependenciasDasRotasDePet);
      registrarRotasDeMidia(escopo, dependenciasDasRotasDeMidia);
      registrarRotasDeCasos(escopo, dependenciasDasRotasDeCaso);
      registrarRotasDeTags(escopo, dependenciasDasRotasDeTag);
      registrarSaude(escopo, {
        version: config.version,
        // `version` e o mesmo `0.1.0` em qualquer build; `build` e o que
        // distingue um artefato do outro, e e por ele que os dois destinos sao
        // comparados (src/tools/comparar-destinos.ts).
        build,
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
