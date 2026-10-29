// BICHUS-35 — F3.5, a tela do achado avulso, medida no app MONTADO.
//
// As tres afirmacoes que este arquivo transforma em caso, e que hoje so
// existiriam escritas:
//
//   1. **a tela nao diz "registrado" para o que esta na fila** (criterio 2 da
//      BICHUS-31). Tela de sucesso para o que nao aconteceu faz a pessoa parar
//      de procurar caminho;
//   2. **o achado de outra pessoa nao fica visivel**. Quem sustenta isso e a
//      clausula `WHERE` do servidor, e o que esta tela pode estragar e ler o
//      registro de um lugar que nao e o servidor;
//   3. **quem concede o GPS e nao digita nada fica sem rotulo de area, e a
//      tela DIZ isso** -- a consequencia que a BICHUS-23 deixou para esta
//      historia resolver.
//
// E mais uma, que o app ja pagou caro para ter: **nenhum controle anunciado
// como botao fica sem acao de toque**. Quatro widgets deste app ja apareceram
// com `btn=true tap=false`, e a unica fonte que enxerga isso e a arvore de
// semantica em EXECUCAO.
//
// POR QUE O APP INTEIRO, e nao a tela solta: a tela depende do `Escopo`, do
// `GoRouter` e do tema, e montada fora deles ela passa no teste e quebra no
// aparelho. Montar o app tambem e o que faz o caso percorrer tela, `AchadosApi`,
// `ApiClient` e a traducao de `Problem`.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/achado/rascunho_do_achado.dart';
import 'package:bichu/api/achados_api.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../a11y/verificador.dart';
import '../sessao/limpezas_ao_sair_test.dart' show raizDoApp;
import 'ajuda_de_tela.dart';

const String _idDoAchado = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';

/// O `FoundReport` como o servidor o devolve, campo a campo do contrato.
///
/// **`photo_url` sai nulo**, e esse e o valor de verdade: a foto do achador e
/// vista pelo tutor dentro da conversa mediada, e so (criterio 9).
Map<String, dynamic> achadoDoContrato({String? rotuloDaArea}) {
  return <String, dynamic>{
    'id': _idDoAchado,
    'origin': 'stray_report',
    'status': 'open',
    'species': 'dog',
    'size': 'M',
    'area_label': rotuloDaArea,
    'found_at': '2026-09-22T19:00:00Z',
    'photo_url': null,
    'notes': 'coleira azul sem placa',
    'conversation_id': null,
    'created_at': '2026-09-22T19:01:00Z',
  };
}

/// Uma rede que conta o que foi pedido.
///
/// O contador nao e enfeite: ele e o que faz a isca do achado alheio medir a
/// coisa certa. Uma tela que desenhasse o achado sem PERGUNTAR ao servidor
/// passaria por qualquer verificacao de texto, e so o zero de pedidos a
/// denuncia.
class _Rede {
  _Rede({this.respostaDoAchado, this.semSinal = false});

  final http.Response? respostaDoAchado;
  final bool semSinal;

  int pedidosDeAchado = 0;
  int pedidosDeRegistro = 0;
  Map<String, dynamic>? corpoDoRegistro;
  String? chaveDeIdempotencia;

  Future<http.Response> call(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (req.url.path == '/v1${AchadosApi.caminhoDeRegistro}' &&
        req.method == 'POST') {
      pedidosDeRegistro += 1;
      corpoDoRegistro = jsonDecode(req.body) as Map<String, dynamic>;
      chaveDeIdempotencia = req.headers['idempotency-key'] ??
          req.headers['Idempotency-Key'];
      // `ClientException` e o que o cliente HTTP lanca sem sinal, e e o que
      // `ApiClient` traduz para `FalhaDeConexao`.
      if (semSinal) throw http.ClientException('sem sinal', req.url);
      return json200(achadoDoContrato(), status: 201);
    }
    if (req.url.path.startsWith('/v1${AchadosApi.caminhoDeRegistro}/')) {
      pedidosDeAchado += 1;
      return respostaDoAchado ?? json200(achadoDoContrato());
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    return problema('not-found', 404);
  }
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
///
/// Pelo rotulo declarado no widget, e nao por `widgetWithText`: o rotulo do
/// `BichuField` e um `Text` IRMAO do campo, e nao um descendente dele.
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is BichuField && w.rotulo == rotulo,
      ),
      matching: find.byType(TextField),
    );

