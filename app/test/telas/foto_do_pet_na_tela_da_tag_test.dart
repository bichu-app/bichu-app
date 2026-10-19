// ISCA (B, metade do aplicativo): a tela do pet da tag DESENHA a foto que o
// servidor mandar.
//
// ## O defeito que ela desliga
//
// O relato do cliente: escaneou a plaquinha e a tela abriu *"sem foto do pet"*.
//
// Eram duas metades. A do servidor esta em
// `src/modules/tags/adapters/http/foto-na-resolucao-da-tag.test.ts`: a rota
// escrevia `photo_url: null` numa linha fixa. Esta aqui e a do aplicativo: a
// tela foi escrita para NUNCA desenhar foto, com a prosa afirmando que
// "`photo_url` chega `null` nesta rota, por desenho do servidor". O contrato
// declara o campo e o exemplo de 200 de `resolveTagCode` traz um endereco --
// a afirmacao estava errada, e consertar so o servidor deixaria a foto
// chegando e sendo ignorada.
//
// ## Por que ela e prova por DESLIGAMENTO
//
// O primeiro caso manda `photo_url` preenchido e exige uma `Image` com AQUELE
// endereco. Uma tela que volte a ignorar o campo reprova; uma que desenhe uma
// imagem qualquer tambem, porque o endereco e comparado.
//
// O segundo caso e o contrapeso, e ele guarda a regra 5.4 do design system,
// que continua valendo: sem foto NAO entra moldura, simbolo nem ilustracao,
// porque *"uma ilustracao generica no lugar da foto faz o achador duvidar de
// que e o pet certo"*. Sem este caso, "mostrar a foto" poderia virar "mostrar
// sempre uma moldura", que troca um defeito por outro pior.
//
// ESCRITA E NAO RODADA nesta entrega, por instrucao do cliente.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/escanear/tela_do_pet_da_tag.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  const String codigo = '7K2MQ1D4B8NV3XZ0';
  const String qrDaPlaquinha = 'https://bichu.app/t/$codigo';

  /// O endereco que o servidor manda, montado sobre a base de midia.
  const String enderecoDaFoto =
      'https://midia.exemplo.invalido/p/018f3a2b/card.webp';

  Future<http.Response> Function(http.Request) redeComFoto(String? fotoUrl) {
    return (http.Request req) async {
      if (req.method == 'GET' && req.url.path == '/v1/tags/$codigo') {
        return json200(<String, dynamic>{
          'viewer': 'anonymous',
          'pet': <String, dynamic>{
            'display_name': 'Thor',
            'species': 'dog',
            'size': 'M',
            'breed_label': 'Vira-lata (SRD)',
            'primary_color': 'preto e branco',
            'distinctive_marks': 'Coleira vermelha.',
            'care_notes': null,
            'photo_url': fotoUrl,
          },
          'lost': <String, dynamic>{'is_lost': false, 'since': null},
          'already_notified': false,
        });
      }
      return http.Response('', 404);
    };
  }

  Future<void> escanear(WidgetTester tester, String? fotoUrl) async {
    final leitor = LeitorDeQrDeTeste();
    await abrirOApp(
      tester,
      rede: redeComFoto(fotoUrl),
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: leitor,
    );
    // **A porta de escanear MUDOU DE LUGAR DUAS VEZES, e nenhuma delas e
    // aqui.** Em 18/10/2026 ela virou icone na barra de `Pets` (pedido
    // literal do cliente: "os itens de criacao, como evento e indicacao, ate
    // o escanear poderia ser icones na barra superior ... e nao fique esse
    // botao grande na pagina"), e em 19/10 ele a mandou para a tela da conta
    // (*"leve o icone de qr-code de escanear para a pagina do perfil que tem
    // relacao com as acoes do usuario"*). O botao de largura total com esse
    // texto nao esta em `Pets` em nenhuma das duas.
    //
    // **Por isso a porta mora num ajudante so**: `irAoLeitorDeQr` sabe onde
    // ela esta hoje, e as duas mudancas de lugar custaram zero edicoes neste
    // arquivo.
    await irAoLeitorDeQr(tester);
    leitor.ler(qrDaPlaquinha);
    // `pumpAndSettle` nao serve com `Image.network` na arvore: o carregamento
    // da imagem nunca assenta num teste de widget. O que o caso mede e o que a
    // tela MONTOU, e para isso bastam alguns quadros.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  group('ISCA — a foto do pet aparece quando o servidor a manda', () {
    testWidgets('com `photo_url` preenchido a tela desenha AQUELA imagem', (
      tester,
    ) async {
      await escanear(tester, enderecoDaFoto);

      final imagens = tester.widgetList<Image>(
        find.descendant(
          of: find.byType(TelaDoPetDaTag),
          matching: find.byType(Image),
        ),
      );

      final enderecos = imagens
          .map((i) => i.image)
          .whereType<NetworkImage>()
          .map((p) => p.url)
          .toList(growable: false);

      expect(
        enderecos,
        contains(enderecoDaFoto),
        reason:
            'REPROVA: o servidor mandou `pet.photo_url` e a tela nao desenhou '
            'a foto. Era metade do defeito do cliente ("nao tem foto do pet"): '
            'a tela foi escrita para nunca mostrar foto, afirmando que esta '
            'rota manda `null` sempre. O contrato declara o campo e o exemplo '
            'de 200 de `resolveTagCode` traz um endereco. Quem esta com o '
            'animal no colo confirma pela cara do bicho antes de ler qualquer '
            'linha de sinais. Enderecos encontrados: $enderecos',
      );
    });

    testWidgets('com `photo_url` nulo NAO entra moldura, imagem nem simbolo', (
      tester,
    ) async {
      await escanear(tester, null);

      expect(
        find.descendant(
          of: find.byType(TelaDoPetDaTag),
          matching: find.byType(Moldura),
        ),
        findsNothing,
        reason:
            'REPROVA: a tela montou a moldura da foto para um `photo_url` '
            'nulo. O 5.4 do design system e explicito: sem foto NAO entra '
            'ilustracao e NAO entra simbolo, porque um desenho generico faz o '
            'achador duvidar de que e o pet certo -- e essa duvida derruba o '
            'aviso. Mostrar a foto que chega nao pode virar prometer moldura '
            'para o pet que nao tem nenhuma.',
      );
      expect(
        find.descendant(
          of: find.byType(TelaDoPetDaTag),
          matching: find.byType(Image),
        ),
        findsNothing,
        reason:
            'REPROVA: a tela montou uma imagem sem `photo_url`. Mesma regra do '
            'caso acima.',
      );
    });
  });
}
