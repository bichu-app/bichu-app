/// O registro de quantas vezes o aviso persistente de cadastro foi dispensado,
/// e de quando foi a ultima (BICHUS-75, criterios 4 e 6).
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// O ciclo do criterio 4: dispensado, some por 7 dias, volta cheio, repete.
const Duration janelaDeSilencio = Duration(days: 7);

/// Quantas dispensas seguidas trocam o texto para o de endereco errado
/// (criterio 6).
const int dispensasQueTrocamOTexto = 3;

/// O que o registro sabe sobre uma conta.
class EstadoDoAviso {
  const EstadoDoAviso({this.dispensadoEm, this.dispensas = 0});

  /// Quando a pessoa tocou em `Agora nao` pela ultima vez.
  final DateTime? dispensadoEm;

  /// Quantas vezes seguidas ela dispensou.
  final int dispensas;

  static const EstadoDoAviso nenhum = EstadoDoAviso();
}

/// Onde o registro mora entre uma abertura do app e a seguinte.
abstract class DepositoDoAvisoDeCadastro {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
  Future<void> apagar();
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDoAvisoEmArquivo implements DepositoDoAvisoDeCadastro {
  DepositoDoAvisoEmArquivo({String nomeDoArquivo = 'aviso_de_cadastro.json'})
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

/// Deposito em memoria, para teste de widget.
class DepositoDoAvisoEmMemoria implements DepositoDoAvisoDeCadastro {
  DepositoDoAvisoEmMemoria({String? conteudoInicial})
      : conteudo = conteudoInicial;

  String? conteudo;

  /// Quantas vezes alguem mandou apagar.
  int apagamentos = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async => conteudo = texto;

  @override
  Future<void> apagar() async {
    apagamentos += 1;
    conteudo = null;
  }
}

/// O registro de dispensas do aviso persistente, por conta.
class AvisoDeCadastro {
  AvisoDeCadastro({required this.deposito, this.agora = DateTime.now});

  final DepositoDoAvisoDeCadastro deposito;

  /// O relogio. Publico porque o nome privado exigiria um formal de
  /// inicializacao privado, que a linguagem nao permite em parametro nomeado.
  final DateTime Function() agora;

  /// Cache de leitura: o arquivo e lido uma vez por processo.
  EstadoDoAviso? _memoria;
  String? _contaEmMemoria;

  /// O que esta registrado para [idDaConta].
  Future<EstadoDoAviso> estado(String idDaConta) async {
    if (_contaEmMemoria == idDaConta) {
      final memoria = _memoria;
      if (memoria != null) return memoria;
    }
    final lido = await _ler(idDaConta);
    _contaEmMemoria = idDaConta;
    _memoria = lido;
    return lido;
  }

  Future<EstadoDoAviso> _ler(String idDaConta) async {
    final String? cru;
    try {
      cru = await deposito.ler();
    } on Object {
      return EstadoDoAviso.nenhum;
    }
    if (cru == null || cru.isEmpty) return EstadoDoAviso.nenhum;
    try {
      final corpo = jsonDecode(cru);
      if (corpo is! Map<String, dynamic>) return EstadoDoAviso.nenhum;
      if (corpo['conta'] != idDaConta) return EstadoDoAviso.nenhum;
      final quando = corpo['dispensado_em'];
      return EstadoDoAviso(
        dispensadoEm: quando is String ? DateTime.tryParse(quando) : null,
        dispensas: corpo['dispensas'] is int ? corpo['dispensas'] as int : 0,
      );
    } on FormatException {
      return EstadoDoAviso.nenhum;
    }
  }

  /// Registra um toque em `Agora nao`.
  Future<void> dispensar(String idDaConta) async {
    final atual = await estado(idDaConta);
    final novo = EstadoDoAviso(
      dispensadoEm: agora(),
      dispensas: atual.dispensas + 1,
    );
    _contaEmMemoria = idDaConta;
    _memoria = novo;
    try {
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          'conta': idDaConta,
          'dispensado_em': novo.dispensadoEm!.toUtc().toIso8601String(),
          'dispensas': novo.dispensas,
        }),
      );
    } on Object {
      // A memoria ja tem o valor certo, entao esta execucao do app respeita o silencio.
    }
  }

  /// A entrada de `limpezasAoSair`.
  Future<void> limpar() async {
    _memoria = null;
    _contaEmMemoria = null;
    try {
      await deposito.apagar();
    } on Object {
      // Nada a fazer: o arquivo continua la, e a chave por conta o neutraliza para o proximo tutor.
    }
  }

  /// Verdadeiro quando o silencio de 7 dias ainda vale.
  bool silencioVale(EstadoDoAviso registro) {
    final quando = registro.dispensadoEm;
    if (quando == null) return false;
    return agora().difference(quando) < janelaDeSilencio;
  }
}
