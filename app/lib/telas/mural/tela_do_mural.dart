import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/marca_da_pessoa.dart';
import '../../widgets/selo_de_validado.dart';
import 'comentarios_da_publicacao.dart';
import '../casca_com_abas.dart';

/// O corpo da secao `Mural`: **a linha do tempo.**
///
/// ## O que esta frente construiu
///
/// A frente de 19/10 construiu o LUGAR — o slot na barra de baixo (`Mural` pede
/// 50,90 dp num slot de 64,00, medido), o ramo do `IndexedStack`, a rota
/// [Rotas.mural] e um estado vazio honesto que dizia, por escrito, que publicar
/// *"ainda nao esta no ar"*. Estava certo: nao havia onde guardar publicacao.
///
/// **Agora ha.** `user_publications` existe (migracao `20261020000002`),
/// `GET /timeline` e `POST /me/publications` existem, e esta tela desenha o que
/// elas devolvem. O estado vazio deixou de prometer o futuro e passou a
/// descrever o presente.
///
/// ## O RECORTE NAO E DESTA TELA, e isso e a parte que importa
///
/// Esta tela desenha **exatamente** o que `GET /timeline` devolveu, e nao tem um
/// `if` que esconda item nenhum. Quem decide o que entra e a clausula `WHERE` da
/// consulta do servidor (ADR-0021): publicacao de quem nao e conexao aceita de
/// quem chama **nao chega aqui** — nao chega vazia, nao chega marcada, nao
/// chega. Nao existe campo nesta resposta que diga "voce nao pode ver isto",
/// porque nao existe estado assim.
///
/// **E por isso que a isca do app e sobre a AUSENCIA de outra fonte**, e nao
/// sobre um filtro: `mural_nao_tem_outra_fonte_test.dart` prova que a unica
/// coisa que esta tela pinta vem de `LeituraDoMural.linhaDoTempo`, e que ela nao
/// alcanca nenhuma outra leitura do app. Um filtro de tela seria o recorte
/// migrando para o cliente — e o cliente e onde ele nao pode estar.
///
/// ## OS DOIS ESTADOS VAZIOS, e eles sao diferentes de proposito
///
/// `items: []` tem duas causas, e a pessoa precisa saber qual:
///
/// - **ninguem publicou ainda** (ela tem conexao, ou publicou algo): a lista
///   vazia e temporaria, e o texto diz isso;
/// - **ela nao tem conexao nenhuma e nao publicou nada**: a lista vazia e
///   estrutural, e dizer "quando alguem publicar aparece aqui" seria mentir —
///   nao ha ninguem de quem esperar.
///
/// A distincao sai de `listMyPublications`, que **nao depende de conexao**: se
/// ela tambem vem vazia, a pessoa nao publicou nada. E por isso que esta tela
/// faz DUAS leituras e nao uma.
///
/// ## O TEXTO NAO PROMETE AVISO, e isso continua medido
///
/// Nenhuma frase desta tela diz "a gente te avisa": o envio de push esta
/// bloqueado em producao por falta de permissao da conta de servico, e a rota de
/// contagem da caixa de notificacoes nem esta no contrato. O sino esta na barra;
/// o aviso nao esta.
///
/// ## A BARRA DE LISTAGEM NAO E DESENHADA, e isso e o padrao sendo OBEDECIDO
///
/// As tres regras de `barra_de_listagem.dart`, aplicadas: nao existe rota de
/// busca de publicacao (campo que mente sobre o alcance e pior que campo
/// ausente); uma linha do tempo tem UMA ordem (mais recente primeiro, e uma
/// opcao nao e uma escolha); e nao ha grupo de filtro que o servidor aceite. Com
/// os tres ausentes o componente devolveria `SizedBox.shrink()` sozinho — entao
/// ele nao e chamado. **No dia em que o servidor oferecer um recorte, a barra
/// aparece no lugar padrao, sem desenho novo.**
class CorpoDoMural extends StatefulWidget {
  const CorpoDoMural({
    required this.leitura,
    required this.interacao,
    super.key,
    this.aoDenunciar,
    this.aoApagar,
  });

  /// A leitura, por interface ESTREITA: esta tela nao alcanca `publicar` nem
  /// `apagar` por aqui. Quem publica e a tela de publicar, aberta pela acao
  /// flutuante.
  final LeituraDoMural leitura;

  /// Curtir, descurtir e comentar. Interface ESTREITA, pelo mesmo motivo de
  /// [leitura]: o cartao que curte nao deve alcancar `apagar` da publicacao --
  /// um toque errado apagaria a publicacao em vez de descurtir.
  final InteracaoDoMural interacao;

  /// Abre a denuncia de uma publicacao de OUTRA pessoa. Nulo nao desenha a
  /// opcao — `reportPublication` existe no contrato, e quem a liga na tela e
  /// quem montar a folha de denuncia; ate la a opcao **nao nasce**, em vez de
  /// nascer sem destino (criterio 2 da BICHUS-62).
  final void Function(PublicacaoDaLinha)? aoDenunciar;

  /// Apaga a PROPRIA publicacao. Nulo nao desenha a opcao, pelo mesmo motivo.
  final Future<void> Function(PublicacaoDaLinha)? aoApagar;

  static const String tituloSemConexao = 'Comece pelas suas conexões';
  static const String explicacaoSemConexao =
      'O Mural mostra o que as suas conexões publicam. Você ainda não tem '
      'nenhuma — e também pode publicar, que aparece aqui para elas.';

