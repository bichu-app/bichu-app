// A FOTO DO USUARIO NO AVATAR DA BARRA DE TOPO, e a cadeia de reserva.
//
// ===========================================================================
// O DEFEITO MEDIDO, e por que ele nao era de rede
// ===========================================================================
//
// Cliente, 20/10/2026, literal: *"o icone do perfil em todas as paginas nao
// esta sendo substituido pela foto do perfil do usuario quando o usuario
// cadastra, esta aparecendo sempre o icone padrao"*.
//
// A causa nao era carregamento: `AvatarDaConta` **nao aceitava imagem**. O
// construtor era `({required aoTocar, this.inicial})` -- so a primeira letra
// do nome --, e o comentario do arquivo registrava o pedido original (*"uma
// foto pequena do usuario na barra superior"*) ao lado de um circulo com
// inicial. O dado existia e o widget nao o recebia.
//
// Segundo buraco, no modelo: `SessionResponse.user` aponta para o schema `Me`,
// que tem `photo` -- entao a foto SEMPRE viajou no login, no cadastro e no
// refresh, e `Usuario.doJson` a descartava. A barra le a SESSAO, nao
// `GET /me`; sem o campo no modelo nao havia de onde tirar a URL.
//
// ===========================================================================
// OS TRES DEGRAUS, e por que cada um precisa do seu caso
// ===========================================================================
//
//   1. com foto           -> a imagem
//   2. sem foto, com nome -> a inicial
//   3. sem os dois        -> o glifo de pessoa
//
// Um caso que so afirmasse "ha um circulo na barra" passaria nos tres. Entao
// cada degrau tem asserção PROPRIA, e cada uma e negativa nos outros dois
// estados: com foto NAO ha letra solta no lugar dela, sem foto NAO ha
// `Image`, sem nome NAO ha letra. Nenhum desenho constante passa nos tres.
//
// E um quarto caso, que e o que o cliente cobrou por escrito: **a imagem que
// FALHA cai na inicial**, e nao em circulo vazio nem em glifo de imagem
// quebrada.
//
// ===========================================================================
// O `flutter_test` RESPONDE 400 A TODA IMAGEM, e isso molda os casos
// ===========================================================================
//
// Nenhuma `Image.network` desta arvore carrega bytes em teste: toda uma cai no
// `errorBuilder`. Duas consequencias, as duas deliberadas:
//
//   * o degrau 1 e medido pela ARVORE -- que `Image` foi construida, com que
//     URL e com que `cacheWidth` --, e nao por pixel pintado. E tambem a unica
//     forma honesta de medir `cacheWidth`;
//   * o caso da falha fica barato: o estado de erro e o estado natural da
//     bancada, e o que ele mede e o que sobra DEPOIS dele.
//
// ===========================================================================
// A DERIVADA E A `card`, e isso e contrato e nao escolha
// ===========================================================================
//
// `MyPhoto` tem `status`, `url` e `rejection_reason`, e `url` e descrita como
// *"a derivada `card` (512 x 512, JPEG)"*. **Nao existe `thumb_url` em
// `MyPhoto`**: a `thumb` de 176 px aparece no contrato so em
// `Conversation.participants[].photo_icon_url`. Montar a chave da `thumb` a
// partir da `card` seria o cliente derivando caminho de armazenamento. O caso
// do `cacheWidth` e o que mantem o custo em MEMORIA no tamanho do circulo.

import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'imagem_do_profissional_test.dart'
    show cacheWidthDe, imagensDeRedeEm, urlPedidaPor;

/// A derivada `card` (512 x 512) da foto do proprio usuario, como o servidor a
/// monta: dominio de midia, `people/card/`, 128 bits aleatorios no nome.
///
/// **`card` no caminho de proposito.** E por ele que o caso da derivada
/// reprovaria se alguem passasse a montar outra chave aqui.
const String fotoDoUsuario =
    'https://midia.bichu.app/people/card/9f8e7d6c5b4a3210.jpeg';

/// A rede desta bancada: **404 em tudo**.
///
/// Nenhum caso deste arquivo depende de resposta de rede, e e isso que se quer
/// provar junto: a foto da barra vem da SESSAO, nao de uma chamada. Um 404 em
/// tudo faz um caso que dependesse de `GET /me` falhar alto em vez de passar
/// por acidente.
Future<http.Response> _semRede(http.Request _) async {
  return problema('not-found', 404);
}

/// O circulo DESENHADO dentro do alvo de 48 dp.
Finder get _circulo => find.byKey(AvatarDaConta.chaveDoCirculo);

/// A letra desenhada dentro do circulo, quando ha uma.
///
/// Procura dentro do CIRCULO e nao na tela: a inicial e uma letra sozinha, e
/// `find.text('M')` acharia qualquer `M` de qualquer lugar da tela.
Finder _letraNoCirculo(String letra) {
  return find.descendant(of: _circulo, matching: find.text(letra));
}

