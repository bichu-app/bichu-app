import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/envio_de_foto.dart';
import '../../api/problem.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../formato/cep.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/faixa_de_imagens.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/saida_da_tela.dart';

/// **Criar um encontro da `Rede`** (`createNetworkEvent`, ADR-0025 emenda 3).
class TelaCriarEncontro extends StatefulWidget {
  const TelaCriarEncontro({super.key, this.agora = DateTime.now});

  /// O relogio, injetavel para o teste de widget.
  final DateTime Function() agora;

  static const String titulo = 'Criar um evento';

  static const String avisoDePublicacao =
      'O evento entra na agenda na hora, visível para todos.';

  static const String rotuloDeMarcar = 'Criar evento';

  /// **A frase mora em `MensagensDeErro`, e esta constante aponta para ela.** O
  /// bloqueio que esta tela sabe de antemao e a recusa do servidor (`409
  /// contact-channel-unverified`, a rede de seguranca de quem confirmou o
  /// e-mail noutro aparelho) sao a MESMA regra, e diziam a mesma coisa em duas
  /// redacoes -- que e o jeito de elas divergirem na primeira correcao.
  static const String semEmailConfirmado =
      MensagensDeErro.canalNaoVerificadoParaCriarEncontro;

  static const String rotuloDeConfirmarEmail = 'Confirmar meu e-mail';

  static const String entreParaMarcar = 'Entre para criar um evento.';

  /// O titulo da secao das imagens.
  ///
  /// **Plural, e o rotulo mudou com o campo** (pedido do cliente, 29/10/2026:
  /// *"nas indicacoes de estabelecimento e eventos so esta sendo possivel
  /// enviar uma imagem no app, devemos deixar enviar ate 4 imagens"*). Deixar
  /// `Foto do evento` no singular com quatro quadros na tela seria o rotulo
  /// desmentindo o campo.
  static const String tituloDaCapa = 'Fotos do evento';

  /// A unica linha de apoio da secao. **A ordem ("a primeira e a capa") e dita
  /// pela propria faixa**, com as imagens na tela -- dizer aqui tambem seria a
  /// segunda redacao da mesma regra.
  static const String ajudaDaCapa =
      'Até 4 fotos. A primeira aparece no cartão do evento. Opcional.';

  static const String tirarAFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String capaProntaParaSalvar =
      'Foto enviada. Toque em criar evento para publicar com ela.';

  static const String capaSemSinal =
      'A foto não subiu: sem conexão agora. Escolha a foto de novo quando '
      'tiver internet.';

  static const String capaRecusada =
      'A foto não foi aceita. Escolha outra foto.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  static const String rotuloDoCep = 'CEP';

  /// **Diz o que o campo faz e que ele NAO vai junto.** Sem esta segunda metade
  /// o campo pareceria endereco do evento, que e exatamente o que o ADR-0027
  /// item 13 nao quer nesta tela.
  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois. O CEP não '
      'é publicado.';

  /// Os tres desfechos da busca.
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaIndisponivel =
      'A busca de CEP está fora do ar. Preencha abaixo.';

  /// O rotulo do campo de estado, que deixou de ser `UF` digitada.
  static const String rotuloDoEstado = 'Estado';

  /// O que o seletor mostra enquanto nada foi escolhido.
  static const String escolherOEstado = 'Escolher na lista';

  @override
  State<TelaCriarEncontro> createState() => _TelaCriarEncontroState();
}

enum _Fase { preenchendo, enviando }

/// O primeiro impedimento, ou nulo.
enum _Impedimento {
  semConta(TelaCriarEncontro.entreParaMarcar),
  semEmailConfirmado(TelaCriarEncontro.semEmailConfirmado),
  semTitulo('Dê um nome ao evento.'),
  semResumo('Diga em uma linha o que vai acontecer.'),
  semLugar('Diga o nome do lugar.'),
  semBairro('Diga o bairro.'),
  semCidade('Diga a cidade.'),
  semUf('Escolha o estado.'),
  semData('Escolha o dia e a hora.'),
  dataNoPassado('O evento precisa ser no futuro.'),
  fimAntesDoComeco('O fim não pode ser antes do começo.'),
  capaSubindo('Espere a foto terminar de subir.');

  const _Impedimento(this.texto);

  final String texto;
}

class _TelaCriarEncontroState extends State<TelaCriarEncontro> {
  final TextEditingController _titulo = TextEditingController();
  final TextEditingController _resumo = TextEditingController();
  final TextEditingController _lugar = TextEditingController();

