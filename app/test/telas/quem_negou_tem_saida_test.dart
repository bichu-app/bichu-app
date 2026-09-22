// BICHUS-24 — quem negou o aviso NAO fica em beco sem saida (UX 10.1).
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------------------------------------------------------
//
// A BICHUS-24 leva a serio que o dialogo do iOS e mostrado uma vez so: nenhuma
// terceira antessala, nenhum dialogo repetido. Esse rigor tem um preco, e ele
// precisa ser pago em algum lugar -- se o app para de perguntar e nao oferece
// nada no lugar, a pessoa que mudou de ideia nao tem por onde voltar. Rigor
// sem saida e abandono com outro nome, e o buraco nao aparece em teste nenhum
// porque **nao ha falha**: a tela funciona, nada quebra, e a permissao fica
// desligada para sempre.
//
// UX 10.1 fecha o assunto: "O caminho para reverter e `Ligar nos ajustes`, que
// abre os ajustes do sistema, e existe tambem em Perfil."
//
// ---------------------------------------------------------------------------
// O QUE ESTES CASOS MEDEM
// ---------------------------------------------------------------------------
//
// EFEITO, nao chamada. Nao basta a linha existir: o rotulo tem de LEVAR aos
// ajustes (`vezesQueAbriuAjustes`), e o no da arvore de semantica do app
// montado tem de carregar a acao de toque. Quatro controles deste projeto ja
// foram achados com `btn=true tap=false` -- anunciados como tocaveis, sem
// acao --, e um deles era a acao primaria de quase toda tela. Uma saida que so
// existe para quem enxerga nao e a saida de quem mais precisa dela.



