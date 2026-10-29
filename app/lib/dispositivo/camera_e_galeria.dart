/// A fronteira entre o app e o aparelho, para camera e galeria.
///
/// **Por que existe uma porta em vez de uma chamada direta ao plugin.**
/// Permissao no aparelho e dialogo, e nao configuracao: a pessoa pode dizer
/// nao, e depois mudar de ideia nos ajustes do sistema sem abrir o app. Todo
/// caminho que depende de permissao tem **tres** estados, e nao dois, e o
/// terceiro exige mandar a pessoa para os ajustes, porque pedir de novo nao
/// abre dialogo nenhum. Uma tela que chama o plugin direto resolve dois
/// estados e esquece o terceiro em silencio.
///
/// A porta tambem e o que permite o teste de widget exercitar os tres estados
/// sem aparelho. Camera, notificacao e biometria nao se verificam em
/// simulador; o que se verifica aqui e que **a tela reage certo aos tres**.
///
/// **BICHUS-161, 21/09/2026: a camera existe.** [CameraDoAparelho] entrou e e
/// a implementacao de producao; [CameraNaoEmbarcada] continua, agora como o
/// que ela sempre foi por dentro -- a implementacao dos alvos sem camera e o
/// padrao dos testes. Nenhuma tela mudou, e isso era criterio.
library;

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
// Recorte e recodificacao em JPEG, em Dart PURO. Ver [CameraDoAparelho.recortarFoto]
// para o motivo de nao ser um plugin de recorte.
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

/// Os tres estados de permissao, mais o quarto que nao e permissao.
enum EstadoDaPermissao {
  /// A pessoa autorizou. O caminho principal roda.
  concedida,

  /// A pessoa recusou **desta vez**. Pedir de novo ainda abre o dialogo.
  negada,

  /// A pessoa recusou de forma permanente, ou o sistema bloqueou. Pedir de
  /// novo **nao abre dialogo nenhum**: o unico caminho e os ajustes do
  /// sistema, e a tela precisa dizer isso em vez de repetir o pedido.
  negadaPermanentemente,

  /// Nao ha camera no aparelho, ou este build nao embarca o leitor.
  ///
  /// Nao e erro e nao e recusa: e ausencia de recurso, e o caminho alternativo
  /// (digitar o codigo, escolher da galeria) passa a ser o unico. Tratar isto
  /// como recusa mandaria a pessoa para os ajustes procurar uma permissao que
  /// nao existe.
  indisponivel,
}

/// Uma foto escolhida pela pessoa, ainda **no aparelho**.
///
/// O caminho e local: o envio e outro passo, e ele nao bloqueia o avanco do
/// cadastro (F1.4).
class FotoLocal {
  const FotoLocal({
    required this.caminho,
    required this.tipoDeConteudo,
    required this.tamanhoEmBytes,
  });

  final String caminho;
  final String tipoDeConteudo;
  final int tamanhoEmBytes;
}

/// O retangulo que a pessoa escolheu, **em pixels do arquivo**.
///
/// ## Por que a fronteira e um RETANGULO, e nao bytes
///
/// A tela nao recorta. Ela desenha a foto, deixa a pessoa arrastar e dar zoom,
/// e entrega **quatro inteiros**. Quem decodifica, corta e recodifica e a
/// camada de aparelho, por tres razoes que nao sao de estilo:
///
///  - cortar pixels pede `dart:io` (ler o arquivo) e um codificador, e
///    `porta_nao_contornada_test.dart` proibe as duas coisas em `lib/telas`;
///  - quatro inteiros tem isca sem aparelho. Uma imagem recortada nao: o
///    teste de widget nao tem disco de aparelho, e e exatamente a razao pela
///    qual [CameraEGaleria.bytesDaFoto] mora nesta porta e nao no envio;
///  - o retangulo e o que se AFIRMA num caso de teste. "A posicao escolhida e
///    a que sai no envio" e uma frase sobre estes quatro numeros, e sobre
///    nada mais.
///
/// Origem no canto SUPERIOR ESQUERDO do arquivo, como em toda biblioteca de
/// imagem. Nao ha rotacao: o seletor ja aplica a orientacao do EXIF quando
/// recodifica (os `maxWidth`/`maxHeight`/`imageQuality` de
/// [CameraDoAparelho._escolher] forcam isso nas duas plataformas), entao o que
/// chega aqui ja esta em pe.
@immutable
class RecorteDaFoto {
  const RecorteDaFoto({
    required this.x,
    required this.y,
    required this.largura,
    required this.altura,
  });

