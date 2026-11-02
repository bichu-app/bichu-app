/// O ACEITE DOS TERMOS: o que esta conta TEM registrado, e como registrar de
/// novo.
///
/// ## Por que este arquivo existe
///
/// Ate 01/11/2026 a versao dos termos era gravada **so no cadastro**
/// (`auth_api.dart`, `accepted_terms_version` em `POST /v1/auth/register`) e
/// nao saia em resposta nenhuma. O aplicativo gravava o aceite e nunca mais
/// conseguia saber o que havia gravado -- logo nao tinha como distinguir "ja
/// aceitou o texto de hoje" de "nao aceitou nada", e quem ja tinha conta nao
/// tinha **nenhuma** porta para aceitar texto novo.
///
/// ## A fronteira, dita em voz alta
///
/// **A versao EXIGIDA vem do binario**, nao do servidor:
/// `AppConfig.versaoDosTermos`, do `--dart-define=TERMS_VERSION` que
/// `infra/verificacao/verificar-apk.sh` deriva da fonte unica
/// `web/src/conteudo/versao-legal.json`. O servidor devolve um FATO gravado e
/// grava o que recebe; a COMPARACAO acontece no aparelho
/// (`PortaoDeAceiteDosTermos`).
///
/// A consequencia e real e esta medida: aparelho com APK antigo exige a versao
/// antiga, entao a recoleta alcanca quem atualizar o aplicativo, e so.
library;

import 'api_client.dart';
import 'falhas.dart';

/// O que o servidor diz sobre o aceite **desta** conta.
///
/// `#/components/schemas/Me` do contrato, do qual esta classe le UM campo:
/// `accepted_terms_version`. O ponteiro aponta para o SCHEMA e nao para a
/// propriedade porque propriedade escalar nao expoe campo nenhum, e conferir
/// nome de campo contra conjunto vazio aprova qualquer nome -- e o portao
/// `make verificar-conformidade-do-app` reprova por isso, com razao. Quem LE o
/// campo e [TermosApi.consultar], logo abaixo.
class AceiteRegistrado {
  const AceiteRegistrado({required this.versao, required this.servidorRespondeu});

  /// NAO HOUVE RESPOSTA. **Nao e "nao aceitou"**, e "nao sei" -- e a diferenca
  /// decide se o portao pede aceite ou nao pede nada. Ver o portao.
  const AceiteRegistrado.semResposta()
      : versao = null,
        servidorRespondeu = false;

  /// A versao que a conta tem registrada, ou nulo quando nao ha nenhuma.
  ///
  /// **Nulo com `servidorRespondeu == true` e o defeito medido**: 36 dos 37
  /// registros locais de 01/11/2026 estao assim, consentimento sem versao
  /// nenhuma. O portao trata isso como "nunca aceitou a versao atual".
  final String? versao;

  /// Houve um servidor do outro lado desta pergunta.
  final bool servidorRespondeu;
}

/// As duas pontas do aceite: ler o que esta gravado, e gravar o novo.
class TermosApi {
  const TermosApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me` (`getMe`), lido **so** pelo campo do aceite.
  ///
  /// **Nunca lanca.** Falha de rede vira [AceiteRegistrado.semResposta], e nao
  /// "sem aceite": pedir aceite porque a rede caiu poria a pessoa diante de um
  /// pedido que ela nao tem como concluir -- o `PUT` falharia pela mesma rede.
  Future<AceiteRegistrado> consultar() async {
    try {
      final json = await _api.get('/me');
      final bruto = json['accepted_terms_version'];
      return AceiteRegistrado(
        versao: bruto is String && bruto.trim().isNotEmpty ? bruto.trim() : null,
        servidorRespondeu: true,
      );
    } on FalhaDeConexao {
      return const AceiteRegistrado.semResposta();
    } on FalhaDeTempo {
      return const AceiteRegistrado.semResposta();
    } on Object {
      return const AceiteRegistrado.semResposta();
    }
  }

  /// `PUT /v1/me/terms-acceptance` (`recordTermsAcceptance`).
  ///
  /// **LANCA**, ao contrario de [consultar], e isso nao e inconsistencia: aqui
  /// a pessoa apertou um botao e precisa saber se o aceite foi registrado.
  /// Engolir a falha mostraria "pronto" sem nada gravado, que e a familia de
  /// defeito que esta entrega conserta.
  ///
  /// `versao` NUNCA e nula nem vazia: quem a passa e o portao, com
  /// `AppConfig.versaoDosTermos` ja conferido. O servidor recusa vazio com 400
  /// e o Postgres recusa com `version NOT NULL`; sao tres travas para o mesmo
  /// defeito, de proposito.
  Future<void> registrar(String versao) async {
    await _api.put(
      '/me/terms-acceptance',
      corpo: <String, dynamic>{'accepted_terms_version': versao},
    );
  }
}
