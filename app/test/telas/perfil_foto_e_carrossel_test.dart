// OS DOIS PEDIDOS DE 26/10/2026 SOBRE A PAGINA DO PERFIL DO USUARIO.
//
// Nas palavras dele:
//
//   1. *"na pagina do perfil do usuário, você deve trazer a foto do usuário ao
//      lado esquerdo do nome do usuário, igual o instagram"*;
//   2. *"na pagina do perfil do usuário, as fotos publicadas devem ser
//      clicaveis e abrir no tamanho maior com um botão para avançar ou
//      retroceder para a proxima imagem, isso eu já tinha te pedido tambem"*.
//
// O segundo ele JA tinha pedido em 22/10 (*"as fotos tem que ser clicaveis
// para expandir/aumentar"*) e nao foi atendido, e a razao esta medida: o
// visualizador ganhou carrossel naquele dia, e as duas grades de foto do
// produto continuaram chamando a porta de UMA imagem --
// `VisualizadorDeImagem.abrir` --, que com lista de um elemento nao desenha
// `PageView`, nem setas, nem contador, de proposito. O carrossel existia no
// app e **nenhuma das duas telas o alcancava**.
//
// ## O QUE E "A PAGINA DO PERFIL DO USUARIO": SAO DUAS, E ELAS DIVERGEM
//
// | tela | o nome | a foto da pessoa | as fotos publicadas |
// |---|---|---|---|
// | a propria conta (`AbaPerfil`, em `telas/abas.dart`) | titulo da barra, por `tituloDaTelaDaConta` | `AvatarDaConta`, no `leading` da MESMA barra | em outra tela (`Minhas fotos`, a vitrine) |
// | o perfil de terceiro (`telas/pessoa/tela_perfil_de_pessoa.dart`) | titulo da PAGINA, abaixo da barra, por `NomeComSelo` (decisao de 26/10) | **nao existe no contrato** | na propria tela, em `showcase[]` |
//
// Por isso o pedido 1 tem **um grupo de geometria** nesta pagina e uma ausencia
// relatada na outra: `PersonProfile` e lista FECHADA
// (`additionalProperties: false`) e diz por escrito que nao ha `photo`.
// Acrescentar a foto ali e mudanca de contrato e de servidor, e decisao do
// cliente -- ver o relatorio desta frente.
//
// ## A GEOMETRIA, E NAO A PRESENCA
//
// `findsOneWidget` para a foto e para o nome passa com a foto a DIREITA, passa
// com ela embaixo e passa com as duas empilhadas. O que este arquivo mede e
// que **o retangulo da foto termina antes de o retangulo do nome comecar**, e
// que os dois se cruzam na vertical -- que e o que "ao lado esquerdo, na mesma
// linha, igual o instagram" quer dizer em pixel.
//
// **`getSize` nao serve para retangulo pintado**, e isso custou uma reprovacao
// falsa em 26/10/2026 nesta mesma area: ele devolve o tamanho de LAYOUT, que o
// `Transform` do `InteractiveViewer` nao toca. Aqui e sempre
// `getBottomRight - getTopLeft` via `localToGlobal`, como em
// `test/widgets/visualizador_de_imagem_test.dart`.
//
// ## O QUE ESTE ARQUIVO NAO COBRE
//
// *"Igual o instagram"* e julgamento visual, e nenhum caso aqui o afirma: o que
// se mede e lado, linha e tamanho em dp. Nada aqui roda em aparelho nem abre o
// app.

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/pessoas_api.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/api/vitrine_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/perfil/vitrine_de_fotos.dart';
import 'package:bichu/telas/pessoa/tela_perfil_de_pessoa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/visualizador_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// LITERAIS DISTINTOS, E A DISTINCAO E O CONTROLE POSITIVO
// ---------------------------------------------------------------------------
//
// `test/vitrine/vitrine_de_fotos_test.dart` usa a MESMA `open_url` para as
// nove fotos, e ali isso esta certo -- aquele arquivo mede qual derivada a
// grade pede, nao qual foto abriu. **Aqui seria o defeito que anula o
// arquivo**: com URLs iguais, um carrossel que nunca troca de pagina desenha a
// mesma imagem e o caso passa. Cada foto tem a sua.
const String _grade1 = 'https://img.bichu.app/people/thumb/UM.jpeg';
const String _grade2 = 'https://img.bichu.app/people/thumb/DOIS.jpeg';
const String _grade3 = 'https://img.bichu.app/people/thumb/TRES.jpeg';
const String _aberta1 = 'https://img.bichu.app/people/card/UM.jpeg';
const String _aberta2 = 'https://img.bichu.app/people/card/DOIS.jpeg';
const String _aberta3 = 'https://img.bichu.app/people/card/TRES.jpeg';

/// O nome da conta nos casos de geometria. Longo e sem espaco de proposito: um
/// nome curto cabe em qualquer arranjo, e o que se mede aqui e lado e nao
/// largura.
const String _nomeDaConta = 'Marinalva';

