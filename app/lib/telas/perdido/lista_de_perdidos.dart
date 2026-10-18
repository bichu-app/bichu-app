import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import 'cartao_do_perdido.dart';

/// O corpo da seção `Pets`: **a listagem pública dos pets perdidos da região.**
///
/// Até este arquivo a seção dizia *"A lista de pets perdidos está em
/// construção"*, e a frase era honesta: `listPublicLostPets` estava no contrato
/// e **não tinha rota**, então o app não tinha o que chamar. A rota existe
/// agora (`listagem-publica-de-perdidos-routes.ts`), e a casca honesta sai —
/// pelo mesmo caminho que a da `Rede` saiu: o estado vazio não desaparece, ele
/// **muda de dono**. Quem o mostra agora é a lista, e só quando o servidor
/// responde que não há caso aberto no recorte, que é afirmação medida e não
/// afirmação sobre dado que a tela não carrega.
///
/// ---------------------------------------------------------------------------
/// ## O padrão de listagem, sem uma linha de cópia
///
/// [BarraDeListagem], e esta é a **quarta** tela a usar o componente (depois de
/// `Perto`, da `Loja` e da `Rede`). O campo de busca é desenhado por esta tela,
/// em **largura total**, acima de tudo (`buscaAcima: true`); filtro e ordem vão
/// para o slot único de ação da barra de topo, na mesma folha. É o padrão de
/// 17/10/2026 inteiro, e nada dele foi reinventado aqui.
///
/// A busca é por **nome do pet**, e nunca por código de plaquinha: o contrato
/// explica por que — aceitar código aqui transformaria a listagem pública num
/// oráculo de existência de código, com teto de listagem em vez do teto estrito
/// da rota da tag. Quem digita um código tem o leitor de QR a um toque, logo
/// acima.
///
/// **A ordenação NÃO é desenhada.** A operação aceita uma ordem só (mais
/// recente primeiro), e um controle de ordem com uma opcão é controle sem
/// desfecho — a mesma regra que mantém `ControleDeOrdenacao.temEscolha` exigindo
/// dois.
///
/// ---------------------------------------------------------------------------
/// ## A CIDADE É OBRIGATÓRIA NO CONTRATO, E É ISSO QUE DECIDE O ESTADO VAZIO
///
/// `city` é `required` em `listPublicLostPets`, e a obrigatoriedade é de
/// privacidade: sem ela a operação seria um inventário nacional de animais
/// perdidos, que é a listagem que o item 6 do ADR-0010 não quer existir.
///
/// **A única fonte de cidade que este app tem é `Me.reference_area.city`**, que
/// exige conta. Medido, e não suposto: não há lista de cidades no contrato desta
/// operação (`applied_filters` devolve o que foi pedido, não o que existe), não
/// há geocodificação (ADR-0006) e o app não tem porta de localização.
///
/// A consequência é honesta e **é decisão do cliente, não desta tela**: a ROTA é
/// pública e alcançável sem conta (o teste de borda pede sem `Authorization` e
/// recebe 200), mas a TELA não tem cidade para perguntar quando não há conta com
/// região cadastrada. Nesses dois casos ela desenha **uma linha** e para — não
/// inventa cidade, não pede coordenada e não afirma que não há perdidos.
///
/// ---------------------------------------------------------------------------
/// ## Paginação NUMERADA, e a escolha é do contrato
///
/// `page`/`limit` com `total`, porque é o que `PublicLostPetPage` declara e os
/// três campos são `required`. Trocar para cursor seria mudança **quebrante** de
/// contrato, e mudança quebrante não se faz por preferência. O desenho é o do
/// parágrafo 11.20 de qualquer forma — `Carregar mais`, nunca rolagem infinita e
/// nunca números de página na tela —, e quem o desenha é [RodapeDaPaginacao].
///
/// ## Sem texto de apoio
///
/// A seção manda `reforcoDaPagina: ''` desde que o cliente removeu as frases de
/// apoio (18/10/2026), e o estado vazio tem **uma linha**. É por isso que esta
/// tela não usa `EstadoVazio`, que exige título e explicação: duas linhas onde o
/// cliente pediu uma.
class ListaDePerdidos extends StatefulWidget {
  const ListaDePerdidos({super.key});

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  static const String vazio = 'Nenhum pet perdido na sua região agora.';
  static const String vazioFiltrado = 'Nenhum pet perdido com esse recorte.';
  static const String semCidade =
      'Cadastre sua região no perfil para ver os pets perdidos por perto.';
  static const String falha = 'Não foi possível carregar os pets perdidos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static const String rotuloDaBusca = 'Buscar pet perdido';
  static const String dicaDaBusca = 'Buscar pelo nome do pet';

