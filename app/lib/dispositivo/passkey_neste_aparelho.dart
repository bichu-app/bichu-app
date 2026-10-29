/// O sinal LOCAL de que este aparelho tem uma credencial digital do Bichu.
///
/// ## O problema que ele resolve, e por que ele precisa existir
///
/// A tela de entrar tenta a passkey ao abrir, e para tentar ela precisa de um
/// desafio do servidor (`beginPasskeyAuthentication`). Esse desafio e
/// **gasto**: ele vira uma linha em `passkey_challenges`, com prazo e uso
/// unico, e conta no teto por IP da operacao.
///
/// So que **a esmagadora maioria de quem abre a tela de entrar nao tem passkey
/// nenhuma**. Pedir o desafio em toda abertura gasta uma requisicao por pessoa
/// que nao vai usar o recurso -- e numa rede atras de NAT, onde o teto por IP
/// e compartilhado pelo predio inteiro, e quem usa SENHA que leva o 429 por
/// causa de um recurso que ele nem tem.
///
/// Este arquivo e o portao: **nao se pede desafio sem sinal de que ha
/// credencial neste aparelho.**
///
/// ## POR QUE O SINAL E NOSSO, E NAO DA PLATAFORMA
///
/// **MEDIDO no pacote `passkeys` 2.23.1, e a resposta e nao.** O que ele
/// oferece de consulta local e `PasskeyAuthenticator.getAvailability()`, que
/// devolve `AvailabilityType` -- e os campos sao estes, nos quatro alvos:
///
/// - `hasPasskeySupport` (os quatro);
/// - `isUserVerifyingPlatformAuthenticatorAvailable` (Android, Web, Windows);
/// - `hasBiometrics` (iOS, via `LAContext.canEvaluatePolicy`).
///
/// Os tres respondem **"este aparelho CONSEGUE fazer passkey?"**. Nenhum
/// responde **"existe credencial do Bichu aqui?"** -- e isso nao e lacuna do
/// pacote: o WebAuthn **nao tem** essa consulta, de proposito, porque uma API
/// local que respondesse "sim, ha credencial para o site X" seria um oraculo
/// de enumeracao para qualquer pagina ou app que perguntasse. A unica forma de
/// descobrir se ha credencial e pedir uma assercao, que e exatamente a
/// chamada que se quer evitar.
///
/// Usar `hasBiometrics` como portao seria pior que nao ter portao: aparelho com
/// so codigo de acesso (sem Face ID nem Touch ID) **faz passkey** e responderia
/// `false`, trancando fora justamente quem tem a credencial.
///
/// Entao o sinal e o registro do proprio app: **ele marca quando ha prova de
/// que existe credencial aqui**, e a prova vem de tres lugares, todos de
/// sucesso observado:
///
/// 1. `finishPasskeyRegistration` respondeu 201 neste aparelho;
/// 2. `finishPasskeyAuthentication` respondeu 200 neste aparelho;
/// 3. `listPasskeys`, depois de uma entrada por senha, disse que a conta tem
///    credencial ativa -- que e o que cobre a credencial que chegou por
///    SINCRONIZACAO (Google Password Manager, Chaveiro do iCloud),
///    reinstalacao ou restauracao de backup.
///
/// ## O REGISTRO SO MARCA, E NUNCA DESMARCA. E deliberado.
///
/// Os dois erros possiveis nao custam a mesma coisa:
///
/// - **marca sobrando** (nao ha credencial aqui): gasta UMA requisicao por
///   sessao do app, que falha em silencio no caminho que ja existe. Custo
///   limitado e invisivel.
/// - **marca faltando** (ha credencial aqui): a pessoa perde a entrada sem
///   toque, que e o valor inteiro do recurso.
///
/// Como o segundo e muito pior, o registro nunca volta atras. Quem revogou a
/// ultima credencial em OUTRO aparelho continua gastando um desafio por sessao
/// do app aqui -- e esse e o preco escolhido, nao um descuido.
///
/// ## ONDE ELE MORA, E POR QUE NAO MORRE NO LOGOUT
///
/// Em disco, no diretorio do app, pelo mesmo motivo de
/// `OportunidadesDeAviso`: o que nao sobrevive ao app ser encerrado nao serve
/// aqui -- a tela de entrar abre justamente num arranque novo.
///
/// **E ele NAO entra em `limpezasAoSair`, e aqui a razao e mais forte que a de
/// `OportunidadesDeAviso`.** A lista de limpeza existe para o que e da CONTA.
/// Isto e do APARELHO: a credencial WebAuthn vive no Credential Manager ou no
/// Chaveiro, nao no app, e ela continua la depois do logout. Pior: o momento
/// em que este registro e LIDO e exatamente o momento em que nao ha sessao.
/// Limpa-lo no logout o tornaria sempre falso na unica hora em que ele e
/// consultado -- o portao estaria fechado para todo mundo, e a entrada por
/// passkey nao aconteceria nunca mais.
///
/// **Nao ha dado pessoal aqui.** O arquivo guarda um booleano e a data, e
/// nenhuma conta, e-mail ou identificador -- exatamente para que sobreviver ao
/// logout nao vaze nada do tutor anterior para o seguinte.
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Onde a marca mora entre uma abertura do app e a seguinte.
///
/// Abstrato **para o teste nao precisar de aparelho**:
/// `getApplicationDocumentsDirectory` e um canal de plataforma, e um teste de
/// widget que dependesse dele travaria num `Future` que nunca resolve.
abstract class DepositoDePasskeyNoAparelho {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDePasskeyEmArquivo implements DepositoDePasskeyNoAparelho {
  DepositoDePasskeyEmArquivo({
    String nomeDoArquivo = 'passkey_neste_aparelho.json',
  }) : _nome = nomeDoArquivo;

