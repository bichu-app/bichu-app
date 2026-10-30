/// A última cidade escolhida na listagem pública de perdidos.
library;

import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Onde o nome da cidade é guardado.
abstract interface class DepositoDaCidade {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementação em arquivo, no diretório do app.
class DepositoDaCidadeEmArquivo implements DepositoDaCidade {
  DepositoDaCidadeEmArquivo({String nomeDoArquivo = 'cidade_dos_perdidos.txt'})
      : _nome = nomeDoArquivo;

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
    await arquivo.writeAsString(conteudo, flush: true);
  }
}

/// Depósito em memória, para os testes.
class DepositoDaCidadeEmMemoria implements DepositoDaCidade {
  DepositoDaCidadeEmMemoria({this.conteudo});

  String? conteudo;

  /// Quantas vezes alguém mandou gravar.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    gravacoes += 1;
    conteudo = texto;
  }
}

/// Um depósito que **estoura nas duas pontas**, para a isca do armazenamento
/// bloqueado.
class DepositoDaCidadeQueFalha implements DepositoDaCidade {
  const DepositoDaCidadeQueFalha();

  @override
  Future<String?> ler() async =>
      throw const FileSystemException('armazenamento bloqueado');

  @override
  Future<void> gravar(String conteudo) async =>
      throw const FileSystemException('armazenamento bloqueado');
}

/// A cidade guardada, com toda falha engolida.
class CidadeEscolhida {
  CidadeEscolhida({DepositoDaCidade? deposito})
      : _deposito = deposito ?? DepositoDaCidadeEmArquivo();

  final DepositoDaCidade _deposito;

  /// O teto do contrato para `city` (`maxLength: 80`).
  static const int limiteDeCaracteres = 80;

  /// A cidade guardada, ou nulo.
  Future<String?> ler() async {
    try {
      final bruto = await _deposito.ler();
      final limpo = bruto?.trim();
      if (limpo == null || limpo.isEmpty) return null;
      if (limpo.length > limiteDeCaracteres) return null;
      return limpo;
    } on Object {
      return null;
    }
  }

  /// Guarda a cidade. **Nunca lança, e nunca espera ser esperada**: quem chama
  /// já tem a lista na tela, e uma gravação que falha não pode desfazer isso.
  Future<void> guardar(String cidade) async {
    final limpo = cidade.trim();
    if (limpo.isEmpty || limpo.length > limiteDeCaracteres) return;
    try {
      await _deposito.gravar(limpo);
    } on Object {
      return;
    }
  }
}
