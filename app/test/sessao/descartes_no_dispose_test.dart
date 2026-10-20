// O `dispose()` de `_BichuAppState`, campo por campo (20/10/2026).
//
// ## O que estava de pe ate aqui
//
// O lote do contador de nao lido pos `ContadoresDeNaoLido` -- um
// `ChangeNotifier` -- no `Escopo`, em `limpezasAoSair`, em `aoEntrar`, no
// arranque e na retomada. **Nada o descartava.** Os cinco irmaos dele estavam
// todos no `dispose()` do `_BichuAppState`; ele nao, e a suite inteira ficou
// verde assim -- 2280 passam, 7 pulados, zero falhas, medido neste worktree
// antes desta entrega.
//
// E a mesma classe de defeito que a BICHUS-238 encontrou em `limpezasAoSair`:
// lista curta, escrita por lotes diferentes, de onde some item -- ou para onde
// nunca entra item -- sem nenhum caso ficar vermelho. A resposta aqui e a
// mesma: um REGISTRO comparado com o `app.dart` nos **dois sentidos**.
//
// ## DESLIGAR PARA VER REPROVAR -- os cinco, medidos em 20/10/2026
//
//   1. Em `lib/app.dart`, tire `_contadores.dispose()` do `dispose()`.
//      Medido: **2 casos reprovam** --
//        - `quando o app sai da arvore, o contador esta DESCARTADO`
//        - `o dispose() de app.dart e exatamente a lista registrada aqui`
//      O segundo e o que importa para o futuro: ele acusa a remocao de
//      qualquer linha, inclusive de uma que ainda nao existe hoje.
//   2. Em `ContadoresDeNaoLido`, apague `if (_descartado) return;` de
//      `definir`. Medido: reprova `depois do descarte, a resposta em voo nao
//      mexe no numero nem chega ao icone do aplicativo`, em `mensagens`.
//   3. O mesmo em `_definirSecoes`. Medido: reprova o MESMO caso, agora nas
//      tres contagens de secao -- sao dois caminhos de publicacao e cada um
//      tem a sua guarda.
//   4. O mesmo em `esquecer`. Medido: reprova
//      ``esquecer()` depois do descarte nao estoura`.
//   5. Acrescente um descarte novo sem registra-lo aqui (foi medido com
//      `_cofreDoQr.limpar()`): o registro reprova, nomeando o campo orfao.
//
// ## Por que o registro aceita entrada SEM isca, e o que ele cobra no lugar
//
// `limpezasAoSair` exige uma isca por entrada porque toda entrada daquela
// lista tem efeito observavel: depois de `sair()`, o dado nao esta em lugar
// nenhum. Descarte nao e assim. Um `ChangeNotifier` descartado se deixa medir
// -- `addListener` estoura depois do descarte --, mas `_envioDeFoto.fechar()`
// e `_api.fechar()` fecham cliente HTTP, e com o `MockClient` da suite
// `close()` nao faz nada observavel.
//
// Entao cada entrada declara UMA das duas coisas: a isca, ou o motivo escrito
// de nao haver uma. O registro recusa as duas em branco, recusa as duas
// juntas e recusa motivo curto -- e **congela quantas entradas estao sem
// isca**, para que a divida nao cresca em silencio, que e exatamente o que
// este arquivo existe para impedir.

import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/contadores_api.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/sessao/contadores_de_nao_lido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';
import '../telas/contador_do_auau_test.dart' show DistintivoEspiao;
import 'limpezas_ao_sair_test.dart' show raizDoApp;

