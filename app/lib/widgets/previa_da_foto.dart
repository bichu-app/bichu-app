import 'dart:io';

import 'package:flutter/material.dart';

import '../dispositivo/camera_e_galeria.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A foto que a pessoa acabou de escolher, **desenhada**.
///
/// ## Por que ela mora em `widgets/`, e nao dentro de cada tela
///
/// Desenhar um arquivo do aparelho pede `dart:io`, e o portao de diretivas
/// (`porta_nao_contornada_test.dart`) proibe `dart:io` dentro de `lib/telas`
/// -- com razao: tela que abre arquivo e tela que fala com o aparelho por fora
/// da porta. Era por isso que o registro de achado escrevia "Foto escolhida."
/// e o cadastro de pet escrevia **o caminho do arquivo**: duas telas, duas
/// respostas, e nenhuma delas a imagem.
///
/// Uma peca so, fora de `lib/telas`, resolve as duas sem furar o portao. Quem
/// acrescentar uma terceira tela com foto usa esta, e nao inventa a terceira
/// resposta.
///
/// ## Nada aqui depende de envio
///
/// E pre-visualizacao do arquivo **local**. No registro de achado nada sobe
/// hoje, e mesmo assim a foto aparece: amarrar a previa ao envio deixaria
/// aquela tela com o quadro vazio para sempre.
///
/// ## O peso em memoria e tratado, e nao ignorado
///
/// Foto de celular tem dezenas de megapixels, e o app nao tem cache de imagem
/// em disco. `cacheWidth` faz o decodificador entregar **a largura que a tela
/// vai pintar**, e nao a do arquivo: o `ui.Image` em memoria passa a custar a
/// area do quadro, e nao a da camera. Sem isso, um aparelho modesto engasga
/// desenhando um retangulo de 300 dp.
class PreviaDaFoto extends StatelessWidget {
  const PreviaDaFoto({
    required this.foto,
    required this.descricao,
    super.key,
    this.altura = 300,
    this.vazio,
    this.pontoFocal = Alignment.center,
    this.aoNaoAbrir,
    this.comInvolucroProprio = true,
  });

  /// A foto no aparelho, ou nulo quando ainda nao ha uma.
  final FotoLocal? foto;

  /// O rotulo que o leitor de tela anuncia. **Obrigatorio**: trocar texto por
  /// imagem sem rotulo tira a informacao de quem nao ve a imagem.
  final String descricao;

  final double altura;

  /// O que escrever quando nao ha foto. Nulo nao desenha nada -- que e o caso
  /// do registro de achado, onde a foto e opcional e o quadro vazio seria
  /// espaco cobrado sem informacao.
  final String? vazio;

  // -------------------------------------------------------------------------
  // OS TRES PARAMETROS DA ONDA 4 (21/10/2026)
  // -------------------------------------------------------------------------
  //
  // Eles existem porque a edicao da foto do pet era a NONA tela com foto
  // escolhida, e ela abria `dart:io` por conta propria dentro de
  // `lib/telas` -- furando o portao que esta peca existe para nao ser furado.
  // O cliente recusou criar uma segunda peca ("voce nao esta criando um
  // sistema de upload por cada recurso ne? Voce deveria estar reaproveitando
  // esse codigo"), entao a peca foi ESTENDIDA.
  //
  // **O PADRAO DOS TRES E O COMPORTAMENTO DE HOJE, e isso e requisito e nao
  // cortesia:** as OITO telas que ja usavam esta peca nao mudam uma linha.
  // `previa_da_foto_test.dart` tem isca que reprova se um padrao deixar de
  // reproduzir o que a peca fazia antes destes parametros.

  /// O ponto focal do recorte.
  ///
  /// `Alignment.center` e o que as oito telas sempre tiveram.
  ///
  /// A edicao do pet pede `Alignment(0, -1 / 3)` -- o terco superior, onde
  /// fica a cabeca do animal na foto tipica de tutor. **E ela o pede nos DOIS
  /// ramos que desenham imagem**, a escolhida e a derivada: ponto focal que
  /// difere entre os dois CAUSA o salto que ele existe para evitar, porque a
  /// foto se reposiciona no instante em que a derivada chega.
  final Alignment pontoFocal;

