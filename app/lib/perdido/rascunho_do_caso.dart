/// O que a pessoa preencheu em F3.1, entre a tela e o envio de F3.2.
///
/// **Ele atravessa telas, e por isso ele nao e estado de widget.** F3.1 colhe,
/// F3.2 envia, e o envelope de intencao (UX 8.3) o grava em disco quando a
/// sessao cai no meio -- tres donos para o mesmo conteudo. Um `State` seria
/// perdido na primeira das tres passagens.
library;

import '../api/modelos_caso.dart';
import '../api/modelos_pet.dart';
import 'quando_foi_visto.dart';

/// O motivo pelo qual `Continuar` esta desabilitado, ou nulo quando ele nao
/// esta.
///
/// **Ele e um tipo, e nao um booleano com um texto ao lado**, porque o criterio
/// 5 exige o motivo VISIVEL junto do botao: botao desabilitado sem motivo dito
/// e desenho preguicoso (F3.1). Enquanto o motivo for um `String?` solto,
/// alguem desabilita o botao sem preenche-lo e ninguem ve.
enum ImpedimentoDeContinuar {
  /// Criterio 5, palavra por palavra de F3.1. **Bairro, cidade e UF bastam**:
  /// o contrato exige `last_seen_at` mais `last_seen_location` OU
  /// `last_seen_area`, e a area sozinha abre o caso.
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

  /// Criterio 10: **o padrao e verdadeiro**. Quem abre um caso esta pedindo
  /// alcance, e perguntar isso a quem esta em panico e uma decisao a mais no
  /// pior momento. A tela mostra o estado e deixa desligar; ela nao pergunta
  /// antes.
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
  ///
  /// A **localizacao vem primeiro** porque e o impedimento que o criterio 5
  /// nomeia e o unico que manda o foco para um campo. Os de data vem depois
  /// porque sao um toque de distancia.
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
  ///
  /// So texto, numero e booleano: `RascunhoDaIntencao` recusa o resto, e a
  /// recusa e o que impede alguem de enfiar os bytes de uma foto aqui.
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
  ///
  /// [pet] entra por fora porque ele **nao** vai no envelope: o pet e do
  /// servidor, e guardar uma copia dele em disco seria dado de conta esperando
  /// a proxima pessoa que entrar naquele aparelho. O envelope guarda o `alvo`,
  /// que e o id, e quem executa busca o resto.
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
