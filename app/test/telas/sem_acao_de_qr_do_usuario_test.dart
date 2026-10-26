// A ISCA DE QUE AS ACOES DE QR DO USUARIO **NAO VOLTAM** (26/10/2026).
//
// ===========================================================================
// O PEDIDO, E AS DUAS METADES DELE
// ===========================================================================
// - **22/10/2026**, literal: *"O usuario nao gera o qr-code dele… nao deve ter
//   a acao de trocar o qr-code dele ou de apagar."*
// - **26/10/2026**, a metade positiva: *"o usuario nao deve criar o qr-code,
//   ele deve ser criado automaticamente quando o usuario se cadastrar ou ele
//   cadastrar seu pet."*
//
// ===========================================================================
// EXISTEM **DOIS** QR NO PRODUTO, E ESTE ARQUIVO MEDE UM
// ===========================================================================
// Medido em `1654bcaf`: `app/lib/widgets/` tem exatamente dois QR, e eles
// nascem em lugares diferentes.
//
//   `QrDaPlaquinha`  o QR DO PET. Nasce SOZINHO: `TelaPetCadastrado` chama
//                    `emitirTag` em `didChangeDependencies`, sem toque nenhum.
//                    **Nao ha acao de criar, de trocar nem de apagar** na pasta
//                    `telas/pet/` -- `pets_api.dart` nao tem metodo de
//                    revogacao, e o `Desativar a tag` que aparece em
//                    `tela_detalhe_do_pet.dart:76` esta na lista "Ficam de
//                    fora" do cabecalho: e COMENTARIO sobre uma ausencia
//                    deliberada, e nao codigo.
//   `QrDoConvite`    o QR DA PESSOA, nesta tela. **Tinha as tres acoes**:
//                    `Criar o meu QR de convite`, `Trocar o meu QR` e
//                    `Apagar o meu QR`.
//
// Ou seja: o que o cliente descreveu estava AQUI, e nao no pet. Esta tela
// nasceu em 21/10 (`d6cf67bd`), **um dia antes** da fala dele de 22/10.
//
// ===========================================================================
// O QUE SAIU, E O QUE DE PROPOSITO NAO SAIU
// ===========================================================================
// SAIRAM `Trocar o meu QR` e `Apagar o meu QR`, com os avisos de cada uma.
//
// **FICOU `Criar o meu QR de convite`, e isso e uma ressalva parada no
// cliente.** Medido em `api/openapi.yaml`: as operacoes de convite sao tres --
// `issueConnectionInvite` (7268), `revokeConnectionInvite` (7343) e
// `resolveConnectionInvite` (7378), que e o lado de quem ESCANEIA. **Nao existe
// operacao de leitura do proprio convite**, porque o banco guarda so o
// SHA-256. Sem `Criar` esta tela nao teria QR nenhum; e emitir sozinha na
// abertura revogaria o convite anterior a cada visita, que e o dano de
// `Trocar` sem ninguem ter pedido. Tornar a criacao automatica passa pelo
// `openapi.yaml`, que tem portao de compatibilidade.
//
// **E A CAPACIDADE DO SERVIDOR NAO FOI ARRANCADA.** `ConvitesApi.revogar`
// continua em `api/convites_api.dart` e `revokeConnectionInvite` continua no
// contrato, intocados -- as decisoes dele de 17/10 (*"apenas desabilite na
// plataforma"*) e de 26/10 (*"nao apague nada, mantenha e corrija a
// politica"*) mandam nao confundir tirar a porta com tirar a capacidade.
//
// ===========================================================================
// COMO CADA CASO REPROVA COM O MECANISMO DESLIGADO
// ===========================================================================
// DESLIGAMENTO: em `telas/conexoes/convide_tutores.dart`, reponha no `else` de
// `_blocoDoConvite` os dois `BotaoSecundario` (`Trocar o meu QR` -> `_emitir`,
// `Apagar o meu QR` -> `_apagar`).
//
//   (1) `com o QR na tela, nao ha segunda acao nenhuma` -- reprova: acha 2
//       `BotaoSecundario` onde exige 0.
//   (2) `o rotulo das acoes tiradas nao existe mais no arquivo` -- reprova ao
//       achar o texto na fonte. Ancorado na FONTE e nao na tela: um rotulo
//       renomeado ao repor o botao passaria por (1) se (1) olhasse texto, e e
//       por isso que (1) olha TIPO e este olha a fonte.
//   (3) `a tela nao alcanca a revogacao` -- reprova: o toque no botao reposto
//       faz sair o `DELETE`.
//
// **ASSERCAO NEGATIVA NAO PASSA NO VAZIO AQUI**: (1) e (3) so correm depois de
// o QR estar na tela, provado por `findsOneWidget` sobre `QrDoConvite`, e (1)
// confere que o `BotaoPrimario` de criar EXISTE no estado vazio -- e isso que
// prova que o localizador de botao funciona.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/convites_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conexoes/convide_tutores.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/qr_do_convite.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../dispositivo/diretivas_dart.dart';

