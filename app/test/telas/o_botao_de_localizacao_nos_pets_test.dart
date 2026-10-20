// `Usar minha localização` NA SEÇÃO PETS -- o defeito de 20/10/2026.
//
// Cliente, com o APK de release de `fb3a0fba` no aparelho: *"o botão de usar
// minha localização na seção do pets não esta funcionando"*.
//
// **A CAUSA, medida aqui e não deduzida.** `_resolverEAplicar` era um método só
// para os dois chamadores -- a resolução de ABERTURA e o TOQUE --, e o guarda
// `if (_pessoaMexeu) return;` descartava o resultado do toque. Quem digita uma
// cidade no filtro, ou toca `Ver todas`, fica com `_pessoaMexeu` verdadeiro
// pelo resto da sessão: dali em diante o botão continua oferecido e habilitado,
// o toque pede a permissão ao sistema, gasta uma resolução do teto de uso da
// plataforma, recebe a cidade -- e não troca um pixel. É o que `ISCA DA CAUSA
// a` e `ISCA DA CAUSA b` medem, e são elas que reproduzem o relato.
//
// **O DEFEITO DE PRODUTO ATRÁS DO RELATO.** A cadeia de reserva foi desenhada
// para nunca travar a tela, e o preço era o toque ter QUATRO desfechos mudos.
// `ISCA 1/4` a `ISCA 4/4` armam um por um, com a frase inteira escrita à mão --
// uma representando as outras não serviria, porque a prova que se quer é
// justamente que não são quatro redações do mesmo caso.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante que
// o produz.** As quatro frases estão por extenso, com acento e pontuação:
// trocar a microcopia reprova, que é o ponto.
//
// **A VACUIDADE QUE ESTE ARQUIVO PRECISA EVITAR** é a frase que aparece porque
// a tela sempre a desenha. `CONTRAPESO: a resolução de ABERTURA continua muda`
// é o caso que a pega: com as quatro frases penduradas na existência da tela em
// vez de no toque, ele reprova.

import 'dart:async';

import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perdidos_e_meus_achados_test.dart' as massa;

// ---------------------------------------------------------------------------
// As quatro frases, POR EXTENSO
// ---------------------------------------------------------------------------

const String fraseSemPermissao =
    'A localização não está liberada para o Bichu. Dá para liberar nos '
    'ajustes do aparelho, ou escolher a cidade no filtro.';

const String fraseServicoDesligado =
    'A localização do aparelho está desligada. Dá para ligar nos ajustes, '
    'ou escolher a cidade no filtro.';

const String fraseCidadeNaoDescoberta =
    'Não deu para descobrir sua cidade agora. Dá para tentar de novo, ou '
    'escolher a cidade no filtro.';

String fraseSemPetsEm(String cidade) =>
    'A localização funcionou: você está em $cidade. Não há nenhum pet '
    'perdido cadastrado aí agora.';

const String fraseProcurando = 'Procurando sua localização…';

const String oBotao = 'Usar minha localização';

/// As quatro frases juntas. Serve aos contrapesos: `findsNothing` sobre as
/// quatro de uma vez é o que prova que a tela está MUDA, e não que ela trocou
/// uma frase pela outra.
List<String> get asQuatroFrases => <String>[
      fraseSemPermissao,
      fraseServicoDesligado,
      fraseCidadeNaoDescoberta,
      fraseSemPetsEm('Sao Paulo'),
    ];

// ---------------------------------------------------------------------------
// A porta que SEGURA a resolução
// ---------------------------------------------------------------------------

/// Uma localização cuja resolução de cidade **não responde até alguém mandar**.
///
/// Existe para um caso que nenhum dublê de resposta imediata alcança: o que a
/// tela mostra ENQUANTO o aparelho mede. No aparelho esse intervalo gasta até
/// os doze segundos de `prazoDaResolucao` mais a ida ao serviço de plataforma,
/// e doze segundos sem nada na tela são doze segundos em que o botão "não está
/// funcionando".
class LocalizacaoQueDemora implements Localizacao {
  LocalizacaoQueDemora(this.cidade);

  final String cidade;
  final Completer<ResultadoDaCidade> pendente = Completer<ResultadoDaCidade>();

  @override
  Future<PermissaoDeLocalizacao> estado() async =>
      PermissaoDeLocalizacao.concedida;

