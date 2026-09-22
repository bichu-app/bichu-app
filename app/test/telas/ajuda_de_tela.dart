// Ferramentas comuns dos testes de tela desta entrega.
//
// NAO e um arquivo de teste: nao termina em `_test.dart` de proposito, para a
// descoberta do `flutter test` nao tentar rodar um arquivo sem casos.
//
// Duas decisoes aqui valem para todos os arquivos que a usam:
//
// 1. **Os testes montam o app inteiro, e nao a tela solta.** A tela depende do
//    `Escopo`, do `GoRouter` e do tema; montada fora deles ela passaria num
//    teste e quebraria no aparelho. Montar o app tambem e o que faz o teste
//    percorrer tela, camada de API, `ApiClient` e traducao de `Problem` -- um
//    teste que chamasse a funcao de mensagem direto continuaria verde no dia
//    em que a tela parasse de usa-la.
//
// 2. **A rede e sempre um `MockClient` explicito.** Nenhum caso depende de o
//    servidor existir, e nenhum caso inventa uma resposta de sucesso para uma
//    rota que o backend ainda nao tem: quando o teste precisa do caminho de
//    erro, ele manda o erro **que o contrato declara**, com o `type` que o
//    contrato declara.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/api/fila_offline.dart';
import 'package:bichu/api/imagem_do_qr.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String urlBaseDeTeste = 'http://localhost:3000';

/// Um rascunho com o passo 1 completo, pronto para a F1.4.
///
/// Mora aqui, e nao em cada arquivo, porque mais de um teste precisa chegar a
/// tela da foto e a rota recusa `extra` nulo caindo em F1.3 -- um caso que
/// esquecesse o rascunho reprovaria pelo motivo errado.
RascunhoDePet rascunhoParaFoto({String nome = 'Nina'}) {
  return RascunhoDePet()
    ..nome = nome
    ..especie = Especie.cao
    ..porte = Porte.medio;
}

/// O piso critico: 64 dp de altura **e** largura (design system 6.5, UX 15.1).
///
/// Mede os dois porque o documento manda "64 dp de altura e largura total", e
/// um botao de 300 x 40 passaria numa verificacao que so olhasse area.
const double pisoCritico = 64;

/// O piso generico do produto.
const double pisoMinimo = 48;

/// Uma camera que responde o que o caso pedir, nos quatro estados.
///
/// Existe porque permissao no aparelho e dialogo, e nao configuracao: os tres
/// estados de recusa levam a telas diferentes, e o terceiro (negada
/// permanentemente) e justamente o que ninguem lembra de exercitar a mao.
class CameraDeTeste implements CameraEGaleria {
  CameraDeTeste(this.estado, {this.depoisDePedir, this.foto});

  EstadoDaPermissao estado;

  /// O que `pedirCamera` devolve. Nulo mantem [estado].
  final EstadoDaPermissao? depoisDePedir;

  final FotoLocal? foto;

  bool abriuAjustes = false;

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async => estado;

  @override
  Future<EstadoDaPermissao> pedirCamera() async {
    estado = depoisDePedir ?? estado;
    return estado;
  }

  @override
  Future<void> abrirAjustesDoSistema() async => abriuAjustes = true;

  @override
  Future<FotoLocal?> tirarFoto() async => foto;

  @override
  Future<FotoLocal?> escolherDaGaleria() async => foto;
}

/// Avisos que respondem o que o caso pedir, nos quatro estados.
///
/// Existe pelo mesmo motivo da [CameraDeTeste], com um agravante: o dialogo de
/// notificacao do iOS e mostrado **uma unica vez**, entao o estado que mais
/// importa aqui e `naoPedida` -- e a unica forma de verificar que o app nao
/// gasta essa chance sozinho e um duble que CONTA quantas vezes foi pedido.
class AvisosDeTeste implements Avisos {
  AvisosDeTeste(
    this.estadoAtual, {
    this.plataforma = PlataformaDeAviso.android,
    this.depoisDePedir,
    this.tokenDoAparelho = 'token-fcm-descartavel',
  });

  /// Sem plataforma o app nao tem push: e o estado de um build em que o
  /// Firebase nao inicializou.
  @override
  final PlataformaDeAviso? plataforma;

  PermissaoDeAviso estadoAtual;

  /// O que `pedir` devolve. Nulo mantem [estadoAtual].
  final PermissaoDeAviso? depoisDePedir;

  final String tokenDoAparelho;

