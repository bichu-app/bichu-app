// Gerador dos DEZ icones da barra de baixo.
//
// Le os SVG de `design/icones-da-barra/` **na raiz do repositorio** e escreve
// `lib/theme/icones_da_barra.g.dart`.
//
// Rode a partir de `app/`:
//
//   dart run tool/gen_icones_da_barra.dart
//
// ou, da raiz, pelo alvo da casa:
//
//   make gerar-icones-da-barra
//
// ---------------------------------------------------------------------------
// POR QUE ESTE E UM SEGUNDO GERADOR, E NAO UMA LINHA EM `gen_marca.dart`
// ---------------------------------------------------------------------------
//
// Foi a primeira coisa que tentei, e ela NAO cabe. `gen_marca.dart` nao e um
// gerador de SVG: ele e o gerador da MARCA, e as tres premissas dele sao
// exatamente o contrario das destes dez arquivos. Medido, arquivo por arquivo:
//
// 1. **A pasta dele e fechada em NOVE por portao de nome.** O caso
//    `a pasta tem exatamente os nove SVG declarados, e nada mais` de
//    `test/marca/vetor_da_marca_test.dart` compara `design/marca/vetor/` com a
//    lista `_pasta` NOS DOIS SENTIDOS. Pondo os dez aqui, aquele portao
//    reprova por dez arquivos a mais -- e ele esta CERTO em reprovar: a pasta
//    dele e de marca, e estes dez nao sao a marca.
//
// 2. **O portao dele exige `M`, `C` e `Z`, e so.** CONTADO arquivo por
//    arquivo, por leitor de `d` e nao por `grep`: **OITO dos dez usam `L`**
//    -- `mural` 14 cada, `auau` 7 e 6, `loja` 5 cada, `pets` 4 cada --,
//    porque icone de contorno em 24 dp e feito de retas (os bigodes do
//    `pets`, o risco do `auau`, a aba da `loja`). **Os outros DOIS sao os
//    `rede`, e eles nao usam `L` nenhum**: o `d` deles e so `M`, `C` e `Z`
//    -- compativel, por acaso -- e o desenho de verdade esta em DOIS
//    `<circle>`, que o derivador da marca nunca emite e que `caminhoDaMarca`
//    nao sabe ler. Ou seja: os dez reprovam, mas nao todos pelo mesmo
//    motivo, e dizer "todos usam `L`" seria falso. Esta linha ja esteve
//    errada: a primeira versao dela afirmava os dez, e a contagem corrigiu.
//
// 3. **O gerador dele cobra COR DE TOKEN no arquivo.** Ele casa
//    `<g id="..." fill="#RRGGBB">`, procura o primitivo em `design/tokens.json`
//    e REPROVA cor que nao seja token. Os dez nao tem `id` em grupo nenhum e
//    nao tem hexadecimal nenhum: eles pintam `currentColor`, porque quem
//    resolve a cor de um icone de navegacao e o `NavigationBar` -- ele troca a
//    tinta entre `text-secondary` e `on-primary-container` por estado, pelo
//    `iconTheme` de `BichuTheme`. Posto na pasta da marca, o gerador dela
//    morreria com `nao tem nenhum grupo com fill`.
//
// A regra de cor da casa NAO esta sendo contornada -- ela esta sendo cumprida
// na direcao certa, e e por isso que este gerador RECUSA hexadecimal (ver
// `_recusaCorEscrita`). Cor escrita num icone de barra seria a cor do tema
// virando constante solta no arquivo de desenho; a ausencia dela e o que
// obriga o papel do tema a ser a unica fonte.
//
// ---------------------------------------------------------------------------
// POR QUE GERADOR E NAO ASSET -- o mesmo motivo de `gen_marca.dart`
// ---------------------------------------------------------------------------
//
// O Flutter so empacota asset de dentro do pacote, e `assets:` recusa caminho
// com `..`. Consumir o SVG em tempo de execucao exigiria COPIAR os dez para
// `app/assets/`, criando a segunda fonte da verdade que o paragrafo 18.2.2 do
// design system existe para impedir -- e um SVG copiado diverge sem nem mudar
// de tamanho. Link simbolico ja produziu uma suite inteira invisivel para
// `flutter test` neste repositorio. O gerador tem o efeito oposto: a
// divergencia vira diferenca de arquivo, e
// `test/telas/icones_da_barra_test.dart` compara os dois lados.
//
// Nao ha `flutter_svg` no `pubspec.yaml`, e este gerador existe para que
// continue nao havendo: o que chega ao binario e geometria em `const`, sem
// interpretador de XML em tempo de execucao.
library;

