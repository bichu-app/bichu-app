// `Minhas fotos` saiu de dentro de `Meus dados` e virou item de PRIMEIRO
// NIVEL do menu do `Perfil` (26/10/2026).
//
// ===========================================================================
// O PEDIDO, E POR QUE ELE TEM DUAS METADES
// ===========================================================================
//
// Cliente, 26/10/2026: *"traga o menu minhas fotos para o menu principal"*.
// Perguntado QUAL menu, ele respondeu: *"primeiro nivel do perfil"*.
//
// `trazer para` e uma afirmacao de CHEGADA e uma de SAIDA. Um arquivo de teste
// que medisse so a chegada aprovaria a versao que deixa a porta nos DOIS
// lugares -- e duas portas para a mesma tela e o que a prosa de `Meus pets` em
// `gaveta_de_secoes.dart` proibe com estas palavras. Por isso ha uma isca para
// cada metade.
//
// **A NOTA DE `abas.dart` QUE DIZIA O CONTRARIO ERA REGISTRO, E NAO DECISAO.**
// Ate 26/10 havia la, ao lado de `Meus dados`, a frase: `Minhas fotos` *"nao e
// item deste menu e nunca foi -- medido nesta arvore"*. Ela descrevia o que a
// arvore TINHA. A prosa de `tela_dados_pessoais.dart` e que dizia o porque --
// *"acrescentar uma quarta linha la e decisao dele, nao fiacao"* --, e a
// decisao chegou. As duas foram reescritas no mesmo commit, citando as
// palavras dele, para que ninguem releia o registro antigo como proibicao.
//
// ===========================================================================
// A TABELA DAS ISCAS: o que se desliga, e qual caso reprova
// ===========================================================================
//
// | isca | o que se desliga em `lib/` | reprova em |
// |---|---|---|
// | (a) | repor o `ItemDeMenu` da vitrine em `tela_dados_pessoais.dart` | `dentro de `Meus dados` sobrou UM item de menu, e e o endereco` |
// | (b) | repor `Rotas.minhaVitrine` em `tela_dados_pessoais.dart` | `a fonte de `Meus dados` nao cita mais a rota da vitrine` |
// | (c) | tirar o `ItemDeMenu` de `abas.dart` | `a vitrine e item do menu do Perfil` |
// | (d) | mover a linha para outro grupo, ou trocar a ordem | `ela esta no grupo `Conta`, entre `Meus dados` e `Usuarios bloqueados`` |
// | **(e)** | **a fiacao da rota, ou o endereco** | **`CONTROLE POSITIVO: tocar o item ABRE a vitrine`** |
//
// **(e) E O CONTROLE POSITIVO, e sem ele as outras quatro nao valem.** (a) e
// (b) sao afirmacoes de AUSENCIA, e (c) e (d) provam que um nome existe e onde
// ele esta na pagina -- as quatro juntas ficariam verdes com o item na tela e
// sem destino, que e o defeito que o criterio 2 da BICHUS-62 chama de acao sem
// desfecho, e e literalmente como `Pedidos de conexao` passou de 18/10 a 19/10
// sem o cliente ver nada.
//
// ===========================================================================
// A ARMADILHA DA ASSERCAO DE AUSENCIA, E COMO (a) E (b) NAO CAEM NELA
// ===========================================================================
//
// `findsNothing` sobre o ROTULO `Minhas fotos` dentro de `Meus dados` passaria
// no vazio: bastaria a tela nao montar, ou a porta voltar com outro texto.
// Nenhuma das duas iscas negativas olha o rotulo da linha que saiu:
//
// - **(a)** conta os `ItemDeMenu` de `TelaDadosPessoais` POR TIPO e exige
//   exatamente UM, e exige que o que sobrou seja o de `Endereco de entrega`.
//   Zero reprova (a tela nao montou, ou perdeu o item que DEVE ficar) e dois
//   reprovam (a porta voltou, com qualquer rotulo).
// - **(b)** ancora no SIMBOLO `Rotas.minhaVitrine`, lido da fonte, e o
//   CONTROLE DO SCANNER vem primeiro: a mesma leitura aplicada a `abas.dart`
//   TEM de achar o simbolo. Varredura que nao acha nada passaria nas duas
//   contas de ausencia; esta prova que acha onde a resposta e conhecida.
//
// ===========================================================================
// O QUE ESTE ARQUIVO NAO MEDE, de proposito
// ===========================================================================
//
// **O ENDERECO NAO MUDOU, e isso e medido em (e) por igualdade de string.**
// `/perfil/minhas-fotos` continua o mesmo: mudar de lugar no menu nao e mudar
// de endereco, e renomear quebraria link que ja circula por uma mudanca que
// ninguem pediu.
//
// **A ORDEM DAS OUTRAS LINHAS nao e conferida aqui**, e ela nao mudou:
// `perfil_ordem_dos_itens_test.dart` e quem guarda a ordem que o cliente
// determinou em 18/10, e ele continua verde porque nenhuma linha existente
// trocou de lugar -- a nova entrou ENTRE duas delas.

