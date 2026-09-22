// BICHUS-21 — marcar o pet como perdido: onde e quando ele foi visto.
//
// O fluxo inteiro, medido no app montado: a porta em `Perfil` > `Meus pets`,
// a escolha de quem e o caso (F3.0), o formulario (F3.1), o alcance e o envio
// (F3.2) e o resultado (F3.3).
//
// ---------------------------------------------------------------------------
// AS QUATRO ISCAS DESTE ARQUIVO
// ---------------------------------------------------------------------------
//
// Cada grupo abaixo existe para reprovar uma coisa que o codigo poderia voltar
// a fazer sem ninguem notar. Os nomes dos grupos dizem qual:
//
// 1. `so o pet do chamador` — a acao chega a um pet que nao saiu da lista da
//    pessoa. A porta e a unica entrada, e ela so entrega `Pet` que veio de
//    `GET /pets`; a rota recusa qualquer outra coisa no `extra`.
// 2. `data no futuro` — "visto pela ultima vez amanha" e aceito. A regra
//    existia em `quando_foi_visto.dart` **sem nenhum teste** ate esta
//    historia.
// 3. `acao com destino` — a barra de acao oferece um caminho que nao existe:
//    sem pet elegivel, ou para uma rota que o roteador nao registra.
// 4. `na fila nao e aberto` — a tela diz que o caso foi aberto quando ele esta
//    so enfileirado. E o defeito que o criterio 2 da BICHUS-31 nomeia.
//
// Os casos montam o APP INTEIRO, e nao a tela solta, pelo motivo do cabecalho
// de `ajuda_de_tela.dart`: a tela depende do `Escopo`, do roteador e do tema,
// e o que precisa ser medido aqui inclui a rota, o `extra` e a fila.

import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:bichu/api/modelos.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/perdido/resultado_da_abertura.dart';
import 'package:bichu/telas/perdido/tela_alcance_do_alerta.dart';
import 'package:bichu/telas/perdido/tela_de_quem_e_o_caso.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

Map<String, dynamic> pet({
  required String id,
  required String nome,
  String status = 'active',
}) {
  return <String, dynamic>{
    'id': id,
    'name': nome,
    'species': 'dog',
    'size': 'M',
    'status': status,
    'active_tag_count': 1,
  };
}

/// Um servidor que responde `GET /pets` com [pets] e nada mais.
///
/// O que nao esta declarado responde 404 **de proposito**: um dublê que
/// inventasse sucesso para uma rota que ninguem pediu esconderia a chamada a
/// mais, e o criterio 6 desta historia e sobre F3.1 nao chamar rede nenhuma.
Future<http.Response> Function(http.Request) servidorCom(
  List<Map<String, dynamic>> pets, {
  Map<String, dynamic>? previa,
  Map<String, dynamic>? casoCriado,
  List<String>? registro,
}) {
  return (req) async {
    registro?.add('${req.method} ${req.url.path}');
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': pets});
    }
    if (req.url.path.endsWith('/lost-case-preview') && req.method == 'GET') {
      if (previa == null) return http.Response('', 503);
      return json200(previa);
    }
    if (req.url.path.endsWith('/lost-cases') && req.method == 'POST') {
      if (casoCriado == null) return http.Response('', 503);
      return json200(casoCriado, status: 201);
    }
    if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
      return http.Response('', 204);
    }
    return http.Response('', 404);
  };
}

/// Abre o app logado e entra em `Perfil`, como a tutora entra.
Future<void> abrirOPerfil(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  RegiaoDeReferencia? regiao,
  DepositoDaFilaEmMemoria? fila,
  Avisos? avisos,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(regiaoDeReferencia: regiao),
    depositoDaFila: fila,
    avisos: avisos,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
  await tester.pumpAndSettle();
}

Finder get _porta => find.text(MeusPets.rotuloDeMarcarPerdido);

