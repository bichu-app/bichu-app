// A LISTAGEM DE USUÁRIOS DA MESMA REGIÃO (cliente, 02/11/2026), por ADESÃO
// EXPLÍCITA — e os quatro estados de tela que ela tem.
//
// O pedido dele foi *"trazer a listagem de usuarios que estao na mesma regiao
// dele e que as pessoas podem adicionar"*, e as duas perguntas fechadas que
// foram postas antes de escrever qualquer coisa foram decididas por ele:
//
//   1. **só quem optar aparece**, com a adesão DESLIGADA por padrão. Ele
//      recusou listar todo mundo sabendo que a lista começa menor;
//   2. **o piso de 3 caracteres da busca FICA** — `searchPeople` não muda.
//
// ## O que cada caso deste arquivo mede
//
//   (a) **quem NÃO aderiu vê o MOTIVO e a SAÍDA, e não um vazio mudo** — é a
//       mesma lição que o Mural aberto deixou hoje. A tela explica e oferece o
//       botão de ligar, e **não chega a chamar a rota**: a conta de quem olha
//       já explica o vazio, e gastar o teto de 60/h para receber uma página
//       vazia que a própria conta explicava seria desperdício com um nome
//       melhor;
//   (b) **quem não tem CIDADE vê outra coisa** — sem região não há com o que
//       casar, e mandá-lo ligar a adesão seria a saída errada;
//   (c) **ligar o interruptor daqui FUNCIONA e traz a lista** — o par positivo
//       de (a). Sem ele, (a) passaria numa tela que nunca lista nada;
//   (d) **O CARTÃO É O DA BUSCA, com os quatro ramos por estado** — os DOIS
//       casos que `onde_se_adiciona_pessoa_test.dart` exige de toda tela nova
//       que pede conexão: a ausência do botão para quem JÁ é conexão, e o
//       controle positivo de que quem NÃO é conexão continua vendo o controle;
//   (e) **NÃO HÁ FOTO** — nenhuma `ImagemDaRede` nesta lista, e a inicial no
//       círculo no lugar dela.
//
// Todo esperado está escrito por extenso, com acento: nenhum `expect` compara o
// texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/me_api.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/api/pessoas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/rede/cartao_de_pessoa_encontrada.dart';
import 'package:bichu/telas/rede/lista_da_regiao.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'https://api.exemplo.test';

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

/// Uma pessoa como `RegionPerson` a declara: **CINCO campos, e sem foto**.
Map<String, dynamic> _pessoa({
  required String apelido,
  String? nome,
  int pets = 2,
  int conexoes = 9,
  String estado = 'none',
}) {
  return <String, dynamic>{
    'handle': apelido,
    'display_name': nome,
    'pets_count': pets,
    'connections_count': conexoes,
    'connection_state': estado,
  };
}

Map<String, dynamic> _pagina(List<Map<String, dynamic>> itens) {
  return <String, dynamic>{
    'items': itens,
    'total': itens.length,
    'page': 1,
    'limit': 20,
  };
}

/// O corpo de `Me`, para o `PATCH` que liga a adesão.
Map<String, dynamic> _me({required bool naLista}) {
  return <String, dynamic>{
    'id': '018f3a2b-0000-7000-8000-0000000000aa',
    'email': 'eu@exemplo.invalid',
    'email_verified': true,
    'contact_channel_verified': true,
    'display_name': 'Eu Mesmo',
    'pending_profile_fields': <String>[],
    'can_open_lost_case': true,
    'region_listing_opt_in': naLista,
    'reference_area': <String, dynamic>{
      'postal_code': '05435-000',
      'neighborhood': 'Vila Madalena',
      'city': 'São Paulo',
      'state': 'SP',
    },
  };
}

/// O que a tela pediu ao servidor, na ordem. É sobre isto que o caso (a)
/// trabalha: ele afirma o que a tela **não** pediu.
final List<String> chamadas = <String>[];
final List<String> corpos = <String>[];