  /// A SAIDA do vazio sem conexao, e **a unica acao que este estado tem**.
  ///
  /// Ela entrou em 21/10/2026, com a aba `Usuarios`. Antes dela este vazio era
  /// verdadeiro e **sem porta**: ele dizia que o Mural mostra o que as conexoes
  /// publicam, dizia que a pessoa nao tem nenhuma, e nao dizia o que fazer. Foi
  /// por isso que o cliente descobriu que conexao nao funcionava -- o produto
  /// nao oferecia caminho nenhum para a primeira.
  ///
  /// **E por que ela e aqui, e nao so a aba.** A aba `Usuarios` e a terceira de
  /// uma barra rolavel: em 320 dp ela nasce 40% visivel, e a 200% de escala
  /// nasce fora da tela. Este vazio e o lugar por onde todo mundo passa no
  /// primeiro dia. Os dois caminhos existem; este e o que de fato se usa.
  static const String buscarPessoas = 'Buscar pessoas';

  static const String tituloSemPublicacao = 'As publicações ficam aqui';
  static const String explicacaoSemPublicacao =
      'Quando as suas conexões publicarem, as publicações aparecem aqui.';

  /// O rotulo da foto para quem usa leitor de tela **quando quem publicou nao
  /// escreveu uma descricao**.
  ///
  /// Generico, e **nao `ExcludeSemantics`**: quem nao ve precisa saber que ha
  /// uma foto ali, mesmo sem saber o que ela mostra. Esconder a imagem do leitor
  /// apagaria metade da publicacao para essa pessoa.
  static const String fotoSemDescricao = 'Foto da publicação';

  /// O INTERVALO MINIMO entre duas recargas pedidas pelo TOQUE NA BARRA.
  ///
  /// Publico porque a isca o LE em vez de repetir o numero: um caso que
  /// escrevesse `31` a mao continuaria verde no dia em que o valor mudasse.
  /// A escolha, as quatro razoes dela e a pendencia do sino estao na prosa
  /// de `_CorpoDoMuralState.intervaloMinimoEntreRecargas`.
  static const Duration intervaloMinimoEntreRecargas = Duration(seconds: 30);

  @override
  State<CorpoDoMural> createState() => _CorpoDoMuralState();
}

