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
import type { VerificadorDeReautenticacao } from '../shared/http/registrar-rota.js';
import { dependenciasDoTeto } from '../shared/http/aplicacao-de-teto.js';
import { escoparRotas, inventarioDoQueNaoEAplicado } from '../shared/http/registrar-rota.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
  criarContadorEmPostgres,
} from '../shared/http/rate-limit.js';
import { rateLimitDriver } from '../shared/config/app-config.js';
import { vigiarIdempotenciaDasRotas } from '../shared/http/idempotency.js';
import { vigiarParametrosDasRotas } from '../shared/http/validacao-de-parametros.js';
import { registrarSaude } from '../shared/http/health.js';
import { identidadeDoArtefato } from '../shared/artefato/identidade-do-artefato.js';
import { criarTrilhaDeAuditoria } from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarLocalizacaoDeReferenciaRepository } from '../modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';
import { LocalizacaoDeReferenciaService } from '../modules/identity/application/localizacao-de-referencia-service.js';
import { registrarRotasDeLocalizacao } from '../modules/identity/adapters/http/localizacao-de-referencia-routes.js';
import { criarRegistroDeAparelhos } from '../modules/notifications/adapters/persistence/kysely-registro-de-aparelhos.js';
import { RegistroDeAparelhosService } from '../modules/notifications/application/registro-de-aparelhos-service.js';
import { registrarRotasDeAparelho } from '../modules/notifications/adapters/http/device-routes.js';
import {
  criarVerificadorDeReautenticacao,
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
import { criarAlcancePorPostGIS } from '../modules/lostfound/adapters/persistence/kysely-alcance-por-postgis.js';
import { criarRegistroDeDisparos } from '../modules/lostfound/adapters/persistence/kysely-registro-de-disparos.js';
import { criarFoundReportRepository } from '../modules/found/adapters/persistence/kysely-found-report-repository.js';
import { FoundReportService } from '../modules/found/application/found-report-service.js';
import { registrarRotasDeAchado } from '../modules/found/adapters/http/found-report-routes.js';
import { criarJobQueue } from '../shared/queue/kysely-job-queue.js';
import { criarIdempotencia } from '../shared/http/idempotency.js';
import { criarSecretCipher } from '../modules/tags/adapters/external/aes-gcm-secret-cipher.js';
import { criarRasterizadorDeQr } from '../modules/tags/adapters/external/sharp-rasterizador-de-qr.js';
import { criarTagRepository } from '../modules/tags/adapters/persistence/kysely-tag-repository.js';
import { criarTagService } from '../modules/tags/application/tag-service.js';
import { registrarRotasDeTags } from '../modules/tags/adapters/http/tag-routes.js';
import { criarConversationRepository } from '../modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import { ConversationService } from '../modules/messaging/application/conversation-service.js';
import { registrarRotasDeConversas } from '../modules/messaging/adapters/http/conversation-routes.js';
import { criarTransferRepository } from '../modules/transfers/adapters/persistence/kysely-transfer-repository.js';
import { PetTransferService } from '../modules/transfers/application/pet-transfer-service.js';
import { registrarRotasDeTransferencia } from '../modules/transfers/adapters/http/transfer-routes.js';
import {
  criarEmailVerificadoDoChamador,
  criarNomeDoPet,
} from '../modules/transfers/adapters/persistence/kysely-consultas-de-apoio.js';
import { criarDirectoryRepository } from '../modules/professionals/adapters/persistence/kysely-directory-repository.js';
import { registrarRotasDoDiretorio } from '../modules/professionals/adapters/http/directory-routes.js';
import { registrarRotasDaVitrine } from '../modules/store/adapters/http/store-routes.js';
import { criarStoreRepository } from '../modules/store/adapters/persistence/kysely-store-repository.js';

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

  // O CONTADOR DE TETO, que até 21/09 não era construído em lugar nenhum.
  //
  // Ele entra no servidor, e não em cada módulo de rota: `registrarRota` o lê do
  // próprio `app`, e com isso uma rota registrada sem teto deixa de ser
  // exprimível. Enquanto ele fosse uma dependência que cada módulo recebia,
  // esquecer de passá-lo em um deles seria uma linha a menos que ninguém
  // acusaria — que é a forma exata do defeito da BICHUS-178.
  //
  // `disabled` fora de `dev` não chega aqui: `assertSafeBoot` já derrubou.
  const driver = rateLimitDriver();
  const contador =
    driver === 'postgres'
      ? criarContadorEmPostgres(db, () => systemClock.now(), config.isProduction)
      : driver === 'memory'
        ? criarContadorEmMemoria(() => systemClock.now())
        : criarContadorDesligado();

  // O logger só existe depois do servidor, e o servidor precisa do teto: o
  // indireto abaixo resolve a ordem sem deixar um `console.log` no caminho nem
  // um teto sem log. Antes da primeira requisição ele já aponta para o logger.
  let registrarNoLog: (evento: Record<string, unknown>, mensagem: string) => void = () => {};

  // MESMO INDIRETO DO LOGGER, e pelo mesmo motivo de ordem: o verificador de
  // `X-Reauth-Token` precisa do serviço de identidade, que precisa do banco e
  // da trilha, que sao construidos abaixo -- e o servidor precisa existir antes
  // de qualquer rota ser registrada.
  //
  // O valor inicial LANCA, e nao e um `() => {}`. Um no-op aqui seria uma
  // porta destrutiva aberta caso a fiacao mudasse de ordem, e ela ficaria
  // aberta em silencio: nenhuma requisicao falharia, nenhuma senha seria
  // pedida, e o portao existiria so no nome. Verificacao que nao consegue
  // verificar precisa reprovar.
  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error(
      'Verificador de reautenticacao chamado antes de a fiacao das rotas de identidade ' +
        'terminar. Nenhuma requisicao devia alcancar este ponto: as rotas so sao registradas ' +
        'depois. Corrija a ordem em src/bin/api.ts em vez de afrouxar isto (BICHUS-48).',
    );
  };

  const app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: dependenciasDoTeto({
      contador,
      chaveDeHmac: config.ipHmacKey,
      log: (evento, mensagem) => {
        registrarNoLog(evento, mensagem);
      },
    }),
    reautenticacao: (request, escopo) => verificarReautenticacao(request, escopo),
  });

  registrarNoLog = (evento, mensagem) => {
    app.log.warn(evento, mensagem);
  };
  app.log.info({ rate_limit_driver: driver }, 'contador de teto de chamada ligado');

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
    // Desde 19/09 isto é `WEB_BASE_URL` e não mais o endereço deste processo:
    // apontar o link de verificação para a API mandaria o tutor para um JSON.
    baseDaWeb: config.webBaseUrl,
    // O log do serviço sai pelo logger do processo. O evento `email.send` do
    // cadastro (BICHUS-147 critério 2) é o que prova, em homologação, que o
    // caminho foi percorrido — e foi a ausência dele diante de um 201 que
    // identificou o defeito.
    registrarOcorrencia: (dados, mensagem) => {
      app.log.info(dados, mensagem);
    },
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
      // O aviso passou a emitir a credencial do "Nao fui eu" (BICHUS-215), e por
      // isso precisa do gerador e da base publica. O link e montado na HORA do
      // envio, nunca guardado.
      ids,
      baseDaWeb: config.webBaseUrl,
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

  // A partir daqui `X-Reauth-Token` e conferido de verdade. Quem o chama e
  // `registrarRota`, em toda rota que declara `reauthScope`.
  verificarReautenticacao = criarVerificadorDeReautenticacao(dependenciasDasRotas);

  // BICHUS-43. A conversa mediada. Declarada ANTES das tags porque o aviso da
  // plaquinha e o unico fato que abre uma conversa no produto: a linha
  // `conversaDoAviso`, abaixo, e a ligacao inteira entre os dois modulos, e ela
  // e obrigatoria por tipo -- um `criarTagService` sem ela nao compila.
  const conversas = new ConversationService({
    repositorio: criarConversationRepository(db),
    ids,
    clock: systemClock,
    trilha,
  });

  const tags = criarTagService({
    repositorio: criarTagRepository(db),
    cifra: criarSecretCipher(config.tagCodeKey),
    ids,
    clock: systemClock,
    trilha,
    // **Esta é a linha que vira plástico.** `baseDaTag` é o que o QR codifica
    // (`{base}/t/{código}`) e o ADR-0004 torna irreversível no instante em que
    // a primeira leva é prensada; `baseDaWeb` é a página do achador, que se
    // conserta trocando uma variável. Elas eram a MESMA variável até 19/09, e
    // com o cliente decidindo hosts diferentes para as duas, trocá-las aqui
    // passou a ser um defeito que só aparece com o adesivo na coleira de
    // alguém. `src/bin/fiacao-das-bases.test.ts` trava estas duas linhas por
    // texto, porque nada deste arquivo é carregado por teste.
    baseDaTag: config.tagBaseUrl,
    baseDaWeb: config.webBaseUrl,
    // `code_hash` é HMAC com esta chave, e não SHA-256 sem sal (ADR-0004,
    // Emenda 1, §3.1). Se ela for a mesma de `tagCodeKey`, `loadAppConfig()`
    // já recusou subir antes desta linha.
    chaveDoIndiceDoCodigo: config.tagCodeIndexKey,
    // O arquivo do QR. O que decide o que vira plástico está em
    // `domain/qr-da-tag.ts`; este adaptador só embrulha o desenho em PNG.
    rasterizador: criarRasterizadorDeQr(),
    // O modulo de tags nao conhece `conversations`: ele entrega os dados do
    // aviso a uma porta de um metodo so. Quem liga os dois e esta linha.
    conversaDoAviso: {
      aoRegistrarAviso: async (aviso) => {
        await conversas.abrirPorAviso(aviso);
      },
    },
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

  // BICHUS-92. A localizacao de referencia mora em `identity` porque `/me` e a
  // superficie dela e porque a tabela pende de `users`. Ela e a coluna
  // geografica que faltava para "tutores num raio de 5 km" ser calculavel. A
  // CONTAGEM continua com `criarAlcanceAindaSemBase`, agora por outro motivo --
  // ver a linha que a monta, abaixo.
  const dependenciasDasRotasDeLocalizacao = {
    localizacao: new LocalizacaoDeReferenciaService({
      repositorio: criarLocalizacaoDeReferenciaRepository(db),
      clock: systemClock,
      trilha,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  // BICHUS-91. O aparelho e o token de push moram em `notifications` e nao em
  // `identity`, mesmo o caminho sendo `/me`: o que a tabela guarda e o ENDERECO
  // DE ENTREGA do push, e quem o consome e o alerta. Esta linha e o unico lugar
  // do sistema que conhece os dois lados -- o modulo recebe um autenticador e
  // nao o servico de identidade, entao ele nao tem como devolver dado de conta
  // por engano. Mesmo arranjo de `tags`.
  //
  // O QUE ESTA FIACAO NAO FAZ, e a ausencia e deliberada: ela nao liga a
  // contagem do alcance. `criarAlcanceAindaSemBase` continua abaixo. Com a
  // BICHUS-92 e esta historia o calculo passou a ser POSSIVEL, e cinco dos sete
  // criterios do ADR-0006 (raio, validade, nao ser o proprio tutor, teto de
  // fadiga, um disparo por caso por dia) continuam sem consulta escrita --
  // ligar so os dois daqui devolveria um numero que ignora os outros cinco, que
  // e a mesma classe de mentira. Quem decide ligar e a BICHUS-20.
  const dependenciasDasRotasDeAparelho = {
    aparelhos: new RegistroDeAparelhosService({
      repositorio: criarRegistroDeAparelhos(db, ids),
      clock: systemClock,
      trilha,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
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

  // BICHUS-66. A transferencia de pet, declarada ANTES dos casos de perdido
  // porque a abertura de um caso CANCELA a transferencia viva daquele pet -- e
  // essa direcao e a decisao de desenho da historia, nao um detalhe de ordem.
  //
  // Por que o caso ganha: consumar com caso aberto revogaria todas as tags do
  // pet (ADR-0004, irreversivel) no minuto em que a plaquinha da coleira e a
  // unica coisa ligando o animal ao tutor. O contrato ja tinha escolhido esse
  // lado na direcao inversa (`startPetTransfer` responde 409 para pet com caso
  // aberto); aqui ele vale tambem quando o caso chega depois.
  const transferencias = new PetTransferService({
    repositorio: criarTransferRepository(db),
    ids,
    clock: systemClock,
    trilha,
    // O MESMO transporte do cadastro e da redefinicao de senha. O convite sai
    // SINCRONO e nao pela fila, porque o payload de `jobs` e gravado e o que
    // precisa chegar ao e-mail e o token em claro (ports/mailer.ts).
    mailer,
    // "O e-mail que esta conta PROVOU ser dela", e nao `users.email` cru: a
    // camada 2 da transferencia inteira depende de VERIFICADO. Sem isso,
    // bastaria cadastrar uma conta com o endereco do destinatario para aceitar
    // a transferencia dele.
    contas: criarEmailVerificadoDoChamador(db),
    // Nome lido na hora, nunca copiado para a linha da transferencia: uma copia
    // congelaria o nome que o pet tinha no dia do convite.
    pets: criarNomeDoPet(db),
    // So para AGENDAR a consumacao (`case.transfer_consummate`). O payload leva
    // identificador e nada mais -- nenhum token, nenhum endereco.
    fila: criarJobQueue(db, ids),
    baseDaWeb: config.webBaseUrl,
  });

  const dependenciasDasRotasDeCaso = {
    casos: new LostCaseService({
      repositorio: criarLostCaseRepository(db),
      ids,
      clock: systemClock,
      trilha,
      // BICHUS-20: **A CONTAGEM FECHOU.** Esta linha era
      // `criarAlcanceAindaSemBase()`, que devolvia `null` de proposito porque
      // os sete criterios do ADR-0006 nao tinham todos onde ser consultados.
      // Agora tem: localizacao com a BICHUS-92, aparelho com a BICHUS-91, e a
      // memoria do disparo (`alert_dispatches`, `alert_recipients`) com esta
      // historia. Os SETE estao escritos -- seis no `WHERE` da consulta, o
      // setimo em `podeDispararDeNovo`, que e pergunta sobre o caso e nao
      // sobre pessoas (o argumento esta no cabecalho da porta).
      //
      // Ligar so parte deles era o que os autores da 92 e da 91 se recusaram a
      // fazer, e estavam certos: numero errado com cara de certo e a mesma
      // classe de mentira que o zero inventado.
      alcance: criarAlcancePorPostGIS(db),
      disparos: criarRegistroDeDisparos(db),
      // A API ENFILEIRA, O WORKER ENVIA. O remetente de push nao e montado
      // aqui de proposito -- `fiacao-do-push.test.ts` reprova se ele for --, e
      // esta e a outra metade daquela decisao: o que a API faz com o alerta e
      // pedir que ele saia.
      fila: criarJobQueue(db, ids),
      // BICHUS-66: a porta de UM metodo. Ver o bloco de `transferencias`, acima.
      transferencias,
      // BICHUS-86 criterio 4. **ESTA LINHA e a ligacao entre a decisao humana e
      // a conversa mediada**, e e o unico lugar do sistema que conhece os dois
      // lados. O modulo do caso perdido nao conhece `conversations`: ele entrega
      // os dados do achado confirmado a uma porta de um metodo so.
      //
      // Do outro lado esta `abrirPorAviso`, o MESMO metodo que a plaquinha usa.
      // Ele e indiferente a origem do achado de proposito: o que muda entre os
      // dois caminhos e QUANDO a conversa nasce (o QR abre ao registrar, o
      // achado avulso abre no portao da decisao), e nao COMO.
      conversaDaCorrespondencia: {
        aoConfirmarCorrespondencia: async (aviso) => {
          await conversas.abrirPorAviso(aviso);
        },
      },
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
    //
    // `WEB_BASE_URL` e não `TAG_BASE_URL`: o cartaz do caso é uma PÁGINA do
    // time web (ADR-0017 item 1), e o papel colado no poste se arranca e se
    // reimprime. Só a plaquinha da coleira é irreversível.
    baseDaWeb: config.webBaseUrl,
  };

  // BICHUS-35. O achado avulso mora em `found` e nao em `lostfound` porque ele e
  // o outro lado da mesma moeda: `lostfound` e quem PERDEU, `found` e quem
  // ACHOU, e as duas superficies sao lidas por pessoas diferentes, com
  // autorizacoes diferentes. O que liga as duas e `match_candidates`, e ele so
  // carrega sugestao -- nunca decisao.
  //
  // `armazenamento` e uma segunda instancia do MESMO adaptador que `media` usa,
  // e nao um caminho novo: a foto do achador segue o desenho do ADR-0007 igual a
  // do pet, com outro prefixo de chave, outro teto de bytes e outra retencao.
  const dependenciasDasRotasDeAchado = {
    achados: new FoundReportService({
      repositorio: criarFoundReportRepository(db),
      armazenamento: criarObjectStorage(config.objectStorage),
      // O cruzamento por atributos e ENFILEIRADO, nunca sincrono na requisicao
      // (secao 4.10). O que roda na hora e so o vinculo direto do criterio 10,
      // que nao e cruzamento.
      fila: criarJobQueue(db, ids),
      ids,
      clock: systemClock,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
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
    // `API_BASE_URL`, porque `qr_png_url` é rota DESTA API. `TAG_BASE_URL` é o
    // que vai impresso na coleira e `fiacao-das-bases.test.ts` trava aquela
    // linha; esta é a terceira base e não se confunde com nenhuma das duas.
    baseDaApi: config.apiBaseUrl,
    ipHmacKey: config.ipHmacKey,
    chaveDoIndiceDoCodigo: config.tagCodeIndexKey,
  };

  // Precisa vir ANTES do registro das rotas: o gancho `onRoute` só enxerga o
  // que for registrado depois dele. A conferência em si roda no fim, quando
  // todas as rotas já existem.
  const conferirIdempotencia = vigiarIdempotenciaDasRotas(app, contrato, PREFIXO_DA_API);
  // Mesmo par, mesma razao: o gancho `onRoute` so enxerga o que vem depois
  // dele, e a conferencia so faz sentido quando todas as rotas ja existem. E
  // ele que instala `schema.params` e `schema.querystring` a partir do
  // contrato, entao nenhuma rota registrada abaixo precisa lembrar de declarar.
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, PREFIXO_DA_API);

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

  // `escoparRotas` e nao `app.register` cru: o `escopo` que o framework entrega
  // e o servidor INTEIRO, e um `escopo.post(...)` aqui dentro compilava sem que
  // nada acusasse -- foi por este furo que a BICHUS-178 passou. O registrador
  // que chega aqui nao tem metodo de registro nenhum, entao a chamada direta
  // deixou de ser exprimivel, e nao depende de o portao lembrar deste nome.
  await escoparRotas(app, PREFIXO_DA_API, (escopo) => {
    registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
    registrarRotasDeReferencia(escopo, criarReferenceDataRepository(db));
    registrarRotasDoDiretorio(escopo, {
      diretorio: criarDirectoryRepository(db),
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      clock: systemClock,
    });
    registrarRotasDaVitrine(escopo, { vitrine: criarStoreRepository(db), clock: systemClock });
    registrarRotasDePets(escopo, dependenciasDasRotasDePet);
    registrarRotasDeLocalizacao(escopo, dependenciasDasRotasDeLocalizacao);
    registrarRotasDeAparelho(escopo, dependenciasDasRotasDeAparelho);
    registrarRotasDeMidia(escopo, dependenciasDasRotasDeMidia);
    registrarRotasDeCasos(escopo, dependenciasDasRotasDeCaso);
    registrarRotasDeAchado(escopo, dependenciasDasRotasDeAchado);
    registrarRotasDeTags(escopo, dependenciasDasRotasDeTag);
    registrarRotasDeTransferencia(escopo, {
      transferencias,
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      contrato,
      idempotencia: criarIdempotencia(db),
      clock: systemClock,
    });
    registrarRotasDeConversas(escopo, {
      conversas,
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      contrato,
      idempotencia: criarIdempotencia(db),
      clock: systemClock,
    });
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
  });

  // Rota que o contrato declara idempotente e que não passa pela idempotência
  // derruba a subida aqui, e não no segundo envio de um cliente offline, que é
  // onde o defeito apareceria sozinho.
  conferirIdempotencia();
  // Parametro de caminho sem validacao chegava ao Postgres e voltava 500.
  // Rota sem operacao no contrato, rota que declara o schema por conta propria
  // e operacao que pode recusar sem 400 declarado derrubam a subida aqui.
  conferirParametros();

  // O QUE O TETO NAO APLICA, DITO EM VOZ ALTA.
  //
  // `counts: distinct_*` conta valores distintos e `when:` condiciona o teto ao
  // estado do pet: nenhum dos dois é exprimível pela porta `RateLimitStore` de
  // hoje. Aplicar o que dá e calar sobre o resto seria repetir, uma camada
  // abaixo, o defeito que esta subida acabou de fechar — uma proteção que se
  // acredita existir. A lista sai no log, por operação e com o motivo.
  const fora = inventarioDoQueNaoEAplicado();
  if (fora.length > 0) {
    app.log.warn(
      { total: fora.length },
      'entradas de x-rate-limit declaradas e NAO aplicadas por esta versao',
    );
    for (const item of fora) {
      app.log.warn(
        { operation_id: item.operationId, dimension: item.entrada.dimension, motivo: item.motivo },
        'teto declarado e nao aplicado',
      );
    }
  }

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
