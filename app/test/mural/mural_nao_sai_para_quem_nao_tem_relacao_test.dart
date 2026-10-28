// **ISCA (b), METADE DO APP: nao-conexao nao ve a timeline nem a publicacao.**
//
// ===========================================================================
// POR QUE A METADE DO APP E SOBRE A AUSENCIA DE OUTRA FONTE
// ===========================================================================
// O recorte de quem ve o que **nao e desta camada, e nao pode ser**: ele mora
// na clausula `WHERE` da consulta do servidor (ADR-0021), e e medido lá com
// mutacao do predicado em
// `src/modules/publications/adapters/persistence/autorizacao-na-clausula-where.test.ts`.
//
// Entao o que o app tem de garantir e outra coisa, e ela e tao importante
// quanto: **que nao existe no aplicativo nenhuma segunda fonte de publicacao.**
// Um filtro de tela seria o recorte migrando para o cliente -- e o cliente e
// onde ele nao pode estar. Uma segunda leitura (por apelido, por `ref`, por um
// cache) seria um caminho que o `WHERE` do servidor nao governa.
//
// Os casos abaixo medem as duas pontas disso:
//
//   1. a tela desenha EXATAMENTE o que `GET /timeline` devolveu -- zero itens
//      viram zero cartoes, e tres itens viram tres;
//   2. **nenhum arquivo de `app/lib` pede publicacao por outro caminho.** A
//      varredura e do CODIGO-FONTE, e e ela que reprova a leitura nova que
//      alguem acrescentar amanha;
//   3. `mine` vem do SERVIDOR e decide `Apagar` ou `Denunciar` -- a tela nunca
//      compara apelidos para descobrir de quem e a publicacao.
//
// ===========================================================================
// TODO CASO AQUI E ISCA, E AS ISCAS ESTAO NOMEADAS
// ===========================================================================
// Nenhum caso mede a presenca de um literal. Cada um diz, no corpo, o que
// desligar no codigo para ve-lo reprovar.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../dispositivo/diretivas_dart.dart';
import '../telas/ajuda_de_tela.dart';

const String urlDaImagemDaPublicacao =
    'https://img.exemplo/people/card/aaaa.jpeg';

/// A `thumb` de 176 da foto do AUTOR (Emenda 5 do ADR-0010). **Caminho
/// diferente da imagem da publicacao de proposito**: e o que permite os casos
/// distinguirem as duas `ImagemDaRede` do cartao pela URL, em vez de pela ordem
/// na arvore -- que mudaria no dia em que o cartao ganhasse mais uma imagem.
const String urlDoIconeDoAutorDeTeste =
    'https://img.exemplo/people/thumb/bbbb.jpeg';

Map<String, dynamic> publicacao({
  required String ref,
  required String texto,
  String nome = 'Marina',
  String? apelido = 'marina-vet',
  bool minha = false,
  bool comFoto = false,
  String? textoAlternativo,
  String? urlDoIconeDoAutor,
}) {
  return <String, dynamic>{
    'ref': ref,
    'body': texto,
    'created_at': '2026-10-20T12:00:00.000Z',
    'image': comFoto
        ? <String, dynamic>{
            'url': urlDaImagemDaPublicacao,
            'alt_text': textoAlternativo,
          }
        : null,
    'author': <String, dynamic>{
      'handle': apelido,
      'display_name': nome,
      'photo_icon_url': urlDoIconeDoAutor,
    },
    'mine': minha,
  };
}

/// A rede do Mural: a linha do tempo e as minhas publicacoes.
///
/// **404 em qualquer outra rota**, e e isso que faz o caso (1) valer: se a tela
/// buscasse publicacao por outro caminho, a requisicao levaria 404 e os
/// `expect` por caminho diriam qual foi.
Future<http.Response> Function(http.Request) redeDoMural({
  required List<http.Request> capturado,
  List<Map<String, dynamic>> linha = const <Map<String, dynamic>>[],
  List<Map<String, dynamic>> minhas = const <Map<String, dynamic>>[],
}) {
  return (req) async {
    capturado.add(req);
    if (req.url.path == '/v1/timeline' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': linha, 'next_cursor': null});
    }
    if (req.url.path == '/v1/me/publications' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': minhas, 'next_cursor': null});
    }
    return problema('not-found', 404);
  };
}

