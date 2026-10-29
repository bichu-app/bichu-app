// BICHUS-317b -- O SELETOR DE TIPO DE ENTIDADE NA TELA DE INDICAR.
//
// Pedido do cliente de 29/10/2026, verbatim: *"esta faltando o campo se e um
// profissional, ong ou estabelecimento"*.
//
// =========================================================================
// POR QUE ESTE ARQUIVO EXISTE, E O QUE ELE MEDE QUE OUTRO NAO MEDIA
// =========================================================================
//
// O PR #103 entregou o `entity_kind` da indicacao no SERVIDOR, no CONTRATO
// (`DirectorySuggestionInput.entity_kind`), na MIGRACAO (`20261029000003`), na
// FILA do painel e no MODELO Dart (`TipoDeEntidade`). **O seletor na tela nao
// foi tocado**, e a consequencia era medida e silenciosa: quem indica pelo APK
// publicado manda o corpo SEM o campo, a linha nasce `professional` pelo
// `DEFAULT` da coluna e pelo `coalesce` da funcao de registro, e **nao havia
// como indicar uma ONG**. O campo que o cliente pediu nao existia para ele.
//
// Tres coisas distintas sao medidas aqui, e nenhuma delas e pega por
// `flutter analyze` nem pelos casos que ja existiam:
//
//  1. **o campo esta na TELA**, com os dois rotulos que o cliente definiu, lidos
//     da folha de verdade -- e nao `TipoDeEntidade.values` conferido contra si
//     mesmo;
//  2. **o CORPO que sai carrega o valor**, nos dois ramos. O defeito que se quer
//     impedir nao e ausencia de widget: e widget presente que nao chega ao
//     corpo. `entity_kind` e opcional no contrato, entao um seletor desligado
//     do `corpoDaSugestao` produziria `200` e gravaria `professional` -- verde
//     em toda parte, e o pedido do cliente nao cumprido;
//  3. **a largura a 320 dp na ARVORE DA TELA**, e nao num `SeletorDeLista`
//     montado pelo teste. `test/telas/seletor_de_atividade_a_320dp_test.dart`
//     mede o COMPONENTE com este mesmo rotulo longo e mediu 230,0 dp; ali o
//     campo ainda nao existia na tela. Aqui a casca e a tela inteira: `ListView`
//     com `EdgeInsets.all(BichuEspaco.e4)`, `BarraDeConta`, faixa de aviso e os
//     outros nove campos. Respiro diferente, largura diferente -- e e a da tela
//     que a pessoa ve.
//
// =========================================================================
// A ISCA QUE NAO MORDE, JA PAGA UMA VEZ -- E O QUE ESTE ARQUIVO FAZ EM VEZ DELA
// =========================================================================
//
// Em `seletor_de_atividade_a_320dp_test.dart` esta registrado o custo: um caso
// com `SizedBox(width: 96)` no lugar do `Expanded` ficou **verde**, porque
// `Text` sem `maxLines` **sempre** quebra linha e transbordo nunca acontece.
// `takeException()` isolado nao pode reprovar aqui, e caso que nao pode
// reprovar nao mede nada.
//
// Entao a afirmacao e a **LARGURA RECEBIDA**, com o numero medido escrito no
// `reason`, e nao a ausencia de transbordo.
//
// =========================================================================
// AS ISCAS, E COMO CADA UMA FOI PROVADA
// =========================================================================
//
// Conferidas reprovando nesta arvore, uma por vez, desfazendo depois:
//
// | o que eu desliguei | casos que reprovaram |
// |---|---|
// | tirar `'entity_kind': tipoDeEntidade.codigo` de `corpoDaSugestao` | 3 |
// | tirar o `SeletorDeLista` novo da arvore do `build` | 7 |
// | o piso da largura (`greaterThan(150)` -> `greaterThan(100000)`) | 1 |
//
// A terceira linha e o controle positivo da medicao de largura, e e dela que
// sai o numero `230,0 dp` escrito no caso: a recusa imprimiu o valor.
//
// **A primeira isca nao foi escrita por mim: ela JA EXISTIA e me acusou.** O
// caso `ISCA -- manda SO os campos de \`DirectorySuggestionInput\`` de
// `sugerir_profissional_test.dart` trava o conjunto de chaves do corpo, e
// reprovou com `entity_kind` na diferenca no instante em que o campo passou a
// sair. Foi o primeiro sinal de que a mudanca chega ao corpo, antes de eu
// escrever um `expect` sobre isso.
//
// O rotulo divergente entre app e painel e cobrado FORA daqui, porque nao ha
// como um teste Dart importar TypeScript nem o contrario:
// `admin/test/diretorio/rotulos-das-atividades.test.ts` le ESTE repositorio do
// disco e compara `TIPOS_DE_ENTIDADE` com o `enum` Dart. Isca provada ali
// tambem: trocar 'ONG' por 'Organização' no Dart reprova 1 caso.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ajuda_de_tela.dart';
import 'sugerir_profissional_test.dart'
    show abrirAPorta, abrirPerto, preencherOMinimo, redeDaIndicacao;

