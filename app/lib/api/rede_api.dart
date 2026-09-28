import 'api_client.dart';
import 'modelos_rede.dart';

/// As duas operacoes da secao `Rede` que este app consome (`tags: [network]`
/// do contrato).
///
/// **NAO HA OPERACAO DE ESCRITA DE EVENTO AQUI, e a ausencia e a decisao 4 do
/// ADR-0025.** Nao existe criar, editar nem apagar encontro, e nao existe envio
/// de foto: nao ha moderacao, denuncia nem remocao em lugar nenhum deste
/// repositorio, e o cliente ja negou o equivalente para o diretorio na emenda 1
/// do ADR-0011. Quando a escrita existir, ela nasce em `/v1/admin/...` como
/// manda o ADR-0023 -- e nao neste arquivo.
///
/// ## Check-in e galeria saem desta versao (BICHUS-251, decisao de 23/09/2026)
///
/// O cliente tirou do app a confirmacao de presenca e a exibicao da galeria
/// antes do merge da secao. `checkInNetworkEvent` **nao e consumido** e nao ha
/// metodo para ele aqui; `gallery`, `viewer_checked_in`, `checkin_count` e
/// `photo_count` podem continuar chegando na resposta e sao ignorados na
/// leitura. O trabalho anterior esta preservado na branch
/// `guarda/rede-checkin-galeria`, e volta por ela quando o cliente pedir.
///
/// ## As duas leituras sao anonimas
///
/// [listar] e [detalhar] passam `exigeToken: false`. O token so importava no
/// detalhe por causa de `viewer_checked_in` ("voce ja confirmou presenca?"), e
/// esse campo nao e mais lido: anexar o `Bearer` agora so exporia a sessao a
/// uma rota que nao precisa dela.
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
  Future<EncontroDaRede> detalhar(String slug) async {
    final json = await _api.get('/network/events/$slug', exigeToken: false);
    return EncontroDaRede.doJson(json);
  }
}
