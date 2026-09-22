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
import 'package:image_picker/image_picker.dart';
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
}

// ---------------------------------------------------------------------------
// BICHUS-161 — a implementacao de producao
// ---------------------------------------------------------------------------

/// O teto de bytes que `POST /media/pet-photo-intents` aceita.
///
/// **Nao e numero escolhido aqui:** e `UploadIntentInput.byte_size.maximum` do
/// contrato (`api/openapi.yaml`), 10 MiB. O piso, `minimum: 1`, e o outro lado
/// da mesma linha e tambem vale -- arquivo de zero byte e recusado pelo
/// servidor, e deixar um subir e gastar uma ida e volta para receber
/// `validation-failed`.
const int tetoDeBytesDaFoto = 10485760;

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