  @override
  Future<PermissaoDeLocalizacao> pedir() async =>
      PermissaoDeLocalizacao.concedida;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<bool> servicoLigado() async => true;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo}) async =>
      const CapturaSemPonto(MotivoDeNaoTerPonto.semFixNoPrazo);

  @override
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo}) =>
      pendente.future;

  void responder() => pendente.complete(CidadeResolvida(cidade));
}

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------

/// Abre a seção `Pets` com a rede da listagem e a porta de localização dada.
///
/// `logado: false` é o padrão de propósito: sem conta não há
/// `Me.reference_area.city`, então a segunda reserva da cadeia não entra e o
/// que se mede é o caminho do aparelho, sozinho.
Future<void> abrir(
  WidgetTester tester, {
  required Localizacao localizacao,
  required List<http.Request> pedidos,
  List<Map<String, dynamic>>? itens,
  bool logado = false,
}) async {
  await massa.abrirPets(
    tester,
    logado: logado,
    localizacao: localizacao,
    rede: massa.redeDosPerdidos(
      massa.paginaDePerdidos(
        itens ??
            <Map<String, dynamic>>[
              massa.perdidoDoContrato(vistoEm: '2026-10-16T12:00:00.000Z'),
            ],
      ),
      pedidos: pedidos,
    ),
  );
}

/// As cidades que de fato saíram na consulta, na ordem. Nulo é "sem `city`".
List<String?> cidadesPedidas(List<http.Request> pedidos) =>
    <String?>[for (final p in pedidos) p.url.queryParameters['city']];

