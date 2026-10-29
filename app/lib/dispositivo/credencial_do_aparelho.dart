/// A fronteira entre o app e a folha de credencial do sistema operacional.
///
/// **O app nao desenha interface de credencial, e esta porta existe para que
/// isso continue verdade.** Quem pede a biometria ou o PIN e o sistema: o
/// Credential Manager no Android, o `ASAuthorizationPlatformPublicKeyCredential
/// Provider` no iOS. O que atravessa esta porta na ida sao as opcoes que o
/// servidor emitiu, e na volta o que o aparelho assinou. Nada mais.
///
/// ## Por que uma porta, e nao `PasskeyAuthenticator` chamado direto da tela
///
/// Pelo mesmo motivo de `LeitorDeQr` e `CameraEGaleria`: o pacote `passkeys`
/// fala por canal de plataforma, e canal de plataforma **nao existe em teste de
/// widget**. Chamar o pacote de dentro da tela faria `MissingPluginException`
/// em toda isca, e o jeito de contornar isso sem porta seria nao ter isca --
/// que e precisamente onde este fluxo pode apodrecer sem ninguem ver.
///
/// ## O QUE NAO SE PROVA SEM APARELHO, DITO INTEIRO
///
/// **O fluxo ponta a ponta nao e provavel aqui, e nenhuma isca deste
/// repositorio o prova.** A folha e do sistema operacional; ela nao sobe em
/// `flutter test` e nao sobe em simulador sem uma conta de desenvolvedor e um
/// arquivo de associacao servido no host certo. O que as iscas provam e o que
/// esta deste lado da porta: que a recusa deixa o cadastro terminar, que a
/// ausencia de credencial nao atrapalha quem entra com senha, e que o corpo
/// que sai para o servidor tem as chaves que o contrato exige.
///
/// O que **so aparelho** prova: que o `RP ID` casa com o host do arquivo de
/// associacao. Divergencia ali nao da erro -- a folha simplesmente nao
/// aparece, e [SemCredencialNoAparelho] e indistinguivel de "esta pessoa nao
/// tem passkey". E por isso que o `RP ID` efetivo e coisa de medir, e nao de
/// supor.
library;

import 'package:flutter/foundation.dart';
import 'package:passkeys/authenticator.dart';
// `types.dart` reexporta `exceptions.dart`, entao as excecoes vem por aqui.
import 'package:passkeys/types.dart';

import '../api/modelos_passkey.dart';

/// A pessoa fechou a folha do sistema, ou o aparelho nao tinha credencial.
///
/// **Os dois casos sao um so de proposito, e isso e o ponto do desenho.** Na
/// entrada, "nao ha passkey neste aparelho" e "a pessoa desistiu da biometria"
/// levam ao mesmo lugar: o formulario de senha, intacto, sem faixa de erro.
/// Separa-los daria a tela a chance de dizer algo -- e nao ha nada de util a
/// dizer a quem nunca cadastrou passkey e so quer digitar a senha.
class SemCredencialNoAparelho implements Exception {
  const SemCredencialNoAparelho([this.detalhe]);

  final String? detalhe;

  @override
  String toString() => 'SemCredencialNoAparelho($detalhe)';
}

/// O aparelho nao faz passkey, ou o dominio nao esta associado a ele.
///
/// **`DomainNotAssociatedException` cai aqui, e e o caso mais importante deste
/// arquivo.** Ele e o sintoma de `RP ID` que nao casa com o host que serve o
/// arquivo de associacao -- e o unico desfecho que acusa, em vez de ficar
/// calado, o erro de fiacao que mais custa tempo neste fluxo.
class CredencialIndisponivel implements Exception {
  const CredencialIndisponivel(this.motivo, [this.detalhe]);

  /// Qual dos casos foi, para o registro -- **nunca para a tela**: nada disto
  /// vira texto para a pessoa.
  final MotivoDaIndisponibilidade motivo;

  final String? detalhe;

  @override
  String toString() => 'CredencialIndisponivel($motivo, $detalhe)';
}

/// Os desfechos de [CredencialIndisponivel] que o app distingue no registro.
enum MotivoDaIndisponibilidade {
  /// O aparelho nao suporta passkey (versao de sistema, ausencia de bloqueio
  /// de tela, build sem Google Play services).
  aparelhoNaoSuporta,

