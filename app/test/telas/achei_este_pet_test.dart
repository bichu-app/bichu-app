// ACHEI ESTE PET: quem encontrou um pet IDENTIFICADO nao redigita o cadastro.
//
// Defeito relatado pelo cliente em 26/10/2026, palavra por palavra:
//
//   *"nao subiu o fluxo de quando clicar no pet, nao levar ele para a pagina
//   de registrar um achado, porque SE ELE ENCONTROU O PET, ELE NAO TEM QUE
//   CADASTRAR AS INFORMACOES NOVAMENTE"*
//
// O toque em `Encontrei este animal`, na pagina publica de um caso, caia em
// F3.5 -- o formulario do achado AVULSO --, que pergunta especie, raca, cor,
// sexo e porte. Os cinco ja estao respondidos do outro lado: o pet tem
// cadastro e o caso esta aberto.
//
// ---------------------------------------------------------------------------
// COMO VER CADA ISCA REPROVANDO
// ---------------------------------------------------------------------------
//
//  - ISCA 1: troque o `context.push(Rotas.encontreiEstePet, ...)` de
//    `_encontrei`, em `tela_do_caso_publico.dart`, de volta para
//    `context.push(Rotas.registrarAchado, extra: RascunhoDoAchado(shareToken:
//    widget.shareToken))` -- que e EXATAMENTE o codigo que tinha o defeito.
//
//  - ISCA 2: acrescente a `TelaEncontreiEstePet` qualquer um dos tres
//    controles do animal: `GrupoSegmentado<Especie>`, `GrupoSegmentado<Porte>`
//    ou o `SeletorDeLista` da cor.
//
//  - CONTROLE POSITIVO: tire um desses tres controles de F3.5. A isca 2
//    continuaria VERDE (ela mede ausencia) e o controle positivo reprova --
//    e e so por isso que a ausencia medida pela isca 2 significa alguma coisa.
//
//  - ISCA 3: tire o `shareToken` do rascunho de `TelaEncontreiEstePet`, ou
//    deixe de ler `especie`/`porte` do caso e passe valores fixos.
//
// ---------------------------------------------------------------------------
// POR QUE AS ASSERCOES NEGATIVAS SAO ANCORADAS EM TIPO, E NAO EM ROTULO
// ---------------------------------------------------------------------------
//
// `findsNothing` sobre um `find.text('Qual é o porte?')` PASSA NO VAZIO no dia
// em que alguem renomear o rotulo: a tela volta a pedir o porte e a isca
// continua verde. Ja aconteceu tres vezes neste repositorio.
//
// Entao toda ausencia aqui e medida por `byType` / `byWidgetPredicate` sobre o
// WIDGET, e **os mesmos tres finders** sao reusados no controle positivo
// contra F3.5. Um tipo renomeado nao compila; um tipo apagado faz o controle
// positivo reprovar. Nao ha caminho em que os tres finders fiquem cegos e a
// suite siga verde.

import 'dart:convert';

import 'package:bichu/api/achados_api.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/tela_encontrei_este_pet.dart';
import 'package:bichu/telas/achado/tela_registrar_achado.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perdido/cartao_do_perdido.dart';
import 'package:bichu/telas/perdido/tela_do_caso_publico.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/grupo_segmentado.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perdidos_e_meus_achados_test.dart'
    show abrirPets, paginaDePerdidos, perdidoDoContrato, tokenDeMel;

// ---------------------------------------------------------------------------
// OS TRES FINDERS DO ANIMAL
// ---------------------------------------------------------------------------
//
// Declarados UMA VEZ e usados nos dois lados -- na ausencia (tela nova) e na
// presenca (F3.5). Dois conjuntos de finders deixariam o da ausencia
// envelhecer sozinho, que e a forma exata de a asserção negativa ficar cega.

/// O controle de especie de F3.5: `GrupoSegmentado<Especie>`.
final Finder _controleDeEspecie = find.byType(GrupoSegmentado<Especie>);

/// O controle de porte de F3.5: `GrupoSegmentado<Porte>`.
final Finder _controleDePorte = find.byType(GrupoSegmentado<Porte>);

