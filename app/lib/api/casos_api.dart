import 'api_client.dart';
import 'modelos_caso.dart';

/// As operacoes de caso de perdido do contrato (`tags: [lost]`).
///
/// **O backend destas duas rotas esta mesclado** (BICHUS-202 para a previa,
/// `lost-case-routes.ts` para a abertura). Esta classe e escrita contra
/// `api/openapi.yaml`, que e a autoridade, e nao contra o que o servidor
/// responde hoje.
///
/// ## O corpo da abertura sai por uma funcao propria, e o motivo e a fila
///
/// [corpoDeAbertura] existe separada de [abrirCaso] porque o mesmo corpo tem
/// dois destinos: a rede, agora, e **a fila offline**, quando nao ha sinal. Se
/// a fila montasse um corpo proprio, a acao enfileirada no elevador poderia
/// sair diferente da que sairia na rua -- e a diferenca so apareceria no dia em
/// que alguem mexesse num dos dois. O mesmo vale para [caminhoDeAbertura].
class CasosApi {
  const CasosApi(this._api);

  final ApiClient _api;

  /// `GET /pets/{petId}/lost-case-preview` (`previewLostCaseReach`).
  ///
  /// **Sem `lat`/`lon`.** O app nao tem porta de localizacao hoje, e o
  /// contrato declara os dois como opcionais: ausentes, o servidor usa a
  /// localizacao de referencia do tutor (BICHUS-92) e devolve `area_label` em
  /// texto. Mandar meia coordenada seria 400, e inventar uma seria pior.
  ///
  /// Nao trata falha: quem chama precisa distinguir "nao ha ninguem por perto"
  /// de "nao consegui perguntar", e um `catch` que devolvesse uma previa vazia
  /// apagaria exatamente a distincao que o ADR-0006 manda preservar.
  Future<PreviaDoAlcance> previaDoAlcance(String petId) async {
    final json = await _api.get('/pets/$petId/lost-case-preview');
    return PreviaDoAlcance.doJson(json);
  }

  /// O caminho de `openLostCase`, relativo a `/v1`.
  ///
  /// Caminho e nao URL: a fila offline grava o caminho e a base vem da
  /// configuracao na hora do envio. Uma URL gravada carregaria o ambiente do
  /// dia em que a acao foi enfileirada.
  static String caminhoDeAbertura(String petId) => '/pets/$petId/lost-cases';

  /// `LostCaseInput`, campo a campo como o contrato declara.
  ///
  /// **`last_seen_location` nao e montado aqui, e nao e esquecimento**: a tela
  /// nao tem coordenada para dar. O contrato aceita area sozinha (`anyOf`), e
  /// o caso aberto so com area existe do mesmo jeito -- o que muda e o alcance.
  ///
  /// [compartilharNaListaPublica] entra **sempre**, mesmo quando e o padrao do
  /// contrato. Um corpo que omite o campo depende de o servidor continuar
  /// defaultando para verdadeiro; um corpo que o declara diz o que a tela
  /// prometeu a pessoa, e o criterio 10 e sobre isso.
  static Map<String, dynamic> corpoDeAbertura({
    required DateTime vistoEm,
    required AreaDoAvistamento area,
    String? descricao,
    bool compartilharNaListaPublica = true,
  }) {
    return <String, dynamic>{
      // UTC: o servidor recusa data no futuro comparando com o relogio dele, e
      // um instante sem fuso seria lido como local do servidor.
      'last_seen_at': vistoEm.toUtc().toIso8601String(),
      'last_seen_area': area.paraJson(),
      if (descricao != null && descricao.trim().isNotEmpty)
        'description': descricao.trim(),
      'share_to_public_list': compartilharNaListaPublica,
    };
  }

  /// `POST /pets/{petId}/lost-cases` (`openLostCase`).
  ///
  /// A chave de idempotencia e **obrigatoria e vem de fora**. Ela vem de fora
  /// porque o reenvio -- pela fila offline ou pelo `Tentar de novo` da tela --
  /// precisa usar **a chave da primeira tentativa** (criterio 13 da
  /// BICHUS-31). Gerada aqui dentro, cada tentativa seria um pedido novo e os
  /// mesmos vizinhos receberiam o mesmo alerta varias vezes.
  Future<CasoDePerdido> abrirCaso({
    required String petId,
    required Map<String, dynamic> corpo,
    required String idempotencyKey,
  }) async {
    final json = await _api.post(
      caminhoDeAbertura(petId),
      corpo: corpo,
      idempotencyKey: idempotencyKey,
    );
    return CasoDePerdido.doJson(json);
  }
}
