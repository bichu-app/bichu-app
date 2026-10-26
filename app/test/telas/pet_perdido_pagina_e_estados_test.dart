// O PET PERDIDO: a pagina interna, a acao inversa e os dois padroes visuais.
//
// Os quatro pedidos do cliente de 18/10/2026, nas palavras dele:
//
//  1. *"na secao dos pets, quando o pet esta perdido, deve ter uma pagina
//     interna do pet e um botao caso a pessoa encontrou o animal"*;
//  2. *"o botao de marcar como perdido esta funcionando. Mas nao tem uma opcao
//     de desmarcar como perdido ou que foi encontrado"*;
//  3. *"esse botao deve ter um padrao visual diferente quando estiver perdido e
//     quando nao estiver"*;
//  4. o campo rotulado `Sinais` passar a ler `Sinais particulares` -- ele leu
//     `Sinais` na tela e PERGUNTOU o que era.
//
// ---------------------------------------------------------------------------
// COMO VER CADA ISCA REPROVANDO
// ---------------------------------------------------------------------------
//
// Cada grupo abaixo diz, no proprio corpo, qual mecanismo desligar. Resumo:
//
//  - grupo 1: devolva `aoTocar` a nulo em `lista_de_perdidos.dart`, ou aponte
//    `casoPublico` para outra coisa;
//  - grupo 2: devolva o destino do `Encontrei este animal` para
//    `Rotas.registrarAchado` (o defeito de 26/10), ou tire o `extra` do
//    `push`;
//  - grupo 3: ignore `can_report_sighting` e desenhe o botao sempre;
//  - grupo 4: trate o 410 como erro generico (com `Tentar de novo`);
//  - grupo 5: tire o `Encontrei meu pet` de `_acaoDeEstadoDoPet`;
//  - grupo 6: use o MESMO widget de botao nos dois estados;
//  - grupo 7: volte o titulo do cartao de sinais para `'Sinais'`.
//
// **A fonte e sempre a arvore montada e a rede observada, e nunca o texto do
// codigo.** Uma varredura de fonte casaria com a mencao ao proprio mecanismo
// dentro de um comentario -- ja aconteceu neste repositorio --, e apagar o
// codigo de verdade deixava a isca verde.
//
// As chamadas de rede sao CONTADAS, e nao inferidas do desfecho da tela: uma
// tela que encerrasse o caso sem chamar nada pareceria identica a uma que
// encerrou, e o contrario tambem.

import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/tela_encontrei_este_pet.dart';
import 'package:bichu/telas/achado/tela_registrar_achado.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/telas/perdido/tela_do_caso_publico.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
import 'perdidos_e_meus_achados_test.dart'
    show abrirPets, paginaDePerdidos, perdidoDoContrato, tokenDeMel;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';
const String _idDoCaso = '7c2b55aa-0000-7000-8000-00000000ca50';

/// Um pet do tutor com caso aberto, que e o estado em que a acao inversa
/// existe. **Os DOIS campos** (`status` e `open_case_id`), porque e os dois que
/// a tela le: ver `_jaProcurado` em `tela_detalhe_do_pet.dart`.
Map<String, dynamic> _petPerdido() =>
    petDoContrato(status: 'lost', casoAberto: _idDoCaso);

/// `LostCase` como a resposta de `closeLostCase` o declara.
///
/// `prazoDeReabertura` entra como ARGUMENTO, e nao como data fixa: e o unico
/// eixo que o grupo da reabertura move. Nulo e o caso sem prazo, que e
/// exatamente o estado que **nao** pode virar oferta de reabrir.
Map<String, dynamic> _casoDoContrato({
  String status = 'closed_reunited',
  String? prazoDeReabertura,
}) {
  return <String, dynamic>{
    'id': _idDoCaso,
    'pet_id': _idDoPet,
    'status': status,
    'opened_at': '2026-10-16T10:00:00.000Z',
    'last_seen_at': '2026-10-16T09:00:00.000Z',
    'area_label': 'Vila Mariana, São Paulo',
    'has_location': false,
    'alert': <String, dynamic>{'reach_status': 'queued', 'radius_m': 5000},
    // O contrato declara `reopen_deadline` em `LostCase`, e e dele que a tela
    // tira a janela. `null` quando o cenario quer um caso sem prazo.
    'reopen_deadline': prazoDeReabertura,
  };
}

/// Um prazo de reabertura **no futuro**, longe o bastante para a janela estar
/// aberta em qualquer dia em que a suite rodar.
///
/// `DateTime.now()` e nao uma data fixa, de proposito: uma data literal de 2026
/// venceria no ano seguinte e a isca da reabertura ficaria VERMELHA sozinha, num
/// dia em que ninguem mudou nada. O eixo que o teste controla e "futuro" ou
/// "passado", e nao o calendario.
String _prazoNoFuturo() =>
    DateTime.now().toUtc().add(const Duration(days: 6)).toIso8601String();

/// Um prazo JA VENCIDO. O par do de cima.
String _prazoNoPassado() =>
    DateTime.now().toUtc().subtract(const Duration(days: 1)).toIso8601String();

/// `PublicLostCase`: a projecao publica do caso, pelo `share_token`.
///
/// `allOf` sobre `PublicLostPet`, e por isso ela parte de [perdidoDoContrato] em
/// vez de repetir os sete campos -- duas massas para a mesma projecao
/// divergiriam, e a isca passaria a medir a divergencia e nao a tela.
Map<String, dynamic> _casoPublicoDoContrato({
  bool podeAvisar = true,
  String? descricao = 'Fugiu pelo portão da frente.',
  String? cuidados = 'É medroso. Não corra atrás dele.',
}) {
  return <String, dynamic>{
    ...perdidoDoContrato(vistoEm: '2026-10-16T09:00:00.000Z'),
    'description': descricao,
    'care_notes': cuidados,
    'can_report_sighting': podeAvisar,
    'poster_url': 'https://web.teste/cartaz/$tokenDeMel',
  };
}

