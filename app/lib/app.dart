import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'api/busca_de_cep.dart';
import 'api/achados_api.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/casos_api.dart';
import 'api/conexoes_api.dart';
import 'api/convites_api.dart';
import 'api/devices_api.dart';
import 'api/diretorio_api.dart';
import 'api/loja_api.dart';
import 'api/me_api.dart';
import 'api/notificacoes_api.dart';
import 'api/envio_de_foto.dart';
import 'api/fila_offline.dart';
import 'api/fotos_pendentes.dart';
import 'api/cache_de_imagens.dart';
import 'api/imagem_do_qr.dart';
import 'api/pets_api.dart';
import 'api/passkeys_api.dart';
import 'api/sonda_de_conexao.dart';
import 'api/versao_api.dart';
import 'config/app_config.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/avisos_recebidos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'dispositivo/credencial_do_aparelho.dart';
import 'dispositivo/oportunidades_de_aviso.dart';
import 'dispositivo/passkey_neste_aparelho.dart';
import 'sessao/localizacao_da_sessao.dart';
import 'sessao/cidade_escolhida.dart';
import 'sessao/contador_de_avisos.dart';
import 'sessao/registro_do_aviso_de_cadastro.dart';
import 'dispositivo/vigia_de_aviso.dart';
import 'dispositivo/leitor_de_qr.dart';
import 'dispositivo/localizacao.dart';
import 'api/conversas_api.dart';
import 'dispositivo/distintivo_do_aplicativo.dart';
import 'api/contadores_api.dart';
import 'sessao/contadores_de_nao_lido.dart';
import 'escopo.dart';
import 'intencao/leitura_como_intencao.dart';
import 'intencao/cadastro_de_pet_como_intencao.dart';
import 'intencao/achado_como_intencao.dart';
import 'intencao/caso_de_perdido_como_intencao.dart';
import 'intencao/deposito_de_intencao.dart';
import 'intencao/guarda_de_acao.dart';
import 'intencao/intencao_pendente.dart';
import 'roteamento/rotas.dart';
import 'sessao/controlador_de_sessao.dart';
import 'sessao/fiacao_do_passkey.dart';
import 'sessao/deposito_de_sessao.dart';
import 'telas/perfil/meus_pets.dart';
import 'telas/atualizacao/portao_de_versao.dart';
import 'theme/bichu_theme.dart';
import 'widgets/imagem_em_cache.dart';

/// A raiz do app.
class BichuApp extends StatefulWidget {
  const BichuApp({
    required this.config,
    super.key,
    this.deposito,
    this.clienteHttp,
    this.camera,
    this.leitorDeQr,
    this.credencialDoAparelho,
    this.avisos,
    this.mensagensDePush,
    this.localizacao,
    this.depositoDeIntencao,
    this.cacheDeMeusPets,
    this.depositoDaCidade,
    this.cofreDoQr,
    this.cacheDeImagens,
    this.depositoDeOportunidades,
    this.depositoDePasskeyNoAparelho,
    this.depositoDoAvisoDeCadastro,
    this.agora,
    this.depositoDaFila,
    this.depositoDeFotos,
    this.distintivoDoApp,
  });

  final AppConfig config;

  /// Injetavel para teste. Em producao e `null`, e `ContadoresDeNaoLido` cai em
  /// [DistintivoInerte].
  final DistintivoDoAplicativo? distintivoDoApp;

  /// Injetavel para teste. Em producao e o chaveiro do sistema.
  final DepositoDeSessao? deposito;

  /// Injetavel para teste. Em producao e o cliente HTTP do proprio pacote.
  final http.Client? clienteHttp;

  /// Injetavel para teste. Em producao e [CameraDoAparelho] desde a BICHUS-161.
  final CameraEGaleria? camera;

  /// Injetavel para teste. Em producao e [LeitorDeQrDoAparelho] desde a
  /// BICHUS-54.
  final LeitorDeQr? leitorDeQr;

  /// A folha de credencial do sistema, ou `null` para a de verdade.
  final CredencialDoAparelho? credencialDoAparelho;

  /// Injetavel para teste. Em producao e [AvisosPorFirebase] quando o `main()`
  /// conseguiu inicializar o Firebase, e [AvisosNaoEmbarcados] quando nao.
  final Avisos? avisos;

  /// Injetavel para teste. Em producao e [MensagensDePushPorFirebase] quando o
  /// `main()` conseguiu inicializar o Firebase, e
  /// [MensagensDePushNaoEmbarcadas] quando nao.
  final MensagensDePush? mensagensDePush;

