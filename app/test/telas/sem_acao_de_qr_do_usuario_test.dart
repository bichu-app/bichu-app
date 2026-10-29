// A ISCA DE QUE AS ACOES DE QR DO USUARIO **NAO VOLTAM** (26/10/2026).
//
// ===========================================================================
// O PEDIDO, E AS DUAS METADES DELE
// ===========================================================================
// - **22/10/2026**, literal: *"O usuario nao gera o qr-code dele… nao deve ter
//   a acao de trocar o qr-code dele ou de apagar."*
// - **26/10/2026**, a metade positiva: *"o usuario nao deve criar o qr-code,
//   ele deve ser criado automaticamente quando o usuario se cadastrar ou ele
//   cadastrar seu pet."*
//
// ===========================================================================
// EXISTEM **DOIS** QR NO PRODUTO, E ESTE ARQUIVO MEDE UM
// ===========================================================================
// Medido em `1654bcaf`: `app/lib/widgets/` tem exatamente dois QR, e eles
// nascem em lugares diferentes.
//
//   `QrDaPlaquinha`  o QR DO PET. Nasce SOZINHO: `TelaPetCadastrado` chama
//                    `emitirTag` em `didChangeDependencies`, sem toque nenhum.
//                    **Nao ha acao de criar, de trocar nem de apagar** na pasta
//                    `telas/pet/` -- `pets_api.dart` nao tem metodo de
//                    revogacao, e o `Desativar a tag` que aparece em
//                    `tela_detalhe_do_pet.dart:76` esta na lista "Ficam de
//                    fora" do cabecalho: e COMENTARIO sobre uma ausencia
//                    deliberada, e nao codigo.
//   `QrDoConvite`    o QR DA PESSOA, nesta tela. **Tinha as tres acoes**:
//                    `Criar o meu QR de convite`, `Trocar o meu QR` e
//                    `Apagar o meu QR`.
//
// Ou seja: o que o cliente descreveu estava AQUI, e nao no pet. Esta tela
// nasceu em 21/10 (`d6cf67bd`), **um dia antes** da fala dele de 22/10.
//
// ===========================================================================
// O QUE SAIU, E O QUE DE PROPOSITO NAO SAIU
// ===========================================================================
// SAIRAM `Trocar o meu QR` e `Apagar o meu QR`, com os avisos de cada uma.
//
// **FICOU `Criar o meu QR de convite`, e isso e uma ressalva parada no
// cliente.** Medido em `api/openapi.yaml`: as operacoes de convite sao tres --
// `issueConnectionInvite` (7268), `revokeConnectionInvite` (7343) e
// `resolveConnectionInvite` (7378), que e o lado de quem ESCANEIA. **Nao existe
// operacao de leitura do proprio convite**, porque o banco guarda so o
// SHA-256. Sem `Criar` esta tela nao teria QR nenhum; e emitir sozinha na
// abertura revogaria o convite anterior a cada visita, que e o dano de
// `Trocar` sem ninguem ter pedido. Tornar a criacao automatica passa pelo
// `openapi.yaml`, que tem portao de compatibilidade.
//
// **E A CAPACIDADE DO SERVIDOR NAO FOI ARRANCADA.** `ConvitesApi.revogar`
// continua em `api/convites_api.dart` e `revokeConnectionInvite` continua no
// contrato, intocados -- as decisoes dele de 17/10 (*"apenas desabilite na
// plataforma"*) e de 26/10 (*"nao apague nada, mantenha e corrija a
// politica"*) mandam nao confundir tirar a porta com tirar a capacidade.
//
// ===========================================================================
// COMO CADA CASO REPROVA COM O MECANISMO DESLIGADO
// ===========================================================================
// DESLIGAMENTO: em `telas/conexoes/convide_tutores.dart`, reponha no `else` de
// `_blocoDoConvite` os dois `BotaoSecundario` (`Trocar o meu QR` -> `_emitir`,
// `Apagar o meu QR` -> `_apagar`).
//
//   (1) `com o QR na tela, nao ha segunda acao nenhuma` -- reprova: acha 2
//       `BotaoSecundario` onde exige 0.
//   (2) `o rotulo das acoes tiradas nao existe mais no arquivo` -- reprova ao
//       achar o texto na fonte. Ancorado na FONTE e nao na tela: um rotulo
//       renomeado ao repor o botao passaria por (1) se (1) olhasse texto, e e
//       por isso que (1) olha TIPO e este olha a fonte.
//   (3) `a tela nao alcanca a revogacao` -- reprova: o toque no botao reposto
//       faz sair o `DELETE`.
//
// **ASSERCAO NEGATIVA NAO PASSA NO VAZIO AQUI**: (1) e (3) so correm depois de
// o QR estar na tela, provado por `findsOneWidget` sobre `QrDoConvite`, e (1)
// confere que o `BotaoPrimario` de criar EXISTE no estado vazio -- e isso que
// prova que o localizador de botao funciona.

