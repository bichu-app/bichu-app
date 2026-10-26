// `Convide tutores` saiu das mensagens e entrou no menu do Perfil (26/10/2026).
//
// ===========================================================================
// O PEDIDO, E POR QUE ELE TEM DUAS METADES
// ===========================================================================
//
// O cliente pediu DUAS VEZES, e a segunda vez disse a parte que faltava:
//
// - **22/10/2026**: *"Mova o convite tutores para a pagina do perfil"*.
// - **26/10/2026**: *"retirar o convite tutores das mensagens, deixar apenas
//   na menu do perfil do usuario"*.
//
// `mover` e `apenas` sao duas afirmacoes, e um arquivo de teste que medisse so
// a chegada aprovaria a versao que deixa a porta nos DOIS lugares -- que e
// exatamente o que ele pediu duas vezes para desfazer. Por isso ha uma isca
// para cada metade.
//
// **E EXISTE UMA DECISAO DELE DE 21/10/2026 QUE DIZ O CONTRARIO**, escrita no
// codigo: *"no AuAu como tela empilhada, nao no Perfil"*. Ela e mais VELHA e
// perdeu. As tres datas estao citadas juntas aqui, em `abas.dart`, em
// `rotas.dart`, em `area_de_mensagens.dart` e no cabecalho de
// `TelaDeConvidarTutores`, porque sem as duas novas ao lado da velha alguem
// reverte isto achando que esta consertando um defeito.
//
// ===========================================================================
// A TABELA DAS ISCAS: o que se desliga, e qual caso reprova
// ===========================================================================
//
// | isca | o que se desliga em `lib/` | reprova em |
// |---|---|---|
// | (a) | repor o `ItemDeMenu` do convite no corpo do AuAu | `o corpo do AuAu nao tem item de menu nenhum` |
// | (b) | repor `Rotas.convidarTutores` em `area_de_mensagens.dart` | `a fonte do AuAu nao cita a rota do convite` |
// | (c) | tirar o `ItemDeMenu` de `Convide tutores` de `abas.dart` | `o convite esta no menu do Perfil` |
// | (d) | baixar a linha do registro para `planejada`, ou tirar a rota | `a linha do registro do Perfil esta VIVA e aponta para a rota` |
// | **(e)** | **a fiacao da rota em `rotas.dart`** | **`CONTROLE POSITIVO: tocar o item do Perfil ABRE a tela do convite`** |
//
// **(e) E O CONTROLE POSITIVO, e sem ele as outras quatro nao valem.** (a) e
// (b) sao afirmacoes NEGATIVAS e (c) e (d) provam que um nome existe -- as
// quatro juntas ficariam verdes com o item na tela e sem destino, que e o
// defeito que o criterio 2 da BICHUS-62 chama de acao sem desfecho, e e
// literalmente como `Pedidos de conexao` passou de 18/10 a 19/10 sem o cliente
// ver nada. (e) mede o CAMINHO INTEIRO: foto da barra de topo, tela da conta,
// item do menu, tela do convite montada.
//
// ===========================================================================
// A ARMADILHA DA ASSERCAO NEGATIVA, E COMO (a) E (b) NAO CAEM NELA
// ===========================================================================
//
// `findsNothing` sobre um ROTULO passa no vazio: se alguem repusesse a porta
// com o texto `Convidar tutores` ou `Traga seus amigos`, um caso ancorado na
// palavra `Convide tutores` ficaria verde com o defeito na tela. Nenhuma das
// duas iscas negativas olha texto:
//
// - **(a)** ancora no TIPO `ItemDeMenu` dentro de `AreaDeMensagens`, e a conta
//   e `findsNothing` sobre o tipo -- o convite era o UNICO item de menu do
//   corpo do AuAu, entao qualquer rotulo que reponha a porta reprova.
// - **(b)** ancora no SIMBOLO `Rotas.convidarTutores` e no import da tela, lida
//   da fonte. Rotulo nao entra na conta, e o simbolo e o que todo caminho tem
//   de atravessar para chegar na tela.
//
// **O CONTROLE DO PROBE de (a)** nao e um `expect` solto: e o par (a)/(c). As
// duas usam o MESMO `find.byType(ItemDeMenu)`; (c) prova que esse finder ACHA
// um item no Perfil, e (a) prova que ele nao acha nenhum no AuAu. Um finder
// quebrado reprovaria (c) antes de deixar (a) passar no vazio.
//
// **O CONTROLE DO SCANNER de (b)** esta dentro do proprio caso: a mesma leitura
// de fonte, aplicada a `abas.dart`, TEM de achar as duas coisas que ela exige
// estarem ausentes de `area_de_mensagens.dart`. Varredura que nao acha nada
// passaria no vazio; esta prova que acha onde a resposta e conhecida.

