// A ISCA DO PAPEL DE QUEM CHAMA, NAS DUAS DIRECOES.
//
// ===========================================================================
// O DEFEITO, MEDIDO EM 26/10/2026
// ===========================================================================
//
// O app assumia que o dono da conta era SEMPRE o tutor, em tres lugares:
//
//   - `tela_da_conversa.dart`, o lado da bolha (`minha = senderRole == tutor`);
//   - `tela_da_conversa.dart`, o nome no titulo (`outroLadoVistoPor(tutor)`);
//   - `area_de_mensagens.dart`, o outro lado da linha da lista (idem).
//
// **O servidor atende o achador COM conta desde sempre**: o recorte da leitura
// e `tutor_user_id = chamador OR finder_user_id = chamador`
// (`kysely-conversation-repository.ts`), e a conversa aparece na lista dos dois
// lados. Para esse achador o resultado era:
//
//   - a bolha do OUTRO lado ia para a DIREITA -- o lado que a pessoa le como o
//     dela --, e a dela ficava a esquerda. Medido em bancada: o alinhamento era
//     **funcao pura de `sender_role`**, e nao invertia quando o chamador
//     invertia;
//   - a barra e a linha da lista mostravam o PROPRIO nome, e **sem foto**:
//     o proprio lado recebe `handle` e `photo_icon_url` nulos **por decisao**
//     (emenda 3 do ADR-0010, 19/10/2026), e a tela lia esse nulo como se fosse
//     o nulo do outro lado. **E essa a reclamacao da foto na conversa.**
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE NAO MEDE
// ===========================================================================
//
// Mede que as tres decisoes seguem `Conversation.viewer_role`, e **nas duas
// direcoes**: cada fato e medido com o chamador tutor E com o chamador achador,
// porque um caso numa direcao so fica verde sobre `tutor` fixo -- que e o
// defeito.
//
// NAO mede quem pode ver a foto: o recorte mora na clausula `WHERE` da consulta
// (ADR-0021) e as iscas dele sao de servidor. **A foto aqui segue a regra DELE,
// e nao o papel**: o proprio lado chega com os dois campos nulos, e o caso (f)
// mede exatamente isso -- o que `viewer_role` muda e QUAL dos dois e o proprio.
//
// NAO mede a legenda da foto dentro da bolha
// (`FotoDaMensagem.legenda`, `foto_na_barra_de_escrever.dart`): ela tambem
// decide por `sender_role` com `tutor` no lugar do chamador, e consertar pede
// TEXTO NOVO -- `fotoDeQuemDizTerEncontrado` e rotulo antifraude aprovado pelo
// cliente, e nao da para aponta-lo para a propria pessoa sem decisao dele.
// Fica dito aqui para quem for mexer.
//
// ===========================================================================
// A BANCADA E A DO ARQUIVO VIZINHO, IMPORTADA
// ===========================================================================
//
// Duas copias dos fixtures do contrato divergem no dia em que um campo mudar, e
// a que nao foi atualizada continua verde sobre um corpo que o servidor nao
// manda mais. `conversa()` ganhou `papelDeQuemChama`, `apelidoDoTutor` e
// `fotoDoTutor` em `area_de_mensagens_test.dart`.

import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'area_de_mensagens_test.dart'
    show
        ServidorDeConversas,
        abrirAMensagens,
        conversa,
        idDaMinha,
        json200,
        mensagem,
        paginaDeConversas,
        textoDaTela;

// ---------------------------------------------------------------------------
// OS FIXTURES DESTA HISTORIA
// ---------------------------------------------------------------------------

const String idDaDoTutor = '0192f3a1-7b2c-7def-8a01-0000000000a1';
const String idDaDoAchador = '0192f3a1-7b2c-7def-8a01-0000000000a2';
const String idDaDoSistema = '0192f3a1-7b2c-7def-8a01-0000000000a3';

