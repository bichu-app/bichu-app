// O caminho do app contra o ARMAZENAMENTO DE VERDADE, nos dois sentidos.
//
// ## A lacuna que este arquivo fecha
//
// Em 30/10/2026 o envio de foto ficou parado em 403 por horas, e TODOS os
// portoes estavam verdes. Nao foi descuido: nenhum deles media este caminho.
//
// - `envio_de_foto_test.dart` monta o armazenamento com `MockClient`. Ele
//   prova o que o app MANDA, nunca o que o armazenamento ACEITA.
// - os casos de `s3-object-storage` do servidor provam a POLITICA que
//   assinamos, e por anos rodaram so no dialeto `amz` -- contra o MinIO da
//   bancada, que nao confere condicao de politica como o GCS confere.
//
// Entre os dois sobra exatamente o defeito de 30/10: o app monta um multipart
// que o MinIO aceita e o GCS poderia recusar, e nada no caminho compara os
// dois. A unica medicao que responde e esta: **a classe `EnvioDeFoto` de
// verdade, com `http.Client` de verdade, contra o GCS de verdade.**
//
// ## Por que e opt-in, e por que isso nao a torna enfeite
//
// O caso precisa de uma autorizacao ASSINADA, que so sai de dentro do
// container de homologacao. Sem ela o arquivo se declara pulado e DIZ como
// obter -- nunca passa verde por omissao.
//
// E ele tem **controle positivo**: o segundo caso manda um envio que viola a
// politica de proposito e cobra a recusa COM o corpo. Sonda que so sabe dizer
// "deu certo" nao prova que falou com o GCS; esta prova, porque ela tambem sabe
// provocar a recusa e ler o motivo.
//
// ## O que a primeira rodada desta sonda mediu, para ninguem remedir
//
// Contra o GCS de verdade, com a autorizacao assinada por `createUploadIntent`
// de homologacao:
//
// | o que o cliente manda                                   | resposta |
// | ------------------------------------------------------- | -------- |
// | o que `EnvioDeFoto` monta hoje                          | **204**  |
// | campo que a politica nao declara                        | 400 `InvalidPolicyDocument` |
// | valor de `Content-Type` diferente da condicao           | 400 `InvalidPolicyDocument` |
// | valor de `key` diferente da condicao                    | 400 `InvalidPolicyDocument` |
// | formulario vencido                                      | 400 `InvalidPolicyDocument` |
// | zero byte / acima do teto                               | 400 `EntityTooSmall`/`EntityTooLarge` |
// | `file` NAO sendo a ultima parte                         | **204** (o GCS nao se importa) |
// | parte do arquivo com `content-type` proprio divergente  | **204** |
// | nome do campo em caixa diferente (`content-type`)       | **204** |
// | assinatura adulterada                                   | **403** `SignatureDoesNotMatch` |
//
// **Dai a regra que vale levar adiante: 400 e condicao de politica, 403 e
// assinatura ou credencial.** Sao lados opostos do sistema, e o status sozinho
// basta para escolher o lado -- desde que alguem tenha medido a tabela uma vez.
//
// NOTA: o primeiro caso GRAVA um objeto em `people/original/...` no bucket de
// homologacao. E lixo de diagnostico, e e o preco de medir o caminho de
// verdade em vez de um que se parece com ele.
//
// ## Como rodar
//
// ```
// # na VM bichu-hml, dentro do container da api:
// #   node -e "... criarObjectStorage(cfg.objectStorage).createUploadIntent(...)"
// # traga o JSON (url + fields). Ele e assinado, mas NAO e segredo.
// BICHU_AUTORIZACAO_GCS=/caminho/intent.json \
//   TMPDIR=/caminho/duravel/proprio-desta-execucao \
//   flutter test test/api/envio_de_foto_contra_gcs_test.dart
// ```

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:flutter_test/flutter_test.dart';

/// A variavel que liga os casos. Sem ela nao ha autorizacao assinada, e um
/// caso que invente uma mede a propria invencao.
const String _variavel = 'BICHU_AUTORIZACAO_GCS';

/// Um JPEG minusculo, mas JPEG de verdade: `SOI`, `APP0`/JFIF e `EOI`.
///
/// Um byte qualquer satisfaria o `content-length-range`, mas imagem de verdade
/// elimina uma variavel do veredito -- se o armazenamento algum dia passar a
/// olhar o conteudo, o caso nao reprova por motivo que nao e o dele.
final Uint8List _jpegMinimo = Uint8List.fromList(<int>[
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, //
  0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, //
  0xFF, 0xD9,
]);

const FotoLocal _foto = FotoLocal(
  caminho: '/nao-existe/foto.jpg',
  tipoDeConteudo: 'image/jpeg',
  tamanhoEmBytes: 22,
);

/// A camera reduzida a entregar os bytes: o que se mede aqui e a rede.
class _CameraComOsBytes implements CameraEGaleria {
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
  Future<Uint8List> bytesDaFoto(FotoLocal foto) async => _jpegMinimo;

  @override
  Future<FotoLocal?> recortarFoto(FotoLocal foto, RecorteDaFoto recorte) async {
    throw StateError('o envio nao recorta foto; quem recorta e a folha');
  }
}

/// Um destino que devolve a autorizacao LIDA DO ARQUIVO e nao confirma nada.
///
/// A confirmacao fala com a NOSSA api, que nao esta em pe aqui. O que este
/// arquivo mede e o passo do meio, e so ele.
class _AutorizacaoDeArquivo implements DestinoDaFoto {
  _AutorizacaoDeArquivo(this.json);

  final Map<String, dynamic> json;

