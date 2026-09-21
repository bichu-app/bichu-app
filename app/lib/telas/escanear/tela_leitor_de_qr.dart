import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../pet/textos_do_cadastro.dart';
import 'mascara_do_codigo_da_tag.dart';

/// Os estados desenhados de F2.1.
enum EstadoDoLeitor {
  /// Figma `87:14`. O visor, a moldura e a instrucao.
  visor,

  /// Figma `87:26`. A camera nao abre; `Digitar o código` sobe para acao
  /// principal.
  permissaoNegada,

  /// Figma `87:40`. O codigo foi lido e a resolucao e no servidor.
  semConexao,

  /// **Nao desenhado.** O campo que `Digitar o código` abre. Ver a nota na
  /// classe.
  digitando,
}

/// F2.1 — Leitor de QR. Figma `87:14`, `87:26` e `87:40`.
///
/// **Esta tela nao leva barra de topo, e isso e desenho e nao esquecimento.**
/// Ela e a aba `Escanear`, um destino de primeiro nivel da casca de abas, e
/// destino de aba nao tem saida propria: a saida e a propria barra inferior. A
/// barra de topo aparece em F1.3, F1.4, F1.5 e F1.6 porque as quatro cobrem a
/// casca; aqui ela seria uma segunda navegacao concorrendo com a primeira.
///
/// **A barra inferior vem do codigo, e nao do Figma.** O componente
/// `NavigationBar` **nao existe** no arquivo de design: os quadros de F2.1
/// desenham o visor e a barra de acao fixa, e nenhum deles desenha a barra de
/// quatro abas. A barra que esta tela recebe e a `CascaComAbas`, que ja existia
/// e ja segue o paragrafo 11.11 do design system (quatro itens, rotulo sempre
/// visivel, 48 dp por item). Nao desenhei um componente novo para tapar o
/// buraco; a ausencia esta relatada.
///
/// **A camera nunca e o unico caminho.** `Digitar o código` esta presente nos
/// tres estados desenhados e e alcancavel por teclado e por leitor de tela. O
/// caminho de quem nao consegue escanear nao pode estar escondido atras do
/// fracasso do caminho principal.
///
/// **O que este build nao faz, e por que.** Nao ha leitor de QR embarcado:
/// nenhum plugin de camera entrou no `pubspec.yaml` nesta rodada, e por isso
/// `CameraEGaleria` responde [EstadoDaPermissao.indisponivel] e a tela abre
/// direto no caminho alternativo. O visor desenhado esta implementado e e o
/// que aparece quando a permissao for concedida; o que falta para ligar a
/// camera de verdade nao e tela, e sim o plugin, a declaracao de uso no
/// `Info.plist` e no `AndroidManifest.xml` com a justificativa que a revisao
/// da loja cobra, e verificacao em aparelho, porque camera nao se verifica em
/// simulador.
///
/// **`GET /v1/tags/{code}` tambem nao existe no servidor ainda.** A tela chama
/// o contrato e trata os quatro desfechos por `type`; enquanto nao houver
/// rota, a chamada termina em falha e a tela mostra o texto da falha. Nenhuma
/// resposta e simulada.
class TelaLeitorDeQr extends StatefulWidget {
  const TelaLeitorDeQr({super.key});

  @override
  State<TelaLeitorDeQr> createState() => _TelaLeitorDeQrState();
}

class _TelaLeitorDeQrState extends State<TelaLeitorDeQr> {
  final TextEditingController _codigo = TextEditingController();
  final FocusNode _focoDoCodigo = FocusNode();

  EstadoDoLeitor _estado = EstadoDoLeitor.visor;
  EstadoDaPermissao _permissao = EstadoDaPermissao.negada;

  /// O codigo que foi lido e ainda nao resolveu. E o que a tela de sem conexao
  /// mostra, para a pessoa conseguir guarda-lo.
  String? _codigoLido;

  int _tentativa = 0;
  int _segundosParaTentar = 0;
  Timer? _contagem;
  bool _resolvendo = false;
  MensagemDeErro? _faixa;

  /// A mensagem efemera do codigo que nao e do Bichu, dita **sem sair da
  /// camera** (Figma `87:18`).
  String? _avisoNoVisor;

