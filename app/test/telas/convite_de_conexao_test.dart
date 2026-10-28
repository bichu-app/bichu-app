// O convite de conexão: o QR no perfil, a tela de `Convide tutores`, e o
// leitor que passou a ler DOIS QR.
//
// As iscas deste arquivo, pelo nome do caso:
//
//   (a) **o QR do convite abre o perfil certo** — o leitor reconhece o token,
//       resolve no servidor e empurra `/pessoa/<apelido>` com o token no
//       `extra`, que é a credencial do pedido;
//   (b) **o QR da plaquinha continua funcionando** — e este é o CONTRAPESO.
//       É ele que impede o reuso do leitor de quebrar o caminho do achador, que
//       é a cunha do produto. Sem este caso, (a) poderia ser verdade com o
//       caminho do achador morto;
//   (c) **as duas formas são mutuamente exclusivas por construção** — medido
//       nas duas funções puras, nos dois sentidos, sem app montado;
//   (d) **não há ação de compartilhar o perfil** — a ausência é desenhada, e
//       não um botão desabilitado (critério 2 da BICHUS-62);
//   (e) **a seção conta só quem aceitou E tem pet com foto** — e, como a
//       contagem não tem rota no contrato, a tela NÃO a simula: o estado é
//       "ninguém ainda" mesmo com conexões na conta.
//
// Todo esperado está escrito por extenso, com acento.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/convites_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conexoes/convide_tutores.dart';
import 'package:bichu/telas/escanear/codigo_lido_do_qr.dart';
import 'package:bichu/telas/escanear/convite_lido_do_qr.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/qr_do_convite.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

const String _urlBase = 'https://api.exemplo.test';

/// Um token como `opaqueToken` o produz: 32 bytes em base64url, 43 símbolos.
const String tokenDeConvite = 'AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8YzA9bCd0eF-';

/// O que a plaquinha de verdade carrega.
const String codigoDaPlaquinha = '7K2MQ1D4B8NV3XZ0';
const String qrDaPlaquinha = 'https://bichu.app/t/$codigoDaPlaquinha';

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

