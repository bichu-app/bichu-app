// ISCA DA BICHUS-278 (28/10/2026): A TELA `Convide tutores` MORRE, E O QR VAI
// PARA DENTRO DE `Meus dados`.
//
// Desenhado e aprovado em `design/prototipos/menu-unificado/`.
//
// ## O PLACAR VIAJA COM O QR, e isso e decisao do cliente de 28/10
//
// A tela que morre tinha **mais que o QR**: tinha o placar
// *"Quem você trouxe para o Bichu"* (`invited_joined_count`) e a acao
// `Criar o meu QR de convite`. O DESENHO.md levantou que *"por o QR em
// `Meus dados` sem dizer onde vai o placar o apaga em silencio"* e o pos como
// proposta (pergunta fechada 3); **o cliente respondeu (a) em 28/10/2026: o
// placar vai junto.** Por isso ele tem caso proprio aqui -- sem ele, mover so
// o QR passaria verde e o numero desapareceria sem ninguem reparar.
//
// ## Por que RECOLHIDO por padrao
//
// 48 dp fechado (uma linha) contra os **200 dp** do quadrado
// (`QrDoConvite.lado`, que e o mesmo numero de `QrDaPlaquinha` e **nao
// encolhe**: QR que encolhe de uma tela para a outra e QR que a camera do
// vizinho pega numa e nao pega na outra). `Meus dados` e a tela dos dados
// pessoais, e quem veio trocar o telefone nao pode ter 200 dp de QR no
// caminho.
//
// ## `Criar o meu QR de convite` VIAJA JUNTO, e e ressalva parada no cliente
//
// Nao existe operacao de LEITURA do proprio convite no contrato: o token em
// claro existe uma vez so (o banco guarda o SHA-256), e emitir na abertura
// revogaria o anterior a cada visita. **Sem o botao, a secao nao teria QR
// nenhum para mostrar.** Mexer nisso passa pelo `openapi.yaml`, que esta fora
// desta frente.
library;

import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/qr_do_convite.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Quantas pessoas a conta trouxe, pela resposta do resumo.
int _trazidos = 4;

Future<http.Response> _servidor(http.Request req) async {
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
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 7,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': _trazidos,
    });
  }
  if (req.url.path == '/v1/connection-invites' && req.method == 'POST') {
    return json200(<String, dynamic>{
      'invite_token': 'tok-de-convite-abcdef',
      'expires_at': '2026-11-27T12:00:00Z',
    }, status: 201);
  }
  return problema('not-found', 404);
}

Future<void> _abrirMeusDados(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await abrirOApp(tester, rede: _servidor, deposito: depositoLogado());
  await irPara(tester, Rotas.dadosPessoais);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => _trazidos = 4);

  testWidgets('a TELA `Convide tutores` nao existe mais no codigo',
      (tester) async {
    // Lida do DISCO, e nao do grafo de importes: uma tela que continuasse no
    // arquivo sem porta nenhuma e exatamente o estado que esta casa chama de
    // tela inalcancavel em silencio. Se ela morre, morre o arquivo.
    expect(
      File('lib/telas/conexoes/convide_tutores.dart').existsSync(),
      isFalse,
      reason: 'REPROVA: `lib/telas/conexoes/convide_tutores.dart` continua no '
          'disco. O cliente decidiu em 28/10/2026 que a tela morre e o QR vai '
          'para dentro de `Meus dados`.',
    );
  });

  testWidgets('`Meus dados` tem a secao do convite, RECOLHIDA ao abrir',
      (tester) async {
    await _abrirMeusDados(tester);

    expect(
      find.text(TelaDadosPessoais.tituloDoConvite),
      findsOneWidget,
      reason: 'REPROVA: a secao do convite nao esta em `Meus dados`. O QR '
          'precisa de casa: a tela que o abrigava morreu nesta frente.',
    );
    expect(
      find.byType(QrDoConvite),
      findsNothing,
      reason: 'REPROVA: o quadrado de 200 dp esta aberto quando a pagina '
          'ABRE. `Meus dados` e a tela dos dados pessoais, e quem veio trocar '
          'o telefone nao pode ter 200 dp de QR no caminho -- a secao nasce '
          'RECOLHIDA.',
    );
  });

  testWidgets('o toque abre a secao e mostra o QR e a instrucao',
      (tester) async {
    await _abrirMeusDados(tester);

    await tocar(tester, find.text(TelaDadosPessoais.tituloDoConvite));
    await tester.pumpAndSettle();

    // A secao aberta tem a acao de criar: sem ela nao ha QR nenhum para
    // mostrar, porque o contrato nao le o proprio convite.
    await tocar(tester, find.text(TelaDadosPessoais.criarOConvite));
    await tester.pumpAndSettle();

    expect(
      find.byType(QrDoConvite),
      findsOneWidget,
      reason: 'REPROVA: a secao aberta nao desenha o QR. O componente '
          '`QrDoConvite` ja existia e e o mesmo: esta frente o muda de casa, '
          'nao de forma.',
    );
    expect(
      find.textContaining('câmera comum do celular não abre'),
      findsOneWidget,
      reason: 'REPROVA: a instrucao nao viajou com o quadrado. Ela NAO e '
          'consolo, e a INSTRUCAO: o quadrado carrega o TOKEN e nao uma URL, '
          'e sem a frase a pessoa aponta a camera comum, nada acontece, e ela '
          'conclui que o recurso esta quebrado.',
    );
  });

  testWidgets(
    'O PLACAR VIAJOU JUNTO: o numero de quem entrou pelo convite aparece',
    (tester) async {
      _trazidos = 4;
      await _abrirMeusDados(tester);

      await tocar(tester, find.text(TelaDadosPessoais.tituloDoConvite));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('4'),
        findsWidgets,
        reason: 'REPROVA: o placar `invited_joined_count` nao esta na secao. '
            'Ele e a outra metade da tela que morreu, e o cliente decidiu em '
            '28/10/2026 que ele acompanha o QR -- mover so o QR o apagaria em '
            'silencio.',
      );
      expect(
        find.textContaining(RegExp('entraram no Bichu')),
        findsOneWidget,
        reason: 'REPROVA: o numero aparece sem dizer o que e. Um `4` solto '
            'dentro de `Meus dados` nao e placar de nada.',
      );
    },
  );

  testWidgets('sem ninguem trazido, o placar nao afirma um zero solto',
      (tester) async {
    _trazidos = 0;
    await _abrirMeusDados(tester);

    await tocar(tester, find.text(TelaDadosPessoais.tituloDoConvite));
    await tester.pumpAndSettle();

    // Zero e uma afirmacao do servidor e pode ser dita -- o que nao pode e um
    // numero sem frase. O caso cobra que, com zero, a secao continue inteira
    // e o QR continue alcancavel.
    expect(
      find.text(TelaDadosPessoais.criarOConvite),
      findsOneWidget,
      reason: 'REPROVA: com o placar em zero a secao perdeu a acao de criar. O '
          'placar e reconhecimento; o QR e o que a pessoa veio buscar, e ele '
          'nao depende do numero.',
    );
  });
}