/// O rotulo do campo, pela constante da tela: comparar texto renderizado com a
/// constante que o produz nao mede nada, mas ACHAR o widget por ela e o
/// contrario disso -- e o que impede o caso de depender de um literal solto.
const String _rotuloDoCampo = TelaSugerirProfissional.rotuloDoTipoDeEntidade;

/// O `SeletorDeLista` do tipo de entidade, achado pelo rotulo do campo.
Finder _seletorDoTipo() => find.ancestor(
      of: find.text(_rotuloDoCampo),
      matching: find.byType(SeletorDeLista),
    );

/// Escolhe uma opcao no seletor do TIPO DE ENTIDADE.
///
/// **Nao reusa `escolherNaLista` de `sugerir_profissional_test.dart`, e a razao
/// e medida**: aquele ajudante rola com `rolarAte`, que so procura PARA BAIXO.
/// O campo de tipo fica ACIMA da atividade, da cidade e do telefone, entao
/// chamar aquele depois de `preencherOMinimo` -- que termina no campo de
/// telefone, no fim do formulario -- estourava `Bad state: No element` em
/// `scrollUntilVisible`. `rolarAteDeCimaOuDeBaixo` volta ao topo e procura
/// descendo, que e o que a pessoa faz.
Future<void> _escolherOTipo(WidgetTester tester, String opcao) async {
  await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));
  await tocar(
    tester,
    find.descendant(of: _seletorDoTipo(), matching: find.byType(InkWell)),
  );
  final item = find.descendant(
    of: find.byType(ListTile),
    matching: find.text(opcao),
  );
  if (item.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      item,
      120,
      scrollable: find
          .descendant(
            of: find.byType(BottomSheet),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }
  await tocar(tester, item);
}

/// Abre a tela de indicar **pela ROTA**, sem passar pela barra nem pela acao
/// flutuante da secao.
///
/// **So nos casos de 320 dp, e a razao e medida.** `abrirPerto` + `abrirAPorta`
/// e a porta real e e por ela que os outros casos entram -- mas com a janela
/// fixada em 320 x 900 a acao flutuante da aba `Comunidade` nao chegou a ser
/// encontrada (`Bad state: No element` em `abrirAPorta`), e perseguir isso aqui
/// mediria a casca da secao em vez do formulario. O que este grupo mede e a
/// largura DENTRO da tela de indicar; `irPara` entrega exatamente isso, e e o
/// mesmo caminho que `seletor_de_atividade_a_320dp_test.dart` usa.
Future<void> _abrirAIndicacaoPelaRota(WidgetTester tester) async {
  await abrirOApp(
    tester,
    rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
    deposito: depositoLogado(),
  );
  await irPara(tester, Rotas.sugerirProfissional);
  expect(find.byType(TelaSugerirProfissional), findsOneWidget);
}

