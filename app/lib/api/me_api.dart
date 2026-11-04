/// As rotas `tags: [me]` do contrato: os dados pessoais do tutor.
library;

import 'api_client.dart';
import 'envio_de_foto.dart';
import 'modelos.dart';
import 'modelos_diretorio.dart' show urlDeImagem;
import 'modelos_pet.dart' show EnderecoDeEntrega;

/// O recorte de `#/components/schemas/Me` que o formulario de dados pessoais
/// edita, mais o que ele mostra de leitura.
class DadosPessoais {
  const DadosPessoais({
    required this.usuario,
    this.apelido,
    this.telefone,
    this.telefoneVerificado = false,
    this.cep,
    this.bairro,
    this.cidade,
    this.uf,
    this.fotoUrl,
    this.fotoProcessando = false,
    this.fotoRecusada = false,
    this.motivoDaRecusaDaFoto,
  });

  /// O mesmo corpo lido como [Usuario], para repor na sessao.
  final Usuario usuario;

  /// `handle`: o apelido (`@`) da PROPRIA conta, ou nulo quando ela nao
  /// escolheu nenhum.
  final String? apelido;

  /// `phone_e164`, na forma do contrato (`+5511987654321`).
  final String? telefone;

  /// `phone_verified`. **Leitura**: nao ha rota de verificacao de telefone no
  /// contrato, e a tela nao oferece uma.
  final bool telefoneVerificado;

  final String? cep;
  final String? bairro;
  final String? cidade;
  final String? uf;

  /// `Me.photo.url`: a URL da **derivada** `card` (512 x 512) da foto que a
  /// propria pessoa cadastrou, ou nulo.
  final String? fotoUrl;

  /// `Me.photo.status == 'processing'`: a foto subiu e a derivada ainda nao
  /// existe.
  final bool fotoProcessando;

  /// `Me.photo.status == 'rejected'`: o worker leu os bytes e NAO aceitou a
  /// imagem.
  final bool fotoRecusada;

  /// `Me.photo.rejection_reason`: o motivo, **em portugues e pronto do
  /// servidor**.
  final String? motivoDaRecusaDaFoto;

  factory DadosPessoais.doJson(Map<String, dynamic> json) {
    final regiao = json['reference_area'] as Map<String, dynamic>?;
    final foto = json['photo'];
    final dadosDaFoto = foto is Map<String, dynamic> ? foto : null;
    return DadosPessoais(
      usuario: Usuario.doJson(json),
      apelido: json['handle'] as String?,
      telefone: json['phone_e164'] as String?,
      telefoneVerificado: json['phone_verified'] as bool? ?? false,
      cep: regiao?['postal_code'] as String?,
      bairro: regiao?['neighborhood'] as String?,
      cidade: regiao?['city'] as String?,
      uf: regiao?['state'] as String?,
      fotoUrl: urlDeImagem(dadosDaFoto?['url']),
      fotoProcessando: dadosDaFoto?['status'] == 'processing',
      fotoRecusada: dadosDaFoto?['status'] == 'rejected',
      motivoDaRecusaDaFoto: dadosDaFoto?['rejection_reason'] as String?,
    );
  }
}

