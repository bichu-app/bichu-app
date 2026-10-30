import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_loja.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';
import '../rede/pecas_da_rede.dart';
import 'vitrine_da_loja.dart';

/// A pagina de um produto da `Loja`: `GET /v1/store/items/{itemSlug}`
/// (`getStoreItem`).
class TelaDoProduto extends StatefulWidget {
  const TelaDoProduto({required this.slug, super.key});

  final String slug;

  static const String tituloDaTela = 'Produto';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String tituloDaDescricao = 'Sobre o produto';

  /// O 404, nos quatro casos do contrato, com **uma** frase.
  static const String tituloDoNaoEncontrado = 'Este produto saiu da vitrine';

  static const String explicacaoDoNaoEncontrado =
      'Ele pode ter sido retirado pelo parceiro. Veja o que está na Loja '
      'agora.';

  static const String rotuloDeVoltarParaVitrine = 'Ver a Loja';

  /// O que o leitor de tela anuncia enquanto a pagina carrega.
  static const String carregandoOProduto = 'Carregando o produto';

  /// Empilha o produto no ramo da `Loja`, com a barra de abas: voltar devolve a
  /// vitrine com a busca e o filtro de quem estava lendo.
  static Future<void> abrir(BuildContext context, String slug) {
    return context.push<void>(Rotas.produtoDaLojaDe(slug));
  }

  @override
  State<TelaDoProduto> createState() => _TelaDoProdutoState();
}

/// Os desfechos de uma carga.
enum _Fase { carregando, pronto, naoEncontrado, falha }

class _TelaDoProdutoState extends State<TelaDoProduto> {
  _Fase _fase = _Fase.carregando;
  DetalheDoProduto? _detalhe;
  String? _textoDaFalha;

  /// Qual imagem da galeria esta no quadro grande.
  int _imagemAtual = 0;

