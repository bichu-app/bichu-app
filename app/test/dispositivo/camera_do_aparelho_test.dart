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

/// O bloco de um schema de `components.schemas`, **do nome dele ate o
/// proximo schema**.
///
/// Substitui o `substring(ancora, ancora + 800)` que estava em cada portao:
/// uma janela de tamanho fixo e uma ancora que a prosa do contrato quebra. Foi
/// o que aconteceu -- a descricao de `UploadIntentInput` cresceu com a decisao
/// do cliente de 17/10/2026 (o teto unico de 5 MiB), empurrou `content_type` e
/// `byte_size` para alem dos 800 caracteres, e os dois portoes passaram a
/// dizer "nao achei no contrato" sobre campos que estao la. O limite certo e
/// ESTRUTURAL: o schema termina onde o proximo comeca, na mesma indentacao de
/// quatro espacos.
String _blocoDoSchema(String contrato, String nome) {
  final inicio = contrato.indexOf('    $nome:');
  if (inicio < 0) return '';
  final proximo =
      RegExp(r'\n    [A-Za-z_]\w*:\n').firstMatch(contrato.substring(inicio + 1));
  return proximo == null
      ? contrato.substring(inicio)
      : contrato.substring(inicio, inicio + 1 + proximo.start);
}

/// O bloco de um caminho de `paths`, do nome dele ate o proximo caminho.
String _blocoDoCaminho(String contrato, String caminho) {
  final inicio = contrato.indexOf('  $caminho:');
  if (inicio < 0) return '';
  final proximo =
      RegExp(r'\n  /\S*:\n').firstMatch(contrato.substring(inicio + 1));
  return proximo == null
      ? contrato.substring(inicio)
      : contrato.substring(inicio, inicio + 1 + proximo.start);
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

      // A ANCORA IMPORTA: uma busca solta por `byte_size ... maximum` pegaria
      // qualquer outro schema. O recorte e o do PROPRIO schema, do nome dele
      // ate o proximo -- ver `_blocoDoSchema`, que explica por que a janela de
      // 800 caracteres que estava aqui deixou de funcionar.
      final bloco = _blocoDoSchema(contrato, 'UploadIntentInput');
      expect(
        bloco,
        isNotEmpty,
        reason: 'REPROVA: nao achei o schema `UploadIntentInput` em '
            '`api/openapi.yaml`. Sem ancora, este portao mediria o teto '
            'errado e acusaria divergencia que nao existe.',
      );

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

      final schema = _blocoDoSchema(contrato, 'UploadIntentInput');
      expect(schema, isNotEmpty);
      final bloco = RegExp(
        r'content_type:\s*\n\s*type:\s*string\s*\n\s*enum:\s*\[([^\]]+)\]',
      ).firstMatch(schema);
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

    test('o teto do ACHADOR e o MESMO, e esta porta serve aos dois', () {
      // **ESTE CASO VIROU DO AVESSO, e nao foi apagado.**
      //
      // Ele afirmava que `/media/finder-photo-intents` estreitava `byte_size`
      // para 2 MB contra os 10 MiB da foto do pet. Os dois numeros deixaram de
      // existir em 17/10/2026, por decisao literal do cliente -- *"as imagens
      // devem conter no maximo 5mb ... em toda a aplicacao"* --, e o contrato
      // registra a unificacao nos dois lugares, com estas palavras:
      //
      //   - em `UploadIntentInput`: "**O teto de 5 MiB vale para TODO envio de
      //     imagem da aplicacao** ... Antes eram tres numeros: 10 MiB aqui,
      //     2 MiB no servidor da foto de achado e 5 MiB no catalogo";
      //   - na rota do achador: "O teto desta rota era 2 MB no SEC-009, e a
      //     unificacao o afrouxa: o que continua contendo volume aqui e o teto
      //     de tres fotos por aviso, que nao reabre"; e, no `requestBody`,
      //     "Sem sobrescrever `byte_size`: ... esta rota o herda de
      //     `UploadIntentInput`".
      //
      // As duas hipoteses que a isca oferecia estavam ERRADAS: o teto nao foi
      // removido deixando 10 MiB (os 10 MiB e que sairam), e o contrato nao
      // mudou de forma. O que a isca mede agora e a unificacao, nos dois
      // sentidos -- e ela reprova no dia em que alguem reabrir um teto proprio
      // aqui, porque `tetoDeBytesDaFoto` deixaria de ser o teto certo deste
      // caminho e o erro so apareceria no envio.
      final contrato = File('${_raizDoRepositorio().path}/api/openapi.yaml')
          .readAsStringSync();
      final rota = _blocoDoCaminho(contrato, '/media/finder-photo-intents');
      expect(
        rota,
        isNotEmpty,
        reason: 'REPROVA: nao achei a rota `/media/finder-photo-intents` em '
            '`api/openapi.yaml`.',
      );
      // Sem os COMENTARIOS do YAML: a propria rota explica a unificacao
      // escrevendo "Sem sobrescrever `byte_size`", e uma busca crua acharia
      // essa frase e acusaria um teto que nao existe. O que conta e uma CHAVE
      // `byte_size:` declarada, no comeco de uma linha de dados.
      final semComentarios = rota
          .split('\n')
          .where((l) => !l.trimLeft().startsWith('#'))
          .join('\n');
      expect(
        RegExp(r'^\s*byte_size:', multiLine: true).hasMatch(semComentarios),
        isFalse,
        reason: 'REPROVA: a rota do achador voltou a declarar `byte_size` '
            'proprio. O teto e unico desde 17/10, e um segundo numero aqui '
            'faria `tetoDeBytesDaFoto` mentir sobre este caminho -- a recusa '
            'apareceria so no envio.',
      );
      expect(
        rota.contains(r"$ref: '#/components/schemas/UploadIntentInput'"),
        isTrue,
        reason: 'REPROVA: a rota do achador parou de herdar '
            '`UploadIntentInput`. Com um corpo proprio, o teto dela deixa de '
            'ser o do app sem ninguem perceber.',
      );
      // E o teto herdado e o que o app carrega.
      final bloco = _blocoDoSchema(contrato, 'UploadIntentInput');
      final herdado =
          RegExp(r'byte_size:\s*\{[^}]*maximum:\s*(\d+)').firstMatch(bloco);
      expect(herdado, isNotNull);
      expect(
        int.parse(herdado!.group(1)!),
        tetoDeBytesDaFoto,
        reason: 'REPROVA: o teto herdado pela rota do achador nao e o que o '
            'app confere.',
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
