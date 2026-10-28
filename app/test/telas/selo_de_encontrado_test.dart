// O SELO e o FILTRO de "encontrado pela comunidade" na aba `Pets`.
//
// Decisao do cliente de 20/10/2026: *"o pet ganha um selo/filtro na pagina de
// pets como encontrado por 30 dias e depois ele expira e sai"*.
//
// ===========================================================================
// 26/10/2026: A DECISAO DE 20/10 FOI REVERTIDA PELO PROPRIO CLIENTE
// ===========================================================================
// Literal dele, 26/10/2026: *"o filtro da pagina, deve mostrar apenas os pets
// perdidos, e so deve mostrar os encontrados, se o usuario filtrar. E retirar a
// acao de clique no pet encontrado, nao mostrar a pagina interna."*
//
// Em 20/10, perguntado se o reencontrado devia aparecer so no filtro ou tambem
// na lista de sempre, ele respondeu *"Tambem na lista padrao"*. **A decisao de
// 26/10 substitui a de 20/10**, e ele a tomou com o conflito na mesa. As duas
// datas e as duas falas estao em `_recorteDeAbertura`, em
// `lib/telas/perdido/lista_de_perdidos.dart`.
//
// **QUATRO casos deste arquivo foram REESCRITOS por causa disso, e nenhum foi
// apagado** -- eles mediam a decisao velha e agora medem a nova, com o
// paragrafo de cada um dizendo o que ele media antes:
//
//   - `ISCA: sem case_state, a lista desenha aberto E reencontrado` virou
//     `ISCA: a pagina ABRE pedindo case_state=open, e o reencontrado nao vem`;
//   - `ISCA: a pastilha Perdidos pede SO os abertos` virou
//     `ISCA: Perdidos e a VERDADE DA LISTA, e desmarca-lo devolve a mesma pagina`;
//   - `ISCA: limpar a pastilha tira case_state da consulta` virou
//     `ISCA: limpar a pastilha volta para os PERDIDOS, e nao para a uniao`;
//   - `a folha oferece os DOIS conjuntos, e nenhum nasce marcado` virou
//     `a folha oferece os DOIS conjuntos, e Perdidos NASCE MARCADO`.
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE NAO CONSEGUE MEDIR
// ===========================================================================
// Ele mede o lado do APLICATIVO, e so ele: que o selo sai do campo da RESPOSTA
// e nao do pedido, que a pagina ABRE pedindo so os abertos, que o reencontrado
// so chega quando a pessoa filtra, que o rotulo do leitor de tela acompanha o
// selo, que as pastilhas mandam `case_state` na consulta, que limpa-las volta
// para os perdidos, que a lista vazia da pagina que ninguem filtrou NAO troca
// de frase, que o cartao do reencontrado NAO responde ao toque, e que ele nao
// ganhou informacao nenhuma alem do selo.
//
// Ele **nao** mede nem pode medir as duas condicoes do selo -- a janela de 30
// dias e o sinal da comunidade. As duas sao do servidor, e um caso de widget que
// as "medisse" estaria medindo a propria massa que ele escreveu: e exatamente o
// defeito que a frente do pet perdido ja cometeu, com dezenas de casos verdes
// sobre `petDoContrato(status: 'lost', ...)` -- uma resposta que o servidor
// nunca emitiu.
//
// Quem mede aquelas duas:
//   - a FORMA da consulta:
//     src/modules/lostfound/adapters/persistence/selo-de-reencontro-na-listagem.test.ts
//   - o EFEITO, com 29 e 31 dias e com um reencontro sem conversa:
//     tests/integration/selo-de-reencontro-na-listagem-publica.test.ts
//
// ===========================================================================
// A ISCA DE 26/10/2026 (a trava do toque), E COMO ELA FOI PROVADA
// ===========================================================================
// Em 26/10/2026, `flutter test test/telas/selo_de_encontrado_test.dart`, com
// `TMPDIR` durável (no TMPDIR padrão do macOS a suite reprova por
// `PathNotFoundException`, e nao pelo diff). Base: **12 casos, 12 passaram**.
// O desligamento foi confirmado por `diff` do arquivo ANTES de a suite rodar.
//
// | o que foi desligado | placar | reprovou, por nome |
// |---|---|---|
// | `final toque = _toqueQueVale;` voltando a `final toque = aoTocar;` em `cartao_do_perdido.dart` | 11/1 | `ISCA: tocar no cartao do reencontrado NAO abre o caso publico` -- e SO ele; `CONTROLE POSITIVO: o cartao do pet PERDIDO continua abrindo o caso` ficou VERDE, que e o ponto |
//
// **AS DUAS MEDIDAS DO CASO FORAM PROVADAS SEPARADAMENTE**, porque a primeira
// e barata e esconderia a segunda:
//
//   1. com a trava desligada, reprova em `isSemantics(isButton: false)` -- *"o
//      cartao do pet reencontrado se anuncia como BOTAO ao leitor de tela"*;
//   2. com a trava desligada **e** a assercao de semantica invertida para
//      `isButton: true`, reprova na seguinte -- *"o toque no pet reencontrado
//      chamou `getPublicLostCase`"*. Rodado com `--plain-name`, 1 caso casou,
//      `+0 -1`.
//
// Sem a segunda prova, a trava poderia estar so no no de semantica e o toque
// continuaria navegando -- verde no leitor de tela e a pagina errada no dedo.
//
// ===========================================================================
// A ISCA DE 20/10/2026, E COMO ELA FOI PROVADA
// ===========================================================================
// Em 20/10/2026, Flutter test. Base: 9 casos, 9 passaram. Cada desligamento foi
// confirmado por diferenca de conteudo do arquivo ANTES de a suite rodar.
//
// **A TABELA ABAIXO E HISTORICA, e dois placares dela nao se reproduzem mais:**
// os quatro casos reescritos em 26/10 medem outro recorte, e o arquivo tem 12
// casos agora. O que ela continua provando e que cada peca do SELO tem um caso
// que a cobra pelo nome -- em particular a segunda linha.
//
// | o que foi desligado | placar | reprovaram, por nome |
// |---|---|---|
// | `_Selo(texto: seloDe(perdido), ...)` voltando a `_Selo(texto: selo)` | 5/4 | `ISCA: o item marcado desenha o selo do reencontro, e NAO "Perdido"`, `o cartao do reencontrado NAO ganha informacao alem do selo`, `ISCA: sem case_state, a lista desenha aberto E reencontrado`, `ISCA: a pastilha Encontrados manda case_state=reunited` |
// | `seloDe(p)` voltando a `selo` em `rotuloAcessivelDe` | 8/1 | `ISCA: o leitor de tela ouve o selo do reencontro, e nao "Perdido"` -- e SO ele, que e o ponto: o selo visual continuava certo |
// | o `GrupoDeFiltro` de `case_state` em `lista_de_perdidos.dart` | 5/4 | `ISCA: a pastilha Perdidos pede SO os abertos`, `ISCA: a pastilha Encontrados manda case_state=reunited`, `ISCA: limpar a pastilha tira case_state da consulta`, `a folha oferece os DOIS conjuntos, e nenhum nasce marcado` |
// | `estado:` do `copiar` em `_aplicarAFolha` | 6/3 | os tres casos de pastilha acima |
// | `'case_state': ?estado?.codigo` da `query` em `modelos_perdido.dart` | 6/3 | os mesmos tres |
// | `found_by_community` lido em `PerdidoPublico.doJson` | 4/5 | os quatro casos do primeiro grupo mais `ISCA: sem case_state, a lista desenha aberto E reencontrado` |
//
// A SEGUNDA LINHA e a que vale sublinhar: desligar so o rotulo acessivel deixa a
// tela visualmente certa e reprova UM caso, pelo nome. Sem ele, quem usa leitor
// de tela ouviria "Perdido" sobre um pet que voltou, com a suite verde -- e e
// exatamente a forma do `MergeSemantics` que esta casa achou escondendo titulo
// de leitor de tela nesta mesma rodada.
//
// A ULTIMA e a que a uniao tornou mais importante: com os dois conjuntos na
// MESMA pagina, um selo que nao venha por item marca o pet errado.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um `PublicLostPet`, com `found_by_community` **ausente por padrao**.
///
/// Ausente e nao `false`: e assim que um servidor mais antigo responde, e o
/// caminho de leitura do app tem de tratar os dois do mesmo jeito.
Map<String, dynamic> perdidoDoContrato({
  required String token,
  required String nome,
  bool? encontradoPelaComunidade,
}) {
  return <String, dynamic>{
    'share_token': token,
    'pet_display_name': nome,
    'species': 'dog',
    'size': 'P',
    'breed_label': 'Poodle',
    'primary_color': 'Caramelo',
    'area_label': 'Vila Mariana, São Paulo',
    'lost_since': '2026-10-15T12:00:00.000Z',
    'photo_url': null,
    'share_url': 'https://web.teste/p/$token',
    // `?valor` e nao `if (... != null)`: o `use_null_aware_elements` do
    // `analysis_options.yaml` cobra esta forma, e e a mesma que
    // `RecorteDePerdidos.query` usa para `case_state`.
    'found_by_community': ?encontradoPelaComunidade,
  };
}

