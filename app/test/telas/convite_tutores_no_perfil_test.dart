// ===========================================================================
// A TELA `Convide tutores` MORREU EM 28/10/2026, E ESTE ARQUIVO MUDOU DE
// ASSUNTO COM ELA.
// ===========================================================================
//
// **O que ele media, e por que isso deixou de existir.** Ele guardava a
// decisao do cliente de 22/10 e 26/10 -- *"Mova o convite tutores para a
// pagina do perfil"* e *"retirar o convite tutores das mensagens, deixar
// apenas na menu do perfil do usuario"* -- em quatro iscas:
//
//   (a) o corpo do AuAu nao tem mais o item;
//   (b) nada em `lib/` empurra a tela por outro caminho;
//   (c) o convite ESTA no menu do Perfil;
//   (+) controle positivo: o item do menu ABRE a tela.
//
// **Em 28/10/2026 o cliente decidiu que a tela morre**: o QR foi para dentro
// de `Meus dados` (`telas/perfil/tela_dados_pessoais.dart`,
// `_BlocoDoConvite`, recolhido no pe da pagina) e o placar
// `invited_joined_count` foi com ele. A rota, o item do menu e o atalho da
// gaveta sairam no MESMO commit que apagou o arquivo.
//
// Com isso, (c) e o controle positivo passaram a cobrar o CONTRARIO do que a
// decisao nova diz, e sairam. **(a) e (b) ficaram, e ganharam forca**: eles
// nao falavam da tela, falavam de ONDE A PORTA NAO PODE ESTAR -- e agora que
// nao ha tela, nenhuma porta pode existir em lugar nenhum. (b) virou o que ele
// sempre foi por baixo: a varredura que impede a ressurreicao.
//
// **O QUE SUBSTITUIU (c)**: `telas/qr_do_convite_em_meus_dados_test.dart`,
// que mede o QR na casa nova -- a secao recolhida, o quadrado depois do toque,
// o placar que viajou junto, e que o arquivo da tela morta **nao existe mais
// no disco**.
//
// A decisao de 21/10 (*"no AuAu como tela empilhada, nao no Perfil"*), as duas
// de 22/10 e 26/10 que a mudaram para o `Perfil`, e esta de 28/10 que mata a
// tela, estao citadas juntas tambem em
// `telas/mensagens/area_de_mensagens.dart` e em `roteamento/rotas.dart` -- sem
// as datas lado a lado alguem reverte isto achando que esta consertando um
// defeito.
library;

import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Os arquivos de `lib/` que esta historia tocou, lidos da fonte.
const String _fonteDoAuAu = 'lib/telas/mensagens/area_de_mensagens.dart';
const String _fonteDoPerfil = 'lib/telas/abas.dart';
const String _fonteDasRotas = 'lib/roteamento/rotas.dart';
const String _fonteDaGaveta = 'lib/telas/gaveta_de_secoes.dart';

/// O arquivo da tela que morreu.
const String _arquivoDaTela = 'lib/telas/conexoes/convide_tutores.dart';

/// O SIMBOLO QUE TODO CAMINHO ATE A TELA TINHA DE ATRAVESSAR.
///
/// Ancorar aqui, e nao no rotulo, e o que faz a isca (b) sobreviver a troca de
/// nome: o endereco podia mudar de valor e o rotulo podia mudar de palavra,
/// mas quem empurrava a tela escrevia este simbolo. **Agora que a tela morreu,
/// ele e a marca de uma ressurreicao** -- e o simbolo nao existe mais nem como
/// constante, entao qualquer linha que o escreva nem compila.
const String _simboloDaRota = 'Rotas.convidarTutores';

/// O import da tela. A segunda marca que uma porta reposta deixaria.
const String _importDaTela = "conexoes/convide_tutores.dart'";

