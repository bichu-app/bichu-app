// COMPARTILHAR O PET PERDIDO, pela folha do sistema (cliente, 20/10/2026).
//
// As duas falas do cliente, nesta ordem:
//
//  1. *"vamos implementar uma acao de compartilhar o pet perdido no whatsapp,
//     dentro da pagina de detalhes do pet"*;
//  2. *"quando o usuario clicar em compartilhar, tem que aparecer aquela barra
//     no celular para o usuario selecionar onde ele quer compartilhar, e um dos
//     lugares vai ser o whatsapp se o usuario tiver instalado"*.
//
// A segunda fecha a escolha: **folha do sistema**, e nao `wa.me`. Entao nada
// aqui mede WhatsApp -- quem decide o que a folha lista e o sistema, e nenhum
// aplicativo em particular e nosso para garantir. O que estes casos medem e que
// a acao abre a folha e **com que conteudo**.
//
// ===========================================================================
// O QUE FOI MEDIDO ANTES DE ESCREVER UMA LINHA DISTO
// ===========================================================================
//
// 1. **A pagina publica do caso NAO EXISTE.** De fora, em 20/10/2026:
//    `GET https://hml.bichu.app/p/<token>` -> **404**, e
//    `GET https://bichu.app/p/<token>` -> **404**. `web/src/pages/` nao tem a
//    pasta `p/`, e nenhuma branch de `origin` a tem em andamento. O cartao de
//    pre-visualizacao que aquele 404 serve diz
//    `og:title: Pagina nao encontrada · Bichu`.
//
//    Por isso existe a isca (f): o interruptor do servidor
//    (`site_page_availability`, migracao `20261020000010`) omite `share_url`
//    enquanto a pagina nao for publicada, e **sem o campo nao ha acao**.
//
// 2. **`GET /v1/public/lost-cases/{shareToken}` responde 200 sem conta**, e
//    traz `share_url` e `poster_url`. O backend da pagina existe; a pagina nao.
//
// 3. **O cartaz nao e imagem.** `GET /v1/public/lost-cases/{t}/poster` devolve
//    **JSON de 381 bytes** -- os campos de um cartaz, nao um arquivo. Nao existe
//    PNG nem PDF em lugar nenhum, e quem o renderizaria e a pagina `/cartaz/`,
//    que tambem da 404. Entao ha **um caminho so**: texto com o link. Nenhum
//    caso deste arquivo compartilha arquivo, e nao e esquecimento.
//
// ===========================================================================
// COMO VER CADA ISCA REPROVANDO (desligue, rode, religue)
// ===========================================================================
//
// | o que desligar | reprovam, por nome |
// |---|---|
// | em `_linkDoCaso` (`tela_detalhe_do_pet.dart`), devolver `caso.urlDeCompartilhar` sem a trava `if (caso.status != 'open')` | `(c) ISCA: com o caso ENCERRADO, a acao de compartilhar nao existe` |
// | em `_linkDoCaso`, trocar `if (url == null || url.isEmpty) return null` por `return url ?? ''` | `(f) ISCA: com o interruptor do servidor DESLIGADO, a acao nao existe` |
// | em `_encontreiMeuPet`, apagar a linha `_casoAberto = null` do `setState` do 200 | `(c) ISCA: a acao desaparece no mesmo instante em que o caso e encerrado` |
// | apagar a chamada `await _carregarOCasoAberto(pet)` de `_carregar` | `(a) ISCA: com caso aberto, a acao existe e manda o endereco publico do caso` e as duas de (e) |
// | em `_compartilharOCaso`, trocar `caso.rotuloDaArea` por `caso.descricao` (a tentacao de "dar mais contexto") | `(e) ISCA: o texto compartilhado nao carrega rua, telefone nem CEP` |
// | em `mensagemDeCompartilhar`, acrescentar `caso.id` ao texto (a tentacao de "rastrear de onde veio") | `(e) ISCA: o texto compartilhado nao carrega identificador interno` |
// | em `_compartilharOCaso`, apagar o `setState` do `_erroAoCompartilhar` | `(d) ISCA: folha que nao abre nao deixa a tela calada` |
// | em `_Conteudo`, desenhar `BotaoSecundario` de compartilhar fora do `if (_linkDoCaso != null)` | `(b) ISCA: sem caso aberto, a acao de compartilhar nao existe` e (c) e (f) |
//
// PROVADO em 20/10/2026, Flutter test, nesta ordem, com cada desligamento
// confirmado por diferenca do arquivo ANTES de a suite rodar. O placar de cada
// rodada esta no relatorio da entrega.