class _CorpoDoMuralState extends State<CorpoDoMural>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 20/10/2026: *"a pagina do mural nao
  /// esta funcionando a funcionalidade de atualizar a pagina puxando pra
  /// baixo"*).
  ///
  /// **A mesma funcao de [recarregar] e da carga inicial**, e nao uma copia:
  /// duas buscas com dois nomes divergem na primeira correcao. Quem desenha a
  /// roda e a casca da secao, por `SlotDeAtualizacao` — ver
  /// `widgets/arrastar_para_atualizar.dart`. Um `RefreshIndicator` cru aqui
  /// reintroduziria o defeito da fisica sem pai que aquele arquivo registra.
  ///
  /// O Mural era a **unica** tela de listagem do app sem o gesto: as outras
  /// dezessete ja o tinham, e esta metade nunca foi ligada embora a outra
  /// ([_carregar]) existisse desde o nascimento da tela.
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  List<PublicacaoDaLinha>? _linha;

  /// Se a propria pessoa tem alguma publicacao. **E ele que escolhe qual estado
  /// vazio desenhar** — ver o cabecalho.
  bool _tenhoPublicacao = false;

  bool _carregando = true;
  MensagemDeErro? _faixa;

  /// ---------------------------------------------------------------------
  /// A FOTO QUE AINDA ESTA SENDO PROCESSADA, E A RELEITURA QUE A ALCANCA
  /// ---------------------------------------------------------------------
  ///
  /// **O defeito que isto fecha, com relato e medicao.** O cliente disse, em
  /// 20/10/2026: *"os posts no mural, nao esta publicando a foto, apenas o
  /// texto"*. A foto **era** gravada e **era** servida — medido em homologacao
  /// de ponta a ponta (intencao `201`, envio ao armazenamento `204`,
  /// `POST /me/publications` `201`, a linha com `image_id`, a derivada em
  /// `people/card/` e a URL `200` pela borda) e pintada pelo APK **release**
  /// no emulador Android. O que falhava era o RELOGIO:
  ///
  /// ```text
  ///   t=+  24 ms  POST /me/publications    201   image.status=processing, url=null
  ///   t=+ 320 ms  GET  /timeline           200   image=null
  ///   t=+ 721 ms  GET  /timeline           200   image=null
  ///   t=+1018 ms  GET  /timeline           200   image=null
  ///   t=+1521 ms  GET  /timeline           200   image={url: .../people/card/...}
  /// ```
  ///
  /// `AbaMural` troca a `Key` desta tela assim que a tela de publicar fecha, o
  /// corpo remonta e [_carregar] sai **dentro** dessa janela. A linha do tempo
  /// devolve `image: null` — o predicado `status = ready` esta no `JOIN` do
  /// servidor —, e `PublicacaoDaLinha` **nao tem estado** para distinguir "sem
  /// foto" de "foto a caminho". O cartao desenhava so o texto, e nao havia
  /// segunda leitura nenhuma: sem o gesto de arrastar (o outro defeito desta
  /// branch) e com o `IndexedStack` mantendo a aba montada, a foto so aparecia
  /// quando a pessoa **matava o aplicativo e voltava**. Foi assim que o iPhone
  /// dele mostrou e o Android nao: nao e plataforma, e o instante da leitura.
  ///
  /// **A resposta ja esta em maos, e por isso isto nao custa uma chamada a
  /// mais.** [_carregar] ja le `minhasPublicacoes`, e `MyPublicationImage` TEM
  /// `status` (`EstadoDaFotoDaPublicacao`). Se alguma publicacao minha esta em
  /// `processando`, a tela relê sozinha — ate [_releiturasMaximas] vezes, a
  /// cada [_intervaloDaReleitura]. O teto existe para a foto `rejected` que
  /// nunca sai de `processing` por falha do worker nao virar laco eterno.
  static const Duration _intervaloDaReleitura = Duration(seconds: 2);
  static const int _releiturasMaximas = 5;

  Timer? _releitura;
  int _releiturasRestantes = _releiturasMaximas;

  /// ---------------------------------------------------------------------
  /// O TOQUE NO ICONE DA BARRA RECARREGA (cliente, 20/10/2026)
  /// ---------------------------------------------------------------------
  ///
  /// Literal: *"toda vez que eu clicar no icone, ele deve fazer uma nova
  /// requisicao para garantir que o conteudo esta atualizado e o usuario nao
  /// precisar forcar a atualizacao, por mais que esse recurso deva acontecer,
  /// caso o usuario queira"*. A segunda metade da frase e explicita: o
  /// arrastar-para-atualizar **continua**, e este gesto e ADICIONAL.
  ///
  /// ## NADA EM `casca_com_abas.dart` MUDOU, e isso foi deliberado
  ///
  /// A barra e o avatar moram naquele arquivo e outra frente esta nele agora.
  /// Os dois sinais de que esta tela precisa **ja sao emitidos** pela casca e
  /// pelo roteador, e e so escuta-los daqui:
  ///
  /// - **entrar na aba vindo de outra** -> `StatefulShellRoute.indexedStack`
  ///   embrulha cada ramo em `TickerMode(enabled: ramo == atual)`
  ///   (`go_router` 17.5, `route.dart:1634`). `TickerMode.of(context)` vira
  ///   `true` no quadro em que a secao aparece, e `didChangeDependencies` e
  ///   chamado por causa disso;
  /// - **tocar o icone ja estando na aba** -> a casca chama
  ///   `goBranch(ramo, initialLocation: true)`, que cai em `GoRouter.go` para
  ///   o MESMO endereco. `_setValue` compara caminho, consulta, fragmento **e
  ///   `state`** (`information_provider.dart:242`), e `RouteInformationState`
  ///   nao define `==` — entao o objeto novo nunca e igual ao anterior e o
  ///   provedor **notifica mesmo com a URL identica**. E por isso que este
  ///   caso existe sem um canal novo na barra.
  ///
  /// A distincao entre os dois sai de graca pela ORDEM: o ouvinte do roteador
  /// roda dentro de `notifyListeners`, antes do quadro em que o `TickerMode`
  /// vira — entao, vindo de outra aba, [_visivel] ainda e `false` quando
  /// [_aoNavegar] roda, e so o caminho de "entrar" dispara.
  ///
  /// ## O INTERVALO MINIMO E ESCOLHA DE ENGENHARIA, E O NUMERO E ESTE
  ///
  /// **30 segundos**, e as razoes sao quatro:
  ///
  /// 1. `GET /v1/timeline` **nao tem teto de chamadas** no contrato
  ///    (`publicacao-routes.ts`: `effects: []`, sem `rateLimit`). Nao ha
  ///    numero do servidor a que ancorar: o teto esta sendo posto aqui, de
  ///    proposito, e ele segura a aba em **no maximo 2 chamadas por minuto**
  ///    por mais rapido que o dedo seja;
  /// 2. o Mural e um feed ESCRITO A MAO por uma comunidade de bairro, e nao
  ///    um fluxo ao vivo. Abaixo de 30 s nao ha o que encontrar de novo;
  /// 3. o toque **nunca parece inerte**, mesmo quando pula a requisicao: ele
  ///    leva a lista ao topo de qualquer jeito (ver [_aoNavegar]), que e o que
  ///    a pessoa espera de tocar o icone da aba em que ja esta;
  /// 4. a releitura da foto em `processing` **nao passa por aqui** — ela tem
  ///    o proprio contador e os proprios 2 s, porque mede outra coisa. O
  ///    arrastar-para-atualizar tambem nao: ele e a forca bruta que o cliente
  ///    manteve de proposito, e estrangula-la seria desfazer o pedido dele.
  ///
  /// **ISTO E ESCOLHA MINHA, E NAO DECISAO DELE.** A pergunta do *"intervalo
  /// minimo entre retomadas"* do sino esta aberta em
  /// `.jarvis/DECISOES-PARA-19-10.md`; quando ele responder, os dois numeros
  /// viram um so e este valor muda junto.
  static const Duration intervaloMinimoEntreRecargas =
      CorpoDoMural.intervaloMinimoEntreRecargas;

  /// A JANELA DE SILENCIO, e por que ela e um `Timer` e nao um carimbo de
  /// `DateTime.now()`.
  ///
  /// `DateTime.now()` le o relogio de parede, e **nenhum teste consegue
  /// adianta-lo**: a janela de 30 s so seria exercitavel esperando 30 s de
  /// verdade, e a isca do "toque dentro do intervalo NAO recarrega" seria o
  /// unico caso do arquivo que nao distingue o mecanismo ligado do desligado.
  /// `Timer` anda com o relogio do `flutter_test`, entao a isca mede os dois
  /// lados com um `pump`.
  ///
  /// Ele e armado em [_carregar], o funil UNICO: arrasto, carga inicial e
  /// releitura da foto tambem renovam a janela, porque todos sao leitura — um
  /// toque logo depois de qualquer um deles nao tem o que buscar.
  Timer? _janelaDeSilencio;

  bool get _emSilencio => _janelaDeSilencio?.isActive ?? false;

  /// Se a secao esta visivel. Ver a prosa de [intervaloMinimoEntreRecargas].
  bool _visivel = false;

  /// A carga EM VOO, e a razao de ela existir.
  ///
  /// Dois toques rapidos nao podem virar duas requisicoes concorrentes: a
  /// resposta da primeira pode chegar **depois** da segunda e pintar conteudo
  /// velho em cima do novo. Quem chega no meio **espera a que ja esta no ar**,
  /// em vez de abrir outra.
  Future<void>? _emVoo;

  ValueListenable<RouteInformation>? _enderecos;


  @override
  void initState() {
    super.initState();
    unawaitedCarregar();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // `maybeOf` e nao `of`: [CorpoDoMural] e montado fora de roteador em
    // teste de widget, e um `of` que lanca ali trocaria "o Mural desenha o
    // cartao" por "o Mural precisa de um `GoRouter` para existir". Sem
    // roteador simplesmente nao ha o sinal do toque na barra -- ele e da
    // casca, e sem casca nao ha barra.
    final enderecos = GoRouter.maybeOf(context)?.routeInformationProvider;
    if (!identical(enderecos, _enderecos)) {
      _enderecos?.removeListener(_aoNavegar);
      _enderecos = enderecos?..addListener(_aoNavegar);
    }

    // `valuesOf` e nao `of`: `of` esta depreciado desde 3.35, e o portao de
    // analise e zero.
    final visivel = TickerMode.valuesOf(context).enabled;
    final entrou = visivel && !_visivel;
    _visivel = visivel;
    // ENTRAR NA ABA. Sem rolagem ao topo: voltar a uma aba devolve a pessoa
    // onde ela estava, e e o toque na aba em que ela JA esta que significa
    // "me leva para o topo".
    if (entrou) _recargaPedidaPelaCasca(aoTopo: false);
  }

  @override
  void dispose() {
    // O temporizador morre com a tela: sem isto, uma secao que saiu da arvore
    // continuaria chamando `_carregar` e o `setState` reprovaria por limpeza.
    _releitura?.cancel();
    _releitura = null;
    _janelaDeSilencio?.cancel();
    _janelaDeSilencio = null;
    _enderecos?.removeListener(_aoNavegar);
    _enderecos = null;
    super.dispose();
  }

  /// O roteador navegou. Ver a prosa de [intervaloMinimoEntreRecargas].
  void _aoNavegar() {
    if (!mounted || !_visivel) return;
    // So o endereco do Mural, e nao qualquer navegacao do aplicativo: tocar
    // outro slot da barra tambem cai aqui, e nao e o gesto que o cliente
    // descreveu.
    if (_enderecos?.value.uri.path != Rotas.mural) return;
    _recargaPedidaPelaCasca(aoTopo: true);
  }

  // NAO HA GUARDA DE "ISTO E VOLTA E NAO TOQUE" AQUI, e a ausencia e MEDIDA.
  //
  // Uma versao desta tela guardava o endereco anterior para distinguir o toque
  // no icone de uma volta (`/mural/publicar` -> `/mural`). Desligar essa
  // guarda nao reprovava caso nenhum -- ela nao guardava nada. O motivo e que
  // as quatro telas irmas da casca (`publicar`, `entrar`, ...) sao rotas de
  // RAIZ, declaradas antes do ramo: empilhar uma tira o ramo do `TickerMode`,
  // e voltar o devolve. Para esta tela isso e *entrar na aba*, e quem responde
  // por ele e [didChangeDependencies] com `aoTopo: false` -- e por isso que a
  // volta recarrega e NAO move a lista. A isca disso e
  // `ISCA (volta) — VOLTAR para o Mural de outra tela NAO pula para o topo`.
  //
  // Mecanismo que nenhuma isca derruba e portao cego, e esta casa nao os
  // guarda.

  /// A recarga que a BARRA pede, com o intervalo minimo e a rolagem ao topo.
  void _recargaPedidaPelaCasca({required bool aoTopo}) {
    // A ROLAGEM VEM ANTES DO ESTRANGULAMENTO, e de proposito: e ela que faz o
    // toque ter efeito visivel mesmo quando a requisicao e pulada.
    //
    // `Scrollable.maybeOf` alcanca o `ListView` da CASCA — quem rola a secao e
    // `TelaDeAba`, e nao este corpo. E por isso que o topo tambem se resolve
    // daqui, sem tocar em `casca_com_abas.dart`.
    if (aoTopo) {
      final rolagem = Scrollable.maybeOf(context);
      final posicao = rolagem?.position;
      if (posicao != null && posicao.hasPixels && posicao.pixels > 0) {
        unawaited(
          posicao.animateTo(
            0,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          ),
        );
      }
    }

    if (_emSilencio) return;
    unawaited(_carregar(silenciosa: true));
  }

  /// Sem `unawaited` de `dart:async` para nao acrescentar import por uma linha;
  /// o nome diz o que esta acontecendo.
  void unawaitedCarregar() {
    _carregar();
  }

  /// O FUNIL UNICO de toda leitura desta tela, e o que ele garante.
  ///
  /// **UMA DE CADA VEZ.** Ver [_emVoo]: quem pede no meio recebe a carga que
  /// ja esta no ar, em vez de abrir uma segunda. O `RefreshIndicator` do
  /// arrasto continua correto com isso -- ele gira enquanto o `Future` que
  /// recebe nao completa, e o `Future` que recebe e o da carga de verdade.
  ///
  /// **A JANELA DE SILENCIO abre aqui**, e por isso vale para todas as
  /// entradas: carga inicial, arrasto, releitura da foto e toque na barra.
  /// Quem a CONSULTA e so [_recargaPedidaPelaCasca] -- as outras tres nao
  /// passam por ela, de proposito.
  Future<void> _carregar({bool silenciosa = false}) {
    final emVoo = _emVoo;
    if (emVoo != null) return emVoo;
    // A janela abre no COMECO da carga e nao no fim: uma resposta lenta nao
    // pode esticar o silencio depois dela.
    _janelaDeSilencio?.cancel();
    _janelaDeSilencio = Timer(intervaloMinimoEntreRecargas, () {});
    final nova = _carregarAgora(silenciosa: silenciosa);
    _emVoo = nova.whenComplete(() {
      _emVoo = null;
    });
    return _emVoo!;
  }

  /// [silenciosa] nao troca a lista pela roda.
  ///
  /// A releitura da foto em `processing` e a recarga do toque na barra
  /// acontecem com a lista ja na tela: pôr `_carregando = true` ali faria o
  /// Mural piscar a cada leitura. A carga inicial, o `Tentar de novo` e o
  /// arrasto continuam ruidosos, porque ali a roda e a resposta certa.
  Future<void> _carregarAgora({bool silenciosa = false}) async {
    if (!silenciosa) {
      setState(() {
        _carregando = true;
        _faixa = null;
      });
    }
    try {
      // AS DUAS LEITURAS. A segunda nao e luxo: sem ela os dois estados vazios
      // ficam indistinguiveis, e a tela escolheria a frase errada em metade dos
      // casos. Ver o cabecalho. **E e dela que sai o `status` da foto**, que a
      // linha do tempo nao carrega.
      final linha = await widget.leitura.linhaDoTempo();
      final minhas = await widget.leitura.minhasPublicacoes();
      if (!mounted) return;
      setState(() {
        _linha = linha.itens;
        _tenhoPublicacao = minhas.itens.isNotEmpty;
        _carregando = false;
      });
      _agendarReleituraSeAFotoAindaProcessa(minhas.itens);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = MensagensDeErro.de(falha);
      });
    }
  }

  /// Arma UMA releitura quando alguma foto minha ainda esta em `processing`.
  ///
  /// Nada em `processando` **zera o contador**: a proxima publicacao recomeca
  /// com as cinco tentativas, em vez de herdar o que a anterior gastou.
  void _agendarReleituraSeAFotoAindaProcessa(List<MinhaPublicacao> minhas) {
    _releitura?.cancel();
    _releitura = null;

    final aindaProcessa = minhas.any(
      (p) => p.imagem?.estado == EstadoDaFotoDaPublicacao.processando,
    );
    if (!aindaProcessa) {
      _releiturasRestantes = _releiturasMaximas;
      return;
    }
    if (_releiturasRestantes <= 0) return;
    _releiturasRestantes -= 1;
    _releitura = Timer(_intervaloDaReleitura, () {
      if (mounted) unawaited(_carregar(silenciosa: true));
    });
  }

  /// Recarrega, para quem publicou agora. Publico porque a acao flutuante vive
  /// em `AbaMural`, fora desta arvore.
  Future<void> recarregar() => _carregar();

  @override
  Widget build(BuildContext context) {
    final faixa = _faixa;
    final linha = _linha;

    if (faixa != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
        // **A SAIDA SAI DA MENSAGEM, e nao desta tela.** Guardar so o `.texto`
        // descartava `acao` e `proximaAcao`, que sao por onde a faixa sabe que
        // saida oferecer — a mesma forma de `perto/pagina_do_local.dart`.
        //
        // O caso que isto fecha e o 401 `unauthenticated`: o cliente mandou
        // remover o TEXTO dele em 18/10/2026 e **a saida ficou** (ver
        // `api/mensagens_de_erro.dart` e `widgets/faixa_de_aviso.dart`). Sem o
        // rotulo e sem o toque, o Mural deslogado abria com uma faixa vermelha
        // com o icone e **mais nada** — sem frase e sem botao, que e o que
        // `faixa_de_aviso.dart` chama, com estas palavras, de *falha calada*.
        // Reproduzido no emulador com o APK release.
        //
        // Rotulo de OPERACAO (`Tentar de novo`, `Recarregar`) nao tem endereco
        // e `saidaDaMensagem` devolve `null` para ele: a faixa so desenha o
        // botao com rotulo **e** callback, entao nao nasce botao morto.
        child: FaixaDeAviso(
          texto: faixa.texto,
          rotuloDaAcao: faixa.acao,
          aoTocarNaAcao: saidaDaMensagem(context, faixa),
        ),
      );
    }

    if (_carregando || linha == null) {
      return const Padding(
        padding: EdgeInsets.all(BichuEspaco.e6),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (linha.isEmpty) {
      // OS DOIS ESTADOS VAZIOS, E AGORA ELES TEM ACOES DIFERENTES.
      //
      // **`Publicar` continua fora dos dois**, e a razao nao mudou: a porta de
      // publicar e a acao flutuante da secao, que esta sempre no canto -- um
      // segundo botao aqui seria a mesma porta em dois lugares, e o
      // `EstadoVazio` com acao repetida e o criterio 2 sendo quebrado dentro do
      // componente que existe para nao quebra-lo.
      //
      // **O que entrou e `Buscar pessoas`, e so no vazio SEM CONEXAO.** Ela nao
      // e a mesma porta duas vezes: nao ha nenhuma outra nesta tela, e a aba de
      // destino nasce 40% visivel em 320 dp. Ver `CorpoDoMural.buscarPessoas`.
      //
      // **No vazio COM conexao ela nao aparece**, e a distincao e o ponto: quem
      // ja tem conexao e esta esperando a primeira publicacao nao precisa
      // buscar mais ninguem, e um botao de buscar ali sugeriria que o Mural
      // vazio e culpa de ter poucas conexoes.
      //
      // `go` e nao `push`: o destino e uma SECAO, e trocar de secao e trocar de
      // ramo da casca. `push` deixaria o Mural embaixo e a barra de baixo
      // continuaria acesa no slot errado.
      return EstadoVazio(
        titulo: _tenhoPublicacao
            ? CorpoDoMural.tituloSemPublicacao
            : CorpoDoMural.tituloSemConexao,
        explicacao: _tenhoPublicacao
            ? CorpoDoMural.explicacaoSemPublicacao
            : CorpoDoMural.explicacaoSemConexao,
        acao: _tenhoPublicacao
            ? null
            : BotaoPrimario(
                rotulo: CorpoDoMural.buscarPessoas,
                icone: Icons.person_search_outlined,
                aoTocar: () => context.go(Rotas.redeNaBuscaDePessoas),
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final publicacao in linha) ...<Widget>[
          _CartaoDaPublicacao(
            publicacao: publicacao,
            interacao: widget.interacao,
            aoDenunciar: widget.aoDenunciar,
            aoApagar: widget.aoApagar == null
                ? null
                : () async {
                    await widget.aoApagar!(publicacao);
                    await _carregar();
                  },
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
      ],
    );
  }
}

/// Um cartao da linha do tempo.
///
/// ## A FOTO DO AUTOR (Emenda 5 do ADR-0010, 20/10/2026)
///
/// Decisao do cliente: *"tras a foto, algo bem parecido com o instagram"*. Ela
/// nasceu ausente, de proposito -- a Emenda 3 limitava a foto de pessoa a
/// `Conversation.participants[]` *"e em mais nenhuma resposta deste contrato"*
/// --, a frente parou e perguntou, e a emenda nomeou esta superficie.
///
/// Redonda, 40 dp, pela derivada `thumb` de 176 que a emenda nomeia. Quem pinta
/// e [ImagemDaRede], nunca `Image.network` cru: ela passa `cacheWidth` pela
/// largura PINTADA, e e esse numero que decide o custo em memoria. A 3x cada
/// foto custa 120 x 120 x 4 = **57,6 KiB** decodificados; com a `card` de 512 e
/// sem `cacheWidth` seriam 1 MiB por cartao.
///
/// **Nula e o estado normal**, em tres casos que a tela nao distingue: a pessoa
/// nao tem foto, a foto nao esta `ready`, ou a conta esta desabilitada. Ai
/// desenha a INICIAL do nome, como a conversa mediada ja faz.
///
/// **"Parecido com o Instagram" foi dito sobre a FOTO**, e o item 7 da Emenda 5
/// registra que isso nao e autorizacao de redesenho: nao entra contagem de
/// seguidores (nao existe seguir), nao entra carrossel, nao entra lista de quem
/// curtiu.
///
/// ## O QUE ELE NAO DESENHA, e cada ausencia tem dono
///
/// - **nenhum pet**: nem nome, nem miniatura, nem link. Foto de pet dentro da
///   foto da publicacao e permitida (cliente, 19/10); LIGAR a ficha dele
///   agruparia os pets de um tutor (item 7 do ADR-0010), e nao ha campo que o
///   permita;
/// - **nenhuma LISTA de quem curtiu.** Curtir e comentar existem desde
///   20/10/2026 (migracao `20261020000006`), e o que o cartao desenha e a
///   CONTAGEM -- nunca quem. O item 7 da Emenda 5 do ADR-0010 registra que a
///   decisao do cliente de 19/10 sobre curtir e contagem, e contagem nao diz
///   quem; nao existe `GET /publications/{ref}/likes`, entao nao ha o que abrir;
/// - **nenhuma contagem de seguidores.** Nao existe seguir neste produto, e
///   "parecido com o Instagram" foi dito sobre a FOTO (item 7 da Emenda 5);
/// - **nenhum lugar** (ADR-0006).
class _CartaoDaPublicacao extends StatelessWidget {
  const _CartaoDaPublicacao({
    required this.publicacao,
    required this.interacao,
    required this.aoDenunciar,
    required this.aoApagar,
  });

  final PublicacaoDaLinha publicacao;
  final InteracaoDoMural interacao;
  final void Function(PublicacaoDaLinha)? aoDenunciar;
  final Future<void> Function()? aoApagar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final imagem = publicacao.imagem;
    final urlDaImagem = imagem?.url;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              _FotoDoAutor(autor: publicacao.autor),
              const SizedBox(width: BichuEspaco.e3),
              // O NOME, COM O SELO DE VALIDADO AO LADO quando a conta tem canal
              // de contato confirmado — emenda do ADR-0010 de 21/10/2026,
              // decisao do cliente: *"os usuarios que validados deve ter um
              // simbolo em frente de seu nome nos posts"*.
              //
              // **O selo custa 24 dp de largura** (`SeloDeValidado.custoDeLargura`),
              // e e o NOME que paga: `NomeComSelo` poe o texto num `Flexible`,
              // entao ele encolhe com `…` e o selo fica. Um nome com `…` ainda e
              // legivel; um selo que desaparece e informacao perdida. A medicao
              // dessa troca a 320, 375 e 430 dp esta em
              // `app/test/widgets/selo_de_validado_test.dart`.
              Expanded(
                child: NomeComSelo(
                  nome: publicacao.autor.nomeExibido,
                  comSelo: publicacao.autor.canalConfirmado,
                  estilo: textos.titleMedium,
                ),
              ),
              _menu(context),
            ],
          ),
          const SizedBox(height: BichuEspaco.e2),

          // O TEXTO, como a pessoa escreveu. Sem recorte, sem "ver mais" e sem
          // nenhum tratamento de conteudo: ele cabe em 280 caracteres, e o
          // cliente mandou deixa-lo livre.
          Text(publicacao.texto, style: textos.bodyLarge),

          if (urlDaImagem != null && urlDaImagem.isNotEmpty) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            // `ImagemDaRede` e nunca `Image.network` cru: ela trata
            // `cacheWidth` pelo que a tela PINTA e tem `errorBuilder` sempre.
            // A derivada e a `card` de 1024 x 1024 (1:1), e o cartao a desenha
            // na largura do corpo — por isso `proporcao: 1`, que e o que faz a
            // altura ser reservada antes de os bytes chegarem e a rolagem nao
            // saltar.
            ImagemDaRede(
              url: urlDaImagem,
              descricao: (imagem?.textoAlternativo?.trim().isNotEmpty ?? false)
                  ? imagem!.textoAlternativo!.trim()
                  : CorpoDoMural.fotoSemDescricao,
              proporcao: 1,
            ),
          ],

          const SizedBox(height: BichuEspaco.e2),
          _AcoesDaPublicacao(publicacao: publicacao, interacao: interacao),
        ],
      ),
    );
  }

  /// O `⋮` do cartao: **`Apagar` na propria, `Denunciar` na de outra pessoa, e
  /// nunca as duas.**
  ///
  /// Quem decide e `publicacao.minha`, que vem do SERVIDOR como coluna
  /// calculada — e nao de uma comparacao de apelido nesta camada: a tela nao tem
  /// o apelido de quem chama em toda rolagem, e comparar aqui seria a
  /// autorizacao migrando para o cliente.
  ///
  /// **Denunciar a propria publicacao nao existe**, e isso e produto e nao
  /// economia: o caminho para o proprio conteudo e apaga-lo, que e imediato, e o
  /// servidor responde `400 own_content` a quem tentar. Oferecer as duas seria
  /// desenhar um controle cujo unico desfecho e um erro.
  Widget _menu(BuildContext context) {
    final opcoes = <PopupMenuEntry<String>>[
      if (publicacao.minha && aoApagar != null)
        const PopupMenuItem<String>(value: 'apagar', child: Text('Apagar')),
      if (!publicacao.minha && aoDenunciar != null)
        const PopupMenuItem<String>(value: 'denunciar', child: Text('Denunciar')),
    ];
    // **Menu sem opcao nao nasce.** Um `⋮` que abre uma folha vazia e um toque
    // que termina em nada.
    if (opcoes.isEmpty) return const SizedBox.shrink();

    return PopupMenuButton<String>(
      // O nome acessivel do alvo. Sem ele o leitor de tela anuncia so "botao".
      tooltip: 'Opções da publicação',
      itemBuilder: (_) => opcoes,
      onSelected: (escolha) {
        if (escolha == 'apagar') {
          aoApagar?.call();
          return;
        }
        aoDenunciar?.call(publicacao);
      },
    );
  }
}

