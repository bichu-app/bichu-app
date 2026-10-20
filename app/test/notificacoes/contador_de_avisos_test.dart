// AS ISCAS DO NUMERO DO SINO (19/10/2026).
//
// `ContadorDeAvisos` e o objeto que faltava: a rota
// `GET /v1/me/notifications/count` e `NotificacoesApi.contar()` existiam, e
// **nenhuma linha de `lib/` as chamava** -- o sino da barra de topo era montado
// com `naoLidas` nulo por falta de fonte.
//
// Este arquivo cobra as regras que nao se veem na tela, e cada uma delas falha
// em silencio quando quebra:
//
//   1. **Falha de rede NAO vira numero.** O jeito de quebrar isto e um `catch`
//      que devolva zero -- e zero e a afirmacao "voce nao tem aviso nenhum".
//      Quem tem trinta avisos deixaria de ve-los por estar num elevador, e
//      nada na tela indicaria que houve falha: o sino simplesmente ficaria
//      limpo. `notificacoes_api.dart` proibe por escrito somar no aparelho
//      pelo mesmo motivo -- duas contas divergem entre dois aparelhos da mesma
//      pessoa.
//   2. **O numero e da CONTA e nao sobrevive ao logout** -- nem a uma resposta
//      que chega DEPOIS dele, que e o caso que a geracao cobre. O sintoma
//      seria o proximo tutor neste aparelho abrindo o app com o `3` da pessoa
//      anterior pintado no sino.
//   3. **Zero so vem do servidor.** `zerarPorqueAListaFoiVista` publica zero
//      porque `markNotificationsListSeen` acabou de zerar no servidor; nao e
//      um palpite do aparelho.
//
// A politica de atualizacao -- os quatro momentos em que o numero e buscado --
// esta escrita em `ContadorDeAvisos` e exercitada pelo app inteiro em
// `test/telas/navegacao_mensagens_e_avatar_test.dart`, grupo `(b2)`.
import 'dart:async';
import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/notificacoes_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/contador_de_avisos.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

/// O caminho de `getNotificationCount` no contrato.
const String _rota = '/v1/me/notifications/count';

/// O nome do grupo da isca do logout, escrito uma vez so.
///
/// Ele e CITADO por `iscasDaLista` em `test/sessao/limpezas_ao_sair_test.dart`,
/// e aquele portao reprova quando o registro aponta para um grupo que nao
/// existe. Constante, e nao literal repetido, para renomear o grupo nao deixar
/// o registro apontando para o nada.
const String grupoDaIscaDoLogout =
    'ISCA — o numero do sino nao sobrevive ao logout';

/// Um contador sobre a rede que o caso descrever.
///
/// O caminho e o de verdade -- tela, [NotificacoesApi], `ApiClient` e traducao
/// de `Problem` --, e nao um duble de contador: um duble continuaria verde no
/// dia em que `contar()` mudasse de rota.
ContadorDeAvisos contadorSobre(
  Future<http.Response> Function(http.Request) rede,
) {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
    cliente: MockClient(rede),
    tokenDeAcesso: () async => 'token-de-teste',
  );
  addTearDown(api.fechar);
  final contador = ContadorDeAvisos(notificacoes: NotificacoesApi(api));
  addTearDown(contador.dispose);
  return contador;
}

