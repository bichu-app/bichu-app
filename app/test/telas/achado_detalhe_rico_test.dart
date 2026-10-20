// A TELA DO ACHADO (`/achados/:achadoId`) DIZ O QUE O DESFECHO DIZ.
//
// O desfecho de 18/10 ganhou foto e tres blocos pelo pedido do cliente -- *"Na
// pagina 'achado registrado' nao mostra muita informacao, nao tem foto do pet
// ou alguma informacao util"*. A tela do achado e o DESTINO do botao `Ver o
// achado` daquele desfecho, e ficou com o desenho antigo: um paragrafo, a linha
// da regiao, a observacao e uma faixa. Estes casos cobram que os tres blocos
// chegaram aqui, que o que esta tela SABE a mais nao e desperdicado, e que o
// que ela NAO sabe nao e inventado.
//
// COMO DESLIGAR O MECANISMO E VER CADA CASO REPROVAR (a isca e isca):
//
//  1. Em `telas/achado/tela_do_achado.dart`, apague o `BlocoDeInformacao` de
//     `tituloDoQueFazerAgora`.
//     -> reprova `os tres blocos do desfecho chegaram a esta tela`.
//  2. No mesmo arquivo, troque `MeusAchados.rotuloDoEstado(achado.status)` por
//     `TextosDoAchado.estadoEmAnalise`.
//     -> reprova `o estado vem do SERVIDOR, e nao e Em analise fixo` -- e passa
//        a ancora, que e o ponto: a reprovacao e pela mentira, nao pelo vazio.
//  3. No mesmo arquivo, troque a lista do bloco `tituloDeQuemFoiAvisado` por
//     `<String>['O tutor foi avisado. Ele recebeu o aviso no celular.']`.
//     -> reprova `a tela NAO afirma que o tutor foi avisado`.
//  4. No mesmo arquivo, troque `TextosDoAchado.fotoNaoApareceAqui` por
//     `TextosDoAchado.fotoAindaNaoSubiu`.
//     -> reprova `a tela diz onde a foto esta, sem afirmar o estado do envio`.
//  5. No mesmo arquivo, desembrulhe o `ArrastarParaAtualizar` (deixe o
//     `ListView` direto no `SafeArea`).
//     -> reprova `o arrasto refaz o GET do achado`.
//  6. No mesmo arquivo, mova os tres blocos para fora do `else if (achado !=
//     null)`, para a raiz do `ListView`.
//     -> reprova `na ausencia NENHUM bloco aparece`.
//  7. No mesmo arquivo, acrescente `achado.photoUrl` -- ou qualquer leitura de
//     `photo_url` -- ao corpo.
//     -> reprova `a tela nao le photo_url, que o contrato promete vazio`.
//
// POR QUE A TELA DE TESTE E ALTA (4000 dp), e a licao e emprestada do caso do
// desfecho: `ListView` **nao constroi o que nao cabe**. Na tela padrao os
// blocos de baixo nao entram na arvore, e um `findsNothing` sobre eles ficaria
// verde por nunca terem sido construidos -- o defeito recorrente deste
// repositorio. Com a tela alta, presenca e ausencia medem a MESMA arvore.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/modelos_achado.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/tela_do_achado.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/perfil/meus_achados.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../dispositivo/diretivas_dart.dart';
import 'ajuda_de_tela.dart';

const String _idDoAchado = '01a14d3f-d95f-70b1-b31e-16d141678d34';

/// O servidor do caso: ele CONTA os pedidos do achado, porque o caso do arrasto
/// mede que a busca foi refeita -- e nao que a roda girou.
class _Servidor {
  _Servidor({
    this.status = 200,
    this.area = 'Vila Gertrudes, São Paulo',
    this.achadoEm = '2026-10-18T04:23:12Z',
    this.observacao = 'coleira azul sem placa, mancha branca no peito',
    this.estado = 'open',
  });

  int status;
  String? area;
  String? achadoEm;
  String? observacao;
  String estado;

  final List<Uri> pedidosDoAchado = <Uri>[];

