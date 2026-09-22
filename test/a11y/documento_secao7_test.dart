// O portao do paragrafo 7 de docs/06-design-system.md.
//
// POR QUE ELE EXISTE. Ate 21/09/2026 o paragrafo 7 afirmava, em negrito, que
// "nao ha como um ficar para tras do outro sem o job reprovar". Era falso:
// contraste_tokens_test.dart le design/contrast-pairs.json e design/tokens.json
// e NUNCA abriu o `.md`. A prova viva eram quatro razoes da rampa anterior que
// sobreviveram na prosa do paragrafo 7 por dias, com a esteira verde o tempo
// inteiro -- 8.65 e 7.98 onde hoje se le 8.59 e 7.92, 1.24 e 1.05 onde se le
// 1.25 e 1.06.
//
// A mesma doenca derrubou as iscas da marca em 21/09: elas liam bytes de
// arquivo e nao o render, e ficaram verdes com a splash do iOS pintando
// #AD0038. Portao que diz conferir e nao confere e pior que portao nenhum,
// porque ocupa o lugar de um que funcionaria.
//
// O QUE ELE CONFERE.
//   1. A tabela do paragrafo 7, linha por linha, contra contrast-pairs.json:
//      mesma quantidade, mesma ordem, mesmo tema, mesmo par de uso, os dois hex
//      resolvidos a partir de tokens.json, a razao, o piso e o veredito.
//   2. Toda razao citada na PROSA do paragrafo 7. Numero no formato `X.YZ:1`
//      que nao seja razao publicada de algum par, nem piso em uso, nem valor
//      historico declarado em `$valores_historicos`, REPROVA. E esta regra que
//      pega o caso real: os quatro numeros velhos estavam na prosa, nao na
//      tabela.
//
// O QUE ELE NAO CONFERE, dito em voz alta para ninguem confiar demais: so o
// paragrafo 7. Nome de cor, matiz e prosa dos outros paragrafos continuam sem
// portao (BICHUS-193).
//
// ONDE ELE NAO RODA. `docs/` esta fora do repositorio por decisao do cliente de
// 17/09/2026, entao o `actions/checkout` da CI nao traz o documento. Sem o
// arquivo este teste REPROVA -- verificacao que nao consegue verificar reprova,
// nunca aprova por ausencia -- e a unica coisa que segura a reprovacao e uma
// dispensa datada em .github/quality-gates.yml, no molde da secao 5.3 de
// docs/07-devops.md. Dispensa vencida volta a reprovar sozinha. Nao ha
// `skip`, nao ha `if` que faca o teste sumir: a ausencia e visivel e tem data.

library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'tokens.dart';

/// Nome da dispensa em `.github/quality-gates.yml`.
const String _nomeDaDispensa = 'documento-secao7';

/// Raiz do repositorio: a pasta que contem `design/`.
Directory _raiz() => diretorioDesign().parent;

File _documento() => File('${_raiz().path}/docs/06-design-system.md');

// ---------------------------------------------------------------------------
// Comparacao tolerante a acento e a espaco, e so a isso
// ---------------------------------------------------------------------------

const Map<String, String> _semAcento = <String, String>{
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  'ç': 'c', 'ñ': 'n',
};

/// O documento escreve "superficie" com acento e o JSON sem. A diferenca e de
/// grafia, nao de conteudo, e dobrar acento aqui e mais barato que manter duas
/// grafias em sincronia. Tudo ALEM disso -- palavra trocada, nome de cor
/// diferente -- continua sendo divergencia e reprova.
String _dobrar(String s) {
  final b = StringBuffer();
  for (final c in s.toLowerCase().split('')) {
    b.write(_semAcento[c] ?? c);
  }
  return b.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
}

// ---------------------------------------------------------------------------
// Dispensa
// ---------------------------------------------------------------------------

class _Dispensa {
  _Dispensa(this.motivo, this.responsavel, this.venceEm);
  final String motivo;
  final String responsavel;
  final DateTime venceEm;
}