  /// A frase do fim da lista. Carrega o substantivo e o plural, que é por que
  /// [RodapeDaPaginacao] não a monta sozinho.
  static String fimDaLista(int total) =>
      total == 1 ? 'Um pet perdido na região.' : '$total pets perdidos na região.';

  @override
  State<ListaDePerdidos> createState() => _EstadoDaListaDePerdidos();
}

enum _Fase { carregando, lista, falha, semCidade }

class _EstadoDaListaDePerdidos extends State<ListaDePerdidos> {
  _Fase _fase = _Fase.carregando;

  List<PerdidoPublico> _itens = const <PerdidoPublico>[];
  int _total = 0;
  int _pagina = 1;

  RecorteDePerdidos? _recorte;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  final TextEditingController _buscaControlador = TextEditingController();

  /// Cada carga ganha um número; resposta de carga velha é descartada. É a
  /// mesma guarda da agenda da `Rede`, e ela existe porque trocar o recorte
  /// duas vezes rápido entrega as respostas fora de ordem.
  int _geracao = 0;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O instante de referência das frases relativas dos cartões, fixado **por
  /// carga** e não lido a cada pintura: um `DateTime.now()` dentro do `build`
  /// faria dois cartões da mesma lista discordarem sobre o que é "hoje" na
  /// virada da meia-noite.
  DateTime _agora = DateTime.now();

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// A região cadastrada do tutor. **A única fonte de cidade deste app.**
  RegiaoDeReferencia? get _regiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia;

  String? get _cidade {
    final c = _regiao?.cidade?.trim();
    return (c == null || c.isEmpty) ? null : c;
  }

  String? get _meuBairro {
    final b = _regiao?.bairro?.trim();
    return (b == null || b.isEmpty) ? null : b;
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final cidade = _cidade;
    if (cidade == null) {
      setState(() {
        _fase = _Fase.semCidade;
        _itens = const <PerdidoPublico>[];
        _total = 0;
      });
      return;
    }

    // O recorte nasce com a cidade da região, e a cidade **acompanha** a
    // região: quem muda de cidade no perfil não deve continuar vendo a antiga.
    final atual = (_recorte ?? RecorteDePerdidos(cidade: cidade)).copiar(cidade: cidade);

    final int geracao;
    if (maisUma) {
      if (_carregandoMais) return;
      geracao = _geracao;
      setState(() {
        _carregandoMais = true;
        _falhaAoCarregarMais = false;
      });
    } else {
      geracao = ++_geracao;
      setState(() {
        _fase = _Fase.carregando;
        _agora = DateTime.now();
      });
    }

    final pedido = atual.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final api = PerdidosApi(Escopo.of(context).api);

    try {
      final pagina = await api.listar(pedido);
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _recorte = atual;
        _itens = maisUma
            ? <PerdidoPublico>[..._itens, ...pagina.itens]
            : pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      _falhou(geracao, maisUma: maisUma);
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(int geracao, {required bool maisUma}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        // A página seguinte falhou: os cartões que já estão na tela ficam,
        // porque o recorte deles é o mesmo. Apagar tudo porque a terceira
        // página não chegou seria punir quem rolou mais.
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      // Os cartões antigos saem: sob uma faixa de erro eles afirmariam um
      // recorte que a tela não conseguiu aplicar.
      _itens = const <PerdidoPublico>[];
      _fase = _Fase.falha;
    });
  }