// ---------------------------------------------------------------------------
// GEOMETRIA
// ---------------------------------------------------------------------------

/// O retangulo PINTADO, em coordenadas da janela.
///
/// Ver o cabecalho: `getSize` devolve LAYOUT, e `localToGlobal` atravessa o
/// `Transform`. Mesma funcao de `visualizador_de_imagem_test.dart`, repetida
/// aqui de proposito -- importar helper de arquivo de teste alheio amarra os
/// dois, e o outro e de outra frente.
Rect pintado(WidgetTester tester, Finder alvo) =>
    Rect.fromPoints(tester.getTopLeft(alvo), tester.getBottomRight(alvo));

// ---------------------------------------------------------------------------
// A VITRINE DO DONO, MONTADA DIRETO
// ---------------------------------------------------------------------------

Map<String, dynamic> _fotoDoDono({
  required int posicao,
  required String grade,
  required String aberta,
  String estado = 'ready',
  String? alt,
}) => <String, dynamic>{
  'upload_id': '018f7c1e-7a2b-7c3d-9e4f-00000000000$posicao',
  'position': posicao,
  'status': estado,
  'grid_url': grade,
  'open_url': aberta,
  'rejection_reason': null,
  'alt_text': alt,
};

/// Uma foto AINDA EM PROCESSAMENTO: sem derivada nenhuma.
///
/// Ela existe por um motivo so, e e o caso do indice: a porta
/// [VisualizadorDeImagem.abrirVarias] **descarta URL em branco** antes de
/// empilhar a rota. Uma foto sem `open_url` na posicao 0 encurta a lista em
/// um, e passar o indice da GRADE faria o toque na segunda celula com foto
/// abrir a terceira.
Map<String, dynamic> _fotoProcessando(int posicao) => <String, dynamic>{
  'upload_id': '018f7c1e-7a2b-7c3d-9e4f-00000000000$posicao',
  'position': posicao,
  'status': 'processing',
  'grid_url': null,
  'open_url': null,
  'rejection_reason': null,
  'alt_text': null,
};

class _LeituraFixa implements LeituraDaVitrine {
  _LeituraFixa(this.corpo);

  final Map<String, dynamic> corpo;

  @override
  Future<Vitrine> minhaVitrine() async => Vitrine.doJson(corpo);
}

/// A escrita ESTOURA: nenhum caso deste arquivo grava, e um que gravasse por
/// acidente tem de reprovar alto em vez de passar.
class _EscritaQueEstoura implements EscritaDaVitrine {
  const _EscritaQueEstoura();

