/// Os modelos de passkey do contrato (BICHUS-301).
///
/// **Tudo que e binario aqui e base64url SEM preenchimento (`=`)**, e isso nao
/// e detalhe de serializacao: e a regra que o WebAuthn impoe e que o
/// `PasskeyRegistrationOptions` do contrato repete por escrito. Base64 comum
/// entra silenciosamente errado no `challenge`, o aparelho assina o valor
/// errado, e a atestacao reprova **no servidor** -- longe daqui, com uma
/// mensagem que nao aponta para este arquivo. Por isso nenhuma funcao deste
/// arquivo decodifica ou recodifica nada: os textos atravessam o app como
/// vieram do servidor e voltam como vieram do aparelho.
///
/// **A fronteira de nomes mora aqui.** O contrato fala `snake_case`
/// (`client_data_json`, `pub_key_cred_params`) e o pacote de plataforma fala
/// `camelCase` (`clientDataJSON`, `pubKeyCredParams`). As duas gramaticas
/// descrevem o mesmo objeto do WebAuthn, e e exatamente por serem parecidas
/// que trocar uma pela outra nao quebra a compilacao -- apaga um campo em
/// silencio. Este arquivo e o unico lugar do app em que as duas se encostam.
library;

/// Um algoritmo de chave publica aceito, em COSE.
///
/// A lista e **fechada no servidor** (`-7` e `-257`) e o app so a repassa. Ela
/// nao e herdada do que o aparelho oferecer: autenticador que proponha outra
/// curva nao e atendido, porque a verificacao do outro lado tambem conhece
/// so esses dois.
class AlgoritmoDeChave {
  const AlgoritmoDeChave({required this.tipo, required this.alg});

  final String tipo;
  final int alg;

  factory AlgoritmoDeChave.doJson(Map<String, dynamic> json) =>
      AlgoritmoDeChave(
        tipo: json['type'] as String,
        alg: json['alg'] as int,
      );
}

/// Uma credencial apontada por `exclude_credentials` ou `allow_credentials`.
class DescritorDeCredencial {
  const DescritorDeCredencial({required this.tipo, required this.id});

  final String tipo;

  /// O `credential_id`, base64url.
  final String id;

  factory DescritorDeCredencial.doJson(Map<String, dynamic> json) =>
      DescritorDeCredencial(
        tipo: json['type'] as String,
        id: json['id'] as String,
      );
}

/// A resposta de `beginPasskeyRegistration`.
///
/// E o `PublicKeyCredentialCreationOptions` do WebAuthn, recortado ao que o
/// produto usa. **Nada aqui e escolhido pelo app**: o `rp.id`, o
/// `resident_key` e o `user_verification` vem decididos do servidor, e o app
/// que resolvesse qualquer um deles por conta propria produziria credencial
/// que o proprio servidor recusa depois.
class OpcoesDeCadastroDePasskey {
  const OpcoesDeCadastroDePasskey({
    required this.desafio,
    required this.rpId,
    required this.rpNome,
    required this.usuarioId,
    required this.usuarioEmail,
    required this.usuarioNome,
    required this.algoritmos,
    required this.prazoEmMilissegundos,
    required this.atestacao,
    required this.vinculoDoAutenticador,
    required this.chaveResidente,
    required this.verificacaoDoUsuario,
    required this.excluirCredenciais,
  });

  /// Desafio de **uso unico** e com prazo, base64url.
  final String desafio;

  /// O `RP ID`.
  ///
  /// **O app NAO o monta e NAO o conferere contra a URL da API.** Ele e o
  /// hostname de `WEB_BASE_URL` no servidor, e e no host DELE que o
  /// `assetlinks.json` (Android) e o `apple-app-site-association` (iOS) tem de
  /// estar servidos. Divergencia entre este valor e aquele host **nao da
  /// erro**: o sistema operacional simplesmente nao entrega credencial, e a
  /// folha nativa nem aparece.
  final String rpId;

  final String rpNome;

  /// O `userHandle`, base64url. E o UUID da conta, **nunca o e-mail**.
  final String usuarioId;

  /// O e-mail, que e o que o seletor do aparelho mostra.
  final String usuarioEmail;