import 'dart:io' as io;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/telas/perfil/vitrine_de_fotos.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Os dois arquivos de `lib/` que esta historia move, lidos da fonte.
const String _fonteDosDados = 'lib/telas/perfil/tela_dados_pessoais.dart';
const String _fonteDoPerfil = 'lib/telas/abas.dart';

/// O simbolo que TODO caminho ate a vitrine tem de atravessar.
///
/// Ancorar aqui, e nao no rotulo, e o que faz a isca (b) sobreviver a troca de
/// nome: o endereco pode mudar de valor e o rotulo pode mudar de palavra, mas
/// quem empurra a tela escreve este simbolo.
const String _simboloDaRota = 'Rotas.minhaVitrine';

/// O rotulo do item que CONTINUA dentro de `Meus dados`.
///
/// Ele e o controle da isca (a): a conta por tipo precisa de um sobrevivente
/// nomeado, senao "um item" poderia ser a porta velha de volta com texto novo.
const String _itemQueFicaEmMeusDados = 'Endereço de entrega';

/// Uma superficie alta: `ListView` so constroi o que cabe, e o menu do Perfil
/// inteiro precisa estar deitado para a linha nova ter `Element` e `dy`.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// O servidor minimo das telas desta historia.
///
/// `/v1/me` e `/v1/pets` sao o que a tela da conta pede ao abrir, e
/// `/v1/me/showcase` e o que `VitrineDeFotosDoUsuario` pede ao montar. A
/// vitrine responde VAZIA de proposito: lista vazia e estado normal e
/// completo, e o que estes casos medem e a PORTA e nao a grade.
Future<http.Response> _servidorDaConta(http.Request req) async {
  final caminho = req.url.path;
  if (caminho == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (caminho == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  if (caminho == '/v1/me/showcase' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'photos': <Map<String, dynamic>>[],
      'max_photos': 9,
    });
  }
  return problema('not-found', 404);
}

/// O item da vitrine no menu do `Perfil`, com escopo em `AbaPerfil`.
///
/// O escopo nao e zelo: o `StatefulShellRoute.indexedStack` mantem as outras
/// abas montadas atras desta, e um `find` solto mediria a arvore inteira.
Finder _itemNoPerfil() => find.descendant(
      of: find.byType(AbaPerfil),
      matching: find.widgetWithText(
        ItemDeMenu,
        VitrineDeFotosDoUsuario.tituloDaTela,
      ),
    );

