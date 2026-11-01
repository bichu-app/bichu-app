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
import { registrarRotaDoVereditoDeVersao } from '../modules/app-release/adapters/http/version-status-routes.js';
import { criarLeituraDaPoliticaDeVersao } from '../modules/app-release/adapters/persistence/kysely-politica-de-versao.js';
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
import { registrarRotasDaCaixaDeNotificacoes } from '../modules/notifications/adapters/http/caixa-de-notificacoes-routes.js';
import { registrarRotasDosContadoresDeSecao } from '../modules/sections/adapters/http/section-counter-routes.js';
import { registrarRotasDeAjuda } from '../modules/support/adapters/http/help-request-routes.js';
import { criarDuvidaDeAjudaService } from '../modules/support/application/duvida-de-ajuda-service.js';
import { criarDuvidasDeAjuda } from '../modules/support/adapters/persistence/kysely-duvidas-de-ajuda.js';
import { registrarRotasDaFilaDeAjuda } from '../modules/support/adapters/http/admin-help-request-routes.js';
import { criarFilaDeAjudaService } from '../modules/support/application/fila-de-ajuda-service.js';
import { criarContadoresDeSecaoService } from '../modules/sections/application/contadores-de-secao-service.js';
import { criarMarcadoresDeSecao } from '../modules/sections/adapters/persistence/kysely-marcadores-de-secao.js';
import { criarContagemDePerdidosNovos } from '../modules/lostfound/adapters/persistence/kysely-contagem-de-perdidos-novos.js';
import { criarContagemDeEventosNovos } from '../modules/network/adapters/persistence/kysely-contagem-de-eventos-novos.js';
import { criarContagemDeEntradasNovas } from '../modules/professionals/adapters/persistence/kysely-contagem-de-entradas-novas.js';
import { registrarRotasDeComunicado } from '../modules/notifications/adapters/http/admin-comunicado-routes.js';
import { criarCaixaDeNotificacoes } from '../modules/notifications/adapters/persistence/kysely-caixa-de-notificacoes.js';
import { criarRepositorioDeComunicados } from '../modules/notifications/adapters/persistence/kysely-comunicados.js';
import { CaixaDeNotificacoesService } from '../modules/notifications/application/caixa-de-notificacoes-service.js';
import { ComunicadosAdministrativos } from '../modules/notifications/application/comunicados-administrativos.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeDescoberta,
  registrarRotasDeIdentidade,
} from '../modules/identity/adapters/http/routes.js';
import {
  registrarRotasDePasskey,
} from '../modules/identity/adapters/http/passkey-routes.js';
import { PasskeyService } from '../modules/identity/application/passkey-service.js';
import { KyselyPasskeyRepository } from '../modules/identity/adapters/persistence/kysely-passkey-repository.js';
import { criarAuthService } from '../modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../modules/identity/application/aviso-de-reuso.js';
import { criarReferenceDataRepository } from '../modules/pets/adapters/persistence/kysely-reference-data-repository.js';
import { registrarRotasDeReferencia } from '../modules/pets/adapters/http/reference-data-routes.js';
import { criarPetRepository } from '../modules/pets/adapters/persistence/kysely-pet-repository.js';
import { PetService } from '../modules/pets/application/pet-service.js';
import { registrarRotasDePets } from '../modules/pets/adapters/http/pet-routes.js';
import { registrarRotaDoPerfilPublico } from '../modules/pets/adapters/http/perfil-publico-routes.js';
import { criarLeituraDoPerfilPublico } from '../modules/pets/adapters/persistence/kysely-perfil-publico.js';
import { criarMediaRepository } from '../modules/media/adapters/persistence/kysely-media-repository.js';
import type { FotoResumida } from '../modules/pets/ports/fotos-do-pet.js';
import type { AbsoluteUrl, PetId } from '../shared/types/brands.js';
import { comoObjectKey } from '../modules/media/domain/chave-de-objeto.js';
import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { MediaService } from '../modules/media/application/media-service.js';
import { registrarRotasDeMidia } from '../modules/media/adapters/http/media-routes.js';
import { registrarRotasDaVitrineDeFotos } from '../modules/showcase/adapters/http/showcase-routes.js';
import { registrarRotasDoMural } from '../modules/publications/adapters/http/publicacao-routes.js';
import { Mural } from '../modules/publications/application/mural-service.js';
import { criarPublicacoesRepository } from '../modules/publications/adapters/persistence/kysely-publicacoes.js';
import { VitrineDeFotos } from '../modules/showcase/application/vitrine-de-fotos-service.js';
import { criarVitrineRepository } from '../modules/showcase/adapters/persistence/kysely-vitrine.js';
import { criarLostCaseRepository } from '../modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import { criarDisponibilidadeDaPagina } from '../modules/lostfound/adapters/persistence/kysely-disponibilidade-da-pagina.js';
import { LostCaseService } from '../modules/lostfound/application/lost-case-service.js';
import { registrarRotasDeCasos } from '../modules/lostfound/adapters/http/lost-case-routes.js';
import { registrarRotasDaLeituraPublicaDoCaso } from '../modules/lostfound/adapters/http/leitura-publica-do-caso-routes.js';
import { registrarRotaDaListagemDePerdidos } from '../modules/lostfound/adapters/http/listagem-publica-de-perdidos-routes.js';
import { criarListagemPublicaDePerdidos } from '../modules/lostfound/adapters/persistence/kysely-listagem-publica-de-perdidos.js';
import { ListagemPublicaDePerdidosService } from '../modules/lostfound/application/listagem-publica-de-perdidos.js';
import { criarLeituraPublicaDoCaso } from '../modules/lostfound/adapters/persistence/kysely-leitura-publica-do-caso.js';
import { LeituraPublicaDoCasoService } from '../modules/lostfound/application/leitura-publica-do-caso.js';
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
import { criarPedidoDePlaquinhaRepository } from '../modules/tags/adapters/persistence/kysely-pedido-de-plaquinha.js';
import {
  FilaDePlaquinhasAdministrativa,
  PedidoDePlaquinhaService,
} from '../modules/tags/application/pedido-de-plaquinha-service.js';
import { registrarRotaDePedidoDePlaquinha } from '../modules/tags/adapters/http/pedido-de-plaquinha-routes.js';
import { registrarRotasDoEnderecoGuardado } from '../modules/tags/adapters/http/endereco-guardado-routes.js';
import { KyselyEnderecoGuardado } from '../modules/tags/adapters/persistence/kysely-endereco-guardado.js';
import { registrarRotasDoEnderecoDoPet } from '../modules/tags/adapters/http/endereco-do-pet-routes.js';
import { criarEnderecoDoPetRepository } from '../modules/tags/adapters/persistence/kysely-endereco-do-pet.js';
import { registrarRotasDaFilaDePlaquinhas } from '../modules/tags/adapters/http/admin-pedido-de-plaquinha-routes.js';
import { criarConversationRepository } from '../modules/messaging/adapters/persistence/kysely-conversation-repository.js';
import { criarFotoDaConversa } from '../modules/messaging/adapters/persistence/kysely-foto-da-conversa.js';
import { VALIDADE_DA_URL_DA_FOTO_EM_SEGUNDOS } from '../modules/messaging/domain/leitura-da-foto.js';
import { ConversationService } from '../modules/messaging/application/conversation-service.js';
import { registrarRotasDeConversas } from '../modules/messaging/adapters/http/conversation-routes.js';
import { ConversaDoAchadorService } from '../modules/messaging/application/conversa-do-achador.js';
import { registrarRotasDoAchador } from '../modules/messaging/adapters/http/finder-conversation-routes.js';
import { AvisoDoAchadorService } from '../modules/found/application/aviso-do-achador.js';
import { registrarRotasDoAvisoDoAchador } from '../modules/found/adapters/http/finder-found-report-routes.js';
import { criarTransferRepository } from '../modules/transfers/adapters/persistence/kysely-transfer-repository.js';
import { PetTransferService } from '../modules/transfers/application/pet-transfer-service.js';
import { registrarRotasDeTransferencia } from '../modules/transfers/adapters/http/transfer-routes.js';
import {
  criarEmailVerificadoDoChamador,
  criarNomeDoPet,
} from '../modules/transfers/adapters/persistence/kysely-consultas-de-apoio.js';
import { criarDirectoryRepository } from '../modules/professionals/adapters/persistence/kysely-directory-repository.js';
import { criarDirectorySuggestionRepository } from '../modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.js';
import { criarCanalDeContatoDoChamador } from '../modules/professionals/adapters/persistence/kysely-canal-verificado-do-chamador.js';
import { registrarRotasDoDiretorio } from '../modules/professionals/adapters/http/directory-routes.js';
import { registrarRotasDoDiretorioAdministrativo } from '../modules/professionals/adapters/http/admin-directory-routes.js';
import { registrarRotasDeSeguranca } from '../modules/safety/adapters/http/safety-routes.js';
import { SegurancaDaComunidade } from '../modules/safety/application/seguranca-da-comunidade.js';
import { criarSafetyRepository } from '../modules/safety/adapters/persistence/kysely-safety-repository.js';
import { registrarRotaDeBuscaDeCep } from '../modules/addresses/adapters/http/postal-code-routes.js';
import { criarBuscaDeCep } from '../modules/addresses/adapters/external/viacep-com-brasilapi.js';
import { criarDiretorioAdministrativoRepository } from '../modules/professionals/adapters/persistence/kysely-diretorio-administrativo.js';
import { DiretorioAdministrativo } from '../modules/professionals/application/diretorio-administrativo.js';
import {
  registrarRotaDasMinhasIndicacoes,
  registrarRotaDeSugestaoDoDiretorio,
} from '../modules/professionals/adapters/http/directory-suggestion-routes.js';
import { registrarRotasDaFilaDeIndicacoes } from '../modules/professionals/adapters/http/admin-directory-suggestion-routes.js';
import { registrarRotasDaFilaDeModeracao } from '../modules/moderation/adapters/http/admin-moderation-routes.js';
import { criarFilaDeModeracaoRepository } from '../modules/moderation/adapters/persistence/kysely-fila-de-moderacao.js';
import { FilaDeModeracao } from '../modules/moderation/application/fila-de-moderacao.js';
import { criarFilaDeIndicacoesRepository } from '../modules/professionals/adapters/persistence/kysely-fila-de-indicacoes.js';
import { FilaDeIndicacoes } from '../modules/professionals/application/fila-de-indicacoes.js';
import { SugestaoDoDiretorio } from '../modules/professionals/application/sugestao-do-diretorio.js';
import { errosDeTextoDeUsuario } from '../modules/network/domain/encontro-da-comunidade.js';
import { handleDoInstagram } from '../modules/network/domain/escrita-do-encontro.js';
import { registrarRotasDaVitrine } from '../modules/store/adapters/http/store-routes.js';
import { criarStoreRepository } from '../modules/store/adapters/persistence/kysely-store-repository.js';
import { criarTaxonomiaDaVitrineRepository } from '../modules/store/adapters/persistence/kysely-taxonomia-da-vitrine.js';
import {
  criarContagemNaTrilha,
  criarEscritaAuditada,
  criarTrilhaTransacional,
} from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { escoparRotasAdministrativas } from '../shared/http/superficie-administrativa.js';
import { criarSessaoAdministrativaRepository } from '../modules/admin-access/adapters/persistence/kysely-sessao-administrativa-repository.js';
import { criarRepositorioDeContasAdministrativas } from '../modules/admin-access/adapters/persistence/kysely-contas-administrativas.js';
import { criarSessaoAdministrativaService } from '../modules/admin-access/application/sessao-administrativa-service.js';
import { registrarRotasDaSessaoAdministrativa } from '../modules/admin-access/adapters/http/admin-session-routes.js';
import { registrarRotasDaLojaAdministrativa } from '../modules/store/adapters/http/admin-store-routes.js';
import { registrarRotasDaRedeAdministrativa } from '../modules/network/adapters/http/admin-network-routes.js';
import { RedeAdministrativa } from '../modules/network/application/rede-administrativa.js';
import { criarRedeAdministrativaRepository } from '../modules/network/adapters/persistence/kysely-rede-administrativa.js';
import { criarAvisoAosAdministradores } from '../modules/network/adapters/external/aviso-aos-administradores-por-email.js';
import { CatalogoAdministrativo } from '../modules/store/application/catalogo-administrativo.js';
import { criarCatalogoAdministrativoRepository } from '../modules/store/adapters/persistence/kysely-catalogo-administrativo.js';
import { registroDeImagemDeCatalogo } from '../modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import { criarPreparadorDeEnvioDeCatalogo } from '../modules/media/application/preparar-envio-de-catalogo.js';
import { CapaDeEncontroDaComunidade } from '../modules/media/application/capa-de-encontro-da-comunidade.js';
import { LogotipoDaIndicacao } from '../modules/media/application/logotipo-da-indicacao.js';
import { FotoDaIndicacao } from '../modules/media/application/foto-da-indicacao.js';
import {
  registrarIntencaoDeCapaDaComunidade,
  registrarIntencaoDoLogotipoDaIndicacao,
  registrarIntencaoDaFotoDaIndicacao,
  registrarIntencaoDaVitrineDoUsuario,
  registrarIntencaoDeFotoDoUsuario,
  registrarIntencaoDaFotoDaPublicacao,
} from '../modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import { FotoDoProprioUsuario } from '../modules/media/application/foto-do-proprio-usuario.js';
import { criarVerificadorDeCaptcha } from '../modules/admin-access/adapters/external/recaptcha-enterprise.js';
import {
  captchaDeDesenvolvimentoLigado,
  captchaDeDesenvolvimentoLocal,
} from '../modules/admin-access/adapters/external/captcha-de-desenvolvimento-local.js';
import { criarListaDeSenhasVazadasPorFaixa } from '../modules/identity/adapters/external/lista-de-senhas-vazadas-por-faixa.js';
import { registrarRotasDaRede } from '../modules/network/adapters/http/network-routes.js';
import { registrarRotasDeConexao } from '../modules/connections/adapters/http/connection-routes.js';
import { ConexaoEntrePessoas } from '../modules/connections/application/conexao-entre-pessoas.js';
import { criarConnectionsRepository } from '../modules/connections/adapters/persistence/kysely-connections-repository.js';
import { semBloqueioConhecido } from '../modules/connections/ports/leitor-de-bloqueio.js';
import { criarLeitorDeConexao } from '../modules/connections/application/leitor-de-conexao.js';
import {
  criarEmissorDeConvite,
  criarResolvedorDeApelido,
  criarResolvedorDeConvite,
} from '../modules/connections/adapters/persistence/kysely-convites.js';
import { ConviteDoPerfil } from '../modules/connections/application/convite-do-perfil.js';
import { registrarRotasDeConvite } from '../modules/connections/adapters/http/invite-routes.js';
import { registrarRotasDePessoa } from '../modules/people/adapters/http/person-profile-routes.js';
import { PerfilDePessoa } from '../modules/people/application/perfil-de-pessoa.js';
import { criarPerfilDePessoaRepository } from '../modules/people/adapters/persistence/kysely-perfil-de-pessoa.js';
import { registrarRotasDeBuscaDePessoas } from '../modules/people/adapters/http/people-search-routes.js';
import { BuscaDePessoas } from '../modules/people/application/busca-de-pessoas.js';
import { criarBuscaDePessoasRepository } from '../modules/people/adapters/persistence/kysely-busca-de-pessoas.js';
import { criarNetworkRepository } from '../modules/network/adapters/persistence/kysely-network-repository.js';
import { EncontroDaComunidade } from '../modules/network/application/encontro-da-comunidade.js';

