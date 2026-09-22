/// O "onde" que o caso (F3.1) e o achado (F3.5) mandam para a API.
///
/// Duas formas, e o contrato aceita as duas: `LostCaseInput` e
/// `StrayFoundReportInput` declaram
/// `anyOf: [required:[location], required:[area]]`. Nenhuma das duas e o
/// caminho de excecao -- quem nega a permissao usa a area e o caso existe do
/// mesmo jeito (criterio 5 da BICHUS-23).
///
/// ## A regra que este arquivo existe para nao deixar quebrar
///
/// **Area nunca vira coordenada, e coordenada nunca vira area.** ADR-0006: nao
/// ha geocodificacao no MVP. Bairro, cidade e UF sao rotulo de exibicao e
/// filtro de listagem; coordenada vem de `device_gps` ou de `map_pin`, e de
/// mais nada.
///
/// Por isso [AreaDigitada] **nao tem** `lat` nem `lon`, e [PontoCapturado]
/// **nao tem** bairro. Nao e esquecimento e nao e para ser corrigido: sao dois
/// tipos que nao se convertem porque a conversao e o que esta proibido. Quando
/// os dois existem juntos ([OndeComPontoEArea]) e porque a PESSOA digitou o
/// bairro, e nao porque alguem derivou um do outro.
///
/// O portao que cobra isso e `app/test/dispositivo/sem_geocodificacao_test.dart`.
library;

import '../dispositivo/localizacao.dart';

/// Bairro, cidade e UF, **como a pessoa digitou**.
///
/// So `cidade` e obrigatoria, e isso vem do contrato (`Area.required: [city]`).
/// Bairro e UF ficam opcionais porque quem esta digitando pode nao saber a
/// sigla do estado de onde encontrou o animal, e exigir a sigla para registrar
/// um achado e exatamente o tipo de campo que a BICHUS-35 proibe.
class AreaDigitada {
  const AreaDigitada({required this.cidade, this.bairro, this.uf});

  final String cidade;
  final String? bairro;

  /// A sigla de duas letras. O contrato limita a `minLength: 2, maxLength: 2`.
  final String? uf;

  /// Vazia quando nem a cidade foi preenchida -- o unico caso em que nao ha
  /// area nenhuma para mandar.
  static AreaDigitada? montar({
    required String cidade,
    String? bairro,
    String? uf,
  }) {
    final c = cidade.trim();
    if (c.isEmpty) return null;
    final b = bairro?.trim();
    final u = uf?.trim();
    return AreaDigitada(
      cidade: c,
      bairro: (b == null || b.isEmpty) ? null : b,
      uf: (u == null || u.isEmpty) ? null : u.toUpperCase(),
    );
  }

  /// O `Area` do contrato.
  Map<String, Object?> get noContrato => <String, Object?>{
        'city': cidade,
        if (bairro != null) 'neighborhood': bairro,
        if (uf != null) 'state': uf,
      };
}

/// Onde o pet foi visto: coordenada, area, ou as duas.
sealed class Onde {
  const Onde();

  /// Tem centro, e portanto o alerta de 5 km pode ter raio.
  ///
  /// E o `LostCase.has_location` do contrato. A tela usa para explicar por que
  /// nao houve alerta, em vez de deixar a secao de alcance vazia -- e
  /// **nunca** para impedir o envio: `no_location` nao e bloqueio (criterio 12
  /// da BICHUS-23).
  bool get temCoordenada;

  /// As chaves do `StrayFoundReportInput` (`location` / `area`).
  Map<String, Object?> get noAchado;

  /// As chaves do `LostCaseInput` (`last_seen_location` / `last_seen_area`).
  Map<String, Object?> get noCaso;
}

/// So a coordenada: o aparelho mediu e a pessoa nao digitou bairro.
class OndePorPonto extends Onde {
  const OndePorPonto(this.ponto);

  final PontoCapturado ponto;

  @override
  bool get temCoordenada => true;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'location': ponto.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_location': ponto.noContrato,
      };
}

/// So a area: a pessoa digitou, e coordenada nao ha.
///
/// **O que se perde e exatamente uma coisa**, e ela esta escrita no criterio
/// 11: o alerta de 5 km nao dispara, porque sem centro nao ha raio. O caso
/// continua entrando na lista publica da cidade e do bairro, e a tag continua
/// levando qualquer pessoa direto ao tutor.
class OndePorArea extends Onde {
  const OndePorArea(this.area);

  final AreaDigitada area;

  @override
  bool get temCoordenada => false;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'area': area.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_area': area.noContrato,
      };
}

/// A coordenada **e** o bairro que a pessoa digitou junto.
///
/// ## Por que este terceiro caso existe
///
/// Porque `area_label` sai nulo sem ele, e esse e um defeito de tela que so
/// apareceria depois. O rotulo que o produto mostra a outra pessoa e bairro e
/// cidade, e quem o monta no servidor (`rotuloDaArea`) le **apenas** os campos
/// digitados: coordenada nao entra ali, nem arredondada. Entao um caso aberto
/// so com GPS chega a lista publica sem rotulo nenhum.
///
/// A saida obvia seria converter a coordenada em bairro. **E ela e justamente
/// a proibida** (ADR-0006). A outra saida e perguntar, e e essa: quando a
/// captura da certo, a tela continua oferecendo o campo de bairro, agora
/// opcional. Quem preencher aparece com rotulo; quem nao preencher aparece sem
/// -- e nenhuma coordenada foi convertida em nada.
///
/// O contrato aceita os dois campos juntos: `anyOf` exige **ao menos um**, e
/// nao no maximo um.
class OndeComPontoEArea extends Onde {
  const OndeComPontoEArea({required this.ponto, required this.area});

  final PontoCapturado ponto;
  final AreaDigitada area;

  @override
  bool get temCoordenada => true;

  @override
  Map<String, Object?> get noAchado => <String, Object?>{
        'location': ponto.noContrato,
        'area': area.noContrato,
      };

  @override
  Map<String, Object?> get noCaso => <String, Object?>{
        'last_seen_location': ponto.noContrato,
        'last_seen_area': area.noContrato,
      };
}

/// Monta o `Onde` a partir do que a tela tem na mao.
///
/// Devolve nulo quando nao ha nem ponto nem cidade -- o unico caso em que o
/// envio ainda nao pode acontecer, e que a tela trata pedindo a cidade, nunca
/// derivando coisa alguma.
Onde? montarOnde({PontoCapturado? ponto, AreaDigitada? area}) {
  if (ponto != null && area != null) {
    return OndeComPontoEArea(ponto: ponto, area: area);
  }
  if (ponto != null) return OndePorPonto(ponto);
  if (area != null) return OndePorArea(area);
  return null;
}
