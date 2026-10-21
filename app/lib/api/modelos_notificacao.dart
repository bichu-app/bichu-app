/// Os modelos da CAIXA DE NOTIFICACOES, campo por campo do contrato.
///
/// Regra do cliente (23/09/2026): o app usa exatamente os nomes do
/// `api/openapi.yaml`. Cada classe e cada enum daqui abre o doc com o ponteiro
/// JSON do schema que espelha, e o portao
/// `infra/verificacao/verificar-conformidade-do-app.mjs` confere os dois
/// lados. Por isso toda leitura de resposta mora na propria classe, em
/// `json['campo']`: leitura por outro nome de variavel escaparia do portao.
///
/// ## O que a caixa NAO traz, e nao e esquecimento
///
/// - **Nenhuma imagem.** O contrato declara em dois lugares que a caixa nao
///   devolve avatar nem foto de pet: sao 0 KB de imagem por pagina, para a
///   foto do pet nao chegar a uma quarta superficie. Nao ha campo de imagem
///   nestes modelos, e nao deve haver.
/// - **Nenhum autor.** O autor existe no servidor so para agrupar as linhas, e
///   o app nunca o le (ADR-0010 item 7, ADR-0025).
/// - **O `ref` nao e UUID** (ADR-0010). Ele e opaco, de 20 a 32 caracteres, e
///   serve a UMA coisa: montar o caminho de `markNotificationRead`. Ele nao e
///   texto de tela e nao pode aparecer em rotulo de semantica.
///
/// ## O NUMERO vem do servidor, sempre
///
/// [ContagemDeAvisos] e a unica fonte do numero do sino, e [PaginaDaCaixa]
/// carrega o mesmo numero em `unread_total` para a tela nao pagar uma segunda
/// chamada. Nenhum destes modelos calcula contagem a partir de `read`: duas
/// contas somadas no aparelho divergem entre dois aparelhos da mesma pessoa, e
/// o numero certo e o que o servidor sabe.
library;

/// `#/components/schemas/NotificationKind` do contrato: os dez tipos de aviso.
///
/// A lista e FECHADA no contrato, e o rotulo de cada valor mora aqui porque e
/// a palavra que a pessoa le na linha da caixa -- uma por tipo, escrita uma
/// vez so.
///
/// [desconhecido] e a sentinela desta camada, e o valor de fio dela e vazio de
/// proposito: ela nunca e enviada ao servidor e nao espelha valor nenhum do
/// contrato. Ela existe para o dia em que o servidor ganhar um tipo novo antes
/// deste build: a linha continua aparecendo, com a data e a palavra neutra, em
/// vez de desaparecer da caixa. Linha que o app descarta por nao reconhecer e
/// aviso que ninguem vai saber que existiu.
enum TipoDeAviso {
  plaquinhaLida('tag_scanned', 'Plaquinha lida'),
  petAchado('found_reported', 'Alguém achou um pet'),
  possivelPet('match_suggested', 'Possível pet encontrado'),
  petPerdidoPorPerto('neighborhood_alert', 'Pet perdido por perto'),
  pedidoParaParticipar('event_join_requested', 'Pedido para participar'),
  respostaDoPedidoDeParticipar('event_join_decided', 'Resposta ao seu pedido'),
  encontroCancelado('event_cancelled', 'Encontro cancelado'),
  respostaDaIndicacao('suggestion_decided', 'Resposta à sua indicação'),
  pedidoDaPlaquinha('tag_request_updated', 'Novidade no pedido da plaquinha'),
  comunicado('broadcast', 'Recado do Bichu'),
  desconhecido('', 'Aviso');

  const TipoDeAviso(this.codigo, this.rotulo);

  /// O valor do contrato. Vazio em [desconhecido], que nao e valor de fio.
  final String codigo;

  /// A palavra que a linha da caixa mostra.
  final String rotulo;

