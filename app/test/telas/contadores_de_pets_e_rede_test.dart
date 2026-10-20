/// BICHUS-278 (20/10/2026) -- OS CONTADORES DAS ABAS `Pets` E `Rede`.
///
/// A frente anterior entregou o contador de `AuAu` e mediu que as outras quatro
/// abas **nao tinham fonte**. O cliente mandou construir tres delas (a do
/// `Mural` e de outra frente), e este arquivo e a isca das tres.
///
/// ## A BANCADA E A MESMA de `contador_do_auau_test.dart`, e de proposito
///
/// `montarBarraComSelo`, `medirRotulos`, `seloPintadoNaAba`,
/// `rotuloAnunciadoDaAba`, `carregarInter` e a tabela de larguras da UX 27.2.1
/// sao importados daquele arquivo em vez de copiados. Uma segunda bancada
/// divergiria da primeira na primeira correcao -- e as duas estariam medindo a
/// mesma barra com dois conjuntos de regras. O unico acrescimo foi o parametro
/// `naoLidasDe` em `montarBarraComSelo`, que deixa a bancada pintar os TRES
/// selos ao mesmo tempo; sem ele, o pior caso de largura nao era montavel.
///
/// ## O QUE CADA GRUPO COBRA
///
///   (a) conteudo novo faz o numero APARECER, nas tres abas;
///   (b) ver a area ZERA -- e na `Rede` zera em DOIS passos, um por sub-aba;
///   (c) o rotulo acessivel diz O QUE o numero significa, e na `Rede` diz o que
///       ele JUNTA;
///   (d) o selo nao faz rotulo cortar em 320/360/375/390/412 dp com 1, 2 e 3
///       digitos -- com os TRES selos acesos ao mesmo tempo;
///   (e) sem conta, nenhuma aba pinta selo.
///
/// A isca (f) -- cada rota nova RESPONDE -- e do servidor, e mora em
/// `src/modules/sections/adapters/http/contadores-de-secao-estao-registrados.test.ts`.
/// Ela existe porque `POST /v1/me/conversations-seen` ficou 404 em homologacao
/// por faltar UMA chamada de `registrarRota`, e nenhum portao viu.
library;

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/contadores_api.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/sessao/contadores_de_nao_lido.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'contador_do_auau_test.dart'
    show
        carregarInter,
        larguraMedidaPelaUx,
        larguras,
        medirRotulos,
        montarBarraComSelo,
        rotuloAnunciadoDaAba,
        seloPintadoNaAba;

import 'ajuda_de_tela.dart'
    show abrirOApp, depositoLogado, urlBaseDeTeste;

/// O servidor de mentira das DUAS rotas novas.
///
/// **Ele devolve o que o servidor de verdade devolve, campo por campo** --
/// `lost_pets_new`, `network_events_new` e `network_directory_new`, com os
/// nomes do contrato. Um duble que devolvesse os nomes do dominio deixaria
/// `ContadoresDeSecao.deJson` sem ser exercido, e foi assim que um
/// `open_case_id` fixo em nulo passou por tudo neste repositorio: duble que
/// responde o que o servidor nao responde deixa o caso verde sem o mecanismo.
class ServidorDosContadores {
  ServidorDosContadores({
    this.perdidos = 0,
    this.eventos = 0,
    this.profissionais = 0,
  });

  int perdidos;
  int eventos;
  int profissionais;

  /// As areas que receberam `POST /v1/me/sections-seen`, na ordem.
  final List<String> vistas = <String>[];

  /// A `city` que chegou em cada pedido, na ordem. Nula quando nao veio.
  final List<String?> cidades = <String?>[];

  int pedidosDeContagem = 0;

  /// `unread_count` de `GET /v1/conversations` -- o contador de MENSAGENS, que
  /// a mesma `atualizar()` pede. Esta aqui para o caso de `AuAu` poder provar
  /// que o anuncio dele saiu IGUAL depois de o substantivo mudar de lugar.
  int naoLidasDeConversa = 0;

  /// Quando verdadeiro, as duas rotas estouram. E o aparelho no elevador.
  bool derrubar = false;

