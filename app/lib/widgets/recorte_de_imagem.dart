/// O recorte e o reposicionamento da imagem, **em todo ponto de upload do
/// app**.
///
/// Cliente, 29/10/2026: *"precisamos implementar em todo sistema que tem upload
/// de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a posicao da
/// imagem"*. E a origem, de 28/10: *"voce esta cropando no lugar errado"*.
///
/// ## O defeito que isto conserta tinha um NOME no codigo
///
/// `PreviaDaFoto.pontoFocal`. Ele e um [Alignment] **fixo**, escolhido por quem
/// escreveu a tela: `Alignment.center` em oito telas e `Alignment(0, -1 / 3)`
/// na edicao do pet, com a justificativa de que a cabeca do animal fica no
/// terco superior *"na foto tipica de tutor"*. Isso e um palpite sobre a foto
/// de outra pessoa, e e ele que o cliente viu errar. Esta peca nao apaga o
/// `pontoFocal` -- ele continua decidindo onde a previa se ancora --, ela
/// **tira dele a decisao do recorte**: o que vai no envio passa a ser o
/// retangulo que a pessoa enquadrou.
///
/// ## Por que esta peca mora em `widgets/`, e nao em cada tela
///
/// Pelo mesmo motivo de `PreviaDaFoto`, e o motivo e um portao:
/// `porta_nao_contornada_test.dart` proibe `dart:io` e plugin de aparelho
/// dentro de `lib/telas`. Uma tela que recortasse pixels abriria o arquivo por
/// conta propria e furaria o portao. Aqui ela so chama [ajustarAFoto] e recebe
/// uma [FotoLocal] de volta.
///
/// E tambem porque o cliente ja recusou uma vez a alternativa, em 21/10:
/// *"voce nao esta criando um sistema de upload por cada recurso ne? Voce
/// deveria estar reaproveitando esse codigo"*.
///
/// ## A tela nao recorta, e nenhum pixel atravessa esta fronteira
///
/// [EnquadramentoDaFoto] e geometria pura: ela transforma arraste e zoom em
/// **quatro inteiros** ([RecorteDaFoto]), e quem corta e recodifica e
/// `CameraEGaleria.recortarFoto`, na camada de aparelho. E por isso que
/// "a posicao escolhida e a que sai no envio" e uma frase com isca: ela e uma
/// afirmacao sobre esses quatro numeros, exercitavel sem aparelho e sem disco.
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
import 'botao_primario.dart';

/// A forma da janela de recorte, por destino.
///
/// ## NENHUM numero aqui foi escolhido, e isso tem portao
///
/// Todo aspecto desta classe e a razao `largura / altura` da derivada
/// `card` que o SERVIDOR produz, em `src/modules/media/domain/derivadas.ts`.
/// A razao nao e preferencia de desenho: naquele arquivo, **`altura` presente
/// significa `fit: 'cover'`** -- o servidor CORTA a imagem naquela proporcao,
/// com as palavras do cliente citadas la (*"vamos cropar a imagem na
/// proporcao"*).
///
/// Entao uma janela com outra proporcao seria o defeito de 28/10 de volta por
/// um caminho novo: a pessoa enquadraria o rosto num quadrado, o servidor
/// cortaria aquele quadrado em 1024 x 1126, e **o enquadramento dela seria
/// recortado outra vez** -- agora por um numero que ela nao viu. Medido em
/// 29/10/2026.
///
/// `recorte_segue_o_servidor_test.dart` LE `derivadas.ts` do disco e compara
/// com cada constante daqui. Nao e comentario: um numero que mudar la reprova
/// aqui.
@immutable
class FormatoDoRecorte {
  const FormatoDoRecorte({required this.aspecto, required this.circular});

  /// O aspecto a partir das dimensoes da derivada do servidor.
  ///
  /// Os dois numeros entram como eles estao em `derivadas.ts`, e nao a razao
  /// ja calculada: `1024 / 1126` e conferivel contra o arquivo com os olhos,
  /// e `0.9094` nao e.
  const FormatoDoRecorte.daDerivada({
    required int largura,
    required int altura,
    bool circular = false,
  }) : this(aspecto: largura / altura, circular: circular);