  Future<http.Response> responder(http.Request pedido) async {
    if (pedido.url.path.contains('/found-reports/')) {
      pedidosDoAchado.add(pedido.url);
      if (status != 200) return problema('not-found', status);
      return http.Response(
        jsonEncode(<String, dynamic>{
          'id': _idDoAchado,
          'origin': 'stray_report',
          'status': estado,
          'created_at': '2026-10-18T04:23:12Z',
          if (achadoEm != null) 'found_at': achadoEm,
          if (area != null) 'area_label': area,
          if (observacao != null) 'notes': observacao,
        }),
        200,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    return http.Response(
      '{}',
      200,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }
}

Future<_Servidor> _abrir(WidgetTester tester, {_Servidor? servidor}) async {
  final servidorDoCaso = servidor ?? _Servidor();
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    rede: servidorDoCaso.responder,
  );
  await irPara(tester, Rotas.achadoDe(_idDoAchado));
  return servidorDoCaso;
}

/// **O ARRASTO, como o dedo o faz.**
///
/// `fling` e nao `drag`, pela razao medida em
/// `test/widgets/arrastar_para_atualizar_test.dart`: o `RefreshIndicator` so
/// dispara quando o excesso de rolagem passa do limite dele **E** o gesto
/// termina com velocidade -- um `drag` chega ao limite e volta sem soltar o
/// gatilho.
///
/// **1400 dp, e o numero vem da tela alta deste arquivo.** O limite do
/// `RefreshIndicator` e 25% da ALTURA DO VIEWPORT
/// (`_kDragContainerExtentPercentage`): na tela de 4000 dp que estes casos
/// montam, o gatilho fica em 1000 dp, e o `fling` de 320 dp que serve na tela
/// padrao nunca o alcanca. Medido: com 320 dp os dois casos do arrasto
/// reprovavam dizendo que o gesto nao existe -- **com o gesto funcionando**, o
/// que seria um portao mentindo na direcao mais caprichosa de depurar.
///
/// **O rolavel e procurado DENTRO de [TelaDoAchado]**, e nao por
/// `find.byType(Scrollable).first`. A tela entra por `push` sobre a casca das
/// cinco secoes, que tem rolavel proprio e continua na arvore debaixo: o
/// `.first` pegava o da casca, o arrasto ia para a secao errada e o caso
/// reprovava dizendo que o gesto nao existe -- com o gesto funcionando.
Future<void> _arrastarParaBaixo(WidgetTester tester) async {
  final rolavel = find
      .descendant(
        of: find.byType(TelaDoAchado),
        matching: find.byType(Scrollable),
      )
      .first;
  expect(
    rolavel,
    findsOneWidget,
    reason:
        'REPROVA NA ANCORA: nao achei rolavel dentro de `TelaDoAchado`. O '
        '`RefreshIndicator` precisa de um `Scrollable` descendente -- ele nao '
        'cria rolagem.',
  );
  await tester.fling(rolavel, const Offset(0, 1400), 2000);
  await tester.pumpAndSettle();
}

/// A ANCORA de todo caso de ausencia deste arquivo.
///
/// Ela existe para a reprovacao significar "a tela mentiu" e nunca "a tela nao
/// carregou". Sem ela, um `findsNothing` passaria com um `Scaffold` vazio.
void _ancorarNoAchadoCarregado(WidgetTester tester) {
  expect(
    find.text(TextosDoAchado.tituloDoQueGuardamos),
    findsOneWidget,
    reason:
        'REPROVA NA ANCORA: o cabecalho "${TextosDoAchado.tituloDoQueGuardamos}" '
        'nao esta na tela, entao o achado nao carregou. Este caso cobra uma '
        'AUSENCIA logo abaixo, e ausencia sobre tela em branco e o portao cego '
        'que este repositorio ja produziu duas vezes. Conserte a ancora antes '
        'de ler o resto.',
  );
}

void main() {
  group('os tres blocos do desfecho', () {
    testWidgets('os tres blocos do desfecho chegaram a esta tela', (
      tester,
    ) async {
      await _abrir(tester);

      for (final titulo in <String>[
        TextosDoAchado.tituloDoQueGuardamos,
        TextosDoAchado.tituloDeQuemFoiAvisado,
        TextosDoAchado.tituloDoQueFazerAgora,
      ]) {
        expect(
          find.text(titulo),
          findsOneWidget,
          reason:
              'REPROVA: o bloco "$titulo" nao esta na tela do achado. Ela e o '
              'destino do botao `Ver o achado` do desfecho, e quem volta ao app '
              'no dia seguinte chega AQUI e nao la -- o desfecho so existe no '
              'instante do envio.',
        );
      }

      // Os tres passos, e o primeiro e o unico que alcanca o tutor hoje.
      for (final passo in <String>[
        TextosDoAchado.passoDaPlaquinha,
        TextosDoAchado.passoDaListaDePerdidos,
        TextosDoAchado.passoDeCuidar,
      ]) {
        expect(find.text(passo), findsOneWidget, reason: 'REPROVA: falta "$passo".');
      }

      expect(
        find.text(TextosDoAchado.escanearAPlaquinha),
        findsOneWidget,
        reason:
            'REPROVA: falta a acao "${TextosDoAchado.escanearAPlaquinha}". E o '
            'passo 1 do bloco, e o unico caminho que chega ao tutor sem '
            'depender do aviso no celular -- que nao funciona.',
      );
    });

    testWidgets('os sinais que a pessoa descreveu aparecem com rotulo', (
      tester,
    ) async {
      await _abrir(tester);

      expect(find.text(TextosDoAchado.rotuloDosSinais), findsOneWidget);
      expect(
        find.text('coleira azul sem placa, mancha branca no peito'),
        findsOneWidget,
        reason:
            'REPROVA: a observacao que a pessoa escreveu nao aparece. E a '
            'informacao mais util da tela para reconhecer o animal.',
      );
    });

    testWidgets('sem observacao o rotulo dos sinais nao sobra sozinho', (
      tester,
    ) async {
      // `notes` e opcional no contrato. Um rotulo "Os sinais que voce
      // descreveu" acima do nada pareceria conteudo que falhou ao carregar.
      await _abrir(tester, servidor: _Servidor(observacao: null));
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.text(TextosDoAchado.rotuloDosSinais),
        findsNothing,
        reason:
            'REPROVA: a tela desenhou o rotulo "${TextosDoAchado.rotuloDosSinais}" '
            'sem ter sinal nenhum para mostrar embaixo.',
      );
    });
  });

  group('o que esta tela SABE, e o desfecho nao', () {
    testWidgets('o estado vem do SERVIDOR, e nao e Em analise fixo', (
      tester,
    ) async {
      // `matched`: o servidor achou um tutor parecido. O desfecho escreve
      // `Em analise` a mao porque ali o achado nasceu `open` dois segundos
      // antes; aqui o achado pode ter qualquer estado.
      await _abrir(tester, servidor: _Servidor(estado: 'matched'));
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.text(MeusAchados.rotuloDoEstado(StatusDoAchado.comCorrespondencia)),
        findsOneWidget,
        reason:
            'REPROVA: o achado esta `matched` e a tela nao diz '
            '"${MeusAchados.rotuloDoEstado(StatusDoAchado.comCorrespondencia)}". '
            'A traducao e a de `Meus achados`, de proposito: duas traducoes do '
            'mesmo `status` divergem, e as duas telas estao a dois toques uma '
            'da outra na mesma conta.',
      );
      expect(
        find.text(TextosDoAchado.estadoEmAnalise),
        findsNothing,
        reason:
            'REPROVA: a tela diz "${TextosDoAchado.estadoEmAnalise}" sobre um '
            'achado que o servidor devolveu como `matched`. Estado fixo escrito '
            'na tela e a tela afirmando o que o servidor nega -- a mesma classe '
            'de defeito que o bloco `Quem foi avisado` existe para nao '
            'repetir.',
      );
    });

    testWidgets('regiao nula vira a linha neutra, e nao o bairro digitado', (
      tester,
    ) async {
      await _abrir(tester, servidor: _Servidor(area: null));
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.text(TextosDoAchado.regiaoNaoInformada),
        findsOneWidget,
        reason:
            'REPROVA: sem `area_label` a tela deve dizer '
            '"${TextosDoAchado.regiaoNaoInformada}". O rotulo publico so se '
            'monta com texto digitado, e derivar bairro de coordenada e o que '
            'o ADR-0006 proibe.',
      );
    });

    testWidgets('found_at nulo nao vira data inventada', (tester) async {
      await _abrir(tester, servidor: _Servidor(achadoEm: null));
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.textContaining('Achado em '),
        findsNothing,
        reason:
            'REPROVA: `found_at` e anulavel no contrato e a tela mostrou uma '
            'data mesmo assim. Nulo nao vira o relogio de agora: a linha '
            'simplesmente nao sai.',
      );
    });
  });

  group('quem foi avisado', () {
    testWidgets('a tela NAO afirma que o tutor foi avisado', (tester) async {
      await _abrir(tester);

      expect(
        find.text(TextosDoAchado.ninguemFoiAvisado),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao diz "${TextosDoAchado.ninguemFoiAvisado}". Nao '
            'e delicadeza de redacao: o envio de aviso no celular nao funciona '
            'em producao (falta permissao da conta de servico na VM) e nao '
            'funciona nenhum no iPhone deste build. Quem acredita que alguem '
            'foi chamado solta o animal na rua.',
      );
      expect(
        find.text(TextosDoAchado.avisoNoCelularNaoFunciona),
        findsOneWidget,
        reason:
            'REPROVA: falta a linha que diz que o aviso no celular nao '
            'funciona. Duas linhas acima a tela promete "a gente te avisa" '
            '(`registradoCorpo`), e sem esta frase a pessoa espera um toque no '
            'telefone que nao vai chegar.',
      );
      expect(
        find.text(TextosDoAchado.oQueOTutorRecebe),
        findsOneWidget,
        reason: 'REPROVA: falta o que o tutor recebe, e quando.',
      );
    });
  });

  group('a foto, que esta tela NAO tem', () {
    testWidgets('a tela diz onde a foto esta, sem afirmar o estado do envio', (
      tester,
    ) async {
      await _abrir(tester);
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.text(TextosDoAchado.fotoNaoApareceAqui),
        findsOneWidget,
        reason:
            'REPROVA: a tela nao diz onde a foto esta. Silencio aqui faz a '
            'pessoa achar que a foto que ela escolheu se perdeu.',
      );
      expect(
        find.text(TextosDoAchado.fotoAindaNaoSubiu),
        findsNothing,
        reason:
            'REPROVA: a tela afirma "${TextosDoAchado.fotoAindaNaoSubiu}" -- e '
            'ela NAO SABE disso. O `GET` de um achado nao devolve estado de '
            'envio de foto (`FoundReport` nao tem campo de foto nenhum), e esta '
            'frase era afirmada em toda visita, sobre todo achado, sem nunca '
            'ter sido medida.',
      );
      expect(
        find.text(TextosDoAchado.semFoto),
        findsNothing,
        reason:
            'REPROVA: a tela afirma que o achado foi registrado sem foto, e ela '
            'nao tem como saber se houve foto.',
      );
    });

    testWidgets('nenhum quadro de foto e desenhado, nem um lugar reservado', (
      tester,
    ) async {
      await _abrir(tester);
      _ancorarNoAchadoCarregado(tester);

      expect(
        find.byType(PreviaDaFoto),
        findsNothing,
        reason:
            'REPROVA: `PreviaDaFoto` desenha arquivo do APARELHO, e esta tela '
            'nao tem a `FotoLocal` -- ela chega por URL e tudo que sabe vem do '
            '`GET`. Um quadro aqui so poderia nascer de uma gaveta nova por '
            '`achadoId`, que e o que `tela_registrar_achado.dart` se recusa a '
            'ter: foto do animal de alguem sobrevivendo ao logout num aparelho '
            'compartilhado.',
      );
      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason:
            'REPROVA: `ImagemDaRede` precisa de uma `url` nao anulavel, e '
            '`FoundReport.photo_url` volta NULO por criterio do contrato. Nao '
            'existe endereco para pedir.',
      );
    });

    test('a tela nao le photo_url, que o contrato promete vazio', () {
      // PORTAO DE FONTE, e nao de arvore: um `findsNothing` sobre imagem fica
      // verde tambem quando a leitura existe e o servidor devolveu nulo -- que
      // e sempre. O que nao pode existir e a LEITURA.
      final arquivo = File('lib/telas/achado/tela_do_achado.dart');
      expect(
        arquivo.existsSync(),
        isTrue,
        reason:
            'REPROVA: nao achei `tela_do_achado.dart`. O caso le do DISCO e tem '
            'de rodar da raiz de `app/`, que e de onde `flutter test` roda.',
      );
      // **COMENTARIO FORA, pelo leitor que o portao da camera ja usa.** A
      // prosa desta tela EXPLICA por que `photo_url` nao e lido, e cita o
      // campo pelo nome -- um `contains` sobre o arquivo cru reprovaria
      // justamente a documentacao da decisao. `semComentarios`
      // (`test/dispositivo/diretivas_dart.dart`) existe para exatamente este
      // caso, e preserva os literais: no dia em que a tela montar uma string
      // com `photo_url` dentro, o portao continua vendo.
      final codigo = semComentarios(arquivo.readAsStringSync());
      expect(
        codigo.contains('photo_url'),
        isFalse,
        reason:
            'REPROVA: a tela le `photo_url`. O contrato promete esse campo '
            'VAZIO (`api/openapi.yaml`, `components/schemas/FoundReport`): a '
            'foto do achador e vista pelo tutor dentro da conversa mediada, e '
            'so. Ler um campo que nunca vem preenchido e desenhar o vazio dele '
            'e como esta classe de defeito volta.',
      );
    });
  });

  group('o gesto de arrastar', () {
    testWidgets('o arrasto refaz o GET do achado', (tester) async {
      final servidor = await _abrir(tester);
      expect(
        servidor.pedidosDoAchado.length,
        1,
        reason: 'REPROVA NA ANCORA: a tela nao fez o `GET` ao abrir.',
      );

      await _arrastarParaBaixo(tester);

      expect(
        servidor.pedidosDoAchado.length,
        2,
        reason:
            'REPROVA: o arrasto nao refez a busca. A tela le de rede e tem '
            '`_carregar`, e e a tela em que a pessoa volta no dia seguinte para '
            'ver se o estado do registro mudou -- que e o uso que o gesto '
            'serve. Ela ficou fora do lote de 18/10 porque o recorte daquele '
            'dia foi LISTAGEM, e o criterio nunca foi ser lista.',
      );
    });

    testWidgets('o arrasto traz o estado NOVO do servidor para a tela', (
      tester,
    ) async {
      // O gesto que pede de novo e desenha a resposta antiga seria pior que
      // gesto nenhum: a pessoa conferiu e saiu achando que nada mudou.
      final servidor = await _abrir(tester);
      _ancorarNoAchadoCarregado(tester);
      expect(find.text(TextosDoAchado.estadoEmAnalise), findsOneWidget);

      servidor.estado = 'matched';
      await _arrastarParaBaixo(tester);

      expect(
        find.text(MeusAchados.rotuloDoEstado(StatusDoAchado.comCorrespondencia)),
        findsOneWidget,
        reason:
            'REPROVA: o servidor passou a responder `matched` e a tela continua '
            'mostrando o estado antigo depois do arrasto.',
      );
    });
  });

  group('a ausencia continua total', () {
    testWidgets('na ausencia NENHUM bloco aparece', (tester) async {
      await _abrir(tester, servidor: _Servidor(status: 404));

      // A ancora INVERTIDA: aqui o que tem de existir e a frase da ausencia.
      expect(
        find.text(TextosDoAchado.naoEncontrado),
        findsOneWidget,
        reason:
            'REPROVA NA ANCORA: a tela nao diz '
            '"${TextosDoAchado.naoEncontrado}" no 404, entao os `findsNothing` '
            'abaixo nao medem nada.',
      );

      for (final titulo in <String>[
        TextosDoAchado.tituloDoQueGuardamos,
        TextosDoAchado.tituloDeQuemFoiAvisado,
        TextosDoAchado.tituloDoQueFazerAgora,
      ]) {
        expect(
          find.text(titulo),
          findsNothing,
          reason:
              'REPROVA: o bloco "$titulo" aparece sobre um achado que respondeu '
              'AUSENCIA. A mesma resposta vale para "nao existe" e para "nao e '
              'seu" (ADR-0021), e meia tela desenhada ja contaria, a quem nao e '
              'o dono, que aquele identificador e um achado de verdade.',
        );
      }
      expect(
        find.text(TextosDoAchado.ninguemFoiAvisado),
        findsNothing,
        reason:
            'REPROVA: a tela diz que ninguem foi avisado sobre um achado que '
            'ela nao pode confirmar que existe.',
      );
    });
  });
}
