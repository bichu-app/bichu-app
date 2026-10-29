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
// REANCORAGEM DE 27/10/2026: `Meus dados` FICOU COM ZERO ITENS DE MENU
// ===========================================================================
//
// **O que (a) e (b) mediam antes.** (a) contava os `ItemDeMenu` de
// `TelaDadosPessoais` POR TIPO, exigia exatamente UM, e exigia que o
// sobrevivente fosse `Endereço de entrega`. O sobrevivente nomeado era o
// controle contra a armadilha da asserção de ausência: "um item" nao poderia
// ser a porta velha da vitrine de volta com outro rotulo. (b) lia a FONTE e
// cobrava que o codigo de `tela_dados_pessoais.dart` nao citasse mais
// `Rotas.minhaVitrine`, com dois controles -- o scanner achando o simbolo em
// `abas.dart`, onde a resposta e conhecida, e o filtro de comentarios provando
// que nao tinha comido o codigo (ele cobrava `ItemDeMenu` na fonte).
//
// **O que mudou, e sao DUAS decisoes do cliente, nenhuma minha.**
//
//   1. **26/10/2026** -- *"traga o menu minhas fotos para o menu principal"* e,
//      perguntado qual menu, *"primeiro nivel do perfil"*. E a decisao que este
//      arquivo nasceu para guardar, e ela continua honrada.
//   2. **27/10/2026** -- *"o endereco de entrega da plaquinha tem que estar
//      dentro do cadastro do pet"* e, com a decisao de 21/10 posta na mesa,
//      **"endereco um por pet"**. `Endereço de entrega` saiu de `Meus dados` e
//      foi para `Editar pet` (`Rotas.enderecoDeEntregaDoPet`). **Nada foi
//      apagado**: a tela e a MESMA (`TelaEnderecoDeEntrega`), ela mudou de
//      alvo. A prosa inteira esta em `lib/telas/perfil/tela_dados_pessoais.dart`
//      e em `lib/telas/pet/tela_editar_pet.dart`.
//
// Juntas, as duas esvaziaram `Meus dados` de itens de menu. **A conta de UM
// passou a reprovar sobre ZERO, e a ausencia do segundo item e entrega, nao
// defeito** -- medido em 27/10/2026: `Meus dados tem 0 itens de menu`. E (b)
// caiu junto, pelo CONTROLE e nao pela conta: o filtro de comentarios cobrava
// `ItemDeMenu` na fonte de `Meus dados`, e aquele arquivo nao tem mais nenhum.
//
// **O que elas medem agora.** A mesma propriedade das duas metades, com a
// ancora deslocada para onde as decisoes a puseram:
//
//   - (a) exige **ZERO** `ItemDeMenu` em `TelaDadosPessoais`, e a ausencia nao
//     e afirmada no vazio: o controle positivo e o ULTIMO campo da `Column`
//     (`Estado`), que fica imediatamente ANTES do lugar onde os dois itens
//     viviam. O corpo e `SingleChildScrollView` com `Column` e constroi todos
//     os filhos independentemente da dobra, entao achar `Estado` prova que a
//     `Column` foi construida ATE o ponto medido. Alem da conta por tipo, os
//     dois rotulos que sairam sao nomeados e cobrados ausentes -- um por
//     decisao;
//   - (b) ganhou o SEGUNDO controle de scanner, e e ele que mede a chegada:
//     o codigo de `tela_editar_pet.dart` TEM de citar
//     `Rotas.enderecoDeEntrega`. Sem essa linha, "o endereco saiu de `Meus
//     dados`" ficaria verde com o endereco sem porta nenhuma, que e o defeito
//     que o criterio 2 da BICHUS-62 chama de acao sem desfecho. O controle do
//     filtro de comentarios foi reancorado de `ItemDeMenu` para
//     `class TelaDadosPessoais`, que e codigo e nao sai daquele arquivo.
//
// **Por que o veredito continua o mesmo.** As duas iscas negativas continuam
// sendo asserções de ausência com controle positivo na frente, e nenhuma
// asserção foi afrouxada: a conta por tipo ficou MAIS estrita (de "exatamente
// um" para "exatamente zero" mais dois rotulos nomeados), e o scanner ganhou um
// controle que nao tinha.
//
// **O QUE A REANCORAGEM NAO MEDE, e por que nao.** A porta do endereco em
// `Editar pet` e medida AQUI pela fonte, e nao pela arvore. `TelaEditarPet`
// recebe o pet por `extra` (ver `Rotas`), entao alcanca-la num teste de widget
// pede a cadeia `Pets` > detalhe > `Editar` com os fixtures de pet do contrato
// -- e copia-los para este arquivo criaria a segunda copia de fixture que
// diverge no dia em que um campo mudar. A TELA do endereco por pet e o `PUT`
// dela tem 30 casos de widget em `endereco_de_entrega_do_pet_test.dart`
// (grupos F e H), e a linha que aponta para ela esta em `tela_editar_pet.dart`.
// Esta isca mede o fio entre as duas.
//
// ===========================================================================
// A TABELA DAS ISCAS: o que se desliga, e qual caso reprova
// ===========================================================================
//
// | isca | o que se desliga em `lib/` | reprova em |
// |---|---|---|
// | (a) | repor QUALQUER `ItemDeMenu` em `tela_dados_pessoais.dart` | `dentro de `Meus dados` nao sobrou item de menu nenhum` |
// | (b) | repor `Rotas.minhaVitrine` em `tela_dados_pessoais.dart`, ou tirar o `ItemDeMenu` do endereco de `tela_editar_pet.dart` | `a fonte de `Meus dados` nao cita mais rota de vitrine nem de endereco` |
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
//   exatamente ZERO desde 27/10/2026, e o controle positivo e `Estado` -- o
//   ULTIMO campo da `Column`, imediatamente antes do lugar onde os dois itens
//   viviam. Qualquer numero maior que zero reprova (uma das duas portas voltou,
//   com qualquer rotulo), e o controle reprova se a tela nao montou ou se a
//   `Column` parou antes do ponto medido.
// - **(b)** ancora nos SIMBOLOS `Rotas.minhaVitrine` e `Rotas.enderecoDeEntrega`,
//   lidos da fonte, e os CONTROLES DO SCANNER vem primeiro: a mesma leitura
//   aplicada a `abas.dart` TEM de achar o primeiro, e aplicada a
//   `tela_editar_pet.dart` TEM de achar o segundo. Varredura que nao acha nada
//   passaria nas duas contas de ausencia; estes dois provam que ela acha onde a
//   resposta e conhecida -- e o segundo mede a CHEGADA do endereco.
//
// ===========================================================================
// O QUE ESTE ARQUIVO NAO MEDE, de proposito
// ===========================================================================
//
// **O ENDERECO DA VITRINE NAO MUDOU, e isso e medido em (e) por igualdade de
// string.** `/perfil/minhas-fotos` continua o mesmo: mudar de lugar no menu nao
// e mudar de endereco, e renomear quebraria link que ja circula por uma mudanca
// que ninguem pediu. (Isto e sobre a rota da VITRINE. A do endereco de entrega
// mudou de verdade em 27/10/2026, por decisao do cliente, e quem a guarda e
// `endereco_de_entrega_do_pet_test.dart`.)
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

