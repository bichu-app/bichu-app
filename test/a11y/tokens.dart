// Carrega design/tokens.json e entrega os valores ja resolvidos.
//
// Nao ha valor de cor, tamanho ou peso escrito neste arquivo, e isso e
// deliberado: se as fixtures repetissem os hex, elas passariam a testar a
// propria copia em vez do design system. Tudo sai de design/tokens.json, que e
// a fonte unica (docs/06-design-system.md, paragrafo 18.2.2).
//
// REGRA DE OURO DESTE ARQUIVO: quando ele nao consegue achar ou ler os tokens,
// ele LEVANTA. Nunca devolve um padrao, nunca pula o teste. Verificacao que nao
// consegue verificar precisa reprovar, senao o portao fica verde por ausencia,
// que e exatamente o que as duas travas do paragrafo 18.2 existem para impedir.

library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

/// Caminho da pasta `design/`, quando passado por
/// `--dart-define=bichu.design=/caminho/para/design`.
///
/// Existe porque o pacote Flutter do app nao esta na raiz do repositorio: quem
/// roda `flutter test` de um diretorio que nao enxerga `design/` acima de si
/// precisa dizer onde ele esta. Sem o define, a busca sobe a arvore.
const String _designDefinido = String.fromEnvironment('bichu.design');

/// Acha a pasta `design/` subindo a partir do diretorio de trabalho.
Directory diretorioDesign() {
  if (_designDefinido.isNotEmpty) {
    final d = Directory(_designDefinido);
    if (!File('${d.path}/tokens.json').existsSync()) {
      throw StateError(
        'REPROVA: -Dbichu.design aponta para "${d.path}", e nao ha tokens.json ali.\n'
        'O portao de acessibilidade nao tem o que verificar. Corrija o caminho '
        'em vez de deixar o job passar.',
      );
    }
    return d;
  }

  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/design/tokens.json').existsSync()) {
      return Directory('${dir.path}/design');
    }
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }

  throw StateError(
    'REPROVA: nao achei design/tokens.json subindo a partir de '
    '"${Directory.current.path}".\n'
    'Sem os tokens nao ha contraste a conferir, e um portao que nao acha o que '
    'verificar reprova com o motivo, nunca aprova por ausencia '
    '(docs/07-devops.md, secao 5.4).\n'
    'Passe -Dbichu.design=<raiz>/design se o pacote Flutter nao estiver abaixo '
    'da raiz do repositorio.',
  );
}

/// Le e resolve `design/tokens.json`.
class TokensBichu {
  TokensBichu(this.raiz);

  factory TokensBichu.doDisco() {
    final arquivo = File('${diretorioDesign().path}/tokens.json');
    final texto = arquivo.readAsStringSync();
    final json = jsonDecode(texto);
    if (json is! Map<String, dynamic>) {
      throw StateError('REPROVA: ${arquivo.path} nao e um objeto JSON.');
    }
    return TokensBichu(json);
  }

  final Map<String, dynamic> raiz;

  /// O `$value` bruto de um token, por caminho pontuado (`cor.claro.surface`).
  dynamic bruto(String caminho) {
    dynamic atual = raiz;
    for (final parte in caminho.split('.')) {
      if (atual is! Map || !atual.containsKey(parte)) {
        throw StateError(
          'REPROVA: token "$caminho" nao existe em design/tokens.json '
          '(parou em "$parte").',
        );
      }
      atual = atual[parte];
    }
    if (atual is! Map || !atual.containsKey(r'$value')) {
      throw StateError(
        'REPROVA: "$caminho" e um grupo, nao um token: nao tem \$value.',
      );
    }
    return atual[r'$value'];
  }

  /// Resolve a cadeia de apelidos `{grupo.token}` do formato DTCG.
  dynamic resolver(String caminho, {int profundidade = 0}) {
    if (profundidade > 16) {
      throw StateError('REPROVA: ciclo de apelidos em "$caminho".');
    }
    final v = bruto(caminho);
    if (v is String && v.startsWith('{') && v.endsWith('}')) {
      return resolver(
        v.substring(1, v.length - 1),
        profundidade: profundidade + 1,
      );
    }
    return v;
  }

  /// Hex normalizado em maiusculas, no formato `#RRGGBB` ou `#RRGGBBAA`.
  ///
  /// Normalizado porque a comparacao entre destinos e por valor, nao por
  /// string bruta: `#ffc400` e `#FFC400` sao o mesmo token, nao uma
  /// divergencia (paragrafo 18.2.2, item 2).
  String hex(String caminho) {
    final v = resolver(caminho);
    if (v is! String || !v.startsWith('#')) {
      throw StateError('REPROVA: "$caminho" nao e uma cor hex: $v');
    }
    return v.toUpperCase();
  }

  Color cor(String caminho) => corDoHex(hex(caminho));

  /// Valor numerico de um token de dimensao ou duracao (`{value, unit}`).
  double dimensao(String caminho) {
    final v = resolver(caminho);
    if (v is Map && v['value'] is num) return (v['value'] as num).toDouble();
    if (v is num) return v.toDouble();
    throw StateError('REPROVA: "$caminho" nao e uma dimensao: $v');
  }

  /// Monta o `TextStyle` de um dos doze papeis do paragrafo 8.2.
  TextStyle tipo(String nome, {required Color cor}) {
    final v = resolver('type.$nome');
    if (v is! Map) {
      throw StateError('REPROVA: "type.$nome" nao e um token tipografico.');
    }
    final tamanho = (v['fontSize']['value'] as num).toDouble();
    final entrelinha = (v['lineHeight']['value'] as num).toDouble();
    final espacejamentoEm = (v['letterSpacing']['value'] as num).toDouble();

    final familia = _resolverValor(v['fontFamily']);
    final peso = _resolverValor(v['fontWeight']);

    return TextStyle(
      color: cor,
      fontFamily: familia is List ? familia.first as String : familia as String,
      fontSize: tamanho,
      height: entrelinha / tamanho,
      letterSpacing: espacejamentoEm * tamanho,
      fontWeight: _peso((peso as num).toInt()),
    );
  }

  dynamic _resolverValor(dynamic v) {
    if (v is String && v.startsWith('{') && v.endsWith('}')) {
      return resolver(v.substring(1, v.length - 1));
    }
    return v;
  }

  static FontWeight _peso(int n) => FontWeight.values.firstWhere(
    (w) => w.value == n,
    orElse: () => throw StateError('REPROVA: peso $n nao existe.'),
  );
}

/// `#RRGGBB` ou `#RRGGBBAA` (ordem do DTCG) para `Color` (ordem ARGB).
Color corDoHex(String h) {
  var s = h.replaceFirst('#', '').toUpperCase();
  if (s.length == 6) s = '${s}FF';
  if (s.length != 8) {
    throw StateError('REPROVA: hex fora do formato: "$h"');
  }
  final rgb = int.parse(s.substring(0, 6), radix: 16);
  final a = int.parse(s.substring(6, 8), radix: 16);
  return Color((a << 24) | rgb);
}

/// De volta para `#RRGGBB`, para a mensagem de reprovacao ser copiavel.
String hexDaCor(Color c) {
  final v = c.toARGB32() & 0xFFFFFF;
  return '#${v.toRadixString(16).toUpperCase().padLeft(6, '0')}';
}
