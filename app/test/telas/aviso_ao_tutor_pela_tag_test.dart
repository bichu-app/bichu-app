// LIGACAO 1 — o achador tem como avisar o tutor. As ISCAS.
//
// O laco que o Bichu existe para fechar tem tres etapas: alguem acha o pet,
// escaneia a plaquinha, **avisa o tutor**. As duas primeiras funcionavam. A
// terceira nao existia no app: `TagsApi` tinha um metodo so, `resolver`, e
// `POST /v1/tags/{code}/found-reports` -- pronto e provado no servidor -- nao
// tinha cliente nenhum. O proprio comentario da tela admitia a lacuna.
//
// O QUE CADA GRUPO PRECISA REPROVAR, e o mecanismo que o produz:
//
//  1. `o achador nao tem como avisar o tutor` — apague
//     `TagsApi.avisarOTutor` (ou o `_avisar` do botao) e o caso reprova: nenhum
//     `POST` sai, e a tela nunca confirma.
//  2. `a mesma chave no reenvio` — troque a chave de `initState` para o
//     `onPressed`, ou gere uma nova no `enfileirar`, e o caso reprova: o tutor
//     receberia o mesmo aviso duas vezes.
//  3. `sem sinal o aviso nao mente` — apague o `on FalhaDeConexao` do botao e o
//     caso reprova: ou a tela afirma que o tutor foi avisado sem nada ter
//     saido, ou o aviso evapora sem ir para a fila.
//
// **NAO basta verificar que o metodo existe.** Ele existir e nao ser chamado e
// exatamente o defeito de hoje em outro lugar deste app (`reenviarTudo`). Todos
// os casos aqui passam pelo app montado, tocam no botao de verdade e conferem a
// REQUISICAO que saiu -- caminho, cabecalho e corpo.
//
// **O esperado esta escrito por extenso aqui dentro**, e nao lido da classe que
// o produz: tres testes deste projeto ja compararam o texto renderizado com a
// mesma constante que o desenha, e ficavam verdes com a frase errada.

import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:bichu/telas/escanear/tela_do_pet_da_tag.dart';

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

