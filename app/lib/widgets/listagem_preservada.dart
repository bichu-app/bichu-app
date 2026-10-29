import 'dart:math' as math;

import 'package:flutter/material.dart';

/// O ESTADO DE UMA LISTAGEM SOBREVIVE A IDA E VOLTA (BICHUS-316).
///
/// Pedido do cliente: *"nas paginas de listagem como pets, eventos e
/// comunidade, quando eu estou rodando e ja passei umas 3 paginacoes e clico em
/// um dos itens para ir para a pagina interna e volto para a pagina anterior, a
/// rolagem esta voltando la para cima, voce consegue fazer voltar exatamente no
/// mesmo registro que eu tinha visto, como se mantivesse a paginacao?"*
///
/// ---------------------------------------------------------------------------
/// ## O DEFEITO TEM DUAS CAUSAS, E SO A SEGUNDA E OBVIA
///
/// Medido com a sonda de 29/10/2026 na aba `Comunidade`, 25 itens carregados
/// (`Carregar mais` uma vez), deslocamento 2756,0 antes de entrar na ficha:
///
/// | | itens ao voltar | deslocamento ao voltar |
/// |---|---|---|
/// | como estava | 20 | 176,0 |
/// | sem a recarga de volta | 25 | **176,0** |
///
/// A segunda linha e a que decide o desenho desta peca. **O `State` da
/// listagem SOBREVIVE** -- o ramo do `StatefulShellRoute.indexedStack` fica
/// vivo, e a sonda confirmou `identical(posicaoAntes, posicaoDepois) == true`,
/// isto e, a MESMA `ScrollPosition`. Mesmo assim o deslocamento volta em 176:
/// enquanto a rota interna cobre o ramo, o rolavel e posto fora de cena, o
/// viewport vai a zero, `maxScrollExtent` vai a zero junto e a posicao e
/// GRAMPEADA. Quando a listagem reaparece, o numero que se perdeu nao volta
/// sozinho -- nao ha onde ele estivesse guardado.
///
/// Por isso **nao basta parar de recarregar**, e nao basta um `ScrollController`
/// vivo: a posicao tem de ser COPIADA para fora do rolavel antes de ele sair de
/// cena, e reaplicada depois. E as duas causas tem de cair juntas:
///
/// 1. **as paginas** -- cada listagem recarregava da pagina 1 ao voltar a
///    aparecer (`didChangeDependencies` + `TickerMode`), jogando fora o que o
///    `Carregar mais` tinha acumulado. Voltar no item 60 refazia tres chamadas
///    de rede antes de mostrar qualquer coisa, e em rede ruim e isso que a
///    pessoa sente;
/// 2. **o deslocamento** -- grampeado a zero pela saida de cena, como acima.
///
/// Consertar so a (1) devolve os itens e mantem a rolagem no topo; consertar so
/// a (2) reaplica um numero sobre uma lista que encurtou, e o grampo o corta de
/// novo. [PreservacaoDaListagem] responde pela (1) e [PreservaARolagem] pela
/// (2).
///
/// ---------------------------------------------------------------------------
/// ## PRESERVAR DEMAIS E PIOR QUE NAO PRESERVAR
///
/// Quem troca busca, filtro ou ordenacao e quem MUDA a pergunta, e devolver a
/// lista antiga faria a pessoa acreditar no que ve. Por isso o estado
/// preservado morre por SETE gatilhos, e cada um tem caso proprio na suite:
/// a busca, o filtro, a ordenacao, a **localizacao de referencia da conta**
/// (a `Comunidade` ordena por distancia a partir dela -- ADR-0006, e nao do
/// GPS --, entao a referencia mudar torna a ordem preservada ERRADA), o
/// arrastar-para-atualizar, o teto de itens e a validade no tempo.
///
/// Os quatro primeiros entram por [assinatura]: a listagem compoe uma linha
/// com o que define a pergunta, e assinatura diferente descarta. O gatilho da
/// referencia e o que ninguem lembraria, e e por isso que ele esta NOMEADO
/// aqui em vez de confiado a disciplina de quem compoe a linha.
const Duration validadeDaListagemPreservada = Duration(minutes: 5);

