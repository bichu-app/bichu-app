import 'api_client.dart';
import 'auth_api.dart';
import 'modelos.dart';
import 'modelos_passkey.dart';

/// As operacoes de `/v1/auth/passkey` do contrato (BICHUS-301).
///
/// **Cinco das seis operacoes do contrato estao aqui.** `revokePasskey` ficou
/// de fora porque ela serve uma tela de gerenciar aparelhos, que nao existe --
/// e codigo sem chamador nao e medido por nada.
///
/// `listPasskeys` entrou em 28/10/2026, e **com chamador**:
/// `FiacaoDoPasskey.reconciliarComAConta` a usa depois de uma entrada por
/// senha, para descobrir que esta conta tem credencial ativa num aparelho onde
/// o app ainda nao marcou nada -- o caso da credencial que chegou por
/// SINCRONIZACAO, por reinstalacao ou por restauracao de backup. Sem ela, o
/// portao de `tentarEntrar` ficaria fechado para sempre nesses aparelhos.
///
/// **A passkey SOMA a senha, nunca a substitui.** `entrar`, `renovar` e
/// `reautenticar` continuam existindo em `AuthApi` sem mudanca nenhuma, e e
/// isso que impede a troca de celular de trancar a pessoa fora da conta:
/// passkey e presa ao aparelho.
///
/// **Nenhuma destas operacoes leva `Idempotency-Key`**, pelo mesmo motivo de
/// `AuthApi`: desafio tem prazo e e de uso unico, entao repetir um pedido
/// velho sozinho, sem a pessoa presente, nao termina nada -- gasta o desafio
/// no vazio.
class PasskeysApi {
  const PasskeysApi(this._api);

  final ApiClient _api;

  /// `POST /auth/passkey/registration/options`.
  ///
  /// **EXIGE SESSAO**, e e por isso que nao recebe parametro nenhum: a conta e
  /// o `sub` do token. O `user.id` nao vai no corpo de proposito -- pedir o
  /// identificador abriria caminho para emitir desafio para conta alheia.
  ///
  /// Acontece ao FIM do cadastro, quando `criarConta` ja devolveu o par de
  /// tokens e `ControladorDeSessao.abrir` ja os guardou.
  Future<OpcoesDeCadastroDePasskey> comecarCadastro() async {
    final json = await _api.post('/auth/passkey/registration/options');
    return OpcoesDeCadastroDePasskey.doJson(json);
  }

  /// `POST /auth/passkey/registration`.
  ///
  /// Devolve a credencial ativa recem-criada. O servidor verifica a assinatura
  /// da atestacao, o desafio guardado, o `type`, a `origin` e o `rpIdHash`
  /// antes de guardar a chave publica -- nada disso e opcional e nada disso e
  /// trabalho do app.
  Future<Passkey> concluirCadastro(
    CredencialCadastrada credencial, {
    String? rotulo,
  }) async {
    final json = await _api.post(
      '/auth/passkey/registration',
      corpo: credencial.paraOContrato(rotulo: rotulo),
    );
    return Passkey.doJson(json);
  }

  /// `POST /auth/passkey/authentication/options`.
  ///
  /// **NAO RECEBE E-MAIL, e isso e desenho e nao esquecimento.** Receber o
  /// e-mail obrigaria a devolver `allowCredentials` daquela conta, e
  /// `allowCredentials` cheia ou vazia responderia *"esta conta tem
  /// passkey?"* numa porta sem autenticacao -- um oraculo de enumeracao pior
  /// que o de `login`, porque nem exige tentativa.
  ///
  /// `exigeToken: false` **por definicao**: e a porta de entrada, e quem a
  /// atravessa ainda nao tem sessao. O contrato declara `security: []`.
  Future<OpcoesDeEntradaPorPasskey> comecarEntrada() async {
    final json = await _api.post(
      '/auth/passkey/authentication/options',
      exigeToken: false,
    );
    return OpcoesDeEntradaPorPasskey.doJson(json);
  }

  /// `POST /auth/passkey/authentication`.
  ///
  /// A resposta e a **mesma** `SessionResponse` de `login`: para o resto do
  /// app, entrar por passkey e entrar, e quem recebe isto e o mesmo
  /// `ControladorDeSessao.abrir`.
  ///
  /// O 401 e **identico** para credencial desconhecida, revogada, assinatura
  /// errada e contador repetido. A tela nao pode inventar a distincao que a
  /// porta se recusa a fazer.
  Future<Sessao> concluirEntrada(
    CredencialAssinada credencial, {
    bool continuarConectado = AuthApi.sessaoPersistentePorPadrao,
  }) async {
    final json = await _api.post(
      '/auth/passkey/authentication',
      exigeToken: false,
      corpo: credencial.paraOContrato(
        continuarConectado: continuarConectado,
      ),
    );
    return Sessao.doJson(json);
  }

  /// `GET /auth/passkeys`. **EXIGE SESSAO.**
  ///
  /// As credenciais **ativas** da conta do token, mais recente primeiro.
  /// Revogadas nao aparecem -- elas continuam na base (nada e apagado, decisao
  /// do cliente de 26/10) e nao servem a nenhuma tela.
  ///
  /// **Nao e oraculo de enumeracao**, ao contrario do que `allowCredentials`
  /// em `comecarEntrada` seria: aqui ha `Bearer`, e a resposta e sobre a conta
  /// de quem pergunta. A operacao tambem nao devolve chave publica nem
  /// `credential_id` cru -- nada que sirva para montar uma assercao.
  ///
  /// Quem chama e `FiacaoDoPasskey.reconciliarComAConta`, que so olha se a
  /// lista esta VAZIA ou nao.
  Future<List<Passkey>> listar() async {
    final json = await _api.get('/auth/passkeys');
    final itens = json['items'];
    if (itens is! List) return const <Passkey>[];
    return itens
        .whereType<Map<String, dynamic>>()
        .map(Passkey.doJson)
        .toList();
  }
}
