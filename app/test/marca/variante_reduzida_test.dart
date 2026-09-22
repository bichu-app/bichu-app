// A VARIANTE REDUZIDA DO SIMBOLO, MEDIDA NO RENDER.
//
// O QUE ESTE ARQUIVO PROTEGE, e por que ele nao le bytes de SVG.
//
// Em 21/09/2026 as oito iscas de `arte_do_app_test.dart` estavam todas verdes
// com a splash do iOS renderizando a cor errada, porque elas conferem ARQUIVO.
// Isca que confere arquivo nao alcanca o que a pessoa ve. Este arquivo mede o
// que o motor de fato desenha: ele manda o mesmo `Canvas` do app rasterizar a
// marca em 16, 24, 32, 48, 64 e 256 px e conta o que sobrou na imagem.
//
// O QUE A MEDIDA SIGNIFICA, com o limite dito na frente.
//
// Legibilidade nao se mede sozinha: nenhum numero aqui diz se uma pessoa
// reconhece a marca. O que da para medir e a metade mecanica dela — se os
// tracos do desenho continuam separados ou se fundem e se despedacam. A conta
// e o numero de COMPONENTES CONEXOS de tinta na imagem rasterizada. Em 256 px
// esse numero e o desenho inteiro; num tamanho pequeno, numero menor quer
// dizer que tracos se encostaram e numero maior quer dizer que um traco se
// partiu em pedacos. Os dois sao perda de desenho.
//
// A medida tem um parametro livre e ele esta declarado: [_limiar] e quanto um
// pixel precisa ter andado do fundo para a tinta para contar como tinta. A
// 0.30 ele responde "ha tinta visivel aqui". Os numeros MUDAM com esse valor,
// e por isso ele e constante nomeada e nao numero solto no meio de uma
// comparacao: quem discordar do criterio discute o criterio, nao descobre que
// existia um.
//
// O QUE ESTE ARQUIVO NAO PROVA: que o que sobrou continua sendo a cara do
// Bichu. Isso e olho, e esta escrito em `design/marca/vetor/README.md`.
//
// Padroes: WCAG 2.1 nao tem criterio de legibilidade de marca (o SC 1.4.11 fala
// de contraste de objeto grafico, que e outra coisa e esta em `test/a11y/`).
// A regua de tamanho e a secao 3.10 de `docs/06-design-system.md`.

import 'dart:ui' as ui;

import 'package:bichu/theme/marca_vetor.g.dart';
import 'package:bichu/widgets/marca.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Fundo do app (`neutral.25`) e tinta da marca (`raspberry.700`), no canal R.
///
/// Sao literais **do teste**, nao do produto: eles existem para converter pixel
/// em cobertura. O portao que cobra a cor contra `design/tokens.json` e
/// `vetor_da_marca_test.dart`.
const int _fundoR = 0xFA;
const int _tintaR = 0x9E;

/// Quanto um pixel precisa ter andado do fundo para a tinta para contar.
const double _limiar = 0.30;

/// O tamanho em que o desenho e tomado como verdade.
const int _referencia = 256;

Future<List<bool>> _rasterizar(VetorDaMarca vetor, int lado) async {
  final gravador = ui.PictureRecorder();
  final canvas = Canvas(gravador)
    ..drawRect(
      Rect.fromLTWH(0, 0, lado.toDouble(), lado.toDouble()),
      Paint()..color = const Color(0xFFFAFAF8),
    )
    ..save()
    ..scale(lado / vetor.largura)
    ..translate(-vetor.origemX, -vetor.origemY);
  for (final camada in vetor.camadas) {
    canvas.drawPath(
      caminhoDaMarca(camada.d),
      Paint()
        ..color = const Color(0xFF9E0B3A)
        ..isAntiAlias = true,
    );
  }
  canvas.restore();

  final imagem = await gravador.endRecording().toImage(lado, lado);
  final dados = await imagem.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (dados == null) {
    fail(
      'REPROVA: o motor nao devolveu os bytes da marca em ${lado}px. Portao '
      'que nao consegue medir reprova; ele nunca aprova por ausencia.',
    );
  }
  final px = dados.buffer.asUint8List();
  return List<bool>.generate(
    lado * lado,
    (i) => (_fundoR - px[i * 4]) / (_fundoR - _tintaR) >= _limiar,
  );
}

