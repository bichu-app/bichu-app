// F1.5 — Cadastrar pet: sinais.
//
// Duas ISCAS, e as duas guardam mudancas de contrato de 2026-09-17.
//
// 1. **A cor virou lista fechada de duas posicoes, sem texto livre.** O
//    contrato tem `primary_color_code` e `secondary_color_code`, codigos da
//    mesma lista de `reference-data`, e nao tem campo de cor em texto. O
//    paragrafo 11.18 do design system ainda descreve a versao antiga (multipla
//    escolha, ate tres cores), entao a chance de alguem "corrigir" a tela para
//    o documento velho e real. Se isso acontecer, o primeiro grupo reprova.
//
// 2. **`care_notes` e o unico campo do cadastro que vai direto para uma pagina
//    publica sem interruptor de visibilidade.** O aviso precisa ser lido ANTES
//    da digitacao: e a unica protecao que a pessoa tem, e depois de gravado
//    nao ha como marcar o texto como privado. Se o aviso descer para baixo do
//    campo, ou sumir, o segundo grupo reprova.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Future<http.Response> comAsCores(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    // `POST /v1/pets` nao existe no servidor. Onde um caso precisa da
    // resposta, ele manda o `Problem` que o contrato declara.
    return http.Response('', 404);
  }

  RascunhoDePet rascunhoDaNina() {
    return RascunhoDePet()
      ..nome = 'Nina'
      ..especie = Especie.cao
      ..porte = Porte.medio;
  }

  Future<void> abrirF15(
    WidgetTester tester, {
    Future<http.Response> Function(http.Request)? rede,
  }) async {
    await abrirOApp(tester, rede: rede ?? comAsCores);
    await irPara(tester, Rotas.cadastrarPetSinais, extra: rascunhoDaNina());
  }

  testWidgets('a tela abre no passo 3, com o nome do pet e a saida',
      (tester) async {
    await abrirF15(tester);

    expect(find.text('Passo 3 de 3'), findsOne);
    expect(find.text('Como reconhecer Nina'), findsOne);
    expect(find.byTooltip('Voltar'), findsOne);
  });

  group('a cor e lista fechada de duas posicoes', () {
    testWidgets('os dois campos existem, com os rotulos escritos pelo UX',
        (tester) async {
      await abrirF15(tester);

      expect(find.text(TextosDoCadastro.rotuloDaCorPrincipal), findsOne);
      expect(
        find.text(TextosDoCadastro.rotuloDaSegundaCor),
        findsOne,
        reason: 'REPROVA: o segundo campo de cor sumiu, ou virou "Cor '
            'secundária". `Segunda cor` e a palavra que a pessoa usa; "cor '
            'secundária" e vocabulario de banco de dados.',
      );
      expect(
        find.byType(SeletorDeLista),
        findsNWidgets(2),
        reason: 'REPROVA: a cor deixou de ser exatamente duas listas '
            'fechadas. Duas, e nao uma nem tres: o contrato tem '
            '`primary_color_code` e `secondary_color_code`, e o teto e dois.',
      );
    });

    testWidgets('a ajuda aponta para Sinais particulares', (tester) async {
      await abrirF15(tester);

      // **O PARAGRAFO DE APOIO SAIU EM 18/10/2026**, por pedido literal do
      // cliente: *"remova todos esses textos descritivos das paginas, textos
      // de apoio, explicacao, isso esta deixando o app poluido, cheio de
      // informacao e feio em relacao ao designer"*. O commit e o `b6b6f31`, e
      // ele apagou as proprias constantes de `textos_do_cadastro.dart` (41
      // linhas), atualizando os casos da `Rede` e deixando os do cadastro para
      // tras -- e por isso estes ficaram pedindo frases que o produto nao
      // escreve mais.
      //
      // O caso **virou do avesso e nao foi apagado**: a ausencia da frase e
      // afirmada, e junto com ela o que resolve o problema que a frase
      // resolvia. A decisao preservou de proposito erro, validacao, rotulo
      // acessivel e a ultima linha de estado vazio -- e quem cobra isso e
      // `test/telas/limpeza_nao_leva_o_protegido_test.dart`, criado no mesmo
      // commit.
      //
      // O encaminhamento era a frase; o DESTINO dela continua na tela, e e ele
      // que impede o tricolor de ficar sem onde ser descrito. O caso afirma os
      // dois lados: a frase saiu, e `Sinais particulares` esta la.
      expect(
        find.textContaining('Manchas, coleira e detalhes vão em Sinais '
            'particulares'),
        findsNothing,
        reason: 'REPROVA: a ajuda das cores voltou a tela. O cliente pediu a '
            'saida dela em 18/10.',
      );
      await rolarAte(tester, find.text(TextosDoCadastro.rotuloDosSinais));
      expect(
        find.text(TextosDoCadastro.rotuloDosSinais),
        findsOne,
        reason: 'REPROVA: `Sinais particulares` saiu da tela. A ajuda que '
            'apontava para ele podia sair; o campo, nao -- sem ele quem tem um '
            'tricolor nao tem onde descrever o animal.',
      );
    });

    testWidgets('escolher a cor abre uma lista com os nomes escritos',
        (tester) async {
      await abrirF15(tester);

      await tocar(
        tester,
        find.descendant(
          of: find.byType(SeletorDeLista).first,
          matching: find.byType(InkWell),
        ),
      );

      // Cor tem NOME escrito, nunca so amostra (UX 15.2, WCAG 2.1 SC 1.4.1):
      // sob sol, e para daltonico, amostra sem rotulo e adivinhacao.
      expect(find.text('Caramelo'), findsOne);
      expect(find.text('Preto'), findsOne);

      await tocar(tester, find.text('Caramelo'));
      expect(
        find.text('Caramelo'),
        findsOne,
        reason: 'REPROVA: a escolha nao voltou para o campo.',
      );
    });
  });

  group('o aviso de care_notes e lido antes da digitacao', () {
    testWidgets('as tres linhas do aviso estao na tela', (tester) async {
      await abrirF15(tester);
      await rolarAte(tester, find.text('0/280'));

      expect(find.textContaining('Este texto aparece para quem encontrar Nina'),
          findsOne);
      expect(
        find.textContaining('o jeito de não publicar é não escrever'),
        findsOne,
        reason: 'REPROVA: o aviso perdeu a frase que diz que nao existe '
            'interruptor de visibilidade. Nao ha como marcar o texto como '
            'privado depois de gravado.',
      );
      expect(
        find.textContaining('Não precisa colocar seu telefone'),
        findsOne,
        reason: 'REPROVA: sumiu a prevencao de erro que mais trabalha aqui. O '
            'motivo numero um para escrever um telefone e achar que precisa '
            'de um jeito de ser contatada.',
      );
    });

    testWidgets('o aviso fica ACIMA do campo, e nao abaixo', (tester) async {
      await abrirF15(tester);
      await rolarAte(tester, find.text('0/280'));

      final aviso = tester.getTopLeft(
        find.textContaining('Não precisa colocar seu telefone'),
      );
      final campo = tester.getTopLeft(find.text('0/280'));

      expect(
        aviso.dy,
        lessThan(campo.dy),
        reason: 'REPROVA: o aviso de `care_notes` foi parar abaixo do campo. '
            'Ele precisa ser lido ANTES de a pessoa digitar: depois nao ha '
            'como despublicar o que ela escreveu.',
      );
    });

    testWidgets('o contador mostra o teto de 280 do contrato', (tester) async {
      await abrirF15(tester);
      await rolarAte(tester, find.text('0/280'));

      expect(
        find.text('0/280'),
        findsOne,
        reason: 'REPROVA: o contador de `care_notes` sumiu. O limite de 280 e '
            'desenho, e nao economia de banco: quem le esta de pe, com uma '
            'mao, com o animal se mexendo.',
      );
    });
  });

  testWidgets('Cadastrar tem alvo critico de 64 dp e rotulo anunciavel',
      (tester) async {
    await abrirF15(tester);

    final cadastrar =
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar);
    final alvo = tamanhoDoAlvo(tester, cadastrar);
    expect(
      alvo.height,
      greaterThanOrEqualTo(pisoCritico),
      reason: 'REPROVA: alvo de ${alvo.height} dp na acao principal de F1.5.',
    );
    exigirRotuloAnunciavel(tester, TextosDoCadastro.cadastrar, na: 'F1.5');
  });

  group('o erro do cadastro decide por type, e nunca por status', () {
    testWidgets('validation-failed usa a mensagem DO CAMPO que o servidor '
        'nomeou', (tester) async {
      await abrirF15(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/reference-data')) {
            return json200(referenciaDeTeste());
          }
          return problema('validation-failed', 400, extra: <String, dynamic>{
            'errors': <Map<String, dynamic>>[
              <String, dynamic>{
                'field': 'breed_free_text',
                'code': 'conflict',
                'message': 'Você escolheu Shih Tzu na lista.',
              },
            ],
          });
        },
      );

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar),
      );
      await rolarAte(tester, find.textContaining('Você escolheu Shih Tzu'));

      expect(
        find.textContaining('Você escolheu Shih Tzu'),
        findsOne,
        reason: 'REPROVA: `validation-failed` caiu num texto generico. Ele '
            'NUNCA e generico: o erro e do campo que o servidor nomeou, com a '
            'mensagem daquele campo.',
      );
    });

    testWidgets('validation-failed sem campo nomeado nao acusa campo nenhum',
        (tester) async {
      await abrirF15(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/reference-data')) {
            return json200(referenciaDeTeste());
          }
          // Servidor que nao nomeia campo: e defeito nosso, e a tela precisa
          // dizer isso sem inventar de quem e a culpa.
          return problema('validation-failed', 400);
        },
      );

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar),
      );
      await rolarAte(tester, find.textContaining('Não conseguimos salvar'));

      expect(find.textContaining('Não conseguimos salvar'), findsOne);
      expect(
        find.textContaining('Nao foi possivel concluir'),
        findsNothing,
        reason: 'REPROVA: a tela exibiu o `title` do servidor. O texto do '
            'servidor pode ser reescrito a qualquer momento.',
      );
    });

    testWidgets('pet-limit-reached nao escreve o teto no binario',
        (tester) async {
      await abrirF15(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/reference-data')) {
            return json200(referenciaDeTeste());
          }
          // O contrato declara o tipo e NAO declara campo que carregue o
          // limite. Sem ele, a tela diz que o limite foi atingido sem numero.
          return problema('pet-limit-reached', 409);
        },
      );

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar),
      );
      await rolarAte(tester, find.textContaining('limite de pets'));

      expect(find.textContaining('Você chegou ao limite de pets'), findsOne);
      expect(
        find.textContaining('limite de 20 pets'),
        findsNothing,
        reason: 'REPROVA: o teto foi escrito na frase. Uma versao antiga do '
            'app continua instalada por semanas depois de o servidor mudar o '
            'valor, e ela repetiria o numero errado com a mesma confianca.',
      );
    });
  });
}
