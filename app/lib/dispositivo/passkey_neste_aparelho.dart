/// O sinal LOCAL de que este aparelho tem uma credencial digital do Bichu.
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Onde a marca mora entre uma abertura do app e a seguinte.
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
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }
}

/// Deposito em memoria, para teste de widget.
class DepositoDePasskeyEmMemoria implements DepositoDePasskeyNoAparelho {
  DepositoDePasskeyEmMemoria({this.conteudo});

  String? conteudo;

  /// Quantas vezes alguem gravou.
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

  /// O relogio. Publico pelo mesmo motivo do de `AvisoDeCadastro`: nome privado
  /// exigiria formal de inicializacao privado, que a linguagem nao permite em
  /// parametro nomeado.
  final DateTime Function() agora;

  /// Cache de leitura: o arquivo e lido uma vez por processo.
  bool? _memoria;

  /// Cache da RECUSA FORMAL, pelo mesmo motivo de [_memoria].
  bool? _memoriaDaRecusa;

  /// A chave gravada. Escrita a mao, e nao derivada de nome de simbolo: o
  /// arquivo e um contrato com o passado, e renomear algo em Dart nao pode
  /// apagar a marca de ninguem.
  static const String _chave = 'ha_credencial';

  /// A chave da RECUSA FORMAL (28/10/2026).
  static const String _chaveDaRecusa = 'recusou_formalmente';

  /// Verdadeiro quando ha prova de credencial neste aparelho.
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
  Future<void> marcar() async {
    if (_memoria == true) return;
    _memoria = true;
    try {
      final anterior = await _corpo();
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          ...anterior,
          _chave: true,
          'marcado_em': agora().toUtc().toIso8601String(),
        }),
      );
    } on Object {
      // A memoria ja tem o valor certo, entao esta execucao do app usa a passkey.
    }
  }

  /// Apaga a marca de credencial neste aparelho.
  Future<void> desmarcar() async {
    if (_memoria == false) return;
    _memoria = false;
    try {
      final anterior = await _corpo();
      if (anterior[_chave] != true) return;
      final novo = <String, dynamic>{...anterior}
        ..remove(_chave)
        ..remove('marcado_em')
        ..['desmarcado_em'] = agora().toUtc().toIso8601String();
      await deposito.gravar(jsonEncode(novo));
    } on Object {
      // Igual a [marcar]: a memoria ja tem o valor certo, entao esta execucao do app nao tenta mais a passkey.
    }
  }

  /// Verdadeiro quando a pessoa recusou o convite **deliberadamente**.
  Future<bool> recusouFormalmente() async {
    final memoria = _memoriaDaRecusa;
    if (memoria != null) return memoria;
    final lido = await _ler(_chaveDaRecusa);
    _memoriaDaRecusa = lido;
    return lido;
  }

  /// Registra que a pessoa disse que **nao quer** o login por digital.
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
      // Igual a [marcar]: a memoria ja tem o valor certo, entao esta execucao do app nao pergunta de novo.
    }
  }
}