import 'dart:io';

/// Onde o gerador procura a raiz, em ordem.
const List<String> _candidatos = <String>['..', '.'];

/// A pasta das fontes, relativa a raiz do repositorio.
const String _pasta = 'design/icones-da-barra';

/// Os DEZ arquivos, e o campo de cada um em `IconesDaBarra`.
///
/// **E a ordem da barra, e ela e decisao do cliente (19/10/2026):**
/// `Pets, Rede, Mural, Loja, AuAu`. Ela esta repetida aqui de proposito? Nao:
/// aqui ela e so a ordem de EMISSAO do arquivo gerado, e quem manda na barra e
/// `CascaComAbas.destinos`. O portao que amarra as duas e o caso
/// `a ordem dos cinco destinos e a do cliente` -- este mapa nao e a fonte da
/// ordem, e trocar a ordem daqui nao muda a barra.
///
/// Os dez sao CINCO PARES, e o par e a estrutura e nao a coincidencia: o M3
/// pede contorno em repouso e preenchido no selecionado, e e isso que o
/// sufixo `-selecionado` carrega. O gerador COBRA os dois lados de cada par
/// (ver `_exigirParesCompletos`).
const Map<String, String> _consumidos = <String, String>{
  'pets.svg': 'pets',
  'pets-selecionado.svg': 'petsSelecionado',
  'rede.svg': 'rede',
  'rede-selecionado.svg': 'redeSelecionado',
  'mural.svg': 'mural',
  'mural-selecionado.svg': 'muralSelecionado',
  'loja.svg': 'loja',
  'loja-selecionado.svg': 'lojaSelecionado',
  'auau.svg': 'auau',
  'auau-selecionado.svg': 'auauSelecionado',
};

/// O `viewBox` que todo icone de 24 dp tem de declarar.
///
/// Fechado de proposito: dois icones em molduras diferentes desalinham na
/// barra sem ninguem ver, porque o pintor escala pela moldura declarada e o
/// desalinho fica de um pixel.
const List<double> _molduraExigida = <double>[0, 0, 24, 24];

/// A espessura de traco que todo icone de contorno tem de declarar.
const double _espessuraExigida = 2;

const String _cabecalho = '''
// GERADO POR app/tool/gen_icones_da_barra.dart A PARTIR DE design/icones-da-barra/*.svg — NÃO EDITE.
//
// Para mudar um ícone da barra, mude o SVG na raiz do repositório e rode, de
// dentro de app/:
//   dart run tool/gen_icones_da_barra.dart
//
// ignore_for_file: lines_longer_than_80_chars
''';

