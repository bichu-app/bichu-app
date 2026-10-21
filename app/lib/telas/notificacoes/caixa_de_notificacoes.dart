/// A CAIXA DE NOTIFICACOES: o conteudo que fica atras do sino da barra de topo.
///
/// ---------------------------------------------------------------------------
/// ## As duas marcacoes, e por que elas sao duas
///
/// **Abrir a caixa derruba o numero do sino e NAO marca os itens.** Sao dois
/// efeitos separados por requisito, e por isso sao duas chamadas: a tela pede
/// a pagina 1 e chama `markNotificationsListSeen` ao abrir, e as linhas
/// continuam aparecendo como `Não lido`. **`Lido` e o item ABERTO** -- o toque
/// na linha chama `markNotificationRead` com o `ref` daquela linha, e nada
/// mais.
///
/// A terceira porta e explicita e fica no topo do corpo: `Marcar todas como
/// lidas` chama `markAllNotificationsRead`. Ela existe porque abrir a caixa so
/// derruba o numero -- sem ela nao haveria como limpar de verdade uma caixa
/// grande, nem tirar do contador a plaquinha e o achado, que atravessam o zero
/// de proposito.
///
/// ## O NUMERO nunca e calculado aqui
///
/// Nenhuma linha desta tela soma `lido` para produzir contagem. O numero do
/// sino sai de `getNotificationCount`, e quem o desenha e a barra de topo. A
/// razao esta escrita em `api/notificacoes_api.dart`: contagem feita no
/// aparelho diverge entre dois aparelhos da mesma pessoa -- num deles a caixa
/// foi aberta, no outro nao.
///
/// E por isso `Marcar todas como lidas` **aparece sempre que ha lista**, e nao
/// so quando esta tela ve um nao lido: `_itens` e a pagina carregada, e a
/// pagina 3 pode ter nao lido que a pagina 1 nao mostra. Botao que some por
/// causa do que esta na tela e a mesma divergencia por outro caminho.
///
/// ## NENHUMA IMAGEM, e nao e esquecimento
///
/// Sem avatar e sem foto de pet. O contrato nao devolve imagem nesta caixa, de
/// proposito -- sao 0 KB de imagem por pagina, para a foto do pet nao chegar a
/// uma quarta superficie --, e esta tela nao inventa a imagem que o servidor
/// nao manda. Nao ha `Image`, `CircleAvatar` nem moldura de foto neste
/// arquivo, e nao deve haver.
///
/// ## O padrao de listagem, e as quatro ausencias
///
/// - **Sem busca, sem filtro e sem ordenacao**, e portanto **sem
///   `BarraDeListagem`**: a caixa tem uma ordem so, decrescente de quando o
///   fato aconteceu, e ela vem pronta do servidor. Controle que recorta uma
///   caixa de 90 dias seria controle sem funcao.
/// - **COM arrastar-para-atualizar desde 18/10/2026.** Este paragrafo dizia o
///   contrario -- *"Este app nao tem puxar-para-atualizar em lugar nenhum, e
///   nao e aqui que ele nasce"* --, e era verdade quando foi escrito. O
///   cliente mandou o gesto para o app inteiro: *"Crie uma acao no aplicativo
///   de atualizar a pagina conforme o usuario puxa a pagina para baixo"*. Quem
///   desenha e `widgets/arrastar_para_atualizar.dart`, e o gesto chama o MESMO
///   `_carregar` do `Tentar de novo` da faixa -- que continua existindo,
///   porque quem falhou precisa de um controle nomeado e nao so de um gesto.
/// - **Sem rolagem infinita e sem paginacao numerada** (design system 11.20):
///   a pagina seguinte vem de um `Carregar mais` explicito, pelo
///   [RodapeDaPaginacao], que e o pe de toda listagem paginada do app.
/// - **Sem texto de apoio no estado vazio**: uma linha e nada mais, como o
///   cliente mandou em 18/10.
///
/// ## DESTINO INDEPENDENTE: ela nao se amarra a navegacao nenhuma
///
/// O sino e o contador da barra de topo sao de **outro agente**, dono de
/// `casca_com_abas.dart`, `abas.dart`, `gaveta_de_secoes.dart` e
/// `rotas.dart`. Por isso este arquivo exporta [RotasDaCaixa] com o endereco e
/// [CaixaDeNotificacoes] como raiz, e quem monta a barra pluga os dois -- o
/// mesmo arranjo de `RotasDeMensagens`. Nao ha uma linha aqui que dependa de
/// ser aba ou de ser filha da casca.
///
/// **E por isso que a saida e [BarraDeConta] e nao um `AppBar` cru.** A rota
/// desta tela e irma da casca de abas, e nao filha dela: ela COBRE a barra de
/// baixo. Com um `AppBar` cru, uma pessoa que chegasse por link direto ficaria
/// sem barra de abas **e** sem seta de voltar -- a seta automatica do Flutter
/// so aparece quando ha o que desempilhar, e numa pilha de uma pagina nao ha.
///
/// ## O TOQUE marca como lido E LEVA AO DESTINO (20/10/2026)
///
/// Pedido do cliente: *"tem que ter a pagina interna da notificacao ou o link
/// que leva para a acao que foi notificada"*. Das duas formas que ele ofereceu
/// vale a SEGUNDA quando ela existe -- a pessoa quer ver o pet, o encontro, o
/// caso, e nao um intermediario.
///
/// **Este arquivo continua sem conhecer `Rotas`**, e isso nao mudou: quem
/// transforma destino em endereco e [PortaDoDestinoDoAviso], ligada em
/// `roteamento/rotas.dart`. O paragrafo abaixo sobre destino independente
/// segue valendo inteiro.
///
/// **O servidor diz PARA ONDE, e o app nao adivinha.** Cada linha vem com
/// `destination` e `destination_ref`; nao ha mapa de tipo para tela aqui, e nao
/// deve haver -- um segundo mapa divergiria do do servidor na primeira tela
/// nova.
///
/// **Sem destino, o toque NAO NAVEGA -- e e isso que `mostrarNoApp` quer
/// dizer.** Dois tipos de linha chegam sem destino: `match_suggested`, que nao
/// tem tela neste app, e qualquer linha cujo destino deixou de existir (pet
/// excluido). Nesses casos o toque faz so o que sempre fez -- marca como lido,
/// a linha diz `Lido` e a pessoa fica onde estava. **Nenhuma navegacao e
/// tentada com referencia nula**, que e a licao de
/// `ligarPortaDoPerfilDoParticipante`: com apelido nulo o destino e nulo, em
/// vez de abrir `/pessoa/null`.
///
/// **A ordem e navegar DEPOIS de marcar**, e nao antes: a marcacao e local e
/// barata, e empilhar a tela de destino primeiro deixaria o `setState` da linha
/// acontecendo atras de uma tela nova.
///
/// ## O "x" DE CADA LINHA: dispensar, que nao e ler
///
/// Pedido do cliente (20/10/2026): *"na notificacao alem da acao de marcar
/// como lida, cada notificacao tem que ter um x para fechar aquela notificacao
/// para ir limpando a lista"*.
///
/// **Sao dois eixos independentes sobre a mesma linha, e a tela nao os
/// encadeia.** O toque no CORPO da linha marca como lida: a linha fica e passa
/// a dizer `Lido`. O toque no "x" DISPENSA: a linha sai da lista, e **nao**
/// vira `Lido` no caminho. Nos dois sentidos -- dispensar sem ter lido e o
/// caso comum, porque quem limpa a lista nao abre cada linha antes.
///
/// **A linha sai da tela so depois do `204`**, como em toda outra acao deste
/// arquivo: removê-la antes esconderia o aviso de quem tocou no "x" num
/// elevador sem sinal, e ele voltaria na proxima abertura -- a tela teria
/// afirmado o que o servidor nao confirmou.
///
/// **O numero do sino nao e recalculado aqui**, e isso vale para o "x" como
/// vale para o resto: a linha dispensada sai do contador no SERVIDOR, e quem
/// desenha o numero o le de `getNotificationCount`. Subtrair um aqui seria a
/// segunda definicao do numero, e ela discordaria da primeira na linha
/// agrupada -- que vale `grouped_count` avisos no contador, e nao um.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_notificacao.dart';
import '../../api/notificacoes_api.dart';
import '../../escopo.dart';
import '../../sessao/contador_de_avisos.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../../widgets/saida_da_tela.dart';