  /// **O contador que sustenta a isca.** Se ele passar de zero num caso em que
  /// a pessoa nao pediu, o app queimou a chance unica do sistema.
  int vezesQuePediu = 0;

  /// Zero aqui prova que o arranque do app nao encosta na permissao.
  int vezesQueConsultouEstado = 0;

  @override
  Future<PermissaoDeAviso> estado() async {
    vezesQueConsultouEstado += 1;
    return estadoAtual;
  }

  @override
  Future<PermissaoDeAviso> pedir() async {
    vezesQuePediu += 1;
    estadoAtual = depoisDePedir ?? estadoAtual;
    return estadoAtual;
  }

  @override
  Future<String?> token() async =>
      estadoAtual == PermissaoDeAviso.concedida ? tokenDoAparelho : null;
}

/// Uma resposta `application/problem+json` do contrato.
///
/// O `title` e **deliberadamente enganoso** onde faz diferenca: se alguma tela
/// passar a decidir pelo texto do servidor em vez do `type`, o caso reprova.
http.Response problema(String slug, int status, {Map<String, dynamic>? extra}) {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'type': 'https://api.bichu.app/problems/$slug',
      'title': 'Nao foi possivel concluir',
      'status': status,
      ...?extra,
    }),
    status,
    headers: <String, String>{
      'content-type': 'application/problem+json; charset=utf-8',
    },
  );
}

