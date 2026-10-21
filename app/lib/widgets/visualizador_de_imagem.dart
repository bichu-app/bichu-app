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
class VisualizadorDeImagem extends StatelessWidget {
  const VisualizadorDeImagem({
    required this.url,
    super.key,
    this.textoAlternativo,
  });

  /// A imagem. Nao e anulavel: quem nao tem URL nao abre esta tela -- ver
  /// [abrir], que e por onde se entra.
  final String url;

  /// O texto alternativo, quando o contrato traz um.
  ///
  /// Nulo tira a imagem da arvore de acessibilidade em vez de inventar um nome:
  /// imagem com nome acessivel vazio e imagem que o leitor de tela anuncia sem
  /// dizer nada. O rotulo da TELA nao depende dele e vive em [tituloDaTela].
  final String? textoAlternativo;

  /// O nome acessivel da tela.
  static const String tituloDaTela = 'Foto ampliada';

  /// O rotulo do botao de fechar.
  static const String rotuloDeFechar = 'Fechar';

  /// O quanto a pinca amplia, no maximo.
  ///
  /// 4x e o teto porque a derivada grande tem 1280 px numa tela de ~400 dp:
  /// passando de uns 3,2x o que cresce e o pixel, e nao a informacao.
  static const double ampliacaoMaxima = 4;

  /// O quanto o toque duplo amplia.
  static const double ampliacaoDoToqueDuplo = 2.5;

  /// Abre a imagem ampliada, **ou nao faz nada quando nao ha imagem**.
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
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => VisualizadorDeImagem(
          url: endereco,
          textoAlternativo: textoAlternativo,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final alternativo = textoAlternativo;

    final imagem = Image.network(
      url,
      fit: BoxFit.contain,
      semanticLabel: alternativo,
      excludeFromSemantics: alternativo == null,
      // SEM `cacheWidth`: ver o cabecalho da classe. Ampliar o que foi
      // decodificado no tamanho da tela amplia o borrao.
      errorBuilder: (_, _, _) => _FalhaDaImagem(),
    );

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
            Positioned.fill(
              child: _ImagemAmpliavel(child: imagem),
            ),
            Positioned(
              top: BichuEspaco.e3,
              left: BichuEspaco.e3,
              child: SafeArea(
                child: _BotaoDeFechar(
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
        // A imagem ampliada pode ser arrastada para fora da moldura e volta
        // sozinha; sem isto, ampliar numa borda prende o canto fora da tela.
        boundaryMargin: const EdgeInsets.all(double.infinity),
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
class _BotaoDeFechar extends StatelessWidget {
  const _BotaoDeFechar({required this.aoTocar});

  final VoidCallback aoTocar;

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
        tooltip: VisualizadorDeImagem.rotuloDeFechar,
        icon: const Icon(Icons.close),
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
