// BICHUS-21 — marcar o pet como perdido: onde e quando ele foi visto.
//
// O fluxo inteiro, medido no app montado: a porta na PAGINA DO PET (T.1), o
// formulario (F3.1), o alcance e o envio (F3.2) e o resultado (F3.3).
//
// A PORTA MUDOU DE TELA EM 18/10, na mescla do lote de tres ramos. Ela era
// `Perfil` > `Meus pets`; a acao saiu dali em `perfil-dados-pessoais` e nasceu
// na pagina do pet em `feat/qr-e-perdido-na-pagina-do-pet`, no MESMO dia. Os
// dois lados so existem juntos nesta arvore, entao nenhum dos dois autores
// podia repontar este arquivo: quem mesclou e que pode.
//
// A escolha de quem e o caso (F3.0) saiu do caminho e nao e mais alcancavel --
// ver o bloco `_f30SemPorta` abaixo, que diz por que quatro casos estao
// PARADOS e nao apagados, e o que precisa ser decidido.
//
// ---------------------------------------------------------------------------
// AS QUATRO ISCAS DESTE ARQUIVO
// ---------------------------------------------------------------------------
//
// Cada grupo abaixo existe para reprovar uma coisa que o codigo poderia voltar
// a fazer sem ninguem notar. Os nomes dos grupos dizem qual:
//
// 1. `so o pet do chamador` — a acao chega a um pet que nao saiu da lista da
//    pessoa. A porta e a unica entrada, e ela so entrega `Pet` que veio de
//    `GET /pets`; a rota recusa qualquer outra coisa no `extra`.
// 2. `data no futuro` — "visto pela ultima vez amanha" e aceito. A regra
//    existia em `quando_foi_visto.dart` **sem nenhum teste** ate esta
//    historia.
// 3. `acao com destino` — a barra de acao oferece um caminho que nao existe:
//    sem pet elegivel, ou para uma rota que o roteador nao registra.
// 4. `na fila nao e aberto` — a tela diz que o caso foi aberto quando ele esta
//    so enfileirado. E o defeito que o criterio 2 da BICHUS-31 nomeia.
//
// Os casos montam o APP INTEIRO, e nao a tela solta, pelo motivo do cabecalho
// de `ajuda_de_tela.dart`: a tela depende do `Escopo`, do roteador e do tema,
// e o que precisa ser medido aqui inclui a rota, o `extra` e a fila.

import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:bichu/api/modelos.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/perdido/resultado_da_abertura.dart';
import 'package:bichu/telas/perdido/tela_alcance_do_alerta.dart';
import 'package:bichu/telas/perdido/tela_de_quem_e_o_caso.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

/// Um pet como o CONTRATO o declara, e nao um corpo a mao.
///
/// Mudou em 18/10, na mescla do lote: a porta de `Marcar como perdido` saiu de
/// `Perfil` > `Meus pets` e entrou na **pagina do pet** (T.1), que le
/// `GET /pets/{id}` e nao a lista. Um corpo parcial passava na lista e faltaria
/// campo em T.1, e o caso reprovaria por um motivo que nao e o dele. Delegar a
/// `petDoContrato` -- a mesma bancada que `pets_api_listar_test.dart` usa --
/// mantem os dois lados falando o contrato, e os nomes dos parametros aqui
/// continuam os que os casos abaixo ja escreviam.
Map<String, dynamic> pet({
  required String id,
  required String nome,
  String status = 'active',
  String? casoAberto,
}) {
  return petDoContrato(
    id: id,
    nome: nome,
    status: status,
    casoAberto: casoAberto,
  );
}

/// Um servidor que responde `GET /pets` com [pets] e nada mais.
///
/// O que nao esta declarado responde 404 **de proposito**: um dublê que
/// inventasse sucesso para uma rota que ninguem pediu esconderia a chamada a
/// mais, e o criterio 6 desta historia e sobre F3.1 nao chamar rede nenhuma.
Future<http.Response> Function(http.Request) servidorCom(
  List<Map<String, dynamic>> pets, {
  Map<String, dynamic>? previa,
  Map<String, dynamic>? casoCriado,
  List<String>? registro,
}) {
  return (req) async {
    registro?.add('${req.method} ${req.url.path}');
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': pets});
    }
    if (req.url.path.endsWith('/lost-case-preview') && req.method == 'GET') {
      if (previa == null) return http.Response('', 503);
      return json200(previa);
    }
    if (req.url.path.endsWith('/lost-cases') && req.method == 'POST') {
      if (casoCriado == null) return http.Response('', 503);
      return json200(casoCriado, status: 201);
    }
    if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
      return http.Response('', 204);
    }
    // -----------------------------------------------------------------------
    // A PAGINA DO PET (T.1) -- a porta NOVA, desde 18/10.
    // -----------------------------------------------------------------------
    //
    // A acao `Marcar como perdido` saiu de `Perfil` > `Meus pets` e entrou em
    // T.1. O fluxo deste arquivo so e alcancavel se o duble souber responder o
    // que T.1 le ao nascer. Nada aqui inventa sucesso: o 404 do fim continua
    // sendo a resposta de tudo o que ninguem declarou, que e a isca do
    // criterio 6 (F3.1 nao chama rede).
    //
    // A lista de plaquinhas volta VAZIA de proposito: `qr.png` so e pedido
    // quando ha plaquinha, e pet sem plaquinha nao mostra QR por decisao. Um
    // duble que devolvesse plaquinha faria estes casos pedirem a imagem do QR,
    // que nao e o que eles medem -- isso e `qr_do_pet_na_pagina_test.dart`.
    final plaquinhas = RegExp(r'^/v1/pets/([^/]+)/tags$').firstMatch(
      req.url.path,
    );
    if (plaquinhas != null && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (req.url.path.endsWith('/reference-data') && req.method == 'GET') {
      return json200(referenciaDeTeste());
    }
    final umPet = RegExp(r'^/v1/pets/([^/]+)$').firstMatch(req.url.path);
    if (umPet != null && req.method == 'GET') {
      final procurado = Uri.decodeComponent(umPet.group(1)!);
      for (final corpo in pets) {
        if (corpo['id'] == procurado) return json200(corpo);
      }
      // Pet que a conta nao tem e 404, e nao um corpo inventado: a isca 1
      // (`so o pet do chamador`) depende de T.1 nao servir pet alheio.
      return http.Response('', 404);
    }
    return http.Response('', 404);
  };
}