  /// O recorte que **nao recorta**: o arquivo inteiro, de um lado ao outro.
  ///
  /// Existe para quem precisa dizer "nao mexi" com o mesmo tipo de quem
  /// mexeu, em vez de um nulo que o outro lado tem de interpretar.
  const RecorteDaFoto.oArquivoInteiro({
    required int largura,
    required int altura,
  }) : this(x: 0, y: 0, largura: largura, altura: altura);

  final int x;
  final int y;
  final int largura;
  final int altura;

  /// Este recorte **grudado** dentro de um arquivo de [larguraDoArquivo] por
  /// [alturaDoArquivo].
  ///
  /// **Grudar aqui, e nao so no arraste, e proposital.** Quem arrasta ja e
  /// impedido de descolar a imagem da moldura; mas o retangulo tambem nasce de
  /// arredondamento, de uma troca de orientacao da tela e de um estado
  /// restaurado -- e nesses caminhos a borda de baixo pode cair um pixel FORA
  /// do arquivo. Um recorte fora do arquivo nao estoura: ele produz uma faixa
  /// vazia na foto enviada, que e o tipo de defeito que ninguem liga a causa.
  RecorteDaFoto grudadoEm(int larguraDoArquivo, int alturaDoArquivo) {
    final l = largura.clamp(1, larguraDoArquivo);
    final a = altura.clamp(1, alturaDoArquivo);
    return RecorteDaFoto(
      x: x.clamp(0, larguraDoArquivo - l),
      y: y.clamp(0, alturaDoArquivo - a),
      largura: l,
      altura: a,
    );
  }

  /// Verdadeiro quando este recorte cobre o arquivo todo -- ou seja, quando
  /// recortar nao mudaria nada.
  ///
  /// E o que permite a [CameraEGaleria.recortarFoto] devolver o MESMO arquivo
  /// em vez de recodificar a foto para chegar ao mesmo lugar. Recodificar de
  /// graca custa tempo da pessoa e uma geracao de qualidade de JPEG.
  bool cobreTudo(int larguraDoArquivo, int alturaDoArquivo) =>
      x == 0 &&
      y == 0 &&
      largura >= larguraDoArquivo &&
      altura >= alturaDoArquivo;

  @override
  bool operator ==(Object other) =>
      other is RecorteDaFoto &&
      other.x == x &&
      other.y == y &&
      other.largura == largura &&
      other.altura == altura;

  @override
  int get hashCode => Object.hash(x, y, largura, altura);

  @override
  String toString() =>
      'RecorteDaFoto(x: $x, y: $y, largura: $largura, altura: $altura)';
}

/// O acesso a camera e a galeria do aparelho.
abstract class CameraEGaleria {
  /// O estado atual, **sem** abrir dialogo.
  Future<EstadoDaPermissao> estadoDaCamera();

  /// Pede a permissao, abrindo o dialogo do sistema quando ele ainda abre.
  Future<EstadoDaPermissao> pedirCamera();

  /// Abre os ajustes do sistema, no unico caso em que pedir de novo nao
  /// resolve.
  Future<void> abrirAjustesDoSistema();

  Future<FotoLocal?> tirarFoto();

  Future<FotoLocal?> escolherDaGaleria();

  /// Os bytes do arquivo que [tirarFoto] ou [escolherDaGaleria] produziram.
  ///
  /// **Mora aqui, e nao no mecanismo de envio, porque ler o arquivo do seletor
  /// e trabalho do aparelho.** E a mesma razao pela qual esta porta existe: o
  /// teste de widget nao tem disco de aparelho, e sem este metodo na porta o
  /// envio inteiro so seria exercitavel com um arquivo de verdade em disco --
  /// ou seja, nao seria.
  ///
  /// **Estoura quando o arquivo nao esta la**, e nao devolve vazio. O sistema
  /// limpa o diretorio temporario da camera quando falta espaco, e isso
  /// acontece entre a escolha e o envio; quem chama precisa distinguir
  /// "arquivo sumiu" de "arquivo de zero byte", e nulo ou vazio juntaria os
  /// dois num silencio so.
  Future<Uint8List> bytesDaFoto(FotoLocal foto);

