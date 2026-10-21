// **O RESTO do levantamento de teclado de 20/10/2026** -- 65 campos em 22
// telas --, depois de os tres mecanismos globais (toque fora fecha, faixa de
// `Concluir`, tipos de teclado) terem saido na frente `fix/leitor-abre-sem-
// teclado-sobre-os-botoes`.
//
// Quatro mudancas, e cada grupo abaixo diz o que mexer no codigo para ver o
// caso reprovar. Isca que ninguem sabe desligar e isca que ninguem sabe se
// mede alguma coisa.
//
//   1. **a ACAO DE TECLADO em `criar_encontro` e em `sugerir_profissional`.**
//      Eram 15 campos com zero `acaoDeTeclado`: cada campo de uma linha
//      desenhava a tecla de `done`, que FECHA o teclado -- a pessoa fechava e
//      reabria o teclado uma vez por campo. Campo intermediario passa a
//      AVANCAR e o ultimo a CONCLUIR;
//   2. **a SIGLA DO ESTADO virou escolha** nas tres telas que ainda a
//      digitavam. Isto e **conserto de DADO** e nao so de atrito: `Area.state`
//      do contrato e so "dois caracteres", entao `SA`, `XX` e `S.` passavam
//      pelo campo e chegavam GRAVADOS;
//   3. **o CEP entrou em `criar_encontro`**, a unica tela de endereco do app
//      sem ele. Um campo troca tres teclados;
//   4. **o bairro vem PRE-PREENCHIDO em `captura_de_localizacao`** a partir de
//      `Me.reference_area`, como ja acontecia em tres outras telas -- e com
//      ele o teclado deixa de subir sobre um campo que nao tem o que digitar.
//
// ## O QUE ESTE ARQUIVO NAO COBRE, e nenhuma ausencia e esquecimento
//
// - **O numero da casa com teclado numerico** (`tela_solicitar_plaquinha`):
//   **ja estava feito** na frente do teclado, com o mesmo raciocinio
//   (`number` e nao `digitsOnly`, porque `123-A` e `s/n` sao numeros de porta
//   reais). Fazer de novo seria fazer duas vezes.
// - **O endereco completo do profissional em `pagina_do_local`**: PARADO, e
//   nao esquecido. As quatro colunas existem (`20261018000001`), mas elas saem
//   **so** em `AdminDirectoryEntry` -- a resposta do painel --, e
//   `DirectoryEntryDetail`, que e o que `getDirectoryEntry` devolve ao
//   aplicativo, nao tem nenhuma delas. A propria migracao escreve isso:
//   *"nenhuma saida ganhou campo novo ... exibir endereco completo e decisao
//   do cliente, e ela nao foi tomada"*. Mostrar na tela exige campo novo no
//   contrato e projecao nova no servidor, e nenhum dos dois e arquivo desta
//   frente.
// - **O endereco completo do EVENTO**: ja existe e ja abre. Ver
//   `rede/local_do_encontro.dart`, que le `street_address` de
//   `getNetworkEventLocation` e o manda como TEXTO a
//   `SaidaDoApp.abrirEnderecoNoAppDeMapas`. Nada a fazer, e nada aqui a medir
//   de novo -- `rede/encontro_da_rede_test.dart` ja o cobra.
//
// ## O TECLADO DE TEXTO CORRIDO NAO GANHA ACAO, e isso e decisao
//
// Campo com mais de uma linha vira `TextInputType.multiline` no Flutter, e com
// `multiline` a tecla de retorno **insere linha**: `TextInputAction.newline` e
// o desfecho certo de quem escreve um paragrafo. Declarar `next` num campo de
// tres linhas tiraria a quebra de linha dele. Quem fecha o teclado nesses 16
// campos de 65 e a faixa `Concluir` de `widgets/barra_do_teclado.dart`, que e
// mecanismo de todo o app.
//
// **E e por isso que o caso 1 mede os TRES estados** -- `next`, `done` e
// AUSENTE -- e nao so os dois primeiros: um "conserto" que saisse declarando
// acao em todo campo passaria num caso que so olhasse os de uma linha, e
// quebraria a quebra de linha das observacoes sem ninguem reclamar.

import 'dart:convert';

import 'package:bichu/api/estados_brasileiros.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'criar_encontro_test.dart' as evento;
import 'registrar_achado_test.dart' show avancarParaOPasso2;
import 'sugerir_profissional_test.dart' as sugerir;