import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// O `id` do caso: UUID, e **e ele que nao pode aparecer no texto**.
const String _idDoCaso = '7a2b9c10-0000-7000-8000-0000000000bb';

/// O `share_token`: o identificador PUBLICO, o unico que pode sair (ADR-0010
/// item 6). Opaco e sem forma de UUID, de proposito -- se ele parecesse um
/// UUID, a isca (e) nao conseguiria distinguir um do outro.
const String _token = 'a6MMv4fMZSE354uZz1YWUu9RNGpZs9BDshp0zUj1Y';

const String _urlPublica = 'https://web.teste/p/$_token';

/// O lugar como o SERVIDOR o compoe: `"Bairro, Cidade"`, e nada mais fino.
/// `shared/lugar/rotulo-de-area.ts` e quem o monta, e a coordenada nunca entra
/// la. O aplicativo o repassa verbatim.
const String _area = 'Vila Mariana, São Paulo';

/// O texto livre do tutor, com **rua e telefone dentro**.
///
/// Ele existe neste arquivo por um motivo so: ser a isca de (e). O servidor
/// manda `description` em `LostCase`, ela esta a um `.descricao` de distancia
/// de quem for "dar mais contexto" na mensagem, e e exatamente onde mora o
/// endereco exato que o ADR-0010 proibe em superficie publica.
const String _descricaoComRua =
    'Fugiu pelo portão da Rua das Acácias, 221. Ligue (11) 98888-7777. '
    'CEP 04101-300.';

/// `LostCase` como `getLostCase` o declara.
///
/// `urlDeCompartilhar` entra como argumento porque e o EIXO do interruptor: o
/// servidor **omite** o campo enquanto `site_page_availability` disser que a
/// pagina nao existe, e omitir e legitimo -- `LostCase.required` lista so `id`,
/// `pet_id`, `status`, `opened_at` e `alert`.
Map<String, dynamic> _casoDoContrato({
  String status = 'open',
  bool comShareUrl = true,
  String? area = _area,
  String? descricao = _descricaoComRua,
}) {
  return <String, dynamic>{
    'id': _idDoCaso,
    'pet_id': _idDoPet,
    'status': status,
    'opened_at': '2026-10-16T10:00:00.000Z',
    'last_seen_at': '2026-10-16T09:00:00.000Z',
    'area_label': area,
    'has_location': false,
    'description': descricao,
    'alert': <String, dynamic>{'reach_status': 'queued', 'radius_m': 5000},
    'reopen_deadline': null,
    // AUSENTE quando o interruptor esta desligado. Nao e `null`: o servidor
    // nao emite a chave, e a isca (f) cobra o comportamento do app sobre a
    // ausencia de chave, que e o que ele vai receber de verdade.
    if (comShareUrl) 'share_url': _urlPublica,
    if (comShareUrl) 'poster_url': 'https://web.teste/cartaz/$_token',
  };
}

/// A folha de MENTIRA: registra o que foi compartilhado, e nao compartilha nada.
///
/// **Ela nao herda de `SaidaDoAparelho`.** Herdar faria um metodo esquecido cair
/// no de verdade, abrindo canal de plataforma no meio da suite -- e o teste
/// passaria ou falharia por motivo que nao esta escrito em lugar nenhum.
class _FolhaDeMentira extends SaidaDoApp {
  _FolhaDeMentira({this.abre = true});

  /// Se a folha ABRE. `false` e o aparelho sem nada que responda a
  /// `ACTION_SEND`, e o plugin ausente do binario.
  final bool abre;

