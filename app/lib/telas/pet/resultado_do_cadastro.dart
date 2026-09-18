import '../../api/modelos_pet.dart';
import '../../dispositivo/camera_e_galeria.dart';

/// O que F1.5 entrega a F1.6.
///
/// Nao e o rascunho: o rascunho morre quando o pet passa a existir. O que
/// atravessa e o pet criado e a foto que **ainda nao subiu** -- e ela
/// atravessa porque F1.4 prometeu que o envio nao bloqueia o avanco, e a tela
/// seguinte e a dona de dizer que ele esta em curso.
class ResultadoDoCadastro {
  const ResultadoDoCadastro({required this.pet, this.fotoPendente});

  final Pet pet;

  /// Nula quando nao ha foto, ou quando ela ja subiu. Nao nula significa
  /// "esta subindo", e F1.6 mostra a linha discreta que diz isso.
  final FotoLocal? fotoPendente;
}