/// Varre o formulario de cima a baixo e devolve, para CADA campo que apareceu,
/// a acao de teclado que ele declara.
///
/// ## Por que a varredura, e nao um `expect` por campo
///
/// **`ListView` constroi o que cabe na tela e DESTROI o que saiu dela.** Um
/// caso que rolasse ate o fim e depois medisse o primeiro campo estouraria
/// `Bad state: No element` -- e, pior, um caso escrito com `if (existe)` em
/// volta de cada `expect` ficaria VERDE medindo tres campos de oito, porque os
/// outros cinco nunca estiveram na arvore.
///
/// Varrer e devolver o mapa inteiro faz a afirmacao ser sobre o FORMULARIO, e
/// nao sobre os campos que por acaso couberam: campo novo entra no mapa
/// sozinho, campo que sai do formulario desaparece dele, e a comparacao de
/// mapa completo reprova nos dois casos.
///
/// **Le o `TextField`, e nao o `BichuField`.** O que chega ao sistema
/// operacional e `TextField.textInputAction`; um `BichuField` que recebesse
/// `acaoDeTeclado` e nao o repassasse (foi um parametro novo uma vez) deixaria
/// este caso verde se ele olhasse o widget de fora.
Future<Map<String, TextInputAction?>> acoesDeTecladoDoFormulario(
  WidgetTester tester,
  Finder lista,
) async {
  final acoes = <String, TextInputAction?>{};

  void colher() {
    for (final Element elemento in find.byType(BichuField).evaluate()) {
      final campo = elemento.widget as BichuField;
      final texto = find.descendant(
        of: find.byWidget(campo),
        matching: find.byType(TextField),
      );
      if (texto.evaluate().isEmpty) continue;
      acoes[campo.rotulo] =
          tester.widget<TextField>(texto).textInputAction;
    }
  }

  // Sobe ao topo antes de comecar: a tela pode chegar aqui ja rolada.
  for (var i = 0; i < 8; i++) {
    await tester.drag(lista, const Offset(0, 600));
    await tester.pumpAndSettle();
  }
  colher();
  // E desce em passos pequenos, colhendo a cada parada. Passo menor que a
  // altura da dobra de proposito: com passo grande um campo curto pode nascer
  // e morrer entre duas paradas, e a ausencia dele no mapa pareceria decisao.
  for (var i = 0; i < 20; i++) {
    await tester.drag(lista, const Offset(0, -200));
    await tester.pumpAndSettle();
    colher();
  }
  return acoes;
}

/// A rede do formulario de indicacao, sem nenhuma indicacao no diretorio.
Future<http.Response> Function(http.Request) _redeDoPerto({
  List<Map<String, dynamic>>? enviados,
}) {
  return (req) async {
    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      return json200(<String, dynamic>{
        'cep': '22041-001',
        'logradouro': 'Avenida Atlântica',
        'bairro': 'Copacabana',
        'localidade': 'Rio de Janeiro',
        'uf': 'RJ',
      });
    }
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(sugerir.diretorioVazio());
    }
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'POST') {
      enviados?.add(jsonDecode(req.body) as Map<String, dynamic>);
      return json200(<String, dynamic>{
        'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
        'state': 'pending',
        'created_at': '2026-10-21T12:00:00Z',
      }, status: 201);
    }
    return problema('not-found', 404);
  };
}

/// A rede de criar evento, com a busca de CEP de pe.
Future<http.Response> Function(http.Request) _redeDoEvento(
  List<Map<String, dynamic>> enviados,
) {
  final daCriacao = evento.redeDaCriacao(enviados: enviados);
  return (req) async {
    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      return json200(<String, dynamic>{
        'cep': '22041-001',
        'logradouro': 'Avenida Atlântica',
        'bairro': 'Copacabana',
        'localidade': 'Rio de Janeiro',
        'uf': 'RJ',
      });
    }
    return daCriacao(req);
  };
}

/// O `TextField` do campo de rotulo [rotulo] dentro da peca de localizacao.
///
/// Pelo rotulo DECLARADO no `BichuField`, e nao por `widgetWithText`: o rotulo
/// e um `Text` IRMAO do campo, dentro da mesma `Column`.
Finder campoDaLocalizacao(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (widget) => widget is BichuField && widget.rotulo == rotulo,
        description: 'BichuField de rotulo "$rotulo"',
      ),
      matching: find.byType(TextField),
    );