  final List<String> textos = <String>[];
  final List<String> assuntos = <String>[];

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    textos.add(texto);
    assuntos.add(assunto);
    return abre;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async =>
      fail('Esta tela nao abre mapa.');

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async =>
      fail('Esta tela nao abre mapa.');

  @override
  Future<bool> abrirLink(Uri link) async =>
      fail('A acao de compartilhar NAO abre o navegador: ela abre a folha do '
          'sistema. Se este `fail` disparou, alguem trocou a folha por '
          '`launchUrl`, e o link sairia aberto no aparelho de quem compartilha '
          'em vez de ir para o grupo.');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      fail('Esta tela nao mexe no calendario.');
}

/// O que a rede recebeu, para as iscas CONTAREM em vez de inferirem.
class _Registro {
  final List<http.Request> pedidos = <http.Request>[];
  Iterable<String> get caminhos => pedidos.map((r) => r.url.path);
}

/// A rede do detalhe do pet, com `getLostCase`.
///
/// O `GET /pets/{id}` devolve [primeiro] na primeira leitura e [depois] da
/// segunda em diante -- e sem isso nao ha como medir a releitura do
/// encerramento.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  required Map<String, dynamic> primeiro,
  Map<String, dynamic>? depois,
  Map<String, dynamic>? caso,
  int statusDoCaso = 200,
}) {
  var leituras = 0;
  return (req) async {
    registro.pedidos.add(req);
    final caminho = req.url.path;

    if (caminho == '/v1/lost-cases/$_idDoCaso' && req.method == 'GET') {
      if (statusDoCaso != 200) return problema('not-found', statusDoCaso);
      return json200(caso ?? _casoDoContrato());
    }
    if (caminho == '/v1/lost-cases/$_idDoCaso/close' && req.method == 'POST') {
      return json200(_casoDoContrato(status: 'closed_reunited'));
    }
    if (caminho == '/v1/pets/$_idDoPet' && req.method == 'GET') {
      leituras += 1;
      if (leituras == 1) return json200(primeiro);
      return json200(depois ?? primeiro);
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[primeiro]});
    }
    if (caminho.endsWith('/reference-data')) return json200(referenciaDeTeste());
    // O QR e o pedido da plaquinha sao leituras secundarias, cada uma com
    // desfecho proprio para a falha. 404 aqui mantem a pagina inteira.
    return problema('not-found', 404);
  };
}

Future<void> _abrirODetalhe(
  WidgetTester tester, {
  required _Registro registro,
  required Map<String, dynamic> primeiro,
  Map<String, dynamic>? depois,
  Map<String, dynamic>? caso,
  int statusDoCaso = 200,
}) async {
  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    rede: _rede(
      registro,
      primeiro: primeiro,
      depois: depois,
      caso: caso,
      statusDoCaso: statusDoCaso,
    ),
  );
  await irPara(tester, Rotas.detalheDoPetDe(_idDoPet));
}

/// O pet COM caso aberto, na forma REAL da resposta: `status: active` e
/// `open_case_id` preenchido.
///
/// Abrir caso **nao escreve** `pets.status = 'lost'` -- medido contra Postgres
/// e dito com todas as letras no cabecalho de `kysely-perfil-publico.ts`. Montar
/// a massa com `status: 'lost'` aqui seria montar uma resposta que o servidor
/// nunca emitiu, que e a vacuidade que este repositorio paga caro.
Map<String, dynamic> _petComCasoAberto() =>
    petDoContrato(id: _idDoPet, nome: 'Nina', casoAberto: _idDoCaso);

Map<String, dynamic> _petSemCaso() =>
    petDoContrato(id: _idDoPet, nome: 'Nina');