const PREFIXO_DA_API = '/v1';

export async function main(): Promise<void> {
  assertSafeBoot();

  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));

  const config = loadAppConfig();
  const build = identidadeDoArtefato();
  const contrato = carregarContrato(config.openapiSpecPath);

  const banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  const driver = rateLimitDriver();
  const contador =
    driver === 'postgres'
      ? criarContadorEmPostgres(db, () => systemClock.now(), config.isProduction)
      : driver === 'memory'
        ? criarContadorEmMemoria(() => systemClock.now())
        : criarContadorDesligado();

  let registrarNoLog: (evento: Record<string, unknown>, mensagem: string) => void = () => {};

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
      app.log.error({ err: erro, action: evento.action }, 'trilha de auditoria não gravou');
    },
  });

  const repositorioDeIdentidade = criarIdentityRepository(db, ids);
  const mailer = criarMailer(config.mail);
  const repositorioDeLocalizacao = criarLocalizacaoDeReferenciaRepository(db);

  const aparelhos = new RegistroDeAparelhosService({
    repositorio: criarRegistroDeAparelhos(db, ids),
    clock: systemClock,
    trilha,
  });

  const auth = criarAuthService({
    urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
    repositorio: repositorioDeIdentidade,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    apagarLocalizacaoDaSessao: (dono, familia) => repositorioDeLocalizacao.apagar(dono, familia),
    mailer,
    removerPushDaConta: (dono) => aparelhos.removerTodosDaConta(dono),
    baseDaWeb: config.webBaseUrl,
    registrarOcorrencia: (dados, mensagem) => {
      app.log.info(dados, mensagem);
    },
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio: repositorioDeIdentidade,
      mailer,
      ids,
      baseDaWeb: config.webBaseUrl,
      registrarOcorrencia: (dados, mensagem) => {
        app.log.warn(dados, mensagem);
      },
    }),
  });

  const escritaAuditada = criarEscritaAuditada({
    db,
    trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
  });

  const catalogoAdministrativo = new CatalogoAdministrativo({
    repositorio: criarCatalogoAdministrativoRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      imagens: registroDeImagemDeCatalogo,
    }),
    envios: criarPreparadorDeEnvioDeCatalogo({ armazenamento: criarObjectStorage(config.objectStorage), ids }),
    ids,
    clock: systemClock,
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

  const redeAdministrativa = new RedeAdministrativa({
    repositorio: criarRedeAdministrativaRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      contagem: criarContagemNaTrilha(),
      imagens: registroDeImagemDeCatalogo,
    }),
    avisos: criarAvisoAosAdministradores({
      db,
      mailer,
      registrarOcorrencia: (dados, mensagem) => app.log.error(dados, mensagem),
    }),
    ids,
    clock: systemClock,
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
    baseDoPerfilDoInstagram: config.instagramProfileBaseUrl,
    registrarOcorrencia: (dados, mensagem) => app.log.error(dados, mensagem),
  });

  const diretorioAdministrativo = new DiretorioAdministrativo({
    repositorio: criarDiretorioAdministrativoRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      imagens: registroDeImagemDeCatalogo,
    }),
    ids,
    clock: systemClock,
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

  const filaDeIndicacoes = new FilaDeIndicacoes({
    repositorio: criarFilaDeIndicacoesRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      imagens: registroDeImagemDeCatalogo,
    }),
    ids,
    clock: systemClock,
    conferencias: { errosDeTextoDeUsuario, handleDoInstagram },
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

  const filaDeModeracao = new FilaDeModeracao({
    repositorio: criarFilaDeModeracaoRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
    }),
    clock: systemClock,
    conferencias: { errosDeTextoDeUsuario },
  });

  const sessaoAdministrativa = criarSessaoAdministrativaService({
    sessoes: criarSessaoAdministrativaRepository(db),
    contas: criarRepositorioDeContasAdministrativas(db),
    escrita: escritaAuditada,
    trilha,
    contagem: criarContagemNaTrilha(),
    captcha: captchaDeDesenvolvimentoLigado(optionalEnv('CAPTCHA_DESENVOLVIMENTO_LOCAL'))
      ? captchaDeDesenvolvimentoLocal
      : criarVerificadorDeCaptcha({
          transporte: optionalEnv('CAPTCHA_TRANSPORT'),
          siteKey: optionalEnv('CAPTCHA_SITE_KEY'),
          projeto: optionalEnv('CAPTCHA_PROJECT'),
        }),
    senhasVazadas: criarListaDeSenhasVazadasPorFaixa(),
    avisos: mailer,
    ids,
    clock: systemClock,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    origemDoPainel: config.adminOrigin ?? '',
    registrarOcorrencia: (dados, mensagem) => {
      app.log.warn(dados, mensagem);
    },
  });

  const dependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
    urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  };

  verificarReautenticacao = criarVerificadorDeReautenticacao(dependenciasDasRotas);

  const conversas = new ConversationService({
    repositorio: criarConversationRepository(db),
    fotos: criarFotoDaConversa(db),
    ids,
    clock: systemClock,
    trilha,
  });

  const conversaDoAchador = new ConversaDoAchadorService({
    repositorio: criarConversationRepository(db),
    fotos: criarFotoDaConversa(db),
    ids,
    clock: systemClock,
    trilha,
  });

  const assinarFotoDaConversa = (chave: string): Promise<AbsoluteUrl> =>
    criarObjectStorage(config.objectStorage).getSignedReadUrl(
      'privado',
      comoObjectKey(chave),
      VALIDADE_DA_URL_DA_FOTO_EM_SEGUNDOS,
    );

  const tags = criarTagService({
    repositorio: criarTagRepository(db),
    cifra: criarSecretCipher(config.tagCodeKey),
    ids,
    clock: systemClock,
    trilha,
    baseDaTag: config.tagBaseUrl,
    baseDaWeb: config.webBaseUrl,
    baseDeMidia: config.mediaPublicBaseUrl,
    chaveDoIndiceDoCodigo: config.tagCodeIndexKey,
    rasterizador: criarRasterizadorDeQr(),
    conversaDoAviso: {
      aoRegistrarAviso: async (aviso) => {
        await conversas.abrirPorAviso({ ...aviso, especie: 'scan_notice' });
      },
    },
    fila: criarJobQueue(db, ids),
  });

  const repositorioDeMidia = criarMediaRepository(db);

  const urlDeMidia = (chave: string): string =>
    `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`;

  const dependenciasDasRotasDePet = {
    pets: new PetService({
      repositorio: criarPetRepository(db),
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
              rejectionReason: f.rejectionReason,
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

  const dependenciasDasRotasDeLocalizacao = {
    localizacao: new LocalizacaoDeReferenciaService({
      repositorio: repositorioDeLocalizacao,
      clock: systemClock,
      trilha,
    }),
    autenticador: {
      autenticar: async (token: string) => {
        const { conta, sid } = await auth.autenticar(token);
        return { userId: conta.id, sid };
      },
    },
    contrato,
  };

  const dependenciasDasRotasDeAparelho = {
    aparelhos,
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  const dependenciasDasRotasDaCaixa = {
    caixa: new CaixaDeNotificacoesService({ caixa: criarCaixaDeNotificacoes(db) }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  const dependenciasDasRotasDosContadores = {
    contadores: criarContadoresDeSecaoService({
      marcadores: criarMarcadoresDeSecao(db),
      perdidos: criarContagemDePerdidosNovos(db),
      eventos: criarContagemDeEventosNovos(db),
      diretorio: criarContagemDeEntradasNovas(db),
      clock: systemClock,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  const duvidasDeAjuda = criarDuvidasDeAjuda(db, ids, escritaAuditada);
  const dependenciasDasRotasDaFilaDeAjuda = {
    fila: criarFilaDeAjudaService(duvidasDeAjuda, systemClock),
  };
  const dependenciasDasRotasDeAjuda = {
    duvidas: criarDuvidaDeAjudaService(duvidasDeAjuda, systemClock),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  const comunicadosAdministrativos = new ComunicadosAdministrativos({
    repositorio: criarRepositorioDeComunicados(db),
    escrita: escritaAuditada,
  });

  const dependenciasDasRotasDaVitrineDeFotos = {
    vitrine: new VitrineDeFotos({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      vitrine: criarVitrineRepository(db, ids),
      registrarIntencao: registrarIntencaoDaVitrineDoUsuario,
      db,
      clock: systemClock,
    }),
    autenticador: dependenciasDasRotasDePet.autenticador,
    contrato,
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  const dependenciasDasRotasDoMural = {
    mural: new Mural({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      publicacoes: criarPublicacoesRepository(db, ids),
      registrarIntencao: registrarIntencaoDaFotoDaPublicacao,
      db,
      ids,
      clock: systemClock,
    }),
    autenticador: dependenciasDasRotasDePet.autenticador,
    contrato,
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  const dependenciasDasRotasDeMidia = {
    capasDeEncontro: new CapaDeEncontroDaComunidade({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDeCapaDaComunidade,
      db,
      ids,
    }),
    fotosDoUsuario: new FotoDoProprioUsuario({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDeFotoDoUsuario,
      db,
      ids,
    }),
    logotiposDeIndicacao: new LogotipoDaIndicacao({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDoLogotipoDaIndicacao,
      db,
    }),
    fotosDeIndicacao: new FotoDaIndicacao({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDaFotoDaIndicacao,
      db,
    }),
    midia: new MediaService({
      repositorio: repositorioDeMidia,
      armazenamento: criarObjectStorage(config.objectStorage),
      ids,
      clock: systemClock,
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  const transferencias = new PetTransferService({
    repositorio: criarTransferRepository(db),
    ids,
    clock: systemClock,
    trilha,
    mailer,
    contas: criarEmailVerificadoDoChamador(db),
    pets: criarNomeDoPet(db),
    fila: criarJobQueue(db, ids),
    baseDaWeb: config.webBaseUrl,
  });

  const dependenciasDasRotasDeCaso = {
    casos: new LostCaseService({
      repositorio: criarLostCaseRepository(db),
      ids,
      clock: systemClock,
      trilha,
      alcance: criarAlcancePorPostGIS(db),
      disparos: criarRegistroDeDisparos(db),
      fila: criarJobQueue(db, ids),
      transferencias,
      conversaDaCorrespondencia: {
        aoConfirmarCorrespondencia: async (aviso) => {
          await conversas.abrirPorAviso({ ...aviso, especie: 'found_notice' });
        },
      },
    }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
    baseDaWeb: config.webBaseUrl,
    paginas: criarDisponibilidadeDaPagina(db),
  };

  const dependenciasDasRotasDeAchado = {
    achados: new FoundReportService({
      repositorio: criarFoundReportRepository(db),
      armazenamento: criarObjectStorage(config.objectStorage),
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
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  const avisoDoAchador = new AvisoDoAchadorService({
    repositorio: criarFoundReportRepository(db),
    conversa: conversaDoAchador,
    armazenamento: criarObjectStorage(config.objectStorage),
    ids,
    clock: systemClock,
    baseDaWeb: config.webBaseUrl,
  });

  const dependenciasDasRotasDeTag = {
    tags,
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    idempotencia: criarIdempotencia(db),
    contrato,
    clock: systemClock,
    baseDaApi: config.apiBaseUrl,
    ipHmacKey: config.ipHmacKey,
    chaveDoIndiceDoCodigo: config.tagCodeIndexKey,
  };

  const repositorioDePedidosDePlaquinha = criarPedidoDePlaquinhaRepository({ db });
  const pedidosDePlaquinha = new PedidoDePlaquinhaService({
    repositorio: repositorioDePedidosDePlaquinha,
    ids,
  });
  const filaDePlaquinhas = new FilaDePlaquinhasAdministrativa({
    repositorio: repositorioDePedidosDePlaquinha,
    escrita: escritaAuditada,
    clock: systemClock,
  });

  const conferirIdempotencia = vigiarIdempotenciaDasRotas(app, contrato, PREFIXO_DA_API);
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, PREFIXO_DA_API);

  registrarRotasDeDescoberta(app, dependenciasDasRotas);

  registrarRotaDoWebhookDeEntrega(app, {
    registro: criarRegistroDeEntregas(db, ids),
    segredo: config.mail.webhookSecret,
    contrato,
  });

  await escoparRotas(app, PREFIXO_DA_API, (escopo) => {
    registrarRotasDeIdentidade(escopo, dependenciasDasRotas);
    registrarRotasDePasskey(escopo, {
      auth,
      contrato,
      passkeys: new PasskeyService({
        repositorio: new KyselyPasskeyRepository(db),
        clock: systemClock,
        ids,
        trilha,
        rp: config.passkey,
      }),
    });
    registrarRotasDeReferencia(escopo, criarReferenceDataRepository(db));
    registrarRotasDoDiretorio(escopo, {
      diretorio: criarDirectoryRepository(db, ids),
      autenticador: {
        autenticar: async (token: string) => {
          const { conta, sid } = await auth.autenticar(token);
          return { userId: conta.id, sid };
        },
      },
      clock: systemClock,
      urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
    });
    const dependenciasDaSugestao = {
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      sugestoes: new SugestaoDoDiretorio({
        sugestoes: criarDirectorySuggestionRepository(db, ids),
        trilha,
        conferencias: { errosDeTextoDeUsuario, handleDoInstagram },
        canal: criarCanalDeContatoDoChamador(db),
      }),
      contrato,
    };
    registrarRotaDeSugestaoDoDiretorio(escopo, dependenciasDaSugestao);
    registrarRotaDasMinhasIndicacoes(escopo, dependenciasDaSugestao);
    registrarRotasDeSeguranca(escopo, {
      seguranca: new SegurancaDaComunidade({
        repositorio: criarSafetyRepository(db, ids),
        trilha,
        clock: systemClock,
      }),
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
    });
    registrarRotasDaVitrine(escopo, {
      vitrine: criarStoreRepository(db, urlDeMidia),
      taxonomia: criarTaxonomiaDaVitrineRepository(db),
      clock: systemClock,
    });
    const redeDaComunidade = criarNetworkRepository(
      db,
      ids,
      urlDeMidia,
      config.instagramProfileBaseUrl,
    );
    registrarRotasDaRede(escopo, {
      rede: redeDaComunidade,
      baseDaWeb: config.webBaseUrl,
      paginas: criarDisponibilidadeDaPagina(db),
      autenticador: {
        autenticar: async (token: string) => {
          const { conta, sid } = await auth.autenticar(token);
          return { userId: conta.id, sid };
        },
      },
      clock: systemClock,
      escritas: new EncontroDaComunidade({
        rede: redeDaComunidade,
        trilha,
        ids,
        clock: systemClock,
      }),
      contrato,
    });
    const conexoesDaComunidade = criarConnectionsRepository(db);
    registrarRotasDeConexao(escopo, {
      conexoes: new ConexaoEntrePessoas({
        conexoes: conexoesDaComunidade,
        convites: criarResolvedorDeConvite(db, systemClock),
        apelidos: criarResolvedorDeApelido(db),
        bloqueios: semBloqueioConhecido,
        trilha,
        ids,
        clock: systemClock,
      }),
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      contrato,
      baseDeMidia: config.mediaPublicBaseUrl,
    });
    registrarRotasDeConvite(escopo, {
      convites: new ConviteDoPerfil({
        convites: criarEmissorDeConvite(db, ids),
        trilha,
        clock: systemClock,
      }),
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
    });
    registrarRotasDeBuscaDePessoas(escopo, {
      busca: new BuscaDePessoas({
        busca: criarBuscaDePessoasRepository(db),
        conexoes: criarLeitorDeConexao(conexoesDaComunidade),
        clock: systemClock,
      }),
      baseDeMidia: config.mediaPublicBaseUrl,
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
    });
    registrarRotasDePessoa(escopo, {
      perfis: new PerfilDePessoa({
        perfis: criarPerfilDePessoaRepository(db),
        conexoes: criarLeitorDeConexao(conexoesDaComunidade),
        convites: criarResolvedorDeConvite(db, systemClock),
        clock: systemClock,
      }),
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      baseDeMidia: config.mediaPublicBaseUrl,
      contrato,
    });
    registrarRotasDePets(escopo, dependenciasDasRotasDePet);
    registrarRotaDoPerfilPublico(escopo, {
      perfis: criarLeituraDoPerfilPublico(db),
      baseDeMidia: config.mediaPublicBaseUrl,
    });
    registrarRotasDeLocalizacao(escopo, dependenciasDasRotasDeLocalizacao);
    registrarRotasDeAparelho(escopo, dependenciasDasRotasDeAparelho);
    registrarRotasDaCaixaDeNotificacoes(escopo, dependenciasDasRotasDaCaixa);
    registrarRotasDosContadoresDeSecao(escopo, dependenciasDasRotasDosContadores);
    registrarRotasDeAjuda(escopo, dependenciasDasRotasDeAjuda);
    registrarRotasDeMidia(escopo, dependenciasDasRotasDeMidia);
    registrarRotasDaVitrineDeFotos(escopo, dependenciasDasRotasDaVitrineDeFotos);
    registrarRotasDoMural(escopo, dependenciasDasRotasDoMural);
    registrarRotasDeCasos(escopo, dependenciasDasRotasDeCaso);
    registrarRotasDaLeituraPublicaDoCaso(escopo, {
      leitura: new LeituraPublicaDoCasoService(criarLeituraPublicaDoCaso(db), {
        baseDaWeb: config.webBaseUrl,
        baseDeMidia: config.mediaPublicBaseUrl,
      }),
      autenticador: dependenciasDasRotasDeCaso.autenticador,
    });
    registrarRotaDaListagemDePerdidos(escopo, {
      listagem: new ListagemPublicaDePerdidosService(
        criarListagemPublicaDePerdidos(db),
        { baseDaWeb: config.webBaseUrl, baseDeMidia: config.mediaPublicBaseUrl },
        systemClock,
      ),
    });
    registrarRotasDeAchado(escopo, dependenciasDasRotasDeAchado);
    registrarRotasDeTags(escopo, dependenciasDasRotasDeTag);
    registrarRotaDePedidoDePlaquinha(escopo, {
      pedidos: pedidosDePlaquinha,
      autenticador: dependenciasDasRotasDeTag.autenticador,
      contrato,
    });
    registrarRotasDoEnderecoGuardado(escopo, {
      enderecos: new KyselyEnderecoGuardado(db),
      autenticador: dependenciasDasRotasDeTag.autenticador,
      contrato,
    });

    registrarRotasDoEnderecoDoPet(escopo, {
      enderecos: criarEnderecoDoPetRepository({ db }),
      autenticador: dependenciasDasRotasDeTag.autenticador,
      contrato,
    });
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
      baseDeMidia: config.mediaPublicBaseUrl,
      assinarFoto: assinarFotoDaConversa,
    });
    registrarRotasDoAchador(escopo, {
      conversas: conversaDoAchador,
      contrato,
      idempotencia: criarIdempotencia(db),
      clock: systemClock,
      assinarFoto: assinarFotoDaConversa,
    });
    registrarRotasDoAvisoDoAchador(escopo, { avisos: avisoDoAchador, contrato });
    if (config.adminOrigin !== undefined) {
      escoparRotasAdministrativas(
        escopo,
        { origem: config.adminOrigin, sessoes: sessaoAdministrativa },
        (administrativo) => {
          registrarRotasDaSessaoAdministrativa(administrativo, { sessoes: sessaoAdministrativa, contrato });
          registrarRotasDaLojaAdministrativa(administrativo, { catalogo: catalogoAdministrativo, contrato });
          registrarRotasDaRedeAdministrativa(administrativo, { rede: redeAdministrativa, contrato });
          registrarRotasDoDiretorioAdministrativo(administrativo, {
            diretorio: diretorioAdministrativo,
            contrato,
          });
          registrarRotasDaFilaDeAjuda(administrativo, dependenciasDasRotasDaFilaDeAjuda);
          registrarRotasDaFilaDeIndicacoes(administrativo, {
            fila: filaDeIndicacoes,
            contrato,
          });

          registrarRotaDeBuscaDeCep(administrativo, { cep: criarBuscaDeCep() });
          registrarRotasDaFilaDePlaquinhas(administrativo, { fila: filaDePlaquinhas, contrato });
          registrarRotasDaFilaDeModeracao(administrativo, { fila: filaDeModeracao, contrato });
          registrarRotasDeComunicado(administrativo, {
            comunicados: comunicadosAdministrativos,
            contrato,
          });
        },
      );
    } else {
      app.log.warn('ADMIN_ORIGIN ausente: o prefixo /v1/admin nao foi registrado');
    }
    registrarRotaDoVereditoDeVersao(escopo, {
      politica: criarLeituraDaPoliticaDeVersao(db),
    });
    registrarSaude(escopo, {
      version: config.version,
      build,
      problemBaseUrl: config.problemBaseUrl,
      verificacoes: { database: () => banco.ping() },
    });
  });

  conferirIdempotencia();
  conferirParametros();

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