  /// **O dominio nao esta associado ao app.** `RP ID` contra host do arquivo
  /// de associacao: ou o `assetlinks.json` nao esta no host do `RP ID`, ou a
  /// digital do certificado que assinou este binario nao esta nele, ou o
  /// `apple-app-site-association` nao declara `webcredentials` para este
  /// `appID`.
  dominioNaoAssociado,

  /// Esta credencial ja esta cadastrada nesta conta (`excludeCredentials`
  /// casou). Nao e erro: e o aparelho dizendo que o trabalho ja foi feito.
  jaCadastradaNesteAparelho,

  /// O prazo do desafio estourou com a folha aberta.
  prazoEsgotado,

  /// Qualquer outro desfecho do canal nativo.
  outro,
}

/// A porta. Uma implementacao real e uma de teste.
abstract class CredencialDoAparelho {
  /// O SISTEMA DESTE APARELHO SABE FAZER PASSKEY? (28/10/2026)
  ///
  /// Existe porque o convite passou a ser OFERECIDO -- depois do login e dentro
  /// de `Meus dados` --, e nao mais so aceito no fim do cadastro. **Nao se
  /// oferece o que o sistema vai recusar**: aparelho sem bloqueio de tela, ou
  /// com versao de sistema velha, e estado NORMAL e nao erro, e a pessoa nao
  /// pode ver uma promessa que a folha do sistema vai negar.
  ///
  /// Antes disto a indisponibilidade so aparecia DEPOIS do toque, como
  /// [CredencialIndisponivel] com [MotivoDaIndisponibilidade.aparelhoNaoSuporta]
  /// -- bom o bastante para quem acabou de criar a conta e ja estava com a mao
  /// no botao, e ruim para uma secao de ajustes que anuncia a funcao.
  ///
  /// **Falso quando nao der para saber.** A pergunta e barata e o custo de
  /// errar e assimetrico: um `false` a mais esconde uma funcao de quem talvez
  /// a tivesse, e um `true` a mais promete o que o sistema nega -- e a segunda
  /// e a que o cliente mandou evitar.
  Future<bool> suportaCredencial();

  /// Pede ao sistema para CRIAR uma credencial e devolve o que ele atestou.
  ///
  /// Estoura [SemCredencialNoAparelho] quando a pessoa fecha a folha, e
  /// [CredencialIndisponivel] no resto.
  Future<CredencialCadastrada> cadastrar(OpcoesDeCadastroDePasskey opcoes);

  /// Pede ao sistema uma assercao com uma credencial que **ja exista** no
  /// aparelho.
  ///
  /// Estoura [SemCredencialNoAparelho] quando nao ha credencial ou a pessoa
  /// desiste -- e esse e o caminho normal de quem usa senha.
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes);
}

/// A implementacao de verdade, sobre o pacote `passkeys` 2.23.1.
///
/// **E o unico arquivo do app que importa `passkeys`**, e isso e proposito e
/// nao arrumacao: o pacote tem tipos (`RegisterRequestType`) cujos nomes de
/// campo estao em `camelCase` do WebAuthn, enquanto o contrato esta em
/// `snake_case`. Espalhar essa traducao por telas seria espalhar o lugar onde
/// `clientDataJSON` e `client_data_json` se confundem.
class CredencialDoAparelhoReal implements CredencialDoAparelho {
  CredencialDoAparelhoReal({PasskeyAuthenticator? autenticador})
      : _autenticador = autenticador ?? PasskeyAuthenticator();

  final PasskeyAuthenticator _autenticador;

  @override
  Future<bool> suportaCredencial() async {
    try {
      // `canAuthenticate` e a propria pergunta do pacote `passkeys` 2.23.1, e
      // nao uma heuristica nossa sobre versao de sistema.
      //
      // **A SUPRESSAO DA DEPRECIACAO E DELIBERADA, e a troca nao e de uma
      // linha.** O substituto que o pacote indica (`PasskeyAvailability`, em
      // `availability.dart`) **nao e agnostico de plataforma**: ele expoe
      // `android()`, `iOS()`, `web()` e `windows()` separados, cada um com
      // tipo de retorno proprio, e usa-lo exigiria trazer deteccao de
      // plataforma para esta porta e tratar quatro formas diferentes de
      // resposta -- para responder a MESMA pergunta booleana. O metodo
      // depreciado continua existindo e funcionando no 2.23.1, que e a versao
      // travada no `pubspec`.
      //
      // Quando o pacote subir de versao e remove-lo, o conserto e aqui, num
      // lugar so: a porta devolve `Future<bool>` e nenhuma tela sabe como ela
      // chegou nesse booleano.
      // ignore: deprecated_member_use
      return await _autenticador.canAuthenticate();
    } on Object {
      // Canal de plataforma que nao responde vira `false`: ver o doc da porta.
      // **Nao registra**, e isso e deliberado -- esta pergunta acontece em
      // toda abertura de `Meus dados` e depois de todo login por senha, e um
      // canal indisponivel e o estado normal de um build sem o plugin.
      return false;
    }
  }