http.Response _contagem(int naoLidos) => http.Response(
      jsonEncode(<String, dynamic>{'unread_total': naoLidos}),
      200,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

/// O `Problem` do contrato, e nao um 500 nu: e o formato que o `ApiClient`
/// traduz, e e por ele que a falha chega como `FalhaDeChamada`.
http.Response _problema(int status) => http.Response(
      jsonEncode(<String, dynamic>{
        'type': 'https://bichu.app/problems/server-error',
        'title': 'erro',
        'status': status,
      }),
      status,
      headers: const <String, String>{
        'content-type': 'application/problem+json; charset=utf-8',
      },
    );

void main() {
  test('nasce NULO, e nulo nao e zero', () {
    final contador = contadorSobre((_) async => _contagem(0));

    expect(
      contador.naoLidas,
      isNull,
      reason: 'REPROVA: o contador nasceu com numero. Antes da primeira '
          'resposta o app nao sabe quantos avisos ha, e um zero inicial faria '
          'o sino afirmar caixa vazia no instante entre abrir o app e o '
          'servidor responder.',
    );
  });

  test('o numero do servidor e publicado, e os ouvintes sao avisados',
      () async {
    final contador = contadorSobre((req) async {
      expect(req.url.path, _rota, reason: 'REPROVA: chamou outra rota.');
      expect(req.method, 'GET');
      return _contagem(12);
    });
    var avisos = 0;
    contador.addListener(() => avisos += 1);

    await contador.atualizar();

    expect(contador.naoLidas, 12);
    expect(
      avisos,
      1,
      reason: 'REPROVA: o numero mudou e ninguem foi avisado. A barra de topo '
          'le este objeto por `ListenableBuilder`: sem a notificacao o sino '
          'continua pintando o numero anterior ate a tela reconstruir por '
          'outro motivo.',
    );
  });

  test('ISCA: falha de rede MANTEM o numero anterior, e nunca vira zero',
      () async {
    // **A isca que mais importa deste arquivo.** Um `catch` que devolvesse
    // zero deixaria a suite verde e esconderia, de quem tem doze avisos, que
    // eles existem -- por ter passado por um tunel.
    var respondeBem = true;
    final contador = contadorSobre(
      (_) async => respondeBem ? _contagem(12) : _problema(503),
    );

    await contador.atualizar();
    expect(contador.naoLidas, 12);

    respondeBem = false;
    await contador.atualizar();

    expect(
      contador.naoLidas,
      12,
      reason: 'REPROVA: a falha mexeu no numero. Sem rede o app nao sabe '
          'nada de novo, e o que ele sabia continua valendo: `0` aqui seria a '
          'afirmacao de que a caixa esta vazia, e `null` jogaria fora um '
          'numero correto por causa de um tunel.',
    );
  });

  test('ISCA: a PRIMEIRA falha mantem NULO, e nao zero', () async {
    // O outro lado da isca acima, e o estado mais comum em aparelho real:
    // abriu o app sem sinal. Zero aqui seria o sino afirmando caixa vazia sem
    // nunca ter conseguido perguntar.
    final contador = contadorSobre((_) async => _problema(503));

    await contador.atualizar();

    expect(
      contador.naoLidas,
      isNull,
      reason: 'REPROVA: a falha virou numero. Nulo e "nao consegui perguntar" '
          'e nao pinta distintivo; zero seria "nao ha nada", que o app nao '
          'tem como saber.',
    );
  });

  test('ISCA: corpo 200 fora do contrato tambem nao vira zero', () async {
    // `unread_total` ausente e falha de LEITURA, nao contagem zero -- a mesma
    // distincao que a caixa faz ao recusar virar lista vazia.
    var respondeBem = true;
    final contador = contadorSobre((_) async {
      if (respondeBem) return _contagem(7);
      return http.Response(
        jsonEncode(<String, dynamic>{'outra_coisa': 1}),
        200,
        headers: const <String, String>{
          'content-type': 'application/json; charset=utf-8',
        },
      );
    });

    await contador.atualizar();
    expect(contador.naoLidas, 7);

    respondeBem = false;
    await contador.atualizar();

    expect(
      contador.naoLidas,
      7,
      reason: 'REPROVA: corpo fora do contrato derrubou o numero. Ele e falha '
          'de leitura, e nao a afirmacao de que a caixa esvaziou.',
    );
  });

  test('a caixa vista publica ZERO, e isso vem do servidor', () async {
    // Nao e palpite: `markNotificationsListSeen` zera o contador NO SERVIDOR,
    // e quem chama este metodo e o caminho de sucesso daquela chamada. Zero
    // aqui e repetir o que o servidor acabou de dizer.
    final contador = contadorSobre((_) async => _contagem(12));
    await contador.atualizar();
    expect(contador.naoLidas, 12);

    contador.zerarPorqueAListaFoiVista();

    expect(contador.naoLidas, 0);
  });

  test('o logout volta a NULO, e nao a zero', () async {
    final contador = contadorSobre((_) async => _contagem(12));
    await contador.atualizar();

    contador.limpar();

    expect(
      contador.naoLidas,
      isNull,
      reason: 'REPROVA: o logout deixou zero. Zero diria a quem entrar neste '
          'aparelho que nao ha aviso nenhum na conta DELA, sobre uma conta '
          'que o app nunca consultou.',
    );
  });

  test('ISCA: a resposta que chega DEPOIS do logout nao repinta o numero '
      'da pessoa anterior', () async {
    // **O caso que a geracao existe para cobrir, e ele e de VAZAMENTO.**
    //
    // `sair()` roda as limpezas enquanto uma busca disparada pela retomada
    // pode estar no ar. Sem a trava, a resposta chega depois da limpeza e
    // repinta no sino o numero de quem acabou de sair -- e a proxima pessoa a
    // entrar neste aparelho ve o `12` da anterior e toca nele esperando
    // avisos que nao sao dela.
    final portao = Completer<http.Response>();
    final contador = contadorSobre((_) => portao.future);

    final busca = contador.atualizar();
    // A sessao cai com a busca no ar: e a ordem exata do `sair()`.
    contador.limpar();
    expect(contador.naoLidas, isNull);

    portao.complete(_contagem(12));
    await busca;

    expect(
      contador.naoLidas,
      isNull,
      reason: 'REPROVA: o numero da conta anterior voltou ao sino depois do '
          'logout. A busca que estava no ar publicou por cima da limpeza.',
    );
  });

  test('ISCA: a resposta que chega DEPOIS de a caixa ser vista nao reacende '
      'o distintivo', () async {
    // Mesma trava, outro lado: a busca comecou ANTES de a caixa ser aberta,
    // entao o numero dela ja nasceu velho. Sem a geracao, ela chegaria depois
    // e reacenderia o distintivo que a pessoa acabou de limpar abrindo a
    // caixa -- com a caixa aberta na frente dela.
    final portao = Completer<http.Response>();
    final contador = contadorSobre((_) => portao.future);

    final busca = contador.atualizar();
    contador.zerarPorqueAListaFoiVista();

    portao.complete(_contagem(12));
    await busca;

    expect(
      contador.naoLidas,
      0,
      reason: 'REPROVA: o distintivo reacendeu com um numero anterior a '
          'abertura da caixa. O servidor ja zerou em `seen`; a resposta no ar '
          'e de antes disso.',
    );
  });

  // ------------------------------------------------------------------------
  // A ISCA DA ENTRADA EM `limpezasAoSair`, pelo EFEITO e com o app montado.
  //
  // O registro de `test/sessao/limpezas_ao_sair_test.dart` cobra uma isca por
  // entrada daquela lista, e cobra bem: entrada sem isca e entrada que uma
  // refatoracao apaga amanha sem nenhum caso ficar vermelho.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoLogout, () {
    testWidgets('depois de `sair()`, o contador do app esta como recem-criado',
        (tester) async {
      // **ESTE CASO NAO MEDE O SINO PINTADO, e a razao e que isso passaria
      // por VACUIDADE.** Deslogado, `SinoDeNotificacoes` devolve
      // `SizedBox.shrink`: nao ha glifo nem distintivo para achar, entao
      // "nenhum numero na tela" ficaria verde com o numero da pessoa anterior
      // intacto no objeto -- esperando o proximo login para voltar a pintar.
      //
      // O que importa e o OBJETO, que vive enquanto o processo viver. E o
      // mesmo formato de defeito que o cofre do QR e o cache de `Meus pets`
      // tiveram: a tela e descartada e a entrada FICA.
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: (req) async {
          if (req.url.path == _rota && req.method == 'GET') {
            return json200(<String, dynamic>{'unread_total': 12});
          }
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
            return http.Response('', 204);
          }
          return http.Response('', 404);
        },
      );

      final contador = escopoDoApp(tester).contadorDeAvisos;
      expect(
        contador.naoLidas,
        12,
        reason: 'REPROVA: este caso nao comeca com numero no contador, entao '
            'a limpeza medida abaixo nao prova nada. Ou o arranque nao esta '
            'buscando a contagem, ou a rede de mentira nao esta respondendo.',
      );

      // `sair()` pelo CONTROLADOR, e nao pelo botao: sao quatro desfechos de
      // saida e um deles -- a sessao derrubada por refresh recusado -- nao
      // passa por tela nenhuma. Foi assim que o cache de pets sobreviveu
      // quando a limpeza morava no `onPressed`.
      await escopoDoApp(tester).sessao.sair();
      await tester.pumpAndSettle();

      expect(
        contador.naoLidas,
        isNull,
        reason: 'REPROVA: o numero de avisos da pessoa que acabou de sair '
            'continua no contador, e o contador vive enquanto o processo '
            'viver. O proximo tutor neste aparelho -- o celular da recepcao '
            'do pet shop, o do casal, o usado que acabou de ser vendido -- '
            'entra e ve `9+` no sino sobre avisos que nao sao dele, e toca '
            'nele para ler. E NULO e nao zero: zero afirmaria que a caixa '
            'DELE esta vazia, sobre uma conta que o app nunca consultou.',
      );
    });
  });

  test('a ULTIMA busca que COMECOU e a que publica, e nao a que chega '
      'primeiro', () async {
    // Duas retomadas encavaladas (o app voltando ao primeiro plano duas vezes
    // em sequencia rapida). Se a primeira responder DEPOIS da segunda, o sino
    // acabaria com o numero mais velho dos dois.
    final primeira = Completer<http.Response>();
    final segunda = Completer<http.Response>();
    var vez = 0;
    final contador = contadorSobre(
      (_) => (vez++ == 0) ? primeira.future : segunda.future,
    );

    final a = contador.atualizar();
    final b = contador.atualizar();

    segunda.complete(_contagem(5));
    await b;
    expect(contador.naoLidas, 5);

    primeira.complete(_contagem(99));
    await a;

    expect(
      contador.naoLidas,
      5,
      reason: 'REPROVA: a resposta da busca mais VELHA publicou por cima da '
          'mais nova. Publica a ultima que comecou, e nao a ultima que '
          'chegou.',
    );
  });
}
