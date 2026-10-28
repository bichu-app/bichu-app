// O DESFECHO DO ACHADO MOSTRA A FOTO E DIZ A VERDADE -- 18/10/2026.
//
// A QUEIXA, palavra por palavra: *"Na pagina 'achado registrado' nao mostra
// muita informacao, nao tem foto do pet ou alguma informacao util"*.
//
// O QUE A TELA TINHA: titulo, dois paragrafos, uma faixa com o estado da foto
// e -- so quando o servidor mandava `area_label` -- uma linha `Região: ...`.
// Nenhuma imagem. Nada sobre o que acontece depois, nada sobre quem foi
// chamado e nada sobre o que fazer com o animal que esta do lado da pessoa.
//
// O QUE ESTE ARQUIVO MEDE, em quatro afirmacoes independentes:
//
//  1. **A FOTO DO ACHADOR E DESENHADA**, e ela e `PreviaDaFoto` -- o arquivo do
//     aparelho, com `cacheWidth` pela largura pintada. Nao e `ImagemDaRede`,
//     porque `FoundReport.photo_url` volta NULO por criterio do contrato (o 9)
//     e nao ha derivada DESSA foto a pedir.
//
//     ATENCAO AO ESCOPO DESTA AFIRMACAO -- ele mudou em 28/10/2026. Ver o
//     bloco `O VEREDITO QUE INVERTEU` abaixo.
//  2. **SEM foto, nenhum quadro nasce** -- e a faixa de texto continua dizendo
//     o estado. Quadro cinza vazio diria "faltou carregar" sobre um achado que
//     nasceu sem foto por escolha de quem o registrou.
//  3. **A TELA NAO AFIRMA QUE O TUTOR FOI AVISADO**, e esta e a metade mais
//     caprichada do arquivo. Ver o bloco `A ISCA NAO PODE SER CEGA` abaixo.
//  4. **O registro aparece**: estado, regiao e data, com o nulo de `found_at`
//     tratado sem data inventada.
//
// ---------------------------------------------------------------------------
// O VEREDITO QUE INVERTEU -- 28/10/2026
// ---------------------------------------------------------------------------
//
// **O QUE ESTE ARQUIVO MEDIA, e media certo:** que a foto desenhada no desfecho
// do achado vem do APARELHO e nao da rede. A razao escrita era que
// `FoundReport.photo_url` volta nulo por criterio do contrato -- e isso
// continua verdade, palavra por palavra. Aquele campo e a foto que o ACHADOR
// tirou, e o criterio 9 a mantem dentro da conversa mediada: assinar uma URL de
// leitura dela aqui abriria a superficie que o criterio fecha.
//
// **O QUE ERA FALSO, e so apareceu em 28/10:** a meia-frase *"e nao ha derivada
// a pedir"*. Ela estava escrita como afirmacao sobre a RESPOSTA INTEIRA, e nao
// sobre aquele campo. Nessa leitura larga ela sustentava uma conclusao que o
// contrato nao autorizava: que o achado nao tem foto nenhuma a pedir ao
// servidor. Tem -- a do PET, que e outra foto, de outra pessoa, com outra
// decisao de privacidade por tras.
//
// **POR QUE O VEREDITO INVERTEU.** Nao foi o codigo que mudou de opiniao: foi
// uma decisao do cliente, em 28/10/2026, literal -- *"pode colocar a foto e o
// nome do pet."* Ela responde a uma queixa que ele repetiu (a mesma de 18/10
// que deu origem a este arquivo) e esta registrada na emenda 7 do ADR-0010, no
// nome dele. O que a destravava era a leitura larga do item 7 daquela ADR, que
// o codigo citava para manter todo atributo de pet fora da resposta: o item
// proibe AGRUPAR pets de um tutor, e um achado tem um pet so.
//
// Desde entao `FoundReport` declara `matched_pet`, com `display_name` e
// `photo_url` -- e essa `photo_url` **e derivada de rede, e e pedida ao
// servidor**. Ela sai nos dois caminhos em que quem le ja sabe qual animal e (a
// plaquinha foi lida, ou a pessoa colou o link que o tutor publicou) e NAO sai
// no achado avulso cruzado por semelhanca, onde quem esta adivinhando e a
// maquina -- o caminho do golpe do falso achador que o cliente mediu em
// 20/10/2026.
//
// **O QUE ISSO PEDE DESTE ARQUIVO, e ainda nao esta aqui.** Os casos abaixo
// usam `_achado()`, que e `OrigemDoAchado.achadoAvulso` com `'origin':
// 'stray_report'` na rede -- o caminho em que a foto e o nome do pet NAO saem.
// Para esse caminho tudo o que este arquivo afirma continua valendo, e o
// `PreviaDaFoto` do aparelho continua sendo a unica imagem correta na tela.
//
// Falta o caso do OUTRO caminho: com `matched_pet` preenchido, a tela tem de
// desenhar a capa do pet (`ImagemDaRede`, nao `PreviaDaFoto`) e escrever o nome
// dele. Ele NAO foi escrito nesta entrega porque
// `lib/telas/achado/tela_achado_registrado.dart` ainda nao le o campo:
// escrever a assercao antes da tela produziria um caso vermelho no main, e
// escrever um `findsNothing` no lugar dela produziria um portao cego -- que e o
// defeito que o bloco seguinte existe para nao repetir.
//
// A fronteira esta medida do lado do servidor, nos dois sentidos:
// `src/modules/found/adapters/http/found-report-routes.test.ts` (48 casos) e
// `src/modules/found/adapters/persistence/so-o-pet-certo-sai-no-achado.test.ts`
// (13 casos, sobre o SQL compilado). O que falta e a tela, e e a primeira coisa
// a fechar -- enquanto ela nao fecha, a queixa do cliente continua VISIVEL para
// ele, e o item 7 do "o que esta emenda NAO decide" da emenda 7 diz isso em voz
// alta para nao passar por entregue.
//
// ---------------------------------------------------------------------------
// A ISCA NAO PODE SER CEGA, e ja foi duas vezes neste repositorio
// ---------------------------------------------------------------------------
//
// `expect(find.textContaining('o tutor foi avisado'), findsNothing)` fica
// VERDE com a tela em branco, com a rota errada e com um `Scaffold` vazio. O
// portao cego e o defeito recorrente desta casa: houve caso procurando texto
// que a tela nao diz mais (`findsNothing` vacuamente verdadeiro) e houve
// rotulo de semantica VAZIO fazendo `isNot(contains())` passar sem significar
// nada.
//
// Entao TODO caso de ausencia deste arquivo ancora primeiro no que TEM de
// existir -- o cabecalho `Quem foi avisado` e a frase `Ninguém foi avisado
// ainda` --, e so depois cobra a ausencia. Tela em branco reprova na ancora.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/telas/achado/tela_achado_registrado.dart`, apague o bloco
//     `if (resultado.foto != null) ...` que desenha `PreviaDaFoto`.
//     -> reprova `a foto do pet e desenhada, e vem do aparelho`.
//  2. No mesmo arquivo, troque a lista de linhas do bloco
//     `tituloDeQuemFoiAvisado` por
//     `<String>['O tutor foi avisado. Ele recebeu o aviso no celular agora.']`.
//     -> reprova `a tela NAO afirma que o tutor foi avisado` -- e passa a
//        ancora, que e o ponto: a reprovacao e pela mentira, nao pelo vazio.
//  3. No mesmo arquivo, apague o `BlocoDeInformacao` de
//     `tituloDoQueFazerAgora`.
//     -> reprova `a tela diz o que fazer em seguida`.
//  4. Em `textos_do_achado.dart`, troque `achadoEmTexto` por um retorno fixo
//     `'Achado em 01/01/2026'`.
//     -> reprova `a data vem de found_at, e nao de um relogio`.

