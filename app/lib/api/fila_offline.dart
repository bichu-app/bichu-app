/// A fila de ações que saíram sem conexão (BICHUS-31, critérios 1 e 13).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';
import 'falhas.dart';

/// Uma ação esperando sinal.
class AcaoEnfileirada {
  const AcaoEnfileirada({
    required this.id,
    required this.metodo,
    required this.caminho,
    required this.corpo,
    required this.idempotencyKey,
    required this.criadaEm,
    this.tentativas = 0,
  });

  final String id;
  final String metodo;

  /// Caminho relativo a `/v1`.
  final String caminho;

  final Map<String, dynamic> corpo;

  /// A chave da PRIMEIRA tentativa.
  final String idempotencyKey;

  final DateTime criadaEm;
  final int tentativas;

  AcaoEnfileirada comMaisUmaTentativa() => AcaoEnfileirada(
        id: id,
        metodo: metodo,
        caminho: caminho,
        corpo: corpo,
        idempotencyKey: idempotencyKey,
        criadaEm: criadaEm,
        tentativas: tentativas + 1,
      );

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'id': id,
        'metodo': metodo,
        'caminho': caminho,
        'corpo': corpo,
        'idempotency_key': idempotencyKey,
        'criada_em': criadaEm.toIso8601String(),
        'tentativas': tentativas,
      };

  static AcaoEnfileirada deJson(Map<String, dynamic> json) => AcaoEnfileirada(
        id: json['id'] as String,
        metodo: json['metodo'] as String,
        caminho: json['caminho'] as String,
        corpo: Map<String, dynamic>.from(json['corpo'] as Map),
        idempotencyKey: json['idempotency_key'] as String,
        criadaEm: DateTime.parse(json['criada_em'] as String),
        tentativas: (json['tentativas'] as int?) ?? 0,
      );
}

/// Onde a fila mora. Separado para o teste não precisar de aparelho.
abstract class DepositoDaFila {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementação em arquivo, no diretório do app.
class DepositoEmArquivo implements DepositoDaFila {
  DepositoEmArquivo({String nomeDoArquivo = 'fila_offline.json'})
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
}

/// Local: resultado de uma tentativa da fila, decidido no aparelho.
enum ResultadoDoEnvio {
  /// Saiu. Some da fila.
  entregue,

  /// Ainda sem sinal. Fica na fila, sem contar tentativa.
  semSinal,

  /// O servidor recusou de um jeito que tentar de novo não resolve.
  recusada,
}

/// A fila.
class FilaOffline {
  FilaOffline({required this._deposito});

  final DepositoDaFila _deposito;
  List<AcaoEnfileirada>? _memoria;

  /// Acima disso, a ação mais antiga sai para a nova entrar.
  static const int teto = 50;

  /// As ações pendentes, **sem deixar um item ruim levar os outros junto**.
  Future<List<AcaoEnfileirada>> pendentes() async {
    final emMemoria = _memoria;
    if (emMemoria != null) return List.unmodifiable(emMemoria);

    final bruto = await _deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }

    final List<dynamic> cru;
    try {
      cru = jsonDecode(bruto) as List<dynamic>;
    } on Object catch (erro, pilha) {
      _relatar(
        erro,
        pilha,
        'a fila offline inteira estava ilegível e foi descartada',
        <String, int>{'bytes_no_arquivo': bruto.length},
      );
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }

    final sobreviventes = <AcaoEnfileirada>[];
    var descartados = 0;
    Object? primeiroErro;
    StackTrace? primeiraPilha;

    for (final bruta in cru) {
      try {
        sobreviventes
            .add(AcaoEnfileirada.deJson(Map<String, dynamic>.from(bruta as Map)));
      } on Object catch (erro, pilha) {
        descartados += 1;
        primeiroErro ??= erro;
        primeiraPilha ??= pilha;
      }
    }

