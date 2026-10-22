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
///
/// **Nao e um numero escolhido: e a soma dos dois que ja existiam.** A saida
/// e posicionada com [BichuEspaco.e2] de folga e o alvo dela e o piso critico
/// de 64 dp (design system 6.5). Como ela fica **por cima** dos estados, todo
/// conteudo desenhado na faixa esquerda do topo precisa comecar depois desta
/// linha.
///
/// Ele existe escrito assim, e nao somado a mao em cada estado, porque foi
/// somado a mao que o defeito nasceu: os estados desenhados abriam com
/// 24 + 40 = 64 dp, o comentario do `build` afirmava "folga de 64 dp", e a
/// saida ocupa 72. Um numero derivado nao diverge quando alguem mexe no alvo.
const double alturaDaSaidaSobreposta =
    BichuEspaco.e2 + BichuAlvoDeToque.critico;

/// Os estados de F2.1.
enum EstadoDoLeitor {
  /// O primeiro quadro, enquanto a porta responde qual e o estado da
  /// permissao.
  ///
  /// **Ele nao desenha moldura nem fundo de visor**, e isso e a regra da
  /// BICHUS-220 aplicada ao unico instante em que ela ainda vale nesta tela:
  /// por alguns quadros ainda nao se sabe se havera camera, e desenhar o
  /// visor "adiantado" seria prometer antes de ter.
  consultando,

  /// Figma `87:14`. A camera esta ligada e o leitor procura um simbolo.
  procurando,

  /// Figma `87:26`. A permissao foi negada, desta vez ou de vez.
  permissaoNegada,

  /// Este build nao le QR (macOS, web, teste de widget), ou o sistema
  /// bloqueou a camera por politica. **Nao e recusa: e ausencia**, e nao ha
  /// ajuste a abrir.
  semLeitor,

  /// Figma `87:40`. O codigo foi lido e a resolucao e no servidor.
  semConexao,

  /// **Nao desenhado.** O campo que `Digitar o código` abre. Ver a nota na
  /// classe.
  digitando,
}

/// F2.1 — Leitor de QR. Figma `87:14` (visor), `87:26` (permissao negada),
/// `87:18` (o aviso efemero) e `87:40` (sem conexao).
///
/// **Esta tela nao leva barra de topo nem barra inferior de abas, e isso e
/// desenho.** O design system 11.11 lista o leitor de camera entre as telas em
/// que a barra nao aparece: sao telas de tarefa unica. Uma barra de topo aqui
/// competiria com o visor, que ocupa a tela inteira.
///
/// **O que mudou na BICHUS-164, e a consequencia que vem junto.** `Escanear`
/// deixou de ser aba e passou a ser rota irma da casca, alcancada por `push`
/// das duas portas de 27.5.6. Enquanto era aba, a saida **era a propria barra
/// inferior**. Sem a barra, essa saida sumiu, e uma tela sem barra e sem saida
/// e o beco da BICHUS-157. Por isso ha a [SaidaDaTela] sobreposta no canto
/// superior esquerdo: ela existe **sempre**, inclusive quando a tela e
/// alcancada por link direto com a pilha vazia. Ela fica sobreposta, e nao
/// numa barra, porque o visor nao pode encolher.
///
/// ## A CAMERA VOLTOU, E COM ELA A MOLDURA (BICHUS-54)
///
/// **O que houve antes.** Ate 22/09 esta tela desenhava fundo preto de borda a
/// borda, uma moldura branca de 240 x 240 e [instrucaoDoVisor] com **nenhum
/// widget de camera na arvore**. O cliente achou isso no primeiro teste em
/// aparelho fisico (BICHUS-220), a tela passou a dizer a verdade, e
/// `test/telas/leitor_nao_finge_camera_test.dart` passou a proibir a figura de
/// visor **enquanto nao houvesse leitor**.
///
/// **O que mudou agora, e o que continua igual.** Ha leitor: `mobile_scanner`
/// esta no `pubspec.yaml` e [LeitorDeQr] e a porta. A proibicao daquela isca
/// nao foi apagada, foi **invertida**, e o invariante que ela sempre mediu
/// continua o mesmo, com o sinal trocado: **moldura e camera andam juntas**.
/// Com o leitor ligado a moldura e obrigatoria; sem ele, continua proibida. Os
/// dois sentidos estao guardados naquele arquivo, e os dois reprovam.
///
/// ## A permissao volta a decidir a tela, e agora ela pode
///
/// Ate a BICHUS-54 ramificar por permissao produzia promessa falsa: `Abrir os
/// ajustes` convidava a liberar uma camera que nao destravava leitura nenhuma.
/// Com o leitor existindo, liberar a camera destrava de verdade, e os **quatro**
/// estados de [EstadoDaPermissao] voltam a ter tela.
///
/// **Quem pergunta a permissao e a porta da camera, e nao a do leitor.** E a
/// mesma permissao de sistema, e quem liberou a camera para a foto do pet em
/// F1.4 nao e perguntado de novo aqui.
///
/// **O dialogo do sistema so abre no toque, nunca na abertura da tela.** No
/// iOS o pedido e irreversivel: negado uma vez, so pelos Ajustes. E o mesmo
/// cuidado que a BICHUS-24 pos na antessala de notificacao -- a pessoa le o
/// motivo **antes** de a chance unica ser gasta --, e a forma que ele ja tem
/// neste branch e a de F1.4: consultar o estado na montagem (que nao abre
/// dialogo) e pedir so quando a pessoa toca no controle que diz o que vai
/// acontecer. A antessala em folha modal da BICHUS-24 continua em
/// `feat/BICHUS-24-antessala-de-permissao` e **nao esta nesta base**; quando os
/// dois branches se encontrarem, este caminho e o dela viram um so, e a
/// duplicacao a resolver esta apontada na entrega.
///
/// **A camera nunca e o unico caminho.** `Digitar o código` esta presente em
/// todos os estados e e alcancavel por teclado e por leitor de tela. Nos tres
/// estados em que a camera nao funciona ele e a acao **principal**, e nao a
/// alternativa: a acao principal e a que resolve, e nao a que a tela preferia.
///
/// **`GET /v1/tags/{code}` existe e esta montada.** Ate 22/09 este cabecalho
/// afirmava o contrario, e a afirmacao induzia quem lesse depois: a rota esta
/// declarada em `api/openapi.yaml` (`operationId: resolveTagCode`), o servidor
/// a implementa e a autenticacao nela e **opcional** -- e e o token, quando ha
/// um, que faz a resposta vir com `viewer: owner` e o app abrir o modo dono.
/// A tela chama o contrato, trata os quatro desfechos de erro por `type` e, no
/// sucesso, **abre a tela do pet** (F2.2 ou F2.3, em `TelaDoPetDaTag`).
/// Nenhuma resposta e simulada.
class TelaLeitorDeQr extends StatefulWidget {
  const TelaLeitorDeQr({super.key});

