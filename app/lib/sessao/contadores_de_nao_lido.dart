import 'package:flutter/foundation.dart';

import '../api/conversas_api.dart';
import '../dispositivo/distintivo_do_aplicativo.dart';

/// O OBJETO DE CONTAGEM que a barra de baixo lia e nao existia.
///
/// Pedido do cliente (20/10/2026), literal: *"quando o usuário receber uma
/// nova mensagem, o icone do auau vai ficar de outra cor com o +1, +2
/// dependendo a quantidade de mensagens não lida"*.
///
/// `SinoDeNotificacoes` em `casca_com_abas.dart` ja dizia por escrito o que
/// faltava: *"falta um objeto de contagem unico no app (no `Escopo`, como as
/// outras camadas), que chame [...] e notifique. Ele precisa de politica de
/// atualizacao -- quando buscar"*. Isto e esse objeto, e a politica esta
/// escrita abaixo porque ela e a parte que custa.
///
/// ## UMA aba tem fonte, e quatro NAO tem. A assimetria e medida.
///
/// O cliente pediu contador em cinco abas. Medido em 20/10/2026 nesta arvore e
/// em `https://hml.bichu.app`, so **`AuAu`** tem de onde contar:
///
/// | Aba | O que ele pediu | Fonte medida |
/// |---|---|---|
/// | `AuAu` | mensagem nova | **EXISTE**: `unread_count` de `GET /v1/conversations`, da conta inteira, e `conversation_list_views.seen_at` para zerar |
/// | `Pets` | pet novo na regiao | **NAO EXISTE**: a tabela `pets` nao tem coluna de cidade nenhuma, e nao ha marcador de "ja vi" |
/// | `Rede` | evento novo, profissional novo | **NAO EXISTE marcador de "ja vi"**: `network_events` e `professionals` tem `created_at` e `city`, e nenhuma das duas listagens aceita recorte por instante nem guarda o que a pessoa viu |
/// | `Mural` | publicacao de quem ele segue | **NAO EXISTE NADA**: nao ha tabela de publicacao, nao ha tabela de seguir e nao ha rota de linha do tempo |
/// | `Loja` | -- | ele nao pediu |
///
/// **E por isso que este objeto nao tem cinco campos.** Um campo por aba, com
/// quatro deles sempre nulos, convidaria a proxima pessoa a preenche-los
/// contando no aparelho -- que e a adivinhacao que
/// `modelos_conversa.dart` proibe por escrito, e que divergiria entre dois
/// aparelhos da mesma pessoa. O que falta por aba esta na tabela acima e no
/// relatorio da historia, nao num campo inerte.
///
/// ## A POLITICA DE ATUALIZACAO, e o custo dela em requisicoes
///
/// Sem push nao ha empurrao: a unica opcao e perguntar. As tres fontes de
/// atualizacao, e nenhuma delas e um relogio:
///
/// 1. **Abertura do app** -- uma chamada de [atualizar].
/// 2. **Volta do segundo plano** -- uma chamada por retomada. Quem monta o
///    gancho de ciclo de vida e `app.dart`.
/// 3. **A propria area de mensagens** -- `AreaDeMensagens` publica
///    `unread_count` por `aoContarNaoLidas` a cada carga da lista, e
///    [definir] e quem recebe. **Custo zero**: a resposta que a tela ja pediu
///    traz o numero.
/// 4. **Depois de a area ser VISTA** -- [marcarMensagensVistas], uma chamada.
///    Ela nao e zero local, e o motivo (o aviso de plaquinha lida, que NAO sai
///    do contador ao abrir a lista) esta escrito la.
///
/// **NAO HA INTERVALO, e a ausencia e decisao.** Um laco de 60 s gastaria 60
/// requisicoes por hora por conta para uma conta que, na maior parte das
/// horas, nao tem mensagem nova; e o numero so mudaria na tela de quem esta
/// com o app aberto parado, que e o caso mais raro. O preco de nao ter o laco
/// esta dito em voz alta: **com o app aberto em outra aba, o numero so muda na
/// proxima retomada ou na proxima visita a `AuAu`.** Instagram e LinkedIn
/// resolvem isso por push, e o push deste produto nao sai (ver
/// [DistintivoDoAplicativo]).
///
/// **O custo medido, em requisicoes por sessao:** 1 na abertura + 1 por
/// retomada + 1 por visita a area de mensagens (a da lista e da tela, e sairia
/// de qualquer jeito). Uma sessao com tres retomadas e duas visitas gasta
/// **6**. O laco de 60 s gastaria 20 numa sessao de 20 minutos, sem resolver
/// nada que estas quatro fontes nao resolvam.
///
/// **Nenhum teto e tocado.** Medido no contrato em 20/10/2026:
/// `listConversations` e `getNotificationCount` **nao declaram `x-rate-limit`
/// nenhum**, e `aplicacao-de-teto.ts` le `rota.rateLimit ?? []` -- rota sem
/// teto declarado nao tem teto. O teto de 600/h por `ip` que existe e de
/// `getAppVersionStatus`, que este objeto nao chama. O vizinho mais apertado
/// que ele encosta e `markMyConversationsSeen`, 240/h por conta, e quem o
/// chama e a tela de mensagens -- uma vez por abertura da area, nao por
/// atualizacao de contador.
///
/// ## O numero PEDE a conta, e nao o contrario
///
/// [atualizar] pede `limite: 1`. O que interessa e o `unread_count` do
/// envelope, que e **da conta inteira** e nao da pagina: ele sai de
/// `contarParaOSino` no servidor, com a autorizacao no `WHERE` e nao em
/// filtro de memoria. Pedir 10 conversas para ler um inteiro seria pagar nove
/// linhas de lista por nada.
class ContadoresDeNaoLido extends ChangeNotifier {
  /// A porta de conversas entra POSICIONAL, como `PetsApi(api)` e as outras
  /// camadas de API deste app; o caminho do icone do aplicativo entra nomeado
  /// porque e opcional e tem padrao.
  ContadoresDeNaoLido(this._conversas, {DistintivoDoAplicativo? distintivo})
      // O padrao e o INERTE, e e o valor correto de hoje. Ver
      // `distintivo_do_aplicativo.dart`.
      : _distintivo = distintivo ?? const DistintivoInerte();

