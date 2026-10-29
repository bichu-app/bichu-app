// ISCA DA BICHUS-301 (29/10/2026): A ROTA DE REVOGAR PASSKEY.
//
// Decisao do cliente: *"Implemente a rota do passkey."*
//
// ===========================================================================
// A PERGUNTA REAL ERA "REVOGAR QUAL CREDENCIAL?", E O CONTRATO A RESPONDE
// ===========================================================================
//
// `tela_dados_pessoais.dart` registrava a ressalva com estas palavras: *"qual
// credencial? a deste aparelho, que a lista nao identifica, ou todas?"*. **A
// ressalva estava errada sobre o contrato, e isso foi MEDIDO em
// `api/openapi.yaml`:**
//
// | campo de `Passkey` | o que ele permite distinguir |
// |---|---|
// | `id` (uuid) | o identificador DA LINHA -- *"e o que `revokePasskey` recebe"* |
// | `label` (nulo possivel, 60) | o rotulo do aparelho, escolhido pela pessoa |
// | `created_at` (obrigatorio) | quando aquela credencial foi cadastrada |
// | `last_used_at` (nulo possivel) | a ultima entrada aceita com ela |
//
// O proprio `listPasskeys` diz para que esses campos existem: *"o que a tela
// precisa e o rotulo, quando foi cadastrada e quando foi usada por ultimo,
// **para a pessoa reconhecer o aparelho que vai revogar**"*. Entao o caminho e
// o primeiro dos dois que o pedido previa: **a lista aparece e a pessoa
// escolhe.** Nenhum campo foi inventado e o `openapi.yaml` nao foi tocado.
//
// ## O QUE O CONTRATO NAO DISTINGUE, E ISSO DECIDE A MARCA LOCAL
//
// `Passkey` **nao traz `credential_id`** -- com a razao escrita: *"nada que
// sirva para montar assercao sai desta operacao"*. Logo **o app nao tem como
// saber qual das linhas e a DESTE aparelho**. Isso nao atrapalha revogar (a
// pessoa reconhece pelo rotulo e pela data), mas decide quando a marca local
// sai -- ver o grupo da marca, abaixo.
//
// ## UM CAMINHO DE CODIGO, E NAO UM SEGUNDO
//
// `escopo.dart` diz, no campo `passkey`: *"nenhuma tela chama `passkeys` e
// `credencialDoAparelho` na mao"*. A tela nao chama `PasskeysApi.revogar`
// direto: ela chama `FiacaoDoPasskey.revogar`, que e quem sabe que revogar
// mexe na marca local. Dois chamadores seriam dois lugares onde a marca pode
// deixar de ser limpa.
library;

import 'dart:convert';

import 'package:bichu/dispositivo/credencial_do_aparelho.dart';
import 'package:bichu/dispositivo/passkey_neste_aparelho.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_passkey.dart';
import 'package:bichu/api/passkeys_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/fiacao_do_passkey.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// Um aparelho que SUPORTA passkey. `abrirOApp` usa `SemPasskeyNesteBuild` por
/// padrao, que responde "nao suporto" -- e a secao nem chega a listar nada.
class _AparelhoQueSuporta implements CredencialDoAparelho {
  @override
  Future<bool> suportaCredencial() async => true;

  @override
  Future<CredencialCadastrada> cadastrar(
    OpcoesDeCadastroDePasskey opcoes,
  ) async =>
      const CredencialCadastrada(
        id: 'cred-1',
        rawId: 'cred-1',
        clientDataJson: 'cdj',
        attestationObject: 'ao',
        transportes: <String>['internal'],
      );

  @override
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes) =>
      throw const SemCredencialNoAparelho();
}

/// As credenciais que o servidor falso diz que a conta tem, por `id`.
late List<String> _naConta;

/// Todas as chamadas que sairam, em ordem.
late List<String> _chamadas;

