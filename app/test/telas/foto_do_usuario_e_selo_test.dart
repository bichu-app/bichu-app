// `Perfil` > `Meus dados`: a foto da propria pessoa, e o selo de validado.
//
// Pedido do cliente em 18/10/2026, literal: *"coloque um campo para o usuario
// cadastrar sua propria foto e um selo na foto dele, se ele estiver
// validado"*.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual linha mexer e o que observar.
//
// ---------------------------------------------------------------------------
// POR QUE O CASO DO SELO TEM CONTRAPESO, E POR QUE ELE E OBRIGATORIO
// ---------------------------------------------------------------------------
// O selo e `Me.email_verified`. Um caso que so afirmasse "com a conta
// validada o selo aparece" ficaria **verde com o selo desenhado SEMPRE** --
// um `if (true)` passaria, e um selo constante e exatamente o defeito que o
// cliente notaria depois (ele pediu o selo *"se ele estiver validado"*).
//
// Entao o par e: a MESMA foto, a MESMA tela, em duas contas que diferem em UM
// campo. Com `email_verified: true` o selo esta la; com `false` ele nao esta.
// Nenhum valor fixo passa nos dois.
//
// ---------------------------------------------------------------------------
// NADA AQUI FOI VISTO EM APARELHO
// ---------------------------------------------------------------------------
// Nenhum caso deste arquivo afirma que a foto ficou bonita. Eles afirmam qual
// URL foi pedida, com que largura de decodificacao, que o selo acompanha o
// campo, e que as tres ausencias nao derrubam a tela. O `flutter_test`
// responde 400 a toda requisicao de imagem, entao toda `Image.network` desta
// arvore cai no `errorBuilder` durante o teste -- o que torna o caso (d)
// barato e honesto.

import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'imagem_do_profissional_test.dart'
    show cacheWidthDe, imagensDeRedeEm, urlDoOriginal, urlPedidaPor;

/// A derivada `card` (512 x 512) da foto do proprio usuario, na forma que o
/// servidor monta.
const String fotoDerivada =
    'https://midia.bichu.app/people/card/9f8e7d6c5b4a3210.jpeg';

/// O armazenamento e **outro host**, como em producao: os bytes nao vao para
/// a API, e o cliente que os leva nao conhece o token da sessao.
const String armazenamento = 'https://objetos.exemplo.test/bichu-privado';

const String uploadId = 'up-foto-do-usuario-1';

/// Um corpo de `#/components/schemas/Me`.
///
/// `photo` e `oneOf: [MyPhoto, null]`: ausente, nulo e objeto sao os tres
/// estados que a tela trata, e [statusDaFoto] com [urlDaFoto] nula e o
/// `processing` do contrato.
Map<String, dynamic> me({
  bool validado = true,
  String? urlDaFoto,
  String? statusDaFoto,
  bool semCampoDeFoto = false,
  bool comCampoDeOriginal = false,
}) {
  return <String, dynamic>{
    'id': 'u-1',
    'email': 'marina@exemplo.com.br',
    'email_verified': validado,
    'display_name': 'Marina',
    'phone_e164': null,
    'phone_verified': false,
    'pending_profile_fields': <String>[],
    'can_open_lost_case': true,
    if (!semCampoDeFoto)
      'photo': (urlDaFoto == null && statusDaFoto == null)
          ? null
          : <String, dynamic>{
              'status': statusDaFoto ?? 'ready',
              'url': urlDaFoto,
              'rejection_reason': null,
              // Um campo que o contrato NAO declara, para medir que o app nao
              // o le. Sem ele na massa, um app que lesse a chave errada
              // passaria por nao haver chave errada para ler.
              if (comCampoDeOriginal) 'original_url': urlDoOriginal,
            },
  };
}

/// O que saiu do aparelho. **A coisa que os casos de envio medem.**
class Capturado {
  final List<http.Request> pedidos = <http.Request>[];

  Iterable<http.Request> doCaminho(String fim) =>
      pedidos.where((p) => p.url.path.endsWith(fim));

  Iterable<http.Request> aoArmazenamento() =>
      pedidos.where((p) => p.url.toString().startsWith(armazenamento));
}