  /// A janela segue o aspecto do PROPRIO arquivo -- nada e cortado em zoom 1.
  ///
  /// **Nenhum ponto de upload do app usa esta forma hoje, e isso esta
  /// medido:** em `derivadas.ts`, todo proposito que o app envia tem `altura`
  /// presente, ou seja `fit: 'cover'`. O unico que nao tem e
  /// `DERIVADAS_DO_PRODUTO` (a Loja, `fit: 'inside'`), e o app nao sobe
  /// produto -- quem o faz e o painel.
  ///
  /// Ela fica porque e a resposta certa para um destino que o servidor NAO
  /// corta, e porque sem ela a escolha de cada ponto pareceria a unica
  /// possivel em vez de uma decisao medida.
  const FormatoDoRecorte.doProprioArquivo() : aspecto = null, circular = false;

  /// Largura dividida pela altura, ou nulo para seguir o arquivo.
  final double? aspecto;

  /// A janela e desenhada como circulo.
  ///
  /// Nao muda o recorte, que continua sendo o retangulo que circunscreve o
  /// circulo: o retrato e exibido arredondado e o retangulo e o que o servidor
  /// recebe. O circulo esta aqui porque enquadrar um rosto num quadrado e
  /// ve-lo cortado num circulo e o mesmo defeito, numa escala menor.
  final bool circular;

  /// `DERIVADAS_DA_FOTO_DE_PET`: 1024 x 1126.
  ///
  /// Nao e 1:1. **E tambem nao e `BichuMoldura.proporcao` (1,1)**, que e o
  /// token da forma com que a foto do pet e EXIBIDA: 1126 / 1024 da 1,0996, e
  /// a diferenca e invisivel na tela mas e a do servidor que corta. Quem manda
  /// na janela e quem corta, nao quem desenha.
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
  ///
  /// **E onde este recurso mais paga:** a capa e 16:9 e a foto sai de um
  /// celular, em retrato. O corte automatico no centro de um retrato 3:4 para
  /// uma faixa 16:9 joga fora as duas pontas e fica com a barriga da foto --
  /// que e literalmente *"cropando no lugar errado"*, o relato de 28/10.
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
  ///
  /// **Serve a TRES pontos de upload**, e isso esta medido no servidor, nao
  /// suposto: o registro de achado, o "encontrei este pet" e a foto na
  /// CONVERSA. Os tres sobem por envio cujo `kind` esta em
  /// `ESPECIES_DO_ACHADO` -- `['found_report_photo', 'finder_photo']`, em
  /// `src/modules/media/ports/fotos-do-achado.ts` --, e a varredura de higiene
  /// do `worker.ts` manda os DOIS `kind` para `higienizarFotoDoAchado`, que
  /// aplica esta mesma derivada. O comentario de la diz, com estas palavras,
  /// que a varredura *"liga o worker aos DOIS caminhos do achado"*: o de quem
  /// tem conta (`createFoundReportPhotoUploadIntent`) e o de quem nao tem
  /// (`PATCH /finder/found-report`).
  ///
  /// **A FOTO NA CONVERSA foi a correcao de rota mais util da medicao de
  /// 29/10.** A previa dela tem altura VARIAVEL
  /// (`PreviaDaFotoDaConversa` mede `min(220, fracao da tela)`) e nenhum
  /// aspecto declarado, entao aquele destino PARECIA de forma livre, e a
  /// janela ia ser [FormatoDoRecorte.doProprioArquivo]. Nao e: o servidor a
  /// corta aqui. Janela livre ali daria o pior dos dois mundos -- a pessoa
  /// enquadrando uma coisa e o servidor entregando outra.
  ///
  /// **E no achado isso custa mais que em qualquer outro ponto.** A foto e a
  /// unica prova de que o animal e aquele: um corte que o tutor nao escolheu
  /// pode tirar da imagem justamente a mancha, a coleira ou a orelha que
  /// identifica o pet dele.
  static const FormatoDoRecorte fotoDoAchado = FormatoDoRecorte.daDerivada(
    largura: 1024,
    altura: 1126,
  );
}

