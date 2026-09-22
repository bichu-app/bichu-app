// BICHUS-75 — o aviso persistente de cadastro, justificado pelo pet.
//
// ---------------------------------------------------------------------------
// POR QUE OS TEXTOS ESTAO ESCRITOS A MAO AQUI, E NAO LIDOS DE
// `TextosDoAvisoDeCadastro`
// ---------------------------------------------------------------------------
//
// Um caso que comparasse o texto renderizado com a MESMA constante que o
// produz passa sempre, inclusive depois de alguem trocar a frase inteira: os
// dois lados da igualdade mudam juntos. Isso e tautologia, nao verificacao.
//
// Os criterios 1, 3, 4 e 6 fixam microcopy palavra por palavra, e microcopy
// fixada por criterio de aceite so e verificavel contra o literal do criterio.
// Se um destes casos reprovar porque "o texto mudou", a pergunta certa nao e
// como fazer o teste passar: e se a historia mudou junto.
//
// ---------------------------------------------------------------------------
// ONDE FICA A "ABA INICIO" DO CRITERIO 1
// ---------------------------------------------------------------------------
//
// A historia e da onda 1 e fala em `aba Inicio`. `Inicio` deixou de ser
// destino na BICHUS-164: a secao de aterrissagem passou a ser `Pets`, e a
// faixa de cadastro ja morava la antes desta historia. Os casos usam
// `Rotas.pets` por isso, e nao por conveniencia.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/aviso_de_cadastro_incompleto.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/sessao/registro_do_aviso_de_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

Pet _pet({
  String id = 'p-1',
  String nome = 'Nina',
  Sexo? sexo = Sexo.femea,
}) {
  return Pet(
    id: id,
    nome: nome,
    especie: Especie.cao,
    sexo: sexo,
    redacoesDeCuidados: const <RedacaoDeCuidados>[],
  );
}

CacheDeMeusPets _cacheCom(List<Pet> pets, {String dono = 'u-1'}) {
  return CacheDeMeusPets()..guardar(dono, pets);
}

Future<http.Response> _redeMuda(http.Request _) async =>
    json200(<String, dynamic>{'items': <dynamic>[]});