const String textoDoTutor = 'Esse e o Tobias mesmo, obrigado';
const String textoDoAchador = 'Achei ele na praca da Matriz, esta bem';
const String textoDoSistema = 'Esta conversa e mediada pelo Bichu';

const String nomeDoTutor = 'Leandro';
const String nomeDoAchador = 'Marina';

/// A foto do TUTOR, que o achador COM conta recebe quando ha conexao aceita.
const String fotoDoTutor =
    'https://midia.bichu.test/u/leandro/thumb.jpg?v=1';

/// A foto do ACHADOR, que o tutor recebe no mesmo estado.
const String fotoDoAchador =
    'https://midia.bichu.test/u/marina/thumb.jpg?v=1';

/// Uma conversa com as TRES mensagens -- uma de cada papel.
///
/// As tres no mesmo corpo de proposito: a isca (c) compara o lado da MESMA
/// mensagem entre as duas direcoes, e para isso o corpo tem de ser igual em
/// tudo menos `viewer_role`.
Map<String, dynamic> conversaDasTres({required String? papel}) => conversa(
  papelDeQuemChama: papel,
  nomeDoTutor: nomeDoTutor,
  nomeDoAchador: nomeDoAchador,
  mensagens: <Map<String, dynamic>>[
    mensagem(id: idDaDoAchador, papel: 'finder', corpo: textoDoAchador),
    mensagem(id: idDaDoTutor, papel: 'tutor', corpo: textoDoTutor),
    mensagem(id: idDaDoSistema, papel: 'system', corpo: textoDoSistema),
  ],
);

/// A bancada que serve o DETALHE desta conversa, e mais nada.
///
/// A lista nao e registrada de proposito: o padrao da bancada e 404, e abrir a
/// tela da conversa direto pela rota e o caminho que o toque na notificacao
/// atravessa.
ServidorDeConversas servidorDaConversa(Map<String, dynamic> corpo) =>
    ServidorDeConversas(<String, http.Response Function(http.Request)>{
      'GET /v1/conversations/$idDaMinha': (_) => json200(corpo),
    });

/// A bancada que serve a LISTA com uma conversa so.
ServidorDeConversas servidorDaLista(Map<String, dynamic> corpo) =>
    ServidorDeConversas(<String, http.Response Function(http.Request)>{
      'GET /v1/conversations': (_) =>
          json200(paginaDeConversas(<Map<String, dynamic>>[corpo])),
    });

// ---------------------------------------------------------------------------
// A MEDICAO DO LADO DA BOLHA
// ---------------------------------------------------------------------------

/// O `Align` da bolha daquela mensagem.
///
/// Pelo `ValueKey` da mensagem, e nao pelo texto: e a chave que a tela usa para
/// identificar a bolha, e procurar pelo texto acharia tambem a previa da lista
/// num caso futuro que montasse as duas telas.
Align alinhamentoDa(WidgetTester tester, String idDaMensagem) {
  final alvo = find.descendant(
    of: find.byKey(ValueKey<String>('mensagem-$idDaMensagem')),
    matching: find.byType(Align),
  );
  final achados = tester.widgetList<Align>(alvo).toList();
  expect(
    achados,
    hasLength(1),
    reason:
        'a bolha de $idDaMensagem tem ${achados.length} `Align`. Com mais de '
        'um, este medidor nao sabe qual deles decide o lado, e a isca poderia '
        'ficar verde lendo o errado',
  );
  return achados.first;
}

/// A prova FISICA: o centro do texto da bolha esta na metade direita da tela.
///
/// O `alignment` acima e a intencao; isto e o pixel. Os dois juntos porque um
/// `Align` com `centerRight` dentro de um pai estreito nao moveria nada, e a
/// pessoa continuaria vendo a bolha no lugar errado com a isca verde.
bool estaADireita(WidgetTester tester, String texto) {
  final centroDaTela = tester.getSize(find.byType(Scaffold)).width / 2;
  return tester.getCenter(find.text(texto)).dx > centroDaTela;
}