/// O enquadramento, como GEOMETRIA PURA.
///
/// Nenhum widget, nenhum `BuildContext`, nenhum arquivo. E por isso que todo
/// caso que importa -- "arrastar para cima move o recorte para baixo",
/// "o recorte nunca sai do arquivo", "zoom 1 sem arraste e o arquivo todo" --
/// tem isca sem aparelho.
///
/// ## O modelo, em uma frase
///
/// A janela e FIXA e a imagem se move por baixo dela. O contrario (janela que
/// se arrasta sobre a imagem) deixaria a pessoa escolher um retangulo com a
/// forma errada para o destino, que e justamente o que [FormatoDoRecorte]
/// existe para impedir.
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

  /// 1 e a imagem cobrindo a janela. Nunca menor: menor que 1 abriria faixa
  /// vazia dentro da janela, e vazio nao e um enquadramento que alguem queira.
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
  ///
  /// E o que faz a janela nunca mostrar vazio -- e com isso o resultado nunca
  /// ter faixa de nada. Grudar e feito aqui, e NAO no tratador do gesto, para
  /// que a propriedade valha tambem para o estado que vem de uma troca de
  /// orientacao da tela ou de um zoom pelo controle.
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
  ///
  /// A conta, por extenso, porque ela e o coracao desta peca: a imagem e
  /// desenhada centrada em `centro da janela + deslocamento`; a borda esquerda
  /// da janela cai, dentro da imagem, a `largura da imagem / 2 - largura da
  /// janela / 2 - deslocamento` pixels **do palco** do canto da imagem; dividir
  /// por [escala] leva isso a pixels do arquivo.
  ///
  /// Sai [RecorteDaFoto.grudadoEm] porque arredondamento de um pixel na borda
  /// de baixo produziria faixa vazia na foto enviada -- o tipo de defeito que
  /// ninguem liga a causa.
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
  ///
  /// Nao e usado em producao, e existe de proposito: ele e o CONTROLE do caso
  /// que afirma que a posicao escolhida chega ao envio. Sem ele, um caso que
  /// medisse so o recorte escolhido passaria verde numa implementacao que
  /// ignorasse o arraste e devolvesse o centro -- que e exatamente o defeito
  /// que o cliente relatou.
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
  static const String reiniciar = 'Voltar ao enquadramento inicial';
  static const String zoom = 'Zoom';
  static const String palco =
      'Área de ajuste da imagem. Arraste para posicionar. '
      'Com o teclado, use as setas para mover e as teclas mais e menos para o zoom.';

  /// O que a folha diz quando o arquivo **nao decodifica**.
  ///
  /// Nao aparece em tela: neste caso [ajustarAFoto] nao abre folha nenhuma e
  /// devolve a foto como ela veio. O texto existe para o relatorio do
  /// `debugPrint` e para o caso poder cita-lo.
  static const String naoAbriu =
      'Não deu para abrir esta imagem para ajustar; ela vai como está.';
}

