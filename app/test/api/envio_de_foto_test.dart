// O caminho de bytes do app: um mecanismo, dois destinos.
//
// O QUE ESTE ARQUIVO EXISTE PARA PEGAR, e o motivo e um defeito real de
// 22/09/2026: **a funcao existia, ninguem a chamava, e nada acusava.**
// `PetsApi.intencaoDeFotoDoPet` foi escrita na BICHUS-62 e ficou meses sem
// nenhum chamador; a suite inteira continuou verde, porque toda ela media
// tela, texto e traducao de erro, e nenhum caso perguntava se algum byte
// tinha saido do aparelho.
//
// Por isso os casos daqui **contam requisicoes**, e nao chamadas de metodo. Um
// caso que afirme "o mecanismo chama `pedirAutorizacao`" fica verde com o furo
// inteiro de pe -- basta o terceiro passo sumir, ou o segundo, e o contador de
// pedidos ao armazenamento continua sem ser olhado. O que se mede aqui e o
// efeito: quantos pedidos sairam, para onde, com que corpo.
//
// A SEGUNDA ISCA e a copia. A foto do pet e a foto do achado avulso sao a
// mesma ideia, e escrever um envio para cada uma e o jeito conhecido de os
// dois divergirem -- um lendo `method` e o outro presumindo `POST`. Os casos
// de `um mecanismo, dois destinos` abaixo montam os DOIS sobre a MESMA
// instancia de `EnvioDeFoto` e cobram que o passo do meio seja identico. Se
// alguem escrever um segundo caminho de bytes, ele nao passa por aqui, e o
// caso `o envio dos bytes nao sabe de quem e a foto` deixa de ter sentido.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/achados_api.dart';
import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/pets_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'http://localhost:3000';

/// O armazenamento fica em **outro host**, como em producao. Nao e detalhe de
/// cenario: e o que torna verificavel a regra de que o token da sessao nao
/// acompanha os bytes.
const String _armazenamento = 'https://objetos.exemplo.test/bichu-privado';

final List<int> _bytesDaFoto = utf8.encode('bytes-da-foto-de-nina-22-09');

const FotoLocal _foto = FotoLocal(
  caminho: '/tmp/nina.jpg',
  tipoDeConteudo: 'image/jpeg',
  tamanhoEmBytes: 27,
);

/// A camera reduzida ao que o envio usa: entregar os bytes do arquivo.
class _CameraComFoto implements CameraEGaleria {
  _CameraComFoto({this.arquivoSumiu = false, this.arquivoVazio = false});

  final bool arquivoSumiu;

  /// O arquivo ABRE e tem zero byte -- seletor interrompido no meio da copia.
  /// Causa diferente de [arquivoSumiu], e e por isso que o motivo e outro.
  final bool arquivoVazio;
  int vezesQueLeuOsBytes = 0;

  @override
  Future<EstadoDaPermissao> estadoDaCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<EstadoDaPermissao> pedirCamera() async =>
      EstadoDaPermissao.indisponivel;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<FotoLocal?> tirarFoto() async => _foto;

  @override
  Future<FotoLocal?> escolherDaGaleria() async => _foto;

  @override
  Future<Uint8List> bytesDaFoto(FotoLocal foto) async {
    vezesQueLeuOsBytes += 1;
    if (arquivoSumiu) {
      throw const FileSystemException('o arquivo sumiu do aparelho');
    }
    if (arquivoVazio) return Uint8List(0);
    return Uint8List.fromList(_bytesDaFoto);
  }

  /// **Estoura de proposito.** Este arquivo mede o ENVIO, e o envio nunca
  /// recorta: quem recorta e a folha de ajuste, antes de a foto chegar aqui.
  /// Devolver a foto intacta deixaria passar verde um envio que tivesse
  /// comecado a recortar por conta propria.
  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    throw StateError('o envio nao recorta foto; quem recorta e a folha');
  }
}

/// O que o caso montou: as pecas de verdade, mais a lista do que saiu na rede.
class _Bancada {
  _Bancada({
    required this.pets,
    required this.achados,
    required this.envio,
    required this.camera,
    required this.pedidos,
  });