/// O controle de cor de F3.5: o `SeletorDeLista` com o rotulo da cor.
///
/// Por PREDICADO e nao por tipo: ha dois `SeletorDeLista` em F3.5 (raca e
/// cor), e `byType` nao os distingue.
final Finder _controleDeCor = find.byWidgetPredicate(
  (w) => w is SeletorDeLista && w.rotulo == TextosDoAchado.rotuloDaCor,
);

/// O par (nome, finder), para a mensagem de falha dizer QUAL controle.
///
/// **A ORDEM E A DA TELA** (especie, cor, porte -- F3.5 pergunta especie,
/// raca, cor, sexo e porte, nesta ordem, por pedido do cliente de 17/10/2026),
/// e nao e estetica: `scrollUntilVisible` procura num SENTIDO so. Com a cor
/// depois do porte, o controle positivo rolava ate o porte, procurava a cor
/// PARA BAIXO, rodava a lista inteira e estourava `Bad state: No element` --
/// uma reprovacao que nao e a da regra, e que chega disfarcada de defeito.
final Map<String, Finder> _controlesDoAnimal = <String, Finder>{
  'espécie (GrupoSegmentado<Especie>)': _controleDeEspecie,
  'cor (SeletorDeLista da cor)': _controleDeCor,
  'porte (GrupoSegmentado<Porte>)': _controleDePorte,
};

// ---------------------------------------------------------------------------
// A MASSA
// ---------------------------------------------------------------------------

/// **GATO e GIGANTE, e nao o `dog`/`P` do padrao da massa.**
///
/// Os dois valores sao escolhidos para a isca 3 nao poder passar por sorte: se
/// a tela mandasse valores fixos no corpo (ou se ela caisse em F3.5 e alguem
/// escolhesse o primeiro de cada lista), o corpo sairia com `dog` e `P`. Com o
/// caso sendo `cat`/`GG`, so chega `cat`/`GG` no corpo quem LEU o caso.
const String _especieDoCaso = 'cat';
const String _porteDoCaso = 'GG';

Map<String, dynamic> _perdidoDoCaso() => perdidoDoContrato(
      nome: 'Mel',
      especie: _especieDoCaso,
      porte: _porteDoCaso,
      vistoEm: '2026-10-16T09:00:00.000Z',
    );

Map<String, dynamic> _casoPublico({bool podeAvisar = true}) =>
    <String, dynamic>{
      ..._perdidoDoCaso(),
      'description': 'Fugiu pelo portão da frente.',
      'care_notes': 'É medroso. Não corra atrás dele.',
      'can_report_sighting': podeAvisar,
      'poster_url': 'https://web.teste/cartaz/$tokenDeMel',
    };

/// `FoundReport` como `createStrayFoundReport` o devolve.
Map<String, dynamic> _achadoDoContrato() => <String, dynamic>{
      'id': '9a1f3c55-0000-7000-8000-0000000000aa',
      'origin': 'stray_report',
      'status': 'open',
      'species': _especieDoCaso,
      'size': _porteDoCaso,
      'area_label': 'Vila Mariana, São Paulo',
      'found_at': '2026-10-26T19:00:00.000Z',
      'photo_url': null,
      'notes': null,
      'conversation_id': null,
      'created_at': '2026-10-26T19:00:00.000Z',
    };

/// A rede da listagem, do caso e do REGISTRO -- e ela GRAVA o corpo do POST.
///
/// O corpo e lido da requisicao observada, e nao deduzido da tela de desfecho:
/// uma tela que mostrasse `Achado registrado` sem ter mandado `share_token`
/// seria indistinguivel de uma que mandou, e o unico jeito de separar as duas
/// e olhar o que saiu no fio.
class _Rede {
  int registros = 0;
  Map<String, dynamic>? corpoDoRegistro;

  Future<http.Response> call(http.Request req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/public/lost-pets' && req.method == 'GET') {
      return json200(paginaDePerdidos(<Map<String, dynamic>>[_perdidoDoCaso()]));
    }
    if (caminho == '/v1/public/lost-cases/$tokenDeMel' && req.method == 'GET') {
      return json200(_casoPublico());
    }
    if (caminho == '/v1${AchadosApi.caminhoDeRegistro}' &&
        req.method == 'POST') {
      registros += 1;
      corpoDoRegistro = jsonDecode(req.body) as Map<String, dynamic>;
      return json200(_achadoDoContrato(), status: 201);
    }
    if (caminho.endsWith('/reference-data')) return json200(referenciaDeTeste());
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    return problema('not-found', 404);
  }
}

