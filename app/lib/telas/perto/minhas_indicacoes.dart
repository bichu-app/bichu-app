import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/rodape_da_paginacao.dart';

/// `Minhas indicações`: o que ESTA CONTA indicou para o `Perto`, e em que pé
/// está cada uma.
///
/// ## Por que esta tela existe
///
/// Pedido literal do cliente em 18/10/2026: *"e a aba de minhas indicações,
/// com o status se está pendente ou se já foi aprovado pelo administrador?"*.
///
/// Até aqui, indicar devolvia um recibo e silêncio: `suggestDirectoryEntry`
/// respondia `reference`, `state` e `created_at`, a tela dizia "está na fila" e
/// não havia, no contrato inteiro, operação que lesse a fila do lado de quem
/// indicou. A fila do PAINEL existe desde 17/10; o lado da pessoa é esta tela.
///
/// ## ONDE ELA FICA: segunda aba do `Perto`
///
/// Ele falou "aba", e confirmou pelo nome em 18/10. O padrão da casa para isso
/// é o de `Meus pedidos` na `Rede`: uma aba DENTRO do corpo da seção, e não um
/// sexto item na barra de baixo. Quem desenha as abas é [CorpoDoPerto], com a
/// mecânica de `agenda_da_rede.dart` reusada; **esta classe é o CORPO da
/// segunda aba**, e não uma tela com `Scaffold` próprio.
///
/// **Ela não tem rota, e isso é decisão.** Teve uma (`/perto/indicacoes`,
/// alcançada pela gaveta) enquanto era destino próprio; a rota e o item da
/// gaveta saíram quando ela virou aba, porque aba dentro da seção é a seção --
/// e item de gaveta que navega para a seção é exatamente o que o portão de
/// `gaveta_com_submenus_test.dart` proíbe. Duas portas para a mesma lista
/// também seria a segunda definição de onde ela mora.
///
/// **Por isso ela não monta `Scaffold`, `AppBar` nem slot de barra.** Quem os
/// monta é a casca (`casca_com_abas.dart`), e o ícone de filtrar que esta tela
/// publica vai para o slot dela, como o da lista do diretório.
///
/// **O que falta para ser aba, e é uma linha:** um `AbaDoPerto` ao lado da
/// lista do diretório, como `AbaDaRede` faz. Quem puder mexer naqueles dois
/// arquivos liga esta tela como segunda aba sem tocar em nada daqui — ela já é
/// um corpo de lista, e não depende do `Scaffold` que a envolve hoje.
///
/// ## Os TRÊS estados, e o que cada um promete
///
/// | Estado | O que a tela diz | O que ela oferece |
/// |---|---|---|
/// | `pending` | Em análise | nada: não há o que fazer, e não há o que desistir (o contrato não tem retirada) |
/// | `approved` com entrada no ar | Aprovada | `Ver no Perto`, que abre a página do local |
/// | `approved` sem entrada no ar | Aprovada, ainda não no `Perto` | nada, **e isso é deliberado** |
/// | `declined` | Recusada, **com o motivo** | nada |
///
/// **A aprovada em rascunho não ganha link, e a tela não esconde o porquê.**
/// `entry_slug` nulo numa aprovada não é dado faltando: a entrada existe e está
/// em rascunho. Entrada nascida de indicação cujo contato é site ou Instagram
/// nasce rascunho — ela não tem telefone, que é o canal único do diretório — e
/// o `Perto` só lista o que está publicado. Oferecer `Ver no Perto` ali levaria
/// a uma página que não está lá, e quem decide isso é o servidor: esta tela não
/// reavalia publicação.
///
/// ## O motivo da recusa aparece, e isso é novo
///
/// Até 18/10 o motivo era recado entre revisores — o contrato dizia "não chega
/// a quem indicou". Ele chega agora: recusa sem motivo faz a pessoa indicar a
/// mesma clínica outra vez, e é a única resposta que não ensina nada a ninguém.
///
/// ## O filtro: [BarraDeListagem], e o ícone na barra de topo
///
/// [BarraDeListagem] é o componente de toda listagem deste app, sem cópia, e é
/// ela que decide onde cada parte aparece: **a linha de resumo e a folha ficam
/// no corpo, e o ícone que abre a folha vai para a barra de topo**. Essa
/// repartição não é escolha desta tela — ela mudou em 17/10/2026, quando o
/// cliente pediu o `Filtros` na barra, e `BarraDeListagem` passou a publicar o
/// ícone num [SlotDaBarraDeListagem] que a casca consome.
///
/// **O slot é o da casca**, e esta tela não monta um seu: como aba, ela vive
/// dentro de `casca_com_abas.dart`, que já publica o ícone na `AppBar`. Ela
/// montou o seu próprio enquanto era tela com endereço, e o teste do filtro foi
/// quem mostrou que sem slot `BarraDeListagem` publica o controle para ninguém.
///
/// **É por isso que só UMA aba está montada por vez** ([CorpoDoPerto] troca o
/// corpo por `if`, sem `TabBarView`): duas listas montadas publicariam no mesmo
/// slot, e o ícone da barra passaria a abrir o filtro da aba de trás.
///
/// **O filtro de estado é do SERVIDOR** (`state` do contrato), e não um recorte
/// do que já foi carregado: filtrar a página carregada mentiria no `total` e no
/// paginador — "pendentes" mostraria as pendentes da página 1 e diria que são
/// todas.
///
/// Sem busca e sem ordenação, e as duas ausências são decisão, não esquecimento:
/// o contrato não aceita `q` (buscar por nome numa lista que a própria pessoa
/// escreveu seria a única busca do projeto sem índice por trás) e a ordem é uma
/// só — a mais recente primeiro, porque é sobre ela que a pessoa quer notícia.
class MinhasIndicacoes extends StatefulWidget {
  const MinhasIndicacoes({super.key});