  /// A foto recortada em [recorte], como um arquivo NOVO no aparelho.
  ///
  /// Cliente, 29/10/2026: *"precisamos implementar em todo sistema que tem
  /// upload de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a
  /// posicao da imagem"*. A origem e de 28/10: *"voce esta cropando no lugar
  /// errado"* -- e estava. O recorte era automatico e no CENTRO (ou no terco
  /// superior, pelo `pontoFocal` de `PreviaDaFoto`), decidido por quem
  /// escreveu a tela e nao por quem tirou a foto.
  ///
  /// **O ORIGINAL NAO E PRESERVADO, e nao ha original a preservar.** O que
  /// chega a este app ja e uma derivada: [CameraDoAparelho._escolher] passa
  /// `maxWidth`, `maxHeight` e `imageQuality` ao seletor, entao o arquivo que
  /// [tirarFoto] e [escolherDaGaleria] devolvem ja foi recodificado pelo
  /// sistema. Guardar a POSICAO no servidor para recortar na leitura (o outro
  /// desenho possivel) custaria campo novo em sete entradas de intencao de
  /// envio, uma migracao e o pipeline de derivadas do worker -- para preservar
  /// um original que esta porta nunca teve.
  ///
  /// **Nulo quando o arquivo nao decodifica**, e e o caminho honesto: formato
  /// sem decodificador nesta versao do sistema e um caso real (HEIC em Android
  /// antigo). Quem chama devolve a foto ORIGINAL nesse caso, em vez de deixar
  /// a pessoa presa numa folha que nao desenha nada -- ver
  /// `ajustarAFoto` em `widgets/recorte_de_imagem.dart`.
  ///
  /// **Devolve a MESMA [FotoLocal] quando [recorte] cobre o arquivo todo**:
  /// recodificar para chegar ao mesmo enquadramento gasta tempo da pessoa e
  /// uma geracao de qualidade de JPEG por nada.
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte);
}

/// O aparelho que **nao tem camera** -- e o duble que os testes montam.
///
/// ATENCAO AO QUE ESTA CLASSE NAO E MAIS: ate a BICHUS-161 ela era a
/// implementacao deste build, e este cabecalho dizia que nao havia camera
/// embarcada e que faltavam as declaracoes de manifesto. As duas coisas
/// deixaram de ser verdade em 21/09/2026. Quem escolhe em producao e
/// `app.dart`, e desde a BICHUS-161 ele monta [CameraDoAparelho].
///
/// O que a BICHUS-161 entregou, e por isso saiu desta lista:
///  - o plugin de camera e galeria (`image_picker`) e o de permissao
///    (`permission_handler`), atras desta mesma porta;
///  - `NSCameraUsageDescription` e `NSPhotoLibraryUsageDescription` no
///    `Info.plist`, e `android.permission.CAMERA` no `AndroidManifest.xml`,
///    com a justificativa de uso que a revisao da loja cobra.
///
/// O que continua faltando, e nao e trabalho de tela: o **plugin de leitura de
/// QR** (F2.1 le codigo, e ler QR nao e tirar foto), e a verificacao em
/// aparelho fisico -- camera nao se verifica em simulador nem em teste de
/// widget, e o criterio 12 da BICHUS-161 continua sendo o unico que nenhum
/// portao deste repositorio cobre.
///
/// Ela nao finge. Todo metodo responde [EstadoDaPermissao.indisponivel] ou
/// nulo, e as telas ja tratam esse estado com o caminho alternativo que a
/// especificacao exige de qualquer forma: digitar o codigo em F2.1 e escolher
/// da galeria em F1.4. E por ela continuar existindo que as telas seguem
/// montaveis sem aparelho, e que o caminho "o aparelho nao coopera" tem um
/// lugar onde ser exercitado.
class CameraNaoEmbarcada implements CameraEGaleria {
  const CameraNaoEmbarcada();

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<EstadoDaPermissao> pedirCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<FotoLocal?> tirarFoto() async => null;

  @override
  Future<FotoLocal?> escolherDaGaleria() async => null;