  @override
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    return AutorizacaoDeEnvio.doJson(json);
  }

  @override
  Future<void> confirmar(String uploadId) async {}
}

Map<String, dynamic> _lerAutorizacao(String caminho) {
  final bruto = File(caminho).readAsStringSync();
  final json = jsonDecode(bruto) as Map<String, dynamic>;
  // `upload_id` nao sai do gerador de dentro do container, e `doJson` o exige.
  // Preencher aqui e honesto: ele nao vai para o fio, so para a leitura.
  json.putIfAbsent('upload_id', () => 'isca-contra-o-gcs');
  return json;
}

void main() {
  final caminho = Platform.environment[_variavel];
  if (caminho == null || caminho.isEmpty) {
    // **Pulado em voz alta.** Um arquivo que se cala quando nao mede e um
    // arquivo que aprova por omissao, e foi assim que o 403 de 30/10 passou
    // por todos os portoes.
    test(
      'o caminho do app contra o GCS de verdade',
      () {},
      skip:
          'defina $_variavel com o caminho de um JSON de autorizacao assinada '
          '(url + fields), gerado por `createUploadIntent` dentro do container '
          'de homologacao. Ver o cabecalho deste arquivo.',
    );
    return;
  }

  final autorizacao = _lerAutorizacao(caminho);

  group('o caminho do app contra o GCS de verdade', () {
    test('os bytes que o app monta sao ACEITOS pela politica assinada', () async {
      final envio = EnvioDeFoto(camera: _CameraComOsBytes());
      addTearDown(envio.fechar);

      final desfecho = await envio.enviar(
        foto: _foto,
        destino: _AutorizacaoDeArquivo(autorizacao),
      );

      // A mensagem leva o diagnostico INTEIRO: numa reprovacao aqui, o corpo do
      // armazenamento e a lista de campos sao a resposta, e exigir uma segunda
      // rodada para obte-los e o custo que este arquivo existe para cortar.
      expect(
        desfecho,
        DesfechoDoEnvio.enviada,
        reason: 'o armazenamento recusou: ${envio.ultimoDiagnostico?.linha}',
      );
    });

    test(
      'CONTROLE POSITIVO: campo que a politica nao declara e recusado, e o '
      'CORPO da recusa chega ao diagnostico',
      () async {
        // A regra do armazenamento e dura: todo campo do formulario tem de
        // aparecer nas condicoes da politica. Um campo intruso e, portanto, a
        // forma mais barata de provocar uma recusa de politica DE VERDADE.
        final comIntruso = <String, dynamic>{
          ...autorizacao,
          'fields': <String, String>{
            // O intruso vai ANTES de `policy`/`x-goog-signature` so para a
            // ordem continuar sendo a do app; o que o faz ser recusado e ele
            // existir, nao onde esta.
            ...(autorizacao['fields'] as Map).map(
              (chave, valor) => MapEntry('$chave', '$valor'),
            ),
            'campo-que-a-politica-nao-declara': 'x',
          },
        };

        final envio = EnvioDeFoto(camera: _CameraComOsBytes());
        addTearDown(envio.fechar);

        final desfecho = await envio.enviar(
          foto: _foto,
          destino: _AutorizacaoDeArquivo(comIntruso),
        );

        expect(desfecho, DesfechoDoEnvio.recusada);
        final diagnostico = envio.ultimoDiagnostico!;
        expect(diagnostico.motivo, MotivoDoDesfecho.armazenamentoRecusou);

        // **400, e NAO 403, e a medicao que custou caro.**
        //
        // Em 30/10/2026 o aparelho do cliente mostrou `status=403` e a cacada
        // foi para a lista de suspeitos de POLITICA: campo a mais, ordem do
        // `file`, caixa do nome do campo, `Content-Type` divergente. Medido
        // contra o GCS de verdade, TODA falha de condicao devolve **400**
        // (`InvalidPolicyDocument`, `EntityTooSmall`, `EntityTooLarge`),
        // inclusive formulario vencido. O **403** do GCS neste caminho e
        // outra familia: `SignatureDoesNotMatch`.
        //
        // Ou seja: 400 e 403 apontam para lados opostos do sistema, e este
        // caso existe para que o proximo a depurar leia isso aqui em vez de
        // gastar rodadas descobrindo de novo.
        expect(
          diagnostico.status,
          400,
          reason:
              'falha de CONDICAO da politica e 400 no GCS; 403 seria '
              'assinatura/credencial. Diagnostico: ${diagnostico.linha}',
        );
        // Sonda negativa precisa provar que falou com o GCS: o XML dele e essa
        // prova. Sem o corpo, "recusado" tambem seria o que uma rede quebrada
        // devolveria.
        expect(
          diagnostico.corpo,
          contains('<Code>'),
          reason:
              'o corpo da recusa e o unico lugar onde a condicao violada tem '
              'nome; sem ele a recusa volta a ser indistinguivel. '
              'Diagnostico: ${diagnostico.linha}',
        );
        expect(diagnostico.corpo, contains('InvalidPolicyDocument'));
        expect(
          diagnostico.corpo,
          contains('campo-que-a-politica-nao-declara'),
          reason: 'o GCS NOMEIA o campo intruso, e e por isso que o corpo vale',
        );
        // A outra metade do diagnostico: a lista do que foi para o fio, com
        // `file` por ultimo.
        expect(diagnostico.camposDoFormulario, isNotNull);
        expect(diagnostico.camposDoFormulario!.last, 'file');
        expect(diagnostico.tipoDaParteDoArquivo, isNotNull);
      },
    );
  });
}
