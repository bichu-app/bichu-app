// ISCA (D): em `Meus dados`, o teclado aberto nao pode cobrir o `Salvar`, e a
// tela nao abre com o teclado na frente.
//
// ## O defeito que ela desliga
//
// O relato do cliente, medido no iPhone dele em 20/10/2026: *"o formulario de
// meus dados, acontece o mesmo problema do campo ja vir preenchido e no ios o
// teclado vem aberto o que impede de clicar no botao de salvar. Em alguns
// outros aplicativos, vem um icone de certo nativo no proprio teclado, que
// permite com que o usuario feche o teclado nativo do celular"*.
//
// E a SEGUNDA ocorrencia do defeito do leitor de QR, relatada no mesmo dia. A
// causa e a mesma e nao e desta tela: `_ScaffoldLayout.performLayout` ancora a
// `bottomNavigationBar` em `size.height` -- a altura inteira da tela -- e so o
// `body` recebe o recuo do teclado. O conserto subiu para
// `widgets/barra_de_acao_fixa.dart` justamente por ser o segundo caso: sao 13
// as telas que trazem aquela barra junto com campo de texto, e um conserto por
// tela deixaria as outras 11 esperando alguem lembrar.
//
// ## O que foi medido, e o que ficou diferente do relato
//
// **O teclado NAO abre sozinho nesta tela, e isso foi medido.** Nenhum campo
// pede foco aqui: `tela_dados_pessoais.dart` nao tem `FocusNode`, nao chama
// `requestFocus()` e `BichuField` nao expoe `autofocus`. O segundo caso daqui
// e o que trava isso -- e um guarda, e nao o conserto de um defeito. O que o
// cliente encontrou e a outra metade da frase dele: ele toca um campo (e e
// natural, a tela existe para editar), o teclado sobe, e o `Salvar` desaparece
// atras dele. "O campo ja vir preenchido" e o comportamento certo: a tela
// carrega os dados da pessoa de `GET /v1/me`.
//
// ## A sugestao dele, implementada
//
// O "icone de certo nativo no proprio teclado" e `TextInputAction`. Os seis
// campos de texto desta tela passaram a declarar o desfecho: `next` nos cinco
// primeiros, que avanca para o proximo campo, e `done` no ultimo (cidade), que
// FECHA o teclado -- sem `onEditingComplete`, o `EditableText` chama
// `focusNode.unfocus()` para `done`, e sem foco o teclado desce. Os dois
// ultimos casos daqui medem os dois desfechos.
//
// **Isso nao substitui o recuo da barra, e os casos sao independentes de
// proposito.** A pessoa pode querer tocar em `Salvar` sem fechar o teclado
// primeiro, e o primeiro caso cobra exatamente isso.

import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// A conta de homologacao, com os campos JA PREENCHIDOS -- que e o estado em
/// que o cliente achou o defeito ("o campo ja vir preenchido").
Map<String, dynamic> _me() {
  return <String, dynamic>{
    'id': 'u-1',
    'email': 'marina@exemplo.com.br',
    'email_verified': true,
    'display_name': 'Marina',
    'phone_verified': false,
    'pending_profile_fields': <String>[],
    'can_open_lost_case': true,
  };
}

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/me' && req.method == 'GET') return json200(_me());
  if (req.url.path == '/v1/me' && req.method == 'PATCH') {
    jsonDecode(req.body);
    return json200(_me());
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  return problema('not-found', 404);
}

