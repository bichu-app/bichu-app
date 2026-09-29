// O truncamento silencioso na digitacao do codigo da plaquinha (achado do
// cliente por telefone, 28/09/2026).
//
// O DEFEITO QUE ESTAS ISCAS GUARDAM
// ---------------------------------
// `MascaraDoCodigoDaTag.formatar` tinha duas linhas que **descartavam entrada
// sem dizer nada**:
//
//   if (escritos == simbolos) break;          // do 17o simbolo em diante
//   if (!aceitos.hasMatch(caractere)) continue;  // o `U`, entre outros
//
// E o botao `Continuar` testava `digitado.isEmpty` e mais nada. O resultado,
// na mao do cliente: ele colou um codigo de 26 simbolos, a tela mostrou 16
// como se fossem o codigo dele, o app mandou esse fragmento ao servidor e a
// resposta que ele leu falava de um codigo que ele nunca digitou. Nada na tela
// indicou, em momento nenhum, que dez caracteres tinham sido jogados fora.
//
// O que mudou: a mascara guarda tudo o que o servidor guardaria (alfanumerico),
// formata em grupos de quatro tantos quantos vierem, e a tela confere **forma**
// -- tamanho e alfabeto -- antes de gastar a viagem, dizendo o numero.
//
// POR QUE ESTES CASOS MEDEM O EFEITO, E NAO A CHAMADA
// ---------------------------------------------------
// Um caso que afirmasse "`formatar` nao tem `break`" fica verde no dia em que o
// corte voltar em outra forma (um `substring`, um `limite:` no campo, um
// `maxLength`). Entao os casos daqui olham para tres coisas que a pessoa e o
// servidor de fato veem: quantos simbolos sobram no controlador do campo, o que
// esta escrito na tela, e **quais URLs sairam pela rede**.
//
// A contagem de chamadas e a parte que nao da para falsear: "o app avisou antes
// de chamar" so e verdade se a chamada nao aconteceu.
//
// AS TRES ISCAS, UMA LINHA CADA
// -----------------------------
// 1. Devolver qualquer corte a mascara -- o `break`, um `substring(0, 16)`, um
//    `limite: 19` no `BichuField` -- faz o grupo `nada e descartado em
//    silencio` reprovar: ele conta os simbolos que sobraram no campo depois de
//    colar 26.
// 2. Tirar a conferencia de forma de `_enviarODigitado` faz o grupo `a forma e
//    conferida antes da viagem` reprovar: ele conta as chamadas a `/tags/`.
// 3. Estreitar a tolerancia de colagem (parar de aceitar hifen, espaco,
//    minuscula ou `I`/`L`/`O`) faz o grupo `colar funciona nos quatro
//    formatos` reprovar: ele le a URL que saiu.

import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/telas/escanear/codigo_lido_do_qr.dart';
import 'package:bichu/telas/escanear/mascara_do_codigo_da_tag.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um codigo de 16 simbolos, bem formado para a mascara.
///
/// A validade dele nao importa: nenhum caso daqui espera 200. O que importa e
/// que a **forma** feche, para o app deixar a chamada sair e a isca poder medir
/// que ela saiu.
const String _dezesseis = 'GQSM0XHBT4D9G31S';

/// O codigo do cliente: **26 simbolos**, a forma antiga que ainda existe
/// impressa.
///
/// E o numero que ele disse no telefone, e e o numero que a mensagem da tela
/// tem de dizer de volta.
const String _vinteESeis = 'GQSM0XHBT4D9G31SZPKV7N3QB2';

