// `Perfil` > `Meus eventos`: o caminho, a versao e a folha de confirmacao.
//
// ===========================================================================
// O QUE ESTE ARQUIVO GUARDA
// ===========================================================================
//
// `cancelNetworkEvent` existia desde 17/10/2026 e **nao tinha caminho**: nada
// na resposta da agenda diz de quem e o encontro, e nenhuma leitura da `Rede`
// devolvia `ETag` -- medido contra homologacao, nao deduzido do contrato. Esta
// entrega fechou os dois buracos, e cada caso daqui guarda um pedaco:
//
// | isca | o que se desliga em producao | reprova |
// |---|---|---|
// | (e) | o `ItemDeMenu` de `Meus eventos` em `abas.dart` | `e alcancavel pela FOTO da barra de topo` |
// | (b) | o `ETag` que a tela guarda da leitura | `o If-Match do cancelamento e o ETag da leitura` |
// | (c) | o `aoConfirmar` da folha | `confirmar cancela, e a lista recarrega` |
// | (d) | a entrada de `precondition-failed` em `MensagensDeErro` | `o 412 diz para recarregar, e nao a faixa generica` |
// | (f) | qualquer linha nova que afirme aviso | `a folha NAO afirma que alguem foi avisado` |
// | capa | o motivo do servidor na faixa da capa | `a capa recusada mostra o motivo DO SERVIDOR` |
//
// **A isca (e) copia a forma da isca da frente da barra** (*"`Pessoas
// bloqueadas` e alcancavel pela FOTO da barra de topo"*), e nao a forma
// "o item existe": o que importa e o CAMINHO INTEIRO -- foto da barra, tela da
// conta, item, tela nova --, porque e o caminho que o cliente usa e e ele que
// quebra quando uma das quatro pontas se mexe. Um `findsOneWidget` sobre o
// rotulo ficaria verde com o item na tela e sem destino.

import 'dart:convert';

import 'package:bichu/api/modelos_rede.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/perfil/meus_eventos.dart';
import 'package:bichu/widgets/folha_destrutiva.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../rede/fixtures_da_rede.dart' show encontroPublico;
import 'ajuda_de_tela.dart';

const String _slug = 'encontro-de-domingo-na-praca';
const String _titulo = 'Encontro de domingo na praça';
const String _motivoDaRecusa = 'A imagem precisa ter pelo menos 600 x 600 pixels.';

/// A frase generica que a tela diz ANTES do motivo, e nunca em vez dele.
const String _rotuloDaRecusa = 'A foto deste encontro foi recusada.';

/// A frase do estado `processing`, e a razao dela estar aqui e um relato.
///
/// Cliente, 26/10/2026: *"a foto do evento foi cadastrada, mas ela tem um
/// delay, entao parece ser um problema, mas foi resolvido sozinho"*. O envio
/// funcionava; `url` nula fazia o cartao desenhar o banner da marca -- o mesmo
/// de um encontro sem capa nenhuma --, e quem acabou de enviar uma foto le
/// aquilo como falha.
const String _rotuloDoPreparo =
    'A foto deste encontro chegou e está sendo preparada.';

/// Um encontro meu, na forma de `MyNetworkEvent` -- as sete propriedades.
///
/// As datas sao relativas ao relogio do caso, e nao fixas: um encontro com data
/// fixa de 2026 vira passado sozinho, e o `Cancelar` desapareceria da tela por
/// causa do calendario e nao por causa do codigo.
Map<String, dynamic> _meuEncontro({
  String slug = _slug,
  String titulo = _titulo,
  String situacao = 'upcoming',
  Map<String, dynamic>? capa = const <String, dynamic>{
    'status': 'ready',
    'url': 'https://midia.exemplo.invalid/capa.jpg',
    'rejection_reason': null,
  },
}) {
  final comeca = DateTime.now().toUtc().add(const Duration(days: 3));
  return <String, dynamic>{
    'slug': slug,
    'title': titulo,
    'cover': capa,
    'starts_at': comeca.toIso8601String(),
    'ends_at': comeca.add(const Duration(hours: 2)).toIso8601String(),
    'time_zone': 'America/Sao_Paulo',
    'status': situacao,
  };
}

