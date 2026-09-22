// BICHUS-24 — "Duas oportunidades e nao mais" (UX 10.1, criterios 4 e 5).
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO PEGA QUE `antessala_de_aviso_test.dart` NAO PEGAVA
// ---------------------------------------------------------------------------
//
// O arquivo irmao cobre o MOMENTO do pedido, e cobre bem: nada na abertura,
// `Agora nao` nao dispara o dialogo, quem ja respondeu nao ve a antessala.
// Todos os casos dele montam **um** pet e param ali.
//
// O defeito vivia no segundo pet. `Agora nao` mantem a permissao em
// `naoPedida` -- e esse e o desenho certo, porque o dialogo do sistema nunca
// foi aberto. So que `naoPedida` era a UNICA condicao que abria a antessala.
// Quem recusasse e cadastrasse outro pet via a antessala de novo. E outro. A
// frase "Duas oportunidades. Nao uma terceira dentro do mesmo fluxo" nao tinha
// uma linha de codigo que a sustentasse, e nenhum teste reprovava, porque
// nenhum caso cadastrava o segundo pet.
//
// Por isso os casos centrais daqui passam por F1.6 **duas vezes**. O primeiro
// pet nao tem como acusar este defeito: no primeiro pet o comportamento certo
// e o errado sao identicos.
//
// ---------------------------------------------------------------------------
// COMO ESTES CASOS REPROVAM
// ---------------------------------------------------------------------------
//
// Eles verificam EFEITO, e nao chamada. Nao existe aqui um `expect` de que a
// tela "chama PedidoDeAviso": isso ficaria verde com o furo inteiro de pe. O
// que se mede e o que a pessoa ve (a folha existe ou nao) e o que o sistema
// recebe (`vezesQuePediu`, que conta a chance unica do iOS sendo gasta).

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/oportunidades_de_aviso.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/avisos/pedido_de_aviso.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