void main() {
  /// Registra toda URL pedida e devolve 404 para tudo.
  ///
  /// 404 e o que o contrato declara para um codigo que nao existe, e nenhum
  /// caso daqui depende da resposta: o que eles leem e a **lista**.
  (Future<http.Response> Function(http.Request), List<String>) redeQueAnota() {
    final pedidas = <String>[];
    Future<http.Response> rede(http.Request req) async {
      pedidas.add(req.url.toString());
      if (req.url.path.contains('/tags/')) {
        return problema('tag-code-not-found', 404);
      }
      return http.Response('', 404);
    }

    return (rede, pedidas);
  }

  List<String> chamadasDeTag(List<String> pedidas) =>
      pedidas.where((url) => url.contains('/tags/')).toList(growable: false);

  /// Abre o leitor pela porta primaria e entra no campo de digitacao.
  ///
  /// Pela porta, e nao montando a tela solta: o que estas iscas cobram e o que
  /// a pessoa recebe depois de andar o caminho, e uma tela instanciada direto
  /// nao passaria por `ApiClient` nem pela traducao de `Problem` -- que e onde a
  /// mensagem generica do servidor aparecia.
  Future<void> abrirADigitacao(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) rede,
  }) async {
    await abrirOApp(tester, rede: rede);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
    );
    await tester.pumpAndSettle();
  }

  TextField campoDoCodigo(WidgetTester tester) =>
      tester.widget<TextField>(find.byType(TextField).first);

  Future<void> colar(WidgetTester tester, String texto) async {
    await tester.enterText(find.byType(TextField).first, texto);
    await tester.pumpAndSettle();
  }

  Future<void> tocarEmContinuar(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(BotaoPrimario, 'Continuar'));
    await tester.pumpAndSettle();
  }

  group('nada e descartado em silencio', () {
    testWidgets(
      'os 26 caracteres colados continuam no campo, e a tela diz o numero',
      (tester) async {
        final (rede, pedidas) = redeQueAnota();
        await abrirADigitacao(tester, rede: rede);

        // A DEFESA DE VAZIO. Sem ela, um campo que nem aceitasse texto deixaria
        // os `expect` de baixo verdes pelo motivo errado.
        expect(
          campoDoCodigo(tester).controller!.text,
          isEmpty,
          reason: 'REPROVA POR VAZIO: o campo ja tinha texto antes de colar, '
              'entao a contagem abaixo nao mede o que esta colagem deixou.',
        );

        await colar(tester, _vinteESeis);

        final noCampo = campoDoCodigo(tester).controller!.text;
        expect(
          simbolosDoCodigo(noCampo),
          26,
          reason: 'REPROVA: o campo guardou ${simbolosDoCodigo(noCampo)} dos 26 '
              'simbolos colados, e ficou com "$noCampo". Este e o defeito do '
              'cliente: o app descarta o que passa do 16o SEM DIZER NADA, manda '
              'o fragmento ao servidor e devolve uma recusa sobre um codigo que '
              'a pessoa nunca digitou. Cortar aqui so e aceitavel se a tela '
              'disser que cortou, e ela nao tem como dizer -- o campo e o unico '
              'lugar onde a sobra existia.',
        );

        // E o numero, na tela, em vez de silencio. Nao basta guardar os 26: o
        // cliente reclamou de nao ser AVISADO.
        expect(
          find.text(MensagensDeErro.codigoComTamanhoDiferente(26)),
          findsOne,
          reason: 'REPROVA: o campo guardou os 26 simbolos e a tela nao disse '
              'nada sobre isso. Guardar em silencio troca um descarte calado '
              'por um excesso calado, e a pessoa continua sem saber por que o '
              'codigo dela nao serve.',
        );

        // E nada saiu pela rede: o aviso vem ANTES da viagem.
        expect(
          chamadasDeTag(pedidas),
          isEmpty,
          reason: 'REPROVA: o app avisou do tamanho e chamou o servidor de '
              'qualquer forma. A viagem so podia terminar em recusa.',
        );
      },
    );

    testWidgets('o `U` digitado nao desaparece sob o dedo', (tester) async {
      // A segunda linha que descartava em silencio. Um `U` sumindo enquanto a
      // pessoa digita e pior que um `U` recusado: ela ve o caractere aparecer e
      // ir embora, e nao ha nada na tela que explique.
      final (rede, pedidas) = redeQueAnota();
      await abrirADigitacao(tester, rede: rede);

      // 16 simbolos, com um `U` no meio: o tamanho fecha e o alfabeto nao.
      await colar(tester, 'GQSM0XHBT4D9G31U');

      expect(
        campoDoCodigo(tester).controller!.text.contains('U'),
        isTrue,
        reason: 'REPROVA: o `U` foi apagado pela mascara. Enquanto ele '
            'desaparece calado, nenhuma conferencia de alfabeto pode acusa-lo: '
            'o caractere ja nao esta la quando alguem olha.',
      );

      await tocarEmContinuar(tester);

      expect(
        find.text(MensagensDeErro.codigoComCaractereDeFora),
        findsOne,
        reason: 'REPROVA: o `U` ficou no campo e ninguem disse nada sobre ele.',
      );
      expect(
        chamadasDeTag(pedidas),
        isEmpty,
        reason: 'REPROVA: o app chamou o servidor com um caractere que o '
            'codigo nao usa.',
      );
    });

    test('`formatar` nao tem teto: 26 simbolos saem 26', () {
      // O caso de unidade do mesmo invariante. Ele existe porque a mascara e
      // reutilizavel: quem a chamar de outra tela amanha recebe a mesma
      // promessa, e um corte reintroduzido aqui reprova sem montar app.
      final formatado = MascaraDoCodigoDaTag.formatar(_vinteESeis);
      expect(
        formatado.replaceAll('-', ''),
        _vinteESeis,
        reason: 'REPROVA: `formatar` perdeu simbolo pelo caminho. Ela formata; '
            'decidir o que vale e de quem confere a forma.',
      );
      expect(
        formatado,
        'GQSM-0XHB-T4D9-G31S-ZPKV-7N3Q-B2',
        reason: 'REPROVA: os grupos de quatro pararam de continuar depois do '
            '16o simbolo. A sobra precisa ser LEGIVEL para a pessoa poder '
            'conferir contra a plaquinha.',
      );
    });
  });

  group('a forma e conferida antes da viagem', () {
    testWidgets('`Continuar` com forma invalida nao gasta chamada ao servidor',
        (tester) async {
      final (rede, pedidas) = redeQueAnota();
      await abrirADigitacao(tester, rede: rede);

      // Tres formas que nao fecham, e o que a pessoa le em cada uma.
      final casos = <String, String>{
        // Curto: 12 simbolos.
        'GQSM0XHBT4D9': MensagensDeErro.codigoComTamanhoDiferente(12),
        // Longo: o caso do cliente.
        _vinteESeis: MensagensDeErro.codigoComTamanhoDiferente(26),
        // Fora do alfabeto, com o tamanho certo.
        'GQSM0XHBT4D9G31U': MensagensDeErro.codigoComCaractereDeFora,
      };

      for (final entrada in casos.entries) {
        await colar(tester, entrada.key);
        await tocarEmContinuar(tester);

        expect(
          find.text(entrada.value),
          findsOne,
          reason: 'REPROVA: "${entrada.key}" nao produziu a mensagem especifica '
              'da tela. Sem ela a pessoa recebe a recusa generica do servidor, '
              'que nao diz quantos caracteres faltam nem sobram.',
        );
        expect(
          chamadasDeTag(pedidas),
          isEmpty,
          reason: 'REPROVA: o app chamou `GET /v1/tags/{code}` com '
              '"${entrada.key}", cuja forma ele podia ter recusado de graca. '
              'Chamou: ${chamadasDeTag(pedidas)}',
        );
        // A mensagem generica do servidor NAO pode estar na tela: se ela
        // estiver, a chamada saiu por algum outro caminho.
        expect(
          find.text(MensagensDeErro.codigoNaoEncontradoDigitado),
          findsNothing,
          reason: 'REPROVA: a tela mostrou a resposta do servidor para uma '
              'forma que ela devia ter recusado sozinha.',
        );
      }

      // A PROVA POSITIVA, e sem ela este grupo fica verde com o botao
      // `Continuar` quebrado -- um `aoTocar: null` zeraria as chamadas em todos
      // os casos acima e passaria.
      await colar(tester, _dezesseis);
      await tocarEmContinuar(tester);
      expect(
        chamadasDeTag(pedidas),
        hasLength(1),
        reason: 'REPROVA POR VAZIO: uma forma VALIDA tambem nao chegou ao '
            'servidor. Os casos acima nao provaram nada -- o botao esta mudo '
            'para tudo. Chamadas: ${chamadasDeTag(pedidas)}',
      );
    });

    testWidgets('o campo vazio deixa de ser um toque que nao faz nada',
        (tester) async {
      // Ate 28/09 `Continuar` com o campo vazio fazia `return` calado: a pessoa
      // tocava e a tela nao mudava. Um `return` silencioso e da mesma familia
      // do truncamento silencioso.
      final (rede, pedidas) = redeQueAnota();
      await abrirADigitacao(tester, rede: rede);
      await tocarEmContinuar(tester);

      expect(
        find.text(MensagensDeErro.digiteOCodigo),
        findsOne,
        reason: 'REPROVA: tocar em `Continuar` com o campo vazio nao disse '
            'nada. A pessoa fica tocando num botao que parece quebrado.',
      );
      expect(chamadasDeTag(pedidas), isEmpty);
    });

    test('o app confere forma, e NAO o simbolo de verificacao', () {
      // O portao no outro sentido: a decisao de arquitetura e que o simbolo de
      // verificacao e do servidor. Se alguem trouxer a aritmetica dele para o
      // app, um codigo de 16 simbolos do alfabeto certo passaria a ser recusado
      // aqui, e este caso reprova.
      //
      // `_dezesseis` nao tem o simbolo de verificacao certo -- nenhuma constante
      // deste arquivo tem, e e de proposito.
      expect(
        formaDoCodigoDeTag(_dezesseis),
        FormaDoCodigo.valida,
        reason: 'REPROVA: a conferencia local passou a recusar um codigo de 16 '
            'simbolos do alfabeto tolerante. Se o motivo e o simbolo de '
            'verificacao, ele e do servidor (ADR-0004, Emenda 1): uma segunda '
            'fonte da mesma regra envelhece no bolso de quem nao atualiza o '
            'app, e o sintoma e o app recusar uma plaquinha legitima.',
      );
      expect(
        formaDoCodigoDeTag('GQSM-0XHB-T4D9-G31S'),
        FormaDoCodigo.valida,
        reason: 'REPROVA: a forma impressa, com hifen, deixou de ter forma '
            'valida. E o que a mascara produz e o que vai ao servidor.',
      );
    });
  });

  group('colar funciona nos quatro formatos', () {
    /// O que saiu pela rede, na URL de `/tags/{code}`.
    String codigoNaUrl(List<String> pedidas) {
      final url = chamadasDeTag(pedidas).single;
      return Uri.decodeComponent(url.split('/tags/').last);
    }

    /// Os quatro formatos do criterio, e o que cada um exercita.
    ///
    /// Todos sao O MESMO codigo, escrito de quatro jeitos. O quarto usa `I`,
    /// `L` e `O`, que o servidor substitui por `1`, `1` e `0`: o app **nao**
    /// substitui, de proposito -- transformar o caractere sob o dedo e a
    /// correcao automatica que a pesquisa de UX pediu para nao existir aqui --,
    /// entao o que precisa ser verdade e que eles CHEGUEM.
    const formatos = <String, String>{
      'com hifen': 'GQSM-0XHB-T4D9-G31S',
      'com espaco': 'GQSM 0XHB T4D9 G31S',
      'em minuscula': 'gqsm0xhbt4d9g31s',
      'com I, L e O': 'ILOM0XHBT4D9G31S',
    };

    for (final formato in formatos.entries) {
      testWidgets('colar ${formato.key} chega ao servidor', (tester) async {
        final (rede, pedidas) = redeQueAnota();
        await abrirADigitacao(tester, rede: rede);
        await colar(tester, formato.value);

        // O CAMPO FICA NA FORMA IMPRESSA, exatamente. Sem este `expect` a
        // comparacao de simbolos la embaixo perdoa um campo mutilado: com o
        // hifen contando como simbolo o texto fica `GQSM--0XH-B-T4-D9-G-31S`,
        // e "os mesmos simbolos ignorando hifen" continua verdade. O que a
        // pessoa le e a plaquinha que ela tem na mao sao `XXXX-XXXX-XXXX-XXXX`,
        // e e isso que precisa estar no campo.
        expect(
          campoDoCodigo(tester).controller!.text,
          matches(RegExp(r'^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$')),
          reason: 'REPROVA: colar "${formato.value}" (${formato.key}) deixou o '
              'campo em "${campoDoCodigo(tester).controller!.text}", que nao e '
              'a forma impressa `XXXX-XXXX-XXXX-XXXX`. A tolerancia de colagem '
              'existe para o texto que a pessoa cola virar o que a plaquinha '
              'mostra; um campo mutilado passa a exigir que ela conserte a mao '
              'o que a mascara fez.',
        );
        expect(
          campoDoCodigo(tester).controller!.text.length,
          MascaraDoCodigoDaTag.tamanhoImpresso,
          reason: 'REPROVA: o campo tem '
              '${campoDoCodigo(tester).controller!.text.length} caracteres, e a '
              'forma impressa tem ${MascaraDoCodigoDaTag.tamanhoImpresso}.',
        );

        // A forma tem de fechar: se a tolerancia de colagem for estreitada, o
        // app recusa aqui e a chamada nunca sai.
        await tocarEmContinuar(tester);

        expect(
          chamadasDeTag(pedidas),
          hasLength(1),
          reason: 'REPROVA: colar "${formato.value}" (${formato.key}) nao '
              'chegou ao servidor. O campo ficou com '
              '"${campoDoCodigo(tester).controller!.text}", e a tolerancia de '
              'colagem e do contrato (`normalizarCodigoDaTag` tira '
              '`[^0-9A-Za-z]`, maiusculiza e substitui I/L/O): quem tem o '
              'codigo numa mensagem cola, e este e o caminho real.',
        );

        final enviado = codigoNaUrl(pedidas);
        expect(
          simbolosDoCodigo(enviado),
          MascaraDoCodigoDaTag.simbolos,
          reason: 'REPROVA: saiu "$enviado", que tem '
              '${simbolosDoCodigo(enviado)} simbolos e nao 16. Um fragmento '
              'com a forma certa e exatamente o que o cliente recebeu de '
              'volta como recusa.',
        );
        expect(
          enviado.replaceAll('-', '').toUpperCase(),
          formato.value.replaceAll(RegExp('[^0-9A-Za-z]'), '').toUpperCase(),
          reason: 'REPROVA: o que saiu ("$enviado") nao e o que foi colado '
              '("${formato.value}"), simbolo por simbolo. A comparacao usa a '
              'MESMA limpeza do servidor, entao ela nao perdoa troca nenhuma: '
              'nem substituicao de I/L/O feita cedo, nem simbolo perdido.',
        );
      });
    }

    test('I, L e O continuam sem ser substituidos pelo app', () {
      // A prova negativa do quarto formato. Sem ela, um app que substituisse
      // I/L/O na mascara passaria no caso de cima (o codigo chegaria valido) e a
      // decisao de arquitetura teria sido desfeita sem ninguem notar -- junto
      // com o caractere pulando sob o dedo de quem digita.
      expect(
        MascaraDoCodigoDaTag.formatar('ILOM0XHBT4D9G31S'),
        'ILOM-0XHB-T4D9-G31S',
        reason: 'REPROVA: a mascara passou a substituir I/L/O. A substituicao e '
            'do contrato e roda no servidor; feita aqui, ela e a segunda fonte '
            'da mesma regra e troca o caractere sob o dedo da pessoa.',
      );
    });

    test('separador descartado nao e entrada descartada', () {
      // A fronteira da correcao, dita em codigo. A mascara joga fora
      // exatamente o que `normalizarCodigoDaTag` joga fora, e nada mais: o que
      // sobra no campo e o que o servidor vai ver.
      expect(
        MascaraDoCodigoDaTag.formatar(' gqsm 0xhb.t4d9/g31s '),
        'GQSM-0XHB-T4D9-G31S',
        reason: 'REPROVA: a tolerancia de colagem regrediu. Hifen, espaco, '
            'ponto e barra sao a forma impressa e a pontuacao de quem manda o '
            'codigo por mensagem -- nao fazem parte do codigo, e o servidor '
            'tira os mesmos.',
      );
    });
  });
}
