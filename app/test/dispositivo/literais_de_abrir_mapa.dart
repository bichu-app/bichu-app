// **A VARREDURA DE LITERAIS DE ABRIR MAPA, numa fonte so.**
//
// Os textos que `app/lib/` **nao pode escrever a mao**, e a varredura que os
// cobra. A fonte unica deles e
// `app/lib/dispositivo/textos_do_app_de_mapas.dart`.
//
// ---------------------------------------------------------------------------
// POR QUE ELA EXISTE
// ---------------------------------------------------------------------------
// Em 21/10/2026 a acao "abrir endereco no app de mapas" tinha TRES redacoes no
// aplicativo, e **duas delas declaravam na propria prosa que eram copia fiel
// de uma quarta**:
//
//   - o encontro da Rede: `Abrir no mapa` / `Nao conseguimos abrir o app de
//     mapas.`;
//   - a linha de lugar da pagina do local: `Abrir <lugar> no mapa` /
//     `Nao conseguimos abrir o aplicativo de mapas.`, dizendo-se *"a mesma
//     frase do encontro da Rede"*;
//   - a linha de logradouro da mesma pagina: `Abrir no app de mapas` /
//     `Nao encontramos um app de mapas neste aparelho.`, dizendo-se *"a MESMA
//     frase do encontro da Rede"*.
//
// Nenhuma das duas era copia. **Comentario que afirma copia sem portao que a
// cobre produz divergencia silenciosa**, e foi assim que uma acao virou tres
// frases sem ninguem decidir que virasse. A onda 4 convergiu os textos por
// copia medida -- duas constantes com a mesma frase e um caso comparando as
// duas -- e deixou escrito que fonte unica era trabalho de frente. Esta e a
// frente.
//
// ---------------------------------------------------------------------------
// ELA VARRE CODIGO, E NAO COMENTARIO
// ---------------------------------------------------------------------------
// [semProsaDeDart] apaga `///`, `//` e `/* */` antes da conferencia, e isso
// NAO e detalhe: o cabecalho de `textos_do_app_de_mapas.dart` conta esta
// historia, e para conta-la ele precisa escrever as tres redacoes recusadas.
// A ASCII art de `local_do_encontro.dart` desenha o botao com o rotulo dentro.
// Uma varredura sobre texto cru reprovaria exatamente os arquivos que
// documentam a regra, e o conserto obvio seria apagar a documentacao.
//
// Mesma forma de `_semProsa` em `test/widgets/selo_de_validado_test.dart` e de
// `semComentarios` em `test/dispositivo/porta_nao_contornada_test.dart`.
//
// ---------------------------------------------------------------------------
// A FRONTEIRA: ISTO VARRE `app/lib`, E NAO `app/test`
// ---------------------------------------------------------------------------
// Teste escreve o texto esperado a mao de proposito em alguns lugares (uma
// medicao que lesse a constante dos dois lados nao mediria nada). O que nao
// pode escrever a mao e a SUPERFICIE.

import 'dart:io' as io;

import 'package:bichu/dispositivo/textos_do_app_de_mapas.dart';
import 'package:flutter_test/flutter_test.dart';

/// O caminho da fonte unica, relativo a raiz do pacote do aplicativo.
///
/// E o unico arquivo de `app/lib` que pode conter estes literais, e a
/// varredura o pula pelo caminho -- nao por nome de classe, que um arquivo novo
/// poderia repetir.
const String caminhoDaFonteDeAbrirMapa =
    'lib/dispositivo/textos_do_app_de_mapas.dart';

/// Os tres textos que a fonte define, **lidos dela e nao reescritos aqui**.
///
/// **Por que vem das constantes e nao de literais nesta lista**: uma agulha
/// escrita a mao com um acento errado nunca casaria com nada, e a varredura
/// ficaria verde por nao conferir -- o modo de falhar mais perigoso de portao
/// que varre codigo. Vindo da constante, a agulha e por construcao o texto que
/// a fonte emite.
const List<String> textosDaFonteDeAbrirMapa = <String>[
  TextosDoAppDeMapas.rotuloDoEndereco,
  TextosDoAppDeMapas.rotuloDoPonto,
  TextosDoAppDeMapas.falhaAoAbrir,
];