void main() {
  group('ISCA (c) -- as duas formas de QR nao se confundem', () {
    final Uri apiDeTeste = Uri.parse(_urlBase);

    test('o token de convite e reconhecido como convite', () {
      expect(
        tokenDeConviteDoQr(tokenDeConvite),
        tokenDeConvite,
        reason: 'REPROVA: um token de 43 símbolos base64url não foi '
            'reconhecido como convite.',
      );
      expect(
        tokenDeConvite.length,
        43,
        reason: 'REPROVA: o token do caso deixou de ter o tamanho que '
            '`opaqueToken` produz, e o caso passou a medir outra coisa.',
      );
    });

    test('o token de convite NAO passa por codigo de plaquinha', () {
      // PARA DESLIGAR E VER REPROVAR: em `codigo_lido_do_qr.dart`, aceite
      // texto solto em `codigoDeTagDoQr`.
      expect(
        codigoDeTagDoQr(tokenDeConvite, apiBaseUrl: apiDeTeste),
        isNull,
        reason: 'REPROVA: o token de convite foi lido como código de '
            'plaquinha. O leitor abriria a página de um pet com a credencial '
            'de conexão de alguém.',
      );
    });

    test('o QR da plaquinha NAO passa por convite', () {
      // O alfabeto base64url não tem `.`, `/` nem `:`, então a URL cai fora
      // pela própria forma -- sem nenhum caso especial a manter.
      expect(
        tokenDeConviteDoQr(qrDaPlaquinha),
        isNull,
        reason: 'REPROVA: a URL da plaquinha foi lida como token de convite. '
            'O app pediria a resolução de um convite que não existe, e '
            'gastaria o teto de 20 tentativas inválidas por hora.',
      );
    });

    test('o codigo impresso de 16 simbolos NAO passa por convite', () {
      expect(
        tokenDeConviteDoQr(codigoDaPlaquinha),
        isNull,
        reason: 'REPROVA: o código de 16 símbolos passou pelo piso de 20 do '
            'token de convite.',
      );
      expect(
        temFormaDeCodigoDeTag(codigoDaPlaquinha),
        isTrue,
        reason: 'REPROVA: o código impresso deixou de ter forma de código de '
            'plaquinha, e o contrapeso deste grupo virou vazio.',
      );
    });

    test('o que nao e nenhum dos dois nao e nada', () {
      for (final lixo in <String>[
        '',
        '   ',
        'https://exemplo.test/promocao',
        'curto',
        'tem espaço no meio do texto todo',
        'tem.ponto.e.nao.e.base64url.mas.tem.vinte.caracteres',
      ]) {
        expect(
          tokenDeConviteDoQr(lixo),
          isNull,
          reason: 'REPROVA: "$lixo" foi lido como token de convite.',
        );
      }
    });
  });

  group('a tela de Convide tutores', () {
    late List<String> chamadas;

    Future<void> montar(
      WidgetTester tester, {
      bool emissaoFalha = false,
      /// Quantos tutores o SERVIDOR diz que esta conta trouxe, ou nulo para
      /// `getMyConnectionSummary` falhando -- os dois estados que a tela
      /// desenha de formas diferentes.
      int? convidados = 0,
    }) async {
      chamadas = <String>[];
      AppConfig.limparParaTeste();
      final cliente = MockClient((http.Request pedido) async {
        chamadas.add('${pedido.method} ${pedido.url.path}');
        if (pedido.method == 'POST' &&
            pedido.url.path.endsWith('/connection-invites')) {
          if (emissaoFalha) return _json(<String, dynamic>{}, status: 500);
          return _json(<String, dynamic>{
            'invite_token': tokenDeConvite,
            'expires_at': '2026-11-20T12:00:00.000Z',
          }, status: 201);
        }
        if (pedido.url.path.endsWith('/connections/summary')) {
          if (convidados == null) return _json(<String, dynamic>{}, status: 500);
          return _json(<String, dynamic>{
            'connected_count': 12,
            'pending_sent_count': 2,
            'requests_received_count': 1,
            'remaining_requests_today': 7,
            'connection_limit': 150,
            'invited_joined_count': convidados,
          });
        }
        if (pedido.method == 'DELETE') return http.Response('', 204);
        return _json(<String, dynamic>{}, status: 404);
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

    testWidgets('abre sem QR, e nenhuma chamada sai sozinha', (tester) async {
      // Não existe leitura do próprio convite: o token em claro existe uma vez,
      // na resposta da emissão, porque o banco guarda só o SHA-256. Uma tela
      // que tentasse "carregar o meu convite" chamaria uma operação que não
      // existe.
      await montar(tester);

      expect(
        chamadas,
        isNot(contains('POST /v1/connection-invites')),
        reason: 'REPROVA: a tela EMITIU convite ao abrir. Emitir é escrita '
            'irreversível -- ela revoga o convite anterior --, e não pode '
            'acontecer sem alguém tocar. A leitura do resumo é outra coisa: ela '
            'não escreve nada, e é de onde vem o contador.',
      );
      expect(find.byType(QrDoConvite), findsNothing);
      expect(find.text('Criar o meu QR de convite'), findsOneWidget);
    });

    testWidgets('ISCA (e) -- zero do servidor e "Ninguem ainda", e nao trilha', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `_placarDoReconhecimento`, tire o ramo
      // de `quantos == 0`.
      //
      // Zero é uma AFIRMAÇÃO do servidor: ninguém entrou ainda. Desenhar a
      // trilha com zero marcos alcançados afirmaria um progresso que não
      // começou.
      await montar(tester);

      expect(find.text('Ninguém ainda'), findsOneWidget);
      expect(
        find.byType(TrilhaDeConvites),
        findsNothing,
        reason: 'REPROVA: a trilha foi desenhada com zero. O vazio é o estado '
            'de quem ainda não trouxe ninguém.',
      );
    });

    testWidgets('o contador VEM DO SERVIDOR, e a trilha aparece com ele', (
      tester,
    ) async {
      // **A regra dos dois sinais mora no servidor, numa fonte só** -- conexão
      // aceita nascida de convite E pessoa com pet de foto `ready`. O app lê o
      // número e não o recalcula: dois clientes com a própria cópia da regra
      // contariam diferente.
      //
      // PARA DESLIGAR E VER REPROVAR: em `_lerOPlacar`, troque
      // `resumo.invitedJoinedCount` por `resumo.connectedCount`. Este caso
      // reprova com 12, que é o número de conexões da bancada -- e é
      // exatamente o defeito: contar conexões de qualquer procedência.
      await montar(tester, convidados: 2);

      expect(
        chamadas,
        contains('GET /v1/connections/summary'),
        reason: 'REPROVA: a tela não leu o resumo. O contador vem de '
            '`invited_joined_count`, e não de nada que o app saiba somar.',
      );
      expect(find.byType(TrilhaDeConvites), findsOneWidget);
      expect(
        find.text(
          '2 tutores entraram no Bichu com o seu convite e já cadastraram um '
          'pet.',
        ),
        findsOneWidget,
        reason: 'REPROVA: o número do servidor não chegou à frase, ou a frase '
            'deixou de dizer a REGRA pela qual alguém conta.',
      );
      expect(
        find.text('Ninguém ainda'),
        findsNothing,
        reason: 'REPROVA: a tela diz que ninguém entrou com duas pessoas '
            'contadas.',
      );
    });

    testWidgets('ISCA -- resumo que FALHA nao vira "Ninguem ainda"', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `_lerOPlacar`, troque
      // `_placar = null` por `_placar = 0` no `catch`.
      //
      // Nulo é "não consegui perguntar" e zero é "ninguém ainda". Dizer que
      // ninguém entrou sobre uma pergunta que não foi respondida é afirmar o
      // que o servidor não disse -- e para quem trouxe dez pessoas é uma
      // mentira visível.
      await montar(tester, convidados: null);

      expect(
        find.text('Ninguém ainda'),
        findsNothing,
        reason: 'REPROVA: a falha de leitura do resumo virou a afirmação de '
            'que ninguém entrou.',
      );
      expect(find.byType(TrilhaDeConvites), findsNothing);
      expect(
        find.text('Criar o meu QR de convite'),
        findsOneWidget,
        reason: 'REPROVA: a falha do placar levou embora o que a pessoa veio '
            'fazer aqui. O placar é reconhecimento; o QR é a tela.',
      );
    });

    testWidgets('o QR diz que e APP-PARA-APP, e nao promete a camera comum', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: tire o `Text` de `oQrEDeAppParaApp` de
      // `_blocoDoConvite`.
      //
      // Sem a frase a pessoa aponta a câmera comum para o quadrado, nada
      // acontece que ela reconheça, e ela conclui que o recurso está quebrado.
      // E para quem NÃO tem o Bichu nada funciona hoje -- a tela não pode
      // prometer que funciona.
      await montar(tester);
      await tester.tap(find.text('Criar o meu QR de convite'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('abrir o Bichu e escanear'),
        findsOneWidget,
        reason: 'REPROVA: a tela não diz que o QR é lido de dentro do Bichu. '
            'Não existe página de convite no site, o app não abre por link, e '
            'quem aponta a câmera comum não chega a lugar nenhum.',
      );
      expect(
        find.textContaining('WhatsApp'),
        findsNothing,
        reason: 'REPROVA: a tela promete mandar o convite por WhatsApp. O link '
            'público não existe, e mandar um endereço que abre 404 é pior que '
            'não ter o botão.',
      );
    });

    // ATUALIZADO EM 26/10/2026, E A MUDANCA E DE REGRA E NAO DE ASSERCAO.
    //
    // Este caso se chamava `criar mostra o QR, o prazo e as duas saidas` e
    // exigia `Trocar o meu QR` e `Apagar o meu QR` na tela. **O cliente
    // reverteu as duas**, em 22/10 (*"nao deve ter a acao de trocar o qr-code
    // dele ou de apagar"*) e de novo em 26/10. As assercoes que as cobravam
    // sairam porque elas cobravam o defeito; o que elas mediam de valido -- o
    // QR aparece, o prazo aparece -- ficou. A regra NOVA tem isca propria em
    // `app/test/telas/sem_acao_de_qr_do_usuario_test.dart`.
    testWidgets('criar mostra o QR e o prazo, e nao oferece saida nenhuma', (
      tester,
    ) async {
      await montar(tester);

      await tester.tap(find.text('Criar o meu QR de convite'));
      await tester.pumpAndSettle();

      expect(
        chamadas,
        contains('POST /v1/connection-invites'),
        reason: 'REPROVA: criar não chamou a emissão.',
      );
      expect(find.byType(QrDoConvite), findsOneWidget);
      expect(
        find.text('Vale até 20 nov.'),
        findsOneWidget,
        reason: 'REPROVA: o prazo de 30 dias não aparece. Um convite sem prazo '
            'visível é um endereço público permanente do ponto de vista de '
            'quem o compartilha.',
      );
    });

    testWidgets('o QR carrega o TOKEN, e nao uma URL', (tester) async {
      // PARA DESLIGAR E VER REPROVAR: em `_blocoDoConvite`, troque
      // `QrDoConvite(token: convite.inviteToken)` por
      // `QrDoConvite(token: 'https://bichu.app/c/${convite.inviteToken}')`.
      //
      // Quatro medições sustentam isto, e estão em `convite_lido_do_qr.dart`:
      // o destino exige conta, a página web do convite não existe (e `/c/` já
      // é da conversa do achador), o app não abre por link, e o servidor
      // recusa montar o endereço. Um QR com URL seria um QR que a câmera comum
      // abre num 404 que afirma `Esta página não existe no site do Bichu`.
      await montar(tester);
      await tester.tap(find.text('Criar o meu QR de convite'));
      await tester.pumpAndSettle();

      final qr = tester.widget<QrDoConvite>(find.byType(QrDoConvite));
      expect(
        qr.token,
        tokenDeConvite,
        reason: 'REPROVA: o QR não carrega o token puro.',
      );
      expect(
        qr.token.contains('/'),
        isFalse,
        reason: 'REPROVA: o QR carrega um endereço. Não existe página de '
            'convite no site, e o app não abre por link.',
      );
    });

    // ESTE CASO FOI INVERTIDO EM 26/10/2026, e nao apagado.
    //
    // Ele media `apagar volta ao estado sem QR`: tocava em `Apagar o meu QR` e
    // exigia o `DELETE`. **A acao nao existe mais** (pedido do cliente de
    // 22/10, repetido em 26/10), entao o que ele mede agora e o contrario --
    // que NENHUMA revogacao sai desta tela. A cobertura nao caiu de numero: o
    // caminho do `DELETE` continua medido, pelo lado de que ele nao acontece.
    testWidgets('com o QR na tela, NENHUMA revogacao sai', (tester) async {
      await montar(tester);
      await tester.tap(find.text('Criar o meu QR de convite'));
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO DA SONDA: o `POST` saiu e o QR esta na tela. Sem
      // estas duas linhas, o `isNot(contains(...))` abaixo passaria numa tela
      // que nunca chegou ao estado que TINHA as duas acoes.
      expect(chamadas, contains('POST /v1/connection-invites'));
      expect(find.byType(QrDoConvite), findsOneWidget);

      // Toca em TUDO o que a tela ainda oferece neste estado. Com a acao de
      // apagar reposta, um destes toques a aciona e o `DELETE` aparece.
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
            'REPROVA: alguma acao desta tela revogou o convite. O cliente '
            'tirou `Apagar o meu QR` em 22/10 -- *"nao deve ter a acao de '
            'trocar o qr-code dele ou de apagar"* --, e a capacidade do '
            'servidor (`revokeConnectionInvite`) continua existindo de '
            'propósito: o que saiu foi a PORTA, e nenhum toque daqui pode '
            'alcança-la.',
      );
    });

    testWidgets(
      'ISCA (d) -- NAO ha acao de compartilhar o perfil, nem desabilitada',
      (tester) async {
        // PARA DESLIGAR E VER REPROVAR: acrescente, no fim de
        // `TelaDeConvidarTutores.build`, um
        // `BotaoPrimario(rotulo: 'Compartilhar o perfil', aoTocar: null)`.
        //
        // MEDIDO em 21/10/2026, e são quatro medições independentes: não existe
        // página de pessoa em `web/src/pages/`; `getPersonProfile` exige conta,
        // então um estranho não teria o que ver; o `AndroidManifest.xml` tem um
        // único `intent-filter` (MAIN/LAUNCHER) e o `assetlinks.json` está com
        // a lista vazia; e `site_page_availability` não tem a linha
        // `person_profile` -- o `CHECK` da migração fecha o domínio em
        // `lost_case` e `poster`.
        //
        // A ausência é o desenho. Botão desabilitado é proibido pelo critério 2
        // da BICHUS-62 **nem habilitado nem desabilitado**, e uma faixa
        // explicando a falta seria o texto de apoio que o cliente mandou
        // remover das telas.
        await montar(tester);
        await tester.tap(find.text('Criar o meu QR de convite'));
        await tester.pumpAndSettle();
        // ROLA ATE O FIM DO BLOCO DO QR. O alvo era `Apagar o meu QR`, que
        // deixou de existir em 26/10; a ultima coisa do bloco agora e o aviso
        // de que o QR nao volta depois, e e ele que leva a rolagem ao pe da
        // pagina -- onde um botao de compartilhar apareceria.
        await rolarAte(
          tester,
          find.textContaining('O QR aparece aqui enquanto esta tela'),
        );

        expect(
          find.textContaining('Compartilhar'),
          findsNothing,
          reason: 'REPROVA: a tela oferece compartilhar o perfil. Não há '
              'página, não há link que abra o app, e o interruptor que acende '
              'isso sem APK novo não tem linha para esta página.',
        );
        for (final botao in tester.widgetList<BotaoPrimario>(
          find.byType(BotaoPrimario),
        )) {
          expect(
            botao.aoTocar,
            isNotNull,
            reason: 'REPROVA: há `BotaoPrimario` com `aoTocar: null` na tela.',
          );
        }
        for (final botao in tester.widgetList<BotaoSecundario>(
          find.byType(BotaoSecundario),
        )) {
          expect(
            botao.aoTocar,
            isNotNull,
            reason: 'REPROVA: há `BotaoSecundario` com `aoTocar: null`.',
          );
        }
      },
    );

    testWidgets('a emissao que falha diz, e nao deixa QR meio desenhado', (
      tester,
    ) async {
      await montar(tester, emissaoFalha: true);
      await tester.tap(find.text('Criar o meu QR de convite'));
      await tester.pumpAndSettle();

      expect(find.byType(QrDoConvite), findsNothing);
      expect(find.text('Criar o meu QR de convite'), findsOneWidget);
    });
  });

  group('a trilha de progresso, desenhada para receber premio depois', () {
    testWidgets('marca o alcancado e diz o que falta para o proximo', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: TrilhaDeConvites(quantos: 2)),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          '2 tutores entraram no Bichu com o seu convite e já cadastraram um '
          'pet.',
        ),
        findsOneWidget,
        reason: 'REPROVA: a frase não diz a REGRA pela qual alguém conta. O '
            'contador que soma sem explicar é o que faz a pessoa achar que o '
            'produto errou.',
      );
      expect(find.text('Faltam 1 para “Três olhos a mais”'), findsNothing);
      expect(
        find.text('Falta 1 para “Três olhos a mais”.'),
        findsOneWidget,
        reason: 'REPROVA: a gramática do singular não está certa, ou o próximo '
            'marco está errado.',
      );
    });

    testWidgets('nenhum premio material e prometido', (tester) async {
      // A plaquinha da coleira **já é de graça** no produto: não há cobrança
      // por ela em lugar nenhum, então "convide 3 e ganhe a plaquinha" não
      // entregaria nada -- e uma recompensa que não é recompensa ensina a
      // pessoa a não acreditar na próxima.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: TrilhaDeConvites(quantos: 2)),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('plaquinha'),
        findsNothing,
        reason: 'REPROVA: a trilha promete a plaquinha, que já é de graça.',
      );
      expect(find.textContaining('grátis'), findsNothing);
      expect(find.textContaining('de graça'), findsNothing);
    });

    test('a forma ja serve para premio: o marco e um par (numero, o que vem)', () {
      // Não há nada em `TrilhaDeConvites` que suponha que o marco é simbólico:
      // ela não sabe o que entrega, só em que número entrega. Trocar a palavra
      // de um marco por um prêmio é trocar o texto daquele par.
      const trilha = TrilhaDeConvites(
        quantos: 0,
        marcos: <MarcoDeConvite>[
          MarcoDeConvite(3, 'a plaquinha de graça'),
        ],
      );
      expect(trilha.proximo?.rotulo, 'a plaquinha de graça');
      expect(trilha.proximo?.quantoFalta(0), 'Faltam 3 para “a plaquinha de graça”.');
    });

    test('quem alcancou tudo nao fica a zero de nada', () {
      const trilha = TrilhaDeConvites(quantos: 99);
      expect(
        trilha.proximo,
        isNull,
        reason: 'REPROVA: quem chegou ao fim da trilha recebeu um próximo '
            'marco. Uma frase de progresso ali seria um progresso que não '
            'existe.',
      );
    });
  });
}