/// Uma resposta 200 **com `ETag`**, que e o que a leitura do dono devolve.
http.Response json200ComEtag(Map<String, dynamic> corpo, String? etag) {
  return http.Response(
    jsonEncode(corpo),
    200,
    headers: <String, String>{
      'content-type': 'application/json; charset=utf-8',
      'etag': ?etag,
    },
  );
}

/// O registro do que a tela mandou: e sobre ele que a isca do `If-Match`
/// afirma.
class _Servidor {
  _Servidor({
    this.etagDaLeitura = '"1"',
    this.encontro,
    this.cancelamento,
    this.leituraDoDono,
  });

  /// O `ETag` que a leitura do dono devolve. `null` imita o 200 sem cabecalho.
  final String? etagDaLeitura;

  /// O item da lista. Nulo usa [_meuEncontro].
  final Map<String, dynamic>? encontro;

  /// A resposta de `POST .../cancellation`. Nula devolve o encontro cancelado.
  final http.Response? cancelamento;

  /// A resposta de `GET /v1/network/my-events/{slug}`. Nula devolve o encontro.
  final http.Response? leituraDoDono;

  /// Os `If-Match` que chegaram no cancelamento, na ordem.
  final List<String?> ifMatchRecebidos = <String?>[];

  /// Quantas vezes a lista foi pedida: e assim que o caso ve a recarga.
  int listagens = 0;

  bool cancelou = false;

  Future<http.Response> atender(http.Request req) async {
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
    if (caminho == '/v1/network/my-events' && req.method == 'GET') {
      listagens++;
      final item = encontro ?? _meuEncontro();
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          if (cancelou)
            <String, dynamic>{...item, 'status': 'cancelled'}
          else
            item,
        ],
        'page': 1,
        'limit': 20,
        'total': 1,
      });
    }
    if (caminho == '/v1/network/my-events/$_slug' && req.method == 'GET') {
      final pronta = leituraDoDono;
      if (pronta != null) return pronta;
      return json200ComEtag(encontro ?? _meuEncontro(), etagDaLeitura);
    }
    if (caminho == '/v1/network/events/$_slug/cancellation' &&
        req.method == 'POST') {
      ifMatchRecebidos.add(req.headers['If-Match'] ?? req.headers['if-match']);
      final resposta = cancelamento;
      if (resposta != null) return resposta;
      cancelou = true;
      // A RESPOSTA DO CANCELAMENTO E `NetworkEventPublic`, e nao
      // `MyNetworkEvent`: o contrato diz que ela sai "na forma de
      // `getNetworkEvent`". Montar a forma errada aqui faria o caso reprovar
      // por `FormatException` em vez de pelo que ele mede -- e foi o que
      // aconteceu na primeira escrita deste arquivo.
      return json200ComEtag(
        encontroPublico(slug: _slug, title: _titulo, status: 'cancelled'),
        '"2"',
      );
    }
    return problema('not-found', 404);
  }
}

/// Todo texto visivel da arvore montada -- `Text` e `RichText`.
///
/// Uma varredura que so olhasse `Text` nao enxergaria uma linha reposta como
/// `Text.rich`, que e uma forma plausivel de repor.
List<String> _textosDaTela(WidgetTester tester) {
  final achados = <String>[];
  for (final w in tester.widgetList<Text>(find.byType(Text))) {
    final t = w.data ?? w.textSpan?.toPlainText();
    if (t != null) achados.add(t);
  }
  for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
    achados.add(w.text.toPlainText());
  }
  return achados;
}

String _semAcento(String v) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const para = 'aaaaaeeeeiiiiooooouuuuc';
  final b = StringBuffer();
  for (final c in v.toLowerCase().runes) {
    final i = de.indexOf(String.fromCharCode(c));
    b.write(i < 0 ? String.fromCharCode(c) : para[i]);
  }
  return b.toString();
}

