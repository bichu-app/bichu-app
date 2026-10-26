// **O SELO DE VALIDADO.**
//
// Decisao do cliente, 21/10/2026, literal: *"os usuarios que validados deve ter
// um simbolo em frente de seu nome nos posts, comentarios, nas mensagens,
// mostrando que e um usuario confiavel"*; sobre o desenho, *"o selo que eu digo
// igual do instagram, nao sao as regras para obter, mas o designer dele, como se
// fosse aquela tag"*; e sobre o alcance, *"nao estamos validando documentos de
// faco, apenas e-mail por enquanto e futuramente telefone"*.
//
// ===========================================================================
// AS DUAS COISAS QUE ESTE ARQUIVO MEDE, E ELAS SAO DIFERENTES
// ===========================================================================
//
// 1. **O selo aparece onde o dado existe, e nao aparece onde ele e falso.**
//    O booleano e `contact_channel_verified`, que a resposta do servidor traz.
//
// 2. **O ROTULO NAO PROMETE MAIS DO QUE O DADO PROVA.** Isto e a regra que vale
//    sobre todas as outras, e por isso ela tem caso proprio com as palavras
//    proibidas escritas pelo nome. O glifo e a roseta por decisao dele; o nome
//    acessivel e "Contato confirmado": o booleano prova que a pessoa tem um
//    canal de contato confirmado, e **nada mais** -- nem qual canal.
//    Um rotulo dizendo "verificado" faria o produto assinar por uma conferencia
//    de identidade que ninguem faz.
//
// E um CONTRAPESO que nao e nenhuma das duas: **mensagens nao recebe selo**,
// e e esse caso que impede alguem de "completar a cobertura" e por o selo no
// canal do golpe do falso achador.
//
// ===========================================================================
// A MEDICAO DE LARGURA ESTA AQUI, COM OS NUMEROS
// ===========================================================================
// O selo custa 24 dp (`SeloDeValidado.custoDeLargura`: 20 de
// `icon.size.inline` + 4 de `space.1`). Isso nao e de graca: o nome perde
// caractere. Os casos do ultimo grupo MEDEM quanto, nas tres larguras de
// aparelho do produto, e e por isso que eles imprimem numero em vez de so
// afirmar que esta bom.

import 'dart:convert';
import 'dart:io' as io;

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_conexao.dart';
import 'package:bichu/api/modelos_pessoa.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/telas/mural/comentarios_da_publicacao.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/marca_da_pessoa.dart';
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'palavras_proibidas_no_rotulo.dart';

const String _urlBase = 'http://localhost:3000';
const String _refDaPublicacao = 'AaBbCcDdEeFfGgHhIiJjK1';
const String _refDoComentario = 'CcDdEeFfGgHhIiJjKkLlM1';

/// Um contador de montagem, para que cada `pumpWidget` receba uma chave NOVA.
/// Ver o comentario dentro de `_montarOMural`.
int _montagem = 0;

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

Map<String, dynamic> _autor({
  required bool validado,
  String nome = 'Marina',
  String? urlDoIcone,
}) {
  return <String, dynamic>{
    'handle': 'marina-vet',
    'display_name': nome,
    'photo_icon_url': urlDoIcone,
    'contact_channel_verified': validado,
  };
}

Map<String, dynamic> _publicacao({required bool validado, String nome = 'Marina'}) {
  return <String, dynamic>{
    'ref': _refDaPublicacao,
    'body': 'o Bidu no parque',
    'created_at': '2026-10-21T12:00:00.000Z',
    'image': null,
    'like_count': 0,
    'comment_count': 0,
    'liked_by_me': false,
    'author': _autor(validado: validado, nome: nome),
    'mine': false,
  };
}

Map<String, dynamic> _comentario({required bool validado, String nome = 'Joana'}) {
  return <String, dynamic>{
    'ref': _refDoComentario,
    'body': 'que lindo!',
    'created_at': '2026-10-21T12:01:00.000Z',
    'author': _autor(validado: validado, nome: nome),
    'mine': false,
  };
}

ApiClient _cliente(Future<http.Response> Function(http.Request) rede) {
  AppConfig.limparParaTeste();
  return ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: MockClient(rede),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
}