/// Rola ate a opcao e toca nela.
///
/// O `Quando?` fica abaixo da dobra em F3.1: o `ListView` so constroi o que
/// cabe na tela, e um `tap` num widget que ainda nao foi construido reprova
/// por um motivo que nao e o do caso.
Future<void> tocarNaOpcao(WidgetTester tester, String rotulo) async {
  await rolarAte(tester, find.text(rotulo));
  await tocar(tester, find.text(rotulo));
}

void main() {
  // -------------------------------------------------------------------------
  // ISCA 3 — acao com destino
  // -------------------------------------------------------------------------
  group('acao com destino: a barra nao oferece caminho que nao existe', () {
    testWidgets('conta sem pet nenhum nao mostra `Marcar como perdido`',
        (tester) async {
      await abrirOPerfil(tester, rede: servidorCom(<Map<String, dynamic>>[]));

      expect(
        find.text(MeusPets.rotuloDeMarcarPerdido),
        findsNothing,
        reason: 'REPROVA: a acao apareceu numa conta sem pet. Ela abriria '
            'F3.0 com zero opcoes, ou F3.1 sem saber de qual animal fala. E o '
            'mesmo criterio 2 da BICHUS-62 que segurou esta acao ate hoje: '
            'nao se renderiza acao sem destino, nem desabilitada.',
      );
    });

    testWidgets('pet que JA tem caso aberto nao reabre a acao (criterio 13)',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex', status: 'lost'),
        ]),
      );

      expect(
        find.text(MeusPets.rotuloDeMarcarPerdido),
        findsNothing,
        reason: 'REPROVA: o unico pet da conta ja esta sendo procurado, e a '
            'acao apareceu assim mesmo. O teto e de UM caso aberto por pet '
            '(criterio 8), e a tela precisa refletir o teto em vez de deixar '
            'a pessoa bater nele depois de duas telas e um 409.',
      );
    });

    testWidgets('as rotas que a acao empurra estao registradas no roteador',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
        ]),
      );
      final rotas = rotasRegistradasDoApp(tester);

      // Lidas do roteador montado, e nao de uma lista a mao: uma lista a mao
      // continuaria dizendo que a rota existe no dia em que alguem a
      // apagasse, e a barra de acao ficaria empurrando para o vazio.
      for (final rota in <String>[
        Rotas.escolherPetPerdido,
        Rotas.marcarPerdido,
        Rotas.marcarPerdidoAlcance,
        Rotas.casoAberto,
      ]) {
        expect(
          rotas,
          contains(rota),
          reason: 'REPROVA: `$rota` nao esta registrada. A barra de acao '
              'fixa empurra para ela, e um `push` para rota inexistente '
              'deixa a pessoa numa tela de erro do roteador no meio do pior '
              'momento do produto.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 1 — so o pet do chamador
  // -------------------------------------------------------------------------
  group('so o pet do chamador chega a F3.1', () {
    testWidgets('F3.0 oferece exatamente os pets que `GET /pets` devolveu',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      expect(find.text(TelaDeQuemEOCaso.pergunta), findsOneWidget);
      expect(find.text('Rex'), findsOneWidget);
      expect(find.text('Bili'), findsOneWidget);
      expect(
        find.text('Thor'),
        findsNothing,
        reason: 'REPROVA: apareceu na escolha um pet que o servidor nao '
            'devolveu para esta conta. A lista de F3.0 e a resposta de '
            '`listMyPets` da sessao em pe, e nao ha outra porta.',
      );
    });

    testWidgets('a rota de F3.1 recusa um `extra` que nao e o rascunho',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );

      // O id cru de um pet que nao e da pessoa. **Esta e a unica forma de
      // chegar em F3.1 por fora da porta**, e ela precisa dar em nada.
      await irPara(tester, Rotas.marcarPerdido, extra: 'p-de-outra-pessoa');

      expect(
        find.text(TelaOndeEQuando.perguntaDeOnde),
        findsNothing,
        reason: 'REPROVA: F3.1 abriu com um `extra` que nao e um '
            '`RascunhoDoCaso`. O rascunho carrega o objeto `Pet` inteiro, e '
            'esse objeto so existe porque veio de `GET /pets` da sessao em '
            'pe. Aceitar um id solto abriria o formulario para um animal que '
            'o chamador nao possui -- e o 403 do criterio 12 chegaria duas '
            'telas depois, com o alerta ja escrito.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — data no futuro
  // -------------------------------------------------------------------------
  group('data no futuro', () {
    testWidgets('`Continuar` fica desabilitado com o motivo visivel',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
        // Com regiao, o bairro ja vem preenchido e o unico impedimento que
        // sobra e o da data -- que e o que este caso mede.
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );
      await tocar(tester, _porta);

      // Um pet so: F3.0 nao aparece, e a tela e F3.1 direto.
      expect(find.text(TelaOndeEQuando.perguntaDeOnde), findsOneWidget);

      await tocarNaOpcao(tester, 'Outra data');
      // O calendario do M3 abre; o que importa aqui e que ele **nao oferece o
      // futuro**. Fecha sem escolher: o estado legitimo entre tocar e
      // responder.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: `Continuar` ficou habilitado com `Outra data` '
            'escolhida e nenhuma data respondida. O caso seria gravado com '
            'uma data que ninguem escolheu.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Criterio 2 — de onde vem o bairro
  // -------------------------------------------------------------------------
  group('criterio 2: o bairro ja preenchido, e de onde ele vem', () {
    testWidgets('a regiao de referencia do tutor preenche os campos',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );
      await tocar(tester, _porta);

      // **Nao houve geocodificacao** (ADR-0006): o texto saiu de
      // `Me.reference_area`, que o proprio tutor cadastrou. Coordenada nao
      // vira nome de bairro neste produto.
      expect(find.text('Vila Madalena'), findsOneWidget);
      expect(find.text('São Paulo'), findsOneWidget);
    });

    testWidgets('sem regiao cadastrada o campo abre vazio', (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );
      await tocar(tester, _porta);

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      expect(botao.aoTocar, isNull);
      expect(
        find.text('Precisamos do bairro para avisar quem está por perto.'),
        findsOneWidget,
        reason: 'REPROVA: o botao esta desabilitado e o motivo nao esta na '
            'tela. O criterio 5 exige o motivo VISIVEL ao lado do botao: '
            'desabilitar sem dizer por que e desenho preguicoso.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Criterio 6 + ISCA 4 — a fila, e o que a tela diz sobre ela
  // -------------------------------------------------------------------------
  group('na fila nao e aberto', () {
    testWidgets(
        'sem conexao o envio vai para a fila e F3.3 diz que esta na fila',
        (tester) async {
      final fila = DepositoDaFilaEmMemoria();
      final chamadas = <String>[];

      await abrirOPerfil(
        tester,
        fila: fila,
        rede: (req) async {
          chamadas.add('${req.method} ${req.url.path}');
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
            });
          }
          // **Sem sinal daqui para a frente.** `ClientException` e o que o
          // `ApiClient` traduz para `FalhaDeConexao`.
          throw http.ClientException('sem rede');
        },
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );

      // F3.2 com a previa que nao carregou: variante D, e nenhum numero.
      expect(find.text(TelaAlcanceDoAlerta.tituloIndisponivel), findsOneWidget);

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      // ------------------------------------------------------------------
      // A ISCA, nas duas metades que ela precisa ter.
      // ------------------------------------------------------------------
      expect(
        find.text(TelaCasoAberto.tituloNaFila),
        findsOneWidget,
        reason: 'REPROVA: o envio caiu na fila e a tela nao disse isso.',
      );
      expect(
        find.text(TelaCasoAberto.tituloAberto),
        findsNothing,
        reason: 'REPROVA: a tela disse que o caso esta ABERTO e ele nao '
            'esta -- ele esta gravado no aparelho esperando sinal. O '
            'criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao '
            'aconteceu: quem le "o caso esta aberto" para de procurar '
            'caminho, e o alerta ainda nao saiu de dentro do elevador.',
      );

      // E a fila de fato ficou com a acao, com o caminho e o corpo do
      // contrato.
      expect(fila.acoes, hasLength(1));
      final acao = fila.acoes.single;
      expect(acao['caminho'], '/pets/p-1/lost-cases');
      expect(acao['metodo'], 'POST');
      final corpo = Map<String, dynamic>.from(acao['corpo'] as Map);
      expect(corpo['last_seen_at'], isA<String>());
      expect(
        Map<String, dynamic>.from(corpo['last_seen_area'] as Map)['city'],
        'São Paulo',
      );
      expect(
        corpo['share_to_public_list'],
        isTrue,
        reason: 'Criterio 10: o padrao e verdadeiro, e o corpo DECLARA o '
            'campo em vez de depender do default do servidor.',
      );
      expect(
        (acao['idempotency_key'] as String).isNotEmpty,
        isTrue,
        reason: 'REPROVA: a acao foi enfileirada sem `Idempotency-Key`. O '
            'reenvio precisa usar a chave da PRIMEIRA tentativa (criterio 13 '
            'da BICHUS-31): sem ela, cada reenvio e um pedido novo e os '
            'mesmos vizinhos recebem o mesmo alerta varias vezes.',
      );
    });

    testWidgets('o caso que ABRIU diz que abriu', (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
          casoCriado: <String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T12:00:00Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'no_location'},
          },
        ),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      expect(find.text(TelaCasoAberto.tituloAberto), findsOneWidget);
      expect(find.text(TelaCasoAberto.tituloNaFila), findsNothing);
      // Criterio 9: `has_location` falso explica por que nao houve alerta, em
      // vez de deixar a secao vazia.
      expect(find.textContaining('não vai ter alerta'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // O alcance que o servidor nao sabe
  // -------------------------------------------------------------------------
  group('alcance `unavailable`: a tela nao inventa numero', () {
    testWidgets('mostra a variante D e nenhum zero', (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
        ),
        regiao: const RegiaoDeReferencia(cidade: 'São Paulo'),
      );
      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );

      expect(find.text(TelaAlcanceDoAlerta.tituloIndisponivel), findsOneWidget);
      expect(
        find.textContaining('0 tutores'),
        findsNothing,
        reason: 'REPROVA: `unavailable` virou zero na tela. Sao respostas '
            'opostas: com zero contado a pessoa aprende que compartilhar '
            'alcanca mais gente hoje que o alerta; com "nao sei" ela nao '
            'aprende nada e nao desiste do alerta. O alcance dito com '
            'honestidade e a BICHUS-20, e esta tela nao antecipa o numero '
            'dela nem finge te-lo.',
      );
      // O botao continua oferecido: falha de calculo nao e bloqueio.
      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );
      expect(botao.aoTocar, isNotNull);
    });
  });

  // -------------------------------------------------------------------------
  // F3.0 — a escolha com dois ou mais pets
  // -------------------------------------------------------------------------
  group('a escolha com dois ou mais pets', () {
    testWidgets('nasce sem nada marcado, com o motivo do botao desabilitado',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: `Continuar` nasceu habilitado. Com um radio ja '
            'marcado no primeiro da lista, o deslize que o criterio 1 quer '
            'prevenir -- marcar o pet errado quando ha mais de um -- passa a '
            'custar um toque so.',
      );
      expect(find.text(TelaDeQuemEOCaso.semEscolha), findsOneWidget);
    });

    testWidgets('escolher leva F3.1 com o pet escolhido no topo',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);
      await tocar(tester, find.text('Bili'));
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );

      expect(find.text(TelaOndeEQuando.perguntaDeOnde), findsOneWidget);
      expect(
        find.text('Bili'),
        findsOneWidget,
        reason: 'Criterio 1: a foto e o nome do pet no topo, "para prevenir '
            'o deslize de marcar o pet errado quando ha mais de um".',
      );
      expect(find.text('Rex'), findsNothing);
    });

    testWidgets('o pet ja perdido aparece, e fora do grupo de opcoes',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
          pet(id: 'p-3', nome: 'Thor', status: 'lost'),
        ]),
      );
      await tocar(tester, _porta);

      expect(
        find.textContaining('Thor'),
        findsOneWidget,
        reason: 'Criterio 13: a tela reflete o teto de um caso por pet em vez '
            'de deixar a pessoa bater nele.',
      );
      // Ele existe na tela e **nao** e escolhivel: tocar nele nao habilita o
      // botao.
      await tocar(tester, find.textContaining('Thor'));
      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: um pet que ja esta sendo procurado virou opcao. O '
            'caminho termina em 409 depois de duas telas.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Acessibilidade — o defeito `btn=true tap=false`
  // -------------------------------------------------------------------------
  group('acessibilidade: nenhum controle se anuncia sem entregar o toque', () {
    testWidgets('a arvore de semantica do app montado nao tem botao mudo',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      final handle = tester.ensureSemantics();
      try {
        final mudos = <String>[];
        void visitar(SemanticsNode no) {
          final d = no.getSemanticsData();
          final bandeiras = d.flagsCollection;
          final ehBotao =
              bandeiras.isButton || bandeiras.isInMutuallyExclusiveGroup;
          final temToque = d.hasAction(SemanticsAction.tap);
          // Desabilitado **de proposito** nao e defeito: ele se anuncia como
          // controle e diz que nao esta disponivel. O defeito e prometer
          // acao e nao entregar como aciona-la.
          final desabilitado = bandeiras.isEnabled == Tristate.isFalse;
          if (ehBotao && !temToque && !desabilitado) {
            mudos.add('"${d.label}"');
          }
          no.visitChildren((filho) {
            visitar(filho);
            return true;
          });
        }

        visitar(tester.binding.rootElement!.renderObject!.debugSemantics!);
        expect(
          mudos,
          isEmpty,
          reason: 'REPROVA: ${mudos.join(', ')} se anuncia(m) como controle '
              'sem acao de toque (`btn=true tap=false`, WCAG 2.1 SC 4.1.2). '
              'Quem usa VoiceOver ou TalkBack ouve "botao" e nao tem como '
              'aciona-lo. Este defeito ja foi encontrado quatro vezes neste '
              'app, sempre por `excludeSemantics` apagando o `onTap` do '
              'filho: a correcao e REDECLARAR `onTap` no `Semantics` de fora.',
        );
      } finally {
        handle.dispose();
      }
    });
  });

  // -------------------------------------------------------------------------
  // A fila sai com a conta
  // -------------------------------------------------------------------------
  group('a fila offline morre no logout', () {
    testWidgets('o arquivo fica vazio depois de sair da conta', (tester) async {
      final fila = DepositoDaFilaEmMemoria();
      await abrirOPerfil(
        tester,
        fila: fila,
        rede: (req) async {
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
            });
          }
          if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
            return http.Response('', 204);
          }
          throw http.ClientException('sem rede');
        },
        regiao: const RegiaoDeReferencia(cidade: 'São Paulo'),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      // A isca so vale se o cenario de fato encheu a fila.
      expect(
        fila.acoes,
        hasLength(1),
        reason: 'A isca nao entrou no cenario: a fila precisa ter conteudo '
            'ANTES do logout, senao o caso mede um arquivo que ja estava '
            'vazio e fica verde por nada.',
      );

      // Sai pelo CONTROLADOR, e nao pelo botao: os quatro desfechos de
      // `sair()` passam por la, inclusive o refresh recusado, que nao passa
      // por tela nenhuma.
      final escopo = escopoDoApp(tester);
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        fila.acoes,
        isEmpty,
        reason: 'REPROVA: a fila sobreviveu ao logout. O corpo de cada acao '
            'carrega o que a tutora digitou -- nome do pet, endereco de '
            'referencia, telefone de contato -- e isso esta EM DISCO. '
            'Sobrevivendo a saida, esses dados esperam no aparelho a proxima '
            'pessoa que entrar nele, e o aparelho compartilhado e caso real '
            'no publico deste produto. A entrada e `_fila.limpar` na lista '
            '`limpezasAoSair` de `lib/app.dart`.',
      );
      expect(
        jsonDecode(fila.conteudo ?? '[]'),
        isEmpty,
        reason: 'REPROVA: a lista em memoria esvaziou e o ARQUIVO nao. A '
            'leitura seguinte traria tudo de volta, e o logout teria '
            'parecido funcionar.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // F3.3 sem `extra`
  // -------------------------------------------------------------------------
  group('F3.3 nao inventa desfecho', () {
    testWidgets('alcancada sem resultado, ela nao afirma nada', (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );
      await irPara(tester, Rotas.casoAberto);

      expect(
        find.text(TelaCasoAberto.tituloAberto),
        findsNothing,
        reason: 'REPROVA: F3.3 alcancada por link direto, sem resultado '
            'nenhum, afirmou que ha um caso aberto. E a mesma mentira do '
            'criterio 2 da BICHUS-31, por outra porta -- e esta porta e '
            'publica: F5 entrega uma URL com o app fechado.',
      );
      expect(find.text(TelaCasoAberto.tituloNaFila), findsNothing);
    });
  });
  // -------------------------------------------------------------------------
  // COSTURA DA INTEGRACAO DE 22/09 - a segunda oportunidade ganhou chamador
  // -------------------------------------------------------------------------
  group('a segunda oportunidade de aviso tem chamador de PRODUCAO', () {
    // A BICHUS-24 entregou o mecanismo com dois gatilhos, e o segundo
    // (`primeiroCasoDePerdido`) so existia em teste: a unica coisa que
    // chamava `PedidoDeAviso.oferecer` com ele era o proprio caso da 24.
    // A chamada de producao mora em F3.2, e ficou comentada ate a BICHUS-24 e
    // a BICHUS-21 estarem na mesma arvore.
    //
    // Este caso atravessa o fluxo inteiro pela interface -- F3.0, F3.1, F3.2 e
    // o toque em `Avisar` -- e cobra a antessala DEPOIS da abertura. Ele
    // reprova se alguem comentar a chamada de novo, e e por isso que ele
    // dirige a tela em vez de chamar `oferecer` direto.
    testWidgets('abrir o caso em F3.2 oferece a antessala da segunda',
        (tester) async {
      await abrirOPerfil(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
          casoCriado: <String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T12:00:00Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'no_location'},
          },
        ),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      final avisar =
          find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar);
      await tester.ensureVisible(avisar);
      await tester.pumpAndSettle();
      await tester.tap(avisar);

      // `pump` e nao `pumpAndSettle`, e o motivo e o proprio desenho da tela:
      // enquanto a folha esta aberta o envio de F3.2 segue "em curso" e o
      // indicador de progresso continua girando. `pumpAndSettle` esperaria
      // uma animacao que so termina quando a pessoa responde a folha -- que e
      // exatamente o que este caso quer observar antes de responder.
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(
        find.text(TextosDaAntessala.tituloDaSegunda('Rex')),
        findsOneWidget,
        reason: 'REPROVA: o caso abriu e a segunda antessala nao apareceu. '
            'A UX 10.4 da BICHUS-24 diz que a segunda das DUAS chances e '
            'oferecida no primeiro caso de perdido; se ela so aparece quando '
            'um teste chama `PedidoDeAviso.oferecer` na mao, o gatilho nao '
            'existe para quem usa o app.',
      );
    });
  });
}