/// Abre a pagina do caso e toca em `Encontrei este animal`.
Future<void> _tocarEmEncontrei(WidgetTester tester, _Rede rede) async {
  await abrirPets(tester, rede: rede.call);
  await tocar(tester, find.byType(CartaoDoPerdido));
  expect(
    find.byType(TelaDoCasoPublico),
    findsOneWidget,
    reason: 'REPROVA: o cartao da listagem nao abriu a pagina do caso. Os '
        'casos abaixo medem o DESTINO de um botao que vive nessa pagina, e '
        'sem ela nao ha botao nenhum para tocar -- um falso verde aqui faria '
        'todos eles passarem no vazio.',
  );
  await tocar(tester, find.text(TelaDoCasoPublico.rotuloDeEncontrei));
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
      matching: find.byType(TextField),
    );

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 — o botao NAO volta para o formulario generico
  //
  // PARA VER REPROVANDO: em `tela_do_caso_publico.dart`, troque o destino de
  // `_encontrei` de `Rotas.encontreiEstePet` para `Rotas.registrarAchado`.
  // -------------------------------------------------------------------------
  group('o toque de quem achou NAO cai no formulario generico', () {
    testWidgets(
      'ISCA 1 — `Encontrei este animal` abre `TelaEncontreiEstePet`',
      (tester) async {
        final rede = _Rede();
        await _tocarEmEncontrei(tester, rede);

        expect(
          find.byType(TelaEncontreiEstePet),
          findsOneWidget,
          reason: 'REPROVA: o toque nao abriu a tela de quem achou ESTE pet. '
              'Ela existe porque o cliente relatou o defeito com estas '
              'palavras: "se ele encontrou o pet, ele nao tem que cadastrar '
              'as informacoes novamente".',
        );
        expect(
          find.byType(TelaRegistrarAchado),
          findsNothing,
          reason: 'REPROVA: o toque voltou a cair em F3.5, o formulario do '
              'achado AVULSO -- que pergunta especie, raca, cor, sexo e '
              'porte. ESTE e o defeito relatado. O achado avulso continua '
              'existindo e continua perguntando tudo; o que ele nao pode mais '
              'ser e o destino de quem achou um pet que JA TEM CADASTRO.',
        );
      },
    );

    testWidgets(
      'ISCA 1b — a tela nova sabe de QUAL pet se trata, pelo nome',
      (tester) async {
        final rede = _Rede();
        await _tocarEmEncontrei(tester, rede);

        // `pet_display_name` e `required` em `PublicLostPet`: nao ha ramo sem
        // nome. Esta linha e o que separa "abriu a tela nova" de "abriu a
        // tela nova COM o caso": uma tela que perdesse o `extra` pelo caminho
        // desenharia o cartao de leitura vazio.
        expect(
          find.text(TextosDoAchado.chamadaDeEncontrei('Mel')),
          findsOneWidget,
          reason: 'REPROVA: a tela nova abriu sem o pet. O `extra` da rota e '
              '`PerdidoPublico`, e e dele que saem `species`, `size` e o '
              '`share_token` do corpo -- sem ele a tela nao tem nada, e a '
              'rota cai de volta no achado avulso de proposito.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — a tela nova NAO pergunta especie, cor nem porte
  //
  // PARA VER REPROVANDO: acrescente um dos tres controles a
  // `TelaEncontreiEstePet`.
  //
  // **Esta isca mede AUSENCIA, e ausencia sozinha nao prova nada.** O caso
  // seguinte (CONTROLE POSITIVO) e o que a sustenta.
  // -------------------------------------------------------------------------
  group('a tela nova nao pergunta o que o cadastro do pet ja responde', () {
    testWidgets(
      'ISCA 2 — nenhum dos tres controles do animal existe na tela nova',
      (tester) async {
        final rede = _Rede();
        await _tocarEmEncontrei(tester, rede);

        for (final entrada in _controlesDoAnimal.entries) {
          expect(
            entrada.value,
            findsNothing,
            reason: 'REPROVA: a tela de quem achou ESTE pet voltou a pedir '
                '${entrada.key}.\n'
                'O cadastro do pet ja responde os tres, e a projecao publica '
                'do caso ENTREGA especie e porte (`PublicLostPet` os declara '
                '`required`). Perguntar de novo e o defeito que o cliente '
                'relatou em 26/10/2026.\n'
                'Se um campo NOVO precisar existir aqui, ele nao pode ser um '
                'destes tres: o que falta no aviso e o que so quem achou sabe '
                '-- onde, quando, o recado e a foto.',
          );
        }
      },
    );

    testWidgets(
      'CONTROLE POSITIVO — o achado AVULSO continua pedindo os tres',
      (tester) async {
        // =================================================================
        // O CONTROLE POSITIVO DESTE ARQUIVO.
        //
        // Sem ele, apagar os tres controles de F3.5 deixaria a ISCA 2 verde:
        // ela mede ausencia, e ausencia em todo lugar tambem e ausencia aqui.
        // O conserto do defeito do cliente poderia ter ESVAZIADO o formulario
        // de quem acha um animal SEM identificacao -- que e quem mais precisa
        // descrever o que viu, porque nao ha cadastro nenhum do outro lado.
        //
        // Os MESMOS tres finders da ISCA 2. Reescrever finders aqui faria os
        // dois lados divergirem e devolveria o furo pelo outro caminho.
        // =================================================================
        final rede = _Rede();
        // **`abrirOApp` e nao `abrirPets`, de proposito.** `abrirPets` deixa a
        // casca de abas na pilha, e com ela ha TRES `Scrollable` montados --
        // `rolarAte` pegaria o `.first`, que e o da casca, e arrastaria a
        // lista errada ate estourar `Bad state: No element` apontando para o
        // lugar errado. E o mesmo caminho que `registrar_achado_test.dart`
        // usa para abrir F3.5.
        await abrirOApp(tester, rede: rede.call, deposito: depositoLogado());
        await irPara(tester, Rotas.registrarAchado);

        expect(
          find.byType(TelaRegistrarAchado),
          findsOneWidget,
          reason: 'REPROVA: `Rotas.registrarAchado` nao abre mais o achado '
              'avulso. O conserto de 26/10 acrescenta uma tela, e nao '
              'substitui esta: quem acha um animal sem plaquinha e sem caso '
              'continua precisando dela.',
        );

        for (final entrada in _controlesDoAnimal.entries) {
          await rolarAte(tester, entrada.value);
          expect(
            entrada.value,
            findsOneWidget,
            reason: 'REPROVA: o achado AVULSO (F3.5) perdeu o controle de '
                '${entrada.key}.\n'
                'Quem acha um animal SEM identificacao e o unico que pode '
                'descrever o animal, e `StrayFoundReportInput` declara '
                '`species` e `size` como `required` -- sem os dois nao ha '
                'corpo valido e o achado nao existe.\n'
                'ATENCAO: este caso e o CONTROLE POSITIVO da isca de cima. Se '
                'ele reprovou, o conserto de "nao perguntar duas vezes" '
                'esvaziou o formulario de TODO MUNDO, e a isca de cima nao '
                'acusaria isso sozinha.',
          );
        }
      },
    );
  });

  // -------------------------------------------------------------------------
  // ISCA 3 — o aviso CHEGA AO TUTOR: ele nasce ligado a ESTE caso
  //
  // PARA VER REPROVANDO: tire o `shareToken` do rascunho de
  // `TelaEncontreiEstePet`, ou troque `widget.perdido.especie`/`.porte` por
  // valores fixos.
  // -------------------------------------------------------------------------
  group('o aviso nasce ligado ao caso certo, e nao solto', () {
    testWidgets(
      'ISCA 3 — o corpo leva o `share_token` do caso e o animal do CADASTRO',
      (tester) async {
        final rede = _Rede();
        await _tocarEmEncontrei(tester, rede);

        // O que SO quem achou sabe, preenchido pela TELA -- como a pessoa
        // faria. Montar o rascunho em Dart pularia justamente os campos que a
        // tela poderia estar cobrando.
        await rolarAte(
          tester,
          find.text(TextosDaLocalizacao.preferoDigitarOBairro),
        );
        await tocar(
          tester,
          find.text(TextosDaLocalizacao.preferoDigitarOBairro),
        );
        await tester.enterText(
          _campo(TextosDaLocalizacao.rotuloCidade),
          'São Paulo',
        );
        await tester.pumpAndSettle();
        await rolarAte(tester, find.text('Agora'), passo: -120);
        await tocar(tester, find.text('Agora'));

        final botao = find.widgetWithText(
          BotaoPrimario,
          TextosDoAchado.avisarOTutor,
        );
        await rolarAte(tester, botao);
        await tocar(tester, botao);

        expect(
          rede.registros,
          1,
          reason: 'REPROVA: a tela nao chamou `createStrayFoundReport`. Uma '
              'tela que desenhasse o desfecho sem pedir nada ao servidor '
              'seria indistinguivel, para quem olha a tela, de uma que '
              'avisou -- e so a contagem de pedidos a denuncia. Zero aqui '
              'significa que o tutor NAO foi avisado.',
        );

        final corpo = rede.corpoDoRegistro!;
        expect(
          corpo['share_token'],
          tokenDeMel,
          reason: 'REPROVA: o achado saiu SEM o `share_token` do caso, ou com '
              'outro.\n'
              'E ele que faz o aviso chegar a ESTE tutor: o contrato diz, em '
              '`StrayFoundReportInput.share_token`, que ele "vincula o achado '
              'diretamente aquele caso, SEM DEPENDER do cruzamento por '
              'atributos". Sem ele o achado nasce SOLTO e a tutora do pet que '
              'a pessoa tem no colo depende de um cruzamento por especie, '
              'porte e distancia descobrir o obvio.',
        );
        expect(
          corpo['species'],
          _especieDoCaso,
          reason: 'REPROVA: `species` nao veio do CASO.\n'
              'O caso desta massa e `$_especieDoCaso` de proposito, e nao o '
              '`dog` do padrao: um valor fixo na tela, ou um formulario em '
              'que alguem escolheu o primeiro item, sairia como `dog`. So '
              'chega `$_especieDoCaso` aqui quem LEU o cadastro do pet.',
        );
        expect(
          corpo['size'],
          _porteDoCaso,
          reason: 'REPROVA: `size` nao veio do CASO. O caso e `$_porteDoCaso` '
              'de proposito, pela mesma razao de `species` -- `P` ou `M` aqui '
              'e valor inventado pela tela, e nao o porte do pet perdido.',
        );
        expect(
          corpo['found_at'],
          isA<String>(),
          reason: 'REPROVA: o corpo saiu sem `found_at`, que o contrato exige. '
              'Ele e do ACHADOR (`Agora`, tocado acima) e nao do caso: a hora '
              'em que o animal foi encontrado nao e a hora em que ele sumiu.',
        );
        // `location` ou `area`: o `anyOf` do contrato exige **ao menos um**.
        expect(
          corpo.containsKey('area') || corpo.containsKey('location'),
          isTrue,
          reason: 'REPROVA: o corpo saiu sem lugar nenhum, e o `anyOf` de '
              '`StrayFoundReportInput` exige `location` OU `area`. O servidor '
              'responderia 400 e o aviso morreria depois de a pessoa ter '
              'preenchido a tela.',
        );

        // **O que a tela NAO mandou, e nao devia.** `primary_color` e
        // `breed_label` sao ROTULO na projecao publica (`Caramelo`,
        // `Poodle`), e o corpo pede CODIGO (`primary_color_code`,
        // `breed_code`). Converter rotulo em codigo no cliente e inventar
        // dado, e os dois campos sao opcionais no contrato.
        expect(
          corpo.containsKey('primary_color_code'),
          isFalse,
          reason: 'REPROVA: a tela mandou `primary_color_code`. A projecao '
              'publica do caso traz `primary_color` como ROTULO e anulavel; o '
              'corpo pede CODIGO da lista de `reference-data`. Mandar o '
              'rotulo onde se espera codigo e um valor que o servidor nao '
              'reconhece viajando como se fosse dado -- e o campo e opcional, '
              'entao omiti-lo nao perde nada.',
        );
        expect(
          corpo.containsKey('breed_code'),
          isFalse,
          reason: 'REPROVA: a tela mandou `breed_code`. Mesma razao de '
              '`primary_color_code`: `breed_label` e rotulo, nao codigo.',
        );
      },
    );
  });
}
