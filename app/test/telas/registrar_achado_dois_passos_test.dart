// O formulario de achado em DOIS PASSOS (cliente, 17/10/2026) -- e as tres
// formas de perder o que a pessoa digitou.
//
// **ESTES CASOS NAO FORAM RODADOS.** A tarefa que os escreveu proibia rodar
// suite; eles estao aqui escritos e nao executados, e isso precisa ser dito em
// vez de descoberto.
//
// Por que estes tres, e nao "o passo 2 abre":
//
//   1. **voltar ao 1 e avancar de novo** devolve o passo 2 como ele estava. E
//      o caso que ninguem escreve: "voltar preserva o passo 1" e o facil, e
//      quem implementa com rota nova ou com `if` no corpo acerta o facil e
//      perde este -- porque o trecho de localizacao guarda bairro, cidade e UF
//      em `TextEditingController` que morrem com a desmontagem;
//   2. **reconstruir a tela** (girar o aparelho e a forma comum) nao limpa
//      nada. Estado que mora no widget e nao acima dele se perde aqui, e nao
//      se perde em teste manual rapido;
//   3. **a foto sobrevive ao vai e volta e NAO e lida de novo.** Reler os
//      bytes a cada volta gastaria a internet da pessoa e poderia deixar
//      objeto orfao no armazenamento. `CameraDeTeste.vezesQueLeuOsBytes` e
//      quem enxerga isso -- nenhuma verificacao de texto enxergaria.
//
// E mais um, que e o defeito que abriu esta tarefa: **a cidade so diz
// "(opcional)" quando ela e mesmo opcional**.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'registrar_achado_test.dart'
    show avancarParaOPasso2, localizacaoConcedida;

/// A rede destes casos: a lista fechada, e nada mais.
///
/// Nenhum caso aqui registra achado -- o que se mede e o formulario entre os
/// dois passos. Uma rede que respondesse 201 ao registro daria a impressao de
/// que estes casos exercitam o envio, e eles nao exercitam.
Future<http.Response> _soAReferencia(http.Request req) async {
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  return problema('not-found', 404);
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
      matching: find.byType(TextField),
    );

/// O [BichuField] cujo rotulo e [rotulo], para ler o `opcional` dele.
BichuField _bichuField(WidgetTester tester, String rotulo) =>
    tester.widget<BichuField>(
      find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
    );

