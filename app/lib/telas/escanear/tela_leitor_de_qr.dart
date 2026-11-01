import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../dispositivo/leitor_de_qr.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import '../pet/textos_do_cadastro.dart';
import 'codigo_lido_do_qr.dart';
import 'convite_lido_do_qr.dart';
import 'mascara_do_codigo_da_tag.dart';

/// O que a saida sobreposta ocupa, contada do topo da area segura.
const double alturaDaSaidaSobreposta =
    BichuEspaco.e2 + BichuAlvoDeToque.critico;

/// Os estados de F2.1.
enum EstadoDoLeitor {
  /// O primeiro quadro, enquanto a porta responde qual e o estado da permissao.
  consultando,

  /// Figma `87:14`. A camera esta ligada e o leitor procura um simbolo.
  procurando,

  /// Figma `87:26`. A permissao foi negada, desta vez ou de vez.
  permissaoNegada,

  /// Este build nao le QR (macOS, web, teste de widget), ou o sistema bloqueou
  /// a camera por politica.
  semLeitor,

  /// Figma `87:40`. O codigo foi lido e a resolucao e no servidor.
  semConexao,

  /// **Nao desenhado.** O campo que `Digitar o código` abre.
  digitando,
}

/// F2.1 — Leitor de QR. Figma `87:14` (visor), `87:26` (permissao negada),
/// `87:18` (o aviso efemero) e `87:40` (sem conexao).
class TelaLeitorDeQr extends StatefulWidget {
  const TelaLeitorDeQr({super.key});

  /// A frase do criterio 1, **agora desenhada**.
  static const String instrucaoDoVisor = 'Aponte para o QR da coleira';

  /// O titulo de [EstadoDoLeitor.semLeitor].
  static const String tituloSemLeitura =
      'Este aparelho não lê o QR pela câmera';

  /// A explicacao de [EstadoDoLeitor.semLeitor].
  static const String explicacaoSemLeitura =
      'A leitura por câmera não está disponível aqui. O código impresso na '
      'tag chega no mesmo lugar: digite e siga daqui.';

  /// O titulo de [EstadoDoLeitor.permissaoNegada].
  static const String tituloPermissaoNegada =
      'A câmera está desligada para o Bichu';

  /// A explicacao de [EstadoDoLeitor.permissaoNegada].
  static const String explicacaoPermissaoNegada =
      'Sem a câmera não dá para ler o QR da coleira. O código impresso na tag '
      'chega no mesmo lugar, e ele está logo abaixo do QR na plaquinha.';

  /// O rotulo que **abre o dialogo do sistema**, e por isso diz o que vai
  /// acontecer antes de acontecer.
  static const String ligarACamera = 'Ligar a câmera';

  /// O criterio 3: o QR lido nao e do Bichu.
  static const String naoEDoBichu =
      'Este código não é do Bichu. Tente de novo.';

  /// Criterio 6, regiao viva: o leitor esta procurando.
  static const String procurandoCodigo = 'Procurando código';

  /// Criterio 6, regiao viva: o leitor achou.
  static const String codigoEncontrado = 'Código encontrado';

  /// Regiao viva do **outro** QR que este leitor le: o convite de conexao.
  static const String conviteEncontrado = 'Convite encontrado';

  /// O convite nao resolve: **vencido, revogado e inexistente sao o mesmo
  /// 404**, e esta frase nao distingue os tres.
  static const String conviteNaoVale =
      'Este convite não vale mais. Peça um novo para o usuário.';

  /// DEDUZIDO, e e a pergunta fechada desta entrega.
  static const String aindaProcurando =
      'Ainda não achei o código. Se a plaquinha estiver gasta ou riscada, dá '
      'para digitar o código que está embaixo do QR.';

  /// Quanto tempo o leitor procura antes de oferecer a digitacao.
  static const Duration esperaAteAOfertaManual = Duration(seconds: 12);

  /// Quanto tempo o aviso do criterio 3 fica na tela.
  static const Duration duracaoDoAvisoEfemero = Duration(seconds: 4);

  @override
  State<TelaLeitorDeQr> createState() => _TelaLeitorDeQrState();
}

class _TelaLeitorDeQrState extends State<TelaLeitorDeQr> {
  final TextEditingController _codigo = TextEditingController();
  final FocusNode _focoDoCodigo = FocusNode();

  EstadoDoLeitor _estado = EstadoDoLeitor.consultando;

  EstadoDaPermissao _permissao = EstadoDaPermissao.negada;

