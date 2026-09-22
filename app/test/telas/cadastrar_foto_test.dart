// F1.4 — Cadastrar pet: foto.
//
// A ISCA deste arquivo: **permissao de camera tem tres estados, e nao dois.**
// Concedida, negada e negada permanentemente. No terceiro, pedir de novo NAO
// abre dialogo nenhum -- o sistema nao mostra nada, e a pessoa fica tocando
// num botao que nunca mais vai responder. O unico caminho sao os ajustes do
// sistema.
//
// Uma tela escrita com `if (permitiu) ... else ...` passa em qualquer teste
// que so exercite "deu certo" e "deu errado", e falha em silencio no aparelho
// de quem recusou uma vez. Os casos abaixo exercitam os tres, e o do meio (a
// recusa que ainda abre dialogo) e diferente do de baixo de proposito.
//
// A SEGUNDA ISCA (BICHUS-157): **o cadastro chega ao passo 3 sem nunca
// escolher foto.** Ate 21/09 este teste era impossivel de escrever sem
// alterar a tela -- o unico avanco era `Usar esta foto`, que so era construido
// com `temFoto == true`. Essa impossibilidade era a prova do beco sem saida, e
// o teste que existe agora e a prova de que ele sumiu. Ele percorre F1.3
// inteira e **nao toca** em `Tirar foto` nem em `Escolher da galeria` em ponto
// nenhum: um caso que tocasse neles antes de verificar ficaria verde com o
// beco de pe.
//
// A TERCEIRA ISCA (BICHUS-158): **o quarto estado tambem e um estado.** Ate
// 21/09 a faixa de aviso era construida so para `negadaPermanentemente`, e o
// estado real deste build e `indisponivel` -- os dois botoes ficavam mudos e a
// tela nao explicava nada. O grupo do fim exercita os **quatro** estados
// separadamente, e reprova se alguem restringir o aviso de novo a
// `negadaPermanentemente`.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> semServidor(http.Request _) async =>
      http.Response('', 404);

  RascunhoDePet rascunhoDaNina() {
    return RascunhoDePet()
      ..nome = 'Nina'
      ..especie = Especie.cao
      ..porte = Porte.medio;
  }

  Future<void> abrirF14(
    WidgetTester tester, {
    required CameraEGaleria camera,
    RascunhoDePet? rascunho,
  }) async {
    await abrirOApp(tester, rede: semServidor, camera: camera);
    await irPara(
      tester,
      Rotas.cadastrarPetFoto,
      extra: rascunho ?? rascunhoDaNina(),
    );
  }

  testWidgets('a tela abre no passo 2, com o nome do pet e a saida',
      (tester) async {
    await abrirF14(tester, camera: CameraDeTeste(EstadoDaPermissao.concedida));

    expect(find.text('Passo 2 de 3'), findsOne);
    expect(find.text('Uma foto de Nina'), findsOne);
    expect(find.textContaining('reconhecer seu pet na rua'), findsOne);
    expect(find.byTooltip('Voltar'), findsOne);
  });

  testWidgets('com a camera concedida, Tirar foto e a acao principal em 64 dp',
      (tester) async {
    await abrirF14(tester, camera: CameraDeTeste(EstadoDaPermissao.concedida));

    final principal =
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto);
    expect(principal, findsOne);

    final alvo = tamanhoDoAlvo(tester, principal);
    expect(
      alvo.height,
      greaterThanOrEqualTo(pisoCritico),
      reason: 'REPROVA: alvo de ${alvo.height} dp na acao principal de F1.4.',
    );
    exigirRotuloAnunciavel(tester, TextosDoCadastro.tirarFoto, na: 'F1.4');
    // A galeria continua ao lado: quem nao quer usar a camera agora nao
    // precisa liberar nada.
    expect(find.text(TextosDoCadastro.escolherDaGaleria), findsOne);
  });

  testWidgets('recusa permanente inverte a acao principal e oferece os ajustes',
      (tester) async {
    final camera = CameraDeTeste(EstadoDaPermissao.negadaPermanentemente);
    await abrirF14(tester, camera: camera);

    final principal =
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.escolherDaGaleria);
    expect(
      principal,
      findsOne,
      reason: 'REPROVA: com a camera recusada em definitivo, `Tirar foto` '
          'continuou como acao principal. A acao principal e a que resolve.',
    );
    expect(
      tamanhoDoAlvo(tester, principal).height,
      greaterThanOrEqualTo(pisoCritico),
    );

    // `Tirar foto` **continua visivel**: esconde-lo faria a pessoa achar que o
    // app perdeu a funcao, em vez de entender que ela pode liberar.
    expect(
      find.text(TextosDoCadastro.tirarFoto),
      findsOne,
      reason: 'REPROVA: `Tirar foto` sumiu com a permissao negada.',
    );

    await rolarAte(tester, find.text(TextosDoCadastro.abrirOsAjustes));
    await tocar(tester, find.text(TextosDoCadastro.abrirOsAjustes));
    expect(
      camera.abriuAjustes,
      isTrue,
      reason: 'REPROVA: o terceiro estado de permissao nao leva aos ajustes. '
          'Pedir de novo depois da recusa permanente nao abre dialogo nenhum.',
    );
  });

  testWidgets('a recusa que ainda abre dialogo NAO manda para os ajustes',
      (tester) async {
    // Este e o caso que separa o segundo estado do terceiro. Mandar quem
    // recusou uma vez para os ajustes do sistema e fazer a pessoa percorrer
    // cinco telas de configuracao para responder de novo uma pergunta que o
    // proprio app ainda pode fazer.
    final camera = CameraDeTeste(
      EstadoDaPermissao.negada,
      depoisDePedir: EstadoDaPermissao.concedida,
    );
    await abrirF14(tester, camera: camera);

    expect(
      find.text(TextosDoCadastro.abrirOsAjustes),
      findsNothing,
      reason: 'REPROVA: a recusa simples foi tratada como permanente.',
    );

    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
    );
    expect(
      camera.abriuAjustes,
      isFalse,
      reason: 'REPROVA: o app abriu os ajustes em vez de pedir a permissao, '
          'que e o que ainda funciona neste estado.',
    );
  });

  testWidgets('a foto escolhida vira pre-visualizacao com Usar e Trocar',
      (tester) async {
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: const FotoLocal(
        caminho: '/tmp/nina.jpg',
        tipoDeConteudo: 'image/jpeg',
        tamanhoEmBytes: 1024,
      ),
    );
    await abrirF14(tester, camera: camera);

    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
    );

    expect(find.text(TextosDoCadastro.usarEstaFoto), findsOne);
    expect(find.text(TextosDoCadastro.trocarAFoto), findsOne);
    expect(
      find.text(TextosDoCadastro.nenhumaFotoAinda),
      findsNothing,
      reason: 'REPROVA: a area continuou dizendo que nao ha foto depois de '
          'uma ser escolhida.',
    );
  });

  testWidgets('o avanco para F1.5 nao espera o envio da foto', (tester) async {
    // A promessa de F1.4 e que o upload nao bloqueia o avanco. O servidor nem
    // existe aqui, e mesmo assim a pessoa chega ao passo 3.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: const FotoLocal(
        caminho: '/tmp/nina.jpg',
        tipoDeConteudo: 'image/jpeg',
        tamanhoEmBytes: 1024,
      ),
    );
    await abrirF14(tester, camera: camera);

    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
    );
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.usarEstaFoto),
    );

    expect(
      find.text('Passo 3 de 3'),
      findsOne,
      reason: 'REPROVA: o avanco ficou preso ao envio da foto. O upload '
          'continua em segundo plano; travar o cadastro por ele perde o pet '
          'por causa de uma rede ruim.',
    );
  });

  // -- BICHUS-157 e BICHUS-158 ---------------------------------------------

  Future<http.Response> comAListaDeRacas(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    return http.Response('', 404);
  }

  /// Nenhum controle da barra pode estar sem acao.
  ///
  /// Botao desabilitado nao e anunciado como acionavel, nao diz o que falta e
  /// nao diz quando vai deixar de faltar (design system 11.10 e 11.11). Num
  /// assistente de tres passos isso e indistinguivel de app travado.
  void exigirNenhumBotaoMudo(WidgetTester tester, {required String no}) {
    for (final botao in tester.widgetList<BotaoPrimario>(
      find.byType(BotaoPrimario),
    )) {
      expect(
        botao.aoTocar,
        isNotNull,
        reason: 'REPROVA: a acao principal "${botao.rotulo}" esta '
            'desabilitada em $no. Botao que nao responde e o defeito da '
            'BICHUS-158.',
      );
    }
    for (final botao in tester.widgetList<BotaoSecundario>(
      find.byType(BotaoSecundario),
    )) {
      expect(
        botao.aoTocar,
        isNotNull,
        reason: 'REPROVA: a acao secundaria "${botao.rotulo}" esta '
            'desabilitada em $no.',
      );
    }
  }

  testWidgets(
      'ISCA BICHUS-157: o cadastro chega ao passo 3 sem NUNCA escolher foto',
      (tester) async {
    // A camera deste build. Nao e um duble complacente: e a implementacao que
    // esta no aparelho do cliente hoje, e ela nao devolve foto nenhuma.
    await abrirOApp(
      tester,
      rede: comAListaDeRacas,
      camera: const CameraNaoEmbarcada(),
    );
    await irPara(tester, Rotas.cadastrarPet);

    await tester.enterText(find.byType(TextField).first, 'Nina');
    await tocar(tester, find.text('Cão'));
    await tocar(tester, find.text('Médio'));
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.continuar),
    );
    expect(find.text('Passo 2 de 3'), findsOne);

    // Daqui para frente: nenhum toque em `Tirar foto`, nenhum em
    // `Escolher da galeria`. E esse o ponto do caso.
    await tocar(tester, find.text(TextosDoCadastro.seguirSemFoto));

    expect(
      find.text('Passo 3 de 3'),
      findsOne,
      reason: 'REPROVA: o cadastro nao avanca sem foto. A foto e opcional no '
          'contrato (`POST /v1/pets` exige name, species e size) e por '
          'decisao do cliente de 21/09; sem caminho para frente, F1.4 e um '
          'beco sem saida no meio do fluxo principal do produto.',
    );
    expect(
      find.text(TextosDoCadastro.tituloDosSinais('Nina')),
      findsOne,
      reason: 'REPROVA: os dados da identificacao nao atravessaram o passo. O '
          'rascunho precisa chegar inteiro em F1.5, so sem a foto.',
    );
  });

  testWidgets(
      'BICHUS-157 criterio 3: a acao de pular sobrevive a foto escolhida',
      (tester) async {
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: const FotoLocal(
        caminho: '/tmp/nina.jpg',
        tipoDeConteudo: 'image/jpeg',
        tamanhoEmBytes: 1024,
      ),
    );
    await abrirF14(tester, camera: camera);
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
    );

    expect(find.text(TextosDoCadastro.usarEstaFoto), findsOne);
    expect(
      find.text(TextosDoCadastro.seguirSemFoto),
      findsOne,
      reason: 'REPROVA: a acao de pular sumiu quando uma foto foi escolhida. '
          'Aparecer e sumir conforme o estado e o que fazia a barra parecer '
          'que a tela tinha mudado de regra.',
    );
    // Nao se confunde com `Usar esta foto`: ela **nao** e a acao principal, e
    // o destino e sem foto.
    expect(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.seguirSemFoto),
      findsNothing,
      reason: 'REPROVA: com uma foto escolhida, pular virou a acao principal '
          'e concorre com `Usar esta foto`.',
    );
  });

  testWidgets('BICHUS-157 criterio 5: a acao de pular e um alvo de 48 dp com '
      'nome acessivel, e nao um link de texto', (tester) async {
    await abrirF14(tester, camera: const CameraNaoEmbarcada());

    final pular = find.widgetWithText(
      BotaoSecundario,
      TextosDoCadastro.seguirSemFoto,
    );
    expect(
      pular,
      findsOne,
      reason: 'REPROVA: a acao de pular nao e um controle com alvo de toque. '
          'Link de texto pequeno nao atende a exigencia de acessibilidade '
          'desta historia.',
    );
    final alvo = tamanhoDoAlvo(tester, pular);
    expect(
      alvo.height,
      greaterThanOrEqualTo(pisoMinimo),
      reason: 'REPROVA: alvo de ${alvo.height} dp na acao de pular. O piso do '
          'produto e $pisoMinimo dp.',
    );
    exigirRotuloAnunciavel(
      tester,
      TextosDoCadastro.seguirSemFotoAnunciado,
      na: 'F1.4',
    );
  });

  testWidgets('BICHUS-157 criterio 6: a tela NAO promete acrescentar a foto '
      'depois', (tester) async {
    // Enquanto a BICHUS-61 (editar o pet) nao entregar, nao existe tela onde
    // isso aconteca. Prometer seria repetir o defeito que esta historia
    // conserta: promessa escrita sem caminho construido.
    await abrirF14(tester, camera: const CameraNaoEmbarcada());

    expect(
      find.textContaining(
        RegExp('depois|mais tarde|Editar|editar', caseSensitive: false),
      ),
      findsNothing,
      reason: 'REPROVA: a tela promete acrescentar a foto depois. O destino '
          'existe no desenho (edicao do pet, BICHUS-61) e NAO existe no app: '
          'nao ha rota de listagem, de ficha nem de edicao de pet.',
    );
  });

  testWidgets('BICHUS-157 criterio 8: a ausencia de foto nao e estado '
      'invalido', (tester) async {
    await abrirF14(tester, camera: const CameraNaoEmbarcada());

    exigirNenhumBotaoMudo(tester, no: 'F1.4 sem foto');
    for (final faixa in tester.widgetList<FaixaDeAviso>(
      find.byType(FaixaDeAviso),
    )) {
      expect(
        faixa.peso,
        PesoDaFaixa.informativo,
        reason: 'REPROVA: a tela trata a falta de foto com peso de erro. A '
            'foto e opcional por decisao do cliente de 21/09; nada deu '
            'errado.',
      );
    }
  });

  group('ISCA BICHUS-158: os quatro estados, um a um', () {
    testWidgets('indisponivel: a tela diz que camera e galeria nao existem '
        'neste aplicativo', (tester) async {
      await abrirF14(tester, camera: const CameraNaoEmbarcada());

      await rolarAte(
        tester,
        find.textContaining('ainda não estão disponíveis'),
      );
      expect(
        find.text(TextosDoCadastro.cameraNaoEmbarcada),
        findsOne,
        reason: 'REPROVA: com a camera `indisponivel` a tela nao diz nada. O '
            'aviso estava restrito a `negadaPermanentemente`, e o estado real '
            'deste build e `indisponivel` -- foi assim que os dois botoes '
            'chegaram mudos ao cliente.',
      );
    });

    testWidgets('indisponivel: nenhum botao de camera ou galeria e construido',
        (tester) async {
      await abrirF14(tester, camera: const CameraNaoEmbarcada());

      expect(
        find.text(TextosDoCadastro.tirarFoto),
        findsNothing,
        reason: 'REPROVA: `Tirar foto` continua na barra sem poder funcionar. '
            'Sem acao possivel, nenhum botao (design system 11.10).',
      );
      expect(
        find.text(TextosDoCadastro.escolherDaGaleria),
        findsNothing,
        reason: 'REPROVA: `Escolher da galeria` continua na barra. Era ele o '
            'botao PRIMARIO mudo: com `_cameraEPrincipal` falso, a barra o '
            'promovia a acao critica da tela.',
      );
      expect(
        find.byType(BotaoPrimario),
        findsNothing,
        reason: 'REPROVA: a tela construiu uma acao principal num estado em '
            'que nenhuma das duas acoes de foto funciona.',
      );
    });

    testWidgets('indisponivel: a unica acao oferecida responde ao toque',
        (tester) async {
      await abrirF14(tester, camera: const CameraNaoEmbarcada());

      final acoes = find.descendant(
        of: find.byType(BarraDeAcaoFixa),
        matching: find.byType(BotaoSecundario),
      );
      expect(
        acoes,
        findsOne,
        reason: 'REPROVA: a barra nao oferece exatamente uma acao. Neste '
            'estado ha uma so que funciona: mais de uma significa botao mudo '
            'de volta, e nenhuma significa o beco sem saida de volta.',
      );
      exigirNenhumBotaoMudo(tester, no: 'F1.4 com a camera indisponivel');

      await tocar(tester, acoes);
      expect(
        find.text('Passo 3 de 3'),
        findsOne,
        reason: 'REPROVA: a unica acao da tela nao levou a lugar nenhum. '
            'Nenhum caminho pode terminar em silencio (criterio 3).',
      );
    });

    testWidgets('indisponivel: a tela NAO manda aos ajustes do sistema',
        (tester) async {
      await abrirF14(tester, camera: const CameraNaoEmbarcada());

      expect(
        find.text(TextosDoCadastro.abrirOsAjustes),
        findsNothing,
        reason: 'REPROVA: a tela manda aos ajustes num estado em que nao ha '
            'permissao a conceder. A pessoa percorreria os ajustes atras do '
            'que nao esta la (comentario do proprio enum).',
      );
      expect(find.text(TextosDoCadastro.cameraNegada), findsNothing);
    });

    testWidgets('negadaPermanentemente NAO regride, e continua diferente de '
        'indisponivel', (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.negadaPermanentemente);
      await abrirF14(tester, camera: camera);

      await rolarAte(tester, find.text(TextosDoCadastro.abrirOsAjustes));
      expect(
        find.text(TextosDoCadastro.cameraNegada),
        findsOne,
        reason: 'REPROVA: a faixa da recusa permanente sumiu. Este caso e '
            'diferente de `indisponivel` e nao pode regredir (criterio 4).',
      );
      expect(
        find.text(TextosDoCadastro.cameraNaoEmbarcada),
        findsNothing,
        reason: 'REPROVA: os dois estados passaram a dizer a mesma coisa. Um '
            'tem o que liberar nos ajustes; o outro nao tem nada a ajustar, e '
            'juntar os textos manda metade das pessoas ao lugar errado.',
      );
      // E o pular continua ali, que e o criterio 4 da BICHUS-157.
      expect(find.text(TextosDoCadastro.seguirSemFoto), findsOne);
    });

    testWidgets('concedida e negada: nada mudou, e o pular esta nos dois',
        (tester) async {
      for (final estado in <EstadoDaPermissao>[
        EstadoDaPermissao.concedida,
        EstadoDaPermissao.negada,
      ]) {
        await abrirF14(tester, camera: CameraDeTeste(estado));

        expect(
          find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
          findsOne,
          reason: 'REPROVA: em $estado `Tirar foto` deixou de ser a acao '
              'principal. Ali a camera pode funcionar.',
        );
        expect(
          find.text(TextosDoCadastro.cameraNaoEmbarcada),
          findsNothing,
          reason: 'REPROVA: em $estado a tela diz que a camera nao existe '
              'neste build. Diz respeito so a `indisponivel`.',
        );
        expect(
          find.text(TextosDoCadastro.seguirSemFoto),
          findsOne,
          reason: 'REPROVA: em $estado nao ha como avancar sem foto.',
        );
        exigirNenhumBotaoMudo(tester, no: 'F1.4 em $estado');
      }
    });
  });
}