  /// **Campo de busca, e nao campo do corpo.** Ver o bloco do CEP em
  /// [TelaCriarEncontro].
  final TextEditingController _cep = TextEditingController();

  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _observacoes = TextEditingController();

  /// A sigla do estado escolhida na lista de 27, ou nulo.
  String? _uf;

  /// O que a ultima busca de CEP devolveu.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  DateTime? _comeca;
  DateTime? _termina;

  /// As imagens que já subiram, **na ordem em que a pessoa as pôs**.
  ///
  /// **A primeira é a capa, e não há campo de capa separado** -- é a mesma
  /// leitura de `AdminNetworkEventInput.images`, onde a capa é a `position` 0.
  /// Duas formas de dizer qual é a capa, no mesmo corpo, é o defeito: o
  /// contrato recusa `cover_image` junto de `image_upload_ids` com `400`
  /// (`code: cover_and_images_both_sent`).
  ///
  /// **Só entra aqui o que já tem `upload_id`.** Uma lista de "escolhidas" e
  /// outra de "enviadas" divergiriam na primeira falha de rede.
  final List<_ImagemDoEncontro> _imagens = <_ImagemDoEncontro>[];

  bool _enviandoACapa = false;

  /// A imagem cujos bytes estão **subindo agora**, para a prévia provisória.
  ///
  /// "Apresentar como vai ficar" foi palavra do cliente, e a derivada do
  /// servidor não existe nesse instante.
  FotoLocal? _imagemSubindo;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;

  /// Nomeados pelo `400` do servidor, para marcar o campo em vez de so mostrar
  /// uma faixa.
  Map<String, String> _errosDeCampo = const <String, String>{};

  static const List<String> _ordemDosCampos = <String>[
    'title',
    'summary',
    'place.place_name',
    'place.neighborhood',
    'place.city',
    'place.state',
    'starts_at',
    'ends_at',
    'notes',
  ];

  /// Onde cada campo esta na lista, para rolar ate ele.
  final Map<String, GlobalKey> _ancoras = <String, GlobalKey>{
    for (final String chave in _ordemDosCampos) chave: GlobalKey(),
  };

  /// A rolagem do corpo do formulario.
  final ScrollController _rolagem = ScrollController();

  /// O foco de cada campo de DIGITACAO.
  final Map<String, FocusNode> _focos = <String, FocusNode>{
    for (final String chave in <String>[
      'title',
      'summary',
      'place.place_name',
      'place.neighborhood',
      'place.city',
      'notes',
    ])
      chave: FocusNode(),
  };

  /// **Nasce uma vez e sobrevive a retentativa.** Duas tentativas da mesma
  /// pessoa com o mesmo texto nao podem virar dois encontros na agenda.
  String? _chave;

