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
      ..cuidados = pet.cuidados ?? '';
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

  void atualizar(void Function() mudanca) {
    mudanca();
    notifyListeners();
  }

  /// O passo 1 esta completo?
  bool get identificacaoCompleta =>
      nome.trim().isNotEmpty && especie != null && porte != null;
}
