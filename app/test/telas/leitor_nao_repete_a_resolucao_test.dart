// ISCA (A): o leitor nao resolve o mesmo codigo de novo enquanto a tela do pet
// esta por cima.
//
// ## O defeito que ela desliga
//
// O relato do cliente: *"ao scanear uma tag, a aplicacao entrou em looping
// varias vezes, e depois de tudo abriu uma tela"*.
//
// O mecanismo estava em `tela_leitor_de_qr.dart`. O unico portao contra a
// repeticao era `_resolvendo`, e ele era DESLIGADO antes do `push`:
//
//     setState(() { _resolvendo = false; ... });
//     await context.push(Rotas.petDaTagDe(codigo), extra: tag);
//
// `push` nao tira o leitor da arvore -- e dito no proprio comentario da linha,
// como virtude ("o leitor continua na pilha"). Por continuar na arvore, o
// `MobileScanner` continua entregando o MESMO simbolo varias vezes por
// segundo. Cada quadro passava pelo portao ja aberto, resolvia o codigo de
// novo e empilhava outra copia da tela do pet: uma rajada de
// `GET /v1/tags/{code}` e uma pilha de telas identicas para voltar uma a uma.
//
// ## Por que ela e prova por DESLIGAMENTO
//
// O caso CONTA as idas ao servidor e CONTA as copias da tela na arvore. Ele
// nao afirma que "a tela abriu", que e o que ficaria verde com o defeito
// presente -- com o laco a tela tambem abre, varias vezes. Devolver
// `_rotaSobreposta` ao que era, ou religa-lo depois do `push` em vez de antes,
// faz os dois numeros subirem e os dois `expect` reprovarem com o numero medido
// na mensagem.
//
// O segundo caso prova que o portao ABRE de novo: um portao que ficasse fechado
// para sempre tambem zeraria a contagem, e seria um defeito pior -- quem
// escaneou a plaquinha errada voltaria para a camera e ela nunca mais leria
// nada. Sem este caso, a correcao poderia ser "desligar a camera".
//
// ESCRITA E NAO RODADA nesta entrega, por instrucao do cliente.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/escanear/tela_do_pet_da_tag.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  const String codigo = '7K2MQ1D4B8NV3XZ0';
  const String qrDaPlaquinha = 'https://bichu.app/t/$codigo';
  const String outroCodigo = 'Q4B8NV3XZ07K2M1D';
  const String qrDaOutraPlaquinha = 'https://bichu.app/t/$outroCodigo';

  /// Quantos quadros a camera entrega enquanto a tela do pet sobe.
  ///
  /// Seis e conservador: `DetectionSpeed.normal` entrega varios por segundo, e
  /// a transicao de rota do Material dura 300 ms. O numero nao precisa ser o
  /// real -- precisa ser maior que um, que e o que o portao promete.
  const int quadrosDepoisDoPush = 6;

  Map<String, dynamic> corpoDaTag(String nome) => <String, dynamic>{
    'viewer': 'anonymous',
    'pet': <String, dynamic>{
      'display_name': nome,
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

  /// A rede que CONTA as idas a `GET /v1/tags/{code}`.
  ///
  /// A contagem e por codigo: o segundo caso escaneia a outra plaquinha e
  /// precisa distinguir "resolveu a segunda" de "resolveu a primeira de novo".
  (Future<http.Response> Function(http.Request), Map<String, int>) redeQueConta() {
    final idas = <String, int>{};
    Future<http.Response> rede(http.Request req) async {
      if (req.method == 'GET' && req.url.path.startsWith('/v1/tags/')) {
        final qual = req.url.path.split('/').last;
        idas[qual] = (idas[qual] ?? 0) + 1;
        return json200(corpoDaTag(qual == codigo ? 'Thor' : 'Nina'));
      }
      return http.Response('', 404);
    }

    return (rede, idas);
  }

  Future<LeitorDeQrDeTeste> escanear(
    WidgetTester tester,
    Future<http.Response> Function(http.Request) rede,
  ) async {
    final leitor = LeitorDeQrDeTeste();
    await abrirOApp(
      tester,
      rede: rede,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: leitor,
    );
    // **A porta de escanear MUDOU DE LUGAR DUAS VEZES, e nenhuma delas e
    // aqui**: icone na barra de `Pets` em 18/10, tela da conta em 19/10
    // (*"leve o icone de qr-code de escanear para a pagina do perfil"*). Por
    // isso ela mora num ajudante so, `irAoLeitorDeQr`, que sabe onde ela esta
    // hoje -- as duas mudancas custaram zero edicoes neste arquivo.
    await irAoLeitorDeQr(tester);
    leitor.ler(qrDaPlaquinha);
    await tester.pumpAndSettle();
    return leitor;
  }

  group('ISCA — a camera cala enquanto ha tela por cima', () {
    testWidgets(
      'o mesmo simbolo entregue $quadrosDepoisDoPush vezes depois do push '
      'produz UMA ida ao servidor e UMA tela',
      (tester) async {
        final (rede, idas) = redeQueConta();
        final leitor = await escanear(tester, rede);

        expect(
          find.byType(TelaDoPetDaTag),
          findsOneWidget,
          reason:
              'REPROVA ANTES DA MEDICAO: a primeira leitura nao abriu a tela '
              'do pet. O caso mede repeticao, e sem a primeira resolucao nao '
              'ha o que repetir.',
        );

        // A CAMERA NAO PAROU. O leitor continua montado embaixo da tela do pet
        // -- `push` e nao `go` --, e o mesmo simbolo continua no quadro.
        for (var i = 0; i < quadrosDepoisDoPush; i++) {
          leitor.ler(qrDaPlaquinha);
          await tester.pump(const Duration(milliseconds: 16));
        }
        await tester.pumpAndSettle();

        expect(
          idas[codigo],
          1,
          reason:
              'REPROVA: o leitor foi ao servidor ${idas[codigo]} vezes para o '
              'MESMO codigo. Era este o laco que o cliente viu ("entrou em '
              'looping varias vezes"): `_resolvendo` era desligado ANTES do '
              '`push`, o leitor continuava montado com a camera viva embaixo '
              'da tela do pet, e cada quadro seguinte disparava outra '
              '`GET /v1/tags/{code}`. Um simbolo parado na frente da lente e '
              'UMA resolucao.',
        );

        expect(
          find.byType(TelaDoPetDaTag, skipOffstage: false),
          findsOneWidget,
          reason:
              'REPROVA: ha mais de uma copia da tela do pet empilhada. E a '
              'segunda metade do mesmo defeito, e a que o cliente sentiu no '
              'dedo: depois do laco ele precisava voltar uma tela por vez '
              'para sair ("depois de tudo abriu uma tela"). O portao precisa '
              'valer para o `push`, e nao so para a chamada.',
        );
      },
    );

    testWidgets('o portao ABRE de novo quando a tela do pet sai da pilha', (
      tester,
    ) async {
      final (rede, idas) = redeQueConta();
      final leitor = await escanear(tester, rede);

      // Volta para a camera, que e o caminho de quem escaneou a plaquinha
      // errada. O comentario do `push` promete exatamente isto.
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();

      leitor.ler(qrDaOutraPlaquinha);
      await tester.pumpAndSettle();

      expect(
        idas[outroCodigo],
        1,
        reason:
            'REPROVA: a camera ficou muda depois de a tela do pet sair. O '
            'conserto do laco nao pode ser desligar o leitor: quem escaneou a '
            'plaquinha errada volta para a camera e aponta para a proxima sem '
            'tocar em nada, e e isso que o `push` existe para permitir. O '
            'portao fecha na ida e ABRE na volta.',
      );
      // `textContaining`, e nao `text`: a tela escreve a frase inteira --
      // `Este é o Nina.` --, e `find.text` compara a string TODA. Medido nesta
      // arvore: depois da segunda leitura a tela mostra `Este é o Nina.`, ou
      // seja, ela TROCOU de pet como o caso afirma; o que nao existia era um
      // `Text` cujo conteudo fosse exatamente `Nina`.
      expect(
        find.textContaining('Nina'),
        findsWidgets,
        reason:
            'REPROVA: a segunda plaquinha resolveu no servidor e a tela nao '
            'mudou de pet.',
      );
    });
  });
}
