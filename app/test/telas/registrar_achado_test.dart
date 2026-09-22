// BICHUS-35 — F3.5, a tela do achado avulso, medida no app MONTADO.
//
// As tres afirmacoes que este arquivo transforma em caso, e que hoje so
// existiriam escritas:
//
//   1. **a tela nao diz "registrado" para o que esta na fila** (criterio 2 da
//      BICHUS-31). Tela de sucesso para o que nao aconteceu faz a pessoa parar
//      de procurar caminho;
//   2. **o achado de outra pessoa nao fica visivel**. Quem sustenta isso e a
//      clausula `WHERE` do servidor, e o que esta tela pode estragar e ler o
//      registro de um lugar que nao e o servidor;
//   3. **quem concede o GPS e nao digita nada fica sem rotulo de area, e a
//      tela DIZ isso** -- a consequencia que a BICHUS-23 deixou para esta
//      historia resolver.
//
// E mais uma, que o app ja pagou caro para ter: **nenhum controle anunciado
// como botao fica sem acao de toque**. Quatro widgets deste app ja apareceram
// com `btn=true tap=false`, e a unica fonte que enxerga isso e a arvore de
// semantica em EXECUCAO.
//
// POR QUE O APP INTEIRO, e nao a tela solta: a tela depende do `Escopo`, do
// `GoRouter` e do tema, e montada fora deles ela passa no teste e quebra no
// aparelho. Montar o app tambem e o que faz o caso percorrer tela, `AchadosApi`,
// `ApiClient` e a traducao de `Problem`.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/achados_api.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../a11y/verificador.dart';
import '../sessao/limpezas_ao_sair_test.dart' show raizDoApp;
import 'ajuda_de_tela.dart';

const String _idDoAchado = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';

/// O `FoundReport` como o servidor o devolve, campo a campo do contrato.
///
/// **`photo_url` sai nulo**, e esse e o valor de verdade: a foto do achador e
/// vista pelo tutor dentro da conversa mediada, e so (criterio 9).
Map<String, dynamic> achadoDoContrato({String? rotuloDaArea}) {
  return <String, dynamic>{
    'id': _idDoAchado,
    'origin': 'stray_report',
    'status': 'open',
    'species': 'dog',
    'size': 'M',
    'area_label': rotuloDaArea,
    'found_at': '2026-09-22T19:00:00Z',
    'photo_url': null,
    'notes': 'coleira azul sem placa',
    'conversation_id': null,
    'created_at': '2026-09-22T19:01:00Z',
  };
}

/// Uma rede que conta o que foi pedido.
///
/// O contador nao e enfeite: ele e o que faz a isca do achado alheio medir a
/// coisa certa. Uma tela que desenhasse o achado sem PERGUNTAR ao servidor
/// passaria por qualquer verificacao de texto, e so o zero de pedidos a
/// denuncia.
class _Rede {
  _Rede({this.respostaDoAchado, this.semSinal = false});

  final http.Response? respostaDoAchado;
  final bool semSinal;

  int pedidosDeAchado = 0;
  int pedidosDeRegistro = 0;
  Map<String, dynamic>? corpoDoRegistro;
  String? chaveDeIdempotencia;

  Future<http.Response> call(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (req.url.path == '/v1${AchadosApi.caminhoDeRegistro}' &&
        req.method == 'POST') {
      pedidosDeRegistro += 1;
      corpoDoRegistro = jsonDecode(req.body) as Map<String, dynamic>;
      chaveDeIdempotencia = req.headers['idempotency-key'] ??
          req.headers['Idempotency-Key'];
      // `ClientException` e o que o cliente HTTP lanca sem sinal, e e o que
      // `ApiClient` traduz para `FalhaDeConexao`.
      if (semSinal) throw http.ClientException('sem sinal', req.url);
      return json200(achadoDoContrato(), status: 201);
    }
    if (req.url.path.startsWith('/v1${AchadosApi.caminhoDeRegistro}/')) {
      pedidosDeAchado += 1;
      return respostaDoAchado ?? json200(achadoDoContrato());
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    return problema('not-found', 404);
  }
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
///
/// Pelo rotulo declarado no widget, e nao por `widgetWithText`: o rotulo do
/// `BichuField` e um `Text` IRMAO do campo, e nao um descendente dele.
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is BichuField && w.rotulo == rotulo,
      ),
      matching: find.byType(TextField),
    );

