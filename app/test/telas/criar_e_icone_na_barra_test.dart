// AS PORTAS DE CRIAR VIRARAM ICONE NA BARRA DE TOPO (pedido do cliente,
// 18/10/2026), e este arquivo e o que impede que a troca de forma vire perda
// de funcao.
//
// Pedido literal: *"os itens de criacao, como evento e indicacao, ate o
// escanear poderia ser icones na barra superior ou um simbolo apenas de + para
// que o designer fique mais bonito e nao fique esse botao grande na pagina
// ocupando muito espaco"*. Ele ofereceu duas saidas; a construida e a
// PRIMEIRA, um icone por acao. A segunda -- um `+` unico -- esta so no
// protipo HTML de `workspace/artefatos-site/app-criar-na-barra/`.
//
// Mais duas decisoes dele do mesmo dia, que este arquivo tambem cobra:
// *"o botao escanear uma tag, pode ser um icone de qr-code igual do
// whatsapp"*, *"o icone de recomendar um profissional, pode ser igual do
// instagram, as 3 pessoas juntos"*, e a regra de visibilidade: *"essas acoes
// so devem ser realizadas por usuarios cadastrados e validados, caso ao
// contrario o botao nem aparece"*.
//
// ## As DUAS classes de defeito que esta mudanca abre, e que e o que esta
// escrito aqui
//
//   1. **ALCANCABILIDADE.** Trocar um botao com texto por um glifo e a forma
//      mais facil que existe de apagar uma acao sem perceber: a tela continua
//      montando, a suite continua verde e a porta simplesmente nao esta mais
//      la. A isca 1 toca o icone e exige chegar na tela de destino -- nao
//      basta o glifo existir.
//   2. **ROTULO ACESSIVEL.** Icone sem rotulo e mudo para quem usa TalkBack
//      ou VoiceOver, e aqui o glifo e o UNICO indicio do que a acao faz: o
//      texto que o botao grande carregava SAIU DA TELA. A isca 2 le a arvore
//      de semantica e exige o nome por extenso, em portugues. Ela reprova no
//      dia em que alguem tirar o `tooltip` de `AcaoDeCriarNaBarra` -- e e
//      exatamente desse `tooltip` que o nome acessivel sai.
//
// ## ESTES CASOS NAO FORAM EXECUTADOS
//
// Regra do cliente nesta rodada: nada de suite unitaria nem de integracao. O
// que rodou foi `flutter analyze` e os portoes offline. As iscas estao
// escritas e NAO rodadas, e a prova de cada uma e por DESLIGAMENTO: cada
// grupo abaixo diz, por extenso, o que apagar no codigo para ver o caso
// reprovar. Nenhuma delas vale como recibo de que o app funciona.
//
// **NENHUM `expect` aqui compara texto renderizado com a constante que o
// produz**, com uma excecao declarada: `ListaDoDiretorio.rotuloDeIndicar`, que
// e lido de proposito -- ele e o rotulo acessivel do icone E o rotulo da tela,
// e o que este arquivo cobra e que os dois sejam A MESMA coisa. Os outros
// esperados estao por extenso, com acento.

import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// A rede das tres secoes envolvidas. **404 em tudo o que nao esta aqui**, e
/// nao 200 vazio: uma chamada nao prevista precisa falhar alto em vez de
/// passar por acidente e deixar a tela num estado que ninguem pediu.
Future<http.Response> _rede(http.Request req) async {
  final caminho = req.url.path;
  if (caminho == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  if (caminho == '/v1/network/events' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'page': 1,
      'page_size': 20,
      'total': 0,
    });
  }
  if (caminho == '/v1/directory/entries' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'page': 1,
      'page_size': 20,
      'total': 0,
    });
  }
  return problema('not-found', 404);
}

/// Todos os nos da arvore de semantica, do `MaterialApp` para baixo.
List<SemanticsNode> _todosOsNos(WidgetTester tester) {
  final raiz = tester.getSemantics(find.byType(MaterialApp));
  final todos = <SemanticsNode>[];
  void andar(SemanticsNode no) {
    todos.add(no);
    no.visitChildren((filho) {
      andar(filho);
      return true;
    });
  }

  andar(raiz);
  return todos;
}