  @override
  Future<CredencialCadastrada> cadastrar(
    OpcoesDeCadastroDePasskey opcoes,
  ) async {
    try {
      final resposta = await _autenticador.register(
        RegisterRequestType(
          challenge: opcoes.desafio,
          relyingParty: RelyingPartyType(
            id: opcoes.rpId,
            name: opcoes.rpNome,
          ),
          user: UserType(
            // O `userHandle`: o UUID da conta, **nunca o e-mail**. Quem decide
            // isso e o servidor; aqui so se repassa.
            id: opcoes.usuarioId,
            // `name` e o que o seletor do aparelho MOSTRA, e por isso e o
            // e-mail -- e nao o `displayName`, que e o nome do tutor.
            name: opcoes.usuarioEmail,
            displayName: opcoes.usuarioNome,
          ),
          excludeCredentials: opcoes.excluirCredenciais
              .map(
                (c) => CredentialType(
                  type: c.tipo,
                  id: c.id,
                  // VAZIA, e nao uma lista inventada: `transports` em
                  // `excludeCredentials` e dica para o seletor, e o contrato
                  // nao manda essa informacao nesta direcao. Preencher com
                  // palpite ("internal") faria o aparelho filtrar por um
                  // transporte que ninguem afirmou.
                  transports: const <String>[],
                ),
              )
              .toList(),
          authSelectionType: AuthenticatorSelectionType(
            authenticatorAttachment: opcoes.vinculoDoAutenticador,
            // DERIVADO de `resident_key`, e nao uma constante.
            // `requireResidentKey` e o campo antigo do WebAuthn e
            // `residentKey` o novo; autenticador velho le o primeiro. Mandar
            // `required` num e `discouraged` no outro produz credencial NAO
            // *discoverable* -- que cadastra sem erro e depois nao aparece na
            // entrada sem e-mail, que e justamente o fluxo que o contrato
            // escolheu.
            requireResidentKey: opcoes.chaveResidente == 'required',
            residentKey: opcoes.chaveResidente,
            userVerification: opcoes.verificacaoDoUsuario,
          ),
          pubKeyCredParams: opcoes.algoritmos
              .map((a) => PubKeyCredParamType(type: a.tipo, alg: a.alg))
              .toList(),
          timeout: opcoes.prazoEmMilissegundos,
          attestation: opcoes.atestacao,
        ),
      );

      return CredencialCadastrada(
        id: resposta.id,
        rawId: resposta.rawId,
        clientDataJson: resposta.clientDataJSON,
        attestationObject: resposta.attestationObject,
        transportes: resposta.transports.whereType<String>().toList(),
      );
    } on PasskeyAuthCancelledException catch (erro) {
      throw SemCredencialNoAparelho('$erro');
    } on ExcludeCredentialsCanNotBeRegisteredException catch (erro) {
      throw CredencialIndisponivel(
        MotivoDaIndisponibilidade.jaCadastradaNesteAparelho,
        '$erro',
      );
    } on AuthenticatorException catch (erro) {
      throw CredencialIndisponivel(_motivoDe(erro), '$erro');
    }
  }

