// AS ISCAS DA FOTO DE QUEM FALOU, **EM CADA FALA** (26/10/2026).
//
// ===========================================================================
// O DEFEITO, E ELE ESTAVA NO APARELHO DELE
// ===========================================================================
// Pedido do cliente de 22/10/2026, literal: *"inclua o icone do perfil/foto do
// usuario nas mensagens"*. Foi marcado como entregue. Em 26/10 ele voltou:
// *"voce nao colocou o icone da imagem a cada mensagem do usuario"*.
//
// Ele estava certo, e o que havia sido medido era a tela errada. MEDIDO em
// `1654bcaf`, com controle positivo (o mesmo padrao de busca casa nos outros
// tres arquivos):
//
//   `telas/mensagens/area_de_mensagens.dart`   TEM foto -- mas e a LISTA de
//                                              conversas, uma por CONVERSA
//   `telas/mural/tela_do_mural.dart`           TEM foto, no cartao
//   `telas/mural/comentarios_da_publicacao.dart` TEM foto, no comentario
//   `telas/mensagens/tela_da_conversa.dart`    **ZERO** -- nenhuma ocorrencia
//                                              de `MarcaDaPessoa`, `avatar`,
//                                              `urlDoIcone` nem `inicial`
//
// Ou seja: a CONVERSA ABERTA -- o lugar onde as falas estao, e o unico lugar
// que a frase *"a cada mensagem"* pode querer dizer -- nao tinha retrato
// nenhum. A bolha desenhava foto ANEXADA (`Message.photo_url`, o animal
// achado) e nunca o retrato de quem escreveu.
//
// ===========================================================================
// POR QUE A ASSERCAO E ANCORADA EM WIDGET, E NUNCA EM TEXTO
// ===========================================================================
// Nenhum caso aqui procura rotulo. Assercao negativa sobre texto passa no
// vazio -- um rotulo renomeado deixaria o caso verde sobre uma tela sem foto,
// que e exatamente o modo de falha que produziu este arquivo. Os casos contam
// `MarcaDaPessoa` (o widget) e leem a `url` de `ImagemDaRede` (o simbolo), e
// ancoram cada fala pela chave `mensagem-<id>` que `_corpo` ja punha.
//
// ===========================================================================
// COMO CADA CASO REPROVA COM O MECANISMO DESLIGADO
// ===========================================================================
// DESLIGAMENTO: em `telas/mensagens/tela_da_conversa.dart`, tire a `marca` dos
// `children` do `Row` de `_Bolha` (as duas insercoes, `if (!minha)` e
// `if (minha)`).
//
//   (1) `a foto aparece em CADA fala, e nao so na primeira`
//       reprova: esperava 3 marcas, achou 0.
//   (2) CONTROLE POSITIVO `duas falas de pessoas diferentes levam CADA UMA a
//       sua foto` -- reprova por nao achar `ImagemDaRede` nas falas.
//       **Ele e o caso que o conserto errado nao passa**: uma implementacao
//       que pusesse a MESMA foto em toda bolha (a do outro lado, ou a do
//       `AvatarDaConta`) satisfaz o caso (1) e reprova este, porque ele exige
//       que as duas urls sejam DIFERENTES e cada uma a do seu papel.
//   (3) `a fala do SISTEMA nao recebe marca de pessoa` -- contrapeso: ele
//       reprova se alguem "completar a cobertura" pondo marca em tudo. Com o
//       mecanismo desligado ele passa, e e por isso que ele nao conta como
//       isca da foto: ele e o freio.
//   (4) `sem foto, a inicial e a de QUEM FALOU` -- reprova por nao achar as
//       marcas. Prova a queda para a inicial, que e o estado NORMAL desta tela
//       (conversa com estranho: `photo_icon_url` chega nula).

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mensagens/tela_da_conversa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/marca_da_pessoa.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String idDaConversa = '0192f3a1-7b2c-7def-8a01-00000000ca11';

