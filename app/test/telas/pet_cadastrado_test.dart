// F1.6 — Pet cadastrado / QR gerado.
//
// A ISCA central: **esta e a unica tela do produto em que o codigo da tag
// aparece por extenso.** `POST /v1/pets/{petId}/tags` devolve `code` uma vez,
// na emissao; `GET /v1/pets/{petId}/tags` nunca mais devolve o codigo em
// claro, nem para o dono, so os quatro ultimos caracteres. A tela e obrigada a
// dizer isso **enquanto o codigo ainda esta nela**, com `Copiar o código` ao
// lado.
//
// Se alguem remover essa linha achando que e ruido, ou empurra-la para depois
// dos botoes, os casos abaixo reprovam. O estrago que eles guardam nao aparece
// em teste manual: aparece semanas depois, quando o tutor volta a esta tela
// para reler o codigo e descobre que ele nao existe mais em lugar nenhum
// alcancavel pelo app.
//
// A segunda isca e o QR de enfeite. Quando a emissao falha, a tela **nao
// mostra QR nenhum**: um QR falso aqui vira uma plaquinha impressa que nao
// resolve, e quem a imprimiu so descobre no dia em que precisar dela.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  const String codigo = 'BCH-7K2M-91QD';

  Pet nina({List<RedacaoDeCuidados> redacoes = const <RedacaoDeCuidados>[]}) {
    return Pet(
      id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
      nome: 'Nina',
      especie: Especie.cao,
      redacoesDeCuidados: redacoes,
    );
  }

  /// A resposta de `POST /v1/pets/{petId}/tags` **como o contrato a declara**.
  ///
  /// A rota nao existe no servidor ainda; o que o teste manda e o esquema
  /// `PetTagIssued`, campo a campo, e nao um corpo inventado que caiba no que
  /// a tela quer.
  http.Response tagEmitida() {
    return json200(
      <String, dynamic>{
        'id': '11111111-2222-3333-4444-555555555555',
        'status': 'active',
        'code_suffix': '1QD',
        'created_at': '2026-09-17T18:20:00Z',
        'code': codigo,
        'url': 'https://bichu.app/t/$codigo',
      },
      status: 201,
    );
  }

  Future<void> abrirF16(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) rede,
    Pet? pet,
  }) async {
    await abrirOApp(tester, rede: rede);
    await irPara(
      tester,
      Rotas.petCadastrado,
      extra: ResultadoDoCadastro(pet: pet ?? nina()),
    );
  }

  group('a emissao deu certo', () {
    Future<void> abrir(WidgetTester tester, {Pet? pet}) {
      return abrirF16(tester, rede: (_) async => tagEmitida(), pet: pet);
    }

    testWidgets('o titulo e o do UX, e nao o do rascunho do Figma',
        (tester) async {
      await abrir(tester);

      expect(
        find.text('Nina está no Bichu.'),
        findsOne,
        reason: 'REPROVA: o titulo voltou para o do desenho. O proprio Figma '
            'marca que o texto de F1.6 e da designer e nao passou por revisao '
            'de UX; o inventario reescreveu a tela inteira depois.',
      );
    });

    testWidgets('o codigo aparece POR EXTENSO', (tester) async {
      await abrir(tester);

      expect(
        find.text(codigo),
        findsOne,
        reason: 'REPROVA: o codigo nao esta inteiro na tela. Esta e a UNICA '
            'tela do produto em que ele existe por extenso; depois dela, nem '
            'o dono consegue le-lo de novo.',
      );
    });

    testWidgets('a linha do "unico lugar" esta na tela, junto do codigo',
        (tester) async {
      await abrir(tester);

      expect(
        find.textContaining('único lugar onde o código aparece inteiro'),
        findsOne,
        reason: 'REPROVA: a linha que so esta tela diz sumiu. Sem ela a '
            'pessoa sai achando que pode voltar aqui depois, e o codigo nao '
            'esta em lugar nenhum alcancavel pelo app.',
      );
      // A linha fica ABAIXO do codigo, na mesma regiao, e nao depois dos
      // botoes: quem usa leitor de tela e exatamente quem mais perde com o
      // codigo sumindo.
      final linhaDoCodigo = tester.getTopLeft(find.text(codigo));
      final linhaDoAviso = tester.getTopLeft(
        find.textContaining('único lugar onde o código aparece inteiro'),
      );
      expect(
        linhaDoAviso.dy,
        greaterThan(linhaDoCodigo.dy),
        reason: 'REPROVA: o aviso ficou acima do codigo. Ele e informativo e '
            'vem depois do que explica.',
      );
    });

    testWidgets('a linha menciona os quatro ultimos, que e o que sobra',
        (tester) async {
      await abrir(tester);
      expect(find.textContaining('quatro últimos'), findsOne);
    });

    testWidgets('Copiar o codigo tem 48 dp e rotulo acessivel com o nome da '
        'tag', (tester) async {
      await abrir(tester);

      final copiar = find.widgetWithText(
        TextButton,
        TextosDoCadastro.copiarOCodigo,
      );
      expect(copiar, findsOne);
      expect(
        tamanhoDoAlvo(tester, copiar).height,
        greaterThanOrEqualTo(pisoMinimo),
        reason: 'REPROVA: `Copiar o código` abaixo de $pisoMinimo dp.',
      );

      exigirRotuloAnunciavel(
        tester,
        '${TextosDoCadastro.copiarOCodigo} da tag de Nina',
        na: 'F1.6',
      );
    });

    testWidgets('copiar devolve confirmacao, e nao silencio', (tester) async {
      await abrir(tester);
      final copiado = atenderAAreaDeTransferencia(tester);

      await tocar(
        tester,
        find.widgetWithText(TextButton, TextosDoCadastro.copiarOCodigo),
      );

      expect(
        copiado,
        <String>[codigo],
        reason: 'REPROVA: o que foi para a area de transferencia nao e o '
            'codigo por extenso. Copiar o sufixo, ou a URL, nao serve: o que '
            'vai impresso na plaquinha e o codigo.',
      );
      expect(
        find.text(TextosDoCadastro.codigoCopiado),
        findsOne,
        reason: 'REPROVA: copiar sem retorno e copiar sem saber se copiou.',
      );
    });

    testWidgets('a acao principal e `Fazer a tag da coleira`, e a secundaria e '
        'texto', (tester) async {
      await abrir(tester);

      expect(
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.fazerATag),
        findsOne,
        reason: 'REPROVA: a acao principal mudou de rotulo. O desenho dizia '
            '"Imprimir a tag"; o inventario do UX diz `Fazer a tag da '
            'coleira`, e a tag pode ser gravada, e nao so impressa.',
      );
      expect(
        find.widgetWithText(TextButton, TextosDoCadastro.depois),
        findsOne,
        reason: 'REPROVA: `Depois` sumiu, ou virou botao. A especificacao pede '
            'secundaria EM TEXTO.',
      );
    });

    testWidgets('a saida e FECHAR, porque a tela e destino', (tester) async {
      await abrir(tester);

      expect(
        find.byTooltip('Fechar'),
        findsOne,
        reason: 'REPROVA: a saida virou `Voltar`. Os tres passos do '
            'assistente foram substituidos de proposito e nao existem mais: '
            'nao ha para onde voltar, ha de onde sair.',
      );
    });
  });

  group('a emissao falhou', () {
    testWidgets('o texto diz na PRIMEIRA frase que o cadastro ficou de pe',
        (tester) async {
      await abrirF16(tester, rede: (_) async => http.Response('', 500));

      expect(
        find.textContaining('Nina está cadastrado'),
        findsOne,
        reason: 'REPROVA: a tela nao disse que o cadastro sobreviveu. O medo '
            'imediato de quem ve a falha e ter perdido o cadastro, e a frase '
            'precisa responder isso antes de qualquer outra coisa.',
      );
      expect(find.textContaining('ainda não ficou pronto'), findsOne);
    });

    testWidgets('NAO ha QR nem codigo de enfeite', (tester) async {
      await abrirF16(tester, rede: (_) async => http.Response('', 500));

      expect(
        find.text(codigo),
        findsNothing,
        reason: 'REPROVA: apareceu um codigo sem emissao. Um QR de enfeite '
            'aqui vira uma plaquinha impressa que nao resolve.',
      );
      expect(find.byType(Image), findsNothing);
      expect(
        find.textContaining('único lugar onde o código aparece inteiro'),
        findsNothing,
        reason: 'REPROVA: a tela prometeu um codigo que nao existe.',
      );
    });

    testWidgets('`Tentar de novo` esta la', (tester) async {
      await abrirF16(tester, rede: (_) async => http.Response('', 500));
      expect(find.text('Tentar de novo'), findsOne);
    });
  });

  testWidgets('o aviso da redacao de care_notes aparece aqui, sem acusar '
      'ninguem', (tester) async {
    await abrirF16(
      tester,
      rede: (_) async => tagEmitida(),
      pet: nina(redacoes: <RedacaoDeCuidados>[RedacaoDeCuidados.telefone]),
    );
    await rolarAte(tester, find.textContaining('Tiramos o telefone'));

    expect(
      find.textContaining('Tiramos o telefone'),
      findsOne,
      reason: 'REPROVA: o aviso da redacao nao chegou a confirmacao do '
          'cadastro. A pessoa vai ver um texto sumir e nao vai saber por que.',
    );
    expect(
      find.textContaining('O resto do que você escreveu foi salvo'),
      findsOne,
      reason: 'REPROVA: sumiu a frase que mata o medo de ter perdido tudo, '
          'que e a reacao real de quem ve texto sumir.',
    );
  });
}