const String _urlBase = 'https://api.teste.bichu';
const String _token = 'KJ8M4QRS7TVW2XYZ';

/// A FONTE da tela, lida do disco.
///
/// O caso (2) mede o ARQUIVO e nao a arvore de widgets: e a unica forma de
/// provar que o rotulo nao ficou para tras como constante morta, a um
/// `BotaoSecundario` de distancia de o controle voltar sem texto novo.
File get _fonteDaTela =>
    File('lib/telas/conexoes/convide_tutores.dart');

void main() {
  late List<String> chamadas;

  Future<void> montar(WidgetTester tester) async {
    chamadas = <String>[];
    AppConfig.limparParaTeste();
    final cliente = MockClient((http.Request pedido) async {
      chamadas.add('${pedido.method} ${pedido.url.path}');
      if (pedido.method == 'POST' &&
          pedido.url.path.endsWith('/connection-invites')) {
        return http.Response(
          jsonEncode(<String, dynamic>{
            'invite_token': _token,
            'expires_at': '2026-11-20T12:00:00.000Z',
          }),
          201,
          headers: const <String, String>{
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      if (pedido.url.path.endsWith('/connections/summary')) {
        return http.Response(
          jsonEncode(<String, dynamic>{
            'connected_count': 12,
            'pending_sent_count': 2,
            'requests_received_count': 1,
            'remaining_requests_today': 7,
            'connection_limit': 150,
            'invited_joined_count': 0,
          }),
          200,
          headers: const <String, String>{
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      // O 204 do `DELETE` FICA RESPONDIDO de propósito: se o caso (3) falhar,
      // ele falha pela chamada ter saido -- e nao por um 404 que faria a tela
      // acender uma faixa e o motivo da reprovacao virar outro.
      if (pedido.method == 'DELETE') return http.Response('', 204);
      return http.Response('{}', 404);
    });

    final api = ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
      cliente: cliente,
      tokenDeAcesso: () async => 'token-de-teste',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: TelaDeConvidarTutores(
          convites: ConvitesApi(api),
          conexoes: ConexoesApi(api),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('com o QR na tela, nao ha segunda acao nenhuma', (tester) async {
    await montar(tester);

    // CONTROLE POSITIVO DO LOCALIZADOR: no estado vazio existe UM botao, o de
    // criar. Sem esta linha, o `findsNothing` adiante poderia estar medindo um
    // localizador que nunca acha nada.
    expect(
      find.byType(BotaoPrimario),
      findsOneWidget,
      reason:
          'Controle positivo: o estado sem convite tem de oferecer a acao de '
          'criar. Se ela tambem desapareceu, as assercoes negativas deste '
          'arquivo nao provam nada.',
    );

    await tester.tap(find.text('Criar o meu QR de convite'));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO DO ESTADO: chegamos ao estado que TINHA as duas acoes.
    expect(
      find.byType(QrDoConvite),
      findsOneWidget,
      reason:
          'Controle positivo: o QR tem de estar na tela. As duas acoes '
          'tiradas so existiam neste estado, e medir a ausencia delas no '
          'estado vazio seria medir o vazio.',
    );

    // A ASSERCAO. Ancorada no TIPO `BotaoSecundario`: `Trocar` e `Apagar`
    // eram os dois unicos desta tela, entao qualquer rotulo que reponha uma
    // delas reprova aqui -- renomear nao escapa.
    expect(
      find.byType(BotaoSecundario),
      findsNothing,
      reason:
          'REPROVA: a tela voltou a oferecer acao secundaria com o QR na '
          'tela. `Trocar o meu QR` e `Apagar o meu QR` eram as duas, e o '
          'cliente tirou as duas em 22/10: *"nao deve ter a acao de trocar o '
          'qr-code dele ou de apagar"*.',
    );
  });

  test('o rotulo das acoes tiradas nao existe mais no CODIGO da tela', () {
    // **O FONTE SEM COMENTARIOS, e isto nao e detalhe.** O cabecalho daquele
    // arquivo CITA os dois rotulos em prosa, de propósito, para que quem for
    // repor saiba o que foi tirado e por quem. Uma busca sobre o fonte cru
    // reprovaria pela documentacao da propria decisao -- que e exatamente o
    // modo de falha que ja fez uma sonda reportar quatro ocorrencias que eram
    // so comentario. `semComentarios` vem de
    // `test/dispositivo/diretivas_dart.dart` e existe para este caso.
    final codigo = semComentarios(_fonteDaTela.readAsStringSync());

    // CONTROLE POSITIVO DA LEITURA: li a fonte certa, e o corta-comentario nao
    // comeu o codigo. Sem estas duas linhas, um caminho errado -- ou um
    // `semComentarios` que devolvesse vazio -- deixaria as duas buscas abaixo
    // "sem achar" e o caso verde sobre nada.
    expect(
      codigo,
      contains('class TelaDeConvidarTutores'),
      reason:
          'Controle positivo: nao li o CODIGO da tela do convite. Sem ele, as '
          'duas buscas abaixo passariam por eu ter lido o arquivo errado -- ou '
          'por `semComentarios` ter devolvido vazio.',
    );
    expect(
      codigo,
      contains("'Criar o meu QR de convite'"),
      reason:
          'Controle positivo: o rotulo de criar tem de estar no codigo. Ele '
          'prova que a busca por rotulo NESTE arquivo acha o que existe.',
    );

    expect(
      codigo.contains('Trocar o meu QR'),
      isFalse,
      reason:
          'REPROVA: o rotulo `Trocar o meu QR` voltou ao CODIGO de '
          '`convide_tutores.dart`. Constante de rotulo sobrando e um '
          '`BotaoSecundario` de distancia de a acao voltar, e voltaria sem '
          'nenhum texto novo no arquivo.',
    );
    expect(
      codigo.contains('Apagar o meu QR'),
      isFalse,
      reason:
          'REPROVA: o rotulo `Apagar o meu QR` voltou ao CODIGO de '
          '`convide_tutores.dart`.',
    );
  });

  testWidgets('a tela nao alcanca a revogacao do convite', (tester) async {
    await montar(tester);
    await tester.tap(find.text('Criar o meu QR de convite'));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO: a emissao SAIU. Prova que `chamadas` registra de
    // verdade -- sem ele, o `isNot(contains(...))` abaixo passaria sobre uma
    // lista que nunca recebeu nada.
    expect(
      chamadas,
      contains('POST /v1/connection-invites'),
      reason:
          'Controle positivo: a emissao tem de ter saido. Sem ela a lista de '
          'chamadas esta vazia e a ausencia do DELETE nao prova nada.',
    );

    // TOCA EM TUDO o que a tela oferece neste estado. Com qualquer das duas
    // acoes reposta, um destes toques a aciona.
    for (final alvo in <Finder>[
      find.byType(BotaoPrimario),
      find.byType(BotaoSecundario),
    ]) {
      for (var i = 0; i < alvo.evaluate().length; i++) {
        await tester.ensureVisible(alvo.at(i));
        await tester.pumpAndSettle();
        await tester.tap(alvo.at(i));
        await tester.pumpAndSettle();
      }
    }

    expect(
      chamadas,
      isNot(contains('DELETE /v1/connection-invites')),
      reason:
          'REPROVA: um toque desta tela revogou o convite. A capacidade do '
          'servidor continua existindo de propósito (decisoes de 17/10 e '
          '26/10); o que saiu foi a PORTA, e nenhum toque daqui pode '
          'alcanca-la.',
    );
  });
}