void main() {
  final raiz = _raiz();
  final pasta = Directory('$raiz/$_pasta');

  _exigirPastaExata(pasta);
  _exigirParesCompletos();

  final buffer = StringBuffer(_cabecalho)
    ..writeln()
    ..writeln('/// Uma forma de um ícone da barra: curva ou círculo.')
    ..writeln('///')
    ..writeln('/// Duas formas e não duas classes porque o `const` de um campo')
    ..writeln('/// de [GrupoDoIcone] precisa de UM tipo. [d] não nulo é curva;')
    ..writeln('/// [r] não nulo é círculo. Nunca os dois, e nunca nenhum —')
    ..writeln('/// o `assert` abaixo é o que torna isso verdade em `const`.')
    ..writeln('class FormaDoIcone {')
    ..writeln('  const FormaDoIcone.curva(this.d)')
    ..writeln('      : cx = null,')
    ..writeln('        cy = null,')
    ..writeln('        r = null;')
    ..writeln()
    ..writeln('  const FormaDoIcone.circulo({')
    ..writeln('    required double this.cx,')
    ..writeln('    required double this.cy,')
    ..writeln('    required double this.r,')
    ..writeln('  }) : d = null;')
    ..writeln()
    ..writeln('  /// O atributo `d` do SVG, com os comandos `M`, `C`, `L` e `Z`.')
    ..writeln('  final String? d;')
    ..writeln()
    ..writeln('  /// Centro e raio, quando a forma é um `<circle>`.')
    ..writeln('  final double? cx;')
    ..writeln('  final double? cy;')
    ..writeln('  final double? r;')
    ..writeln()
    ..writeln('  bool get ehCurva => d != null;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// Um grupo do SVG: as formas que compartilham o mesmo preenchimento.')
    ..writeln('class GrupoDoIcone {')
    ..writeln('  const GrupoDoIcone({required this.preenchido, required this.formas});')
    ..writeln()
    ..writeln('  /// `fill="currentColor"` no SVG; `false` é `fill="none"`.')
    ..writeln('  ///')
    ..writeln('  /// É ESTE campo que separa o estado selecionado do de repouso:')
    ..writeln('  /// contorno em repouso, preenchido no selecionado (M3).')
    ..writeln('  final bool preenchido;')
    ..writeln()
    ..writeln('  final List<FormaDoIcone> formas;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// Um ícone da barra, como o SVG de origem o declara.')
    ..writeln('///')
    ..writeln('/// NENHUMA COR MORA AQUI, e a ausência é a regra e não o esquecimento:')
    ..writeln('/// o SVG pinta `currentColor` e quem resolve a tinta é o `iconTheme` de')
    ..writeln('/// `BichuTheme`, que troca entre `text-secondary` e')
    ..writeln('/// `on-primary-container` por estado. Cor escrita neste arquivo seria o')
    ..writeln('/// papel do tema virando constante solta.')
    ..writeln('class DesenhoDoIcone {')
    ..writeln('  const DesenhoDoIcone({')
    ..writeln('    required this.arquivo,')
    ..writeln('    required this.rotuloDaArte,')
    ..writeln('    required this.lado,')
    ..writeln('    required this.espessura,')
    ..writeln('    required this.grupos,')
    ..writeln('  });')
    ..writeln()
    ..writeln('  /// O nome do arquivo em `design/icones-da-barra/`.')
    ..writeln('  final String arquivo;')
    ..writeln()
    ..writeln('  /// O `aria-label` do SVG.')
    ..writeln('  ///')
    ..writeln('  /// **NÃO é o nome acessível da aba**, e isto está escrito para não ser')
    ..writeln('  /// confundido: o glifo da barra é DECORATIVO e não entra na árvore de')
    ..writeln('  /// semântica (UX 27.7, regra 2) — quem anuncia a aba é')
    ..writeln('  /// `DestinoDeNavegacao.nomeAcessivelCom`. Este campo existe para o')
    ..writeln('  /// portão poder dizer que o arquivo certo foi para o destino certo.')
    ..writeln('  final String rotuloDaArte;')
    ..writeln()
    ..writeln('  /// O lado do `viewBox` quadrado, em unidades do desenho.')
    ..writeln('  final double lado;')
    ..writeln()
    ..writeln('  /// `stroke-width` do SVG, nas mesmas unidades de [lado].')
    ..writeln('  final double espessura;')
    ..writeln()
    ..writeln('  final List<GrupoDoIcone> grupos;')
    ..writeln('}')
    ..writeln()
    ..writeln('/// Os dez ícones que a barra de baixo consome.')
    ..writeln('abstract final class IconesDaBarra {');

  for (final entrada in _consumidos.entries) {
    final caminho = '${pasta.path}/${entrada.key}';
    final arquivo = File(caminho);
    if (!arquivo.existsSync()) {
      throw StateError(
        'REPROVA: $caminho nao existe. A barra consome este arquivo; gerador '
        'que nao acha a arte para, e nao emite icone em branco.',
      );
    }
    final svg = arquivo.readAsStringSync();
    _recusaFonteViva(entrada.key, svg);
    _recusaCorEscrita(entrada.key, svg);

    final lado = _lado(entrada.key, svg);
    final rotulo = _rotulo(entrada.key, svg);
    final grupos = _grupos(entrada.key, svg);

    buffer
      ..writeln()
      ..writeln('  static const DesenhoDoIcone ${entrada.value} = DesenhoDoIcone(')
      ..writeln("    arquivo: '${entrada.key}',")
      ..writeln("    rotuloDaArte: '$rotulo',")
      ..writeln('    lado: ${_dart(lado)},')
      ..writeln('    espessura: ${_dart(_espessuraExigida)},')
      ..writeln('    grupos: <GrupoDoIcone>[');
    for (final g in grupos) {
      buffer
        ..writeln('      GrupoDoIcone(')
        ..writeln('        preenchido: ${g.preenchido},')
        ..writeln('        formas: <FormaDoIcone>[');
      for (final f in g.formas) {
        buffer.writeln('          $f,');
      }
      buffer
        ..writeln('        ],')
        ..writeln('      ),');
    }
    buffer
      ..writeln('    ],')
      ..writeln('  );');
  }

  buffer
    ..writeln()
    ..writeln('  /// Os dez, por nome de arquivo.')
    ..writeln('  ///')
    ..writeln('  /// O portão itera ESTE mapa em vez de repetir os dez nomes: portão')
    ..writeln('  /// que guarda uma cópia da lista fica verde no dia em que a lista muda.')
    ..writeln('  static const Map<String, DesenhoDoIcone> porArquivo =')
    ..writeln('      <String, DesenhoDoIcone>{');
  for (final e in _consumidos.entries) {
    buffer.writeln("    '${e.key}': ${e.value},");
  }
  buffer
    ..writeln('  };')
    ..writeln('}');

  File('lib/theme/icones_da_barra.g.dart').writeAsStringSync(buffer.toString());
  stdout.writeln(
    'lib/theme/icones_da_barra.g.dart: ${_consumidos.length} icones '
    '(${_consumidos.keys.join(', ')}).',
  );
}