  static const String tituloDaTela = 'Minhas indicações';

  /// A lista vazia **não fica em branco, e uma linha basta.**
  ///
  /// O cliente mandou remover textos de apoio em 18/10, então aqui não há
  /// parágrafo explicando o que é indicar: quem chegou nesta tela já indicou ou
  /// já viu a porta. Uma frase, e o botão que resolve.
  static const String vazio = 'Você ainda não indicou ninguém.';

  /// Vazio **por causa do filtro**, que é outro estado: dizer "você ainda não
  /// indicou ninguém" a quem tem três indicações e filtrou por recusadas seria
  /// mentira.
  static String vazioComFiltro(String rotulo) => 'Nenhuma indicação $rotulo.';

  static const String rotuloDeIndicar = 'Indicar quem atende bem';
  static const String rotuloDeVerNoPerto = 'Ver no Perto';
  static const String carregando = 'Carregando as suas indicações';
  static const String falha = 'Não foi possível carregar as suas indicações.';
  static const String falhaDeMais = 'Não foi possível carregar mais indicações.';

  /// O rótulo de cada estado, e ele é o MESMO em todo lugar desta tela: no selo
  /// do cartão e na opção do filtro. Duas palavras para o mesmo estado é como a
  /// pessoa deixa de reconhecer o que filtrou.
  static String rotuloDoEstado(EstadoDaSugestao estado) => switch (estado) {
    EstadoDaSugestao.pending => 'Em análise',
    EstadoDaSugestao.approved => 'Aprovada',
    EstadoDaSugestao.declined => 'Recusada',
  };

  /// A linha que explica a aprovada que ainda não está no ar.
  ///
  /// **Não promete prazo e não promete link**: quem completa a entrada é o
  /// painel, e esta tela não sabe quando.
  static const String aprovadaForaDoAr = 'Ainda não está no Perto.';

  /// O prefixo do motivo, para o motivo não parecer texto do app.
  static const String prefixoDoMotivo = 'Motivo: ';

  /// A frase do fim da lista, no plural e no singular.
  ///
  /// `todas as 1 indicações` e o defeito que uma frase so produz, e por isso o
  /// rodape pede uma FUNCAO do total em vez de um texto.
  static String fimDaLista(int total) => total == 1
      ? 'Esta é a sua única indicação.'
      : 'Você viu todas as suas $total indicações.';

  static const String chaveDoFiltroDeEstado = 'state';

  @override
  State<MinhasIndicacoes> createState() => _MinhasIndicacoesState();
}

enum _Fase { carregando, lista, falha }