  /// **Estoura, e e o certo.** Esta implementacao nunca devolve [FotoLocal],
  /// entao chegar aqui com uma significa que ela veio de outro lugar -- e
  /// devolver bytes vazios faria o envio recusar em silencio, escondendo a
  /// fiacao errada.
  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) async {
    throw StateError(
      'CameraNaoEmbarcada nao produz foto, entao nao ha bytes para ler de '
      '"${foto.caminho}". Chegar aqui significa que a FotoLocal veio de outra '
      'porta que nao esta montada.',
    );
  }

  /// **Estoura, pela mesma razao de [bytesDaFoto]**: esta implementacao nunca
  /// devolve [FotoLocal], entao chegar aqui com uma significa fiacao errada, e
  /// devolver a foto intacta esconderia isso atras de um recorte que nao
  /// aconteceu.
  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    throw StateError(
      'CameraNaoEmbarcada nao produz foto, entao nao ha o que recortar em '
      '"${foto.caminho}". Chegar aqui significa que a FotoLocal veio de outra '
      'porta que nao esta montada.',
    );
  }
}

// ---------------------------------------------------------------------------
// BICHUS-161 — a implementacao de producao
// ---------------------------------------------------------------------------

/// O teto de bytes de **todo envio de imagem da aplicacao**: 5 MiB.
///
/// **Nao e numero escolhido aqui:** e `UploadIntentInput.byte_size.maximum` do
/// contrato (`api/openapi.yaml`). O piso, `minimum: 1`, e o outro lado da mesma
/// linha e tambem vale -- arquivo de zero byte e recusado pelo servidor, e
/// deixar um subir e gastar uma ida e volta para receber `validation-failed`.
///
/// Eram 10 MiB aqui e no contrato, 2 MiB no servidor da foto de achado e 5 MiB
/// no catalogo: **tres numeros para a mesma regra**, e o envio de 3 MiB de uma
/// foto de achado era aceito por este arquivo, prometido pelo contrato e
/// recusado pelo servidor. O cliente unificou em 5 MB em 17/10/2026, para
/// usuario e administrador, "em toda a aplicacao".
const int tetoDeBytesDaFoto = 5242880;

/// A ORIENTACAO que toda tela de envio de imagem mostra, antes do envio.
///
/// Uma linha, e e proposital: o cliente reprovou texto excessivo em tela. Ela e
/// orientacao e nao recusa -- quem recusa e a politica assinada, no balde, com
/// o mesmo numero.
const String orientacaoDeTamanhoDaImagem = 'Envie uma imagem de até 5 MB.';

/// A lista fechada de `UploadIntentInput.content_type`.
///
/// Copiada do contrato, nao inventada. O que sai daqui e sempre `image/jpeg`,
/// porque [CameraDoAparelho] forca a recodificacao -- mas a lista existe para
/// que a traducao **reprove** em vez de mandar um tipo que o servidor recusa.
const Set<String> tiposDeFotoAceitos = <String>{
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
};

/// A lista fechada de `NetworkEventCoverIntentInput.content_type`: **os mesmos
/// quatro MENOS o HEIC**.
///
/// Copiada do contrato, nao inventada, e ela existe aqui porque a razao da
/// diferenca e do servidor e nao da tela: *"HEIC fica de fora porque a derivada
/// de catalogo e processada pelo mesmo caminho do painel, que nao o aceita"*.
/// Afrouxar o enum empurraria a falha para DEPOIS do envio, quando a pessoa ja
/// viu a previa e ja gastou a rede dela -- e e justamente isso que
/// [recusaDeTipoDaFoto] existe para evitar.
///
/// **A capa do encontro ainda nao sobe por nenhuma tela deste app** (medido em
/// 19/10/2026: `criar_encontro.dart` nao pergunta a capa, e nenhum arquivo de
/// `app/lib` chama `createNetworkEventCoverUploadIntent`). Esta constante e o
/// que a frente que a construir usa em vez de redigitar o enum -- a terceira
/// copia de um enum e a que esquece de mudar.
const Set<String> tiposDeFotoAceitosSemHeic = <String>{
  'image/jpeg',
  'image/png',
  'image/webp',
};

