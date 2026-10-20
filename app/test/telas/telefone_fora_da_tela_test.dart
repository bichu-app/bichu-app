// O TELEFONE NAO APARECE, E A PAGINA DO LOCAL CONTINUA INTEIRA.
//
// Pedido do cliente de 19/10/2026, palavra por palavra: *"... e sem aparecer o
// telefone quando for profissionais/clinicas"*.
//
// ## O que foi MEDIDO antes de mexer em qualquer linha
//
// O numero era pintado em **um** lugar do app: a secao `Informações` da
// pagina do local escrevia `Telefone comercial: +5511987654321`, com o
// `phone_e164` do contrato por extenso. Nem o cartao da lista do `Perto` nem
// o cabecalho da pagina escreviam o numero -- o botao `Ligar` mostra a palavra
// `Ligar` e nada mais.
//
// Essa linha saiu. **O botao `Ligar` ficou**, porque ele nao mostra numero:
// o rotulo visivel e `Ligar` e o nome acessivel e `Ligar para <nome>`. O
// numero aparece depois, no DISCADOR do sistema, que e tela do aparelho e nao
// nossa -- e e ele que mostra o numero e espera a pessoa confirmar.
//
// ## E A PAGINA DO LOCAL NAO SAIU
//
// O pedido de 19/10 tirou a pagina do **EVENTO**. A pagina do LOCAL e de
// 18/10 e e pedido dele tambem: *"os locais indicados devem ser clicados,
// para visualizar mais informações e para que os usuários possam dar pontuação
// e fazer recomendações em texto ... como acontece na playstore"*. O segundo
// grupo deste arquivo existe para que uma leitura apressada do pedido de hoje
// nao leve as duas juntas.

import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show SemanticsNode;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perto_com_dados_test.dart'
    show abrirPerto, entradaDoContrato, paginaDoContrato;

/// O telefone de teste, **escrito aqui por extenso**: nenhuma assercao
/// abaixo compara a tela com a constante que a produz.
const String telefoneDeTeste = '+5511987654321';

/// `DirectoryEntryDetail` com telefone, nota e permissao de avaliar.
Map<String, dynamic> detalheComTudo({
  String? telefone = telefoneDeTeste,
  int contagem = 2,
  double? media = 4.5,
}) {
  return <String, dynamic>{
    'slug': 'clinica-santa-barbara',
    'kind': 'clinic',
    'display_name': 'Clínica Santa Bárbara',
    'city': 'São Paulo',
    'state': 'SP',
    'neighborhood': 'Pinheiros',
    'about': 'Atende cão e gato.',
    'phone_e164': telefone,
    'verification': <String, dynamic>{
      'level': 'document_verified',
      'evidence_kinds': <String>['cnpj'],
    },
    'rating': <String, dynamic>{
      'count': contagem,
      'average': media,
      'histogram': <String, int>{'1': 0, '2': 0, '3': 0, '4': 1, '5': 1},
    },
    'can_review': true,
    'review_blocked_reason': null,
    'my_review_ref': null,
    'distance_m': 1200,
    'photo_url': null,
  };
}

/// `DirectoryReview`, com os campos obrigatorios do contrato.
Map<String, dynamic> avaliacaoDoContrato({
  String ref = 'aval-0000000000000001',
  int nota = 5,
  String? corpo = 'Atendimento rápido e cuidadoso com a minha gata.',
  String? autor = 'Marina',
}) {
  return <String, dynamic>{
    'ref': ref,
    'rating': nota,
    'body': corpo,
    'author_display_name': autor,
    'created_at': '2026-10-01T12:00:00Z',
    'edited_at': null,
    'mine': false,
  };
}