  final ConversasApi _conversas;
  final DistintivoDoAplicativo _distintivo;

  int? _mensagens;

  /// Quantas mensagens nao lidas a CONTA tem, ou **nulo**.
  ///
  /// **Nulo nao e zero, e a diferenca e a regra inteira desta classe.** Nulo e
  /// "ninguem contou ainda" -- app recem-aberto, conta ausente, chamada que
  /// falhou -- e a aba nao pinta distintivo nenhum. Zero e a afirmacao de que
  /// nao ha mensagem nova, e so o servidor pode fazer essa afirmacao.
  ///
  /// Um `0` pintado e pior que nada: ele chama o olho para dizer que nao ha
  /// motivo para olhar. E um `0` inventado numa falha de rede e pior ainda --
  /// ele afirma, para quem tem 12 recados, que nao ha nenhum.
  int? get mensagens => _mensagens;

  /// O ultimo numero que o caminho do icone do aplicativo recebeu, e o que
  /// aconteceu com ele. Nulo antes da primeira tentativa.
  ///
  /// Guardado para o portao poder cobrar que o caminho **existe e e exercido**
  /// sem que ele acenda nada. Ver [DistintivoDoAplicativo].
  ResultadoDoDistintivo? get ultimoDistintivoDoApp => _ultimoDistintivo;
  ResultadoDoDistintivo? _ultimoDistintivo;

  /// Pergunta ao servidor. Falha **nao** zera: ela deixa como estava.
  ///
  /// A falha e engolida de proposito, e e a mesma razao de
  /// `ConversasApi.marcarListaVista`: isto nao e dado que a pessoa pediu, e
  /// uma faixa de erro em cima da tela por causa de um contador seria um erro
  /// sobre uma operacao que ninguem executou. O que **nao** acontece na falha
  /// e o que importa: o numero nao vira zero, e um numero velho continua
  /// sendo mais verdadeiro que um zero inventado.
  Future<void> atualizar() async {
    try {
      final pagina = await _conversas.listar(limite: 1);
      definir(pagina.unreadCount);
    } on Object {
      // Ver o doc acima. Nao relanca, e NAO mexe em `_mensagens`.
    }
  }