/// Uma superficie alta: o menu do Perfil inteiro precisa estar deitado para
/// cada item ter `Element`.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// O servidor minimo das telas desta historia.
Future<http.Response> _servidorDaConta(http.Request req) async {
  final caminho = req.url.path;
  if (caminho == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (caminho == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  if (caminho == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 0,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 10,
      'connection_limit': 100,
      'invited_joined_count': 0,
    });
  }
  return problema('not-found', 404);
}

void main() {
  // -------------------------------------------------------------------------
  group('a metade que SAIU: o convite nao esta mais nas mensagens', () {
    // ESTA ISCA NAO MUDOU, e ela e a razao de este arquivo continuar
    // existindo. O cliente mandou o convite sair das mensagens em 26/10, e
    // isso continua valendo depois de a tela morrer: se alguem repuser um
    // caminho de convite, ele nao pode nascer onde ele foi expulso.
    testWidgets('isca (a): o corpo do AuAu nao tem item de menu nenhum', (
      tester,
    ) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidorDaConta,
        deposito: depositoLogado(),
      );
      await abrirAAba(tester, 'AuAu');
      await tester.pumpAndSettle();

      expect(
        find.byType(ItemDeMenu),
        findsNothing,
        reason: 'REPROVA: o corpo do AuAu voltou a ter item de menu. O cliente '
            'mandou o convite sair de la em 26/10/2026 (*"retirar o convite '
            'tutores das mensagens"*), e em 28/10 a tela inteira morreu -- '
            'nao ha porta para repor em lugar nenhum, e menos ainda aqui.',
      );
    });

    test(
      'isca (a2): a FONTE do AuAu nao cita a tela nem a rota do convite',
      () {
        final auau = File(_fonteDoAuAu).readAsStringSync();

        // CONTROLE POSITIVO DA LEITURA: li o arquivo certo e ele nao veio
        // vazio. Sem isto, um caminho errado deixaria as duas buscas abaixo
        // "sem achar" e o caso verde sobre nada.
        expect(
          auau,
          contains('AreaDeMensagens'),
          reason: 'Controle positivo: nao li o codigo da area de mensagens.',
        );
        expect(
          auau.contains(_simboloDaRota),
          isFalse,
          reason: 'REPROVA: a area de mensagens voltou a citar '
              '`$_simboloDaRota`. A rota morreu com a tela em 28/10/2026, e '
              'uma citacao dela aqui e uma porta nascendo exatamente onde o '
              'cliente a tirou.',
        );
        expect(
          auau.contains(_importDaTela),
          isFalse,
          reason: 'REPROVA: a area de mensagens voltou a importar a tela do '
              'convite, que nao existe mais.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('a TELA MORREU: nada em `lib/` a ressuscita', () {
    // ======================================================================
    // ERA A ISCA (b), E ELA VIROU O QUE SEMPRE FOI POR BAIXO
    // ======================================================================
    //
    // (b) media "nada EXCETO o menu do Perfil empurra a tela". Com a tela
    // apagada, a excecao caiu e a isca ficou mais simples e mais forte: NADA
    // a empurra, porque nao ha o que empurrar.
    //
    // **Isto nao e redundante com o compilador.** `Rotas.convidarTutores` nao
    // existe mais como constante, entao uma chamada direta nem compila -- mas
    // uma `String` crua (`context.push('/perfil/convide-tutores')`) compila e
    // levaria a pessoa a uma rota inexistente. O caso varre o ENDERECO em
    // texto, que e o que uma ressurreicao desatenta escreveria.
    test('o arquivo da tela nao existe mais no disco', () {
      expect(
        File(_arquivoDaTela).existsSync(),
        isFalse,
        reason: 'REPROVA: `$_arquivoDaTela` voltou ao disco. A tela morreu por '
            'decisao do cliente de 28/10/2026, e o QR foi para dentro de '
            '`Meus dados`. Uma tela de volta no arquivo, sem porta nenhuma, e '
            'o estado que esta casa chama de tela inalcancavel em silencio.',
      );
    });

    test('nenhum arquivo de `lib/` cita a rota, o simbolo ou o import', () {
      final suspeitos = <String>[
        _fonteDoAuAu,
        _fonteDoPerfil,
        _fonteDasRotas,
        _fonteDaGaveta,
      ];

      for (final caminho in suspeitos) {
        final codigo = File(caminho).readAsStringSync();

        // CONTROLE POSITIVO, arquivo por arquivo: ele existe e tem conteudo.
        expect(
          codigo.length,
          greaterThan(500),
          reason: 'Controle positivo: `$caminho` veio vazio ou curto demais, '
              'entao as buscas abaixo nao provariam nada.',
        );
        expect(
          codigo.contains(_importDaTela),
          isFalse,
          reason: 'REPROVA: `$caminho` importa `convide_tutores.dart`, que foi '
              'apagado em 28/10/2026.',
        );
      }

      // O ENDERECO EM TEXTO, e nao o simbolo: o simbolo nao existe mais e uma
      // citacao dele nem compilaria. O que compila -- e levaria a pessoa a
      // lugar nenhum -- e a `String` crua.
      //
      // `rotas.dart` e `gaveta_de_secoes.dart` CITAM o endereco em prosa, de
      // proposito (o registro de por que a rota morreu), e por isso a
      // varredura e sobre o codigo SEM COMENTARIO.
      for (final caminho in suspeitos) {
        final semProsa = File(caminho)
            .readAsLinesSync()
            .where((String l) => !l.trimLeft().startsWith('//'))
            .join('\n');
        expect(
          semProsa.contains('/perfil/convide-tutores'),
          isFalse,
          reason: 'REPROVA: `$caminho` cita o endereco '
              '`/perfil/convide-tutores` em CODIGO. A rota morreu com a tela, '
              'e um `push` dessa `String` levaria a pessoa a uma rota que o '
              'roteador nao conhece.',
        );
      }
    });

    testWidgets(
      'o menu do Perfil nao oferece o convite como linha propria',
      (tester) async {
        _superficieAlta(tester);
        await abrirOApp(
          tester,
          rede: _servidorDaConta,
          deposito: depositoLogado(),
        );
        await irParaAConta(tester);

        for (final rotulo in const <String>['Convide tutores', 'Convidar vizinhos']) {
          expect(
            find.descendant(
              of: find.byType(AbaPerfil),
              matching: find.text(rotulo),
            ),
            findsNothing,
            reason: 'REPROVA: `$rotulo` virou linha do menu do Perfil. O QR '
                'mora dentro de `Meus dados` desde 28/10/2026, e uma linha '
                'propria aqui seria a segunda porta para o mesmo lugar -- que '
                'e o que `gaveta_de_secoes.dart` proibe.',
          );
        }
      },
    );

    test('a gaveta nao tem atalho VIVO para o convite', () {
      // A linha nao foi apagada do inventario: ela voltou a ser a reserva da
      // UX 27.5.5 (`Convidar vizinhos`, `planejada`), porque o inventario
      // registra o que a UX NOMEIA e ela continua nomeando esta porta. O que
      // nao pode haver e atalho VIVO, que e o que a gaveta renderiza.
      final vivos = RegistroDeSubDestinos.itensDe(Rotas.perfil)
          .where((SubDestino d) => d.viraItem)
          .map((SubDestino d) => d.rotulo)
          .toList(growable: false);

      // CONTROLE POSITIVO: a secao tem atalhos vivos, entao a lista nao esta
      // vazia por acidente e a assercao abaixo mede algo.
      expect(
        vivos,
        isNotEmpty,
        reason: 'Controle positivo: a secao `Perfil` do inventario nao tem '
            'atalho vivo nenhum, entao a assercao abaixo passaria no vazio.',
      );
      for (final proibido in const <String>[
        'Convide tutores',
        'Convidar vizinhos',
      ]) {
        expect(
          vivos,
          isNot(contains(proibido)),
          reason: 'REPROVA: `$proibido` voltou a ser atalho VIVO da gaveta, e '
              'a tela que ele abria nao existe mais. Atalho vivo exige rota, e '
              'a rota morreu em 28/10/2026.',
        );
      }
    });
  });
}
