// OS WIDGETS DE VERDADE DO APP, montados para medicao.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE, E O QUE ELE CONSERTA NO PORTAO
// ---------------------------------------------------------------------------
// `telas.dart` monta REPLICAS: telas escritas a mao a partir de
// `design/tokens.json`, e o cabecalho dele diz isso com todas as letras --
// *"Nao sao o app"*. Elas provam que o verificador sabe aprovar e sabe
// reprovar, e isso continua valendo.
//
// O QUE ELAS NAO PROVAM, e o que custou um defeito na mao do cliente em
// 03/11/2026: que o APP monta os pares certos. A pastilha de filtro marcada
// pintava `on-action-fill` -- a tinta que pertence ao preenchimento de acao --
// sobre `primary`, o bordo da marca. 2.10:1 no tema claro, abaixo do piso de
// 4.5 E do de 3.0, numa superficie que a pessoa usa para filtrar Comunidade e
// Eventos. O job `contraste` da esteira estava VERDE, e estava verde por tres
// razoes que se somam:
//
//   1. a trava A (`contraste_texto_test.dart`) renderiza, mas renderiza as
//      replicas de `telas.dart`. Nenhum widget do app e montado em lugar
//      nenhum dela, entao a pastilha nunca passou na frente do verificador;
//   2. a pastilha mora numa FOLHA INFERIOR (`_FolhaDeFiltros`, aberta por
//      `showModalBottomSheet`). Mesmo uma varredura de telas pararia na tela:
//      a folha so existe depois de um toque;
//   3. a trava B (`contraste_tokens_test.dart`) mede uma LISTA de 86 pares
//      que vive em `design/contrast-pairs.json`, mantida a mao. `on-action-fill`
//      e medido ali contra `action-fill` e `action-fill-pressed`, e so. Contra
//      `primary` quem e medido e `on-primary`. O par que o app montava nao
//      estava na lista, e lista a mao nao reprova o que ninguem lembrou de
//      escrever.
//
// Este arquivo ataca a CLASSE das tres: ele monta os widgets do app, nos dois
// temas, ABRINDO a folha inferior, e entrega a arvore renderizada ao mesmo
// verificador. O par medido passa a ser o par que o app DE FATO monta, e nao
// um inventario.
//
// ---------------------------------------------------------------------------
// ELE USA O TEMA DO APP, E NAO OS TOKENS DO DISCO
// ---------------------------------------------------------------------------
// Aqui a fonte e `BichuTheme.claro`/`BichuTheme.escuro`, que leem
// `bichu_tokens.g.dart`. E de proposito, e e o inverso de `telas.dart`: o que
// se mede aqui e o que o aparelho pinta. O portao que confere se o Dart gerado
// bate com `design/tokens.json` ja existe e e outro (`verificar-tokens-gerados`
// no job `tokens`); duplica-lo aqui mediria o gerador duas vezes e o app
// nenhuma.
//
// ---------------------------------------------------------------------------
// ESTADO E O QUE PEGA ESTA CLASSE DE DEFEITO
// ---------------------------------------------------------------------------
// O par trocado nasceu dentro de um ternario:
//
//   color: marcada ? cores.onActionFill : cores.textPrimary
//
// Um dos dois ramos estava certo. Montar o widget num estado so deixaria
// metade do defeito fora da medicao, e foi assim que ele chegou ao cliente --
// no tema escuro o mesmo par da 8.10:1 e passa por acidente, porque la
// `primary` e um rosa claro. Por isso toda montagem daqui leva os DOIS temas e
// os DOIS estados.

library;

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/api/reautenticacao.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/convite_de_passkey.dart';
import 'package:bichu/widgets/folha_de_senha.dart';
import 'package:bichu/widgets/folha_destrutiva.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// `json200`, `problema` e `urlBaseDeTeste` vivem na ajuda de tela do pacote.
// O caminho relativo atravessa o link simbolico `app/test/a11y`, que e como
// `acao_de_controle_test.dart` ja importa a mesma ajuda.
import '../telas/ajuda_de_tela.dart';

