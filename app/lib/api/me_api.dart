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
// `EnderecoDeEntrega` mora com os modelos do pet porque nasceu no PEDIDO da
// plaquinha. O endereco guardado na conta e o MESMO endereco (os nove campos
// sao os mesmos, e o contrato usa um `DeliveryAddress` so), entao esta classe
// o importa de la em vez de declarar a segunda redacao dele.
import 'modelos_pet.dart' show EnderecoDeEntrega;

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
  ///
  /// **Ele volta so em `GET /v1/me` e `PATCH /v1/me`**, as duas sobre quem
  /// esta autenticado -- nao ha rota que o devolva para outra pessoa nesta
  /// fatia (plano 4-C: o apelido nao aparece para terceiros antes da fatia E).
  /// A tela de `Meus dados` precisa dele para mostrar o apelido atual: campo
  /// que nao volta e campo que a tela abre vazio e sobrescreve.
  ///
  /// Nulo e um estado legitimo e permanente: nenhum fluxo obriga a escolher.
  final String? apelido;

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

  /// `Me.photo.status == 'rejected'`: o worker leu os bytes e NAO aceitou a
  /// imagem.
  ///
  /// **Separado de [fotoUrl] ser nulo e de [fotoProcessando]** porque os
  /// quatro estados de `Me.photo` levam a telas diferentes, e junta-los e o que
  /// fazia a recusa parecer "conta sem foto": sem foto nao tem o que
  /// consertar, recusada tem, e o que consertar esta em
  /// [motivoDaRecusaDaFoto].
  final bool fotoRecusada;

  /// `Me.photo.rejection_reason`: o motivo, **em portugues e pronto do
  /// servidor**.
  ///
  /// Medido contra a homologacao em 19/10/2026 com um JPEG quebrado de 336
  /// bytes: *"Nao conseguimos ler essa imagem. Ela pode ter chegado
  /// incompleta."*. A tela desenha ESTE texto e nao um generico -- um
  /// "nao deu" nao diz a ninguem que o arquivo chegou truncado.
  final String? motivoDaRecusaDaFoto;

  factory DadosPessoais.doJson(Map<String, dynamic> json) {
    final regiao = json['reference_area'] as Map<String, dynamic>?;
    // `photo` e `oneOf: [MyPhoto, null]`, e `as Map?` cru sobre outro tipo
    // estoura em tempo de execucao. O recorte por `is` trata ausente, nulo e
    // tipo errado do mesmo jeito: sem foto.
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
    /// O apelido (`@`) **normalizado**, ou `null` para nao mexer.
    ///
    /// **Nao existe caminho para APAGAR o apelido**, e a ausencia dessa porta e
    /// a regra: `Handle` nao e `nullable` no contrato, e soltar um apelido de
    /// volta ao pool e o furo do plano 4-C.7 -- quem o pegasse herdaria o que a
    /// vizinhanca associava a quem o tinha. Trocar e permitido (1 vez a cada 60
    /// dias, conferido no servidor); abandonar nao e.
    String? apelido,
    String? telefone,
    String? cep,
    String? bairro,
    String? cidade,
    String? uf,

    /// O `upload_id` de uma foto cujos BYTES JA SUBIRAM, ou `null` para nao
    /// mexer na foto.
    ///
    /// **E aqui que a foto e confirmada desde 19/10/2026**, e nao em
    /// [gravarFotoDoUsuario]: o cliente pediu que escolher a foto ja a
    /// enviasse e que o `Salvar` do formulario a guardasse. Confirmar no mesmo
    /// PATCH do nome tem uma consequencia que importa e que nao e estetica: o
    /// servidor recusa o cadastro sem nome, e enquanto a foto vinha num PATCH
    /// PROPRIO a recusa do nome e a gravacao da foto eram **dois atos em
    /// transacoes diferentes**. Um corpo so e uma decisao so.
    ///
    /// **Nunca `null` para REMOVER.** `MeUpdate.photo_upload_id` aceita nulo
    /// como "tire a foto", e e por isso que o campo sai do corpo quando este
    /// parametro e nulo (`?fotoUpload`) em vez de ir como `null`: um `null`
    /// explicito apagaria a foto de quem so corrigiu o telefone.
    String? fotoUpload,
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
        if (regiao.isNotEmpty) 'reference_area': regiao,
      },
    );
    return DadosPessoais.doJson(json);
  }

  /// `GET /v1/me/delivery-address` (`getMyDeliveryAddress`), ou `null`.
  ///
  /// **O endereco de entrega GUARDADO NA CONTA**, autorizado pelo cliente em
  /// 21/10/2026: *"um endereco de entrega salvo na conta, reusado em todo
  /// pedido e editavel num lugar so"*. E dele que o formulario da plaquinha
  /// nasce preenchido.
  ///
  /// **`null` nao e erro e nao e falha de rede.** E o estado normal de quem
  /// nunca guardou endereco, e e o estado de toda conta antes de alguem abrir a
  /// tela de `Endereco de entrega`. Quem chama trata `null` como "o formulario
  /// abre vazio, como antes".
  ///
  /// ## A COSTURA DO CORPO `null`, que nao e obvia
  ///
  /// O contrato declara a resposta como `MyDeliveryAddress`, que e
  /// `DeliveryAddress` **ou `null`** -- e `null` no corpo e um `null` cru, e nao
  /// um objeto vazio. `ApiClient._lerResposta` devolve `Map<String, dynamic>`
  /// sempre, e o que ele faz com um JSON que nao e objeto e embrulhar:
  /// `jsonDecode('null')` vira `{'data': null}`.
  ///
  /// Entao os dois desfechos chegam aqui com formas diferentes, e e esta funcao
  /// que os separa. Ler `json['recipient_name']` direto daria uma cadeia vazia
  /// no caso `null`, e o formulario abriria com nove campos preenchidos de nada
  /// -- pior que abrir vazio, porque a pessoa teria de limpar antes de digitar.
  Future<EnderecoDeEntrega?> lerEnderecoGuardado() async {
    final json = await _api.get('/me/delivery-address');
    // 204 ou corpo vazio: nao acontece nesta rota, mas o mesmo tratamento do
    // `null` serve, e um `if` a mais e mais barato que um campo vazio na tela.
    if (json.isEmpty) return null;
    // O corpo era `null` cru. Ver a secao acima.
    if (json.length == 1 && json.containsKey('data') && json['data'] == null) {
      return null;
    }
    return EnderecoDeEntrega.doJson(json);
  }

  /// `PUT /v1/me/delivery-address` (`putMyDeliveryAddress`).
  ///
  /// **O UNICO caminho do app que escreve o endereco guardado.** O pedido da
  /// plaquinha (`PetsApi.solicitarPlaquinha`) **nao** escreve aqui: editar o
  /// endereco dentro do pedido muda aquele pedido e nao mexe no que esta
  /// guardado. Mudar o guardado em silencio, a partir de um formulario de
  /// pedido, e a classe de defeito que so aparece meses depois -- quando a
  /// plaquinha chega no endereco de antes.
  ///
  /// **O endereco inteiro vai junto**, e nao campo a campo: o contrato declara
  /// `PUT` com `DeliveryAddress` obrigatorio. Trocar de casa troca os nove
  /// campos de uma vez, e uma escrita parcial deixaria a conta numa mistura de
  /// duas casas -- rua nova com bairro antigo chega no lugar errado sem nada ter
  /// dado erro.
  ///
  /// Devolve o endereco **como ficou guardado**, ja normalizado pelo servidor
  /// (CEP sem mascara, UF em maiuscula, bordas sem espaco), e nao o que foi
  /// enviado: a tela mostra o que esta no banco.
  Future<EnderecoDeEntrega> salvarEnderecoGuardado(EnderecoDeEntrega endereco) async {
    final json = await _api.put('/me/delivery-address', corpo: endereco.paraJson());
    // `doJson` nunca devolve nulo aqui: o `PUT` sempre responde o endereco. O
    // `!` e sobre o tipo e nao sobre uma suposicao de rede -- corpo que nao
    // seja objeto ja teria estourado em `_lerResposta`.
    return EnderecoDeEntrega.doJson(json)!;
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
}
