/// O que a pessoa preencheu em F3.1, entre a tela e o envio de F3.2.
library;

import '../api/modelos_caso.dart';
import '../api/modelos_pet.dart';
import 'quando_foi_visto.dart';

/// O motivo pelo qual `Continuar` esta desabilitado, ou nulo quando ele nao
/// esta.
enum ImpedimentoDeContinuar {
  /// Criterio 5, palavra por palavra de F3.1.
  semBairro('Precisamos do bairro para avisar quem está por perto.'),

  /// Nenhuma das quatro opcoes de `Quando?` foi tocada.
  semQuando('Diga quando ele foi visto pela última vez.'),

  /// `Outra data` tocada e o calendario ainda nao respondeu.
  semData('Escolha a data em que ele foi visto.'),

  /// A data escolhida ainda nao chegou.
  dataNoFuturo(dataNoFuturoTexto);

  const ImpedimentoDeContinuar(this.texto);

  final String texto;
}

/// O texto de futuro vem do modulo de regra, e nao e redigitado aqui.
const String dataNoFuturoTexto = dataNoFuturo;

/// O rascunho do caso.
class RascunhoDoCaso {
  RascunhoDoCaso({
    required this.pet,
    this.quando,
    this.dataEscolhida,
    this.bairro = '',
    this.cidade = '',
    this.uf = '',
    this.descricao = '',
    this.compartilharNaListaPublica = true,
  });

  /// De quem e o caso. **O objeto inteiro, e nao so o id**, porque o criterio 1
  /// pede a foto e o nome no topo de F3.1 -- e uma tela que so tivesse o id
  /// precisaria de uma chamada de rede para desenhar o cabecalho, na tela que
  /// tem de funcionar offline (criterio 6).
  final Pet pet;

  QuandoFoiVisto? quando;

  /// So usada com [QuandoFoiVisto.outraData].
  DateTime? dataEscolhida;

  String bairro;
  String cidade;
  String uf;
  String descricao;

  /// Criterio 10: **o padrao e verdadeiro**.
  bool compartilharNaListaPublica;

  /// O teto de `LostCaseInput.description` no contrato.
  static const int limiteDaDescricao = 1000;

  AreaDoAvistamento? get area {
    final c = cidade.trim();
    if (c.isEmpty) return null;
    return AreaDoAvistamento(cidade: c, bairro: bairro.trim(), uf: uf.trim());
  }

  DateTime? instanteEm(DateTime agora) => instanteDoAvistamento(
        quando,
        agora: agora,
        dataEscolhida: dataEscolhida,
      );

  /// O que impede `Continuar`, na ordem em que a tela resolve.
  ImpedimentoDeContinuar? impedimentoEm(DateTime agora) {
    if (area == null) return ImpedimentoDeContinuar.semBairro;
    if (quando == null) return ImpedimentoDeContinuar.semQuando;
    final instante = instanteEm(agora);
    if (instante == null) return ImpedimentoDeContinuar.semData;
    if (estaNoFuturo(instante, agora: agora)) {
      return ImpedimentoDeContinuar.dataNoFuturo;
    }
    return null;
  }

  bool podeContinuarEm(DateTime agora) => impedimentoEm(agora) == null;

  /// Os campos do rascunho como o envelope de intencao os guarda.
  Map<String, Object?> campos() => <String, Object?>{
        'quando': quando?.name,
        'data_escolhida': dataEscolhida?.toIso8601String(),
        'bairro': bairro,
        'cidade': cidade,
        'uf': uf,
        'descricao': descricao,
        'compartilhar': compartilharNaListaPublica,
      };

  /// Reconstroi o rascunho a partir dos campos do envelope.
  static RascunhoDoCaso dosCampos(Pet pet, Map<String, Object?> campos) {
    final bruto = campos['data_escolhida'] as String?;
    return RascunhoDoCaso(
      pet: pet,
      quando: _quandoPorNome(campos['quando'] as String?),
      dataEscolhida: bruto == null ? null : DateTime.tryParse(bruto),
      bairro: campos['bairro'] as String? ?? '',
      cidade: campos['cidade'] as String? ?? '',
      uf: campos['uf'] as String? ?? '',
      descricao: campos['descricao'] as String? ?? '',
      compartilharNaListaPublica: campos['compartilhar'] as bool? ?? true,
    );
  }

  static QuandoFoiVisto? _quandoPorNome(String? nome) {
    for (final q in QuandoFoiVisto.values) {
      if (q.name == nome) return q;
    }
    return null;
  }
}
