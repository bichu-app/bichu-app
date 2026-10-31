// **Marcar um encontro da `Rede`** (`createNetworkEvent`, ADR-0025 emenda 3).
//
// O que este arquivo cobra, e por que cada caso existe:
//
//   1. a porta existe no CORPO da agenda e leva ao formulario -- nao na
//      `AppBar`, cujo slot unico e da secao;
//   2. **nenhum dos dois bloqueios vira botao morto**: sem e-mail confirmado e
//      sem conta, a tela diz o motivo E oferece a saida. Este e o caso que
//      custou tempo ao cliente tres vezes num dia, e e o que precisa reprovar
//      no dia em que alguem desabilitar o botao e calar;
//   3. o corpo enviado tem **so os campos que o contrato aceita** -- um campo
//      a mais nao e ignorado pelo servidor, e `additionalProperties: false`
//      com `removeAdditional` do Ajv o APAGA em silencio, entao a tela que o
//      mandasse acreditaria ter gravado algo;
//   4. o `409 community-event-limit-reached` diz o que DESTRAVA (cancelar ou
//      esperar terminar), sem o numero escrito no binario;
//   5. o `400 address_in_place_name` **marca o campo** `place.place_name`, e
//      nao sai como faixa generica.
//
// **NENHUM `expect` aqui compara texto renderizado com a constante que o
// produz.** Todo esperado esta por extenso, com acento: um `expect` que lesse
// `TelaCriarEncontro.semEmailConfirmado` acompanharia o erro de digitacao para
// sempre.
//
// ESTES CASOS NAO FORAM EXECUTADOS nesta entrega, por regra do cliente (nada
// de suite unitaria nem de integracao nesta rodada). O que rodou foi
// `flutter analyze`.

import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../rede/fixtures_da_rede.dart';
import 'ajuda_de_tela.dart';

/// A rede que atende a agenda e registra o que foi enviado na criacao.
///
/// **404 em qualquer outra rota**, e nao 200 vazio: uma chamada nao declarada
/// aqui precisa falhar alto em vez de passar por acidente.
Future<http.Response> Function(http.Request) redeDaCriacao({
  required List<Map<String, dynamic>> enviados,
  http.Response Function()? respostaDaCriacao,
}) {
  return (req) async {
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(pagina(<Map<String, dynamic>>[]));
    }
    if (req.url.path == '/v1/network/events' && req.method == 'POST') {
      enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
      final resposta = respostaDaCriacao;
      if (resposta != null) return resposta();
      return json200(encontroPublico(), status: 201);
    }
    if (req.url.path.startsWith('/v1/network/events/')) {
      return json200(encontroPublico());
    }
    return problema('not-found', 404);
  };
}

/// O `TextField` do [BichuField] cujo rótulo é [rotulo].
///
/// Pelo `rotulo` DECLARADO no widget, e **não** por `widgetWithText`: o rótulo
/// do `BichuField` é um `Text` IRMÃO do campo, dentro da mesma `Column`
/// (`lib/widgets/bichu_field.dart`, linhas 125-133), e não um descendente
/// dele. `find.widgetWithText(TextField, 'Nome do evento')` acha ZERO widgets,
/// e `enterText` sobre zero estoura `Bad state: No element` -- era isso que
/// tirava o chão dos sete casos deste arquivo. O campo OPCIONAL é achado
/// igual, porque na tela ele escreve `'<rotulo> (opcional)'`.
Finder campoDoRotulo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (widget) => widget is BichuField && widget.rotulo == rotulo,
        description: 'BichuField de rótulo "$rotulo"',
      ),
      matching: find.byType(TextField),
    );