/// Abre a folha de recorte e devolve a foto **ajustada**.
///
/// O unico ponto de entrada que as telas usam. Em cada ponto de upload a
/// chamada entra entre "a pessoa escolheu" e "a tela usa":
///
/// ```dart
/// final foto = await camera.escolherDaGaleria();
/// if (!mounted || foto == null) return;
/// final ajustada = await ajustarAFoto(context, camera: camera, foto: foto,
///     formato: FormatoDoRecorte.quadrado);
/// if (!mounted || ajustada == null) return;
/// ```
///
/// ## Os tres desfechos, e eles sao diferentes
///
///  - **a foto ajustada** -- a pessoa enquadrou e confirmou;
///  - **a foto como veio** -- ou ela nao mexeu em nada (zoom 1 e sem arraste,
///    com a janela cobrindo o arquivo todo), ou o arquivo **nao decodifica**.
///    O segundo caso e real: formato sem decodificador nesta versao do sistema
///    (HEIC em Android antigo e o conhecido). Prender a pessoa numa folha vazia
///    seria pior que deixar a foto ir com o recorte automatico de antes, que e
///    o que esta linha faz;
///  - **nulo** -- a pessoa cancelou. **O MESMO nulo que o seletor devolve
///    quando ela desiste de escolher**, e de proposito: a tela ja trata esse
///    nulo, e um segundo significado exigiria mexer no tratamento de nove
///    telas para dizer a mesma coisa.
Future<FotoLocal?> ajustarAFoto(
  BuildContext context, {
  required CameraEGaleria camera,
  required FotoLocal foto,
  required FormatoDoRecorte formato,
  String? titulo,
}) async {
  final imagem = await abrirAImagemParaRecortar(foto);
  if (!context.mounted) return foto;
  // Nao decodificou. A foto segue como veio, em vez de a pessoa encarar uma
  // folha que nao desenha nada.
  if (imagem == null) {
    debugPrint('BICHU recorte: ${TextosDoRecorte.naoAbriu} ${foto.caminho}');
    return foto;
  }

  final RecorteDaFoto? escolhido = await showModalBottomSheet<RecorteDaFoto>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    // **`enableDrag: false`, E ISSO E UM DEFEITO MEDIDO E NAO PRECAUCAO.**
    //
    // Com o padrao (`true`), arrastar a foto PARA CIMA dentro do palco
    // fechava a folha devolvendo nulo: o reconhecedor de arraste da propria
    // folha ganhava o gesto vertical na arena, e a pessoa perdia a foto que
    // acabou de escolher ao tentar reposiciona-la. Pego em 29/10/2026 pela
    // isca `Usar esta imagem devolve o retangulo ARRASTADO`, que recebeu nulo.
    //
    // Nesta folha o arraste vertical E a funcao principal, entao ele nao pode
    // ser dividido com o fechamento. Quem fecha e `Cancelar`, que esta na
    // tela, e o botao de voltar do sistema -- os dois devolvem o mesmo nulo.
    enableDrag: false,
    // Sem alca, pela mesma razao: ela anuncia um arraste que fecha, e aqui
    // arrastar nao fecha.
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

  // **QUEM LIBERA A TEXTURA E A PROPRIA FOLHA, no `dispose` dela.**
  //
  // Ela era liberada AQUI, e era um defeito: `showModalBottomSheet` devolve o
  // valor quando o `pop` acontece, e a folha continua PINTANDO durante a
  // animacao de saida. Liberar a imagem nesse instante fazia
  // `Canvas.drawImageRect` estourar a asserção de imagem descartada -- tela
  // vermelha a cada ajuste de foto confirmado. Pego em 29/10/2026 pela isca
  // de F1.4.
  //
  // `State.dispose` roda quando a rota ja saiu da arvore, que e o unico
  // momento em que ninguem mais pinta aquela textura.

  if (escolhido == null) return null;
  // Recortar cobre o arquivo todo: nada a fazer, e a propria porta devolve a
  // mesma foto sem recodificar.
  final ajustada = await camera.recortarFoto(foto, escolhido);
  // A porta nao conseguiu recortar. A foto original e a resposta honesta -- o
  // alternativo seria perder a foto que a pessoa acabou de escolher.
  return ajustada ?? foto;
}

/// A imagem pronta para desenhar, mais o tamanho **do arquivo**.
///
/// Os dois nao sao o mesmo numero, e a diferenca importa: a textura e
/// decodificada reduzida (ver [abrirAImagemParaRecortar]), e o recorte precisa dos pixels
/// do ARQUIVO -- recortar com o tamanho da textura entregaria um retangulo
/// pequeno demais para o arquivo, e o resultado sairia enquadrado em outro
/// lugar.
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
///
/// Mesmo motivo do `cacheWidth` de `PreviaDaFoto`: um palco de 360 dp num
/// aparelho de 3x pinta 1080 px, e decodificar 1920 x 1920 em RGBA custa
/// 14 MB de textura para mostrar menos de um terco disso. O zoom maximo e 4x,
/// entao 1440 px cobre a aproximacao inteira sem a imagem embacar.
const int ladoMaiorParaDesenhar = 1440;