Future<http.Response> _servidor(http.Request req) async {
  _chamadas.add('${req.method} ${req.url.path}');

  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'handle': 'marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (req.url.path == '/v1/auth/passkeys' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        for (final id in _naConta)
          <String, dynamic>{
            'id': id,
            // `pk-sem-nome` chega SEM rotulo, de proposito: `label` e nulavel
            // no contrato, e a tela tem de dizer algo mesmo assim.
            'label': id == 'pk-sem-nome' ? null : 'Celular da Marina',
            'created_at': '2026-10-12T10:00:00Z',
            'last_used_at': null,
          },
      ],
    });
  }
  // `revokePasskey`. **204 e sem corpo**, como o contrato declara.
  if (req.url.path.startsWith('/v1/auth/passkeys/') &&
      req.method == 'DELETE') {
    final id = req.url.pathSegments.last;
    _naConta = _naConta.where((outro) => outro != id).toList();
    return http.Response('', 204);
  }
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 0,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 0,
    });
  }
  return problema('not-found', 404);
}

/// O deposito da marca local, para o caso ler o que sobrou nele.
late DepositoDePasskeyEmMemoria _marca;

Future<void> _abrirMeusDados(
  WidgetTester tester, {
  bool jaMarcadoNesteAparelho = true,
  bool recusouAntes = false,
}) async {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  _marca = DepositoDePasskeyEmMemoria(
    conteudo: (jaMarcadoNesteAparelho || recusouAntes)
        ? jsonEncode(<String, dynamic>{
            if (jaMarcadoNesteAparelho) 'ha_credencial': true,
            if (jaMarcadoNesteAparelho)
              'marcado_em': '2026-10-27T10:00:00.000Z',
            if (recusouAntes) 'recusou_formalmente': true,
            if (recusouAntes) 'recusou_em': '2026-10-28T10:00:00.000Z',
          })
        : null,
  );
  await abrirOApp(
    tester,
    rede: _servidor,
    deposito: depositoLogado(),
    credencialDoAparelho: _AparelhoQueSuporta(),
    depositoDePasskeyNoAparelho: _marca,
  );
  await irPara(tester, Rotas.dadosPessoais);
  await tester.pumpAndSettle();
}

/// Toca `Desativar` da primeira credencial e CONFIRMA na folha destrutiva.
Future<void> _desativarEConfirmar(WidgetTester tester) async {
  await tocar(tester, find.text(TelaDadosPessoais.desativarOPasskey).first);
  await tester.pumpAndSettle();
  await tocar(tester, find.text(TelaDadosPessoais.confirmarADesativacao));
  await tester.pumpAndSettle();
}

/// O que ficou gravado na marca local.
Map<String, dynamic> _marcaGravada() {
  final cru = _marca.conteudo;
  if (cru == null || cru.isEmpty) return <String, dynamic>{};
  final corpo = jsonDecode(cru);
  return corpo is Map<String, dynamic> ? corpo : <String, dynamic>{};
}