/// Um servidor que GUARDA o que recebeu: `/me`, a intencao de envio e o
/// armazenamento. **404 no resto**, para um caso que dependa de rota nao
/// declarada falhar alto em vez de passar por acidente.
Future<http.Response> Function(http.Request) servidor({
  required Map<String, dynamic> meInicial,
  Map<String, dynamic>? meDepoisDoPatch,
  Capturado? capturado,
  Future<http.Response> Function()? respostaDoArmazenamento,
  int statusDaIntencao = 201,
}) {
  return (req) async {
    capturado?.pedidos.add(req);
    if (req.url.toString().startsWith(armazenamento)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path.endsWith('/media/my-photo-intents')) {
      if (statusDaIntencao != 201) {
        return problema('validation-failed', statusDaIntencao);
      }
      return json200(
        <String, dynamic>{
          'upload_id': uploadId,
          'method': 'POST',
          'url': armazenamento,
          'fields': <String, String>{'key': 'people/original/abc'},
          'max_bytes': 5 * 1024 * 1024,
        },
        status: 201,
      );
    }
    if (req.url.path == '/v1/me' && req.method == 'GET') {
      return json200(meInicial);
    }
    if (req.url.path == '/v1/me' && req.method == 'PATCH') {
      return json200(meDepoisDoPatch ?? meInicial);
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
    }
    return problema('not-found', 404);
  };
}

/// Abre `Meus dados` pelo roteador de verdade.
Future<void> abrirOsDados(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  CameraEGaleria? camera,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(),
    camera: camera ?? const CameraNaoEmbarcada(),
  );
  await irPara(tester, Rotas.dadosPessoais);
  expect(
    find.byType(TelaDadosPessoais),
    findsOneWidget,
    reason: 'REPROVA: `${Rotas.dadosPessoais}` nao abriu a tela. Sem ela na '
        'arvore, todo caso deste arquivo passaria por nao ter o que medir.',
  );
}

/// O selo esta na tela?
///
/// Lido pelo ROTULO do leitor de tela, e nao pelo icone: o icone e desenho e
/// pode mudar; o rotulo e o que diz a informacao a quem nao ve a tela, e e ele
/// que carrega a validacao.
bool temSelo(WidgetTester tester) =>
    find.bySemanticsLabel('Conta validada').evaluate().isNotEmpty;