/// As DUAS fotos, e elas sao diferentes de propósito: o controle positivo (2)
/// depende de poder distinguir uma da outra.
///
/// Sao as derivadas `thumb` de 176 px de
/// `Conversation.participants[].photo_icon_url` -- a foto do RETRATO, e nao a
/// `Message.photo_url`, que e o animal achado.
const String fotoDoTutor = 'https://midia.bichu.test/p/tutor-176.jpeg';
const String fotoDoAchador = 'https://midia.bichu.test/p/achador-176.jpeg';

const String idDaFalaDoAchador = '0192f3a1-7b2c-7def-8a01-00000000f001';
const String idDaFalaDoTutor = '0192f3a1-7b2c-7def-8a01-00000000f002';
const String idDaSegundaDoAchador = '0192f3a1-7b2c-7def-8a01-00000000f003';
const String idDaFalaDoSistema = '0192f3a1-7b2c-7def-8a01-00000000f004';

Map<String, dynamic> fala({
  required String id,
  required String papel,
  String corpo = 'Achei ele na praça da Matriz, está bem',
}) => <String, dynamic>{
  'id': id,
  'sender_role': papel,
  'body': corpo,
  'redactions': <Map<String, dynamic>>[],
  'photo_url': null,
  'created_at': '2026-10-18T13:52:00.000Z',
};

/// Uma `Conversation` aberta com os participantes e as falas que o caso pedir.
///
/// **Os participantes sao parametro**, e nao fixos: o estado de conexao aceita
/// (foto preenchida) e o de estranho (foto nula) sao os DOIS estados reais do
/// contrato, e os casos (2) e (4) medem um cada.
Map<String, dynamic> corpoDaConversa({
  required List<Map<String, dynamic>> falas,
  String? fotoDoLadoTutor,
  String? fotoDoLadoAchador,
}) => <String, dynamic>{
  'id': idDaConversa,
  'case_id': null,
  'pet_display_name': 'Tobias',
  'status': 'open',
  'participants': <Map<String, dynamic>>[
    <String, dynamic>{
      'role': 'tutor',
      'display_name': 'Leandro',
      'handle': null,
      'photo_icon_url': fotoDoLadoTutor,
    },
    <String, dynamic>{
      'role': 'finder',
      'display_name': 'Marina',
      'handle': null,
      'photo_icon_url': fotoDoLadoAchador,
    },
  ],
  'messages': falas,
  'unread': false,
  'last_message_preview': null,
  'last_message_at': null,
  'next_cursor': null,
};

ConversasApi _apiCom(Map<String, dynamic> corpo) {
  AppConfig.limparParaTeste();
  return ConversasApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
      cliente: MockClient((http.Request req) async {
        if (req.url.path == '/v1/conversations/$idDaConversa') {
          return http.Response(
            jsonEncode(corpo),
            200,
            headers: const <String, String>{
              'content-type': 'application/json; charset=utf-8',
            },
          );
        }
        if (req.url.path == '/v1/me/conversations-seen') {
          return http.Response('', 204);
        }
        // 404 e nao 200 vazio: e o que o servidor responde para recurso que
        // nao e do chamador (ADR-0021). Um 200 vazio deixaria os casos verdes
        // pelo motivo errado.
        return http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://api.bichu.app/problems/not-found',
            'title': 'Nao foi possivel concluir',
            'status': 404,
          }),
          404,
          headers: const <String, String>{
            'content-type': 'application/problem+json; charset=utf-8',
          },
        );
      }),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

/// Monta a TELA DE VERDADE, e nao o widget da bolha sozinho.
///
/// Com a bolha isolada, voltar `_corpo` a nao passar o autor deixaria este
/// arquivo verde sobre uma tela sem foto.
Future<void> abrirAConversa(
  WidgetTester tester,
  Map<String, dynamic> corpo,
) async {
  tester.view.physicalSize = const Size(375 * 3, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: TelaDaConversa(conversaId: idDaConversa, conversas: _apiCom(corpo)),
    ),
  );
  await tester.pumpAndSettle();
}

