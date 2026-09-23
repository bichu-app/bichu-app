// BICHUS-23 — a captura no ponto de uso, nos quatro casos que decidem o
// desenho, e a promessa que nenhum deles pode quebrar.
//
// A ISCA DESTE ARQUIVO, e ela e uma so em quatro formas: **o criterio 5 diz
// que "o fluxo inteiro funciona" quando a permissao e negada, e essa frase
// nao acusa nada sozinha.** Quem escrever a proxima tela sobre esta peca vai
// tratar o caminho feliz, porque e o que se ve rodando o app. Os quatro
// caminhos em que o aparelho NAO coopera sao os que ninguem exercita a mao, e
// sao exatamente os que a BICHUS-23 exige que continuem funcionando:
//
//   1. a pessoa NEGA a permissao;
//   2. o GPS demora e nao fixa;
//   3. a pessoa quer CORRIGIR o ponto depois de captura-lo;
//   4. o app precisa dizer o que capturou sem prometer exatidao que nao tem.
//
// Cada um tem um caso abaixo, e cada caso mede a MESMA coisa no fim: depois
// do tropeco, ainda da para mandar o "onde". Um caso que so conferisse a
// mensagem na tela ficaria verde no dia em que a peca passasse a mostrar a
// frase certa e devolver `null` para quem vai enviar.
//
// COMO ESTE ARQUIVO MONTA, e por que nao monta o app inteiro
// ----------------------------------------------------------
// `ajuda_de_tela.dart` monta `BichuApp` de proposito, e a razao esta escrita
// la: tela montada fora do `Escopo`, do roteador e do tema passa no teste e
// quebra no aparelho.
//
// Aqui nao da, e a razao e de sequencia, nao de preguica: **as telas que
// hospedam esta peca nao existem ainda.** F3.1 e a BICHUS-21 e F3.5 e a
// BICHUS-35; nenhuma das duas esta em `development`, e nao ha rota no
// `GoRouter` que leve a um lugar onde a captura apareca. Montar o app e
// procurar a peca acharia zero widget, e um caso assim reprova pelo motivo
// errado -- ou, pior, passa vazio.
//
// O que este arquivo monta e o `Escopo` DE VERDADE, com o tema DE VERDADE,
// e so troca a porta do aparelho -- que e o que `abrirOApp` tambem faz. O que
// ele nao tem e roteador, e a peca nao navega: ela nao tem `Navigator.push`
// nenhum fora da folha da antessala, que abre pelo `showModalBottomSheet` do
// proprio `MaterialApp` montado aqui.
//
// Quando a BICHUS-21 entrar, o caminho passa a ser exercitavel pela tela de
// verdade, e este arquivo continua valendo pelo que ele cobre: a peca, e nao
// a tela que a hospeda.

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/achados_api.dart';
import 'package:bichu/api/casos_api.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/fotos_pendentes.dart';
import 'package:bichu/api/devices_api.dart';
import 'package:bichu/api/fila_offline.dart';
import 'package:bichu/api/imagem_do_qr.dart';
import 'package:bichu/api/modelos_localizacao.dart';
import 'package:bichu/api/pets_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/dispositivo/leitor_de_qr.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/dispositivo/oportunidades_de_aviso.dart';
import 'package:bichu/sessao/registro_do_aviso_de_cadastro.dart';
import 'package:bichu/dispositivo/vigia_de_aviso.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/guarda_de_acao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/localizacao/antessala_de_localizacao.dart';
import 'package:bichu/telas/localizacao/captura_de_localizacao.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../a11y/verificador.dart';
import 'ajuda_de_tela.dart';

/// O ultimo "onde" que a peca publicou. `null` quando nao da para enviar.
class _Caixa {
  Onde? onde;
  int publicacoes = 0;
}

