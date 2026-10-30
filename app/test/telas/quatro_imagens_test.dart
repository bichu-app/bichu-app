// AS ATE QUATRO IMAGENS, na indicacao e no encontro (cliente, 29 e 30/10/2026).
//
// Verbatim: *"nas indicacoes de estabelecimento e eventos so esta sendo
// possivel enviar uma imagem no app, devemos deixar enviar ate 4 imagens"* e
// *"na pagina de indicacao de profissional/estabelecimento, so tem o campo para
// subir a foto do logotipo da empresa, mas nao as fotos do estabelecimento que
// fica no topo da pagina"*.
//
// =========================================================================
// O QUE ESTE ARQUIVO MEDE, E POR QUE CADA CASO EXISTE
// =========================================================================
//
//  1. **A ROTA da indicacao e NOVA, e e a da foto -- nao a da logo.** Logo e
//     marca (512 quadrado, minima 256); foto do estabelecimento e a faixa do
//     topo da ficha (1280 x 720, minima 600). Duas geometrias, duas minimas,
//     dois propositos -- e o proposito e o que impede a imagem de uma indicacao
//     pendente de aparecer no `Perto`. A rede deste arquivo responde `404` a
//     tudo que nao declara, entao chamar a rota da logo para a foto REPROVA.
//  2. **A ORDEM e o corpo.** A primeira e a capa, e nao existe campo de capa:
//     mover a segunda para cima tem de TROCAR a capa no `POST`. Um caso que so
//     contasse "duas imagens" passaria com a ordem invertida.
//  3. **A LOGO NAO CONTA entre as quatro.** Quem tem logo pode mandar a logo E
//     quatro fotos. Um teto compartilhado deixaria quem tem logo com tres.
//  4. **A chave SAI do corpo quando nao ha imagem.** `minItems: 1` recusa `[]`
//     com `400`, e `format: uuid` recusa nulo: "mandei a lista vazia" e "nao
//     mandei a lista" sao a MESMA intencao dita de duas formas.
//  5. **No encontro, `cover_image` NUNCA vai junto de `image_upload_ids`** --
//     os dois no mesmo corpo sao `400 cover_and_images_both_sent`.
//  6. **O ORCAMENTO DE DECODIFICACAO.** Quatro faixas 16:9 decodificadas no
//     tamanho do ARQUIVO sao dezenas de MiB. O caso MEDE o `cacheWidth` que a
//     miniatura leva, e tem controle positivo do proprio medidor.
//
// =========================================================================
// AS ISCAS, E COMO CADA UMA FOI PROVADA
// =========================================================================
//
// Conferidas reprovando nesta arvore, uma por vez, desfazendo depois -- a
// tabela esta no relatorio da entrega.
//
// =========================================================================
// O QUE ESTE ARQUIVO NAO MEDE
// =========================================================================
//
// - **O proposito gravado no envio.** Ele e do SERVIDOR: nem
//   `DirectorySuggestionPhotoIntentInput` nem o corpo da capa tem campo
//   `purpose`, e e a ROTA que o fixa.
// - **A recusa de dimensao (422) e a de `uniqueItems` (400).** Sao do servidor.
// - **A geometria da janela de recorte.** Ela e travada contra o `.ts` do
//   servidor em `test/widgets/recorte_segue_o_servidor_test.dart`; aqui so se
//   mede QUAL constante cada ponto de upload passa.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/faixa_de_imagens.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:bichu/widgets/recorte_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

import '../rede/fixtures_da_rede.dart';
import 'ajuda_de_tela.dart';
import 'criar_encontro_test.dart' as encontro
    show abrirAPorta, abrirAgenda, corpoDoFormulario, preencherOMinimo;
import 'sugerir_profissional_test.dart' as indicacao
    show abrirAPorta, abrirPerto, diretorioVazio, preencherOMinimo;

// =========================================================================
// A CAMERA QUE ENTREGA UMA FILA
// =========================================================================

/// Uma camera que devolve uma FILA de fotos, uma por chamada.
///
/// **`CameraDeTeste` devolve SEMPRE a mesma foto**, e com ela nenhum caso
/// distingue "a tela guardou duas imagens" de "a tela guardou a mesma imagem
/// duas vezes" -- nem a ORDEM, que e o que decide a capa. Esta e a diferenca.
class CameraComFila implements CameraEGaleria {
  CameraComFila(this.fila, {this.estado = EstadoDaPermissao.concedida});

  /// As fotos a entregar, em ordem. Esgotada, devolve nulo (a pessoa
  /// cancelou o seletor).
  final List<FotoLocal> fila;

  EstadoDaPermissao estado;

  int entregues = 0;
  int vezesQueLeuOsBytes = 0;
  bool abriuAjustes = false;

  FotoLocal? _proxima() =>
      entregues < fila.length ? fila[entregues++] : null;

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async => estado;

  @override
  Future<EstadoDaPermissao> pedirCamera() async => estado;

  @override
  Future<void> abrirAjustesDoSistema() async => abriuAjustes = true;

  @override
  Future<FotoLocal?> tirarFoto() async => _proxima();

  @override
  Future<FotoLocal?> escolherDaGaleria() async => _proxima();

  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) async {
    vezesQueLeuOsBytes += 1;
    // Os bytes carregam o CAMINHO, para o caso achar no corpo da requisicao
    // qual arquivo foi para o fio -- e em que ordem.
    return Uint8List.fromList(utf8.encode('bytes-de-${foto.caminho}'));
  }

  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async =>
      foto;
}

/// Quatro fotos distinguiveis pelo caminho, **sem arquivo em disco**.
///
/// Sem arquivo, `ajustarAFoto` nao abre a folha e devolve a foto como esta --
/// o que mantem estes casos sobre o CAMPO, e nao sobre o recorte. Quem mede o
/// recorte e `recorte_em_todo_upload_test.dart`.
const List<FotoLocal> quatroFotos = <FotoLocal>[
  FotoLocal(caminho: '/tmp/f1.jpg', tipoDeConteudo: 'image/jpeg', tamanhoEmBytes: 11),
  FotoLocal(caminho: '/tmp/f2.jpg', tipoDeConteudo: 'image/jpeg', tamanhoEmBytes: 22),
  FotoLocal(caminho: '/tmp/f3.jpg', tipoDeConteudo: 'image/jpeg', tamanhoEmBytes: 33),
  FotoLocal(caminho: '/tmp/f4.jpg', tipoDeConteudo: 'image/jpeg', tamanhoEmBytes: 44),
];

