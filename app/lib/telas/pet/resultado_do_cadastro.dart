import '../../api/modelos_pet.dart';
import '../../dispositivo/camera_e_galeria.dart';

/// O que F1.5 entrega a F1.6.
class ResultadoDoCadastro {
  const ResultadoDoCadastro({required this.pet, this.fotoPendente});

  final Pet pet;

  /// Nula quando nao ha foto, ou quando ela ja subiu.
  final FotoLocal? fotoPendente;
}
