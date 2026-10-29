// O LOGOTIPO NA INDICACAO (pedido do cliente, 29/10/2026).
//
// Verbatim: *"nao tem o campo do logotipo para o usuario subir e indicar o
// estabelecimento"*.
//
// =========================================================================
// O QUE ESTE ARQUIVO MEDE, E POR QUE CADA CASO EXISTE
// =========================================================================
//
// **Nao e um campo, e uma operacao de intencao de envio.** O backend nunca
// recebe os bytes (ADR-0007): a tela pede a autorizacao a
// `POST /v1/media/directory-suggestion-logo-intents`, sobe os bytes DIRETO para
// o armazenamento assinado, e `POST /v1/directory/suggestions` confirma o
// `upload_id` na mesma transacao do `INSERT`. Tres passos, e cada um pode
// falhar sozinho:
//
//  1. **a rota PEDIDA e a da indicacao, e nao a do painel.** A rede deste
//     arquivo responde `404` a tudo que nao declara, e a rota administrativa
//     (`/admin/media/catalog-image-intents`) NAO esta declarada: uma troca de
//     funcao de assinatura identica -- que e um defeito ja medido neste produto
//     -- leva 404 em vez de passar calada;
//  2. **os bytes sobem POR FORA da `ApiClient`**, para outro host. O token da
//     sessao nao pode viajar para um endereco que veio do corpo de uma
//     resposta;
//  3. **o `upload_id` chega ao corpo do `POST`**. Widget que sobe a imagem e
//     nao a confirma e pior que a ausencia do campo: o objeto sobe, o varredor
//     o recolhe em dez minutos, e a pessoa viu uma previa.
//
// =========================================================================
// AS ISCAS, E COMO CADA UMA FOI PROVADA
// =========================================================================
//
// Conferidas reprovando nesta arvore, uma por vez, desfazendo depois:
//
// | o que eu desliguei | casos que reprovaram |
// |---|---|
// | `logoUploadId: _uploadDoLogotipo` fora de `_indicar` | 1 |
// | o caminho da rota trocado pelo do PAINEL (`/admin/media/catalog-image-intents`) | 4 |
// | `if (_enviandoOLogotipo)` fora de `_impedimento` | 1 |
// | `recusaDeTipoDaFoto` com `tiposDeFotoAceitos` (com HEIC) | 1 |
//
// **A segunda isca derruba QUATRO casos, e nao um**, e isso e o desenho da rede
// funcionando: com a rota errada, a rede responde `404` e o envio nao acontece
// -- entao caem de uma vez o passo 1, o passo 2, o passo 3 e a previa. Uma isca
// que derrubasse so o caso da rota deixaria os outros tres passando sobre um
// envio que nunca ocorreu.
//
// =========================================================================
// O QUE ESTE ARQUIVO NAO MEDE
// =========================================================================
//
// - **O proposito gravado no envio.** Ele e do SERVIDOR, e a tela nao o manda:
//   `DirectorySuggestionLogoIntentInput` nao tem campo `purpose`, e e a ROTA que
//   o fixa. Quem mede que `directory_suggestion_logo` nao entra em
//   `professionals` e
//   `src/modules/professionals/application/logotipo-da-indicacao-nao-vaza.test.ts`.
// - **A recusa de dimensao (422).** E do servidor, antes de assinar.

import 'dart:async';
import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'sugerir_profissional_test.dart'
    show abrirAPorta, abrirPerto, diretorioVazio, preencherOMinimo;

/// O host do armazenamento assinado.
///
/// **Outro host de proposito**: e o que prova que os bytes nao saem pela
/// `ApiClient` -- ela anexaria o token da sessao a um endereco que veio do corpo
/// de uma resposta.
const String armazenamentoDoLogotipo = 'https://armazenamento.exemplo/logo';

/// O `upload_id` que a intencao do logotipo devolve.
const String uploadDoLogotipo = '018f7c1e-9999-7c3d-9e4f-0000000000la';

/// O caminho da rota de intencao DESTA frente.
const String caminhoDaIntencao = '/media/directory-suggestion-logo-intents';

/// O que a rede recebeu, guardado.
class CapturadoDoLogotipo {
  final List<http.Request> pedidos = <http.Request>[];

  Iterable<http.Request> doCaminho(String fim) =>
      pedidos.where((p) => p.url.path.endsWith(fim));

