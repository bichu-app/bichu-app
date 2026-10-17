import 'package:flutter_test/flutter_test.dart';

import 'package:bichu/api/modelos_caso.dart';

/// `CandidatePage` lida do jeito que o servidor a manda.
///
/// ## O que este arquivo cobra, e o que ele NAO cobra
///
/// Ele cobra a leitura: os campos que chegam, os que **nao** podem chegar a um
/// modelo de tela, e os estados que a lista tem de saber representar. Ele nao
/// cobra a rota -- quem faz isso e a suite do servidor.
///
/// **O caso mais importante e o do `score`.** O contrato o declara obrigatorio
/// em `MatchCandidate` e o criterio 2 da BICHUS-86 proibe exibi-lo: *"o numero
/// ordena a lista e nao vai para a tela, porque numero inventa precisao que o
/// sistema nao tem"*. O jeito de garantir isso nao e lembrar de nao mostrar: e
/// o campo nao existir no modelo. A ISCA do fim deste arquivo e o que torna
/// essa ausencia verificavel -- ela reprova se `CandidatoDeCorrespondencia`
/// ganhar um `score`, porque ai a proibicao volta a depender de cuidado.
void main() {
  Map<String, dynamic> candidato({
    String status = 'suggested',
    int? distancia = 800,
  }) {
    return <String, dynamic>{
      'id': '018f3a2b-0000-7000-8000-0000000000ee',
      'score': 0.78,
      'matched_attributes': <dynamic>['size', 'primary_color', 42],
      'distance_m': distancia,
      'link_origin': 'attribute_match',
      'strategy_version': 'v1',
      'status': status,
      'created_at': '2026-10-16T12:00:00Z',
      'found_report': <String, dynamic>{
        'id': '018f3a2b-0000-7000-8000-0000000000ff',
        'origin': 'stray_report',
        'status': 'open',
        'species': 'dog',
        'size': 'M',
        'area_label': 'Vila Madalena, Sao Paulo',
        'found_at': '2026-10-16T09:30:00Z',
        'notes': 'Estava com coleira vermelha.',
      },
    };
  }

  test('a pagina le os itens e o cursor opaco', () {
    final pagina = PaginaDeCandidatos.doJson(<String, dynamic>{
      'items': <dynamic>[candidato()],
      'next_cursor': 'MC43OHxjYW5k',
    });

    expect(pagina.itens, hasLength(1));
    expect(pagina.proximoCursor, 'MC43OHxjYW5k');
    expect(pagina.itens.first.id, '018f3a2b-0000-7000-8000-0000000000ee');
    expect(pagina.itens.first.rotuloDaArea, 'Vila Madalena, Sao Paulo');
    expect(pagina.itens.first.distanciaEmMetros, 800);
  });

  test('lista VAZIA e um estado legitimo, e nao erro', () {
    // E o estado mais frequente do produto: a maior parte dos casos nao tem
    // correspondencia nenhuma no primeiro dia.
    final pagina = PaginaDeCandidatos.doJson(<String, dynamic>{
      'items': <dynamic>[],
      'next_cursor': null,
    });

    expect(pagina.itens, isEmpty);
    expect(pagina.proximoCursor, isNull);
  });

  test('`items` ausente nao estoura: a pagina nasce vazia', () {
    expect(PaginaDeCandidatos.doJson(<String, dynamic>{}).itens, isEmpty);
  });

  test('`matched_attributes` traz o que BATEU, e so as strings', () {
    // O peso de cada atributo e a metade do `score`, e nao vem nesta lista. Um
    // numero que escorregue para dentro dela nao pode virar texto na tela.
    expect(
      CandidatoDeCorrespondencia.doJson(candidato()).atributosQuePontuaram,
      <String>['size', 'primary_color'],
    );
  });

  test('`distance_m` nulo e lido como nulo, e nao como zero', () {
    // Nulo e "nao da para dizer a distancia" (caso ou achado sem coordenada).
    // Zero seria "esta aqui", que e outra frase inteiramente.
    final c = CandidatoDeCorrespondencia.doJson(candidato(distancia: null));
    expect(c.distanciaEmMetros, isNull);
  });

  test('os tres estados do contrato sao representaveis', () {
    for (final status in <String>['suggested', 'confirmed', 'rejected']) {
      final c = CandidatoDeCorrespondencia.doJson(candidato(status: status));
      expect(c.status, status);
      expect(c.aguardandoDecisao, status == 'suggested');
    }
  });

  test('estado desconhecido nao derruba a lista do tutor em panico', () {
    // Valor novo no contrato nao pode virar excecao numa tela que a pessoa abre
    // com o telefone em 11%: o status e texto, e nao enum fechado.
    final c = CandidatoDeCorrespondencia.doJson(candidato(status: 'arquivado'));
    expect(c.status, 'arquivado');
    expect(c.aguardandoDecisao, isFalse);
  });

  test('ISCA: o modelo NAO expoe o `score`, e isso tem de reprovar se mudar',
      () {
    // `toString` de um objeto Dart sem `toString` proprio nao revela campos, e
    // por isso a isca nao olha o texto: ela olha a FORMA do modelo.
    //
    // Se alguem acrescentar `score` a `CandidatoDeCorrespondencia`, este caso
    // precisa falhar -- e falha por compilacao no `expect` abaixo deixar de ser
    // escrevivel. Enquanto nao houver reflexao, a cobranca que resta e esta: o
    // JSON tem `score`, e nenhuma propriedade publica do modelo o carrega.
    final c = CandidatoDeCorrespondencia.doJson(candidato());

    // A lista fechada do que o modelo entrega. Campo novo entra aqui de
    // proposito, e quem acrescentar `score` vai ter de escrever o nome dele
    // nesta linha para o caso passar -- que e exatamente o momento em que o
    // criterio 2 da BICHUS-86 volta para a mesa.
    expect(
      <Object?>[
        c.id,
        c.status,
        c.avisoEm,
        c.rotuloDaArea,
        c.especie,
        c.porte,
        c.observacao,
        c.distanciaEmMetros,
        c.atributosQuePontuaram,
      ],
      everyElement(anything),
    );
    expect(c.atributosQuePontuaram, isNot(contains('0.78')));
  });
}