class _MinhasIndicacoesState extends State<MinhasIndicacoes> {
  _Fase _fase = _Fase.carregando;
  List<MinhaIndicacao> _itens = const <MinhaIndicacao>[];
  int _total = 0;
  int _pagina = 1;
  bool _carregandoMais = false;
  String? _falhaDeMais;

  /// O estado APLICADO, e não o marcado na folha: é ele que foi para a rota.
  EstadoDaSugestao? _estado;

  DiretorioApi get _api => DiretorioApi(Escopo.of(context).api);

  @override
  void initState() {
    super.initState();
    // Em `didChangeDependencies`, e não aqui: `Escopo` é um `InheritedWidget`, e
    // lê-lo antes de `initState` terminar estoura
    // `dependOnInheritedWidgetOfExactType ... before initState() completed`. Foi
    // esse o defeito que fez três telas abrirem dizendo "servidor fora" sem
    // nunca ter perguntado nada.
  }

  bool _jaCarregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_jaCarregou) return;
    _jaCarregou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.minhasIndicacoes(
        pagina: 1,
        // `estado` vai como parâmetro da rota, e não como filtro desta tela.
        estado: _estado,
      );
      if (!mounted) return;
      setState(() {
        _itens = pagina.itens;
        _total = pagina.total;
        _pagina = 1;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada {
      // **Não vira lista vazia.** Falha e "você não indicou nada" são telas
      // diferentes, e trocar uma pela outra diria a quem indicou cinco
      // clínicas que não indicou nenhuma.
      if (!mounted) return;
      setState(() => _fase = _Fase.falha);
    } on FormatException {
      if (!mounted) return;
      setState(() => _fase = _Fase.falha);
    }
  }

  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.minhasIndicacoes(
        pagina: _pagina + 1,
        estado: _estado,
      );
      if (!mounted) return;
      setState(() {
        _itens = <MinhaIndicacao>[..._itens, ...pagina.itens];
        _total = pagina.total;
        _pagina += 1;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      // **A lista FICA.** O que já estava na tela continua certo; apagá-la por
      // causa da página seguinte puniria quem só queria rolar.
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MinhasIndicacoes.falhaDeMais;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MinhasIndicacoes.falhaDeMais;
      });
    }
  }

  void _aplicar(EscolhaDaFolha escolha) {
    final codigo = escolha.filtros[MinhasIndicacoes.chaveDoFiltroDeEstado];
    setState(() => _estado = EstadoDaSugestao.porCodigo(codigo));
    _carregar();
  }

  ControleDeFiltro _controleDeFiltro() {
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        GrupoDeFiltro(
          chave: MinhasIndicacoes.chaveDoFiltroDeEstado,
          titulo: 'Situação',
          selecionado: _estado?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final estado in EstadoDaSugestao.values)
              OpcaoDeRecorte(
                codigo: estado.codigo,
                rotulo: MinhasIndicacoes.rotuloDoEstado(estado),
              ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // **CORPO, e não tela.** Sem `Scaffold`, sem `AppBar` e sem
    // `SlotDaBarraDeListagem`: como segunda aba do `Perto`, quem os monta é a
    // casca, e o título da seção já está na barra dela. Uma `AppBar` aqui
    // daria duas barras empilhadas; um slot aqui roubaria o ícone de filtrar
    // da barra de cima e o desenharia dentro do corpo.
    //
    // `Column`, e não `ListView`: a casca já rola o conteúdo da seção
    // (`TelaDeAba`), e uma rolagem dentro de outra prende o gesto na de
    // dentro -- o `RodapeDaPaginacao` ficaria inalcançável no fim da lista.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _corpo(),
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e6),
            child: Center(
              child: Semantics(
                label: MinhasIndicacoes.carregando,
                child: const CircularProgressIndicator.adaptive(),
              ),
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(MinhasIndicacoes.falha),
                const SizedBox(height: BichuEspaco.e4),
                BotaoSecundario(rotulo: 'Tentar de novo', aoTocar: _carregar),
              ],
            ),
          ),
        ];
      case _Fase.lista:
        return <Widget>[
          // O filtro NO CORPO, acima da lista: o padrão de listagem do app.
          // A barra só aparece quando há o que recortar, e é ela que decide.
          if (BarraDeListagem.desenha(
            total: _total,
            filtro: _controleDeFiltro(),
            aoAplicar: _aplicar,
          ))
            BarraDeListagem(
              total: _total,
              filtro: _controleDeFiltro(),
              aoAplicar: _aplicar,
              substantivo: const SubstantivoDaListagem(
                singular: 'indicação',
                plural: 'indicações',
              ),
            ),
          ..._lista(),
        ];
    }
  }

  List<Widget> _lista() {
    if (_itens.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // UMA LINHA, e não um parágrafo: o cliente mandou remover textos
              // de apoio em 18/10. Mas não fica em branco -- lista vazia sem
              // nada é a tela que parece quebrada.
              Text(
                _estado == null
                    ? MinhasIndicacoes.vazio
                    : MinhasIndicacoes.vazioComFiltro(
                        MinhasIndicacoes.rotuloDoEstado(
                          _estado!,
                        ).toLowerCase(),
                      ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              // A porta de indicar SÓ no vazio sem filtro: quem filtrou por
              // recusadas e não tem nenhuma não está pedindo para indicar.
              if (_estado == null)
                BotaoSecundario(
                  rotulo: MinhasIndicacoes.rotuloDeIndicar,
                  aoTocar: () => context.push(Rotas.sugerirProfissional),
                ),
            ],
          ),
        ),
      ];
    }

    return <Widget>[
      for (final indicacao in _itens) _CartaoDaIndicacao(indicacao: indicacao),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: _total,
        aoPedirMais: _carregarMais,
        fimDaLista: MinhasIndicacoes.fimDaLista,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
      ),
    ];
  }
}