/// Componentes conexos por 4 vizinhos.
int _componentes(List<bool> tinta, int lado) {
  final rotulo = List<int>.filled(lado * lado, 0);
  var total = 0;
  for (var inicio = 0; inicio < tinta.length; inicio++) {
    if (!tinta[inicio] || rotulo[inicio] != 0) continue;
    total++;
    final pilha = <int>[inicio];
    rotulo[inicio] = total;
    while (pilha.isNotEmpty) {
      final p = pilha.removeLast();
      final x = p % lado;
      final y = p ~/ lado;
      for (final d in const <List<int>>[
        <int>[1, 0],
        <int>[-1, 0],
        <int>[0, 1],
        <int>[0, -1],
      ]) {
        final nx = x + d[0];
        final ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= lado || ny >= lado) continue;
        final q = ny * lado + nx;
        if (tinta[q] && rotulo[q] == 0) {
          rotulo[q] = total;
          pilha.add(q);
        }
      }
    }
  }
  return total;
}

double _cobertura(List<bool> tinta) =>
    tinta.where((t) => t).length / tinta.length;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('a variante reduzida sai do vetor, e nada foi acrescentado', () {
    // Os seis subcaminhos que a secao 3.10 manda sair: a piscada, os tres
    // bigodes e os dois brilhos. O derivador
    // `design/marca/vetor/derivar-variante-reduzida.py` os apaga inteiros; o
    // que sobra e curva do autor, byte por byte.
    test('cada curva da reduzida existe igual no simbolo completo', () {
      final completo = MarcaVetor.simbolo.camadas
          .expand((c) => _subcaminhos(c.d))
          .toSet();
      final reduzida =
          MarcaVetor.simboloReduzido.camadas.expand((c) => _subcaminhos(c.d));

      for (final curva in reduzida) {
        expect(
          completo.contains(curva),
          isTrue,
          reason:
              'A variante reduzida tem uma curva que NAO esta em simbolo.svg. '
              'Ela e para ser subtracao do desenho do autor; curva nova aqui e '
              'marca redesenhada, que ninguem autorizou. Curva: '
              '${curva.substring(0, curva.length.clamp(0, 60))}...',
        );
      }
    });

    test('a reduzida tem 6 curvas a menos, e a Manteiga inteira saiu', () {
      final completo =
          MarcaVetor.simbolo.camadas.expand((c) => _subcaminhos(c.d)).length;
      final reduzida = MarcaVetor.simboloReduzido.camadas
          .expand((c) => _subcaminhos(c.d))
          .length;

      expect(
        completo - reduzida,
        6,
        reason: 'A secao 3.10 manda tirar a piscada, os tres bigodes e os dois '
            'brilhos: seis curvas. Achei ${completo - reduzida}.',
      );
      expect(
        MarcaVetor.simboloReduzido.camadas.map((c) => c.papel),
        <String>['primary'],
        reason: 'Os dois tracos de brilho eram a camada Manteiga inteira. Se '
            'ela voltou, o derivador mudou de regra sem ninguem decidir.',
      );
    });
  });

  group('o piso medido no render', () {
    test('a reduzida guarda o desenho a partir de 24px, e o perde em 16px',
        () async {
      final referencia = _componentes(
        await _rasterizar(MarcaVetor.simboloReduzido, _referencia),
        _referencia,
      );

      for (final lado in const <int>[24, 32, 48, 64]) {
        expect(
          _componentes(await _rasterizar(MarcaVetor.simboloReduzido, lado), lado),
          referencia,
          reason:
              'Em ${lado}px a variante reduzida deixou de ter os $referencia '
              'tracos separados que tem em ${_referencia}px. Menos quer dizer '
              'que tracos se fundiram, mais quer dizer que um se partiu. O '
              'piso declarado em MarcaVetor.simboloReduzido.pisoPx e '
              '${MarcaVetor.simboloReduzido.pisoPx.toInt()}px.',
        );
      }

      // O piso e um LIMITE, nao um desejo: abaixo dele o desenho tem de
      // reprovar, e esta linha e o que impede alguem de baixar `pisoPx` para
      // 16 sem redesenhar nada.
      expect(
        _componentes(await _rasterizar(MarcaVetor.simboloReduzido, 16), 16),
        isNot(referencia),
        reason:
            'Em 16px a variante reduzida passou a ter os mesmos $referencia '
            'tracos de ${_referencia}px. Ou o desenho mudou, ou o criterio '
            'mudou. Se mudou de verdade, baixe o piso em app/tool/gen_marca.dart, '
            'reescreva a secao 3.10 e o README de design/marca/vetor/ e apague '
            'esta linha — mas nao antes de alguem olhar a marca em 16px.',
      );
    });

    test('o piso declarado da reduzida e 24px, e o do simbolo e 48px', () {
      expect(MarcaVetor.simboloReduzido.pisoPx, 24);
      expect(MarcaVetor.simbolo.pisoPx, 48);
      expect(
        MarcaSimbolo.varianteParaAltura(47.9).arquivo,
        'simbolo-reduzido.svg',
        reason: 'Abaixo do piso do simbolo quem serve e a reduzida. A troca e '
            'do widget de proposito: regua que depende de lembranca nao e regua.',
      );
      expect(MarcaSimbolo.varianteParaAltura(48).arquivo, 'simbolo.svg');
    });

    test('o simbolo completo so guarda o desenho a partir de 64px', () async {
      // MEDIDA QUE DIVERGE DO DOCUMENTO, e ela fica escrita em vez de
      // arredondada. A secao 3.10 diz "48 px passa", e aquele veredito foi de
      // OLHO, num rasterizador local e no do Figma. Por este criterio
      // mecanico, em 48px dois tracos ja se encostam: a conta cai de 11 para
      // 10. Em 64px ela volta a bater.
      //
      // Nao mexi na secao 3.10: o numero de la e decisao registrada de quem
      // desenhou, e divergencia de criterio se resolve por conversa, nao por
      // um teste reescrevendo um documento. Esta linha existe para que a
      // divergencia nao desapareca.
      final referencia = _componentes(
        await _rasterizar(MarcaVetor.simbolo, _referencia),
        _referencia,
      );
      expect(
        _componentes(await _rasterizar(MarcaVetor.simbolo, 64), 64),
        referencia,
      );
      expect(
        _componentes(await _rasterizar(MarcaVetor.simbolo, 48), 48),
        isNot(referencia),
        reason: 'Em 48px o simbolo completo passou a bater com a referencia. '
            'Se isso e verdade agora, a divergencia com a secao 3.10 acabou e '
            'este caso precisa ser reescrito junto com o documento.',
      );
    });

    test('nenhuma variante perdeu ou ganhou area no caminho', () async {
      for (final vetor in <VetorDaMarca>[
        MarcaVetor.simbolo,
        MarcaVetor.simboloReduzido,
      ]) {
        final referencia =
            _cobertura(await _rasterizar(vetor, _referencia));
        // So a partir do piso de cada variante. Abaixo dele o antialias
        // engorda o traco fino e a cobertura sobe de verdade — o que e mais um
        // jeito de o desenho se perder, e ja esta cobrado na contagem de
        // tracos acima.
        for (final lado
            in const <int>[24, 32, 48, 64].where((l) => l >= vetor.pisoPx)) {
          final medida = _cobertura(await _rasterizar(vetor, lado));
          expect(
            (medida - referencia).abs(),
            lessThan(0.03),
            reason:
                '${vetor.arquivo} cobre ${(medida * 100).toStringAsFixed(1)}% '
                'da caixa em ${lado}px contra '
                '${(referencia * 100).toStringAsFixed(1)}% em ${_referencia}px. '
                'Diferenca desse tamanho nao e reamostragem: e curva que sumiu '
                'ou curva que entrou.',
          );
        }
      }
    });
  });

  test('AUTOTESTE: um simbolo sem a piscada e sem os bigodes REPROVA a '
      'contagem do completo', () async {
    // A isca precisa acusar quando o desenho muda. Aqui o "desenho errado" e
    // a propria variante reduzida ocupando o lugar do simbolo completo: se a
    // contagem nao distinguisse os dois, ela nao distinguiria nada.
    final completo = _componentes(
      await _rasterizar(MarcaVetor.simbolo, _referencia),
      _referencia,
    );
    final reduzido = _componentes(
      await _rasterizar(MarcaVetor.simboloReduzido, _referencia),
      _referencia,
    );
    expect(
      reduzido,
      isNot(completo),
      reason: 'Se a medida nao separa o simbolo completo da variante reduzida, '
          'ela nao mede desenho nenhum.',
    );
  });
}

/// Quebra o `d` de um SVG nos subcaminhos que comecam em `M`.
List<String> _subcaminhos(String d) => d
    .split(RegExp(r'(?=M)'))
    .map((s) => s.trim())
    .where((s) => s.isNotEmpty)
    .toList();