/// Vai para a aba [rotuloDaAba] com o app ja aberto.
Future<void> _irPara(WidgetTester tester, String rotuloDaAba) async {
  await tester.tap(find.widgetWithText(NavigationDestination, rotuloDaAba));
  await tester.pumpAndSettle();
}

/// O icone de criar DA BARRA, achado pelo glifo, e so dentro da `AppBar`.
///
/// **O recorte na `AppBar` nao e zelo.** `Icons.qr_code_2` tambem aparece
/// dentro da pagina do pet, e um `find.byIcon` solto acharia aquele e ficaria
/// verde com a barra vazia -- que e precisamente o defeito que a isca 1
/// existe para pegar.
Finder _naBarra(IconData glifo) => find.descendant(
  of: find.byType(AppBar),
  matching: find.byIcon(glifo),
);

/// Exige que o glifo [glifo] carregue o nome acessivel [rotulo], como BOTAO e
/// com acao de toque.
///
/// Os tres juntos, e nao um deles: a noite de 21/09 achou quatro widgets que
/// se anunciavam como botao sem carregar `onTap`, e um deles era a acao
/// primaria de quase toda tela. Um caso que conferisse so o nome passaria com
/// o controle morto.
void _exigirRotuloEAcao(
  WidgetTester tester, {
  required String rotulo,
  required String onde,
}) {
  final nos = _todosOsNos(tester);
  final candidatos = nos.where((n) => n.label == rotulo).toList();

  expect(
    candidatos,
    isNotEmpty,
    reason: 'REPROVA: em `$onde` nao ha no de semantica chamado exatamente '
        '"$rotulo". O botao grande com esse texto SAIU da tela, e o icone que '
        'ficou no lugar dele e a unica pista do que a acao faz: sem este '
        'rotulo, quem usa TalkBack ou VoiceOver ouve so "botao" (SC 4.1.2). '
        'Para ver este caso reprovar, apague o `tooltip:` de '
        '`AcaoDeCriarNaBarra` -- e dele que o nome sai.',
  );

  for (final no in candidatos) {
    final dados = no.getSemanticsData();
    expect(
      dados.flagsCollection.isButton,
      isTrue,
      reason: 'REPROVA: "$rotulo" em `$onde` nao se anuncia como botao.',
    );
    expect(
      dados.hasAction(SemanticsAction.tap),
      isTrue,
      reason: 'REPROVA: "$rotulo" em `$onde` anuncia-se como botao e NAO '
          'carrega a acao de toque (btn=true tap=false). O leitor de tela '
          'oferece um controle que nao ativa.',
    );
  }
}

