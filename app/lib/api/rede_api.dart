import 'api_client.dart';
import 'modelos_rede.dart';

/// As tres operacoes da secao `Rede` (`tags: [network]` do contrato).
///
/// **NAO HA OPERACAO DE ESCRITA DE EVENTO AQUI, e a ausencia e a decisao 4 do
/// ADR-0025.** Nao existe criar, editar nem apagar encontro, e nao existe envio
/// de foto: nao ha moderacao, denuncia nem remocao em lugar nenhum deste
/// repositorio, e o cliente ja negou o equivalente para o diretorio na emenda 1
/// do ADR-0011. Quando a escrita existir, ela nasce em `/v1/admin/...` como
/// manda o ADR-0023 -- e nao neste arquivo.
///
/// ## Os tres niveis de token, e os tres sao diferentes
///
/// 1. [listar] passa `exigeToken: false`: `listNetworkEvents` e `security: []`
///    no contrato. A agenda e navegavel deslogado, como a `Loja`, e nada na
///    resposta e privado de ninguem -- ela nao tem uma linha sobre pessoas.
/// 2. [detalhar] passa `exigeToken: true`, e **isso nao exige conta**: o
///    [ApiClient] so ANEXA o `Bearer` quando ha sessao, e a operacao e
///    `bearerAuth` **ou** anonima. O token importa por um campo so --
///    `viewer_checked_in`, que responde "voce ja confirmou presenca?" a partir
///    do proprio token de quem chama. Sem ele a resposta vem com `false`, que e
///    o certo para quem nao tem conta.
/// 3. [confirmarPresenca] exige conta de verdade: sem token a rota responde
///    401, e ela **tem** de responder, porque o check-in e de uma pessoa.
///
/// ## Nao ha `Idempotency-Key` no check-in, e a ausencia e do contrato
///
/// A idempotencia e do BANCO: a chave primaria de `network_event_checkins` e
/// `(event_slug, user_id)`, entao o segundo check-in da mesma pessoa no mesmo
/// evento deixa de ser algo que alguem confere e passa a ser um estado que o
/// banco recusa. Uma chave de idempotencia aqui seria um segundo mecanismo
/// para a mesma garantia, com uma janela de 24 h que a primeira nao tem.
class RedeApi {
  const RedeApi(this._api);

  final ApiClient _api;

  /// `GET /v1/network/events` (`listNetworkEvents`) -- uma pagina da agenda.
  ///
  /// **Nao trata falha e nao devolve pagina vazia quando a chamada quebra.**
  /// Quem chama precisa distinguir "a Rede ainda nao tem encontro" de "nao
  /// consegui perguntar": um `catch` que devolvesse lista vazia produziria o
  /// estado vazio que parece sucesso.
  Future<PaginaDaRede> listar([
    RecorteDaRede recorte = const RecorteDaRede(),
  ]) async {
    final json = await _api.get(
      '/network/events',
      query: recorte.query,
      exigeToken: false,
    );
    return PaginaDaRede.doJson(json);
  }

  /// `GET /v1/network/events/{eventSlug}` (`getNetworkEvent`).
  ///
  /// Evento inativo e evento inexistente respondem **404 nos dois casos**, com
  /// o mesmo corpo: distinguir contaria a um estranho que aquele `slug`
  /// existiu.
  Future<EncontroComGaleria> detalhar(String slug) async {
    final json = await _api.get('/network/events/$slug');
    return EncontroComGaleria.doJson(json);
  }

  /// `POST /v1/network/events/{eventSlug}/check-in` (`checkInNetworkEvent`).
  ///
  /// **Nao ha corpo de requisicao, e nao ha o que escolher.** O check-in e da
  /// PESSOA: o unico dado da operacao e quem chama e qual evento. Nao existe
  /// parametro de pet aqui porque nao existe coluna de pet la, e a ausencia e a
  /// decisao 1 do ADR-0025.
  Future<PresencaConfirmada> confirmarPresenca(String slug) async {
    final json = await _api.post('/network/events/$slug/check-in');
    return PresencaConfirmada.doJson(json);
  }
}
