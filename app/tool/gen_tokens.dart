// Gerador de tokens do Bichu.
//
// Le `design/tokens.json` **na raiz do repositorio** (formato W3C Design
// Tokens Community Group), resolve os apelidos `{caminho.para.o.token}` e
// escreve `lib/theme/bichu_tokens.g.dart`.
//
// Rode a partir de `app/`:
//
//   dart run tool/gen_tokens.dart
//
// A fonte fica fora deste pacote de proposito. `docs/06-design-system.md`
// paragrafo 18.2.2 exige **uma** fonte e dois destinos gerados: o Dart daqui e
// o CSS da rota publica do QR. Uma copia dos tokens dentro de `app/` seria uma
// segunda fonte da verdade, que e exatamente o defeito que aquele paragrafo
// existe para impedir.
library;

import 'dart:convert';
import 'dart:io';

/// Onde o gerador procura a fonte, em ordem.
const List<String> _candidatos = <String>[
  '../design/tokens.json',
  'design/tokens.json',
];

const String _cabecalho = '''
// GERADO POR app/tool/gen_tokens.dart A PARTIR DE design/tokens.json — NÃO EDITE.
//
// Para mudar um valor, edite design/tokens.json na raiz do repositório e rode,
// de dentro de app/:
//   dart run tool/gen_tokens.dart
//
// ignore_for_file: lines_longer_than_80_chars
''';

/// Onde o contrato dos papeis nunca-texto vive, dentro de `tokens.json`.
const String _chaveNuncaTexto = 'bichu.nunca-texto';

/// Papeis de cor cujo nome em Dart e deliberadamente feio.
///
/// Esses valores nunca podem pintar texto ou icone: na identidade Framboesa
/// medem de 1.60:1 (Verde suave) a 2.20:1 (manteiga pressionada) contra a
/// superficie marfim. Um nome feio no ponto de uso e uma revisao de
/// codigo que se faz sozinha, e e greppavel (paragrafo 18.2.1).
///
/// A lista **nao** e escrita aqui. Ela e lida de
/// `$extensions.$_chaveNuncaTexto` em `design/tokens.json`, que e o mesmo
/// contrato que a suite de acessibilidade cobra. Uma lista a mao no gerador
/// seria a segunda fonte da verdade que o paragrafo 18.2.2 existe para
/// impedir: um papel novo entraria na paleta com nome bonito e ninguem veria.
late Map<String, String> _nomesFeios;

late Map<String, dynamic> _tokens;

/// Le o contrato e reprova alto quando ele nao da para ser lido.
///
/// Gerador que nao acha a lista precisa parar, nao seguir com zero nomes
/// feios: o silencio aqui produz um Dart em que `communityFill` chega bonito
/// ao ponto de uso, e ninguem procura o que acredita ja ter.
Map<String, String> _lerNomesFeios(Map<String, dynamic> raiz) {
  final extensoes = raiz[r'$extensions'];
  if (extensoes is! Map<String, dynamic>) {
    throw StateError(
      r'design/tokens.json nao tem $extensions. O contrato dos papeis '
      'nunca-texto vive em $_chaveNuncaTexto e sem ele o gerador emitiria '
      'nome bonito para cor que nunca pode ser texto (paragrafo 18.2.1).',
    );
  }
  final declarado = extensoes[_chaveNuncaTexto];
  if (declarado is! Map<String, dynamic>) {
    throw StateError(
      r'design/tokens.json nao declara $extensions'
      '.$_chaveNuncaTexto. Sem esse contrato o gerador nao sabe quais '
      'papeis precisam de nome feio, e emitir todos com nome bonito e '
      'pior que nao gerar.',
    );
  }

  final nomes = <String, String>{};
  declarado.forEach((papel, nome) {
    if (papel.startsWith(r'$')) return; // metadado do DTCG, nao e papel
    if (nome is! String || nome.isEmpty) {
      throw StateError(
        'O papel "$papel" em $_chaveNuncaTexto nao declara um nome Dart.',
      );
    }
    nomes[papel] = nome;
  });

  if (nomes.isEmpty) {
    throw StateError(
      '$_chaveNuncaTexto esta vazio. Lista de proibicao vazia e um portao '
      'que aprova tudo.',
    );
  }
  return nomes;
}

/// Todo papel declarado como nunca-texto precisa existir na paleta.
///
/// Papel declarado e inexistente e uma proibicao que nao protege nada, e ela
/// passaria despercebida porque o gerador simplesmente nao a usaria.
void _conferirCoberturaDosNomesFeios(Map<String, dynamic> papeis) {
  final ausentes = _nomesFeios.keys
      .where((papel) => !papeis.containsKey(papel))
      .toList(growable: false);
  if (ausentes.isNotEmpty) {
    throw StateError(
      'Papeis declarados em $_chaveNuncaTexto que nao existem em cor.claro: '
      '${ausentes.join(', ')}. Ou o papel foi renomeado sem atualizar o '
      'contrato, ou o contrato ganhou um papel que a paleta nao tem.',
    );
  }
}

