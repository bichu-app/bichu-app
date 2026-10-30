/// Onde o envelope de intenção mora entre uma abertura do app e a seguinte.
library;

import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Onde o envelope mora. Abstrato **para o teste não precisar de aparelho**:
/// `getApplicationDocumentsDirectory` é um canal de plataforma, e um teste de
/// unidade que dependesse dele só rodaria no simulador.
abstract class DepositoDaIntencao {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
  Future<void> apagar();
}

/// Implementação em arquivo, no diretório do app.
class DepositoDeIntencaoEmArquivo implements DepositoDaIntencao {
  DepositoDeIntencaoEmArquivo({String nomeDoArquivo = 'intencao_pendente.json'})
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
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }

  @override
  Future<void> apagar() async {
    final arquivo = await _abrir();
    if (arquivo.existsSync()) await arquivo.delete();
  }
}

/// Depósito em memória, para teste de widget e para o build que roda sem disco.
class DepositoDeIntencaoEmMemoria implements DepositoDaIntencao {
  String? _conteudo;

  @override
  Future<String?> ler() async => _conteudo;

  @override
  Future<void> gravar(String conteudo) async => _conteudo = conteudo;

  @override
  Future<void> apagar() async => _conteudo = null;
}
