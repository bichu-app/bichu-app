// O CARTAO DO MURAL NO DESENHO DO INSTAGRAM — pedido do cliente de 29/10/2026:
// *"vamos melhorar a interface dos posts no mural e deixar mais parecido com o
// instagram (foto anexo), onde o texto digitado vai pra baixo dos likes e
// comentarios, o nome do usuario e a foto dele, fica sobre a imagem."*
//
// **A foto que ele citou nao chegou na mensagem.** O que substitui a referencia
// visual e o protitipo HTML em
// `workspace/artefatos-app/mural-cartao-no-desenho-do-instagram-29-10.html`, e o
// que substitui a conferencia a olho sao os casos deste arquivo.
//
// ===========================================================================
// DESLIGAR PARA VER REPROVAR — cada isca com o seu interruptor, com nome
// ===========================================================================
// Tudo abaixo foi MEDIDO, desfazendo um mecanismo de cada vez em
// `lib/telas/mural/tela_do_mural.dart` e `lib/widgets/tarja_sobre_midia.dart`.
//
//  1. Em `_CartaoDaPublicacao._comImagem`, tire a linha do autor de dentro do
//     `Stack` e ponha-a de volta acima da `ImagemDaRede`, numa `Column` (o
//     layout ANTIGO).
//     -> reprova `ISCA (ordem) — o autor fica SOBRE a imagem, dentro dela`,
//        pelo nome, dizendo o retangulo do nome e o da foto.
//
//  2. Em `_comImagem`, troque a ordem das duas filhas do `Column` de baixo:
//     legenda antes de `_AcoesDaPublicacao` (que e onde o texto estava).
//     -> reprova `ISCA (ordem) — a legenda vem DEPOIS das acoes`, dizendo as
//        duas coordenadas.
//
//  3. Em `TarjaSobreMidia.build`, troque `color: cores.surface` por
//     `color: cores.scrim` (o veu translucido, que foi a alternativa
//     descartada).
//     -> reprovam `ISCA (contraste) — o nome sobre a foto mede o PIOR CASO` nos
//        DOIS temas, **pela assercao de opacidade e nao pela da razao**:
//        medido, `alpha=0.639` no claro e `alpha=0.722` no escuro.
//
//     **E a parte que importa e a assercao que NAO reprova nesse estado**, e
//     foi medida junto: `razaoMedidaDoTexto` continua devolvendo 16,47:1 e
//     passando. Porque e exatamente isso que ela faria --
//     `_fundoSolidoMaisProximo` exige `alpha >= 1.0`, pula o veu, sobe pela
//     arvore e encontra a `surface` do CARTAO, que nao e o que a pessoa ve
//     atras do nome. O verificador nao mente: ele mede o fundo solido que
//     achar, e com veu nao ha nenhum no lugar certo.
//
//     Dai as duas assercoes, e nenhuma das duas sozinha serve: a da razao
//     guarda o PAR de cores (tinta contra preenchimento), a da opacidade
//     guarda a PREMISSA de que o par medido e o par visto. Um desenho cujo
//     contraste o portao nao consegue medir e um desenho sem portao.
//
//  4. Em `_CartaoDaPublicacao.build`, mande a publicacao SEM imagem para
//     `_comImagem` (ou faca `_semImagem` usar a ordem nova).
//     -> reprova `ISCA (sem foto) — publicacao so de texto nao perde o texto
//        para baixo das acoes`.
//
//  5. Em `TarjaSobreMidia.build`, tire o `clipBehavior`/o recuo e cole a tarja
//     na borda (recuo 0).
//     -> reprova `ISCA (ordem) — a tarja e RECUADA da borda da foto`.
//
// ===========================================================================
// POR QUE O CONTRASTE E MEDIDO E NAO AFIRMADO
// ===========================================================================
// `razaoMedidaDoTexto` e o MESMO motor do job `contraste` da esteira
// (`test/a11y/verificador.dart`): ele le a cor que de fato foi para o texto e o
// ancestral com preenchimento SOLIDO (`alpha >= 1.0`) que de fato ficou atras
// dele. Isso importa duas vezes aqui:
//
//   - **o numero e real.** Nao ha par de cores escrito a mao neste arquivo; se
//     o token mudar, o numero muda com ele;
//   - **a solidez e o pior caso.** Com a tarja opaca nao existe pixel de foto
//     entre o texto e o fundo medido -- entao a razao medida vale para foto
//     branca, foto preta e qualquer foto. E por isso que este caso nao precisa
//     (e nao poderia) carregar uma foto de verdade: ele mede a AUSENCIA da foto
//     atras do texto, que e a propriedade que garante a leitura.
//
// A conta das alternativas, para o registro (WCAG 2.1 SC 1.4.3, piso 4,5:1):
// nome `#FAFAF8` direto sobre foto branca = **1,02:1**; sobre `scrim` a 64% =
// **4,94:1**; tarja opaca = **16,47:1** (claro) e **16,02:1** (escuro).

