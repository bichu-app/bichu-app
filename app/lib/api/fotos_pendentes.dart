/// As fotos escolhidas que ainda nao subiram (BICHUS-87, criterios 6 e 7).
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../dispositivo/camera_e_galeria.dart';
import 'envio_de_foto.dart';

/// Uma foto escolhida, ainda no aparelho, esperando sinal.
class FotoPendente {
  const FotoPendente({
    required this.petId,
    required this.foto,
    required this.criadaEm,
  });

  final String petId;
  final FotoLocal foto;
  final DateTime criadaEm;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'pet_id': petId,
        'caminho': foto.caminho,
        'tipo_de_conteudo': foto.tipoDeConteudo,
        'tamanho_em_bytes': foto.tamanhoEmBytes,
        'criada_em': criadaEm.toIso8601String(),
      };

  static FotoPendente deJson(Map<String, dynamic> json) => FotoPendente(
        petId: json['pet_id'] as String,
        foto: FotoLocal(
          caminho: json['caminho'] as String,
          tipoDeConteudo: json['tipo_de_conteudo'] as String,
          tamanhoEmBytes: json['tamanho_em_bytes'] as int,
        ),
        criadaEm: DateTime.parse(json['criada_em'] as String),
      );
}

/// Onde o registro mora. Separado para o teste nao precisar de aparelho.
abstract class DepositoDeFotosPendentes {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDeFotosEmArquivo implements DepositoDeFotosPendentes {
  DepositoDeFotosEmArquivo({String nomeDoArquivo = 'fotos_pendentes.json'})
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

/// O registro das fotos que ainda nao subiram.
class FotosPendentes {
  FotosPendentes({required this.deposito});

  final DepositoDeFotosPendentes deposito;
  List<FotoPendente>? _memoria;

  /// Acima disso, a mais antiga sai para a nova entrar.
  static const int teto = 20;

  /// As pendentes, **sem deixar um item ruim levar os outros junto**.
  Future<List<FotoPendente>> pendentes() async {
    final emMemoria = _memoria;
    if (emMemoria != null) return List.unmodifiable(emMemoria);

    final bruto = await deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      _memoria = <FotoPendente>[];
      return const <FotoPendente>[];
    }

    final List<dynamic> cru;
    try {
      cru = jsonDecode(bruto) as List<dynamic>;
    } on Object catch (erro, pilha) {
      _relatar(erro, pilha, 'o registro de fotos pendentes estava ilegivel');
      _memoria = <FotoPendente>[];
      return const <FotoPendente>[];
    }

    final sobreviventes = <FotoPendente>[];
    var descartados = 0;
    Object? primeiroErro;
    StackTrace? primeiraPilha;
    for (final bruta in cru) {
      try {
        sobreviventes
            .add(FotoPendente.deJson(Map<String, dynamic>.from(bruta as Map)));
      } on Object catch (erro, pilha) {
        descartados += 1;
        primeiroErro ??= erro;
        primeiraPilha ??= pilha;
      }
    }
    if (descartados > 0) {
      _relatar(
        primeiroErro ?? StateError('item malformado'),
        primeiraPilha,
        'itens malformados descartados do registro de fotos pendentes; '
        '$descartados de ${cru.length}',
      );
    }

    _memoria = sobreviventes;
    return List.unmodifiable(sobreviventes);
  }

  /// **So contagem, nunca conteudo.** O caminho do arquivo identifica o
  /// aparelho e a pessoa, e isto aqui sai do aparelho.
  void _relatar(Object erro, StackTrace? pilha, String oQueAconteceu) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: erro,
        stack: pilha,
        library: 'bichu/fotos_pendentes',
        context: ErrorDescription('ao ler o registro de fotos pendentes'),
        informationCollector: () => <DiagnosticsNode>[
          ErrorDescription(oQueAconteceu),
        ],
      ),
    );
  }

  /// Guarda a foto que nao subiu.
  Future<void> guardar(FotoPendente nova) async {
    final atual = List<FotoPendente>.from(await pendentes())
      ..removeWhere((f) => f.petId == nova.petId)
      ..add(nova);
    while (atual.length > teto) {
      atual.removeAt(0);
    }
    await _persistir(atual);
  }

  Future<void> remover(String petId) async {
    final atual = List<FotoPendente>.from(await pendentes())
      ..removeWhere((f) => f.petId == petId);
    await _persistir(atual);
  }

  /// Apaga o registro inteiro: **a entrada de `limpezasAoSair`**.
  Future<void> limpar() async {
    _memoria = <FotoPendente>[];
    await deposito.gravar('[]');
  }

  Future<void> _persistir(List<FotoPendente> lista) async {
    _memoria = lista;
    await deposito.gravar(jsonEncode(lista.map((f) => f.paraJson()).toList()));
  }
}

/// Quem junta o mecanismo de envio ao registro do que ficou pendente.
class RetomadaDeFotos {
  const RetomadaDeFotos({
    required this.envio,
    required this.registro,
    required this.pets,
  });

  final EnvioDeFoto envio;
  final FotosPendentes registro;
  final IntencaoEConfirmacaoDePet pets;

  /// Envia a foto do pet e decide o que lembrar.
  Future<DesfechoDoEnvio> enviarDoPet({
    required String petId,
    required FotoLocal foto,
    DateTime? agora,
  }) async {
    final desfecho = await envio.enviar(
      foto: foto,
      destino: FotoDePet(api: pets, petId: petId),
    );
    if (desfecho == DesfechoDoEnvio.semSinal) {
      await registro.guardar(
        FotoPendente(
          petId: petId,
          foto: foto,
          criadaEm: agora ?? DateTime.now(),
        ),
      );
    } else {
      await registro.remover(petId);
    }
    return desfecho;
  }

  /// A varredura do arranque: o criterio 7 da BICHUS-87, "o upload sai quando o
  /// sinal voltar".
  Future<int> retomarTudo() async {
    var enviadas = 0;
    for (final pendente in await registro.pendentes()) {
      final desfecho = await envio.enviar(
        foto: pendente.foto,
        destino: FotoDePet(api: pets, petId: pendente.petId),
      );
      if (desfecho == DesfechoDoEnvio.semSinal) break;
      await registro.remover(pendente.petId);
      if (desfecho == DesfechoDoEnvio.enviada) enviadas += 1;
    }
    return enviadas;
  }
}
