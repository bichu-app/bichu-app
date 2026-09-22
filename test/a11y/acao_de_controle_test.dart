// O PORTAO DA CLASSE: nenhum controle anunciado como botao fica sem acao.
//
// WCAG 2.1 SC 4.1.2 (nome, **funcao**, valor) e SC 2.1.1 (operavel sem
// ponteiro). Este arquivo nao guarda um widget: guarda a CLASSE de defeito.
//
// Por que ele existe
// ------------------
// O app acumulou dois defeitos de acessibilidade da mesma familia em menos de
// um dia, e os dois passaram pela suite inteira verdes:
//
//  1. o `ListView` das abas embrulhava cada secao num `IndexedSemantics`: a
//     secao inteira virava UM no anunciado como botao, com o nome sendo a
//     concatenacao de todo o texto da tela (corrigido na BICHUS-62 com
//     `addSemanticIndexes: false`);
//  2. o inverso: o no existe, e anunciado como botao, e **perdeu a acao**.
//     `Semantics(button: true, excludeSemantics: true)` sem redeclarar `onTap`
//     apaga a arvore do filho e leva junto a acao que o `InkWell` ou o
//     `*Button` publicava.
//
// Os dois passaram porque a verificacao de acessibilidade do projeto olhava
// **rotulo e contraste, e nunca olhou acao**. Consertar os quatro widgets nao
// fecha a classe: o proximo `excludeSemantics` a reabre, calado. Isto fecha.
//
// A medida do defeito 2, antes da correcao, na secao de aterrissagem:
//
//     btn=true  tap=false  "Cadastrar meu pet"      <- BotaoPrimario
//     btn=true  tap=true   "Escanear uma tag"       <- BotaoSecundario
//
// e na tela de identificacao do pet, onde ele comia o formulario inteiro:
//
//     btn=true  tap=false  "Cao" / "Gato" / "Outro"     <- GrupoSegmentado
//     btn=true  tap=false  "Raca, ..."                  <- SeletorDeLista
//     btn=true  tap=false  "Continuar"                  <- BotaoPrimario
//
// Como ele mede, e por que nao mede o arquivo
// -------------------------------------------
// A fonte e a **arvore de semantica em execucao**, montando o app de verdade,
// e nunca o texto do codigo. Uma varredura de fonte casa com a mencao ao
// proprio mecanismo dentro de um comentario -- uma isca da BICHUS-164 nasceu
// furada exatamente assim, e apagar o codigo de verdade a deixava verde. Este
// portao nao tem como olhar para um comentario: ele le o que o aparelho
// entrega ao leitor de tela.
//
// A prova negativa mora aqui dentro, no grupo `autoteste`: um controle
// deliberadamente quebrado que o portao PRECISA reprovar, e um correto e um
// desabilitado que ele PRECISA aprovar. Portao que so sabe reprovar some do CI
// do mesmo jeito que portao que so sabe aprovar.

import 'dart:ui' show Tristate;

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import 'verificador.dart';

Future<http.Response> _rede(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path.endsWith('/tags') && req.method == 'POST') {
    return json200(
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
  }
  return http.Response('', 404);
}

/// O `expect` unico da varredura, para a mensagem ser a mesma em toda tela.
void exigirTodoBotaoComAcao(
  WidgetTester tester, {
  required String tela,
  required int botoesEsperados,
}) {
  final v = verificarAcaoDosControles(
    tester,
    tela: tela,
    tema: 'claro',
    botoesEsperados: botoesEsperados,
  );
  expect(
    v,
    isEmpty,
    reason:
        'REPROVA: ha controle anunciado como botao e sem acao em "$tela".\n'
        '${relatorio(v)}\n'
        'Quem usa TalkBack ou VoiceOver ouve que existe um botao e nao tem '
        'como aciona-lo. Se o controle embrulha o filho num '
        '`Semantics(..., excludeSemantics: true)`, redeclare `onTap` com a '
        'MESMA acao do `onPressed`/`onTap` do filho.',
  );
}

