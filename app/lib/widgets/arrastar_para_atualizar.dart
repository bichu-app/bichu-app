import 'package:flutter/material.dart';

/// **Arrastar a pagina para baixo refaz a busca.** Um lugar so, para o app
/// inteiro.
///
/// Pedido do cliente, 18/10/2026, palavra por palavra: *"Crie uma acao no
/// aplicativo de atualizar a pagina conforme o usuario puxa a pagina para
/// baixo"*. Ele disse **no aplicativo**, e nao "nesta tela": o gesto entra em
/// toda superficie com conteudo de rede que valha reler.
///
/// ## ISTO REVERTE UMA DECISAO ESCRITA, e a reversao e dele
///
/// `telas/notificacoes/caixa_de_notificacoes.dart` dizia, em prosa, *"Sem
/// `RefreshIndicator`. Este app nao tem puxar-para-atualizar em lugar nenhum,
/// e nao e aqui que ele nasce"*. A frase era verdadeira quando foi escrita e
/// deixou de ser por decisao do cliente. Quem abrir aquele arquivo e achar que
/// a regra foi quebrada por descuido esta lendo o commit errado.
///
/// ## Por que um componente, e nao `RefreshIndicator` em cada tela
///
/// Sao **doze** superficies. Copiado doze vezes, o gesto divergiria na
/// primeira correcao: uma tela com rotulo de leitor de tela e dez sem, uma com
/// `onRefresh` que nao espera a resposta e dez que esperam. O que precisa valer
/// nas doze esta aqui:
///
/// 1. **`onRefresh` tem de ESPERAR a busca.** O `RefreshIndicator` gira
///    enquanto o `Future` nao completa; um `onRefresh` que devolvesse antes
///    faria a roda sumir com a lista antiga na tela -- e o gesto pareceria ter
///    funcionado sem ter buscado nada. Quem chama passa a funcao que ja existe
///    na tela (`_carregar`), e nao uma copia dela.
/// 2. **Nome acessivel.** `RefreshIndicator` sem `semanticsLabel` e anunciado
///    pelo texto padrao do Material, em ingles no aparelho configurado em
///    portugues.
/// 3. **O filho e quem rola.** `RefreshIndicator` precisa de um `Scrollable`
///    descendente que aceite rolagem alem do limite; ele nao cria rolagem.
/// 4. **A fisica do subarvore e `AlwaysScrollableScrollPhysics`.** E o que a
///    documentacao do `RefreshIndicator` pede: sem ela, uma lista cujo
///    conteudo nao passa da altura da tela tem extensao de rolagem zero, nao
///    ha excesso para notificar e o indicador nao dispara -- justamente na
///    lista de um item, na vazia e na que acabou de falhar.
///
///    **ELA PRECISA DE UM `parent`, e a falta dele foi um defeito de
///    verdade.** `AlwaysScrollableScrollPhysics` sobrescreve **um** metodo,
///    `shouldAcceptUserOffset`; `applyBoundaryConditions` e
///    `createBallisticSimulation` ela DELEGA ao `parent`. Sem pai, as duas
///    caem no `ScrollPhysics` base e devolvem `0.0` (nenhum limite de
///    rolagem) e `null` (nenhuma simulacao balistica) -- a subarvore inteira
///    fica sem limite e sem repouso, e o dedo empurra a lista para fora do
///    proprio conteudo sem nada a trazer de volta.
///
///    E ela NAO ganha pai sozinha. `ListView(physics: ...)` ganharia:
///    `Scrollable._updatePosition` chama `applyTo` na fisica que vem **pelo
///    widget**. A que vem pela `ScrollBehavior` (`copyWith(physics:)`) o
///    `Scrollable` usa VERBATIM. Dai a composicao explicita acima.
///
///    **Medido no lote de 19/10, na area de mensagens, com a forma sem pai:**
///    uma rolada ate o fim parava a janela em `pixels` = 2940 com
///    `maxScrollExtent` = 1177 -- num vazio depois do fim da lista, com ZERO
///    linha montada, as tres paginas pedidas e nenhum erro na tela. O arrasto
///    para baixo deixava a lista em `pixels` = -320 para sempre, com uma
///    faixa vazia no alto que nao fechava mais. Quatro casos de
///    `test/mensagens/` reprovavam por isso.
///
///    **O QUE CONTINUA NAO PROVADO:** nenhum caso de widget reprova com este
///    `ScrollConfiguration` AUSENTE. A lacuna e so da ausencia, e nao da
///    forma: a forma errada agora reprova por `ISCA: a fisica do gesto tem
///    PAI` e pelas iscas de `test/mensagens/`. A ausencia segue coberta so
///    pelo portao de FONTE (`o componente impoe a fisica e o rotulo
///    acessivel`) -- e esse portao fica verde nas DUAS formas, porque le a
///    palavra e nao o comportamento.
///
///    **CORRECAO DE UMA AFIRMACAO ANTERIOR:** o cabecalho dizia que a
///    plataforma padrao de `flutter test` e macOS com `BouncingScrollPhysics`.
///    Medido: `flutter_test` forca `TargetPlatform.android`, e a fisica
///    herdada sai `ClampingScrollPhysics -> RangeMaintainingScrollPhysics`.
///
///    O que **nao** muda com isso: a fisica mora aqui, e nao nos doze
///    `ListView`. Doze `physics:` escritos a mao seriam doze chances de
///    esquecer, e nenhuma delas visivel num teste que so procure o indicador
///    na arvore.
///
/// ## A DECIMA SEGUNDA chegou depois, e o recorte de 18/10 e que estava curto
///
/// O lote daquele dia pegou **listagem**, e `achado/tela_do_achado.dart`
/// (`/achados/:id`) ficou de fora por ser tela de ITEM UNICO. O criterio nunca
/// foi "ser lista": e haver uma busca a refazer. Ela le o achado do servidor e
/// tem `_carregar`, entao ela entra -- e e justamente a tela em que a pessoa
/// volta no dia seguinte para ver se o estado do registro mudou, que e o uso
/// que o gesto serve.
///
/// ## Onde ele NAO entra, e por que nao
///
/// - **Formulario e assistente** (cadastro de pet, registro de achado, abrir
///   caso): nao ha busca a refazer, e o gesto apagaria o que a pessoa digitou
///   se algum dia recarregasse de verdade.
/// - **Desfecho** (`achado registrado`, `caso aberto`, `pet cadastrado`): a
///   tela desenha o que acabou de acontecer, de um objeto que ela recebeu. Nao
///   ha rota a chamar de novo.
/// - **O fio da conversa** (`telas/mensagens/tela_da_conversa.dart`): o topo
///   daquela lista **ja tem** um gesto com significado -- `Carregar
///   anteriores`. Dois significados para o mesmo arrasto e a pessoa pedindo
///   mensagem antiga e recebendo a lista recarregada.
class ArrastarParaAtualizar extends StatelessWidget {
  /// A tela que **conhece a propria busca**: as que tem `Scaffold` e
  /// `ListView` proprios.
  const ArrastarParaAtualizar({
    required Future<void> Function() aoAtualizar,
    required this.child,
    super.key,
  }) : _fixa = aoAtualizar,
       _doSlot = null;

