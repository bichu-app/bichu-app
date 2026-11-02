/// Os modelos que a camada de acesso devolve.
library;

import 'modelos_diretorio.dart' show urlDeImagem;

/// `#/components/schemas/Me/properties/pending_profile_fields/items` do
/// contrato.
enum PendenciaDeCadastro {
  verificacaoDeEmail('email_verification'),
  telefone('phone'),
  nome('display_name'),
  regiaoDeReferencia('reference_area');

  const PendenciaDeCadastro(this.valor);

  final String valor;

  static PendenciaDeCadastro? de(String valor) {
    for (final p in PendenciaDeCadastro.values) {
      if (p.valor == valor) return p;
    }
    return null;
  }
}

/// `Me.reference_area`: onde o tutor mora, **em texto**.
class RegiaoDeReferencia {
  const RegiaoDeReferencia({this.bairro, this.cidade, this.uf, this.cep});

  final String? bairro;
  final String? cidade;
  final String? uf;
  final String? cep;

  /// Verdadeiro quando ha algo a preencher.
  bool get temAlgo =>
      (bairro != null && bairro!.isNotEmpty) ||
      (cidade != null && cidade!.isNotEmpty);

  static RegiaoDeReferencia? doJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final regiao = RegiaoDeReferencia(
      bairro: json['neighborhood'] as String?,
      cidade: json['city'] as String?,
      uf: json['state'] as String?,
      cep: json['postal_code'] as String?,
    );
    return regiao.temAlgo ? regiao : null;
  }
}

/// Por que uma conta **não apareceria** numa listagem de pessoas.
///
/// Espelha `MotivoDeNaoAparecer` de
/// `src/shared/perfil-publico/perfil-publico-de-pessoa.ts`, **e na mesma
/// ordem**. Ver [Usuario.motivoDeNaoAparecerNaListagem] para por que a cópia
/// existe e o que a torna aceitável.
///
/// Local: não espelha nenhuma lista fechada de `api/openapi.yaml`, e a ausência
/// é deliberada — **o contrato não devolve o motivo**, porque devolvê-lo faria o
/// servidor dizer por que alguém não está na lista. Ele é derivado no
/// aplicativo, dos campos do PRÓPRIO DONO (`Me.public_profile_enabled`,
/// `Me.photo` e `Me.handle`), e serve só para a tela não ficar muda.
enum MotivoDeNaoAparecer {
  perfilPublicoDesligado,
  semFotoPronta,
  semApelido,
}

/// `#/components/schemas/Me` do contrato.
class Usuario {
  const Usuario({
    required this.id,
    required this.email,
    required this.emailVerificado,
    required this.canalConfirmado,
    required this.pendencias,
    required this.podeAbrirCaso,
    this.perfilPublicoLigado = false,
    this.apelido,
    this.nome,
    this.emailPendente,
    this.emailEntregavel = true,
    this.regiaoDeReferencia,
    this.fotoUrl,
  });

  final String id;
  final String email;

  /// `email_verified`: **o e-mail desta conta foi confirmado**, e so isso.
  final bool emailVerificado;

  /// `contact_channel_verified`: **O SELO DE VALIDADO**, pela mesma regua que
  /// os OUTROS veem desta conta.
  final bool canalConfirmado;

  /// Endereco novo aguardando confirmacao, quando ha troca em curso.
  final String? emailPendente;

  /// Falso apos devolucao definitiva do provedor.
  final bool emailEntregavel;

  final String? nome;
  final List<PendenciaDeCadastro> pendencias;

  /// Falso quando nenhum canal de contato esta verificado.
  final bool podeAbrirCaso;

  /// `public_profile_enabled`: **o perfil público da pessoa** (cliente,
  /// 02/11/2026), **desligado por padrão**.
  ///
  /// **Não é capacidade, é visibilidade** — ele mesmo: *"não tem relação com
  /// permissões dentro do sistema, apenas de visibilidade"*. Ligar não libera
  /// nada que a pessoa FAZ; decide o que outros VEEM dela.
  final bool perfilPublicoLigado;

  /// `handle`: o apelido (`@`) da própria conta, ou nulo.
  ///
  /// Entra aqui por uma razão concreta: **sem apelido o perfil não tem
  /// endereço**, e é uma das três condições para aparecer numa listagem de
  /// pessoas.
  final String? apelido;

  /// A regiao cadastrada pelo tutor, quando ha uma.
  final RegiaoDeReferencia? regiaoDeReferencia;

  /// `Me.photo.url`: a foto que a PROPRIA pessoa cadastrou, ou nulo.
  final String? fotoUrl;