/// Abre o app logado e entra em `Perfil`, como a tutora entra.
Future<void> abrirOPerfil(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  RegiaoDeReferencia? regiao,
  DepositoDaFilaEmMemoria? fila,
  Avisos? avisos,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(regiaoDeReferencia: regiao),
    depositoDaFila: fila,
    avisos: avisos,
  );
  await irParaAConta(tester);
}

// ---------------------------------------------------------------------------
// PARADO, E NAO APAGADO: F3.0 FICOU SEM PORTA NA MESCLA DE 18/10
// ---------------------------------------------------------------------------
//
// Quatro casos deste arquivo medem F3.0 -- `TelaDeQuemEOCaso`, a escolha de
// qual animal. Eles estao marcados `skip: _f30SemPorta` e **nenhum foi
// apagado**. O motivo, medido nesta arvore e nao suposto:
//
// F3.0 nao e alcancavel. `Rotas.escolherPetPerdido` continua REGISTRADA, mas
// o construtor dela exige a lista de pets em `extra` e **nao chama rede**
// (criterio 6): `if (pets is! List<Pet> || pets.isEmpty) return AbaPerfil()`.
// O unico lugar do produto que passava essa lista era
// `MeusPets._acaoDeMarcarPerdido`, e ele saiu em `perfil-dados-pessoais`. A
// porta nova, em `feat/qr-e-perdido-na-pagina-do-pet`, nao repoe F3.0: a
// pagina do pet empurra `Rotas.marcarPerdido` direto com UM pet, e salta a
// escolha de proposito -- na pagina da Nina nao ha deslize possivel. Medido:
// `grep -rn 'escolherPetPerdido' app/lib` nao acha nenhum `push`.
//
// POR QUE NAO REPONTEI ESTES QUATRO. Pela porta nova F3.0 nunca aparece,
// entao nao ha como medi-la por ela. A outra saida seria empurrar a rota com
// um `List<Pet>` montado no teste -- e isso seria TAUTOLOGIA: o caso passaria
// a fornecer justamente o que a producao deixou de fornecer, e ficaria verde
// com a porta apagada, que e o estado em que estamos. Um caso que nao
// distingue os dois mundos e pior que um caso parado com o motivo escrito.
//
// O QUE ISSO CUSTA, dito e nao escondido: a esta altura ninguem mede mais o
// conteudo de F3.0 (quais pets a lista oferece, nada pre-marcado, escolher
// levar a F3.1 com o pet no topo, o pet ja perdido fora do grupo de opcoes).
//
// DECIDIDO EM 18/10/2026: **F3.0 SE APOSENTA.** Os quatro casos continuam
// aqui, parados, com o motivo e a decisao escritos -- e nao apagados.
//
// O paragrafo anterior dizia "precisa de decisao do cliente, e nao de conserto
// meu". A decisao foi tomada depois de MEDIR o que o aplicativo faz hoje com
// dois ou mais pets, e a medicao esta escrita como caso no grupo `a escolha
// com dois ou mais pets` (`com 2+ pets a escolha JA aconteceu ...`). O que ela
// mostra, com tres pets elegiveis na conta:
//
//   `Perfil` > `Meus pets` -> cartao do pet -> T.1 do PET TOCADO -> `Marcar
//   como perdido` -> F3.1 **ligada aquele pet**, com o nome dele no topo e o
//   dos outros dois fora da tela.
//
// Isto e, **a escolha de qual animal ja aconteceu**, e aconteceu antes do
// fluxo, por navegacao. O criterio 1 da BICHUS-21 criou F3.0 "para prevenir o
// deslize de marcar o pet errado quando ha mais de um" -- e o deslize que ele
// previne e o de uma acao de LISTA, que era onde a porta antiga morava
// (`Perfil` > `Meus pets`). Essa porta saiu por decisao do cliente em 18/10:
// as acoes de criar subiram para a barra e a acao de perdido desceu para a
// pagina do animal. Na pagina da Nina nao ha deslize possivel.
//
// POR QUE NAO REPOR A PORTA, que era a leitura oposta. Repor significaria
// acrescentar uma SEGUNDA porta para o mesmo fluxo, numa tela que nao sabe de
// qual animal se fala -- e `meus_pets_test.dart` hoje REPROVA exatamente isso,
// com estas palavras: *"duas portas para o mesmo fluxo fazem a escolha de qual
// animal voltar a ser uma pergunta justamente onde ela nao precisa ser
// feita"*. Nao e um conserto, e um produto diferente, e ele custaria o defeito
// que a outra isca ja cobra.
//
// O QUE A APOSENTADORIA AINDA NAO FEZ, dito e nao escondido: `TelaDeQuemEOCaso`
// e `Rotas.escolherPetPerdido` **continuam no aplicativo**. Tira-las exige
// `app/lib/roteamento/rotas.dart`, que esta em reestruturacao por outra frente
// nesta mesma rodada, e remover rota registrada enquanto outro ramo a reescreve
// e como se perde trabalho alheio. A rota ficar registrada nao custa nada a
// quem usa: nenhum `push` do produto a alcanca (`grep -rn 'escolherPetPerdido'
// app/lib` acha so a declaracao), e `meus_pets_test.dart` cobra que ela
// continue registrada justamente para a porta de T.1 nao empurrar para o
// vazio. A remocao e um commit proprio, da sessao que mexe no roteador.
//
// O RESTO DO ARQUIVO FOI REPONTADO e mede o fluxo pela porta nova: nove casos
// entram por `abrirAPaginaDoPet` e seguem para F3.1 -- que e exatamente onde
// a porta antiga tambem caia quando havia UM pet elegivel, porque ali ela
// tambem saltava F3.0 (criterio 1). Para esses nove nada se perdeu: mesmo
// destino, mesma afirmacao, porta nova.
/// Os casos de F3.0 ficam PARADOS, e desde 18/10/2026 por DECISAO e nao por
/// pendencia.
///
/// O nome continua o mesmo porque o fato continua o mesmo -- F3.0 nao tem
/// porta --, e o que mudou e que ninguem mais espera que ela volte. Ver o
/// bloco acima: a escolha de qual animal passou a acontecer por navegacao, e a
/// medicao que sustenta isso e um caso vivo deste arquivo.
///
/// **Trocar isto por `false` nao ressuscita os casos**: sem porta eles
/// reprovam por nao achar a tela. Quem reabrir F3.0 reabre a porta primeiro.
const bool _f30SemPorta = true;