/// Decodifica o arquivo para desenhar, e devolve junto o tamanho **do
/// arquivo**.
///
/// Publica, e nao privada, porque e o unico jeito de um caso montar
/// [FolhaDeRecorte] pelo MESMO caminho que a producao usa. Um
/// [ImagemParaRecortar] montado a mao no teste mediria um caminho que o app
/// nao tem.
///
/// Nulo quando nao decodifica, ou quando o arquivo sumiu do aparelho. Ver
/// [ajustarAFoto] para o que acontece nesse caso.
Future<ImagemParaRecortar?> abrirAImagemParaRecortar(FotoLocal foto) async {
  // **O ARQUIVO SUMIU: a saida e AQUI, antes de qualquer E/S de verdade.**
  //
  // Nao e defensividade, e sao duas razoes independentes.
  //
  // 1. O caso e REAL e esta documentado na porta: *"o sistema limpa o
  //    diretorio temporario da camera quando falta espaco, e isso acontece
  //    entre a escolha e o envio"*. Deixar isso virar excecao faria o caminho
  //    comum passar pelo `catch`, que e onde a causa se perde.
  //
  // 2. **E o que mantem a suite de widget inteira de pe, e isso foi medido.**
  //    `ImmutableBuffer.fromFilePath` e E/S de verdade, e o relogio do teste
  //    de widget e FALSO: ele roda microtarefas, mas nao avanca o mundo de
  //    fora. Com a leitura antes desta guarda, 53 casos deste repositorio
  //    paravam no meio -- a foto escolhida nunca chegava a tela e nenhum envio
  //    saia --, porque eles montam `FotoLocal` com caminhos como
  //    `/tmp/nina.jpg`, que nao existem. Com a guarda, aquele caminho se
  //    resolve numa microtarefa e eles seguem exatamente como antes.
  //
  //    O preco esta na mesa: um caso que QUEIRA a folha precisa de arquivo em
  //    disco e de `runAsync`. Os dois arquivos de isca deste recurso fazem
  //    isso, e dizem por que.
  if (!File(foto.caminho).existsSync()) {
    debugPrint(
      'BICHU recorte: "${foto.caminho}" nao esta no aparelho; nada a ajustar.',
    );
    return null;
  }
  try {
    // **DO ARQUIVO, e nao de `CameraEGaleria.bytesDaFoto`**, e a diferenca foi
    // medida em 29/10/2026: ler pela porta soma +1 em `vezesQueLeuOsBytes`, o
    // contador que OITO casos deste repositorio usam para afirmar "os bytes
    // subiram" e "nada subiu". Passar o desenho por aquele contador trocaria o
    // significado dele em oito iscas de uma vez -- e o pior: o caso que afirma
    // `vezesQueLeuOsBytes == 0` ("tipo recusado: a tela NAO sobe nada")
    // passaria a contar uma leitura que nao e envio nenhum.
    //
    // Desenhar arquivo local de dentro de `lib/widgets` e o padrao desta
    // pasta e nao uma excecao: `previa_da_foto.dart` existe exatamente por
    // isso, e usa `Image.file`. O portao de diretivas
    // (`porta_nao_contornada_test.dart`) cobra `lib/telas`, e e ali que a
    // regra vale -- tela que abre arquivo e tela que fala com o aparelho por
    // fora da porta.
    //
    // `ImmutableBuffer.fromFilePath` e de `dart:ui`: nem `dart:io` nem plugin.
    final buffer = await ui.ImmutableBuffer.fromFilePath(foto.caminho);
    // O DESCRITOR primeiro, e nao o codec: ele da o tamanho do ARQUIVO sem
    // decodificar nada. E o unico caminho que entrega os dois numeros de que
    // esta peca precisa -- o do arquivo, para o recorte, e o reduzido, para a
    // textura -- sem decodificar duas vezes.
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
    // Vale para as duas falhas, e elas sao diferentes: o arquivo sumiu do
    // aparelho (o sistema limpa o diretorio temporario da camera quando falta
    // espaco, e isso acontece entre a escolha e o envio) e o formato nao tem
    // decodificador nesta versao do sistema. Nenhuma das duas derruba a
    // escolha da foto; as duas caem no caminho de "vai como esta".
    debugPrint('BICHU recorte: nao abriu "${foto.caminho}". $erro');
    return null;
  }
}

/// A chave do palco: a area arrastavel da folha.
///
/// Existe para o CASO poder arrastar este `CustomPaint` e nao um dos quatro
/// que o Material monta dentro da folha -- medido em 29/10/2026.
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
  ///
  /// Nao e enfeite: sem ela a janela encosta na borda do palco e a pessoa nao
  /// ve o que esta FORA do recorte -- e e justamente o de fora que diz para
  /// que lado arrastar.
  static const double folgaDoPalco = BichuEspaco.e6;

  /// O passo do teclado, em dp. `Shift` triplica.
  static const double passoDoTeclado = BichuEspaco.e2;

  /// Quanto da altura da tela a janela de recorte pode ocupar.
  ///
  /// **36% e nao "o que couber"**: o resto da folha -- titulo, apoio, zoom e as
  /// duas acoes -- custa altura fixa, e uma janela que coma tudo empurra a
  /// acao primaria para debaixo da borda. E o mesmo defeito que
  /// `PreviaDaFotoDaConversa` resolveu com `min(220, fracao da tela)`, pela
  /// mesma razao.
  static const double fracaoMaximaDaJanela = 0.36;

  @override
  State<FolhaDeRecorte> createState() => _EstadoDaFolhaDeRecorte();
}