  Iterable<http.Request> aoArmazenamento() => pedidos
      .where((p) => p.url.toString().startsWith(armazenamentoDoLogotipo));

  /// Os corpos dos `POST /v1/directory/suggestions`, ja decodificados.
  List<Map<String, dynamic>> indicacoes() => pedidos
      .where((p) =>
          p.url.path == '/v1/directory/suggestions' && p.method == 'POST')
      .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
      .toList();
}

/// A rede do diretorio, da intencao do logotipo, do armazenamento e da
/// indicacao.
///
/// **404 em qualquer outra rota**, e nao 200 vazio: uma chamada nao declarada
/// aqui precisa falhar alto em vez de passar por acidente. E e isso que faz a
/// isca da rota trocada valer -- a rota do PAINEL
/// (`/admin/media/catalog-image-intents`) NAO esta aqui.
Future<http.Response> Function(http.Request) redeDoLogotipo({
  required CapturadoDoLogotipo capturado,
  Future<http.Response> Function()? respostaDoArmazenamento,
  int statusDaIntencao = 201,
}) {
  return (req) async {
    capturado.pedidos.add(req);
    if (req.url.toString().startsWith(armazenamentoDoLogotipo)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path.endsWith(caminhoDaIntencao)) {
      if (statusDaIntencao != 201) {
        return problema('validation-failed', statusDaIntencao);
      }
      return json200(
        <String, dynamic>{
          'upload_id': uploadDoLogotipo,
          'method': 'POST',
          'url': armazenamentoDoLogotipo,
          'fields': <String, String>{'key': 'directory/original/abc'},
          'max_bytes': 5 * 1024 * 1024,
        },
        status: 201,
      );
    }
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'POST') {
      return json200(
        <String, dynamic>{
          'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
          'state': 'pending',
          'created_at': '2026-10-29T12:00:00Z',
        },
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

Finder get _corpoDoFormulario => find
    .descendant(
      of: find.byType(TelaSugerirProfissional),
      matching: find.byType(Scrollable),
    )
    .first;

/// Leva o corpo do formulario ao TOPO.
///
/// **A faixa de erro mora no TOPO da lista**, acima dos campos, e o corpo e um
/// `ListView`: depois de rolar ate o bloco do logotipo ela nao esta mais na
/// arvore. Os casos que afirmam a FRASE do erro precisam voltar.
Future<void> _rolarAoTopo(WidgetTester tester) async {
  await tester.drag(_corpoDoFormulario, const Offset(0, 2000));
  await tester.pumpAndSettle();
}

/// Rola o corpo do formulario ate o BLOCO DO LOGOTIPO.
///
/// **`rolarAteDeCimaOuDeBaixo` e nao um `drag` para o topo seguido de
/// `ensureVisible`**, e a diferenca foi medida nesta rodada: o bloco do logotipo
/// fica ABAIXO dos dois seletores, o corpo e um `ListView` que so constroi o que
/// cabe, e `ensureVisible` sobre um widget que nao esta na arvore estoura
/// `Bad state: No element`. O ajudante volta ao topo e procura DESCENDO, que e o
/// que a pessoa faz.
Future<void> _rolarAteOLogotipo(WidgetTester tester) async {
  await rolarAteDeCimaOuDeBaixo(
    tester,
    find.text(TelaSugerirProfissional.tituloDoLogotipo),
    scrollable: _corpoDoFormulario,
  );
}

/// Escolhe o logotipo pela galeria, voltando ao topo primeiro.
///
/// `assentar: false` para os casos que medem a tela COM O ENVIO NO AR:
/// `pumpAndSettle` esperaria o envio terminar, e e justamente a janela em que
/// ele nao terminou que `logotipoSubindo` vigia.
Future<void> _escolherOLogotipo(
  WidgetTester tester, {
  bool assentar = true,
}) async {
  await _rolarAteOLogotipo(tester);
  await tester.ensureVisible(
    find.text(TelaSugerirProfissional.escolherDaGaleria),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(TelaSugerirProfissional.escolherDaGaleria));
  if (assentar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// A camera que devolve a foto de teste, com permissao concedida.
CameraDeTeste _cameraComFoto() => CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );

void main() {
  group('os TRES passos do envio', () {
    testWidgets('pede a intencao NA ROTA DA INDICACAO, sobe os bytes POR FORA '
        'da ApiClient e manda o `upload_id` no corpo', (tester) async {
      final capturado = CapturadoDoLogotipo();
      final camera = _cameraComFoto();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: capturado),
        camera: camera,
      );
      await abrirAPorta(tester);
      // **O formulario e preenchido ANTES da imagem, e a ordem e tecnica:**
      // `preencherOMinimo` comeca rolando ate `Nome do lugar`, que fica ACIMA
      // do bloco do logotipo, e `rolarAte` so procura para baixo. Chamar na
      // ordem inversa estourava `Bad state: No element`.
      await preencherOMinimo(tester);
      await _escolherOLogotipo(tester);

      // ----- PASSO 1: a intencao, e e a rota DESTA frente -----
      final intencoes = capturado.doCaminho(caminhoDaIntencao).toList();
      expect(
        intencoes,
        hasLength(1),
        reason: 'REPROVA: a tela nao pediu a autorizacao de envio em '
            '"$caminhoDaIntencao". Se ela pediu em outro lugar, a rede deste '
            'arquivo respondeu 404 -- e a rota do PAINEL '
            '(/admin/media/catalog-image-intents) nao esta declarada aqui de '
            'proposito: um envio assinado por ela nasce com '
            '`purpose: directory_logo`, que a escrita de `professionals` '
            'ACEITA. Era uma troca de funcao de assinatura identica que gravou '
            '`network_event` numa foto de pessoa em 18/10/2026.',
      );
      final corpoDaIntencao =
          jsonDecode(intencoes.single.body) as Map<String, dynamic>;
      expect(corpoDaIntencao['content_type'], 'image/jpeg');
      expect(corpoDaIntencao['byte_size'], fotoEscolhidaDeTeste.tamanhoEmBytes);
      // **Sem `purpose` no corpo**, e a ausencia e do contrato: a ROTA fixa o
      // proposito. Um `purpose` aqui seria o cliente escolhendo para onde a
      // imagem vai, que e o que `DirectorySuggestionLogoIntentInput` recusa com
      // `additionalProperties: false`.
      expect(
        corpoDaIntencao.containsKey('purpose'),
        isFalse,
        reason: 'REPROVA: a tela mandou `purpose` no corpo da intencao. O '
            'esquema e `additionalProperties: false` e a rota e que fixa o '
            'proposito -- deixar o cliente escolhe-lo seria deixa-lo pedir uma '
            'autorizacao de logo do PAINEL por uma rota do aplicativo.',
      );

      // ----- PASSO 2: os bytes, para o OUTRO host -----
      final aoArmazenamento = capturado.aoArmazenamento().toList();
      expect(
        aoArmazenamento,
        hasLength(1),
        reason: 'REPROVA: os bytes do logotipo nao foram para o armazenamento '
            'assinado. Sem este passo o `upload_id` aponta para um objeto que '
            'nao existe, e o `POST` da indicacao volta '
            '`400 upload_not_usable` sem dizer por que.',
      );
      expect(
        aoArmazenamento.single.body,
        contains(utf8.decode(bytesDeFotoDeTeste)),
        reason: 'REPROVA: a requisicao ao armazenamento nao leva os bytes da '
            'imagem.',
      );
      expect(
        camera.vezesQueLeuOsBytes,
        1,
        reason: 'REPROVA: os bytes do arquivo foram lidos '
            '${camera.vezesQueLeuOsBytes} vez(es), e esperava 1.',
      );

      // ----- PASSO 3: o `upload_id` no corpo da indicacao -----
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      final indicacoes = capturado.indicacoes();
      expect(indicacoes, hasLength(1), reason: 'REPROVA: nada foi indicado.');
      expect(
        indicacoes.single['logo_upload_id'],
        uploadDoLogotipo,
        reason: 'REPROVA: o `upload_id` do logotipo nao chegou ao corpo da '
            'indicacao. Os bytes subiram e NADA os confirma: o varredor '
            'recolhe o objeto em dez minutos, e a pessoa viu uma previa de uma '
            'imagem que nao vai existir. **E este o defeito que o campo '
            'ausente nao tinha** -- prometer e nao cumprir e pior que nao '
            'oferecer.',
      );
    });

    testWidgets('sem logotipo escolhido, `logo_upload_id` NAO vai no corpo',
        (tester) async {
      // O caminho do APK publicado e o caso comum. **A chave tem de SAIR do
      // corpo, e nao ir nula**: `format: uuid` nao aceita nulo, e um
      // `logo_upload_id: null` tomaria `400` numa indicacao que nao tem
      // logotipo nenhum.
      final capturado = CapturadoDoLogotipo();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: capturado),
        camera: _cameraComFoto(),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      final corpo = capturado.indicacoes().single;
      expect(
        corpo.containsKey('logo_upload_id'),
        isFalse,
        reason: 'REPROVA: o corpo carrega `logo_upload_id` sem ninguem ter '
            'escolhido imagem. A chave precisa SAIR do corpo: `format: uuid` '
            'nao aceita nulo nem string vazia.',
      );
      expect(
        capturado.doCaminho(caminhoDaIntencao),
        isEmpty,
        reason: 'REPROVA: a tela pediu autorizacao de envio sem ninguem ter '
            'escolhido imagem.',
      );
    });
  });

  group('a tela nao afirma o que nao aconteceu', () {
    testWidgets('a previa aparece DEPOIS de escolher, e nao antes',
        (tester) async {
      final capturado = CapturadoDoLogotipo();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: capturado),
        camera: _cameraComFoto(),
      );
      await abrirAPorta(tester);
      await _rolarAteOLogotipo(tester);

      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason: 'REPROVA: a tela desenhou previa de logotipo sem imagem '
            'escolhida.',
      );

      await _escolherOLogotipo(tester);
      expect(
        find.byType(PreviaDaFoto),
        findsOneWidget,
        reason: 'REPROVA: a imagem escolhida nao apareceu. A previa vem do '
            'ARQUIVO LOCAL -- a derivada do servidor so existe depois de o '
            'worker rodar, e a indicacao ainda nem foi gravada.',
      );
    });

    testWidgets('o envio SEM SINAL tira a previa e diz o motivo',
        (tester) async {
      // **A previa SAI quando o envio falha**, e isso nao e perder o trabalho
      // da pessoa: o `POST` nao teria o que confirmar, e manter a imagem na
      // tela depois de um envio que nao aconteceu e a tela prometendo um
      // logotipo que nao existe.
      final capturado = CapturadoDoLogotipo();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(
          capturado: capturado,
          respostaDoArmazenamento: () async =>
              throw http.ClientException('sem rede'),
        ),
        camera: _cameraComFoto(),
      );
      await abrirAPorta(tester);
      await _escolherOLogotipo(tester);

      expect(find.byType(PreviaDaFoto), findsNothing);
      await _rolarAoTopo(tester);
      expect(
        find.textContaining('não subiu'),
        findsOneWidget,
        reason: 'REPROVA: o envio falhou e a tela nao disse nada.',
      );

      // E o corpo sai SEM a chave: um `upload_id` de bytes que nao subiram
      // volta `400 upload_not_usable`. (A tela ja esta no topo, entao
      // `preencherOMinimo` acha o primeiro campo.)
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );
      expect(
        capturado.indicacoes().single.containsKey('logo_upload_id'),
        isFalse,
        reason: 'REPROVA: o corpo levou um `upload_id` cujos bytes nao '
            'subiram.',
      );
    });

    testWidgets('o 400 na INTENCAO tira a previa e nao deixa `upload_id` '
        'orfao', (tester) async {
      final capturado = CapturadoDoLogotipo();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: capturado, statusDaIntencao: 400),
        camera: _cameraComFoto(),
      );
      await abrirAPorta(tester);
      await _escolherOLogotipo(tester);

      expect(find.byType(PreviaDaFoto), findsNothing);
      expect(
        capturado.aoArmazenamento(),
        isEmpty,
        reason: 'REPROVA: a tela subiu bytes sem ter autorizacao assinada.',
      );
    });
  });

  group('o botao espera a imagem terminar de subir', () {
    testWidgets('com o envio NO AR, o motivo do bloqueio esta na tela',
        (tester) async {
      // Enviar nesta janela mandaria o `upload_id` que ainda nao existe e
      // gravaria a indicacao SEM o logotipo que a pessoa acabou de escolher,
      // em silencio. E a mesma guarda que `capaSubindo` faz em criar encontro.
      final capturado = CapturadoDoLogotipo();
      final completar = Completer<http.Response>();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(
          capturado: capturado,
          respostaDoArmazenamento: () => completar.future,
        ),
        camera: _cameraComFoto(),
      );
      await abrirAPorta(tester);
      // Preenchido ANTES da imagem, pelo motivo tecnico do primeiro caso.
      await preencherOMinimo(tester);
      // `assentar: false`: o envio esta no ar e nao vai assentar.
      await _escolherOLogotipo(tester, assentar: false);

      expect(
        find.text(TelaSugerirProfissional.esperarOLogotipo),
        findsOneWidget,
        reason: 'REPROVA: com o logotipo subindo, a tela nao diz para esperar. '
            'Sem isto o toque em `Enviar indicação` grava a indicacao sem a '
            'imagem, sem avisar.',
      );

      // Solta o envio e confere que o bloqueio SAI -- bloqueio que nao sai e
      // tela travada.
      completar.complete(http.Response('', 204));
      await tester.pumpAndSettle();
      expect(
        find.text(TelaSugerirProfissional.esperarOLogotipo),
        findsNothing,
        reason: 'REPROVA: o bloqueio ficou de pe depois de o envio terminar.',
      );
    });
  });

  group('a camera', () {
    testWidgets('sem camera no aparelho, `Tirar foto` SOME e a galeria fica',
        (tester) async {
      // O oposto da faixa de ajustes e deliberado: lá ha o que liberar e o
      // botao ensina isso; aqui nao ha, e um botao que nao leva a nada e pior
      // que a ausencia dele.
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: CapturadoDoLogotipo()),
        camera: CameraDeTeste(EstadoDaPermissao.indisponivel),
      );
      await abrirAPorta(tester);
      await _rolarAteOLogotipo(tester);

      expect(find.text(TelaSugerirProfissional.tirarAFoto), findsNothing);
      expect(
        find.text(TelaSugerirProfissional.escolherDaGaleria),
        findsOneWidget,
        reason: 'REPROVA: a galeria sumiu junto com a camera. Ela nao tem '
            'estado de permissao proprio, e quem nao tem camera ainda tem '
            'arquivo.',
      );
    });

    testWidgets('bloqueada nos ajustes, a tela oferece a SAIDA que resolve',
        (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.negadaPermanentemente);
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: CapturadoDoLogotipo()),
        camera: camera,
      );
      await abrirAPorta(tester);
      await _rolarAteOLogotipo(tester);

      await tocar(tester, find.text(TelaSugerirProfissional.abrirAjustes));
      expect(
        camera.abriuAjustes,
        isTrue,
        reason: 'REPROVA: a faixa diz para abrir os ajustes e o toque nao abre '
            'nada.',
      );
    });
  });

  group('o tipo recusado e dito ANTES do envio', () {
    testWidgets('HEIC nao sobe, e a tela explica', (tester) async {
      // O `enum` de `DirectorySuggestionLogoIntentInput` e
      // `[image/jpeg, image/png, image/webp]` -- SEM HEIC, porque a esteira de
      // catalogo nao o decodifica. Dizer aqui poupa a pessoa de um `400` que
      // ela nao tem como interpretar, e poupa o envio de bytes que o worker
      // recusaria depois de subirem.
      final capturado = CapturadoDoLogotipo();
      await abrirPerto(
        tester,
        rede: redeDoLogotipo(capturado: capturado),
        camera: CameraDeTeste(
          EstadoDaPermissao.concedida,
          foto: const FotoLocal(
            caminho: '/tmp/logo.heic',
            tipoDeConteudo: 'image/heic',
            tamanhoEmBytes: 27,
          ),
        ),
      );
      await abrirAPorta(tester);
      await _escolherOLogotipo(tester);

      expect(
        capturado.doCaminho(caminhoDaIntencao),
        isEmpty,
        reason: 'REPROVA: a tela pediu autorizacao para um tipo que a rota '
            'recusa. O `400` chegaria em `content_type`, que nao e um campo '
            'que a pessoa possa consertar.',
      );
      await _rolarAoTopo(tester);
      expect(
        find.textContaining('não é aceito aqui'),
        findsOneWidget,
        reason: 'REPROVA: o tipo foi recusado em silencio.',
      );
      await _rolarAteOLogotipo(tester);
      expect(find.byType(PreviaDaFoto), findsNothing);
    });
  });
}