  /// O tipo de um codigo do contrato, ou [desconhecido] quando este build nao
  /// conhece o valor.
  ///
  /// Nao devolve nulo, e a diferenca em relacao a `SituacaoDoEncontro` e de
  /// consequencia: la um estado desconhecido faz a tela nao afirmar nada sobre
  /// UM campo; aqui ele faria a linha inteira sumir da caixa.
  static TipoDeAviso porCodigo(Object? codigo) {
    for (final tipo in TipoDeAviso.values) {
      if (tipo.codigo.isNotEmpty && tipo.codigo == codigo) return tipo;
    }
    return TipoDeAviso.desconhecido;
  }
}

/// `#/components/schemas/NotificationDestination` do contrato: para onde o
/// toque na linha leva.
///
/// A lista e FECHADA no contrato, e cada valor tem uma tela que EXISTE. Quem
/// transforma destino em endereco e [PortaDoDestinoDoAviso], ligada em
/// `roteamento/rotas.dart` -- este arquivo nao conhece rota.
///
/// **Nao ha sentinela de desconhecido aqui, e a diferenca em relacao a
/// [TipoDeAviso] e de consequencia.** La um valor novo faria a LINHA INTEIRA
/// desaparecer da caixa, e por isso ela tem [TipoDeAviso.desconhecido]. Aqui um
/// valor que este build nao conhece significa so "nao sei para onde isto leva",
/// e a resposta certa e tratar como SEM DESTINO: a linha aparece, informa, e
/// nao e tocavel. [porCodigo] devolve nulo para isso, e nulo e o mesmo estado
/// de `destination: null` -- um caminho so para os dois.
enum DestinoDoAviso {
  pet('pet'),
  achado('found_report'),
  casoPublico('public_case'),
  encontro('network_event'),
  indicacao('directory_suggestion'),
  pedidoDaPlaquinha('collar_tag_request'),
  comunicado('broadcast');

  const DestinoDoAviso(this.codigo);

  /// O valor do contrato.
  final String codigo;

  /// O destino de um codigo do contrato, ou **nulo** quando o campo vem nulo
  /// ou quando este build nao conhece o valor.
  static DestinoDoAviso? porCodigo(Object? codigo) {
    for (final destino in DestinoDoAviso.values) {
      if (destino.codigo == codigo) return destino;
    }
    return null;
  }
}

/// `#/components/schemas/MyBroadcast` do contrato: o comunicado com o CORPO.
///
/// A caixa carrega so o TITULO do comunicado (em `subject`); o corpo vem desta
/// leitura, que e a razao de a pagina intermediaria existir.
///
/// **Sem quem disparou e sem quantos receberam**: o contrato nao os devolve --
/// o primeiro e conta de painel, e o segundo poria o tamanho da base na tela
/// de uma pessoa.
class ComunicadoDoBichu {
  const ComunicadoDoBichu({
    required this.ref,
    required this.titulo,
    required this.corpo,
    required this.disparadoEm,
  });

  final String ref;
  final String titulo;
  final String corpo;

  /// Quando o comunicado foi disparado. Em UTC.
  final DateTime disparadoEm;

  static ComunicadoDoBichu doJson(Map<String, dynamic> json) {
    final quando = DateTime.tryParse(json['dispatched_at'] as String);
    if (quando == null) {
      throw const FormatException(
        'Um comunicado chegou com `dispatched_at` que nao e data-hora.',
      );
    }
    return ComunicadoDoBichu(
      ref: json['ref'] as String,
      titulo: json['title'] as String,
      corpo: json['body'] as String,
      disparadoEm: quando.toUtc(),
    );
  }
}

/// `#/components/schemas/NotificationItem` do contrato: uma linha da caixa.
///
/// `subject` e anulavel no contrato e e lido como anulavel aqui: aviso que nao
/// tem assunto proprio e estado normal, e a linha entao mostra so o tipo e a
/// data.
class AvisoDaCaixa {
  const AvisoDaCaixa({
    required this.ref,
    required this.tipo,
    required this.assunto,
    required this.aconteceuEm,
    required this.lido,
    required this.agrupados,
    required this.destino,
    required this.destinoRef,
  });

  /// O identificador OPACO do aviso -- o que vai no caminho de
  /// `markNotificationRead`.
  ///
  /// **Nao e texto de tela.** Ele nao aparece em `Text` nem em rotulo de
  /// semantica, e a isca de `test/notificacoes/` reprova se aparecer.
  final String ref;