void main(List<String> args) {
  final entrada = _acharFonte();
  if (entrada == null) {
    stderr.writeln(
      'design/tokens.json nao encontrado a partir de ${Directory.current.path}. '
      'Procurei em: ${_candidatos.join(', ')}. Rode o gerador de dentro de app/.',
    );
    exitCode = 1;
    return;
  }

  _tokens = jsonDecode(entrada.readAsStringSync()) as Map<String, dynamic>;
  _nomesFeios = _lerNomesFeios(_tokens);

  final saida = StringBuffer()
    ..writeln(_cabecalho)
    ..writeln("import 'package:flutter/animation.dart';")
    ..writeln("import 'package:flutter/painting.dart';")
    ..writeln();

  _escreveCores(saida);
  _escreveTipografia(saida);
  _escreveDimensoes(saida, <String>['space'], 'BichuEspaco',
      prefixo: 'e', descricao: 'Escala de espacamento. Base 4, uma escala so.');
  _escreveDimensoes(saida, <String>['radius'], 'BichuRaio',
      descricao: 'Escala de raio.');
  _escreveDimensoes(saida, <String>['border', 'focus'], 'BichuBorda',
      descricao: 'Larguras de borda e o anel de foco.');
  _escreveDimensoes(saida, <String>['target'], 'BichuAlvoDeToque',
      descricao: 'Alvo de toque. Contrato de acessibilidade, nao estilo.');
  _escreveDimensoes(saida, <String>['layout'], 'BichuLayout',
      descricao: 'Grid e medida de linha.');
  _escreveDuracoes(saida);
  _escreveCurvas(saida);
  _escreveSombras(saida);

  final destino = File('lib/theme/bichu_tokens.g.dart');
  destino.parent.createSync(recursive: true);
  destino.writeAsStringSync(saida.toString());
  stdout.writeln('gerado ${destino.path} a partir de ${entrada.path}');
}

File? _acharFonte() {
  for (final caminho in _candidatos) {
    final arquivo = File(caminho);
    if (arquivo.existsSync()) return arquivo;
  }
  return null;
}

// --------------------------------------------------------------------------
// Cor
// --------------------------------------------------------------------------

void _escreveCores(StringBuffer out) {
  final cor = _tokens['cor']! as Map<String, dynamic>;
  final claro = _itens(cor['claro']! as Map<String, dynamic>);
  final escuro = _itens(cor['escuro']! as Map<String, dynamic>);

  if (claro.keys.join(',') != escuro.keys.join(',')) {
    throw StateError(
      'Tema claro e escuro precisam declarar os mesmos papeis. Claro tem '
      '${claro.length}, escuro tem ${escuro.length}. Tema escuro nao e '
      'inversao: cada papel foi medido separadamente, e um papel so num lado e '
      'um par que ninguem mediu.',
    );
  }

  _conferirCoberturaDosNomesFeios(claro);

  final campos = claro.keys.map(_nomeDeCampo).toList(growable: false);

  out
    ..writeln('/// Os ${claro.length} papeis semanticos de cor, nos dois temas.')
    ..writeln('///')
    ..writeln('/// Fonte: design/tokens.json, grupo `cor`.')
    ..writeln('///')
    ..writeln('/// ${_nomesFeios.length} deles nunca podem pintar texto nem icone e por isso')
    ..writeln('/// carregam nome feio, conforme \$extensions.$_chaveNuncaTexto:')
    ..writeln('/// ${_nomesFeios.keys.join(', ')}.')
    ..writeln('class BichuCores {')
    ..writeln('  const BichuCores({');
  for (final campo in campos) {
    out.writeln('    required this.$campo,');
  }
  out
    ..writeln('  });')
    ..writeln();
  for (final campo in campos) {
    out.writeln('  final Color $campo;');
  }
  out.writeln();

  _escreveInstanciaDeCores(out, 'claro', claro);
  out.writeln();
  _escreveInstanciaDeCores(out, 'escuro', escuro);

  out
    ..writeln('}')
    ..writeln();
}

void _escreveInstanciaDeCores(
  StringBuffer out,
  String nome,
  Map<String, dynamic> papeis,
) {
  out.writeln('  static const BichuCores $nome = BichuCores(');
  papeis.forEach((papel, definicao) {
    final hex = _resolve((definicao as Map<String, dynamic>)[r'$value'])!
        as String;
    out.writeln('    ${_nomeDeCampo(papel)}: ${_corDart(hex)},');
  });
  out.writeln('  );');
}

