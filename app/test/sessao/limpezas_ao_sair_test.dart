// BICHUS-238 — a lista `limpezasAoSair` de `lib/app.dart`, entrada por entrada.
//
// ## O que estava de pe ate aqui
//
// A lista tinha duas entradas e **uma isca**. Tirar `_cofreDoQr.limpar`
// reprovava (`qr_na_tela_test.dart`, `ISCA 3`); tirar
// `() async => _cacheDeMeusPets.limpar()` deixava a suite inteira verde em
// 528/528, com o cache de `Perfil` > `Meus pets` da tutora anterior vivo em
// memoria para quem entrasse em seguida no mesmo aparelho. O mecanismo existia
// e funcionava; ele so nao tinha sido escrito para aquela entrada.
//
// ## DESLIGAR PARA VER REPROVAR, e o que foi medido em 22/09/2026
//
//   1. Em `lib/app.dart`, tire `() async => _cacheDeMeusPets.limpar()` da
//      lista `limpezasAoSair`.
//      Medido: **2 casos reprovam** neste arquivo --
//        - `ISCA — o cache de \`Meus pets\` nao sobrevive ao logout`
//          > `depois de sair(), os pets da tutora anterior nao estao em lugar nenhum`
//        - `O REGISTRO da lista limpezasAoSair`
//          > `a lista de app.dart e exatamente a lista registrada aqui`
//      O segundo e o que importa para o futuro: ele acusa a **remocao** de
//      qualquer entrada, inclusive de uma que ainda nao existe hoje.
//
//   2. Em `lib/app.dart`, tire `_cofreDoQr.limpar`.
//      Medido: **2 casos reprovam** -- o `ISCA 3` de `qr_na_tela_test.dart` e,
//      de novo, o registro deste arquivo.
//
//   3. Acrescente uma entrada nova a lista sem registra-la aqui.
//      Medido: o registro reprova, nomeando a entrada orfa.
//
// ## Por que o registro existe, e nao so a isca
//
// `limpezasAoSair` acumula entrada de entrega diferente (BICHUS-164 pos o
// cache de pets, BICHUS-235 pos o cofre do QR, a `FilaOffline` e a terceira
// candidata). Lista assim e lugar de onde some item sem ninguem ver, e uma
// isca por entrada so protege as entradas que alguem lembrou de escrever.
//
// O registro abaixo inverte o onus: a lista do `app.dart` e comparada com a
// lista declarada aqui, nos **dois sentidos**. Acrescentar entrada sem
// registrar reprova; apagar entrada registrada reprova. E o registro nao
// aceita nome de isca inventado -- ele confere que o arquivo existe e que o
// grupo citado esta escrito la dentro.
//
// Isso nao substitui a isca de comportamento: ele obriga a escreve-la, e
// reprova no minuto em que a entrada some.

import 'dart:io';

import 'package:bichu/api/fila_offline.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import '../telas/ajuda_de_tela.dart';

/// O nome do grupo desta isca, escrito uma vez so.
///
/// Ele e citado pelo registro logo abaixo, e um registro que aponte para um
/// grupo que nao existe reprova. Constante, e nao literal repetido, para que
/// renomear o grupo nao deixe o registro apontando para o nada.
const String grupoDaIscaDoCache =
    'ISCA — o cache de `Meus pets` nao sobrevive ao logout';

/// Onde mora a prova de cada entrada de `limpezasAoSair`.
///
/// **A chave e o campo do `_BichuAppState` que a entrada limpa**, exatamente
/// como ele aparece em `lib/app.dart`. O valor diz onde olhar quando esta
/// entrada reprovar -- e, mais importante, e o que obriga quem acrescenta uma
/// entrada a ter escrito a isca dela antes de a suite ficar verde.
const Map<String, ({String arquivo, String grupo})> iscasDaLista =
    <String, ({String arquivo, String grupo})>{
  '_cacheDeMeusPets': (
    arquivo: 'test/sessao/limpezas_ao_sair_test.dart',
    grupo: grupoDaIscaDoCache,
  ),
  '_cofreDoQr': (
    arquivo: 'test/telas/qr_na_tela_test.dart',
    grupo: 'ISCA 3 — a imagem nao sobrevive ao logout',
  ),
};