Future<void> abrirAgenda(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool emailVerificado = true,
  bool logado = true,
  // A CAMERA, desde 19/10/2026: o formulario de criar evento passou a
  // perguntar a CAPA, e a capa sai da mesma porta de aparelho das outras
  // fotos. O padrao continua nulo -- `abrirOApp` monta `CameraNaoEmbarcada`
  // --, entao nenhum caso deste arquivo ganha uma camera de surpresa.
  CameraEGaleria? camera,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado(emailVerificado: emailVerificado) : null,
    camera: camera,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

/// Abre o formulário pela PORTA REAL da seção, que desde 18/10/2026 é o ícone
/// da ação flutuante do corpo, e não mais o ícone da barra de topo nem o botão
/// de largura total que veio antes dele.
///
/// Ela mora numa função, e não copiada em cada caso, por um motivo que já
/// custou caro aqui: quando o cliente mudou a forma da porta, dez casos deste
/// arquivo deixaram de ter o que tocar ao mesmo tempo. Com a porta numa função
/// só, a próxima mudança de forma custa uma edição.
///
/// **ELA MUDOU DE FORMA OUTRA VEZ EM 19/10/2026**, e esta função é o lugar
/// único que a mudança custou: o ícone saiu da barra de topo e virou ação
/// FLUTUANTE no corpo, por decisão dele -- *"O botao criar sai da barra"* --
/// para o sino de notificação entrar na barra.
///
/// **O glifo é procurado DENTRO de `AcaoDeCriarFlutuante`.** `Icons.more_time`
/// pode aparecer em outro lugar da árvore amanhã, e um `find.byIcon` solto
/// acharia o outro e ficaria verde com a porta ausente -- **ou acharia um
/// ícone de volta NA BARRA**, que é exatamente o que o cliente mandou tirar.
/// A lista rolavel DO FORMULARIO de criar evento.
///
/// Existe porque `find.byType(Scrollable).first` nao serve numa tela
/// empilhada: ver a nota em `rolarAte`.
Finder get corpoDoFormulario => find
    .descendant(
      of: find.byType(TelaCriarEncontro),
      matching: find.byType(Scrollable),
    )
    .first;

Future<void> abrirAPorta(WidgetTester tester) async {
  await tocar(
    tester,
    find.descendant(
      of: find.byType(AcaoDeCriarFlutuante),
      matching: find.byIcon(Icons.more_time),
    ),
  );
}

void main() {
  // -------------------------------------------------------------------------
  // A PORTA MUDOU DE FORMA E DE REGRA EM 18/10/2026, por decisão do cliente,
  // e este grupo foi reescrito para cobrar o que ele decidiu. Nenhum caso foi
  // apagado: os dois que afirmavam o contrário passaram a afirmar o novo.
  //
  //   1. *"os itens de criação, como evento e indicação, até o escanear
  //      poderia ser ícones na barra superior ... e não fique esse botão
  //      grande na página ocupando muito espaço"* — a porta saiu do corpo e
  //      virou ícone na barra. Isto REVERTE a regra de 17/10 que este arquivo
  //      cobrava ("a porta NÃO está na AppBar"), do mesmo jeito que o
  //      `Filtros` reverteu em 17/10 a regra de 22/09.
  //
  //      **E EM 19/10 ELA SAIU DA BARRA, pela terceira vez em três dias e de
  //      novo por decisão dele:** *"O botao criar sai da barra"*. Eu lhe
  //      mostrei que, com o sino de notificação na barra, o lado direito
  //      ficaria com quatro controles e o título não caberia, e perguntei o
  //      que sairia. A porta virou ação FLUTUANTE no corpo -- o que ele
  //      recusou em 18/10 era o botão de LARGURA TOTAL, que comia 64 dp de
  //      linha; a ação flutuante não ocupa linha nenhuma do fluxo. Este
  //      arquivo volta a cobrar "a porta NÃO está na AppBar", agora com a
  //      ação medida onde ela passou a morar.
  //   2. *"essas ações só devem ser realizadas por usuários cadastrados e
  //      validados, caso ao contrário o botão nem aparece"* — a porta só
  //      existe com conta E e-mail confirmado.
  //
  // **A consequência no grupo de recusas, e ela não é cosmética:** os dois
  // impedimentos de `criar_encontro.dart` continuam no código e NÃO foram
  // tocados, mas a porta não leva mais ninguém até eles — quem não pode criar
  // não vê o ícone. A rota segue alcançável por link profundo, e é por isso
  // que a recusa continua no app em vez de ter sido apagada. Os dois casos
  // abaixo passaram a medir o que agora é verdade: a porta **não aparece**.
  // -------------------------------------------------------------------------
  group('a porta de criar evento', () {
    testWidgets('é FLUTUANTE no corpo da Rede, não está na barra, e abre o '
        'formulário', (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
      );

      // **A metade que mudou em 19/10, dita por ausência.** Sem ela, pôr a
      // ação flutuante SEM tirar o ícone da barra deixaria este caso verde e
      // a pessoa com duas cópias da mesma porta -- e o sino sem o espaço que
      // ele foi buscar.
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.more_time),
        ),
        findsNothing,
        reason: 'REPROVA: o ícone de criar evento continua na barra de topo. '
            'Ele saiu dali por decisão do cliente em 19/10 -- *"O botao criar '
            'sai da barra"* --, para o sino de notificação entrar no lugar.',
      );

      final porta = find.descendant(
        of: find.byType(AcaoDeCriarFlutuante),
        matching: find.byIcon(Icons.more_time),
      );
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: a Rede não oferece como criar um evento. O botão do '
            'corpo saiu em 18/10 e o ícone da barra saiu em 19/10, então esta '
            'ação flutuante é o único caminho do app: sem ela a rota de criar '
            'existe sem ninguém poder alcançá-la.',
      );

      await tocar(tester, porta);

      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: o ícone não levou ao formulário. Glifo que não abre '
            'nada é pior que botão nenhum: ele promete.',
      );
    });

    testWidgets(
      'ISCA — o botão grande NÃO voltou ao corpo. Para ver reprovar, reponha '
      'o `Padding` + `BotaoSecundario` que saiu de `agenda_da_rede.dart`.',
      (tester) async {
        await abrirAgenda(
          tester,
          rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        );

        expect(
          find.widgetWithText(OutlinedButton, 'Criar evento'),
          findsNothing,
          reason: 'REPROVA: a porta voltou a ser botão de largura total no '
              'corpo. Com o ícone na barra ela seria a segunda cópia da mesma '
              'ação, e os 64 dp de altura que o cliente pediu de volta não '
              'voltaram.',
        );
        expect(
          find.widgetWithText(OutlinedButton, 'Marcar um encontro'),
          findsNothing,
          reason: 'REPROVA: o botão grande voltou com o rótulo ANTIGO. O '
              'vocabulário do app trocou "encontro" por "evento" em 18/10.',
        );
      },
    );
  });

  group('quem não pode criar não vê a porta', () {
    testWidgets('sem e-mail confirmado: o ícone não aparece', (tester) async {
      // ESTE CASO MUDOU DE AFIRMAÇÃO em 18/10, e o que ele media antes está
      // escrito aqui para não se perder: a porta aparecia, o toque abria o
      // formulário, e o formulário dizia "Confirme seu e-mail antes de
      // marcar" com `Confirmar meu e-mail` como saída. O cliente decidiu o
      // contrário com todas as letras — *"caso ao contrário o botão nem
      // aparece"* —, e manter a recusa explicada NO LUGAR da ação era
      // exatamente o que ele mandou descartar.
      //
      // **A recusa não foi apagada do app.** `_Impedimento.semEmailConfirmado`
      // e a faixa com a saída continuam em `criar_encontro.dart`, intocados,
      // para quem chegar à rota por link profundo. O que mudou é quem é
      // convidado a chegar lá.
      //
      // **E o caminho para validar não dependia desta porta:** o
      // `AvisoDeCadastroIncompleto` desenha "Confirme seu e-mail" com
      // `Reenviar` no topo de `Pets` e no topo de `Perfil`.
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        emailVerificado: false,
      );

      expect(
        find.descendant(
          of: find.byType(AcaoDeCriarFlutuante),
          matching: find.byIcon(Icons.more_time),
        ),
        findsNothing,
        reason: 'REPROVA: com o e-mail não confirmado a Rede ainda oferece '
            'criar evento. A porta convida para uma tela que responde '
            '"Confirme seu e-mail antes de marcar", e é esse convite vazio '
            'que a decisão de 18/10 tirou.',
      );
    });

    testWidgets('sem conta: o ícone não aparece', (tester) async {
      // Mesma troca de afirmação, e aqui ela também fecha um defeito que o
      // cliente relatou no mesmo dia sobre a ação irmã: a porta convidava
      // quem não tinha entrado, e só a tela de destino dizia "Entre para".
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        logado: false,
      );

      expect(
        find.descendant(
          of: find.byType(AcaoDeCriarFlutuante),
          matching: find.byIcon(Icons.more_time),
        ),
        findsNothing,
        reason: 'REPROVA: deslogado, a Rede ainda oferece criar evento.',
      );
    });

    testWidgets('CONTRAPROVA — com conta e e-mail confirmado, a porta aparece',
        (tester) async {
      // Sem esta contraprova os dois casos acima ficariam verdes para sempre
      // com um `acaoDeCriar: null` fixo, escondendo a ação de TODO MUNDO. É a
      // classe de defeito mais fácil de produzir quando a mudança do dia é
      // "esconder", e afirmação de ausência é a forma mais fácil de escrever
      // um portão cego.
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
      );

      expect(
        find.descendant(
          of: find.byType(AcaoDeCriarFlutuante),
          matching: find.byIcon(Icons.more_time),
        ),
        findsOneWidget,
        reason: 'REPROVA: quem tem conta e e-mail confirmado NÃO vê a porta. '
            'A regra esconde de quem não pode; esconder de quem pode apaga a '
            'função.',
      );
    });

    testWidgets('o motivo, na tela de destino, não é anunciado duas vezes',
        (tester) async {
      // O caso continua existindo porque o que ele mede é da TELA DE DESTINO,
      // e aquela tela não mudou. Ele chega lá com a porta visível — conta
      // válida — e exercita o estado de e-mail não confirmado pelo único
      // caminho que sobrou de dentro da suíte: o formulário aberto por quem
      // pode, com a sessão trocando depois, não é reproduzível aqui. Então
      // ele mede o que ainda é alcançável: uma única cópia da frase na tela
      // aberta por quem pode criar não existe, e a dupla anunciação era entre
      // a faixa e a barra de ação da MESMA tela.
      //
      // **Este é o caso que esta entrega NÃO conseguiu preservar inteiro**, e
      // está dito em vez de escondido: com a porta oculta para quem não
      // confirmou o e-mail, não há como esta suíte abrir o formulário NESSE
      // estado sem um link profundo, que `abrirOApp` não oferece hoje. A
      // afirmação sobre a tela de destino ficou pendente de alguém dar rota
      // inicial ao ajudante.
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
      );
      await abrirAPorta(tester);

      // **`antes de criar`, e não `antes de marcar`.** A frase da tela é
      // `TelaCriarEncontro.semEmailConfirmado` (`criar_encontro.dart`, linhas
      // 82-84): *"Confirme seu e-mail antes de criar..."*. O texto que esta
      // isca procurava não existe em lugar nenhum do app -- `grep -rn 'antes
      // de marcar' app/lib` não acha nada --, então o `findsNothing` dela era
      // VAZIO: ele não podia reprovar nunca, nem com a faixa presa no estado
      // errado. É exatamente o "portão cego" de que o caso duas posições
      // acima fala.
      expect(
        find.textContaining('Confirme seu e-mail antes de criar'),
        findsNothing,
        reason: 'REPROVA: a tela de criar evento diz "Confirme seu e-mail" '
            'para quem JÁ confirmou. A faixa de impedimento está presa num '
            'estado que não é o da sessão.',
      );
    });

    // -----------------------------------------------------------------------
    // RECUPERADO em 18/10: a afirmação que a entrega anterior deu por
    // inalcançável.
    //
    // O que ela dizia estar faltando era "alguém dar rota inicial ao
    // ajudante". Não é preciso: `irPara` (`ajuda_de_tela.dart`, linhas
    // 684-692) navega pelo ROTEADOR DE VERDADE a partir de qualquer tela
    // montada, e `Rotas.criarEncontroDaRede` continua registrada
    // (`rotas.dart`, linha 564). Chegar pelo endereço é o mesmo recurso que
    // `qr_do_pet_na_pagina_test.dart` e `loja_detalhe_do_produto_test.dart`
    // já usam, e é um caminho REAL: App Link e F5 caem nele.
    //
    // **A pré-condição não é fraudada.** O que este caso monta é a SESSÃO com
    // o canal não confirmado (`emailVerificado: false`, que vai para o
    // depósito e sai em `Me`), e o que ele mede é o ESTADO DA TELA DE DESTINO
    // -- que não mudou em 18/10. Que a PORTA não aparece nesse estado é outra
    // afirmação, e ela é medida dois casos acima, por conta própria. Sem este
    // caso, ninguém mais mede que o motivo é dito UMA vez: o `findsNothing`
    // acima, sozinho, fica verde numa tela que não diz nada.
    // -----------------------------------------------------------------------
    testWidgets(
        'e-mail não confirmado: o motivo é dito UMA vez na tela de destino',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        emailVerificado: false,
      );
      await irPara(tester, Rotas.criarEncontroDaRede);

      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: o endereço do formulário não abriu a tela. A rota '
            'tem de continuar de pé: a porta ficou oculta, e a tela não foi '
            'removida.',
      );

      // **UMA cópia, e não duas.** A faixa de impedimento diz o motivo com a
      // saída (`Confirmar meu e-mail`), e a barra de ação **não repete**:
      // `criar_encontro.dart`, linhas 527-528, tira o `_MotivoDoBloqueio` da
      // barra justamente nos dois impedimentos que já estão ditos acima. Duas
      // cópias da mesma frase fazem o leitor de tela anunciar o bloqueio duas
      // vezes.
      expect(
        find.textContaining('Confirme seu e-mail antes de criar'),
        findsOneWidget,
        reason: 'REPROVA: ou a tela não diz por que o formulário está travado '
            'para quem não confirmou o e-mail, ou ela diz duas vezes -- a '
            'faixa e a barra de ação anunciando o mesmo bloqueio.',
      );
      // E a saída está junto do motivo: dizer o bloqueio sem oferecer o
      // caminho é o beco sem saída que a faixa existe para não ser.
      expect(
        find.text(TelaCriarEncontro.rotuloDeConfirmarEmail),
        findsOneWidget,
      );
      // O botão continua desabilitado: o motivo não é decorativo.
      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, TelaCriarEncontro.rotuloDeMarcar),
      );
      expect(botao.aoTocar, isNull);
    });
  });

  group('o corpo enviado', () {
    /// Preenche o mínimo que o contrato exige e toca em marcar.
    Future<void> preencherEMarcar(WidgetTester tester) async {
      // A MESMA sequência de `preencherOMinimo`, e não uma cópia dela: as
      // duas cópias que havia aqui divergiam, e as duas estavam erradas do
      // mesmo jeito (rótulo do campo e começo no passado).
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));
    }

    testWidgets(
      'ISCA — manda SÓ os campos que `CommunityNetworkEventInput` aceita. '
      'Para ver reprovar, acrescente `"visibility": "public"` em '
      '`RedeApi.corpoDeCriacao`.',
      (tester) async {
        final enviados = <Map<String, dynamic>>[];
        await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
        await abrirAPorta(tester);
        await preencherEMarcar(tester);

        expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
        final corpo = enviados.single;

        // O conjunto EXATO das chaves permitidas. Um campo a mais é apagado em
        // silêncio pelo `removeAdditional` do Ajv, e a tela acreditaria ter
        // gravado o que não gravou.
        const permitidas = <String>{
          'title',
          'summary',
          'place',
          'starts_at',
          'ends_at',
          'time_zone',
          'accepted_sizes',
          'dog_age',
          'vaccination_required',
          'fenced_off_leash_area',
          'amenities',
          'bring_items',
          'notes',
          // **`image_upload_ids`, e nao `cover_image`** (contrato de
          // 30/10/2026): o aplicativo novo manda a lista de ate quatro, e
          // nunca o campo da capa unica. `cover_image` continua no esquema
          // para o APK que esta no aparelho, e os dois no mesmo corpo sao
          // `400 cover_and_images_both_sent`.
          'image_upload_ids',
        };
        expect(
          corpo.keys.toSet().difference(permitidas),
          isEmpty,
          reason: 'REPROVA: o corpo carrega campo que a operação da comunidade '
              'não aceita. `visibility`, `admission`, `slug`, `point`, '
              '`street_address`, `ticket_url` e `instagram_url` não entram: o '
              'encontro da comunidade é sempre público e gratuito, e não há '
              'mapa nem endereço neste caminho (ADR-0006).',
        );

        const doLugar = <String>{
          'place_name',
          'neighborhood',
          'city',
          'state',
        };
        expect(
          (corpo['place'] as Map<String, dynamic>).keys.toSet(),
          doLugar,
          reason: 'REPROVA: o lugar não são os três rótulos mais a UF. '
              '`point` e `street_address` não existem aqui (ADR-0006), e um '
              'deles no corpo faria a pessoa acreditar ter dado o endereço.',
        );
      },
    );

    testWidgets(
        'ISCA — criar evento CONTINUA funcionando, e o desfecho é a agenda',
        (tester) async {
      // ISCA (duas metades, e cada uma reprova numa assercao diferente):
      //   1. em `rotas.dart`, apague a rota `Rotas.criarEncontroDaRede`. A
      //      porta nao abre e `find.byType(TelaCriarEncontro)` reprova.
      //   2. em `criar_encontro.dart`, troque `context.go(Rotas.rede)` por
      //      `context.go(Rotas.encontroDaRedeDe(...))` -- um endereco que nao
      //      existe mais. O `GoRouter` cai na pagina de erro e a assercao do
      //      destino reprova.
      //
      // **ESTE CASO EXISTE PORQUE A ENTREGA DE 19/10 REMOVEU A TELA DE
      // DETALHE DO EVENTO**, e o desfecho de criar era ela: a linha era
      // `context.pushReplacement(Rotas.encontroDaRedeDe(encontro.slug))`.
      // Criar evento e a acao flutuante da secao e o cliente nao pediu para
      // tira-la -- este caso e quem prova que ela sobreviveu a remocao.
      final enviados = <Map<String, dynamic>>[];
      // A agenda devolve o evento criado DEPOIS do POST: e assim que a pessoa
      // ve o resultado agora que nao ha pagina dele.
      var criou = false;
      await abrirAgenda(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/network/events' && req.method == 'GET') {
            return json200(
              pagina(<Map<String, dynamic>>[
                if (criou) encontroPublico(title: 'Mutirão de banho'),
              ]),
            );
          }
          if (req.url.path == '/v1/network/events' && req.method == 'POST') {
            enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
            criou = true;
            return json200(encontroPublico(), status: 201);
          }
          return problema('not-found', 404);
        },
      );

      // (1) A PORTA ABRE a tela de criar.
      await abrirAPorta(tester);
      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: a porta de criar evento nao abre mais a tela. O '
            'cliente removeu a pagina de DETALHE do evento em 19/10/2026, e '
            'nao a de criar.',
      );

      // (2) O POST SAI.
      await preencherEMarcar(tester);
      expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');

      // (3) E O DESFECHO E A AGENDA, com a tela de criar fechada e nenhuma
      // pagina de erro de rota no caminho.
      expect(
        find.byType(AgendaDaRede),
        findsOneWidget,
        reason: 'REPROVA: criar evento nao termina na agenda. Era a pagina do '
            'proprio evento, e ela saiu: o lugar onde a comunidade ve o '
            'evento passou a ser o cartao da agenda.',
      );
      expect(find.byType(TelaCriarEncontro), findsNothing);
    });

    testWidgets('campo opcional vazio NÃO entra como `null`', (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherEMarcar(tester);

      final corpo = enviados.single;
      expect(
        corpo.containsKey('notes'),
        isFalse,
        reason: 'REPROVA: `notes` foi como `null`. O esquema não declara '
            '`null` na criação, e o 400 que isso produz nomeia um campo que a '
            'pessoa deixou em branco de propósito.',
      );
      expect(
        corpo.containsKey('ends_at'),
        isFalse,
        reason: 'REPROVA: `ends_at` foi como `null` em vez de ficar fora.',
      );
    });

    testWidgets('as datas vão em UTC, como `format: date-time` pede',
        (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
      await abrirAPorta(tester);
      await preencherEMarcar(tester);

      expect(
        (enviados.single['starts_at'] as String).endsWith('Z'),
        isTrue,
        reason: 'REPROVA: `starts_at` foi sem fuso. O servidor aplica '
            '`time_zone` sobre um instante, e um horário local sem marca é '
            'três horas de erro no Brasil.',
      );
    });
  });

  group('as recusas do servidor', () {
    testWidgets('o teto de encontros diz o que destrava, sem o número no app',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () =>
              problema('community-event-limit-reached', 409),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      // A faixa de erro é desenhada no TOPO do `ListView` da tela
      // (`criar_encontro.dart`, linhas 351-371) e o formulário ficou rolado
      // para baixo depois de preenchido: o `ListView` não mantém construído o
      // que saiu da tela, e `find` não enxerga o que não existe. Rolar PARA
      // CIMA é o que a pessoa faz, e é para isso que o `passo` negativo de
      // `rolarAte` existe (`ajuda_de_tela.dart`, linhas 711-730).
      await rolarAte(
        tester,
        find.textContaining('eventos em aberto'),
        passo: -120,
      );
      expect(
        find.textContaining('eventos em aberto'),
        findsOneWidget,
        reason: 'REPROVA: o 409 do teto saiu como erro genérico. Esperar não '
            'resolve este: o balde cheio é o de encontros em aberto, e o que '
            'destrava é cancelar ou deixar um terminar.',
      );
      expect(
        find.textContaining('3 eventos'),
        findsNothing,
        reason: 'REPROVA: o número do teto está escrito no app. Uma versão '
            'antiga continua instalada semanas depois de o servidor mudar o '
            'valor, e repetiria o número errado com a mesma confiança. O '
            'número vem de `limit` na resposta.',
      );
    });

    testWidgets('o teto escreve o número QUANDO a resposta o manda',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'community-event-limit-reached',
            409,
            extra: <String, dynamic>{'limit': 3},
          ),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      // Rola PARA CIMA antes de ler: a faixa é o topo do `ListView` e o
      // formulário preenchido ficou rolado para baixo. Ver o caso do teto,
      // acima, para o porquê por extenso.
      await rolarAte(
        tester,
        find.textContaining('3 eventos em aberto'),
        passo: -120,
      );
      expect(
        find.textContaining('3 eventos em aberto'),
        findsOneWidget,
        reason: 'REPROVA: a resposta mandou `limit` e a tela não o usou.',
      );
    });

    testWidgets(
        'o canal não verificado que chega como 409 reaproveita o mesmo texto',
        (tester) async {
      // A rede de segurança: quem confirmou o e-mail noutro aparelho com esta
      // tela em pé passa pela verificação local e leva o 409.
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'contact-channel-unverified',
            409,
            extra: <String, dynamic>{'next_action': 'verify_email'},
          ),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      // Rola PARA CIMA antes de ler: a faixa é o topo do `ListView` e o
      // formulário preenchido ficou rolado para baixo. Ver o caso do teto,
      // acima, para o porquê por extenso.
      await rolarAte(
        tester,
        find.text('Confirmar meu e-mail'),
        passo: -120,
      );
      expect(
        find.text('Confirmar meu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: o 409 de canal não verificado saiu sem a saída que '
            'o resolve.',
      );
    });

    testWidgets('o endereço dentro do nome do lugar MARCA o campo',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'validation-failed',
            400,
            extra: <String, dynamic>{
              'errors': <Map<String, dynamic>>[
                <String, dynamic>{
                  'field': 'place.place_name',
                  'code': 'address_in_place_name',
                  'message': 'Escreva só o nome do lugar, sem endereço.',
                },
              ],
            },
          ),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      // UNIAO 21/10/2026, e a escolha foi MEDIDA. Sem a rolagem manual este
      // caso REPROVOU na arvore unida (`Nome do lugar` fora da arvore depois
      // da recusa): o formulario ficou mais alto com o CEP e com o estado em
      // linha propria, e `_levarAoPrimeiroRecusado` depende de
      // `GlobalKey.currentContext`, que e nulo para campo que o `ListView`
      // nao construiu. A rolagem da outra frente entra porque ela foi escrita
      // pelo autor DESSA mudanca, por este motivo exato -- e a garantia de
      // produto continua cobrada pelo caso irmao
      // `rola ate o primeiro campo recusado`, que e quem reprova se a tela
      // deixar de rolar sozinha. As duas prosas ficam abaixo.
      // **NÃO HÁ ROLAGEM MANUAL AQUI, E ISSO É O CONSERTO DE 20/10/2026.**
      //
      // Este caso chegou a reprovar: o `ListView` só constrói o que cabe na
      // tela, e depois de preencher os sete campos a lista está embaixo —
      // `Nome do lugar` é o terceiro deles, não estava na árvore, e
      // `find.text` achava zero mesmo com a marca no campo (medido: a árvore
      // tinha `Cidade`, `UF` e `Observações`).
      //
      // A causa não era a marca e nem este caso: **a tela não rolava até o
      // campo recusado**. Quem enviava com a lista embaixo não via recusa
      // nenhuma e concluía que o botão não funcionava. Ficava invisível porque
      // a mecânica de foco do `EditableText` mantinha, por acidente da
      // geometria, o trecho de cima visível — o campo seguia focado porque
      // tocar fora não fechava o teclado. Quando `BichuField` passou a fechar
      // o teclado no toque fora, o acidente acabou e o defeito apareceu.
      //
      // `_levarAoPrimeiroRecusado` conserta isso na TELA, e por isso este caso
      // volta a medir só o que ele sempre mediu: que a recusa marca O CAMPO, e
      // não que sai como faixa genérica. O caso irmão
      // `rola até o primeiro campo recusado` é quem cobra a rolagem.
      // (da outra frente) Rola PARA CIMA antes de ler: a marca fica no campo `Nome do lugar`,
      // (da outra frente) que é o terceiro do formulário, e o formulário preenchido ficou rolado
      // (da outra frente) para baixo. **Ele ficou MAIS longe em 21/10/2026**, quando o CEP
      // (da outra frente) entrou acima do bairro e o estado saiu da `Row` da cidade para uma
      // (da outra frente) linha própria: a marca passou a nascer fora da dobra, e sem este
      // (da outra frente) passo o caso reprovaria por não ter rolado, e não por não ter marca.
      await rolarAte(
        tester,
        find.text('Escreva só o nome do lugar, sem endereço.'),
        passo: -120,
        scrollable: corpoDoFormulario,
      );
      expect(
        find.text('Escreva só o nome do lugar, sem endereço.'),
        findsOneWidget,
        reason: 'REPROVA: a recusa saiu como faixa genérica e o campo ficou '
            'sem marca. A pessoa precisa saber QUAL dos sete campos recusou, '
            'e a frase é a do servidor: a tela não reimplementa o detector '
            'de endereço, e duas redações dele divergiriam.',
      );
    });

    // ISCA (D) — a tela ROLA até o primeiro campo recusado.
    //
    // O defeito que ela desliga, medido em 20/10/2026: a tela marcava o campo
    // e não levava a pessoa até a marca. Com os sete campos preenchidos a
    // lista está embaixo, e `Nome do lugar` é o terceiro — a recusa chegava a
    // um widget que o `ListView` nem construía. Quem envia toca `Criar
    // evento`, nada visível acontece, e a leitura é que o botão não funciona.
    //
    // **Ela mede DUAS coisas, e nenhuma é "o widget existe":** o campo está
    // dentro da janela visível (retângulo, não presença — presença ficaria
    // verde com o campo construído dez mil pixels abaixo da dobra), e ele
    // recebeu o FOCO, que é onde a correção vai acontecer. Com
    // `_levarAoPrimeiroRecusado` desligado, as duas reprovam.
    testWidgets('rola até o primeiro campo recusado, e põe o foco nele', (
      tester,
    ) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'validation-failed',
            400,
            extra: <String, dynamic>{
              'errors': <Map<String, dynamic>>[
                <String, dynamic>{
                  'field': 'place.place_name',
                  'code': 'address_in_place_name',
                  'message': 'Escreva só o nome do lugar, sem endereço.',
                },
              ],
            },
          ),
        ),
      );
      await abrirAPorta(tester);
      await preencherOMinimo(tester);

      final campo = campoDoRotulo('Nome do lugar');
      // DEFESA DE VAZIO: se o campo já estivesse na janela antes do envio, o
      // caso ficaria verde sem a tela ter rolado nada.
      expect(
        campo.evaluate().isEmpty,
        isTrue,
        reason:
            'REPROVA POR VAZIO: `Nome do lugar` já estava construído antes do '
            'envio, então "a tela rolou até ele" não mede rolagem nenhuma. O '
            'caso depende de a lista terminar embaixo, com o campo fora da '
            'dobra — se o formulário encurtou, este caso perdeu o cenário.',
      );

      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      expect(
        campo,
        findsOneWidget,
        reason:
            'REPROVA: depois da recusa, `Nome do lugar` continua fora da '
            'árvore. A tela marcou um campo que a pessoa não tem como ver, e '
            'quem envia com a lista embaixo não vê recusa nenhuma — conclui '
            'que o botão não funciona. Quem conserta é '
            '`_levarAoPrimeiroRecusado`, com `Scrollable.ensureVisible` num '
            '`addPostFrameCallback`.',
      );

      final janela = tester.getRect(find.byType(TelaCriarEncontro));
      final caixa = tester.getRect(campo);
      expect(
        caixa.top >= janela.top && caixa.bottom <= janela.bottom,
        isTrue,
        reason:
            'REPROVA: `Nome do lugar` ($caixa) está construído mas FORA da '
            'janela visível ($janela). Presença na árvore não é visibilidade: '
            'o `ListView` constrói uma margem além da dobra, e um caso que '
            'medisse só `findsOneWidget` ficaria verde com o campo logo abaixo '
            'dela.',
      );

      expect(
        tester.widget<EditableText>(
          find.descendant(of: campo, matching: find.byType(EditableText)),
        ).focusNode.hasFocus,
        isTrue,
        reason:
            'REPROVA: a tela rolou até o campo recusado e não pôs o foco nele. '
            'É o mesmo mecanismo de `tela_criar_conta` e `tela_entrar` — '
            '`requestFocus` no campo que o servidor recusou --, e é ele que '
            'deixa a correção a um toque de distância em vez de dois.',
      );
    });
  });
}