/// O TETO DE ITENS PRESERVADOS numa listagem de MINIATURA.
///
/// **Medido, e nao arredondado por gosto.** `telas/perdido/cartao_do_perdido.dart`
/// tem a conta da miniatura: a derivada `thumb` com `cacheWidth` decodifica a
/// 168 px e custa **121 KiB por cartao**; a pagina de 20 custa 2,37 MiB e cem
/// cartoes custam **11,8 MiB** -- numero que aquele arquivo ja media e ja
/// aceitava, porque e o que a tela paga HOJE depois de quatro toques em
/// `Carregar mais`. Cinco paginas e onde esse numero para de crescer.
///
/// **Preservar nao aumenta o pico**, e isso importa para a conta: o ramo fica
/// vivo durante a visita a pagina interna, com os widgets de imagem montados,
/// entao os bytes decodificados ja estavam residentes. O que mudou e que
/// `_itens.clear()` os LIBERAVA ao voltar; preservar os mantem. O teto existe
/// para a acumulacao nao ser infinita, e nao para pagar uma conta nova.
const int tetoDeItensPreservados = 100;

/// O TETO DE ITENS PRESERVADOS numa listagem de CAPA 16:9 -- a agenda.
///
/// A capa do cartao de encontro nao e miniatura: `telas/rede/pecas_da_rede.dart`
/// mede 326 dp pintados, 978 px a 3x, 16:9 -- **978 x 550 x 4 = 2,05 MiB por
/// cartao**. Uma pagina de 20 custa **41 MiB** e duas custam **82 MiB**.
///
/// **Esse custo e anterior a esta frente e nao foi consertado aqui** ("so o
/// pedido"): quem esta na pagina 3 da agenda hoje ja carrega 123 MiB, com ou
/// sem preservacao. O teto de DUAS paginas e o que reduz o que atravessa a
/// volta -- sem ele a acumulacao seria ilimitada --, e fica registrado que 82
/// MiB passa dos 65,6 MiB que o projeto recusou em
/// `telas/perto/lista_do_diretorio.dart` para vinte faixas 16:9. A conta de
/// baixar a capa do cartao e de outra frente, e esta nao a faz.
const int tetoDeItensPreservadosComCapa = 40;

/// A DECISAO de devolver o estado preservado, ou de recomecar.
///
/// Ela nao guarda os itens: eles ja vivem no `State` da listagem, que sobrevive
/// (ver a prosa de [validadeDaListagemPreservada]). O que esta peca guarda e o
/// que o `State` NAO sabe dizer sozinho -- sob que pergunta aqueles itens foram
/// medidos, e quando.
class PreservacaoDaListagem {
  PreservacaoDaListagem({
    required this.teto,
    DateTime Function()? relogio,
  }) : _relogio = relogio ?? DateTime.now;

  /// Quantos itens ainda cabem. Ver [tetoDeItensPreservados].
  final int teto;

  /// O relogio, injetavel **para o teste poder envelhecer o estado** sem
  /// esperar cinco minutos de verdade. Em producao e `DateTime.now`.
  final DateTime Function() _relogio;

  String? _assinatura;
  DateTime? _medidoEm;

  /// A listagem acabou de medir [itens] itens sob [assinatura].
  void marcar(String assinatura) {
    _assinatura = assinatura;
    _medidoEm = _relogio();
  }

  /// UM GATILHO DE INVALIDACAO DISPAROU: o estado preservado morre.
  ///
  /// Chamado por quem troca busca, filtro, ordenacao ou a localizacao de
  /// referencia, e pelo arrastar-para-atualizar. **Nao e `setState`**: quem
  /// chama ja esta dentro de um, ou vai recarregar em seguida.
  void descartar() {
    _assinatura = null;
    _medidoEm = null;
  }