  final PetsApi pets;
  final AchadosApi achados;
  final EnvioDeFoto envio;
  final _CameraComFoto camera;

  /// **O contador que sustenta as iscas deste arquivo.** Toda requisicao que
  /// de fato saiu, na ordem.
  final List<http.Request> pedidos;

  Iterable<http.Request> get aoArmazenamento =>
      pedidos.where((p) => p.url.toString().startsWith(_armazenamento));

  Iterable<http.Request> get aApi =>
      pedidos.where((p) => p.url.host == 'localhost');
}

/// Monta o caminho inteiro: `ApiClient` de verdade, `PetsApi` de verdade,
/// `AchadosApi` de verdade, `EnvioDeFoto` de verdade.
///
/// Nenhum duble no meio de proposito: um duble de `PetsApi` aqui deixaria o
/// caso verde no dia em que a rota da intencao mudasse de caminho, que e
/// justamente o que um teste de envio precisa pegar.
_Bancada _montar({
  required Future<http.Response> Function(http.Request) rede,
  _CameraComFoto? camera,
}) {
  AppConfig.limparParaTeste();
  final pedidos = <http.Request>[];
  final cliente = MockClient((requisicao) async {
    pedidos.add(requisicao);
    return rede(requisicao);
  });
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-da-sessao',
  );
  final cameraEmUso = camera ?? _CameraComFoto();
  return _Bancada(
    pets: PetsApi(api),
    achados: AchadosApi(api),
    envio: EnvioDeFoto(camera: cameraEmUso, cliente: cliente),
    camera: cameraEmUso,
    pedidos: pedidos,
  );
}

/// `UploadIntent` do contrato, na forma `POST` com politica de formulario.
Map<String, dynamic> _autorizacaoPost({String uploadId = 'up-1'}) {
  return <String, dynamic>{
    'upload_id': uploadId,
    'method': 'POST',
    'url': _armazenamento,
    'fields': <String, String>{
      'key': 'privado/pets/abc.jpg',
      'Content-Type': 'image/jpeg',
      'policy': 'politica-assinada',
      'x-amz-signature': 'assinatura',
    },
    'expires_at': '2026-09-22T18:30:00Z',
    'max_bytes': 10485760,
  };
}

/// O mesmo contrato, na forma `PUT` com cabecalhos assinados.
Map<String, dynamic> _autorizacaoPut({String uploadId = 'up-1'}) {
  return <String, dynamic>{
    'upload_id': uploadId,
    'method': 'PUT',
    'url': '$_armazenamento/privado/pets/abc.jpg',
    'headers': <String, String>{
      'Content-Type': 'image/jpeg',
      'x-amz-date': '20260922T180000Z',
      'Authorization': 'AWS4-HMAC-SHA256 Credential=assinatura-do-servidor',
    },
    'expires_at': '2026-09-22T18:30:00Z',
  };
}

http.Response _json(Map<String, dynamic> corpo, {int status = 201}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json'},
  );
}

