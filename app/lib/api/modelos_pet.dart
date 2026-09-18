/// Os modelos de pet, de tag e da lista de referencia.
///
/// Recortes de `components/schemas` de `api/openapi.yaml`. O contrato e
/// entrada, nao sugestao: campo que nao esta la nao aparece aqui.
library;

/// `Species` do contrato.
enum Especie {
  cao('dog', 'Cão'),
  gato('cat', 'Gato'),
  outro('other', 'Outro');

  const Especie(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  /// O codigo de saida da lista de racas, por especie.
  ///
  /// E o unico codigo que **habilita** `breed_free_text` no contrato. Deduzir
  /// esse sufixo no ponto de uso, espalhado, e como as tres telas que usam a
  /// lista divergem: a regra mora aqui.
  String get codigoDeOutraRaca => switch (this) {
        Especie.cao => 'outro_dog',
        Especie.gato => 'outro_cat',
        Especie.outro => 'outro_other',
      };

  static Especie? de(String? valor) {
    for (final e in Especie.values) {
      if (e.valor == valor) return e;
    }
    return null;
  }
}

/// `PetSize` do contrato.
///
/// O contrato declara **quatro** valores (`P`, `M`, `G`, `GG`) e a tela F1.3
/// desenha **tres** botoes. Os quatro ficam aqui porque a resposta do servidor
/// pode trazer `GG` de um pet cadastrado por outra superficie, e um `switch`
/// que nao conhece o valor quebra a leitura da ficha. Quais deles a tela
/// oferece e decisao da tela, e esta em `TelaCadastrarIdentificacao`.
enum Porte {
  pequeno('P', 'Pequeno'),
  medio('M', 'Médio'),
  grande('G', 'Grande'),
  gigante('GG', 'Gigante');

  const Porte(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  static Porte? de(String? valor) {
    for (final p in Porte.values) {
      if (p.valor == valor) return p;
    }
    return null;
  }
}

/// `Sex` do contrato.
enum Sexo {
  macho('male', 'Macho'),
  femea('female', 'Fêmea'),
  naoSei('unknown', 'Não sei');

  const Sexo(this.valor, this.rotulo);

  final String valor;
  final String rotulo;

  static Sexo? de(String? valor) {
    for (final s in Sexo.values) {
      if (s.valor == valor) return s;
    }
    return null;
  }
}

/// Uma opcao de lista fechada: codigo que cruza, rotulo que a pessoa le.
///
/// **O codigo e o que vai para o servidor; o rotulo e o que aparece.** Trocar
/// um pelo outro e o defeito que a lista fechada existe para impedir.
class OpcaoDeReferencia {
  const OpcaoDeReferencia({
    required this.codigo,
    required this.rotulo,
    this.especie,
  });

  final String codigo;
  final String rotulo;

  /// So em raca: a especie a que a raca pertence.
  final Especie? especie;

  factory OpcaoDeReferencia.doJson(Map<String, dynamic> json) {
    return OpcaoDeReferencia(
      codigo: json['code'] as String? ?? '',
      rotulo: json['label'] as String? ?? '',
      especie: Especie.de(json['species'] as String?),
    );
  }
}

/// `ReferenceData` do contrato: a lista fechada de especies, racas, portes e
/// cores, com a versao que o cliente precisa devolver em `ref_data_version`.
class DadosDeReferencia {
  const DadosDeReferencia({
    required this.versao,
    required this.racas,
    required this.cores,
  });

  final String versao;
  final List<OpcaoDeReferencia> racas;
  final List<OpcaoDeReferencia> cores;

  /// As racas de uma especie, sem a opcao de saida.
  ///
  /// A saida (`outro_dog` e irmas) e montada pela tela, porque o rotulo dela
  /// e microcopy (`Outra`) e nao dado do servidor.
  List<OpcaoDeReferencia> racasDe(Especie especie) {
    return racas
        .where((r) =>
            r.especie == especie && r.codigo != especie.codigoDeOutraRaca)
        .toList(growable: false);
  }

  factory DadosDeReferencia.doJson(Map<String, dynamic> json) {
    List<OpcaoDeReferencia> lista(String chave) {
      return (json[chave] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(OpcaoDeReferencia.doJson)
          .toList(growable: false);
    }

    return DadosDeReferencia(
      versao: json['version'] as String? ?? '',
      racas: lista('breeds'),
      cores: lista('colors'),
    );
  }
}

/// O que a redacao do servidor retirou de `care_notes` ao gravar.
///
/// Vazio quando nada foi retirado. Existe para a tela **dizer o que
/// aconteceu**, em vez de o tutor ver um texto sumir e achar que perdeu tudo.
enum RedacaoDeCuidados {
  telefone('phone', 'o telefone'),
  email('email', 'o e-mail'),
  endereco('address', 'o endereço'),
  link('external_link', 'o link');

  const RedacaoDeCuidados(this.valor, this.comoSeChama);

  final String valor;