  /// A CASCA DAS CINCO SECOES, onde a busca chega **depois** e pode nao
  /// existir.
  ///
  /// ## Por que o embrulho e PERMANENTE, e isto esta MEDIDO
  ///
  /// A primeira versao disto desenhava o `RefreshIndicator` **so quando havia
  /// busca publicada**, por um `ValueListenableBuilder` em volta do
  /// `ListView` da casca. Parecia o desenho obvio e **remontava a secao
  /// inteira**: inserir widget entre o construtor e o `ListView` muda a
  /// profundidade da arvore, o elemento do `ListView` nao e reaproveitado
  /// naquela posicao, e o corpo da secao nasce de novo -- `State` novo,
  /// `didChangeDependencies` novo, **`GET` novo**.
  ///
  /// Medido: **22 casos da suite reprovaram**, e eles acusaram a causa com
  /// precisao -- `meus_pets_test.dart` em *"`Atualizar` tenta de novo e a
  /// lista aparece"* (a primeira resposta era 503, e a tela aparecia com a
  /// lista carregada **antes** do toque, porque a segunda carga ja tinha
  /// acontecido), e os cinco casos de `Carregar mais` de `Perto`, `Loja`,
  /// `Rede` e da lista de perdidos, que voltavam a pagina 1 sozinhos.
  ///
  /// Com o embrulho permanente nao ha construtor e nao ha troca de forma: o
  /// gesto le `recarga.value` **no momento do arrasto**, e publicar deixou de
  /// reconstruir qualquer coisa. Sem busca publicada o gesto nao e aceito --
  /// ver [notificationPredicate] no corpo.
  const ArrastarParaAtualizar.doSlot({
    required RecargaDaSecao recarga,
    required this.child,
    super.key,
  }) : _doSlot = recarga,
       _fixa = null;