void main() {
  group('os bytes saem do aparelho', () {
    test('a foto do pet vira UM pedido ao armazenamento, com os bytes dentro',
        () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 204);
          }
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return _json(_autorizacaoPost());
          }
          return http.Response('', 202);
        },
      );

      final desfecho = await bancada.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
      );

      expect(desfecho, DesfechoDoEnvio.enviada);
      expect(
        bancada.camera.vezesQueLeuOsBytes,
        1,
        reason: 'REPROVA: o envio nao leu o arquivo. Um pedido que saia sem '
            'passar por aqui esta mandando outra coisa que nao a foto.',
      );

      // **A pergunta que importa, e ela e sobre efeito e nao sobre chamada.**
      expect(
        bancada.aoArmazenamento.length,
        1,
        reason: 'REPROVA: nenhum pedido chegou ao armazenamento, ou chegou '
            'mais de um. Este numero e o unico que separa "o app envia a '
            'foto" de "o app tem uma funcao que envia a foto e ninguem a '
            'chama", que foi o estado real do produto ate 22/09/2026.',
      );

      final corpo = bancada.aoArmazenamento.single.bodyBytes;
      expect(
        _contem(corpo, _bytesDaFoto),
        isTrue,
        reason: 'REPROVA: o pedido saiu sem os bytes da foto dentro. Um '
            'multipart com os campos assinados e sem o arquivo sobe um objeto '
            'vazio, e o servidor responde 204 do mesmo jeito.',
      );
    });

    test('os tres passos acontecem, na ordem, e o corpo de cada um e o do '
        'contrato', () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 204);
          }
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return _json(_autorizacaoPost(uploadId: 'up-42'));
          }
          return http.Response('', 202);
        },
      );

      await bancada.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
      );

      final caminhos =
          bancada.pedidos.map((p) => '${p.method} ${p.url.path}').toList();

      expect(caminhos.length, 3,
          reason: 'REPROVA: o envio deixou de ter tres passos. Sem a '
              'confirmacao a foto fica no armazenamento e fora do pet, e o '
              'produto nao depende de notificacao de bucket para saber disso.');
      expect(caminhos.first, 'POST /v1/media/pet-photo-intents');
      expect(caminhos.last, 'POST /v1/pets/pet-1/photos');

      final intencao = jsonDecode(bancada.aApi.first.body) as Map<String, dynamic>;
      expect(intencao['pet_id'], 'pet-1');
      expect(intencao['content_type'], 'image/jpeg');
      expect(
        intencao['byte_size'],
        _bytesDaFoto.length,
        reason: 'REPROVA: o tamanho declarado nao e o dos bytes que vao subir. '
            'A politica assinada carrega esse teto, e um numero que nao bate '
            'faz o armazenamento recusar DEPOIS de o upload inteiro sair.',
      );

      final confirmacao =
          jsonDecode(bancada.aApi.last.body) as Map<String, dynamic>;
      expect(confirmacao['upload_id'], 'up-42');
    });

    test('a credencial da sessao NAO acompanha os bytes', () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 204);
          }
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return _json(_autorizacaoPost());
          }
          return http.Response('', 202);
        },
      );

      await bancada.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
      );

      // O cenario nao e cego: a chamada de intencao, que vai para a NOSSA
      // API, leva o token. Sem esta metade o caso ficaria verde tambem num
      // app que nunca autentica nada.
      expect(
        bancada.aApi.first.headers['authorization'],
        'Bearer token-da-sessao',
        reason: 'REPROVA: a chamada de intencao saiu sem token. O caso de '
            'baixo perde o sentido se nenhuma requisicao deste app autentica.',
      );

      final cabecalhos = bancada.aoArmazenamento.single.headers.keys
          .map((k) => k.toLowerCase())
          .toSet();
      expect(
        cabecalhos.contains('authorization'),
        isFalse,
        reason: 'REPROVA: o token da sessao saiu junto dos bytes para um host '
            'que um campo de resposta nomeou. `ApiClient.baixarImagem` recusa '
            'host diferente exatamente por isto; aqui o host diferente e o '
            'desenho, e o que nao pode ir junto e a credencial.',
      );
    });

    test('`method` e LIDO: `PUT` sai como PUT, com os cabecalhos assinados '
        'sem alterar', () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 200);
          }
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return _json(_autorizacaoPut());
          }
          return http.Response('', 202);
        },
      );

      await bancada.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
      );

      final envio = bancada.aoArmazenamento.single;
      expect(
        envio.method,
        'PUT',
        reason: 'REPROVA: o cliente presumiu POST. O contrato declara os dois '
            'para que a troca de provedor de armazenamento seja configuracao '
            'do servidor, e nao versao nova do app -- e versao antiga do app '
            'nunca some do bolso de ninguem.',
      );
      expect(
        envio.headers['x-amz-date'],
        '20260922T180000Z',
        reason: 'REPROVA: um cabecalho assinado nao chegou. Qualquer diferenca '
            'invalida a assinatura, e o armazenamento responde 403 sem dizer '
            'qual campo.',
      );
      expect(
        envio.bodyBytes,
        _bytesDaFoto,
        reason: 'REPROVA: no caminho PUT o corpo e o arquivo cru. Um multipart '
            'aqui sobe o delimitador junto com a imagem.',
      );
    });
  });

  group('um mecanismo, dois destinos', () {
    Future<_Bancada> enviarComDestino(
      DestinoDaFoto Function(_Bancada) destino,
    ) async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 204);
          }
          if (requisicao.url.path.contains('-photo-intents')) {
            return _json(_autorizacaoPost(uploadId: 'up-7'));
          }
          return http.Response('', 202);
        },
      );
      await bancada.envio.enviar(foto: _foto, destino: destino(bancada));
      return bancada;
    }

    test('o envio dos bytes nao sabe de quem e a foto: o passo do meio e '
        'identico nos dois', () async {
      final doPet = await enviarComDestino(
        (b) => FotoDePet(api: b.pets, petId: 'pet-1'),
      );
      final doAchado = await enviarComDestino(
        (b) => FotoDeAchado(api: b.achados, foundReportId: 'achado-1'),
      );

      for (final bancada in <_Bancada>[doPet, doAchado]) {
        expect(bancada.aoArmazenamento.length, 1);
      }

      final a = doPet.aoArmazenamento.single;
      final b = doAchado.aoArmazenamento.single;
      expect(a.method, b.method);
      expect(a.url, b.url);
      expect(
        a.bodyBytes.length,
        b.bodyBytes.length,
        reason: 'REPROVA: os dois destinos produziram corpos de tamanhos '
            'diferentes para a mesma foto e a mesma autorizacao. Isso so '
            'acontece se existirem dois caminhos de bytes -- e a segunda copia '
            'e o que diverge.',
      );
    });

    test('a intencao do achado manda `found_report_id`, e nao `pet_id`',
        () async {
      final bancada = await enviarComDestino(
        (b) => FotoDeAchado(api: b.achados, foundReportId: 'achado-1'),
      );

      final intencao = bancada.aApi.single;
      expect(intencao.url.path, '/v1/media/found-report-photo-intents');
      final corpo = jsonDecode(intencao.body) as Map<String, dynamic>;
      expect(corpo['found_report_id'], 'achado-1');
      expect(corpo.containsKey('pet_id'), isFalse);
    });

    test('o achado NAO confirma, e isso e o contrato e nao esquecimento',
        () async {
      final bancada = await enviarComDestino(
        (b) => FotoDeAchado(api: b.achados, foundReportId: 'achado-1'),
      );

      expect(
        bancada.aApi.length,
        1,
        reason: 'REPROVA: saiu uma segunda chamada a nossa API depois dos '
            'bytes do achado. Nao existe `confirmFoundReportPhoto` no '
            'contrato: a intencao do achado ja nasce amarrada ao aviso no '
            'servidor. Uma confirmacao aqui so pode estar chamando a rota do '
            'PET, e ai a foto de um achado entra na lista de fotos de um pet.',
      );
      expect(
        bancada.aoArmazenamento.length,
        1,
        reason: 'REPROVA: o achado deixou de subir bytes. Sem confirmacao o '
            'segundo passo e o ULTIMO, e nao o desnecessario.',
      );
    });
  });

  group('os tres desfechos, e eles levam a telas diferentes', () {
    test('sem sinal no envio dos bytes: `semSinal`, e nao `recusada`',
        () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            throw http.ClientException('sem rota para o host');
          }
          return _json(_autorizacaoPost());
        },
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.semSinal,
        reason: 'REPROVA: falta de rede virou recusa. Sao telas diferentes: '
            'sem sinal a pessoa tenta de novo daqui a pouco e funciona.',
      );
    });

    test('o armazenamento recusa: `recusada`, e tentar de novo nao resolve',
        () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            // A politica assinada recusa o que esta fora dela. O
            // armazenamento nao fala RFC 9457 e nao ha `type` para decidir.
            return http.Response('<Error>AccessDenied</Error>', 403);
          }
          return _json(_autorizacaoPost());
        },
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );
    });

    test('o arquivo sumiu do aparelho: recusa, e nenhum byte sai', () async {
      final camera = _CameraComFoto(arquivoSumiu: true);
      final bancada = _montar(
        rede: (_) async => _json(_autorizacaoPost()),
        camera: camera,
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );
      expect(camera.vezesQueLeuOsBytes, 1);
      expect(
        bancada.pedidos,
        isEmpty,
        reason: 'REPROVA: o app pediu autorizacao de upload para um arquivo '
            'que nao existe mais. A intencao conta contra o teto de chamadas '
            'da conta (20/h) e contra o teto de tres fotos por achado, e '
            'gastar cota por um arquivo que sumiu e gastar o que a proxima '
            'foto vai precisar.',
      );
    });

    test('a autorizacao veio sem `url`: recusa alta, e nenhum byte sai',
        () async {
      final bancada = _montar(
        rede: (_) async => _json(<String, dynamic>{'upload_id': 'up-1'}),
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );
      expect(bancada.aoArmazenamento, isEmpty);
    });
  });

  // ---------------------------------------------------------------------------
  // O CORPO REAL DA HOMOLOGACAO, LITERAL
  // ---------------------------------------------------------------------------
  //
  // **Este grupo existe porque tres rodadas de diagnostico foram gastas numa
  // hipotese que nenhum teste podia confirmar nem negar.** Em 30/10/2026 o
  // envio de foto estava bloqueado em homologacao, a intencao saia 201, nenhum
  // byte chegava ao armazenamento, e a suspeita caiu na assinatura V4 do
  // dialeto `goog`. A assinatura estava CERTA -- medida contra o GCS de
  // verdade, 204 em todos os caminhos --, e o que faltava era um caso que
  // perguntasse a outra metade: **o app consegue LER o que o servidor emite?**
  //
  // O corpo abaixo nao foi escrito a mao. Ele foi emitido pelo adaptador
  // COMPILADO que a hml roda, em 30/10/2026 13:42:04Z, com o mapeamento de
  // `comoAutorizacao` da propria imagem implantada, e colado aqui LITERAL.
  // Um corpo montado a mao mediria o que quem escreve o teste imagina que o
  // servidor manda -- que e exatamente o ponto cego que custou as tres
  // rodadas.
  //
  // A chave, a credencial e a assinatura sao de homologacao e ja venceram
  // (`expires_at` de dez minutos, em 30/10). Nao ha segredo aqui: a politica
  // assinada e publica por desenho -- ela viaja no formulario, pelo aparelho
  // de quem envia.
  group('o corpo REAL da homologacao e consumido pelo app', () {
    test('`doJson` le o 201 da hml sem estourar, e nada se perde no caminho',
        () async {
      final json = jsonDecode(_corpoRealDaHml) as Map<String, dynamic>;

      // A pergunta (A) das tres rodadas: o corpo decodifica? Se `doJson`
      // estourar aqui, o defeito e NOSSO e e de contrato -- o servidor emite
      // 201 com algo que o app nao le, e a tela mostra "a foto nao foi
      // aceita" apontando para o armazenamento.
      final autorizacao = AutorizacaoDeEnvio.doJson(json);

      expect(autorizacao.metodo, 'POST');
      expect(autorizacao.url.host, 'storage.googleapis.com');
      expect(autorizacao.uploadId, isNotEmpty);
      expect(autorizacao.maxBytes, 5242880);

      // Os SETE campos assinados, por nome. O GCS recusa o envio inteiro se
      // faltar um deles, e recusa tambem se chegar um campo que a politica nao
      // declara -- a simetria e o contrato.
      expect(
        autorizacao.campos.keys.toSet(),
        <String>{
          'key',
          'Content-Type',
          'x-goog-algorithm',
          'x-goog-credential',
          'x-goog-date',
          'policy',
          'x-goog-signature',
        },
        reason: 'REPROVA: o app perdeu ou inventou campo do formulario '
            'assinado. Qualquer diferenca aqui e 403 SignatureDoesNotMatch no '
            'armazenamento, e a tela mostra uma recusa que nao distingue '
            'isso de arquivo ilegivel.',
      );

      // O dialeto. `x-amz-*` aqui significa que a hml voltou a assinar no
      // dialeto da API S3 contra o armazenamento gerenciado, que e 403 no
      // primeiro envio.
      expect(autorizacao.campos['x-goog-algorithm'], 'GOOG4-HMAC-SHA256');
      expect(
        autorizacao.campos['x-goog-credential'],
        contains('/storage/goog4_request'),
      );
    });

    test('o multipart leva os sete campos assinados, e o `file` por ULTIMO',
        () async {
      final json = jsonDecode(_corpoRealDaHml) as Map<String, dynamic>;
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.host == 'storage.googleapis.com') {
            return http.Response('', 204);
          }
          return _json(json);
        },
      );

      final destino = EnvioParaConfirmarDepois(
        pedir: ({
          required String tipoDeConteudo,
          required int tamanhoEmBytes,
        }) async =>
            json,
      );

      expect(
        await bancada.envio.enviar(foto: _foto, destino: destino),
        DesfechoDoEnvio.enviada,
      );
      // Filtrado pelo host REAL do corpo da hml, e nao por `aoArmazenamento`:
      // aquele atalho casa com o armazenamento ficticio dos outros casos.
      final aoGcs = bancada.pedidos
          .where((p) => p.url.host == 'storage.googleapis.com')
          .toList();
      expect(aoGcs.length, 1);

      final corpo = utf8.decode(aoGcs.single.bodyBytes, allowMalformed: true);

      for (final campo in (json['fields'] as Map<String, dynamic>).keys) {
        expect(
          corpo,
          contains('name="$campo"'),
          reason: 'REPROVA: o campo assinado `$campo` nao saiu no multipart. '
              'A politica declara todos os campos do formulario, e o '
              'armazenamento recusa o envio inteiro quando falta um.',
        );
      }

      // **`file` por ULTIMO, e isso e normativo.** A politica de POST ignora
      // o que vier depois do arquivo, entao um campo assinado emitido apos
      // ele simplesmente nao chega -- e o sintoma e o mesmo 403.
      expect(
        corpo.indexOf('name="file"'),
        greaterThan(corpo.indexOf('name="x-goog-signature"')),
        reason: 'REPROVA: o arquivo saiu antes de algum campo assinado.',
      );

      expect(
        destino.uploadId,
        json['upload_id'],
        reason: 'REPROVA: o `upload_id` nao foi guardado, e o `Salvar` do '
            'formulario nao tem o que confirmar.',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // O CAMINHO TEM DE SER DISTINGUIVEL
  // ---------------------------------------------------------------------------
  //
  // **A isca do defeito que custou tres rodadas.** `DesfechoDoEnvio.recusada`
  // cobria quatro causas, e a tela dizia "a foto nao foi aceita" para todas --
  // inclusive quando quem recusou foi a NOSSA rota de intencao. O diagnostico
  // foi para a assinatura V4 do armazenamento, que estava certa, e o custo foi
  // uma chave HMAC rotacionada sem motivo e a antiga quase desativada.
  //
  // Os casos abaixo cobram que cada causa tenha motivo PROPRIO. O desfecho
  // continua sendo tres valores, porque a frase da pessoa nao precisa de mais;
  // o que nao pode voltar a ser indistinguivel e o caminho.
  group('cada causa tem motivo proprio, e o registro diz qual', () {
    test('arquivo que nao abre e arquivo VAZIO sao motivos diferentes',
        () async {
      final sumiu = _montar(
        rede: (_) async => _json(_autorizacaoPost()),
        camera: _CameraComFoto(arquivoSumiu: true),
      );
      expect(
        await sumiu.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: sumiu.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );
      expect(
        sumiu.envio.ultimoDiagnostico!.motivo,
        MotivoDoDesfecho.arquivoIlegivel,
      );

      final vazio = _montar(
        rede: (_) async => _json(_autorizacaoPost()),
        camera: _CameraComFoto(arquivoVazio: true),
      );
      expect(
        await vazio.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: vazio.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );
      expect(
        vazio.envio.ultimoDiagnostico!.motivo,
        MotivoDoDesfecho.arquivoVazio,
        reason: 'REPROVA: arquivo vazio virou a mesma causa de arquivo '
            'ilegivel. Sao defeitos diferentes: um e o seletor interrompido '
            'no meio da copia, o outro e o arquivo que sumiu do aparelho.',
      );
    });

    test('a NOSSA rota recusando leva status e codigo, e nao se confunde com '
        'o armazenamento', () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return http.Response(
              jsonEncode(<String, dynamic>{
                'type': 'https://bichu.app/problems/unsupported-media-type',
                'title': 'Tipo de midia nao aceito',
                'status': 415,
              }),
              415,
              headers: <String, String>{
                'content-type': 'application/problem+json',
              },
            );
          }
          return http.Response('', 204);
        },
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );

      final diagnostico = bancada.envio.ultimoDiagnostico!;
      expect(
        diagnostico.motivo,
        MotivoDoDesfecho.intencaoRecusadaPelaApi,
        reason: 'REPROVA: a recusa da NOSSA rota de intencao virou a mesma '
            'causa da recusa do armazenamento. Este e exatamente o defeito '
            'que mandou tres rodadas de diagnostico para a assinatura V4.',
      );
      expect(diagnostico.status, 415);
      // A URI CRUA, e nao o slug: `unsupported-media-type` nao esta no enum
      // fechado `ProblemTipo` deste build, entao o slug sairia vazio -- e um
      // 415 e justamente o que as rotas de catalogo devolvem para tipo fora da
      // lista. Ver `_identificadorDoProblema`.
      expect(
        diagnostico.codigo,
        'https://bichu.app/problems/unsupported-media-type',
      );
      expect(
        bancada.aoArmazenamento,
        isEmpty,
        reason: 'REPROVA: o app mandou bytes depois de a intencao ser '
            'recusada.',
      );
      // E a linha que sai no registro do aparelho nomeia o lado certo.
      expect(diagnostico.linha, contains('intencaoRecusadaPelaApi'));
      expect(diagnostico.linha, contains('status=415'));
    });

    test('o ARMAZENAMENTO recusando leva o status dele, e motivo proprio',
        () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response(
              '<Error><Code>SignatureDoesNotMatch</Code></Error>',
              403,
            );
          }
          return _json(_autorizacaoPost());
        },
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.recusada,
      );

      final diagnostico = bancada.envio.ultimoDiagnostico!;
      expect(diagnostico.motivo, MotivoDoDesfecho.armazenamentoRecusou);
      expect(
        diagnostico.status,
        403,
        reason: 'REPROVA: o status do armazenamento nao foi anotado. Sem ele, '
            'um 403 de assinatura e um 400 de campo fora da politica sao a '
            'mesma coisa para quem depura.',
      );
      expect(diagnostico.linha, contains('status=403'));
    });

    test('as duas recusas tem o MESMO desfecho e motivos DIFERENTES', () async {
      // O caso que amarra os dois anteriores: se alguem voltar a juntar as
      // causas, este reprova mesmo que os outros passem.
      final daApi = _montar(
        rede: (requisicao) async =>
            requisicao.url.path.endsWith('/media/pet-photo-intents')
                ? http.Response(
                    jsonEncode(<String, dynamic>{
                      'type': 'https://bichu.app/problems/validation-failed',
                      'status': 422,
                    }),
                    422,
                    headers: <String, String>{
                      'content-type': 'application/problem+json',
                    },
                  )
                : http.Response('', 204),
      );
      await daApi.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: daApi.pets, petId: 'pet-1'),
      );

      final doArmazenamento = _montar(
        rede: (requisicao) async =>
            requisicao.url.toString().startsWith(_armazenamento)
                ? http.Response('', 403)
                : _json(_autorizacaoPost()),
      );
      await doArmazenamento.envio.enviar(
        foto: _foto,
        destino: FotoDePet(api: doArmazenamento.pets, petId: 'pet-1'),
      );

      expect(
        daApi.envio.ultimoDiagnostico!.desfecho,
        doArmazenamento.envio.ultimoDiagnostico!.desfecho,
        reason: 'a frase da pessoa pode continuar a mesma',
      );
      expect(
        daApi.envio.ultimoDiagnostico!.motivo,
        isNot(doArmazenamento.envio.ultimoDiagnostico!.motivo),
        reason: 'REPROVA: as duas recusas voltaram a ser indistinguiveis. '
            'Uma e defeito NOSSO de rota, a outra e do armazenamento -- '
            'lugares opostos do sistema, e foi essa confusao que custou tres '
            'rodadas e uma rotacao de chave desnecessaria.',
      );
    });

    test('sem sinal no envio dos bytes tem motivo de REDE, nao de recusa',
        () async {
      final bancada = _montar(
        rede: (requisicao) async {
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            throw http.ClientException('a rede caiu no meio');
          }
          return _json(_autorizacaoPost());
        },
      );

      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.semSinal,
      );
      expect(
        bancada.envio.ultimoDiagnostico!.motivo,
        MotivoDoDesfecho.armazenamentoSemRede,
      );
      expect(bancada.envio.ultimoDiagnostico!.status, isNull);
    });

    test('o envio que DA CERTO anota `entregue`', () async {
      final bancada = _montar(
        rede: (requisicao) async =>
            requisicao.url.toString().startsWith(_armazenamento)
                ? http.Response('', 204)
                : _json(_autorizacaoPost()),
      );
      expect(
        await bancada.envio.enviar(
          foto: _foto,
          destino: FotoDePet(api: bancada.pets, petId: 'pet-1'),
        ),
        DesfechoDoEnvio.enviada,
      );
      expect(
        bancada.envio.ultimoDiagnostico!.motivo,
        MotivoDoDesfecho.entregue,
      );
    });
  });
}

