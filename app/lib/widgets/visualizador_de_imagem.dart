import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A imagem aberta em tela cheia, com ampliacao.
///
/// ## Ele NAO existia, e a ausencia foi medida antes de escrever
///
/// O pedido do cliente de 20/10/2026 e literal: *"na pagina de detalhes do
/// evento, a foto principal deve ser clicada e ampliada."* A primeira coisa
/// conferida foi se ja havia visualizador para reusar, porque duplicar lista
/// ja custou caro nesta casa. **Nao havia**, e a varredura foi por propriedade
/// e nao por nome: em `app/lib` e `app/test` nao ha `InteractiveViewer`, nao ha
/// `photo_view` no `pubspec.yaml`, nao ha `Dialog.fullscreen`, nao ha `Hero` e
/// nao ha um `onDoubleTap` sequer.
///
/// `widgets/carrossel_de_fotos.dart` **nao serve**, e a razao nao e preguica:
/// ele e o carrossel de um CARTAO de listagem -- `PageView` de altura fixa,
/// `BoxFit.cover`, sem ampliacao, sem tela cheia -- e o tipo da lista dele e
/// `ImagemDoProduto`, da Loja. Reusa-lo aqui exigiria generaliza-lo e mudar a
/// vitrine, que e de outra esteira. Ele mostra fotos; ele nao as AMPLIA.
///
/// Curiosidade que o levantamento achou e que vale registrar: a derivada
/// `card` 1024 x 1024 da vitrine do usuario esta descrita em
/// `src/modules/media/domain/derivadas.ts` como *"a foto ABERTA, que e a unica
/// que a pessoa olha grande"* -- e **nenhuma celula da grade de
/// `perfil/vitrine_de_fotos.dart` tem `onTap`**. A derivada da foto aberta
/// existe desde antes da tela que a abre. Este widget e o lugar onde ela passa
/// a ser usada, quando aquela grade quiser.
///
/// ## Por isso ele mora em `widgets/`, e nao dentro da ficha do evento
///
/// Sao SETE as superficies de foto deste app, e a primeira a pedir ampliacao
/// foi a capa do evento. Escrever o visualizador dentro de
/// `telas/rede/encontro_da_rede.dart` garantiria a segunda copia no dia em que
/// a vitrine, o Mural ou a foto do pet pedissem o mesmo gesto. A assinatura
/// aqui e deliberadamente POBRE -- uma URL e um texto alternativo -- para que
/// nenhuma das outras seis precise de um modelo de dados especifico.
///
/// ## Tres jeitos de fechar, e nenhum deles e so o arrasto
///
/// *"a pessoa nao pode ficar presa na imagem ampliada"*:
///
/// 1. **O botao `Fechar`, sempre visivel**, 48 dp (`BichuAlvoDeToque.min`).
///    Ele e a alternativa de ponteiro unico que a 2.5.1 do WCAG exige, pelo
///    mesmo raciocinio que poe setas no carrossel: ampliar por pinca e gesto
///    de caminho, e quem nao consegue pincar nao pode ficar sem saida.
/// 2. **O voltar do sistema**, de graca por ser uma rota empilhada
///    (`MaterialPageRoute`) e nao um `Overlay` pintado a mao.
/// 3. **O toque no fundo**, fora da imagem.
///
/// **Nao ha arrastar-para-baixo-e-fechar, e a ausencia e deliberada**: depois
/// de ampliar, o arrasto vertical e como se enquadra a imagem dentro do
/// `InteractiveViewer`. Um arrasto que as vezes move a foto e as vezes fecha a
/// tela e um gesto que a pessoa nao consegue prever -- e o unico jeito de
/// descobrir qual dos dois vai acontecer e tentar.
///
/// ## A ampliacao decodifica INTEIRO, e e a diferenca que importa
///
/// A capa da ficha pede `cacheWidth` pela largura pintada
/// (`pecas_da_rede.dart`), e ali isso esta certo: o cartao nao ganha nada
/// decodificando mais do que desenha. **Aqui seria o defeito.** Ampliar uma
/// imagem decodificada no tamanho da tela nao revela detalhe nenhum: amplia o
/// borrao. Entao este widget nao passa `cacheWidth`, de proposito, e o que
/// chega e a derivada inteira -- `cover_banner_url` tem 1280 px e a tela
/// desenha uns 400 dp, o que da 3,2x de folga real para a pinca.
///
/// O app **nunca recebe o original** (`derivadas.ts`: o leitor de midia
/// publica so abre a classe `publico` e so aceita chave com forma de
/// derivada). Entao o que se amplia e a derivada, e e o maximo honesto que
/// existe deste lado.
/// ## O CARROSSEL ENTROU EM 22/10/2026, E ELE TEM DOIS PEDIDOS E TRES DONOS
///
/// A prosa acima (`Ele NAO existia`) descreve o nascimento deste arquivo e
/// continua valendo. O que mudou e que ele deixou de abrir UMA imagem.
///
/// Dois pedidos do cliente no mesmo dia, e os dois sao o mesmo mecanismo:
///
/// - na pagina do profissional: *"coloque link na imagem principal para
///   aumentar e tornar um carrosel de imagens, caso tenha mais do que uma foto
///   cadastrada"*;
/// - na vitrine de fotos do perfil: *"as fotos tem que ser clicaveis para
///   expandir/aumentar, e ter o botao para andar para um lado e para a outra
///   foto"*.
///
/// **Por isso a assinatura e de LISTA e tem indice inicial**, e nao porque
/// lista e mais geral: a vitrine e uma grade de ate nove celulas, e abrir a
/// setima na primeira faria a pessoa paginar seis vezes para ver o que ela
/// acabou de tocar. [abrir] continua existindo com uma URL so, para a capa do
/// encontro nao precisar aprender lista.
///
/// Os tres donos, hoje:
///
/// 1. `telas/rede/encontro_da_rede.dart` -- a capa do encontro, uma foto;
/// 2. `telas/perto/pagina_do_local.dart` -- a foto do profissional, que o
///    contrato entrega uma por entrada (`DirectoryEntryDetail.photo_url`);
/// 3. `telas/perfil/vitrine_de_fotos.dart` -- a vitrine, ate nove.
///
/// **A rede de protecao mora em `test/widgets/visualizador_de_imagem_test.dart`
/// e nao na tela de nenhum dos tres**, porque uma isca que vivesse na pagina do
/// profissional nao protegeria a vitrine -- e e a vitrine que vai ligar a
/// navegacao depois.
class VisualizadorDeImagem extends StatelessWidget {
  const VisualizadorDeImagem({
    required this.urls,
    super.key,
    this.textoAlternativo,
    this.inicial = 0,
  }) : assert(urls.length > 0, 'visualizador sem imagem nenhuma');

