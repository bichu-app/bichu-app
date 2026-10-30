/// Os modelos de passkey do contrato (BICHUS-301).
library;

/// Le um campo de texto obrigatorio que pode vir em qualquer das duas grafias.
String _texto(Map<String, dynamic> json, String contrato, String servidor) {
  final valor = json[contrato] ?? json[servidor];
  if (valor is String) return valor;
  throw FormatException(
    'O campo obrigatorio nao veio em nenhuma das duas grafias: '
    '`$contrato` (o que o contrato declara) nem `$servidor` (o que o servidor '
    'de homologacao manda). Chaves recebidas: ${json.keys.toList()}',
  );
}

/// O mesmo para um numero obrigatorio.
int _numero(Map<String, dynamic> json, String contrato, String servidor) {
  final valor = json[contrato] ?? json[servidor];
  if (valor is int) return valor;
  throw FormatException(
    'O campo obrigatorio nao veio em nenhuma das duas grafias: '
    '`$contrato` nem `$servidor`. Chaves recebidas: ${json.keys.toList()}',
  );
}

/// O mesmo para uma lista de objetos.
List<Map<String, dynamic>> _lista(
  Map<String, dynamic> json,
  String contrato,
  String servidor,
) {
  final valor = json[contrato] ?? json[servidor];
  if (valor is List) return valor.cast<Map<String, dynamic>>();
  return const <Map<String, dynamic>>[];
}

/// Os pares de grafia que este arquivo atravessa, expostos para a isca.
class IscaDeGrafia {
  const IscaDeGrafia._();

  /// `{ nome no contrato: nome que o servidor manda }`.
  static const Map<String, String> paresDaEntrada = <String, String>{
    'rp_id': 'rpId',
    'user_verification': 'userVerification',
    'allow_credentials': 'allowCredentials',
  };

  /// O mesmo para o cadastro.
  static const Map<String, String> paresDoCadastro = <String, String>{
    'pub_key_cred_params': 'pubKeyCredParams',
    'authenticator_selection': 'authenticatorSelection',
    'exclude_credentials': 'excludeCredentials',
    'display_name': 'displayName',
    'authenticator_attachment': 'authenticatorAttachment',
    'resident_key': 'residentKey',
    'user_verification': 'userVerification',
  };
}

/// Um algoritmo de chave publica aceito, em COSE.
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

  /// [tipo] cai em `public-key` quando a chave nao vem.
  factory DescritorDeCredencial.doJson(Map<String, dynamic> json) =>
      DescritorDeCredencial(
        tipo: json['type'] as String? ?? 'public-key',
        id: json['id'] as String,
      );
}

/// A resposta de `beginPasskeyRegistration`.
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
  final String rpId;

  final String rpNome;

  /// O `userHandle`, base64url.
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

  /// `rp`, `user`, `challenge`, `timeout` e `attestation` tem o MESMO nome nas
  /// duas grafias, entao sao lidos direto.
  factory OpcoesDeCadastroDePasskey.doJson(Map<String, dynamic> json) {
    final rp = json['rp'] as Map<String, dynamic>;
    final usuario = json['user'] as Map<String, dynamic>;
    final selecao = (json['authenticator_selection'] ??
        json['authenticatorSelection']) as Map<String, dynamic>;
    return OpcoesDeCadastroDePasskey(
      desafio: json['challenge'] as String,
      rpId: rp['id'] as String,
      rpNome: rp['name'] as String,
      usuarioId: usuario['id'] as String,
      usuarioEmail: usuario['name'] as String,
      usuarioNome: _texto(usuario, 'display_name', 'displayName'),
      algoritmos: _lista(json, 'pub_key_cred_params', 'pubKeyCredParams')
          .map(AlgoritmoDeChave.doJson)
          .toList(),
      prazoEmMilissegundos: json['timeout'] as int,
      atestacao: json['attestation'] as String,
      vinculoDoAutenticador: _texto(
        selecao,
        'authenticator_attachment',
        'authenticatorAttachment',
      ),
      chaveResidente: _texto(selecao, 'resident_key', 'residentKey'),
      verificacaoDoUsuario: _texto(
        selecao,
        'user_verification',
        'userVerification',
      ),
      excluirCredenciais:
          _lista(json, 'exclude_credentials', 'excludeCredentials')
              .map(DescritorDeCredencial.doJson)
              .toList(),
    );
  }
}

/// A resposta de `beginPasskeyAuthentication`.
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
  final List<DescritorDeCredencial> allowCredentials;

  /// `challenge` e `timeout` coincidem nas duas grafias; os outros tres
  /// divergem.
  factory OpcoesDeEntradaPorPasskey.doJson(Map<String, dynamic> json) =>
      OpcoesDeEntradaPorPasskey(
        desafio: json['challenge'] as String,
        prazoEmMilissegundos: _numero(json, 'timeout', 'timeout'),
        rpId: _texto(json, 'rp_id', 'rpId'),
        verificacaoDoUsuario: _texto(
          json,
          'user_verification',
          'userVerification',
        ),
        allowCredentials: _lista(json, 'allow_credentials', 'allowCredentials')
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

  /// Informativo, guardado para a tela.
  final List<String> transportes;

  /// O corpo de `PasskeyRegistrationRequest`.
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
            'user_handle': userHandle,
          },
        },
        'stay_signed_in': continuarConectado,
      };
}

/// Uma credencial ATIVA, do ponto de vista da tela.
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

  /// Ultima entrada aceita com esta credencial, ou nulo se nunca foi usada para
  /// entrar.
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