  /// Tres tentativas automaticas, de 5 em 5 segundos, com o estado visivel.
  static const int _maximoDeTentativas = 3;
  static const int _esperaEntreTentativas = 5;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

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
    _codigo.dispose();
    _focoDoCodigo.dispose();
    super.dispose();
  }

  Future<void> _consultarPermissao() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() {
      _permissao = estado;
      _estado = estado == EstadoDaPermissao.concedida
          ? EstadoDoLeitor.visor
          // Negada, negada permanentemente e sem camera no aparelho levam a
          // mesma tela: a que oferece a digitacao. O que muda entre elas e o
          // texto e a existencia do caminho para os ajustes.
          : EstadoDoLeitor.permissaoNegada;
    });
  }

  Future<void> _abrirAjustes() async {
    await Escopo.of(context).camera.abrirAjustesDoSistema();
  }

  void _irParaDigitacao() {
    setState(() => _estado = EstadoDoLeitor.digitando);
    _focoDoCodigo.requestFocus();
  }

  /// Resolve o codigo contra `GET /v1/tags/{code}`.
  ///
  /// **A decisao e por `type`, nunca por status**: os quatro desfechos sao
  /// `tag-code-malformed` (400), `tag-code-not-found` (404), `tag-revoked`
  /// (410, com `next_action`) e `rate-limited` (429), e as quatro mensagens
  /// carregam **a mesma saida**. Um `if (status == 400)` acerta hoje por sorte
  /// e erra calado no dia em que outro tipo sair com o mesmo status.
  Future<void> _resolver(String codigo) async {
    _contagem?.cancel();
    setState(() {
      _codigoLido = codigo;
      _resolvendo = true;
      _faixa = null;
    });

    try {
      await Escopo.of(context).tags.resolver(codigo);
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        // F2.2 (achei este pet) e F2.3 (modo dono) sao de outras historias e
        // nao estao desenhadas nesta rodada. O codigo resolveu e a tela diz
        // isso sem abrir uma tela que nao existe.
        _faixa = const MensagemDeErro(
          texto: 'Este código é de uma tag do Bichu. A tela do pet chega na '
              'próxima entrega.',
        );
      });
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
        _faixa = MensagensDeErro.de(falha);
        if (_estado == EstadoDoLeitor.semConexao) {
          _estado = EstadoDoLeitor.digitando;
        }
      });
    }
  }

  /// Nova tentativa automatica em 5 s, tres vezes, **com o estado visivel**.
  ///
  /// Depois disso, `Tentar de novo` manual e `Copiar o código`, para a pessoa
  /// guardar: quem esta sem sinal com um animal no colo precisa poder anotar o
  /// codigo e sair dali.
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
      if (codigo != null) _resolver(codigo);
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
      // Sem `appBar`: esta tela e a aba `Escanear`, e a navegacao dela e a
      // barra inferior da casca.
      bottomNavigationBar: BarraDeAcaoFixa(acoes: _acoes()),
      body: switch (_estado) {
        EstadoDoLeitor.visor => _Visor(aviso: _avisoNoVisor),
        EstadoDoLeitor.permissaoNegada => _PermissaoNegada(
            permanente: _permissao == EstadoDaPermissao.negadaPermanentemente,
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
          ),
      },
    );
  }

  List<Widget> _acoes() {
    return switch (_estado) {
      // No visor, `Digitar o código` e a saida sempre visivel -- secundaria,
      // porque a acao principal ali e apontar a camera.
      EstadoDoLeitor.visor => <Widget>[
          BotaoSecundario(
            rotulo: TextosDoCadastro.digitarOCodigo,
            aoTocar: _irParaDigitacao,
          ),
        ],
      // Com a camera fora, `Digitar o código` **sobe para acao principal**: a
      // acao principal e a que resolve, e nao a que a tela preferia.
      EstadoDoLeitor.permissaoNegada => <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.digitarOCodigo,
            critico: true,
            aoTocar: _irParaDigitacao,
          ),
          if (_permissao == EstadoDaPermissao.negadaPermanentemente ||
              _permissao == EstadoDaPermissao.negada)
            TextButton(
              onPressed: _abrirAjustes,
              child: const Text(TextosDoCadastro.abrirOsAjustes),
            ),
        ],
      EstadoDoLeitor.semConexao => <Widget>[
          BotaoPrimario(
            rotulo: MensagensDeErro.tentarDeNovo,
            critico: true,
            carregando: _resolvendo,
            aoTocar: () {
              final codigo = _codigoLido;
              if (codigo != null) _resolver(codigo);
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
            aoTocar: () {
              final digitado = _codigo.text.trim();
              if (digitado.isEmpty) return;
              _resolver(digitado);
            },
          ),
          // A saida comum as quatro telas de falha do codigo (UX 12.4). Ela
          // fica aqui, e nao so no erro: quem esta com um animal agora nao
          // precisa do codigo, e descobrir isso **antes** de errar tres vezes
          // e o que impede o beco.
          TextButton(
            // F3.5 e de outra historia.
            onPressed: null,
            child: Text(MensagensDeErro.registrarAchado),
          ),
        ],
    };
  }
}