void main() {
  // -------------------------------------------------------------------------
  group('(a) o chamador e o TUTOR: a mensagem dele vai a direita', () {
    testWidgets('a bolha do tutor a DIREITA, a do achador a ESQUERDA', (
      tester,
    ) async {
      await abrirAMensagens(
        tester,
        servidor: servidorDaConversa(conversaDasTres(papel: 'tutor')),
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      expect(
        alinhamentoDa(tester, idDaDoTutor).alignment,
        Alignment.centerRight,
        reason: 'a mensagem de quem esta lendo nao foi para o lado dela',
      );
      expect(
        alinhamentoDa(tester, idDaDoAchador).alignment,
        Alignment.centerLeft,
      );
      expect(estaADireita(tester, textoDoTutor), isTrue);
      expect(estaADireita(tester, textoDoAchador), isFalse);
    });

    testWidgets('a barra mostra o nome do ACHADOR, que e o outro lado', (
      tester,
    ) async {
      await abrirAMensagens(
        tester,
        servidor: servidorDaConversa(conversaDasTres(papel: 'tutor')),
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );
      expect(textoDaTela(tester), contains(nomeDoAchador));
    });
  });

  // -------------------------------------------------------------------------
  group('(b) o chamador e o ACHADOR com conta: a mensagem DELE vai a direita', () {
    testWidgets('a bolha do achador a DIREITA, a do tutor a ESQUERDA', (
      tester,
    ) async {
      await abrirAMensagens(
        tester,
        servidor: servidorDaConversa(conversaDasTres(papel: 'finder')),
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      expect(
        alinhamentoDa(tester, idDaDoAchador).alignment,
        Alignment.centerRight,
        reason:
            'ESTE E O DEFEITO DE 26/10/2026: o alinhamento era funcao pura de '
            '`sender_role` e nao invertia com o chamador. Quem achou o pet via '
            'a propria mensagem a esquerda e a do tutor a direita -- o lado que '
            'ela le como o dela',
      );
      expect(
        alinhamentoDa(tester, idDaDoTutor).alignment,
        Alignment.centerLeft,
        reason: 'a mensagem do OUTRO lado continuou no lado de quem le',
      );
      expect(estaADireita(tester, textoDoAchador), isTrue);
      expect(estaADireita(tester, textoDoTutor), isFalse);
    });

    testWidgets('a barra mostra o nome do TUTOR, que agora e o outro lado', (
      tester,
    ) async {
      await abrirAMensagens(
        tester,
        servidor: servidorDaConversa(conversaDasTres(papel: 'finder')),
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );
      final texto = textoDaTela(tester);
      expect(
        texto,
        contains(nomeDoTutor),
        reason:
            'a barra nao nomeia o tutor. Antes do conserto ela nomeava '
            '`Marina` -- a PROPRIA pessoa --, porque `outroLadoVistoPor` '
            'recebia `tutor` fixo',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('(c) ISCA: o lado INVERTE com o papel, e nao e funcao de `sender_role`', () {
    testWidgets(
      'o MESMO corpo, mudando so `viewer_role`, poe a MESMA mensagem em lados '
      'OPOSTOS',
      (tester) async {
        // Esta e a isca que reprovava antes do conserto, e e ela que distingue
        // "a tela le o papel" de "a tela acertou por acaso numa direcao".
        // Qualquer implementacao com papel FIXO -- `tutor` ou `finder` --
        // reprova aqui, porque o lado nao mudaria.
        await abrirAMensagens(
          tester,
          servidor: servidorDaConversa(conversaDasTres(papel: 'tutor')),
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );
        final doTutorVistoPeloTutor = alinhamentoDa(
          tester,
          idDaDoTutor,
        ).alignment;

        await abrirAMensagens(
          tester,
          servidor: servidorDaConversa(conversaDasTres(papel: 'finder')),
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );
        final doTutorVistoPeloAchador = alinhamentoDa(
          tester,
          idDaDoTutor,
        ).alignment;

        expect(
          doTutorVistoPeloTutor,
          isNot(doTutorVistoPeloAchador),
          reason:
              'a mensagem do tutor caiu no MESMO lado para os dois chamadores: '
              'o alinhamento continua funcao pura de `sender_role`, que e o '
              'defeito medido em 26/10/2026',
        );
      },
    );

    testWidgets('CONTROLE: a mensagem do SISTEMA nao ganha lado em direcao nenhuma', (
      tester,
    ) async {
      // O contrapeso do caso acima. Uma implementacao que "invertesse tudo"
      // passaria la e daria um lado ao Bichu aqui -- e atribuir a abertura do
      // aviso a um dos dois lados e afirmar que uma das duas pessoas escreveu
      // aquilo.
      for (final papel in <String>['tutor', 'finder']) {
        await abrirAMensagens(
          tester,
          servidor: servidorDaConversa(conversaDasTres(papel: papel)),
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );
        expect(
          find.descendant(
            of: find.byKey(const ValueKey<String>('mensagem-$idDaDoSistema')),
            matching: find.byType(Align),
          ),
          findsNothing,
          reason:
              'a mensagem do sistema ganhou um lado com `viewer_role: $papel`',
        );
        expect(textoDaTela(tester), contains(textoDoSistema));
      }
    });
  });

  // -------------------------------------------------------------------------
  group('(d) a LINHA DA LISTA desenha o outro lado de quem chama', () {
    testWidgets(
      'chamador ACHADOR: a linha mostra o TUTOR, com a foto DELE',
      (tester) async {
        // O ESTADO DA RECLAMACAO. Com conexao aceita, o servidor manda o
        // apelido e a foto DO TUTOR -- porque o tutor e o outro lado de quem
        // chama -- e deixa os do achador nulos. A tela lia o nulo do achador e
        // nao desenhava nada.
        await abrirAMensagens(
          tester,
          servidor: servidorDaLista(
            conversa(
              papelDeQuemChama: 'finder',
              nomeDoTutor: nomeDoTutor,
              nomeDoAchador: nomeDoAchador,
              apelidoDoTutor: 'leandro',
              fotoDoTutor: fotoDoTutor,
            ),
          ),
        );

        final imagens = tester.widgetList<ImagemDaRede>(
          find.byType(ImagemDaRede),
        );
        expect(
          imagens,
          hasLength(1),
          reason:
              'a foto do tutor CHEGOU na resposta e a linha desenhou '
              '${imagens.length} imagem(ns). Antes do conserto eram zero: a '
              'tela pedia o "outro lado visto pelo tutor", recebia o PROPRIO '
              'achador, e o proprio lado vem com os dois campos nulos por '
              'decisao (emenda 3 do ADR-0010)',
        );
        expect(imagens.first.url, fotoDoTutor);
        expect(textoDaTela(tester), contains(nomeDoTutor));
      },
    );

    testWidgets(
      'CONTROLE chamador TUTOR: a linha mostra o ACHADOR, com a foto DELE',
      (tester) async {
        // O contrapeso: sem este caso, uma tela que passasse `finder` fixo
        // passaria no caso acima e quebraria a conversa da maioria.
        await abrirAMensagens(
          tester,
          servidor: servidorDaLista(
            conversa(
              papelDeQuemChama: 'tutor',
              nomeDoTutor: nomeDoTutor,
              nomeDoAchador: nomeDoAchador,
              apelidoDoAchador: 'marina',
              fotoDoAchador: fotoDoAchador,
            ),
          ),
        );

        final imagens = tester.widgetList<ImagemDaRede>(
          find.byType(ImagemDaRede),
        );
        expect(imagens, hasLength(1));
        expect(imagens.first.url, fotoDoAchador);
        expect(textoDaTela(tester), contains(nomeDoAchador));
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(e) o SERVIDOR ANTIGO: sem `viewer_role`, a tela se comporta como antes', () {
    testWidgets('corpo SEM a chave cai em `tutor`, e nao em lado nenhum', (
      tester,
    ) async {
      // `viewer_role` e `required` no contrato, mas uma resposta de servidor
      // anterior a 27/10/2026 nao o traz -- o mesmo tratamento de
      // `found_report_id`. O padrao e `tutor` porque e a conversa da maioria;
      // qualquer outro inverteria TODA conversa de tutor por causa de um campo
      // que nao chegou.
      await abrirAMensagens(
        tester,
        servidor: servidorDaConversa(conversaDasTres(papel: null)),
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );
      expect(
        alinhamentoDa(tester, idDaDoTutor).alignment,
        Alignment.centerRight,
      );
      expect(
        alinhamentoDa(tester, idDaDoAchador).alignment,
        Alignment.centerLeft,
      );
    });

    testWidgets('CONTROLE: o fixture SEM a chave de fato nao a manda', (
      tester,
    ) async {
      // Sem isto, um fixture que mandasse `viewer_role: 'tutor'` de todo jeito
      // deixaria o caso acima verde medindo o caminho do campo PRESENTE.
      expect(conversaDasTres(papel: null).containsKey('viewer_role'), isFalse);
      expect(
        conversaDasTres(papel: 'finder')['viewer_role'],
        'finder',
        reason: 'o fixture parou de mandar a chave quando ela e pedida',
      );
      // O modelo le o corpo sem a chave sem lancar, e cai no padrao.
      final semChave = Conversa.doJson(conversaDasTres(papel: null));
      expect(semChave?.papelDoChamador, PapelNaConversa.tutor);
      final comChave = Conversa.doJson(conversaDasTres(papel: 'finder'));
      expect(comChave?.papelDoChamador, PapelNaConversa.achador);
    });
  });

  // -------------------------------------------------------------------------
  group('(f) a FOTO segue a regra DELE, e o papel so escolhe de quem e o nulo', () {
    testWidgets('SEM conexao aceita nao ha foto em direcao nenhuma', (
      tester,
    ) async {
      // A emenda 3 do ADR-0010 continua de pe: a foto sai SO entre conexoes
      // aceitas, e o recorte mora no `WHERE` do servidor. Este caso prova que o
      // conserto do papel **nao** inventou foto onde o servidor nao mandou --
      // que seria o jeito mais facil de "resolver" a reclamacao.
      for (final papel in <String>['tutor', 'finder']) {
        await abrirAMensagens(
          tester,
          servidor: servidorDaLista(
            conversa(
              papelDeQuemChama: papel,
              nomeDoTutor: nomeDoTutor,
              nomeDoAchador: nomeDoAchador,
            ),
          ),
        );
        expect(
          find.byType(ImagemDaRede),
          findsNothing,
          reason:
              'a tela desenhou foto com `viewer_role: $papel` sobre um corpo '
              'que nao trouxe nenhuma',
        );
      }
    });

    testWidgets('o PROPRIO lado chega com os dois nulos, e a tela nao o usa', (
      tester,
    ) async {
      // O fato da emenda 3, lido no modelo: com o chamador achador, quem traz
      // apelido e foto e o TUTOR. A tela nao tem como -- e nao deve -- tirar
      // avatar do proprio lado: a foto do dono sai em `getMe`.
      final corpo = conversa(
        papelDeQuemChama: 'finder',
        nomeDoTutor: nomeDoTutor,
        nomeDoAchador: nomeDoAchador,
        apelidoDoTutor: 'leandro',
        fotoDoTutor: fotoDoTutor,
      );
      final lida = Conversa.doJson(corpo);
      expect(lida?.papelDoChamador, PapelNaConversa.achador);
      final outro = lida?.outroLadoVistoPor(lida.papelDoChamador);
      expect(outro?.role, PapelNaConversa.tutor);
      expect(outro?.photoIconUrl, fotoDoTutor);
      final proprio = lida?.participants.firstWhere(
        (p) => p.role == PapelNaConversa.achador,
      );
      expect(proprio?.photoIconUrl, isNull);
      expect(proprio?.handle, isNull);
    });
  });
}
