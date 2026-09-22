// BICHUS-161, criterio 10 — "nenhuma tela do assistente de cadastro muda de
// codigo por causa desta historia. Se alguma precisar mudar, a porta esta
// sendo contornada, e isso reprova".
//
// A ISCA deste arquivo: **o criterio 10 so existe como frase enquanto alguem
// o afirma.** "Conferi com `git diff` que nenhuma tela mudou" e verdade no dia
// em que foi digitada e nao acusa nada no dia seguinte. Quem ler o commit
// acredita; quem contornar a porta depois nao encontra ninguem reclamando.
//
// Sao dois portoes, e eles pegam coisas diferentes:
//
// 1. A TRAVA DE ARVORE cobra a letra do criterio: o conteudo de
//    `app/lib/telas` e o mesmo que estava valendo quando a trava foi escrita
//    pela ultima vez. Um espaco a mais reprova. E de proposito que ela seja
//    burra: o criterio nao fala de comportamento, fala de o codigo nao ter
//    mudado.
//
// 2. O PORTAO ESTRUTURAL cobra o espirito, e sobrevive a esta historia: tela
//    nenhuma importa plugin de aparelho nem fala canal de plataforma. A trava
//    de arvore morre no dia em que uma historia legitima mexer numa tela; este
//    aqui continua valendo, e e ele que pega o contorno de verdade.
//
// ---------------------------------------------------------------------------
// O QUE MUDOU DEPOIS DA REVISAO DA BICHUS-161 (e por que)
// ---------------------------------------------------------------------------
//
// **O portao estrutural tinha um furo, e era grande.** Ele casava o texto
// `import '`, com aspa SIMPLES. `import "package:image_picker/..."`, com aspa
// dupla, passava verde -- e o `prefer_single_quotes` estava comentado no
// `analysis_options.yaml`, entao o `flutter analyze` tambem ficava calado. O
// portao que existe para impedir que uma tela contorne a porta era contornavel
// trocando o tipo de aspa, que e a diferenca mais inocente que existe entre
// dois programadores.
//
// Agora ele nao casa texto: ele LE as diretivas, com o leitor de
// `diretivas_dart.dart`, que entende aspa simples, dupla, tripla, string crua,
// escape unicode, literais adjacentes, comentario no meio e `import`
// condicional. O grupo `autoteste do leitor` abaixo prova cada uma dessas
// formas, e ele fica no repositorio de proposito: prova negativa que vive numa
// frase evapora, e esta precisa acusar no dia em que o leitor deixar de
// enxergar.
//
// `prefer_single_quotes` FOI ligado tambem (zero arquivos do projeto quebram
// com ele), mas como cinto, nao como freio: se alguem o desligar amanha, este
// portao continua enxergando igual. Era essa dependencia que fazia o portao
// antigo ter duas maneiras de morrer, e a segunda ser silenciosa.
//
// **A trava de conteudo virou trava de ARVORE.** Ela fixava o digest SHA-256
// de sete arquivos de `app/lib/telas/pet/`, enumerados a mao, contra o commit
// `7fe24a6`. Tres problemas, e o terceiro e o pior:
//
//   - fixava um COMMIT, e nao uma propriedade: quem destravasse uma vez
//     passaria a cobrar "byte a byte o da base 7fe24a6" sobre o que a pessoa
//     anterior colou;
//   - custava sete linhas de digest por destravamento, o que transforma um ato
//     deliberado em cerimonia -- e cerimonia se despacha no automatico;
//   - cobria sete arquivos de uma SUBPASTA. Pasta nova dentro de
//     `app/lib/telas` nao era coberta por nada.
//
// `git write-tree` devolve o hash da arvore, que cobre o diretorio inteiro
// **recursivamente**: arquivo novo, arquivo apagado, subpasta nova, permissao
// trocada, tudo muda o hash. Uma constante no lugar de sete, o diretorio no
// lugar da subpasta, e o commit citado como PROCEDENCIA e nao como alvo.
//
// COMO DESTRAVAR, quando uma historia FUTURA tiver motivo legitimo para mexer
// numa tela: rode o comando que a mensagem de falha imprime, troque a
// constante `_arvoreDasTelas` e cite a chave da issue na linha. Continua sendo
// um ato deliberado, com nome e motivo no diff -- so deixou de custar sete
// edicoes para custar uma.
//
// O QUE ESTE PORTAO NAO COBRE: o criterio 12, verificacao em aparelho fisico.
// Camera nao se verifica em simulador nem em teste de widget, e nada aqui
// finge que verifica.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'diretivas_dart.dart';

