// O QR na PAGINA DO PET (cliente, 18/10): "dentro do perfil do pet, traga
// tambem o qr-code para o usuario conseguir escanear".
//
// ESTAS ISCAS SAO PROVA POR DESLIGAMENTO, e cada grupo abaixo diz qual
// mecanismo desligar para ve-la vermelha. **ELAS NAO FORAM EXECUTADAS**: o
// cliente proibiu rodar suite nesta entrega, e dizer "passa" sobre o que nao
// rodou seria exatamente o defeito que o criterio 2 da BICHUS-31 proibe no
// produto. Elas estao escritas, versionadas e nomeadas; quem rodar a suite
// pela primeira vez e quem vai saber.
//
// ---------------------------------------------------------------------------
// AS DUAS CLASSES DE DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR
// ---------------------------------------------------------------------------
//
// 1. **O QR passar a carregar identificador interno** (ADR-0010, item 6).
//
//    O QR correto carrega `{base}/t/{codigo}` e nada mais, e quem o desenha e
//    o servidor (`src/modules/tags/domain/qr-da-tag.ts`, que ja tem isca
//    propria decodificando o PNG e reprovando se algum UUID aparecer).
//
//    Do lado do app a regressao tem UMA forma conhecida: alguem "simplifica" a
//    tela trocando a busca autenticada de `qr.png` por um gerador de QR local
//    -- e a unica coisa que esta tela tem em maos para codificar e `pet.id`,
//    que e UUID, porque **o codigo da tag nao esta no aparelho** (`GET
//    /pets/{petId}/tags` devolve so `code_suffix`). Entao a isca nao procura
//    UUID dentro de pixels: ela DESLIGA o servidor e cobra que o QR
//    desapareca. Um QR que continua na tela com a rota de imagem recusando e,
//    por construcao, um QR desenhado aqui -- com o que ha aqui.
//
//    Tem uma segunda metade, do lado do rotulo acessivel: ele nao pode conter o
//    `petId`. Um rotulo de leitor de tela que recite o UUID do pet e saida
//    publica de identificador interno tanto quanto um QR.
//
// 2. **Pet sem plaquinha mostrar QR vazio ou invalido.**
//
//    Sem codigo nao existe QR. O caminho errado e o que a F1.6 teve ate a
//    BICHUS-235: a moldura ficava no lugar, vazia, e a tela nao dizia nada --
//    quem olhava nao sabia se a plaquinha nao existe ou se a imagem nao veio.
//    Aqui a cobranca e nos dois sentidos: nenhuma `Image` e nenhuma caixa de
//    `QrDaPlaquinha.lado` na arvore, E o texto que explica no lugar.
//
// **A fonte e sempre a arvore montada, e nunca o texto do codigo.** Uma
// varredura de fonte casaria com a mencao ao proprio mecanismo dentro de um
// comentario -- ja aconteceu neste repositorio --, e apagar o codigo de verdade
// deixava a isca verde. A unica excecao e o grupo do `pubspec.yaml`, que mede
// uma declaracao e nao um comportamento, e esta dito la por que.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/widgets/qr_da_plaquinha.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

const String _petId = '3f1d7a9e-0000-7000-8000-000000000001';
const String _tagId = '11111111-2222-3333-4444-555555555555';
const String _sufixo = '91QD';

/// Um PNG 1x1 valido. O QR de verdade e assunto do servidor; o que esta sob
/// teste aqui e o CAMINHO dos bytes -- quem os pediu, e o que a tela faz
/// quando eles nao vem.
final Uint8List _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAE'
  'hQGAhKmMIQAAAABJRU5ErkJggg==',
);

bool _ehImagemDoQr(http.Request r) => r.url.path.endsWith('qr.png');
bool _ehListaDeTags(http.Request r) =>
    r.method == 'GET' && r.url.path.endsWith('/tags');

/// `PetTag` como o contrato o declara: **sem `code`**, so os quatro ultimos.
Map<String, dynamic> _tagDoContrato({String status = 'active'}) {
  return <String, dynamic>{
    'id': _tagId,
    'status': status,
    'code_suffix': _sufixo,
    'label': null,
    'scan_count': 0,
    'created_at': '2026-09-20T12:00:00Z',
  };
}

