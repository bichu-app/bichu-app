import 'package:flutter/foundation.dart';

import '../api/contadores_api.dart';
import '../api/conversas_api.dart';
import '../dispositivo/distintivo_do_aplicativo.dart';
import 'cidade_escolhida.dart';

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
/// | `Pets` | pet novo na regiao | **EXISTE desde 20/10/2026**: `lost_pets_new` de `GET /v1/me/section-counters`, no MESMO recorte de `listPublicLostPets` -- que e o corpo da aba. A tabela `pets` continua sem coluna de cidade, e e por isso que a fonte NAO e ela: ver `contadores_api.dart` |
/// | `Rede` | evento novo, profissional novo | **EXISTEM desde 20/10/2026**: `network_events_new` e `network_directory_new` da mesma rota. O selo da aba e a SOMA das duas, e os marcadores de "ja vi" sao SEPARADOS (`section_list_views`) |
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
  ContadoresDeNaoLido(
    this._conversas, {
    required ContadoresApi secoes,
    required CidadeEscolhida cidade,
    DistintivoDoAplicativo? distintivo,
  })  // `_secoes` e `_cidade` nao podem ser formais (`this._secoes`): parametro
      // nomeado exige nome publico, e os dois PRECISAM ser nomeados -- a porta
      // de conversas e a posicional, como `PetsApi(api)` e as outras camadas.
      // ignore: prefer_initializing_formals
      : _secoes = secoes,
        // ignore: prefer_initializing_formals
        _cidade = cidade,
        // O padrao do distintivo e o INERTE, e e o valor correto de hoje. Ver
        // `distintivo_do_aplicativo.dart`.
        _distintivo = distintivo ?? const DistintivoInerte();


  final ConversasApi _conversas;

  /// A porta das TRES contagens novas. **Exigida e nao opcional**, e a escolha
  /// e sobre que defeito e possivel: uma porta opcional com padrao nulo faria
  /// um esquecimento de fiacao desligar os tres contadores **em silencio** --
  /// que e, letra por letra, o defeito que custou o contador de mensagens
  /// inteiro em 20/10/2026 (uma chamada de `registrarRota` que faltava, e
  /// nenhum portao olhando). Exigida, o esquecimento nao compila.
  final ContadoresApi _secoes;

  /// De onde sai a cidade do contador de `Pets`: o MESMO deposito que
  /// `lista_de_perdidos.dart` grava a cada carga. A razao de nao ser
  /// `Me.reference_area.city` esta em `contadores_api.dart` (3 de 47 contas a
  /// tem).
  final CidadeEscolhida _cidade;

  final DistintivoDoAplicativo _distintivo;

  int? _mensagens;
  ContadoresDeSecao? _secoesContadas;

  /// A ultima cidade LIDA do deposito, ou nulo enquanto ninguem leu.
  ///
  /// ## POR QUE ELA E GUARDADA, E POR QUE A LEITURA NUNCA E AGUARDADA
  ///
  /// `CidadeEscolhida` le `getApplicationDocumentsDirectory()`, que e **canal
  /// de plataforma**. Em teste de widget, em aparelho com armazenamento
  /// bloqueado, em perfil restrito e no primeiro arranque de um build sem o
  /// plugin registrado, o canal **nao tem tratador -- e canal sem tratador nao
  /// estoura: ele simplesmente nunca responde.** Um `await` dele aqui pendura o
  /// contador para sempre, e nao com erro: em silencio.
  ///
  /// **Isto nao e teoria.** `lista_de_perdidos.dart` ja carrega a regra por
  /// escrito -- a cidade guardada *"chega sem a tela esperar"*, porque
  /// aguarda-la antes da primeira carga *"travaria a seção em que o aplicativo
  /// ABRE"* --, e eu reaprendi medindo: a primeira versao deste arquivo dava
  /// `await _cidade.ler()` dentro de [atualizar], e **doze casos de outras
  /// frentes reprovaram** (cadastro, login e re-registro de aparelho), porque o
  /// `aoEntrar` nunca voltava.
  ///
  /// Entao a leitura e disparada SEM espera e o pedido sai com o que ja se
  /// sabe. **O preco, dito em voz alta:** o PRIMEIRO pedido de contagem depois
  /// de o app abrir sai sem cidade -- geografia aberta, os casos do pais
  /// inteiro --, e o segundo (retomada, ou a volta de uma visita a `Pets`) ja
  /// leva a cidade. E a mesma troca que a lista faz, pela mesma razao.
  String? _cidadeConhecida;
  bool _pediuACidade = false;

  /// Se o objeto ja foi descartado. Ver [dispose] e as tres guardas.
  bool _descartado = false;

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

  /// Quantos casos de perdido NOVOS ha no recorte da aba `Pets`, ou **nulo**.
  ///
  /// Nulo e "ninguem contou ainda", e a aba nao pinta nada. **Nao e "pet
  /// cadastrado novo"**, e a razao esta em `contadores_api.dart`: nao existe
  /// superficie que liste pet cadastrado de terceiro por regiao, e um numero
  /// sobre `pets` seria um numero sem lista.
  int? get perdidos => _secoesContadas?.perdidosNovos;

  /// O numero do selo da aba `Rede`: a SOMA das duas sub-abas, ou **nulo**.
  ///
  /// **Soma porque a barra tem um selo por aba**, e nao porque as duas coisas
  /// sejam a mesma. Quem diz o que o numero junta e o rotulo acessivel, em
  /// `DestinoDeNavegacao.nomeAcessivelCom` -- e por isso o substantivo da
  /// `Rede` nomeia as duas parcelas.
  ///
  /// O marcador de "ja vi" e **separado por sub-aba**, entao este numero desce
  /// em dois passos: ver `Eventos` derruba [eventos] e o resto fica ate
  /// `Comunidade` ser vista.
  int? get rede => _secoesContadas?.redeNova;

  /// A parcela de eventos da `Rede`. Exposta para o portao poder cobrar que a
  /// soma e a soma, e nao um dos dois numeros com outro nome.
  int? get eventos => _secoesContadas?.eventosNovos;

  /// A parcela do diretorio da `Rede`.
  int? get profissionais => _secoesContadas?.profissionaisNovos;

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
    // AS DUAS PERGUNTAS EM PARALELO, e nao uma depois da outra: sao dois
    // pedidos independentes e serializa-los dobraria a espera do primeiro
    // desenho da barra sem economizar pedido nenhum.
    //
    // **Uma falha nao derruba a outra.** Cada ramo engole a propria falha, e
    // por isso `Future.wait` aqui nao e risco: nenhum dos dois relanca.
    await Future.wait<void>(<Future<void>>[
      _contarMensagens(),
      atualizarSecoes(),
    ]);
  }

  Future<void> _contarMensagens() async {
    try {
      final pagina = await _conversas.listar(limite: 1);
      definir(pagina.unreadCount);
    } on Object {
      // Ver o doc acima. Nao relanca, e NAO mexe em `_mensagens`.
    }
  }

  /// Pergunta as TRES contagens de secao. Falha **nao** zera.
  ///
  /// A cidade sai do deposito do aparelho, e a leitura dele **nunca estoura**:
  /// `CidadeEscolhida` engole falha das duas pontas e devolve nulo (ela e canal
  /// de plataforma, e em aparelho com armazenamento bloqueado ou em teste de
  /// widget ela falha -- o que e normal). Nulo ali e geografia aberta, que e o
  /// mesmo recorte com que a lista abre nessa situacao.
  Future<void> atualizarSecoes() async {
    try {
      _lerACidadeSemEsperar();
      final contagem = await _secoes.contar(cidade: _cidadeConhecida);
      // **Nulo NAO zera**, e e o mesmo motivo de `_contarMensagens`: a falha
      // deixa o numero velho, que e mais verdadeiro que um zero inventado.
      if (contagem == null) return;
      _definirSecoes(contagem);
    } on Object {
      // Nao relanca. `ContadoresApi` ja engole `FalhaDeChamada` e
      // `FormatException`; este `catch` cobre o que vier do deposito.
    }
  }

  /// A area foi VISTA: **o servidor devolve os numeros novos no mesmo pedido.**
  ///
  /// Uma viagem, e nao duas. O contador de mensagens paga duas (uma para
  /// `markMyConversationsSeen` e outra para recontar) porque lá a resposta e
  /// 204 -- e lá ela tem de ser, porque o aviso de plaquinha lida ATRAVESSA o
  /// zero e um numero devolvido ali faria a tela acreditar no que acabou de
  /// zerar. **Nenhuma destas tres areas tem excecao parecida** (medido), entao
  /// a rota devolve 200 com os contadores recalculados DEPOIS da escrita, e o
  /// app continua sem adivinhar nada: quem decide o numero e o servidor.
  ///
  /// **Nao e `_definirSecoes(zero)`.** Zerar local seria a adivinhacao que a
  /// primeira versao de [marcarMensagensVistas] cometeu e que a medicao do
  /// `WHERE` do servidor desmentiu.
  Future<void> marcarSecaoVista(SecaoComContador secao) async {
    try {
      _lerACidadeSemEsperar();
      final contagem = await _secoes.marcarVista(secao, cidade: _cidadeConhecida);
      if (contagem == null) return;
      _definirSecoes(contagem);
    } on Object {
      // Ver o doc acima. O selo fica aceso e a proxima entrada tenta de novo,
      // que e o pior desfecho possivel -- e e aceitavel.
    }
  }

  /// Pede a cidade ao deposito **uma vez**, e nao espera a resposta.
  ///
  /// Uma vez por instancia: o deposito e do aparelho e a cidade so muda quando
  /// a lista de perdidos grava outra -- e quando ela grava, o proximo arranque
  /// le. Reler a cada atualizacao gastaria um canal de plataforma por retomada
  /// para um valor que quase nunca muda.
  ///
  /// `ler()` engole falha das duas pontas e devolve nulo, entao o `catchError`
  /// aqui e cinto e suspensorio -- e ele existe porque um `Future` sem
  /// tratador de erro em caminho nao aguardado derruba a zona do teste, e nao
  /// este metodo.
  void _lerACidadeSemEsperar() {
    if (_pediuACidade) return;
    _pediuACidade = true;
    _cidade.ler().then((cidade) {
      if (cidade == null || cidade.trim().isEmpty) return;
      _cidadeConhecida = cidade.trim();
    }).catchError((Object _) => null);
  }

  /// O DESCARTE, e as tres guardas que ele liga.
  ///
  /// ## Por que o descarte tem de existir: ele NAO existia
  ///
  /// Este objeto entrou no `Escopo`, em `limpezasAoSair`, em `aoEntrar`, no
  /// arranque e na retomada -- e **nenhum `dispose()` o chamava**, enquanto os
  /// cinco irmaos dele estavam todos no `dispose()` de `_BichuAppState`. A
  /// isca que cobra a linha de la esta em
  /// `test/sessao/descartes_no_dispose_test.dart`.
  ///
  /// ## Por que a guarda vem JUNTO, e o que foi medido em 20/10/2026
  ///
  /// O app pergunta o numero no arranque e em toda retomada, e nenhuma das
  /// duas chamadas e aguardada (`unawaited`). Uma resposta pode chegar **com o
  /// objeto ja descartado** -- em producao no `dispose` do app, e em teste de
  /// widget a cada `pumpWidget`, que descarta o app anterior e deixa a
  /// resposta dele a caminho. Medido neste worktree que isso de fato acontece:
  /// a resposta de `GET /v1/conversations` chega depois do descarte.
  ///
  /// `ChangeNotifier` estoura `A ContadoresDeNaoLido was used after being
  /// disposed` em `notifyListeners` depois do descarte. **E aqui esse erro NAO
  /// aparece em lugar nenhum**, que e o que torna a guarda necessaria e nao
  /// decorativa. Os tres caminhos que publicam estao, hoje, cada um dentro de
  /// um `catch` largo escrito para OUTRA coisa:
  ///
  /// | Caminho | Quem engole |
  /// |---|---|
  /// | [definir], por `_contarMensagens` | o `on Object` de `_contarMensagens`, que existe para "falha de rede nao zera" |
  /// | [_definirSecoes], por [atualizarSecoes] e [marcarSecaoVista] | o `on Object` dos dois, pela mesma razao |
  /// | [esquecer], por `limpezasAoSair` | o `on Object catch` de `_apagarTudoDestaConta`, que isola uma limpeza das outras |
  ///
  /// Medido sem a guarda: `atualizar()` sobre um objeto descartado **nao
  /// reprova nada** e deixa o objeto PELA METADE -- `_mensagens` virou `7` e
  /// ninguem foi notificado, porque o erro saiu entre as duas linhas. Pior:
  /// `definir` anuncia ao icone do aplicativo ANTES de notificar, entao um
  /// contador descartado chega a escrever no distintivo de um app que nao esta
  /// mais na arvore. Hoje o distintivo e [DistintivoInerte] e nada acende --
  /// mas o ponto de injecao existe exatamente para o dia em que acender.
  ///
  /// A guarda troca tres erros engolidos por tres saidas limpas. A isca dela
  /// olha o EFEITO: depois do descarte, a resposta em voo nao mexe no numero e
  /// **nao chega ao caminho do icone**.
  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _definirSecoes(ContadoresDeSecao contagem) {
    // A GUARDA DE DESCARTE. Ver [dispose].
    if (_descartado) return;
    final anterior = _secoesContadas;
    if (anterior != null &&
        anterior.perdidosNovos == contagem.perdidosNovos &&
        anterior.eventosNovos == contagem.eventosNovos &&
        anterior.profissionaisNovos == contagem.profissionaisNovos) {
      return;
    }
    _secoesContadas = contagem;
    notifyListeners();
  }

  /// Recebe o numero que o servidor mandou. E a porta de `aoContarNaoLidas`.
  void definir(int naoLidas) {
    // A GUARDA DE DESCARTE, e ela vem ANTES de `_anunciarAoAplicativo`: um
    // contador descartado nao escreve no icone do aplicativo. Ver [dispose].
    if (_descartado) return;
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
    // A GUARDA DE DESCARTE. Um `sair()` em curso quando o app sai da arvore
    // chega aqui, e o erro seria engolido pelo `catch` por limpeza de
    // `_apagarTudoDestaConta`. Ver [dispose].
    if (_descartado) return;
    _ultimoDistintivo = null;
    // AS TRES CONTAGENS DE SECAO SAEM JUNTO, e esquecer de limpa-las seria o
    // defeito visivel: quem sai da conta continuaria vendo o selo de `Pets` e
    // de `Rede` com o numero da conta anterior, numa barra que o app desenha
    // tambem deslogado.
    final tinhaSecoes = _secoesContadas != null;
    _secoesContadas = null;
    if (_mensagens == null) {
      if (tinhaSecoes) notifyListeners();
      return;
    }
    _mensagens = null;
    notifyListeners();
  }

  void _anunciarAoAplicativo(int valor) {
    _ultimoDistintivo = _distintivo.definir(valor);
  }
}
