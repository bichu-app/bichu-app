// AS ISCAS DA FOTO **DENTRO** DA CONVERSA ABERTA.
//
// ===========================================================================
// ESTE ARQUIVO NAO E `foto_na_conversa_test.dart`, E A DIFERENCA E REAL
// ===========================================================================
// O vizinho de nome parecido mede a FOTO DE PERFIL do participante como icone
// da LISTA de conversas (`Conversation.participants[].photo_icon_url`, emenda 3
// do ADR-0010). Este mede a foto que viaja COMO MENSAGEM dentro da conversa
// aberta (`Message.photo_url`), e a previa que decide se ela viaja.
//
// Sao dois campos, duas telas e dois riscos diferentes. Juntar os dois arquivos
// faria a proxima pessoa consertar um e achar que mediu o outro.
//
// ===========================================================================
// O QUE CADA ISCA PROTEGE, PELO FATO E NAO PELO WIDGET
// ===========================================================================
//
//   (1) a previa mostra A FOTO ESCOLHIDA, e NADA foi para a conversa
//       contrapeso: os BYTES subiram (o envio acontece na escolha), entao o
//       zero de mensagens nao e "nada aconteceu"
//   (2) o descarte NAO envia nada, e NAO perde o texto digitado
//       contrapeso: antes do descarte a previa existia
//   (3) a mensagem com foto APARECE na linha, nos dois sentidos
//       contrapeso: `photo_url` nulo nao desenha imagem, e desenha o corpo
//   (4) a legenda da foto recebida NAO contem palavra de prova
//       contrapeso: a legenda esta na tela, e diz "diz ter encontrado"
//   (5) o estado de erro aparece e PRESERVA a previa
//       contrapeso: o caminho bom chega em "pronta" e nao acende faixa
//   (6) a barra mede BYTES de verdade, com o par de numeros
//       contrapeso: a medicao vem do mecanismo (varias chamadas crescentes),
//       e nao de um `value` constante
//
// ===========================================================================
// A BANCADA ATRAVESSA O CAMINHO DE PRODUCAO
// ===========================================================================
// Nenhum caso usa um dublê de tela. A rede da API e `MockClient` sobre
// `ApiClient` -> `ConversasApi`; o envio dos bytes e o `EnvioDeFoto` DE
// VERDADE, com o cliente HTTP dele apontado para um `MockClient` proprio -- o
// mesmo desenho do envio em producao, em que os bytes saem por um cliente que
// NAO conhece o token da sessao.
//
// Os fixtures do contrato vem do arquivo vizinho, importados. Duas copias
// divergem no dia em que um campo mudar, e a que nao foi atualizada continua
// verde sobre um corpo que o servidor nao manda mais.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/telas/mensagens/foto_na_barra_de_escrever.dart';
import 'package:bichu/telas/mensagens/tela_da_conversa.dart';
import 'package:bichu/telas/mensagens/textos_da_foto_na_conversa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart'
    show CameraDeTeste, bytesDeFotoDeTeste, pisoMinimo;
import 'area_de_mensagens_test.dart'
    show
        ServidorDeConversas,
        apiDe,
        conversa,
        idDaMinha,
        json200,
        mensagem,
        problema,
        semanticaDaTela,
        textoDaTela;

// ---------------------------------------------------------------------------
// OS FIXTURES DESTA HISTORIA
// ---------------------------------------------------------------------------

/// O aviso de achado de que a conversa nasceu.
///
/// **`found_report_id` NAO esta em `Conversation` no contrato de hoje** -- ver
/// `Conversa.foundReportId`. Ele e acrescentado AQUI, no corpo do caso, e nao
/// no fixture compartilhado: o fixture espelha o contrato, e por-lo la diria
/// que o contrato o tem.
const String idDoAviso = '0192f3a1-7b2c-7def-8a01-00000000f00d';

/// A URL assinada que o servidor devolve em `Message.photo_url`.
///
/// `?X-Amz-Expires=600` no fim de proposito: e a marca da **validade curta**,
/// que e o que obriga o estado de falha desta tela a ter saida.
const String urlDaFotoDaMensagem =
    'https://midia.bichu.test/mediated/9f3a.jpeg?X-Amz-Expires=600';

/// O endereco do armazenamento, que a intencao devolve. **Outro host**, por
/// desenho: e por isso que `EnvioDeFoto` tem cliente HTTP proprio.
const String urlDoArmazenamento = 'https://balde.bichu.test/mediated';

const String idDoUpload = '0192f3a1-7b2c-7def-8a01-0000000beef0';

/// Uma `Conversation` aberta COM `found_report_id`, e com as mensagens que o
/// caso pedir.
Map<String, dynamic> conversaComAviso({
  List<Map<String, dynamic>>? mensagens,
  String? aviso = idDoAviso,
}) {
  final corpo = conversa(mensagens: mensagens);
  if (aviso != null) corpo['found_report_id'] = aviso;
  return corpo;
}

String get caminhoDasMensagens => 'POST /v1/conversations/$idDaMinha/messages';
String get caminhoDaConversa => 'GET /v1/conversations/$idDaMinha';

/// A porta de intencao de upload, que CONTA os pedidos.
///
/// Interface estreita (`IntencaoDeFotoDeAchado`) e nao `AchadosApi`: e a mesma
/// que a tela pede, e e o que prova que a tela nao alcanca o resto do modulo de
/// achados.
class IntencaoDeTeste implements IntencaoDeFotoDeAchado {
  IntencaoDeTeste({this.metodo = 'POST', this.falhar = false});

  final String metodo;
  final bool falhar;

  final List<Map<String, Object>> pedidos = <Map<String, Object>>[];

  @override
  Future<Map<String, dynamic>> intencaoDeFotoDoAchado({
    required String foundReportId,
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    pedidos.add(<String, Object>{
      'found_report_id': foundReportId,
      'content_type': tipoDeConteudo,
      'byte_size': tamanhoEmBytes,
    });
    if (falhar) throw const FormatException('a intencao recusou');
    return <String, dynamic>{
      'upload_id': idDoUpload,
      'method': metodo,
      'url': urlDoArmazenamento,
      if (metodo == 'POST') 'fields': <String, String>{'key': 'mediated/9f3a'},
      if (metodo == 'PUT')
        'headers': <String, String>{'content-type': tipoDeConteudo},
      'max_bytes': tetoDeBytesDaFoto,
      'expires_at': '2026-10-20T13:00:00.000Z',
    };
  }
}

/// O armazenamento de teste: conta as requisicoes e responde o que o caso
/// pedir.
class ArmazenamentoDeTeste {
  ArmazenamentoDeTeste({this.status = 204, this.semRede = false});

  final int status;

  /// A rede nao cooperou. `ClientException` e o que `EnvioDeFoto` traduz em
  /// `semSinal`.
  final bool semRede;

  int requisicoes = 0;

  /// Quantos bytes de corpo chegaram, somados, na ULTIMA requisicao.
  int bytesRecebidos = 0;