/// Um `open_case_id` plausivel, para o caso do criterio 13.
///
/// T.1 le `status` E `open_case_id` (ver `_jaProcurado` em
/// `tela_detalhe_do_pet.dart`): os dois dizem a mesma coisa quando o servidor
/// esta consistente, e o duble manda os dois para nao deixar passar a tela que
/// le so um deles.
const String _idDoCaso = '7a2b9c10-0000-7000-8000-0000000000aa';

/// Abre a PAGINA DO PET (T.1), onde a porta de `Marcar como perdido` mora
/// desde 18/10.
///
/// Entra pela ROTA, e nao tocando no cartao de `Meus pets`, pelo mesmo motivo
/// que `qr_do_pet_na_pagina_test.dart` ja adotou: a tela inicial do `Perfil`
/// virou so menus no mesmo dia, e uma isca que entrasse por ela passaria a
/// reprovar por causa da reescrita da OUTRA tela, que nao e o que estes casos
/// medem. Que o cartao leva a T.1 e medido onde isso e o assunto
/// (`perfil_so_menus_nada_perdido_test.dart`); aqui o assunto e F3.1 em
/// diante.
Future<void> abrirAPaginaDoPet(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  String petId = 'p-1',
  RegiaoDeReferencia? regiao,
  DepositoDaFilaEmMemoria? fila,
  Avisos? avisos,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(regiaoDeReferencia: regiao),
    depositoDaFila: fila,
    avisos: avisos,
  );
  await irPara(tester, Rotas.detalheDoPetDe(petId));
}

/// A porta, **como ela e hoje**: a acao na pagina do pet.
///
/// Trocada em 18/10, na mescla do lote de tres ramos. Ela era
/// `MeusPets.rotuloDeMarcarPerdido`, em `Perfil` > `Meus pets`, e aquela acao
/// nao existe mais -- saiu em `perfil-dados-pessoais` no mesmo dia em que a
/// nova nasceu em `feat/qr-e-perdido-na-pagina-do-pet`. Os dois lados so
/// existem juntos NESTA arvore, e nenhum dos dois autores podia repontar isto.
///
/// As duas constantes valem a MESMA frase (`TextosDoDetalhe.marcarComoPerdido`
/// e apelido de `TelaDeQuemEOCaso.titulo`), entao a troca nao e cosmetica: o
/// que muda e a TELA em que a frase e procurada, e por isso o finder antigo
/// encontrava texto nenhum na arvore mesclada.
Finder get _porta => find.text(TextosDoDetalhe.marcarComoPerdido);

/// A porta ANTIGA, so para medir que ela nao voltou a `Meus pets`.
Finder get _portaAntiga => find.text(MeusPets.rotuloDeMarcarPerdido);

/// Rola ate a opcao e toca nela.
///
/// O `Quando?` fica abaixo da dobra em F3.1: o `ListView` so constroi o que
/// cabe na tela, e um `tap` num widget que ainda nao foi construido reprova
/// por um motivo que nao e o do caso.
Future<void> tocarNaOpcao(WidgetTester tester, String rotulo) async {
  await rolarAte(tester, find.text(rotulo));
  await tocar(tester, find.text(rotulo));
}