/// Um cliente que responde as DUAS fontes do contador com numero de verdade,
/// e anota cada caminho pedido.
///
/// **As duas, e nao so a de mensagens:** `atualizar()` dispara
/// `_contarMensagens` e `atualizarSecoes` em paralelo, e cada uma publica por
/// um caminho diferente (`definir` e `_definirSecoes`). Uma rede que so
/// respondesse conversas deixaria a segunda guarda sem medicao nenhuma -- e a
/// forma de resposta importa: `ContadoresDeSecao.deJson` recusa corpo sem os
/// tres campos, e um corpo vazio faria a secao nem chegar a publicar.
ApiClient clienteDasDuasFontes(List<String> pedidos, {required int naoLidas}) {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient((pedido) async {
      final caminho = pedido.url.path;
      pedidos.add(caminho);
      if (caminho.endsWith('/v1/conversations')) {
        return json200(<String, dynamic>{
          'items': <dynamic>[],
          'total': 0,
          'unread_count': naoLidas,
          'next_cursor': null,
        });
      }
      if (caminho.endsWith('/v1/me/section-counters')) {
        return json200(<String, dynamic>{
          'lost_pets_new': 4,
          'network_events_new': 2,
          'network_directory_new': 1,
        });
      }
      return json200(<String, dynamic>{});
    }),
  );
  addTearDown(api.fechar);
  return api;
}

/// O nome do grupo da isca do descarte do contador, escrito uma vez so.
///
/// Citado pelo registro abaixo: registro que aponta para grupo inexistente
/// reprova. Constante, e nao literal repetido, para que renomear o grupo nao
/// deixe o registro apontando para o nada.
const String grupoDaIscaDoDescarteDoContador =
    'ISCA — o contador de nao lido e DESCARTADO com o app';

/// O nome do grupo da isca do descarte do contador do SINO, escrito uma vez
/// so. Ver [grupoDaIscaDoDescarteDoContador].
const String grupoDaIscaDoDescarteDoSino =
    'ISCA — o contador de avisos do sino e DESCARTADO com o app';

/// O que o `dispose()` de `_BichuAppState` desfaz, e onde esta a prova.
///
/// **A chave e o campo, exatamente como ele aparece em `lib/app.dart`.**
/// `arquivo`+`grupo` apontam para a isca; `semIsca` e o motivo escrito de nao
/// haver uma. Exatamente um dos dois lados, nunca os dois nem nenhum.
typedef ProvaDoDescarte = ({String? arquivo, String? grupo, String? semIsca});

const Map<String, ProvaDoDescarte> descartesRegistrados =
    <String, ProvaDoDescarte>{
  // A ENTRADA QUE FALTAVA, e a razao de este portao existir. O objeto e um
  // `ChangeNotifier` vivo no `Escopo`, com busca disparada no arranque e em
  // toda retomada sem ninguem aguardar: sem o descarte ele sobrevive ao app na
  // arvore, e a resposta em voo ainda o encontra.
  '_contadores': (
    arquivo: 'test/sessao/descartes_no_dispose_test.dart',
    grupo: grupoDaIscaDoDescarteDoContador,
    semIsca: null,
  ),
  // ACRESCENTADA QUANDO A FRENTE DO SINO (PR #33) ENTROU NA `development`.
  //
  // Ela chegou com o descarte CERTO desde o primeiro dia -- `app.dart` ja a
  // tinha no `dispose()`, e a classe ja tinha a guarda `_descartado` lida em
  // `_publicar`. O que ela nao tinha era prova: nenhum caso ficava vermelho se
  // a linha sumisse. Entao este portao nao a registrou como divida; ele cobrou
  // dela a mesma isca que cobra do contador de nao lido, no mesmo formato.
  '_contadorDeAvisos': (
    arquivo: 'test/sessao/descartes_no_dispose_test.dart',
    grupo: grupoDaIscaDoDescarteDoSino,
    semIsca: null,
  ),
  '_vigiaDeAviso': (
    arquivo: null,
    grupo: null,
    semIsca: 'Entrou antes deste portao e nao foi medida por esta frente. '
        'Ela e mensuravel pelo mesmo caminho do contador (`addListener` '
        'estoura depois do descarte); o que falta e alguem escrever a isca, '
        'e nao um impedimento tecnico.',
  ),
  '_avisosRecebidos': (
    arquivo: null,
    grupo: null,
    semIsca: 'Entrou antes deste portao e nao foi medida por esta frente. '
        'Mesmo caso do vigia: mensuravel pelo descarte do notificador, sem '
        'isca escrita ate hoje.',
  ),
  '_sessao': (
    arquivo: null,
    grupo: null,
    semIsca: 'Entrou antes deste portao e nao foi medida por esta frente. '
        'O controlador e o objeto mais exercido da suite, e um descarte '
        'indevido dele reprovaria em dezenas de casos por outro caminho -- '
        'o que nao e o mesmo que uma isca, e por isso esta registrado como '
        'divida e nao como prova.',
  ),
  '_envioDeFoto': (
    arquivo: null,
    grupo: null,
    semIsca: 'NAO E UM NOTIFICADOR: `fechar()` fecha o cliente HTTP do envio '
        'de bytes. Em teste o cliente e o `MockClient`, cujo `close()` nao '
        'faz nada observavel -- uma isca aqui so poderia conferir a CHAMADA, '
        'que e leitura de codigo com outra roupa.',
  ),
  '_api': (
    arquivo: null,
    grupo: null,
    semIsca: 'NAO E UM NOTIFICADOR: `fechar()` fecha o `ApiClient`. Mesmo '
        'caso do envio de foto -- com `MockClient` nao ha efeito observavel '
        'depois do fechamento, e medir a chamada seria ler o codigo.',
  ),
};