/// A porta de localizacao de quem NEGA a permissao desta vez.
///
/// `naoPedida` antes e `negada` depois de pedir: e o unico par que faz a
/// antessala aparecer, o dialogo "abrir", a resposta ser "nao" e o fluxo cair
/// no ramo DIGITADO -- que e o unico ramo em que alguem digita o bairro, e
/// portanto o unico que este grupo mede.
LocalizacaoDeTeste _negaDestaVez() => LocalizacaoDeTeste(
      PermissaoDeLocalizacao.naoPedida,
      depoisDePedir: PermissaoDeLocalizacao.negada,
    );

/// A lista rolavel DO FORMULARIO de indicacao.
///
/// Existe pelo mesmo motivo de `corpoDoFormulario` em `criar_encontro_test`:
/// `find.byType(Scrollable).first` nao serve numa tela empilhada sobre a casca
/// de abas, que tem tres `Scrollable` montados -- e quando `.first` e o da
/// casca, o arrasto acerta a lista errada.
Finder get _listaDoPerto => find
    .descendant(
      of: find.byType(TelaSugerirProfissional),
      matching: find.byType(Scrollable),
    )
    .first;

/// O seletor de rotulo [rotulo], para medir o que ele mostra.
Finder _seletor(String rotulo) => find.ancestor(
      of: find.text(rotulo),
      matching: find.byType(SeletorDeLista),
    );