  /// A frase do criterio 1, **agora desenhada**.
  ///
  /// Ela continua sendo uma constante da classe, e nao um literal dentro do
  /// widget, pelo motivo de sempre: a isca de
  /// `test/telas/leitor_nao_finge_camera_test.dart` a le daqui, e uma isca com
  /// a propria copia da frase ficaria verde no dia em que o texto fosse
  /// reescrito num lugar so.
  static const String instrucaoDoVisor = 'Aponte para o QR da coleira';

  /// O titulo de [EstadoDoLeitor.semLeitor].
  ///
  /// **Microcopy nova**, e ela continua marcada como tal: nao ha frase no UX
  /// nem no Figma para "este aparelho nao le". O texto mudou de dono com a
  /// BICHUS-54 -- ele dizia que a funcao nao existia no app, e agora diz que
  /// ela nao existe **neste aparelho**, que e a unica coisa que sobrou de
  /// verdadeira.
  static const String tituloSemLeitura =
      'Este aparelho não lê o QR pela câmera';

  /// A explicacao de [EstadoDoLeitor.semLeitor].
  ///
  /// Duas coisas, nesta ordem: o que **nao** existe, e o que existe. A segunda
  /// frase nao e consolo -- a entrada manual e o caminho de igual valor da
  /// BICHUS-54, e ela resolve o mesmo codigo, pela mesma rota, com o mesmo
  /// desfecho.
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
  ///
  /// `Ligar a câmera`, e nao `Permitir`: `Permitir` e a palavra do botao do
  /// dialogo do sistema, e repeti-la aqui faria a pessoa achar que ja
  /// respondeu.
  static const String ligarACamera = 'Ligar a câmera';

  /// O criterio 3: o QR lido nao e do Bichu. **Dito sem sair da camera.**
  static const String naoEDoBichu =
      'Este código não é do Bichu. Tente de novo.';

  /// Criterio 6, regiao viva: o leitor esta procurando.
  static const String procurandoCodigo = 'Procurando código';

  /// Criterio 6, regiao viva: o leitor achou.
  static const String codigoEncontrado = 'Código encontrado';

  /// Regiao viva do **outro** QR que este leitor le: o convite de conexao.
  ///
  /// Frase propria e nao a mesma de [codigoEncontrado], porque o desfecho e
  /// outro: ali abre a pagina de um pet, aqui abre o perfil de uma pessoa. Quem
  /// ouve a tela precisa saber qual dos dois vem.
  static const String conviteEncontrado = 'Convite encontrado';

  /// O convite nao resolve: **vencido, revogado e inexistente sao o mesmo
  /// 404**, e esta frase nao distingue os tres.
  ///
  /// A fusao e do servidor e e deliberada: *"este token ja existiu"* e
  /// justamente a informacao que diz a alguem que vale a pena continuar
  /// tentando. E o 404 funde outros quatro motivos -- dono sem apelido, quem
  /// bloqueou quem le, conta desabilitada e perfil denunciado por quem le --,
  /// que a tela tambem nao pode separar sem avisar alguem de que foi
  /// bloqueado.
  ///
  /// **Ela nao manda tentar de novo com o mesmo QR**, porque nao resolveria: o
  /// que resolve e a outra pessoa gerar um convite novo.
  static const String conviteNaoVale =
      'Este convite não vale mais. Peça um novo para o usuário.';

  /// DEDUZIDO, e e a pergunta fechada desta entrega.
  ///
  /// **A camera existe, esta ligada e nao le** -- codigo borrado, tag riscada,
  /// pouca luz, lente arranhada. Nao ha erro: nada falhou, e o leitor continua
  /// procurando. Mas ficar mudo enquanto a pessoa segura o aparelho sobre a
  /// coleira de um animal que se mexe e deixa-la sem saber se o app esta vivo.
  ///
  /// A frase **nao acusa** (nao ha nada a acusar), **nao promete** que vai dar
  /// certo, e aponta o caminho que funciona sem desligar o que esta rodando.
  /// Ela aparece depois de [esperaAteAOfertaManual] e a camera **continua
  /// lendo** por tras dela.
  static const String aindaProcurando =
      'Ainda não achei o código. Se a plaquinha estiver gasta ou riscada, dá '
      'para digitar o código que está embaixo do QR.';

  /// Quanto tempo o leitor procura antes de oferecer a digitacao.
  ///
  /// **12 s, e o numero e uma escolha declarada, nao uma medicao.** Curto
  /// demais (3 a 5 s) interrompe quem so esta enquadrando; longo demais deixa
  /// a pessoa achando que travou. Doze segundos e o que sobra depois de
  /// enquadrar com uma mao so. O numero esta na pergunta fechada.
  static const Duration esperaAteAOfertaManual = Duration(seconds: 12);

  /// Quanto tempo o aviso do criterio 3 fica na tela.
  ///
  /// Ele e efemero porque a camera **nao para**: a pessoa ja esta apontando
  /// para a proxima plaquinha quando ele some. Persistir exigiria um toque
  /// para dispensar, com o aparelho na mao errada.
  static const Duration duracaoDoAvisoEfemero = Duration(seconds: 4);

  @override
  State<TelaLeitorDeQr> createState() => _TelaLeitorDeQrState();
}

class _TelaLeitorDeQrState extends State<TelaLeitorDeQr> {
  final TextEditingController _codigo = TextEditingController();
  final FocusNode _focoDoCodigo = FocusNode();

  /// **A tela abre sem afirmar nada**, e so depois de a porta responder ela
  /// escolhe entre camera, permissao e ausencia.
  EstadoDoLeitor _estado = EstadoDoLeitor.consultando;

  EstadoDaPermissao _permissao = EstadoDaPermissao.negada;

