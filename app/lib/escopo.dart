import 'package:flutter/widgets.dart';

import 'api/busca_de_cep.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/achados_api.dart';
import 'api/casos_api.dart';
import 'api/conexoes_api.dart';
import 'api/convites_api.dart';
import 'api/devices_api.dart';
import 'api/diretorio_api.dart';
import 'api/loja_api.dart';
import 'api/me_api.dart';
import 'api/envio_de_foto.dart';
import 'api/fotos_pendentes.dart';
import 'api/fila_offline.dart';
import 'api/cache_de_imagens.dart';
import 'api/imagem_do_qr.dart';
import 'api/pets_api.dart';
import 'api/passkeys_api.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/avisos_recebidos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'dispositivo/credencial_do_aparelho.dart';
import 'dispositivo/oportunidades_de_aviso.dart';
import 'dispositivo/passkey_neste_aparelho.dart';
import 'sessao/localizacao_da_sessao.dart';
import 'sessao/cidade_escolhida.dart';
import 'sessao/registro_do_aviso_de_cadastro.dart';
import 'dispositivo/vigia_de_aviso.dart';
import 'dispositivo/leitor_de_qr.dart';
import 'dispositivo/localizacao.dart';
import 'intencao/guarda_de_acao.dart';
import 'telas/perfil/meus_pets.dart';
import 'sessao/contadores_de_nao_lido.dart';
import 'sessao/contador_de_avisos.dart';
import 'sessao/controlador_de_sessao.dart';
import 'sessao/fiacao_do_passkey.dart';

/// As dependencias do app, entregues pela arvore de widgets.
class Escopo extends InheritedWidget {
  const Escopo({
    required this.api,
    required this.auth,
    required this.passkeys,
    required this.pets,
    required this.casos,
    required this.conexoes,
    required this.convites,
    required this.me,
    required this.diretorio,
    required this.loja,
    required this.achados,
    required this.envioDeFoto,
    this.buscaDeCep = const BuscaDeCep(),
    required this.retomadaDeFotos,
    required this.fila,
    required this.tags,
    required this.devices,
    required this.camera,
    required this.leitorDeQr,
    required this.credencialDoAparelho,
    required this.passkeyNesteAparelho,
    required this.passkey,
    required this.avisos,
    required this.avisosRecebidos,
    required this.oportunidades,
    required this.vigiaDeAviso,
    required this.localizacao,
    required this.localizacaoDaSessao,
    required this.sessao,
    required this.guarda,
    required this.cacheDeMeusPets,
    required this.cidadeEscolhida,
    required this.cofreDoQr,
    required this.avisoDeCadastro,
    required this.contadores,
    required this.contadorDeAvisos,
    required super.child,
    this.cacheDeImagens,
    super.key,
  });

  final ApiClient api;
  final AuthApi auth;

  /// As quatro operacoes de passkey do contrato (BICHUS-301).
  final PasskeysApi passkeys;
  final PetsApi pets;

  /// As rotas de caso de perdido (`tags: [lost]` do contrato).
  final CasosApi casos;

  /// A porta das CONEXOES entre pessoas (18/10/2026).
  final ConexoesApi conexoes;

  /// As rotas `tags: [connection-invites]` do contrato: emitir, revogar e
  /// resolver o convite do proprio perfil.
  final ConvitesApi convites;

  /// As rotas `tags: [me]` do contrato: os dados pessoais do tutor.
  final MeApi me;

  /// O diretorio de `Perto` (`tags: [directory]` do contrato).
  final DiretorioApi diretorio;

  /// A vitrine de `Loja` (`tags: [store]` do contrato).
  final LojaApi loja;

  /// As rotas de achado avulso (`tags: [found]` do contrato), ligadas pela
  /// BICHUS-35.
  final AchadosApi achados;

  /// **O unico caminho de bytes do app** (22/09/2026).
  final EnvioDeFoto envioDeFoto;

  /// A busca de endereco por CEP, para poupar digitacao no pedido da plaquinha.
  final BuscaDeCep buscaDeCep;

  /// O envio da foto **mais o registro do que ficou pendente** (BICHUS-87,
  /// criterios 6 e 7).
  final RetomadaDeFotos retomadaDeFotos;

  /// A fila de acoes sem conexao (BICHUS-31), **ligada pela BICHUS-21**.
  final FilaOffline fila;

  final TagsApi tags;
  final DevicesApi devices;