  final String _nome;
  File? _arquivo;

  Future<File> _abrir() async {
    final existente = _arquivo;
    if (existente != null) return existente;
    final dir = await getApplicationDocumentsDirectory();
    final novo = File('${dir.path}/$_nome');
    _arquivo = novo;
    return novo;
  }

  @override
  Future<String?> ler() async {
    final arquivo = await _abrir();
    if (!arquivo.existsSync()) return null;
    return arquivo.readAsString();
  }

  @override
  Future<void> gravar(String conteudo) async {
    final arquivo = await _abrir();
    // Temporario e `rename`, como o envelope de intencao e o registro do aviso
    // de cadastro: `rename` e atomico. Escrever por cima deixaria um JSON pela
    // metade se o sistema encerrasse o app no meio, e JSON pela metade aqui e
    // lido como "nao ha passkey" -- a marca que se acabou de ganhar.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }
}

/// Deposito em memoria, para teste de widget.
class DepositoDePasskeyEmMemoria implements DepositoDePasskeyNoAparelho {
  DepositoDePasskeyEmMemoria({this.conteudo});

  String? conteudo;

  /// Quantas vezes alguem gravou. Os casos leem isto para provar que a marca
  /// foi posta -- e quantas vezes.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    gravacoes += 1;
    conteudo = texto;
  }
}

/// O registro. **So marca, nunca desmarca** -- ver o cabecalho.
class PasskeyNesteAparelho {
  PasskeyNesteAparelho({required this.deposito, this.agora = DateTime.now});

  final DepositoDePasskeyNoAparelho deposito;

  /// O relogio. Publico pelo mesmo motivo do de `AvisoDeCadastro`: nome
  /// privado exigiria formal de inicializacao privado, que a linguagem nao
  /// permite em parametro nomeado.
  final DateTime Function() agora;

  /// Cache de leitura: o arquivo e lido uma vez por processo.
  bool? _memoria;

  /// Cache da RECUSA FORMAL, pelo mesmo motivo de [_memoria].
  bool? _memoriaDaRecusa;

  /// A chave gravada. Escrita a mao, e nao derivada de nome de simbolo: o
  /// arquivo e um contrato com o passado, e renomear algo em Dart nao pode
  /// apagar a marca de ninguem.
  static const String _chave = 'ha_credencial';

  /// A chave da RECUSA FORMAL (28/10/2026). Escrita a mao pelo mesmo motivo de
  /// [_chave]: o arquivo e um contrato com o passado.
  static const String _chaveDaRecusa = 'recusou_formalmente';

  /// Verdadeiro quando ha prova de credencial neste aparelho.
  ///
  /// **Disco que nao responde vira `false`, e o lado seguro aqui e esse.** Ler
  /// `true` por engano gastaria o desafio e abriria a folha do sistema na cara
  /// de quem nao pediu nada; ler `false` por engano custa um toque a mais a
  /// quem tem passkey, numa falha de disco que ja nao esta normal. O oposto do
  /// `AvisoDeCadastro`, e de proposito: la o custo do silencio era esconder a
  /// unica razao de alguem devolver um pet.
  Future<bool> haCredencial() async {
    final memoria = _memoria;
    if (memoria != null) return memoria;
    final lido = await _ler();
    _memoria = lido;
    return lido;
  }

  Future<bool> _ler([String chave = _chave]) async {
    final corpo = await _corpo();
    return corpo[chave] == true;
  }

  /// O JSON gravado, ou um mapa VAZIO quando nao ha nada legivel.
  ///
  /// **Existe porque ha DUAS chaves no arquivo desde 28/10**, e as duas sao
  /// lidas e escritas por caminhos diferentes. Sem um ponto unico, cada
  /// escrita montaria o JSON do zero e apagaria a chave da outra -- que e o
  /// defeito mais facil de cometer aqui, e tem caso proprio na isca.
  ///
  /// Disco que nao responde, JSON quebrado ou corpo que nao e mapa viram mapa
  /// vazio, e o lado seguro e esse: ver [haCredencial].
  Future<Map<String, dynamic>> _corpo() async {
    final String? cru;
    try {
      cru = await deposito.ler();
    } on Object {
      return const <String, dynamic>{};
    }
    if (cru == null || cru.isEmpty) return const <String, dynamic>{};
    try {
      final corpo = jsonDecode(cru);
      if (corpo is! Map<String, dynamic>) return const <String, dynamic>{};
      return corpo;
    } on FormatException {
      return const <String, dynamic>{};
    }
  }