  /// As imagens, na ordem em que a tela as recebeu. **Nunca vazia**: quem nao
  /// tem URL nao abre esta tela -- ver [abrir] e [abrirVarias], que sao por
  /// onde se entra.
  ///
  /// **Com UMA a arvore e a de sempre**, sem `PageView`, sem contador e sem
  /// setas: um carrossel de um elemento promete navegacao e nao tem para onde
  /// ir, e a pessoa que arrasta e nao ve nada acontecer conclui que a tela
  /// travou. A regra e de `widgets/carrossel_de_fotos.dart`, que a escreveu
  /// primeiro.
  final List<String> urls;

  /// Em qual de [urls] a tela abre. **Fora da faixa cai na primeira** em vez de
  /// estourar: quem chama e uma grade que pode ter mudado de tamanho entre a
  /// pintura e o toque, e tela vermelha no gesto mais comum da vitrine seria o
  /// pior desfecho possivel.
  final int inicial;

  /// O texto alternativo, quando o contrato traz um.
  ///
  /// Nulo tira a imagem da arvore de acessibilidade em vez de inventar um nome:
  /// imagem com nome acessivel vazio e imagem que o leitor de tela anuncia sem
  /// dizer nada. O rotulo da TELA nao depende dele e vive em [tituloDaTela].
  ///
  /// **Um para o conjunto, e nao um por foto.** Nenhuma das tres superficies
  /// tem `alt_text` por item NESTA tela: o encontro tem um para a capa, o
  /// profissional nao tem nenhum no contrato, e a vitrine passa o da foto que
  /// a pessoa tocou. No dia em que uma delas quiser um por item, este campo
  /// vira lista e `_QuadroDaFoto` le o indice -- hoje seria uma lista de um
  /// elemento repetido, que e pior que um campo so.
  final String? textoAlternativo;