  void _trocarRecorte(RecorteDePerdidos novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: ListaDePerdidos.rotuloDaBusca,
      termoAplicado: _recorte?.termoLimpo,
      // `maxLength: 60` no contrato, e `minLength` não existe em `q`: o piso de
      // dois caracteres é do índice trigrama, que não produz trigrama nenhum
      // com menos — e com menos a busca volta a varrer a tabela.
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        final base = _recorte;
        if (base == null) return;
        if (termo == base.termoLimpo) return;
        _trocarRecorte(base.copiar(termo: termo, pagina: 1));
      },
    );
  }

  ControleDeFiltro? _controleDeFiltro() {
    final base = _recorte;
    if (base == null) return null;
    final bairro = _meuBairro;
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        // O bairro só entra quando há UM para oferecer, e o único que este app
        // conhece é o da própria região cadastrada. Uma lista de bairros da
        // cidade não existe em lugar nenhum deste produto, e inventá-la a
        // partir dos casos que voltaram ofereceria um recorte diferente a cada
        // página.
        if (bairro != null)
          GrupoDeFiltro(
            chave: 'neighborhood',
            titulo: 'Bairro',
            selecionado: base.bairro,
            opcoes: <OpcaoDeRecorte>[
              OpcaoDeRecorte(codigo: bairro, rotulo: bairro),
            ],
            nota: 'O bairro que você cadastrou no perfil.',
          ),
        GrupoDeFiltro(
          chave: 'species',
          titulo: 'Espécie',
          selecionado: base.especie?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final e in Especie.values)
              OpcaoDeRecorte(codigo: e.valor, rotulo: e.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte',
          selecionado: base.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'period',
          titulo: 'Perdido desde',
          selecionado: base.janela.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final j in JanelaDePerdidos.values)
              OpcaoDeRecorte(codigo: j.codigo, rotulo: j.rotulo),
          ],
          nota: 'A janela conta de quando o pet foi visto pela última vez.',
        ),
      ],
    );
  }

  /// O `Aplicar` da folha: **um** recorte, **uma** chamada à rota.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final base = _recorte;
    if (base == null) return;
    _trocarRecorte(
      base.copiar(
        bairro: escolha.filtros['neighborhood'],
        especie: Especie.de(escolha.filtros['species']),
        porte: Porte.de(escolha.filtros['size']),
        // `period` tem padrão no contrato: limpar a pastilha volta para `30d`,
        // e não para "sem janela" — não existe listagem sem janela.
        janela: JanelaDePerdidos.de(escolha.filtros['period']),
        pagina: 1,
      ),
    );
  }

  bool get _temRecorteAtivo {
    final base = _recorte;
    if (base == null) return false;
    return base.temBusca ||
        base.bairro != null ||
        base.especie != null ||
        base.porte != null ||
        base.janela != JanelaDePerdidos.trintaDias;
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        // Entrar ou sair com a seção aberta troca a região, e a região é a
        // cidade: sem isto quem acabou de entrar continuaria na linha única.
        final cidade = _cidade;
        if (cidade == null && _fase != _Fase.semCidade) _agendarCarga();
        if (cidade != null && _fase == _Fase.semCidade) _agendarCarga();

        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        // O campo de busca aparece **exatamente** quando a barra apareceria: a
        // decisão é uma só e mora no componente. Sem isto, a seção sem perdido
        // nenhum desenharia um campo de busca sobre o nada.
        final comControles = _fase == _Fase.lista &&
            BarraDeListagem.desenha(
              total: _total,
              busca: busca,
              filtro: filtro,
              aoAplicar: _aplicarAFolha,
            );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (comControles) ...<Widget>[
              CampoDeBuscaDaListagem(busca: busca),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase == _Fase.lista)
              BarraDeListagem(
                total: _total,
                substantivo: const SubstantivoDaListagem(
                  singular: 'pet perdido',
                  plural: 'pets perdidos',
                ),
                // O campo já foi desenhado acima; a barra recebe o controle
                // para saber do TERMO APLICADO, e não para desenhar de novo.
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(),
          ],
        );
      },
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.semCidade:
        return <Widget>[_UmaLinha(texto: ListaDePerdidos.semCidade)];
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando pets perdidos',
            liveRegion: true,
            child: const Column(
              children: <Widget>[
                _EsqueletoDePerdido(),
                SizedBox(height: BichuEspaco.e4),
                _EsqueletoDePerdido(),
              ],
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: ListaDePerdidos.falha,
            rotuloDaAcao: ListaDePerdidos.rotuloDeTentar,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return <Widget>[
            _UmaLinha(
              texto: _temRecorteAtivo
                  ? ListaDePerdidos.vazioFiltrado
                  : ListaDePerdidos.vazio,
            ),
          ];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            CartaoDoPerdido(perdido: _itens[i], agora: _agora),
          ],
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: _total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaAoCarregarMais ? ListaDePerdidos.falha : null,
            aoPedirMais: () => _carregar(maisUma: true),
            fimDaLista: ListaDePerdidos.fimDaLista,
          ),
        ];
    }
  }
}

/// O estado vazio desta seção: **uma linha**, e nada mais.
///
/// `EstadoVazio` exige `titulo` e `explicacao`, e explicação é a segunda linha
/// que o cliente mandou remover em 18/10/2026. A moldura é a mesma — fundo
/// afundado, raio `lg`, borda `hairline` —, para o vazio continuar parecendo o
/// vazio do resto do app.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

/// O esqueleto do cartão, com a mesma geometria do cartão de verdade: sem isso
/// a lista dá um salto de layout quando os dados chegam.
class _EsqueletoDePerdido extends StatelessWidget {
  const _EsqueletoDePerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Moldura(
            largura: BichuMoldura.larguraFotoSm,
            estado: EstadoDaMoldura.carregando,
          ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.4),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.8),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Barrinha extends StatelessWidget {
  const _Barrinha({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: BichuEspaco.e3,
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
