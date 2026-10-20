// AS PORTAS DE CRIAR SAIRAM DA BARRA DE TOPO E VIRARAM ACAO FLUTUANTE
// (decisao do cliente, 19/10/2026), e este arquivo e o que impede que a troca
// de forma vire perda de funcao.
//
// **A TERCEIRA FORMA EM TRES DIAS, e as tres sao decisao dele.** Botao de
// largura total no corpo (ate 17/10) -> icone na barra de topo (18/10) -> acao
// flutuante no corpo (19/10). O que mudou em 19/10: eu lhe mostrei que, com o
// sino de notificacao na barra, o lado direito ficaria com quatro controles e o
// titulo nao caberia, e perguntei o que sairia. Palavras dele: *"O botao criar
// sai da barra"*.
//
// **Isto nao devolve o botao de largura total que ele recusou.** Aquele comia
// 64 dp de linha no topo do corpo de `Rede` e de `Perto`; a acao flutuante nao
// ocupa linha nenhuma do fluxo -- ela fica por cima, no canto inferior
// direito. O arquivo cobra as duas coisas: a acao existe, **e** o botao de
// largura total continua fora.
//
// O nome do arquivo ficou com a palavra `barra` e nao foi trocado de proposito:
// metade do que ele cobra hoje e a AUSENCIA da porta de criar NA BARRA, que e
// a isca (a) desta rodada.
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
//      dia em que alguem tirar o `tooltip` de `AcaoDeCriarFlutuante` -- e e
//      exatamente desse `tooltip` que o nome acessivel sai.
//
//      **A mudanca de forma de 19/10 nao podia mudar o que o leitor de tela
//      anuncia**, e e por isso que esta isca nao foi reescrita: quem ouvia
//      `Criar evento` no icone da barra tem de continuar ouvindo `Criar
//      evento` na acao flutuante. Ela tambem e a defesa contra o rotulo de
//      semantica VAZIO: um `AcaoDeCriarFlutuante` sem `tooltip` publicaria
//      `label=""` e `tooltip=""`, e `_exigirRotuloEAcao` exige um no cujo
//      nome seja EXATAMENTE a palavra esperada -- vazio nao casa.
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
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:bichu/telas/casca_com_abas.dart';
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