  final TipoDeAviso tipo;

  /// O nome do pet, o titulo do encontro ou o nome indicado, em texto ja
  /// pronto pelo servidor. Nulo quando o aviso nao tem assunto proprio.
  final String? assunto;

  /// Quando o FATO aconteceu, e nao quando a linha nasceu. Em UTC.
  final DateTime aconteceuEm;

  /// O item foi ABERTO. Ver a lista nao marca nada: abrir a caixa zera o
  /// contador e deixa isto em `false`.
  final bool lido;

  /// Quantos avisos esta linha resume. `1` quando ela e um aviso so, e sempre
  /// `1` em [TipoDeAviso.plaquinhaLida] e [TipoDeAviso.petAchado], que nunca
  /// agrupam porque cada um e um animal e uma acao distintos.
  final int agrupados;

  /// Para onde o toque leva, ou **nulo quando esta linha nao tem destino**.
  ///
  /// Nulo e estado NORMAL: `match_suggested` nao tem tela neste app, um destino
  /// pode ter deixado de existir (pet excluido), e um valor novo do servidor
  /// tambem cai aqui. Nos tres casos a linha aparece e **nao e tocavel**.
  final DestinoDoAviso? destino;

  /// A chave do destino. Nula quando [destino] e nulo.
  ///
  /// **Nao e texto de tela**, como o [ref]: ela monta endereco e nada mais.
  final String? destinoRef;

  /// A linha resume mais de um aviso, e por isso a tela diz quantos.
  bool get resumeVarios => agrupados > 1;

  /// **Esta linha leva a algum lugar?**
  ///
  /// Exige os DOIS campos. O contrato promete que eles andam juntos, e esta
  /// conjuncao e o que faz a promessa nao virar `/pets/null` se um dia ela for
  /// quebrada -- a mesma licao de `ligarPortaDoPerfilDoParticipante`, que
  /// recusa apelido nulo em vez de abrir `/pessoa/null`.
  bool get temDestino =>
      destino != null && destinoRef != null && destinoRef!.isNotEmpty;

  /// `18/10/2026 às 13h52`, no fuso de quem le.
  ///
  /// `toLocal()` porque `occurred_at` chega em UTC e quem le esta num fuso --
  /// a mesma razao de `AvaliacaoDoLocal.dataEmTexto`. A hora entra junto com a
  /// data, e nao e enfeite: dois dos tipos dizem que ha um pet na rua agora, e
  /// "hoje" sem hora nao ajuda ninguem a sair de casa.
  ///
  /// Sem `intl`: o pacote nao esta no `pubspec`, e uma dependencia nova por
  /// uma linha de texto e custo que esta tela nao pede.
  String get dataEmTexto {
    final quando = aconteceuEm.toLocal();
    final dia = quando.day.toString().padLeft(2, '0');
    final mes = quando.month.toString().padLeft(2, '0');
    final minuto = quando.minute.toString().padLeft(2, '0');
    return '$dia/$mes/${quando.year} às ${quando.hour}h$minuto';
  }

  /// A mesma linha com [lido] trocado.
  ///
  /// Serve ao toque e ao `Marcar todas como lidas`: o servidor respondeu `204`
  /// para AQUELE item, e a tela guarda o que ele confirmou. **Isto nao e
  /// contagem**: o numero do sino continua saindo de `getNotificationCount`, e
  /// nada aqui o deduz.
  AvisoDaCaixa comoLido() => AvisoDaCaixa(
        ref: ref,
        tipo: tipo,
        assunto: assunto,
        aconteceuEm: aconteceuEm,
        lido: true,
        agrupados: agrupados,
        destino: destino,
        destinoRef: destinoRef,
      );

