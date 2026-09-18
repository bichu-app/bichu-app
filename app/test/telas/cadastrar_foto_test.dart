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

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
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
}
