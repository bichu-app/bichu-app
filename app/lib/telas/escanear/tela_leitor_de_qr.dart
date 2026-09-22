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
import '../../widgets/saida_da_tela.dart';
import '../pet/textos_do_cadastro.dart';
import 'mascara_do_codigo_da_tag.dart';

/// O que a saida sobreposta ocupa, contada do topo da area segura.
///
/// **Nao e um numero escolhido: e a soma dos dois que ja existiam.** A saida
/// e posicionada com [BichuEspaco.e2] de folga e o alvo dela e o piso critico
/// de 64 dp (design system 6.5). Como ela fica **por cima** dos quatro
/// estados, todo conteudo desenhado na faixa esquerda do topo precisa comecar
/// depois desta linha.
///
/// Ele existe escrito assim, e nao somado a mao em cada estado, porque foi
/// somado a mao que o defeito nasceu: os estados desenhados abriam com
/// 24 + 40 = 64 dp, o comentario do `build` afirmava "folga de 64 dp", e a
/// saida ocupa 72. No estado `digitando`, o unico sem quadro no Figma, a
/// abertura era 16 + 24 = 40 e o `x` caia em cima do rotulo do campo. Um
/// numero derivado nao diverge quando alguem mexe no alvo.
const double alturaDaSaidaSobreposta =
    BichuEspaco.e2 + BichuAlvoDeToque.critico;

/// Os estados que F2.1 tem **enquanto a BICHUS-54 nao existe**.
enum EstadoDoLeitor {
  /// A tela de abertura: a leitura por camera nao existe nesta versao, e o
  /// caminho que existe e digitar o codigo.
  ///
  /// **Nao ha quadro no Figma para este estado**, porque ele nao e um estado
  /// do leitor: e a ausencia do leitor. Os quadros `87:14` (o visor) e `87:26`
  /// (a permissao negada) continuam valendo, e voltam com a BICHUS-54.
  semLeitura,

  /// Figma `87:40`. O codigo foi lido e a resolucao e no servidor.
  semConexao,

  /// **Nao desenhado.** O campo que `Digitar o código` abre. Ver a nota na
  /// classe.
  digitando,
}

/// F2.1 — Leitor de QR. Figma `87:40`; os quadros `87:14` e `87:26` voltam
/// com a BICHUS-54, e a nota "a tela parou de fingir" mais abaixo diz por que
/// eles sairam.
///
/// **Esta tela nao leva barra de topo nem barra inferior de abas, e isso e
/// desenho.** O design system 11.11 lista o leitor de camera entre as telas em
/// que a barra nao aparece: sao telas de tarefa unica. Uma barra de topo aqui
/// competiria com o visor, que ocupa a tela inteira.
///
/// **O que mudou na BICHUS-164, e a consequencia que vem junto.** `Escanear`
/// deixou de ser aba (o rotulo pedia 71,57 dp num slot de 64,0) e passou a ser
/// rota irma da casca, alcancada por `push` das duas portas de 27.5.6: a
/// primaria em `Pets` e a de conta em `Perfil`. Enquanto era aba, a saida
/// **era a propria barra inferior** -- tocar em outra aba saia daqui. Sem a
/// barra, essa saida sumiu, e uma tela sem barra e sem saida e exatamente o
/// beco da BICHUS-157. Por isso entrou a [SaidaDaTela] sobreposta no canto
/// superior esquerdo: ela existe **sempre**, inclusive quando a tela e
/// alcancada por link direto com a pilha vazia, e nesse caso cai no escape.
/// Ela fica sobreposta, e nao numa barra, porque o visor nao pode encolher.
///
/// **A barra inferior vem do codigo, e nao do Figma.** O componente
/// `NavigationBar` **nao existe** no arquivo de design: os quadros de F2.1
/// desenham o visor e a barra de acao fixa, e nenhum deles desenha a barra de
/// quatro abas. A barra que esta tela recebe e a `CascaComAbas`, que ja existia
/// e ja segue o paragrafo 11.11 do design system (quatro itens, rotulo sempre
/// visivel, 48 dp por item). Nao desenhei um componente novo para tapar o
/// buraco; a ausencia esta relatada.
///
/// **A camera nunca e o unico caminho.** `Digitar o código` esta presente em
/// todos os estados e e alcancavel por teclado e por leitor de tela. O caminho
/// de quem nao consegue escanear nao pode estar escondido atras do fracasso do
/// caminho principal.
///
/// ## A TELA PAROU DE FINGIR QUE E UMA CAMERA (achado em aparelho, 22/09)
///
/// **O que havia aqui.** Com a permissao concedida, esta tela desenhava fundo
/// preto de borda a borda, uma moldura branca de 240 x 240 e a frase
/// [TelaLeitorDeQr.instrucaoDoVisor]. **Nenhum widget de camera existia na
/// arvore**, e nenhum plugin de leitura existe no `pubspec.yaml`. A pessoa
/// apontava o aparelho para a coleira e ficava esperando um quadrado preto que
/// nunca ia ler nada. O cliente encontrou isso no primeiro teste em aparelho
/// fisico.
///
/// **Por que a permissao deixou de decidir a tela.** A camera nao e o que
/// falta: o que falta e o leitor (BICHUS-54, `To Do`, declarada fora do escopo
/// da BICHUS-161 por escrito). Com o leitor inexistente, a permissao de camera
/// nao muda nada do que esta tela consegue fazer, e ramificar por ela produzia
/// uma segunda promessa que o app nao cumpre: `Abrir os ajustes` convidava a
/// liberar uma permissao que nao destravava leitura nenhuma. Por isso ha um
/// estado so, [EstadoDoLeitor.semLeitura], e ele diz o que e verdade.
///
/// **O que a BICHUS-54 precisa repor**, e nada disso se perdeu de vista: o
/// visor do quadro `87:14` com o preview de verdade atras dele; a tela de
/// permissao negada do quadro `87:26` com os tres estados de
/// [EstadoDaPermissao] e o caminho para os ajustes; o aviso efemero do
/// `87:18` para o codigo que nao e do Bichu, dito sem sair da camera; e, fora
/// da tela, o plugin, a declaracao de uso no `Info.plist` e no
/// `AndroidManifest.xml` com a justificativa que a revisao da loja cobra, e a
/// verificacao em aparelho, porque camera nao se verifica em simulador. Os
/// tres estados de permissao continuam implementados e medidos na tela que
/// **usa** a camera, F1.4 (`test/telas/cadastrar_foto_test.dart`).
///
/// **`GET /v1/tags/{code}` tambem nao existe no servidor ainda.** A tela chama
/// o contrato e trata os quatro desfechos por `type`; enquanto nao houver
/// rota, a chamada termina em falha e a tela mostra o texto da falha. Nenhuma
/// resposta e simulada.
class TelaLeitorDeQr extends StatefulWidget {
  const TelaLeitorDeQr({super.key});