  /// Recebe o numero que o servidor mandou. E a porta de `aoContarNaoLidas`.
  void definir(int naoLidas) {
    final valor = naoLidas < 0 ? 0 : naoLidas;
    _anunciarAoAplicativo(valor);
    if (_mensagens == valor) return;
    _mensagens = valor;
    notifyListeners();
  }

  /// A area de mensagens foi vista: **pergunta o numero de novo ao servidor.**
  ///
  /// ## POR QUE ISTO NAO E `definir(0)`, e a diferenca nao e de estilo
  ///
  /// A primeira versao deste metodo zerava o numero localmente, e estava
  /// ERRADA. Medido na consulta do servidor
  /// (`kysely-conversation-repository.ts`, `contarParaOSino`): ver a lista
  /// **nao** tira tudo do contador. Ha uma excecao nomeada no `WHERE`:
  ///
  /// ```sql
  /// AND (msg.system_kind IN ('scan_notice', 'found_notice')
  ///      OR vista.seen_at IS NULL
  ///      OR msg.created_at > vista.seen_at)
  /// ```
  ///
  /// **O aviso de plaquinha lida e o de achado CONTINUAM contando depois de a
  /// lista ser vista**, e saem so quando a conversa deles e aberta. O proprio
  /// servidor diz por que: *"Eles sao a coisa mais importante que o produto tem
  /// para dizer -- alguem esta com o animal na mao agora"*.
  ///
  /// Quer dizer que um zero local **apagaria da barra exatamente esse aviso**,
  /// e o app nao tem como evitar isso por conta propria: `system_kind` nao sai
  /// na resposta de `GET /v1/conversations`, de proposito -- *"o app nao sabe
  /// quais sao, e nao precisa saber"*, esta escrito em `ConversasApi`. Nao
  /// existe calculo local honesto.
  ///
  /// Entao quem decide o numero depois da visita e o SERVIDOR, e este metodo
  /// so pergunta.
  ///
  /// ## O CUSTO: uma requisicao por visita a area, e ela se paga
  ///
  /// Medido: a abertura do app gasta 1 pedido de `GET /v1/conversations`;
  /// visitar a area gasta 1 da propria lista (que ela pediria de qualquer
  /// jeito) + 1 deste metodo. Uma sessao com tres retomadas e duas visitas a
  /// area gasta **1 + 3 + 2 = 6** pedidos de contador. Nenhum teto e tocado:
  /// `listConversations` nao declara `x-rate-limit` nenhum no contrato.
  ///
  /// **E a pessoa nao ve atraso nenhum.** A aba `AuAu` tem `ehRamo: false`: ela
  /// empurra a rota e a tela COBRE a barra de baixo. Enquanto a resposta volta,
  /// a barra nao esta na tela -- quando a pessoa voltar, o numero certo ja
  /// chegou.
  ///
  /// **Falha deixa como estava** (a razao esta em [atualizar]): o numero velho
  /// continua, e nao um zero inventado. Nesta rota isso e o lado seguro duas
  /// vezes -- um zero por falha de rede apagaria o aviso de plaquinha lida.
  ///
  /// **Nao chama `POST /v1/me/conversations-seen`.** Quem chama e
  /// `AreaDeMensagens`, no mesmo gesto, porque e ela que sabe que a lista
  /// chegou na tela -- e este metodo dispara DEPOIS dela, por `aoVerAArea`.
  /// Perguntar antes traria o numero de antes.
  Future<void> marcarMensagensVistas() => atualizar();

  /// Volta ao estado "ninguem contou ainda". E o que o `sair()` precisa.
  ///
  /// Zero seria errado aqui: ele afirmaria que a conta que acabou de sair nao
  /// tinha mensagem, e a aba pintaria essa afirmacao para quem nem conta tem.
  void esquecer() {
    _ultimoDistintivo = null;
    if (_mensagens == null) return;
    _mensagens = null;
    notifyListeners();
  }

  void _anunciarAoAplicativo(int valor) {
    _ultimoDistintivo = _distintivo.definir(valor);
  }
}
