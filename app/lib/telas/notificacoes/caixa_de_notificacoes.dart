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
/// ## O TOQUE marca como lido, e nao navega
///
/// Um destino por tipo de aviso exigiria rota para dez tipos, e as rotas sao
/// do agente da barra. Esta tela nao inventa endereco: o toque faz o que o
/// requisito pede -- marca o item como aberto -- e a linha passa a dizer
/// `Lido` na hora, porque foi o servidor que confirmou aquele item com `204`.
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_notificacao.dart';
import '../../api/notificacoes_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
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

  /// O toque na linha: o item foi ABERTO.
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

/// Uma linha da caixa: o tipo, o assunto, o estado e quando aconteceu.
///
/// **Sem imagem**, pelo motivo escrito no doc do arquivo. E **sem o `ref`**:
/// ele e identificador opaco e nao e texto de tela -- nem em `Text` nem em
/// rotulo de semantica, porque rotulo de leitor de tela tambem e saida
/// (ADR-0010).
class _LinhaDoAviso extends StatelessWidget {
  const _LinhaDoAviso({required this.aviso, required this.aoTocar, super.key});

  final AvisoDaCaixa aviso;
  final VoidCallback aoTocar;

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
            Text(
              aviso.tipo.rotulo,
              style: textos.titleMedium?.copyWith(
                // O nao lido vem em peso, e a palavra `Não lido` vem junto na
                // linha de baixo: peso sozinho nao e estado para quem nao o
                // distingue.
                fontWeight: aviso.lido ? FontWeight.w400 : FontWeight.w600,
              ),
            ),
            if (aviso.assunto != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e1),
              Text(aviso.assunto!, style: textos.bodyMedium),
            ],
            const SizedBox(height: BichuEspaco.e1),
            Text(
              partes.join(' · '),
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e3),
            Divider(height: 1, color: cores.outline),
          ],
        ),
      ),
    );
  }
}