  bool get cadastroIncompleto => pendencias.isNotEmpty;

  /// **POR QUE ESTA CONTA NÃO APARECERIA numa listagem de pessoas**, ou nulo
  /// para "apareceria".
  ///
  /// A regra é **foto + perfil público** (cliente, 02/11/2026: *"o que coloca a
  /// pessoa na listagem é foto + perfil público"*), e a fonte dela é
  /// `src/shared/perfil-publico/perfil-publico-de-pessoa.ts` no servidor, onde
  /// ela vive em duas formas — uma de TypeScript e uma de SQL — com portão
  /// cobrando que as duas digam o mesmo.
  ///
  /// **Esta é uma TERCEIRA forma, e a duplicação é inevitável**: Dart não
  /// importa TypeScript. O que a torna aceitável é o papel dela — ela **não
  /// autoriza nada**, e a listagem é filtrada no `WHERE` do servidor de
  /// qualquer modo. Ela existe só para a tela **não ficar muda** e não gastar o
  /// teto de 60/h pedindo uma página que a própria conta já explicava.
  ///
  /// **A ORDEM É A DO CLIENTE, e é a mesma de
  /// `motivoDeNaoAparecerNaListagem`**: perfil público, depois foto, depois
  /// apelido. Mandar a pessoa resolver três pendências de uma vez é pior do que
  /// mandar resolver a primeira.
  MotivoDeNaoAparecer? get motivoDeNaoAparecerNaListagem {
    if (!perfilPublicoLigado) return MotivoDeNaoAparecer.perfilPublicoDesligado;
    // `fotoUrl` é `Me.photo.url`, e o servidor só a preenche com a foto em
    // `ready` — então nulo aqui cobre junto "não tem foto", "ainda está
    // processando" e "foi recusada", que são os três estados em que a pessoa
    // não tem foto que sirva a quem olha.
    if (fotoUrl == null) return MotivoDeNaoAparecer.semFotoPronta;
    if (apelido == null) return MotivoDeNaoAparecer.semApelido;
    return null;
  }

  /// Apareceria numa listagem de pessoas?
  bool get apareceriaNaListagem => motivoDeNaoAparecerNaListagem == null;

  factory Usuario.doJson(Map<String, dynamic> json) {
    return Usuario(
      id: json['id'] as String,
      email: json['email'] as String,
      emailVerificado: json['email_verified'] as bool? ?? false,
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
      emailPendente: json['pending_email'] as String?,
      emailEntregavel: json['email_deliverable'] as bool? ?? true,
      nome: json['display_name'] as String?,
      pendencias: (json['pending_profile_fields'] as List<dynamic>? ??
              const <dynamic>[])
          .whereType<String>()
          .map(PendenciaDeCadastro.de)
          .whereType<PendenciaDeCadastro>()
          .toList(growable: false),
      podeAbrirCaso: json['can_open_lost_case'] as bool? ?? false,
      perfilPublicoLigado: json['public_profile_enabled'] as bool? ?? false,
      apelido: json['handle'] as String?,
      regiaoDeReferencia: RegiaoDeReferencia.doJson(
        json['reference_area'] as Map<String, dynamic>?,
      ),
      fotoUrl: urlDeImagem(
        json['photo'] is Map<String, dynamic>
            ? (json['photo'] as Map<String, dynamic>)['url']
            : null,
      ),
    );
  }
}

/// `#/components/schemas/SessionResponse` do contrato.
class Sessao {
  const Sessao({
    required this.accessToken,
    required this.refreshToken,
    required this.expiraEm,
    required this.usuario,
  });

  final String accessToken;
  final String refreshToken;

  /// Instante absoluto em que o access token deixa de valer.
  final DateTime expiraEm;

  final Usuario usuario;

  /// A MESMA sessao com outro usuario dentro.
  Sessao comUsuario(Usuario novo) => Sessao(
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiraEm: expiraEm,
        usuario: novo,
      );

  bool get expirado => DateTime.now().isAfter(expiraEm);

  /// Verdadeiro quando falta pouco para expirar.
  bool get quaseExpirado =>
      DateTime.now().isAfter(expiraEm.subtract(const Duration(minutes: 1)));

  factory Sessao.doJson(Map<String, dynamic> json) {
    final segundos = json['expires_in'] as int? ?? 900;
    return Sessao(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      expiraEm: DateTime.now().add(Duration(seconds: segundos)),
      usuario: Usuario.doJson(json['user'] as Map<String, dynamic>),
    );
  }
}