/// O endereco da caixa, num lugar so.
///
/// **E isto que o agente da barra de topo consome**, e nao o texto
/// `'/notificacoes'` escrito a mao: o sino navega para [caixa], e o dia em que
/// o endereco mudar ele muda aqui e em nenhum outro lugar.
abstract final class RotasDaCaixa {
  /// A caixa de notificacoes. Widget: [CaixaDeNotificacoes].
  static const String caixa = '/notificacoes';
}

/// O endereco do DESTINO de uma linha da caixa, ou `null` quando nao ha.
///
/// **Mesmo arranjo de `PortaDoPerfilDoParticipante`**, e pela mesma razao: a
/// caixa nao conhece `Rotas` (ver "DESTINO INDEPENDENTE" no doc do arquivo), e
/// `rotas.dart` e o unico arquivo que conhece as duas pontas. Quem liga e
/// `ligarPortaDoDestinoDoAviso`, la.
///
/// **Nasce devolvendo `null`, e o `null` de fabrica nao e sobra**: e ele que
/// faz toda bancada de teste de widget montar a caixa sem roteador e sem
/// navegacao, e e ele que a isca religa e desliga para provar que o toque leva
/// ao lugar certo.
abstract final class PortaDoDestinoDoAviso {
  /// O endereco de [aviso], ou `null` quando ele nao tem destino.
  ///
  /// Recebe o AVISO inteiro, e nao `(destino, ref)`: quem liga precisa do par
  /// junto para montar o caminho, e passar os dois soltos convidaria a chamar
  /// com um deles nulo.
  static String? Function(AvisoDaCaixa aviso) destino = _semDestino;