/// Os arquivos de `lib/` que estas duas historias movem, lidos da fonte.
const String _fonteDosDados = 'lib/telas/perfil/tela_dados_pessoais.dart';
const String _fonteDoPerfil = 'lib/telas/abas.dart';

/// Onde o `Endereço de entrega` passou a morar em 27/10/2026.
///
/// Ele e o controle de CHEGADA da isca (b): sem ele, "o endereco saiu de `Meus
/// dados`" ficaria verde com o endereco sem porta nenhuma.
const String _fonteDoPet = 'lib/telas/pet/tela_editar_pet.dart';

/// O simbolo que TODO caminho ate a vitrine tem de atravessar.
///
/// Ancorar aqui, e nao no rotulo, e o que faz a isca (b) sobreviver a troca de
/// nome: o endereco pode mudar de valor e o rotulo pode mudar de palavra, mas
/// quem empurra a tela escreve este simbolo.
const String _simboloDaRota = 'Rotas.minhaVitrine';

/// O simbolo que TODO caminho ate o endereco de entrega tem de atravessar.
///
/// **Sem o sufixo `DoPet` de proposito**: `Rotas.enderecoDeEntrega` e o caminho
/// e `Rotas.enderecoDeEntregaDoPet(id)` e quem o monta, e os dois comecam por
/// este texto. A conta de ausencia em `Meus dados` precisa pegar os DOIS -- o
/// que voltasse para la seria qualquer um deles.
const String _simboloDoEndereco = 'Rotas.enderecoDeEntrega';

