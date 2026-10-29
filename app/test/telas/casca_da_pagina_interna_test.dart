// A CASCA DAS PAGINAS INTERNAS: o titulo sai, o `Voltar` e UM SO para as duas.
//
// Pedido do cliente, 28/10/2026, literal: *"na pagina interna da comunidade,
// vamos tirar o titulo e manter o padrao do botao voltar igual da pagina de
// eventos."*
//
// O pedido tem DUAS metades, e a segunda e a que decide o desenho: "o mesmo
// padrao" nao e "parecido com". A ficha do evento
// (`telas/rede/encontro_da_rede.dart`) ja tinha capa com `Voltar` flutuante e
// a barra que entra na rolagem; a ficha do local
// (`telas/perto/pagina_do_local.dart`) tinha `AppBar` com o nome no titulo.
// Copiar a casca de uma para a outra faria DUAS copias da mesma regra, e duas
// copias divergem na primeira edicao. Entao a casca saiu das duas telas e
// virou `widgets/casca_da_pagina_interna.dart`, e os casos abaixo medem que as
// DUAS a consomem -- nao que elas se parecem.
//
// ## O QUE GUARDA A ACESSIBILIDADE, e por que ela nao piorou
//
// Tirar o titulo da barra tiraria o nome do leitor de tela se o nome estivesse
// SO ali. O grupo (3) mede que ele nao esta: quem anuncia a pagina e o
// `Semantics` de ROTA (`namesRoute`), com `Local: <nome>` -- o MESMO mecanismo
// que a ficha do evento usa desde a UX 28.7.2. Antes desta mudanca o nome era
// anunciado DUAS vezes (a rota e o titulo); agora, uma.
//
// Os casos de (3) NAO sao isca: eles passavam antes e tem de continuar
// passando. Sao contrapeso -- sem eles, "tirei o titulo" e indistinguivel de
// "tirei o nome de quem nao ve a tela".

import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/casca_da_pagina_interna.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart' show lerDoPacoteDoApp;
import 'listagem_e_pagina_do_profissional_test.dart' show fotoDoLugar;
import 'telefone_fora_da_tela_test.dart'
    show abrirOLocal, detalheComTudo, redeDoLocal, semanticaDaTela;

/// O detalhe COM a faixa 16:9, que e o caso em que o `Voltar` flutua.
Map<String, dynamic> detalheComFaixa() => <String, dynamic>{
      ...detalheComTudo(),
      'photo_url': fotoDoLugar,
    };

