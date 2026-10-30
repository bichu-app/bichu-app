/// A fronteira entre o app e a folha de credencial do sistema operacional.
library;

import 'package:flutter/foundation.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

import '../api/modelos_passkey.dart';

/// A pessoa fechou a folha do sistema, ou o aparelho nao tinha credencial.
class SemCredencialNoAparelho implements Exception {
  const SemCredencialNoAparelho([this.detalhe]);

  final String? detalhe;

  @override
  String toString() => 'SemCredencialNoAparelho($detalhe)';
}

/// O aparelho nao faz passkey, ou o dominio nao esta associado a ele.
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
  /// O aparelho nao suporta passkey (versao de sistema, ausencia de bloqueio de
  /// tela, build sem Google Play services).
  aparelhoNaoSuporta,

  /// **O dominio nao esta associado ao app.** `RP ID` contra host do arquivo de
  /// associacao: ou o `assetlinks.json` nao esta no host do `RP ID`, ou a
  /// digital do certificado que assinou este binario nao esta nele, ou o
  /// `apple-app-site-association` nao declara `webcredentials` para este
  /// `appID`.
  dominioNaoAssociado,

  /// Esta credencial ja esta cadastrada nesta conta (`excludeCredentials`
  /// casou).
  jaCadastradaNesteAparelho,

  /// O prazo do desafio estourou com a folha aberta.
  prazoEsgotado,

  /// Qualquer outro desfecho do canal nativo.
  outro,
}

/// A porta. Uma implementacao real e uma de teste.
abstract class CredencialDoAparelho {
  /// O SISTEMA DESTE APARELHO SABE FAZER PASSKEY?
  Future<bool> suportaCredencial();

  /// Pede ao sistema para CRIAR uma credencial e devolve o que ele atestou.
  Future<CredencialCadastrada> cadastrar(OpcoesDeCadastroDePasskey opcoes);

  /// Pede ao sistema uma assercao com uma credencial que **ja exista** no
  /// aparelho.
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes);
}

/// A implementacao de verdade, sobre o pacote `passkeys` 2.23.1.
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
            id: opcoes.usuarioId,
            name: opcoes.usuarioEmail,
            displayName: opcoes.usuarioNome,
          ),
          excludeCredentials: opcoes.excluirCredenciais
              .map(
                (c) => CredentialType(
                  type: c.tipo,
                  id: c.id,
                  transports: const <String>[],
                ),
              )
              .toList(),
          authSelectionType: AuthenticatorSelectionType(
            authenticatorAttachment: opcoes.vinculoDoAutenticador,
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
          allowCredentials: null,
          mediation: MediationType.Optional,
          preferImmediatelyAvailableCredentials: true,
          canBeSecurityKey: false,
        ),
      );

      return CredencialAssinada(
        id: resposta.id,
        rawId: resposta.rawId,
        clientDataJson: resposta.clientDataJSON,
        authenticatorData: resposta.authenticatorData,
        signature: resposta.signature,
        userHandle: resposta.userHandle.isEmpty ? null : resposta.userHandle,
      );
    } on PasskeyAuthCancelledException catch (erro) {
      throw SemCredencialNoAparelho('$erro');
    } on NoCredentialsAvailableException catch (erro) {
      throw SemCredencialNoAparelho('$erro');
    } on AuthenticatorException catch (erro) {
      throw CredencialIndisponivel(_motivoDe(erro), '$erro');
    }
  }

  /// Traduz a excecao do pacote no motivo que o registro guarda.
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
