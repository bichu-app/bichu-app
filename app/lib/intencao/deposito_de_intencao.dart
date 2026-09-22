/// Onde o envelope de intenção mora entre uma abertura do app e a seguinte.
///
/// Mesmo desenho da fila offline (`lib/api/fila_offline.dart`), e pela mesma
/// razão: a seção 8.3 exige que o envelope sobreviva ao **app ser encerrado
/// pelo sistema**, e memória de processo não sobrevive a isso. O que muda é
/// que aqui há **um** envelope, e não uma lista — a regra 1 de 8.3 é uma
/// intenção por vez, e a nova substitui a anterior.
///
/// O envelope **não** vai para o chaveiro do sistema, onde mora a sessão. Ele
/// não é segredo: é o rascunho da própria pessoa, no aparelho dela. Chaveiro é
/// caro de ler e escrever, e ele é escrito no pior momento possível (a folha
/// de login subindo, com a pessoa esperando).
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
    // Grava num temporário e renomeia: `rename` é atômico no sistema de
    // arquivos. Escrever por cima direto deixaria um JSON pela metade se o
    // sistema encerrasse o app no meio da gravação — e o meio da gravação é
    // exatamente quando isso acontece, porque o envelope é escrito no momento
    // em que a pessoa sai do app para criar a conta.
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

/// Depósito em memória, para teste de widget e para o build que roda sem
/// disco. Não usar em produção: memória não sobrevive ao app ser encerrado,
/// que é a única razão de o envelope existir.
class DepositoDeIntencaoEmMemoria implements DepositoDaIntencao {
  String? _conteudo;

  @override
  Future<String?> ler() async => _conteudo;

  @override
  Future<void> gravar(String conteudo) async => _conteudo = conteudo;

  @override
  Future<void> apagar() async => _conteudo = null;
}