  @override
  Future<CredencialAssinada> assinar(
    OpcoesDeEntradaPorPasskey opcoes,
  ) async {
    try {
      final resposta = await _autenticador.authenticate(
        AuthenticateRequestType(
          relyingPartyId: opcoes.rpId,
          challenge: opcoes.desafio,
          timeout: opcoes.prazoEmMilissegundos,
          userVerification: opcoes.verificacaoDoUsuario,
          // NULO, e nao a lista vazia que o contrato manda. O pacote trata
          // lista vazia e nulo como a mesma coisa na ida, mas `null` e o que
          // diz ao sistema "ache a credencial sozinho" -- que e o que
          // `residentKey: required` tornou possivel e o que permite a operacao
          // do servidor nao receber e-mail.
          allowCredentials: null,
          // `Optional`: a folha pode aparecer, e aparece quando ha credencial.
          // NAO e `Conditional`, que pede campo de formulario com preenchimento
          // automatico atras dela -- esta tela chama isto sozinha ao abrir.
          mediation: MediationType.Optional,
          // VERDADEIRO, e e esta linha que faz a porta nao atrapalhar quem usa
          // senha: com ela o iOS **falha rapido** quando nao ha credencial no
          // aparelho, em vez de abrir o fluxo entre aparelhos com QR Code. Sem
          // ela, abrir a tela de entrar poria uma camera de QR na frente de
          // quem so queria digitar a senha.
          preferImmediatelyAvailableCredentials: true,
          // FALSO: nenhuma credencial do Bichu vive em chave de seguranca
          // fisica (`authenticator_attachment` e `platform`, pelo contrato).
          // Com `true` a folha do iOS ofereceria "Usar chave de seguranca".
          canBeSecurityKey: false,
        ),
      );

      return CredencialAssinada(
        id: resposta.id,
        rawId: resposta.rawId,
        clientDataJson: resposta.clientDataJSON,
        authenticatorData: resposta.authenticatorData,
        signature: resposta.signature,
        // O pacote devolve STRING VAZIA quando o aparelho nao mandou
        // `userHandle`, e o contrato declara o campo `nullable`. Mandar `''`
        // seria afirmar um `userHandle` de zero bytes, que o servidor
        // compararia contra o dono da credencial e recusaria -- um 401 que
        // parece credencial invalida e e erro de fiacao daqui.
        userHandle: resposta.userHandle.isEmpty ? null : resposta.userHandle,
      );
    } on PasskeyAuthCancelledException catch (erro) {
      throw SemCredencialNoAparelho('$erro');
    } on NoCredentialsAvailableException catch (erro) {
      // O CAMINHO NORMAL DE QUEM USA SENHA. Nao e falha: e a resposta "este
      // aparelho nao tem passkey", que e o estado de toda pessoa que ainda nao
      // cadastrou uma.
      throw SemCredencialNoAparelho('$erro');
    } on AuthenticatorException catch (erro) {
      throw CredencialIndisponivel(_motivoDe(erro), '$erro');
    }
  }

  /// Traduz a excecao do pacote no motivo que o registro guarda.
  ///
  /// **`DomainNotAssociatedException` e o que importa aqui.** Ele e o unico
  /// desfecho que denuncia `RP ID` divergente do host do arquivo de
  /// associacao, e sem este mapeamento ele chegaria ao registro como "outro",
  /// indistinguivel de aparelho velho.
  static MotivoDaIndisponibilidade _motivoDe(AuthenticatorException erro) {
    return switch (erro) {
      DomainNotAssociatedException() =>
        MotivoDaIndisponibilidade.dominioNaoAssociado,
      DeviceNotSupportedException() ||
      PasskeyUnsupportedException() ||
      MissingGoogleSignInException() ||
      SyncAccountNotAvailableException() ||
      NoCreateOptionException() =>
        MotivoDaIndisponibilidade.aparelhoNaoSuporta,
      TimeoutException() => MotivoDaIndisponibilidade.prazoEsgotado,
      _ => MotivoDaIndisponibilidade.outro,
    };
  }
}

/// A porta de um build que **nao** faz passkey.
///
/// Existe pelo mesmo motivo de `LeitorDeQrNaoEmbarcado`: o teste de widget
/// precisa de um padrao que nao toque canal de plataforma, e o padrao certo e
/// o que leva a tela ao caminho de quem nao tem passkey -- senha, intacta.
@visibleForTesting
class SemPasskeyNesteBuild implements CredencialDoAparelho {
  const SemPasskeyNesteBuild();

  @override
  Future<bool> suportaCredencial() async => false;

  @override
  Future<CredencialCadastrada> cadastrar(OpcoesDeCadastroDePasskey opcoes) =>
      throw const CredencialIndisponivel(
        MotivoDaIndisponibilidade.aparelhoNaoSuporta,
        'build sem passkey',
      );

  @override
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes) =>
      throw const SemCredencialNoAparelho('build sem passkey');
}