  /// O titulo de [EstadoDoLeitor.semLeitura].
  ///
  /// **Microcopy nova**, e ela esta marcada como tal na entrega: nao ha frase
  /// no UX nem no Figma para "a funcao ainda nao existe", porque nenhum dos
  /// dois documentos previu entregar a tela antes do leitor. A pergunta
  /// fechada foi devolvida junto com a tela, e esta e a proposta.
  static const String tituloSemLeitura =
      'A leitura por câmera ainda não está pronta';

  /// A explicacao de [EstadoDoLeitor.semLeitura].
  ///
  /// Duas coisas, nesta ordem: o que **nao** existe, e o que existe. A segunda
  /// frase nao e consolo -- a entrada manual e o que a BICHUS-54 chama de
  /// caminho de igual valor, e ela resolve o mesmo codigo, pela mesma rota,
  /// com o mesmo desfecho.
  static const String explicacaoSemLeitura =
      'Esta versão do Bichu ainda não lê o QR da coleira pela câmera. O código '
      'impresso na tag chega no mesmo lugar: digite e siga daqui.';

  /// A frase do criterio 1 da BICHUS-54, guardada **para nao ser desenhada**.
  ///
  /// Ela fica aqui, e nao dentro de um widget, por um motivo so: a isca de
  /// `test/telas/leitor_nao_finge_camera_test.dart` cobra a ausencia dela na
  /// arvore, e uma isca que carregasse a propria copia da frase ficaria verde
  /// no dia em que alguem repusesse o visor com o texto reescrito. Quando a
  /// BICHUS-54 desenhar a camera de verdade, e esta constante que ela usa.
  static const String instrucaoDoVisor = 'Aponte para o QR da coleira';

  @override
  State<TelaLeitorDeQr> createState() => _TelaLeitorDeQrState();
}

class _TelaLeitorDeQrState extends State<TelaLeitorDeQr> {
  final TextEditingController _codigo = TextEditingController();
  final FocusNode _focoDoCodigo = FocusNode();

  /// **A tela abre dizendo a verdade, e nao consultando nada.**
  ///
  /// Nao ha estado inicial de espera porque nao ha nada que possa mudar a
  /// resposta: o leitor de QR nao existe neste build, em nenhum aparelho e com
  /// qualquer permissao.
  EstadoDoLeitor _estado = EstadoDoLeitor.semLeitura;

  /// O codigo que foi lido e ainda nao resolveu. E o que a tela de sem conexao
  /// mostra, para a pessoa conseguir guarda-lo.
  String? _codigoLido;