/// Listagem, detalhe e avaliacoes. **404 em qualquer outra rota.**
Future<http.Response> Function(http.Request) redeDoLocal({
  required Map<String, dynamic> detalhe,
  List<Map<String, dynamic>> avaliacoes = const <Map<String, dynamic>>[],
}) {
  return (req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(
        paginaDoContrato(
          <Map<String, dynamic>>[
            <String, dynamic>{
              ...entradaDoContrato(
                slug: detalhe['slug'] as String,
                displayName: detalhe['display_name'] as String,
              ),
              'phone_e164': ?detalhe['phone_e164'],
            },
          ],
          distanciaDisponivel: true,
        ),
      );
    }
    if (caminho.endsWith('/reviews') && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': avaliacoes,
        'page': 1,
        'limit': 10,
        'total': avaliacoes.length,
      });
    }
    if (caminho.startsWith('/v1/directory/entries/') && req.method == 'GET') {
      return json200(detalhe);
    }
    return problema('not-found', 404);
  };
}

/// Abre o `Perto` e entra na pagina do local tocando no cartao.
///
/// [alta] poe a tela de teste em 400 x 4000 dp: a pagina do local inteira fica
/// montada e os casos leem as secoes de baixo sem depender de rolagem. O
/// padrao e a tela normal, porque a secao `Informações` -- onde o telefone
/// morava -- abre acima da dobra, e medir a ausencia dele com a pagina inteira
/// montada e mais forte do que medir com metade dela fora da arvore.
Future<void> abrirOLocal(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool alta = false,
}) async {
  if (alta) {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(400, 4000);
    addTearDown(tester.view.reset);
  }
  await abrirPerto(tester, rede: rede);
  await tester.tap(
    find
        .descendant(
          of: find.byType(CartaoDoDiretorio),
          matching: find.byType(InkWell),
        )
        .first,
  );
  await tester.pumpAndSettle();
  expect(
    find.byType(PaginaDoLocal),
    findsOneWidget,
    reason: 'REPROVA: a pagina do local nao abriu. Sem ela na arvore, todo '
        '`findsNothing` deste arquivo passaria por nao ter o que medir.',
  );
}

/// Todo o texto VISIVEL da tela, numa string so.
String textoVisivel(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Text).evaluate()) {
    final t = e.widget as Text;
    partes.add(t.data ?? t.textSpan?.toPlainText() ?? '');
  }
  for (final e in find.byType(RichText).evaluate()) {
    partes.add((e.widget as RichText).text.toPlainText());
  }
  return partes.join('\n');
}

/// Todo rotulo, dica e valor da arvore SEMANTICA da tela da frente.
///
/// Reprova se a arvore vier vazia: uma assercao que le arvore desligada
/// aprovaria qualquer coisa -- e `excludeSemantics` neste app ja apagou acao
/// de botao em silencio uma vez.
String semanticaDaTela(WidgetTester tester) {
  final partes = <String>[];
  void visitar(SemanticsNode n) {
    partes
      ..add(n.label)
      ..add(n.hint)
      ..add(n.value);
    n.visitChildren((f) {
      visitar(f);
      return true;
    });
  }

  visitar(tester.getSemantics(find.byType(Scaffold).last));
  final texto = partes.where((p) => p.isNotEmpty).join('\n');
  expect(texto, isNotEmpty, reason: 'a arvore semantica veio vazia');
  return texto;
}