  /// O que desenhar quando o arquivo existe e **nao abre**.
  ///
  /// Nulo mantem o texto [naoAbriu], que e o comportamento das oito.
  ///
  /// Existe para quem desenha dentro de uma moldura de estados: ali um
  /// paragrafo de texto no lugar da foto nao cabe, e a reserva certa e o
  /// proprio estado vazio daquela moldura.
  final WidgetBuilder? aoNaoAbrir;

  /// Desenha o proprio quadro (fundo afundado, borda fina, raio `lg`).
  ///
  /// `true` e o que as oito telas sempre tiveram, e por isso e o padrao.
  ///
  /// `false` devolve **so a imagem**, para quem ja tem moldura em volta:
  /// `Moldura` tem fundo, raio ELIPTICO proprio e tres estados, e o quadro
  /// desta peca por dentro dela desenharia uma segunda borda e cantos de outro
  /// raio. **O `Semantics` sai junto**: quem poe a moldura e quem rotula, e dois
  /// nos sobre a mesma imagem sao duas paradas de foco para uma coisa so.
  final bool comInvolucroProprio;

  /// O que mostrar quando o arquivo existe e **nao abre**.
  ///
  /// Acontece de verdade: o formato do aparelho pode nao ter decodificador
  /// nesta versao do sistema (HEIC em Android antigo e o caso conhecido). O
  /// quadro vazio seria pior que o caminho do arquivo que esta peca veio
  /// substituir -- a pessoa escolheu uma foto e a tela ficaria muda.
  static const String naoAbriu = 'Não deu para mostrar esta foto aqui.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = foto;

    if (escolhida == null && vazio == null) return const SizedBox.shrink();

    final Widget conteudo = escolhida == null
        ? _texto(vazio!, textos, cores)
        : LayoutBuilder(
            builder: (context, limites) {
              // A largura em PIXEIS do aparelho, que e a unica que importa
              // para o decodificador. `maxWidth` infinito acontece dentro
              // de linha sem largura definida; ali nao ha numero para
              // pedir, e o padrao do Flutter fica.
              final largura = limites.maxWidth.isFinite
                  ? (limites.maxWidth * MediaQuery.devicePixelRatioOf(context))
                      .round()
                  : null;
              return Image.file(
                File(escolhida.caminho),
                fit: BoxFit.cover,
                width: double.infinity,
                // `altura` so manda quando ESTA peca desenha o quadro. Sem
                // involucro proprio quem dita a altura e a moldura de fora, e
                // um numero daqui brigaria com ela.
                height: comInvolucroProprio ? altura : null,
                alignment: pontoFocal,
                cacheWidth: largura,
                // `Image.file` ja respeita a rotacao do EXIF ao decodificar
                // (o codec do sistema aplica a orientacao), entao nao ha
                // giro a aplicar aqui. Se um aparelho aparecer com a foto
                // deitada, o lugar do conserto e este -- e nao cada tela.
                errorBuilder: (context, erro, pilha) =>
                    aoNaoAbrir?.call(context) ?? _texto(naoAbriu, textos, cores),
              );
            },
          );

    // SEM INVOLUCRO: so a imagem, para quem ja tem moldura em volta. O
    // `Semantics` sai junto -- ver `comInvolucroProprio`.
    if (!comInvolucroProprio) return conteudo;

    return Semantics(
      image: escolhida != null,
      label: escolhida == null ? vazio : descricao,
      child: Container(
        height: altura,
        alignment: Alignment.center,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: conteudo,
      ),
    );
  }

  Widget _texto(String texto, TextTheme textos, BichuCores cores) => Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: Text(
          texto,
          textAlign: TextAlign.center,
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
      );
}