void main() {
  group('criterio 1 — a faixa cheia, e o que ela diz', () {
    testWidgets('conta sem e-mail verificado ve a faixa com o nome do pet',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);

      expect(find.text('Confirme seu e-mail'), findsOneWidget);
      expect(
        find.text('É por ele que a gente avisa se alguém encontrar a Nina.'),
        findsOneWidget,
        reason: 'REPROVA: o corpo da faixa nao e o do criterio 1. O aviso e '
            'justificado PELO PET, e o nome do pet e o que faz a pessoa '
            'entender por que confirmar o e-mail importa para ela.',
      );
      expect(find.text('Reenviar'), findsOneWidget);
      expect(find.text('Agora não'), findsOneWidget);
    });

    testWidgets('pet macho leva o artigo masculino', (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet(nome: 'Rex', sexo: Sexo.macho)]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('É por ele que a gente avisa se alguém encontrar o Rex.'),
        findsOneWidget,
      );
    });

    testWidgets('sexo nao informado sai SEM artigo, e nao com um inventado',
        (tester) async {
      // `unknown` e o padrao do cadastro. Escolher `a` ou `o` aqui seria o app
      // afirmando um dado que o cadastro nao tem.
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet(nome: 'Mel', sexo: Sexo.naoSei)]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('É por ele que a gente avisa se alguém encontrar Mel.'),
        findsOneWidget,
      );
    });
  });

  group('criterio 3 — mais de um pet', () {
    testWidgets('dois pets trocam o nome pelo plural', (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[
          _pet(),
          _pet(id: 'p-2', nome: 'Rex', sexo: Sexo.macho),
        ]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text(
          'É por ele que a gente avisa se alguém encontrar um dos seus pets.',
        ),
        findsOneWidget,
        reason: 'REPROVA: com dois pets o texto continua nomeando um deles. '
            'Nomear o primeiro da lista diz a quem tem tres pets que o aviso '
            'vale so para um.',
      );
      expect(find.text('Confirme seu e-mail'), findsOneWidget);
    });
  });

  group('criterio 7 — quem verificou nao ve nada', () {
    testWidgets('ISCA — e-mail verificado apaga o aviso das DUAS abas',
        (tester) async {
      // O E-MAIL VERIFICADO **E** O TELEFONE FALTANDO, e a combinacao e o caso
      // inteiro. Com `pendencias` vazia, `cadastroIncompleto` e falso por
      // conta propria e este caso passaria mesmo com a condicao velha -- uma
      // isca que nao reprova o defeito que ela existe para pegar. Medido em
      // 22/09: com `pendencias: []`, desligar a isca deixou tudo verde.
      //
      // `phone` pendente e o estado comum de quem acabou de confirmar o
      // e-mail: `cadastroIncompleto` fica VERDADEIRO e a condicao velha
      // mostraria "Confirme seu e-mail" sobre um e-mail ja confirmado.
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          emailVerificado: true,
          pendencias: const <PendenciaDeCadastro>[PendenciaDeCadastro.telefone],
        ),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );

      await irPara(tester, Rotas.pets);
      expect(
        find.text('Confirme seu e-mail'),
        findsNothing,
        reason: 'REPROVA: a conta tem o e-mail CONFIRMADO e o telefone '
            'faltando, e a faixa de confirmar e-mail apareceu assim mesmo. A '
            'condicao voltou a ser `cadastroIncompleto`, que e verdadeiro '
            'quando falta qualquer campo do perfil.',
      );
      expect(find.text('E-mail não confirmado'), findsNothing);

      await irPara(tester, Rotas.perfil);
      expect(
        find.text('Confirme seu e-mail'),
        findsNothing,
        reason: 'REPROVA: o aviso aparece em `Perfil` para quem ja confirmou o '
            'e-mail. O criterio 7 diz "em lugar nenhum", e a condicao de '
            'exibir nao pode voltar a ser `cadastroIncompleto`: esse campo e '
            'verdadeiro quando falta QUALQUER coisa no perfil, entao quem '
            'confirmou o e-mail e nao preencheu o telefone lia "Confirme seu '
            'e-mail" sobre um e-mail confirmado.',
      );
    });
  });

  group('criterio 4 — o ciclo de 7 dias', () {
    testWidgets('`Agora não` encolhe a faixa para a linha, no mesmo lugar',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      await tocar(tester, find.text('Agora não'));

      expect(find.text('Confirme seu e-mail'), findsNothing);
      expect(find.text('E-mail não confirmado'), findsOneWidget);
      expect(find.text('Confirmar'), findsOneWidget);
    });

    testWidgets('ISCA — dispensado HA 6 DIAS continua encolhido',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        depositoDoAviso: DepositoDoAvisoEmMemoria(
          conteudoInicial: '{"conta":"u-1",'
              '"dispensado_em":"2026-09-16T10:00:00.000Z","dispensas":1}',
        ),
        agora: () => DateTime.utc(2026, 9, 22, 10),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('E-mail não confirmado'),
        findsOneWidget,
        reason: 'REPROVA: seis dias depois de `Agora nao` a faixa cheia ja '
            'voltou. A pessoa pediu uma semana e recebeu menos.',
      );
      expect(find.text('Confirme seu e-mail'), findsNothing);
    });

    testWidgets('ISCA — passados os 7 dias a faixa volta CHEIA', (tester) async {
      // O outro lado do ciclo. Sem este caso, um `silencioVale` que devolvesse
      // sempre `true` passaria no caso acima e calaria o aviso para sempre --
      // o botao de dispensar em definitivo que o criterio 5 proibe, sem botao.
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        depositoDoAviso: DepositoDoAvisoEmMemoria(
          conteudoInicial: '{"conta":"u-1",'
              '"dispensado_em":"2026-09-16T10:00:00.000Z","dispensas":1}',
        ),
        agora: () => DateTime.utc(2026, 9, 24, 10),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: oito dias depois da dispensa o aviso continua '
            'encolhido. O criterio 4 manda o ciclo RECOMECAR, e '
            'indefinidamente.',
      );
    });
  });

  group('criterio 5 — nao existe dispensa definitiva', () {
    test('ISCA — o enum de formas tem tres valores, e nenhum e "para sempre"',
        () {
      // O criterio 5 e uma AUSENCIA, e ausencia nao se ve num `find`. O que
      // sustenta a regra e a cardinalidade do enum: um quarto valor
      // (`dispensadoParaSempre`) precisaria ser escrito a mao, com nome e
      // motivo no diff, e este caso reprova no mesmo instante.
      expect(
        FormaDoAviso.values,
        hasLength(3),
        reason: 'REPROVA: o enum de formas do aviso deixou de ter exatamente '
            'tres valores. O criterio 5 proibe qualquer caminho que remova o '
            'aviso para sempre, e um quarto estado e o formato natural desse '
            'caminho.',
      );
      expect(
        FormaDoAviso.values.map((f) => f.name).toSet(),
        <String>{'nenhum', 'encolhido', 'cheio'},
      );
    });

    testWidgets('nao ha controle de dispensa definitiva na faixa',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      for (final proibido in <String>[
        'Não mostrar mais',
        'Nunca mais',
        'Não me lembre',
        'Dispensar',
      ]) {
        expect(find.text(proibido), findsNothing, reason: 'REPROVA: "$proibido"');
      }
    });
  });

  group('criterios 6 e 9 — o e-mail que nao chega', () {
    testWidgets('tres dispensas trocam o texto para a pergunta do endereco',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        depositoDoAviso: DepositoDoAvisoEmMemoria(
          conteudoInicial: '{"conta":"u-1",'
              '"dispensado_em":"2026-09-01T10:00:00.000Z","dispensas":3}',
        ),
        agora: () => DateTime.utc(2026, 9, 22, 10),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('O e-mail marina@exemplo.com.br está certo?'),
        findsOneWidget,
      );
      expect(find.text('Está certo, reenviar'), findsOneWidget);
    });

    testWidgets(
        'ISCA — `email_deliverable: false` volta CHEIO mesmo dentro dos 7 dias',
        (tester) async {
      // Endereco que o provedor devolveu nao e lembrete adiavel. Sem esta
      // excecao ao ciclo, o tutor de e-mail invalido dispensa uma vez e passa
      // sete dias sem descobrir que ninguem consegue avisa-lo -- que e o
      // bloqueio que o refinamento de 17/09 levantou e que
      // `Me.email_deliverable` entrou no contrato para fechar.
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          emailVerificado: false,
          emailEntregavel: false,
        ),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        depositoDoAviso: DepositoDoAvisoEmMemoria(
          conteudoInicial: '{"conta":"u-1",'
              '"dispensado_em":"2026-09-21T10:00:00.000Z","dispensas":1}',
        ),
        agora: () => DateTime.utc(2026, 9, 22, 10),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('O e-mail marina@exemplo.com.br está certo?'),
        findsOneWidget,
        reason: 'REPROVA: o e-mail voltou como devolucao definitiva e o aviso '
            'ficou encolhido porque a pessoa dispensou ontem. O criterio 9 e '
            'literal: o ciclo de 7 dias NAO se aplica a endereco que nao '
            'entrega.',
      );
      expect(
        find.text('Agora não'),
        findsNothing,
        reason: 'REPROVA: `Agora nao` e renderizado com o endereco nao '
            'entregavel. Tocar nele nao teria efeito nenhum na proxima '
            'abertura, porque o criterio 9 traz a faixa de volta cheia de '
            'qualquer jeito -- e botao que nao faz nada e o defeito que este '
            'app persegue desde a BICHUS-62.',
      );
    });
  });

  group('criterio 10 — troca de endereco em curso', () {
    testWidgets('o aviso aponta para o endereco NOVO', (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          emailVerificado: false,
          emailPendente: 'marina.nova@exemplo.com.br',
        ),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.textContaining('marina.nova@exemplo.com.br'),
        findsOneWidget,
        reason: 'REPROVA: ha troca de endereco em curso e o aviso nao cita o '
            'endereco novo. Repetir o pedido sobre o antigo manda a pessoa '
            'corrigir o que ela acabou de corrigir.',
      );
      expect(find.text('Confirme seu e-mail'), findsNothing);
    });

    testWidgets('ISCA — a troca em curso vence o texto de endereco errado',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          emailVerificado: false,
          emailEntregavel: false,
          emailPendente: 'marina.nova@exemplo.com.br',
        ),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(
        find.text('O e-mail marina@exemplo.com.br está certo?'),
        findsNothing,
        reason: 'REPROVA: a pessoa ja pediu a troca do endereco e o app '
            'continua perguntando se o antigo esta certo. Ela ja respondeu '
            'essa pergunta, com "nao".',
      );
      expect(find.textContaining('marina.nova@exemplo.com.br'), findsOneWidget);
    });
  });

  group('criterio 8 — nao e medidor de perfil', () {
    testWidgets('ISCA — sem barra, sem porcentagem, sem "complete seu cadastro"',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);

      final aviso = find.byType(AvisoDeCadastroIncompleto);
      expect(aviso, findsOneWidget, reason: 'precondicao: o aviso esta na tela');
      expect(
        find.descendant(
          of: aviso,
          matching: find.byType(LinearProgressIndicator),
        ),
        findsNothing,
        reason: 'REPROVA: o aviso ganhou barra de progresso. O criterio 8 a '
            'proibe porque perfil completo e objetivo do APP, nao da pessoa: '
            'o que e dela e o pet voltar para casa.',
      );
      expect(
        find.descendant(
          of: aviso,
          matching: find.byType(CircularProgressIndicator),
        ),
        findsNothing,
      );
      expect(find.textContaining('complete seu cadastro'), findsNothing);
      expect(find.textContaining('Complete seu cadastro'), findsNothing);
      expect(find.textContaining('%'), findsNothing);
    });
  });

  group('criterio 2 — a segunda posicao, em `Perfil`', () {
    testWidgets('o aviso e o primeiro item da lista, acima do proprio e-mail',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.perfil);

      expect(find.text('Confirme seu e-mail'), findsOneWidget);
      final yDoAviso = tester.getTopLeft(find.text('Confirme seu e-mail')).dy;
      final yDoEmail =
          tester.getTopLeft(find.text('marina@exemplo.com.br')).dy;
      expect(
        yDoAviso,
        lessThan(yDoEmail),
        reason: 'REPROVA: o aviso esta ABAIXO da linha do proprio e-mail. O '
            'criterio 2 o chama de item destacado no TOPO da lista, e um '
            'destaque abaixo da linha que ele comenta e nota de rodape.',
      );
    });
  });

  group('criterio 2 — a terceira posicao, no cartao de cada pet', () {
    testWidgets('a linha discreta aparece em TODOS os cartoes',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        rede: (requisicao) async {
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{
              'items': <dynamic>[
                <String, dynamic>{
                  'id': 'p-1',
                  'name': 'Nina',
                  'species': 'dog',
                  'status': 'active',
                },
                <String, dynamic>{
                  'id': 'p-2',
                  'name': 'Rex',
                  'species': 'dog',
                  'status': 'active',
                },
              ],
            });
          }
          return json200(<String, dynamic>{});
        },
      );
      await irPara(tester, Rotas.perfil);

      expect(
        find.text('E-mail não confirmado'),
        findsNWidgets(2),
        reason: 'REPROVA: a linha discreta do criterio 2 nao aparece nos dois '
            'cartoes. O criterio diz "no cartao de CADA pet".',
      );
    });

    testWidgets(
        'ISCA — a linha do cartao entra no rotulo acessivel, e nao so no pixel',
        (tester) async {
      // O cartao e `excludeSemantics` com rotulo composto. Uma linha visivel
      // que nao entrasse no rotulo seria informacao que so existe para quem
      // enxerga, apagada em silencio pelo proprio `excludeSemantics`.
      final semantica = tester.ensureSemantics();
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        rede: (requisicao) async {
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{
              'items': <dynamic>[
                <String, dynamic>{
                  'id': 'p-1',
                  'name': 'Nina',
                  'species': 'dog',
                  'status': 'active',
                },
              ],
            });
          }
          return json200(<String, dynamic>{});
        },
      );
      await irPara(tester, Rotas.perfil);

      final rotulos = <String>[];
      void percorrer(SemanticsNode no) {
        if (no.label.isNotEmpty) rotulos.add(no.label);
        no.visitChildren((filho) {
          percorrer(filho);
          return true;
        });
      }

      percorrer(tester.binding.pipelineOwner.semanticsOwner!.rootSemanticsNode!);
      expect(
        rotulos.where((r) => r.contains('Nina') &&
            r.contains('E-mail não confirmado')),
        isNotEmpty,
        reason: 'REPROVA: o cartao da Nina mostra a linha do aviso na tela e '
            'nao a diz no leitor de tela. `excludeSemantics` apaga a arvore do '
            'filho, entao tudo o que o cartao mostra precisa estar no rotulo '
            'composto por `rotuloAcessivelDe`.',
      );
      semantica.dispose();
    });

    testWidgets('e-mail verificado NAO poe linha nenhuma no cartao',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: true),
        rede: (requisicao) async {
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{
              'items': <dynamic>[
                <String, dynamic>{
                  'id': 'p-1',
                  'name': 'Nina',
                  'species': 'dog',
                  'status': 'active',
                },
              ],
            });
          }
          return json200(<String, dynamic>{});
        },
      );
      await irPara(tester, Rotas.perfil);
      expect(find.text('E-mail não confirmado'), findsNothing);
    });
  });

  group('acessibilidade do app MONTADO', () {
    testWidgets(
        'ISCA — a linha encolhida anuncia botao E publica a acao de toque',
        (tester) async {
      // `btn=true tap=false` e o defeito que quatro widgets deste app ja
      // tiveram: o leitor de tela anuncia um botao que quem usa leitor nao
      // consegue acionar. Medido no APP MONTADO, e nao num widget solto.
      final semantica = tester.ensureSemantics();
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        depositoDoAviso: DepositoDoAvisoEmMemoria(
          conteudoInicial: '{"conta":"u-1",'
              '"dispensado_em":"2026-09-21T10:00:00.000Z","dispensas":1}',
        ),
        agora: () => DateTime.utc(2026, 9, 22, 10),
        rede: _redeMuda,
      );
      await irPara(tester, Rotas.pets);
      expect(find.text('E-mail não confirmado'), findsOneWidget);

      final acusados = <String>[];
      void percorrer(SemanticsNode no) {
        final ehBotao = no.hasFlag(SemanticsFlag.isButton);
        final temToque = no.getSemanticsData().hasAction(SemanticsAction.tap);
        if (ehBotao && !temToque) acusados.add(no.label);
        no.visitChildren((filho) {
          percorrer(filho);
          return true;
        });
      }

      percorrer(tester.binding.pipelineOwner.semanticsOwner!.rootSemanticsNode!);
      expect(
        acusados,
        isEmpty,
        reason: 'REPROVA: ha no(s) anunciado(s) como botao sem acao de toque '
            'na aba com o aviso encolhido: $acusados. Quem usa VoiceOver ouve '
            '"botao" e nao tem como aciona-lo.',
      );
      semantica.dispose();
    });
  });

  group('`Reenviar` — e o que ele NAO diz quando falha', () {
    testWidgets('o toque chama POST /auth/email-verification', (tester) async {
      final chamadas = <String>[];
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: (requisicao) async {
          chamadas.add('${requisicao.method} ${requisicao.url.path}');
          return json200(<String, dynamic>{'items': <dynamic>[]});
        },
      );
      await irPara(tester, Rotas.pets);
      await tocar(tester, find.text('Reenviar'));

      expect(
        chamadas.where((c) => c.contains('/auth/email-verification')),
        isNotEmpty,
        reason: 'REPROVA: `Reenviar` nao foi ao servidor. Um botao que so muda '
            'a tela e o "sucesso do que nao aconteceu" que o criterio 2 da '
            'BICHUS-31 proibe.',
      );
    });

    testWidgets('ISCA — reenvio que falhou NAO diz que o e-mail saiu',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(emailVerificado: false),
        cacheDeMeusPets: _cacheCom(<Pet>[_pet()]),
        rede: (requisicao) async {
          if (requisicao.url.path.contains('/auth/email-verification')) {
            return http.Response('', 500);
          }
          return json200(<String, dynamic>{'items': <dynamic>[]});
        },
      );
      await irPara(tester, Rotas.pets);
      await tocar(tester, find.text('Reenviar'));

      expect(
        find.text('E-mail reenviado.'),
        findsNothing,
        reason: 'REPROVA: o servidor recusou o reenvio e a tela anunciou que o '
            'e-mail foi reenviado. A pessoa vai esperar na caixa de entrada um '
            'e-mail que nunca saiu, e o criterio 2 da BICHUS-31 proibe '
            'exatamente isso.',
      );
      expect(find.textContaining('Não conseguimos reenviar'), findsOneWidget);
      expect(
        find.text('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'o aviso continua la: a falha nao dispensa nada',
      );
    });
  });
}
