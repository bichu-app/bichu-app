// BICHUS-24 — o registro das duas oportunidades: o que ele guarda, e o que
// NAO pode apaga-lo.
//
// ---------------------------------------------------------------------------
// A ISCA PRINCIPAL DESTE ARQUIVO E O LOGOUT
// ---------------------------------------------------------------------------
//
// `app.dart` tem uma lista `limpezasAoSair`, e ela cresce. Hoje limpa o cache
// de `Meus pets` e o cofre da imagem do QR; o criterio para entrar nela e
// claro e esta escrito la: o que e da CONTA nao pode vazar para a proxima
// pessoa que entrar neste aparelho.
//
// O registro das oportunidades parece caber nesse criterio, e nao cabe. Ele
// nao e da conta: e do APARELHO. O dialogo de notificacao do iOS e gasto uma
// vez por INSTALACAO, nao por login. Limpar o registro no logout daria ao
// tutor seguinte duas antessalas novas cujo `Sim` abriria um dialogo que o
// sistema nao mostra mais -- e ele ficaria olhando para um botao que nao faz
// nada, que e exatamente o que a porta `Avisos` foi desenhada para impedir.
//
// Essa e uma decisao que se perde. Ela e contraintuitiva, esta a uma linha de
// distancia de ser "corrigida" por alguem zeloso, e o estrago dela nao tem
// sintoma no aparelho de quem a escreveu -- ele aparece no segundo tutor do
// mesmo celular, que ninguem testa a mao. Por isso ela tem isca propria, e nao
// so um comentario: comentario nao reprova.
//
// ---------------------------------------------------------------------------
// E A SEGUNDA: O QUE ACONTECE QUANDO O DISCO NAO COLABORA
// ---------------------------------------------------------------------------
//
// Leitura que falha nao pode virar "nunca ofereci": isso devolveria a
// antessala a quem ja a recusou, que e o defeito que este arquivo inteiro
// existe para fechar. O lado seguro de uma leitura que nao respondeu e
// assumir que as duas ja foram gastas -- o app fica calado, e calado tem
// conserto pelos ajustes; insistente nao tem.

import 'dart:convert';

import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/oportunidades_de_aviso.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../telas/ajuda_de_tela.dart';

/// Um deposito que **recusa** ler e gravar, para o caminho do disco ruim.
class DepositoQueFalha implements DepositoDeOportunidades {
  @override
  Future<String?> ler() async => throw const FileSystemExceptionDeTeste();

  @override
  Future<void> gravar(String conteudo) async =>
      throw const FileSystemExceptionDeTeste();
}

class FileSystemExceptionDeTeste implements Exception {
  const FileSystemExceptionDeTeste();
}