/// Preenche o mínimo exigido pelo contrato, sem tocar em marcar.
/// Preenche o mínimo do contrato e escolhe um começo **no futuro**.
///
/// Duas correções, e as duas valem para todo este arquivo:
///
/// 1. os campos são achados pelo `rotulo` do `BichuField` e não por
///    `widgetWithText`: o rótulo é um `Text` IRMÃO do campo
///    (`lib/widgets/bichu_field.dart`, linhas 125-133), e `widgetWithText`
///    achava zero -- `Bad state: No element`;
/// 2. o começo é AMANHÃ e não agora: a tela recusa com razão um começo que
///    não é `isAfter(agora())` (`criar_encontro.dart`, linha 188), e com
///    `dataNoPassado` de pé `_marcar` sai na primeira linha e nada é enviado.
Future<void> preencherOMinimo(WidgetTester tester) async {
  Future<void> digitar(String rotulo, String valor) async {
    // **A lista DO FORMULARIO, e nao `find.byType(Scrollable).first`.** A tela
    // e empilhada sobre a casca de abas e a arvore tem tres `Scrollable`
    // montados; `.first` pode ser o da casca, e o arrasto acerta a lista
    // errada -- `Bad state: No element`, apontando para o lugar errado. O
    // defeito ficou invisivel enquanto todos os campos nasciam dentro da
    // dobra, e apareceu em 19/10/2026, quando o bloco da CAPA entrou acima
    // deles.
    await rolarAte(tester, campoDoRotulo(rotulo), scrollable: corpoDoFormulario);
    await tester.enterText(campoDoRotulo(rotulo), valor);
    await tester.pumpAndSettle();
  }

  await digitar('Nome do evento', 'Caminhada no parque');
  await digitar('O que vai acontecer', 'Volta tranquila de uma hora.');
  await digitar('Nome do lugar', 'Praça da Harmonia');
  await digitar('Bairro', 'Gamboa');
  await digitar('Cidade', 'Rio de Janeiro');
  // **O estado agora e ESCOLHA, e nao digitacao** (cliente, 17/10/2026): a
  // lista mostra o nome e guarda a sigla, e o caso continua afirmando `RJ` no
  // corpo que sai -- e e o corpo que importa.
  await escolherEstadoNaLista(tester, 'RJ', scrollable: corpoDoFormulario);
  await escolherComecoNoMesSeguinte(tester);
}

