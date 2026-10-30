// ISCA DA BICHUS-278 (28/10/2026): A UNIFICACAO DO MENU DO PERFIL.
//
// Cinco decisoes do cliente de 28/10/2026, desenhadas e aprovadas em
// `design/prototipos/menu-unificado/`. Este arquivo mede a FOLHA -- o menu --,
// e as telas de destino tem iscas proprias.
//
// ## A conta real e 11 -> 7, e nao 8 -> 5
//
// O briefing descrevia oito entradas; `abas.dart` declarava ONZE (fora
// `Sair da conta`), e o DESENHO.md mediu isso antes de desenhar. As quatro que
// saem sao `Usuários bloqueados`, `Registrar achado avulso`,
// `Pedidos de conexão` e `Convide tutores`; `Meus eventos` e
// `Minhas indicações` FICAM, porque o cliente nao as citou.
//
// ## Por que a contagem e um caso, e nao so a ausencia das quatro
//
// Sem o caso de CONTAGEM, acrescentar uma linha nova no meio da unificacao
// passaria verde: as quatro ausencias continuariam verdadeiras. Sete e sete.
//
// ## `Meus eventos` e `Minhas indicações` tem caso PROPRIO de presenca
//
// Elas sao o risco desta frente: estao no MESMO grupo das que saem
// (`Comunidade`), e tres das cinco linhas daquele grupo morrem. Varrer o grupo
// e deixar as duas para tras seria a falha mais facil de cometer aqui, e a mais
// difícil de notar -- o cliente nao as citou, e por isso ninguem iria olhar.
library;

import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/conexoes/tela_minhas_conexoes.dart';
import 'package:bichu/telas/perfil/meus_achados.dart';
import 'package:bichu/telas/perfil/meus_eventos.dart';
import 'package:bichu/telas/perto/tela_de_minhas_indicacoes.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// Quantos pedidos recebidos o servidor afirma. Trocado por caso.
int _recebidos = 3;

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        petDoContrato(id: _idDoPet, nome: 'Nina'),
      ],
    });
  }
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  // O RESUMO DE CONEXOES: a fonte do contador da linha do menu.
  //
  // `requests_received_count` JA EXISTE no contrato (e em
  // `ResumoDeConexoes.doJson`): o contador do menu e mudanca de LUGAR do
  // numero, e nao campo novo.
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 7,
      'pending_sent_count': 2,
      'requests_received_count': _recebidos,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 4,
    });
  }
  return problema('not-found', 404);
}

/// 390 x 2600 dp logicos: o menu inteiro deitado, porque o que se mede e
/// PRESENCA e CONTAGEM, e nao dobra.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _abrirOPerfil(WidgetTester tester) async {
  await abrirOApp(
    tester,
    rede: _servidor,
    deposito: depositoLogado(),
  );
  await irParaAConta(tester);
}

Finder _naAba(Finder alvo) =>
    find.descendant(of: find.byType(AbaPerfil), matching: alvo);