/// Quantas entradas estao hoje sem isca. **Congelado de proposito.**
///
/// Subir este numero e uma decisao, e ela vem com o motivo na linha da
/// entrada nova. Sem este piso, o campo `semIsca` viraria a porta dos fundos
/// do portao: bastaria escrever qualquer frase para nunca mais medir nada.
const int entradasSemIscaHoje = 5;

/// As chamadas do `dispose()` que **nao** limpam um campo, com o motivo.
///
/// Elas existem para que o leitor abaixo nao precise adivinhar: uma linha que
/// ele nao reconheca REPROVA, em vez de virar "nenhuma entrada" -- que seria o
/// portao aprovando por cegueira.
const Map<String, String> chamadasSemCampo = <String, String>{
  'WidgetsBinding.instance.removeObserver(this)':
      'Tira o observador de ciclo de vida. Nao e campo deste estado.',
  'super.dispose()': 'O descarte do proprio `State`. Vem sempre por ultimo.',
};

/// O texto entre as chaves do `void dispose() { ... }` de `lib/app.dart`.
String blocoDoDispose(String fonte) {
  const String marca = '  void dispose() {';
  final inicio = fonte.indexOf(marca);
  if (inicio < 0) {
    throw StateError(
      'REPROVA: nao achei `$marca` em `lib/app.dart`. Ou o `dispose()` mudou '
      'de forma, ou ele sumiu. Nos dois casos este portao parou de conferir o '
      'descarte do app, e isso nao pode passar calado.',
    );
  }
  if (fonte.indexOf(marca, inicio + 1) >= 0) {
    throw StateError(
      'REPROVA: ha mais de um `$marca` em `lib/app.dart`, e este portao '
      'conferiria so o primeiro. Ensine-o a escolher antes de deixar o '
      'segundo entrar.',
    );
  }
  var profundidade = 0;
  for (var i = inicio + marca.length - 1; i < fonte.length; i += 1) {
    final c = fonte[i];
    if (c == '[' || c == '(' || c == '{') profundidade += 1;
    if (c == ']' || c == ')' || c == '}') {
      profundidade -= 1;
      if (profundidade == 0) {
        return fonte.substring(inicio + marca.length, i);
      }
    }
  }
  throw StateError(
    'REPROVA: as chaves do `dispose()` nao fecham em `lib/app.dart`.',
  );
}

