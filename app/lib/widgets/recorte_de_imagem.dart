/// O recorte e o reposicionamento da imagem, **em todo ponto de upload do
/// app**.
library;

import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../dispositivo/camera_e_galeria.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'alca_de_arraste.dart';
import 'botao_primario.dart';

/// A forma da janela de recorte, por destino.
@immutable
class FormatoDoRecorte {
  const FormatoDoRecorte({required this.aspecto, required this.circular});

  /// O aspecto a partir das dimensoes da derivada do servidor.
  const FormatoDoRecorte.daDerivada({
    required int largura,
    required int altura,
    bool circular = false,
  }) : this(aspecto: largura / altura, circular: circular);

  /// A janela segue o aspecto do PROPRIO arquivo -- nada e cortado em zoom 1.
  const FormatoDoRecorte.doProprioArquivo() : aspecto = null, circular = false;

  /// Largura dividida pela altura, ou nulo para seguir o arquivo.
  final double? aspecto;

  /// A janela e desenhada como circulo.
  final bool circular;

  /// `DERIVADAS_DA_FOTO_DE_PET`: 1024 x 1126.
  static const FormatoDoRecorte fotoDePet = FormatoDoRecorte.daDerivada(
    largura: 1024,
    altura: 1126,
  );

  /// `DERIVADAS_DA_FOTO_DE_USUARIO`: 512 x 512.
  static const FormatoDoRecorte fotoDeUsuario = FormatoDoRecorte.daDerivada(
    largura: 512,
    altura: 512,
  );

  /// `DERIVADAS_DA_VITRINE_DO_USUARIO`: 1024 x 1024.
  static const FormatoDoRecorte vitrineDoUsuario = FormatoDoRecorte.daDerivada(
    largura: 1024,
    altura: 1024,
  );

  /// `DERIVADAS_DA_PUBLICACAO`: 1024 x 1024.
  static const FormatoDoRecorte publicacaoDoMural = FormatoDoRecorte.daDerivada(
    largura: 1024,
    altura: 1024,
  );

  /// `DERIVADAS_DO_ENCONTRO`, variante `banner`: 1280 x 720.
  static const FormatoDoRecorte capaDoEncontro = FormatoDoRecorte.daDerivada(
    largura: 1280,
    altura: 720,
  );

  /// `DERIVADAS_DA_LOGO`: 512 x 512.
  static const FormatoDoRecorte logoDaIndicacao = FormatoDoRecorte.daDerivada(
    largura: 512,
    altura: 512,
  );

  /// `DERIVADA_DA_FOTO_DO_ACHADO`: 1024 x 1126.
  static const FormatoDoRecorte fotoDoAchado = FormatoDoRecorte.daDerivada(
    largura: 1024,
    altura: 1126,
  );
}

/// O enquadramento, como GEOMETRIA PURA.
@immutable
class EnquadramentoDaFoto {
  const EnquadramentoDaFoto({
    required this.larguraDoArquivo,
    required this.alturaDoArquivo,
    required this.janela,
    this.zoom = 1,
    this.deslocamento = Offset.zero,
  });

  /// O tamanho do arquivo, em pixels dele.
  final int larguraDoArquivo;
  final int alturaDoArquivo;

  /// A janela de recorte, em pixels logicos do palco.
  final Size janela;

  /// 1 e a imagem cobrindo a janela.
  final double zoom;

  /// O centro da imagem em relacao ao centro da janela, em pixels do palco.
  final Offset deslocamento;

  static const double zoomMaximo = 4;

  /// A escala que faz a imagem **cobrir** a janela com [zoom] 1.
  double get escalaBase => math.max(
    janela.width / larguraDoArquivo,
    janela.height / alturaDoArquivo,
  );

  /// Pixels do palco por pixel do arquivo.
  double get escala => escalaBase * zoom;

  /// O tamanho com que a imagem e desenhada no palco.
  Size get imagemDesenhada =>
      Size(larguraDoArquivo * escala, alturaDoArquivo * escala);

  /// Quanto o deslocamento pode crescer antes de a janela mostrar vazio.
  Offset get deslocamentoMaximo => Offset(
    math.max(0, (imagemDesenhada.width - janela.width) / 2),
    math.max(0, (imagemDesenhada.height - janela.height) / 2),
  );

