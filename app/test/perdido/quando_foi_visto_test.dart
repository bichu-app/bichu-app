// BICHUS-21 — a regra de `last_seen_at`, e a recusa que nao tinha isca.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------------------------------------------------------
//
// A recusa de data no futuro existia nos DOIS lados -- na borda do servidor e
// em `lib/perdido/quando_foi_visto.dart` -- e **nenhum dos dois tinha teste**.
// Uma regra sem isca e uma afirmacao: ela vale no dia em que foi escrita e nao
// acusa nada no dia seguinte.
//
// O que ela impede, quando funciona: "visto pela ultima vez amanha" gravado no
// caso. Gravado assim, ele ordena a lista publica errado e o cartaz sai com uma
// data que nao aconteceu -- e ninguem reporta isso como defeito, porque a tela
// que o produziu ficou calada.
//
// ---------------------------------------------------------------------------
// POR QUE ELE NAO MONTA WIDGET
// ---------------------------------------------------------------------------
//
// A regra mora fora de `telas/` de proposito, e este arquivo e a razao: um
// caso de "amanha nao e aceito" que precisasse do tema, do roteador e do
// escopo em pe custaria caro de escrever e de rodar -- e regra cara de
// exercitar e como uma regra fica sem isca. O relogio entra por parametro, e
// por isso nenhum destes casos espera um dia passar.
//
// A mesma regra medida NA TELA esta em
// `test/telas/marcar_como_perdido_test.dart`: aqui e a aritmetica, la e o
// botao desabilitado com o motivo dito.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/perdido/quando_foi_visto.dart';
import 'package:bichu/perdido/rascunho_do_caso.dart';
import 'package:flutter_test/flutter_test.dart';

/// Um instante fixo, com hora quebrada de proposito.
///
/// `19:47` e nao `00:00`: com meia-noite cravada, `agora` e
/// `inicioDoDiaDe(agora)` seriam o mesmo valor, e o caso de `Hoje mais cedo`
/// passaria sem provar nada.
final DateTime agora = DateTime(2026, 9, 22, 19, 47, 31);

Pet get petQualquer => const Pet(
      id: 'p-1',
      nome: 'Rex',
      especie: Especie.cao,
      redacoesDeCuidados: <RedacaoDeCuidados>[],
    );