  /// A busca de quem a conhece na construcao.
  final Future<void> Function()? _fixa;

  /// A busca de quem a recebe depois, pelo slot.
  final RecargaDaSecao? _doSlot;

  /// O rolavel. Ver o item 3 do cabecalho.
  final Widget child;

  /// O que o leitor de tela anuncia no gesto.
  static const String rotulo = 'Atualizando a página';

  /// A busca de AGORA, resolvida no momento do gesto e nao no da construcao.
  Future<void> Function()? _buscaAtual() => _fixa ?? _doSlot?.value;

  @override
  Widget build(BuildContext context) {
    // A FISICA HERDADA E O PAI, e nao um detalhe de estilo: ver o item 4 do
    // cabecalho. `AlwaysScrollableScrollPhysics` sozinha nao TEM limite nem
    // repouso -- ela so responde `shouldAcceptUserOffset`, e delega todo o
    // resto ao pai.
    final ScrollBehavior heranca = ScrollConfiguration.of(context);
    return ScrollConfiguration(
      behavior: heranca.copyWith(
        physics: const AlwaysScrollableScrollPhysics()
            .applyTo(heranca.getScrollPhysics(context)),
      ),
      child: RefreshIndicator(
        // **SEM BUSCA, O GESTO NAO E ACEITO.** `Perfil` deslogado e a unica
        // raiz de secao cujo corpo nao pergunta nada ao servidor; ali a roda
        // giraria para nada. Recusar pelo preditor -- e nao tirando o widget
        // da arvore -- e o que mantem a forma da arvore constante.
        notificationPredicate: (notificacao) =>
            _buscaAtual() != null &&
            defaultScrollNotificationPredicate(notificacao),
        // `onRefresh` **espera** a busca: a roda gira enquanto o `Future` nao
        // completa, e devolver antes faria o gesto parecer ter funcionado com
        // a lista antiga na tela.
        onRefresh: () async {
          final busca = _buscaAtual();
          if (busca != null) await busca();
        },
        semanticsLabel: rotulo,
        child: child,
      ),
    );
  }
}

/// O caminho de quem **nao e dono da rolagem**: as cinco raizes de secao.
///
/// `TelaDeAba` (`telas/casca_com_abas.dart`) e quem monta o `ListView` das
/// cinco secoes; o corpo de cada uma -- `ListaDePerdidos`, `AgendaDaRede`,
/// `ListaDoDiretorio`, `MinhasIndicacoes`, `VitrineDaLoja`, `MeusPets` -- e
/// um **filho** dele e nao tem rolavel proprio para embrulhar. Um
/// `RefreshIndicator` dentro do filho nao veria rolagem nenhuma e nao
/// dispararia.
///
/// Entao o filho **publica** a busca dele aqui, e a casca embrulha o proprio
/// `ListView`. E o mesmo arranjo -- e pela mesma razao -- de
/// `SlotDaBarraDeListagem`, que leva o controle de filtro do corpo para a
/// barra: estado que e da lista, desenhado por quem e dono do espaco.
///
/// **Nulo apaga o gesto**, e o apagamento importa: `Perfil` troca entre o
/// estado logado e o deslogado **reusando o mesmo `State` de `TelaDeAba`**, e
/// o corpo deslogado nao tem busca nenhuma. Sem o apagamento, o gesto
/// continuaria ali chamando o `_carregar` de um `MeusPets` ja descartado.
class SlotDeAtualizacao extends InheritedWidget {
  const SlotDeAtualizacao({
    required this.recarga,
    required super.child,
    super.key,
  });

  final RecargaDaSecao recarga;

  static SlotDeAtualizacao? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDeAtualizacao>();