/// Escolhe o começo no DIA 1 DO MÊS SEGUINTE, pelos dois seletores do Flutter.
///
/// Tocar só nos dois `OK` escolhe HOJE e a hora de AGORA, que a tela recusa
/// (ver [preencherOMinimo]). O relógio não dá para fixar por aqui: a rota
/// monta `const TelaCriarEncontro()` (`rotas.dart`, linha 565) e o `agora` do
/// app não chega até ela, então a escolha é no calendário.
///
/// **Avança um mês SEMPRE, e não só na virada.** A forma anterior escolhia
/// amanhã e só tocava no `>` quando amanhã caía no mês seguinte -- um dia por
/// mês. Nos outros trinta o ramo não rodava, e por isso o finder inglês
/// `find.byTooltip('Next month')` ficou errado desde que foi escrito e só
/// reprovou em 31/10/2026, na esteira, levando dezessete casos em cinco
/// arquivos pelo mesmo helper. Dia 1 do mês seguinte é sempre futuro
/// (`firstDate: agora`) e está sempre dentro de `lastDate` (`agora + 365
/// dias`, `criar_encontro.dart`, `_escolherQuando`), então o MESMO caminho
/// roda em toda execução, todo dia -- e um dia por mês deixa de ser o único
/// em que ele é medido.
///
/// **O tooltip sai de `MaterialLocalizations`, e não escrito à mão.** A
/// árvore do app é `pt_BR` (`app.dart`: `GlobalMaterialLocalizations.delegates`
/// e `supportedLocales: [Locale('pt', 'BR')]`), então o texto renderizado é
/// `Próximo mês` e não `Next month`. Cravar `Próximo mês` aqui repetiria o
/// mesmo defeito em outro idioma: o `IconButton` do Flutter usa
/// `_localizations.nextMonthTooltip` (`calendar_date_picker.dart`), e é desse
/// mesmo getter que o esperado vem. (Cuidado ao sondar isto: num
/// `MaterialApp` pelado, sem os delegates, o tooltip É `Next month`. A sonda
/// tem de ser dentro da árvore de verdade.)
Future<void> escolherComecoNoMesSeguinte(WidgetTester tester) async {
  await rolarAte(tester, find.text('Começa'), scrollable: corpoDoFormulario);
  await tocar(tester, find.text('Começa'));

  final seletorDeDia = find.byType(DatePickerDialog);
  expect(
    seletorDeDia,
    findsOneWidget,
    reason: 'REPROVA: tocar em `Começa` não abriu o seletor de dia, então '
        'não há de onde ler o idioma da árvore.',
  );
  final proximoMes =
      MaterialLocalizations.of(tester.element(seletorDeDia)).nextMonthTooltip;

  final avancarUmMes = find.byTooltip(proximoMes);
  expect(
    avancarUmMes,
    findsOneWidget,
    reason: 'REPROVA: o `>` de avançar um mês não casou EXATAMENTE uma vez '
        'pelo tooltip `$proximoMes`, que é o que '
        '`MaterialLocalizations.nextMonthTooltip` devolve nesta árvore. '
        'Zero casamentos significa que o botão saiu, mudou de forma, ou que '
        'o mês exibido já é o último permitido por `lastDate` -- aí o Flutter '
        'põe o tooltip como `null`. Esta afirmação existe para reprovar '
        'DIZENDO o que mudou: sem ela, o toque estoura em `Bad state: No '
        'element`, que não diz nada.',
  );
  await tocar(tester, avancarUmMes);

  final diaUm = find.text('1');
  expect(
    diaUm,
    findsOneWidget,
    reason: 'REPROVA: `1` não casou EXATAMENTE uma vez no grid do mês '
        'seguinte. O cabeçalho em pt_BR escreve a data por extenso '
        '(`dom., 1 de nov.`), que não casa exato, então uma segunda casa '
        'significa que o seletor passou a mostrar dias de outro mês junto.',
  );
  await tocar(tester, diaUm);

  await tocar(tester, find.text('OK'));
  await tocar(tester, find.text('OK'));
}