  /// O default, nomeado para a isca poder voltar a ele num `addTearDown`.
  static String? _semDestino(AvisoDaCaixa aviso) => null;

  /// Volta ao estado de fabrica. **Para a isca**, e nao para a tela.
  static void soltar() => destino = _semDestino;
}

/// Os textos da caixa, num lugar so.
abstract final class TextosDaCaixa {
  static const String titulo = 'Avisos';

  /// A lista vazia: **uma linha**, e sem texto de apoio (decisao do cliente de
  /// 18/10). Mas nao fica em branco -- lista vazia sem nada e a tela que
  /// parece quebrada.
  static const String vazio = 'Você ainda não tem avisos.';

  static const String marcarTodas = 'Marcar todas como lidas';

  /// O estado de cada linha, em PALAVRA e nao em cor.
  ///
  /// Cor sozinha nao e estado para quem nao a distingue (WCAG 1.4.1), e aqui o
  /// estado e o conteudo da linha: a palavra vem sempre, e a cor acompanha.
  static const String naoLido = 'Não lido';
  static const String lido = 'Lido';

  static const String naoConseguimosMarcar =
      'Não conseguimos marcar este aviso. Tente de novo.';

  /// O rotulo acessivel do "x". **Sem o `ref`**: rotulo de leitor de tela e
  /// saida tambem, e o identificador opaco nao e texto de tela (ADR-0010).
  static const String fechar = 'Fechar este aviso';

  static const String naoConseguimosFechar =
      'Não conseguimos fechar este aviso. Tente de novo.';

  static const String naoConseguimosMarcarTodas =
      'Não conseguimos marcar seus avisos. Tente de novo.';

  static const String falhaDeMais = 'Não foi possível carregar mais avisos.';

  /// Quantos avisos a linha resume, quando resume mais de um.
  ///
  /// So aparece com `grouped_count > 1`: `Resume 1 aviso` seria rotulo para
  /// toda linha da caixa, e rotulo que esta em tudo nao distingue nada.
  static String resumo(int quantos) => 'Resume $quantos avisos';

  /// A frase do fim da lista, no singular e no plural.
  ///
  /// `todos os 1 avisos` e o defeito que uma frase so produz, e por isso o
  /// rodape pede uma FUNCAO do total em vez de um texto.
  static String fimDaLista(int total) => total == 1
      ? 'Este é o seu único aviso.'
      : 'Você viu todos os seus $total avisos.';
}

/// A tela da caixa de notificacoes.
class CaixaDeNotificacoes extends StatefulWidget {
  const CaixaDeNotificacoes({super.key, this.notificacoes});

  /// A camada de API, injetavel.
  ///
  /// Nula em producao, e ai ela sai do [Escopo] como em toda outra tela. O
  /// parametro existe para o teste de widget atravessar o caminho de verdade
  /// -- tela, [NotificacoesApi], `ApiClient` e traducao de `Problem` -- em vez
  /// de um duble de tela que responda por conta propria.
  final NotificacoesApi? notificacoes;

