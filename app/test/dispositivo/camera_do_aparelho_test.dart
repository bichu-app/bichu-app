// BICHUS-161 — a camera de verdade, pelas duas funcoes puras que decidem tudo.
//
// A ISCA deste arquivo: **os quatro estados de permissao e o teto do
// contrato.** Canal de plataforma nao existe em teste de widget, entao a
// tentacao e nao testar nada desta integracao e declara-la "verificada em
// aparelho". Foi para fugir disso que a traducao do estado e a conversao do
// arquivo sairam da classe e viraram funcao pura: elas sao a unica regra de
// decisao que esta integracao tem, e agora elas tem isca sem aparelho.
//
// O caso que sustenta o arquivo e o `restricted`: controle parental no iOS
// bloqueia a camera de um jeito que **os ajustes nao resolvem**. Traduzi-lo
// como `negadaPermanentemente` mandaria justamente quem nao pode resolver para
// uma tela de ajustes sem nada para tocar. Um teste que so exercite
// "concedida" e "negada" fica verde com esse defeito de pe.
//
// O SEGUNDO GRUPO le o `api/openapi.yaml` de verdade. As constantes deste app
// sao copia de numeros que moram no contrato, e copia sem portao diverge: no
// dia em que o teto do servidor mudar, este arquivo reprova nomeando os dois
// valores, em vez de o app mandar bytes que o servidor recusa.

import 'dart:io';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart';

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir e
/// portao que fica verde por vazio, que e como este tipo de defeito passa.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/api/openapi.yaml').existsSync() &&
        Directory('${dir.path}/app/android').existsSync()) {
      return dir;
    }
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada, e '
    'ficar verde sem conferir e pior que nao existir.',
  );
}

