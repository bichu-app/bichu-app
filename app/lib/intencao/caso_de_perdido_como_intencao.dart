/// A ação `marcar_perdido` dentro do envelope de 8.3 (critério 7 da BICHUS-21).
library;

import '../api/api_client.dart';
import '../api/casos_api.dart';
import '../api/mensagens_de_erro.dart';
import '../api/modelos_pet.dart';
import '../api/pets_api.dart';
import '../perdido/rascunho_do_caso.dart';
import '../roteamento/rotas.dart';
import '../telas/perdido/resultado_da_abertura.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de UX para onde o caso volta quando a abertura falha.
const String telaDeRetornoDoCaso = 'F3.1';

/// A chave do instante já resolvido dentro do envelope.
const String campoDeVistoEm = 'visto_em';

/// Monta o envelope a partir do rascunho de F3.1.
IntencaoPendente intencaoDeMarcarPerdido(
  RascunhoDoCaso rascunho, {
  required DateTime criadaEm,
}) {
  return IntencaoPendente(
    acao: AcaoDeIntencao.marcarPerdido,
    alvo: rascunho.pet.id,
    telaDeRetorno: telaDeRetornoDoCaso,
    criadaEm: criadaEm,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{
        ...rascunho.campos(),
        campoDeVistoEm: rascunho.instanteEm(criadaEm)?.toIso8601String(),
      },
    ),
  );
}

/// O que a tela de retorno recebe quando a abertura falha (regra 4 de 8.3).
class RetomadaDoCaso {
  const RetomadaDoCaso({
    required this.petId,
    required this.campos,
    this.erro,
  });

  final String petId;
  final Map<String, Object?> campos;

  /// Nulo só quando o executor estourou fora de `FalhaDeChamada` — aí não há
  /// falha de chamada para traduzir, e inventar um texto de tela seria pior que
  /// ficar calado.
  final MensagemDeErro? erro;
}

/// O instante de `last_seen_at` guardado no envelope, ou nulo.
DateTime? vistoEmDoEnvelope(Map<String, Object?> campos) {
  final bruto = campos[campoDeVistoEm] as String?;
  if (bruto == null || bruto.isEmpty) return null;
  return DateTime.tryParse(bruto);
}

/// Registra `marcar_perdido` na guarda.
AcaoExecutavel casoDePerdidoExecutavel(PetsApi pets, CasosApi casos) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final campos = intencao.rascunho.campos;
      final alvo = intencao.alvo;
      if (alvo == null || alvo.isEmpty) {
        throw StateError('envelope de `marcar_perdido` sem o id do pet');
      }

      final pet = _acharPet(await pets.listarMeusPets(), alvo);
      if (pet == null) {
        throw StateError('o pet do envelope não está mais na conta');
      }

      final rascunho = RascunhoDoCaso.dosCampos(pet, campos);
      final area = rascunho.area;
      final vistoEm = vistoEmDoEnvelope(campos);
      if (area == null || vistoEm == null) {
        throw StateError('envelope de `marcar_perdido` sem onde ou sem quando');
      }

      final caso = await casos.abrirCaso(
        petId: pet.id,
        corpo: CasosApi.corpoDeAbertura(
          vistoEm: vistoEm,
          area: area,
          descricao: rascunho.descricao,
          compartilharNaListaPublica: rascunho.compartilharNaListaPublica,
        ),
        idempotencyKey: ApiClient.novaChaveDeIdempotencia(),
      );

      return ResultadoDaExecucao(
        rota: Rotas.casoAberto,
        extra: ResultadoDaAbertura.aberto(pet: pet, caso: caso),
      );
    },
    retomar: (intencao, erro) => RetomadaDoCaso(
      petId: intencao.alvo ?? '',
      campos: intencao.rascunho.campos,
      erro: erro,
    ),
  );
}

Pet? _acharPet(List<Pet> pets, String id) {
  for (final pet in pets) {
    if (pet.id == id) return pet;
  }
  return null;
}
