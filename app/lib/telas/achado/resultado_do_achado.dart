/// O que a tela de desfecho de F3.5 recebe, e a distincao que ela carrega.
///
/// **Sao dois desfechos e nao um.** O criterio 2 da BICHUS-31 proibe tela de
/// sucesso para o que nao aconteceu: um achado que foi para a fila offline
/// **nao esta registrado**, e dizer que esta faria a pessoa parar de procurar
/// caminho por acreditar que o aviso saiu. Um booleano `sucesso` com um texto
/// ao lado permitiria os dois estados terem o mesmo titulo por descuido; dois
/// construtores nomeados, nao.
library;

import '../../api/modelos_achado.dart';
import '../../dispositivo/camera_e_galeria.dart';

class ResultadoDoAchado {
  const ResultadoDoAchado._({required this.achado, required this.foto});

  /// O achado **registrado de verdade**. Nulo quando ele foi para a fila: nao
  /// ha id, nao ha status e nao ha nada a mostrar sobre um registro que o
  /// servidor ainda nao viu.
  final AchadoRegistrado? achado;

  /// A foto que esta no aparelho, quando ha uma.
  ///
  /// **Ela vem daqui e nunca do servidor.** `FoundReport.photo_url` volta nulo
  /// por criterio (a foto do achador e vista pelo tutor dentro da conversa
  /// mediada, e so), e uma tela que a lesse de la mostraria um campo vazio
  /// para sempre.
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