/// A recusa por TIPO, dita **antes** de o envio sair, ou nulo quando o tipo
/// serve.
///
/// ## Por que ela e necessaria mesmo com o seletor recodificando
///
/// Medido em 19/10/2026, nas duas plataformas: o seletor **nunca entrega HEIC a
/// este app**. No iOS, `FLTImagePickerPhotoAssetUtil` reconhece JPEG, PNG e GIF
/// pelo primeiro byte e manda todo o resto -- HEIC incluido -- para
/// `UIImageJPEGRepresentation`; no Android, `ImageResizer` recodifica em JPEG
/// (ou PNG quando o bitmap tem canal alfa) porque esta porta passa
/// `maxWidth`, `maxHeight` e `imageQuality` juntos. E `XFile(path)` nasce **sem
/// `mimeType`** nas duas (`cross_file` nao o deduz do caminho), entao
/// [fotoLocalDoArquivo] cai sempre em `image/jpeg`.
///
/// Entao esta funcao nao conserta o seletor: ela e o que faz a recusa ser
/// **legivel e antes do envio** para o destino cujo enum e mais estreito que o
/// da foto de pet -- a capa do encontro. Sem ela, o unico caminho de recusa de
/// tipo seria o worker marcando `rejected` depois de os bytes subirem.
///
/// Funcao pura e nao metodo de tela, pelo mesmo motivo de
/// [estadoDaPermissaoDoPlugin]: e aqui que mora a regra, e e aqui que ela tem
/// isca sem aparelho.
String? recusaDeTipoDaFoto(String tipoDeConteudo, Set<String> aceitos) {
  final tipo = tipoDeConteudo.trim().toLowerCase();
  if (aceitos.contains(tipo)) return null;
  // Os nomes vem do PROPRIO conjunto, e nao de uma lista escrita a mao: a
  // frase de um destino que aceita HEIC e a de um que nao aceita sao
  // diferentes, e duas redacoes divergiriam na primeira mudanca de enum.
  final nomes = aceitos.map(_nomeDoTipo).toList()..sort();
  final lista = nomes.length > 1
      ? '${nomes.sublist(0, nomes.length - 1).join(', ')} ou ${nomes.last}'
      : nomes.join();
  return 'Esse tipo de imagem não é aceito aqui. Escolha uma foto $lista.';
}

String _nomeDoTipo(String tipo) => switch (tipo) {
      'image/jpeg' => 'JPEG',
      'image/png' => 'PNG',
      'image/heic' => 'HEIC',
      'image/webp' => 'WebP',
      // O tipo que o contrato acrescentar sem passar por aqui aparece como ele
      // e, em vez de desaparecer da frase em silencio.
      _ => tipo,
    };

/// O lado maior, em pixels, com que a foto e recodificada antes de virar
/// [FotoLocal].
///
/// **E isto que torna o teto de 10 MiB inalcancavel, e essa e a intencao.** Um
/// JPEG de 1920 px no lado maior, com qualidade 80, fica na casa das centenas
/// de kB; o pior caso realista nao chega perto de 10 MiB. O limite do contrato
/// deixa de ser uma condicao que a tela precisa saber tratar e passa a ser uma
/// asserção que nunca dispara.
///
/// 1920 e nao 1024: a derivada publica do contrato e de 1024 px, mas ela e
/// **derivada** -- quem a produz e o worker, a partir do original. Mandar 1024
/// daqui jogaria fora resolucao que o cartaz impresso usa.
const int ladoMaiorDaFoto = 1920;

/// A qualidade da recodificacao JPEG.
const int qualidadeDaFoto = 80;

/// Traduz o estado do plugin de permissao para o enum do produto.
///
/// **Funcao pura, e de proposito.** E aqui que mora a unica regra de negocio
/// desta integracao, e canal de plataforma nao se exercita em teste de widget:
/// separada assim, os quatro estados tem isca sem aparelho e sem duble.
///
/// O caso que ninguem lembra e [PermissionStatus.restricted], que e do iOS:
/// controle parental ou politica de dispositivo gerenciado bloqueou a camera,
/// e **a pessoa nao consegue liberar nem nos ajustes**. Tratar isso como
/// `negadaPermanentemente` mandaria justamente quem nao pode resolver para uma
/// tela de ajustes onde nao ha o que tocar. E ausencia de recurso, e o enum
/// tem um valor exatamente para isso.
EstadoDaPermissao estadoDaPermissaoDoPlugin(PermissionStatus status) {
  return switch (status) {
    PermissionStatus.granted ||
    // iOS: acesso parcial a biblioteca. Para a camera nao ocorre; esta aqui
    // porque a mesma traducao serve a galeria no dia em que ela precisar.
    PermissionStatus.limited ||
    PermissionStatus.provisional =>
      EstadoDaPermissao.concedida,
    PermissionStatus.denied => EstadoDaPermissao.negada,
    PermissionStatus.permanentlyDenied => EstadoDaPermissao.negadaPermanentemente,
    PermissionStatus.restricted => EstadoDaPermissao.indisponivel,
  };
}

