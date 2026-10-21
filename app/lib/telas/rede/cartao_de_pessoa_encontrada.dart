import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/problem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';

/// Um resultado da busca de pessoas, com a ação de pedir conexão e **os
/// quatro estados da relação**.
///
/// ## O CÍRCULO LEVA A FOTO, E ISSO EMENDA A EMENDA 5 ITEM 2 (21/10/2026)
///
/// **Este bloco dizia o contrário, e a inversão é do cliente.** Até 21/10/2026
/// o círculo era só a inicial, pela emenda 5 item 2 do ADR-0010 — *"a foto não
/// sai para quem não é conexão aceita"*. O cliente emendou a própria decisão,
/// literal: *"o resultado tras foto sim, para identificar usuarios com nomes
/// parecidos."*
///
/// **O argumento é de uso, e ele é bom:** com só o nome, duas `Maria Silva` são
/// indistinguíveis. Numa busca cujo propósito é achar **uma pessoa específica
/// que você conhece**, tirar a foto transforma a lista em adivinhação — e a
/// pessoa pede conexão à errada, que é um erro que ninguém desfaz sem atrito.
///
/// ## OS TRÊS FREIOS QUE TORNAM ISSO DEFENSÁVEL
///
/// Eles são a diferença entre **busca** e **catálogo de rostos**, e nenhum é
/// enfeite. **Se algum dos três cair, esta decisão fica apoiada em nada** — e o
/// rosto no resultado tem de cair com ele:
///
/// 1. **A busca exige conta.** `searchPeople` é `bearerAuth` sem alternativa
///    vazia, e esta aba desenha `ConviteParaEntrar` no corpo quando o servidor
///    responde 401. Não há rosto alcançável sem conta.
/// 2. **Piso de três caracteres.** `PessoasApi.minimoDaBusca`, cobrado em dois
///    lugares: a lupa não habilita abaixo dele, e a porta não pergunta. Um
///    padrão mais curto não produz trigrama e casaria quase todo mundo.
/// 3. **Campo vazio nunca lista ninguém.** Não existe "listar todos" — `q`
///    ausente devolve página vazia **sem requisição**. O estado inicial da aba
///    não tem um único rosto.
///
/// Somados: quem vê a foto **já sabe aproximadamente quem procura**, e não é
/// alguém folheando. É isso, e não a quantidade de pixels, que separa esta tela
/// de um diretório de pessoas.
///
/// ## A DERIVADA É A MENOR, E A INICIAL NÃO FOI APAGADA
///
/// `photo_icon_url` é a **`thumb`**, e a escolha é medida: a `card` custa cerca
/// de 51 KB por rosto, e numa página de vinte isso é rede e memória de uma
/// lista que a pessoa rola. Mesmo critério do círculo de 32 dp da barra.
///
/// **Quem não tem foto pronta continua com a inicial no círculo** — o recurso
/// que a emenda 3 manda usar (*"fica a inicial ou o glifo genérico"*). Foto em
/// `processing` ou `rejected` não sai do servidor, então aqui não há estado a
/// desenhar: ou há URL, ou há letra.
///
/// ## A GEOMETRIA NÃO MUDOU, E ISSO FOI MEDIDO
///
/// O círculo já existia com 56 dp porque a inicial morava nele. A foto
/// **substitui o conteúdo do círculo, não a geometria**: o nome recebe
/// exatamente a largura que recebia antes, e nada passou a cortar onde cabia.
/// O caso `o nome tem a MESMA largura com foto e sem foto` mede os dois lados
/// em 320 dp e trava o número.
///
/// ## OS QUATRO ESTADOS, E DE ONDE CADA UM VEM
///
/// A busca **não devolve `connection_state`** — *"numa lista, vinte estados por
/// requisição são o material de que uma lista de conexões se faz do lado de
/// fora"*. Então o cartão nasce sem relação e **aprende o estado da resposta da
/// própria ação**:
///
/// | Estado | Como o cartão chega nele |
/// |---|---|
/// | `nenhum` | é como ele nasce. A ação primária é a única no cartão |
/// | `pedido enviado` | o 201 de `requestConnection` com `state: pending_sent` |
/// | `pedido recebido` | o 201 com `state: pending_received` — a outra pessoa **já havia pedido**, e o pedido é idempotente: ele devolve a aresta que existia em vez de criar uma segunda |
/// | `conectado` | o 201 com `state: connected`, pelo mesmo caminho |
///
/// **Nenhum estado é escrito pela tela.** Quem decide é o servidor — o teto de
/// conexões, o descanso de 90 dias, uma corrida com a outra pessoa —, e uma
/// tela que escrevesse o próximo estado por conta própria mostraria
/// "conectados" sobre um pedido que foi recusado.
///
/// **E não existe estado "recusado".** Para quem pediu, a aresta recusada se
/// projeta como `pending_sent` até a validade passar; um estado próprio seria o
/// *"ela recusou você"* que o produto não dá. É por isso que recusar devolve o
/// cartão a `nenhum`, e não a um quinto estado.
///
/// ## O TETO É ESTADO DA CONTA, E NÃO DA RELAÇÃO
///
/// Com o teto do dia fechado, a ação **não é desenhada**: o lugar dela recebe a
/// linha que diz que o teto fechou. Três coisas decidem isso:
///
/// 1. **Botão desabilitado é proibido.** O critério 2 da BICHUS-62 proíbe
///    renderizar ação sem destino *nem habilitada nem desabilitada*: controle
///    desabilitado continua se anunciando e continua sem desfecho.
/// 2. **A tela trava antes de tentar**, com o motivo escrito. Descobrir um
///    limite de 24 horas por um 400 depois de apertar o botão é descobrir
///    depois de apertar.
/// 3. **O 400 continua tratado**, e isso não é redundância: entre a leitura do
///    resumo e o toque, a mesma conta pode ter pedido de outro aparelho.
///
/// **O número vem do servidor** (`remaining_requests_today`), e nunca de uma
/// constante deste binário: o teto é número que se sobe, e um build antigo com
/// o número gravado mostraria um limite que deixou de valer.
class CartaoDePessoaEncontrada extends StatefulWidget {
  const CartaoDePessoaEncontrada({
    required this.pessoa,
    required this.aoPedir,
    required this.aoAceitar,
    required this.aoEncerrar,
    required this.aoAbrirOPerfil,
    super.key,
    this.pedidosQueAindaCabem,
  });

