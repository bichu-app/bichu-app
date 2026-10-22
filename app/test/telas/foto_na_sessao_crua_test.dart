/// **A FOTO CHEGA AO AVATAR DA BARRA PELA PORTA QUE O APP REALMENTE LE.**
///
/// Relato do cliente, 20/10/2026: *"o icone do perfil em todas as paginas, não
/// esta sendo substituido pela foto do perfil do usuário"*.
///
/// ## POR QUE ESTE ARQUIVO EXISTE AO LADO DE `foto_do_usuario_na_barra_test.dart`
///
/// Aquele arquivo mede o DESENHO -- a cadeia foto → inicial → glifo dentro de
/// `AvatarDaConta` -- e ele passava com o defeito no ar. Todos os casos dele
/// semeiam a sessão por `depositoLogado(fotoUrl: ...)`, que monta um `Usuario`
/// **direto em Dart**: nenhum deles faz um corpo de `SessionResponse` passar por
/// `Usuario.doJson`, e nenhum deles atravessa o chaveiro.
///
/// E era justamente nas duas costuras que a foto se perdia:
///
/// 1. **no servidor**, `projetarConta` (`SessionResponse.user`) não tinha
///    `photo`, embora o contrato aponte `getMe` e a sessão para o MESMO schema
///    `Me`. Quem prende isso é
///    `src/modules/identity/application/foto-na-sessao.test.ts`;
/// 2. **no chaveiro**, `DepositoNoChaveiro.gravar` guardava oito campos do
///    usuário e `photo` não era um deles -- então no arranque seguinte o avatar
///    voltava para a inicial mesmo com o servidor mandando a foto.
///
/// As duas falhavam CALADAS, e é por isso que levaram tanto tempo: cair na
/// inicial do nome é um desfecho legítimo da cadeia do avatar. O defeito tinha a
/// aparência exata do comportamento correto.
///
/// **Então o que estes casos afirmam é a CHAVE DO CONTRATO, e não um campo
/// Dart**: eles montam `{'photo': {'url': ...}}`, que é o que o servidor manda,
/// e exigem que a imagem apareça no círculo da barra. Um caso que passasse
/// `fotoUrl:` a mão continuaria verde com qualquer das duas costuras rompida.
library;

import 'dart:convert';

import 'package:bichu/api/modelos.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'imagem_do_profissional_test.dart' show imagensDeRedeEm, urlPedidaPor;

/// A derivada `card` (512 x 512), como o servidor a monta.
const String _fotoDoUsuario =
    'https://midia.bichu.app/people/card/9f8e7d6c5b4a3210.jpeg';

/// O corpo de `SessionResponse.user` -- o schema `Me` --, **como o servidor o
/// manda**, com a foto na chave do contrato.
Map<String, dynamic> _meDoContrato({String? fotoUrl = _fotoDoUsuario}) {
  return <String, dynamic>{
    'id': '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01',
    'email': 'tutora@exemplo-de-teste.invalid',
    'email_verified': true,
    'contact_channel_verified': true,
    'pending_email': null,
    'email_deliverable': true,
    'display_name': 'Marina',
    'pending_profile_fields': <dynamic>[],
    'can_open_lost_case': true,
    'reference_area': null,
    // `oneOf: [MyPhoto, null]`. E ESTA chave que o servidor nao mandava na
    // sessao, e e por ela que o avatar da barra se desenha.
    'photo': fotoUrl == null
        ? null
        : <String, dynamic>{'status': 'ready', 'url': fotoUrl, 'rejection_reason': null},
  };
}

/// Uma sessão montada **a partir do JSON do servidor**, e não a mão.
DepositoEmMemoria _depositoDoContrato({String? fotoUrl = _fotoDoUsuario}) {
  return DepositoEmMemoria()
    ..gravar(
      Sessao(
        accessToken: 'access-de-15-minutos',
        refreshToken: 'refresh-de-teste',
        expiraEm: DateTime.now().add(const Duration(hours: 1)),
        // A COSTURA MEDIDA: `Usuario.doJson`, e nao `Usuario(...)`.
        usuario: Usuario.doJson(_meDoContrato(fotoUrl: fotoUrl)),
      ),
    );
}

/// A rede desta bancada: **404 em tudo**, para provar junto que a foto da barra
/// vem da SESSAO e nao de uma chamada a `GET /me`.
Future<http.Response> _semRede(http.Request _) async => problema('not-found', 404);

Finder get _circulo => find.byKey(AvatarDaConta.chaveDoCirculo);