/// O glifo de criar DA ACAO FLUTUANTE, e so dentro dela.
///
/// O recorte tem a mesma razao de `_naBarra` por outro lado: um `find.byIcon`
/// solto nao distingue a acao flutuante de um glifo igual no corpo da lista, e
/// **nem distingue da propria barra** -- era assim que um caso ficaria verde
/// com a porta de volta no lugar de onde o cliente mandou tira-la.
Finder _flutuante(IconData glifo) => find.descendant(
  of: find.byType(AcaoDeCriarFlutuante),
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
  // **`label` OU `tooltip`.** O nome acessivel de um `IconButton` com
  // `tooltip:` e publicado pelo Flutter no campo `SemanticsNode.tooltip`, e
  // `label` fica VAZIO -- medido nesta arvore: o no do glifo sai como
  // `label="" tooltip="Escanear uma tag" btn=true tap=true`. Os dois campos
  // sao anunciados por TalkBack e por VoiceOver, e o icone de abrir o submenu
  // da casca (`tooltip="Abrir o submenu desta seção"`), que o produto publica
  // desde setembro, declara o nome dele exatamente assim.
  //
  // Olhar so `label` fazia esta isca reprovar um controle que TEM nome, e
  // reprovar pelo motivo errado: a conclusao dela seria "apague o tooltip",
  // que e o oposto do conserto. A pergunta continua a mesma -- o leitor de
  // tela consegue dizer o nome disto? --, e agora ela olha onde a resposta
  // esta.
  final candidatos =
      nos.where((n) => n.label == rotulo || n.tooltip == rotulo).toList();

  expect(
    candidatos,
    isNotEmpty,
    reason: 'REPROVA: em `$onde` nao ha no de semantica chamado exatamente '
        '"$rotulo". O botao grande com esse texto SAIU da tela, e o icone que '
        'ficou no lugar dele e a unica pista do que a acao faz: sem este '
        'rotulo, quem usa TalkBack ou VoiceOver ouve so "botao" (SC 4.1.2). '
        'Para ver este caso reprovar, apague o `tooltip:` de '
        '`AcaoDeCriarFlutuante` -- e dele que o nome sai.',
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
  //
  // SEGUNDO DESLIGAMENTO, o de 19/10: apague
  // `floatingActionButton: widget.acaoDeCriar` de `TelaDeAba` em
  // `app/lib/telas/casca_com_abas.dart`. A aba continua ENTREGANDO a porta e
  // a casca deixa de desenha-la -- o defeito mais silencioso desta mudanca,
  // porque nada no fonte da aba parece errado.
  // ---------------------------------------------------------------------
  group('ISCA 1 — a porta de criar continua alcançável', () {
    testWidgets('escanear: a porta SAIU de `Pets` e abre o leitor pela tela '
        'da conta', (tester) async {
      // **O QUE ESTE CASO PROVAVA, E O QUE ELE PROVA AGORA.**
      //
      // Ele provava que o ícone de QR estava na barra de `Pets` e abria o
      // leitor — a porta PRIMÁRIA de UX 27.5.6, posta ali em 18/10. O cliente
      // reverteu em 19/10: *"leve o icone de qr-code de escanear para a
      // pagina do perfil que tem relacao com as acoes do usuario."*
      //
      // Ele prova agora as duas metades, porque uma sem a outra é defeito: a
      // porta **não está** mais em `Pets`, e o leitor **continua alcançável**
      // pela tela da conta. A tela da conta já tinha `Escanear uma tag`, então
      // isto unificou em vez de acrescentar — ficou UMA porta.
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026 (pedido do cliente), e o
      // assunto deste caso e a barra de `Pets`. O caso vai ate ela em voz alta.
      await abrirAAba(tester, 'Pets');

      expect(
        _naBarra(Icons.qr_code_2),
        findsNothing,
        reason: 'REPROVA: o ícone de QR voltou à barra de `Pets`. Ele foi '
            'para a tela da conta em 19/10, e ela já tinha a porta: repor '
            'aqui devolve ao produto duas portas para o mesmo leitor.',
      );

      await irAoLeitorDeQr(tester);
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta da tela da conta não levou ao leitor. Ela é '
            'a ÚNICA desde 19/10: se ela não abre, o caminho de quem acha um '
            'cachorro na rua está fechado.',
      );
    });

    testWidgets('Rede → a ação FLUTUANTE abre o formulário de evento, e ela '
        'NÃO está na barra', (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await _irPara(tester, 'Rede');

      // **A ISCA (a) DESTA RODADA: `criar` SAIU DA BARRA DE TOPO.**
      //
      // Decisão dele em 19/10, com a conta na mesa: *"O botao criar sai da
      // barra"*. Sem esta metade, pôr a ação flutuante **sem** tirar o ícone
      // da barra deixaria o caso de baixo verde e a pessoa com duas cópias da
      // mesma porta -- e o sino, que é quem entrou no lugar, sem o espaço que
      // ele foi buscar.
      expect(
        _naBarra(Icons.more_time),
        findsNothing,
        reason: 'REPROVA: o ícone de criar evento continua na barra de topo '
            'da `Rede`. Ele saiu dali em 19/10 por decisão do cliente, para '
            'o sino de notificação entrar no lugar: com os dois ali o título '
            'não cabe, e foi essa conta que ele resolveu.',
      );

      final icone = _flutuante(Icons.more_time);
      expect(
        icone,
        findsOneWidget,
        reason: 'REPROVA: a `Rede` não tem a ação flutuante de criar evento. '
            'O botão `Criar evento` saiu do corpo da agenda em 18/10 e o '
            'ícone saiu da barra em 19/10, então esta é a ÚNICA porta do app '
            'para criar um evento: sem ela a rota existe sem ninguém poder '
            'alcançá-la.',
      );

      await tocar(tester, icone);
      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: a ação flutuante não levou ao formulário de criar '
            'evento.',
      );
    });

    testWidgets('Perto → a ação FLUTUANTE abre o formulário de indicação, e '
        'ela NÃO está na barra', (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await abrirAComunidade(tester);

      // A outra metade da isca (a). `Perto` é a seção que motivou a decisão:
      // é o único rótulo de CINCO letras e o único que saía cortado a 200%.
      expect(
        _naBarra(Icons.group_add),
        findsNothing,
        reason: 'REPROVA: o ícone de indicar continua na barra de topo do '
            '`Perto`. Ele saiu dali em 19/10 -- *"O botao criar sai da '
            'barra"* --, e era justamente o título desta seção que a conta '
            'não fechava.',
      );

      final icone = _flutuante(Icons.group_add);
      expect(
        icone,
        findsOneWidget,
        reason: 'REPROVA: o `Perto` não tem a ação flutuante de indicar. O '
            'botão `Indicar quem atende bem` saiu do corpo e o ícone saiu da '
            'barra, então esta é a única porta do app para a comunidade '
            'alimentar o diretório.',
      );

      await tocar(tester, icone);
      expect(
        find.byType(TelaSugerirProfissional),
        findsOneWidget,
        reason: 'REPROVA: a ação flutuante não levou ao formulário de '
            'indicação.',
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

        await abrirAComunidade(tester);
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
  // `app/lib/widgets/acao_de_criar_flutuante.dart`. Os três casos reprovam de
  // uma vez, e o `assert` do construtor não pega isso: ele só vê rótulo
  // vazio, não rótulo que não chega à árvore.
  //
  // **E é por isso que o esperado é comparado por IGUALDADE e não por
  // `contains`:** um rótulo de semântica VAZIO já passou vacuamente neste
  // repositório num `isNot(contains())`. Aqui o caso procura um nó cujo nome
  // seja EXATAMENTE a palavra, e nenhum nó sem nome satisfaz isso.
  // ---------------------------------------------------------------------
  group('ISCA 2 — o ícone não é mudo', () {
    testWidgets('a tela da conta: a porta do leitor se anuncia '
        '"Escanear uma tag"', (tester) async {
      // Este caso mudou de TELA, e não de exigência: o ícone de QR saiu da
      // barra de `Pets` em 19/10 e virou a porta da tela da conta. O que ele
      // cobra continua o mesmo — a porta do leitor não é muda para quem usa
      // leitor de tela, e ela tem ação de toque.
      //
      // A foto que abre essa tela tem o anúncio dela cobrado em
      // `navegacao_mensagens_e_avatar_test.dart` ("Sua conta").
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await irParaAConta(tester);
      _exigirRotuloEAcao(
        tester,
        rotulo: 'Escanear uma tag',
        onde: 'a tela da conta',
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
        onde: 'a ação flutuante da Rede',
      );
      handle.dispose();
    });

    testWidgets('Perto: o ícone se anuncia com o rótulo DA TELA',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await abrirAComunidade(tester);
      // A única comparação com constante neste arquivo, e ela é o objeto do
      // caso: o rótulo do ícone tem de ser O MESMO que a tela usa para a ação,
      // de uma fonte só. Duas cópias divergem, e no dia em que divergirem
      // ninguém sabe qual das duas está certa.
      _exigirRotuloEAcao(
        tester,
        rotulo: ListaDoDiretorio.rotuloDeIndicar,
        onde: 'a ação flutuante do Perto',
      );
      handle.dispose();
    });

    testWidgets('o rótulo do Perto diz INDICAR, e não cadastrar',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await abrirAComunidade(tester);
      expect(
        ListaDoDiretorio.rotuloDeIndicar.toLowerCase().contains('cadastr'),
        isFalse,
        reason: 'REPROVA: o rótulo acessível promete cadastro. A emenda 1 do '
            'ADR-0011 diz que a comunidade convida e avalia, nunca cria: '
            '"cadastrar" prometeria publicação, e nada é publicado aqui.',
      );
    });

    testWidgets('ÁREA DE TOQUE — as duas ações flutuantes têm pelo menos '
        '48 dp', (tester) async {
      // O piso é `BichuAlvoDeToque.min`. O desenho usava `critico` (64 dp)
      // enquanto a porta era controle de canto da barra; fora dela o alvo é o
      // do `FloatingActionButton`, 56 dp. Este caso afirma o PISO, porque é
      // ele que é contrato de acessibilidade, e não a escolha de 56 nem a de
      // 64 -- e é justamente por isso que a mudança de forma de 19/10 não
      // precisou mexer nele.
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

      void exigirAlvo(IconData glifo, String onde) {
        final caixa = tester.getSize(find.ancestor(
          of: _flutuante(glifo),
          matching: find.byType(AcaoDeCriarFlutuante),
        ).first);
        expect(
          caixa.width,
          greaterThanOrEqualTo(48.0),
          reason: 'REPROVA: a ação de $onde tem ${caixa.width} dp de largura, '
              'abaixo do piso de 48 dp (SC 2.5.8).',
        );
        expect(
          caixa.height,
          greaterThanOrEqualTo(48.0),
          reason: 'REPROVA: a ação de $onde tem ${caixa.height} dp de '
              'altura, abaixo do piso de 48 dp (SC 2.5.8).',
        );
      }

      // `Icons.qr_code_2` saiu desta lista porque saiu da BARRA (19/10). O
      // alvo da porta nova é medido onde ela mora agora: a foto da conta tem
      // caso próprio em `navegacao_mensagens_e_avatar_test.dart`, e o item
      // `Escanear uma tag` herda o piso de 64 dp de `ItemDeMenu`.
      await _irPara(tester, 'Rede');
      exigirAlvo(Icons.more_time, 'criar evento, na Rede');
      await abrirAComunidade(tester);
      exigirAlvo(Icons.group_add, 'indicar, no Perto');
    });
  });

  // ---------------------------------------------------------------------
  // O QUE A ACAO FLUTUANTE SOBREPOE, E O RESPIRO QUE PAGA POR ISSO
  //
  // A acao saiu da barra e passou a FLUTUAR sobre o corpo, e isso cria um
  // defeito que a isca 1 nao pega: a porta funciona, a lista funciona, e o
  // ultimo item da lista nasce embaixo dela. Em `Perto` o ultimo item e um
  // cartao de profissional com o controle de telefone no canto DIREITO, que e
  // exatamente onde a acao pousa.
  //
  // DESLIGAMENTO: troque o `padding` do `ListView` de `TelaDeAba` de volta
  // para `const EdgeInsets.all(BichuEspaco.e4)`. Este caso reprova.
  // ---------------------------------------------------------------------
  group('a acao flutuante nao cobre o fim do corpo', () {
    testWidgets('o respiro do pe da lista cobre a invasao MEDIDA da acao',
        (tester) async {
      await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
      await abrirAComunidade(tester);

      final fab = tester.getRect(find.byType(AcaoDeCriarFlutuante));
      final lista = find
          .descendant(
            of: find.byType(Scaffold),
            matching: find.byType(ListView),
          )
          .first;
      final corpo = tester.getRect(lista);
      final respiro = (tester.widget<ListView>(lista).padding as EdgeInsets)
          .bottom;

      // **O QUE ELA SOBREPOE, medido.** A acao mede 56 dp e o `Scaffold` a
      // assenta a 16 dp da borda inferior do corpo: ela invade os ultimos
      // 72,00 dp do corpo rolavel, no canto DIREITO (os 56 dp finais da
      // largura, com 16 dp de margem). Nao cobre a barra de baixo -- este
      // `Scaffold` e filho do `body` do `Scaffold` da casca, e a barra e irma
      // desse `body`.
      final invasao = corpo.bottom - fab.top;
      expect(
        invasao,
        72.0,
        reason:
            'REPROVA: a acao flutuante invade ${invasao.toStringAsFixed(2)} '
            'dp do pe do corpo, e o medido em 19/10 e 72,00 (56 dp de '
            'desenho + 16 dp de assentamento do `Scaffold`). Se ela cresceu, '
            'o respiro abaixo tem de crescer com ela.',
      );
      expect(
        fab.bottom,
        lessThanOrEqualTo(corpo.bottom),
        reason:
            'REPROVA: a acao flutuante passa do pe do corpo '
            '(${fab.bottom.toStringAsFixed(2)} contra '
            '${corpo.bottom.toStringAsFixed(2)}) e invade a barra de baixo. '
            'Ela e desenhada pelo `Scaffold` de dentro de proposito: e isso '
            'que a mantem acima dos cinco destinos.',
      );

      // **O RESPIRO QUE PAGA A INVASAO.** O pe da lista reserva pelo menos o
      // que a acao cobre, entao nenhum item pode terminar embaixo dela --
      // nem com a lista cheia, nem rolada ate o fim.
      expect(
        respiro,
        greaterThanOrEqualTo(invasao),
        reason:
            'REPROVA: o pe da lista reserva ${respiro.toStringAsFixed(2)} dp '
            'e a acao flutuante cobre ${invasao.toStringAsFixed(2)} dp. O '
            'ultimo item da lista termina embaixo dela, e em `Perto` o que '
            'fica ali e o controle de telefone do cartao: acao que cobre '
            'acao.',
      );

      // E o respiro NAO existe onde nao ha acao flutuante: uma faixa morta de
      // 72 dp no pe de uma tela que nao cobre nada seria um buraco pago por
      // nada.
      //
      // **A TELA MEDIDA MUDOU DE `Pets` PARA `Loja` em 19/10/2026**, e a
      // afirmacao e a mesma. `Pets` GANHOU acao flutuante naquele dia, por
      // pedido dele (*"so faltou na pagina de pets o botao para adicionar um
      // novo pet perdido ou escanear a tag, gostei desse padrao"*): sao as
      // tres acoes que a gaveta perdeu, num alvo so que abre folha. Com
      // flutuante, `Pets` passou a PRECISAR dos 72 dp -- medir a ausencia
      // nela seria cobrar o buraco de volta.
      //
      // `Loja` e a tela que sobrou sem flutuante entre as da barra, e o
      // `Mural` tambem esta sem -- mas o `Mural` nao tem lista, entao `Loja`
      // e a medida certa: ela tem corpo rolavel e nao tem o que cobrir.
      await _irPara(tester, 'Loja');
      final listaDaLoja = find
          .descendant(
            of: find.byType(Scaffold),
            matching: find.byType(ListView),
          )
          .first;
      expect(
        (tester.widget<ListView>(listaDaLoja).padding as EdgeInsets).bottom,
        BichuEspaco.e4,
        reason:
            'REPROVA: `Loja` nao tem acao flutuante e ganhou o respiro dela. '
            'Sao 72 dp de faixa morta no pe de uma tela que nao cobre nada.',
      );

      // **E `Pets` TEM o respiro, porque ela passou a ter flutuante.** Sem
      // esta metade, a mudanca de alvo acima leria como o caso desistindo de
      // medir `Pets`.
      await _irPara(tester, 'Pets');
      final listaDePets = find
          .descendant(
            of: find.byType(Scaffold),
            matching: find.byType(ListView),
          )
          .first;
      expect(
        (tester.widget<ListView>(listaDePets).padding as EdgeInsets).bottom,
        greaterThanOrEqualTo(72.0),
        reason:
            'REPROVA: `Pets` tem acao flutuante desde 19/10 e NAO reserva o '
            'respiro dela. O ultimo cartao de pet perdido termina embaixo do '
            'alvo de criar, em toda rolagem.',
      );
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
      // **A ISCA (b) DESTA RODADA, a metade negativa.** A porta mudou de
      // lugar em 19/10 e a regra de visibilidade NÃO mudou com ela: mover um
      // controle para o `floatingActionButton` é a maneira mais fácil de
      // perder a condição de sessão pelo caminho, porque o `Scaffold` desenha
      // o que receber e `null` não deixa rastro na tela.
      //
      // Ela mede `AcaoDeCriarFlutuante` por TIPO, e não pelo glifo: um
      // flutuante presente com ícone trocado passaria por um `byIcon`.
      await abrirOApp(tester, rede: _rede);

      await _irPara(tester, 'Rede');
      expect(
        find.byType(AcaoDeCriarFlutuante),
        findsNothing,
        reason: 'REPROVA: deslogado, a `Rede` ainda oferece criar evento. A '
            'porta convida para uma tela que responde "Entre para marcar", e '
            'foi esse convite vazio que o cliente mandou tirar.',
      );

      await abrirAComunidade(tester);
      expect(
        find.byType(AcaoDeCriarFlutuante),
        findsNothing,
        reason: 'REPROVA: deslogado, o `Perto` ainda oferece indicar. Palavras '
            'do cliente: "o botão indicar quem atende bem, nem deveria '
            'aparecer para o usuário se ele não estiver logado".',
      );

      // **E A PROVA DE QUE O ESTADO É O QUE EU PENSO, positiva.**
      //
      // Sem ela o caso ficaria verde num app logado em que a porta sumiu por
      // outro motivo -- a armadilha que a frente da gaveta acabou de achar no
      // portão da barra, onde um `abrirOApp` chamado duas vezes media o
      // arranjo logado achando que media o deslogado.
      //
      // **Não serve medir o glifo de pessoa da foto:** `depositoLogado()` não
      // dá nome ao usuário, então a foto desenha o mesmo glifo nos DOIS
      // estados -- medido. O que distingue é o SINO, que só existe com
      // sessão, e `Entrar` na tela da conta.
      expect(
        find.byIcon(Icons.notifications_outlined),
        findsNothing,
        reason: 'REPROVA: este caso NÃO está deslogado -- o sino de '
            'notificação está pintado, e ele só existe com sessão. Então a '
            'ausência da porta de criar, medida acima, não prova nada sobre a '
            'regra de sessão.',
      );
      await tester.tap(find.byType(AvatarDaConta));
      await tester.pumpAndSettle();
      expect(
        find.text('Entrar'),
        findsWidgets,
        reason: 'REPROVA: este caso NÃO está deslogado -- a tela da conta não '
            'oferece `Entrar`.',
      );
    });

    testWidgets('SEM sessão: o ESCANEAR continua lá, e isso é deliberado',
        (tester) async {
      // A exceção medida, e não esquecida: `tela_leitor_de_qr.dart` diz que a
      // autenticação da rota do leitor é OPCIONAL. Quem acha um animal na rua
      // é exatamente quem pode não ter conta nenhuma, e esconder o leitor
      // dessa pessoa é o oposto da cunha do produto.
      // A exceção continua valendo, e só mudou de LUGAR: a porta não está
      // mais em `Pets`, e sim na tela da conta — que é alcançável deslogado,
      // pela foto da barra de topo. Se a tela da conta fosse só para quem tem
      // sessão, esta mudança teria escondido o leitor de quem mais precisa
      // dele, e é exatamente isso que este caso impede.
      await abrirOApp(tester, rede: _rede);
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026 (pedido do cliente), e o
      // assunto deste caso e a barra de `Pets`. O caso vai ate ela em voz alta.
      await abrirAAba(tester, 'Pets');
      expect(
        _naBarra(Icons.qr_code_2),
        findsNothing,
        reason: 'REPROVA: o ícone de QR voltou à barra de `Pets`.',
      );
      await irAoLeitorDeQr(tester);
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: DESLOGADO, a porta do leitor não abre. Ler uma '
            'plaquinha não exige conta, e a regra de "cadastrado e validado" '
            'é para as ações de CRIAR — escanear não cria nada. Quem acha um '
            'animal na rua é exatamente quem pode não ter conta nenhuma.',
      );
    });

    testWidgets('COM sessão e e-mail NÃO confirmado: a porta não aparece',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede,
        deposito: depositoLogado(emailVerificado: false),
      );
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026 (pedido do cliente), e o
      // assunto deste caso e a barra de `Pets`. O caso vai ate ela em voz alta.
      await abrirAAba(tester, 'Pets');

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
        find.byType(AcaoDeCriarFlutuante),
        findsNothing,
        reason: 'REPROVA: com o e-mail não confirmado, a `Rede` ainda oferece '
            'criar evento. Esta é a metade da decisão de 18/10 que MUDOU o '
            'produto: antes a porta aparecia e a tela de destino explicava a '
            'recusa.',
      );

      await abrirAComunidade(tester);
      expect(
        find.byType(AcaoDeCriarFlutuante),
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
        _flutuante(Icons.more_time),
        findsOneWidget,
        reason: 'REPROVA: quem tem conta e e-mail confirmado NÃO vê a porta de '
            'criar evento. A regra esconde de quem não pode; esconder de quem '
            'pode apaga a função.',
      );

      await abrirAComunidade(tester);
      expect(
        _flutuante(Icons.group_add),
        findsOneWidget,
        reason: 'REPROVA: quem tem conta e e-mail confirmado NÃO vê a porta de '
            'indicar.',
      );
    });

    testWidgets('a barra não fica vazia nem estranha para quem não entrou',
        (tester) async {
      // O risco que vem junto com esconder: barra sem nada do lado direito,
      // com o título deslocado. Desde 19/10 o lado direito não depende da
      // porta de criar para existir: ele é o sino (que some sem sessão) e a
      // foto (que fica em todo estado), e é a foto que garante que a barra
      // nunca fique vazia.
      await abrirOApp(tester, rede: _rede);
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026 (pedido do cliente), e o
      // assunto deste caso e a barra de `Pets`. O caso vai ate ela em voz alta.
      await abrirAAba(tester, 'Pets');
      expect(
        find.byType(AppBar),
        findsOneWidget,
        reason: 'REPROVA: a barra de topo de `Pets` não está montada.',
      );
      // O lado direito de `Pets` deslogado: a FOTO da conta, e nada mais.
      // O ícone de QR saiu em 19/10 e `Pets` não tem ação de seção; a foto
      // está em todas as telas, inclusive deslogada, porque a tela da conta é
      // onde moram `Entrar` e `Criar conta`.
      expect(
        _naBarra(Icons.qr_code_2),
        findsNothing,
        reason: 'REPROVA: o ícone de QR voltou à barra de `Pets`.',
      );
      expect(
        find.byType(AvatarDaConta),
        findsOneWidget,
        reason: 'REPROVA: deslogado, o lado direito da barra de `Pets` ficou '
            'sem nada. A foto da conta fica em TODAS as telas (19/10), e '
            'deslogada ela é a porta de `Entrar` e `Criar conta`.',
      );
    });
  });
}
