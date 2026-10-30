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
// 18/10/2026. A CAIXA DE NOTIFICACOES (o destino do sino) e o COMUNICADO. As
// duas moram em `notifications` pelo mesmo argumento que trouxe o aparelho para
// ca: o modulo e o do aviso, e nao o da identidade.
import { registrarRotasDaCaixaDeNotificacoes } from '../modules/notifications/adapters/http/caixa-de-notificacoes-routes.js';
import { registrarRotasDosContadoresDeSecao } from '../modules/sections/adapters/http/section-counter-routes.js';
// A DUVIDA DE AJUDA (29/10/2026). Mesmo molde dos contadores: o modulo recebe
// um `autenticar` e nao o servico de identidade.
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
// `comoObjectKey` e de `media/domain/`, e a raiz de composicao pode importa-lo:
// a fronteira de modulo vigia `src/modules/*`, e `bin/leitor-de-midia.ts` ja faz
// o mesmo. Ele VALIDA a chave, e a forma `found-reports/{dono}/sanitized/{...}`
// ja e aceita por ele desde a BICHUS-35.
import { comoObjectKey } from '../modules/media/domain/chave-de-objeto.js';
import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { MediaService } from '../modules/media/application/media-service.js';
import { registrarRotasDeMidia } from '../modules/media/adapters/http/media-routes.js';
// A VITRINE DE FOTOS DO USUARIO (cliente, 18/10/2026), visivel so ao dono.
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
// 18/10/2026. A FILA DE REVISAO das indicacoes: o menu que faltava no painel.
import { registrarRotasDaFilaDeIndicacoes } from '../modules/professionals/adapters/http/admin-directory-suggestion-routes.js';
// 18/10/2026. A FILA DE MODERACAO do painel: "quem modera vai ser o
// administrador, deve ir para a pagina de backoffice".
import { registrarRotasDaFilaDeModeracao } from '../modules/moderation/adapters/http/admin-moderation-routes.js';
import { criarFilaDeModeracaoRepository } from '../modules/moderation/adapters/persistence/kysely-fila-de-moderacao.js';
import { FilaDeModeracao } from '../modules/moderation/application/fila-de-moderacao.js';
import { criarFilaDeIndicacoesRepository } from '../modules/professionals/adapters/persistence/kysely-fila-de-indicacoes.js';
import { FilaDeIndicacoes } from '../modules/professionals/application/fila-de-indicacoes.js';
import { SugestaoDoDiretorio } from '../modules/professionals/application/sugestao-do-diretorio.js';
// As duas conferencias de texto que `professionals` NAO reimplementa. A
// composicao mora aqui, fora de `src/modules/`, porque
// `arquitetura/fronteira-de-modulo` reprova um modulo importar `domain/` de
// outro -- e escrever um segundo detector de D59 ao lado deste seria manter
// dois, que divergem calados. Ver
// `modules/professionals/ports/conferencias-de-texto.ts`.
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
import {
  registrarIntencaoDeCapaDaComunidade,
  registrarIntencaoDoLogotipoDaIndicacao,
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
// 20/10/2026. OS TRES CAMINHOS DE CONEXAO: busca, QR e link de convite.
import {
  criarEmissorDeConvite,
  criarResolvedorDeApelido,
  criarResolvedorDeConvite,
} from '../modules/connections/adapters/persistence/kysely-convites.js';
import { ConviteDoPerfil } from '../modules/connections/application/convite-do-perfil.js';
import { registrarRotasDeConvite } from '../modules/connections/adapters/http/invite-routes.js';
// FATIA G (19/10/2026). O perfil de OUTRA pessoa, pelo apelido.
import { registrarRotasDePessoa } from '../modules/people/adapters/http/person-profile-routes.js';
import { PerfilDePessoa } from '../modules/people/application/perfil-de-pessoa.js';
import { criarPerfilDePessoaRepository } from '../modules/people/adapters/persistence/kysely-perfil-de-pessoa.js';
// 20/10/2026. A BUSCA DE PESSOAS, com os freios do cliente.
import { registrarRotasDeBuscaDePessoas } from '../modules/people/adapters/http/people-search-routes.js';
import { BuscaDePessoas } from '../modules/people/application/busca-de-pessoas.js';
import { criarBuscaDePessoasRepository } from '../modules/people/adapters/persistence/kysely-busca-de-pessoas.js';
import { criarNetworkRepository } from '../modules/network/adapters/persistence/kysely-network-repository.js';
import { EncontroDaComunidade } from '../modules/network/application/encontro-da-comunidade.js';

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
  // SEC-021. Sobe para ca, antes do servico de autenticacao, porque o LOGOUT
  // passou a apagar a localizacao do aparelho que sai (ADR-0010, tabela de
  // retencao: "apagada ao sair da conta"). A montagem das rotas de localizacao,
  // mais abaixo, usa esta mesma instancia -- duas instancias seriam dois
  // caminhos ate a mesma tabela, e e por ai que um deles envelhece sozinho.
  const repositorioDeLocalizacao = criarLocalizacaoDeReferenciaRepository(db);

  // O SERVIÇO DE APARELHOS SOBE ANTES DO DE IDENTIDADE, e a ordem é o SEC-019.
  //
  // Ele era construído lá embaixo, junto das rotas de `/me/devices`, e por isso
  // não havia como `criarAuthService` alcançá-lo. A instância é UMA: duas sobre
  // a mesma tabela não quebrariam nada hoje, mas dariam duas trilhas e duas
  // leituras de "quem é o dono do registro de aparelho" para quem revisar.
  const aparelhos = new RegistroDeAparelhosService({
    repositorio: criarRegistroDeAparelhos(db, ids),
    clock: systemClock,
    trilha,
  });

  const auth = criarAuthService({
    // A FOTO EM `SessionResponse.user.photo` (21/10/2026): a MESMA funcao que
    // as rotas recebem, de proposito -- duas formas de montar a mesma URL
    // divergiriam, e a que divergisse seria a menos olhada.
    urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
    repositorio: repositorioDeIdentidade,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    // SEC-021: o logout apaga a localizacao do aparelho que sai, e so dele. A
    // falha propaga de proposito -- ver o comentario da porta em
    // `dependencies.ts`.
    apagarLocalizacaoDaSessao: (dono, familia) => repositorioDeLocalizacao.apagar(dono, familia),
    mailer,
    // A TRAVESSIA DE `identity` PARA `notifications`, e ela é uma função e não
    // um módulo (ADR-0008). É esta linha que faz "Sair de todos os aparelhos",
    // a troca de senha, a redefinição, o "não fui eu" e a exclusão de conta
    // apagarem o endereço de entrega do push, e não só a sessão (SEC-019).
    removerPushDaConta: (dono) => aparelhos.removerTodosDaConta(dono),
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

  // ADR-0027. A unidade de trabalho de toda escrita administrativa: a escrita e
  // o evento da trilha na MESMA transacao, e a falha da trilha desfaz a escrita
  // (D49). A trilha de cima (`trilha`) continua servindo ao app, onde ela nao
  // derruba o pedido.
  const escritaAuditada = criarEscritaAuditada({
    db,
    trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
  });

  // BICHUS-266/267. A escrita administrativa da Loja. A trilha e a MESMA forma
  // transacional de cima (D49); a intencao de envio assina pelo mesmo
  // armazenamento da foto do pet, no prefixo proprio do catalogo.
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

  // BICHUS-273/292. A escrita administrativa da Rede e a fila de pedidos. A
  // trilha e a mesma forma transacional (D49); a contagem da fila (D56) le da
  // propria trilha; o aviso a todos os administradores sai pelo mesmo mailer.
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

  // BICHUS-189. A escrita administrativa do diretorio de `Perto`. Sem `avisos`:
  // uma entrada de diretorio nao notifica ninguem.
  //
  // **COM `urlDeMidia` E COM `imagens` A PARTIR DE 18/10/2026.** O comentario
  // anterior dizia que a entrada "nao tem imagem -- nao ha coluna de foto nem
  // de logotipo em `professionals`, e inventar uma seria decidir produto aqui".
  // Estava certo, e deixou de estar: o cliente decidiu o produto, com estas
  // palavras -- *"coloque um campo no backoffice para subir uma imagem do logo
  // e foto dos profissionais recomendados"* --, e a migracao `20261018000008`
  // criou as duas colunas. `imagens` e o MESMO `registroDeImagemDeCatalogo`
  // que a `Loja` e a `Rede` recebem: uma esteira so.
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

  // 18/10/2026. A FILA DE REVISAO das indicacoes do `Perto`: a queixa do
  // cliente era que "no backoffice nao tem um menu para aprovar os
  // profissionais que as pessoas estao indicando". A indicacao grava em
  // `directory_suggestions` desde 17/10 e nunca houve quem lesse essa fila.
  //
  // A trilha e OUTRA instancia da mesma fabrica, e nao a de
  // `diretorioAdministrativo`: `criarTrilhaTransacional` nao guarda estado
  // entre chamadas, e compartilhar a instancia amarraria dois repositorios por
  // um objeto que nenhum dos dois precisa dividir.
  //
  // `conferencias` e o MESMO par que a sugestao do aplicativo usa: o motivo da
  // recusa passa pelo detector de D59 que ja existe, e nao por um segundo.
  const filaDeIndicacoes = new FilaDeIndicacoes({
    repositorio: criarFilaDeIndicacoesRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
      imagens: registroDeImagemDeCatalogo,
    }),
    ids,
    clock: systemClock,
    conferencias: { errosDeTextoDeUsuario, handleDoInstagram },
    // A entrada aprovada pela fila nasce sem imagem; a projecao e a mesma do
    // painel, e por isso ela precisa da funcao.
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

  // A FILA DE MODERACAO. `conferencias` e o MESMO detector de D59 das outras
  // duas filas, pela mesma porta e pelo mesmo motivo: um segundo detector
  // divergiria calado do primeiro. A composicao mora aqui, fora de
  // `src/modules/`, onde `arquitetura/fronteira-de-modulo` nao se aplica.
  const filaDeModeracao = new FilaDeModeracao({
    repositorio: criarFilaDeModeracaoRepository({
      db,
      trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
    }),
    clock: systemClock,
    conferencias: { errosDeTextoDeUsuario },
  });

  // A sessao do backoffice. Ela e tambem a porta que a guarda do prefixo
  // `/v1/admin` usa para conferir cookie, papel e janela de reautenticacao. A
  // conta e de `admin_accounts` (ADR-0027 item 20): nada do app entra aqui.
  const sessaoAdministrativa = criarSessaoAdministrativaService({
    sessoes: criarSessaoAdministrativaRepository(db),
    contas: criarRepositorioDeContasAdministrativas(db),
    escrita: escritaAuditada,
    trilha,
    contagem: criarContagemNaTrilha(),
    // D41. Sem `CAPTCHA_TRANSPORT=recaptcha_enterprise` e as duas variaveis
    // dele, o verificador recusa todo login administrativo: nao ha modo que
    // aprove sem avaliar.
    // QA, 28/09: na pilha local, e so nela, `CAPTCHA_DESENVOLVIMENTO_LOCAL`
    // troca o verificador pelo que aprova o token de desenvolvimento do painel.
    // `assertSafeBoot()`, no topo deste `main`, ja recusou a subida se a
    // variavel apareceu em producao, fora de dev ou em host que nao e local.
    captcha: captchaDeDesenvolvimentoLigado(optionalEnv('CAPTCHA_DESENVOLVIMENTO_LOCAL'))
      ? captchaDeDesenvolvimentoLocal
      : criarVerificadorDeCaptcha({
          transporte: optionalEnv('CAPTCHA_TRANSPORT'),
          siteKey: optionalEnv('CAPTCHA_SITE_KEY'),
          projeto: optionalEnv('CAPTCHA_PROJECT'),
        }),
    // D43: a MESMA base do `conta-admin` (consulta por faixa, k-anonimato,
    // 5 s de teto). Senha vazada responde o 401 comum e avisa os
    // administradores; base fora do ar no LOGIN deixa entrar e grava isso na
    // trilha (decisao do cliente, 28/09: recusar trancaria todos os
    // administradores do lado de fora numa queda do servico externo). O
    // `conta-admin` continua recusando nesse caso, porque definir senha e o
    // unico momento em que da para dizer nao sem trancar ninguem.
    senhasVazadas: criarListaDeSenhasVazadasPorFaixa(),
    avisos: mailer,
    ids,
    clock: systemClock,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    // O link "nao fui eu" aponta para o painel. Sem `ADMIN_ORIGIN` o prefixo nem
    // e registrado (abaixo), e nenhum login administrativo acontece; a cadeia
    // vazia so existe para o servico ser montado igual nos dois casos.
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
    // 18/10/2026: `Me.photo` precisa da URL da derivada. Mesma montagem da
    // `Loja`, da `Rede` e do diretorio.
    urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
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
    // BICHUS-35. A resolucao da foto anexada para a chave HIGIENIZADA
    // (upload_intents.sanitized_key), nunca a do original. Porta propria e
    // nao um metodo do repositorio: ver ports/foto-da-conversa.ts, que e onde
    // a invariante inteira esta escrita.
    fotos: criarFotoDaConversa(db),
    ids,
    clock: systemClock,
    trilha,
  });

  // BICHUS-41. A mesma conversa, pela porta de quem avisou sem conta: o token
  // do aviso e o endereco, e as rotas nao tem id no caminho (SEC-001).
  const conversaDoAchador = new ConversaDoAchadorService({
    repositorio: criarConversationRepository(db),
    fotos: criarFotoDaConversa(db),
    ids,
    clock: systemClock,
    trilha,
  });

  /**
   * A URL ASSINADA da foto da conversa (BICHUS-35), para os DOIS lados.
   *
   * A classe do balde e a validade sao decididas AQUI e nao por quem chama: a
   * borda recebe uma funcao de um argumento (`messaging/ports/assinador-de-foto.ts`)
   * e nao consegue pedir outra classe nem outro prazo. O numero e o motivo dele
   * moram em `messaging/domain/leitura-da-foto.ts`.
   *
   * `privado` e a classe, e nao `publico`: o criterio 9 da BICHUS-35 diz que a
   * foto do achado e vista pelo tutor dentro da conversa mediada, e so.
   */
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
    // De onde sai `pet.photo_url` na resolução da plaquinha. É a MESMA base do
    // perfil público do pet (linhas de `baseDeMidia` acima): as duas
    // superfícies públicas do mesmo animal apontam para o mesmo objeto.
    baseDeMidia: config.mediaPublicBaseUrl,
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
        // `scan_notice`: PLAQUINHA LIDA. Este aviso nao sai do contador do sino
        // quando o tutor abre a lista -- so quando ele abre a conversa
        // (BICHUS-278). A especie e decidida AQUI porque este arquivo e o unico
        // que conhece os dois caminhos; `tags` continua indiferente a conversa.
        await conversas.abrirPorAviso({ ...aviso, especie: 'scan_notice' });
      },
    },
    // O EMISSOR DO AVISO AO TUTOR. A MESMA fila de `alert.dispatch` e de
    // `media.process_upload`: o aviso da plaquinha nao ganha esteira propria.
    // Quem consome `tag.scan_notify` e `bin/worker.ts`.
    fila: criarJobQueue(db, ids),
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
              // O motivo da recusa, que era gravado e não chegava à tela.
              rejectionReason: f.rejectionReason,
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
      repositorio: repositorioDeLocalizacao,
      clock: systemClock,
      trilha,
    }),
    autenticador: {
      // O `sid` passa a atravessar esta fiacao (SEC-021): ele e a sessao de
      // aparelho, e sem ela nao ha de quem e a localizacao. Quem decide o que
      // fazer com a ausencia e a borda, onde a recusa tem codigo HTTP.
      autenticar: async (token: string) => {
        const { conta, sid } = await auth.autenticar(token);
        return { userId: conta.id, sid };
      },
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
    // A MESMA instância que `criarAuthService` recebeu lá em cima. Ver o
    // comentário de lá.
    aparelhos,
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  // A CAIXA DE NOTIFICACOES. O autenticador chega injetado, como no aparelho: o
  // modulo recebe um `autenticar` e nao o servico de identidade, entao ele nao
  // tem como devolver dado de conta por engano.
  const dependenciasDasRotasDaCaixa = {
    caixa: new CaixaDeNotificacoesService({ caixa: criarCaixaDeNotificacoes(db) }),
    autenticador: {
      autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
    },
    contrato,
  };

  // OS CONTADORES DAS ABAS `Pets` E `Rede` (BICHUS-278, cliente 20/10/2026).
  // Mesmo molde da caixa: o modulo recebe um `autenticar` e nao o servico de
  // identidade. Cada contagem REUSA o construtor da propria listagem, e e
  // isso que impede o selo de contar um recorte diferente do que a aba abre --
  // a conta esta no cabecalho de cada um dos tres adaptadores de contagem.
  const dependenciasDasRotasDosContadores = {
    contadores: criarContadoresDeSecaoService({
      // O MARCADOR e deste modulo; as TRES CONTAGENS sao de quem tem a tabela.
      // A fronteira de modulo reprova quem alcanca `adapters` alheio, e o
      // desenho que saiu dessa reprovacao e melhor: cada contagem mora ao lado
      // da listagem com que ela tem de concordar.
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

  // A DUVIDA DE AJUDA (pedido do cliente de 29/10/2026).
  //
  // **Nenhum notificador entra aqui**, e a ausencia e a decisao: ele escolheu
  // "grava no banco e vai para o backoffice", na variante SEM notificacao por
  // e-mail. O servico recebe a porta da fila e o relogio, e mais nada -- entao
  // nao ha, dentro dele, nada capaz de avisar alguem nem por engano.
  // A MESMA porta para as duas pontas: o app escreve, o painel le. Uma
  // instancia so, entao nao ha como a leitura do painel olhar uma tabela e a
  // escrita do app outra.
  // `escritaAuditada` e a MESMA instancia das outras escritas do painel: a
  // escrita e o evento de trilha na mesma transacao, e a falha da trilha
  // desfaz a marcacao (D49).
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

  // O COMUNICADO. `escritaAuditada` e a MESMA instancia das outras escritas do
  // painel: uma transacao, a escrita dentro dela, o evento de trilha na mesma
  // transacao, e o `COMMIT` so depois dos dois (D49). Um comunicado que falhasse
  // na trilha nao fica de pe.
  const comunicadosAdministrativos = new ComunicadosAdministrativos({
    repositorio: criarRepositorioDeComunicados(db),
    escrita: escritaAuditada,
  });

  // A VITRINE DE FOTOS DO USUARIO. Reusa a ESTEIRA DE IMAGEM que ja existe: o
  // mesmo preparador de envio do painel e da capa do encontro, com
  // `purpose = user_showcase`, o prefixo `people/` e o autor em `users`. Nenhuma
  // segunda esteira -- intencao, confirmacao, derivadas, higiene de EXIF e
  // varredura de vencidos continuam tendo uma versao so (ADR-0007).
  const dependenciasDasRotasDaVitrineDeFotos = {
    vitrine: new VitrineDeFotos({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      vitrine: criarVitrineRepository(db, ids),
      // `registrarIntencaoDaVitrineDoUsuario`, E NAO a da capa do encontro.
      //
      // Era `registrarIntencaoDeCapaDaComunidade` aqui, e isso gravava
      // `purpose = 'network_event'` na intencao da VITRINE. A assinatura das
      // duas funcoes era identica, entao a troca compilou. Medido em
      // 18/10/2026 contra a pilha de integracao: `POST
      // /v1/me/showcase/photo-intents` devolvia `201` e `PUT /v1/me/showcase`
      // devolvia `404` para a mesma `upload_id` -- nenhuma foto de vitrine
      // podia ser salva, porque a confirmacao procura `purpose =
      // 'user_showcase'`.
      registrarIntencao: registrarIntencaoDaVitrineDoUsuario,
      db,
      clock: systemClock,
    }),
    autenticador: dependenciasDasRotasDePet.autenticador,
    contrato,
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  // O MURAL (20/10/2026). A publicacao do usuario e a linha do tempo.
  //
  // Reusa a MESMA ESTEIRA DE IMAGEM das outras cinco fotos: o mesmo preparador
  // de envio, com `purpose = user_publication`, o prefixo `people/` e o autor em
  // `users`. Nenhuma segunda esteira -- intencao, confirmacao, derivadas,
  // higiene de EXIF e varredura de vencidos continuam tendo uma versao so
  // (ADR-0007).
  //
  // **`registrarIntencaoDaFotoDaPublicacao`, E NAO a da vitrine nem a da capa
  // do encontro.** As quatro funcoes tem a MESMA FORMA e assinaturas que
  // divergem apenas no literal de `purpose` -- e e por isso que elas o
  // declaram no tipo. Em 18/10/2026 esta linha apontava para a funcao errada na
  // vitrine, a troca COMPILOU, e nenhuma foto de vitrine podia ser salva:
  // `201` na intencao e `404` na confirmacao, porque a confirmacao procura o
  // envio pelo proposito. Hoje a troca nao compila.
  //
  // **NENHUMA PORTA ENTRA DESLIGADA AQUI.** A linha do tempo depende de
  // `user_publications`, `user_connections`, `users`, `handles`,
  // `catalog_images` e das funcoes `conta_habilitada`, `bloqueio_entre` e
  // `publicacao_ocultada_para_quem_denunciou` -- e todas estao nesta arvore.
  // Ela funciona de ponta a ponta no dia em que sobe.
  //
  // **O bloqueio e a conexao NAO entram por porta**, e e de proposito: os dois
  // predicados sao SQL na clausula `WHERE` da consulta (ADR-0021), que e a
  // forma que a Emenda 3 do ADR-0010 registra para a foto na conversa e pela
  // mesma razao -- uma pagina carrega vinte publicacoes, e perguntar a aresta
  // por publicacao seriam vinte idas ao banco por rolada.
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
    // ADR-0025 emenda 3: a capa do encontro da comunidade. O MESMO preparador
    // do painel (prefixo `events/`, `purpose = network_event`), com o autor em
    // `users` em vez de `admin_accounts`.
    capasDeEncontro: new CapaDeEncontroDaComunidade({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDeCapaDaComunidade,
      db,
      ids,
    }),
    // 18/10/2026: a foto do proprio usuario. O MESMO preparador, com o prefixo
    // `people/` e `purpose = user_photo` -- e com HEIC aceito na entrada,
    // porque esta foto sai de um celular.
    fotosDoUsuario: new FotoDoProprioUsuario({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDeFotoDoUsuario,
      db,
      ids,
    }),
    // 29/10/2026: o LOGOTIPO DA INDICACAO. O MESMO preparador, com o prefixo
    // `directory/` e `purpose = directory_suggestion_logo` -- e o proposito e
    // SEPARADO de `directory_logo` de proposito: `imagemDoEnvio` da escrita de
    // `professionals` exige `directory_logo`, entao um envio assinado aqui nao
    // entra em superficie publica. **Ligar `registrarIntencaoDeCapaDaComunidade`
    // ou qualquer uma das outras quatro aqui NAO COMPILA**: o `purpose` esta
    // fechado no literal dentro do tipo da dependencia. Era exatamente este
    // descuido -- duas funcoes de assinatura identica -- que gravou
    // `network_event` numa foto de vitrine em 18/10/2026.
    logotiposDeIndicacao: new LogotipoDaIndicacao({
      envios: criarPreparadorDeEnvioDeCatalogo({
        armazenamento: criarObjectStorage(config.objectStorage),
        ids,
      }),
      registrarIntencao: registrarIntencaoDoLogotipoDaIndicacao,
      db,
    }),
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
          // `found_notice`: ACHADO confirmado pela decisao humana do tutor.
          // Mesma regra do `scan_notice`: nao sai do contador ao abrir a lista.
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
    // De onde saem o link de compartilhar e o cartaz. Montados na leitura, e
    // nunca guardados: um link gravado carrega o domínio do dia em que foi
    // escrito, e o cartaz é impresso e colado num poste.
    //
    // `WEB_BASE_URL` e não `TAG_BASE_URL`: o cartaz do caso é uma PÁGINA do
    // time web (ADR-0017 item 1), e o papel colado no poste se arranca e se
    // reimprime. Só a plaquinha da coleira é irreversível.
    baseDaWeb: config.webBaseUrl,
    // O interruptor das páginas públicas (`site_page_availability`,
    // `20261020000010`). `baseDaWeb` diz onde a página moraria; esta porta diz
    // se ela existe — e em 20/10/2026 ela NÃO existe, medido de fora nos dois
    // ambientes. Enquanto a linha disser `false`, `share_url` não sai e o
    // aplicativo não desenha a ação de compartilhar.
    //
    // Nasce do banco e não de `config`: acender é um `UPDATE` com a API de pé,
    // e `loadAppConfig()` lê o ambiente uma vez na subida.
    paginas: criarDisponibilidadeDaPagina(db),
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
    // De onde sai `matched_pet.photo_url` no achado (emenda 7 do ADR-0010,
    // 28/10/2026). E a MESMA base da resolucao da plaquinha e do perfil publico
    // do pet: as tres superficies mostram a capa do MESMO animal, e uma base
    // propria aqui faria a tela do achado pedir derivada em host que nao a tem.
    baseDeMidia: config.mediaPublicBaseUrl,
  };

  // BICHUS-41. "Contar mais" e a foto de quem avisou sem conta. A validade do
  // token e perguntada a conversa, que e onde a regra do "caso aberto mais 30
  // dias" mora: `found` so enxerga a porta de um metodo de `conversaDoAchador`.
  const avisoDoAchador = new AvisoDoAchadorService({
    repositorio: criarFoundReportRepository(db),
    conversa: conversaDoAchador,
    armazenamento: criarObjectStorage(config.objectStorage),
    ids,
    clock: systemClock,
    // `WEB_BASE_URL`: `/c/{token}` e pagina do site, como o `conversation_url`
    // que o aviso ja devolve em `createFoundReportFromTag`.
    baseDaWeb: config.webBaseUrl,
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
    // `API_BASE_URL`, porque `qr_png_url` é rota DESTA API. `TAG_BASE_URL` é o
    // que vai impresso na coleira e `fiacao-das-bases.test.ts` trava aquela
    // linha; esta é a terceira base e não se confunde com nenhuma das duas.
    baseDaApi: config.apiBaseUrl,
    ipHmacKey: config.ipHmacKey,
    chaveDoIndiceDoCodigo: config.tagCodeIndexKey,
  };

  // O pedido do OBJETO FISICO da plaquinha (o destino que o botao `Fazer a tag
  // da coleira` nunca teve). **Nao emite codigo**: emitir e `issuePetTag`, e o
  // codigo e irreversivel (ADR-0004). O repositorio e um so para os dois lados,
  // porque e a mesma tabela; o que difere e o caso de uso.
  const repositorioDePedidosDePlaquinha = criarPedidoDePlaquinhaRepository({ db });
  const pedidosDePlaquinha = new PedidoDePlaquinhaService({
    repositorio: repositorioDePedidosDePlaquinha,
    ids,
  });
  // A fila do painel usa a MESMA unidade de trabalho auditada das outras
  // escritas administrativas (D49): decisao e trilha na mesma transacao.
  const filaDePlaquinhas = new FilaDePlaquinhasAdministrativa({
    repositorio: repositorioDePedidosDePlaquinha,
    escrita: escritaAuditada,
    clock: systemClock,
  });

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
    registrarRotasDePasskey(escopo, {
      auth,
      contrato,
      // Servico proprio e nao um metodo do `AuthService`: a verificacao WebAuthn
      // nao compartilha nada com senha, e a unica costura entre os dois e
      // `entrarComCredencialDigital`, que recebe um `UserId` JA VERIFICADO.
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
        // SEC-021: o `sid` atravessa esta fiacao, como ja atravessa a da
        // localizacao de referencia. Ele e a sessao de aparelho, e e dela que
        // sai o ponto que mede a distancia -- sem ele a subconsulta devolveria
        // uma linha por aparelho da conta, e o Postgres responderia 500.
        autenticar: async (token: string) => {
          const { conta, sid } = await auth.autenticar(token);
          return { userId: conta.id, sid };
        },
      },
      clock: systemClock,
      // 18/10/2026: o cliente liberou a logo e a foto do profissional no
      // aplicativo. A URL da derivada e montada na leitura, como nas outras.
      urlDeMidia: (chave: string) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
    });
    // A SUGESTAO do diretorio: escrita da comunidade, em arquivo e em
    // registrador proprios. Ela NAO escreve em `professionals` -- a emenda 1 do
    // ADR-0011 tirou `'community'` de `professionals.source`, e o que esta
    // operacao grava e a fila de revisao (`directory_suggestions`). A trilha e
    // a do app (`trilha`, transacao propria), e nao a transacional do painel.
    const dependenciasDaSugestao = {
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
      sugestoes: new SugestaoDoDiretorio({
        sugestoes: criarDirectorySuggestionRepository(db, ids),
        trilha,
        conferencias: { errosDeTextoDeUsuario, handleDoInstagram },
        // A trava de conta validada, no SERVIDOR: a mesma condicao de
        // `estadoParaCriarEncontro`, porque "validado" e uma regua so.
        canal: criarCanalDeContatoDoChamador(db),
      }),
      contrato,
    };
    registrarRotaDeSugestaoDoDiretorio(escopo, dependenciasDaSugestao);
    // MINHAS INDICACOES: o lado de quem indicou, que nunca existiu (cliente,
    // 18/10/2026). As dependencias sao AS MESMAS da escrita acima, e por isso
    // o objeto e montado uma vez e passado aos dois registradores: duas
    // montagens seriam dois `SugestaoDoDiretorio` -- dois caminhos ate a mesma
    // tabela, com a chance de um deles ganhar um dobre diferente do outro.
    registrarRotaDasMinhasIndicacoes(escopo, dependenciasDaSugestao);
    // BLOQUEAR E DENUNCIAR (fatia E da frente de comunidade). Modulo proprio,
    // e o autenticador e o MESMO do diretorio e da Rede: o modulo recebe a
    // funcao e continua sem conhecer o servico de identidade.
    //
    // A trilha e a do APP (`trilha`, transacao propria) e nao a transacional do
    // painel: um incidente no esquema de auditoria nao e motivo para alguem
    // nao conseguir bloquear quem a esta assediando.
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
      // O vocabulario dos dois niveis da categoria, com cache em processo
      // invalidado por reinicio -- a lista so muda por migracao.
      taxonomia: criarTaxonomiaDaVitrineRepository(db),
      clock: systemClock,
    });
    // A `Rede` tem as rotas no mesmo registrador: leituras alcancaveis sem
    // conta e as que exigem uma. O autenticador e o mesmo do diretorio e o da
    // transferencia -- o modulo recebe a funcao e continua sem conhecer o
    // servico de identidade.
    // ADR-0025 emenda 3: a MESMA porta serve as leituras e as tres escritas da
    // comunidade (criar, editar o proprio, cancelar o proprio), e o caso de uso
    // recebe essa porta mais a trilha do app (`trilha`, transacao propria) -- e
    // nao a transacional do painel.
    const redeDaComunidade = criarNetworkRepository(
      db,
      ids,
      urlDeMidia,
      config.instagramProfileBaseUrl,
    );
    registrarRotasDaRede(escopo, {
      rede: redeDaComunidade,
      // Onde a pagina publica do encontro mora, e se ela existe. O par anda
      // junto de proposito: endereco sem interruptor e link que ninguem
      // conferiu (decisao do cliente de 21/10/2026, emenda 4 do ADR-0017).
      //
      // A MESMA porta e a MESMA instancia de tabela que o caso do pet usa --
      // `site_page_availability`, agora com a terceira linha (`network_event`,
      // migracao `20261020000017`). Enquanto a linha disser `false`,
      // `share_url` nao sai do detalhe do encontro e o aplicativo compartilha
      // sem link, como ja compartilha hoje.
      baseDaWeb: config.webBaseUrl,
      paginas: criarDisponibilidadeDaPagina(db),
      autenticador: {
        // SEC-021: o `sid` atravessa esta fiacao, como ja atravessa a da
        // localizacao de referencia. Ele e a sessao de aparelho, e e dela que
        // sai o ponto que mede a distancia -- sem ele a subconsulta devolveria
        // uma linha por aparelho da conta, e o Postgres responderia 500.
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
    // FATIA F (18/10/2026) + OS TRES CAMINHOS (20/10/2026). A conexao entre
    // pessoas: SIMETRICA, com aceite.
    //
    // **`nenhumConviteExiste` SAIU EM 20/10/2026, e nao foi substituida por um
    // esboco.** Ela era a afirmacao executavel de que nenhuma conta alcancava
    // nenhuma outra, e dizia de si mesma que *"troca-la e o trabalho de H' e
    // H'', e e uma linha na fiacao"*. A divida foi paga por um terceiro
    // caminho, que o cliente pediu -- o convite emitido pelo proprio dono
    // (link e QR) -- e nao por H' nem H'': as duas continuam sem existir, e os
    // valores `anchored_case`, `anchored_event` e `presence_code` continuam
    // sem emissor.
    //
    // Agora entram DOIS resolvedores de producao, e os dois leem o banco:
    // `criarResolvedorDeConvite` (token -> conta + apelido) e
    // `criarResolvedorDeApelido` (apelido -> conta), cada um com os seus
    // predicados na clausula `WHERE`.
    //
    // **`semBloqueioConhecido` CONTINUA AQUI, E AGORA ISSO CUSTA -- leia antes
    // de confiar nela.** O comentario que ela carrega diz que `user_blocks`
    // "NAO EXISTE em origin/development (medido em 18/10/2026)", e isso
    // **deixou de ser verdade**: a migracao `20261018000031` cria a tabela e a
    // funcao `bloqueio_entre`, e a `20261018000032` cria
    // `perfil_ocultado_para_quem_denunciou`. As duas estao em
    // `origin/development` (`70f4aa34`, conferido em 20/10/2026).
    //
    // Ela responde `false` para todo par, entao o `if` de bloqueio de
    // `ConexaoEntrePessoas.criarPedido` **nao barra ninguem hoje**. O que de
    // fato barra -- e o que faz a indistinguibilidade valer -- sao os
    // predicados SQL `bloqueio_entre` nas duas resolucoes acima: um apelido de
    // quem bloqueou quem pede nao resolve, e um convite de quem bloqueou quem
    // chama nao resolve. A porta desligada e uma segunda defesa que hoje nao
    // defende, e nao a primeira.
    //
    // **Ligar a implementacao real dela e trabalho da fatia E e esta no
    // relatorio da entrega como pendencia**: ela nao foi ligada aqui porque o
    // leitor de producao de `user_blocks` e do modulo `safety`, e importa-lo
    // daqui sem a porta correspondente atravessaria a fronteira que
    // `src/architecture.rules.mjs` impoe.
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
      // 22/10/2026. A base de midia entrou com `listMyConnections`: ela e a
      // primeira resposta de conexao a carregar FOTO, e a URL e montada na
      // borda porque o banco guarda chave de objeto e nunca endereco.
      baseDeMidia: config.mediaPublicBaseUrl,
    });
    // 22/10/2026. A etiqueta `connections` passou a ter SEIS operacoes: o
    // cliente emendou a propria decisao de 18/10 e autorizou a lista das
    // PROPRIAS conexoes -- *"o usuario pode abrir a lista de usuarios que e sua
    // conexao"*. A lista de TERCEIRO continua nao existindo.
    //
    // 20/10/2026. O CONVITE DO PROPRIO PERFIL: emitir e revogar. O que alimenta
    // o link do WhatsApp e o QR -- que sao o MESMO token em dois transportes.
    //
    // Etiqueta `connection-invites` e nao `connections`, porque aquela e fechada
    // em SEIS operacoes e o portao cobra o numero exato. O ajuste de 22/10/2026
    // abriu UMA operacao pelo nome, e nao o numero.
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
    // 20/10/2026. A BUSCA DE PESSOAS, com os freios do cliente: piso de 3
    // caracteres, campo vazio nao lista ninguem, teto `[account, q]` por conta,
    // e resposta limitada a nome, apelido, duas contagens **e a foto**.
    //
    // **A FOTO ENTROU EM 21/10/2026**, e este comentario dizia "sem foto
    // (emenda 5 item 2)". O cliente emendou a propria decisao: *"o resultado
    // tras foto sim, para identificar usuarios com nomes parecidos."* Os tres
    // freios acima sao o que separa isso de um catalogo de rostos, e e por isso
    // que eles continuam listados aqui.
    //
    // **Nenhuma porta entra desligada**: `handles`, `users`, `pets`,
    // `user_connections`, `bloqueio_entre` e
    // `perfil_ocultado_para_quem_denunciou` estao todas em `origin/development`,
    // e os indices trigrama vem da `20261020000012`.
    registrarRotasDeBuscaDePessoas(escopo, {
      busca: new BuscaDePessoas({
        busca: criarBuscaDePessoasRepository(db),
        // O ESTADO DO PAR EM CADA RESULTADO (cliente, 22/10/2026), que conserta
        // o botao de "pedir conexao" aparecendo ao lado de quem ja aceitou. A
        // porta e `connections/ports/conexao.ts` e mais nenhuma camada de
        // `connections` -- e o que `src/architecture.rules.mjs` impoe a `people`.
        conexoes: criarLeitorDeConexao(conexoesDaComunidade),
        clock: systemClock,
      }),
      // A FOTO NO RESULTADO (cliente, 21/10/2026): a derivada `thumb`, com a
      // URL montada na borda a partir da chave de objeto.
      baseDeMidia: config.mediaPublicBaseUrl,
      autenticador: {
        autenticar: async (token: string) => ({ userId: (await auth.autenticar(token)).conta.id }),
      },
    });
    // FATIA G (19/10/2026). O PERFIL DE OUTRA PESSOA, pelo apelido.
    //
    // **Nenhuma porta entra desligada aqui, e a diferenca com a fatia F e o
    // ponto:** `requestConnection` depende de um emissor de convite que nao
    // existe, e por isso ela responde 404 a qualquer token; esta leitura
    // depende de `handles`, `users`, `pets`, `user_connections` e
    // `user_showcase_images`, e as cinco estao em `origin/development`
    // (migracoes `...021`, `...030`, `...031`, `...032` e `...040`). Ela
    // funciona de ponta a ponta no dia em que sobe.
    //
    // **`criarLeitorDeConexao` e a primeira implementacao de
    // `connections/ports/conexao.ts`**, que estava declarada e sem ninguem do
    // outro lado desde 18/10. Ela entrega TRES LEITURAS e nenhuma escrita: o
    // repositorio inteiro tem `pedir`, `aceitar` e `encerrar`, e nada disso
    // atravessa a porta.
    //
    // **O bloqueio NAO entra por porta aqui, e e de proposito:** o predicado
    // de bloqueio desta fatia e a funcao SQL `bloqueio_entre`, chamada na
    // clausula `WHERE` das duas consultas -- que e a forma que a propria
    // `src/architecture.rules.mjs` registra para ele. Por isso `people` nao
    // recebe `semBloqueioConhecido`: ele nao tem um leitor de bloqueio
    // desligado para ligar depois.
    registrarRotasDePessoa(escopo, {
      perfis: new PerfilDePessoa({
        perfis: criarPerfilDePessoaRepository(db),
        conexoes: criarLeitorDeConexao(conexoesDaComunidade),
        // 20/10/2026. A tela de destino do link e do QR
        // (`resolveConnectionInvite`) resolve o token e reusa `porApelido`:
        // o link leva a MESMA `PersonProfile` de `getPersonProfile`, pela
        // mesma projecao. Entra por `connections/ports/`, que e o caminho que
        // a regra de fronteira oferece -- `people` continua sem tabela e sem
        // escrita.
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
    // BICHUS-45. O perfil publico por `/@{slug}`, sem conta.
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
    // O MURAL (20/10/2026): `GET /timeline`, `GET|POST /me/publications`,
    // `DELETE /me/publications/{ref}` e a intencao de envio da foto. As cinco
    // exigem conta sem alternativa vazia, e **nao existe leitura de publicacao
    // de quem nao e conexao aceita** -- nao ha `GET /publications/{ref}`, e a
    // ausencia e a defesa: uma segunda leitura por endereco teria de repetir o
    // recorte inteiro num segundo lugar.
    registrarRotasDoMural(escopo, dependenciasDasRotasDoMural);
    registrarRotasDeCasos(escopo, dependenciasDasRotasDeCaso);
    // BICHUS-76. A pagina do caso e o cartaz, pelo `share_token`. O token e a
    // credencial; a conta, quando vem, so decide `can_report_sighting`. As
    // bases sao as mesmas das outras rotas: o link aponta para o site
    // (`WEB_BASE_URL`) e a foto para as derivadas publicas (`MEDIA_PUBLIC_BASE_URL`).
    registrarRotasDaLeituraPublicaDoCaso(escopo, {
      leitura: new LeituraPublicaDoCasoService(criarLeituraPublicaDoCaso(db), {
        baseDaWeb: config.webBaseUrl,
        baseDeMidia: config.mediaPublicBaseUrl,
      }),
      autenticador: dependenciasDasRotasDeCaso.autenticador,
    });
    // A listagem publica de perdidos. **Sem autenticador**: a operacao declara
    // `security: []` e nao ha campo na resposta que varie com quem pede, ao
    // contrario da pagina do caso.
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
    // O ENDERECO DE ENTREGA GUARDADO NA CONTA (cliente, 21/10/2026). Fica ao
    // lado do pedido da plaquinha de proposito: e o MESMO endereco, pelo mesmo
    // tipo de dominio, e e esta rota que faz o formulario do pedido nascer
    // preenchido. Mesmo autenticador do modulo -- as duas rotas sao do dono e
    // de mais ninguem.
    registrarRotasDoEnderecoGuardado(escopo, {
      enderecos: new KyselyEnderecoGuardado(db),
      autenticador: dependenciasDasRotasDeTag.autenticador,
      contrato,
    });

    // O ENDERECO DE ENTREGA DO PET (cliente, 27/10/2026: *"endereco um por
    // pet"*), que **supera** a decisao de 21/10/2026 registrada acima. As duas
    // ficam lado a lado de proposito: e o MESMO tipo de dominio, e quem ler uma
    // sem a outra concluiria que ha duas fontes concorrentes para o endereco do
    // pedido. **Nao ha: a fonte do pedido e o PET.**
    //
    // A de cima NAO foi apagada porque a decisao dele de 26/10/2026 e "nao
    // apague nada", e porque foi daquela tabela que a `20261027000001` copiou o
    // endereco para os pets de cada tutor.
    //
    // Mesmo autenticador do modulo -- as duas rotas sao do tutor e de mais
    // ninguem, e a autorizacao mora no `WHERE` do repositorio (JOIN com `pets`,
    // 404 e nunca 403).
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
      // A foto do participante que e conexao aceita (emenda 3 do ADR-0010,
      // 19/10/2026). Mesma base das outras derivadas publicas.
      baseDeMidia: config.mediaPublicBaseUrl,
      // A foto da MENSAGEM (BICHUS-35). Outra coisa, e por isso outra
      // dependencia: esta vive em balde PRIVADO e sai assinada, curta.
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
    // ADR-0027. O prefixo `/v1/admin`, com a guarda instalada UMA vez no
    // escopo. Sem `ADMIN_ORIGIN` ele nao e registrado e responde 404, que era o
    // estado ate aqui: nenhum ambiente serve a superficie administrativa sem
    // saber de que origem ela aceita escrita. As rotas administrativas de
    // outros modulos (Loja, Rede) entram DENTRO deste bloco; fora dele a
    // fronteira de `registrarRota` derruba a subida.
    if (config.adminOrigin !== undefined) {
      escoparRotasAdministrativas(
        escopo,
        { origem: config.adminOrigin, sessoes: sessaoAdministrativa },
        (administrativo) => {
          registrarRotasDaSessaoAdministrativa(administrativo, { sessoes: sessaoAdministrativa, contrato });
          // BICHUS-266/267. A escrita da Loja e a intencao de envio de imagem.
          registrarRotasDaLojaAdministrativa(administrativo, { catalogo: catalogoAdministrativo, contrato });
          // BICHUS-273/292. A escrita da Rede e a fila de pedidos.
          registrarRotasDaRedeAdministrativa(administrativo, { rede: redeAdministrativa, contrato });
          // BICHUS-189. A escrita do diretorio de `Perto`: o menu que faltava
          // no painel. Ate 17/10/2026 nao havia escrita nenhuma, e as entradas
          // de qualquer destino vinham de `src/bin/seed.ts`.
          registrarRotasDoDiretorioAdministrativo(administrativo, {
            diretorio: diretorioAdministrativo,
            contrato,
          });
          // 18/10/2026. A FILA DE REVISAO das indicacoes do `Perto`. Fica ao
          // lado da escrita do diretorio de proposito: aprovar uma indicacao
          // GRAVA uma entrada, pela mesma transacao e pela mesma funcao.
          // A FILA DAS DUVIDAS (29/10/2026): a porta de saida do botao `Ajuda`.
          registrarRotasDaFilaDeAjuda(administrativo, dependenciasDasRotasDaFilaDeAjuda);
          registrarRotasDaFilaDeIndicacoes(administrativo, {
            fila: filaDeIndicacoes,
            contrato,
          });

          // A BUSCA DE CEP, uma integracao e uma so (decisao do cliente de
          // 18/10). Ela nasce aqui, na superficie administrativa, porque o
          // chamador que existe hoje e o formulario de entrada do diretorio --
          // e porque resposta com logradouro e inexprimivel sem conta
          // (`portao-contrato-publico`) e o painel nao tem Bearer (D36). O
          // aplicativo passa a usar a MESMA porta quando a rota dele existir:
          // o adaptador nao muda.
          registrarRotaDeBuscaDeCep(administrativo, { cep: criarBuscaDeCep() });
          // A fila dos pedidos da plaquinha. A TELA e da sessao Backoffice;
          // daqui sai so o que ela chama.
          registrarRotasDaFilaDePlaquinhas(administrativo, { fila: filaDePlaquinhas, contrato });
          // A FILA DE MODERACAO (18/10/2026). `conversation_reports` gravava
          // denuncia desde 28/09 e NENHUMA rota do painel a resolvia.
          registrarRotasDaFilaDeModeracao(administrativo, { fila: filaDeModeracao, contrato });
          // O COMUNICADO. Fica DENTRO deste bloco como todas as outras: fora
          // dele a fronteira de `registrarRota` derruba a subida, e e isso que
          // garante que nenhuma escrita administrativa suba sem a guarda de
          // papel, cookie, `Origin` e `X-CSRF-Token` na frente.
          registrarRotasDeComunicado(administrativo, {
            comunicados: comunicadosAdministrativos,
            contrato,
          });
        },
      );
    } else {
      app.log.warn('ADMIN_ORIGIN ausente: o prefixo /v1/admin nao foi registrado');
    }
    // O VEREDITO DE VERSAO (pedido do cliente, 19/10/2026). Fica ao lado da
    // sonda porque as duas sao `tags: [ops]`, e DELIBERADAMENTE separada dela:
    // o motivo inteiro esta no cabecalho de `version-status-routes.ts`.
    //
    // Sem autenticador, e sem nada do escopo de identidade: a rota responde
    // sem conta e nao fala de pessoa nenhuma.
    registrarRotaDoVereditoDeVersao(escopo, {
      politica: criarLeituraDaPoliticaDeVersao(db),
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
