/// O que a tela de desfecho de F3.5 recebe, e a distincao que ela carrega.
library;

import '../../api/modelos_achado.dart';
import '../../dispositivo/camera_e_galeria.dart';

class ResultadoDoAchado {
  const ResultadoDoAchado._({required this.achado, required this.foto});

  /// O achado **registrado de verdade**.
  final AchadoRegistrado? achado;

  /// A foto que esta no aparelho, quando ha uma.
  final FotoLocal? foto;

  /// O achado existe no servidor.
  factory ResultadoDoAchado.registrado({
    required AchadoRegistrado achado,
    FotoLocal? foto,
  }) {
    return ResultadoDoAchado._(achado: achado, foto: foto);
  }

  /// O achado esta na fila, e o servidor ainda nao o viu.
  factory ResultadoDoAchado.naFila({FotoLocal? foto}) {
    return ResultadoDoAchado._(achado: null, foto: foto);
  }

  /// Verdadeiro so quando o servidor respondeu.
  bool get foiRegistrado => achado != null;
}