Map<String, dynamic> paginaDePerdidos(
  List<Map<String, dynamic>> itens, {
  Map<String, String> filtros = const <String, String>{},
}) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': itens.length,
    'applied_filters': filtros,
  };
}

/// A rede que responde A LISTAGEM conforme o `case_state` do PEDIDO.
///
/// Ela nao devolve corpo fixo: um duble que responde a mesma pagina para
/// qualquer `case_state` deixaria passar o defeito que estes casos existem para
/// pegar -- a tela pode nunca mandar o parametro, e nada perceberia.
Future<http.Response> Function(http.Request) redeQueRespeitaOConjunto({
  required List<Uri> urls,
}) {
  return (req) async {
    if (req.url.path != '/v1/public/lost-pets' || req.method != 'GET') {
      return problema('not-found', 404);
    }
    urls.add(req.url);
    final estado = req.url.queryParameters['case_state'];
    final mel = perdidoDoContrato(token: 'tk-mel', nome: 'Mel');
    final voltou = perdidoDoContrato(
      token: 'tk-voltou',
      nome: 'Voltou',
      encontradoPelaComunidade: true,
    );
    if (estado == 'reunited') {
      return json200(
        paginaDePerdidos(
          <Map<String, dynamic>>[voltou],
          filtros: const <String, String>{'case_state': 'reunited'},
        ),
      );
    }
    if (estado == 'open') {
      return json200(
        paginaDePerdidos(
          <Map<String, dynamic>>[mel],
          filtros: const <String, String>{'case_state': 'open'},
        ),
      );
    }
    // SEM `case_state`: a UNIAO, que e o recorte padrao **do SERVIDOR** -- e
    // que a tela deixou de pedir em 26/10/2026. O duble continua respondendo os
    // DOIS aqui, e continuar e deliberado: e este ramo que faz os casos abaixo
    // acusarem uma tela que PAROU de mandar o parametro. Se o duble respondesse
    // so os abertos na ausencia, esquecer `case_state=open` na consulta ficaria
    // indistinguivel de manda-lo, e o pedido do cliente passaria a ser
    // inverificavel por este arquivo.
    return json200(paginaDePerdidos(<Map<String, dynamic>>[mel, voltou]));
  };
}