void main() {
  group('(1) com foto: o circulo desenha a IMAGEM', () {
    testWidgets(
      'ISCA: a foto da sessao e pedida, e e a URL que o servidor mandou',
      (tester) async {
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina', fotoUrl: fotoDoUsuario),
        );

        final imagens = imagensDeRedeEm(_circulo);
        expect(
          imagens,
          hasLength(1),
          reason:
              'REPROVA: o circulo da barra de topo nao desenhou imagem '
              'nenhuma com a foto na sessao. Era o defeito que o cliente '
              'mediu: `AvatarDaConta` nao tinha parametro de imagem, e a '
              'inicial aparecia tambem para quem tem foto cadastrada.',
        );
        expect(
          urlPedidaPor(imagens.single),
          fotoDoUsuario,
          reason:
              'REPROVA: a imagem pedida nao e a foto que a sessao trouxe. A '
              'URL vem de `Me.photo.url` INTEIRA -- o app nao monta chave de '
              'armazenamento (ADR-0010 item 6).',
        );
      },
    );

    testWidgets(
      'ISCA: com foto, a INICIAL sai do circulo -- a foto substitui a letra',
      (tester) async {
        // O defeito que este caso pega, e que o de cima NAO pegaria: desenhar
        // a imagem ATRAS da letra, ou os dois empilhados. O cliente nao pediu
        // "acrescente a foto", pediu que o icone padrao fosse SUBSTITUIDO.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina', fotoUrl: fotoDoUsuario),
        );

        expect(
          find.descendant(
            of: _circulo,
            matching: find.byIcon(Icons.person_outline),
          ),
          findsNothing,
          reason:
              'REPROVA: o glifo de pessoa continuou no circulo por baixo da '
              'foto. O terceiro degrau da cadeia nao e desenho de fundo.',
        );
      },
    );

    testWidgets(
      'o `cacheWidth` segue o CIRCULO de 32 dp, e nao os 512 px do arquivo',
      (tester) async {
        // **E este caso que paga a `card`.** A derivada e de 512 x 512 porque
        // o contrato nao da outra para a propria foto; o custo em MEMORIA e o
        // do espaco pintado, e e `cacheWidth` que o decide. Sem ele, um
        // circulo de 32 dp custaria 512 x 512 x 4 = 1 MiB em toda tela de
        // secao do app.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina', fotoUrl: fotoDoUsuario),
        );

        final fator = tester.view.devicePixelRatio;
        final esperado =
            (AvatarDaConta.ladoDoCirculo * fator).round();
        expect(
          cacheWidthDe(imagensDeRedeEm(_circulo).single),
          esperado,
          reason:
              'REPROVA: a largura de decodificacao nao e a do circulo '
              '(${AvatarDaConta.ladoDoCirculo} dp a ${fator}x = $esperado px). '
              'A foto da barra aparece em TODA tela de secao, e um '
              '`cacheWidth` errado aqui custa em todas elas.',
        );
      },
    );

    testWidgets(
      'a GEOMETRIA nao mudou: alvo de 48 dp e circulo de 32 dp, com foto',
      (tester) async {
        // As medidas daquele arquivo estao pagas (o alvo de 48 contra os 64 do
        // 11.23.1, o circulo de 32 em 16..48, o respiro de 8 contra 16). A
        // foto entra DENTRO do circulo; se ela empurrar a geometria, o
        // orcamento do titulo da barra muda e titulos passam a cortar.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina', fotoUrl: fotoDoUsuario),
        );

        final alvo = tester.getSize(find.byKey(AvatarDaConta.chaveDoAlvo));
        expect(
          alvo,
          const Size(AvatarDaConta.alvo, AvatarDaConta.alvo),
          reason:
              'REPROVA: o alvo de toque deixou de ser '
              '${AvatarDaConta.alvo} x ${AvatarDaConta.alvo} dp com a foto '
              'dentro.',
        );
        expect(
          tester.getSize(_circulo),
          const Size(
            AvatarDaConta.ladoDoCirculo,
            AvatarDaConta.ladoDoCirculo,
          ),
          reason:
              'REPROVA: o circulo desenhado deixou de ser '
              '${AvatarDaConta.ladoDoCirculo} dp com a foto dentro.',
        );
      },
    );
  });

  group('(2) sem foto, com nome: o circulo desenha a INICIAL', () {
    testWidgets(
      'ISCA: conta SEM foto continua mostrando a letra do nome',
      (tester) async {
        // O degrau que ja existia, e que a foto nao pode ter quebrado: a
        // maioria das contas de hoje nao tem foto.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina'),
        );

        expect(
          _letraNoCirculo('M'),
          findsOneWidget,
          reason:
              'REPROVA: a conta sem foto perdeu a inicial. A foto entrou como '
              'PRIMEIRO degrau de uma cadeia, e nao no lugar dela.',
        );
        expect(
          imagensDeRedeEm(_circulo),
          isEmpty,
          reason:
              'REPROVA: sem foto na sessao, o circulo pediu uma imagem. '
              '`Image.network` com URL vazia lanca, e uma URL inventada seria '
              'uma requisicao por tela de secao sem nada para buscar.',
        );
      },
    );
  });

  group('(3) sem foto e sem nome: o circulo desenha o GLIFO', () {
    testWidgets(
      'ISCA: conta sem nenhum dos dois cai no glifo de pessoa',
      (tester) async {
        // **Conta sem nome existe hoje**: medido, 2 das 7 contas de
        // homologacao nao tem `display_name`.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(),
        );

        expect(
          find.descendant(
            of: _circulo,
            matching: find.byIcon(Icons.person_outline),
          ),
          findsOneWidget,
          reason:
              'REPROVA: sem foto e sem nome o circulo ficou vazio. O terceiro '
              'degrau e o glifo, e circulo vazio e o estado que nao se '
              'distingue de defeito.',
        );
        expect(imagensDeRedeEm(_circulo), isEmpty);
      },
    );
  });

  group('(4) a foto que FALHA cai na inicial, e nao em buraco', () {
    testWidgets(
      'ISCA: com a imagem recusada pela rede, a LETRA do nome aparece',
      (tester) async {
        // **O `flutter_test` responde 400 a toda requisicao de imagem**, entao
        // este e o estado natural da bancada: a `Image` e construida, falha, e
        // o `errorBuilder` desenha. O que se mede e o que sobra -- e o cliente
        // cobrou este degrau por escrito: *"Se a imagem falhar, cai na
        // inicial -- nao pode ficar circulo vazio nem quebrado"*.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(nome: 'Marina', fotoUrl: fotoDoUsuario),
        );
        // O erro chega num quadro posterior ao da construcao da `Image`.
        await tester.pumpAndSettle();

        expect(
          _letraNoCirculo('M'),
          findsOneWidget,
          reason:
              'REPROVA: a foto falhou e o circulo nao caiu na inicial. Com a '
              'reserva ausente sobra o glifo de "imagem quebrada" de '
              '`ImagemDaRede` -- que mostra um DEFEITO a quem tem nome '
              'cadastrado -- ou um circulo vazio. E a quarta falha muda do '
              'app, e ela foi recusada por nome.',
        );
        expect(
          find.descendant(
            of: _circulo,
            matching: find.byIcon(Icons.image_not_supported_outlined),
          ),
          findsNothing,
          reason:
              'REPROVA: a falha desenhou o glifo de imagem quebrada. A reserva '
              'desta superficie e a inicial, e o glifo generico e justamente '
              'o desenho que o cliente nao quer na barra de topo.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: a falha de quem NAO tem nome cai no glifo de pessoa',
      (tester) async {
        // Sem este caso, a reserva da falha poderia ser a letra `·`, ou um
        // texto fixo: com nome nulo nao HA letra, e a reserva tem de ser o
        // terceiro degrau -- o mesmo glifo do estado sem foto. Um `Text`
        // constante passaria no caso de cima e reprovaria aqui.
        await abrirOApp(
          tester,
          rede: _semRede,
          deposito: depositoLogado(fotoUrl: fotoDoUsuario),
        );
        await tester.pumpAndSettle();

        expect(
          find.descendant(
            of: _circulo,
            matching: find.byIcon(Icons.person_outline),
          ),
          findsOneWidget,
          reason:
              'REPROVA: a foto falhou numa conta sem nome e o circulo nao caiu '
              'no glifo de pessoa. A reserva da falha e a MESMA cadeia do '
              'estado sem foto, e nao um desenho proprio.',
        );
      },
    );
  });

  group('(5) a foto nao vaza para quem nao esta logado', () {
    testWidgets(
      'ISCA: deslogado o circulo e o glifo, mesmo com sessao antiga em memoria',
      (tester) async {
        // O avatar EXISTE deslogado de proposito (deslogado e estado de
        // navegacao, nao muro -- UX 5.2), e e a porta de `Entrar`. Mas a foto
        // e de uma conta, e `_fotoDaSessao` olha o ESTADO antes do usuario:
        // ler `sessao.usuario?.fotoUrl` sem conferir o estado mostraria a foto
        // de quem acabou de sair.
        await abrirOApp(tester, rede: _semRede);

        expect(
          find.byType(AvatarDaConta),
          findsOneWidget,
          reason:
              'REPROVA: o avatar desapareceu deslogado, e com ele a porta de '
              '`Entrar`.',
        );
        expect(
          imagensDeRedeEm(_circulo),
          isEmpty,
          reason: 'REPROVA: deslogado, o circulo pediu a foto de uma conta.',
        );
        expect(
          find.descendant(
            of: _circulo,
            matching: find.byIcon(Icons.person_outline),
          ),
          findsOneWidget,
        );
      },
    );
  });
}