void main() {
  group('os quatro estados, um a um', () {
    test('concedida: granted, limited e provisional', () {
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.granted),
        EstadoDaPermissao.concedida,
      );
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.limited),
        EstadoDaPermissao.concedida,
      );
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.provisional),
        EstadoDaPermissao.concedida,
      );
    });

    test('negada: a recusa que AINDA abre dialogo', () {
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.denied),
        EstadoDaPermissao.negada,
        reason: 'REPROVA: a recusa simples virou outra coisa. E o unico estado '
            'em que `pedirCamera()` ainda abre o dialogo do sistema; tratado '
            'como permanente, a pessoa e mandada aos ajustes para responder de '
            'novo uma pergunta que o proprio app ainda pode fazer.',
      );
    });

    test('negadaPermanentemente: pedir de novo nao abre dialogo', () {
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.permanentlyDenied),
        EstadoDaPermissao.negadaPermanentemente,
        reason: 'REPROVA: a recusa permanente virou outra coisa. Aqui o unico '
            'caminho sao os ajustes, e a tela precisa dizer isso em vez de '
            'repetir um pedido que o sistema nao mostra mais.',
      );
    });

    test('restricted do iOS e INDISPONIVEL, e nao recusa permanente', () {
      // Controle parental ou politica de dispositivo gerenciado. A pessoa nao
      // consegue liberar NEM nos ajustes: nao ha permissao a conceder, que e a
      // definicao de `indisponivel` no comentario do proprio enum.
      expect(
        estadoDaPermissaoDoPlugin(PermissionStatus.restricted),
        EstadoDaPermissao.indisponivel,
        reason: 'REPROVA: `restricted` foi tratado como recusa. Ele e a '
            'restricao que a PESSOA NAO PODE LEVANTAR (controle parental, '
            'MDM). Mandar quem esta nesse estado para os ajustes e manda-la '
            'procurar um botao que nao existe na tela dela.',
      );
    });

    test('os quatro valores do enum do produto sao alcancaveis', () {
      // Sem isto, alguem pode remover um ramo da traducao e nenhum caso acima
      // reprova sozinho por um estado que deixou de ser produzido.
      final produzidos = PermissionStatus.values
          .map(estadoDaPermissaoDoPlugin)
          .toSet();
      expect(
        produzidos,
        containsAll(EstadoDaPermissao.values),
        reason: 'REPROVA: ha estado do produto que a traducao nunca produz. '
            'Faltando: '
            '${EstadoDaPermissao.values.toSet().difference(produzidos)}.',
      );
    });
  });

  group('a conversao para FotoLocal cobra o contrato ANTES da rede', () {
    test('arquivo de zero byte e recusado', () {
      expect(
        fotoLocalDoArquivo(caminho: '/tmp/nina.jpg', tamanhoEmBytes: 0),
        isNull,
        reason: 'REPROVA: passou um arquivo vazio. O contrato declara '
            '`byte_size` com `minimum: 1`, e subir isso e gastar uma ida e '
            'volta para receber `validation-failed` de algo que o cliente ja '
            'sabia.',
      );
    });

    test('caminho vazio e recusado', () {
      expect(
        fotoLocalDoArquivo(caminho: '   ', tamanhoEmBytes: 1024),
        isNull,
      );
    });

    test('exatamente no teto passa, um byte acima nao', () {
      expect(
        fotoLocalDoArquivo(
          caminho: '/tmp/nina.jpg',
          tamanhoEmBytes: tetoDeBytesDaFoto,
        ),
        isNotNull,
        reason: 'REPROVA: o limite virou exclusivo. O contrato diz '
            '`maximum: $tetoDeBytesDaFoto`, e maximo inclui o proprio valor.',
      );
      expect(
        fotoLocalDoArquivo(
          caminho: '/tmp/nina.jpg',
          tamanhoEmBytes: tetoDeBytesDaFoto + 1,
        ),
        isNull,
        reason: 'REPROVA: passou acima do teto do contrato.',
      );
    });

    test('tipo fora da lista fechada vira image/jpeg, e nao vaza', () {
      // O `image_picker` devolve `image/*` e variantes conforme a plataforma.
      // Propagar isso manda ao servidor um valor que o enum do contrato
      // recusa.
      final foto = fotoLocalDoArquivo(
        caminho: '/tmp/nina.jpg',
        tamanhoEmBytes: 2048,
        tipoDeConteudo: 'image/avif',
      );
      expect(foto, isNotNull);
      expect(
        tiposDeFotoAceitos,
        contains(foto!.tipoDeConteudo),
        reason: 'REPROVA: o tipo "${foto.tipoDeConteudo}" nao esta na lista '
            'fechada de `UploadIntentInput.content_type`. O servidor recusa, e '
            'a falha aparece so na hora do envio.',
      );
    });

    test('tipo da lista fechada e preservado', () {
      final foto = fotoLocalDoArquivo(
        caminho: '/tmp/nina.png',
        tamanhoEmBytes: 2048,
        tipoDeConteudo: 'image/png',
      );
      expect(foto!.tipoDeConteudo, 'image/png');
    });
  });

  group('as constantes sao copia do contrato, e o portao cobra isso', () {
    test('tetoDeBytesDaFoto e o `maximum` de UploadIntentInput.byte_size', () {
      final contrato =
          File('${_raizDoRepositorio().path}/api/openapi.yaml').readAsStringSync();

      // A ANCORA IMPORTA, e ela custou uma execucao vermelha para aparecer.
      //
      // Ha DOIS `byte_size ... maximum` no contrato, e o primeiro em ordem de
      // arquivo NAO e este: `/media/finder-photo-intents` estreita o teto para
      // 2 MB por `allOf`, porque quem envia ali e o achador, que nao tem
      // identidade nenhuma. Uma busca solta pega o do achador e acusa
      // divergencia onde nao ha.
      final schema = contrato.indexOf('    UploadIntentInput:');
      expect(
        schema,
        greaterThan(-1),
        reason: 'REPROVA: nao achei o schema `UploadIntentInput` em '
            '`api/openapi.yaml`. Sem ancora, este portao mediria o teto '
            'errado e acusaria divergencia que nao existe.',
      );
      final bloco = contrato.substring(schema, schema + 800);

      final linha =
          RegExp(r'byte_size:\s*\{[^}]*maximum:\s*(\d+)').firstMatch(bloco);
      expect(
        linha,
        isNotNull,
        reason: 'REPROVA: nao achei `byte_size ... maximum` dentro de '
            '`UploadIntentInput`. O contrato mudou de forma e esta constante '
            'ficou sem fonte: ela deixou de ser copia e virou numero solto.',
      );

      expect(
        int.parse(linha!.group(1)!),
        tetoDeBytesDaFoto,
        reason: 'REPROVA: o contrato declara '
            '${linha.group(1)} bytes e o app usa $tetoDeBytesDaFoto. O app '
            'mandaria arquivo que o servidor recusa, ou recusaria arquivo que '
            'o servidor aceita.',
      );
    });

    test('tiposDeFotoAceitos e o enum de content_type do contrato', () {
      final contrato =
          File('${_raizDoRepositorio().path}/api/openapi.yaml').readAsStringSync();

      final schema = contrato.indexOf('    UploadIntentInput:');
      expect(schema, greaterThan(-1));
      final bloco = RegExp(
        r'content_type:\s*\n\s*type:\s*string\s*\n\s*enum:\s*\[([^\]]+)\]',
      ).firstMatch(contrato.substring(schema, schema + 800));
      expect(
        bloco,
        isNotNull,
        reason: 'REPROVA: nao achei o enum de `content_type` no contrato.',
      );

      final doContrato = bloco!
          .group(1)!
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toSet();
      expect(
        tiposDeFotoAceitos,
        doContrato,
        reason: 'REPROVA: a lista do app divergiu da do contrato. '
            'Contrato: $doContrato. App: $tiposDeFotoAceitos.',
      );
    });

    test('o teto do ACHADOR e mais apertado, e esta porta nao serve a ele', () {
      // Descoberto pela primeira execucao desta isca, e registrado aqui para
      // nao voltar como surpresa: `/media/finder-photo-intents` estreita
      // `byte_size` para 2 MB, contra os 10 MiB da foto do pet. Sao caminhos
      // diferentes, e hoje `CameraDoAparelho` serve so o do pet (F1.4).
      //
      // No dia em que a foto do achador (F3) usar esta mesma porta,
      // `tetoDeBytesDaFoto` deixa de ser o teto certo para aquele caminho, e o
      // erro so apareceria no envio. Este caso existe para que a diferenca
      // seja um fato testado, e nao uma linha de YAML que ninguem releu.
      final contrato = File('${_raizDoRepositorio().path}/api/openapi.yaml')
          .readAsStringSync();
      final doAchador = RegExp(
        r'finder-photo-intents[\s\S]{0,1600}?byte_size:\s*\{[^}]*maximum:\s*(\d+)',
      ).firstMatch(contrato);
      expect(
        doAchador,
        isNotNull,
        reason: 'REPROVA: o teto proprio de `/media/finder-photo-intents` '
            'sumiu do contrato. Ou ele foi removido, e a foto do achador '
            'passou a aceitar 10 MiB de quem nao tem identidade nenhuma, ou o '
            'contrato mudou de forma e este portao parou de enxergar.',
      );
      expect(
        int.parse(doAchador!.group(1)!),
        lessThan(tetoDeBytesDaFoto),
        reason: 'REPROVA: o teto do achador deixou de ser mais apertado que o '
            'do tutor. Quem envia ali nao tem conta.',
      );
    });

    test('o lado maior mantem o teto do contrato inalcancavel', () {
      // A razao de existir de `ladoMaiorDaFoto`. Um JPEG de qualidade 80 fica
      // muito abaixo de 1 byte por pixel; o pior caso realista aqui e da ordem
      // de 1 MB, contra os 10 MiB do contrato. Esta conta e o que permite a
      // porta devolver nulo por recusa sem a tela precisar distinguir isso de
      // um cancelamento.
      final piorCasoEmBytes = ladoMaiorDaFoto * ladoMaiorDaFoto;
      expect(
        piorCasoEmBytes,
        lessThan(tetoDeBytesDaFoto),
        reason: 'REPROVA: com $ladoMaiorDaFoto px no lado maior, o teto de '
            '$tetoDeBytesDaFoto bytes deixa de ser inalcancavel. A partir daí '
            'a recusa por tamanho passa a acontecer de verdade, e a porta nao '
            'consegue distingui-la de um cancelamento: `Future<FotoLocal?>` '
            'devolve nulo nos dois casos e a tela fica muda, que e o defeito '
            'da BICHUS-158 de volta.',
      );
      expect(qualidadeDaFoto, lessThan(100));
    });
  });
}