/// A casca minima com o TEMA DO APP instalado.
///
/// `BichuColors` vive no `ThemeData` e os componentes estouram sem ele, de
/// proposito. O `Scaffold` pinta `scaffoldBackgroundColor: c.surface`, que e o
/// que da ao verificador um fundo solido para medir contra -- sem ele todo
/// texto viraria violacao `indeterminado`.
Widget cascaReal({required bool escuro, required Widget child}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: escuro ? BichuTheme.escuro : BichuTheme.claro,
    home: Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: child,
        ),
      ),
    ),
  );
}

/// Um filtro com DOIS grupos e uma opcao JA MARCADA.
///
/// A opcao marcada nao e detalhe: e ela que faz o ramo `marcada` do ternario
/// da pastilha ser pintado. Com `selecionado` nulo nos dois grupos, a folha
/// abriria com todas as pastilhas no ramo nao-marcado e o defeito de 2.10:1
/// nao apareceria em medicao nenhuma.
ControleDeFiltro filtroComUmaMarcada() {
  return const ControleDeFiltro(
    grupos: <GrupoDeFiltro>[
      GrupoDeFiltro(
        chave: 'kind',
        titulo: 'Atividade',
        selecionado: 'vet',
        opcoes: <OpcaoDeRecorte>[
          OpcaoDeRecorte(codigo: 'vet', rotulo: 'Veterinário'),
          OpcaoDeRecorte(codigo: 'walker', rotulo: 'Passeador'),
        ],
      ),
      GrupoDeFiltro(
        chave: 'level',
        titulo: 'Verificação',
        selecionado: null,
        opcoes: <OpcaoDeRecorte>[
          OpcaoDeRecorte(codigo: 'contact', rotulo: 'Contato verificado'),
        ],
      ),
    ],
  );
}

/// Monta a barra de listagem e **ABRE a folha de filtros**, que e onde a
/// pastilha mora.
///
/// O toque e parte da medicao, nao andaime: a folha e um `showModalBottomSheet`
/// e nao existe na arvore antes dele.
Future<void> abrirAFolhaDeFiltros(
  WidgetTester tester, {
  required bool escuro,
}) async {
  await tester.pumpWidget(
    cascaReal(
      escuro: escuro,
      child: BarraDeListagem(
        total: 12,
        filtro: filtroComUmaMarcada(),
        ordenacao: const ControleDeOrdenacao(
          opcoes: <OpcaoDeRecorte>[
            OpcaoDeRecorte(codigo: 'recent', rotulo: 'Mais recentes'),
            OpcaoDeRecorte(codigo: 'near', rotulo: 'Mais perto'),
          ],
          efetiva: 'recent',
        ),
        aoAplicar: (_) {},
      ),
    ),
  );
  await tester.pumpAndSettle();

  // CONTROLE POSITIVO DO TOQUE: sem o gatilho na arvore nao ha folha a abrir,
  // e um `tap` que nao casa deixaria a medicao rodando sobre a tela sem a
  // folha -- zero pastilha, zero violacao, verde por cegueira.
  expect(
    find.byIcon(Icons.tune),
    findsOneWidget,
    reason:
        'REPROVA: nao achei o gatilho da folha de filtros. Sem ele a folha '
        'nao abre e a pastilha nao entra na medicao.',
  );
  await tester.tap(find.byIcon(Icons.tune));
  await tester.pumpAndSettle();
}

/// Os dois distintivos de contador da barra de listagem, lado a lado.
Widget distintivosDaListagem({required bool escuro}) {
  final acao = AcaoDeListagem(
    rotulo: 'Filtros, 3 ativos',
    distintivo: '3',
    aoTocar: () {},
  );
  return cascaReal(
    escuro: escuro,
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: <Widget>[
        GatilhoDeRecorteNoCorpo(acao: acao),
        BotaoDeAcaoDaListagem(acao: acao),
      ],
    ),
  );
}