  @override
  State<CaixaDeNotificacoes> createState() => _CaixaDeNotificacoesState();
}

enum _Fase { carregando, lista, falha }

class _CaixaDeNotificacoesState extends State<CaixaDeNotificacoes> {
  _Fase _fase = _Fase.carregando;

  /// A falha da lista foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;
  List<AvisoDaCaixa> _itens = const <AvisoDaCaixa>[];
  int _total = 0;
  int _pagina = 1;
  bool _carregandoMais = false;
  String? _falhaDaLista;
  String? _falhaDeMais;
  String? _falhaDaAcao;

  /// O mesmo sinalizador de `TelaAcompanharPlaquinha` e das outras telas que
  /// leem `Escopo`: ler um `InheritedWidget` em `initState` estoura
  /// `dependOnInheritedWidgetOfExactType ... before initState() completed`, e
  /// a tela abriria dizendo "servidor fora" sem ter chamado nada.
  bool _iniciou = false;

  NotificacoesApi get _api =>
      widget.notificacoes ?? NotificacoesApi(Escopo.of(context).api);

  /// O contador do sino, **ou nulo quando esta tela esta montada fora do app**.
  ///
  /// `Escopo.of` estoura de proposito quando nao acha o escopo, e aqui isso
  /// derrubaria a propria suite desta tela: `abrirACaixa`, em
  /// `test/notificacoes/caixa_de_notificacoes_test.dart`, monta a caixa num
  /// `MaterialApp.router` nu -- com um roteador de verdade e **sem `Escopo`**
  /// --, porque o assunto daqueles casos e a lista e nao a barra de outra tela.
  ///
  /// Nulo nao e caminho de producao: o sino que este contador alimenta e
  /// desenhado pela casca, e nao ha casca sem `Escopo`. Para a ausencia nao
  /// virar defeito silencioso, a isca `abrir a caixa DERRUBA o numero do sino`
  /// (em `test/telas/navegacao_mensagens_e_avatar_test.dart`) percorre o app
  /// inteiro: ela reprova no dia em que esta leitura parar de achar o objeto.
  ContadorDeAvisos? _contador;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    // **O contador e capturado AQUI, e nao lido la embaixo.** `_marcarListaVista`
    // o usa depois de um `await`, e tocar em `context` numa continuacao
    // assincrona e o formato de defeito que aparece como erro de framework em
    // vez de erro desta tela. Aqui a leitura esta no lugar que o Flutter
    // reserva para dependencia de `InheritedWidget`.
    _contador = context
        .dependOnInheritedWidgetOfExactType<Escopo>()
        ?.contadorDeAvisos;
    _carregar();
    // **UMA VEZ por abertura, e fora de `_carregar`.** Ela zera o contador e
    // nao marca item nenhum; se morasse dentro de `_carregar`, cada
    // `Tentar de novo` a chamaria outra vez -- e `abrir a lista` deixaria de
    // ser o fato que ela registra.
    _marcarListaVista();
  }

  Future<void> _marcarListaVista() async {
    try {
      await _api.marcarListaVista();
      // **O SINO ZERA AQUI, e so depois do `204`.**
      //
      // Esta operacao zera o contador no servidor e nao marca item nenhum.
      // Quando ela responde, a contagem do servidor E zero -- entao publicar
      // zero no contador e repetir o que o servidor acabou de dizer, e nao
      // adivinhar um numero no aparelho.
      //
      // **Depois do `await`, nunca antes**, e e a mesma licao que
      // `area_de_mensagens.dart` escreve sobre o contador dela: zerar antes
      // esconderia o aviso de quem abriu a caixa num elevador sem sinal -- o
      // servidor continuaria com o numero, o sino diria que nao ha nada, e a
      // mentira duraria ate o app ser reaberto.
      //
      // Se a chamada falhar, o `catch` abaixo nao zera: o numero fica onde
      // estava e a proxima atualizacao o traz de volta do servidor.
      if (!mounted) return;
      _contador?.zerarPorqueAListaFoiVista();
    } on FalhaDeChamada {
      // **Engolida de proposito, e e a unica chamada desta tela que e.** Nada
      // na tela depende dela: o que ela faz e derrubar o numero do sino, que e
      // desenhado por outra tela e lido do servidor. Uma faixa de erro aqui
      // falaria de um numero que esta pessoa nem esta olhando, em cima de uma
      // lista que carregou bem. A proxima abertura tenta de novo, e a operacao
      // e idempotente.
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao marcar a caixa como vista');
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falhaDaLista = null;
      _faltaConta = false;
      _falhaDeMais = null;
      _falhaDaAcao = null;
    });
    try {
      final pagina = await _api.listar(pagina: 1);
      if (!mounted) return;
      setState(() {
        _itens = pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      // **NAO vira lista vazia.** Falha e "voce nao tem avisos" sao telas
      // diferentes, e trocar uma pela outra diria a quem tem trinta avisos que
      // nao tem nenhum. O 404 tambem cai aqui, e de proposito (ADR-0021).
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        // `next_action: sign_in` do servidor, e nao um `switch` em 401.
        _faltaConta = faltaConta(falha);
        _falhaDaLista = MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      // Corpo 200 fora do contrato. E falha de leitura, e nao caixa vazia.
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falhaDaLista = MensagensDeErro.servidorFora;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler a caixa de avisos');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falhaDaLista = MensagensDeErro.servidorFora;
      });
    }
  }

  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.listar(pagina: _pagina + 1);
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[..._itens, ...pagina.itens];
        _total = pagina.total;
        _pagina = pagina.pagina;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      // **A lista FICA.** O que ja estava na tela continua certo; apaga-la por
      // causa da pagina seguinte puniria quem so queria rolar.
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = TextosDaCaixa.falhaDeMais;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = TextosDaCaixa.falhaDeMais;
      });
    }
  }

  /// O toque na linha: o item foi ABERTO, e a pessoa vai ao destino.
  ///
  /// **A navegacao acontece DEPOIS da marcacao e so com destino de verdade.**
  /// Sem destino -- `match_suggested`, ou destino que deixou de existir -- o
  /// toque marca como lido e para ai, que e o `mostrarNoApp` do push: a pessoa
  /// ve o aviso dentro do app, sem um atalho que levaria a um `404`.
  Future<void> _abrir(AvisoDaCaixa aviso) async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.marcarComoLido(aviso.ref);
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[
          for (final item in _itens)
            if (item.ref == aviso.ref) item.comoLido() else item,
        ];
      });
      _irAoDestino(aviso);
    } on FalhaDeChamada {
      // A linha **continua nao lida**, porque o servidor nao confirmou nada.
      // Pintar `Lido` aqui seria a tela afirmando o que ela nao sabe.
      //
      // O texto e desta tela, e nao de `MensagensDeErro.de(falha)`: o 404 de
      // aviso de outra conta e o 429 chegariam aqui com frases que falam de
      // outra coisa, e o que esta pessoa precisa saber e que ESTE aviso nao
      // foi marcado -- sem que a frase confirme ou negue que o `ref` existe
      // (ADR-0021).
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosMarcar);
    }
  }

  /// O toque no "x": a linha foi DISPENSADA.
  ///
  /// **Nao chama `marcarComoLido`**, e a ausencia e o requisito: dispensar tira
  /// da lista e ler tira do contador, e quem fecha uma linha nao esta dizendo
  /// que a leu.
  Future<void> _dispensar(AvisoDaCaixa aviso) async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.dispensar(aviso.ref);
      if (!mounted) return;
      setState(() {
        // **Sai da lista SO depois do `204`.** E `_total` cai com ela, porque
        // o servidor dispensou a LINHA inteira (o grupo): sem isso o rodape
        // continuaria prometendo uma pagina que nao existe mais, e
        // `RodapeDaPaginacao` compara `carregados` com `total`.
        //
        // Isto NAO e o numero do sino. O contador continua saindo de
        // `getNotificationCount`, e nada aqui o deduz: a linha agrupada vale
        // `grouped_count` avisos no contador e uma linha no total, e os dois
        // numeros nao se derivam um do outro.
        _itens = <AvisoDaCaixa>[
          for (final item in _itens)
            if (item.ref != aviso.ref) item,
        ];
        if (_total > 0) _total -= 1;
      });
    } on FalhaDeChamada {
      // A linha **FICA**, porque o servidor nao confirmou nada. Tirá-la aqui
      // seria a tela afirmando o que ela nao sabe, e o aviso voltaria na
      // proxima abertura.
      //
      // Texto desta tela, e nao `MensagensDeErro.de(falha)`, pela mesma razao
      // de `_abrir`: o 404 de aviso de outra conta e o 429 chegariam com
      // frases sobre outra coisa, e a frase nao pode confirmar nem negar que o
      // `ref` existe (ADR-0021).
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosFechar);
    }
  }

  /// Empilha a tela de destino, **quando ha uma**.
  ///
  /// Tres guardas, e nenhuma e defensiva a toa:
  ///
  /// 1. `temDestino` exige os DOIS campos do contrato. Eles vem juntos por
  ///    promessa do servidor, e esta conjuncao e o que impede `/pets/null` se a
  ///    promessa for quebrada um dia.
  /// 2. A porta pode devolver `null` -- e e o que ela devolve por fabrica, e
  ///    tambem o que `rotas.dart` devolve para um destino que ESTE build nao
  ///    sabe abrir. `null` aqui e "fique onde esta", nunca um endereco vazio.
  /// 3. `mounted`, porque isto roda depois de um `await`.
  ///
  /// `push` e nao `go`: o destino COBRE a caixa e voltar devolve a pessoa a
  /// lista onde ela estava -- com a linha ja dizendo `Lido`. `go` trocaria a
  /// pilha e a seta de voltar levaria para fora da caixa.
  void _irAoDestino(AvisoDaCaixa aviso) {
    if (!mounted) return;
    if (!aviso.temDestino) return;
    final endereco = PortaDoDestinoDoAviso.destino(aviso);
    if (endereco == null || endereco.isEmpty) return;
    unawaited(context.push<void>(endereco));
  }

  Future<void> _marcarTodas() async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.marcarTodasComoLidas();
      if (!mounted) return;
      // As linhas carregadas passam a dizer `Lido` porque o servidor acabou de
      // marcar TODAS. O numero do sino continua vindo do servidor: nada aqui o
      // deduz do `marked` que a resposta trouxe.
      setState(() {
        _itens = <AvisoDaCaixa>[
          for (final item in _itens) item.comoLido(),
        ];
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosMarcarTodas);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // **[BarraDeConta], e nao `AppBar` cru.** A razao esta no doc do
      // arquivo: a rota desta tela cobre a barra de abas, e sem saida propria a
      // pessoa fica sem barra embaixo e sem volta em cima.
      appBar: const BarraDeConta(
        titulo: TextosDaCaixa.titulo,
        saida: TipoDeSaida.voltar,
      ),
      // O ARRASTAR-PARA-ATUALIZAR (cliente, 18/10/2026): *"Crie uma acao no
      // aplicativo de atualizar a pagina conforme o usuario puxa a pagina para
      // baixo"*. Por `ArrastarParaAtualizar`, o ponto unico do app -- nenhum
      // `RefreshIndicator` cru em tela nenhuma. A funcao e a MESMA do
      // `Tentar de novo` da faixa.
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: _corpo(),
        ),
      ),
    );
  }

  Widget _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return const Center(child: CircularProgressIndicator());
      case _Fase.falha:
        // SEM CONTA NAO E ERRO. Ver `widgets/convite_para_entrar.dart`.
        if (_faltaConta) {
          return const Padding(
            padding: EdgeInsets.all(BichuEspaco.e4),
            child: ConviteParaEntrar(secao: SecaoComConta.notificacoes),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _falhaDaLista ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        );
      case _Fase.lista:
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          children: _lista(),
        );
    }
  }

  List<Widget> _lista() {
    if (_itens.isEmpty) {
      // UMA LINHA. Nao ha componente de estado vazio neste sistema, e nao ha
      // paragrafo de apoio: um `Padding` e um `Text`.
      return <Widget>[
        Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Text(
            TextosDaCaixa.vazio,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      ];
    }

    return <Widget>[
      if (_falhaDaAcao != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            BichuEspaco.e4,
            BichuEspaco.e2,
            BichuEspaco.e4,
            BichuEspaco.e2,
          ),
          child: FaixaDeAviso(texto: _falhaDaAcao!),
        ),
      // A acao explicita, no TOPO do corpo. Ela nao e um item da barra: a
      // barra desta tela tem titulo e saida, e so.
      Padding(
        padding: const EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          BichuEspaco.e2,
          BichuEspaco.e4,
          BichuEspaco.e3,
        ),
        child: BotaoSecundario(
          rotulo: TextosDaCaixa.marcarTodas,
          aoTocar: _marcarTodas,
        ),
      ),
      for (final aviso in _itens)
        _LinhaDoAviso(
          key: ValueKey<String>(aviso.ref),
          aviso: aviso,
          aoTocar: () => _abrir(aviso),
          aoFechar: () => _dispensar(aviso),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          espacoAcimaDoRodape,
          BichuEspaco.e4,
          BichuEspaco.e4,
        ),
        child: RodapeDaPaginacao(
          carregados: _itens.length,
          total: _total,
          aoPedirMais: _carregarMais,
          fimDaLista: TextosDaCaixa.fimDaLista,
          carregando: _carregandoMais,
          textoDaFalha: _falhaDeMais,
        ),
      ),
    ];
  }
}

