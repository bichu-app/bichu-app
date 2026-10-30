/// "Eu ia LER isto" como intencao guardada (UX 8.3, estendida em 20/10/2026).
library;

import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de 8.3 desta intencao.
const String telaDeUxDaLeitura = 'LEITURA';

/// O envelope de "eu ia ver [rota]".
IntencaoPendente intencaoDeVerConteudo(String rota, {DateTime? criadaEm}) {
  return IntencaoPendente(
    acao: AcaoDeIntencao.verConteudo,
    alvo: rota,
    telaDeRetorno: telaDeUxDaLeitura,
    criadaEm: criadaEm ?? DateTime.now(),
  );
}

/// O executor registrado em `app.dart`.
AcaoExecutavel leituraExecutavel() {
  return AcaoExecutavel(
    executar: (intencao) async {
      final rota = intencao.alvo;
      if (rota == null || rota.isEmpty) {
        throw const FormatException('envelope de leitura sem alvo');
      }
      return ResultadoDaExecucao(rota: rota);
    },
    retomar: (_, _) => null,
    rotaDeRetorno: (intencao) => intencao.alvo,
  );
}