  bool _preencheu = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_preencheu) return;
    _preencheu = true;
    _lerAPermissaoDaCamera();
  }

  @override
  void dispose() {
    _titulo.dispose();
    _resumo.dispose();
    _lugar.dispose();
    _cep.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _observacoes.dispose();
    for (final FocusNode foco in _focos.values) {
      foco.dispose();
    }
    _rolagem.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
  Future<void> _buscarOCep() async {
    final cep = _cep.text.replaceAll(_soDigitos, '');
    if (cep.length != 8 || cep == _cepJaBuscado) return;
    _cepJaBuscado = cep;

    setState(() {
      _buscandoOCep = true;
      _buscaDoCep = null;
    });

    final resposta = await Escopo.of(context).buscaDeCep.buscar(cep);
    if (!mounted) return;

    setState(() {
      _buscandoOCep = false;
      _buscaDoCep = resposta.resultado;
      final endereco = resposta.endereco;
      if (endereco == null) return;
      _preencherSeVazio(_bairro, endereco.bairro, 'place.neighborhood');
      _preencherSeVazio(_cidade, endereco.cidade, 'place.city');
      final uf = siglaDeEstadoValida(endereco.uf);
      if (_uf == null && uf != null) {
        _uf = uf;
        _errosDeCampo = <String, String>{..._errosDeCampo}
          ..remove('place.state');
      }
    });
  }

  /// Campo vazio recebe; campo escrito fica.
  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _errosDeCampo = <String, String>{..._errosDeCampo}..remove(chave);
  }

  /// A linha que conta o que a busca fez.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        TelaCriarEncontro.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => TelaCriarEncontro.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => TelaCriarEncontro.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

  _Impedimento? get _impedimento {
    final usuario = Escopo.of(context).sessao.usuario;
    if (usuario == null) return _Impedimento.semConta;
    if (!usuario.emailVerificado) return _Impedimento.semEmailConfirmado;
    if (_titulo.text.trim().length < 2) return _Impedimento.semTitulo;
    if (_resumo.text.trim().length < 2) return _Impedimento.semResumo;
    if (_lugar.text.trim().length < 2) return _Impedimento.semLugar;
    if (_bairro.text.trim().length < 2) return _Impedimento.semBairro;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf == null) return _Impedimento.semUf;
    final comeca = _comeca;
    if (comeca == null) return _Impedimento.semData;
    if (!comeca.isAfter(widget.agora())) return _Impedimento.dataNoPassado;
    final termina = _termina;
    if (termina != null && !termina.isAfter(comeca)) {
      return _Impedimento.fimAntesDoComeco;
    }
    if (_enviandoACapa) return _Impedimento.capaSubindo;
    return null;
  }

  /// O estado da camera, lido **antes** de a pessoa tocar em nada.
  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarACapa() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustarACapa(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheuACapa(ajustada);
  }

  Future<void> _escolherACapaDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustarACapa(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheuACapa(ajustada);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  Future<FotoLocal?> _ajustarACapa(CameraEGaleria camera, FotoLocal foto) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.capaDoEncontro,
        titulo: 'Ajuste a capa do encontro',
      );

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// A imagem escolhida **JA SOBE**, e so entra na faixa quando os bytes
  /// chegaram ao armazenamento.
  ///
  /// **A ROTA DE INTENCAO E A QUE JA EXISTE, e nao uma nova**
  /// (`createNetworkEventCoverUploadIntent`, proposito `network_event`): as
  /// quatro imagens tem a mesma geometria, a mesma minima e a mesma derivada, e
  /// nada no envio distingue a segunda da primeira. Quem e a capa e a POSICAO
  /// na lista, e nao o proposito do envio -- uma segunda rota so para dizer
  /// "esta nao e a capa" inventaria uma fronteira que nao existe.
  Future<void> _escolheuACapa(FotoLocal foto) async {
    final recusa =
        recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitosSemHeic);
    if (recusa != null) {
      setState(() => _erro = MensagemDeErro(texto: recusa));
      return;
    }
    // **O teto e conferido AQUI tambem, e nao so no botao desabilitado.** Um
    // toque que escapasse pela janela entre o envio e o `setState` pediria uma
    // quinta assinatura, e cada assinatura e uma autorizacao de escrita que
    // nao se desfaz.
    if (_imagens.length >= FaixaDeImagens.maximoDoContrato) return;

    setState(() {
      _erro = null;
      _enviandoACapa = true;
      _imagemSubindo = foto;
    });

    final escopo = Escopo.of(context);
    final destino = EnvioParaConfirmarDepois(
      pedir: RedeApi(escopo.api).intencaoDeCapaDoEncontro,
    );
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoACapa = false;
      // **A previa provisoria SAI em todos os desfechos.** No caminho que deu
      // certo ela e substituida pela linha definitiva; nos dois que falharam
      // ela tem de desaparecer, senao o `Criar evento` promete uma capa que o
      // corpo nao vai confirmar.
      _imagemSubindo = null;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          final id = destino.uploadId;
          // `uploadId` nulo com desfecho `enviada` nao acontece pelo contrato
          // de `EnvioParaConfirmarDepois`; a guarda existe para que, se
          // acontecesse, a faixa NAO ganhasse uma previa sem identificador.
          if (id != null && id.isNotEmpty) {
            _imagens.add(_ImagemDoEncontro(foto: foto, uploadId: id));
          } else {
            _erro = const MensagemDeErro(
              texto: TelaCriarEncontro.capaRecusada,
            );
          }
        case DesfechoDoEnvio.semSinal:
          _erro = const MensagemDeErro(
            texto: TelaCriarEncontro.capaSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _erro = const MensagemDeErro(
            texto: TelaCriarEncontro.capaRecusada,
          );
      }
    });
  }

  /// Troca a ordem de duas imagens. **A primeira e a capa**, entao mover para o
  /// topo e o jeito de escolher a capa.
  void _moverAImagem(int de, int para) {
    if (de < 0 || de >= _imagens.length) return;
    if (para < 0 || para >= _imagens.length) return;
    setState(() {
      final movida = _imagens.removeAt(de);
      _imagens.insert(para, movida);
    });
  }

  /// Tira a imagem da faixa. **Nao cancela o envio**: nao ha rota de
  /// cancelamento de intencao no contrato, e o varredor recolhe o objeto em dez
  /// minutos.
  void _removerAImagem(int indice) {
    if (indice < 0 || indice >= _imagens.length) return;
    setState(() => _imagens.removeAt(indice));
  }

  /// Dia e hora, nessa ordem, numa escolha so.
  Future<DateTime?> _escolherQuando(DateTime? atual, String ajuda) async {
    final agora = widget.agora();
    final dia = await showDatePicker(
      context: context,
      initialDate: atual ?? agora,
      firstDate: agora,
      lastDate: agora.add(const Duration(days: 365)),
      helpText: ajuda,
    );
    if (dia == null || !mounted) return null;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(atual ?? agora),
      helpText: ajuda,
    );
    if (hora == null || !mounted) return null;
    return DateTime(dia.year, dia.month, dia.day, hora.hour, hora.minute);
  }

  Future<void> _escolherComeco() async {
    final escolhido = await _escolherQuando(_comeca, 'Quando começa');
    if (escolhido == null) return;
    setState(() => _comeca = escolhido);
  }

  Future<void> _escolherFim() async {
    final escolhido = await _escolherQuando(_termina ?? _comeca, 'Quando termina');
    if (escolhido == null) return;
    setState(() => _termina = escolhido);
  }

  Future<void> _marcar() async {
    if (_impedimento != null) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _errosDeCampo = const <String, String>{};
    });

    final corpo = RedeApi.corpoDeCriacao(
      titulo: _titulo.text.trim(),
      resumo: _resumo.text.trim(),
      nomeDoLugar: _lugar.text.trim(),
      bairro: _bairro.text.trim(),
      cidade: _cidade.text.trim(),
      uf: _uf!,
      comecaEm: _comeca!,
      terminaEm: _termina,
      observacoes: _observacoes.text.trim(),
      imagens: _imagens.map((i) => i.uploadId).toList(growable: false),
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      await RedeApi(escopo.api).criar(corpo, idempotencyKey: chave);
      if (!mounted) return;
      context.go(Rotas.rede);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. O evento entra na agenda assim que você '
              'tocar em criar com internet.',
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        setState(() => _fase = _Fase.preenchendo);
        context.push(Rotas.entrar);
        return;
      }
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.criarEncontro,
        );
        _errosDeCampo = _camposRecusados(falha);
      });
      _levarAoPrimeiroRecusado();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.criarEncontro,
        );
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao marcar um encontro');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  /// Os campos que o `400` nomeou, pela frase do servidor.
  void _levarAoPrimeiroRecusado() {
    final String? primeiro = _ordemDosCampos
        .where(_errosDeCampo.containsKey)
        .firstOrNull;
    if (primeiro == null) return;
    _alcancar(primeiro, 0);
  }

  /// Quantos saltos de rolagem o alcance tenta antes de desistir.
  static const int _saltosDeAlcance = 8;

  /// Leva a janela ate [campo] e o centraliza, em no maximo [_saltosDeAlcance]
  /// saltos.
  void _alcancar(String campo, int salto) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final contexto = _ancoras[campo]?.currentContext;
      if (contexto != null) {
        Scrollable.ensureVisible(
          contexto,
          alignment: 0.5,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
        _focos[campo]?.requestFocus();
        return;
      }
      if (salto >= _saltosDeAlcance || !_rolagem.hasClients) return;
      final posicao = _rolagem.position;
      final double passo = posicao.viewportDimension * 0.8;
      final double cru = _estaAcimaDaJanela(campo)
          ? posicao.pixels - passo
          : posicao.pixels + passo;
      final double destino =
          cru.clamp(posicao.minScrollExtent, posicao.maxScrollExtent);
      if (destino == posicao.pixels) return;
      _rolagem.jumpTo(destino);
      _alcancar(campo, salto + 1);
    });
  }

  /// [campo] esta ACIMA da janela?
  bool _estaAcimaDaJanela(String campo) {
    final int alvo = _ordemDosCampos.indexOf(campo);
    bool achouConstruido = false;
    for (final MapEntry<String, GlobalKey> ancora in _ancoras.entries) {
      if (ancora.value.currentContext == null) continue;
      achouConstruido = true;
      if (_ordemDosCampos.indexOf(ancora.key) > alvo) return true;
    }
    return !achouConstruido;
  }

  static Map<String, String> _camposRecusados(FalhaDaApi falha) {
    final mapa = <String, String>{};
    for (final campo in falha.problem.campos) {
      if (campo.campo.isEmpty) continue;
      mapa[campo.campo] = campo.mensagem ?? 'Confira este campo.';
    }
    return mapa;
  }

  @override
  Widget build(BuildContext context) {
    final escopo = Escopo.of(context);
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return AnimatedBuilder(
      animation: escopo.sessao,
      builder: (context, _) {
        final impedimento = _impedimento;
        final enviando = _fase == _Fase.enviando;

        return Scaffold(
          appBar: const BarraDeConta(
            titulo: TelaCriarEncontro.titulo,
            saida: TipoDeSaida.voltar,
          ),
          body: SafeArea(
            top: false,
            bottom: false,
            child: ListView(
              controller: _rolagem,
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TelaCriarEncontro.avisoDePublicacao,
                ),
                if (_erro != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: _erro!.texto,
                    rotuloDaAcao: _erro!.acao,
                    aoTocarNaAcao: _saidaDoErro(context, _erro!),
                  ),
                ],
                if (impedimento == _Impedimento.semConta) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaCriarEncontro.entreParaMarcar,
                    rotuloDaAcao: 'Entrar',
                    aoTocarNaAcao: () => context.push(Rotas.entrar),
                  ),
                ],
                if (impedimento == _Impedimento.semEmailConfirmado) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaCriarEncontro.semEmailConfirmado,
                    rotuloDaAcao: TelaCriarEncontro.rotuloDeConfirmarEmail,
                    aoTocarNaAcao: () => context.push(
                      Rotas.verifiqueSeuEmail,
                      extra: escopo.sessao.usuario?.email ?? '',
                    ),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeImagens(
                  imagens:
                      _imagens.map((i) => i.foto).toList(growable: false),
                  subindo: _imagemSubindo,
                  enviando: _enviandoACapa,
                  permissao: _permissaoDaCamera,
                  textos: const TextosDaFaixaDeImagens(
                    titulo: TelaCriarEncontro.tituloDaCapa,
                    ajuda: TelaCriarEncontro.ajudaDaCapa,
                    tirarAFoto: TelaCriarEncontro.tirarAFoto,
                    escolherDaGaleria: TelaCriarEncontro.escolherDaGaleria,
                    cameraNosAjustes: TelaCriarEncontro.cameraNosAjustes,
                    abrirAjustes: TelaCriarEncontro.abrirAjustes,
                  ),
                  aoTirar: enviando ? null : _tirarACapa,
                  aoEscolher: enviando ? null : _escolherACapaDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                  aoMover: _moverAImagem,
                  aoRemover: _removerAImagem,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  key: _ancoras['title'],
                  foco: _focos['title'],
                  rotulo: 'Nome do evento',
                  controlador: _titulo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['title'],
                  limite: 120,
                  exemplo: 'Caminhada no parque',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['summary'],
                  foco: _focos['summary'],
                  rotulo: 'O que vai acontecer',
                  controlador: _resumo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['summary'],
                  limite: 200,
                  linhas: 2,
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                BichuField(
                  key: _ancoras['place.place_name'],
                  foco: _focos['place.place_name'],
                  rotulo: 'Nome do lugar',
                  controlador: _lugar,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.place_name'],
                  limite: 80,
                  ajuda: 'Um lugar público. Sem endereço.',
                  exemplo: 'Praça da Harmonia',
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: TelaCriarEncontro.rotuloDoCep,
                  controlador: _cep,
                  opcional: true,
                  limite: limiteDoCep,
                  tipoDeTeclado: TextInputType.number,
                  ajuda: TelaCriarEncontro.ajudaDoCep,
                  formatadores: const <TextInputFormatter>[MascaraDeCep()],
                  correcaoAutomatica: false,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                  aoMudar: (valor) {
                    _aoDigitar(valor);
                    _buscarOCep();
                  },
                ),
                if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  _linhaDaBusca(textos),
                ],
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['place.neighborhood'],
                  foco: _focos['place.neighborhood'],
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.neighborhood'],
                  limite: 60,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['place.city'],
                  foco: _focos['place.city'],
                  rotulo: 'Cidade',
                  controlador: _cidade,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.city'],
                  limite: 60,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.done,
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  key: _ancoras['place.state'],
                  rotulo: TelaCriarEncontro.rotuloDoEstado,
                  estadoInicial: TelaCriarEncontro.escolherOEstado,
                  itens: estadosBrasileiros,
                  selecionado: _uf,
                  erro: _errosDeCampo['place.state'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _uf = codigo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Quando', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  key: _ancoras['starts_at'],
                  rotulo: 'Começa',
                  valor: _comeca,
                  aoTocar: enviando ? null : _escolherComeco,
                  erro: _errosDeCampo['starts_at'],
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  key: _ancoras['ends_at'],
                  rotulo: 'Termina',
                  valor: _termina,
                  opcional: true,
                  aoTocar: enviando ? null : _escolherFim,
                  erro: _errosDeCampo['ends_at'],
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  key: _ancoras['notes'],
                  foco: _focos['notes'],
                  rotulo: 'Observações',
                  controlador: _observacoes,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['notes'],
                  opcional: true,
                  linhas: 3,
                  limite: 500,
                  ajuda: 'Sem telefone, e-mail ou link.',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
              ],
            ),
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              if (impedimento != null &&
                  impedimento != _Impedimento.semEmailConfirmado &&
                  impedimento != _Impedimento.semConta)
                _MotivoDoBloqueio(
                  texto: impedimento.texto,
                  cor: cores.textPrimary,
                ),
              BotaoPrimario(
                rotulo: TelaCriarEncontro.rotuloDeMarcar,
                critico: true,
                carregando: enviando,
                aoTocar: impedimento == null && !enviando ? _marcar : null,
              ),
            ],
          ),
        );
      },
    );
  }

  /// A saida da faixa de erro, quando a mensagem tem uma.
  VoidCallback? _saidaDoErro(BuildContext context, MensagemDeErro mensagem) {
    if (mensagem.acao == null) return null;
    final rota = mensagem.rotaDaAcao;
    if (rota != null) return () => context.go(rota);
    if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
      final email = Escopo.of(context).sessao.usuario?.email ?? '';
      return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
    }
    if (mensagem.proximaAcao == ProximaAcao.entrar) {
      return () => context.push(Rotas.entrar);
    }
    return null;
  }
}

