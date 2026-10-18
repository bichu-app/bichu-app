/// As rotas `tags: [me]` do contrato: os dados pessoais do tutor.
///
/// ===========================================================================
/// O QUE O CONTRATO DEIXA EDITAR, MEDIDO ANTES DE DESENHAR CAMPO
/// ===========================================================================
/// `PATCH /v1/me` (`updateMe`) recebe `#/components/schemas/MeUpdate`, e
/// `MeUpdate` tem **quatro coisas e mais nada**:
///
/// - `display_name`, `maxLength: 80`;
/// - `phone_e164`, `pattern: ^\+55\d{10,11}$`;
/// - `reference_area.postal_code`, `pattern: ^\d{5}-?\d{3}$`;
/// - `reference_area.neighborhood` / `city` (80 cada) e `state` (2).
///
/// Tudo o mais que `Me` devolve e **leitura**: `id`, `email`, `email_verified`,
/// `pending_email`, `email_deliverable`, `phone_verified`,
/// `pending_profile_fields`, `can_open_lost_case` e `created_at`. Um campo de
/// tela sobre qualquer um deles produziria 400 ou seria ignorado em silencio, e
/// as duas coisas sao pior que nao oferecer o campo.
///
/// ===========================================================================
/// O E-MAIL NAO E EDITAVEL POR AQUI, E NAO E ESQUECIMENTO
/// ===========================================================================
/// `MeUpdate` carrega a razao escrita no proprio contrato: *"**Nao aceita
/// `email`** (SEC-003): trocar o e-mail e operacao propria, assincrona, em
/// `POST /v1/me/email-change`. Aceitar aqui faria a resposta revelar se um
/// endereco ja tem conta."*
///
/// A rota propria existe, e **ela nao esta ao alcance deste app**:
/// `requestEmailChange` declara `bearerAuth` **mais** `reauth: []` com
/// `x-reauth-scope: email_change`, e o app nao tem reautenticacao. Medido em
/// 18/10/2026: nao ha nada em `app/lib/api` que chame `POST /auth/reauth`, nao
/// ha cabecalho `X-Reauth-Token` em `api_client.dart`, e `AuthApi` nao tem
/// metodo de reautenticacao -- a mesma ausencia que `tela_detalhe_do_pet.dart`
/// registrou para `revokePetTag`. Um botao `Trocar o e-mail` aqui receberia 401
/// `reauthentication-required` e morreria em silencio, que e exatamente a acao
/// sem destino que o criterio 2 da BICHUS-62 proibe.
///
/// Por isso **nao ha metodo de troca de e-mail neste arquivo**: a tela mostra o
/// endereco de leitura, com a situacao de confirmacao ao lado, e nao promete um
/// fluxo que nao existe. Quando a reautenticacao entrar, o metodo nasce aqui.
library;

import 'api_client.dart';
import 'envio_de_foto.dart';
import 'modelos.dart';
// **So `urlDeImagem`, e nao o modulo.** A funcao e a definicao UNICA de "URL
// de imagem que veio do contrato, ou nulo" -- ela trata campo ausente, tipo
// errado e string vazia como nulo, e o motivo esta escrito nela: a tela usa
// `Image.network`, e `Image.network('')` lanca. Uma segunda copia aqui
// divergiria da primeira na primeira edicao.
import 'modelos_diretorio.dart' show urlDeImagem;

/// O recorte de `#/components/schemas/Me` que o formulario de dados pessoais
/// edita, mais o que ele mostra de leitura.
///
/// **Existe ao lado de [Usuario] em vez de dentro dele**, e a razao e a trava
/// de `RegiaoDeReferencia.doJson`: ela devolve nulo quando nao ha bairro nem
/// cidade (`temAlgo`), porque quem a usa pre-preenche o bairro de F3.1 e um
/// objeto sem bairro nao pre-preenche nada. Para um formulario de edicao essa
/// trava apaga dado do servidor: um cadastro que tem so o CEP abriria a tela
/// com o CEP em branco, e salvar de novo mandaria `reference_area` vazia.
/// Aqui os campos vem crus, um por um, sem filtro nenhum.
class DadosPessoais {
  const DadosPessoais({
    required this.usuario,
    this.telefone,
    this.telefoneVerificado = false,
    this.cep,
    this.bairro,
    this.cidade,
    this.uf,
    this.fotoUrl,
    this.fotoProcessando = false,
  });

  /// O mesmo corpo lido como [Usuario], para repor na sessao.
  final Usuario usuario;

  /// `phone_e164`, na forma do contrato (`+5511987654321`). Nulo quando a
  /// conta nao tem telefone.
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
  ///
  /// **Esta e a unica resposta do contrato que traz esta foto, e quem a ve e o
  /// dono.** `getMe` exige `bearerAuth` sem alternativa vazia. Nenhuma
  /// listagem, nenhuma superficie publica, nenhuma resposta de terceiro: a
  /// decisao registrada (ADR-0025 item 2, "nem slug, nem avatar") proibe
  /// avatar para terceiros e o cliente nao liberou o contrario. **Nenhuma
  /// outra tela deste app desenha este campo.**
  ///
  /// Nulo em quatro casos, e todos sao normais: conta sem foto, `processing`
  /// (o worker nao terminou), `rejected` (recusada nos bytes) e campo ausente
  /// -- o APK publicado le esta resposta e nao conhece `photo`.
  final String? fotoUrl;