import 'dart:convert';

import 'package:bichu/api/modelos_achado.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/resultado_do_achado.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

const String _idDoAchado = '01a14d3f-d95f-70b1-b31e-16d141678d34';

/// A foto no aparelho. **O caminho nao existe em disco, de proposito.**
///
/// `Image.file` sobre um arquivo ausente cai no `errorBuilder` de
/// `PreviaDaFoto`, que e exatamente o caminho que esta peca existe para ter --
/// e o que estes casos medem e que o QUADRO nasce, com o rotulo certo, e nao
/// que o decodificador do sistema funciona.
const FotoLocal _fotoDoAparelho = FotoLocal(
  caminho: '/tmp/bichu-teste/achado.jpg',
  tipoDeConteudo: 'image/jpeg',
  tamanhoEmBytes: 240 * 1024,
);

AchadoRegistrado _achado({
  String? area = 'Vila Gertrudes, São Paulo',
  DateTime? achadoEm,
  String? observacao = 'coleira azul sem placa, mancha branca no peito',
}) {
  return AchadoRegistrado(
    id: _idDoAchado,
    origem: OrigemDoAchado.achadoAvulso,
    status: StatusDoAchado.aberto,
    criadoEm: DateTime.utc(2026, 10, 18, 4, 23, 12),
    achadoEm: achadoEm,
    rotuloDaArea: area,
    observacao: observacao,
  );
}

