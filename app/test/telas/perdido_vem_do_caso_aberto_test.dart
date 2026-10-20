// O estado "este pet esta sendo procurado" sai do CASO ABERTO, e nao de
// `pets.status`.
//
// ===========================================================================
// O DEFEITO QUE ESTE ARQUIVO FECHA, MEDIDO E NAO SUPOSTO
// ===========================================================================
// Medido em 20/10/2026 contra Postgres de verdade, com o mesmo artefato que a
// homologacao roda: **nada em `src/` nem em `migrations/` escreve
// `pets.status = 'lost'`**. Abrir um caso grava em `lost_cases` e nada mais, e o
// cabecalho de `kysely-perfil-publico.ts` diz isso com todas as letras -- *"o
// caso aberto e a fonte da verdade sobre 'perdido'"*.
//
// Entao a ficha de um pet COM caso aberto responde, de verdade:
//
//   GET /v1/pets/{petId}  ->  200  {"status":"active","open_case_id":"<uuid>"}
//
// Tres lugares do aplicativo liam SO `status == perdido` e por isso nunca
// funcionaram:
//
//   1. o selo `Perdido` do cartao (`widgets/cartao_de_pet.dart`);
//   2. a elegibilidade de `Marcar como perdido`
//      (`telas/perdido/tela_de_quem_e_o_caso.dart`), que oferecia um pet ja
//      perdido e levava a pessoa a um `409 pet-already-lost` depois de duas
//      telas -- o que o criterio 13 existe para evitar;
//   3. o ramo `_jaProcurado` da pagina do pet, onde vive `Encontrei meu pet` --
//      o botao de desmarcar que o cliente relatou nao funcionar em 20/10/2026.
//
// ===========================================================================
// POR QUE UM ARQUIVO NOVO, E NAO UM CASO NOS QUE JA EXISTEM
// ===========================================================================
// Porque os que existem montam a ficha com `status: 'lost'` **e**
// `open_case_id` juntos (ver `_idDoCaso` em `marcar_como_perdido_test.dart` e
// `_petPerdido()` em `pet_perdido_pagina_e_estados_test.dart`), e aquela
// combinacao e uma resposta que o servidor nunca emitiu. Eles continuam
// valendo -- `status` E `open_case_id` e o servidor consistente --, mas nenhum
// deles reprova com o leitor lendo so um dos dois.
//
// Todo pet deste arquivo tem `status: 'active'` e `open_case_id` preenchido:
// e a forma REAL da resposta, e e a unica que acusa o defeito.
//
// ===========================================================================
// A ISCA, E COMO ELA FOI PROVADA
// ===========================================================================
// Em 20/10/2026, Flutter test. Base: 4 casos, 4 passaram. Cada desligamento foi
// confirmado por diferenca de conteudo do arquivo ANTES de a suite rodar.
//
// | o que foi desligado | reprovaram, por nome |
// |---|---|
// | `procuradoDe` voltando a `pet.status == StatusDoPet.perdido` em `cartao_de_pet.dart` | `ISCA: o cartao do pet com caso aberto mostra o selo Perdido`, `ISCA: o leitor de tela ouve o selo no cartao do pet` |
// | `jaProcuradoPeloPar` voltando a `p.status != StatusDoPet.perdido` em `tela_de_quem_e_o_caso.dart` | `ISCA: pet com caso aberto NAO e elegivel para um caso novo` |
// | `openCaseId: linha.open_case_id` virando `null` em `kysely-pet-repository.ts` | nenhum caso deste arquivo -- ele mede o APLICATIVO, e o servidor tem isca propria em `tests/integration/caso-aberto-chega-na-ficha-do-pet.test.ts` |

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/telas/perdido/tela_de_quem_e_o_caso.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

/// O `open_case_id` que o servidor devolve de verdade.
const String idDoCaso = '7a2b9c10-0000-7000-8000-0000000000bb';

/// A ficha como o servidor a emite para um pet COM caso aberto: `status`
/// `active`, `open_case_id` preenchido.
Map<String, dynamic> petComCasoAberto({
  String id = '3f1d7a9e-0000-7000-8000-000000000001',
  String nome = 'Nina',
}) {
  return petDoContrato(id: id, nome: nome, casoAberto: idDoCaso);
}