/// A marca de pessoa DENTRO da fala de [id].
///
/// Ancorada na chave `mensagem-<id>` que `_corpo` da tela ja punha. Medir
/// `find.byType(MarcaDaPessoa).at(n)` em vez disto amarraria o caso a ORDEM de
/// construcao, e uma marca no lugar errado continuaria verde.
Finder marcaNaFala(String id) => find.descendant(
  of: find.byKey(ValueKey<String>('mensagem-$id')),
  matching: find.byType(MarcaDaPessoa),
);

void main() {
  testWidgets('a foto aparece em CADA fala, e nao so na primeira', (
    tester,
  ) async {
    await abrirAConversa(
      tester,
      corpoDaConversa(
        falas: <Map<String, dynamic>>[
          fala(id: idDaFalaDoAchador, papel: 'finder'),
          fala(id: idDaFalaDoTutor, papel: 'tutor', corpo: 'É ele! Obrigado'),
          fala(
            id: idDaSegundaDoAchador,
            papel: 'finder',
            corpo: 'Te espero aqui então',
          ),
        ],
        fotoDoLadoTutor: fotoDoTutor,
        fotoDoLadoAchador: fotoDoAchador,
      ),
    );

    // TRES falas, TRES marcas. **O numero e o que importa**: com a marca so na
    // primeira -- o defeito que o cliente descreveu com as palavras "a cada"
    // -- este caso acha 1 e reprova dizendo quantas faltaram.
    expect(
      find.byType(MarcaDaPessoa),
      findsNWidgets(3),
      reason:
          'Sao tres falas na conversa e a foto de quem falou tem de estar em '
          'CADA uma. O cliente pediu "a cada mensagem do usuario", e uma marca '
          'so na primeira fala e exatamente o defeito que ele apontou em '
          '26/10.',
    );

    // E cada uma esta DENTRO da sua fala, e nao tres soltas no corpo.
    for (final id in <String>[
      idDaFalaDoAchador,
      idDaFalaDoTutor,
      idDaSegundaDoAchador,
    ]) {
      expect(
        marcaNaFala(id),
        findsOneWidget,
        reason:
            'A fala $id ficou sem marca de pessoa. Contar as marcas no corpo '
            'inteiro nao basta: elas tem de estar cada uma dentro da sua '
            'bolha.',
      );
    }
  });

  // =========================================================================
  // CONTROLE POSITIVO
  // =========================================================================
  testWidgets(
    'CONTROLE POSITIVO: duas falas de pessoas diferentes levam CADA UMA a sua '
    'foto, e nao a mesma repetida',
    (tester) async {
      await abrirAConversa(
        tester,
        corpoDaConversa(
          falas: <Map<String, dynamic>>[
            fala(id: idDaFalaDoAchador, papel: 'finder'),
            fala(id: idDaFalaDoTutor, papel: 'tutor', corpo: 'É ele! Obrigado'),
          ],
          fotoDoLadoTutor: fotoDoTutor,
          fotoDoLadoAchador: fotoDoAchador,
        ),
      );

      // A `url` sai do simbolo (`ImagemDaRede.url`), e nunca de texto na tela.
      String urlNaFala(String id) => tester
          .widget<ImagemDaRede>(
            find.descendant(
              of: marcaNaFala(id),
              matching: find.byType(ImagemDaRede),
            ),
          )
          .url;

      final doAchador = urlNaFala(idDaFalaDoAchador);
      final doTutor = urlNaFala(idDaFalaDoTutor);

      // **ESTE E O PAR QUE O CONSERTO ERRADO NAO PASSA.** Pintar a foto do
      // outro lado em toda bolha -- ou a propria, do `AvatarDaConta` -- faz o
      // caso (1) passar e este reprovar aqui: as duas urls viriam iguais.
      expect(
        doAchador,
        fotoDoAchador,
        reason:
            'A fala de quem achou levou "$doAchador" em vez da foto dela '
            '($fotoDoAchador). A marca de cada fala sai do participante cujo '
            '`role` casa com o `sender_role` da mensagem.',
      );
      expect(
        doTutor,
        fotoDoTutor,
        reason:
            'A fala do tutor levou "$doTutor" em vez da foto dele '
            '($fotoDoTutor).',
      );
      expect(
        doAchador,
        isNot(doTutor),
        reason:
            'As duas falas levaram a MESMA foto. Duas pessoas diferentes '
            'falaram, e cada fala tem de levar o retrato de quem a escreveu -- '
            'uma foto repetida em toda bolha passaria pelo caso que so CONTA '
            'as marcas.',
      );
    },
  );

  // =========================================================================
  // CONTRAPESOS
  // =========================================================================
  testWidgets('a fala do SISTEMA nao recebe marca de pessoa', (tester) async {
    await abrirAConversa(
      tester,
      corpoDaConversa(
        falas: <Map<String, dynamic>>[
          fala(
            id: idDaFalaDoSistema,
            papel: 'system',
            corpo: 'Esta conversa foi aberta pelo aviso de achado.',
          ),
          fala(id: idDaFalaDoAchador, papel: 'finder'),
        ],
        fotoDoLadoTutor: fotoDoTutor,
        fotoDoLadoAchador: fotoDoAchador,
      ),
    );

    // O CONTROLE DA SONDA NEGATIVA: a fala do achador TEM marca. Sem esta
    // linha, o `findsNothing` abaixo passaria numa tela que nao desenhou nada.
    expect(
      marcaNaFala(idDaFalaDoAchador),
      findsOneWidget,
      reason:
          'Controle da sonda: a fala de quem achou tem de ter marca. Sem ela, '
          'a ausencia medida na fala do sistema nao prova nada.',
    );

    expect(
      marcaNaFala(idDaFalaDoSistema),
      findsNothing,
      reason:
          'A fala do sistema recebeu marca de pessoa. Ela NAO e de nenhum dos '
          'dois lados -- atribui-la a um faria parecer que aquela pessoa '
          'escreveu o aviso --, e `participants` nem traz o papel `system`.',
    );
  });

  testWidgets('sem foto, a inicial e a de QUEM FALOU', (tester) async {
    // OS DOIS LADOS SEM FOTO: o estado NORMAL desta tela. `photo_icon_url` so
    // vem preenchida quando o outro lado e conexao aceita, e a conversa de
    // achado com um estranho e o caso comum.
    await abrirAConversa(
      tester,
      corpoDaConversa(
        falas: <Map<String, dynamic>>[
          fala(id: idDaFalaDoAchador, papel: 'finder'),
          fala(id: idDaFalaDoTutor, papel: 'tutor', corpo: 'É ele! Obrigado'),
        ],
      ),
    );

    // A marca continua existindo nas duas falas -- cair na inicial nao e
    // esconder o circulo. Esconder devolveria o defeito do cliente: ele veria
    // falas com retrato e falas sem.
    expect(find.byType(MarcaDaPessoa), findsNWidgets(2));

    String inicialNaFala(String id) =>
        tester.widget<MarcaDaPessoa>(marcaNaFala(id)).inicial;

    expect(
      inicialNaFala(idDaFalaDoAchador),
      'M',
      reason:
          'A fala de Marina devia cair na inicial "M". A letra sai de '
          '`ParticipanteDaConversa.marcaNeutra`, que e a regra do contrato (a '
          'PRIMEIRA letra -- o servidor promete que sobrenome nao sai).',
    );
    expect(
      inicialNaFala(idDaFalaDoTutor),
      'L',
      reason: 'A fala de Leandro devia cair na inicial "L".',
    );
    expect(
      tester.widget<MarcaDaPessoa>(marcaNaFala(idDaFalaDoAchador)).urlDoIcone,
      isNull,
      reason:
          'Sem `photo_icon_url` no corpo, a marca nao pode inventar url -- o '
          'recorte de quem pode ver a foto de quem e do SERVIDOR, e a tela '
          'pinta o que veio.',
    );
  });
}