/// A FOTO DO AUTOR no cartao do Mural — **Emenda 5 do ADR-0010 (20/10/2026)**.
///
/// ## Por que ela nao reusa `MarcaNeutraDoParticipante`
///
/// Aquele widget existe, faz o mesmo desenho e mora em
/// `telas/mensagens/area_de_mensagens.dart` — mas a API dele e sobre uma
/// CONVERSA: ele recebe `ParticipanteDaConversa?` e decide o toque por
/// `PortaDoPerfilDoParticipante`. Reusa-lo aqui acoplaria o Mural ao modulo de
/// mensagens e ao modelo da conversa, e generaliza-lo exigiria mexer naquela
/// tela — mais raio de alteracao do que esta frente tem.
///
/// **O que NAO esta duplicado e a regra que importa.** `cacheWidth` pela
/// largura pintada, `errorBuilder` sempre e a politica de decodificacao moram
/// em [ImagemDaRede], e e ela que pinta nos dois lugares. O que se repete aqui
/// sao as poucas linhas da inicial de reserva.
///
/// **A TERCEIRA SUPERFICIE APARECEU, E A EXTRACAO ACONTECEU (21/10/2026).** O
/// desenho mora agora em `widgets/marca_da_pessoa.dart`, que e o lugar que o
/// paragrafo acima nomeou. Este widget ficou — ele e o que decide, PARA O MURAL,
/// o lado de 40 dp e a ausencia de toque, e as duas decisoes sao desta tela e
/// nao do desenho.
class _FotoDoAutor extends StatelessWidget {
  const _FotoDoAutor({required this.autor});

