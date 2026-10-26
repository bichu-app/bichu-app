// O CARTAO DA LISTAGEM DA COMUNIDADE: O BLOCO DE TEXTO AO LADO DA LOGO.
//
// Pedido do cliente de 26/10/2026, nas palavras dele: *"melhore a pagina da
// listagem da comunidade, depois que tiramos a descricao ficou feia e vazia.
// Coloque o segmento abaixo do titulo/nome, coloque o bairro com o pin do
// mapa"*.
//
// E o pedido de 22/10/2026, item 3: *"Alinhe o titulo do estabelecimento e a
// imagem na vertical"*. **Que ele falasse DESTE cartao e inferencia, e nao
// afirmacao do cliente**: em 22/10 aquele item foi atendido no `_Cabecalho` de
// `pagina_do_local.dart` (ver o grupo `ITEM 3` de
// `listagem_e_pagina_do_profissional_test.dart`), e a `Row` da listagem ficou
// em `CrossAxisAlignment.start` ate hoje. Os dois pedidos caem na MESMA `Row`,
// e por isso foram atendidos juntos -- mas quem leu os dois como um so fui eu.
//
// ---------------------------------------------------------------------------
// O QUE MUDOU, E O QUE NAO MUDOU
// ---------------------------------------------------------------------------
// **Nenhum item entrou e nenhum saiu.** Continuam os cinco de 22/10: logo,
// nome, segmento, bairro e `Ligar`. A media, a distancia, a apresentacao e o
// selo continuam FORA, e o grupo `ITEM 1 — ISCA` de
// `listagem_e_pagina_do_profissional_test.dart` reprova se algum voltar.
//
// O que mudou e o RECUO. Antes:
//
//     [logo] Clinica Santa Barbara
//     Clinica
//     Pinheiros
//
// O segmento e o bairro eram irmaos da `Row` da logo, dentro da `Column` do
// cartao, e comecavam na borda esquerda do cartao -- debaixo da LOGO, nao
// debaixo do nome. Agora:
//
//     [logo] Clinica Santa Barbara
//            Clinica
//            (pin) Pinheiros
//
// ---------------------------------------------------------------------------
// POR QUE A MEDICAO E DE GEOMETRIA, E NAO DE PRESENCA
// ---------------------------------------------------------------------------
// `expect(find.text('Clínica'), findsOneWidget)` passava ANTES e passa DEPOIS:
// o segmento sempre esteve na arvore, e sempre esteve abaixo do nome em ordem
// de leitura. Um caso de presenca aqui seria GUARDA e nao isca -- ele nao
// derruba a mudanca em nenhuma direcao.
//
// Entao os casos medem COORDENADA pintada:
//
// - `esquerda(segmento) == esquerda(nome)` e o que o arranjo novo produz e o
//   antigo nao: no antigo o segmento comecava 68 dp a esquerda do nome
//   (16 dp de recheio do cartao, contra 16 + 56 + 12 do nome);
// - `topo(segmento) >= base(nome)` e o eixo vertical do pedido;
// - `centro(logo) == centro(bloco)` e o item 3 de 22/10, e com
//   `CrossAxisAlignment.start` ele reprova por 20 dp e nao por arredondamento.
//
// **Tamanho pintado por `getBottomRight - getTopLeft`, nunca `getSize`.**
// `tester.getSize` devolve o tamanho de LAYOUT da caixa; `getTopLeft` e
// `getBottomRight` passam por `localToGlobal` e e isso que diz onde o pixel
// caiu. Medido nesta maquina hoje, num caso em que os dois discordaram.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO NAO AFIRMA
// ---------------------------------------------------------------------------
// **Que ficou bonito, que e exatamente o que o cliente pediu.** "Feia e vazia"
// e julgamento dele, e nenhum numero daqui mede julgamento. Estes casos
// afirmam onde cada peca caiu em dp, qual glifo e qual, e que as duas acoes do
// cartao continuam chegando ao destino. A imagem que ele vai olhar sai de
// `imagem_do_cartao_da_comunidade_test.dart`, e nem ela e o aparelho dele.

import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/icone_do_inscrito.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'icone_do_inscrito_test.dart' show detalheDoContrato, redeComDetalhe;
import 'perto_com_dados_test.dart'
    show abrirPerto, entradaDoContrato, paginaDoContrato;