void main() {
  group('ISCA — o número de telefone não é pintado em tela nenhuma', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/pagina_do_local.dart`, devolva ao `_Informacoes` a
    // linha que saiu --
    //     if (telefone != null) ...<Widget>[
    //       const SizedBox(height: BichuEspaco.e2),
    //       _LinhaComIcone(
    //         icone: Icons.call_outlined,
    //         texto: 'Telefone comercial: $telefone',
    //       ),
    //     ],
    // -- e volte a ler `final telefone = detalhe.telefoneE164;` no `build`.
    // O primeiro caso reprova nos digitos e no prefixo.

    testWidgets(
        'a página do local com `phone_e164` não escreve o número, nem no '
        'texto nem no leitor de tela', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: detalheComTudo(),
          avaliacoes: <Map<String, dynamic>>[avaliacaoDoContrato()],
        ),
      );

      // (1) A PAGINA ESTA CHEIA, e o telefone CHEGOU na resposta. Sem estas
      // duas ancoras, tudo abaixo seria `findsNothing` sobre o vazio.
      expect(find.text('Clínica Santa Bárbara'), findsWidgets);
      expect(find.text('Atende cão e gato.'), findsWidgets);
      final detalhe = tester.widget<PaginaDoLocal>(find.byType(PaginaDoLocal));
      expect(detalhe.slug, 'clinica-santa-barbara');

      final visivel = textoVisivel(tester);
      final falado = semanticaDaTela(tester);

      // (2) NENHUMA FORMA DO NUMERO ESTA ESCRITA. As quatro formas que o app
      // conhece: E.164 cru, sem o `+`, sem o codigo do pais, e com mascara
      // (`formato/telefone.dart` produz a ultima).
      for (final forma in <String>[
        '+5511987654321',
        '5511987654321',
        '11987654321',
        '(11) 98765-4321',
      ]) {
        expect(
          visivel,
          isNot(contains(forma)),
          reason: 'REPROVA: o numero de telefone esta escrito na tela, como '
              '"$forma". O cliente pediu que ele nao aparecesse.',
        );
        expect(
          falado,
          isNot(contains(forma)),
          reason: 'REPROVA: o numero de telefone esta no rotulo que o leitor '
              'de tela diz, como "$forma". Nao aparecer vale para quem le e '
              'para quem ouve.',
        );
      }

      // (3) E O ROTULO QUE O CARREGAVA SAIU INTEIRO. Separado de (2) de
      // proposito: trocar o numero por `***` deixaria a linha na tela, e
      // uma tela que diz `Telefone comercial: ***` continua falando de um
      // telefone que o cliente nao quer ali.
      expect(
        visivel,
        isNot(contains('Telefone comercial')),
        reason: 'REPROVA: a linha `Telefone comercial:` ainda esta na secao '
            '`Informações`.',
      );
      // Nenhum digito do numero sobrou solto: oito digitos seguidos nao
      // existem em nada mais que esta pagina escreve.
      expect(visivel, isNot(matches(RegExp(r'\d{8}'))));
    });

    testWidgets(
        'o botão `Ligar` FICA, e continua nomeando para quem — sem o número',
        (tester) async {
      // **ESTA E A METADE AMBIGUA DO PEDIDO, e ela esta medida e nao
      // adivinhada.** O botao nao mostra numero nenhum: o rotulo visivel e
      // `Ligar`. Se o cliente quiser que a ACAO de ligar tambem saia, e esta
      // assercao que vai reprovar, e e aqui que a decisao dele fica escrita.
      //
      // DESLIGAR PARA VER REPROVAR: em `pagina_do_local.dart`, apague o
      // `nomeAcessivel: PaginaDoLocal.ligarPara(detalhe.nome)` do
      // `BotaoPrimario`. A assercao (3) reprova -- e ela NAO passa com
      // rotulo vazio, porque mede `contains` sobre a frase inteira.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
      );
      final semantica = tester.ensureSemantics();
      await tester.pumpAndSettle();

      // (1) O botao existe, com o glifo de telefone.
      expect(find.byIcon(Icons.call_outlined), findsOneWidget);
      // (2) E o rotulo VISIVEL e so a palavra.
      expect(find.text('Ligar'), findsOneWidget);
      // (3) E quem ouve sabe PARA QUEM.
      expect(
        semanticaDaTela(tester),
        contains('Ligar para Clínica Santa Bárbara'),
        reason: 'REPROVA: o botao de ligar deixou de dizer para quem a '
            'ligacao vai. Numa pagina a frase e obvia aos olhos; para quem '
            'chega no controle por leitor de tela, nao.',
      );
      semantica.dispose();
    });

    testWidgets('local SEM `phone_e164`: nenhum botão, e nenhuma linha vazia',
        (tester) async {
      // Sem telefone nao ha botao DESABILITADO: nao ha botao (criterio 2 da
      // BICHUS-62). E a secao `Informações` nao ganha linha em branco onde o
      // numero estava.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo(telefone: null)),
      );

      expect(find.text('Clínica Santa Bárbara'), findsWidgets);
      expect(find.byIcon(Icons.call_outlined), findsNothing);
      expect(find.text('Ligar'), findsNothing);
      expect(textoVisivel(tester), isNot(contains('Telefone')));
    });
  });

  group('ISCA — a página do LOCAL continua inteira, com avaliação', () {
    // **O PEDIDO DE 19/10 REMOVEU A PAGINA DO EVENTO, E NAO ESTA.** As duas
    // sao "pagina de detalhe" e as duas abrem de um cartao; confundi-las
    // desfaria o pedido de 18/10, em que ele pediu nota de 1 a 5 e
    // recomendacao em texto visivel aos outros usuarios.
    //
    // DESLIGAR PARA VER REPROVAR: em `rotas.dart`, apague a rota
    // `Rotas.localDoPerto` -- que e o que apagar "a pagina de detalhe" por
    // engano faria. `abrirOLocal` reprova no `find.byType(PaginaDoLocal)`,
    // com a razao escrita, e os dois casos deste grupo caem com ela.

    testWidgets(
        'o cartão do Perto abre a página, e ela traz nota, histograma e o '
        'texto de outra pessoa', (tester) async {
      await abrirOLocal(
        tester,
        alta: true,
        rede: redeDoLocal(
          detalhe: detalheComTudo(),
          avaliacoes: <Map<String, dynamic>>[
            avaliacaoDoContrato(
              corpo: 'Atendimento rápido e cuidadoso com a minha gata.',
              autor: 'Marina',
            ),
          ],
        ),
      );

      // (1) A SECAO DE INFORMACOES, que e o "visualizar mais informações".
      expect(find.text('Informações'), findsOneWidget);
      expect(find.text('Atende cão e gato.'), findsWidgets);

      // (2) A PONTUACAO, que e o "dar pontuação". A media por extenso, na
      // virgula decimal do portugues.
      expect(find.text('Avaliações'), findsWidgets);
      expect(find.textContaining('4,5'), findsWidgets);

      // (3) A RECOMENDACAO EM TEXTO DE OUTRA PESSOA, que e o "disponivel para
      // outros usuários". O corpo E o nome: a frase sem autor seria uma nota
      // solta.
      expect(
        find.text('Atendimento rápido e cuidadoso com a minha gata.'),
        findsOneWidget,
        reason: 'REPROVA: a recomendacao em texto de outra pessoa saiu da '
            'pagina do local. O cliente pediu isso em 18/10/2026, e o pedido '
            'de 19/10 removeu a pagina do EVENTO, nao esta.',
      );
      expect(find.text('Marina'), findsWidgets);
    });

    testWidgets('e quem pode avaliar continua com o campo para escrever',
        (tester) async {
      await abrirOLocal(
        tester,
        alta: true,
        rede: redeDoLocal(
          detalhe: detalheComTudo(),
          avaliacoes: <Map<String, dynamic>>[avaliacaoDoContrato()],
        ),
      );

      // `can_review: true` na resposta: o formulario tem de estar la, com a
      // nota e o texto. Sem o campo, "fazer recomendações em texto" nao
      // existe para quem abre a pagina.
      expect(find.text('Sua nota'), findsOneWidget);
      expect(
        find.text('Seu comentário (opcional)'),
        findsOneWidget,
        reason: 'REPROVA: o campo de escrever a recomendacao saiu.',
      );
      expect(find.text('Enviar avaliação'), findsOneWidget);
    });
  });
}