/// O diretorio que a trava cobre, relativo a raiz do repositorio.
const String _caminhoDasTelas = 'app/lib/telas';

/// O hash de arvore de [_caminhoDasTelas].
///
/// Procedencia ate 21/09: `7fe24a6` (BICHUS-157 e 158, o commit em que a
/// BICHUS-161 nasceu) e `71559a0` (a ponta da BICHUS-161) davam **o mesmo**
/// hash, `52ea5cee883547d9a324900479a8e60802041d4a` -- que e exatamente o que
/// o criterio 10 afirma.
///
/// **Destravado pela BICHUS-164** na integracao de 22/09, e este e o ato
/// deliberado que a trava cobra. A 164 leva a barra de navegacao de tres para
/// cinco secoes e mexe em `app/lib/telas/abas.dart`, `casca_com_abas.dart`,
/// `escanear/tela_leitor_de_qr.dart`, `pet/tela_cadastrar_sinais.dart` e
/// `pet/tela_pet_cadastrado.dart`, e acrescenta `perfil/meus_pets.dart`. O
/// criterio 10 da BICHUS-161 continua valendo sobre o que ele diz -- que a
/// CAMERA nao contornou a porta --, e quem responde por isso e o portao de
/// diretivas acima, que nao depende desta constante.
///
/// **Destravado de novo pela BICHUS-205** (`fix/botao-primario-sem-acao`), na
/// mesma integracao: a acao primaria voltava a se anunciar como tocavel, e
/// `pet/tela_pet_cadastrado.dart` recebeu a correcao. A trava reprovou, como
/// tem de reprovar, e o bump e o ato deliberado que ela cobra.
///
/// **Destravado uma terceira vez pela BICHUS-154**: o codigo da tag encolheu
/// para 16 caracteres e a tela que o exibe acompanhou.
///
/// **Destravado uma quarta vez pela BICHUS-195/196**: `casca_com_abas.dart`
/// ganhou `tituloEmMarca` e `abas.dart` recebeu a nota da decisao entre ela
/// e a BICHUS-164.
///
/// **Destravado uma quinta vez pelos achados em aparelho fisico de 22/09**,
/// os dois de posicionamento que a suite nao via:
/// `escanear/tela_leitor_de_qr.dart` ganhou `alturaDaSaidaSobreposta` e o
/// estado `digitando` passou a abrir depois da saida sobreposta, que cobria o
/// rotulo do campo; `avisos/antessala_de_aviso.dart` ganhou o `SafeArea`
/// inferior que `showModalBottomSheet(useSafeArea: true)` NAO aplica, porque
/// `Agora não` caia debaixo da barra de gestos. Os dois estao medidos em
/// `test/telas/area_segura_do_aparelho_test.dart`.
///
/// **Esta trava nao poderia ter pego nenhum dos dois, e isso e o desenho
/// dela.** Ela e hash de bytes de fonte: ela acusa que o codigo mudou, nunca
/// que o desenho se atropela. Quem cobra geometria e o arquivo de area
/// segura, e ate 22/09 ele nao existia.
/// **Destravado uma quinta vez pelas tres mudancas do teste em aparelho de
/// 22/09/2026** (BICHUS-29 e BICHUS-81): o Perfil perdeu a linha de termos e
/// privacidade em `abas.dart`, a F1.1 ganhou a caixa de aceite dos termos em
/// `conta/tela_criar_conta.dart`, e a caixa de "continuar conectado" saiu de
/// `tela_criar_conta.dart` e de `conta/tela_entrar.dart`. Nenhuma delas
/// encosta na porta `CameraEGaleria`, que e o que o criterio 10 protege.
///
/// **Destravado uma sexta vez pela BICHUS-220**, pelos dois achados do cliente
/// em aparelho fisico de 22/09:
///
/// - `perfil/meus_pets.dart` ganhou o gatilho de recarga por visibilidade. A
///   tela carregava uma vez, em `initState`, e o pet cadastrado com ela ja
///   montada nunca entrava na lista.
/// - `escanear/tela_leitor_de_qr.dart` **parou de desenhar uma camera que nao
///   existe**. Com a permissao concedida ela pintava fundo preto e uma moldura
///   de 240 x 240 sem nenhum widget de camera na arvore. O leitor e a
///   BICHUS-54, que esta em `To Do`; enquanto ela nao entra, a tela diz isso e
///   oferece a digitacao do codigo, que a propria BICHUS-54 chama de caminho
///   de igual valor.
///
/// Nenhuma das duas encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege. A segunda, alias, **tira** da tela a ultima leitura que ela
/// fazia da porta: o leitor nao consulta mais permissao nenhuma, porque a
/// resposta nao mudava nada do que ele consegue fazer.
///
/// **Destravado uma setima vez pela BICHUS-235**: o QR da tag passou a ser
/// buscado com o `Authorization` que a rota exige, e a falha da imagem deixou
/// de colapsar para `SizedBox.shrink()`.
/// `pet/tela_pet_cadastrado.dart` trocou `Image.network` por um `Image` sobre
/// os bytes que a camada de API baixou, e ganhou os quatro estados da imagem;
/// `pet/textos_do_cadastro.dart` recebeu os tres textos que distinguem "esta
/// tag nao tem imagem" de "nao consegui buscar". Nenhuma das duas encosta na
/// porta `CameraEGaleria`, que e o que o criterio 10 protege.
///
/// Nao e "o hash da base 7fe24a6": e o hash que vale agora. Quem destravar
/// troca esta linha e cita a issue aqui, e a proxima pessoa passa a cobrar o
/// que essa issue deixou, e nao o que um commit de setembro deixou.
/// **Destravado uma oitava vez pela BICHUS-21**: o fluxo de marcar o pet como
/// perdido entrou, e ele e cinco arquivos novos em `perdido/` -- F3.0
/// (`tela_de_quem_e_o_caso.dart`), F3.1 (`tela_onde_e_quando.dart`), F3.2
/// (`tela_alcance_do_alerta.dart`), F3.3 (`resultado_da_abertura.dart`), a
/// ponte do envelope de intencao (`tela_de_retomada.dart`) e o cabecalho do
/// pet (`cabecalho_do_pet.dart`). `perfil/meus_pets.dart` ganhou a porta que a
/// BICHUS-62 deixou reservada, com a acao `Marcar como perdido` que so agora
/// tem destino.
///
/// Nenhuma delas encosta na porta `CameraEGaleria`, que e o que o criterio 10
/// protege: o fluxo inteiro nao le camera, nao le galeria e nao le
/// localizacao. Quem responde por isso e o portao de diretivas abaixo, que nao
/// depende desta constante.
///
/// Medido no worktree `wt-bichus-21` com o comando que a mensagem de falha
/// imprime, sobre a arvore de trabalho:
///   anterior:  648b91a93693066cc2346c754e11fca080d98101
///   agora:     e2263ed05357bf22b31f1b177fcdb3d5b28f710b
const String _arvoreDasTelas = 'e2263ed05357bf22b31f1b177fcdb3d5b28f710b';

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e assim que esta classe de defeito passa despercebida.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/$_caminhoDasTelas').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// Roda `git` e **reprova alto** quando ele falha.
///
/// Portao que nao consegue conferir precisa reprovar: um `git` ausente, um
/// diretorio que nao e repositorio ou um `HEAD` inalcancavel nao podem virar
/// silencio verde.
String _git(
  String raiz,
  List<String> argumentos,
  Map<String, String> ambiente,
) {
  final resultado = Process.runSync(
    'git',
    argumentos,
    workingDirectory: raiz,
    environment: ambiente,
  );
  if (resultado.exitCode != 0) {
    throw StateError(
      'REPROVA: `git ${argumentos.join(' ')}` saiu com ${resultado.exitCode} '
      'em "$raiz". Este portao confere a arvore pelo proprio git; sem ele nao '
      'ha o que conferir, e ficar verde assim seria pior que nao existir.\n'
      '  stderr: ${resultado.stderr}',
    );
  }
  return (resultado.stdout as String).trim();
}