void main() {
  // -------------------------------------------------------------------------
  // 1. A CAUSA: O TOQUE GANHA DO QUE A PESSOA DIGITOU ANTES
  // -------------------------------------------------------------------------
  group('o toque em `$oBotao` tem efeito depois de a pessoa mexer', () {
    testWidgets(
      'ISCA DA CAUSA a: com uma cidade DIGITADA, o toque troca o recorte',
      (tester) async {
        // **ESTE É O CASO QUE REPRODUZ O RELATO DO CLIENTE.** Ele passa pelo
        // caminho mais comum de quem toca nesse botão: já estava vendo a lista
        // de outra cidade e quer a de onde está.
        //
        // DESLIGANDO: em `_resolverEAplicar`
        // (`lib/telas/perdido/lista_de_perdidos.dart`), troque o bloco
        // `if (porToque) { _pessoaMexeu = false; ... }` pelo guarda antigo
        // `if (_pessoaMexeu) return;`. A permissão continua sendo pedida e a
        // cidade continua sendo resolvida -- o que para é a tela.
        final pedidos = <http.Request>[];
        final porta = LocalizacaoDeTeste(
          PermissaoDeLocalizacao.naoPedida,
          depoisDePedir: PermissaoDeLocalizacao.concedida,
        );
        await abrir(tester, localizacao: porta, pedidos: pedidos);

        await massa.escolherCidade(tester, 'Campinas');
        expect(
          cidadesPedidas(pedidos),
          <String?>[null, 'Campinas'],
          reason: 'REPROVA: digitar a cidade não recortou. O caso desta isca '
              'depende de a pessoa ter mexido no filtro ANTES do toque.',
        );

        await tester.tap(find.text(oBotao));
        await tester.pumpAndSettle();

        expect(
          porta.vezesQueResolveu,
          1,
          reason: 'REPROVA: o toque não chegou a resolver a cidade. Esta isca '
              'mede o DESCARTE do resultado, e sem resolução não há o que '
              'descartar -- o defeito é outro.',
        );
        expect(
          cidadesPedidas(pedidos),
          <String?>[null, 'Campinas', 'Sao Paulo'],
          reason: 'REPROVA: o toque resolveu a cidade e a lista NÃO foi '
              'refeita com ela. É o defeito de 20/10/2026: `_pessoaMexeu` '
              'ficou verdadeiro desde o filtro e o resultado do toque foi '
              'jogado fora.',
        );
        expect(
          find.text('Pets perdidos em Sao Paulo · da sua localização'),
          findsOneWidget,
          reason: 'REPROVA: a linha do recorte não passou a dizer a cidade do '
              'aparelho, então a tela não conta que o toque funcionou.',
        );
        expect(
          find.text('Pets perdidos em Campinas'),
          findsNothing,
          reason: 'REPROVA: a tela continua afirmando a cidade digitada '
              'depois de a localização ter ganho dela.',
        );
      },
    );

    testWidgets(
      'ISCA DA CAUSA b: depois de `Ver todas`, o toque devolve o recorte',
      (tester) async {
        // O segundo caminho que leva alguém a tocar: tirou o recorte para ver
        // tudo, se arrependeu, quer o de perto de volta. `Ver todas` também
        // marca `_pessoaMexeu`, então o botão ficava inerte igual.
        //
        // DESLIGANDO: o mesmo de `ISCA DA CAUSA a`.
        final pedidos = <http.Request>[];
        final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
        await abrir(
          tester,
          localizacao: porta,
          pedidos: pedidos,
          logado: true,
        );
        expect(
          find.text('Pets perdidos em Sao Paulo · da sua localização'),
          findsOneWidget,
          reason: 'REPROVA: a resolução de abertura não aplicou a cidade, e '
              'esta isca precisa dela para poder tirá-la.',
        );

        await tester.tap(find.text('Ver todas'));
        await tester.pumpAndSettle();
        expect(find.text('Pets perdidos de todo o Brasil'), findsOneWidget);

        await tester.tap(find.text(oBotao));
        await tester.pumpAndSettle();

        expect(
          cidadesPedidas(pedidos).last,
          'Sao Paulo',
          reason: 'REPROVA: depois de `Ver todas`, o toque em `$oBotao` não '
              'devolveu o recorte da cidade do aparelho. A pessoa fica sem '
              'caminho de volta pelo resto da sessão.',
        );
        expect(
          find.text('Pets perdidos em Sao Paulo · da sua localização'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'CONTRAPESO: a resolução de ABERTURA continua perdendo do filtro',
      (tester) async {
        // **O guarda `_pessoaMexeu` NÃO foi removido, ele foi separado.** Na
        // abertura ele continua valendo, e tem de continuar: trocar a lista
        // debaixo de quem acabou de digitar é o pior desfecho possível.
        //
        // Sem este caso, o conserto da causa poderia ter sido apagar o guarda
        // -- o que consertaria o toque e quebraria a abertura.
        //
        // DESLIGANDO: tire o `else { if (_pessoaMexeu) return; ... }` de
        // `_resolverEAplicar` e deixe o caminho único.
        final pedidos = <http.Request>[];
        final porta = LocalizacaoQueDemora('Sao Paulo');
        await abrir(tester, localizacao: porta, pedidos: pedidos);

        // A resolução de abertura está no ar e pendurada. A pessoa digita.
        await massa.escolherCidade(tester, 'Campinas');
        expect(cidadesPedidas(pedidos).last, 'Campinas');

        // Agora o aparelho responde, TARDE.
        porta.responder();
        await tester.pumpAndSettle();

        expect(
          cidadesPedidas(pedidos).last,
          'Campinas',
          reason: 'REPROVA: a resolução de abertura chegou atrasada e trocou a '
              'lista debaixo de quem acabou de escolher Campinas.',
        );
        expect(find.text('Pets perdidos em Campinas'), findsOneWidget);
      },
    );
  });

  // -------------------------------------------------------------------------
  // 2. AS QUATRO FRASES, UMA ISCA CADA
  // -------------------------------------------------------------------------
  group('o toque em `$oBotao` nunca falha em silêncio', () {
    testWidgets('ISCA 1/4: a permissão RECUSADA tem frase própria',
        (tester) async {
      // DESLIGANDO: em `_pedirEResolver`
      // (`lib/telas/perdido/lista_de_perdidos.dart`), troque o `case`
      // `negada`/`negadaPermanentemente`/`naoPedida` por `return;` seco -- que
      // é o que havia até 20/10/2026 (`if (depois != concedida) return;`).
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.negada,
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        porta.vezesQuePediu,
        1,
        reason: 'REPROVA: o toque não pediu a permissão ao sistema. No Android '
            'o pedido em tempo de execução é obrigatório, e sem ele a leitura '
            'falha por um motivo diferente do que esta isca mede.',
      );
      expect(
        find.text(fraseSemPermissao),
        findsOneWidget,
        reason: 'REPROVA: a pessoa recusou e a tela não disse nada. Para ela o '
            'botão não funcionou.',
      );
      expect(
        find.text('Abrir os ajustes'),
        findsOneWidget,
        reason: 'REPROVA: a frase diz que dá para liberar nos ajustes e não '
            'há como ir até eles.',
      );
      // A frase NÃO acusa a pessoa: nem "você negou", nem "você precisa".
      expect(fraseSemPermissao.toLowerCase().contains('você'), isFalse);
    });

    testWidgets('ISCA 2/4: o SERVIÇO DESLIGADO tem frase própria',
        (tester) async {
      // Separada da 1/4 porque a ação é outra: mandar quem desligou a
      // localização nos ajustes procurar uma permissão já concedida é o defeito
      // que `servicoLigado()` existe, apartado de `estado()`, para não cometer.
      //
      // DESLIGANDO: em `_resolverEAplicar`, faça o braço
      // `MotivoDeNaoTerCidade.servicoDesligado` cair em
      // `_AvisoDaLocalizacao.cidadeNaoDescoberta`. Este caso reprova por achar
      // a frase errada, e `ISCA 3/4` continua passando -- que é a prova de que
      // as duas não são a mesma redação.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        servico: false,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.servicoDesligado),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        find.text(fraseServicoDesligado),
        findsOneWidget,
        reason: 'REPROVA: o serviço do aparelho está desligado e a tela não '
            'disse qual é o caminho.',
      );
      expect(
        find.text(fraseSemPermissao),
        findsNothing,
        reason: 'REPROVA: a tela mandou quem desligou a localização procurar '
            'uma permissão que ela já concedeu.',
      );
    });

    testWidgets('ISCA 3/4: a CIDADE QUE NÃO SAI tem frase própria',
        (tester) async {
      // `tetoDeUsoEstourado` é o `PlatformException(IO_ERROR)` que o README do
      // `geocoding` descreve, e sob volume ele é o caminho NORMAL e não o
      // excepcional. O geocoder ausente (`isPresent()` falso no Android sem
      // Play Services) e a resolução sem resultado caem na mesma frase: as três
      // são de fora do app e as três têm a mesma saída.
      //
      // DESLIGANDO: em `_resolverEAplicar`, reponha o `case
      // CidadeNaoResolvida(): return;` sem o `switch` dos motivos.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.tetoDeUsoEstourado),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        find.text(fraseCidadeNaoDescoberta),
        findsOneWidget,
        reason: 'REPROVA: o teto de uso da plataforma estourou e a tela ficou '
            'muda. É o desfecho que o cliente mais provavelmente viu.',
      );
      expect(
        find.text('Tentar a localização de novo'),
        findsOneWidget,
        reason: 'REPROVA: a frase oferece tentar de novo e não há o controle.',
      );
      expect(
        find.text('Pets perdidos de todo o Brasil'),
        findsOneWidget,
        reason: 'REPROVA: a reserva deixou de valer. A frase explica a '
            'reserva, ela não substitui a reserva.',
      );
    });

    testWidgets('ISCA 4/4: cidade DESCOBERTA e SEM PET tem frase própria',
        (tester) async {
      // **A única das quatro que afirma SUCESSO**, e ela existe porque o
      // desfecho bom com lista vazia é indistinguível do botão não ter feito
      // nada: a linha do recorte troca de cidade e o corpo continua dizendo
      // que não há pet nenhum.
      //
      // DESLIGANDO: tire o bloco `if (_fase == _Fase.lista && _itens.isEmpty)`
      // do fim de `_resolverEAplicar`.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.concedida,
      );
      await abrir(
        tester,
        localizacao: porta,
        pedidos: pedidos,
        itens: const <Map<String, dynamic>>[],
      );

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        cidadesPedidas(pedidos).last,
        'Sao Paulo',
        reason: 'REPROVA: o toque não refez a lista com a cidade resolvida, '
            'então o que esta isca mede não aconteceu.',
      );
      expect(
        find.text(fraseSemPetsEm('Sao Paulo')),
        findsOneWidget,
        reason: 'REPROVA: a localização funcionou, a cidade não tem caso '
            'aberto, e a tela não disse a diferença entre as duas coisas.',
      );
      expect(
        find.text(fraseCidadeNaoDescoberta),
        findsNothing,
        reason: 'REPROVA: a tela disse que não descobriu a cidade logo depois '
            'de descobri-la e nomeá-la na linha do recorte.',
      );
    });

    testWidgets('ISCA: `negadaPermanentemente` abre os ajustes E fala',
        (tester) async {
      // Abrir os ajustes já era o certo -- pedir de novo não abre diálogo
      // nenhum. O que faltava era a tela DIZER: quem volta dos ajustes sem
      // liberar, e quem nem chega a sair do app, lia o nada.
      //
      // DESLIGANDO: no braço `negadaPermanentemente` de `_pedirEResolver`,
      // tire o `setState` e deixe só `await porta.abrirAjustesDoSistema()`.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.negadaPermanentemente,
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        porta.abriuAjustes,
        isTrue,
        reason: 'REPROVA: recusa definitiva e os ajustes não abriram. Pedir de '
            'novo não abre diálogo nenhum, então não há outro caminho.',
      );
      expect(
        porta.vezesQuePediu,
        0,
        reason: 'REPROVA: o app pediu a permissão com a recusa definitiva na '
            'mesa. O diálogo não abre, e a pessoa fica esperando um diálogo '
            'que não vem.',
      );
      expect(
        find.text(fraseSemPermissao),
        findsOneWidget,
        reason: 'REPROVA: os ajustes abriram e a tela não explicou por quê.',
      );
    });

    testWidgets('ISCA: a tela diz `$fraseProcurando` ENQUANTO mede',
        (tester) async {
      // O aparelho pode gastar os doze segundos de `prazoDaResolucao` mais a
      // ida ao serviço de plataforma. Sem esta frase, o intervalo inteiro é
      // "o botão não está funcionando".
      //
      // DESLIGANDO: tire o `setState(() => _aviso = procurando)` do começo de
      // `_pedirEResolver`.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoQueDemora('Sao Paulo');
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pump();
      await tester.pump();

      expect(
        find.text(fraseProcurando),
        findsOneWidget,
        reason: 'REPROVA: o toque foi recebido e a tela não mudou nada. É o '
            'relato do cliente ao pé da letra.',
      );
      final botao = tester.widget<TextButton>(
        find.widgetWithText(TextButton, oBotao),
      );
      expect(
        botao.onPressed,
        isNull,
        reason: 'REPROVA: o botão continua habilitado durante a medição. Um '
            'segundo toque pede a permissão de novo e gasta o teto de uso da '
            'plataforma de novo, pela mesma resposta.',
      );

      porta.responder();
      await tester.pumpAndSettle();

      expect(
        find.text(fraseProcurando),
        findsNothing,
        reason: 'REPROVA: a resolução chegou e a tela continua dizendo que '
            'está procurando.',
      );
      expect(cidadesPedidas(pedidos).last, 'Sao Paulo');
    });
  });

  // -------------------------------------------------------------------------
  // 3. OS CONTRAPESOS DE VACUIDADE
  // -------------------------------------------------------------------------
  group('as quatro frases vêm do TOQUE, e não da existência da tela', () {
    testWidgets('CONTRAPESO: a resolução de ABERTURA continua muda',
        (tester) async {
      // **ESTE É O CASO ANTIVACUIDADE.** Com as quatro frases penduradas na
      // existência da tela em vez de no toque, ele reprova -- e sem ele as
      // quatro iscas acima passariam com a faixa desenhada sempre.
      //
      // A assimetria é decisão: na abertura ninguém pediu nada, e faixa ali
      // seria erro inventado em cima de uma reserva que o ADR chama de reserva.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.tetoDeUsoEstourado),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      expect(
        porta.vezesQueResolveu,
        1,
        reason: 'REPROVA: a abertura não tentou resolver, então não há '
            'silêncio a medir -- o mecanismo desta prova está desligado.',
      );
      for (final frase in asQuatroFrases) {
        expect(
          find.text(frase),
          findsNothing,
          reason: 'REPROVA: a tela pintou "$frase" sem ninguém ter tocado em '
              '`$oBotao`. A faixa está pendurada na existência da tela, e as '
              'quatro iscas acima passam por nada.',
        );
      }
      expect(find.text(fraseProcurando), findsNothing);
      expect(
        find.text('Pets perdidos de todo o Brasil'),
        findsOneWidget,
        reason: 'REPROVA: a reserva da abertura deixou de valer.',
      );
    });

    testWidgets('CONTRAPESO: resolveu e TEM pet -- nenhuma frase aparece',
        (tester) async {
      // O desfecho bom não ganha faixa: a linha do recorte já diz a cidade e a
      // origem dela, e repetir "deu certo" seria o app comentando o óbvio.
      // Sem este caso, `ISCA 4/4` poderia ser satisfeita por uma frase que
      // aparece em todo toque bem-sucedido.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.concedida,
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(find.byType(CartaoDoPerdido), findsOneWidget);
      for (final frase in asQuatroFrases) {
        expect(
          find.text(frase),
          findsNothing,
          reason: 'REPROVA: o toque deu certo, a lista tem pet, e a tela '
              'pintou "$frase".',
        );
      }
    });

    testWidgets('CONTRAPESO: mexer no filtro APAGA a frase do toque anterior',
        (tester) async {
      // A faixa falava do toque, e o recorte acabou de trocar: manter a frase
      // a transformaria em afirmação sobre uma lista que ela não descreve.
      //
      // DESLIGANDO: tire `_aviso = null;` de `_aplicarAFolha`.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.semResultado),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();
      expect(find.text(fraseCidadeNaoDescoberta), findsOneWidget);

      await massa.escolherCidade(tester, 'Campinas');

      expect(
        find.text(fraseCidadeNaoDescoberta),
        findsNothing,
        reason: 'REPROVA: a tela continua dizendo que não descobriu a cidade '
            'depois de a pessoa ter escolhido uma.',
      );
      expect(find.text('Pets perdidos em Campinas'), findsOneWidget);
    });

    testWidgets('ISCA: a resolução que NUNCA responde desiste e FALA',
        (tester) async {
      // **A LACUNA QUE O PRÓPRIO CONSERTO ABRIRIA.** `Procurando sua
      // localização…` é frase boa e vira defeito novo se não tiver teto:
      // `cidadeAproximada` repassa o prazo ao `timeLimit` do `geolocator` e
      // depois chama `isPresent()` e `placemarkFromCoordinates` **sem prazo
      // nenhum** -- varrido em 20/10/2026, zero ocorrência de `timeout` no
      // `geocoding` e no `geocoding_android`. Enquanto o toque não dizia nada,
      // pendurar era invisível; com a frase na tela, pendurar é uma frase que
      // nunca sai, e isso é pior que o silêncio que esta frente consertou.
      //
      // DESLIGANDO: tire o `.timeout(tetoDaEsperaDaResolucao, ...)` de
      // `_resolverEAplicar`. Este caso reprova continuando a dizer
      // `$fraseProcurando` depois de minutos de relógio.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoQueDemora('Sao Paulo');
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pump();
      expect(find.text(fraseProcurando), findsOneWidget);

      // O aparelho NUNCA responde. O relógio anda.
      await tester.pump(const Duration(seconds: 25));
      await tester.pumpAndSettle();

      expect(
        find.text(fraseProcurando),
        findsNothing,
        reason: 'REPROVA: a tela ficou pendurada em "$fraseProcurando". O '
            'canal de plataforma do geocoder não tem prazo em pacote nenhum, '
            'então quem não põe teto aqui põe uma frase que nunca sai.',
      );
      expect(
        find.text(fraseCidadeNaoDescoberta),
        findsOneWidget,
        reason: 'REPROVA: a espera estourou e a tela não disse o que '
            'aconteceu. Desistir calado é o defeito de origem desta frente.',
      );
      expect(
        find.text('Pets perdidos de todo o Brasil'),
        findsOneWidget,
        reason: 'REPROVA: a reserva deixou de valer depois do estouro.',
      );
    });

    testWidgets('CONTRAPESO: as quatro frases são QUATRO textos distintos',
        (tester) async {
      // Não é cerimônia: a exigência era quatro mensagens diferentes, todas
      // verdadeiras, nenhuma genérica. Duas constantes iguais passariam nas
      // quatro iscas acima e não cumpririam nada disso.
      final distintas = asQuatroFrases.toSet();
      expect(
        distintas,
        hasLength(4),
        reason: 'REPROVA: duas das quatro frases são o mesmo texto.',
      );
      for (final frase in asQuatroFrases) {
        expect(
          frase.toLowerCase(),
          isNot(contains('erro')),
          reason: 'REPROVA: "$frase" chama de erro o que é reserva.',
        );
      }
    });
  });
}

