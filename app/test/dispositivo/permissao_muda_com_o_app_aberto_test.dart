// BICHUS-24 — a permissao de aviso muda ENQUANTO o app esta aberto.
//
// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
// ---------------------------------------------------------------------------
//
// Ele nao tem sintoma. A pessoa negou o aviso, viu a linha em Perfil, tocou em
// `Ligar nos ajustes`, ligou a chave no sistema e voltou para o app. Do lado
// dela, deu tudo certo: a chave esta ligada, o app abriu normalmente, nenhuma
// tela deu erro, nenhuma chamada falhou.
//
// Do lado do servidor, nada aconteceu. O aparelho continua registrado com
// `push_permission: denied` e sem token, porque ninguem contou a ele que a
// permissao mudou -- o dialogo do sistema nao foi aberto (ele nem abre mais),
// entao nenhum fluxo do app passou por ali. O criterio 4 do ADR-0006, "tem ao
// menos um aparelho com `push_permission = granted` e token valido", continua
// falso. A pessoa esta fora da base de alerta e acha que esta dentro.
//
// Esse e o pior formato de defeito deste produto: silencioso, do lado de la, e
// descoberto semanas depois como "a base de tutores nao recebe push e ninguem
// sabe por que". E ele so aparece no caminho que NAO passa pelo app -- que e
// justamente o unico caminho que sobra para quem negou.
//
// ---------------------------------------------------------------------------
// O QUE ESTES CASOS MEDEM
// ---------------------------------------------------------------------------
//
// O CORPO QUE CHEGA AO SERVIDOR. Nao "o vigia foi chamado", nao "o metodo
// existe": o `push_permission` e o `push_token` de `POST /v1/me/devices`, que
// e o unico lugar onde este defeito e visivel.
//
// Ha tambem um caso de FIACAO, e ele e separado de proposito: um vigia que
// funciona e que ninguem liga ao ciclo de vida passa em todos os outros casos
// deste arquivo e nao serve para nada no aparelho.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

