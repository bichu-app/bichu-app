// A F1.2 nao afirma que o e-mail saiu, porque ninguem consegue provar que saiu.
//
// O DEFEITO QUE ESTE ARQUIVO GUARDA. A tela dizia "Enviamos um link para
// <endereco>". O envio acontece no servidor, dentro de
// `enviarVerificacaoDoCadastro` (`identity/application/auth-service.ts`), num
// `try/catch` que registra `email.send_failed` e **deixa a conta de pe** -- por
// decisao documentada (criterio 3 de BICHUS-147): propagar devolveria 500 a
// quem ja tem conta criada e sessao aberta. O 201 que o app recebe prova que a
// conta nasceu, e nada mais.
//
// Ou seja: o app afirmava, em primeira pessoa do plural, um fato que ele nao
// tem. Quem nao recebia nada procurava na caixa de spam de um e-mail que nunca
// foi mandado, e o sintoma ("nao chegou") apontava para o lugar errado.
//
// A ISCA. Repor a palavra reprova o primeiro caso pelo nome. E ela reprova pela
// CLASSE, e nao pela frase: qualquer forma de afirmar envio -- "Enviamos",
// "Mandamos", "e-mail enviado", "link enviado" -- cai na varredura. Um caso
// preso a frase exata ficaria verde no dia em que alguem reescrevesse a linha
// com outras palavras e a mesma promessa, que e a forma mais provavel de o
// defeito voltar.
//
// "Reenviar" NAO cai na varredura, de proposito: ele nomeia uma acao que a
// pessoa pode tomar, e nao um fato que o app inventa. A diferenca entre os dois
// e o assunto inteiro deste arquivo.
//
// O CASO POSITIVO esta junto, e nao e enfeite: portao que reprova tudo some do
// CI tao rapido quanto portao que aprova tudo. Apagar a linha inteira faria a
// varredura passar, e a pessoa ficaria sem saber o que falta. O segundo caso
// exige que o estado (o endereco a confirmar) e o remedio (reenviar) continuem
// na tela.

import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

const String _enderecoDaPessoa = 'marina@exemplo.com.br';

/// Toda forma de AFIRMAR que o envio aconteceu, sem acento e em minuscula.
///
/// `enviad` pega "enviado" e "enviada"; `enviamos` e `mandamos` pegam a primeira
/// pessoa do plural, que e a forma que estava aqui. Nenhuma delas casa
/// "reenviar" nem "reenvie", que e o ponto: a acao pode ser oferecida, o fato
/// nao pode ser afirmado.
final RegExp _afirmacoesDeEnvio = RegExp('enviamos|mandamos|enviad');

String _semAcento(String v) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const para = 'aaaaaeeeeiiiiooooouuuuc';
  final b = StringBuffer();
  for (final c in v.toLowerCase().runes) {
    final i = de.indexOf(String.fromCharCode(c));
    b.write(i < 0 ? String.fromCharCode(c) : para[i]);
  }
  return b.toString();
}

/// Todo texto visivel da arvore montada.
///
/// `Text` e `RichText`: uma varredura que so olhasse `Text` nao enxergaria a
/// linha reposta como `Text.rich`, que e uma forma plausivel de repor.
List<String> _textosDaTela(WidgetTester tester) {
  final achados = <String>[];
  for (final w in tester.widgetList<Text>(find.byType(Text))) {
    final t = w.data ?? w.textSpan?.toPlainText();
    if (t != null) achados.add(t);
  }
  for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
    achados.add(w.text.toPlainText());
  }
  return achados;
}

void main() {
  setUp(AppConfig.limparParaTeste);

  Future<http.Response> Function(http.Request) redeVazia() {
    return (req) async => problema('not-found', 404);
  }

  Future<void> abrirAF12(WidgetTester tester) async {
    await abrirOApp(tester, rede: redeVazia());
    final contexto = tester.element(find.byType(Scaffold).first);
    GoRouter.of(contexto).push(Rotas.verifiqueSeuEmail, extra: _enderecoDaPessoa);
    await tester.pumpAndSettle();
  }

  group('ISCA — a F1.2 nao afirma envio que o app nao consegue provar', () {
    testWidgets('nenhum texto da tela diz que o e-mail saiu', (tester) async {
      await abrirAF12(tester);

      // Ancora: sem isto o caso ficaria verde se a rota deixasse de abrir e a
      // varredura passasse a olhar uma tela vazia.
      expect(
        find.text('Verifique seu e-mail'),
        findsOneWidget,
        reason: 'A F1.2 nao abriu; a varredura abaixo estaria olhando outra '
            'tela e passaria sem ter conferido nada.',
      );

      final afirmacoes = _textosDaTela(tester)
          .where((t) => _afirmacoesDeEnvio.hasMatch(_semAcento(t)))
          .toList();

      expect(
        afirmacoes,
        isEmpty,
        reason: 'REPROVA: a tela voltou a AFIRMAR que o e-mail foi enviado '
            '($afirmacoes). O 201 do cadastro prova que a conta nasceu, e nada '
            'mais: o envio e engolido por um try/catch no servidor, que registra '
            '`email.send_failed` e mantem a conta de pe de proposito. Quem nao '
            'recebeu nada vai procurar na caixa de spam de um e-mail que nunca '
            'foi mandado.',
      );
    });

    testWidgets('mas a tela continua dizendo o que falta e como resolver', (tester) async {
      // O contrapeso. Apagar a linha inteira passaria no caso acima e deixaria
      // a pessoa sem o endereco que ela precisa conferir e sem a saida.
      await abrirAF12(tester);

      final textos = _textosDaTela(tester).join(' | ');

      expect(
        textos.contains(_enderecoDaPessoa),
        isTrue,
        reason: 'REPROVA: o endereco a confirmar desapareceu da tela. Sem ele a '
            'pessoa nao tem como notar que digitou errado, que e justamente o '
            'caso em que nenhum e-mail vai chegar nunca.',
      );

      expect(
        find.textContaining(RegExp('[Rr]eenvi')),
        findsWidgets,
        reason: 'REPROVA: o remedio saiu da tela. A tela deixou de afirmar o '
            'envio, e se ela tambem nao oferecer o reenvio a pessoa fica sem '
            'fato e sem saida.',
      );
    });
  });
}