void main() {
  // ---------------------------------------------------------------------
  // A varredura: as telas reais do app
  // ---------------------------------------------------------------------
  group('varredura — nenhum botao do app fica sem acao', () {
    testWidgets('secao de aterrissagem, logado', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await tester.pumpAndSettle();

      // 5 destinos da barra + `Cadastrar meu pet` + `Escanear uma tag`.
      exigirTodoBotaoComAcao(tester, tela: 'aterrissagem', botoesEsperados: 7);
      handle.dispose();
    });

    testWidgets('F1.3 identificacao, com a especie ja escolhida',
        (tester) async {
      // A especie precisa estar escolhida: o `SeletorDeLista` de raca nasce
      // DESABILITADO (a lista e por especie), e desabilitado o portao pula --
      // corretamente. Sem este toque a varredura nunca olharia para o seletor,
      // que e um dos quatro widgets em que o defeito estava.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede);
      await irPara(tester, Rotas.cadastrarPet);
      await tocar(tester, find.text('Cão'));

      // 3 de especie + 3 de porte + 3 de sexo + raca + voltar + `Continuar`.
      // Os segmentos abaixo da dobra entram na conta: o portao nao pula no
      // escondido, porque acao ausente num controle que a pessoa alcanca
      // rolando e defeito igual.
      exigirTodoBotaoComAcao(tester, tela: 'f1.3', botoesEsperados: 12);
      handle.dispose();
    });

    testWidgets('F1.6 pet cadastrado', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede);
      await irPara(
        tester,
        Rotas.petCadastrado,
        extra: ResultadoDoCadastro(
          pet: const Pet(
            id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
            nome: 'Nina',
            especie: Especie.cao,
            redacoesDeCuidados: <RedacaoDeCuidados>[],
          ),
        ),
      );

      // `Copiar o código` + voltar + `Fazer a tag da coleira` + `Depois`. O
      // terceiro esta declarado desabilitado: ele CONTA na cobertura (o
      // portao o enxerga) e nao e cobrado por acao.
      exigirTodoBotaoComAcao(tester, tela: 'f1.6', botoesEsperados: 4);
      handle.dispose();
    });

    testWidgets('Perfil > Meus pets', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await tocar(tester, find.widgetWithText(NavigationDestination, 'Perfil'));

      // 9 -> 8 em 22/09/2026: saiu do Perfil o `TextButton` de "Termos de uso
      // e privacidade", que tinha `onPressed: null` e nao levava a lugar
      // nenhum. Decisao do cliente no teste em aparelho -- os dois documentos
      // ficam so na F1.1, onde sao o objeto do aceite. O piso desce porque a
      // tela tem mesmo um controle a menos, e nao porque o portao passou a
      // olhar menos.
      exigirTodoBotaoComAcao(tester, tela: 'meus-pets', botoesEsperados: 8);
      handle.dispose();
    });
  });

  // ---------------------------------------------------------------------
  // O autoteste: a prova negativa, versionada
  // ---------------------------------------------------------------------
  group('autoteste — o portao sabe reprovar E sabe aprovar', () {
    /// O defeito, escrito a mao: `button: true` + `excludeSemantics: true` e
    /// nenhum `onTap` redeclarado. E a forma EXATA em que os quatro widgets
    /// do produto estavam.
    Widget quebrado() {
      return MaterialApp(
        home: Material(
          child: Semantics(
            button: true,
            label: 'Avisar o tutor',
            excludeSemantics: true,
            child: InkWell(onTap: () {}, child: const Text('Avisar o tutor')),
          ),
        ),
      );
    }

    /// O mesmo controle, com a linha que faltava.
    Widget correto() {
      return MaterialApp(
        home: Material(
          child: Semantics(
            button: true,
            label: 'Avisar o tutor',
            excludeSemantics: true,
            onTap: () {},
            child: InkWell(onTap: () {}, child: const Text('Avisar o tutor')),
          ),
        ),
      );
    }

    /// Botao desabilitado de verdade: sem acao, e isso esta CERTO.
    Widget desabilitado() {
      return MaterialApp(
        home: Material(
          child: Semantics(
            button: true,
            enabled: false,
            label: 'Transferir pet',
            excludeSemantics: true,
            child: Text('Transferir pet'),
          ),
        ),
      );
    }

    testWidgets('reprova o botao sem acao, e o nomeia', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(quebrado());
      await tester.pumpAndSettle();

      final v = verificarAcaoDosControles(
        tester,
        tela: 'isca',
        tema: 'claro',
        botoesEsperados: 1,
      );
      expect(
        v.where((x) => x.tipo == TipoDeViolacao.acaoAusente),
        isNotEmpty,
        reason:
            'REPROVA: o portao aprovou um `Semantics(button: true, '
            'excludeSemantics: true)` SEM `onTap`. E o defeito que ele existe '
            'para pegar; aprovando isto ele ficaria verde para sempre sem '
            'olhar para nada.',
      );
      expect(
        v.first.alvo,
        contains('Avisar o tutor'),
        reason: 'reprovou sem dizer QUAL controle. Relatorio que nao nomeia '
            'o alvo obriga quem recebe a procurar no escuro.',
      );
      handle.dispose();
    });

    testWidgets('aprova o mesmo controle com `onTap` redeclarado',
        (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(correto());
      await tester.pumpAndSettle();

      final v = verificarAcaoDosControles(
        tester,
        tela: 'isca',
        tema: 'claro',
        botoesEsperados: 1,
      );
      expect(
        v,
        isEmpty,
        reason: 'REPROVA: o portao reprovou um controle CORRETO '
            '(${relatorio(v)}). Portao que reprova tudo e tao inutil quanto '
            'portao que aprova tudo, e some do CI do mesmo jeito.',
      );
      handle.dispose();
    });

    testWidgets('aprova o botao declarado desabilitado', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(desabilitado());
      await tester.pumpAndSettle();

      final v = verificarAcaoDosControles(
        tester,
        tela: 'isca',
        tema: 'claro',
        botoesEsperados: 1,
      );
      expect(
        v,
        isEmpty,
        reason: 'REPROVA: o portao cobrou acao de um botao DESABILITADO '
            '(${relatorio(v)}). Botao desabilitado corretamente nao tem acao; '
            'cobrar acao dele faria o portao exigir o contrario do certo, e a '
            'saida mais barata seria desligar o portao.',
      );
      handle.dispose();
    });

    testWidgets('reprova quando enxerga menos botoes do que a tela declara',
        (tester) async {
      // A armadilha: um portao cego devolve lista vazia, e lista vazia e
      // indistinguivel de "esta tudo certo".
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(correto());
      await tester.pumpAndSettle();

      final v = verificarAcaoDosControles(
        tester,
        tela: 'isca',
        tema: 'claro',
        botoesEsperados: 99,
      );
      expect(
        v.where((x) => x.tipo == TipoDeViolacao.indeterminado),
        isNotEmpty,
        reason: 'o portao achou menos botoes do que a tela declara e mesmo '
            'assim aprovou. Assim ele aprova qualquer tela que ele nao '
            'consiga enxergar.',
      );
      handle.dispose();
    });
  });

  // ---------------------------------------------------------------------
  // A isca pontual do widget que originou a BICHUS-205
  // ---------------------------------------------------------------------
  group('BotaoPrimario — a acao chega de verdade ao leitor de tela', () {
    Widget comBotao({
      required VoidCallback? aoTocar,
      bool carregando = false,
    }) {
      return MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          body: BotaoPrimario(
            rotulo: 'Avisar o tutor',
            aoTocar: aoTocar,
            carregando: carregando,
          ),
        ),
      );
    }

    testWidgets('sai da arvore com `tap`, e nao so com `button`',
        (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(comBotao(aoTocar: () {}));
      await tester.pumpAndSettle();

      final v = verificarAcaoDosControles(
        tester,
        tela: 'botao-primario',
        tema: 'claro',
        botoesEsperados: 1,
      );
      expect(
        v,
        isEmpty,
        reason: 'REPROVA: `BotaoPrimario` voltou a sair com `tap=false`.\n'
            '${relatorio(v)}\n'
            'E a acao primaria de quase toda tela do produto: ela deixa de se '
            'anunciar como tocavel e some para quem usa leitor de tela. A '
            'causa e `excludeSemantics: true` sem `onTap` redeclarado em '
            'app/lib/widgets/botao_primario.dart.',
      );
      handle.dispose();
    });

    testWidgets('a acao declarada EXECUTA o mesmo callback do toque',
        (tester) async {
      // A trava que o cheque de bandeira sozinho nao da: declarar `onTap` e
      // liga-lo a nada tambem deixaria o portao verde, com o controle
      // igualmente morto no aparelho.
      final handle = tester.ensureSemantics();
      var vezes = 0;
      await tester.pumpWidget(comBotao(aoTocar: () => vezes += 1));
      await tester.pumpAndSettle();

      // `tester.semantics.tap` e o caminho REAL: ele percorre o mesmo
      // `SemanticsOwner.performAction` que o TalkBack e o VoiceOver acionam, e
      // ele proprio ja reprova quando o no nao declara a acao. Um
      // `tester.tap` comum nao serviria: ele entrega um ponteiro na tela e
      // passaria mesmo com a semantica vazia, que e o defeito.
      tester.semantics.tap(find.semantics.byLabel('Avisar o tutor'));
      await tester.pumpAndSettle();

      expect(
        vezes,
        1,
        reason: 'REPROVA: a acao de toque esta declarada na semantica e nao '
            'executa o callback do botao. Para o leitor de tela o controle '
            'existe e responde; no aparelho nao acontece nada.',
      );
      handle.dispose();
    });

    testWidgets('desabilitado nao anuncia acao, e carregando tambem nao',
        (tester) async {
      final handle = tester.ensureSemantics();

      await tester.pumpWidget(comBotao(aoTocar: null));
      await tester.pumpAndSettle();
      var dados = tester.getSemantics(find.byType(BotaoPrimario))
          .getSemanticsData();
      expect(dados.hasAction(SemanticsAction.tap), isFalse,
          reason: 'botao sem `aoTocar` anunciou acao de toque.');

      // `pump`, e nao `pumpAndSettle`: o indicador de progresso anima para
      // sempre e `pumpAndSettle` estoura o prazo esperando a arvore parar.
      await tester.pumpWidget(comBotao(aoTocar: () {}, carregando: true));
      await tester.pump();
      dados = tester.getSemantics(find.byType(BotaoPrimario))
          .getSemanticsData();
      expect(
        dados.hasAction(SemanticsAction.tap),
        isFalse,
        reason: 'o botao carregando anunciou acao de toque. O `onPressed` do '
            'Material ja e nulo nesse estado: declarar acao aqui prometeria '
            'uma resposta que nao vem.',
      );
      expect(
        dados.flagsCollection.isEnabled,
        isNot(Tristate.isTrue),
        reason: 'REPROVA: carregando, o botao se anuncia HABILITADO e nao tem '
            'acao nenhuma -- a combinacao exata que o portao da classe '
            'reprova, e que ficaria dentro do proprio widget.',
      );
      handle.dispose();
    });
  });
}