  http.Client get cliente => MockClient.streaming((req, corpo) async {
    requisicoes += 1;
    final bytes = await corpo.toBytes();
    bytesRecebidos = bytes.length;
    if (semRede) throw http.ClientException('sem rede', req.url);
    return http.StreamedResponse(const Stream<List<int>>.empty(), status);
  });
}

// ---------------------------------------------------------------------------
// A BANCADA
// ---------------------------------------------------------------------------

/// Abre a CONVERSA, com as quatro portas injetadas.
///
/// Monta com `GoRouter` e com a rota de verdade (`RotasDeMensagens.conversa`)
/// porque ela e o destino do toque na notificacao; montar o widget solto
/// deixaria esse caminho sem prova.
Future<({IntencaoDeTeste intencao, EnvioDeFoto envio})> abrirAConversa(
  WidgetTester tester, {
  required ServidorDeConversas servidor,
  required CameraDeTeste camera,
  required ArmazenamentoDeTeste armazenamento,
  IntencaoDeTeste? intencao,
}) async {
  final api = apiDe(servidor);
  final porta = intencao ?? IntencaoDeTeste();
  final envio = EnvioDeFoto(camera: camera, cliente: armazenamento.cliente);
  addTearDown(envio.fechar);

  final roteador = GoRouter(
    initialLocation: RotasDeMensagens.conversaDe(idDaMinha),
    routes: <RouteBase>[
      GoRoute(
        path: RotasDeMensagens.area,
        builder: (context, estado) => AreaDeMensagens(conversas: api),
      ),
      GoRoute(
        path: RotasDeMensagens.conversa,
        builder: (context, estado) => TelaDaConversa(
          conversaId:
              estado.pathParameters[RotasDeMensagens.parametroDaConversa] ?? '',
          conversas: api,
          camera: camera,
          envioDeFoto: envio,
          intencaoDeFoto: porta,
        ),
      ),
    ],
  );
  addTearDown(roteador.dispose);
  await tester.pumpWidget(
    MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
  );
  await tester.pumpAndSettle();
  return (intencao: porta, envio: envio);
}

/// Toca no anexar e escolhe a GALERIA na folha.
///
/// Dois toques porque sao dois toques no produto: um botao que abrisse a
/// galeria direto tiraria da pessoa a camera, que e a origem mais usada de
/// quem esta com o animal na mao.
Future<void> anexarDaGaleria(WidgetTester tester) async {
  await tester.tap(find.byTooltip(TextosDaFotoNaConversa.anexarFoto));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Escolher da galeria'));
  await tester.pumpAndSettle();
}

/// Uma camera com uma foto escolhida de [bytes] bytes.
///
/// O tamanho declarado e o REAL dos bytes: `EnvioDeFoto` mede os bytes na hora
/// do envio, e declarar outro numero na intencao faria o armazenamento recusar
/// depois do upload inteiro.
CameraDeTeste cameraComFotoDe(int bytes, {String tipo = 'image/jpeg'}) {
  final conteudo = List<int>.filled(bytes, 0x42);
  return CameraDeTeste(
    EstadoDaPermissao.concedida,
    foto: FotoLocal(
      caminho: '/tmp/foto-da-conversa.jpg',
      tipoDeConteudo: tipo,
      tamanhoEmBytes: bytes,
    ),
    bytes: conteudo,
  );
}

/// As palavras que a interface NAO pode usar sobre a foto recebida.
///
/// Raizes e nao palavras inteiras: "comprova" pega "comprovacao",
/// "comprovante" e "comprovada"; "confirma" pega "confirmacao" e "confirmado";
/// "verificad" pega "verificado" e "verificada". Uma lista de palavras exatas
/// passaria pela flexao, que e justamente como o texto proibido voltaria.
const List<String> palavrasProibidas = <String>[
  'prova',
  'comprova',
  'confirma',
  'verificad',
];

void main() {
  // -------------------------------------------------------------------------
  group('(1) a previa mostra a foto escolhida, e NADA foi para a conversa', () {
    testWidgets(
      'ISCA: a foto escolhida aparece na previa e o POST de mensagem NAO sai',
      (tester) async {
        final camera = cameraComFotoDe(bytesDeFotoDeTeste.length);
        final armazenamento = ArmazenamentoDeTeste();
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: camera,
          armazenamento: armazenamento,
        );

        await anexarDaGaleria(tester);

        final previa = tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto));
        expect(
          previa.foto?.caminho,
          '/tmp/foto-da-conversa.jpg',
          reason:
              'REPROVA: a previa nao desenha A FOTO QUE A PESSOA ESCOLHEU. '
              'Uma previa que mostra outra coisa e pior que nenhuma: foto '
              'mandada por engano numa conversa nao se desfaz como rascunho, e '
              'a previa e a unica defesa contra isso.',
        );
        expect(
          previa.descricao,
          TextosDaFotoNaConversa.previaAindaNaoEnviada,
          reason:
              'REPROVA: o rotulo da previa nao diz que a foto AINDA NAO FOI '
              'ENVIADA. Quem nao ve a tela nao tem outro jeito de distinguir '
              'este estado de uma foto que ja esta na conversa.',
        );
        expect(
          servidor.chamadasA(caminhoDasMensagens),
          isEmpty,
          reason:
              'REPROVA: a tela POSTOU A MENSAGEM na escolha da foto. Nada vai '
              'para a conversa antes de a pessoa confirmar -- a imagem chega no '
              'aparelho da outra pessoa e ali ela fica.',
        );

        // CONTRAPESO: os BYTES subiram. Sem ele, o `isEmpty` acima passaria num
        // mundo em que a escolha da foto nao faz nada -- que e exatamente o
        // estado que esta historia existe para desfazer, e o estado em que o
        // app estava ate 22/09/2026 ("a foto ainda nao foi enviada").
        expect(
          armazenamento.requisicoes,
          1,
          reason:
              'REPROVA: nenhum byte foi para o armazenamento na escolha. '
              'Entao o caso acima nao mediu "a mensagem nao saiu", mediu "nada '
              'aconteceu" -- e o pedido do cliente de 19/10/2026 e que o upload '
              'saia NA ESCOLHA e a mensagem no toque.',
        );
        expect(
          armazenamento.bytesRecebidos,
          greaterThanOrEqualTo(bytesDeFotoDeTeste.length),
          reason: 'os bytes do arquivo chegaram, e nao um corpo vazio',
        );
      },
    );

