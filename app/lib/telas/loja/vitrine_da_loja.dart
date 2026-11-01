import '../../widgets/arrastar_para_atualizar.dart';

import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_loja.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/carrossel_de_fotos.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';

/// `Loja` — a vitrine curada que leva a loja do parceiro.
class VitrineDaLoja extends StatefulWidget {
  const VitrineDaLoja({super.key});

  /// O vazio **sem nenhum recorte**: a vitrine ainda nao tem produto.
  static const String tituloDoVazio = 'A Loja está sendo montada';

  static const String explicacaoDoVazio =
      'O Bichu está escolhendo a dedo os produtos que valem a pena para o seu '
      'pet. Quando os primeiros entrarem, eles aparecem nesta lista.';

  /// O vazio **depois de recortar**.
  static const String tituloDoVazioFiltrado = 'Nada com esse recorte';

  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra ou tire o filtro para ver mais produtos.';

  /// O aviso que a Loja inteira carrega, e ele nao e opcional.
  static const String avisoDeQueNaoSomosOVendedor =
      'A compra é feita no site do parceiro. O Bichu não é o vendedor e não '
      'controla preço, estoque nem entrega.';

  /// O que a linha de preco diz quando o preco venceu.
  static const String precoNaoConfirmado =
      'Preço não confirmado, veja no site do parceiro';

  /// Quando o aparelho nao abre o link.
  static const String falhaAoAbrirOLink = 'Não conseguimos abrir o link.';

  static const String rotuloDeAtualizar = 'Atualizar';

  /// O CONVITE DA VITRINE, **redacao do cliente (22/10/2026), literal**: *"Na
  /// pagina da loja inclua a frase: Ajude a mantermos o Bichu gratuito e ainda
  /// ganhe descontos comprando em nossas lojas parceiras.
  static const String conviteDaVitrine =
      'Ajude a mantermos o Bichu gratuito e ainda ganhe descontos comprando '
      'em nossas lojas parceiras.';

  /// O cupom, e **o rotulo e meu** -- ele deu o codigo (`bichu`), nao a frase
  /// que o apresenta.
  static const String rotuloDoCupom = 'Cupom de desconto';
  static const String codigoDoCupom = 'bichu';

  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  static String fimDaLista(int total) => total == 1
      ? 'Você viu o único produto da vitrine.'
      : 'Você viu todos os $total produtos da vitrine.';

  /// Quando a pagina seguinte nao chega.
  static const String falhaAoCarregarMais =
      'Não foi possível carregar mais produtos.';

  @override
  State<VitrineDaLoja> createState() => _VitrineDaLojaState();
}

enum _Fase { carregando, lista, falha }