void main() {
  setUp(() => _recebidos = 3);

  group('o menu do perfil foi unificado (cliente, 28/10/2026)', () {
    testWidgets('as QUATRO linhas que a decisao mata sairam', (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);

      for (final rotulo in const <String>[
        // 1. fundiu-se em `Conexões`, como a aba `Pendentes`.
        'Pedidos de conexão',
        // 2. virou a TERCEIRA aba de `Conexões`.
        'Usuários bloqueados',
        // 3. virou o botao fixo no topo do corpo de `Achados`.
        'Registrar achado avulso',
        // 4. a tela morreu; o QR foi para dentro de `Meus dados`.
        'Convide tutores',
      ]) {
        expect(
          _naAba(find.text(rotulo)),
          findsNothing,
          reason: 'REPROVA: `$rotulo` continua no menu do perfil. A decisao do '
              'cliente de 28/10/2026 a tirou de la, e deixa-la seria DUAS '
              'portas para o mesmo lugar -- que e o que '
              '`gaveta_de_secoes.dart` proibe por escrito.',
        );
      }
    });

    testWidgets('`Conexões` e `Achados` SAO as entradas unicas', (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);

      expect(
        _naAba(find.text(TelaDeMinhasConexoes.titulo)),
        findsOneWidget,
        reason: 'REPROVA: a entrada unica de conexoes nao esta no menu. O '
            'rotulo JA era `Conexões` (`TelaDeMinhasConexoes.titulo`, desde '
            '22/10): a unificacao nao inventa nome.',
      );
      expect(
        MeusAchados.titulo,
        'Achados',
        reason: 'REPROVA: `MeusAchados.titulo` nao virou `Achados`. Ele e a '
            'MESMA constante usada no rotulo do menu e no titulo da barra da '
            'tela: com o menu dizendo `Achados` e a barra dizendo '
            '`Meus achados`, quem procura a funcao pelo nome do menu nao a '
            'reconhece na tela que abriu.',
      );
      expect(
        _naAba(find.text('Achados')),
        findsOneWidget,
        reason: 'REPROVA: a entrada unica de achados nao esta no menu.',
      );
    });

    testWidgets('sao OITO linhas, e `Sair da conta` fora da conta', (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);

      // CORRECAO MEDIDA DA PRIMEIRA VERSAO DESTA ISCA: eu havia escrito que
      // `Sair da conta` *"e um `_ItemDeSair` e nao um `ItemDeMenu`"*. **E
      // falso** -- `_ItemDeSair.build` devolve um `ItemDeMenu`, com
      // `critico: true`. A contagem crua da oito, e nao sete.
      //
      // Entao a conta e feita pelo que a decisao realmente diz: **sete linhas
      // de menu, e `Sair da conta` fora da conta**. `critico` e exatamente o
      // que separa as duas coisas na arvore, e e por isso que ele serve de
      // recorte aqui em vez de um numero ajustado para oito -- oito passaria
      // a valer tambem se uma linha nova entrasse e o `Sair` saisse.
      final linhas = tester
          .widgetList<ItemDeMenu>(_naAba(find.byType(ItemDeMenu)))
          .toList(growable: false);
      final deMenu = linhas.where((ItemDeMenu i) => !i.critico);
      final deSaida = linhas.where((ItemDeMenu i) => i.critico);

      // **SETE VIROU OITO EM 29/10/2026, e a linha nova FOI PEDIDA.**
      //
      // A decisao de 28/10 (11 -> 7) e de VARREDURA: o cliente olhou o menu e
      // mandou tirar o que nao servia. Ela nao fechou o menu para sempre --
      // fechar seria afirmar que nenhum pedido posterior dele pode acrescentar
      // uma linha, e isso ele nao disse.
      //
      // No dia seguinte ele pediu, literal: *"no menu do usuario, adicione um
      // botao de ajuda, que abrira uma pagina com um formulario de duvida"*. A
      // oitava linha e `Ajuda`, e ela e DELE, da mesma boca e um dia depois.
      //
      // O numero continua travado de proposito: o que este caso protege e que
      // uma linha entre por DECISAO e nao por descuido de frente. Quem subir
      // para nove escreve aqui de quem foi o pedido e quando, como esta linha
      // faz.
      expect(
        deMenu.length,
        8,
        reason: 'REPROVA: o menu nao tem oito linhas, e tem '
            '${deMenu.length}: ${deMenu.map((i) => i.rotulo).join(', ')}. '
            'O cliente decidiu 11 -> 7 em 28/10/2026 (`Sair da conta` fora da '
            'conta nos dois lados) e acrescentou `Ajuda` em 29/10/2026. Se '
            'este numero mudou por uma linha NOVA, ela nao foi pedida; se '
            'mudou por uma que sumiu, alguma frente varreu demais.',
      );
      expect(
        deSaida.length,
        1,
        reason: 'REPROVA: a cauda critica nao e uma linha so. `Sair da conta` '
            'e a unica linha `critico` deste menu.',
      );
      expect(
        _naAba(find.text('Sair da conta')),
        findsOneWidget,
        reason: 'REPROVA: `Sair da conta` saiu junto com a varredura. Ela e '
            'decisao do cliente e tem portao proprio '
            '(`perfil_ordem_dos_itens_test.dart`).',
      );
    });

    testWidgets(
      'as DUAS que o cliente NAO citou ficaram onde estavam',
      (tester) async {
        _superficieAlta(tester);
        await _abrirOPerfil(tester);

        for (final rotulo in <String>[
          MeusEventos.titulo,
          TelaDeMinhasIndicacoes.titulo,
        ]) {
          expect(
            _naAba(find.text(rotulo)),
            findsOneWidget,
            reason: 'REPROVA: `$rotulo` desapareceu do menu. O cliente NAO a '
                'citou em 28/10, e por isso ela fica exatamente onde estava. '
                'Tres das cinco linhas do grupo `Comunidade` morrem nesta '
                'frente, e levar estas duas junto e a falha mais facil de '
                'cometer aqui.',
          );
        }
      },
    );
  });

  group('o contador na LINHA do menu (cliente, 28/10/2026)', () {
    testWidgets('com pedido esperando, a linha `Conexões` pinta o numero',
        (tester) async {
      _superficieAlta(tester);
      _recebidos = 3;
      await _abrirOPerfil(tester);
      await tester.pumpAndSettle();

      final linha = tester.widgetList<ItemDeMenu>(
        _naAba(find.byType(ItemDeMenu)),
      ).firstWhere(
        (ItemDeMenu i) => i.rotulo == TelaDeMinhasConexoes.titulo,
        orElse: () => throw TestFailure(
          'REPROVA: nao ha linha `Conexões` no menu para medir o contador.',
        ),
      );

      expect(
        linha.contador,
        3,
        reason: 'REPROVA: a linha `Conexões` do menu nao carrega o contador '
            'de pedidos recebidos. O cliente pediu o numero na linha do menu '
            'TAMBEM, em 28/10/2026 -- sem ele, quem nao abre Conexões depende '
            'so da notificacao, e foi por isso que ele pediu. O numero sai de '
            '`requests_received_count`, que ja existe no contrato.',
      );
    });

    testWidgets('sem pedido nenhum, a linha NAO pinta zero', (tester) async {
      _superficieAlta(tester);
      _recebidos = 0;
      await _abrirOPerfil(tester);
      await tester.pumpAndSettle();

      expect(
        _naAba(find.text('0')),
        findsNothing,
        reason: 'REPROVA: o menu pintou `0` na linha `Conexões`. Pastilha com '
            'zero e um aviso que afirma que nao ha aviso (DESENHO.md, 3.1).',
      );
    });
  });
}