/// O visor: tela cheia, fundo preto, mascara e a janela de leitura.
///
/// O visor **fixa o modo escuro** na colecao de cor: e assim que os papeis
/// resolvem sozinhos numa superficie escura, sem ninguem escolher tom a mao. A
/// barra de acao volta ao modo claro porque ela e superficie do app, e nao
/// camera. A manteiga nao entra sobre a imagem da camera: 1.73:1 contra o
/// marfim, e pior ainda sobre video. O contorno de leitura e o marfim.
class _Visor extends StatelessWidget {
  const _Visor({this.aviso});

  final String? aviso;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return Theme(
      data: Theme.of(context).copyWith(
        extensions: <ThemeExtension<dynamic>>[BichuColors.temaEscuro],
      ),
      child: ColoredBox(
        color: const Color(0xFF000000),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Semantics(
                header: true,
                child: Text(
                  'Aponte para o QR da coleira',
                  textAlign: TextAlign.center,
                  style: textos.titleLarge?.copyWith(
                    color: const Color(0xFFFFFFFF),
                  ),
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),
              Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(BichuRaio.xl),
                  border: Border.all(
                    // Marfim, e nao `action-fill`: a manteiga sobre a imagem
                    // da camera some.
                    color: const Color(0xFFFFFFFF),
                    width: BichuBorda.thick,
                  ),
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),
              if (aviso != null)
                Semantics(
                  liveRegion: true,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: BichuEspaco.e6,
                    ),
                    child: Text(
                      aviso!,
                      textAlign: TextAlign.center,
                      style: textos.bodyLarge?.copyWith(
                        color: const Color(0xFFFFFFFF),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Figma `87:26`. A camera nao abre.
class _PermissaoNegada extends StatelessWidget {
  const _PermissaoNegada({required this.permanente});

  /// Verdadeiro quando pedir de novo **nao abre dialogo nenhum**, e o unico
  /// caminho sao os ajustes do sistema.
  final bool permanente;

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
            Icons.photo_camera_outlined,
            size: 48,
            color: cores.primary,
            semanticLabel: '',
          ),
          const SizedBox(height: BichuEspaco.e6),
          Semantics(
            header: true,
            child: Text(
              'O Bichu precisa da câmera para ler o QR',
              style: textos.headlineSmall,
            ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          Text(
            'Você pode liberar a câmera nos ajustes do aparelho. Se preferir '
            'não liberar, dá para digitar o código que está impresso na tag.',
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (permanente) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            Text(
              MensagensDeErro.ajudaDoCampoDeCodigo,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
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
            // A contagem e anunciada **uma vez no inicio e uma ao terminar**,
            // e nao a cada segundo: regiao viva que fala de segundo em segundo
            // nao deixa o resto da tela ser lido.
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
              border:
                  Border.all(color: cores.outline, width: BichuBorda.hairline),
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
///
/// **Este estado nao esta desenhado no Figma.** O quadro `87:14` desenha o
/// botao `Digitar o código` e os tres estados que ele pode ter atras de si,
/// mas nao o campo. Ele existe assim mesmo porque a alternativa era um botao
/// visivel que nao faz nada, e porque a entrada manual e o caminho de quem nao
/// consegue escanear -- ela nao pode estar atras do fracasso do caminho
/// principal.
///
/// **Nenhuma frase nova foi inventada aqui.** O rotulo do campo e o texto do
/// proprio controle que o abre (`Digitar o código`, escrito em F2.1 e
/// desenhado no Figma), a ajuda e a linha de 12.4 do UX, e os erros sao os
/// quatro tipos de 12.6. Falta o desenho, e ele esta pedido.
class _Digitacao extends StatelessWidget {
  const _Digitacao({
    required this.controlador,
    required this.foco,
    required this.faixa,
  });

  final TextEditingController controlador;
  final FocusNode foco;
  final MensagemDeErro? faixa;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          const SizedBox(height: BichuEspaco.e6),
          BichuField(
            rotulo: TextosDoCadastro.digitarOCodigo,
            controlador: controlador,
            foco: foco,
            ajuda: MensagensDeErro.ajudaDoCampoDeCodigo,
            correcaoAutomatica: false,
            capitalizacao: TextCapitalization.characters,
            acaoDeTeclado: TextInputAction.done,
            // A mascara `XXXX-XXXX-XXXX-XXXX` (ADR-0004, Emenda 1). Ela formata
            // e nao valida: o simbolo de verificacao e conferido no servidor, e
            // continua sendo, porque duas fontes para a mesma regra divergem.
            formatadores: const <TextInputFormatter>[MascaraDoCodigoDaTag()],
            exemplo: 'XXXX-XXXX-XXXX-XXXX',
          ),
          if (faixa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            FaixaDeAviso(texto: faixa!.texto),
          ],
        ],
      ),
    );
  }
}