/// Monta o CORPO DO MURAL com uma publicacao. **404 em qualquer outra rota**:
/// um caso que dependesse de rota nao declarada passaria por acidente.
Future<void> _montarOMural(
  WidgetTester tester, {
  required Map<String, dynamic> publicacao,
  double largura = 420,
}) async {
  // **A CHAVE E OBRIGATORIA, e a razao foi MEDIDA nesta rodada.** Um segundo
  // `pumpWidget` com `CorpoDoMural` sem chave reaproveita o `State` — o
  // `initState` nao roda de novo, a tela nao refaz a chamada e a arvore continua
  // mostrando o NOME ANTERIOR. Os casos de medicao em laco liam o primeiro nome
  // 22 vezes, e `find.text` do segundo nome devolvia zero elemento.
  _montagem += 1;
  tester.view.physicalSize = Size(largura, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final api = MuralApi(
    _cliente((http.Request pedido) async {
      if (pedido.url.path == '/v1/timeline') {
        return _json(<String, dynamic>{
          'items': <Map<String, dynamic>>[publicacao],
          'next_cursor': null,
        });
      }
      if (pedido.url.path == '/v1/me/publications') {
        return _json(<String, dynamic>{'items': <dynamic>[], 'next_cursor': null});
      }
      return _json(<String, dynamic>{'type': 'not-found'}, status: 404);
    }),
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: CorpoDoMural(
            key: ValueKey<int>(_montagem),
            leitura: api,
            interacao: api,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Monta a FOLHA DE COMENTARIOS de uma publicacao.
Future<void> _montarOsComentarios(
  WidgetTester tester, {
  required List<Map<String, dynamic>> comentarios,
  double largura = 420,
}) async {
  // Ver o comentario de `_montarOMural`: sem chave nova o `State` e reaproveitado
  // e a lista anterior fica na tela.
  _montagem += 1;
  tester.view.physicalSize = Size(largura, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final api = MuralApi(
    _cliente((http.Request pedido) async {
      if (pedido.url.path == '/v1/publications/$_refDaPublicacao/comments') {
        return _json(<String, dynamic>{
          'items': comentarios,
          'next_cursor': null,
          'comment_count': comentarios.length,
        });
      }
      return _json(<String, dynamic>{'type': 'not-found'}, status: 404);
    }),
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: ComentariosDaPublicacao(
          key: ValueKey<int>(_montagem),
          ref: _refDaPublicacao,
          interacao: api,
          minhaPublicacao: false,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// O rotulo que o leitor de tela ouve no selo, lido da ARVORE DE SEMANTICA e
/// nao da constante.
///
/// Ler `SeloDeValidado.rotulo` deixaria o caso verde no dia em que alguem
/// pusesse um `semanticLabel` diferente no `Icon` — que e justamente a forma
/// mais facil de o rotulo divergir do que a classe promete.
String _rotuloDoSelo(WidgetTester tester) {
  final SemanticsNode no = tester.getSemantics(find.byType(SeloDeValidado));
  return no.label;
}

/// `true` quando o texto NAO caberia na largura que recebeu.
///
/// Le `didExceedMaxLines` do proprio `RenderParagraph`, que e o que o Flutter
/// usa para decidir desenhar o `…`. Comparar larguras a mao erraria: a elisao
/// depende da fonte, do `textScaleFactor` e do arredondamento de subpixel, e
/// nenhum dos tres e previsivel a partir do numero de caracteres.
bool _cortou(WidgetTester tester, String texto) {
  final RenderParagraph paragrafo = tester.renderObject<RenderParagraph>(find.text(texto));
  return paragrafo.didExceedMaxLines;
}

/// Nomes de exibicao reais, do mais curto ao mais longo.
///
/// `display_name` guarda *"primeiro nome ou apelido"* (ADR-0010 item 3), nunca
/// sobrenome completo — entao a amostra e de primeiros nomes, e os compostos do
/// fim sao o caso raro e nao o tipico. Vinte e dois nomes: e a amostra da
/// medicao desta frente, e esta escrita aqui para que o numero do relatorio
/// possa ser reproduzido por quem ler.
const List<String> _nomesDeExibicao = <String>[
  'Ana',
  'Léo',
  'Ivo',
  'Rita',
  'Caio',
  'Davi',
  'Marina',
  'Joana',
  'Rafael',
  'Beatriz',
  'Guilherme',
  'Alexandre',
  'Maria Clara',
  'Ana Carolina',
  'João Guilherme',
  'Maria Fernanda',
  'Marcos Vinícius',
  'Ana Beatriz Lopes',
  'Maria Eduarda Alves',
  'José Carlos de Almeida',
  'Maria das Graças Pereira',
  'Francisco de Assis Nascimento',
];

/// As tres larguras de aparelho do produto, em dp.
///
/// 320 e o piso que a casca de abas ja mede; 375 e a largura mediana de celular
/// e e **ela** que o briefing desta frente nomeia; 430 e o topo dos aparelhos
/// grandes.
const List<double> _larguras = <double>[320, 375, 430];

void main() {
  // =========================================================================
  group('O SELO APARECE ONDE O CANAL ESTA CONFIRMADO', () {
    testWidgets('com canal confirmado o selo aparece na PUBLICACAO', (tester) async {
      await _montarOMural(tester, publicacao: _publicacao(validado: true));
      expect(find.byType(SeloDeValidado), findsOneWidget);
    });

    testWidgets('com canal confirmado o selo aparece no COMENTARIO', (tester) async {
      await _montarOsComentarios(
        tester,
        comentarios: <Map<String, dynamic>>[_comentario(validado: true)],
      );
      expect(find.byType(SeloDeValidado), findsOneWidget);
    });

    testWidgets('o GLIFO e a roseta, que foi o que ele pediu', (tester) async {
      // *"o selo que eu digo igual do instagram, nao sao as regras para obter,
      // mas o designer dele, como se fosse aquela tag"*. `Icons.verified` e a
      // roseta da familia Material Symbols — a MESMA que o selo do dono, em
      // `perfil/tela_dados_pessoais.dart`, ja desenha. Um glifo diferente aqui
      // faria o mesmo conceito ter dois desenhos no mesmo produto.
      await _montarOMural(tester, publicacao: _publicacao(validado: true));
      final Icon icone = tester.widget<Icon>(
        find.descendant(of: find.byType(SeloDeValidado), matching: find.byType(Icon)),
      );
      expect(icone.icon, Icons.verified);
      // 20 dp: `icon.size.inline`, *"dentro de texto e chip"*.
      expect(icone.size, BichuEspaco.e5);
    });
  });

  // =========================================================================
  group('ISCA: SEM CANAL CONFIRMADO O SELO NAO APARECE', () {
    testWidgets('sem canal confirmado o selo NAO aparece na publicacao', (tester) async {
      await _montarOMural(tester, publicacao: _publicacao(validado: false));
      expect(find.byType(SeloDeValidado), findsNothing);
    });

    testWidgets('sem canal confirmado o selo NAO aparece no comentario', (tester) async {
      await _montarOsComentarios(
        tester,
        comentarios: <Map<String, dynamic>>[_comentario(validado: false)],
      );
      expect(find.byType(SeloDeValidado), findsNothing);
    });

    testWidgets('`false` nao desenha um selo APAGADO: nao desenha nada', (tester) async {
      // Um glifo cinza ao lado do nome diria "esta conta foi reprovada", e o que
      // `false` significa e que ninguem conferiu nada. Entao a conferencia nao e
      // "o selo esta cinza", e sim que **nenhuma roseta existe na arvore**.
      await _montarOMural(tester, publicacao: _publicacao(validado: false));
      expect(find.byIcon(Icons.verified), findsNothing);
      expect(find.byIcon(Icons.verified_outlined), findsNothing);
      expect(find.byIcon(Icons.verified_user), findsNothing);
    });

    testWidgets('CHAVE AUSENTE cai para `false`: o selo nao nasce', (tester) async {
      // O campo e obrigatorio no contrato, e este caso mede o que o app faz se
      // um dia ele faltar. **O lado seguro e nao afirmar**: `?? true` acenderia
      // o selo de toda conta no primeiro deploy em que o servidor ficasse
      // atrasado do app.
      final Map<String, dynamic> semOCampo = _publicacao(validado: false);
      (semOCampo['author'] as Map<String, dynamic>).remove('contact_channel_verified');
      await _montarOMural(tester, publicacao: semOCampo);
      expect(find.byType(SeloDeValidado), findsNothing);
    });

    test('os tres modelos caem para `false` com a chave ausente', () {
      expect(
        AutorDaPublicacao.doJson(<String, dynamic>{'display_name': 'Marina'}).canalConfirmado,
        isFalse,
      );
      expect(
        PessoaDaConexao.doJson(<String, dynamic>{'display_name': 'Marina'}).canalConfirmado,
        isFalse,
      );
      expect(
        PerfilDePessoa.doJson(<String, dynamic>{
          'handle': 'marina-vet',
          'public_ref': 'AbCdEfGhIjKlMnOpQrStUv',
          'display_name': 'Marina',
          'pets_count': 0,
          'connections_count': 0,
          'connection_state': 'none',
        }).canalConfirmado,
        isFalse,
      );
    });

    test('com `true` no JSON, os tres modelos leem `true`', () {
      // CONTRAPESO do caso de cima: sem ele, um modelo que devolvesse `false`
      // SEMPRE passaria nas quatro iscas de ausencia e o selo nunca apareceria.
      expect(
        AutorDaPublicacao.doJson(_autor(validado: true)).canalConfirmado,
        isTrue,
      );
      expect(
        PessoaDaConexao.doJson(<String, dynamic>{
          'handle': 'marina-vet',
          'display_name': 'Marina',
          'contact_channel_verified': true,
        }).canalConfirmado,
        isTrue,
      );
      expect(
        PerfilDePessoa.doJson(<String, dynamic>{
          'handle': 'marina-vet',
          'public_ref': 'AbCdEfGhIjKlMnOpQrStUv',
          'display_name': 'Marina',
          'pets_count': 0,
          'connections_count': 0,
          'connection_state': 'none',
          'contact_channel_verified': true,
        }).canalConfirmado,
        isTrue,
      );
    });
  });

  // =========================================================================
  group('O ROTULO NAO PROMETE MAIS DO QUE O DADO PROVA', () {
    testWidgets('o rotulo acessivel diz "Contato confirmado"', (tester) async {
      await _montarOMural(tester, publicacao: _publicacao(validado: true));
      expect(_rotuloDoSelo(tester), 'Contato confirmado');
    });

    testWidgets('ISCA: o rotulo NAO diz "verificado", "confiavel" nem "pela equipe"', (
      tester,
    ) async {
      // **ESTA E A REGRA QUE VALE SOBRE TODAS AS OUTRAS.** O cliente pediu o selo
      // dizendo *"mostrando que e um usuario confiavel"*, e no mesmo dia fechou o
      // alcance: *"nao estamos validando documentos de faco, apenas e-mail"*. O
      // glifo e o que ele pediu; o ROTULO diz o que o dado prova, porque quem usa
      // leitor de tela recebe so o rotulo e nao tem o glifo para interpretar.
      await _montarOMural(tester, publicacao: _publicacao(validado: true));
      // **A VARREDURA MORA EM `palavras_proibidas_no_rotulo.dart`** desde
      // 21/10/2026, e nao e arrumacao: a tela de `Meus dados` tambem tem
      // rotulo de selo (era "Conta validada", que prometia demais) e ela
      // chama ESTA varredura. Duas listas seriam duas definicoes de "rotulo
      // honesto".
      conferirRotuloDoSelo(_rotuloDoSelo(tester), onde: 'o Mural');
    });

    testWidgets('ISCA: o rotulo NAO NOMEIA O CANAL', (tester) async {
      // **DECISAO DO CLIENTE, 21/10/2026, E ELA E A SEGUNDA DO DIA**, literal:
      // *"tem que dizer que o usuario esta confirmado, independente do meio"*.
      //
      // Ela SUBSTITUI a aprovacao anterior do mesmo dia, que era "E-mail
      // confirmado" e saiu de *"nao estamos validando documentos de faco,
      // apenas e-mail por enquanto e futuramente telefone"*. As duas sao sobre
      // a mesma pergunta e a segunda e posterior.
      //
      // **Sem este caso a decisao nao tem portao**: "E-mail confirmado" passa
      // inteiro na varredura de palavras proibidas -- ela proibe o que MENTE, e
      // "E-mail confirmado" nao mentia. Reverter o rotulo ficaria verde, e e
      // exatamente o que alguem faria achando que corrige uma regressao.
      //
      // ISCA: trocar `SeloDeValidado.rotulo` de volta para "E-mail confirmado"
      // compila, passa em toda a varredura de palavras proibidas, e reprova
      // aqui.
      await _montarOMural(tester, publicacao: _publicacao(validado: true));
      conferirRotuloNaoNomeiaCanal(_rotuloDoSelo(tester), onde: 'o Mural');
    });

    test('ISCA DA ISCA: a varredura de CANAL enxerga as tres redacoes recusadas', () {
      // As tres que ele descartou ao dizer "independente do meio", e a de
      // "canal" que eu quase escrevi. Sem este caso o de cima ficaria verde se
      // a lista de canais parasse de casar.
      for (final String comCanal in <String>[
        'E-mail confirmado',
        'Telefone confirmado',
        'E-mail e telefone confirmados',
        'Celular confirmado',
        'Confirmado por WhatsApp',
        'SMS confirmado',
      ]) {
        expect(
          rotuloNomeiaCanal(comCanal),
          isTrue,
          reason: 'a varredura de canal nao enxerga "$comCanal": ela nao mede nada',
        );
      }
      // E o rotulo VERDADEIRO passa pelas DUAS varreduras. Sem esta metade a
      // lista de canais poderia proibir "contato" e reprovar o rotulo certo.
      expect(rotuloNomeiaCanal(SeloDeValidado.rotulo), isFalse);
      expect(rotuloPrometeDemais(SeloDeValidado.rotulo), isFalse);
    });

    test('ISCA DA ISCA: a varredura de palavras REPROVA um rotulo mentiroso', () {
      // Sem este caso, o de cima ficaria verde se a lista de palavras parasse de
      // casar — e a varredura e por substring minuscula, que e exatamente o tipo
      // de conferencia que envelhece calada.
      for (final String mentiroso in <String>[
        'Usuário verificado',
        'Conta confiável',
        'Identidade confirmada',
        'Confirmado pela equipe',
        'Perfil oficial',
        // **O rotulo que a tela de `Meus dados` usava ate 21/10/2026.** Ele
        // entra aqui porque foi o cliente que o reprovou pelo nome, e sem
        // esta linha a palavra "validada" poderia voltar a qualquer uma das
        // duas telas sem nada acusar.
        'Conta validada',
      ]) {
        expect(
          rotuloPrometeDemais(mentiroso),
          isTrue,
          reason: 'a varredura nao enxerga "$mentiroso": ela nao mede nada',
        );
      }
      // E o rotulo VERDADEIRO passa pela mesma varredura. Sem esta metade a
      // lista poderia proibir "confirmado" e reprovar o rotulo certo.
      expect(rotuloPrometeDemais(SeloDeValidado.rotulo), isFalse);
    });

    testWidgets('o selo e uma parada de foco SEPARADA do nome', (tester) async {
      // O leitor de tela anuncia o nome e depois "Contato confirmado". Costurar os
      // dois numa frase so (`"Marina, e-mail confirmado"`) faria o rotulo do selo
      // depender de quem monta — e e justamente ele que nao pode variar.
      await _montarOMural(tester, publicacao: _publicacao(validado: true, nome: 'Marina'));
      expect(_rotuloDoSelo(tester), isNot(contains('Marina')));
      final SemanticsNode doNome = tester.getSemantics(find.text('Marina'));
      expect(doNome.label, 'Marina');
    });
  });

  // =========================================================================
  group('CONTRAPESO: MENSAGENS NAO RECEBE SELO, E NAO E ESQUECIMENTO', () {
    // ======================================================================
    // POR QUE ESTE GRUPO EXISTE
    // ======================================================================
    // O cliente disse *"nas mensagens"*, e o selo nao esta la. Tres medidas
    // sustentam a excecao:
    //
    // 1. **e a UNICA superficie onde o outro lado pode ser um estranho.**
    //    Publicacao e comentario so existem entre conexao aceita (o recorte esta
    //    na clausula `WHERE` do servidor); perfil e pedido de conexao sao
    //    enderecados pelo apelido. A conversa mediada comeca com o ACHADOR, que
    //    pode nao ter conta;
    // 2. **e o canal do golpe do falso achador**, que ele proprio mediu em 20/10
    //    ao recusar a recompensa. Um selo ao lado do nome de quem diz ter achado
    //    o pet e o reforco de credibilidade que o golpe precisa — e o que o selo
    //    prova (um e-mail confirmado) nao tem relacao com o que a pessoa leria
    //    nele;
    // 3. **a linha JA CORTA hoje, sem selo**: o titulo da conversa pede 442 dp
    //    contra 287 de vao. Os 24 dp sairiam de um nome ja abreviado.
    //
    // Este grupo e o que impede alguem de "completar a cobertura" depois, sem o
    // contexto acima.

    testWidgets('a marca do participante NAO desenha selo', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(
            body: MarcaNeutraDoParticipante(inicial: 'M', quem: 'Marina'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MarcaNeutraDoParticipante), findsOneWidget);
      expect(find.byType(SeloDeValidado), findsNothing);
      expect(find.byIcon(Icons.verified), findsNothing);
    });

    testWidgets('`MarcaDaPessoa` — o desenho COMPARTILHADO — nao desenha selo', (tester) async {
      // **A defesa ESTRUTURAL.** `MarcaDaPessoa` e o unico desenho de pessoa que
      // o Mural e a area de mensagens dividem. Se ele tivesse um parametro
      // `comSelo`, acender o selo no canal do golpe seria mudar um booleano — sem
      // importe novo, sem nada visivel em revisao.
      //
      // Com o selo em `NomeComSelo`, num arquivo separado, acende-lo em mensagens
      // exige um importe novo naquele arquivo. E o caso seguinte reprova o
      // importe.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(
            body: MarcaDaPessoa(urlDoIcone: null, inicial: 'M'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MarcaDaPessoa), findsOneWidget);
      expect(find.byType(SeloDeValidado), findsNothing);
    });

    test('ISCA: nenhum arquivo de mensagens importa o selo nem o nome com selo', () {
      // A conferencia e sobre a FONTE e nao sobre a arvore montada, e e de
      // proposito: a area de mensagens tem muitos ramos (conversa encerrada,
      // achador sem conta, par bloqueado) e um caso de widget mediria um deles.
      // O importe cobre todos.
      for (final String caminho in <String>[
        'lib/telas/mensagens/area_de_mensagens.dart',
        'lib/telas/mensagens/tela_da_conversa.dart',
      ]) {
        final String fonte = _semProsa(_ler(caminho));
        expect(
          fonte.contains('widgets/selo_de_validado.dart'),
          isFalse,
          reason:
              '$caminho passou a importar o selo de validado. MENSAGENS NAO RECEBE SELO: '
              'e a unica superficie onde o outro lado pode ser um estranho, e o canal do '
              'golpe do falso achador, e a linha ja corta hoje sem selo (442 dp pedidos '
              'contra 287 de vao). Ver o cabecalho deste grupo antes de mudar isto.',
        );
        // `FichaDaPessoa` entra nesta lista em 26/10/2026, e a razao e um buraco
        // que ela abriria: ela COMPOE `NomeComSelo`, entao usa-la em mensagens
        // acenderia o selo aqui **sem importar `selo_de_validado.dart` e sem
        // construir `NomeComSelo`** — e as duas conferencias acima passariam.
        // O padrao de identificacao e desejavel em toda listagem e e cobrado por
        // `padrao_de_identificacao_test.dart`; mensagens e a excecao que espera
        // decisao do cliente, e enquanto ela espera e esta isca que manda.
        for (final String nome in <String>['SeloDeValidado', 'NomeComSelo', 'FichaDaPessoa']) {
          expect(
            fonte.contains(RegExp('(?<![A-Za-z_])$nome\\s*\\(')),
            isFalse,
            reason: '$caminho passou a CONSTRUIR `$nome`',
          );
        }
      }
    });

    test('ISCA DA ISCA: o desenho compartilhado nao tem parametro de selo', () {
      // Sem este caso, a defesa estrutural viveria numa frase do cabecalho de
      // `MarcaDaPessoa` — e frase nao reprova nada.
      final String fonte = _semProsa(_ler('lib/widgets/marca_da_pessoa.dart'));
      for (final String agulha in <String>['comSelo', 'SeloDeValidado', 'selo_de_validado']) {
        expect(
          fonte.contains(agulha),
          isFalse,
          reason:
              '`MarcaDaPessoa` ganhou `$agulha`. Ele e o desenho que a area de MENSAGENS '
              'divide com o Mural: um parametro de selo aqui poria o selo a um booleano '
              'de distancia do canal do golpe do falso achador.',
        );
      }
    });

    test('ISCA DA ISCA: `_semProsa` apaga o comentario e PRESERVA o codigo', () {
      // Sem este caso, um apagador de prosa quebrado (que apagasse a linha
      // inteira, por exemplo) faria as duas iscas acima passarem no vazio.
      const String amostra = '''
import 'widgets/selo_de_validado.dart';
// este comentario fala de widgets/selo_de_validado.dart e de SeloDeValidado(
/// e este tambem: comSelo
final String url = 'http://exemplo/nao-e-comentario';
''';
      final String limpo = _semProsa(amostra);
      // O importe de CODIGO fica.
      expect(limpo, contains("import 'widgets/selo_de_validado.dart';"));
      // As duas linhas de PROSA somem, com tudo que elas citavam.
      expect('\n$limpo'.contains('\n// este comentario'), isFalse);
      expect(limpo.contains('comSelo'), isFalse);
      expect(limpo.contains('SeloDeValidado('), isFalse);
      // E `//` dentro de cadeia NAO e tratado como comentario.
      expect(limpo, contains("'http://exemplo/nao-e-comentario'"));
    });

    test('CONTRAPESO da isca de fonte: o Mural IMPORTA o selo', () {
      // Sem esta metade, a leitura de fonte poderia estar lendo arquivo vazio e
      // as duas iscas acima passariam no vazio — o defeito classico de portao que
      // varre codigo.
      for (final String caminho in <String>[
        'lib/telas/mural/tela_do_mural.dart',
        'lib/telas/mural/comentarios_da_publicacao.dart',
        'lib/telas/pessoa/tela_perfil_de_pessoa.dart',
        'lib/telas/conexoes/tela_pedidos_de_conexao.dart',
      ]) {
        final String fonte = _semProsa(_ler(caminho));
        expect(
          fonte.contains('widgets/selo_de_validado.dart'),
          isTrue,
          reason: '$caminho deixou de importar o selo: a leitura de fonte pode estar cega',
        );
        expect(fonte.contains('NomeComSelo('), isTrue, reason: '$caminho nao constroi `NomeComSelo`');
      }
    });
  });

  // =========================================================================
  group('A LARGURA: o selo custa 24 dp, e e o NOME que paga', () {
    test('o custo e 24 dp, e ele sai de token', () {
      // 20 de `icon.size.inline` + 4 de `space.1`. **Nao e numero escolhido no
      // widget**: os dois vem de `design/tokens.json` por
      // `bichu_tokens.g.dart`, e esta conferencia existe para que a medicao dos
      // casos abaixo nao se descole do desenho.
      expect(SeloDeValidado.lado, 20.0);
      expect(SeloDeValidado.vao, 4.0);
      expect(SeloDeValidado.custoDeLargura, 24.0);
      expect(SeloDeValidado.lado, BichuEspaco.e5);
      expect(SeloDeValidado.vao, BichuEspaco.e1);
    });

    testWidgets('MEDICAO -- o que o selo custa ao nome, nas DUAS superficies e nas TRES larguras', (
      tester,
    ) async {
      // ======================================================================
      // ESTE CASO IMPRIME NUMERO, E E DE PROPOSITO
      // ======================================================================
      // O selo custa 24 dp, e isso nao e de graca: o nome perde caractere. O que
      // importa nao e "cortou?", e sim a TROCA — para cada nome, cortava SEM
      // selo? passou a cortar COM selo? So o segundo grupo e custo do selo; o
      // primeiro ja cortava antes e nao e assunto desta frente.
      //
      // ----------------------------------------------------------------------
      // O NUMERO QUE O BRIEFING TROUXE E O QUE A MEDICAO DEVOLVEU
      // ----------------------------------------------------------------------
      // O briefing desta frente trouxe, de terceiro, que "no Mural a 375 dp o
      // selo faz cortar nome que cabia, 20 de 22 casos", e que "no comentario
      // cabe em todas as larguras". **A medicao desta arvore devolve outra
      // coisa, nos dois lados**, e os numeros abaixo sao os desta arvore, com a
      // amostra de `_nomesDeExibicao` e a fonte do tema de verdade:
      //
      //   PUBLICACAO @ 320 dp -> 8 ja cortavam | 1 so por causa do selo | 13 cabem
      //   PUBLICACAO @ 375 dp -> 5 ja cortavam | 1 so por causa do selo | 16 cabem
      //   PUBLICACAO @ 430 dp -> 3 ja cortavam | 1 so por causa do selo | 18 cabem
      //   COMENTARIO @ 320 dp -> 5 ja cortavam | 3 so por causa do selo | 14 cabem
      //   COMENTARIO @ 375 dp -> 4 ja cortavam | 0 so por causa do selo | 18 cabem
      //   COMENTARIO @ 430 dp -> 3 ja cortavam | 0 so por causa do selo | 19 cabem
      //
      // **A 375 dp o selo custa UM nome na publicacao** (`Marcos Vinícius`), e
      // nao vinte. A decisao de por o selo na publicacao fica MAIS sustentada
      // do que o briefing supunha, e nao menos.
      //
      // **No comentario ele nao custa nada a 375 e a 430, mas custa TRES nomes a
      // 320 dp** — entao "cabe em todas as larguras" nao e verdade no piso de
      // 320. Os tres (`João Guilherme`, `Maria Fernanda`, `Marcos Vinícius`)
      // ficam com `…` num aparelho de 320 dp; o nome continua legivel e o selo
      // continua desenhado, que e a troca que `NomeComSelo` escolheu de
      // proposito.
      //
      // **Os numeros abaixo sao travados.** Se um deles mudar, o caso reprova
      // dizendo qual — e a saida e levar o numero novo ao relatorio, nao
      // afrouxar a conferencia.
      final Map<String, int> custo = <String, int>{};
      final Map<String, int> jaCortavamAntes = <String, int>{};
      final List<String> linhas = <String>[];

      for (final double largura in _larguras) {
        for (final String superficie in <String>['PUBLICACAO', 'COMENTARIO']) {
          final List<String> soComSelo = <String>[];
          final List<String> jaCortavam = <String>[];

          for (final String nome in _nomesDeExibicao) {
            Future<void> montar({required bool validado}) async {
              if (superficie == 'PUBLICACAO') {
                await _montarOMural(
                  tester,
                  publicacao: _publicacao(validado: validado, nome: nome),
                  largura: largura,
                );
              } else {
                await _montarOsComentarios(
                  tester,
                  comentarios: <Map<String, dynamic>>[
                    _comentario(validado: validado, nome: nome),
                  ],
                  largura: largura,
                );
              }
            }

            await montar(validado: false);
            final bool semSelo = _cortou(tester, nome);
            await montar(validado: true);
            final bool comSelo = _cortou(tester, nome);

            if (semSelo) {
              jaCortavam.add(nome);
            } else if (comSelo) {
              soComSelo.add(nome);
            }
          }

          final String chave = '$superficie@${largura.toInt()}';
          custo[chave] = soComSelo.length;
          jaCortavamAntes[chave] = jaCortavam.length;
          linhas.add(
            '  $chave dp -> ${jaCortavam.length} ja cortavam SEM selo | '
            '${soComSelo.length} SO POR CAUSA DO SELO $soComSelo | '
            '${_nomesDeExibicao.length - jaCortavam.length - soComSelo.length} cabem nos dois',
          );
        }
      }

      // `print` e nao `printOnFailure`: este numero precisa sair no caso VERDE,
      // porque e ele que vai para o relatorio da frente.
      // ignore: avoid_print
      print(
        'MEDICAO DO SELO sobre ${_nomesDeExibicao.length} nomes de exibicao:\n'
        '${linhas.join('\n')}',
      );

      const Map<String, int> custoMedido = <String, int>{
        'PUBLICACAO@320': 1,
        'PUBLICACAO@375': 1,
        'PUBLICACAO@430': 1,
        'COMENTARIO@320': 3,
        'COMENTARIO@375': 0,
        'COMENTARIO@430': 0,
      };
      const Map<String, int> antesMedido = <String, int>{
        'PUBLICACAO@320': 8,
        'PUBLICACAO@375': 5,
        'PUBLICACAO@430': 3,
        'COMENTARIO@320': 5,
        'COMENTARIO@375': 4,
        'COMENTARIO@430': 3,
      };

      expect(
        custo,
        custoMedido,
        reason:
            'o CUSTO DO SELO em nomes cortados mudou. Ele e o numero que decidiu por o '
            'selo na publicacao e no comentario — leve o numero novo ao relatorio da '
            'frente antes de mexer nesta expectativa.',
      );
      expect(
        jaCortavamAntes,
        antesMedido,
        reason:
            'a linha de base mudou: nomes passaram a cortar SEM selo. Isso nao e o selo, '
            'e o cartao ou a fonte do tema — e a medicao desta frente deixou de valer.',
      );
    });

    testWidgets('ISCA: nome longo COM selo NAO corta no comentario a 375 dp', (tester) async {
      // **O caso que o briefing pediu pelo nome**, sobre a largura em que a
      // medicao diz que cabe. A 375 dp o comentario paga ZERO nomes pelo selo, e
      // `Ana Beatriz Lopes` (17 caracteres) e o mais longo da amostra que cabe
      // nessa largura. Com o selo ao lado, ele continua inteiro.
      for (final String nome in <String>['Ana Beatriz Lopes', 'Marcos Vinícius']) {
        await _montarOsComentarios(
          tester,
          comentarios: <Map<String, dynamic>>[_comentario(validado: true, nome: nome)],
          largura: 375,
        );
        expect(find.byType(SeloDeValidado), findsOneWidget, reason: nome);
        expect(
          _cortou(tester, nome),
          isFalse,
          reason:
              'a 375 dp o nome "$nome" passou a cortar NO COMENTARIO com o selo. A medicao '
              'desta frente dizia que o comentario a 375 dp paga ZERO nomes pelo selo — se '
              'mudou, o numero novo tem de ir para o relatorio.',
        );
      }
    });

    testWidgets('o selo FICA e o nome encolhe: `Flexible` e nao `Expanded`', (tester) async {
      // **A troca e deliberada e tem de ser medida, porque o contrario e silencioso.**
      // Com `Expanded` no texto, o nome ocuparia toda a largura e empurraria o
      // selo para fora da linha — e um selo ausente nao parece defeito nenhum, so
      // parece uma conta nao validada. Um nome com `…` e visivelmente abreviado.
      const String enorme =
          'Francisco de Assis Nascimento Pereira dos Santos Filho Junior Neto Sobrinho';
      await _montarOMural(
        tester,
        publicacao: _publicacao(validado: true, nome: enorme),
        largura: 320,
      );
      expect(_cortou(tester, enorme), isTrue, reason: 'o nome enorme deveria cortar a 320 dp');
      expect(
        find.byType(SeloDeValidado),
        findsOneWidget,
        reason: 'o selo foi empurrado para fora da linha: o texto esta num `Expanded`',
      );
      // E o selo continua desenhado DENTRO da largura da tela, e nao cortado pela
      // borda: `findsOneWidget` acha widget fora da viewport tambem.
      final Rect caixa = tester.getRect(find.byType(SeloDeValidado));
      expect(caixa.right, lessThanOrEqualTo(320.0));
      expect(caixa.width, SeloDeValidado.lado);
    });
  });
}

/// A fonte **sem a prosa**: sem `///`, sem `//` e sem `/* */`.
///
/// **As iscas de fonte deste arquivo varrem CODIGO, e nao comentario**, e a
/// diferenca nao e detalhe: o cabecalho de `area_de_mensagens.dart` EXPLICA por
/// que mensagens nao recebe selo, e para explicar ele precisa escrever
/// `widgets/selo_de_validado.dart` e `SeloDeValidado.custoDeLargura`. Uma
/// varredura sobre o texto cru reprovaria exatamente o arquivo que documenta a
/// regra — e o conserto obvio seria apagar a explicacao, que e o contrario do
/// que se quer.
///
/// Mesma forma de `semComentarios` em
/// `test/dispositivo/porta_nao_contornada_test.dart`.
String _semProsa(String fonte) {
  return fonte
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .split('\n')
      .map((linha) {
        final int marca = linha.indexOf('//');
        if (marca < 0) return linha;
        // `//` dentro de uma cadeia nao e comentario, e `'http://...'` aparece
        // em codigo de verdade. Conta-se aspas antes da marca: numero impar
        // significa que ela esta DENTRO de uma cadeia.
        final String antes = linha.substring(0, marca);
        final int aspas = "'".allMatches(antes).length + '"'.allMatches(antes).length;
        if (aspas.isOdd) return linha;
        return antes;
      })
      .join('\n');
}

/// Le um arquivo de `app/` pelo caminho relativo a raiz do pacote.
///
/// **Reprova alto quando nao acha.** Leitura que devolvesse cadeia vazia faria
/// as iscas de fonte deste arquivo passarem no vazio, que e o modo de falhar
/// mais perigoso de portao que varre codigo.
String _ler(String relativo) {
  final io.File arquivo = io.File('${_raizDoPacote()}/$relativo');
  if (!arquivo.existsSync()) {
    fail(
      'REPROVA: nao achei "$relativo" a partir de "${io.Directory.current.path}". '
      'As iscas de fonte deste arquivo nao conferem nada sem ele, e ficar verde '
      'sem conferir e exatamente o que elas existem para impedir.',
    );
  }
  return arquivo.readAsStringSync();
}

/// Sobe de `Directory.current` ate achar a raiz do pacote do aplicativo.
///
/// `flutter test` roda com `Directory.current` em `app/`, mas um executor que
/// rodasse da raiz do repositorio nao acharia nada — e o caso ficaria verde por
/// nao ter lido. Mesma forma de `_raizDoRepositorio` em
/// `test/dispositivo/porta_nao_contornada_test.dart`.
String _raizDoPacote() {
  var dir = io.Directory.current.absolute;
  while (true) {
    if (io.File('${dir.path}/pubspec.yaml').existsSync() &&
        io.Directory('${dir.path}/lib/telas').existsSync()) {
      return dir.path;
    }
    final pai = dir.parent;
    if (pai.path == dir.path) {
      fail(
        'REPROVA: nao achei a raiz do pacote do aplicativo subindo de '
        '"${io.Directory.current.path}".',
      );
    }
    dir = pai;
  }
}