  /// O codigo que foi lido e ainda nao resolveu. E o que a tela de sem conexao
  /// mostra, para a pessoa conseguir guarda-lo.
  String? _codigoLido;

  /// De onde saiu [_codigoLido]: do campo de digitacao, ou da camera.
  ///
  /// **A tela precisa disto porque o 404 diz coisas diferentes nos dois
  /// caminhos** (BICHUS-153). Hoje a camera nao existe (a BICHUS-54 e quem a
  /// traz) e todo codigo chega digitado, entao o valor e sempre `true` na
  /// pratica. Ele existe mesmo assim, e o default e `false`, porque o dia em
  /// que a leitura entrar e o dia em que ninguem vai lembrar de bifurcar este
  /// texto -- e o defeito volta calado, com a tela acusando a plaquinha de
  /// quem nem encostou no teclado.
  bool _codigoFoiDigitado = false;

  /// O que o campo do codigo mostra **embaixo dele**, quando a forma nao fecha.
  ///
  /// Separado de [_faixa] de proposito: a faixa e a resposta do servidor, e
  /// este e o que o app viu sozinho, antes de gastar a viagem. Junta-los faria
  /// um limpar o outro, e a pessoa perderia o motivo no meio do caminho.
  String? _erroDoCampo;

  int _tentativa = 0;
  int _segundosParaTentar = 0;
  Timer? _contagem;
  Timer? _ofertaManual;
  Timer? _limparAviso;
  bool _resolvendo = false;

  /// Ha uma rota EMPILHADA POR CIMA do leitor.
  ///
  /// **Este sinalizador e o conserto do laco que o cliente viu.** `_resolvendo`
  /// sozinho nao bastava, e o motivo e de uma linha: ele era desligado ANTES do
  /// `push`. Entre o desligamento e a tela do pet aparecer, o `MobileScanner`
  /// continua entregando quadros do MESMO simbolo -- o leitor segue montado,
  /// porque `push` nao o tira da arvore --, e cada quadro passava pelo portao
  /// aberto, resolvia o codigo de novo e empilhava outra copia da tela. O
  /// relato do cliente ("entrou em looping varias vezes, e depois de tudo abriu
  /// uma tela") e exatamente isso: uma rajada de `GET /v1/tags/{code}` e uma
  /// pilha de telas identicas para voltar uma a uma.
  ///
  /// Ele cobre QUALQUER rota sobreposta, e nao so a do pet: o registro de
  /// achado tem o mesmo `push` a partir desta tela e tinha o mesmo vazamento.
  bool _rotaSobreposta = false;

  bool _demorou = false;
  MensagemDeErro? _faixa;
  String? _avisoEfemero;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e le-lo dentro de `initState` e erro de
  /// framework. O sinalizador impede que o arranque rode de novo a cada
  /// mudanca de tema, de tamanho de fonte ou de rotacao.
  bool _iniciou = false;

  /// Tres tentativas automaticas, de 5 em 5 segundos, com o estado visivel.
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

