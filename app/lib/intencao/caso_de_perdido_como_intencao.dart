/// A ação `marcar_perdido` dentro do envelope de 8.3 (critério 7 da BICHUS-21).
///
/// É a **segunda** das seis ações de 8.3 que este build sabe executar. A
/// primeira, `cadastrar_pet`, entrou com o assistente de F1; esta entra com o
/// fluxo de F3.1 → F3.2 → F3.3, e o critério 7 diz o que ela tem de fazer,
/// palavra por palavra:
///
/// > *"Dado que estou deslogada, quando toco em `Marcar como perdido`, então a
/// > guarda de ação assume e, depois de autenticar, **o caso é criado** e eu
/// > caio na F3.3 com o rascunho aplicado, nunca no formulário de novo e nunca
/// > na home."*
///
/// As duas metades dessa frase são as duas metades deste arquivo: [executar]
/// cria o caso e devolve F3.3; [retomar] é o que sobra quando a criação falha,
/// e ele devolve o rascunho inteiro em vez de um formulário em branco.
///
/// ## Por que `visto_em` entra no envelope resolvido, e não como `Agora`
///
/// O `Quando?` de F3.1 é uma escolha relativa (`Agora`, `Hoje mais cedo`), e
/// resolver uma escolha relativa **na hora de executar** faria o instante
/// escorregar: a pessoa toca em `Agora` às 19h02, cria a conta, confere o
/// e-mail noutro app e volta às 19h11. Um `Agora` resolvido na execução
/// gravaria 19h11 como a hora em que o animal foi visto pela última vez — nove
/// minutos de rastro que ninguém observou.
///
/// O envelope guarda o instante **já resolvido**, no momento em que a pessoa o
/// afirmou. É o mesmo cuidado que `LocalizacaoDaIntencao` tem com a coordenada
/// e pelo mesmo motivo: dado relativo gravado sem carimbo vira dado errado.
///
/// ## O pet NÃO vai no envelope
///
/// Vai só o `alvo`, que é o id — a regra que `RascunhoDoCaso.dosCampos`
/// documenta. Uma cópia do pet em disco seria dado de conta esperando a
/// próxima pessoa que entrar naquele aparelho, e o aparelho compartilhado é
/// caso real no público deste produto. Quem executa busca o resto.
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
///
/// **F3.1 e não F3.2.** F3.2 é a tela do alcance, e ela não tem campo nenhum:
/// voltar para lá com uma faixa de erro daria à pessoa um botão `Avisar agora`
/// e nada que ela possa corrigir. F3.1 é onde o rascunho mora, e é de lá que
/// ela segue em frente de novo.
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
    // **O alvo existe**, e isso separa esta ação de `cadastrar_pet`: o pet já
    // está cadastrado, e o que a ação cria é o caso.
    alvo: rascunho.pet.id,
    telaDeRetorno: telaDeRetornoDoCaso,
    criadaEm: criadaEm,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{
        ...rascunho.campos(),
        // Resolvido AQUI. Ver o cabeçalho.
        campoDeVistoEm: rascunho.instanteEm(criadaEm)?.toIso8601String(),
      },
    ),
  );
}

/// O que a tela de retorno recebe quando a abertura falha (regra 4 de 8.3).
///
/// Carrega o **id** do pet, e não o pet: quem reconstrói a tela busca o resto,
/// pelo mesmo motivo que o envelope não guarda o animal. A tela de retomada é
/// quem resolve isso, e ela sabe o que fazer quando o pet não vem.
class RetomadaDoCaso {
  const RetomadaDoCaso({
    required this.petId,
    required this.campos,
    this.erro,
  });

  final String petId;
  final Map<String, Object?> campos;

  /// Nulo só quando o executor estourou fora de `FalhaDeChamada` — aí não há
  /// falha de chamada para traduzir, e inventar um texto de tela seria pior
  /// que ficar calado.
  final MensagemDeErro? erro;
}

/// O instante de `last_seen_at` guardado no envelope, ou nulo.
DateTime? vistoEmDoEnvelope(Map<String, Object?> campos) {
  final bruto = campos[campoDeVistoEm] as String?;
  if (bruto == null || bruto.isEmpty) return null;
  return DateTime.tryParse(bruto);
}

/// Registra `marcar_perdido` na guarda.
///
/// Precisa das **duas** camadas: [pets] para achar o animal que o `alvo`
/// nomeia, e [casos] para abrir o caso. A busca vem primeiro porque o pet é
/// quem diz se a ação ainda faz sentido — um envelope de ontem pode apontar
/// para um pet que saiu da conta.
AcaoExecutavel casoDePerdidoExecutavel(PetsApi pets, CasosApi casos) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final campos = intencao.rascunho.campos;
      final alvo = intencao.alvo;
      if (alvo == null || alvo.isEmpty) {
        // Envelope sem alvo para uma ação que exige alvo. A guarda trata isto
        // como defeito de programação, registra e devolve a tela de retorno.
        throw StateError('envelope de `marcar_perdido` sem o id do pet');
      }

      final pet = _acharPet(await pets.listarMeusPets(), alvo);
      if (pet == null) {
        // O pet não está mais na conta. **Não é falha de chamada**, e por isso
        // sobe como erro de programação: a guarda leva a pessoa para a tela de
        // retorno, que é quem sabe dizer que o animal sumiu da lista. Abrir um
        // caso "às cegas" contra um id que não responde seria pior.
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
        // A chave nasce na execução, e não no envelope, pelo mesmo motivo do
        // cadastro de pet: uma chave gravada em disco seria reapresentada por
        // um envelope que o servidor já aceitou, e devolveria um caso antigo
        // como se fosse novo. Com o envelope apagado ao executar, cada
        // envelope produz no máximo uma abertura.
        idempotencyKey: ApiClient.novaChaveDeIdempotencia(),
      );

      return ResultadoDaExecucao(
        rota: Rotas.casoAberto,
        // **F3.3, com o caso ABERTO** — e não a tela de "está na fila". A
        // execução aconteceu de verdade: dizer outra coisa aqui seria o
        // espelho do defeito que o critério 2 da BICHUS-31 proíbe.
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
