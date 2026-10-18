/// Os modelos da conversa mediada, campo por campo do contrato.
///
/// **Regra do cliente (23/09/2026): o app usa exatamente os nomes do
/// `api/openapi.yaml`.** Cada classe e cada enum daqui abre o doc com o
/// ponteiro JSON do schema que espelha, e o portao
/// `infra/verificacao/verificar-conformidade-do-app.mjs` confere os dois
/// lados.
///
/// ---------------------------------------------------------------------------
/// ## NAO HA FOTO DE PERFIL AQUI, E A AUSENCIA E DO CONTRATO
///
/// O contrato declara, **por extenso e em dois lugares** -- em
/// `Conversation/properties/participants` e em
/// `FinderConversation/properties/participants` --, que `display_name` e
/// *"Primeiro nome ou apelido. **Nunca** sobrenome completo, telefone, e-mail
/// nem foto de perfil"*. [ParticipanteDaConversa] tem **dois campos**, que sao
/// os dois que o contrato lista, e nao ha um terceiro para uma URL de imagem
/// cair.
///
/// A consequencia de tela precisa estar dita aqui, porque e de onde ela vem: a
/// conversa **nao tem avatar de foto para ninguem**. A marca ao lado do nome e
/// neutra -- a inicial do `display_name` -- e e a mesma para os dois lados.
///
/// O cliente pediu, antes desta tela existir, que *"a foto deve trazer um
/// avatar padrao cinza, como se tivesse desabilitado"* para conta
/// desabilitada. **Como nao existe foto nenhuma neste schema**, a leitura
/// correta do pedido e a que o servidor ja cumpre: o lado desabilitado aparece
/// **despersonalizado**, com o rotulo neutro (`Tutor` / `Quem achou`) que
/// `participantesVisiveis` devolve quando nao ha nome. A tela acompanha
/// pintando a marca em cinza desligado -- o que e a forma, e nao um dado novo.
///
/// ---------------------------------------------------------------------------
/// ## O que o contrato NAO manda na LISTA, e por que a tela nao inventa
///
/// `GET /conversations` devolve `ConversationPage`, cujos itens sao
/// `Conversation` inteiras -- e o servidor manda **`messages: []` em cada
/// uma**, de proposito (`conversation-service.ts`: *"a lista carrega cabecalho,
/// e trazer as mensagens de cada linha seria N+1 na tela que o tutor abre com
/// o telefone tocando"*).
///
/// Medido em 18/10/2026, contra `api/openapi.yaml` e contra o servidor: o
/// contrato **nao declara**, em `Conversation`, nenhum dos tres campos abaixo.
///
///   - **trecho da ultima mensagem** -- nao existe campo, e `messages` vem
///     vazio na lista;
///   - **quando foi a ultima mensagem** -- nao existe `last_message_at` nem
///     nada equivalente;
///   - **marca de nao lida** -- nao existe `unread_count` nem `read_at`, e
///     **nao ha coluna de leitura no banco**: nenhuma migracao de
///     `migrations/` guarda o que cada lado ja leu.
///
/// [TrechoDaUltimaMensagem] existe para deixar isso **legivel no codigo em vez
/// de descoberto na tela**: ela le o que a resposta tem, e devolve nulo quando
/// a resposta nao tem. A tela desenha a linha sem o trecho, em vez de calcular
/// no app um valor que o servidor nao mandou -- que e o que a instrucao desta
/// historia proibiu por escrito ("se houver contagem, que ela venha do
/// servidor -- nao calculada no app").
library;

import 'problem.dart';

// ---------------------------------------------------------------------------
// LISTAS FECHADAS
// ---------------------------------------------------------------------------

/// `#/components/schemas/Conversation/properties/status` do contrato.
///
/// [porCodigo] devolve nulo para codigo desconhecido: nao ha valor seguro para
/// onde cair, e a tela nao afirma nada sobre um estado que nao entende --
/// muito menos "aberta", que desenharia uma caixa de texto que sempre falha.
enum EstadoDaConversa {
  aberta('open'),
  bloqueada('blocked'),
  encerrada('closed');

  const EstadoDaConversa(this.codigo);

  final String codigo;

  /// So `aberta` aceita mensagem nova. As outras duas sao **modo leitura**, e
  /// essa e a mesma regra que o servidor aplica em `aceitaMensagem`.
  ///
  /// A tela decide a caixa de texto por aqui, e nao por `== encerrada`: o
  /// bloqueio tambem recusa o envio com o mesmo 410, e uma condicao escrita
  /// sobre um unico valor deixaria `bloqueada` com um campo que sempre falha.
  bool get aceitaMensagem => this == EstadoDaConversa.aberta;

  static EstadoDaConversa? porCodigo(Object? codigo) {
    for (final e in EstadoDaConversa.values) {
      if (e.codigo == codigo) return e;
    }
    return null;
  }
}

