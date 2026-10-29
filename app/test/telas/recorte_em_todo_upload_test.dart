// "EM TODO SISTEMA QUE TEM UPLOAD DE IMAGEM OU FOTO" — um caso por ponto, mais
// a exaustividade.
//
// ===========================================================================
// O PEDIDO E A PALAVRA QUE DECIDE ESTE ARQUIVO
// ===========================================================================
// Cliente, 29/10/2026, literal: *"precisamos implementar **em todo sistema** que
// tem upload de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a
// posicao da imagem"*.
//
// "Em todo" e uma afirmacao sobre um CONJUNTO, e conjunto nao se mede com uma
// lista escrita a mao. No pedido anterior do mesmo cliente -- mascara em todos
// os campos de telefone -- sobrou campo justamente porque a lista foi
// enumerada e nao derivada. Entao este arquivo faz as duas coisas:
//
//   1. UM CASO POR PONTO DE UPLOAD, nomeado, que reprova dizendo QUAL tela
//      perdeu o recorte;
//   2. UM CASO DE EXAUSTIVIDADE, que varre `app/lib/telas` inteiro e exige que
//      todo ponto de aquisicao de foto tenha recorte -- **menos** os que estao
//      numa lista de pendentes explicita, com motivo. E ele que pega o ponto
//      de upload que NASCER amanha sem recorte, que e o que a lista a mao
//      nunca pega.
//
// ===========================================================================
// POR QUE A MEDICAO E ESTRUTURAL, E O QUE A COMPLETA
// ===========================================================================
// Montar as oito telas com arquivo de imagem em disco, abrir a folha, arrastar
// e confirmar custaria oito andaimes diferentes -- cada tela tem a sua ajuda
// de montagem, o seu servidor de mentira e o seu caminho ate o botao. O que
// este arquivo mede e mais barato e pega o defeito que importa: **a tela
// chama o ajuste entre a escolha e o uso**.
//
// A medicao estrutural sozinha seria fraca: ela ve o texto `ajustarAFoto` e
// nao ve a folha funcionando. Por isso o ultimo grupo monta UMA tela de
// verdade (F1.4, o cadastro da foto do pet), com um PNG em disco, e vai do
// toque em `Escolher da galeria` ate o retangulo que a porta recebeu. A folha
// em si, a geometria e os dois caminhos de entrada (dedo e teclado) sao
// medidos em `test/widgets/recorte_de_imagem_test.dart`, e a proporcao da
// janela em `test/widgets/recorte_segue_o_servidor_test.dart`.

import 'dart:io';

import 'package:bichu/api/modelos_perdido.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:bichu/widgets/recorte_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

import 'ajuda_de_tela.dart';
// `localizacaoConcedida` mora no arquivo de casos do achado, que e onde ela
// nasceu. Importa-la e melhor que escrever a segunda definicao: duas divergem
// na primeira mudanca da porta de localizacao.
import 'registrar_achado_test.dart'
    show avancarParaOPasso2, localizacaoConcedida;

/// A pasta das telas, relativa a `app/`.
///
/// `flutter test` roda com o diretorio de trabalho no pacote.
const String pastaDasTelas = 'lib/telas';

/// Os dois jeitos de uma tela pegar uma foto do aparelho.
///
/// Sao os unicos: `CameraEGaleria` nao tem um terceiro. Se ganhar um, ele
/// entra aqui e o caso de exaustividade passa a cobra-lo em toda tela de uma
/// vez.
final RegExp aquisicaoDeFoto = RegExp(r'\.(tirarFoto|escolherDaGaleria)\s*\(');

/// A chamada do ajuste.
final RegExp chamadaDoAjuste = RegExp(r'\bajustarAFoto\s*\(');

