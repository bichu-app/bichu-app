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
import 'package:bichu/sessao/cidade_escolhida.dart';
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
  String? cidadeGuardada,
}) async {
  await massa.abrirPets(
    tester,
    logado: logado,
    localizacao: localizacao,
    // **Cidade JA guardada neste aparelho**, que e o estado da SEGUNDA sessao
    // de qualquer pessoa: `CidadeEscolhida` grava a cidade de toda busca. Ele
    // nao se produz passando pelo fluxo, e e o estado em que a caixa do
    // recorte some mais facil por engano.
    depositoDaCidade: cidadeGuardada == null
        ? null
        : DepositoDaCidadeEmMemoria(conteudo: cidadeGuardada),
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

/// A CAIXA DO RECORTE, achada pela linha que so ela desenha.
///
/// `_LinhaDoRecorte` e privada, e achar pelo TIPO exigiria exporta-la. A linha
/// "Pets perdidos em X" / "Pets perdidos de todo o Brasil" e o que ela e: a
/// resposta a "por que estes pets?". Quem apagar a caixa apaga a linha, e e a
/// linha que estes casos procuram.
Finder get aCaixaDoRecorte => find.byWidgetPredicate(
      (w) =>
          w is Text &&
          (w.data == 'Pets perdidos de todo o Brasil' ||
              (w.data?.startsWith('Pets perdidos em ') ?? false)),
      description: 'a caixa do recorte (a linha "Pets perdidos ...")',
    );

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
        // **O QUE A TELA MOSTRA MUDOU EM 20/10/2026, e o que esta isca mede
        // NAO mudou.** Ela media a linha do recorte dizendo
        // `Pets perdidos em Sao Paulo · da sua localização`; o cliente pediu
        // que a caixa inteira saisse depois de a localizacao funcionar (*"deve
        // apenas aparecer dentro do filtro a cidade selecionada"*). O sinal da
        // CAUSA continua sendo o mesmo e esta medido acima: a consulta saiu com
        // a cidade do aparelho. O que se mede aqui agora e o desfecho visivel
        // novo -- e ele e mais forte que o antigo, porque a caixa so sai quando
        // a cidade do aparelho de fato valeu.
        expect(
          aCaixaDoRecorte,
          findsNothing,
          reason: 'REPROVA: a localização ganhou da cidade digitada e a caixa '
              'do recorte continua na tela. Ver `_caixaDoRecorteAparece`.',
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
        // **A ABERTURA JA RESOLVEU, e desde 20/10/2026 o sinal disso e a
        // AUSENCIA da caixa** (ver `_caixaDoRecorteAparece`): a cidade do
        // aparelho esta valendo e a caixa nao tem mais o que oferecer. Era
        // `find.text('Pets perdidos em Sao Paulo · da sua localização')`.
        expect(
          aCaixaDoRecorte,
          findsNothing,
          reason: 'REPROVA: a resolução de abertura não aplicou a cidade, e '
              'esta isca precisa dela para poder tirá-la.',
        );
        expect(
          cidadesPedidas(pedidos).last,
          'Sao Paulo',
          reason: 'REPROVA: a abertura não recortou pela cidade do aparelho. '
              'Sem o recorte não há o que `Ver todas` tire.',
        );
        // **E A SAIDA DE VOLTA AO NACIONAL E O FILTRO**, porque `Ver todas`
        // mora dentro da caixa que acabou de sair. Abrir a folha e esvaziar o
        // campo de cidade e o caminho que a pessoa tem, e e ele que este caso
        // exerce de agora em diante.
        await massa.escolherCidade(tester, '');

        // SEM CIDADE, A CAIXA VOLTA -- e com ela o botao. Este `expect` e o
        // que garante que a pessoa que tirou o recorte NAO ficou sem caminho
        // de volta: a caixa que sai no desfecho bom tem de reaparecer quando o
        // desfecho bom e desfeito.
        expect(
          aCaixaDoRecorte,
          findsOneWidget,
          reason: 'REPROVA: a pessoa esvaziou a cidade no filtro, não há mais '
              'recorte, e a caixa não voltou. Ela ficou sem a linha que '
              'explica a lista e sem `$oBotao` -- caixa que some sem deixar '
              'caminho é pior que caixa que fica.',
        );
        expect(find.text('Pets perdidos de todo o Brasil'), findsOneWidget);
        expect(cidadesPedidas(pedidos).last, isNull);

        await tester.tap(find.text(oBotao));
        await tester.pumpAndSettle();

        expect(
          cidadesPedidas(pedidos).last,
          'Sao Paulo',
          reason: 'REPROVA: depois de esvaziar a cidade no filtro, o toque em '
              '`$oBotao` não devolveu o recorte da cidade do aparelho. A '
              'pessoa fica sem caminho de volta pelo resto da sessão.',
        );
        expect(
          aCaixaDoRecorte,
          findsNothing,
          reason: 'REPROVA: o toque devolveu o recorte e a caixa continua na '
              'tela.',
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
        find.textContaining(fraseSemPermissao),
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
        find.textContaining(fraseServicoDesligado),
        findsOneWidget,
        reason: 'REPROVA: o serviço do aparelho está desligado e a tela não '
            'disse qual é o caminho.',
      );
      expect(
        find.textContaining(fraseSemPermissao),
        findsNothing,
        reason: 'REPROVA: a tela mandou quem desligou a localização procurar '
            'uma permissão que ela já concedeu.',
      );
    });

    testWidgets('ISCA 3/4: a CIDADE QUE NÃO SAI tem frase própria',
        (tester) async {
      // `falhaDoServico` (era `tetoDeUsoEstourado` até 20/10/2026) é qualquer
      // falha da chamada ao serviço de plataforma. No Android é quase sempre o
      // `IO_ERROR` de teto de uso; no iOS é TUDO, porque o
      // `CLGeocoderProxyApiDelegate.swift` colapsa todo `NSError` do
      // `CLGeocoder` num código só. Ele, o geocoder ausente e as duas
      // desistências por tempo caem nesta frase: as cinco são de fora do app e
      // as cinco têm a mesma saída.
      //
      // **`semResultado` NÃO está mais neste grupo**: ele ganhou frase própria,
      // porque nele nada deu errado. Ver a isca da frase 5.
      //
      // DESLIGANDO: em `_resolverEAplicar`, reponha o `case
      // CidadeNaoResolvida(): return;` sem o `switch` dos motivos.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.falhaDoServico),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        find.textContaining(fraseCidadeNaoDescoberta),
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
        find.textContaining(fraseSemPetsEm('Sao Paulo')),
        findsOneWidget,
        reason: 'REPROVA: a localização funcionou, a cidade não tem caso '
            'aberto, e a tela não disse a diferença entre as duas coisas.',
      );
      expect(
        find.textContaining(fraseCidadeNaoDescoberta),
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
        find.textContaining(fraseSemPermissao),
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
        find.textContaining(fraseProcurando),
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
        find.textContaining(fraseProcurando),
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
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.falhaDoServico),
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
          find.textContaining(frase),
          findsNothing,
          reason: 'REPROVA: a tela pintou "$frase" sem ninguém ter tocado em '
              '`$oBotao`. A faixa está pendurada na existência da tela, e as '
              'quatro iscas acima passam por nada.',
        );
      }
      expect(find.textContaining(fraseProcurando), findsNothing);
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
          find.textContaining(frase),
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
        // `falhaDoServico` e nao `semResultado`: este caso mede a faixa sendo
        // APAGADA, e `semResultado` ganhou frase propria em 20/10/2026.
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.falhaDoServico),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();
      expect(find.textContaining(fraseCidadeNaoDescoberta), findsOneWidget);

      await massa.escolherCidade(tester, 'Campinas');

      expect(
        find.textContaining(fraseCidadeNaoDescoberta),
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
      expect(find.textContaining(fraseProcurando), findsOneWidget);

      // O aparelho NUNCA responde. O relógio anda.
      await tester.pump(const Duration(seconds: 25));
      await tester.pumpAndSettle();

      expect(
        find.textContaining(fraseProcurando),
        findsNothing,
        reason: 'REPROVA: a tela ficou pendurada em "$fraseProcurando". O '
            'canal de plataforma do geocoder não tem prazo em pacote nenhum, '
            'então quem não põe teto aqui põe uma frase que nunca sai.',
      );
      expect(
        find.textContaining(fraseCidadeNaoDescoberta),
        findsOneWidget,
        reason: 'REPROVA: a espera estourou e a tela não disse o que '
            'aconteceu. Desistir calado é o defeito de origem desta frente.',
      );
      // **E O CÓDIGO DIZ QUAL DOS DOIS PRAZOS ESTOUROU.**
      //
      // DESLIGANDO: troque o motivo do `onTimeout` de volta para
      // `semFixNoPrazo`. Este caso reprova pelo nome, e sem ele o teto DE FORA
      // continuaria se declarando "o aparelho não fixou" -- que é o outro
      // prazo, o de dentro da porta, e tem conserto diferente.
      expect(
        find.textContaining(
          MotivoDeNaoTerCidade.resolucaoSemResposta.codigo,
        ),
        findsOneWidget,
        reason: 'REPROVA: o teto de fora se reportou como outro motivo. "o GPS '
            'não pegou" e "o serviço de plataforma não respondeu" chegam como '
            'o mesmo relato, e foi exatamente assim que o caso de 20/10/2026 '
            'ficou sem diagnóstico.',
      );
      expect(
        find.textContaining(MotivoDeNaoTerCidade.semFixNoPrazo.codigo),
        findsNothing,
        reason: 'REPROVA: a tela culpou o fix do aparelho por uma desistência '
            'que foi do serviço de plataforma.',
      );
      expect(
        find.text('Pets perdidos de todo o Brasil'),
        findsOneWidget,
        reason: 'REPROVA: a reserva deixou de valer depois do estouro.',
      );
    });

    testWidgets(
        'ISCA: a frase 5 é do PONTO QUE VEIO SEM NOME, e não oferece tentar '
        'de novo', (tester) async {
      // **O DESENHO QUE O RELATO DE 20/10/2026 OBRIGOU A SEPARAR.** Em
      // `semResultado` nada deu errado: a plataforma respondeu, descreveu o
      // lugar, e nome de cidade não veio. A lista nacional dos 20 mais
      // recentes já está pintada pela reserva -- chamar isso de "não deu"
      // ensina a pessoa a desconfiar de uma tela que está funcionando.
      //
      // E `Tentar a localização de novo` ali é pior que inútil: tentar no
      // mesmo ponto devolve o mesmo nada e gasta o teto de uso da plataforma.
      //
      // DESLIGANDO: mande `semResultado` de volta para
      // `_AvisoDaLocalizacao.cidadeNaoDescoberta` no `switch` de
      // `_resolverEAplicar`. Este caso reprova pelo nome nas duas asserções.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade:
            const CidadeNaoResolvida(MotivoDeNaoTerCidade.semResultado),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('não deu para nomear sua cidade'),
        findsOneWidget,
        reason: 'REPROVA: veio ponto e não veio nome, e a tela chamou de falha '
            'uma reserva que funcionou.',
      );
      expect(
        find.textContaining(fraseCidadeNaoDescoberta),
        findsNothing,
        reason: 'REPROVA: `semResultado` continua na frase dos cinco motivos '
            'de falha, e ele não é falha.',
      );
      expect(
        find.text('Tentar a localização de novo'),
        findsNothing,
        reason: 'REPROVA: a tela ofereceu tentar de novo no mesmo ponto, que '
            'devolve o mesmo nada e gasta o teto de uso da plataforma.',
      );
      expect(
        find.text('Pets perdidos de todo o Brasil'),
        findsOneWidget,
        reason: 'REPROVA: a frase afirma que a lista nacional está embaixo '
            'dela, e ela não está.',
      );
    });

    testWidgets(
        'ISCA: a faixa do toque carrega o CÓDIGO do motivo, porque o aparelho '
        'de quem relata é o único instrumento que existe', (tester) async {
      // **ESTA É A ISCA DO CONSERTO DE DIAGNÓSTICO, e ela nasce de um relato
      // que não deu para ler.** Cliente, 20/10/2026, iPhone, release de
      // `1ff67840`: *"ele ate pede a permissão para liberar, mas da o erro:
      // Não deu para descobrir sua cidade agora"* -- instantâneo, capital de
      // SP, permissão concedida, localização exata ligada. CINCO motivos
      // produzem essa frase, a frase é a mesma nos cinco, e nada registrava
      // qual foi. Um segundo build sem código na tela devolveria o mesmo
      // relato.
      //
      // DESLIGANDO: faça `_textoDaFaixa` devolver `_textoDoAviso` cru. Este
      // caso reprova pelo nome.
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultadoDaCidade: const CidadeNaoResolvida(
          MotivoDeNaoTerCidade.falhaDoServico,
          detalhe: 'GeocodeAddressError',
        ),
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        find.textContaining(MotivoDeNaoTerCidade.falhaDoServico.codigo),
        findsOneWidget,
        reason: 'REPROVA: a faixa não carrega o código do motivo. Quem usa o '
            'app não tem como dizer QUAL dos cinco caminhos falhou, e sem isso '
            'o aparelho dele não mede nada.',
      );
      expect(
        find.textContaining('GeocodeAddressError'),
        findsOneWidget,
        reason: 'REPROVA: o detalhe que a plataforma deu não chegou à tela. É '
            'ele que separa a etapa do PONTO da etapa do NOME.',
      );
    });

    testWidgets(
        'CONTRAPESO: o desfecho BOM não carrega código nenhum',
        (tester) async {
      // Sem este caso, `comCodigo` poderia colar um código em toda faixa --
      // inclusive na quarta frase, que afirma sucesso. "A localização
      // funcionou: você está em Sao Paulo · cód. ..." é absurdo na tela e
      // passaria em todas as iscas acima.
      final pedidos = <http.Request>[];
      // `naoPedida` + `depoisDePedir`, como na isca 4/4: com a permissao ja
      // concedida a resolucao de ABERTURA nomeia a cidade e o botao deixa de
      // ser oferecido -- nao haveria toque para medir.
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

      expect(find.textContaining(fraseSemPetsEm('Sao Paulo')), findsOneWidget);
      for (final motivo in MotivoDeNaoTerCidade.values) {
        expect(
          find.textContaining('cód. ${motivo.codigo}'),
          findsNothing,
          reason: 'REPROVA: o desfecho bom veio com o código de '
              '`${motivo.name}` colado. Código em frase de sucesso é defeito '
              'inventado na cara de quem acabou de ser atendido.',
        );
      }
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

  // -------------------------------------------------------------------------
  // 4. A CAIXA DO RECORTE SAI DEPOIS QUE A LOCALIZACAO DEU CIDADE
  //    (cliente, 20/10/2026)
  // -------------------------------------------------------------------------
  //
  // Nas palavras dele: *"remova essa box de localização depois de aceito e
  // funcionando, deve apenas aparecer dentro do filtro a cidade
  // selecionada."*
  //
  // **SAO DOIS CASOS E NAO UM, e o par e o mecanismo.** Cada um reprova um
  // lado da "simplificacao" que esconderia a caixa no estado errado:
  //
  //   - `=> true`  (nunca esconder) reprova o caso do SOME;
  //   - `=> false` (sempre esconder) reprova o caso do FICA.
  //
  // Com um caso so, qualquer um dos dois atalhos passaria -- e o que ele
  // produziria e a pessoa sem botao e sem explicacao, que e pior que a caixa
  // que fica.
  group('a caixa do recorte sai so depois de a localizacao dar cidade', () {
    /// LADO 1: O PEDIDO DO CLIENTE.
    ///
    /// DESLIGANDO: troque `_caixaDoRecorteAparece` por `=> true`. Este caso
    /// reprova pelo nome.
    testWidgets('a caixa SOME quando a localização já deu cidade',
        (tester) async {
      final pedidos = <http.Request>[];
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.concedida,
      );
      await abrir(tester, localizacao: porta, pedidos: pedidos);

      // CONTROLE POSITIVO: antes do toque a caixa ESTA na tela. Sem isto, um
      // desenho que nunca a mostrasse deixaria o `findsNothing` abaixo verde
      // por vazio -- e e assim que esta classe de caso passa sem medir.
      expect(
        aCaixaDoRecorte,
        findsOneWidget,
        reason: 'REPROVA: a caixa não está na tela ANTES do toque, e é aí que '
            'ela tem função: é a única coisa que explica o recorte e a única '
            'que oferece `$oBotao`. Nada abaixo mede nada.',
      );

      await tester.tap(find.text(oBotao));
      await tester.pumpAndSettle();

      expect(
        aCaixaDoRecorte,
        findsNothing,
        reason: 'REPROVA: a localização foi aceita, resolveu `Sao Paulo` e a '
            'caixa continua na tela. O cliente pediu que o vestígio passasse a '
            'ser a cidade DENTRO do filtro, e a caixa aqui repete o que o '
            'filtro já mostra.',
      );
      // E O VESTIGIO EXISTE: a cidade de fato foi aplicada, e e ela que o
      // campo da folha carrega (`_campoDaCidade`, `_recorte?.cidadeLimpa`).
      // Sem esta linha, "a caixa sumiu" poderia significar que a resolucao
      // falhou e nao que ela deu certo.
      expect(
        cidadesPedidas(pedidos).last,
        'Sao Paulo',
        reason: 'REPROVA: a caixa sumiu e a cidade NAO foi aplicada. Isso não '
            'é o desfecho bom: é a tela perdendo a caixa e o recorte juntos.',
      );

      // **E O VESTIGIO E O QUE O CLIENTE PEDIU, por extenso:** *"deve apenas
      // aparecer dentro do filtro a cidade selecionada."* Sem este `expect`, a
      // caixa poderia sair deixando a cidade invisivel em qualquer lugar da
      // tela -- e aí a pessoa teria a lista recortada sem nada dizendo por que.
      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      final campo = find.descendant(
        of: find.byType(BottomSheet),
        matching: find.byType(TextField),
      );
      expect(
        tester.widget<TextField>(campo).controller?.text,
        'Sao Paulo',
        reason: 'REPROVA: a caixa saiu e o filtro NÃO mostra a cidade que está '
            'valendo. É o pedido do cliente ao pé da letra, e sem isto a '
            'remoção da caixa apaga a única explicação do recorte.',
      );
    });

    /// LADO 2: A CAIXA FICA EM TODO ESTADO NAO RESOLVIDO.
    ///
    /// **Cada caso roda COM cidade guardada neste aparelho**, e isso e o que
    /// faz o caso medir: sem ela `_cidadeEmUso` seria nulo e a caixa ficaria
    /// pela primeira condicao, sem a pendencia ser consultada nunca.
    ///
    /// DESLIGANDO: troque `_caixaDoRecorteAparece` por `=> false`. Os cinco
    /// reprovam pelo nome.
    for (final caso in <String, LocalizacaoDeTeste Function()>{
      'semPermissao': () => LocalizacaoDeTeste(
            PermissaoDeLocalizacao.naoPedida,
            depoisDePedir: PermissaoDeLocalizacao.negada,
          ),
      'servicoDesligado': () => LocalizacaoDeTeste(
            PermissaoDeLocalizacao.naoPedida,
            depoisDePedir: PermissaoDeLocalizacao.concedida,
            resultadoDaCidade: const CidadeNaoResolvida(
              MotivoDeNaoTerCidade.servicoDesligado,
            ),
          ),
      'cidadeNaoDescoberta': () => LocalizacaoDeTeste(
            PermissaoDeLocalizacao.naoPedida,
            depoisDePedir: PermissaoDeLocalizacao.concedida,
            resultadoDaCidade: const CidadeNaoResolvida(
              MotivoDeNaoTerCidade.semFixNoPrazo,
            ),
          ),
      'cidadeSemNome': () => LocalizacaoDeTeste(
            PermissaoDeLocalizacao.naoPedida,
            depoisDePedir: PermissaoDeLocalizacao.concedida,
            resultadoDaCidade: const CidadeNaoResolvida(
              MotivoDeNaoTerCidade.semResultado,
            ),
          ),
    }.entries) {
      testWidgets(
        'a caixa FICA em todo estado não resolvido: ${caso.key}',
        (tester) async {
          final pedidos = <http.Request>[];
          await abrir(
            tester,
            localizacao: caso.value(),
            pedidos: pedidos,
            cidadeGuardada: 'Campinas',
          );

          await tester.tap(find.text(oBotao));
          await tester.pumpAndSettle();

          expect(
            aCaixaDoRecorte,
            findsOneWidget,
            reason: 'REPROVA: a localização NÃO entregou cidade '
                '(${caso.key}), há cidade em uso de outra origem (a guardada '
                'neste aparelho), e a caixa saiu da tela. Ela leva consigo o '
                'botão e a saída de quem acabou de tocá-lo: a pessoa fica sem '
                'controle nenhum e com a lista recortada por uma cidade que '
                'ela não escolheu agora.',
          );
          // CONTROLE POSITIVO: o estado nao resolvido de fato aconteceu. Sem
          // isto, uma porta que resolvesse a cidade em silencio deixaria o
          // caso verde pelo motivo errado.
          expect(
            find.textContaining('cód.'),
            findsOneWidget,
            reason: 'REPROVA: nenhuma frase de estado não resolvido apareceu, '
                'então não há estado não resolvido a medir neste caso.',
          );
        },
      );
    }

    /// `procurando` E O QUINTO, e ele exige o dublê que SEGURA a resposta.
    testWidgets('a caixa FICA em todo estado não resolvido: procurando',
        (tester) async {
      final pedidos = <http.Request>[];
      final porta = LocalizacaoQueDemora('Sao Paulo');
      await abrir(
        tester,
        localizacao: porta,
        pedidos: pedidos,
        cidadeGuardada: 'Campinas',
      );

      await tester.tap(find.text(oBotao));
      await tester.pump();
      await tester.pump();

      expect(find.textContaining(fraseProcurando), findsOneWidget);
      expect(
        aCaixaDoRecorte,
        findsOneWidget,
        reason: 'REPROVA: a tela está MEDINDO e a caixa saiu. O botão que a '
            'pessoa acabou de tocar desapareceu junto com a frase que explica '
            'a espera.',
      );

      porta.responder();
      await tester.pumpAndSettle();

      // E DEPOIS DE RESPONDER ELA SAI -- o par fechado no mesmo caso.
      expect(
        aCaixaDoRecorte,
        findsNothing,
        reason: 'REPROVA: a resolução chegou com cidade e a caixa continua. '
            'É o lado 1 deste grupo, agora pelo caminho do dublê que demora.',
      );
    });

    /// O CASO QUE SEPARA `_localizacaoPendente` DE `_podeOferecerLocalizacao`,
    /// e ele e REAL e nao hipotetico.
    ///
    /// Quem abre com a cidade guardada da sessao passada e toca o botao num
    /// build SEM localizacao recebe `indisponivel` -- e `_permissao` vira
    /// `indisponivel` no MESMO `setState` que poe a frase na tela. A partir
    /// desse instante `_podeOferecerLocalizacao` e falso e ha cidade em uso:
    /// sem a condicao da pendencia, a caixa sai levando consigo a explicacao
    /// que o toque acabou de produzir.
    ///
    /// DESLIGANDO: tire `|| _localizacaoPendente` de
    /// `_caixaDoRecorteAparece`. Este caso reprova pelo nome, e os outros
    /// cinco continuam verdes -- e e por isso que ele existe separado.
    testWidgets(
      'build sem localização: a caixa FICA com a frase que o toque produziu',
      (tester) async {
        final pedidos = <http.Request>[];
        await abrir(
          tester,
          localizacao: LocalizacaoDeTeste(
            PermissaoDeLocalizacao.naoPedida,
            depoisDePedir: PermissaoDeLocalizacao.indisponivel,
          ),
          pedidos: pedidos,
          cidadeGuardada: 'Campinas',
        );

        await tester.tap(find.text(oBotao));
        await tester.pumpAndSettle();

        expect(
          find.textContaining(fraseCidadeNaoDescoberta),
          findsOneWidget,
          reason: 'REPROVA: a permissão voltou `indisponivel` e a tela não '
              'disse nada. Sem a frase não há nada que a caixa possa levar '
              'consigo, e o caso perde o objeto.',
        );
        expect(
          aCaixaDoRecorte,
          findsOneWidget,
          reason: 'REPROVA: a caixa saiu no mesmo quadro em que a frase '
              'entrou. `_podeOferecerLocalizacao` virou falso (não há '
              'localização neste build) e há cidade em uso — e é exatamente '
              'esse par que `_localizacaoPendente` existe para cobrir.',
        );
      },
    );
  });
}