class _VitrineDaLojaState extends State<VitrineDaLoja>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;
  RecorteDaLoja _recorte = const RecorteDaLoja();
  PaginaDaLoja? _pagina;
  String? _textoDaFalha;

  TaxonomiaDaLoja _taxonomia = TaxonomiaDaLoja.vazia;

  final List<ItemDaLoja> _itens = <ItemDaLoja>[];

  bool _carregandoMais = false;

  String? _falhaDeMais;

  final TextEditingController _buscaControlador = TextEditingController();

  bool _visivel = false;
  bool _cargaAgendada = false;

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

  /// Recarrega quando a tela volta a aparecer, pelo mesmo mecanismo de `Perto`.
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
    unawaited(_carregarTaxonomia());
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregarTaxonomia() async {
    if (!mounted || _taxonomia.categorias.isNotEmpty) return;
    final escopo = Escopo.of(context);
    try {
      final taxonomia = await escopo.loja.taxonomia();
      if (!mounted) return;
      setState(() => _taxonomia = taxonomia);
    } on FalhaDeChamada catch (_) {
      // Silencio deliberado: o filtro de categoria deixa de ser oferecido, e nada mais na tela depende disto.
    } on FormatException catch (erro) {
      debugPrint('Resposta da taxonomia fora do contrato: $erro');
    }
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final recorte = _recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1);
    setState(() {
      _recorte = recorte;
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _carregandoMais = false;
      _itens.clear();
    });

    try {
      final pagina = await escopo.loja.listar(recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens
          ..clear()
          ..addAll(pagina.itens);
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _pagina = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _pagina = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta da vitrine fora do contrato: $erro');
    }
  }

  void _trocarRecorte(RecorteDaLoja novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _pagina;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    final proximo = _recorte.com(pagina: atual.pagina + 1);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await escopo.loja.listar(proximo);
      if (!mounted) return;
      setState(() {
        _recorte = proximo;
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (_) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = VitrineDaLoja.falhaAoCarregarMais;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = VitrineDaLoja.falhaAoCarregarMais;
      });
      debugPrint('Resposta da vitrine fora do contrato: $erro');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            substantivo: const SubstantivoDaListagem(
              singular: 'produto',
              plural: 'produtos',
            ),
            busca: _controleDeBusca(),
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
            aoAplicar: _aplicarAFolha,
          ),
        const _ConviteComCupom(),
        ..._corpo(),
      ],
    );
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: 'Buscar produto',
      termoAplicado: _recorte.termo,
      minimoDeCaracteres: 2,
      aoAplicar: (termo) => _trocarRecorte(
        _recorte.com(termo: termo, limparTermo: termo == null, pagina: 1),
      ),
    );
  }

  ControleDeFiltro _controleDeFiltro() {
    final subcategorias = _taxonomia.subcategoriasDe(_recorte.categoria);
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        if (_taxonomia.categorias.isNotEmpty)
          GrupoDeFiltro(
            chave: 'category',
            titulo: 'Categoria',
            selecionado: _recorte.categoria,
            opcoes: <OpcaoDeRecorte>[
              for (final c in _taxonomia.categorias)
                OpcaoDeRecorte(codigo: c.codigo, rotulo: c.rotulo),
            ],
          ),
        if (subcategorias.isNotEmpty)
          GrupoDeFiltro(
            chave: 'subcategory',
            titulo: 'Subcategoria',
            dependeDe: 'category',
            selecionado: _recorte.subcategoria,
            opcoes: <OpcaoDeRecorte>[
              for (final s in subcategorias)
                OpcaoDeRecorte(codigo: s.codigo, rotulo: s.rotulo),
            ],
          ),
      ],
    );
  }

  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final categoria = escolha.filtros['category'];
    final subcategoria = escolha.filtros['subcategory'];
    _trocarRecorte(
      _recorte.com(
        categoria: categoria,
        limparCategoria: categoria == null,
        subcategoria: subcategoria,
        limparSubcategoria: subcategoria == null,
        ordem: OrdemDaLoja.porCodigo(escolha.ordem),
        pagina: 1,
      ),
    );
  }

  ControleDeOrdenacao _controleDeOrdenacao(PaginaDaLoja pagina) {
    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDaLoja.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: pagina.ordemEfetiva.codigo,
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return const <Widget>[
        _EsqueletoDeItem(),
        SizedBox(height: BichuEspaco.e3),
        _EsqueletoDeItem(),
      ];
    }

    final pagina = _pagina;
    if (_fase == _Fase.falha || pagina == null) {
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: VitrineDaLoja.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (_itens.isEmpty) {
      return <Widget>[
        if (_recorte.temRecorte)
          const EstadoVazio(
            titulo: VitrineDaLoja.tituloDoVazioFiltrado,
            explicacao: VitrineDaLoja.explicacaoDoVazioFiltrado,
          )
        else
          const EstadoVazio(
            titulo: VitrineDaLoja.tituloDoVazio,
            explicacao: VitrineDaLoja.explicacaoDoVazio,
          ),
      ];
    }

    return <Widget>[
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDaLoja(item: _itens[i]),
      ],
      const SizedBox(height: espacoAcimaDoRodape),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: pagina.total,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
        fimDaLista: VitrineDaLoja.fimDaLista,
        aoPedirMais: _carregarMais,
      ),
    ];
  }
}

/// O cartao de um item da vitrine: **foto, titulo e preco, e nada mais**.
class CartaoDaLoja extends StatelessWidget {
  const CartaoDaLoja({required this.item, super.key});

  final ItemDaLoja item;

  /// O rotulo do botao de saida.
  static const String rotuloDeSaida = 'Compre agora';