void main() {
  Future<void> abrirOsDados(WidgetTester tester) async {
    await abrirOApp(tester, rede: _servidor, deposito: depositoLogado());
    await irPara(tester, Rotas.dadosPessoais);
    expect(
      find.byType(TelaDadosPessoais),
      findsOneWidget,
      reason:
          'REPROVA ANTES DA MEDICAO: `Meus dados` nao abriu, e nenhum dos '
          'casos deste arquivo mede coisa nenhuma sem ela na tela.',
    );
  }

  /// Poe o teclado na tela do jeito que o sistema o anuncia: `viewInsets`.
  Future<void> comTecladoAberto(WidgetTester tester) async {
    tester.view.viewInsets = const FakeViewPadding(bottom: 800);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
  }

  /// Os campos de texto da tela, **em ordem de arvore**, que e a ordem em que
  /// a pessoa os ve.
  Finder campos() => find.byType(EditableText);

  /// O campo de um rotulo, pelo `BichuField` que o embala.
  Finder campoDe(String rotulo) => find.descendant(
    of: find.widgetWithText(BichuField, rotulo),
    matching: find.byType(EditableText),
  );

  bool temFoco(WidgetTester tester, Finder campo) =>
      tester.widget<EditableText>(campo).focusNode.hasFocus;

  group('o teclado aberto nao cobre o `Salvar` de `Meus dados`', () {
    testWidgets('`Salvar` continua ALCANCAVEL com o teclado aberto', (
      tester,
    ) async {
      await abrirOsDados(tester);
      await comTecladoAberto(tester);

      final alturaDaTela =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;
      final teclado =
          tester.view.viewInsets.bottom / tester.view.devicePixelRatio;
      final chaoVisivel = alturaDaTela - teclado;

      expect(
        teclado,
        greaterThan(0),
        reason:
            'REPROVA POR VAZIO: o teclado nao entrou na medicao, entao "nao '
            'cobre" nao prova nada -- o caso ficaria verde com a barra '
            'ancorada no chao da tela.',
      );

      final salvar = find.descendant(
        of: find.byType(BarraDeAcaoFixa),
        matching: find.byType(BotaoPrimario),
      );
      expect(
        salvar,
        findsOneWidget,
        reason:
            'REPROVA ANTES DA MEDICAO: nao achei o botao primario na barra de '
            'acao de `Meus dados`. Sem botao nao ha alcance a medir.',
      );

      final caixa = tester.getRect(salvar);
      expect(
        caixa.bottom,
        lessThanOrEqualTo(chaoVisivel + 0.5),
        reason:
            'REPROVA: `Salvar` ($caixa) termina abaixo do chao visivel '
            '($chaoVisivel dp) com o teclado aberto -- ele esta ATRAS do '
            'teclado e nao da para tocar. E o defeito que o cliente mediu no '
            'iPhone dele: "o teclado vem aberto o que impede de clicar no '
            'botao de salvar". O `Scaffold` NAO levanta a '
            '`bottomNavigationBar`: ele a ancora em `size.height` e recua so o '
            '`body`. Quem pede o recuo e `BarraDeAcaoFixa`, com '
            '`MediaQuery.viewInsetsOf` -- e o recuo tem de ficar LA, e nao '
            'aqui: esta foi a segunda tela com este defeito e sao 13 as que '
            'usam aquela barra com campo de texto.',
      );
    });

    testWidgets('a tela MONTA SEM FOCO em nenhum dos seis campos', (
      tester,
    ) async {
      await abrirOsDados(tester);

      expect(
        campos(),
        findsNWidgets(6),
        reason:
            'REPROVA ANTES DA MEDICAO: `Meus dados` nao tem seis campos de '
            'texto. Sao nome, apelido, telefone, CEP, bairro e cidade -- o '
            'e-mail e texto de leitura e o estado e uma lista. Se a conta '
            'mudou, o veredito de qual campo recebe `done` mudou com ela.',
      );

      for (final Element campo in campos().evaluate()) {
        final EditableText w = campo.widget as EditableText;
        expect(
          w.focusNode.hasFocus,
          isFalse,
          reason:
              'REPROVA: um campo de `Meus dados` abriu JA COM FOCO. Com foco o '
              'teclado sobe sozinho, e o cliente relatou o teclado automatico '
              'como PROBLEMA em duas telas no mesmo dia. Esta tela nunca pediu '
              'foco; este caso existe para que ninguem o acrescente achando '
              'que ajuda quem vai editar.',
        );
      }

      expect(
        tester.testTextInput.isVisible,
        isFalse,
        reason:
            'REPROVA: a tela pediu o teclado a plataforma sem ninguem ter '
            'tocado em campo nenhum. Foco e pedido de teclado sao duas coisas, '
            'e este caso mede a segunda.',
      );
    });
  });

  group('o teclado tem desfecho declarado nos seis campos', () {
    // POR QUE ESTES DOIS CASOS LEEM A DECLARACAO, E NAO SO O EFEITO.
    //
    // `tester.testTextInput.receiveAction(acao)` IMPOE a acao ao campo
    // conectado: ela nao pergunta o que o campo declarou. Um caso que
    // mandasse `done` e medisse "o foco saiu" fica verde com o campo
    // declarando `next` -- MEDIDO, os dois casos deste grupo passavam com a
    // declaracao trocada antes desta reescrita. O que chega ao teclado do
    // sistema, e desenha a tecla que a pessoa ve, e
    // `EditableText.textInputAction`; e ele que estes casos leem.
    //
    // O efeito continua medido, e com a acao que o campo DECLAROU, por um
    // motivo proprio: `done` so fecha o teclado porque `EditableText` chama
    // `focusNode.unfocus()` quando nao ha `onEditingComplete`. Um
    // `onEditingComplete` acrescentado a `BichuField` amanha deixaria a
    // declaracao intacta e o teclado aberto, e e a segunda metade que pega
    // isso.
    TextInputAction? declarada(WidgetTester tester, Finder campo) =>
        tester.widget<EditableText>(campo).textInputAction;

    testWidgets('o ULTIMO campo (cidade) FECHA o teclado ao concluir', (
      tester,
    ) async {
      await abrirOsDados(tester);

      final cidade = campoDe('Cidade');
      expect(
        declarada(tester, cidade),
        TextInputAction.done,
        reason:
            'REPROVA: o ultimo campo de texto de `Meus dados` nao declara '
            '`TextInputAction.done`. E o pedido literal do cliente de '
            '20/10/2026: "vem um icone de certo nativo no proprio teclado, que '
            'permite com que o usuario feche o teclado nativo do celular". '
            'Cidade e o ultimo dos seis campos -- depois dela vem o seletor de '
            'estado, que abre lista e nao teclado --, e e esta declaracao que '
            'desenha a tecla de certo no teclado do sistema. Com `next` aqui, '
            'a tecla vira uma flecha que leva o foco para fora dos campos e o '
            'teclado fica; com `null`, o desfecho passa a depender do padrao '
            'do framework em vez de uma decisao escrita.',
      );

      await tester.ensureVisible(cidade);
      await tester.pumpAndSettle();
      await tester.tap(cidade);
      await tester.pumpAndSettle();
      expect(
        temFoco(tester, cidade),
        isTrue,
        reason:
            'REPROVA ANTES DA MEDICAO: o toque no campo de cidade nao deu foco '
            'a ele, entao "o foco saiu" nao mediria o efeito da tecla.',
      );

      // A ACAO QUE O CAMPO DECLAROU, e nao uma escolhida pelo caso.
      await tester.testTextInput.receiveAction(declarada(tester, cidade)!);
      await tester.pumpAndSettle();

      for (final Element campo in campos().evaluate()) {
        expect(
          (campo.widget as EditableText).focusNode.hasFocus,
          isFalse,
          reason:
              'REPROVA: concluir no ultimo campo deixou algum campo de texto '
              'com foco, e com foco o teclado nao desce. `done` fecha o '
              'teclado porque `EditableText` chama `focusNode.unfocus()` na '
              'ausencia de `onEditingComplete`; se alguem acrescentou um '
              '`onEditingComplete` a `BichuField`, a declaracao continua '
              'certa e o teclado para de fechar -- e e este `expect` que '
              'pega isso.',
        );
      }
      expect(
        tester.testTextInput.isVisible,
        isFalse,
        reason:
            'REPROVA: o teclado continuou pedido a plataforma depois de '
            'concluir no ultimo campo. Nenhum campo tem foco e a conexao de '
            'entrada de texto devia ter fechado junto.',
      );
    });

    testWidgets('o campo de nome abre o teclado de NOME na plataforma', (
      tester,
    ) async {
      await abrirOsDados(tester);

      final nome = campoDe('Nome');
      await tester.ensureVisible(nome);
      await tester.pumpAndSettle();
      await tester.tap(nome);
      await tester.pumpAndSettle();

      final args = tester.testTextInput.setClientArgs;
      expect(
        args,
        isNotNull,
        reason:
            'REPROVA ANTES DA MEDICAO: o campo de nome nao abriu conexao de '
            'entrada de texto, entao nao ha tipo de teclado a medir.',
      );
      expect(
        (args!['inputType'] as Map<String, dynamic>)['name'],
        'TextInputType.name',
        reason:
            'REPROVA: o campo de nome desta tela nao pede o teclado de NOME a '
            'plataforma. E o tipo que o conteudo pede, e e ele -- junto com '
            '`autofillHints`, que esta tela ainda nao declara -- que faz o iOS '
            'oferecer a sugestao de nome do sistema. Medido no canal '
            '(`TextInput.setClient`), e nao na declaracao do widget: um caso '
            'que lesse `BichuField.tipoDeTeclado` mediria a nossa propria '
            'afirmacao.',
      );
    });

    // ISCA (D) — as DICAS DE PREENCHIMENTO chegam a plataforma, e o GRUPO
    // tambem.
    //
    // **O que esta isca corrige de entendimento.** `tipoDeTeclado:
    // TextInputType.name` NAO liga a sugestao do sistema: ele escolhe qual
    // teclado abre. Quem liga a sugestao e `autofillHints`, e foi medido no
    // canal -- `TextInput.setClient` leva `autofill.hints`.
    //
    // **E o grupo nao e decoracao**, tambem medido: sem `AutofillGroup`, o
    // argumento sai com as dicas do campo focado e `fields: null` -- o sistema
    // sabe o que aquele campo e e nao sabe que os outros existem. E `fields`
    // que deixa UMA sugestao preencher nome, bairro e cidade de uma vez.
    //
    // **O QUE ESTA ISCA NAO PROVA, e esta dito de proposito:** que o iPhone
    // mostre a sugestao. Isso depende de haver endereco salvo nos Ajustes do
    // aparelho da pessoa, e teste de widget nao tem sistema operacional. O que
    // se mede aqui e que o app DECLAROU -- a metade que e nossa.
    testWidgets('o campo de nome declara a DICA de preenchimento no canal', (
      tester,
    ) async {
      await abrirOsDados(tester);

      final nome = campoDe('Nome');
      await tester.ensureVisible(nome);
      await tester.pumpAndSettle();
      await tester.tap(nome);
      await tester.pumpAndSettle();

      final args = tester.testTextInput.setClientArgs;
      expect(
        args,
        isNotNull,
        reason:
            'REPROVA ANTES DA MEDICAO: o campo nao abriu conexao de entrada de '
            'texto, entao nao ha o que medir no canal.',
      );

      final autofill = args!['autofill'] as Map<String, dynamic>?;
      expect(
        autofill?['hints'],
        contains(AutofillHints.name),
        reason:
            'REPROVA: o campo de nome nao declarou `AutofillHints.name` para a '
            'plataforma. Sem a dica o iOS nao tem como oferecer o nome salvo, '
            'e o tipo de teclado NAO substitui isso -- ele so escolhe qual '
            'teclado abre.',
      );

      expect(
        args['fields'],
        isNotNull,
        reason:
            'REPROVA: o campo foi declarado SOZINHO, sem o grupo. `fields` sai '
            'nulo quando nao ha `AutofillGroup` em volta do formulario, e sem '
            'ele o sistema nao sabe que os outros campos existem: a sugestao '
            'preenche um campo por toque em vez de nome, CEP, bairro e cidade '
            'de uma vez. Medido no canal.',
      );
    });

    testWidgets('os CINCO primeiros AVANCAM, e de nome o foco vai ao apelido', (
      tester,
    ) async {
      await abrirOsDados(tester);

      // Os cinco que NAO terminam o formulario, na ordem da tela.
      for (final String rotulo in <String>[
        'Nome',
        'Apelido',
        'Telefone',
        'CEP',
        'Bairro',
      ]) {
        expect(
          declarada(tester, campoDe(rotulo)),
          TextInputAction.next,
          reason:
              'REPROVA: o campo `$rotulo` nao declara '
              '`TextInputAction.next`. Formulario de seis campos com uma mao '
              'so depende disto: sem `next` a pessoa fecha o teclado, rola, '
              'toca o proximo campo e abre o teclado de novo, campo a campo. '
              'Com `done` no meio do formulario, a tecla de certo fecha o '
              'teclado antes do fim e a pessoa volta a rolar.',
        );
      }

      final nome = campoDe('Nome');
      final apelido = campoDe('Apelido');
      await tester.ensureVisible(nome);
      await tester.pumpAndSettle();
      await tester.tap(nome);
      await tester.pumpAndSettle();
      expect(
        temFoco(tester, nome),
        isTrue,
        reason:
            'REPROVA ANTES DA MEDICAO: o toque no campo de nome nao deu foco a '
            'ele, e sem foco de partida nao ha travessia a medir.',
      );

      await tester.testTextInput.receiveAction(declarada(tester, nome)!);
      await tester.pumpAndSettle();

      expect(
        temFoco(tester, apelido),
        isTrue,
        reason:
            'REPROVA: avancar no campo de nome nao levou o foco ao campo '
            'seguinte. A declaracao esta certa e a travessia nao chegou ao '
            'apelido: ou entrou um widget focavel entre os dois, ou algo '
            'quebrou a ordem de travessia do formulario.',
      );
      expect(
        temFoco(tester, nome),
        isFalse,
        reason:
            'REPROVA: o foco ficou no campo de nome depois de avancar. Dois '
            'campos focados nao existe; se este `expect` reprova, o de cima '
            'ficou verde medindo outra coisa.',
      );
    });
  });
}