Future<_Caixa> _montar(
  WidgetTester tester, {
  required Localizacao localizacao,
  PontoDeUsoDaLocalizacao pontoDeUso = PontoDeUsoDaLocalizacao.marcarPerdido,
}) async {
  AppConfig.limparParaTeste();
  final config = AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste);
  final api = ApiClient(
    config: config,
    cliente: MockClient((_) async => http.Response('{}', 200)),
  );
  final auth = AuthApi(api);
  final deposito = DepositoEmMemoria();
  final guarda = GuardaDeAcao(
    deposito: DepositoDeIntencaoEmMemoria(),
    rotaDaTela: Rotas.rotaDaTelaDeUx,
  );
  final sessao = ControladorDeSessao(auth: auth, deposito: deposito);
  addTearDown(sessao.dispose);
  addTearDown(api.fechar);

  final devices = DevicesApi(api);
  final caixa = _Caixa();
  // O envio de foto entra com a camera ausente: este caso nao sobe foto
  // nenhuma, e o mecanismo so age quando alguem chama `enviar`.
  final envioDeFoto = EnvioDeFoto(
    camera: const CameraNaoEmbarcada(),
    cliente: MockClient((_) async => http.Response('{}', 200)),
  );

  await tester.pumpWidget(
    Escopo(
      api: api,
      auth: auth,
      pets: PetsApi(api),
      casos: CasosApi(api),
      // BICHUS-35: a camada de achado entrou no escopo junto com F3.5.
      achados: AchadosApi(api),
      // O envio de foto entra com a camera ausente: este caso nao sobe foto
      // nenhuma, e um `EnvioDeFoto` com camera de verdade nao mudaria nada
      // aqui -- ele so age quando alguem chama `enviar`.
      envioDeFoto: envioDeFoto,
      retomadaDeFotos: RetomadaDeFotos(
        envio: envioDeFoto,
        registro: FotosPendentes(deposito: DepositoDeFotosEmMemoria()),
        pets: PetsApi(api),
      ),
      fila: FilaOffline(deposito: DepositoDaFilaEmMemoria()),
      tags: TagsApi(api),
      devices: devices,
      camera: const CameraNaoEmbarcada(),
      // Este caso monta o `Escopo` a mao, e nao pelo `App`: as cinco
      // dependencias abaixo entraram na integracao de 22/09 (BICHUS-21, 24 e
      // 54) e sao as variantes que nao encostam em canal de plataforma, que e
      // o que um teste de widget suporta.
      leitorDeQr: const LeitorDeQrNaoEmbarcado(),
      avisos: const AvisosNaoEmbarcados(),
      oportunidades:
          OportunidadesDeAviso(deposito: DepositoDeOportunidadesEmMemoria()),
      vigiaDeAviso: VigiaDeAviso(
        avisos: const AvisosNaoEmbarcados(),
        devices: devices,
      ),
      localizacao: localizacao,
      sessao: sessao,
      guarda: guarda,
      cacheDeMeusPets: CacheDeMeusPets(),
      cofreDoQr: CofreDaImagemDoQr(),
      avisoDeCadastro:
          AvisoDeCadastro(deposito: DepositoDoAvisoEmMemoria()),
      child: MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: CapturaDeLocalizacao(
              pontoDeUso: pontoDeUso,
              aoMudar: (onde) {
                caixa
                  ..onde = onde
                  ..publicacoes += 1;
              },
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return caixa;
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
///
/// Pelo rotulo declarado no widget, e nao por indice nem por
/// `widgetWithText`: o rotulo do `BichuField` e um `Text` IRMAO do campo, e
/// nao um descendente dele -- `find.widgetWithText(TextField, ...)` acha zero,
/// e `find.byType(TextField).at(1)` passaria a apontar para outro campo no dia
/// em que a ordem mudasse, sem reprovar nada.
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is BichuField && w.rotulo == rotulo,
      ),
      matching: find.byType(TextField),
    );

/// Preenche a area e devolve o que a peca publicou.
Future<void> _digitarArea(
  WidgetTester tester, {
  String bairro = 'Vila Madalena',
  String cidade = 'São Paulo',
  String uf = 'SP',
}) async {
  await tester.enterText(_campo(TextosDaLocalizacao.rotuloBairro), bairro);
  await tester.enterText(_campo(TextosDaLocalizacao.rotuloCidade), cidade);
  await tester.enterText(_campo(TextosDaLocalizacao.rotuloUf), uf);
  await tester.pumpAndSettle();
}

void main() {
  // -------------------------------------------------------------------------
  // CASO 1 — a permissao e NEGADA, e o fluxo continua inteiro
  // -------------------------------------------------------------------------
  group('caso 1: a permissao e negada', () {
    testWidgets('o campo de area aparece e o "onde" continua enviavel',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.negada,
      );
      final caixa = await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      // A antessala abriu (criterio 3) e a pessoa autorizou a PERGUNTA.
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).last,
      );

      expect(
        find.text(TextosDaLocalizacao.negouDestaVez),
        findsOneWidget,
        reason: 'REPROVA: a recusa nao foi explicada. O criterio 5 manda o '
            'campo de bairro aparecer, e aparecer sem dizer por que deixa a '
            'pessoa achando que o app falhou.',
      );

      await _digitarArea(tester);

      final onde = caixa.onde;
      expect(
        onde,
        isA<OndePorArea>(),
        reason: 'REPROVA: a pessoa negou a permissao, digitou bairro, cidade '
            'e UF, e a peca NAO publicou um "onde" enviavel. O criterio 5 diz '
            'que "o fluxo inteiro funciona" e que o caso existe do mesmo '
            'jeito: sem isto, negar a permissao vira um beco sem saida, que e '
            'a classe de defeito que este arquivo existe para impedir. '
            'Publicado: $onde',
      );
      expect(onde!.temCoordenada, isFalse);
      expect(
        onde.noCaso['last_seen_area'],
        <String, Object?>{
          'city': 'São Paulo',
          'neighborhood': 'Vila Madalena',
          'state': 'SP',
        },
      );
    });

    testWidgets('o campo de bairro recebe o FOCO, que e o teclado aberto',
        (tester) async {
      // Criterio 5, na letra: "aparece o campo de bairro, cidade e UF **com o
      // teclado aberto**".
      //
      // ESTE CASO NASCEU DE UMA ISCA FURADA. A primeira versao deste arquivo
      // tinha os outros casos e nao tinha este: apagar o
      // `_focoDoBairro.requestFocus()` da peca deixava a suite inteira VERDE.
      // O campo aparecia, o fluxo funcionava, e a pessoa que acabou de negar a
      // permissao tinha de tocar no campo para comecar a digitar -- um toque a
      // mais exatamente no momento em que ela ja disse "nao" uma vez.
      //
      // Mede o `FocusNode` do campo, e nao "o teclado subiu": teste de widget
      // nao tem teclado. O foco e o que o Flutter usa para pedi-lo, e e a
      // unica parte verificavel sem aparelho.
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.naoPedida,
        depoisDePedir: PermissaoDeLocalizacao.negada,
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).last,
      );

      final campo = tester.widget<TextField>(
        _campo(TextosDaLocalizacao.rotuloBairro),
      );
      expect(
        campo.focusNode?.hasFocus,
        isTrue,
        reason: 'REPROVA: o campo de bairro apareceu SEM foco. O criterio 5 '
            'diz "com o teclado aberto", e sem foco o teclado nao sobe: quem '
            'acabou de negar a permissao precisa de mais um toque para '
            'comecar a digitar. O defeito e silencioso -- a tela fica certa, '
            'o fluxo funciona, e so quem usa o app no aparelho percebe.',
      );
    });

    testWidgets('a recusa DEFINITIVA manda para os ajustes, e nao repete o '
        'dialogo', (tester) async {
      final porta =
          LocalizacaoDeTeste(PermissaoDeLocalizacao.negadaPermanentemente);
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        porta.vezesQuePediu,
        0,
        reason: 'REPROVA: o app chamou `pedir()` com a permissao ja negada em '
            'definitivo. Esse dialogo NAO abre mais -- o toque nao faz nada e '
            'a pessoa fica tentando. O unico caminho sao os ajustes.',
      );
      expect(find.text(TextosDaLocalizacao.negouEmDefinitivo), findsOneWidget);

      await tocar(tester, find.text(TextosDaLocalizacao.abrirAjustes));
      expect(
        porta.abriuAjustes,
        isTrue,
        reason: 'REPROVA: `Abrir os ajustes` nao abriu os ajustes. O terceiro '
            'estado de permissao existe justamente porque pedir de novo nao '
            'resolve.',
      );
    });

    testWidgets('`Prefiro digitar o bairro` NAO dispara o dialogo do sistema',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      final caixa = await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro).first,
      );
      await _digitarArea(tester);

      expect(
        porta.vezesQuePediu,
        0,
        reason: 'REPROVA: escolher digitar o bairro gastou o dialogo do '
            'sistema. No iOS ele e mostrado UMA vez: gasta-lo sem a pessoa ter '
            'pedido transforma um "agora nao" num "nao" permanente.',
      );
      expect(caixa.onde, isA<OndePorArea>());
    });
  });

  // -------------------------------------------------------------------------
  // CASO 2 — o GPS demora e nao fixa
  // -------------------------------------------------------------------------
  group('caso 2: o GPS nao fixa', () {
    testWidgets('a peca desiste, explica, e o bairro salva o fluxo',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultado: const CapturaSemPonto(MotivoDeNaoTerPonto.semFixNoPrazo),
      );
      final caixa = await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        find.text(TextosDaLocalizacao.semFixNoPrazo),
        findsOneWidget,
        reason: 'REPROVA: o GPS nao fixou e a tela nao disse nada. Sem prazo e '
            'sem frase, a pessoa fica olhando um indicador girando para '
            'sempre, e o "ponto de uso" vira um fluxo que nao termina.',
      );

      await _digitarArea(tester);
      expect(
        caixa.onde,
        isA<OndePorArea>(),
        reason: 'REPROVA: o aparelho nao fixou e o fluxo travou. Nao fixar nao '
            'e recusa: e demora, e o caminho do bairro precisa estar aberto '
            'igual.',
      );
    });

    testWidgets('`Tentar de novo` mede de novo', (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultado: const CapturaSemPonto(MotivoDeNaoTerPonto.semFixNoPrazo),
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      expect(porta.vezesQueMediu, 1);

      await tocar(tester, find.text(TextosDaLocalizacao.tentarDeNovo));
      expect(
        porta.vezesQueMediu,
        2,
        reason: 'REPROVA: `Tentar de novo` nao mediu de novo. Um botao que nao '
            'faz nada e pior que nenhum botao.',
      );
    });

    testWidgets('o servico DESLIGADO nao e tratado como recusa',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        servico: false,
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        find.text(TextosDaLocalizacao.servicoDesligado),
        findsOneWidget,
        reason: 'REPROVA: a localizacao do aparelho esta desligada e a tela '
            'falou de PERMISSAO. Sao duas coisas diferentes e as duas falham '
            'sozinhas: mandar quem ja concedeu a permissao para a tela de '
            'permissao e mandar a pessoa procurar o que ela ja fez.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASO 3 — corrigir o ponto depois de captura-lo
  // -------------------------------------------------------------------------
  group('caso 3: corrigir o ponto capturado', () {
    testWidgets('`Trocar pelo bairro digitado` descarta a coordenada',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      final caixa = await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      expect(caixa.onde, isA<OndePorPonto>());

      await tocar(tester, find.text(TextosDaLocalizacao.trocarPeloBairro));
      await _digitarArea(tester);

      final onde = caixa.onde;
      expect(
        onde,
        isA<OndePorArea>(),
        reason: 'REPROVA: a pessoa trocou o ponto pelo bairro e a coordenada '
            'ficou. Correcao que nao corrige e pior que nao oferecer '
            'correcao: o "onde" enviado deixa de ser o que a pessoa escolheu. '
            'Publicado: $onde',
      );
      expect(onde!.temCoordenada, isFalse);
      expect(
        onde.noAchado.containsKey('location'),
        isFalse,
        reason: 'REPROVA: `location` sobreviveu a troca pelo bairro.',
      );
    });

    testWidgets('o bairro digitado JUNTO com o GPS vai nos dois campos',
        (tester) async {
      // O caminho conservador: `area_label` sai nulo quando so ha coordenada,
      // e derivar o bairro dela e o que o ADR-0006 proibe. Entao pergunta-se.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      final caixa = await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      // Bairro E cidade: `Area.required: [city]` no contrato, entao bairro
      // sozinho nao produz area nenhuma. Este caso ja reprovou com so o
      // bairro, e o defeito era a peca descartar em silencio o rotulo que a
      // pessoa tinha acabado de escrever.
      await _digitarArea(tester);

      final onde = caixa.onde;
      expect(onde, isA<OndeComPontoEArea>());
      expect(onde!.noAchado.keys.toSet(), <String>{'location', 'area'});
      expect(
        (onde.noAchado['area']! as Map<String, Object?>)['neighborhood'],
        'Vila Madalena',
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASO 4 — o que o app diz sobre precisao
  // -------------------------------------------------------------------------
  group('caso 4: a precisao e dita sem prometer exatidao', () {
    testWidgets('a margem aparece, arredondada para cima em centenas',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultado: const CapturaComPonto(
          PontoCapturado(
            lat: -23.5505,
            lon: -46.6333,
            precisaoEmMetros: 137,
            origem: OrigemDoPonto.deviceGps,
          ),
        ),
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        find.text(TextosDaLocalizacao.pontoComPrecisao(200)),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse a margem da medicao, ou disse o '
            'numero cru. "Localizacao capturada" promete um ponto; o aparelho '
            'entregou um circulo de 137 m e ele sabe disso. "cerca de 137 m" '
            'sugere uma precisao que a propria estimativa nao sustenta.',
      );
    });

    testWidgets('sem margem declarada, a frase nao inventa numero',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.concedida,
        resultado: const CapturaComPonto(
          PontoCapturado(
            lat: -23.5505,
            lon: -46.6333,
            precisaoEmMetros: null,
            origem: OrigemDoPonto.deviceGps,
          ),
        ),
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      expect(find.text(TextosDaLocalizacao.pontoSemPrecisao), findsOneWidget);
    });

    testWidgets('a coordenada NUNCA e mostrada na tela', (tester) async {
      // Criterio 7: o que sai para outra pessoa e o bairro, nunca a
      // coordenada. Mostra-la aqui seria o primeiro lugar de onde ela vaza --
      // a captura de tela que a pessoa manda no grupo do bairro.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(tester, localizacao: porta);
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      for (final pedaco in <String>['-23.55', '-46.63', '23,55', '46,63']) {
        expect(
          find.textContaining(pedaco),
          findsNothing,
          reason: 'REPROVA: a tela mostra "$pedaco". A coordenada nao aparece '
              'para ninguem, nem para quem a capturou: o nivel maximo de '
              'precisao que o produto exibe e bairro e cidade (ADR-0010).',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // A antessala, nos dois pontos de uso (criterios 3 e 4)
  // -------------------------------------------------------------------------
  group('a antessala diz o que os criterios 3 e 4 mandam', () {
    testWidgets('F3.1 (marcar perdido) usa o texto do criterio 3',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(find.text(TextosDaLocalizacao.tituloPerdido), findsOneWidget);
      expect(find.text(TextosDaLocalizacao.corpoPerdido), findsOneWidget);
      expect(
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
        findsWidgets,
        reason: 'REPROVA: a antessala de F3.1 nao oferece `Prefiro digitar o '
            'bairro`. O criterio 3 enumera as DUAS acoes.',
      );
    });

    testWidgets('F3.5 (registrar achado) usa o texto do criterio 4',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(find.text(TextosDaLocalizacao.tituloAchado), findsOneWidget);
      expect(find.text(TextosDaLocalizacao.corpoAchado), findsOneWidget);
    });

    testWidgets('a antessala NAO reaparece quando o dialogo ja foi respondido',
        (tester) async {
      // No iOS `requestPermission` nao reabre nada depois da primeira
      // resposta. Mostrar a antessala ali seria pedir contexto para uma
      // pergunta que nao vai ser feita.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(tester, localizacao: porta);
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(find.text(TextosDaLocalizacao.tituloPerdido), findsNothing);
      expect(porta.vezesQuePediu, 0);
      expect(porta.vezesQueMediu, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Acessibilidade, medida na arvore em execucao
  // -------------------------------------------------------------------------
  group('acessibilidade da peca montada', () {
    testWidgets('nenhum controle se anuncia como botao sem acao de toque',
        (tester) async {
      // A classe de defeito que `a11y/acao_de_controle_test.dart` registrou:
      // quatro widgets ja foram achados com `btn=true tap=false`. A medida e
      // na arvore de SEMANTICA em execucao, nunca no fonte.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(tester, localizacao: porta);
      final handle = tester.ensureSemantics();
      try {
        // Fase `escolhendo`: as duas acoes.
        var v = verificarAcaoDosControles(
          tester,
          tela: 'captura de localizacao (escolhendo)',
          tema: 'claro',
          botoesEsperados: 2,
        );
        expect(v, isEmpty, reason: relatorio(v));

        await tocar(
          tester,
          find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
        );

        // Fase `comPonto`: a troca pelo bairro.
        v = verificarAcaoDosControles(
          tester,
          tela: 'captura de localizacao (com ponto)',
          tema: 'claro',
          botoesEsperados: 1,
        );
        expect(v, isEmpty, reason: relatorio(v));
      } finally {
        handle.dispose();
      }
    });

    testWidgets('todo controle tem nome anunciavel', (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      await _montar(tester, localizacao: porta);

      exigirRotuloAnunciavel(
        tester,
        TextosDaLocalizacao.usarMinhaLocalizacao,
        na: 'captura de localizacao',
      );
      exigirRotuloAnunciavel(
        tester,
        TextosDaLocalizacao.preferoDigitarOBairro,
        na: 'captura de localizacao',
      );
    });

    testWidgets('os alvos de toque respeitam o piso do produto',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      await _montar(tester, localizacao: porta);
      final handle = tester.ensureSemantics();
      try {
        final v = verificarAlvoDeToque(
          tester,
          tela: 'captura de localizacao',
          tema: 'claro',
          piso: pisoMinimo,
          tocaveisEsperados: 2,
        );
        expect(v, isEmpty, reason: relatorio(v));
      } finally {
        handle.dispose();
      }
    });
  });
}