/// Um grupo lido do SVG.
class _Grupo {
  _Grupo(this.preenchido, this.formas);

  final bool preenchido;
  final List<String> formas;
}

/// A pasta tem EXATAMENTE os dez declarados, e nada mais.
///
/// Nos dois sentidos, e pelo motivo que a BICHUS-196 registrou na pasta da
/// marca: arquivo que some e desenho que some sem quebrar build nenhum, e
/// arquivo novo sem destino escrito e como aquela pasta comecou.
void _exigirPastaExata(Directory pasta) {
  if (!pasta.existsSync()) {
    throw StateError(
      'REPROVA: ${pasta.path} nao existe. Gerador sem fonte nao emite nada.',
    );
  }
  final noDisco = pasta
      .listSync()
      .whereType<File>()
      .map((f) => f.uri.pathSegments.last)
      .where((n) => n.endsWith('.svg'))
      .toSet();
  final declarados = _consumidos.keys.toSet();
  if (noDisco.length != declarados.length ||
      !noDisco.containsAll(declarados)) {
    final sobrando = (noDisco.difference(declarados).toList()..sort()).join(', ');
    final faltando = (declarados.difference(noDisco).toList()..sort()).join(', ');
    throw StateError(
      'REPROVA: $_pasta divergiu do declarado.\n'
      '  no disco:  ${(noDisco.toList()..sort()).join(', ')}\n'
      '  declarado: ${(declarados.toList()..sort()).join(', ')}\n'
      '  sobrando:  ${sobrando.isEmpty ? '(nada)' : sobrando}\n'
      '  faltando:  ${faltando.isEmpty ? '(nada)' : faltando}\n'
      'Icone novo precisa de uma linha em `_consumidos` dizendo qual campo ele '
      'vira, e de um destino na barra que o use. SVG sem destino escrito e '
      'desenho que ninguem pinta.',
    );
  }
}

/// Todo icone tem os DOIS estados, e nenhum sobra sem par.
///
/// O par e a estrutura: contorno em repouso e preenchido no selecionado. Meio
/// par quer dizer uma aba que nao muda de desenho ao ser tocada, e isso e um
/// defeito que so aparece no aparelho.
void _exigirParesCompletos() {
  final bases = <String>{};
  for (final nome in _consumidos.keys) {
    bases.add(nome.replaceAll('-selecionado.svg', '').replaceAll('.svg', ''));
  }
  final mancos = <String>[];
  for (final base in bases) {
    final temRepouso = _consumidos.containsKey('$base.svg');
    final temSelecionado = _consumidos.containsKey('$base-selecionado.svg');
    if (!temRepouso || !temSelecionado) {
      mancos.add(
        '$base (repouso: $temRepouso, selecionado: $temSelecionado)',
      );
    }
  }
  if (mancos.isNotEmpty) {
    throw StateError(
      'REPROVA: ha par incompleto em `_consumidos`: ${mancos.join('; ')}. '
      'Contorno em repouso e preenchido no selecionado e o M3, e e o que as '
      'cinco abas fazem. Meio par e uma aba que nao responde ao toque.',
    );
  }
}

