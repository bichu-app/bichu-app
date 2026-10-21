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
// O selo e `Me.contact_channel_verified`. Um caso que so afirmasse "com a
// conta validada o selo aparece" ficaria **verde com o selo desenhado SEMPRE**
// -- um `if (true)` passaria, e um selo constante e exatamente o defeito que o
// cliente notaria depois (ele pediu o selo *"se ele estiver validado"*).
//
// Entao o par e: a MESMA foto, a MESMA tela, em duas contas que diferem em UM
// campo. Com `contact_channel_verified: true` o selo esta la; com `false` ele
// nao esta. Nenhum valor fixo passa nos dois.
//
// ---------------------------------------------------------------------------
// A REGUA E A MESMA DOS OUTROS, E O CASO QUE PROVA ISSO FINGE O FUTURO
// ---------------------------------------------------------------------------
// **Era `Me.email_verified` ate 21/10/2026**, e aquilo era uma regua so de
// e-mail, enquanto `contact_channel_verified` -- o selo que os OUTROS veem --
// e e-mail OU telefone. As duas coincidiam porque nada no servidor grava
// `phone_verified_at`.
//
// O cliente mandou unificar: *"Unificar agora, nas duas -- a mesma regua
// (e-mail OU telefone) nos dois lugares, antes de telefone existir."* O caso
// `REGUAS QUE NAO DIVERGEM` deste arquivo e o que prende a decisao: ele monta
// a conta que HOJE nao existe (telefone confirmado, e-mail nao) e exige que o
// dono veja o selo. Com o campo antigo ele reprova.
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
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../widgets/palavras_proibidas_no_rotulo.dart';
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
/// [semNome] e o estado de 2 das 7 contas de homologacao (medido em
/// 18/10/2026): `display_name` nulo. `Me.display_name` e `nullable: true` no
/// contrato, e e nesse estado que o envio da foto morria com "o envio foi
/// recusado" -- ver o grupo `o envio da propria foto sem nome na conta`.
Map<String, dynamic> me({
  bool validado = true,
  bool? emailConfirmado,
  bool telefoneConfirmado = false,
  String? urlDaFoto,
  String? statusDaFoto,
  bool semCampoDeFoto = false,
  bool comCampoDeOriginal = false,
  bool semNome = false,
}) {
  return <String, dynamic>{
    'id': 'u-1',
    'email': 'marina@exemplo.com.br',
    // **AS DUAS REGUAS, e elas sao campos DIFERENTES do contrato.**
    //
    // `email_verified` fala do e-mail e so dele; `contact_channel_verified` e
    // o SELO, e e e-mail OU telefone. [validado] move o selo, que e o que
    // quase todo caso deste arquivo mede; [emailConfirmado] e
    // [telefoneConfirmado] existem para o caso que separa os dois.
    'email_verified': emailConfirmado ?? validado,
    'contact_channel_verified': validado,
    'display_name': semNome ? null : 'Marina',
    'phone_e164': telefoneConfirmado ? '+5511999998888' : null,
    'phone_verified': telefoneConfirmado,
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
/// O selo, pelo GLIFO -- e o glifo aqui nao e escolha de estilo do teste.
///
/// **Ele era lido pelo ROTULO ate 21/10/2026**, e o rotulo era "Conta
/// validada". Com o rotulo unificado em `SeloDeValidado.rotulo`
/// ("E-mail confirmado") ele deixou de IDENTIFICAR o selo nesta tela: a linha
/// de situacao do e-mail, ao lado do endereco, mostra exatamente a mesma frase
/// -- ela fala do e-mail e o selo fala do canal, e hoje a frase e a mesma.
///
/// Entao a identificacao passou para o glifo (`Icons.verified`, o unico desta
/// tela) e **o rotulo continua sendo medido** -- em [rotuloDoSeloDaTela], que o
/// le do no de semantica que embrulha o glifo, e no caso de palavras
/// proibidas. Ler pelo rotulo aqui daria `true` com o selo ausente, o que e
/// pior do que nao medir.
///
/// **A colisao de frase e um achado, nao um detalhe**: quem usa leitor de tela
/// ouve "E-mail confirmado" duas vezes nesta tela. Qual frase o selo do dono
/// deve dizer e decisao do cliente, e esta registrada no relatorio da tarefa.
final Finder _seloDoDono = find.byIcon(Icons.verified);

bool temSelo(WidgetTester tester) => _seloDoDono.evaluate().isNotEmpty;

/// O rotulo acessivel do selo DESTA tela, lido da arvore.
///
/// Lido e nao afirmado: e ele que o portao de rotulo compartilhado varre, e um
/// rotulo escrito a mao aqui mediria a constante do teste e nao a da tela.
String rotuloDoSeloDaTela(WidgetTester tester) {
  expect(
    _seloDoDono,
    findsOneWidget,
    reason: 'REPROVA: nao ha selo na arvore para ler o rotulo. Sem ele, a '
        'varredura de palavras proibidas rodaria sobre nada.',
  );
  return tester.getSemantics(_seloDoDono).label;
}

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
        reason: 'REPROVA: a conta tem `contact_channel_verified: true` e a '
            'foto esta na tela, e o selo nao apareceu. O cliente pediu o selo '
            'na foto "se ele estiver validado", e a fonte e '
            '`Me.contact_channel_verified` -- nao a imagem, nao um campo novo, '
            'nao uma escolha do app.',
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
            '`contact_channel_verified: false`. ISCA: trocar `if (validado && '
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

    // -----------------------------------------------------------------------
    testWidgets(
        'ISCA REGUAS QUE NAO DIVERGEM: telefone confirmado e e-mail NAO, e o '
        'dono ve o selo', (tester) async {
      // **ESTE E O CASO QUE DEFINE A TAREFA DE 21/10/2026**, e ele finge o
      // futuro de propósito.
      //
      // `contact_channel_verified` e e-mail OU telefone; `email_verified` e so
      // e-mail. Hoje as duas respostas coincidem em TODA conta, porque nada no
      // servidor grava `phone_verified_at` -- e e por isso que o defeito era
      // invisivel. No dia em que telefone confirmar, uma conta assim existe:
      // os OUTROS a veriam validada e ela nao se veria.
      //
      // ISCA: voltar `validado: lido.usuario.canalConfirmado` para
      // `lido.usuario.emailVerificado` em `tela_dados_pessoais.dart` compila,
      // passa em TODOS os outros casos deste arquivo, e reprova aqui.
      await abrirOsDados(
        tester,
        rede: servidor(
          meInicial: me(
            validado: true,
            emailConfirmado: false,
            telefoneConfirmado: true,
            urlDaFoto: fotoDerivada,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        temSelo(tester),
        isTrue,
        reason: 'REPROVA: a conta tem `contact_channel_verified: true` por '
            'telefone (`email_verified: false`) e o dono NAO ve o selo. Os '
            'outros veem -- os tres schemas de terceiro leem o mesmo campo. '
            'Duas reguas para o mesmo selo e o defeito que o cliente mandou '
            'unificar em 21/10/2026.',
      );

      // E a linha do E-MAIL continua dizendo a verdade sobre o e-mail: ela le
      // `email_verified`, que NAO foi redefinido. Sem esta metade, "unificar"
      // viraria licenca para o campo mentir.
      expect(
        find.text('E-mail ainda não confirmado'),
        findsOneWidget,
        reason: 'REPROVA: o e-mail desta conta nao foi confirmado e a tela diz '
            'que foi. `email_verified` fala do e-mail; o selo e outro campo.',
      );
    });

    // -----------------------------------------------------------------------
    testWidgets('ISCA: o rotulo do selo desta tela nao promete demais',
        (tester) async {
      // **O rotulo era "Conta validada"**, e o cliente o reprovou em
      // 21/10/2026: *"promete mais do que entrega"*, pelo mesmo motivo que
      // travou o rotulo do selo de terceiro -- *"nao estamos validando
      // documentos de faco, apenas e-mail por enquanto"*.
      //
      // A varredura e a **mesma** de `app/test/widgets/selo_de_validado_test`,
      // em `palavras_proibidas_no_rotulo.dart`: um portao estendido, e nao um
      // segundo portao. "validad" esta na lista dele, entao reverter o rotulo
      // desta tela reprova aqui -- e a isca da isca (naquele arquivo) prova
      // que a varredura enxerga "Conta validada".
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(validado: true, urlDaFoto: fotoDerivada)),
      );
      await tester.pumpAndSettle();

      final String rotulo = rotuloDoSeloDaTela(tester);
      conferirRotuloDoSelo(rotulo, onde: 'a tela de `Meus dados`');

      // E ele e a MESMA constante do selo de terceiro, e nao uma redacao
      // propria que passe por acaso na varredura. Era uma constante local
      // ("Conta validada") e a segunda redacao era o segundo lugar onde o
      // rotulo podia divergir.
      expect(
        rotulo,
        SeloDeValidado.rotulo,
        reason: 'REPROVA: o selo desta tela voltou a ter rotulo proprio. Ele e '
            '`SeloDeValidado.rotulo`, um lugar so para as duas telas.',
      );
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
    // ATENCAO: este caso DIZIA o contrario ate 19/10/2026 -- "escolher mostra
    // a previa e nao sobe nada ainda". O cliente mandou trocar o desenho:
    // *"quando o usuario fizer o upload de qualquer foto no app, voce deve
    // fazer o upload e apresentar como vai ficar de preview, e ao salvar o voce
    // salva a foto"*. O envio passou para a ESCOLHA; o que NAO sai na escolha e
    // a CONFIRMACAO, e e ela que este caso agora mede.
    testWidgets('escolher mostra a PREVIA e sobe os bytes, sem confirmar',
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

      // OS BYTES SUBIRAM, no toque do seletor.
      expect(camera.vezesQueLeuOsBytes, 1);
      expect(capturado.doCaminho('/media/my-photo-intents'), hasLength(1));
      expect(capturado.aoArmazenamento(), hasLength(1));

      // E A CONFIRMACAO NAO SAIU: ela e do `Salvar`.
      expect(
        capturado.pedidos
            .where((p) => p.url.path == '/v1/me' && p.method == 'PATCH'),
        isEmpty,
        reason: 'REPROVA: a escolha confirmou a foto. A confirmacao e '
            '`MeUpdate.photo_upload_id` e ela sai no `Salvar` do formulario, '
            'no mesmo PATCH do nome.',
      );
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
      // O `Salvar` DA BARRA -- o unico botao de salvar desta tela desde
      // 19/10/2026.
      await tester.tap(find.text('Salvar'));
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
        reason: 'REPROVA: o PATCH levou campo que a pessoa nao mudou. '
            '`MeUpdate` nao tem campo obrigatorio: um corpo com os outros '
            'campos sobrescreveria com vazio o telefone e o endereco de '
            'referencia de quem so trocou a foto. `_seMudou` e quem decide '
            'campo por campo, e a foto entra pelo mesmo corpo.',
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
        reason: 'REPROVA: a tela leu `/me` mais de uma vez. O PATCH do '
            '`Salvar` JA devolve o `/me` novo, e `MeApi.atualizar` o traduz em '
            '`DadosPessoais` -- uma segunda leitura so para descobrir a URL da '
            'derivada e uma ida e volta a mais na rede de quem esta na rua.',
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

      // Sem toque em botao de salvar nenhum: o envio sai na ESCOLHA.
      await tester.tap(find.text('Escolher da galeria'));
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

      // A PREVIA SAI, e desde 19/10/2026 isso e a decisao e nao um descuido.
      //
      // Com o envio na escolha, uma previa que ficasse seria um retrato na
      // tela de uma foto que o `Salvar` NAO tem como gravar -- nao ha
      // `upload_id`. A tela estaria prometendo uma foto que nao existe, que e
      // a classe de defeito que esta casa mais paga. Os dois botoes logo acima
      // sao o caminho de tentar de novo, e a frase manda escolher de novo.
      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason: 'REPROVA: a previa ficou na tela depois de um envio que '
            'falhou. Sem `upload_id` o `Salvar` nao grava foto nenhuma, e o '
            'retrato seria a tela afirmando o que nao aconteceu.',
      );
      expect(
        find.textContaining('Escolha a foto de novo'),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse o que fazer. Sem a instrucao, a '
            'pessoa fica olhando um quadrado vazio.',
      );
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

    // O CASO QUE ERA "`Salvar a foto` so existe quando ha foto escolhida" VIROU
    // ESTE: o botao nao existe em estado nenhum. A isca ancorada no WIDGET
    // (e nao num `findsNothing` sobre o literal) esta em
    // `foto_sobe_na_escolha_test.dart`, caso (f).
    testWidgets('a tela tem UM botao de salvar, e e o da barra',
        (tester) async {
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(urlDaFoto: fotoDerivada)),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Salvar a foto'),
        findsNothing,
        reason: 'REPROVA: o segundo botao de salvar voltou. O cliente mandou '
            'remove-lo em 19/10/2026, e ele era o defeito: a pessoa tocava no '
            '`Salvar` da barra e a tela respondia "Nada mudou desde a ultima '
            'vez" sem subir byte nenhum.',
      );
      expect(find.text('Salvar'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('a propria foto numa conta SEM nome', () {
    // -----------------------------------------------------------------------
    // O DEFEITO, MEDIDO E NAO SUPOSTO.
    //
    // Relato do cliente em 18/10/2026, contra homologacao: *"no perfil do
    // usuario, para subir a foto esta dando erro"*. Medido com uma conta de
    // `display_name` nulo, que e o estado de 2 das 7 contas de homologacao:
    //
    //     PATCH /v1/me  {"photo_upload_id":"01a151f1-5e6a-70da-935c-3d6998208ec1"}
    //     400 {"errors":[{"field":"display_name","code":"required",
    //          "message":"Diga como voce quer ser chamado para continuar."}]}
    //
    // A decisao do cliente do mesmo dia -- *"nao permitir atualizar o cadastro,
    // se nao tiver algum nome cadastrado"* -- vale para a foto: a foto e
    // cadastro. Do lado de ca o 400 chegava como `DesfechoDoEnvio.recusada`,
    // que virava "O envio foi recusado. Tente outra foto." -- e nenhuma outra
    // foto resolve.
    //
    // ## O QUE MUDOU EM 19/10/2026, E POR QUE A TRAVA NAO AFROUXOU
    //
    // A confirmacao deixou de ser um PATCH proprio e passou a ser um campo do
    // PATCH do formulario. Entao a trava do nome volta a ser **a do
    // formulario**: `_conferir` cobra o nome antes de a rede ser usada, marca
    // o campo e nao manda PATCH nenhum. Nao ha mais duas redacoes da mesma
    // regra -- havia `fotoPrecisaDoNome` e `nomePrecisaDeTexto`, e ficou a
    // segunda, no campo.
    //
    // **Os bytes SOBEM mesmo assim, e isso e deliberado.** Eles sobem na
    // escolha, antes de o `Salvar` acontecer, e nao ha o que esperar: a pessoa
    // preenche o nome e salva, e o mesmo `upload_id` serve -- a intencao vale
    // dez minutos (medido: `expires_at` 599 s). Barrar a escolha de quem nao
    // tem nome preenchido seria barrar um caminho que a pessoa conclui em
    // segundos.
    testWidgets(
        'ISCA — conta SEM nome: o `Salvar` nao confirma a foto e diz qual '
        'campo falta', (tester) async {
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      final capturado = Capturado();
      await abrirOsDados(
        tester,
        rede: servidor(meInicial: me(semNome: true), capturado: capturado),
        camera: camera,
      );

      await tester.tap(find.text('Escolher da galeria'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();

      // O CAMPO FICA MARCADO: a pessoa precisa saber ONDE mexer.
      expect(
        find.textContaining('Digite o nome que você quer usar'),
        findsOneWidget,
        reason: 'REPROVA: a tela nao disse o que preencher. Era este o '
            'defeito: a recusa do servidor virava "tente outra foto", para um '
            'problema que nenhuma outra foto resolve.',
      );
      expect(
        find.textContaining('Escolha outra foto'),
        findsNothing,
        reason: 'REPROVA: a tela mandou tentar outra foto. O arquivo nao e o '
            'problema.',
      );

      // E O PATCH NAO SAIU. **Esta e a linha que impede o defeito de voltar
      // pela porta de tras**: o servidor recusa o nome e grava a foto em
      // transacoes diferentes, e um PATCH que saisse daqui dependeria dessa
      // ordem para nao gravar foto numa conta que ele acabou de recusar.
      expect(
        capturado.pedidos
            .where((p) => p.url.path == '/v1/me' && p.method == 'PATCH'),
        isEmpty,
        reason: 'REPROVA: o `Salvar` mandou o PATCH de uma conta sem nome. A '
            'conferencia local existe para a recusa chegar ao lado do campo, '
            'e nao da rede.',
      );
    });

    // CONTRAPESO, e ele e obrigatorio: sem este caso, "consertar" o anterior
    // parando TODO envio deixaria a suite verde com a foto quebrada para todo
    // mundo.
    testWidgets('a conta COM nome continua gravando a foto normalmente',
        (tester) async {
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
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Digite o nome'),
        findsNothing,
        reason: 'REPROVA: a tela cobrou o nome de quem tem nome.',
      );
      expect(
        capturado.doCaminho('/media/my-photo-intents'),
        isNotEmpty,
        reason: 'REPROVA: o envio nao saiu para uma conta com nome.',
      );
      expect(
        capturado.pedidos
            .where((p) => p.url.path == '/v1/me' && p.method == 'PATCH'),
        hasLength(1),
        reason: 'REPROVA: o `Salvar` nao confirmou a foto de uma conta com '
            'nome. A conferencia local passou a barrar o caminho normal.',
      );
    });
  });
}
