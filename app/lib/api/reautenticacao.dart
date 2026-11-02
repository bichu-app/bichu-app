/// A reautenticacao por senha das operacoes destrutivas.
library;

/// `#/paths/~1auth~1reauth/post/requestBody/content/application~1json/schema/properties/scope`
/// do contrato: a finalidade UNICA de uma janela de reautenticacao.
///
/// ## Por que ANCORADO, e nao `/// Local:`
///
/// Esta lista e fechada na spec e o produto nao a inventa: sao as seis
/// operacoes que declaram `x-reauth-scope`. Classificar o enum como local
/// silenciaria o portao justamente onde o app e o servidor precisam concordar
/// palavra por palavra. Um escopo escrito errado nao quebra build nem teste:
/// ele responde 401 no aparelho de quem usa o app, e a frase que aparece e
/// *Confirme sua senha* num lugar onde a senha estava certa.
///
/// A troca de senha fica de fora de proposito, e a ausencia esta explicada no
/// contrato: `PUT /auth/password` ja confere a senha atual no proprio corpo,
/// entao exigir as duas coisas pediria a mesma senha duas vezes na mesma
/// requisicao. A divergencia contra a secao 7.5 de `docs/04-seguranca.md`, que
/// lista trocar senha entre as seis, esta registrada na BICHUS-48.
///
/// ## Por que o CODIGO DE FIO, e por que ele nao da para trocar por `name`
///
/// O portao de conformidade compara o primeiro literal de cada constante com a
/// lista do contrato. Enum ancorado do qual ele nao consegue extrair literal
/// nenhum reprova em `enum-sem-valores-lidos`, e com razao: comparar conjunto
/// vazio com o contrato aprova qualquer coisa. O `name` do Dart tambem nao
/// serviria de fio -- ele devolveria `exclusaoDaConta`, e o que viaja na
/// requisicao e `account_deletion`.
enum EscopoDeReautenticacao {
  /// `DELETE /v1/me` (`deleteMyAccount`).
  exclusaoDaConta('account_deletion'),

  /// `POST /v1/me/email-change` (`requestEmailChange`).
  trocaDeEmail('email_change'),

  /// `POST /v1/me/data-export` (`requestDataExport`).
  exportacaoDeDados('data_export'),

  /// O convite de transferencia de um pet (`startPetTransfer`).
  transferenciaDePet('pet_transfer'),

  /// A revogacao de uma plaquinha (`revokePetTag`).
  revogacaoDeTag('tag_revocation'),

  /// `POST /v1/auth/logout-all` (`logoutAllDevices`).
  revogacaoDeSessoes('session_revocation');

  const EscopoDeReautenticacao(this.valor);

  /// O valor que viaja no campo `scope` da requisicao.
  ///
  /// Quem monta o corpo LE daqui, e nunca reescreve o literal: o campo
  /// escrito a mao no codificador e o que faz o portao aprovar um app que
  /// manda `account-deletion` com hifen.
  final String valor;
}

/// `#/paths/~1auth~1reauth/post/responses/200/content/application~1json/schema`
/// do contrato: a janela destrutiva aberta.
///
/// Nao e estado de aplicacao e nao se guarda. O token e de **uso unico**, vale
/// cinco minutos, esta preso ao `jti` do token de acesso que o pediu, e cai
/// por logout e por troca de senha. Entao ele e pedido na hora, usado, e
/// descartado: uma folha que o guardasse para depois guardaria, na maioria das
/// vezes, um token que ja nao vale.
class JanelaDeReautenticacao {
  const JanelaDeReautenticacao({
    required this.token,
    required this.duracao,
    this.escopoConfirmado,
  });

  /// O valor do cabecalho `X-Reauth-Token` da operacao destrutiva.
  ///
  /// **Nunca vai para log, para relatorio nem para texto de erro.** E por isso
  /// que [toString] nao o imprime.
  final String token;

  /// Quanto tempo a janela vale, de `expires_in`.
  final Duration duracao;

  /// O escopo que o servidor confirmou, quando ele veio.
  ///
  /// Anulavel porque `scope` NAO esta na lista `required` da resposta 200 --
  /// ler campo opcional como obrigatorio e o defeito que nao aparece em teste
  /// e quebra na primeira resposta que vier sem ele.
  final String? escopoConfirmado;

  factory JanelaDeReautenticacao.doJson(Map<String, dynamic> json) {
    return JanelaDeReautenticacao(
      token: json['reauth_token'] as String,
      duracao: Duration(seconds: json['expires_in'] as int),
      escopoConfirmado: json['scope'] as String?,
    );
  }

  @override
  String toString() =>
      'JanelaDeReautenticacao(${duracao.inSeconds}s, escopo: $escopoConfirmado)';
}
