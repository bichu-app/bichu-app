// BICHUS-233 (e BICHUS-230, que e o mesmo achado nao refinado) — os glifos da
// barra de baixo, e nenhuma secao repetindo campo semantico.
//
// **ESTE ARQUIVO CHAMAVA-SE `icone_de_perto_test.dart`, e o nome morreu com a
// secao (19/10/2026).** `Perto` deixou de ser secao: o conteudo dela virou a
// aba `Comunidade` da `Rede`, e `Mural` entrou no slot que a barra abriu. O
// arquivo foi RENOMEADO e nao apagado, porque as tres afirmacoes dele nao eram
// sobre `Perto` -- elas eram sobre a BARRA, e `Perto` era so o caso que as
// motivou.
//
// A isca 1 mudou de dono: ela media o alfinete de `Perto` e agora mede o
// glifo de `Mural`, que e a escolha nova. A guarda contra `storefront`
// **ficou**: o achado do cliente de 22/09 continua valendo para qualquer
// secao, e `Loja` continua na barra com a sacola.
//
// ---------------------------------------------------------------------------
// O achado original, que segue sendo a razao de este arquivo existir
// ---------------------------------------------------------------------------
//
// Pedido do cliente em 22/09/2026, depois do primeiro teste em aparelho
// fisico: "o icone do menu perto, parece de uma loja, troque para algo que
// fale mais sobre localizacao, como um pin."
//
// **Ele tem razao por construcao, e nao por gosto.** `storefront` desenha uma
// fachada de loja e ficava a dois slots de `shopping_bag`, a sacola de `Loja`.
// A UX 27.3 registrou que o rotulo curto TRANSFERIU o significado para o
// icone; dois glifos do mesmo campo desfazem justamente a transferencia de que
// a barra de cinco depende.
//
// As tres afirmacoes deste arquivo sao de forca crescente:
//
// 1. o glifo de `Mural` e o decidido, e `storefront` nao volta;
// 2. os glifos sao distintos entre si -- um portao que so olhasse uma secao
//    nao pegaria a proxima colisao;
// 3. nenhum par de secoes declara o mesmo CAMPO SEMANTICO. Esta e a que pega
//    o defeito de hoje **e** o de quem acrescentar uma secao escolhendo o
//    icone pela estetica.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A mesma afirmacao da isca 3, sobre a lista que o caso mandar.
///
/// Mora numa funcao para que a PROVA NEGATIVA possa exercita-la com uma lista
/// defeituosa. Um caso que refizesse a varredura a mao provaria que a copia
/// dele reprova, e nao que o portao reprova.
void exigirCamposSemanticosDistintos(List<DestinoDeNavegacao> destinos) {
  // O guarda que impede o verde por vazio: uma lista vazia nao tem par
  // repetido, e passaria sem nunca ter olhado para uma secao.
  expect(
    destinos.length,
    greaterThanOrEqualTo(2),
    reason: 'REPROVA: a lista de destinos tem ${destinos.length} item(ns). '
        'Com menos de dois nao existe par para comparar, e afirmar "nenhum '
        'par repetido" seria verde por nao ter o que conferir.',
  );

  final porCampo = <CampoSemantico, List<String>>{};
  for (final d in destinos) {
    porCampo.putIfAbsent(d.campoSemantico, () => <String>[]).add(d.rotulo);
  }
  final repetidos = porCampo.entries.where((e) => e.value.length > 1).toList();
  expect(
    repetidos,
    isEmpty,
    reason: 'REPROVA: duas secoes tiram a leitura do MESMO campo semantico:\n'
        '${repetidos.map((e) => '  ${e.key.name}: ${e.value.join(", ")}').join('\n')}\n'
        'O rotulo encurtou e o significado foi transferido para o icone '
        '(UX 27.3). Dois icones do mesmo campo desfazem a transferencia, e e '
        'exatamente o que o cliente leu na barra em 22/09.',
  );
}