void main() {
  Pet pet(String nome) => Pet(
        id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
        nome: nome,
        especie: Especie.cao,
        redacoesDeCuidados: const <RedacaoDeCuidados>[],
      );

  http.Response tagEmitida() => json200(
        <String, dynamic>{
          'id': '11111111-2222-3333-4444-555555555555',
          'status': 'active',
          'code_suffix': '1QD',
          'created_at': '2026-09-17T18:20:00Z',
          'code': 'BCH-7K2M-91QD',
          'url': 'https://bichu.app/t/BCH-7K2M-91QD',
        },
        status: 201,
      );

  late List<Map<String, dynamic>> registros;
  setUp(() => registros = <Map<String, dynamic>>[]);

  Future<http.Response> Function(http.Request) redePadrao() {
    return (requisicao) async {
      if (requisicao.url.path.endsWith('/me/devices')) {
        registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
        return json200(<String, dynamic>{
          'id': '22222222-3333-4444-5555-666666666666',
          'platform': 'android',
          'push_permission': 'granted',
        });
      }
      return tagEmitida();
    };
  }

  /// Monta o app e abre F1.6 com a tag emitida, que e a precondicao de UX 10.1.
  Future<void> abrirOAppEF16(
    WidgetTester tester, {
    required AvisosDeTeste avisos,
    DepositoDeOportunidadesEmMemoria? oportunidades,
    String nome = 'Nina',
  }) async {
    await abrirOApp(
      tester,
      avisos: avisos,
      oportunidades: oportunidades,
      rede: redePadrao(),
    );
    await irPara(
      tester,
      Rotas.petCadastrado,
      extra: ResultadoDoCadastro(pet: pet(nome)),
    );
    await tester.pumpAndSettle();
  }

  /// Volta para F1.6 com OUTRO pet, no MESMO app -- que e o unico jeito de
  /// exercitar o segundo cadastro sem reiniciar o processo.
  Future<void> cadastrarOutroPet(WidgetTester tester, String nome) async {
    await irPara(
      tester,
      Rotas.petCadastrado,
      extra: ResultadoDoCadastro(pet: pet(nome)),
    );
    await tester.pumpAndSettle();
  }

  final Finder aFolha = find.byType(AntessalaDeAviso);
  final Finder oSim = find.text(TextosDaAntessala.sim);
  final Finder oAgoraNao = find.text(TextosDaAntessala.agoraNao);

  group('ISCA — o limite de duas oportunidades', () {
    testWidgets(
        'recusar a antessala GASTA a oportunidade: o segundo pet nao a ve',
        (tester) async {
      // ESTE E O CASO CENTRAL DA BICHUS-24.
      //
      // Com o mecanismo desligado (sem `OportunidadesDeAviso`, decidindo so
      // pelo estado da permissao), a antessala reaparece aqui -- porque
      // `Agora nao` deixa a permissao em `naoPedida`, e `naoPedida` era a
      // condicao de abertura. O primeiro pet nao acusa: e no segundo que a
      // frase "duas oportunidades" ou vale ou nao vale.
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOAppEF16(tester, avisos: avisos);

      expect(aFolha, findsOneWidget, reason: 'precondicao: a primeira apareceu');
      await tocar(tester, oAgoraNao);
      expect(aFolha, findsNothing);

      await cadastrarOutroPet(tester, 'Rex');

      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: a antessala de F1.6 apareceu uma SEGUNDA vez, no '
            'segundo pet. UX 10.1 fecha o assunto em "Duas oportunidades. Nao '
            'uma terceira dentro do mesmo fluxo", e a segunda oportunidade e '
            'de F3.2, nao de outro cadastro. Quem tem quatro pets veria quatro '
            'antessalas, e cada uma delas e uma chance a mais de a pessoa '
            'tocar em `Sim` por cansaco e depois negar no dialogo do sistema '
            '-- que e irreversivel.',
      );
      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: o dialogo do sistema foi aberto no segundo pet.',
      );
    });

    testWidgets('a oportunidade ja gasta em disco NAO abre antessala nenhuma',
        (tester) async {
      // O estado de quem cadastrou um pet ontem, fechou o app e voltou hoje.
      // Nenhum `pumpWidget` produz isso passando pelo fluxo: cada monta um app
      // novo. O deposito injetado e o unico jeito de montar o ONTEM.
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOAppEF16(
        tester,
        avisos: avisos,
        oportunidades: DepositoDeOportunidadesEmMemoria(
          conteudoInicial: jsonEncode(<String, dynamic>{
            'gastas': <String>['primeiro_pet_cadastrado'],
          }),
        ),
      );

      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: a oportunidade de F1.6 ja estava gasta em disco e a '
            'antessala apareceu assim mesmo. O registro nao esta sendo lido, '
            'ou nao sobrevive ao app ser encerrado -- e um limite que se '
            'reinicia a cada arranque nao e um limite.',
      );
      expect(avisos.vezesQuePediu, 0);
      // O aparelho continua sendo registrado (ADR-0008): nao oferecer a
      // antessala nao e motivo para sumir da base de alcance.
      expect(registros.single['push_permission'], 'not_asked');
    });

    testWidgets('a oportunidade gasta fica gravada em disco, e nao so na memoria',
        (tester) async {
      // Memoria daria uma oportunidade nova a cada arranque. O que prova que
      // ela foi para o disco e o deposito ter recebido uma gravacao.
      final deposito = DepositoDeOportunidadesEmMemoria();
      await abrirOAppEF16(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        oportunidades: deposito,
      );
      await tocar(tester, oAgoraNao);

      expect(
        deposito.gravacoes,
        greaterThan(0),
        reason: 'REPROVA: a antessala apareceu e nada foi gravado. O limite '
            'existe so enquanto o processo viver, e "duas oportunidades" vira '
            '"duas por arranque do app".',
      );
      final gravado = jsonDecode((await deposito.ler())!) as Map<String, dynamic>;
      expect(gravado['gastas'], contains('primeiro_pet_cadastrado'));
    });

    testWidgets('dispensar a folha com o dedo tambem gasta a oportunidade',
        (tester) async {
      // O toque fora e a saida mais barata da folha, e e por ela que um limite
      // mal feito vaza: se so `Agora nao` gastasse, quem dispensa com o dedo
      // ganharia antessalas infinitas.
      await abrirOAppEF16(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
      );
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      await cadastrarOutroPet(tester, 'Rex');
      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: dispensar a folha com o dedo nao gastou a '
            'oportunidade. A chance de convencer foi usada no instante em que '
            'a pessoa leu o texto; o modo de sair nao muda isso.',
      );
    });
  });

  group('ISCA — a segunda oportunidade (F3.2, criterio 4)', () {
    // F3.2 ainda nao existe como tela (e outra historia). O que existe, e o
    // que esta historia entrega, e o fluxo que ela vai chamar: o coordenador,
    // com o Escopo de verdade do app montado. Exercita-lo por `unawaitedOferecer`
    // nao e atalho -- e a mesma funcao, com as mesmas dependencias, que a tela
    // vai invocar numa linha.

    testWidgets('a segunda antessala tem o texto de UX 10.1, e nao o da C.3',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOApp(tester, avisos: avisos, rede: redePadrao());

      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      expect(
        find.text('Alguém pode achar Nina nos próximos minutos'),
        findsOneWidget,
        reason: 'REPROVA: a segunda oportunidade abriu com o texto da '
            'primeira. O argumento da segunda e outro: o pet ESTA perdido '
            'agora, e essa e a ultima chance.',
      );
      expect(find.text(TextosDaAntessala.corpoDaSegunda), findsOneWidget);
      expect(find.text(TextosDaAntessala.ligarOAviso), findsOneWidget);
      expect(find.text(TextosDaAntessala.continuarSem), findsOneWidget);
      // E nao a primeira: os dois textos nao podem coexistir.
      expect(oSim, findsNothing);
      expect(avisos.vezesQuePediu, 0);
    });

    testWidgets('`Continuar sem` NAO dispara o dialogo do sistema',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOApp(tester, avisos: avisos, rede: redePadrao());
      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      await tocar(tester, find.text(TextosDaAntessala.continuarSem));
      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: `Continuar sem` abriu o dialogo do sistema. No iOS '
            'a chance acabou, e nao ha terceira oportunidade que a recupere.',
      );
    });

    testWidgets('`Ligar o aviso` abre o dialogo e o token vai para o servidor',
        (tester) async {
      final avisos = AvisosDeTeste(
        PermissaoDeAviso.naoPedida,
        depoisDePedir: PermissaoDeAviso.concedida,
      );
      await abrirOApp(tester, avisos: avisos, rede: redePadrao());
      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      await tocar(tester, find.text(TextosDaAntessala.ligarOAviso));

      expect(avisos.vezesQuePediu, 1);
      expect(
        registros.single['push_token'],
        'token-fcm-descartavel',
        reason: 'REPROVA: a pessoa concedeu na segunda antessala e o token nao '
            'chegou ao servidor. Sem token no servidor o criterio 4 do '
            'ADR-0006 continua falso e o aparelho fica fora da base de alerta '
            '-- a pessoa disse sim e nao recebe nada.',
      );
      expect(registros.single['push_permission'], 'granted');
    });

    testWidgets('ISCA — as DUAS gastas: nenhuma terceira antessala, nunca',
        (tester) async {
      // O criterio 5, literal: "as duas oportunidades ja aconteceram, o mesmo
      // fluxo se repete, nenhuma terceira antessala e nenhum dialogo".
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOAppEF16(
        tester,
        avisos: avisos,
        oportunidades: DepositoDeOportunidadesEmMemoria(
          conteudoInicial: jsonEncode(<String, dynamic>{
            'gastas': <String>[
              'primeiro_pet_cadastrado',
              'primeiro_caso_de_perdido',
            ],
          }),
        ),
      );
      expect(aFolha, findsNothing);

      // E o fluxo se repete, nos DOIS pontos.
      await cadastrarOutroPet(tester, 'Rex');
      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: apareceu uma terceira antessala. O texto dela '
            'prometeria um dialogo que o sistema nao mostra mais.',
      );
      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: o dialogo do sistema foi disparado depois de as duas '
            'oportunidades terem sido gastas.',
      );
    });
  });

  group('ISCA — o dialogo do sistema nunca sai sem antessala', () {
    // A prova NEGATIVA que sustenta a antessala inteira: se em algum ponto o
    // app pedir direto ao sistema, a folha deixa de ter funcao e a chance
    // unica do iOS e gasta sem contexto.
    //
    // UM CASO POR ESTADO, e nao um `for` dentro de um `testWidgets`. Isto NAO
    // e estilo. Um laco que remonta o app dentro do mesmo caso deixa as
    // iteracoes seguintes **vazias**: o `pumpAndSettle` do segundo
    // `pumpWidget` devolve antes de o fluxo de permissao da nova arvore
    // chegar a `avisos.estado()`, e o `expect` seguinte olha para uma tela que
    // nunca rodou o que ele veio conferir. Medido nesta base: no laco, a
    // segunda iteracao termina com `vezesQueConsultouEstado == 0` e passa
    // verde. Um caso por `testWidgets` tem binding proprio e nao tem como
    // cair nisso.
    //
    // E por cima disso cada caso abaixo **exige a precondicao**: se o fluxo
    // nao tiver rodado, o caso reprova dizendo isso, em vez de aprovar por
    // vazio.

    void exigirQueOFluxoTenhaRodado(AvisosDeTeste avisos, String quando) {
      expect(
        avisos.vezesQueConsultouEstado,
        greaterThan(0),
        reason: 'REPROVA POR VAZIO: em "$quando" o app nunca consultou o '
            'estado da permissao, entao nada do que este caso afirma foi de '
            'fato exercitado. Um caso que passa sem ter olhado para nada e '
            'pior que um caso ausente, porque ninguem procura o que acredita '
            'ja ter.',
      );
    }

    testWidgets('com a permissao ja concedida: nenhuma folha, nenhum pedido',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.concedida);
      await abrirOAppEF16(tester, avisos: avisos);

      exigirQueOFluxoTenhaRodado(avisos, 'ja concedida');
      expect(aFolha, findsNothing);
      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: o app pediu ao sistema uma permissao que ja estava '
            'concedida.',
      );
    });

    testWidgets('com a permissao ja negada: nenhuma folha, nenhum pedido',
        (tester) async {
      // O caso que o laco do arquivo irmao nunca chegou a exercitar.
      final avisos = AvisosDeTeste(PermissaoDeAviso.negada);
      await abrirOAppEF16(tester, avisos: avisos);

      exigirQueOFluxoTenhaRodado(avisos, 'ja negada');
      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: antessala para quem ja negou. O `Sim` dela abriria '
            'um dialogo que o sistema nao mostra mais -- um botao que nao faz '
            'nada. O caminho de volta e `Ligar nos ajustes`, em Perfil.',
      );
      expect(avisos.vezesQuePediu, 0);
      expect(registros.single['push_permission'], 'denied');
    });

    testWidgets('com a oportunidade gasta: nenhuma folha, nenhum pedido',
        (tester) async {
      final avisos = AvisosDeTeste(PermissaoDeAviso.naoPedida);
      await abrirOAppEF16(
        tester,
        avisos: avisos,
        oportunidades: DepositoDeOportunidadesEmMemoria(
          conteudoInicial: jsonEncode(<String, dynamic>{
            'gastas': <String>['primeiro_pet_cadastrado'],
          }),
        ),
      );

      exigirQueOFluxoTenhaRodado(avisos, 'oportunidade gasta');
      expect(
        aFolha,
        findsNothing,
        reason: 'REPROVA: a permissao esta em `naoPedida` e a oportunidade de '
            'F1.6 ja foi gasta, e a antessala apareceu assim mesmo. E a '
            'terceira antessala que o criterio 5 proibe.',
      );
      expect(
        avisos.vezesQuePediu,
        0,
        reason: 'REPROVA: o dialogo do sistema foi aberto sem antessala '
            'nenhuma. A chance unica do iOS acabou de ser gasta sem contexto.',
      );
    });
  });

  group('acessibilidade da SEGUNDA antessala (criterio 6, "em qualquer ponto")',
      () {
    testWidgets('`Continuar sem` tem o mesmo peso e alvo de `Ligar o aviso`',
        (tester) async {
      await abrirOApp(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        rede: redePadrao(),
      );
      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      Finder naFolha(Finder alvo) =>
          find.descendant(of: aFolha, matching: alvo);

      final ligar = tamanhoDoAlvo(tester, naFolha(find.byType(BotaoPrimario)));
      final semAviso =
          tamanhoDoAlvo(tester, naFolha(find.byType(OutlinedButton)));

      expect(ligar.height, greaterThanOrEqualTo(pisoMinimo));
      expect(
        semAviso.height,
        greaterThanOrEqualTo(pisoMinimo),
        reason: 'REPROVA: `Continuar sem` menor que o piso. O criterio 6 diz '
            '"a antessala em QUALQUER ponto", e a segunda e justamente a que '
            'chega com o pet perdido -- o pior momento possivel para a recusa '
            'ser um sussurro.',
      );
      expect(semAviso.width, ligar.width);
    });

    testWidgets('as duas acoes da segunda sao anunciaveis por leitor de tela',
        (tester) async {
      await abrirOApp(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        rede: redePadrao(),
      );
      unawaitedOferecer(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();

      exigirRotuloAnunciavel(tester, TextosDaAntessala.ligarOAviso, na: 'F3.2');
      exigirRotuloAnunciavel(tester, TextosDaAntessala.continuarSem, na: 'F3.2');
    });

    testWidgets('a segunda tambem nao inventa o genero do pet', (tester) async {
      expect(
        TextosDaAntessala.tituloDaSegunda('Rex'),
        'Alguém pode achar Rex nos próximos minutos',
      );
    });
  });
}

/// Dispara a segunda oportunidade sem esperar o `Future`.
///
/// A folha so fecha quando a pessoa responde, entao `await` aqui travaria o
/// caso. Quem espera e o `pumpAndSettle` seguinte.
void unawaitedOferecer(BuildContext contexto, {String nome = 'Nina'}) {
  PedidoDeAviso.oferecer(
    contexto,
    oportunidade: OportunidadeDeAviso.primeiroCasoDePerdido,
    nomeDoPet: nome,
  );
}