  final String usuarioNome;

  final List<AlgoritmoDeChave> algoritmos;

  /// Prazo em MILISSEGUNDOS, como o WebAuthn pede -- e nao em segundos.
  final int prazoEmMilissegundos;

  /// `none`, sempre. Ver a descricao da operacao no contrato.
  final String atestacao;

  /// `platform`: a credencial fica no proprio aparelho.
  final String vinculoDoAutenticador;

  /// `required`, e e isso que torna a credencial *discoverable* -- o que
  /// permite a entrada nao receber e-mail.
  final String chaveResidente;

  /// `required`: biometria ou bloqueio de tela.
  final String verificacaoDoUsuario;

  /// As credenciais ATIVAS da conta, para o aparelho nao cadastrar duas vezes.
  final List<DescritorDeCredencial> excluirCredenciais;

  factory OpcoesDeCadastroDePasskey.doJson(Map<String, dynamic> json) {
    final rp = json['rp'] as Map<String, dynamic>;
    final usuario = json['user'] as Map<String, dynamic>;
    final selecao = json['authenticator_selection'] as Map<String, dynamic>;
    return OpcoesDeCadastroDePasskey(
      desafio: json['challenge'] as String,
      rpId: rp['id'] as String,
      rpNome: rp['name'] as String,
      usuarioId: usuario['id'] as String,
      usuarioEmail: usuario['name'] as String,
      usuarioNome: usuario['display_name'] as String,
      algoritmos: (json['pub_key_cred_params'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(AlgoritmoDeChave.doJson)
          .toList(),
      prazoEmMilissegundos: json['timeout'] as int,
      atestacao: json['attestation'] as String,
      vinculoDoAutenticador: selecao['authenticator_attachment'] as String,
      chaveResidente: selecao['resident_key'] as String,
      verificacaoDoUsuario: selecao['user_verification'] as String,
      excluirCredenciais: (json['exclude_credentials'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(DescritorDeCredencial.doJson)
          .toList(),
    );
  }
}

/// A resposta de `beginPasskeyAuthentication`.
///
/// **Nao existe e-mail nesta operacao, nem na ida nem na volta.** A credencial
/// e *discoverable* e o proprio aparelho sabe qual conta apresentar. Ver
/// [allowCredentials].
class OpcoesDeEntradaPorPasskey {
  const OpcoesDeEntradaPorPasskey({
    required this.desafio,
    required this.prazoEmMilissegundos,
    required this.rpId,
    required this.verificacaoDoUsuario,
    required this.allowCredentials,
  });

  final String desafio;
  final int prazoEmMilissegundos;

  /// O `RP ID`. Mesmo valor e mesma armadilha de
  /// [OpcoesDeCadastroDePasskey.rpId].
  final String rpId;

  final String verificacaoDoUsuario;

  /// **Sempre vazia, em toda chamada** -- o contrato declara `maxItems: 0`.
  ///
  /// O campo existe aqui, e e lido, de proposito: ele e a forma de a operacao
  /// **nao** responder *"esta conta tem passkey?"* numa porta sem
  /// autenticacao. Se um dia o servidor passar a preencher isto, o portao de
  /// contrato reprova antes de vazar -- e este campo sendo lido e nao
  /// descartado e o que faz o app repassar o que vier em vez de esconder.
  final List<DescritorDeCredencial> allowCredentials;

  factory OpcoesDeEntradaPorPasskey.doJson(Map<String, dynamic> json) =>
      OpcoesDeEntradaPorPasskey(
        desafio: json['challenge'] as String,
        prazoEmMilissegundos: json['timeout'] as int,
        rpId: json['rp_id'] as String,
        verificacaoDoUsuario: json['user_verification'] as String,
        allowCredentials: (json['allow_credentials'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .map(DescritorDeCredencial.doJson)
            .toList(),
      );
}

/// O que o aparelho produziu no CADASTRO, a caminho de
/// `finishPasskeyRegistration`.
class CredencialCadastrada {
  const CredencialCadastrada({
    required this.id,
    required this.rawId,
    required this.clientDataJson,
    required this.attestationObject,
    required this.transportes,
  });

  final String id;

  /// O mesmo valor de [id]. **As duas chaves vao no corpo** porque o contrato
  /// declara `id` e `raw_id` em `required` -- o Credential Manager devolve as
  /// duas e o contrato aceita as duas.
  final String rawId;

  final String clientDataJson;
  final String attestationObject;

  /// Informativo, guardado para a tela. **Nunca decisao de seguranca.**
  final List<String> transportes;

  /// O corpo de `PasskeyRegistrationRequest`.
  ///
  /// [rotulo] e o nome do aparelho, e e **opcional**: sem ele o servidor
  /// guarda nulo e a tela mostra a data. A chave nao vai quando e nula --
  /// `label: null` nao e a mesma coisa que ausente.
  Map<String, dynamic> paraOContrato({String? rotulo}) => <String, dynamic>{
        'credential': <String, dynamic>{
          'id': id,
          'raw_id': rawId,
          'type': 'public-key',
          'response': <String, dynamic>{
            'client_data_json': clientDataJson,
            'attestation_object': attestationObject,
            if (transportes.isNotEmpty) 'transports': transportes,
          },
        },
        if (rotulo != null && rotulo.isNotEmpty) 'label': rotulo,
      };
}

/// O que o aparelho assinou na ENTRADA, a caminho de
/// `finishPasskeyAuthentication`.
class CredencialAssinada {
  const CredencialAssinada({
    required this.id,
    required this.rawId,
    required this.clientDataJson,
    required this.authenticatorData,
    required this.signature,
    required this.userHandle,
  });

  final String id;
  final String rawId;
  final String clientDataJson;
  final String authenticatorData;
  final String signature;

  /// O `userHandle` guardado no aparelho, ou nulo quando ele nao veio.
  ///
  /// **O servidor nunca o aceita como identificacao** -- ele o confere contra
  /// o dono da credencial achada pelo `credential_id`. Vai no corpo porque o
  /// contrato o declara `nullable`, e porque e justamente a conferencia dele
  /// que recusa quem tentar escolher de quem e a assercao.
  final String? userHandle;

  /// O corpo de `PasskeyAuthenticationRequest`.
  Map<String, dynamic> paraOContrato({required bool continuarConectado}) =>
      <String, dynamic>{
        'credential': <String, dynamic>{
          'id': id,
          'raw_id': rawId,
          'type': 'public-key',
          'response': <String, dynamic>{
            'client_data_json': clientDataJson,
            'authenticator_data': authenticatorData,
            'signature': signature,
            // VAI ATE QUANDO E NULO, e isto e diferente do `label` do
            // cadastro: o contrato declara `user_handle` como `nullable`,
            // entao `null` e um valor valido e distinguivel de "o aparelho
            // nao me deu". Omitir apagaria essa diferenca.
            'user_handle': userHandle,
          },
        },
        'stay_signed_in': continuarConectado,
      };
}

/// Uma credencial ATIVA, do ponto de vista da tela.
///
/// **Nao traz chave publica nem `credential_id`**: nada que sirva para montar
/// assercao sai da operacao que devolve isto. O [id] e o da LINHA, e e o que
/// `revokePasskey` recebe -- nao confundir com o `credential_id`, que o app
/// nunca ve nesta direcao.
class Passkey {
  const Passkey({
    required this.id,
    required this.rotulo,
    required this.criadaEm,
    required this.usadaEm,
  });

  /// O identificador DA LINHA.
  final String id;

  /// O rotulo que a pessoa deu, ou nulo.
  final String? rotulo;

  final DateTime criadaEm;

  /// Ultima entrada aceita com esta credencial, ou nulo se nunca foi usada
  /// para entrar. Recem-cadastrada chega nula aqui.
  final DateTime? usadaEm;

  factory Passkey.doJson(Map<String, dynamic> json) => Passkey(
        id: json['id'] as String,
        rotulo: json['label'] as String?,
        criadaEm: DateTime.parse(json['created_at'] as String),
        usadaEm: switch (json['last_used_at']) {
          final String quando => DateTime.parse(quando),
          _ => null,
        },
      );
}
