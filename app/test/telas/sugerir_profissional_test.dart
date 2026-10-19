// **Indicar um profissional para o `Perto`** (`suggestDirectoryEntry`).
//
// O caso central deste arquivo, e a razao de ele existir separado do de criar
// encontro: **a indicação NÃO publica**. Criar encontro é a pessoa falando dela
// mesma e publica direto; indicar uma clínica é publicar sobre um TERCEIRO que
// não pediu, não sabe e pode discordar. A tela precisa dizer isso com estas
// palavras, antes e depois do envio — e é isso que o grupo
// `a tela não promete publicação` reprova.
//
// O que mais este arquivo cobra:
//
//   1. a porta existe no CORPO do `Perto` e leva ao formulário;
//   2. o corpo enviado tem **só os campos do contrato**, e nenhum deles é
//      documento nem dado de pessoa física;
//   3. o tipo de contato é DECLARADO e a ajuda do campo muda com ele;
//   4. o `400` nomeado em `public_contact.value` marca o campo.
//
// **Nenhum `expect` compara texto renderizado com a constante que o produz.**
//
// ESTES CASOS NÃO FORAM EXECUTADOS nesta entrega, por regra do cliente. O que
// rodou foi `flutter analyze`.

import 'dart:convert';

import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Uma página vazia do diretório, no formato do contrato.
Map<String, dynamic> diretorioVazio() => <String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'page': 1,
      'limit': 20,
      'total': 0,
      'distance_available': false,
      'applied_filters': <String, String>{'scope': 'all'},
    };

