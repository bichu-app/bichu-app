import 'package:flutter/foundation.dart';

import '../../api/modelos_pet.dart';
import '../../dispositivo/camera_e_galeria.dart';

/// O que os tres passos do cadastro juntam antes de existir um pet.
class RascunhoDePet extends ChangeNotifier {
  RascunhoDePet();

  /// O rascunho que a tela de EDICAO abre (BICHUS-61, criterio 1).
  factory RascunhoDePet.doPet(Pet pet) {
    return RascunhoDePet()
      ..nome = pet.nome
      ..especie = pet.especie
      ..porte = pet.porte
      ..sexo = pet.sexo
      ..breedCode = pet.racaCodigo
      ..breedFreeText = pet.racaTextoLivre ?? ''
      ..refDataVersion = pet.versaoDaReferencia
      ..corPrincipalCodigo = pet.corPrincipalCodigo
      ..segundaCorCodigo = pet.segundaCorCodigo
      ..sinaisParticulares = pet.sinaisParticulares ?? ''
      ..cuidados = pet.cuidados ?? ''
      ..castracao = Castracao.de(pet.castrado)
      ..temChip = (pet.chip ?? '').isNotEmpty
      ..chip = pet.chip ?? ''
      ..rgAnimal = pet.rgAnimal ?? '';
  }

  String nome = '';
  Especie? especie;
  Porte? porte;
  Sexo? sexo;

  /// O codigo da lista fechada.
  String? breedCode;

  /// A raca como a pessoa escreveu.
  String breedFreeText = '';

  /// A versao da lista que o cliente tinha em maos quando a pessoa escolheu.
  String? refDataVersion;

  FotoLocal? foto;

  String? corPrincipalCodigo;
  String? segundaCorCodigo;
  String sinaisParticulares = '';
  String cuidados = '';

  /// `neutered`. Nasce em [Castracao.naoInformou] **de proposito**: e o estado
  /// em que o pet esta antes de alguem responder, e e o que o campo grava
  /// (nulo) quando ninguem mexe nele.
  Castracao castracao = Castracao.naoInformou;

  /// O interruptor "tem chip?". Desligado nao e opiniao sobre o animal: e a
  /// resposta "nao tem numero para eu digitar", e e so por isso que ele pode
  /// nascer desligado sem inventar dado -- quem nao tem chip e quem nao sabe
  /// gravam a mesma coisa, que e nulo.
  bool temChip = false;

  /// O que foi digitado em `microchip_number`. **Preservado quando o
  /// interruptor desliga**, e nao apagado: ver [chipParaEnvio].
  String chip = '';

  /// O que foi digitado em `sinpatinhas_id`, o RG Animal.
  String rgAnimal = '';

  /// Verdadeiro quando a opcao de saida da lista esta escolhida, que e o unico
  /// caso em que o contrato aceita [breedFreeText].
  bool get escolheuOutraRaca =>
      especie != null && breedCode == especie!.codigoDeOutraRaca;

  /// O que de fato vai em `breed_free_text`.
  String? get breedFreeTextParaEnvio {
    if (!escolheuOutraRaca) return null;
    final texto = breedFreeText.trim();
    return texto.isEmpty ? null : texto;
  }

  /// O que de fato vai em `microchip_number`.
  ///
  /// **Nulo com o interruptor desligado, sempre.** A pessoa respondeu que o
  /// animal nao tem chip; mandar numero junto dessa resposta gravaria o
  /// contrario do que ela disse.
  ///
  /// O texto digitado, porem, **fica na tela** em vez de ser apagado no
  /// momento do toque. O que o servidor guarda e identico nos dois desenhos
  /// (nulo), entao apagar nao protege dado nenhum -- so destroi digitacao num
  /// toque errado, sem desfazer, e ainda atrapalha quem desliga e liga de novo
  /// enquanto procura a carteirinha. Depois de salvar, o campo volta vazio na
  /// proxima abertura, porque [RascunhoDePet.doPet] le o nulo do servidor: a
  /// tela nunca mente sobre o que esta guardado, ela so nao joga fora o que
  /// ainda esta sendo digitado.
  String? get chipParaEnvio {
    if (!temChip) return null;
    final texto = chip.trim();
    return texto.isEmpty ? null : texto;
  }

  /// O que de fato vai em `sinpatinhas_id`.
  ///
  /// Campo vazio manda **nulo**, e nao string vazia: o banco recusa texto de
  /// zero caractere (`CHECK ... BETWEEN 1 AND 40`), entao `''` seria um 400
  /// pedido pela tela. Sem validacao de formato, por decisao de 17/09 escrita
  /// na propria migracao.
  String? get rgAnimalParaEnvio {
    final texto = rgAnimal.trim();
    return texto.isEmpty ? null : texto;
  }

  void atualizar(void Function() mudanca) {
    mudanca();
    notifyListeners();
  }

  /// O passo 1 esta completo?
  bool get identificacaoCompleta =>
      nome.trim().isNotEmpty && especie != null && porte != null;
}