// =========================================================================
// A REDE
// =========================================================================

const String armazenamentoDasFotos = 'https://armazenamento.exemplo/foto';

/// O `upload_id` da n-esima autorizacao, **diferente a cada chamada**.
///
/// Um identificador fixo faria `[id, id]` passar por "duas imagens na ordem",
/// que e exatamente o que o `uniqueItems` do contrato recusa.
String uploadDeOrdem(int n) => '018f7c1e-9999-7c3d-9e4f-00000000000$n';

/// O que a rede recebeu, guardado.
class CapturadoDasImagens {
  final List<http.Request> pedidos = <http.Request>[];
  int intencoes = 0;

  Iterable<http.Request> doCaminho(String fim) =>
      pedidos.where((p) => p.url.path.endsWith(fim));

  Iterable<http.Request> aoArmazenamento() => pedidos
      .where((p) => p.url.toString().startsWith(armazenamentoDasFotos));

  List<Map<String, dynamic>> corposDe(String caminho) => pedidos
      .where((p) => p.url.path == caminho && p.method == 'POST')
      .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
      .toList();

  List<Map<String, dynamic>> indicacoes() =>
      corposDe('/v1/directory/suggestions');

  List<Map<String, dynamic>> criacoes() => corposDe('/v1/network/events');
}

/// A resposta de uma autorizacao de envio, com o `upload_id` da vez.
http.Response _autorizacao(int n) => json200(
      <String, dynamic>{
        'upload_id': uploadDeOrdem(n),
        'method': 'POST',
        'url': armazenamentoDasFotos,
        'fields': <String, String>{'key': 'directory/original/$n'},
        'max_bytes': 5 * 1024 * 1024,
      },
      status: 201,
    );

/// A rede da indicacao.
///
/// **404 em qualquer outra rota**, e nao 200 vazio. A rota da LOGO
/// (`/media/directory-suggestion-logo-intents`) **esta** declarada porque a
/// tela tem os dois campos; o que separa os dois caminhos e o `doCaminho` de
/// cada caso contando a rota CERTA. A rota do PAINEL
/// (`/admin/media/catalog-image-intents`) nao esta aqui de proposito.
Future<http.Response> Function(http.Request) redeDaIndicacao({
  required CapturadoDasImagens capturado,
  Future<http.Response> Function()? respostaDoArmazenamento,
}) {
  return (req) async {
    capturado.pedidos.add(req);
    if (req.url.toString().startsWith(armazenamentoDasFotos)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path.endsWith('/media/directory-suggestion-photo-intents') ||
        req.url.path.endsWith('/media/directory-suggestion-logo-intents')) {
      capturado.intencoes += 1;
      return _autorizacao(capturado.intencoes);
    }
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(indicacao.diretorioVazio());
    }
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'POST') {
      return json200(
        <String, dynamic>{
          'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
          'state': 'pending',
          'created_at': '2026-10-30T12:00:00Z',
        },
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

/// A rede do encontro.
Future<http.Response> Function(http.Request) redeDoEncontro({
  required CapturadoDasImagens capturado,
}) {
  return (req) async {
    capturado.pedidos.add(req);
    if (req.url.toString().startsWith(armazenamentoDasFotos)) {
      return http.Response('', 204);
    }
    if (req.url.path.endsWith('/media/network-event-cover-intents')) {
      capturado.intencoes += 1;
      return _autorizacao(capturado.intencoes);
    }
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(pagina(<Map<String, dynamic>>[]));
    }
    if (req.url.path == '/v1/network/events' && req.method == 'POST') {
      return json200(encontroPublico(), status: 201);
    }
    return problema('not-found', 404);
  };
}

// =========================================================================
// OS AJUDANTES DE TELA
// =========================================================================

Finder get _corpoDaIndicacao => find
    .descendant(
      of: find.byType(TelaSugerirProfissional),
      matching: find.byType(Scrollable),
    )
    .first;

/// Rola o corpo da indicacao ate o rotulo [alvo], **do topo para baixo**.
///
/// `ListView` so constroi o que cabe: um `ensureVisible` sobre widget que nao
/// esta na arvore estoura `Bad state: No element`, e a falha aponta para o
/// lugar errado.
Future<void> _rolarNaIndicacao(WidgetTester tester, Finder alvo) async {
  await rolarAteDeCimaOuDeBaixo(tester, alvo, scrollable: _corpoDaIndicacao);
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
}

/// Toca em `Escolher foto do lugar` [vezes] vezes.
Future<void> _escolherFotosDoLugar(
  WidgetTester tester,
  int vezes, {
  bool assentar = true,
}) async {
  for (var i = 0; i < vezes; i += 1) {
    await _rolarNaIndicacao(
      tester,
      find.text(TelaSugerirProfissional.escolherAFotoDoLugar),
    );
    await tester.tap(find.text(TelaSugerirProfissional.escolherAFotoDoLugar));
    if (assentar) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }
  }
}