void main() {
  group('o instante que cada opcao nomeia', () {
    test('`Agora` e o agora da pessoa', () {
      expect(
        instanteDoAvistamento(QuandoFoiVisto.agora, agora: agora),
        agora,
      );
    });

    test('`Hoje mais cedo` e o INICIO do dia, e nao o fim', () {
      expect(
        instanteDoAvistamento(QuandoFoiVisto.hojeMaisCedo, agora: agora),
        DateTime(2026, 9, 22),
        reason: 'REPROVA: a opcao virou um instante mais recente que o inicio '
            'da janela que ela nomeia. Exagerar o frescor e o erro caro numa '
            'busca: quem sai procurar acredita que o rastro e mais quente do '
            'que e, e fecha o raio em vez de abri-lo.',
      );
    });

    test('`Ontem` e o inicio de ontem', () {
      expect(
        instanteDoAvistamento(QuandoFoiVisto.ontem, agora: agora),
        DateTime(2026, 9, 21),
      );
    });

    test('`Outra data` sem data escolhida e NULO, e nao `agora`', () {
      expect(
        instanteDoAvistamento(QuandoFoiVisto.outraData, agora: agora),
        isNull,
        reason: 'REPROVA: o estado legitimo entre tocar em `Outra data` e '
            'fechar o calendario virou um instante. Inventar `agora` ali '
            'gravaria o caso com uma data que ninguem escolheu.',
      );
    });

    test('so `Outra data` pede calendario (criterio 3)', () {
      for (final q in QuandoFoiVisto.values) {
        expect(
          q.pedeCalendario,
          q == QuandoFoiVisto.outraData,
          reason: 'REPROVA: `${q.rotulo}` abre o seletor de calendario. A '
              'pesquisa de UX e literal em F3.1: "um seletor de data para 96% '
              'dos casos ser \'agora\' e atrito puro".',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // A ISCA
  // -------------------------------------------------------------------------
  group('data no futuro', () {
    test('amanha nao e aceito', () {
      expect(
        estaNoFuturo(agora.add(const Duration(days: 1)), agora: agora),
        isTrue,
        reason: 'REPROVA: "visto pela ultima vez amanha" passou. Gravado '
            'assim, o caso ordena a lista publica errado e o cartaz sai com '
            'uma data que nao aconteceu.',
      );
    });

    test('agora nao esta no futuro', () {
      expect(estaNoFuturo(agora, agora: agora), isFalse);
    });

    test('ontem nao esta no futuro', () {
      expect(
        estaNoFuturo(agora.subtract(const Duration(days: 1)), agora: agora),
        isFalse,
      );
    });

    test('a folga de relogio e de um minuto, e ela existe nos dois sentidos',
        () {
      // **Trinta segundos adiantado passa**: o relogio do aparelho da tutora
      // nao e o do servidor, e recusar por segundos faria a tela acusar um
      // erro que a pessoa nao cometeu.
      expect(
        estaNoFuturo(agora.add(const Duration(seconds: 30)), agora: agora),
        isFalse,
      );
      // **Dois minutos nao passa.** A folga e a MESMA da borda do servidor
      // (`lost-case-routes.ts`, `instanteDeVistoPorUltimo`). Numeros
      // diferentes nos dois lados produziriam a pior variante deste defeito: a
      // tela aceita, a pessoa toca em `Avisar agora`, e o servidor recusa
      // falando de um campo que ela ja tinha preenchido -- depois de ela
      // acreditar que o alerta saiu.
      expect(
        estaNoFuturo(agora.add(const Duration(minutes: 2)), agora: agora),
        isTrue,
      );
      expect(folgaDeRelogio, const Duration(minutes: 1));
    });
  });

  group('o que impede `Continuar`, na ordem em que a tela resolve', () {
    test('sem cidade, o impedimento e o do bairro (criterio 5)', () {
      final r = RascunhoDoCaso(pet: petQualquer)..quando = QuandoFoiVisto.agora;
      expect(r.impedimentoEm(agora), ImpedimentoDeContinuar.semBairro);
      expect(
        r.impedimentoEm(agora)!.texto,
        'Precisamos do bairro para avisar quem está por perto.',
        reason: 'O texto e o do criterio 5, palavra por palavra.',
      );
    });

    test('a area sozinha abre o caso: bairro, cidade e UF bastam', () {
      final r = RascunhoDoCaso(pet: petQualquer)
        ..bairro = 'Vila Madalena'
        ..cidade = 'São Paulo'
        ..uf = 'SP'
        ..quando = QuandoFoiVisto.agora;
      expect(
        r.podeContinuarEm(agora),
        isTrue,
        reason: 'REPROVA: a tela passou a exigir coordenada. `LostCaseInput` '
            'exige `last_seen_at` MAIS `last_seen_location` OU '
            '`last_seen_area`, e a area sozinha abre o caso -- o que muda e o '
            'alcance, nao a existencia do caso.',
      );
    });

    test('sem `Quando?`, o impedimento e o do quando', () {
      final r = RascunhoDoCaso(pet: petQualquer)..cidade = 'São Paulo';
      expect(r.impedimentoEm(agora), ImpedimentoDeContinuar.semQuando);
    });

    test('`Outra data` sem data escolhida nao deixa continuar', () {
      final r = RascunhoDoCaso(pet: petQualquer)
        ..cidade = 'São Paulo'
        ..quando = QuandoFoiVisto.outraData;
      expect(r.impedimentoEm(agora), ImpedimentoDeContinuar.semData);
    });

    test('a data de amanha nao deixa continuar, e diz por que', () {
      final r = RascunhoDoCaso(pet: petQualquer)
        ..cidade = 'São Paulo'
        ..quando = QuandoFoiVisto.outraData
        ..dataEscolhida = agora.add(const Duration(days: 2));
      expect(
        r.impedimentoEm(agora),
        ImpedimentoDeContinuar.dataNoFuturo,
        reason: 'REPROVA: o rascunho aceitou uma data que ainda nao chegou.',
      );
      expect(
        r.impedimentoEm(agora)!.texto,
        dataNoFuturo,
        reason: 'REPROVA: o texto da tela divergiu do da borda do servidor. '
            'Com duas redacoes para a mesma recusa, quem le a tela nao sabe '
            'se foram duas coisas diferentes.',
      );
    });

    test('o padrao da lista publica e VERDADEIRO (criterio 10)', () {
      expect(
        RascunhoDoCaso(pet: petQualquer).compartilharNaListaPublica,
        isTrue,
        reason: 'REPROVA: quem abre um caso esta pedindo alcance, e '
            'perguntar isso a quem esta em panico e uma decisao a mais no '
            'pior momento.',
      );
    });
  });
}