void main() {
  const String codigo = '7K2MQ1D4B8NV3XZ0';
  const String qrDaPlaquinha = 'https://bichu.app/t/$codigo';

  /// O caminho que o contrato declara, escrito a mao aqui de proposito.
  ///
  /// Lido de `TagsApi.caminhoDoAviso` ele ficaria verde com o caminho errado,
  /// que e o modo de falha que o cabecalho deste arquivo descreve.
  const String caminhoDoAviso = '/v1/tags/$codigo/found-reports';

  /// Uma requisicao que o app mandou, com o que importa conferir.
  ///
  /// Guarda o cabecalho de idempotencia e o corpo porque as duas garantias
  /// desta ligacao vivem neles: a chave e o que impede o aviso duplicado, e o
  /// corpo vazio e o caminho principal da operacao.
  final saiu = <({String metodo, String caminho, String? chave, String corpo})>[];

  /// A rede: resolve a tag e aceita o aviso.
  ///
  /// [avisoResponde] deixa cada caso escolher o desfecho do `POST` sem montar
  /// outra rede: 201 no caminho bom, e uma excecao de socket no caminho sem
  /// sinal.
  /// [perdido] e FALSO por padrao desde 18/10/2026, e a troca tem motivo.
  ///
  /// Era `true`, e com a dinamica do escanear que o cliente definiu -- *"se o
  /// tutor marcou como perdido, abre a pagina para o usuario enviar mensagem
  /// ao tutor"* -- `is_lost: true` passou a abrir OUTRA forma da tela, com
  /// campo de recado e o rotulo `Enviar mensagem ao tutor`. Os casos deste
  /// grupo medem o aviso de um toque e zero campos, que e a forma SEM caso
  /// aberto; a forma de pet perdido tem grupo proprio no fim do arquivo.
  Future<http.Response> Function(http.Request) rede({
    bool perdido = false,
    bool jaAvisou = false,
    bool entregaSaiu = true,
    Future<http.Response> Function(http.Request)? avisoResponde,
  }) {
    return (http.Request req) async {
      if (req.url.path == '/v1/tags/$codigo' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'viewer': 'anonymous',
          'pet': <String, dynamic>{
            'display_name': 'Thor',
            'species': 'dog',
            'size': 'M',
            'breed_label': 'Vira-lata (SRD)',
            'primary_color': 'preto e branco',
            'distinctive_marks': 'Coleira vermelha.',
            'care_notes': null,
            'photo_url': null,
          },
          'lost': <String, dynamic>{'is_lost': perdido, 'since': null},
          'already_notified': jaAvisou,
        });
      }
      if (req.url.path == caminhoDoAviso && req.method == 'POST') {
        saiu.add((
          metodo: req.method,
          caminho: req.url.path,
          chave: req.headers['Idempotency-Key'] ??
              req.headers['idempotency-key'],
          corpo: req.body,
        ));
        if (avisoResponde != null) return avisoResponde(req);
        // `FoundReportCreated` como o contrato o declara. **Sem identificador
        // interno**: SEC-001 proibe devolver UUIDv7 a quem nao tem conta.
        return json200(<String, dynamic>{
          'finder_token': 'ft_abc123',
          'conversation_url': 'https://bichu.app/c/ft_abc123',
          'owner_notified': entregaSaiu,
          'pet_display_name': 'Thor',
        }, status: 201);
      }
      if (req.url.path == '/v1/pets' && req.method == 'GET') {
        return json200(<String, dynamic>{'items': <dynamic>[]});
      }
      if (req.url.path.endsWith('/reference-data')) {
        return json200(referenciaDeTeste());
      }
      return http.Response('', 404);
    };
  }

  /// Escaneia a plaquinha pelo caminho de verdade: app montado, porta de
  /// `Pets`, leitor, simbolo entregue pela camera.
  ///
  /// **Nao monta `TelaDoPetDaTag` solta**, e a razao e a mesma do arquivo
  /// vizinho: a tela solta nao recebe `codigo` pela rota, e um caso montado
  /// assim continuaria verde no dia em que o roteador parasse de passar o
  /// codigo -- que e metade desta ligacao.
  Future<void> escanear(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) comRede,
    DepositoDaFilaEmMemoria? fila,
  }) async {
    final leitor = LeitorDeQrDeTeste();
    await abrirOApp(
      tester,
      rede: comRede,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: leitor,
      depositoDaFila: fila,
    );
    // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026 (pedido do cliente). A
    // porta primaria do leitor mora em `Pets` (UX 27.5.6), e o caso diz em
    // voz alta que vai ate ela em vez de herdar a aterrissagem.
    await abrirAAba(tester, 'Pets');
    await tester.tap(find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(Icons.qr_code_2),
      ));
    await tester.pumpAndSettle();
    leitor.ler(qrDaPlaquinha);
    await tester.pumpAndSettle();
  }

  setUp(saiu.clear);

  // -----------------------------------------------------------------------
  // ISCA 1 — o achador nao tem como avisar o tutor
  // -----------------------------------------------------------------------
  group('ISCA — o achador nao tem como avisar o tutor', () {
    testWidgets('o botao existe, e tocar nele faz o POST do contrato sair', (
      tester,
    ) async {
      await escanear(tester, comRede: rede());

      final botao = find.widgetWithText(FilledButton, 'Avisar o tutor');
      expect(
        botao,
        findsOneWidget,
        reason:
            'REPROVA: nao ha botao `Avisar o tutor` na tela do achador. Esta '
            'e a terceira etapa do laco do produto -- achar, escanear, '
            'AVISAR -- e sem ela quem esta com o animal no colo vai embora '
            'sem caminho. A rota existe e funciona no servidor.',
      );

      await tester.tap(botao);
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        1,
        reason:
            'REPROVA: o botao esta na tela e NENHUM `POST '
            '$caminhoDoAviso` saiu (sairam ${saiu.length}). Botao que nao '
            'avisa ninguem e pior que nenhum botao: o achador vai embora '
            'ACREDITANDO que avisou. E o defeito que o metodo existir sem '
            'chamador produz, e ele nao se pega verificando que o metodo '
            'existe.',
      );
      expect(
        saiu.single.chave,
        isNotNull,
        reason:
            'REPROVA: o `POST` saiu SEM `Idempotency-Key`. O contrato a '
            'declara obrigatoria nesta operacao, e o servidor derruba a '
            'aplicacao se a rota registrada divergir: sem ela a requisicao e '
            'recusada e o aviso nunca chega.',
      );
      expect(
        jsonDecode(saiu.single.corpo.isEmpty ? '{}' : saiu.single.corpo),
        isEmpty,
        reason:
            'REPROVA: o corpo do aviso levou campo. O caminho principal '
            'desta operacao e CORPO VAZIO -- um toque, zero campos --, data e '
            'hora sao do servidor e o codigo ja veio no caminho. Campo '
            'inventado aqui e campo que o contrato nao valida.',
      );
    });

    testWidgets('a tela confirma no passado, e o botao sai do caminho', (
      tester,
    ) async {
      await escanear(tester, comRede: rede());
      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('O tutor foi avisado'),
        findsOneWidget,
        reason:
            'REPROVA: o aviso saiu (201) e a tela nao disse a quem esta com o '
            'animal que o tutor foi avisado. Quem nao recebe confirmacao toca '
            'de novo, ou desiste.',
      );
      expect(
        find.widgetWithText(FilledButton, 'Avisar o tutor'),
        findsNothing,
        reason:
            'REPROVA: o botao continua em pe depois de o aviso sair. O '
            'segundo toque com a mesma chave devolve a resposta original, '
            'entao a pessoa tocaria e NADA mudaria na tela -- que e o formato '
            'mais curto de fazer alguem achar que o app travou.',
      );
    });

    testWidgets('no modo dono o botao nao existe', (tester) async {
      // O dono avisando a si mesmo geraria um aviso real, gastaria o teto de 1
      // por `code`+`finder_identity` em 6 h e mandaria ao tutor um push de que
      // alguem esta com o proprio pet dele.
      Future<http.Response> redeDeDono(http.Request req) async {
        if (req.url.path == '/v1/tags/$codigo' && req.method == 'GET') {
          return json200(<String, dynamic>{
            'viewer': 'owner',
            'pet': <String, dynamic>{
              'display_name': 'Thor',
              'species': 'dog',
              'size': 'M',
              'photo_url': null,
            },
            'lost': <String, dynamic>{'is_lost': false, 'since': null},
            'already_notified': false,
          });
        }
        return rede()(req);
      }

      await escanear(tester, comRede: redeDeDono);

      expect(
        find.textContaining('Avisar'),
        findsNothing,
        reason:
            'REPROVA: o modo dono mostra `Avisar o tutor`. O tutor tocaria '
            'nele e receberia no proprio celular um push dizendo que alguem '
            'esta com o pet dele, gastando o teto de 6 h que o achador de '
            'verdade vai precisar.',
      );
    });

    testWidgets('quem ja avisou deste aparelho ve o rotulo de novo, e o botao '
        'continua tocavel', (tester) async {
      await escanear(tester, comRede: rede(jaAvisou: true));

      final botao = find.widgetWithText(
        FilledButton,
        'Avisar o tutor de novo',
      );
      expect(
        botao,
        findsOneWidget,
        reason:
            'REPROVA: `already_notified: true` nao mudou o rotulo. O campo '
            'chega no contrato justamente para isso, e ele ja era lido pelo '
            'desserializador sem ter onde aparecer.',
      );
      await tester.tap(botao);
      await tester.pumpAndSettle();
      expect(
        saiu.length,
        1,
        reason:
            'REPROVA: `already_notified: true` DESABILITOU o aviso. O teto do '
            'contrato para `code`+`finder_identity` e `group_notification`: o '
            'segundo aviso e anexado a conversa e nunca descartado. Quem '
            'achou o animal de novo precisa poder falar.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 2 — a mesma chave no reenvio
  // -----------------------------------------------------------------------
  group('ISCA — a mesma chave no reenvio', () {
    testWidgets('duas tentativas do mesmo achador levam a MESMA chave', (
      tester,
    ) async {
      var vez = 0;
      await escanear(
        tester,
        comRede: rede(
          avisoResponde: (req) async {
            vez += 1;
            // A primeira volta 503 para a tela oferecer o toque de novo; a
            // segunda aceita. As duas tem de carregar a mesma chave.
            if (vez == 1) return http.Response('', 503);
            return json200(<String, dynamic>{
              'finder_token': 'ft_abc123',
              'conversation_url': 'https://bichu.app/c/ft_abc123',
              'owner_notified': true,
            }, status: 201);
          },
        ),
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        2,
        reason: 'REPROVA: as duas tentativas nao sairam (sairam '
            '${saiu.length}). O caso mede a chave das duas.',
      );
      expect(
        saiu[1].chave,
        saiu[0].chave,
        reason:
            'REPROVA: a segunda tentativa levou chave DIFERENTE da primeira '
            '(${saiu[0].chave} e ${saiu[1].chave}). O servidor trataria os '
            'dois pedidos como avisos distintos e o tutor receberia DOIS '
            'pushes do mesmo achador. A chave e da ACAO, nasce uma vez, e nao '
            'da tentativa: gerar no `onPressed` produz exatamente este '
            'defeito, e ele e invisivel num teste de uma tentativa so.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 3 — sem sinal o aviso nao mente
  // -----------------------------------------------------------------------
  group('ISCA — sem sinal o aviso nao mente', () {
    testWidgets('sem conexao o aviso vai para a fila, com a mesma chave, e a '
        'tela NAO diz que o tutor foi avisado', (tester) async {
      final fila = DepositoDaFilaEmMemoria();
      await escanear(
        tester,
        fila: fila,
        comRede: rede(
          avisoResponde: (req) async {
            // O que o aparelho sem sinal produz. `MockClient` traduz
            // `ClientException` em `FalhaDeConexao` na camada de API.
            throw http.ClientException('sem sinal', req.url);
          },
        ),
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('O tutor foi avisado'),
        findsNothing,
        reason:
            'REPROVA: NADA saiu do aparelho e a tela afirmou que o tutor foi '
            'avisado. E a mentira mais cara do produto: quem acredita que '
            'avisou solta o animal e vai embora. Criterio 2 da BICHUS-31.',
      );
      expect(
        find.textContaining('sem sinal'),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao disse que o aviso ficou guardado. Sem esse '
            'texto o achador nao sabe se tocou, se falhou, ou se precisa '
            'tentar outra coisa.',
      );

      final acoes = fila.acoes;
      expect(
        acoes.length,
        1,
        reason:
            'REPROVA: o aviso NAO foi para a fila (ha ${acoes.length} acoes '
            'gravadas). Sem fila ele evapora, e o pet que estava no colo de '
            'alguem fica sem ninguem avisado.',
      );
      expect(
        acoes.single['caminho'],
        '/tags/$codigo/found-reports',
        reason:
            'REPROVA: a fila gravou o caminho errado -- '
            '`${acoes.single['caminho']}`. A fila guarda o caminho relativo a '
            '`/v1`, e nao a URL inteira: URL gravada carregaria o ambiente do '
            'dia em que a acao foi enfileirada.',
      );
      expect(
        acoes.single['metodo'],
        'POST',
        reason: 'REPROVA: a fila gravou o metodo '
            '`${acoes.single['metodo']}`, e a operacao e `POST`.',
      );
      expect(
        acoes.single['idempotency_key'],
        isNotNull,
        reason:
            'REPROVA: a acao foi para a fila SEM chave de idempotencia. O '
            'reenvio nasceria sem ela, o contrato a exige, e o pedido seria '
            'recusado quando o sinal voltasse -- a fila teria guardado algo '
            'que nunca sai.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 4 — A DINAMICA DO ESCANEAR, E OS TRES CAMINHOS DELA
  // -----------------------------------------------------------------------
  //
  // O cliente definiu a dinamica com estas palavras: *"carrega a pagina do
  // proprio pet. a dinamica e se eu escanear o qr-code abre a pagina do pet.
  // se o tutor marcou como perdido, abre a pagina para o usuario enviar
  // mensagem ao tutor."*
  //
  // Sao tres caminhos, e cada um tem um caso aqui:
  //
  //  1. DONO escaneando o proprio pet -> carrega a pagina do pet (`T.1`), pelo
  //     `pet_id` de `GET /tags/{code}/owner-context`. Desligue
  //     `TagsApi.contextoDoDono` ou o `pushReplacement` e o caso reprova: o
  //     dono volta a ficar numa tela de leitura sem acao nenhuma, que e o que
  //     o cliente viu.
  //  2. ESTRANHO, pet NAO perdido -> a ficha do pet com `Avisar o tutor`, e
  //     SEM campo de mensagem. Medido nos grupos acima e no contrapeso aqui.
  //  3. ESTRANHO, pet PERDIDO -> a pagina de falar com o tutor: campo de
  //     recado que vira `client_note`. Apague o campo e o caso reprova.
  //
  // O CONTRAPESO de cada um e o caminho vizinho: o campo de mensagem nao pode
  // aparecer sem caso aberto, e a pagina do pet nao pode ser carregada para
  // quem nao e o dono.
  group('ISCA — a dinamica do escanear tem tres caminhos', () {
    testWidgets('DONO escaneando o proprio pet: carrega a PAGINA DO PET', (
      tester,
    ) async {
      const String petId = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
      final pedidos = <String>[];

      Future<http.Response> redeDeDono(http.Request req) async {
        pedidos.add('${req.method} ${req.url.path}');
        if (req.url.path == '/v1/tags/$codigo' && req.method == 'GET') {
          return json200(<String, dynamic>{
            'viewer': 'owner',
            'pet': <String, dynamic>{
              'display_name': 'Thor',
              'species': 'dog',
              'size': 'M',
              'photo_url': null,
            },
            'lost': <String, dynamic>{'is_lost': false, 'since': null},
            'already_notified': false,
          });
        }
        if (req.url.path == '/v1/tags/$codigo/owner-context' &&
            req.method == 'GET') {
          return json200(<String, dynamic>{
            'pet_id': petId,
            'tag_id': '018f7c1e-8b3c-7d4e-af50-3c2b1d0e9f80',
          });
        }
        if (req.url.path == '/v1/pets/$petId' && req.method == 'GET') {
          return json200(petDoContrato(id: petId, nome: 'Thor'));
        }
        return rede()(req);
      }

      await escanear(tester, comRede: redeDeDono);

      expect(
        pedidos,
        contains('GET /v1/tags/$codigo/owner-context'),
        reason:
            'REPROVA: o modo dono nao chamou `GET /tags/{code}/owner-context`. '
            'A pagina do pet e enderecada por `pet_id`, e o corpo publico da '
            'resolucao nao o traz (SEC-001): sem esta chamada nao ha como '
            'carregar a pagina do pet, que e a dinamica que o cliente pediu. '
            'Pedidos: $pedidos',
      );
      expect(
        find.byType(TelaDoPetDaTag),
        findsNothing,
        reason:
            'REPROVA: o dono escaneou a propria plaquinha e FICOU na tela da '
            'tag. O cliente pediu "carrega a pagina do proprio pet", e o que '
            'ele viu foi uma tela de leitura sem acao nenhuma. Pedidos: '
            '$pedidos',
      );
      expect(
        pedidos,
        contains('GET /v1/pets/$petId'),
        reason:
            'REPROVA: a tela da tag saiu de cena e a pagina do pet nao '
            'carregou. Substituir uma tela por nada e pior que ficar na '
            'primeira. Pedidos: $pedidos',
      );
    });

    testWidgets('ESTRANHO com pet PERDIDO: a mensagem vira `client_note`', (
      tester,
    ) async {
      await escanear(tester, comRede: rede(perdido: true));

      final campo = find.byType(TextField);
      expect(
        campo,
        findsOneWidget,
        reason:
            'REPROVA: com caso aberto nao ha campo de mensagem. O cliente '
            'pediu que escanear um pet perdido abrisse "a pagina para o '
            'usuario enviar mensagem ao tutor", e `client_note` ja esta no '
            'contrato (`FoundReportFromTagInput`, maxLength 500) sem nenhum '
            'caminho do app a mandar.',
      );

      await tester.enterText(campo, 'Esta na praca da Matriz, comigo.');
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Enviar mensagem ao tutor'),
      );
      await tester.pumpAndSettle();

      expect(saiu.length, 1, reason: 'REPROVA: nenhum `POST` saiu.');
      expect(
        jsonDecode(saiu.single.corpo) as Map<String, dynamic>,
        containsPair('client_note', 'Esta na praca da Matriz, comigo.'),
        reason:
            'REPROVA: a pessoa digitou a mensagem e o corpo saiu sem '
            '`client_note` (`${saiu.single.corpo}`). Ela escreveu para o '
            'vazio, e e pior que nao ter campo: a tela confirma o envio de '
            'uma mensagem que nao foi.',
      );
    });

    testWidgets('CONTRAPESO: sem caso aberto nao ha campo de mensagem', (
      tester,
    ) async {
      await escanear(tester, comRede: rede());
      expect(
        find.byType(TextField),
        findsNothing,
        reason:
            'REPROVA: a tela do achador pede texto para um pet que ninguem '
            'esta procurando. O caminho principal desta operacao e um toque e '
            'zero campos, e um campo aqui transforma o aviso mais urgente do '
            'produto em formulario.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 5 — a tela nao promete entrega que o servidor nao prometeu
  // -----------------------------------------------------------------------
  //
  // A metade de TELA do defeito de `owner_notified`. O servidor devolvia
  // `true` sem nenhuma entrega enfileirada, e esta tela mostrava a mesma
  // frase -- "O tutor foi avisado. Ele recebeu o aviso no celular agora." --
  // para os dois valores do campo, com o comentario dizendo que o campo "nao
  // muda este texto".
  //
  // Os dois casos sao um por DESLIGAMENTO: a mesma tela, o mesmo toque, e o
  // campo da resposta trocado.
  group('ISCA — a tela nao promete entrega que o servidor nao prometeu', () {
    testWidgets('`owner_notified: false`: a tela NAO diz que o tutor foi '
        'avisado', (tester) async {
      await escanear(tester, comRede: rede(entregaSaiu: false));
      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('O tutor foi avisado'),
        findsNothing,
        reason:
            'REPROVA: o servidor respondeu `owner_notified: false` e a tela '
            'afirmou que o tutor foi avisado. E a mentira mais caro do '
            'produto: quem acredita que avisou solta o animal e vai embora.',
      );
      // E ela tambem nao diz que falhou: o recado esta registrado, e dizer
      // "nao foi" faria a pessoa ir embora do mesmo jeito.
      expect(
        find.textContaining('Seu recado esta registrado'),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao disse o que aconteceu. Entre prometer o push '
            'e dizer que falhou ha a verdade -- o aviso esta no caso do '
            'animal --, e e ela que mantem a pessoa por perto.',
      );
    });

    testWidgets('`owner_notified: true`: a tela afirma no passado', (
      tester,
    ) async {
      await escanear(tester, comRede: rede(entregaSaiu: true));
      await tester.tap(find.widgetWithText(FilledButton, 'Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('O tutor foi avisado'),
        findsOneWidget,
        reason:
            'REPROVA: a entrega saiu e a tela nao confirmou. O contrapeso '
            'existe para o conserto nao virar "nunca prometa": isso pararia '
            'de mentir e passaria a esconder, e quem avisou de verdade '
            'merece saber.',
      );
    });
  });
}
