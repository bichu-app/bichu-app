// AS PORTAS DE `Adoções` SAIRAM, E ESTA ISCA EXISTE PARA ELAS NAO VOLTAREM.
//
// **Por que sairam (19/10):** nao existe rota de adocao no contrato --
// confirmado por duas leituras independentes. Nao e casca vazia, e
// inexistente. As duas portas prometiam e abriam uma tela que diz estar em
// construcao, e o cliente mandou fechar os defeitos listados, com este na
// lista.
//
// **O que saiu e o que ficou**, e a distincao e o ponto desta isca:
//   - SAIRAM os dois CONTROLES: o item no corpo de `Pets` e o rodape da lista
//     do `Perto` ("Pets de ONGs para adoção");
//   - SAIRAM os dois itens do inventario da gaveta, por `planejada`;
//   - FICARAM a ROTA e a TELA, para link profundo nao quebrar.
//
// Por isso esta isca **nao** assevera que a rota morreu -- asseverar isso
// seria pedir que o link profundo quebrasse. Ela assevera que **nenhum
// controle do app leva a ela**, que e coisa diferente e e o defeito que o
// cliente apontou.
//
// **DESLIGAMENTO:** reponha qualquer uma das duas portas em
// `app/lib/telas/abas.dart`, ou devolva `estado: existe` com `rota` a uma das
// duas linhas de `Adoções` em `app/lib/telas/gaveta_de_secoes.dart`. Cada um
// desses passos reprova um caso daqui.
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

Future<http.Response> _rede(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <dynamic>[],
      'page': 1,
      'page_size': 20,
      'total': 0,
    });
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return http.Response('', 404);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('nenhum controle do app leva a `Adoções`', () {
    testWidgets('a secao `Pets` nao tem porta de adocoes', (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      expect(
        find.text('Adoções'),
        findsNothing,
        reason: 'REPROVA: a porta de `Adoções` voltou ao corpo de `Pets`. Nao '
            'existe rota de adocao no contrato, e a tela do outro lado diz '
            'estar em construcao: a porta promete o que o produto nao tem.',
      );
    });

    testWidgets('a secao `Perto` nao tem o rodape de adocoes', (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
      await tester.pumpAndSettle();

      expect(
        find.text('Pets de ONGs para adoção'),
        findsNothing,
        reason: 'REPROVA: o rodape de `Adoções` voltou a lista do `Perto`. Ele '
            'levava a mesma tela em construcao que a porta de `Pets`.',
      );
    });

    testWidgets('a gaveta de nenhuma secao oferece `Adoções`',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      for (final secao in <String>['Pets', 'Rede', 'Perto', 'Loja']) {
        await tester.tap(find.widgetWithText(NavigationDestination, secao));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip(TextosDaGaveta.abrirAGaveta));
        await tester.pumpAndSettle();

        for (final rotulo in <String>['Adoções', 'Pets de ONGs para adoção']) {
          expect(
            find.descendant(
              of: find.byType(Drawer),
              matching: find.text(rotulo),
            ),
            findsNothing,
            reason: 'REPROVA: a gaveta de "$secao" oferece "$rotulo". O item '
                'voltou para `existe` no inventario, e com ele volta o toque '
                'que abre uma tela em construcao.',
          );
        }

        await tester.tapAt(const Offset(700, 300));
        await tester.pumpAndSettle();
      }
    });
  });

  group('o inventario diz `planejada`, e a rota continua viva', () {
    test('as duas linhas de adocoes sao `planejada` e sem rota', () {
      // Pelos rotulos EXATOS, e nao por `contains('ado')`: aquele recorte
      // pegava `Cadastrar pet` e `Meus dados` tambem, e o caso reprovava
      // contando cinco linhas onde o assunto eram duas.
      const rotulos = <String>['Adoções', 'Pets de ONGs para adoção'];
      final linhas = RegistroDeSubDestinos.todos
          .where((d) => rotulos.contains(d.rotulo))
          .toList();

      // A guarda: sem ela, apagar as linhas do inventario deixaria este caso
      // verde por vazio -- e apagar e justamente o que nao foi feito.
      expect(
        linhas,
        hasLength(2),
        reason: 'REPROVA: o inventario tem ${linhas.length} linha(s) de '
            'adocao, e sao DUAS -- `Adoções` em `Pets` e `Pets de ONGs para '
            'adoção` em `Perto`. Elas nao foram apagadas: elas viraram '
            '`planejada`, que e como o registro nomeia o que ainda nao '
            'existe.',
      );

      for (final linha in linhas) {
        expect(
          linha.estado,
          EstadoDoSubDestino.planejada,
          reason: 'REPROVA: "${linha.rotulo}" voltou a `existe`. Nao existe '
              'rota de adocao no contrato.',
        );
        expect(
          linha.rota,
          isNull,
          reason: 'REPROVA: "${linha.rotulo}" e `planejada` e declara rota. '
              'Rota preenchida num item planejado e como ele reaparece na '
              'gaveta no dia em que alguem mexer na condicao de `viraItem`.',
        );
        expect(
          linha.viraItem,
          isFalse,
          reason: 'REPROVA: "${linha.rotulo}" ainda vira item de gaveta.',
        );
      }
    });

    testWidgets('A ROTA CONTINUA REGISTRADA, para link profundo nao quebrar',
        (tester) async {
      // **Este caso e o contrapeso dos de cima, e ele importa tanto quanto.**
      // Tirar as portas foi o pedido; tirar o ENDERECO nao foi, e quebraria
      // todo link de adocao que ja circule por fora do app.
      await abrirOApp(tester, rede: _rede);

      expect(
        rotasRegistradasDoApp(tester),
        contains(Rotas.adocoes),
        reason: 'REPROVA: a rota de `Adoções` saiu do roteador. O pedido foi '
            'tirar as PORTAS, e nao o endereco: link profundo e endereco e '
            'nao depende de haver controle que leve ate ele.',
      );
    });
  });
}