String _nomeDeCampo(String papel) => _nomesFeios[papel] ?? _camel(papel);

String _corDart(String hex) {
  final limpo = hex.replaceFirst('#', '');
  final rgb = limpo.substring(0, 6).toUpperCase();
  final alfa = limpo.length >= 8 ? limpo.substring(6, 8).toUpperCase() : 'FF';
  return 'Color(0x$alfa$rgb)';
}

// --------------------------------------------------------------------------
// Tipografia
// --------------------------------------------------------------------------

void _escreveTipografia(StringBuffer out) {
  final tipo = _itens(_tokens['type']! as Map<String, dynamic>);

  out
    ..writeln('/// Uma entrada da escala tipografica.')
    ..writeln('///')
    ..writeln('/// `entrelinha` vem em pixels logicos, como no documento; o')
    ..writeln('/// tema converte para a razao que o Flutter chama de `height`.')
    ..writeln('class BichuTipo {')
    ..writeln('  const BichuTipo({')
    ..writeln('    required this.familia,')
    ..writeln('    required this.peso,')
    ..writeln('    required this.tamanho,')
    ..writeln('    required this.entrelinha,')
    ..writeln('    required this.espacejamentoEm,')
    ..writeln('  });')
    ..writeln()
    ..writeln('  final String familia;')
    ..writeln('  final int peso;')
    ..writeln('  final double tamanho;')
    ..writeln('  final double entrelinha;')
    ..writeln('  final double espacejamentoEm;')
    ..writeln()
    ..writeln('  /// Razao esperada por `TextStyle.height`.')
    ..writeln('  double get altura => entrelinha / tamanho;')
    ..writeln()
    ..writeln('  /// Espacejamento em pixels logicos, que e o que o Flutter usa.')
    ..writeln('  double get espacejamento => espacejamentoEm * tamanho;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// As ${tipo.length} entradas da escala tipografica.')
    ..writeln('abstract final class BichuEscalaDeTipo {');

  tipo.forEach((nome, definicao) {
    final v = (definicao as Map<String, dynamic>)[r'$value']
        as Map<String, dynamic>;
    final familia = _familia(v['fontFamily']);
    final peso = (_resolve(v['fontWeight'])! as num).toInt();
    out
      ..writeln('  static const BichuTipo ${_camel(nome)} = BichuTipo(')
      ..writeln("    familia: '$familia',")
      ..writeln('    peso: $peso,')
      ..writeln('    tamanho: ${_numero(v['fontSize'])},')
      ..writeln('    entrelinha: ${_numero(v['lineHeight'])},')
      ..writeln('    espacejamentoEm: ${_numero(v['letterSpacing'])},')
      ..writeln('  );');
  });

  out
    ..writeln()
    ..writeln('  static const List<BichuTipo> todos = <BichuTipo>[')
    ..writeln(tipo.keys.map((n) => '    ${_camel(n)},').join('\n'))
    ..writeln('  ];')
    ..writeln('}')
    ..writeln();
}

/// A familia vem como lista (`fontFamily` do DTCG). O pubspec declara a
/// primeira exatamente com este nome.
String _familia(Object? valor) {
  final resolvido = _resolve(valor);
  if (resolvido is List) return resolvido.first.toString();
  return resolvido.toString();
}

// --------------------------------------------------------------------------
// Dimensoes, duracoes, curvas e sombras
// --------------------------------------------------------------------------

void _escreveDimensoes(
  StringBuffer out,
  List<String> grupos,
  String classe, {
  String prefixo = '',
  required String descricao,
}) {
  out
    ..writeln('/// $descricao')
    ..writeln('///')
    ..writeln('/// Fonte: design/tokens.json, grupo(s) `${grupos.join('`, `')}`.')
    ..writeln('abstract final class $classe {');

  for (final grupo in grupos) {
    final itens = _itens(_tokens[grupo]! as Map<String, dynamic>);
    itens.forEach((nome, definicao) {
      final valor = (definicao as Map<String, dynamic>)[r'$value'];
      final numero = _talvezNumero(valor);
      if (numero == null) return;
      final base = grupos.length > 1 && grupo != grupos.first
          ? '$grupo-$nome'
          : nome;
      final campo = prefixo.isEmpty ? _camel(base) : '$prefixo$nome';
      out.writeln('  static const double $campo = $numero;');
    });
  }

  out
    ..writeln('}')
    ..writeln();
}

void _escreveDuracoes(StringBuffer out) {
  final itens = _itens(_tokens['motion']! as Map<String, dynamic>);
  out
    ..writeln('/// Duracoes de movimento. Nada acima de 320 ms.')
    ..writeln('abstract final class BichuMovimento {');
  itens.forEach((nome, definicao) {
    final ms = _talvezNumero((definicao as Map<String, dynamic>)[r'$value']);
    if (ms == null) return;
    out.writeln(
      '  static const Duration ${_camel(nome)} = '
      'Duration(milliseconds: ${ms.split('.').first});',
    );
  });
  out
    ..writeln('}')
    ..writeln();
}

