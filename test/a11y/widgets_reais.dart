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

import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