// ---------------------------------------------------------------------------
// As redes
// ---------------------------------------------------------------------------

/// O que a rede recebeu, para as iscas CONTAREM.
class _Registro {
  final List<http.Request> pedidos = <http.Request>[];

  /// Os corpos enviados a `POST /lost-cases/{id}/close`.
  final List<Map<String, dynamic>> encerramentos = <Map<String, dynamic>>[];

  /// Quantas vezes `POST /lost-cases/{id}/reopen` foi chamada. CONTADA, e nao
  /// inferida do desfecho da tela: uma tela que reabrisse sem chamar nada
  /// pareceria identica a uma que reabriu, e o contrario tambem.
  final List<http.Request> reaberturas = <http.Request>[];

  Iterable<String> get caminhos => pedidos.map((r) => r.url.path);
}

/// A rede da LISTAGEM publica mais a pagina de UM caso.
///
/// `_Fase`: o `status` de `getPublicLostCase` e injetado para o grupo do 410.
Future<http.Response> Function(http.Request) _redeDaListagemEDoCaso(
  _Registro registro, {
  Map<String, dynamic>? caso,
  int statusDoCaso = 200,
}) {
  return (req) async {
    registro.pedidos.add(req);
    final caminho = req.url.path;
    if (caminho == '/v1/public/lost-pets' && req.method == 'GET') {
      return json200(
        paginaDePerdidos(<Map<String, dynamic>>[
          perdidoDoContrato(vistoEm: '2026-10-16T09:00:00.000Z'),
        ]),
      );
    }
    if (caminho == '/v1/public/lost-cases/$tokenDeMel' && req.method == 'GET') {
      if (statusDoCaso != 200) {
        return problema('lost-case-closed', statusDoCaso);
      }
      return json200(caso ?? _casoPublicoDoContrato());
    }
    if (caminho.endsWith('/reference-data')) return json200(referenciaDeTeste());
    return problema('not-found', 404);
  };
}

/// A rede do DETALHE do pet (visao do tutor), com o encerramento do caso.
///
/// O `GET /pets/{id}` devolve [primeiro] na primeira leitura e [depois] da
/// segunda em diante. **Sem isso nao ha como medir a releitura**: uma rede que
/// responde o mesmo pet sempre deixaria passar uma tela que nunca releu.
Future<http.Response> Function(http.Request) _redeDoDetalhe(
  _Registro registro, {
  required Map<String, dynamic> primeiro,
  Map<String, dynamic>? depois,
  /// O pet da TERCEIRA leitura em diante: o estado depois de REABRIR.
  Map<String, dynamic>? depoisDaReabertura,
  int statusDoEncerramento = 200,
  /// O `reopen_deadline` que `closeLostCase` devolve. Nulo e caso sem prazo.
  String? prazoDeReabertura,
  /// O status de `reopenLostCase`. 410 e a janela vencida.
  int statusDaReabertura = 200,
}) {
  var leituras = 0;
  return (req) async {
    registro.pedidos.add(req);
    final caminho = req.url.path;

    if (caminho == '/v1/lost-cases/$_idDoCaso/close' && req.method == 'POST') {
      registro.encerramentos.add(
        jsonDecode(req.body) as Map<String, dynamic>,
      );
      if (statusDoEncerramento != 200) {
        return problema('internal-error', statusDoEncerramento);
      }
      return json200(_casoDoContrato(prazoDeReabertura: prazoDeReabertura));
    }
    if (caminho == '/v1/lost-cases/$_idDoCaso/reopen' && req.method == 'POST') {
      registro.reaberturas.add(req);
      if (statusDaReabertura != 200) {
        // `lost-case-closed` e o `type` que o servidor devolve no 410 da janela
        // vencida -- o mesmo slug de `x-problem-types`.
        return problema('lost-case-closed', statusDaReabertura);
      }
      // O caso REABERTO: `status: open`, e sem prazo (o servidor zera
      // `reopen_deadline` ao reabrir).
      return json200(_casoDoContrato(status: 'open'));
    }
    if (caminho == '/v1/pets/$_idDoPet' && req.method == 'GET') {
      leituras += 1;
      // TRES leituras, e nao duas, porque o fluxo tem tres estados: a abertura
      // da pagina, a releitura depois de ENCERRAR, e a releitura depois de
      // REABRIR. Com duas, o cenario da reabertura ficava impossivel de montar:
      // o pet voltava a `lost` ja na releitura do encerramento, e a oferta de
      // reabrir -- que so existe com o pet NAO procurado -- nunca aparecia.
      if (leituras == 1) return json200(primeiro);
      if (leituras == 2) return json200(depois ?? primeiro);
      return json200(depoisDaReabertura ?? depois ?? primeiro);
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[primeiro],
      });
    }
    if (caminho.endsWith('/reference-data')) return json200(referenciaDeTeste());
    // O QR e o pedido da plaquinha sao leituras secundarias desta tela, e cada
    // uma tem desfecho proprio para a falha. 404 aqui mantem a pagina inteira.
    return problema('not-found', 404);
  };
}

/// Abre T.1 pela rota, com a rede do detalhe.
Future<void> _abrirODetalhe(
  WidgetTester tester, {
  required _Registro registro,
  required Map<String, dynamic> primeiro,
  Map<String, dynamic>? depois,
  Map<String, dynamic>? depoisDaReabertura,
  int statusDoEncerramento = 200,
  String? prazoDeReabertura,
  int statusDaReabertura = 200,
}) async {
  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    rede: _redeDoDetalhe(
      registro,
      primeiro: primeiro,
      depois: depois,
      depoisDaReabertura: depoisDaReabertura,
      statusDoEncerramento: statusDoEncerramento,
      prazoDeReabertura: prazoDeReabertura,
      statusDaReabertura: statusDaReabertura,
    ),
  );
  await irPara(tester, Rotas.detalheDoPetDe(_idDoPet));
}