  final PessoaEncontrada pessoa;

  /// Quantos pedidos ainda cabem hoje, ou **nulo para "não sei"**.
  ///
  /// Nulo e zero são coisas diferentes: zero é a afirmação do servidor de que o
  /// teto fechou; nulo é a ausência de afirmação. Com nulo a ação continua
  /// oferecida e o servidor recusa se precisar, que é a ordem certa de errar —
  /// esconder a ação por não ter conseguido ler o resumo tiraria do ar a única
  /// coisa que a tela existe para fazer.
  final int? pedidosQueAindaCabem;

  /// Pede a conexão e devolve a aresta que o servidor criou **ou devolveu**.
  final Future<Conexao?> Function() aoPedir;

  final Future<Conexao> Function(String ref) aoAceitar;

  /// Recusar, cancelar e desfazer são a **mesma** operação, e o app não diz
  /// qual: a semântica é derivada do estado e do papel, no servidor.
  final Future<void> Function(String ref) aoEncerrar;

  final VoidCallback aoAbrirOPerfil;

  static const String pedirConexao = 'Pedir conexão';
  static const String cancelarPedido = 'Cancelar';
  static const String aceitar = 'Aceitar';
  static const String recusar = 'Recusar';

  static const String pedidoEnviado = 'Pedido enviado, aguardando aceite';
  static const String pedidoRecebido = 'Pediu conexão com você';
  static const String jaEhConexao = 'Já é sua conexão';

  /// O lado de dentro do círculo quando não há letra aproveitável.
  ///
  /// Nunca vazio: um círculo em branco num cartão de pessoa parece imagem que
  /// não carregou, e quem usa leitor de tela ouviria silêncio no lugar de uma
  /// pessoa.
  static const String inicialDeQuemNaoTem = '·';