/// `#/components/schemas/Message/properties/sender_role` do contrato.
///
/// Os tres valores do contrato, e os tres sao desenhados: `system` e o Bichu
/// falando -- a mensagem de abertura do aviso e o alerta de dado retirado --,
/// e ela nao e bolha de ninguem.
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

// ---------------------------------------------------------------------------
// OBJETOS
// ---------------------------------------------------------------------------

/// `#/components/schemas/Conversation/properties/participants/items`.
///
/// **Dois campos, e sao os dois que o contrato declara.** Ver o cabecalho
/// deste arquivo: nao ha foto, nao ha id, nao ha telefone, e nao pode passar a
/// haver -- o item 7 do ADR-0010 proibe qualquer coisa que permita agrupar os
/// pets de um mesmo tutor, e um identificador estavel aqui faria isso.
class ParticipanteDaConversa {
  const ParticipanteDaConversa({required this.role, required this.displayName});

  final PapelNaConversa role;

  /// Primeiro nome ou apelido, **ou o rotulo neutro**.
  ///
  /// `Tutor` e `Quem achou` nao sao textos do app: eles vem do servidor, de
  /// `participantesVisiveis`, quando aquele lado nao tem nome para mostrar --
  /// o que inclui a conta desabilitada. E por isso que o lado desabilitado
  /// aparece despersonalizado **sem a tela saber que ele esta desabilitado**:
  /// a tela desenha o que veio.
  final String displayName;

  /// A marca neutra: a primeira letra, em caixa alta.
  ///
  /// Vazio quando nao da para tirar letra nenhuma, e a tela desenha o ponto
  /// neutro no lugar. **Nao e iniciais do nome inteiro**: o contrato promete
  /// que sobrenome nao sai, e duas iniciais pediriam um sobrenome.
  String get marcaNeutra {
    final limpo = displayName.trim();
    if (limpo.isEmpty) return '';
    return limpo.substring(0, 1).toUpperCase();
  }

  static ParticipanteDaConversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final papel = PapelNaConversa.porCodigo(bruto['role']);
    // Papel desconhecido sai da lista em vez de virar `tutor`: desenhar a
    // bolha do lado errado seria afirmar que o tutor escreveu o que o achador
    // escreveu.
    if (papel == null) return null;
    final nome = bruto['display_name'];
    if (nome is! String) return null;
    return ParticipanteDaConversa(role: papel, displayName: nome);
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
///
/// `id` existe **apenas nesta vista**, a do chamador autenticado -- a do
/// achador sem conta e `FinderMessage`, sem `id` (SEC-001). O app autenticado
/// e o unico consumidor deste arquivo.
///
/// **`id` NAO vai para a tela.** Ele e UUID interno e serve de chave de lista;
/// o ADR-0010 proibe UUID interno em saida publica, e um id pintado num rotulo
/// acessivel seria exatamente isso. A isca
/// `test/mensagens/nenhum_identificador_na_tela_test.dart` reprova se aparecer.
class MensagemDaConversa {
  const MensagemDaConversa({
    required this.id,
    required this.senderRole,
    required this.body,
    required this.createdAt,
    this.redactions = const <RedacaoDaMensagem>[],
    this.photoUrl,
  });

  /// Chave de lista, e **nada mais**. Nunca pintado.
  final String id;

  final PapelNaConversa senderRole;

  final String body;

  final DateTime createdAt;

  final List<RedacaoDaMensagem> redactions;

  /// `photo_url` do contrato, anulavel. O servidor manda `null` hoje: a foto
  /// entra com a midia do achado.
  final String? photoUrl;

  /// A mensagem e do Bichu, e nao de uma pessoa.
  bool get doSistema => senderRole == PapelNaConversa.sistema;