/// Fixa a janela em [largura] x 900 com `devicePixelRatio` 1, para `320` querer
/// dizer 320 **dp** e nao 320 pixels fisicos. A altura e generosa de proposito:
/// o corpo da tela e um `ListView` e altura curta so obriga a rolar mais.
void _janela(WidgetTester tester, double largura) {
  tester.view.physicalSize = Size(largura, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  group('o campo existe na tela, com os rotulos do cliente', () {
    testWidgets('a folha oferece EXATAMENTE "Profissional ou estabelecimento" '
        'e "ONG"', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      expect(find.byType(TelaSugerirProfissional), findsOneWidget);

      // A folha e aberta pela PORTA REAL -- o `InkWell` do campo fechado --,
      // e nao por `showModalBottomSheet` chamado pelo teste.
      await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));
      await tocar(
        tester,
        find.descendant(of: _seletorDoTipo(), matching: find.byType(InkWell)),
      );

      for (final rotulo in <String>['Profissional ou estabelecimento', 'ONG']) {
        expect(
          find.descendant(
            of: find.byType(ListTile),
            matching: find.text(rotulo),
          ),
          findsOneWidget,
          reason: 'REPROVA: a folha do tipo de entidade nao oferece "$rotulo". '
              'Os DOIS textos foram definidos pelo cliente em 29/10/2026 e sao '
              'os mesmos de `TIPOS_DE_ENTIDADE` em '
              '`admin/src/diretorio/dominio.ts`. Rotulo divergente entre app e '
              'painel e defeito: `sitter` viveu meses dizendo "Hospedagem" em '
              'um lado e outra coisa no outro, COM OS DOIS VERDES.',
        );
      }

      // **A folha tem DOIS itens e nao tres**, e isto nao e contagem de
      // enfeite: o cliente nomeou TRES coisas no pedido (profissional, ONG,
      // estabelecimento) e o contrato tem DOIS valores. Um terceiro `ListTile`
      // aqui quer dizer que alguem respondeu ao pedido alargando `EntityKind`
      // -- que e `response-property-enum-value-added` no `oasdiff` e afirma que
      // estabelecimento e tipo de entidade, quando ele e ATIVIDADE (`store`).
      expect(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.byType(ListTile),
        ),
        findsNWidgets(2),
        reason: 'REPROVA: a folha do tipo de entidade nao tem exatamente duas '
            'opcoes. `EntityKind` tem dois valores.',
      );
    });

    testWidgets('o campo vem ANTES da atividade na tela', (tester) async {
      // "O que e?" vem antes de "o que faz?", que e a ordem e o argumento do
      // painel (`FormularioDaEntrada`). A afirmacao e sobre a POSICAO vertical
      // medida, e nao sobre a ordem do fonte.
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));

      final yDoTipo = tester.getTopLeft(find.text(_rotuloDoCampo)).dy;
      final yDaAtividade = tester
          .getTopLeft(find.text(TelaSugerirProfissional.rotuloDaAtividade))
          .dy;
      expect(
        yDoTipo,
        lessThan(yDaAtividade),
        reason: 'REPROVA: "o que eles fazem" aparece ANTES de '
            '"$_rotuloDoCampo". Uma ONG responde as duas perguntas, e quem le '
            '"o que faz" primeiro nao entende por que a de cima continua sendo '
            'pedida. O painel pos o tipo antes da atividade pelo mesmo motivo, '
            'e escreveu o argumento no proprio JSX.',
      );
    });
  });

  group('o PADRAO: o campo nasce em "Profissional ou estabelecimento"', () {
    testWidgets('o campo fechado ja mostra o rotulo, e NAO "Escolher na lista"',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));

      expect(
        find.descendant(
          of: _seletorDoTipo(),
          matching: find.text('Profissional ou estabelecimento'),
        ),
        findsOneWidget,
        reason: 'REPROVA: o campo de tipo de entidade abre sem valor. O padrao '
            'e deliberado e esta argumentado em `_tipoDeEntidade`: o painel '
            'nasce em `professional`, o contrato declara '
            '`default: professional` e nao existe terceira resposta nem '
            '"nenhuma". O que o padrao impede e justamente a gravacao '
            'SILENCIOSA de hoje -- aqui o valor esta escrito na tela.',
      );
      expect(
        find.descendant(
          of: _seletorDoTipo(),
          matching: find.text('Escolher na lista'),
        ),
        findsNothing,
        reason: 'REPROVA: o campo de tipo de entidade esta no estado "sem '
            'escolha". Ele nao e anulavel.',
      );
    });

    testWidgets('sem TOCAR no campo, o corpo sai com `professional`',
        (tester) async {
      // **O caso central do item.** Hoje o APK publicado manda o corpo sem o
      // campo e o servidor preenche. Com o seletor, a afirmacao passa a ser do
      // aplicativo -- e quem le o corpo da requisicao distingue "a pessoa viu a
      // pergunta" de "o APK nao tem a pergunta".
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
      expect(
        enviados.single['entity_kind'],
        'professional',
        reason: 'REPROVA: o corpo da indicacao saiu sem `entity_kind` (ou com '
            'outro valor) sem ninguem tocar no campo. O campo e OPCIONAL no '
            'contrato e o `DEFAULT` da coluna gravaria `professional` de '
            'qualquer forma: e exatamente por isso que esta ausencia nao '
            'reprovaria em lugar nenhum e precisa de um caso.',
      );
    });
  });

  group('o CORPO carrega o que foi escolhido', () {
    testWidgets('escolher "ONG" manda `organization`', (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await _escolherOTipo(tester, 'ONG');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
      expect(
        enviados.single['entity_kind'],
        'organization',
        reason: 'REPROVA: a pessoa escolheu "ONG" e o corpo nao disse '
            '`organization`. Este e o pedido do cliente inteiro: sem isto '
            'chegar ao corpo, nao ha como indicar uma ONG, e o campo na tela e '
            'enfeite.',
      );
      // O OUTRO eixo nao e tocado pela escolha: `kind` continua sendo a
      // atividade. Uma ONG que atende como clinica tem as DUAS coisas, e um
      // seletor que escrevesse `kind: 'organization'` destruiria a atividade.
      expect(
        enviados.single['kind'],
        'clinic',
        reason: 'REPROVA: escolher "ONG" mexeu em `kind`. Os dois eixos sao '
            'separados: `kind` e o que a entidade FAZ, `entity_kind` e o que '
            'ela E, e uma ONG que atende como clinica tem os dois.',
      );
    });

    testWidgets('voltar para "Profissional ou estabelecimento" manda '
        '`professional`', (tester) async {
      // O caminho de volta, porque a escolha nao pode ser de mao unica.
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await _escolherOTipo(tester, 'ONG');
      await _escolherOTipo(tester, 'Profissional ou estabelecimento');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(enviados.single['entity_kind'], 'professional');
    });
  });

  group('320 dp, na arvore da TELA', () {
    testWidgets('o rotulo escolhido recebe a largura que sobra',
        (tester) async {
      _janela(tester, 320);
      await _abrirAIndicacaoPelaRota(tester);
      await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));

      final alvo = find.descendant(
        of: _seletorDoTipo(),
        matching: find.text('Profissional ou estabelecimento'),
      );
      expect(alvo, findsOneWidget);

      // =====================================================================
      // A AFIRMACAO E A LARGURA RECEBIDA, E O NUMERO ESTA MEDIDO
      // =====================================================================
      //
      // `takeException()` sozinho NAO morde aqui -- esta registrado em
      // `seletor_de_atividade_a_320dp_test.dart` que o caso ficou verde com
      // `SizedBox(width: 96)` no lugar do `Expanded`, porque `Text` sem
      // `maxLines` sempre quebra linha.
      //
      // **MEDIDO nesta arvore, na TELA, a 320 dp: 230,0 dp.** Obtido trocando
      // o piso por `greaterThan(100000)` e lendo o numero que o proprio
      // `reason` imprime -- que e tambem o CONTROLE POSITIVO deste caso: ele
      // reprovou quando devia reprovar, e a frase de recusa saiu com o valor
      // dentro.
      //
      // **230,0 dp e o MESMO numero que `seletor_de_atividade_a_320dp_test`
      // mediu no componente solto, e a igualdade nao e coincidencia:** a casca
      // daquele caso usa `EdgeInsets.all(16)` e o corpo desta tela usa
      // `EdgeInsets.all(BichuEspaco.e4)`, que vale 16. Os dois descontam as
      // mesmas margens, o mesmo respiro interno do campo e o mesmo glifo. Se
      // `BichuEspaco.e4` mudar de valor, os dois numeros mudam juntos -- e
      // nenhum dos dois casos reprova, porque o que eles vigiam e o `Expanded`.
      //
      // O piso de 150 separa o certo (230) do quebrado (96) e nao e numero
      // redondo escolhido no ar; travar 230 exato faria o caso reprovar com
      // qualquer mudanca de respiro do design system, que nao e o que ele
      // vigia.
      final largura = tester.getSize(alvo).width;
      expect(
        largura,
        greaterThan(150),
        reason: 'REPROVA: o rotulo recebeu só ${largura.toStringAsFixed(1)} dp '
            'numa tela de 320. O estado fechado do seletor deixou de dar ao '
            'texto a largura que sobra (`Expanded`), e "Profissional ou '
            'estabelecimento" (30 caracteres, o maior rotulo do caminho da '
            'indicacao) passa a empilhar em quatro ou cinco linhas numa caixa '
            'estreita -- que e pior que transbordar, porque nao acusa.',
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a tela transbordou a 320 dp com o campo de tipo de '
            'entidade. Esta afirmacao vem DEPOIS da largura de proposito: '
            'sozinha ela nao reprova.',
      );
    });

    testWidgets('a folha aberta nao transborda a 320 dp', (tester) async {
      _janela(tester, 320);
      await _abrirAIndicacaoPelaRota(tester);
      await rolarAteDeCimaOuDeBaixo(tester, find.text(_rotuloDoCampo));
      await tocar(
        tester,
        find.descendant(of: _seletorDoTipo(), matching: find.byType(InkWell)),
      );

      expect(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Profissional ou estabelecimento'),
        ),
        findsOneWidget,
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a folha de escolha do tipo de entidade transbordou a '
            '320 dp. Ela e um `ListView.builder` sob '
            '`ConstrainedBox(maxHeight: 70%)` -- se isto reprovar, a lista '
            'rolavel virou `Column`.',
      );
    });
  });

  group('o enum Dart carrega os dois rotulos', () {
    test('`TipoDeEntidade` tem DOIS valores, com os textos do cliente', () {
      final rotulos = <String, String>{
        for (final t in TipoDeEntidade.values) t.codigo: t.rotulo,
      };
      expect(rotulos['professional'], 'Profissional ou estabelecimento');
      expect(rotulos['organization'], 'ONG');
      expect(
        TipoDeEntidade.values,
        hasLength(2),
        reason: 'REPROVA: `TipoDeEntidade` mudou de tamanho. Valor novo em '
            '`EntityKind` e mudanca de contrato -- releia a folha a 320 dp '
            'deste arquivo, porque o rotulo novo pode ser mais longo que os '
            'dois de hoje.',
      );
    });
  });
}