  /// Ha estado preservado que valha a pena devolver?
  ///
  /// Falso devolve a listagem ao comportamento antigo -- recarrega a pagina 1 e
  /// abre no topo --, e e esse o caminho de TODO gatilho de invalidacao.
  bool vale({required int itens, required String assinatura}) {
    final medidoEm = _medidoEm;
    // Nunca mediu, ou um gatilho descartou.
    if (medidoEm == null) return false;
    // A PERGUNTA MUDOU: busca, filtro, ordenacao ou a referencia de distancia.
    if (_assinatura != assinatura) return false;
    // Nao ha o que devolver. Lista vazia preservada esconderia uma lista que
    // agora tem itens.
    if (itens <= 0) return false;
    // O TETO. Ver a conta nas duas constantes.
    if (itens > teto) return false;
    // O DADO ENVELHECEU. Lista de perdidos preservada por muito tempo mostra
    // caso ja encerrado, e e por isso que este portao existe.
    return _relogio().difference(medidoEm) < validadeDaListagemPreservada;
  }
}

/// A EPOCA DA LISTA, que a listagem publica para a casca.
///
/// **Um inteiro, e nao a assinatura da pergunta**, e a diferenca decide a
/// correcao. Sao DUAS perguntas diferentes, e cada peca responde a uma:
///
/// - [PreservacaoDaListagem.vale] pergunta *"as paginas que eu tenho ainda
///   respondem a mesma pergunta?"*, e para isso precisa da ASSINATURA -- texto
///   composto de busca, filtro, ordenacao e localizacao de referencia --,
///   porque a referencia pode mudar com a listagem FORA DE CENA, sem nenhuma
///   carga rodando para avisar;
/// - esta peca so precisa de UM AVISO -- *"descartei o que tinha"* --, e com ele
///   apaga a entrada do cofre. **Nao e um numero a comparar**, e a razao foi
///   medida: a volta para a aba REMONTA `TelaDeAba`, entao qualquer contador
///   guardado no `State` da casca volta a zero enquanto o cofre, que e de
///   modulo, guarda o valor antigo -- as duas pontas nunca casavam e nada era
///   reaplicado. O aviso nao tem esse problema porque nao carrega estado.
///
/// **Mora num `ValueNotifier` e nao num parametro** pela mesma razao que
/// `SlotDeAtualizacao` e `SlotDaBarraDeListagem`: quem monta o rolavel e
/// `TelaDeAba`, e quem sabe que a lista foi descartada e o corpo da secao, que
/// e filho dela. Publicar de baixo para cima e o unico arranjo que nao faz a
/// casca conhecer cada listagem.
class RolagemDaListagem extends ValueNotifier<int> {
  RolagemDaListagem() : super(0);

  bool _descartada = false;

  @override
  void dispose() {
    _descartada = true;
    super.dispose();
  }

  bool get descartada => _descartada;
}

/// O SLOT: a casca o oferece, o corpo da secao publica nele.
class SlotDaRolagem extends InheritedWidget {
  const SlotDaRolagem({
    required this.rolagem,
    required super.child,
    super.key,
  });

  final RolagemDaListagem rolagem;

  static SlotDaRolagem? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDaRolagem>();

  /// A listagem DESCARTOU o que tinha: o deslocamento guardado morre com ela.
  ///
  /// Chamado de dentro da carga que limpa os itens, e por isso cobre TODO
  /// gatilho de invalidacao de uma vez -- busca, filtro, ordenacao,
  /// arrastar-para-atualizar e a resolucao da cidade todos passam por la. E
  /// invalidacao **por construcao**, e nao por disciplina de quem lembrar de
  /// chamar.
  void aListaFoiDescartada() {
    if (rolagem.descartada) return;
    rolagem.value = rolagem.value + 1;
  }

  @override
  bool updateShouldNotify(SlotDaRolagem antigo) => antigo.rolagem != rolagem;
}