/// O 201 que `POST /v1/media/directory-suggestion-logo-intents` devolveu na
/// homologacao em 30/10/2026 13:42:04Z, emitido pelo adaptador compilado da
/// imagem implantada. LITERAL, nao montado a mao. Ver o cabecalho do grupo
/// `o corpo REAL da homologacao e consumido pelo app`.
const String _corpoRealDaHml =
    r'{"upload_id":"3f84505a-b373-43f4-93a7-96d463e76700","method":"POST","url":"https://storage.googleapis.com/bichu-hml-media-private","fields":{"key":"directory/original/5LhGmB97jsZ6gjNx2NruPQ","Content-Type":"image/jpeg","x-goog-algorithm":"GOOG4-HMAC-SHA256","x-goog-credential":"GOOG1EXTOC5R3ASOTDR5IJKLENQ7HXEPO44AGS5OS2JACB2QOF5VP3XQD7SMC/20261030/southamerica-east1/storage/goog4_request","x-goog-date":"20261030T134204Z","policy":"eyJleHBpcmF0aW9uIjoiMjAyNi0xMC0zMFQxMzo1MjowNC4yNTlaIiwiY29uZGl0aW9ucyI6W3siYnVja2V0IjoiYmljaHUtaG1sLW1lZGlhLXByaXZhdGUifSx7ImtleSI6ImRpcmVjdG9yeS9vcmlnaW5hbC81TGhHbUI5N2pzWjZnak54Mk5ydVBRIn0seyJDb250ZW50LVR5cGUiOiJpbWFnZS9qcGVnIn0sWyJjb250ZW50LWxlbmd0aC1yYW5nZSIsMSw1MjQyODgwXSx7IngtZ29vZy1hbGdvcml0aG0iOiJHT09HNC1ITUFDLVNIQTI1NiJ9LHsieC1nb29nLWNyZWRlbnRpYWwiOiJHT09HMUVYVE9DNVIzQVNPVERSNUlKS0xFTlE3SFhFUE80NEFHUzVPUzJKQUNCMlFPRjVWUDNYUUQ3U01DLzIwMjYxMDMwL3NvdXRoYW1lcmljYS1lYXN0MS9zdG9yYWdlL2dvb2c0X3JlcXVlc3QifSx7IngtZ29vZy1kYXRlIjoiMjAyNjEwMzBUMTM0MjA0WiJ9XX0=","x-goog-signature":"61aa46e31fdafcf95e58a31a593c2741cca9ff4679873ccd5ca5266108a192af"},"expires_at":"2026-10-30T13:52:04.259Z","max_bytes":5242880}';

/// `agulha` aparece inteira, em sequencia, dentro de `palheiro`?
bool _contem(List<int> palheiro, List<int> agulha) {
  if (agulha.isEmpty) return false;
  for (var i = 0; i + agulha.length <= palheiro.length; i += 1) {
    var bate = true;
    for (var j = 0; j < agulha.length; j += 1) {
      if (palheiro[i + j] != agulha[j]) {
        bate = false;
        break;
      }
    }
    if (bate) return true;
  }
  return false;
}