/// A rede que atende o diretório e registra o que foi enviado na indicação.
///
/// **404 no resto**: chamada não declarada aqui precisa falhar alto.
Future<http.Response> Function(http.Request) redeDaIndicacao({
  required List<Map<String, dynamic>> enviados,
  http.Response Function()? respostaDaIndicacao,
}) {
  return (req) async {
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'POST') {
      enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
      final resposta = respostaDaIndicacao;
      if (resposta != null) return resposta();
      return json200(
        <String, dynamic>{
          'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
          'state': 'pending',
          'created_at': '2026-10-17T12:00:00Z',
        },
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirPerto(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
  await tester.pumpAndSettle();
}

/// O `TextField` do [BichuField] cujo rótulo é [rotulo].
///
/// Pelo `rotulo` DECLARADO no widget, e **não** por `widgetWithText`: o rótulo
/// do `BichuField` é um `Text` IRMÃO do campo, dentro da mesma `Column`
/// (`lib/widgets/bichu_field.dart`, linhas 125-133), e não um descendente
/// dele. `find.widgetWithText(TextField, 'Nome do lugar')` acha ZERO widgets,
/// e `enterText` sobre zero estoura `Bad state: No element` -- era isso que
/// tirava o chão de nove casos deste arquivo. O mesmo cuidado está escrito em
/// `test/telas/cep_nos_dois_formularios_test.dart`, linhas 140-147.
Finder campoDoRotulo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (widget) => widget is BichuField && widget.rotulo == rotulo,
        description: 'BichuField de rótulo "$rotulo"',
      ),
      matching: find.byType(TextField),
    );

/// Abre um [SeletorDeLista] pelo rótulo e escolhe a opção pelo NOME.
///
/// Dois cuidados, e os dois foram medidos nesta rodada:
///
/// 1. o toque vai no `InkWell` do seletor, e **não** no `Text` do rótulo: o
///    rótulo é um `Text` IRMÃO do controle (`lib/widgets/seletor_de_lista.dart`,
///    linhas 93-121) e não abre nada. `tocar(find.text('O que eles fazem'))`
///    tocava no rótulo, a folha não abria, `find.text('Clínica')` achava zero
///    e `tocar` estourava `Bad state: No element`. O mesmo cuidado está
///    escrito em `test/telas/cadastrar_identificacao_test.dart`, linhas 52-62,
///    que passa;
/// 2. a opção é procurada dentro do `ListTile` da folha, e a folha rola: o
///    `ListView` só constrói o que cabe.
Future<void> escolherNaLista(
  WidgetTester tester,
  String rotulo,
  String opcao,
) async {
  // O corpo da tela e um `ListView` e o seletor pode estar abaixo da dobra:
  // sem rolar primeiro, `find.text(rotulo)` acha zero e `tocar` estoura.
  await rolarAte(tester, find.text(rotulo));
  final seletor = find.ancestor(
    of: find.text(rotulo),
    matching: find.byType(SeletorDeLista),
  );
  await tocar(
    tester,
    find.descendant(of: seletor, matching: find.byType(InkWell)),
  );
  final item = find.descendant(
    of: find.byType(ListTile),
    matching: find.text(opcao),
  );
  if (item.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      item,
      120,
      scrollable: find
          .descendant(
            of: find.byType(BottomSheet),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }
  await tocar(tester, item);
}

/// Preenche o mínimo que o contrato exige, sem enviar.
Future<void> preencherOMinimo(WidgetTester tester) async {
  await rolarAte(tester, campoDoRotulo('Nome do lugar'));
  await tester.enterText(
    campoDoRotulo('Nome do lugar'),
    'Clínica Veterinária Bichinho',
  );
  await tester.pumpAndSettle();

  await escolherNaLista(tester, 'O que eles fazem', 'Clínica');

  await rolarAte(tester, campoDoRotulo('Cidade'));
  await tester.enterText(campoDoRotulo('Cidade'), 'Rio de Janeiro');
  await rolarAte(tester, campoDoRotulo('UF'));
  await tester.enterText(campoDoRotulo('UF'), 'RJ');
  await tester.pumpAndSettle();

  await escolherNaLista(tester, 'Como entrar em contato', 'Telefone');

  await rolarAte(tester, campoDoRotulo('Telefone'));
  await tester.enterText(campoDoRotulo('Telefone'), '+5521988887777');
  await tester.pumpAndSettle();
}

/// Abre o formulário pela PORTA REAL da seção, que desde 18/10/2026 é o ícone
/// de pessoas da AÇÃO FLUTUANTE do corpo -- em 18/10 ele era o ícone da barra
/// de topo, e em 19/10 saiu dela por decisão do cliente (*"O botao criar sai
/// da barra"*) para o sino de notificação entrar no lugar.
///
/// Numa função, e não copiada em cada caso, pelo motivo que este arquivo
/// acabou de viver: a mudança de forma da porta tirou o chão de doze casos de
/// uma vez. Com a porta num lugar só, a próxima custa uma edição.
///
/// **O glifo é procurado DENTRO de `AcaoDeCriarFlutuante`**, e não solto na
/// árvore: um `find.byIcon` largo acharia um `group_add` de outra tela e
/// ficaria verde com a porta ausente -- **ou acharia um ícone de volta NA
/// BARRA**, que é exatamente o que o cliente mandou tirar.
Future<void> abrirAPorta(WidgetTester tester) async {
  await tocar(
    tester,
    find.descendant(
      of: find.byType(AcaoDeCriarFlutuante),
      matching: find.byIcon(Icons.group_add),
    ),
  );
}

void main() {
  // -------------------------------------------------------------------------
  // A PORTA MUDOU DE FORMA E DE REGRA EM 18/10/2026, por dois pedidos do
  // cliente no mesmo dia, e este grupo foi reescrito para cobrar o que ele
  // decidiu. Nenhum caso foi apagado: os que afirmavam o contrário passaram a
  // afirmar o novo.
  //
  //   1. *"os itens de criação, como evento e indicação, até o escanear
  //      poderia ser ícones na barra superior ... e não fique esse botão
  //      grande na página ocupando muito espaço"*, com o glifo escolhido por
  //      ele: *"o ícone de recomendar um profissional, pode ser igual do
  //      instagram, as 3 pessoas juntos"*. Isto REVERTE a regra de 17/10 que
  //      este arquivo cobrava ("a porta NÃO está na AppBar").
  //
  //      **E EM 19/10 ELA SAIU DA BARRA, por decisão dele:** *"O botao criar
  //      sai da barra"*. Com o sino de notificação na barra o título não
  //      cabia, eu perguntei o que sairia, e foi isto. A porta virou ação
  //      FLUTUANTE no corpo -- o que ele recusou em 18/10 era o botão de
  //      LARGURA TOTAL, que comia 64 dp de linha; a ação flutuante não ocupa
  //      linha nenhuma do fluxo. Este arquivo volta a cobrar "a porta NÃO
  //      está na AppBar", agora com a ação medida onde ela passou a morar.
  //   2. *"o botão indicar quem atende bem, nem deveria aparecer para o
  //      usuário se ele não estiver logado"*, depois estendido: *"essas ações
  //      só devem ser realizadas por usuários cadastrados e validados, caso ao
  //      contrário o botão nem aparece"*.
  //
  // `_Impedimento.semConta` e a faixa com `Entrar` continuam em
  // `sugerir_profissional.dart`, INTOCADOS: a rota segue alcançável por link
  // profundo, e tela que recusa calada é pior que tela que recusa dizendo. O
  // que mudou é quem é convidado a chegar lá.
  // -------------------------------------------------------------------------
  group('a porta de indicar', () {
    testWidgets('é FLUTUANTE no corpo do Perto, não está na barra, e abre o '
        'formulário', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );

      // **A metade que mudou em 19/10, dita por ausência.** Sem ela, pôr a
      // ação flutuante SEM tirar o ícone da barra deixaria este caso verde e
      // a pessoa com duas cópias da mesma porta.
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.group_add),
        ),
        findsNothing,
        reason: 'REPROVA: o ícone de indicar continua na barra de topo do '
            'Perto. Ele saiu dali em 19/10 -- *"O botao criar sai da barra"* '
            '--, e era justamente o título desta seção que a conta de largura '
            'não fechava.',
      );

      final porta = find.descendant(
        of: find.byType(AcaoDeCriarFlutuante),
        matching: find.byIcon(Icons.group_add),
      );
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: o Perto não oferece como indicar um profissional. O '
            'botão do corpo saiu por pedido do cliente, então este ícone é o '
            'único caminho do app, e sem ele o diretório continua sem nenhuma '
            'forma de a comunidade alimentá-lo.',
      );

      await tocar(tester, porta);
      expect(find.byType(TelaSugerirProfissional), findsOneWidget);
    });

    testWidgets(
      'ISCA — o botão grande NÃO voltou ao corpo. Para ver reprovar, reponha '
      'o `Padding` + `BotaoSecundario` que saiu de `lista_do_diretorio.dart`.',
      (tester) async {
        await abrirPerto(
          tester,
          rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        );
        expect(
          find.widgetWithText(
            OutlinedButton,
            ListaDoDiretorio.rotuloDeIndicar,
          ),
          findsNothing,
          reason: 'REPROVA: a porta voltou a ser botão de largura total no '
              'corpo. Com a ação flutuante ela seria a segunda cópia da mesma '
              'ação, e os 64 dp de altura que o cliente pediu de volta não '
              'voltaram -- a ação flutuante não ocupa linha nenhuma do '
              'fluxo, e o botão de largura total ocupava.',
        );
      },
    );

    testWidgets('o ícone se anuncia com RÓTULO, e o rótulo diz INDICAR',
        (tester) async {
      // O caso ganhou a primeira metade em 18/10 e ela não é zelo: o texto
      // que o botão grande carregava SAIU DA TELA, e o glifo ficou sendo a
      // única pista do que a ação faz. Ícone sem rótulo é mudo para quem usa
      // TalkBack ou VoiceOver — e, aqui, ambíguo até para quem vê: pessoas
      // juntas sem o sinal de adicionar leria "ver a lista", que é o que esta
      // tela já mostra.
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );

      // **`FloatingActionButton`, e nao `IconButton`.** A porta deixou de ser
      // controle de canto de barra em 19/10 e passou a ser acao flutuante; o
      // `tooltip` continua sendo de onde o nome acessivel sai, e e ele que
      // este caso le. A mudanca de forma nao podia mudar o que o leitor de
      // tela anuncia, e esta linha e o que garante isso.
      final icone = tester.widget<FloatingActionButton>(
        find
            .ancestor(
              of: find.descendant(
                of: find.byType(AcaoDeCriarFlutuante),
                matching: find.byIcon(Icons.group_add),
              ),
              matching: find.byType(FloatingActionButton),
            )
            .first,
      );
      expect(
        icone.tooltip,
        ListaDoDiretorio.rotuloDeIndicar,
        reason: 'REPROVA: o ícone de indicar não carrega o rótulo da tela no '
            '`tooltip`. É dele que sai o nome acessível: sem ele, o leitor de '
            'tela anuncia só "botão" (SC 4.1.2).',
      );
      expect(
        ListaDoDiretorio.rotuloDeIndicar.toLowerCase().contains('cadastr'),
        isFalse,
        reason: 'REPROVA: o rótulo promete cadastro. Quem usa esta porta não '
            'cria a entrada do diretório: a emenda 1 do ADR-0011 diz que a '
            'comunidade convida e avalia, nunca cria. "Cadastrar" prometeria '
            'publicação, e nada é publicado aqui.',
      );
    });

    testWidgets('deslogado, a porta NÃO aparece', (tester) async {
      // O defeito que ele relatou, com as palavras dele: *"quando eu tento
      // indicar um profissional a página interna fala pra eu entrar pra poder
      // indicar. Mas o botão indicar quem atende bem, nem deveria aparecer
      // para o usuário se ele não estiver logado"*.
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        logado: false,
      );
      expect(
        find.descendant(
          of: find.byType(AcaoDeCriarFlutuante),
          matching: find.byIcon(Icons.group_add),
        ),
        findsNothing,
        reason: 'REPROVA: deslogado, o Perto ainda oferece indicar. A porta '
            'convida para uma tela que responde "Entre para indicar".',
      );
    });

    testWidgets('a lista do diretório não promete cadastro em texto nenhum',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      expect(
        find.textContaining('Cadastrar'),
        findsNothing,
        reason: 'REPROVA: o rótulo promete cadastro. Quem usa esta porta não '
            'cria a entrada do diretório: a emenda 1 do ADR-0011 diz que a '
            'comunidade convida e avalia, nunca cria. "Cadastrar" prometeria '
            'publicação, e nada é publicado aqui.',
      );
    });
  });

  group('a tela não promete publicação', () {
    testWidgets('diz, ANTES dos campos, que alguém confere primeiro',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);

      expect(
        find.textContaining('confere antes de publicar'),
        findsOneWidget,
        reason: 'REPROVA: a tela não diz que a indicação passa por '
            'conferência. Quem escreve o nome de uma clínica real precisa '
            'saber que o estabelecimento vai ser avisado e decide se quer '
            'aparecer — isto é um terceiro, não a própria pessoa.',
      );
    });

    testWidgets(
      'ISCA — o recibo diz CONFERÊNCIA e não publicação. Para ver reprovar, '
      'troque `TelaSugerirProfissional.recebido` por "Pronto, publicado!".',
      (tester) async {
        await abrirPerto(
          tester,
          rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        );
        await abrirAPorta(tester);
        await preencherOMinimo(tester);
        await tocar(
          tester,
          find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
        );

        expect(
          find.textContaining('nada aparece no Perto até alguém olhar'),
          findsOneWidget,
          reason: 'REPROVA: o texto de sucesso não diz que nada foi '
              'publicado. Um "pronto, indicado!" faria a pessoa acreditar que '
              'o nome de uma clínica real está no ar sem ninguém ter olhado — '
              'e é justamente isso que a sugestão pendente existe para '
              'impedir.',
        );
        expect(
          find.textContaining('Publicado'),
          findsNothing,
          reason: 'REPROVA: a tela escreveu "publicado" sobre o que está '
              'pendente de revisão.',
        );
      },
    );

    testWidgets('não navega para a lista do Perto depois de enviar',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(
        find.byType(TelaSugerirProfissional),
        findsOneWidget,
        reason: 'REPROVA: a tela voltou para o Perto. A pessoa procuraria na '
            'lista o que não está lá, porque nada foi publicado.',
      );
    });
  });

  group('o corpo enviado', () {
    testWidgets(
      'ISCA — manda SÓ os campos de `DirectorySuggestionInput`. Para ver '
      'reprovar, acrescente `"cnpj"` em `DiretorioApi.corpoDaSugestao`.',
      (tester) async {
        final enviados = <Map<String, dynamic>>[];
        await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
        await abrirAPorta(tester);
        await preencherOMinimo(tester);
        await tocar(
          tester,
          find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
        );

        expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
        const permitidas = <String>{
          'display_name',
          'kind',
          'city',
          'state',
          'neighborhood',
          'public_contact',
          'note',
        };
        expect(
          enviados.single.keys.toSet().difference(permitidas),
          isEmpty,
          reason: 'REPROVA: o corpo carrega campo que a operação não aceita.',
        );
      },
    );

    testWidgets('não coleta documento nem dado de pessoa física',
        (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      for (final proibido in <String>[
        'cnpj',
        'cpf',
        'crmv_number',
        'crmv_uf',
        'document',
        'street_address',
        'point',
        'lat',
        'lon',
        'geo',
      ]) {
        expect(
          enviados.single.containsKey(proibido),
          isFalse,
          reason: 'REPROVA: o corpo carrega `$proibido`. Documento é prova de '
              'quem o APRESENTA e mora em `entity_verifications`: pedi-lo aqui '
              'seria coletar o documento de um terceiro pela mão de um '
              'estranho. Coordenada e endereço não existem neste caminho '
              '(ADR-0006): não há mapa nem geocodificação.',
        );
      }
    });

    testWidgets('não pergunta documento na tela', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);

      for (final proibido in <String>['CNPJ', 'CPF', 'CRMV', 'Endereço']) {
        expect(
          find.textContaining(proibido),
          findsNothing,
          reason: 'REPROVA: a tela pede `$proibido`. O mínimo que permite '
              'conferir é nome, atividade, cidade e um contato público.',
        );
      }
    });

    testWidgets('o contato vai com o tipo DECLARADO', (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      final contato = enviados.single['public_contact'] as Map<String, dynamic>;
      expect(
        contato.keys.toSet(),
        <String>{'kind', 'value'},
        reason: 'REPROVA: o contato não é o par (tipo, valor).',
      );
      expect(
        contato['kind'],
        'phone',
        reason: 'REPROVA: o tipo escolhido na tela não chegou no corpo. '
            'Adivinhar o tipo por heurística aceitaria um telefone no campo '
            'de site, e a recusa chegaria sem dizer qual dos dois errou.',
      );
    });
  });

  group('a ajuda do campo de contato segue o tipo escolhido', () {
    testWidgets('site pede o endereço completo com https://', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      await escolherNaLista(tester, 'Como entrar em contato', 'Site');

      expect(
        find.textContaining('endereço completo, com https://'),
        findsOneWidget,
        reason: 'REPROVA: a ajuda não diz o formato que o servidor vai '
            'conferir. Dito antes é um campo preenchido certo; descoberto '
            'pelo 400 é um formulário refeito.',
      );
    });

    testWidgets('instagram pede o perfil com @', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);
      await escolherNaLista(tester, 'Como entrar em contato', 'Instagram');

      // `perfil, com @`, e nao `o perfil, com @`: o texto da tela e
      // `'O perfil, com @'` (`lib/api/modelos_diretorio.dart`, linha 498),
      // com O MAIUSCULO de inicio de frase, e `textContaining` compara
      // maiuscula de minuscula. O caso irmao deste grupo ja evita a primeira
      // letra pelo mesmo motivo (`endereço completo, com https://`).
      expect(find.textContaining('perfil, com @'), findsOneWidget);
    });
  });

  group('as recusas', () {
    testWidgets('sem conta: a RECUSA continua no app, e não foi apagada',
        (tester) async {
      // ESTE CASO MUDOU DE AFIRMAÇÃO em 18/10, e o que ele media antes está
      // escrito aqui para não se perder: deslogado, a porta aparecia, o toque
      // abria o formulário, e o formulário dizia "Entre para indicar." com
      // `Entrar` como saída. O cliente decidiu que a porta **nem aparece**
      // nesse estado, e com isso esta suíte perdeu o caminho até a recusa:
      // `abrirOApp` não oferece rota inicial, então não há como abrir o
      // formulário deslogado de dentro daqui.
      //
      // **O que ele NÃO decidiu foi apagar a recusa**, e ela não foi apagada:
      // `_Impedimento.semConta` e a faixa com `Entrar` seguem em
      // `sugerir_profissional.dart`, intocados, para quem chegar à rota por
      // link profundo. O que este caso mede agora é exatamente isso — que o
      // texto da recusa continua existindo no código —, e a afirmação sobre a
      // TELA montada ficou pendente de alguém dar rota inicial ao ajudante.
      // Está dito em vez de escondido.
      expect(
        TelaSugerirProfissional.entreParaIndicar,
        'Entre para indicar.',
        reason: 'REPROVA: a frase da recusa sem conta saiu do app. A porta '
            'deixou de convidar quem não entrou, mas a rota continua '
            'alcançável por link profundo, e tela que recusa calada é pior '
            'que tela que recusa dizendo.',
      );
    });

    testWidgets('o 400 nomeado marca o campo do contato', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaIndicacao: () => problema(
            'validation-failed',
            400,
            extra: <String, dynamic>{
              'errors': <Map<String, dynamic>>[
                <String, dynamic>{
                  'field': 'public_contact.value',
                  'code': 'invalid_phone',
                  'message': 'Telefone com DDD, começando por +55.',
                },
              ],
            },
          ),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(
        find.text('Telefone com DDD, começando por +55.'),
        findsOneWidget,
        reason: 'REPROVA: a recusa saiu como faixa genérica e o campo ficou '
            'sem marca.',
      );
    });

    testWidgets('o 429 por conta não vira erro genérico de rede',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaIndicacao: () => problema('rate-limited', 429),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      // A faixa de erro e o SEGUNDO filho do `ListView` da tela
      // (`sugerir_profissional.dart`, linhas 417-431), e o formulario ficou
      // rolado para baixo depois de preenchido: o `ListView` nao mantem
      // construido o que saiu da tela, e `find` nao enxerga o que nao existe.
      // Rolar PARA CIMA e o que a pessoa faz -- e e para isso que o `passo`
      // negativo de `rolarAte` existe (`ajuda_de_tela.dart`, linhas 711-730).
      await rolarAte(tester, find.textContaining('Espere um pouco'), passo: -120);
      expect(
        find.textContaining('Espere um pouco'),
        findsOneWidget,
        reason: 'REPROVA: o 429 saiu como "servidor fora". Indicar cria '
            'trabalho humano de revisão, e o teto por conta é o orçamento '
            'dessa fila: a pessoa precisa saber que é para esperar.',
      );
    });
  });
}