/// Toca num controle da faixa pela POSICAO.
Future<void> _tocarNoControle(
  WidgetTester tester,
  String rotulo,
  int posicao,
) async {
  final alvo = find.byKey(FaixaDeImagens.chaveDoControle(rotulo, posicao));
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// Abre a indicacao com a camera da fila.
Future<CameraComFila> _abrirAIndicacao(
  WidgetTester tester, {
  required CapturadoDasImagens capturado,
  int fotos = 4,
  Future<http.Response> Function()? respostaDoArmazenamento,
}) async {
  final camera = CameraComFila(quatroFotos.take(fotos).toList());
  await indicacao.abrirPerto(
    tester,
    rede: redeDaIndicacao(
      capturado: capturado,
      respostaDoArmazenamento: respostaDoArmazenamento,
    ),
    camera: camera,
  );
  await indicacao.abrirAPorta(tester);
  // **O formulario e preenchido ANTES da imagem**, e a ordem e tecnica:
  // `preencherOMinimo` comeca rolando ate `Nome do lugar`, que fica ACIMA da
  // faixa, e a rolagem so procura para baixo.
  await indicacao.preencherOMinimo(tester);
  return camera;
}

Future<void> _enviarAIndicacao(WidgetTester tester) async {
  await tocar(
    tester,
    find.widgetWithText(BotaoPrimario, TelaSugerirProfissional.rotuloDeIndicar),
  );
}

void main() {
  // =======================================================================
  group('A INDICACAO: as fotos do estabelecimento', () {
    testWidgets(
        'ISCA — duas fotos pedem DUAS autorizacoes na ROTA DA FOTO, sobem por '
        'fora da ApiClient, e o corpo leva `photo_upload_ids` NA ORDEM',
        (tester) async {
      // ISCA 1: trocar `intencaoDeFotoDoEstabelecimento` por
      // `intencaoDeLogotipoDaIndicacao` em `_escolheuAFotoDoLugar`. Compila, o
      // envio funciona, `flutter analyze` fica calado -- e a imagem sobe com
      // `purpose: directory_suggestion_logo`, que e a fronteira que o proposito
      // separado existe para fechar. Este caso reprova no `doCaminho` da rota
      // da foto.
      //
      // ISCA 2: tirar `fotosDoEstabelecimento:` de `_indicar`. O `POST`
      // continua saindo, a indicacao continua nascendo -- e as fotos nunca
      // entram nela: a intencao vence em 600 s e o varredor a recolhe.
      final capturado = CapturadoDasImagens();
      final camera = await _abrirAIndicacao(
        tester,
        capturado: capturado,
        fotos: 2,
      );

      await _escolherFotosDoLugar(tester, 2);

      // ----- PASSO 1: DUAS autorizacoes, na rota DA FOTO -----
      final intencoes = capturado
          .doCaminho('/media/directory-suggestion-photo-intents')
          .toList();
      expect(
        intencoes,
        hasLength(2),
        reason: 'REPROVA: a tela nao pediu DUAS autorizacoes em '
            '"/media/directory-suggestion-photo-intents" (achou '
            '${intencoes.length}). Uma chamada POR FOTO e o contrato: nao '
            'existe autorizacao "de quatro imagens", porque cada assinatura e '
            'uma autorizacao de escrita independente. E se ela pediu na rota '
            'do LOGOTIPO, a imagem nasce com '
            '`purpose: directory_suggestion_logo` -- o proposito que a escrita '
            'de `professionals` aceita.',
      );
      for (final pedido in intencoes) {
        final corpo = jsonDecode(pedido.body) as Map<String, dynamic>;
        expect(corpo['content_type'], 'image/jpeg');
        // **Sem `purpose`**, e a ausencia e do contrato: a ROTA fixa o
        // proposito, e o esquema e `additionalProperties: false`.
        expect(
          corpo.containsKey('purpose'),
          isFalse,
          reason: 'REPROVA: a tela mandou `purpose` no corpo da intencao. '
              'Deixar o cliente escolhe-lo seria deixa-lo pedir uma '
              'autorizacao de foto do PAINEL por uma rota do aplicativo.',
        );
      }

      // ----- PASSO 2: os bytes, para o OUTRO host -----
      expect(
        capturado.aoArmazenamento(),
        hasLength(2),
        reason: 'REPROVA: os bytes das fotos nao foram para o armazenamento '
            'assinado. Sem este passo o `upload_id` aponta para objeto que nao '
            'existe, e o `POST` da indicacao volta `400 upload_not_usable`.',
      );
      expect(
        camera.vezesQueLeuOsBytes,
        2,
        reason: 'REPROVA: os bytes foram lidos '
            '${camera.vezesQueLeuOsBytes} vez(es), e esperava 2. Este contador '
            'e o unico que separa "a tela mostrou a previa" de "a tela subiu a '
            'foto".',
      );

      // ----- PASSO 3: a lista no corpo, NA ORDEM -----
      await _enviarAIndicacao(tester);
      final corpo = capturado.indicacoes().single;
      expect(
        corpo['photo_upload_ids'],
        <String>[uploadDeOrdem(1), uploadDeOrdem(2)],
        reason: 'REPROVA: `photo_upload_ids` nao e a lista das duas '
            'autorizacoes na ordem em que a pessoa as pos. A PRIMEIRA E A '
            'CAPA: uma ordem embaralhada troca a imagem que vai para o topo '
            'da ficha, e nenhuma verificacao de contagem enxerga isso.',
      );
    });

    testWidgets(
        'ISCA — sem foto nenhuma, `photo_upload_ids` NAO vai no corpo e '
        'NENHUMA autorizacao e pedida', (tester) async {
      // O caminho do APK publicado, e o caso comum. **A chave tem de SAIR do
      // corpo**: `[]` e `400` por `minItems: 1`, e `null` e `400` por
      // `format: uuid`. ISCA: em `corpoDaSugestao`, trocar a guarda
      // `isNotEmpty` por um `photo_upload_ids` sempre presente -- compila, e
      // toda indicacao sem foto passa a tomar 400.
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(tester, capturado: capturado, fotos: 0);
      await _enviarAIndicacao(tester);

      final corpo = capturado.indicacoes().single;
      expect(
        corpo.containsKey('photo_upload_ids'),
        isFalse,
        reason: 'REPROVA: o corpo carrega `photo_upload_ids` sem ninguem ter '
            'escolhido imagem. "Mandei a lista vazia" e "nao mandei a lista" '
            'sao a MESMA intencao dita de duas formas, e o contrato recusa as '
            'duas: `minItems: 1` e `format: uuid`.',
      );
      expect(
        capturado
            .doCaminho('/media/directory-suggestion-photo-intents')
            .isEmpty,
        isTrue,
        reason: 'REPROVA: a tela pediu autorizacao de envio sem ninguem ter '
            'escolhido imagem. Cada assinatura e uma autorizacao de escrita '
            'que nao se desfaz, e o teto da rota e 20 por hora.',
      );
    });

    testWidgets(
        'ISCA — mover a segunda para cima TROCA a capa no corpo',
        (tester) async {
      // **A capa e a POSICAO, e nao um campo.** ISCA: fazer `_moverAFotoDoLugar`
      // nao reordenar (um `setState` vazio, por exemplo). As setas continuam na
      // tela, o toque continua respondendo, a contagem continua 2 -- e a capa
      // e sempre a primeira que a pessoa escolheu, que e o oposto do que a
      // seta prometeu.
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(tester, capturado: capturado, fotos: 2);
      await _escolherFotosDoLugar(tester, 2);

      await _tocarNoControle(tester, FaixaDeImagens.moverParaCima, 1);
      await _enviarAIndicacao(tester);

      expect(
        capturado.indicacoes().single['photo_upload_ids'],
        <String>[uploadDeOrdem(2), uploadDeOrdem(1)],
        reason: 'REPROVA: a seta para cima nao trocou a ordem no corpo. A '
            'primeira e a capa, e mover para o topo e o UNICO jeito de '
            'escolher a capa nesta tela -- nao ha campo de capa.',
      );
    });

    testWidgets('ISCA — remover tira a foto do corpo', (tester) async {
      // ISCA: fazer `_removerAFotoDoLugar` nao remover. O `X` continua na tela
      // e o corpo continua levando a imagem que a pessoa tirou -- a indicacao
      // nasce com uma foto que ela decidiu nao mandar.
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(tester, capturado: capturado, fotos: 2);
      await _escolherFotosDoLugar(tester, 2);

      await _tocarNoControle(tester, FaixaDeImagens.remover, 0);
      await _enviarAIndicacao(tester);

      expect(
        capturado.indicacoes().single['photo_upload_ids'],
        <String>[uploadDeOrdem(2)],
        reason: 'REPROVA: remover a primeira nao a tirou do corpo, ou tirou a '
            'errada. O `X` que nao remove e pior que a ausencia do controle.',
      );
    });

    testWidgets(
        'ISCA — com QUATRO, os dois botoes ficam APAGADOS e o motivo e dito',
        (tester) async {
      // ISCA: tirar o `cheio` do `onPressed` da faixa -- de QUALQUER dos dois
      // botoes. Compila, a tela continua igual -- e a quinta escolha pede uma
      // QUINTA assinatura, que o `maxItems: 4` do corpo depois recusa com
      // `400`. A pessoa paga uma autorizacao de escrita que nao se desfaz por
      // uma imagem que nunca ia entrar.
      //
      // **OS DOIS BOTOES SAO MEDIDOS, e isso nao e zelo:** conferido nesta
      // arvore, a isca plantada so no `aoTirar` passou VERDE quando este caso
      // media apenas o da galeria. Um gatilho de teto por botao, com um caso
      // que olha para um deles, e um teto que vale para metade da tela.
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(tester, capturado: capturado, fotos: 4);
      await _escolherFotosDoLugar(tester, 4);

      await _rolarNaIndicacao(
        tester,
        find.text(TelaSugerirProfissional.escolherAFotoDoLugar),
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(
                OutlinedButton,
                TelaSugerirProfissional.escolherAFotoDoLugar,
              ),
            )
            .onPressed,
        isNull,
        reason: 'REPROVA: `${TelaSugerirProfissional.escolherAFotoDoLugar}` '
            'esta tocavel com quatro imagens na faixa. O teto do contrato e '
            'quatro (`maxItems: 4`), e a quinta escolha gasta uma assinatura '
            'para tomar 400 depois.',
      );
      expect(
        tester
            .widget<BotaoSecundario>(
              find.widgetWithText(
                BotaoSecundario,
                TelaSugerirProfissional.tirarAFotoDoLugar,
              ),
            )
            .aoTocar,
        isNull,
        reason: 'REPROVA: `${TelaSugerirProfissional.tirarAFotoDoLugar}` esta '
            'tocavel com quatro imagens na faixa. Medido: a isca plantada so '
            'neste botao passou verde enquanto este caso olhava apenas para o '
            'da galeria.',
      );
      await _rolarNaIndicacao(
        tester,
        find.text(FaixaDeImagens.tetoAlcancado(FaixaDeImagens.maximoDoContrato)),
      );
      expect(
        find.text(
          FaixaDeImagens.tetoAlcancado(FaixaDeImagens.maximoDoContrato),
        ),
        findsOneWidget,
        reason: 'REPROVA: os botoes estao apagados e CALADOS. Botao '
            'desabilitado sem motivo foi o que custou tempo ao cliente tres '
            'vezes num dia.',
      );

      await _enviarAIndicacao(tester);
      expect(
        capturado.indicacoes().single['photo_upload_ids'],
        <String>[
          uploadDeOrdem(1),
          uploadDeOrdem(2),
          uploadDeOrdem(3),
          uploadDeOrdem(4),
        ],
        reason: 'REPROVA: as quatro nao chegaram ao corpo na ordem.',
      );
    });

    testWidgets(
        'ISCA — a LOGO nao conta entre as quatro: `logo_upload_id` E quatro '
        'fotos no mesmo corpo', (tester) async {
      // **O caso que o contrato nomeia por extenso.** ISCA: fazer o logotipo
      // entrar na mesma lista (um campo so para as cinco imagens). Compila, a
      // tela fica "mais simples" -- e quem tem logo passa a poder mandar tres
      // fotos, o que NAO e o que o cliente pediu: ele nomeou as duas ausencias
      // em duas mensagens separadas, como duas coisas.
      final capturado = CapturadoDasImagens();
      final camera = CameraComFila(<FotoLocal>[...quatroFotos, ...quatroFotos]);
      await indicacao.abrirPerto(
        tester,
        rede: redeDaIndicacao(capturado: capturado),
        camera: camera,
      );
      await indicacao.abrirAPorta(tester);
      await indicacao.preencherOMinimo(tester);

      // O LOGOTIPO primeiro -- ele mora ACIMA da faixa.
      await _rolarNaIndicacao(
        tester,
        find.text(TelaSugerirProfissional.escolherDaGaleria),
      );
      await tester.tap(find.text(TelaSugerirProfissional.escolherDaGaleria));
      await tester.pumpAndSettle();

      await _escolherFotosDoLugar(tester, 4);
      await _enviarAIndicacao(tester);

      final corpo = capturado.indicacoes().single;
      expect(
        corpo['logo_upload_id'],
        uploadDeOrdem(1),
        reason: 'REPROVA: o logotipo saiu do corpo quando as fotos entraram. '
            'Os dois campos convivem: a logo e a marca, as fotos sao a faixa '
            'do topo da ficha.',
      );
      expect(
        (corpo['photo_upload_ids'] as List<dynamic>).length,
        4,
        reason: 'REPROVA: com logotipo escolhido, so '
            '${(corpo['photo_upload_ids'] as List<dynamic>).length} fotos '
            'couberam. **O logotipo NAO conta entre as quatro** -- obrigar a '
            'logo a ocupar uma das quatro faria quem tem logo poder mandar so '
            'tres fotos.',
      );
      expect(
        capturado
            .doCaminho('/media/directory-suggestion-logo-intents')
            .toList(),
        hasLength(1),
        reason: 'REPROVA: o logotipo nao foi pela rota DELE. As duas rotas '
            'existem porque sao duas geometrias (512 quadrado com minima 256; '
            'faixa 1280 x 720 com minima 600) e dois propositos.',
      );
    });

    testWidgets(
        'ISCA — o envio RECUSADO nao deixa previa nem entra no corpo',
        (tester) async {
      // ISCA: em `_escolheuAFotoDoLugar`, acrescentar a foto a `_fotosDoLugar`
      // antes do envio (ou nos ramos de falha). Compila, a previa fica na tela
      // -- e o corpo leva um `upload_id` de bytes que nao subiram, que e
      // `400 upload_not_usable` sem dizer por que.
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(
        tester,
        capturado: capturado,
        fotos: 1,
        respostaDoArmazenamento: () async => http.Response('', 403),
      );
      await _escolherFotosDoLugar(tester, 1);

      await _rolarNaIndicacao(
        tester,
        find.text(TelaSugerirProfissional.tituloDasFotos),
      );
      expect(
        find.byKey(FaixaDeImagens.chaveDoControle(FaixaDeImagens.remover, 0)),
        findsNothing,
        reason: 'REPROVA: a faixa ganhou uma linha de uma imagem que NAO '
            'subiu. Prometer e nao cumprir e pior que nao oferecer.',
      );
      await _rolarNaIndicacao(
        tester,
        find.text(TelaSugerirProfissional.fotoRecusada),
      );
      expect(
        find.text(TelaSugerirProfissional.fotoRecusada),
        findsOneWidget,
        reason: 'REPROVA: o envio recusado nao disse nada.',
      );

      await _enviarAIndicacao(tester);
      expect(
        capturado.indicacoes().single.containsKey('photo_upload_ids'),
        isFalse,
        reason: 'REPROVA: o corpo levou `photo_upload_ids` de um envio '
            'recusado.',
      );
    });

    testWidgets(
        'ISCA — enquanto os bytes sobem, a previa JA esta na tela e o botao '
        'de indicar fica apagado', (tester) async {
      // Duas iscas num caso: (1) tirar `subindo: _fotoDoLugarSubindo` da faixa
      // -- a pessoa escolhe a foto e a tela nao muda em nada ate o envio
      // terminar, e "apresentar como vai ficar" foi palavra do cliente; (2)
      // tirar `if (_enviandoFotoDoLugar)` do `_impedimento` -- a pessoa toca em
      // indicar com os bytes no ar e a indicacao nasce SEM a foto.
      final pendurado = Completer<http.Response>();
      final capturado = CapturadoDasImagens();
      await _abrirAIndicacao(
        tester,
        capturado: capturado,
        fotos: 1,
        // **`Completer` e nao `Future.delayed`**: um atraso de verdade deixa
        // um `Timer` pendente, e o teste de widget reprova por isso em vez de
        // pelo que ele mede -- a falha aponta para o lugar errado.
        respostaDoArmazenamento: () => pendurado.future,
      );
      await _escolherFotosDoLugar(tester, 1, assentar: false);

      await tester.ensureVisible(find.byType(PreviaDaFoto).last);
      await tester.pump();
      expect(
        find.text(FaixaDeImagens.subindoAgora),
        findsOneWidget,
        reason: 'REPROVA: a previa provisoria nao esta na tela enquanto os '
            'bytes sobem. A derivada do servidor nao existe neste momento, e '
            'sem ela a tela nao responde ao toque.',
      );
      expect(
        tester
            .widget<BotaoPrimario>(
              find.widgetWithText(
                BotaoPrimario,
                TelaSugerirProfissional.rotuloDeIndicar,
              ),
            )
            .aoTocar,
        isNull,
        reason: 'REPROVA: o `${TelaSugerirProfissional.rotuloDeIndicar}` esta '
            'tocavel com a foto no ar. Tocar ali agora manda a indicacao sem a '
            'foto, porque o `upload_id` ainda nao existe.',
      );
      expect(
        find.text(TelaSugerirProfissional.esperarAFoto),
        findsOneWidget,
        reason: 'REPROVA: o botao esta apagado e CALADO.',
      );

      // E o envio TERMINA: a linha provisoria vira a definitiva, com os tres
      // controles. Sem este trecho o caso media so a metade de cima.
      pendurado.complete(http.Response('', 204));
      await tester.pumpAndSettle();
      expect(
        find.text(FaixaDeImagens.subindoAgora),
        findsNothing,
        reason: 'REPROVA: a linha provisoria ficou na tela depois de o envio '
            'terminar. Ela nao tem controle de ordem nem de remocao: a pessoa '
            'ficaria com uma imagem que nao da para mover nem tirar.',
      );
      expect(
        find.byKey(FaixaDeImagens.chaveDoControle(FaixaDeImagens.remover, 0)),
        findsOneWidget,
        reason: 'REPROVA: a imagem enviada nao virou linha definitiva.',
      );
    });

    testWidgets(
        'ISCA — a faixa recorta na FAIXA do lugar, e nao no quadrado da logo',
        (tester) async {
      // **A isca mais barata de errar desta entrega:** a tela tem DUAS
      // geometrias, e passar `FormatoDoRecorte.logoDaIndicacao` aqui compila,
      // desenha, sobe a imagem e deixa `flutter analyze` calado -- e corta
      // exatamente o que a faixa do topo da ficha existe para mostrar.
      //
      // Este caso le a folha de recorte DE VERDADE, com arquivo em disco, e
      // pergunta qual `FormatoDoRecorte` ela recebeu.
      final arquivo = _faixaEmDisco();
      final capturado = CapturadoDasImagens();
      final camera = CameraComFila(<FotoLocal>[arquivo]);
      await indicacao.abrirPerto(
        tester,
        rede: redeDaIndicacao(capturado: capturado),
        camera: camera,
      );
      await indicacao.abrirAPorta(tester);
      await indicacao.preencherOMinimo(tester);
      await _rolarNaIndicacao(
        tester,
        find.text(TelaSugerirProfissional.escolherAFotoDoLugar),
      );

      // **O relogio do teste e falso e a decodificacao e E/S de verdade**: o
      // toque tem de NASCER fora da zona do relogio falso, senao a folha nunca
      // chega. Medido em 29/10/2026 neste repositorio.
      await tester.runAsync(() async {
        await tester
            .tap(find.text(TelaSugerirProfissional.escolherAFotoDoLugar));
        await Future<void>.delayed(const Duration(milliseconds: 400));
      });
      await tester.pumpAndSettle();

      final folha = tester.widget<FolhaDeRecorte>(find.byType(FolhaDeRecorte));
      expect(
        folha.formato.aspecto,
        FormatoDoRecorte.fotoDaIndicacao.aspecto,
        reason: 'REPROVA: a faixa das fotos do estabelecimento abriu o recorte '
            'com aspecto ${folha.formato.aspecto}, e o desta frente e '
            '${FormatoDoRecorte.fotoDaIndicacao.aspecto} '
            '(`DERIVADAS_DA_FOTO_DO_LOCAL`, variante `banner`: 1280 x 720). O '
            'quadrado da LOGO e ${FormatoDoRecorte.logoDaIndicacao.aspecto}, e '
            'enquadrar nele corta o que a faixa do topo da ficha existe para '
            'mostrar.',
      );
    });
  });

  // =======================================================================
  group('O ENCONTRO: as ate quatro imagens', () {
    testWidgets(
        'ISCA — duas imagens pedem DUAS autorizacoes na rota QUE JA EXISTE, e '
        'o corpo leva `image_upload_ids` NA ORDEM e NUNCA `cover_image`',
        (tester) async {
      // ISCA 1: tirar `imagens:` de `_marcar`. O `POST` sai, o evento nasce, e
      // as imagens nunca entram nele.
      // ISCA 2: devolver o ramo `cover_image` a `corpoDeCriacao` ao lado do
      // novo. Compila, parece compatibilidade -- e todo evento com imagem
      // passa a tomar `400 cover_and_images_both_sent`.
      final capturado = CapturadoDasImagens();
      final camera = CameraComFila(quatroFotos.take(2).toList());
      await encontro.abrirAgenda(
        tester,
        rede: redeDoEncontro(capturado: capturado),
        camera: camera,
      );
      await encontro.abrirAPorta(tester);
      await encontro.preencherOMinimo(tester);

      for (var i = 0; i < 2; i += 1) {
        await tester.drag(encontro.corpoDoFormulario, const Offset(0, 2000));
        await tester.pumpAndSettle();
        await tester.ensureVisible(
          find.text(TelaCriarEncontro.escolherDaGaleria),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(TelaCriarEncontro.escolherDaGaleria));
        await tester.pumpAndSettle();
      }

      expect(
        capturado.doCaminho('/media/network-event-cover-intents').toList(),
        hasLength(2),
        reason: 'REPROVA: a tela nao pediu DUAS autorizacoes em '
            '"/media/network-event-cover-intents". **A rota e a QUE JA '
            'EXISTE**: as quatro imagens tem o mesmo proposito '
            '(`network_event`), a mesma minima e a mesma derivada, e nada no '
            'envio distingue a segunda da primeira.',
      );

      // O botao mora na BARRA FIXA, que nao rola: `tap` direto.
      await tester.tap(find.text(TelaCriarEncontro.rotuloDeMarcar));
      await tester.pumpAndSettle();

      final corpo = capturado.criacoes().single;
      expect(
        corpo['image_upload_ids'],
        <String>[uploadDeOrdem(1), uploadDeOrdem(2)],
        reason: 'REPROVA: `image_upload_ids` nao e a lista das duas '
            'autorizacoes na ordem. A PRIMEIRA E A CAPA.',
      );
      expect(
        corpo.containsKey('cover_image'),
        isFalse,
        reason: 'REPROVA: o corpo levou `cover_image` junto de '
            '`image_upload_ids`. Os dois sao mutuamente exclusivos: '
            '`400 cover_and_images_both_sent`. Duas formas de dizer qual e a '
            'capa, no mesmo corpo, e o defeito -- e nao uma conveniencia.',
      );
    });

    testWidgets(
        'ISCA — com UMA imagem so, o corpo ainda manda a LISTA, e nao '
        '`cover_image`', (tester) async {
      // **O caso que o contrato nomeia por extenso:** *"o aplicativo novo manda
      // `image_upload_ids`, INCLUSIVE quando e uma imagem so"*. ISCA: fazer
      // `corpoDeCriacao` cair em `cover_image` quando a lista tem um item -- o
      // que pareceria "compatibilidade com o APK publicado" e e, na verdade,
      // duas telas mandando dois formatos pela mesma versao.
      final capturado = CapturadoDasImagens();
      final camera = CameraComFila(quatroFotos.take(1).toList());
      await encontro.abrirAgenda(
        tester,
        rede: redeDoEncontro(capturado: capturado),
        camera: camera,
      );
      await encontro.abrirAPorta(tester);
      await encontro.preencherOMinimo(tester);
      await tester.drag(encontro.corpoDoFormulario, const Offset(0, 2000));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(TelaCriarEncontro.escolherDaGaleria));
      await tester.pumpAndSettle();
      await tester.tap(find.text(TelaCriarEncontro.escolherDaGaleria));
      await tester.pumpAndSettle();

      await tester.tap(find.text(TelaCriarEncontro.rotuloDeMarcar));
      await tester.pumpAndSettle();

      final corpo = capturado.criacoes().single;
      expect(
        corpo['image_upload_ids'],
        <String>[uploadDeOrdem(1)],
        reason: 'REPROVA: com UMA imagem o corpo nao levou a lista de um item.',
      );
      expect(
        corpo.containsKey('cover_image'),
        isFalse,
        reason: 'REPROVA: com UMA imagem o corpo caiu em `cover_image`. O '
            'aplicativo novo nao manda esse campo em estado nenhum.',
      );
    });
  });

  // =======================================================================
  group('O ORCAMENTO DE DECODIFICACAO das quatro miniaturas', () {
    // **Isto e requisito, e nao detalhe.** Medido neste produto: vinte faixas
    // 16:9 custaram 65,6 MiB de imagem decodificada, e uma lista chegou a
    // 9,8 MB na primeira pintura. Quatro imagens na mesma tela decodificadas
    // no tamanho do ARQUIVO repetem exatamente esse defeito.

    /// A largura em que o widget manda DECODIFICAR, ou nulo quando ele nao
    /// manda nada.
    ///
    /// **`Image` nao expoe `cacheWidth`**, e isso nao e detalhe de API: o
    /// construtor DOBRA `cacheWidth`/`cacheHeight` dentro do provedor, como um
    /// `ResizeImage`. Ler o provedor e, por isso, a unica leitura honesta --
    /// `Image.cacheWidth` nem existe, e um medidor que olhasse para o widget
    /// nao teria o que medir.
    int? larguraPedida(Image imagem) {
      final provedor = imagem.image;
      return provedor is ResizeImage ? provedor.width : null;
    }

    /// O custo decodificado de um `Image`, em bytes: 4 bytes por pixel.
    ///
    /// Sem `ResizeImage`, o Flutter decodifica no tamanho do ARQUIVO -- e e por
    /// isso que o medidor precisa das dimensoes do arquivo: o custo "antes" nao
    /// e uma estimativa, e o que o widget sem `cacheWidth` faz.
    int custoDecodificado(
      Image imagem, {
      required int larguraDoArquivo,
      required int alturaDoArquivo,
    }) {
      final provedor = imagem.image;
      final pedidaL = provedor is ResizeImage ? provedor.width : null;
      final pedidaA = provedor is ResizeImage ? provedor.height : null;
      if (pedidaL == null && pedidaA == null) {
        return larguraDoArquivo * alturaDoArquivo * 4;
      }
      // Com so uma das duas, a outra segue o aspecto do arquivo.
      final largura = pedidaL ??
          (larguraDoArquivo * pedidaA! / alturaDoArquivo).round();
      final altura = pedidaA ??
          (alturaDoArquivo * pedidaL! / larguraDoArquivo).round();
      return largura * altura * 4;
    }

    test(
        'CONTROLE POSITIVO DO MEDIDOR: sem `cacheWidth` ele devolve o custo '
        'do ARQUIVO INTEIRO', () {
      // **O caso que impede este grupo de virar decorativo.** Um medidor que
      // devolvesse um numero pequeno para os dois casos aprovaria uma tela sem
      // `cacheWidth` nenhum -- que e a forma de portao cego que este
      // repositorio ja pagou dez vezes.
      final cru = Image.file(File('/tmp/x.jpg'));
      expect(
        custoDecodificado(cru, larguraDoArquivo: 1600, alturaDoArquivo: 900),
        1600 * 900 * 4,
        reason: 'REPROVA: o medidor nao enxerga o custo de um `Image` SEM '
            '`cacheWidth`. Se ele nao acusa o caso ruim, o numero do caso '
            'abaixo nao prova nada.',
      );
      final limitado = Image.file(File('/tmp/x.jpg'), cacheWidth: 336);
      expect(
        custoDecodificado(
          limitado,
          larguraDoArquivo: 1600,
          alturaDoArquivo: 900,
        ),
        336 * 189 * 4,
        reason: 'REPROVA: o medidor nao aplica `cacheWidth`.',
      );
    });

    testWidgets(
        'ISCA — as QUATRO miniaturas decodificam no tamanho do BLOCO, e nao '
        'no do arquivo', (tester) async {
      // ISCA, e ela foi CONFERIDA e corrigida: trocar o
      // `width: FaixaDeImagens.larguraDaMiniatura` da miniatura por
      // `double.infinity` -- quatro faixas de largura inteira. Compila, a tela
      // fica *mais bonita*, o `flutter analyze` fica calado, e o custo pula de
      // ~1 MiB para a casa dos 8 MiB.
      //
      // **O QUE NAO SERVE DE ISCA, e por que isso importa:** trocar
      // `comInvolucroProprio: false` por `true` passa VERDE aqui -- conferido
      // nesta arvore. O involucro de `PreviaDaFoto` fixa a ALTURA desenhada
      // (300 dp por omissao), mas o `cacheWidth` continua vindo do
      // `LayoutBuilder` sobre a largura real, que o `SizedBox` de 112 dp
      // limita. Quem define o custo decodificado aqui e a LARGURA do bloco, e
      // nao o involucro: anotar a isca errada seria prometer uma medicao que
      // este caso nao faz.
      //
      // **A FAIXA E MONTADA DIRETO, e nao pela tela inteira**, e a razao e de
      // medicao: no `ListView` do formulario a quarta linha nao esta
      // CONSTRUIDA numa bancada de 800 x 600 (medido: a arvore tinha tres
      // miniaturas), e um orcamento somado sobre tres linhas aprovaria tres
      // quartos do custo real. Aqui a bancada e um celular de 360 x 800, que e
      // a largura que a `orientacaoDeTamanhoDaImagem` do produto assume.
      const larguraDoArquivo = 1600;
      const alturaDoArquivo = 900;
      final arquivos = <FotoLocal>[
        for (var i = 0; i < 4; i += 1)
          _faixaEmDisco(
            nome: 'faixa$i',
            largura: larguraDoArquivo,
            altura: alturaDoArquivo,
          ),
      ];

      tester.view
        ..devicePixelRatio = 3
        ..physicalSize = const Size(360 * 3, 800 * 3);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              child: FaixaDeImagens(
                imagens: arquivos,
                enviando: false,
                permissao: EstadoDaPermissao.concedida,
                textos: const TextosDaFaixaDeImagens(
                  titulo: TelaSugerirProfissional.tituloDasFotos,
                  ajuda: TelaSugerirProfissional.ajudaDasFotos,
                  tirarAFoto: TelaSugerirProfissional.tirarAFotoDoLugar,
                  escolherDaGaleria:
                      TelaSugerirProfissional.escolherAFotoDoLugar,
                  cameraNosAjustes: TelaSugerirProfissional.cameraNosAjustes,
                  abrirAjustes: TelaSugerirProfissional.abrirAjustes,
                ),
                aoTirar: () {},
                aoEscolher: () {},
                aoAbrirAjustes: () {},
                aoMover: (_, _) {},
                aoRemover: (_) {},
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      final miniaturas = find.descendant(
        of: find.byType(FaixaDeImagens),
        matching: find.byType(Image),
      );
      // A CONTAGEM VAI JUNTO DO VEREDITO: zero miniaturas somam zero bytes, e
      // um `lessThan` sobre zero aprova uma faixa sem imagem nenhuma.
      expect(
        miniaturas,
        findsNWidgets(4),
        reason: 'REPROVA: a faixa nao tem QUATRO miniaturas na arvore (achou '
            '${miniaturas.evaluate().length}). Sem elas o orcamento abaixo '
            'soma zero e aprova medindo nada.',
      );

      var depois = 0;
      for (final elemento in miniaturas.evaluate()) {
        final imagem = elemento.widget as Image;
        expect(
          larguraPedida(imagem),
          isNotNull,
          reason: 'REPROVA: uma miniatura da faixa NAO manda decodificar em '
              'tamanho nenhum. Sem `ResizeImage` o Flutter decodifica no '
              'tamanho do arquivo: quatro faixas 16:9 de '
              '${larguraDoArquivo}x$alturaDoArquivo custam '
              '${(4 * larguraDoArquivo * alturaDoArquivo * 4 / 1024 / 1024).toStringAsFixed(1)} '
              'MiB de memoria viva na primeira pintura.',
        );
        depois += custoDecodificado(
          imagem,
          larguraDoArquivo: larguraDoArquivo,
          alturaDoArquivo: alturaDoArquivo,
        );
      }
      const antes = 4 * larguraDoArquivo * alturaDoArquivo * 4;
      // O numero MEDIDO vai para a saida da execucao: e ele que o relatorio da
      // entrega cita, e nao uma estimativa.
      // ignore: avoid_print
      print(
        'BICHU orcamento: 4 miniaturas da faixa, celular de 360 dp — '
        'ANTES (sem cacheWidth, decodificando o arquivo de '
        '${larguraDoArquivo}x$alturaDoArquivo) '
        '${(antes / 1024 / 1024).toStringAsFixed(2)} MiB; DEPOIS '
        '${(depois / 1024).toStringAsFixed(1)} KiB '
        '(${(depois / 1024 / 1024).toStringAsFixed(3)} MiB); '
        'largura pedida ao decodificador = '
        '${larguraPedida(miniaturas.evaluate().first.widget as Image)} px',
      );
      expect(
        depois,
        lessThan(antes ~/ 10),
        reason: 'REPROVA: as quatro miniaturas decodificam '
            '${(depois / 1024 / 1024).toStringAsFixed(2)} MiB, e sem '
            '`cacheWidth` seriam ${(antes / 1024 / 1024).toStringAsFixed(2)} '
            'MiB. O teto deste portao e um DECIMO do custo cru: abaixo disso '
            'a miniatura esta sendo decodificada pelo tamanho do bloco, e '
            'acima ela voltou a ser decodificada pelo tamanho do arquivo.',
      );
    });
  });
}