  /// O lado do círculo — **e ele não mudou quando a foto entrou**.
  ///
  /// Eram 56 dp com a inicial dentro, e continuam 56 dp com a foto. A medição
  /// está no caso de widget: o nome recebe a mesma largura nos dois casos, e
  /// por isso não houve o que encolher. Se um dia precisar encolher, **o avatar
  /// encolhe e o nome não** — o nome é o que a pessoa está lendo.
  static const double ladoDoCirculo = 56;

  static String rotuloDePets(int quantos) =>
      quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  /// A frase do teto, **com o número do servidor dentro**.
  ///
  /// Uma função e não dois literais: "ainda cabe 1" e "ainda cabem 2" são a
  /// mesma informação com a gramática certa, e duas constantes divergiriam na
  /// primeira vez que alguém reescrevesse uma só.
  static String tetoEmPalavras(int restam) {
    if (restam <= 0) {
      return 'Você já enviou os pedidos de hoje. Amanhã cabem mais.';
    }
    if (restam == 1) return 'Ainda cabe 1 pedido hoje.';
    return 'Ainda cabem $restam pedidos hoje.';
  }

  /// A frase de cada recusa de teto, pelo código que o servidor mandou.
  ///
  /// **Nenhuma delas manda tentar de novo**, e isso é o ponto: cinco dos seis
  /// motivos não se resolvem repetindo o toque, e um texto genérico de erro
  /// mandaria a pessoa fazer exatamente isso.
  static String frasePara(RecusaDoPedidoDeConexao recusa) {
    switch (recusa) {
      case RecusaDoPedidoDeConexao.tetoDeConexoes:
        return 'Você chegou ao limite de conexões.';
      case RecusaDoPedidoDeConexao.tetoDeConexoesDeQuemRecebe:
        // **Não diz o número da outra pessoa.** Quantas conexões ela tem é
        // dela, e o teto dela não é informação que alguém pediu para dar.
        return 'Essa pessoa não pode receber novas conexões agora.';
      case RecusaDoPedidoDeConexao.tetoDePendentes:
        return 'Você tem muitos pedidos esperando resposta. Espere um deles '
            'ser respondido.';
      case RecusaDoPedidoDeConexao.tetoDoDia:
        return 'Você já enviou os pedidos de hoje. Amanhã cabem mais.';
      case RecusaDoPedidoDeConexao.emDescanso:
        // **A palavra "recusa" não aparece**, e é o único caso em que o código
        // sabe mais do que a frase pode contar.
        return 'Esse pedido foi feito há pouco tempo. Espere um pouco antes de '
            'pedir de novo.';
      case RecusaDoPedidoDeConexao.jaExiste:
        return 'Vocês já têm uma conexão ou um pedido em andamento.';
    }
  }

  @override
  State<CartaoDePessoaEncontrada> createState() =>
      _EstadoDoCartaoDePessoaEncontrada();
}