Future<http.Response> _rede(http.Request pedido) async {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'id': _idDoAchado,
      'origin': 'stray_report',
      'status': 'open',
      'created_at': '2026-10-18T04:23:12Z',
    }),
    200,
    headers: <String, String>{'content-type': 'application/json'},
  );
}

Future<void> _abrir(
  WidgetTester tester, {
  required ResultadoDoAchado resultado,
}) async {
  // =========================================================================
  // A TELA DE TESTE E ALTA DE PROPOSITO, e isto NAO e conveniencia.
  //
  // **O desfecho ficou longo, e isso e a entrega**: foto, faixa de estado,
  // tres blocos e uma acao, onde antes havia titulo e dois paragrafos. Na
  // tela padrao do teste (800 dp) os blocos de baixo nao cabem, e `ListView`
  // **nao constroi o que nao cabe**.
  //
  // Medido, nas duas tentativas que vieram antes desta:
  //
  //  - sem rolar: cinco casos reprovaram por DOBRA e nao por conteudo;
  //  - rolando ate o fim: os casos de AUSENCIA passaram a ser **cegos**. Com a
  //    lista rolada 2000 dp, `O que a gente guardou` tinha saido da arvore por
  //    cima -- e um `findsNothing` sobre `Achado em` ficaria verde com a
  //    linha presente, por ela nunca ter sido construida. E exatamente o
  //    defeito recorrente deste repositorio.
  //
  // Com 4000 dp de altura a tela inteira esta na arvore de uma vez, sem
  // rolagem: presenca e ausencia passam a medir a mesma arvore, e nenhuma das
  // duas depende de onde a lista parou.
  // =========================================================================
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await abrirOApp(tester, rede: _rede);
  await irPara(tester, Rotas.achadoRegistrado, extra: resultado);
}

/// A ANCORA de todo caso de ausencia deste arquivo.
///
/// Ela existe para a reprovacao significar "a tela mentiu" e nunca "a tela nao
/// carregou". Sem ela, um `findsNothing` sobre a frase proibida passaria com um
/// `Scaffold` vazio na tela.
void _ancorarNoBlocoDeAviso(WidgetTester tester) {
  expect(
    find.text(TextosDoAchado.tituloDeQuemFoiAvisado),
    findsOneWidget,
    reason:
        'REPROVA NA ANCORA: o cabecalho "${TextosDoAchado.tituloDeQuemFoiAvisado}" '
        'nao esta na tela. Este caso cobra uma AUSENCIA logo abaixo, e '
        'ausencia sobre tela em branco e o portao cego que este repositorio '
        'ja produziu duas vezes. Conserte a ancora antes de ler o resto.',
  );
  expect(
    find.text(TextosDoAchado.ninguemFoiAvisado),
    findsOneWidget,
    reason:
        'REPROVA NA ANCORA: a tela nao diz "${TextosDoAchado.ninguemFoiAvisado}". '
        'Nao e delicadeza de redacao: o envio de aviso no celular nao funciona '
        'em producao (falta permissao da conta de servico na VM) e nao '
        'funciona nenhum no iPhone deste build. A frase e a mesma de '
        '`TelaCasoAberto.avisoDaFila`, onde ela diz a mesma verdade sobre o '
        'outro lado do produto.',
  );
}