  /// `Me.photo.status == 'processing'`: a foto subiu e a derivada ainda nao
  /// existe. **Nao e erro**, e e por isso que esta separado de [fotoUrl] ser
  /// nulo: aqui havera foto, e dentro de instantes.
  final bool fotoProcessando;

  factory DadosPessoais.doJson(Map<String, dynamic> json) {
    final regiao = json['reference_area'] as Map<String, dynamic>?;
    // `photo` e `oneOf: [MyPhoto, null]`, e `as Map?` cru sobre outro tipo
    // estoura em tempo de execucao. O recorte por `is` trata ausente, nulo e
    // tipo errado do mesmo jeito: sem foto.
    final foto = json['photo'];
    final dadosDaFoto = foto is Map<String, dynamic> ? foto : null;
    return DadosPessoais(
      usuario: Usuario.doJson(json),
      telefone: json['phone_e164'] as String?,
      telefoneVerificado: json['phone_verified'] as bool? ?? false,
      cep: regiao?['postal_code'] as String?,
      bairro: regiao?['neighborhood'] as String?,
      cidade: regiao?['city'] as String?,
      uf: regiao?['state'] as String?,
      fotoUrl: urlDeImagem(dadosDaFoto?['url']),
      fotoProcessando: dadosDaFoto?['status'] == 'processing',
    );
  }
}

class MeApi implements IntencaoEGravacaoDaFotoDoUsuario {
  const MeApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me` (`getMe`).
  Future<DadosPessoais> meusDados() async {
    final json = await _api.get('/me');
    return DadosPessoais.doJson(json);
  }

  /// `PATCH /v1/me` (`updateMe`), com **so** o que mudou.
  ///
  /// Cada parametro nulo **nao vai no corpo**, e a diferenca nao e estetica:
  /// `MeUpdate` nao tem campo obrigatorio, entao um corpo que mandasse os
  /// quatro campos sempre sobrescreveria com vazio o que a pessoa nao abriu.
  /// Mandar so o que mudou e o que torna este PATCH um patch.
  ///
  /// [telefone] tem de vir **em E.164** (`+5511987654321`). Quem converte e
  /// `formato/telefone.dart`, e esta camada nao adivinha: um valor com mascara
  /// chegando aqui e um 400 do servidor, e e assim que ele deve aparecer.
  Future<DadosPessoais> atualizar({
    String? nome,
    String? telefone,
    String? cep,
    String? bairro,
    String? cidade,
    String? uf,
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
        'phone_e164': ?telefone,
        if (regiao.isNotEmpty) 'reference_area': regiao,
      },
    );
    return DadosPessoais.doJson(json);
  }

  /// `POST /v1/media/my-photo-intents` (`createMyPhotoUploadIntent`).
  ///
  /// **Sem `purpose` no corpo, e isso e do contrato**: `MyPhotoIntentInput`
  /// existe para um proposito so (`user_photo`) e nao deixa o cliente
  /// escolhe-lo -- deixar escolher seria deixar o app pedir uma autorizacao de
  /// imagem de produto por uma rota de perfil.
  ///
  /// O teto de 5 MB vale no SERVIDOR e dentro da politica assinada; a porta
  /// `fotoLocalDoArquivo` tambem o cobra no aparelho, para nao gastar uma ida
  /// e volta com o que o balde vai recusar. **A tela diz o numero, a tela nao
  /// e a regra.**
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

  /// `PATCH /v1/me` com **so** `photo_upload_id` (`MeUpdate`).
  ///
  /// E esta chamada que amarra a foto a conta: os bytes no armazenamento sem
  /// ela ficam orfaos, e a intencao que ninguem confirma vence em dez minutos
  /// e o varredor a recolhe.
  ///
  /// **Devolve o corpo CRU de `/me`, e nao [DadosPessoais]**, porque quem a
  /// chama e o mecanismo de envio (`FotoDoUsuario`), que vive em
  /// `api/envio_de_foto.dart` e nao conhece este modelo. Quem precisa do
  /// modelo chama `DadosPessoais.doJson` -- e com isso a tela nao faz uma
  /// segunda leitura de `/me` so para descobrir a URL da derivada.
  ///
  /// **So grava, nunca tira.** `MeUpdate.photo_upload_id` aceita `null` para
  /// REMOVER a foto, e esse caminho nao esta aqui: o cliente pediu o cadastro
  /// da foto, e um metodo de remover sem tela que o chame seria superficie sem
  /// pedido.
  @override
  Future<Map<String, dynamic>> gravarFotoDoUsuario(String uploadId) {
    return _api.patch(
      '/me',
      corpo: <String, dynamic>{'photo_upload_id': uploadId},
    );
  }
}