void main() {
  group('a foto que vem no corpo de `SessionResponse.user`', () {
    testWidgets(
      'ISCA — com `photo` no corpo do servidor, o circulo da barra desenha a IMAGEM',
      (tester) async {
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: _depositoDoContrato(),
        );

        final imagens = imagensDeRedeEm(_circulo);
        expect(
          imagens,
          hasLength(1),
          reason:
              'REPROVA: o circulo da barra nao desenhou imagem nenhuma, com a '
              'foto vindo na chave `photo` de `SessionResponse.user`. E o '
              'defeito que o cliente relatou em 20/10/2026: o avatar fica na '
              'inicial do nome em TODAS as paginas. Repare que ele REPROVA '
              'CALADO no produto -- cair na inicial e desfecho legitimo da '
              'cadeia foto -> inicial -> glifo.',
        );
        expect(
          urlPedidaPor(imagens.single),
          _fotoDoUsuario,
          reason:
              'REPROVA: a imagem pedida nao e a URL que veio em `photo.url`. O '
              'app le a URL INTEIRA e nao monta chave de armazenamento '
              '(ADR-0010 item 6).',
        );
        // O GLIFO, e NAO a letra. A letra e o degrau de RESERVA de
        // `ImagemDaRede`, e em `flutter test` toda imagem de rede falha (o
        // `HttpClient` da bancada responde 400) -- entao a inicial aparecer
        // aqui e o comportamento CERTO, medido pelo grupo (4) de
        // `foto_do_usuario_na_barra_test.dart`. Afirmar a ausencia dela faria
        // este caso reprovar por um motivo que nao e o dele.
        expect(
          find.descendant(of: _circulo, matching: find.byIcon(Icons.person_outline)),
          findsNothing,
          reason:
              'REPROVA: o glifo de pessoa continuou no circulo por baixo da '
              'foto. O terceiro degrau da cadeia nao e desenho de fundo.',
        );
      },
    );

    testWidgets(
      'CONTROLE POSITIVO — sem `photo` no corpo, o circulo cai na INICIAL',
      (tester) async {
        // A correcao nao pode ter inventado foto para quem nao tem: a cadeia
        // foto -> inicial -> glifo continua valendo, e a inicial e o desfecho
        // CERTO quando o corpo vem sem foto.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: _depositoDoContrato(fotoUrl: null),
        );

        expect(imagensDeRedeEm(_circulo), isEmpty);
        expect(
          find.descendant(of: _circulo, matching: find.text('M')),
          findsOneWidget,
          reason:
              'REPROVA: sem foto, o circulo deveria desenhar a inicial de '
              '`Marina`. Este caso e o que separa "a foto chegou" de "a foto '
              'sempre aparece"',
        );
      },
    );
  });

  group('a foto sobrevive ao chaveiro', () {
    // O DEPOSITO DE VERDADE, pelo canal de verdade -- e nao `DepositoEmMemoria`.
    // `DepositoEmMemoria` guarda o objeto `Sessao` inteiro em memoria e NAO
    // serializa nada: um caso sobre ele passaria com `photo` fora do mapa que
    // `DepositoNoChaveiro.gravar` monta, que e exatamente onde a foto se perdia.
    const MethodChannel canalDoChaveiro =
        MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

    String? doOutroLado;

    setUp(() {
      doOutroLado = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(canalDoChaveiro, (chamada) async {
        final argumentos = chamada.arguments as Map<dynamic, dynamic>;
        switch (chamada.method) {
          case 'write':
            doOutroLado = argumentos['value'] as String?;
            return null;
          case 'read':
            return doOutroLado;
          case 'delete':
            doOutroLado = null;
            return null;
          default:
            return null;
        }
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(canalDoChaveiro, null);
    });

    test(
      'ISCA — a foto esta no que `gravar` grava, e volta em `ler`',
      () async {
        // SEM `photo` EM `gravar` ESTE CASO REPROVA, e era o defeito do arranque
        // seguinte: o servidor mandava a foto, o app a desenhava naquela sessao,
        // e no proximo arranque o avatar voltava para a inicial -- porque o que
        // o chaveiro devolvia nao tinha foto. Calado, como a outra metade.
        final deposito = DepositoNoChaveiro();
        await deposito.gravar(
          Sessao(
            accessToken: 'access-de-15-minutos',
            refreshToken: 'refresh-de-teste',
            expiraEm: DateTime.utc(2030, 1, 1),
            usuario: Usuario.doJson(_meDoContrato()),
          ),
        );

        // 1. A FOTO ESTA NO TEXTO GRAVADO. Afirmar so o `ler` deixaria passar um
        //    `gravar` que jogasse a foto fora e um `ler` que a reinventasse.
        expect(doOutroLado, isNotNull, reason: 'CONTROLE POSITIVO: gravou algo');
        final gravado = jsonDecode(doOutroLado!) as Map<String, dynamic>;
        final usuario = gravado['usuario'] as Map<String, dynamic>;
        expect(
          usuario['photo'],
          isNotNull,
          reason:
              'REPROVA: `photo` nao esta no mapa que vai para o chaveiro. '
              '`gravar` grava um subconjunto dos campos do usuario, e enquanto '
              '`photo` nao estava nele o avatar voltava para a inicial a cada '
              'arranque, com o servidor mandando a foto certa.',
        );

        // 2. E A VOLTA DEVOLVE A MESMA URL.
        final devolvida = await deposito.ler();
        expect(
          devolvida?.usuario.fotoUrl,
          _fotoDoUsuario,
          reason:
              'REPROVA: a foto nao sobreviveu a volta pelo formato guardado. E '
              'a sessao que o app usa no arranque, antes de qualquer renovacao.',
        );
      },
    );

    test('conta sem foto grava `null`, e a volta nao inventa foto', () async {
      final deposito = DepositoNoChaveiro();
      await deposito.gravar(
        Sessao(
          accessToken: 'access-de-15-minutos',
          refreshToken: 'refresh-de-teste',
          expiraEm: DateTime.utc(2030, 1, 1),
          usuario: Usuario.doJson(_meDoContrato(fotoUrl: null)),
        ),
      );
      final gravado = jsonDecode(doOutroLado!) as Map<String, dynamic>;
      expect((gravado['usuario'] as Map<String, dynamic>)['photo'], isNull);
      expect((await deposito.ler())?.usuario.fotoUrl, isNull);
    });
  });
}
