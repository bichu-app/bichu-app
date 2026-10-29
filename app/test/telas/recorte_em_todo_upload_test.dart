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

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/recorte_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

import 'ajuda_de_tela.dart';

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

/// Os pontos de aquisicao **sem recorte**, com o motivo, e eles sao os unicos
/// aceitos.
///
/// Os dois moram em `app/lib/telas/achado/`, que esta sob frente viva nesta
/// data e nao e desta frente. **Nao e esquecimento: e pendencia nomeada**, e o
/// caso de exaustividade reprova se um terceiro aparecer.
///
/// Quem for ligar o recorte no registro de achado apaga a linha daqui, e o
/// caso de exaustividade passa a cobra-lo. Quem acrescentar uma tela nova a
/// esta lista tem de escrever o motivo -- e o motivo e lido por gente, nao
/// pelo portao.
const Map<String, String> pendentesComMotivo = <String, String>{
  'achado/tela_registrar_achado.dart':
      'frente viva em app/lib/telas/achado/** em 29/10/2026; fora desta frente',
  'achado/tela_encontrei_este_pet.dart':
      'frente viva em app/lib/telas/achado/** em 29/10/2026; fora desta frente',
};

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
      expect(
        comAquisicao,
        10,
        reason:
            'REPROVA: a varredura achou $comAquisicao telas que pegam foto do '
            'aparelho, e o travado e 10 (8 com recorte + 2 pendentes em '
            '`achado/`). Um ponto de upload novo move este numero DE '
            'PROPOSITO: ligue o recorte nele, ou ponha-o em '
            '`pendentesComMotivo` com o motivo escrito, e atualize este '
            'numero na mesma edicao.',
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
      await tester.ensureVisible(
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

      await tester.ensureVisible(
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
}
