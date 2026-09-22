// C.3 — Antessala de notificacao, e o registro do aparelho (UX 10 e 10.1).
//
// A ISCA central deste arquivo e o **momento**. No iOS o dialogo do sistema e
// mostrado uma unica vez: pedir na abertura do app e o jeito mais rapido de a
// pessoa negar para sempre, e depois disso nao ha segunda chance -- nem para
// nos, nem para ela, exceto nos ajustes do sistema, aonde quase ninguem vai
// (premissa P4 do UX: a taxa de reversao do estado negado e o que se esta
// medindo, e a aposta e que fica abaixo de 5%).
//
// Por isso os dois primeiros casos sao provas NEGATIVAS: o app nao encosta na
// permissao ao abrir, e `Agora nao` nao dispara o dialogo. Um duble que conta
// as chamadas e a unica forma de verificar isso, porque o defeito aqui nao
// deixa rastro na tela -- ele aparece semanas depois, como uma base de tutores
// que nao recebe alerta e ninguem sabe por que.
//
// A segunda isca e o registro do aparelho. O contrato e o ADR-0008 mandam
// registrar **tambem** quem recusou: e esse registro que permite contar
// quantos tutores sao de fato alcancaveis, "a metrica que decide se o alerta
// toca em alguem". Registrar so quem concedeu daria uma base em que 100% das
// pessoas recebem push.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

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

  /// Os corpos que chegaram em `POST /v1/me/devices`.
  late List<Map<String, dynamic>> registros;

  setUp(() => registros = <Map<String, dynamic>>[]);

  /// Abre F1.6 com a tag emitida com sucesso, que e a precondicao de UX 10.1.
  Future<void> abrirF16(
    WidgetTester tester, {
    required AvisosDeTeste avisos,
    bool aTagSai = true,
    bool oRegistroFalha = false,
  }) async {
    await abrirOApp(
      tester,
      avisos: avisos,
      rede: (requisicao) async {
        if (requisicao.url.path.endsWith('/me/devices')) {
          registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
          if (oRegistroFalha) return problema('validation-failed', 400);
          return json200(<String, dynamic>{
            'id': '22222222-3333-4444-5555-666666666666',
            'platform': 'android',
            'push_permission': 'granted',
          });
        }
        if (!aTagSai) return problema('internal-error', 500);
        return tagEmitida();
      },
    );
    await irPara(
      tester,
      Rotas.petCadastrado,
      extra: ResultadoDoCadastro(pet: nina()),
    );
    await tester.pumpAndSettle();
  }

  final Finder oSim = find.text(TextosDaAntessala.sim);
  final Finder oAgoraNao = find.text(TextosDaAntessala.agoraNao);

  group('o momento do pedido', () {
    testWidgets('a abertura do app NAO encosta na permissao de notificacao',
        (tester) async {
      // "Nenhuma permissao e pedida na abertura do app" (UX 10). Este caso
      // reprova antes de o defeito chegar ao aparelho de alguem: uma vez
      // negada na abertura, a permissao esta queimada para sempre.
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOApp(tester, avisos: avisos, rede: (_) async => json200(<String, dynamic>{}));

      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: o app abriu o dialogo do sistema na abertura. No iOS '
            'ele so aparece uma vez, e essa chance acabou de ser gasta sem '
            'contexto nenhum (UX 10).',
      );
      expect(avisos.vezesQueConsultouEstado, 0);
      expect(oSim, findsNothing);
    });

    testWidgets('a antessala aparece em F1.6, depois de o QR aparecer',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirF16(tester, avisos: avisos);

      expect(find.text(TextosDaAntessala.titulo('Nina')), findsOneWidget);
      expect(oSim, findsOneWidget);
      expect(oAgoraNao, findsOneWidget);
      // Ainda NAO pediu: a antessala esta aberta, o dialogo do sistema nao.
      expect(avisos.vezesQuePediu, 0);
    });

    testWidgets('a tag que nao saiu NAO ganha um pedido de permissao em cima',
        (tester) async {
      // A tela ja esta mostrando um problema. Empilhar um pedido de permissao
      // em cima dele e pedir atencao para outra coisa no pior momento.
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirF16(tester, avisos: avisos, aTagSai: false);

      expect(oSim, findsNothing);
      expect(avisos.vezesQueConsultouEstado, 0);
      expect(registros, isEmpty);
    });

    testWidgets('quem ja respondeu nao ve a antessala de novo', (tester) async {
      // "Nenhum dialogo repetido." Uma antessala aqui levaria a um dialogo do
      // sistema que nao abre mais -- um botao que nao faz nada.
      for (final ja in <PermissaoDeAviso>[
        PermissaoDeAviso.concedida,
        PermissaoDeAviso.negada,
      ]) {
        registros = <Map<String, dynamic>>[];
        final avisos = AvisosDeTeste(ja);
        await abrirF16(tester, avisos: avisos);
        expect(oSim, findsNothing, reason: 'REPROVA: antessala repetida em $ja.');
        expect(avisos.vezesQuePediu, 0);
      }
    });
  });

  group('as duas saidas da antessala', () {
    testWidgets('`Sim` abre o dialogo do sistema e o token vai para o servidor',
        (tester) async {
      final avisos = AvisosDeTeste(
        PermissaoDeAviso.naoPedida,
        depoisDePedir: PermissaoDeAviso.concedida,
      );
      await abrirF16(tester, avisos: avisos);
      await tocar(tester, oSim);

      expect(avisos.vezesQuePediu, 1);
      expect(registros, hasLength(1));
      expect(registros.single['push_permission'], 'granted');
      expect(registros.single['push_token'], 'token-fcm-descartavel');
      expect(registros.single['platform'], 'android');
    });

    testWidgets('`Agora nao` NAO dispara o dialogo: a chance unica fica guardada',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirF16(tester, avisos: avisos);
      await tocar(tester, oAgoraNao);

      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: `Agora nao` abriu o dialogo do sistema. No iOS a '
            'chance acabou, e a segunda oportunidade de UX 10.1 (F3.2) nao '
            'tem mais o que oferecer.',
      );
      // E o estado que vai para o servidor e `not_asked`, e nao `denied`: a
      // pessoa nunca viu o dialogo. Colapsar os dois faria F3.2 mandar quem
      // ainda pode escolher para os ajustes.
      expect(registros.single['push_permission'], 'not_asked');
      expect(registros.single['push_token'], isNull);
    });

    testWidgets('`Sim` seguido de recusa no sistema registra `denied`',
        (tester) async {
      final avisos = AvisosDeTeste(
        PermissaoDeAviso.naoPedida,
        depoisDePedir: PermissaoDeAviso.negada,
      );
      await abrirF16(tester, avisos: avisos);
      await tocar(tester, oSim);

      expect(avisos.vezesQuePediu, 1);
      expect(registros.single['push_permission'], 'denied');
      expect(registros.single['push_token'], isNull);
    });

    testWidgets('dispensar a folha conta como `Agora nao`, e nao como `Sim`',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirF16(tester, avisos: avisos);

      // Toque fora da folha, que e como o sistema a dispensa.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(avisos.vezesQuePediu, 0);
      expect(registros.single['push_permission'], 'not_asked');
    });
  });

  group('o aparelho e registrado tambem quando a pessoa recusa', () {
    testWidgets('quem ja tinha negado entra na base como `denied`', (tester) async {
      // ADR-0008: "o aparelho continua registrado, com push_permission:
      // denied", e e isso que mantem honesta a previa de alcance.
      await abrirF16(tester, avisos: AvisosDeTeste(PermissaoDeAviso.negada));
      expect(registros.single['push_permission'], 'denied');
      expect(registros.single['push_token'], isNull);
    });

    testWidgets('build sem push NAO registra aparelho nenhum', (tester) async {
      // Sem plataforma nao ha push. Registrar aqui poria na base um aparelho
      // que nunca vai receber nada, e a contagem de alcance mentiria para
      // cima -- que e o lado errado para uma metrica de alcance errar.
      await abrirF16(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.indisponivel, plataforma: null),
      );
      expect(registros, isEmpty);
    });
  });

  group('a falha do registro nao e engolida', () {
    testWidgets('a faixa diz que o aviso nao ligou, e que o e-mail cobre',
        (tester) async {
      final avisos = AvisosDeTeste(
        PermissaoDeAviso.naoPedida,
        depoisDePedir: PermissaoDeAviso.concedida,
      );
      await abrirF16(tester, avisos: avisos, oRegistroFalha: true);
      await tocar(tester, oSim);

      await rolarAte(tester, find.textContaining('não ficaram ligados'));
      expect(
        find.text(TextosDaAntessala.avisoNaoFicouLigado('Nina')),
        findsOneWidget,
        reason: 'REPROVA: o registro falhou em silencio. O app ficaria '
            'prometendo um aviso que nao vai chegar.',
      );
      // E o codigo da tag continua na tela: a faixa nao substitui nada.
      expect(find.text('BCH-7K2M-91QD'), findsOneWidget);
    });
  });

  group('acessibilidade da antessala', () {
    testWidgets('as duas saidas tem o mesmo peso e alvo de toque suficiente',
        (tester) async {
      await abrirF16(tester, avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida));

      // Os finders sao presos a folha: F1.6 tem um `BotaoPrimario` proprio
      // (`Fazer a tag`) atras dela, e medir o da tela de baixo faria o caso
      // passar sem nunca ter olhado para a antessala.
      Finder naAntessala(Finder alvo) => find.descendant(
            of: find.byType(AntessalaDeAviso),
            matching: alvo,
          );

      final sim = tamanhoDoAlvo(tester, naAntessala(find.byType(BotaoPrimario)));
      final naoAgora =
          tamanhoDoAlvo(tester, naAntessala(find.byType(OutlinedButton)));

      expect(sim.height, greaterThanOrEqualTo(pisoMinimo));
      expect(
        naoAgora.height,
        greaterThanOrEqualTo(pisoMinimo),
        reason: 'REPROVA: `Agora nao` menor que o piso. UX 10 exige as duas '
            'opcoes com o MESMO peso visual -- dizer o custo nao e o mesmo '
            'que empurrar.',
      );
      expect(naoAgora.width, sim.width);
    });

    testWidgets('as duas acoes sao anunciaveis por leitor de tela',
        (tester) async {
      await abrirF16(tester, avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida));
      exigirRotuloAnunciavel(tester, TextosDaAntessala.sim, na: 'C.3');
      exigirRotuloAnunciavel(tester, TextosDaAntessala.agoraNao, na: 'C.3');
    });

    testWidgets('o texto nao inventa o genero do pet', (tester) async {
      // Mesma regra do conteudo do push no servidor: "encontrar Rex", nunca
      // "encontrar a Rex". O app nao sabe o genero do animal.
      expect(TextosDaAntessala.titulo('Rex'), 'Quer ser avisada se alguém encontrar Rex?');
    });
  });
}
