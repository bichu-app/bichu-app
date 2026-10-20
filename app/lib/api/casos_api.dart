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

  /// `GET /lost-cases/{caseId}` (`getLostCase`).
  ///
  /// ## Por que ela faltava, e o que ela destrava
  ///
  /// **A ficha do pet nao tinha como saber nada do caso aberto dele.** Ate
  /// 20/10/2026 `GET /pets/{petId}` devolvia `open_case_id` sempre nulo
  /// (literal no mapeador, `kysely-pet-repository.ts`), e por isso ninguem
  /// precisava desta leitura: sem o `caseId` nao havia o que buscar. Com o
  /// conserto daquele campo, esta e a unica porta pelo contrato que entrega o
  /// `share_url` e o `area_label` do caso -- os dois campos de que a acao de
  /// compartilhar vive.
  ///
  /// **`share_url` so sai do servidor, nunca daqui.** `LostCase` nao carrega
  /// `share_token`: carrega `id`, que e UUID, e o ADR-0010 item 6 proibe UUID
  /// interno em saida publica. Nao ha, e nao pode haver, montagem de endereco
  /// publico neste lado -- e e por isso que a AUSENCIA de `share_url` e um
  /// interruptor que o app nao consegue contornar nem por descuido.
  ///
  /// Nao trata falha: 404 e "nao existe, nao e seu, ou nao esta aberto" (ADR-0021,
  /// as tres indistinguiveis de proposito), e falha de rede e "nao consegui
  /// perguntar". Quem chama decide, e no detalhe do pet as duas levam ao mesmo
  /// lugar -- a acao de compartilhar nao aparece.
  Future<CasoDePerdido> buscarCaso(String caseId) async {
    final json = await _api.get('/lost-cases/$caseId');
    return CasoDePerdido.doJson(json);
  }

  /// `GET /lost-cases/{caseId}/candidates` (`listLostCaseCandidates`).
  ///
  /// **A leitura que faltava para a decisao fazer sentido.** A rota de decidir
  /// ja existia: sem esta, o tutor podia dizer "e o meu pet" sobre algo que ele
  /// nao tinha como ver.
  ///
  /// `limit` e `cursor` entram so quando ha o que mandar. O cursor e **opaco**:
  /// vem de [PaginaDeCandidatos.proximoCursor] e volta como veio -- o app nao o
  /// interpreta, e nao monta ordem propria. Quem ordena e o servidor, por
  /// `score`, que nao vai para a tela (criterio 2 da BICHUS-86).
  ///
  /// Nao trata falha: lista vazia e "ainda nao apareceu ninguem", e falha de
  /// rede e "nao consegui perguntar". A tela tem texto diferente para cada uma,
  /// e um `catch` que devolvesse pagina vazia apagaria a distincao.
  Future<PaginaDeCandidatos> candidatos(
    String caseId, {
    String? cursor,
    int? limite,
  }) async {
    final json = await _api.get(
      '/lost-cases/$caseId/candidates',
      query: <String, String>{
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        if (limite != null) 'limit': limite.toString(),
      },
    );
    return PaginaDeCandidatos.doJson(json);
  }

  /// `PATCH /lost-cases/{caseId}` (`updateLostCase`).
  ///
  /// O corpo e `LostCaseInput`, o MESMO da abertura: [corpoDeAbertura] o monta,
  /// e reusa-lo nao e economia -- dois montadores dariam duas respostas para
  /// "o que e onde e quando", e a correcao sairia diferente da abertura.
  ///
  /// **Corrigir NAO reenvia o alerta.** Quem quer avisar a vizinhanca de novo
  /// chama [reenviarAlerta], que tem teto de um por dia.
  Future<CasoDePerdido> corrigirOndeEQuando({
    required String caseId,
    required Map<String, dynamic> corpo,
  }) async {
    final json = await _api.patch('/lost-cases/$caseId', corpo: corpo);
    return CasoDePerdido.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/alerts` (`resendLostCaseAlert`).
  ///
  /// **Um por caso a cada 24 h**, e o servidor recusa o segundo com 429 e
  /// `Retry-After`. A tela diz quanto falta; ela nao esconde o botao, porque
  /// esconder faria a pessoa achar que o reenvio nao existe.
  ///
  /// Devolve `AlertDispatch`: `queued` quando ha raio, `no_location` quando o
  /// caso nao tem coordenada. A API enfileira e o worker envia (ADR-0001), e e
  /// por isso que a resposta e 202 e nao promete que o alerta saiu.
  Future<DisparoDoAlerta> reenviarAlerta(String caseId) async {
    final json = await _api.post('/lost-cases/$caseId/alerts');
    return DisparoDoAlerta.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/close` (`closeLostCase`).
  ///
  /// **A acao inversa de `Marcar como perdido`**, e o cliente a pediu em 18/10
  /// com estas palavras: *"no perfil do cachorro ... nao tem uma opcao de
  /// desmarcar como perdido ou que foi encontrado"*.
  ///
  /// ## `outcome` e obrigatorio, e o contrato diz por que
  ///
  /// *"O desfecho e o instrumento de medicao do produto: sem ele a metrica de
  /// reencontro nao existe."* Os tres valores sao `reunited`, `not_found` e
  /// `false_alarm`, e **quem escolhe e quem chama** -- esta funcao nao tem
  /// padrao. Um padrao aqui faria uma tela que esqueceu de decidir gravar
  /// "reencontrado" sobre um caso que ninguem resolveu, e a metrica do produto
  /// e o que pagaria.
  ///
  /// ## Sem chave de idempotencia, e a ausencia e do contrato
  ///
  /// `closeLostCase` **nao declara** o parametro `Idempotency-Key`, ao
  /// contrario de [abrirCaso]. Mandar um cabecalho que a operacao nao preve nao
  /// e inofensivo: ele nao e lido, e passaria a impressao de uma protecao que
  /// nao existe. O que protege o reenvio aqui e o proprio estado -- encerrar um
  /// caso ja encerrado nao e caso aberto de novo.
  ///
  /// ## `reunion_channel` nao e preenchido por esta funcao
  ///
  /// Ele e opcional no contrato e e o que torna a metrica de reencontro
  /// **atribuivel a um canal** -- e o app nao sabe o canal. Quem toca em
  /// `Encontrei meu pet` na pagina do pet pode ter achado pela tag, pelo
  /// alerta, pelo cartaz ou sozinho, e inventar um valor aqui colocaria
  /// atribuicao falsa numa metrica de produto. Entra como parametro para o dia
  /// em que uma tela PERGUNTAR, e nao antes.
  Future<CasoDePerdido> encerrarCaso({
    required String caseId,
    required DesfechoDoCaso desfecho,
    CanalDoReencontro? canal,
    String? observacao,
  }) async {
    final json = await _api.post(
      '/lost-cases/$caseId/close',
      corpo: <String, dynamic>{
        'outcome': desfecho.valor,
        if (canal != null) 'reunion_channel': canal.valor,
        if (observacao != null && observacao.trim().isNotEmpty)
          'note': observacao.trim(),
      },
    );
    return CasoDePerdido.doJson(json);
  }

  /// `POST /lost-cases/{caseId}/reopen` (`reopenLostCase`).
  ///
  /// **O DESFAZER de [encerrarCaso].** O contrato promete a reversao desde o
  /// comeco -- *"Encerrar e reversivel por 7 dias"*, na descricao de
  /// `closeLostCase` -- e nomeia esta operacao, com um `410` cuja descricao e
  /// *"Passou dos 7 dias"*. Ela **nao tinha rota no servidor** ate agora: era
  /// uma linha de `OPERACOES_AINDA_SEM_ROTA`, e este caminho respondia 404.
  /// Quem tocasse em `Encontrei meu pet` por engano nao tinha desfazer nenhum.
  ///
  /// ## Sem corpo, e a ausencia e do contrato
  ///
  /// `reopenLostCase` nao declara `requestBody`. Mandar um corpo que a operacao
  /// nao preve nao e inofensivo: ele nao e lido, e passaria a impressao de que
  /// esta chamada escolhe alguma coisa. Ela nao escolhe -- reabrir e reabrir.
  ///
  /// ## Sem chave de idempotencia, e sem precisar de uma
  ///
  /// O contrato nao a declara, e o estado protege o reenvio: reabrir um caso
  /// que **ja esta aberto** devolve `200` com o caso aberto, e nao erro. E a
  /// resposta certa para a fila offline, que reenvia em rajada quando o sinal
  /// volta.
  ///
  /// ## Os erros que a tela precisa distinguir
  ///
  /// `410` com `type` `lost-case-closed` (`ProblemTipo.casoEncerrado`) e a
  /// janela vencida; `404` e caso que nao existe ou nao e da conta (ADR-0021,
  /// nunca 403); `409` `pet-already-lost` e o pet que ja tem outro caso aberto.
  /// Quem decide por `type`, e nunca pelo texto, e `MensagensDeErro`.
  Future<CasoDePerdido> reabrirCaso(String caseId) async {
    final json = await _api.post('/lost-cases/$caseId/reopen');
    return CasoDePerdido.doJson(json);
  }
}