class MeApi implements IntencaoDeFotoDoUsuario {
  const MeApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me` (`getMe`).
  Future<DadosPessoais> meusDados() async {
    final json = await _api.get('/me');
    return DadosPessoais.doJson(json);
  }

  /// `PATCH /v1/me` (`updateMe`), com **so** o que mudou.
  Future<DadosPessoais> atualizar({
    String? nome,
    /// O apelido (`@`) **normalizado**, ou `null` para nao mexer.
    String? apelido,
    String? telefone,
    String? cep,
    String? bairro,
    String? cidade,
    String? uf,

    /// O `upload_id` de uma foto cujos BYTES JA SUBIRAM, ou `null` para nao
    /// mexer na foto.
    String? fotoUpload,

    /// `public_profile_enabled`: **o perfil público** (cliente, 02/11/2026), ou
    /// `null` para **não mexer**.
    ///
    /// **`false` DESLIGA, e não é o mesmo que `null`** — é por isso que ele
    /// entra no corpo com `?` (omite só quando é nulo) e não com um
    /// `if (… == true)`, que tornaria desligar impossível.
    ///
    /// **Ligar sem apelido o servidor RECUSA com 400**, nomeando o campo
    /// (`CHECK users_perfil_publico_exige_apelido` é a garantia; a recusa do
    /// servidor é a mensagem). Quem chamar isto precisa tratar a recusa.
    bool? perfilPublico,
  }) async {
    final regiao = <String, dynamic>{
      'postal_code': ?cep,
      'neighborhood': ?bairro,
      'city': ?cidade,
      'state': ?uf,
    };
    final json = await _api.patch(
      '/me',
      corpo: <String, dynamic>{
        'display_name': ?nome,
        'handle': ?apelido,
        'phone_e164': ?telefone,
        'photo_upload_id': ?fotoUpload,
        'public_profile_enabled': ?perfilPublico,
        if (regiao.isNotEmpty) 'reference_area': regiao,
      },
    );
    return DadosPessoais.doJson(json);
  }

  /// `GET /v1/me/delivery-address` (`getMyDeliveryAddress`), ou `null`.
  Future<EnderecoDeEntrega?> lerEnderecoGuardado() async {
    final json = await _api.get('/me/delivery-address');
    if (json.isEmpty) return null;
    if (json.length == 1 && json.containsKey('data') && json['data'] == null) {
      return null;
    }
    return EnderecoDeEntrega.doJson(json);
  }

  /// `PUT /v1/me/delivery-address` (`putMyDeliveryAddress`).
  Future<EnderecoDeEntrega> salvarEnderecoGuardado(EnderecoDeEntrega endereco) async {
    final json = await _api.put('/me/delivery-address', corpo: endereco.paraJson());
    return EnderecoDeEntrega.doJson(json)!;
  }

  /// `DELETE /v1/me` (`deleteMyAccount`): o pedido de exclusao da conta da
  /// LGPD, art. 18.
  ///
  /// **A ROTA NAO TEM CORPO, e a ausencia e de desenho**: a senha vai para
  /// `POST /v1/auth/reauth`, que devolve o `reauth_token`, e so o cabecalho
  /// chega aqui. O contrato diz por que: concentrar a verificacao num endpoint
  /// so poe a senha num lugar, o limite de forca bruta num lugar, e evita
  /// `DELETE` com corpo, que proxy e biblioteca tratam de formas diferentes.
  ///
  /// **`security` E `bearerAuth` MAIS `reauth`**, no escopo
  /// `account_deletion`. Por isso [tokenDeReautenticacao] e OBRIGATORIO: sem
  /// ele o servidor responde `401` com `reauthentication-required`, e um
  /// parametro opcional aqui seria uma falha desenhada. O token e de uso
  /// unico, vale 5 minutos, e um token de OUTRO escopo tambem responde `401` --
  /// nao `403` --, porque a janela daquela finalidade simplesmente nao foi
  /// aberta.
  ///
  /// **Responde `202`, e nao `200`**: o que o servidor aceita e o PEDIDO. Pelo
  /// contrato, a exclusao logica e imediata, o expurgo definitivo acontece em
  /// 30 dias, os casos em aberto sao encerrados e as tags, revogadas. Nada
  /// disso e do app: o servidor agenda, encerra e revoga.
  ///
  /// O teto e de **3 pedidos por 24 h** por conta, com `deny_429` -- recusa de
  /// verdade, entao a quarta tentativa volta como falha de limite.
  Future<void> excluirMinhaConta({required String tokenDeReautenticacao}) async {
    await _api.delete('/me', tokenDeReautenticacao: tokenDeReautenticacao);
  }

  /// `POST /v1/media/my-photo-intents` (`createMyPhotoUploadIntent`).
  @override
  Future<Map<String, dynamic>> intencaoDeFotoDoUsuario({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _api.post(
      '/media/my-photo-intents',
      corpo: <String, dynamic>{
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }
}