/// Preenche o minimo do contrato pela TELA, como a pessoa faria.
///
/// Nao monta rascunho por fora: o que se quer medir e que o formulario aceita
/// o pouco que a pessoa tem, e um rascunho montado em Dart pularia justamente
/// os campos que a tela poderia estar cobrando.
Future<void> preencherOMinimo(
  WidgetTester tester, {
  /// Verdadeiro escreve a cidade. Falso deixa o lugar so com a coordenada --
  /// o caminho de quem concede o GPS e nao digita nada.
  bool digitarACidade = true,
}) async {
  // `rolarAte` antes de cada toque: o `ListView` so constroi o que cabe na
  // tela, e F3.5 e um formulario longo de proposito. Um `tap` num widget que
  // ainda nao existe reprova por um motivo que nao e o do caso.
  await rolarAte(tester, find.text('Cão'));
  await tocar(tester, find.text('Cão'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
  if (digitarACidade) {
    await rolarAte(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
    await tocar(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
    await tester.enterText(_campo(TextosDaLocalizacao.rotuloCidade), 'São Paulo');
    await tester.pumpAndSettle();
  } else {
    await rolarAte(tester, find.text(TextosDaLocalizacao.usarMinhaLocalizacao));
    await tocar(tester, find.text(TextosDaLocalizacao.usarMinhaLocalizacao));
  }
  await rolarAte(tester, find.text('Agora'));
  await tocar(tester, find.text('Agora'));
}

Future<void> tocarEmRegistrar(WidgetTester tester) async {
  final botao = find.widgetWithText(BotaoPrimario, TextosDoAchado.registrar);
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

/// A localizacao concedida, que devolve um ponto e nada de texto.
LocalizacaoDeTeste localizacaoConcedida() =>
    LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 — a tela nao diz "registrado" para o que esta na fila
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/tela_achado_registrado.dart`, troque
  // `final registrado = resultado.foiRegistrado;` por
  // `const registrado = true;`.
  // Medido em 22/09/2026: **2 casos reprovam** neste grupo.
  //
  // O grupo mede os DOIS sentidos de proposito. Um caso que so conferisse o
  // texto da fila ficaria verde numa tela que dissesse "na fila" sempre --
  // inclusive para o achado que o servidor aceitou, que e o defeito espelhado
  // e igualmente mentiroso.
  // -------------------------------------------------------------------------
  group('ISCA — `na fila` nao e `registrado`', () {
    testWidgets('sem sinal, a tela diz que vai registrar quando voltar',
        (tester) async {
      final rede = _Rede(semSinal: true);
      final fila = DepositoDaFilaEmMemoria();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
        depositoDaFila: fila,
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      expect(
        find.text(TextosDoAchado.tituloDaFila),
        findsOneWidget,
        reason: 'REPROVA: o achado foi para a fila e a tela nao disse isso.',
      );
      expect(
        find.text(TextosDoAchado.tituloDoRegistrado),
        findsNothing,
        reason: 'REPROVA: a tela diz "${TextosDoAchado.tituloDoRegistrado}" '
            'para um achado que o servidor NUNCA VIU. O criterio 2 da '
            'BICHUS-31 proibe tela de sucesso para o que nao aconteceu: quem '
            'acredita que o aviso saiu para de procurar caminho, e o animal '
            'que ela tem no colo nao entra em cruzamento nenhum ate o sinal '
            'voltar.',
      );

      // A promessa que a tela faz precisa ser a que a fila cumpre: se a acao
      // nao esta no disco, a frase e propaganda.
      expect(
        fila.acoes,
        hasLength(1),
        reason: 'REPROVA: a tela prometeu registrar quando a conexao voltar e '
            'nao enfileirou nada. A frase ficaria sendo a unica coisa que '
            'aconteceu.',
      );
      expect(fila.acoes.single['caminho'], AchadosApi.caminhoDeRegistro);
      expect(
        fila.acoes.single['idempotency_key'],
        rede.chaveDeIdempotencia,
        reason: 'REPROVA: a acao enfileirada levou uma chave de idempotencia '
            'DIFERENTE da que a tentativa usou. No reenvio o servidor trataria '
            'o pedido como novo, e a mesma tutora receberia a mesma sugestao '
            'duas vezes (criterio 13 da BICHUS-31).',
      );
    });

    testWidgets('com o 201 do servidor, a tela diz registrado', (tester) async {
      final rede = _Rede();
      final fila = DepositoDaFilaEmMemoria();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
        depositoDaFila: fila,
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      expect(find.text(TextosDoAchado.tituloDoRegistrado), findsOneWidget);
      expect(
        find.text(TextosDoAchado.tituloDaFila),
        findsNothing,
        reason: 'REPROVA: o servidor respondeu 201 e a tela diz que vai '
            'registrar depois. O espelho do defeito acima: a pessoa fica '
            'esperando uma coisa que ja aconteceu, e pode registrar de novo.',
      );
      expect(
        fila.gravacoes,
        0,
        reason: 'REPROVA: o achado saiu pela rede E foi para a fila. O reenvio '
            'criaria um segundo achado do mesmo animal.',
      );
    });

    testWidgets('o corpo leva os quatro do contrato e nada de foto',
        (tester) async {
      final rede = _Rede();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      final corpo = rede.corpoDoRegistro!;
      expect(corpo['species'], 'dog');
      expect(corpo['size'], 'M');
      expect(corpo['found_at'], isA<String>());
      expect((corpo['area'] as Map)['city'], 'São Paulo');
      // Os opcionais que a pessoa nao preencheu **nao viajam**. Um
      // `breed_code: null` num corpo de criacao diria "a raca e nula" onde o
      // contrato le "nao informado".
      expect(corpo.containsKey('breed_code'), isFalse);
      expect(corpo.containsKey('primary_color_code'), isFalse);
      expect(corpo.containsKey('sex'), isFalse);
      expect(
        corpo.containsKey('photo_upload_id'),
        isFalse,
        reason: 'REPROVA: o corpo do registro leva `photo_upload_id`. Nao ha '
            'valor valido para esse campo antes do registro: a intencao de '
            'upload exige `found_report_id`, ou seja, exige que o achado ja '
            'exista. O que viajasse ali seria inventado.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — o achado de outra pessoa nao fica visivel
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/achado/tela_do_achado.dart`,
  // troque o ramo do 404 para cair em `_erro` e deixe `_achado` como estava,
  // ou faca a tela desenhar de um `extra` sem chamar `buscar`.
  // Medido em 22/09/2026: **1 caso reprova** neste grupo.
  // -------------------------------------------------------------------------
  group('ISCA — o achado de outra pessoa responde ausencia', () {
    testWidgets('404 do servidor nao deixa nada do achado na tela',
        (tester) async {
      // O 404 e a resposta de "nao e seu" E de "nao existe", e a igualdade e
      // deliberada (ADR-0021): um 403 confirmaria que aquele identificador e
      // um achado de verdade.
      final rede = _Rede(respostaDoAchado: problema('not-found', 404));
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.achadoDe(_idDoAchado));

      expect(
        rede.pedidosDeAchado,
        greaterThan(0),
        reason: 'REPROVA: a tela do achado desenhou sem PERGUNTAR ao servidor. '
            'Quem sustenta "achado alheio responde ausencia" e a clausula '
            '`WHERE` do servidor: uma tela que lesse o registro de um cache, '
            'de um `extra` ou de um rascunho local faria a regra deixar de '
            'valer no unico lugar em que ela e visivel -- o aparelho '
            'compartilhado, onde a segunda pessoa a entrar herda a tela da '
            'primeira.',
      );
      expect(find.text(TextosDoAchado.naoEncontrado), findsOneWidget);
      // **Nada do achado na arvore.** Meia tela ja contaria que o registro
      // existe, e e exatamente isso que o 404 unico fecha.
      expect(
        find.textContaining('coleira azul'),
        findsNothing,
        reason: 'REPROVA: a observacao de um achado que nao e desta conta '
            'apareceu na tela.',
      );
      expect(
        find.textContaining('Região:'),
        findsNothing,
        reason: 'REPROVA: a regiao de um achado que nao e desta conta apareceu '
            'na tela. Bairro e cidade de onde um animal foi achado sao dado '
            'de outra pessoa.',
      );
    });

    testWidgets('o achado da propria conta aparece', (tester) async {
      // O outro sentido: um portao que so soubesse esconder ficaria verde com
      // uma tela que nunca mostra nada, e ele sumiria do CI do mesmo jeito.
      final rede = _Rede(
        respostaDoAchado: json200(achadoDoContrato(rotuloDaArea: 'Pinheiros')),
      );
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.achadoDe(_idDoAchado));

      expect(find.textContaining('Pinheiros'), findsOneWidget);
      expect(find.textContaining('coleira azul'), findsOneWidget);
      expect(find.text(TextosDoAchado.naoEncontrado), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 — sem rotulo de area, a tela DIZ
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/tela_registrar_achado.dart`, faca `_avisoDoLugar`
  // devolver `null` sempre.
  // Medido em 22/09/2026: **1 caso reprova**.
  // -------------------------------------------------------------------------
  group('ISCA — quem so da o GPS fica sem bairro, e a tela avisa', () {
    testWidgets('com ponto e sem texto, a tela explica o que o tutor vai ver',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester, digitarACidade: false);

      // `passo` negativo: o aviso fica ACIMA de `Quando?`, e o ultimo toque
      // de `preencherOMinimo` rolou a lista para baixo. `scrollUntilVisible`
      // so procura num sentido.
      await rolarAte(
        tester,
        find.text(TextosDoAchado.semRotuloDeArea),
        passo: -120,
      );
      expect(
        find.text(TextosDoAchado.semRotuloDeArea),
        findsOneWidget,
        reason: 'REPROVA: a pessoa concedeu a localizacao, nao digitou nada, e '
            'a tela nao disse que o achado dela vai aparecer sem bairro.\n'
            '`area_label` so se monta com texto digitado -- `rotuloDaArea` le '
            '`city` e `neighborhood`, e coordenada nao entra ali nem '
            'arredondada. Derivar o bairro do ponto e o que o ADR-0006 '
            'proibe. Entao ou a tela pergunta, ou o achado chega sem rotulo e '
            'ninguem avisou.',
      );
      // E o outro estado, para a frase nao virar decoracao permanente.
      expect(find.text(TextosDoAchado.semCoordenada), findsNothing);
    });

    testWidgets('com bairro digitado, o aviso do rotulo some', (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);

      expect(find.text(TextosDoAchado.semRotuloDeArea), findsNothing);
      await rolarAte(
        tester,
        find.text(TextosDoAchado.semCoordenada),
        passo: -120,
      );
      expect(
        find.text(TextosDoAchado.semCoordenada),
        findsOneWidget,
        reason: 'REPROVA: a pessoa digitou o bairro e nao deu coordenada, e a '
            'tela nao disse que a busca passa a valer na cidade inteira. Sem '
            'isso ela acredita que a distancia foi medida.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 4 — nenhum controle de F3.5 se anuncia como botao sem acao
  //
  // A fonte e a arvore de semantica em EXECUCAO, com o app montado, e nunca o
  // texto do codigo: uma varredura de fonte casaria com a mencao ao proprio
  // mecanismo dentro de um comentario -- e ha um, logo acima do
  // `_DataEscolhida` desta tela.
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/tela_registrar_achado.dart`, apague a linha
  // `onTap: aoTrocar,` do `Semantics` de `_DataEscolhida`.
  // Medido em 22/09/2026: **1 caso reprova**, nomeando o controle.
  // -------------------------------------------------------------------------
  group('ISCA — a arvore de semantica de F3.5', () {
    testWidgets('todo botao de F3.5 tem acao de toque', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      // `Outra data` para o `_DataEscolhida` existir na arvore: ele e o unico
      // controle desta tela que embrulha o filho em
      // `Semantics(..., excludeSemantics: true)`, que e a forma exata do
      // defeito.
      await rolarAte(tester, find.text('Outra data'));
      await tocar(tester, find.text('Outra data'));
      // O calendario abre por cima; fecha-lo devolve a tela com a linha da
      // data escolhida montada.
      await tocar(tester, find.text('OK'));

      final violacoes = verificarAcaoDosControles(
        tester,
        tela: 'f3.5',
        tema: 'claro',
        // Sem contagem fixa: F3.5 muda de controles conforme o estado da
        // captura de localizacao, e um numero chutado aqui viraria manutencao
        // a cada mexida na peca da BICHUS-23. O piso de "ha botao" ja reprova
        // a varredura que nao esta olhando para nada.
      );
      expect(
        violacoes,
        isEmpty,
        reason: 'REPROVA: ha controle anunciado como botao e sem acao em '
            'F3.5.\n${relatorio(violacoes)}\n'
            'Quem usa TalkBack ou VoiceOver ouve que existe um botao e nao tem '
            'como aciona-lo. Se o controle embrulha o filho num '
            '`Semantics(..., excludeSemantics: true)`, redeclare `onTap` com a '
            'MESMA acao do `onPressed` do filho.',
      );
      handle.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // O que esta tela NAO guarda no aparelho.
  //
  // `limpezasAoSair` tem registro cobrado por teste
  // (`test/sessao/limpezas_ao_sair_test.dart`): entrada nova sem isca reprova,
  // e entrada registrada que some reprova. A BICHUS-35 **nao acrescenta
  // entrada**, e este grupo e o que torna essa afirmacao verificavel em vez de
  // ser uma frase no commit.
  //
  // O que sobrevive ao app fechar sao duas pecas que ja existiam e que ja tem
  // limpeza registrada: o envelope de intencao e a fila offline.
  // -------------------------------------------------------------------------
  group('a BICHUS-35 nao abriu gaveta nova no aparelho', () {
    test('nada em `achado/` nem em `telas/achado/` sabe gravar', () {
      const formasDeGravar = <String, String>{
        'SharedPreferences': 'preferencias do sistema',
        'FlutterSecureStorage': 'o chaveiro',
        'getApplicationDocumentsDirectory': 'o diretorio do app',
        'writeAsString': 'escrita em arquivo',
        'DepositoEmArquivo': 'um deposito proprio em disco',
      };
      final pastas = <String>['lib/achado', 'lib/telas/achado'];
      var conferidos = 0;
      for (final pasta in pastas) {
        final dir = Directory('${raizDoApp().path}/$pasta');
        expect(
          dir.existsSync(),
          isTrue,
          reason: 'REPROVA: $pasta nao existe. Portao sem o que conferir fica '
              'verde por vazio.',
        );
        for (final f in dir.listSync(recursive: true).whereType<File>()) {
          if (!f.path.endsWith('.dart')) continue;
          conferidos += 1;
          final codigo = f.readAsStringSync();
          for (final forma in formasDeGravar.entries) {
            expect(
              codigo.contains(forma.key),
              isFalse,
              reason: 'REPROVA: ${f.path} grava em ${forma.value} '
                  '(`${forma.key}`).\n'
                  'O achado guarda FOTO e LOCALIZACAO, que sao dado pessoal: '
                  'o que fica no aparelho sobrevive ao logout e precisa entrar '
                  'em `limpezasAoSair` do `ControladorDeSessao`, com isca '
                  'propria, NO MESMO COMMIT. Enquanto nao entrar, esta tela '
                  'nao guarda nada -- e hoje ela nao precisa: o que sobrevive '
                  'ao app fechar e o envelope de intencao e a fila offline, e '
                  'os dois ja estao na lista.',
            );
          }
        }
      }
      expect(
        conferidos,
        greaterThan(3),
        reason: 'REPROVA: conferi $conferidos arquivo(s). A BICHUS-35 tem seis '
            'fontes nas duas pastas; um numero baixo aqui e o portao varrendo '
            'a pasta errada.',
      );
    });
  });
}
