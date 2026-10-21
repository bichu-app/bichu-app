/// Os modelos que a camada de acesso devolve.
///
/// Sao recortes do `components/schemas` de `api/openapi.yaml`, com os campos
/// que as telas desta entrega usam. O contrato e entrada, nao sugestao: campo
/// que nao esta la nao aparece aqui.
library;

// **So `urlDeImagem`, e nao o modulo.** A funcao e a definicao UNICA de
// "URL de imagem que veio do contrato, ou nulo" neste app: campo ausente,
// nulo, de outro tipo e string vazia caem todos no mesmo nulo, e
// `Image.network('')` lanca. `me_api.dart` a importa do mesmo jeito.
import 'modelos_diretorio.dart' show urlDeImagem;

/// `#/components/schemas/Me/properties/pending_profile_fields/items` do contrato.
///
/// O que o contrato chama de `pending_profile_fields`: o que alimenta o aviso
/// persistente de cadastro incompleto.
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
///
/// Os quatro campos sao anulaveis no contrato, inclusive quando o objeto
/// existe. Ela e a fonte honesta do bairro ja preenchido em F3.1 (criterio 2
/// da BICHUS-21): **coordenada nao vira nome de bairro**, porque nao ha
/// geocodificacao no MVP (ADR-0006), e o que a pessoa cadastrou e a unica
/// regiao que o produto sabe escrever.
///
/// **Nao ha coordenada aqui, e nao ha de haver.** O servidor guarda o ponto de
/// referencia numa coluna geografica propria (BICHUS-92) que nao sai em
/// resposta nenhuma, e ha portao de contrato que reprova quando
/// `reference_point` aparece em qualquer corpo.
class RegiaoDeReferencia {
  const RegiaoDeReferencia({this.bairro, this.cidade, this.uf, this.cep});

  final String? bairro;
  final String? cidade;
  final String? uf;
  final String? cep;

  /// Verdadeiro quando ha algo a preencher. Um objeto com os campos nulos
  /// existe no contrato e nao serve para preencher nada.
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

/// `#/components/schemas/Me` do contrato.
class Usuario {
  const Usuario({
    required this.id,
    required this.email,
    required this.emailVerificado,
    required this.pendencias,
    required this.podeAbrirCaso,
    this.nome,
    this.emailPendente,
    this.emailEntregavel = true,
    this.regiaoDeReferencia,
    this.fotoUrl,
  });

  final String id;
  final String email;
  final bool emailVerificado;

  /// Endereco novo aguardando confirmacao, quando ha troca em curso.
  final String? emailPendente;

  /// Falso apos devolucao definitiva do provedor. Sem isto, o tutor de e-mail
  /// invalido nunca descobre que ninguem consegue avisa-lo.
  final bool emailEntregavel;

  final String? nome;
  final List<PendenciaDeCadastro> pendencias;

  /// Falso quando nenhum canal de contato esta verificado. E o que bloqueia
  /// marcar um pet como perdido.
  final bool podeAbrirCaso;

  /// A regiao cadastrada pelo tutor, quando ha uma. E o que preenche o bairro
  /// em F3.1 sem geocodificar nada (criterio 2 da BICHUS-21).
  final RegiaoDeReferencia? regiaoDeReferencia;

  /// `Me.photo.url`: a foto que a PROPRIA pessoa cadastrou, ou nulo.
  ///
  /// ## Por que ela passou a ser lida AQUI, e nao so em `Meus dados`
  ///
  /// `DadosPessoais` (em `me_api.dart`) ja lia este campo, e so a tela de
  /// `Meus dados` o desenhava. Mas `SessionResponse.user` aponta para o MESMO
  /// schema `Me` -- entao a foto **sempre viajou** em `registerUser`, `login`,
  /// `refreshSession` e `confirmEmailVerification`, e este modelo a descartava.
  /// O avatar da barra de topo e desenhado em toda tela de secao, por quem le
  /// a SESSAO e nao `GET /me`: sem este campo, ele nao tinha de onde tirar a
  /// foto e mostrava o circulo com a inicial para quem tem foto cadastrada --
  /// que e o defeito que o cliente mediu em 20/10/2026.
  ///
  /// **Nao e campo novo de contrato.** Ele esta declarado em `Me.photo` desde
  /// 18/10, e o que faltava era o app lê-lo.
  ///
  /// ## E a derivada `card` (512 x 512), porque e a UNICA que o contrato da
  ///
  /// `MyPhoto` tem tres propriedades -- `status`, `url` e `rejection_reason` --
  /// e `url` e descrita por extenso como *"a derivada `card` (512 x 512,
  /// JPEG)"*. **Nao existe `thumb_url` em `MyPhoto`**: a `thumb` de 176 px
  /// aparece no contrato so em `Conversation.participants[].photo_icon_url`, a
  /// foto de OUTRA pessoa entre conexoes aceitas. Montar a URL da `thumb` aqui
  /// a partir da `card` seria o cliente derivando chave de armazenamento, e
  /// isso nao esta prometido em lugar nenhum.
  ///
  /// Quem pinta paga `cacheWidth` pela largura PINTADA (`ImagemDaRede`), entao
  /// o custo em MEMORIA e o do circulo de 32 dp e nao o dos 512 px.
  ///
  /// ## Nulo e o estado normal, em quatro casos
  ///
  /// Conta sem foto, `processing` (o worker nao terminou), `rejected` (recusada
  /// nos bytes) e campo ausente -- o APK publicado le esta resposta e nao
  /// conhece `photo`. **Os quatro desenham a marca neutra**, e a barra de topo
  /// nao distingue entre eles: `status` e `rejection_reason` sao assunto de
  /// `Meus dados`, que e a tela que tem o que consertar.
  final String? fotoUrl;

  bool get cadastroIncompleto => pendencias.isNotEmpty;

  factory Usuario.doJson(Map<String, dynamic> json) {
    return Usuario(
      id: json['id'] as String,
      email: json['email'] as String,
      emailVerificado: json['email_verified'] as bool? ?? false,
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
      regiaoDeReferencia: RegiaoDeReferencia.doJson(
        json['reference_area'] as Map<String, dynamic>?,
      ),
      // `photo` e `oneOf: [MyPhoto, null]`, e um `as Map?` cru sobre outro
      // tipo estoura em tempo de execucao -- aqui isso derrubaria o LOGIN, que
      // e por onde este corpo passa. O recorte por `is` trata ausente, nulo e
      // tipo errado do mesmo jeito: sem foto. `urlDeImagem` trata o resto
      // (vazio, nao-string).
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
  ///
  /// O contrato manda `expires_in` em segundos; guardar o instante e nao a
  /// duracao e o que faz a sessao continuar correta depois de o app ficar
  /// horas suspenso em segundo plano.
  final DateTime expiraEm;

  final Usuario usuario;

  /// A MESMA sessao com outro usuario dentro.
  ///
  /// Existe para `PATCH /me`: o corpo da resposta e um `Me` completo e novo, e
  /// os tokens nao mudam. Sem isto, salvar os dados pessoais atualizaria a tela
  /// do formulario e deixaria o `Perfil` atras dela dizendo que falta o
  /// telefone que acabou de ser preenchido. **Nao recria token nenhum**: um
  /// `Sessao.doJson` sobre a resposta de `/me` nao teria tokens para ler.
  Sessao comUsuario(Usuario novo) => Sessao(
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiraEm: expiraEm,
        usuario: novo,
      );

  bool get expirado => DateTime.now().isAfter(expiraEm);

  /// Verdadeiro quando falta pouco para expirar. Renovar antes evita que a
  /// sessao caia no meio de uma acao.
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
