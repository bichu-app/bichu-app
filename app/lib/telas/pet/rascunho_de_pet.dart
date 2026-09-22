import 'package:flutter/foundation.dart';

import '../../api/modelos_pet.dart';
import '../../dispositivo/camera_e_galeria.dart';

/// O que os tres passos do cadastro juntam antes de existir um pet.
///
/// **O pet e criado uma vez so, no fim de F1.5**, e nao a cada passo. Dois
/// motivos, e o segundo e o que decide: `POST /v1/pets` exige `name`,
/// `species` e `size`, que so estao completos depois de F1.3; e o teto de
/// cadastro e de 10 pets por conta a cada 24 h, entao um rascunho que virasse
/// pet no primeiro passo gastaria a cota de quem desistiu na foto.
///
/// A foto e a excecao no tempo: ela e escolhida em F1.4, **antes** de o pet
/// existir, e por isso fica guardada aqui e sobe depois da criacao, com o
/// `pet_id` que so entao existe. E o que sustenta a promessa de F1.4 de que o
/// avanco nao fica bloqueado pelo envio.
class RascunhoDePet extends ChangeNotifier {
  RascunhoDePet();

  /// O rascunho que a tela de EDICAO abre (BICHUS-61, criterio 1).
  ///
  /// **Copia o pet INTEIRO, e nao so o que a tela mostra.** `PATCH
  /// /pets/{petId}` recebe um `PetInput` completo e o repositorio grava todas
  /// as colunas a partir dele: campo que nao viaja e gravado como nulo. Um
  /// rascunho que soubesse ler so nome, especie e porte apagaria cor, sexo e
  /// sinais particulares a cada correcao de nome, no servidor, sem erro nenhum
  /// e sem nada no app acusando. **O que este construtor nao copiar, a edicao
  /// apaga.**
  ///
  /// [Pet.versaoDaReferencia] vem junto e volta como veio. Trocar pela versao
  /// corrente responderia "qual e a lista de hoje" a uma pergunta que e "de
  /// qual lista este pet foi escolhido", e reescreveria a procedencia do dado
  /// por causa de uma edicao de nome.
  ///
  /// A foto **nao** entra: [foto] e uma escolha local ainda nao enviada, e o
  /// pet ja tem as dele no servidor. Acrescentar ou trocar foto na edicao
  /// (criterios 4 e 9) e envio proprio, com o `pet_id` que ja existe.
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

  // -- Passo 1, F1.3 --------------------------------------------------------

  String nome = '';
  Especie? especie;
  Porte? porte;
  Sexo? sexo;

  /// O codigo da lista fechada. **E a unica coisa que o cruzamento le.**
  String? breedCode;

  /// A raca como a pessoa escreveu. Aceita, guardada e exibida; **nunca
  /// cruzada**. So vale com [breedCode] na opcao de saida da especie.
  String breedFreeText = '';

  /// A versao da lista que o cliente tinha em maos quando a pessoa escolheu.
  String? refDataVersion;

  // -- Passo 2, F1.4 --------------------------------------------------------

  FotoLocal? foto;

  // -- Passo 3, F1.5 --------------------------------------------------------

  String? corPrincipalCodigo;
  String? segundaCorCodigo;
  String sinaisParticulares = '';
  String cuidados = '';

  /// Verdadeiro quando a opcao de saida da lista esta escolhida, que e o unico
  /// caso em que o contrato aceita [breedFreeText].
  ///
  /// A tela usa isto para **fazer o campo livre existir**, e nao para
  /// validar: a restricao que torna o erro impossivel e o campo nao estar la
  /// (Norman). Deixar o campo visivel o tempo todo e convidar ao erro e depois
  /// explica-lo.
  bool get escolheuOutraRaca =>
      especie != null && breedCode == especie!.codigoDeOutraRaca;

  /// O que de fato vai em `breed_free_text`.
  ///
  /// Vazio quando a raca veio da lista, **mesmo que a pessoa tenha digitado
  /// algo antes de trocar a escolha**: mandar os dois responde
  /// `validation-failed`, e o texto de um momento anterior nao e resposta.
  String? get breedFreeTextParaEnvio {
    if (!escolheuOutraRaca) return null;
    final texto = breedFreeText.trim();
    return texto.isEmpty ? null : texto;
  }

  void atualizar(void Function() mudanca) {
    mudanca();
    notifyListeners();
  }

  /// O passo 1 esta completo? `name`, `species` e `size` sao o que o contrato
  /// exige; raca e sexo sao opcionais **no contrato e na tela**.
  bool get identificacaoCompleta =>
      nome.trim().isNotEmpty && especie != null && porte != null;
}
