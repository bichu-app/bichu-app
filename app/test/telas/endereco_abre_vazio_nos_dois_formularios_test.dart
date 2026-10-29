// BICHUS-317a -- BAIRRO, CIDADE E ESTADO ABREM VAZIOS NOS DOIS FORMULARIOS DE
// CRIAR DA COMUNIDADE.
//
// =========================================================================
// O PEDIDO, E POR QUE ELE NAO E TROCA DE GOSTO
// =========================================================================
//
// Cliente, 29/10/2026, verbatim: *"na pagina criar evento e indicar
// profissional, os campos bairro, cidade e estado estao vindo preenchidos por
// padrao com minhas informacoes, deve vir em branco e o usuario digitar"*.
//
// Ate essa data as duas telas copiavam `Me.reference_area` -- a regiao que o
// tutor cadastrou -- para os tres campos na primeira montagem, em
// `didChangeDependencies`.
//
// **O proprio repositorio ja argumentava contra**, e e isso que faz deste caso
// uma regra e nao uma preferencia: `lib/telas/localizacao/
// captura_de_localizacao.dart`, na prosa de `_preencherDaRegiaoDeReferencia`,
// escreve que ao lado de um dado medido *"inventa-la da ficha do tutor seria
// pior"*. O juizo vale nas duas telas daqui, e por motivos DIFERENTES -- e e
// por isso que o caso mede as duas e nao confia que uma prova a outra:
//
// - **indicar** publica sobre um TERCEIRO. O endereco e de uma clinica, nao de
//   quem indica. Bairro do tutor embaixo do nome de um estabelecimento afirma,
//   com cara de dado conferido, que o estabelecimento fica onde o tutor mora --
//   e quem indica a clinica da cidade vizinha mandava a cidade errada sem
//   notar, porque campo que ja vem escrito nao se le, se aceita;
// - **criar evento** nasce EM PUBLICO. O encontro acontece na praca que a
//   pessoa escolheu, nao onde ela mora. Ali o lugar errado nao vira recusa do
//   servidor: vira gente indo ao lugar errado.
//
// **AS DUAS JUNTAS, de proposito.** Mexer numa so deixaria `Criar evento` e
// `Indicar` discordando sobre a mesma pergunta, que e o tipo de incoerencia que
// ninguem reporta e todo mundo sente.
//
// =========================================================================
// A ISCA: A SESSAO TEM REGIAO, E ELA E A QUE O DEFEITO USAVA
// =========================================================================
//
// Todo caso aqui abre o app com `regiaoDeReferencia: regiaoDeTeste`
// (Pinheiros / Sao Paulo / SP). **Sem isso o caso ficaria verde de graca**: uma
// sessao sem regiao abre os campos vazios mesmo com o defeito de pe, e o caso
// nao mediria nada -- mediria a ausencia do dado, nao a ausencia da copia.
// Entao a afirmacao e: HA regiao na sessao, e os campos continuam vazios.
//
// DESLIGAR PARA VER REPROVAR:
//
//  a. em `lib/telas/perto/sugerir_profissional.dart`, devolva o
//     `didChangeDependencies` que foi retirado -- as quatro linhas que leem
//     `Escopo.of(context).sessao.usuario?.regiaoDeReferencia` e escrevem
//     `_bairro.text`, `_cidade.text` e `_uf`. O grupo `indicar profissional`
//     reprova nas tres asserções;
//  b. em `lib/telas/rede/criar_encontro.dart`, acrescente as mesmas quatro
//     linhas dentro do `didChangeDependencies` que hoje so le a permissao da
//     camera. O grupo `criar evento` reprova nas tres.
//
// **O CEP continua preenchendo, e isso e medido noutro arquivo**
// (`cep_nos_dois_formularios_test.dart`): o caminho que preenche endereco
// nestas telas e o CEP que a pessoa digita de proposito, e nao a ficha dela. Se
// este arquivo passasse a cobrar "nada preenche nunca", ele reprovaria o
// recurso que o cliente pediu em 17/10.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../rede/fixtures_da_rede.dart' show regiaoDeTeste;
import 'ajuda_de_tela.dart';
import 'sugerir_profissional_test.dart' show diretorioVazio;

/// A rede minima para as duas telas abrirem. **Nenhuma rota de CEP aqui**: este
/// arquivo nunca digita um CEP, e uma resposta de ViaCEP de pe seria convite
/// para um caso futuro medir a coisa errada neste lugar.
Future<http.Response> Function(http.Request) _rede() {
  return (req) async {
    final caminho = req.url.path;
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (caminho == '/v1/network/events' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[],
        'total': 0,
      });
    }
    return problema('not-found', 404);
  };
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
///
/// Pelo rotulo DECLARADO no widget, e nao por `widgetWithText`: o rotulo do
/// `BichuField` e um `Text` irmao do campo, e nao um descendente dele.
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
      matching: find.byType(TextField),
    );

String _textoDoCampo(WidgetTester tester, String rotulo) =>
    tester.widget<TextField>(_campo(rotulo)).controller?.text ?? '';

