// Os TRÊS caminhos de conexão, medidos no app montado.
//
// Este arquivo é o que prova que os caminhos chegam ao mesmo lugar, e um deles
// é CONTRAPESO e não entrega:
//
//   (a) **o QR do convite abre o perfil certo** — o leitor reconhece o token,
//       resolve no servidor e empurra `/pessoa/<apelido>`;
//   (b) **o QR da plaquinha continua funcionando** — CONTRAPESO. É ele que
//       impede o reuso do leitor de quebrar o caminho do achador, que é a cunha
//       do produto. Sem (b), (a) poderia estar verde com o caminho do achador
//       morto, e ninguém saberia até alguém achar um cachorro na rua;
//   (c) **o Mural vazio tem saída para a busca** — e ela leva à aba `Usuários`,
//       não à primeira aba da `Rede`. Foi o vazio sem porta que fez o cliente
//       descobrir que conexão não funcionava;
//   (d) **a terceira aba existe e o rótulo não corta** — e o caso diz, no
//       `reason`, por que o botão do Mural é o caminho real.
//
// Todo esperado está escrito por extenso, com acento.

import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/escanear/tela_do_pet_da_tag.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/rede/busca_de_pessoas.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um token como `opaqueToken` o produz: 32 bytes em base64url, 43 símbolos.
const String tokenDeConvite = 'AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8YzA9bCd0eF-';

const String codigoDaPlaquinha = '7K2MQ1D4B8NV3XZ0';
const String qrDaPlaquinha = 'https://bichu.app/t/$codigoDaPlaquinha';

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

Map<String, dynamic> _perfil({
  String apelido = 'marina-vet',
  String nome = 'Marina',
  String estado = 'none',
}) {
  return <String, dynamic>{
    'handle': apelido,
    'public_ref': 'ABCDEFGHIJKLMNOPQRSTUV',
    'display_name': nome,
    'pets_count': 2,
    'connections_count': 38,
    'connection_state': estado,
  };
}

/// `GET /v1/tags/{code}` como o contrato o declara, no mesmo formato que
/// `tela_do_pet_apos_escanear_test.dart` usa -- uma forma só para a rota, e
/// não uma por arquivo de teste.
Map<String, dynamic> _tagResolvida() {
  return <String, dynamic>{
    'viewer': 'anonymous',
    'pet': <String, dynamic>{
      'display_name': 'Toby',
      'species': 'dog',
      'size': 'M',
      'breed_label': 'Vira-lata (SRD)',
      'primary_color': 'preto e branco',
      'distinctive_marks': 'Coleira vermelha.',
      'care_notes': null,
      'photo_url': null,
    },
    'lost': <String, dynamic>{'is_lost': false, 'since': null},
    'already_notified': false,
  };
}

/// Uma página vazia, no formato das listagens numeradas desta casa.
Map<String, dynamic> _vazia() {
  return <String, dynamic>{
    'items': <Map<String, dynamic>>[],
    'total': 0,
    'page': 1,
    'limit': 20,
  };
}

