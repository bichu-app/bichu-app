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
  _CameraComFoto({this.arquivoSumiu = false});

  final bool arquivoSumiu;
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
    return Uint8List.fromList(_bytesDaFoto);
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
}

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