  /// Le o estado **sem abrir dialogo**, e decide a tela com ele.
  ///
  /// A ordem importa: [LeitorDeQr.embarcado] vem **antes** da permissao. Um
  /// aparelho sem leitor com a camera liberada nao le nada, e mostrar a tela
  /// de permissao ali mandaria a pessoa aos ajustes conceder o que ja esta
  /// concedido.
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
      // Nao ha permissao a conceder: o sistema bloqueou por politica, ou nao
      // ha camera. Mandar aos ajustes faria procurar o que nao esta la.
      EstadoDaPermissao.indisponivel => EstadoDoLeitor.semLeitor,
    };
  }

  /// Pede a permissao. **So daqui**, e nunca da montagem da tela.
  Future<void> _ligarACamera() async {
    final camera = Escopo.of(context).camera;
    // Negada permanentemente nao abre dialogo nenhum: o caminho e a faixa com
    // os ajustes, que ja esta na tela. Insistir seria um toque que nao faz
    // nada -- e o controle nem e construido naquele estado.
    if (_permissao != EstadoDaPermissao.negada) return;
    final novo = await camera.pedirCamera();
    if (!mounted) return;
    setState(() {
      _permissao = novo;
      _estado = _telaDaPermissao(novo);
    });
    if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
  }

  /// Arma a oferta de digitacao para quem ficou procurando sem achar.
  void _comecarAProcurar() {
    _demorou = false;
    _ofertaManual?.cancel();
    _ofertaManual = Timer(TelaLeitorDeQr.esperaAteAOfertaManual, () {
      if (!mounted) return;
      setState(() => _demorou = true);
    });
  }

  /// Um simbolo chegou da camera.
  ///
  /// **A triagem e local, e nao no servidor.** O criterio 3 exige que um QR de
  /// outra origem seja recusado **sem sair da camera**, e recusar sem sair da
  /// camera quer dizer recusar aqui, sem ida e volta de rede -- ver
  /// `codigo_lido_do_qr.dart`.
  void _aoLer(LeituraDeQr leitura) {
    // A camera entrega varios quadros por segundo e o mesmo simbolo chega
    // muitas vezes. Enquanto uma resolucao esta em curso, o resto e ruido.
    if (_resolvendo || _rotaSobreposta) return;

    final codigo = codigoDeTagDoQr(
      leitura.conteudo,
      apiBaseUrl: Escopo.of(context).api.config.apiBaseUrl,
    );

    if (codigo == null) {
      // ESTE LEITOR LE DOIS QR, E O DA PLAQUINHA CONTINUA SENDO O PRIMEIRO.
      //
      // **Um leitor so, e nao dois** (cliente, 21/10/2026): um segundo leitor
      // seria uma segunda camera, uma segunda permissao, um segundo estado de
      // `semLeitor` e uma segunda tela sem barra -- e quem escaneia nao sabe de
      // antemao se o quadrado na frente dele e uma plaquinha ou um convite.
      //
      // **A ORDEM NAO IMPORTA, e isso e o que torna o reuso seguro.** As duas
      // formas sao mutuamente exclusivas por construcao: a da plaquinha e uma
      // URL com hospedeiro e caminho `/t/`, e a do convite e uma palavra so, no
      // alfabeto base64url, que nao tem `.` nem `/` nem `:`. Nenhum conteudo
      // casa as duas, e nenhum conteudo que casava a primeira deixou de casar.
      // A ordem esta assim porque o caminho do achador e o que nao pode piorar:
      // ele e medido pelo contrapeso em `test/telas/`.
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
    // `false`: veio da CAMERA. A autora dos achados do cliente deixou este
    // ponto escrito em `_codigoFoiDigitado` -- o dia em que a leitura
    // entrasse seria o dia de bifurcar o texto do 404, sob pena de a tela
    // acusar a plaquinha de quem nem encostou no teclado. E hoje.
    _resolver(codigo, digitado: false);
  }

  /// Resolve um token de convite e abre o perfil de quem o emitiu.
  ///
  /// ## O destino e a tela que ja existe, e o token vai junto
  ///
  /// `resolveConnectionInvite` devolve `PersonProfile` -- a MESMA projecao de
  /// `getPersonProfile` --, entao o apelido vem na resposta e o destino e
  /// `Rotas.perfilDe`. O token viaja no `extra` porque a tela de perfil o usa
  /// como **credencial do pedido**: com ele o servidor grava procedencia
  /// `invite_link`, e sem ele gravaria `people_search` -- uma busca que nao
  /// houve.
  ///
  /// **A resolucao acontece aqui e nao la**, e a diferenca e de desenho: o
  /// endereco do perfil carrega APELIDO, e o leitor nao tem apelido antes de
  /// resolver. Empurrar o token para a tela de perfil a faria ter dois modos de
  /// carregar.
  ///
  /// ## Os tres desfechos, e o 404 nao e falha
  ///
  /// O 404 e um DESFECHO: o convite nao vale, e a frase diz isso sobre o visor,
  /// sem sair da camera -- quem mostrou o QR esta do lado, e o conserto e ela
  /// gerar outro. Falha de rede entra no estado de `semConexao`, que ja tem
  /// nova tentativa automatica. Qualquer outra falha vira a faixa.
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

  /// O aviso do criterio 3: aparece **sobre** o visor e some sozinho.
  void _mostrarAvisoEfemero(String texto) {
    // Um QR que nao e do Bichu aparecendo de novo nao reinicia a contagem para
    // um texto que ja esta na tela: reinicia so quando o texto muda.
    if (_avisoEfemero == texto && (_limparAviso?.isActive ?? false)) return;
    setState(() => _avisoEfemero = texto);
    _limparAviso?.cancel();
    _limparAviso = Timer(TelaLeitorDeQr.duracaoDoAvisoEfemero, () {
      if (!mounted) return;
      setState(() => _avisoEfemero = null);
    });
  }

  /// Abre o campo de digitacao. **SEM pedir o foco**, e isto e o pedido do
  /// cliente de 20/10/2026.
  ///
  /// O relato, literal: *"quando abre a pagina para digitar o codigo do pet, no
  /// ios o teclado vem aberto e sobrepoe os botoes embaixo, traga essa pagina,
  /// sem selecionar o input para nao ter esse problema"*.
  ///
  /// **Dos tres pedidos de foco desta tela, so este era na ABERTURA.** Os
  /// outros dois sao de recuperacao -- [_enviarODigitado] quando a forma nao
  /// fecha, e [_voltarAoCampo] quando o servidor recusa o codigo --, e naqueles
  /// o foco e certo: a pessoa ja esta digitando e precisa continuar de onde
  /// parou, sem tocar o campo de novo a cada tentativa. Os dois continuam
  /// pedindo foco, e os dois tem isca.
  ///
  /// **O que isto NAO conserta, e por que a barra mudou junto.** Tirar o foco
  /// evita o teclado subir sozinho; no instante em que a pessoa toca o campo
  /// ele sobe, e a barra de acao ficava atras dele do mesmo jeito -- o que o
  /// cliente descreveu ("sobrepoe os botoes embaixo") e a causa, e o foco
  /// automatico era so o gatilho mais visivel dela. O conserto da causa esta
  /// no `build`.
  ///
  /// **Custo declarado:** quem vem aqui para digitar paga um toque a mais, no
  /// campo. Esta e a tela de quem achou um animal na rua, onde toque custa
  /// caro, e por isso o custo esta escrito e nao escondido: com a barra agora
  /// acima do teclado, devolver o `requestFocus()` desta linha nao reabre o
  /// defeito do cliente. A decisao de devolve-lo e dele.
  void _irParaDigitacao() {
    _ofertaManual?.cancel();
    setState(() {
      _estado = EstadoDoLeitor.digitando;
      // Um aviso de forma da visita anterior ao campo nao vale para o campo
      // que esta abrindo agora.
      _erroDoCampo = null;
    });
  }

  /// O texto que a pessoa le para cada motivo de [FormaDoCodigo].
  ///
  /// **Nenhum ramo devolve `null` para uma forma que nao fecha.** Um `default`
  /// silencioso aqui reabriria o defeito exato que esta correcao fecha: forma
  /// errada, nada na tela, chamada ao servidor.
  static String? _textoDaForma(FormaDoCodigo forma, String digitado) {
    return switch (forma) {
      FormaDoCodigo.valida => null,
      FormaDoCodigo.vazia => MensagensDeErro.digiteOCodigo,
      FormaDoCodigo.curta || FormaDoCodigo.longa =>
        MensagensDeErro.codigoComTamanhoDiferente(simbolosDoCodigo(digitado)),
      FormaDoCodigo.foraDoAlfabeto => MensagensDeErro.codigoComCaractereDeFora,
    };
  }

  /// Confere a forma a cada toque, e avisa **so do que nao melhora sozinho**.
  ///
  /// Sobra de simbolo e caractere de fora sao definitivos: o proximo toque nao
  /// conserta nenhum dos dois, e esperar o `Continuar` para dizer isso e
  /// deixar a pessoa terminar de digitar um codigo que ja nao serve. Falta de
  /// simbolo e o estado normal de quem esta no meio da palavra, e acusar ali
  /// seria um campo que reclama de cada letra.
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

  /// O toque em `Continuar`: **confere a forma aqui, e so chama se fechar.**
  ///
  /// Ate 28/09 este caminho testava `digitado.isEmpty` e mais nada, e a
  /// mascara cortava no 16o simbolo em silencio: quem colava 26 mandava os 16
  /// primeiros e recebia do servidor uma recusa sobre um codigo que nunca
  /// existiu na tela dele. Conferir tamanho e alfabeto aqui troca essa recusa
  /// generica por uma frase que diz o numero -- e poupa uma viagem que so podia
  /// terminar em 400.
  ///
  /// **Forma, e nunca o simbolo de verificacao.** Ele e do servidor
  /// (ADR-0004, Emenda 1), e um codigo de 16 simbolos do alfabeto certo com o
  /// simbolo de verificacao errado **sai daqui e vai ser recusado la**, como
  /// sempre foi. Repetir a aritmetica dele no app criaria a segunda fonte da
  /// mesma regra.
  void _enviarODigitado() {
    final digitado = _codigo.text.trim();
    final forma = formaDoCodigoDeTag(digitado);
    if (forma != FormaDoCodigo.valida) {
      setState(() {
        _erroDoCampo = _textoDaForma(forma, digitado);
        // A resposta anterior do servidor sai da tela: ela era sobre outro
        // texto, e deixar as duas juntas faz a pessoa ler a errada.
        _faixa = null;
      });
      _focoDoCodigo.requestFocus();
      return;
    }
    setState(() => _erroDoCampo = null);
    _resolver(digitado, digitado: true);
  }

  /// Devolve o foco ao campo **sem tocar no que esta escrito nele**.
  ///
  /// [TextEditingController.clear] nao e chamado aqui de proposito: o
  /// criterio 4 da BICHUS-153 e exatamente que o texto anterior sobreviva.
  void _voltarAoCampo() {
    _focoDoCodigo.requestFocus();
    _codigo.selection = TextSelection(
      baseOffset: 0,
      extentOffset: _codigo.text.length,
    );
  }

  /// Resolve o codigo contra `GET /v1/tags/{code}`.
  ///
  /// **A decisao e por `type`, nunca por status**: os quatro desfechos sao
  /// `tag-code-malformed` (400), `tag-code-not-found` (404), `tag-revoked`
  /// (410, com `next_action`) e `rate-limited` (429), e as quatro mensagens
  /// carregam **a mesma saida**. Um `if (status == 400)` acerta hoje por sorte
  /// e erra calado no dia em que outro tipo sair com o mesmo status.
  ///
  /// Os tres textos sao os mesmos de F4.5 (BICHUS-47), lidos de
  /// `MensagensDeErro`: sao duas telas do mesmo desfecho, e escrever a frase
  /// duas vezes e o comeco de duas respostas diferentes para o mesmo 404.
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
      // **O retorno e o produto desta chamada, e nao um efeito colateral.**
      // Ate 22/09 esta linha era `await ...resolver(codigo);` sem atribuicao:
      // o app pagava a ida ao servidor, recebia o nome do pet, os sinais, o
      // cartao de manejo e `viewer`, e jogava tudo fora para desenhar uma
      // faixa de texto dizendo que a tela do pet chegava depois.
      final tag = await Escopo.of(context).tags.resolver(codigo);
      if (!mounted) return;
      setState(() {
        _resolvendo = false;
        _tentativa = 0;
        // FECHA O PORTAO ANTES DE ABRIR O `_resolvendo`, e no MESMO
        // `setState`: a janela entre os dois e por onde o laco entrava.
        _rotaSobreposta = true;
      });
      // `push`, e nao `go`: o leitor continua na pilha, e quem escaneou a
      // plaquinha errada volta para a camera sem reabrir o fluxo. E porque ele
      // continua na pilha que a camera precisa ficar calada ate ele voltar.
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
      // A camera continua ligada: quem leu a plaquinha errada aponta para a
      // proxima sem tocar em nada. A contagem da oferta manual recomeca.
      if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada. Sem este ramo `_resolvendo` ficava ligado
      // para sempre com a camera parada: a pessoa esta na rua, com o animal
      // no colo, olhando um circulo girar.
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

  /// Abre uma rota POR CIMA do leitor e mantem a camera calada enquanto ela
  /// estiver na pilha.
  ///
  /// **O laco do cliente nascia na ausencia desta funcao.** `push` deixa o
  /// leitor montado: o `MobileScanner` nao sai da arvore, nao e pausado, e
  /// continua entregando o mesmo simbolo varias vezes por segundo enquanto a
  /// tela do pet esta na frente. Com o unico portao (`_resolvendo`) ja aberto
  /// antes do `push`, cada um desses quadros virava uma resolucao nova e um
  /// `push` novo.
  ///
  /// **`noDuplicates` no controlador nao e a saida**, e o proprio
  /// `leitor_de_qr.dart` ja explica por que: ele guarda o ultimo valor para
  /// sempre, e quem le a plaquinha errada, volta para a certa e tenta a errada
  /// de novo fica sem resposta na terceira. O que precisa calar e so a janela
  /// em que ha tela por cima -- e e esta.
  Future<void> _abrirSobreposta(String rota, {Object? extra}) async {
    // Idempotente de proposito: `_resolver` ja fechou o portao no mesmo
    // `setState` em que largou `_resolvendo`, e quem chama daqui de fora (o
    // registro de achado) depende desta linha.
    if (!_rotaSobreposta) setState(() => _rotaSobreposta = true);
    await context.push(rota, extra: extra);
    if (!mounted) return;
    setState(() => _rotaSobreposta = false);
    // A oferta de digitacao recomeca: a contagem anterior foi cancelada na ida,
    // e quem voltou da tela errada esta procurando de novo.
    if (_estado == EstadoDoLeitor.procurando) _comecarAProcurar();
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
      // A origem nao se perde na retentativa: e o MESMO codigo, e quem o
      // digitou continua tendo digitado. Recalcular por estado de tela aqui
      // era o caminho para o texto do 404 trocar sozinho depois de cinco
      // segundos sem ninguem ter tocado em nada.
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
      // Sem `appBar`: ver a nota da classe. A saida vem sobreposta, logo
      // abaixo, e nao numa barra de topo.
      //
      // A BARRA SOBE COM O TECLADO, E O RECUO MORA DENTRO DELA. Sem ele a
      // barra fica atras do teclado e `Continuar`, `Digitar de novo` e
      // `Como achei este animal` viram botoes inalcancaveis: e o defeito que o
      // cliente mediu no iPhone dele em 20/10/2026 ("o teclado ... sobrepoe os
      // botoes embaixo").
      //
      // **NAO PONHA UM `Padding` DE TECLADO AQUI DE NOVO.** Ele nasceu nesta
      // linha, quando esta era a unica tela com o defeito, e subiu para
      // [BarraDeAcaoFixa] quando o cliente achou a segunda (`Meus dados`, no
      // mesmo dia). Sao 13 as telas que trazem aquela barra junto com campo de
      // texto, e o conserto e um so, la. Os dois juntos dariam recuo DOBRADO:
      // a barra subiria duas vezes a altura do teclado.
      bottomNavigationBar: BarraDeAcaoFixa(acoes: _acoes()),
      body: Stack(
        children: <Widget>[
          Positioned.fill(child: _corpo()),
          // Canto superior esquerdo: e onde o polegar procura a saida. Ela
          // fica POR CIMA de todos os estados, e por isso nenhum deles pode
          // desenhar texto nos primeiros [alturaDaSaidaSobreposta] dp.
          const SafeArea(
            child: Padding(
              padding: EdgeInsets.all(BichuEspaco.e2),
              child: Align(
                alignment: Alignment.topLeft,
                // `fechar` e nao `voltar`: o leitor e um destino, e nao um
                // passo de um assistente.
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
      // Nem moldura nem fundo de visor: ver o comentario do proprio valor.
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
        // O unico caminho de volta quando pedir de novo nao abre dialogo. A
        // faixa e o texto sao os mesmos de F1.4, lidos de
        // `TextosDoCadastro`: e a mesma permissao e a mesma frase.
        faixaDosAjustes: _permissao == EstadoDaPermissao.negadaPermanentemente,
      ),
      EstadoDoLeitor.semLeitor => _SemCamera(
        titulo: TelaLeitorDeQr.tituloSemLeitura,
        explicacao: TelaLeitorDeQr.explicacaoSemLeitura,
        faixaDosAjustes: false,
        // Informativo, e nao erro: nada deu errado e ninguem errou.
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
        // O TECLADO E MEDIDO AQUI, E NAO LA DENTRO, e a diferenca nao e de
        // estilo. `Scaffold` com `resizeToAvoidBottomInset` -- que e o padrao
        // -- ENCOLHE o corpo e entrega a ele um `MediaQuery` com
        // `viewInsets.bottom` **zerado**, porque ja tratou o teclado. Quem
        // perguntar pelo teclado de dentro do corpo recebe "fechado" com o
        // teclado aberto na cara. Este `context` e o do `State`, acima do
        // `Scaffold`, e e o unico ponto desta tela que ve o numero de verdade.
        // Medido no emulador: de dentro do corpo a plaquinha nao sumia.
        tecladoAberto: MediaQuery.viewInsetsOf(context).bottom > 0,
      ),
    };
  }

  /// O controle que abre o campo. **Principal fora do visor, secundario
  /// dentro dele.**
  ///
  /// Nao e hierarquia de gosto: a acao principal e a que resolve. Com a camera
  /// lendo, ela e a camera; sem camera, a unica que resolve e esta.
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
      // Ainda sem resposta da porta. A saida nao aparece e some: ela existiria
      // por dois ou tres quadros e piscaria na tela.
      EstadoDoLeitor.consultando => <Widget>[_acaoDeDigitar(principal: true)],
      // Criterio 1: `Digitar o código` fica ABAIXO do visor, e existe mesmo
      // com a camera funcionando.
      EstadoDoLeitor.procurando => <Widget>[
        _acaoDeDigitar(principal: _demorou),
      ],
      // Criterio 4: com a permissao negada, `Digitar o código` **vira a acao
      // principal**. `Ligar a câmera` fica embaixo, e e ele -- e so ele -- que
      // abre o dialogo do sistema.
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
        // `Digitar de novo` (BICHUS-153, criterio 3). Ela aparece **so
        // quando o 404 do caminho digitado esta na tela**: em qualquer outro
        // momento ela seria um botao que repete o que o cursor ja faz.
        //
        // Ela **nao limpa o campo**, e isso e o ponto dela (criterio 4). A
        // pessoa errou um caractere em dezesseis; devolver o foco com o
        // texto preservado e oferecer a correcao, e limpar e cobrar de novo
        // o trabalho que ja falhou uma vez.
        if (_faixa?.texto == MensagensDeErro.codigoNaoEncontradoDigitado)
          TextButton(
            onPressed: _voltarAoCampo,
            child: const Text(MensagensDeErro.digitarDeNovo),
          ),
        // A saida comum as quatro telas de falha do codigo (UX 12.4). Ela
        // fica aqui, e nao so no erro: quem esta com um animal agora nao
        // precisa do codigo, e descobrir isso **antes** de errar tres vezes
        // e o que impede o beco.
        TextButton(
          // **F3.5 EXISTE** (BICHUS-35). Esta porta nasceu desabilitada, com
          // o comentario "F3.5 e de outra historia" ao lado do `onPressed:
          // null`. A historia chegou, e o `null` virou `context.push`.
          //
          // **Os dois controles nao disputam lugar, e nunca disputaram.** A
          // mescla os apresentou como disputa porque esta branch reformatou o
          // arquivo inteiro e o alinhamento de linhas do Git casou o corpo de
          // `Digitar de novo` com o corpo desta porta. Sao botoes diferentes,
          // com condicoes diferentes: `Digitar de novo` so existe enquanto o
          // 404 do caminho digitado esta na faixa, e esta saida existe sempre,
          // porque quem esta com um animal agora pode nunca chegar a errar o
          // codigo. Nenhum botao novo entrou na tela.
          //
          // `push` e nao `go`: quem esta com um animal no colo e nao achou o
          // codigo precisa voltar para o leitor se mudar de ideia.
          // Pelo portao, e nao direto: enquanto o registro de achado estiver
          // por cima, a camera deste leitor continua viva atras dele e um
          // simbolo no quadro empilharia a tela do pet sobre o formulario.
          onPressed: () => _abrirSobreposta(Rotas.registrarAchado),
          child: const Text(MensagensDeErro.registrarAchado),
        ),
      ],
    };
  }
}