  /// Este enquadramento com o deslocamento **grudado** nas bordas da imagem.
  EnquadramentoDaFoto get grudado {
    final limite = deslocamentoMaximo;
    return copiaCom(
      deslocamento: Offset(
        deslocamento.dx.clamp(-limite.dx, limite.dx),
        deslocamento.dy.clamp(-limite.dy, limite.dy),
      ),
    );
  }

  EnquadramentoDaFoto arrastado(Offset delta) =>
      copiaCom(deslocamento: deslocamento + delta).grudado;

  EnquadramentoDaFoto comZoom(double novo) =>
      copiaCom(zoom: novo.clamp(1.0, zoomMaximo)).grudado;

  EnquadramentoDaFoto get reiniciado =>
      copiaCom(zoom: 1, deslocamento: Offset.zero).grudado;

  EnquadramentoDaFoto copiaCom({
    Size? janela,
    double? zoom,
    Offset? deslocamento,
  }) => EnquadramentoDaFoto(
    larguraDoArquivo: larguraDoArquivo,
    alturaDoArquivo: alturaDoArquivo,
    janela: janela ?? this.janela,
    zoom: zoom ?? this.zoom,
    deslocamento: deslocamento ?? this.deslocamento,
  );

  /// **O retangulo que vai no envio**, em pixels do arquivo.
  RecorteDaFoto get recorte {
    final k = escala;
    final x = larguraDoArquivo / 2 - (janela.width / 2 + deslocamento.dx) / k;
    final y = alturaDoArquivo / 2 - (janela.height / 2 + deslocamento.dy) / k;
    return RecorteDaFoto(
      x: x.round(),
      y: y.round(),
      largura: (janela.width / k).round(),
      altura: (janela.height / k).round(),
    ).grudadoEm(larguraDoArquivo, alturaDoArquivo);
  }

  /// **O recorte que o app fazia ANTES deste recurso**: a janela no CENTRO do
  /// arquivo, sem ninguem ter escolhido nada.
  RecorteDaFoto get recorteDoCentro {
    final aspecto = janela.width / janela.height;
    var largura = larguraDoArquivo;
    var altura = (largura / aspecto).round();
    if (altura > alturaDoArquivo) {
      altura = alturaDoArquivo;
      largura = (altura * aspecto).round();
    }
    return RecorteDaFoto(
      x: ((larguraDoArquivo - largura) / 2).round(),
      y: ((alturaDoArquivo - altura) / 2).round(),
      largura: largura,
      altura: altura,
    ).grudadoEm(larguraDoArquivo, alturaDoArquivo);
  }
}

/// Os textos da folha. Fora da arvore de widget para o caso poder procura-los
/// pelo nome, como o resto do app faz.
abstract final class TextosDoRecorte {
  static const String titulo = 'Ajuste a imagem';
  static const String apoio =
      'Arraste para posicionar e use o zoom para aproximar. '
      'O que ficar dentro da moldura é o que vai ser enviado.';
  static const String usar = 'Usar esta imagem';
  static const String cancelar = 'Cancelar';

  /// O rotulo do `X` do canto.
  static const String fechar = 'Fechar';
  static const String reiniciar = 'Voltar ao enquadramento inicial';
  static const String zoom = 'Zoom';
  static const String palco =
      'Área de ajuste da imagem. Arraste para posicionar. '
      'Com o teclado, use as setas para mover e as teclas mais e menos para o zoom.';

  /// O que a folha diz quando o arquivo **nao decodifica**.
  static const String naoAbriu =
      'Não deu para abrir esta imagem para ajustar; ela vai como está.';
}

/// Abre a folha de recorte e devolve a foto **ajustada**.
Future<FotoLocal?> ajustarAFoto(
  BuildContext context, {
  required CameraEGaleria camera,
  required FotoLocal foto,
  required FormatoDoRecorte formato,
  String? titulo,
}) async {
  final imagem = await abrirAImagemParaRecortar(foto);
  if (!context.mounted) return foto;
  if (imagem == null) {
    debugPrint('BICHU recorte: ${TextosDoRecorte.naoAbriu} ${foto.caminho}');
    return foto;
  }

  final RecorteDaFoto? escolhido = await showModalBottomSheet<RecorteDaFoto>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    enableDrag: false,
    showDragHandle: false,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => FolhaDeRecorte(
      imagem: imagem,
      formato: formato,
      titulo: titulo ?? TextosDoRecorte.titulo,
    ),
  );

  if (escolhido == null) return null;
  final ajustada = await camera.recortarFoto(foto, escolhido);
  return ajustada ?? foto;
}

