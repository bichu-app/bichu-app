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

import 'dart:async';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/busca_de_cep.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/contadores_api.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/sessao/contadores_de_nao_lido.dart';
import 'package:bichu/api/achados_api.dart';
import 'package:bichu/api/casos_api.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/convites_api.dart';
import 'package:bichu/api/me_api.dart';
import 'package:bichu/api/notificacoes_api.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/fotos_pendentes.dart';
import 'package:bichu/api/devices_api.dart';
import 'package:bichu/api/passkeys_api.dart';
import 'package:bichu/dispositivo/credencial_do_aparelho.dart';
import 'package:bichu/dispositivo/passkey_neste_aparelho.dart';
import 'package:bichu/sessao/fiacao_do_passkey.dart';
import 'package:bichu/api/diretorio_api.dart';
import 'package:bichu/api/loja_api.dart';
import 'package:bichu/api/fila_offline.dart';
import 'package:bichu/api/imagem_do_qr.dart';
import 'package:bichu/api/estados_brasileiros.dart';
import 'package:bichu/api/modelos_localizacao.dart';
import 'package:bichu/api/pets_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/dispositivo/leitor_de_qr.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/sessao/localizacao_da_sessao.dart';
import 'package:bichu/dispositivo/oportunidades_de_aviso.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/sessao/contador_de_avisos.dart';
import 'package:bichu/sessao/registro_do_aviso_de_cadastro.dart';
import 'package:bichu/dispositivo/vigia_de_aviso.dart';
import 'package:bichu/dispositivo/avisos_recebidos.dart';
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
import 'package:bichu/widgets/seletor_de_lista.dart';
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
  /// A busca de CEP. **Entra por aqui so onde o caso a exercita**: o padrao do
  /// `Escopo` e a de verdade, que sem cliente injetado so sai da maquina quando
  /// alguem digita oito digitos -- e nenhum caso fazia isso antes de 22/10.
  BuscaDeCep? buscaDeCep,
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
  final registroDePasskey =
      PasskeyNesteAparelho(deposito: DepositoDePasskeyEmMemoria());
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
      // As QUATRO portas de passkey do escopo (BICHUS-301, 28/10/2026). Este
      // caso nao exercita passkey nenhuma; elas estao aqui porque `Escopo` as
      // declara `required`, e isso e deliberado: um padrao nulo deixaria uma
      // tela de producao subir com a porta desligada e nenhuma isca acusaria.
      //
      // `SemPasskeyNesteBuild` e a porta que recusa -- a de verdade estouraria
      // `MissingPluginException` dentro de um `Future`, sem apontar a causa.
      // E o registro vai com deposito EM MEMORIA e VAZIO, que e o estado de
      // quem nao tem credencial neste aparelho: com ele, `tentarEntrar` sai na
      // primeira linha e nao chega nem a pedir desafio.
      passkeys: PasskeysApi(api),
      credencialDoAparelho: const SemPasskeyNesteBuild(),
      passkeyNesteAparelho: registroDePasskey,
      passkey: FiacaoDoPasskey(
        passkeys: PasskeysApi(api),
        aparelho: const SemPasskeyNesteBuild(),
        registro: registroDePasskey,
      ),
      pets: PetsApi(api),
      casos: CasosApi(api),
      // A porta das conexoes entrou no escopo na uniao de 18/10/2026, junto
      // com a rota de `Pedidos de conexao`.
      conexoes: ConexoesApi(api),
      // O convite do proprio perfil entrou no escopo com `Convide tutores` e
      // com a resolucao do convite no leitor de QR (21/10/2026).
      convites: ConvitesApi(api),
      // As rotas `tags: [me]` entraram no escopo com `Perfil` > `Meus dados`.
      me: MeApi(api),
      // O diretorio de `Perto` entrou no escopo junto com a listagem.
      diretorio: DiretorioApi(api),
      // A vitrine de `Loja` entrou no escopo junto com a listagem dela.
      loja: LojaApi(api),
      // BICHUS-35: a camada de achado entrou no escopo junto com F3.5.
      achados: AchadosApi(api),
      // O envio de foto entra com a camera ausente: este caso nao sobe foto
      // nenhuma, e um `EnvioDeFoto` com camera de verdade nao mudaria nada
      // aqui -- ele so age quando alguem chama `enviar`.
      envioDeFoto: envioDeFoto,
      // O CONTADOR DA ABA `AuAu` entrou no escopo em 20/10/2026. Aqui ele
      // entra com a porta de conversas deste mesmo `api` de teste: este caso
      // nao mede contador nenhum, e o objeto so pergunta quando alguem chama
      // `atualizar()`.
      contadores: ContadoresDeNaoLido(
        ConversasApi(api),
        secoes: ContadoresApi(api),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
      ),
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
      // O ouvinte de push entra com a porta NAO EMBARCADA, pela mesma razao das
      // outras cinco: `FirebaseMessaging.onMessage` num ambiente sem canal de
      // plataforma devolve stream que nunca emite e nunca fecha, e
      // `getInitialMessage()` um `Future` que nunca resolve -- o `pumpAndSettle`
      // deste caso esperaria para sempre.
      avisosRecebidos:
          OuvinteDeAvisos(mensagens: const MensagensDePushNaoEmbarcadas()),
      avisos: const AvisosNaoEmbarcados(),
      oportunidades:
          OportunidadesDeAviso(deposito: DepositoDeOportunidadesEmMemoria()),
      vigiaDeAviso: VigiaDeAviso(
        avisos: const AvisosNaoEmbarcados(),
        devices: devices,
      ),
      localizacao: localizacao,
      localizacaoDaSessao: LocalizacaoDaSessao(localizacao),
      buscaDeCep: buscaDeCep ?? const BuscaDeCep(),
      sessao: sessao,
      guarda: guarda,
      cacheDeMeusPets: CacheDeMeusPets(),
      // EM MEMORIA, e nao o deposito em arquivo do app: este caso monta o
      // `Escopo` a mao, e o deposito em arquivo chama
      // `getApplicationDocumentsDirectory()` -- canal de plataforma que trava o
      // `pumpAndSettle` para sempre, sem mensagem.
      cidadeEscolhida: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
      cofreDoQr: CofreDaImagemDoQr(),
      avisoDeCadastro:
          AvisoDeCadastro(deposito: DepositoDoAvisoEmMemoria()),
      // O contador do sino entra porque o `Escopo` o exige, e nao porque este
      // caso o exercite: a tela medida aqui nao tem barra de topo e nao ha
      // sino nenhum na arvore. Ele nunca e atualizado -- `atualizar()` so e
      // chamado pelo arranque, pelo pos-login e pela retomada, e nenhum dos
      // tres passa por aqui --, entao `naoLidas` fica nulo do comeco ao fim.
      contadorDeAvisos: ContadorDeAvisos(notificacoes: NotificacoesApi(api)),
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