/// Uma FAIXA 16:9 de verdade em disco, apagada no fim do caso.
///
/// **Tem de ser ARQUIVO**: desde 29/10/2026 o ajuste le o CAMINHO com
/// `ImmutableBuffer.fromFilePath`, e nao passa por `bytesDaFoto`.
///
/// `Directory.systemTemp` segue o `TMPDIR` da execucao, que nesta maquina e
/// DURAVEL e proprio desta execucao -- `/private/tmp` e apagado pela limpeza do
/// macOS no meio da suite, e a reprovacao aparece como `PathNotFoundException`
/// no `loading`, que parece defeito do diff.
FotoLocal _faixaEmDisco({
  String nome = 'faixa',
  int largura = 1600,
  int altura = 900,
}) {
  final pasta = Directory.systemTemp.createTempSync('bichu-faixa');
  addTearDown(() {
    if (pasta.existsSync()) pasta.deleteSync(recursive: true);
  });
  final imagem = img.Image(width: largura, height: altura);
  for (var y = 0; y < altura; y++) {
    for (var x = 0; x < largura; x++) {
      imagem.setPixelRgb(x, y, x % 255, y % 255, 128);
    }
  }
  final bytes = img.encodePng(imagem);
  final arquivo = File('${pasta.path}/$nome.png')..writeAsBytesSync(bytes);
  return FotoLocal(
    caminho: arquivo.path,
    tipoDeConteudo: 'image/png',
    tamanhoEmBytes: bytes.length,
  );
}