/// O canal do `url_launcher`, **por extenso e nao importado do pacote**.
///
/// Mesmo criterio de `test/dispositivo/acao_externa_no_ios_test.dart`: o nome
/// e contrato entre o Dart e o nativo, e um caso que o lesse do mesmo lugar
/// que o codigo sob medicao aprovaria o dia em que os dois mudassem juntos
/// para o canal errado.
const MethodChannel _canalDoLauncher =
    MethodChannel('plugins.flutter.io/url_launcher');

/// Uma URL de logo que o `ImagemDaRede` tenta buscar.
///
/// Em teste de widget ela **falha** e o cartao cai no `simboloDeFalha`
/// (`storefront_outlined`). Isso nao estorva nenhum caso daqui: o que se mede
/// e onde a CAIXA da imagem caiu, e a caixa tem os 56 dp de
/// `BichuMoldura.larguraFotoSm` nos dois desfechos. Quem precisa dos bytes
/// pintados e a imagem de `imagem_do_cartao_da_comunidade_test.dart`, que
/// serve um PNG de verdade.
const String _logoDoLugar =
    'https://midia.bichu.app/directory-logo/sm/a1b2c3d4.jpeg';

/// O recorte do cartao que tem [nome] no titulo.
///
/// **Sempre por recorte, e nunca `find.byIcon` na tela inteira**: a aba
/// `Comunidade` da barra desenha `Icons.place_outlined` no proprio rotulo
/// (`AbaDaSecaoRede.comunidade`), e uma asserção de ausencia de pin sem
/// recorte acharia o da aba e passaria por engano.
Finder _cartaoDe(String nome) => find.ancestor(
      of: find.text(nome),
      matching: find.byType(CartaoDoDiretorio),
    );

/// A caixa pintada de [alvo]: `(esquerda, topo, direita, base)` em dp globais.
///
/// Pelas duas pontas, e nao por `getSize`: ver a prosa do topo do arquivo.
({double esquerda, double topo, double direita, double base}) _caixa(
  WidgetTester tester,
  Finder alvo,
) {
  final topoEsquerda = tester.getTopLeft(alvo);
  final baseDireita = tester.getBottomRight(alvo);
  return (
    esquerda: topoEsquerda.dx,
    topo: topoEsquerda.dy,
    direita: baseDireita.dx,
    base: baseDireita.dy,
  );
}

