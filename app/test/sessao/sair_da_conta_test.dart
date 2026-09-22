/// Sair da conta: o que vai para o servidor, o que sai do aparelho, e por que
/// "sem rede" e "o servidor recusou" nao podem ter o mesmo destino.
///
/// ## O defeito que este arquivo guarda
///
/// O `POST /v1/auth/logout` passou a **exigir** `refresh_token` no corpo e a
/// revogar a familia no servidor (ADR-0002, emenda 1). O app mandava
/// `_api.post('/auth/logout')` -- corpo nenhum -- e `sair()` tinha um
/// `catch (FalhaDeChamada)` unico, que e a superclasse de `FalhaDaApi`,
/// `FalhaDeConexao` e `FalhaDeTempo`.
///
/// O resultado do par: o app manda logout sem corpo, recebe **400**, o `catch`
/// engole calado, a tela diz que a pessoa saiu, e a sessao dela continua viva
/// no servidor por ate 180 dias. Sucesso indistinguivel do nada.
///
/// ## As tres iscas, e o que cada uma precisa reprovar
///
/// 1. `sair()` volta a mandar logout **sem** o `refresh_token`.
/// 2. O `catch` volta a tratar **400 e falta de rede do mesmo jeito**. Esta e a
///    mais importante: foi o `catch` largo que fez o defeito ser invisivel, e
///    um teste que so confira "o corpo foi enviado" fica verde no dia em que
///    alguem mudar o contrato de novo.
/// 3. O **token local sobrevive** ao logout, em qualquer um dos quatro
///    desfechos.
///
/// A isca 2 e conferida em dois lugares de proposito: no valor devolvido por
/// `sair()` e no **canal padrao de producao**. Provar so o valor deixaria
/// passar a variante em que alguem mantem o enum e faz os dois desfechos
/// sairem pelo mesmo canal silencioso.
library;

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/guarda_de_acao.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'http://localhost:3000';
const String _refreshGuardado = 'refresh-da-tutora-com-mais-de-20-caracteres';

Sessao _sessaoAberta() => Sessao(
      accessToken: 'access-da-tutora',
      refreshToken: _refreshGuardado,
      // Longe de expirar: renovar no meio do logout trocaria o refresh que
      // estamos conferindo e o caso passaria a medir outra coisa.
      expiraEm: DateTime.now().add(const Duration(hours: 1)),
      usuario: const Usuario(
        id: 'usuario-de-teste',
        email: 'marina@exemplo.com.br',
        emailVerificado: true,
        pendencias: <PendenciaDeCadastro>[],
        podeAbrirCaso: true,
      ),
    );

http.Response _problem({
  required int status,
  String tipo = 'validation-failed',
}) {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'type': 'https://api.bichu.app/problems/$tipo',
      'title': 'Requisicao invalida',
      'status': status,
      'detail': 'refresh_token e obrigatorio',
    }),
    status,
    headers: <String, String>{
      'content-type': 'application/problem+json; charset=utf-8',
    },
  );
}

/// Monta o caminho inteiro: controlador -> `AuthApi` -> `ApiClient` -> HTTP.
///
/// Nada de dublar `AuthApi`: o que esta em julgamento e **o que sai na rede**,
/// e um dubles de `AuthApi` provaria o controlador contra a assinatura que ele
/// mesmo chama -- que e justamente a peca que estava errada.
({
  ControladorDeSessao sessao,
  DepositoDeSessao deposito,
  List<http.Request> requisicoes,
  List<AvisoDeSaida> avisos,
}) _montar({
  required Future<http.Response> Function(http.Request) responder,
  DepositoDaIntencao? envelope,
  List<LimpezaAoSair> limpezas = const <LimpezaAoSair>[],
  ObservadorDeSaida? observador,
  Duration tempoLimite = const Duration(seconds: 20),
}) {
  AppConfig.limparParaTeste();
  final requisicoes = <http.Request>[];
  final avisos = <AvisoDeSaida>[];
  final deposito = DepositoEmMemoria();

  late final ControladorDeSessao controlador;
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    tempoLimite: tempoLimite,
    tokenDeAcesso: () => controlador.tokenValido(),
    cliente: MockClient((requisicao) {
      requisicoes.add(requisicao);
      return responder(requisicao);
    }),
  );
  controlador = ControladorDeSessao(
    auth: AuthApi(api),
    deposito: deposito,
    guardaDeAcao: envelope == null
        ? null
        : GuardaDeAcao(deposito: envelope, rotaDaTela: (_) => null),
    limpezasAoSair: limpezas,
    observadorDeSaida: observador ?? avisos.add,
  );
  return (
    sessao: controlador,
    deposito: deposito,
    requisicoes: requisicoes,
    avisos: avisos,
  );
}

