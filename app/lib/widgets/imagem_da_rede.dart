import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma imagem que vem do servidor, **desenhada com disciplina de memoria**.
///
/// Irma de `PreviaDaFoto`: aquela desenha o arquivo do aparelho, esta desenha a
/// derivada que o contrato manda. As duas existem pela mesma razao -- uma
/// politica de decodificacao num lugar so, em vez de uma por tela.
///
/// ## Por que ela nao e `Image.network` solto na tela
///
/// Tres coisas tem de valer nas tres pinturas de imagem de servidor que este
/// app tem (a logo do profissional na lista do `Perto`, a faixa do local e a
/// foto do proprio usuario em `Meus dados`), e nenhuma delas e automatica:
///
/// 1. **`cacheWidth` pelo tamanho que a tela PINTA, nunca pelo do arquivo.**
///    O `ui.Image` em memoria custa `largura x altura x 4` bytes da imagem
///    DECODIFICADA, e nao os bytes do JPEG. Sem `cacheWidth`, uma derivada
///    `banner` de 1280 x 720 custa 3,52 MiB mesmo desenhada num cartao de 56
///    dp -- e vinte cartoes assim sao os 9,8 MB de primeira pintura que a
///    vitrine da `Loja` chegou a ter.
/// 2. **`errorBuilder`, sempre.** Imagem que falha nao pode derrubar a tela
///    nem deixar buraco: a derivada pode nao existir ainda, o leitor de midia
///    pode estar fora, a rede do celular pode cair no meio. O lugar da imagem
///    continua la, com o simbolo que diz que havia uma imagem ali.
/// 3. **Ausencia e decisao de QUEM CHAMA.** Esta peca recebe uma `url` nao
///    anulavel de proposito: `Image.network('')` **lanca**, e tratar vazio
///    aqui dentro esconderia de quem chama que existe um estado de ausencia a
///    desenhar. Quem chama le `urlDeImagem` (em `api/modelos_diretorio.dart`),
///    recebe nulo e decide o que fazer com o nulo.
///
/// ## A semantica e do chamador, e `null` significa DECORATIVA
///
/// [descricao] nula embrulha a imagem em `ExcludeSemantics`. Isso existe para
/// o cartao da lista do `Perto`: ali a logo fica **ao lado do nome**, o nome ja
/// e o rotulo da entrada, e uma logo rotulada faria o leitor de tela dizer o
/// nome duas vezes na mesma parada de foco.
class ImagemDaRede extends StatelessWidget {
  const ImagemDaRede({
    required this.url,
    required this.descricao,
    super.key,
    this.largura,
    this.proporcao = 1,
    this.raio = BichuRaio.md,
    this.simboloDeFalha = Icons.image_not_supported_outlined,
  });

  /// A URL da **derivada**. Nao anulavel e nao vazia: ver o item 3 acima.
  final String url;

  /// O rotulo do leitor de tela, ou **nulo para imagem decorativa**.
  final String? descricao;

  /// A largura pintada, em dp. Nula ocupa a largura que o pai oferecer -- que
  /// e o caso da faixa de borda a borda do detalhe do local.
  final double? largura;

  /// Largura dividida pela altura. `1` e quadrado (logo, retrato); `16 / 9` e
  /// a faixa.
  final double proporcao;

  final double raio;

  /// O simbolo do estado de falha. Trocavel porque o retrato de uma pessoa
  /// falhando pede outro desenho que uma fachada falhando.
  final IconData simboloDeFalha;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    // Fora do `LayoutBuilder`: o fator de pixel e do aparelho, nao do espaco
    // disponivel, e ler `MediaQuery` dentro do construtor de layout refaria a
    // dependencia a cada medida.
    final fatorDePixel = MediaQuery.devicePixelRatioOf(context);

    return LayoutBuilder(
      builder: (context, limites) {
        // `maxWidth` infinito acontece dentro de linha sem largura definida.
        // Ali nao ha numero para pedir ao decodificador, e desenhar sem
        // `cacheWidth` seria exatamente o que esta peca existe para impedir --
        // entao ela nao desenha.
        final double? larguraPintada =
            largura ?? (limites.maxWidth.isFinite ? limites.maxWidth : null);
        if (larguraPintada == null || larguraPintada <= 0) {
          return const SizedBox.shrink();
        }
        final alturaPintada = larguraPintada / proporcao;

        final moldura = BoxDecoration(
          // O fundo afundado faz as vezes de lugar reservado enquanto os bytes
          // chegam: sem ele a tela daria um salto de layout quando a imagem
          // aparecesse.
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(raio),
        );

        final conteudo = Container(
          width: larguraPintada,
          height: alturaPintada,
          clipBehavior: Clip.antiAlias,
          decoration: moldura,
          child: Image.network(
            url,
            width: larguraPintada,
            height: alturaPintada,
            fit: BoxFit.cover,
            // **O numero que decide o custo em memoria.** Em pixeis do
            // aparelho, pela largura que a tela pinta.
            cacheWidth: (larguraPintada * fatorDePixel).round(),
            errorBuilder: (context, erro, pilha) => Center(
              child: Icon(
                simboloDeFalha,
                size: BichuEspaco.e6,
                color: cores.textMuted,
              ),
            ),
          ),
        );

        // Decorativa: nenhuma parada de foco, nenhum anuncio. Com rotulo: uma
        // parada, anunciada como imagem.
        return descricao == null
            ? ExcludeSemantics(child: conteudo)
            : Semantics(image: true, label: descricao, child: conteudo);
      },
    );
  }
}
