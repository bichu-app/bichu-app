import 'api_client.dart';
import 'falhas.dart';
import 'modelos_conversa.dart';
import 'problem.dart';

/// As operacoes da conversa mediada que o app consome (`tags: [conversations]`).
///
/// ---------------------------------------------------------------------------
/// ## O buraco que este arquivo fecha
///
/// O servidor tem a conversa mediada **no ar** desde antes desta historia:
/// `listConversations`, `getConversation` e `postConversationMessage`
/// respondem, a redacao de telefone e endereco vale nos dois sentidos, e a
/// conversa nasce do aviso da plaquinha. O que nao existia era o cliente: o
/// app **nao chamava nenhuma das tres**.
///
/// O codigo do servidor diz, por extenso, que a conversa e *"o unico lugar em
/// que o tutor le o que o achador escreve"* -- e esse lugar nao existia no
/// app. O recado de quem acha o pet era gravado, redigido, guardado, e
/// **ninguem podia ler**. E o buraco central do produto, e ele se fecha aqui e
/// nas duas telas de `telas/mensagens/`.
///
/// ---------------------------------------------------------------------------
/// ## Quem leva token
///
/// **As tres levam, e nao ha alternativa sem token.** O contrato declara
/// `security: [bearerAuth]` nas tres e **nenhuma aceita `finderToken`** -- o
/// achador sem conta tem as rotas dele (`/finder/conversation*`), que nao tem
/// id no caminho porque o token dele **e** o endereco. Esta classe nao as
/// chama: elas sao da BICHUS-41 e dependem da decisao sobre as paginas
/// publicas.
///
/// ## O 404 e o desenho, e nao um erro a contornar
///
/// Conversa de outra pessoa responde **404, nunca 403** (ADR-0021): um 403
/// confirmaria que aquele id existe. A autorizacao mora no `WHERE` da consulta
/// do servidor, e [buscar] **nao traduz o 404 em lista vazia** -- ele sobe
/// como [FalhaDaApi] e a tela diz "esta conversa nao esta disponivel". Engolir
/// o 404 faria a tela abrir vazia e girar.
///
/// ## O 410 tambem e o desenho
///
/// [enviar] recusa com `410 conversation-closed` em **tres** situacoes, e o
/// corpo e o mesmo nas tres: a conversa foi encerrada, ela foi bloqueada, ou a
/// **conta do outro lado foi desabilitada**. A fusao e deliberada -- distinguir
/// contaria a uma pessoa o que aconteceu com a conta de outra. A tela trata o
/// 410 com modo leitura e **sem caixa de texto**, e nao como defeito; ver
/// `conversaNaoAceitaMais`.
class ConversasApi {
  const ConversasApi(this._api);

  final ApiClient _api;

  /// O limite que o app pede. O contrato tem o teto; este e o pedido.
  static const int limitePadrao = 20;

  /// O limite da LISTA de conversas: **dez**.
  ///
  /// **Numero do cliente, e nao escolha de engenharia** (18/10/2026, literal):
  /// *"faca o carregamento das conversas como rolagem infinita, trazendo as 10
  /// ultimas conversas e incrementando por 10"*. O contrato aceita de 1 a 50
  /// (`Limit`), entao dez nao e mudanca de contrato -- e um pedido dentro da
  /// faixa que ja existia.
  ///
  /// **Separado de [limitePadrao], que continua valendo para as MENSAGENS de
  /// uma conversa.** Um numero so para os dois faria a proxima pessoa que
  /// mexesse na rolagem da lista mudar, sem querer, quantas mensagens a tela da
  /// conversa carrega por vez.
  static const int limiteDaLista = 10;