  /// Quando FALSO, `POST /me/sections-seen` grava a visita e **continua
  /// respondendo o numero de antes**.
  ///
  /// Existe para um caso so, e e um caso que nao da para escrever de outro
  /// jeito: ele distingue "o app zerou por conta propria" de "o app mostrou o
  /// que o servidor respondeu". Com o servidor sempre zerando, as duas
  /// implementacoes dariam o MESMO resultado e o caso aprovaria a adivinhacao.
  bool aplicaVista = true;

  /// **Zera a area pedida do lado do SERVIDOR**, que e quem decide o numero
  /// depois da visita. Se o app zerasse por conta propria, este metodo nao
  /// precisaria existir -- e e justamente a existencia dele que permite ao
  /// caso (b) distinguir "o app adivinhou zero" de "o servidor respondeu zero".
  void aplicarVista(String secao) {
    switch (secao) {
      case 'pets':
        perdidos = 0;
      case 'network_events':
        eventos = 0;
      case 'network_directory':
        profissionais = 0;
    }
  }

  String get _corpo => jsonEncode(<String, Object?>{
        'lost_pets_new': perdidos,
        'network_events_new': eventos,
        'network_directory_new': profissionais,
      });

  Future<http.Response> responder(http.Request pedido) async {
    final caminho = pedido.url.path;
    if (caminho.endsWith('/v1/me/section-counters')) {
      pedidosDeContagem += 1;
      if (derrubar) throw const SocketException('sem rede, de proposito');
      cidades.add(pedido.url.queryParameters['city']);
      return http.Response(
        _corpo,
        200,
        headers: const <String, String>{'content-type': 'application/json'},
      );
    }
    if (caminho.endsWith('/v1/me/sections-seen')) {
      if (derrubar) throw const SocketException('sem rede, de proposito');
      final corpo = jsonDecode(pedido.body) as Map<String, Object?>;
      final secao = corpo['section'] as String;
      vistas.add(secao);
      cidades.add(corpo['city'] as String?);
      if (aplicaVista) aplicarVista(secao);
      // 200 COM OS CONTADORES, como o contrato declara. Um 204 aqui faria o
      // app precisar de uma segunda viagem por visita -- ou zerar local, que e
      // adivinhacao.
      return http.Response(
        _corpo,
        200,
        headers: const <String, String>{'content-type': 'application/json'},
      );
    }
    // `GET /v1/conversations`, que o contador de mensagens pede na mesma
    // `atualizar()`. Sem esta resposta, `Future.wait` ficaria com um ramo
    // falhando e o caso mediria o contador errado.
    if (caminho.endsWith('/v1/conversations')) {
      return http.Response(
        jsonEncode(<String, Object?>{
          'items': <Object?>[],
          'total': 0,
          'unread_count': naoLidasDeConversa,
          'next_cursor': null,
        }),
        200,
        headers: const <String, String>{'content-type': 'application/json'},
      );
    }
    // Toda outra rota sai 200 com objeto vazio, como em `RedeDeTeste`: nenhum
    // caso deste arquivo depende de outra tela, e um 404 generico faria faixa
    // de erro aparecer por cima do que esta sendo medido.
    return http.Response(
      '{}',
      200,
      headers: const <String, String>{'content-type': 'application/json'},
    );
  }
}

ApiClient clienteDe(ServidorDosContadores servidor) {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient(servidor.responder),
  );
  addTearDown(api.fechar);
  return api;
}

ContadoresDeNaoLido contadoresDe(
  ServidorDosContadores servidor, {
  String? cidadeGuardada,
}) {
  final api = clienteDe(servidor);
  return ContadoresDeNaoLido(
    ConversasApi(api),
    secoes: ContadoresApi(api),
    cidade: CidadeEscolhida(
      deposito: DepositoDaCidadeEmMemoria(conteudo: cidadeGuardada),
    ),
  );
}

/// O destino do registro com este campo semantico. Do REGISTRO, e nao de uma
/// lista escrita a mao: aba que saia da barra derruba o caso em vez de
/// mante-lo verde medindo o que nao existe.
DestinoDeNavegacao destinoDe(CampoSemantico campo) {
  return CascaComAbas.destinos.firstWhere((d) => d.campoSemantico == campo);
}