/// Converte o que o seletor devolveu em [FotoLocal], ou **nulo se o arquivo
/// nao serve para o contrato**.
///
/// Funcao pura pelo mesmo motivo da de cima. Ela e a fronteira em que o
/// contrato do servidor e cobrado **antes** de a rede ser usada: mandar um
/// arquivo de zero byte ou de 11 MiB e gastar uma ida e volta para receber
/// `validation-failed` de uma coisa que o cliente ja sabia.
///
/// **A limitacao honesta desta funcao:** ela devolve `FotoLocal?`, e a porta
/// tambem. Nulo ja significa "a pessoa cancelou", entao nulo por recusa e
/// indistinguivel de nulo por cancelamento, e a tela (que a BICHUS-161 nao
/// pode alterar, criterio 10) trata os dois em silencio. Isso so e aceitavel
/// porque [ladoMaiorDaFoto] torna a recusa por tamanho inalcancavel na
/// pratica. Se um dia a porta precisar recusar de verdade, o tipo de retorno
/// tem de crescer junto -- registrado na BICHUS-161.
FotoLocal? fotoLocalDoArquivo({
  required String caminho,
  required int tamanhoEmBytes,
  String? tipoDeConteudo,
}) {
  if (caminho.trim().isEmpty) return null;
  // `minimum: 1` do contrato. Arquivo vazio e o desfecho conhecido de um
  // seletor interrompido pelo sistema no meio da copia.
  if (tamanhoEmBytes < 1) return null;
  if (tamanhoEmBytes > tetoDeBytesDaFoto) return null;

  final tipo = (tipoDeConteudo ?? '').trim().toLowerCase();
  // A recodificacao produz JPEG nas duas plataformas. O tipo do plugin so e
  // aceito quando ele esta na lista fechada do contrato; fora dela, cai no
  // que a recodificacao de fato gerou, em vez de propagar um `image/*` que o
  // servidor recusa.
  final efetivo = tiposDeFotoAceitos.contains(tipo) ? tipo : 'image/jpeg';

  return FotoLocal(
    caminho: caminho,
    tipoDeConteudo: efetivo,
    tamanhoEmBytes: tamanhoEmBytes,
  );
}

/// A camera e a galeria de verdade, pelo aparelho (BICHUS-161).
///
/// **A galeria nao tem estado de permissao proprio, e isso e decisao
/// declarada, nao esquecimento** (criterio 6). Nas duas plataformas o seletor
/// de imagem roda **fora do processo do app**:
///
/// - Android 13+: o `image_picker` usa o Photo Picker do sistema
///   (`ACTION_PICK_IMAGES`); abaixo disso, o seletor de documentos. Nenhum dos
///   dois exige `READ_MEDIA_IMAGES` nem `READ_EXTERNAL_STORAGE`.
/// - iOS 14+: `PHPickerViewController`, tambem fora do processo.
///
/// Nos dois casos o acesso e concedido **por selecao**: o sistema devolve o
/// arquivo que a pessoa escolheu e nada mais. Nao ha permissao a pedir, e
/// pedir uma seria pedir acesso a biblioteca inteira para ler uma foto.
///
/// A string de uso da biblioteca continua declarada no `Info.plist` por
/// exigencia de revisao da loja (criterio 7). Declarar o texto e pedir a
/// permissao em tempo de execucao sao coisas diferentes.
///
/// **A camera, ao contrario, precisa de permissao -- e por uma razao que
/// surpreende.** `ACTION_IMAGE_CAPTURE` dispensaria o `CAMERA` do Android, mas
/// **passa a exigi-lo no momento em que o manifesto o declara**, e o manifesto
/// precisa declara-lo porque a BICHUS-54 (ler o QR) usa visor ao vivo dentro
/// do processo. Declarar agora e tratar o estado agora e o que evita a
/// alternativa: a 54 acrescentar a linha depois e mudar, em silencio, o
/// comportamento de uma tela que ninguem tocou.
class CameraDoAparelho implements CameraEGaleria {
  const CameraDoAparelho({ImagePicker? seletor})
      : _seletorInjetado = seletor;

  final ImagePicker? _seletorInjetado;

  ImagePicker get _seletor => _seletorInjetado ?? ImagePicker();