/// Monta o corpo do Mural com a porta de VERDADE (`MuralApi` sobre
/// `ApiClient`), e nao com um duble de interface.
///
/// **E isso que faz estes casos medirem o CAMINHO pedido.** Um duble de
/// `LeituraDoMural` responderia igual para qualquer rota, e o caso (1) -- "a
/// tela nao busca publicacao por outro caminho" -- nao teria o que observar.
Future<List<http.Request>> montarOMural(
  WidgetTester tester, {
  List<Map<String, dynamic>> linha = const <Map<String, dynamic>>[],
  List<Map<String, dynamic>> minhas = const <Map<String, dynamic>>[],
  void Function(PublicacaoDaLinha)? aoDenunciar,
  Future<void> Function(PublicacaoDaLinha)? aoApagar,
}) async {
  AppConfig.limparParaTeste();
  final capturado = <http.Request>[];
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient(redeDoMural(capturado: capturado, linha: linha, minhas: minhas)),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: CorpoDoMural(
            // UMA porta, DUAS interfaces estreitas -- a mesma fiacao de
            // `AbaMural`. E e a porta DE VERDADE: um duble responderia igual
            // para qualquer rota, e os casos de CAMINHO nao teriam o que medir.
            leitura: MuralApi(api),
            interacao: MuralApi(api),
            aoDenunciar: aoDenunciar,
            aoApagar: aoApagar,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return capturado;
}

/// Os caminhos que o app pediu, em ordem. E por eles que os casos reprovam
/// dizendo QUAL rota saiu, em vez de "a tela ficou vazia".
List<String> caminhos(List<http.Request> capturado) =>
    capturado.map((p) => '${p.method} ${p.url.path}').toList();

void main() {
  // =========================================================================
  // (1) A TELA DESENHA O QUE A LINHA DO TEMPO DEVOLVEU, E NADA MAIS
  // =========================================================================

  testWidgets(
      'ISCA (b) — linha do tempo VAZIA desenha ZERO cartoes, e a tela nao '
      'inventa publicacao nenhuma', (tester) async {
    // ISCA: em `CorpoDoMural.build`, acrescentar qualquer item que nao venha de
    // `linha` -- um cartao de exemplo, um "talvez voce conheca", um cache. Este
    // caso reprova pelo nome na contagem.
    //
    // **E o cartao de sugestao e o caso concreto que a Emenda 3 do ADR-0010
    // proibe:** o desenho registra, como REGRA, que "no dia em que o Mural
    // mostrar qualquer cartao de autor que NAO seja conexao aceita -- uma
    // sugestao, uma descoberta, um 'talvez voce conheca' --, esse cartao nao
    // pode trazer foto nem apelido". Nao ha cartao assim, de proposito.
    final capturado = await montarOMural(tester);

    expect(find.byType(ImagemDaRede), findsNothing);
    expect(find.textContaining('Marina'), findsNothing);
    // O estado vazio aparece, e ele e o de "sem conexao": `minhas` tambem veio
    // vazia.
    expect(find.text(CorpoDoMural.tituloSemConexao), findsOneWidget);

    // E as DUAS leituras sairam, e so elas.
    expect(caminhos(capturado), <String>[
      'GET /v1/timeline',
      'GET /v1/me/publications',
    ]);
  });

  testWidgets(
      'CONTRAPESO — tres publicacoes na resposta desenham TRES cartoes',
      (tester) async {
    // Sem este contrapeso, o caso de cima passaria num mundo em que a tela nao
    // desenha NADA nunca -- que e a forma mais facil de um teste de omissao
    // ficar verde sem ter medido nada.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'o Bidu no parque'),
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK2',
          texto: 'achei um gato na rua',
          nome: 'Joana',
        ),
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK3',
          texto: 'minha vez de publicar',
          minha: true,
          nome: 'Eu',
        ),
      ],
    );

    expect(find.text('o Bidu no parque'), findsOneWidget);
    expect(find.text('achei um gato na rua'), findsOneWidget);
    expect(find.text('minha vez de publicar'), findsOneWidget);
    expect(find.text('Marina'), findsOneWidget);
    expect(find.text('Joana'), findsOneWidget);
    // E o estado vazio NAO aparece quando ha itens.
    expect(find.text(CorpoDoMural.tituloSemConexao), findsNothing);
    expect(find.text(CorpoDoMural.tituloSemPublicacao), findsNothing);
  });

  testWidgets(
      'ISCA (b) — a QUANTIDADE de cartoes e EXATAMENTE a da resposta, e o '
      'excedente reprova', (tester) async {
    // **Este caso existe por causa de um buraco medido no caso de cima.**
    //
    // "Linha vazia desenha zero cartoes" curto-circuita no estado vazio: o
    // `if (linha.isEmpty)` devolve antes de a lista ser construida. Entao um
    // cartao INVENTADO -- uma sugestao, um "talvez voce conheca", um cache --
    // acrescentado ao caminho da lista **nao apareceria** naquele caso, porque
    // naquele caso a lista nem roda. Medido: desligando o codigo e injetando um
    // cartao de sugestao, aquele caso ficou VERDE.
    //
    // Este conta. Um `⋮` por cartao, com as duas acoes ligadas: tres itens na
    // resposta sao tres menus, e o quarto e o cartao que ninguem pediu.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'um'),
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK2', texto: 'dois'),
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK3', texto: 'tres'),
      ],
      aoDenunciar: (_) {},
      aoApagar: (_) async {},
    );
    expect(
      find.byType(PopupMenuButton<String>),
      findsNWidgets(3),
      reason:
          'o numero de cartoes nao e o numero de publicacoes que o servidor '
          'devolveu. Um cartao a mais e conteudo que o `WHERE` do servidor nao '
          'governou -- e o desenho do Mural registra, como REGRA, que um cartao '
          'de autor que nao seja conexao aceita nao pode existir aqui',
    );
  });

  // =========================================================================
  // (2) NENHUMA SEGUNDA FONTE DE PUBLICACAO EM `app/lib`
  // =========================================================================

  /// O codigo de um arquivo Dart, **sem os comentarios**.
  ///
  /// Descobrir que isto era necessario valeu duas reprovacoes deste proprio
  /// arquivo, e as duas sao a mesma forma de portao cego ao contrario -- o que
  /// reprova o certo:
  ///
  ///   1. a varredura de "publicacao por apelido" casou o caminho
  ///      `/people/{apelido}/publications` escrito na PROSA de
  ///      `mural_api.dart`, que esta la justamente para dizer que a rota **nao
  ///      existe**. Uma varredura de texto puro reprova exatamente a frase que
  ///      documenta a ausencia;
  ///   2. a varredura de leitura por `ref` casou
  ///      `POST /publications/{ref}/reports` em `seguranca_api.dart` -- que e a
  ///      DENUNCIA, legitima, no contrato desde 18/10, e que esta frente LIGOU
  ///      a publicacao em vez de substituir.
  ///
  /// Entao: comentario fora, e o verbo HTTP dentro do criterio.
  ///
  /// ## 21/10/2026 -- A LIMPEZA POR PREFIXO DE LINHA NAO ERA LIMPEZA
  ///
  /// A primeira versao desta funcao descartava a linha cujo texto, ja sem o
  /// recuo, COMECASSE com `//` ou `///`. Ela deixava passar as duas formas que
  /// mais aparecem na prosa deste repositorio:
  ///
  ///     /* get('/timeline') */            // comentario de BLOCO
  ///     algumaCoisa();  // get('/timeline')   // comentario NO FIM da linha
  ///
  /// Nos dois casos a prosa chegava inteira ao criterio, e o criterio e uma
  /// igualdade de lista: um arquivo a mais em `ondeAparece` REPROVA. Era o
  /// mesmo defeito que as duas reprovacoes de cima descrevem, so que pelas
  /// formas que a correcao anterior nao cobriu.
  ///
  /// `semComentarios` de `diretivas_dart.dart` e o leitor que o portao
  /// estrutural das telas ja usa: ele percorre o fonte como o analisador
  /// percorre -- entende literal de texto (simples, duplo, triplo, cru),
  /// entende escape, e trata comentario de bloco ANINHADO, que o Dart aceita.
  /// Literal de texto fica DE PE de proposito: `get('/timeline')` e codigo, e
  /// e exatamente por dentro de um literal que o caminho chega ao `http`.
  String codigoDe(File arquivo) => semComentarios(arquivo.readAsStringSync());

  /// O criterio da varredura (2), UM objeto so.
  ///
  /// Ele esta aqui fora, e nao dentro do caso, porque as ISCAS DE LEITURA
  /// abaixo precisam medir **o mesmo criterio** que o portao aplica. Isca que
  /// recria a expressao na mao prova que a copia dela funciona, nao que o
  /// portao funciona -- e as duas podem divergir no primeiro refator.
  final leituraDePublicacao = RegExp(
    r"""\.get\(\s*['"][^'"]*(publications|timeline)""",
  );

  // -----------------------------------------------------------------------
  // ISCAS DE LEITURA DO PROPRIO PORTAO -- AS DUAS DIRECOES
  // -----------------------------------------------------------------------
  //
  // **As duas sao obrigatorias, e a segunda e a que importa mais.** A primeira
  // prova que o falso positivo morreu: prosa que cita a rota nao reprova. A
  // segunda prova que a limpeza NAO cegou o portao: a chamada de verdade
  // continua sendo achada. Sem ela, trocar `codigoDe` por `(_) => ''` deixaria
  // este arquivo inteiro verde -- que e o mesmo defeito virado do outro lado, e
  // esse nao da sinal nenhum.
  group('a leitura do portao: comentario nao e codigo, codigo e codigo', () {
    test('NAO acusa a rota citada em comentario -- as TRES formas', () {
      const prosa = '''
// Esta tela nao faz _api.get('/timeline') de proposito.
/// Nem _api.get('/me/publications'): quem le publicacao e MuralApi.
/* _api.get('/publications/abc') tampouco. */
void nada() {}
''';
      expect(
        leituraDePublicacao.hasMatch(semComentarios(prosa)),
        isFalse,
        reason:
            'achado FALSO: a prosa que documenta a AUSENCIA da rota foi lida '
            'como leitura dela. Foi assim que este arquivo reprovou duas vezes '
            'antes, e a limpeza por prefixo de linha nao pegava bloco nem fim '
            'de linha.',
      );
    });

    test('REPROVA a chamada de verdade, inclusive depois de prosa que a cita',
        () {
      const codigo = '''
// Comentario que cita _api.get('/timeline') para explicar o portao.
Future<void> leitura() async {
  await _api.get('/timeline');
}
''';
      expect(
        leituraDePublicacao.hasMatch(semComentarios(codigo)),
        isTrue,
        reason:
            'o portao ficou CEGO: a chamada de verdade deixou de ser achada. '
            'Uma limpeza gulosa -- apagar a LINHA que tenha `//` -- produz '
            'exatamente este resultado, e um portao cego aprova o furo em '
            'silencio.',
      );
    });

    test('REPROVA a chamada escrita com aspa DUPLA e com espaco', () {
      expect(
        leituraDePublicacao.hasMatch(
          semComentarios('await _api.get( "/me/publications" );'),
        ),
        isTrue,
        reason:
            'a forma com aspa dupla e a de quem vem de outra linguagem, e o '
            '`prefer_single_quotes` ja esteve desligado neste repositorio.',
      );
    });
  });

  test(
      'ISCA (b) — `app/lib` LE publicacao em UM lugar so, e e `MuralApi`', () {
    // **A VARREDURA E DO CODIGO-FONTE, e e ela que envelhece bem**: ela reprova
    // a leitura que alguem acrescentar amanha, nao a que existe hoje.
    //
    // ISCA: acrescentar em qualquer arquivo de `app/lib` um `get` de
    // `/timeline`, de `/me/publications` ou de `/publications/...`. Este caso
    // reprova pelo nome, dizendo o arquivo.
    //
    // **O criterio e o VERBO, e nao so o caminho**, e a razao e medida: a
    // DENUNCIA de publicacao e `POST /publications/{ref}/reports`, ela e
    // legitima, ela existe no contrato desde 18/10 e esta frente a LIGOU a
    // publicacao em vez de criar outra. Uma varredura por caminho a reprovaria,
    // e o que ela tem de reprovar e LEITURA.
    //
    // **`grep` nao serve aqui**, e isso e medido nesta maquina: o `grep` e
    // `ugrep` e ele ignora em silencio arquivo Dart com acento. A varredura e
    // de Dart lendo os arquivos.
    final raiz = Directory('lib');
    expect(raiz.existsSync(), isTrue, reason: 'a varredura rodou fora de `app/`');

    // `get('/...publications...')` ou `get('/timeline')`, em qualquer forma de
    // chamada: `_api.get`, `_cliente.get`, `api.get`.
    final leitura = leituraDePublicacao;

    final ondeAparece = <String>[];
    for (final entrada in raiz.listSync(recursive: true)) {
      if (entrada is! File || !entrada.path.endsWith('.dart')) continue;
      if (leitura.hasMatch(codigoDe(entrada))) ondeAparece.add(entrada.path);
    }

    expect(
      ondeAparece,
      <String>['lib/api/mural_api.dart'],
      reason:
          'publicacao LIDA de outro arquivo: $ondeAparece. A UNICA porta e '
          '`MuralApi`, e a unica leitura de publicacao de outra pessoa e '
          '`GET /timeline` -- cujo recorte mora no `WHERE` do servidor. Uma '
          'segunda fonte seria um caminho que aquele `WHERE` nao governa.',
    );
  });

  test(
      'CONTRAPESO — a denuncia de publicacao CONTINUA em `seguranca_api.dart`, '
      'e ela e a que ja existia', () {
    // Sem este contrapeso, o caso de cima passaria num mundo em que ninguem
    // denuncia publicacao nenhuma -- e a instrucao desta fatia era LIGAR a
    // denuncia que ja existe, nao substitui-la.
    final seguranca = codigoDe(File('lib/api/seguranca_api.dart'));
    expect(
      seguranca.contains('/publications/'),
      isTrue,
      reason:
          'a denuncia de publicacao desapareceu de `seguranca_api.dart`. Ela e '
          '`POST /publications/{ref}/reports`, existe no contrato desde 18/10, '
          'e esta frente a LIGOU a publicacao -- nao criou uma segunda',
    );
    expect(
      seguranca.contains('/reports'),
      isTrue,
      reason: 'a denuncia deixou de ser uma denuncia',
    );
  });

  test(
      'ISCA (b) — a varredura REPROVA uma leitura de publicacao acrescentada '
      'depois', () {
    // Sem esta isca, o caso de cima passaria por nao haver arquivo intruso -- e
    // nao por ele saber reconhecer um. E exatamente o defeito dos onze portoes
    // cegos desta rodada.
    const intruso = """
      final p = await _cliente.get('/timeline');
    """;
    expect(
      intruso.contains("'/timeline'"),
      isTrue,
      reason: 'a agulha da varredura nao casa a forma de uma chamada real',
    );
    const porRef = "await _cliente.get('/publications/\$ref');";
    expect(
      RegExp(r"'/publications/\$").hasMatch(porRef),
      isTrue,
      reason:
          'a varredura nao enxerga uma leitura de publicacao por `ref`: '
          'ela nao mede nada',
    );
  });

  test(
      'ISCA (b) — `app/lib` nao pede publicacao de uma PESSOA por apelido',
      () {
    // `/people/{apelido}/publications` seria a linha do tempo de alguem, e a
    // Emenda 2 do ADR-0010 a recusa por nome. Ela nao existe no contrato, e
    // este caso garante que o app nao a invente.
    // **O CODIGO, e nao a prosa**: a documentacao de `mural_api.dart` cita
    // `/people/{apelido}/publications` de proposito, para dizer que a rota NAO
    // existe -- e uma varredura de texto puro reprovaria exatamente a frase
    // que documenta a ausencia. Isto reprovou na primeira execucao deste
    // arquivo, e e por isso que `codigoDe` existe.
    final intrusos = <String>[];
    for (final entrada in Directory('lib').listSync(recursive: true)) {
      if (entrada is! File || !entrada.path.endsWith('.dart')) continue;
      if (RegExp(r'/(people|pessoa|users)/[^\x27"]*/(publications|timeline)')
          .hasMatch(codigoDe(entrada))) {
        intrusos.add(entrada.path);
      }
    }
    expect(intrusos, isEmpty, reason: 'nasceu a linha do tempo de outra pessoa');
  });

  // =========================================================================
  // (3) `mine` VEM DO SERVIDOR, E E ELE QUE DECIDE A ACAO DO CARTAO
  // =========================================================================

  testWidgets(
      'ISCA (b) — publicacao de OUTRA pessoa oferece `Denunciar` e NAO '
      '`Apagar`', (tester) async {
    // ISCA: em `_CartaoDaPublicacao._menu`, trocar `publicacao.minha` por
    // `true`, ou comparar apelidos em vez de ler o campo. Este caso reprova
    // pelo nome nos dois `expect`.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'da Marina'),
      ],
      aoDenunciar: (_) {},
      aoApagar: (_) async {},
    );

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();

    expect(find.text('Denunciar'), findsOneWidget);
    expect(
      find.text('Apagar'),
      findsNothing,
      reason:
          'a tela ofereceu apagar a publicacao de outra pessoa. O servidor '
          'responderia 404 -- mas a tela teria mentido, e e a tela que a '
          'pessoa le',
    );
  });

  testWidgets(
      'ISCA (b) — a PROPRIA publicacao oferece `Apagar` e NAO `Denunciar`',
      (tester) async {
    // Denunciar o proprio conteudo nao tem desfecho: o caminho e apagar, que e
    // imediato, e o servidor responde `400 own_content` a quem tentar.
    // Oferecer as duas seria desenhar um controle cujo unico desfecho e um
    // erro.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'minha',
          minha: true,
          nome: 'Eu',
        ),
      ],
      aoDenunciar: (_) {},
      aoApagar: (_) async {},
    );

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();

    expect(find.text('Apagar'), findsOneWidget);
    expect(find.text('Denunciar'), findsNothing);
  });

  testWidgets(
      'ISCA (b) — sem `aoDenunciar` e sem `aoApagar` o `⋮` NAO NASCE',
      (tester) async {
    // Criterio 2 da BICHUS-62: acao sem destino nao se renderiza, nem
    // habilitada nem desabilitada. Um `⋮` que abre uma folha vazia e um toque
    // que termina em nada.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'da Marina'),
      ],
    );
    expect(find.byType(PopupMenuButton<String>), findsNothing);
    // E o cartao continua inteiro: o texto e o autor estao la.
    expect(find.text('da Marina'), findsOneWidget);
  });

  // =========================================================================
  // (4) A FOTO DA PUBLICACAO, E O ROTULO DE QUEM NAO VE
  // =========================================================================

  testWidgets(
      'a foto usa `ImagemDaRede` com a derivada de 1024 e proporcao 1:1',
      (tester) async {
    // `Image.network` cru nao trata `cacheWidth` nem `errorBuilder`, e e o que
    // levou a vitrine da `Loja` a 9,8 MB numa tela. A proporcao 1:1 e o que faz
    // o cartao reservar a altura antes de os bytes chegarem -- sem ela a
    // rolagem salta a cada imagem que termina de carregar.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'olha ele',
          comFoto: true,
          textoAlternativo: 'o Bidu correndo na grama',
        ),
      ],
    );
    final imagem = tester.widget<ImagemDaRede>(find.byType(ImagemDaRede));
    expect(imagem.url, urlDaImagemDaPublicacao);
    expect(imagem.proporcao, 1);
    expect(imagem.descricao, 'o Bidu correndo na grama');
  });

  testWidgets(
      'ISCA — foto SEM descricao recebe rotulo GENERICO, e nao e escondida do '
      'leitor de tela', (tester) async {
    // **A decisao de `alt_text` opcional depende deste caso.** O rotulo e
    // opcional porque `body` e obrigatorio e o leitor de tela sempre tem o que
    // anunciar -- mas sem foto anunciada a pessoa nao saberia que ha uma
    // imagem ali.
    //
    // ISCA: em `_CartaoDaPublicacao.build`, trocar o rotulo generico por
    // `null`. `ImagemDaRede` com `descricao: null` embrulha em
    // `ExcludeSemantics`, e a foto desaparece para quem usa leitor de tela.
    // Este caso reprova pelo nome.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'olha ele',
          comFoto: true,
        ),
      ],
    );
    final imagem = tester.widget<ImagemDaRede>(find.byType(ImagemDaRede));
    expect(
      imagem.descricao,
      CorpoDoMural.fotoSemDescricao,
      reason:
          'a foto sem descricao ficou DECORATIVA: quem nao ve deixou de saber '
          'que ha uma foto na publicacao',
    );
  });

  // =========================================================================
  // (5) OS DOIS ESTADOS VAZIOS SAO DIFERENTES
  // =========================================================================

  testWidgets(
      'ISCA — sem conexao E sem publicacao propria, o texto diz COMECE PELAS '
      'CONEXOES', (tester) async {
    // ISCA: em `CorpoDoMural.build`, fixar `_tenhoPublicacao` em `true`. Os
    // dois estados colapsam num e a tela passa a dizer "quando as suas conexoes
    // publicarem" a quem nao tem conexao nenhuma -- prometendo algo de
    // ninguem. Este caso reprova pelo nome.
    await montarOMural(tester);
    expect(find.text(CorpoDoMural.tituloSemConexao), findsOneWidget);
    expect(find.text(CorpoDoMural.tituloSemPublicacao), findsNothing);
  });

  testWidgets(
      'ISCA — com publicacao PROPRIA e linha vazia, o texto diz que as '
      'publicacoes APARECEM aqui', (tester) async {
    // A distincao sai de `listMyPublications`, que NAO depende de conexao. Sem
    // a segunda leitura os dois estados ficam indistinguiveis, e a tela escolhe
    // a frase errada em metade dos casos.
    final capturado = await montarOMural(
      tester,
      minhas: <Map<String, dynamic>>[
        <String, dynamic>{
          'ref': 'AaBbCcDdEeFfGgHhIiJjK9',
          'body': 'publiquei e ninguem me segue',
          'created_at': '2026-10-20T12:00:00.000Z',
          'image': null,
        },
      ],
    );
    expect(find.text(CorpoDoMural.tituloSemPublicacao), findsOneWidget);
    expect(find.text(CorpoDoMural.tituloSemConexao), findsNothing);
    // E a segunda leitura saiu de verdade.
    expect(caminhos(capturado), contains('GET /v1/me/publications'));
  });

  testWidgets('o texto do estado vazio NAO promete aviso', (tester) async {
    // O envio de push esta bloqueado em producao por falta de permissao da
    // conta de servico, e a rota de contagem da caixa de notificacoes nem esta
    // no contrato. O sino esta na barra; o aviso nao esta.
    await montarOMural(tester);
    for (final promessa in <String>['avisa', 'avisamos', 'notific', 'alerta']) {
      expect(
        CorpoDoMural.explicacaoSemConexao.toLowerCase().contains(promessa),
        isFalse,
        reason: 'o estado vazio promete aviso ("$promessa"), e nao ha aviso',
      );
      expect(
        CorpoDoMural.explicacaoSemPublicacao.toLowerCase().contains(promessa),
        isFalse,
        reason: 'o estado vazio promete aviso ("$promessa"), e nao ha aviso',
      );
    }
  });

  // =========================================================================
  // (5b) A FOTO DO AUTOR — EMENDA 5 DO ADR-0010 (20/10/2026)
  // =========================================================================

  testWidgets(
      'EMENDA 5 — a foto do autor DESENHA, redonda, 40 dp, pela `thumb` 176',
      (tester) async {
    // Decisao do cliente: *"tras a foto, algo bem parecido com o instagram"*.
    //
    // ISCA: em `_FotoDoAutor.build`, trocar `ImagemDaRede` por `Image.network`
    // cru. A tela pareceria igual e perderia `cacheWidth` e `errorBuilder` --
    // 1 MiB por cartao em vez de 57,6 KiB. Este caso reprova pelo nome.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'o Bidu no parque',
          urlDoIconeDoAutor: urlDoIconeDoAutorDeTeste,
        ),
      ],
    );
    final iconesDoAutor = tester
        .widgetList<ImagemDaRede>(find.byType(ImagemDaRede))
        .where((i) => i.url == urlDoIconeDoAutorDeTeste)
        .toList();
    expect(iconesDoAutor, hasLength(1), reason: 'a foto do autor nao foi desenhada');
    final icone = iconesDoAutor.single;
    // 40 dp: e este numero que vira `cacheWidth` dentro de `ImagemDaRede`.
    expect(icone.largura, 40);
    expect(icone.proporcao, 1);
    // Redonda: metade do lado.
    expect(icone.raio, 20);
    // DECORATIVA: o nome esta ao lado, na mesma linha, e rotular a imagem faria
    // o leitor de tela anunciar a pessoa duas vezes na mesma parada de foco.
    expect(icone.descricao, isNull);
    // O retrato de uma pessoa falhando pede outro desenho que uma fachada.
    expect(icone.simboloDeFalha, Icons.person_outline);
  });

  testWidgets(
      'EMENDA 5 — ISCA: sem foto o cartao desenha a INICIAL, e nao um buraco',
      (tester) async {
    // Nula e o estado normal, em tres casos que a tela nao distingue: a pessoa
    // nao tem foto, a foto nao esta `ready`, ou a conta esta desabilitada.
    //
    // ISCA: em `_FotoDoAutor.build`, devolver `SizedBox.shrink()` no caminho
    // nulo. O cartao perderia o alinhamento e a pessoa sem foto viraria uma
    // linha diferente das outras. Este caso reprova pelo nome.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'sem foto', nome: 'Joana'),
      ],
    );
    expect(find.byType(ImagemDaRede), findsNothing);
    expect(find.text('J'), findsOneWidget, reason: 'a inicial de reserva nao foi desenhada');
    expect(find.text('Joana'), findsOneWidget);
  });

  testWidgets(
      'EMENDA 5 — ISCA: nome VAZIO cai no ponto, e nao numa inicial inventada',
      (tester) async {
    // `display_name` vazio acontece: o servidor manda `''` quando a conta nao
    // tem nome de exibicao. `characters.first` numa cadeia vazia LANCA, e a
    // tela inteira cairia.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(ref: 'AaBbCcDdEeFfGgHhIiJjK1', texto: 'anonimo', nome: ''),
      ],
    );
    expect(find.text('\u00b7'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // ==========================================================================
  // EMENDA 5 (26/10/2026): A REGRA DA FOTO MUDOU, E O QUE ELA PROTEGIA FICOU
  // ==========================================================================
  //
  // **ESTE CASO DIZIA "a foto do autor NAO e um controle: nenhum toque sem
  // destino", e ele estava certo quando foi escrito.** Em 22/10/2026 o cliente
  // pediu o contrario: *"Inclua um link que seja o usuario a pagina do
  // perfil"*, e em 26/10 o toque entrou -- `PortaDoPerfilDoAutor`, em
  // `telas/mural/porta_do_perfil_do_autor.dart`.
  //
  // **A RAZAO DO CASO ANTIGO NAO CAIU: ela foi ATENDIDA, e por isso o caso
  // virou DOIS em vez de sair.** O que ele protegia era *"nenhum toque sem
  // destino"* -- `Rotas.perfilDe` enderecca pelo apelido, e o apelido pode ser
  // nulo. A porta trata o nulo: COM apelido ela monta o controle, SEM apelido
  // devolve a foto crua. As duas metades estao medidas aqui, e apagar este caso
  // em vez de emenda-lo teria perdido a metade que continua valendo.
  //
  // **A conferencia continua na SUBARVORE DA FOTO** e nao no cartao inteiro: a
  // primeira versao exigia ZERO `InkWell` no cartao e ficou errada em 20/10,
  // quando curtir e comentar trouxeram dois `IconButton`. Portao que reprova o
  // controle legitimo e portao que alguem desliga.
  //
  // A NAVEGACAO em si nao se mede aqui -- esta bancada nao monta roteador.
  // Ela esta em `test/mural/perfil_pelo_mural_test.dart`, com `GoRouter` de
  // verdade e o apelido conferido no destino.

  testWidgets(
      'EMENDA 5 — COM APELIDO a foto do autor E um controle: ela abre o perfil',
      (tester) async {
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'x',
          urlDoIconeDoAutor: urlDoIconeDoAutorDeTeste,
        ),
      ],
    );
    final aFoto = find.byType(ImagemDaRede);
    expect(aFoto, findsOneWidget);
    expect(
      find.ancestor(of: aFoto, matching: find.byType(InkWell)),
      findsOneWidget,
      reason: 'REPROVA: a foto do autor COM apelido nao e um controle. O '
          'cliente pediu o link para o perfil em 22/10/2026, e este caso e o '
          'contraponto do de baixo: sem ele, "sem apelido nao linka" ficaria '
          'verde com o toque desligado nos DOIS estados.',
    );
  });

  testWidgets(
      'EMENDA 5 — SEM APELIDO a foto NAO e um controle: nenhum toque sem destino',
      (tester) async {
    // O apelido nulo e o estado normal, e nao erro: `AutorDaPublicacao.apelido`
    // e anulavel no contrato. Um circulo que se anuncia como botao e nao leva a
    // lugar nenhum e o toque sem desfecho que o criterio 2 da BICHUS-62 proibe
    // -- e e exatamente o que a versao antiga deste caso guardava.
    await montarOMural(
      tester,
      linha: <Map<String, dynamic>>[
        publicacao(
          ref: 'AaBbCcDdEeFfGgHhIiJjK1',
          texto: 'x',
          apelido: null,
          urlDoIconeDoAutor: urlDoIconeDoAutorDeTeste,
        ),
      ],
    );
    // ANCORA: a foto continua DESENHADA. O que nao nasce e o controle.
    final aFoto = find.byType(ImagemDaRede);
    expect(
      aFoto,
      findsOneWidget,
      reason: 'REPROVA: sem apelido a foto do autor desapareceu. O toque nao '
          'nasce; o desenho continua.',
    );
    expect(
      find.ancestor(of: aFoto, matching: find.byType(InkWell)),
      findsNothing,
      reason: 'REPROVA: a foto de um autor SEM APELIDO virou um controle, e '
          '`Rotas.perfilDe` precisa do apelido.',
    );
    expect(
      find.ancestor(of: aFoto, matching: find.byType(GestureDetector)),
      findsNothing,
      reason: 'REPROVA: sem apelido a foto ganhou gesto. `InkWell` contem '
          '`GestureDetector`, entao esta linha tambem pega um `InkWell` que '
          'tenha voltado por outro caminho.',
    );
    expect(tester.takeException(), isNull);
  });

  test(
      'EMENDA 5 — `AutorDaPublicacao.doJson` le `photo_icon_url`, e nulo quando falta',
      () {
    final com = AutorDaPublicacao.doJson(<String, dynamic>{
      'handle': 'marina-vet',
      'display_name': 'Marina',
      'photo_icon_url': urlDoIconeDoAutorDeTeste,
    });
    expect(com.urlDoIcone, urlDoIconeDoAutorDeTeste);
    final sem = AutorDaPublicacao.doJson(<String, dynamic>{'display_name': 'Joana'});
    expect(sem.urlDoIcone, isNull, reason: 'campo ausente tem de virar nulo, e nao estourar');
    expect(sem.apelido, isNull);
  });

  // =========================================================================
  // (6) O CARTAO NAO DESENHA PET, CURTIDA NEM CONTADOR
  // =========================================================================

  test(
      'ISCA — o cartao do Mural nao liga PET, e nao tem LISTA de quem curtiu nem '
      'contagem de seguidores', () {
    // **ESTE CASO PERDEU DUAS AGULHAS EM 20/10/2026, e as duas estavam certas
    // quando foram escritas.** Ele proibia `favorite`, `like_count` e
    // `comment_count` porque curtir e comentar **nao existiam**: nao havia
    // tabela, nem operacao, nem campo, e desenhar um coracao que nao conta nada
    // seria uma acao sem destino.
    //
    // As duas existem desde a migracao `20261020000006`, por decisao do cliente
    // de 19/10. Manter as agulhas reprovaria o codigo certo.
    //
    // **O que FICA, e e o que o caso sempre quis dizer:**
    //
    //   - PET nao se liga a publicacao (item 7 do ADR-0010). Foto de pet DENTRO
    //     da foto da publicacao e permitida (cliente, 19/10); ligar a ficha
    //     dele, nao;
    //   - nao existe LISTA de quem curtiu, em superficie nenhuma. O que o
    //     cartao desenha e a CONTAGEM -- item 7 da Emenda 5 do ADR-0010: a
    //     decisao de 19/10 sobre curtir e contagem, e contagem nao diz quem;
    //   - nao existe contagem de SEGUIDORES, porque nao existe seguir -- e
    //     "parecido com o Instagram" foi dito sobre a FOTO.
    final codigo = codigoDe(File('lib/telas/mural/tela_do_mural.dart'));
    for (final agulha in <String>[
      // PET, em qualquer forma.
      'Icons.pets',
      'petId',
      'pet_slug',
      // LISTA de quem curtiu.
      'likedBy',
      'quemCurtiu',
      '/likes',
      // SEGUIR.
      'follower',
      'seguidores',
      'following',
    ]) {
      expect(
        codigo.contains(agulha),
        isFalse,
        reason:
            '`$agulha` entrou no cartao do Mural. Ligar pet a publicacao e o item 7 '
            'do ADR-0010; lista de quem curtiu e contagem de seguidores sao o item 7 '
            'da Emenda 5 -- curtir e CONTAGEM, e nao existe seguir',
      );
    }
    // CONTRAPESO: as duas contagens que DEVEM estar, estao.
    expect(codigo.contains('curtidas'), isTrue, reason: 'o cartao perdeu a contagem de curtidas');
    expect(
      codigo.contains('comentarios'),
      isTrue,
      reason: 'o cartao perdeu a contagem de comentarios',
    );
  });

  test(
      'EMENDA 5 — o Mural le `photo_icon_url` em UM lugar so, e e o AUTOR',
      () {
    // **ESTE CASO MUDOU DE AFIRMACAO EM 20/10/2026, e a mudanca esta medida.**
    //
    // Ele dizia que o Mural nao conhecia `photo_icon_url` -- e estava certo: a
    // Emenda 3 limitava a foto de pessoa a `Conversation.participants[]` *"e em
    // mais nenhuma resposta deste contrato"*. A Emenda 5 nomeou esta superficie,
    // entao a afirmacao antiga deixou de ser verdade.
    //
    // **O que substituiu nao e "pode ler": e "le em UM lugar so".** O campo
    // aparece na leitura do AUTOR e em nenhuma outra, e nenhum dos dois
    // arquivos lê a `card` de 512 -- a emenda nomeia a `thumb` de 176, e a
    // conta dela e medida.
    final leituras = <String, int>{};
    for (final caminho in <String>[
      'lib/telas/mural/tela_do_mural.dart',
      'lib/api/mural_api.dart',
    ]) {
      final codigo = codigoDe(File(caminho));
      leituras[caminho] = RegExp('photo_icon_url').allMatches(codigo).length;
      // **A `card` de 512 nao entra em lugar nenhum.** Ela seria 4,27x mais
      // dado do que o icone de 40 dp pinta, vinte vezes por pagina.
      expect(
        codigo.contains("'photo_card_url'") || codigo.contains('photo_url'),
        isFalse,
        reason: '`$caminho` passou a ler outra derivada da foto de pessoa',
      );
    }
    // UMA leitura, e ela e a do modelo (`mural_api.dart`). A TELA le o modelo,
    // nunca o JSON: ela nao deve conhecer nome de campo do contrato.
    expect(
      leituras['lib/api/mural_api.dart'],
      1,
      reason:
          'o modelo le `photo_icon_url` mais de uma vez, ou nenhuma. Uma leitura e '
          'a da Emenda 5; duas sao dois lugares onde o nome do campo pode divergir',
    );
    expect(
      leituras['lib/telas/mural/tela_do_mural.dart'],
      0,
      reason:
          'a TELA passou a ler o nome do campo do contrato. Ela le o modelo '
          '(`autor.urlDoIcone`), e e o modelo que conhece o contrato',
    );
  });

  // =========================================================================
  // (7) O CORPO DA RESPOSTA, LIDO COMO O SERVIDOR O MANDA
  // =========================================================================

  test('`PublicacaoDaLinha.doJson` nao inventa `mine` quando o campo falta', () {
    // Padrao `false`: na duvida o cartao oferece `Denunciar` e nao `Apagar`. O
    // caminho errado aqui seria oferecer apagar a publicacao de outra pessoa.
    final sem = PublicacaoDaLinha.doJson(
      jsonDecode('{"ref":"AaBbCcDdEeFfGgHhIiJjKk","body":"x"}')
          as Map<String, dynamic>,
    );
    expect(sem.minha, isFalse);
    expect(sem.imagem, isNull);
    expect(sem.autor.apelido, isNull);
  });

  test('foto em `processing` do DONO chega sem URL, e o estado diz por que', () {
    // Antes de o worker reescrever a derivada a foto carrega o EXIF do celular
    // (ADR-0010 item 4). O contrato diz isso no `status`, em vez de deixar o
    // app descobrir pela ausencia da URL.
    final minha = MinhaPublicacao.doJson(<String, dynamic>{
      'ref': 'AaBbCcDdEeFfGgHhIiJjKk',
      'body': 'olha ele',
      'created_at': '2026-10-20T12:00:00.000Z',
      'image': <String, dynamic>{
        'upload_id': '018f7c1e-7a2b-7c3d-9e4f-000000000001',
        'status': 'processing',
        'url': null,
        'rejection_reason': null,
        'alt_text': null,
      },
    });
    expect(minha.imagem?.estado, EstadoDaFotoDaPublicacao.processando);
    expect(minha.imagem?.url, isNull);
  });

  test('estado DESCONHECIDO do servidor cai em `processando`', () {
    // E o unico estado em que a tela nao promete imagem nenhuma, e portanto o
    // unico seguro para o desconhecido.
    final minha = MinhaPublicacao.doJson(<String, dynamic>{
      'ref': 'AaBbCcDdEeFfGgHhIiJjKk',
      'body': 'x',
      'image': <String, dynamic>{'status': 'quarantined'},
    });
    expect(minha.imagem?.estado, EstadoDaFotoDaPublicacao.processando);
  });
}
