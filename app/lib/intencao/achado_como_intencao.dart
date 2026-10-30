/// A ação `registrar_achado` dentro do envelope de 8.3 (critério 3 da
/// BICHUS-35).
library;

import '../achado/rascunho_do_achado.dart';
import '../api/achados_api.dart';
import '../api/api_client.dart';
import '../api/mensagens_de_erro.dart';
import '../dispositivo/camera_e_galeria.dart';
import '../roteamento/rotas.dart';
import '../telas/achado/resultado_do_achado.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de UX para onde o achado volta quando o registro falha.
const String telaDeRetornoDoAchado = 'F3.5';

/// A chave do instante já resolvido dentro do envelope.
const String campoDeAchadoEm = 'achado_em';

/// Monta o envelope a partir do rascunho de F3.5.
IntencaoPendente intencaoDeRegistrarAchado(
  RascunhoDoAchado rascunho, {
  required DateTime criadaEm,
}) {
  final foto = rascunho.foto;
  final coordenada = rascunho.coordenada;
  return IntencaoPendente(
    acao: AcaoDeIntencao.registrarAchado,
    telaDeRetorno: telaDeRetornoDoAchado,
    criadaEm: criadaEm,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{
        ...rascunho.campos(),
        campoDeAchadoEm: rascunho.instanteEm(criadaEm)?.toIso8601String(),
      },
      fotos: <FotoDaIntencao>[
        if (foto != null)
          FotoDaIntencao(
            caminho: foto.caminho,
            tipoDeConteudo: foto.tipoDeConteudo,
            tamanhoEmBytes: foto.tamanhoEmBytes,
          ),
      ],
      localizacao: coordenada == null
          ? null
          : LocalizacaoDaIntencao(
              latitude: coordenada.lat,
              longitude: coordenada.lon,
              capturadaEm: criadaEm,
            ),
    ),
  );
}

/// O que a tela de retorno recebe quando o registro falha (regra 4 de 8.3).
class RetomadaDoAchado {
  const RetomadaDoAchado({required this.campos, this.erro, this.lat, this.lon});

  final Map<String, Object?> campos;

  /// A coordenada do envelope, **quando ela ainda valia** na hora da execução.
  final double? lat;
  final double? lon;

  /// Nulo só quando o executor estourou fora de `FalhaDeChamada` — aí não há
  /// falha de chamada para traduzir, e inventar um texto de tela seria pior que
  /// ficar calado.
  final MensagemDeErro? erro;

  /// O rascunho recarregado, pronto para a tela.
  RascunhoDoAchado get rascunho =>
      RascunhoDoAchado.dosCampos(campos, lat: lat, lon: lon);
}

/// A foto do envelope de volta na forma que a tela conhece.
FotoLocal? fotoLocalDaIntencao(FotoDaIntencao? foto) {
  if (foto == null) return null;
  return FotoLocal(
    caminho: foto.caminho,
    tipoDeConteudo: foto.tipoDeConteudo,
    tamanhoEmBytes: foto.tamanhoEmBytes,
  );
}

/// O instante de `found_at` guardado no envelope, ou nulo.
DateTime? achadoEmDoEnvelope(Map<String, Object?> campos) {
  final bruto = campos[campoDeAchadoEm] as String?;
  if (bruto == null || bruto.isEmpty) return null;
  return DateTime.tryParse(bruto);
}

/// Registra `registrar_achado` na guarda.
AcaoExecutavel achadoExecutavel(AchadosApi achados) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final campos = intencao.rascunho.campos;
      final guardada = intencao.rascunho.localizacao;
      final aindaVale =
          guardada != null && !guardada.desatualizadaEm(DateTime.now());
      final rascunho = RascunhoDoAchado.dosCampos(
        campos,
        lat: aindaVale ? guardada.latitude : null,
        lon: aindaVale ? guardada.longitude : null,
      );
      final especie = rascunho.especie;
      final porte = rascunho.porte;
      final onde = rascunho.onde;
      final achadoEm = achadoEmDoEnvelope(campos);
      if (especie == null || porte == null || onde == null ||
          achadoEm == null) {
        throw StateError(
          'envelope de `registrar_achado` sem espécie, porte, onde ou quando',
        );
      }

      final achado = await achados.registrar(
        corpo: AchadosApi.corpoDeRegistro(
          especie: especie,
          porte: porte,
          achadoEm: achadoEm,
          onde: onde,
          sexo: rascunho.sexo,
          racaCodigo: rascunho.racaCodigo,
          corCodigo: rascunho.corCodigo,
          versaoDaReferencia: rascunho.versaoDaReferencia,
          observacao: rascunho.observacao,
          shareToken: rascunho.shareToken,
        ),
        idempotencyKey: ApiClient.novaChaveDeIdempotencia(),
      );

      final foto = intencao.rascunho.fotos.isEmpty
          ? null
          : intencao.rascunho.fotos.first;

      return ResultadoDaExecucao(
        rota: Rotas.achadoRegistrado,
        extra: ResultadoDoAchado.registrado(
          achado: achado,
          foto: fotoLocalDaIntencao(foto),
        ),
      );
    },
    retomar: (intencao, erro) {
      final guardada = intencao.rascunho.localizacao;
      final aindaVale =
          guardada != null && !guardada.desatualizadaEm(DateTime.now());
      return RetomadaDoAchado(
        campos: intencao.rascunho.campos,
        erro: erro,
        lat: aindaVale ? guardada.latitude : null,
        lon: aindaVale ? guardada.longitude : null,
      );
    },
  );
}