/// Uma linha da caixa: o tipo, o assunto, o estado, quando aconteceu e o "x".
///
/// **Sem imagem**, pelo motivo escrito no doc do arquivo. E **sem o `ref`**:
/// ele e identificador opaco e nao e texto de tela -- nem em `Text` nem em
/// rotulo de semantica, porque rotulo de leitor de tela tambem e saida
/// (ADR-0010). Em especial o "x" **nao** carrega o `ref` no `tooltip`: o
/// tooltip e rotulo acessivel, e a isca o le junto com os `Semantics`.
///
/// **O "x" e um alvo de toque PROPRIO dentro da linha**, e nao um segundo
/// significado do mesmo toque: o corpo marca como lida e o "x" dispensa, e sao
/// dois eixos independentes. `IconButton` dentro do `InkWell` resolve isso sem
/// `GestureDetector` aninhado -- o botao e quem recebe o toque na area dele, e
/// o `InkWell` recebe o resto.
class _LinhaDoAviso extends StatelessWidget {
  const _LinhaDoAviso({
    required this.aviso,
    required this.aoTocar,
    required this.aoFechar,
    super.key,
  });

  final AvisoDaCaixa aviso;
  final VoidCallback aoTocar;

  /// O "x": dispensa a linha. **Nao marca como lida.**
  final VoidCallback aoFechar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final estado = aviso.lido ? TextosDaCaixa.lido : TextosDaCaixa.naoLido;
    final partes = <String>[
      estado,
      aviso.dataEmTexto,
      // So com `grouped_count > 1`. A linha de `tag_scanned` e a de
      // `found_reported` nunca agrupam, e por isso nunca mostram resumo.
      if (aviso.resumeVarios) TextosDaCaixa.resumo(aviso.agrupados),
    ];

