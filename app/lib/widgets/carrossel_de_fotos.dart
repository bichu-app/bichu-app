import 'package:flutter/material.dart';

import '../api/modelos_loja.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O carrossel de fotos de um cartao de listagem.
///
/// ## Com UMA foto ele nao e um carrossel, e isso e a regra
///
/// Uma foto: `Image` e mais nada. Nenhum indicador, nenhum `PageView`,
/// nenhum gesto, nenhum botao de avancar. Um carrossel de um elemento promete
/// navegacao e nao tem para onde ir -- a pessoa arrasta, nada acontece, e ela
/// conclui que a tela travou. Zero fotos: nada, nem moldura vazia; quem chama
/// decide se o espaco existe.
///
/// ## Arrastar NAO pode abrir o que o toque abre
///
/// Este widget vive **dentro** do `InkWell` do cartao, e ali ha dois gestos
/// sobre a mesma area: o arrasto horizontal daqui e o toque do cartao. Quem
/// resolve e a arena de gestos do Flutter, e ela resolve do lado certo por
/// construcao: o `PageView` inscreve um `HorizontalDragGestureRecognizer`, o
/// `InkWell` inscreve um `TapGestureRecognizer`, e **o reconhecedor de toque
/// desiste no instante em que o dedo anda mais que `kTouchSlop`**. Arrastar
/// pagina a foto e nao dispara o toque; tocar sem arrastar nao e disputado pelo
/// `PageView`, e o toque sobe para o cartao e abre o detalhe.
///
/// Isto **nao e teoria**: `test/widgets/carrossel_de_fotos_test.dart` arrasta
/// sobre o carrossel dentro de um `InkWell` e reprova se o `onTap` do cartao
/// tiver sido chamado.
///
/// O que NAO esta sob este widget e o botao `Abrir na <parceiro>`: ele e irmao,
/// nao filho, e nenhum gesto daqui o alcanca.
///
/// ## Carrega SOB DEMANDA, e o peso e o motivo
///
/// `PageView.builder`, e nunca `PageView` com a lista de filhos pronta: o
/// construtor monta a pagina quando ela entra em cena, e um `Image.network` que
/// nao foi montado **nao abre requisicao**. A primeira pintura de um cartao
/// baixa UMA imagem, igual a antes de existir galeria.
///
/// O numero que justifica isto, medido em 17/10/2026: a derivada de produto e
/// uma so (`card`, 1024 px, teto de 500 KB) e nao ha miniatura de produto no
/// contrato. Uma pagina cheia da vitrine sao 20 cartoes; baixar as 8 fotos de
/// cada um pediria **ate 78 MB**, contra **ate 9,8 MB** da primeira pintura de
/// hoje. `allowImplicitScrolling` fica no padrao (`false`) exatamente por isso:
/// ligado, ele constroi a pagina vizinha antes de alguem pedir e dobra o
/// trafego de quem so olhou a capa.
///
/// ## Nenhum pacote novo
///
/// `PageView` e `PageController` sao do framework. Nao ha `carousel_slider`
/// nem `smooth_page_indicator` em `pubspec.yaml`, e nao ha por que haver:
/// rolagem horizontal paginada e indicador curto sao duas dezenas de linhas, e
/// cada dependencia nova e uma superficie a mais no APK e na esteira.
class CarrosselDeFotos extends StatefulWidget {
  const CarrosselDeFotos({
    required this.fotos,
    required this.titulo,
    required this.altura,
    super.key,
  });

  /// As fotos, na ordem do painel. A primeira e a capa.
  final List<ImagemDoProduto> fotos;

  /// O titulo do produto, para a reserva do texto alternativo.
  ///
  /// **Nao e decoracao.** `StoreItemImage.alt_text` e anulavel, e imagem com
  /// nome acessivel vazio e imagem que o leitor de tela anuncia sem dizer nada.
  /// A reserva mora em [ImagemDoProduto.nomeDaImagem], que recebe este titulo.
  final String titulo;

  /// A altura da area de foto, em dp. Quem chama decide: o cartao da vitrine
  /// desenha 160.
  final double altura;

  @override
  State<CarrosselDeFotos> createState() => _CarrosselDeFotosState();
}

class _CarrosselDeFotosState extends State<CarrosselDeFotos> {
  final PageController _quadros = PageController();
  int _atual = 0;