/// Os pontos de aquisicao **sem recorte**, com o motivo.
///
/// **ELA ESTA VAZIA, e isso e o resultado: 10 de 10 ligados.**
///
/// Ela nasceu com dois, em 29/10/2026 -- `achado/tela_registrar_achado.dart` e
/// `achado/tela_encontrei_este_pet.dart` --, por frente viva em
/// `app/lib/telas/achado/**`. A frente nao existia: os dois arquivos ja
/// estavam na `development` pelo PR #105, e a proibicao era uma lista velha.
/// Conferido, os dois entraram na mesma branch.
///
/// **VAZIA E O ESTADO MAIS PERIGOSO DESTE PORTAO**, e por isso ele nao depende
/// so dela: `expect(semRecorte, [])` aprova tambem quando a varredura nao
/// enxerga nada. Quem segura isso sao as outras duas medicoes do grupo de
/// exaustividade -- a contagem travada de pontos de aquisicao, e o autoteste
/// que roda o MESMO par de expressoes sobre fonte fabricada e exige que ele
/// ACUSE uma tela sem recorte.
///
/// Quem precisar deixar um ponto de fora escreve o motivo aqui. O motivo e
/// lido por gente, nao pelo portao -- mas o portao cobra que ele exista e que
/// o arquivo citado ainda pegue foto.
const Map<String, String> pendentesComMotivo = <String, String>{};

/// Todo `.dart` sob [pastaDasTelas], pelo caminho relativo a ela.
///
/// `followLinks: true` de proposito: `grep -r` desta maquina pula symlink em
/// silencio, e uma varredura que pulasse uma pasta inteira ficaria verde
/// medindo menos.
List<String> telasDoApp() {
  final pasta = Directory(pastaDasTelas);
  if (!pasta.existsSync()) {
    throw StateError(
      'REPROVA: $pastaDasTelas nao existe. Este portao roda com o diretorio '
      'de trabalho em `app/`.',
    );
  }
  return pasta
      .listSync(recursive: true, followLinks: true)
      .whereType<File>()
      .map((f) => f.path)
      .where((p) => p.endsWith('.dart'))
      .map((p) => p.substring(pastaDasTelas.length + 1))
      .toList()
    ..sort();
}

String fonteDaTela(String relativo) =>
    File('$pastaDasTelas/$relativo').readAsStringSync();

/// Um PNG de verdade em disco, apagado no fim do caso.
///
/// Tem de ser ARQUIVO: desde 29/10/2026 o ajuste le o CAMINHO com
/// `ImmutableBuffer.fromFilePath`, e nao passa por `bytesDaFoto` -- justamente
/// para nao mexer no contador `vezesQueLeuOsBytes`, que oito iscas deste
/// repositorio usam para afirmar que os bytes subiram, ou que nada subiu.
///
/// Um RETRATO 1200 x 1600, porque o caso que importa e o de uma foto alta indo
/// para um destino que o servidor corta.
FotoLocal retratoEmDisco() {
  final pasta = Directory.systemTemp.createTempSync('bichu-upload');
  addTearDown(() {
    if (pasta.existsSync()) pasta.deleteSync(recursive: true);
  });
  final imagem = img.Image(width: 1200, height: 1600);
  for (var y = 0; y < 1600; y++) {
    for (var x = 0; x < 1200; x++) {
      imagem.setPixelRgb(x, y, y < 800 ? 240 : 20, y < 800 ? 240 : 20, 20);
    }
  }
  final bytes = img.encodePng(imagem);
  final arquivo = File('${pasta.path}/retrato.png')..writeAsBytesSync(bytes);
  return FotoLocal(
    caminho: arquivo.path,
    tipoDeConteudo: 'image/png',
    tamanhoEmBytes: bytes.length,
  );
}

/// Toca em `Escolher da galeria` e espera a folha de ajuste abrir.
///
/// **O relogio do teste de widget e falso, e a decodificacao da imagem e E/S
/// de VERDADE.** `pumpAndSettle` sozinho volta antes de o arquivo ser lido, e
/// o caso media uma folha que nao abriu AINDA -- um nulo do relogio, nao do
/// codigo. `runAsync` com um atraso real da tempo ao mundo de fora, e o
/// `pumpAndSettle` seguinte constroi a folha que chegou.
///
/// `pumpAndSettle` DENTRO de `runAsync` nao serve: as duas bombas de quadro
/// nao coexistem, e foi assim que estes dois casos reprovaram primeiro.
Future<void> deixarAFolhaAbrir(WidgetTester tester) async {
  await tester.runAsync(() async {
    // O TOQUE TAMBEM VAI DENTRO, e foi isso que faltou na primeira tentativa:
    // a cadeia assincrona precisa NASCER fora do relogio falso. Um toque dado
    // na zona de `fakeAsync` enfileira as continuacoes naquele relogio, e
    // `runAsync` depois nao as roda -- a folha nunca chegava.
    await tester.tap(find.text('Escolher da galeria'));
    await Future<void>.delayed(const Duration(milliseconds: 400));
  });
  await tester.pumpAndSettle();
}