    testWidgets('ISCA: o alvo de toque do anexar e o minimo dos tokens', (
      tester,
    ) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          caminhoDaConversa: (_) => json200(conversaComAviso()),
        },
      );
      await abrirAConversa(
        tester,
        servidor: servidor,
        camera: cameraComFotoDe(32),
        armazenamento: ArmazenamentoDeTeste(),
      );

      final alvo = tester.getSize(
        find.byTooltip(TextosDaFotoNaConversa.anexarFoto),
      );
      expect(
        alvo.width,
        greaterThanOrEqualTo(pisoMinimo),
        reason:
            'REPROVA: o anexar ficou mais estreito que o minimo do grupo '
            '`target` dos tokens. Alvo que a pessoa erra numa barra de escrever '
            'significa tocar no campo de texto em vez de anexar.',
      );
      expect(alvo.height, greaterThanOrEqualTo(pisoMinimo));
    });

    testWidgets(
      'ISCA: SEM `found_report_id` nao ha anexar -- e nao um anexar que falha',
      (tester) async {
        // O corpo de HOJE: `Conversation` nao declara `found_report_id`, e sem
        // ele nao existe valor valido para pedir a autorizacao de upload.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso(aviso: null)),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(32),
          armazenamento: ArmazenamentoDeTeste(),
        );

        expect(
          find.byTooltip(TextosDaFotoNaConversa.anexarFoto),
          findsNothing,
          reason:
              'REPROVA: a tela desenhou o anexar numa conversa sem '
              '`found_report_id`. O toque pediria a intencao sem o campo que a '
              'rota exige e devolveria 400 -- o toque sem desfecho que o '
              'criterio 2 da BICHUS-62 proibe.',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('localização é removida')),
          reason:
              'REPROVA: a linha sobre a localizacao da foto ficou numa tela '
              'que nao aceita foto. Promessa sobre algo que nao acontece ali.',
        );
        // CONTRAPESO: a caixa de escrever ESTA la. Sem ele, os dois
        // `findsNothing` acima passariam numa tela que nao desenhou a barra.
        expect(
          find.byType(TextField),
          findsOneWidget,
          reason:
              'REPROVA: nao ha campo de texto. Entao a conversa nao abriu, e '
              'os dois casos acima nao mediram nada.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(2) o descarte da previa nao envia nada', () {
    testWidgets(
      'ISCA: o X descarta, NADA e postado e o texto digitado FICA',
      (tester) async {
        const String legenda = 'Ele está aqui comigo, no portão azul';
        final armazenamento = ArmazenamentoDeTeste();
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: armazenamento,
        );

        await tester.enterText(find.byType(TextField), legenda);
        await tester.pumpAndSettle();
        await anexarDaGaleria(tester);

        // CONTRAPESO, e ele vem ANTES do descarte: sem ele o `findsNothing`
        // depois passaria num mundo em que a previa nunca apareceu.
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason:
              'REPROVA: a previa nao apareceu, e entao o caso do descarte '
              'nao tem o que descartar.',
        );

        await tester.tap(
          find.bySemanticsLabel(TextosDaFotoNaConversa.descartarAFoto),
        );
        await tester.pumpAndSettle();

        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsNothing,
          reason: 'REPROVA: o X nao descartou a previa.',
        );
        expect(
          servidor.chamadasA(caminhoDasMensagens),
          isEmpty,
          reason:
              'REPROVA: o DESCARTE postou a mensagem. O X e o controle que a '
              'pessoa usa justamente para a foto NAO sair; se ele envia, nao ha '
              'saida nenhuma depois da escolha.',
        );
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller?.text,
          legenda,
          reason:
              'REPROVA: descartar a foto apagou o texto. Sao duas coisas, e a '
              'pessoa pode querer mandar a legenda sem a foto -- apagar o que '
              'ela escreveu e cobrar por um toque que ela deu de proposito.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(3) a mensagem com foto aparece na linha, nos dois sentidos', () {
    testWidgets('ISCA: `photo_url` preenchido desenha a imagem, pelos DOIS '
        'papeis', (tester) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          caminhoDaConversa: (_) => json200(
            conversaComAviso(
              mensagens: <Map<String, dynamic>>[
                <String, dynamic>{
                  ...mensagem(papel: 'finder', corpo: 'Achei ele na praça'),
                  'photo_url': urlDaFotoDaMensagem,
                },
                <String, dynamic>{
                  ...mensagem(
                    id: '0192f3a1-7b2c-7def-8a01-00000000bbbb',
                    papel: 'tutor',
                    corpo: 'É ele mesmo, obrigado',
                  ),
                  'photo_url': '$urlDaFotoDaMensagem&eu=1',
                },
              ],
            ),
          ),
        },
      );
      await abrirAConversa(
        tester,
        servidor: servidor,
        camera: cameraComFotoDe(32),
        armazenamento: ArmazenamentoDeTeste(),
      );

      // `skipOffstage: false` porque duas imagens 4:3 de 78% da largura somam
      // mais que a altura da tela: a segunda bolha E construida (o `ListView`
      // desta tela recebe `children`, e nao um construtor preguicoso) e fica
      // recortada fora da janela. Sem isto o caso contaria uma e acusaria a
      // tela de nao desenhar a outra.
      final fotos = tester
          .widgetList<FotoDaMensagem>(
            find.byType(FotoDaMensagem, skipOffstage: false),
          )
          .toList();
      expect(
        fotos.length,
        2,
        reason:
            'REPROVA: a conversa trouxe `photo_url` em duas mensagens -- uma '
            'de cada lado -- e a tela nao desenhou duas imagens. Desenhar so a '
            'recebida deixaria quem mandou sem ver o que mandou.',
      );
      expect(fotos.first.url, urlDaFotoDaMensagem);
      expect(
        fotos.map((f) => f.papel).toSet(),
        <Object>{PapelNaConversa.achador, PapelNaConversa.tutor},
        reason:
            'REPROVA: as duas imagens foram desenhadas com o mesmo papel. O '
            'papel decide a legenda, e com um so as duas receberiam a mesma '
            'frase -- inclusive a do tutor levaria "enviada por quem diz ter '
            'encontrado", sobre a propria foto dele.',
      );
      expect(
        tester
            .widgetList<ImagemDaRede>(
              find.byType(ImagemDaRede, skipOffstage: false),
            )
            .every((i) => i.aoTocarNaFalha != null),
        isTrue,
        reason:
            'REPROVA: a imagem da conversa foi desenhada SEM saida para a '
            'falha. A URL e assinada e de validade curta: reabrir a conversa '
            'depois de um tempo mostraria um quadro quebrado sem nada a fazer.',
      );
    });

    testWidgets('ISCA: `photo_url` NULO nao desenha imagem, e desenha o corpo', (
      tester,
    ) async {
      // O corpo normal de hoje: `photo_url: null` no fixture do contrato.
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          caminhoDaConversa: (_) => json200(
            conversaComAviso(
              mensagens: <Map<String, dynamic>>[
                mensagem(corpo: 'Achei ele na praça da Matriz, está bem'),
              ],
            ),
          ),
        },
      );
      await abrirAConversa(
        tester,
        servidor: servidor,
        camera: cameraComFotoDe(32),
        armazenamento: ArmazenamentoDeTeste(),
      );

      expect(
        find.byType(FotoDaMensagem, skipOffstage: false),
        findsNothing,
        reason:
            'REPROVA: a tela desenhou imagem numa mensagem sem foto. Nulo e '
            '"sem foto", e um quadro de imagem ali seria um lugar reservado '
            'para nada.',
      );
      // CONTRAPESO: a mensagem ESTA na tela. `findsNothing` sobre uma conversa
      // que nao renderizou passa sempre.
      expect(
        textoDaTela(tester),
        contains('Achei ele na praça da Matriz'),
        reason:
            'REPROVA: a mensagem nao apareceu. Entao o caso acima nao mediu '
            'nada.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(4) a legenda da foto recebida nao empresta credibilidade', () {
    testWidgets(
      'ISCA: nenhuma palavra de prova na tela, e a legenda diz QUEM DISSE',
      (tester) async {
        // POR QUE ESTA ISCA EXISTE, e o que ela protege de verdade:
        //
        // a foto do pet perdido e PUBLICA na listagem de perdidos
        // (`PublicLostPet.photo_url`). Quem NAO esta com o animal pode baixa-la
        // e devolve-la nesta conversa. Se a interface chamar aquela imagem de
        // comprovacao, ela empresta credibilidade que ninguem mediu -- e e
        // nessa credibilidade emprestada que o golpe do falso achador opera.
        //
        // Entao a varredura e por RAIZ e sobre a tela INTEIRA, texto e
        // semantica: a palavra proibida volta por qualquer uma das duas, e a
        // semantica e saida tambem.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(
              conversaComAviso(
                mensagens: <Map<String, dynamic>>[
                  <String, dynamic>{
                    ...mensagem(papel: 'finder', corpo: 'Achei ele na praça'),
                    'photo_url': urlDaFotoDaMensagem,
                  },
                ],
              ),
            ),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(32),
          armazenamento: ArmazenamentoDeTeste(),
        );

        final varredura =
            '${textoDaTela(tester)}\n${semanticaDaTela(tester)}'.toLowerCase();
        for (final proibida in palavrasProibidas) {
          expect(
            varredura,
            isNot(contains(proibida)),
            reason:
                'REPROVA: a tela escreveu "$proibida" sobre a foto da '
                'conversa. O app NAO atesta o que nao verificou: a foto do pet '
                'perdido e publica, e quem nao tem o animal pode devolve-la '
                'aqui. Texto que soa a prova e o insumo do golpe do falso '
                'achador.\n'
                'O que a tela diz hoje:\n$varredura',
          );
        }

        // A LEGENDA E O NOME ACESSIVEL DA IMAGEM, e nao so um texto embaixo
        // dela. Sem isto, quem usa leitor de tela receberia a imagem sem a
        // ressalva -- e a ressalva e o ponto inteiro desta decisao. Medido: a
        // primeira versao de `ImagemDaRede.aoTocarNaFalha` devolvia o conteudo
        // cru e engolia o rotulo justamente no caminho em que a foto carrega.
        expect(
          semanticaDaTela(tester),
          contains('diz ter encontrado'),
          reason:
              'REPROVA: a foto da conversa nao tem NOME ACESSIVEL com a '
              'ressalva. Quem nao ve a tela recebe "imagem" e nada mais, e a '
              'frase que diz que o app nao atesta aquilo nao chega a essa '
              'pessoa.',
        );

        // CONTRAPESO 1: a legenda ESTA na tela. Sem ele, todos os
        // `isNot(contains(...))` acima passariam numa tela sem legenda nenhuma
        // -- e uma imagem sem ressalva e pior que uma ressalva mal escrita.
        expect(
          textoDaTela(tester),
          contains('diz ter encontrado'),
          reason:
              'REPROVA: a legenda da foto recebida nao esta na tela. Entao a '
              'varredura acima passou por vazio, e a imagem chegou sem a '
              'ressalva que e o ponto inteiro desta decisao.',
        );
        // CONTRAPESO 2: a varredura NAO esta vazia e PEGA palavra de verdade.
        // Este e o controle positivo do mecanismo: se `textoDaTela` ou
        // `semanticaDaTela` parassem de ler a arvore, o laco acima ficaria
        // verde para sempre.
        expect(
          varredura,
          contains('foto'),
          reason:
              'REPROVA: a varredura nao achou nem a palavra "foto" na tela. '
              'Entao ela esta lendo vazio, e o laco de palavras proibidas nao '
              'mede nada.',
        );
      },
    );

    test('ISCA: a legenda de cada papel, e nenhuma delas e de prova', () {
      // Medido fora da tela tambem: a tela desenha UM papel por caso, e as
      // tres frases precisam estar limpas -- inclusive a do sistema, que
      // nenhuma tela exercita hoje.
      for (final papel in PapelNaConversa.values) {
        final legenda = FotoDaMensagem(
          url: urlDaFotoDaMensagem,
          papel: papel,
          aoBuscarDeNovo: () {},
        ).legenda;
        expect(
          legenda,
          isNotEmpty,
          reason:
              'REPROVA: o papel ${papel.codigo} nao tem legenda. Imagem sem '
              'ressalva e o estado que esta decisao proibe.',
        );
        for (final proibida in palavrasProibidas) {
          expect(
            legenda.toLowerCase(),
            isNot(contains(proibida)),
            reason:
                'REPROVA: a legenda do papel ${papel.codigo} escreve '
                '"$proibida": "$legenda".',
          );
        }
      }
      // CONTRAPESO: as tres frases sao DIFERENTES. Uma constante so para os
      // tres papeis passaria pelo laco acima e faria a foto do tutor ser
      // anunciada como "enviada por quem diz ter encontrado".
      final frases = <String>{
        for (final papel in PapelNaConversa.values)
          FotoDaMensagem(
            url: urlDaFotoDaMensagem,
            papel: papel,
            aoBuscarDeNovo: () {},
          ).legenda,
      };
      expect(
        frases.length,
        3,
        reason:
            'REPROVA: dois papeis compartilham a mesma legenda. A do achador '
            'carrega a ressalva, e aplica-la a foto do PROPRIO tutor faria o '
            'app duvidar da pessoa que ele autenticou.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(5) o estado de erro aparece e preserva a previa', () {
    testWidgets(
      'ISCA: sem rede no upload, a faixa acende e a previa FICA -- e '
      '`Enviar a foto de novo` refaz o envio',
      (tester) async {
        final armazenamento = ArmazenamentoDeTeste(semRede: true);
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: armazenamento,
        );
        await anexarDaGaleria(tester);

        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason:
              'REPROVA: a falha de rede APAGOU a previa. A pessoa escolheu '
              'uma foto; perder a escolha junto com a falha a obriga a achar o '
              'arquivo na galeria outra vez, por um problema que nao e dela.',
        );
        expect(
          textoDaTela(tester),
          contains('A foto não subiu'),
          reason:
              'REPROVA: a tela nao disse que a foto nao subiu. Previa parada '
              'sem explicacao e indistinguivel de previa pronta.',
        );
        expect(
          servidor.chamadasA(caminhoDasMensagens),
          isEmpty,
          reason: 'REPROVA: a tela postou a mensagem com a foto que nao subiu.',
        );

        final antes = armazenamento.requisicoes;
        await tester.tap(find.text(TextosDaFotoNaConversa.enviarAFotoDeNovo));
        await tester.pumpAndSettle();
        expect(
          armazenamento.requisicoes,
          antes + 1,
          reason:
              'REPROVA: `Enviar a foto de novo` nao fez sair um SEGUNDO '
              'pedido ao armazenamento. Um botao que nao reenvia e o toque sem '
              'desfecho, e aqui ele e o unico caminho de volta.',
        );
      },
    );

    testWidgets(
      'ISCA: o armazenamento RECUSA e a tela nao oferece insistir -- oferece '
      'descartar',
      (tester) async {
        // 403 do armazenamento: tipo fora da politica, tamanho acima do teto,
        // autorizacao vencida. Nenhuma melhora com insistencia imediata, e um
        // `Tentar de novo` aqui devolveria a mesma recusa.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: ArmazenamentoDeTeste(status: 403),
        );
        await anexarDaGaleria(tester);

        expect(find.byType(PreviaDaFotoDaConversa), findsOneWidget);
        expect(
          find.text(TextosDaFotoNaConversa.descartar),
          findsOneWidget,
          reason:
              'REPROVA: a recusa nao oferece descartar. Sem saida, a previa '
              'recusada fica na tela e o campo de legenda continua pedindo uma '
              'legenda para uma foto que nunca vai sair.',
        );
        expect(
          find.text(TextosDaFotoNaConversa.enviarAFotoDeNovo),
          findsNothing,
          reason:
              'REPROVA: a recusa oferece insistir. A mesma recusa volta na '
              'segunda tentativa, e o botao gasta a rede da pessoa para chegar '
              'ao mesmo lugar.',
        );
      },
    );

    testWidgets(
      'ISCA: a foto GRANDE DEMAIS e recusada ANTES de qualquer byte sair, e a '
      'previa aparece',
      (tester) async {
        final armazenamento = ArmazenamentoDeTeste();
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        final camera = CameraDeTeste(
          EstadoDaPermissao.concedida,
          foto: FotoLocal(
            caminho: '/tmp/gigante.jpg',
            tipoDeConteudo: 'image/jpeg',
            tamanhoEmBytes: tetoDeBytesDaFoto + 1,
          ),
          bytes: bytesDeFotoDeTeste,
        );
        final porta = IntencaoDeTeste();
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: camera,
          armazenamento: armazenamento,
          intencao: porta,
        );
        await anexarDaGaleria(tester);

        expect(
          porta.pedidos,
          isEmpty,
          reason:
              'REPROVA: a tela pediu a autorizacao de upload para uma foto '
              'acima do teto de 5 MiB. A politica assinada carrega o teto, e '
              'deixar a pessoa esperar o upload inteiro para o armazenamento '
              'recusar e gastar a rede dela para chegar ao mesmo lugar.',
        );
        expect(armazenamento.requisicoes, 0);
        expect(
          textoDaTela(tester),
          contains('até 5 MB'),
          reason:
              'REPROVA: a tela nao disse o teto. "Nao deu" sem numero deixa a '
              'pessoa escolhendo outra foto ao acaso.',
        );
        // CONTRAPESO: A PREVIA APARECE MESMO NA RECUSA. Ela precisa ver QUAL
        // foto foi recusada para escolher outra; um aviso sem a imagem a manda
        // de volta para a galeria sem saber o que evitar.
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason:
              'REPROVA: a recusa por tamanho nao desenhou a previa. A pessoa '
              'fica sem saber qual das fotos da galeria era a grande.',
        );
      },
    );

    testWidgets(
      'ISCA: o caminho BOM chega em pronta, SEM faixa, e o toque POSTA com '
      '`photo_upload_id`',
      (tester) async {
        // O CONTRAPESO DO GRUPO INTEIRO. Sem ele, as tres iscas de erro acima
        // passariam num mundo em que o envio nunca da certo.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) => json200(<String, dynamic>{
              ...mensagem(papel: 'tutor', corpo: 'É ele mesmo'),
              'photo_url': urlDaFotoDaMensagem,
            }, status: 201),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: ArmazenamentoDeTeste(),
        );
        await tester.enterText(find.byType(TextField), 'É ele mesmo');
        await tester.pumpAndSettle();
        await anexarDaGaleria(tester);

        expect(
          find.byType(FaixaDeAviso),
          findsNothing,
          reason:
              'REPROVA: o caminho bom acendeu faixa de aviso. Entao as iscas '
              'de erro deste grupo nao distinguem erro de normal.',
        );
        expect(
          textoDaTela(tester),
          contains('Foto pronta para enviar'),
          reason: 'REPROVA: a tela nao disse que a foto esta pronta.',
        );

        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        await tester.pumpAndSettle();

        final postadas = servidor.chamadasA(caminhoDasMensagens);
        expect(postadas.length, 1, reason: 'REPROVA: a mensagem nao foi postada.');
        final corpo =
            jsonDecode(postadas.single.body) as Map<String, dynamic>;
        expect(
          corpo['photo_upload_id'],
          idDoUpload,
          reason:
              'REPROVA: a mensagem saiu SEM `photo_upload_id`, ou com outro. '
              'A legenda chegaria sozinha e a foto ficaria orfa no '
              'armazenamento ate o varredor recolhe-la -- e a pessoa leria uma '
              'mensagem enviada sem a imagem que ela anexou.',
        );
        expect(
          corpo['body'],
          'É ele mesmo',
          reason:
              '`body` continua obrigatorio (1..1000), e o `CHECK` do banco '
              'exige texto nao vazio: nao existe mensagem so-foto',
        );
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsNothing,
          reason:
              'REPROVA: a previa ficou depois do 201. A foto deixou de ser '
              '"escolhida" e virou mensagem na linha; a previa parada ali faria '
              'a pessoa mandar a mesma foto duas vezes.',
        );
      },
    );

    testWidgets(
      'ISCA: ENQUANTO A FOTO SOBE, o toque em Enviar nao posta nada',
      (tester) async {
        // A corrida que esta isca pega: com o envio liberado durante o upload,
        // o toque postaria a legenda SEM a foto -- e o `201` limparia o campo,
        // entao a pessoa perderia o texto e a foto de uma vez.
        final porta = _Portao();
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) =>
                json200(mensagem(papel: 'tutor'), status: 201),
          },
        );
        final armazenamento = _ArmazenamentoComPortao(porta);
        addTearDown(porta.liberar);
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(200 * 1024),
          armazenamento: armazenamento,
        );
        await tester.enterText(find.byType(TextField), 'Está comigo');
        await tester.pump();
        await tester.tap(find.byTooltip(TextosDaFotoNaConversa.anexarFoto));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Escolher da galeria'));
        // SEM `pumpAndSettle`: o portao segura a resposta do armazenamento, e
        // `pumpAndSettle` esperaria para sempre. O envio esta em curso AGORA.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        // A GUARDA MORA EM DOIS LUGARES, E OS DOIS SAO MEDIDOS AQUI.
        //
        // Medido: desligar um deles sozinho **nao** reprovava este caso, e um
        // caso que passa com metade do mecanismo fora e um caso que nao mede o
        // mecanismo. Os dois lugares existem por entradas diferentes:
        //
        //   - o `onPressed` nulo e o que a PESSOA ve, e e o unico que cobre o
        //     toque no botao;
        //   - a guarda dentro de `_enviar` cobre as entradas que nao passam
        //     pelo botao -- o `Tentar de novo` da faixa de falha de envio
        //     chama `_enviar` direto, e a cadeia de nova tentativa do
        //     "preparando" tambem.
        //
        // Entao o caso mede o estado do botao E o efeito do toque.
        final botao = tester.widget<IconButton>(
          find.ancestor(
            of: find.byTooltip(TextosDasMensagens.enviar),
            matching: find.byType(IconButton),
          ).first,
        );
        expect(
          botao.onPressed,
          isNull,
          reason:
              'REPROVA: o botao de enviar esta HABILITADO com a foto ainda '
              'subindo. A pessoa toca, nada acontece de util, e ela nao tem '
              'como saber por que -- ou pior, a mensagem sai sem a foto.',
        );

        await tester.tap(
          find.byTooltip(TextosDasMensagens.enviar),
          warnIfMissed: false,
        );
        await tester.pump();

        expect(
          servidor.chamadasA(caminhoDasMensagens),
          isEmpty,
          reason:
              'REPROVA: o toque em Enviar postou a mensagem COM A FOTO AINDA '
              'SUBINDO. Ela iria sem `photo_upload_id`, a foto ficaria orfa, e '
              'o 201 limparia o campo -- a pessoa perderia o texto e a imagem '
              'no mesmo toque.',
        );

        porta.liberar();
        await tester.pumpAndSettle();
        // CONTRAPESO: liberado o portao, o envio TERMINA e o toque passa a
        // postar. Sem ele, o `isEmpty` acima passaria numa tela cujo botao de
        // enviar nunca funciona.
        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        await tester.pumpAndSettle();
        expect(
          servidor.chamadasA(caminhoDasMensagens).length,
          1,
          reason:
              'REPROVA: com a foto pronta, o toque continuou nao postando. '
              'Entao o caso acima mediu um botao morto, e nao a guarda.',
        );
      },
    );

    testWidgets(
      'ISCA: o `Tentar de novo` da faixa tambem nao posta com a foto subindo',
      (tester) async {
        // A ENTRADA QUE NAO PASSA PELO BOTAO.
        //
        // `FaixaDeAviso.aoTocarNaAcao` chama `_enviar` direto, e o estado
        // desabilitado do botao de enviar nao alcanca esse toque. Medido:
        // desligar a guarda de DENTRO de `_enviar` deixava o caso do botao
        // verde, porque aquele caminho e protegido pelo `onPressed` nulo --
        // este caso e o que cobre o outro.
        //
        // O caminho e real: a mensagem falhou por rede, a faixa esta na tela,
        // a pessoa anexa uma foto e toca em `Tentar de novo` antes de o upload
        // terminar.
        var postagens = 0;
        var recusarAPrimeira = true;
        final porta = _Portao();
        addTearDown(porta.liberar);
        // UM manipulador so, que CONTA sempre. Trocar a entrada do mapa no meio
        // do caso perderia o contador junto com a resposta -- e foi isso que
        // deixou o contrapeso deste caso em zero na primeira medicao.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) {
              postagens += 1;
              if (recusarAPrimeira) return problema('rate-limited', 429);
              return json200(mensagem(papel: 'tutor'), status: 201);
            },
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(200 * 1024),
          armazenamento: _ArmazenamentoComPortao(porta),
        );
        await tester.enterText(find.byType(TextField), 'Está comigo');
        await tester.pump();

        // A PRIMEIRA FALHA, para a faixa existir: um `type` que nao e de
        // conversa fechada acende `_falhaDeEnvio`.
        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        await tester.pumpAndSettle();
        expect(
          find.text(MensagensDeErro.tentarDeNovo),
          findsOneWidget,
          reason:
              'REPROVA: a falha de envio nao acendeu a faixa com `Tentar de '
              'novo`. Sem ela este caso nao tem o controle que ele mede.',
        );

        // Agora a foto, com o portao segurando o upload.
        recusarAPrimeira = false;
        postagens = 0;
        await tester.tap(find.byTooltip(TextosDaFotoNaConversa.anexarFoto));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Escolher da galeria'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        // `ensureVisible` porque a faixa mora no FIM do `ListView` e a previa
        // de 220 dp a empurra para fora da janela: sem isto o toque erra o
        // alvo, e `warnIfMissed: false` esconderia esse erro -- o zero
        // passaria por o toque nao ter acontecido.
        await tester.ensureVisible(find.text(MensagensDeErro.tentarDeNovo));
        await tester.pump();
        await tester.tap(find.text(MensagensDeErro.tentarDeNovo));
        await tester.pump();
        expect(
          postagens,
          0,
          reason:
              'REPROVA: o `Tentar de novo` da faixa postou a mensagem COM A '
              'FOTO AINDA SUBINDO. Ela iria sem `photo_upload_id` e a foto '
              'ficaria orfa no armazenamento -- e este toque nao passa pelo '
              'botao de enviar, entao o `onPressed` nulo nao o protege.',
        );

        // CONTRAPESO: terminado o upload, o MESMO toque posta. Sem ele, o zero
        // acima passaria num `Tentar de novo` que nunca funciona.
        porta.liberar();
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text(MensagensDeErro.tentarDeNovo));
        await tester.pump();
        await tester.tap(find.text(MensagensDeErro.tentarDeNovo));
        await tester.pumpAndSettle();
        expect(
          postagens,
          1,
          reason:
              'REPROVA: com a foto pronta, o `Tentar de novo` continuou nao '
              'postando. Entao o caso acima mediu um botao morto.',
        );
      },
    );

    testWidgets(
      'ISCA: `photo-rejected` mostra O TEXTO DO SERVIDOR, e nao o generico da '
      'tela',
      (tester) async {
        // O SLUG E DO SERVIDOR, batizado na BICHUS-35 em 20/10/2026, e os dois
        // 409 da mesma anexacao sao indistinguiveis por status:
        //
        //   `photo-not-ready` -> espere e tente de novo com a MESMA foto;
        //   `photo-rejected`  -> escolha outra, esta nunca vai passar.
        //
        // E o `detail` carrega o motivo que o trabalhador de higiene gravou.
        // Reescrever aquelas frases no app seria a segunda copia da mesma
        // microcopy -- e e a copia que ninguem atualiza que fica na tela.
        const String doServidor =
            'Essa foto é uma animação. Envie uma imagem parada.';
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) => http.Response(
              jsonEncode(<String, dynamic>{
                'type': 'https://api.bichu.app/problems/photo-rejected',
                'title': 'Nao foi possivel concluir',
                'detail': doServidor,
                'status': 409,
              }),
              409,
              headers: const <String, String>{
                'content-type': 'application/problem+json; charset=utf-8',
              },
            ),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: ArmazenamentoDeTeste(),
        );
        await tester.enterText(find.byType(TextField), 'É ele mesmo');
        await tester.pumpAndSettle();
        await anexarDaGaleria(tester);

        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        await tester.pumpAndSettle();

        expect(
          textoDaTela(tester),
          contains('animação'),
          reason:
              'REPROVA: a tela escondeu o motivo do servidor atras do texto '
              'generico dela. A pessoa fica sem saber que o problema e a foto '
              'ser animada, e escolhe outro GIF.',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('Confira a conexão')),
          reason:
              'REPROVA: a recusa definitiva acendeu TAMBEM a faixa de falha de '
              'envio. Sao dois erros na tela para um problema, e o `Tentar de '
              'novo` daquela faixa devolveria a mesma recusa.',
        );
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason:
              'REPROVA: a recusa apagou a previa. A pessoa precisa ver QUAL '
              'foto foi recusada para escolher outra.',
        );
        expect(
          find.text(TextosDaFotoNaConversa.descartar),
          findsOneWidget,
          reason:
              'REPROVA: a recusa definitiva nao oferece descartar, e e a unica '
              'saida que resolve.',
        );
        // CONTRAPESO: o texto proprio da tela NAO aparece quando o servidor
        // mandou um. Sem ele, o caso acima passaria numa tela que mostra os
        // dois textos empilhados.
        expect(
          textoDaTela(tester),
          isNot(contains(TextosDaFotoNaConversa.aFotoFoiRecusada)),
          reason:
              'REPROVA: a tela mostrou o texto do servidor E o proprio. Duas '
              'frases para a mesma recusa, e uma delas e a copia que diverge.',
        );
      },
    );

    test('ISCA: os dois 409 da anexacao sao LIDOS SEPARADOS', () {
      // Sem este caso, os dois leitores poderiam reconhecer o mesmo slug e a
      // tela trataria recusa definitiva como "preparando" -- quatro esperas
      // numa foto que nunca vai passar.
      Problem problema(String slug) => Problem(
        tipo: ProblemTipo.deUri('https://api.bichu.app/problems/$slug'),
        tipoUri: 'https://api.bichu.app/problems/$slug',
        status: 409,
      );
      expect(fotoAindaNaoEstaPronta(problema('photo-not-ready')), isTrue);
      expect(
        fotoFoiRecusadaPeloServidor(problema('photo-not-ready')),
        isFalse,
        reason:
            'REPROVA: `photo-not-ready` foi lido como recusa definitiva. A '
            'pessoa leria "escolha outra foto" sobre uma que ia passar em dois '
            'segundos.',
      );
      expect(fotoFoiRecusadaPeloServidor(problema('photo-rejected')), isTrue);
      expect(
        fotoAindaNaoEstaPronta(problema('photo-rejected')),
        isFalse,
        reason:
            'REPROVA: `photo-rejected` foi lido como "ainda nao esta pronta". '
            'A tela gastaria as quatro esperas numa foto que nunca vai passar, '
            'e terminaria dizendo "nao foi enviada" sem o motivo.',
      );
      // CONTRAPESO: um slug de outra coisa nao e nenhum dos dois.
      expect(fotoAindaNaoEstaPronta(problema('rate-limited')), isFalse);
      expect(fotoFoiRecusadaPeloServidor(problema('rate-limited')), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('(6) a barra de progresso mede BYTES, e mede de verdade', () {
    test(
      'ISCA: o mecanismo chama o progresso VARIAS vezes, crescendo, ate o '
      'total',
      () async {
        // A MEDICAO QUE DECIDE SE A BARRA E HONESTA. Antes desta historia o
        // envio mandava o corpo inteiro num evento so (`bodyBytes` no `PUT`,
        // `MultipartFile.fromBytes` no `POST`): o progresso saltaria de 0 para
        // o total num passo, o que e tecnicamente uma medicao e na tela e
        // indistinguivel de uma barra que nao mede.
        //
        // 200 KiB dividido em pedacos de 64 KiB da quatro chamadas depois do
        // zero. Um arquivo pequeno deixaria este caso verde com a
        // implementacao antiga.
        const int tamanho = 200 * 1024;
        final camera = cameraComFotoDe(tamanho);
        final armazenamento = ArmazenamentoDeTeste();
        final envio = EnvioDeFoto(
          camera: camera,
          cliente: armazenamento.cliente,
        );
        addTearDown(envio.fechar);

        final medidas = <({int enviados, int total})>[];
        final desfecho = await envio.enviar(
          foto: camera.foto!,
          destino: EnvioParaConfirmarDepois(
            pedir: ({
              required String tipoDeConteudo,
              required int tamanhoEmBytes,
            }) => IntencaoDeTeste().intencaoDeFotoDoAchado(
              foundReportId: idDoAviso,
              tipoDeConteudo: tipoDeConteudo,
              tamanhoEmBytes: tamanhoEmBytes,
            ),
          ),
          aoProgredir: (int enviados, int total) =>
              medidas.add((enviados: enviados, total: total)),
        );

        expect(desfecho, DesfechoDoEnvio.enviada);
        expect(
          medidas.length,
          greaterThan(2),
          reason:
              'REPROVA: o progresso foi anunciado ${medidas.length} vez(es) '
              'para 200 KiB. Com pedacos de 64 KiB tem de haver o zero inicial '
              'mais um aviso por pedaco; uma chamada so (ou duas) significa que '
              'o corpo voltou a sair num evento unico, e a barra saltaria de 0 '
              'a 100 num passo.',
        );
        expect(
          medidas.first,
          (enviados: 0, total: tamanho),
          reason:
              'REPROVA: o primeiro aviso nao e o zero com o TOTAL. Sem ele a '
              'tela nao tem denominador para escrever "0 KB de 200 KB", e um '
              'retangulo sem numero no comeco e o que esta historia proibiu.',
        );
        expect(
          medidas.last.enviados,
          tamanho,
          reason: 'REPROVA: o progresso nao chegou ao total.',
        );
        for (var i = 1; i < medidas.length; i += 1) {
          expect(
            medidas[i].enviados,
            greaterThan(medidas[i - 1].enviados),
            reason:
                'REPROVA: o aviso $i nao cresceu em relacao ao anterior '
                '(${medidas[i - 1].enviados} -> ${medidas[i].enviados}). Barra '
                'que anda para tras nao e medicao.',
          );
          expect(medidas[i].total, tamanho);
        }
      },
    );

    testWidgets(
      'ISCA: a previa escreve O PAR DE NUMEROS e a barra tem valor medido '
      '(nem nulo, nem cheio)',
      (tester) async {
        // O portao segura o armazenamento depois de alguns pedacos, entao a
        // tela e lida COM O ENVIO EM CURSO -- que e o unico instante em que a
        // barra existe.
        final porta = _Portao();
        addTearDown(porta.liberar);
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(200 * 1024),
          armazenamento: _ArmazenamentoComPortao(porta),
        );
        // A legenda entra ANTES: com o campo vazio a previa escreve "escreva
        // uma legenda" em vez de "foto pronta", e o contrapeso do fim deste
        // caso le essa frase.
        await tester.enterText(find.byType(TextField), 'Está comigo');
        await tester.pump();
        await tester.tap(find.byTooltip(TextosDaFotoNaConversa.anexarFoto));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Escolher da galeria'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains(' de 200 KB'),
          reason:
              'REPROVA: a barra nao escreveu o TOTAL em bytes. O cliente '
              'pediu progresso real: um numero sozinho nao diz se falta muito, '
              'e e o par que transforma a barra em informacao.\n'
              'O que a tela diz:\n$texto',
        );
        expect(
          texto,
          contains('KB de '),
          reason:
              'REPROVA: a barra nao escreveu quanto JA FOI. Ver acima: os '
              'dois numeros, sempre.',
        );

        final barra = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator),
        );
        expect(
          barra.value,
          isNotNull,
          reason:
              'REPROVA: a barra ficou INDETERMINADA com total conhecido. O '
              'indeterminado e a saida honesta para quando nao ha numero, e '
              'aqui ha.',
        );
        expect(
          barra.value,
          greaterThan(0),
          reason:
              'REPROVA: a barra esta em zero com pedacos ja entregues. Entao '
              'ela nao esta ligada na contagem do envio.',
        );
        expect(
          barra.value,
          lessThan(1),
          reason:
              'REPROVA: a barra esta cheia com o armazenamento ainda sem '
              'responder. Barra que enche sozinha e a barra que anima sem medir '
              '-- e e exatamente ela que esta proibida aqui.',
        );

        // O PORTAO E ABERTO AQUI, e nao no `tearDown`: `EnvioDeFoto` arma um
        // `timeout` de 60 s na requisicao, e o relogio falso do teste o
        // conta como temporizador vivo. O `tearDown` roda DEPOIS da
        // conferencia de invariantes, entao abrir ali reprovaria com "A Timer
        // is still pending" -- uma falha que nao fala do que o caso mede.
        porta.liberar();
        await tester.pumpAndSettle();
        // CONTRAPESO: liberado o portao, a barra SOME e a foto fica pronta.
        // Sem ele, os tres `expect` acima passariam numa tela que nunca sai do
        // estado de envio.
        expect(
          find.byType(LinearProgressIndicator),
          findsNothing,
          reason:
              'REPROVA: a barra continuou na tela depois de o armazenamento '
              'responder 204. Entao ela nao esta ligada no desfecho do envio, e '
              'os valores medidos acima nao sao de um envio em curso -- sao de '
              'uma barra parada.',
        );
        expect(
          textoDaTela(tester),
          contains('Foto pronta para enviar'),
          reason: 'REPROVA: o envio terminou e a tela nao disse que terminou.',
        );
      },
    );

    test('ISCA: `progressoEmBytes` escreve os dois numeros, em pt-BR', () {
      expect(progressoEmBytes(1258291, 3565158), '1,2 MB de 3,4 MB');
      expect(
        progressoEmBytes(0, 200 * 1024),
        '0 KB de 200 KB',
        reason: 'o zero sai como zero, e com o total do lado',
      );
      expect(
        bytesLegiveis(300),
        '1 KB',
        reason:
            'REPROVA: 300 bytes sairam como `0 KB`. Zero leria como "nada", e '
            'o que ha nao e nada.',
      );
      expect(
        progressoEmBytes(1024, 0),
        '1 KB',
        reason:
            'REPROVA: um total ausente virou denominador. `de 0 MB` e um '
            'denominador que nao existe.',
      );
      // CONTRAPESO: a virgula e de verdade, e nao o ponto do `toStringAsFixed`.
      expect(
        progressoEmBytes(1258291, 3565158),
        isNot(contains('.')),
        reason: 'REPROVA: o numero saiu com ponto decimal. O produto e pt-BR.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(7) a higiene assincrona: "preparando a foto", e com fim', () {
    testWidgets(
      'ISCA: a recusa de foto nao pronta vira "preparando" e TENTA DE NOVO, '
      'sem perder a previa',
      (tester) async {
        // A corrida existe: os bytes sobem na ESCOLHA, entao no toque em
        // Enviar a derivada sem metadado em geral ja esta pronta. Este caso
        // cobre a vez em que ela nao esta -- e o que ele proibe e a tela dizer
        // "nao foi enviada" sobre uma foto que ia subir meio segundo depois.
        var tentativas = 0;
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) {
              tentativas += 1;
              if (tentativas == 1) return problema('photo-not-ready', 409);
              return json200(<String, dynamic>{
                ...mensagem(papel: 'tutor', corpo: 'É ele mesmo'),
                'photo_url': urlDaFotoDaMensagem,
              }, status: 201);
            },
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: ArmazenamentoDeTeste(),
        );
        await tester.enterText(find.byType(TextField), 'É ele mesmo');
        await tester.pumpAndSettle();
        await anexarDaGaleria(tester);

        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        // **`pump` e nunca `pumpAndSettle` enquanto a espera corre.** O estado
        // "preparando" desenha um `CircularProgressIndicator` indeterminado,
        // que anima para sempre: `pumpAndSettle` nunca assentaria, e a falha
        // diria "pumpAndSettle timed out" em vez de falar do que o caso mede.
        await tester.pump();
        await tester.pump();
        expect(
          textoDaTela(tester),
          contains('Preparando a foto'),
          reason:
              'REPROVA: a recusa por higiene em curso nao virou "preparando a '
              'foto". Ela nao e defeito e nao e definitiva, e "a mensagem nao '
              'foi enviada" manda a pessoa desistir de uma foto que ia subir.',
        );
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason: 'REPROVA: a previa se perdeu no meio da espera.',
        );

        // A espera e crescente e tem fim; 400 ms e a primeira. Os `pump`
        // intercalados existem para a segunda tentativa e a resposta dela
        // atravessarem: cada `pump` escoa as microtarefas pendentes.
        await tester.pump(const Duration(seconds: 1));
        for (var i = 0; i < 4; i += 1) {
          await tester.pump();
        }

        expect(
          tentativas,
          2,
          reason:
              'REPROVA: a tela nao tentou de novo depois da espera, ou tentou '
              'mais de uma vez por espera. Houve $tentativas tentativa(s).',
        );
        expect(
          find.byType(PreviaDaFotoDaConversa, skipOffstage: false),
          findsNothing,
          reason:
              'REPROVA: a segunda tentativa deu 201 e a previa ficou. Ver o '
              'contrapeso do grupo (5).',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('Preparando a foto')),
          reason: 'REPROVA: a tela ficou em "preparando" depois do 201.',
        );
      },
    );

    testWidgets(
      'ISCA: a espera ACABA, e ai a tela diz que nao foi -- com a previa e o '
      'texto preservados',
      (tester) async {
        // Um laco sem teto deixaria a tela em "preparando" para sempre numa
        // falha que nao e temporaria. A saida honesta e dizer que nao foi,
        // preservando previa e texto para o toque da pessoa.
        var tentativas = 0;
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            caminhoDaConversa: (_) => json200(conversaComAviso()),
            caminhoDasMensagens: (_) {
              tentativas += 1;
              return problema('photo-not-ready', 409);
            },
          },
        );
        await abrirAConversa(
          tester,
          servidor: servidor,
          camera: cameraComFotoDe(bytesDeFotoDeTeste.length),
          armazenamento: ArmazenamentoDeTeste(),
        );
        await tester.enterText(find.byType(TextField), 'É ele mesmo');
        await tester.pumpAndSettle();
        await anexarDaGaleria(tester);

        await tester.tap(find.byTooltip(TextosDasMensagens.enviar));
        // Soma das esperas: 6,4 s. Quinze segundos em passos de 500 ms passam
        // de todas elas, e cada passo escoa as microtarefas da tentativa.
        //
        // **`pump` e nunca `pumpAndSettle`**: o estado "preparando" desenha um
        // indicador indeterminado, que anima para sempre.
        await tester.pump();
        for (var i = 0; i < 30; i += 1) {
          await tester.pump(const Duration(milliseconds: 500));
        }

        expect(
          tentativas,
          5,
          reason:
              'REPROVA: houve $tentativas tentativa(s), e o desenho e a '
              'primeira mais as quatro esperas. Mais que isso e laco sem teto; '
              'menos, e desistir antes da janela em que a derivada fica pronta.',
          );
        expect(
          textoDaTela(tester),
          contains('não foi enviada'),
          reason:
              'REPROVA: esgotadas as esperas, a tela nao disse que a mensagem '
              'nao foi. Ficar em "preparando" para sempre e a tela mentindo com '
              'uma animacao.',
        );
        expect(
          find.byType(PreviaDaFotoDaConversa),
          findsOneWidget,
          reason: 'REPROVA: a previa se perdeu quando a espera acabou.',
        );
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller?.text,
          'É ele mesmo',
          reason:
              'REPROVA: o texto se perdeu. Nenhum caminho de falha desta tela '
              'limpa o campo -- o `clear` acontece uma vez, depois do 201.',
        );
      },
    );
  });
}