/// Toca em `Encontrei meu pet` e **CONFIRMA na folha**.
///
/// A folha e obrigatoria desde o trabalho da reabertura: o toque no botao abre
/// a confirmacao, e o `POST` so sai do botao de dentro dela. Os casos que
/// medem o encerramento passam por aqui; o grupo da folha mede a folha em si.
Future<void> _encerrarConfirmando(WidgetTester tester) async {
  await tocar(tester, find.text('Encontrei meu pet'));
  await tocar(tester, find.text('Encerrar o caso'));
}

void main() {
  // -------------------------------------------------------------------------
  // GRUPO 1 — o cartao do perdido ABRE a pagina interna do pet
  //
  // PARA VER REPROVANDO: devolva `aoTocar` a nulo em `lista_de_perdidos.dart`
  // (era o estado anterior a esta entrega). O cartao volta a nao ter `InkWell`,
  // o toque nao leva a lugar nenhum, e os dois casos ficam vermelhos.
  // -------------------------------------------------------------------------
  group('o cartao do perdido tem pagina interna', () {
    testWidgets(
      'ISCA -- tocar no cartao abre a pagina do pet perdido',
      (tester) async {
        final registro = _Registro();
        await abrirPets(tester, rede: _redeDaListagemEDoCaso(registro));

        await tocar(tester, find.byType(CartaoDoPerdido));

        expect(
          find.byType(TelaDoCasoPublico),
          findsOneWidget,
          reason: 'REPROVA: o cartao da listagem de perdidos nao abriu pagina '
              'nenhuma. O cliente pediu, com estas palavras, "uma pagina '
              'interna do pet" quando ele esta perdido. Enquanto `aoTocar` foi '
              'nulo o cartao era um bloco de leitura sem destino.',
        );
        expect(
          registro.caminhos,
          contains('/v1/public/lost-cases/$tokenDeMel'),
          reason: 'REPROVA: a pagina abriu sem LER o caso do servidor. Uma '
              'tela que desenha a projecao publica a partir de um `extra` '
              'herdado da listagem mostra, no aparelho compartilhado, a '
              'leitura de quem estava antes -- inclusive o '
              '`can_report_sighting` dela.',
        );
      },
    );

    testWidgets(
      'ISCA -- o endereco e `/p/<share_token>`, e nao `/pets/<uuid>`',
      (tester) async {
        final registro = _Registro();
        await abrirPets(tester, rede: _redeDaListagemEDoCaso(registro));
        await tocar(tester, find.byType(CartaoDoPerdido));

        // **A PAGINA PRECISA ESTAR ABERTA**, e este `expect` nao e redundante
        // com o do caso anterior: sem ele o `isEmpty` abaixo passaria por
        // vacuidade -- uma listagem cujo cartao nao abre nada tambem nao pede
        // `/v1/pets/<uuid>` nenhum, e a isca ficaria verde sobre uma tela que
        // nao existe.
        expect(
          find.byType(TelaDoCasoPublico),
          findsOneWidget,
          reason: 'REPROVA: a pagina nao abriu, e sem ela o resto deste caso '
              'nao mede nada.',
        );

        // **ADR-0010, item 6: nenhum UUID interno em saida publica.** A rota
        // `/pets/:petId` e enderecada por UUID, e `PublicLostPet` nao traz
        // `pet_id` de proposito -- o contrato diz que ela "nunca deve
        // possuir". A unica leitura que a pagina faz e a publica, por token.
        expect(
          registro.caminhos.where((c) => c.startsWith('/v1/pets/')),
          isEmpty,
          reason: 'REPROVA: a pagina publica do perdido foi buscar o pet pela '
              'rota de UUID interno. ADR-0010, item 6: identificador interno '
              'nao sai em superficie publica, e o `share_token` existe '
              'exatamente para ser a chave deste caminho.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 2 — `Encontrei este animal` leva a quem NAO redigita o cadastro
  //
  // =========================================================================
  // ESTE GRUPO MEDIA O DEFEITO, E AGORA MEDE O CONSERTO (26/10/2026).
  //
  // Ele exigia que o toque abrisse `TelaRegistrarAchado` -- F3.5, o achado
  // AVULSO --, e e exatamente isso que o cliente relatou como defeito:
  //
  //   *"nao subiu o fluxo de quando clicar no pet, nao levar ele para a
  //   pagina de registrar um achado, porque SE ELE ENCONTROU O PET, ELE NAO
  //   TEM QUE CADASTRAR AS INFORMACOES NOVAMENTE"*
  //
  // F3.5 pergunta especie, raca, cor, sexo e porte, e os cinco ja estao
  // respondidos: o pet tem cadastro e `PublicLostPet` entrega `species` e
  // `size` como campos OBRIGATORIOS. O destino passou a ser
  // `Rotas.encontreiEstePet`.
  //
  // O que este grupo continua medindo, e e o que ele sempre mediu de verdade:
  // a acao EXISTE (pedido literal do cliente de 18/10) e ela NAO reimplementa
  // registro de achado. O vinculo com ESTE caso -- `share_token` no corpo --
  // e medido no fio em `achei_este_pet_test.dart`, que tambem carrega o
  // CONTROLE POSITIVO de F3.5 continuar perguntando os cinco campos.
  // =========================================================================
  //
  // PARA VER REPROVANDO: devolva `_encontrei` para `Rotas.registrarAchado`,
  // ou tire o `extra` do `push` (a rota cai no achado avulso sem o caso).
  //
  // O caminho e o que o contrato manda usar, e esta escrito em
  // `can_report_sighting`: *"o toque leva a `POST /found-reports` com o
  // `share_token` do caso, que vincula o achado direto a ele"*.
  // -------------------------------------------------------------------------
  group('a acao do achador leva a tela que nao pergunta duas vezes', () {
    testWidgets(
      'ISCA -- `Encontrei este animal` abre `TelaEncontreiEstePet`, com o pet',
      (tester) async {
        final registro = _Registro();
        await abrirPets(tester, rede: _redeDaListagemEDoCaso(registro));
        await tocar(tester, find.byType(CartaoDoPerdido));

        final acao = find.text(TelaDoCasoPublico.rotuloDeEncontrei);
        expect(
          acao,
          findsOneWidget,
          reason: 'REPROVA: a pagina do pet perdido nao tem o botao de quem '
              'achou o animal. E o segundo pedido literal do cliente: "um '
              'botao caso a pessoa encontrou o animal".',
        );
        await tocar(tester, acao);

        final tela = find.byType(TelaEncontreiEstePet);
        expect(
          tela,
          findsOneWidget,
          reason: 'REPROVA: a acao nao levou a `TelaEncontreiEstePet`.',
        );
        expect(
          find.byType(TelaRegistrarAchado),
          findsNothing,
          reason: 'REPROVA: o toque voltou a cair em F3.5, o achado AVULSO. '
              'ESTE e o defeito que o cliente relatou em 26/10/2026: F3.5 '
              'pergunta especie, raca, cor, sexo e porte, e quem achou um pet '
              'com cadastro nao tem que responder nada disso.',
        );
        expect(
          tester.widget<TelaEncontreiEstePet>(tela).perdido.shareToken,
          tokenDeMel,
          reason: 'REPROVA: a tela chegou SEM o caso, ou com outro. E do '
              '`PerdidoPublico` que saem `species`, `size` e o `share_token` '
              'do corpo -- sem ele o achado nao fica vinculado a ESTE caso e '
              'depende do cruzamento por atributos descobrir, que e '
              'exatamente o que o campo existe para dispensar.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 3 — quem ve a acao e decidido pelo SERVIDOR
  //
  // PARA VER REPROVANDO: ignore `can_report_sighting` e desenhe o botao sempre.
  //
  // `can_report_sighting` e falso **so** para o proprio tutor. Deduzir isso no
  // app seria impossivel: a projecao publica nao traz `user_id` nenhum.
  // -------------------------------------------------------------------------
  group('`can_report_sighting` decide, e a tela nao deduz', () {
    testWidgets(
      'ISCA -- com `can_report_sighting: false` a acao NAO aparece',
      (tester) async {
        final registro = _Registro();
        await abrirPets(
          tester,
          rede: _redeDaListagemEDoCaso(
            registro,
            caso: _casoPublicoDoContrato(podeAvisar: false),
          ),
        );
        await tocar(tester, find.byType(CartaoDoPerdido));

        expect(
          find.text(TelaDoCasoPublico.rotuloDeEncontrei),
          findsNothing,
          reason: 'REPROVA: a tela ofereceu `Encontrei este animal` a quem o '
              'servidor disse que nao pode avisar -- e o unico que recebe '
              '`false` e o PROPRIO TUTOR. Registrar o achado do proprio pet '
              'criaria um candidato apontando para o caso dele mesmo, e o '
              'produto pediria a ele confirmacao humana de um encontro '
              'consigo.',
        );
        // O resto da pagina FICA: ela continua sendo a leitura do caso.
        expect(
          find.text('Este é o Mel.'),
          findsOneWidget,
          reason: 'REPROVA: sem a acao a tela ficou vazia. `false` tira o '
              'botao, e nao a pagina.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 4 — o 410 e ESTADO, e nao erro
  //
  // PARA VER REPROVANDO: tire o ramo de `_ehCasoEncerrado` e deixe o 410 cair
  // em `_Fase.falha`. A tela passa a oferecer `Tentar de novo`, e os dois casos
  // abaixo ficam vermelhos.
  //
  // `lost-case-closed` cobre CINCO situacoes com um corpo so, e a tela nao pode
  // distinguir qual foi. A saida e a que o contrato nomeia em `next_action`:
  // `register_stray_found_report`.
  // -------------------------------------------------------------------------
  group('o caso encerrado tem saida, e nao `Tentar de novo`', () {
    testWidgets(
      'ISCA -- 410 diz o estado e NAO oferece tentar de novo',
      (tester) async {
        final registro = _Registro();
        await abrirPets(
          tester,
          rede: _redeDaListagemEDoCaso(registro, statusDoCaso: 410),
        );
        await tocar(tester, find.byType(CartaoDoPerdido));

        expect(
          find.text(TelaDoCasoPublico.casoEncerrado),
          findsOneWidget,
          reason: 'REPROVA: a tela tratou o 410 como erro generico. Link '
              'impresso num cartaz nao pode terminar numa pagina sem saida '
              '(mesma razao da tag revogada, ADR-0004), e "nao foi possivel" '
              'nao e verdade: foi possivel, e a resposta e que o caso nao esta '
              'mais aberto.',
        );
        expect(
          find.text('Tentar de novo'),
          findsNothing,
          reason: 'REPROVA: a tela oferece `Tentar de novo` para o que nao '
              'muda. Repetir a pergunta nao reabre o caso, e o botao ensina a '
              'pessoa a insistir -- a mesma escolha que `TelaDoAchado` faz '
              'para o 404.',
        );
        expect(
          find.text(TelaDoCasoPublico.rotuloDeRegistrarAchado),
          findsOneWidget,
          reason: 'REPROVA: o 410 ficou sem saida. O proprio contrato nomeia '
              'a saida em `next_action`: `register_stray_found_report` -- quem '
              'chegou por um cartaz antigo e esta vendo um animal parecido '
              'registra o achado avulso, e o cruzamento por atributos faz o '
              'resto.',
        );
      },
    );

    testWidgets(
      'ISCA -- a saida do 410 vai SEM token, e nao com o token morto',
      (tester) async {
        final registro = _Registro();
        await abrirPets(
          tester,
          rede: _redeDaListagemEDoCaso(registro, statusDoCaso: 410),
        );
        await tocar(tester, find.byType(CartaoDoPerdido));
        await tocar(tester, find.text(TelaDoCasoPublico.rotuloDeRegistrarAchado));

        final formulario = find.byType(TelaRegistrarAchado);
        expect(formulario, findsOneWidget);
        expect(
          tester.widget<TelaRegistrarAchado>(formulario).rascunho?.shareToken,
          isNull,
          reason: 'REPROVA: a saida do 410 levou o token do caso que nao esta '
              'mais aberto. Ele seria recusado no envio, DEPOIS de a pessoa '
              'preencher o formulario inteiro -- e o cruzamento por atributos '
              'e exatamente o que o `next_action` manda usar no lugar.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 5 — a ACAO INVERSA, na visao do TUTOR
  //
  // PARA VER REPROVANDO: tire o `BotaoPrimario` de `_acaoDeEstadoDoPet` e deixe
  // so a faixa (que era o estado anterior a esta entrega). O primeiro caso
  // perde o botao; o segundo perde a chamada.
  // -------------------------------------------------------------------------
  group('o tutor consegue dizer que o pet voltou', () {
    testWidgets(
      'ISCA -- com caso aberto a pagina do pet tem `Encontrei meu pet`',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(tester, registro: registro, primeiro: _petPerdido());

        expect(
          find.text('Encontrei meu pet'),
          findsOneWidget,
          reason: 'REPROVA: o pet esta marcado como perdido e a pagina dele '
              'nao tem a acao inversa. O cliente mediu a falta com estas '
              'palavras: "o botao de marcar como perdido esta funcionando. Mas '
              'nao tem uma opcao de desmarcar como perdido ou que foi '
              'encontrado".',
        );
      },
    );

    testWidgets(
      'ISCA -- o toque ENCERRA o caso com `outcome: reunited`',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
        );
        await _encerrarConfirmando(tester);

        expect(
          registro.encerramentos,
          hasLength(1),
          reason: 'REPROVA: o toque nao encerrou caso nenhum. `closeLostCase` '
              'e a operacao inversa de abrir -- nao existe no contrato uma '
              'rota que mexa em `pets.status` para tirar o `lost`, e procurar '
              'uma seria inventar rota.',
        );
        expect(
          registro.encerramentos.single['outcome'],
          'reunited',
          reason: 'REPROVA: o desfecho enviado nao e o que o botao promete. '
              '`outcome` e obrigatorio porque, nas palavras do contrato, "o '
              'desfecho e o instrumento de medicao do produto: sem ele a '
              'metrica de reencontro nao existe". `Encontrei meu pet` com '
              '`not_found` ou `false_alarm` grava a metrica errada.',
        );
      },
    );

    testWidgets(
      'ISCA -- depois do 200 a tela RELE o pet e volta a oferecer marcar',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
        );
        await _encerrarConfirmando(tester);

        // A resposta de `closeLostCase` e `LostCase`, e nao `Pet`: ela nao diz
        // nada sobre `status` nem `open_case_id`, que sao os dois campos que
        // esta tela le. Virar o estado local sem reler seria a tela afirmando
        // um pet que ela nao mediu.
        expect(
          find.text('Encontrei meu pet'),
          findsNothing,
          reason: 'REPROVA: o caso foi encerrado e a tela continua oferecendo '
              'encerra-lo. O segundo toque bateria num caso que nao esta mais '
              'aberto.',
        );
        // **ROLAR ANTES, e a razao e de 20/10/2026:** a pagina do pet passou
        // a ter a barra de baixo (*"mantenha ele fixo em todas as paginas"*),
        // e com ela o corpo perdeu 72 dp de altura visivel no gabarito de
        // 800 x 600 do `flutter test`. `Marcar como perdido` fica no PE da
        // pagina e saiu do viewport.
        //
        // **`ensureVisible` sobre o finder que NAO pula o offstage**, e nao
        // `scrollUntilVisible`: o `ListView` constroi a linha dentro do
        // `cacheExtent` sem a por no viewport, e `find` trata isso como
        // offstage -- um finder comum enxerga ZERO, entao as 50 tentativas de
        // `scrollUntilVisible` terminam em `Bad state: No element`. O
        // elemento EXISTE; `ensureVisible` rola o que existe para dentro da
        // tela.
        await tester.ensureVisible(
          find.text('Marcar como perdido', skipOffstage: false),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Marcar como perdido'),
          findsOneWidget,
          reason: 'REPROVA: depois de o caso encerrar a tela nao voltou a '
              'oferecer `Marcar como perdido`. O animal voltou ao estado '
              'anterior, e a pagina dele tem de voltar tambem -- um pet que '
              'some de novo precisa do caminho de novo.',
        );
      },
    );

    testWidgets(
      'o encerramento que FALHA nao apaga a pagina do pet',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          statusDoEncerramento: 500,
        );
        await _encerrarConfirmando(tester);

        expect(
          find.text('Encontrei meu pet'),
          findsOneWidget,
          reason: 'REPROVA: o `POST` falhou e a pagina do pet virou tela de '
              'erro. O pet carregou, e quem o estava lendo continua lendo: a '
              'falha e da acao, e nao da leitura.',
        );
        expect(
          registro.encerramentos,
          hasLength(1),
          reason: 'REPROVA: a tentativa nem saiu.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 6 — OS DOIS PADROES VISUAIS (o terceiro pedido do cliente)
  //
  // PARA VER REPROVANDO: use o MESMO widget de botao nos dois estados -- troque
  // o `BotaoPrimario(critico: true)` do ramo de perdido por um
  // `BotaoSecundario`, ou vice-versa. Os dois casos abaixo ficam vermelhos, e
  // eles sao o par: um cobra que o estado perdido NAO use o botao do estado
  // normal, e o outro cobra o contrario.
  //
  // **A medida e o TIPO do widget montado, e nao a cor dos pixels.** Cor
  // dependeria do tema em vigor e passaria a reprovar numa troca de paleta, que
  // nao e o defeito que este grupo pega.
  // -------------------------------------------------------------------------
  group('o botao muda de padrao visual com o estado', () {
    testWidgets(
      'ISCA -- PERDIDO: botao primario de alvo critico, e nenhum secundario',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(tester, registro: registro, primeiro: _petPerdido());

        final primario = find.ancestor(
          of: find.text('Encontrei meu pet'),
          matching: find.byType(BotaoPrimario),
        );
        expect(
          primario,
          findsOneWidget,
          reason: 'REPROVA: com o pet perdido a acao nao e a primaria. O '
              'cliente pediu "um padrao visual diferente quando estiver '
              'perdido e quando nao estiver", e o par do sistema e '
              'secundario (contorno de 2 px) para o estado normal e primario '
              'para o estado de urgencia.',
        );
        expect(
          tester.widget<BotaoPrimario>(primario).critico,
          isTrue,
          reason: 'REPROVA: o alvo de toque ficou em 48 dp. O paragrafo 6.5 do '
              'design system manda 64 dp e diz para que situacao: "pessoa em '
              'pe, com um animal em um dos bracos, usando o polegar da outra '
              'mao" -- que e exatamente quem toca neste botao.',
        );
        expect(
          find.byType(BotaoSecundario),
          findsNothing,
          reason: 'REPROVA: o estado perdido desenhou o botao secundario. Se '
              'os dois estados usam o mesmo widget, nao ha padrao visual '
              'diferente nenhum -- e foi isso que o cliente pediu.',
        );
      },
    );

    testWidgets(
      'ISCA -- NAO PERDIDO: botao secundario, e nenhum `Encontrei meu pet`',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: petDoContrato(),
        );

        expect(
          find.ancestor(
            of: find.text('Marcar como perdido'),
            matching: find.byType(BotaoSecundario),
          ),
          findsOneWidget,
          reason: 'REPROVA: o estado normal deixou de usar o botao secundario. '
              'Ele e a MESMA variante do unico ponto de entrada que esta acao '
              'ja tinha (`Perfil` > `Meus pets`), e duas aparencias para a '
              'mesma acao em duas telas e como elas divergem sem ninguem '
              'decidir.',
        );
        expect(
          find.text('Encontrei meu pet'),
          findsNothing,
          reason: 'REPROVA: a tela oferece encerrar um caso que nao existe. '
              'Sem `open_case_id` nao ha `caseId` para montar a rota, e o '
              'pedido sairia para `/lost-cases//close`.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 7 — O ROTULO (o quarto pedido do cliente)
  //
  // PARA VER REPROVANDO: volte o titulo do cartao para o literal `'Sinais'` em
  // `tela_detalhe_do_pet.dart`. Os dois `expect` abaixo ficam vermelhos, e os
  // dois precisam estar aqui: o primeiro cobra a frase nova, e o segundo cobra
  // que a antiga SAIU -- um titulo a mais, em outro lugar da tela, com a palavra
  // sozinha, e a mesma pergunta do cliente de volta.
  //
  // `find.text` casa o texto INTEIRO, entao `'Sinais particulares'` nao casa com
  // `find.text('Sinais')`: o segundo `expect` nao e vacuo.
  // -------------------------------------------------------------------------
  group('o campo de sinais diz o que e', () {
    testWidgets(
      'ISCA -- o rotulo e `Sinais particulares`, e `Sinais` sozinho saiu',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: petDoContrato(),
        );

        final rotulo = find.text('Sinais particulares');
        await rolarAte(tester, rotulo);
        expect(
          rotulo,
          findsOneWidget,
          reason: 'REPROVA: o campo continua rotulado de um jeito que nao '
              'comunica. O cliente leu `Sinais` nesta tela e PERGUNTOU o que '
              'era (18/10/2026). O campo e `distinctive_marks`, e o '
              'formulario que o preenche sempre o chamou de `Sinais '
              'particulares` -- quem cadastrava escrevia num campo com um nome '
              'e relia noutro.',
        );
        expect(
          find.text('Sinais'),
          findsNothing,
          reason: 'REPROVA: a palavra sozinha ficou na tela. Ela e a pergunta '
              'do cliente de volta, e duas redacoes para o mesmo campo na '
              'mesma pagina e pior que uma errada.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 8 — A FOLHA DE CONFIRMACAO ANTES DE ENCERRAR
  //
  // O defeito que este grupo trava: `Encontrei meu pet` chamava `closeLostCase`
  // NO PRIMEIRO TOQUE. Sem confirmacao, e -- enquanto `reopenLostCase` nao
  // tinha rota -- sem desfazer nenhum.
  //
  // PARA VER REPROVANDO: tire o `if (!await _confirmarEncerramento(pet)) return;`
  // de `_encontreiMeuPet` em `tela_detalhe_do_pet.dart` (o estado anterior a
  // esta entrega). O primeiro caso perde a folha, o segundo passa a ver o
  // `POST` sair sem confirmacao, e o terceiro perde o texto que mede.
  //
  // **A medida e a arvore montada e a rede CONTADA**, e nunca o texto do
  // codigo: uma varredura de fonte casaria com a mencao ao proprio mecanismo
  // dentro de um comentario -- ja aconteceu neste repositorio.
  // -------------------------------------------------------------------------
  group('a folha confirma antes de encerrar, e diz a verdade', () {
    testWidgets(
      'ISCA (d) — o toque ABRE A FOLHA e NAO encerra nada ainda',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
        );

        await tocar(tester, find.text('Encontrei meu pet'));

        // A folha esta na frente: o botao que age tem rotulo PROPRIO, e nao o
        // do botao da pagina. Se os dois tivessem o mesmo texto, `find.text`
        // acharia dois e este caso nao distinguiria folha de pagina.
        expect(
          find.text('Encerrar o caso'),
          findsOneWidget,
          reason: 'REPROVA: o toque em `Encontrei meu pet` nao abriu folha de '
              'confirmacao nenhuma. Encerrar tira o pet da lista publica, '
              'fecha a pagina publica do caso e poe as conversas abertas em '
              'modo leitura -- e nada disso estava escrito em lugar nenhum '
              'antes do toque. O 11.9 do design system manda confirmar acao de '
              'consequencia alta ANTES, dizendo o que vai acontecer.',
        );
        expect(
          find.text('Ainda não encontrei'),
          findsOneWidget,
          reason: 'REPROVA: a folha nao oferece saida. Quem abriu por engano '
              'precisa de um caminho que nao encerre, e ele e o alvo grande e '
              'mais alto (11.9): quem fecha no susto acerta o botao que nao '
              'age.',
        );
        // **A ASSERCAO QUE IMPEDE ESTE CASO DE SER VACUO.** Sem ela, uma tela
        // que abrisse a folha E encerrasse junto passaria: a folha estaria na
        // arvore e o caso ficaria verde sobre um defeito pior que o original.
        expect(
          registro.encerramentos,
          isEmpty,
          reason: 'REPROVA: o `POST` de encerrar saiu ANTES de alguem '
              'confirmar. A folha viraria enfeite -- e seria pior que nao '
              'existir, porque anunciaria uma protecao que nao protege.',
        );
      },
    );

    testWidgets(
      'ISCA (d) — cancelar na folha NAO encerra, e o caso segue aberto',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
        );

        await tocar(tester, find.text('Encontrei meu pet'));
        await tocar(tester, find.text('Ainda não encontrei'));

        expect(
          registro.encerramentos,
          isEmpty,
          reason: 'REPROVA: cancelar na folha encerrou o caso. Cancelar e o '
              'caminho de quem abriu a folha por engano, e ele nao pode chegar '
              'ao `POST`.',
        );
        expect(
          find.text('Encontrei meu pet'),
          findsOneWidget,
          reason: 'REPROVA: a pagina perdeu a acao depois de cancelar. Nada '
              'aconteceu, e a tela tem de continuar oferecendo o que oferecia.',
        );
      },
    );

    testWidgets(
      'ISCA (d) — o texto da folha NAO afirma que alguem foi ou sera avisado',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
        );
        await tocar(tester, find.text('Encontrei meu pet'));

        // O QUE A FOLHA TEM DE DIZER: a consequencia real sobre as conversas.
        // Medido no servidor nesta branch: `LostCaseService.encerrar` nao toca
        // em conversa nenhuma e nao grava mensagem de sistema (embora o
        // contrato prometa uma); o que acontece e `estadoDaConversa` devolver
        // `closed` na proxima LEITURA daquela conversa, derivado do estado do
        // caso. Ninguem recebe nada.
        expect(
          find.textContaining('param de aceitar mensagem nova'),
          findsOneWidget,
          reason: 'REPROVA: a folha nao diz o que acontece com as conversas '
              'abertas. E a consequencia que atinge OUTRA pessoa, e ela tem de '
              'estar escrita antes do toque.',
        );
        expect(
          find.textContaining('7 dias'),
          findsOneWidget,
          reason: 'REPROVA: a folha nao diz que da para reabrir, nem por '
              'quanto tempo. E o que torna a decisao reversivel para quem esta '
              'lendo, e o contrato promete exatamente este prazo.',
        );

        // O QUE A FOLHA NAO PODE DIZER. O push esta bloqueado em producao (a
        // conta de servico da VM nao tem a permissao) e nao funciona no iPhone
        // do cliente (provisionamento gratuito). Nenhuma mensagem de sistema e
        // gravada. Houve neste projeto um defeito em que o servidor devolvia
        // `owner_notified: true`, a tela afirmava isso em texto fixo E o
        // desserializador tinha `?? true` -- tres lugares mentindo juntos.
        //
        // **Cada palavra abaixo foi conferida contra o texto que a folha
        // realmente monta**, e nao e lista decorativa: `avisad` casa
        // "avisado"/"avisada", `notificad` casa "notificado"/"notificada".
        for (final proibida in <String>[
          'avisad',
          'notificad',
          'será avisado',
          'foi avisado',
          'recebem o aviso',
        ]) {
          expect(
            find.textContaining(proibida),
            findsNothing,
            reason: 'REPROVA: a folha afirma um aviso que NAO acontece '
                '(encontrei "$proibida"). Nada e enviado ao encerrar: a '
                'conversa vira modo leitura por derivacao na leitura, nenhuma '
                'mensagem de sistema e gravada, e o push esta bloqueado em '
                'producao e inexistente no iPhone do cliente. Afirmar o aviso '
                'aqui repetiria o defeito dos tres lugares mentindo juntos.',
          );
        }
      },
    );

    testWidgets(
      'o aviso da PAGINA, depois do 200, tambem nao afirma que avisaram alguem',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
        );
        await _encerrarConfirmando(tester);

        expect(registro.encerramentos, hasLength(1));
        // A frase de sucesso dizia "quem estava ajudando foi avisado", e era
        // falsa pelos dois motivos acima. Ela esta medida aqui porque uma folha
        // honesta ao lado de um aviso que mente, na MESMA tela, e so mover a
        // mentira de lugar.
        expect(
          find.textContaining('foi avisado'),
          findsNothing,
          reason: 'REPROVA: a tela afirma, depois do encerramento, que quem '
              'estava ajudando foi avisado. Nada foi enviado a ninguem.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // GRUPO 9 — O DESFAZER (`reopenLostCase`)
  //
  // O contrato prometia, em `closeLostCase`, que "encerrar e reversivel por 7
  // dias", e nomeava a operacao -- que **nao tinha rota** e respondia 404.
  //
  // PARA VER REPROVANDO: devolva `null` a `_casoEncerradoAgora` depois do 200
  // em `_encontreiMeuPet` (ou tire o `...?_ofertaDeReabrir(context)` de
  // `_acaoDeEstadoDoPet`). O primeiro caso perde o botao e o segundo perde a
  // chamada.
  // -------------------------------------------------------------------------
  group('o tutor que encerrou por engano consegue desfazer', () {
    testWidgets(
      'ISCA — com a janela ABERTA, a pagina oferece `Reabrir o caso`',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
          prazoDeReabertura: _prazoNoFuturo(),
        );
        await _encerrarConfirmando(tester);

        expect(
          registro.encerramentos,
          hasLength(1),
          reason: 'REPROVA: o cenario nao encerrou nada, e sem encerramento nao '
              'ha o que reabrir -- este caso mediria o vazio.',
        );
        expect(
          find.text('Reabrir o caso'),
          findsOneWidget,
          reason: 'REPROVA: depois de encerrar, a pagina nao oferece desfazer. '
              'O contrato promete que "encerrar e reversivel por 7 dias" e a '
              'folha acabou de repetir a promessa a quem tocou -- uma promessa '
              'que a tela faz e nao cumpre e pior que nenhuma. O toque por '
              'engano e o defeito medido: um toque, sem volta.',
        );
      },
    );

    testWidgets(
      'ISCA — o toque CHAMA `reopenLostCase` e a tela volta a `Encontrei meu pet`',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          // Depois de ENCERRAR o pet volta a `active`: e nesse estado que a
          // oferta de reabrir e desenhada.
          depois: petDoContrato(),
          // Depois de REABRIR ele volta a `lost`, que e o que o servidor grava.
          depoisDaReabertura: _petPerdido(),
          prazoDeReabertura: _prazoNoFuturo(),
        );
        await _encerrarConfirmando(tester);
        await tocar(tester, find.text('Reabrir o caso'));

        expect(
          registro.reaberturas,
          hasLength(1),
          reason: 'REPROVA: o toque em `Reabrir o caso` nao chamou '
              '`reopenLostCase`. A operacao e a inversa de encerrar, e ela '
              'existe no contrato desde o comeco -- procurar outra rota seria '
              'inventar rota.',
        );
        expect(
          registro.reaberturas.single.url.path,
          '/v1/lost-cases/$_idDoCaso/reopen',
          reason: 'REPROVA: o caminho chamado nao e o do contrato. O `caseId` '
              'sai da resposta de `closeLostCase` -- `Pet` nao tem campo que '
              'aponte para o caso que fechou.',
        );
        expect(
          find.text('Reabrir o caso'),
          findsNothing,
          reason: 'REPROVA: o caso foi reaberto e a tela continua oferecendo '
              'reabri-lo. O servidor zera `reopen_deadline` ao reabrir, e um '
              'segundo toque bateria num caso que ja esta aberto.',
        );
        expect(
          find.text('Encontrei meu pet'),
          findsOneWidget,
          reason: 'REPROVA: depois de reabrir, a pagina nao voltou a oferecer '
              'o encerramento. O animal voltou a ser procurado, e a pagina dele '
              'tem de refletir isso -- a tela RELE o pet justamente por isso.',
        );
      },
    );

    testWidgets(
      'ISCA — SEM prazo na resposta, a pagina NAO oferece reabrir',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
          // `reopen_deadline: null`: o caso encerrado sem prazo gravado.
        );
        await _encerrarConfirmando(tester);

        expect(registro.encerramentos, hasLength(1));
        expect(
          find.text('Reabrir o caso'),
          findsNothing,
          reason: 'REPROVA: a tela ofereceu reabrir sem prazo nenhum na '
              'resposta. Um `?? ` generoso no desserializador, ou uma janela de '
              '7 dias refeita no app sobre `closed_at`, desenharia um botao que '
              'o servidor recusa com 410 -- e a pessoa ouviria "nao da mais" de '
              'um botao que o app acabou de oferecer. E a mesma classe do '
              '`?? true` de `owner_notified`.',
        );
      },
    );

    testWidgets(
      'ISCA — prazo JA VENCIDO na resposta tambem nao oferece reabrir',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
          prazoDeReabertura: _prazoNoPassado(),
        );
        await _encerrarConfirmando(tester);

        expect(registro.encerramentos, hasLength(1));
        // O PAR do caso de cima. Sem ele, "nunca oferece" aprovaria os dois, e
        // a oferta de reabrir seria codigo morto -- a isca da janela aberta e
        // quem cobra o contrario.
        expect(
          find.text('Reabrir o caso'),
          findsNothing,
          reason: 'REPROVA: a tela ofereceu reabrir com o prazo VENCIDO. A '
              'comparacao e contra a data que o servidor mandou, e o 410 de '
              '`reopenLostCase` ("Passou dos 7 dias") e o que esse botao '
              'receberia.',
        );
      },
    );

    testWidgets(
      'a reabertura que FALHA com 410 nao apaga a pagina nem some com o pet',
      (tester) async {
        final registro = _Registro();
        await _abrirODetalhe(
          tester,
          registro: registro,
          primeiro: _petPerdido(),
          depois: petDoContrato(),
          prazoDeReabertura: _prazoNoFuturo(),
          statusDaReabertura: 410,
        );
        await _encerrarConfirmando(tester);
        await tocar(tester, find.text('Reabrir o caso'));

        expect(registro.reaberturas, hasLength(1), reason: 'REPROVA: a tentativa nem saiu.');
        expect(
          find.text('Marcar como perdido'),
          findsOneWidget,
          reason: 'REPROVA: o 410 virou tela de erro e apagou a pagina do pet. '
              'O pet carregou, e quem o estava lendo continua lendo: a falha e '
              'da acao, e nao da leitura.',
        );
      },
    );
  });
}