class _EstadoDoCartaoDePessoaEncontrada
    extends State<CartaoDePessoaEncontrada> {
  /// A relação como o cartão a conhece. **Nulo é `nenhum`**, igual ao modelo do
  /// perfil: `none` não existe em [EstadoDaConexao], e confundir "nenhuma
  /// relação" com "não entendi o estado" faria a tela desenhar o cartão de
  /// estranho para um valor que o servidor passou a mandar.
  EstadoDaConexao? _estado;

  /// O `ref` da **aresta**, nunca da pessoa. Nulo quando não há aresta viva.
  String? _ref;

  bool _agindo = false;
  String? _recusa;

  /// Roda [acao] com o cartão em `carregando`, e **relê o estado do que ela
  /// devolveu** em vez de supô-lo.
  Future<void> _agir(Future<void> Function() acao) async {
    if (_agindo) return;
    setState(() {
      _agindo = true;
      _recusa = null;
    });
    try {
      await acao();
      if (!mounted) return;
      setState(() => _agindo = false);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        _recusa = _motivoDaRecusa(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        _recusa = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// Traduz a falha na frase certa, **decidindo por `errors[].code` e nunca
  /// pelo status sozinho**.
  ///
  /// Teto de produto é 400 `validation-failed` com o código no corpo; 429 é
  /// outro bicho (teto de requisições por hora). Uma tela que lesse só o status
  /// diria "o servidor está fora, tente de novo" para quem bateu num limite de
  /// 24 horas — mandando a pessoa repetir a única coisa que não resolve.
  String _motivoDaRecusa(FalhaDaApi falha) {
    if (falha.tipo == ProblemTipo.naoEncontrado) {
      // O 404 funde seis motivos, e a tela não desfaz a ambiguidade: descobrir
      // que foi bloqueado é o que gera retaliação.
      return 'Não encontramos esta pessoa.';
    }
    final campo =
        falha.problem.campo(RecusaDoPedidoDeConexao.campoDoApelido)?.codigo;
    final recusa = RecusaDoPedidoDeConexao.porCodigo(campo);
    if (recusa != null) return CartaoDePessoaEncontrada.frasePara(recusa);
    return MensagensDeErro.de(falha).texto;
  }

  Future<void> _pedir() async {
    await _agir(() async {
      final conexao = await widget.aoPedir();
      if (conexao == null || !mounted) return;
      setState(() {
        _estado = conexao.state;
        _ref = conexao.ref;
      });
    });
  }

  Future<void> _aceitar(String ref) async {
    await _agir(() async {
      final conexao = await widget.aoAceitar(ref);
      if (!mounted) return;
      setState(() {
        _estado = conexao.state;
        _ref = conexao.ref;
      });
    });
  }

  Future<void> _encerrar(String ref) async {
    await _agir(() async {
      await widget.aoEncerrar(ref);
      if (!mounted) return;
      // **Volta a `nenhum`, e não a "recusado".** Ver o cabeçalho: um estado
      // próprio para recusa seria o aviso que o produto não dá.
      setState(() {
        _estado = null;
        _ref = null;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: widget.pessoa.nomeParaLer,
      child: InkWell(
        // **Dois alvos no cartão, e nunca ambíguos**: tocar no cartão abre o
        // perfil; tocar no botão pede. É a mesma divisão que o cartão do
        // diretório já faz.
        onTap: widget.aoAbrirOPerfil,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surfaceAlt,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _avatar(cores, textos),
                  const SizedBox(width: BichuEspaco.e3),
                  Expanded(child: _identificacao(cores, textos)),
                ],
              ),
              const SizedBox(height: BichuEspaco.e4),
              ..._areaDeAcao(cores, textos),
            ],
          ),
        ),
      ),
    );
  }

  /// O avatar: **a foto quando há uma, a inicial quando não há.**
  ///
  /// **Decorativo nos dois casos**, e isso é deliberado: o nome é lido ao lado,
  /// e um leitor de tela que anunciasse os dois leria "M, Marina" ou "foto de
  /// Marina, Marina". O rótulo do cartão inteiro já é o nome da pessoa.
  ///
  /// `ImagemDaRede` cuida de carregando, falha e raio, e o `simboloDeFalha` é o
  /// de pessoa: um retrato que não carrega pede outro desenho que uma fachada
  /// que não carrega.
  Widget _avatar(BichuCores cores, TextTheme textos) {
    final url = widget.pessoa.photoIconUrl;
    if (url == null || url.isEmpty) return _circuloDaInicial(cores, textos);
    return ExcludeSemantics(
      child: ClipOval(
        child: ImagemDaRede(
          url: url,
          descricao: null,
          largura: CartaoDePessoaEncontrada.ladoDoCirculo,
          simboloDeFalha: Icons.person_outline,
        ),
      ),
    );
  }

  /// O círculo com a inicial — **a queda de quem não tem foto pronta**.
  ///
  /// Ela não foi apagada quando a foto entrou: é o recurso que a emenda 3 manda
  /// usar, e foto em `processing` ou `rejected` não sai do servidor.
  Widget _circuloDaInicial(BichuCores cores, TextTheme textos) {
    final inicial = widget.pessoa.inicial.isEmpty
        ? CartaoDePessoaEncontrada.inicialDeQuemNaoTem
        : widget.pessoa.inicial;
    return ExcludeSemantics(
      child: Container(
        width: CartaoDePessoaEncontrada.ladoDoCirculo,
        height: CartaoDePessoaEncontrada.ladoDoCirculo,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: cores.primaryContainer,
          shape: BoxShape.circle,
        ),
        child: Text(
          inicial,
          style: textos.titleLarge?.copyWith(color: cores.onPrimaryContainer),
        ),
      ),
    );
  }

  Widget _identificacao(BichuCores cores, TextTheme textos) {
    final pessoa = widget.pessoa;
    final contagens =
        '${CartaoDePessoaEncontrada.rotuloDePets(pessoa.petsCount)} · '
        '${CartaoDePessoaEncontrada.rotuloDeConexoes(pessoa.connectionsCount)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          pessoa.nomeParaLer,
          style: textos.titleMedium?.copyWith(color: cores.textPrimary),
        ),
        // O apelido **com o `@`**, que é símbolo de leitura. Ele não é repetido
        // quando o nome caiu para ele: duas linhas iguais não informam nada.
        if (pessoa.nomeParaLer != '@${pessoa.handle}')
          Text(
            '@${pessoa.handle}',
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          contagens,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }

  /// A área de ação: **uma por estado**, e nunca duas ao mesmo tempo.
  List<Widget> _areaDeAcao(BichuCores cores, TextTheme textos) {
    final recusa = _recusa;
    final ref = _ref;

    final corpo = <Widget>[];

    switch (_estado) {
      case null:
        final restam = widget.pedidosQueAindaCabem;
        if (restam != null && restam <= 0) {
          // **O TETO SUBSTITUI A AÇÃO, e não a desabilita.** Ver o cabeçalho:
          // controle desabilitado é proibido pelo critério 2 da BICHUS-62.
          corpo.add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.tetoEmPalavras(restam),
              cores,
              textos,
            ),
          );
          break;
        }
        corpo.add(
          BotaoPrimario(
            rotulo: CartaoDePessoaEncontrada.pedirConexao,
            icone: Icons.person_add_alt_1_outlined,
            nomeAcessivel:
                '${CartaoDePessoaEncontrada.pedirConexao} com '
                '${widget.pessoa.nomeParaLer}',
            carregando: _agindo,
            aoTocar: () => unawaited(_pedir()),
          ),
        );

      case EstadoDaConexao.pedidoEnviado:
        corpo
          ..add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.pedidoEnviado,
              cores,
              textos,
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e3))
          // `Cancelar` fica desde o primeiro segundo: quem pediu por engano não
          // espera a outra pessoa responder para desfazer.
          ..add(
            BotaoSecundario(
              rotulo: CartaoDePessoaEncontrada.cancelarPedido,
              nomeAcessivel:
                  'Cancelar o pedido para ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_encerrar(ref)),
            ),
          );

      case EstadoDaConexao.pedidoRecebido:
        // **O cartão não oferece "pedir" a quem já pediu**: seriam duas arestas
        // para a mesma relação. A linha explica antes dos dois botões.
        corpo
          ..add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.pedidoRecebido,
              cores,
              textos,
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e3))
          ..add(
            BotaoPrimario(
              rotulo: CartaoDePessoaEncontrada.aceitar,
              nomeAcessivel:
                  'Aceitar a conexão com ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_aceitar(ref)),
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e2))
          ..add(
            BotaoSecundario(
              rotulo: CartaoDePessoaEncontrada.recusar,
              nomeAcessivel: 'Recusar o pedido de ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_encerrar(ref)),
            ),
          );

      case EstadoDaConexao.conectado:
        // **Desfazer a conexão não mora aqui**: mora no perfil, com o resto do
        // que é irreversível. O cartão só afirma o estado.
        corpo.add(
          _linhaDeEstado(CartaoDePessoaEncontrada.jaEhConexao, cores, textos),
        );
    }

    if (recusa != null) {
      corpo
        ..add(const SizedBox(height: BichuEspaco.e3))
        ..add(FaixaDeAviso(texto: recusa));
    }

    return corpo;
  }

  Widget _linhaDeEstado(String frase, BichuCores cores, TextTheme textos) {
    return Text(
      frase,
      style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
    );
  }
}