  /// O nome acessivel da tela.
  static const String tituloDaTela = 'Foto ampliada';

  /// O rotulo do botao de fechar.
  static const String rotuloDeFechar = 'Fechar';

  /// Os rotulos das setas, **que so existem com mais de uma foto**.
  ///
  /// Elas sao a alternativa de ponteiro unico do SC 2.5.1 para o arrasto, pela
  /// mesma razao que o toque duplo e a alternativa da pinca: arrasto e gesto de
  /// caminho. O cliente pediu as duas com essas palavras -- *"o botao para
  /// andar para um lado e para a outra foto"*.
  static const String rotuloDeAnterior = 'Foto anterior';
  static const String rotuloDeProxima = 'Próxima foto';

  /// `1 de 3`. **Escrito, e nao pontinhos**: ponto aceso num carrossel de nove
  /// fotos nao diz em qual delas a pessoa esta.
  static String contador({required int atual, required int total}) =>
      '${atual + 1} de $total';

  /// O quanto a pinca amplia, no maximo.
  ///
  /// 4x e o teto porque a derivada grande tem 1280 px numa tela de ~400 dp:
  /// passando de uns 3,2x o que cresce e o pixel, e nao a informacao.
  static const double ampliacaoMaxima = 4;

  /// O quanto o toque duplo amplia.
  static const double ampliacaoDoToqueDuplo = 2.5;

  /// Abre UMA imagem ampliada, **ou nao faz nada quando nao ha imagem**.
  ///
  /// A guarda mora aqui, e nao em cada chamador, porque o defeito que ela
  /// impede e o que o cliente nao pode ver: ficha sem foto com alvo de toque
  /// que abre uma tela preta. `url` nulo ou vazio nao empilha rota nenhuma.
  ///
  /// Quem desenha o alvo de toque **tambem** tem de conferir a URL -- um
  /// `InkWell` que nao faz nada ainda pinta respingo e ainda se anuncia como
  /// botao para o leitor de tela. Esta guarda e o cinto, nao o freio.
  static Future<void> abrir(
    BuildContext context, {
    required String? url,
    String? textoAlternativo,
  }) {
    final endereco = url;
    if (endereco == null || endereco.isEmpty) return Future<void>.value();
    return abrirVarias(
      context,
      urls: <String>[endereco],
      textoAlternativo: textoAlternativo,
    );
  }