/// As mencoes ao app de mapas que **nenhuma superficie pode escrever**, em
/// qualquer redacao.
///
/// Sao deliberadamente mais largas que [textosDaFonteDeAbrirMapa]: elas pegam
/// as redacoes RECUSADAS da onda 4 (*"Nao conseguimos abrir o aplicativo de
/// mapas."*, *"Nao encontramos um app de mapas neste aparelho."*) e tambem a
/// quinta redacao que ninguem escreveu ainda. Uma lista com so os tres textos
/// vivos reprovaria a copia e deixaria passar a variacao, que e exatamente o
/// defeito que esta frente veio consertar.
///
/// **Medido antes de entrar:** com a prosa apagada, estas duas agulhas dao
/// ZERO em `app/lib` fora da fonte. `no mapa` foi considerada e **recusada**:
/// casa com quatro frases legitimas de outras telas (*"ponto no mapa"*,
/// *"endereco no mapa"*), e agulha que obriga excecao e agulha que vai ganhar
/// excecao.
const List<String> mencoesProibidasAoAppDeMapas = <String>[
  'app de mapas',
  'aplicativo de mapas',
];

/// O rotulo INTERPOLADO que a onda 4 recusou: `'Abrir $lugar no mapa'`.
///
/// Ele nao e pegavel por substring do texto final -- `Abrir `, a interpolacao e
/// ` no mapa` -- e `no mapa` sozinho tem falso positivo. Entao e padrao, e ele
/// cobre as duas formas de interpolacao de Dart (`$x` e `${x}`).
final RegExp abrirAlgoNoMapa =
    RegExp(r'Abrir\s+\$\{?[A-Za-z_][\w.]*\}?\s+no mapa');

/// A fonte **sem a prosa**: sem `///`, sem `//` e sem `/* */`.
///
/// `//` dentro de cadeia nao e comentario (`'http://...'` existe em codigo de
/// verdade), e por isso a contagem de aspas antes da marca.
String semProsaDeDart(String fonte) {
  return fonte
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .split('\n')
      .map((String linha) {
        final int marca = linha.indexOf('//');
        if (marca < 0) return linha;
        final String antes = linha.substring(0, marca);
        final int aspas =
            "'".allMatches(antes).length + '"'.allMatches(antes).length;
        if (aspas.isOdd) return linha;
        return antes;
      })
      .join('\n');
}

/// As agulhas que [codigo] contem, ou vazio.
///
/// Existe separada de [conferirQueNinguemEscreveAbrirMapaAMao] porque **a isca
/// da isca precisa da resposta como VALOR**: ela planta cada redacao recusada
/// numa amostra e exige que a varredura a veja. Sem isso, uma agulha morta
/// deixaria o portao verde sem conferir.
List<String> literaisDeAbrirMapaEm(String codigo) {
  final String limpo = semProsaDeDart(codigo);
  final List<String> achados = <String>[];
  for (final String agulha in <String>[
    ...textosDaFonteDeAbrirMapa,
    ...mencoesProibidasAoAppDeMapas,
  ]) {
    if (limpo.contains(agulha)) achados.add(agulha);
  }
  if (abrirAlgoNoMapa.hasMatch(limpo)) {
    achados.add(r'Abrir $<algo> no mapa');
  }
  return achados;
}