/// Uma IMAGEM DO ENCONTRO que **ja esta no armazenamento**.
///
/// A previa e o `upload_id` andam juntos de proposito: uma lista de previas e
/// outra de identificadores divergiriam na primeira remocao, e a tela mostraria
/// uma imagem cujo identificador foi para outra posicao do corpo -- o que, aqui,
/// quer dizer outra CAPA.
@immutable
class _ImagemDoEncontro {
  const _ImagemDoEncontro({required this.foto, required this.uploadId});

  /// O arquivo no aparelho, para a miniatura.
  final FotoLocal foto;

  /// O que `createNetworkEvent` vai confirmar em `image_upload_ids`.
  final String uploadId;
}

/// Uma data e hora escolhida, ou o convite para escolher.
class _Quando extends StatelessWidget {
  const _Quando({
    required this.rotulo,
    required this.valor,
    required this.aoTocar,
    this.opcional = false,
    this.erro,
    super.key,
  });

  final String rotulo;
  final DateTime? valor;
  final VoidCallback? aoTocar;
  final bool opcional;
  final String? erro;

  /// `dd/mm/aaaa às HHhMM`, sem `intl`: o app nao traz o pacote, e uma
  /// dependencia nova por uma linha de texto e custo que a historia nao pede.
  static String comoTexto(DateTime quando) {
    String d(int n) => n.toString().padLeft(2, '0');
    return '${d(quando.day)}/${d(quando.month)}/${quando.year} '
        'às ${d(quando.hour)}h${d(quando.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhido = valor;
    final nome = opcional ? '$rotulo (opcional)' : rotulo;

    return Semantics(
      button: true,
      label: escolhido == null
          ? '$nome, nada escolhido'
          : '$nome, ${comoTexto(escolhido)}',
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: erro == null ? cores.outlineControl : cores.error,
              width: BichuBorda.hairline,
            ),
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    ExcludeSemantics(
                      child: Text(
                        nome,
                        style: textos.labelLarge
                            ?.copyWith(color: cores.textSecondary),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    ExcludeSemantics(
                      child: Text(
                        escolhido == null ? 'Escolher' : comoTexto(escolhido),
                        style: textos.bodyLarge
                            ?.copyWith(color: cores.textPrimary),
                      ),
                    ),
                    if (erro != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        erro!,
                        style:
                            textos.bodySmall?.copyWith(color: cores.error),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.event_outlined, color: cores.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// O motivo pelo qual o botao esta desabilitado, dito em voz alta.
class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}