void main() {
  /// Abre o APP DE VERDADE, logado, com o servidor de contadores atras.
  ///
  /// **E o app inteiro e nao a bancada de largura**, e a diferenca decide o
  /// grupo: o `Semantics` que carrega o nome acessivel e montado pela
  /// `casca_com_abas.dart`, e nao pelo `NavigationBar`. Um caso que montasse
  /// a barra a mao estaria conferindo o proprio andaime -- continuaria verde
  /// no dia em que a casca parasse de chamar `nomeAcessivelCom`, que e
  /// exatamente a refatoracao que este grupo existe para pegar.
  ///
  /// `aplicaVista: false`: a secao em que o app ABRE marca a propria area
  /// como vista (e o requisito (b)), e com o servidor zerando nao sobraria
  /// numero nenhum para anunciar. Aqui o servidor grava a visita e continua
  /// respondendo os mesmos numeros, que e o unico jeito de medir o ANUNCIO
  /// sem desligar o mecanismo que o (b) cobra.
  Future<void> abrirComContagem(
    WidgetTester tester, {
    int perdidos = 0,
    int eventos = 0,
    int profissionais = 0,
    int mensagens = 0,
  }) async {
    final servidor = ServidorDosContadores(
      perdidos: perdidos,
      eventos: eventos,
      profissionais: profissionais,
    )..aplicaVista = false;
    servidor.naoLidasDeConversa = mensagens;
    await abrirOApp(
      tester,
      rede: servidor.responder,
      deposito: depositoLogado(),
    );
    await tester.pumpAndSettle();
  }

  // -------------------------------------------------------------------------
  // (a) CONTEUDO NOVO FAZ O NUMERO APARECER
  //
  // COMO DESLIGAR E VER REPROVAR: em `casca_com_abas.dart`, no `switch` de
  // `_naoLidasDaAba`, devolva `null` para `CampoSemantico.animal` e para
  // `CampoSemantico.comunidade`. Os dois primeiros casos reprovam por nome.
  // -------------------------------------------------------------------------
  group('(a) conteudo novo faz o numero aparecer', () {
    testWidgets('ISCA: tres perdidos novos pintam `3` na aba `Pets`',
        (tester) async {
      final servidor = ServidorDosContadores(perdidos: 3);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      expect(
        contadores.perdidos,
        3,
        reason: 'REPROVA: o contador nao recebeu `lost_pets_new`. A fonte desta '
            'aba e `GET /v1/me/section-counters`, no MESMO recorte de '
            '`listPublicLostPets` -- que e o corpo da aba.',
      );

      // O APP DE VERDADE, e nao a bancada de largura: e a casca quem decide
      // qual contagem vai em qual aba (`_naoLidasDaAba`, que e privada). Um
      // caso que passasse o numero direto para `DistintivoDaAba` provaria que
      // o distintivo pinta o que recebe -- que e o que o arquivo do `AuAu` ja
      // prova -- e continuaria VERDE com a aba `Pets` desligada na casca.
      await abrirComContagem(tester, perdidos: 3);
      expect(
        seloPintadoNaAba(tester, 'Pets'),
        '3',
        reason: 'REPROVA: a aba `Pets` nao pintou o selo com o numero que o '
            'servidor mandou. Se o modelo tem o numero e a barra nao o pinta, '
            'o que falta e a ligacao na casca.',
      );
    });

    testWidgets('ISCA: o selo da `Rede` e a SOMA das duas sub-abas',
        (tester) async {
      final servidor = ServidorDosContadores(eventos: 2, profissionais: 3);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      expect(
        contadores.rede,
        5,
        reason: 'REPROVA: o selo da `Rede` nao e a soma (2 eventos + 3 '
            'profissionais = 5). A barra tem UM selo por aba e a secao tem '
            'duas sub-abas; mostrar so uma das parcelas esconderia metade da '
            'novidade, e mostrar duas exigiria um segundo selo no mesmo slot.',
      );
      expect(contadores.eventos, 2);
      expect(contadores.profissionais, 3);

      await abrirComContagem(tester, eventos: 2, profissionais: 3);
      expect(
        seloPintadoNaAba(tester, 'Rede'),
        '5',
        reason: 'REPROVA: a aba `Rede` nao pintou a soma. Com a ligacao da '
            'casca desligada nao sai selo nenhum; com ela ligada numa das '
            'parcelas sai `2` ou `3`.',
      );
    });

    test('ISCA: `Mural` e `Loja` continuam SEM selo -- nao ha o que contar',
        () async {
      final servidor = ServidorDosContadores(
        perdidos: 4,
        eventos: 4,
        profissionais: 4,
      );
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      for (final campo in <CampoSemantico>[
        CampoSemantico.publicacao,
        CampoSemantico.compra,
      ]) {
        final destino = destinoDe(campo);
        expect(
          destino.contagem,
          isNull,
          reason: 'REPROVA: "${destino.rotulo}" declara substantivo de '
              'contagem e nao tem fonte. `Mural` nao tem tabela de '
              'publicacao, nao tem tabela de seguir e nao tem rota de linha '
              'do tempo; `Loja` ele nao pediu. Substantivo declarado convida a '
              'proxima pessoa a inventar o numero no aparelho.',
        );
      }
    });

    test('ISCA: a cidade do aparelho vai no pedido -- selo e lista no mesmo '
        'recorte', () async {
      final servidor = ServidorDosContadores(perdidos: 1);
      final contadores = contadoresDe(servidor, cidadeGuardada: 'Campinas');
      // DUAS atualizacoes, e a primeira NAO leva cidade de proposito: o
      // deposito e canal de plataforma e a leitura dele **nunca e aguardada**
      // -- aguardar penduraria o contador em silencio num aparelho com
      // armazenamento bloqueado (e pendurou doze casos de outras frentes
      // quando a primeira versao deste arquivo aguardava). A primeira chamada
      // dispara a leitura; a segunda ja leva o valor.
      await contadores.atualizar();
      await contadores.atualizar();

      expect(
        servidor.cidades,
        contains('Campinas'),
        reason: 'REPROVA: o contador pediu sem cidade tendo cidade guardada. O '
            'deposito e o MESMO que `lista_de_perdidos.dart` grava a cada '
            'carga; ignora-lo faz o selo contar o pais inteiro e a lista '
            'mostrar uma cidade -- a pessoa toca na aba e o numero nao bate '
            'com nada na tela.',
      );
    });

    test('ISCA: sem cidade guardada o pedido sai SEM `city`, e nao com vazio',
        () async {
      final servidor = ServidorDosContadores(perdidos: 1);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      expect(
        servidor.cidades,
        <String?>[null],
        reason: 'REPROVA: saiu `city` com a cidade ausente. `city=` vazio e '
            '**400** pelo `minLength: 2` do contrato, e nao geografia aberta: '
            'o contador levaria erro em vez de contar. Geografia aberta e a '
            'FALTA do parametro.',
      );
    });

    test('ISCA: o PRIMEIRO pedido sai sem cidade -- o deposito nao e aguardado',
        () async {
      final servidor = ServidorDosContadores(perdidos: 1);
      final contadores = contadoresDe(servidor, cidadeGuardada: 'Campinas');
      await contadores.atualizar();

      expect(
        servidor.cidades.first,
        isNull,
        reason: 'REPROVA: o primeiro pedido levou a cidade, quer dizer que o '
            'contador AGUARDOU `CidadeEscolhida.ler()`. Esse `await` pendura o '
            'contador em SILENCIO onde o canal de plataforma nao tem tratador '
            '-- teste de widget, armazenamento bloqueado, perfil restrito, '
            'build sem o plugin --, porque canal sem tratador nao estoura: ele '
            'nunca responde. Medido: com o `await`, doze casos de cadastro, '
            'login e re-registro de aparelho de OUTRAS frentes reprovaram, '
            'porque o `aoEntrar` nunca voltava. O preco deste nulo e que a '
            'primeira contagem da sessao sai sem recorte de geografia.',
      );
    });

    test('ISCA: falha de rede NAO zera as tres contagens', () async {
      final servidor = ServidorDosContadores(
        perdidos: 3,
        eventos: 2,
        profissionais: 1,
      );
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();
      expect(contadores.perdidos, 3);

      servidor.derrubar = true;
      await contadores.atualizar();

      expect(
        <int?>[contadores.perdidos, contadores.rede],
        <int?>[3, 3],
        reason: 'REPROVA: a falha virou zero. Um numero velho e mais '
            'verdadeiro que um zero inventado -- zero afirmaria, para quem tem '
            'tres perdidos novos na vizinhanca, que nao ha nenhum.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (b) VER A AREA ZERA -- E O SERVIDOR E QUEM DECIDE
  //
  // COMO DESLIGAR E VER REPROVAR: em `contadores_de_nao_lido.dart`, faca
  // `marcarSecaoVista` devolver sem chamar `_secoes.marcarVista`. Os tres
  // primeiros casos reprovam por nome.
  // -------------------------------------------------------------------------
  group('(b) ver a area zera o selo dela', () {
    test('ISCA: ver a aba `Pets` zera a contagem de perdidos', () async {
      final servidor = ServidorDosContadores(perdidos: 6);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();
      expect(contadores.perdidos, 6);

      await contadores.marcarSecaoVista(SecaoComContador.pets);

      expect(
        servidor.vistas,
        <String>['pets'],
        reason: 'REPROVA: a area nao foi marcada no servidor. O marcador mora '
            'em `section_list_views`, e sem ele o selo NUNCA zera -- contador '
            'que nao zera e pior que contador nenhum.',
      );
      expect(
        contadores.perdidos,
        0,
        reason: 'REPROVA: o numero continuou aceso depois da visita.',
      );
    });

    test('ISCA: a `Rede` zera em DOIS passos, um por sub-aba', () async {
      final servidor = ServidorDosContadores(eventos: 2, profissionais: 3);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();
      expect(contadores.rede, 5);

      await contadores.marcarSecaoVista(SecaoComContador.eventosDaRede);
      expect(
        contadores.rede,
        3,
        reason: 'REPROVA: ver `Eventos` nao derrubou 5 para 3. Se derrubou para '
            'ZERO, o marcador da `Rede` e UNICO -- e entao o app afirmou que a '
            'pessoa viu tres profissionais novos que nunca apareceram na tela '
            'dela. Os marcadores sao SEPARADOS por sub-aba de proposito.',
      );

      await contadores.marcarSecaoVista(SecaoComContador.comunidadeDaRede);
      expect(
        contadores.rede,
        0,
        reason: 'REPROVA: ver `Comunidade` nao derrubou o resto.',
      );
      expect(servidor.vistas, <String>['network_events', 'network_directory']);
    });

    test('ISCA: ver uma area NAO zera as outras duas', () async {
      final servidor = ServidorDosContadores(
        perdidos: 4,
        eventos: 2,
        profissionais: 3,
      );
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      await contadores.marcarSecaoVista(SecaoComContador.pets);

      expect(
        <int?>[contadores.perdidos, contadores.rede],
        <int?>[0, 5],
        reason: 'REPROVA: marcar `Pets` mexeu na contagem da `Rede`. Cada area '
            'tem o seu marcador, e zerar junto apagaria novidade que a pessoa '
            'nao viu.',
      );
    });

    test('ISCA: o ZERO vem do SERVIDOR, e nao do app -- uma viagem so',
        () async {
      final servidor = ServidorDosContadores(perdidos: 6);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();
      final pedidosAntes = servidor.pedidosDeContagem;

      // O servidor NAO aplica a visita neste caso: ele continua respondendo 6.
      // Um app que zerasse local mostraria 0; um app que confia no servidor
      // mostra 6, porque 6 foi o que ele respondeu.
      servidor.aplicaVista = false;
      await contadores.marcarSecaoVista(SecaoComContador.pets);

      expect(
        contadores.perdidos,
        6,
        reason: 'REPROVA: o app zerou por conta propria. Quem decide o numero '
            'depois da visita e o SERVIDOR -- a primeira versao de '
            '`marcarMensagensVistas` zerava local e estava errada, porque ver '
            'a lista de mensagens nao tira tudo do contador. Nenhuma destas '
            'tres areas tem excecao parecida HOJE, e e exatamente por isso que '
            'a decisao tem de continuar do lado que sabe: assim ela continua '
            'certa no dia em que uma excecao nascer.',
      );
      expect(
        servidor.pedidosDeContagem,
        pedidosAntes,
        reason: 'REPROVA: o app pediu `GET /me/section-counters` depois de '
            'marcar. A rota de escrita ja devolve os contadores recalculados '
            'no corpo -- uma viagem, e nao duas. O contador de MENSAGENS paga '
            'duas porque a rota dele responde 204, e la ela tem de responder '
            '204 (o aviso de plaquinha lida atravessa o zero).',
      );
    });

    test('ISCA: falha ao marcar NAO zera -- o selo fica e a proxima tenta',
        () async {
      final servidor = ServidorDosContadores(perdidos: 6);
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      servidor.derrubar = true;
      await contadores.marcarSecaoVista(SecaoComContador.pets);

      expect(
        contadores.perdidos,
        6,
        reason: 'REPROVA: a falha da marcacao virou zero na tela. O selo tem '
            'de ficar aceso: a area NAO foi marcada no servidor, e um zero aqui '
            'faria a tela e o servidor discordarem ate a proxima abertura.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (c) O ROTULO ACESSIVEL DIZ O QUE O NUMERO SIGNIFICA
  //
  // COMO DESLIGAR E VER REPROVAR: em `casca_com_abas.dart`, apague
  // `contagem:` do registro da aba `Pets`. O `assert` de `nomeAcessivelCom`
  // estoura e o primeiro caso reprova por nome.
  // -------------------------------------------------------------------------
  group('(c) o rotulo acessivel diz o que o numero significa', () {
    testWidgets('ISCA: o leitor de tela ouve `Pets, 3 pets perdidos novos`',
        (tester) async {
      await abrirComContagem(tester, perdidos: 3);
      expect(
        rotuloAnunciadoDaAba(tester, 'Pets'),
        'Pets, 3 pets perdidos novos',
        reason: 'REPROVA: a aba `Pets` nao anuncia o que o numero significa. '
            'Um `3` sozinho e numero sem assunto; e `3 mensagens novas` -- o '
            'texto que a funcao tinha fixo antes de 20/10 -- seria pior ainda, '
            'porque afirmaria mensagem numa aba de pets.',
      );
    });

    testWidgets('ISCA: a `Rede` anuncia O QUE o numero JUNTA', (tester) async {
      await abrirComContagem(tester, eventos: 2, profissionais: 3);
      expect(
        rotuloAnunciadoDaAba(tester, 'Rede'),
        'Rede, 5 novidades, eventos e profissionais novos',
        reason: 'REPROVA: o numero da `Rede` e a SOMA de duas coisas e o '
            'rotulo nao diz quais. Quem ouve a tela precisa saber que o 5 '
            'reune eventos e profissionais -- senao entrar em `Eventos` e ver '
            'o numero cair para 3 fica inexplicavel.',
      );
    });

    testWidgets('ISCA: `AuAu` continua anunciando o MESMO texto de antes',
        (tester) async {
      await abrirComContagem(tester, mensagens: 3);
      expect(
        rotuloAnunciadoDaAba(tester, 'AuAu'),
        'AuAu, 3 mensagens novas',
        reason: 'REPROVA: mover o substantivo para o registro mudou o anuncio '
            'de `AuAu`. Ele tinha de sair IGUAL: a mudanca e de lugar, nao de '
            'microcopy, e o contador de mensagens e de outra frente.',
      );
    });

    test('ISCA: o rotulo leva o numero INTEIRO, e o selo pinta `9+`', () {
      final pets = destinoDe(CampoSemantico.animal);
      expect(
        pets.nomeAcessivelCom(23),
        'Pets, 23 pets perdidos novos',
        reason: 'REPROVA: o rotulo acessivel recortou em `9+`. O recorte e de '
            'quem VE -- o circulo nao cresce --, e aplica-lo a quem ouve seria '
            'contar "nove mais" para quem tem 23.',
      );
      expect(DistintivoDaAba.textoDe(23), '9+');
      expect(
        destinoDe(CampoSemantico.comunidade).nomeAcessivelCom(1),
        'Rede, 1 novidade, eventos e profissionais novos',
        reason: 'REPROVA: o singular da `Rede` nao saiu. "1 novidades" e o '
            'tipo de erro que so quem ouve a tela encontra.',
      );
      expect(
        pets.nomeAcessivelCom(1),
        'Pets, 1 pet perdido novo',
        reason: 'REPROVA: o singular de `Pets` nao saiu.',
      );
    });

    test('ISCA: toda aba com fonte declara substantivo -- e so elas', () {
      const comFonte = <CampoSemantico>{
        CampoSemantico.conversa,
        CampoSemantico.animal,
        CampoSemantico.comunidade,
      };
      for (final destino in CascaComAbas.destinos) {
        expect(
          destino.contagem != null,
          comFonte.contains(destino.campoSemantico),
          reason: 'REPROVA: "${destino.rotulo}" esta do lado errado da linha. '
              'Aba com fonte e sem substantivo anuncia numero sem assunto; aba '
              'sem fonte e com substantivo convida a proxima pessoa a inventar '
              'o numero no aparelho -- que e a adivinhacao que '
              '`modelos_conversa.dart` proibe por escrito.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // (d) OS TRES SELOS ACESOS NAO FAZEM ROTULO CORTAR
  //
  // COMO DESLIGAR E VER REPROVAR: em `DistintivoDaAba.build`, troque o `Stack`
  // + `Positioned` por uma `Row` com o glifo e o selo lado a lado. Com tres
  // selos a disputa de largura passa a ser em tres slots de uma vez.
  // -------------------------------------------------------------------------
  group('(d) o selo nao faz rotulo cortar, com os TRES acesos', () {
    setUpAll(carregarInter);

    // UM, DOIS e TRES digitos. O teto de hoje e `9+` -- dois caracteres --, e
    // tres digitos sao medidos de proposito: fica provado que `9+` e escolha
    // de UNIDADE DE LINGUAGEM e nao falta de espaco.
    for (final quantidade in <int>[3, 42, 999]) {
      final selo = quantidade <= 9 ? '$quantidade' : '9+';
      for (final largura in larguras) {
        testWidgets(
            'ISCA: com $quantidade em CADA aba (selo `$selo`), nenhum rotulo '
            'corta em ${largura.toInt()} dp a 200%', (tester) async {
          await montarBarraComSelo(
            tester,
            largura: largura,
            naoLidas: null,
            // OS TRES DE UMA VEZ. Uma aba por caso mediria o melhor cenario; o
            // pior e a barra inteira acesa, que e o que acontece de verdade
            // para quem tem recado, perdido novo e evento novo no mesmo dia.
            naoLidasDe: (destino) => destino.contagem == null ? null : quantidade,
          );

          // A guarda do proprio caso: os tres selos tem de estar PINTADOS,
          // senao a medida e de uma barra sem selo e o grupo aprova por
          // vacuidade -- que foi como um portao desta rodada ficou verde.
          for (final rotulo in <String>['Pets', 'Rede', 'AuAu']) {
            expect(
              seloPintadoNaAba(tester, rotulo),
              selo,
              reason: 'REPROVA: a aba "$rotulo" nao tem o selo `$selo` em '
                  '${largura.toInt()} dp. Sem ele este caso mede a barra sem '
                  'contador e aprova sem ter testado nada.',
            );
          }

          final transbordos = medirRotulos(tester, largura);
          expect(
            transbordos,
            isEmpty,
            reason: 'REPROVA: os selos fizeram rotulo quebrar ou sair da barra '
                'em ${largura.toInt()} dp.\n'
                '${transbordos.map((t) => '  "${t.rotulo}": ${t.linhas} '
                    'linha(s), ${t.fora.toStringAsFixed(2)} dp fora').join('\n')}\n'
                'O slot em 320 dp e de 64,00 e `Mural` ja gasta 50,90 -- '
                '13,10 dp de folga. O selo mora SOBRE o glifo justamente para '
                'nao entrar nessa disputa: o `Positioned` sai do fluxo e o '
                '`Stack` toma o tamanho do icone.',
          );
        });
      }
    }

    testWidgets('GUARDA: a barra medida e a do REGISTRO, com os cinco rotulos',
        (tester) async {
      await montarBarraComSelo(
        tester,
        largura: 320,
        naoLidas: null,
        naoLidasDe: (destino) => destino.contagem == null ? null : 3,
      );
      final pintados = tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((d) => d.label)
          .toSet();
      expect(
        pintados,
        larguraMedidaPelaUx.keys.toSet(),
        reason: 'REPROVA: a barra montada pinta $pintados e a tabela da '
            'UX 27.2.1 fala de ${larguraMedidaPelaUx.keys.toSet()}. Rotulo '
            'novo sem linha na tabela passaria sem ser medido.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (e) SEM CONTA, NENHUMA ABA PINTA SELO
  //
  // COMO DESLIGAR E VER REPROVAR: em `ContadoresDeNaoLido.esquecer()`, apague
  // a linha que limpa `_secoesContadas`. O primeiro caso reprova por nome.
  // -------------------------------------------------------------------------
  group('(e) sem conta, nenhuma aba pinta selo', () {
    test('ISCA: `esquecer()` devolve as TRES contagens a NULO, e nao a zero',
        () async {
      final servidor = ServidorDosContadores(
        perdidos: 3,
        eventos: 2,
        profissionais: 1,
      );
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();
      expect(contadores.perdidos, 3);

      contadores.esquecer();

      expect(
        <int?>[
          contadores.perdidos,
          contadores.rede,
          contadores.eventos,
          contadores.profissionais,
        ],
        <int?>[null, null, null, null],
        reason: 'REPROVA: sair da conta deixou numero (ou zero) nas contagens '
            'de secao. A barra de baixo e desenhada TAMBEM deslogada, entao '
            'sobra o selo da conta anterior na tela de quem acabou de sair. '
            'Zero seria igualmente errado: ele afirmaria, para quem nao tem '
            'conta, que nao ha novidade nenhuma.',
      );
    });

    testWidgets('ISCA: com as contagens nulas a barra nao pinta selo nenhum',
        (tester) async {
      final contadores = contadoresDe(ServidorDosContadores());
      contadores.esquecer();

      await montarBarraComSelo(
        tester,
        largura: 390,
        naoLidas: null,
        naoLidasDe: (destino) => switch (destino.campoSemantico) {
          CampoSemantico.conversa => contadores.mensagens,
          CampoSemantico.animal => contadores.perdidos,
          CampoSemantico.comunidade => contadores.rede,
          _ => null,
        },
      );

      for (final rotulo in larguraMedidaPelaUx.keys) {
        expect(
          seloPintadoNaAba(tester, rotulo),
          isNull,
          reason: 'REPROVA: a aba "$rotulo" pintou selo sem conta. Nulo e '
              '"ninguem contou ainda" e nao pinta NADA -- nem zero, nem erro.',
        );
      }
    });

    test('ISCA: zero do servidor tambem nao pinta -- e nao e erro', () async {
      final servidor = ServidorDosContadores();
      final contadores = contadoresDe(servidor);
      await contadores.atualizar();

      expect(contadores.perdidos, 0);
      expect(
        DistintivoDaAba.textoDe(contadores.perdidos),
        isNull,
        reason: 'REPROVA: zero pintou selo. Um `0` chama o olho para dizer que '
            'nao ha motivo para olhar -- e pior que nada. A diferenca com nulo '
            'continua existindo no MODELO (zero e afirmacao do servidor, nulo e '
            'ausencia de afirmacao); ela so nao chega ao desenho.',
      );
    });
  });
}