import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/api/api_client.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/tarja_sobre_midia.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../a11y/verificador.dart' show razaoMedidaDoTexto;
import '../telas/ajuda_de_tela.dart';

const String _urlBase = 'https://api.exemplo.test';

/// A derivada `card` de 1024 da foto da publicacao.
const String _urlDaFoto = 'https://img.exemplo/people/card/aaaa.jpeg';

const String _nome = 'Marina';
const String _texto = 'o Bidu no parque';

Map<String, dynamic> _publicacao({bool comFoto = true}) {
  return <String, dynamic>{
    'ref': 'AaBbCcDdEeFfGgHhIiJjK1',
    'body': _texto,
    'created_at': '2026-10-29T12:00:00.000Z',
    'image': comFoto
        ? <String, dynamic>{'url': _urlDaFoto, 'alt_text': '[teste] a foto'}
        : null,
    'author': <String, dynamic>{
      'handle': 'marina-vet',
      'display_name': _nome,
      'photo_icon_url': null,
    },
    'mine': false,
  };
}

/// Monta o corpo do Mural com UMA publicacao, no tema pedido.
///
/// A porta e a de VERDADE (`MuralApi` sobre `ApiClient`), como no resto da
/// suite do Mural: um duble responderia igual para qualquer rota e os casos
/// nao teriam o que observar.
Future<void> _montar(
  WidgetTester tester, {
  bool comFoto = true,
  bool escuro = false,
}) async {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: MockClient((http.Request req) async {
      if (req.url.path == '/v1/timeline' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <Map<String, dynamic>>[_publicacao(comFoto: comFoto)],
          'next_cursor': null,
        });
      }
      if (req.url.path == '/v1/me/publications' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <Map<String, dynamic>>[],
          'next_cursor': null,
        });
      }
      return problema('not-found', 404);
    }),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: escuro ? BichuTheme.escuro : BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: CorpoDoMural(leitura: MuralApi(api), interacao: MuralApi(api)),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// A foto da PUBLICACAO, pela URL da derivada e nao pela ordem: o cartao
/// desenha ate duas `ImagemDaRede` (o icone do autor e a foto), e contar
/// posicao reprovaria no dia em que ele ganhasse mais uma.
Finder _aFoto() =>
    find.byWidgetPredicate((w) => w is ImagemDaRede && w.url == _urlDaFoto);