  final PageController _quadros = PageController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregar();
    });
  }

  @override
  void dispose() {
    _quadros.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });

    try {
      final detalhe = await escopo.loja.detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _detalhe = detalhe;
        _imagemAtual = 0;
        _fase = _Fase.pronto;
      });
      if (_quadros.hasClients) _quadros.jumpToPage(0);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoEncontrado) {
        setState(() {
          _detalhe = null;
          _fase = _Fase.naoEncontrado;
        });
        return;
      }
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _detalhe = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta do produto fora do contrato: $erro');
    }
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.loja);
    }
  }

  void _mostrarImagem(int indice) {
    setState(() => _imagemAtual = indice);
    if (_quadros.hasClients) _quadros.jumpToPage(indice);
  }

  @override
  Widget build(BuildContext context) {
    final detalhe = _detalhe;
    final titulo = detalhe?.item.titulo;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: BichuAlvoDeToque.critico,
        leadingWidth: BichuAlvoDeToque.critico,
        leading: _BotaoVoltar(aoTocar: _voltar),
        title: Text(
          titulo ?? TelaDoProduto.tituloDaTela,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: SafeArea(
        child: Semantics(
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: titulo == null
              ? TelaDoProduto.tituloDaTela
              : '${TelaDoProduto.tituloDaTela}: $titulo',
          child: ListView(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e8),
            children: _corpo(detalhe),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo(DetalheDoProduto? detalhe) {
    if (_fase == _Fase.carregando) {
      return const <Widget>[_Margem(child: _EsqueletoDoProduto())];
    }

    if (_fase == _Fase.naoEncontrado) {
      return <Widget>[
        _Margem(
          child: EstadoVazio(
            titulo: TelaDoProduto.tituloDoNaoEncontrado,
            explicacao: TelaDoProduto.explicacaoDoNaoEncontrado,
            acao: SizedBox(
              width: double.infinity,
              height: BichuAlvoDeToque.min,
              child: OutlinedButton(
                onPressed: () => context.go(Rotas.loja),
                child: const Text(TelaDoProduto.rotuloDeVoltarParaVitrine),
              ),
            ),
          ),
        ),
      ];
    }

    if (_fase == _Fase.falha || detalhe == null) {
      return <Widget>[
        _Margem(
          child: FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: TelaDoProduto.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
        ),
      ];
    }

    final item = detalhe.item;

    return <Widget>[
      if (!detalhe.semImagem)
        _Galeria(
          imagens: detalhe.imagens,
          tituloDoProduto: item.titulo,
          atual: _imagemAtual,
          aoMostrar: _mostrarImagem,
          controlador: _quadros,
        ),
      const SizedBox(height: BichuEspaco.e4),
      _Margem(child: _Cabecalho(item: item)),
      const SizedBox(height: BichuEspaco.e6),
      _Secao(
        icone: Icons.notes_outlined,
        titulo: TelaDoProduto.tituloDaDescricao,
        child: _DescricaoInteira(resumo: item.resumo),
      ),
      if (item.destinoExterno case final Uri destino) ...<Widget>[
        const SizedBox(height: BichuEspaco.e6),
        _Margem(
          child: BotaoDeSaidaDaLoja(item: item, destino: destino),
        ),
      ],
    ];
  }
}

/// A galeria do produto: o quadro grande, e a fita de miniaturas abaixo.
class _Galeria extends StatelessWidget {
  const _Galeria({
    required this.imagens,
    required this.tituloDoProduto,
    required this.atual,
    required this.aoMostrar,
    required this.controlador,
  });

  final List<ImagemDoProduto> imagens;
  final String tituloDoProduto;
  final int atual;
  final ValueChanged<int> aoMostrar;
  final PageController controlador;

  /// A miniatura: 96 dp, na proporcao do quadro grande.
  static const double _larguraDaMiniatura = 96;

  /// `3 de 8`, para quem precisa saber que ha mais.
  static String contador(int posicao, int total) => '$posicao de $total';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        AspectRatio(
          aspectRatio: proporcaoDaFoto,
          child: PageView.builder(
            controller: controlador,
            itemCount: imagens.length,
            onPageChanged: aoMostrar,
            itemBuilder: (context, i) => Image.network(
              imagens[i].url,
              fit: BoxFit.cover,
              semanticLabel: imagens[i].nomeDaImagem(tituloDoProduto),
              errorBuilder: (_, _, _) => ColoredBox(color: cores.surfaceSunken),
            ),
          ),
        ),
        if (imagens.length > 1) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _Margem(
            child: Text(
              contador(atual + 1, imagens.length),
              style: textos.labelMedium?.copyWith(color: cores.textSecondary),
            ),
          ),
          const SizedBox(height: BichuEspaco.e2),
          SizedBox(
            height: _larguraDaMiniatura / proporcaoDaFoto,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
              itemCount: imagens.length,
              separatorBuilder: (_, _) => const SizedBox(width: BichuEspaco.e2),
              itemBuilder: (context, i) => _Miniatura(
                imagem: imagens[i],
                tituloDoProduto: tituloDoProduto,
                posicao: i + 1,
                total: imagens.length,
                aberta: i == atual,
                largura: _larguraDaMiniatura,
                aoTocar: () => aoMostrar(i),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Uma miniatura da fita.
class _Miniatura extends StatelessWidget {
  const _Miniatura({
    required this.imagem,
    required this.tituloDoProduto,
    required this.posicao,
    required this.total,
    required this.aberta,
    required this.largura,
    required this.aoTocar,
  });

  final ImagemDoProduto imagem;
  final String tituloDoProduto;
  final int posicao;
  final int total;
  final bool aberta;
  final double largura;
  final VoidCallback aoTocar;

  static String rotulo(int posicao, int total) => 'Imagem $posicao de $total';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Semantics(
      button: true,
      selected: aberta,
      label: rotulo(posicao, total),
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: Container(
          width: largura,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.md),
            border: Border.all(
              color: aberta ? cores.primary : cores.outline,
              width: aberta ? BichuBorda.thick : BichuBorda.hairline,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(BichuRaio.md),
            child: ExcludeSemantics(
              child: Image.network(
                imagem.url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    ColoredBox(color: cores.surfaceSunken),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Titulo, parceiro e categoria.
class _Cabecalho extends StatelessWidget {
  const _Cabecalho({required this.item});

  final ItemDaLoja item;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final classificacao = item.linhaDaClassificacao;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(item.titulo, style: textos.headlineSmall),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          item.parceiro.nome,
          style: textos.labelLarge?.copyWith(color: cores.textSecondary),
        ),
        if (classificacao != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _PilulaDaCategoria(rotulo: classificacao),
        ],
      ],
    );
  }
}

class _PilulaDaCategoria extends StatelessWidget {
  const _PilulaDaCategoria({required this.rotulo});

  final String rotulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        rotulo,
        style: textos.labelMedium?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// A descricao, **inteira**.
class _DescricaoInteira extends StatelessWidget {
  const _DescricaoInteira({required this.resumo});

  final String resumo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Text(
      resumo,
      style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
    );
  }
}

/// A margem lateral da pagina: a mesma de `rede/encontro_da_rede.dart`.
class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
    child: child,
  );
}

/// Um bloco com icone e titulo, no mesmo desenho do detalhe do encontro.
class _Secao extends StatelessWidget {
  const _Secao({
    required this.icone,
    required this.titulo,
    required this.child,
  });

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

class _BotaoVoltar extends StatelessWidget {
  const _BotaoVoltar({required this.aoTocar});
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: aoTocar,
      tooltip: 'Voltar',
      icon: const Icon(Icons.arrow_back),
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      color: BichuColors.of(context).cores.textPrimary,
    );
  }
}

/// O esqueleto, na proporcao do quadro da galeria.
class _EsqueletoDoProduto extends StatelessWidget {
  const _EsqueletoDoProduto();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: TelaDoProduto.carregandoOProduto,
      child: AspectRatio(
        aspectRatio: proporcaoDaFoto,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
          ),
        ),
      ),
    );
  }
}
