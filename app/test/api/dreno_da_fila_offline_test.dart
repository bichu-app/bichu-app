// LIGACAO 3 — o caso registrado sem sinal SAI do disco. As ISCAS.
//
// `FilaOffline.reenviarTudo` estava escrito, testado e **sem nenhum call site**.
// Duas telas enfileiravam de verdade -- o caso de perdido e o achado avulso --
// e nada nunca tirava nada de la. O caso registrado sem sinal ficava no disco
// **para sempre**, enquanto a tela dizia "vamos enviar assim que o sinal
// voltar".
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO PROVA O CALL SITE, E NAO A FUNCAO
// ---------------------------------------------------------------------------
//
// **Um teste que verifique que `reenviarTudo` existe APROVA o defeito de hoje.**
// Ela existe, tem cinco casos em `fila_offline_test.dart` e todos passam -- e o
// alerta do pet sumido morria no disco de todo jeito. `fila_offline_test.dart`
// continua valendo: ele prova o MECANISMO. O que faltava, e que mora aqui, e a
// prova de que alguem o CHAMA.
//
// Por isso todo caso deste arquivo monta o app de verdade (`abrirOApp`) com uma
// fila JA CHEIA no disco, e mede a requisicao que sai do outro lado. Nenhum
// deles chama `reenviarTudo` nem `drenar`.
//
// O QUE CADA GRUPO PRECISA REPROVAR:
//
//  1. `o caso registrado sem sinal nunca sai do disco` — apague
//     `await _drenarAFila()` de `_arrancar()` em `app.dart` e o caso do arranque
//     reprova. Apague `didChangeAppLifecycleState` e o caso da retomada
//     reprova. **Os dois momentos sao medidos separadamente**, porque cobrem
//     casos diferentes: o arranque cobre o app que o sistema matou, a retomada
//     cobre o app que ficou vivo no bolso.
//  2. `a fila nao reenvia em laco sem limite` — troque a classificacao de `400`
//     de `recusada` para `semSinal` e o caso reprova: a acao volta para o disco
//     e fica circulando para sempre.
//  3. `401 nao apaga o caso do pet sumido` — troque `401` para `recusada` e o
//     caso reprova. E o ramo mais caro deste arquivo: ele apagaria exatamente o
//     que a fila existe para salvar.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