void main() {
  // -------------------------------------------------------------------------
  group('a metade que SAIU: a porta nao esta mais dentro de `Meus dados`', () {
    testWidgets(
      'isca (a): dentro de `Meus dados` sobrou UM item de menu, e e o endereço',
      (tester) async {
        _superficieAlta(tester);
        await abrirOApp(
          tester,
          rede: _servidorDaConta,
          deposito: depositoLogado(),
        );
        await irParaAConta(tester);
        await tocar(
          tester,
          find.descendant(
            of: find.byType(AbaPerfil),
            matching: find.widgetWithText(ItemDeMenu, 'Meus dados'),
          ),
        );

        // A arvore montou de verdade: sem esta linha, um `Meus dados` que nao
        // abrisse deixaria a conta abaixo medindo uma arvore sem a tela.
        expect(
          find.byType(TelaDadosPessoais),
          findsOneWidget,
          reason: 'REPROVA: `TelaDadosPessoais` nao montou, e a contagem '
              'abaixo mediria outra tela.',
        );

        // **SEM ROLAGEM, e isso e medido pela forma da tela**: o corpo de
        // `TelaDadosPessoais` e `SingleChildScrollView` com uma `Column`, que
        // constroi TODOS os filhos independentemente da dobra. Num `ListView`
        // esta contagem precisaria de rolagem e ficaria verde por nao ter
        // construido o segundo item.
        final itens = find.descendant(
          of: find.byType(TelaDadosPessoais),
          matching: find.byType(ItemDeMenu),
        );

        expect(
          itens,
          findsOneWidget,
          reason: 'REPROVA: `Meus dados` tem '
              '${itens.evaluate().length} itens de menu, e desde 26/10/2026 '
              'tem de ter UM.\n'
              'DOIS significa que a porta de `${VitrineDeFotosDoUsuario.tituloDaTela}` '
              'voltou para dentro desta tela -- com qualquer rotulo, inclusive '
              'um novo que nenhuma conta de texto pegaria. O cliente mandou '
              'TRAZER a linha para o menu do Perfil ("traga o menu minhas '
              'fotos para o menu principal", "primeiro nivel do perfil"), e '
              'deixar as duas portas de pe e dois nomes para o mesmo destino.\n'
              'ZERO significa que `$_itemQueFicaEmMeusDados` foi embora de '
              'carona, e esse item NAO foi pedido: sobre ele o cliente nao '
              'disse nada.\n'
              'ESTA CONTA E POR TIPO, e nao por rotulo.',
        );
        expect(
          find.descendant(
            of: find.byType(TelaDadosPessoais),
            matching: find.widgetWithText(
              ItemDeMenu,
              _itemQueFicaEmMeusDados,
            ),
          ),
          findsOneWidget,
          reason: 'REPROVA: o unico item de menu de `Meus dados` nao e '
              '`$_itemQueFicaEmMeusDados`. A contagem de um acima ficaria '
              'verde com a porta da vitrine de volta e o endereco fora -- e e '
              'esta linha que diz QUAL item sobrou.',
        );
      },
    );

    test('isca (b): a fonte de `Meus dados` nao cita mais a rota da vitrine',
        () {
      final dados = io.File(_fonteDosDados).readAsStringSync();
      final perfil = io.File(_fonteDoPerfil).readAsStringSync();

      // CONTROLE DO SCANNER, e ele vem PRIMEIRO de proposito: a mesma leitura,
      // no arquivo onde a resposta e CONHECIDA, tem de achar o simbolo. Um
      // scanner que lesse o caminho errado ficaria verde na conta de baixo por
      // nao ter conferido nada.
      expect(
        perfil.contains(_simboloDaRota),
        isTrue,
        reason: 'REPROVA: `$_fonteDoPerfil` nao cita `$_simboloDaRota`. Ou a '
            'porta nova morreu (e ai a isca (c) tambem reprova), ou este '
            'scanner esta lendo o arquivo errado -- e nesse caso a conta de '
            'ausencia abaixo nao vale nada.',
      );

      // E a conta de ausencia e sobre CODIGO, nao sobre prosa: o comentario que
      // explica a mudanca cita o simbolo de proposito, e um `contains` solto o
      // acharia. Por isso as linhas de comentario saem antes da conta.
      final semComentario = dados
          .split('\n')
          .where((linha) => !linha.trimLeft().startsWith('//'))
          .where((linha) => !linha.trimLeft().startsWith('///'))
          .join('\n');
      expect(
        semComentario.contains('ItemDeMenu'),
        isTrue,
        reason: 'REPROVA: o filtro de comentarios comeu o codigo de '
            '`$_fonteDosDados` -- ele nao cita mais `ItemDeMenu`, e a tela '
            'tem um. A conta de ausencia abaixo passaria por vazio.',
      );
      expect(
        semComentario.contains(_simboloDaRota),
        isFalse,
        reason: 'REPROVA: o CODIGO de `$_fonteDosDados` voltou a citar '
            '`$_simboloDaRota`. Este simbolo e o que todo caminho ate a '
            'vitrine atravessa, entao cita-lo aqui e repor a porta dentro de '
            '`Meus dados`.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a metade que ENTROU: a vitrine e item do menu do Perfil', () {
    testWidgets('isca (c): a vitrine e item do menu do Perfil', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidorDaConta,
        deposito: depositoLogado(),
      );
      // `irParaAConta` toca na foto da barra de topo, que e a UNICA porta da
      // tela da conta desde 19/10. O caminho medido aqui e o DELE.
      await irParaAConta(tester);

      expect(
        _itemNoPerfil(),
        findsOneWidget,
        reason: 'REPROVA: `${VitrineDeFotosDoUsuario.tituloDaTela}` nao e item '
            'do menu do Perfil. Ela saiu de dentro de `Meus dados` em '
            '26/10/2026 por pedido do cliente, e sair de LA e nao chegar AQUI '
            'deixa a tela sem porta humana nenhuma -- que e como `Pedidos de '
            'conexao` ficou de 18/10 a 19/10, e foi por isso que ele nao viu '
            'nada.',
      );

      // **SEM LINHA DE APOIO**, como as outras onze linhas deste menu. Dentro
      // de `Meus dados` ela tinha `As fotos que so voce ve`; o cliente mandou
      // o apoio sair DESTE menu em 18/10 (*"na pagina do perfil, nao traga o
      // e-mail no menu, deixe apenas o titulo meus dados"*), e trazer a linha
      // de apoio de carona faria a unica linha diferente do conjunto.
      final item = tester.widget<ItemDeMenu>(_itemNoPerfil());
      expect(
        item.apoio,
        isNull,
        reason: 'REPROVA: a linha da vitrine no menu do Perfil ganhou linha de '
            'apoio ("${item.apoio}"). Nenhuma das outras deste menu tem, e a '
            'razao e decisao do cliente de 18/10/2026 sobre ESTE menu.',
      );

      // ACESSIBILIDADE, MEDIDA E NAO HERDADA. `ItemDeMenu` ja da o piso de
      // altura e o `Semantics(button: true)` com `onTap`, e e por isso que a
      // linha nova e um `ItemDeMenu` e nao um `ListTile` novo. Mas "o widget
      // faz" e uma suposicao enquanto ninguem mede a linha QUE ENTROU: no
      // aparelho ela esta dentro de uma `ListView` com um pai que pode
      // encolhe-la, e e o alvo do polegar que importa.
      await tester.ensureVisible(_itemNoPerfil());
      await tester.pumpAndSettle();
      expect(
        tester.getSize(_itemNoPerfil()).height,
        greaterThanOrEqualTo(BichuAlvoDeToque.min),
        reason: 'REPROVA: a linha da vitrine tem '
            '${tester.getSize(_itemNoPerfil()).height} dp de altura, e o piso '
            'e ${BichuAlvoDeToque.min}. Alvo menor que o piso e um item que o '
            'polegar erra (WCAG 2.1 SC 2.5.5).',
      );

      // E O ROTULO PUBLICA A ACAO: nome acessivel igual ao texto da linha,
      // anunciado como BOTAO e carregando a acao de toque. A noite de 21/09
      // achou quatro widgets que se anunciavam como botao sem `tap`, e e esse
      // o defeito que esta conta fecha (SC 4.1.2).
      final handle = tester.ensureSemantics();
      try {
        final no = tester.getSemantics(_itemNoPerfil());
        final dados = no.getSemanticsData();
        expect(
          dados.label,
          VitrineDeFotosDoUsuario.tituloDaTela,
          reason: 'REPROVA: o nome acessivel da linha e "${dados.label}" e '
              'nao "${VitrineDeFotosDoUsuario.tituloDaTela}". Quem usa leitor '
              'de tela ouve o rotulo, e e ele que diz para onde a linha leva.',
        );
        expect(
          dados.flagsCollection.isButton,
          isTrue,
          reason: 'REPROVA: a linha da vitrine nao se anuncia como botao. '
              'Item de menu que se anuncia como texto e, para quem usa leitor '
              'de tela, um caminho que nao existe (SC 4.1.2).',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: a linha da vitrine anuncia-se como botao e NAO '
              'carrega a acao de toque (btn=true tap=false). E o defeito da '
              'noite de 21/09: o TalkBack e o VoiceOver anunciam um botao que '
              'nao ativa.',
        );
      } finally {
        handle.dispose();
      }
    });

    testWidgets(
      'isca (d): ela esta no grupo `Conta`, entre `Meus dados` e os bloqueados',
      (tester) async {
        // A POSICAO, medida em `dy` e nao por presenca -- a mesma tecnica de
        // `perfil_ordem_dos_itens_test.dart`, e pelo mesmo motivo: presenca
        // nao e ordem, e o cliente disse *"primeiro nivel do perfil"* e nao
        // "em algum lugar do perfil".
        //
        // A sequencia cobrada e so a do GRUPO `Conta`, porque e nele que a
        // linha entrou. As outras nao mudaram de lugar, e quem as guarda e
        // `perfil_ordem_dos_itens_test.dart`.
        _superficieAlta(tester);
        await abrirOApp(
          tester,
          rede: _servidorDaConta,
          deposito: depositoLogado(),
        );
        await irParaAConta(tester);

        final alturas = <String, double>{};
        for (final rotulo in <String>[
          'Conta',
          'Meus dados',
          VitrineDeFotosDoUsuario.tituloDaTela,
          'Usuários bloqueados',
        ]) {
          final alvo = find.descendant(
            of: find.byType(AbaPerfil),
            matching: find.text(rotulo),
          );
          expect(
            alvo,
            findsOneWidget,
            reason: 'REPROVA: nao ha exatamente um "$rotulo" no menu do '
                'Perfil, entao nao ha coordenada para medir. Ordem nao se '
                'afirma sobre o que nao esta na arvore.',
          );
          alturas[rotulo] = tester.getTopLeft(alvo).dy;
        }

        expect(
          alturas['Meus dados']!,
          greaterThan(alturas['Conta']!),
          reason: 'REPROVA: `Meus dados` nao esta debaixo do cabecalho '
              '`Conta`, e entao nao ha grupo onde medir a linha nova.',
        );
        expect(
          alturas[VitrineDeFotosDoUsuario.tituloDaTela]!,
          greaterThan(alturas['Meus dados']!),
          reason: 'REPROVA: `${VitrineDeFotosDoUsuario.tituloDaTela}` nao esta '
              'DEPOIS de `Meus dados`. Ela era filha dele ate 26/10/2026: '
              'quem procurava a vitrine descia por ali, e a linha nova fica '
              'onde a mao dessa pessoa ja ia.',
        );
        expect(
          alturas['Usuários bloqueados']!,
          greaterThan(alturas[VitrineDeFotosDoUsuario.tituloDaTela]!),
          reason: 'REPROVA: `${VitrineDeFotosDoUsuario.tituloDaTela}` nao esta '
              'ANTES de `Usuários bloqueados`. Aquele item fecha o grupo '
              '`Conta` com o que eu RECUSEI, e a prosa dele em `abas.dart` diz '
              'isso por extenso. Se a linha nova foi para baixo dele, ela '
              'saiu do lugar que a prosa declara.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('CONTROLE POSITIVO — o item ABRE a vitrine, e nao e so um nome', () {
    testWidgets('CONTROLE POSITIVO: tocar o item ABRE a vitrine', (
      tester,
    ) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidorDaConta,
        deposito: depositoLogado(),
      );
      await irParaAConta(tester);

      final item = _itemNoPerfil();
      expect(item, findsOneWidget);

      // ALCANCE DE VERDADE, e nao `warnIfMissed: false`: `ensureVisible` traz
      // o item para dentro da janela e o `tap` abaixo e o normal, que REPROVA
      // quando o toque nao acerta o widget. Um helper que engolisse o aviso
      // aprovaria um item coberto por outra coisa.
      await tester.ensureVisible(item);
      await tester.pumpAndSettle();
      await tester.tap(item);
      await tester.pumpAndSettle();

      expect(
        find.byType(VitrineDeFotosDoUsuario),
        findsOneWidget,
        reason: 'REPROVA: o toque no item do menu do Perfil nao abriu '
            '`VitrineDeFotosDoUsuario`. **ESTA E A CONTA QUE AS OUTRAS QUATRO '
            'NAO FAZEM**: (a) e (b) provam que a porta saiu de `Meus dados`, '
            '(c) e (d) provam que um nome existe e onde ele esta na pagina, e '
            'as quatro ficariam VERDES com o item na tela e sem destino -- '
            'acao sem desfecho, que o criterio 2 da BICHUS-62 proibe.\n'
            'O caminho tem quatro pontas e qualquer uma quebra aqui: foto da '
            'barra de topo, `AbaPerfil`, o `ItemDeMenu` de `abas.dart`, e a '
            'fiacao da rota em `rotas.dart` -- que nao e nenhum dos outros '
            'arquivos desta historia.',
      );

      // E O ENDERECO E O MESMO. Mover a linha no menu nao mexeu na rota, de
      // proposito: um caso que so olhasse o tipo da tela aprovaria um renome
      // que quebrasse todo link que ja circula.
      expect(
        Rotas.minhaVitrine,
        '/perfil/minhas-fotos',
        reason: 'REPROVA: o endereco da vitrine deixou de ser '
            '`/perfil/minhas-fotos`. O cliente pediu a linha em outro NIVEL '
            'do menu, e nao outro endereco; trocar o valor quebra link que ja '
            'circula por uma mudanca que ninguem pediu.',
      );
    });
  });
}