  @override
  Future<Map<String, dynamic>> intencaoDeFotoDaVitrine({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async => throw StateError('nenhum caso daqui pede autorizacao de envio');

  @override
  Future<Vitrine> substituir(List<FotoPedida> fotos) async =>
      throw StateError('nenhum caso daqui grava a vitrine');
}

Future<void> _montarAVitrine(
  WidgetTester tester,
  List<Map<String, dynamic>> fotos,
) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: VitrineDeFotosDoUsuario(
        api: _LeituraFixa(<String, dynamic>{
          'photos': fotos,
          'max_photos': 9,
        }),
        escrita: const _EscritaQueEstoura(),
        camera: const CameraNaoEmbarcada(),
        envio: EnvioDeFoto(
          camera: const CameraNaoEmbarcada(),
          cliente: MockClient(
            (_) async => throw StateError('nenhum caso daqui sobe bytes'),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// O PERFIL DE TERCEIRO, MONTADO DIRETO
// ---------------------------------------------------------------------------

const String _apelido = 'marina-vet';
const String _urlBaseDoPerfil = 'https://api.exemplo.test';

Map<String, dynamic> _fotoDeTerceiro(String grade, String aberta, String? alt) =>
    <String, dynamic>{'grid_url': grade, 'open_url': aberta, 'alt_text': alt};

/// O corpo de `getPersonProfile`, no formato do contrato.
///
/// `showcase` AUSENTE e `showcase: []` sao estados DIFERENTES, e por isso a
/// chave entra condicionalmente: ausente e "voce nao pode ver" (quem nao e
/// conexao), e `[]` e "esta conexao nao publicou nada".
Map<String, dynamic> _perfilJson({
  required String estado,
  List<Map<String, dynamic>>? fotos,
}) => <String, dynamic>{
  'handle': _apelido,
  'public_ref': 'AbCdEfGhIjKlMnOpQrStUv',
  'display_name': 'Marina',
  'pets_count': 2,
  'connections_count': 7,
  'connection_state': estado,
  'connection_ref': estado == 'connected' ? 'r1' : null,
  'contact_channel_verified': true,
  'showcase': ?fotos,
};

/// A tela de terceiro, montada com as portas DE VERDADE sobre um `MockClient`.
///
/// **Nao sao dubles das tres portas**, e a escolha copia
/// `test/telas/perfil_de_pessoa_test.dart`: `PessoasApi` e classe concreta, e
/// um duble dela faria o caso pular a decodificacao de `showcase[]` -- que e
/// justamente onde `open_url` entra na arvore. A rede responde 404 para tudo
/// que nao e o perfil, porque nenhum caso daqui age sobre a relacao.
Future<void> _montarOPerfilDeTerceiro(
  WidgetTester tester,
  Map<String, dynamic> perfil,
) async {
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    if (pedido.url.path.contains('/people/')) return json200(perfil);
    return http.Response('', 404);
  });
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBaseDoPerfil),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-teste',
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: TelaDePerfilDePessoa(
        apelido: _apelido,
        pessoas: PessoasApi(api),
        conexoes: ConexoesApi(api),
        seguranca: SegurancaApi(api),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// As fotos AMPLIADAS que estao montadas dentro do visualizador, na ordem.
///
/// Escopado em `VisualizadorDeImagem` de proposito: a rota de baixo continua
/// montada, e um `find.byType(Image)` solto acharia as celulas da grade --
/// que nao se movem e aprovariam o caso no lugar errado.
List<String> _urlsAmpliadas(WidgetTester tester) {
  final urls = <String>[];
  final dentro = find.descendant(
    of: find.byType(VisualizadorDeImagem),
    matching: find.byType(Image),
  );
  for (final e in dentro.evaluate()) {
    final p = (e.widget as Image).image;
    if (p is NetworkImage) urls.add(p.url);
    if (p is ResizeImage) {
      final interno = p.imageProvider;
      if (interno is NetworkImage) urls.add(interno.url);
    }
  }
  return urls;
}

Finder _fotoAmpliada() => find
    .descendant(
      of: find.byType(VisualizadorDeImagem),
      matching: find.byType(Image),
    )
    .first;

Future<http.Response> _semNada(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  return http.Response('', 404);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // =========================================================================
  // PEDIDO 1 -- A FOTO A ESQUERDA DO NOME, MEDIDA POR GEOMETRIA
  // =========================================================================
  group('(1) a foto fica A ESQUERDA do nome, na tela da propria conta', () {
    // -----------------------------------------------------------------------
    // ISCA. **DESLIGAR PARA VER REPROVAR:** em
    // `app/lib/telas/casca_com_abas.dart`, no `AppBar` de `TelaDeAba`, troque
    //
    //     leading: raizDeSecao ? AvatarDaConta(...) : null,
    //
    // por `leading: null` -- ou mova o `AvatarDaConta` para dentro de
    // `actions`. Nos dois casos este caso reprova pelo NOME, e o de presenca
    // da foto (`a foto tem alvo de 48 dp...`, em
    // `navegacao_mensagens_e_avatar_test.dart`) continua passando no segundo:
    // e por isso que medir presenca nao basta.
    // -----------------------------------------------------------------------
    testWidgets(
      'o retangulo da foto TERMINA antes de o retangulo do nome COMECAR',
      (tester) async {
        await abrirOApp(
          tester,
          rede: _semNada,
          deposito: depositoLogado(
            nome: _nomeDaConta,
            fotoUrl: 'https://img.bichu.app/me/card/EU.jpeg',
          ),
        );
        await irParaAConta(tester);

        // ANCORA 1: o nome E o titulo desta tela. Sem esta expectativa o caso
        // mediria o lado de um texto que poderia ser qualquer outro.
        final nome = find.descendant(
          of: find.byType(AppBar),
          matching: find.text(tituloDaTelaDaConta(_nomeDaConta)),
        );
        expect(
          nome,
          findsOneWidget,
          reason: 'REPROVA: o nome "$_nomeDaConta" nao e o titulo da barra '
              'desta tela. O resto deste caso nao mede o que diz medir.',
        );

        // ANCORA 2: o circulo DESENHADO, e nao o alvo de toque. O alvo tem 48
        // dp e encosta na borda da tela; o circulo tem 32 e fica a 16 dp dela.
        final circulo = find.byKey(AvatarDaConta.chaveDoCirculo);
        expect(
          circulo,
          findsOneWidget,
          reason: 'REPROVA: nao achei o circulo da foto da conta '
              '(`AvatarDaConta.chaveDoCirculo`) na barra desta tela.',
        );

        final retanguloDaFoto = pintado(tester, circulo);
        final retanguloDoNome = pintado(tester, nome);

        // O PEDIDO, EM PIXEL: a foto ACABA e so depois o nome COMECA.
        expect(
          retanguloDaFoto.right,
          lessThanOrEqualTo(retanguloDoNome.left),
          reason: 'REPROVA: a foto da conta NAO esta a esquerda do nome. O '
              'retangulo pintado da foto vai ate x=${retanguloDaFoto.right} '
              'e o do nome comeca em x=${retanguloDoNome.left}. Pedido do '
              'cliente em 26/10/2026: *"traga a foto do usuario ao lado '
              'esquerdo do nome do usuario, igual o instagram"*. Presenca dos '
              'dois na tela nao prova lado nenhum -- a foto em `actions` '
              'passaria em qualquer caso de presenca.',
        );

        // E NA MESMA LINHA: "ao lado" quer dizer que os dois se cruzam na
        // vertical. Sem esta metade, a foto empilhada ACIMA do nome passaria
        // na expectativa de cima -- ela tambem termina antes, na horizontal.
        expect(
          retanguloDaFoto.bottom,
          greaterThan(retanguloDoNome.top),
          reason: 'REPROVA: a foto termina (y=${retanguloDaFoto.bottom}) '
              'ANTES de o nome comecar (y=${retanguloDoNome.top}): ela esta '
              'EMPILHADA sobre o nome, e nao ao lado dele.',
        );
        expect(
          retanguloDaFoto.top,
          lessThan(retanguloDoNome.bottom),
          reason: 'REPROVA: a foto comeca (y=${retanguloDaFoto.top}) depois '
              'de o nome acabar (y=${retanguloDoNome.bottom}): ela esta '
              'ABAIXO do nome.',
        );
      },
    );

    // -----------------------------------------------------------------------
    // O CONTROLE DE QUEM NAO TEM FOTO. **DESLIGAR PARA VER REPROVAR:** em
    // `_MarcaNeutra.build`, de `casca_com_abas.dart`, troque
    // `child: foto == null ? marca : ImagemDaRede(...)` por
    // `child: ImagemDaRede(url: foto ?? '', ...)`.
    //
    // Ele existe porque a expectativa acima nao distingue os dois caminhos: um
    // conserto que desenhasse `ImagemDaRede` sempre passaria nela e deixaria
    // quem nao tem foto com um quadrado de erro no lugar da letra.
    // -----------------------------------------------------------------------
    testWidgets('quem NAO tem foto cai na INICIAL, e no mesmo lugar', (
      tester,
    ) async {
      await abrirOApp(
        tester,
        rede: _semNada,
        // `fotoUrl` ausente: o estado de quem nao cadastrou foto, de quem a
        // tem em `processing` e de quem a teve recusada. A tela nao distingue
        // os tres, e nao deve.
        deposito: depositoLogado(nome: _nomeDaConta),
      );
      await irParaAConta(tester);

      final circulo = find.byKey(AvatarDaConta.chaveDoCirculo);
      expect(circulo, findsOneWidget);

      // A LETRA, e ancorada no widget de dentro do circulo.
      expect(
        find.descendant(of: circulo, matching: find.text('M')),
        findsOneWidget,
        reason: 'REPROVA: a conta de "$_nomeDaConta" sem foto nao desenha a '
            'inicial `M` no circulo. O caminho da inicial e o que quem nao '
            'tem foto ve, e e tambem a reserva de falha de quem tem.',
      );
      // E NENHUMA imagem de servidor foi pedida para o circulo: sem esta
      // metade, um `ImagemDaRede` com URL vazia ao lado da letra passaria.
      expect(
        find.descendant(of: circulo, matching: find.byType(ImagemDaRede)),
        findsNothing,
        reason: 'REPROVA: sem foto cadastrada o circulo ainda pediu uma '
            '`ImagemDaRede`. `Image.network("")` LANCA, e o que a pessoa veria '
            'e o desenho de falha no lugar da letra dela.',
      );

      // E ela continua A ESQUERDA do nome: o caminho da inicial e o OUTRO
      // ramo do `build`, e um arranjo que valesse so para o ramo da foto
      // deixaria metade das contas fora do pedido.
      final nome = find.descendant(
        of: find.byType(AppBar),
        matching: find.text(tituloDaTelaDaConta(_nomeDaConta)),
      );
      expect(nome, findsOneWidget);
      expect(
        pintado(tester, circulo).right,
        lessThanOrEqualTo(pintado(tester, nome).left),
        reason: 'REPROVA: com a INICIAL o circulo deixou de ficar a esquerda '
            'do nome.',
      );
    });
  });

  // =========================================================================
  // PEDIDO 2 -- A VITRINE DO DONO ABRE O CARROSSEL
  // =========================================================================
  group('(2) a vitrine do DONO abre o carrossel com a lista inteira', () {
    // -----------------------------------------------------------------------
    // **O CONTROLE POSITIVO QUE MAIS IMPORTA DESTE ARQUIVO.**
    //
    // Com UMA foto o conserto parece funcionar mesmo errado: `abrir` e
    // `abrirVarias` desenham a MESMA tela para um elemento, sem `PageView`,
    // sem seta e sem contador. Entao o caso mede TRES fotos e, depois de
    // avancar, mede a URL DESENHADA -- e nao o contador. Um contador que ande
    // sozinho sobre a mesma imagem aprovaria o defeito.
    //
    // **DESLIGAR PARA VER REPROVAR:** em
    // `app/lib/telas/perfil/vitrine_de_fotos.dart`, dentro de `_celula`,
    // troque a chamada por
    //
    //     VisualizadorDeImagem.abrir(context, url: aberta, ...)
    //
    // que e exatamente o que estava la antes de 26/10. O caso reprova na
    // expectativa do `PageView`.
    // -----------------------------------------------------------------------
    testWidgets(
      'tocar a primeira celula abre o carrossel, e a seta troca a foto DESENHADA',
      (tester) async {
        await _montarAVitrine(tester, <Map<String, dynamic>>[
          _fotoDoDono(posicao: 0, grade: _grade1, aberta: _aberta1),
          _fotoDoDono(posicao: 1, grade: _grade2, aberta: _aberta2),
          _fotoDoDono(posicao: 2, grade: _grade3, aberta: _aberta3),
        ]);

        // ANCORA: a grade pintou as TRES celulas. Sem ela, uma vitrine que
        // falhou ao carregar deixaria todo o resto vacuo.
        expect(find.byType(ImagemDaRede), findsNWidgets(3));
        expect(find.byType(VisualizadorDeImagem), findsNothing);

        await tester.tap(find.byType(ImagemDaRede).first);
        await tester.pumpAndSettle();

        expect(
          find.byType(VisualizadorDeImagem),
          findsOneWidget,
          reason: 'REPROVA: o toque na celula nao abriu o visualizador. E a '
              'metade de 22/10 do pedido -- *"as fotos tem que ser clicaveis '
              'para expandir/aumentar"*.',
        );

        // A LISTA INTEIRA CHEGOU, e e isto que o `abrir` de uma URL nao fazia.
        expect(
          find.descendant(
            of: find.byType(VisualizadorDeImagem),
            matching: find.byType(PageView),
          ),
          findsOneWidget,
          reason: 'REPROVA: o visualizador abriu SEM `PageView`, o que '
              'significa que ele recebeu UMA url. Com uma foto ele nao desenha '
              'carrossel de proposito -- e e por isso que o defeito de 22/10 '
              'passou: a foto abria sozinha e nao havia como avancar.',
        );
        expect(
          find.text(VisualizadorDeImagem.contador(atual: 0, total: 3)),
          findsOneWidget,
          reason: 'REPROVA: o contador nao diz `1 de 3`. Ou a lista chegou '
              'incompleta, ou a foto aberta nao e a primeira.',
        );

        // A FOTO DESENHADA, antes de avancar.
        expect(_urlsAmpliadas(tester), <String>[_aberta1]);

        await tester.tap(
          find.byTooltip(VisualizadorDeImagem.rotuloDeProxima),
          warnIfMissed: true,
        );
        await tester.pumpAndSettle();

        // E AGORA O QUE IMPORTA: a imagem DESENHADA mudou.
        expect(
          _urlsAmpliadas(tester),
          <String>[_aberta2],
          reason: 'REPROVA: a seta avancou e a foto desenhada continua sendo '
              'a mesma. Medir so o contador aprovaria um numero que anda '
              'sozinho sobre uma imagem parada -- e e a reclamacao literal do '
              'cliente: *"um botão para avançar ou retroceder para a proxima '
              'imagem"*.',
        );
        expect(
          find.text(VisualizadorDeImagem.contador(atual: 1, total: 3)),
          findsOneWidget,
        );

        // E RETROCEDER volta. Ele pediu os dois sentidos.
        await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeAnterior));
        await tester.pumpAndSettle();
        expect(
          _urlsAmpliadas(tester),
          <String>[_aberta1],
          reason: 'REPROVA: a seta de voltar nao trouxe a foto anterior.',
        );
      },
    );

    // -----------------------------------------------------------------------
    // ISCA DO `inicial`. **DESLIGAR PARA VER REPROVAR:** em `_celula`, troque
    // `inicial: inicial` por `inicial: 0`.
    //
    // O caso de cima toca a PRIMEIRA celula e passaria com `inicial: 0`
    // cravado, que e justamente o defeito que faria a pessoa paginar seis
    // vezes para ver a foto que acabou de tocar.
    // -----------------------------------------------------------------------
    testWidgets('a foto TOCADA e a que abre, e nao a primeira da lista', (
      tester,
    ) async {
      await _montarAVitrine(tester, <Map<String, dynamic>>[
        _fotoDoDono(posicao: 0, grade: _grade1, aberta: _aberta1),
        _fotoDoDono(posicao: 1, grade: _grade2, aberta: _aberta2),
        _fotoDoDono(posicao: 2, grade: _grade3, aberta: _aberta3),
      ]);

      // A TERCEIRA celula, e a ordem da grade e a de `position` (a `Vitrine`
      // ordena por ela ao decodificar).
      await tester.tap(find.byType(ImagemDaRede).at(2));
      await tester.pumpAndSettle();

      expect(
        _urlsAmpliadas(tester),
        <String>[_aberta3],
        reason: 'REPROVA: o toque na TERCEIRA celula abriu outra foto. Abrir '
            'sempre a primeira faria a pessoa paginar duas vezes para chegar '
            'na que ela acabou de tocar.',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 2, total: 3)),
        findsOneWidget,
        reason: 'REPROVA: o contador nao diz `3 de 3` depois de tocar a '
            'terceira celula.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA DO INDICE NA LISTA FILTRADA. **DESLIGAR PARA VER REPROVAR:** em
    // `_celula`, troque o laco que conta `inicial` por
    //
    //     inicial: indice,
    //     urls: fotos.map((f) => f.urlAberta ?? '').toList(),
    //
    // -- que e a forma "obvia" do conserto. `abrirVarias` descarta a URL
    // vazia, a lista encurta para 2 e o indice 2 cai fora da faixa: o
    // visualizador abre na PRIMEIRA (ele trata fora-de-faixa assim de
    // proposito) e o caso reprova na URL desenhada.
    //
    // **Isto nao e hipotetico**: `processing` e o estado de toda foto nos
    // primeiros segundos depois do envio, e `rejected` tambem nao tem
    // `open_url`.
    // -----------------------------------------------------------------------
    testWidgets(
      'foto sem derivada nao ocupa posicao: o indice conta a lista FILTRADA',
      (tester) async {
        await _montarAVitrine(tester, <Map<String, dynamic>>[
          // A capa esta PROCESSANDO: ela pinta o estado em texto e nao tem
          // toque. As duas seguintes sao as unicas tocaveis.
          _fotoProcessando(0),
          _fotoDoDono(posicao: 1, grade: _grade2, aberta: _aberta2),
          _fotoDoDono(posicao: 2, grade: _grade3, aberta: _aberta3),
        ]);

        // ANCORA: so DUAS celulas desenham imagem de servidor -- a que
        // processa desenha `Preparando…`. Sem esta expectativa o `at(1)`
        // abaixo poderia estar apontando para outra coisa.
        expect(
          find.byType(ImagemDaRede),
          findsNWidgets(2),
          reason: 'REPROVA: a celula em `processing` desenhou imagem. Ela nao '
              'tem derivada nenhuma, e o que ela mostra e o estado.',
        );
        expect(find.text('Preparando…'), findsOneWidget);

        // A SEGUNDA tocavel, que e a TERCEIRA da grade.
        await tester.tap(find.byType(ImagemDaRede).at(1));
        await tester.pumpAndSettle();

        expect(
          _urlsAmpliadas(tester),
          <String>[_aberta3],
          reason: 'REPROVA: a foto aberta nao e a tocada. A lista que chega ao '
              'visualizador tem DUAS urls (a que processa nao tem `open_url`), '
              'e o indice tem de ser 1 e nao 2 -- indice da grade com lista '
              'filtrada abre a foto errada em SILENCIO.',
        );
        expect(
          find.text(VisualizadorDeImagem.contador(atual: 1, total: 2)),
          findsOneWidget,
          reason: 'REPROVA: o contador nao diz `2 de 2`. A foto em '
              '`processing` nao pode entrar no total: nao ha como abri-la.',
        );
      },
    );

    // -----------------------------------------------------------------------
    // CONTRAPESO: com UMA foto NAO ha carrossel.
    //
    // Sem este caso, um conserto que sempre desenhasse `PageView`, setas e
    // contador passaria em todos os de cima -- e poria duas setas mortas e um
    // `1 de 1` na tela de quem tem uma foto so. A regra e do visualizador e
    // ja tem isca propria; este caso prova que a VITRINE nao a contorna
    // passando lista inflada (por exemplo com `?? ''` no lugar da guarda).
    // -----------------------------------------------------------------------
    testWidgets('UMA foto na vitrine: sem `PageView`, sem seta, sem contador', (
      tester,
    ) async {
      await _montarAVitrine(tester, <Map<String, dynamic>>[
        _fotoDoDono(posicao: 0, grade: _grade1, aberta: _aberta1),
      ]);

      await tester.tap(find.byType(ImagemDaRede).first);
      await tester.pumpAndSettle();

      expect(find.byType(VisualizadorDeImagem), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(VisualizadorDeImagem),
          matching: find.byType(PageView),
        ),
        findsNothing,
        reason: 'REPROVA: uma foto so virou carrossel. Um carrossel de um '
            'elemento promete navegacao e nao tem para onde ir.',
      );
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima), findsNothing);
      expect(
        find.byTooltip(VisualizadorDeImagem.rotuloDeAnterior),
        findsNothing,
      );
      expect(_urlsAmpliadas(tester), <String>[_aberta1]);
    });

    // -----------------------------------------------------------------------
    // O ARRASTE LIMITADO AS BORDAS, AGORA ALCANCAVEL POR ESTA TELA.
    //
    // A decisao e de 26/10/2026 (*"o arraste limitada as bordas"*) e ja tem
    // iscas em `test/widgets/visualizador_de_imagem_test.dart`. **Elas montam
    // o visualizador solto**, e este caso confirma que o comportamento
    // continua valendo quando quem empilha a rota e a VITRINE -- com a grade
    // montada embaixo.
    //
    // **COM UMA FOTO, E ISSO NAO E conveniencia.** Aquele arquivo mediu em
    // 26/10 que, dentro do `PageView`, nenhum arrasto que se conseguiu
    // construir move a imagem: o `Scrollable` do carrossel ganha a arena de
    // gestos. Um caso de tres fotos aqui passaria com a moldura INFINITA
    // tambem -- medido, e e por isso que ele esta abaixo marcado como GUARDA.
    // O defeito do cliente vive na arvore de uma foto, e e nela que esta isca
    // morde.
    //
    // **DESLIGAR PARA VER REPROVAR:** em
    // `app/lib/widgets/visualizador_de_imagem.dart`, troque
    // `boundaryMargin: EdgeInsets.zero` por
    // `const EdgeInsets.all(double.infinity)`. (Esta frente NAO mexe naquele
    // arquivo: a troca foi aplicada, medida e desfeita.)
    // -----------------------------------------------------------------------
    testWidgets(
      'aberta pela vitrine, a foto NAO ampliada nao anda com o arrasto',
      (tester) async {
        await _montarAVitrine(tester, <Map<String, dynamic>>[
          _fotoDoDono(posicao: 0, grade: _grade1, aberta: _aberta1),
        ]);
        await tester.tap(find.byType(ImagemDaRede).first);
        await tester.pumpAndSettle();

        final foto = _fotoAmpliada();
        final antes = pintado(tester, foto);

        await tester.drag(
          find.byType(InteractiveViewer).first,
          const Offset(-137, -151),
        );
        await tester.pumpAndSettle();
        final depois = pintado(tester, foto);

        // Meio pixel de tolerancia, pelo mesmo motivo do arquivo do
        // visualizador: o `clamp` multiplica matriz em ponto flutuante e deixa
        // residuo de 1e-10 px. O defeito que isto vigia deslocava 118,9 px.
        expect(depois.left, closeTo(antes.left, 0.5));
        expect(depois.top, closeTo(antes.top, 0.5));
        expect(
          depois.right,
          closeTo(antes.right, 0.5),
          reason: 'REPROVA: aberta PELA VITRINE, a foto nao ampliada andou com '
              'o arrasto -- saiu de $antes e parou em $depois. O arraste '
              'limitado as bordas e decisao do cliente de 26/10/2026, e ligar '
              'o carrossel aqui nao pode ter aberto folga infinita.',
        );
        expect(depois.bottom, closeTo(antes.bottom, 0.5));
      },
    );

    // -----------------------------------------------------------------------
    // GUARDA, E NAO ISCA -- dito com o nome para ninguem se enganar.
    //
    // **Ele passa com a moldura INFINITA tambem**, e isso foi MEDIDO nesta
    // frente em 26/10/2026: com tres fotos a arvore tem `PageView`, o
    // `Scrollable` dele ganha a arena de gestos e o arrasto nao alcanca o
    // `InteractiveViewer`. E a mesma conclusao que
    // `test/widgets/visualizador_de_imagem_test.dart` registra no seu proprio
    // caso de guarda.
    //
    // Fica porque e a barreira do dia em que o carrossel passar a entregar o
    // arrasto ao ampliador -- mas nao conta como prova de nada.
    // -----------------------------------------------------------------------
    testWidgets(
      'GUARDA — com TRES fotos o arrasto tambem nao desloca a imagem',
      (tester) async {
        await _montarAVitrine(tester, <Map<String, dynamic>>[
          _fotoDoDono(posicao: 0, grade: _grade1, aberta: _aberta1),
          _fotoDoDono(posicao: 1, grade: _grade2, aberta: _aberta2),
          _fotoDoDono(posicao: 2, grade: _grade3, aberta: _aberta3),
        ]);
        await tester.tap(find.byType(ImagemDaRede).first);
        await tester.pumpAndSettle();

        final foto = _fotoAmpliada();
        final antes = pintado(tester, foto);
        await tester.drag(
          find.byType(InteractiveViewer).first,
          const Offset(-137, -151),
        );
        await tester.pumpAndSettle();
        final depois = pintado(tester, foto);

        expect(depois.left, closeTo(antes.left, 0.5));
        expect(depois.top, closeTo(antes.top, 0.5));
        expect(depois.right, closeTo(antes.right, 0.5));
        expect(depois.bottom, closeTo(antes.bottom, 0.5));
      },
    );
  });