  final AutorDaPublicacao autor;

  /// 40 dp, o tamanho para o qual a `thumb` de 176 foi medida: 120 px reais a
  /// 3x, 1,47x de cobertura. **Nao e numero escolhido aqui** — ele vem da
  /// Emenda 3 e a Emenda 5 o reusa por nome.
  static const double lado = 40;

  @override
  Widget build(BuildContext context) {
    // **A FOTO NAO E UM CONTROLE, e a ausencia de toque e deliberada.**
    //
    // Na conversa o icone abre o perfil, porque la ele e o unico endereco do
    // outro lado. Aqui o cartao inteiro ja e conteudo e o apelido pode ser
    // nulo; um circulo que se anuncia como botao e nao leva a lugar nenhum e o
    // toque sem desfecho que o criterio 2 da BICHUS-62 proibe. Quem trouxer o
    // toque para o perfil traz com ele o estado de apelido nulo.
    //
    // **E por isso que nao se embrulha nada aqui**: `MarcaDaPessoa` desenha e
    // nao toca, e e `MarcaNeutraDoParticipante` que poe o `InkWell` por fora.
    return MarcaDaPessoa(
      urlDoIcone: autor.urlDoIcone,
      inicial: MarcaDaPessoa.letraDe(autor.nomeExibido),
      lado: lado,
    );
  }
}