Future<http.Response> Function(http.Request) redeComPets(
  List<Map<String, dynamic>> itens,
) {
  return (req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': itens});
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirMeusPets(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await irParaAConta(tester);
  final porta = find.text('Meus pets');
  await tester.ensureVisible(porta);
  await tester.pumpAndSettle();
  await tester.tap(porta);
  await tester.pumpAndSettle();
}

void main() {
  group('o selo do cartao le o caso aberto, e nao `pets.status`', () {
    testWidgets(
      'ISCA: o cartao do pet com caso aberto mostra o selo Perdido',
      (tester) async {
        await abrirMeusPets(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[petComCasoAberto()]),
        );

        expect(
          find.text('Nina'),
          findsOneWidget,
          reason: 'o pet nao chegou a tela: o caso abaixo mediria tela vazia',
        );
        expect(
          find.descendant(
            of: find.byType(CartaoDePet),
            // `PERDIDO`, em caixa alta: e o texto que `_SeloPerdido` pinta
            // (`cartao_de_pet.dart`). O rotulo do leitor de tela usa `Perdido`,
            // e os dois sao medidos -- o visual aqui, o acessivel no caso
            // seguinte.
            matching: find.text('PERDIDO'),
          ),
          findsOneWidget,
          reason: 'REPROVA: o cartao de um pet COM caso aberto nao mostra o '
              'selo `Perdido`. O servidor responde `status: active` com '
              '`open_case_id` preenchido -- nada escreve `pets.status = lost` '
              '--, entao ler so `status` deixa o selo invisivel para sempre.',
        );
      },
    );

    testWidgets(
      'ISCA: o leitor de tela ouve o selo no cartao do pet',
      (tester) async {
        // O cartao e `excludeSemantics: true` com `label` montado a mao: um selo
        // que mudasse so no visual deixaria quem usa leitor de tela sem o
        // estado, que chegaria so por cor (SC 1.4.1).
        await abrirMeusPets(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[petComCasoAberto()]),
        );

        final rotulo = tester.getSemantics(find.byType(CartaoDePet).first).label;

        expect(
          rotulo,
          contains('Perdido'),
          reason: 'REPROVA: o rotulo acessivel do cartao nao diz `Perdido` para '
              'um pet com caso aberto. `rotuloAcessivelDe` tem de ler '
              '`procuradoDe(pet)`, e nao `pet.status` sozinho.',
        );
        expect(rotulo, contains('Nina'));
      },
    );

    testWidgets(
      'CONTRAPESO: pet SEM caso aberto continua sem selo',
      (tester) async {
        await abrirMeusPets(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[
            petDoContrato(nome: 'Em casa'),
          ]),
        );

        expect(find.text('Em casa'), findsOneWidget);
        expect(
          find.descendant(
            of: find.byType(CartaoDePet),
            matching: find.text('PERDIDO'),
          ),
          findsNothing,
          reason: 'REPROVA: o selo apareceu num pet que nunca foi procurado. Um '
              '`procuradoDe` que devolvesse `true` sempre passaria no caso '
              'acima e seria apanhado aqui.',
        );
      },
    );
  });

  group('a elegibilidade de `Marcar como perdido` le o mesmo par', () {
    test('ISCA: pet com caso aberto NAO e elegivel para um caso novo', () {
      // Unitario sobre os dois ajudantes estaticos, e nao de widget: o que esta
      // sob medicao e o CRITERIO, e ele e uma funcao. Um caso de tela aqui
      // mediria de passagem a navegacao e a rede, e reprovaria por outros
      // motivos quando qualquer uma das duas mudasse.
      final comCaso = Pet.doJson(petComCasoAberto(nome: 'Rex'));
      final emCasa = Pet.doJson(petDoContrato(id: 'p-2', nome: 'Mel'));

      expect(
        TelaDeQuemEOCaso.elegiveis(<Pet>[comCaso, emCasa]).map((p) => p.nome),
        <String>['Mel'],
        reason: 'REPROVA: um pet COM caso aberto apareceu como elegivel. O teto '
            'e de UM caso aberto por pet (criterio 8), e o criterio 13 manda a '
            'tela refletir o teto em vez de deixar a pessoa bater nele -- o '
            'desfecho seria um `409 pet-already-lost` depois de duas telas.',
      );
      expect(
        TelaDeQuemEOCaso.jaPerdidos(<Pet>[comCaso, emCasa]).map((p) => p.nome),
        <String>['Rex'],
        reason: 'REPROVA: o pet com caso aberto nao entrou no grupo dos ja '
            'procurados, e a tela nao tem o que explicar a quem o procura na '
            'lista de opcoes.',
      );
    });

    test('CONTRAPESO: `status: lost` sozinho continua contando', () {
      // O par e um OU, e ele continua lendo os DOIS lados: o dia em que o
      // produto passar a escrever `pets.status = 'lost'` nao pode desligar a
      // outra metade. E os dubles dos arquivos vizinhos mandam os dois juntos.
      final soStatus = Pet.doJson(
        petDoContrato(nome: 'Antigo', status: 'lost'),
      );

      expect(TelaDeQuemEOCaso.elegiveis(<Pet>[soStatus]), isEmpty);
      expect(CartaoDePet.procuradoDe(soStatus), isTrue);
    });
  });
}
