// Cancelar o PROPRIO evento (`cancelNetworkEvent`), na camada de API.
//
// ## Por que os casos param na camada de API, e nao numa tela
//
// Porque **nao ha tela**, e isso foi medido e nao suposto. Em 19/10/2026 o
// cliente pediu que o cartao de evento fosse reduzido a foto e titulo, sem
// pagina de detalhe; e nenhuma operacao do contrato mostra a quem entrou os
// eventos que ELA criou: `listNetworkEvents` nao tem recorte de autoria e
// `NetworkEventPublic` nao tem campo de autoria. A acao de cancelar nao tem
// onde morar, e onde ela vai morar e decisao de produto.
//
// O que estes casos cobrem e o que NAO depende dessa decisao: a operacao sai
// com a precondicao que o contrato exige, o evento volta `cancelled`, e a
// colisao de versao chega distinguivel em vez de cair na faixa generica.

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/modelos_rede.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/api/rede_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';

void main() {
  setUp(AppConfig.limparParaTeste);

  /// A rede de teste, guardando a requisicao que de fato saiu.
  ({RedeApi api, List<http.Request> saiu}) comResposta(
    http.Response Function(http.Request) responder,
  ) {
    final saiu = <http.Request>[];
    final cliente = ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
      cliente: MockClient((req) async {
        saiu.add(req);
        return responder(req);
      }),
      tokenDeAcesso: () async => 'token-de-teste',
    );
    return (api: RedeApi(cliente), saiu: saiu);
  }

  group('cancelar o proprio evento', () {
    // ISCA (b). Mede as DUAS metades que a operacao promete: a precondicao sai
    // no cabecalho da requisicao, e o evento volta `cancelled`.
    //
    // A primeira metade e lida da requisicao ENTREGUE AO TRANSPORTE, nao da
    // assinatura de `cancelar`: `RedeApi` poderia aceitar `ifMatch` e nao
    // repassa-lo, e o servidor responderia 428 com o teste verde.
    test('manda o If-Match da ultima leitura e devolve o evento cancelado',
        () async {
      final rede = comResposta(
        (_) => json200(encontroPublico(status: 'cancelled')),
      );

      final encontro = await rede.api.cancelar(
        slugPublico,
        ifMatch: '"7"',
        nota: 'choveu e o parque fechou',
      );

      final req = rede.saiu.single;
      expect(req.method, 'POST');
      expect(req.url.path, '/v1/network/events/$slugPublico/cancellation');
      // O cabecalho SAI, com o valor exato da leitura.
      expect(req.headers['If-Match'], '"7"');
      // A nota vai no corpo, e e o unico campo que o esquema aceita.
      expect(req.body, '{"note":"choveu e o parque fechou"}');
      // E o evento passa a `cancelled`.
      expect(encontro.situacao, SituacaoDoEncontro.cancelado);
    });

    // ISCA (c). O 412 tem de chegar DISTINGUIVEL. Antes desta entrega
    // `ProblemTipo` nao declarava `precondition-failed`, `deUri` devolvia
    // `desconhecido`, e a colisao entre duas pessoas caia na mesma faixa
    // generica de "algo deu errado" -- a frase que esconde justamente o que
    // resolve, que e recarregar.
    test('ETag velho vira precondicaoFalhou, e nao a faixa generica',
        () async {
      final rede = comResposta((_) => problema('precondition-failed', 412));

      final falha = await rede.api
          .cancelar(slugPublico, ifMatch: '"1"', nota: 'motivo')
          .then<Object?>((_) => null, onError: (Object e) => e);

      expect(falha, isA<FalhaDaApi>());
      final problem = (falha! as FalhaDaApi).problem;
      expect(problem.status, 412);
      expect(problem.tipo, ProblemTipo.precondicaoFalhou);
      expect(problem.tipo, isNot(ProblemTipo.desconhecido));

      // E o que a pessoa LE: o que aconteceu, em linguagem de gente, com
      // `Recarregar` como saida. Nao a faixa generica, e nao `Tentar de
      // novo` -- tentar de novo com a mesma versao recusada falha igual.
      final mensagem = MensagensDeErro.de(falha as FalhaDaApi);
      expect(mensagem.texto, contains('enquanto você olhava'));
      expect(mensagem.acao, MensagensDeErro.recarregar);
      expect(mensagem.texto, isNot(contains('ETag')));
      expect(mensagem.texto, isNot(contains('If-Match')));
      expect(mensagem.texto, isNot(MensagensDeErro.servidorFora));
      expect(mensagem.acao, isNot(MensagensDeErro.tentarDeNovo));
    });

    // E o 428, que e a outra metade da precondicao: o app deixou de mandar a
    // versao que leu. Tambem caia em `desconhecido`.
    test('sem If-Match o 428 vira precondicaoNecessaria', () async {
      final rede = comResposta((_) => problema('precondition-required', 428));

      final falha = await rede.api
          .cancelar(slugPublico, ifMatch: '"1"', nota: 'motivo')
          .then<Object?>((_) => null, onError: (Object e) => e);

      expect((falha! as FalhaDaApi).problem.tipo,
          ProblemTipo.precondicaoNecessaria);
    });

    // ISCA (d). Evento de outra pessoa responde 404, e o app o trata como
    // "nao encontramos isso" -- nunca como "este nao e seu" (ADR-0021).
    //
    // **O 404 em si e garantia do SERVIDOR, e nao deste caso**: aqui a
    // resposta e dublada, e um teste que a dublasse e depois afirmasse "o
    // servidor devolve 404" seria vacuo. O que este caso prova e o lado do
    // app: que o 404 chega como `naoEncontrado` e que NADA no caminho de
    // cancelar inventa um 403. O 404 do servidor foi medido contra
    // homologacao (`458cd005`) em 19/10/2026, com conta descartavel.
    test('evento de outra pessoa chega como naoEncontrado, nunca 403',
        () async {
      final rede = comResposta((_) => problema('not-found', 404));

      final falha = await rede.api
          .cancelar('evento-de-outra-pessoa', ifMatch: '"1"', nota: 'motivo')
          .then<Object?>((_) => null, onError: (Object e) => e);

      final problem = (falha! as FalhaDaApi).problem;
      expect(problem.status, 404);
      expect(problem.tipo, ProblemTipo.naoEncontrado);
      expect(problem.status, isNot(403));
    });
  });
}