/// A LINHA DE ACOES do cartao: **curtir e comentar**, decisao do cliente de
/// 19/10/2026.
///
/// ## O coracao e OTIMISTA, e o servidor manda
///
/// O toque pinta o estado novo na hora e so depois espera a resposta -- curtir
/// tem de parecer instantaneo. **Mas o numero que fica e o do SERVIDOR**: a
/// resposta devolve `like_count` lido das linhas, e e ele que substitui o
/// palpite. Se a chamada falhar, o estado volta ao que era.
///
/// E por isso que `curtir` e idempotente do outro lado: dois toques rapidos
/// mandam duas requisicoes, e as duas respondem a MESMA contagem -- a unicidade
/// e a chave primaria de `publication_likes`, no banco, nao nesta tela.
///
/// ## NAO HA LISTA DE QUEM CURTIU, e o numero nao e um toque
///
/// O contador e TEXTO, e nao botao. Nao existe `GET /publications/{ref}/likes`
/// no contrato, entao um toque no numero nao levaria a lugar nenhum -- e o
/// criterio 2 da BICHUS-62 proibe renderizar acao sem destino. A ausencia da
/// rota e o item 7 da Emenda 5 do ADR-0010: a decisao de 19/10 sobre curtir e
/// CONTAGEM, e contagem nao diz quem.
class _AcoesDaPublicacao extends StatefulWidget {
  const _AcoesDaPublicacao({required this.publicacao, required this.interacao});

