/// AS TRES LISTAS FECHADAS DE MOTIVO, no vocabulario do contrato e no da tela.
///
/// **Sem campo de texto livre de motivo**, nos tres. Campo livre vira desabafo e
/// nao se tria, e uma fila que nao se tria e uma fila que ninguem trabalha. O
/// `relato` existe, e opcional, e **nao e o motivo**: e contexto sobre o motivo
/// que a pessoa ja escolheu.
///
/// ## Por que TRES listas, e nao uma
///
/// Porque as tres superficies falam de coisas diferentes, e misturar ofereceria
/// motivos impossiveis: *nudez* e *maus-tratos* sao de IMAGEM, *nao e quem diz
/// ser* e de PERFIL, e *informacao falsa sobre um pet perdido* e de PUBLICACAO.
///
/// A ultima e a que so existe neste produto, e e por isso que ela nao cabia em
/// "outro motivo": **um avistamento inventado manda a pessoa para o bairro
/// errado e custa horas de busca**. Em "outro" ela chegaria a fila sem dizer
/// que e urgente.
///
/// ## A ORDEM DA LISTA E A DA TELA, e ela nao e alfabetica
///
/// Os motivos mais graves vem primeiro, porque a lista e lida de cima para
/// baixo por alguem que esta desconfortavel. "Outro motivo" e sempre o ultimo:
/// primeiro item fechado faz dele o caminho mais barato, e a fila receberia
/// "outro" para tudo.
library;

/// Um motivo: o valor que vai ao contrato e o rotulo que a pessoa le.
class MotivoDeDenuncia {
  const MotivoDeDenuncia(this.valor, this.rotulo);

  /// O valor de `reason` no contrato. **Nunca traduzido**: os quatro clientes
  /// usam os mesmos valores, por regra da casa.
  final String valor;

  /// O que a pessoa le. Frase curta, sem jargao e sem acusacao embutida.
  final String rotulo;
}