    if (descartados > 0) {
      _relatar(
        primeiroErro ?? StateError('item malformado na fila offline'),
        primeiraPilha,
        'itens malformados descartados da fila offline; os demais foram mantidos',
        <String, int>{
          'descartados': descartados,
          'mantidos': sobreviventes.length,
          'itens_no_arquivo': cru.length,
        },
      );
    }

    _memoria = sobreviventes;
    return List.unmodifiable(sobreviventes);
  }

  void _relatar(
    Object erro,
    StackTrace? pilha,
    String oQueAconteceu,
    Map<String, int> numeros,
  ) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: erro,
        stack: pilha,
        library: 'bichu/fila_offline',
        context: ErrorDescription('ao ler a fila offline do disco'),
        informationCollector: () => <DiagnosticsNode>[
          ErrorDescription(oQueAconteceu),
          for (final entrada in numeros.entries)
            ErrorDescription('${entrada.key}: ${entrada.value}'),
        ],
      ),
    );
  }

  Future<void> enfileirar(AcaoEnfileirada acao) async {
    final atual = List<AcaoEnfileirada>.from(await pendentes());
    atual.add(acao);
    while (atual.length > teto) {
      atual.removeAt(0);
    }
    await _persistir(atual);
  }

  Future<void> remover(String id) async {
    final atual = List<AcaoEnfileirada>.from(await pendentes())
      ..removeWhere((a) => a.id == id);
    await _persistir(atual);
  }

  /// Apaga a fila inteira: **a entrada de `limpezasAoSair`** (BICHUS-21).
  Future<void> limpar() async {
    _memoria = <AcaoEnfileirada>[];
    await _deposito.gravar('[]');
  }

  /// Tenta enviar tudo, **na ordem em que entrou**.
  Future<int> reenviarTudo(
    Future<ResultadoDoEnvio> Function(AcaoEnfileirada) enviar,
  ) async {
    var entregues = 0;
    for (final acao in await pendentes()) {
      final resultado = await enviar(acao);
      if (resultado == ResultadoDoEnvio.semSinal) break;
      await remover(acao.id);
      if (resultado == ResultadoDoEnvio.entregue) entregues += 1;
    }
    return entregues;
  }

  Future<void> _persistir(List<AcaoEnfileirada> lista) async {
    _memoria = lista;
    await _deposito.gravar(jsonEncode(lista.map((a) => a.paraJson()).toList()));
  }
}

/// A varredura que DRENA a fila.
class RetomadaDaFila {
  const RetomadaDaFila({required this.fila, required this.api});

  final FilaOffline fila;
  final ApiClient api;

  /// Drena a fila. Devolve quantas ações saíram de fato.
  Future<int> drenar() async {
    try {
      return await fila.reenviarTudo(_enviar);
    } on Object {
      return 0;
    }
  }

  Future<ResultadoDoEnvio> _enviar(AcaoEnfileirada acao) async {
    try {
      if (acao.metodo != 'POST') return ResultadoDoEnvio.semSinal;
      await api.post(
        acao.caminho,
        corpo: acao.corpo,
        idempotencyKey: acao.idempotencyKey,
      );
      return ResultadoDoEnvio.entregue;
    } on FalhaDeChamada catch (falha) {
      return _desfecho(falha);
    }
  }

  static ResultadoDoEnvio _desfecho(FalhaDeChamada falha) {
    return switch (falha) {
      FalhaDeConexao() => ResultadoDoEnvio.semSinal,
      FalhaDeTempo() => ResultadoDoEnvio.semSinal,
      FalhaDeEnderecoRecusado() => ResultadoDoEnvio.semSinal,
      FalhaDaApi(:final problem) => _desfechoDoStatus(problem.status),
    };
  }

  static ResultadoDoEnvio _desfechoDoStatus(int status) {
    if (status == 401 || status == 403) return ResultadoDoEnvio.semSinal;
    if (status == 429) return ResultadoDoEnvio.semSinal;
    if (status >= 500) return ResultadoDoEnvio.semSinal;
    if (status >= 400) return ResultadoDoEnvio.recusada;
    return ResultadoDoEnvio.semSinal;
  }
}