/// A rede da pagina do pet. [imagem] decide o desfecho de `qr.png`.
Future<http.Response> Function(http.Request) _rede({
  required List<http.Request> vistas,
  Map<String, dynamic>? pet,
  List<Map<String, dynamic>>? tags,
  http.Response Function()? imagem,
}) {
  final corpo = pet ?? petDoContrato();
  return (req) async {
    vistas.add(req);
    final caminho = req.url.path;

    if (_ehImagemDoQr(req)) {
      final resposta = imagem ??
          () => http.Response.bytes(
                _png,
                200,
                headers: <String, String>{'content-type': 'image/png'},
              );
      return resposta();
    }
    if (_ehListaDeTags(req)) {
      return json200(<String, dynamic>{
        'items': tags ?? <Map<String, dynamic>>[_tagDoContrato()],
      });
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[corpo],
      });
    }
    if (caminho.endsWith('/reference-data')) return json200(referenciaDeTeste());
    if (caminho == '/v1/pets/$_petId' && req.method == 'GET') {
      return json200(corpo);
    }
    return http.Response('', 404);
  };
}

/// Abre T.1 **direto pela rota**, e nao passando pelo Perfil.
///
/// De proposito: a tela inicial do Perfil esta sendo reescrita para virar so
/// menus, e uma isca que entre por ela passa a reprovar por causa da reescrita
/// da outra tela, que nao e o que ela mede. A rota do detalhe nao esta saindo
/// de lugar nenhum.
Future<List<http.Request>> _abrirAPaginaDoPet(
  WidgetTester tester, {
  Map<String, dynamic>? pet,
  List<Map<String, dynamic>>? tags,
  http.Response Function()? imagem,
}) async {
  final vistas = <http.Request>[];
  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    rede: _rede(vistas: vistas, pet: pet, tags: tags, imagem: imagem),
  );
  await irPara(tester, Rotas.detalheDoPetDe(_petId));
  return vistas;
}

/// A imagem do QR, e nao "a primeira imagem da tela": a foto do pet tambem e
/// uma imagem, e um dia outra pode entrar.
Finder _oQr() => find.descendant(
      of: find.byType(QrDaPlaquinha),
      matching: find.byType(Image),
    );

/// Qualquer caixa do tamanho do QR. E o que pega a moldura vazia: um
/// `SizedBox` de 200 x 200 sem nada dentro e exatamente o defeito que a F1.6
/// teve, e ele nao aparece numa busca por `Image`.
Finder _caixaDoTamanhoDoQr() => find.byWidgetPredicate(
      (w) =>
          w is SizedBox &&
          w.width == QrDaPlaquinha.lado &&
          w.height == QrDaPlaquinha.lado,
    );