  /// Injetavel para teste. Em producao e [LocalizacaoPorGeolocator].
  final Localizacao? localizacao;

  /// Injetavel para teste. Em producao e um arquivo no diretorio do app.
  final DepositoDaIntencao? depositoDeIntencao;

  /// Injetavel para teste. Em producao nasce vazio a cada arranque, porque e
  /// cache de memoria e nao de disco.
  final CacheDeMeusPets? cacheDeMeusPets;

  /// Onde a ultima cidade escolhida na listagem de perdidos e guardada.
  final DepositoDaCidade? depositoDaCidade;

  /// Injetavel para teste, pelo mesmo motivo do [cacheDeMeusPets]: um caso
  /// precisa conseguir OLHAR dentro dele depois do logout, e o que ele guarda e
  /// uma credencial.
  final CofreDaImagemDoQr? cofreDoQr;

  /// O CACHE DE IMAGEM NO APARELHO (BICHUS-296).
  final CacheDeImagensNoAparelho? cacheDeImagens;

  /// Onde o registro das duas oportunidades mora (BICHUS-24).
  final DepositoDeOportunidades? depositoDeOportunidades;

  /// Onde mora a marca de "ha credencial digital neste aparelho" (28/10/2026).
  final DepositoDePasskeyNoAparelho? depositoDePasskeyNoAparelho;

  /// Onde o registro de dispensas do aviso persistente mora (BICHUS-75).
  final DepositoDoAvisoDeCadastro? depositoDoAvisoDeCadastro;

  /// O relogio do ciclo de 7 dias do criterio 4 da BICHUS-75.
  final DateTime Function()? agora;
  /// Injetavel para teste. Em producao e um arquivo no diretorio do app.
  final DepositoDaFila? depositoDaFila;

  /// Onde o registro de fotos pendentes mora.
  final DepositoDeFotosPendentes? depositoDeFotos;

  @override
  State<BichuApp> createState() => _BichuAppState();
}

/// A raiz observa o ciclo de vida por causa da fila offline.
class _BichuAppState extends State<BichuApp> with WidgetsBindingObserver {
  late final ApiClient _api;
  late final AuthApi _auth;
  late final PetsApi _pets;
  late final CasosApi _casos;
  late final ConexoesApi _conexoes;
  late final ConvitesApi _convites;
  late final MeApi _me;
  late final AchadosApi _achados;
  late final DiretorioApi _diretorio;
  late final LojaApi _loja;
  late final EnvioDeFoto _envioDeFoto;
  late final BuscaDeCep _buscaDeCep;
  late final FotosPendentes _fotosPendentes;
  late final RetomadaDeFotos _retomadaDeFotos;
  late final FilaOffline _fila;
  late final RetomadaDaFila _retomadaDaFila;
  late final TagsApi _tags;
  late final DevicesApi _devices;
  late final CameraEGaleria _camera;
  late final LeitorDeQr _leitorDeQr;
  late final PasskeysApi _passkeys;
  late final CredencialDoAparelho _credencialDoAparelho;
  late final PasskeyNesteAparelho _passkeyNesteAparelho;
  late final FiacaoDoPasskey _passkey;
  late final Avisos _avisos;
  late final Localizacao _localizacao;
  late final LocalizacaoDaSessao _localizacaoDaSessao;
  late final ControladorDeSessao _sessao;
  late final GuardaDeAcao _guarda;
  late final GoRouter _roteador;
  late final CacheDeMeusPets _cacheDeMeusPets;
  late final CidadeEscolhida _cidadeEscolhida;
  late final CofreDaImagemDoQr _cofreDoQr;
  late final CacheDeImagensNoAparelho? _cacheDeImagens;
  late final OportunidadesDeAviso _oportunidades;
  late final AvisoDeCadastro _avisoDeCadastro;
  late final VigiaDeAviso _vigiaDeAviso;
  late final OuvinteDeAvisos _avisosRecebidos;
  late final ConversasApi _conversas;

  late final ContadoresDeNaoLido _contadores;
  late final ContadorDeAvisos _contadorDeAvisos;