  /// A afirmacao da mensagem de apoio que fica **acima do nome do produto**.
  static const String rotuloDePrecoDeReferencia = 'Preço de referência';

  /// `consultado em 14/03`, ou **nulo** quando o item nao tem data.
  static String? sufixoDaConsulta(ItemDaLoja item) {
    final data = item.consultadoEm;
    if (data == null) return null;
    return 'consultado em ${dataCurta(data)}';
  }

  /// O rotulo VISIVEL acima do nome do produto: a afirmacao e a data.
  static String rotuloDePrecoComData(ItemDaLoja item) {
    final sufixo = sufixoDaConsulta(item);
    if (sufixo == null) return rotuloDePrecoDeReferencia;
    return '$rotuloDePrecoDeReferencia, $sufixo';
  }

  /// O nome acessivel do no do preco: **a afirmacao junto do valor**.
  static String rotuloAcessivelDoPreco(ItemDaLoja item) {
    final valor = item.linhaDoPreco;
    final sufixo = sufixoDaConsulta(item);
    final partes = <String>[rotuloDePrecoDeReferencia, ?valor, ?sufixo];
    return partes.join(', ');
  }

  /// O nome acessivel do botao de saida: diz o produto e para onde leva.
  static String rotuloAcessivelDeSaida(ItemDaLoja item) =>
      '$rotuloDeSaida, ${item.titulo}, no site ${item.parceiro.nome}';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final destino = item.destinoExterno;

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      child: InkWell(
        onTap: destino == null
            ? null
            : () => sairDaLoja(context, item, destino),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (item.fotosDoCartao.isNotEmpty) ...<Widget>[
                CarrosselDeFotos(
                  fotos: item.fotosDoCartao,
                  titulo: item.titulo,
                  altura: 160,
                ),
                const SizedBox(height: BichuEspaco.e3),
              ],
              Text(item.titulo, style: textos.titleMedium),
              if (destino != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                BotaoDeSaidaDaLoja(item: item, destino: destino),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Sai do Bichu para o site do parceiro, **sem confirmacao**.
Future<void> sairDaLoja(
  BuildContext context,
  ItemDaLoja item,
  Uri destino,
) async {
  final mensageiro = ScaffoldMessenger.maybeOf(context);

  final abriu = await SaidaDoApp.atual.abrirLink(destino);
  if (abriu) return;

  mensageiro?.showSnackBar(
    const SnackBar(content: Text(VitrineDaLoja.falhaAoAbrirOLink)),
  );
}

/// O botao que leva para fora.
class BotaoDeSaidaDaLoja extends StatelessWidget {
  const BotaoDeSaidaDaLoja({
    required this.item,
    required this.destino,
    super.key,
  });

  final ItemDaLoja item;

  /// `https` absoluto, com host.
  final Uri destino;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: OutlinedButton(
        onPressed: () => sairDaLoja(context, item, destino),
        child: Text(
          CartaoDaLoja.rotuloDeSaida,
          semanticsLabel: CartaoDaLoja.rotuloAcessivelDeSaida(item),
        ),
      ),
    );
  }
}

/// O esqueleto de carregamento, na altura de um cartao.
class _EsqueletoDeItem extends StatelessWidget {
  const _EsqueletoDeItem();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      height: 200,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
    );
  }
}

/// O CONVITE DA VITRINE E O CUPOM, numa peca so (cliente, 22/10/2026).
class _ConviteComCupom extends StatelessWidget {
  const _ConviteComCupom();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            VitrineDaLoja.conviteDaVitrine,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              Text(
                VitrineDaLoja.rotuloDoCupom.toUpperCase(),
                style: textos.labelSmall?.copyWith(color: cores.textSecondary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e3,
                  vertical: BichuEspaco.e1,
                ),
                decoration: BoxDecoration(
                  color: cores.primaryContainer,
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      Icons.local_activity,
                      size: 18,
                      color: cores.onPrimaryContainer,
                    ),
                    const SizedBox(width: BichuEspaco.e1),
                    Flexible(
                      child: SelectableText(
                        VitrineDaLoja.codigoDoCupom,
                        style: textos.titleMedium?.copyWith(
                          color: cores.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