Future<void> _voltarAoPasso1(WidgetTester tester) async {
  final botao = find.widgetWithText(
    OutlinedButton,
    TextosDoAchado.voltarAoPasso1,
  );
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

/// Preenche o passo 1 inteiro e para nele.
Future<void> _preencherOPasso1(WidgetTester tester) async {
  await rolarAte(tester, find.text('Cão'));
  await tocar(tester, find.text('Cão'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
}

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 -- ir ao 2, voltar ao 1, e avancar DE NOVO
  //
  // DESLIGAR PARA VER REPROVAR: em `tela_registrar_achado.dart`, troque o
  // `IndexedStack` por `_passo == 0 ? _Passo1(...) : _Passo2(...)`. O passo 1
  // continua preenchido (ele mora no rascunho) e a cidade some, porque ela
  // mora no controlador do trecho de localizacao, que foi desmontado.
  // -------------------------------------------------------------------------
  group('ISCA -- voltar ao passo 1 nao apaga o passo 2', () {
    testWidgets('a cidade digitada continua la depois de voltar e avancar',
        (tester) async {
      await abrirOApp(tester, rede: _soAReferencia, deposito: depositoLogado());
      await irPara(tester, Rotas.registrarAchado);

      await _preencherOPasso1(tester);
      await avancarParaOPasso2(tester);
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );
      await tocar(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
      await tester.enterText(
        _campo(TextosDaLocalizacao.rotuloCidade),
        'São Paulo',
      );
      await tester.pumpAndSettle();

      await _voltarAoPasso1(tester);
      // O passo 1 continua preenchido -- o caso facil, medido junto para a
      // isca nao ficar verde por uma tela que preserva so o passo 2.
      expect(
        tester
            .widget<BotaoPrimario>(
              find.widgetWithText(BotaoPrimario, TextosDoAchado.continuar),
            )
            .aoTocar,
        isNotNull,
        reason: 'REPROVA: voltar ao passo 1 apagou a especie ou o porte, e '
            '`Continuar` ficou morto numa pagina que a pessoa ja preencheu.',
      );

      await avancarParaOPasso2(tester);
      await rolarAte(tester, _campo(TextosDaLocalizacao.rotuloCidade));
      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloCidade))
            .controller
            ?.text,
        'São Paulo',
        reason: 'REPROVA: a cidade digitada no passo 2 sumiu entre voltar ao '
            'passo 1 e avancar de novo. Formulario de duas paginas que '
            'esquece a pagina que a pessoa ja preencheu e pior que um unico '
            'longo.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 -- reconstruir a tela (girar o aparelho) nao limpa nada
  //
  // DESLIGAR PARA VER REPROVAR: mova `_rascunho` para dentro de `_Passo1` como
  // estado proprio. A rotacao reconstroi os widgets, e o que estiver guardado
  // abaixo do `State` da tela vai junto.
  // -------------------------------------------------------------------------
  group('ISCA -- girar o aparelho nao apaga o formulario', () {
    testWidgets('o passo 1 e o passo 2 sobrevivem a mudanca de tamanho',
        (tester) async {
      await abrirOApp(tester, rede: _soAReferencia, deposito: depositoLogado());
      await irPara(tester, Rotas.registrarAchado);

      await _preencherOPasso1(tester);
      await avancarParaOPasso2(tester);
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );
      await tocar(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
      await tester.enterText(
        _campo(TextosDaLocalizacao.rotuloBairro),
        'Vila Madalena',
      );
      await tester.pumpAndSettle();

      // A rotacao, como o framework a entrega: o tamanho da janela muda e a
      // arvore reconstroi. Nao ha `pumpWidget` novo -- isso seria montar
      // outro app, e passaria a medir outra coisa.
      tester.view.physicalSize = const Size(2424, 1080);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloBairro))
            .controller
            ?.text,
        'Vila Madalena',
        reason: 'REPROVA: girar o aparelho apagou o bairro. O estado esta '
            'morando dentro do passo, e nao acima dos dois.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 -- a foto sobrevive ao vai e volta, e nao e lida de novo
  //
  // DESLIGAR PARA VER REPROVAR: faca `_Passo1` guardar a foto em estado
  // proprio em vez de escrever em `rascunho.foto`.
  // -------------------------------------------------------------------------
  group('ISCA -- a foto escolhida nao se perde e nao se reenvia', () {
    testWidgets('continua escolhida depois de ir ao passo 2 e voltar',
        (tester) async {
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: const FotoLocal(
          caminho: '/tmp/achado.jpg',
          tipoDeConteudo: 'image/jpeg',
          tamanhoEmBytes: 2048,
        ),
      );
      await abrirOApp(
        tester,
        rede: _soAReferencia,
        deposito: depositoLogado(),
        camera: camera,
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);

      await _preencherOPasso1(tester);
      await rolarAte(tester, find.text(TextosDoAchado.escolherDaGaleria));
      await tocar(tester, find.text(TextosDoAchado.escolherDaGaleria));

      await avancarParaOPasso2(tester);
      await _voltarAoPasso1(tester);

      await rolarAte(tester, find.text(TextosDoAchado.trocarAFoto));
      expect(
        find.text(TextosDoAchado.trocarAFoto),
        findsOneWidget,
        reason: 'REPROVA: a foto escolhida sumiu no vai e volta entre os dois '
            'passos, e a tela voltou a oferecer `Tirar foto` como se nada '
            'tivesse sido escolhido.',
      );

      expect(
        camera.vezesQueLeuOsBytes,
        0,
        reason: 'REPROVA: os bytes da foto foram lidos no vai e volta entre '
            'os passos. Reenviar a cada volta gasta a internet da pessoa e '
            'pode deixar objeto orfao no armazenamento -- a foto so sai '
            'depois que o achado existe, e uma vez so.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 4 -- "(opcional)" so quando e mesmo opcional
  //
  // E o defeito que o cliente reportou: formulario inteiro preenchido, botao
  // morto. Sem ponto no mapa, a cidade e o unico campo que faz o `onde`
  // existir -- e a tela a rotulava "(opcional)" junto dos outros dois.
  //
  // DESLIGAR PARA VER REPROVAR: em `captura_de_localizacao.dart`, volte o
  // campo da cidade para `opcional: true`.
  // -------------------------------------------------------------------------
  group('ISCA -- a cidade nao se diz opcional quando ela destrava o envio',
      () {
    testWidgets('sem ponto, a cidade NAO e rotulada como opcional',
        (tester) async {
      await abrirOApp(tester, rede: _soAReferencia, deposito: depositoLogado());
      await irPara(tester, Rotas.registrarAchado);
      await _preencherOPasso1(tester);
      await avancarParaOPasso2(tester);
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );
      await tocar(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));

      expect(
        _bichuField(tester, TextosDaLocalizacao.rotuloCidade).opcional,
        isFalse,
        reason: 'REPROVA: a cidade aparece como "(opcional)" sem haver ponto '
            'no mapa. Ela e o unico campo que faz o `onde` existir, e dizer '
            'que ela e dispensavel e o que deixa o botao `Registrar achado` '
            'morto com o formulario inteiro preenchido.',
      );
      expect(
        _bichuField(tester, TextosDaLocalizacao.rotuloBairro).opcional,
        isTrue,
        reason: 'REPROVA: o bairro virou obrigatorio. O contrato exige `city` '
            'e mais nada (`Area.required: [city]`), e cobrar o bairro de quem '
            'achou um animal numa rua que nao conhece e a pergunta que a '
            'BICHUS-35 proibe.',
      );
    });

    testWidgets('COM ponto, a cidade volta a ser opcional', (tester) async {
      await abrirOApp(
        tester,
        rede: _soAReferencia,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await _preencherOPasso1(tester);
      await avancarParaOPasso2(tester);
      await rolarAte(tester, find.text(TextosDaLocalizacao.usarMinhaLocalizacao));
      await tocar(tester, find.text(TextosDaLocalizacao.usarMinhaLocalizacao));

      expect(
        _bichuField(tester, TextosDaLocalizacao.rotuloCidade).opcional,
        isTrue,
        reason: 'REPROVA: com a coordenada em maos o `onde` ja existe, e a '
            'cidade passa a ser mesmo opcional. Cobra-la aqui seria mentir '
            'no outro sentido.',
      );
    });
  });
}