  late final VersaoApi _versao;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cacheDeMeusPets = widget.cacheDeMeusPets ?? CacheDeMeusPets();
    _cidadeEscolhida = CidadeEscolhida(deposito: widget.depositoDaCidade);
    _cofreDoQr = widget.cofreDoQr ?? CofreDaImagemDoQr();
    _cacheDeImagens = widget.cacheDeImagens;
    _api = ApiClient(
      config: widget.config,
      cliente: widget.clienteHttp,
      tokenDeAcesso: () => _sessao.tokenValido(),
    );
    _auth = AuthApi(_api);
    _versao = VersaoApi(_api);
    _pets = PetsApi(_api);
    _casos = CasosApi(_api);
    _conexoes = ConexoesApi(_api);
    _convites = ConvitesApi(_api);
    _me = MeApi(_api);
    _achados = AchadosApi(_api);
    _diretorio = DiretorioApi(_api);
    _loja = LojaApi(_api);
    _conversas = ConversasApi(_api);
    _contadores = ContadoresDeNaoLido(
      _conversas,
      secoes: ContadoresApi(_api),
      cidade: _cidadeEscolhida,
      distintivo: widget.distintivoDoApp,
    );
    _fila = FilaOffline(
      deposito: widget.depositoDaFila ?? DepositoEmArquivo(),
    );
    _retomadaDaFila = RetomadaDaFila(fila: _fila, api: _api);
    _tags = TagsApi(_api);
    _devices = DevicesApi(_api);
    _camera = widget.camera ?? const CameraDoAparelho();
    _buscaDeCep = BuscaDeCep(cliente: widget.clienteHttp);
    _envioDeFoto = EnvioDeFoto(
      camera: _camera,
      cliente: widget.clienteHttp,
    );
    _fotosPendentes = FotosPendentes(
      deposito: widget.depositoDeFotos ?? DepositoDeFotosEmArquivo(),
    );
    _retomadaDeFotos = RetomadaDeFotos(
      envio: _envioDeFoto,
      registro: _fotosPendentes,
      pets: _pets,
    );
    _leitorDeQr = widget.leitorDeQr ?? const LeitorDeQrDoAparelho();
    _passkeys = PasskeysApi(_api);
    _credencialDoAparelho =
        widget.credencialDoAparelho ?? CredencialDoAparelhoReal();
    _passkeyNesteAparelho = PasskeyNesteAparelho(
      deposito:
          widget.depositoDePasskeyNoAparelho ?? DepositoDePasskeyEmArquivo(),
      agora: widget.agora ?? DateTime.now,
    );
    _passkey = FiacaoDoPasskey(
      passkeys: _passkeys,
      aparelho: _credencialDoAparelho,
      registro: _passkeyNesteAparelho,
    );
    _avisos = widget.avisos ?? const AvisosNaoEmbarcados();
    _oportunidades = OportunidadesDeAviso(
      deposito: widget.depositoDeOportunidades ??
          DepositoDeOportunidadesEmArquivo(),
    );
    _avisoDeCadastro = AvisoDeCadastro(
      deposito: widget.depositoDoAvisoDeCadastro ?? DepositoDoAvisoEmArquivo(),
      agora: widget.agora ?? DateTime.now,
    );
    _vigiaDeAviso = VigiaDeAviso(avisos: _avisos, devices: _devices)..ligar();
    _contadorDeAvisos = ContadorDeAvisos(
      notificacoes: NotificacoesApi(_api),
    );
    _avisosRecebidos = OuvinteDeAvisos(
      mensagens: widget.mensagensDePush ?? const MensagensDePushNaoEmbarcadas(),
    );
    _localizacao = widget.localizacao ?? LocalizacaoPorGeolocator();
    _localizacaoDaSessao = LocalizacaoDaSessao(_localizacao);
    _guarda = GuardaDeAcao(
      deposito: widget.depositoDeIntencao ?? DepositoDeIntencaoEmArquivo(),
      rotaDaTela: Rotas.rotaDaTelaDeUx,
      acoes: <AcaoDeIntencao, AcaoExecutavel>{
        AcaoDeIntencao.cadastrarPet: cadastroDePetExecutavel(_pets),
        AcaoDeIntencao.marcarPerdido: casoDePerdidoExecutavel(_pets, _casos),
        AcaoDeIntencao.registrarAchado: achadoExecutavel(_achados),
        AcaoDeIntencao.verConteudo: leituraExecutavel(),
      },
    );
    _sessao = ControladorDeSessao(
      auth: _auth,
      deposito: widget.deposito ?? DepositoNoChaveiro(),
      guardaDeAcao: _guarda,
      limpezasAoSair: <LimpezaAoSair>[
        () async => _cacheDeMeusPets.limpar(),
        _cofreDoQr.limpar,
        _fila.limpar,
        _fotosPendentes.limpar,
        _avisoDeCadastro.limpar,
        () async => _contadores.esquecer(),
        () async => _contadorDeAvisos.limpar(),
        () async => _cacheDeImagens?.esquecerTodasAsPessoas(),
      ],
      aoEntrar: <AoEntrar>[
        _vigiaDeAviso.esquecerEReconciliar,
        _contadores.atualizar,
        _contadorDeAvisos.atualizar,
      ],
    );
    _roteador = criarRoteador(_sessao);
    unawaited(
      _arrancar().catchError((Object erro) {
        debugPrint(
          'A fila de arranque parou antes do fim ($erro). O app ja esta de pe; '
          'o que ficou para tras sao as retomadas (fotos, fila, contadores).',
        );
      }),
    );
  }

  Future<void> _arrancar() async {
    await _sessao.iniciar();
    await _avisosRecebidos.ligar();
    await _retomarAsFotos();
    await _drenarAFila();
    await _contarNaoLidas();
    await _contarOsAvisos();
  }

  Future<void> _contarOsAvisos() async {
    if (await _sessao.tokenValido() == null) return;
    await _contadorDeAvisos.atualizar();
  }

  Future<void> _drenarAFila() async {
    try {
      if (await _sessao.tokenValido() == null) return;
      await _retomadaDaFila.drenar();
    } on Object {
      return;
    }
  }

  Future<void> _retomarAsFotos() async {
    try {
      if (await _sessao.tokenValido() == null) return;
      await _retomadaDeFotos.retomarTudo();
    } on Object {
      return;
    }
  }

  Future<void> _contarNaoLidas() async {
    try {
      if (await _sessao.tokenValido() == null) return;
      await _contadores.atualizar();
    } on Object {
      return;
    }
  }

  /// O app voltou para o primeiro plano: a fila drena **e o contador
  /// pergunta**.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    unawaited(_drenarAFila());
    unawaited(_contarNaoLidas());
    unawaited(_contarOsAvisos());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _vigiaDeAviso.dispose();
    _contadorDeAvisos.dispose();
    _avisosRecebidos.dispose();
    _sessao.dispose();
    _contadores.dispose();
    _envioDeFoto.fechar();
    _api.fechar();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Escopo(
      api: _api,
      auth: _auth,
      passkeys: _passkeys,
      pets: _pets,
      casos: _casos,
      conexoes: _conexoes,
      convites: _convites,
      me: _me,
      diretorio: _diretorio,
      loja: _loja,
      achados: _achados,
      envioDeFoto: _envioDeFoto,
      buscaDeCep: _buscaDeCep,
      retomadaDeFotos: _retomadaDeFotos,
      fila: _fila,
      tags: _tags,
      devices: _devices,
      camera: _camera,
      leitorDeQr: _leitorDeQr,
      credencialDoAparelho: _credencialDoAparelho,
      passkeyNesteAparelho: _passkeyNesteAparelho,
      passkey: _passkey,
      avisos: _avisos,
      avisosRecebidos: _avisosRecebidos,
      oportunidades: _oportunidades,
      vigiaDeAviso: _vigiaDeAviso,
      localizacao: _localizacao,
      localizacaoDaSessao: _localizacaoDaSessao,
      sessao: _sessao,
      guarda: _guarda,
      cacheDeMeusPets: _cacheDeMeusPets,
      cidadeEscolhida: _cidadeEscolhida,
      cofreDoQr: _cofreDoQr,
      avisoDeCadastro: _avisoDeCadastro,
      contadores: _contadores,
      contadorDeAvisos: _contadorDeAvisos,
      cacheDeImagens: _cacheDeImagens,
      child: _comCacheDeImagens(
        MaterialApp.router(
        title: 'Bichu',
        debugShowCheckedModeBanner: false,
        theme: BichuTheme.claro,
        darkTheme: BichuTheme.escuro,
        themeMode: ThemeMode.system,
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        supportedLocales: const <Locale>[Locale('pt', 'BR')],
        routerConfig: _roteador,
        builder: (context, filho) {
          final escala = MediaQuery.textScalerOf(context).clamp(
            minScaleFactor: 1,
            maxScaleFactor: 2,
          );
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: escala),
            child: PortaoDeVersao(
              versaoApi: _versao,
              versaoDoApp: widget.config.versaoDoApp,
              sonda: SondaDeConexao(_api),
              child: filho ?? const SizedBox.shrink(),
            ),
          );
        },
        ),
      ),
    );
  }

  Widget _comCacheDeImagens(Widget filho) {
    final cache = _cacheDeImagens;
    if (cache == null) return filho;
    return CacheDeImagensDoAplicativo(cache: cache, child: filho);
  }
}