class _EstadoDaFolhaDeRecorte extends State<FolhaDeRecorte> {
  EnquadramentoDaFoto? _enquadramento;

  /// **A folha e a dona da textura de exibicao.** Ver a nota em
  /// [ajustarAFoto]: liberar a imagem quando o `pop` devolve o valor estoura
  /// na animacao de saida, que ainda pinta.
  ///
  /// Sem liberar nada, cada escolha de foto deixaria uma textura viva ate o
  /// coletor passar -- e o aparelho modesto que o cabecalho de `PreviaDaFoto`
  /// cita e justamente o que sente.
  @override
  void dispose() {
    widget.imagem.imagem.dispose();
    super.dispose();
  }

  /// O zoom no inicio do gesto de pinca. `ScaleUpdateDetails.scale` e relativo
  /// ao comeco do gesto, e nao ao quadro anterior.
  double _zoomNoInicioDoGesto = 1;

  double get _aspectoDaJanela =>
      widget.formato.aspecto ??
      widget.imagem.larguraDoArquivo / widget.imagem.alturaDoArquivo;

  /// A janela, para uma largura de palco.
  ///
  /// **Nunca mais alta que [_alturaMaximaDaJanela]**: uma capa 16:9 num palco
  /// estreito e baixa e cabe, mas um retrato 1:1,1 num aparelho pequeno
  /// empurraria o zoom e os botoes para fora da folha -- e a acao primaria
  /// debaixo da borda da tela e o defeito que `area_segura_do_aparelho_test`
  /// existe para pegar.
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
    // A troca de janela (rotacao da tela, teclado abrindo) **preserva o zoom e
    // o arraste** e so os gruda de novo. Reiniciar aqui jogaria fora o
    // enquadramento da pessoa por causa de um evento do sistema.
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

    // Arrastar a IMAGEM, e nao a janela: seta para a esquerda move a imagem
    // para a esquerda, que e o que o dedo faria.
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