void _escreveCurvas(StringBuffer out) {
  final itens = _itens(_tokens['easing']! as Map<String, dynamic>);
  out
    ..writeln('/// Curvas de aceleracao.')
    ..writeln('abstract final class BichuCurva {');
  itens.forEach((nome, definicao) {
    final p = ((definicao as Map<String, dynamic>)[r'$value'] as List)
        .map((e) => _numero(e))
        .toList();
    out.writeln(
      '  static const Cubic ${_camel(nome)} = '
      'Cubic(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]});',
    );
  });
  out
    ..writeln('}')
    ..writeln();
}

void _escreveSombras(StringBuffer out) {
  final itens = _itens(_tokens['shadow']! as Map<String, dynamic>);
  out
    ..writeln('/// Sombras do tema claro.')
    ..writeln('///')
    ..writeln('/// No tema escuro a lista e vazia e a borda de 1px entra no')
    ..writeln('/// lugar: sobreposicao tonal gera diferencas de 1.1:1 a 1.3:1')
    ..writeln('/// entre camadas, invisiveis em tela barata e sob sol.')
    ..writeln('abstract final class BichuSombra {');
  itens.forEach((nome, definicao) {
    final camadas = (definicao as Map<String, dynamic>)[r'$value'] as List;
    out.writeln(
      '  static const List<BoxShadow> ${_camel(nome)} = <BoxShadow>[',
    );
    for (final camada in camadas) {
      final c = camada as Map<String, dynamic>;
      out
        ..writeln('    BoxShadow(')
        ..writeln('      color: ${_corDart(c['color']! as String)},')
        ..writeln('      offset: Offset(${_numero(c['offsetX'])}, '
            '${_numero(c['offsetY'])}),')
        ..writeln('      blurRadius: ${_numero(c['blur'])},')
        ..writeln('      spreadRadius: ${_numero(c['spread'])},')
        ..writeln('    ),');
    }
    out.writeln('  ];');
  });
  out
    ..writeln()
    ..writeln('  /// Tema escuro nao usa sombra.')
    ..writeln('  static const List<BoxShadow> nenhuma = <BoxShadow>[];')
    ..writeln('}')
    ..writeln();
}

// --------------------------------------------------------------------------
// Utilitarios
// --------------------------------------------------------------------------

/// Remove as chaves de metadado (`$type`, `$description`, ...) de um grupo.
Map<String, dynamic> _itens(Map<String, dynamic> grupo) {
  return Map<String, dynamic>.fromEntries(
    grupo.entries.where((e) => !e.key.startsWith(r'$')),
  );
}

/// Resolve `{caminho.para.o.token}` ate chegar num valor literal.
Object? _resolve(Object? valor) {
  var atual = valor;
  var saltos = 0;
  while (atual is String && atual.startsWith('{') && atual.endsWith('}')) {
    if (++saltos > 10) {
      throw StateError('Apelido circular em design/tokens.json: $valor');
    }
    Object? no = _tokens;
    for (final chave in atual.substring(1, atual.length - 1).split('.')) {
      if (no is! Map<String, dynamic> || !no.containsKey(chave)) {
        throw StateError('Apelido aponta para token inexistente: $atual');
      }
      no = no[chave];
    }
    atual = (no! as Map<String, dynamic>)[r'$value'];
  }
  return atual;
}

/// `{"value": 16, "unit": "px"}`, um numero cru, ou um apelido para qualquer
/// um dos dois. Devolve nulo quando o token nao e numerico — e ha varios que
/// nao sao (eixos de icone, o `d` de um SVG), e eles simplesmente nao viram
/// constante Dart.
String? _talvezNumero(Object? valor) {
  final resolvido = _resolve(valor);
  if (resolvido is num) return _dart(resolvido);
  if (resolvido is Map<String, dynamic> && resolvido['value'] is num) {
    return _dart(resolvido['value']! as num);
  }
  return null;
}

String _numero(Object? valor) {
  final numero = _talvezNumero(valor);
  if (numero == null) {
    throw StateError('Esperava um valor numerico e recebi: $valor');
  }
  return numero;
}

String _dart(num valor) {
  final d = valor.toDouble();
  return d == d.roundToDouble() ? '${d.toInt()}.0' : '$d';
}

String _camel(String nome) {
  final partes = nome.split(RegExp(r'[-_ ]'));
  return partes.first +
      partes
          .skip(1)
          .map((p) => p.isEmpty ? p : p[0].toUpperCase() + p.substring(1))
          .join();
}