  /// A fronteira com o aparelho.
  final CameraEGaleria camera;

  /// A leitura de QR ao vivo (BICHUS-54).
  final LeitorDeQr leitorDeQr;

  /// A folha de credencial do sistema operacional.
  final CredencialDoAparelho credencialDoAparelho;

  /// O sinal LOCAL de que ha credencial digital neste aparelho (28/10/2026).
  final PasskeyNesteAparelho passkeyNesteAparelho;

  /// A sequencia servidor-aparelho-servidor do passkey.
  final FiacaoDoPasskey passkey;

  /// A fronteira com o servico de notificacao.
  final Avisos avisos;

  /// O ouvinte dos avisos que CHEGAM (os tres estados do push).
  final OuvinteDeAvisos avisosRecebidos;

  /// Quais das DUAS oportunidades de UX 10.1 ja foram gastas neste aparelho
  /// (BICHUS-24).
  final OportunidadesDeAviso oportunidades;

  /// Quem reconcilia a permissao de aviso quando ela muda com o app aberto.
  final VigiaDeAviso vigiaDeAviso;
  /// A fronteira com a localizacao do aparelho (BICHUS-23).
  final Localizacao localizacao;

  /// O QUE O APARELHO JA DISSE, compartilhado por TODAS as secoes.
  final LocalizacaoDaSessao localizacaoDaSessao;

  final ControladorDeSessao sessao;

  /// A guarda de acao (UX 8.3): o envelope de intencao pendente e a execucao
  /// dele depois do login.
  final GuardaDeAcao guarda;

  /// O cache de leitura de `Perfil` › `Meus pets` (criterio 7 da BICHUS-62).
  final CacheDeMeusPets cacheDeMeusPets;

  /// A ultima cidade escolhida na listagem publica de perdidos, **neste
  /// aparelho**.
  final CidadeEscolhida cidadeEscolhida;

  /// Onde a imagem do QR da tag fica depois de baixada (BICHUS-229).
  final CofreDaImagemDoQr cofreDoQr;

  /// O CACHE DE IMAGEM NO APARELHO (BICHUS-296), ou **nulo**.
  final CacheDeImagensNoAparelho? cacheDeImagens;

  /// O registro de dispensas do aviso persistente de cadastro (BICHUS-75).
  final AvisoDeCadastro avisoDeCadastro;

  /// O CONTADOR DE NAO LIDO que a barra de baixo pinta (20/10/2026).
  final ContadoresDeNaoLido contadores;
  /// O NUMERO DO SINO da barra de topo (19/10/2026).
  final ContadorDeAvisos contadorDeAvisos;

  static Escopo of(BuildContext context) {
    final escopo = context.dependOnInheritedWidgetOfExactType<Escopo>();
    if (escopo == null) {
      throw FlutterError(
        'Escopo nao encontrado. Toda tela do Bichu precisa estar sob o '
        'Escopo montado em main().',
      );
    }
    return escopo;
  }

  @override
  bool updateShouldNotify(Escopo anterior) =>
      api != anterior.api ||
      auth != anterior.auth ||
      pets != anterior.pets ||
      casos != anterior.casos ||
      me != anterior.me ||
      achados != anterior.achados ||
      envioDeFoto != anterior.envioDeFoto ||
      buscaDeCep != anterior.buscaDeCep ||
      retomadaDeFotos != anterior.retomadaDeFotos ||
      fila != anterior.fila ||
      tags != anterior.tags ||
      devices != anterior.devices ||
      camera != anterior.camera ||
      leitorDeQr != anterior.leitorDeQr ||
      avisos != anterior.avisos ||
      avisosRecebidos != anterior.avisosRecebidos ||
      oportunidades != anterior.oportunidades ||
      vigiaDeAviso != anterior.vigiaDeAviso ||
      localizacao != anterior.localizacao ||
      localizacaoDaSessao != anterior.localizacaoDaSessao ||
      sessao != anterior.sessao ||
      guarda != anterior.guarda ||
      cacheDeMeusPets != anterior.cacheDeMeusPets ||
      cidadeEscolhida != anterior.cidadeEscolhida ||
      cofreDoQr != anterior.cofreDoQr ||
      avisoDeCadastro != anterior.avisoDeCadastro ||
      contadores != anterior.contadores ||
      contadorDeAvisos != anterior.contadorDeAvisos ||
      cacheDeImagens != anterior.cacheDeImagens;
}