  /// Registra a prova de que existe credencial aqui.
  ///
  /// **Idempotente, e nao grava de novo quando ja esta marcado**: a entrada por
  /// passkey chama isto em toda entrada bem-sucedida, e reescrever o arquivo a
  /// cada login seria escrita em disco por nada.
  Future<void> marcar() async {
    if (_memoria == true) return;
    _memoria = true;
    try {
      // **LE O QUE HAVIA ANTES DE GRAVAR** (28/10/2026).
      //
      // Esta linha montava o JSON do zero. Com a chave da RECUSA FORMAL no
      // mesmo arquivo, gravar do zero apagaria a recusa de quem disse
      // `Não quero` -- e a pessoa voltaria a ser perguntada em todo login,
      // porque `marcar()` roda em toda entrada por passkey bem-sucedida.
      // O contrario tambem vale, e `registrarRecusa` tem o mesmo cuidado.
      final anterior = await _corpo();
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          ...anterior,
          _chave: true,
          'marcado_em': agora().toUtc().toIso8601String(),
        }),
      );
    } on Object {
      // A memoria ja tem o valor certo, entao esta execucao do app usa a
      // passkey. A proxima abertura volta a nao tentar -- que custa um toque,
      // nao uma conta trancada.
    }
  }

  // ======================================================================
  // A RECUSA FORMAL (28/10/2026)
  // ======================================================================
  //
  // Regra de produto do cliente, verbatim: *"na hora do usuario fazer o login,
  // se ele nao tiver o passkey habilitado e nao tiver rejeitado formalmente,
  // devemos solicitar ele. Pois pode ser um cenario onde o usuario tenha feito
  // o cadastro, desinstalado o app e esta voltando"*.
  //
  // **ELA MORA NO APARELHO E NAO NA CONTA, E A RAZAO E A REGRA DELE -- NAO
  // ECONOMIA DE CAMPO.** Esta e a decisao que alguem vai querer "consertar"
  // depois movendo a recusa para o servidor, e o motivo de ela estar escrita
  // aqui com data:
  //
  // Recusa na CONTA **sobreviveria a reinstalacao**, e com isso silenciaria
  // exatamente o usuario que ele quer alcancar -- quem se cadastrou, recusou,
  // desinstalou e esta voltando num aparelho novo ou numa instalacao nova.
  // Recusa LOCAL apaga com a reinstalacao, e aí perguntar de novo e o
  // comportamento **certo**: e literalmente o cenario que ele nomeou. Mover
  // isto para a conta nao e uma melhoria da mesma regra; e outra regra.
  //
  // **Ela nao e o oposto de [haCredencial], e as duas conviv:** uma pessoa
  // pode ter credencial neste aparelho E ter recusado o convite antes de
  // ativar por outro caminho. As duas chaves vivem no mesmo JSON e nenhuma
  // escrita apaga a outra -- ver o `_corpo()` em [marcar].

  /// Verdadeiro quando a pessoa recusou o convite **deliberadamente**.
  ///
  /// **Ausencia de resposta nao e resposta negativa**: arquivo inexistente,
  /// disco que nao responde e JSON quebrado viram `false`, que e o estado de
  /// quem nunca foi perguntada. O lado seguro aqui e o oposto do de
  /// [haCredencial], e de proposito: ler `true` por engano calaria a oferta
  /// para sempre, e ler `false` por engano custa uma pergunta que a pessoa
  /// pode recusar de novo.
  Future<bool> recusouFormalmente() async {
    final memoria = _memoriaDaRecusa;
    if (memoria != null) return memoria;
    final lido = await _ler(_chaveDaRecusa);
    _memoriaDaRecusa = lido;
    return lido;
  }

  /// Registra que a pessoa disse que **nao quer** o login por digital.
  ///
  /// **SO O TOQUE DELIBERADO CHAMA ISTO.** Fechar a folha arrastando, ou o
  /// sistema cancelar o dialogo, e *"agora nao"* e nao recusa -- quem trata
  /// cancelamento como recusa faz a pessoa perder a passkey **para sempre por
  /// um gesto acidental**, e isso e pior que a funcao nao existir. A fronteira
  /// tem dois casos proprios em
  /// `test/sessao/convite_de_passkey_depois_do_login_test.dart`.
  ///
  /// Idempotente, e **preserva a marca de credencial** -- ver [marcar].
  Future<void> registrarRecusa() async {
    if (_memoriaDaRecusa == true) return;
    _memoriaDaRecusa = true;
    try {
      final anterior = await _corpo();
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          ...anterior,
          _chaveDaRecusa: true,
          'recusou_em': agora().toUtc().toIso8601String(),
        }),
      );
    } on Object {
      // Igual a [marcar]: a memoria ja tem o valor certo, entao esta execucao
      // do app nao pergunta de novo. A proxima abertura pergunta -- que custa
      // uma pergunta, e nao uma funcao perdida.
    }
  }
}