/// GUARDA O DESLOCAMENTO FORA DO ROLAVEL, e o reaplica quando a listagem volta
/// a aparecer.
///
/// Ver a tabela em [validadeDaListagemPreservada] para por que um
/// `ScrollController` vivo nao basta.
///
/// **`TickerMode` e o sinal, e nao `RouteAware`.** As TRES maneiras de a
/// listagem sair da vista -- o botao do sistema, o gesto de borda e a troca de
/// aba -- chegam aqui pelo mesmo caminho: `go_router` embrulha cada ramo do
/// `IndexedStack` em `TickerMode(enabled: ramo == atual)`, e empilhar uma rota
/// opaca sobre a casca desliga o mesmo sinal. As listagens ja liam este sinal
/// para decidir recarga; a rolagem passa a ler o MESMO. Um observador de rota
/// veria a primeira e a segunda e nao veria a terceira, e o comportamento
/// ficaria aleatorio para quem usa -- a pior categoria de defeito de interface.
class PreservaARolagem extends StatefulWidget {
  const PreservaARolagem({
    required this.rolagem,
    required this.filho,
    super.key,
  });

  /// A epoca publicada pelo corpo. Abas que nao listam registro nenhum nunca
  /// a incrementam, e o deslocamento delas segue como era.
  final RolagemDaListagem rolagem;

  /// Recebe o controlador que o rolavel tem de usar.
  final Widget Function(BuildContext context, ScrollController controlador)
      filho;

  @override
  State<PreservaARolagem> createState() => _EstadoDePreservaARolagem();
}

class _EstadoDePreservaARolagem extends State<PreservaARolagem> {
  late final ScrollController _controlador = ScrollController()
    ..addListener(_anotarODeslocamento);

  /// O ultimo deslocamento anotado COM A LISTA EM CENA, ou nulo.
  ///
  /// **Campo do `State`, e nao mapa de modulo**, e isso foi conferido: o
  /// `State` desta peca sobrevive as tres saidas de cena -- medido com um
  /// `debugPrint` em `initState`, que corre UMA vez por secao tanto na volta
  /// pelo botao do sistema quanto na troca de aba. Um cofre de modulo
  /// resolveria uma remontagem que nao acontece, e seria estado global sem
  /// dono.
  double? _guardado;

  bool _visivel = false;

  @override
  void initState() {
    super.initState();
    widget.rolagem.addListener(_aListaFoiDescartada);
  }

  @override
  void didUpdateWidget(PreservaARolagem antigo) {
    super.didUpdateWidget(antigo);
    if (antigo.rolagem != widget.rolagem) {
      antigo.rolagem.removeListener(_aListaFoiDescartada);
      widget.rolagem.addListener(_aListaFoiDescartada);
    }
  }

