/// Os modelos da conversa mediada, campo por campo do contrato.
library;

import 'problem.dart';

/// `#/components/schemas/Conversation/properties/status` do contrato.
enum EstadoDaConversa {
  aberta('open'),
  bloqueada('blocked'),
  encerrada('closed');

  const EstadoDaConversa(this.codigo);

  final String codigo;

  /// So `aberta` aceita mensagem nova.
  bool get aceitaMensagem => this == EstadoDaConversa.aberta;

  static EstadoDaConversa? porCodigo(Object? codigo) {
    for (final e in EstadoDaConversa.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/components/schemas/Message/properties/sender_role` do contrato.
enum PapelNaConversa {
  tutor('tutor'),
  achador('finder'),
  sistema('system');

  const PapelNaConversa(this.codigo);

  final String codigo;

  static PapelNaConversa? porCodigo(Object? codigo) {
    for (final p in PapelNaConversa.values) {
      if (p.codigo == codigo) return p;
    }
    return null;
  }
}

/// `#/components/schemas/Message/properties/redactions/items/properties/kind`
/// do contrato.
enum TipoDeRedacao {
  telefone('phone'),
  email('email'),
  endereco('address'),
  linkExterno('external_link');

  const TipoDeRedacao(this.codigo);

  final String codigo;

  static TipoDeRedacao? porCodigo(Object? codigo) {
    for (final t in TipoDeRedacao.values) {
      if (t.codigo == codigo) return t;
    }
    return null;
  }
}

/// `#/components/schemas/Conversation/properties/participants/items`.
class ParticipanteDaConversa {
  const ParticipanteDaConversa({
    required this.role,
    required this.displayName,
    this.handle,
    this.photoIconUrl,
  });

  final PapelNaConversa role;

  /// Primeiro nome ou apelido, **ou o rotulo neutro**.
  final String displayName;

  /// A marca neutra: a primeira letra, em caixa alta.
  String get marcaNeutra {
    final limpo = displayName.trim();
    if (limpo.isEmpty) return '';
    return limpo.substring(0, 1).toUpperCase();
  }

  /// `#/components/schemas/Conversation/properties/participants/items/properties/handle`
  final String? handle;

  /// `#/components/schemas/Conversation/properties/participants/items/properties/photo_icon_url`
  final String? photoIconUrl;

  static ParticipanteDaConversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final papel = PapelNaConversa.porCodigo(bruto['role']);
    if (papel == null) return null;
    final nome = bruto['display_name'];
    if (nome is! String) return null;
    final apelido = bruto['handle'];
    final foto = bruto['photo_icon_url'];
    return ParticipanteDaConversa(
      role: papel,
      displayName: nome,
      handle: apelido is String && apelido.isNotEmpty ? apelido : null,
      photoIconUrl: foto is String && foto.isNotEmpty ? foto : null,
    );
  }
}

/// `#/components/schemas/Message/properties/redactions/items`.
class RedacaoDaMensagem {
  const RedacaoDaMensagem({required this.kind, this.hint});

  /// Nulo quando o servidor manda um `kind` que este build nao conhece: a tela
  /// ainda diz que algo foi retirado, que e a parte que importa.
  final TipoDeRedacao? kind;

  final String? hint;

  static RedacaoDaMensagem? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final dica = bruto['hint'];
    return RedacaoDaMensagem(
      kind: TipoDeRedacao.porCodigo(bruto['kind']),
      hint: dica is String ? dica : null,
    );
  }
}

/// `#/components/schemas/Message` do contrato.
class MensagemDaConversa {
  const MensagemDaConversa({
    required this.id,
    required this.senderRole,
    required this.body,
    required this.createdAt,
    this.redactions = const <RedacaoDaMensagem>[],
    this.photoUrl,
  });

  /// Chave de lista, e **nada mais**.
  final String id;

  final PapelNaConversa senderRole;

  final String body;

  final DateTime createdAt;

  final List<RedacaoDaMensagem> redactions;

  /// `photo_url` do contrato, anulavel.
  final String? photoUrl;

  /// A mensagem e do Bichu, e nao de uma pessoa.
  bool get doSistema => senderRole == PapelNaConversa.sistema;

  static MensagemDaConversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final papel = PapelNaConversa.porCodigo(bruto['sender_role']);
    final corpo = bruto['body'];
    final criadaEm = DateTime.tryParse(bruto['created_at'] as String? ?? '');
    if (papel == null || corpo is! String || criadaEm == null) return null;
    final id = bruto['id'];
    final foto = bruto['photo_url'];
    final retirados = bruto['redactions'];
    return MensagemDaConversa(
      id: id is String ? id : '',
      senderRole: papel,
      body: corpo,
      createdAt: criadaEm,
      photoUrl: foto is String ? foto : null,
      redactions: retirados is! List
          ? const <RedacaoDaMensagem>[]
          : <RedacaoDaMensagem>[
              for (final item in retirados)
                if (RedacaoDaMensagem.doJson(item) case final RedacaoDaMensagem r)
                  r,
            ],
    );
  }
}

/// `#/components/schemas/Conversation` do contrato.
class Conversa {
  const Conversa({
    required this.id,
    required this.petDisplayName,
    required this.status,
    required this.participants,
    required this.messages,
    required this.unread,
    this.papelDoChamador = PapelNaConversa.tutor,
    this.fotoAlcancaOOutroLado = true,
    this.caseId,
    this.foundReportId,
    this.nextCursor,
    this.lastMessagePreview,
    this.lastMessageAt,
  });

  /// `id` do contrato. **Chave de lista e parametro de caminho, e nada mais.**
  final String id;

  /// `case_id`, anulavel no contrato.
  final String? caseId;