import 'dart:convert';

import 'package:bichu/config/app_config.dart';
import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/qr_do_convite.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../dispositivo/diretivas_dart.dart';
import 'ajuda_de_tela.dart';

const String _token = 'KJ8M4QRS7TVW2XYZ';

/// A ULTIMA COISA DO BLOCO DO CONVITE, e o controle positivo de que a regiao
/// onde os dois botoes moravam esta **construida**.
///
/// `Trocar` e `Apagar` vinham DEPOIS deste texto. Se ele esta na arvore, o pe
/// do bloco esta montado, e um botao reposto ali tambem estaria -- e e so com
/// isso provado que o `findsNothing` dos casos vale alguma coisa.
final Finder fimDoBloco = find.textContaining(
  // O TEXTO MUDOU DE "tela" PARA "secao" EM 28/10/2026, com a casa: o QR saiu
  // de `convide_tutores.dart` (que morreu) para uma secao RECOLHIDA de
  // `Meus dados`. A frase e a mesma afirmacao -- o QR nao sobrevive a sair
  // daqui, porque nao existe operacao de LEITURA do proprio convite.
  'O QR aparece aqui enquanto esta seção',
);

/// O BLOCO DO CONVITE, recortado pelo NOME DA CLASSE.
///
/// `_BlocoDoConvite` e privado de `tela_dados_pessoais.dart`, e por isso nao da
/// para escrever `find.byType`. **O recorte importa mais que a conveniencia**:
/// o QR mora dentro de `Meus dados` desde 28/10/2026, e varrer os controles da
/// PAGINA acharia `Salvar`, o seletor de foto e o do endereco -- nenhum deles
/// tem a ver com esta isca, e os tres levariam a reprovacao para outro motivo.
///
/// MEDIDO, e e por isso que nao e `find.ancestor(... Column)`: a `Column` mais
/// proxima do pe do bloco NAO contem o botao (o conteudo e uma `List<Widget>`
/// espalhada), e a mais distante e a do formulario inteiro. Com a primeira a
/// contagem deu ZERO e com a segunda deu mais de um -- as duas reprovando pelo
/// recorte e nao pela isca.
final Finder blocoDoConvite = find.byWidgetPredicate(
  (Widget w) => w.runtimeType.toString() == '_BlocoDoConvite',
);

/// A FONTE da tela, lida do disco.
///
/// O caso (2) mede o ARQUIVO e nao a arvore de widgets: e a unica forma de
/// provar que o rotulo nao ficou para tras como constante morta, a um
/// `BotaoSecundario` de distancia de o controle voltar sem texto novo.
/// **O ARQUIVO MUDOU EM 28/10/2026, E A ASSERCAO NAO.**
///
/// Era `lib/telas/conexoes/convide_tutores.dart`. Aquela tela MORREU por
/// decisao do cliente, e o QR -- com o placar `invited_joined_count` -- foi
/// para uma secao recolhida de `Meus dados`. A varredura segue o QR: o que
/// ela cobra e que os dois rotulos de acao sobre o PROPRIO codigo nao voltem
/// ao arquivo que o hospeda, e isso nao depende de qual arquivo e.
File get _fonteDaTela =>
    File('lib/telas/perfil/tela_dados_pessoais.dart');