  // =========================================================================
  // PEDIDO 2 -- A GRADE DO PERFIL DE TERCEIRO NAO TINHA TOQUE NENHUM
  // =========================================================================
  group('(2) a grade do perfil de TERCEIRO passa a abrir o carrossel', () {
    // -----------------------------------------------------------------------
    // **DESLIGAR PARA VER REPROVAR:** em
    // `app/lib/telas/pessoa/tela_perfil_de_pessoa.dart`, em `_celula`,
    // devolva `imagem` direto em vez do `Semantics`/`InkWell` -- que e
    // exatamente o que estava la antes de 26/10. O caso reprova na
    // expectativa do visualizador.
    //
    // Esta grade **nao tinha `onTap` nenhum**: a derivada de 1024 px viajava
    // em `showcase[].open_url` desde que a tela nasceu e nada a desenhava.
    // -----------------------------------------------------------------------
    testWidgets('tocar abre o carrossel, e a seta troca a foto DESENHADA', (
      tester,
    ) async {
      await _montarOPerfilDeTerceiro(
        tester,
        _perfilJson(
          estado: 'connected',
          fotos: <Map<String, dynamic>>[
            _fotoDeTerceiro(_grade1, _aberta1, 'o quintal'),
            _fotoDeTerceiro(_grade2, _aberta2, null),
            _fotoDeTerceiro(_grade3, _aberta3, null),
          ],
        ),
      );

      // ANCORA: a grade pintou as tres, e com a derivada da GRADE -- a regra
      // de `perfil_de_pessoa_test.dart` continua valendo.
      final celulas = tester
          .widgetList<ImagemDaRede>(find.byType(ImagemDaRede))
          .toList();
      expect(celulas, hasLength(3));
      expect(celulas.first.url, _grade1);

      await tester.tap(find.byType(ImagemDaRede).first);
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsOneWidget,
        reason: 'REPROVA: a grade do perfil de terceiro continua sem toque. '
            'Esta e a tela que mostra o nome do usuario E as fotos publicadas '
            'na mesma pagina, e e a leitura mais provavel de *"na pagina do '
            'perfil do usuário, as fotos publicadas devem ser clicaveis"*.',
      );
      expect(
        find.descendant(
          of: find.byType(VisualizadorDeImagem),
          matching: find.byType(PageView),
        ),
        findsOneWidget,
        reason: 'REPROVA: abriu sem `PageView`, entao recebeu UMA url e nao a '
            'lista.',
      );
      expect(_urlsAmpliadas(tester), <String>[_aberta1]);

      await tester.tap(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima));
      await tester.pumpAndSettle();

      expect(
        _urlsAmpliadas(tester),
        <String>[_aberta2],
        reason: 'REPROVA: a seta avancou e a foto desenhada continua a mesma.',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 3)),
        findsOneWidget,
      );
    });

    // -----------------------------------------------------------------------
    // ISCA DO `inicial`, do mesmo jeito que na vitrine do dono.
    // **DESLIGAR PARA VER REPROVAR:** troque `inicial: inicial` por
    // `inicial: 0` em `_celula`.
    // -----------------------------------------------------------------------
    testWidgets('a foto TOCADA e a que abre', (tester) async {
      await _montarOPerfilDeTerceiro(
        tester,
        _perfilJson(
          estado: 'connected',
          fotos: <Map<String, dynamic>>[
            _fotoDeTerceiro(_grade1, _aberta1, null),
            _fotoDeTerceiro(_grade2, _aberta2, null),
            _fotoDeTerceiro(_grade3, _aberta3, null),
          ],
        ),
      );

      await tester.tap(find.byType(ImagemDaRede).at(1));
      await tester.pumpAndSettle();

      expect(
        _urlsAmpliadas(tester),
        <String>[_aberta2],
        reason: 'REPROVA: o toque na SEGUNDA celula abriu outra foto.',
      );
      expect(
        find.text(VisualizadorDeImagem.contador(atual: 1, total: 3)),
        findsOneWidget,
      );
    });

    // -----------------------------------------------------------------------
    // CONTRAPESO: quem NAO e conexao nao tem grade, e portanto nao tem toque.
    //
    // Sem este caso, o toque novo poderia ter nascido num lugar que aparece
    // para estranho -- que e onde o golpe do falso achador mora, e o que a
    // emenda 2 do ADR-0010 fecha. A ausencia e ancorada no WIDGET.
    // -----------------------------------------------------------------------
    testWidgets('estranho nao ve grade, e por isso nao ve toque', (
      tester,
    ) async {
      // `fotos` NULO: a chave `showcase` nem entra no corpo, que e o que a
      // borda faz para quem nao e conexao aceita.
      await _montarOPerfilDeTerceiro(tester, _perfilJson(estado: 'none'));

      expect(find.byType(ImagemDaRede), findsNothing);
      expect(find.byType(GridView), findsNothing);
      expect(
        find.text(TelaDePerfilDePessoa.fotosSoParaConexao),
        findsOneWidget,
      );
    });
  });
}