  /// `found_report_id`: o aviso de achado de que esta conversa nasceu.
  final String? foundReportId;

  final String petDisplayName;

  final EstadoDaConversa status;

  final List<ParticipanteDaConversa> participants;

  /// As mensagens. **Vazio na LISTA, por desenho do servidor**, e cheio no
  /// detalhe.
  final List<MensagemDaConversa> messages;

  /// O cursor da proxima pagina de MENSAGENS desta conversa.
  final String? nextCursor;

  /// `unread` do contrato: esta conversa tem mensagem que eu ainda nao li.
  final bool unread;

  /// `last_message_preview`: o inicio da ultima mensagem, ja cortado pelo
  /// servidor.
  final String? lastMessagePreview;

  /// `last_message_at`: quando foi a ultima mensagem.
  final DateTime? lastMessageAt;

  /// `photo_reaches_other_side`: uma foto que EU mandar vai ser legivel pelo
  /// outro lado.
  final bool fotoAlcancaOOutroLado;

  /// `viewer_role`: **QUAL DOS DOIS LADOS e quem esta usando o app.**
  final PapelNaConversa papelDoChamador;

  /// O outro lado, para o titulo da conversa e para a marca neutra.
  ParticipanteDaConversa? outroLadoVistoPor(PapelNaConversa meuPapel) {
    for (final p in participants) {
      if (p.role != meuPapel && p.role != PapelNaConversa.sistema) return p;
    }
    return null;
  }

  static Conversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final estado = EstadoDaConversa.porCodigo(bruto['status']);
    if (estado == null) return null;
    final id = bruto['id'];
    if (id is! String || id.isEmpty) return null;
    final nomeDoPet = bruto['pet_display_name'];
    final caso = bruto['case_id'];
    final aviso = bruto['found_report_id'];
    final cursor = bruto['next_cursor'];
    final participantes = bruto['participants'];
    final mensagens = bruto['messages'];
    final previa = bruto['last_message_preview'];
    final quando = bruto['last_message_at'];
    return Conversa(
      id: id,
      caseId: caso is String ? caso : null,
      foundReportId: aviso is String && aviso.isNotEmpty ? aviso : null,
      petDisplayName: nomeDoPet is String ? nomeDoPet : '',
      status: estado,
      nextCursor: cursor is String ? cursor : null,
      unread: bruto['unread'] == true,
      fotoAlcancaOOutroLado: bruto['photo_reaches_other_side'] != false,
      papelDoChamador: switch (PapelNaConversa.porCodigo(bruto['viewer_role'])) {
        PapelNaConversa.tutor => PapelNaConversa.tutor,
        PapelNaConversa.achador => PapelNaConversa.achador,
        _ => PapelNaConversa.tutor,
      },
      lastMessagePreview: previa is String ? previa : null,
      lastMessageAt: quando is String ? DateTime.tryParse(quando) : null,
      participants: participantes is! List
          ? const <ParticipanteDaConversa>[]
          : <ParticipanteDaConversa>[
              for (final item in participantes)
                if (ParticipanteDaConversa.doJson(item)
                    case final ParticipanteDaConversa p)
                  p,
            ],
      messages: mensagens is! List
          ? const <MensagemDaConversa>[]
          : <MensagemDaConversa>[
              for (final item in mensagens)
                if (MensagemDaConversa.doJson(item)
                    case final MensagemDaConversa m)
                  m,
            ],
    );
  }
}

/// `#/components/schemas/ConversationPage` do contrato.
class PaginaDeConversas {
  const PaginaDeConversas({
    required this.items,
    required this.unreadCount,
    required this.total,
    this.nextCursor,
  });

  final List<Conversa> items;

  /// `total` do contrato: quantas conversas o RECORTE tem **no servidor**.
  final int total;

  /// `unread_count` do contrato: o numero do **sino**, da conta inteira.
  final int unreadCount;

  /// O cursor da proxima pagina.
  final String? nextCursor;

  static PaginaDeConversas doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    final cursor = json['next_cursor'];
    final contador = json['unread_count'];
    final quantas = json['total'];
    final lidos = itens is! List
        ? const <Conversa>[]
        : <Conversa>[
            for (final item in itens)
              if (Conversa.doJson(item) case final Conversa c) c,
          ];
    return PaginaDeConversas(
      nextCursor: cursor is String ? cursor : null,
      total: quantas is int && quantas >= 0 ? quantas : lidos.length,
      unreadCount: contador is int && contador > 0 ? contador : 0,
      items: lidos,
    );
  }
}

/// O trecho da ultima mensagem de uma linha da lista -- **quando ha um**.
abstract final class TrechoDaUltimaMensagem {
  /// No maximo uma linha de texto.
  static String? de(Conversa conversa) {
    if (conversa.messages.isEmpty) return null;
    final ultima = conversa.messages.last;
    final limpo = ultima.body.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (limpo.isEmpty) return null;
    return limpo;
  }
}

/// A conversa nao aceita mais mensagem, e o 410 do servidor e quem disse isso.
bool conversaNaoAceitaMais(Problem problem) {
  return problem.tipo == ProblemTipo.conversaEncerrada || problem.status == 410;
}

/// O que o **sino** da barra de topo pinta.
String? seloDoContador(int naoLidas) {
  if (naoLidas <= 0) return null;
  return naoLidas > 9 ? '9+' : '$naoLidas';
}

/// O rotulo acessivel do sino, com o numero REAL por extenso.
String rotuloDoSino(int naoLidas) {
  if (naoLidas <= 0) return 'Mensagens';
  if (naoLidas == 1) return 'Mensagens, 1 não lida';
  return 'Mensagens, $naoLidas não lidas';
}