void main() {
  // =========================================================================
  // (1) A ORDEM NOVA, COM FOTO
  // =========================================================================
  group('ISCA (ordem) — a publicacao COM foto segue o pedido de 29/10', () {
    testWidgets(
      'ISCA (ordem) — o autor fica SOBRE a imagem, dentro dela',
      (tester) async {
        await _montar(tester);

        // ANCORA: o cartao chegou. Sem ela, "o nome esta sobre a foto" poderia
        // significar "a tela nao carregou nada e nao ha nada a comparar".
        expect(
          _aFoto(),
          findsOneWidget,
          reason:
              'REPROVA NA ANCORA: a foto da publicacao nao esta na arvore, e '
              'o caso nao esta medindo sobreposicao nenhuma.',
        );
        expect(find.text(_nome), findsOneWidget);

        final daFoto = tester.getRect(_aFoto());
        final doNome = tester.getRect(find.text(_nome));

        // SOBRE a imagem significa DENTRO dela, nos quatro lados. No layout
        // antigo o nome ficava ACIMA da foto: `doNome.bottom` era menor que
        // `daFoto.top`, e esta assercao reprova dizendo os dois retangulos.
        expect(
          daFoto.contains(doNome.topLeft) && daFoto.contains(doNome.bottomRight),
          isTrue,
          reason:
              'REPROVA: o nome do autor NAO esta dentro do retangulo da foto. '
              'foto=$daFoto nome=$doNome. O cliente pediu o nome e a foto do '
              'autor SOBRE a imagem; acima dela e o desenho de que ele pediu '
              'para sair.',
        );

        // E a tarja existe, e e ela que esta la: sem este `expect` o caso
        // passaria com o nome jogado direto sobre os pixeis da foto, que e
        // exatamente o desenho ilegivel que o caso de contraste proibe.
        expect(
          find.byType(TarjaSobreMidia),
          findsOneWidget,
          reason:
              'REPROVA: o autor esta sobre a imagem sem `TarjaSobreMidia`. '
              'Nome sobre foto arbitraria mede 1,02:1 contra uma foto branca.',
        );
      },
    );

    testWidgets(
      'ISCA (ordem) — a legenda vem DEPOIS das acoes',
      (tester) async {
        await _montar(tester);

        final oCoracao = tester.getRect(find.byTooltip('Curtir'));
        final aLegenda = tester.getRect(find.text(_texto));

        expect(
          aLegenda.top,
          greaterThan(oCoracao.bottom),
          reason:
              'REPROVA: a legenda esta ACIMA das acoes. legenda.top='
              '${aLegenda.top} coracao.bottom=${oCoracao.bottom}. O pedido do '
              'cliente de 29/10/2026 e explicito: *"o texto digitado vai pra '
              'baixo dos likes e comentarios"*.',
        );
      },
    );

    testWidgets(
      'ISCA (ordem) — a tarja e RECUADA da borda da foto',
      (tester) async {
        await _montar(tester);

        final daFoto = tester.getRect(_aFoto());
        final daTarja = tester.getRect(find.byType(TarjaSobreMidia));

        // Recuada e nao colada: com a foto aparecendo em volta, a tarja le como
        // estando SOBRE a imagem. Colada na borda ela leria como uma barra de
        // topo -- o desenho de que o cliente pediu para sair.
        expect(
          daTarja.left - daFoto.left,
          moreOrLessEquals(TarjaSobreMidia.recuo, epsilon: 0.5),
          reason:
              'REPROVA: a tarja nao esta recuada da borda esquerda da foto. '
              'foto=$daFoto tarja=$daTarja',
        );
        expect(
          daFoto.right - daTarja.right,
          moreOrLessEquals(TarjaSobreMidia.recuo, epsilon: 0.5),
          reason: 'REPROVA: sem recuo na borda direita. tarja=$daTarja',
        );
        expect(
          daTarja.top - daFoto.top,
          moreOrLessEquals(TarjaSobreMidia.recuo, epsilon: 0.5),
          reason: 'REPROVA: sem recuo no topo. tarja=$daTarja',
        );
      },
    );
  });

  // =========================================================================
  // (2) O CONTRASTE DO NOME SOBRE A FOTO, NO PIOR CASO
  // =========================================================================
  group('ISCA (contraste) — o nome sobre a foto mede o PIOR CASO', () {
    for (final escuro in <bool>[false, true]) {
      final tema = escuro ? 'escuro' : 'claro';

      testWidgets(
        'ISCA (contraste) — o nome sobre a foto mede o PIOR CASO, tema $tema',
        (tester) async {
          await _montar(tester, escuro: escuro);

          // A MESMA MEDICAO DO JOB `contraste`: cor que foi para o texto
          // contra o ancestral com preenchimento SOLIDO que ficou atras dele.
          final razao = razaoMedidaDoTexto(tester, _nome);

          // Piso 4,5 e o do SC 1.4.3 para tela comum do app. Cobrar 7,0 aqui
          // e deliberado: a tarja opaca entrega 16, e com margem assim o caso
          // acusa qualquer troca de token que degrade o par, nao so a que o
          // derrube abaixo do minimo legal.
          //
          // **Esta assercao guarda o PAR, e a de opacidade logo abaixo guarda
          // a PREMISSA.** Ver o item 3 do cabecalho: trocada a tarja por um
          // veu translucido, esta assercao continuaria verde -- medindo a
          // `surface` do cartao, que nao e o que fica atras do nome.
          expect(
            razao,
            greaterThanOrEqualTo(7.0),
            reason:
                'REPROVA: o nome do autor sobre a foto mede '
                '${razao.toStringAsFixed(2)}:1 no tema $tema, abaixo de 7,0. '
                'O par medido no desenho aprovado e `textPrimary` sobre a '
                '`surface` OPACA da tarja: 16,47:1 no claro e 16,02:1 no '
                'escuro. Uma razao baixa aqui significa que o fundo solido '
                'mais proximo do nome deixou de ser a tarja -- e se ele nao e '
                'a tarja, e a foto, e a foto pode ser um ceu de meio-dia.',
          );

          // E O MOTIVO DE A RAZAO VALER PARA QUALQUER FOTO: nao ha pixel de
          // foto entre o texto e o fundo medido. Translucido, o preenchimento
          // deixaria a foto participar da cor final -- e a razao acima estaria
          // medindo um fundo que a pessoa nao ve.
          // `.first` e o DecoratedBox DA TARJA: ele e o mais externo da
          // sub-arvore, e o conteudo dela (foto do autor, selo) traz os seus.
          final tarja = tester.widget<DecoratedBox>(
            find
                .descendant(
                  of: find.byType(TarjaSobreMidia),
                  matching: find.byType(DecoratedBox),
                )
                .first,
          );
          final preenchimento = (tarja.decoration as BoxDecoration).color;
          expect(
            preenchimento?.a,
            1.0,
            reason:
                'REPROVA: o preenchimento da tarja NAO e opaco '
                '(alpha=${preenchimento?.a}). Com preenchimento translucido a '
                'foto entra na cor final, a razao medida acima passa a '
                'depender dela, e o pior caso (foto branca) deixa de estar '
                'coberto.',
          );
        },
      );
    }
  });

  // =========================================================================
  // (3) A PUBLICACAO SEM FOTO — o buraco deste tipo de mudanca
  // =========================================================================
  testWidgets(
    'ISCA (sem foto) — publicacao so de texto nao perde o texto para baixo '
    'das acoes',
    (tester) async {
      await _montar(tester, comFoto: false);

      // ANCORA e CONTRAPESO ao mesmo tempo: a publicacao chegou E nao tem
      // foto. Sem ele o caso passaria numa tela que nao desenhou nada.
      expect(find.text(_texto), findsOneWidget);
      expect(
        _aFoto(),
        findsNothing,
        reason:
            'REPROVA NO CONTRAPESO: ha foto na arvore, e o caso precisa da '
            'publicacao SO DE TEXTO para medir o estado sem imagem.',
      );

      // Sem imagem nao ha onde sobrepor nada.
      expect(
        find.byType(TarjaSobreMidia),
        findsNothing,
        reason:
            'REPROVA: ha uma tarja sobre midia num cartao que nao tem midia. '
            'A tarja flutuando sobre a `surface` do cartao e uma caixa dentro '
            'de outra caixa da mesma cor.',
      );

      final oNome = tester.getRect(find.text(_nome));
      final oTexto = tester.getRect(find.text(_texto));
      final oCoracao = tester.getRect(find.byTooltip('Curtir'));

      // A ordem aqui e autor -> texto -> acoes, e ela DIVERGE do pedido de
      // 29/10 de proposito. O porque esta na prosa de
      // `_CartaoDaPublicacao.build`: texto e obrigatorio ao publicar e foto e
      // opcional, entao publicacao so de texto existe; e nela o texto nao e
      // legenda de nada, e o conteudo inteiro. **Decisao a confirmar com o
      // cliente** -- se ele quiser a ordem nova tambem aqui, e este caso que
      // muda, e a mudanca fica visivel no diff.
      expect(
        oTexto.top,
        greaterThan(oNome.bottom),
        reason:
            'REPROVA: o texto nao esta abaixo do autor. texto.top='
            '${oTexto.top} nome.bottom=${oNome.bottom}',
      );
      expect(
        oCoracao.top,
        greaterThan(oTexto.bottom),
        reason:
            'REPROVA: as acoes nao estao abaixo do texto. Numa publicacao sem '
            'foto o texto NAO e legenda: ele e a publicacao inteira, e po-lo '
            'embaixo do coracao deixaria o cartao como `$_nome / ♥ 💬 / '
            'texto`, com o conteudo abaixo dos controles que agem sobre ele. '
            'coracao.top=${oCoracao.top} texto.bottom=${oTexto.bottom}',
      );
    },
  );
}