void main() {
  // -------------------------------------------------------------------------
  // ISCA 3 — acao com destino
  // -------------------------------------------------------------------------
  group('acao com destino: a barra nao oferece caminho que nao existe', () {
    testWidgets('conta sem pet nenhum nao tem porta para o fluxo',
        (tester) async {
      // REPONTADO em 18/10. A porta mudou de tela, e a cadeia tambem: ela
      // agora e cartao de `Meus pets` -> pagina do pet -> acao. Sem pet nao
      // ha CARTAO, e e por isso que nao ha porta -- medir so a ausencia do
      // rotulo no `Perfil` deixaria de discriminar, porque depois da reescrita
      // em menus aquele rotulo nunca aparece ali, com pet ou sem.
      await abrirOPerfil(tester, rede: servidorCom(<Map<String, dynamic>>[]));

      expect(
        find.byType(CartaoDePet),
        findsNothing,
        reason: 'REPROVA: apareceu cartao de pet numa conta sem pet. O cartao '
            'e o UNICO caminho do app ate a pagina do pet, e a pagina do pet '
            'e onde `Marcar como perdido` mora desde 18/10: um cartao a mais '
            'aqui e uma porta para T.1 de um animal que nao existe.',
      );
      expect(
        _portaAntiga,
        findsNothing,
        reason: 'REPROVA: a acao apareceu numa conta sem pet. Ela abriria '
            'F3.0 com zero opcoes, ou F3.1 sem saber de qual animal fala. E o '
            'mesmo criterio 2 da BICHUS-62 que segurou esta acao ate hoje: '
            'nao se renderiza acao sem destino, nem desabilitada.',
      );
    });

    testWidgets('pet que JA tem caso aberto nao reabre a acao (criterio 13)',
        (tester) async {
      // REPONTADO em 18/10, para a TELA onde a acao mora agora. O criterio 13
      // e o mesmo e a afirmacao e a mesma; o que mudou e quem responde por
      // ela. `status: 'lost'` E `open_case_id` juntos de proposito: T.1 le os
      // DOIS campos, e um duble que mandasse so um deixaria passar a tela que
      // le so o outro.
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex', status: 'lost', casoAberto: _idDoCaso),
        ]),
      );

      expect(
        _porta,
        findsNothing,
        reason: 'REPROVA: o unico pet da conta ja esta sendo procurado, e a '
            'acao apareceu assim mesmo. O teto e de UM caso aberto por pet '
            '(criterio 8), e a tela precisa refletir o teto em vez de deixar '
            'a pessoa bater nele depois de duas telas e um 409.',
      );
      // O CONTRAPESO. Sem ele este caso passaria numa tela que nao desenhou
      // nada -- erro de rede, pet nao carregado, qualquer coisa --, e um
      // `findsNothing` sobre tela vazia e o que o criterio 13 NAO pede: ele
      // pede que a tela REFLITA o teto, dito em texto e fora de controle.
      expect(
        find.text('Rex: ${TelaDeQuemEOCaso.jaProcurado}'),
        findsOneWidget,
        reason: 'REPROVA: a acao nao apareceu, mas a tela tambem nao disse '
            'que o animal ja esta sendo procurado. Esconder sem explicar e o '
            'desenho preguicoso que o criterio 5 recusa, e deixaria este caso '
            'verde sobre uma tela que simplesmente nao carregou.',
      );
    });

    testWidgets('as rotas que a acao empurra estao registradas no roteador',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
        ]),
      );
      final rotas = rotasRegistradasDoApp(tester);

      // Lidas do roteador montado, e nao de uma lista a mao: uma lista a mao
      // continuaria dizendo que a rota existe no dia em que alguem a
      // apagasse, e a barra de acao ficaria empurrando para o vazio.
      for (final rota in <String>[
        Rotas.escolherPetPerdido,
        Rotas.marcarPerdido,
        Rotas.marcarPerdidoAlcance,
        Rotas.casoAberto,
      ]) {
        expect(
          rotas,
          contains(rota),
          reason: 'REPROVA: `$rota` nao esta registrada. A barra de acao '
              'fixa empurra para ela, e um `push` para rota inexistente '
              'deixa a pessoa numa tela de erro do roteador no meio do pior '
              'momento do produto.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 1 — so o pet do chamador
  // -------------------------------------------------------------------------
  group('so o pet do chamador chega a F3.1', () {
    testWidgets('F3.0 oferece exatamente os pets que `GET /pets` devolveu',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      expect(find.text(TelaDeQuemEOCaso.pergunta), findsOneWidget);
      expect(find.text('Rex'), findsOneWidget);
      expect(find.text('Bili'), findsOneWidget);
      expect(
        find.text('Thor'),
        findsNothing,
        reason: 'REPROVA: apareceu na escolha um pet que o servidor nao '
            'devolveu para esta conta. A lista de F3.0 e a resposta de '
            '`listMyPets` da sessao em pe, e nao ha outra porta.',
      );
    }, skip: _f30SemPorta);

    testWidgets('a rota de F3.1 recusa um `extra` que nao e o rascunho',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );

      // O id cru de um pet que nao e da pessoa. **Esta e a unica forma de
      // chegar em F3.1 por fora da porta**, e ela precisa dar em nada.
      await irPara(tester, Rotas.marcarPerdido, extra: 'p-de-outra-pessoa');

      expect(
        find.text(TelaOndeEQuando.perguntaDeOnde),
        findsNothing,
        reason: 'REPROVA: F3.1 abriu com um `extra` que nao e um '
            '`RascunhoDoCaso`. O rascunho carrega o objeto `Pet` inteiro, e '
            'esse objeto so existe porque veio de `GET /pets` da sessao em '
            'pe. Aceitar um id solto abriria o formulario para um animal que '
            'o chamador nao possui -- e o 403 do criterio 12 chegaria duas '
            'telas depois, com o alerta ja escrito.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — data no futuro
  // -------------------------------------------------------------------------
  group('data no futuro', () {
    testWidgets('`Continuar` fica desabilitado com o motivo visivel',
        (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
        // Com regiao, o bairro ja vem preenchido e o unico impedimento que
        // sobra e o da data -- que e o que este caso mede.
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );
      await tocar(tester, _porta);

      // Um pet so: F3.0 nao aparece, e a tela e F3.1 direto.
      expect(find.text(TelaOndeEQuando.perguntaDeOnde), findsOneWidget);

      await tocarNaOpcao(tester, 'Outra data');
      // O calendario do M3 abre; o que importa aqui e que ele **nao oferece o
      // futuro**. Fecha sem escolher: o estado legitimo entre tocar e
      // responder.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: `Continuar` ficou habilitado com `Outra data` '
            'escolhida e nenhuma data respondida. O caso seria gravado com '
            'uma data que ninguem escolheu.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Criterio 2 — de onde vem o bairro
  // -------------------------------------------------------------------------
  group('criterio 2: o bairro ja preenchido, e de onde ele vem', () {
    testWidgets('a regiao de referencia do tutor preenche os campos',
        (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );
      await tocar(tester, _porta);

      // **Nao houve geocodificacao** (ADR-0006): o texto saiu de
      // `Me.reference_area`, que o proprio tutor cadastrou. Coordenada nao
      // vira nome de bairro neste produto.
      expect(find.text('Vila Madalena'), findsOneWidget);
      expect(find.text('São Paulo'), findsOneWidget);
    });

    testWidgets('sem regiao cadastrada o campo abre vazio', (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );
      await tocar(tester, _porta);

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      expect(botao.aoTocar, isNull);
      expect(
        find.text('Precisamos do bairro para avisar quem está por perto.'),
        findsOneWidget,
        reason: 'REPROVA: o botao esta desabilitado e o motivo nao esta na '
            'tela. O criterio 5 exige o motivo VISIVEL ao lado do botao: '
            'desabilitar sem dizer por que e desenho preguicoso.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Criterio 6 + ISCA 4 — a fila, e o que a tela diz sobre ela
  // -------------------------------------------------------------------------
  group('na fila nao e aberto', () {
    testWidgets(
        'sem conexao o envio vai para a fila e F3.3 diz que esta na fila',
        (tester) async {
      final fila = DepositoDaFilaEmMemoria();
      final chamadas = <String>[];

      await abrirAPaginaDoPet(
        tester,
        fila: fila,
        rede: (req) async {
          chamadas.add('${req.method} ${req.url.path}');
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
            });
          }
          // A PAGINA DO PET PRECISA CARREGAR ANTES DA PORTA SER TOCADA.
          // Acrescentado em 18/10, quando a acao mudou de tela: T.1 le o pet e
          // as plaquinhas ao nascer, e sem estas respostas a tela mostraria
          // falha de conexao e a porta nao existiria para tocar.
          //
          // O `sem rede` que a isca mede CONTINUA valendo para o que vem
          // DEPOIS da porta -- `lost-case-preview` e o `POST .../lost-cases`
          // caem no `throw` abaixo, que e o ponto do caso.
          if (req.url.path == '/v1/pets/p-1' && req.method == 'GET') {
            return json200(pet(id: 'p-1', nome: 'Rex'));
          }
          if (req.url.path == '/v1/pets/p-1/tags' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          if (req.url.path.endsWith('/reference-data') &&
              req.method == 'GET') {
            return json200(referenciaDeTeste());
          }
          // **Sem sinal daqui para a frente.** `ClientException` e o que o
          // `ApiClient` traduz para `FalhaDeConexao`.
          throw http.ClientException('sem rede');
        },
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );

      // F3.2 com a previa que nao carregou: variante D, e nenhum numero.
      expect(find.text(TelaAlcanceDoAlerta.tituloIndisponivel), findsOneWidget);

      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      // ------------------------------------------------------------------
      // A ISCA, nas duas metades que ela precisa ter.
      // ------------------------------------------------------------------
      expect(
        find.text(TelaCasoAberto.tituloNaFila),
        findsOneWidget,
        reason: 'REPROVA: o envio caiu na fila e a tela nao disse isso.',
      );
      expect(
        find.text(TelaCasoAberto.tituloAberto),
        findsNothing,
        reason: 'REPROVA: a tela disse que o caso esta ABERTO e ele nao '
            'esta -- ele esta gravado no aparelho esperando sinal. O '
            'criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao '
            'aconteceu: quem le "o caso esta aberto" para de procurar '
            'caminho, e o alerta ainda nao saiu de dentro do elevador.',
      );

      // E a fila de fato ficou com a acao, com o caminho e o corpo do
      // contrato.
      expect(fila.acoes, hasLength(1));
      final acao = fila.acoes.single;
      expect(acao['caminho'], '/pets/p-1/lost-cases');
      expect(acao['metodo'], 'POST');
      final corpo = Map<String, dynamic>.from(acao['corpo'] as Map);
      expect(corpo['last_seen_at'], isA<String>());
      expect(
        Map<String, dynamic>.from(corpo['last_seen_area'] as Map)['city'],
        'São Paulo',
      );
      expect(
        corpo['share_to_public_list'],
        isTrue,
        reason: 'Criterio 10: o padrao e verdadeiro, e o corpo DECLARA o '
            'campo em vez de depender do default do servidor.',
      );
      expect(
        (acao['idempotency_key'] as String).isNotEmpty,
        isTrue,
        reason: 'REPROVA: a acao foi enfileirada sem `Idempotency-Key`. O '
            'reenvio precisa usar a chave da PRIMEIRA tentativa (criterio 13 '
            'da BICHUS-31): sem ela, cada reenvio e um pedido novo e os '
            'mesmos vizinhos recebem o mesmo alerta varias vezes.',
      );
    });

    testWidgets('o caso que ABRIU diz que abriu', (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
          casoCriado: <String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T12:00:00Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'no_location'},
          },
        ),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      expect(find.text(TelaCasoAberto.tituloAberto), findsOneWidget);
      expect(find.text(TelaCasoAberto.tituloNaFila), findsNothing);
      // Criterio 9: `has_location` falso explica por que nao houve alerta, em
      // vez de deixar a secao vazia.
      expect(find.textContaining('não vai ter alerta'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // O alcance que o servidor nao sabe
  // -------------------------------------------------------------------------
  group('alcance `unavailable`: a tela nao inventa numero', () {
    testWidgets('mostra a variante D e nenhum zero', (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
        ),
        regiao: const RegiaoDeReferencia(cidade: 'São Paulo'),
      );
      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );

      expect(find.text(TelaAlcanceDoAlerta.tituloIndisponivel), findsOneWidget);
      expect(
        find.textContaining('0 tutores'),
        findsNothing,
        reason: 'REPROVA: `unavailable` virou zero na tela. Sao respostas '
            'opostas: com zero contado a pessoa aprende que compartilhar '
            'alcanca mais gente hoje que o alerta; com "nao sei" ela nao '
            'aprende nada e nao desiste do alerta. O alcance dito com '
            'honestidade e a BICHUS-20, e esta tela nao antecipa o numero '
            'dela nem finge te-lo.',
      );
      // O botao continua oferecido: falha de calculo nao e bloqueio.
      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );
      expect(botao.aoTocar, isNotNull);
    });
  });

  // -------------------------------------------------------------------------
  // F3.0 — a escolha com dois ou mais pets
  // -------------------------------------------------------------------------
  group('a escolha com dois ou mais pets', () {
    // -----------------------------------------------------------------------
    // A MEDICAO QUE APOSENTOU F3.0 (18/10/2026)
    // -----------------------------------------------------------------------
    //
    // **Este caso NAO esta parado**, e e o unico deste grupo que roda. Ele
    // mede o que o aplicativo faz hoje com dois ou mais pets elegiveis, que e
    // a pergunta que a decisao sobre F3.0 dependia de responder.
    //
    // Tres pets na conta, todos elegiveis. A pessoa entra pela pagina do
    // SEGUNDO (`p-2`, Bili) -- o caminho real e cartao de `Meus pets` ->
    // T.1 --, toca em `Marcar como perdido`, e o fluxo nasce ligado a Bili:
    // F3.0 nao aparece, F3.1 traz o nome dele no topo, e Rex e Thor nao estao
    // na tela.
    //
    // E por isso que F3.0 se aposentou em vez de recuperar uma porta: a
    // escolha de qual animal **ja aconteceu**, por navegacao, antes do fluxo
    // comecar. Ver o bloco `PARADO, E NAO APAGADO` no topo do arquivo.
    //
    // O QUE ESTE CASO REPROVA SE O PRODUTO MUDAR: se alguem religar uma porta
    // de LISTA para este fluxo, o pet deixa de vir ligado e as duas ultimas
    // assercoes caem. A decisao de aposentar F3.0 deixa de valer no mesmo
    // instante, e este caso e quem avisa.
    testWidgets('com 2+ pets a escolha JA aconteceu: F3.1 nasce ligada ao pet '
        'da pagina', (tester) async {
      await abrirAPaginaDoPet(
        tester,
        petId: 'p-2',
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
          pet(id: 'p-3', nome: 'Thor'),
        ]),
      );
      await tocar(tester, _porta);

      expect(
        find.byType(TelaDeQuemEOCaso),
        findsNothing,
        reason: 'REPROVA: F3.0 apareceu com a pessoa vindo da pagina de UM '
            'animal. Perguntar "de quem e o caso?" a quem acabou de abrir a '
            'pagina do Bili e perguntar o que ela ja respondeu.',
      );
      expect(
        find.text(TelaOndeEQuando.perguntaDeOnde),
        findsOneWidget,
        reason: 'REPROVA: a acao da pagina do pet nao levou a F3.1. Com F3.0 '
            'fora do caminho, F3.1 e o primeiro passo do fluxo.',
      );
      expect(
        find.text('Bili'),
        findsOneWidget,
        reason: 'REPROVA: F3.1 nao nasceu ligada ao pet da pagina. E o '
            'deslize do criterio 1 da BICHUS-21 -- marcar o pet errado quando '
            'ha mais de um -- acontecendo pelo caminho novo, e ele seria '
            'motivo para repor F3.0 em vez de aposenta-la.',
      );
      for (final outro in <String>['Rex', 'Thor']) {
        expect(
          find.text(outro),
          findsNothing,
          reason: 'REPROVA: "$outro" esta na tela do caso do Bili. Dois nomes '
              'de animal no topo de F3.1 e a pergunta de F3.0 voltando pela '
              'porta de tras, sem radio e sem `Continuar`.',
        );
      }
    });

    testWidgets('nasce sem nada marcado, com o motivo do botao desabilitado',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: `Continuar` nasceu habilitado. Com um radio ja '
            'marcado no primeiro da lista, o deslize que o criterio 1 quer '
            'prevenir -- marcar o pet errado quando ha mais de um -- passa a '
            'custar um toque so.',
      );
      expect(find.text(TelaDeQuemEOCaso.semEscolha), findsOneWidget);
    }, skip: _f30SemPorta);

    testWidgets('escolher leva F3.1 com o pet escolhido no topo',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);
      await tocar(tester, find.text('Bili'));
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );

      expect(find.text(TelaOndeEQuando.perguntaDeOnde), findsOneWidget);
      expect(
        find.text('Bili'),
        findsOneWidget,
        reason: 'Criterio 1: a foto e o nome do pet no topo, "para prevenir '
            'o deslize de marcar o pet errado quando ha mais de um".',
      );
      expect(find.text('Rex'), findsNothing);
    }, skip: _f30SemPorta);

    testWidgets('o pet ja perdido aparece, e fora do grupo de opcoes',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
          pet(id: 'p-3', nome: 'Thor', status: 'lost'),
        ]),
      );
      await tocar(tester, _porta);

      expect(
        find.textContaining('Thor'),
        findsOneWidget,
        reason: 'Criterio 13: a tela reflete o teto de um caso por pet em vez '
            'de deixar a pessoa bater nele.',
      );
      // Ele existe na tela e **nao** e escolhivel: tocar nele nao habilita o
      // botao.
      await tocar(tester, find.textContaining('Thor'));
      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaDeQuemEOCaso.rotuloDeContinuar),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: um pet que ja esta sendo procurado virou opcao. O '
            'caminho termina em 409 depois de duas telas.',
      );
    }, skip: _f30SemPorta);
  });

  // -------------------------------------------------------------------------
  // Acessibilidade — o defeito `btn=true tap=false`
  // -------------------------------------------------------------------------
  group('acessibilidade: nenhum controle se anuncia sem entregar o toque', () {
    testWidgets('a arvore de semantica do app montado nao tem botao mudo',
        (tester) async {
      await abrirAPaginaDoPet(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[
          pet(id: 'p-1', nome: 'Rex'),
          pet(id: 'p-2', nome: 'Bili'),
        ]),
      );
      await tocar(tester, _porta);

      final handle = tester.ensureSemantics();
      try {
        final mudos = <String>[];
        void visitar(SemanticsNode no) {
          final d = no.getSemanticsData();
          final bandeiras = d.flagsCollection;
          final ehBotao =
              bandeiras.isButton || bandeiras.isInMutuallyExclusiveGroup;
          final temToque = d.hasAction(SemanticsAction.tap);
          // Desabilitado **de proposito** nao e defeito: ele se anuncia como
          // controle e diz que nao esta disponivel. O defeito e prometer
          // acao e nao entregar como aciona-la.
          final desabilitado = bandeiras.isEnabled == Tristate.isFalse;
          if (ehBotao && !temToque && !desabilitado) {
            mudos.add('"${d.label}"');
          }
          no.visitChildren((filho) {
            visitar(filho);
            return true;
          });
        }

        visitar(tester.binding.rootElement!.renderObject!.debugSemantics!);
        expect(
          mudos,
          isEmpty,
          reason: 'REPROVA: ${mudos.join(', ')} se anuncia(m) como controle '
              'sem acao de toque (`btn=true tap=false`, WCAG 2.1 SC 4.1.2). '
              'Quem usa VoiceOver ou TalkBack ouve "botao" e nao tem como '
              'aciona-lo. Este defeito ja foi encontrado quatro vezes neste '
              'app, sempre por `excludeSemantics` apagando o `onTap` do '
              'filho: a correcao e REDECLARAR `onTap` no `Semantics` de fora.',
        );
      } finally {
        handle.dispose();
      }
    });
  });

  // -------------------------------------------------------------------------
  // A fila sai com a conta
  // -------------------------------------------------------------------------
  group('a fila offline morre no logout', () {
    testWidgets('o arquivo fica vazio depois de sair da conta', (tester) async {
      final fila = DepositoDaFilaEmMemoria();
      await abrirAPaginaDoPet(
        tester,
        fila: fila,
        rede: (req) async {
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
            });
          }
          if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
            return http.Response('', 204);
          }
          // A PAGINA DO PET PRECISA CARREGAR ANTES DA PORTA SER TOCADA.
          // Acrescentado em 18/10, quando a acao mudou de tela: T.1 le o pet e
          // as plaquinhas ao nascer, e sem estas respostas a tela mostraria
          // falha de conexao e a porta nao existiria para tocar.
          //
          // O `sem rede` que a isca mede CONTINUA valendo para o que vem
          // DEPOIS da porta -- `lost-case-preview` e o `POST .../lost-cases`
          // caem no `throw` abaixo, que e o ponto do caso.
          if (req.url.path == '/v1/pets/p-1' && req.method == 'GET') {
            return json200(pet(id: 'p-1', nome: 'Rex'));
          }
          if (req.url.path == '/v1/pets/p-1/tags' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          if (req.url.path.endsWith('/reference-data') &&
              req.method == 'GET') {
            return json200(referenciaDeTeste());
          }
          throw http.ClientException('sem rede');
        },
        regiao: const RegiaoDeReferencia(cidade: 'São Paulo'),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      // A isca so vale se o cenario de fato encheu a fila.
      expect(
        fila.acoes,
        hasLength(1),
        reason: 'A isca nao entrou no cenario: a fila precisa ter conteudo '
            'ANTES do logout, senao o caso mede um arquivo que ja estava '
            'vazio e fica verde por nada.',
      );

      // Sai pelo CONTROLADOR, e nao pelo botao: os quatro desfechos de
      // `sair()` passam por la, inclusive o refresh recusado, que nao passa
      // por tela nenhuma.
      final escopo = escopoDoApp(tester);
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        fila.acoes,
        isEmpty,
        reason: 'REPROVA: a fila sobreviveu ao logout. O corpo de cada acao '
            'carrega o que a tutora digitou -- nome do pet, endereco de '
            'referencia, telefone de contato -- e isso esta EM DISCO. '
            'Sobrevivendo a saida, esses dados esperam no aparelho a proxima '
            'pessoa que entrar nele, e o aparelho compartilhado e caso real '
            'no publico deste produto. A entrada e `_fila.limpar` na lista '
            '`limpezasAoSair` de `lib/app.dart`.',
      );
      expect(
        jsonDecode(fila.conteudo ?? '[]'),
        isEmpty,
        reason: 'REPROVA: a lista em memoria esvaziou e o ARQUIVO nao. A '
            'leitura seguinte traria tudo de volta, e o logout teria '
            'parecido funcionar.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // F3.3 sem `extra`
  // -------------------------------------------------------------------------
  group('F3.3 nao inventa desfecho', () {
    testWidgets('alcancada sem resultado, ela nao afirma nada', (tester) async {
      await abrirOPerfil(
        tester,
        rede: servidorCom(<Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')]),
      );
      await irPara(tester, Rotas.casoAberto);

      expect(
        find.text(TelaCasoAberto.tituloAberto),
        findsNothing,
        reason: 'REPROVA: F3.3 alcancada por link direto, sem resultado '
            'nenhum, afirmou que ha um caso aberto. E a mesma mentira do '
            'criterio 2 da BICHUS-31, por outra porta -- e esta porta e '
            'publica: F5 entrega uma URL com o app fechado.',
      );
      expect(find.text(TelaCasoAberto.tituloNaFila), findsNothing);
    });
  });
  // -------------------------------------------------------------------------
  // COSTURA DA INTEGRACAO DE 22/09 - a segunda oportunidade ganhou chamador
  // -------------------------------------------------------------------------
  group('a segunda oportunidade de aviso tem chamador de PRODUCAO', () {
    // A BICHUS-24 entregou o mecanismo com dois gatilhos, e o segundo
    // (`primeiroCasoDePerdido`) so existia em teste: a unica coisa que
    // chamava `PedidoDeAviso.oferecer` com ele era o proprio caso da 24.
    // A chamada de producao mora em F3.2, e ficou comentada ate a BICHUS-24 e
    // a BICHUS-21 estarem na mesma arvore.
    //
    // Este caso atravessa o fluxo inteiro pela interface -- F3.0, F3.1, F3.2 e
    // o toque em `Avisar` -- e cobra a antessala DEPOIS da abertura. Ele
    // reprova se alguem comentar a chamada de novo, e e por isso que ele
    // dirige a tela em vez de chamar `oferecer` direto.
    testWidgets('abrir o caso em F3.2 oferece a antessala da segunda',
        (tester) async {
      await abrirAPaginaDoPet(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        rede: servidorCom(
          <Map<String, dynamic>>[pet(id: 'p-1', nome: 'Rex')],
          previa: <String, dynamic>{
            'reach_status': 'unavailable',
            'radius_m': 5000,
            'blockers': <dynamic>[],
          },
          casoCriado: <String, dynamic>{
            'id': 'c-1',
            'pet_id': 'p-1',
            'status': 'open',
            'opened_at': '2026-09-22T12:00:00Z',
            'has_location': false,
            'alert': <String, dynamic>{'reach_status': 'no_location'},
          },
        ),
        regiao: const RegiaoDeReferencia(
          bairro: 'Vila Madalena',
          cidade: 'São Paulo',
          uf: 'SP',
        ),
      );

      await tocar(tester, _porta);
      await tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      final avisar =
          find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar);
      await tester.ensureVisible(avisar);
      await tester.pumpAndSettle();
      await tester.tap(avisar);

      // `pump` e nao `pumpAndSettle`, e o motivo e o proprio desenho da tela:
      // enquanto a folha esta aberta o envio de F3.2 segue "em curso" e o
      // indicador de progresso continua girando. `pumpAndSettle` esperaria
      // uma animacao que so termina quando a pessoa responde a folha -- que e
      // exatamente o que este caso quer observar antes de responder.
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(
        find.text(TextosDaAntessala.tituloDaSegunda('Rex')),
        findsOneWidget,
        reason: 'REPROVA: o caso abriu e a segunda antessala nao apareceu. '
            'A UX 10.4 da BICHUS-24 diz que a segunda das DUAS chances e '
            'oferecida no primeiro caso de perdido; se ela so aparece quando '
            'um teste chama `PedidoDeAviso.oferecer` na mao, o gatilho nao '
            'existe para quem usa o app.',
      );
    });
  });
}