  /// Camera so existe onde ha aparelho. macOS, web e o ambiente de teste de
  /// widget nao tem canal de plataforma ligado, e `indisponivel` e a resposta
  /// **certa** ali, nao um remendo: e ausencia de recurso, que e o que o valor
  /// significa.
  bool get _plataformaTemCamera =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async {
    if (!_plataformaTemCamera) return EstadoDaPermissao.indisponivel;
    return _semExplodir(
      () async => estadoDaPermissaoDoPlugin(await Permission.camera.status),
      quando: 'consultar o estado da camera',
      padrao: EstadoDaPermissao.indisponivel,
    );
  }

  @override
  Future<EstadoDaPermissao> pedirCamera() async {
    if (!_plataformaTemCamera) return EstadoDaPermissao.indisponivel;
    return _semExplodir(
      () async => estadoDaPermissaoDoPlugin(await Permission.camera.request()),
      quando: 'pedir a permissao de camera',
      padrao: EstadoDaPermissao.indisponivel,
    );
  }

  @override
  Future<void> abrirAjustesDoSistema() async {
    if (!_plataformaTemCamera) return;
    await _semExplodir(
      () async => openAppSettings(),
      quando: 'abrir os ajustes do sistema',
      padrao: false,
    );
  }

  @override
  Future<FotoLocal?> tirarFoto() => _escolher(ImageSource.camera);

  @override
  Future<FotoLocal?> escolherDaGaleria() => _escolher(ImageSource.gallery);

  /// **Sem `_semExplodir` aqui, de proposito.** As outras operacoes degradam
  /// para "ausencia de recurso" porque a tela tem caminho alternativo; um
  /// arquivo que nao abre nao tem alternativa nenhuma, e devolver vazio faria
  /// o envio recusar sem ninguem saber por que. A excecao sobe e quem chama
  /// decide.
  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) {
    return File(foto.caminho).readAsBytes();
  }

  /// ## Por que isto e Dart PURO e nao um plugin de recorte
  ///
  /// Medido em 29/10/2026, e a ordem das razoes importa:
  ///
  ///  1. `package:image` **ja estava no `pubspec.lock` deste app**, em
  ///     4.10.1, puxado por `flutter_launcher_icons`. Promove-lo a dependencia
  ///     direta nao move numero nenhum da resolucao -- conferido rodando
  ///     `flutter pub get` antes e depois e comparando o `pubspec.lock`.
  ///  2. Ele e **Dart puro**: nenhum codigo Android, nenhum iOS, nenhum canal
  ///     de plataforma. Entao a pergunta "ele suporta a faixa de Android que o
  ///     projeto declara (`min_sdk_android: 21`)?" nao se aplica a ele -- nao
  ///     ha `minSdk` a cumprir num pacote que nao compila nada nativo. Um
  ///     plugin de recorte (uCrop, no Android) traria um `minSdk` proprio, uma
  ///     `Activity` no manifesto e uma tela que **nao e o design system
  ///     "Serio"** -- a interface seria a do plugin, nao a do Bichu.
  ///  3. `dart:ui` sozinho resolveria o corte, mas so codifica **PNG**
  ///     (`ImageByteFormat.png`), e PNG e sem perda: uma foto de 1920 px
  ///     recortada passa facil dos 5 MiB de [tetoDeBytesDaFoto] e seria
  ///     recusada pelo servidor. O recorte tem de sair em JPEG, e e
  ///     `encodeJpg` que o faz.
  ///
  /// ## Fora da linha principal, e por que tem de ser
  ///
  /// Decodificar, cortar e recodificar um JPEG de 1920 px em Dart puro leva da
  /// ordem de centenas de milissegundos num aparelho modesto. Na linha
  /// principal isso trava a animacao da folha fechando, que e exatamente o
  /// instante em que a pessoa toca `Usar esta foto`. `compute` o manda para
  /// outro isolado; a fronteira sao bytes e quatro inteiros, que atravessam.
  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    final bytes = await bytesDaFoto(foto);
    final recortado = await compute(
      _recortarEmJpeg,
      _PedidoDeRecorte(bytes: bytes, recorte: recorte),
    );
    // O arquivo nao decodificou, ou o recorte ja cobria tudo. Nos dois casos a
    // foto que entrou e a resposta certa, e os dois sao distinguiveis por quem
    // chama so em uma coisa: nenhum arquivo novo foi escrito.
    if (recortado == null) return null;
    if (recortado.isEmpty) return foto;

    // No diretorio TEMPORARIO, como o arquivo do proprio seletor: o envio le
    // os bytes e acaba, e deixar um JPEG recortado no diretorio de documentos
    // criaria um acumulo que ninguem limpa.
    final pasta = await getTemporaryDirectory();
    final destino = File(
      '${pasta.path}/bichu-recorte-${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await destino.writeAsBytes(recortado, flush: true);

    // Pela MESMA traducao de [fotoLocalDoArquivo], e nao por um `FotoLocal`
    // montado a mao: o piso e o teto do contrato valem para o arquivo
    // recortado tanto quanto valiam para o escolhido.
    return fotoLocalDoArquivo(
      caminho: destino.path,
      tamanhoEmBytes: recortado.length,
      tipoDeConteudo: 'image/jpeg',
    );
  }

  Future<FotoLocal?> _escolher(ImageSource origem) async {
    if (!_plataformaTemCamera) return null;
    return _semExplodir<FotoLocal?>(
      () async {
        final arquivo = await _seletor.pickImage(
          source: origem,
          // Os tres juntos sao o que cumpre o criterio 11: recodificam para
          // JPEG e mantem o resultado muito abaixo do teto do contrato.
          maxWidth: ladoMaiorDaFoto.toDouble(),
          maxHeight: ladoMaiorDaFoto.toDouble(),
          imageQuality: qualidadeDaFoto,
          requestFullMetadata: false,
        );
        // Cancelar e o caminho normal, e nao erro: o criterio 9 diz que o
        // silencio aqui e legitimo porque a pessoa agiu de proposito.
        if (arquivo == null) return null;

        return fotoLocalDoArquivo(
          caminho: arquivo.path,
          tamanhoEmBytes: await File(arquivo.path).length(),
          tipoDeConteudo: arquivo.mimeType,
        );
      },
      quando: 'escolher a foto (${origem.name})',
      padrao: null,
    );
  }

  /// Nenhuma falha de canal derruba o app, **e nenhuma some**.
  ///
  /// Falha ruidosa: o motivo vai para o log com o nome da operacao, e a tela
  /// recebe o valor que significa ausencia. Desde a BICHUS-158 a tela **diz**
  /// que a funcao nao esta disponivel em vez de ficar muda, entao degradar
  /// para `indisponivel` e visivel para quem esta usando o app -- que e o que
  /// separa isto de engolir excecao.
  Future<T> _semExplodir<T>(
    Future<T> Function() acao, {
    required String quando,
    required T padrao,
  }) async {
    try {
      return await acao();
    } on MissingPluginException catch (erro) {
      debugPrint('BICHU camera: canal ausente ao $quando. $erro');
      return padrao;
    } on PlatformException catch (erro) {
      debugPrint('BICHU camera: falha de plataforma ao $quando. $erro');
      return padrao;
    }
  }
}