RegiaoDeReferencia get regiaoDeSaoPaulo => const RegiaoDeReferencia(
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      uf: 'SP',
    );

Future<void> abrirPets(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    // **`logado: false` existe por UM caso, e a razao e medida.** Com conta, a
    // cidade da regiao RECORTA (segunda reserva da cadeia de
    // `lista_de_perdidos.dart`), `cidadeLimpa` fica preenchida e
    // `_temRecorteAtivo` e verdadeiro **com razao**. Um caso sobre a frase do
    // vazio precisa do estado em que o recorte nasce de fato vazio, e deslogado
    // nao ha regiao nem GPS. E a mesma troca que
    // `perdidos_e_meus_achados_test.dart` fez em 19/10/2026, pelo mesmo motivo.
    deposito:
        logado ? depositoLogado(regiaoDeReferencia: regiaoDeSaoPaulo) : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
  await tester.pumpAndSettle();
}

/// Abre a folha de filtro pelo gatilho SO-ICONE, a direita do campo de busca.
Future<void> abrirAFolha(WidgetTester tester) async {
  final icone = find.byIcon(Icons.tune);
  expect(
    icone,
    findsOneWidget,
    reason: 'REPROVA: nao ha caminho para a folha de filtro. O gatilho e o '
        'icone `tune`, no topo do corpo e a direita do campo de busca.',
  );
  await tester.tap(icone);
  await tester.pumpAndSettle();
}

Future<void> escolherNaFolha(WidgetTester tester, String pastilha) async {
  await abrirAFolha(tester);
  final alvo = find.text(pastilha);
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pumpAndSettle();
  final aplicar = find.text('Aplicar');
  await tester.ensureVisible(aplicar);
  await tester.pumpAndSettle();
  await tester.tap(aplicar);
  await tester.pumpAndSettle();
}

/// Os textos que UM cartao pinta, na ordem da arvore.
List<String> textosDoCartao(WidgetTester tester) {
  final cartao = find.byType(CartaoDoPerdido);
  expect(cartao, findsOneWidget, reason: 'esperava exatamente um cartao');
  return <String>[
    for (final e in find
        .descendant(of: cartao, matching: find.byType(Text))
        .evaluate())
      ((e.widget as Text).data ?? '')
  ].where((t) => t.isNotEmpty).toList();
}