/// Quantas vezes a listagem da região foi perguntada.
int get _listagens =>
    chamadas.where((c) => c.startsWith('GET /v1/region/people')).length;

/// A conta de quem olha, numa caixa: ligar a adesão troca o valor, e a casca
/// refaz a lista **no mesmo lugar da árvore** — que é a condição do caminho que
/// o caso (c) mede.
final ValueNotifier<Usuario?> conta = ValueNotifier<Usuario?>(null);

class _ListaComSessao extends StatelessWidget {
  const _ListaComSessao({
    required this.pessoas,
    required this.conexoes,
    required this.me,
  });

  final PessoasApi pessoas;
  final ConexoesApi conexoes;
  final MeApi me;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Usuario?>(
      valueListenable: conta,
      builder: (context, usuario, _) => ListaDaRegiao(
        pessoas: pessoas,
        conexoes: conexoes,
        me: me,
        usuario: usuario,
        aoAtualizarOUsuario: (novo) async => conta.value = novo,
        aoAbrirOPerfil: (_) {},
        pedidosQueAindaCabem: 7,
      ),
    );
  }
}

Usuario _usuario({
  required bool naLista,
  String? cidade = 'São Paulo',
  String? uf = 'SP',
}) {
  return Usuario(
    id: '018f3a2b-0000-7000-8000-0000000000aa',
    email: 'eu@exemplo.invalid',
    emailVerificado: true,
    canalConfirmado: true,
    pendencias: const <PendenciaDeCadastro>[],
    podeAbrirCaso: true,
    naListaDaRegiao: naLista,
    nome: 'Eu Mesmo',
    regiaoDeReferencia: (cidade == null && uf == null)
        ? null
        : RegiaoDeReferencia(cidade: cidade, uf: uf),
  );
}