  /// A LISTA FOI DESCARTADA: o deslocamento morre com ela.
  ///
  /// Sem isto, trocar o filtro enquanto a lista estava fora de cena devolveria
  /// a pessoa ao item 60 de uma lista que agora responde outra pergunta.
  void _aListaFoiDescartada() => _guardado = null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visivel = TickerMode.valuesOf(context).enabled;
    if (!visivel) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _reaplicar();
  }

  /// ANOTA O DESLOCAMENTO A CADA QUADRO DE ROLAGEM.
  ///
  /// **Anotar a cada quadro, e nao copiar na hora de sair de cena.** Copiar
  /// quando `TickerMode` avisa depende de o rolavel ainda estar medido naquele
  /// instante, e isso vale para a rota opaca (que nao remede nada) mas nao e
  /// garantido para o `IndexedStack`, que poe o ramo fora de cena. Anotar
  /// continuamente nao depende da ordem entre o aviso e o leiaute, e o custo e
  /// uma atribuicao por quadro de rolagem.
  ///
  /// **`viewportDimension > 0` e o que separa rolagem de grampo.** Fora de cena
  /// o viewport mede zero, e todo aviso que chega nesse estado e o grampo
  /// falando, nao a pessoa rolando. Sem este teste, a anotacao seria sobrescrita
  /// pelo proprio zero que ela existe para sobreviver.
  void _anotarODeslocamento() {
    if (!_controlador.hasClients) return;
    final posicao = _controlador.positions.first;
    if (posicao.viewportDimension <= 0) return;
    _guardado = posicao.pixels;
  }

  /// Reaplica o deslocamento no quadro seguinte.
  ///
  /// **No quadro seguinte, e nao agora**: no instante em que `TickerMode` volta
  /// a ligar o rolavel ainda nao foi medido de novo, e `maxScrollExtent` esta no
  /// zero que o grampeou. Saltar aqui nao teria para onde saltar.
  void _reaplicar() {
    final alvo = _guardado;
    if (alvo == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!_controlador.hasClients) return;
      // Um gatilho pode ter disparado entre o agendamento e o quadro.
      if (_guardado == null) return;
      final posicao = _controlador.positions.first;
      // **Grampeado ao que a lista TEM.** Se ela encurtou -- porque o teto
      // reprovou, ou porque a recarga trouxe menos --, saltar para o numero
      // antigo estouraria o fim e deixaria a tela numa borracha vazia.
      final destino = math.min(alvo, posicao.maxScrollExtent);
      if (destino <= 0) return;
      if ((posicao.pixels - destino).abs() > 0.5) posicao.jumpTo(destino);
    });
  }

  @override
  void dispose() {
    widget.rolagem.removeListener(_aListaFoiDescartada);
    _controlador
      ..removeListener(_anotarODeslocamento)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.filho(context, _controlador);
}

/// A ASSINATURA DA PERGUNTA, composta na MESMA ordem pelas tres listagens.
///
/// [pergunta] e o recorte que vai para a rota -- busca, filtro e ordenacao --,
/// e **`page` sai dela**: a pagina nao faz parte da pergunta, e deixa-la aqui
/// invalidaria o estado a cada `Carregar mais`, que e o oposto do pedido.
///
/// [referencia] e **A LOCALIZACAO DE REFERENCIA DA CONTA**, e ela esta num
/// parametro PROPRIO de proposito. A `Comunidade` ordena por distancia a partir
/// dela -- da referencia cadastrada e nunca do GPS, que e decisao de
/// privacidade (ADR-0006) --, ela **nao aparece em query nenhuma** porque o
/// servidor a resolve do lado dele, e ela pode mudar com a listagem **fora de
/// cena**: a pessoa edita o endereco em `Perfil` e volta para a `Comunidade`.
/// Nesse caminho nenhuma carga roda para avisar, e sem este termo a lista
/// voltaria ordenada por uma distancia que nao vale mais -- mostrando como "o
/// mais perto" o que ja nao e. **E o gatilho que ninguem lembraria**, e e por
/// isso que ele e um parametro OBRIGATORIO aqui em vez de ficar na conta de
/// quem compoe a linha.
String assinaturaDaListagem({
  required Map<String, String> pergunta,
  required String? referencia,
}) {
  final chaves = pergunta.keys.where((chave) => chave != 'page').toList()
    ..sort();
  final recorte = chaves.map((c) => '$c=${pergunta[c]}').join('&');
  return '$recorte#${referencia ?? 'sem-referencia'}';
}

/// A localizacao de referencia da conta como UMA linha, ou nulo quando nao ha.
///
/// Os quatro campos entram, e nao so a cidade: trocar o bairro dentro da mesma
/// cidade muda a distancia de cada cartao da `Comunidade`, e e exatamente o
/// caso que uma assinatura so-de-cidade deixaria passar.
String? textoDaReferencia({
  String? cep,
  String? bairro,
  String? cidade,
  String? uf,
}) {
  if (cep == null && bairro == null && cidade == null && uf == null) {
    return null;
  }
  return '$cep|$bairro|$cidade|$uf';
}