// ---------------------------------------------------------------------------
// O recorte, no outro isolado
// ---------------------------------------------------------------------------

/// O que atravessa para o isolado do recorte.
@immutable
class _PedidoDeRecorte {
  const _PedidoDeRecorte({required this.bytes, required this.recorte});

  final Uint8List bytes;
  final RecorteDaFoto recorte;
}

/// Decodifica, corta e recodifica em JPEG. **Funcao de topo**, porque e o que
/// `compute` consegue mandar para outro isolado.
///
/// Tres respostas, e as tres sao diferentes:
///  - `null` -- **nao decodificou**. Quem chama devolve a foto original e a
///    pessoa segue sem recorte, em vez de ficar numa folha vazia.
///  - vazio -- decodificou e o recorte **cobria o arquivo todo**. Nao ha o que
///    cortar, e recodificar custaria uma geracao de qualidade por nada.
///  - bytes -- o JPEG recortado.
Uint8List? _recortarEmJpeg(_PedidoDeRecorte pedido) {
  final decodificada = img.decodeImage(pedido.bytes);
  if (decodificada == null) return null;

  final r = pedido.recorte.grudadoEm(decodificada.width, decodificada.height);
  if (r.cobreTudo(decodificada.width, decodificada.height)) {
    return Uint8List(0);
  }

  final cortada = img.copyCrop(
    decodificada,
    x: r.x,
    y: r.y,
    width: r.largura,
    height: r.altura,
  );
  // A MESMA qualidade da recodificacao do seletor. Dois numeros para a mesma
  // regra e o jeito conhecido de a foto recortada sair diferente da escolhida
  // sem ninguem ter decidido isso.
  return img.encodeJpg(cortada, quality: qualidadeDaFoto);
}