void main() {
  group('ISCA 1 — `Mural` usa os cartoes empilhados, e `storefront` nao volta',
      () {
    test('o destino de `Rotas.mural` tem os dois estados de `dynamic_feed`',
        () {
      final destinos = CascaComAbas.destinos;
      // O guarda: uma lista vazia satisfaz "nenhum destino usa storefront"
      // trivialmente, e o caso ficaria verde sem nunca ter olhado para nada.
      expect(
        destinos,
        isNotEmpty,
        reason: 'REPROVA: `CascaComAbas.destinos` esta vazia. Sem destino nao '
            'ha o que conferir, e um verde aqui nao significaria nada.',
      );

      final mural = destinos.singleWhere((d) => d.rota == Rotas.mural);
      expect(
        mural.icone,
        Icons.dynamic_feed_outlined,
        reason: 'REPROVA: `Mural` em repouso nao usa os cartoes empilhados. '
            'O glifo foi escolhido por ELIMINACAO dentro da familia fechada '
            'do 10.1, e cada recusa tem dono nesta arvore: `photo_library` e '
            'a galeria do encontro, `forum` e "outras avaliacoes" na pagina '
            'do local, `notes` e `article` sao "observacoes" em tres telas, '
            '`chat` e o `AuAu` no MESMO rodape, `campaign` e o comunicado da '
            'administracao e `grid_view` e controle e nao lugar.',
      );
      expect(
        mural.iconeSelecionado,
        Icons.dynamic_feed,
        reason: 'REPROVA: `Mural` selecionada nao usa os cartoes preenchidos. '
            'Contorno em repouso e preenchido no selecionado e o M3, e o que '
            'os outros quatro ja fazem.',
      );
    });

    test('`Perto` NAO esta mais no registro, e o alfinete saiu com ela', () {
      final destinos = CascaComAbas.destinos;
      expect(destinos, isNotEmpty);

      expect(
        destinos.where((d) => d.rotulo == 'Perto'),
        isEmpty,
        reason: 'REPROVA: `Perto` voltou ao registro de secoes. Ela deixou de '
            'ser secao em 19/10 por decisao do cliente, e o conteudo dela e a '
            'aba `Comunidade` da `Rede` -- duas portas para o mesmo diretorio '
            'seria a segunda definicao de onde ele mora.',
      );
      expect(
        destinos.where((d) =>
            d.icone == Icons.place_outlined || d.iconeSelecionado == Icons.place),
        isEmpty,
        reason: 'REPROVA: o alfinete de localizacao continua na barra. Ele era '
            'o glifo de `Perto`, e com a secao fora ele nao tem dono -- '
            'reaproveita-lo em outra secao poria dois glifos no campo que a '
            '`Rede` ja ocupa com `groups`.',
      );
    });

    test('NENHUM destino da barra usa um glifo de comercio de fachada', () {
      final destinos = CascaComAbas.destinos;
      expect(destinos, isNotEmpty);

      final comFachada = destinos
          .where((d) =>
              d.icone == Icons.storefront ||
              d.icone == Icons.storefront_outlined ||
              d.iconeSelecionado == Icons.storefront ||
              d.iconeSelecionado == Icons.storefront_outlined)
          .map((d) => d.rotulo)
          .toList();
      expect(
        comFachada,
        isEmpty,
        reason: 'REPROVA: ${comFachada.join(", ")} voltou a desenhar uma '
            'fachada de loja. Foi o achado do cliente em 22/09, e ele estava '
            'a dois slots da sacola de `Loja`.',
      );
    });

    test('o rotulo e o nome acessivel de `Mural` dizem a secao inteira', () {
      // O icone e decorativo e nao entra na arvore (UX 27.7): quem usa leitor
      // de tela recebe o `semanticsLabel`, e so ele. Um caso que so olhasse o
      // glifo nao acusaria quem aproveitasse a passagem para mexer no texto.
      final mural =
          CascaComAbas.destinos.singleWhere((d) => d.rota == Rotas.mural);
      expect(mural.rotulo, 'Mural');
      expect(
        mural.semanticsLabel,
        'Mural, publicações das suas conexões',
        reason: 'REPROVA: o nome acessivel de `Mural` mudou. `Mural` e palavra '
            'de LUGAR e nao diz o que ha dentro -- como `AuAu` nao diz '
            '"mensagem" --, entao a metade de tras do nome carrega o assunto '
            'inteiro. E ela diz `conexões`, e nao `amigos` nem `quem você '
            'segue`: o produto tem UMA relacao (`user_connections`, simetrica '
            'com aceite), e "seguir" assimetrico nao existe nesta arvore.',
      );
    });

    test('o nome acessivel de `Rede` cobre as DUAS abas, e nao so os eventos',
        () {
      // A secao dobrou de tamanho em 19/10 e o nome acessivel teve de dobrar
      // com ela. Sem este caso, `eventos da comunidade` continuaria ali
      // anunciando METADE da secao -- e quem navega por audicao nao teria
      // como descobrir que os profissionais mudaram de casa.
      final rede =
          CascaComAbas.destinos.singleWhere((d) => d.rota == Rotas.rede);
      expect(rede.rotulo, 'Rede');
      expect(
        rede.semanticsLabel,
        'Rede, eventos e quem atende bem',
        reason: 'REPROVA: o nome acessivel da `Rede` nao cobre as duas abas. '
            'A secao passou a ter `Eventos` E `Comunidade` (o diretorio que '
            'era `Perto`), e um nome que fala so de eventos esconde metade da '
            'secao de quem usa leitor de tela.',
      );
    });
  });

  group('ISCA 2 — os glifos sao distintos entre si', () {
    test('nenhum par de secoes desenha o mesmo icone', () {
      final destinos = CascaComAbas.destinos;
      expect(
        destinos.length,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA: com menos de dois destinos nao ha par para '
            'comparar, e a afirmacao seria vazia.',
      );

      final emRepouso = destinos.map((d) => d.icone).toSet();
      expect(
        emRepouso,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham o MESMO glifo em repouso. '
            'Glifos: ${destinos.map((d) => '${d.rotulo}=${d.icone}').join(', ')}',
      );

      final selecionados = destinos.map((d) => d.iconeSelecionado).toSet();
      expect(
        selecionados,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham o MESMO glifo selecionado.',
      );
    });
  });

  group('ISCA 3 — nenhum par de secoes compartilha campo semantico', () {
    test('a barra de hoje tem um vocabulario por secao, todos distintos', () {
      exigirCamposSemanticosDistintos(CascaComAbas.destinos);
    });

    test('os campos sao os declarados, um por secao', () {
      // Sem isto, a isca 3 passaria com os destinos declarando valores
      // arbitrarios e distintos: distintos entre si e o criterio, mas o campo
      // precisa mesmo descrever o glifo que esta la.
      //
      // CINCO -> SEIS em 19/10: a secao de mensagens entrou na barra com
      // `conversa`, e `Perfil` saiu da barra e **continua no registro** -- ele
      // perdeu o slot, nao a entrada. O campo dele fica: a foto da barra de
      // topo e a porta dele, e o glifo de conta continua declarado.
      //
      // **`lugar` SAIU e `publicacao` ENTROU no mesmo dia.** `lugar` era o
      // alfinete de `Perto`, e a secao que o declarava deixou de existir --
      // aba nao declara campo semantico, porque o registro e de SECAO e o
      // campo existe para impedir colisao entre dois glifos DA BARRA.
      // `publicacao` e o `Mural`, e ele nao divide campo com `comunidade`
      // (`groups` desenha CABECAS) nem com `conversa` (`chat` desenha UM
      // BALAO): `dynamic_feed` desenha CARTOES EMPILHADOS.
      //
      // `conversa` NAO divide campo com `comunidade`: `groups` desenha
      // CABECAS e `chat` desenha um BALAO. A distincao importa mais nesta
      // secao que nas outras, porque o rotulo dela e `AuAu` -- palavra de
      // marca, que nao diz a funcao -- e o glifo passou a ser o unico sinal
      // visivel que diz "mensagem".
      final porRotulo = <String, CampoSemantico>{
        for (final d in CascaComAbas.destinos) d.rotulo: d.campoSemantico,
      };
      expect(porRotulo, <String, CampoSemantico>{
        'Pets': CampoSemantico.animal,
        'Rede': CampoSemantico.comunidade,
        'Mural': CampoSemantico.publicacao,
        'Loja': CampoSemantico.compra,
        'AuAu': CampoSemantico.conversa,
        'Perfil': CampoSemantico.conta,
      });
    });
  });

  group('PROVA NEGATIVA — o portao precisa REPROVAR com o defeito de volta',
      () {
    // A isca de B, escrita na propria BICHUS-230: "o estado de hoje, com
    // `storefront` e `shopping_bag` os dois em `compra`, o portao PRECISA
    // reprovar. Se ficar verde, a tabela esta mentindo e o portao nao esta
    // olhando."
    test('duas secoes em `compra` reprovam', () {
      final comoEraAntesDe2209 = <DestinoDeNavegacao>[
        // **A ROTA AQUI E `Rotas.rede` E O ROTULO E `Perto`, de proposito.**
        // `Rotas.perto` nao existe mais -- a constante foi apagada em 19/10
        // junto com a secao --, e esta lista e uma barra DE MENTIRA, montada
        // para o portao ter o que reprovar. O que o caso exercita e a colisao
        // de CAMPO, e ela nao depende de a rota ser real; usar uma rota que
        // existe mantem a lista valida sem ressuscitar a constante.
        const DestinoDeNavegacao(
          rotulo: 'Perto',
          reforcoAcessivel: 'profissionais e estabelecimentos indicados',
          reforcoDaPagina: 'irrelevante para este caso',
          // O glifo e o campo que a barra tinha ate 22/09.
          icone: Icons.storefront_outlined,
          iconeSelecionado: Icons.storefront,
          rota: Rotas.rede,
          estado: EstadoDaSecao.planejada,
          campoSemantico: CampoSemantico.compra,
        ),
        const DestinoDeNavegacao(
          rotulo: 'Loja',
          reforcoAcessivel: 'a loja do Bichu',
          reforcoDaPagina: 'irrelevante para este caso',
          icone: Icons.shopping_bag_outlined,
          iconeSelecionado: Icons.shopping_bag,
          rota: Rotas.loja,
          estado: EstadoDaSecao.planejada,
          campoSemantico: CampoSemantico.compra,
        ),
      ];

      expect(
        () => exigirCamposSemanticosDistintos(comoEraAntesDe2209),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao de campo semantico NAO acusou a barra do '
            'jeito que ela estava quando o cliente reclamou. Ele esta cego, e '
            'a distincao que ele afirma todo dia nao vale nada.',
      );
    });

    test('lista vazia reprova pelo guarda, e nao passa em silencio', () {
      expect(
        () => exigirCamposSemanticosDistintos(const <DestinoDeNavegacao>[]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista vazia. Uma '
            'lista sem destinos nao tem par repetido, e e assim que um portao '
            'aprova todo dia sem nunca ter olhado para a barra.',
      );
    });
  });
}