void main() {
  group('o selo sai do campo da RESPOSTA, e nao do pedido', () {
    testWidgets(
      'ISCA: o item marcado desenha o selo do reencontro, e NAO "Perdido"',
      (tester) async {
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            // **O PEDIDO E `case_state=open` E O ITEM VEM MARCADO**, e a
            // contradicao e o instrumento. Este duble responde o que o servidor
            // de verdade nunca responderia; e exatamente por isso ele mede o
            // que precisa ser medido: se a tela desenhasse o selo a partir do
            // conjunto que ela PEDIU, ela diria "Perdido" aqui e este caso
            // ficaria vermelho -- e o cartao, que e componente compartilhado,
            // mentiria na proxima tela que o reaproveitasse.
            //
            // **A assercao era `containsKey` falso ate 26/10/2026**, quando a
            // pagina abria na uniao. O que ela media -- "o selo nao vem do
            // pedido" -- nao mudou; o pedido da abertura mudou.
            expect(
              req.url.queryParameters['case_state'],
              'open',
              reason: 'o atalho deste caso pressupoe a abertura em `open`; se a '
                  'abertura mudou, o duble tem de mudar junto',
            );
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        expect(
          find.text('Encontrado pela comunidade'),
          findsOneWidget,
          reason: 'REPROVA: o selo do reencontro nao foi desenhado. Ele e o que '
              'o cliente pediu ver, e sem ele o filtro recorta uma lista que '
              'parece igual a dos perdidos.',
        );
        expect(
          find.text('Perdido'),
          findsNothing,
          reason: 'REPROVA: o cartao diz "Perdido" sobre um animal que voltou. '
              'Os dois selos no mesmo cartao, ou o errado dos dois, e pior que '
              'selo nenhum.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem o campo na resposta, o cartao continua dizendo "Perdido"',
      (tester) async {
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            // Campo AUSENTE, que e como um servidor sem esta entrega responde.
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(token: 'tk-mel', nome: 'Mel'),
              ]),
            );
          },
        );

        expect(find.text('Perdido'), findsOneWidget);
        expect(
          find.text('Encontrado pela comunidade'),
          findsNothing,
          reason: 'REPROVA: campo ausente virou selo. Um `?? true` nesta leitura '
              'poria o selo em todo pet de uma versao de servidor que nao o '
              'emite -- e esta casa ja pagou por um `?? true` que afirmava '
              'aviso ao tutor sem aviso nenhum.',
        );
      },
    );

    testWidgets(
      'ISCA: o leitor de tela ouve o selo do reencontro, e nao "Perdido"',
      (tester) async {
        // O cartao e `excludeSemantics: true` com um `label` montado a mao: um
        // selo que mudasse so no visual deixaria quem usa leitor de tela ouvindo
        // "Perdido" sobre um pet que voltou -- e seria um caso verde afirmando o
        // contrario do que a tela mostra.
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        // O `label` do no do PROPRIO cartao. Ele e `excludeSemantics: true`,
        // entao nao ha filho a percorrer: o rotulo inteiro esta neste no, e e
        // o que `rotuloAcessivelDe` montou.
        final doCartao =
            tester.getSemantics(find.byType(CartaoDoPerdido).first).label;

        expect(
          doCartao,
          contains('Encontrado pela comunidade'),
          reason: 'REPROVA: o rotulo acessivel do cartao nao diz o selo do '
              'reencontro. `rotuloAcessivelDe` tem de ler `seloDe(p)`, e nao a '
              'constante `selo`.',
        );
        expect(
          doCartao.startsWith('Perdido'),
          isFalse,
          reason: 'REPROVA: o rotulo comeca com "Perdido" num pet que voltou.',
        );
      },
    );

    testWidgets(
      'o cartao do reencontrado NAO ganha informacao alem do selo',
      (tester) async {
        // A decisao foi UM selo. Data de volta, nome de quem achou, contagem de
        // avistamentos -- nada disso foi decidido, e cada linha a mais e dado
        // novo sobre o animal e sobre o lugar numa superficie sem conta
        // (Emenda 4 do ADR-0010).
        await abrirPets(
          tester,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            return json200(
              paginaDePerdidos(<Map<String, dynamic>>[
                perdidoDoContrato(
                  token: 'tk-voltou',
                  nome: 'Voltou',
                  encontradoPelaComunidade: true,
                ),
              ]),
            );
          },
        );

        final linhas = textosDoCartao(tester);

        expect(
          linhas.take(4).toList(),
          <String>[
            'Encontrado pela comunidade',
            'Voltou',
            'Cachorro · Poodle · Pequeno · Caramelo',
            'Vila Mariana, São Paulo',
          ],
          reason: 'REPROVA: o cartao do reencontrado tem linha a mais, a menos, '
              'ou em outra ordem. As cinco linhas sao as MESMAS do cartao de '
              'perdido, com o selo trocado -- e so isso foi decidido.',
        );
        // A QUINTA linha entra por PREFIXO, e nao por texto exato: ela e
        // relativa ao relogio ("ha 5 dias" hoje, "em 15/10/2026" na semana que
        // vem), e um texto exato aqui seria um caso que reprova sozinho com o
        // passar dos dias. O que importa e que ela existe e e a de sempre.
        expect(linhas, hasLength(5), reason: 'o cartao ganhou ou perdeu linha');
        expect(linhas[4], startsWith('Visto por último'));
      },
    );
  });

  group('a pagina ABRE so com os perdidos (cliente, 26/10/2026)', () {
    testWidgets(
      'ISCA: a pagina ABRE pedindo `case_state=open`, e o reencontrado nao vem',
      (tester) async {
        // **ESTE CASO MEDIA O CONTRARIO ATE 26/10/2026.** Ele se chamava `ISCA:
        // sem case_state, a lista desenha aberto E reencontrado, cada um com o
        // seu selo`, e exigia `containsKey('case_state') == false` dizendo que
        // mandar `open` "ESCONDERIA os reencontrados de quem nunca abriu a
        // folha". Esconder os reencontrados de quem nunca abriu a folha e
        // **literalmente o que o cliente pediu** em 26/10, revertendo a decisao
        // dele de 20/10 (*"Tambem na lista padrao"*). O caso foi reescrito, e
        // nao apagado: a medida continua sendo a mesma -- QUAL conjunto a
        // abertura pede -- com o veredito invertido.
        //
        // DESLIGANDO: troque `_recorteDeAbertura` de volta por
        // `const RecorteDePerdidos()` em `lista_de_perdidos.dart` e este caso
        // reprova pelo nome, nas duas medidas.
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));

        expect(urls, isNotEmpty, reason: 'a tela nao chamou a rota');
        expect(
          urls.single.queryParameters['case_state'],
          'open',
          reason: 'REPROVA: a pagina NAO abriu pedindo so os abertos. Sem o '
              'parametro o servidor devolve a UNIAO, e o cliente reclamou tres '
              'vezes de ver pet encontrado numa pagina que ele le como a lista '
              'de quem esta na rua.',
        );
        expect(
          find.text('Mel'),
          findsOneWidget,
          reason: 'REPROVA: a pagina abriu sem o pet que esta perdido.',
        );
        expect(
          find.text('Voltou'),
          findsNothing,
          reason: 'REPROVA: o pet reencontrado apareceu na abertura. O duble '
              'responde os DOIS quando o parametro falta -- este vazio e o que '
              'prova que ele foi mandado.',
        );
        expect(
          find.text('Encontrado pela comunidade'),
          findsNothing,
          reason: 'REPROVA: o selo de reencontro apareceu numa pagina que '
              'ninguem filtrou.',
        );
      },
    );

    testWidgets(
      'ISCA: a lista vazia da pagina que NINGUEM filtrou nao troca de frase',
      (tester) async {
        // **O CUSTO MEDIDO DE MANDAR `case_state=open` SEMPRE.** O servidor o
        // devolve em `applied_filters`, e a tela usa "ha recorte?" para decidir
        // entre duas frases de lista vazia:
        //
        //   - sem recorte: *"Nenhum pet perdido agora."* -- nao ha pet perdido;
        //   - com recorte: *"Nenhum pet perdido com esse recorte."* -- o SEU
        //     filtro esvaziou a lista.
        //
        // Com `_temRecorteAtivo` contando `estado != null`, como contava antes
        // de 26/10, a segunda frase passaria a valer em TODA pagina -- e a
        // pessoa leria que o filtro dela esvaziou a lista numa pagina que ela
        // nunca filtrou. E a mesma troca de frase que o cliente reclamou em
        // `period` em 18/10, e a que `GrupoDeFiltro.codigoPadrao` fechou na
        // `Rede`.
        //
        // DESLIGANDO: em `_temRecorteAtivo`, volte a ultima clausula para
        // `base.estado != null` e este caso reprova pelo nome.
        await abrirPets(
          tester,
          // **DESLOGADO, e e obrigatorio:** com conta, a cidade da regiao
          // recorta de verdade e `_temRecorteAtivo` fica verdadeiro com razao
          // -- o caso mediria a cidade, e nao o conjunto. Ver `abrirPets`.
          logado: false,
          rede: (req) async {
            if (req.url.path != '/v1/public/lost-pets') {
              return problema('not-found', 404);
            }
            return json200(
              paginaDePerdidos(
                const <Map<String, dynamic>>[],
                // O servidor CITA o filtro, porque a tela o mandou. E este o
                // dado que nao existia antes de 26/10.
                filtros: const <String, String>{'case_state': 'open'},
              ),
            );
          },
        );

        expect(find.byType(CartaoDoPerdido), findsNothing);
        expect(
          find.text('Nenhum pet perdido agora.'),
          findsOneWidget,
          reason: 'REPROVA: a frase do vazio sumiu. `case_state=open` e a '
              'VERDADE DA LISTA e nao um recorte da pessoa -- contado como '
              'recorte, ele culpa o filtro de quem nao filtrou nada.',
        );
        expect(
          find.text('Nenhum pet perdido com esse recorte.'),
          findsNothing,
          reason: 'REPROVA: a tela culpou o recorte numa pagina que ninguem '
              'filtrou. Quem le isso vai procurar um filtro para limpar que '
              'nao existe.',
        );
      },
    );

    testWidgets(
      'ISCA: `Perdidos` e a VERDADE DA LISTA, e desmarca-lo devolve a mesma pagina',
      (tester) async {
        // **ESTE CASO SE CHAMAVA `ISCA: a pastilha Perdidos pede SO os
        // abertos`**, e media o caminho de volta para o recorte de antes do
        // selo. Com a abertura em `open`, a pastilha ja nasce marcada e tocar
        // nela a DESMARCA (`_Pastilha` desmarca no segundo toque, de proposito).
        // O que ele mede agora e o fechamento desse circulo: desmarcar e
        // aplicar devolve a MESMA pagina, e nao a uniao.
        //
        // **Por que isso importa:** nulo deixou de ser o estado de abertura e
        // passou a ser o conjunto que o cliente pediu para esconder. Sem o
        // `?? aberto` de `_aplicarAFolha`, este toque -- que a pessoa da
        // achando que nao faz nada -- poria o reencontrado de volta na tela.
        //
        // DESLIGANDO: tire o `?? EstadoDoCasoNaLista.aberto` de
        // `_aplicarAFolha` e este caso reprova pelo nome.
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));
        await escolherNaFolha(tester, 'Perdidos');

        expect(
          urls.last.queryParameters['case_state'],
          'open',
          reason: 'REPROVA: desmarcar `Perdidos` tirou o conjunto da consulta, '
              'e a pagina voltou para a uniao de 20/10 -- que e a decisao que '
              '26/10 substituiu.',
        );
        expect(find.text('Voltou'), findsNothing);
        expect(find.text('Mel'), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: a pastilha Encontrados manda case_state=reunited',
      (tester) async {
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));

        await escolherNaFolha(tester, 'Encontrados');

        expect(
          urls.last.queryParameters['case_state'],
          'reunited',
          reason: 'REPROVA: escolher `Encontrados` nao trocou o conjunto na '
              'consulta. Sem isto o filtro existe na folha e nao filtra nada.',
        );
        expect(
          urls.last.queryParameters['page'],
          '1',
          reason: 'REPROVA: trocar de conjunto nao voltou para a pagina 1. A '
              'pagina 3 dos perdidos nao existe na lista de encontrados, e a '
              'tela mostraria vazio com itens atras.',
        );
        expect(
          find.text('Encontrado pela comunidade'),
          findsOneWidget,
          reason: 'REPROVA: o conjunto trocou e a lista nao redesenhou o selo.',
        );
      },
    );

    testWidgets(
      'ISCA: limpar a pastilha volta para os PERDIDOS, e nao para a uniao',
      (tester) async {
        // **ESTE CASO SE CHAMAVA `ISCA: limpar a pastilha tira case_state da
        // consulta`**, e exigia `containsKey` falso depois do `Limpar`. Estava
        // certo enquanto a ausencia era a pagina como ela abria. **Desde
        // 26/10/2026 a ausencia e a uniao**, que e o que o cliente pediu para
        // nao mostrar por padrao: cair nela no `Limpar` poria os reencontrados
        // na tela de quem acabou de pedir para tirar todos os filtros.
        //
        // Quem toca `Limpar` esta pedindo a pagina como ela abre, e a pagina
        // abre em `_recorteDeAbertura`. O caso foi reescrito, nao apagado.
        final urls = <Uri>[];
        await abrirPets(tester, rede: redeQueRespeitaOConjunto(urls: urls));
        await escolherNaFolha(tester, 'Encontrados');
        expect(urls.last.queryParameters['case_state'], 'reunited');

        // `Limpar` na folha, e nao outra pastilha: e o caminho de volta, e era
        // ele que estava quebrado em `period` -- a tela repunha o valor e a
        // lista continuava recortada sem ninguem ter pedido.
        await abrirAFolha(tester);
        final limpar = find.text('Limpar');
        await tester.ensureVisible(limpar);
        await tester.pumpAndSettle();
        await tester.tap(limpar);
        await tester.pumpAndSettle();
        final aplicar = find.text('Aplicar');
        await tester.ensureVisible(aplicar);
        await tester.pumpAndSettle();
        await tester.tap(aplicar);
        await tester.pumpAndSettle();

        expect(
          urls.last.queryParameters['case_state'],
          'open',
          reason: 'REPROVA: limpar a pastilha nao voltou para os perdidos. Sem '
              '`case_state`, o servidor devolve a UNIAO -- e quem tocou '
              '`Limpar` pedindo a pagina de sempre receberia justamente os '
              'reencontrados que o cliente pediu para esconder.',
        );
        // E a lista volta a ser a de abertura: o perdido fica, o que voltou
        // sai. **Era o contrario ate 26/10**, quando `Limpar` devolvia os dois.
        expect(find.text('Mel'), findsOneWidget);
        expect(
          find.text('Voltou'),
          findsNothing,
          reason: 'REPROVA: `Limpar` trouxe o reencontrado de volta.',
        );
      },
    );

    testWidgets(
      'a folha oferece os DOIS conjuntos, e `Perdidos` NASCE MARCADO',
      (tester) async {
        // **ESTE CASO SE CHAMAVA `... e nenhum nasce marcado`.** A pastilha
        // marcada e a VERDADE DA LISTA desde 26/10/2026, e o que ela nao pode
        // fazer e CONTAR como recorte -- quem mede isso e `ISCA: a pagina de
        // pets abre SEM FILTRO NENHUM, e sem period`, em
        // `perdidos_e_meus_achados_test.dart`, pelo nome do gatilho ("Filtrar",
        // e nunca "Filtrar, 1 filtro ativo").
        //
        // DESLIGANDO (a marca): tire o `?? EstadoDoCasoNaLista.aberto` do
        // `selecionado` do grupo e este caso reprova pelo nome.
        // DESLIGANDO (a nota): volte a primeira frase para *"A lista ja traz os
        // dois"* e este caso reprova pelo nome.
        await abrirPets(
          tester,
          rede: redeQueRespeitaOConjunto(urls: <Uri>[]),
        );
        await abrirAFolha(tester);

        expect(find.text('Estado'), findsOneWidget);
        expect(find.text('Perdidos'), findsOneWidget);
        expect(find.text('Encontrados'), findsOneWidget);

        // A MARCA, pelo no de semantica: `_Pastilha` e
        // `Semantics(selected: marcada, excludeSemantics: true)`, entao o no do
        // texto E o da pastilha.
        final handle = tester.ensureSemantics();
        try {
          expect(
            tester.getSemantics(find.text('Perdidos')),
            isSemantics(isSelected: true),
            reason: 'REPROVA: `Perdidos` nao nasce marcado. A folha mostraria '
                'nenhuma pastilha marcada sobre uma lista que SO tem perdidos '
                '-- e quem abre a folha concluiria que o filtro nao esta '
                'valendo.',
          );
          expect(
            tester.getSemantics(find.text('Encontrados')),
            isSemantics(isSelected: false),
            reason: 'REPROVA: as duas pastilhas marcadas. O grupo e de escolha '
                'unica, e duas marcas dizem que a lista traz os dois.',
          );
        } finally {
          handle.dispose();
        }

        expect(
          find.text(
            'A lista traz os perdidos. Encontrados mostra só quem voltou com a '
            'ajuda de alguém da comunidade, nos últimos 30 dias.',
          ),
          findsOneWidget,
          reason: 'REPROVA: a nota da folha nao diz o que a lista traz, ou nao '
              'diz as duas condicoes do selo. A frase antiga (*"A lista ja traz '
              'os dois"*) afirma sobre a lista o OPOSTO do que ela faz desde '
              '26/10 -- e ninguem desconfia da explicacao.',
        );
      },
    );
  });

  group('o cartao do pet reencontrado NAO leva a pagina interna', () {
    // **O PEDIDO, literal (cliente, 26/10/2026):** *"E retirar a acao de clique
    // no pet encontrado, nao mostrar a pagina interna."* E a terceira vez que
    // ele relata o sintoma (*"abre a pagina errada quando o pet foi
    // encontrado"*), e o caminho esta medido: o reencontrado tem o caso
    // ENCERRADO, `getPublicLostCase` responde 410, `TelaDoCasoPublico` cai em
    // `_Fase.encerrado` e desenha uma faixa cuja UNICA acao e `Registrar um
    // achado` -- o formulario avulso, oferecido a quem tocou num animal que ja
    // esta em casa.
    //
    // **Estes casos medem a AUSENCIA de uma chamada**, e por isso o segundo
    // existe: sonda negativa sem controle positivo nao prova nada. Se o toque
    // parar de funcionar para TODO cartao -- ou se o duble mudar de caminho --,
    // o primeiro caso continuaria verde por motivo errado, e e o segundo que
    // acusa.

    /// O duble que registra as chamadas a `getPublicLostCase`.
    ///
    /// Ele responde 404 ao caso: o que estes casos medem e se a chamada
    /// ACONTECEU, e nao o que a tela do caso desenha depois.
    Future<http.Response> Function(http.Request) redeComOsDoisPets({
      required List<String> casosPedidos,
    }) {
      return (req) async {
        if (req.url.path.startsWith('/v1/public/lost-cases/')) {
          casosPedidos.add(req.url.path);
          return problema('not-found', 404);
        }
        if (req.url.path != '/v1/public/lost-pets') {
          return problema('not-found', 404);
        }
        // Os DOIS na mesma pagina, qualquer que seja o `case_state` pedido: o
        // que se mede aqui e o cartao, e nao o recorte. E a unica forma de ter
        // o perdido e o reencontrado lado a lado depois de 26/10.
        return json200(
          paginaDePerdidos(<Map<String, dynamic>>[
            perdidoDoContrato(token: 'tk-mel', nome: 'Mel'),
            perdidoDoContrato(
              token: 'tk-voltou',
              nome: 'Voltou',
              encontradoPelaComunidade: true,
            ),
          ]),
        );
      };
    }

    Finder cartaoDe(String nome) => find.ancestor(
          of: find.text(nome),
          matching: find.byType(CartaoDoPerdido),
        );

    testWidgets(
      'ISCA: tocar no cartao do reencontrado NAO abre o caso publico',
      (tester) async {
        // DESLIGANDO: em `cartao_do_perdido.dart`, troque `_toqueQueVale` de
        // volta por `aoTocar` nas tres linhas do `Semantics`/`InkWell` e este
        // caso reprova pelo nome, nas duas medidas.
        final casos = <String>[];
        await abrirPets(tester, rede: redeComOsDoisPets(casosPedidos: casos));

        final alvo = cartaoDe('Voltou');
        expect(alvo, findsOneWidget, reason: 'o cartao do reencontrado sumiu');

        final handle = tester.ensureSemantics();
        try {
          expect(
            tester.getSemantics(find.text('Voltou')),
            isSemantics(isButton: false),
            reason: 'REPROVA: o cartao do pet reencontrado se anuncia como '
                'BOTAO ao leitor de tela. Anunciar botao num cartao que nao '
                'responde e pior que nao anunciar nada.',
          );
        } finally {
          handle.dispose();
        }

        await tester.tap(alvo, warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(
          casos,
          isEmpty,
          reason: 'REPROVA: o toque no pet reencontrado chamou '
              '`getPublicLostCase`. O caso esta encerrado, a rota responde 410, '
              'e a tela do caso oferece `Registrar um achado` para um animal '
              'que ja esta em casa -- e exatamente a pagina errada que o '
              'cliente relatou tres vezes.',
        );
        expect(
          find.byType(CartaoDoPerdido),
          findsNWidgets(2),
          reason: 'REPROVA: a lista saiu da tela. O toque no reencontrado nao '
              'navega para lugar nenhum -- a pessoa fica onde estava.',
        );
      },
    );

    testWidgets(
      'CONTROLE POSITIVO: o cartao do pet PERDIDO continua abrindo o caso',
      (tester) async {
        // **Sem este caso, o de cima passa com o toque quebrado para todo
        // mundo** -- e tirar a pagina interna do pet que esta na rua desfaria o
        // pedido de 18/10/2026 (*"quando o pet esta perdido, deve ter uma
        // pagina interna do pet"*) para consertar o de 26/10.
        final casos = <String>[];
        await abrirPets(tester, rede: redeComOsDoisPets(casosPedidos: casos));

        final handle = tester.ensureSemantics();
        try {
          expect(
            tester.getSemantics(find.text('Mel')),
            isSemantics(isButton: true),
            reason: 'REPROVA: o cartao do pet perdido deixou de se anunciar '
                'como botao.',
          );
        } finally {
          handle.dispose();
        }

        await tester.tap(cartaoDe('Mel'));
        await tester.pumpAndSettle();

        expect(
          casos,
          <String>['/v1/public/lost-cases/tk-mel'],
          reason: 'REPROVA: o toque no pet PERDIDO nao abriu o caso publico. A '
              'trava de 26/10 e so do reencontrado -- se ela pegou os dois, a '
              'pagina interna do pet na rua foi embora com ela.',
        );
      },
    );
  });
}