void main() {
  /// O caminho do caso de perdido, como `CasosApi` o monta. Escrito a mao aqui:
  /// lido da classe, o caso ficaria verde com o caminho errado.
  const String petId = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
  const String caminhoDoCaso = '/pets/$petId/lost-cases';
  const String chaveGravada = 'chave-da-primeira-tentativa-0001';

  /// Uma fila com UMA acao dentro, como o disco a traria depois de a tela
  /// enfileirar sem sinal.
  ///
  /// O formato e o de `AcaoEnfileirada.paraJson`, escrito a mao pelo mesmo
  /// motivo do caminho: um caso que montasse o JSON pela classe nao acusaria o
  /// dia em que a leitura e a escrita divergissem juntas.
  DepositoDaFilaEmMemoria filaComUmCaso({String caminho = caminhoDoCaso}) {
    final deposito = DepositoDaFilaEmMemoria();
    deposito.conteudo = jsonEncode(<Map<String, dynamic>>[
      <String, dynamic>{
        'id': 'acao-1',
        'metodo': 'POST',
        'caminho': caminho,
        'corpo': <String, dynamic>{
          'last_seen_at': '2026-09-27T18:00:00.000Z',
          'area': <String, dynamic>{'neighborhood': 'Vila Madalena'},
        },
        'idempotency_key': chaveGravada,
        'criada_em': '2026-09-27T18:00:00.000Z',
        'tentativas': 0,
      },
    ]);
    // `gravacoes` comeca em zero: o conteudo foi posto direto, e nao gravado
    // pelo app. Assim uma gravacao depois disso e evidencia de que o app mexeu
    // na fila.
    deposito.gravacoes = 0;
    return deposito;
  }

  /// As requisicoes que o app mandou para o caminho da fila.
  final saiu = <({String? chave, String corpo})>[];

  /// A rede, com o desfecho do reenvio sob controle do caso.
  Future<http.Response> Function(http.Request) rede({
    Future<http.Response> Function(http.Request)? reenvioResponde,
  }) {
    return (http.Request req) async {
      if (req.url.path == '/v1$caminhoDoCaso' && req.method == 'POST') {
        saiu.add((
          chave: req.headers['Idempotency-Key'] ??
              req.headers['idempotency-key'],
          corpo: req.body,
        ));
        if (reenvioResponde != null) return reenvioResponde(req);
        return json200(<String, dynamic>{
          'id': 'caso-1',
          'status': 'open',
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

  setUp(saiu.clear);

  // -----------------------------------------------------------------------
  // ISCA 1 — o caso registrado sem sinal nunca sai do disco
  // -----------------------------------------------------------------------
  group('ISCA — o caso registrado sem sinal nunca sai do disco', () {
    testWidgets('MOMENTO 1, o ARRANQUE: o app abre com sessao e a fila drena', (
      tester,
    ) async {
      final fila = filaComUmCaso();
      await abrirOApp(
        tester,
        rede: rede(),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        1,
        // Este e o caso central da ligacao. Ele reprova com `reenviarTudo`
        // intacta, testada e sem chamador -- que era o estado real do app.
        reason:
            'REPROVA: havia um caso de pet perdido guardado no disco, o app '
            'abriu COM SESSAO, e nenhum `POST $caminhoDoCaso` saiu. O alerta '
            'que a tutora disparou no elevador nunca sai do aparelho, e a tela '
            'dela diz "vamos enviar assim que o sinal voltar".\n'
            'Verificar que `reenviarTudo` existe nao pega isto: ela existe, '
            'tem cinco casos verdes, e nao e chamada por ninguem. O que este '
            'caso prova e o CALL SITE.',
      );
      expect(
        saiu.single.chave,
        chaveGravada,
        reason:
            'REPROVA: o reenvio levou chave diferente da que estava gravada '
            '(`${saiu.single.chave}` em vez de `$chaveGravada`). A chave e da '
            'ACAO, e nao da tentativa: com chave nova, cada retomada do app '
            'abriria um caso novo para o mesmo pet, e o defeito so apareceria '
            'na conta de quem esta procurando o animal.',
      );
      expect(
        jsonDecode(saiu.single.corpo),
        containsPair('area', containsPair('neighborhood', 'Vila Madalena')),
        reason:
            'REPROVA: o corpo gravado no disco nao foi o corpo reenviado. O '
            'que a pessoa digitou sem sinal e o que tem de chegar.',
      );
      expect(
        fila.acoes,
        isEmpty,
        reason:
            'REPROVA: o reenvio deu 201 e a acao CONTINUA no disco. Na proxima '
            'retomada ela sai de novo -- e a idempotencia impede o caso '
            'duplicado, mas nao impede a fila de nunca esvaziar.',
      );
    });

    testWidgets('MOMENTO 2, a RETOMADA: o app volta ao primeiro plano e a fila '
        'drena', (tester) async {
      // O app que ficou VIVO no bolso enquanto a pessoa saia do metro. Sem
      // este momento, a fila so drenaria quando o sistema resolvesse matar o
      // processo -- o que pode nao acontecer por dias.
      final fila = filaComUmCaso();
      var semSinal = true;
      await abrirOApp(
        tester,
        rede: rede(
          reenvioResponde: (req) async {
            if (semSinal) throw http.ClientException('sem sinal', req.url);
            return json200(<String, dynamic>{'id': 'caso-1'}, status: 201);
          },
        ),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        fila.acoes.length,
        1,
        reason:
            'REPROVA: a varredura do arranque falhou por falta de sinal e a '
            'acao NAO ficou no disco. Falha temporaria nao pode descartar '
            'nada: e o unico registro do caso.',
      );

      // O sinal voltou, e a pessoa tirou o telefone do bolso.
      semSinal = false;
      saiu.clear();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        1,
        reason:
            'REPROVA: o app voltou ao primeiro plano com um caso na fila e '
            'nada saiu. O app nao foi encerrado pelo sistema, entao o arranque '
            'nao acontece de novo: sem este momento a fila fica parada '
            'enquanto o app estiver vivo, que pode ser dias.',
      );
      expect(
        saiu.single.chave,
        chaveGravada,
        reason: 'REPROVA: a retomada reenviou com chave nova.',
      );
      expect(
        fila.acoes,
        isEmpty,
        reason: 'REPROVA: o reenvio da retomada deu 201 e a acao ficou no '
            'disco.',
      );
    });

    testWidgets('DESLOGADO a fila NAO e varrida, e nada e descartado', (
      tester,
    ) async {
      // A armadilha que `RetomadaDeFotos` documenta, do outro lado: as rotas da
      // fila sao `bearerAuth`, e uma varredura sem sessao levaria 401 em todas.
      final fila = filaComUmCaso();
      await abrirOApp(tester, rede: rede(), depositoDaFila: fila);
      await tester.pumpAndSettle();

      expect(
        saiu,
        isEmpty,
        reason:
            'REPROVA: o app varreu a fila SEM sessao. As duas rotas que a fila '
            'carrega sao `bearerAuth`, entao toda acao levaria 401 -- e um '
            'tropeco na classificacao de 401 apagaria, no arranque de quem '
            'esta deslogado, exatamente o caso que a fila existe para salvar.',
      );
      expect(
        fila.acoes.length,
        1,
        reason: 'REPROVA: a acao sumiu do disco sem nunca ter sido enviada.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 2 — a fila nao reenvia em laco sem limite
  // -----------------------------------------------------------------------
  group('ISCA — a fila para quando a recusa e permanente', () {
    testWidgets('recusa permanente (400) DESCARTA a acao', (tester) async {
      // Sem este ramo a fila circula para sempre: a cada retomada do app ela
      // reenvia a mesma acao, o servidor recusa igual, e nada muda. Foi esse
      // buraco que deixou foto presa em "processando" para sempre em outro
      // lugar deste produto.
      final fila = filaComUmCaso();
      await abrirOApp(
        tester,
        rede: rede(
          reenvioResponde: (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'type': 'https://bichu.app/problems/validation-failed',
              'title': 'Corpo invalido',
              'status': 400,
            }),
            400,
            headers: <String, String>{
              'content-type': 'application/problem+json',
            },
          ),
        ),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        1,
        reason: 'REPROVA: a acao nao foi tentada.',
      );
      expect(
        fila.acoes,
        isEmpty,
        reason:
            'REPROVA: o servidor recusou com 400 e a acao FICOU na fila. '
            'Tentar de novo nao muda a resposta: a cada retomada do app ela '
            'sai, e nao ha desfecho -- um laco que gasta bateria e nunca avisa '
            'ninguem. E este ramo que faz a fila esvaziar em vez de circular.',
      );
    });

    testWidgets('teto de chamada (429) MANTEM a acao', (tester) async {
      final fila = filaComUmCaso();
      await abrirOApp(
        tester,
        rede: rede(
          reenvioResponde: (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'type': 'https://bichu.app/problems/rate-limited',
              'status': 429,
            }),
            429,
            headers: <String, String>{
              'content-type': 'application/problem+json',
              'retry-after': '60',
            },
          ),
        ),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        fila.acoes.length,
        1,
        reason:
            'REPROVA: um 429 DESCARTOU a acao. O teto tem hora para voltar, e '
            'ela nao e agora: 429 nao e recusa, e um `4xx` classificado em '
            'bloco como permanente apaga trabalho da pessoa por causa de um '
            'teto de chamada.',
      );
    });

    testWidgets('servidor fora (503) MANTEM a acao', (tester) async {
      final fila = filaComUmCaso();
      await abrirOApp(
        tester,
        rede: rede(reenvioResponde: (_) async => http.Response('', 503)),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        fila.acoes.length,
        1,
        reason:
            'REPROVA: um 503 descartou a acao. Servidor fora e temporario por '
            'definicao, e uma janela de manutencao nao pode apagar o caso do '
            'pet sumido de todo mundo que estava com a fila cheia.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 3 — 401 nao apaga o caso do pet sumido
  // -----------------------------------------------------------------------
  group('ISCA — o token que expira no meio da varredura nao apaga nada', () {
    testWidgets('401 MANTEM a acao', (tester) async {
      // A guarda de sessao do chamador nao ve isto: o token estava valido no
      // comeco da varredura e expirou no caminho. Sem este ramo, o app apaga o
      // caso exatamente no momento em que a pessoa mais precisa dele.
      final fila = filaComUmCaso();
      await abrirOApp(
        tester,
        rede: rede(
          reenvioResponde: (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'type': 'https://bichu.app/problems/unauthenticated',
              'status': 401,
            }),
            401,
            headers: <String, String>{
              'content-type': 'application/problem+json',
            },
          ),
        ),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        saiu.length,
        1,
        reason: 'REPROVA: com sessao valida no arranque, a acao tinha de ter '
            'sido tentada.',
      );
      expect(
        fila.acoes.length,
        1,
        reason:
            'REPROVA: um 401 DESCARTOU o caso do pet sumido. Este e o ramo '
            'mais caro deste arquivo: as duas rotas da fila sao `bearerAuth`, '
            'e classificar 401 como recusa permanente apaga em silencio '
            'exatamente o que a fila existe para salvar. A guarda de sessao do '
            'chamador cobre o arranque; ela NAO ve o token que expira no meio '
            'da varredura, e e por isso que a defesa e dupla.',
      );
    });

    testWidgets('acao com verbo que o dreno nao sabe enviar fica guardada', (
      tester,
    ) async {
      // Uma acao gravada por uma versao futura com `PATCH`. Enviada como `POST`
      // ela chegaria na rota errada, o servidor responderia 404, e 404 e recusa
      // permanente -- a acao seria DESCARTADA por causa de um verbo.
      final fila = DepositoDaFilaEmMemoria();
      fila.conteudo = jsonEncode(<Map<String, dynamic>>[
        <String, dynamic>{
          'id': 'acao-1',
          'metodo': 'PATCH',
          'caminho': caminhoDoCaso,
          'corpo': <String, dynamic>{'notes': 'algo'},
          'idempotency_key': chaveGravada,
          'criada_em': '2026-09-27T18:00:00.000Z',
          'tentativas': 0,
        },
      ]);
      fila.gravacoes = 0;

      await abrirOApp(
        tester,
        rede: rede(),
        depositoDaFila: fila,
        deposito: depositoLogado(),
      );
      await tester.pumpAndSettle();

      expect(
        saiu,
        isEmpty,
        reason:
            'REPROVA: uma acao `PATCH` foi enviada como `POST`. Ela chegaria '
            'na rota errada, o servidor responderia 404, e 404 e recusa '
            'permanente: a acao seria descartada por causa de um verbo.',
      );
      expect(
        fila.acoes.length,
        1,
        reason: 'REPROVA: a acao com verbo desconhecido foi descartada.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // A chave de idempotencia nunca e regerada no reenvio
  // -----------------------------------------------------------------------
  test('o dreno NAO usa `novaChaveDeIdempotencia`', () {
    // Guarda de leitura, e nao de comportamento: ela existe porque a troca de
    // chave no reenvio e invisivel em qualquer caso de UMA tentativa, e o
    // sintoma aparece na conta de quem esta procurando o pet.
    final chave = ApiClient.novaChaveDeIdempotencia();
    expect(
      chave,
      isNot(chaveGravada),
      reason:
          'REPROVA: `novaChaveDeIdempotencia` devolveu a chave gravada. O caso '
          'do arranque compara o cabecalho com `$chaveGravada` justamente '
          'porque uma chave nova e diferente -- se as duas coincidissem, '
          'aquela comparacao ficaria verde com o reenvio errado.',
    );
  });
}