/// Denuncia de PERFIL: cinco. Sobre quem a pessoa e.
const List<MotivoDeDenuncia> motivosDePerfil = <MotivoDeDenuncia>[
  MotivoDeDenuncia('minor_suspected', 'Parece ser menor de 16 anos'),
  MotivoDeDenuncia('pet_ransom_scam', 'Golpe ou cobrança para devolver um pet'),
  MotivoDeDenuncia('harassment', 'Está incomodando ou ameaçando'),
  MotivoDeDenuncia('impersonation', 'Não é quem diz ser'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// Denuncia de FOTO: seis. As duas exclusivas sao de imagem.
const List<MotivoDeDenuncia> motivosDeFoto = <MotivoDeDenuncia>[
  MotivoDeDenuncia('child_at_risk', 'Criança em situação de risco'),
  MotivoDeDenuncia('animal_violence', 'Violência ou maus-tratos a animal'),
  MotivoDeDenuncia('nudity_or_sexual', 'Nudez ou conteúdo sexual'),
  MotivoDeDenuncia('i_am_in_it', 'Apareço nesta foto e não autorizei'),
  MotivoDeDenuncia('impersonation', 'Não é quem diz ser'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// Denuncia de PUBLICACAO: cinco, e a terceira e so deste produto.
const List<MotivoDeDenuncia> motivosDePublicacao = <MotivoDeDenuncia>[
  MotivoDeDenuncia('false_lost_pet_info', 'Informação falsa sobre um pet perdido'),
  MotivoDeDenuncia('scam_or_animal_sale', 'Golpe, cobrança ou venda de animal'),
  MotivoDeDenuncia('offensive_or_discriminatory', 'Ofensa ou discriminação'),
  MotivoDeDenuncia('spam_or_repetition', 'Propaganda ou repetição'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// O que se denuncia. Tres alvos, tres listas, tres rotas.
///
/// Local: escolha DA TELA sobre qual folha abrir, decidida no aparelho. **Nao
/// espelha lista fechada nenhuma do contrato**, e nao poderia: o contrato nao
/// tem campo de alvo -- o alvo e a ROTA (`reportUserProfile`, `reportPhoto`,
/// `reportPublication`), e o que viaja no corpo e so `reason`. Quem espelha o
/// contrato aqui sao as tres listas de motivo acima, cada uma contra o `enum` de
/// `reason` do seu `...ReportInput`.
enum AlvoDaDenuncia {
  perfil,
  foto,
  publicacao;

  List<MotivoDeDenuncia> get motivos {
    switch (this) {
      case AlvoDaDenuncia.perfil:
        return motivosDePerfil;
      case AlvoDaDenuncia.foto:
        return motivosDeFoto;
      case AlvoDaDenuncia.publicacao:
        return motivosDePublicacao;
    }
  }

  /// O titulo da folha. Diz O QUE esta sendo denunciado, e nao quem.
  String get titulo {
    switch (this) {
      case AlvoDaDenuncia.perfil:
        return 'Denunciar este perfil';
      case AlvoDaDenuncia.foto:
        return 'Denunciar esta foto';
      case AlvoDaDenuncia.publicacao:
        return 'Denunciar esta publicação';
    }
  }
}

/// **A FRASE QUE FAZ DENUNCIAR PARECER SEGURO**, e ela aparece ANTES do envio.
///
/// Antes e nao depois: quem esta decidindo se denuncia precisa saber que a
/// outra pessoa nao e avisada *enquanto decide*. Depois do envio ela seria um
/// alivio; antes, ela e o que faz a pessoa conseguir tocar no botao.
const String oOutroNaoEAvisado = 'O outro usuário não fica sabendo que você denunciou.';

/// O que a tela diz depois do envio.
///
/// **Sem prazo**, e a ausencia e deliberada: nao existe prazo, e prometer um
/// seria mentir sobre o que o produto tem. O que a frase promete e o que
/// acontece de verdade e na hora -- a ocultacao imediata.
const String denunciaRecebida = 'Denúncia enviada. Você não vai mais ver este conteúdo.';

/// O rotulo do item desabilitado, depois de denunciar.
///
/// E ele que impede a mesma pessoa de denunciar cinco vezes -- e impede pela
/// TELA, que e onde isso custa menos: o servidor tambem soma em vez de
/// duplicar, mas um menu que continuasse oferecendo "Denunciar" faria a pessoa
/// achar que a primeira nao foi.
const String denunciaJaEnviada = 'Denúncia enviada';

// ---------------------------------------------------------------------------
// A LISTA DE QUEM EU BLOQUEEI (19/10/2026)
// ---------------------------------------------------------------------------
//
// Decisão do cliente: *uma lista de quem você bloqueou, na gaveta do Perfil, e
// o desbloqueio acontece ali*. Ela existe porque o bloqueio é **simétrico**, e
// a simetria fechava o perfil da pessoa bloqueada para quem a bloqueou — onde o
// botão "Desbloquear" morava. Bloquear era irreversível pelo aplicativo.

/// `#/components/schemas/BlockedPerson` do contrato.
///
/// **QUATRO campos, e o recorte foi decidido.** Esta lista mostra pessoas com
/// quem quem lê **não tem vínculo nenhum** — ela bloqueou justamente para não
/// ter —, então o que cada linha carrega é o mínimo que identifica alguém
/// **para a própria pessoa que o bloqueou**:
///
/// - [publicRef] é o endereço que o desbloqueio recebe. Sem ele a linha não tem
///   botão;
/// - [displayName] é o que a própria pessoa reconhece;
/// - [handle] é o identificador ESTÁVEL: o nome de exibição muda, e dois
///   homônimos bloqueados ficariam indistinguíveis na hora de escolher qual
///   desbloquear;
/// - [bloqueadoEm] é o ato de QUEM LÊ, e não dado da outra pessoa.
///
/// **NÃO HÁ FOTO**, e é a ausência que mais importa: a emenda 3 do ADR-0010
/// (19/10/2026) liberou a foto de perfil em UMA superfície — o participante da
/// conversa mediada — e **só entre conexões aceitas**. Bloqueado é o oposto de
/// conexão aceita. Também não há contagem de pets nem de conexões: aquilo é
/// sinal de confiança de um PERFIL, e a pergunta desta tela é "qual das pessoas
/// que eu bloqueei é esta".
///
/// **E não há nada sobre quem bloqueou QUEM LÊ** — nem campo, nem contagem, nem
/// booleano. O bloqueio é simétrico no servidor e a leitura é assimétrica de
/// propósito: a outra metade do par seria o oráculo *"ela te bloqueou"*.
class PessoaBloqueada {
  const PessoaBloqueada({
    required this.publicRef,
    required this.handle,
    required this.displayName,
    required this.bloqueadoEm,
  });

  factory PessoaBloqueada.doJson(Map<String, dynamic> json) {
    return PessoaBloqueada(
      publicRef: json['public_ref'] as String,
      handle: json['handle'] as String?,
      displayName: json['display_name'] as String?,
      bloqueadoEm: DateTime.parse(json['blocked_at'] as String),
    );
  }

  /// `users.public_ref`: 22 símbolos, opaco. **Não é UUID** e não é o apelido.
  final String publicRef;

  /// Anulável no contrato: o bloqueio é endereçado por [publicRef], e é
  /// possível ter bloqueado alguém sem apelido.
  final String? handle;

  final String? displayName;

  final DateTime bloqueadoEm;

  /// O que a linha escreve, na ordem em que a pessoa reconhece.
  ///
  /// Nome de exibição primeiro; sem ele, `@apelido`; sem os dois, [semNome], que
  /// é **texto de tela e não de servidor**. A linha existe de qualquer forma —
  /// esconder a de quem não tem nome a deixaria bloqueada para sempre.
  String get nomeParaLer {
    final nome = displayName?.trim();
    if (nome != null && nome.isNotEmpty) return nome;
    final apelido = handle?.trim();
    if (apelido != null && apelido.isNotEmpty) return '@$apelido';
    return semNome;
  }

  static const String semNome = 'Usuário sem nome';
}

/// `#/components/schemas/MyBlockPage` do contrato.
class PaginaDeBloqueados {
  const PaginaDeBloqueados({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory PaginaDeBloqueados.doJson(Map<String, dynamic> json) {
    final crus = (json['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>();
    return PaginaDeBloqueados(
      items: crus.map(PessoaBloqueada.doJson).toList(growable: false),
      total: json['total'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 20,
    );
  }

  final List<PessoaBloqueada> items;
  final int total;
  final int page;
  final int limit;
}