/// O prazo da divida da `FilaOffline` (BICHUS-201).
///
/// **PREMISSA, e e esta a unica linha a mudar quando a decisao mudar.** A
/// classe esta correta, tem 221 linhas de teste e **nada no app a instancia**.
/// Ela nao foi removida porque a historia que a liga ja existe e esta no
/// backlog: a **BICHUS-21** (`Marcar o pet como perdido`), cujo criterio 6 diz
/// que a F3.1 funciona inteira sem conexao e o envio acontece na F3.2. O
/// criterio 1 da BICHUS-31 -- `Concluido` -- ja exige a fila em disco, e o 13
/// exige o reenvio com a MESMA `Idempotency-Key`: o que esta classe guarda e
/// justamente o que um reescrever-depois perderia.
///
/// O que este prazo impede e a terceira opcao, a ruim: codigo morto com
/// cobertura, parado por tempo indefinido, parecendo seguranca. Vencido o
/// prazo sem a fila ligada, o caso abaixo REPROVA e a decisao volta para a
/// mesa -- ligar ou remover --, em vez de virar um comentario que ninguem le.
final DateTime prazoDaFilaOffline = DateTime.utc(2026, 10, 31);

/// A rede dos casos de tela deste arquivo.
///
/// O `204` no logout e deliberado: sem ele o `sair()` cairia em
/// `recusadaPeloServidor`, que o observador padrao manda para
/// `FlutterError.reportError` -- e o caso reprovaria por um 404 na revogacao,
/// e nao pelo que ele foi escrito para medir.
Future<http.Response> Function(http.Request) redeComPetsEComLogout(
  List<Map<String, dynamic>> items,
) {
  return (req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': items});
    }
    if (req.url.path.endsWith('/auth/logout')) return http.Response('', 204);
    return problema('not-found', 404);
  };
}

/// O `app/` do repositorio, achado a partir do diretorio corrente.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e essa a classe de defeito que este arquivo existe para
/// fechar.
Directory raizDoApp() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/lib/app.dart').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei `lib/app.dart` subindo a partir de '
    '"${Directory.current.path}". Sem ele este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// O texto entre os colchetes de `limpezasAoSair: <LimpezaAoSair>[ ... ]`.
