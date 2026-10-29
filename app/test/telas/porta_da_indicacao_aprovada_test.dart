// A PORTA DA INDICACAO APROVADA: do aviso ate a pagina do local, sem preto.
//
// Defeito do cliente, 28/10/2026, literal: *"Ao clicar na notificacao para ir
// ate a pagina do profissional recomendado ficou parado em uma pagina preta"*.
//
// Este arquivo mede o caminho INTEIRO que a pessoa faz, e nao um pedaco dele:
// `Minhas indicacoes` -> `Ver no Perto` -> a pagina do local. O defeito nao
// aparece em nenhuma das duas telas isoladas, porque ele e de ROTEAMENTO: a
// pagina do local mora SOB O RAMO da `Rede`
// (`/rede/locais/:slug`, `StatefulShellBranch`) e `Minhas indicacoes` e irma
// da casca (`/rede/indicacoes`, rota de raiz). Empurrar uma rota de ramo de
// dentro de uma rota de raiz e o que produz a tela preta.
//
// ISCA PROVADA: os dois casos foram vistos REPROVANDO antes de uma linha de
// `lib/` mudar, e o commit da isca e proprio.

import 'dart:convert';

import 'package:bichu/telas/perto/minhas_indicacoes.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'minhas_indicacoes_test.dart'
    show abrirMinhasIndicacoes, indicacaoDoContrato, paginaDoContrato;
import 'telefone_fora_da_tela_test.dart' show detalheComTudo;

/// O `slug` da entrada que a indicacao aprovada aponta.
const String slugDaEntrada = 'clinica-santa-barbara';

/// A rede que atende a LISTA de indicacoes e o DETALHE do local.
///
/// 404 no resto, e nao 200 vazio: chamada nao declarada aqui tem de falhar
/// alto.
Future<http.Response> Function(http.Request) redeDaIndicacaoAprovada() {
  return (req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/directory/suggestions' && req.method == 'GET') {
      return http.Response(
        json.encode(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'approved',
              decidedAt: '2026-10-28T12:00:00.000Z',
              entrySlug: slugDaEntrada,
            ),
          ]),
        ),
        200,
        headers: const <String, String>{
          'content-type': 'application/json; charset=utf-8',
        },
      );
    }
    if (caminho.endsWith('/reviews') && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': const <Map<String, dynamic>>[],
        'page': 1,
        'limit': 10,
        'total': 0,
      });
    }
    if (caminho.startsWith('/v1/directory/entries/') && req.method == 'GET') {
      return json200(detalheComTudo());
    }
    return problema('not-found', 404);
  };
}

/// A mesma rede, mas o DETALHE responde 404.
///
/// O caso real: a indicacao foi aprovada, o servidor mandou `entry_slug`, e
/// entre o aviso e o toque a entrada saiu do ar (despublicada, removida, ou
/// publicada e escondida de novo). A pagina tem de dizer isso com PALAVRAS --
/// `_Fase.naoEncontrado` --, e nunca ficar preta.
Future<http.Response> Function(http.Request) redeComDetalheQueSumiu() {
  return (req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/directory/suggestions' && req.method == 'GET') {
      return http.Response(
        json.encode(
          paginaDoContrato(<Map<String, dynamic>>[
            indicacaoDoContrato(
              reviewStatus: 'approved',
              decidedAt: '2026-10-28T12:00:00.000Z',
              entrySlug: slugDaEntrada,
            ),
          ]),
        ),
        200,
        headers: const <String, String>{
          'content-type': 'application/json; charset=utf-8',
        },
      );
    }
    return problema('not-found', 404);
  };
}

void main() {
  group('do aviso de indicacao aprovada ate a pagina do local', () {
    testWidgets(
      'ISCA: tocar em `Ver no Perto` abre a pagina do local, e nao uma tela '
      'preta',
      (tester) async {
        await abrirMinhasIndicacoes(
          tester,
          rede: redeDaIndicacaoAprovada(),
        );

        final botao = find.text(MinhasIndicacoes.rotuloDeVerNoPerto);
        expect(
          botao,
          findsOneWidget,
          reason: 'REPROVA: a indicacao aprovada com `entry_slug` nao ofereceu '
              'a porta para a pagina do local. Sem ela nao ha o que tocar, e o '
              'caso abaixo passaria por nao ter medido nada.',
        );

        await tester.tap(botao);
        await tester.pumpAndSettle();

        expect(
          find.byType(PaginaDoLocal),
          findsOneWidget,
          reason: 'REPROVA: tocar na porta da indicacao aprovada NAO montou a '
              'pagina do local. E o defeito que o cliente relatou em '
              '28/10/2026: a tela fica preta e parada. A pagina do local mora '
              'sob o ramo da `Rede` e `Minhas indicacoes` e rota de raiz.',
        );
      },
    );

    testWidgets(
      'ISCA: e a pagina aberta mostra o NOME do local, e nao uma casca vazia',
      (tester) async {
        await abrirMinhasIndicacoes(
          tester,
          rede: redeDaIndicacaoAprovada(),
        );
        await tester.tap(find.text(MinhasIndicacoes.rotuloDeVerNoPerto));
        await tester.pumpAndSettle();

        // CONTRAPESO do caso acima: uma `PaginaDoLocal` na arvore que nao
        // carregou nada seria uma tela em branco com o tipo certo.
        expect(
          find.text('Clínica Santa Bárbara'),
          findsWidgets,
          reason: 'REPROVA: a pagina do local abriu sem o nome do local na '
              'arvore. Tela com o widget certo e sem conteudo e a mesma tela '
              'preta por outro caminho.',
        );
      },
    );

    testWidgets(
      'ISCA: a entrada que saiu do ar cai no NAO ENCONTRADO com frase, e nao '
      'em preto',
      (tester) async {
        await abrirMinhasIndicacoes(
          tester,
          rede: redeComDetalheQueSumiu(),
        );
        await tester.tap(find.text(MinhasIndicacoes.rotuloDeVerNoPerto));
        await tester.pumpAndSettle();

        // A PAGINA EXISTE, e e ela que explica. Preto seria a pagina nao
        // montar; 404 nao e preto, e a diferenca e o que este caso guarda.
        expect(
          find.byType(PaginaDoLocal),
          findsOneWidget,
          reason: 'REPROVA: o 404 do detalhe tirou a pagina da arvore. O 404 e '
              'um ESTADO da pagina, nao a ausencia dela.',
        );
        expect(
          find.text(PaginaDoLocal.tituloDoNaoEncontrado),
          findsOneWidget,
          reason: 'REPROVA: a entrada que saiu do ar nao disse nada. Quem veio '
              'do aviso de indicacao aprovada tem de ler o motivo, e nao '
              'encarar uma tela vazia -- que e indistinguivel da tela preta '
              'para quem esta olhando.',
        );
        expect(
          find.text(PaginaDoLocal.explicacaoDoNaoEncontrado),
          findsOneWidget,
          reason: 'REPROVA: o titulo do nao-encontrado apareceu sem a '
              'explicacao. Titulo sozinho nao diz o que fazer agora.',
        );
      },
    );
  });
}
