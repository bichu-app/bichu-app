// F1.6 — a IMAGEM do QR na tela, e onde ela para depois de buscada.
//
// O QUE ESTAVA DE PE ATE AQUI, e por que nenhum caso acusava.
//
// A BICHUS-63 implementou `getPetTagQrImage` e a emissao passou a devolver
// `qr_png_url`. Mesmo assim o QR nao ia aparecer: a tela usava
// `Image.network(qr, ...)`, e **`Image.network` nao manda `Authorization`** --
// ele abre um `HttpClient` proprio, por fora da camada de API. A rota e
// `bearerAuth` e esta marcada `reveals_credential` no contrato. O 401 caia no
// `errorBuilder`, que colapsava para `SizedBox.shrink()`, e a tela ficava
// identica a tela sem QR nenhum. Nao havia regressao visual porque nao havia
// nada visual: **a tela mentia por omissao**, e o teste manual concordava com
// ela.
//
// Tres classes de isca aqui, e todas foram vistas REPROVANDO com o mecanismo
// desligado (o cabecalho de cada grupo diz qual linha desligar):
//
//   1. o cabecalho sai, e sai so para a origem certa;
//   2. a falha aparece na tela, e e distinguivel de "esta tag nao tem imagem";
//   3. a imagem nao sobrevive ao logout -- que e a classe de defeito do
//      `cacheDeMeusPets` limpo no `onPressed` do botao.
//
// A TERCEIRA E A QUE DECIDE ESTE ARQUIVO. O QR carrega o codigo da tag dentro
// dos pixels, o ADR-0004 diz que codigo de tag e irreversivel, e o cache de
// imagem do Flutter e **global e nao tem nocao de sessao**. Descartar a tela
// tira a referencia viva e DEIXA a entrada no cache, para a proxima pessoa que
// abrir o app neste aparelho.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/imagem_do_qr.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
// Os dois recortes de aparelho vem do arquivo que os mediu, e nao de uma copia
// local: `59/34` e `24/48` sao numeros de plataforma, e uma segunda copia
// deles divergiria em silencio.
import 'area_segura_do_aparelho_test.dart' show Aparelho, aparelho;

/// Um PNG 1x1 valido. Nao e o QR de verdade -- o QR de verdade e assunto do
/// servidor, e a BICHUS-63 ja prova que ele decodifica de volta para a URL
/// certa por um leitor independente. Aqui o que esta sob teste e o CAMINHO dos
/// bytes: quem os pediu, com qual cabecalho, e onde eles param.
final Uint8List pngDeUmPixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAE'
  'hQGAhKmMIQAAAABJRU5ErkJggg==',
);

const String codigo = 'BCH-7K2M-91QD';
const String petId = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
const String tagId = '11111111-2222-3333-4444-555555555555';

/// O endereco que o servidor monta, na MESMA origem de `API_BASE_URL`.
const String enderecoDoQr = '$urlBaseDeTeste/v1/pets/$petId/tags/$tagId/qr.png';

Pet nina() => Pet(
      id: petId,
      nome: 'Nina',
      especie: Especie.cao,
      redacoesDeCuidados: const <RedacaoDeCuidados>[],
    );

/// `PetTagIssued` como o contrato o declara, agora com `qr_png_url`.
http.Response tagEmitida({String? qrPngUrl = enderecoDoQr}) {
  return json200(
    <String, dynamic>{
      'id': tagId,
      'status': 'active',
      'code_suffix': '1QD',
      'created_at': '2026-09-17T18:20:00Z',
      'code': codigo,
      'url': 'https://bichu.app/t/$codigo',
      'qr_png_url': ?qrPngUrl,
    },
    status: 201,
  );
}

http.Response png() {
  return http.Response.bytes(
    pngDeUmPixel,
    200,
    headers: <String, String>{'content-type': 'image/png'},
  );
}

bool ehEmissao(http.Request r) =>
    r.method == 'POST' && r.url.path.endsWith('/tags');

bool ehImagem(http.Request r) => r.url.path.endsWith('qr.png');

