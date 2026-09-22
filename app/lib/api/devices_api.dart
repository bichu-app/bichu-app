import '../dispositivo/avisos.dart';
import 'api_client.dart';

/// `POST /v1/me/devices` do contrato.
///
/// **O aparelho e registrado tambem quando a pessoa recusou o aviso**, e isso
/// nao e detalhe: o contrato diz, com todas as letras, que e esse registro que
/// permite contar quantos tutores sao de fato alcancaveis -- "a metrica que
/// decide se o alerta toca em alguem". Registrar so quem concedeu daria uma
/// base em que todo mundo recebe push, e a decisao de produto sairia de um
/// numero que so olha para quem disse sim.
///
/// Pelo mesmo motivo o contrato tem **tres** estados e nao dois:
/// `not_asked` e diferente de `denied`. Quem tocou em `Agora nao` na antessala
/// nunca viu o dialogo do sistema, entao a chance unica do iOS continua
/// guardada e a segunda oportunidade de UX 10.1 (F3.2) ainda pode abri-la.
/// Quem tocou em `Sim` e recusou no dialogo esta em `denied`, e para essa
/// pessoa o unico caminho de volta sao os ajustes. Colapsar os dois faria o
/// app abrir um dialogo que nao abre mais, e a pessoa ficaria olhando para um
/// botao que nao faz nada.
class DevicesApi {
  const DevicesApi(this._api);

  final ApiClient _api;

  /// Registra ou atualiza este aparelho.
  ///
  /// Idempotente por `push_token` no servidor, entao nao leva
  /// `Idempotency-Key`: reenviar o mesmo token nao cria um segundo aparelho.
  ///
  /// Devolve nada de propósito. O `Device.id` da resposta so serve para
  /// `DELETE /me/devices/{deviceId}` no logout, que e outra historia; guardar
  /// um identificador que ninguem le seria estado sem leitor.
  Future<void> registrar({
    required PlataformaDeAviso plataforma,
    required PermissaoDeAviso permissao,
    String? pushToken,
  }) async {
    await _api.post(
      '/me/devices',
      corpo: <String, dynamic>{
        'platform': _plataformaNoContrato(plataforma),
        'push_permission': _permissaoNoContrato(permissao),
        // `null` explicito, e nao campo ausente: o contrato declara
        // `nullable: true`, e mandar `null` diz "este aparelho nao tem token",
        // que e diferente de "nao estou contando nada sobre o token". A
        // diferenca importa quando a pessoa revoga a permissao nos ajustes: o
        // registro seguinte precisa **apagar** o token que estava la.
        'push_token': pushToken,
      },
    );
  }

  static String _plataformaNoContrato(PlataformaDeAviso plataforma) {
    switch (plataforma) {
      case PlataformaDeAviso.android:
        return 'android';
      case PlataformaDeAviso.ios:
        return 'ios';
    }
  }

  /// A traducao para o vocabulario do contrato.
  ///
  /// [PermissaoDeAviso.indisponivel] nao tem valor aqui de proposito: um
  /// processo sem push nao registra aparelho nenhum, e quem decide isso e a
  /// tela, antes de chamar. Se chegasse aqui, o unico valor possivel seria
  /// `not_asked`, e isso poria na base um aparelho que nunca vai receber nada
  /// -- exatamente a sujeira de metrica que o comentario do topo descreve.
  static String _permissaoNoContrato(PermissaoDeAviso permissao) {
    switch (permissao) {
      case PermissaoDeAviso.concedida:
        return 'granted';
      case PermissaoDeAviso.negada:
        return 'denied';
      case PermissaoDeAviso.naoPedida:
      case PermissaoDeAviso.indisponivel:
        return 'not_asked';
    }
  }
}
