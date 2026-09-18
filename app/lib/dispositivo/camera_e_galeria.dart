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
library;

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

/// A implementacao deste build: **nao ha camera embarcada ainda.**
///
/// Ela nao finge. Todo metodo responde [EstadoDaPermissao.indisponivel] ou
/// nulo, e as telas ja tratam esse estado com o caminho alternativo que a
/// especificacao exige de qualquer forma: digitar o codigo em F2.1 e escolher
/// da galeria em F1.4. O dia em que o plugin de camera entrar, entra uma
/// implementacao nova aqui e nenhuma tela muda.
///
/// **O que falta para trocar isto por camera de verdade**, e nao e trabalho de
/// tela: um plugin de leitura de QR, a declaracao de uso da camera no
/// `Info.plist` e no `AndroidManifest.xml` com a justificativa que a revisao
/// da loja cobra, e verificacao em aparelho -- camera nao se verifica em
/// simulador.
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
