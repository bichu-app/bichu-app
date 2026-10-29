// AS ATIVIDADES DA ENTRADA: o contrato manda VARIAS, e o app lia UMA.
//
// Pedido do cliente, 28/10/2026, literal: *"no backoffice voce pode escolher
// varios segmentos, e no aplicativo so esta aparecendo um. Adicione um bloco
// na pagina, trazendo as tags que foram escolhidas."*
//
// ## O DADO JA ERA PLURAL, e o app e que nao lia
//
// `DirectoryEntryDetail` tem `kinds` (`ProfessionalKinds`: lista de 1 a 6,
// `uniqueItems`, OBRIGATORIA) e tambem `kind`, que o contrato descreve como
// *"A PRIMEIRA atividade de `kinds`, e ele existe para compatibilidade"* --
// ele continua `required` porque o APK publicado o le, e trocar o tipo dele
// seria `response-property-type-changed`.
//
// `DetalheDoLocal.doJson` lia SO `json['kind']`. Medido: `kinds` nao aparecia
// em nenhum `.dart` de `app/lib` -- a unica ocorrencia de "kinds" era
// `evidence_kinds`, que e outro campo. Entao o app nao estava escondendo as
// outras atividades por desenho: ele nunca as recebeu.
//
// ## OS ROTULOS SAO CONSUMIDOS, E NUNCA AFIRMADOS AQUI
//
// Outra frente esta trocando tres rotulos de `AtividadeDoDiretorio` nesta
// mesma rodada (`walker`, `clinic`, `sitter`) e acrescentando dois valores.
// Por isso os casos abaixo usam SO `vet`, `groomer` e `clinic` -- cujos
// rotulos aquela frente nao muda -- e o caso do DESCONHECIDO nao depende de
// rotulo nenhum. Um caso que afirmasse `'Dog Walker'` aqui reprovaria pelo
// trabalho de outra pessoa, e nao por um defeito.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter_test/flutter_test.dart';

import 'listagem_e_pagina_do_profissional_test.dart' show fotoDoLugar;
import 'telefone_fora_da_tela_test.dart'
    show abrirOLocal, detalheComTudo, redeDoLocal, semanticaDaTela, textoVisivel;

/// O detalhe do contrato com as atividades que vierem.
Map<String, dynamic> detalheComAtividades(
  List<String> kinds, {
  bool comFoto = false,
}) {
  return <String, dynamic>{
    ...detalheComTudo(),
    // `kind` e a PRIMEIRA de `kinds`, como o contrato promete. Mandar um `kind`
    // que nao fosse o primeiro item seria massa que o servidor nao produz.
    'kind': kinds.first,
    'kinds': kinds,
    if (comFoto) 'photo_url': fotoDoLugar,
  };
}