/// O proprio [BichuField] cujo rotulo e [rotulo], para ler o que ele DECLARA
/// (`opcional`), e nao o que ele desenha.
BichuField _campoDeclarado(WidgetTester tester, String rotulo) =>
    tester.widget<BichuField>(
      find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
    );

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
  await tester.pumpAndSettle();
  // **O estado agora e ESCOLHA, e nao digitacao** (cliente, 17/10/2026): a
  // lista mostra o nome e guarda a sigla, entao o caso escolhe pelo NOME e
  // continua afirmando a sigla no corpo que sai.
  await _escolherOEstado(tester, uf);
}

/// Abre a lista de estados e escolhe o item da sigla [sigla].
Future<void> _escolherOEstado(WidgetTester tester, String sigla) async {
  final nome = estadosBrasileiros
      .firstWhere((ItemDeLista e) => e.codigo == sigla)
      .rotulo;
  await rolarAte(tester, find.text(TextosDaLocalizacao.escolherOEstado));
  await tocar(tester, find.text(TextosDaLocalizacao.escolherOEstado));
  // **A opcao e a do `ListTile` da folha, e a folha ROLA.**
  //
  // `find.text(nome).last` era ambiguo e errava calado: com `São Paulo`
  // digitado no campo `Cidade`, o texto do CAMPO tambem casa, e a folha de 27
  // itens so constroi o que cabe -- `São Paulo` e o 25o e nao esta montado.
  // O toque ia para o campo atras da folha, escorregava para a lista e
  // selecionava o estado que estivesse naquele ponto: medido, saiu `BA`.
  // Procurar dentro do `ListTile` separa a opcao do campo, e rolar a folha
  // constroi o item antes do toque.
  final opcao = find.descendant(
    of: find.byType(ListTile),
    matching: find.text(nome),
  );
  if (opcao.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      opcao,
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
  await tocar(tester, opcao);
}

/// A porta cuja RESOLUCAO DE CIDADE a gente solta na mao.
///
/// Ela existe para um caso que nao se produz de outro jeito: **a pessoa
/// digitando a cidade ENQUANTO a localizacao e resolvida**. O ponto chega
/// primeiro (e so ele destrava os campos), e o nome da cidade chega segundos
/// depois -- e e exatamente nessa janela que o pre-preenchimento pode passar
/// por cima do que ela acabou de escrever.
class _PortaComCidadeNaMao implements Localizacao {
  final Completer<ResultadoDaCidade> cidadeChega =
      Completer<ResultadoDaCidade>();

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
      const CapturaComPonto(
        PontoCapturado(
          lat: -23.5505,
          lon: -46.6333,
          precisaoEmMetros: 240,
          origem: OrigemDoPonto.deviceGps,
        ),
      );

  @override
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo}) =>
      cidadeChega.future;
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

    // **VEIO DE `localizacao_do_botao_test.dart` EM 29/10/2026.**
    //
    // Aquele arquivo media isto com o APP montado, dirigindo o botao pela tela
    // do achado. O achado deixou de oferecer captura (decisao do cliente), e
    // **nenhuma tela de producao a oferece hoje**: F3.1 nunca adotou esta peca
    // -- medido, `tela_onde_e_quando.dart` nao cita `CapturaDeLocalizacao`.
    //
    // A afirmacao, porem, continua sendo sobre a PECA e continua valendo, e ela
    // era a unica dos tres casos daquele grupo que nao estava coberta aqui.
    // Deixa-la morrer junto com a tela perderia a nuance do Android.
    testWidgets('`negada` (e nao `naoPedida`) ainda abre o dialogo do sistema',
        (tester) async {
      final porta = LocalizacaoDeTeste(
        PermissaoDeLocalizacao.negada,
        depoisDePedir: PermissaoDeLocalizacao.concedida,
      );
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      // A antessala abre para `negada` tambem, e `pedir()` so vem DEPOIS da
      // confirmacao dela -- por isso o segundo toque.
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).last,
      );

      expect(
        porta.vezesQuePediu,
        greaterThan(0),
        reason: 'REPROVA: com a permissao `negada` o app nao pediu nada. No '
            'Android `negada` NAO e definitiva -- ela e "nunca perguntei de '
            'verdade", e o dialogo do sistema ainda abre. Tratar `negada` '
            'como `negadaPermanentemente` manda para os ajustes quem so '
            'precisava ser perguntado outra vez.',
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
      // **`OndeComPontoEArea` E NAO `OndePorPonto`, e a mudanca e de 22/10/2026.**
      //
      // Esta linha afirmava `OndePorPonto`, e era verdade enquanto a captura
      // deixava os campos vazios. Com a decisao do cliente de 22/10 -- *"quando
      // o usuario autoriza a localizacao ao encontrar um pet, voce deve
      // prencher o formulario com as informacoes"* -- a cidade resolvida da
      // coordenada nasce no campo, e ai o "onde" tem ponto E area.
      //
      // **O que este caso mede nao mudou**: as tres afirmacoes abaixo, depois
      // da troca pelo bairro, continuam exigindo que a COORDENADA desapareca.
      // Esta linha e so o estado de partida, e ela precisa dizer a verdade --
      // uma afirmacao de partida errada reprovaria o caso pelo motivo errado.
      expect(caixa.onde, isA<OndeComPontoEArea>());

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
  // -------------------------------------------------------------------------
  // O FORMULARIO NASCE PREENCHIDO -- cliente, 22/10/2026
  // -------------------------------------------------------------------------
  //
  // Palavra por palavra: *"quando o usuario autoriza a localizacao ao encontrar
  // um pet, voce deve prencher o formulario com as informacoes, para caso o
  // usuario queira corrigir ou alterar, nessa pagina, vamos utilizar apenas
  // como uma facilidade para ele nao ter que preencher todos os campos"*.
  //
  // TRES TRAVAS, e a terceira e o ADR:
  //
  //  1. **e facilidade, nao imposicao**: tudo continua editavel -- os casos do
  //     `caso 3` acima ja cobram isso e continuam valendo;
  //  2. **o que a PESSOA digitou vence** o preenchimento automatico (decisao do
  //     cliente de 17/10/2026, *"a busca de CEP so preenche campo vazio -- o
  //     que a pessoa ja escreveu vence"*). O mecanismo e o COMPARTILHADO,
  //     `formulario/origem_dos_valores.dart`, e nao um segundo escrito aqui:
  //     esta peca tinha um `_preencherSeVazio` proprio, que e a leitura
  //     `isEmpty` pura que aquele arquivo existe para consertar -- num
  //     formulario que nasce cheio, nada esta vazio e a busca de CEP nunca mais
  //     preenche nada;
  //  3. **coordenada -> cidade e permitido; coordenada -> bairro NAO**
  //     (ADR-0006, emenda 1, a tabela do que ela nao autoriza: *"a emenda fala
  //     de cidade. Bairro e mais fino que o que a pessoa escolheu entregar"*).
  //
  // DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
  // -------------------------------------------------------
  //  a. Em `lib/telas/localizacao/captura_de_localizacao.dart`, apague a linha
  //     `unawaited(_preencherACidadeDaLocalizacao());` do ramo
  //     `case CapturaComPonto`.
  //     -> reprova `a cidade da localizacao autorizada NASCE no campo` e, de
  //        quebra, `\`Trocar pelo bairro digitado\` descarta a coordenada` --
  //        aquele caso afirma o estado de PARTIDA (`OndeComPontoEArea`), que
  //        passa a ser falso sem o preenchimento.
  //     -> **NAO reprova** `o que a PESSOA digitou NAO e sobrescrito`, e essa
  //        assimetria e o ponto: aquele caso mede a precedencia, e sem
  //        preenchimento nenhum nao ha precedencia a medir. Por isso os dois
  //        existem.
  //  b. No mesmo arquivo, troque `_origem.doGuardado(_cidade, ...)` de
  //     `_preencherACidadeDaLocalizacao` por `_cidade.text = resultado.cidade;`
  //     -- o atalho que parece igual.
  //     -> reprova `o que a PESSOA digitou NAO e sobrescrito pela localizacao`,
  //        e so ele.
  //  d. No mesmo arquivo, troque `unawaited(_preencherACidadeDaLocalizacao());`
  //     por `_cidade.text = '${ponto.lat},${ponto.lon}';` -- a coordenada indo
  //     para o campo que viaja em `city`.
  //     -> reprova `ISCA -- nenhuma coordenada entra em campo do formulario`,
  //        `a coordenada NUNCA e mostrada na tela` (caso 4) e `a cidade da
  //        localizacao autorizada NASCE no campo`. Os TRES juntos sao o
  //        contrapeso do ADR-0010: o campo nao carrega coordenada, a tela nao a
  //        mostra, e o que o campo carrega e um nome de cidade.
  //  c. No mesmo arquivo, acrescente
  //     `_origem.doGuardado(_bairro, resultado.cidade, _chaveBairro);` em
  //     `_preencherACidadeDaLocalizacao` -- derivar area da coordenada.
  //     -> reprova `ISCA -- o bairro NAO e derivado da coordenada`.
  // **O PONTO DE USO DESTE GRUPO VIROU `marcarPerdido` EM 29/10/2026**, e a
  // troca nao e cosmetica: o relato de 26/10 era sobre a tela do achado, e o
  // achado **deixou de oferecer captura** por decisao do cliente (*"remove os
  // botoes e deixa os campos de cep, endereco para o usuario preencher"*).
  //
  // O que estes casos medem -- a emenda 1 do ADR-0006, `coordenada -> nome de
  // cidade` e nada mais -- continua inteiro e continua valendo, so que para
  // F3.1, que e o fluxo que ainda captura. Deixa-los em `registrarAchado`
  // seria pior que apaga-los: eles passariam a montar uma tela que nao oferece
  // captura nenhuma e a afirmar, no verde, que a fronteira do ADR-0006 esta
  // medida -- quando nada estaria sendo exercitado.
  group('a tela diz de onde cada campo vem, ANTES do toque (26/10/2026)', () {
    // ## O relato que NAO era defeito
    //
    // Cliente, 26/10/2026: *"na pagina achei esse pet, quando eu seleciono a
    // localizacao, ele ta trazendo apenas a cidade, mas nao o cep, bairro e
    // estado preenchidos"*.
    //
    // **O comportamento esta certo, e o grupo abaixo
    // (`o bairro NAO e derivado da coordenada`) e quem o prova.** A emenda 1 do
    // ADR-0006 autoriza UM sentido, `coordenada -> nome de cidade`, e recusa
    // `coordenada -> bairro` com uma frase. Nada aqui afrouxa aquilo.
    //
    // O que faltava era a tela DIZER isso antes de a pessoa formar a
    // expectativa. Depois do toque ela ja comparou o que esperava com o que
    // veio -- e foi o que aconteceu.
    testWidgets('a fase de escolher explica o ponto, a cidade e o CEP',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );

      // **SEM TOCAR EM NADA**: e esse o ponto do caso. A explicacao tem de
      // estar na tela no instante em que a pessoa decide qual caminho tomar.
      expect(
        find.text(TextosDaLocalizacao.oQueCadaCaminhoPreenche),
        findsOneWidget,
        reason: 'REPROVA: a tela oferece `Usar minha localizacao` sem dizer o '
            'que o botao preenche. O cliente tocou nele esperando CEP, bairro '
            'e estado, recebeu o ponto e a cidade -- que e tudo o que o '
            'ADR-0006 autoriza -- e relatou como defeito em 26/10/2026.',
      );

      // E ela nomeia o CEP, que e o campo que preenche os dois que o ponto nao
      // preenche. Sem essa ponte a pessoa procura um botao que nao existe.
      expect(
        TextosDaLocalizacao.oQueCadaCaminhoPreenche.contains('CEP'),
        isTrue,
        reason: 'REPROVA: a frase nao manda a pessoa a lugar nenhum. Dizer so '
            '"o bairro nao vem do GPS" deixa a tarefa sem saida; o CEP esta na '
            'tela e preenche bairro e estado.',
      );
    });
  });

  group('o formulario do achado nasce preenchido (22/10/2026)', () {
    testWidgets('a cidade da localizacao autorizada NASCE no campo',
        (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloCidade))
            .controller
            ?.text,
        'Sao Paulo',
        reason:
            'REPROVA: a pessoa autorizou a localizacao e o campo `Cidade` '
            'abriu VAZIO. O cliente pediu em 22/10 que o formulario nasca '
            'preenchido, "apenas como uma facilidade para ele nao ter que '
            'preencher todos os campos" -- e a cidade e o unico campo que o '
            'contrato exige para o "onde" existir (`Area.required: [city]`).',
      );
    });

    testWidgets('o que a PESSOA digitou NAO e sobrescrito pela localizacao',
        (tester) async {
      // A decisao de 17/10/2026, intacta: *"o que a pessoa ja escreveu vence"*.
      // Aqui ela e medida na janela que de verdade existe -- o ponto chega e os
      // campos aparecem ANTES de o nome da cidade ser resolvido.
      final porta = _PortaComCidadeNaMao();
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      // Os campos estao na tela e a resolucao ainda corre: ela digita.
      await tester.enterText(
        _campo(TextosDaLocalizacao.rotuloCidade),
        'Campinas',
      );
      await tester.pumpAndSettle();

      // Agora a localizacao responde, com OUTRA cidade.
      porta.cidadeChega.complete(CidadeResolvida('Sao Paulo'));
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloCidade))
            .controller
            ?.text,
        'Campinas',
        reason:
            'REPROVA: a localizacao passou por cima do que a PESSOA digitou. '
            'Decisao do cliente de 17/10/2026: o que ela escreveu vence o '
            'preenchimento automatico -- ela esta olhando o lugar onde achou o '
            'animal, e a plataforma erra. O mecanismo que separa "veio da '
            'conveniencia" de "ela escreveu" e `OrigemDosValores`, e um '
            '`_cidade.text = ...` cru o contorna.',
      );
    });

    testWidgets('ISCA -- o bairro NAO e derivado da coordenada (ADR-0006 '
        'emenda 1)', (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloBairro))
            .controller
            ?.text,
        isEmpty,
        reason:
            'REPROVA: o campo `Bairro` nasceu preenchido a partir da '
            'coordenada. A emenda 1 do ADR-0006 autoriza UM sentido e UM nivel '
            '-- coordenada -> nome de CIDADE --, e a tabela do que ela nao '
            'autoriza nomeia este caso: *"coordenada -> bairro: a emenda fala '
            'de cidade. Bairro e mais fino que o que a pessoa escolheu '
            'entregar"*. O bairro continua sendo o campo que a PESSOA preenche.',
      );
    });

    testWidgets(
      'o CEP nao sobrescreve o que a PESSOA corrigiu num campo pre-preenchido',
      (tester) async {
        // **ESTE CASO E A OUTRA METADE DE `OrigemDosValores`, e sem ele o reuso
        // ficava pela metade.**
        //
        // A sequencia que o defeito exige, e ela e realista: a localizacao
        // preenche `Cidade`; a pessoa CORRIGE para a cidade onde achou o
        // animal; depois digita o CEP do lugar. Se o campo continuar marcado
        // como "cedido", a busca de CEP passa por cima da correcao dela -- a
        // decisao de 17/10/2026 ao contrario, e em silencio.
        //
        // Quem conserta e `_origem.soltar(...)` no `aoMudar` dos campos.
        //
        // DESLIGAR PARA VER REPROVAR: apague
        // `aoMudar: (_) => _origem.soltar(_chaveCidade),` do campo `Cidade` em
        // `lib/telas/localizacao/captura_de_localizacao.dart`.
        // -> reprova ESTE caso, e so ele.
        final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
        await _montar(
          tester,
          localizacao: porta,
          pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
          buscaDeCep: BuscaDeCep(
            cliente: MockClient((req) async {
              // A forma do ViaCEP, que e o servico PRINCIPAL: a reserva nao e
              // consultada quando este responde `encontrado`.
              //
              // **SEM `expect` AQUI DENTRO, e isso custou uma reprova
              // fantasma:** um `expect` dentro do `MockClient` corre fora da
              // chamada do caso e, falhando, derruba o caso com a mensagem de
              // OUTRA afirmacao -- o caso reprovou dizendo que o bairro nao
              // tinha sido preenchido, e o bairro estava certo. Dublê
              // responde; quem afirma e o caso.
              return http.Response(
                '{"logradouro":"Rua X","bairro":"Centro",'
                '"localidade":"Santos","uf":"SP"}',
                200,
                headers: <String, String>{
                  'content-type': 'application/json; charset=utf-8',
                },
              );
            }),
          ),
        );
        await tocar(
          tester,
          find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
        );

        // A localizacao preencheu `Sao Paulo`; ela corrige para `Campinas`.
        await tester.enterText(
          _campo(TextosDaLocalizacao.rotuloCidade),
          'Campinas',
        );
        await tester.pumpAndSettle();

        // E agora digita o CEP, que devolve `Santos`.
        await tester.enterText(_campo(TextosDaLocalizacao.rotuloCep), '11010001');
        await tester.pumpAndSettle();

        expect(
          tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloCidade))
              .controller
              ?.text,
          'Campinas',
          reason:
              'REPROVA: a busca de CEP sobrescreveu a cidade que a PESSOA '
              'corrigiu. O campo saiu de "valor da localizacao" no primeiro '
              'toque dela nele, e dali em diante vale a regra de 17/10/2026: o '
              'que ela escreveu VENCE o que a base devolve. Sem '
              '`OrigemDosValores.soltar` no `aoMudar`, o campo continua '
              'marcado como cedido e o CEP o troca em silencio.',
        );
        // E o BAIRRO, que ninguem tocou, RECEBE -- senao este caso estaria
        // medindo "a busca de CEP nao funciona", que e o outro defeito.
        expect(
          tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloBairro))
              .controller
              ?.text,
          'Centro',
          reason:
              'REPROVA: a busca de CEP nao preencheu o bairro, que estava '
              'VAZIO. Lido como `isEmpty` puro num formulario que nasce cheio, '
              'o CEP para de preencher qualquer coisa -- e ai o caso de cima '
              'ficaria verde pelo motivo errado.',
        );
      },
    );

    testWidgets('ISCA -- nenhuma coordenada entra em campo do formulario',
        (tester) async {
      // Irmao do caso `a coordenada NUNCA e mostrada na tela` (caso 4), e NAO
      // o mesmo: aquele varre o texto RENDERIZADO, este varre o CONTEUDO DOS
      // CAMPOS -- que e o que viaja para o servidor e, dali, para a projecao
      // publica. Um `lat,lon` escrito no campo `Cidade` sairia em `city`.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(
        tester,
        localizacao: porta,
        pontoDeUso: PontoDeUsoDaLocalizacao.marcarPerdido,
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );

      for (final rotulo in <String>[
        TextosDaLocalizacao.rotuloBairro,
        TextosDaLocalizacao.rotuloCidade,
        TextosDaLocalizacao.rotuloCep,
      ]) {
        final texto = tester
                .widget<TextField>(_campo(rotulo))
                .controller
                ?.text ??
            '';
        for (final pedaco in <String>['23.55', '46.63', '23,55', '46,63']) {
          expect(
            texto.contains(pedaco),
            isFalse,
            reason:
                'REPROVA: o campo `$rotulo` carrega "$pedaco". Coordenada nao '
                'entra em campo de formulario: o que esta nos campos viaja no '
                'corpo e aparece na projecao publica, e o nivel maximo que o '
                'produto expoe e bairro e cidade (ADR-0010 itens 4 e 5).',
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // VEIO DE `registrar_achado_dois_passos_test.dart` EM 29/10/2026
  //
  // A decisao do cliente de 17/10/2026 -- *"(opcional)" so quando ela E
  // opcional"* -- tem DOIS lados, e o lado `com ponto` era medido pela tela do
  // achado. O achado deixou de capturar coordenada (decisao de 29/10), entao
  // aquele caso passou a medir um estado impossivel; o lado `sem ponto`
  // continua la, porque na tela do achado a cidade e obrigatoria sempre.
  //
  // Aqui o par fica inteiro: sem ponto ela e cobrada, com ponto ela nao e.
  // Sem este caso, travar a cidade como obrigatoria na peca inteira nao
  // reprovaria nada.
  // -------------------------------------------------------------------------
  group('o rotulo "(opcional)" da cidade diz a verdade nos dois estados', () {
    testWidgets('SEM ponto, a cidade NAO e opcional', (tester) async {
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.naoPedida);
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro).first,
      );

      expect(
        _campoDeclarado(tester, TextosDaLocalizacao.rotuloCidade).opcional,
        isFalse,
        reason: 'REPROVA: a cidade aparece como "(opcional)" sem haver ponto. '
            'Ela e o unico campo que faz o `onde` existir '
            '(`Area.required: [city]`), e dizer que ela e dispensavel e o que '
            'deixa o botao de envio morto com o formulario inteiro cheio.',
      );
    });

    testWidgets('COM ponto, a cidade volta a ser opcional', (tester) async {
      // `concedida` sem `resultado`: a porta decide pelo estado e devolve
      // ponto, que e o que a implementacao de verdade faz.
      final porta = LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);
      await _montar(tester, localizacao: porta);

      await tocar(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao).first,
      );
      await tester.pumpAndSettle();

      expect(
        _campoDeclarado(tester, TextosDaLocalizacao.rotuloCidade).opcional,
        isTrue,
        reason: 'REPROVA: com a coordenada em maos o `onde` ja existe, e a '
            'cidade passa a ser mesmo opcional. Cobra-la aqui seria mentir no '
            'outro sentido.',
      );
    });
  });

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

    // **PELO ENUM, E NAO PELA TELA, DESDE 29/10/2026.**
    //
    // Este caso montava a peca com `registrarAchado` e tocava em `Usar minha
    // localizacao` para ver a antessala. **Esse caminho nao existe mais**: por
    // decisao do cliente o achado abre direto nos campos de endereco e nao
    // oferece captura, entao nao ha botao para tocar e a antessala nunca
    // aparece por F3.5.
    //
    // O criterio 4 continua sendo uma afirmacao sobre o TEXTO -- que titulo e
    // corpo a antessala usa quando o ponto de uso e o achado --, e e isso que
    // se mede aqui. Encenar um toque que a pessoa nao pode dar mediria a
    // montagem do teste, e nao o produto.
    //
    // Se o achado voltar a oferecer captura, este caso volta a ser de widget.
    test('F3.5 (registrar achado) usa o texto do criterio 4', () {
      expect(
        PontoDeUsoDaLocalizacao.registrarAchado.titulo,
        TextosDaLocalizacao.tituloAchado,
        reason: 'REPROVA: o ponto de uso do achado nao usa o titulo do '
            'criterio 4.',
      );
      expect(
        PontoDeUsoDaLocalizacao.registrarAchado.corpo,
        TextosDaLocalizacao.corpoAchado,
        reason: 'REPROVA: o ponto de uso do achado nao usa o corpo do '
            'criterio 4.',
      );
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