String blocoDaLista(String fonte) {
  const String marca = 'limpezasAoSair: <LimpezaAoSair>[';
  final inicio = fonte.indexOf(marca);
  if (inicio < 0) {
    throw StateError(
      'REPROVA: nao achei `$marca` em `lib/app.dart`. Ou a lista mudou de '
      'forma, ou ela sumiu. Nos dois casos este portao parou de conferir a '
      'lista de limpezas do logout, e isso nao pode passar calado.',
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
    'REPROVA: os colchetes de `limpezasAoSair` nao fecham em `lib/app.dart`.',
  );
}

/// Os campos limpos pela lista, um por entrada, na ordem em que aparecem.
///
/// **Reprova quando nao consegue ler uma entrada.** Uma entrada em forma que
/// este leitor nao entende nao pode virar "nenhuma entrada": seria o portao
/// aprovando por cegueira, que e pior do que nao existir.
List<String> camposDaLista(String bloco) {
  final semComentarios = bloco
      .split('\n')
      .map((l) {
        final corte = l.indexOf('//');
        return corte < 0 ? l : l.substring(0, corte);
      })
      .join('\n');

  final entradas = <String>[];
  final atual = StringBuffer();
  var profundidade = 0;
  for (final c in semComentarios.split('')) {
    if (c == '[' || c == '(' || c == '{') profundidade += 1;
    if (c == ']' || c == ')' || c == '}') profundidade -= 1;
    if (c == ',' && profundidade == 0) {
      entradas.add(atual.toString());
      atual.clear();
      continue;
    }
    atual.write(c);
  }
  entradas.add(atual.toString());

  final campos = <String>[];
  for (final bruta in entradas) {
    final entrada = bruta.trim();
    if (entrada.isEmpty) continue;
    final achados = RegExp(r'_[A-Za-z0-9_]+')
        .allMatches(entrada)
        .map((m) => m.group(0)!)
        .toSet();
    if (achados.length != 1) {
      throw StateError(
        'REPROVA: nao consegui dizer QUAL campo a entrada "$entrada" de '
        '`limpezasAoSair` limpa (achei ${achados.length} candidatos: '
        '$achados). Este portao existe para saber, entrada por entrada, o que '
        'a lista limpa; uma entrada que ele nao le seria uma entrada sem '
        'cobertura passando por cima dele. Escreva a entrada na forma '
        '`_campo.limpar` (ou `() async => _campo.limpar()`), ou ensine este '
        'leitor a ler a forma nova -- nunca deixe o portao adivinhando.',
      );
    }
    campos.add(achados.single);
  }
  return campos;
}

void main() {
  // ------------------------------------------------------------------------
  // A isca que faltava. Ela olha o EFEITO -- o que sobrou onde --, e nao a
  // chamada: um caso que conferisse "o logout chamou `limpar()`" ficaria verde
  // com o furo inteiro de pe, porque a chamada pode existir sobre o objeto
  // errado. Foi assim que este mesmo defeito ja aconteceu uma vez: a limpeza
  // morava no `onPressed` de `abas.dart` e os quatro desfechos de `sair()`
  // nao passam todos por botao.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `() async => _cacheDeMeusPets.limpar()` da lista `limpezasAoSair`.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoCache, () {
    testWidgets('MEDICAO: abrir `Meus pets` deixa os pets no cache',
        (tester) async {
      // A medicao que justifica o resto do grupo, e nao uma exigencia de
      // produto. Se um dia ela falhar, a premissa mudou -- o cache deixou de
      // guardar, ou deixou de ser por dono -- e a limpeza do logout precisa
      // ser reavaliada, nao apagada.
      final cache = CacheDeMeusPets();
      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeMeusPets: cache,
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      expect(
        cache.pets('u-1'),
        isNotNull,
        reason: 'A tela nao guardou nada no cache, e sem isso o caso do '
            'logout mediria a limpeza de um cache que ja estava vazio -- '
            'passaria sempre, inclusive com o furo aberto.',
      );
      expect(cache.pets('u-1')!.single.nome, 'Nina');
    });

    testWidgets(
        'depois de `sair()`, os pets da tutora anterior nao estao em lugar '
        'nenhum', (tester) async {
      final cache = CacheDeMeusPets();
      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeMeusPets: cache,
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();
      expect(cache.pets('u-1'), isNotNull);

      // Pelo controlador, e nao pelo botao: os QUATRO desfechos de `sair()`
      // passam por aqui, inclusive o que nao tem botao nenhum -- a sessao
      // derrubada por refresh recusado. Foi exatamente assim que este cache
      // sobreviveu quando a limpeza morava no `onPressed` de `abas.dart`.
      final escopo = Escopo.of(tester.element(find.byType(Scaffold).first));
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        cache.pets('u-1'),
        isNull,
        reason: 'REPROVA: os pets da tutora que acabou de sair continuam no '
            'cache de `Perfil` > `Meus pets`, e o cache vive enquanto o '
            'processo viver. Nome, especie, porte, estado de caso aberto e '
            'quantas tags o animal tem ficam em memoria para a proxima pessoa '
            'que usar este aparelho -- o celular da recepcao do pet shop, o do '
            'casal, o usado que acabou de ser vendido. Descartar a tela nao '
            'resolve: ela e descartada e a entrada FICA, que e a mesma forma '
            'do defeito do cofre do QR.',
      );

      // "Em lugar nenhum" precisa valer para qualquer chave, e nao so para a
      // que este caso conhece: um `limpar()` que so esquecesse a lista e
      // mantivesse o dono deixaria o dado la, alcancavel por quem soubesse
      // pedir.
      for (final chave in <String>['u-1', 'u-2', 'qualquer-outra']) {
        expect(
          cache.pets(chave),
          isNull,
          reason: 'REPROVA: o cache ainda devolve alguma coisa para "$chave" '
              'depois do logout. Depois de `sair()` ele tem de estar como '
              'recem-criado.',
        );
      }
    });
  });

  // ------------------------------------------------------------------------
  // O REGISTRO. Este grupo nao mede comportamento do app: ele mede a LISTA,
  // que e a peca fragil. Ver o cabecalho do arquivo.
  // ------------------------------------------------------------------------
  group('O REGISTRO da lista `limpezasAoSair`', () {
    late String fonteDoApp;
    late Directory app;

    setUp(() {
      app = raizDoApp();
      fonteDoApp = File('${app.path}/lib/app.dart').readAsStringSync();
    });

    test('a lista de `app.dart` e exatamente a lista registrada aqui', () {
      final campos = camposDaLista(blocoDaLista(fonteDoApp)).toSet();
      final registrados = iscasDaLista.keys.toSet();

      final semIsca = campos.difference(registrados);
      expect(
        semIsca,
        isEmpty,
        reason: 'REPROVA: a lista `limpezasAoSair` ganhou entrada que ninguem '
            'registrou aqui: $semIsca. Toda entrada dessa lista apaga dado de '
            'uma conta no logout, e entrada sem isca e entrada que uma '
            'refatoracao apaga amanha sem nenhum caso ficar vermelho -- foi '
            'exatamente o que a BICHUS-238 encontrou. Escreva a isca da '
            'entrada nova (olhando o EFEITO: depois de `sair()`, o dado nao '
            'esta em lugar nenhum) e acrescente a linha em `iscasDaLista`.',
      );

      final sumiram = registrados.difference(campos);
      expect(
        sumiram,
        isEmpty,
        reason: 'REPROVA: entrada registrada SUMIU de `limpezasAoSair` em '
            '`lib/app.dart`: $sumiram. Se a remocao foi deliberada, ela tem '
            'de vir junto com a remocao da linha em `iscasDaLista` e com o '
            'motivo -- e ai a isca daquela entrada tambem reprova, que e o '
            'aviso que se quer. Se nao foi deliberada, o dado da conta '
            'anterior acabou de voltar a sobreviver ao logout.',
      );
    });

    test('cada isca registrada existe mesmo, no arquivo que ela diz', () {
      // O portao do portao: sem isto, `iscasDaLista` aceitaria nome inventado
      // e o registro viraria uma lista de promessas.
      for (final entrada in iscasDaLista.entries) {
        final arquivo = File('${app.path}/${entrada.value.arquivo}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: `${entrada.key}` aponta para '
              '`${entrada.value.arquivo}`, e esse arquivo nao existe.',
        );
        expect(
          arquivo.readAsStringSync(),
          contains(entrada.value.grupo),
          reason: 'REPROVA: `${entrada.key}` diz que a isca dela e o grupo '
              '"${entrada.value.grupo}" em `${entrada.value.arquivo}`, e esse '
              'texto nao esta la. Registro que aponta para o nada e pior que '
              'registro nenhum: ele diz que a entrada tem prova quando ela '
              'nao tem.',
        );
      }
    });

    test('a lista tem pelo menos uma entrada', () {
      // Uma lista vazia passaria nos dois casos acima se alguem esvaziasse o
      // registro junto. Este caso e o piso: o app guarda dado de conta
      // em memoria, e o logout tem de apagar alguma coisa.
      expect(
        camposDaLista(blocoDaLista(fonteDoApp)),
        isNotEmpty,
        reason: 'REPROVA: `limpezasAoSair` ficou vazia. O app guarda cache de '
            'pets e a imagem do QR em memoria; logout que nao apaga nada '
            'entrega a conta anterior para quem entrar em seguida.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // A DIVIDA da `FilaOffline` (BICHUS-201), com data e com quem a cobra.
  //
  // Nao e um comentario: e um caso que REPROVA no dia em que o prazo vence.
  // ------------------------------------------------------------------------
  group('a divida da `FilaOffline` tem dono, prazo e obrigacao', () {
    late Directory app;
    late List<String> ondeEstaLigada;

    setUp(() {
      app = raizDoApp();
      final fontes = Directory('${app.path}/lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .where((f) => !f.path.endsWith('api/fila_offline.dart'))
          .toList(growable: false);
      expect(
        fontes,
        isNotEmpty,
        reason: 'REPROVA: nao achei fonte nenhuma em `lib/`. Portao sem o que '
            'conferir reprova; verde por vazio e o defeito.',
      );
      ondeEstaLigada = fontes
          .where((f) => RegExp(r'\bFilaOffline\s*\(').hasMatch(
                f.readAsStringSync(),
              ))
          .map((f) => f.path.substring(app.path.length + 1))
          .toList(growable: false);
    });

    test('enquanto ela for codigo morto, o prazo vale', () {
      if (ondeEstaLigada.isNotEmpty) return;
      expect(
        DateTime.now().toUtc().isBefore(prazoDaFilaOffline),
        isTrue,
        reason: 'REPROVA: o prazo da divida da `FilaOffline` venceu em '
            '${prazoDaFilaOffline.toIso8601String()} e nada no app ainda a '
            'instancia. Sao 221 linhas de teste cobrindo codigo que nao roda: '
            'isso nao e seguranca, e a aparencia dela, e a proxima pessoa a '
            'ler a cobertura vai acreditar que o caminho offline existe. A '
            'decisao volta para a mesa AGORA, e ela e uma das duas: ligar a '
            'fila (a BICHUS-21, `Marcar o pet como perdido`, e a historia que '
            'a pede, criterio 6) ou apagar a classe e os dois arquivos de '
            'teste. Empurrar a data e a terceira, e ela precisa de motivo '
            'escrito nesta linha.',
      );
    });

    test('no dia em que ela for ligada, ela entra em `limpezasAoSair` junto',
        () {
      if (ondeEstaLigada.isEmpty) return;
      // A obrigacao que o cabecalho da propria classe declara, transformada em
      // caso. A fila guarda em DISCO o que a pessoa digitou -- nome do pet,
      // endereco de referencia, telefone de contato --, e fila que sobrevive
      // ao logout e dado de uma conta esperando a proxima pessoa que entrar
      // naquele aparelho.
      final bloco = blocoDaLista(
        File('${app.path}/lib/app.dart').readAsStringSync(),
      );
      expect(
        bloco.toLowerCase(),
        contains('fila'),
        reason: 'REPROVA: a `FilaOffline` passou a ser instanciada '
            '($ondeEstaLigada) e a limpeza dela NAO entrou em '
            '`limpezasAoSair` no `lib/app.dart`. Ela guarda dado da conta em '
            'disco, e disco sobrevive a tudo -- inclusive ao logout e ao app '
            'ser encerrado pelo sistema. O registro em `iscasDaLista` e a '
            'isca da entrada nova vem no mesmo commit.',
      );
    });

    test('a classe continua onde o registro diz que ela esta', () {
      // Sem isto, apagar a classe deixaria os dois casos acima verdes por
      // vazio: nenhum arquivo a instancia, e o prazo nunca mais seria cobrado.
      expect(
        File('${app.path}/lib/api/fila_offline.dart').existsSync(),
        isTrue,
        reason: 'REPROVA: `lib/api/fila_offline.dart` sumiu. Se a decisao foi '
            'remover a fila, este grupo inteiro sai junto, no mesmo commit, e '
            'a BICHUS-201 registra o motivo. O que nao pode e a classe sumir e '
            'o prazo continuar aqui cobrando um fantasma.',
      );
      expect(FilaOffline.teto, greaterThan(0));
    });
  });
}