  static MensagemDaConversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final papel = PapelNaConversa.porCodigo(bruto['sender_role']);
    final corpo = bruto['body'];
    final criadaEm = DateTime.tryParse(bruto['created_at'] as String? ?? '');
    // Os tres sao `required` no contrato. Mensagem sem um deles sai da lista:
    // uma bolha sem autor seria desenhada no lado que o app escolhesse.
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
    this.caseId,
    this.nextCursor,
  });

  /// `id` do contrato. **Chave de lista e parametro de caminho, e nada mais.**
  ///
  /// Nunca pintado (ADR-0010): ele e UUIDv7, e dois deles entregam a taxa de
  /// criacao de registros da plataforma. A isca
  /// `test/mensagens/nenhum_identificador_na_tela_test.dart` reprova se sair.
  final String id;

  /// `case_id`, anulavel no contrato. O app **nao o usa em tela nenhuma** --
  /// ele esta aqui porque o contrato o declara e ler menos que o contrato
  /// esconde a decisao de nao usar.
  final String? caseId;

  final String petDisplayName;

  final EstadoDaConversa status;

  final List<ParticipanteDaConversa> participants;

  /// As mensagens. **Vazio na LISTA, por desenho do servidor**, e cheio no
  /// detalhe. Ver o cabecalho deste arquivo.
  final List<MensagemDaConversa> messages;

  /// O cursor da proxima pagina de MENSAGENS desta conversa. Nulo no fim.
  final String? nextCursor;

  /// O outro lado, para o titulo da conversa e para a marca neutra.
  ///
  /// Recebe o papel do proprio chamador, que a lista nao sabe: `participants`
  /// vem sempre com os dois lados e o contrato **nao diz qual deles e o
  /// chamador** -- nao ha campo para isso, e nao deve haver. Quem sabe e a
  /// sessao, e e por isso que este metodo recebe o papel em vez de adivinhar.
  ParticipanteDaConversa? outroLadoVistoPor(PapelNaConversa meuPapel) {
    for (final p in participants) {
      if (p.role != meuPapel && p.role != PapelNaConversa.sistema) return p;
    }
    return null;
  }

  static Conversa? doJson(Object? bruto) {
    if (bruto is! Map<String, dynamic>) return null;
    final estado = EstadoDaConversa.porCodigo(bruto['status']);
    // Estado desconhecido sai da lista. Cair em `aberta` desenharia uma caixa
    // de texto cujo envio o servidor recusaria com 410 -- e a pessoa leria
    // "nao foi enviada" sem nunca ter sido avisada de que nao podia escrever.
    if (estado == null) return null;
    final id = bruto['id'];
    if (id is! String || id.isEmpty) return null;
    final nomeDoPet = bruto['pet_display_name'];
    final caso = bruto['case_id'];
    final cursor = bruto['next_cursor'];
    final participantes = bruto['participants'];
    final mensagens = bruto['messages'];
    return Conversa(
      id: id,
      caseId: caso is String ? caso : null,
      petDisplayName: nomeDoPet is String ? nomeDoPet : '',
      status: estado,
      nextCursor: cursor is String ? cursor : null,
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
  const PaginaDeConversas({required this.items, this.nextCursor});

  final List<Conversa> items;

  /// O cursor da proxima pagina. **Cursor, e nunca deslocamento**: o contrato
  /// so declara `cursor`, e paginar por numero de pagina reordenaria a lista
  /// embaixo de quem esta lendo cada vez que uma mensagem nova chega.
  final String? nextCursor;

  static PaginaDeConversas doJson(Map<String, dynamic> json) {
    final itens = json['items'];
    final cursor = json['next_cursor'];
    return PaginaDeConversas(
      nextCursor: cursor is String ? cursor : null,
      items: itens is! List
          ? const <Conversa>[]
          : <Conversa>[
              for (final item in itens)
                if (Conversa.doJson(item) case final Conversa c) c,
            ],
    );
  }
}

/// O trecho da ultima mensagem de uma linha da lista -- **quando ha um**.
///
/// ## Por que esta classe existe em vez de uma linha de codigo na tela
///
/// Porque a resposta da lista **nao traz o trecho**, e a tela precisa dizer
/// isso de um jeito que nao se perca. Medido em 18/10/2026: `GET
/// /conversations` manda `messages: []` em cada item, por decisao explicita do
/// servico, e `Conversation` nao declara `last_message_preview` nem
/// `last_message_at`.
///
/// O caminho errado e curto e tentador: a tela pediria `getConversation` para
/// cada linha so para ter a previa. Isso e o N+1 que o servidor evitou de
/// proposito, na tela que o tutor abre **com o telefone tocando** -- vinte
/// conversas seriam vinte requisicoes antes de a lista aparecer.
///
/// Entao [de] le o que existe e devolve nulo quando nao existe, e a lista
/// desenha a linha sem o trecho. A falta aparece no relatorio da historia como
/// o aditivo de contrato que ela pede, e nao como um campo inventado no app.
abstract final class TrechoDaUltimaMensagem {
  /// No maximo uma linha de texto. Nulo quando a resposta nao tem mensagem.
  static String? de(Conversa conversa) {
    if (conversa.messages.isEmpty) return null;
    final ultima = conversa.messages.last;
    final limpo = ultima.body.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (limpo.isEmpty) return null;
    return limpo;
  }
}

/// A conversa nao aceita mais mensagem, e o 410 do servidor e quem disse isso.
///
/// **E o MESMO erro para conversa encerrada e para conta desabilitada do outro
/// lado**, e a fusao e do contrato, de proposito: distinguir contaria a uma
/// pessoa o que aconteceu com a conta de outra. Ver [ProblemTipo.conversaEncerrada].
bool conversaNaoAceitaMais(Problem problem) {
  // Decide pelo `type`, e nao pelo texto de `title` (regra do contrato). O
  // status entra como segunda porta porque um 410 desta rota nao tem outro
  // significado no contrato, e um `type` que este build nao conhece ainda
  // precisa fechar a caixa de texto -- deixar o campo aberto faria a pessoa
  // escrever de novo o que nunca vai ser entregue.
  return problem.tipo == ProblemTipo.conversaEncerrada || problem.status == 410;
}
