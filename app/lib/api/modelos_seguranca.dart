/// AS TRES LISTAS FECHADAS DE MOTIVO, no vocabulario do contrato e no da tela.
library;

/// Um motivo: o valor que vai ao contrato e o rotulo que a pessoa le.
class MotivoDeDenuncia {
  const MotivoDeDenuncia(this.valor, this.rotulo);

  /// O valor de `reason` no contrato.
  final String valor;

  /// O que a pessoa le. Frase curta, sem jargao e sem acusacao embutida.
  final String rotulo;
}

/// Denuncia de PERFIL: cinco.
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
const String oOutroNaoEAvisado = 'O outro usuário não fica sabendo que você denunciou.';

/// O que a tela diz depois do envio.
const String denunciaRecebida = 'Denúncia enviada. Você não vai mais ver este conteúdo.';

/// O rotulo do item desabilitado, depois de denunciar.
const String denunciaJaEnviada = 'Denúncia enviada';

/// `#/components/schemas/BlockedPerson` do contrato.
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

  /// `users.public_ref`: 22 símbolos, opaco.
  final String publicRef;

  /// Anulável no contrato: o bloqueio é endereçado por [publicRef], e é
  /// possível ter bloqueado alguém sem apelido.
  final String? handle;

  final String? displayName;

  final DateTime bloqueadoEm;

  /// O que a linha escreve, na ordem em que a pessoa reconhece.
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