  /// Abre VARIAS, e e a MESMA tela: uma vira ampliacao, mais de uma vira
  /// carrossel ampliavel.
  ///
  /// As duas metades do pedido sao a mesma tela porque o gesto da pessoa e o
  /// mesmo -- tocar na foto --, e sao duas porque *"mais do que uma"* e uma
  /// condicao que o CHAMADOR mede, e nao uma tela nova.
  ///
  /// **URL em branco sai da lista, e as boas ficam.** `Image.network('')`
  /// LANCA, e branco e exatamente o que chega de uma derivada ainda em
  /// processamento: uma dessas no meio da vitrine nao pode apagar as outras
  /// oito nem derrubar a tela. Sobrando nenhuma, nenhuma rota e empilhada --
  /// mesma guarda de [abrir], pelo mesmo motivo.
  static Future<void> abrirVarias(
    BuildContext context, {
    required List<String> urls,
    String? textoAlternativo,
    int inicial = 0,
  }) {
    final limpas =
        urls.where((u) => u.trim().isNotEmpty).toList(growable: false);
    if (limpas.isEmpty) return Future<void>.value();
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => VisualizadorDeImagem(
          urls: limpas,
          textoAlternativo: textoAlternativo,
          inicial: inicial,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Scaffold(
      // O fundo e `scrim` e nao `surfaceInverse`: `scrim` e escuro nos DOIS
      // temas (0xA31C1B19 no claro, 0xB8000000 no escuro), e `surfaceInverse`
      // INVERTE -- no tema escuro ele e claro, e a foto apareceria sobre um
      // fundo branco de madrugada.
      backgroundColor: cores.scrim,
      body: Semantics(
        label: tituloDaTela,
        child: Stack(
          children: <Widget>[
            // O toque no FUNDO fecha (saida numero 3). Ele fica atras da
            // imagem: `Stack` entrega o gesto ao alvo mais interno, entao
            // tocar na foto para ampliar nao fecha a tela.
            Positioned.fill(
              child: GestureDetector(
                onTap: () => Navigator.of(context).maybePop(),
                // `opaque`, senao o `GestureDetector` de area vazia nao recebe
                // toque nenhum e a saida numero 3 nao existiria.
                behavior: HitTestBehavior.opaque,
                // O fundo nao se anuncia: quem usa leitor de tela fecha pelo
                // botao, que tem nome. Um alvo de tela cheia sem rotulo
                // anunciado como botao e pior que nenhum.
                child: const ExcludeSemantics(child: SizedBox.expand()),
              ),
            ),
            // UMA foto: exatamente a arvore de antes de 22/10/2026 -- nenhum
            // `PageView`, nenhum contador, nenhuma seta.
            if (urls.length == 1)
              Positioned.fill(
                child: _ImagemAmpliavel(
                  child: _QuadroDaFoto(
                    url: urls.single,
                    textoAlternativo: textoAlternativo,
                  ),
                ),
              )
            else
              Positioned.fill(
                child: _CarrosselAmpliavel(
                  urls: urls,
                  textoAlternativo: textoAlternativo,
                  // Fora da faixa cai na primeira: ver [inicial].
                  inicial: (inicial < 0 || inicial > urls.length - 1)
                      ? 0
                      : inicial,
                ),
              ),
            Positioned(
              top: BichuEspaco.e3,
              left: BichuEspaco.e3,
              child: SafeArea(
                child: _BotaoSobreMidia(
                  icone: Icons.close,
                  rotulo: rotuloDeFechar,
                  aoTocar: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A imagem pedida ao servidor, **sem `cacheWidth`**.
///
/// Extraida do `build` em 22/10/2026 porque o carrossel passou a precisar dela
/// por pagina: a mesma `Image.network` escrita em dois lugares diverge na
/// primeira edicao, e o que ela carrega de deliberado -- a AUSENCIA de
/// `cacheWidth` -- e justamente o que se perde numa copia.
class _QuadroDaFoto extends StatelessWidget {
  const _QuadroDaFoto({required this.url, required this.textoAlternativo});

  final String url;
  final String? textoAlternativo;

  @override
  Widget build(BuildContext context) {
    final alternativo = textoAlternativo;
    return Image.network(
      url,
      fit: BoxFit.contain,
      semanticLabel: alternativo,
      excludeFromSemantics: alternativo == null,
      // SEM `cacheWidth`: ver o cabecalho de `VisualizadorDeImagem`. Ampliar o
      // que foi decodificado no tamanho da tela amplia o borrao.
      errorBuilder: (_, _, _) => _FalhaDaImagem(),
    );
  }
}

/// Mais de uma foto: paginas ampliaveis, com contador e setas.
///
/// ## `PageView.builder`, e nunca `PageView` com os filhos prontos
///
/// A razao e a de `widgets/carrossel_de_fotos.dart`, medida la em 17/10/2026: o
/// construtor monta a pagina quando ela entra em cena, e um `Image.network` que
/// nao foi montado **nao abre requisicao**. Abrir o visualizador baixa UMA
/// foto, e nao a galeria inteira.
///
/// **Aqui o peso e MAIOR que no cartao da vitrine da Loja**, e e por isso que a
/// construcao sob demanda importa mais e nao menos: estas paginas decodificam a
/// derivada INTEIRA de proposito (sem `cacheWidth`), e a vitrine do perfil tem
/// ate nove fotos. `allowImplicitScrolling` fica no padrao (`false`) pelo mesmo
/// motivo -- ligado, ele constroi a pagina vizinha antes de alguem pedir.
///
/// ## Por que nao e `CarrosselDeFotos`, e isso foi MEDIDO antes de escrever
///
/// `widgets/carrossel_de_fotos.dart` **nao serve**, e a conferencia foi por
/// propriedade e nao por nome: ele e o carrossel de um CARTAO de listagem --
/// `PageView` de altura FIXA recebida por parametro, `BoxFit.cover`, sem
/// `InteractiveViewer`, sem toque duplo, sem tela cheia -- e a lista dele e
/// tipada em `ImagemDoProduto`, da Loja. Reusa-lo aqui exigiria generaliza-lo e
/// mudar a vitrine da Loja, que e de outra esteira e tem desenho aprovado.
/// **Ele mostra fotos; ele nao as AMPLIA**, e a ampliacao e o pedido.
///
/// O que foi reusado dele e a REGRA, nao o codigo: uma foto nao e carrossel, o
/// contador e escrito, e a construcao e sob demanda.
class _CarrosselAmpliavel extends StatefulWidget {
  const _CarrosselAmpliavel({
    required this.urls,
    required this.textoAlternativo,
    required this.inicial,
  });

  final List<String> urls;
  final String? textoAlternativo;
  final int inicial;

  @override
  State<_CarrosselAmpliavel> createState() => _CarrosselAmpliavelState();
}

class _CarrosselAmpliavelState extends State<_CarrosselAmpliavel> {
  late final PageController _quadros =
      PageController(initialPage: widget.inicial);
  late int _atual = widget.inicial;

  @override
  void dispose() {
    _quadros.dispose();
    super.dispose();
  }

  void _ir(int para) {
    if (para < 0 || para > widget.urls.length - 1) return;
    _quadros.animateToPage(
      para,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.urls.length;
    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: PageView.builder(
            controller: _quadros,
            itemCount: total,
            onPageChanged: (i) => setState(() => _atual = i),
            itemBuilder: (_, i) => _ImagemAmpliavel(
              child: _QuadroDaFoto(
                url: widget.urls[i],
                textoAlternativo: widget.textoAlternativo,
              ),
            ),
          ),
        ),
        // Os controles embaixo, e o `Fechar` em cima: eles nao disputam canto.
        Positioned(
          left: BichuEspaco.e3,
          right: BichuEspaco.e3,
          bottom: BichuEspaco.e3,
          child: SafeArea(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                _BotaoSobreMidia(
                  icone: Icons.chevron_left,
                  rotulo: VisualizadorDeImagem.rotuloDeAnterior,
                  // **Nulo na ponta, e nao um toque que nao faz nada.** Botao
                  // que nao responde e indistinguivel de toque que nao chegou,
                  // e a pessoa toca de novo; `onPressed: null` e o que o leitor
                  // de tela anuncia como desabilitado.
                  aoTocar: _atual == 0 ? null : () => _ir(_atual - 1),
                ),
                _Contador(
                  texto: VisualizadorDeImagem.contador(
                    atual: _atual,
                    total: total,
                  ),
                ),
                _BotaoSobreMidia(
                  icone: Icons.chevron_right,
                  rotulo: VisualizadorDeImagem.rotuloDeProxima,
                  aoTocar: _atual == total - 1 ? null : () => _ir(_atual + 1),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// `1 de 3`, sobre tarja de `surface`.
///
/// **A tarja nao e enfeite**: o contraste de um texto solto sobre foto depende
/// da foto, e e o mesmo raciocinio do `Botao sobre midia` ao lado.
class _Contador extends StatelessWidget {
  const _Contador({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e3,
          vertical: BichuEspaco.e1,
        ),
        child: Text(
          texto,
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(color: cores.textPrimary),
        ),
      ),
    );
  }
}

/// A imagem dentro do `InteractiveViewer`, com toque duplo.
///
/// `InteractiveViewer` e do framework: nao entra pacote novo por causa desta
/// tela, pela mesma razao que o carrossel nao trouxe `carousel_slider`.
///
/// **O toque duplo nao e enfeite**, e a segunda metade da 2.5.1: a pinca e
/// gesto de caminho e precisa de alternativa de ponteiro unico. O botao
/// `Fechar` cobre a SAIDA; o toque duplo cobre a AMPLIACAO.
class _ImagemAmpliavel extends StatefulWidget {
  const _ImagemAmpliavel({required this.child});

  final Widget child;

  @override
  State<_ImagemAmpliavel> createState() => _ImagemAmpliavelState();
}

class _ImagemAmpliavelState extends State<_ImagemAmpliavel> {
  final TransformationController _enquadramento = TransformationController();

  @override
  void dispose() {
    _enquadramento.dispose();
    super.dispose();
  }

  /// Alterna entre inteira e ampliada, no ponto em que a pessoa tocou.
  ///
  /// Ampliar no CENTRO da tela quando a pessoa tocou no canto move para longe
  /// exatamente o que ela quis ver de perto -- e e o canto que importa, porque
  /// o motivo do pedido e informacao cortada FORA do centro.
  /// A folga do comparador de escala.
  ///
  /// `getMaxScaleOnAxis()` devolve ponto flutuante, e comparar com `> 1` seco
  /// chamaria de "ampliada" uma imagem que a pinca devolveu a 1,0000000001 --
  /// e o toque duplo seguinte faria o contrario do que a pessoa esperava.
  static const double _folgaDaEscala = 0.001;

  void _alternar(TapDownDetails toque) {
    final ampliado =
        _enquadramento.value.getMaxScaleOnAxis() > 1 + _folgaDaEscala;
    if (ampliado) {
      _enquadramento.value = Matrix4.identity();
      return;
    }
    const fator = VisualizadorDeImagem.ampliacaoDoToqueDuplo;
    final ponto = toque.localPosition;
    _enquadramento.value = Matrix4.identity()
      ..translateByDouble(-ponto.dx * (fator - 1), -ponto.dy * (fator - 1), 0, 1)
      ..scaleByDouble(fator, fator, fator, 1);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTapDown: _alternar,
      // `onDoubleTap` vazio e obrigatorio: sem ele o reconhecedor de toque
      // duplo nao se inscreve na arena e `onDoubleTapDown` nunca chega.
      onDoubleTap: () {},
      child: InteractiveViewer(
        transformationController: _enquadramento,
        minScale: 1,
        maxScale: VisualizadorDeImagem.ampliacaoMaxima,
        // **A IMAGEM FICA FIXA** (cliente, 26/10/2026: *"tem um bug quando
        // amplia a foto dos eventos e dos estabelecimentos, o usuario
        // consegue arrastar a imagem para varias posicoes, a imagem deve
        // ficar fixa e so mudar de foto caso tenha mais do que uma
        // cadastrada"*).
        //
        // **O QUE ESTAVA ESCRITO AQUI ERA FALSO, e foi medido.** O comentario
        // anterior dizia que a imagem arrastada *"volta sozinha"*;
        // `InteractiveViewer` **nao tem volta elastica**. Com `panEnabled` no
        // padrao (`true`) e moldura infinita, um arrasto de UM dedo na foto
        // nem ampliada a estacionava onde a pessoa largou, e ela ficava torta
        // ate alguem fechar a tela. Medido na arvore antes do conserto: a foto
        // saia de `Offset(0, 0)` e parava em `Offset(-118.9, -131.0)`.
        //
        // **O CONSERTO E A MOLDURA, E NAO DESLIGAR O ARRASTO** (cliente,
        // 26/10/2026, respondendo a pergunta que a primeira versao deixou
        // aberta: *"o arraste limitada as bordas"*).
        //
        // A primeira tentativa desligou o arrasto (`panEnabled: false`) e foi
        // longe demais: ela tirava tambem o passeio DENTRO da foto ampliada,
        // que e para que serve ampliar. O que ele quer sao as duas coisas de
        // uma vez, e `boundaryMargin` sozinho entrega as duas:
        //
        //   * **sem ampliar** a foto cabe exatamente na moldura, entao nao ha
        //     folga para onde arrastar e o gesto nao desloca NADA -- que e a
        //     queixa original dele, palavra por palavra;
        //   * **ampliada** ha folga, o dedo passeia, e o deslocamento PARA na
        //     borda em vez de continuar: nunca sobra vazio na tela e a foto
        //     nunca foge para fora.
        //
        // **E A MOLDURA E O PADRAO DO `InteractiveViewer`** -- `EdgeInsets`
        // zero significa limites do tamanho e da posicao exatos do filho. O
        // que estava escrito era `EdgeInsets.all(double.infinity)`, moldura
        // infinita, e era isso o defeito: sem limite nenhum, qualquer arrasto
        // levava a foto para qualquer lugar e ela NAO voltava. O comentario
        // que acompanhava a linha dizia que ela *"volta sozinha"*, e essa
        // frase era falsa: `InteractiveViewer` nao tem volta elastica.
        //
        // `panEnabled` fica EXPLICITO em `true` mesmo sendo o padrao: ele foi
        // `false` por um dia nesta linha, e quem vier atras precisa ver que
        // estar ligado e decisao do cliente e nao distracao. Quem segura a
        // imagem e a moldura.
        panEnabled: true,
        boundaryMargin: EdgeInsets.zero,
        clipBehavior: Clip.none,
        child: widget.child,
      ),
    );
  }
}

/// `Botao sobre midia` (design system 24.12.1 e 24.12.6): 48 dp, fundo
/// `surface`, sombra propria, para o contraste nao depender da foto.
///
/// **A receita e a mesma do `Voltar` da capa** em
/// `telas/rede/encontro_da_rede.dart`, e a repeticao esta registrada de
/// proposito em vez de escondida: unificar as duas num `BotaoSobreMidia`
/// publico mexeria num controle que o cliente ja aprovou naquela tela, e isso
/// e uma mudanca de desenho e nao de codigo -- passa pelo protitipo antes. No
/// dia em que passar, as duas saem daqui.
///
/// **EM 22/10/2026 ELE DEIXOU DE SER SO O `Fechar`.** O carrossel trouxe duas
/// setas, e elas sao o MESMO controle: 48 dp, redondo, sobre `surface`, para o
/// contraste nao depender da foto. Tres copias desta receita dentro do mesmo
/// arquivo divergiriam na primeira edicao -- entao ele recebeu `icone` e
/// `rotulo` e passou a se chamar pelo que e.
///
/// [aoTocar] e **anulavel de proposito**: nas pontas do carrossel a seta nao
/// tem para onde ir, e `onPressed: null` e o que o leitor de tela anuncia como
/// desabilitado. Um botao que recebe toque e nao faz nada e indistinguivel de
/// um toque que nao chegou, e a pessoa toca de novo.
class _BotaoSobreMidia extends StatelessWidget {
  const _BotaoSobreMidia({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  });

  final IconData icone;
  final String rotulo;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        shape: BoxShape.circle,
        boxShadow: escuro ? null : BichuSombra.md,
        border: escuro
            ? Border.all(color: cores.outline, width: BichuBorda.hairline)
            : null,
      ),
      child: IconButton(
        onPressed: aoTocar,
        // Vira o nome acessivel: `IconButton` sem ele e anunciado como
        // "botao", e nada mais (SC 4.1.2).
        tooltip: rotulo,
        icon: Icon(icone),
        constraints: const BoxConstraints(
          minWidth: BichuAlvoDeToque.min,
          minHeight: BichuAlvoDeToque.min,
        ),
        color: cores.textPrimary,
        focusColor: cores.focusRing,
      ),
    );
  }
}

/// A imagem que nao carregou.
///
/// **Com palavra, e nao um retangulo cinza.** Esta tela foi aberta por um toque
/// deliberado: quem tocou esta olhando, e um quadrado vazio nao diz se a tela
/// errada abriu ou se a foto nao veio. O `Fechar` continua la.
///
/// **O aviso vem sobre `surface`, e nao solto no fundo**, pelo mesmo motivo do
/// `Botao sobre midia`: o contraste nao pode depender do fundo. Nao ha token
/// que seja claro nos DOIS temas -- `textOnInverse` e claro no tema claro e
/// ESCURO no escuro, porque ele e o par de `surfaceInverse`, que inverte --, e
/// usa-lo direto sobre o `scrim` (escuro nos dois) daria texto escuro em fundo
/// escuro de madrugada. Com a tarja de `surface`, quem responde pelo par e
/// `textPrimary`, que e o par certo dela em qualquer tema.
class _FalhaDaImagem extends StatelessWidget {
  const _FalhaDaImagem();

  static const String aviso = 'Não conseguimos carregar a foto.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BichuEspaco.e4,
              vertical: BichuEspaco.e3,
            ),
            child: Text(
              aviso,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cores.textPrimary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