import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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

  /// `go`, e nao `push`: `Perfil` e um RAMO da casca de abas, e empilhar um
  /// ramo sobre ele mesmo estoura a reserva de chave do `Navigator`
  /// (`!keyReservation.contains(key)`). O app tambem usa `go` para chegar
  /// aqui, no fim do assistente de cadastro -- entao este e o caminho de
  /// verdade, e nao uma acomodacao do teste.
  Future<void> irParaAAbaPerfil(WidgetTester tester) async {
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go(Rotas.perfil);
    await tester.pumpAndSettle();
  }

  /// Monta o app LOGADO, passa por F1.6 para o app descobrir a permissao, e
  /// volta para Perfil.
  ///
  /// Passar por F1.6 nao e cenografia: e o unico ponto em que o app consulta o
  /// estado da permissao, e a linha de Perfil so pode falar do que o app sabe.
  /// Um caso que montasse Perfil direto estaria afirmando que o app adivinha.
  Future<AvisosDeTeste> abrirPerfilDepoisDeF16(
    WidgetTester tester,
    PermissaoDeAviso estado,
  ) async {
    final avisos = AvisosDeTeste(estado);
    await abrirOApp(
      tester,
      avisos: avisos,
      deposito: depositoLogado(),
      rede: (requisicao) async {
        if (requisicao.url.path.endsWith('/me/devices')) {
          return json200(<String, dynamic>{
            'id': '22222222-3333-4444-5555-666666666666',
            'platform': 'android',
            'push_permission': 'denied',
          });
        }
        // `Perfil` monta `Meus pets`, que chama `GET /v1/pets`. Sem este
        // ramo a listagem cai no corpo da tag e reprova pelo motivo errado.
        if (requisicao.method == 'GET' && requisicao.url.path.endsWith('/pets')) {
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
      avisos.vezesQueConsultouEstado,
      greaterThan(0),
      reason: 'REPROVA POR VAZIO: o app nunca consultou a permissao em F1.6, '
          'entao ele nao sabe de nada e este caso nao esta medindo o que diz '
          'medir.',
    );

    await irParaAAbaPerfil(tester);
    return avisos;
  }

  final Finder aLinha =
      find.textContaining(TextosDaAntessala.semAvisoPorPerto);
  final Finder oBotaoDosAjustes =
      find.text(TextosDaAntessala.ligarNosAjustes);

  group('ISCA — quem negou tem para onde ir', () {
    testWidgets('a linha e o caminho para os ajustes aparecem em Perfil',
        (tester) async {
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.negada);
      await rolarAte(tester, aLinha);

      expect(
        aLinha,
        findsOneWidget,
        reason: 'REPROVA: quem negou o aviso nao ve nada em Perfil. O app '
            'nunca mais vai perguntar, por desenho, e agora tambem nao diz o '
            'que ela perdeu nem oferece caminho de volta. Ela descobre que nao '
            'recebe alerta de pet perdido por perto no dia em que um pet some '
            'perto dela -- e nesse dia nao ha conserto.',
      );
      expect(
        oBotaoDosAjustes,
        findsOneWidget,
        reason: 'REPROVA: a linha diz o que se perdeu e nao oferece saida. '
            'UX 10.1: "O caminho para reverter e `Ligar nos ajustes` [...] e '
            'existe tambem em Perfil."',
      );
    });

    testWidgets('a linha diz que o e-mail cobre o caso proprio', (tester) async {
      // Sem esta frase a linha soaria como se negar tivesse desligado o
      // produto -- e seria falso: "Continua usando o app inteiro. Nada fica
      // escondido" (UX 10.1). O e-mail e a rede de seguranca do ADR-0008.
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.negada);
      await rolarAte(tester, aLinha);

      expect(
        find.textContaining(TextosDaAntessala.oEmailCobreOCasoProprio),
        findsOneWidget,
        reason: 'REPROVA: a linha anuncia a perda e nao diz que o aviso do '
            'PROPRIO pet continua chegando por e-mail. Quem le entende que '
            'perdeu o que o produto tem de mais importante, e a frase esta '
            'errada: o caso proprio nao depende do push.',
      );
    });

    testWidgets('ISCA — o rotulo LEVA aos ajustes, e nao e so um rotulo',
        (tester) async {
      final avisos =
          await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.negada);
      await rolarAte(tester, oBotaoDosAjustes);
      await tocar(tester, oBotaoDosAjustes);

      expect(
        avisos.vezesQueAbriuAjustes,
        1,
        reason: 'REPROVA: `Ligar nos ajustes` foi tocado e os ajustes do '
            'sistema nao abriram. E o unico caminho de volta que existe depois '
            'de a permissao ser negada, e ele e um texto decorativo. A pessoa '
            'toca, nada acontece, e ela conclui que o app esta quebrado -- com '
            'razao.',
      );
    });

    testWidgets(
        'ISCA — o no de semantica do app montado carrega a acao de toque',
        (tester) async {
      // Medido no NO da arvore do app montado, e nao com
      // `find.bySemanticsLabel`: o finder procura um WIDGET `Semantics` com
      // aquele rotulo, e o que o VoiceOver e o TalkBack leem e o no, que pode
      // ter outro rotulo e outras acoes. Foi essa diferenca que produziu,
      // neste projeto, quatro controles com `btn=true` e `tap=false`.
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.negada);
      await rolarAte(tester, oBotaoDosAjustes);

      final handle = tester.ensureSemantics();
      try {
        final no = tester.getSemantics(oBotaoDosAjustes);
        final dados = no.getSemanticsData();
        expect(
          no.label.trim(),
          TextosDaAntessala.ligarNosAjustes,
          reason: 'REPROVA: o no nao se anuncia com o nome do controle.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: o no se anuncia e NAO carrega a acao de toque. E o '
              '`btn=true tap=false` de novo, agora na unica saida de quem '
              'negou a permissao -- e quem usa leitor de tela ficaria sem ela, '
              'sem nenhum sinal de que ela existia.',
        );
      } finally {
        handle.dispose();
      }
    });

    testWidgets('o alvo de toque da saida tem pelo menos 48 dp', (tester) async {
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.negada);
      await rolarAte(tester, oBotaoDosAjustes);
      final tamanho = tamanhoDoAlvo(tester, find.ancestor(
        of: oBotaoDosAjustes,
        matching: find.byType(TextButton),
      ));
      expect(tamanho.height, greaterThanOrEqualTo(pisoMinimo));
    });
  });

  group('ISCA — a linha nao aparece para quem nao negou', () {
    testWidgets('quem ainda NAO foi perguntada nao ve a linha', (tester) async {
      // Quem tocou em `Agora nao` nunca viu o dialogo do sistema. Dizer a ela
      // que "nao recebe aviso por perto" seria o app se desculpando por uma
      // escolha que ele mesmo ainda nao ofereceu -- e queimaria o argumento da
      // segunda antessala (F3.2) antes de ela acontecer.
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.naoPedida);

      expect(
        aLinha,
        findsNothing,
        reason: 'REPROVA: o app anuncia uma perda a quem nunca recusou nada. '
            'Alem de errado, isso gasta o argumento que a segunda antessala '
            'de F3.2 precisa ter intacto.',
      );
    });

    testWidgets('quem CONCEDEU nao ve a linha', (tester) async {
      await abrirPerfilDepoisDeF16(tester, PermissaoDeAviso.concedida);
      expect(
        aLinha,
        findsNothing,
        reason: 'REPROVA: o app diz a quem concedeu que ela nao recebe aviso '
            'por perto. Ela recebe.',
      );
    });

    testWidgets('build sem push nao mostra caminho para ajuste nenhum',
        (tester) async {
      // Sem plataforma nao ha permissao de notificacao a conceder. Mandar a
      // pessoa aos ajustes a faria procurar uma chave que nao esta la -- o
      // mesmo erro que `EstadoDaPermissao.indisponivel` evita na camera.
      final avisos = AvisosDeTeste(
        PermissaoDeAviso.indisponivel,
        plataforma: null,
      );
      await abrirOApp(
        tester,
        avisos: avisos,
        deposito: depositoLogado(),
        rede: (requisicao) async {
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return tagEmitida();
        },
      );
      await irParaAAbaPerfil(tester);

      expect(aLinha, findsNothing);
      expect(
        oBotaoDosAjustes,
        findsNothing,
        reason: 'REPROVA: um build sem push oferece `Ligar nos ajustes`. A '
            'pessoa percorre os ajustes do sistema atras de uma chave que nao '
            'existe, e a culpa aparente e dela.',
      );
    });
  });
}
