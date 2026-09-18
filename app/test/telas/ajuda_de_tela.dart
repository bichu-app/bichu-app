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

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String urlBaseDeTeste = 'http://localhost:3000';

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

/// Monta o app com a rede e a camera que o caso pedir.
Future<void> abrirOApp(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  CameraEGaleria? camera,
}) async {
  AppConfig.limparParaTeste();
  await tester.pumpWidget(
    BichuApp(
      config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
      deposito: DepositoEmMemoria(),
      clienteHttp: MockClient(rede),
      camera: camera ?? const CameraNaoEmbarcada(),
    ),
  );
  await tester.pumpAndSettle();
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