    final alturaMaximaDaJanela = math.max(
      120.0,
      tela.height * FolhaDeRecorte.fracaoMaximaDaJanela,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BichuEspaco.e4,
        0,
        BichuEspaco.e4,
        BichuEspaco.e4,
      ),
      // **A COLUNA ROLA, e nao e zelo:** `isScrollControlled: true` deixa a
      // folha CRESCER, mas nao a faz rolar. Medido em 29/10/2026 numa janela
      // de 800 x 600, que e a do teste de widget e tambem a de um aparelho
      // baixo com a fonte do sistema aumentada: a coluna estourava por 54 px,
      // e quem saia da tela era a acao primaria. O teto de
      // [FolhaDeRecorte.fracaoMaximaDaJanela] cuida do caso comum; esta rolagem cuida do
      // resto, e os dois juntos sao o que `area_segura_do_aparelho_test`
      // cobra das outras telas.
      child: SingleChildScrollView(
        // **O `LayoutBuilder` ENVOLVE A COLUNA INTEIRA, e nao so o palco.**
        //
        // Ele envolvia so o palco, e era um defeito: o builder de um
        // `LayoutBuilder` roda no LAYOUT, depois do resto desta arvore ser
        // construida. Como e ele que calcula a janela -- e portanto
        // `_enquadramento` --, na PRIMEIRA moldura o zoom, o reiniciar e
        // `Usar esta imagem` nasciam DESABILITADOS, e so acordavam no primeiro
        // `setState` (um arraste, uma tecla). Quem nao arrastasse encontrava a
        // acao principal morta.
        //
        // Pego em 29/10/2026 pela isca do zoom, que achou `Slider.onChanged`
        // nulo. Com a coluna dentro do builder, a janela existe antes de
        // qualquer filho ser construido.
        child: LayoutBuilder(
          builder: (contexto, limites) {
            final larguraDisponivel = limites.maxWidth.isFinite
                ? limites.maxWidth - FolhaDeRecorte.folgaDoPalco * 2
                : 280.0;
            final janela = _janelaPara(larguraDisponivel, alturaMaximaDaJanela);
            _ajustarAJanela(janela);
            final enquadramento = _enquadramento!;

            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(widget.titulo, style: tipografia.titleMedium),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  TextosDoRecorte.apoio,
                  style: tipografia.bodySmall?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
                const SizedBox(height: BichuEspaco.e3),
                Semantics(
                  label: TextosDoRecorte.palco,
                  container: true,
                  child: Focus(
                    autofocus: true,
                    onKeyEvent: _teclado,
                    child: GestureDetector(
                      onScaleStart: (_) =>
                          _zoomNoInicioDoGesto = enquadramento.zoom,
                      // `onScaleUpdate` cobre o arraste de UM dedo tambem:
                      // `focalPointDelta` e o movimento e `scale` fica em 1.
                      // Dois tratadores (pan e scale) no mesmo detector sao
                      // proibidos pelo framework, e seriam duas contas para o
                      // mesmo gesto.
                      onScaleUpdate: (detalhe) => setState(() {
                        final comZoom = _enquadramento!.comZoom(
                          _zoomNoInicioDoGesto * detalhe.scale,
                        );
                        _enquadramento = comZoom.arrastado(
                          detalhe.focalPointDelta,
                        );
                      }),
                      child: SizedBox(
                        width: double.infinity,
                        height: janela.height + FolhaDeRecorte.folgaDoPalco * 2,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(BichuRaio.lg),
                          child: CustomPaint(
                            // A chave existe para o CASO poder arrastar ESTE
                            // `CustomPaint` e nao um dos quatro que o Material
                            // monta dentro da folha -- medido em 29/10/2026.
                            key: chaveDoPalcoDoRecorte,
                            painter: _PintorDoRecorte(
                              imagem: widget.imagem.imagem,
                              enquadramento: enquadramento,
                              circular: widget.formato.circular,
                              fundo: cores.surfaceSunken,
                              // `scrim` e o token de preto com transparencia
                              // do projeto -- a mesma linguagem que o cliente
                              // determinou para a barra do autor no Mural em
                              // 29/10/2026. Aqui ele e mais forte de
                              // proposito: um veu discreto nao diria onde
                              // termina o recorte, que e a unica informacao
                              // desta tela.
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
                        // SEM guarda de nulo: a janela e calculada pelo
                        // `LayoutBuilder` que envolve esta coluna, entao
                        // `_enquadramento` existe antes deste filho nascer. A
                        // guarda que havia aqui era o que deixava o controle
                        // morto na primeira moldura.
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
                  // `pop()` sem valor devolve nulo, que e o "a pessoa desistiu" que
                  // as telas ja tratam.
                  aoTocar: () => Navigator.of(context).pop(),
                ),
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
///
/// Um pintor so, e nao quatro `Container` em volta: a janela acompanha o
/// aspecto do destino, e quatro caixas exigiriam as mesmas quatro contas em
/// outro lugar -- com a chance de divergirem do recorte, que e o unico defeito
/// que esta tela nao pode ter.
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

  /// O tom ESCURO da moldura, por baixo do claro. Ver o fim de [paint].
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

    // O VEU: tudo menos a janela. `Path.combine` em vez de quatro retangulos,
    // porque com a janela circular quatro retangulos deixariam os cantos do
    // circulo sem veu.
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

    // As guias de tercos, DENTRO da janela: elas sao o que torna o
    // reposicionamento legivel, e nao decoracao.
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

    // A MOLDURA EM DOIS TONS, e isto NAO e enfeite.
    //
    // A linha era so clara (`textOnInverse`), e sobre uma foto CLARA ela
    // desaparece -- a pessoa perde a unica informacao da tela, que e onde
    // termina o recorte. Dois tracos resolvem em qualquer foto: um escuro mais
    // GROSSO por baixo e o claro por cima, entao a borda sempre tem um lado
    // contrastando com a imagem.
    //
    // Pelo mesmo motivo os dois tons saem de TOKEN e nao de hexadecimal: eles
    // invertem entre o tema claro e o escuro junto com o resto.
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