http.Response json200(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

/// A lista fechada de `GET /v1/public/reference-data`, no formato do contrato.
Map<String, dynamic> referenciaDeTeste() {
  return <String, dynamic>{
    'version': '2026-09-17',
    'species': <Map<String, dynamic>>[
      <String, dynamic>{'code': 'dog', 'label': 'Cão'},
    ],
    'breeds': <Map<String, dynamic>>[
      // Vira-lata **esta na lista**, e a ajuda do campo promete isso.
      <String, dynamic>{
        'code': 'srd',
        'label': 'Vira-lata (SRD)',
        'species': 'dog',
      },
      <String, dynamic>{
        'code': 'shih_tzu',
        'label': 'Shih Tzu',
        'species': 'dog',
      },
    ],
    'colors': <Map<String, dynamic>>[
      <String, dynamic>{'code': 'caramelo', 'label': 'Caramelo'},
      <String, dynamic>{'code': 'preto', 'label': 'Preto'},
    ],
    'sizes': <Map<String, dynamic>>[
      <String, dynamic>{'code': 'M', 'label': 'Médio'},
    ],
  };
}

/// A fila offline **em memoria**, com o conteudo a vista.
///
/// Existe pelo mesmo motivo do `DepositoDeIntencaoEmMemoria`: o
/// `DepositoEmArquivo` chama `getApplicationDocumentsDirectory()`, que e um
/// canal de plataforma que nao existe em teste de widget -- sem esta injecao
/// qualquer caso que enfileire trava num `Future` que nunca resolve.
///
/// O conteudo fica **publico e cru**, e nao atras de um `FilaOffline`: os
/// casos desta entrega precisam conferir o que foi gravado no disco (a chave
/// de idempotencia, o corpo) e precisam conferir que o logout esvaziou o
/// arquivo, e nao so a lista em memoria de uma instancia.
class DepositoDaFilaEmMemoria implements DepositoDaFila {
  String? conteudo;

  /// Quantas vezes o app mandou gravar. Zero prova que nada enfileirou.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    gravacoes += 1;
    conteudo = texto;
  }

  /// As acoes gravadas, decodificadas.
  List<Map<String, dynamic>> get acoes {
    final bruto = conteudo;
    if (bruto == null || bruto.isEmpty) return const <Map<String, dynamic>>[];
    return (jsonDecode(bruto) as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList(growable: false);
  }
}

/// Uma sessao ja aberta no deposito, como a de quem abre o app logado.
///
/// O `id` entra porque o cache de `Meus pets` e trancado por dono: dois casos
/// que usem contas diferentes precisam de ids diferentes, senao um deles
/// passaria lendo o que o outro guardou.
DepositoEmMemoria depositoLogado({
  String id = 'u-1',
  String email = 'marina@exemplo.com.br',
  bool emailVerificado = true,
  /// A regiao cadastrada pelo tutor (`Me.reference_area`, BICHUS-92). E ela
  /// que preenche o bairro em F3.1 sem geocodificar nada (criterio 2 da
  /// BICHUS-21); nula, o campo abre vazio e com o foco dentro dele.
  RegiaoDeReferencia? regiaoDeReferencia,
}) {
  final deposito = DepositoEmMemoria()
    ..gravar(
      Sessao(
        accessToken: 'token-de-teste',
        refreshToken: 'refresh-de-teste',
        expiraEm: DateTime.now().add(const Duration(hours: 1)),
        usuario: Usuario(
          id: id,
          email: email,
          emailVerificado: emailVerificado,
          pendencias: const <PendenciaDeCadastro>[],
          podeAbrirCaso: true,
          regiaoDeReferencia: regiaoDeReferencia,
        ),
      ),
    );
  return deposito;
}

/// Monta o app com a rede e a camera que o caso pedir.
Future<DepositoDeIntencaoEmMemoria> abrirOApp(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  CameraEGaleria? camera,
  Avisos? avisos,
  DepositoDeIntencaoEmMemoria? envelope,
  DepositoDeSessao? deposito,
  CacheDeMeusPets? cacheDeMeusPets,
  /// A fila offline. Em memoria sempre, pelo motivo do proprio tipo.
  DepositoDaFilaEmMemoria? depositoDaFila,
  /// O cofre da imagem do QR. Entra por aqui porque o caso do logout precisa
  /// OLHAR dentro dele depois de a sessao cair, e o que ele guarda e uma
  /// credencial.
  CofreDaImagemDoQr? cofreDoQr,
  /// A escala de fonte do sistema. `null` usa a do ambiente (1,0).
  ///
  /// Entra por aqui, e nao por um `pumpWidget` proprio no caso, porque o
  /// `BichuApp` aplica um `clamp` de 1 a 2 no proprio `builder`: um caso que
  /// montasse a arvore sozinho estaria exercitando outra coisa que nao o app.
  double? escala,
}) async {
  AppConfig.limparParaTeste();
  // O envelope de intencao vai EM MEMORIA aqui, sempre.
  //
  // O padrao do app e `DepositoDeIntencaoEmArquivo`, que chama
  // `getApplicationDocumentsDirectory()` -- um canal de plataforma que nao
  // existe em teste de widget. Sem esta injecao, qualquer teste que faca a tela
  // GUARDAR uma intencao trava para sempre, sem mensagem: o `pumpAndSettle`
  // espera um Future que nunca resolve. Custou uma execucao travada para
  // descobrir, e o sintoma nao aponta para a causa.
  final envelopeEmUso = envelope ?? DepositoDeIntencaoEmMemoria();
  Widget comEscala(Widget app) {
    if (escala == null) return app;
    return MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(escala)),
      child: app,
    );
  }

  await tester.pumpWidget(
    comEscala(
      BichuApp(
        config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
        deposito: deposito ?? DepositoEmMemoria(),
        depositoDeIntencao: envelopeEmUso,
        clienteHttp: MockClient(rede),
        cacheDeMeusPets: cacheDeMeusPets,
        cofreDoQr: cofreDoQr,
        depositoDaFila: depositoDaFila ?? DepositoDaFilaEmMemoria(),
        camera: camera ?? const CameraNaoEmbarcada(),
        // O padrao e o mesmo do app quando o Firebase nao subiu: nenhum canal de
        // plataforma esta ligado em teste de widget, e um `FirebaseMessaging`
        // de verdade travaria a suite num `Future` que nunca resolve.
        avisos: avisos ?? const AvisosNaoEmbarcados(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return envelopeEmUso;
}

/// O `Escopo` do app montado.
///
/// Existe para os casos que precisam chamar o CONTROLADOR e nao o botao: os
/// quatro desfechos de `sair()` passam pelo controlador, e um deles -- o
/// refresh recusado -- nao passa por tela nenhuma. Um caso que so tocasse no
/// botao de sair mediria um dos quatro.
Escopo escopoDoApp(WidgetTester tester) {
  return Escopo.of(tester.element(find.byType(Scaffold).first));
}

/// As rotas que o `GoRouter` do app de fato registra.
///
/// Lidas do roteador montado, e nao de uma lista escrita a mao: uma lista a
/// mao seria a segunda fonte da verdade, e continuaria dizendo que a rota
/// existe no dia em que alguem a apagasse.
Set<String> rotasRegistradasDoApp(WidgetTester tester) {
  final roteador = GoRouter.of(tester.element(find.byType(Scaffold).first));
  final achadas = <String>{};
  void visitar(List<RouteBase> rotas) {
    for (final rota in rotas) {
      if (rota is GoRoute) achadas.add(rota.path);
      visitar(rota.routes);
      if (rota is StatefulShellRoute) {
        for (final ramo in rota.branches) {
          visitar(ramo.routes);
        }
      } else if (rota is ShellRouteBase) {
        visitar(rota.routes);
      }
    }
  }

  visitar(roteador.configuration.routes);
  return achadas;
}

/// Navega pelo roteador de verdade, com o `extra` que a rota espera.
///
/// Pelo roteador, e nao montando a tela solta: o `extra` e parte do contrato
/// de navegacao destas telas (o rascunho do assistente nao viaja pela URL), e
/// um teste que pulasse o roteador nao pegaria a rota que esquece de
/// repassa-lo.
Future<void> irPara(
  WidgetTester tester,
  String rota, {
  Object? extra,
}) async {
  final contexto = tester.element(find.byType(Scaffold).first);
  GoRouter.of(contexto).push(rota, extra: extra);
  await tester.pumpAndSettle();
}

/// Rola ate o controle e toca nele.
///
/// As telas de cadastro sao longas de proposito (F1.3 tem sete controles e
/// F1.5 tem um bloco de ajuda de quatro paragrafos), e um `tap` num widget
/// abaixo da dobra nao acerta nada. Rolar antes e o que a pessoa faz.
Future<void> tocar(WidgetTester tester, Finder alvo) async {
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// Rola a lista da tela ate [alvo] existir na arvore.
///
/// `ListView` so constroi o que cabe na tela, entao `find` nao enxerga o que
/// esta abaixo da dobra: um `expect` que espera achar algo la embaixo reprova
/// por um motivo que nao e o do caso. Isto rola primeiro, como a pessoa faria.
Future<void> rolarAte(
  WidgetTester tester,
  Finder alvo, {
  /// Positivo desce, negativo sobe. `scrollUntilVisible` so procura num
  /// sentido, entao quem procura algo acima da dobra precisa dizer.
  double passo = 120,
}) async {
  if (alvo.evaluate().isNotEmpty) {
    await tester.ensureVisible(alvo);
    await tester.pumpAndSettle();
    return;
  }
  await tester.scrollUntilVisible(
    alvo,
    passo,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

/// O tamanho do alvo tocavel que contem [alvo].
///
/// Olha o **alvo**, e nao o desenho do icone nem a caixa do texto: e o alvo
/// que o polegar acerta.
Size tamanhoDoAlvo(WidgetTester tester, Finder alvo) {
  return tester.getSize(alvo);
}

/// Exige que um controle seja anunciavel por leitor de tela.
///
/// A pergunta nao e "existe um widget": e "o VoiceOver e o TalkBack conseguem
/// dizer o nome disto". Um `IconButton` sem tooltip nem rotulo semantico e
/// anunciado como "botão" e nada mais (WCAG 2.1 SC 4.1.2).
void exigirRotuloAnunciavel(
  WidgetTester tester,
  String rotulo, {
  required String na,
}) {
  // A arvore de semantica so existe quando alguem a liga. Sem este handle, o
  // finder de rotulo nao tem onde procurar, e o caso "passaria" por nao estar
  // olhando para nada -- que e pior que nao ter o caso.
  final handle = tester.ensureSemantics();
  try {
    expect(
      find.bySemanticsLabel(rotulo),
      findsAtLeastNWidgets(1),
      reason: 'REPROVA: "$rotulo" nao tem nome acessivel em $na. Quem usa '
          'leitor de tela ouve "botão" e nada mais (WCAG 2.1 SC 4.1.2).',
    );
  } finally {
    handle.dispose();
  }
}

/// Atende o canal da area de transferencia.
///
/// Em teste de widget nenhum plugin esta ligado, e `Clipboard.setData` estoura
/// com `MissingPluginException` -- o que derruba o `Copiar o código` por um
/// motivo que nao existe no aparelho. Devolve o que foi copiado, para o caso
/// conferir que foi o codigo certo.
List<String> atenderAAreaDeTransferencia(WidgetTester tester) {
  final copiado = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (chamada) async {
      if (chamada.method == 'Clipboard.setData') {
        copiado.add((chamada.arguments as Map<Object?, Object?>)['text']
                as String? ??
            '');
      }
      return null;
    },
  );
  addTearDown(() {
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });
  return copiado;
}