void main() {
  // -------------------------------------------------------------------------
  // CLASSE 1 — o QR nao carrega identificador interno
  //
  // PARA VER REPROVANDO: troque a busca de `_carregarOQr` por um gerador de QR
  // local sobre `pet.id` (ou sobre qualquer coisa que a tela tenha em maos). Os
  // tres casos abaixo ficam vermelhos, e o primeiro e o que decide.
  // -------------------------------------------------------------------------
  group('o conteudo do QR e do servidor, nunca do aparelho', () {
    testWidgets(
      'com a rota da imagem recusando, NAO sobra QR na tela',
      (tester) async {
        await _abrirAPaginaDoPet(
          tester,
          imagem: () => http.Response('', 500),
        );
        await rolarAte(tester, find.byType(QrDaPlaquinha));

        expect(
          _oQr(),
          findsNothing,
          reason: 'REPROVA: a rota da imagem recusou e a tela desenhou um QR '
              'de todo jeito. O unico jeito de isso acontecer e a tela estar '
              'codificando o que ela tem em maos -- e o que ela tem em maos e '
              '`pet.id`, que e UUID. O codigo da tag NAO esta no aparelho: '
              '`GET /pets/{petId}/tags` devolve so `code_suffix`. ADR-0010, '
              'item 6.',
        );
      },
    );

    testWidgets(
      'o endereco pedido e a rota da imagem da tag em vigor',
      (tester) async {
        final vistas = await _abrirAPaginaDoPet(tester);
        await rolarAte(tester, find.byType(QrDaPlaquinha));

        final imagens = vistas.where(_ehImagemDoQr).toList();
        expect(
          imagens.map((r) => r.url.path).toList(),
          <String>['/v1/pets/$_petId/tags/$_tagId/qr.png'],
          reason: 'REPROVA: a tela deixou de pedir a imagem que o SERVIDOR '
              'desenha. E essa rota que garante o conteudo `{base}/t/{codigo}` '
              '-- a mesma funcao que imprime a linha legivel da plaquinha.',
        );

        // A segunda metade: a tela nao pode ir buscar o codigo em claro para
        // codificar por conta propria. `issuePetTag` e a UNICA resposta do
        // contrato que o traz, e emitir e irreversivel (ADR-0004).
        expect(
          vistas
              .where((r) => r.method == 'POST' && r.url.path.endsWith('/tags'))
              .isEmpty,
          isTrue,
          reason: 'REPROVA: a pagina do pet emitiu tag. Emitir e irreversivel, '
              'revela o codigo em claro, e nao e o que o cliente pediu nesta '
              'tela -- ele pediu para MOSTRAR o QR.',
        );
      },
    );

    testWidgets(
      'o rotulo acessivel do QR nao recita o id interno',
      (tester) async {
        await _abrirAPaginaDoPet(tester);
        await rolarAte(tester, find.byType(QrDaPlaquinha));

        // **O `Semantics` DECLARADO em volta da imagem**, e nao
        // `getSemantics(...)` sobre ela.
        //
        // `tester.getSemantics(_oQr())` devolvia um no de `label` VAZIO, e o
        // vazio fazia este caso mentir nos dois sentidos: a primeira assercao
        // passava por vacuidade (`isNot(contains(id))` e sempre verdade sobre
        // `''`) e a segunda reprovava sobre uma tela correta. Liguei a arvore
        // de semantica com `ensureSemantics` e o `label` continuou vazio, ou
        // seja: nao era a arvore desligada, e o no que `getSemantics` alcanca a
        // partir da `Image` nao e o que carrega o rotulo.
        //
        // O que o app PUBLICA e a propriedade do `Semantics` que embrulha a
        // imagem (`qr_da_plaquinha.dart`, linhas 146-148), e e ela que esta
        // medida aqui -- a mesma escolha que `loja_detalhe_do_produto_test.dart`
        // faz para o nome acessivel do quadro grande, e pelo mesmo motivo.
        final rotuloDoQr = tester
                .widget<Semantics>(
                  find.ancestor(of: _oQr(), matching: find.byType(Semantics)).first,
                )
                .properties
                .label ??
            '';
        expect(
          rotuloDoQr,
          isNot(contains(_petId)),
          reason: 'REPROVA: o rotulo do leitor de tela entrega o UUID do pet. '
              'Rotulo acessivel e saida publica tanto quanto pixel: quem usa '
              'leitor de tela ouviria o identificador interno. ADR-0010, '
              'item 6.',
        );
        expect(
          rotuloDoQr,
          contains(_sufixo),
          reason: 'REPROVA: o QR ficou um quadrado sem descricao util. Ele nao '
              'pode anunciar o codigo inteiro -- o app nao o tem --, mas tem de '
              'dizer DE QUAL plaquinha e, e os quatro ultimos sao exatamente o '
              'que o contrato entrega para isso.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // CLASSE 2 — pet sem plaquinha nao mostra QR vazio nem invalido
  //
  // PARA VER REPROVANDO: faca `QrDaPlaquinha` desenhar a moldura (ou um
  // `Image` sobre bytes vazios) no estado `semTag`, como a F1.6 fazia antes da
  // BICHUS-235. Os dois casos abaixo ficam vermelhos.
  // -------------------------------------------------------------------------
  group('pet sem plaquinha', () {
    testWidgets(
      'sem tag ativa, nenhum quadrado -- nem imagem, nem moldura vazia',
      (tester) async {
        await _abrirAPaginaDoPet(
          tester,
          pet: petDoContrato(tagsAtivas: 0),
        );
        await rolarAte(tester, find.byType(QrDaPlaquinha));

        expect(
          _oQr(),
          findsNothing,
          reason: 'REPROVA: pet sem plaquinha e um QR na tela. Sem codigo nao '
              'existe QR, e um quadrado que nao resolve para nada e pior que '
              'nenhum quadrado: alguem vai aponta-lo para a camera.',
        );
        expect(
          find.descendant(
            of: find.byType(QrDaPlaquinha),
            matching: _caixaDoTamanhoDoQr(),
          ),
          findsNothing,
          reason: 'REPROVA: a moldura do QR ficou no lugar, vazia. E o defeito '
              'que a F1.6 teve: a tela fica identica a tela que nao conseguiu '
              'buscar a imagem, e quem olha nao sabe qual dos dois e.',
        );
        expect(
          find.text(QrDaPlaquinha.semTag('Nina')),
          findsOneWidget,
          reason: 'REPROVA: a area do QR ficou calada. O estado existe, e a '
              'tela precisa dizer POR QUE nao ha QR -- calar e o que faz a '
              'pessoa achar que o app esta quebrado.',
        );
      },
    );

    testWidgets(
      'a contagem diz que ha tag e a lista nao traz nenhuma ativa',
      (tester) async {
        // A plaquinha revogada: `active_tag_count` desatualizado na resposta do
        // pet, e a lista dizendo a verdade. `qr.png` responderia 410 nesse
        // caso -- e pedi-lo seria pedir uma recusa.
        await _abrirAPaginaDoPet(
          tester,
          pet: petDoContrato(tagsAtivas: 1),
          tags: <Map<String, dynamic>>[_tagDoContrato(status: 'revoked')],
        );
        await rolarAte(tester, find.byType(QrDaPlaquinha));

        expect(
          _oQr(),
          findsNothing,
          reason: 'REPROVA: tag revogada virou QR na tela. O codigo dela '
              'responde 410 para sempre (ADR-0004), e um QR que leva a "tag '
              'desativada" e um QR invalido na coleira de um animal vivo.',
        );
        expect(
          find.text(QrDaPlaquinha.semTag('Nina')),
          findsOneWidget,
          reason: 'REPROVA: a tela escolheu o texto errado. Sem tag ativa o '
              'estado e `semTag`, e nao `falhou`: nada falhou, e oferecer '
              '`Tentar de novo` mandaria a pessoa repetir o que nao tem '
              'conserto do lado de ca.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // A PORTA POR ONDE O DEFEITO DA CLASSE 1 ENTRARIA
  //
  // Este grupo mede uma DECLARACAO, e nao um comportamento, e e a unica
  // excecao a regra deste arquivo. O motivo: o comportamento errado so existe
  // depois de o pacote entrar, e o momento de reprovar e o do `pub add`, nao o
  // da tela. E uma porta, e portas se cobram na porta.
  // -------------------------------------------------------------------------
  // A ISCA DESTE GRUPO FOI **ESTREITADA** EM 21/10/2026, E NAO REMOVIDA.
  //
  // O QUE ELA DIZIA: *"nenhum gerador de QR declarado no aplicativo"*, e
  // reprovava `qr_flutter` no `pubspec.yaml`. O motivo escrito era que *"um
  // gerador de QR aqui so tem o que codificar se alguem lhe der um
  // identificador do aparelho -- e os que existem aqui sao internos (`pet.id`)
  // ou nao sao publicos"*.
  //
  // **O INVARIANTE CONTINUA O MESMO; o que mudou foi que passou a existir um
  // dado que satisfaz a premissa.** O convite de conexao e um segredo ao
  // portador de 256 bits, criado pelo servidor **para ser mostrado**: nao e
  // identificador de nada, nao e UUID, nao e derivavel de ninguem e nao viola
  // o item 6 do ADR-0010 -- ele existe exatamente para viajar.
  //
  // E o contrato nao da alternativa: `ConnectionInviteIssued` recusa devolver
  // imagem **e** recusa devolver URL, com o motivo escrito -- *"devolver URL
  // absoluta amarraria o convite ao dominio do dia"* -- e termina dizendo
  // *"quem os monta e a tela"*. Pedir um PNG ao servidor seria pedir que ele
  // monte o endereco que acabou de recusar montar.
  //
  // ENTAO A ISCA FICOU COM TRES CASOS NO LUGAR DE UM, e os tres juntos cobram
  // mais do que o unico cobrava:
  //
  //   1. os OUTROS geradores continuam proibidos -- um pacote por tela e como
  //      a lista de dependencias cresce sem ninguem decidir;
  //   2. o gerador aparece em UM arquivo so de `app/lib/`, e e o do convite;
  //   3. o QR DA PLAQUINHA continua vindo do servidor. Este e o caso que
  //      importa: ele e o contrapeso, e e ele que impede alguem de
  //      "simplificar" o PNG do servidor para um gerador local agora que o
  //      gerador existe no binario.
  group('o gerador de QR existe para UM dado, e so para ele', () {
    test('o pubspec nao traz NENHUM outro gerador de QR', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      // `qr_flutter` saiu desta lista em 21/10/2026, com o motivo no cabecalho
      // do grupo. `qr:` tambem: ele e a dependencia transitiva de
      // `qr_flutter`, e declara-la direto criaria a segunda fonte da versao do
      // codificador.
      const geradores = <String>[
        'pretty_qr_code',
        'qr_code_vision',
        'barcode_widget',
        'barcode:',
        'zxing',
      ];
      for (final pacote in geradores) {
        expect(
          pubspec.contains(pacote),
          isFalse,
          reason: 'REPROVA: `$pacote` entrou no aplicativo. Ja existe um '
              'gerador de QR aqui (`qr_flutter`, pelo convite de conexao), e '
              'um segundo nao tem o que codificar: os identificadores deste '
              'produto sao internos (`pet.id`) ou vem desenhados do servidor.',
        );
      }
    });

    test('o gerador e usado em UM arquivo so, e e o do convite', () {
      // PARA DESLIGAR E VER REPROVAR: use `QrImageView` em qualquer outra tela.
      final usos = Directory('lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .where((f) => f.readAsStringSync().contains('QrImageView'))
          .map((f) => f.path)
          .toList()
        ..sort();

      expect(
        usos,
        <String>['lib/widgets/qr_do_convite.dart'],
        reason: 'REPROVA: o gerador de QR e usado fora do widget do convite. '
            'Ele desenha UM dado -- o token do convite --, e qualquer outro '
            'quadrado deste produto ou vem do servidor ou nao existe.',
      );
    });

    test('o QR do convite codifica o TOKEN, e nada mais', () {
      // Varredura de FONTE e nao de comportamento, pelo mesmo motivo do caso
      // do `pubspec`: o dado errado chegaria ao quadrado por uma linha nova de
      // quem escrevesse a proxima tela, e o momento de reprovar e o da linha.
      // ================================================================
      // O ARQUIVO MUDOU EM 28/10/2026, E A ASSERCAO NAO
      // ================================================================
      //
      // Era `lib/telas/conexoes/convide_tutores.dart`. Aquela tela MORREU por
      // decisao do cliente, e o QR foi para dentro de `Meus dados`
      // (`_BlocoDoConvite`), com o placar junto. A varredura segue o QR: ela
      // cobra O QUE ALIMENTA O QUADRADO, e isso nao depende de em que tela ele
      // mora.
      //
      // **A lista de proibidos foi conferida no arquivo novo**, e nao
      // herdada: `petId`, `publicRef`, `userId` e `.id}` dao ZERO ocorrencias
      // em `tela_dados_pessoais.dart`. Se a conta fosse outra, o caso
      // reprovaria aqui e nao num arquivo que ninguem mais le.
      final tela = File(
        'lib/telas/perfil/tela_dados_pessoais.dart',
      ).readAsStringSync();

      expect(
        tela.contains('QrDoConvite(token: convite.inviteToken)'),
        isTrue,
        reason: 'REPROVA: o que alimenta o QR do convite deixou de ser o '
            'token da emissao. Se virar um endereco montado na tela, o QR '
            'passa a apontar para uma pagina que nao existe no site; se virar '
            'um identificador, e o item 6 do ADR-0010.',
      );
      for (final proibido in <String>['petId', 'publicRef', 'userId', '.id}']) {
        expect(
          tela.contains(proibido),
          isFalse,
          reason: 'REPROVA: a tela que hospeda o QR menciona `$proibido`. '
              'Nenhum '
              'identificador interno entra num quadrado que outra pessoa '
              'fotografa (ADR-0010, item 6).',
        );
      }
    });

    test('CONTRAPESO: o QR da plaquinha continua vindo do servidor', () {
      // **Este caso e o que mais importa do grupo.** Agora que ha um gerador
      // no binario, a tentacao de trocar o PNG do servidor por ele passou a
      // existir -- e o cabecalho de `qr_da_plaquinha.dart` pede, com todas as
      // letras, que ninguem faca isso, por duas medicoes que sao dela: o
      // leitor do proprio app exige a forma da URL, e a camera comum do
      // celular abre a pagina de quem achou o pet.
      final widget = File(
        'lib/widgets/qr_da_plaquinha.dart',
      ).readAsStringSync();

      expect(
        widget.contains('QrImageView'),
        isFalse,
        reason: 'REPROVA: o QR da plaquinha passou a ser desenhado no '
            'aparelho. Ele e `GET /v1/pets/{petId}/tags/{tagId}/qr.png`, e o '
            'servidor emite a imagem e a linha legivel da MESMA funcao -- de '
            'proposito, para as duas nunca apontarem para lugares diferentes '
            'depois da prensa.',
      );
      expect(
        widget.contains('ImageProvider'),
        isTrue,
        reason: 'REPROVA: o widget da plaquinha deixou de receber imagem '
            'pronta.',
      );
    });
  });
}