/// Preenche o minimo do contrato pela TELA, como a pessoa faria.
///
/// Nao monta rascunho por fora: o que se quer medir e que o formulario aceita
/// o pouco que a pessoa tem, e um rascunho montado em Dart pularia justamente
/// os campos que a tela poderia estar cobrando.
/// **SEM PARAMETRO DESDE 29/10/2026.** Havia um `digitarACidade: false`, que
/// tocava em `Usar minha localizacao` e deixava o lugar so com a coordenada.
/// Esse caminho **nao existe mais nesta tela**: por decisao do cliente
/// (*"remove os botoes e deixa os campos de cep, endereco para o usuario
/// preencher"*) o achado nao captura coordenada nenhuma, e os dois unicos
/// chamadores do `false` eram os casos do aviso do lugar, que sairam com ele.
Future<void> preencherOMinimo(WidgetTester tester) async {
  // `rolarAte` antes de cada toque: o `ListView` so constroi o que cabe na
  // tela, e F3.5 e um formulario longo de proposito. Um `tap` num widget que
  // ainda nao existe reprova por um motivo que nao e o do caso.
  await rolarAte(tester, find.text('Cachorro'));
  await tocar(tester, find.text('Cachorro'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
  // **O formulario tem dois passos desde 17/10/2026** (pedido do cliente). O
  // passo 1 e o animal; o `Quando?` e o `Onde?` moram no 2, e sem este toque
  // os casos abaixo procurariam na pagina errada.
  await avancarParaOPasso2(tester);
  // **Direto no campo, sem botao nenhum antes.** A peca abre nos campos de
  // endereco, e a cidade e o unico que faz o `Onde` existir
  // (`Area.required: [city]`).
  await rolarAte(tester, _campo(TextosDaLocalizacao.rotuloCidade));
  await tester.enterText(_campo(TextosDaLocalizacao.rotuloCidade), 'São Paulo');
  await tester.pumpAndSettle();
  // `passo: -120`, para CIMA: `Quando?` e o PRIMEIRO bloco do passo 2
  // (`tela_registrar_achado.dart`, linhas 659-665) e a localizacao vem depois
  // dele, entao a lista ja rolou para baixo quando se chega aqui. Com passo
  // positivo o `scrollUntilVisible` procura para baixo o que ficou para tras,
  // roda ate o fim e estoura `Bad state: No element`.
  await rolarAte(tester, find.text('Agora'), passo: -120);
  await tocar(tester, find.text('Agora'));
}

/// Toca em `Continuar` e leva a pessoa ao passo 2.
Future<void> avancarParaOPasso2(WidgetTester tester) async {
  final botao =
      find.widgetWithText(BotaoPrimario, TextosDoAchado.continuar);
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

Future<void> tocarEmRegistrar(WidgetTester tester) async {
  final botao = find.widgetWithText(BotaoPrimario, TextosDoAchado.registrar);
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

/// A localizacao concedida, que devolve um ponto **e a cidade dele**.
///
/// **A CIDADE PASSOU A VIR EM 22/10/2026**, por decisao do cliente: *"quando o
/// usuario autoriza a localizacao ao encontrar um pet, voce deve prencher o
/// formulario com as informacoes"*. O duble resolve `Sao Paulo` a partir do
/// ponto, que e o sentido que a emenda 1 do ADR-0006 autoriza -- e por isso
/// quem concede o GPS e nao digita nada **ja tem rotulo de area** (a cidade),
/// onde antes nao tinha nenhum.
LocalizacaoDeTeste localizacaoConcedida() =>
    LocalizacaoDeTeste(PermissaoDeLocalizacao.concedida);

/// A localizacao concedida cujo nome de cidade **nao da para descobrir**.
///
/// Ponto sim, cidade nao: o geocoder da plataforma sem cota, o aparelho sem
/// geocoder, o lugar sem nome de cidade. **E ela que mantem a isca do aviso de
/// area viva** depois de 22/10 -- com a cidade resolvida nao ha o que avisar, e
/// um caso que insistisse no aviso estaria cobrando o defeito antigo.
LocalizacaoDeTeste localizacaoSemCidade() => LocalizacaoDeTeste(
      PermissaoDeLocalizacao.concedida,
      resultadoDaCidade:
          const CidadeNaoResolvida(MotivoDeNaoTerCidade.falhaDoServico),
    );

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 — a tela nao diz "registrado" para o que esta na fila
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/tela_achado_registrado.dart`, troque
  // `final registrado = resultado.foiRegistrado;` por
  // `const registrado = true;`.
  // Medido em 22/09/2026: **2 casos reprovam** neste grupo.
  //
  // O grupo mede os DOIS sentidos de proposito. Um caso que so conferisse o
  // texto da fila ficaria verde numa tela que dissesse "na fila" sempre --
  // inclusive para o achado que o servidor aceitou, que e o defeito espelhado
  // e igualmente mentiroso.
  // -------------------------------------------------------------------------
  group('ISCA — `na fila` nao e `registrado`', () {
    testWidgets('sem sinal, a tela diz que vai registrar quando voltar',
        (tester) async {
      final rede = _Rede(semSinal: true);
      final fila = DepositoDaFilaEmMemoria();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
        depositoDaFila: fila,
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      expect(
        find.text(TextosDoAchado.tituloDaFila),
        findsOneWidget,
        reason: 'REPROVA: o achado foi para a fila e a tela nao disse isso.',
      );
      expect(
        find.text(TextosDoAchado.tituloDoRegistrado),
        findsNothing,
        reason: 'REPROVA: a tela diz "${TextosDoAchado.tituloDoRegistrado}" '
            'para um achado que o servidor NUNCA VIU. O criterio 2 da '
            'BICHUS-31 proibe tela de sucesso para o que nao aconteceu: quem '
            'acredita que o aviso saiu para de procurar caminho, e o animal '
            'que ela tem no colo nao entra em cruzamento nenhum ate o sinal '
            'voltar.',
      );

      // A promessa que a tela faz precisa ser a que a fila cumpre: se a acao
      // nao esta no disco, a frase e propaganda.
      expect(
        fila.acoes,
        hasLength(1),
        reason: 'REPROVA: a tela prometeu registrar quando a conexao voltar e '
            'nao enfileirou nada. A frase ficaria sendo a unica coisa que '
            'aconteceu.',
      );
      expect(fila.acoes.single['caminho'], AchadosApi.caminhoDeRegistro);
      expect(
        fila.acoes.single['idempotency_key'],
        rede.chaveDeIdempotencia,
        reason: 'REPROVA: a acao enfileirada levou uma chave de idempotencia '
            'DIFERENTE da que a tentativa usou. No reenvio o servidor trataria '
            'o pedido como novo, e a mesma tutora receberia a mesma sugestao '
            'duas vezes (criterio 13 da BICHUS-31).',
      );
    });

    testWidgets('com o 201 do servidor, a tela diz registrado', (tester) async {
      final rede = _Rede();
      final fila = DepositoDaFilaEmMemoria();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
        depositoDaFila: fila,
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      expect(find.text(TextosDoAchado.tituloDoRegistrado), findsOneWidget);
      expect(
        find.text(TextosDoAchado.tituloDaFila),
        findsNothing,
        reason: 'REPROVA: o servidor respondeu 201 e a tela diz que vai '
            'registrar depois. O espelho do defeito acima: a pessoa fica '
            'esperando uma coisa que ja aconteceu, e pode registrar de novo.',
      );
      expect(
        fila.gravacoes,
        0,
        reason: 'REPROVA: o achado saiu pela rede E foi para a fila. O reenvio '
            'criaria um segundo achado do mesmo animal.',
      );
    });

    testWidgets('o corpo leva os quatro do contrato e nada de foto',
        (tester) async {
      final rede = _Rede();
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      await tocarEmRegistrar(tester);

      final corpo = rede.corpoDoRegistro!;
      expect(corpo['species'], 'dog');
      expect(corpo['size'], 'M');
      expect(corpo['found_at'], isA<String>());
      expect((corpo['area'] as Map)['city'], 'São Paulo');
      // Os opcionais que a pessoa nao preencheu **nao viajam**. Um
      // `breed_code: null` num corpo de criacao diria "a raca e nula" onde o
      // contrato le "nao informado".
      expect(corpo.containsKey('breed_code'), isFalse);
      expect(corpo.containsKey('primary_color_code'), isFalse);
      expect(corpo.containsKey('sex'), isFalse);
      expect(
        corpo.containsKey('photo_upload_id'),
        isFalse,
        reason: 'REPROVA: o corpo do registro leva `photo_upload_id`. Nao ha '
            'valor valido para esse campo antes do registro: a intencao de '
            'upload exige `found_report_id`, ou seja, exige que o achado ja '
            'exista. O que viajasse ali seria inventado.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — o achado de outra pessoa nao fica visivel
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/achado/tela_do_achado.dart`,
  // troque o ramo do 404 para cair em `_erro` e deixe `_achado` como estava,
  // ou faca a tela desenhar de um `extra` sem chamar `buscar`.
  // Medido em 22/09/2026: **1 caso reprova** neste grupo.
  // -------------------------------------------------------------------------
  group('ISCA — o achado de outra pessoa responde ausencia', () {
    testWidgets('404 do servidor nao deixa nada do achado na tela',
        (tester) async {
      // O 404 e a resposta de "nao e seu" E de "nao existe", e a igualdade e
      // deliberada (ADR-0021): um 403 confirmaria que aquele identificador e
      // um achado de verdade.
      final rede = _Rede(respostaDoAchado: problema('not-found', 404));
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.achadoDe(_idDoAchado));

      expect(
        rede.pedidosDeAchado,
        greaterThan(0),
        reason: 'REPROVA: a tela do achado desenhou sem PERGUNTAR ao servidor. '
            'Quem sustenta "achado alheio responde ausencia" e a clausula '
            '`WHERE` do servidor: uma tela que lesse o registro de um cache, '
            'de um `extra` ou de um rascunho local faria a regra deixar de '
            'valer no unico lugar em que ela e visivel -- o aparelho '
            'compartilhado, onde a segunda pessoa a entrar herda a tela da '
            'primeira.',
      );
      expect(find.text(TextosDoAchado.naoEncontrado), findsOneWidget);
      // **Nada do achado na arvore.** Meia tela ja contaria que o registro
      // existe, e e exatamente isso que o 404 unico fecha.
      expect(
        find.textContaining('coleira azul'),
        findsNothing,
        reason: 'REPROVA: a observacao de um achado que nao e desta conta '
            'apareceu na tela.',
      );
      expect(
        find.textContaining('Região:'),
        findsNothing,
        reason: 'REPROVA: a regiao de um achado que nao e desta conta apareceu '
            'na tela. Bairro e cidade de onde um animal foi achado sao dado '
            'de outra pessoa.',
      );
    });

    testWidgets('o achado da propria conta aparece', (tester) async {
      // O outro sentido: um portao que so soubesse esconder ficaria verde com
      // uma tela que nunca mostra nada, e ele sumiria do CI do mesmo jeito.
      final rede = _Rede(
        respostaDoAchado: json200(achadoDoContrato(rotuloDaArea: 'Pinheiros')),
      );
      await abrirOApp(
        tester,
        rede: rede.call,
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.achadoDe(_idDoAchado));

      expect(find.textContaining('Pinheiros'), findsOneWidget);
      expect(find.textContaining('coleira azul'), findsOneWidget);
      expect(find.text(TextosDoAchado.naoEncontrado), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 — O AVISO DO LUGAR SAIU (cliente, 29/10/2026)
  //
  // Havia aqui tres casos medindo uma `FaixaDeAviso` com dois textos
  // condicionais. Eles sairam porque **os dois textos deixaram de poder ser
  // verdade** quando a tela parou de capturar coordenada:
  //
  // - `semRotuloDeArea` dizia *"O tutor vai ver a distancia, e nao o bairro"*.
  //   Sem coordenada nao existe distancia nenhuma para o tutor ver: a frase
  //   passaria a MENTIR, e nao a ficar velha;
  // - `semCoordenada` dizia que a busca vale na cidade inteira. Virou verdade
  //   em TODO achado, e faixa que aparece sempre nao distingue nada -- deixa de
  //   ser aviso e passa a ser decoracao com cara de problema, na tela de quem
  //   esta com um animal na rua.
  //
  // Os dois textos foram apagados de `textos_do_achado.dart` junto com a
  // faixa, e `_avisoDoLugar` saiu das DUAS telas de achado.
  //
  // **O que fica medido no lugar e a AUSENCIA**, para ninguem "consertar" a
  // faixa de volta sem a decisao: a tela nao pode voltar a falar de distancia
  // num achado que nao tem coordenada.
  //
  // DESLIGAR PARA VER REPROVAR: devolva `_avisoDoLugar` e a `FaixaDeAviso` a
  // `tela_registrar_achado.dart`.
  // -------------------------------------------------------------------------
  group('a tela nao fala mais de distancia nem de coordenada', () {
    testWidgets('nenhuma faixa sobre o lugar aparece no passo 2',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);

      // As duas frases, pelo texto literal que elas tinham. Elas nao existem
      // mais como constante; se alguem as reescrever, e por aqui que a volta
      // aparece.
      expect(
        find.textContaining('vai ver a distância'),
        findsNothing,
        reason: 'REPROVA: a tela voltou a dizer que o tutor vai ver a '
            'distancia. Esta tela nao captura coordenada desde 29/10/2026, '
            'entao nao ha distancia para o tutor ver -- a frase e falsa, e '
            'nao apenas velha.',
      );
      expect(
        find.textContaining('cidade inteira'),
        findsNothing,
        reason: 'REPROVA: a faixa de "vale na cidade inteira" voltou. Ela e '
            'verdadeira em 100% dos achados desta tela, e por isso nao '
            'informa nada: uma faixa que aparece sempre e decoracao com cara '
            'de problema.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 4 — nenhum controle de F3.5 se anuncia como botao sem acao
  //
  // A fonte e a arvore de semantica em EXECUCAO, com o app montado, e nunca o
  // texto do codigo: uma varredura de fonte casaria com a mencao ao proprio
  // mecanismo dentro de um comentario -- e ha um, logo acima do
  // `_DataEscolhida` desta tela.
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/tela_registrar_achado.dart`, apague a linha
  // `onTap: aoTrocar,` do `Semantics` de `_DataEscolhida`.
  // Medido em 22/09/2026: **1 caso reprova**, nomeando o controle.
  // -------------------------------------------------------------------------
  group('ISCA — a arvore de semantica de F3.5', () {
    testWidgets('todo botao de F3.5 tem acao de toque', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await preencherOMinimo(tester);
      // `Outra data` para o `_DataEscolhida` existir na arvore: ele e o unico
      // controle desta tela que embrulha o filho em
      // `Semantics(..., excludeSemantics: true)`, que e a forma exata do
      // defeito.
      await rolarAte(tester, find.text('Outra data'));
      await tocar(tester, find.text('Outra data'));
      // O calendario abre por cima; fecha-lo devolve a tela com a linha da
      // data escolhida montada.
      await tocar(tester, find.text('OK'));

      final violacoes = verificarAcaoDosControles(
        tester,
        tela: 'f3.5',
        tema: 'claro',
        // Sem contagem fixa: F3.5 muda de controles conforme o estado da
        // captura de localizacao, e um numero chutado aqui viraria manutencao
        // a cada mexida na peca da BICHUS-23. O piso de "ha botao" ja reprova
        // a varredura que nao esta olhando para nada.
      );
      expect(
        violacoes,
        isEmpty,
        reason: 'REPROVA: ha controle anunciado como botao e sem acao em '
            'F3.5.\n${relatorio(violacoes)}\n'
            'Quem usa TalkBack ou VoiceOver ouve que existe um botao e nao tem '
            'como aciona-lo. Se o controle embrulha o filho num '
            '`Semantics(..., excludeSemantics: true)`, redeclare `onTap` com a '
            'MESMA acao do `onPressed` do filho.',
      );
      handle.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // O que esta tela NAO guarda no aparelho.
  //
  // `limpezasAoSair` tem registro cobrado por teste
  // (`test/sessao/limpezas_ao_sair_test.dart`): entrada nova sem isca reprova,
  // e entrada registrada que some reprova. A BICHUS-35 **nao acrescenta
  // entrada**, e este grupo e o que torna essa afirmacao verificavel em vez de
  // ser uma frase no commit.
  //
  // O que sobrevive ao app fechar sao duas pecas que ja existiam e que ja tem
  // limpeza registrada: o envelope de intencao e a fila offline.
  // -------------------------------------------------------------------------
  group('a BICHUS-35 nao abriu gaveta nova no aparelho', () {
    test('nada em `achado/` nem em `telas/achado/` sabe gravar', () {
      const formasDeGravar = <String, String>{
        'SharedPreferences': 'preferencias do sistema',
        'FlutterSecureStorage': 'o chaveiro',
        'getApplicationDocumentsDirectory': 'o diretorio do app',
        'writeAsString': 'escrita em arquivo',
        'DepositoEmArquivo': 'um deposito proprio em disco',
      };
      final pastas = <String>['lib/achado', 'lib/telas/achado'];
      var conferidos = 0;
      for (final pasta in pastas) {
        final dir = Directory('${raizDoApp().path}/$pasta');
        expect(
          dir.existsSync(),
          isTrue,
          reason: 'REPROVA: $pasta nao existe. Portao sem o que conferir fica '
              'verde por vazio.',
        );
        for (final f in dir.listSync(recursive: true).whereType<File>()) {
          if (!f.path.endsWith('.dart')) continue;
          conferidos += 1;
          final codigo = f.readAsStringSync();
          for (final forma in formasDeGravar.entries) {
            expect(
              codigo.contains(forma.key),
              isFalse,
              reason: 'REPROVA: ${f.path} grava em ${forma.value} '
                  '(`${forma.key}`).\n'
                  'O achado guarda FOTO e LOCALIZACAO, que sao dado pessoal: '
                  'o que fica no aparelho sobrevive ao logout e precisa entrar '
                  'em `limpezasAoSair` do `ControladorDeSessao`, com isca '
                  'propria, NO MESMO COMMIT. Enquanto nao entrar, esta tela '
                  'nao guarda nada -- e hoje ela nao precisa: o que sobrevive '
                  'ao app fechar e o envelope de intencao e a fila offline, e '
                  'os dois ja estao na lista.',
            );
          }
        }
      }
      expect(
        conferidos,
        greaterThan(3),
        reason: 'REPROVA: conferi $conferidos arquivo(s). A BICHUS-35 tem seis '
            'fontes nas duas pastas; um numero baixo aqui e o portao varrendo '
            'a pasta errada.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA — o contador do recado promete o que o servidor aceita
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/achado/rascunho_do_achado.dart`,
  // volte `limiteDaObservacao` para 1000. Os dois casos deste grupo reprovam.
  //
  // O contador era 1000 e o contrato ja dizia 500 (`StrayFoundReportInput.notes`,
  // o mesmo teto da coluna `found_reports.notes`). A pessoa escrevia 700 sem
  // nenhum aviso na tela e o servidor recusava o aviso INTEIRO no envio --
  // contador que promete o que o servidor recusa e pior que contador nenhum,
  // porque ele garante que a pessoa so descobre depois de ter escrito.
  //
  // Sem texto de apoio: o contador basta (pedido do cliente de 18/10/2026).
  // -------------------------------------------------------------------------
  // ===========================================================================
  // A REDACAO DO ROTULO DO RECADO (cliente, 22/10/2026)
  // ===========================================================================
  // Literal: *"Altere a frase para: Alguma coisa que ajude a reconhecer para
  // Alguma caracteristica especifica que ajude a identifica-lo."*
  //
  // **O caso le a FRASE e nao a constante**, e e a unica vez neste arquivo em
  // que isso e certo: os outros casos usam `TextosDoAchado.rotuloDaObservacao`
  // justamente para nao manter uma segunda copia da redacao -- eles medem o
  // CAMPO. Este mede a REDACAO, que e o que o cliente decidiu, e uma copia que
  // leia a constante passaria com qualquer texto dentro dela.
  //
  // DESLIGAR PARA VER REPROVAR: em
  // `lib/telas/achado/textos_do_achado.dart`, devolva `rotuloDaObservacao` a
  // frase antiga (`'Alguma coisa que ajude a reconhecer?'`). Este caso
  // reprova nos dois `expect`.
  testWidgets('o rotulo do recado e a frase que o cliente escreveu',
      (tester) async {
    await abrirOApp(
      tester,
      rede: _Rede().call,
      deposito: depositoLogado(),
      localizacao: localizacaoConcedida(),
    );
    await irPara(tester, Rotas.registrarAchado);
    await rolarAte(tester, find.text('Cachorro'));
    await tocar(tester, find.text('Cachorro'));
    await rolarAte(tester, find.text('Médio'));
    await tocar(tester, find.text('Médio'));
    await avancarParaOPasso2(tester);

    // CONTROLE POSITIVO: o passo 2 esta na tela E o campo do recado foi
    // construido. Este formulario tem dois passos e o campo so existe no
    // segundo -- um `findsNothing` sozinho ficaria verde no passo 1, que e
    // outro motivo. A rolagem e pelo CAMPO (como os outros casos deste
    // arquivo fazem) e nao pela frase: rolar ate a frase que o caso esta
    // medindo tornaria a propria rolagem parte da afirmacao.
    await rolarAte(tester, _campo(TextosDoAchado.rotuloDaObservacao));
    expect(
      _campo(TextosDoAchado.rotuloDaObservacao),
      findsOne,
      reason: 'REPROVA: o campo do recado nao esta montado. Sem ele os '
          '`expect` de redacao nao medem texto de tela.',
    );

    // **`textContaining` e nao `text`, e a razao e o sufixo `(opcional)`.** O
    // recado e opcional no contrato, e `BichuField` compoe o rotulo desenhado
    // como `'$rotulo (opcional)'` -- entao o no da tela diz
    // `'...identificá-lo. (opcional)'`. O caso mede a frase DELE dentro do
    // rotulo, e nao a composicao, que e decisao do campo e nao da redacao.
    expect(
      find.textContaining(
        'Alguma característica específica que ajude a identificá-lo.',
      ),
      findsOne,
      reason:
          'REPROVA: o rotulo do recado nao e a frase que o cliente pediu em '
          '22/10/2026. A redacao e DELE, literal, inclusive o ponto final -- '
          'ela deixou de ser pergunta e virou pedido.',
    );
    expect(
      find.textContaining('Alguma coisa que ajude a reconhecer'),
      findsNothing,
      reason: 'REPROVA: a frase antiga voltou. Ela PERGUNTAVA se havia algo, '
          'e quem responde "sim" na cabeca nao escreve nada no campo.',
    );
  });

  group('ISCA — o contador do recado nao promete mais que o servidor aceita', () {
    testWidgets('o contador do recado abre em `0/500`', (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await rolarAte(tester, find.text('Cachorro'));
      await tocar(tester, find.text('Cachorro'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await avancarParaOPasso2(tester);
      await rolarAte(tester, _campo(TextosDoAchado.rotuloDaObservacao));

      expect(
        RascunhoDoAchado.limiteDaObservacao,
        500,
        reason: 'REPROVA: o limite da tela deixou de ser o do contrato e da '
            'coluna `found_reports.notes` (500).',
      );
      expect(
        find.text('0/500'),
        findsOne,
        reason: 'REPROVA: o contador do recado nao diz 500. O limite tem de ser '
            'sabido ANTES de a pessoa escrever: ela esta de pe, com uma mao, '
            'com um animal que achou na rua.',
      );
    });

    testWidgets('o campo PARA em 500 e nao deixa digitar o 501', (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await rolarAte(tester, find.text('Cachorro'));
      await tocar(tester, find.text('Cachorro'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await avancarParaOPasso2(tester);
      final recado = _campo(TextosDoAchado.rotuloDaObservacao);
      await rolarAte(tester, recado);

      // 501 digitados: o campo tem de guardar 500 e o contador tem de dizer
      // 500/500. E a borda de cima, medida na tela, antes de qualquer envio.
      await tester.enterText(recado, 'a' * 501);
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(recado).controller?.text.length,
        500,
        reason: 'REPROVA: a tela guardou mais de 500 caracteres. O servidor vai '
            'recusar o aviso inteiro e o recado se perde.',
      );
      expect(find.text('500/500'), findsOne);
    });
  });

}