  final PublicacaoDaLinha publicacao;
  final InteracaoDoMural interacao;

  static const String curtir = 'Curtir';
  static const String descurtir = 'Descurtir';
  static const String comentar = 'Comentar';

  @override
  State<_AcoesDaPublicacao> createState() => _AcoesDaPublicacaoState();
}

class _AcoesDaPublicacaoState extends State<_AcoesDaPublicacao> {
  late bool _curti = widget.publicacao.curtiEu;
  late int _curtidas = widget.publicacao.curtidas;
  late int _comentarios = widget.publicacao.comentarios;
  bool _emVoo = false;

  Future<void> _alternarCurtida() async {
    if (_emVoo) return;
    final eraCurti = _curti;
    final eramCurtidas = _curtidas;
    // OTIMISTA: pinta agora. Ver o cabecalho.
    setState(() {
      _emVoo = true;
      _curti = !eraCurti;
      _curtidas = eraCurti ? eramCurtidas - 1 : eramCurtidas + 1;
    });
    try {
      final reacao = eraCurti
          ? await widget.interacao.descurtir(widget.publicacao.ref)
          : await widget.interacao.curtir(widget.publicacao.ref);
      if (!mounted) return;
      // **O NUMERO DO SERVIDOR SUBSTITUI O PALPITE.** Ele foi lido das linhas,
      // e o palpite era so para a tela nao esperar.
      setState(() {
        _emVoo = false;
        _curti = reacao.curtiEu;
        _curtidas = reacao.curtidas;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      // VOLTA ao que era: deixar o coracao pintado depois de uma falha seria a
      // tela afirmando uma curtida que o servidor nao tem.
      setState(() {
        _emVoo = false;
        _curti = eraCurti;
        _curtidas = eramCurtidas;
      });
    }
  }

  Future<void> _abrirComentarios() async {
    final total = await Navigator.of(context).push<int>(
      MaterialPageRoute<int>(
        builder: (_) => ComentariosDaPublicacao(
          ref: widget.publicacao.ref,
          interacao: widget.interacao,
          // `mine` da linha do tempo: e ele que decide se o `Apagar` nasce num
          // comentario de TERCEIRO (decisao do cliente de 20/10/2026).
          minhaPublicacao: widget.publicacao.minha,
        ),
      ),
    );
    if (!mounted) return;
    // A folha devolve o TOTAL que passou a valer: comentar ou apagar lá muda o
    // numero aqui, e sem isto o cartao ficaria com o numero velho até a
    // proxima recarga da linha do tempo.
    if (total != null) setState(() => _comentarios = total);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Row(
      children: <Widget>[
        IconButton(
          onPressed: _emVoo ? null : _alternarCurtida,
          // O nome acessivel diz o que o toque FAZ, e muda com o estado: quem
          // usa leitor de tela ouve `Descurtir` no que ja esta curtido.
          tooltip: _curti
              ? _AcoesDaPublicacao.descurtir
              : _AcoesDaPublicacao.curtir,
          icon: Icon(
            _curti ? Icons.favorite : Icons.favorite_border,
            color: _curti ? cores.urgency : cores.textSecondary,
          ),
        ),
        // O CONTADOR E TEXTO, e nao botao: nao existe rota de lista de quem
        // curtiu, e um toque aqui nao levaria a lugar nenhum.
        Text(
          '$_curtidas',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(width: BichuEspaco.e4),
        IconButton(
          onPressed: _abrirComentarios,
          tooltip: _AcoesDaPublicacao.comentar,
          icon: Icon(Icons.mode_comment_outlined, color: cores.textSecondary),
        ),
        Text(
          '$_comentarios',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }
}