/// Reprova se algum `.dart` de `app/lib` escrever um literal de abrir mapa.
///
/// Pula [caminhoDaFonteDeAbrirMapa], que e onde eles devem estar.
/// [minimoDeArquivos] e o controle positivo: uma caminhada que achasse
/// nenhum arquivo passaria no vazio.
void conferirQueNinguemEscreveAbrirMapaAMao({int minimoDeArquivos = 180}) {
  final List<io.File> arquivos = dartsDeLib();
  expect(
    arquivos.length,
    greaterThanOrEqualTo(minimoDeArquivos),
    reason:
        'REPROVA: a caminhada achou so ${arquivos.length} arquivos `.dart` em '
        '"${raizDoPacoteDoApp()}/lib". Abaixo de $minimoDeArquivos ela esta '
        'cega, e varredura cega fica verde sem conferir -- que e o que este '
        'portao existe para impedir. Se `app/lib` encolheu de verdade, baixe o '
        'piso nesta chamada e diga por que na linha.',
  );

  final List<String> reprovas = <String>[];
  for (final io.File arquivo in arquivos) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    if (caminho == caminhoDaFonteDeAbrirMapa) continue;
    for (final String agulha in literaisDeAbrirMapaEm(
      arquivo.readAsStringSync(),
    )) {
      reprovas.add('  $caminho escreve "$agulha"');
    }
  }

  expect(
    reprovas,
    isEmpty,
    reason:
        'REPROVA: ${reprovas.length} literal(is) de abrir mapa escrito(s) a mao '
        'em `app/lib`:\n${reprovas.join('\n')}\n\n'
        'O texto do app de mapas tem UMA fonte: `TextosDoAppDeMapas`, em '
        '`$caminhoDaFonteDeAbrirMapa`. Leia a constante. Em 21/10/2026 a mesma '
        'acao tinha TRES redacoes, duas delas com um comentario dizendo que '
        'eram copia fiel de uma quarta -- e nenhuma era. Se a redacao precisa '
        'MUDAR, ela muda na fonte, e microcopia e decisao do cliente, nao de '
        'quem edita a tela.',
  );
}

/// Todos os `.dart` de `app/lib`, recursivo.
List<io.File> dartsDeLib() {
  final io.Directory lib = io.Directory('${raizDoPacoteDoApp()}/lib');
  if (!lib.existsSync()) {
    fail(
      'REPROVA: nao achei "${lib.path}" a partir de '
      '"${io.Directory.current.path}". A varredura nao confere nada sem ela.',
    );
  }
  return lib
      .listSync(recursive: true)
      .whereType<io.File>()
      .where((io.File f) => f.path.endsWith('.dart'))
      .toList();
}

/// O caminho de [arquivo] relativo a raiz do pacote (`lib/...`).
String caminhoRelativoNoPacote(io.File arquivo) {
  final String raiz = raizDoPacoteDoApp();
  final String caminho = arquivo.absolute.path;
  return caminho.startsWith('$raiz/')
      ? caminho.substring(raiz.length + 1)
      : caminho;
}

/// Le um arquivo de `app/` pelo caminho relativo a raiz do pacote.
///
/// **Reprova alto quando nao acha.** Leitura que devolvesse cadeia vazia faria
/// as conferencias de fonte passarem no vazio.
String lerDoPacoteDoApp(String relativo) {
  final io.File arquivo = io.File('${raizDoPacoteDoApp()}/$relativo');
  if (!arquivo.existsSync()) {
    fail(
      'REPROVA: nao achei "$relativo" a partir de '
      '"${io.Directory.current.path}". A conferencia de fonte nao confere nada '
      'sem ele, e ficar verde sem conferir e o que ela existe para impedir.',
    );
  }
  return arquivo.readAsStringSync();
}

/// Sobe de `Directory.current` ate achar a raiz do pacote do aplicativo.
///
/// `flutter test` roda com `Directory.current` em `app/`, mas um executor que
/// rodasse da raiz do repositorio nao acharia nada -- e o caso ficaria verde
/// por nao ter lido. Mesma forma de `_raizDoPacote` em
/// `test/widgets/selo_de_validado_test.dart`.
String raizDoPacoteDoApp() {
  io.Directory dir = io.Directory.current.absolute;
  for (int subidas = 0; subidas < 6; subidas++) {
    if (io.File('${dir.path}/pubspec.yaml').existsSync() &&
        io.Directory('${dir.path}/lib').existsSync()) {
      return dir.path;
    }
    final io.Directory pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  fail(
    'REPROVA: nao achei a raiz do pacote do aplicativo (um diretorio com '
    '`pubspec.yaml` e `lib/`) subindo de "${io.Directory.current.path}".',
  );
}
