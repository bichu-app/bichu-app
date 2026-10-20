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

  /// A linha resume mais de um aviso, e por isso a tela diz quantos.
  bool get resumeVarios => agrupados > 1;

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

  static ContagemDeAvisos doJson(Map<String, dynamic> json) =>
      ContagemDeAvisos(naoLidos: json['unread_total'] as int);
}