void main() {
  group('(1) a pagina do local nao tem mais titulo de barra', () {
    testWidgets('ISCA: nao ha `AppBar` na pagina pronta', (tester) async {
      await abrirOLocal(tester, rede: redeDoLocal(detalhe: detalheComFaixa()));

      expect(
        find.descendant(
          of: find.byType(PaginaDoLocal),
          matching: find.byType(AppBar),
        ),
        findsNothing,
        reason: 'REPROVA: a pagina do local ainda desenha `AppBar`. O cliente '
            'mandou tirar o titulo em 28/10/2026, e a ficha do evento -- que e '
            'o padrao que ele citou -- nao tem barra com titulo na fase '
            'pronta.',
      );
    });

    testWidgets(
      'ISCA: o nome do local nao e desenhado DENTRO de uma barra de topo',
      (tester) async {
        await abrirOLocal(
          tester,
          rede: redeDoLocal(detalhe: detalheComFaixa()),
        );

        // CONTRAPESO PRIMEIRO: o nome esta na tela. Sem esta ancora, o
        // `findsNothing` abaixo passaria numa pagina que nao desenhou NADA --
        // e foi exatamente esse o risco medido ao escrever este caso. Com a
        // barra de topo de 64 dp mais a barra de abas, a janela do `ListView`
        // ficava com 464 dp e a capa 16:9 de 800 dp de largura ocupava 450
        // deles: o cabecalho do corpo nascia ABAIXO da dobra e nao era
        // construido. Entao, antes desta mudanca, a UNICA ocorrencia do nome na
        // arvore era a do titulo -- medido, nao suposto.
        expect(
          find.text('Clínica Santa Bárbara'),
          findsWidgets,
          reason: 'REPROVA: o nome do local nao esta na tela de forma nenhuma. '
              'O `findsNothing` abaixo ficaria verde sem medir nada.',
        );

        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.text('Clínica Santa Bárbara'),
          ),
          findsNothing,
          reason: 'REPROVA: o nome do local ainda e o titulo de uma barra de '
              'topo. O cliente mandou tirar o titulo: o nome mora no corpo da '
              'pagina (e na barra que entra com a rolagem), nunca num titulo '
              'fixo.',
        );
      },
    );
  });

  group('(2) o `Voltar` e o mesmo padrao da ficha do evento', () {
    testWidgets(
      'ISCA: com capa, o `Voltar` e o botao SOBRE MIDIA',
      (tester) async {
        await abrirOLocal(
          tester,
          rede: redeDoLocal(detalhe: detalheComFaixa()),
        );

        expect(
          find.byType(BotaoVoltarSobreMidia),
          findsOneWidget,
          reason: 'REPROVA: a pagina do local nao desenha o `Voltar` sobre a '
              'capa. E o padrao da ficha do evento: 48 dp, fundo `surface` e '
              'sombra propria, para o contraste nao depender da foto.',
        );
        // E ele e ANUNCIAVEL: `IconButton` sem `tooltip` e anunciado como
        // "botao" e nada mais (WCAG 2.1 SC 4.1.2), e o portao de saida de
        // `barra_fixa_em_toda_tela_test.dart` cobra a palavra.
        expect(find.byTooltip('Voltar'), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: SEM capa a barra nasce visivel, com `Voltar` e com o nome',
      (tester) async {
        // `detalheComTudo` tem `photo_url: null`, que e o estado NORMAL em tres
        // casos (sem foto, processando, recusada nos bytes) e a maioria das
        // entradas. Sem capa nao ha sobre o que flutuar: um botao redondo
        // pousaria em cima do nome.
        await abrirOLocal(tester, rede: redeDoLocal(detalhe: detalheComTudo()));

        expect(
          find.byType(BotaoVoltarSobreMidia),
          findsNothing,
          reason: 'REPROVA: a pagina sem foto desenhou o botao SOBRE MIDIA, e '
              'nao ha midia. Ele pousaria em cima do nome do local.',
        );
        expect(
          find.byType(BotaoVoltarNaBarra),
          findsOneWidget,
          reason: 'REPROVA: a pagina sem foto ficou sem a barra, e portanto '
              'sem `Voltar` com fundo proprio.',
        );
        expect(find.byTooltip('Voltar'), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: as DUAS fichas usam a MESMA casca, e nao uma parecida',
      (tester) async {
        await abrirOLocal(
          tester,
          rede: redeDoLocal(detalhe: detalheComFaixa()),
        );

        expect(
          find.byType(CascaDaPaginaInterna),
          findsOneWidget,
          reason: 'REPROVA: a pagina do local desenha uma casca PROPRIA. O '
              'cliente pediu "o mesmo padrao", e duas copias da mesma regra '
              'divergem na primeira edicao -- que e o defeito que este pedido '
              'conserta.',
        );
      },
    );

    test('ISCA: a ficha do EVENTO tambem consome a casca compartilhada', () {
      // Medido na FONTE, e nao na arvore de widgets: montar a ficha do evento
      // custa uma bancada de rede propria, e o que importa aqui e que ela nao
      // tenha ficado com a copia local depois da extracao. Um caso que so
      // medisse a pagina do local deixaria a metade do reaproveitamento sem
      // cobertura -- e o reaproveitamento E o pedido.
      // `lerDoPacoteDoApp` e o ponto unico do projeto para isto, e ele
      // REPROVA ALTO quando nao acha o arquivo: leitura que devolvesse cadeia
      // vazia faria as duas assercoes abaixo passarem no vazio.
      final fonte = lerDoPacoteDoApp('lib/telas/rede/encontro_da_rede.dart');
      expect(
        fonte,
        contains("import '../../widgets/casca_da_pagina_interna.dart'"),
        reason: 'REPROVA: `telas/rede/encontro_da_rede.dart` nao importa a '
            'casca compartilhada. Se a extracao deixou a copia privada la, as '
            'duas telas voltaram a ter duas cascas.',
      );
      expect(
        fonte,
        isNot(contains('class _BotaoVoltarSobreMidia')),
        reason: 'REPROVA: a ficha do evento ainda tem a copia PRIVADA do botao '
            'sobre midia. Ela saiu para `widgets/`, e deixar as duas e deixar '
            'a divergencia nascer.',
      );
    });
  });

  group('(3) CONTRAPESO: o nome do local continua anunciavel', () {
    testWidgets(
      'o leitor de tela anuncia `Local: <nome>` mesmo sem titulo na barra',
      (tester) async {
        await abrirOLocal(
          tester,
          rede: redeDoLocal(detalhe: detalheComFaixa()),
        );

        expect(
          semanticaDaTela(tester),
          contains('Local: Clínica Santa Bárbara'),
          reason: 'REPROVA: tirar o titulo da barra tirou o nome do local do '
              'leitor de tela. O nome tem de continuar anunciavel -- quem '
              'anuncia e o `Semantics` de ROTA da casca (`namesRoute`), e e o '
              'mesmo mecanismo da ficha do evento.',
        );
      },
    );

    testWidgets(
      'e sem foto tambem, que e o caso da maioria das entradas',
      (tester) async {
        await abrirOLocal(tester, rede: redeDoLocal(detalhe: detalheComTudo()));

        expect(
          semanticaDaTela(tester),
          contains('Local: Clínica Santa Bárbara'),
          reason: 'REPROVA: a pagina sem foto deixou de anunciar o nome.',
        );
      },
    );
  });
}