Future<void> _montar(
  WidgetTester tester, {
  required Usuario? usuario,
  List<Map<String, dynamic>> itens = const <Map<String, dynamic>>[],
}) async {
  conta.value = usuario;
  chamadas.clear();
  corpos.clear();
  AppConfig.limparParaTeste();
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}?${pedido.url.query}');
    if (pedido.body.isNotEmpty) corpos.add(pedido.body);
    final caminho = pedido.url.path;
    if (caminho.endsWith('/region/people')) return _json(_pagina(itens));
    if (caminho.endsWith('/me') && pedido.method == 'PATCH') {
      return _json(_me(naLista: true));
    }
    if (caminho.endsWith('/connections') && pedido.method == 'POST') {
      return _json(<String, dynamic>{
        'ref': 'aresta-1',
        'state': 'pending_sent',
        'requested_at': '2026-11-02T12:00:00.000Z',
        'person': <String, dynamic>{'handle': 'ana-vizinha', 'display_name': 'Ana'},
      }, status: 201);
    }
    return _json(<String, dynamic>{}, status: 404);
  });

  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-teste',
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: _ListaComSessao(
            pessoas: PessoasApi(api),
            conexoes: ConexoesApi(api),
            me: MeApi(api),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'ISCA (a): quem NAO aderiu ve o MOTIVO e a SAIDA, e a rota nem e chamada',
    (tester) async {
      await _montar(
        tester,
        usuario: _usuario(naLista: false),
        itens: <Map<String, dynamic>>[_pessoa(apelido: 'ana-vizinha', nome: 'Ana')],
      );

      expect(
        find.text('Você ainda não aparece nesta lista'),
        findsOneWidget,
        reason: 'REPROVA: a tela ficou MUDA para quem não aderiu. É a mesma '
            'lição do Mural: a tela explica e oferece o botão, e não mostra um '
            'vazio sem causa.',
      );
      expect(
        find.textContaining('Enquanto você não escolher, você não aparece e '
            'não vê quem apareceu.'),
        findsOneWidget,
        reason: 'REPROVA: a RECIPROCIDADE não está dita em voz alta. Ela é a '
            'recomendação desta frente e não uma decisão do cliente, e uma '
            'regra que a tela não explica é uma regra que a pessoa descobre '
            'como defeito.',
      );
      expect(
        find.widgetWithText(BotaoPrimario, 'Aparecer na lista'),
        findsOneWidget,
        reason: 'REPROVA: a SAÍDA não está na tela. Explicar sem oferecer o '
            'botão deixa a pessoa sem o que fazer.',
      );
      expect(
        _listagens,
        0,
        reason: 'REPROVA: a tela chamou `GET /v1/region/people` sabendo que a '
            'resposta seria vazia. A conta de quem olha já explica o vazio, e '
            'o teto de 60/h por conta não se gasta para confirmar o que a '
            'própria conta dizia.',
      );
      expect(find.byType(CartaoDePessoaEncontrada), findsNothing);
    },
  );

  testWidgets(
    'ISCA (b): quem nao tem CIDADE ve outra coisa, e nao o convite a aderir',
    (tester) async {
      await _montar(
        tester,
        usuario: _usuario(naLista: true, cidade: null, uf: null),
        itens: <Map<String, dynamic>>[_pessoa(apelido: 'ana-vizinha', nome: 'Ana')],
      );

      expect(
        find.text('Falta a sua cidade'),
        findsOneWidget,
        reason: 'REPROVA: sem região de referência a tela não disse qual é o '
            'problema. Sem cidade e estado não há com o que casar, e mandar a '
            'pessoa ligar a adesão (que já está ligada) seria a saída errada.',
      );
      expect(
        find.text('Você ainda não aparece nesta lista'),
        findsNothing,
        reason: 'REPROVA: a tela ofereceu ligar uma adesão que já está ligada.',
      );
      expect(
        _listagens,
        0,
        reason: 'REPROVA: a rota foi chamada sem região. `texto_para_busca` é '
            'STRICT e a resposta seria vazia de qualquer forma.',
      );
    },
  );

  testWidgets('ISCA (c): ligar daqui FUNCIONA e a lista aparece', (tester) async {
    await _montar(
      tester,
      usuario: _usuario(naLista: false),
      itens: <Map<String, dynamic>>[
        _pessoa(apelido: 'ana-vizinha', nome: 'Ana Vizinha'),
      ],
    );

    await tester.tap(find.widgetWithText(BotaoPrimario, 'Aparecer na lista'));
    await tester.pumpAndSettle();

    expect(
      corpos.any((c) => c.contains('"region_listing_opt_in":true')),
      isTrue,
      reason: 'REPROVA: o botão não gravou a adesão. O corpo enviado foi: '
          '$corpos',
    );
    expect(
      find.text('Ana Vizinha'),
      findsOneWidget,
      reason: 'REPROVA: ligar a adesão não trouxe a lista. Sem esta metade, o '
          'caso (a) passaria numa tela que nunca lista nada.',
    );
    expect(
      find.text('Usuários da sua região'),
      findsOneWidget,
      reason: 'REPROVA: a lista veio sem título, e a pessoa não sabe o que '
          'está olhando.',
    );
    expect(_listagens, greaterThanOrEqualTo(1));
  });

  testWidgets(
    'ISCA (d): quem JA e conexao NAO tem botao de pedir -- e quem nao e, TEM',
    (tester) async {
      // Este caso e o seguinte sao os DOIS que
      // `onde_se_adiciona_pessoa_test.dart` exige de toda tela nova que pede
      // conexao. Eles passam porque esta tela REUSA
      // `CartaoDePessoaEncontrada`, com os quatro ramos que a busca ja tinha --
      // e nao porque ela escreveu um quinto desenho de botao.
      await _montar(
        tester,
        usuario: _usuario(naLista: true),
        itens: <Map<String, dynamic>>[
          _pessoa(apelido: 'ja-conexao', nome: 'Já Conexão', estado: 'connected'),
        ],
      );

      expect(
        find.text('Já é sua conexão'),
        findsOneWidget,
        reason: 'REPROVA: a lista não disse que a pessoa já é conexão.',
      );
      expect(
        find.widgetWithText(BotaoPrimario, 'Pedir conexão'),
        findsNothing,
        reason: 'REPROVA: a lista ofereceu `Pedir conexão` a quem JÁ é conexão '
            'aceita. É o defeito que o cliente cobrou TRÊS vezes (22/10, 26/10 '
            'e 26/10 de novo), e esta é a terceira tela a poder cometê-lo.',
      );
    },
  );

  testWidgets(
    'CONTROLE POSITIVO de (d): quem NAO e conexao continua vendo o controle',
    (tester) async {
      await _montar(
        tester,
        usuario: _usuario(naLista: true),
        itens: <Map<String, dynamic>>[
          _pessoa(apelido: 'ana-vizinha', nome: 'Ana Vizinha', estado: 'none'),
        ],
      );

      expect(
        find.widgetWithText(BotaoPrimario, 'Pedir conexão'),
        findsOneWidget,
        reason: 'REPROVA: a lista não oferece adicionar ninguém. Sem este caso, '
            'a isca (d) ficaria verde numa tela que esconde o botão de todo '
            'mundo — e o pedido do cliente era uma lista *que as pessoas podem '
            'adicionar*.',
      );
      expect(find.text('Já é sua conexão'), findsNothing);
    },
  );

  testWidgets('ISCA (e): NAO HA FOTO nesta lista, e a inicial ocupa o circulo',
      (tester) async {
    await _montar(
      tester,
      usuario: _usuario(naLista: true),
      itens: <Map<String, dynamic>>[
        _pessoa(apelido: 'ana-vizinha', nome: 'Ana Vizinha'),
      ],
    );

    expect(
      find.byType(ImagemDaRede),
      findsNothing,
      reason: 'REPROVA: há foto nesta lista. O motivo NÃO é a emenda 5 item 2 '
          '(que o cliente emendou em 21/10/2026, e a busca TEM foto desde '
          'então): é o argumento com que a foto ENTROU na busca — os três '
          'freios dela garantem que quem vê a foto já sabe aproximadamente '
          'quem procura, e esta lista é folhear.',
    );
    expect(
      find.text('A'),
      findsOneWidget,
      reason: 'REPROVA: a inicial no círculo não apareceu. Ela é o recurso da '
          'emenda 3, e é o que ocupa o lugar da foto.',
    );
    // As duas contagens, que `RegionPerson` traz e o cartão desenha numa linha
    // só. São elas e o nome, e nada mais: a foto não vem, e nenhum quinto
    // campo veio junto.
    expect(find.text('2 pets · 9 conexões'), findsOneWidget);
  });

  testWidgets('quem ADERIU e esta sozinho ve que esta sozinho, e nao um vazio mudo',
      (tester) async {
    await _montar(tester, usuario: _usuario(naLista: true));

    expect(
      find.text('Ninguém por aqui ainda'),
      findsOneWidget,
      reason: 'REPROVA: quem aderiu e não tem vizinhos na lista viu um vazio '
          'sem causa. É o custo que o cliente aceitou — a lista começa menor — '
          'e a tela tem de dizer isso em vez de parecer quebrada.',
    );
    expect(
      find.textContaining('Você já aparece na lista da sua cidade.'),
      findsOneWidget,
      reason: 'REPROVA: a tela não confirmou que a adesão está de pé, e quem '
          'vê um vazio assume que falhou em ligar.',
    );
    expect(
      find.widgetWithText(BotaoPrimario, 'Aparecer na lista'),
      findsNothing,
      reason: 'REPROVA: a tela ofereceu ligar uma adesão que já está ligada.',
    );
  });

  testWidgets('sem sessao a lista nao desenha nada e nao chama nada',
      (tester) async {
    await _montar(tester, usuario: null);
    expect(_listagens, 0);
    expect(find.byType(CartaoDePessoaEncontrada), findsNothing);
    expect(find.text('Você ainda não aparece nesta lista'), findsNothing);
  });
}