/// A imagem pronta para desenhar, mais o tamanho **do arquivo**.
@immutable
class ImagemParaRecortar {
  const ImagemParaRecortar({
    required this.imagem,
    required this.larguraDoArquivo,
    required this.alturaDoArquivo,
  });

  final ui.Image imagem;
  final int larguraDoArquivo;
  final int alturaDoArquivo;
}

/// O lado maior com que a imagem e decodificada **para desenhar**.
const int ladoMaiorParaDesenhar = 1440;

/// Decodifica o arquivo para desenhar, e devolve junto o tamanho **do
/// arquivo**.
Future<ImagemParaRecortar?> abrirAImagemParaRecortar(FotoLocal foto) async {
  if (!File(foto.caminho).existsSync()) {
    debugPrint(
      'BICHU recorte: "${foto.caminho}" nao esta no aparelho; nada a ajustar.',
    );
    return null;
  }
  try {
    final buffer = await ui.ImmutableBuffer.fromFilePath(foto.caminho);
    final descritor = await ui.ImageDescriptor.encoded(buffer);
    final larguraDoArquivo = descritor.width;
    final alturaDoArquivo = descritor.height;
    if (larguraDoArquivo < 1 || alturaDoArquivo < 1) {
      descritor.dispose();
      return null;
    }

    final maior = math.max(larguraDoArquivo, alturaDoArquivo);
    final fator = maior > ladoMaiorParaDesenhar
        ? ladoMaiorParaDesenhar / maior
        : 1.0;
    final codec = await descritor.instantiateCodec(
      targetWidth: math.max(1, (larguraDoArquivo * fator).round()),
      targetHeight: math.max(1, (alturaDoArquivo * fator).round()),
    );
    final quadro = await codec.getNextFrame();
    codec.dispose();
    descritor.dispose();

    return ImagemParaRecortar(
      imagem: quadro.image,
      larguraDoArquivo: larguraDoArquivo,
      alturaDoArquivo: alturaDoArquivo,
    );
  } on Object catch (erro) {
    debugPrint('BICHU recorte: nao abriu "${foto.caminho}". $erro');
    return null;
  }
}

/// A chave do palco: a area arrastavel da folha.
const Key chaveDoPalcoDoRecorte = ValueKey<String>('palco-do-recorte');

/// A folha de recorte: o palco, o zoom e as duas acoes.
class FolhaDeRecorte extends StatefulWidget {
  const FolhaDeRecorte({
    required this.imagem,
    required this.formato,
    required this.titulo,
    super.key,
  });

  final ImagemParaRecortar imagem;
  final FormatoDoRecorte formato;
  final String titulo;

  /// A folga, em dp, que o palco deixa em volta da janela.
  static const double folgaDoPalco = BichuEspaco.e6;

  /// O passo do teclado, em dp.
  static const double passoDoTeclado = BichuEspaco.e2;

  /// Quanto da altura da tela a janela de recorte pode ocupar.
  static const double fracaoMaximaDaJanela = 0.36;

  /// Quanto da altura da tela a FOLHA ocupa.
  static const double fracaoDaFolha = 0.95;

  @override
  State<FolhaDeRecorte> createState() => _EstadoDaFolhaDeRecorte();
}

class _EstadoDaFolhaDeRecorte extends State<FolhaDeRecorte> {
  EnquadramentoDaFoto? _enquadramento;

  /// **A folha e a dona da textura de exibicao.** Ver a nota em [ajustarAFoto]:
  /// liberar a imagem quando o `pop` devolve o valor estoura na animacao de
  /// saida, que ainda pinta.
  @override
  void dispose() {
    widget.imagem.imagem.dispose();
    super.dispose();
  }

  /// O zoom no inicio do gesto de pinca.
  double _zoomNoInicioDoGesto = 1;

  double get _aspectoDaJanela =>
      widget.formato.aspecto ??
      widget.imagem.larguraDoArquivo / widget.imagem.alturaDoArquivo;

  /// A janela, para uma largura de palco.
  Size _janelaPara(double larguraDisponivel, double alturaMaxima) {
    var largura = math.max(1.0, larguraDisponivel);
    var altura = largura / _aspectoDaJanela;
    if (altura > alturaMaxima) {
      altura = alturaMaxima;
      largura = altura * _aspectoDaJanela;
    }
    return Size(largura, altura);
  }