/// O botao primario nos dois estados.
///
/// A ISENCAO DO ROTULO DESABILITADO E SO DO TEXTO, e o giro de carga DENTRO do
/// mesmo botao NAO esta isento de nada: ele continua sendo medido pelo
/// verificador de objeto grafico (SC 1.4.11), que tem prefixo de isencao
/// proprio. Era exatamente por essa fresta que um giro de 1.02:1 passava.
Widget botoesPrimarios({required bool escuro}) {
  return cascaReal(
    escuro: escuro,
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        BotaoPrimario(rotulo: 'Avisar o tutor', aoTocar: () {}),
        const SizedBox(height: BichuEspaco.e4),
        // SEM CHAVE DE ISENCAO, de proposito. O rotulo deste botao esta
        // isento pelo SC 1.4.3 por o controle estar INATIVO, e o verificador
        // le isso do `enabled` do proprio botao (`isentarInativo`). Pendurar
        // uma chave aqui seria declarar no andaime um estado que o widget ja
        // declara, e a chave passaria a valer mesmo se o botao voltasse a
        // ficar ativo.
        const BotaoPrimario(
          rotulo: 'Enviando',
          aoTocar: null,
          carregando: true,
        ),
      ],
    ),
  );
}

/// O DISTINTIVO DA ABA, com contagem.
///
/// `SinoDeNotificacoes` tem um distintivo de estrutura IDENTICA a este -- o
/// mesmo `Container` com `BoxDecoration(color: cores.primary)` e o mesmo
/// `Text` por cima -- e **ele ficou fora desta galeria**, nao por ser
/// diferente, mas porque o `build` dele comeca em `Escopo.of(context).sessao`
/// e devolve `SizedBox.shrink()` fora do estado `logado`: montar o sino exige
/// uma sessao de mentira, que e andaime de outro assunto. O par dele foi
/// medido a mao e consertado junto; o que nao esta medido POR PORTAO e ele, e
/// isso esta dito aqui em vez de parecer coberto.
Widget distintivoDaAbaComContagem({required bool escuro}) {
  return cascaReal(
    escuro: escuro,
    child: const Center(
      child: DistintivoDaAba(
        glifo: Icon(Icons.pets_outlined),
        naoLidas: 3,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// OS TRES BOTOES PREENCHIDOS DO MESMO MECANISMO (04/11/2026)
// ---------------------------------------------------------------------------
//
// Eles entraram na galeria porque o conserto deles entrou na mesma PR, e a
// razao e dita aqui para a proxima pessoa: se o portao alcanca um defeito e o
// conserto fica fora, a branch nasce vermelha depois da mescla OU o portao
// precisa de isencao para ele -- e isencao que sobra aprova o furo quando ele
// voltar. Conserto sem guarda e conserto com prazo.
//
// Os tres pintavam o rotulo com `textos.labelLarge` PELADO, que carrega
// `text-primary` do tema e vence o `foregroundColor` do botao:
//
//   folha_de_senha.dart      rotulo sobre `primary`      2.10 claro / 1.87 escuro
//   folha_destrutiva.dart    rotulo sobre `urgency`      2.35 claro / 9.92 escuro
//   convite_de_passkey.dart  rotulo sobre `action-fill`  9.35 claro / 1.62 escuro
//
// Note que cada um reprova num tema DIFERENTE, e os tres sao o mesmo defeito.
// E por isso que toda montagem daqui leva os dois temas: um portao de um tema
// so teria pego um de tres.

/// A FOLHA DE SENHA das seis operacoes destrutivas, ATIVA.
///
/// Ativa e nao carregando, de proposito: o defeito esta no rotulo do botao
/// HABILITADO, e `isentarInativo` -- que o caso liga -- dispensaria o rotulo se
/// o botao estivesse desabilitado. Medir a folha so no estado de carga mediria
/// justamente o estado que a norma isenta.
///
/// A PORTA E A DE VERDADE (`AuthApi` sobre `ApiClient`), com um cliente que
/// nunca e chamado: este caso nao toca em `Confirmar`. Um duble de `AuthApi`
/// seria mais curto e nao diria nada diferente aqui, mas a bancada da folha ja
/// e esta em `test/widgets/folha_de_senha_test.dart` e duas bancadas da mesma
/// peca divergem na primeira edicao.
Widget folhaDeSenhaReal({required bool escuro}) {
  final cliente = MockClient((http.Request pedido) async {
    throw StateError(
      'REPROVA: a medicao de contraste nao deveria chamar o servidor. '
      'Se este cliente foi chamado, o caso passou a exercer o fluxo da folha '
      'em vez de medir a cor dela.',
    );
  });
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://exemplo.invalido'),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-medicao',
  );

  return cascaReal(
    escuro: escuro,
    child: FolhaDeSenha(
      auth: AuthApi(api),
      escopo: EscopoDeReautenticacao.exclusaoDaConta,
    ),
  );
}

/// A FOLHA DESTRUTIVA, ativa.
Widget folhaDestrutivaReal({required bool escuro}) {
  return cascaReal(
    escuro: escuro,
    child: FolhaDestrutiva(
      titulo: 'Excluir o pet',
      corpo: 'Isto nao tem volta.',
      oQueSome: const <String>['As fotos', 'O historico'],
      rotuloDeConfirmar: 'Excluir',
      rotuloAcessivelDeConfirmar: 'Excluir o pet, sem volta',
      rotuloDeCancelar: 'Cancelar',
      aoConfirmar: () async {},
    ),
  );
}

/// O CONVITE DE PASSKEY, ativo.
///
/// O `build` dele nao toca `Escopo` -- so os callbacks de `_ativar` e
/// `_naoQuero` tocam --, e e por isso que ele monta sem sessao de mentira.
/// Medido, nao suposto: um `build` que lesse o escopo estouraria aqui.
Widget conviteDePasskeyReal({required bool escuro}) {
  return cascaReal(
    escuro: escuro,
    child: const ConviteDePasskey(rotuloDoAparelho: 'Aparelho de medicao'),
  );
}

// ---------------------------------------------------------------------------
// O MURAL (04/11/2026)
// ---------------------------------------------------------------------------
//
// O defeito: o CORACAO de "curtido" da linha de acoes do cartao pintava
// `cores.urgency` -- a tinta de PREENCHIMENTO do banner de pet perdido --
// sobre `cores.surface`, que e o que o proprio cartao pinta
// (`tela_do_mural.dart`, o `Container` do cartao). No tema escuro `urgency` e
// `ember.800` (#6B220A) e `surface` e `bark.900` (#17150F): dois marrons
// quase pretos, **1.62:1**, piso de 3.0 do SC 1.4.11 para icone. No claro o
// mesmo par da 6.99:1 e passava -- de novo um tema so, de novo o acidente que
// faz o defeito parecer intencional.
//
// E A MESMA CLASSE DE 03/11, pela terceira vez: tinta de um preenchimento
// pintada sobre outra superficie. `urgency` tem a tinta dela, que e
// `on-urgency`, e ela vale SOBRE `urgency` -- nao sobre a superficie do
// cartao.
//
// POR QUE NENHUM PORTAO ALCANCAVA:
//
//   1. `widgets_reais.dart` nao montava o Mural. A galeria cobria os widgets
//      COMPARTILHADOS (`widgets/`), e o coracao mora numa TELA
//      (`telas/mural/`), que e justamente o que o cabecalho deste arquivo
//      declarou fora de cobertura (BICHUS-322);
//   2. dos 86 pares de `design/contrast-pairs.json`, `urgency` nao aparece
//      como FRENTE em nenhum -- medido, com controle positivo: o filtro casou
//      os 4 pares em que `urgency` aparece como FUNDO (`banner-perdido` e
//      `selo-perdido`, nos dois temas) antes de a ausencia valer. Quem e
//      medido como frente e `on-urgency`. Par que ninguem escreveu, lista a
//      mao nao reprova.
//
// O CONSERTO usa um par QUE A TABELA JA PUBLICA, e a escolha nao e minha:
// `icone-pet-selecionado-sobre-surface` ja declara `primary` sobre `surface`,
// piso 3.0, razao 7.84 no claro e 8.59 no escuro, veredito `passa`. O coracao
// e estruturalmente o MESMO objeto daquele par -- um icone de ESTADO
// (selecionado / nao selecionado) sobre a superficie do cartao -- e o par do
// nao-curtido, `text-secondary` sobre `surface`, e literalmente
// `icone-pet-sobre-surface` (8.60 / 9.31). O app estava discordando da propria
// tabela em UM dos dois ramos.
//
// `urgency` foi RECUSADA como frente, e nao por ser ilegivel so no escuro:
// urgency e o vocabulario de PET PERDIDO no produto (banner, selo, faixa). Um
// coracao de curtida vestindo a cor do pet perdido disputa aquele significado
// na mesma lista onde os dois aparecem -- o cartao de pet perdido e a
// publicacao do Mural convivem na timeline.

/// Uma publicacao do Mural, com o coracao no estado que o caso pede.
///
/// `curtiEu` NAO E detalhe de fixture: e ele que escolhe o ramo do ternario
/// `_curti ? cores.urgency : cores.textSecondary`. Montar um estado so
/// deixaria metade do defeito fora da medicao, que e exatamente como ele
/// chegou ao cliente.
Map<String, dynamic> publicacaoDoMural({required bool curtida}) {
  return <String, dynamic>{
    'ref': 'AaBbCcDdEeFfGgHhIiJjK1',
    'body': 'o Bidu no parque',
    'created_at': '2026-10-20T12:00:00.000Z',
    'image': null,
    'like_count': curtida ? 3 : 0,
    'comment_count': 2,
    'liked_by_me': curtida,
    'author': <String, dynamic>{
      'handle': 'marina-vet',
      'display_name': 'Marina',
      'photo_icon_url': null,
    },
    'mine': false,
  };
}

/// Monta O MURAL DE VERDADE (`CorpoDoMural` sobre `MuralApi` sobre
/// `ApiClient`) com uma publicacao, e deixa o coracao no estado pedido.
///
/// A PORTA E A DE VERDADE pelo mesmo motivo de `folhaDeSenhaReal`: um duble de
/// `InteracaoDoMural` devolveria qualquer coisa para qualquer rota e o estado
/// `curtiEu` deixaria de vir do corpo da resposta -- o fixture passaria a
/// afirmar o ramo em vez de produzi-lo. Aqui o `liked_by_me` atravessa o
/// decodificador do app, como no aparelho.
///
/// A REDE RESPONDE 404 FORA DAS DUAS ROTAS DE LEITURA, de proposito: este caso
/// mede cor e nao exerce fluxo nenhum. Um toque no coracao que escapasse para
/// a rede apareceria como 404 e nao como sucesso silencioso.
Future<void> montarOMural(
  WidgetTester tester, {
  required bool escuro,
  required bool curtida,
}) async {
  // Janela alta: o `ListView` do Mural nao constroi o que esta fora da
  // viewport, e a LINHA DE ACOES -- onde o coracao mora -- fica abaixo da
  // dobra na janela padrao. Sem isto o coracao nunca entra na arvore e a
  // medicao sai verde por nao ter olhado para nada.
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final publicacao = publicacaoDoMural(curtida: curtida);
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient((http.Request req) async {
      final caminho = req.url.path;
      if (caminho == '/v1/timeline' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <Map<String, dynamic>>[publicacao],
          'next_cursor': null,
        });
      }
      if (caminho == '/v1/me/publications' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <dynamic>[],
          'next_cursor': null,
        });
      }
      return problema('not-found', 404);
    }),
    tokenDeAcesso: () async => 'token-de-medicao',
  );

  await tester.pumpWidget(
    cascaReal(
      escuro: escuro,
      child: SingleChildScrollView(
        child: CorpoDoMural(
          leitura: MuralApi(api),
          interacao: MuralApi(api),
          canalConfirmado: true,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