/// Le `.github/quality-gates.yml` pelo mesmo formato de linha que
/// `infra/verificacao/verificar_dispensas.py` aceita. Devolve `null` quando
/// nao ha entrada para [_nomeDaDispensa].
_Dispensa? _dispensaVigente() {
  final arquivo = File('${_raiz().path}/.github/quality-gates.yml');
  if (!arquivo.existsSync()) return null;

  Map<String, String>? atual;
  final entradas = <Map<String, String>>[];
  for (final bruta in arquivo.readAsLinesSync()) {
    final linha = bruta.split('#').first.trimRight();
    if (linha.trim().isEmpty || linha.trim() == 'dispensas:') continue;
    final item = RegExp(r'^\s*-\s*(\w+):\s*(.+)$').firstMatch(linha);
    if (item != null) {
      atual = <String, String>{
        item.group(1)!: item.group(2)!.trim().replaceAll('"', ''),
      };
      entradas.add(atual);
      continue;
    }
    final campo = RegExp(r'^\s+(\w+):\s*(.+)$').firstMatch(linha);
    if (campo != null && atual != null) {
      atual[campo.group(1)!] = campo.group(2)!.trim().replaceAll('"', '');
    }
  }

  for (final e in entradas) {
    if (e['portao'] != _nomeDaDispensa) continue;
    final venceEm = DateTime.tryParse(e['vence_em'] ?? '');
    if (venceEm == null) {
      fail(
        'REPROVA: a dispensa `$_nomeDaDispensa` esta em '
        '.github/quality-gates.yml com `vence_em` invalido '
        '("${e['vence_em']}"). Dispensa sem data valida nao expira, e '
        'dispensa que nao expira e portao apagado com aparencia de portao.',
      );
    }
    return _Dispensa(
      e['motivo'] ?? '(sem motivo)',
      e['responsavel'] ?? '(sem responsavel)',
      venceEm,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Leitura do paragrafo 7
// ---------------------------------------------------------------------------

class _Linha {
  _Linha(this.numero, this.celulas);
  final int numero;
  final List<String> celulas;
}

class _Secao {
  _Secao(this.tabela, this.prosa);
  final List<_Linha> tabela;
  final String prosa;
}

_Secao _lerSecao7(File doc) {
  final todas = doc.readAsLinesSync();
  var inicio = -1;
  for (var i = 0; i < todas.length; i++) {
    if (todas[i].startsWith('## 7. ')) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) {
    fail(
      'REPROVA: nao achei o cabecalho "## 7. " em ${doc.path}. Ou a secao '
      'mudou de numero, ou o documento mudou de forma -- e nos dois casos '
      'este portao passou a conferir o vazio.',
    );
  }
  var fim = todas.length;
  for (var i = inicio + 1; i < todas.length; i++) {
    if (todas[i].startsWith('## ')) {
      fim = i;
      break;
    }
  }

  final tabela = <_Linha>[];
  final prosa = StringBuffer();
  for (var i = inicio; i < fim; i++) {
    final l = todas[i];
    if (!l.startsWith('|')) {
      prosa.writeln(l);
      continue;
    }
    if (RegExp(r'^\|[\s\-:|]+\|$').hasMatch(l)) continue;
    final celulas = l
        .trim()
        .replaceAll(RegExp(r'^\||\|$'), '')
        .split('|')
        .map((c) => c.trim())
        .toList();
    if (celulas.isNotEmpty && _dobrar(celulas.first) == 'tema') continue;
    tabela.add(_Linha(i + 1, celulas));
  }

  if (tabela.isEmpty) {
    fail(
      'REPROVA: o paragrafo 7 de ${doc.path} nao tem nenhuma linha de tabela. '
      'Um portao que compara uma tabela vazia com o JSON fica verde sem olhar '
      'para nada.',
    );
  }
  return _Secao(tabela, prosa.toString());
}

double _razaoDaCelula(String celula, int numeroDaLinha) {
  final m = RegExp(r'([0-9]+(?:\.[0-9]+)?)\s*:\s*1').firstMatch(celula);
  if (m == null) {
    fail(
      'REPROVA: linha $numeroDaLinha do paragrafo 7: a coluna "Razao" nao tem '
      'um numero no formato X.YZ:1 ("$celula").',
    );
  }
  return double.parse(m.group(1)!);
}

String _hex(String celula) =>
    celula.replaceAll('`', '').replaceAll('*', '').trim().toUpperCase();

/// `{cor.claro.surface}` -> `cor.claro.surface`.
String _semChaves(String ref) => ref.startsWith('{') && ref.endsWith('}')
    ? ref.substring(1, ref.length - 1)
    : ref;

void main() {
  test('o paragrafo 7 do documento bate com design/contrast-pairs.json', () {
    final doc = _documento();

    if (!doc.existsSync()) {
      final dispensa = _dispensaVigente();
      final hoje = DateTime.now();
      final ausencia =
          'nao achei ${doc.path}.\n'
          '`docs/` esta fora do repositorio por decisao do cliente de '
          '17/09/2026, entao o checkout da CI nao traz o documento e ESTE '
          'PORTAO NAO CONFERE NADA AQUI.';

      if (dispensa == null) {
        fail(
          'REPROVA: $ausencia\n'
          'Nao ha dispensa `$_nomeDaDispensa` em .github/quality-gates.yml. '
          'Ou o documento chega ao repositorio, ou a ausencia entra como '
          'dispensa datada -- aprovar por ausencia e a confianca falsa que '
          'este arquivo existe para impedir.',
        );
      }
      if (dispensa.venceEm.isBefore(DateTime(hoje.year, hoje.month, hoje.day))) {
        fail(
          'REPROVA: $ausencia\n'
          'A dispensa `$_nomeDaDispensa` venceu em '
          '${dispensa.venceEm.toIso8601String().substring(0, 10)}, '
          'responsavel ${dispensa.responsavel}. Ou o insumo chegou e a '
          'dispensa sai, ou nao chegou e isso precisa ser dito.',
        );
      }
      // ignore: avoid_print
      print(
        '::warning::portao do paragrafo 7 DISPENSADO ate '
        '${dispensa.venceEm.toIso8601String().substring(0, 10)} '
        '(${dispensa.responsavel}): ${dispensa.motivo}. '
        'Nesta execucao a tabela do documento NAO foi conferida.',
      );
      return;
    }

    final tokens = TokensBichu.doDisco();
    final json =
        jsonDecode(
              File('${diretorioDesign().path}/contrast-pairs.json')
                  .readAsStringSync(),
            )
            as Map<String, dynamic>;
    final pares = (json['pares'] as List).cast<Map<String, dynamic>>();
    final secao = _lerSecao7(doc);

    // -- 1. tamanho ------------------------------------------------------
    expect(
      secao.tabela.length,
      pares.length,
      reason:
          'a tabela do paragrafo 7 tem ${secao.tabela.length} linhas e '
          'design/contrast-pairs.json tem ${pares.length} pares. Documento e '
          'dado sairam de sincronia; regere a tabela no mesmo commit.',
    );

    // -- 2. linha por linha ----------------------------------------------
    final divergencias = <String>[];
    for (var i = 0; i < secao.tabela.length; i++) {
      final linha = secao.tabela[i];
      final par = pares[i];
      final id = par['id'] as String;
      final c = linha.celulas;
      if (c.length < 7) {
        divergencias.add(
          'linha ${linha.numero} ($id): a linha tem ${c.length} colunas, '
          'e a tabela do paragrafo 7 tem 7.',
        );
        continue;
      }

      void conferir(String campo, String noDoc, String noJson) {
        if (_dobrar(noDoc) != _dobrar(noJson)) {
          divergencias.add(
            'linha ${linha.numero} ($id): $campo\n'
            '    documento: $noDoc\n'
            '    JSON     : $noJson',
          );
        }
      }

      conferir('tema', c[0], par['tema'] as String);
      conferir('par de uso', c[1], par['uso'] as String);

      final frente = tokens.hex(_semChaves(par['frente'] as String));
      final fundo = tokens.hex(_semChaves(par['fundo'] as String));
      if (_hex(c[2]) != frente) {
        divergencias.add(
          'linha ${linha.numero} ($id): cor de FRENTE. documento diz '
          '${_hex(c[2])}; ${par['frente']} resolve para $frente em '
          'design/tokens.json.',
        );
      }
      if (_hex(c[3]) != fundo) {
        divergencias.add(
          'linha ${linha.numero} ($id): cor de FUNDO. documento diz '
          '${_hex(c[3])}; ${par['fundo']} resolve para $fundo em '
          'design/tokens.json.',
        );
      }

      final razaoDoc = _razaoDaCelula(c[4], linha.numero);
      final razaoJson = (par['razao_esperada'] as num).toDouble();
      if ((razaoDoc - razaoJson).abs() > 0.005) {
        divergencias.add(
          'linha ${linha.numero} ($id): RAZAO. documento diz '
          '${razaoDoc.toStringAsFixed(2)}:1; o JSON publica '
          '${razaoJson.toStringAsFixed(2)}:1.',
        );
      }

      final pisoDoc = double.tryParse(c[5].replaceAll('*', '').trim());
      final pisoJson = (par['piso'] as num).toDouble();
      if (pisoDoc == null || (pisoDoc - pisoJson).abs() > 0.001) {
        divergencias.add(
          'linha ${linha.numero} ($id): PISO. documento diz "${c[5]}"; o JSON '
          'declara $pisoJson.',
        );
      }

      final isentoNoDoc = _dobrar(c[6]).contains('isento');
      final isentoNoJson = par['veredito'] == 'isento';
      if (isentoNoDoc != isentoNoJson) {
        divergencias.add(
          'linha ${linha.numero} ($id): VEREDITO. documento diz "${c[6]}"; o '
          'JSON declara "${par['veredito']}".',
        );
      }
    }

    // -- 3. as razoes citadas na PROSA ------------------------------------
    //
    // A regra que pega o caso real de 21/09. Os quatro numeros velhos nao
    // estavam na tabela: estavam no paragrafo que explica as tres isencoes.
    final publicadas = <double>{
      for (final p in pares) (p['razao_esperada'] as num).toDouble(),
    };
    final pisos = <double>{for (final p in pares) (p['piso'] as num).toDouble()};
    final historicos = <double>{
      for (final k
          in ((json[r'$valores_historicos'] as Map<String, dynamic>? ??
                  <String, dynamic>{})
              .keys))
        if (!k.startsWith(r'$')) double.parse(k),
    };

    bool conhecida(double v) =>
        publicadas.any((r) => (r - v).abs() <= 0.005) ||
        pisos.any((r) => (r - v).abs() <= 0.005) ||
        historicos.any((r) => (r - v).abs() <= 0.005);

    for (final linha in secao.prosa.split('\n')) {
      for (final m in RegExp(
        r'([0-9]+(?:\.[0-9]+)?)\s*:\s*1',
      ).allMatches(linha)) {
        final v = double.parse(m.group(1)!);
        if (conhecida(v)) continue;
        divergencias.add(
          'PROSA: a razao ${m.group(1)}:1 nao corresponde a par nenhum de '
          'design/contrast-pairs.json, nem a um piso em uso, nem a um valor '
          r'declarado em $valores_historicos.'
          '\n    na linha: ${linha.trim()}\n'
          '    Ou o numero envelheceu e precisa ser recalculado, ou ele e '
          r'historico e precisa ser declarado em $valores_historicos com o '
          'motivo.',
        );
      }
    }

    expect(
      divergencias,
      isEmpty,
      reason:
          'O PARAGRAFO 7 DE ${doc.path} DIVERGE DE '
          'design/contrast-pairs.json em ${divergencias.length} ponto(s):\n'
          '${divergencias.map((d) => '  - $d').join('\n')}\n\n'
          'A tabela e a prosa do paragrafo 7 sao renderizacao do JSON. Mudou '
          'um token, regere os dois no mesmo commit.',
    );
  });
}