/// A lista rolavel DA TELA, e nao `find.byType(Scrollable).first`.
///
/// As duas telas sao empilhadas sobre a aba que as abriu, e a primeira
/// `Scrollable` da arvore e a da tela de BAIXO: rolar nela nao move o
/// formulario e o campo nunca aparece. (A mesma nota existe em
/// `criar_encontro_test.dart`, em `corpoDoFormulario`.)
Finder _rolagemDe(Type tela) => find
    .descendant(of: find.byType(tela), matching: find.byType(Scrollable))
    .first;

/// Rola ate o campo e devolve o que ele tem escrito.
///
/// **O rolar nao e cerimonia:** `ListView` so constroi o que cabe na tela, e os
/// tres campos de endereco ficam abaixo da dobra nas duas telas. Sem isto o
/// `Finder` acha ZERO widgets e o caso estoura em `Iterable.single` -- que
/// falha por motivo nenhum, e nao pela afirmacao.
Future<String> _campoDepoisDeRolar(
  WidgetTester tester,
  Type tela,
  String rotulo,
) async {
  await rolarAteDeCimaOuDeBaixo(
    tester,
    _campo(rotulo),
    scrollable: _rolagemDe(tela),
  );
  return _textoDoCampo(tester, rotulo);
}

/// Abre o app JA COM REGIAO na sessao e empilha [rota].
///
/// A regiao e o que torna o caso uma isca -- ver o cabecalho.
Future<void> _abrirComRegiao(WidgetTester tester, String rota) async {
  await abrirOApp(
    tester,
    rede: _rede(),
    deposito: depositoLogado(regiaoDeReferencia: regiaoDeTeste),
  );
  await irPara(tester, rota);
}

void main() {
  group('indicar profissional: os tres campos de endereco abrem vazios', () {
    testWidgets('bairro, cidade e estado nao vem da ficha do tutor',
        (tester) async {
      await _abrirComRegiao(tester, Rotas.sugerirProfissional);
      expect(find.byType(TelaSugerirProfissional), findsOneWidget);

      expect(
        await _campoDepoisDeRolar(tester, TelaSugerirProfissional, 'Bairro'),
        isEmpty,
        reason: 'REPROVA: o bairro veio da ficha do tutor ("Pinheiros"). O '
            'cliente pediu os tres em branco em 29/10/2026, e aqui o endereco '
            'e de um TERCEIRO -- a clinica indicada --, nao de quem indica: '
            'bairro ja escrito embaixo do nome de um estabelecimento afirma '
            'que ele fica onde o tutor mora.',
      );
      expect(
        await _campoDepoisDeRolar(tester, TelaSugerirProfissional, 'Cidade'),
        isEmpty,
        reason: 'REPROVA: a cidade veio da ficha do tutor ("São Paulo"). Este '
            'e o campo que mais custava: quem indica a clinica da cidade '
            'vizinha mandava a cidade errada sem notar, porque campo que ja '
            'vem escrito nao se le, se aceita.',
      );
      // **A sigla, e nao o nome que a tela desenha**: e a sigla que viaja no
      // corpo (`pattern: ^[A-Z]{2}$`), e `''` e o seletor sem escolha.
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.text(TelaSugerirProfissional.rotuloDoEstado),
        scrollable: _rolagemDe(TelaSugerirProfissional),
      );
      expect(
        siglaEscolhidaNoSeletor(tester),
        '',
        reason: 'REPROVA: o estado veio escolhido da ficha do tutor ("SP"). O '
            'seletor tem de abrir em "Escolher na lista": uma escolha que a '
            'pessoa nao fez viaja no corpo igual a uma que ela fez.',
      );
    });
  });

  group('criar evento: os tres campos de endereco abrem vazios', () {
    testWidgets('bairro, cidade e estado nao vem da ficha do tutor',
        (tester) async {
      await _abrirComRegiao(tester, Rotas.criarEncontroDaRede);
      expect(find.byType(TelaCriarEncontro), findsOneWidget);

      expect(
        await _campoDepoisDeRolar(tester, TelaCriarEncontro, 'Bairro'),
        isEmpty,
        reason: 'REPROVA: o bairro veio da ficha do tutor ("Pinheiros"). O '
            'encontro acontece na praca que a pessoa escolheu, nao onde ela '
            'mora -- e ele nasce EM PUBLICO: aqui o lugar errado nao vira '
            'recusa do servidor, vira gente indo ao lugar errado.',
      );
      expect(
        await _campoDepoisDeRolar(tester, TelaCriarEncontro, 'Cidade'),
        isEmpty,
        reason: 'REPROVA: a cidade veio da ficha do tutor ("São Paulo").',
      );
      await rolarAteDeCimaOuDeBaixo(
        tester,
        find.text(TelaCriarEncontro.rotuloDoEstado),
        scrollable: _rolagemDe(TelaCriarEncontro),
      );
      expect(
        siglaEscolhidaNoSeletor(tester),
        '',
        reason: 'REPROVA: o estado veio escolhido da ficha do tutor ("SP").',
      );
    });
  });
}