  /// Publica (ou apaga) a busca, **sem reconstruir por valor igual**.
  ///
  /// A comparacao funciona porque Dart canoniza o `tear-off` de metodo de
  /// instancia: `estado._carregar == estado._carregar` e verdadeiro para o
  /// mesmo `estado`. Sem a guarda, cada quadro publicaria de novo.
  void publicar(Future<void> Function()? nova) {
    if (recarga.descartada) return;
    if (recarga.value == nova) return;
    recarga.value = nova;
  }

  @override
  bool updateShouldNotify(SlotDeAtualizacao antigo) =>
      antigo.recarga != recarga;
}

/// A busca publicada, **com o proprio descarte observavel**.
///
/// Um `ValueNotifier` cru nao serve aqui, e a razao e uma ordem de eventos que
/// acontece de verdade: quem apaga a publicacao e o `dispose` do corpo da
/// secao, e ele e **adiado para depois do quadro** (ver
/// [PublicaAAtualizacao]). Quando a secao inteira sai da tela, a casca
/// descarta este notificador ANTES de esse callback rodar -- e escrever em
/// `ValueNotifier.value` depois de `dispose()` estoura em
/// `notifyListeners`, que e uma reprovacao por limpeza e nao por defeito de
/// produto.
///
/// Flutter nao expoe "ja foi descartado" em `ChangeNotifier`, entao a resposta
/// mora aqui, num lugar so, em vez de num `try` em volta de cada publicacao.
class RecargaDaSecao extends ValueNotifier<Future<void> Function()?> {
  RecargaDaSecao() : super(null);

  bool _descartada = false;

  bool get descartada => _descartada;

  @override
  void dispose() {
    _descartada = true;
    super.dispose();
  }
}

/// O que um corpo de secao faz para ganhar o gesto: dizer qual e a busca.
///
/// Tres linhas por tela, e nenhuma delas e `RefreshIndicator`:
///
/// ```dart
/// class _MinhaLista extends State<MinhaLista> with PublicaAAtualizacao {
///   @override
///   Future<void> aoArrastarParaAtualizar() => _carregar();
/// }
/// ```
///
/// ## AS DUAS PUBLICACOES SAO DEPOIS DO QUADRO, e isto esta MEDIDO
///
/// Publicar dentro de `didChangeDependencies` derruba o app, e nao e sutil: o
/// corpo da secao e inflado **durante o layout do `Sliver`** do `ListView` da
/// casca, entao mexer no notificador ali marca um ancestral
/// (`ValueListenableBuilder`) como sujo no meio do build. Medido: **666 casos
/// da suite reprovaram** com `setState() or markNeedsBuild() called during
/// build`, tendo `_SelectionKeepAlive` como widget em construcao.
///
/// O `dispose` tem o mesmo problema por outra porta: ele roda dentro do
/// `lockState` de `BuildOwner.finalizeTree`, onde marcar widget como sujo
/// reprova com *"widget tree was locked"*.
///
/// `addPostFrameCallback` nas duas e a mesma saida -- e pela mesma razao --
/// que `BarraDeListagem` usa para publicar o controle de filtro no slot da
/// barra.
mixin PublicaAAtualizacao<T extends StatefulWidget> on State<T> {
  SlotDeAtualizacao? _slot;

  /// A busca que o arrasto refaz. Normalmente o `_carregar` da propria tela.
  Future<void> aoArrastarParaAtualizar();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final slot = _slot = SlotDeAtualizacao.maybeOf(context);
    if (slot == null) return;
    // `mounted` nao e zelo: entre o agendamento e o quadro seguinte a secao
    // pode ter saido da tela.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) slot.publicar(aoArrastarParaAtualizar);
    });
  }

  @override
  void dispose() {
    // **So apaga o que e meu.** Duas secoes se trocam na mesma arvore
    // (`Perto` alternando entre `Profissionais` e `Minhas indicações`), e a
    // nova registra ANTES de a antiga ser descartada. Sem a comparacao, o
    // `dispose` da que saiu apagaria a busca da que entrou.
    //
    // O `tear-off` e capturado AQUI, antes de `super.dispose()`: depois dele o
    // `State` esta descartado, e o callback do quadro seguinte precisa de um
    // valor em maos para comparar -- nao de uma chamada de metodo.
    final slot = _slot;
    final Future<void> Function() minha = aoArrastarParaAtualizar;
    _slot = null;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (slot.recarga.value == minha) slot.publicar(null);
      });
    }
    super.dispose();
  }
}