void main() {
  // ==========================================================================
  // 1. O SEGMENTO ENTRA NO BLOCO DO NOME
  // ==========================================================================
  group('PEDIDO DE 26/10 — o segmento fica abaixo do nome E alinhado com ele',
      () {
    // DESLIGAR PARA VER REPROVAR, e os dois desligamentos sao diferentes:
    //
    // (a) em `lib/telas/perto/lista_do_diretorio.dart`, tire o `Text` do
    //     segmento e o do bairro de dentro da `Column` do `Expanded` e
    //     devolva-os como irmaos da `Row`, que e o que o cartao fazia ate
    //     26/10/2026. O caso `e ALINHADO com o nome` reprova dizendo
    //     `esquerda 16.0 contra 84.0`; o caso `comeca DEPOIS do fim do nome`
    //     NAO reprova, e e por isso que os dois existem.
    // (b) na mesma `Column`, troque a ordem dos dois primeiros filhos (o
    //     segmento antes do nome). O caso `comeca DEPOIS do fim do nome`
    //     reprova; o de alinhamento nao.
    testWidgets('o segmento comeca DEPOIS do fim do nome, por geometria',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final cartao = _cartaoDe('Clínica Santa Bárbara');
      expect(
        cartao,
        findsOneWidget,
        reason: 'REPROVA POR VAZIO: sem o cartao na arvore nao ha geometria '
            'para medir, e todo `expect` abaixo passaria sem olhar nada.',
      );

      final nome = find.descendant(
        of: cartao,
        matching: find.text('Clínica Santa Bárbara'),
      );
      final segmento = find.descendant(of: cartao, matching: find.text('Clínica'));
      expect(
        segmento,
        findsOneWidget,
        reason: 'REPROVA POR VAZIO: o segmento `Clínica` nao esta no cartao. '
            'O cliente pediu o segmento abaixo do nome, e nao a remocao dele.',
      );

      final doNome = _caixa(tester, nome);
      final doSegmento = _caixa(tester, segmento);

      expect(
        doSegmento.topo,
        greaterThanOrEqualTo(doNome.base),
        reason: 'REPROVA: o topo do segmento esta em ${doSegmento.topo} dp e a '
            'base do nome em ${doNome.base} dp -- o segmento NAO comeca depois '
            'que o nome acaba. O cliente pediu em 26/10/2026 *"Coloque o '
            'segmento abaixo do titulo/nome"*, e `abaixo` e eixo vertical '
            'pintado, nao ordem na lista de filhos.',
      );
    });

    testWidgets('e ALINHADO com o nome, e nao debaixo da logo', (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final cartao = _cartaoDe('Clínica Santa Bárbara');
      final nome = find.descendant(
        of: cartao,
        matching: find.text('Clínica Santa Bárbara'),
      );
      final segmento = find.descendant(of: cartao, matching: find.text('Clínica'));
      final bairro = find.descendant(of: cartao, matching: find.text('Pinheiros'));
      final imagem = find.descendant(of: cartao, matching: find.byType(ImagemDaRede));

      expect(
        imagem,
        findsOneWidget,
        reason: 'REPROVA POR VAZIO: a caixa da logo nao esta na arvore, e sem '
            'ela nao ha o que o recuo do texto tenha de evitar.',
      );

      final doNome = _caixa(tester, nome);
      final doSegmento = _caixa(tester, segmento);
      final doBairro = _caixa(tester, bairro);
      final daImagem = _caixa(tester, imagem);

      // (1) O SEGMENTO COMECA ONDE O NOME COMECA. Esta e a asserção que a
      // mudanca de 26/10 produz: no arranjo antigo o segmento comecava no
      // recheio do cartao, e nao na coluna do nome.
      expect(
        doSegmento.esquerda,
        closeTo(doNome.esquerda, 0.5),
        reason: 'REPROVA: o segmento comeca em ${doSegmento.esquerda} dp e o '
            'nome em ${doNome.esquerda} dp. O segmento voltou para debaixo da '
            'logo, na borda do cartao -- que e o desenho de ate 26/10/2026 e '
            'exatamente o vazio que o cliente reclamou.',
      );

      // (2) O BAIRRO TAMBEM, e junto com o pin: a linha inteira recua.
      expect(
        doBairro.esquerda,
        greaterThan(doNome.esquerda),
        reason: 'REPROVA: o texto do bairro comeca em ${doBairro.esquerda} dp, '
            'que nao esta a direita do nome (${doNome.esquerda} dp). Dentro da '
            'coluna o texto do bairro fica DEPOIS do pin, entao ele comeca '
            'mais a direita que o nome; na borda do cartao ele comecaria '
            'antes.',
      );

      // (3) E A COLUNA COMECA DEPOIS DA LOGO, e nao em cima dela. Sem isto, um
      // recuo que por acidente coincidisse com a borda do cartao passaria em
      // (1) e (2).
      expect(
        doNome.esquerda,
        greaterThanOrEqualTo(daImagem.direita),
        reason: 'REPROVA: o nome comeca em ${doNome.esquerda} dp e a logo acaba '
            'em ${daImagem.direita} dp -- o texto esta por cima da imagem.',
      );
    });
  });

  // ==========================================================================
  // 2. O BAIRRO VEM COM O PIN DO MAPA
  // ==========================================================================
  group('PEDIDO DE 26/10 — o bairro vem com o pin do mapa', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // troque a `Row` de dentro do `if (bairro != null)` pelo `Text(bairro)`
    // sozinho, que e o que o cartao fazia ate 26/10/2026. O caso abaixo
    // reprova no `findsOneWidget` do pin.
    testWidgets('o pin esta NA linha do bairro, e a esquerda dele',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final cartao = _cartaoDe('Clínica Santa Bárbara');
      final pin = find.descendant(
        of: cartao,
        matching: find.byIcon(Icons.place_outlined),
      );
      final bairro = find.descendant(of: cartao, matching: find.text('Pinheiros'));

      // (1) UM pin, e dentro do cartao. O recorte nao e zelo: a aba
      // `Comunidade` da barra desenha o mesmo glifo.
      expect(
        pin,
        findsOneWidget,
        reason: 'REPROVA: o cartao nao tem o pin do mapa na linha do bairro. O '
            'cliente pediu em 26/10/2026 *"coloque o bairro com o pin do '
            'mapa"*.',
      );
      expect(bairro, findsOneWidget);

      final doPin = _caixa(tester, pin);
      final doBairro = _caixa(tester, bairro);

      // (2) A ESQUERDA do texto. `place_outlined` no fim da linha seria o
      // mesmo glifo dizendo outra coisa.
      expect(
        doPin.direita,
        lessThanOrEqualTo(doBairro.esquerda),
        reason: 'REPROVA: o pin acaba em ${doPin.direita} dp e o texto do '
            'bairro comeca em ${doBairro.esquerda} dp -- o pin nao esta antes '
            'do texto.',
      );

      // (3) E NA MESMA LINHA: as faixas verticais se cruzam. Sem isto, um pin
      // empurrado para outra linha da coluna passaria em (2).
      expect(
        doPin.topo,
        lessThan(doBairro.base),
        reason: 'REPROVA: o pin comeca em ${doPin.topo} dp, abaixo do fim do '
            'texto do bairro (${doBairro.base} dp): ele nao esta na linha do '
            'bairro.',
      );
      expect(
        doPin.base,
        greaterThan(doBairro.topo),
        reason: 'REPROVA: o pin acaba em ${doPin.base} dp, acima do inicio do '
            'texto do bairro (${doBairro.topo} dp): ele nao esta na linha do '
            'bairro.',
      );

      // (4) E O PIN TEM O TAMANHO DO TOKEN, e nao um numero solto. 16 dp e
      // `BichuEspaco.e4`, o mesmo de `_Linha` de `cartao_do_perdido.dart`.
      expect(
        doPin.direita - doPin.esquerda,
        closeTo(16, 0.5),
        reason: 'REPROVA: o pin tem ${doPin.direita - doPin.esquerda} dp de '
            'largura. O token e `BichuEspaco.e4` (16 dp), e um pin fora dele e '
            'valor solto na tela.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // tire o `Icon` de dentro do `if (bairro != null)` e desenhe-o como irmao
    // da `Column`, sempre. Este caso reprova; o caso acima NAO.
    testWidgets('ISCA — sem bairro nao ha pin orfao no cartao', (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(
                  slug: 'sem-bairro',
                  displayName: 'Adestrador sem bairro',
                  kind: 'trainer',
                  neighborhood: null,
                ),
                'logo_url': _logoDoLugar,
              },
              // Uma SEGUNDA entrada COM bairro, no mesmo pump: ela e o
              // controle positivo da varredura. Sem ela, um cartao que
              // tivesse perdido o pin nos DOIS estados passaria aqui.
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final semBairro = _cartaoDe('Adestrador sem bairro');
      final comBairro = _cartaoDe('Clínica Santa Bárbara');
      expect(semBairro, findsOneWidget);
      expect(comBairro, findsOneWidget);

      expect(
        find.descendant(
          of: semBairro,
          matching: find.byIcon(Icons.place_outlined),
        ),
        findsNothing,
        reason: 'REPROVA: o cartao de uma entrada SEM bairro desenhou o pin do '
            'mapa. A regra de 22/10/2026 e que sem bairro nao ha linha, e um '
            'pin sozinho e uma linha -- ele prometeria um lugar que a entrada '
            'nao tem.',
      );

      // CONTROLE POSITIVO DA VARREDURA: o mesmo recorte, no cartao vizinho,
      // ACHA o pin. Esta asserção e o que impede o `findsNothing` acima de
      // passar por `find.descendant` quebrado.
      expect(
        find.descendant(
          of: comBairro,
          matching: find.byIcon(Icons.place_outlined),
        ),
        findsOneWidget,
        reason: 'REPROVA: o recorte por cartao nao acha o pin NEM no cartao '
            'que tem bairro. A asserção de ausencia acima estaria passando no '
            'vazio.',
      );
      expect(
        find.descendant(of: semBairro, matching: find.text('São Paulo')),
        findsNothing,
        reason: 'REPROVA: a cidade apareceu como recuo do bairro ausente. O '
            'cliente pediu *"só o bairro"* em 22/10/2026.',
      );
    });
  });

  // ==========================================================================
  // 3. A LOGO CENTRA NO BLOCO DE TEXTO (pedido de 22/10, item 3)
  // ==========================================================================
  group('PEDIDO DE 22/10 — a logo centra no bloco de nome, segmento e bairro',
      () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // troque `crossAxisAlignment: CrossAxisAlignment.center` da `Row` da logo
    // de volta por `CrossAxisAlignment.start` -- que e o que ela era ate
    // 26/10/2026. Este caso reprova dizendo a diferenca em dp.
    //
    // **Medido por geometria, e nao lendo `linha.crossAxisAlignment`.** O
    // grupo `ITEM 3` de `listagem_e_pagina_do_profissional_test.dart` le a
    // propriedade, e ali ela basta porque o bloco de texto daquela `Row` e uma
    // linha so. Aqui o bloco tem tres, e ha mais de um jeito de acertar o
    // eixo: ler a propriedade aprovaria um `center` que um `Padding` dentro da
    // coluna tivesse desalinhado de novo.
    testWidgets('o centro da logo bate com o centro do bloco de texto',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final cartao = _cartaoDe('Clínica Santa Bárbara');
      final imagem = find.descendant(of: cartao, matching: find.byType(ImagemDaRede));
      final nome = find.descendant(
        of: cartao,
        matching: find.text('Clínica Santa Bárbara'),
      );
      final bairro = find.descendant(of: cartao, matching: find.text('Pinheiros'));

      final daImagem = _caixa(tester, imagem);
      final doNome = _caixa(tester, nome);
      final doBairro = _caixa(tester, bairro);

      // O BLOCO e do topo do nome a base da ultima linha de texto. Nao e a
      // `Column` por `find.byType`: o cartao tem varias, e pegar `.first`
      // mediria a do cartao e nao a do `Expanded`.
      final topoDoBloco = doNome.topo;
      final baseDoBloco = doBairro.base;
      final centroDoBloco = (topoDoBloco + baseDoBloco) / 2;
      final centroDaLogo = (daImagem.topo + daImagem.base) / 2;

      // O GUARDA CONTRA MEDIR NADA: um bloco de altura zero daria centro igual
      // ao da logo por coincidencia em qualquer eixo.
      expect(
        baseDoBloco - topoDoBloco,
        greaterThan(16),
        reason: 'REPROVA POR VAZIO: o bloco de texto mediu '
            '${baseDoBloco - topoDoBloco} dp de altura. Abaixo disso nao ha '
            'tres linhas na arvore, e a asserção de centro nao mede nada.',
      );

      expect(
        centroDaLogo,
        closeTo(centroDoBloco, 0.5),
        reason: 'REPROVA: o centro da logo esta em $centroDaLogo dp e o centro '
            'do bloco de texto em $centroDoBloco dp. O cliente pediu em '
            '22/10/2026 *"Alinhe o titulo do estabelecimento e a imagem na '
            'vertical"*, e com `CrossAxisAlignment.start` a logo encosta no '
            'topo do bloco. (Que aquele pedido falasse DESTE cartao e '
            'inferencia nossa -- ver a prosa do topo do arquivo.)',
      );

      // E A LOGO NAO ENCOSTA NO TOPO: a asserção de centro ja implica isto
      // quando o bloco e mais alto que a logo, e esta linha diz o defeito pelo
      // nome na mensagem de reprovacao.
      expect(
        daImagem.topo,
        greaterThan(topoDoBloco),
        reason: 'REPROVA: o topo da logo (${daImagem.topo} dp) coincide com o '
            'topo do bloco ($topoDoBloco dp) ou esta acima dele: ela esta '
            'grudada no topo, que e o desenho de ate 26/10/2026.',
      );
    });
  });

  // ==========================================================================
  // 4. OS DOIS CONTROLES POSITIVOS: O CARTAO SEM LOGO, E AS DUAS ACOES
  // ==========================================================================
  group('CONTROLE POSITIVO — o redesenho nao matou nada', () {
    // Sem este grupo, TODO `findsNothing` e toda asserção de coordenada deste
    // arquivo passariam num cartao que tivesse parado de desenhar: coordenada
    // de widget ausente reprova, mas ausencia de ACAO nao reprova em lugar
    // nenhum acima.
    testWidgets(
        'CONTROLE POSITIVO — sem logo o cartao desenha, e o glifo do tipo '
        'ocupa o MESMO lugar', (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              // Sem `logo_url`: o caminho do glifo.
              entradaDoContrato(
                slug: 'sem-logo',
                kind: 'vet',
                displayName: 'Veterinário do Bairro',
              ),
              // COM `logo_url`: o cartao vizinho, para a comparacao de lugar
              // ser medida e nao suposta.
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final semLogo = _cartaoDe('Veterinário do Bairro');
      final comLogo = _cartaoDe('Clínica Santa Bárbara');
      expect(
        semLogo,
        findsOneWidget,
        reason: 'REPROVA: o cartao de uma entrada SEM logo desapareceu da '
            'lista. `logo_url` nulo e a MAIORIA das entradas hoje.',
      );

      // (1) O GLIFO DO TIPO ESTA LA, e e o do `vet`.
      final glifo = find.descendant(of: semLogo, matching: find.byType(IconeDoInscrito));
      expect(
        glifo,
        findsOneWidget,
        reason: 'REPROVA: o cartao sem logo nao desenhou o glifo do tipo. '
            'Pedido do cliente de 18/10/2026: sem logo, o icone do tipo. O '
            'redesenho de 26/10 nao pode ter comido o `else` da `Row`.',
      );
      expect(
        find.descendant(
          of: semLogo,
          matching: find.byIcon(Icons.medical_services_outlined),
        ),
        findsOneWidget,
        reason: 'REPROVA: o glifo do cartao de um `vet` sem logo nao e a '
            'maleta. Um glifo generico diria menos que o anterior.',
      );

      // (2) E ELE OCUPA O MESMO LUGAR DA LOGO, medido contra o cartao vizinho.
      // Presenca na arvore nao prova lugar: um glifo de 16 dp no canto
      // passaria no `findsOneWidget` acima.
      final doGlifo = _caixa(tester, glifo);
      final daLogo = _caixa(
        tester,
        find.descendant(of: comLogo, matching: find.byType(ImagemDaRede)),
      );
      expect(
        doGlifo.esquerda,
        closeTo(daLogo.esquerda, 0.5),
        reason: 'REPROVA: o glifo comeca em ${doGlifo.esquerda} dp e a logo do '
            'cartao vizinho em ${daLogo.esquerda} dp.',
      );
      expect(
        doGlifo.direita - doGlifo.esquerda,
        closeTo(daLogo.direita - daLogo.esquerda, 0.5),
        reason: 'REPROVA: o glifo tem ${doGlifo.direita - doGlifo.esquerda} dp '
            'de largura e a logo ${daLogo.direita - daLogo.esquerda} dp. Os '
            'dois sao `BichuMoldura.larguraFotoSm`, e larguras diferentes '
            'fariam a coluna de texto comecar em lugares diferentes de um '
            'cartao para o outro.',
      );

      // (3) E O NOME CONTINUA AO LADO, nao embaixo.
      final doNome = _caixa(
        tester,
        find.descendant(of: semLogo, matching: find.text('Veterinário do Bairro')),
      );
      expect(
        doNome.esquerda,
        greaterThanOrEqualTo(doGlifo.direita),
        reason: 'REPROVA: no cartao sem logo o nome comeca em '
            '${doNome.esquerda} dp, antes do fim do glifo (${doGlifo.direita} '
            'dp).',
      );
    });

    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // troque o `InkWell(onTap: () => PaginaDoLocal.abrir(...))` por um
    // `Container` -- que e o que o cartao era antes de 18/10/2026. Este caso
    // reprova no `find.byType(PaginaDoLocal)`.
    testWidgets('CONTROLE POSITIVO — o cartao continua levando a pagina interna',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: 'Clínica Santa Bárbara'),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
          detalhe: detalheDoContrato(),
        ),
      );

      // O toque vai no `InkWell` do cartao, e `warnIfMissed` fica no padrao
      // (`true`): `tocarSemRolar` e os toques com `warnIfMissed: false`
      // "passam" com o widget coberto, e um controle coberto e exatamente o
      // defeito que um redesenho introduz.
      await tester.tap(
        find
            .descendant(
              of: _cartaoDe('Clínica Santa Bárbara'),
              matching: find.byType(InkWell),
            )
            .first,
      );
      await tester.pumpAndSettle();

      expect(
        find.byType(PaginaDoLocal),
        findsOneWidget,
        reason: 'REPROVA: tocar no cartao nao abriu a pagina do local. O '
            'redesenho de 26/10 mexeu na arvore DENTRO do `InkWell`, e um '
            '`Expanded` ou um `Row` a mais no lugar errado tira o alvo de '
            'toque sem que nenhuma asserção de coordenada acuse.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // troque o corpo de `_ligar` por `return;`. Este caso reprova na lista de
    // `abertos` vazia.
    testWidgets('CONTROLE POSITIVO — `Ligar` continua abrindo o discador',
        (tester) async {
      final abertos = <String>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_canalDoLauncher, (chamada) async {
        if (chamada.method != 'launch') return null;
        final args = chamada.arguments as Map<Object?, Object?>;
        abertos.add(args['url'] as String);
        return true;
      });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(_canalDoLauncher, null);
      });

      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(
                  displayName: 'Clínica Santa Bárbara',
                  phoneE164: '+5511987654321',
                ),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final botao = find.descendant(
        of: _cartaoDe('Clínica Santa Bárbara'),
        matching: find.text(CartaoDoDiretorio.rotuloDeLigar),
      );
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA: o cartao perdeu o botao `Ligar`. Ele e um dos cinco '
            'itens que o cliente mandou ficar em 22/10/2026.',
      );

      await tester.tap(botao);
      await tester.pumpAndSettle();

      expect(
        abertos,
        <String>['tel:+5511987654321'],
        reason: 'REPROVA: tocar em `Ligar` pediu ao sistema $abertos. O botao '
            'tem de chegar ao discador com o `tel:` do telefone comercial; '
            'lista vazia e o botao que nao faz nada, e outro esquema e o botao '
            'que faz outra coisa.',
      );
    });
  });

  // ==========================================================================
  // 5. NOME LONGO: O BLOCO QUEBRA E NAO ESTOURA
  // ==========================================================================
  group('nome longo — o bloco quebra em linhas dentro do cartao', () {
    // Nao e isca de pedido: e a medicao do caso que o `Expanded` passou a
    // governar. Antes de 26/10 o nome tinha a largura da `Row` menos a logo, e
    // o segmento tinha a largura INTEIRA do cartao; agora os tres dividem a
    // mesma coluna, e e aqui que um `Expanded` esquecido estoura.
    testWidgets('o nome longo quebra, e nada passa da borda do cartao',
        (tester) async {
      const nomeLongo =
          'Clínica Veterinária e Hospital de Especialidades Santa Bárbara '
          'de Pinheiros';
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              <String, dynamic>{
                ...entradaDoContrato(displayName: nomeLongo),
                'logo_url': _logoDoLugar,
              },
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: montar o cartao com nome longo levantou excecao -- '
            'um estouro de `Row` ou de `Column` conta aqui.',
      );

      final cartao = _cartaoDe(nomeLongo);
      final doCartao = _caixa(tester, cartao);
      final doNome = _caixa(
        tester,
        find.descendant(of: cartao, matching: find.text(nomeLongo)),
      );
      final doBairro = _caixa(
        tester,
        find.descendant(of: cartao, matching: find.text('Pinheiros')),
      );

      // (1) O NOME QUEBROU DE VERDADE: mais de uma linha. Sem esta asserção o
      // caso mediria um nome que caberia numa linha e nao provaria nada.
      expect(
        doNome.base - doNome.topo,
        greaterThan(30),
        reason: 'REPROVA POR VAZIO: o nome longo ocupou '
            '${doNome.base - doNome.topo} dp de altura, ou seja UMA linha. A '
            'massa deste caso precisa quebrar, senao ele nao mede quebra.',
      );

      // (2) E NADA SAIU DA MOLDURA.
      expect(
        doNome.direita,
        lessThanOrEqualTo(doCartao.direita),
        reason: 'REPROVA: o nome vai ate ${doNome.direita} dp e o cartao acaba '
            'em ${doCartao.direita} dp.',
      );
      expect(
        doBairro.base,
        lessThanOrEqualTo(doCartao.base),
        reason: 'REPROVA: a linha do bairro acaba em ${doBairro.base} dp, '
            'abaixo da base do cartao (${doCartao.base} dp).',
      );

      // (3) E O SEGMENTO CONTINUA DEPOIS DO NOME, com ele em tres linhas.
      final doSegmento = _caixa(
        tester,
        find.descendant(of: cartao, matching: find.text('Clínica')),
      );
      expect(
        doSegmento.topo,
        greaterThanOrEqualTo(doNome.base),
        reason: 'REPROVA: com nome longo o segmento (topo ${doSegmento.topo} '
            'dp) subiu para dentro do nome (base ${doNome.base} dp).',
      );
    });
  });
}