void _recusaFonteViva(String nome, String svg) {
  final vivo = RegExp(r'<(text|tspan)\b|font-family').firstMatch(svg);
  if (vivo != null) {
    throw StateError(
      'REPROVA: $nome carrega fonte viva ("${vivo.group(0)}"). Icone e curva, '
      'nao letra: SVG com texto vira outra letra na maquina que nao tem a '
      'fonte, e ninguem percebe. (`<title>` e permitido: ele e texto '
      'acessivel, nao glifo desenhado.)',
    );
  }
}

/// NENHUM hexadecimal, e a recusa e a regra de cor cumprida ao contrario.
///
/// Na marca o gerador COBRA que o `fill` seja um token. Aqui ele cobra o
/// oposto, e nao por inconsistencia: um icone de navegacao nao tem cor
/// propria. A tinta dele e o estado da aba, e quem a resolve e o `iconTheme`
/// de `BichuTheme`. Hexadecimal neste arquivo sobreviveria a troca de tema, ao
/// modo escuro e ao estado selecionado -- os tres calado.
void _recusaCorEscrita(String nome, String svg) {
  final hex = RegExp(r'(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"').firstMatch(svg);
  if (hex != null) {
    throw StateError(
      'REPROVA: $nome escreve a cor ${hex.group(1)}. Icone da barra pinta '
      '`currentColor` e mais nada: a tinta e o ESTADO da aba '
      '(`text-secondary` em repouso, `on-primary-container` selecionado), e '
      'quem a resolve e o `iconTheme` de BichuTheme. Cor escrita aqui '
      'sobreviveria ao modo escuro e ao estado selecionado, os dois calado.',
    );
  }
}

double _lado(String nome, String svg) {
  final vb = RegExp(r'viewBox="([^"]*)"').firstMatch(svg);
  if (vb == null) throw StateError('REPROVA: $nome nao tem viewBox.');
  final nums = RegExp(r'-?\d+(?:\.\d+)?')
      .allMatches(vb.group(1)!)
      .map((m) => double.parse(m.group(0)!))
      .toList();
  if (nums.length != 4) {
    throw StateError('REPROVA: o viewBox de $nome nao tem 4 numeros.');
  }
  for (var i = 0; i < 4; i++) {
    if (nums[i] != _molduraExigida[i]) {
      throw StateError(
        'REPROVA: o viewBox de $nome e "${nums.join(' ')}" e os dez precisam '
        'de "${_molduraExigida.join(' ')}". Dois icones em molduras '
        'diferentes desalinham na barra, e o desalinho fica de um pixel -- '
        'grande o bastante para o olho e pequeno o bastante para ninguem '
        'achar a causa.',
      );
    }
  }
  return nums[2];
}

String _rotulo(String nome, String svg) {
  final m = RegExp(r'aria-label="([^"]*)"').firstMatch(svg);
  if (m == null || m.group(1)!.trim().isEmpty) {
    throw StateError(
      'REPROVA: $nome nao tem `aria-label`. Ele e o que amarra o ARQUIVO ao '
      'destino, e e o que o portao le para dizer que o desenho do `Mural` nao '
      'foi para a `Loja`.',
    );
  }
  return m.group(1)!.replaceAll(r'$', r'\$').replaceAll("'", r"\'");
}