void main() {
  // ---------------------------------------------------------------------
  // ISCA 1 — a acao de criar continua ALCANCAVEL em cada tela que mudou
  //
  // DESLIGAMENTO: apague o `acaoDeCriar:` da aba correspondente em
  // `app/lib/telas/abas.dart`. A tela continua montando, o corpo continua
  // igual, e este grupo reprova.
  // ---------------------------------------------------------------------
  group('ISCA 1 — a porta de criar continua alcançável', () {
    testWidgets('Pets → escanear: o ícone de QR abre o leitor',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      final icone = _naBarra(Icons.qr_code_2);
      expect(
        icone,
        findsOneWidget,
        reason: 'REPROVA: a barra de `Pets` não tem o ícone de QR code. Ele é '
            'a porta PRIMÁRIA do leitor (UX 27.5.6), e o botão de contorno '
            'que estava no corpo saiu: sem este ícone, quem acha um cachorro '
            'na rua só chega ao leitor pelo menu do `Perfil` — uma porta onde '
            'havia duas.',
      );

      await tocar(tester, icone);
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: o ícone de QR não levou ao leitor. Glifo que não '
            'abre nada é pior que botão nenhum: ele promete.',
      );
    });

    testWidgets('Rede → o ícone de criar abre o formulário de evento',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Rede');

      final icone = _naBarra(Icons.more_time);
      expect(
        icone,
        findsOneWidget,
        reason: 'REPROVA: a barra da `Rede` não tem o ícone de criar evento. '
            'O botão `Criar evento` saiu do corpo da agenda, então este ícone '
            'é o ÚNICO caminho do app para criar um evento: sem ele a rota '
            'existe sem ninguém poder alcançá-la.',
      );

      await tocar(tester, icone);
      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: o ícone não levou ao formulário de criar evento.',
      );
    });

    testWidgets('Perto → o ícone de pessoas abre o formulário de indicação',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Perto');

      final icone = _naBarra(Icons.group_add);
      expect(
        icone,
        findsOneWidget,
        reason: 'REPROVA: a barra do `Perto` não tem o ícone de indicar. O '
            'botão `Indicar quem atende bem` saiu do corpo, então este ícone '
            'é o único caminho do app para a comunidade alimentar o '
            'diretório.',
      );

      await tocar(tester, icone);
      expect(
        find.byType(TelaSugerirProfissional),
        findsOneWidget,
        reason: 'REPROVA: o ícone não levou ao formulário de indicação.',
      );
    });

    testWidgets(
      'CONTRAPROVA — o botão grande não ficou NAS DUAS formas',
      (tester) async {
        // Sem este caso, a entrega poderia ter acrescentado o ícone sem tirar
        // o botão: a isca 1 ficaria verde e o cliente continuaria olhando o
        // botão grande que ele pediu para sair. O pedido dele é que o espaço
        // VOLTE, e isso só é verificável afirmando a ausência.
        await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

        expect(
          find.widgetWithText(OutlinedButton, 'Escanear uma tag'),
          findsNothing,
          reason: 'REPROVA: `Pets` ainda desenha o botão grande de escanear no '
              'corpo. Com o ícone na barra ele é a segunda cópia da mesma '
              'porta, e os 72 dp que o cliente pediu de volta não voltaram.',
        );

        await _irPara(tester, 'Rede');
        expect(
          find.widgetWithText(OutlinedButton, 'Criar evento'),
          findsNothing,
          reason: 'REPROVA: a agenda ainda desenha o botão grande de criar '
              'evento no corpo: os 64 dp não voltaram.',
        );

        await _irPara(tester, 'Perto');
        expect(
          find.widgetWithText(
            OutlinedButton,
            ListaDoDiretorio.rotuloDeIndicar,
          ),
          findsNothing,
          reason: 'REPROVA: a lista do diretório ainda desenha o botão grande '
              'de indicar no corpo: os 64 dp não voltaram.',
        );
      },
    );
  });

  // ---------------------------------------------------------------------
  // ISCA 2 — cada ícone novo tem RÓTULO ACESSÍVEL em português
  //
  // DESLIGAMENTO: apague `tooltip: rotulo,` de
  // `app/lib/widgets/acao_de_criar_na_barra.dart`. Os três casos reprovam de
  // uma vez, e o `assert` do construtor não pega isso: ele só vê rótulo
  // vazio, não rótulo que não chega à árvore.
  // ---------------------------------------------------------------------
  group('ISCA 2 — o ícone não é mudo', () {
    testWidgets('Pets: o ícone de QR se anuncia "Escanear uma tag"',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      _exigirRotuloEAcao(
        tester,
        rotulo: 'Escanear uma tag',
        onde: 'a barra de Pets',
      );
      handle.dispose();
    });

    testWidgets('Rede: o ícone se anuncia "Criar evento"', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Rede');
      // "Criar evento", e NÃO "Marcar um encontro": o vocabulário do app
      // trocou encontro por evento em 18/10. Um rótulo acessível com a palavra
      // antiga diria uma coisa para quem vê e outra para quem ouve.
      _exigirRotuloEAcao(
        tester,
        rotulo: 'Criar evento',
        onde: 'a barra da Rede',
      );
      handle.dispose();
    });

    testWidgets('Perto: o ícone se anuncia com o rótulo DA TELA',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Perto');
      // A única comparação com constante neste arquivo, e ela é o objeto do
      // caso: o rótulo do ícone tem de ser O MESMO que a tela usa para a ação,
      // de uma fonte só. Duas cópias divergem, e no dia em que divergirem
      // ninguém sabe qual das duas está certa.
      _exigirRotuloEAcao(
        tester,
        rotulo: ListaDoDiretorio.rotuloDeIndicar,
        onde: 'a barra do Perto',
      );
      handle.dispose();
    });

    testWidgets('o rótulo do Perto diz INDICAR, e não cadastrar',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Perto');
      expect(
        ListaDoDiretorio.rotuloDeIndicar.toLowerCase().contains('cadastr'),
        isFalse,
        reason: 'REPROVA: o rótulo acessível promete cadastro. A emenda 1 do '
            'ADR-0011 diz que a comunidade convida e avalia, nunca cria: '
            '"cadastrar" prometeria publicação, e nada é publicado aqui.',
      );
    });

    testWidgets('ÁREA DE TOQUE — os três ícones têm pelo menos 48 dp',
        (tester) async {
      // O piso é `BichuAlvoDeToque.min`; o desenho usa `critico` (64 dp), que
      // é a altura da própria barra. Este caso afirma o PISO, porque é ele
      // que é contrato de acessibilidade, e não a escolha de 64.
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      void exigirAlvo(IconData glifo, String onde) {
        final caixa = tester.getSize(
          find.ancestor(
            of: _naBarra(glifo),
            matching: find.byType(IconButton),
          ).first,
        );
        expect(
          caixa.width,
          greaterThanOrEqualTo(48.0),
          reason: 'REPROVA: o ícone de $onde tem ${caixa.width} dp de largura, '
              'abaixo do piso de 48 dp (SC 2.5.8).',
        );
        expect(
          caixa.height,
          greaterThanOrEqualTo(48.0),
          reason: 'REPROVA: o ícone de $onde tem ${caixa.height} dp de '
              'altura, abaixo do piso de 48 dp (SC 2.5.8).',
        );
      }

      exigirAlvo(Icons.qr_code_2, 'escanear, em Pets');
      await _irPara(tester, 'Rede');
      exigirAlvo(Icons.more_time, 'criar evento, na Rede');
      await _irPara(tester, 'Perto');
      exigirAlvo(Icons.group_add, 'indicar, no Perto');
    });
  });

  // ---------------------------------------------------------------------
  // ISCA 3 — os TRES estados de sessao
  //
  // Decisão do cliente em 18/10: *"essas ações só devem ser realizadas por
  // usuários cadastrados e validados, caso ao contrário o botão nem
  // aparece"*. São três estados e não dois, e o do meio é o que a decisão
  // mudou: antes, quem não tinha confirmado o e-mail VIA a porta e lia a
  // recusa na tela de destino.
  //
  // DESLIGAMENTO: troque `podeCriarNaComunidade` por `sessao.logado` em
  // `app/lib/telas/abas.dart`. O caso do e-mail não confirmado reprova e os
  // outros dois continuam verdes — que é como se sabe que ele mede o estado
  // do meio, e não o de baixo outra vez.
  // ---------------------------------------------------------------------
  group('ISCA 3 — criar só aparece com conta E e-mail confirmado', () {
    testWidgets('SEM sessão: a Rede e o Perto não mostram a porta de criar',
        (tester) async {
      await abrirOApp(tester, rede: _rede);

      await _irPara(tester, 'Rede');
      expect(
        _naBarra(Icons.more_time),
        findsNothing,
        reason: 'REPROVA: deslogado, a `Rede` ainda oferece criar evento. A '
            'porta convida para uma tela que responde "Entre para marcar", e '
            'foi esse convite vazio que o cliente mandou tirar.',
      );

      await _irPara(tester, 'Perto');
      expect(
        _naBarra(Icons.group_add),
        findsNothing,
        reason: 'REPROVA: deslogado, o `Perto` ainda oferece indicar. Palavras '
            'do cliente: "o botão indicar quem atende bem, nem deveria '
            'aparecer para o usuário se ele não estiver logado".',
      );
    });

    testWidgets('SEM sessão: o ESCANEAR continua lá, e isso é deliberado',
        (tester) async {
      // A exceção medida, e não esquecida: `tela_leitor_de_qr.dart` diz que a
      // autenticação da rota do leitor é OPCIONAL. Quem acha um animal na rua
      // é exatamente quem pode não ter conta nenhuma, e esconder o leitor
      // dessa pessoa é o oposto da cunha do produto.
      await abrirOApp(tester, rede: _rede);
      expect(
        _naBarra(Icons.qr_code_2),
        findsOneWidget,
        reason: 'REPROVA: deslogado, a porta do leitor desapareceu de `Pets`. '
            'Ler uma plaquinha não exige conta, e a regra de "cadastrado e '
            'validado" é para as ações de CRIAR — escanear não cria nada.',
      );
    });

    testWidgets('COM sessão e e-mail NÃO confirmado: a porta não aparece',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede,
        deposito: depositoLogado(emailVerificado: false),
      );

      // O estado tem de ser MESMO o do e-mail não confirmado, senão este caso
      // seria o de cima com outro nome: a faixa é a prova de que estamos no
      // estado do meio. Ela é também o caminho que SOBRA para a pessoa
      // validar depois de a porta sumir.
      expect(
        find.textContaining('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: a faixa de confirmação não está em `Pets`, então '
            'este caso não está no terceiro estado — e, pior, não há mais '
            'caminho nenhum para a pessoa confirmar o e-mail depois de a '
            'porta de criar ter sumido.',
      );

      await _irPara(tester, 'Rede');
      expect(
        _naBarra(Icons.more_time),
        findsNothing,
        reason: 'REPROVA: com o e-mail não confirmado, a `Rede` ainda oferece '
            'criar evento. Esta é a metade da decisão de 18/10 que MUDOU o '
            'produto: antes a porta aparecia e a tela de destino explicava a '
            'recusa.',
      );

      await _irPara(tester, 'Perto');
      expect(
        _naBarra(Icons.group_add),
        findsNothing,
        reason: 'REPROVA: com o e-mail não confirmado, o `Perto` ainda '
            'oferece indicar.',
      );
    });

    testWidgets('COM sessão e e-mail confirmado: as duas portas aparecem',
        (tester) async {
      // A contraprova dos dois casos acima. Sem ela, um `acaoDeCriar: null`
      // fixo deixaria os dois primeiros verdes para sempre, escondendo a ação
      // de TODO MUNDO — a classe de defeito mais fácil de produzir quando a
      // mudança do dia é "esconder".
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      await _irPara(tester, 'Rede');
      expect(
        _naBarra(Icons.more_time),
        findsOneWidget,
        reason: 'REPROVA: quem tem conta e e-mail confirmado NÃO vê a porta de '
            'criar evento. A regra esconde de quem não pode; esconder de quem '
            'pode apaga a função.',
      );

      await _irPara(tester, 'Perto');
      expect(
        _naBarra(Icons.group_add),
        findsOneWidget,
        reason: 'REPROVA: quem tem conta e e-mail confirmado NÃO vê a porta de '
            'indicar.',
      );
    });

    testWidgets('a barra não fica vazia nem estranha para quem não entrou',
        (tester) async {
      // O risco que vem junto com esconder: barra sem nada do lado direito,
      // com o título deslocado. Em `Pets` ela continua com o QR; nas outras
      // duas, o `Filtros` é da listagem e não depende de sessão.
      await abrirOApp(tester, rede: _rede);
      expect(
        find.byType(AppBar),
        findsOneWidget,
        reason: 'REPROVA: a barra de topo de `Pets` não está montada.',
      );
      expect(
        _naBarra(Icons.qr_code_2),
        findsOneWidget,
        reason: 'REPROVA: deslogado, o lado direito da barra de `Pets` ficou '
            'sem nada.',
      );
    });
  });
}