void main() {
  setUp(() {
    _naConta = <String>['pk-0'];
    _chamadas = <String>[];
  });

  group('a lista existe porque o CONTRATO distingue as credenciais', () {
    testWidgets(
      'a secao mostra o aparelho com rotulo e data, e a acao de desativar',
      (tester) async {
        // PARA DESLIGAR E VER REPROVAR: em `_conteudo` de `_BlocoDoPasskey`,
        // tire o `_ListaDeCredenciais` do estado `ativo`.
        //
        // O contrato devolve `label`, `created_at` e `last_used_at` exatamente
        // *"para a pessoa reconhecer o aparelho que vai revogar"*. Desativar
        // sem dizer QUAL seria prometer menos do que o contrato entrega.
        await _abrirMeusDados(tester);

        expect(
          find.text('Celular da Marina'),
          findsOneWidget,
          reason: 'REPROVA: a secao nao identifica o aparelho. O `label` esta '
              'no contrato e e o que a pessoa reconhece.',
        );
        expect(
          find.text(TelaDadosPessoais.desativarOPasskey),
          findsOneWidget,
          reason: 'REPROVA: nao ha acao de desativar. `revokePasskey` existe '
              'no contrato e o cliente pediu a rota implementada.',
        );
      },
    );

    testWidgets('credencial SEM rotulo e dita pela DATA, e nao por um vazio',
        (tester) async {
      // `label` e nulavel no contrato: *"sem ele o servidor guarda nulo e a
      // tela mostra a data"*. Uma linha em branco com um botao `Desativar` ao
      // lado e a pessoa desativando no escuro.
      _naConta = <String>['pk-sem-nome'];
      await _abrirMeusDados(tester);

      expect(
        find.text(TelaDadosPessoais.credencialSemRotulo('12 out')),
        findsOneWidget,
        reason: 'REPROVA: credencial sem `label` virou linha vazia. O '
            'contrato preve o nulo e manda mostrar a data.',
      );
    });

    testWidgets('APARELHO SEM SUPORTE nao lista nem oferece desativar',
        (tester) async {
      tester.view.physicalSize = const Size(1170, 7800);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      _marca = DepositoDePasskeyEmMemoria();
      await abrirOApp(
        tester,
        rede: _servidor,
        deposito: depositoLogado(),
        credencialDoAparelho: const SemPasskeyNesteBuild(),
        depositoDePasskeyNoAparelho: _marca,
      );
      await irPara(tester, Rotas.dadosPessoais);
      await tester.pumpAndSettle();

      expect(
        find.text(TelaDadosPessoais.desativarOPasskey),
        findsNothing,
        reason: 'REPROVA: ofereceu desativar num aparelho que nem faz '
            'passkey. Indisponibilidade e estado normal, e nao tem lista.',
      );
    });
  });

  group('CONTROLE POSITIVO: a rota sai, e so depois da confirmacao', () {
    testWidgets('confirmar manda DELETE na credencial ESCOLHIDA',
        (tester) async {
      // **SEM ESTE CASO NENHUM OUTRO VALE.** Os casos da marca local e o de
      // cancelar sao afirmacoes sobre o que NAO acontece, e ficariam todos
      // verdes com um botao na tela e nenhuma rota do outro lado -- que e o
      // que esta casa chama de acao sem desfecho.
      await _abrirMeusDados(tester);
      await _desativarEConfirmar(tester);

      expect(
        _chamadas,
        contains('DELETE /v1/auth/passkeys/pk-0'),
        reason: 'REPROVA: a revogacao nao saiu. `revokePasskey` existe no '
            'contrato (`DELETE /v1/auth/passkeys/{passkeyId}`) e `PasskeysApi` '
            'tem de expo-la -- era justamente a operacao que faltava.',
      );
    });

    testWidgets('o `passkeyId` e o ID DA LINHA, e nao o indice nem o rotulo',
        (tester) async {
      // O contrato e explicito: `id` e *"o identificador DA LINHA, e nao o
      // `credential_id`. E o que `revokePasskey` recebe"*. Mandar indice ou
      // rotulo daria 400 no Ajv (`format: uuid`) ou 404.
      _naConta = <String>['pk-tablet', 'pk-celular'];
      await _abrirMeusDados(tester);
      await _desativarEConfirmar(tester);

      expect(
        _chamadas,
        contains('DELETE /v1/auth/passkeys/pk-tablet'),
        reason: 'REPROVA: o caminho da revogacao nao leva o `id` da linha '
            'escolhida.',
      );
    });

    testWidgets('CANCELAR a folha nao manda revogacao nenhuma', (tester) async {
      // Revogar e `irreversible_write` no contrato, e a folha destrutiva
      // existe para que o toque no susto nao destrua. Um `?? true` na leitura
      // do desfecho da folha transformaria o gesto de voltar num confirmador.
      await _abrirMeusDados(tester);
      await tocar(
        tester,
        find.text(TelaDadosPessoais.desativarOPasskey).first,
      );
      await tester.pumpAndSettle();
      await tocar(tester, find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(
        _chamadas.where((c) => c.startsWith('DELETE')),
        isEmpty,
        reason: 'REPROVA: cancelar a folha revogou a credencial. A acao e '
            'declarada `irreversible_write` no contrato.',
      );
    });
  });

  group('A MARCA LOCAL, que e o que faz o app parar de tentar', () {
    testWidgets(
      'revogar a ULTIMA credencial LIMPA a marca deste aparelho',
      (tester) async {
        // PARA DESLIGAR E VER REPROVAR: em `FiacaoDoPasskey.revogar`, tire a
        // chamada de `_registro.desmarcar()`.
        //
        // **Sem isto o portao de `tentarEntrar` fica aberto para uma
        // credencial que nao existe mais**: a tela de entrar pede desafio em
        // toda abertura, abre a folha do sistema na cara de quem acabou de
        // desligar o recurso, e termina num 401 que o contrato deixa
        // indistinguivel de assinatura errada.
        await _abrirMeusDados(tester);
        expect(
          _marcaGravada()['ha_credencial'],
          isTrue,
          reason: 'A BANCADA: o caso comeca com a marca POSTA. Sem isto ele '
              'mediria a ausencia de uma marca que nunca existiu.',
        );

        await _desativarEConfirmar(tester);

        expect(
          _marcaGravada()['ha_credencial'],
          isNot(true),
          reason: 'REPROVA: a marca local sobreviveu a revogacao da ultima '
              'credencial da conta. O app seguiria tentando uma credencial '
              'que nao existe mais.',
        );
      },
    );

    testWidgets(
      'revogar UMA DE DUAS deixa a secao com a marca POSTA no fim',
      (tester) async {
        // **ESTE CASO MEDE O ESTADO FINAL DA SECAO, E NAO A GUARDA DE
        // `revogar`** -- e a distincao foi MEDIDA, nao suposta: com
        // `desmarcar()` chamado SEM a condicao de lista vazia, este caso
        // continua VERDE. A razao e que `_desativar` rele o estado inteiro
        // depois, e `reconciliarComAConta` **marca de novo** porque a conta
        // ainda tem credencial ativa.
        //
        // Isso nao e um defeito do caso, e e uma propriedade que vale a pena
        // ter travada: pela porta da tela, revogar a credencial de OUTRO
        // aparelho **nao deixa este aparelho sem marca** no fim do gesto, por
        // dois caminhos independentes em vez de um.
        //
        // **A GUARDA EM SI TEM CASO PROPRIO**, no grupo de unidade
        // `FiacaoDoPasskey.revogar` -- lá nao ha releitura de tela para
        // encobrir a falta dela.
        _naConta = <String>['pk-tablet', 'pk-celular'];
        await _abrirMeusDados(tester);
        await _desativarEConfirmar(tester);

        expect(
          _chamadas,
          contains('DELETE /v1/auth/passkeys/pk-tablet'),
          reason: 'A BANCADA: sem a revogacao ter saido, o resto do caso nao '
              'mede nada.',
        );
        expect(
          _marcaGravada()['ha_credencial'],
          isTrue,
          reason: 'REPROVA: revogar a credencial de OUTRO aparelho deixou '
              'ESTE sem marca no fim do gesto. A conta ainda tem credencial '
              'ativa, e o portao de `tentarEntrar` tem de continuar aberto.',
        );
      },
    );

    testWidgets('REVOGAR NAO E RECUSAR: nenhuma recusa formal e gravada',
        (tester) async {
      // PARA DESLIGAR E VER REPROVAR: em `FiacaoDoPasskey.revogar`, chame
      // `_registro.registrarRecusa()` junto com `desmarcar()`.
      //
      // Recusa formal **cala a oferta do convite depois do login**
      // (`deveOferecerCadastro` sai em `false`). Quem revoga pode querer
      // ativar de novo depois -- e e literalmente o cenario que o cliente
      // nomeou em 28/10 para a recusa existir. Confundir as duas faria a
      // pessoa perder a oferta para sempre por ter desativado uma vez.
      await _abrirMeusDados(tester);
      await _desativarEConfirmar(tester);

      expect(
        _marcaGravada()['recusou_formalmente'],
        isNot(true),
        reason: 'REPROVA: revogar gravou RECUSA FORMAL. Revogar nao e '
            'recusar: quem desativa pode querer ativar de novo, e a recusa '
            'cala a oferta do login para sempre.',
      );
    });

    testWidgets(
      'desmarcar PRESERVA a recusa que ja existia no mesmo arquivo',
      (tester) async {
        // As duas chaves moram no MESMO JSON, e `passkey_neste_aparelho.dart`
        // nomeia este defeito como *"o mais facil de cometer aqui"*: uma
        // escrita que monta o corpo do zero apaga a chave da outra. `marcar` e
        // `registrarRecusa` leem antes de gravar, e `desmarcar` tem de fazer o
        // mesmo.
        await _abrirMeusDados(tester, recusouAntes: true);
        await _desativarEConfirmar(tester);

        final gravado = _marcaGravada();
        expect(
          gravado['ha_credencial'],
          isNot(true),
          reason: 'A BANCADA: a marca tinha de sair, senao o caso nao mede a '
              'preservacao da outra chave.',
        );
        expect(
          gravado['recusou_formalmente'],
          isTrue,
          reason: 'REPROVA: `desmarcar` montou o JSON do zero e apagou a '
              'recusa formal. A pessoa voltaria a ser perguntada em todo '
              'login.',
        );
      },
    );
  });

  // =========================================================================
  // A GUARDA DE `FiacaoDoPasskey.revogar`, EM UNIDADE.
  // =========================================================================
  //
  // **Por que em unidade e nao pela tela:** pela tela, `_desativar` rele o
  // estado no fim e `reconciliarComAConta` repoe a marca quando a conta ainda
  // tem credencial. Essa releitura **encobre a falta da guarda** -- medido:
  // com `desmarcar()` sem condicao, o caso de widget continua verde. Aqui nao
  // ha tela, entao a condicao `restantes.isEmpty` e a unica coisa entre a
  // revogacao e a marca.
  group('a GUARDA de `FiacaoDoPasskey.revogar`, sem tela para encobrir', () {
    late DepositoDePasskeyEmMemoria deposito;
    late PasskeyNesteAparelho registro;

    /// As credenciais da conta, para o servidor desta unidade.
    late List<String> naConta;

    FiacaoDoPasskey fiacao() => FiacaoDoPasskey(
          passkeys: PasskeysApi(
            ApiClient(
              config: AppConfig.carregar(
                apiBaseUrlDeTeste: 'https://api.exemplo.test',
              ),
              cliente: MockClient((http.Request req) async {
                if (req.url.path.startsWith('/v1/auth/passkeys/') &&
                    req.method == 'DELETE') {
                  final id = req.url.pathSegments.last;
                  naConta = naConta.where((o) => o != id).toList();
                  return http.Response('', 204);
                }
                if (req.url.path == '/v1/auth/passkeys' &&
                    req.method == 'GET') {
                  return http.Response(
                    jsonEncode(<String, dynamic>{
                      'items': <Map<String, dynamic>>[
                        for (final id in naConta)
                          <String, dynamic>{
                            'id': id,
                            'label': id,
                            'created_at': '2026-10-12T10:00:00Z',
                            'last_used_at': null,
                          },
                      ],
                    }),
                    200,
                    headers: <String, String>{
                      'content-type': 'application/json',
                    },
                  );
                }
                return http.Response('{}', 404);
              }),
              tokenDeAcesso: () async => 'token-de-teste',
            ),
          ),
          aparelho: _AparelhoQueSuporta(),
          registro: registro,
        );

    setUp(() {
      deposito = DepositoDePasskeyEmMemoria();
      registro = PasskeyNesteAparelho(deposito: deposito);
    });

    test('sobrou credencial na conta -> a marca FICA', () async {
      // PARA DESLIGAR E VER REPROVAR: em `FiacaoDoPasskey.revogar`, troque
      // `if (restantes.isEmpty) await _registro.desmarcar();` por
      // `await _registro.desmarcar();`.
      //
      // **MEDIDO no contrato, e e o motivo da guarda:** `Passkey` nao traz
      // `credential_id` (*"nada que sirva para montar assercao sai desta
      // operacao"*), entao o app NAO SABE qual das linhas e a deste aparelho.
      // Desmarcar aqui fecharia o portao de um aparelho com passkey boa --
      // quem revoga o TABLET pelo CELULAR perderia a entrada sem toque no
      // celular. `passkey_neste_aparelho.dart` tem a assimetria escrita:
      // marca sobrando custa UMA requisicao por sessao, marca faltando custa
      // o recurso inteiro.
      naConta = <String>['pk-tablet', 'pk-celular'];
      await registro.marcar();

      expect(await fiacao().revogar('pk-tablet'), isTrue);
      expect(
        await registro.haCredencial(),
        isTrue,
        reason: 'REPROVA: revogar com credencial RESTANTE na conta apagou a '
            'marca deste aparelho. O contrato nao diz qual linha e a daqui, e '
            'fechar o portao por suposicao custa a entrada sem toque de um '
            'aparelho que tem passkey perfeitamente boa.',
      );
    });

    test('conta ficou VAZIA -> a marca SAI', () async {
      naConta = <String>['pk-unica'];
      await registro.marcar();

      expect(await fiacao().revogar('pk-unica'), isTrue);
      expect(
        await registro.haCredencial(),
        isFalse,
        reason: 'REPROVA: a conta ficou sem credencial ativa nenhuma e a '
            'marca local sobreviveu. O portao de `tentarEntrar` seguiria '
            'aberto para uma credencial que nao existe em aparelho nenhum.',
      );
    });

    test('DELETE que nao tirou nada da conta nao mexe na marca', () async {
      // A guarda e a LISTA e nao o desfecho do DELETE, e este caso e o que
      // separa as duas coisas: o servidor falso aceita o DELETE (204), mas o
      // `id` nao estava na conta, entao a lista continua cheia -- e a marca
      // tem de ficar. Uma guarda escrita sobre "o DELETE deu certo" em vez de
      // "a conta ficou vazia" reprovaria aqui.
      //
      // O 204 para `id` que nao existe nao e invencao da bancada: o contrato
      // declara a operacao IDEMPOTENTE (*"revogar a ja revogada tambem sai
      // 204"*).
      naConta = <String>['pk-unica'];
      await registro.marcar();

      expect(
        await fiacao().revogar('nao-existe-mas-o-servidor-aceita-delete'),
        isTrue,
        reason: 'A BANCADA: este servidor falso aceita qualquer DELETE, e por '
            'isso o desfecho e `true` -- o que este caso mede e a marca.',
      );
      expect(
        await registro.haCredencial(),
        isTrue,
        reason: 'REPROVA: um DELETE que nao tirou nada da conta apagou a '
            'marca. A lista continua com `pk-unica`, entao a conta nao ficou '
            'vazia.',
      );
    });
  });

  group('depois de revogar, a secao nao mente sobre o estado', () {
    testWidgets('a ultima credencial fora, a secao volta a oferecer ATIVAR',
        (tester) async {
      await _abrirMeusDados(tester);
      await _desativarEConfirmar(tester);

      expect(
        find.text(TelaDadosPessoais.passkeyAtivado),
        findsNothing,
        reason: 'REPROVA: a secao continua afirmando que o login por digital '
            'esta ativo depois de a credencial ter sido revogada.',
      );
      expect(
        find.text(TelaDadosPessoais.ativarOPasskey),
        findsOneWidget,
        reason: 'REPROVA: depois de desativar nao ha caminho de volta. '
            'Revogar nao e uma porta de mao unica -- quem desativou pode '
            'querer ativar de novo.',
      );
    });
  });
}