  String? _codigoLido;

  bool _codigoFoiDigitado = false;

  String? _erroDoCampo;

  int _tentativa = 0;
  int _segundosParaTentar = 0;
  Timer? _contagem;
  Timer? _ofertaManual;
  Timer? _limparAviso;
  bool _resolvendo = false;

  bool _rotaSobreposta = false;

  bool _demorou = false;
  MensagemDeErro? _faixa;
  String? _avisoEfemero;

  bool _iniciou = false;

  static const int _maximoDeTentativas = 3;
  static const int _esperaEntreTentativas = 5;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _consultarPermissao();
  }

  @override
  void dispose() {
    _contagem?.cancel();
    _ofertaManual?.cancel();
    _limparAviso?.cancel();
    _codigo.dispose();
    _focoDoCodigo.dispose();
    super.dispose();
  }

  Future<void> _consultarPermissao() async {
    final escopo = Escopo.of(context);
    if (!escopo.leitorDeQr.embarcado) {
      setState(() => _estado = EstadoDoLeitor.semLeitor);
      return;
    }
    final estado = await escopo.camera.estadoDaCamera();
    if (!mounted) return;
    setState(() {
      _permissao = estado;
      _estado = _telaDaPermissao(estado);
    });
    if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
  }

  EstadoDoLeitor _telaDaPermissao(EstadoDaPermissao permissao) {
    return switch (permissao) {
      EstadoDaPermissao.concedida => EstadoDoLeitor.procurando,
      EstadoDaPermissao.negada ||
      EstadoDaPermissao.negadaPermanentemente => EstadoDoLeitor.permissaoNegada,
      EstadoDaPermissao.indisponivel => EstadoDoLeitor.semLeitor,
    };
  }

  Future<void> _ligarACamera() async {
    final camera = Escopo.of(context).camera;
    if (_permissao != EstadoDaPermissao.negada) return;
    final novo = await camera.pedirCamera();
    if (!mounted) return;
    setState(() {
      _permissao = novo;
      _estado = _telaDaPermissao(novo);
    });
    if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
  }

  void _comecarAProcurar() {
    _demorou = false;
    _ofertaManual?.cancel();
    _ofertaManual = Timer(TelaLeitorDeQr.esperaAteAOfertaManual, () {
      if (!mounted) return;
      setState(() => _demorou = true);
    });
  }

  void _aoLer(LeituraDeQr leitura) {
    if (_resolvendo || _rotaSobreposta) return;

    final codigo = codigoDeTagDoQr(
      leitura.conteudo,
      apiBaseUrl: Escopo.of(context).api.config.apiBaseUrl,
    );

    if (codigo == null) {
      final convite = tokenDeConviteDoQr(leitura.conteudo);
      if (convite != null) {
        anunciar(context, TelaLeitorDeQr.conviteEncontrado);
        unawaited(_resolverConvite(convite));
        return;
      }
      _mostrarAvisoEfemero(TelaLeitorDeQr.naoEDoBichu);
      return;
    }

    anunciar(context, TelaLeitorDeQr.codigoEncontrado);
    _resolver(codigo, digitado: false);
  }

  Future<void> _resolverConvite(String token) async {
    setState(() {
      _resolvendo = true;
      _faixa = null;
      _avisoEfemero = null;
    });
    try {
      final perfil = await Escopo.of(context).convites.resolver(token);
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        _rotaSobreposta = true;
      });
      await _abrirSobreposta(Rotas.perfilDe(perfil.handle), extra: token);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _estado = EstadoDoLeitor.semConexao;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() => _resolvendo = false);
      if (falha.tipo == ProblemTipo.naoEncontrado) {
        _mostrarAvisoEfemero(TelaLeitorDeQr.conviteNaoVale);
        return;
      }
      setState(() => _faixa = MensagensDeErro.de(falha));
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _faixa = MensagensDeErro.de(falha);
      });
    }
  }

  void _mostrarAvisoEfemero(String texto) {
    if (_avisoEfemero == texto && (_limparAviso?.isActive ?? false)) return;
    setState(() => _avisoEfemero = texto);
    _limparAviso?.cancel();
    _limparAviso = Timer(TelaLeitorDeQr.duracaoDoAvisoEfemero, () {
      if (!mounted) return;
      setState(() => _avisoEfemero = null);
    });
  }

  void _irParaDigitacao() {
    _ofertaManual?.cancel();
    setState(() {
      _estado = EstadoDoLeitor.digitando;
      _erroDoCampo = null;
    });
  }

  static String? _textoDaForma(FormaDoCodigo forma, String digitado) {
    return switch (forma) {
      FormaDoCodigo.valida => null,
      FormaDoCodigo.vazia => MensagensDeErro.digiteOCodigo,
      FormaDoCodigo.curta || FormaDoCodigo.longa =>
        MensagensDeErro.codigoComTamanhoDiferente(simbolosDoCodigo(digitado)),
      FormaDoCodigo.foraDoAlfabeto => MensagensDeErro.codigoComCaractereDeFora,
    };
  }

  void _conferirEnquantoDigita(String texto) {
    final forma = formaDoCodigoDeTag(texto.trim());
    final aviso = switch (forma) {
      FormaDoCodigo.longa ||
      FormaDoCodigo.foraDoAlfabeto => _textoDaForma(forma, texto.trim()),
      _ => null,
    };
    if (aviso == _erroDoCampo) return;
    setState(() => _erroDoCampo = aviso);
  }

  void _enviarODigitado() {
    final digitado = _codigo.text.trim();
    final forma = formaDoCodigoDeTag(digitado);
    if (forma != FormaDoCodigo.valida) {
      setState(() {
        _erroDoCampo = _textoDaForma(forma, digitado);
        _faixa = null;
      });
      _focoDoCodigo.requestFocus();
      return;
    }
    setState(() => _erroDoCampo = null);
    _resolver(digitado, digitado: true);
  }

  void _voltarAoCampo() {
    _focoDoCodigo.requestFocus();
    _codigo.selection = TextSelection(
      baseOffset: 0,
      extentOffset: _codigo.text.length,
    );
  }

  Future<void> _resolver(String codigo, {required bool digitado}) async {
    _contagem?.cancel();
    _ofertaManual?.cancel();
    setState(() {
      _codigoLido = codigo;
      _codigoFoiDigitado = digitado;
      _resolvendo = true;
      _faixa = null;
      _avisoEfemero = null;
    });

    try {
      final tag = await Escopo.of(context).tags.resolver(codigo);
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        _rotaSobreposta = true;
      });
      await _abrirSobreposta(Rotas.petDaTagDe(codigo), extra: tag);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _estado = EstadoDoLeitor.semConexao;
      });
      _agendarNovaTentativa();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        _faixa = MensagensDeErro.de(falha, codigoDigitado: _codigoFoiDigitado);
        if (_estado == EstadoDoLeitor.semConexao) {
          _estado = EstadoDoLeitor.digitando;
        }
      });
      if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao resolver o codigo da tag');
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        _faixa = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
        if (_estado == EstadoDoLeitor.semConexao) {
          _estado = EstadoDoLeitor.digitando;
        }
      });
      if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
    }
  }

  Future<void> _abrirSobreposta(String rota, {Object? extra}) async {
    if (!_rotaSobreposta) setState(() => _rotaSobreposta = true);
    await context.push(rota, extra: extra);
    if (!mounted) return;
    setState(() => _rotaSobreposta = false);
    if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
  }

  void _agendarNovaTentativa() {
    if (_tentativa >= _maximoDeTentativas) return;
    _tentativa++;
    setState(() => _segundosParaTentar = _esperaEntreTentativas);
    _contagem?.cancel();
    _contagem = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _segundosParaTentar--);
      if (_segundosParaTentar > 0) return;
      timer.cancel();
      final codigo = _codigoLido;
      if (codigo != null) _resolver(codigo, digitado: _codigoFoiDigitado);
    });
  }

  Future<void> _copiarCodigoLido() async {
    final codigo = _codigoLido;
    if (codigo == null) return;
    await Clipboard.setData(ClipboardData(text: codigo));
    if (!mounted) return;
    anunciar(context, TextosDoCadastro.codigoCopiado);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      bottomNavigationBar: BarraDeAcaoFixa(acoes: _acoes()),
      body: Stack(
        children: <Widget>[
          Positioned.fill(child: _corpo()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(BichuEspaco.e2),
              child: Align(
                alignment: Alignment.topLeft,
                child: SaidaDaTela(
                  tipo: TipoDeSaida.fechar,
                  cor: _estado == EstadoDoLeitor.procurando
                      ? Colors.white
                      : null,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _corpo() {
    return switch (_estado) {
      EstadoDoLeitor.consultando => const SizedBox.expand(),
      EstadoDoLeitor.procurando => _Visor(
        visor: Escopo.of(context).leitorDeQr.visor(aoLer: _aoLer),
        aviso: _avisoEfemero,
        demorou: _demorou,
        resolvendo: _resolvendo,
        faixa: _faixa,
      ),
      EstadoDoLeitor.permissaoNegada => _SemCamera(
        titulo: TelaLeitorDeQr.tituloPermissaoNegada,
        explicacao: TelaLeitorDeQr.explicacaoPermissaoNegada,
        faixaDosAjustes: _permissao == EstadoDaPermissao.negadaPermanentemente,
      ),
      EstadoDoLeitor.semLeitor => _SemCamera(
        titulo: TelaLeitorDeQr.tituloSemLeitura,
        explicacao: TelaLeitorDeQr.explicacaoSemLeitura,
        faixaDosAjustes: false,
        faixaDeAusencia: TextosDoCadastro.cameraNaoEmbarcada,
      ),
      EstadoDoLeitor.semConexao => _SemConexao(
        codigo: _codigoLido ?? '',
        tentativa: _tentativa,
        maximo: _maximoDeTentativas,
        segundos: _segundosParaTentar,
      ),
      EstadoDoLeitor.digitando => _Digitacao(
        controlador: _codigo,
        foco: _focoDoCodigo,
        faixa: _faixa,
        erroDoCampo: _erroDoCampo,
        aoMudar: _conferirEnquantoDigita,
        tecladoAberto: MediaQuery.viewInsetsOf(context).bottom > 0,
      ),
    };
  }

  Widget _acaoDeDigitar({required bool principal}) {
    if (principal) {
      return BotaoPrimario(
        rotulo: TextosDoCadastro.digitarOCodigo,
        critico: true,
        aoTocar: _irParaDigitacao,
      );
    }
    return BotaoSecundario(
      rotulo: TextosDoCadastro.digitarOCodigo,
      aoTocar: _irParaDigitacao,
    );
  }

  List<Widget> _acoes() {
    return switch (_estado) {
      EstadoDoLeitor.consultando => <Widget>[_acaoDeDigitar(principal: true)],
      EstadoDoLeitor.procurando => <Widget>[
        _acaoDeDigitar(principal: _demorou),
      ],
      EstadoDoLeitor.permissaoNegada => <Widget>[
        _acaoDeDigitar(principal: true),
        if (_permissao == EstadoDaPermissao.negada)
          BotaoSecundario(
            rotulo: TelaLeitorDeQr.ligarACamera,
            aoTocar: _ligarACamera,
          ),
      ],
      EstadoDoLeitor.semLeitor => <Widget>[_acaoDeDigitar(principal: true)],
      EstadoDoLeitor.semConexao => <Widget>[
        BotaoPrimario(
          rotulo: MensagensDeErro.tentarDeNovo,
          critico: true,
          carregando: _resolvendo,
          aoTocar: () {
            final codigo = _codigoLido;
            if (codigo != null) _resolver(codigo, digitado: _codigoFoiDigitado);
          },
        ),
        TextButton(
          onPressed: _copiarCodigoLido,
          child: const Text(TextosDoCadastro.copiarOCodigo),
        ),
      ],
      EstadoDoLeitor.digitando => <Widget>[
        BotaoPrimario(
          rotulo: 'Continuar',
          critico: true,
          carregando: _resolvendo,
          aoTocar: _enviarODigitado,
        ),
        if (_faixa?.texto == MensagensDeErro.codigoNaoEncontradoDigitado)
          TextButton(
            onPressed: _voltarAoCampo,
            child: const Text(MensagensDeErro.digitarDeNovo),
          ),
        TextButton(
          onPressed: () => _abrirSobreposta(Rotas.registrarAchado),
          child: const Text(MensagensDeErro.registrarAchado),
        ),
      ],
    };
  }
}

/// A largura do lado da janela de leitura, em dp.
double ladoDaJanelaDeLeitura(Size tela) {
  final proporcional = tela.shortestSide * 0.68;
  return proporcional.clamp(160.0, 280.0);
}

/// Figma `87:14`. A camera ao vivo, a moldura, e o que se diz enquanto procura.
class _Visor extends StatelessWidget {
  const _Visor({
    required this.visor,
    required this.aviso,
    required this.demorou,
    required this.resolvendo,
    required this.faixa,
  });

  /// O widget que a porta produziu, ja embrulhado em
  /// [SuperficieDeLeituraAoVivo].
  final Widget visor;

  /// O aviso efemero do criterio 3, quando ha um.
  final String? aviso;

  /// Se ja passou o tempo de procurar sem achar.
  final bool demorou;

  final bool resolvendo;

  final MensagemDeErro? faixa;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return LayoutBuilder(
      builder: (context, limites) {
        final lado = ladoDaJanelaDeLeitura(
          Size(limites.maxWidth, limites.maxHeight),
        );
        final folgaLateral = (limites.maxWidth - lado) / 2;
        final folgaDeCima =
            ((limites.maxHeight - lado) / 2 - alturaDaSaidaSobreposta / 2)
                .clamp(alturaDaSaidaSobreposta, limites.maxHeight - lado);

        Widget escuridao({
          double? left,
          double? top,
          double? right,
          double? bottom,
          double? width,
          double? height,
        }) {
          return Positioned(
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            width: width,
            height: height,
            child: ColoredBox(color: cores.scrim),
          );
        }

        return Stack(
          fit: StackFit.expand,
          children: <Widget>[
            visor,
            escuridao(left: 0, right: 0, top: 0, height: folgaDeCima),
            escuridao(left: 0, right: 0, top: folgaDeCima + lado, bottom: 0),
            escuridao(
              left: 0,
              width: folgaLateral,
              top: folgaDeCima,
              height: lado,
            ),
            escuridao(
              right: 0,
              width: folgaLateral,
              top: folgaDeCima,
              height: lado,
            ),
            Positioned(
              left: folgaLateral,
              top: folgaDeCima,
              width: lado,
              height: lado,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: cores.surfaceInverse, width: 4),
                  borderRadius: BorderRadius.circular(BichuRaio.md),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(BichuBorda.hairline),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: cores.textOnInverse, width: 2),
                      borderRadius: BorderRadius.circular(BichuRaio.md),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: cores.surfaceInverse,
                      borderRadius: BorderRadius.circular(BichuRaio.md),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(BichuEspaco.e4),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Text(
                            TelaLeitorDeQr.instrucaoDoVisor,
                            textAlign: TextAlign.center,
                            style: textos.titleMedium?.copyWith(
                              color: cores.textOnInverse,
                            ),
                          ),
                          if (demorou) ...<Widget>[
                            const SizedBox(height: BichuEspaco.e2),
                            Semantics(
                              liveRegion: true,
                              child: Text(
                                TelaLeitorDeQr.aindaProcurando,
                                textAlign: TextAlign.center,
                                style: textos.bodyMedium?.copyWith(
                                  color: cores.textOnInverse,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.only(
                    top: alturaDaSaidaSobreposta,
                    left: BichuEspaco.e4,
                    right: BichuEspaco.e4,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      if (faixa != null)
                        FaixaDeAviso(
                          texto: faixa!.texto,
                          rotuloDaAcao: faixa!.acao,
                          aoTocarNaAcao: saidaDaMensagem(context, faixa!),
                        ),
                      if (aviso != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e2),
                        FaixaDeAviso(
                          peso: PesoDaFaixa.informativo,
                          texto: aviso!,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            Semantics(
              liveRegion: true,
              label: resolvendo
                  ? TelaLeitorDeQr.codigoEncontrado
                  : TelaLeitorDeQr.procurandoCodigo,
              container: true,
              child: const SizedBox.shrink(),
            ),
          ],
        );
      },
    );
  }
}

/// A tela de quando a camera nao vai ler: permissao negada, ou ausencia.
class _SemCamera extends StatelessWidget {
  const _SemCamera({
    required this.titulo,
    required this.explicacao,
    required this.faixaDosAjustes,
    this.faixaDeAusencia,
  });

  final String titulo;
  final String explicacao;

  /// Se ha o que liberar nos ajustes do sistema.
  final bool faixaDosAjustes;

  /// A faixa informativa de quando **nao** ha o que liberar.
  final String? faixaDeAusencia;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        children: <Widget>[
          const SizedBox(height: BichuEspaco.e10),
          Icon(
            Icons.keyboard_alt_outlined,
            size: 48,
            color: cores.primary,
            semanticLabel: '',
          ),
          const SizedBox(height: BichuEspaco.e6),
          Semantics(
            header: true,
            child: Text(titulo, style: textos.headlineSmall),
          ),
          const SizedBox(height: BichuEspaco.e4),
          Text(
            explicacao,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (faixaDosAjustes) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: TextosDoCadastro.cameraNegada,
              rotuloDaAcao: TextosDoCadastro.abrirOsAjustes,
              aoTocarNaAcao: () =>
                  Escopo.of(context).camera.abrirAjustesDoSistema(),
            ),
          ],
          if (faixaDeAusencia != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: faixaDeAusencia!,
            ),
          ],
          const SizedBox(height: BichuEspaco.e4),
          Text(
            MensagensDeErro.ajudaDoCampoDeCodigo,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Figma `87:40`. O scan leu o codigo localmente e a resolucao e no servidor.
class _SemConexao extends StatelessWidget {
  const _SemConexao({
    required this.codigo,
    required this.tentativa,
    required this.maximo,
    required this.segundos,
  });

  final String codigo;
  final int tentativa;
  final int maximo;
  final int segundos;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        children: <Widget>[
          const SizedBox(height: BichuEspaco.e10),
          const FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: MensagensDeErro.semConexaoEnfileirada,
          ),
          const SizedBox(height: BichuEspaco.e6),
          Semantics(
            header: true,
            child: Text(
              'Lemos o código, mas estamos sem conexão. Vamos tentar de novo.',
              style: textos.headlineSmall,
            ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          Semantics(
            liveRegion: segundos == maximo || segundos == 0,
            child: Text(
              'Tentativa $tentativa de $maximo · nova tentativa em '
              '$segundos s',
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ),
          const SizedBox(height: BichuEspaco.e6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(BichuEspaco.e4),
            decoration: BoxDecoration(
              color: cores.surfaceSunken,
              borderRadius: BorderRadius.circular(BichuRaio.md),
              border: Border.all(
                color: cores.outline,
                width: BichuBorda.hairline,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Código lido',
                  style: textos.labelMedium?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
                const SizedBox(height: BichuEspaco.e1),
                SelectableText(codigo, style: textos.titleLarge),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A digitacao do codigo.
class _Digitacao extends StatelessWidget {
  const _Digitacao({
    required this.controlador,
    required this.foco,
    required this.faixa,
    required this.erroDoCampo,
    required this.aoMudar,
    required this.tecladoAberto,
  });

  final TextEditingController controlador;
  final FocusNode foco;
  final MensagemDeErro? faixa;

  /// O que o app viu sozinho na forma do codigo, antes de chamar o servidor.
  final String? erroDoCampo;

  final ValueChanged<String> aoMudar;

  /// Se o teclado esta na tela.
  final bool tecladoAberto;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          const SizedBox(height: alturaDaSaidaSobreposta),
          _EspacoDaPlaquinha(visivel: !tecladoAberto),
          BichuField(
            key: const ValueKey<String>('campo-do-codigo-da-tag'),
            rotulo: TextosDoCadastro.digitarOCodigo,
            controlador: controlador,
            foco: foco,
            ajuda: MensagensDeErro.ajudaDoCampoDeCodigo,
            correcaoAutomatica: false,
            capitalizacao: TextCapitalization.characters,
            acaoDeTeclado: TextInputAction.done,
            formatadores: const <TextInputFormatter>[MascaraDoCodigoDaTag()],
            exemplo: 'XXXX-XXXX-XXXX-XXXX',
            erro: erroDoCampo,
            aoMudar: aoMudar,
          ),
          if (faixa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            FaixaDeAviso(
              texto: faixa!.texto,
              rotuloDaAcao: faixa!.acao,
              aoTocarNaAcao: saidaDaMensagem(context, faixa!),
            ),
          ],
        ],
      ),
    );
  }
}

/// O slot fixo da plaquinha: sempre presente na lista, visivel ou nao.
class _EspacoDaPlaquinha extends StatelessWidget {
  const _EspacoDaPlaquinha({required this.visivel});

  final bool visivel;

  @override
  Widget build(BuildContext context) {
    if (!visivel) return const SizedBox.shrink();
    return const Column(
      children: <Widget>[
        _PlaquinhaDaMarca(),
        SizedBox(height: BichuEspaco.e6),
      ],
    );
  }
}

/// A plaquinha da marca, acima do campo de codigo.
class _PlaquinhaDaMarca extends StatelessWidget {
  const _PlaquinhaDaMarca();

  static const double _largura = 96;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Center(
      child: Moldura(
        largura: _largura,
        estado: EstadoDaMoldura.repouso,
        filho: ColoredBox(
          color: cores.primaryContainer,
          child: const Center(child: MarcaSimbolo(altura: 48)),
        ),
      ),
    );
  }
}