/// O hash de arvore de `app/lib/telas` **como esta no disco agora**.
///
/// Usa um indice temporario (`GIT_INDEX_FILE`) para nao tocar no indice de
/// quem roda. Le a arvore de trabalho, e nao o `HEAD`: alteracao ainda nao
/// commitada precisa reprovar na hora, e nao so depois que a esteira olhar.
String _arvoreDeTelasAgora(String raiz) {
  final indice = File(
    '${Directory.systemTemp.path}/bichu-portao-$pid-'
    '${DateTime.now().microsecondsSinceEpoch}.index',
  );
  final ambiente = <String, String>{'GIT_INDEX_FILE': indice.path};
  try {
    _git(raiz, const <String>['read-tree', 'HEAD'], ambiente);
    _git(raiz, const <String>['add', '-A', '--', _caminhoDasTelas], ambiente);
    final completa = _git(raiz, const <String>['write-tree'], ambiente);
    return _git(
      raiz,
      <String>['rev-parse', '$completa:$_caminhoDasTelas'],
      ambiente,
    );
  } finally {
    if (indice.existsSync()) indice.deleteSync();
  }
}

/// O que uma tela nao pode importar, e por que.
const Map<String, String> _importesProibidos = <String, String>{
  'package:image_picker/': 'o seletor de imagem',
  'package:permission_handler/': 'o pedido de permissao',
  'dart:io': 'o sistema de arquivos',
};