/// Os campos descartados, um por comando, na ordem em que aparecem.
///
/// **Reprova quando nao consegue ler um comando.** Comando em forma que este
/// leitor nao entende nao pode virar "nenhum descarte": seria o portao
/// aprovando por cegueira, que e pior do que nao existir.
List<String> camposDoDispose(String bloco) {
  final semComentarios = bloco
      .split('\n')
      .map((l) {
        final corte = l.indexOf('//');
        return corte < 0 ? l : l.substring(0, corte);
      })
      .join('\n');

  final campos = <String>[];
  for (final bruto in semComentarios.split(';')) {
    final comando = bruto.trim();
    if (comando.isEmpty) continue;
    final achados = RegExp(r'_[A-Za-z0-9_]+')
        .allMatches(comando)
        .map((m) => m.group(0)!)
        .toSet();
    if (achados.isEmpty) {
      if (chamadasSemCampo.containsKey(comando)) continue;
      throw StateError(
        'REPROVA: o `dispose()` de `lib/app.dart` tem o comando "$comando", '
        'que nao limpa campo nenhum e nao esta em `chamadasSemCampo`. Este '
        'portao existe para saber, linha por linha, o que o app desfaz ao '
        'sair da arvore; uma linha que ele nao le seria uma linha sem '
        'cobertura passando por cima dele. Registre-a com o motivo, ou '
        'escreva-a na forma `_campo.metodo()`.',
      );
    }
    if (achados.length != 1) {
      throw StateError(
        'REPROVA: nao consegui dizer QUAL campo o comando "$comando" do '
        '`dispose()` desfaz (achei ${achados.length} candidatos: $achados). '
        'Escreva um campo por comando, ou ensine este leitor a ler a forma '
        'nova -- nunca deixe o portao adivinhando.',
      );
    }
    campos.add(achados.single);
  }
  return campos;
}