  void _ajustarAJanela(Size janela) {
    final atual = _enquadramento;
    if (atual != null && atual.janela == janela) return;
    _enquadramento =
        (atual ??
                EnquadramentoDaFoto(
                  larguraDoArquivo: widget.imagem.larguraDoArquivo,
                  alturaDoArquivo: widget.imagem.alturaDoArquivo,
                  janela: janela,
                ))
            .copiaCom(janela: janela)
            .grudado;
  }

  KeyEventResult _teclado(FocusNode _, KeyEvent evento) {
    if (evento is! KeyDownEvent && evento is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    final atual = _enquadramento;
    if (atual == null) return KeyEventResult.ignored;

    final comShift = HardwareKeyboard.instance.isShiftPressed;
    final passo = FolhaDeRecorte.passoDoTeclado * (comShift ? 3 : 1);
    final tecla = evento.logicalKey;

    final Offset? delta = switch (tecla) {
      LogicalKeyboardKey.arrowLeft => Offset(-passo, 0),
      LogicalKeyboardKey.arrowRight => Offset(passo, 0),
      LogicalKeyboardKey.arrowUp => Offset(0, -passo),
      LogicalKeyboardKey.arrowDown => Offset(0, passo),
      _ => null,
    };
    if (delta != null) {
      setState(() => _enquadramento = atual.arrastado(delta));
      return KeyEventResult.handled;
    }

    final bool aproxima =
        tecla == LogicalKeyboardKey.add ||
        tecla == LogicalKeyboardKey.equal ||
        tecla == LogicalKeyboardKey.numpadAdd;
    final bool afasta =
        tecla == LogicalKeyboardKey.minus ||
        tecla == LogicalKeyboardKey.numpadSubtract;
    if (aproxima || afasta) {
      setState(
        () => _enquadramento = atual.comZoom(
          atual.zoom * (aproxima ? 1.2 : 1 / 1.2),
        ),
      );
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final tipografia = Theme.of(context).textTheme;
    final tela = MediaQuery.sizeOf(context);

    final recorteDeBaixo = MediaQuery.viewPaddingOf(context).bottom;

    final alturaMaximaDaJanela = math.max(
      120.0,
      tela.height * FolhaDeRecorte.fracaoMaximaDaJanela,
    );

    return SizedBox(
      height: tela.height * FolhaDeRecorte.fracaoDaFolha,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: LayoutBuilder(
          builder: (contexto, limites) {
            final larguraDisponivel = limites.maxWidth.isFinite
                ? limites.maxWidth - FolhaDeRecorte.folgaDoPalco * 2
                : 280.0;
            final janela = _janelaPara(larguraDisponivel, alturaMaximaDaJanela);
            _ajustarAJanela(janela);
            final enquadramento = _enquadramento!;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const AlcaDeArraste(),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          const SizedBox(height: BichuEspaco.e1),
                          Semantics(
                            header: true,
                            child: Text(
                              widget.titulo,
                              style: tipografia.titleMedium,
                            ),
                          ),
                          const SizedBox(height: BichuEspaco.e1),
                          Text(
                            TextosDoRecorte.apoio,
                            style: tipografia.bodySmall?.copyWith(
                              color: cores.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                      tooltip: TextosDoRecorte.fechar,
                    ),
                  ],
                ),
                const SizedBox(height: BichuEspaco.e2),
                Expanded(
                  child: Semantics(
                    label: TextosDoRecorte.palco,
                    container: true,
                    child: Focus(
                      autofocus: true,
                      onKeyEvent: _teclado,
                      child: GestureDetector(
                        onScaleStart: (_) =>
                            _zoomNoInicioDoGesto = enquadramento.zoom,
                        onScaleUpdate: (detalhe) => setState(() {
                          final comZoom = _enquadramento!.comZoom(
                            _zoomNoInicioDoGesto * detalhe.scale,
                          );
                          _enquadramento = comZoom.arrastado(
                            detalhe.focalPointDelta,
                          );
                        }),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(BichuRaio.lg),
                          child: SizedBox.expand(
                            child: CustomPaint(
                              key: chaveDoPalcoDoRecorte,
                              painter: _PintorDoRecorte(
                                imagem: widget.imagem.imagem,
                                enquadramento: enquadramento,
                                circular: widget.formato.circular,
                                fundo: cores.surfaceSunken,
                                veu: cores.scrim,
                                linha: cores.textOnInverse,
                                contorno: cores.surfaceInverse,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: BichuEspaco.e2),
                Row(
                  children: <Widget>[
                    Text(
                      TextosDoRecorte.zoom,
                      style: tipografia.labelMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                    Expanded(
                      child: Slider(
                        value: enquadramento.zoom,
                        min: 1,
                        max: EnquadramentoDaFoto.zoomMaximo,
                        label: TextosDoRecorte.zoom,
                        onChanged: (valor) => setState(
                          () => _enquadramento = enquadramento.comZoom(valor),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => setState(
                        () => _enquadramento = enquadramento.reiniciado,
                      ),
                      icon: const Icon(Icons.restart_alt),
                      tooltip: TextosDoRecorte.reiniciar,
                    ),
                  ],
                ),
                const SizedBox(height: BichuEspaco.e2),
                BotaoPrimario(
                  rotulo: TextosDoRecorte.usar,
                  critico: true,
                  aoTocar: () =>
                      Navigator.of(context).pop(enquadramento.recorte),
                ),
                const SizedBox(height: BichuEspaco.e2),
                BotaoSecundario(
                  rotulo: TextosDoRecorte.cancelar,
                  aoTocar: () => Navigator.of(context).pop(),
                ),
                SizedBox(height: BichuEspaco.e4 + recorteDeBaixo),
              ],
            );
          },
        ),
      ),
    );
  }
}


/// Pinta a imagem, o veu do que fica FORA da janela, as guias de tercos e a
/// linha da janela.
class _PintorDoRecorte extends CustomPainter {
  _PintorDoRecorte({
    required this.imagem,
    required this.enquadramento,
    required this.circular,
    required this.fundo,
    required this.veu,
    required this.linha,
    required this.contorno,
  });

  final ui.Image imagem;
  final EnquadramentoDaFoto enquadramento;
  final bool circular;
  final Color fundo;
  final Color veu;
  final Color linha;

  /// O tom ESCURO da moldura, por baixo do claro.
  final Color contorno;

  @override
  void paint(Canvas canvas, Size tamanho) {
    canvas.drawRect(Offset.zero & tamanho, Paint()..color = fundo);

    final janela = enquadramento.janela;
    final quadro = Rect.fromCenter(
      center: Offset(tamanho.width / 2, tamanho.height / 2),
      width: janela.width,
      height: janela.height,
    );

    final desenhada = enquadramento.imagemDesenhada;
    final destino = Rect.fromCenter(
      center: quadro.center + enquadramento.deslocamento,
      width: desenhada.width,
      height: desenhada.height,
    );
    canvas.drawImageRect(
      imagem,
      Rect.fromLTWH(0, 0, imagem.width.toDouble(), imagem.height.toDouble()),
      destino,
      Paint()..filterQuality = FilterQuality.medium,
    );

    final formaDaJanela = Path()
      ..addRRect(
        circular
            ? RRect.fromRectAndRadius(
                quadro,
                Radius.circular(quadro.shortestSide / 2),
              )
            : RRect.fromRectAndRadius(
                quadro,
                const Radius.circular(BichuRaio.sm),
              ),
      );
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Offset.zero & tamanho),
        formaDaJanela,
      ),
      Paint()..color = veu,
    );

    canvas.save();
    canvas.clipPath(formaDaJanela);
    final tinta = Paint()
      ..color = linha.withValues(alpha: 0.45)
      ..strokeWidth = BichuBorda.hairline;
    for (var i = 1; i <= 2; i++) {
      final x = quadro.left + quadro.width * i / 3;
      final y = quadro.top + quadro.height * i / 3;
      canvas.drawLine(Offset(x, quadro.top), Offset(x, quadro.bottom), tinta);
      canvas.drawLine(Offset(quadro.left, y), Offset(quadro.right, y), tinta);
    }
    canvas.restore();

    canvas.drawPath(
      formaDaJanela,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = BichuBorda.medium + BichuBorda.medium
        ..color = contorno,
    );
    canvas.drawPath(
      formaDaJanela,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = BichuBorda.medium
        ..color = linha,
    );
  }

  @override
  bool shouldRepaint(_PintorDoRecorte antigo) =>
      antigo.imagem != imagem ||
      antigo.enquadramento.zoom != enquadramento.zoom ||
      antigo.enquadramento.deslocamento != enquadramento.deslocamento ||
      antigo.enquadramento.janela != enquadramento.janela ||
      antigo.circular != circular ||
      antigo.fundo != fundo ||
      antigo.veu != veu ||
      antigo.linha != linha ||
      antigo.contorno != contorno;
}