/// A largura do lado da janela de leitura, em dp.
///
/// Proporcional a tela e com teto: num celular estreito 280 dp encostaria nas
/// bordas, e num tablet uma janela fixa ficaria perdida no meio. O piso de
/// 160 dp existe porque abaixo disso a pessoa precisa aproximar tanto que o
/// foco proximo da camera desiste -- o modulo do QR da plaquinha tem 0,677 mm.
double ladoDaJanelaDeLeitura(Size tela) {
  final proporcional = tela.shortestSide * 0.68;
  return proporcional.clamp(160.0, 280.0);
}

/// Figma `87:14`. A camera ao vivo, a moldura, e o que se diz enquanto procura.
///
/// **A moldura so existe aqui.** Ela e desenhada como irma do visor dentro do
/// mesmo `Stack`, e nunca em estado nenhum que nao tenha camera: e o
/// invariante que `leitor_nao_finge_camera_test.dart` mede nos dois sentidos.
///
/// ## Nenhuma cor escrita a mao, e o que isso custou de desenho
///
/// O caminho obvio era branco puro sobre um escurecimento preto -- e o portao
/// de `test/a11y/prosa_dos_tokens_test.dart` reprovou, com razao: cor a mao no
/// Dart precisa estar declarada no inventario do design system, e o inventario
/// nao e deste papel. O que saiu disso e melhor que o obvio, e vale escrever
/// porque nao se deduz:
///
/// - **o escurecimento e [BichuCores.scrim]**, que ja existia para fundo de
///   folha modal e e translucido nos dois temas (alfa 0xA3 no claro, 0xB8 no
///   escuro). Ele cobre **so o lado de fora da janela**: dentro dela a imagem
///   da camera chega limpa, que e onde o decodificador precisa dela;
/// - **a moldura tem dois tracos concentricos**, [BichuCores.surfaceInverse]
///   por fora e [BichuCores.textOnInverse] por dentro. Os dois sao um par
///   invertido do sistema: onde um e claro o outro e escuro, e isso vale nos
///   dois temas. Um traco sozinho, de qualquer cor, some sobre o quadro de
///   video que por acaso tiver aquela cor -- e o quadro e arbitrario, porque e
///   o mundo. Dois tracos opostos nao tem como sumir os dois juntos.
///
/// O texto nao fica solto sobre o video por motivo nenhum: ele vai numa placa
/// opaca de [BichuCores.surfaceInverse], onde o contraste e o do sistema e o
/// portao de pares do design system ja o mede.
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
        // A janela sobe um pouco do centro geometrico: a placa de texto ocupa
        // a base, e a saida sobreposta ocupa o topo. Centrada no meio exato
        // ela ficaria encostada na placa.
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
            // O escurecimento, so em volta da janela. Quatro faixas, e nao uma
            // camada por cima de tudo: o decodificador le a imagem de dentro
            // da janela, e uma camada sobre ela custaria contraste justamente
            // onde o simbolo esta.
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
            // A placa de texto, na base e sobre o escurecimento.
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
                            // Regiao viva, e nao anuncio: o TalkBack limpa a
                            // fila de fala para dizer um anuncio, e esta frase
                            // nao e urgente -- nada falhou.
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
            // O aviso do criterio 3 e a faixa de erro ficam ACIMA da janela:
            // embaixo eles empurrariam a instrucao para fora da placa, e e a
            // instrucao que diz o que fazer.
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
                      // A SAIDA SAI DA MENSAGEM. Nos quatro desfechos de
                      // `GET /v1/tags/{code}` o catalogo declara
                      // `acao: Registrar achado` com
                      // `proximaAcao: registrarAchadoAvulso`, e
                      // `saidaDaMensagem` **nao** resolve esse membro --
                      // devolve `null`, e a faixa nao desenha botao. E o
                      // certo: esta tela ja oferece `Registrar achado` com
                      // botao PROPRIO (ver `_abrirSobreposta` acima), que
                      // abre a sobreposta sem sair da camera. Acrescentar o
                      // ramo em `saidaDaMensagem` poria DOIS botoes iguais
                      // na mesma tela.
                      if (faixa != null)
                        FaixaDeAviso(
                          texto: faixa!.texto,
                          rotuloDaAcao: faixa!.acao,
                          aoTocarNaAcao: saidaDaMensagem(context, faixa!),
                        ),
                      // O criterio 3, **sem sair da camera**: a faixa aparece
                      // por cima do visor e some sozinha.
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
            // Criterio 6. A regiao viva nao e desenhada: ela existe na arvore
            // de semantica, que e onde o VoiceOver e o TalkBack leem. Um texto
            // visivel dizendo `Procurando código` competiria com a instrucao,
            // que e a frase que a pessoa que enxerga precisa ler.
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
///
/// **Um widget para os dois, e nao dois irmaos com a mesma `ListView`
/// copiada.** Os dois estados tem a mesma anatomia (quadro `87:26`: lista
/// rolavel, icone, titulo em `headline-sm`, explicacao em `body-lg`), e a
/// diferenca entre eles e o texto e a existencia da saida para os ajustes.
/// Duas classes divergiriam na primeira vez que alguem mexesse numa so, e a
/// que ficaria para tras e a da ausencia, que e a que ninguem olha.
///
/// **A honestidade aqui e o que a tela NAO desenha.** Nao ha fundo escuro de
/// borda a borda, nao ha moldura quadrada e nao ha instrucao para apontar o
/// aparelho: os tres, juntos, sao o que a pessoa le como "a camera esta
/// ligada", e nestes estados ela nao esta.
///
/// O icone e o do caminho que **existe**, e nao o de uma camera. Um icone de
/// camera aqui devolveria pela figura o enquadramento que o texto retirou.
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
            // Decorativo: o titulo logo abaixo ja diz o que o icone ilustra, e
            // um nome proprio aqui seria anuncio duplo.
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
              // O unico caminho que resolve: pedir de novo nao abre dialogo.
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
///
/// **Este estado nao esta desenhado no Figma.** O quadro `87:14` desenha o
/// botao `Digitar o código` e os estados que ele pode ter atras de si, mas nao
/// o campo. Ele existe assim mesmo porque a alternativa era um botao visivel
/// que nao faz nada, e porque a entrada manual e o caminho de quem nao
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

  /// Se o teclado esta na tela. **Vem de fora**, pelo motivo escrito em
  /// `_corpo()`: daqui de dentro do `Scaffold` a resposta e sempre "nao".
  final bool tecladoAberto;

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
          // A PLAQUINHA, acima do campo (pedido do cliente, 17/10/2026:
          // "na pagina de digitar o codigo do pet, coloque uma imagem para
          // deixar a pagina mais bonita e se conectar mais com o usuario").
          //
          // **Ela some com o teclado aberto, e isso e a parte que importa.**
          // Esta e uma tela em que a pessoa DIGITA: decoracao que divide a
          // altura util com o teclado empurra o campo para fora da dobra e
          // troca bonito por inutilizavel. Com o teclado na tela a plaquinha
          // sai da lista e o campo sobe para onde estava antes desta mudanca
          // -- a tela fica como era enquanto se digita, e bonita quando se
          // chega nela. Quem mede o teclado e `_corpo()`; ver o porque la.
          // SLOT FIXO, E NAO UM `if` QUE TIRA DOIS FILHOS DA LISTA.
          //
          // **Aqui morava o defeito de o teclado nao abrir.** A lista era
          // `[espaco, plaquinha, espaco, campo, ...]` com o teclado fechado e
          // `[espaco, campo, ...]` com ele aberto. Nenhum filho tinha chave,
          // entao o casamento de elementos e por POSICAO: na posicao 1 o
          // `_PlaquinhaDaMarca` virava `BichuField`, os tipos nao batiam, e o
          // Flutter DESMONTAVA a subarvore do campo e montava outra. Com ela ia
          // embora o `State` do `TextField` -- e com o `State`, a conexao de
          // entrada de texto com a plataforma.
          //
          // O efeito era circular e e exatamente o que o cliente descreveu: a
          // pessoa toca no campo, o foco e pedido, o teclado comeca a subir,
          // `viewInsets.bottom` passa de zero, esta lista se reconstroi sem a
          // plaquinha, o campo e remontado, a conexao morre e o teclado desce;
          // sem teclado o `viewInsets` volta a zero, a plaquinha volta, o campo
          // e remontado de novo. O `FocusNode` e externo e sobrevive a tudo
          // isso, entao o campo FICA com o foco e nenhum evento de mudanca de
          // foco dispara -- e e so na mudanca de foco que o `EditableText`
          // reabre a conexao. Resultado: foco sim, teclado nunca.
          //
          // O slot fixo mantem a lista com o MESMO comprimento e o MESMO tipo
          // em cada posicao nos dois estados. O campo deixa de ser remontado, a
          // conexao sobrevive, e a plaquinha continua sumindo com o teclado
          // aberto, que e o que o pedido de 17/10 queria.
          _EspacoDaPlaquinha(visivel: !tecladoAberto),
          BichuField(
            // A chave e o cinto alem do suspensorio: com ela o casamento de
            // elementos deixa de depender da posicao, e um filho novo acima do
            // campo nunca mais o remonta por acidente.
            key: const ValueKey<String>('campo-do-codigo-da-tag'),
            rotulo: TextosDoCadastro.digitarOCodigo,
            controlador: controlador,
            foco: foco,
            ajuda: MensagensDeErro.ajudaDoCampoDeCodigo,
            correcaoAutomatica: false,
            capitalizacao: TextCapitalization.characters,
            acaoDeTeclado: TextInputAction.done,
            // A mascara `XXXX-XXXX-XXXX-XXXX` (ADR-0004, Emenda 1). Ela
            // formata e **nao corta**: desde 28/09 um texto mais longo aparece
            // inteiro, e quem confere tamanho e alfabeto e
            // `_enviarODigitado`. O simbolo de verificacao continua sendo
            // conferido no servidor, porque duas fontes para a mesma regra
            // divergem.
            formatadores: const <TextInputFormatter>[MascaraDoCodigoDaTag()],
            exemplo: 'XXXX-XXXX-XXXX-XXXX',
            // O erro fica NO CAMPO, e nao na faixa de baixo: e sobre o que
            // esta escrito ali, e `BichuField` o associa ao campo e o anuncia
            // por regiao viva (UX secao 13). A faixa e para a resposta do
            // servidor.
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
///
/// **Ele existe para o campo de codigo NAO ser remontado**, e o porque esta
/// escrito por extenso em `_Digitacao`. Em resumo: tirar filhos de uma lista
/// sem chave renumera as posicoes, e o `TextField` que cai numa posicao de
/// outro tipo perde o `State` e, com ele, a conexao de entrada de texto -- que
/// e o teclado. Um filho que continua na lista e encolhe para nada mantem as
/// posicoes paradas e custa um `SizedBox`.
///
/// `Offstage` e `Visibility` resolveriam igual; `SizedBox.shrink` e o que nao
/// deixa a plaquinha ocupando altura nem sendo medida com o teclado aberto.
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
///
/// **De onde sai a imagem.** Nada de asset novo: e a [Moldura] -- a forma da
/// plaquinha que o §1 do design system chama de "o que amarra o sistema",
/// porque e o objeto que a pessoa tem na mao -- com o simbolo da marca que
/// `widgets/marca.dart` desenha a partir de `design/marca/vetor/simbolo.svg`.
/// Os dois ja estao no app. O APK nao cresce e as duas cores saem do tema, e
/// nao de um PNG assado numa cor so.
///
/// **Por que a plaquinha e nao outra peca.** O codigo que se digita aqui esta
/// impresso no verso de uma plaquinha; desenhar a propria plaquinha e a tela
/// mostrando o objeto que a pessoa esta segurando. As pecas expressivas de
/// `design/marca/referencia/` -- a ilustracao de tres pessoas, a frase
/// manuscrita sobre mancha -- sao do site institucional e ficam de fora.
///
/// **Decorativa.** [Moldura] ja e `ExcludeSemantics`, entao o leitor de tela
/// nao a anuncia: ela nao diz nada que o rotulo do campo logo abaixo nao
/// diga. Nao ha frase nova junto dela.
///
/// Medido (formula de luminancia relativa da WCAG 2.1), o simbolo contra o
/// fundo da moldura: **7,13:1 no tema claro** (`#9E0B3A` sobre `#F9ECF0`) e
/// **7,02:1 no escuro** (`#E79DB4` sobre `#54031D`). Os dois passam com folga
/// o piso de 3:1 do SC 1.4.11 para objeto grafico. A lingua e os tracos de
/// brilho continuam Manteiga nos dois temas, pela excecao registrada no §4 de
/// `design/marca/README.md`.
class _PlaquinhaDaMarca extends StatelessWidget {
  const _PlaquinhaDaMarca();

  /// 96 dp de largura, 105,6 de altura pela proporcao da moldura. O simbolo
  /// dentro dela fica nos 48 dp do piso de reducao medido no §3.10 -- o menor
  /// tamanho em que a variante cheia ainda serve.
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