/// Monta a F1.6 **logada**, que e a condicao da rota: sem sessao nao ha token,
/// e um caso que exercitasse o cabecalho sem sessao provaria o contrario do
/// que quer provar.
Future<List<http.Request>> abrirF16(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  CofreDaImagemDoQr? cofre,
  double? escala,
}) async {
  final vistas = <http.Request>[];
  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    cofreDoQr: cofre,
    escala: escala,
    rede: (r) async {
      vistas.add(r);
      return rede(r);
    },
  );
  await irPara(
    tester,
    Rotas.petCadastrado,
    extra: ResultadoDoCadastro(pet: nina()),
  );
  return vistas;
}

Future<http.Response> redeFeliz(http.Request r) async {
  if (ehImagem(r)) return png();
  if (ehEmissao(r)) return tagEmitida();
  // O logout revoga a familia de refresh no servidor. Sem esta linha o caso do
  // logout reprovaria pelo motivo errado -- por um 404 na revogacao, e nao pelo
  // que ele foi escrito para medir.
  if (r.url.path.endsWith('/auth/logout')) return http.Response('', 204);
  return http.Response('', 404);
}

/// A imagem do QR, e nao "a primeira imagem da tela": um dia outra imagem
/// entra nesta tela, e um `find.byType(Image).first` passaria a medir a errada
/// em silencio.
final Finder finderDoQr = find.byWidgetPredicate(
  (w) => w is Image && w.image is MemoryImage,
  description: 'a imagem do QR (Image com MemoryImage)',
);

/// O provedor que o `Image` da tela esta desenhando agora.
MemoryImage? provedorNaTela(WidgetTester tester) {
  final imagens = tester.widgetList<Image>(find.byType(Image));
  for (final img in imagens) {
    final p = img.image;
    if (p is MemoryImage) return p;
  }
  return null;
}