void main() {
  // -------------------------------------------------------------------------
  group('o selo de validado', () {
    // -----------------------------------------------------------------------
    testWidgets(
        'ISCA — com a conta validada o selo esta sobre a foto; sem validacao, '
        'a MESMA foto nao tem selo', (tester) async {
      // (1) VALIDADA.
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(validado: true, urlDaFoto: fotoDerivada),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        temSelo(tester),
        isTrue,
        reason: 'REPROVA: a conta tem `email_verified: true` e a foto esta na '
            'tela, e o selo nao apareceu. O cliente pediu o selo na foto '
            '"se ele estiver validado", e a fonte e `Me.email_verified` -- '
            'nao a imagem, nao um campo novo, nao uma escolha do app.',
      );

      // (2) O CONTRAPESO: a MESMA foto, numa conta que difere em UM campo.
      //
      // Sem este segundo bloco um `_SeloDeValidado()` desenhado sempre
      // passaria no primeiro, e um selo constante e mentira no dia em que a
      // pessoa trocar de e-mail.
      //
      // **A arvore e DESMONTADA entre os dois blocos**, e isso nao e
      // cerimonia: um `pumpWidget` novo por cima do anterior deixa a
      // semantica do primeiro app alcancavel por `find.bySemanticsLabel`, e o
      // bloco (2) lia o selo do bloco (1). Medido: o mesmo bloco (2) sozinho
      // num arquivo passa.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(validado: false, urlDaFoto: fotoDerivada),
        ),
      );
      await tester.pumpAndSettle();

      // A foto continua la -- o que mudou foi so a validacao.
      expect(
        find.byType(ImagemDaRede),
        findsOneWidget,
        reason: 'REPROVA: a conta NAO validada perdeu a foto. Validacao e '
            'selo; ela nao esconde a foto de ninguem.',
      );
      expect(
        temSelo(tester),
        isFalse,
        reason: 'REPROVA: o selo apareceu numa conta com '
            '`email_verified: false`. ISCA: trocar `if (validado && '
            'temImagem)` por `if (temImagem)` em `_BlocoDaFoto` '
            '(`app/lib/telas/perfil/tela_dados_pessoais.dart`) compila, enche '
            'a tela de selo e passaria no bloco (1) deste mesmo caso.',
      );
    });

    testWidgets('sem foto nao ha selo, mesmo com a conta validada',
        (tester) async {
      // O selo e o selo DA foto: um escudo flutuando sobre um quadrado vazio
      // nao se apoia em nada. Decisao declarada aqui para nao ser "consertada"
      // por engano.
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(validado: true)),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ImagemDaRede), findsNothing);
      expect(
        temSelo(tester),
        isFalse,
        reason: 'REPROVA: o selo foi desenhado sem foto embaixo dele.',
      );
      // E a tela continua inteira: o formulario esta todo la.
      expect(find.text('Salvar'), findsWidgets);
    });
  });

  // -------------------------------------------------------------------------
  group('a foto que ja esta na conta', () {
    // -----------------------------------------------------------------------
    testWidgets('ISCA — pinta a DERIVADA, e o original nao e alcancado',
        (tester) async {
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(urlDaFoto: fotoDerivada, comCampoDeOriginal: true),
        ),
      );
      await tester.pumpAndSettle();

      final imagens = imagensDeRedeEm(find.byType(TelaDadosPessoais));
      expect(
        imagens,
        hasLength(1),
        reason: 'REPROVA: a tela nao desenhou exatamente uma imagem de rede.',
      );

      final pintada = urlPedidaPor(imagens.single);
      expect(
        pintada,
        fotoDerivada,
        reason: 'REPROVA: a URL pintada nao e a derivada que `Me.photo.url` '
            'trouxe. O app NAO monta URL de imagem.',
      );
      expect(
        pintada,
        isNot(contains('original')),
        reason: 'REPROVA: a tela pediu uma chave de ORIGINAL. O original da '
            'foto de pessoa mora no prefixo privado `people/` e nunca e '
            'servido a cliente nenhum -- nem ao dono.',
      );
    });

    testWidgets('o `cacheWidth` segue o quadrado PINTADO', (tester) async {
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(urlDaFoto: fotoDerivada)),
      );
      await tester.pumpAndSettle();

      final imagem = imagensDeRedeEm(find.byType(TelaDadosPessoais)).single;
      final caixa = tester.getSize(find.byType(ImagemDaRede));
      final fator = tester.view.devicePixelRatio;

      expect(
        cacheWidthDe(imagem),
        (caixa.width * fator).round(),
        reason: 'REPROVA: o `cacheWidth` do retrato nao e a largura pintada em '
            'pixeis (${caixa.width} dp a ${fator}x). A derivada `card` e 512 x '
            '512: sem este numero, a imagem decodificada custa 512 x 512 x 4 = '
            '1,0 MiB em QUALQUER aparelho, inclusive num 1x que pinta 160 px.',
      );

      // E o retrato e QUADRADO: a derivada e 1:1, e desenhar em outra
      // proporcao recortaria o que o servidor cortou.
      expect(
        caixa.width,
        closeTo(caixa.height, 0.5),
        reason: 'REPROVA: o retrato nao e quadrado (${caixa.width} x '
            '${caixa.height}).',
      );
    });

    testWidgets('`processing` e `rejected` ficam no lugar da foto, sem erro',
        (tester) async {
      // Os dois tem `url` nula, e nenhum deles desenha erro nem derruba nada.
      // **Mas eles nao sao o MESMO estado**, e o par abaixo e o contrapeso:
      // `processing` mostra o indicador de progresso, porque ali HAVERA foto;
      // `rejected` nao mostra, porque ali nao vem nada sem uma foto nova. Um
      // indicador desenhado sempre -- ou nunca -- passaria num dos dois e
      // reprovaria no outro.
      for (final caso in <(String, bool)>[
        ('processing', true),
        ('rejected', false),
      ]) {
        final (status, temIndicador) = caso;
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        await abrirOsDados(
          tester,
          rede: servidor(meInicial: me(statusDaFoto: status)),
        );
        await tester.pumpAndSettle();

        expect(
          find.byType(ImagemDaRede),
          findsNothing,
          reason: 'REPROVA: com `status: $status` e `url` nula a tela tentou '
              'desenhar imagem. `Image.network(null)` nao compila e '
              '`Image.network("")` LANCA -- o estado e "sem imagem ainda", e '
              'ele e normal.',
        );
        expect(
          find.byType(TelaDadosPessoais),
          findsOneWidget,
          reason: 'REPROVA: a tela caiu com `status: $status`.',
        );
        expect(
          find.bySemanticsLabel('Processando a foto').evaluate().isNotEmpty,
          temIndicador,
          reason: 'REPROVA: com `status: $status` o simbolo de processamento no '
              'lugar da foto ${temIndicador ? "nao apareceu" : "apareceu"}. '
              '`processing` quer dizer que a derivada esta sendo gerada agora '
              'e a foto chega em instantes; `rejected` quer dizer que o '
              'worker recusou os bytes e nada vem sem uma foto nova. Girar um '
              'circulo no segundo caso seria esperar por algo que nao vem.',
        );
      }
    });

    testWidgets('o campo `photo` AUSENTE e tratado como sem foto',
        (tester) async {
      // O APK publicado le respostas que nao conhecem `photo`. Ausente e nulo
      // sao a mesma coisa para a tela.
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(semCampoDeFoto: true)),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ImagemDaRede), findsNothing);
      expect(find.byType(TelaDadosPessoais), findsOneWidget);
    });

    testWidgets(
        'ISCA — imagem que falha cai no `errorBuilder`, e a tela continua '
        'de pe', (tester) async {
      // No `flutter_test` TODA requisicao de imagem responde 400: a falha
      // deste caso e o comportamento padrao do ambiente, e nao um duble.
      //
      // ISCA: tirar o `errorBuilder` de `ImagemDaRede`
      // (`app/lib/widgets/imagem_da_rede.dart`) faz a excecao de carga subir
      // para o `FlutterError`, e o caso reprova com a excecao na saida.
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(validado: true, urlDaFoto: fotoDerivada),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a falha de carga da foto subiu como excecao. Esta e '
            'a tela de dados pessoais: perde-la por causa de um retrato que '
            'nao baixou e perder o nome, o telefone e o endereco de '
            'referencia junto.',
      );

      // A TELA CONTINUA DE PE, com o formulario inteiro...
      expect(find.byType(TelaDadosPessoais), findsOneWidget);
      expect(find.text('Salvar'), findsWidgets);
      // ...o lugar da foto desenha o simbolo de falha em vez de um buraco...
      expect(
        find.byIcon(Icons.person_outline),
        findsWidgets,
        reason: 'REPROVA: o estado de falha do retrato nao desenhou simbolo '
            'nenhum. Buraco sem explicacao e pior que simbolo.',
      );
      // ...e o selo segue sobre o lugar da foto: ele nao depende de os bytes
      // da imagem terem chegado, e sim de `Me.email_verified`.
      expect(temSelo(tester), isTrue);
    });
  });

  // -------------------------------------------------------------------------
  group('o envio da propria foto', () {
    // -----------------------------------------------------------------------
    testWidgets('escolher mostra a PREVIA e nao sobe nada ainda',
        (tester) async {
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      final capturado = Capturado();
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(), capturado: capturado),
        camera: camera,
      );

      await tester.tap(find.text('Escolher da galeria'));
      await tester.pumpAndSettle();

      expect(
        find.byType(PreviaDaFoto),
        findsOneWidget,
        reason: 'REPROVA: escolher a foto nao desenhou a previa. Era este o '
            'defeito que `PreviaDaFoto` nasceu para consertar em outra tela: '
            'ela escrevia o CAMINHO do arquivo no lugar da imagem.',
      );

      // **Nada subiu.** Escolher e enviar sao dois momentos: subir no toque
      // do seletor tiraria da pessoa a chance de ver o arquivo que pegou.
      expect(
        camera.vezesQueLeuOsBytes,
        0,
        reason: 'REPROVA: a tela leu os bytes do arquivo sem ninguem pedir o '
            'envio. Este contador e o unico que separa "a tela mostrou a '
            'previa" de "a tela subiu a foto".',
      );
      expect(capturado.doCaminho('/media/my-photo-intents'), isEmpty);
      expect(capturado.aoArmazenamento(), isEmpty);
    });

    testWidgets(
        'ISCA — os tres passos saem, e o PATCH leva o `upload_id` que a '
        'intencao devolveu', (tester) async {
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      final capturado = Capturado();
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(),
          meDepoisDoPatch: me(urlDaFoto: fotoDerivada),
          capturado: capturado,
        ),
        camera: camera,
      );

      await tester.tap(find.text('Escolher da galeria'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar a foto'));
      await tester.pumpAndSettle();

      // (1) A INTENCAO, uma vez, com o tipo e o tamanho do arquivo.
      final intencoes =
          capturado.doCaminho('/media/my-photo-intents').toList();
      expect(
        intencoes,
        hasLength(1),
        reason: 'REPROVA: a intencao de envio nao saiu exatamente uma vez.',
      );
      final corpoDaIntencao =
          jsonDecode(intencoes.single.body) as Map<String, dynamic>;
      expect(corpoDaIntencao['content_type'], 'image/jpeg');
      expect(corpoDaIntencao['byte_size'], fotoEscolhidaDeTeste.tamanhoEmBytes);
      expect(
        corpoDaIntencao.containsKey('purpose'),
        isFalse,
        reason: 'REPROVA: o corpo levou `purpose`. `MyPhotoIntentInput` tem '
            '`additionalProperties: false` e NAO declara o campo: esta '
            'operacao existe para um proposito so, e deixar o cliente '
            'escolhe-lo seria deixa-lo pedir autorizacao de imagem de produto '
            'por uma rota de perfil.',
      );

      // (2) OS BYTES, ao outro host, uma vez.
      expect(
        capturado.aoArmazenamento(),
        hasLength(1),
        reason: 'REPROVA: os bytes nao foram ao armazenamento exatamente uma '
            'vez. O backend NAO recebe os bytes (ADR-0007).',
      );
      expect(camera.vezesQueLeuOsBytes, 1);

      // (3) O PATCH que amarra a foto a conta, com o `upload_id` DA INTENCAO.
      //
      // ISCA: sem o terceiro passo os bytes ficam no armazenamento e a conta
      // fica sem foto -- a intencao vence em dez minutos e o varredor a
      // recolhe. Nenhuma verificacao de tela enxerga isso: a previa continua
      // desenhada.
      final patches = capturado.pedidos
          .where((p) => p.url.path == '/v1/me' && p.method == 'PATCH')
          .toList();
      expect(
        patches,
        hasLength(1),
        reason: 'REPROVA: o `PATCH /v1/me` que grava a foto nao saiu (ou saiu '
            'duas vezes).',
      );
      final corpoDoPatch = jsonDecode(patches.single.body)
          as Map<String, dynamic>;
      expect(
        corpoDoPatch['photo_upload_id'],
        uploadId,
        reason: 'REPROVA: o PATCH nao levou o `upload_id` que a intencao '
            'devolveu. `updateMe` recusa com 400 `upload_not_usable` o envio '
            'de outra conta, de outro proposito, ja usado ou vencido -- e nao '
            'diz qual dos casos ocorreu.',
      );
      expect(
        corpoDoPatch.keys,
        <String>['photo_upload_id'],
        reason: 'REPROVA: o PATCH da foto levou mais campos que '
            '`photo_upload_id`. `MeUpdate` nao tem campo obrigatorio: um '
            'corpo com os outros campos sobrescreveria com vazio o telefone e '
            'o endereco de referencia de quem so queria trocar a foto.',
      );

      // (4) E A TELA TROCA A PREVIA PELA DERIVADA, sem uma segunda leitura de
      // `/me`: o PATCH ja devolveu o corpo novo.
      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason: 'REPROVA: a previa do arquivo local continua na tela depois '
            'do envio. Dali em diante quem manda e a derivada do servidor.',
      );
      expect(
        urlPedidaPor(imagensDeRedeEm(find.byType(TelaDadosPessoais)).single),
        fotoDerivada,
      );
      expect(
        capturado.pedidos
            .where((p) => p.url.path == '/v1/me' && p.method == 'GET')
            .length,
        1,
        reason: 'REPROVA: a tela leu `/me` mais de uma vez. O PATCH de '
            'confirmacao JA devolve o `/me` novo, e `FotoDoUsuario.corpoDoMe` '
            'existe para poupar essa ida e volta.',
      );
    });

    testWidgets('ISCA — a tela NAO afirma envio que nao aconteceu',
        (tester) async {
      // Sem sinal no passo dos bytes. `DesfechoDoEnvio` tem tres valores e
      // cada um tem a sua frase; um `catch` que caisse em "Foto enviada"
      // compilaria.
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(),
          respostaDoArmazenamento: () async =>
              throw http.ClientException('sem rota'),
        ),
        camera: camera,
      );

      await tester.tap(find.text('Escolher da galeria'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar a foto'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Foto enviada'),
        findsNothing,
        reason: 'REPROVA: a tela afirmou que a foto foi enviada, e ela nao '
            'chegou ao armazenamento.',
      );
      expect(
        find.textContaining('Sem conexão para enviar a foto'),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse que faltou conexao.',
      );
      // **E sem promessa de fila**: a `RetomadaDeFotos` e do pet, e esta foto
      // nao entra em fila nenhuma.
      expect(
        find.textContaining('sai sozinha'),
        findsNothing,
        reason: 'REPROVA: a tela prometeu que a foto sai sozinha quando o '
            'sinal voltar. Nao ha fila para esta foto -- a `RetomadaDeFotos` '
            'so conhece a foto de pet --, e a promessa seria a afirmacao de '
            'um envio que ninguem vai tentar.',
      );

      // A FOTO ESCOLHIDA FICA: limpar a previa faria a pessoa pegar o arquivo
      // de novo para tentar de novo.
      expect(
        find.byType(PreviaDaFoto),
        findsOneWidget,
        reason: 'REPROVA: a previa foi limpa por um envio que falhou.',
      );
      expect(find.text('Salvar a foto'), findsOneWidget);
    });

    testWidgets('a orientacao de 5 MB esta na tela, em UMA linha',
        (tester) async {
      // O cliente pediu expressamente que esta informacao aparecesse
      // (17/10/2026), e ela e a UNICA linha informativa do bloco: o resto sao
      // rotulos de controle.
      await abrirOsDados(tester, rede: servidor(meInicial: me()));

      expect(
        find.text(orientacaoDeTamanhoDaImagem),
        findsOneWidget,
        reason: 'REPROVA: a orientacao de tamanho da imagem nao esta na tela, '
            'ou esta duas vezes. O numero vem de '
            '`orientacaoDeTamanhoDaImagem` (`dispositivo/'
            'camera_e_galeria.dart`), que e o ponto unico das tres telas de '
            'foto -- escrever "5 MB" a mao aqui criaria a segunda regra.',
      );
    });

    testWidgets('sem camera no aparelho, `Tirar foto` SOME e a galeria fica',
        (tester) async {
      // Botao que nao leva a nada e pior que a ausencia dele. A galeria nao
      // tem estado de permissao proprio (o seletor roda fora do processo),
      // entao ela continua.
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me()),
        camera: CameraDeTeste(EstadoDaPermissao.indisponivel),
      );
      await tester.pumpAndSettle();

      expect(find.text('Tirar foto'), findsNothing);
      expect(find.text('Escolher da galeria'), findsOneWidget);
    });

    testWidgets('`Salvar a foto` so existe quando ha foto escolhida',
        (tester) async {
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(urlDaFoto: fotoDerivada)),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Salvar a foto'),
        findsNothing,
        reason: 'REPROVA: ha `Salvar a foto` sem arquivo escolhido. Nao ha o '
            'que enviar, e um botao desabilitado aqui seria um controle '
            'pedindo um toque que nao faz nada.',
      );
    });
  });
}