void main() {
  /// A rede que atende os dois QR, e **registra tudo o que foi pedido**.
  ///
  /// A lista de chamadas é o que sustenta a afirmação de que o caminho do
  /// achador não mudou: ele continua resolvendo a tag, e não o convite.
  late List<String> chamadas;

  Future<http.Response> rede(http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}');
    final caminho = pedido.url.path;
    if (caminho.endsWith('/connection-invites/resolution')) {
      return _json(_perfil());
    }
    if (caminho.contains('/tags/')) return _json(_tagResolvida());
    if (caminho.endsWith('/people')) return _json(_vazia());
    // A TELA DE PERFIL RECARREGA POR APELIDO depois de o leitor empurrar a
    // rota: `resolveConnectionInvite` resolve o token em `PersonProfile`, e a
    // tela de destino lê `getPersonProfile` com o apelido do endereço.
    if (caminho.contains('/people/')) return _json(_perfil());
    if (caminho.endsWith('/connections/summary')) {
      return _json(<String, dynamic>{
        'connected_count': 0,
        'pending_sent_count': 0,
        'requests_received_count': 0,
        'remaining_requests_today': 10,
        'connection_limit': 150,
        'invited_joined_count': 0,
      });
    }
    // O MURAL VAZIO, que é o estado que o caso (c) precisa: a linha é
    // `GET /v1/timeline` e o discriminador de "tenho publicação" é
    // `GET /v1/me/publications`. Os dois vazios produzem o ramo
    // `tituloSemConexao`, que é o único com saída.
    if (caminho.endsWith('/timeline') ||
        caminho.endsWith('/me/publications')) {
      return _json(_vazia());
    }
    return _json(_vazia());
  }

  Future<LeitorDeQrDeTeste> abrirOLeitor(WidgetTester tester) async {
    chamadas = <String>[];
    final leitor = LeitorDeQrDeTeste();
    await abrirOApp(
      tester,
      rede: rede,
      deposito: depositoLogado(),
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: leitor,
    );
    await irAoLeitorDeQr(tester);
    return leitor;
  }

  group('o leitor le DOIS QR, e o da plaquinha continua primeiro', () {
    testWidgets('ISCA (a) -- o QR do convite abre o perfil de quem o emitiu', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `TelaLeitorDeQr._aoLer`, apague o
      // ramo de `tokenDeConviteDoQr` e deixe o aviso efêmero no lugar dele.
      final leitor = await abrirOLeitor(tester);

      leitor.ler(tokenDeConvite);
      await tester.pumpAndSettle();

      expect(
        chamadas,
        contains('POST /v1/connection-invites/resolution'),
        reason: 'REPROVA: o leitor não resolveu o convite. Chamadas: '
            '$chamadas',
      );
      expect(
        find.text('Marina'),
        findsWidgets,
        reason: 'REPROVA: o perfil de quem emitiu o convite não abriu. O '
            'cliente pediu três caminhos com UM destino: *"a página do perfil '
            'do usuário com o botão de adicionar"*.',
      );
      expect(
        find.text('Pedir conexão'),
        findsOneWidget,
        reason: 'REPROVA: o perfil abriu sem o botão de adicionar, que é a '
            'metade do pedido.',
      );
    });

    testWidgets('ISCA (b) CONTRAPESO -- o QR da plaquinha continua resolvendo', (
      tester,
    ) async {
      // **ESTE CASO É O CONTRAPESO, e ele é mais importante que o (a).**
      //
      // O leitor passou a reconhecer dois conteúdos, e o caminho do achador é a
      // cunha do produto: quem acha um cachorro na rua escaneia a plaquinha. Se
      // a triagem nova engolisse a URL da plaquinha, o defeito só apareceria
      // com um animal no colo de alguém.
      //
      // PARA DESLIGAR E VER REPROVAR: em `TelaLeitorDeQr._aoLer`, tente o
      // convite ANTES da plaquinha e faça `tokenDeConviteDoQr` aceitar
      // qualquer texto não vazio.
      final leitor = await abrirOLeitor(tester);

      leitor.ler(qrDaPlaquinha);
      await tester.pumpAndSettle();

      expect(
        chamadas.any((c) => c.contains('/tags/')),
        isTrue,
        reason: 'REPROVA: o QR da plaquinha deixou de ser resolvido como tag. '
            'Chamadas: $chamadas',
      );
      expect(
        chamadas,
        isNot(contains('POST /v1/connection-invites/resolution')),
        reason: 'REPROVA: a URL da plaquinha foi mandada para a resolução de '
            'convite. Além de não funcionar, isso gastaria o teto de 20 '
            'tentativas inválidas por hora.',
      );
      expect(
        find.byType(TelaDoPetDaTag),
        findsOneWidget,
        reason: 'REPROVA: a tela do pet da tag não abriu — o caminho do '
            'achador quebrou. Esta é a tela que quem acha um animal na rua vê, '
            'e ela é a cunha do produto.',
      );
      expect(
        find.textContaining('Toby'),
        findsWidgets,
        reason: 'REPROVA: a tela abriu sem o nome do pet que a tag resolveu.',
      );
    });

    testWidgets('um QR que nao e de nenhum dos dois e recusado SEM sair da '
        'camera', (tester) async {
      final leitor = await abrirOLeitor(tester);

      leitor.ler('https://exemplo.test/promocao');
      await tester.pumpAndSettle();

      expect(
        find.text(TelaLeitorDeQr.naoEDoBichu),
        findsOneWidget,
        reason: 'REPROVA: a recusa do critério 3 não aparece.',
      );
      expect(
        chamadas,
        isNot(contains('POST /v1/connection-invites/resolution')),
        reason: 'REPROVA: a tela foi ao servidor com texto que não tinha forma '
            'de token. A triagem é local, e é isso que a mantém sem ida e '
            'volta de rede.',
      );
      expect(
        find.text(TelaLeitorDeQr.instrucaoDoVisor),
        findsOneWidget,
        reason: 'REPROVA: a tela saiu da câmera para recusar.',
      );
    });
  });

  group('a aba Usuarios e a saida do Mural vazio', () {
    testWidgets('ISCA (d) -- a Rede tem TRES abas, e Usuarios e a terceira', (
      tester,
    ) async {
      chamadas = <String>[];
      await abrirOApp(tester, rede: rede, deposito: depositoLogado());
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();

      // Do `Text` DENTRO da aba, e nao de `Tab.text`: as abas da `Rede`
      // ganharam glifo em 22/10/2026 e passam rotulo e glifo num `child:`,
      // entao `Tab.text` e nulo. O rotulo que importa e o pintado.
      final rotulos = find
          .byType(Tab)
          .evaluate()
          .map(
            (aba) => tester
                .widgetList<Text>(
                  find.descendant(
                    of: find.byWidget(aba.widget),
                    matching: find.byType(Text),
                  ),
                )
                .map((t) => t.data ?? '')
                .join(),
          )
          .toList();
      expect(
        rotulos,
        <String>['Eventos', 'Comunidade', 'Usuários'],
        reason: 'REPROVA: as abas da `Rede` não são as três de 21/10/2026, '
            'nesta ordem. `Usuários` é terceira e não segunda: trocar com '
            '`Comunidade` poria a aba inteira na tela, mas empurraria o '
            'diretório -- conteúdo público, alcançável sem conta -- para trás '
            'de uma aba que exige conta.',
      );
    });

    testWidgets('a aba Usuarios abre a busca, e nao busca nada sozinha', (
      tester,
    ) async {
      chamadas = <String>[];
      await abrirOApp(tester, rede: rede, deposito: depositoLogado());
      await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Tab, 'Usuários'));
      await tester.pumpAndSettle();

      expect(find.byType(BuscaDePessoas), findsOneWidget);
      expect(
        chamadas.where((c) => c == 'GET /v1/people'),
        isEmpty,
        reason: 'REPROVA: abrir a aba perguntou a busca. Campo vazio não lista '
            'ninguém. Chamadas: $chamadas',
      );
    });

    testWidgets('ISCA (c) -- o Mural vazio leva a aba Usuarios, e nao a '
        'Eventos', (tester) async {
      // PARA DESLIGAR E VER REPROVAR: em `CorpoDoMural`, troque
      // `context.go(Rotas.redeNaBuscaDePessoas)` por `context.go(Rotas.rede)`.
      //
      // **Este é o caminho real, e não a aba.** Medido: os três slots da
      // `TabBar` somam 353,74 dp; em 320 dp o corpo tem 288 dp de área útil e
      // `Usuários` começa em 244,43 -- aparecem 43,57 dos 109,31 dp do rótulo,
      // cerca de 40%. A 200% de escala ela começa em 424,86 dp de um viewport
      // de 288: inteira fora da tela. A aba que destrava o produto não pode
      // depender de a pessoa descobrir que a barra rola.
      chamadas = <String>[];
      await abrirOApp(tester, rede: rede, deposito: depositoLogado());
      await abrirAAba(tester, 'Mural');

      final botao = find.text('Buscar usuários');
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA: o Mural vazio não tem saída. Era verdadeiro e sem '
            'porta, e foi por isso que o cliente descobriu que conexão não '
            'funcionava: todo mundo passa por este vazio no primeiro dia e o '
            'produto não oferecia caminho nenhum para a primeira conexão.',
      );

      await tocar(tester, botao);

      expect(
        find.byType(SecaoDaRede),
        findsOneWidget,
        reason: 'REPROVA: o botão não levou à seção `Rede`.',
      );
      expect(
        find.byType(BuscaDePessoas),
        findsOneWidget,
        reason: 'REPROVA: o botão do Mural abriu a `Rede` numa aba que não é '
            '`Usuários`. Levar a pessoa a `Eventos` é exatamente o defeito que '
            'este botão existe para consertar.',
      );
    });
  });
}