List<_Grupo> _grupos(String nome, String svg) {
  final achados = RegExp(r'<g\b([^>]*)>(.*?)</g>', dotAll: true).allMatches(svg);
  if (achados.isEmpty) {
    throw StateError('REPROVA: $nome nao tem nenhum grupo `<g>`.');
  }

  final saida = <_Grupo>[];
  for (final g in achados) {
    final atributos = g.group(1)!;
    final corpo = g.group(2)!;

    final fill = RegExp(r'fill="([^"]*)"').firstMatch(atributos)?.group(1);
    if (fill != 'none' && fill != 'currentColor') {
      throw StateError(
        'REPROVA: um grupo de $nome tem fill="$fill". Os unicos valores '
        'possiveis sao `none` (contorno) e `currentColor` (preenchido): e '
        'esse par que separa o estado de repouso do selecionado.',
      );
    }
    final stroke = RegExp(r'stroke="([^"]*)"').firstMatch(atributos)?.group(1);
    if (stroke != 'currentColor') {
      throw StateError(
        'REPROVA: um grupo de $nome tem stroke="$stroke" e precisa de '
        '`currentColor`. Traco sem cor herdada nao acompanha o estado da aba.',
      );
    }
    final espessura =
        RegExp(r'stroke-width="([^"]*)"').firstMatch(atributos)?.group(1);
    if (espessura != _espessuraExigida.toInt().toString()) {
      throw StateError(
        'REPROVA: um grupo de $nome tem stroke-width="$espessura" e os dez '
        'precisam de "${_espessuraExigida.toInt()}". Espessura desigual entre '
        'duas abas vizinhas le como uma delas estar aceso.',
      );
    }

    // UMA VARREDURA SO, E A ORDEM DO DOCUMENTO E O MOTIVO.
    //
    // A primeira versao deste trecho colhia os `<path>` e DEPOIS os
    // `<circle>`, em dois lacos. Nos dez arquivos de hoje isso nao muda
    // nenhum pixel -- medi: em `rede.svg` as duas cabecas vao de y=5,3 a
    // y=10,3 e o corpo comeca em y=14,4, entao nada se sobrepoe. Mas pintura
    // e ORDEM: no dia em que um desenho tiver forma preenchida por cima de
    // outra, dois lacos entregariam a pilha ao contrario e o icone sairia
    // errado sem nada reprovar. A varredura unica mantem a ordem do arquivo.
    final formas = <String>[];
    final naOrdem = RegExp(
      r'<path\b([^>]*)/>|<circle\b([^>]*)/>',
      dotAll: true,
    );
    for (final f in naOrdem.allMatches(corpo)) {
      if (f.group(1) != null) {
        final a = f.group(1)!;
        final m = RegExp(r'\sd="([^"]*)"').firstMatch(a);
        if (m == null) {
          throw StateError('REPROVA: um `<path>` de $nome nao tem `d`.');
        }
        final d = m.group(1)!;
        final estranho = RegExp('[A-Za-z]')
            .allMatches(d)
            .map((m) => m.group(0)!)
            .where((c) => !<String>['M', 'C', 'L', 'Z'].contains(c))
            .toSet();
        if (estranho.isNotEmpty) {
          throw StateError(
            'REPROVA: $nome usa os comandos $estranho num `d`. O pintor sabe '
            'ler `M`, `C`, `L` e `Z`, e so: comando novo sairia do desenho em '
            'silencio, porque o pintor ignoraria o trecho em vez de reclamar.',
          );
        }
        formas.add("FormaDoIcone.curva('$d')");
        continue;
      }
      final a = f.group(2)!;
      double exigir(String chave) {
        final m = RegExp('$chave="([^"]*)"').firstMatch(a);
        if (m == null) {
          throw StateError(
            'REPROVA: um `<circle>` de $nome nao tem `$chave`.',
          );
        }
        return double.parse(m.group(1)!);
      }

      formas.add(
        'FormaDoIcone.circulo('
        'cx: ${_dart(exigir('cx'))}, '
        'cy: ${_dart(exigir('cy'))}, '
        'r: ${_dart(exigir('r'))})',
      );
    }

    if (formas.isEmpty) {
      throw StateError(
        'REPROVA: um grupo de $nome nao tem forma nenhuma. Grupo vazio e um '
        'trecho do desenho que o pintor nao vai pintar, e o arquivo parece '
        'inteiro.',
      );
    }
    saida.add(_Grupo(fill == 'currentColor', formas));
  }
  return saida;
}

String _raiz() {
  for (final c in _candidatos) {
    if (Directory('$c/$_pasta').existsSync()) return c;
  }
  throw StateError(
    'REPROVA: nao achei $_pasta/ a partir de ${Directory.current.path}. '
    'Rode de dentro de app/.',
  );
}

String _dart(double v) => v == v.roundToDouble() ? '${v.toInt()}.0' : '$v';
