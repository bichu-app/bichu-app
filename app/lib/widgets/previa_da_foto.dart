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
        child: escolhida == null
            ? _texto(vazio!, textos, cores)
            : LayoutBuilder(
                builder: (context, limites) {
                  // A largura em PIXEIS do aparelho, que e a unica que importa
                  // para o decodificador. `maxWidth` infinito acontece dentro
                  // de linha sem largura definida; ali nao ha numero para
                  // pedir, e o padrao do Flutter fica.
                  final largura = limites.maxWidth.isFinite
                      ? (limites.maxWidth *
                              MediaQuery.devicePixelRatioOf(context))
                          .round()
                      : null;
                  return Image.file(
                    File(escolhida.caminho),
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: altura,
                    cacheWidth: largura,
                    // `Image.file` ja respeita a rotacao do EXIF ao decodificar
                    // (o codec do sistema aplica a orientacao), entao nao ha
                    // giro a aplicar aqui. Se um aparelho aparecer com a foto
                    // deitada, o lugar do conserto e este -- e nao cada tela.
                    errorBuilder: (context, erro, pilha) =>
                        _texto(naoAbriu, textos, cores),
                  );
                },
              ),
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