Future<ControladorDeSessao> _logada(
  ({
    ControladorDeSessao sessao,
    DepositoDeSessao deposito,
    List<http.Request> requisicoes,
    List<AvisoDeSaida> avisos,
  }) montado,
) async {
  await montado.sessao.abrir(_sessaoAberta());
  return montado.sessao;
}

void main() {
  setUp(AppConfig.limparParaTeste);

  group('ISCA 1 — o refresh_token vai no corpo do logout', () {
    test('o corpo enviado carrega o refresh token que estava no chaveiro',
        () async {
      final montado = _montar(
        responder: (_) async => http.Response('', 204),
      );
      await _logada(montado);

      final resultado = await montado.sessao.sair();

      expect(resultado, RevogacaoNoServidor.confirmada);

      final logout = montado.requisicoes
          .where((r) => r.url.path.endsWith('/auth/logout'))
          .toList();
      expect(logout, hasLength(1), reason: 'O logout nao saiu na rede.');

      expect(
        logout.single.body,
        isNotEmpty,
        reason: 'REPROVA: o app mandou logout SEM CORPO. O contrato exige '
            '`refresh_token` e recusa com 400 sem ele; sem corpo, a familia de '
            'refresh continua viva no servidor e a tela mente que a pessoa '
            'saiu.',
      );

      final corpo = jsonDecode(logout.single.body) as Map<String, dynamic>;
      expect(
        corpo['refresh_token'],
        _refreshGuardado,
        reason: 'REPROVA: o campo `refresh_token` nao chegou com o valor '
            'guardado. O servidor precisa dele para saber QUAL familia matar; '
            'qualquer outro nome de campo ou qualquer outro valor e um logout '
            'que nao revoga nada.',
      );
      expect(
        (corpo['refresh_token'] as String).length,
        greaterThanOrEqualTo(20),
        reason: 'O contrato declara `minLength: 20`, espelhando refreshSession.',
      );
      expect(
        logout.single.headers['Content-Type'],
        contains('application/json'),
        reason: 'Corpo JSON sem o cabecalho e recusado antes de ser lido.',
      );
    });

    test('sem sessao guardada nao ha familia para revogar, e nada sai na rede',
        () async {
      // O caminho de quem reabre o app num estado sujo. Sair continua sendo
      // legitimo; o que nao pode e inventar uma requisicao sem credencial e
      // registrar isso como defeito.
      final montado = _montar(
        responder: (_) async => http.Response('', 204),
      );

      final resultado = await montado.sessao.sair();

      expect(resultado, RevogacaoNoServidor.semSessaoParaRevogar);
      expect(montado.requisicoes, isEmpty);
      expect(montado.avisos, isEmpty, reason: 'Isto nao e falha, e nao vira '
          'ruido no registro.');
    });
  });

  group('ISCA 2 — 400 e falta de rede NAO tem o mesmo destino', () {
    test('o veredito de uma recusa do servidor difere do de uma falta de rede',
        () async {
      final recusa = _montar(
        responder: (_) async => _problem(status: 400),
      );
      await _logada(recusa);
      final resultadoDaRecusa = await recusa.sessao.sair();

      final semRede = _montar(
        responder: (_) async => throw const SocketException('sem sinal'),
      );
      await _logada(semRede);
      final resultadoSemRede = await semRede.sessao.sair();

      expect(
        resultadoDaRecusa,
        isNot(resultadoSemRede),
        reason: 'REPROVA: o 400 do servidor e a falta de rede terminaram no '
            'MESMO desfecho. E o `catch (FalhaDeChamada)` unico de volta: ele '
            'e a superclasse das tres falhas, e foi ele que fez um 400 em '
            '100% dos logouts do mundo ficar indistinguivel de sinal ruim. '
            'Sem rede e operacao normal deste produto; 400 e defeito nosso.',
      );
      expect(resultadoDaRecusa, RevogacaoNoServidor.recusadaPeloServidor);
      expect(resultadoSemRede, RevogacaoNoServidor.naoConfirmadaSemRede);

      expect(recusa.avisos, hasLength(1));
      expect(semRede.avisos, hasLength(1));
      expect(
        recusa.avisos.single.problem?.status,
        400,
        reason: 'O registro da recusa precisa carregar o corpo de erro. Um '
            'aviso generico nao diz a quem le que o par app/contrato se '
            'desencontrou.',
      );
      expect(
        recusa.avisos.single.mensagem,
        contains('400'),
        reason: 'A mensagem registrada precisa nomear o status recusado.',
      );
      expect(semRede.avisos.single.problem, isNull);
    });

    test('a recusa do servidor sai pelo canal de erro do app; a falta de rede, '
        'nao', () async {
      // O caso que fecha o buraco do anterior: manter o enum e mandar os dois
      // desfechos pelo mesmo canal silencioso passaria no teste de cima e
      // deixaria o defeito invisivel de novo. Aqui quem responde e o
      // observador PADRAO, que e o que roda em producao.
      final capturados = <FlutterErrorDetails>[];
      final anterior = FlutterError.onError;
      FlutterError.onError = capturados.add;
      addTearDown(() => FlutterError.onError = anterior);

      final recusa = _montar(
        responder: (_) async => _problem(status: 400),
        observador: registrarSaidaNoCanalPadrao,
      );
      await _logada(recusa);
      await recusa.sessao.sair();

      expect(
        capturados,
        hasLength(1),
        reason: 'REPROVA: o 400 do logout SUMIU. Ele e defeito do par '
            'app/contrato e precisa aparecer para quem opera -- '
            '`FlutterError.reportError` e o canal que a observabilidade do '
            'projeto escuta (ADR-0008). Um defeito desse tamanho nao pode '
            'depender de alguem desconfiar da tela.',
      );
      expect(capturados.single.library, 'bichu/sessao');

      capturados.clear();

      final semRede = _montar(
        responder: (_) async => throw const SocketException('sem sinal'),
        observador: registrarSaidaNoCanalPadrao,
      );
      await _logada(semRede);
      await semRede.sessao.sair();

      expect(
        capturados,
        isEmpty,
        reason: 'REPROVA: falta de rede virou alerta de erro. Metro, elevador '
            'e aviao sao operacao normal deste produto, e transformar sinal '
            'ruim em erro treina todo mundo a ignorar o alerta -- inclusive no '
            'dia em que o 400 chegar.',
      );
    });

    test('resposta que nao volta no prazo nao e confundida com recusa',
        () async {
      final montado = _montar(
        tempoLimite: const Duration(milliseconds: 30),
        responder: (_) async {
          await Future<void>.delayed(const Duration(milliseconds: 300));
          return http.Response('', 204);
        },
      );
      await _logada(montado);

      final resultado = await montado.sessao.sair();

      // Prazo estourado cai junto com "sem rede" de proposito: a consequencia
      // e identica (nao da para confirmar, e nao se retenta) e o logout e
      // idempotente no servidor. O que nao pode e cair junto com a recusa.
      expect(resultado, RevogacaoNoServidor.naoConfirmadaSemRede);
      expect(resultado, isNot(RevogacaoNoServidor.recusadaPeloServidor));
    });

    test('401 tambem e recusa do servidor, e nao silencio', () async {
      // O token de acesso ja tinha caido. A familia continua viva no banco e
      // ninguem a revogou: isso precisa ficar registrado como o que e.
      final montado = _montar(
        responder: (_) async => _problem(status: 401, tipo: 'token-expired'),
      );
      await _logada(montado);

      expect(
        await montado.sessao.sair(),
        RevogacaoNoServidor.recusadaPeloServidor,
      );
      expect(montado.avisos.single.problem?.status, 401);
    });
  });

  group('ISCA 3 — nada desta conta sobrevive ao logout', () {
    for (final caso in <({String nome, Future<http.Response> Function() rsp})>[
      (nome: 'revogacao confirmada', rsp: () async => http.Response('', 204)),
      (nome: 'servidor recusou com 400', rsp: () async => _problem(status: 400)),
      (
        nome: 'sem rede',
        rsp: () async => throw const SocketException('sem sinal'),
      ),
    ]) {
      test('o token local nao sobrevive — ${caso.nome}', () async {
        final envelope = DepositoDeIntencaoEmMemoria();
        await envelope.gravar('{"envelope":"da conta que saiu"}');
        var cacheLimpo = false;

        final montado = _montar(
          responder: (_) async => caso.rsp(),
          envelope: envelope,
          limpezas: <LimpezaAoSair>[() async => cacheLimpo = true],
        );
        await _logada(montado);
        expect(await montado.deposito.ler(), isNotNull);

        await montado.sessao.sair();

        expect(
          await montado.deposito.ler(),
          isNull,
          reason: 'REPROVA: o token da sessao ficou no aparelho depois do '
              'logout (${caso.nome}). O apagamento local e INCONDICIONAL '
              '(criterio 13.1 da BICHUS-81): limpeza que depende da resposta '
              'do servidor deixa o dado no aparelho exatamente no caso em que '
              'ninguem esta olhando. Trocar de conta no mesmo aparelho -- o '
              'celular da recepcao do pet shop, o do casal -- nao pode expor a '
              'conta anterior.',
        );
        expect(
          montado.sessao.estado,
          EstadoDaSessao.deslogado,
          reason: 'REPROVA: o app continua se achando logado.',
        );
        expect(
          montado.sessao.usuario,
          isNull,
          reason: 'REPROVA: o usuario da conta anterior ficou em memoria.',
        );
        expect(
          await envelope.ler(),
          isNull,
          reason: 'REPROVA: o envelope de intencao de quem saiu ficou no '
              'disco (UX 8.3, regra 7).',
        );
        expect(
          cacheLimpo,
          isTrue,
          reason: 'REPROVA: as limpezas registradas nao rodaram. O criterio 11 '
              'exige que o cache seja apagado NO LOGOUT, e nao no `onPressed` '
              'da tela que por acaso lembrar: limpeza que mora no botao so '
              'acontece pelo caminho do botao.',
        );
      });
    }

    test('uma limpeza que estoura nao deixa as outras sem rodar, nem o token '
        'no aparelho', () async {
      var segunda = false;
      final montado = _montar(
        responder: (_) async => http.Response('', 204),
        limpezas: <LimpezaAoSair>[
          () async => throw StateError('cache corrompido'),
          () async => segunda = true,
        ],
      );
      await _logada(montado);

      await montado.sessao.sair();

      expect(await montado.deposito.ler(), isNull);
      expect(
        segunda,
        isTrue,
        reason: 'REPROVA: uma limpeza que falhou impediu as seguintes. O cache '
            'da conta anterior sobreviveria por causa de um erro em outro '
            'cache.',
      );
    });
  });
}

/// Deposito de envelope em memoria, para nao depender do disco do aparelho.
class DepositoDeIntencaoEmMemoria implements DepositoDaIntencao {
  String? _conteudo;

  @override
  Future<String?> ler() async => _conteudo;

  @override
  Future<void> gravar(String conteudo) async => _conteudo = conteudo;

  @override
  Future<void> apagar() async => _conteudo = null;
}
