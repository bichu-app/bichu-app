/// As DUAS oportunidades de pedir a permissao de aviso, e o registro de quais
/// ja foram gastas (UX 10.1, BICHUS-24).
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Os dois momentos em que o app pode oferecer o aviso, e so eles.
enum OportunidadeDeAviso {
  /// F1.6, logo depois de o QR do primeiro pet aparecer.
  primeiroPetCadastrado('primeiro_pet_cadastrado'),

  /// F3.2, ao confirmar o primeiro caso de perdido.
  primeiroCasoDePerdido('primeiro_caso_de_perdido');

  const OportunidadeDeAviso(this.noDisco);

  /// O nome gravado no arquivo.
  final String noDisco;
}

/// Onde o registro mora entre uma abertura do app e a seguinte.
abstract class DepositoDeOportunidades {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDeOportunidadesEmArquivo implements DepositoDeOportunidades {
  DepositoDeOportunidadesEmArquivo({
    String nomeDoArquivo = 'oportunidades_de_aviso.json',
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
class DepositoDeOportunidadesEmMemoria implements DepositoDeOportunidades {
  DepositoDeOportunidadesEmMemoria({String? conteudoInicial})
      : _conteudo = conteudoInicial;

  String? _conteudo;

  /// Quantas vezes alguem gravou.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => _conteudo;

  @override
  Future<void> gravar(String conteudo) async {
    gravacoes += 1;
    _conteudo = conteudo;
  }
}

/// Quais das duas oportunidades ja foram gastas neste aparelho.
class OportunidadesDeAviso {
  OportunidadesDeAviso({required this.deposito});

  /// Publico porque o nome privado exigiria um formal de inicializacao privado,
  /// que a linguagem nao permite em parametro nomeado -- e o resultado seria um
  /// `ignore:` de lint onde nao ha nada para ignorar.
  final DepositoDeOportunidades deposito;

  Set<OportunidadeDeAviso>? _gastas;

  /// O conjunto do que ja foi gasto.
  Future<Set<OportunidadeDeAviso>> gastas() async {
    final memoria = _gastas;
    if (memoria != null) return memoria;
    final lido = await _ler();
    _gastas = lido;
    return lido;
  }

  Future<Set<OportunidadeDeAviso>> _ler() async {
    final String? cru;
    try {
      cru = await deposito.ler();
    } on Object {
      return OportunidadeDeAviso.values.toSet();
    }
    if (cru == null || cru.isEmpty) return <OportunidadeDeAviso>{};
    try {
      final corpo = jsonDecode(cru);
      if (corpo is! Map<String, dynamic>) return <OportunidadeDeAviso>{};
      final lista = corpo['gastas'];
      if (lista is! List) return <OportunidadeDeAviso>{};
      final nomes = lista.whereType<String>().toSet();
      return OportunidadeDeAviso.values
          .where((o) => nomes.contains(o.noDisco))
          .toSet();
    } on FormatException {
      return <OportunidadeDeAviso>{};
    }
  }

  /// `true` quando [qual] ainda nao foi oferecida neste aparelho.
  Future<bool> aindaCabe(OportunidadeDeAviso qual) async =>
      !(await gastas()).contains(qual);

  /// Marca [qual] como gasta, em memoria e em disco.
  Future<void> gastar(OportunidadeDeAviso qual) async {
    final atuais = await gastas();
    if (atuais.contains(qual)) return;
    final novas = <OportunidadeDeAviso>{...atuais, qual};
    _gastas = novas;
    try {
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          'gastas': novas.map((o) => o.noDisco).toList(growable: false),
        }),
      );
    } on Object {
      // A gravacao falhou; a memoria ja tem o valor certo, entao esta execucao do app respeita o limite.
    }
  }
}