import 'dart:io' as io;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/conexoes/convide_tutores.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../mensagens/area_de_mensagens_test.dart'
    show ServidorDeConversas, abrirAMensagens, conversa, paginaDeConversas;
import 'ajuda_de_tela.dart';

/// Os dois arquivos de `lib/` que esta historia move, lidos da fonte.
const String _fonteDoAuAu = 'lib/telas/mensagens/area_de_mensagens.dart';
const String _fonteDoPerfil = 'lib/telas/abas.dart';

/// O simbolo que TODO caminho ate a tela do convite tem de atravessar.
///
/// Ancorar aqui, e nao no rotulo, e o que faz a isca (b) sobreviver a troca de
/// nome: o endereco pode mudar de valor e o rotulo pode mudar de palavra, mas
/// quem empurra a tela escreve este simbolo.
const String _simboloDaRota = 'Rotas.convidarTutores';

/// O import da tela. A segunda marca que uma porta reposta deixaria.
const String _importDaTela = "conexoes/convide_tutores.dart'";

/// Uma superficie alta: `ListView` so constroi o que cabe, e o menu do Perfil
/// inteiro precisa estar deitado para o item do convite ter `Element`.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// O servidor minimo das telas desta historia.
///
/// `/v1/me` e `/v1/pets` sao o que a tela da conta pede ao abrir;
/// `/v1/connections/summary` e o que `TelaDeConvidarTutores` pede no
/// `initState` para montar o placar de quem foi trazido.
Future<http.Response> _servidorDaConta(http.Request req) async {
  final caminho = req.url.path;
  if (caminho == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (caminho == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  if (caminho == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 0,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 10,
      'connection_limit': 100,
      'invited_joined_count': 0,
    });
  }
  return problema('not-found', 404);
}

/// A linha do registro da gaveta que aponta para a tela do convite.
///
/// Procurada pela ROTA e nao pelo rotulo, pela mesma razao de (b).
SubDestino? _linhaDoConviteNoRegistro() {
  for (final d in RegistroDeSubDestinos.itensDe(Rotas.perfil)) {
    if (d.rota == Rotas.convidarTutores) return d;
  }
  return null;
}