  /// `GET /v1/conversations` (`listConversations`) -- as minhas conversas.
  ///
  /// **Cursor, e nunca deslocamento.** O contrato declara `cursor` e `limit`, e
  /// nao ha `offset` nem `page`: a lista e ordenada por tempo e uma mensagem
  /// nova empurraria tudo uma casa entre a pagina 1 e a pagina 2.
  ///
  /// `cursor` nulo pede a **primeira** pagina. Nao mandar a chave e diferente
  /// de mandar vazia: o servidor valida o cursor, e `cursor=` reprovaria com
  /// 400 na abertura da tela.
  ///
  /// **A ordem e a da ULTIMA MENSAGEM**, e nao a da abertura da conversa
  /// (decisao do cliente, 18/10/2026). Ela e decidida no servidor
  /// (`coalesce(last_message_at, opened_at)`), e a tela **nao reordena**: com
  /// rolagem infinita, ordenar no aplicativo ordenaria so o que ja chegou, e a
  /// pagina seguinte entraria com itens mais novos no fim da lista.
  ///
  /// [termo] e o `q` do contrato: recorta por nome do pet e por nome de
  /// exibicao do outro lado, **dentro das conversas de quem chamou**. Nao e
  /// busca de pessoas, e um termo que nao casa nada responde 200 com lista
  /// vazia -- nunca 404.
  Future<PaginaDeConversas> listar({
    String? cursor,
    int limite = limiteDaLista,
    String? termo,
  }) async {
    final buscado = termo?.trim();
    final json = await _api.get(
      '/conversations',
      query: <String, String>{
        'limit': '$limite',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        // `q` SO VAI QUANDO HA TERMO, pela mesma razao do `cursor`: o contrato
        // declara `minLength: 2` em `ConversationSearch`, e `q=` reprovaria com
        // 400 na abertura da tela. Nao mandar a chave e diferente de mandar
        // vazia, e aqui a diferenca e um erro na cara da pessoa.
        if (buscado != null && buscado.isNotEmpty) 'q': buscado,
      },
    );
    return _ler(() => PaginaDeConversas.doJson(json));
  }