  /// Como o texto de F1.5 nomeia a coisa retirada: "Tiramos **o telefone**
  /// que você escreveu."
  final String comoSeChama;

  static RedacaoDeCuidados? de(String? valor) {
    for (final r in RedacaoDeCuidados.values) {
      if (r.valor == valor) return r;
    }
    return null;
  }
}

/// `Pet` do contrato, nos campos que estas telas usam.
class Pet {
  const Pet({
    required this.id,
    required this.nome,
    required this.especie,
    required this.redacoesDeCuidados,
    this.racaRotulo,
    this.cuidados,
  });

  final String id;
  final String nome;
  final Especie especie;

  /// `breed_label`: o rotulo ja resolvido pelo servidor. E o `label` da lista
  /// quando o codigo esta nela, e o texto livre quando o codigo e `outro_*`.
  /// A tela exibe este campo e nao precisa saber qual caminho o gerou.
  final String? racaRotulo;

  /// `care_notes` **como ficou depois da redacao**, e nao como foi digitado.
  final String? cuidados;

  final List<RedacaoDeCuidados> redacoesDeCuidados;

  /// O pronome do texto de tela concorda com o sexo? Nao: a microcopy de F1.5
  /// e F1.6 fala do pet pelo **nome**, e nao por pronome. Nada a decidir aqui.

  factory Pet.doJson(Map<String, dynamic> json) {
    return Pet(
      id: json['id'] as String,
      nome: json['name'] as String? ?? '',
      especie: Especie.de(json['species'] as String?) ?? Especie.outro,
      racaRotulo: json['breed_label'] as String?,
      cuidados: json['care_notes'] as String?,
      redacoesDeCuidados:
          (json['care_notes_redactions'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map((m) => RedacaoDeCuidados.de(m['kind'] as String?))
              .whereType<RedacaoDeCuidados>()
              .toList(growable: false),
    );
  }
}

/// `PetTagIssued`: a **unica** resposta do contrato que traz o codigo em claro.
///
/// `GET /v1/pets/{petId}/tags` nunca mais devolve [codigo], nem para o dono:
/// so `code_suffix`, os quatro ultimos caracteres. Por isso o contrato diz que
/// o cliente **nao persiste** este valor, e por isso F1.6 e a unica tela do
/// produto em que ele aparece inteiro.
class TagEmitida {
  const TagEmitida({
    required this.id,
    required this.codigo,
    required this.url,
    required this.sufixo,
    this.qrPngUrl,
  });

  final String id;

  /// O codigo por extenso. **Nao grave isto em disco.**
  final String codigo;

  final String url;

  /// `code_suffix`: os quatro ultimos caracteres, que sao tudo o que o app
  /// consegue mostrar depois desta tela.
  final String sufixo;

  final String? qrPngUrl;

  factory TagEmitida.doJson(Map<String, dynamic> json) {
    return TagEmitida(
      id: json['id'] as String? ?? '',
      codigo: json['code'] as String? ?? '',
      url: json['url'] as String? ?? '',
      sufixo: json['code_suffix'] as String? ?? '',
      qrPngUrl: json['qr_png_url'] as String?,
    );
  }
}

/// Quem esta do outro lado do codigo escaneado (`TagResolution.viewer`).
///
/// **E sinal de navegacao, e nao chave que destranca campo.** O corpo da
/// resposta e identico nos tres; `viewer` diz qual tela abrir.
enum QuemEscaneou {
  dono('owner'),
  outroLogado('authenticated_other'),
  anonimo('anonymous');

  const QuemEscaneou(this.valor);

  final String valor;

  static QuemEscaneou de(String? valor) {
    for (final q in QuemEscaneou.values) {
      if (q.valor == valor) return q;
    }
    // Sem `viewer` reconhecido, o caminho conservador serve ao achador: quem
    // esta com o animal no colo precisa do botao de avisar, e o dono que caiu
    // aqui por engano perde uma tela, nao um resgate (UX F2.3, "Erro").
    return QuemEscaneou.anonimo;
  }
}

/// `TagResolution`: o que `GET /v1/tags/{code}` devolve quando o codigo vale.
class TagResolvida {
  const TagResolvida({
    required this.quemEscaneou,
    required this.nomeDoPet,
    required this.especie,
    this.estaPerdido = false,
  });

  final QuemEscaneou quemEscaneou;
  final String nomeDoPet;
  final Especie especie;
  final bool estaPerdido;

  factory TagResolvida.doJson(Map<String, dynamic> json) {
    final pet = json['pet'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final perdido = json['lost'] as Map<String, dynamic>?;
    return TagResolvida(
      quemEscaneou: QuemEscaneou.de(json['viewer'] as String?),
      nomeDoPet: pet['display_name'] as String? ?? '',
      especie: Especie.de(pet['species'] as String?) ?? Especie.outro,
      estaPerdido: perdido?['is_lost'] as bool? ?? false,
    );
  }
}
