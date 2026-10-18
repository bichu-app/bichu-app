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
///
/// **Ela existe porque a galeria nao tinha onde aparecer.** O painel aceita
/// oito imagens com ordem e capa escolhivel; a vitrine mostra UMA
/// (`image_url`, a de posicao 0) porque a lista nao carrega as outras de
/// proposito, para nao pesar. A rota do detalhe traz as oito e **nunca tinha
/// sido chamada por ninguem**: das oito que o administrador cadastrava, o
/// tutor via uma.
///
/// ## Ordem, de cima para baixo
///
/// Galeria (quadro grande + fita de miniaturas); cabecalho (titulo, parceiro,
/// categoria, preco); o aviso de que a compra e do parceiro; `Sobre o
/// produto`, com a descricao **inteira**; o botao de abrir no site.
///
/// ## O "Ler mais" nao vem para ca, e isso e o ponto
///
/// O corte de 500 caracteres de `ItemDaLoja.trechoDoResumo` e do CARTAO, onde
/// uma descricao de 3000 caracteres empurraria a vitrine inteira para baixo.
/// Aqui a pagina e de um produto so: nao ha o que empurrar, e esconder metade
/// do texto atras de um botao numa tela dedicada a ele seria esconder por
/// habito. A descricao sai inteira, com as quebras de linha que o painel
/// gravou.
///
/// ## O que esta tela NAO tem, pelas mesmas razoes da vitrine
///
/// Sem carrinho, sem pedido, sem pagamento, sem estado de compra (criterio 5
/// da BICHUS-185). Sem preco riscado, "de/por" nem desconto (criterio 19).
/// Sem compartilhar e sem favorito: nao existem no contrato.
///
/// ## Quatro estados, e o quarto nao e tela em branco
///
/// - **carregando**: o esqueleto, na proporcao do quadro da galeria;
/// - **carregado**: a pagina;
/// - **sem imagem nenhuma**: a galeria **nao e desenhada**, e nada ocupa o
///   lugar dela. Nao e falha -- o contrato diz "vazia e estado normal", e a
///   Loja de hml hoje tem zero produto. Nao entra banner da marca aqui: o
///   `BannerDaMarca` de `pecas_da_rede.dart` desenha ceu, sol e tres arvores,
///   que e o pilar "encontros", e por um produto ele afirmaria a coisa errada;
/// - **nao encontrado**: os quatro 404 do contrato (rascunho, retirado,
///   inexistente, parceiro inativo) viram UM texto. **Rascunho da nao
///   encontrado, e nao tela vazia**: o detalhe nao e uma pre-visualizacao do
///   painel, e um produto que ninguem publicou nao esta aqui;
/// - **erro**: a faixa com `Atualizar`, como no resto do app.
class TelaDoProduto extends StatefulWidget {
  const TelaDoProduto({required this.slug, super.key});

  final String slug;

  static const String tituloDaTela = 'Produto';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String tituloDaDescricao = 'Sobre o produto';

  /// O 404, nos quatro casos do contrato, com **uma** frase.
  ///
  /// Nao diz "rascunho" nem "retirado": distinguir os quatro contaria a quem
  /// esta de fora que existe um produto que ninguem publicou, e a tela nao tem
  /// o que fazer com a diferenca -- nos quatro casos ele nao esta aqui.
  static const String tituloDoNaoEncontrado = 'Este produto saiu da vitrine';

  static const String explicacaoDoNaoEncontrado =
      'Ele pode ter sido retirado pelo parceiro. Veja o que está na Loja '
      'agora.';

  static const String rotuloDeVoltarParaVitrine = 'Ver a Loja';

  /// O que o leitor de tela anuncia enquanto a pagina carrega.
  static const String carregandoOProduto = 'Carregando o produto';

  /// Empilha o produto no ramo da `Loja`, com a barra de abas: voltar devolve
  /// a vitrine com a busca e o filtro de quem estava lendo.
  static Future<void> abrir(BuildContext context, String slug) {
    return context.push<void>(Rotas.produtoDaLojaDe(slug));
  }

  @override
  State<TelaDoProduto> createState() => _TelaDoProdutoState();
}

/// Os desfechos de uma carga. **`naoEncontrado` e separado de `falha`**: um
/// pede `Atualizar` (a pergunta nao chegou) e o outro pede a volta para a
/// vitrine (a pergunta chegou e a resposta foi "nao existe"). Um estado so
/// ofereceria `Atualizar` para quem vai receber 404 de novo.
enum _Fase { carregando, pronto, naoEncontrado, falha }

class _TelaDoProdutoState extends State<TelaDoProduto> {
  _Fase _fase = _Fase.carregando;
  DetalheDoProduto? _detalhe;
  String? _textoDaFalha;

  /// Qual imagem da galeria esta no quadro grande. Indice no array do
  /// contrato, onde 0 e a capa.
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
        // A capa volta a ser o quadro aberto depois de recarregar: manter o
        // indice 5 sobre uma galeria que agora tem duas imagens abriria a
        // pagina no vazio.
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
      // **Produto sem imagem nenhuma nao ganha substituto.** A galeria
      // simplesmente nao e montada, do mesmo jeito que o cartao da vitrine nao
      // desenha imagem quando `image_url` e nulo.
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
      const SizedBox(height: BichuEspaco.e4),
      const _Margem(child: AvisoDoParceiroDaLoja()),
      const SizedBox(height: BichuEspaco.e6),
      // A descricao INTEIRA, sem corte e sem botao: ver o cabecalho da classe.
      _Secao(
        icone: Icons.notes_outlined,
        titulo: TelaDoProduto.tituloDaDescricao,
        child: _DescricaoInteira(resumo: item.resumo),
      ),
      // O botao so existe com destino `https` utilizavel, a mesma regra do
      // cartao da vitrine: a conferencia e de `ItemDaLoja.destinoExterno`, e
      // sem destino a tela termina na descricao em vez de desenhar um botao
      // que nao leva a lugar nenhum.
      if (item.destinoExterno case final Uri destino) ...<Widget>[
        const SizedBox(height: BichuEspaco.e6),
        _Margem(child: BotaoDeSaidaDaLoja(item: item, destino: destino)),
      ],
    ];
  }
}