void main() {
  // ------------------------------------------------------------------------
  // A ISCA QUE FALTAVA. Ela olha o EFEITO -- o objeto esta descartado, e a
  // resposta que chega depois nao o alcanca --, e nao a chamada: um caso que
  // conferisse "o dispose chamou `dispose()`" ficaria verde com o furo de pe,
  // porque a chamada pode existir sobre o objeto errado.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `_contadores.dispose()` do `dispose()`.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoDescarteDoContador, () {
    testWidgets('MEDICAO: com o app na arvore, o contador esta VIVO',
        (tester) async {
      // A medicao que justifica o grupo. Se ela falhar, a premissa mudou -- o
      // contador ja nasce descartado, ou nao esta no `Escopo` -- e o caso
      // abaixo mediria um objeto que ja estava morto, passando sempre.
      await abrirOApp(
        tester,
        rede: (req) async => json200(<String, dynamic>{}),
        deposito: depositoLogado(),
      );
      final contadores = escopoDoApp(tester).contadores;
      expect(
        () => contadores.addListener(() {}),
        returnsNormally,
        reason: 'O contador do `Escopo` ja estava descartado com o app na '
            'arvore. Sem isto, o caso de baixo nao tem o que ver morrer.',
      );
    });

    testWidgets('quando o app sai da arvore, o contador esta DESCARTADO',
        (tester) async {
      await abrirOApp(
        tester,
        rede: (req) async => json200(<String, dynamic>{}),
        deposito: depositoLogado(),
      );
      final contadores = escopoDoApp(tester).contadores;

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      expect(
        () => contadores.addListener(() {}),
        throwsFlutterError,
        reason: 'REPROVA: o contador sobreviveu ao app. Ele e um '
            '`ChangeNotifier` vivo no `Escopo`, com busca disparada no '
            'arranque e em toda retomada sem ninguem aguardar -- e os cinco '
            'irmaos dele no `dispose()` de `_BichuAppState` sao descartados. '
            'Um notificador que ninguem descarta segura os ouvintes dele '
            'enquanto o processo viver, e em teste de widget cada '
            '`pumpWidget` deixa mais um para tras.',
      );
    });

    test(
        'ISCA: depois do descarte, a resposta em voo nao mexe no numero nem '
        'chega ao icone do aplicativo', () async {
      // O EFEITO da guarda `_descartado`, e nao a leitura dela. Medido em
      // 20/10/2026 sem a guarda: o erro de `notifyListeners` depois do
      // descarte **nao reprova nada** -- o `on Object` de `_contarMensagens`,
      // escrito para "falha de rede nao zera", o engole --, e o objeto fica
      // pela metade, com `mensagens` em 7 e ninguem notificado. E o caminho do
      // icone recebe o numero ANTES disso.
      //
      // DESLIGAR PARA VER REPROVAR: em `ContadoresDeNaoLido`, apague
      // `if (_descartado) return;` de `definir`.
      final espiao = DistintivoEspiao();
      final pedidos = <String>[];
      final cliente = clienteDasDuasFontes(pedidos, naoLidas: 7);
      final contadores = ContadoresDeNaoLido(
        ConversasApi(cliente),
        secoes: ContadoresApi(cliente),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
        distintivo: espiao,
      );

      contadores.dispose();
      await contadores.atualizar();

      expect(
        pedidos.where((c) => c.endsWith('/v1/conversations')).length,
        1,
        reason: 'CONTROLE POSITIVO: o pedido de conversas tem de ter saido. '
            'Sem ele este caso ficaria verde por nao ter exercido caminho '
            'nenhum, que e a forma de aprovacao que este arquivo inteiro '
            'existe para impedir.',
      );
      expect(
        pedidos.where((c) => c.endsWith('/v1/me/section-counters')).length,
        1,
        reason: 'CONTROLE POSITIVO: o pedido das tres contagens de secao tem '
            'de ter saido -- ele e o que exerce a SEGUNDA guarda, a de '
            '`_definirSecoes`.',
      );
      expect(
        contadores.mensagens,
        isNull,
        reason: 'REPROVA: a resposta que chegou depois do descarte publicou o '
            'numero. Sem a guarda o objeto fica PELA METADE -- o campo muda e '
            'o `notifyListeners` estoura entre as duas linhas, dentro de um '
            '`catch` escrito para falha de rede. Um erro de programacao '
            'disfarcado de aparelho sem sinal.',
      );
      expect(
        <int?>[
          contadores.perdidos,
          contadores.rede,
          contadores.eventos,
          contadores.profissionais,
        ],
        everyElement(isNull),
        reason: 'REPROVA: a resposta das TRES contagens de secao chegou '
            'depois do descarte e publicou. E a guarda de `_definirSecoes`, '
            'o segundo dos dois caminhos que `atualizar()` dispara em '
            'paralelo -- e o `on Object` de `atualizarSecoes` engole o erro '
            'pela mesma razao do outro.',
      );
      expect(
        espiao.recebidos,
        isEmpty,
        reason: 'REPROVA: um contador DESCARTADO escreveu no caminho do icone '
            'do aplicativo. Hoje o distintivo e `DistintivoInerte` e nada '
            'acende -- e o ponto de injecao existe exatamente para o dia em '
            'que acender. Nesse dia, o numero de um app que ja saiu da arvore '
            'iria para o icone.',
      );
    });

    test('ISCA: `esquecer()` depois do descarte nao estoura', () {
      // A TERCEIRA guarda. Um `sair()` em curso quando o app sai da arvore
      // chega em `esquecer()` pela lista `limpezasAoSair`, e la o erro cai no
      // `catch` por limpeza de `_apagarTudoDestaConta` -- que existe para que
      // uma limpeza que falhe nao impeca as outras, e nao para esconder
      // notificador descartado. Medido em 20/10/2026 sem a guarda: estoura
      // `A ContadoresDeNaoLido was used after being disposed`.
      //
      // DESLIGAR PARA VER REPROVAR: em `ContadoresDeNaoLido`, apague
      // `if (_descartado) return;` de `esquecer`.
      final cliente = clienteDasDuasFontes(<String>[], naoLidas: 3);
      final contadores = ContadoresDeNaoLido(
        ConversasApi(cliente),
        secoes: ContadoresApi(cliente),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
      );
      contadores.definir(3);
      expect(
        contadores.mensagens,
        3,
        reason: 'CONTROLE POSITIVO: sem numero guardado, `esquecer()` sairia '
            'pelo atalho de `_mensagens == null` e este caso nao exerceria o '
            '`notifyListeners` que ele existe para medir.',
      );

      contadores.dispose();

      expect(
        contadores.esquecer,
        returnsNormally,
        reason: 'REPROVA: o logout de uma sessao que ja saiu da arvore '
            'estourou no contador descartado. O erro nao aparece -- ele e '
            'engolido pelo `catch` de `_apagarTudoDestaConta`, que o '
            'registra como "uma limpeza de logout falhou" --, e e por isso '
            'que a guarda tem de estar aqui e nao la.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // A ISCA DO SINO. Mesmo formato, outro objeto: `ContadorDeAvisos` chegou da
  // frente do PR #33 com o descarte certo e SEM prova de que ele esta la.
  //
  // Nao confundir os dois contadores: este e o do SINO da barra de topo
  // (`GET /v1/me/notifications/count`), e `ContadoresDeNaoLido` e o das
  // CONVERSAS. Os nomes sao parecidos e a arquitetura e a mesma -- e foi
  // justamente essa semelhanca que deixou um deles sem descarte.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `_contadorDeAvisos.dispose()` do `dispose()`.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoDescarteDoSino, () {
    testWidgets('MEDICAO: com o app na arvore, o contador do sino esta VIVO',
        (tester) async {
      await abrirOApp(
        tester,
        rede: (req) async => json200(<String, dynamic>{}),
        deposito: depositoLogado(),
      );
      final sino = escopoDoApp(tester).contadorDeAvisos;
      expect(
        () => sino.addListener(() {}),
        returnsNormally,
        reason: 'O contador do sino ja estava descartado com o app na '
            'arvore. Sem isto, o caso de baixo nao tem o que ver morrer.',
      );
    });

    testWidgets('quando o app sai da arvore, o contador do sino esta '
        'DESCARTADO', (tester) async {
      await abrirOApp(
        tester,
        rede: (req) async => json200(<String, dynamic>{}),
        deposito: depositoLogado(),
      );
      final sino = escopoDoApp(tester).contadorDeAvisos;

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      expect(
        () => sino.addListener(() {}),
        throwsFlutterError,
        reason: 'REPROVA: o contador do sino sobreviveu ao app. A guarda '
            '`_descartado` de `ContadorDeAvisos` depende de alguem chamar o '
            '`dispose()` dela -- sem a linha no `app.dart`, a guarda nunca '
            'liga e o notificador segura os ouvintes enquanto o processo '
            'viver.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // O REGISTRO. Este grupo nao mede comportamento do app: ele mede a LISTA,
  // que e a peca fragil. Ver o cabecalho do arquivo.
  // ------------------------------------------------------------------------
  group('O REGISTRO do `dispose()` de `_BichuAppState`', () {
    late String fonteDoApp;
    late Directory app;

    setUp(() {
      app = raizDoApp();
      fonteDoApp = File('${app.path}/lib/app.dart').readAsStringSync();
    });

    test('o `dispose()` de `app.dart` e exatamente a lista registrada aqui',
        () {
      final campos = camposDoDispose(blocoDoDispose(fonteDoApp)).toSet();
      final registrados = descartesRegistrados.keys.toSet();

      final semRegistro = campos.difference(registrados);
      expect(
        semRegistro,
        isEmpty,
        reason: 'REPROVA: o `dispose()` ganhou campo que ninguem registrou '
            'aqui: $semRegistro. Registre-o com a isca dele -- ou, se o '
            'efeito nao for mensuravel, com o motivo escrito em `semIsca`.',
      );

      final sumiram = registrados.difference(campos);
      expect(
        sumiram,
        isEmpty,
        reason: 'REPROVA: campo registrado SUMIU do `dispose()` de '
            '`lib/app.dart`: $sumiram. Foi assim que `_contadores` nunca '
            'entrou: o `dispose()` tinha cinco linhas, o lote do contador '
            'acrescentou a sexta peca ao app e nao a sexta linha aqui, e '
            'nenhum caso ficou vermelho. Se a remocao foi deliberada, ela vem '
            'junto com a remocao da linha deste registro e com o motivo.',
      );
    });

    test('cada prova registrada e de um tipo so, e existe mesmo', () {
      // O portao do portao: sem isto, `descartesRegistrados` aceitaria nome de
      // grupo inventado, ou as duas colunas em branco, e o registro viraria
      // uma lista de promessas.
      for (final entrada in descartesRegistrados.entries) {
        final v = entrada.value;
        final temIsca = v.arquivo != null && v.grupo != null;
        final temMotivo = v.semIsca != null;

        expect(
          temIsca || temMotivo,
          isTrue,
          reason: 'REPROVA: `${entrada.key}` nao declara isca nem motivo. '
              'Entrada sem nenhum dos dois e o campo entrando no portao sem '
              'pagar nada.',
        );
        expect(
          temIsca && temMotivo,
          isFalse,
          reason: 'REPROVA: `${entrada.key}` declara isca E motivo de nao ter '
              'isca. Sao exclusivos: ou a prova existe, ou esta escrito por '
              'que ela nao existe.',
        );

        if (temMotivo) {
          expect(
            v.semIsca!.length,
            greaterThanOrEqualTo(60),
            reason: 'REPROVA: o motivo de `${entrada.key}` nao ter isca tem '
                '${v.semIsca!.length} caracteres. Motivo curto e o campo '
                '`semIsca` virando carimbo: ele tem de dizer o que impede a '
                'medicao, nao que ela nao foi feita.',
          );
          continue;
        }

        final arquivo = File('${app.path}/${v.arquivo}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: `${entrada.key}` aponta para `${v.arquivo}`, e '
              'esse arquivo nao existe.',
        );
        expect(
          arquivo.readAsStringSync(),
          contains(v.grupo!),
          reason: 'REPROVA: `${entrada.key}` diz que a isca dela e o grupo '
              '"${v.grupo}" em `${v.arquivo}`, e esse texto nao esta la. '
              'Registro que aponta para o nada e pior que registro nenhum: '
              'ele diz que o campo tem prova quando ele nao tem.',
        );
      }
    });

    test('a divida de entradas sem isca nao cresce em silencio', () {
      final semIsca = descartesRegistrados.entries
          .where((e) => e.value.semIsca != null)
          .map((e) => e.key)
          .toList(growable: false);
      expect(
        semIsca.length,
        entradasSemIscaHoje,
        reason: 'REPROVA: hoje sao ${semIsca.length} entradas sem isca '
            '($semIsca) e o piso congelado diz $entradasSemIscaHoje. Sem este '
            'caso, `semIsca` seria a porta dos fundos deste portao: bastaria '
            'escrever uma frase para nunca mais medir nada. Se a entrada nova '
            'realmente nao e mensuravel, suba o numero nesta linha no mesmo '
            'commit -- e ai a decisao aparece na revisao.',
      );
    });

    test('o `dispose()` tem pelo menos uma linha de campo', () {
      // Um `dispose()` vazio passaria nos casos acima se alguem esvaziasse o
      // registro junto. Este e o piso: o app abre cliente HTTP, liga vigia e
      // escuta push, e um descarte que nao desfaz nada vaza tudo.
      expect(
        camposDoDispose(blocoDoDispose(fonteDoApp)),
        isNotEmpty,
        reason: 'REPROVA: o `dispose()` de `_BichuAppState` ficou sem nenhum '
            'descarte de campo.',
      );
    });
  });
}