/// O ULTIMO campo da `Column` de `TelaDadosPessoais`, e o controle da isca (a).
///
/// A conta de ausencia precisa de uma prova de que a `Column` foi construida
/// ATE o lugar medido: os dois `ItemDeMenu` que sairam vinham logo DEPOIS deste
/// campo. Literal e nao simbolo porque `_TextosDosDados` e privado daquele
/// arquivo -- o preco de um rotulo renomeado e esta isca reprovando com uma
/// mensagem que diz exatamente o que conferir, e nao ficando verde.
const String _ultimoCampoDeMeusDados = 'Estado';

/// Os dois rotulos que SAIRAM de `Meus dados`, cada um por uma decisao.
///
/// Nomeados para que a conta por tipo nao seja a unica medicao: se um dia
/// `ItemDeMenu` virar outro widget, estas duas linhas continuam dizendo que
/// nenhuma das duas portas esta de volta nesta tela.
const String _vitrineQueSubiu = 'Minhas fotos';
const String _enderecoQueFoiParaOPet = 'Endereço de entrega';

/// O CODIGO de um arquivo de `lib/`, sem as linhas de comentario.
///
/// A prosa desta casa cita os simbolos de proposito -- os paragrafos que
/// explicam estas duas mudancas nomeiam `Rotas.minhaVitrine` e
/// `Rotas.enderecoDeEntregaDoPet` por extenso --, e um `contains` solto os
/// acharia. Por isso toda conta de (b) le daqui, e por isso (b) tem um controle
/// provando que este filtro nao comeu o codigo junto.
String _codigoDe(String caminho) => io.File(caminho)
    .readAsStringSync()
    .split('\n')
    .where((linha) => !linha.trimLeft().startsWith('//'))
    .join('\n');

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
      'isca (a): dentro de `Meus dados` não sobrou item de menu nenhum',
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
        //
        // **O CONTROLE POSITIVO DA AUSENCIA, e ele vem ANTES da conta.** Desde
        // 27/10/2026 a conta cobrada e ZERO, e zero e o numero que uma arvore
        // vazia tambem da. `Estado` e o ULTIMO campo daquela `Column`, e os
        // dois `ItemDeMenu` que sairam vinham logo DEPOIS dele: achar este
        // rotulo prova que a `Column` foi construida ATE o ponto medido, e nao
        // que a tela parou antes de chegar la.
        expect(
          find.descendant(
            of: find.byType(TelaDadosPessoais),
            matching: find.text(_ultimoCampoDeMeusDados),
          ),
          findsOneWidget,
          reason: 'REPROVA: `$_ultimoCampoDeMeusDados` -- o ULTIMO campo do '
              'corpo de `Meus dados` -- nao esta na arvore. A conta de ZERO '
              'itens de menu abaixo passaria por vazio: ela nao distingue "os '
              'dois itens sairam por decisao" de "a `Column` nao foi '
              'construida ate onde eles viviam".',
        );

        final itens = find.descendant(
          of: find.byType(TelaDadosPessoais),
          matching: find.byType(ItemDeMenu),
        );

        expect(
          itens,
          findsNothing,
          reason: 'REPROVA: `Meus dados` tem '
              '${itens.evaluate().length} itens de menu, e desde 27/10/2026 '
              'tem de ter ZERO. Duas decisoes do cliente esvaziaram esta '
              'tela, e QUALQUER item aqui significa que uma das duas portas '
              'voltou -- com qualquer rotulo, inclusive um novo que nenhuma '
              'conta de texto pegaria:\n'
              '- `${VitrineDeFotosDoUsuario.tituloDaTela}` subiu para o '
              'primeiro nivel do menu do Perfil em 26/10/2026 ("traga o menu '
              'minhas fotos para o menu principal", "primeiro nivel do '
              'perfil"), e deixar as duas portas de pe e dois nomes para o '
              'mesmo destino;\n'
              '- `$_enderecoQueFoiParaOPet` foi para `Editar pet` em '
              '27/10/2026 ("o endereco de entrega da plaquinha tem que estar '
              'dentro do cadastro do pet", "endereco um por pet"). Um atalho '
              'aqui apontaria para um endereco que NENHUM pedido le: a pessoa '
              'trocaria de casa nesta tela, a plaquinha chegaria na antiga, e '
              'nada teria dado erro.\n'
              'ESTA CONTA E POR TIPO, e nao por rotulo.',
        );

        // E OS DOIS ROTULOS, NOMEADOS. A conta por tipo acima e a medicao
        // principal; estas duas linhas sobrevivem ao dia em que `ItemDeMenu`
        // virar outro widget, e dizem QUAL das duas portas voltou em vez de so
        // "tem um item a mais".
        for (final rotulo in <String>[
          _vitrineQueSubiu,
          _enderecoQueFoiParaOPet,
        ]) {
          expect(
            find.descendant(
              of: find.byType(TelaDadosPessoais),
              matching: find.text(rotulo),
            ),
            findsNothing,
            reason: 'REPROVA: `$rotulo` esta de volta dentro de `Meus dados`. '
                'As duas linhas sairam desta tela por decisao DATADA do '
                'cliente (26/10 a vitrine, 27/10 o endereco), e nenhuma das '
                'duas foi apagada do aplicativo: elas mudaram de lugar. '
                'Repo-las aqui reverte uma decisao dele com codigo.',
          );
        }
      },
    );

    test(
      'isca (b): a fonte de `Meus dados` nao cita mais rota de vitrine nem de '
      'endereco',
      () {
        final dados = _codigoDe(_fonteDosDados);
        final perfil = _codigoDe(_fonteDoPerfil);
        final pet = _codigoDe(_fonteDoPet);

        // OS DOIS CONTROLES DO SCANNER, e eles vem PRIMEIRO de proposito: a
        // mesma leitura, nos arquivos onde a resposta e CONHECIDA, tem de achar
        // os simbolos. Um scanner que lesse o caminho errado ficaria verde nas
        // contas de baixo por nao ter conferido nada.
        //
        // E eles nao sao so controle: cada um mede a CHEGADA de uma das duas
        // linhas que sairam de `Meus dados`. Sem a primeira, a vitrine ficaria
        // sem porta humana nenhuma -- como `Pedidos de conexao` de 18/10 a
        // 19/10, que foi por isso que o cliente nao viu nada. Sem a segunda, o
        // mesmo valeria para o endereco de entrega.
        expect(
          perfil.contains(_simboloDaRota),
          isTrue,
          reason: 'REPROVA: `$_fonteDoPerfil` nao cita `$_simboloDaRota`. Ou a '
              'porta nova da vitrine morreu (e ai a isca (c) tambem reprova), '
              'ou este scanner esta lendo o arquivo errado -- e nesse caso as '
              'contas de ausencia abaixo nao valem nada.',
        );
        expect(
          pet.contains(_simboloDoEndereco),
          isTrue,
          reason: 'REPROVA: `$_fonteDoPet` nao cita `$_simboloDoEndereco`. O '
              'endereco de entrega saiu de `Meus dados` em 27/10/2026 por '
              'decisao do cliente ("o endereco de entrega da plaquinha tem que '
              'estar dentro do cadastro do pet", "endereco um por pet"), e '
              'sair de LA sem chegar AQUI deixa a tela do endereco sem porta '
              'nenhuma -- acao sem desfecho, que o criterio 2 da BICHUS-62 '
              'proibe. A tela e o `PUT` dela continuam medidos em '
              '`endereco_de_entrega_do_pet_test.dart`; esta linha mede o FIO '
              'ate ela.',
        );

        // CONTROLE DO FILTRO DE COMENTARIOS. Ele cobrava `ItemDeMenu` na fonte
        // de `Meus dados` ate 27/10/2026 -- e e exatamente isso que as duas
        // decisoes tiraram daquele arquivo, que foi como esta isca caiu junto
        // da (a). A ancora nova e `class TelaDadosPessoais`: codigo, de uma
        // linha so, que nao sai daquele arquivo enquanto a tela existir.
        expect(
          dados.contains('class TelaDadosPessoais'),
          isTrue,
          reason: 'REPROVA: o filtro de comentarios comeu o codigo de '
              '`$_fonteDosDados` -- ele nao cita mais `class '
              'TelaDadosPessoais`, e o arquivo declara essa classe. As contas '
              'de ausencia abaixo passariam por vazio.',
        );

        expect(
          dados.contains(_simboloDaRota),
          isFalse,
          reason: 'REPROVA: o CODIGO de `$_fonteDosDados` voltou a citar '
              '`$_simboloDaRota`. Este simbolo e o que todo caminho ate a '
              'vitrine atravessa, entao cita-lo aqui e repor a porta dentro de '
              '`Meus dados` e reverter a decisao de 26/10/2026.',
        );
        expect(
          dados.contains(_simboloDoEndereco),
          isFalse,
          reason: 'REPROVA: o CODIGO de `$_fonteDosDados` cita '
              '`$_simboloDoEndereco`. Em 27/10/2026 o cliente decidiu '
              '"endereco um por pet", e o item foi para `Editar pet`. Um '
              'caminho ate o endereco a partir desta tela e ou a porta velha '
              'de volta -- apontando para um endereco de CONTA que nenhum '
              'pedido le --, ou um seletor de pet dentro de `Meus dados`, que '
              'e a tela dos dados da PESSOA.',
        );
      },
    );
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
      'isca (d): ela esta no grupo `Conta`, DEPOIS de `Meus dados`',
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
        // ================================================================
        // `Usuários bloqueados` SAIU DESTA LISTA EM 28/10/2026
        // ================================================================
        //
        // Ela era a terceira ancora desta medicao, e a assercao de baixo
        // cobrava que a vitrine ficasse ANTES dela. O cliente tirou o item do
        // grupo `Conta` e o transformou na aba `Bloqueados` de
        // `conexoes/tela_de_conexoes.dart` (*"devemos centralizar tudo em um
        // unico local"*), entao a ancora **nao existe mais neste menu** -- e
        // `findsOneWidget` sobre ela reprovava por ausencia, nao por ordem.
        //
        // **O QUE ESTA ISCA PROTEGE NAO MUDOU**, e e por isso que ela nao foi
        // apagada: ela cobra que `Minhas fotos` esteja no grupo `Conta` e
        // DEPOIS de `Meus dados`, que e a decisao do cliente de 26/10/2026 e o
        // motivo escrito em `abas.dart` (*"ela era filha dele; quem procurava
        // a vitrine descia por ali"*). O que se perdeu foi so o limite de
        // BAIXO, porque o item que fechava o grupo saiu.
        //
        // A ancora nova e `Pets na rua`, o cabecalho do grupo SEGUINTE: ela
        // cobra a mesma coisa que `Usuários bloqueados` cobrava -- que a
        // vitrine nao escorregou para fora do grupo `Conta` --, e cobra melhor,
        // porque nao depende de qual item fecha o grupo.
        for (final rotulo in <String>[
          'Conta',
          'Meus dados',
          VitrineDeFotosDoUsuario.tituloDaTela,
          'Pets na rua',
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
          alturas['Pets na rua']!,
          greaterThan(alturas[VitrineDeFotosDoUsuario.tituloDaTela]!),
          reason: 'REPROVA: `${VitrineDeFotosDoUsuario.tituloDaTela}` nao esta '
              'ANTES do cabecalho `Pets na rua`, ou seja: ela escorregou para '
              'FORA do grupo `Conta`. O cliente pediu a vitrine no primeiro '
              'nivel do perfil e dentro do grupo da propria conta -- as fotos '
              'que a pessoa mostra de si sao dado dela.',
        );
        expect(
          find.descendant(
            of: find.byType(AbaPerfil),
            matching: find.text('Usuários bloqueados'),
          ),
          findsNothing,
          reason: 'REPROVA: `Usuários bloqueados` voltou ao grupo `Conta`. Ela '
              'saiu em 28/10/2026 e virou a aba `Bloqueados` de '
              '`conexoes/tela_de_conexoes.dart`, por decisao do cliente; duas '
              'portas para a mesma lista e o que `gaveta_de_secoes.dart` '
              'proibe.',
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