// ---------------------------------------------------------------------------
// A galeria
// ---------------------------------------------------------------------------

/// A galeria do produto: o quadro grande, e a fita de miniaturas abaixo.
///
/// ## A ordem e a do painel, e nada aqui reordena
///
/// `StoreItemImage` nao tem campo de posicao: a ordem do array **e** a ordem
/// que o administrador escolheu, e a primeira e a capa (a mesma `image_url`
/// que o cartao desenha). A galeria percorre a lista como ela chegou.
///
/// ## Dois jeitos de navegar, e o segundo nao e enfeite
///
/// Arrastar o quadro troca a imagem (`PageView`); tocar numa miniatura abre
/// aquela. **Os dois existem porque arrastar nao se anuncia**: com oito
/// imagens, quem nao descobre o arraste ve a capa e mais nada, que e o
/// problema que esta tela existe para resolver. A fita diz quantas ha, e a
/// miniatura aberta fica marcada.
///
/// A fita so aparece com **duas ou mais**: uma fita de um quadradinho nao
/// navega para lugar nenhum.
///
/// ## A miniatura pede a imagem GRANDE, e isso e um desperdicio conhecido
///
/// `StoreItemImage` tem `url` e `alt_text` e mais nada. `NetworkEventImage`
/// tem `thumb_url` (480 x 360) exatamente para a galeria do detalhe nao baixar
/// 1024 px para pintar 144 dp; `StoreItemImage` **nao tem o campo**, nem no
/// contrato de hoje nem no de `feat/tratamento-de-imagem`. Entao aqui a
/// miniatura desenha a mesma `url` do quadro grande. O conserto e um campo no
/// contrato, que manda nas quatro aplicacoes, e nao um recorte inventado nesta
/// tela.
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
  ///
  /// Menor que os 144 dp de `Rede` porque aqui ela convive com o quadro
  /// grande na mesma tela e a tela tem mais secoes abaixo.
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
              // O texto do painel quando ha, o nome do produto quando nao ha.
              // A escolha e do modelo (`ImagemDoProduto.nomeDaImagem`), e nao
              // desta linha.
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
///
/// **O nome anunciado diz a POSICAO, e nao o texto alternativo da imagem.**
/// Numa fita de oito, "Bola Pop vista de cima, botão" repetido nao diz a quem
/// usa leitor de tela onde ele esta: `Imagem 3 de 8` diz. O texto alternativo
/// e do quadro grande, que e onde a imagem de fato aparece.
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
            // A moldura marca a aberta. **A diferenca nao e so de cor**: a
            // espessura muda tambem, e `Semantics.selected` a diz por extenso
            // (SC 1.4.1).
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

// ---------------------------------------------------------------------------
// O resto da pagina
// ---------------------------------------------------------------------------

/// Titulo, parceiro, categoria e preco.
///
/// O preco sai da MESMA `ItemDaLoja.linhaDoPreco` que o cartao usa: valor,
/// rotulo e data num bloco so, simultaneamente, sem interacao (criterio 15 da
/// BICHUS-185). Uma segunda formatacao aqui seria um segundo lugar para o
/// numero aparecer sem a data.
class _Cabecalho extends StatelessWidget {
  const _Cabecalho({required this.item});

  final ItemDaLoja item;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final linhaDoPreco = item.linhaDoPreco;
    // A CLASSIFICACAO, e nao mais so a categoria. O detalhe do produto nasceu
    // no lote anterior de 17/10, quando a categoria era um `enum` do binario e
    // `item.categoria` era o proprio valor com `rotulo`. Na mescla dos dois
    // niveis ela virou DADO: `categoria` passou a ser o CODIGO (`String?`) e o
    // rotulo chega na resposta. `linhaDaClassificacao` e o mesmo texto que o
    // cartao da vitrine mostra -- "Racoes · Racao seca" --, para a pilula do
    // detalhe e a linha da lista nunca divergirem.
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
        // A categoria, quando ha. Pilula neutra: a palavra e a informacao, e
        // nenhuma cor diz nada.
        if (classificacao != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _PilulaDaCategoria(rotulo: classificacao),
        ],
        if (linhaDoPreco != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          Text(
            linhaDoPreco,
            style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
          ),
        ] else if (item.estadoDoPreco == EstadoDoPreco.vencido) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          Text(
            VitrineDaLoja.precoNaoConfirmado,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
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
///
/// Sem `maxLines` e sem botao de expandir: ver o cabecalho de [TelaDoProduto].
/// A quebra de linha vai no valor e `Text` a desenha -- nada aqui troca `\n`
/// por espaco, porque a area de texto do painel existe para a pessoa escrever
/// em paragrafos.
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

// ---------------------------------------------------------------------------
// As pecas de pagina, no mesmo vocabulario do detalhe do encontro
// ---------------------------------------------------------------------------

/// A margem lateral da pagina: a mesma de `rede/encontro_da_rede.dart`.
///
/// A galeria fica FORA dela de proposito -- imagem de detalhe vai de borda a
/// borda nas duas telas, e e por isso que a margem e um embrulho e nao um
/// `padding` do `ListView`.
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
///
/// **Anunciado**: sem o `Semantics` o leitor de tela encontraria uma pagina
/// sem nada enquanto a chamada esta em voo.
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