void main() {
  // ------------------------------------------------------------------------
  // ISCA 1 — o `Authorization` sai, e sai so para a origem certa.
  //
  // DESLIGAR PARA VER REPROVAR: em `ApiClient.baixarImagem`, comente o bloco
  //   if (token != null && token.isNotEmpty) { cabecalhos['Authorization'] ... }
  // Os dois primeiros casos reprovam. Trocar o `Image` de volta por
  // `Image.network` reprova os tres, porque a requisicao nem passa pelo
  // `MockClient` da camada de API.
  // ------------------------------------------------------------------------
  group('ISCA 1 — a imagem e buscada com o cabecalho que a rota exige', () {
    testWidgets('a requisicao da imagem leva `Authorization: Bearer`',
        (tester) async {
      final vistas = await abrirF16(tester, rede: redeFeliz);

      final pedidos = vistas.where(ehImagem).toList(growable: false);
      expect(
        pedidos,
        isNotEmpty,
        reason: 'REPROVA: nenhuma requisicao de imagem passou pela camada de '
            'API. `Image.network` abre um `HttpClient` proprio e NAO passa por '
            'aqui -- se a tela voltou a usa-lo, este caso fica cego e o QR nao '
            'aparece no aparelho.',
      );
      expect(
        pedidos.single.headers['Authorization'],
        'Bearer token-de-teste',
        reason: 'REPROVA: a imagem do QR foi pedida SEM o token da sessao. A '
            'rota e `bearerAuth` e esta marcada `reveals_credential` no '
            'contrato: sem cabecalho ela responde 401 e a tela nao mostra QR '
            'nenhum. Foi exatamente isso que o cliente viu no aparelho.',
      );
    });

    testWidgets('o QR aparece na tela, com o codigo como alternativa textual',
        (tester) async {
      await abrirF16(tester, rede: redeFeliz);

      expect(
        provedorNaTela(tester),
        isNotNull,
        reason: 'REPROVA: nao ha imagem desenhada. O criterio da historia e '
            'que o QR APARECA depois de emitir a tag.',
      );

      final handle = tester.ensureSemantics();
      expect(
        find.bySemanticsLabel(codigo),
        findsAtLeastNWidgets(1),
        reason: 'REPROVA: a alternativa textual do QR sumiu. Ninguem le um QR '
            'com leitor de tela; a alternativa e o CODIGO, e nao "QR code do '
            'pet".',
      );
      handle.dispose();
    });

    testWidgets(
        'endereco de OUTRA origem e recusado, e o token nao chega a sair',
        (tester) async {
      // O endereco vem dentro de um corpo de resposta. Este caso e o que
      // impede que um `qr_png_url` apontando para fora leve o `Bearer` da
      // sessao junto -- por configuracao errada, proxy no meio ou resposta
      // adulterada.
      const String forasteiro =
          'https://cdn-de-outro-lugar.example.com/v1/pets/$petId/tags/$tagId/qr.png';

      final vistas = await abrirF16(
        tester,
        rede: (r) async {
          if (ehEmissao(r)) return tagEmitida(qrPngUrl: forasteiro);
          return png();
        },
      );

      expect(
        vistas.where((r) => r.url.host.contains('example.com')),
        isEmpty,
        reason: 'REPROVA: a requisicao SAIU para um host que nao e o da API, '
            'com o `Authorization` da sessao dentro. A conferencia de origem '
            'em `baixarImagem` existe para acontecer ANTES de o token viajar; '
            'depois nao ha como chamar de volta.',
      );
      expect(
        find.text(TextosDoCadastro.qrNaoCarregou),
        findsOne,
        reason: 'REPROVA: a recusa virou silencio. A pessoa precisa saber que '
            'a imagem nao veio -- recusar e ficar calado e o mesmo defeito por '
            'outro caminho.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // ISCA 2 — a falha NAO volta a colapsar em silencio.
  //
  // DESLIGAR PARA VER REPROVAR: em `_ImagemDoQr`, troque o ramo
  //   case _EstadoDoQr.falhou: return FaixaDeAviso(...)
  // por
  //   case _EstadoDoQr.falhou: return const SizedBox.shrink();
  // que e exatamente o que o `errorBuilder` fazia. Tres casos reprovam.
  // ------------------------------------------------------------------------
  group('ISCA 2 — quando a imagem falha, a tela DIZ', () {
    testWidgets('401 na imagem: a tela mostra o aviso e o `Tentar de novo`',
        (tester) async {
      await abrirF16(
        tester,
        rede: (r) async {
          if (ehImagem(r)) return problema('unauthenticated', 401);
          if (ehEmissao(r)) return tagEmitida();
          return http.Response('', 404);
        },
      );

      expect(
        find.text(TextosDoCadastro.qrNaoCarregou),
        findsOne,
        reason: 'REPROVA: a falha da imagem colapsou para nada, como o '
            '`errorBuilder` fazia. A pessoa fica sem distinguir "esta tag nao '
            'tem imagem" de "eu nao consegui buscar".',
      );
      expect(
        find.text(MensagensDeErro.tentarDeNovo),
        findsOne,
        reason: 'REPROVA: o unico estado em que existe algo a fazer ficou sem '
            'o movimento que o resolve.',
      );
      expect(
        provedorNaTela(tester),
        isNull,
        reason: 'REPROVA: ha imagem desenhada depois de um 401. QR de enfeite '
            'vira plaquinha impressa que nao resolve.',
      );
      expect(
        find.text(codigo),
        findsOne,
        reason: 'REPROVA: o codigo por extenso sumiu junto com a imagem. Ele e '
            'o caminho que SEMPRE funciona, e nenhum estado da imagem pode '
            'escondê-lo.',
      );
    });

    testWidgets('`Tentar de novo` refaz a requisicao, e o QR aparece',
        (tester) async {
      var tentativas = 0;
      await abrirF16(
        tester,
        rede: (r) async {
          if (ehImagem(r)) {
            tentativas += 1;
            return tentativas == 1 ? problema('server-error', 500) : png();
          }
          if (ehEmissao(r)) return tagEmitida();
          return http.Response('', 404);
        },
      );

      expect(provedorNaTela(tester), isNull);
      await tocar(tester, find.text(MensagensDeErro.tentarDeNovo));

      expect(
        tentativas,
        2,
        reason: 'REPROVA: `Tentar de novo` nao refez a busca da imagem. Um '
            'botao que nao faz nada e pior que botao nenhum.',
      );
      expect(
        provedorNaTela(tester),
        isNotNull,
        reason: 'REPROVA: a segunda tentativa deu certo e a tela nao mostrou o '
            'QR.',
      );
      expect(find.text(TextosDoCadastro.qrNaoCarregou), findsNothing);
    });

    testWidgets(
        '"nao tem imagem" e "nao consegui buscar" sao DOIS textos diferentes',
        (tester) async {
      // O coracao da isca: ate aqui os dois estados desenhavam a mesma coisa
      // (nada). O caso exige que o estado sem endereco diga a SUA verdade, e
      // que ele nao seja confundivel com a falha.
      await abrirF16(
        tester,
        rede: (r) async {
          if (ehEmissao(r)) return tagEmitida(qrPngUrl: null);
          return http.Response('', 404);
        },
      );

      expect(
        find.text(TextosDoCadastro.qrSemImagem),
        findsOne,
        reason: 'REPROVA: a emissao nao trouxe `qr_png_url` e a tela ficou '
            'muda. Nada falhou, e mesmo assim a pessoa precisa saber por que '
            'nao ha QR.',
      );
      expect(
        find.text(TextosDoCadastro.qrNaoCarregou),
        findsNothing,
        reason: 'REPROVA: a tela acusou falha onde nao houve falha. Isso e '
            'mentir na outra direcao.',
      );
      expect(
        TextosDoCadastro.qrSemImagem,
        isNot(TextosDoCadastro.qrNaoCarregou),
        reason: 'REPROVA: os dois estados voltaram a dizer a MESMA coisa. Se '
            'o texto e o mesmo, o colapso voltou -- so que em palavras.',
      );
      // E o caminho que sempre funciona continua la.
      expect(find.text(codigo), findsOne);
    });
  });

  // ------------------------------------------------------------------------
  // ISCA 3 — onde a imagem PARA, medido e nao suposto.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire `_cofreDoQr.limpar` da
  // lista `limpezasAoSair`. O caso do logout reprova. Trocar a limpeza por uma
  // chamada no `dispose` da tela tambem reprova, porque a sessao derrubada por
  // refresh recusado nao passa por tela nenhuma.
  // ------------------------------------------------------------------------
  group('ISCA 3 — a imagem nao sobrevive ao logout', () {
    testWidgets('MEDICAO: a imagem entra no cache GLOBAL de imagem do Flutter',
        (tester) async {
      await abrirF16(tester, rede: redeFeliz);

      final provedor = provedorNaTela(tester)!;
      expect(
        PaintingBinding.instance.imageCache.containsKey(provedor),
        isTrue,
        reason: 'Esta e a MEDICAO que justifica o resto do grupo, e nao uma '
            'exigencia de produto: todo `ImageProvider` resolvido por um '
            'widget `Image` entra no cache global do Flutter, que nao tem '
            'nocao de sessao. Se um dia isto falhar, a premissa mudou e a '
            'limpeza do logout precisa ser reavaliada -- nao apagada.',
      );
    });

    testWidgets('depois de `sair()`, o QR nao esta mais em lugar nenhum',
        (tester) async {
      final cofre = CofreDaImagemDoQr();
      await abrirF16(tester, rede: redeFeliz, cofre: cofre);

      final provedor = provedorNaTela(tester)!;
      expect(PaintingBinding.instance.imageCache.containsKey(provedor), isTrue);

      // Pelo controlador, e nao por um botao: os QUATRO desfechos de `sair()`
      // passam por aqui, inclusive o que nao tem botao nenhum -- a sessao
      // derrubada por refresh recusado. Foi assim que o `cacheDeMeusPets`
      // sobreviveu quando a limpeza morava no `onPressed`.
      final escopo = Escopo.of(tester.element(find.byType(Scaffold).first));
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        PaintingBinding.instance.imageCache.containsKey(provedor),
        isFalse,
        reason: 'REPROVA: a imagem do tutor anterior continua no cache GLOBAL '
            'de imagem depois do logout. Descartar a tela tira a referencia '
            'viva e DEIXA a entrada no cache: quem abrir o app em seguida '
            'neste aparelho herda a credencial de quem saiu. E a mesma forma '
            'do defeito do `cacheDeMeusPets` limpo no `onPressed` do botao.',
      );

      expect(
        cofre.provedor,
        isNull,
        reason: 'REPROVA: o cofre continua segurando a imagem do QR depois do '
            'logout. Ela carrega o codigo da tag dentro dos pixels, e o '
            'ADR-0004 diz que codigo de tag e irreversivel.',
      );
    });

    testWidgets('MEDICAO: a imagem nao encosta no disco do app',
        (tester) async {
      // A medicao de verdade, e nao a suposicao: o `path_provider` e apontado
      // para um diretorio vazio e o fluxo inteiro roda. Se alguem trocar este
      // caminho por `cached_network_image` / `flutter_cache_manager` para
      // "resolver o cabecalho", esses pacotes gravam o PNG em
      // `getApplicationCacheDirectory()` -- e o arquivo SOBREVIVE ao logout,
      // que e o unico desfecho que este repositorio ja aprendeu a cobrar.
      // `createTempSync`, e nao `createTemp`: dentro de `testWidgets` o tempo e
      // falso, e um `Future` de I/O REAL nunca completa ali. O caso ficaria
      // pendurado ate o teto do `pumpAndSettle` -- que foi exatamente o que
      // aconteceu na primeira escrita deste arquivo.
      final pasta = Directory.systemTemp.createTempSync('bichu-qr-disco');
      addTearDown(() => pasta.deleteSync(recursive: true));

      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (_) async => pasta.path,
      );
      addTearDown(() {
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          null,
        );
      });

      await abrirF16(tester, rede: redeFeliz);
      expect(provedorNaTela(tester), isNotNull);

      final comOPng = pasta
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => _contem(f.readAsBytesSync(), pngDeUmPixel))
          .map((f) => f.path)
          .toList(growable: false);

      expect(
        comOPng,
        isEmpty,
        reason: 'REPROVA: os bytes do QR foram parar no disco do app '
            '($comOPng). Nada neste caminho deveria escrever em disco: '
            '`package:http` sobre o `HttpClient` do `dart:io` nao guarda '
            'resposta, e `MemoryImage` nunca grava. Um arquivo aqui significa '
            'que entrou um cache de imagem em disco no meio -- e o disco nao e '
            'limpo por `limpezasAoSair`.',
      );
    });

    test('nenhum pacote de cache de imagem em DISCO entrou no pubspec', () {
      // O portao que fecha a porta dos fundos. O caso acima mede o fluxo que
      // existe hoje; este cobra a decisao no dia em que alguem for resolver o
      // cabecalho pelo caminho mais curto.
      const List<String> proibidos = <String>[
        'cached_network_image',
        'flutter_cache_manager',
        'extended_image',
        'dio_cache_interceptor',
        'http_cache_stream',
      ];
      final pubspec = File('pubspec.yaml');
      expect(
        pubspec.existsSync(),
        isTrue,
        reason: 'REPROVA: nao achei o `pubspec.yaml`. Portao sem o que '
            'conferir precisa reprovar, nao ficar verde por vazio.',
      );
      final texto = pubspec.readAsStringSync();
      for (final pacote in proibidos) {
        expect(
          RegExp('^\\s*$pacote\\s*:', multiLine: true).hasMatch(texto),
          isFalse,
          reason: 'REPROVA: `$pacote` entrou no pubspec. Ele grava a imagem em '
              'disco, e a imagem do QR e credencial: o arquivo sobreviveria ao '
              'logout, que e a classe de defeito que `limpezasAoSair` existe '
              'para fechar. Se este pacote e mesmo necessario, a limpeza do '
              'cache DELE entra na lista junto, e este portao muda com a issue '
              'citada.',
        );
      }
    });
  });

  // ------------------------------------------------------------------------
  // GEOMETRIA — o quadrado do QR contra o texto, nos dois aparelhos.
  //
  // Duas medidas que a suite so passou a ter em 22/09: interseccao de
  // retangulo (`intersect` / `overlaps` tinham ZERO ocorrencias, e foi por
  // isso que um `x` sobrepos um titulo sem ninguem ver) e recorte de sistema
  // (todo `MediaQueryData` de teste passava so `textScaler`).
  //
  // Imagem quadrada de lado fixo numa tela de texto que cresce com a escala do
  // sistema e exatamente onde isso volta a acontecer.
  //
  // DESLIGAR PARA VER REPROVAR: em `_BlocoDoCodigo`, troque o
  //   const SizedBox(height: BichuEspaco.e4)
  // que separa a imagem do codigo por um `Stack` -- ou, mais simples, mude o
  // `Column` do bloco para `Stack`. Os quatro casos reprovam com os dois
  // retangulos na mensagem.
  // ------------------------------------------------------------------------
  group('o QR nao atropela o codigo, com recorte de sistema e escala', () {
    for (final a in <Aparelho>[Aparelho.iphone, Aparelho.android]) {
      for (final escala in <double>[1.0, 2.0]) {
        testWidgets('${a.nome}, escala ${escala}x', (tester) async {
          aparelho(tester, a);
          await abrirF16(tester, rede: redeFeliz, escala: escala);

          // A 2x o bloco inteiro cai abaixo da dobra e o `ListView` nem o
          // constroi. Rolar primeiro e o que a pessoa faz -- e sem isto o caso
          // reprovaria por "nao achei", que e o motivo errado.
          await rolarAte(tester, find.text(TextosDoCadastro.copiarOCodigo));

          final doQr = tester.getRect(finderDoQr);
          final doCodigo = tester.getRect(find.text(codigo));
          final doBotao = tester.getRect(
            find.text(TextosDoCadastro.copiarOCodigo),
          );

          expect(
            doQr.overlaps(doCodigo),
            isFalse,
            reason: 'REPROVA em ${a.nome} a ${escala}x: o quadrado do QR '
                'sobrepoe o codigo por extenso.\n'
                '  QR:     $doQr\n'
                '  codigo: $doCodigo\n'
                'O codigo e o caminho que sempre funciona, e uma imagem por '
                'cima dele e pior que imagem nenhuma.',
          );
          expect(
            doQr.overlaps(doBotao),
            isFalse,
            reason: 'REPROVA em ${a.nome} a ${escala}x: o QR sobrepoe '
                '`${TextosDoCadastro.copiarOCodigo}`.\n'
                '  QR:    $doQr\n'
                '  botao: $doBotao\n'
                'Este e o unico caminho do app para copiar o codigo, e ele '
                'aparece nesta tela uma vez e nunca mais.',
          );

          // O quadrado tem LADO FIXO numa tela cujo texto cresce com o ajuste
          // do sistema. O modo de falha dele nao e sobrepor: e transbordar a
          // largura util e ser cortado pela borda, que nao aparece como erro
          // em `find` nenhum.
          final larguraDaTela =
              tester.view.physicalSize.width / tester.view.devicePixelRatio;
          expect(
            doQr.left >= 0 && doQr.right <= larguraDaTela,
            isTrue,
            reason: 'REPROVA em ${a.nome} a ${escala}x: o quadrado do QR sai '
                'da tela ($doQr numa tela de $larguraDaTela dp de largura). '
                'Um QR cortado pela borda e um QR que o leitor nao decodifica.',
          );
        });
      }
    }
  });
}

/// `agulha` aparece em algum lugar de `palheiro`.
bool _contem(List<int> palheiro, List<int> agulha) {
  if (agulha.isEmpty || palheiro.length < agulha.length) return false;
  for (var i = 0; i <= palheiro.length - agulha.length; i++) {
    var bate = true;
    for (var j = 0; j < agulha.length; j++) {
      if (palheiro[i + j] != agulha[j]) {
        bate = false;
        break;
      }
    }
    if (bate) return true;
  }
  return false;
}