void main() {
  group('a foto do pet', () {
    testWidgets('a foto do pet e desenhada, e vem do aparelho', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          achado: _achado(),
          foto: _fotoDoAparelho,
        ),
      );

      final previa = find.byType(PreviaDaFoto);
      expect(
        previa,
        findsOneWidget,
        reason:
            'REPROVA: o desfecho do achado nao desenha a foto do pet. E a '
            'queixa de 18/10 palavra por palavra -- "nao tem foto do pet". A '
            'foto do ACHADOR viaja em `ResultadoDoAchado.foto` como '
            '`FotoLocal`, porque `FoundReport.photo_url` volta NULO pelo '
            'criterio 9 -- aquela foto so e vista dentro da conversa mediada, '
            'e nao ha derivada DELA a pedir. A capa do PET e outra foto, com '
            'outra decisao: ela vem em `matched_pet` desde a emenda 7 do '
            'ADR-0010 (28/10/2026), e nao neste caminho -- `_achado()` e o '
            'achado AVULSO, onde ela nao sai.',
      );

      // **E a foto CERTA, e nao um quadro qualquer.** Sem esta assercao, um
      // `PreviaDaFoto(foto: null, vazio: '...')` satisfaria o caso acima.
      final widget = tester.widget<PreviaDaFoto>(previa);
      expect(
        widget.foto?.caminho,
        _fotoDoAparelho.caminho,
        reason:
            'REPROVA: o quadro na tela nao e a foto que a pessoa escolheu. '
            'Ele desenha "${widget.foto?.caminho}".',
      );
      expect(
        widget.descricao,
        TextosDoAchado.fotoEscolhidaDoAchado,
        reason:
            'REPROVA: a imagem nao tem o rotulo de leitor de tela do '
            'produto. Imagem sem nome e imagem muda (SC 1.1.1), e o rotulo e '
            'o MESMO do formulario -- a pessoa escolheu a foto numa tela e a '
            've desenhada em outra.',
      );

      // A QUEM A FOTO E MOSTRADA, na linha ja aprovada do formulario. Ela e
      // aviso de uso de dado: desenhar a foto sem ela seria mostrar a imagem
      // sem dizer quem a ve.
      expect(
        find.text(TextosDoAchado.fotoSoNaConversa),
        findsOneWidget,
        reason:
            'REPROVA: a tela desenha a foto e nao diz a quem ela e '
            'mostrada. `fotoSoNaConversa` e a unica linha de privacidade que '
            'sobrou do paragrafo que o cliente mandou cortar em 17/10, e ela '
            'acompanha a imagem onde a imagem aparecer.',
      );
    });

    testWidgets('a foto pede `cacheWidth`, e nao o tamanho do arquivo', (
      tester,
    ) async {
      // ========================================================================
      // **O PESO EM MEMORIA, COBRADO NA ARVORE.**
      //
      // O `ui.Image` decodificado custa `largura x altura x 4` bytes -- e nao
      // os bytes do arquivo. Foto de celular de 12,2 MP (4032 x 3024) custa
      // **48.771.072 bytes** decodificada; pedida na largura que a tela pinta
      // (984 px: 328 dp uteis x fator de pixel 3) custa **2.904.768 bytes**.
      // Medido com `ui.instantiateImageCodec`, com e sem `targetWidth`.
      //
      // `Image.file` com `cacheWidth` embrulha o provedor num `ResizeImage`
      // com a largura pedida; SEM `cacheWidth` ele fica `FileImage` cru. Esta
      // e a diferenca que a arvore mostra, e e por isso que a assercao e no
      // TIPO DO PROVEDOR -- um `expect` no widget `Image` ficaria verde com o
      // `cacheWidth` apagado.
      //
      // ISCA: em `lib/widgets/previa_da_foto.dart`, apague `cacheWidth:
      // largura` do `Image.file`. Esperado: este caso reprova dizendo que o
      // provedor e `FileImage` e nao `ResizeImage`.
      // ========================================================================
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          achado: _achado(),
          foto: _fotoDoAparelho,
        ),
      );

      final imagem = find.descendant(
        of: find.byType(PreviaDaFoto),
        matching: find.byType(Image),
      );
      expect(
        imagem,
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: nao ha `Image` dentro de `PreviaDaFoto`.',
      );

      final provedor = tester.widget<Image>(imagem).image;
      expect(
        provedor,
        isA<ResizeImage>(),
        reason:
            'REPROVA: a foto do achado e decodificada no tamanho do ARQUIVO. '
            'O provedor na arvore e `${provedor.runtimeType}`, e com '
            '`cacheWidth` ele seria `ResizeImage`. Medido: uma foto de 12,2 MP '
            '(4032 x 3024) custa 48.771.072 bytes em memoria decodificada e '
            '2.904.768 bytes pedida na largura pintada -- 16,8 vezes menos. '
            'Esta tela e o desfecho de quem esta na rua com um animal do lado, '
            'em aparelho qualquer.',
      );
      expect(
        (provedor as ResizeImage).width,
        isNotNull,
        reason: 'REPROVA: o `ResizeImage` nao tem largura alvo, e nao reduz '
            'nada.',
      );
      expect(
        provedor.width,
        greaterThan(0),
        reason: 'REPROVA: a largura alvo e ${provedor.width}. '
            '`PreviaDaFoto` a calcula como a largura PINTADA vezes o fator de '
            'pixel do aparelho -- um zero ali significa que ela nao mediu o '
            'espaco.',
      );
    });

    testWidgets('sem foto, nenhum quadro nasce -- e o estado vai em texto', (
      tester,
    ) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(achado: _achado()),
      );

      // ANCORA: a tela carregou. Sem ela o `findsNothing` abaixo passaria com
      // a rota errada.
      expect(
        find.text(TextosDoAchado.tituloDoRegistrado),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: o desfecho registrado nao esta na tela.',
      );
      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason:
            'REPROVA: o achado SEM foto ganhou um quadro. Um retangulo '
            'cinza com um icone de imagem quebrada diria "faltou carregar" '
            'sobre um registro que nasceu sem foto por escolha de quem o fez. '
            'O criterio 4 pede o estado VISIVEL, e ele esta na faixa de texto.',
      );
      expect(
        find.text(TextosDoAchado.semFoto),
        findsOneWidget,
        reason:
            'REPROVA: o estado "sem foto" deixou de ser dito. '
            '*"achado sem foto vale menos, mas vale"* -- e a frase diz o que '
            'falta sem sugerir que o achado nao existe.',
      );
    });
  });

  group('quem foi avisado', () {
    testWidgets('a tela NAO afirma que o tutor foi avisado', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          achado: _achado(),
          foto: _fotoDoAparelho,
        ),
      );

      _ancorarNoBlocoDeAviso(tester);

      // AS FRASES PROIBIDAS, escritas A MAO e nao lidas de constante.
      //
      // Comparar com `TextosDoAchado.<algo>` tornaria o caso tautologico: ele
      // ficaria verde com qualquer coisa escrita na constante, inclusive com a
      // mentira. Estas sao as palavras do defeito real -- o texto fixo que a
      // tela do achador pela tag chegou a ter enquanto o servidor devolvia
      // `owner_notified: true` e o desserializador tinha `?? true`.
      for (final frase in <String>[
        'tutor foi avisado',
        'tutor já foi avisado',
        'recebeu o aviso no celular',
        'avisamos o tutor',
        'o tutor já sabe',
      ]) {
        expect(
          find.textContaining(frase, findRichText: true),
          findsNothing,
          reason:
              'REPROVA: a tela diz "$frase". E a mentira mais cara deste '
              'produto: quem acredita que alguem foi chamado solta o animal '
              'na rua. O envio de push NAO funciona em producao (falta '
              'permissao da conta de servico na VM) e nao funciona NENHUM no '
              'iPhone deste build. Houve um dia em que tres lugares mentiam '
              'juntos sobre isto -- o servidor com `owner_notified: true`, a '
              'tela com texto fixo e o desserializador com `?? true`; os tres '
              'foram consertados e esta tela nao reabre o assunto.',
        );
      }

      // A FRASE QUE FICA, e ela nao promete toque no telefone.
      expect(
        find.text(TextosDoAchado.avisoNoCelularNaoFunciona),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao avisa que o aviso no celular nao '
            'funciona. Sem esta linha, a pessoa fica esperando um toque que '
            'nao vai chegar -- e esperar sentado e o oposto do que ela precisa '
            'fazer nas primeiras horas.',
      );

      // O QUE O TUTOR RECEBE: a linguagem JA APROVADA de
      // `tela_alcance_do_alerta.dart` e `resultado_da_abertura.dart` --
      // "a foto ... e os sinais" --, e nao uma redacao nova.
      expect(
        find.textContaining('a foto e os sinais'),
        findsOneWidget,
        reason:
            'REPROVA: o desfecho nao reusa a linguagem aprovada do '
            'produto. `Eles vão receber a foto de <nome> e os sinais` e o '
            'texto de `TelaAlcanceDoAlerta` e de `TelaCasoAberto`; aqui ele '
            'aparece sem nome, porque achado avulso e de um animal que '
            'ninguem identificou ainda. Inventar uma terceira redacao para a '
            'mesma promessa e como as tres copias divergem.',
      );
    });

    testWidgets('na FILA a tela tambem nao avisou ninguem', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.naFila(foto: _fotoDoAparelho),
      );

      // ANCORA primeiro: o estado de fila carregou.
      expect(
        find.text(TextosDoAchado.tituloDaFila),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: o estado de FILA nao esta na tela.',
      );
      _ancorarNoBlocoDeAviso(tester);

      // E a frase sobre o que o tutor recebe NAO aparece: na fila nao ha
      // achado para um tutor cruzar com nada.
      expect(
        find.textContaining('a foto e os sinais'),
        findsNothing,
        reason:
            'REPROVA: o estado de FILA promete o cruzamento com um tutor. '
            '`ResultadoDoAchado.naFila` nasce com `achado: null` -- o servidor '
            'nao viu o registro --, e o criterio 2 da BICHUS-31 proibe tela de '
            'sucesso para o que nao aconteceu.',
      );
    });
  });

  group('o que a gente guardou, e o que fazer agora', () {
    testWidgets('o registro aparece: estado, regiao e os sinais', (
      tester,
    ) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          achado: _achado(achadoEm: DateTime.utc(2026, 10, 18, 14, 5)),
          foto: _fotoDoAparelho,
        ),
      );

      expect(
        find.text(TextosDoAchado.tituloDoQueGuardamos),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao diz o que foi guardado. A queixa de 18/10 '
            'e sobre isto -- "nao mostra muita informacao".',
      );
      expect(
        find.text(TextosDoAchado.estadoEmAnalise),
        findsOneWidget,
        reason:
            'REPROVA: o estado do aviso nao aparece em PALAVRA. Ele e a '
            'mesma frase de `Meus achados` de proposito: duas palavras para o '
            'mesmo `status = "open"` fariam a pessoa achar que sao dois '
            'estados.',
      );
      expect(
        find.text('Região: Vila Gertrudes, São Paulo'),
        findsOneWidget,
        reason: 'REPROVA: a regiao que o SERVIDOR montou nao aparece.',
      );
      expect(
        find.text('coleira azul sem placa, mancha branca no peito'),
        findsOneWidget,
        reason:
            'REPROVA: os sinais que a pessoa descreveu nao aparecem. Eles '
            'sao o que o tutor vai receber, e a pessoa tem de poder reler o '
            'que escreveu.',
      );
    });

    testWidgets('a data vem de found_at, e nao de um relogio', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          // 2026-10-18T14:05Z -- um instante que NAO e hoje do relogio do
          // teste nem o `created_at` do registro. Uma tela que escrevesse
          // `DateTime.now()` ou `criadoEm` produziria outro texto.
          achado: _achado(achadoEm: DateTime.utc(2026, 10, 18, 14, 5)),
        ),
      );

      final esperado = TextosDoAchado.achadoEmTexto(
        DateTime.utc(2026, 10, 18, 14, 5),
      );
      expect(
        find.text(esperado),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao escreve "$esperado". A data e de '
            '`found_at` e do fuso de quem le; um relogio lido dentro da tela '
            'daria a data de hoje, e `criadoEm` daria a do registro.',
      );
    });

    testWidgets('found_at nulo nao vira data inventada', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(achado: _achado()),
      );

      // ANCORA: o bloco existe e tem conteudo. Sem ela o `findsNothing`
      // abaixo passaria com o bloco inteiro apagado.
      expect(
        find.text(TextosDoAchado.tituloDoQueGuardamos),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: o bloco do registro nao esta na tela.',
      );
      expect(
        find.textContaining('Achado em'),
        findsNothing,
        reason:
            'REPROVA: a tela escreveu uma data com `found_at` nulo. O '
            'campo nao esta em `FoundReport.required`, e o nulo nao vira data '
            'inventada -- a linha simplesmente nao sai.',
      );
    });

    testWidgets('a tela diz o que fazer em seguida', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(
          achado: _achado(),
          foto: _fotoDoAparelho,
        ),
      );

      expect(
        find.text(TextosDoAchado.tituloDoQueFazerAgora),
        findsOneWidget,
        reason:
            'REPROVA: o desfecho nao diz o que a pessoa faz agora. Ela '
            'esta na rua com um animal do lado, e a tela anterior a este '
            'conserto terminava sem um proximo passo.',
      );
      for (final passo in <String>[
        TextosDoAchado.passoDaPlaquinha,
        TextosDoAchado.passoDaListaDePerdidos,
        TextosDoAchado.passoDeCuidar,
      ]) {
        expect(
          find.text(passo),
          findsOneWidget,
          reason:
              'REPROVA: falta um dos tres passos. O primeiro -- a '
              'plaquinha -- e o UNICO que alcanca o tutor hoje, sem depender '
              'do aviso no celular que nao funciona.',
        );
      }
    });

    testWidgets('escanear a plaquinha tem destino de verdade', (tester) async {
      await _abrir(
        tester,
        resultado: ResultadoDoAchado.registrado(achado: _achado()),
      );

      final botao = find.widgetWithText(
        OutlinedButton,
        TextosDoAchado.escanearAPlaquinha,
      );
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: a acao de escanear nao esta na tela.',
      );
      await tocar(tester, botao);

      // A assercao e na TELA QUE ABRIU, e nao na presenca do botao: um rotulo
      // trocado satisfaria a presenca.
      //
      // **E na tela e nao na URL**, e a diferenca foi MEDIDA: o desfecho e
      // alcancado por `push` e o leitor tambem, e
      // `currentConfiguration.uri` do go_router continua devolvendo o
      // endereco da rota de BASE (`/rede`) para empilhamento imperativo. Um
      // `expect` na URL reprovava com a navegacao funcionando -- o pior tipo
      // de portao, porque manda consertar o que nao esta quebrado.
      // `TelaLeitorDeQr` na arvore e a prova direta.
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason:
            'REPROVA: "${TextosDoAchado.escanearAPlaquinha}" nao abriu o '
            'leitor de QR. O passo 1 do bloco manda olhar a plaquinha, e um '
            'passo sem porta e conselho sem caminho -- escanear e o UNICO '
            'caminho que alcanca o tutor hoje, sem depender do aviso no '
            'celular que nao funciona.',
      );
    });
  });
}