/// Uma superficie alta: `ListView` so constroi o que cabe, e a folha de
/// confirmacao e o cartao inteiro precisam estar deitados para serem medidos.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Abre `Meus eventos` **pelo caminho de verdade**: foto da barra, depois o
/// item do menu da conta.
Future<void> _abrirPelaFotoDaBarra(WidgetTester tester, _Servidor s) async {
  await abrirOApp(tester, rede: s.atender, deposito: depositoLogado());
  // `irParaAConta` toca na `AvatarDaConta` -- a foto da barra de topo, que e a
  // unica porta da tela da conta desde 19/10.
  await irParaAConta(tester);

  final item = find.descendant(
    of: find.byType(AbaPerfil),
    matching: find.widgetWithText(ItemDeMenu, MeusEventos.titulo),
  );
  expect(
    item,
    findsOneWidget,
    reason: 'REPROVA: nao ha `${MeusEventos.titulo}` no menu da conta. Esta '
        'linha e o UNICO caminho do app ate `cancelNetworkEvent`: nada na '
        'agenda diz de quem e o encontro, entao sem ela quem criou um '
        'encontro nao tem como cancela-lo.',
  );
  await tester.tap(item);
  await tester.pumpAndSettle();
}

void main() {
  group('ISCA (e) — o caminho inteiro, e nao a existencia do item', () {
    testWidgets(
      '`Meus eventos` e alcancavel pela FOTO da barra de topo',
      (tester) async {
        _superficieAlta(tester);
        final s = _Servidor();
        await _abrirPelaFotoDaBarra(tester, s);

        expect(
          find.byType(MeusEventos),
          findsOneWidget,
          reason: 'REPROVA: o toque na linha do menu nao abriu `MeusEventos`. '
              'O caminho e foto da barra de topo > tela da conta > '
              '`Meus eventos`, e e ele que quebra quando uma das quatro '
              'pontas se mexe -- a fiacao da rota mora em `rotas.dart`, que '
              'nao e este arquivo nem `abas.dart`.',
        );
        expect(
          find.text(_titulo),
          findsOneWidget,
          reason: 'REPROVA: a tela abriu e o encontro desta conta nao esta '
              'nela, entao `listMyNetworkEvents` nao foi chamada ou a '
              'resposta nao foi lida.',
        );
        expect(s.listagens, 1);
      },
    );

    testWidgets('a linha fica ENTRE `Meus achados` e `Sair da conta`',
        (tester) async {
      // O lugar nao e gosto: `abas.dart` declara, por extenso, que item novo
      // deste menu entra antes do ultimo, e o cliente foi literal -- *"o sair
      // da conta deve ser sempre a ultima opcao do menu"*. Medido em
      // coordenada, como `perfil_ordem_dos_itens_test.dart` faz: presenca nao
      // e ordem.
      _superficieAlta(tester);
      final s = _Servidor();
      await abrirOApp(tester, rede: s.atender, deposito: depositoLogado());
      await irParaAConta(tester);

      Finder naAba(String rotulo) => find.descendant(
            of: find.byType(AbaPerfil),
            matching: find.widgetWithText(ItemDeMenu, rotulo),
          );

      final achados = tester.getTopLeft(naAba('Meus achados')).dy;
      final eventos = tester.getTopLeft(naAba(MeusEventos.titulo)).dy;
      final sair = tester.getTopLeft(naAba('Sair da conta')).dy;

      expect(eventos, greaterThan(achados));
      expect(
        sair,
        greaterThan(eventos),
        reason: 'REPROVA: `${MeusEventos.titulo}` ficou DEPOIS de '
            '`Sair da conta`. O cliente foi literal: "o sair da conta deve '
            'ser sempre a ultima opcao do menu".',
      );
    });
  });

  group('ISCA (b) e (c) — a versao da leitura e o que autoriza o cancelamento',
      () {
    testWidgets('o `If-Match` do cancelamento e o `ETag` da leitura',
        (tester) async {
      // ESTE E O DEFEITO QUE A ENTREGA FECHA. `cancelar` sempre recebeu o
      // valor; nao havia de onde tira-lo, porque nenhuma leitura da `Rede`
      // emitia `ETag`. Desligar o `header('ETag', ...)` do servidor, ou o
      // `resposta.etag` de `getComEtag`, faz este caso reprovar pelo nome.
      _superficieAlta(tester);
      final s = _Servidor(etagDaLeitura: '"7"');
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();
      expect(
        find.byType(FolhaDestrutiva),
        findsOneWidget,
        reason: 'REPROVA: a folha de confirmacao nao abriu depois da leitura '
            'da versao.',
      );

      await tester.tap(
        find.descendant(
          of: find.byType(FolhaDestrutiva),
          matching: find.text(TextosDoCancelamento.confirmar),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        s.ifMatchRecebidos,
        <String>['"7"'],
        reason: 'REPROVA: o `If-Match` que chegou ao servidor nao e o `ETag` '
            'que a leitura devolveu. Sem este valor a operacao responde 428 '
            'em toda tentativa, e era exatamente esse o estado antes desta '
            'entrega.',
      );
    });

    testWidgets('confirmar cancela, e a lista recarrega mostrando `Cancelado`',
        (tester) async {
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);
      expect(s.listagens, 1);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(FolhaDestrutiva),
          matching: find.text(TextosDoCancelamento.confirmar),
        ),
      );
      await tester.pumpAndSettle();

      expect(s.cancelou, isTrue);
      expect(
        s.listagens,
        2,
        reason: 'REPROVA: a lista nao foi recarregada depois do cancelamento, '
            'e a tela ficou mostrando o encontro como se nada tivesse '
            'acontecido.',
      );
      expect(
        find.text('Cancelado'),
        findsOneWidget,
        reason: 'REPROVA: a palavra `Cancelado` nao apareceu. E ela que diz '
            'que o cancelamento valeu -- cancelar nao apaga, e o encontro '
            'continua na lista.',
      );
      expect(
        find.text(TextosDoCancelamento.confirmar),
        findsNothing,
        reason: 'REPROVA: o botao `Cancelar o encontro` continua na tela sobre '
            'um encontro JA cancelado. O servidor recusaria com '
            '`event_not_published`, depois de a pessoa ter confirmado.',
      );
    });

    testWidgets('o gesto de fechar a folha NAO cancela nada', (tester) async {
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(TextosDoCancelamento.manter));
      await tester.pumpAndSettle();

      expect(s.cancelou, isFalse);
      expect(s.ifMatchRecebidos, isEmpty);
    });

    testWidgets('200 SEM `ETag` nao manda `If-Match` vazio: a tela avisa',
        (tester) async {
      // O 428 que isto evita pareceria defeito do servidor. A tela prefere
      // dizer que nao deu a mandar uma precondicao que ela nao tem.
      _superficieAlta(tester);
      final s = _Servidor(etagDaLeitura: null);
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDestrutiva), findsNothing);
      expect(s.ifMatchRecebidos, isEmpty);
      expect(find.textContaining('confirmar a versão'), findsOneWidget);
    });
  });

  group('ISCA (d) — o 412 diz o que resolve, e nao "algo deu errado"', () {
    testWidgets('o 412 diz para recarregar, e nao a faixa generica',
        (tester) async {
      // `precondition-failed` ganhou entrada propria em `MensagensDeErro`
      // (19/10). Sem ela o 412 chegava como `desconhecido` e a tela dizia
      // "algo deu errado" -- a frase que esconde justamente o que resolve.
      _superficieAlta(tester);
      final s = _Servidor(
        cancelamento: problema('precondition-failed', 412),
      );
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(FolhaDestrutiva),
          matching: find.text(TextosDoCancelamento.confirmar),
        ),
      );
      await tester.pumpAndSettle();

      // A FOLHA NAO FECHA: nada foi cancelado, e fechar devolveria a pessoa
      // para uma lista inalterada sem dizer por que.
      expect(find.byType(FolhaDestrutiva), findsOneWidget);
      expect(s.cancelou, isFalse);

      final textos = _textosDaTela(tester).map(_semAcento).toList();
      expect(
        textos.any((t) => t.contains('recarregue para ver como ele esta')),
        isTrue,
        reason: 'REPROVA: o 412 nao disse o que resolve. O texto medido e '
            '"Alguem mexeu neste evento enquanto voce olhava. Recarregue '
            'para ver como ele esta agora."',
      );
      expect(
        textos.any((t) => t.contains('algo deu errado')),
        isFalse,
        reason: 'REPROVA: a faixa generica apareceu. Ela e o defeito que a '
            'entrada de `precondition-failed` existe para evitar.',
      );
    });

    testWidgets('o 404 do `getMyNetworkEvent` nao abre folha nenhuma',
        (tester) async {
      // Encontro inexistente, de outra pessoa, do painel e retirado respondem
      // o MESMO 404 (ADR-0021), e o texto da tela vale nos quatro ao mesmo
      // tempo porque fala da CONTA e nunca do registro.
      _superficieAlta(tester);
      final s = _Servidor(leituraDoDono: problema('not-found', 404));
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDestrutiva), findsNothing);
      expect(s.ifMatchRecebidos, isEmpty);
      expect(find.text(MeusEventos.saiuDaConta), findsOneWidget);
    });
  });

  group('ISCA (f) — a folha diz o que acontece, e nao inventa aviso', () {
    testWidgets('a folha de confirmacao aparece ANTES de qualquer cancelamento',
        (tester) async {
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDestrutiva), findsOneWidget);
      expect(
        s.ifMatchRecebidos,
        isEmpty,
        reason: 'REPROVA: o cancelamento saiu ANTES da confirmacao. Cancelar '
            'um encontro afeta quem ia, e nao ha operacao de desfazer.',
      );
      expect(find.text(TextosDoCancelamento.titulo), findsOneWidget);
    });

    testWidgets('a folha NAO afirma que alguem foi avisado', (tester) async {
      // POR QUE ESTA ISCA EXISTE, medido: nada e enviado a ninguem no
      // cancelamento. `EncontroDaComunidade.cancelar` grava o estado, o
      // instante e a nota, e registra a trilha -- nao ha mensagem de sistema,
      // nao ha trabalho enfileirado e nao ha envio. E o push esta bloqueado em
      // producao por falta de permissao da conta de servico, e nao funciona
      // nenhum no iPhone do cliente.
      //
      // A VARREDURA E PELA CLASSE, e nao pela frase: qualquer forma de afirmar
      // aviso cai nela. Um caso preso a uma frase ficaria verde no dia em que
      // alguem reescrevesse a linha com outras palavras e a mesma promessa,
      // que e a forma mais provavel de o defeito voltar. "descobre quando
      // abrir a agenda" NAO cai: ela descreve como a pessoa fica sabendo, e
      // nao um envio.
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);

      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();

      // Ancora: sem ela a varredura olharia uma tela sem folha e passaria.
      expect(
        find.byType(FolhaDestrutiva),
        findsOneWidget,
        reason: 'REPROVA: a folha nao abriu, e a varredura abaixo estaria '
            'olhando outra tela.',
      );

      final afirmacoes = RegExp(
        'avisamos|avisaremos|sera avisad|serao avisad|foi avisad|foram avisad|'
        'notificamos|sera notificad|serao notificad|recebem aviso|'
        'recebera aviso|receberao aviso|mandamos|enviamos|aviso e enviado',
      );
      final suspeitas = _textosDaTela(tester)
          .map(_semAcento)
          .where(afirmacoes.hasMatch)
          .toList();
      expect(
        suspeitas,
        isEmpty,
        reason: 'REPROVA: a folha afirma aviso que nao sai:\n  '
            '${suspeitas.join('\n  ')}\n'
            'Nada e enviado no cancelamento, e o push esta bloqueado em '
            'producao. Esta casa ja pagou por esta classe de defeito: o '
            'servidor devolvia `owner_notified: true`, a tela afirmava isso '
            'em texto fixo e o desserializador tinha `?? true`.',
      );

      // O CASO POSITIVO, junto: portao que reprova tudo some do CI tao rapido
      // quanto portao que aprova tudo. Apagar a linha inteira faria a
      // varredura passar, e a pessoa ficaria sem saber como quem ia descobre.
      final textos = _textosDaTela(tester).map(_semAcento).toList();
      expect(
        textos.any((t) => t.contains('ninguem recebe aviso')),
        isTrue,
        reason: 'REPROVA: a folha deixou de dizer que ninguem e avisado. '
            'Calar isso nao e melhor que mentir: quem cancela precisa saber '
            'que vai ter de contar as pessoas.',
      );
      expect(
        textos.any((t) => t.contains('descobre quando abrir a agenda')),
        isTrue,
        reason: 'REPROVA: a folha nao diz COMO quem ia fica sabendo.',
      );
    });

    testWidgets('o botao de dispensar nao se chama `Cancelar`', (tester) async {
      // Numa folha cujo botao destrutivo se chama `Cancelar o encontro`, um
      // `Cancelar` ao lado e a pior palavra possivel: os dois toques leem
      // igual e fazem o contrario um do outro.
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);
      await tester.tap(find.text(TextosDoCancelamento.confirmar).first);
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: find.byType(FolhaDestrutiva),
          matching: find.text('Cancelar'),
        ),
        findsNothing,
      );
      expect(find.text(TextosDoCancelamento.manter), findsOneWidget);
    });
  });

  group('a capa: o unico lugar que conta que a foto foi recusada', () {
    testWidgets('a capa recusada mostra o motivo DO SERVIDOR', (tester) async {
      // O buraco que outra frente mediu e relatou sem poder fechar: a capa
      // sobe no mesmo `POST` de criar, o processador pode recusa-la depois do
      // `201`, e `NetworkEventPublic` nao tem `rejection_reason`. Esta lista e
      // o lugar.
      _superficieAlta(tester);
      final s = _Servidor(
        encontro: _meuEncontro(
          capa: <String, dynamic>{
            'status': 'rejected',
            'url': null,
            'rejection_reason': _motivoDaRecusa,
          },
        ),
      );
      await _abrirPelaFotoDaBarra(tester, s);

      final textos = _textosDaTela(tester);
      expect(
        textos.any((t) => t.contains(_motivoDaRecusa)),
        isTrue,
        reason: 'REPROVA: o motivo do servidor nao esta na tela. Sem ele a '
            'pessoa nao sabe se o problema foi o formato, a dimensao minima '
            'ou um arquivo truncado -- e portanto nao sabe o que consertar.',
      );
      expect(textos.any((t) => t.contains(_rotuloDaRecusa)), isTrue);
    });

    testWidgets('a capa PRONTA nao diz nada sobre recusa', (tester) async {
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);

      final textos = _textosDaTela(tester);
      expect(textos.any((t) => t.contains(_rotuloDaRecusa)), isFalse);
      expect(textos.any((t) => t.contains(_motivoDaRecusa)), isFalse);
    });

    testWidgets('`processing` tambem nao diz recusa: "ainda nao" nao e "nunca"',
        (tester) async {
      _superficieAlta(tester);
      final s = _Servidor(
        encontro: _meuEncontro(
          capa: <String, dynamic>{
            'status': 'processing',
            'url': null,
            'rejection_reason': null,
          },
        ),
      );
      await _abrirPelaFotoDaBarra(tester, s);
      final textos = _textosDaTela(tester);
      expect(
        textos.any((t) => t.contains(_rotuloDaRecusa)),
        isFalse,
      );
      // **E A TELA DIZ O QUE ESTA ACONTECENDO.** Este caso media so a ausencia
      // da recusa, e por isso a tela podia ficar completamente calada e passar
      // -- que era o estado do produto quando o cliente relatou o falso
      // problema em 26/10/2026.
      expect(
        textos.any((t) => t.contains(_rotuloDoPreparo)),
        isTrue,
        reason: 'REPROVA: em `processing` a tela nao diz nada. Com `url` nula o '
            'cartao desenha o banner da marca, que e o MESMO desenho de um '
            'encontro sem capa -- quem acabou de enviar uma foto conclui que o '
            'envio falhou. Foi o relato do cliente de 26/10/2026, e o envio '
            'tinha funcionado.',
      );
    });

    testWidgets('a capa PRONTA nao diz que esta sendo preparada', (tester) async {
      // O outro lado da isca acima: a frase do preparo tem de sair da tela
      // quando a derivada chega. Uma faixa que ficasse para sempre diria que a
      // foto nunca entrou, num encontro cuja foto esta ali desenhada.
      _superficieAlta(tester);
      final s = _Servidor();
      await _abrirPelaFotoDaBarra(tester, s);

      expect(
        _textosDaTela(tester).any((t) => t.contains(_rotuloDoPreparo)),
        isFalse,
        reason: 'REPROVA: a capa esta `ready` com URL e a tela ainda diz que a '
            'foto esta sendo preparada.',
      );
    });

    testWidgets(
      'ISCA: recusa SEM motivo fica calada -- a frase generica nunca sai sozinha',
      (tester) async {
        // O contrato promete motivo em toda recusa e o banco o cobra
        // (`catalog_images_recusada_tem_motivo`). Se ele vier nulo, a tela fica
        // calada em vez de desenhar uma faixa que diz "foi recusada" e nao diz
        // por que -- que e a frase que nao ajuda ninguem, e era o estado
        // anterior do produto.
        _superficieAlta(tester);
        final s = _Servidor(
          encontro: _meuEncontro(
            capa: <String, dynamic>{
              'status': 'rejected',
              'url': null,
              'rejection_reason': null,
            },
          ),
        );
        await _abrirPelaFotoDaBarra(tester, s);

        expect(
          _textosDaTela(tester).any((t) => t.contains(_rotuloDaRecusa)),
          isFalse,
          reason: 'REPROVA: a tela escreveu "a foto foi recusada" sem o '
              'motivo. Texto generico e o que esta entrega existe para nao '
              'fazer.',
        );
        // E o encontro continua inteiro na tela: a capa calada nao esconde o
        // resto.
        expect(find.text(_titulo), findsOneWidget);
      },
    );

    test('o modelo le os tres estados e o nulo do contrato', () {
      // A metade de unidade: `EstadoDaCapa.porCodigo` devolve nulo para codigo
      // desconhecido, e nao um estado de reserva -- versao antiga do app
      // continua no bolso de alguem quando o servidor ganhar um estado novo.
      expect(EstadoDaCapa.porCodigo('ready'), EstadoDaCapa.pronta);
      expect(EstadoDaCapa.porCodigo('processing'), EstadoDaCapa.processando);
      expect(EstadoDaCapa.porCodigo('rejected'), EstadoDaCapa.recusada);
      expect(EstadoDaCapa.porCodigo('quarantined'), isNull);
      expect(CapaDoMeuEncontro.doJson(null), isNull);

      // `emPreparo` so em `processing`, e **nao** no estado desconhecido: uma
      // versao antiga do app que caia em `emPreparo` para um `quarantined`
      // futuro prometeria uma foto que nao vem.
      CapaDoMeuEncontro capaDe(String? estado) => CapaDoMeuEncontro.doJson(
            <String, dynamic>{
              'status': estado,
              'url': null,
              'rejection_reason': null,
            },
          )!;
      expect(capaDe('processing').emPreparo, isTrue);
      expect(capaDe('ready').emPreparo, isFalse);
      expect(capaDe('rejected').emPreparo, isFalse);
      expect(capaDe('quarantined').emPreparo, isFalse);
    });
  });
}