  /// `GET /v1/conversations/{conversationId}` (`getConversation`) -- a conversa
  /// e as mensagens dela.
  ///
  /// **404 sobe**, e nao vira nulo nem lista vazia: ver o cabecalho da classe.
  Future<Conversa> buscar(
    String conversaId, {
    String? cursor,
    int limite = limitePadrao,
  }) async {
    final json = await _api.get(
      _caminho(conversaId),
      query: <String, String>{
        'limit': '$limite',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
    );
    final conversa = _ler(() => Conversa.doJson(json));
    if (conversa == null) {
      // `doJson` devolve nulo quando `status` ou `id` nao chegam, ou chegam
      // com valor que este build nao conhece. A tela trata `FormatException`
      // como "resposta fora do contrato"; devolver uma conversa `aberta`
      // inventada desenharia uma caixa de texto que o servidor recusaria.
      throw const FormatException(
        'resposta de conversa fora do contrato: `id` ou `status` ausente, '
        'ou `status` com valor que este build nao conhece',
      );
    }
    return conversa;
  }

  /// `POST /v1/conversations/{conversationId}/messages`
  /// (`postConversationMessage`).
  ///
  /// Devolve a mensagem **ja redigida pelo servidor**, com `redactions`
  /// preenchido: o telefone e o endereco que a pessoa escreveu saem do texto
  /// antes de a outra parte ler. A tela mostra o aviso a partir de
  /// `redactions`, para o remetente nao achar que o texto sumiu sozinho.
  ///
  /// ## [fotoUploadId]: a foto vai COM legenda, e nunca sozinha
  ///
  /// `body` continua `minLength: 1` no contrato, e o `CHECK` de
  /// `mediated_messages.body` exige texto nao vazio no banco. Entao **nao
  /// existe mensagem so-foto** nesta rota: a foto viaja como referencia de um
  /// upload ja pago, ao lado de um texto que a pessoa escreveu. Uma tela que
  /// aceitasse foto sem legenda produziria 400 depois de a pessoa ter esperado
  /// o upload inteiro.
  ///
  /// O valor e o `upload_id` de uma intencao de upload ja honrada -- os bytes
  /// chegaram ao armazenamento antes desta chamada. Ver
  /// `EnvioParaConfirmarDepois` em `api/envio_de_foto.dart`: e ele quem guarda
  /// o identificador em vez de chamar a rede, e e por isso que o `uploadId`
  /// dele continua nulo quando o envio nao terminou bem.
  ///
  /// **A higiene da foto e ASSINCRONA no servidor** (a derivada sem metadado,
  /// que e o que a conversa serve). Quando ela ainda nao terminou, esta rota
  /// recusa, e a recusa e identificavel: ver [fotoAindaNaoEstaPronta]. Ela nao
  /// e defeito e nao e definitiva.
  ///
  /// **Nao manda `Idempotency-Key`.** O contrato declara o parametro como
  /// opcional nesta rota, e o app nao tem de onde tirar uma chave estavel: a
  /// mesma pessoa reenviando o mesmo texto de propósito e um caso real numa
  /// conversa, e deduplicar isso comeria a segunda mensagem dela. O reenvio
  /// depois de falha e um **toque da pessoa**, nunca um retry automatico --
  /// ver `TelaDaConversa`.
  Future<MensagemDaConversa> enviar(
    String conversaId,
    String texto, {
    String? fotoUploadId,
  }) async {
    final json = await _api.post(
      '${_caminho(conversaId)}/messages',
      corpo: <String, dynamic>{
        'body': texto,
        // **A CHAVE SO VAI QUANDO HA FOTO**, e nao como `null` explicito. O
        // esquema declara `photo_upload_id` com `format: uuid`, e um `null`
        // numa chave de formato reprova em validador que confere formato antes
        // de conferir nulidade -- a mesma razao pela qual `cursor` e `q` da
        // listagem nao viajam vazios.
        if (fotoUploadId != null && fotoUploadId.isNotEmpty)
          'photo_upload_id': fotoUploadId,
      },
    );
    final mensagem = _ler(() => MensagemDaConversa.doJson(json));
    if (mensagem == null) {
      throw const FormatException(
        'resposta de mensagem fora do contrato: `sender_role`, `body` ou '
        '`created_at` ausente',
      );
    }
    return mensagem;
  }

  /// `POST /v1/me/conversations-seen` (`markMyConversationsSeen`).
  ///
  /// **Zera o contador do sino, e NAO marca conversa nenhuma como lida.**
  ///
  /// As duas coisas sao fatos diferentes -- "eu vi que tenho mensagens" e "eu
  /// li esta conversa" --, e e por isso que sao duas chamadas: quem abre a area
  /// para de ver o numero e continua vendo QUAL conversa guarda o recado. Uma
  /// chamada so apagaria a unica pista de onde esta o recado.
  ///
  /// **O aviso de plaquinha lida e o de achado NAO saem do contador por aqui.**
  /// Eles saem quando a conversa deles e aberta, e isso e decidido no servidor
  /// -- o app nao sabe quais sao, e nao precisa saber.
  ///
  /// **A falha e ENGOLIDA de proposito**, e e o unico lugar deste arquivo em
  /// que isso acontece: nao e dado da tela, e a pessoa nao pediu isto. Mostrar
  /// "nao conseguimos marcar como visto" em cima da lista que acabou de
  /// carregar seria um erro sobre uma operacao que ninguem executou. O numero
  /// continua aceso e a proxima abertura tenta de novo, que e o pior desfecho
  /// possivel -- e e aceitavel.
  Future<void> marcarListaVista() async {
    try {
      await _api.post('/me/conversations-seen');
    } on FalhaDeChamada {
      // Ver o doc acima. Nao relanca.
    }
  }

  /// Le uma resposta, e resposta fora do contrato sai como `FormatException`.
  ///
  /// Mesma razao de `RedeApi._ler`: os modelos conferem tipo antes de ler, mas
  /// um campo de tipo inesperado ainda pode estourar `TypeError` num lugar que
  /// ninguem previu, e um `TypeError` escaparia do tratamento das telas e
  /// deixaria a conversa girando.
  static T _ler<T>(T Function() ler) {
    try {
      return ler();
    } on TypeError catch (erro) {
      throw FormatException('resposta da conversa fora do contrato: $erro');
    }
  }

  /// O id vem da resposta do servidor: vai codificado, como nas outras rotas.
  static String _caminho(String conversaId) =>
      '/conversations/${Uri.encodeComponent(conversaId)}';
}

/// A recusa que diz **"a foto ainda nao esta pronta"**, e nao "a foto nao
/// serve".
///
/// ## Por que ela e lida pelo SLUG e nao por uma constante do enum
///
/// `ProblemTipo` e conferido contra `x-problem-types` do contrato pelo portao
/// `verificar-conformidade-do-app.mjs`: uma constante nova ali, para um slug
/// que a spec ainda nao declara, reprova por `valor-que-o-contrato-nao-tem`.
/// O lado servidor desta historia esta sendo escrito em paralelo e e ele quem
/// batiza o slug; ate o contrato carrega-lo, a leitura mora aqui, pelo texto
/// da URI.
///
/// **Os tres slugs candidatos sao aceitos de proposito.** Nao e indecisao: os
/// tres significam a mesma coisa para esta tela -- *espere e tente outra vez*
/// --, e errar o nome exato produziria o pior desfecho possivel (a pessoa
/// lendo "nao foi enviada" sobre uma foto que ia subir dois segundos depois).
/// Quando o contrato nomear o slug, esta funcao perde os outros dois e ganha a
/// constante do enum.
///
/// `precondition-required` e `precondition-failed` entram pelo enum porque o
/// contrato JA os declara, e sao a forma generica que a rota usaria se o
/// servidor nao criasse slug proprio.
bool fotoAindaNaoEstaPronta(Problem problem) {
  // `photo-not-ready` e o slug que o servidor batizou (BICHUS-35, 20/10/2026),
  // e ele e o primeiro da lista. Os outros dois ficam porque versao de app nao
  // some do bolso de ninguem: um app publicado com esta funcao continua certo
  // se o slug mudar de nome numa direcao previsivel.
  const List<String> candidatos = <String>[
    'photo-not-ready',
    'upload-not-ready',
    'photo-processing',
  ];
  for (final slug in candidatos) {
    if (problem.tipoUri.endsWith('/$slug')) return true;
  }
  return problem.tipo == ProblemTipo.precondicaoNecessaria ||
      problem.tipo == ProblemTipo.precondicaoFalhou;
}

/// A recusa DEFINITIVA da foto anexada: os bytes nao servem.
///
/// ## Ela e o par de [fotoAindaNaoEstaPronta], e a diferenca e a saida
///
/// `photo-not-ready` e `photo-rejected` saem os dois como **409** da mesma
/// anexacao, e seriam indistinguiveis por status. O que os separa e o que a
/// pessoa faz em seguida: *esperar e tentar de novo com a MESMA foto*, contra
/// *escolher outra*. Juntar os dois num "nao deu" faria metade das pessoas
/// insistir para sempre numa foto que nunca vai passar, e a outra metade
/// desistir de uma que ia passar em dois segundos.
///
/// ## O TEXTO E DO SERVIDOR, e nao redigido aqui
///
/// O `detail` carrega o motivo que o trabalhador de higiene gravou --
/// *"Esse arquivo nao e uma foto que a gente consiga abrir"*, *"Essa foto e
/// uma animacao. Envie uma imagem parada"*, e os outros. Reescrever essas
/// frases no app seria a segunda copia da mesma microcopy, e e a que ninguem
/// atualiza que fica na tela. A tela mostra `Problem.detalhe` quando ele vem, e
/// cai num texto proprio **so quando nao vem**.
///
/// Esta e a unica tela do app que decide por `detail`, e a excecao e nomeada:
/// a regra da casa e decidir pelo `type` e nunca pelo texto do servidor -- e e
/// o que esta funcao faz. O `detail` nao decide nada aqui; ele so e EXIBIDO,
/// depois de o `type` ter decidido.
bool fotoFoiRecusadaPeloServidor(Problem problem) {
  return problem.tipoUri.endsWith('/photo-rejected');
}
