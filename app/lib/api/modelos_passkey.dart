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
///
/// ## O SERVIDOR DE HOMOLOGACAO NAO FALA O QUE O CONTRATO DECLARA, E ISSO FOI
/// MEDIDO
///
/// Medido em 28/10/2026 contra `https://hml.bichu.app`, que e o que esta no
/// ar:
///
/// ```
/// POST /v1/auth/passkey/authentication/options  ->  200
/// {"rpId":"hml.bichu.app","challenge":"...","allowCredentials":[],
///  "timeout":300000,"userVerification":"required"}
/// ```
///
/// O contrato declara `rp_id`, `allow_credentials` e `user_verification`
/// (`PasskeyAuthenticationOptions`, com os tres em `required`). O servidor
/// manda `rpId`, `allowCredentials` e `userVerification`.
///
/// **A causa esta em `passkey-routes.ts`**: as duas operacoes de `options`
/// fazem `reply.send(opcoes)` com o retorno cru de `generateRegistrationOptions`
/// e `generateAuthenticationOptions` do `@simplewebauthn/server`, que produzem
/// o JSON do WebAuthn -- `camelCase`. Nada converte para a grafia do contrato.
///
/// **E nenhum portao pega isso.** As rotas declaram `schema: { body: ... }`, e
/// so o CORPO DA REQUISICAO e conferido contra o contrato; o corpo da RESPOSTA
/// nao e conferido por ninguem. Por isso as duas grafias conviveram sem
/// ninguem notar, e por isso este desvio so apareceu medindo a rota na mao.
///
/// **A direcao de ida esta certa e nao muda.** `finishPasskeyRegistration` e
/// `finishPasskeyAuthentication` TEM `schema: { body: ... }`, entao o que o app
/// ENVIA precisa estar em `snake_case` -- e esta, em `paraOContrato()`. A
/// divergencia e so nas duas respostas de `options`.
///
/// ## Por que este arquivo aceita AS DUAS grafias
///
/// Ler so `rp_id` deixaria o passkey quebrado hoje, contra o servidor que esta
/// no ar: o campo chegaria nulo, o `as String` estouraria `TypeError`, e
/// `FiacaoDoPasskey` engoliria isso devolvendo `null` -- **falha silenciosa**,
/// indistinguivel de "esta pessoa nao tem passkey".
///
/// Ler so `rpId` quebraria no dia em que o servidor for corrigido para a
/// grafia que o contrato declara, do mesmo jeito calado.
///
/// Entao [_texto] e [_lista] aceitam as duas, e [IscaDeGrafia] existe para que
/// a isca possa cobrar as duas direcoes em vez de uma. Isto e um REMENDO com
/// data: o conserto de verdade e o servidor passar a responder o que o
/// contrato declara, ou o contrato passar a declarar `camelCase` -- e nenhuma
/// das duas coisas e desta frente, que e a fiacao do app.
library;

/// Le um campo de texto obrigatorio que pode vir em qualquer das duas grafias.
///
/// **Estoura com os dois nomes na mensagem quando nao acha nenhuma**, e isso
/// e o ponto: o `as String` de um campo ausente estoura
/// `TypeError: null is not a String`, que nao diz qual campo nem qual grafia.
/// Esta falha chega ao canal de observabilidade dizendo exatamente o que
/// procurar.
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
///
/// **Ausente vira lista vazia, e isto NAO e tolerancia indevida.** As duas
/// listas que passam por aqui (`exclude_credentials` e `allow_credentials`)
/// tem a lista vazia como valor legitimo e dominante: conta sem credencial
/// nenhuma, e a entrada que manda `maxItems: 0` sempre. Exigir a chave faria
/// o caso normal estourar.
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
///
/// **Existe para que a isca cobre as DUAS direcoes.** Uma isca que so
/// montasse o JSON do servidor provaria que hoje funciona e continuaria verde
/// no dia em que alguem apagasse o ramo do contrato; uma que so montasse o do
/// contrato esta verde agora e o passkey esta quebrado no ar. A isca percorre
/// esta lista e monta os dois JSONs a partir dela.
class IscaDeGrafia {
  const IscaDeGrafia._();

  /// `{ nome no contrato: nome que o servidor manda }`.
  ///
  /// Os pares em que as duas grafias COINCIDEM (`challenge`, `timeout`, `rp`,
  /// `user`, `attestation`) nao estao aqui: nao ha o que divergir neles.
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

  /// [tipo] cai em `public-key` quando a chave nao vem.
  ///
  /// `generateRegistrationOptions` do `@simplewebauthn/server` monta
  /// `excludeCredentials` a partir de `{ id }` so (ver `passkey-service.ts`), e
  /// o `type` pode nao estar no JSON. `public-key` e o unico valor que o
  /// contrato admite no `enum`, entao o padrao nao escolhe nada: ele escreve o
  /// unico valor possivel em vez de estourar.
  factory DescritorDeCredencial.doJson(Map<String, dynamic> json) =>
      DescritorDeCredencial(
        tipo: json['type'] as String? ?? 'public-key',
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

  /// `rp`, `user`, `challenge`, `timeout` e `attestation` tem o MESMO nome nas
  /// duas grafias, entao sao lidos direto. O resto passa por [_texto] e
  /// [_lista]. Ver o cabecalho do arquivo.
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

  /// `challenge` e `timeout` coincidem nas duas grafias; os outros tres
  /// divergem. Ver o cabecalho do arquivo -- e a medicao de 28/10/2026 que
  /// mostra `rpId` chegando do servidor onde o contrato diz `rp_id`.
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