void main() {
  final raiz = _raizDoRepositorio().path;
  final pastaDeTelas = Directory('$raiz/$_caminhoDasTelas');

  group('criterio 10: as telas nao mudaram uma linha', () {
    test('a pasta de telas existe e tem arquivo', () {
      // Sem isto, apagar a pasta deixaria os outros casos verdes por vazio.
      expect(
        pastaDeTelas.existsSync(),
        isTrue,
        reason: 'REPROVA: ${pastaDeTelas.path} nao existe. Este portao nao tem '
            'o que conferir, e ficar verde assim seria pior que nao existir.',
      );
    });

    test('a arvore de `$_caminhoDasTelas` e a que esta travada', () {
      final agora = _arvoreDeTelasAgora(raiz);
      expect(
        agora,
        _arvoreDasTelas,
        reason: 'REPROVA: `$_caminhoDasTelas` mudou.\n'
            '  travado:    $_arvoreDasTelas\n'
            '  encontrado: $agora\n'
            'O criterio 10 da BICHUS-161 diz que nenhuma tela muda de codigo '
            'por causa da camera embarcada: se uma precisou mudar, a porta '
            '`CameraEGaleria` esta sendo contornada, e o lugar do conserto e a '
            'porta, nao a tela.\n'
            'O hash e de ARVORE, e cobre o diretorio inteiro recursivamente: '
            'editar, criar, apagar ou renomear qualquer arquivo em qualquer '
            'subpasta muda esse valor. Para ver o que mudou:\n'
            '  git status --short -- $_caminhoDasTelas\n'
            '  git diff -- $_caminhoDasTelas\n'
            'Se a mudanca e de OUTRA historia e legitima, commite e rode\n'
            '  git rev-parse HEAD:$_caminhoDasTelas\n'
            'e troque `_arvoreDasTelas` neste arquivo, citando a chave da '
            'issue na linha. Trocar o hash precisa ser um ato deliberado, com '
            'nome e motivo no diff -- e agora custa uma linha, para que '
            'continuar sendo deliberado nao dependa de paciencia.',
      );
    });
  });

  group('o espirito do criterio 10: nenhuma tela fala com o aparelho', () {
    // Este grupo sobrevive ao dia em que a trava de arvore for destravada.
    // Ele nao cobra "a tela nao mudou", cobra "a tela nao virou a porta".
    late final List<File> telas;

    setUpAll(() {
      telas = pastaDeTelas
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();
    });

    test('ha telas para conferir', () {
      expect(
        telas.length,
        greaterThan(5),
        reason: 'REPROVA: achei ${telas.length} arquivo(s) em '
            '${pastaDeTelas.path}. O projeto tem mais que isso; um portao que '
            'varre a pasta errada passa por vazio.',
      );
    });

    test('nenhuma tela importa plugin de aparelho', () {
      // A porta existe para que a integracao com o aparelho tenha UM lugar.
      // Uma tela que importe o plugin direto contorna a porta sem precisar
      // mudar nenhuma assinatura, e nada mais pega isso.
      //
      // A leitura e por DIRETIVA, nao por texto: a forma da aspa, o escape e a
      // quebra de linha nao mudam o que o Dart importa, e nao podem mudar o
      // que este portao enxerga.
      for (final tela in telas) {
        final fonte = tela.readAsStringSync();
        for (final diretiva in lerDiretivas(fonte)) {
          for (final proibido in _importesProibidos.entries) {
            expect(
              diretiva.uri.startsWith(proibido.key),
              isFalse,
              reason: 'REPROVA: ${tela.path}:${diretiva.linha} '
                  '(${diretiva.palavra}) traz `${diretiva.uri}` '
                  '-- ${proibido.value}. Integracao com o aparelho mora em '
                  '`lib/dispositivo/`, atras da porta `CameraEGaleria`. Tela '
                  'que importa o plugin direto contorna a porta sem mudar '
                  'assinatura nenhuma, deixa de ser testavel sem aparelho, e '
                  'leva a regra de permissao para um lugar onde ela vai ser '
                  'reescrita diferente na proxima tela.',
            );
          }
        }
      }
    });

    test('nenhuma tela nomeia plugin de aparelho fora de diretiva', () {
      // A rede de seguranca do caso anterior: referencia que nao esteja num
      // `import` -- uma constante com a URI, uma biblioteca adiada -- tambem
      // reprova. Roda sobre o fonte SEM COMENTARIOS, para que uma tela possa
      // explicar em prosa que nao importa o plugin sem por isso reprovar.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final proibido in _importesProibidos.entries) {
          // `dart:io` fica de fora desta rede: e curto demais e aparece em
          // nome de simbolo legitimo. A diretiva dele ja e coberta acima.
          if (proibido.key == 'dart:io') continue;
          expect(
            codigo.contains(proibido.key),
            isFalse,
            reason: 'REPROVA: ${tela.path} nomeia `${proibido.key}` '
                '(${proibido.value}) fora de comentario. Mesmo sem um '
                '`import`, uma tela que carrega a URI do plugin esta a um '
                'passo de contornar a porta `CameraEGaleria`.',
          );
        }
      }
    });

    test('nenhuma tela abre canal de plataforma', () {
      // `package:flutter/services.dart` continua permitido: `Clipboard` e
      // `HapticFeedback` sao dele e sao de tela. O que nao e de tela e abrir
      // canal.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final canal in <String>['MethodChannel(', 'EventChannel(']) {
          expect(
            codigo.contains(canal),
            isFalse,
            reason: 'REPROVA: ${tela.path} abre um `$canal`. Canal de '
                'plataforma e da camada de dispositivo; numa tela ele nao tem '
                'como ser exercitado por teste de widget, e o estado de '
                'permissao passa a existir em dois lugares.',
          );
        }
      }
    });

    test('nenhuma tela nomeia a implementacao concreta da camera', () {
      // A tela conhece a porta, nao quem a implementa. Nomear
      // `CameraDoAparelho` faria a tela deixar de ser montavel sem aparelho, e
      // e o jeito mais discreto de contornar a injecao.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final concreta in <String>[
          'CameraDoAparelho',
          'CameraNaoEmbarcada',
        ]) {
          expect(
            codigo.contains(concreta),
            isFalse,
            reason: 'REPROVA: ${tela.path} nomeia `$concreta`. A tela recebe '
                '`CameraEGaleria` pelo escopo e nao escolhe implementacao; '
                'quem escolhe e `app.dart`, em um lugar so.',
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // O autoteste do leitor
  // -------------------------------------------------------------------------
  //
  // O portao acima so vale o que o leitor enxerga. Estes casos sao as formas
  // que o Dart aceita para a MESMA diretiva, e a aspa dupla esta aqui porque
  // ela ja passou verde uma vez. Eles ficam no repositorio porque "testei nos
  // dois sentidos e acusou certo" e afirmacao, nao evidencia: ninguem
  // reexecuta uma frase, e ela nao acusa no dia em que o leitor cegar.
  group('autoteste do leitor: as formas de escrever o mesmo import', () {
    final formas = <String, String>{
      'aspa simples': "import 'package:image_picker/image_picker.dart';",
      'aspa dupla': 'import "package:image_picker/image_picker.dart";',
      'string crua, aspa simples':
          "import r'package:image_picker/image_picker.dart';",
      'string crua, aspa dupla':
          'import r"package:image_picker/image_picker.dart";',
      'aspa tripla simples':
          "import '''package:image_picker/image_picker.dart''';",
      'aspa tripla dupla':
          'import """package:image_picker/image_picker.dart""";',
      'quebra de linha antes da URI':
          "import\n    'package:image_picker/image_picker.dart';",
      'comentario de bloco no meio':
          "import /* nota */ 'package:image_picker/image_picker.dart';",
      'comentario de linha no meio':
          "import // nota\n    'package:image_picker/image_picker.dart';",
      'literais adjacentes':
          "import 'package:' 'image_picker/image_picker.dart';",
      'escape unicode na URI':
          r"import 'package:image_picker/image_picker.dart';",
      'com prefixo `as`':
          'import "package:image_picker/image_picker.dart" as seletor;',
      'com `show`':
          "import 'package:image_picker/image_picker.dart' show ImagePicker;",
      'import condicional, na URI alternativa':
          "import 'inexistente.dart'\n"
              '    if (dart.library.io) '
              '"package:image_picker/image_picker.dart";',
      'export em vez de import':
          'export "package:image_picker/image_picker.dart";',
      'sem espaco depois da palavra-chave':
          'import"package:image_picker/image_picker.dart";',
    };

    formas.forEach((nome, fonte) {
      test('o leitor enxerga: $nome', () {
        final uris = lerDiretivas(fonte).map((d) => d.uri).toList();
        expect(
          uris.any((u) => u.startsWith('package:image_picker/')),
          isTrue,
          reason: 'REPROVA: o leitor NAO enxergou o seletor de imagem escrito '
              'como "$nome". Era exatamente assim que o portao antigo era '
              'contornado: ele casava `import` mais aspa simples, e a aspa '
              'dupla passava verde. O que o leitor devolveu: $uris\n'
              '  fonte: $fonte',
        );
      });
    });

    test('o leitor nao confunde `import` escrito dentro de uma string', () {
      // O outro lado: um portao que acusa demais e desligado por quem cansa.
      const fonte = 'const exemplo = "import \'package:image_picker/x.dart\';";';
      expect(
        lerDiretivas(fonte),
        isEmpty,
        reason: 'REPROVA: o leitor tratou o conteudo de uma string como '
            'diretiva. Falso positivo em portao estrutural nao e zelo: e o '
            'motivo pelo qual portao acaba desligado.',
      );
    });

    test('o leitor nao confunde `import` escrito num comentario', () {
      const fonte = "// import 'package:image_picker/x.dart';\nvoid main() {}";
      expect(lerDiretivas(fonte), isEmpty);
    });

    test('`semComentarios` apaga a prosa e preserva o codigo', () {
      const fonte = '// nao importamos package:image_picker aqui\n'
          "const x = 'package:image_picker/y.dart';";
      final codigo = semComentarios(fonte);
      expect(
        codigo.contains('nao importamos'),
        isFalse,
        reason: 'REPROVA: a prosa sobreviveu, e a rede de seguranca vai '
            'reprovar telas que so explicam o que nao fazem.',
      );
      expect(codigo.contains('package:image_picker/y.dart'), isTrue);
    });
  });
}