/// Nenhuma rota responde: estes casos nao medem rede.
Future<http.Response> semServidor(http.Request _) async =>
    http.Response('{}', 404);

void main() {
  // =========================================================================
  group('UM CASO POR PONTO DE UPLOAD: a tela ajusta entre a escolha e o uso',
      () {
    // A chave e o nome do ponto de upload como o cliente o reconheceria; o
    // valor e o arquivo. A reprovacao diz os dois.
    const pontos = <String, String>{
      'foto do pet no cadastro (F1.4)': 'pet/tela_cadastrar_foto.dart',
      'foto do pet na edicao': 'pet/tela_editar_pet.dart',
      'foto da propria pessoa (Meus dados)': 'perfil/tela_dados_pessoais.dart',
      'vitrine de fotos': 'perfil/vitrine_de_fotos.dart',
      'publicacao do Mural': 'mural/publicar_no_mural.dart',
      'foto na conversa': 'mensagens/tela_da_conversa.dart',
      'capa do encontro': 'rede/criar_encontro.dart',
      'logotipo da indicacao': 'perto/sugerir_profissional.dart',
      'registro de achado (quem TEM conta)':
          'achado/tela_registrar_achado.dart',
      'encontrei este pet (quem NAO tem conta)':
          'achado/tela_encontrei_este_pet.dart',
    };

    for (final ponto in pontos.entries) {
      test('ISCA — ${ponto.key} (${ponto.value})', () {
        // ISCA: apague a chamada de `ajustarAFoto` desta tela e volte a usar a
        // foto que o seletor devolveu. Compila, a tela funciona, o
        // `flutter analyze` fica calado, nenhum outro caso reprova -- e este
        // reprova pelo nome do ponto de upload.
        final fonte = fonteDaTela(ponto.value);
        final aquisicoes = aquisicaoDeFoto.allMatches(fonte).length;
        // A contagem vai junto do veredito: um arquivo renomeado daria zero
        // aquisicoes e zero ajustes, e o caso passaria verde medindo nada.
        expect(
          aquisicoes,
          greaterThan(0),
          reason:
              'REPROVA: "${ponto.key}" nao pega mais foto do aparelho em '
              '${ponto.value}. Ou o ponto de upload mudou de arquivo -- e esta '
              'lista tem de acompanhar --, ou ele deixou de existir.',
        );
        expect(
          chamadaDoAjuste.hasMatch(fonte),
          isTrue,
          reason:
              'REPROVA: "${ponto.key}" pega foto do aparelho ($aquisicoes '
              'chamadas) e NAO chama `ajustarAFoto`. A pessoa volta a receber '
              'o recorte automatico, que e o relato do cliente de 28/10/2026 '
              '("voce esta cropando no lugar errado").',
        );
      });
    }
  });

  // =========================================================================
  group('EXAUSTIVIDADE: "em todo sistema" nao e uma lista a mao', () {
    test('o varredor acha as telas, e a contagem vai junto', () {
      final todas = telasDoApp();
      // Guarda de lista nao vazia antes de qualquer conclusao: um varredor
      // cego devolveria lista vazia e todo `expect` abaixo seria vacuo.
      expect(
        todas.length,
        greaterThan(50),
        reason:
            'REPROVA: a varredura de $pastaDasTelas achou ${todas.length} '
            'arquivos. Isso e pouco demais para ser verdade, e um varredor '
            'cego passa verde medindo nada.',
      );
      // E ele acha, de fato, as telas que o grupo acima nomeia.
      expect(todas, contains('pet/tela_cadastrar_foto.dart'));
      expect(todas, contains('perto/sugerir_profissional.dart'));
    });

    test(
        'ISCA — TODO ponto de aquisicao de foto tem recorte, menos os '
        'pendentes NOMEADOS', () {
      // ISCA, e esta e a mais valiosa deste arquivo: acrescente uma tela nova
      // que chame `camera.escolherDaGaleria()` sem `ajustarAFoto`. Nenhum
      // caso do grupo de cima a conhece -- a lista deles e escrita a mao --, e
      // este reprova nomeando o arquivo novo.
      //
      // E o inverso tambem: apague uma linha de `pendentesComMotivo` sem
      // ligar o recorte naquela tela, e ele reprova.
      final semRecorte = <String>[];
      var comAquisicao = 0;
      for (final tela in telasDoApp()) {
        final fonte = fonteDaTela(tela);
        if (!aquisicaoDeFoto.hasMatch(fonte)) continue;
        comAquisicao += 1;
        if (chamadaDoAjuste.hasMatch(fonte)) continue;
        semRecorte.add(tela);
      }

      // A CONTAGEM, antes do veredito: se a expressao de aquisicao deixar de
      // casar (uma renomeacao de metodo na porta, por exemplo), `comAquisicao`
      // cai a zero, `semRecorte` fica vazio e o `expect` de baixo passaria
      // verde sobre um app sem recorte nenhum.
      // **ESTA CONTAGEM E O QUE TORNA A LISTA VAZIA SEGURA.** Com
      // `pendentesComMotivo` vazia, o `expect` de baixo compara duas listas
      // vazias -- e passaria igual se a varredura tivesse ficado cega. Este
      // numero e que nao passa: ele cai a zero no instante em que a expressao
      // de aquisicao deixa de casar (uma renomeacao de metodo na porta, por
      // exemplo).
      expect(
        comAquisicao,
        10,
        reason:
            'REPROVA: a varredura achou $comAquisicao telas que pegam foto do '
            'aparelho, e o travado e 10 -- os 10 pontos de upload do app, '
            'TODOS com recorte desde 29/10/2026. Um ponto de upload novo move '
            'este numero DE PROPOSITO: ligue o recorte nele, ou ponha-o em '
            '`pendentesComMotivo` com o motivo escrito, e atualize este '
            'numero na mesma edicao. Se ele caiu a ZERO, a expressao de '
            'aquisicao deixou de casar e este arquivo nao esta medindo nada.',
      );
      expect(
        semRecorte..sort(),
        pendentesComMotivo.keys.toList()..sort(),
        reason:
            'REPROVA: estas telas pegam foto do aparelho e NAO ajustam: '
            '$semRecorte. Os unicos pendentes aceitos, com motivo, sao '
            '${pendentesComMotivo.keys.toList()}.',
      );
    });

    test(
        'ISCA DO PROPRIO PORTAO — com a lista VAZIA, a comparacao ainda ACUSA '
        'uma tela sem recorte', () {
      // **O caso que impede este grupo de virar decorativo.**
      //
      // Com `pendentesComMotivo` vazia, o caso de cima faz
      // `expect(semRecorte, [])`. Isso e verdade por DOIS motivos bem
      // diferentes: porque toda tela tem recorte (o que se quer afirmar), ou
      // porque a varredura nao enxerga mais nada (o que se quer acusar). As
      // duas expressoes sao o coracao da varredura, e aqui elas sao
      // exercitadas contra fonte FABRICADA, onde a resposta certa e conhecida.
      //
      // E a mesma classe de defeito que esta casa ja viu em filtro de teste,
      // em job de CI e em grep: filtro que nao casa devolve zero e parece
      // verde.
      const semRecorte = '''
Future<void> _escolher() async {
  final foto = await Escopo.of(context).camera.escolherDaGaleria();
  if (foto != null) setState(() => _foto = foto);
}
''';
      const comRecorte = '''
Future<void> _escolher() async {
  final foto = await Escopo.of(context).camera.escolherDaGaleria();
  if (foto == null) return;
  final ajustada = await ajustarAFoto(context, camera: camera, foto: foto,
      formato: FormatoDoRecorte.quadrado);
  if (ajustada != null) setState(() => _foto = ajustada);
}
''';
      const semNada = 'class Tela extends StatelessWidget {}';

      // A tela nova SEM recorte: tem de ser enxergada E acusada.
      expect(aquisicaoDeFoto.hasMatch(semRecorte), isTrue);
      expect(chamadaDoAjuste.hasMatch(semRecorte), isFalse);

      // A tela COM recorte: enxergada e aprovada.
      expect(aquisicaoDeFoto.hasMatch(comRecorte), isTrue);
      expect(chamadaDoAjuste.hasMatch(comRecorte), isTrue);

      // E a tela que nao pega foto nao entra na conta -- se entrasse, a
      // contagem travada subiria sem nenhum ponto de upload novo.
      expect(aquisicaoDeFoto.hasMatch(semNada), isFalse);

      // `tirarFoto` conta igual a `escolherDaGaleria`: sao os dois caminhos.
      expect(
        aquisicaoDeFoto.hasMatch('await camera.tirarFoto();'),
        isTrue,
      );

      // E AGORA A COMPARACAO INTEIRA, sobre a fonte fabricada: com a lista de
      // pendentes vazia, a tela sem recorte tem de SOBRAR.
      final sobraram = <String>[];
      for (final tela in <String, String>{
        'fabricada/sem_recorte.dart': semRecorte,
        'fabricada/com_recorte.dart': comRecorte,
        'fabricada/sem_foto.dart': semNada,
      }.entries) {
        if (!aquisicaoDeFoto.hasMatch(tela.value)) continue;
        if (chamadaDoAjuste.hasMatch(tela.value)) continue;
        sobraram.add(tela.key);
      }
      expect(
        sobraram,
        <String>['fabricada/sem_recorte.dart'],
        reason:
            'REPROVA: a comparacao de exaustividade nao acusa mais uma tela '
            'que pega foto sem ajustar. Com `pendentesComMotivo` vazia, ela '
            'e a UNICA coisa que separa "todo mundo tem recorte" de "a '
            'varredura ficou cega".',
      );
      expect(pendentesComMotivo, isEmpty, reason: '10 de 10 ligados');
    });

    test('cada pendente existe, pega foto, e tem motivo escrito', () {
      // Um pendente que nao existe mais e uma licenca aberta: ela pararia de
      // acusar o dia em que o arquivo voltasse.
      for (final pendente in pendentesComMotivo.entries) {
        expect(
          File('$pastaDasTelas/${pendente.key}').existsSync(),
          isTrue,
          reason:
              'REPROVA: `${pendente.key}` esta na lista de pendentes e nao '
              'existe. Apague a linha.',
        );
        expect(
          aquisicaoDeFoto.hasMatch(fonteDaTela(pendente.key)),
          isTrue,
          reason:
              'REPROVA: `${pendente.key}` esta na lista de pendentes e nao '
              'pega mais foto. Apague a linha.',
        );
        expect(
          pendente.value.trim().length,
          greaterThan(20),
          reason:
              'REPROVA: `${pendente.key}` nao tem motivo escrito. Pendencia '
              'sem motivo e esquecimento com outro nome.',
        );
      }
    });
  });

  // =========================================================================
  group('DE VERDADE, numa tela: F1.4 vai do toque ao retangulo na porta', () {
    testWidgets(
        'ISCA — escolher da galeria abre a folha, e o enquadramento chega a '
        'porta', (tester) async {
      // Este e o caso que a medicao estrutural nao sabe fazer: ele monta a
      // tela de verdade, com um PNG em disco, toca em `Escolher da galeria`,
      // arrasta a foto e confirma -- e afirma que o retangulo que a PORTA
      // recebeu nao e o do centro.
      //
      // ISCA: em `tela_cadastrar_foto.dart`, troque `ajustada` por `foto` nas
      // duas atribuicoes ao rascunho. Compila, a folha continua abrindo e
      // fechando, e este caso reprova em `camera.recorteQuePediram`.
      final foto = retratoEmDisco();
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: foto,
      );
      final rascunho = RascunhoDePet()
        ..nome = 'Nina'
        ..especie = Especie.cao
        ..porte = Porte.medio;

      await abrirOApp(tester, rede: semServidor, camera: camera);
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunho);

      // `runAsync`: a decodificacao do arquivo e E/S de verdade e nao avanca
      // no relogio falso do teste de widget.
      await deixarAFolhaAbrir(tester);

      expect(
        find.byType(FolhaDeRecorte),
        findsOneWidget,
        reason:
            'REPROVA: escolher a foto nao abriu a folha de ajuste. O arquivo '
            'E um PNG valido em disco, entao o caminho de "nao decodifica" '
            'nao se aplica aqui.',
      );
      expect(
        camera.recorteQuePediram,
        isNull,
        reason: 'nada pode ser recortado antes de a pessoa confirmar',
      );

      await tester.drag(
        find.byKey(chaveDoPalcoDoRecorte),
        const Offset(0, -40),
      );
      await tester.pumpAndSettle();
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoRecorte.usar),
      );
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(
          find.widgetWithText(BotaoPrimario, TextosDoRecorte.usar),
        );
        await Future<void>.delayed(const Duration(milliseconds: 400));
      });
      await tester.pumpAndSettle();

      final pedido = camera.recorteQuePediram;
      expect(
        pedido,
        isNotNull,
        reason: 'REPROVA: confirmar nao pediu recorte nenhum a porta',
      );
      expect(camera.vezesQueRecortou, 1);

      // O CONTROLE: o recorte do CENTRO para a mesma janela, no mesmo
      // arquivo. Sem ele, "saiu um retangulo" passaria verde numa
      // implementacao que ignorasse o arraste -- que e o defeito relatado.
      final doCentro = EnquadramentoDaFoto(
        larguraDoArquivo: 1200,
        alturaDoArquivo: 1600,
        janela: Size(pedido!.largura.toDouble(), pedido.altura.toDouble()),
      ).recorteDoCentro;
      expect(
        pedido.y,
        greaterThan(doCentro.y),
        reason:
            'REPROVA: a foto foi arrastada para CIMA e o retangulo que chegou '
            'a porta nao desceu. A posicao escolhida nao e a que sai no envio '
            '-- que e exatamente o pedido do cliente de 29/10/2026.',
      );
      // E a janela tem a proporcao da derivada da foto de pet (1024 x 1126),
      // e nao a do arquivo: o servidor corta nela.
      expect(
        pedido.largura / pedido.altura,
        closeTo(1024 / 1126, 0.02),
        reason:
            'REPROVA: a janela de F1.4 nao tem a proporcao com que o servidor '
            'corta a foto de pet. Ver `recorte_segue_o_servidor_test.dart`.',
      );

      // E a foto que o rascunho guardou e a RECORTADA, e nao a escolhida: e
      // isso que faz o recorte chegar ao envio.
      expect(
        rascunho.foto?.caminho,
        isNot(foto.caminho),
        reason:
            'REPROVA: o rascunho guardou a foto ESCOLHIDA e nao a recortada. '
            'O ajuste teria acontecido e sido jogado fora.',
      );
    });

    testWidgets('cancelar o ajuste NAO guarda foto nenhuma no rascunho',
        (tester) async {
      // O mesmo nulo de "a pessoa desistiu de escolher": a tela nao pode
      // guardar a foto sem recorte so porque a folha abriu.
      final foto = retratoEmDisco();
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: foto,
      );
      final rascunho = RascunhoDePet()
        ..nome = 'Nina'
        ..especie = Especie.cao
        ..porte = Porte.medio;

      await abrirOApp(tester, rede: semServidor, camera: camera);
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunho);
      await deixarAFolhaAbrir(tester);

      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.widgetWithText(BotaoSecundario, TextosDoRecorte.cancelar),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(BotaoSecundario, TextosDoRecorte.cancelar),
      );
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDeRecorte), findsNothing);
      expect(rascunho.foto, isNull);
      expect(camera.vezesQueRecortou, 0);
    });
  });

  // =========================================================================
  group('DE VERDADE, no ACHADO: a foto nao se perde, e e a UNICA prova', () {
    // **POR QUE ESTES DOIS PONTOS GANHARAM CASO FIM A FIM, E NAO SO ESTRUTURAL.**
    //
    // Os cinco defeitos que as iscas deste recurso acharam valem para todo
    // ponto de upload, mas um deles pesa DIFERENTE aqui: antes do conserto, o
    // `enableDrag` do bottom sheet ganhava o gesto vertical, e arrastar a foto
    // para cima FECHAVA a folha devolvendo nulo -- a pessoa perdia a foto que
    // acabou de escolher. Numa tela de pet achado isso nao e inconveniencia:
    // a foto e a unica prova de que o animal e aquele, e quem a tirou pode
    // estar na rua, com o animal na mao, sem uma segunda chance de fotografar.
    //
    // Entao os dois casos abaixo arrastam de verdade e exigem que a foto
    // SOBREVIVA ao arraste, em cada um dos dois caminhos do achado: o de quem
    // tem conta e o de quem nao tem.

    /// Toca em `Escolher da galeria` no bloco da foto do achado.
    ///
    /// **O bloco fica no PASSO 2 e abaixo da dobra**, entao chegar nele pede
    /// `rolarAteDeCimaOuDeBaixo` -- medido em 29/10/2026, quando
    /// `ensureVisible` direto estourou `Bad state: No element`.
    Future<void> tocarEmEscolher(WidgetTester tester) async {
      final alvo = find.text(TextosDoAchado.escolherDaGaleria);
      await rolarAteDeCimaOuDeBaixo(tester, alvo);
      await tester.pumpAndSettle();
      // O toque vai DENTRO de `runAsync`: a cadeia do ajuste nasce com E/S de
      // verdade, e uma cadeia que nasce no relogio falso nao e rodada depois.
      await tester.runAsync(() async {
        await tester.tap(alvo);
        await Future<void>.delayed(const Duration(milliseconds: 400));
      });
      await tester.pumpAndSettle();
    }

    Future<void> arrastarEConfirmar(WidgetTester tester) async {
      await tester.drag(
        find.byKey(chaveDoPalcoDoRecorte),
        const Offset(0, -40),
      );
      await tester.pumpAndSettle();
      // ISCA DO DEFEITO: antes de `enableDrag: false`, a folha FECHAVA aqui,
      // devolvendo nulo -- e a foto do animal ia embora com ela.
      expect(
        find.byType(FolhaDeRecorte),
        findsOneWidget,
        reason:
            'REPROVA: arrastar a foto FECHOU a folha. Na tela de achado isso '
            'descarta a unica prova de que o animal e aquele.',
      );
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.widgetWithText(BotaoPrimario, TextosDoRecorte.usar),
      );
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(
          find.widgetWithText(BotaoPrimario, TextosDoRecorte.usar),
        );
        await Future<void>.delayed(const Duration(milliseconds: 400));
      });
      await tester.pumpAndSettle();
    }

    testWidgets(
        'ISCA — registro de achado (quem TEM conta): arrastar NAO perde a foto, '
        'e o enquadramento chega a porta', (tester) async {
      final foto = retratoEmDisco();
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: foto,
      );
      // `deposito` e `localizacao` como os casos de achado que ja existem
      // montam: sem eles a tela nao chega ao bloco da foto.
      await abrirOApp(
        tester,
        rede: semServidor,
        camera: camera,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      // O bloco da foto mora no PASSO 2 desta tela.
      await avancarParaOPasso2(tester);

      await tocarEmEscolher(tester);
      expect(
        find.byType(FolhaDeRecorte),
        findsOneWidget,
        reason: 'REPROVA: escolher a foto do achado nao abriu o ajuste',
      );
      expect(camera.recorteQuePediram, isNull);

      await arrastarEConfirmar(tester);

      final pedido = camera.recorteQuePediram;
      expect(pedido, isNotNull, reason: 'confirmar tem de pedir o recorte');
      expect(camera.vezesQueRecortou, 1);
      expect(
        pedido!.y,
        greaterThan(oCentroDoAchadoPara(pedido).y),
        reason:
            'REPROVA: a foto foi arrastada para CIMA e o retangulo nao desceu. '
            'A posicao escolhida nao e a que sai no envio.',
      );
      // A janela e a da derivada do achado (1024 x 1126), e nao a do arquivo.
      expect(
        pedido.largura / pedido.altura,
        closeTo(1024 / 1126, 0.02),
        reason:
            'REPROVA: a janela do achado nao tem a proporcao com que o '
            'servidor corta. Ver o portao que le derivadas.ts.',
      );
      // E A FOTO CONTINUA NA TELA: a previa desenha a RECORTADA.
      final previa = tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto));
      expect(
        previa.foto,
        isNotNull,
        reason:
            'REPROVA: depois do ajuste a tela do achado ficou SEM foto. Era '
            'exatamente este o defeito do arraste que fechava a folha.',
      );
      expect(
        previa.foto!.caminho,
        isNot(foto.caminho),
        reason: 'REPROVA: a previa mostra a foto ESCOLHIDA, e nao a recortada',
      );
    });

    testWidgets(
        'ISCA — encontrei este pet (quem NAO tem conta): arrastar NAO perde a '
        'foto', (tester) async {
      final foto = retratoEmDisco();
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: foto,
      );
      await abrirOApp(
        tester,
        rede: semServidor,
        camera: camera,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(
        tester,
        Rotas.encontreiEstePet,
        extra: PerdidoPublico(
          shareToken: 'tok-de-teste',
          nome: 'Nina',
          especie: Especie.cao,
          porte: Porte.medio,
          vistoPorUltimoEm: DateTime.utc(2026, 10, 28),
        ),
      );

      await tocarEmEscolher(tester);
      expect(
        find.byType(FolhaDeRecorte),
        findsOneWidget,
        reason:
            'REPROVA: o caminho de quem NAO tem conta nao abriu o ajuste. Ele '
            'sobe por `createFinderPhotoUploadIntent`, cujo `kind` '
            '(`finder_photo`) esta na MESMA `ESPECIES_DO_ACHADO` do outro -- '
            'entao o servidor o corta igual, e ele precisa do ajuste igual.',
      );

      await arrastarEConfirmar(tester);

      final pedido = camera.recorteQuePediram;
      expect(pedido, isNotNull);
      expect(camera.vezesQueRecortou, 1);
      expect(
        pedido!.y,
        greaterThan(oCentroDoAchadoPara(pedido).y),
        reason: 'REPROVA: o arraste nao chegou ao retangulo',
      );
      expect(
        pedido.largura / pedido.altura,
        closeTo(1024 / 1126, 0.02),
      );
      final previa = tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto));
      expect(previa.foto, isNotNull);
      expect(previa.foto!.caminho, isNot(foto.caminho));
    });

    testWidgets(
        'cancelar no achado NAO guarda foto, e nao e o mesmo que perder a foto',
        (tester) async {
      // A diferenca que o defeito do arraste apagava: cancelar e um ato
      // DELIBERADO, e arrastar nao era. Com `enableDrag: false` so o primeiro
      // descarta.
      final foto = retratoEmDisco();
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: foto,
      );
      // `deposito` e `localizacao` como os casos de achado que ja existem
      // montam: sem eles a tela nao chega ao bloco da foto.
      await abrirOApp(
        tester,
        rede: semServidor,
        camera: camera,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      // O bloco da foto mora no PASSO 2 desta tela.
      await avancarParaOPasso2(tester);

      await tocarEmEscolher(tester);
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.widgetWithText(BotaoSecundario, TextosDoRecorte.cancelar),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(BotaoSecundario, TextosDoRecorte.cancelar),
      );
      await tester.pumpAndSettle();

      expect(find.byType(FolhaDeRecorte), findsNothing);
      expect(camera.vezesQueRecortou, 0);
      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason:
            'REPROVA: cancelar o ajuste guardou a foto sem recorte. O nulo da '
            'folha e o MESMO nulo de nao escolher foto, e esta tela ja o '
            'trata assim.',
      );
    });
  });
}

/// O recorte do CENTRO da derivada do achado, para servir de CONTROLE.
///
/// Mesmo papel de [oCentroPara] nos casos de F1.4: sem ele, "saiu um
/// retangulo" passaria verde numa implementacao que ignorasse o arraste e
/// devolvesse o centro -- que e o defeito que o cliente relatou em 28/10.
RecorteDaFoto oCentroDoAchadoPara(RecorteDaFoto recorte) =>
    EnquadramentoDaFoto(
      larguraDoArquivo: 1200,
      alturaDoArquivo: 1600,
      janela: Size(recorte.largura.toDouble(), recorte.altura.toDouble()),
    ).recorteDoCentro;
