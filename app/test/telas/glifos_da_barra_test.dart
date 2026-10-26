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
import 'package:bichu/theme/icones_da_barra.g.dart';
// `package:flutter/material.dart` SAIU em 23/10/2026, e a ausencia dele e o
// resumo desta mudanca: este arquivo nao nomeia mais nenhuma constante
// `Icons.*`. Ele cobrava glifo do Material por nome (`dynamic_feed`, `place`,
// `storefront`) e passou a cobrar a ARTE -- os desenhos do cliente nos cinco
// slots, e a AUSENCIA de glifo do Material neles. Importe que volta aqui e
// sinal de que alguem reabriu a familia fechada.
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

      // 23/10/2026: A ARTE DO `Mural` DEIXOU DE SER DO MATERIAL.
      //
      // Este caso cobrava `Icons.dynamic_feed`, e o glifo tinha sido escolhido
      // por ELIMINACAO dentro da familia fechada do 10.1 -- cada recusa com
      // dono nesta arvore: `photo_library` e a galeria do encontro, `forum` e
      // "outras avaliacoes" na pagina do local, `notes` e `article` sao
      // "observacoes" em tres telas, `chat` e o `AuAu` no MESMO rodape,
      // `campaign` e o comunicado da administracao e `grid_view` e controle e
      // nao lugar. A PROSA FICA porque e ela que descreve o CAMPO SEMANTICO
      // que a secao ocupa, e o campo continua valendo com portao proprio
      // (isca 3). O que mudou e de onde a forma vem: o cliente pediu os
      // desenhos DELE, e `design/icones-da-barra/mural.svg` e o que a barra
      // pinta agora.
      expect(
        mural.desenho,
        same(IconesDaBarra.mural),
        reason: 'REPROVA: `Mural` em repouso nao desenha `mural.svg`. A arte '
            'dos cinco slots e a do cliente, e cada arquivo tem um destino so '
            '-- desenho que troca de aba e o jeito de `Loja` acabar com a arte '
            'do `Mural` sem nada reprovar.',
      );
      expect(
        mural.desenhoSelecionado,
        same(IconesDaBarra.muralSelecionado),
        reason: 'REPROVA: `Mural` selecionada nao desenha '
            '`mural-selecionado.svg`. Contorno em repouso e preenchido no '
            'selecionado e o M3, e o que os outros quatro ja fazem.',
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
      // O ALFINETE NAO PODE VOLTAR, e desde 23/10 a defesa e mais forte que
      // procurar `Icons.place`: nenhum destino da barra declara glifo do
      // Material NENHUM, entao o alfinete nao tem por onde entrar. Quem
      // prova isso pelo nome do caso e
      // `test/telas/icones_da_barra_test.dart`, no caso
      // `nenhum destino da barra declara glifo do Material`. Aqui fica a
      // metade que continua sendo deste arquivo: o unico `icone` que sobra no
      // registro e o de `Perfil`, que esta FORA da barra.
      final naBarraComGlifo = destinos
          .where((d) => d.naBarra && (d.icone != null || d.iconeSelecionado != null))
          .map((d) => d.rotulo)
          .toList();
      expect(
        naBarraComGlifo,
        isEmpty,
        reason: 'REPROVA: ${naBarraComGlifo.join(", ")} voltou a declarar '
            'glifo do Material num slot da barra. O alfinete de `Perto` era um '
            'deles, e com a secao fora ele nao tem dono -- mas a regra de hoje '
            'e maior que o alfinete: os cinco slots sao os desenhos do '
            'cliente, e um glifo generico no meio deles e o defeito que a '
            'fiacao de 23/10 veio fechar.',
      );
    });

    test('NENHUM destino da barra usa um glifo de comercio de fachada', () {
      // O ACHADO DE 22/09 CONTINUA COBERTO, e desde 23/10 por construcao em
      // vez de por lista: `storefront` e um `IconData`, e destino da barra nao
      // declara `IconData` nenhum -- o `assert` de `DestinoDeNavegacao`
      // recusa. Este caso ficou **mais forte e nao mais fraco**: ele deixou de
      // enumerar QUATRO constantes (`storefront`, `storefront_outlined` e os
      // dois estados) e passou a cobrar a familia inteira de uma vez.
      //
      // Esta e a diferenca que importa: a versao antiga pegaria `storefront` e
      // deixaria passar `store`, `shopping_cart` ou `local_mall`, que leem a
      // mesma coisa. Enumerar glifo e portao que envelhece calado.
      final destinos = CascaComAbas.destinos;
      expect(destinos, isNotEmpty);

      final daBarra = destinos.where((d) => d.naBarra).toList();
      expect(
        daBarra,
        isNotEmpty,
        reason: 'REPROVA: nenhum destino esta `naBarra`. Sem slot nao ha o que '
            'conferir, e um verde aqui nao significaria nada.',
      );

      final comGlifo = daBarra
          .where((d) => d.icone != null || d.iconeSelecionado != null)
          .map((d) => d.rotulo)
          .toList();
      expect(
        comGlifo,
        isEmpty,
        reason: 'REPROVA: ${comGlifo.join(", ")} declara glifo do Material. '
            'Uma fachada de loja a dois slots da sacola de `Loja` foi o achado '
            'do cliente em 22/09; a barra de hoje nao tem glifo do Material '
            'nenhum para isso voltar a acontecer.',
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

      // A ARTE DE CADA SECAO, qualquer que seja a fonte dela.
      //
      // Cinco secoes trazem desenho do cliente e `Perfil` traz glifo do
      // Material (ele esta fora da barra e nao ha SVG dele). A chave de
      // comparacao tem de cobrir os DOIS, senao o conjunto de cinco `null`
      // mais um glifo teria tamanho 2 e este caso reprovaria o estado certo
      // -- foi o que ele fez na primeira passada desta mudanca.
      //
      // `arquivo` e nao `identityHashCode`: o nome do SVG e o que distingue
      // duas artes, e ele aparece na mensagem de falha.
      Object chave(DestinoDeNavegacao d, {required bool selecionado}) {
        final desenho = selecionado ? d.desenhoSelecionado : d.desenho;
        if (desenho != null) return 'svg:${desenho.arquivo}';
        final glifo = selecionado ? d.iconeSelecionado : d.icone;
        return 'material:$glifo';
      }

      final emRepouso = destinos.map((d) => chave(d, selecionado: false)).toSet();
      expect(
        emRepouso,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham a MESMA arte em repouso. '
            'Artes: ${destinos.map((d) => '${d.rotulo}=${chave(d, selecionado: false)}').join(', ')}',
      );

      final selecionados = destinos.map((d) => chave(d, selecionado: true)).toSet();
      expect(
        selecionados,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham a MESMA arte selecionada. '
            'Artes: ${destinos.map((d) => '${d.rotulo}=${chave(d, selecionado: true)}').join(', ')}',
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
          // **O DESENHO AQUI E ANDAIME, e o `assert` e que o exige.** O glifo
          // de fachada que a barra tinha ate 22/09 (`storefront`) nao cabe
          // mais num destino `naBarra`, e o que este caso exercita e a
          // colisao de CAMPO -- que nao depende da arte. Reusar a arte da
          // `Loja` aqui e deliberado: ela e justamente a secao com que
          // `Perto` colidia.
          desenho: IconesDaBarra.loja,
          desenhoSelecionado: IconesDaBarra.lojaSelecionado,
          rota: Rotas.rede,
          estado: EstadoDaSecao.planejada,
          campoSemantico: CampoSemantico.compra,
        ),
        const DestinoDeNavegacao(
          rotulo: 'Loja',
          reforcoAcessivel: 'a loja do Bichu',
          reforcoDaPagina: 'irrelevante para este caso',
          desenho: IconesDaBarra.loja,
          desenhoSelecionado: IconesDaBarra.lojaSelecionado,
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