// ---------------------------------------------------------------------------
// POR QUE TODA ASERCAO DE AUSENCIA USA `skipOffstage: false`
// ---------------------------------------------------------------------------
//
// **Porque sem ele a isca (c) passava com o mecanismo DESLIGADO**, e eu medi
// isso nesta rodada antes de confiar nela. Tirando a linha `_casoAberto = null`
// do `setState` do encerramento, o botao continuava na arvore e o teste
// passava: `find.text` ignora o que esta OFFSTAGE por padrao, e depois do
// encerramento o trecho do botao ficava justamente ali. A contagem, medida:
//
//   find.text('Compartilhar')                      -> 0   (passava)
//   find.text('Compartilhar', skipOffstage: false)  -> 1   (reprova)
//
// E a mesma classe de defeito que esta casa achou NESTA ficha -- uma asercao
// de ausencia verde com a tela nem desenhando o que ela media. Ausencia se
// mede na arvore inteira; presenca continua sendo medida pelo toque, que so
// funciona no que esta na frente da pessoa.

void main() {
  tearDown(SaidaDoApp.restaurar);

  // -------------------------------------------------------------------------
  // (a) COM CASO ABERTO, a acao existe e manda o endereco PUBLICO
  // -------------------------------------------------------------------------
  group('(a) com caso aberto', () {
    testWidgets(
      '(a) ISCA: com caso aberto, a acao existe e manda o endereco publico do caso',
      (tester) async {
        final folha = _FolhaDeMentira();
        SaidaDoApp.atual = folha;
        final registro = _Registro();

        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petComCasoAberto(),
        );

        // O CONTROLE da leitura: sem este pedido a tela nao teria `share_url`
        // nem `area_label`, e todo o resto deste arquivo passaria medindo uma
        // tela que nunca perguntou nada.
        expect(
          registro.caminhos,
          contains('/v1/lost-cases/$_idDoCaso'),
          reason: 'A ficha precisa LER o caso aberto: `share_url` e '
              '`area_label` nao estao em `GET /pets/{id}`, e `open_case_id` e '
              'a unica coisa que ela tem para busca-los.',
        );

        expect(find.text('Compartilhar'), findsOneWidget);
        await tocar(tester, find.text('Compartilhar'));

        expect(
          folha.textos,
          hasLength(1),
          reason: 'Um toque, uma folha. Zero quer dizer que a acao nao chamou '
              'a porta de aparelho; dois, que ela chamou duas vezes.',
        );
        final texto = folha.textos.single;

        // O ENDERECO, inteiro e exatamente como o servidor o mandou.
        expect(
          texto,
          contains(_urlPublica),
          reason: 'O link e o `share_url` do servidor, verbatim.',
        );
        expect(
          texto,
          contains(_token),
          reason: 'O identificador que SAI e o `share_token`, e ele sai dentro '
              'do endereco que o servidor montou.',
        );
      },
    );

    testWidgets(
      '(a) ISCA: o endereco compartilhado nao e montado com o id interno do caso',
      (tester) async {
        final folha = _FolhaDeMentira();
        SaidaDoApp.atual = folha;

        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
        );
        await tocar(tester, find.text('Compartilhar'));

        final texto = folha.textos.single;
        // A asercao PAREADA: o token esta, o id nao. Sozinha, a de baixo
        // passaria com um texto vazio.
        expect(texto, contains(_token));
        expect(
          texto,
          isNot(contains(_idDoCaso)),
          reason: 'ADR-0010 item 6: UUID interno nunca sai em superficie '
              'publica, e esta mensagem vai para um grupo de bairro. O '
              'identificador publico do caso e o `share_token`, dentro do '
              '`share_url` -- e o app nao tem como montar endereco com o id, '
              'porque `LostCase` nao carrega `share_token`.',
        );
      },
    );

    testWidgets(
      '(a) o assunto acompanha, para quando o destino escolhido e e-mail',
      (tester) async {
        final folha = _FolhaDeMentira();
        SaidaDoApp.atual = folha;

        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
        );
        await tocar(tester, find.text('Compartilhar'));

        expect(folha.assuntos.single, contains('Nina'));
        expect(folha.assuntos.single, contains(_area));
        expect(
          folha.assuntos.single,
          isNot(contains(_urlPublica)),
          reason: 'O assunto de um e-mail nao e lugar de endereco: o corpo ja '
              'o carrega, e um assunto com URL dentro e o que filtro de spam le '
              'pior.',
        );
      },
    );

    testWidgets('(a) o leitor de tela ouve SOBRE QUEM e a acao', (tester) async {
      SaidaDoApp.atual = _FolhaDeMentira();

      await _abrirODetalhe(
        tester,
        registro: _Registro(),
        primeiro: _petComCasoAberto(),
      );

      // `Compartilhar` lido fora de contexto nao diz o que. O nome completo
      // diz, e ele chega por `BotaoSecundario.nomeAcessivel`.
      expect(
        find.bySemanticsLabel('Compartilhar o desaparecimento de Nina'),
        findsOneWidget,
        reason: 'WCAG 2.1 SC 4.1.2: o nome do controle tem de dizer sobre o '
            'que ele age.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (b) SEM CASO ABERTO, a acao nao existe
  // -------------------------------------------------------------------------
  testWidgets('(b) ISCA: sem caso aberto, a acao de compartilhar nao existe',
      (tester) async {
    SaidaDoApp.atual = _FolhaDeMentira();
    final registro = _Registro();

    await _abrirODetalhe(tester, registro: registro, primeiro: _petSemCaso());

    // O CONTROLE: a pagina ABRIU. Sem esta linha a asercao de baixo passaria
    // com a tela em branco, que e exatamente o defeito que esta casa achou
    // nesta mesma ficha -- um `isEmpty` verde com a tela nem abrindo.
    expect(
      find.text('Nina'),
      findsWidgets,
      reason: 'A ficha tem de estar na frente da pessoa para a ausencia do '
          'botao significar alguma coisa.',
    );
    expect(find.text('Marcar como perdido'), findsOneWidget);

    expect(
      find.text('Compartilhar', skipOffstage: false),
      findsNothing,
      reason: 'Pet que nao esta perdido nao tem o que compartilhar: nao existe '
          'caso, nao existe pagina publica, nao existe link.',
    );
    expect(
      registro.caminhos,
      isNot(contains('/v1/lost-cases/$_idDoCaso')),
      reason: 'Sem `open_case_id` a leitura do caso nem sai -- montar '
          '`/lost-cases//` seria 404.',
    );
  });

  // -------------------------------------------------------------------------
  // (c) COM O CASO ENCERRADO, a acao nao existe
  // -------------------------------------------------------------------------
  group('(c) caso encerrado', () {
    testWidgets(
      '(c) ISCA: com o caso ENCERRADO, a acao de compartilhar nao existe',
      (tester) async {
        SaidaDoApp.atual = _FolhaDeMentira();

        // O servidor devolve um caso `closed_reunited` **com `share_url`**.
        // Essa combinacao e o ponto: o endereco existe e continua valido, e e
        // so a trava de `status` que impede a acao. Sem ela, compartilhar
        // mandaria a vizinhanca procurar um animal que esta em casa.
        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
          caso: _casoDoContrato(status: 'closed_reunited'),
        );

        expect(find.text('Nina'), findsWidgets, reason: 'CONTROLE: abriu.');
        expect(
          find.text('Compartilhar', skipOffstage: false),
          findsNothing,
          reason: 'Caso encerrado com `share_url` valido continua sendo caso '
              'encerrado. O pet voltou.',
        );
      },
    );

    testWidgets(
      '(c) ISCA: a acao desaparece no mesmo instante em que o caso e encerrado',
      (tester) async {
        SaidaDoApp.atual = _FolhaDeMentira();

        // A releitura do pet devolve o MESMO pet, com `open_case_id` ainda
        // preenchido: e o que acontece quando o `GET /pets` de depois do
        // encerramento falha, ou quando o servidor ainda nao propagou. A tela
        // nao pode depender dele para esconder a acao.
        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
          depois: _petComCasoAberto(),
        );
        expect(find.text('Compartilhar'), findsOneWidget, reason: 'CONTROLE.');

        await tocar(tester, find.text('Encontrei meu pet'));
        await tocar(tester, find.text('Encerrar o caso'));

        expect(
          find.text('Compartilhar', skipOffstage: false),
          findsNothing,
          reason: 'O 200 do encerramento limpa `_casoAberto` no mesmo '
              '`setState`, e nao espera a releitura do pet. A janela entre os '
              'dois seria o momento em que a tela segura um caso com '
              '`share_url` valido e um pet que voltou para casa.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // (d) A FOLHA QUE NAO ABRE
  // -------------------------------------------------------------------------
  testWidgets(
    '(d) ISCA: folha que nao abre nao deixa a tela calada nem solta erro cru',
    (tester) async {
      // `abre: false` e o aparelho sem atividade que responda a `ACTION_SEND`,
      // e e tambem o plugin ausente do binario. **Nao e "WhatsApp nao
      // instalado"**: isso a folha resolve sozinha, mostrando o que existe.
      final folha = _FolhaDeMentira(abre: false);
      SaidaDoApp.atual = folha;

      await _abrirODetalhe(
        tester,
        registro: _Registro(),
        primeiro: _petComCasoAberto(),
      );
      await tocar(tester, find.text('Compartilhar'));

      expect(
        folha.textos,
        hasLength(1),
        reason: 'CONTROLE: a tela TENTOU abrir a folha. Sem isto, a faixa '
            'abaixo poderia estar na tela por outro motivo.',
      );
      expect(
        find.text(
          'Não conseguimos abrir as opções de compartilhamento agora. '
          'Tente de novo.',
        ),
        findsOneWidget,
        reason: 'Um toque que nao faz nada e indistinguivel de um toque que '
            'nao chegou, e a pessoa toca de novo. A tela diz.',
      );
      // E a tela continua sendo a ficha, e nao uma tela de erro: o pet carregou.
      expect(find.text('Nina'), findsWidgets);
      expect(
        find.text('Compartilhar'),
        findsOneWidget,
        reason: 'A acao continua la para a segunda tentativa.',
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'Nada de excecao crua subindo para a arvore de widgets.',
      );
    },
  );

  // -------------------------------------------------------------------------
  // (e) O TEXTO: nem endereco exato, nem identificador interno
  // -------------------------------------------------------------------------
  group('(e) o que o texto carrega, e o que ele nao carrega', () {
    testWidgets(
      '(e) ISCA: o texto compartilhado nao carrega rua, telefone nem CEP',
      (tester) async {
        final folha = _FolhaDeMentira();
        SaidaDoApp.atual = folha;

        // O caso vem com `description` cheia de endereco exato e telefone --
        // texto do TUTOR, que o servidor entrega em `LostCase` e que esta a um
        // `.descricao` de distancia de quem for "dar mais contexto".
        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
          caso: _casoDoContrato(descricao: _descricaoComRua),
        );
        await tocar(tester, find.text('Compartilhar'));
        final texto = folha.textos.single;

        // ANCORADO NO CONTEUDO REAL do que o servidor mandou, e nao num
        // literal de tela: cada padrao abaixo esta em `_descricaoComRua`, e
        // casaria no instante em que alguem a juntasse a mensagem.
        //
        // A lista e a do ADR-0010 §"o que a rota publica jamais exibe", na
        // mesma forma de `notifications/domain/conteudo-do-push.ts`.
        for (final proibido in <RegExp>[
          RegExp(
            r'\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[cç]a|viela|beco|largo)\b',
            caseSensitive: false,
          ),
          RegExp(r'(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}'),
          RegExp(r'\b\d{5}-?\d{3}\b'),
          RegExp(r'-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}'),
          RegExp(r'(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}'),
        ]) {
          expect(
            proibido.hasMatch(texto),
            isFalse,
            reason: 'O padrao $proibido casou no texto que sai do produto:\n'
                '---\n$texto\n---\n'
                'O ADR-0010 fixa o teto de precisao publica em BAIRRO e '
                'CIDADE, e esta mensagem chega em estranhos. O lugar entra '
                'verbatim de `area_label`, que o servidor compoe sem '
                'coordenada; qualquer coisa mais fina que isso veio de outro '
                'campo que nao devia estar aqui.',
          );
        }

        // O CONTROLE das cinco asercoes acima, e ele e o que as impede de
        // serem vacuas: o texto carrega, SIM, o que pode -- nome, lugar e link.
        // Sem isto, um `mensagemDeCompartilhar` que devolvesse string vazia
        // passaria por todos os cinco padroes.
        expect(texto, contains('Nina'));
        expect(texto, contains(_area));
        expect(texto, contains(_urlPublica));
        // E a prova de que a descricao ESTAVA la para ser vazada: se o
        // servidor parar de mandar `description`, esta linha reprova e avisa
        // que a isca acima perdeu o dente.
        expect(
          _descricaoComRua,
          matches(RegExp(r'\bRua\b')),
          reason: 'A massa deste caso precisa conter um endereco exato, senao '
              'as cinco asercoes acima nao tem o que reprovar.',
        );
      },
    );

    testWidgets(
      '(e) ISCA: o texto compartilhado nao carrega identificador interno',
      (tester) async {
        final folha = _FolhaDeMentira();
        SaidaDoApp.atual = folha;

        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
        );
        await tocar(tester, find.text('Compartilhar'));
        final texto = folha.textos.single;

        // Os dois UUID que a tela TEM em maos neste instante.
        expect(texto, isNot(contains(_idDoCaso)), reason: 'o id do caso');
        expect(texto, isNot(contains(_idDoPet)), reason: 'o id do pet');
        // E a FORMA, para pegar um identificador que nao seja nenhum dos dois
        // -- com e sem hifen, porque tirar quatro caracteres e todo o trabalho
        // necessario para furar a regra de cima.
        expect(
          RegExp(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            caseSensitive: false,
          ).hasMatch(texto),
          isFalse,
          reason: 'Nenhuma coisa com forma de UUID no texto. UUIDv7 e '
              'ordenavel e carrega o instante de criacao: um por caso, '
              'publicado, entrega a base como telemetria.',
        );
        expect(
          RegExp(r'(?:^|[^0-9a-z])[0-9a-f]{32}(?:[^0-9a-z]|$)',
                  caseSensitive: false)
              .hasMatch(texto),
          isFalse,
          reason: 'Nem UUID sem hifen.',
        );

        // CONTROLE: o identificador que PODE sair esta la. Sem ele, as quatro
        // asercoes acima passariam com texto vazio.
        expect(texto, contains(_token));
      },
    );
  });

  // -------------------------------------------------------------------------
  // (f) O INTERRUPTOR DO SERVIDOR
  // -------------------------------------------------------------------------
  group('(f) o interruptor', () {
    testWidgets(
      '(f) ISCA: com o interruptor do servidor DESLIGADO, a acao nao existe',
      (tester) async {
        SaidaDoApp.atual = _FolhaDeMentira();
        final registro = _Registro();

        // O caso volta ABERTO e COMPLETO -- e **sem a chave `share_url`**, que
        // e o que `site_page_availability` produz enquanto a pagina publica nao
        // existir. Medido em 20/10/2026: `/p/<token>` da 404 nos dois
        // ambientes, e o cartao que o WhatsApp mostraria diz
        // `Pagina nao encontrada · Bichu`.
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petComCasoAberto(),
          caso: _casoDoContrato(comShareUrl: false),
        );

        // O CONTROLE, em tres camadas, porque esta e a isca mais facil de
        // tornar vacua: a pagina abriu, ela SABE que o pet esta perdido, e a
        // leitura do caso de fato aconteceu.
        expect(find.text('Nina'), findsWidgets, reason: 'A ficha abriu.');
        expect(
          find.text('Encontrei meu pet'),
          findsOneWidget,
          reason: 'A tela esta no ramo do pet PROCURADO -- ou seja, a ausencia '
              'do botao de compartilhar nao e a ausencia do estado inteiro.',
        );
        expect(
          registro.caminhos,
          contains('/v1/lost-cases/$_idDoCaso'),
          reason: 'E o caso FOI lido: a ausencia e do campo, nao da leitura.',
        );

        expect(
          find.text('Compartilhar', skipOffstage: false),
          findsNothing,
          reason: 'Sem `share_url` nao ha destino, e acao sem destino e o que o '
              'criterio 2 da BICHUS-62 proibe. Acender e um `UPDATE` em '
              '`site_page_availability`, com a API de pe e sem APK novo.',
        );
      },
    );

    testWidgets(
      '(f) ISCA: `share_url` vazio tambem esconde, e nao vira link vazio',
      (tester) async {
        SaidaDoApp.atual = _FolhaDeMentira();

        // String vazia e o que um servidor mal configurado emite quando a base
        // da web esta em branco. Ela nao pode virar uma folha de
        // compartilhamento com um texto terminando em dois-pontos e nada.
        final caso = _casoDoContrato();
        caso['share_url'] = '';

        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
          caso: caso,
        );

        expect(find.text('Encontrei meu pet'), findsOneWidget,
            reason: 'CONTROLE: o estado de perdido esta na tela.');
        expect(find.text('Compartilhar', skipOffstage: false), findsNothing);
      },
    );

    testWidgets(
      '(f) a leitura do caso que FALHA tambem esconde a acao',
      (tester) async {
        SaidaDoApp.atual = _FolhaDeMentira();

        // 404 cobre tres coisas no ADR-0021 -- nao existe, nao e seu, nao esta
        // aberto -- e as tres levam ao mesmo lugar aqui.
        await _abrirODetalhe(
          tester,
          registro: _Registro(),
          primeiro: _petComCasoAberto(),
          statusDoCaso: 404,
        );

        expect(find.text('Encontrei meu pet'), findsOneWidget,
            reason: 'CONTROLE: a ficha inteira continua de pe.');
        expect(find.text('Compartilhar', skipOffstage: false), findsNothing);
        expect(
          tester.takeException(),
          isNull,
          reason: 'A leitura secundaria que falha nao vira tela de erro, e nao '
              'solta excecao: o pet carregou, e quem o le continua lendo.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // O texto, medido fora da tela
  // -------------------------------------------------------------------------
  test('a mensagem sem lugar nao inventa lugar nenhum', () {
    // `area_label` e nulo quando o caso foi aberto so com coordenada
    // (BICHUS-21 criterio 5): a coordenada nao vira rotulo, e nao sai. O texto
    // tem variante PROPRIA para isso, e nao um "em algum lugar" inventado.
    final semLugar = TextosDoDetalhe.mensagemDeCompartilhar(
      nome: 'Nina',
      rotuloDaArea: null,
      url: _urlPublica,
    );

    expect(semLugar, contains('Nina sumiu.'));
    expect(semLugar, contains(_urlPublica));
    expect(
      semLugar,
      isNot(contains('—')),
      reason: 'Sem lugar, o travessao que separa nome e bairro nao aparece: '
          'ele separaria o nome de nada.',
    );

    // E o par POSITIVO, para a asercao de cima nao passar por o texto estar
    // vazio ou por o travessao nunca ter existido na redacao.
    final comLugar = TextosDoDetalhe.mensagemDeCompartilhar(
      nome: 'Nina',
      rotuloDaArea: _area,
      url: _urlPublica,
    );
    expect(comLugar, contains('Nina sumiu — $_area.'));

    // Lugar que chega so com espaco em branco e tratado como AUSENTE, e nao
    // vira um travessao seguido de nada.
    expect(
      TextosDoDetalhe.mensagemDeCompartilhar(
        nome: 'Nina',
        rotuloDaArea: '   ',
        url: _urlPublica,
      ),
      contains('Nina sumiu.'),
    );

    // O assunto segue a mesma regra, e **nunca** carrega o endereco.
    expect(
      TextosDoDetalhe.assuntoDeCompartilhar(nome: 'Nina', rotuloDaArea: null),
      'Nina sumiu',
    );
    expect(
      TextosDoDetalhe.assuntoDeCompartilhar(nome: 'Nina', rotuloDaArea: _area),
      'Nina sumiu — $_area',
    );
  });
}