    return InkWell(
      onTap: aoTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              // `start`: com uma linha de tres textos e outra de um, centrar
              // poria o "x" no meio do bloco em vez de ao lado do titulo que
              // ele fecha.
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        aviso.tipo.rotulo,
                        style: textos.titleMedium?.copyWith(
                          // O nao lido vem em peso, e a palavra `Não lido` vem
                          // junto na linha de baixo: peso sozinho nao e estado
                          // para quem nao o distingue.
                          fontWeight:
                              aviso.lido ? FontWeight.w400 : FontWeight.w600,
                        ),
                      ),
                      if (aviso.assunto != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(aviso.assunto!, style: textos.bodyMedium),
                      ],
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        partes.join(' · '),
                        style: textos.bodySmall
                            ?.copyWith(color: cores.textSecondary),
                      ),
                    ],
                  ),
                ),
                // O "x". `tooltip` e o rotulo acessivel, e e `Fechar este
                // aviso` e nao `Fechar`: um rotulo que nao diz o que fecha nao
                // ajuda quem navega por leitor de tela numa lista de trinta.
                IconButton(
                  // `ValueKey` com o `ref` para o caso de teste poder apontar
                  // o "x" de UMA linha. Chave de widget **nao e saida**: ela
                  // nao vai para a arvore de semantica nem para `Text`, e e
                  // por isso que ela pode carregar o `ref` e o `tooltip` nao.
                  key: ValueKey<String>('fechar:${aviso.ref}'),
                  onPressed: aoFechar,
                  tooltip: TextosDaCaixa.fechar,
                  visualDensity: VisualDensity.compact,
                  icon: Icon(Icons.close, size: 20, color: cores.textSecondary),
                ),
              ],
            ),
            const SizedBox(height: BichuEspaco.e3),
            Divider(height: 1, color: cores.outline),
          ],
        ),
      ),
    );
  }
}