void main() {
  group('o registro em si', () {
    test('nasce vazio: as duas oportunidades cabem', () async {
      final o = OportunidadesDeAviso(
        deposito: DepositoDeOportunidadesEmMemoria(),
      );
      expect(await o.aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado), isTrue);
      expect(await o.aindaCabe(OportunidadeDeAviso.primeiroCasoDePerdido), isTrue);
    });

    test('gastar uma NAO gasta a outra', () async {
      // O limite e de dois momentos com um tiro cada, e nao de duas fichas
      // gastaveis onde der: gastar F1.6 nao pode consumir a chance de F3.2,
      // que e a que chega com o pet ja perdido.
      final o = OportunidadesDeAviso(
        deposito: DepositoDeOportunidadesEmMemoria(),
      );
      await o.gastar(OportunidadeDeAviso.primeiroPetCadastrado);

      expect(
        await o.aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado),
        isFalse,
      );
      expect(
        await o.aindaCabe(OportunidadeDeAviso.primeiroCasoDePerdido),
        isTrue,
        reason: 'REPROVA: gastar a oportunidade de F1.6 consumiu tambem a de '
            'F3.2. A segunda e a que chega com o pet perdido e o melhor '
            'argumento que o produto tem; perde-la por causa da primeira e '
            'perder a unica chance que sobrava.',
      );
    });

    test('gastar duas vezes a mesma nao grava duas vezes', () async {
      final deposito = DepositoDeOportunidadesEmMemoria();
      final o = OportunidadesDeAviso(deposito: deposito);
      await o.gastar(OportunidadeDeAviso.primeiroPetCadastrado);
      await o.gastar(OportunidadeDeAviso.primeiroPetCadastrado);
      expect(deposito.gravacoes, 1);
    });

    test('o que foi gasto sobrevive a um objeto novo sobre o mesmo disco',
        () async {
      // O app novo de amanha de manha: outro processo, outra instancia, o
      // mesmo arquivo. Se isto reprovar, "duas oportunidades" virou "duas por
      // arranque".
      final deposito = DepositoDeOportunidadesEmMemoria();
      await OportunidadesDeAviso(deposito: deposito)
          .gastar(OportunidadeDeAviso.primeiroCasoDePerdido);

      final amanha = OportunidadesDeAviso(deposito: deposito);
      expect(
        await amanha.aindaCabe(OportunidadeDeAviso.primeiroCasoDePerdido),
        isFalse,
        reason: 'REPROVA: o registro nao sobreviveu. O limite se reinicia a '
            'cada abertura do app, e um limite que se reinicia nao e limite.',
      );
    });

    test('nome desconhecido no arquivo e ignorado, e nao estoura', () async {
      // Uma versao futura pode gravar um nome que esta versao nao conhece --
      // e um app antigo continua instalado por semanas. Estourar aqui
      // derrubaria o cadastro de pet por causa de um arquivo de contagem.
      final o = OportunidadesDeAviso(
        deposito: DepositoDeOportunidadesEmMemoria(
          conteudoInicial: jsonEncode(<String, dynamic>{
            'gastas': <String>['primeiro_pet_cadastrado', 'algo_do_futuro'],
          }),
        ),
      );
      expect(await o.aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado), isFalse);
      expect(await o.aindaCabe(OportunidadeDeAviso.primeiroCasoDePerdido), isTrue);
    });

    test('arquivo corrompido e lido como "nada gasto"', () async {
      // JSON pela metade e o caso em que o `rename` atomico nao chegou a
      // acontecer: nao ha registro, e nao ha registro significa nada gasto.
      final o = OportunidadesDeAviso(
        deposito: DepositoDeOportunidadesEmMemoria(conteudoInicial: '{"gast'),
      );
      expect(await o.aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado), isTrue);
    });

    test('ISCA — disco que nao responde fecha as duas, e nao abre as duas',
        () async {
      // O lado seguro de uma leitura que falhou. Abrir as duas por causa de um
      // erro de disco devolveria a antessala a quem ja a recusou, e num
      // aparelho com disco instavel isso viraria antessala a cada cadastro.
      final o = OportunidadesDeAviso(deposito: DepositoQueFalha());
      expect(
        await o.aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado),
        isFalse,
        reason: 'REPROVA: a leitura falhou e o app concluiu "nunca ofereci". '
            'Falha de leitura virou permissao para insistir, e quem paga e a '
            'pessoa que ja disse nao.',
      );
      expect(
        await o.aindaCabe(OportunidadeDeAviso.primeiroCasoDePerdido),
        isFalse,
      );
    });

    test('gravacao que falha nao propaga: o cadastro do pet nao cai', () async {
      // A pessoa esta cadastrando um pet. Um arquivo de contagem que nao
      // gravou nao pode derrubar isso.
      final o = OportunidadesDeAviso(deposito: DepositoQueFalha());
      await expectLater(
        o.gastar(OportunidadeDeAviso.primeiroPetCadastrado),
        completes,
      );
    });

    test('o nome gravado no disco e escrito a mao, e nao o `name` do enum',
        () async {
      // O arquivo e um contrato com o passado: renomear o valor em Dart e uma
      // refatoracao, e ela nao pode reabrir uma oportunidade que a pessoa ja
      // gastou no aparelho dela.
      expect(
        OportunidadeDeAviso.primeiroPetCadastrado.noDisco,
        'primeiro_pet_cadastrado',
      );
      expect(
        OportunidadeDeAviso.primeiroCasoDePerdido.noDisco,
        'primeiro_caso_de_perdido',
      );
      expect(
        OportunidadeDeAviso.values,
        hasLength(2),
        reason: 'REPROVA: o enum deixou de ter exatamente dois valores. "Duas '
            'oportunidades e nao mais" esta escrito AQUI, na cardinalidade do '
            'enum: uma terceira so pode nascer como ato deliberado, com nome '
            'e motivo no diff.',
      );
    });
  });

  group('ISCA — o registro NAO some no logout', () {
    testWidgets(
        'sair da conta NAO devolve as oportunidades ao proximo tutor',
        (tester) async {
      final deposito = DepositoDeOportunidadesEmMemoria();
      await abrirOApp(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.naoPedida),
        oportunidades: deposito,
        deposito: depositoLogado(),
        rede: (requisicao) async {
          if (requisicao.url.path.endsWith('/me/devices')) {
            return json200(<String, dynamic>{
              'id': '2',
              'platform': 'android',
              'push_permission': 'not_asked',
            });
          }
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return json200(
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
        },
      );
      await irPara(
        tester,
        Rotas.petCadastrado,
        extra: ResultadoDoCadastro(
          pet: Pet(
            id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
            nome: 'Nina',
            especie: Especie.cao,
            redacoesDeCuidados: const <RedacaoDeCuidados>[],
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tocar(tester, find.text(TextosDaAntessala.agoraNao));

      final contexto = tester.element(find.byType(Scaffold).first);
      final escopo = Escopo.of(contexto);
      expect(
        await escopo.oportunidades
            .aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado),
        isFalse,
        reason: 'precondicao: a oportunidade foi gasta antes do logout',
      );

      // O LOGOUT, pelo controlador -- que e quem roda `limpezasAoSair` nos
      // QUATRO desfechos de `sair()`, inclusive o que nao passa por botao
      // nenhum (sessao derrubada por refresh recusado).
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      // O estado no DISCO, que e o que o proximo arranque vai ler.
      final depoisDoLogout = OportunidadesDeAviso(deposito: deposito);
      expect(
        await depoisDoLogout
            .aindaCabe(OportunidadeDeAviso.primeiroPetCadastrado),
        isFalse,
        reason: 'REPROVA: o registro das oportunidades foi apagado no logout, '
            'quase certamente por ter entrado em `limpezasAoSair`. Ele NAO e '
            'da conta, e do APARELHO: o dialogo do iOS e gasto uma vez por '
            'instalacao, nao por login. O proximo tutor neste celular ganha '
            'duas antessalas novas, toca em `Sim`, e o sistema nao abre '
            'dialogo nenhum -- um botao que nao faz nada, na tela em que o '
            'produto pede a permissao de que ele mais depende.\n'
            'O que de fato precisa morrer com a conta e o CONSENTIMENTO '
            'gravado com a versao do texto da antessala, e isso e do servidor '
            '(ressalva do refinamento de 17/09).',
      );
    });
  });
}