  int _tentativa = 0;
  int _segundosParaTentar = 0;
  Timer? _contagem;
  bool _resolvendo = false;
  MensagemDeErro? _faixa;

  /// Tres tentativas automaticas, de 5 em 5 segundos, com o estado visivel.
  static const int _maximoDeTentativas = 3;
  static const int _esperaEntreTentativas = 5;

  @override
  void dispose() {
    _contagem?.cancel();
    _codigo.dispose();
    _focoDoCodigo.dispose();
    super.dispose();
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
      // Sem `appBar`: ver a nota da classe. A saida vem sobreposta, logo
      // abaixo, e nao numa barra de topo.
      bottomNavigationBar: BarraDeAcaoFixa(acoes: _acoes()),
      body: Stack(
        children: <Widget>[
          Positioned.fill(child: _corpo()),
          // Canto superior esquerdo: e onde o polegar procura a saida. Ela
          // fica POR CIMA de todos os estados, e por isso nenhum deles pode
          // desenhar texto nos primeiros [alturaDaSaidaSobreposta] dp: o
          // visor centraliza, os dois estados de falha abrem o texto bem
          // abaixo, e `digitando` abre com a folga declarada.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(BichuEspaco.e2),
              child: const Align(
                alignment: Alignment.topLeft,
                // `fechar` e nao `voltar`: o leitor e um destino, e nao um
                // passo de um assistente. Quando ha pilha ele desempilha na
                // mesma, e quando nao ha cai na secao de aterrissagem.
                child: SaidaDaTela(tipo: TipoDeSaida.fechar),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _corpo() {
    return switch (_estado) {
        EstadoDoLeitor.semLeitura => const _SemLeitura(),
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
    };
  }

  List<Widget> _acoes() {
    return switch (_estado) {
      // `Digitar o código` e a acao PRINCIPAL, e nao a alternativa: a acao
      // principal e a que resolve, e nao a que a tela preferia.
      //
      // **Nao ha `Abrir os ajustes` aqui, e isso e desenho.** Liberar a camera
      // nao destrava leitura nenhuma enquanto a BICHUS-54 nao existir, e
      // mandar a pessoa aos ajustes do sistema para conseguir uma coisa que o
      // app nao faz seria trocar uma mentira por outra. O caminho para os
      // ajustes continua onde a camera de fato e usada, em F1.4.
      EstadoDoLeitor.semLeitura => <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.digitarOCodigo,
            critico: true,
            aoTocar: _irParaDigitacao,
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

/// A tela que diz que a leitura por camera ainda nao existe.
///
/// **A honestidade aqui e o que a tela NAO desenha.** Nao ha fundo preto de
/// borda a borda, nao ha moldura quadrada e nao ha instrucao para apontar o
/// aparelho: os tres, juntos, sao o que a pessoa le como "a camera esta
/// ligada". Desenhar qualquer um deles sem um preview atras e a mentira que a
/// BICHUS-220 veio tirar, e e o que a isca de
/// `test/telas/leitor_nao_finge_camera_test.dart` mede por geometria, e nao
/// por texto.
///
/// O icone e o do caminho que **existe**, e nao o de uma camera. Um icone de
/// camera aqui devolveria pela figura o enquadramento que o texto acabou de
/// retirar.
///
/// A anatomia e a mesma do quadro `87:26`: lista rolavel, icone, titulo em
/// `headline-sm` e explicacao em `body-lg`. Ela foi mantida de proposito --
/// a folga de abertura ja esta medida contra a saida sobreposta em
/// `test/telas/area_segura_do_aparelho_test.dart`, e mudar o esqueleto
/// junto com o conteudo trocaria dois problemas por tres.
class _SemLeitura extends StatelessWidget {
  const _SemLeitura();

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
            // Decorativo: o titulo logo abaixo ja diz o que o icone ilustra, e
            // um nome proprio aqui seria anuncio duplo.
            semanticLabel: '',
          ),
          const SizedBox(height: BichuEspaco.e6),
          Semantics(
            header: true,
            child: Text(
              TelaLeitorDeQr.tituloSemLeitura,
              style: textos.headlineSmall,
            ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          Text(
            TelaLeitorDeQr.explicacaoSemLeitura,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e4),
          // Onde achar o codigo e como ele e. E a mesma linha do 12.4 que o
          // campo de digitacao ja usa como ajuda: quem le isto aqui chega no
          // campo sabendo o que procurar na tag.
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
          // A abertura e [alturaDaSaidaSobreposta], e nao um espacamento
          // escolhido: a saida fica por cima desta lista e o rotulo do campo
          // e a primeira coisa que ela cobria.
          const SizedBox(height: alturaDaSaidaSobreposta),
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