  static AvisoDaCaixa doJson(Map<String, dynamic> json) {
    final ref = json['ref'] as String;
    if (ref.isEmpty) {
      throw const FormatException(
        'Um aviso chegou sem `ref`. O contrato declara o campo como '
        'obrigatorio, e sem ele nao ha como marcar o item como lido.',
      );
    }
    final quando = DateTime.tryParse(json['occurred_at'] as String);
    if (quando == null) {
      throw const FormatException(
        'Um aviso chegou com `occurred_at` que nao e data-hora.',
      );
    }
    return AvisoDaCaixa(
      ref: ref,
      tipo: TipoDeAviso.porCodigo(json['kind']),
      assunto: json['subject'] as String?,
      aconteceuEm: quando.toUtc(),
      lido: json['read'] as bool,
      agrupados: json['grouped_count'] as int,
      destino: DestinoDoAviso.porCodigo(json['destination']),
      // Lido como anulavel: o contrato declara os dois como `nullable`, e
      // `as String` cru estouraria `_TypeError` -- que nao e `Exception` e
      // escaparia do `catch` de quem chama, como `ContagemDeAvisos` ja ensinou
      // neste mesmo arquivo.
      destinoRef: json['destination_ref'] as String?,
    );
  }
}

/// `#/components/schemas/NotificationPage` do contrato: uma pagina da caixa.
///
/// A ordem e a do servidor -- decrescente de quando a coisa aconteceu -- e
/// esta classe **nao reordena nada**. Ordenar aqui seria a segunda definicao
/// de "mais recente", e ela discordaria da primeira no dia em que o relogio do
/// aparelho estivesse errado.
class PaginaDaCaixa {
  const PaginaDaCaixa({
    required this.itens,
    required this.pagina,
    required this.tamanho,
    required this.total,
    required this.naoLidos,
  });

  final List<AvisoDaCaixa> itens;
  final int pagina;
  final int tamanho;

  /// Quantas LINHAS ja agrupadas a caixa tem no servidor, e nao quantos
  /// avisos: e ele que alimenta o `RodapeDaPaginacao`.
  final int total;

  /// O mesmo numero de `getNotificationCount`, que vem junto para a tela nao
  /// precisar de uma segunda chamada. Conta AVISOS nao abertos, nao linhas.
  final int naoLidos;

  static PaginaDaCaixa doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    if (itens is! List) {
      throw const FormatException('pagina da caixa sem `items`');
    }
    return PaginaDaCaixa(
      itens: itens
          .whereType<Map<String, dynamic>>()
          .map(AvisoDaCaixa.doJson)
          .toList(growable: false),
      pagina: json['page'] as int,
      tamanho: json['limit'] as int,
      total: json['total'] as int,
      naoLidos: json['unread_total'] as int,
    );
  }
}

/// `#/components/schemas/NotificationCount` do contrato: o numero do sino.
///
/// Inteiro, sem recorte. O `9+` e regra da barra de topo e nao deste modelo:
/// recortar aqui apagaria a diferenca entre 10 e 400 para quem for medir uso
/// depois.
class ContagemDeAvisos {
  const ContagemDeAvisos({required this.naoLidos});

  final int naoLidos;

  /// **`FormatException`, e nao `TypeError`, quando o corpo nao bate** -- e a
  /// diferenca e o que separa "nao consegui ler" de um app que cai.
  ///
  /// O `as int` cru que estava aqui estourava `_TypeError` num corpo `200` sem
  /// `unread_total`, e `_TypeError` nao e `Exception`: quem chama trata
  /// `FalhaDeChamada` e `FormatException` -- como [PaginaDaCaixa.doJson] ja
  /// ensinava neste mesmo arquivo --, entao o erro escapava do `catch` e subia
  /// pelo `await`. Medido: o arranque de 55 casos da suite reprovou assim,
  /// quando o contador do sino passou a chamar esta rota no arranque e os
  /// servidores de mentira responderam `200` sem o campo.
  ///
  /// Em producao o preco e o mesmo e pior: um deploy que mudasse este campo
  /// derrubaria o ARRANQUE do app -- por causa do numero de um distintivo.
  static ContagemDeAvisos doJson(Map<String, dynamic> json) {
    final naoLidos = json['unread_total'];
    if (naoLidos is! int) {
      throw const FormatException('contagem de avisos sem `unread_total`');
    }
    return ContagemDeAvisos(naoLidos: naoLidos);
  }
}