void main() {
  // =========================================================================
  // CASO 1 — A ACAO DE TECLADO: INTERMEDIARIO AVANCA, ULTIMO CONCLUI
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/rede/criar_encontro.dart`,
  // apague a linha `acaoDeTeclado: TextInputAction.next` do campo
  // `Nome do evento`. A tela continua funcionando, o evento continua sendo
  // criado, e o teclado volta a FECHAR entre o primeiro campo e o segundo --
  // que e exatamente o defeito, e ele e invisivel em teste de widget que nao
  // olhe esta propriedade.
  // =========================================================================
  group('a acao de teclado dos 15 campos', () {
    testWidgets(
        'criar evento: cada campo de uma linha AVANCA, a cidade CONCLUI, '
        'e os dois de texto corrido nao declaram nada', (tester) async {
      await evento.abrirAgenda(
        tester,
        rede: _redeDoEvento(<Map<String, dynamic>>[]),
      );
      await evento.abrirAPorta(tester);

      final acoes = await acoesDeTecladoDoFormulario(
        tester,
        evento.corpoDoFormulario,
      );

      // **O FORMULARIO INTEIRO numa afirmacao so.** `Descrição da foto` nao
      // esta aqui porque ele so existe quando ha capa escolhida, e este caso
      // nao escolhe foto nenhuma -- `capa_do_evento_test.dart` e quem monta a
      // camera.
      expect(
        acoes,
        <String, TextInputAction?>{
          'Nome do evento': TextInputAction.next,
          // Texto corrido: **sem acao**, e e decisao. Ver o cabecalho.
          'O que vai acontecer': null,
          'Nome do lugar': TextInputAction.next,
          'CEP': TextInputAction.next,
          'Bairro': TextInputAction.next,
          // O ULTIMO campo de digitacao da tela que pode ter acao: depois dele
          // vem o seletor de estado e os dois de data, que nao recebem
          // teclado.
          'Cidade': TextInputAction.done,
          'Observações': null,
        },
        reason: 'REPROVA: a acao de teclado do formulario de criar evento nao '
            'e a esperada.\n\n'
            'A regra e UMA: campo de uma linha AVANCA (`next`), o ultimo '
            'CONCLUI (`done`), e campo de texto corrido NAO declara nada.\n\n'
            'Sem acao declarada, o Flutter desenha a tecla de `done` em campo '
            'de uma linha -- ela FECHA o teclado, e a pessoa o reabre uma vez '
            'por campo. Era o estado de 15 campos destas duas telas no '
            'levantamento de 20/10/2026.\n\n'
            'E acao declarada em campo de TEXTO CORRIDO tira a quebra de '
            'linha dele: `linhas` > 1 vira `TextInputType.multiline`, onde a '
            'tecla de retorno INSERE LINHA. Quem fecha o teclado nesses e a '
            'faixa `Concluir` de `widgets/barra_do_teclado.dart`.\n\n'
            'Campo NOVO no formulario tambem reprova aqui, e isso e de '
            'proposito: ele precisa de uma decisao de teclado, e nao de um '
            'padrao herdado em silencio.',
      );
    });

    testWidgets(
        'indicar profissional: cada campo de uma linha AVANCA, o contato '
        'CONCLUI, e o recado nao declara nada', (tester) async {
      await sugerir.abrirPerto(tester, rede: _redeDoPerto());
      await sugerir.abrirAPorta(tester);

      final acoes = await acoesDeTecladoDoFormulario(tester, _listaDoPerto);

      expect(
        acoes,
        <String, TextInputAction?>{
          'Nome do lugar': TextInputAction.next,
          'CEP': TextInputAction.next,
          'Cidade': TextInputAction.next,
          'Bairro': TextInputAction.next,
          // O rotulo do campo de contato MUDA com o tipo escolhido, e sem tipo
          // escolhido ele e `Contato`. Este caso nao escolhe tipo nenhum, de
          // proposito: o teclado nao depende do tipo.
          'Contato': TextInputAction.done,
          'Por que você indica': null,
        },
        reason: 'REPROVA: a acao de teclado do formulario de indicacao nao e a '
            'esperada. Ver o motivo por extenso no caso de criar evento, '
            'acima: a regra e a mesma, e vale para as duas telas.',
      );
    });
  });

  // =========================================================================
  // CASO 2 — A SIGLA DO ESTADO: ESCOLHA, E NAO DIGITACAO
  //
  // Este e o grupo do CONTRAPESO, e ele e o que importa mais que a economia de
  // teclado: o ganho de atrito seria so um a menos, e o ganho de DADO e que
  // valor fora da lista deixa de ser gravavel.
  //
  // DESLIGAR PARA VER REPROVAR: em qualquer uma das tres telas, troque o
  // `SeletorDeLista` do estado de volta por um `BichuField` de `limite: 2`. A
  // tela volta a funcionar inteira e `SAO`, `XX` e `S.` voltam a viajar no
  // corpo -- o contrato nao recusa nenhum dos tres, porque `Area.state` e so
  // "dois caracteres".
  // =========================================================================
  group('ISCA -- a sigla do estado nao aceita valor fora da lista', () {
    testWidgets('criar evento: o estado e seletor, e nao campo de texto',
        (tester) async {
      await evento.abrirAgenda(
        tester,
        rede: _redeDoEvento(<Map<String, dynamic>>[]),
      );
      await evento.abrirAPorta(tester);

      // **Pela VARREDURA, e nao por `findsNothing`.** `findsNothing` num
      // `ListView` e verdadeiro para tudo que esta fora da dobra: o caso
      // ficaria verde com o campo `UF` de volta, bastando ele nascer abaixo
      // da linha de corte. A varredura passa o formulario inteiro.
      final acoes = await acoesDeTecladoDoFormulario(
        tester,
        evento.corpoDoFormulario,
      );
      expect(
        acoes.keys,
        isNot(contains('UF')),
        reason: 'REPROVA: o campo `UF` digitado voltou. Enquanto ele existe, '
            '`SAO` e `S.P.` sao digitaveis e o contrato nao os recusa -- '
            '`Area.state` e so "dois caracteres", sem `enum` e sem '
            '`pattern` --, e eles chegam GRAVADOS no lugar de um encontro '
            'publico.',
      );

      // De cima ou de baixo: a varredura acima deixou a lista no fim.
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.text(TelaCriarEncontro.rotuloDoEstado),
        scrollable: evento.corpoDoFormulario,
      );
      expect(
        _seletor(TelaCriarEncontro.rotuloDoEstado),
        findsOneWidget,
        reason: 'REPROVA: nao ha seletor de estado na tela. Sem campo e sem '
            'seletor, `place.state` -- que o contrato EXIGE -- nao tem de '
            'onde sair, e o botao de criar ficaria morto sem motivo visivel.',
      );
    });

    testWidgets('indicar profissional: o estado e seletor, e a sigla VIAJA',
        (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await sugerir.abrirPerto(
        tester,
        rede: _redeDoPerto(enviados: enviados),
      );
      await sugerir.abrirAPorta(tester);

      await rolarAte(tester, sugerir.campoDoRotulo('Nome do lugar'));
      await tester.enterText(
        sugerir.campoDoRotulo('Nome do lugar'),
        'Clínica Veterinária Bichinho',
      );
      await tester.pumpAndSettle();
      await sugerir.escolherNaLista(tester, 'O que eles fazem', 'Clínica');
      await rolarAte(tester, sugerir.campoDoRotulo('Cidade'));
      await tester.enterText(
        sugerir.campoDoRotulo('Cidade'),
        'Rio de Janeiro',
      );
      await tester.pumpAndSettle();

      // A pessoa ESCOLHE "Rio de Janeiro" na lista; o que viaja e `RJ`. Esta e
      // a isca que importa, e e a que nenhuma verificacao visual pega: uma
      // tela que mandasse o ROTULO desenharia exatamente a mesma coisa. Quem
      // cobra a AUSENCIA do campo digitado e a varredura do caso de criar
      // evento, acima -- `findsNothing` num `ListView` nao serve.
      await sugerir.escolherNaLista(tester, 'Como entrar em contato', 'Telefone');
      await rolarAte(tester, sugerir.campoDoRotulo('Telefone'));
      await tester.enterText(
        sugerir.campoDoRotulo('Telefone'),
        '+5521988887777',
      );
      await tester.pumpAndSettle();
      await escolherEstadoNaLista(tester, 'RJ', scrollable: _listaDoPerto);
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.text(TelaSugerirProfissional.rotuloDeIndicar),
        scrollable: _listaDoPerto,
      );
      await tocar(tester, find.text(TelaSugerirProfissional.rotuloDeIndicar));

      expect(enviados, hasLength(1));
      expect(
        enviados.single['state'],
        'RJ',
        reason: 'REPROVA: o corpo levou "${enviados.single['state']}" em '
            '`state`. A pessoa escolhe o NOME e o que viaja e a SIGLA; '
            'mandar o rotulo quebra `pattern: ^[A-Z]{2}\$` e o dado ja '
            'gravado.',
      );
    });

    test('ISCA -- `siglaDeEstadoValida` recusa o que tem dois caracteres e '
        'nao esta na lista', () {
      // **A isca de dado SUJO, e ela e a que importa mais neste grupo.**
      //
      // As tres telas recebem sigla de FORA para pre-preencher o seletor, e
      // nenhuma das tres fontes e a lista: `Me.reference_area.state` e
      // `maxLength: 2` **sem `pattern`**, o `uf` da busca de CEP vem de
      // servico de terceiro, e o rascunho do caso perdido sobrevive ao app
      // fechar -- podendo trazer o `SAO` que a versao de campo digitado
      // gravava.
      //
      // O defeito que isto fecha e MUDO: `SeletorDeLista` nao tem opcao para
      // desenhar e mostra "Escolher na lista", enquanto o valor sujo fica no
      // estado da tela esperando o envio. A tela pareceria vazia e o corpo
      // nao estaria.
      //
      // DESLIGAR PARA VER REPROVAR: em `lib/api/estados_brasileiros.dart`,
      // troque o corpo de `siglaDeEstadoValida` por
      // `return sigla != null && sigla.length == 2 ? sigla : null;` -- que e
      // exatamente a regua que as tres telas usavam antes, e e ela que deixa
      // `SA`, `XX` e `S.` passarem.
      for (final suja in <String>['SAO', 'S.', 'XX', 'sp', 'S.P.', ' SP']) {
        expect(
          siglaDeEstadoValida(suja),
          isNull,
          reason: 'REPROVA: "$suja" passou. `Area.state` do contrato e so '
              '"dois caracteres" -- sem `enum` e sem `pattern` --, entao o '
              'servidor nao recusa nada disto: a sigla chega GRAVADA no caso '
              'de um animal perdido, no lugar de um encontro publico ou na '
              'indicacao de uma clinica.',
        );
      }
      expect(siglaDeEstadoValida('SP'), 'SP');
      expect(siglaDeEstadoValida('DF'), 'DF');
      expect(siglaDeEstadoValida(null), isNull);
      expect(siglaDeEstadoValida(''), isNull);
    });
  });

  // =========================================================================
  // CASO 3 — O CEP EM CRIAR EVENTO: UM CAMPO TROCA TRES TECLADOS
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/rede/criar_encontro.dart`,
  // apague as tres atribuicoes dentro de `_buscarOCep` (as duas
  // `_preencherSeVazio` e o `_uf = endereco.uf`). A busca continua saindo -- a
  // linha de texto ainda aparece -- e **nenhum campo se preenche**, que e
  // exatamente o defeito de um campo de CEP que nao serve para nada.
  // =========================================================================
  group('o CEP de criar evento preenche os tres, e NAO viaja', () {
    testWidgets('o CEP preenche bairro, cidade e estado', (tester) async {
      await evento.abrirAgenda(
        tester,
        rede: _redeDoEvento(<Map<String, dynamic>>[]),
      );
      await evento.abrirAPorta(tester);

      await rolarAte(
        tester,
        evento.campoDoRotulo(TelaCriarEncontro.rotuloDoCep),
        scrollable: evento.corpoDoFormulario,
      );
      await tester.enterText(
        evento.campoDoRotulo(TelaCriarEncontro.rotuloDoCep),
        '22041001',
      );
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<TextField>(evento.campoDoRotulo('Bairro'))
            .controller
            ?.text,
        'Copacabana',
      );
      expect(
        tester
            .widget<TextField>(evento.campoDoRotulo('Cidade'))
            .controller
            ?.text,
        'Rio de Janeiro',
      );
      await rolarAte(
        tester,
        find.text(TelaCriarEncontro.rotuloDoEstado),
        scrollable: evento.corpoDoFormulario,
      );
      expect(
        siglaEscolhidaNoSeletor(
          tester,
          rotulo: TelaCriarEncontro.rotuloDoEstado,
        ),
        'RJ',
        reason: 'REPROVA: a busca de CEP nao escolheu o estado. Os tres campos '
            'que o CEP preenche sao bairro, cidade E estado -- e o estado e o '
            'que a pessoa tem menos chance de saber de cabeca para um lugar '
            'que nao e o dela.',
      );
    });

    testWidgets(
        'ISCA -- o CEP do evento NAO entra no corpo, porque o esquema o '
        'recusa', (tester) async {
      // **`CommunityNetworkEventPlaceInput` declara `additionalProperties:
      // false`** e os quatro campos que aceita. Um `postal_code` a mais nao e
      // ignorado: ele vira `400` em cima de um formulario inteiro preenchido,
      // ou -- pior -- e APAGADO em silencio pelo `removeAdditional` do Ajv, e
      // a tela acreditaria ter gravado algo.
      //
      // E ha a razao de produto, que e mais forte: o lugar de um encontro e
      // logradouro PUBLICO e nunca residencia (ADR-0027 item 13). Guardar o
      // CEP de uma praca seria inventar coluna.
      //
      // DESLIGAR PARA VER REPROVAR: acrescente `'postal_code': cep` em
      // `RedeApi.corpoDeCriacao`.
      final enviados = <Map<String, dynamic>>[];
      await evento.abrirAgenda(tester, rede: _redeDoEvento(enviados));
      await evento.abrirAPorta(tester);

      Future<void> digitar(String rotulo, String valor) async {
        await rolarAte(
          tester,
          evento.campoDoRotulo(rotulo),
          scrollable: evento.corpoDoFormulario,
        );
        await tester.enterText(evento.campoDoRotulo(rotulo), valor);
        await tester.pumpAndSettle();
      }

      await digitar('Nome do evento', 'Caminhada no parque');
      await digitar('O que vai acontecer', 'Volta tranquila de uma hora.');
      await digitar('Nome do lugar', 'Praça da Harmonia');
      // O CEP preenche bairro, cidade e estado -- e **este caso nao digita
      // nenhum dos tres**, que e a segunda metade da afirmacao: o campo
      // realmente substitui os tres teclados.
      await digitar(TelaCriarEncontro.rotuloDoCep, '22041001');
      await evento.escolherComecoAmanha(tester);
      await rolarAte(
        tester,
        find.text(TelaCriarEncontro.rotuloDeMarcar),
        scrollable: evento.corpoDoFormulario,
      );
      await tocar(tester, find.text(TelaCriarEncontro.rotuloDeMarcar));

      expect(
        enviados,
        hasLength(1),
        reason: 'REPROVA: o envio nao saiu. Com bairro, cidade e estado vindos '
            'do CEP, nada deveria estar bloqueando o botao -- e se esta, o '
            'campo de CEP nao substituiu os tres teclados que ele promete.',
      );
      final place = enviados.single['place'] as Map<String, dynamic>;
      expect(
        place.keys.toSet(),
        <String>{'place_name', 'neighborhood', 'city', 'state'},
        reason: 'REPROVA: `place` levou '
            '${place.keys.toList()}. `CommunityNetworkEventPlaceInput` aceita '
            'esses quatro e declara `additionalProperties: false`: um campo a '
            'mais e 400, ou e apagado em silencio pelo Ajv -- e nos dois '
            'casos a tela acreditou ter gravado o CEP de uma praca.',
      );
      expect(place['neighborhood'], 'Copacabana');
      expect(place['city'], 'Rio de Janeiro');
      expect(place['state'], 'RJ');
    });
  });

  // =========================================================================
  // CASO 4 — O BAIRRO PRE-PREENCHIDO NO REGISTRO DE ACHADO
  //
  // **O caminho mais sensivel do produto**: pessoa na calcada, animal de outra
  // pessoa no colo, talvez uma mao. Com localizacao concedida o fluxo ja tem
  // ZERO teclados, e este grupo nao encosta nesse caminho -- ele cuida do
  // ramo em que a pessoa NEGA a permissao ou o aparelho nao fixa, que e o
  // unico em que ela digita.
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/localizacao/captura_de_localizacao.dart`, apague a chamada de
  // `_preencherDaRegiaoDeReferencia` dentro de `_irParaODigitado`. O campo
  // volta a abrir vazio para quem o app ja sabe onde mora.
  // =========================================================================
  group('o bairro vem da regiao de referencia do tutor', () {
    testWidgets(
        'com regiao cadastrada o bairro ja vem escrito, e o teclado NAO sobe',
        (tester) async {
      await abrirOApp(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/reference-data')) {
            return json200(referenciaDeTeste());
          }
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return problema('not-found', 404);
        },
        deposito: depositoLogado(
          regiaoDeReferencia: const RegiaoDeReferencia(
            bairro: 'Vila Madalena',
            cidade: 'São Paulo',
            uf: 'SP',
          ),
        ),
        localizacao: _negaDestaVez(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await rolarAte(tester, find.text('Cão'));
      await tocar(tester, find.text('Cão'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await avancarParaOPasso2(tester);
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );

      final bairro = tester.widget<TextField>(
        campoDaLocalizacao(TextosDaLocalizacao.rotuloBairro),
      );
      expect(
        bairro.controller?.text,
        'Vila Madalena',
        reason: 'REPROVA: o bairro abriu vazio para um tutor que JA cadastrou '
            'a regiao dele (`Me.reference_area`). Tres telas ja fazem este '
            'preenchimento -- F3.1, criar evento e indicar profissional --, e '
            'esta era a que faltava. Nada aqui geocodifica: o texto vem da '
            'ficha que o proprio tutor escreveu (ADR-0006).',
      );
      expect(
        bairro.focusNode?.hasFocus,
        isFalse,
        reason: 'REPROVA: o teclado subiu sobre um campo que ja esta '
            'preenchido. O criterio 5 escreve a condicao junto da '
            'consequencia -- "o campo fica VAZIO com o teclado aberto" --, e '
            'teclado sobre campo cheio e meia tela coberta sem nada para '
            'digitar.',
      );
    });

    testWidgets(
        'ISCA -- SEM regiao cadastrada o campo abre vazio E com o teclado, '
        'que e o criterio 5 inteiro', (tester) async {
      // **O contrapeso do caso acima.** Um "conserto" que parasse de pedir o
      // foco sempre -- e nao so quando ha o que ler -- passaria no caso de
      // cima e tiraria o teclado de quem acabou de negar a permissao e nao
      // tem nada preenchido: um toque a mais exatamente no momento em que a
      // pessoa ja disse "nao" uma vez.
      await abrirOApp(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/reference-data')) {
            return json200(referenciaDeTeste());
          }
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return problema('not-found', 404);
        },
        deposito: depositoLogado(),
        localizacao: _negaDestaVez(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await rolarAte(tester, find.text('Cão'));
      await tocar(tester, find.text('Cão'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await avancarParaOPasso2(tester);
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );
      await tocar(
        tester,
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
      );

      final bairro = tester.widget<TextField>(
        campoDaLocalizacao(TextosDaLocalizacao.rotuloBairro),
      );
      expect(bairro.controller?.text, '');
      expect(
        bairro.focusNode?.hasFocus,
        isTrue,
        reason: 'REPROVA: o campo de bairro apareceu vazio e SEM foco. O '
            'criterio 5 diz "com o teclado aberto", e sem foco o teclado nao '
            'sobe: quem acabou de negar a permissao precisa de mais um toque '
            'para comecar a digitar.',
      );
    });
  });
}