// ---------------------------------------------------------------------------
// O PORTAO: um armazenamento que para no meio do upload
// ---------------------------------------------------------------------------

/// Um portao que segura a resposta do armazenamento ate o caso liberar.
///
/// Existe porque a barra de progresso **so existe durante o envio**: medi-la
/// depois mediria a tela de "pronta". E porque o `MockClient` comum le o corpo
/// inteiro antes de chamar o manipulador -- `MockClient.streaming` e o que
/// permite consumir alguns pedacos e parar.
class _Portao {
  final Completer<void> _completo = Completer<void>();

  Future<void> get espera => _completo.future;

  void liberar() {
    if (!_completo.isCompleted) _completo.complete();
  }
}

/// Consome alguns pedacos do corpo e PARA, ate o portao abrir.
class _ArmazenamentoComPortao extends ArmazenamentoDeTeste {
  _ArmazenamentoComPortao(this._portao);

  final _Portao _portao;

  @override
  http.Client get cliente => MockClient.streaming((req, corpo) async {
    requisicoes += 1;
    // Dois pedacos e para. Com `toBytes()` o corpo inteiro seria consumido
    // antes de a tela repintar, e a barra estaria em 100%.
    var lidos = 0;
    final assinatura = corpo.listen(null);
    assinatura.onData((List<int> pedaco) {
      lidos += pedaco.length;
      bytesRecebidos = lidos;
      if (lidos >= 128 * 1024) assinatura.pause(_portao.espera);
    });
    await _portao.espera;
    await assinatura.asFuture<void>();
    return http.StreamedResponse(const Stream<List<int>>.empty(), 204);
  });
}

/// Os bytes de teste, como `Uint8List`, para os casos que comparam corpo.
Uint8List get bytesDeTesteEmLista => Uint8List.fromList(bytesDeFotoDeTeste);