void main() {
  Pet nina() => Pet(
        id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
        nome: 'Nina',
        especie: Especie.cao,
        redacoesDeCuidados: const <RedacaoDeCuidados>[],
      );

  http.Response tagEmitida() => json200(
        <String, dynamic>{
          'id': '11111111-2222-3333-4444-555555555555',
          'status': 'active',
          'code_suffix': '1QD',
          'created_at': '2026-09-17T18:20:00Z',
          'code': 'BCH-7K2M-91QD',
          'url': 'https://bichu.app/t/BCH-7K2M-91QD',
        },
        status: 201,
      );

  late List<Map<String, dynamic>> registros;
  setUp(() => registros = <Map<String, dynamic>>[]);

  /// Monta o app logado e passa por F1.6, que e onde o app descobre a
  /// permissao pela primeira vez.
  Future<AvisosDeTeste> abrirEPassarPorF16(
    WidgetTester tester,
    PermissaoDeAviso estadoInicial,
  ) async {
    final avisos = AvisosDeTeste(estadoInicial);
    await abrirOApp(
      tester,
      avisos: avisos,
      deposito: depositoLogado(),
      rede: (requisicao) async {
        if (requisicao.url.path.endsWith('/me/devices')) {
          registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
          return json200(<String, dynamic>{
            'id': '22222222-3333-4444-5555-666666666666',
            'platform': 'android',
            'push_permission': 'granted',
          });
        }
        if (requisicao.method == 'GET' &&
            requisicao.url.path.endsWith('/pets')) {
          return json200(<String, dynamic>{'items': <dynamic>[]});
        }
        return tagEmitida();
      },
    );
    await irPara(
      tester,
      Rotas.petCadastrado,
      extra: ResultadoDoCadastro(pet: nina()),
    );
    await tester.pumpAndSettle();

    expect(
      registros,
      isNotEmpty,
      reason: 'REPROVA POR VAZIO: F1.6 nao registrou o aparelho, entao nao ha '
          'estado anterior e este caso nao mede a MUDANCA que ele veio medir.',
    );
    return avisos;
  }

  /// A volta dos ajustes, pelo ciclo de vida de verdade.
  ///
  /// Sai para segundo plano e volta: sem a ida, nao ha TRANSICAO para
  /// `resumed`, e o observador nao e chamado. E a ida que torna isto a volta
  /// de quem foi aos ajustes, e nao um evento inventado.
  ///
  /// **A sequencia inteira, e nao os dois extremos.** O framework valida as
  /// transicoes (`AppLifecycleListener`, assercao de
  /// `previousState == AppLifecycleState.hidden`): pular `hidden` estoura, e
  /// um teste que pulasse estaria exercitando um caminho que o aparelho nunca
  /// produz.
  Future<void> sairEVoltarDoSistema(WidgetTester tester) async {
    for (final estado in <AppLifecycleState>[
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(estado);
    }
    await tester.pumpAndSettle();
  }

  group('ISCA — quem concede PELOS AJUSTES entra na base de alerta', () {
    testWidgets(
        'depois de negar e ligar nos ajustes, o servidor recebe granted e o token',
        (tester) async {
      final avisos = await abrirEPassarPorF16(tester, PermissaoDeAviso.negada);
      expect(registros.single['push_permission'], 'denied');
      expect(registros.single['push_token'], isNull);

      // A pessoa vai aos ajustes e liga a chave. NAO passa por `pedir()`: o
      // dialogo do sistema nao abre mais para quem negou, e e exatamente por
      // isso que este caminho existe.
      avisos.mudarPelosAjustes(PermissaoDeAviso.concedida);
      await sairEVoltarDoSistema(tester);

      expect(
        registros, hasLength(2),
        reason: 'REPROVA: a pessoa ligou o aviso nos ajustes, voltou ao app, e '
            'o servidor nao recebeu nada. O aparelho dela continua na base '
            'como `denied` e sem token, e o criterio 4 do ADR-0006 continua '
            'falso: ela esta fora do alcance do alerta e nao tem como '
            'descobrir isso. `Ligar nos ajustes` vira um botao que leva a um '
            'lugar onde a acao dela nao produz efeito nenhum.',
      );
      expect(registros.last['push_permission'], 'granted');
      expect(
        registros.last['push_token'],
        'token-fcm-descartavel',
        reason: 'REPROVA: o estado subiu como `granted` e o token nao foi '
            'junto. Sem token valido o criterio 4 do ADR-0006 continua falso, '
            'e o efeito e o mesmo de nao ter reconciliado nada.',
      );
    });

    testWidgets('a linha de Perfil SOME quando a pessoa volta com a chave ligada',
        (tester) async {
      final avisos = await abrirEPassarPorF16(tester, PermissaoDeAviso.negada);
      GoRouter.of(tester.element(find.byType(Scaffold).first)).go(Rotas.perfil);
      await tester.pumpAndSettle();

      final aLinha = find.textContaining(TextosDaAntessala.semAvisoPorPerto);
      await rolarAte(tester, aLinha);
      expect(aLinha, findsOneWidget, reason: 'precondicao: a linha estava la');

      avisos.mudarPelosAjustes(PermissaoDeAviso.concedida);
      await sairEVoltarDoSistema(tester);

      expect(
        aLinha,
        findsNothing,
        reason: 'REPROVA: a pessoa ligou o aviso nos ajustes, voltou, e o app '
            'continua dizendo que ela nao recebe aviso de pet perdido por '
            'perto. Ela acabou de fazer o que o app pediu, e o app responde '
            'que nao adiantou -- o passo seguinte dela e desinstalar.',
      );
    });
  });

  group('ISCA — quem REVOGA nos ajustes sai da base de alerta', () {
    testWidgets('o token e apagado no servidor, com `null` explicito',
        (tester) async {
      final avisos =
          await abrirEPassarPorF16(tester, PermissaoDeAviso.concedida);
      expect(registros.single['push_token'], 'token-fcm-descartavel');

      avisos.mudarPelosAjustes(PermissaoDeAviso.negada);
      await sairEVoltarDoSistema(tester);

      expect(
        registros, hasLength(2),
        reason: 'REPROVA: a permissao foi revogada nos ajustes e o servidor '
            'nao soube. Ele continua mandando push para um aparelho que nao '
            'recebe mais, e a previa de alcance conta essa pessoa como '
            'alcancavel -- a metrica dos 200 tutores mente para cima, que e o '
            'lado errado para ela errar.',
      );
      expect(registros.last['push_permission'], 'denied');
      expect(
        registros.last.containsKey('push_token'),
        isTrue,
        reason: 'REPROVA: o campo `push_token` saiu ausente em vez de `null`. '
            'O contrato declara `nullable: true`, e `null` e o que MANDA '
            'apagar o token que estava la; campo ausente diz "nao estou '
            'contando nada sobre o token", e o antigo fica.',
      );
      expect(registros.last['push_token'], isNull);
    });
  });

  group('ISCA — retomar sem mudanca nao vira trafego', () {
    testWidgets('voltar ao app com a mesma permissao NAO registra de novo',
        (tester) async {
      // O outro lado: um vigia que registra a cada retomada poria uma chamada
      // de rede em toda troca de app. Quem paga e a bateria e o plano de dados
      // de quem esta na rua procurando um cachorro.
      await abrirEPassarPorF16(tester, PermissaoDeAviso.concedida);
      expect(registros, hasLength(1));

      await sairEVoltarDoSistema(tester);
      await sairEVoltarDoSistema(tester);

      expect(
        registros,
        hasLength(1),
        reason: 'REPROVA: o app registrou o aparelho de novo sem nada ter '
            'mudado. Duas retomadas viraram duas chamadas, e o app troca de '
            'primeiro plano dezenas de vezes por dia.',
      );
    });

    testWidgets('quem nunca foi perguntada NAO e registrada por uma retomada',
        (tester) async {
      // `naoPedida` numa retomada e o estado de quem nem chegou a F1.6.
      // Registrar aqui poria na base o aparelho de alguem que ainda nem tem
      // pet, e a contagem de alcance deixaria de significar o que significa.
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOApp(
        tester,
        avisos: avisos,
        deposito: depositoLogado(),
        rede: (requisicao) async {
          if (requisicao.url.path.endsWith('/me/devices')) {
            registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
            return json200(<String, dynamic>{
              'id': '2',
              'platform': 'android',
              'push_permission': 'not_asked',
            });
          }
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return tagEmitida();
        },
      );

      await sairEVoltarDoSistema(tester);

      expect(
        registros,
        isEmpty,
        reason: 'REPROVA: uma retomada registrou o aparelho de quem nunca foi '
            'perguntada. O momento do registro e F1.6, depois da antessala, e '
            'nao qualquer volta ao primeiro plano.',
      );
    });

    testWidgets('build sem push nao registra nada em retomada nenhuma',
        (tester) async {
      await abrirOApp(
        tester,
        avisos: AvisosDeTeste(
          PermissaoDeAviso.indisponivel,
          plataforma: null,
        ),
        deposito: depositoLogado(),
        rede: (requisicao) async {
          if (requisicao.url.path.endsWith('/me/devices')) {
            registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
            return json200(<String, dynamic>{'id': '3'});
          }
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return tagEmitida();
        },
      );
      await sairEVoltarDoSistema(tester);

      expect(
        registros,
        isEmpty,
        reason: 'REPROVA: um processo sem push registrou aparelho. Ele nunca '
            'vai receber nada, e contar com ele infla a metrica de alcance.',
      );
    });
  });

  group('ISCA — a fiacao: o vigia esta ligado ao ciclo de vida', () {
    testWidgets('o app monta o vigia e o liga ao `WidgetsBinding`',
        (tester) async {
      // Um vigia correto que ninguem liga ao ciclo de vida passa em todos os
      // casos acima que o chamem na mao, e nao faz absolutamente nada no
      // aparelho. Este caso nao chama `reconciliar()`: ele mexe SO no ciclo de
      // vida e cobra o efeito, que e o que prova a fiacao.
      final avisos = await abrirEPassarPorF16(tester, PermissaoDeAviso.negada);
      final vigia =
          Escopo.of(tester.element(find.byType(Scaffold).first)).vigiaDeAviso;
      expect(
        vigia.negouOAviso,
        isTrue,
        reason: 'REPROVA: F1.6 nao contou ao vigia o que descobriu, e ele '
            'tratara o proximo estado como novidade mesmo sem mudanca.',
      );

      avisos.mudarPelosAjustes(PermissaoDeAviso.concedida);
      await sairEVoltarDoSistema(tester);

      expect(
        vigia.negouOAviso,
        isFalse,
        reason: 'REPROVA: o ciclo de vida foi ate `resumed` e o vigia nao '
            'reagiu. Ou ele nao foi registrado em `WidgetsBinding`, ou o '
            '`didChangeAppLifecycleState` nao chama a reconciliacao -- e nos '
            'dois casos o codigo dele existe e nunca roda no aparelho.',
      );
    });
  });
}