void main() {
  group('(1) o MODELO le a lista, e nao so o singular', () {
    test('ISCA: `kinds` com tres atividades vira tres', () {
      final detalhe = DetalheDoLocal.doJson(
        detalheComAtividades(<String>['clinic', 'groomer', 'vet']),
      );

      expect(
        detalhe.atividades,
        <AtividadeDoDiretorio>[
          AtividadeDoDiretorio.clinic,
          AtividadeDoDiretorio.groomer,
          AtividadeDoDiretorio.vet,
        ],
        reason: 'REPROVA: o modelo nao leu `kinds`. O contrato manda a lista '
            'desde 21/10/2026 e `kind` existe so por compatibilidade -- ler so '
            'o singular e a causa do que o cliente relatou.',
      );
    });

    test('A ORDEM DO SERVIDOR E PRESERVADA, e nao reordenada', () {
      // O contrato diz que a ordem importa por um motivo so: o primeiro item e
      // o que sai em `kind`. Fora disso a lista nao tem hierarquia -- mas
      // reordenar aqui faria a pagina mostrar as tags numa ordem que ninguem
      // escolheu, e o painel escolhe uma.
      final detalhe = DetalheDoLocal.doJson(
        detalheComAtividades(<String>['vet', 'clinic', 'groomer']),
      );
      expect(
        detalhe.atividades.map((a) => a.codigo).toList(),
        <String>['vet', 'clinic', 'groomer'],
      );
    });

    test('COMPATIBILIDADE: sem `kinds`, o singular ainda vale', () {
      // Nao e caso teorico: a projecao publica de um servidor mais velho que o
      // app, e a massa de teste escrita antes de `kinds` existir. Cair numa
      // lista VAZIA aqui apagaria a atividade que a pagina ja mostrava.
      final detalhe = DetalheDoLocal.doJson(detalheComTudo());
      expect(
        detalhe.atividades,
        <AtividadeDoDiretorio>[AtividadeDoDiretorio.clinic],
        reason: 'REPROVA: resposta sem `kinds` perdeu a atividade. O `kind` e '
            'obrigatorio no contrato e e a primeira da lista: sem `kinds`, ele '
            'E a lista.',
      );
    });

    test('ISCA: codigo DESCONHECIDO e descartado, e nao estoura', () {
      // Outra frente esta acrescentando valores ao `enum` nesta rodada, e o
      // servidor sempre pode ganhar um antes deste build. Um `kinds` com valor
      // novo tem de entregar os conhecidos e seguir -- e nunca derrubar a
      // pagina inteira, que e o que uma `FormatException` faria aqui.
      final detalhe = DetalheDoLocal.doJson(
        detalheComAtividades(<String>['clinic', 'frobnicator', 'vet']),
      );
      expect(
        detalhe.atividades,
        <AtividadeDoDiretorio>[
          AtividadeDoDiretorio.clinic,
          AtividadeDoDiretorio.vet,
        ],
        reason: 'REPROVA: o desconhecido nao foi tratado. Ou ele entrou na '
            'lista, ou derrubou a leitura inteira.',
      );
    });

    test('`kinds` TODO desconhecido da lista vazia, e nao estoura', () {
      final detalhe = DetalheDoLocal.doJson(
        detalheComAtividades(<String>['frobnicator']),
      );
      expect(detalhe.atividades, isEmpty);
    });
  });

  group('(2) a PAGINA mostra um bloco com as tags escolhidas', () {
    testWidgets(
      'ISCA: as tres atividades aparecem como tags, e nao so a primeira',
      (tester) async {
        await abrirOLocal(
          tester,
          alta: true,
          rede: redeDoLocal(
            detalhe: detalheComAtividades(<String>['clinic', 'groomer', 'vet']),
          ),
        );

        final visivel = textoVisivel(tester);
        expect(
          visivel,
          contains(PaginaDoLocal.tituloDasAtividades),
          reason: 'REPROVA: a pagina nao tem o bloco das atividades. O cliente '
              'pediu *"Adicione um bloco na pagina, trazendo as tags que foram '
              'escolhidas"*.',
        );
        // OS TRES ROTULOS, por extenso. Estes tres a outra frente nao muda.
        for (final rotulo in <String>['Clínica', 'Banho e tosa', 'Veterinário']) {
          expect(
            find.text(rotulo),
            findsOneWidget,
            reason: 'REPROVA: a tag `$rotulo` nao esta na pagina. O cliente '
                'relatou exatamente isto: *"no aplicativo so esta aparecendo '
                'um"*.',
          );
        }
      },
    );

    testWidgets(
      'ISCA: e o leitor de tela le as tres, e nao um no colapsado',
      (tester) async {
        await abrirOLocal(
          tester,
          alta: true,
          rede: redeDoLocal(
            detalhe: detalheComAtividades(<String>['clinic', 'groomer', 'vet']),
          ),
        );

        final semantica = semanticaDaTela(tester);
        for (final rotulo in <String>['Clínica', 'Banho e tosa', 'Veterinário']) {
          expect(
            semantica,
            contains(rotulo),
            reason: 'REPROVA: `$rotulo` nao chega ao leitor de tela. Um `Wrap` '
                'de tags dentro de `ExcludeSemantics` desenharia as tres e '
                'anunciaria nenhuma.',
          );
        }
      },
    );

    testWidgets('UMA atividade desenha UMA tag, e o bloco existe',
        (tester) async {
      await abrirOLocal(
        tester,
        alta: true,
        rede: redeDoLocal(detalhe: detalheComAtividades(<String>['vet'])),
      );

      expect(find.text('Veterinário'), findsOneWidget);
      expect(
        textoVisivel(tester),
        contains(PaginaDoLocal.tituloDasAtividades),
      );
    });

    testWidgets(
      'CONTRAPESO: sem atividade conhecida NAO ha bloco vazio',
      (tester) async {
        // O bloco e o conteudo dele: um titulo com `Wrap` vazio embaixo seria
        // uma secao que promete e nao entrega, que e o mesmo defeito que mantem
        // a faixa 16:9 fora da pagina sem foto.
        await abrirOLocal(
          tester,
          alta: true,
          rede: redeDoLocal(
            detalhe: detalheComAtividades(<String>['frobnicator']),
          ),
        );

        expect(
          textoVisivel(tester),
          isNot(contains(PaginaDoLocal.tituloDasAtividades)),
          reason: 'REPROVA: a pagina desenhou o titulo das atividades sem '
              'nenhuma tag embaixo.',
        );
        // ANCORA: a pagina ABRIU. Sem isto o `isNot(contains(...))` acima
        // passaria numa tela que nao desenhou nada.
        expect(find.byType(PaginaDoLocal), findsOneWidget);
        expect(find.text('Clínica Santa Bárbara'), findsWidgets);
      },
    );
  });
}