/// Um cartão da lista: a indicação e o estado dela.
class _CartaoDaIndicacao extends StatelessWidget {
  const _CartaoDaIndicacao({required this.indicacao});

  final MinhaIndicacao indicacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final lugar = indicacao.bairro == null
        ? '${indicacao.cidade}, ${indicacao.uf}'
        : '${indicacao.bairro}, ${indicacao.cidade}, ${indicacao.uf}';

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(indicacao.nome, style: textos.titleMedium),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            '${indicacao.atividade.rotulo} · $lugar',
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          _SeloDoEstado(estado: indicacao.estado),
          // A APROVADA QUE NÃO ESTÁ NO AR diz isso com palavras, e não com a
          // ausência de um botão: botão que não existe não explica nada.
          if (indicacao.estado == EstadoDaSugestao.approved &&
              !indicacao.levaAoPerto) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              MinhasIndicacoes.aprovadaForaDoAr,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ],
          // O MOTIVO DA RECUSA. Ele chega a quem indicou desde 18/10/2026.
          if (indicacao.motivoDaRecusa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              '${MinhasIndicacoes.prefixoDoMotivo}${indicacao.motivoDaRecusa}',
              style: textos.bodySmall,
            ),
          ],
          // `Ver no Perto` SÓ com `entry_slug`: o servidor só o manda quando a
          // entrada está publicada, e esta tela não inventa endereço.
          if (indicacao.levaAoPerto) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            BotaoSecundario(
              rotulo: MinhasIndicacoes.rotuloDeVerNoPerto,
              aoTocar: () =>
                  context.push(Rotas.localDoPertoDe(indicacao.entradaSlug!)),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          Divider(height: 1, color: cores.outline),
        ],
      ),
    );
  }
}

/// O selo do estado: a palavra, e a cor como reforço — nunca a cor sozinha.
///
/// Cor sozinha não é estado para quem não a distingue (WCAG 1.4.1), e aqui o
/// estado é o conteúdo da tela: a palavra vem sempre, e a cor acompanha.
class _SeloDoEstado extends StatelessWidget {
  const _SeloDoEstado({required this.estado});

  final EstadoDaSugestao estado;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final cor = switch (estado) {
      EstadoDaSugestao.pending => cores.textSecondary,
      EstadoDaSugestao.approved => cores.success,
      EstadoDaSugestao.declined => cores.error,
    };

    return Text(
      MinhasIndicacoes.rotuloDoEstado(estado),
      style: textos.labelLarge?.copyWith(color: cor),
    );
  }
}