  @override
  void dispose() {
    _quadros.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(CarrosselDeFotos anterior) {
    super.didUpdateWidget(anterior);
    // A lista trocou debaixo do controlador (a vitrine recarregou com outro
    // filtro): o indice volta para a capa. Sem isto, um cartao que estava na
    // foto 6 e recarregou com 2 fotos mostraria indicador apontando para uma
    // pagina que nao existe mais.
    if (widget.fotos.length != anterior.fotos.length && _atual != 0) {
      _atual = 0;
      if (_quadros.hasClients) _quadros.jumpToPage(0);
    }
  }

  void _ir(int destino) {
    final limite = widget.fotos.length - 1;
    if (destino < 0 || destino > limite) return;
    // `animateToPage`, e nao `jumpToPage`: o movimento e o que mostra a quem
    // tocou no botao que a foto ANDOU, e nao que ela foi substituida.
    _quadros.animateToPage(
      destino,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final fotos = widget.fotos;
    if (fotos.isEmpty) return const SizedBox.shrink();

    // UMA foto: nao e carrossel. Ver o cabecalho da classe.
    if (fotos.length == 1) {
      return _Quadro(
        foto: fotos.first,
        titulo: widget.titulo,
        altura: widget.altura,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SizedBox(
          height: widget.altura,
          child: PageView.builder(
            controller: _quadros,
            itemCount: fotos.length,
            onPageChanged: (indice) => setState(() => _atual = indice),
            // `builder`, e o `itemBuilder` so e chamado para a pagina em cena:
            // e o que faz o cartao baixar uma imagem e nao oito.
            itemBuilder: (contexto, indice) => _Quadro(
              foto: fotos[indice],
              titulo: widget.titulo,
              altura: widget.altura,
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e2),
        _Controles(
          atual: _atual,
          total: fotos.length,
          aoAnterior: _atual == 0 ? null : () => _ir(_atual - 1),
          aoProxima: _atual == fotos.length - 1 ? null : () => _ir(_atual + 1),
        ),
      ],
    );
  }
}

/// Uma foto do carrossel.
class _Quadro extends StatelessWidget {
  const _Quadro({
    required this.foto,
    required this.titulo,
    required this.altura,
  });

  final ImagemDoProduto foto;
  final String titulo;
  final double altura;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.md),
      child: Image.network(
        foto.url,
        height: altura,
        width: double.infinity,
        fit: BoxFit.cover,
        // O texto do painel quando ha, `Foto de <titulo>` quando nao ha. A
        // escolha e do modelo, e nao daqui.
        semanticLabel: foto.nomeDaImagem(titulo),
        // Imagem que nao carregou nao vira caixa de excecao no meio de uma
        // lista: o quadro fica vazio e o resto do cartao continua legivel.
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    );
  }
}

/// O indicador e a navegacao sem arrasto.
///
/// **Os botoes nao sao enfeite: sao a exigencia 2.5.1 do WCAG.** Paginar por
/// arrasto e um gesto de caminho, e todo gesto de caminho precisa de
/// alternativa de ponteiro unico. Sem eles, quem nao consegue arrastar --
/// tremor, uso com uma mao, ponteiro de cabeca, teclado externo -- nao alcanca
/// a segunda foto de jeito nenhum.
///
/// Eles tambem **consomem o proprio toque**: o teste de acerto entrega o gesto
/// ao alvo mais interno, e `IconButton` e um alvo. Tocar em `>` nao abre o
/// detalhe do produto, do mesmo jeito que tocar em `Abrir na <parceiro>` nao
/// abre.
///
/// O indicador e CURTO porque o cartao e estreito: pontos ate cinco fotos,
/// `3 de 8` acima disso. Oito pontos num cartao de telefone viram uma listinha
/// que ninguem conta.
class _Controles extends StatelessWidget {
  const _Controles({
    required this.atual,
    required this.total,
    required this.aoAnterior,
    required this.aoProxima,
  });

  final int atual;
  final int total;
  final VoidCallback? aoAnterior;
  final VoidCallback? aoProxima;

  /// Ate cinco fotos o indicador e de pontos.
  static const int _maximoDePontos = 5;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final contador = '${atual + 1} de $total';

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        _Seta(
          icone: Icons.chevron_left,
          rotulo: 'Foto anterior',
          aoTocar: aoAnterior,
        ),
        // **UM no semantico para o indicador, e os pontos ficam de fora.**
        // Cinco pontos decorativos seriam cinco anuncios sem palavra; o que o
        // leitor de tela diz e "3 de 8", que e a informacao.
        Semantics(
          label: 'Foto $contador',
          // **`container: true` nao e zelo: sem ele o rotulo nao existe.** Os
          // pontos sao `Container` decorativo e nao produzem no semantico
          // nenhum; um `Semantics` com rotulo e sem no proprio nao tem onde se
          // pendurar, e o indicador sai MUDO para o leitor de tela -- o
          // defeito que o teste deste widget pegou.
          container: true,
          excludeSemantics: true,
          child: total <= _maximoDePontos
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    for (var i = 0; i < total; i++)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            // **Dois sinais, e nunca so a cor** (11.3, SC
                            // 1.4.1): o ponto da foto em cena e cheio e os
                            // outros sao contornados.
                            color: i == atual ? cores.primary : cores.surface,
                            border: Border.all(
                              color: i == atual ? cores.primary : cores.outline,
                              width: BichuBorda.hairline,
                            ),
                          ),
                        ),
                      ),
                  ],
                )
              : Text(
                  contador,
                  style: textos.labelMedium?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
        ),
        _Seta(
          icone: Icons.chevron_right,
          rotulo: 'Próxima foto',
          aoTocar: aoProxima,
        ),
      ],
    );
  }
}

/// Uma seta do carrossel. Alvo de 48 dp (`BichuAlvoDeToque.min`), com nome.
class _Seta extends StatelessWidget {
  const _Seta({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  });

  final IconData icone;
  final String rotulo;

  /// Nulo na ponta da lista: o botao fica **desabilitado e visivel**, e nao
  /// escondido. Controle que some muda a largura do bloco a cada pagina, e o
  /// indicador do meio pularia de lugar a cada arrasto.
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return IconButton(
      onPressed: aoTocar,
      // Vira o nome acessivel do controle: `IconButton` sem ele e anunciado
      // como "botao", e nada mais (SC 4.1.2).
      tooltip: rotulo,
      icon: Icon(icone),
      iconSize: 24,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.min,
        minHeight: BichuAlvoDeToque.min,
      ),
      padding: EdgeInsets.zero,
      color: cores.textPrimary,
      disabledColor: cores.onDisabled,
      focusColor: cores.focusRing,
      style: IconButton.styleFrom(
        minimumSize: const Size.square(BichuAlvoDeToque.min),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
