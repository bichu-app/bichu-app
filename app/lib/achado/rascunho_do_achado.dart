/// O que a pessoa preencheu em F3.5, entre a tela e o envio.
library;

import '../api/modelos_localizacao.dart';
import '../api/modelos_pet.dart';
import '../dispositivo/camera_e_galeria.dart';
import '../perdido/quando_foi_visto.dart';

/// O motivo pelo qual `Registrar` esta desabilitado, ou nulo quando ele nao
/// esta.
enum ImpedimentoDeRegistrar {
  semEspecie('Diga se é cachorro, gato ou outro bicho.'),

  /// **`porte` E NAO `tamanho`, e a troca e UMA PALAVRA (cliente,
  /// 22/10/2026).**
  semPorte('Diga o porte, do jeito que deu para ver.'),
  semOnde('Diga onde você achou: use a localização ou escreva a cidade.'),
  semQuando('Diga quando você achou.'),
  semData('Escolha a data em que você achou.'),
  dataNoFuturo(dataNoFuturoTexto);

  const ImpedimentoDeRegistrar(this.texto);

  final String texto;
}

/// O texto de futuro vem do modulo de regra, e nao e redigitado aqui: a borda
/// do servidor usa a mesma frase, e duas redacoes da mesma recusa fazem quem le
/// a tela achar que sao duas coisas diferentes.
const String dataNoFuturoTexto = dataNoFuturo;

/// O rascunho do achado.
class RascunhoDoAchado {
  RascunhoDoAchado({
    this.especie,
    this.porte,
    this.sexo,
    this.racaCodigo,
    this.corCodigo,
    this.versaoDaReferencia,
    this.quando,
    this.dataEscolhida,
    this.onde,
    this.observacao = '',
    this.shareToken,
    this.foto,
  });

  /// `StrayFoundReportInput.species`.
  Especie? especie;

  /// `StrayFoundReportInput.size`.
  Porte? porte;

  /// `sex`. Opcional: um animal assustado no colo nao se examina.
  Sexo? sexo;

  /// `breed_code`. Opcional, e **so da lista fechada**.
  String? racaCodigo;

  /// `primary_color_code`. Opcional, lista fechada de `reference-data`.
  String? corCodigo;

  /// `ref_data_version`: a versao da lista **que o cliente tinha em maos**.
  String? versaoDaReferencia;

  /// O `Quando?`, na mesma forma de F3.1.
  QuandoFoiVisto? quando;

  /// So usada com [QuandoFoiVisto.outraData].
  DateTime? dataEscolhida;

  /// O `onde`, como a captura de localizacao o publica.
  Onde? onde;

  /// `notes`. Opcional.
  String observacao = '';

  /// `share_token`: so existe para quem chegou pelo push de um caso especifico
  /// (criterio 10).
  String? shareToken;

  /// A foto, **no aparelho**.
  FotoLocal? foto;

  /// O teto de `StrayFoundReportInput.notes` no contrato: **500**.
  static const int limiteDaObservacao = 500;

  DateTime? instanteEm(DateTime agora) => instanteDoAvistamento(
        quando,
        agora: agora,
        dataEscolhida: dataEscolhida,
      );

  /// O que impede **avancar do passo 1**, na ordem em que o passo 1 pergunta.
  ImpedimentoDeRegistrar? impedimentoDoPasso1() {
    if (especie == null) return ImpedimentoDeRegistrar.semEspecie;
    if (porte == null) return ImpedimentoDeRegistrar.semPorte;
    return null;
  }

  /// O que impede `Registrar` **dentro do passo 2**.
  ImpedimentoDeRegistrar? impedimentoDoPasso2(DateTime agora) {
    if (quando == null) return ImpedimentoDeRegistrar.semQuando;
    final instante = instanteEm(agora);
    if (instante == null) return ImpedimentoDeRegistrar.semData;
    if (estaNoFuturo(instante, agora: agora)) {
      return ImpedimentoDeRegistrar.dataNoFuturo;
    }
    if (onde == null) return ImpedimentoDeRegistrar.semOnde;
    return null;
  }

  /// O que impede `Registrar`, olhando os dois passos.
  ImpedimentoDeRegistrar? impedimentoEm(DateTime agora) =>
      impedimentoDoPasso1() ?? impedimentoDoPasso2(agora);

  bool podeRegistrarEm(DateTime agora) => impedimentoEm(agora) == null;

  /// Tem ponto, e portanto o cruzamento tem o criterio de distancia.
  bool get temCoordenada => onde?.temCoordenada ?? false;

  /// Tem rotulo de area para aparecer com bairro e cidade.
  bool get temRotuloDeArea => switch (onde) {
        OndePorArea() || OndeComPontoEArea() => true,
        OndePorPonto() || null => false,
      };

  /// O ponto capturado, decomposto em dois numeros.
  ({double lat, double lon})? get coordenada => switch (onde) {
        OndePorPonto(:final ponto) || OndeComPontoEArea(:final ponto) =>
          (lat: ponto.lat, lon: ponto.lon),
        OndePorArea() || null => null,
      };

  /// A area digitada, ou nula.
  AreaDigitada? get areaDigitada => switch (onde) {
        OndePorArea(:final area) || OndeComPontoEArea(:final area) => area,
        OndePorPonto() || null => null,
      };

  /// Os campos do rascunho como o envelope de intencao os guarda (UX 8.3).
  Map<String, Object?> campos() {
    final area = areaDigitada;
    return <String, Object?>{
      'especie': especie?.valor,
      'porte': porte?.valor,
      'sexo': sexo?.valor,
      'raca': racaCodigo,
      'cor': corCodigo,
      'versao_da_referencia': versaoDaReferencia,
      'quando': quando?.name,
      'data_escolhida': dataEscolhida?.toIso8601String(),
      'cidade': area?.cidade,
      'bairro': area?.bairro,
      'uf': area?.uf,
      'observacao': observacao,
      'share_token': shareToken,
    };
  }

  /// Reconstroi o rascunho a partir dos campos do envelope.
  static RascunhoDoAchado dosCampos(
    Map<String, Object?> campos, {
    double? lat,
    double? lon,
  }) {
    final bruto = campos['data_escolhida'] as String?;
    return RascunhoDoAchado(
      especie: Especie.de(campos['especie'] as String?),
      porte: Porte.de(campos['porte'] as String?),
      sexo: Sexo.de(campos['sexo'] as String?),
      racaCodigo: campos['raca'] as String?,
      corCodigo: campos['cor'] as String?,
      versaoDaReferencia: campos['versao_da_referencia'] as String?,
      quando: _quandoPorNome(campos['quando'] as String?),
      dataEscolhida: bruto == null ? null : DateTime.tryParse(bruto),
      onde: ondeJaCapturado(
        lat: lat,
        lon: lon,
        area: AreaDigitada.montar(
          cidade: campos['cidade'] as String? ?? '',
          bairro: campos['bairro'] as String?,
          uf: campos['uf'] as String?,
        ),
      ),
      observacao: campos['observacao'] as String? ?? '',
      shareToken: campos['share_token'] as String?,
    );
  }

  static QuandoFoiVisto? _quandoPorNome(String? nome) {
    for (final q in QuandoFoiVisto.values) {
      if (q.name == nome) return q;
    }
    return null;
  }
}