void main() {
  // -------------------------------------------------------------------------
  group('a metade que SAIU: o convite nao esta mais nas mensagens', () {
    testWidgets('isca (a): o corpo do AuAu nao tem item de menu nenhum', (
      tester,
    ) async {
      _superficieAlta(tester);
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations': (_) =>
              json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
        },
      );
      await abrirAMensagens(tester, servidor: servidor);

      // A arvore montou de verdade: sem esta linha, um `abrirAMensagens` que
      // falhasse em silencio deixaria a conta abaixo passar no vazio -- zero
      // itens de menu numa arvore que nao tem tela nenhuma.
      expect(
        find.byType(AreaDeMensagens),
        findsOneWidget,
        reason:
            'REPROVA: `AreaDeMensagens` nao montou, e as contas deste caso '
            'mediriam uma arvore vazia em vez do corpo do AuAu.',
      );

      expect(
        find.descendant(
          of: find.byType(AreaDeMensagens),
          matching: find.byType(ItemDeMenu),
        ),
        findsNothing,
        reason:
            'REPROVA: o corpo do AuAu voltou a ter um `ItemDeMenu`. O convite '
            'era o UNICO item de menu desta tela, e o cliente mandou tirar a '
            'porta daqui DUAS VEZES -- 22/10/2026 ("Mova o convite tutores '
            'para a pagina do perfil") e 26/10/2026 ("retirar o convite '
            'tutores das mensagens, deixar apenas na menu do perfil do '
            'usuario"). A decisao de 21/10 que punha a porta aqui e mais '
            'velha e perdeu: ela esta citada em `area_de_mensagens.dart` ao '
            'lado das outras duas, de proposito.\n'
            'ESTA CONTA E POR TIPO, e nao por rotulo: repor a porta com '
            'qualquer outro nome reprova aqui do mesmo jeito.',
      );
    });

    test('isca (b): a fonte do AuAu nao cita a rota do convite', () {
      final auau = io.File(_fonteDoAuAu).readAsStringSync();
      final perfil = io.File(_fonteDoPerfil).readAsStringSync();

      // CONTROLE DO SCANNER, e ele vem PRIMEIRO de proposito: a mesma leitura,
      // no arquivo onde a resposta e CONHECIDA, tem de achar as duas marcas.
      // Uma varredura que lesse o arquivo errado, ou que casasse nada, ficaria
      // verde nas duas contas de baixo por nao ter conferido nada.
      expect(
        perfil.contains(_simboloDaRota),
        isTrue,
        reason:
            'REPROVA: `$_fonteDoPerfil` nao cita `$_simboloDaRota`. Ou a porta '
            'do Perfil morreu (e ai a isca (c) tambem reprova), ou este '
            'scanner esta lendo o arquivo errado -- e nesse caso as duas '
            'contas negativas deste caso nao valem nada.',
      );
      expect(
        perfil.contains(_importDaTela),
        isTrue,
        reason:
            'REPROVA: `$_fonteDoPerfil` nao importa a tela do convite, e este '
            'scanner nao esta medindo o que acha que mede.',
      );

      expect(
        auau.contains(_simboloDaRota),
        isFalse,
        reason:
            'REPROVA: `$_fonteDoAuAu` voltou a citar `$_simboloDaRota`. Este '
            'simbolo e o que todo caminho ate a tela atravessa, entao citar '
            'ele aqui e repor a porta nas mensagens -- com qualquer rotulo, '
            'inclusive um rotulo novo que nenhuma conta de texto pegaria.',
      );
      expect(
        auau.contains(_importDaTela),
        isFalse,
        reason:
            'REPROVA: `$_fonteDoAuAu` voltou a importar a tela do convite. '
            'A area de mensagens nao se amarra a navegacao nenhuma, e este '
            'import e a marca que uma porta reposta deixa.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a metade que ENTROU: o convite esta no menu do Perfil', () {
    testWidgets('isca (c): o convite esta no menu do Perfil', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidorDaConta,
        deposito: depositoLogado(),
      );
      await irParaAConta(tester);

      final item = find.descendant(
        of: find.byType(AbaPerfil),
        matching: find.widgetWithText(
          ItemDeMenu,
          TelaDeConvidarTutores.titulo,
        ),
      );
      expect(
        item,
        findsOneWidget,
        reason:
            'REPROVA: `${TelaDeConvidarTutores.titulo}` nao esta no menu do '
            'Perfil. Ele saiu do corpo do AuAu em 26/10/2026 por pedido do '
            'cliente, e sair de LA e nao chegar AQUI deixa a tela sem porta '
            'nenhuma -- que e como `Pedidos de conexao` ficou de 18/10 a '
            '19/10, e foi por isso que ele nao viu nada.\n'
            'ESTE CASO E TAMBEM O CONTROLE DO PROBE DA ISCA (a): as duas usam '
            '`find.byType(ItemDeMenu)`, e se este finder parar de achar '
            'item de menu e AQUI que isso aparece -- em vez de (a) passar no '
            'vazio.',
      );

      // **NAO e a gaveta que cumpre o pedido, e e por isso que este caso mede
      // `AbaPerfil`.** A gaveta de secoes esta OCULTA desde 19/10/2026: a
      // linha do registro tambem subiu (isca (d)), mas se a porta tivesse ido
      // SO para la, `retirar das mensagens` teria deixado a tela
      // inalcancavel para a pessoa.
      expect(
        find.byType(AbaPerfil),
        findsOneWidget,
        reason:
            'REPROVA: a tela da conta nao e `AbaPerfil`, e a conta acima mediu '
            'outra coisa.',
      );
    });

    test(
      'isca (d): a linha do registro do Perfil esta VIVA e aponta para a rota',
      () {
        final linha = _linhaDoConviteNoRegistro();
        expect(
          linha,
          isNotNull,
          reason:
              'REPROVA: nenhuma linha do registro de `Rotas.perfil` aponta '
              'para `$_simboloDaRota`. A UX 27.5.5 reservou esta linha como '
              '`Convidar vizinhos` e ela SUBIU em 26/10/2026 -- subir o '
              'estado da linha reservada e o caminho normal desta casa, e e '
              'por isso que o inventario continua com 54 linhas e 18 '
              'destinos.\n'
              'A busca e pela ROTA e nao pelo rotulo: trocar o nome da linha '
              'nao faz este caso passar.',
        );

        final viva = linha!;
        expect(
          viva.forma,
          FormaDoSubDestino.destino,
          reason:
              'REPROVA: a linha do convite deixou de ser `destino`. A tela tem '
              '`Scaffold` e endereco proprio; ela nao e um bloco da aba.',
        );
        expect(
          viva.estado,
          EstadoDoSubDestino.existe,
          reason:
              'REPROVA: a linha do convite voltou para `planejada`, e com ela '
              'o registro volta a NOMEAR em texto uma tela que ele nao abre. '
              'A tela existe desde 21/10/2026.',
        );
        expect(
          viva.viraItem,
          isTrue,
          reason:
              'REPROVA: a linha do convite nao vira item da gaveta. `destino` '
              'marcado `existe` com rota nula e um atalho que a gaveta '
              'esconde sem nomear.',
        );
        expect(
          viva.icone,
          isNotNull,
          reason:
              'REPROVA: a linha do convite esta viva e sem glifo, que e '
              'exatamente o que a assercao do construtor de `SubDestino` '
              'proibe -- e a mesma uniao que quebrou '
              '`const_eval_throws_exception` em 19/10.',
        );

        // O GLIFO E UNICO NA SECAO, medido por `codePoint` e nao por nome.
        //
        // Isto DUPLICA de proposito a guarda global
        // `nenhuma secao tem dois itens com o MESMO glifo`: aquela varre as
        // seis secoes e diria apenas que ALGUMA colidiu. Esta nomeia a linha
        // do convite, que e a que esta historia acrescenta.
        final outros = RegistroDeSubDestinos.itensDe(Rotas.perfil)
            .where((d) => d.viraItem && d.rota != Rotas.convidarTutores)
            .map((d) => d.icone!.codePoint)
            .toList(growable: false);
        expect(
          outros,
          isNotEmpty,
          reason:
              'REPROVA: a secao `Rotas.perfil` nao tem outro item vivo, e esta '
              'conta de colisao nao compararia com nada.',
        );
        expect(
          outros.contains(viva.icone!.codePoint),
          isFalse,
          reason:
              'REPROVA: o glifo do convite colide com outro item vivo de '
              '`Rotas.perfil`. Os seis que ja moravam na secao sao '
              '`note_add_outlined` (0xf22e), `qr_code_scanner` (0xe4f7), '
              '`person_add_alt_outlined` (0xf276), `people_outline` (0xe488), '
              '`block_outlined` (0xeed1) e `manage_accounts_outlined` '
              '(0xf1ac); o do convite e `share_outlined` (0xf378).',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('CONTROLE POSITIVO — o item ABRE a tela, e nao e so um nome', () {
    testWidgets(
      'CONTROLE POSITIVO: tocar o item do Perfil ABRE a tela do convite',
      (tester) async {
        _superficieAlta(tester);
        await abrirOApp(
          tester,
          rede: _servidorDaConta,
          deposito: depositoLogado(),
        );
        // `irParaAConta` toca na foto da barra de topo, que e a UNICA porta da
        // tela da conta desde 19/10. O caminho medido aqui e o DELE.
        await irParaAConta(tester);

        final item = find.descendant(
          of: find.byType(AbaPerfil),
          matching: find.widgetWithText(
            ItemDeMenu,
            TelaDeConvidarTutores.titulo,
          ),
        );
        expect(item, findsOneWidget);

        // ALCANCE DE VERDADE, e nao `warnIfMissed: false`: `ensureVisible`
        // traz o item para dentro da janela e o `tap` abaixo e o normal, que
        // REPROVA quando o toque nao acerta o widget. Um helper que
        // engolisse o aviso aprovaria um item coberto por outra coisa.
        await tester.ensureVisible(item);
        await tester.pumpAndSettle();
        await tester.tap(item);
        await tester.pumpAndSettle();

        expect(
          find.byType(TelaDeConvidarTutores),
          findsOneWidget,
          reason:
              'REPROVA: o toque no item do menu do Perfil nao abriu '
              '`TelaDeConvidarTutores`. **ESTA E A CONTA QUE AS OUTRAS QUATRO '
              'NAO FAZEM**: (a) e (b) provam que a porta saiu das mensagens, '
              '(c) e (d) provam que um nome e uma linha existem, e as quatro '
              'ficariam VERDES com o item na tela e sem destino -- acao sem '
              'desfecho, que o criterio 2 da BICHUS-62 proibe.\n'
              'O caminho tem quatro pontas e qualquer uma quebra aqui: foto da '
              'barra de topo, `AbaPerfil`, o `ItemDeMenu` de `abas.dart`, e a '
              'fiacao da rota em `rotas.dart` -- que nao e nenhum dos outros '
              'arquivos desta historia.',
        );

        // E A ROTA E A NOVA. O endereco mudou de `/mensagens/convide-tutores`
        // para `/perfil/convide-tutores` em 26/10, e um caso que so olhasse o
        // tipo da tela aprovaria a volta do endereco antigo.
        expect(
          Rotas.convidarTutores,
          '/perfil/convide-tutores',
          reason:
              'REPROVA: o endereco do convite deixou de ser '
              '`/perfil/convide-tutores`. Ele saiu de `/mensagens/...` porque '
              'a tela saiu do AuAu; renomear nao custou nada (o app nao abre '
              'por link, e o QR do convite carrega o TOKEN cru e nao uma URL) '
              'e apagou a armadilha de ordem com `/mensagens/:conversaId`.',
        );
      },
    );
  });
}