void main() {
  late List<String> chamadas;

  Future<void> montar(WidgetTester tester) async {
    // ===================================================================
    // A TELA ALTA NAO E CONVENIENCIA: SEM ELA ESTE ARQUIVO MENTIA
    // ===================================================================
    // **MEDIDO, com os dois botoes repostos**: os casos (1) e (3) ficaram
    // VERDES com o defeito na tela. A causa nao era o localizador -- era a
    // `ListView`. Ela constroi por demanda, e `Trocar`/`Apagar` ficavam ABAIXO
    // da dobra numa tela de 600 dp: nunca eram construidos, `find.byType` nao
    // os achava, e o `findsNothing` passava **no vazio** -- exatamente a
    // armadilha da assercao negativa.
    //
    // 1600 dp de altura fazem o bloco do convite inteiro caber e ser
    // construido. O caso confirma que caiu, pelo controle positivo
    // [fimDoBloco], em vez de supor que caiu.
    tester.view.physicalSize = const Size(375 * 3, 1600 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    chamadas = <String>[];
    AppConfig.limparParaTeste();
    Future<http.Response> resposta(http.Request pedido) async {
      chamadas.add('${pedido.method} ${pedido.url.path}');
      if (pedido.method == 'POST' &&
          pedido.url.path.endsWith('/connection-invites')) {
        return http.Response(
          jsonEncode(<String, dynamic>{
            'invite_token': _token,
            'expires_at': '2026-11-20T12:00:00.000Z',
          }),
          201,
          headers: const <String, String>{
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      if (pedido.url.path.endsWith('/connections/summary')) {
        return http.Response(
          jsonEncode(<String, dynamic>{
            'connected_count': 12,
            'pending_sent_count': 2,
            'requests_received_count': 1,
            'remaining_requests_today': 7,
            'connection_limit': 150,
            'invited_joined_count': 0,
          }),
          200,
          headers: const <String, String>{
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      // O 204 do `DELETE` FICA RESPONDIDO de propósito: se o caso (3) falhar,
      // ele falha pela chamada ter saido -- e nao por um 404 que faria a tela
      // acender uma faixa e o motivo da reprovacao virar outro.
      if (pedido.method == 'DELETE') return http.Response('', 204);
      // `GET /v1/me`: `Meus dados` nao monta o formulario sem ele, e sem o
      // formulario a secao do convite -- que e o ultimo bloco dele -- nao
      // existe na arvore. Entrou com a bancada nova de 28/10/2026.
      if (pedido.url.path.endsWith('/me')) {
        return http.Response(
          jsonEncode(<String, dynamic>{
            'id': 'u-1',
            'email': 'marina@exemplo.com.br',
            'email_verified': true,
            'display_name': 'Marina',
            'handle': 'marina',
            'pending_profile_fields': <String>[],
            'can_open_lost_case': true,
          }),
          200,
          headers: const <String, String>{
            'content-type': 'application/json; charset=utf-8',
          },
        );
      }
      return http.Response('{}', 404);
    }

    // ===================================================================
    // A BANCADA ABRE O APP, E NAO UMA TELA SOLTA (28/10/2026)
    // ===================================================================
    //
    // Antes era `MaterialApp(home: TelaDeConvidarTutores(...))`. Aquela tela
    // MORREU, e o bloco do convite e privado de `tela_dados_pessoais.dart` --
    // ele vive dentro do formulario de `Meus dados`, que precisa de `MeApi`,
    // da sessao e do `Escopo` inteiro. Montar o `Escopo` a mao aqui exigiria
    // dezenas de campos obrigatorios; `abrirOApp` e o ponto unico da casa
    // para isso, e e o que as outras iscas desta frente usam.
    //
    // **O que o arquivo mede nao mudou**: a arvore montada do bloco (provada
    // por [fimDoBloco]) e o CODIGO do arquivo que o hospeda, lido do disco.
    await abrirOApp(tester, rede: resposta, deposito: depositoLogado());
    await irPara(tester, Rotas.dadosPessoais);
    await tester.pumpAndSettle();
    // A SECAO E O ULTIMO BLOCO DA PAGINA, e `Meus dados` e um formulario
    // longo: mesmo com 1600 dp ela nasce abaixo da dobra, e o
    // `SingleChildScrollView` nao a constroi sem a rolagem. **Sem esta linha
    // os dois casos reprovavam por nao achar o controle de abrir** -- medido.
    // `ensureVisible` e nao `scrollUntilVisible`: o corpo de `Meus dados` e um
    // `SingleChildScrollView`, que constroi TODOS os filhos (nao e preguicoso)
    // -- o bloco ja esta na arvore, so fora de cena. E `scrollUntilVisible`
    // exige UM `Scrollable`, e esta arvore tem mais de um (`Bad state: Too
    // many elements`, medido).
    final cabecalhoDoConvite = find.text(TelaDadosPessoais.tituloDoConvite);
    await tester.ensureVisible(cabecalhoDoConvite);
    await tester.pumpAndSettle();

    // A SECAO NASCE RECOLHIDA: sem este toque nada do bloco esta na arvore, e
    // o `findsNothing` dos casos passaria no vazio -- a mesma armadilha que a
    // nota da tela alta, acima, descreve.
    await tester.tap(cabecalhoDoConvite);
    await tester.pumpAndSettle();
    // E o conteudo aberto tambem entra em cena, pelo mesmo caminho.
    await tester.ensureVisible(find.text(TelaDadosPessoais.criarOConvite));
    await tester.pumpAndSettle();
  }

  testWidgets('com o QR na tela, nao ha segunda acao nenhuma', (tester) async {
    await montar(tester);

    // CONTROLE POSITIVO DO LOCALIZADOR: no estado vazio existe UM botao, o de
    // criar. Sem esta linha, o `findsNothing` adiante poderia estar medindo um
    // localizador que nunca acha nada.
    expect(
      find.text(TelaDadosPessoais.criarOConvite),
      findsOneWidget,
      reason:
          'Controle positivo: o estado sem convite tem de oferecer a acao de '
          'criar. Se ela tambem desapareceu, as assercoes negativas deste '
          'arquivo nao provam nada.',
    );

    await tester.tap(find.text(TelaDadosPessoais.criarOConvite));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO DO ESTADO: chegamos ao estado que TINHA as duas acoes.
    expect(
      find.byType(QrDoConvite),
      findsOneWidget,
      reason:
          'Controle positivo: o QR tem de estar na tela. As duas acoes '
          'tiradas so existiam neste estado, e medir a ausencia delas no '
          'estado vazio seria medir o vazio.',
    );

    // CONTROLE POSITIVO DA CONSTRUCAO -- e sem ele este caso ja ficou verde
    // com o defeito na tela. Ver o comentario em `montar`.
    expect(
      fimDoBloco,
      findsOneWidget,
      reason:
          'Controle positivo: o pe do bloco do convite tem de estar '
          'construido. `Trocar` e `Apagar` vinham DEPOIS deste texto, e numa '
          'tela baixa a `ListView` nao os constroi -- o `findsNothing` abaixo '
          'passaria no vazio, que e como este caso ficou verde na primeira '
          'tentativa de provar a isca.',
    );

    // ==================================================================
    // A ASSERCAO MUDOU DE ANCORA EM 28/10/2026, E A RAZAO E UMA COLISAO REAL
    // ==================================================================
    //
    // Ela era ancorada no TIPO `BotaoSecundario`, porque `Trocar` e `Apagar`
    // eram os dois unicos daquela tela -- e a tela inteira era o convite.
    //
    // **Na casa nova isso deixou de discriminar.** O QR vive numa gaveta de
    // apoio dentro de `Meus dados`, e ali `Criar o meu QR de convite` E um
    // `BotaoSecundario` por escolha de desenho: a acao PRIMARIA daquela
    // pagina e `Salvar`, que mora na barra fixa, e dois botoes primarios na
    // mesma tela sao a pilha sem primaria nenhuma que o design system proibe.
    // Manter a ancora de tipo reprovaria o desenho certo.
    //
    // **A ancora passou a ser o CONJUNTO DE CONTROLES do bloco**: ha
    // exatamente UM, o de criar. Qualquer acao reposta -- com o rotulo velho
    // ou com outro -- faz esta contagem subir, entao renomear continua nao
    // escapando. E a varredura de FONTE do caso (2) cobra os dois rotulos
    // originais pelo nome, no arquivo que agora hospeda o QR.
    final controlesDoBloco = find.descendant(
      of: blocoDoConvite,
      // `byWidgetPredicate` e nao `byType`: **`find.byType` casa o tipo EXATO
      // e nao subtipo** -- `ButtonStyleButton` e a superclasse de
      // `FilledButton`, `OutlinedButton` e `TextButton`, e `byType` dela acha
      // ZERO. Medido nesta rodada, e o caso ficou reprovando pelo localizador
      // em vez da isca.
      matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
    );
    expect(
      controlesDoBloco,
      findsOneWidget,
      reason:
          'REPROVA: o bloco do convite voltou a oferecer mais de uma acao com '
          'o QR na tela. A unica e `Criar o meu QR de convite`; '
          '`Trocar o meu QR` e `Apagar o meu QR` eram as outras duas, e o '
          'cliente tirou as duas em 22/10: *"nao deve ter a acao de trocar o '
          'qr-code dele ou de apagar"*.',
    );
    expect(
      tester.widget<ButtonStyleButton>(controlesDoBloco).child,
      isA<Text>().having(
        (Text t) => t.data,
        'rotulo',
        TelaDadosPessoais.criarOConvite,
      ),
      reason:
          'REPROVA: o unico controle do bloco nao e o de criar. Se ha um '
          'controle so e ele nao e este, a acao de criar foi SUBSTITUIDA por '
          'outra -- e a contagem sozinha nao pegaria isso.',
    );
  });

  test('o rotulo das acoes tiradas nao existe mais no CODIGO da tela', () {
    // **O FONTE SEM COMENTARIOS, e isto nao e detalhe.** O cabecalho daquele
    // arquivo CITA os dois rotulos em prosa, de propósito, para que quem for
    // repor saiba o que foi tirado e por quem. Uma busca sobre o fonte cru
    // reprovaria pela documentacao da propria decisao -- que e exatamente o
    // modo de falha que ja fez uma sonda reportar quatro ocorrencias que eram
    // so comentario. `semComentarios` vem de
    // `test/dispositivo/diretivas_dart.dart` e existe para este caso.
    final codigo = semComentarios(_fonteDaTela.readAsStringSync());

    // CONTROLE POSITIVO DA LEITURA: li a fonte certa, e o corta-comentario nao
    // comeu o codigo. Sem estas duas linhas, um caminho errado -- ou um
    // `semComentarios` que devolvesse vazio -- deixaria as duas buscas abaixo
    // "sem achar" e o caso verde sobre nada.
    expect(
      codigo,
      contains('class TelaDadosPessoais'),
      reason:
          'Controle positivo: nao li o CODIGO da tela que hospeda o QR. Sem '
          'ele, as '
          'duas buscas abaixo passariam por eu ter lido o arquivo errado -- '
          'ou por `semComentarios` ter devolvido vazio.',
    );
    expect(
      codigo,
      contains('static const String criarOConvite ='),
      reason:
          'Controle positivo: o rotulo de criar tem de estar no codigo. Ele '
          'prova que a busca por rotulo NESTE arquivo acha o que existe.',
    );

    expect(
      codigo.contains('Trocar o meu QR'),
      isFalse,
      reason:
          'REPROVA: o rotulo `Trocar o meu QR` voltou ao CODIGO de '
          '`tela_dados_pessoais.dart`. Constante de rotulo sobrando e um '
          '`BotaoSecundario` de distancia de a acao voltar, e voltaria sem '
          'nenhum texto novo no arquivo.',
    );
    expect(
      codigo.contains('Apagar o meu QR'),
      isFalse,
      reason:
          'REPROVA: o rotulo `Apagar o meu QR` voltou ao CODIGO de '
          '`tela_dados_pessoais.dart`.',
    );
  });

  testWidgets('a tela nao alcanca a revogacao do convite', (tester) async {
    await montar(tester);
    await tester.tap(find.text(TelaDadosPessoais.criarOConvite));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO: a emissao SAIU. Prova que `chamadas` registra de
    // verdade -- sem ele, o `isNot(contains(...))` abaixo passaria sobre uma
    // lista que nunca recebeu nada.
    expect(
      chamadas,
      contains('POST /v1/connection-invites'),
      reason:
          'Controle positivo: a emissao tem de ter saido. Sem ela a lista de '
          'chamadas esta vazia e a ausencia do DELETE nao prova nada.',
    );

    // CONTROLE POSITIVO DA CONSTRUCAO: o pe do bloco esta montado, entao os
    // botoes que tocamos abaixo sao TODOS os que existem. Sem ele o laco
    // tocaria em nada numa tela baixa e o caso ficaria verde no vazio.
    expect(
      fimDoBloco,
      findsOneWidget,
      reason:
          'Controle positivo: o pe do bloco do convite tem de estar '
          'construido, senao o laco de toques abaixo nao alcanca a regiao '
          'onde `Apagar o meu QR` morava.',
    );

    // TOCA EM TUDO o que o BLOCO oferece neste estado. Com qualquer das duas
    // acoes reposta, um destes toques a aciona.
    //
    // **Recortado ao bloco desde 28/10/2026**, e nao a tela: o QR mora dentro
    // de `Meus dados`, e tocar em tudo o que AQUELA pagina oferece acionaria
    // `Salvar` e o seletor de foto -- controles que nada tem a ver com a isca,
    // e que levariam a reprovacao para outro motivo.
    //
    // `ButtonStyleButton` cobre `FilledButton`, `OutlinedButton` e
    // `TextButton`, que e o que `BotaoPrimario` e `BotaoSecundario` montam por
    // dentro: a varredura nao depende de qual dos dois involucros a acao
    // reposta usaria.
    final doBloco = find.descendant(
      of: blocoDoConvite,
      // `byWidgetPredicate` e nao `byType`: **`find.byType` casa o tipo EXATO
      // e nao subtipo** -- `ButtonStyleButton` e a superclasse de
      // `FilledButton`, `OutlinedButton` e `TextButton`, e `byType` dela acha
      // ZERO. Medido nesta rodada, e o caso ficou reprovando pelo localizador
      // em vez da isca.
      matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
    );
    for (var i = 0; i < doBloco.evaluate().length; i++) {
      await tester.ensureVisible(doBloco.at(i));
      await tester.pumpAndSettle();
      await tester.tap(doBloco.at(i));
      await tester.pumpAndSettle();
    }

    expect(
      chamadas,
      isNot(contains('DELETE /v1/connection-invites')),
      reason:
          'REPROVA: um toque desta tela revogou o convite. A capacidade do '
          'servidor continua existindo de propósito (decisoes de 17/10 e '
          '26/10); o que saiu foi a PORTA, e nenhum toque daqui pode '
          'alcanca-la.',
    );
  });
}
